package mail

import (
	"bytes"
	"context"
	"net"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/emersion/go-imap/v2"
	"github.com/emersion/go-imap/v2/imapclient"
	"github.com/emersion/go-imap/v2/imapserver"
	"github.com/emersion/go-imap/v2/imapserver/imapmemserver"

	"mailyard/internal/store"
)

type literal struct{ *bytes.Reader }

func (l literal) Size() int64 { return int64(l.Reader.Len()) }

func newLiteral(raw string) imap.LiteralReader {
	return literal{bytes.NewReader([]byte(raw))}
}

type eventRecorder struct {
	mu     sync.Mutex
	events []string
}

func (r *eventRecorder) Emit(name string, data any) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.events = append(r.events, name)
}

func (r *eventRecorder) count(name string) int {
	r.mu.Lock()
	defer r.mu.Unlock()
	n := 0
	for _, event := range r.events {
		if event == name {
			n++
		}
	}
	return n
}

func rawMessage(id, subject, body string, refs ...string) string {
	var b strings.Builder
	b.WriteString("Message-ID: <" + id + ">\r\n")
	if len(refs) > 0 {
		b.WriteString("References: <" + strings.Join(refs, "> <") + ">\r\n")
	}
	b.WriteString("From: Ann <ann@example.com>\r\n")
	b.WriteString("To: me@example.com\r\n")
	b.WriteString("Subject: " + subject + "\r\n")
	b.WriteString("Date: Mon, 10 Aug 2026 12:30:00 +0000\r\n")
	b.WriteString("Content-Type: text/plain; charset=utf-8\r\n\r\n")
	b.WriteString(body + "\r\n")
	return b.String()
}

// startIMAP runs an in-memory IMAP server and returns its address plus the
// user handle for server-side mutations.
func startIMAP(t *testing.T) (string, *imapmemserver.User) {
	t.Helper()

	user := imapmemserver.NewUser("me@example.com", "pw")
	for _, name := range []string{"INBOX", "Sent Items"} {
		if err := user.Create(name, nil); err != nil {
			t.Fatalf("create %s: %v", name, err)
		}
	}
	memServer := imapmemserver.New()
	memServer.AddUser(user)

	server := imapserver.New(&imapserver.Options{
		NewSession: func(*imapserver.Conn) (imapserver.Session, *imapserver.GreetingData, error) {
			return memServer.NewSession(), nil, nil
		},
		InsecureAuth: true,
	})
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("listen: %v", err)
	}
	go server.Serve(ln)
	t.Cleanup(func() { server.Close() })

	return ln.Addr().String(), user
}

func testEngine(t *testing.T, addr string) (*Engine, *store.Store, store.Account, *eventRecorder) {
	t.Helper()

	st, err := store.Open(filepath.Join(t.TempDir(), "test.db"))
	if err != nil {
		t.Fatalf("open store: %v", err)
	}
	t.Cleanup(func() { st.Close() })

	host, portStr, _ := net.SplitHostPort(addr)
	port := 0
	for _, c := range portStr {
		port = port*10 + int(c-'0')
	}
	account := store.Account{
		ID: "acc1", Email: "me@example.com", DisplayName: "Me", Color: "violet",
		IMAPHost: host, IMAPPort: port, SMTPHost: host, SMTPPort: 587,
		Username: "me@example.com", AuthKind: "password", CreatedAt: 1,
	}
	if err := st.UpsertAccount(context.Background(), account); err != nil {
		t.Fatalf("upsert account: %v", err)
	}

	recorder := &eventRecorder{}
	engine := &Engine{
		Store:    st,
		Events:   recorder,
		Password: func(string) (string, error) { return "pw", nil },
		Dial: func(host string, port int, options *imapclient.Options) (*imapclient.Client, error) {
			return imapclient.DialInsecure(addr, options)
		},
	}
	return engine, st, account, recorder
}

