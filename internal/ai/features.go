package ai

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"strconv"
	"strings"
	"time"

	"github.com/zendev-sh/goai"
	"github.com/zendev-sh/goai/provider"

	"mailyard/internal/store"
)

// rejectsTemperature detects a model refusing the temperature parameter.
// OpenAI's reasoning family (o-series, GPT-5, Luna) pins temperature at 1
// and 400s on anything else: "Unsupported parameter: 'temperature' is not
// supported with this model."
func rejectsTemperature(err error) bool {
	text := strings.ToLower(err.Error())
	return strings.Contains(text, "temperature") &&
		(strings.Contains(text, "unsupported") || strings.Contains(text, "not supported"))
}

// generateDeterministic runs GenerateText at temperature 0 (the extraction/
// classification policy), retrying once without the parameter for models
// that reject it. A failed first attempt is a 400 before generation — it
// costs nothing.
func generateDeterministic(ctx context.Context, model provider.LanguageModel, base ...goai.Option) (*goai.TextResult, error) {
	withTemp := append(append([]goai.Option{}, base...), goai.WithTemperature(0))
	result, err := goai.GenerateText(ctx, model, withTemp...)
	if err != nil && rejectsTemperature(err) {
		result, err = goai.GenerateText(ctx, model, base...)
	}
	return result, err
}

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
		result, err := generateDeterministic(background, model, options...)
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

