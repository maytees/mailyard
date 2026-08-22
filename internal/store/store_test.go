package store

import (
	"context"
	"path/filepath"
	"testing"
)

func testStore(t *testing.T) *Store {
	t.Helper()
	path := filepath.Join(t.TempDir(), "test.db")
	s, err := Open(path)
	if err != nil {
		t.Fatalf("open store: %v", err)
	}
	t.Cleanup(func() { s.Close() })
	return s
}

func testAccount(t *testing.T, s *Store, id string) Account {
	t.Helper()
	a := Account{
		ID: id, Email: id + "@example.com", DisplayName: "Test " + id,
		Color: "violet", IMAPHost: "imap.example.com", IMAPPort: 993,
		SMTPHost: "smtp.example.com", SMTPPort: 587,
		Username: id + "@example.com", AuthKind: "password", CreatedAt: 1,
	}
	if err := s.UpsertAccount(context.Background(), a); err != nil {
		t.Fatalf("upsert account: %v", err)
	}
	return a
}

func testFolder(t *testing.T, s *Store, accountID, name, role string) int64 {
	t.Helper()
	id, err := s.UpsertFolder(context.Background(), Folder{
		AccountID: accountID, Name: name, Role: role,
	})
	if err != nil {
		t.Fatalf("upsert folder: %v", err)
	}
	return id
}

func TestMigrateIsIdempotent(t *testing.T) {
	path := filepath.Join(t.TempDir(), "test.db")
	for i := 0; i < 2; i++ {
		s, err := Open(path)
		if err != nil {
			t.Fatalf("open #%d: %v", i+1, err)
		}
		s.Close()
	}
}

func TestAccountCRUD(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	a := testAccount(t, s, "acc1")

	got, err := s.GetAccount(ctx, a.ID)
	if err != nil {
		t.Fatalf("get account: %v", err)
	}
	if got.Email != a.Email || got.IMAPPort != 993 {
		t.Fatalf("got %+v, want %+v", got, a)
	}

	// Upsert with the same id updates in place.
	a.DisplayName = "Renamed"
	if err := s.UpsertAccount(ctx, a); err != nil {
		t.Fatalf("re-upsert: %v", err)
	}
	accounts, err := s.ListAccounts(ctx)
	if err != nil {
		t.Fatalf("list accounts: %v", err)
	}
	if len(accounts) != 1 || accounts[0].DisplayName != "Renamed" {
		t.Fatalf("want 1 renamed account, got %+v", accounts)
	}

	if err := s.DeleteAccount(ctx, a.ID); err != nil {
		t.Fatalf("delete account: %v", err)
	}
	if accounts, _ = s.ListAccounts(ctx); len(accounts) != 0 {
		t.Fatalf("account not deleted: %+v", accounts)
	}
}

func TestFolderUpsertAndRoleLookup(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	a := testAccount(t, s, "acc1")

	first := testFolder(t, s, a.ID, "INBOX", RoleInbox)
	// Same (account, name) must reuse the row, not create a duplicate.
	second, err := s.UpsertFolder(ctx, Folder{
		AccountID: a.ID, Name: "INBOX", Role: RoleInbox, UIDNext: 42,
	})
	if err != nil {
		t.Fatalf("re-upsert folder: %v", err)
	}
	if first != second {
		t.Fatalf("folder duplicated: %d vs %d", first, second)
	}

	trash, err := s.FolderByRole(ctx, a.ID, RoleInbox)
	if err != nil {
		t.Fatalf("folder by role: %v", err)
	}
	if trash.UIDNext != 42 {
		t.Fatalf("uidnext not updated: %+v", trash)
	}
	if _, err := s.FolderByRole(ctx, a.ID, RoleTrash); err == nil {
		t.Fatal("expected error for missing trash folder")
	}
}