func TestSyncAccountBackfillsAndMapsRoles(t *testing.T) {
	addr, user := startIMAP(t)
	engine, st, account, recorder := testEngine(t, addr)
	ctx := context.Background()

	appendMsg := func(folder, raw string, flags ...imap.Flag) {
		t.Helper()
		if _, err := user.Append(folder, newLiteral(raw),
			&imap.AppendOptions{Time: time.Now(), Flags: flags}); err != nil {
			t.Fatalf("append: %v", err)
		}
	}
	appendMsg("INBOX", rawMessage("m1@test", "First", "Hello there"))
	appendMsg("INBOX", rawMessage("m2@test", "Re: First", "A reply", "m1@test"), imap.FlagSeen)
	appendMsg("Sent Items", rawMessage("s1@test", "My sent", "Sent body"))

	if err := engine.SyncAccount(ctx, account); err != nil {
		t.Fatalf("sync: %v", err)
	}

	inbox, err := st.ListMessages(ctx, store.ListFilter{FolderRole: store.RoleInbox})
	if err != nil {
		t.Fatalf("list inbox: %v", err)
	}
	if len(inbox) != 2 {
		t.Fatalf("want 2 inbox messages, got %d", len(inbox))
	}
	sent, err := st.ListMessages(ctx, store.ListFilter{FolderRole: store.RoleSent})
	if err != nil || len(sent) != 1 {
		t.Fatalf("sent role not mapped: %+v err=%v", sent, err)
	}

	// Parsed content made it into the store.
	var first, reply store.Message
	for _, m := range inbox {
		switch m.Subject {
		case "First":
			first = m
		case "Re: First":
			reply = m
		}
	}
	if first.ID == 0 || reply.ID == 0 {
		t.Fatalf("subjects missing: %+v", inbox)
	}
	if !first.Unread || reply.Unread {
		t.Errorf("flags wrong: first.Unread=%v reply.Unread=%v", first.Unread, reply.Unread)
	}
	if first.ThreadID != reply.ThreadID {
		t.Errorf("reply not threaded with root")
	}
	body, err := st.GetMessageBody(ctx, first.ID)
	if err != nil || !strings.Contains(body.TextBody, "Hello there") {
		t.Errorf("body not stored: %+v err=%v", body, err)
	}

	if recorder.count("mail:changed") == 0 {
		t.Error("no mail:changed emitted")
	}
	if recorder.count("sync:status") < 2 {
		t.Error("sync:status not emitted around the pass")
	}

	// Second pass with no server changes must not duplicate anything.
	if err := engine.SyncAccount(ctx, account); err != nil {
		t.Fatalf("re-sync: %v", err)
	}
	inbox, _ = st.ListMessages(ctx, store.ListFilter{FolderRole: store.RoleInbox})
	if len(inbox) != 2 {
		t.Fatalf("re-sync duplicated messages: %d", len(inbox))
	}
}

func TestSyncIncrementalFlagsAndDeletes(t *testing.T) {
	addr, user := startIMAP(t)
	engine, st, account, _ := testEngine(t, addr)
	ctx := context.Background()

	if _, err := user.Append("INBOX", newLiteral(rawMessage("m1@test", "One", "Body one")),
		&imap.AppendOptions{Time: time.Now()}); err != nil {
		t.Fatalf("append: %v", err)
	}
	if err := engine.SyncAccount(ctx, account); err != nil {
		t.Fatalf("initial sync: %v", err)
	}

	// New message appended after the first sync arrives incrementally.
	if _, err := user.Append("INBOX", newLiteral(rawMessage("m2@test", "Two", "Body two")),
		&imap.AppendOptions{Time: time.Now()}); err != nil {
		t.Fatalf("append 2: %v", err)
	}
	if err := engine.SyncAccount(ctx, account); err != nil {
		t.Fatalf("incremental sync: %v", err)
	}
	inbox, _ := st.ListMessages(ctx, store.ListFilter{FolderRole: store.RoleInbox})
	if len(inbox) != 2 {
		t.Fatalf("incremental fetch failed: %d messages", len(inbox))
	}

	// Server-side flag change + delete, applied through a real client session.
	client, err := imapclient.DialInsecure(addr, nil)
	if err != nil {
		t.Fatalf("dial: %v", err)
	}
	defer client.Close()
	if err := client.Login("me@example.com", "pw").Wait(); err != nil {
		t.Fatalf("login: %v", err)
	}
	if _, err := client.Select("INBOX", nil).Wait(); err != nil {
		t.Fatalf("select: %v", err)
	}
	// Mark UID 1 read, delete+expunge UID 2.
	uid1 := imap.UIDSetNum(1)
	if err := client.Store(uid1, &imap.StoreFlags{
		Op: imap.StoreFlagsAdd, Flags: []imap.Flag{imap.FlagSeen}, Silent: true,
	}, nil).Close(); err != nil {
		t.Fatalf("store flags: %v", err)
	}
	uid2 := imap.UIDSetNum(2)
	if err := client.Store(uid2, &imap.StoreFlags{
		Op: imap.StoreFlagsAdd, Flags: []imap.Flag{imap.FlagDeleted}, Silent: true,
	}, nil).Close(); err != nil {
		t.Fatalf("store deleted: %v", err)
	}
	if err := client.Expunge().Close(); err != nil {
		t.Fatalf("expunge: %v", err)
	}

	if err := engine.SyncAccount(ctx, account); err != nil {
		t.Fatalf("reconcile sync: %v", err)
	}
	inbox, _ = st.ListMessages(ctx, store.ListFilter{FolderRole: store.RoleInbox})
	if len(inbox) != 1 {
		t.Fatalf("expunged message not removed locally: %+v", inbox)
	}
	if inbox[0].Subject != "One" || inbox[0].Unread {
		t.Fatalf("flag change not reconciled: %+v", inbox[0])
	}
}
