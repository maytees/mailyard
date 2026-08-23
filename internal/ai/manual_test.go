//go:build manual

package ai

// Manual integration check against a locally running Ollama, exercising the
// real service path (prompt file, XML thread, cleaning, sanitizing):
//
//	go test ./internal/ai/ -tags manual -run TestManualOllamaSummary -v
//
// Excluded from normal test runs — it needs the ollama service and a pulled
// model.

import (
	"context"
	"strings"
	"testing"
	"time"

	"mailyard/internal/store"
)

func TestManualOllamaSummary(t *testing.T) {
	service, recorder := testService(t)
	ctx := context.Background()
	if err := service.SetConfig(ctx, "ollama", "qwen3:8b", false, ""); err != nil {
		t.Fatal(err)
	}

	account := store.Account{
		ID: "acc1", Email: "me@x.com", DisplayName: "Me", Color: "violet",
		IMAPHost: "x", IMAPPort: 1, SMTPHost: "x", SMTPPort: 1,
		Username: "me@x.com", CreatedAt: 1,
	}
	if err := service.Store.UpsertAccount(ctx, account); err != nil {
		t.Fatal(err)
	}
	inbox, _ := service.Store.UpsertFolder(ctx, store.Folder{
		AccountID: account.ID, Name: "INBOX", Role: store.RoleInbox,
	})

	seed := func(uid uint32, id, from, fromEmail, body string, refs string) {
		msgID, _, err := service.Store.UpsertMessage(ctx, store.Message{
			AccountID: account.ID, FolderID: inbox, UID: uid,
			MessageID: id, Refs: refs, Subject: "7.24 Website Copy",
			From: store.Address{Name: from, Email: fromEmail},
			Date: 1754500000 + int64(uid)*3600,
		})
		if err != nil {
			t.Fatal(err)
		}
		if err := service.Store.SetMessageBody(ctx, msgID, body, ""); err != nil {
			t.Fatal(err)
		}
	}
	seed(1, "<m1@x>", "Jamie", "j@x.com",
		"Here are the home and service page copy changes. Team bios coming tomorrow morning.", "")
	seed(2, "<m2@x>", "Me", "me@x.com",
		"Is the Young meeting Thursday or Friday?\n\n> Here are the home and service page copy changes.", "<m1@x>")
	seed(3, "<m3@x>", "Jamie", "j@x.com",
		"Set up in Teams for Friday, waiting on Young to confirm.\n\nSent from my iPhone", "<m1@x> <m2@x>")

	message, err := service.Store.GetMessage(ctx, 1)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := service.SummarizeThread(ctx, account.ID, message.ThreadID); err != nil {
		t.Fatalf("summarize: %v", err)
	}

	select {
	case <-recorder.done:
	case <-time.After(3 * time.Minute):
		t.Fatal("no done chunk")
	}

	recorder.mu.Lock()
	defer recorder.mu.Unlock()
	var summary string
	for _, chunk := range recorder.chunks {
		if chunk.Error != "" {
			t.Fatalf("stream error: %s", chunk.Error)
		}
		summary += chunk.Chunk
	}
	t.Logf("summary (%d words): %s", len(strings.Fields(summary)), summary)
	if summary == "" || len(strings.Fields(summary)) > 75 {
		t.Fatalf("bad summary: %q", summary)
	}
}
