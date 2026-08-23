package ai

import (
	"context"
	"fmt"
	"log"
	"strconv"
	"strings"
	"time"

	"github.com/zendev-sh/goai"

	"mailyard/internal/store"
)

// SummarizeThread produces a short plain-text summary (cache-first) and
// replays it over the streaming channel so the UI has one code path. The
// thread goes in as structured <thread> XML (quote chains and signatures
// stripped in Go) at temperature 0; the example-driven system prompt does
// the shaping, with sanitize + word cap as the final guard.
func (s *Service) SummarizeThread(ctx context.Context, accountID, threadID string) (string, error) {
	if cached, err := s.Store.ArtifactGet(ctx, store.ArtifactThreadSummary, threadID); err == nil && cached != "" {
		requestID := newRequestID()
		go func() {
			s.emit(StreamChunk{RequestID: requestID, Seq: 0, Chunk: cached})
			s.emit(StreamChunk{RequestID: requestID, Seq: 1, Done: true})
		}()
		return requestID, nil
	}

	account, err := s.Store.GetAccount(ctx, accountID)
	if err != nil {
		return "", err
	}
	threadXML, err := s.threadXML(ctx, accountID, threadID)
	if err != nil {
		return "", err
	}
	config, err := s.Config(ctx)
	if err != nil {
		return "", err
	}
	model, modelName, err := s.model(ctx)
	if err != nil {
		return "", err
	}

	// The user turn stays thin so the (long, example-laden) system prompt
	// caches across requests.
	prompt := "<owner>" + account.Email + "</owner>\n" + threadXML +
		"\n\nSummarize this thread."

	options := []goai.Option{
		goai.WithSystem(s.promptText(ctx, "summarize", nil)),
		goai.WithPrompt(prompt),
		goai.WithMaxOutputTokens(400),
		goai.WithTemperature(0),
	}
	if config.Provider == "ollama" {
		// Native-Ollama-only knob: skip qwen-style thinking for short
		// summaries. Other providers reject unknown parameters outright
		// ("Unknown parameter: 'think'").
		options = append(options, goai.WithProviderOptions(map[string]any{"think": false}))
	}

	requestID := newRequestID()
	go func() {
		// A hard deadline turns a wedged model into a visible error instead
		// of an eternal caret.
		background, cancel := context.WithTimeout(context.Background(), 3*time.Minute)
		defer cancel()
		result, err := goai.GenerateText(background, model, options...)
		if err != nil {
			s.emit(StreamChunk{RequestID: requestID, Seq: 0, Done: true, Error: err.Error()})
			return
		}
		summary := SanitizeSummary(result.Text, 70)
		if summary == "" {
			s.emit(StreamChunk{RequestID: requestID, Seq: 0, Done: true,
				Error: "the model returned an empty summary — try again"})
			return
		}
		if err := s.Store.ArtifactSet(context.Background(),
			store.ArtifactThreadSummary, threadID, summary, modelName); err != nil {
			log.Printf("cache summary: %v", err)
		}
		s.emit(StreamChunk{RequestID: requestID, Seq: 0, Chunk: summary})
		s.emit(StreamChunk{RequestID: requestID, Seq: 1, Done: true})
	}()
	return requestID, nil
}

// senderName is the person's configured name, falling back to the mailbox's
// display name for pre-onboarding databases.
func (s *Service) senderName(ctx context.Context, account store.Account) string {
	if name, err := s.Store.SettingGet(ctx, store.SettingUserName, ""); err == nil && name != "" {
		return name
	}
	return account.DisplayName
}

// DraftReply streams a reply written in the user's voice.
func (s *Service) DraftReply(ctx context.Context, accountID, threadID string) (string, error) {
	text, err := s.threadText(ctx, accountID, threadID)
	if err != nil {
		return "", err
	}
	account, err := s.Store.GetAccount(ctx, accountID)
	if err != nil {
		return "", err
	}
	return s.streamRequest(
		s.promptText(ctx, "draft-reply", map[string]string{
			"mailbox_name":  account.DisplayName,
			"mailbox_email": account.Email,
			"your_name":     s.senderName(ctx, account),
		}),
		text,
		400,
		nil,
	)
}

