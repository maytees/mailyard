package store

import (
	"context"
	"strings"
)

// Search runs a prefix full-text search over subject, sender and body,
// best matches first. accountID narrows to one account when non-empty.
// Results are deduplicated by Message-ID: Gmail keeps a second copy of every
// message in All Mail (our archive role), which would double every hit.
func (s *Store) Search(ctx context.Context, query, accountID string, limit int) ([]Message, error) {
	match := ftsMatchQuery(query)
	if match == "" {
		return []Message{}, nil
	}
	if limit <= 0 {
		limit = 20
	}

	sqlQuery := `SELECT ` + messageColumns + `
		FROM messages_fts
		JOIN messages m ON m.id = messages_fts.rowid
		WHERE messages_fts MATCH ?`
	args := []any{match}
	if accountID != "" {
		sqlQuery += ` AND m.account_id = ?`
		args = append(args, accountID)
	}
	// Over-fetch so post-dedupe still fills the requested page.
	sqlQuery += ` ORDER BY bm25(messages_fts, 10.0, 5.0, 1.0) LIMIT ?`
	args = append(args, limit*2)

	messages, err := s.queryMessages(ctx, sqlQuery, args...)
	if err != nil {
		return nil, err
	}
	deduped := dedupeByMessageID(messages)
	if len(deduped) > limit {
		deduped = deduped[:limit]
	}
	return deduped, nil
}

// dedupeByMessageID keeps the first copy (callers order by relevance or
// date) of each RFC Message-ID; rows without one never collapse. The key is
// deliberately account-blind: an email delivered to two of the user's
// accounts is still one email in unified search, and threads are
// account-scoped already.
func dedupeByMessageID(messages []Message) []Message {
	seen := map[string]bool{}
	result := make([]Message, 0, len(messages))
	for _, message := range messages {
		if message.MessageID == "" || !seen[message.MessageID] {
			seen[message.MessageID] = true
			result = append(result, message)
		}
	}
	return result
}

// ftsMatchQuery turns free text into a safe FTS5 query: each token quoted
// (so syntax characters can't inject operators) and prefix-matched.
func ftsMatchQuery(query string) string {
	tokens := strings.Fields(query)
	parts := make([]string, 0, len(tokens))
	for _, token := range tokens {
		escaped := strings.ReplaceAll(token, `"`, `""`)
		parts = append(parts, `"`+escaped+`"*`)
	}
	return strings.Join(parts, " ")
}