// DraftReply streams the one-click reply. Answer-or-defer is the prompt's
// core rule: everything not established by the thread gets acknowledged and
// deferred, never invented — a wrong commitment sent after a skim is this
// feature's worst failure. Thin tagged user turn keeps the system prompt
// cached.
func (s *Service) DraftReply(ctx context.Context, accountID, threadID string) (string, error) {
	threadXML, err := s.threadXML(ctx, accountID, threadID)
	if err != nil {
		return "", err
	}
	account, err := s.Store.GetAccount(ctx, accountID)
	if err != nil {
		return "", err
	}
	prompt := "<owner>" + account.Email + "</owner>\n" + threadXML +
		"\n\nDraft the reply."
	return s.streamRequest(
		s.promptText(ctx, "draft-reply", map[string]string{
			"mailbox_name":  account.DisplayName,
			"mailbox_email": account.Email,
			"your_name":     s.senderName(ctx, account),
		}),
		prompt,
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

// ComposeInstructed streams an email body written from the user's rough
// input (dictation or instructions — the prompt treats both the same).
// With a current draft, the input revises it and the model streams the
// complete new email. User turn stays thin (tags + one-line task) so the
// example-laden system prompt caches.
func (s *Service) ComposeInstructed(ctx context.Context, req ComposeRequest) (string, error) {
	account, err := s.Store.GetAccount(ctx, req.AccountID)
	if err != nil {
		return "", err
	}

	system := s.promptText(ctx, "compose", map[string]string{
		"mailbox_name":  account.DisplayName,
		"mailbox_email": account.Email,
		"your_name":     s.senderName(ctx, account),
	})

	// Spec order: thread (context), draft (revision base), input, task.
	// PriorInstructions is deliberately unused — the draft itself carries
	// the cumulative state.
	parts := []string{}
	if req.ReplyToMessageID != 0 {
		if message, err := s.Store.GetMessage(ctx, req.ReplyToMessageID); err == nil {
			if xml, err := s.threadXML(ctx, message.AccountID, message.ThreadID); err == nil {
				parts = append(parts, xml)
			}
		}
	}
	if req.CurrentDraft != "" {
		parts = append(parts, "<draft>\n"+req.CurrentDraft+"\n</draft>")
	}
	parts = append(parts, "<input>\n"+req.Instructions+"\n</input>")
	prompt := strings.Join(parts, "\n\n") + "\n\nWrite the email."

	return s.streamRequest(system, prompt, 600, nil)
}

// Rewrite streams the draft re-registered in the requested tone. The tone
// rides in the user turn so all three buttons share one cached system
// prompt.
func (s *Service) Rewrite(ctx context.Context, text, tone string) (string, error) {
	prompt := "<draft>\n" + text + "\n</draft>\n\nRewrite this draft to be " + tone + "."
	return s.streamRequest(
		s.promptText(ctx, "rewrite", nil),
		prompt,
		600,
		nil,
	)
}

// Translate streams the email translated into the target language. The
// language rides in the user turn so one static system prompt caches for
// every language.
func (s *Service) Translate(ctx context.Context, text, language string) (string, error) {
	prompt := "<email>\n" + text + "\n</email>\n\nTranslate this email into " + language + "."
	return s.streamRequest(
		s.promptText(ctx, "translate", nil),
		prompt,
		1200,
		nil,
	)
}

// extractedItem matches the prompt's output schema.
type extractedItem struct {
	Task  string  `json:"task"`
	Owner string  `json:"owner"`
	Due   *string `json:"due"`
}

// jsonArrayText digs the JSON array out of model output defensively:
// markdown fences stripped and the array located even if a model wraps it
// in prose.
func jsonArrayText(raw string) string {
	text := strings.TrimSpace(raw)
	text = strings.TrimPrefix(text, "```json")
	text = strings.TrimPrefix(text, "```")
	text = strings.TrimSuffix(text, "```")
	text = strings.TrimSpace(text)
	if !strings.HasPrefix(text, "[") {
		start := strings.Index(text, "[")
		end := strings.LastIndex(text, "]")
		if start >= 0 && end > start {
			text = text[start : end+1]
		}
	}
	return text
}

func parseActionItems(raw string) ([]extractedItem, error) {
	var items []extractedItem
	if err := json.Unmarshal([]byte(jsonArrayText(raw)), &items); err != nil {
		return nil, fmt.Errorf("parse action items: %w", err)
	}
	return items, nil
}

// ActionItems extracts a thread's open action items (temperature 0, like
// triage — it's extraction), persists them (open rows replaced, done rows
// kept as history), and returns the thread's current checklist.
func (s *Service) ActionItems(ctx context.Context, accountID, threadID string) ([]store.ActionItemRow, error) {
	account, err := s.Store.GetAccount(ctx, accountID)
	if err != nil {
		return nil, err
	}
	threadXML, err := s.threadXML(ctx, accountID, threadID)
	if err != nil {
		return nil, err
	}
	config, err := s.Config(ctx)
	if err != nil {
		return nil, err
	}
	model, _, err := s.model(ctx)
	if err != nil {
		return nil, err
	}

	prompt := "<owner>" + account.Email + "</owner>\n" + threadXML +
		"\n\nExtract the action items."
	options := []goai.Option{
		goai.WithSystem(s.promptText(ctx, "action-items", nil)),
		goai.WithPrompt(prompt),
		goai.WithMaxOutputTokens(600),
	}
	if config.Provider == "ollama" {
		options = append(options, goai.WithProviderOptions(map[string]any{"think": false}))
	}
	result, err := generateDeterministic(ctx, model, options...)
	if err != nil {
		return nil, err
	}
	extracted, err := parseActionItems(result.Text)
	if err != nil {
		return nil, err
	}

	rows := make([]store.ActionItemRow, 0, len(extracted))
	for _, item := range extracted {
		if strings.TrimSpace(item.Task) == "" {
			continue
		}
		owner := strings.TrimSpace(item.Owner)
		if owner == "" {
			owner = "you"
		}
		due := ""
		if item.Due != nil {
			due = strings.TrimSpace(*item.Due)
		}
		rows = append(rows, store.ActionItemRow{
			Task: strings.TrimSpace(item.Task), Owner: owner, Due: due,
		})
	}
	if err := s.Store.ReplaceActionItems(ctx, accountID, threadID, rows); err != nil {
		return nil, err
	}
	return s.Store.ListActionItems(ctx, accountID, threadID)
}

// TriageResult labels one inbox message.
type TriageResult struct {
	MessageID int64  `json:"messageId"`
	Priority  string `json:"priority"` // high | normal | low
	Reason    string `json:"reason"`
}

// triagedEmail matches the prompt's output schema (reason before priority —
// the model commits to its rationale before the label). Some models emit the
// id back as a number, so it decodes both.
type triagedEmail struct {
	ID       flexibleID `json:"id"`
	Reason   string     `json:"reason"`
	Priority string     `json:"priority"`
}

type flexibleID string

func (f *flexibleID) UnmarshalJSON(b []byte) error {
	var s string
	if err := json.Unmarshal(b, &s); err == nil {
		*f = flexibleID(s)
		return nil
	}
	var n json.Number
	if err := json.Unmarshal(b, &n); err != nil {
		return err
	}
	*f = flexibleID(n.String())
	return nil
}

// TriageInbox classifies recent unread inbox mail by priority and caches the
// labels as artifacts (list badges read them back). Full tagged emails, not
// previews: priority comes from what the body asks of the owner, and the
// injection framing needs the tag boundaries.
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
	requested := map[string]int64{}
	for _, id := range unreadIDs {
		message, err := s.Store.GetMessage(ctx, id)
		if err != nil {
			continue
		}
		body := message.Snippet
		if full, err := s.Store.GetMessageBody(ctx, id); err == nil && full.TextBody != "" {
			body = CleanBody(full.TextBody)
		}
		if len(body) > 600 {
			body = body[:600] + "…"
		}
		idText := strconv.FormatInt(message.ID, 10)
		requested[idText] = message.ID
		fmt.Fprintf(&b, "<email id=%q>\n\t<from>%s <%s></from>\n\t<subject>%s</subject>\n\t<body>\n%s\n\t</body>\n</email>\n",
			idText, message.From.Name, message.From.Email, message.Subject, body)
	}
	b.WriteString("\nTriage these emails.")

	config, err := s.Config(ctx)
	if err != nil {
		return nil, err
	}
	model, _, err := s.model(ctx)
	if err != nil {
		return nil, err
	}
	options := []goai.Option{
		goai.WithSystem(s.promptText(ctx, "triage", nil)),
		goai.WithPrompt(b.String()),
		goai.WithMaxOutputTokens(2000),
	}
	if config.Provider == "ollama" {
		options = append(options, goai.WithProviderOptions(map[string]any{"think": false}))
	}
	result, err := generateDeterministic(ctx, model, options...)
	if err != nil {
		return nil, err
	}

	var labeled []triagedEmail
	if err := json.Unmarshal([]byte(jsonArrayText(result.Text)), &labeled); err != nil {
		return nil, fmt.Errorf("parse triage labels: %w", err)
	}

	results := make([]TriageResult, 0, len(labeled))
	for _, item := range labeled {
		messageID, ok := requested[string(item.ID)]
		if !ok {
			continue // hallucinated or duplicate id — never label the wrong mail
		}
		delete(requested, string(item.ID))
		priority := strings.ToLower(strings.TrimSpace(item.Priority))
		if priority != "high" && priority != "normal" && priority != "low" {
			priority = "normal"
		}
		if err := s.Store.ArtifactSet(ctx, store.ArtifactTriage,
			strconv.FormatInt(messageID, 10), priority+"|"+item.Reason, ""); err != nil {
			return nil, err
		}
		results = append(results, TriageResult{
			MessageID: messageID, Priority: priority, Reason: item.Reason,
		})
	}
	return results, nil
}

// SuggestUnsubscribes is heuristic (List-Unsubscribe headers + sender
// volume) — no model call needed.
func (s *Service) SuggestUnsubscribes(ctx context.Context) ([]store.UnsubscribeCandidate, error) {
	return s.Store.UnsubscribeCandidates(ctx, 20)
}

// digestedEmail matches the prompt's output schema.
type digestedEmail struct {
	ID     flexibleID `json:"id"`
	Digest string     `json:"digest"`
}

// GenerateListSummaries backfills one-line digests for recent inbox messages
// missing them (the opt-in list-row summaries). Digests cache by message id
// and never expire — the email doesn't change. Returns how many were made.
func (s *Service) GenerateListSummaries(ctx context.Context, limit int) (int, error) {
	messages, err := s.Store.MessagesWithoutArtifact(ctx, store.ArtifactMessageSummary, limit)
	if err != nil || len(messages) == 0 {
		return 0, err
	}

	var b strings.Builder
	requested := map[string]int64{}
	for _, message := range messages {
		body := message.Snippet
		if full, err := s.Store.GetMessageBody(ctx, message.ID); err == nil && full.TextBody != "" {
			body = CleanBody(full.TextBody)
		}
		if len(body) > 1200 {
			body = body[:1200] + "…"
		}
		idText := strconv.FormatInt(message.ID, 10)
		requested[idText] = message.ID
		fmt.Fprintf(&b, "<email id=%q>\n\t<from>%s <%s></from>\n\t<subject>%s</subject>\n\t<body>\n%s\n\t</body>\n</email>\n",
			idText, message.From.Name, message.From.Email, message.Subject, body)
	}
	b.WriteString("\nWrite the digests.")

	config, err := s.Config(ctx)
	if err != nil {
		return 0, err
	}
	model, _, err := s.model(ctx)
	if err != nil {
		return 0, err
	}
	options := []goai.Option{
		goai.WithSystem(s.promptText(ctx, "list-digest", nil)),
		goai.WithPrompt(b.String()),
		goai.WithMaxOutputTokens(2000),
	}
	if config.Provider == "ollama" {
		options = append(options, goai.WithProviderOptions(map[string]any{"think": false}))
	}
	result, err := generateDeterministic(ctx, model, options...)
	if err != nil {
		return 0, err
	}

	var digests []digestedEmail
	if err := json.Unmarshal([]byte(jsonArrayText(result.Text)), &digests); err != nil {
		return 0, fmt.Errorf("parse digests: %w", err)
	}

	count := 0
	for _, item := range digests {
		messageID, ok := requested[string(item.ID)]
		if !ok || strings.TrimSpace(item.Digest) == "" {
			continue // hallucinated or duplicate id — never caption the wrong mail
		}
		delete(requested, string(item.ID))
		if err := s.Store.ArtifactSet(ctx, store.ArtifactMessageSummary,
			strconv.FormatInt(messageID, 10), strings.TrimSpace(item.Digest), ""); err != nil {
			return count, err
		}
		count++
	}
	return count, nil
}
