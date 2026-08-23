package ai

import (
	"context"
	"encoding/json"
	"errors"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"

	"mailyard/internal/secrets"
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

	// Empty key keeps the stored one (now in the provider's own slot).
	if err := service.SetConfig(ctx, "openai", "gpt-4o", false, ""); err != nil {
		t.Fatalf("re-set: %v", err)
	}
	if key, _ := service.Vault.Get("ai-api-key-openai"); key != "sk-test" {
		t.Fatalf("empty key overwrote credential: %q", key)
	}
}

func TestPerProviderKeys(t *testing.T) {
	service, _ := testService(t)
	ctx := context.Background()

	// Legacy single key belongs to the main provider only.
	_ = service.Vault.Set(secrets.AIKeyName, "legacy-key")
	if _, has := service.apiKey(ctx, DefaultProvider); !has {
		t.Fatal("legacy key not honored for main provider")
	}
	if _, has := service.apiKey(ctx, "google"); has {
		t.Fatal("legacy key leaked to another provider")
	}

	// A rule on a keyless cloud provider is rejected with a clear message.
	err := service.SetModelRule(ctx, "triage", "google", "gemini-2.5-flash")
	if err == nil || !strings.Contains(err.Error(), "google API key") {
		t.Fatalf("keyless rule accepted or unclear: %v", err)
	}
	// Ollama rules never need a key.
	if err := service.SetModelRule(ctx, "triage", "ollama", "qwen3:8b"); err != nil {
		t.Fatalf("ollama rule: %v", err)
	}

	// Storing a google key unlocks it; keys list reports per provider.
	if err := service.SetProviderKey(ctx, "google", "g-key"); err != nil {
		t.Fatalf("set key: %v", err)
	}
	if err := service.SetModelRule(ctx, "list-digest", "google", "gemini-2.5-flash"); err != nil {
		t.Fatalf("rule after key: %v", err)
	}
	keys, err := service.ListProviderKeys(ctx)
	if err != nil || len(keys) != 3 {
		t.Fatalf("keys: %+v err=%v", keys, err)
	}
	byProvider := map[string]bool{}
	for _, k := range keys {
		byProvider[k.Provider] = k.HasKey
	}
	if !byProvider["google"] || !byProvider[DefaultProvider] || byProvider["openai"] {
		t.Fatalf("hasKey wrong: %+v", byProvider)
	}

	// Clearing the main provider's key clears the legacy slot too.
	if err := service.SetProviderKey(ctx, DefaultProvider, ""); err != nil {
		t.Fatalf("clear: %v", err)
	}
	if _, has := service.apiKey(ctx, DefaultProvider); has {
		t.Fatal("cleared key still resolves via legacy slot")
	}
	// Ollama takes no key.
	if err := service.SetProviderKey(ctx, "ollama", "x"); err == nil {
		t.Fatal("ollama key accepted")
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

func TestCleanBody(t *testing.T) {
	raw := "Sounds good, see you Friday.\n" +
		"\n" +
		"On Wed, Jul 29, 2026 at 3:15 PM Jamie Prusak <j@x.com> wrote:\n" +
		"> Hello!\n" +
		"> I'm still working on the bios.\n" +
		">\n" +
		"> > Even deeper quote\n" +
		"\n" +
		"Sent from my iPhone\n" +
		"\n" +
		"-- \n" +
		"Jamie Prusak\n" +
		"VP of Everything | Asgaard Capital\n"

	got := CleanBody(raw)
	if got != "Sounds good, see you Friday." {
		t.Fatalf("noise survived: %q", got)
	}

	// Clean bodies pass through, with blank runs collapsed.
	clean := "First paragraph.\n\n\n\nSecond paragraph."
	if got := CleanBody(clean); got != "First paragraph.\n\nSecond paragraph." {
		t.Fatalf("clean body mangled: %q", got)
	}
}

func TestThreadXMLShape(t *testing.T) {
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
	id, _, err := service.Store.UpsertMessage(ctx, store.Message{
		AccountID: account.ID, FolderID: inbox, UID: 1, MessageID: "<m1@x>",
		Subject: "Hi", From: store.Address{Name: "Ann", Email: "ann@x.com"},
		Date: 1754500000,
	})
	if err != nil {
		t.Fatal(err)
	}
	if err := service.Store.SetMessageBody(ctx, id,
		"The report is ready.\n\n> old quoted stuff\n-- \nsig", ""); err != nil {
		t.Fatal(err)
	}

	message, err := service.Store.GetMessage(ctx, id)
	if err != nil {
		t.Fatal(err)
	}
	xml, err := service.threadXML(ctx, account.ID, message.ThreadID)
	if err != nil {
		t.Fatalf("threadXML: %v", err)
	}
	for _, want := range []string{
		"<thread>", "</thread>", "<message>", "<from>Ann <ann@x.com></from>",
		"<body>", "The report is ready.",
	} {
		if !strings.Contains(xml, want) {
			t.Fatalf("missing %q in:\n%s", want, xml)
		}
	}
	for _, banned := range []string{"> old quoted stuff", "sig"} {
		if strings.Contains(xml, banned) {
			t.Fatalf("noise %q survived in:\n%s", banned, xml)
		}
	}
}

func TestPromptOverrides(t *testing.T) {
	service, _ := testService(t)
	ctx := context.Background()

	// Defaults resolve with substitution.
	text := service.promptText(ctx, "draft-reply", map[string]string{
		"mailbox_name": "P", "mailbox_email": "p@x.com", "your_name": "Zed",
	})
	if !strings.Contains(text, "Zed alone on the final line") {
		t.Fatalf("default template not filled: %q", text)
	}

	// Overrides win and substitute too.
	if err := service.SetPrompt(ctx, "draft-reply", "Reply as {your_name}, cowboy style."); err != nil {
		t.Fatalf("set prompt: %v", err)
	}
	text = service.promptText(ctx, "draft-reply", map[string]string{"your_name": "Zed"})
	if text != "Reply as Zed, cowboy style." {
		t.Fatalf("override ignored: %q", text)
	}

	// Listing reports the override; empty resets it.
	prompts, err := service.ListPrompts(ctx)
	if err != nil {
		t.Fatalf("list: %v", err)
	}
	found := false
	for _, prompt := range prompts {
		if prompt.ID == "draft-reply" {
			found = true
			if prompt.Custom == "" {
				t.Fatal("override not reported")
			}
		} else if prompt.Custom != "" {
			t.Fatalf("unexpected override on %s", prompt.ID)
		}
	}
	if !found {
		t.Fatal("draft-reply prompt missing from list")
	}
	if err := service.SetPrompt(ctx, "draft-reply", ""); err != nil {
		t.Fatalf("reset: %v", err)
	}
	if text := service.promptText(ctx, "draft-reply", nil); !strings.Contains(text, "one-click reply") {
		t.Fatalf("reset didn't restore default: %q", text)
	}

	// Unknown ids are rejected.
	if err := service.SetPrompt(ctx, "nope", "x"); err == nil {
		t.Fatal("unknown prompt accepted")
	}
}

func TestModelRules(t *testing.T) {
	service, _ := testService(t)
	ctx := context.Background()
	// The default provider is cloud — building its model needs a key.
	_ = service.Vault.Set(secrets.AIKeyName, "test-key")

	// No rule → the main configured model.
	_, providerName, modelName, err := service.modelFor(ctx, "list-digest")
	if err != nil {
		t.Fatalf("fallback: %v", err)
	}
	if providerName != DefaultProvider || modelName != DefaultModel {
		t.Fatalf("fallback wrong: %s/%s", providerName, modelName)
	}

	// Rule set → digests route to local qwen, other features untouched.
	if err := service.SetModelRule(ctx, "list-digest", "ollama", "qwen3:8b"); err != nil {
		t.Fatalf("set: %v", err)
	}
	_, providerName, modelName, err = service.modelFor(ctx, "list-digest")
	if err != nil || providerName != "ollama" || modelName != "qwen3:8b" {
		t.Fatalf("rule not applied: %s/%s err=%v", providerName, modelName, err)
	}
	_, providerName, _, _ = service.modelFor(ctx, "summarize")
	if providerName != DefaultProvider {
		t.Fatalf("rule leaked to other feature: %s", providerName)
	}
	rules, err := service.ListModelRules(ctx)
	if err != nil || len(rules) != 1 || rules[0].Feature != "list-digest" ||
		rules[0].Title == "" {
		t.Fatalf("list: %+v err=%v", rules, err)
	}

	// Clearing restores the default; junk is rejected.
	if err := service.SetModelRule(ctx, "list-digest", "", ""); err != nil {
		t.Fatalf("clear: %v", err)
	}
	if rules, _ := service.ListModelRules(ctx); len(rules) != 0 {
		t.Fatalf("rule survived clear: %+v", rules)
	}
	if err := service.SetModelRule(ctx, "nope", "ollama", "x"); err == nil {
		t.Fatal("unknown feature accepted")
	}
	if err := service.SetModelRule(ctx, "triage", "aws", "x"); err == nil {
		t.Fatal("unknown provider accepted")
	}
	if err := service.SetModelRule(ctx, "triage", "ollama", " "); err == nil {
		t.Fatal("blank model accepted")
	}
}

func TestRejectsTemperature(t *testing.T) {
	// The exact OpenAI reasoning-family refusals (GPT Luna, o3-mini).
	for _, message := range []string{
		"Unsupported parameter: 'temperature' is not supported with this model.",
		"400 Bad Request: unsupported parameter 'temperature'",
	} {
		if !rejectsTemperature(errors.New(message)) {
			t.Fatalf("not detected: %q", message)
		}
	}
	for _, message := range []string{
		"Unknown parameter: 'think'",
		"context deadline exceeded",
	} {
		if rejectsTemperature(errors.New(message)) {
			t.Fatalf("false positive: %q", message)
		}
	}
}

func TestParseTriageLabels(t *testing.T) {
	// Fenced output with a numeric id — both defects seen from small models.
	raw := "```json\n[{\"id\": 41, \"reason\": \"waiting on reply\", \"priority\": \"high\"},\n" +
		"{\"id\": \"42\", \"reason\": \"newsletter\", \"priority\": \"low\"}]\n```"
	var labeled []triagedEmail
	if err := json.Unmarshal([]byte(jsonArrayText(raw)), &labeled); err != nil {
		t.Fatalf("parse: %v", err)
	}
	if len(labeled) != 2 || labeled[0].ID != "41" || labeled[1].ID != "42" {
		t.Fatalf("ids wrong: %+v", labeled)
	}
	if labeled[0].Priority != "high" || labeled[1].Priority != "low" {
		t.Fatalf("priorities wrong: %+v", labeled)
	}
}

func TestSanitizeSummary(t *testing.T) {
	messy := "Here's a **clean and concise summary** of the thread:\n\n" +
		"---\n\n### **Summary:**\n\n" +
		"**Jamie** shared [7.24 Revisions](https://example.com/doc) with the team.\n\n" +
		"1. **Document Shared:** home and service pages\n" +
		"- Team bios due tomorrow\n\n---\n"
	got := SanitizeSummary(messy, 70)

	for _, banned := range []string{"**", "#", "---", "](", "\n"} {
		if strings.Contains(got, banned) {
			t.Fatalf("markdown survived (%q): %q", banned, got)
		}
	}
	if !strings.Contains(got, "Jamie shared 7.24 Revisions") {
		t.Fatalf("content lost: %q", got)
	}
	if strings.HasPrefix(got, "Here's") {
		t.Fatalf("preamble survived: %q", got)
	}

	// Word cap.
	long := strings.Repeat("word ", 100)
	if capped := SanitizeSummary(long, 10); len(strings.Fields(capped)) > 11 {
		t.Fatalf("cap failed: %q", capped)
	}
	// Clean text passes through untouched.
	clean := "Jamie shared the revisions; bios follow tomorrow."
	if got := SanitizeSummary(clean, 70); got != clean {
		t.Fatalf("clean text mangled: %q", got)
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
