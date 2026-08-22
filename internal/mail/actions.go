package mail

import (
	"context"
	"fmt"

	"github.com/emersion/go-imap/v2"
	"github.com/emersion/go-imap/v2/imapclient"
)

// actionConn is a cached, logged-in connection per account so user actions
// (mark read, star, move…) don't pay a fresh dial + login every time.
type actionConn struct {
	client   *imapclient.Client
	selected string // currently selected mailbox
}

func (e *Engine) actionConn(ctx context.Context, accountID string) (*actionConn, error) {
	e.mu.Lock()
	if e.conns == nil {
		e.conns = map[string]*actionConn{}
	}
	conn := e.conns[accountID]
	e.mu.Unlock()

	if conn != nil {
		// A NOOP doubles as a liveness probe.
		if err := conn.client.Noop().Wait(); err == nil {
			return conn, nil
		}
		conn.client.Close()
		e.dropConn(accountID)
	}

	account, err := e.Store.GetAccount(ctx, accountID)
	if err != nil {
		return nil, err
	}
	password, err := e.Password(accountID)
	if err != nil {
		return nil, err
	}
	client, err := e.dial(account.IMAPHost, account.IMAPPort, nil)
	if err != nil {
		return nil, fmt.Errorf("connect: %w", err)
	}
	if err := client.Login(account.Username, password).Wait(); err != nil {
		client.Close()
		return nil, fmt.Errorf("login: %w", err)
	}

	conn = &actionConn{client: client}
	e.mu.Lock()
	e.conns[accountID] = conn
	e.mu.Unlock()
	return conn, nil
}

func (e *Engine) dropConn(accountID string) {
	e.mu.Lock()
	delete(e.conns, accountID)
	e.mu.Unlock()
}

func (conn *actionConn) selectMailbox(name string) error {
	if conn.selected == name {
		return nil
	}
	if _, err := conn.client.Select(name, nil).Wait(); err != nil {
		return err
	}
	conn.selected = name
	return nil
}

// SetMessageFlag flips one flag on the server and mirrors it locally.
func (e *Engine) SetMessageFlag(ctx context.Context, messageID int64, flag imap.Flag, set bool) error {
	message, err := e.Store.GetMessage(ctx, messageID)
	if err != nil {
		return err
	}
	folder, err := e.Store.GetFolder(ctx, message.FolderID)
	if err != nil {
		return err
	}
	conn, err := e.actionConn(ctx, message.AccountID)
	if err != nil {
		return err
	}
	if err := conn.selectMailbox(folder.Name); err != nil {
		e.dropConn(message.AccountID)
		return err
	}

	op := imap.StoreFlagsDel
	if set {
		op = imap.StoreFlagsAdd
	}
	err = conn.client.Store(imap.UIDSetNum(imap.UID(message.UID)), &imap.StoreFlags{
		Op: op, Flags: []imap.Flag{flag}, Silent: true,
	}, nil).Close()
	if err != nil {
		e.dropConn(message.AccountID)
		return fmt.Errorf("store flags: %w", err)
	}

	switch flag {
	case imap.FlagSeen:
		return e.Store.SetUnread(ctx, []int64{messageID}, !set)
	case imap.FlagFlagged:
		return e.Store.SetStarred(ctx, []int64{messageID}, set)
	case imap.FlagAnswered:
		return e.Store.SetAnswered(ctx, []int64{messageID}, set)
	}
	return nil
}

// MoveMessageToRole moves a message into the account folder holding the given
// role (archive, trash, …) on the server, then mirrors the move locally.
func (e *Engine) MoveMessageToRole(ctx context.Context, messageID int64, role string) error {
	message, err := e.Store.GetMessage(ctx, messageID)
	if err != nil {
		return err
	}
	source, err := e.Store.GetFolder(ctx, message.FolderID)
	if err != nil {
		return err
	}
	target, err := e.Store.FolderByRole(ctx, message.AccountID, role)
	if err != nil {
		return err
	}
	if target.ID == source.ID {
		return nil
	}

	conn, err := e.actionConn(ctx, message.AccountID)
	if err != nil {
		return err
	}
	if err := conn.selectMailbox(source.Name); err != nil {
		e.dropConn(message.AccountID)
		return err
	}
	if _, err := conn.client.Move(imap.UIDSetNum(imap.UID(message.UID)), target.Name).Wait(); err != nil {
		e.dropConn(message.AccountID)
		return fmt.Errorf("move to %s: %w", target.Name, err)
	}

	// The server assigned a new UID we don't know; drop the local row and let
	// the target folder's next sync pick the message up there.
	if err := e.Store.DeleteMessage(ctx, messageID); err != nil {
		return err
	}
	e.events().Emit("mail:changed", MailChanged{AccountID: message.AccountID, FolderRole: source.Role})
	e.events().Emit("mail:changed", MailChanged{AccountID: message.AccountID, FolderRole: target.Role})
	return nil
}