func TestMessageUpsertListAndFlags(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	a := testAccount(t, s, "acc1")
	b := testAccount(t, s, "acc2")
	inboxA := testFolder(t, s, a.ID, "INBOX", RoleInbox)
	inboxB := testFolder(t, s, b.ID, "INBOX", RoleInbox)

	id1, err := s.UpsertMessage(ctx, Message{
		AccountID: a.ID, FolderID: inboxA, UID: 1, MessageID: "<m1@x>",
		Subject: "Hello", From: Address{Name: "Ann", Email: "ann@x"},
		To: []Address{{Email: a.Email}}, Date: 100, Unread: true,
	})
	if err != nil {
		t.Fatalf("upsert m1: %v", err)
	}
	if _, err := s.UpsertMessage(ctx, Message{
		AccountID: b.ID, FolderID: inboxB, UID: 1, MessageID: "<m2@x>",
		Subject: "Newer", From: Address{Email: "bob@x"}, Date: 200, Unread: true,
	}); err != nil {
		t.Fatalf("upsert m2: %v", err)
	}

	// Re-upsert of the same (folder, uid) updates flags, not duplicates.
	again, err := s.UpsertMessage(ctx, Message{
		AccountID: a.ID, FolderID: inboxA, UID: 1, MessageID: "<m1@x>",
		Subject: "Hello", Date: 100, Unread: false,
	})
	if err != nil {
		t.Fatalf("re-upsert m1: %v", err)
	}
	if again != id1 {
		t.Fatalf("duplicate message row: %d vs %d", again, id1)
	}

	// Unified list is newest-first across accounts.
	all, err := s.ListMessages(ctx, ListFilter{FolderRole: RoleInbox})
	if err != nil {
		t.Fatalf("list: %v", err)
	}
	if len(all) != 2 || all[0].Subject != "Newer" || all[1].Subject != "Hello" {
		t.Fatalf("unexpected list: %+v", all)
	}
	if all[1].Unread {
		t.Fatal("flag update lost on re-upsert")
	}

	// Account filter narrows.
	onlyA, err := s.ListMessages(ctx, ListFilter{AccountID: a.ID, FolderRole: RoleInbox})
	if err != nil {
		t.Fatalf("list acc1: %v", err)
	}
	if len(onlyA) != 1 || onlyA[0].AccountID != a.ID {
		t.Fatalf("account filter failed: %+v", onlyA)
	}

	counts, err := s.UnreadCounts(ctx)
	if err != nil {
		t.Fatalf("unread counts: %v", err)
	}
	if counts[a.ID] != 0 || counts[b.ID] != 1 {
		t.Fatalf("unexpected counts: %+v", counts)
	}

	if err := s.SetUnread(ctx, []int64{id1}, true); err != nil {
		t.Fatalf("set unread: %v", err)
	}
	if counts, _ = s.UnreadCounts(ctx); counts[a.ID] != 1 {
		t.Fatalf("unread not set: %+v", counts)
	}
}

func TestThreadingResolvesAcrossArrivalOrder(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	a := testAccount(t, s, "acc1")
	inbox := testFolder(t, s, a.ID, "INBOX", RoleInbox)

	// Reply arrives before the message it references.
	if _, err := s.UpsertMessage(ctx, Message{
		AccountID: a.ID, FolderID: inbox, UID: 1, MessageID: "<reply@x>",
		Refs: "<root@x>", Subject: "Re: Topic", Date: 200,
	}); err != nil {
		t.Fatalf("upsert reply: %v", err)
	}
	// Root arrives later and must join the reply's thread.
	if _, err := s.UpsertMessage(ctx, Message{
		AccountID: a.ID, FolderID: inbox, UID: 2, MessageID: "<root@x>",
		Subject: "Topic", Date: 100,
	}); err != nil {
		t.Fatalf("upsert root: %v", err)
	}
	// A later reply referencing both lands in the same thread.
	if _, err := s.UpsertMessage(ctx, Message{
		AccountID: a.ID, FolderID: inbox, UID: 3, MessageID: "<reply2@x>",
		Refs: "<root@x> <reply@x>", Subject: "Re: Topic", Date: 300,
	}); err != nil {
		t.Fatalf("upsert reply2: %v", err)
	}

	first, err := s.GetMessage(ctx, 1)
	if err != nil {
		t.Fatalf("get: %v", err)
	}
	thread, err := s.GetThread(ctx, a.ID, first.ThreadID)
	if err != nil {
		t.Fatalf("get thread: %v", err)
	}
	if len(thread) != 3 {
		t.Fatalf("want one thread of 3, got %d messages", len(thread))
	}
	// Oldest first.
	if thread[0].MessageID != "<root@x>" || thread[2].MessageID != "<reply2@x>" {
		t.Fatalf("thread out of order: %+v", thread)
	}
}

