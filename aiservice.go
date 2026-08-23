package main

import (
	"context"
	"fmt"
	"log"
	"strconv"
	"sync"
	"time"

	"github.com/wailsapp/wails/v3/pkg/application"

	"mailyard/internal/ai"
	"mailyard/internal/secrets"
	"mailyard/internal/store"
)

// AIService binds the AI features to the frontend and, when the user opts
// in, keeps list-row digests generated in the background after each sync.
type AIService struct {
	boot *BootService

	mu         sync.Mutex
	subscribed bool
	generating bool
}

func (a *AIService) svc() (*ai.Service, error) {
	st := a.boot.storeHandle()
	if st == nil {
		return nil, fmt.Errorf("database is not available: %s", a.boot.BootError())
	}
	return &ai.Service{
		Store:  st,
		Vault:  secrets.Keychain{},
		Events: wailsEmitter{},
	}, nil
}

func (a *AIService) GetConfig(ctx context.Context) (ai.Config, error) {
	service, err := a.svc()
	if err != nil {
		return ai.Config{}, err
	}
	return service.Config(ctx)
}

func (a *AIService) SetConfig(ctx context.Context, provider, model string, listSummaries bool, apiKey string) error {
	service, err := a.svc()
	if err != nil {
		return err
	}
	if err := service.SetConfig(ctx, provider, model, listSummaries, apiKey); err != nil {
		return err
	}
	a.ensureBackgroundSummaries()
	return nil
}

// ListPrompts returns every AI instruction with its current override.
func (a *AIService) ListPrompts(ctx context.Context) ([]ai.PromptInfo, error) {
	service, err := a.svc()
	if err != nil {
		return nil, err
	}
	return service.ListPrompts(ctx)
}

// SetPrompt overrides one instruction; empty text resets to the default.
func (a *AIService) SetPrompt(ctx context.Context, id, custom string) error {
	service, err := a.svc()
	if err != nil {
		return err
	}
	return service.SetPrompt(ctx, id, custom)
}

func (a *AIService) SummarizeThread(ctx context.Context, accountID, threadID string) (string, error) {
	service, err := a.svc()
	if err != nil {
		return "", err
	}
	return service.SummarizeThread(ctx, accountID, threadID)
}

func (a *AIService) DraftReply(ctx context.Context, accountID, threadID string) (string, error) {
	service, err := a.svc()
	if err != nil {
		return "", err
	}
	return service.DraftReply(ctx, accountID, threadID)
}

func (a *AIService) ComposeInstructed(ctx context.Context, req ai.ComposeRequest) (string, error) {
	service, err := a.svc()
	if err != nil {
		return "", err
	}
	return service.ComposeInstructed(ctx, req)
}

func (a *AIService) Rewrite(ctx context.Context, text, tone string) (string, error) {
	service, err := a.svc()
	if err != nil {
		return "", err
	}
	return service.Rewrite(ctx, text, tone)
}

func (a *AIService) Translate(ctx context.Context, text, language string) (string, error) {
	service, err := a.svc()
	if err != nil {
		return "", err
	}
	return service.Translate(ctx, text, language)
}

// ActionItems re-extracts a thread's checklist and returns the persisted
// rows (open first, done history kept).
func (a *AIService) ActionItems(ctx context.Context, accountID, threadID string) ([]store.ActionItemRow, error) {
	service, err := a.svc()
	if err != nil {
		return nil, err
	}
	return service.ActionItems(ctx, accountID, threadID)
}

// ListActionItems returns a thread's saved checklist without re-extracting.
func (a *AIService) ListActionItems(ctx context.Context, accountID, threadID string) ([]store.ActionItemRow, error) {
	st := a.boot.storeHandle()
	if st == nil {
		return nil, fmt.Errorf("database is not available")
	}
	return st.ListActionItems(ctx, accountID, threadID)
}

// SetActionItemDone toggles one checklist entry.
func (a *AIService) SetActionItemDone(ctx context.Context, id int64, done bool) error {
	st := a.boot.storeHandle()
	if st == nil {
		return fmt.Errorf("database is not available")
	}
	return st.SetActionItemDone(ctx, id, done)
}

func (a *AIService) TriageInbox(ctx context.Context, accountID string) ([]ai.TriageResult, error) {
	service, err := a.svc()
	if err != nil {
		return nil, err
	}
	return service.TriageInbox(ctx, accountID)
}

func (a *AIService) SuggestUnsubscribes(ctx context.Context) ([]store.UnsubscribeCandidate, error) {
	service, err := a.svc()
	if err != nil {
		return nil, err
	}
	return service.SuggestUnsubscribes(ctx)
}

// MessageArtifacts bulk-fetches per-message AI outputs for list rendering
// (kind: "msg-summary" digests or "triage" labels), keyed by message id.
func (a *AIService) MessageArtifacts(ctx context.Context, kind string, messageIDs []int64) (map[string]string, error) {
	st := a.boot.storeHandle()
	if st == nil {
		return nil, fmt.Errorf("database is not available")
	}
	refs := make([]string, 0, len(messageIDs))
	for _, id := range messageIDs {
		refs = append(refs, strconv.FormatInt(id, 10))
	}
	return st.ArtifactsForRefs(ctx, kind, refs)
}

// ensureBackgroundSummaries subscribes (once) to sync updates and generates
// missing list digests when the opt-in is on.
func (a *AIService) ensureBackgroundSummaries() {
	a.mu.Lock()
	if a.subscribed {
		a.mu.Unlock()
		return
	}
	a.subscribed = true
	a.mu.Unlock()

	var debounce *time.Timer
	application.Get().Event.On("mail:changed", func(*application.CustomEvent) {
		if debounce != nil {
			debounce.Stop()
		}
		debounce = time.AfterFunc(5*time.Second, a.generateSummaries)
	})
	go a.generateSummaries()
}

func (a *AIService) generateSummaries() {
	a.mu.Lock()
	if a.generating {
		a.mu.Unlock()
		return
	}
	a.generating = true
	a.mu.Unlock()
	defer func() {
		a.mu.Lock()
		a.generating = false
		a.mu.Unlock()
	}()

	service, err := a.svc()
	if err != nil {
		return
	}
	ctx := context.Background()
	config, err := service.Config(ctx)
	if err != nil || !config.ListSummaries {
		return
	}
	// Ollama is local — it never has (or needs) an API key.
	if !config.HasKey && config.Provider != "ollama" {
		return
	}
	count, err := service.GenerateListSummaries(ctx, 10)
	if err != nil {
		log.Printf("list summaries: %v", err)
		return
	}
	if count > 0 {
		application.Get().Event.Emit("ai:artifacts-updated", true)
	}
}

// ServiceStartup wires the background generator once the app runs.
func (a *AIService) ServiceStartup(ctx context.Context, options application.ServiceOptions) error {
	// Defer until after reveal, alongside the sync engine.
	application.Get().Event.On("frontend:ready", func(*application.CustomEvent) {
		a.ensureBackgroundSummaries()
	})
	return nil
}
