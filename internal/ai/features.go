package ai

import (
	"context"
	"fmt"
	"log"
	"strconv"
	"strings"

	"github.com/zendev-sh/goai"

	"mailyard/internal/store"
)

type summaryOutput struct {
	// The json schema description constrains the model far harder than prose
	// system prompts — local models ignore those on long inputs.
	Summary string `json:"summary" jsonschema_description:"1 to 3 plain sentences, 60 words maximum, no markdown of any kind"`
}

// SummarizeThread produces a short plain-text summary (cache-first) and
// replays it over the streaming channel so the UI has one code path.
// Generation is structured (JSON-constrained) rather than free-streamed:
// small local models decorate free text with markdown no matter what the
// prompt says, and the output is sanitized + word-capped as a final guard.
func (s *Service) SummarizeThread(ctx context.Context, accountID, threadID string) (string, error) {
	if cached, err := s.Store.ArtifactGet(ctx, store.ArtifactThreadSummary, threadID); err == nil && cached != "" {
		requestID := newRequestID()
		go func() {
			s.emit(StreamChunk{RequestID: requestID, Chunk: cached})
			s.emit(StreamChunk{RequestID: requestID, Done: true})
		}()
		return requestID, nil
	}

	text, err := s.threadText(ctx, accountID, threadID)
	if err != nil {
		return "", err
	}
	model, modelName, err := s.model(ctx)
	if err != nil {
		return "", err
	}

	requestID := newRequestID()
	go func() {
		background := context.Background()
		result, err := goai.GenerateObject[summaryOutput](background, model,
			goai.WithSystem("Summarize the email thread for its owner: who wants "+
				"what, what was decided, what happens next. 1-3 plain sentences, "+
				"60 words maximum. Plain text only — never markdown, headings, "+
				"bullets, links, or preamble."),
			goai.WithPrompt(text),
			goai.WithMaxOutputTokens(400),
			// Ollama: skip qwen-style thinking; it slows short summaries down.
			goai.WithProviderOptions(map[string]any{"think": false}),
		)
		if err != nil {
			s.emit(StreamChunk{RequestID: requestID, Done: true, Error: err.Error()})
			return
		}
		summary := SanitizeSummary(result.Object.Summary, 70)
		if summary == "" {
			s.emit(StreamChunk{RequestID: requestID, Done: true,
				Error: "the model returned an empty summary — try again"})
			return
		}
		if err := s.Store.ArtifactSet(background,
			store.ArtifactThreadSummary, threadID, summary, modelName); err != nil {
			log.Printf("cache summary: %v", err)
		}
		s.emit(StreamChunk{RequestID: requestID, Chunk: summary})
		s.emit(StreamChunk{RequestID: requestID, Done: true})
	}()
	return requestID, nil
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
		fmt.Sprintf("You draft email replies for %s <%s>. Write only the reply body "+
			"as plain text — no subject line, no quoted original, no signature "+
			"placeholders, no markdown. Match the thread's tone and language; be "+
			"concise.", account.DisplayName, account.Email),
		text,
		400,
		nil,
	)
}

// ComposeInstructed streams an email body written strictly from the user's
// instructions. replyToMessageID (0 for fresh mail) pulls in the thread as
// context so replies reference the right things — but the instructions alone
// decide what the email says.
func (s *Service) ComposeInstructed(ctx context.Context, accountID string, replyToMessageID int64, instructions string) (string, error) {
	account, err := s.Store.GetAccount(ctx, accountID)
	if err != nil {
		return "", err
	}
	firstName := account.DisplayName
	if fields := strings.Fields(firstName); len(fields) > 0 {
		firstName = fields[0]
	}

	threadContext := ""
	if replyToMessageID != 0 {
		if message, err := s.Store.GetMessage(ctx, replyToMessageID); err == nil {
			if text, err := s.threadText(ctx, message.AccountID, message.ThreadID); err == nil {
				threadContext = text
			}
		}
	}

	system := fmt.Sprintf(
		"You write emails on behalf of %s <%s>. The user's instructions define "+
			"WHAT the email says — write exactly that and nothing more. Rules:\n"+
			"- Never add extra points, offers, pleasantries, questions, or invented "+
			"details beyond the instructions.\n"+
			"- The email's length mirrors the instructions: a one-line instruction "+
			"means a one-or-two-sentence email.\n"+
			"- The only additions allowed are a natural greeting and a brief "+
			"sign-off ending with \"%s\".\n"+
			"- Plain text only: no subject line, no markdown, no commentary.\n"+
			"- When a thread is provided, use it only for context (names, tone, "+
			"what's being referred to) — the instructions still decide the content.",
		account.DisplayName, account.Email, firstName)

	prompt := "Instructions from the sender:\n" + instructions
	if threadContext != "" {
		prompt += "\n\nThe thread being replied to (context only):\n" + threadContext
	}
	return s.streamRequest(system, prompt, 500, nil)
}

// Rewrite streams a reworked version of draft text in the requested tone.
func (s *Service) Rewrite(text, tone string) (string, error) {
	return s.streamRequest(
		fmt.Sprintf("Rewrite the given email draft to be %s. Keep the meaning and any "+
			"factual details. Reply with only the rewritten draft as plain text — "+
			"no markdown, no commentary.", tone),
		text,
		600,
		nil,
	)
}

// Translate streams the text translated into the target language.
func (s *Service) Translate(text, language string) (string, error) {
	return s.streamRequest(
		fmt.Sprintf("Translate the given email into %s. Preserve tone and formatting. "+
			"Reply with only the translation — no commentary.", language),
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
		goai.WithSystem("Extract concrete action items from the email thread. "+
			"Only include real commitments or requests; return an empty list when "+
			"there are none."),
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
		goai.WithSystem("Triage these unread emails. For each id assign priority "+
			"high (needs a response or is time-sensitive), normal, or low "+
			"(newsletters, notifications, promotions), with a reason under 8 words."),
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
		goai.WithSystem("Write a one-line plain-text digest (max 18 words, no "+
			"markdown) for each email: what it is and what, if anything, the "+
			"reader must do."),
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
