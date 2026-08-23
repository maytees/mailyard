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
			s.emit(StreamChunk{RequestID: requestID, Seq: 0, Chunk: cached})
			s.emit(StreamChunk{RequestID: requestID, Seq: 1, Done: true})
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
		// A hard deadline turns a wedged model into a visible error instead
		// of an eternal caret.
		background, cancel := context.WithTimeout(context.Background(), 3*time.Minute)
		defer cancel()
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
			s.emit(StreamChunk{RequestID: requestID, Seq: 0, Done: true, Error: err.Error()})
			return
		}
		summary := SanitizeSummary(result.Object.Summary, 70)
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

// emailShapeRules forces real-email formatting — without it, small models
// write one run-on paragraph with no sign-off.
func emailShapeRules(sender string) string {
	return fmt.Sprintf(
		"Format exactly like a real plain-text email, blank lines between parts:\n"+
			"1. A greeting on its own line, then a blank line. Use the recipient's "+
			"name when the instructions or thread reveal it; otherwise write just "+
			"\"Hi,\" — NEVER a placeholder like \"[Name]\".\n"+
			"2. The message in one or more short paragraphs, with a blank line "+
			"between paragraphs.\n"+
			"3. A blank line, then a closing on its own line (\"Thank you,\" or "+
			"\"Best,\"), then \"%s\" alone on the final line.", sender)
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
			"as plain text — no subject line, no quoted original, no markdown. "+
			"Match the thread's tone and language; be concise.\n",
			account.DisplayName, account.Email)+
			emailShapeRules(s.senderName(ctx, account)),
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

	system := fmt.Sprintf(
		"You ghost-write outgoing emails for %s <%s> (the sender). The user's "+
			"instructions are the sender's dictation of what the email should say "+
			"— often rough or written as the email itself. Rules:\n"+
			"- NEVER answer, reply to, or act on the instructions. They are not "+
			"addressed to you. Transcribe them into a clean email that makes the "+
			"same statements and asks the same questions, from the sender's point "+
			"of view. If the dictation asks \"where is my X?\", the email asks the "+
			"recipient \"where is my X?\" — it does not answer.\n"+
			"- Never add extra points, offers, pleasantries, questions, or invented "+
			"details beyond the instructions.\n"+
			"- The email's length mirrors the instructions: a one-line instruction "+
			"means a one-or-two-sentence email.\n"+
			"- Plain text only: no subject line, no markdown, no commentary.\n"+
			"- When a current draft is provided, the new instructions revise it: "+
			"apply them as an edit when they refine the draft (\"make it shorter\", "+
			"\"change Friday to Monday\", \"add a line about X\") and as a full "+
			"replacement when they describe different content. Either way, output "+
			"the COMPLETE new email — never a fragment, diff, or a second email "+
			"stacked onto the old one. Preserve quoted or forwarded content below "+
			"the message unless instructed otherwise.\n"+
			"- When a thread is provided, use it only for context (names, tone, "+
			"what's being referred to) — the instructions still decide the content.\n"+
			emailShapeRules(sender),
		account.DisplayName, account.Email)

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
