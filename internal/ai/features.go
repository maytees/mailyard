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

// SummarizeThread streams a summary (cache-first) and caches the result.
func (s *Service) SummarizeThread(ctx context.Context, accountID, threadID string) (string, error) {
	if cached, err := s.Store.ArtifactGet(ctx, store.ArtifactThreadSummary, threadID); err == nil && cached != "" {
		// Replay the cache through the same streaming channel so the UI has
		// one code path.
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
	config, _ := s.Config(ctx)
	return s.streamRequest(
		"You summarize email threads. Reply with a tight summary in 2-4 sentences, "+
			"then, only if the thread contains explicit questions or deadlines, one short "+
			"line starting with \"Needs:\". No preamble, no markdown headers.",
		text,
		func(full string) {
			if err := s.Store.ArtifactSet(context.Background(),
				store.ArtifactThreadSummary, threadID, full, config.Model); err != nil {
				log.Printf("cache summary: %v", err)
			}
		},
	)
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
		fmt.Sprintf("You draft email replies for %s <%s>. Write only the reply body — "+
			"no subject line, no quoted original, no signature placeholders. Match the "+
			"thread's tone and language; be concise.", account.DisplayName, account.Email),
		text,
		nil,
	)
}

// Rewrite streams a reworked version of draft text in the requested tone.
func (s *Service) Rewrite(text, tone string) (string, error) {
	return s.streamRequest(
		fmt.Sprintf("Rewrite the given email draft to be %s. Keep the meaning and any "+
			"factual details. Reply with only the rewritten draft.", tone),
		text,
		nil,
	)
}

// Translate streams the text translated into the target language.
func (s *Service) Translate(text, language string) (string, error) {
	return s.streamRequest(
		fmt.Sprintf("Translate the given email into %s. Preserve tone and formatting. "+
			"Reply with only the translation.", language),
		text,
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
		goai.WithSystem("Write a one-line digest (max 18 words) for each email: "+
			"what it is and what, if anything, the reader must do."),
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
