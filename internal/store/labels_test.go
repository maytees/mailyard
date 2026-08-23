package store

import (
	"context"
	"testing"
)

func TestLabelsSeededAndOrdered(t *testing.T) {
	s := testStore(t)
	labels, err := s.ListLabels(context.Background())
	if err != nil {
		t.Fatalf("list: %v", err)
	}
	if len(labels) != 5 {
		t.Fatalf("want 5 seeded labels, got %d", len(labels))
	}
	if labels[0].Name != "Primary" || labels[4].Name != "Other" {
		t.Fatalf("seed order wrong: %+v", labels)
	}
	if !labels[4].Builtin || labels[4].ID != OtherLabelID {
		t.Fatalf("Other not builtin id %d: %+v", OtherLabelID, labels[4])
	}
}

func TestCreateLabelKeepsOtherLast(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()

	created, err := s.CreateLabel(ctx, Label{Name: "Receipts", CreatedBy: "ai"})
	if err != nil {
		t.Fatalf("create: %v", err)
	}
	// Case-insensitive get-or-create: no duplicate.
	again, err := s.CreateLabel(ctx, Label{Name: "receipts"})
	if err != nil || again.ID != created.ID {
		t.Fatalf("dedupe failed: %+v err=%v", again, err)
	}

	labels, _ := s.ListLabels(ctx)
	if len(labels) != 6 {
		t.Fatalf("want 6 labels, got %d", len(labels))
	}
	if labels[len(labels)-1].ID != OtherLabelID {
		t.Fatalf("Other no longer last: %+v", labels)
	}
	if labels[len(labels)-2].Name != "Receipts" {
		t.Fatalf("new label not before Other: %+v", labels)
	}
}

func TestDeleteLabelReassignsToOther(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	a := testAccount(t, s, "acc1")
	inbox := testFolder(t, s, a.ID, "INBOX", RoleInbox)
	id, _, err := s.UpsertMessage(ctx, Message{
		AccountID: a.ID, FolderID: inbox, UID: 1, MessageID: "<m@x>",
		Subject: "Sale!", From: Address{Email: "shop@x"}, Date: 100,
	})
	if err != nil {
		t.Fatal(err)
	}

	created, err := s.CreateLabel(ctx, Label{Name: "Deals"})
	if err != nil {
		t.Fatal(err)
	}
	if err := s.SetMessageLabel(ctx, id, created.ID, "ai"); err != nil {
		t.Fatalf("set: %v", err)
	}
	if err := s.DeleteLabel(ctx, created.ID); err != nil {
		t.Fatalf("delete: %v", err)
	}
	message, err := s.GetMessage(ctx, id)
	if err != nil || message.LabelID != OtherLabelID {
		t.Fatalf("message not reassigned to Other: label=%d err=%v", message.LabelID, err)
	}

	if err := s.DeleteLabel(ctx, OtherLabelID); err == nil {
		t.Fatal("deleting Other should fail")
	}
}

func TestUserLabelBeatsClassifier(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	a := testAccount(t, s, "acc1")
	inbox := testFolder(t, s, a.ID, "INBOX", RoleInbox)
	id, _, err := s.UpsertMessage(ctx, Message{
		AccountID: a.ID, FolderID: inbox, UID: 1, MessageID: "<m@x>",
		Subject: "hi", From: Address{Email: "ann@x"}, Date: 100,
	})
	if err != nil {
		t.Fatal(err)
	}

	// Classifier labels it, user corrects it, classifier tries again.
	if err := s.SetMessageLabel(ctx, id, 3, "ai"); err != nil {
		t.Fatal(err)
	}
	if err := s.SetMessageLabel(ctx, id, 1, "user"); err != nil {
		t.Fatal(err)
	}
	if err := s.SetMessageLabel(ctx, id, 4, "ai"); err != nil {
		t.Fatal(err)
	}
	message, _ := s.GetMessage(ctx, id)
	if message.LabelID != 1 {
		t.Fatalf("classifier overwrote user label: %d", message.LabelID)
	}

	// And the message no longer counts as unlabeled.
	pending, err := s.MessagesWithoutLabel(ctx, 10)
	if err != nil || len(pending) != 0 {
		t.Fatalf("labeled message still pending: %+v err=%v", pending, err)
	}
}

func TestListMessagesLabelFilter(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	a := testAccount(t, s, "acc1")
	inbox := testFolder(t, s, a.ID, "INBOX", RoleInbox)

	var ids []int64
	for uid := uint32(1); uid <= 3; uid++ {
		id, _, err := s.UpsertMessage(ctx, Message{
			AccountID: a.ID, FolderID: inbox, UID: uid,
			MessageID: "<m" + string(rune('0'+uid)) + "@x>",
			Subject:   "m", From: Address{Email: "x@x"}, Date: int64(uid),
		})
		if err != nil {
			t.Fatal(err)
		}
		ids = append(ids, id)
	}
	// Two promotions, one unlabeled.
	_ = s.SetMessageLabel(ctx, ids[0], 3, "ai")
	_ = s.SetMessageLabel(ctx, ids[1], 3, "ai")

	promos, err := s.ListMessages(ctx, ListFilter{LabelID: 3})
	if err != nil || len(promos) != 2 {
		t.Fatalf("label filter: got %d err=%v", len(promos), err)
	}
	for _, m := range promos {
		if m.LabelID != 3 {
			t.Fatalf("row missing label id: %+v", m)
		}
	}

	all, err := s.ListMessages(ctx, ListFilter{})
	if err != nil || len(all) != 3 {
		t.Fatalf("unfiltered list broke: got %d err=%v", len(all), err)
	}
}
