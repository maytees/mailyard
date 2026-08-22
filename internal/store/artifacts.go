package store

import (
	"context"
	"database/sql"
	"errors"
	"strings"
	"time"
)

// Artifact kinds. ref_id is a thread id or a message id depending on kind.
// thread-summary is versioned: v2 invalidated caches written before the
// prompt was hardened against markdown-essay output from local models.
const (
	ArtifactThreadSummary  = "thread-summary-v2"
	ArtifactMessageSummary = "msg-summary"
	ArtifactTriage         = "triage"
)

// ArtifactSet stores (or replaces) an AI output for a kind/ref pair.
func (s *Store) ArtifactSet(ctx context.Context, kind, refID, content, model string) error {
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO ai_artifacts (kind, ref_id, content, model, created_at)
		VALUES (?, ?, ?, ?, ?)
		ON CONFLICT(kind, ref_id) DO UPDATE SET
			content = excluded.content,
			model = excluded.model,
			created_at = excluded.created_at`,
		kind, refID, content, model, time.Now().Unix())
	return err
}

// ArtifactGet returns the cached content ("" when absent).
func (s *Store) ArtifactGet(ctx context.Context, kind, refID string) (string, error) {
	var content string
	err := s.db.QueryRowContext(ctx,
		`SELECT content FROM ai_artifacts WHERE kind = ? AND ref_id = ?`,
		kind, refID).Scan(&content)
	if errors.Is(err, sql.ErrNoRows) {
		return "", nil
	}
	return content, err
}

// ArtifactsForRefs bulk-fetches one kind for many refs (list-row summaries,
// triage badges).
func (s *Store) ArtifactsForRefs(ctx context.Context, kind string, refIDs []string) (map[string]string, error) {
	result := map[string]string{}
	if len(refIDs) == 0 {
		return result, nil
	}
	placeholders := strings.TrimSuffix(strings.Repeat("?,", len(refIDs)), ",")
	args := []any{kind}
	for _, ref := range refIDs {
		args = append(args, ref)
	}
	rows, err := s.db.QueryContext(ctx, `
		SELECT ref_id, content FROM ai_artifacts
		WHERE kind = ? AND ref_id IN (`+placeholders+`)`, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var ref, content string
		if err := rows.Scan(&ref, &content); err != nil {
			return nil, err
		}
		result[ref] = content
	}
	return result, rows.Err()
}

// MessagesWithoutArtifact lists recent inbox messages that still need a
// generated artifact of the given kind (background list summaries).
func (s *Store) MessagesWithoutArtifact(ctx context.Context, kind string, limit int) ([]Message, error) {
	if limit <= 0 {
		limit = 10
	}
	return s.queryMessages(ctx, `
		SELECT `+messageColumns+`
		FROM messages m
		JOIN folders fo ON fo.id = m.folder_id
		LEFT JOIN ai_artifacts a
			ON a.kind = ? AND a.ref_id = CAST(m.id AS TEXT)
		WHERE fo.role = ? AND a.ref_id IS NULL
		ORDER BY m.date DESC LIMIT ?`, kind, RoleInbox, limit)
}

// UnsubscribeCandidate is a sender worth reviewing: frequent, often unread,
// ideally with a working unsubscribe link.
type UnsubscribeCandidate struct {
	FromEmail      string `json:"fromEmail"`
	FromName       string `json:"fromName"`
	Count          int    `json:"count"`
	UnreadCount    int    `json:"unreadCount"`
	LastDate       int64  `json:"lastDate"`
	UnsubscribeURL string `json:"unsubscribeUrl"`
}

// UnsubscribeCandidates surfaces bulk senders in the inbox: anyone with a
// List-Unsubscribe header, or three-plus messages.
func (s *Store) UnsubscribeCandidates(ctx context.Context, limit int) ([]UnsubscribeCandidate, error) {
	if limit <= 0 {
		limit = 20
	}
	rows, err := s.db.QueryContext(ctx, `
		SELECT m.from_email, MAX(m.from_name), COUNT(*), SUM(m.is_unread),
		       MAX(m.date), MAX(m.list_unsubscribe)
		FROM messages m JOIN folders fo ON fo.id = m.folder_id
		WHERE fo.role = ? AND m.from_email != ''
		GROUP BY m.from_email
		HAVING MAX(m.list_unsubscribe) != '' OR COUNT(*) >= 3
		ORDER BY COUNT(*) DESC, MAX(m.date) DESC
		LIMIT ?`, RoleInbox, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	candidates := []UnsubscribeCandidate{}
	for rows.Next() {
		var c UnsubscribeCandidate
		var header string
		if err := rows.Scan(&c.FromEmail, &c.FromName, &c.Count, &c.UnreadCount,
			&c.LastDate, &header); err != nil {
			return nil, err
		}
		c.UnsubscribeURL = firstHTTPUnsubscribeURL(header)
		candidates = append(candidates, c)
	}
	return candidates, rows.Err()
}

// firstHTTPUnsubscribeURL pulls the first https?: URL out of a
// List-Unsubscribe header ("<mailto:…>, <https://…>").
func firstHTTPUnsubscribeURL(header string) string {
	for _, part := range strings.Split(header, ",") {
		part = strings.Trim(strings.TrimSpace(part), "<>")
		if strings.HasPrefix(part, "http://") || strings.HasPrefix(part, "https://") {
			return part
		}
	}
	return ""
}