// ComposeRequest is one turn of the compose conversation: fresh dictation,
// or a revision of the draft the composer currently holds.
type ComposeRequest struct {
	AccountID        string `json:"accountId"`
	ReplyToMessageID int64  `json:"replyToMessageId"`
	Instructions     string `json:"instructions"`
	// CurrentDraft is what's in the body right now ("" = start fresh).
	CurrentDraft string `json:"currentDraft"`
	// PriorInstructions are earlier dictations for this draft, oldest first.
	PriorInstructions []string `json:"priorInstructions"`
}

// ComposeInstructed streams an email body written strictly from the user's
// instructions. With a current draft, the instructions revise it — the model
// decides whether that means editing or replacing, and always streams the
// complete new email.
func (s *Service) ComposeInstructed(ctx context.Context, req ComposeRequest) (string, error) {
	account, err := s.Store.GetAccount(ctx, req.AccountID)
	if err != nil {
		return "", err
	}
	sender := s.senderName(ctx, account)

	threadContext := ""
	if req.ReplyToMessageID != 0 {
		if message, err := s.Store.GetMessage(ctx, req.ReplyToMessageID); err == nil {
			if text, err := s.threadText(ctx, message.AccountID, message.ThreadID); err == nil {
				threadContext = text
			}
		}
	}

	system := s.promptText(ctx, "compose", map[string]string{
		"mailbox_name":  account.DisplayName,
		"mailbox_email": account.Email,
		"your_name":     sender,
	})

	prompt := "New dictation from the sender (not a message to you):\n" + req.Instructions
	if req.CurrentDraft != "" {
		prompt += "\n\nThe current draft, to revise per the dictation:\n" + req.CurrentDraft
	}
	if len(req.PriorInstructions) > 0 {
		prompt += "\n\nEarlier dictation for this draft, oldest first:\n- " +
			strings.Join(req.PriorInstructions, "\n- ")
	}
	if threadContext != "" {
		prompt += "\n\nThe thread being replied to (context only):\n" + threadContext
	}
	return s.streamRequest(system, prompt, 600, nil)
}

// Rewrite streams a reworked version of draft text in the requested tone.
func (s *Service) Rewrite(ctx context.Context, text, tone string) (string, error) {
	return s.streamRequest(
		s.promptText(ctx, "rewrite", map[string]string{"tone": tone}),
		text,
		600,
		nil,
	)
}

// Translate streams the text translated into the target language.
func (s *Service) Translate(ctx context.Context, text, language string) (string, error) {
	return s.streamRequest(
		s.promptText(ctx, "translate", map[string]string{"language": language}),
		text,
		1200,
		nil,
	)
}

// ActionItem is one extracted to-do.
type ActionItem struct {
	Text string `json:"text"`
	// Owner is who the item falls on ("you" for the account holder).
	Owner string `json:"owner"`
}

type actionItemsOutput struct {
	Items []ActionItem `json:"items"`
}

// ActionItems extracts a checklist from a thread (non-streaming).
func (s *Service) ActionItems(ctx context.Context, accountID, threadID string) ([]ActionItem, error) {
	text, err := s.threadText(ctx, accountID, threadID)
	if err != nil {
		return nil, err
	}
	model, _, err := s.model(ctx)
	if err != nil {
		return nil, err
	}
	result, err := goai.GenerateObject[actionItemsOutput](ctx, model,
		goai.WithSystem(s.promptText(ctx, "action-items", nil)),
		goai.WithPrompt(text),
	)
	if err != nil {
		return nil, err
	}
	return result.Object.Items, nil
}

