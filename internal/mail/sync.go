package mail

import (
	"context"
	"fmt"
	"log"
	"sort"
	"sync"
	"time"

	"github.com/emersion/go-imap/v2"
	"github.com/emersion/go-imap/v2/imapclient"

	"mailyard/internal/store"
)

// DialFunc opens an IMAP connection. Production uses TLSDialer; tests inject
// an insecure dialer pointed at the in-memory server.
type DialFunc func(host string, port int, options *imapclient.Options) (*imapclient.Client, error)

// TLSDialer is the production DialFunc (implicit TLS).
func TLSDialer(host string, port int, options *imapclient.Options) (*imapclient.Client, error) {
	return imapclient.DialTLS(fmt.Sprintf("%s:%d", host, port), options)
}

const (
	defaultPollInterval   = 5 * time.Minute
	defaultBackfillWindow = 90 * 24 * time.Hour
	defaultBackfillCap    = 500
	fetchChunkSize        = 50
	// RFC 2177 asks clients to re-issue IDLE at least every 29 minutes.
	idleRenewInterval = 20 * time.Minute
	reconnectBackoff  = 30 * time.Second
)

// Engine keeps local mail in sync with every account's IMAP server: a full
// incremental pass per poll tick, plus IDLE on each inbox for push. It only
// ever runs after the app window is revealed.
type Engine struct {
	Store    *store.Store
	Events   Emitter
	Password func(accountID string) (string, error)
	Dial     DialFunc

	PollInterval   time.Duration
	BackfillWindow time.Duration
	BackfillCap    int

	mu      sync.Mutex
	workers map[string]context.CancelFunc
	syncMu  sync.Mutex // one full sync pass at a time per engine
}

func (e *Engine) events() Emitter {
	if e.Events == nil {
		return nopEmitter{}
	}
	return e.Events
}

func (e *Engine) dial(host string, port int, options *imapclient.Options) (*imapclient.Client, error) {
	if e.Dial != nil {
		return e.Dial(host, port, options)
	}
	return TLSDialer(host, port, options)
}

func (e *Engine) pollInterval() time.Duration {
	if e.PollInterval > 0 {
		return e.PollInterval
	}
	return defaultPollInterval
}

// Start brings up one worker per account and keeps the worker set in step
// with the account list (call Reconcile after accounts change).
func (e *Engine) Start(ctx context.Context) {
	e.mu.Lock()
	if e.workers == nil {
		e.workers = map[string]context.CancelFunc{}
	}
	e.mu.Unlock()
	e.Reconcile(ctx)
}

// Reconcile spawns workers for new accounts and stops workers for removed
// ones.
func (e *Engine) Reconcile(ctx context.Context) {
	accounts, err := e.Store.ListAccounts(ctx)
	if err != nil {
		log.Printf("sync: list accounts: %v", err)
		return
	}

	e.mu.Lock()
	defer e.mu.Unlock()
	if e.workers == nil {
		e.workers = map[string]context.CancelFunc{}
	}

	current := map[string]bool{}
	for _, account := range accounts {
		current[account.ID] = true
		if _, running := e.workers[account.ID]; !running {
			workerCtx, cancel := context.WithCancel(ctx)
			e.workers[account.ID] = cancel
			go e.runWorker(workerCtx, account.ID)
		}
	}
	for id, cancel := range e.workers {
		if !current[id] {
			cancel()
			delete(e.workers, id)
		}
	}
}

// runWorker owns one account: an immediate sync, then re-syncs on every poll
// tick and every IDLE kick.
func (e *Engine) runWorker(ctx context.Context, accountID string) {
	kick := make(chan struct{}, 1)
	go e.idleLoop(ctx, accountID, kick)

	ticker := time.NewTicker(e.pollInterval())
	defer ticker.Stop()

	for {
		account, err := e.Store.GetAccount(ctx, accountID)
		if err != nil {
			return // account removed
		}
		if err := e.SyncAccount(ctx, account); err != nil && ctx.Err() == nil {
			log.Printf("sync %s: %v", account.Email, err)
		}
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
		case <-kick:
		}
	}
}

