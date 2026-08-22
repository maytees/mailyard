package store

import (
	"context"
	"testing"
)

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