// TriageResult labels one inbox message.
type TriageResult struct {
	MessageID int64  `json:"messageId"`
	Priority  string `json:"priority"` // high | normal | low
	Reason    string `json:"reason"`
}

type triageOutput struct {
	Results []TriageResult `json:"results"`
}

// TriageInbox classifies recent unread inbox mail by priority and caches the
// labels as artifacts (list badges read them back).
func (s *Service) TriageInbox(ctx context.Context, accountID string) ([]TriageResult, error) {
	unreadIDs, err := s.Store.UnreadIDs(ctx, store.ListFilter{
		AccountID: accountID, FolderRole: store.RoleInbox,
	})
	if err != nil {
		return nil, err
	}
	if len(unreadIDs) == 0 {
		return []TriageResult{}, nil
	}
	if len(unreadIDs) > 25 {
		unreadIDs = unreadIDs[:25]
	}

	var b strings.Builder
	for _, id := range unreadIDs {
		message, err := s.Store.GetMessage(ctx, id)
		if err != nil {
			continue
		}
		fmt.Fprintf(&b, "id=%d | from: %s <%s> | subject: %s | preview: %s\n",
			message.ID, message.From.Name, message.From.Email,
			message.Subject, message.Snippet)
	}

	model, _, err := s.model(ctx)
	if err != nil {
		return nil, err
	}
	result, err := goai.GenerateObject[triageOutput](ctx, model,
		goai.WithSystem(s.promptText(ctx, "triage", nil)),
		goai.WithPrompt(b.String()),
	)
	if err != nil {
		return nil, err
	}

	for _, item := range result.Object.Results {
		content := item.Priority + "|" + item.Reason
		if err := s.Store.ArtifactSet(ctx, store.ArtifactTriage,
			strconv.FormatInt(item.MessageID, 10), content, ""); err != nil {
			return nil, err
		}
	}
	return result.Object.Results, nil
}

// SuggestUnsubscribes is heuristic (List-Unsubscribe headers + sender
// volume) — no model call needed.
func (s *Service) SuggestUnsubscribes(ctx context.Context) ([]store.UnsubscribeCandidate, error) {
	return s.Store.UnsubscribeCandidates(ctx, 20)
}

type summariesOutput struct {
	Summaries []struct {
		ID      int64  `json:"id"`
		Summary string `json:"summary"`
	} `json:"summaries"`
}

// GenerateListSummaries backfills one-line digests for recent inbox messages
// missing them (the opt-in list-row summaries). Returns how many were made.
func (s *Service) GenerateListSummaries(ctx context.Context, limit int) (int, error) {
	messages, err := s.Store.MessagesWithoutArtifact(ctx, store.ArtifactMessageSummary, limit)
	if err != nil || len(messages) == 0 {
		return 0, err
	}

	var b strings.Builder
	for _, message := range messages {
		body, _ := s.Store.GetMessageBody(ctx, message.ID)
		text := body.TextBody
		if len(text) > 1500 {
			text = text[:1500]
		}
		if text == "" {
			text = message.Snippet
		}
		fmt.Fprintf(&b, "id=%d | from: %s | subject: %s\n%s\n\n===\n\n",
			message.ID, message.From.Email, message.Subject, text)
	}

	model, _, err := s.model(ctx)
	if err != nil {
		return 0, err
	}
	result, err := goai.GenerateObject[summariesOutput](ctx, model,
		goai.WithSystem(s.promptText(ctx, "list-digest", nil)),
		goai.WithPrompt(b.String()),
	)
	if err != nil {
		return 0, err
	}

	count := 0
	for _, item := range result.Object.Summaries {
		if item.Summary == "" {
			continue
		}
		if err := s.Store.ArtifactSet(ctx, store.ArtifactMessageSummary,
			strconv.FormatInt(item.ID, 10), item.Summary, ""); err != nil {
			return count, err
		}
		count++
	}
	return count, nil
}