// idleLoop holds an IDLE connection on the account's inbox and kicks the
// worker whenever the server reports changes. Reconnects with backoff; exits
// quietly if the server doesn't support IDLE (polling still covers us).
func (e *Engine) idleLoop(ctx context.Context, accountID string, kick chan<- struct{}) {
	notify := func() {
		select {
		case kick <- struct{}{}:
		default:
		}
	}

	for ctx.Err() == nil {
		err := e.idleOnce(ctx, accountID, notify)
		if err == errIdleUnsupported {
			return
		}
		if ctx.Err() != nil {
			return
		}
		select {
		case <-ctx.Done():
			return
		case <-time.After(reconnectBackoff):
		}
	}
}

var errIdleUnsupported = fmt.Errorf("server does not support IDLE")

func (e *Engine) idleOnce(ctx context.Context, accountID string, notify func()) error {
	account, err := e.Store.GetAccount(ctx, accountID)
	if err != nil {
		return err
	}
	password, err := e.Password(account.ID)
	if err != nil {
		return err
	}

	options := &imapclient.Options{
		UnilateralDataHandler: &imapclient.UnilateralDataHandler{
			Mailbox: func(*imapclient.UnilateralDataMailbox) { notify() },
			Expunge: func(uint32) { notify() },
		},
	}
	client, err := e.dial(account.IMAPHost, account.IMAPPort, options)
	if err != nil {
		return err
	}
	defer client.Close()

	if err := client.Login(account.Username, password).Wait(); err != nil {
		return err
	}
	if !client.Caps().Has(imap.CapIdle) {
		return errIdleUnsupported
	}
	if _, err := client.Select("INBOX", &imap.SelectOptions{ReadOnly: true}).Wait(); err != nil {
		return err
	}

	// Stop idling when the sync context ends, and renew within the RFC 2177
	// window so the server doesn't drop us.
	for ctx.Err() == nil {
		idle, err := client.Idle()
		if err != nil {
			return err
		}
		select {
		case <-ctx.Done():
			idle.Close()
			return idle.Wait()
		case <-time.After(idleRenewInterval):
			if err := idle.Close(); err != nil {
				return err
			}
			if err := idle.Wait(); err != nil {
				return err
			}
		}
	}
	return nil
}

// SyncAll runs one incremental pass over every account (the "Sync now"
// command).
func (e *Engine) SyncAll(ctx context.Context) error {
	accounts, err := e.Store.ListAccounts(ctx)
	if err != nil {
		return err
	}
	var firstErr error
	for _, account := range accounts {
		if err := e.SyncAccount(ctx, account); err != nil && firstErr == nil {
			firstErr = err
		}
	}
	return firstErr
}

// SyncAccount performs one full incremental pass for an account: folder
// discovery, new-message fetch, and flag/deletion reconciliation.
func (e *Engine) SyncAccount(ctx context.Context, account store.Account) error {
	e.syncMu.Lock()
	defer e.syncMu.Unlock()

	events := e.events()
	events.Emit("sync:status", SyncStatus{AccountID: account.ID, State: "syncing"})
	err := e.syncAccount(ctx, account)
	if err != nil {
		events.Emit("sync:status", SyncStatus{
			AccountID: account.ID, State: "error", Error: err.Error(),
		})
		return err
	}
	events.Emit("sync:status", SyncStatus{AccountID: account.ID, State: "idle"})
	return nil
}

func (e *Engine) syncAccount(ctx context.Context, account store.Account) error {
	password, err := e.Password(account.ID)
	if err != nil {
		return err
	}
	client, err := e.dial(account.IMAPHost, account.IMAPPort, nil)
	if err != nil {
		return fmt.Errorf("connect: %w", err)
	}
	defer client.Close()
	if err := client.Login(account.Username, password).Wait(); err != nil {
		return fmt.Errorf("login: %w", err)
	}

	listed, err := client.List("", "*", nil).Collect()
	if err != nil {
		return fmt.Errorf("list folders: %w", err)
	}

	known, err := e.Store.ListFolders(ctx, account.ID)
	if err != nil {
		return err
	}
	knownByName := map[string]store.Folder{}
	for _, folder := range known {
		knownByName[folder.Name] = folder
	}

	for _, data := range listed {
		if ctx.Err() != nil {
			return ctx.Err()
		}
		if hasAttr(data.Attrs, imap.MailboxAttrNoSelect) {
			continue
		}
		folder := knownByName[data.Mailbox]
		folder.AccountID = account.ID
		folder.Name = data.Mailbox
		folder.Role = folderRole(data.Mailbox, data.Attrs)
		if err := e.syncFolder(ctx, client, account, &folder); err != nil {
			return fmt.Errorf("folder %s: %w", data.Mailbox, err)
		}
	}
	return nil
}

