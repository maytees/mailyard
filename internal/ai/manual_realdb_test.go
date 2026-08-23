//go:build manual

package ai

// Reproduces the full in-app summary path against the REAL local database
// and a running Ollama:
//
//	go test ./internal/ai/ -tags manual -run TestManualRealDBSummary -v
//
// Read-mostly; it writes only an ai_artifacts row, like the app would.

import (
	"context"
	"testing"
	"time"

	"mailyard/internal/store"
)

func TestManualRealDBSummary(t *testing.T) {
	path, err := store.DefaultPath()
	if err != nil {
		t.Fatal(err)
	}
	st, err := store.Open(path)
	if err != nil {
		t.Fatalf("open real db: %v", err)
	}
	defer st.Close()
	ctx := context.Background()

	messages, err := st.ListMessages(ctx, store.ListFilter{FolderRole: store.RoleInbox, Limit: 50})
	if err != nil {
		t.Fatalf("list: %v", err)
	}
	if len(messages) == 0 {
		t.Skip("no mail in real db")
	}
	// Prefer a real multi-message thread.
	target := messages[0]
	for _, m := range messages {
		thread, _ := st.GetThread(ctx, m.AccountID, m.ThreadID)
		if len(thread) > 1 {
			target = m
			break
		}
	}
	t.Logf("thread: %q (account %s)", target.Subject, target.AccountID)

	text, err := (&Service{Store: st}).threadText(ctx, target.AccountID, target.ThreadID)
	if err != nil {
		t.Fatalf("threadText: %v", err)
	}
	t.Logf("prompt input: %d chars", len(text))

	recorder := &chunkRecorder{done: make(chan struct{})}
	service := &Service{Store: st, Vault: &fakeVault{entries: map[string]string{}}, Events: recorder}

	requestID, err := service.SummarizeThread(ctx, target.AccountID, target.ThreadID)
	if err != nil {
		t.Fatalf("SummarizeThread: %v", err)
	}
	t.Logf("request %s started, waiting…", requestID)

	select {
	case <-recorder.done:
	case <-time.After(4 * time.Minute):
		t.Fatal("no done chunk within 4 minutes — this IS the hang")
	}

	recorder.mu.Lock()
	defer recorder.mu.Unlock()
	for i, chunk := range recorder.chunks {
		t.Logf("chunk %d: done=%v err=%q content=%q", i, chunk.Done, chunk.Error, chunk.Chunk)
	}
}
