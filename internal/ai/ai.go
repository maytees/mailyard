// Package ai implements Mailyard's AI features on top of GoAI: streaming
// summaries/drafts/rewrites, structured triage and action items, and the
// heuristic unsubscribe suggestions. Provider and model are user
// configuration; the API key lives in the keychain.
package ai

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"strconv"
	"strings"

	"github.com/zendev-sh/goai"
	"github.com/zendev-sh/goai/provider"
	"github.com/zendev-sh/goai/provider/anthropic"
	"github.com/zendev-sh/goai/provider/google"
	"github.com/zendev-sh/goai/provider/ollama"
	"github.com/zendev-sh/goai/provider/openai"

	"mailyard/internal/secrets"
	"mailyard/internal/store"
)

// Settings keys (store.settings table).
const (
	SettingProvider      = "ai_provider"
	SettingModel         = "ai_model"
	SettingListSummaries = "ai_list_summaries"
)

const (
	DefaultProvider = "anthropic"
	DefaultModel    = "claude-sonnet-5"
)

// Emitter matches the Wails event bus (and the sync engine's interface).
type Emitter interface {
	Emit(name string, data any)
}

// StreamChunk is one event on the "ai:stream" channel.
type StreamChunk struct {
	RequestID string `json:"requestId"`
	Chunk     string `json:"chunk"`
	Done      bool   `json:"done"`
	Error     string `json:"error"`
}

// Config is the user-visible AI configuration (the key itself never leaves
// the keychain — only whether one exists).
type Config struct {
	Provider      string `json:"provider"`
	Model         string `json:"model"`
	HasKey        bool   `json:"hasKey"`
	ListSummaries bool   `json:"listSummaries"`
}

type Service struct {
	Store  *store.Store
	Vault  secrets.Vault
	Events Emitter
}

func (s *Service) Config(ctx context.Context) (Config, error) {
	providerName, err := s.Store.SettingGet(ctx, SettingProvider, DefaultProvider)
	if err != nil {
		return Config{}, err
	}
	model, err := s.Store.SettingGet(ctx, SettingModel, DefaultModel)
	if err != nil {
		return Config{}, err
	}
	listSummaries, err := s.Store.SettingGet(ctx, SettingListSummaries, "false")
	if err != nil {
		return Config{}, err
	}
	_, keyErr := s.Vault.Get(secrets.AIKeyName)
	return Config{
		Provider:      providerName,
		Model:         model,
		HasKey:        keyErr == nil,
		ListSummaries: listSummaries == "true",
	}, nil
}

// SetConfig updates provider/model/opt-ins; an empty apiKey keeps the
// existing credential.
func (s *Service) SetConfig(ctx context.Context, providerName, model string, listSummaries bool, apiKey string) error {
	if err := s.Store.SettingSet(ctx, SettingProvider, providerName); err != nil {
		return err
	}
	if err := s.Store.SettingSet(ctx, SettingModel, model); err != nil {
		return err
	}
	if err := s.Store.SettingSet(ctx, SettingListSummaries, strconv.FormatBool(listSummaries)); err != nil {
		return err
	}
	if apiKey != "" {
		if err := s.Vault.Set(secrets.AIKeyName, apiKey); err != nil {
			return fmt.Errorf("store API key in keychain: %w", err)
		}
	}
	return nil
}

// model resolves the configured provider into a GoAI language model.
func (s *Service) model(ctx context.Context) (provider.LanguageModel, string, error) {
	config, err := s.Config(ctx)
	if err != nil {
		return nil, "", err
	}
	key, keyErr := s.Vault.Get(secrets.AIKeyName)
	if keyErr != nil && config.Provider != "ollama" {
		return nil, "", fmt.Errorf("no AI API key configured — add one in Settings (⌘ ,)")
	}

	switch config.Provider {
	case "anthropic":
		return anthropic.Chat(config.Model, anthropic.WithAPIKey(key)), config.Model, nil
	case "openai":
		return openai.Chat(config.Model, openai.WithAPIKey(key)), config.Model, nil
	case "google":
		return google.Chat(config.Model, google.WithAPIKey(key)), config.Model, nil
	case "ollama":
		return ollama.Chat(config.Model), config.Model, nil
	default:
		return nil, "", fmt.Errorf("unknown AI provider %q", config.Provider)
	}
}

func (s *Service) emit(chunk StreamChunk) {
	if s.Events != nil {
		s.Events.Emit("ai:stream", chunk)
	}
}

func newRequestID() string {
	buf := make([]byte, 8)
	if _, err := rand.Read(buf); err != nil {
		panic(err)
	}
	return hex.EncodeToString(buf)
}

// streamRequest runs one streaming generation in the background, emitting
// chunks on "ai:stream". onDone (optional) receives the accumulated text.
func (s *Service) streamRequest(system, prompt string, onDone func(full string)) (string, error) {
	// Validate configuration up front so the caller gets a friendly error
	// instead of a stream that instantly fails.
	model, _, err := s.model(context.Background())
	if err != nil {
		return "", err
	}

	requestID := newRequestID()
	go func() {
		stream, err := goai.StreamText(context.Background(), model,
			goai.WithSystem(system),
			goai.WithPrompt(prompt),
		)
		if err != nil {
			s.emit(StreamChunk{RequestID: requestID, Done: true, Error: err.Error()})
			return
		}
		var full strings.Builder
		for text := range stream.TextStream() {
			full.WriteString(text)
			s.emit(StreamChunk{RequestID: requestID, Chunk: text})
		}
		if err := stream.Err(); err != nil {
			s.emit(StreamChunk{RequestID: requestID, Done: true, Error: err.Error()})
			return
		}
		if onDone != nil {
			onDone(full.String())
		}
		s.emit(StreamChunk{RequestID: requestID, Done: true})
	}()
	return requestID, nil
}

// threadText renders a thread (bodies included) into a prompt-friendly form.
func (s *Service) threadText(ctx context.Context, accountID, threadID string) (string, error) {
	thread, err := s.Store.GetThread(ctx, accountID, threadID)
	if err != nil {
		return "", err
	}
	if len(thread) == 0 {
		return "", fmt.Errorf("thread not found")
	}

	var b strings.Builder
	for _, message := range thread {
		body, err := s.Store.GetMessageBody(ctx, message.ID)
		if err != nil {
			return "", err
		}
		text := body.TextBody
		if text == "" {
			text = message.Snippet
		}
		fmt.Fprintf(&b, "From: %s <%s>\nSubject: %s\n\n%s\n\n---\n\n",
			message.From.Name, message.From.Email, message.Subject, text)
	}
	return b.String(), nil
}
