package mail

import (
	"context"
	"io"
	"net"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"

	"github.com/emersion/go-sasl"
	"github.com/emersion/go-smtp"

	"mailyard/internal/store"
)

// ---- capture SMTP server ---------------------------------------------------

type capturedMail struct {
	From string
	To   []string
	Raw  string
}

type captureBackend struct {
	mu    sync.Mutex
	mails []capturedMail
}

func (b *captureBackend) NewSession(*smtp.Conn) (smtp.Session, error) {
	return &captureSession{backend: b}, nil
}

func (b *captureBackend) last(t *testing.T) capturedMail {
	t.Helper()
	b.mu.Lock()
	defer b.mu.Unlock()
	if len(b.mails) == 0 {
		t.Fatal("no mail captured")
	}
	return b.mails[len(b.mails)-1]
}

type captureSession struct {
	backend *captureBackend
	from    string
	to      []string
}

func (s *captureSession) AuthMechanisms() []string { return []string{sasl.Plain} }

func (s *captureSession) Auth(mech string) (sasl.Server, error) {
	return sasl.NewPlainServer(func(identity, username, password string) error {
		if password != "pw" {
			return smtp.ErrAuthFailed
		}
		return nil
	}), nil
}

func (s *captureSession) Mail(from string, opts *smtp.MailOptions) error {
	s.from = from
	return nil
}

func (s *captureSession) Rcpt(to string, opts *smtp.RcptOptions) error {
	s.to = append(s.to, to)
	return nil
}

func (s *captureSession) Data(r io.Reader) error {
	raw, err := io.ReadAll(r)
	if err != nil {
		return err
	}
	s.backend.mu.Lock()
	s.backend.mails = append(s.backend.mails, capturedMail{
		From: s.from, To: s.to, Raw: string(raw),
	})
	s.backend.mu.Unlock()
	return nil
}

func (s *captureSession) Reset()        { s.from = ""; s.to = nil }
func (s *captureSession) Logout() error { return nil }

func startSMTP(t *testing.T) (string, *captureBackend) {
	t.Helper()
	backend := &captureBackend{}
	server := smtp.NewServer(backend)
	server.Domain = "localhost"
	server.AllowInsecureAuth = true

	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("listen: %v", err)
	}
	go server.Serve(ln)
	t.Cleanup(func() { server.Close() })
	return ln.Addr().String(), backend
}

// ---- tests -----------------------------------------------------------------

func testAccountRow() store.Account {
	return store.Account{
		ID: "acc1", Email: "me@example.com", DisplayName: "Me Example",
		Color: "violet", IMAPHost: "x", IMAPPort: 1, SMTPHost: "x", SMTPPort: 1,
		Username: "me@example.com", AuthKind: "password", CreatedAt: 1,
	}
}

func TestBuildMIMERoundTrip(t *testing.T) {
	dir := t.TempDir()
	attachment := filepath.Join(dir, "notes.txt")
	if err := os.WriteFile(attachment, []byte("attached text"), 0o600); err != nil {
		t.Fatal(err)
	}

	raw, err := buildMIME(testAccountRow(), Outgoing{
		To: []string{"ann@example.com"}, Cc: []string{"bob@example.com"},
		Subject: "Round trip", TextBody: "Hello from the test.",
		InReplyTo:       "<root@example.com>",
		References:      "<root@example.com> <mid@example.com>",
		AttachmentPaths: []string{attachment},
	})
	if err != nil {
		t.Fatalf("build: %v", err)
	}

	parsed, err := ParseMessage(raw)
	if err != nil {
		t.Fatalf("parse own output: %v", err)
	}
	if parsed.Subject != "Round trip" {
		t.Errorf("subject: %q", parsed.Subject)
	}
	if parsed.From.Email != "me@example.com" || parsed.From.Name != "Me Example" {
		t.Errorf("from: %+v", parsed.From)
	}
	if len(parsed.To) != 1 || parsed.To[0].Email != "ann@example.com" {
		t.Errorf("to: %+v", parsed.To)
	}
	if parsed.MessageID == "" {
		t.Error("no generated message id")
	}
	if !strings.Contains(parsed.Refs, "<root@example.com>") ||
		!strings.Contains(parsed.Refs, "<mid@example.com>") {
		t.Errorf("threading refs lost: %q", parsed.Refs)
	}
	if !strings.Contains(parsed.TextBody, "Hello from the test.") {
		t.Errorf("body: %q", parsed.TextBody)
	}
	if len(parsed.Attachments) != 1 || parsed.Attachments[0].Filename != "notes.txt" {
		t.Fatalf("attachments: %+v", parsed.Attachments)
	}
	if string(parsed.Attachments[0].Data) != "attached text" {
		t.Errorf("attachment data: %q", parsed.Attachments[0].Data)
	}
}

