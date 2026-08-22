package store

import (
	"context"
	"strings"
)

// Search runs a prefix full-text search over subject, sender and body,
// best matches first. accountID narrows to one account when non-empty.
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
	sqlQuery += ` ORDER BY bm25(messages_fts, 10.0, 5.0, 1.0) LIMIT ?`
	args = append(args, limit)

	return s.queryMessages(ctx, sqlQuery, args...)
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