func (e *Engine) syncFolder(ctx context.Context, client *imapclient.Client, account store.Account, folder *store.Folder) error {
	sel, err := client.Select(folder.Name, &imap.SelectOptions{ReadOnly: true}).Wait()
	if err != nil {
		return err
	}

	// Persist the folder row first so it has an id even when empty.
	folderID, err := e.Store.UpsertFolder(ctx, *folder)
	if err != nil {
		return err
	}
	folder.ID = folderID

	changed := false

	// UIDVALIDITY change invalidates every stored UID: start over.
	if folder.UIDValidity != 0 && folder.UIDValidity != sel.UIDValidity {
		if err := e.Store.DeleteFolderMessages(ctx, folder.ID); err != nil {
			return err
		}
		folder.UIDNext = 0
		changed = true
	}

	newUIDs, err := e.findNewUIDs(client, folder, sel)
	if err != nil {
		return err
	}
	if len(newUIDs) > 0 {
		if err := e.fetchMessages(ctx, client, account, folder, newUIDs); err != nil {
			return err
		}
		changed = true
	}

	reconciled, err := e.reconcileFlags(ctx, client, folder)
	if err != nil {
		return err
	}
	changed = changed || reconciled

	folder.UIDValidity = sel.UIDValidity
	folder.UIDNext = uint32(sel.UIDNext)
	folder.LastSyncedAt = time.Now().Unix()
	if _, err := e.Store.UpsertFolder(ctx, *folder); err != nil {
		return err
	}

	if changed {
		e.events().Emit("mail:changed", MailChanged{
			AccountID: account.ID, FolderRole: folder.Role,
		})
	}
	return nil
}

// findNewUIDs decides what to fetch: a capped time-window backfill on first
// sync, everything since the stored UIDNEXT afterwards.
func (e *Engine) findNewUIDs(client *imapclient.Client, folder *store.Folder, sel *imap.SelectData) ([]imap.UID, error) {
	if sel.NumMessages == 0 {
		return nil, nil
	}

	if folder.UIDNext == 0 {
		window := e.BackfillWindow
		if window <= 0 {
			window = defaultBackfillWindow
		}
		data, err := client.UIDSearch(&imap.SearchCriteria{
			Since: time.Now().Add(-window),
		}, nil).Wait()
		if err != nil {
			return nil, fmt.Errorf("backfill search: %w", err)
		}
		uids := data.AllUIDs()
		limit := e.BackfillCap
		if limit <= 0 {
			limit = defaultBackfillCap
		}
		if len(uids) > limit {
			// Keep the newest N.
			sort.Slice(uids, func(i, j int) bool { return uids[i] < uids[j] })
			uids = uids[len(uids)-limit:]
		}
		return uids, nil
	}

	if uint32(sel.UIDNext) <= folder.UIDNext {
		return nil, nil
	}
	data, err := client.UIDSearch(&imap.SearchCriteria{
		UID: []imap.UIDSet{{imap.UIDRange{Start: imap.UID(folder.UIDNext), Stop: 0}}},
	}, nil).Wait()
	if err != nil {
		return nil, fmt.Errorf("incremental search: %w", err)
	}
	return data.AllUIDs(), nil
}

// fetchMessages pulls full raw messages in chunks, parses them, and stores
// message + body + attachments.
func (e *Engine) fetchMessages(ctx context.Context, client *imapclient.Client, account store.Account, folder *store.Folder, uids []imap.UID) error {
	section := &imap.FetchItemBodySection{Peek: true}
	options := &imap.FetchOptions{
		UID:          true,
		Flags:        true,
		InternalDate: true,
		RFC822Size:   true,
		BodySection:  []*imap.FetchItemBodySection{section},
	}

	for start := 0; start < len(uids); start += fetchChunkSize {
		if ctx.Err() != nil {
			return ctx.Err()
		}
		end := min(start+fetchChunkSize, len(uids))
		chunk := imap.UIDSetNum(uids[start:end]...)

		buffers, err := client.Fetch(chunk, options).Collect()
		if err != nil {
			return fmt.Errorf("fetch: %w", err)
		}
		for _, buf := range buffers {
			if err := e.storeMessage(ctx, account, folder, buf, section); err != nil {
				return err
			}
		}
	}
	return nil
}

