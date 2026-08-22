package store

import (
	"context"
	"testing"
)

func TestSearchAndThreadDedupeGmailAllMailCopies(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	a := testAccount(t, s, "acc1")
	inbox := testFolder(t, s, a.ID, "INBOX", RoleInbox)
	allMail := testFolder(t, s, a.ID, "[Gmail]/All Mail", RoleArchive)

	// The same message lands in both folders (distinct rows, same Message-ID).
	for _, folder := range []int64{inbox, allMail} {
		if _, _, err := s.UpsertMessage(ctx, Message{
			AccountID: a.ID, FolderID: folder, UID: 1, MessageID: "<dup@x>",
			Subject: "Quarterly report", From: Address{Email: "ann@x"}, Date: 100,
		}); err != nil {
			t.Fatal(err)
		}
	}

	hits, err := s.Search(ctx, "quarterly", "", 10)
	if err != nil {
		t.Fatalf("search: %v", err)
	}
	if len(hits) != 1 {
		t.Fatalf("all-mail copy doubled search: %d hits", len(hits))
	}

	thread, err := s.GetThread(ctx, a.ID, hits[0].ThreadID)
	if err != nil {
		t.Fatalf("thread: %v", err)
	}
	if len(thread) != 1 {
		t.Fatalf("all-mail copy doubled thread: %d entries", len(thread))
	}
}

func TestReorderAccounts(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	a := testAccount(t, s, "acc-a")
	b := testAccount(t, s, "acc-b")
	c := testAccount(t, s, "acc-c")

	if err := s.ReorderAccounts(ctx, []string{c.ID, a.ID, b.ID}); err != nil {
		t.Fatalf("reorder: %v", err)
	}
	accounts, err := s.ListAccounts(ctx)
	if err != nil {
		t.Fatalf("list: %v", err)
	}
	got := []string{accounts[0].ID, accounts[1].ID, accounts[2].ID}
	if got[0] != c.ID || got[1] != a.ID || got[2] != b.ID {
		t.Fatalf("order not persisted: %v", got)
	}

	// A later addition with a higher sort_order lands at the end.
	d := testAccount(t, s, "acc-d")
	if err := s.UpsertAccount(ctx, func() Account { d.SortOrder = 3; return d }()); err != nil {
		t.Fatal(err)
	}
	accounts, _ = s.ListAccounts(ctx)
	if accounts[3].ID != d.ID {
		t.Fatalf("new account not appended: %+v", accounts)
	}
}

func TestSearchContacts(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	a := testAccount(t, s, "acc1") // acc1@example.com
	inbox := testFolder(t, s, a.ID, "INBOX", RoleInbox)
	sent := testFolder(t, s, a.ID, "Sent", RoleSent)

	// Tammara only ever wrote in once…
	if _, _, err := s.UpsertMessage(ctx, Message{
		AccountID: a.ID, FolderID: inbox, UID: 1, MessageID: "<a@x>",
		Subject: "Hi", From: Address{Name: "Tammara Jam", Email: "tammarajam@gmail.com"},
		To: []Address{{Email: a.Email}}, Date: 100,
	}); err != nil {
		t.Fatal(err)
	}
	// …but the user replied to her (sent-folder weight), and once cc'd Tam Other.
	if _, _, err := s.UpsertMessage(ctx, Message{
		AccountID: a.ID, FolderID: sent, UID: 1, MessageID: "<b@x>",
		Subject: "Re: Hi", From: Address{Email: a.Email},
		To: []Address{{Name: "Tammara Jam", Email: "tammarajam@gmail.com"}},
		Cc: []Address{{Name: "Tam Other", Email: "tam.other@example.com"}},
		Date: 200,
	}); err != nil {
		t.Fatal(err)
	}
	// A frequent sender who was never written back to.
	for uid := uint32(2); uid <= 4; uid++ {
		if _, _, err := s.UpsertMessage(ctx, Message{
			AccountID: a.ID, FolderID: inbox, UID: uid,
			MessageID: "<c@x>", Subject: "News",
			From: Address{Name: "Tam Newsletter", Email: "news@tam.example"},
			Date: 300 + int64(uid),
		}); err != nil {
			t.Fatal(err)
		}
	}

	contacts, err := s.SearchContacts(ctx, "tam", 10)
	if err != nil {
		t.Fatalf("search: %v", err)
	}
	if len(contacts) != 3 {
		t.Fatalf("want 3 contacts, got %+v", contacts)
	}
	// Sent-to beats frequent sender.
	if contacts[0].Email != "tammarajam@gmail.com" || contacts[0].Name != "Tammara Jam" {
		t.Fatalf("ranking wrong, first = %+v", contacts[0])
	}

	// Name-substring matches too.
	byName, err := s.SearchContacts(ctx, "newsletter", 10)
	if err != nil || len(byName) != 1 || byName[0].Email != "news@tam.example" {
		t.Fatalf("name search failed: %+v err=%v", byName, err)
	}

	// The user's own address never shows up.
	own, err := s.SearchContacts(ctx, "acc1", 10)
	if err != nil || len(own) != 0 {
		t.Fatalf("own address suggested: %+v err=%v", own, err)
	}

	// Empty query stays quiet.
	if none, _ := s.SearchContacts(ctx, "", 10); len(none) != 0 {
		t.Fatalf("empty query returned %+v", none)
	}
}