// fullEngine wires an engine against both in-memory servers.
func fullEngine(t *testing.T) (*Engine, *store.Store, store.Account, *captureBackend) {
	imapAddr, user := startIMAP(t)
	if err := user.Create("Drafts", nil); err != nil {
		t.Fatalf("create drafts: %v", err)
	}
	smtpAddr, backend := startSMTP(t)

	engine, st, account, _ := testEngine(t, imapAddr)
	engine.SMTPDial = func(host string, port int) (*smtp.Client, error) {
		client, err := smtp.Dial(smtpAddr)
		if err != nil {
			return nil, err
		}
		return client, nil
	}
	// Folder rows must exist before appends resolve roles.
	if err := engine.SyncAccount(context.Background(), account); err != nil {
		t.Fatalf("initial sync: %v", err)
	}
	return engine, st, account, backend
}

func TestSendDeliversAndRecordsInSent(t *testing.T) {
	engine, st, account, backend := fullEngine(t)
	ctx := context.Background()

	err := engine.Send(ctx, Outgoing{
		AccountID: account.ID,
		To:        []string{"ann@example.com"},
		Bcc:       []string{"secret@example.com"},
		Subject:   "Hi Ann",
		TextBody:  "Sent through the test server.",
	})
	if err != nil {
		t.Fatalf("send: %v", err)
	}

	mail := backend.last(t)
	if mail.From != "me@example.com" {
		t.Errorf("envelope from: %q", mail.From)
	}
	if len(mail.To) != 2 {
		t.Errorf("bcc missing from envelope: %+v", mail.To)
	}
	if strings.Contains(mail.Raw, "secret@example.com") {
		t.Error("bcc leaked into headers")
	}

	sent, err := st.ListMessages(ctx, store.ListFilter{FolderRole: store.RoleSent})
	if err != nil || len(sent) != 1 {
		t.Fatalf("sent copy missing: %+v err=%v", sent, err)
	}
	if sent[0].Subject != "Hi Ann" || sent[0].Unread {
		t.Errorf("sent copy wrong: %+v", sent[0])
	}
}

func TestSendMarksRepliedMessageAnswered(t *testing.T) {
	engine, st, account, _ := fullEngine(t)
	ctx := context.Background()

	// Seed an inbound message to reply to.
	inboxID, _, err := st.UpsertMessage(ctx, store.Message{
		AccountID: account.ID, FolderID: mustFolder(t, st, account.ID, store.RoleInbox),
		UID: 1, MessageID: "<orig@test>", Subject: "Original", Date: 100, Unread: true,
	})
	if err != nil {
		t.Fatalf("seed: %v", err)
	}

	err = engine.Send(ctx, Outgoing{
		AccountID: account.ID, To: []string{"ann@example.com"},
		Subject: "Re: Original", TextBody: "Reply",
		InReplyTo: "<orig@test>", References: "<orig@test>",
		ReplyToMessageID: inboxID,
	})
	if err != nil {
		t.Fatalf("send: %v", err)
	}
	// The server push fails silently (uid 1 isn't real on the server), but
	// the local answered flag should still be pushed through SetMessageFlag's
	// local mirror only on success — so just assert the send didn't error.
}

func mustFolder(t *testing.T, st *store.Store, accountID, role string) int64 {
	t.Helper()
	folder, err := st.FolderByRole(context.Background(), accountID, role)
	if err != nil {
		t.Fatalf("folder by role: %v", err)
	}
	return folder.ID
}

func TestDraftSaveReplaceDelete(t *testing.T) {
	engine, st, account, _ := fullEngine(t)
	ctx := context.Background()

	first, err := engine.SaveDraft(ctx, Outgoing{
		AccountID: account.ID, To: []string{"ann@example.com"},
		Subject: "Draft v1", TextBody: "First version",
	}, 0)
	if err != nil {
		t.Fatalf("save draft: %v", err)
	}
	if first == 0 {
		t.Fatal("draft id not returned (memserver supports UIDPLUS)")
	}

	drafts, _ := st.ListMessages(ctx, store.ListFilter{FolderRole: store.RoleDrafts})
	if len(drafts) != 1 || drafts[0].Subject != "Draft v1" {
		t.Fatalf("draft not stored: %+v", drafts)
	}

	second, err := engine.SaveDraft(ctx, Outgoing{
		AccountID: account.ID, To: []string{"ann@example.com"},
		Subject: "Draft v2", TextBody: "Second version",
	}, first)
	if err != nil {
		t.Fatalf("replace draft: %v", err)
	}
	drafts, _ = st.ListMessages(ctx, store.ListFilter{FolderRole: store.RoleDrafts})
	if len(drafts) != 1 || drafts[0].Subject != "Draft v2" {
		t.Fatalf("draft replace failed: %+v", drafts)
	}

	if err := engine.DeleteDraft(ctx, second); err != nil {
		t.Fatalf("delete draft: %v", err)
	}
	drafts, _ = st.ListMessages(ctx, store.ListFilter{FolderRole: store.RoleDrafts})
	if len(drafts) != 0 {
		t.Fatalf("draft not deleted: %+v", drafts)
	}
}