func (e *Engine) storeMessage(ctx context.Context, account store.Account, folder *store.Folder, buf *imapclient.FetchMessageBuffer, section *imap.FetchItemBodySection) error {
	raw := buf.FindBodySection(section)

	message := store.Message{
		AccountID: account.ID,
		FolderID:  folder.ID,
		UID:       uint32(buf.UID),
		Date:      buf.InternalDate.Unix(),
		Size:      buf.RFC822Size,
		Unread:    !hasFlag(buf.Flags, imap.FlagSeen),
		Starred:   hasFlag(buf.Flags, imap.FlagFlagged),
		Answered:  hasFlag(buf.Flags, imap.FlagAnswered),
	}

	parsed, err := ParseMessage(raw)
	if err != nil {
		// Store a stub rather than dropping the message entirely.
		log.Printf("sync: parse uid %d in %s: %v", buf.UID, folder.Name, err)
		message.Subject = "(unreadable message)"
	} else {
		message.MessageID = parsed.MessageID
		message.Refs = parsed.Refs
		message.Subject = parsed.Subject
		message.From = parsed.From
		message.To = parsed.To
		message.Cc = parsed.Cc
		message.Snippet = parsed.Snippet
		message.HasAttachments = len(parsed.Attachments) > 0
		if !parsed.Date.IsZero() {
			message.Date = parsed.Date.Unix()
		}
	}

	id, inserted, err := e.Store.UpsertMessage(ctx, message)
	if err != nil {
		return err
	}
	if !inserted || parsed == nil {
		return nil
	}

	if err := e.Store.SetMessageBody(ctx, id, parsed.TextBody, parsed.HTMLSanitized); err != nil {
		return err
	}
	for _, attachment := range parsed.Attachments {
		if _, err := e.Store.UpsertAttachment(ctx, store.Attachment{
			MessageID: id,
			Filename:  attachment.Filename,
			MimeType:  attachment.MimeType,
			Size:      int64(len(attachment.Data)),
			ContentID: attachment.ContentID,
		}, attachment.Data); err != nil {
			return err
		}
	}
	return nil
}

// reconcileFlags mirrors server-side flag changes and expunges onto local
// rows. Returns whether anything changed.
func (e *Engine) reconcileFlags(ctx context.Context, client *imapclient.Client, folder *store.Folder) (bool, error) {
	local, err := e.Store.FolderUIDFlags(ctx, folder.ID)
	if err != nil || len(local) == 0 {
		return false, err
	}

	minUID := uint32(0)
	for uid := range local {
		if minUID == 0 || uid < minUID {
			minUID = uid
		}
	}

	set := imap.UIDSet{imap.UIDRange{Start: imap.UID(minUID), Stop: 0}}
	buffers, err := client.Fetch(set, &imap.FetchOptions{UID: true, Flags: true}).Collect()
	if err != nil {
		return false, fmt.Errorf("flags fetch: %w", err)
	}

	changed := false
	remote := map[uint32][]imap.Flag{}
	for _, buf := range buffers {
		remote[uint32(buf.UID)] = buf.Flags
	}

	for uid, state := range local {
		flags, exists := remote[uid]
		if !exists {
			// Gone on the server (moved or deleted elsewhere).
			if err := e.Store.DeleteMessage(ctx, state.ID); err != nil {
				return changed, err
			}
			changed = true
			continue
		}
		if unread := !hasFlag(flags, imap.FlagSeen); unread != state.Unread {
			if err := e.Store.SetUnread(ctx, []int64{state.ID}, unread); err != nil {
				return changed, err
			}
			changed = true
		}
		if starred := hasFlag(flags, imap.FlagFlagged); starred != state.Starred {
			if err := e.Store.SetStarred(ctx, []int64{state.ID}, starred); err != nil {
				return changed, err
			}
			changed = true
		}
		if answered := hasFlag(flags, imap.FlagAnswered); answered != state.Answered {
			if err := e.Store.SetAnswered(ctx, []int64{state.ID}, answered); err != nil {
				return changed, err
			}
			changed = true
		}
	}
	return changed, nil
}

func hasFlag(flags []imap.Flag, want imap.Flag) bool {
	for _, flag := range flags {
		if flag == want {
			return true
		}
	}
	return false
}

func hasAttr(attrs []imap.MailboxAttr, want imap.MailboxAttr) bool {
	for _, attr := range attrs {
		if attr == want {
			return true
		}
	}
	return false
}