func TestBodiesAndSearch(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	a := testAccount(t, s, "acc1")
	inbox := testFolder(t, s, a.ID, "INBOX", RoleInbox)

	id, err := s.UpsertMessage(ctx, Message{
		AccountID: a.ID, FolderID: inbox, UID: 1, MessageID: "<m1@x>",
		Subject: "Quarterly invoice", From: Address{Name: "Stripe", Email: "billing@stripe.com"},
		Date: 100,
	})
	if err != nil {
		t.Fatalf("upsert: %v", err)
	}

	// Subject and sender are searchable before the body syncs.
	hits, err := s.Search(ctx, "invoi", "", 10)
	if err != nil {
		t.Fatalf("search: %v", err)
	}
	if len(hits) != 1 || hits[0].ID != id {
		t.Fatalf("subject prefix search failed: %+v", hits)
	}

	if err := s.SetMessageBody(ctx, id, "Your payment of $42 is due Friday.", "<p>html</p>"); err != nil {
		t.Fatalf("set body: %v", err)
	}
	body, err := s.GetMessageBody(ctx, id)
	if err != nil || body.TextBody == "" || body.HTMLSanitized == "" {
		t.Fatalf("get body: %+v err=%v", body, err)
	}

	if hits, err = s.Search(ctx, "payment friday", "", 10); err != nil || len(hits) != 1 {
		t.Fatalf("body search failed: %+v err=%v", hits, err)
	}
	// Quotes and FTS syntax must not inject operators.
	if _, err := s.Search(ctx, `"NEAR( OR *`, "", 10); err != nil {
		t.Fatalf("hostile query errored: %v", err)
	}
	if hits, err = s.Search(ctx, "nomatch", "", 10); err != nil || len(hits) != 0 {
		t.Fatalf("want no hits, got %+v err=%v", hits, err)
	}
}

func TestAttachments(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	a := testAccount(t, s, "acc1")
	inbox := testFolder(t, s, a.ID, "INBOX", RoleInbox)
	msgID, err := s.UpsertMessage(ctx, Message{
		AccountID: a.ID, FolderID: inbox, UID: 1, Subject: "With file", Date: 1,
		HasAttachments: true,
	})
	if err != nil {
		t.Fatalf("upsert: %v", err)
	}

	attID, err := s.UpsertAttachment(ctx, Attachment{
		MessageID: msgID, Filename: "report.pdf", MimeType: "application/pdf",
	}, nil)
	if err != nil {
		t.Fatalf("upsert attachment: %v", err)
	}
	data, err := s.AttachmentData(ctx, attID)
	if err != nil || data != nil {
		t.Fatalf("want nil data before download, got %v err=%v", data, err)
	}
	if err := s.SetAttachmentData(ctx, attID, []byte("pdfbytes")); err != nil {
		t.Fatalf("set data: %v", err)
	}
	list, err := s.ListAttachments(ctx, msgID)
	if err != nil || len(list) != 1 || list[0].Size != 8 {
		t.Fatalf("list attachments: %+v err=%v", list, err)
	}
}

func TestDeleteAccountCascades(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	a := testAccount(t, s, "acc1")
	inbox := testFolder(t, s, a.ID, "INBOX", RoleInbox)
	id, err := s.UpsertMessage(ctx, Message{
		AccountID: a.ID, FolderID: inbox, UID: 1, Subject: "Bye", Date: 1,
	})
	if err != nil {
		t.Fatalf("upsert: %v", err)
	}
	if err := s.SetMessageBody(ctx, id, "body", ""); err != nil {
		t.Fatalf("set body: %v", err)
	}

	if err := s.DeleteAccount(ctx, a.ID); err != nil {
		t.Fatalf("delete account: %v", err)
	}
	if msgs, _ := s.ListMessages(ctx, ListFilter{FolderRole: RoleInbox}); len(msgs) != 0 {
		t.Fatalf("messages survived account delete: %+v", msgs)
	}
	// FTS rows must be gone too, or ghosts appear in search.
	if hits, err := s.Search(ctx, "Bye", "", 10); err != nil || len(hits) != 0 {
		t.Fatalf("fts ghost after delete: %+v err=%v", hits, err)
	}
}

func TestSettings(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()

	if v, err := s.SettingGet(ctx, "missing", "fallback"); err != nil || v != "fallback" {
		t.Fatalf("fallback failed: %q err=%v", v, err)
	}
	if err := s.SettingSet(ctx, "k", "v1"); err != nil {
		t.Fatalf("set: %v", err)
	}
	if err := s.SettingSet(ctx, "k", "v2"); err != nil {
		t.Fatalf("overwrite: %v", err)
	}
	if v, _ := s.SettingGet(ctx, "k", ""); v != "v2" {
		t.Fatalf("want v2, got %q", v)
	}
}
