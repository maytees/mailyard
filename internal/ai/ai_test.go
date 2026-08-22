package ai

import (
	"context"
	"errors"
	"path/filepath"
	"sync"
	"testing"
	"time"

	"mailyard/internal/store"
)

type fakeVault struct {
	mu      sync.Mutex
	entries map[string]string
}

func (v *fakeVault) Set(key, secret string) error {
	v.mu.Lock()
	defer v.mu.Unlock()
	v.entries[key] = secret
	return nil
}

func (v *fakeVault) Get(key string) (string, error) {
	v.mu.Lock()
	defer v.mu.Unlock()
	secret, ok := v.entries[key]
	if !ok {
		return "", errors.New("not found")
	}
	return secret, nil
}

func (v *fakeVault) Delete(key string) error {
	v.mu.Lock()
	defer v.mu.Unlock()
	delete(v.entries, key)
	return nil
}

type chunkRecorder struct {
	mu     sync.Mutex
	chunks []StreamChunk
	done   chan struct{}
}

func (r *chunkRecorder) Emit(name string, data any) {
	chunk, ok := data.(StreamChunk)
	if !ok {
		return
	}
	r.mu.Lock()
	r.chunks = append(r.chunks, chunk)
	r.mu.Unlock()
	if chunk.Done {
		close(r.done)
	}
}

func testService(t *testing.T) (*Service, *chunkRecorder) {
	t.Helper()
	st, err := store.Open(filepath.Join(t.TempDir(), "test.db"))
	if err != nil {
		t.Fatalf("open store: %v", err)
	}
	t.Cleanup(func() { st.Close() })
	recorder := &chunkRecorder{done: make(chan struct{})}
	return &Service{
		Store:  st,
		Vault:  &fakeVault{entries: map[string]string{}},
		Events: recorder,
	}, recorder
}

func TestConfigDefaultsAndRoundTrip(t *testing.T) {
	service, _ := testService(t)
	ctx := context.Background()

	config, err := service.Config(ctx)
	if err != nil {
		t.Fatalf("config: %v", err)
	}
	if config.Provider != DefaultProvider || config.Model != DefaultModel {
		t.Fatalf("bad defaults: %+v", config)
	}
	if config.HasKey || config.ListSummaries {
		t.Fatalf("fresh config claims key/opt-in: %+v", config)
	}

	if err := service.SetConfig(ctx, "openai", "gpt-4o", true, "sk-test"); err != nil {
		t.Fatalf("set config: %v", err)
	}
	config, _ = service.Config(ctx)
	if config.Provider != "openai" || config.Model != "gpt-4o" ||
		!config.HasKey || !config.ListSummaries {
		t.Fatalf("round trip lost data: %+v", config)
	}

	// Empty key keeps the stored one.
	if err := service.SetConfig(ctx, "openai", "gpt-4o", false, ""); err != nil {
		t.Fatalf("re-set: %v", err)
	}
	if key, _ := service.Vault.Get("ai-api-key"); key != "sk-test" {
		t.Fatalf("empty key overwrote credential: %q", key)
	}
}

func TestModelRequiresKey(t *testing.T) {
	service, _ := testService(t)
	if _, _, err := service.model(context.Background()); err == nil {
		t.Fatal("want a friendly no-key error")
	}
}

func TestSummarizeReplaysCache(t *testing.T) {
	service, recorder := testService(t)
	ctx := context.Background()

	// No account/thread setup needed: the cache hit short-circuits.
	if err := service.Store.ArtifactSet(ctx, store.ArtifactThreadSummary,
		"<t1@x>", "Cached summary.", "test-model"); err != nil {
		t.Fatalf("seed artifact: %v", err)
	}

	requestID, err := service.SummarizeThread(ctx, "acc1", "<t1@x>")
	if err != nil {
		t.Fatalf("summarize: %v", err)
	}
	select {
	case <-recorder.done:
	case <-time.After(2 * time.Second):
		t.Fatal("stream never completed")
	}

	recorder.mu.Lock()
	defer recorder.mu.Unlock()
	if len(recorder.chunks) != 2 {
		t.Fatalf("want chunk+done, got %+v", recorder.chunks)
	}
	if recorder.chunks[0].RequestID != requestID ||
		recorder.chunks[0].Chunk != "Cached summary." {
		t.Fatalf("bad replayed chunk: %+v", recorder.chunks[0])
	}
	if !recorder.chunks[1].Done || recorder.chunks[1].Error != "" {
		t.Fatalf("bad done chunk: %+v", recorder.chunks[1])
	}
}

func TestUnsubscribeSuggestionsAreHeuristic(t *testing.T) {
	service, _ := testService(t)
	ctx := context.Background()

	account := store.Account{
		ID: "acc1", Email: "me@x.com", DisplayName: "Me", Color: "violet",
		IMAPHost: "x", IMAPPort: 1, SMTPHost: "x", SMTPPort: 1,
		Username: "me@x.com", CreatedAt: 1,
	}
	if err := service.Store.UpsertAccount(ctx, account); err != nil {
		t.Fatal(err)
	}
	inbox, err := service.Store.UpsertFolder(ctx, store.Folder{
		AccountID: account.ID, Name: "INBOX", Role: store.RoleInbox,
	})
	if err != nil {
		t.Fatal(err)
	}
	for i := 1; i <= 2; i++ {
		if _, _, err := service.Store.UpsertMessage(ctx, store.Message{
			AccountID: account.ID, FolderID: inbox, UID: uint32(i),
			Subject: "Deals!", From: store.Address{Name: "Shop", Email: "deals@shop.com"},
			Date: int64(i), Unread: true,
			ListUnsubscribe: "<mailto:u@shop.com>, <https://shop.com/unsub>",
		}); err != nil {
			t.Fatal(err)
		}
	}

	candidates, err := service.SuggestUnsubscribes(ctx)
	if err != nil {
		t.Fatalf("suggest: %v", err)
	}
	if len(candidates) != 1 {
		t.Fatalf("want 1 candidate, got %+v", candidates)
	}
	if candidates[0].UnsubscribeURL != "https://shop.com/unsub" {
		t.Fatalf("http link not extracted: %+v", candidates[0])
	}
	if candidates[0].Count != 2 || candidates[0].UnreadCount != 2 {
		t.Fatalf("stats wrong: %+v", candidates[0])
	}
}
