package store

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"
)

const messageColumns = `
	m.id, m.account_id, m.folder_id, m.uid, m.message_id, m.refs, m.thread_id,
	m.subject, m.from_name, m.from_email, m.to_json, m.cc_json, m.date,
	m.snippet, m.is_unread, m.is_starred, m.is_answered, m.has_attachments,
	m.size, m.snoozed_until`

func scanMessage(row interface{ Scan(...any) error }) (Message, error) {
	var m Message
	var toJSON, ccJSON string
	err := row.Scan(&m.ID, &m.AccountID, &m.FolderID, &m.UID, &m.MessageID,
		&m.Refs, &m.ThreadID, &m.Subject, &m.From.Name, &m.From.Email,
		&toJSON, &ccJSON, &m.Date, &m.Snippet, &m.Unread, &m.Starred,
		&m.Answered, &m.HasAttachments, &m.Size, &m.SnoozedUntil)
	if err != nil {
		return Message{}, err
	}
	if err := json.Unmarshal([]byte(toJSON), &m.To); err != nil {
		return Message{}, fmt.Errorf("message %d to_json: %w", m.ID, err)
	}
	if err := json.Unmarshal([]byte(ccJSON), &m.Cc); err != nil {
		return Message{}, fmt.Errorf("message %d cc_json: %w", m.ID, err)
	}
	return m, nil
}

// UpsertMessage inserts a synced message (resolving its thread) or, when the
// (folder, uid) pair already exists, refreshes its server-owned flags.
// Returns the local message id and whether a new row was inserted (so the
// sync engine knows to store the body and attachments exactly once).
func (s *Store) UpsertMessage(ctx context.Context, m Message) (int64, bool, error) {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return 0, false, err
	}
	defer tx.Rollback()

	var existingID int64
	err = tx.QueryRowContext(ctx,
		`SELECT id FROM messages WHERE folder_id = ? AND uid = ?`,
		m.FolderID, m.UID).Scan(&existingID)
	switch {
	case err == nil:
		// Already synced — only flags can have changed on the server.
		if _, err := tx.ExecContext(ctx, `
			UPDATE messages SET is_unread = ?, is_starred = ?, is_answered = ?
			WHERE id = ?`,
			m.Unread, m.Starred, m.Answered, existingID); err != nil {
			return 0, false, err
		}
		if err := tx.Commit(); err != nil {
			return 0, false, err
		}
		return existingID, false, nil
	case !errors.Is(err, sql.ErrNoRows):
		return 0, false, err
	}

	threadID, err := resolveThreadTx(ctx, tx, m.AccountID, m.MessageID, m.Refs)
	if err != nil {
		return 0, false, err
	}

	toJSON, err := json.Marshal(orEmpty(m.To))
	if err != nil {
		return 0, false, err
	}
	ccJSON, err := json.Marshal(orEmpty(m.Cc))
	if err != nil {
		return 0, false, err
	}

	var id int64
	if err := tx.QueryRowContext(ctx, `
		INSERT INTO messages
			(account_id, folder_id, uid, message_id, refs, thread_id, subject,
			 from_name, from_email, to_json, cc_json, date, snippet,
			 is_unread, is_starred, is_answered, has_attachments, size, snoozed_until)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		RETURNING id`,
		m.AccountID, m.FolderID, m.UID, m.MessageID, m.Refs, threadID,
		m.Subject, m.From.Name, m.From.Email, string(toJSON), string(ccJSON),
		m.Date, m.Snippet, m.Unread, m.Starred, m.Answered,
		m.HasAttachments, m.Size, m.SnoozedUntil).Scan(&id); err != nil {
		return 0, false, err
	}

	// Seed the search index; the body column fills in when the body syncs.
	if _, err := tx.ExecContext(ctx, `
		INSERT INTO messages_fts (rowid, subject, sender, body)
		VALUES (?, ?, ?, '')`,
		id, m.Subject, m.From.Name+" "+m.From.Email); err != nil {
		return 0, false, err
	}

	if err := tx.Commit(); err != nil {
		return 0, false, err
	}
	return id, true, nil
}

func orEmpty(addrs []Address) []Address {
	if addrs == nil {
		return []Address{}
	}
	return addrs
}

// resolveThreadTx picks a thread for a new message: reuse the thread of any
// message it references — or of any already-synced reply that references it
// (children can arrive first) — else start a fresh thread. Divergent threads
// discovered along the way are unified.
func resolveThreadTx(ctx context.Context, tx *sql.Tx, accountID, messageID, refs string) (string, error) {
	candidates := []string{}
	seen := map[string]bool{}
	collect := func(rows *sql.Rows, err error) error {
		if err != nil {
			return err
		}
		defer rows.Close()
		for rows.Next() {
			var threadID string
			if err := rows.Scan(&threadID); err != nil {
				return err
			}
			if !seen[threadID] {
				seen[threadID] = true
				candidates = append(candidates, threadID)
			}
		}
		return rows.Err()
	}

	refList := strings.Fields(refs)
	if len(refList) > 0 {
		placeholders := strings.TrimSuffix(strings.Repeat("?,", len(refList)), ",")
		args := []any{accountID}
		for _, ref := range refList {
			args = append(args, ref)
		}
		if err := collect(tx.QueryContext(ctx, `
			SELECT DISTINCT thread_id FROM messages
			WHERE account_id = ? AND message_id IN (`+placeholders+`)
			ORDER BY thread_id`, args...)); err != nil {
			return "", err
		}
	}
	if messageID != "" {
		if err := collect(tx.QueryContext(ctx, `
			SELECT DISTINCT thread_id FROM messages
			WHERE account_id = ? AND (message_id = ? OR instr(refs, ?) > 0)
			ORDER BY thread_id`, accountID, messageID, messageID)); err != nil {
			return "", err
		}
	}

	if len(candidates) == 0 {
		if messageID != "" {
			return messageID, nil
		}
		buf := make([]byte, 16)
		if _, err := rand.Read(buf); err != nil {
			return "", err
		}
		return "t-" + hex.EncodeToString(buf), nil
	}

	chosen := candidates[0]
	for _, other := range candidates[1:] {
		if _, err := tx.ExecContext(ctx, `
			UPDATE messages SET thread_id = ? WHERE account_id = ? AND thread_id = ?`,
			chosen, accountID, other); err != nil {
			return "", err
		}
	}
	return chosen, nil
}

func (s *Store) GetMessage(ctx context.Context, id int64) (Message, error) {
	row := s.db.QueryRowContext(ctx,
		`SELECT `+messageColumns+` FROM messages m WHERE m.id = ?`, id)
	m, err := scanMessage(row)
	if errors.Is(err, sql.ErrNoRows) {
		return Message{}, fmt.Errorf("message %d not found", id)
	}
	return m, err
}

// ListMessages returns a page of the newest-first message list for the
// filter. Snoozed messages stay hidden until their wake time passes.
func (s *Store) ListMessages(ctx context.Context, f ListFilter) ([]Message, error) {
	if f.Limit <= 0 {
		f.Limit = 50
	}
	role := f.FolderRole
	if role == "" {
		role = RoleInbox
	}

	query := `SELECT ` + messageColumns + `
		FROM messages m JOIN folders fo ON fo.id = m.folder_id
		WHERE fo.role = ? AND m.snoozed_until <= ?`
	args := []any{role, time.Now().Unix()}
	if f.AccountID != "" {
		query += ` AND m.account_id = ?`
		args = append(args, f.AccountID)
	}
	query += ` ORDER BY m.date DESC, m.id DESC LIMIT ? OFFSET ?`
	args = append(args, f.Limit, f.Offset)

	return s.queryMessages(ctx, query, args...)
}

// SnoozeMessage hides a message from lists until the wake time (0 unsnoozes).
func (s *Store) SnoozeMessage(ctx context.Context, id int64, until int64) error {
	_, err := s.db.ExecContext(ctx,
		`UPDATE messages SET snoozed_until = ? WHERE id = ?`, until, id)
	return err
}

// UnreadIDs lists the unread message ids matching the filter (mark-all-read).
func (s *Store) UnreadIDs(ctx context.Context, f ListFilter) ([]int64, error) {
	role := f.FolderRole
	if role == "" {
		role = RoleInbox
	}
	query := `SELECT m.id FROM messages m JOIN folders fo ON fo.id = m.folder_id
		WHERE fo.role = ? AND m.is_unread = 1`
	args := []any{role}
	if f.AccountID != "" {
		query += ` AND m.account_id = ?`
		args = append(args, f.AccountID)
	}
	rows, err := s.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	ids := []int64{}
	for rows.Next() {
		var id int64
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		ids = append(ids, id)
	}
	return ids, rows.Err()
}

// GetThread returns every message in a thread, oldest first (reading order).
func (s *Store) GetThread(ctx context.Context, accountID, threadID string) ([]Message, error) {
	return s.queryMessages(ctx, `
		SELECT `+messageColumns+` FROM messages m
		WHERE m.account_id = ? AND m.thread_id = ?
		ORDER BY m.date ASC, m.id ASC`, accountID, threadID)
}

func (s *Store) queryMessages(ctx context.Context, query string, args ...any) ([]Message, error) {
	rows, err := s.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	messages := []Message{}
	for rows.Next() {
		m, err := scanMessage(rows)
		if err != nil {
			return nil, err
		}
		messages = append(messages, m)
	}
	return messages, rows.Err()
}

// UnreadCounts maps account id → unread inbox messages.
func (s *Store) UnreadCounts(ctx context.Context) (map[string]int, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT m.account_id, COUNT(*)
		FROM messages m JOIN folders fo ON fo.id = m.folder_id
		WHERE fo.role = ? AND m.is_unread = 1
		GROUP BY m.account_id`, RoleInbox)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	counts := map[string]int{}
	for rows.Next() {
		var accountID string
		var count int
		if err := rows.Scan(&accountID, &count); err != nil {
			return nil, err
		}
		counts[accountID] = count
	}
	return counts, rows.Err()
}

func (s *Store) SetUnread(ctx context.Context, messageIDs []int64, unread bool) error {
	return s.setFlag(ctx, "is_unread", messageIDs, unread)
}

func (s *Store) SetStarred(ctx context.Context, messageIDs []int64, starred bool) error {
	return s.setFlag(ctx, "is_starred", messageIDs, starred)
}

func (s *Store) SetAnswered(ctx context.Context, messageIDs []int64, answered bool) error {
	return s.setFlag(ctx, "is_answered", messageIDs, answered)
}

func (s *Store) setFlag(ctx context.Context, column string, messageIDs []int64, value bool) error {
	if len(messageIDs) == 0 {
		return nil
	}
	placeholders := strings.TrimSuffix(strings.Repeat("?,", len(messageIDs)), ",")
	args := []any{value}
	for _, id := range messageIDs {
		args = append(args, id)
	}
	// column is one of our own constants, never user input.
	_, err := s.db.ExecContext(ctx,
		`UPDATE messages SET `+column+` = ? WHERE id IN (`+placeholders+`)`,
		args...)
	return err
}

// MoveMessage relocates a message after a server-side move gave it a new
// folder and UID.
func (s *Store) MoveMessage(ctx context.Context, id, newFolderID int64, newUID uint32) error {
	_, err := s.db.ExecContext(ctx,
		`UPDATE messages SET folder_id = ?, uid = ? WHERE id = ?`,
		newFolderID, newUID, id)
	return err
}

// DeleteFolderMessages wipes a folder's local mail — used when the server
// reports a UIDVALIDITY change, which invalidates every stored UID.
func (s *Store) DeleteFolderMessages(ctx context.Context, folderID int64) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if _, err := tx.ExecContext(ctx, `
		DELETE FROM messages_fts WHERE rowid IN
			(SELECT id FROM messages WHERE folder_id = ?)`, folderID); err != nil {
		return err
	}
	if _, err := tx.ExecContext(ctx,
		`DELETE FROM messages WHERE folder_id = ?`, folderID); err != nil {
		return err
	}
	return tx.Commit()
}

// UIDFlags is the per-message state the sync engine reconciles against the
// server's FLAGS fetch.
type UIDFlags struct {
	ID       int64
	Unread   bool
	Starred  bool
	Answered bool
}

// FolderUIDFlags maps every synced UID in a folder to its local flag state.
func (s *Store) FolderUIDFlags(ctx context.Context, folderID int64) (map[uint32]UIDFlags, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT uid, id, is_unread, is_starred, is_answered
		FROM messages WHERE folder_id = ?`, folderID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	flags := map[uint32]UIDFlags{}
	for rows.Next() {
		var uid uint32
		var f UIDFlags
		if err := rows.Scan(&uid, &f.ID, &f.Unread, &f.Starred, &f.Answered); err != nil {
			return nil, err
		}
		flags[uid] = f
	}
	return flags, rows.Err()
}

func (s *Store) DeleteMessage(ctx context.Context, id int64) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if _, err := tx.ExecContext(ctx,
		`DELETE FROM messages_fts WHERE rowid = ?`, id); err != nil {
		return err
	}
	if _, err := tx.ExecContext(ctx,
		`DELETE FROM messages WHERE id = ?`, id); err != nil {
		return err
	}
	return tx.Commit()
}

// SetMessageBody stores the parsed body and refreshes the search index row.
func (s *Store) SetMessageBody(ctx context.Context, messageID int64, textBody, htmlSanitized string) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	if _, err := tx.ExecContext(ctx, `
		INSERT INTO message_bodies (message_id, text_body, html_sanitized)
		VALUES (?, ?, ?)
		ON CONFLICT(message_id) DO UPDATE SET
			text_body = excluded.text_body,
			html_sanitized = excluded.html_sanitized`,
		messageID, textBody, htmlSanitized); err != nil {
		return err
	}

	var subject, sender string
	if err := tx.QueryRowContext(ctx,
		`SELECT subject, from_name || ' ' || from_email FROM messages WHERE id = ?`,
		messageID).Scan(&subject, &sender); err != nil {
		return err
	}
	if _, err := tx.ExecContext(ctx,
		`DELETE FROM messages_fts WHERE rowid = ?`, messageID); err != nil {
		return err
	}
	if _, err := tx.ExecContext(ctx, `
		INSERT INTO messages_fts (rowid, subject, sender, body)
		VALUES (?, ?, ?, ?)`,
		messageID, subject, sender, textBody); err != nil {
		return err
	}
	return tx.Commit()
}

func (s *Store) GetMessageBody(ctx context.Context, messageID int64) (MessageBody, error) {
	body := MessageBody{MessageID: messageID}
	err := s.db.QueryRowContext(ctx,
		`SELECT text_body, html_sanitized FROM message_bodies WHERE message_id = ?`,
		messageID).Scan(&body.TextBody, &body.HTMLSanitized)
	if errors.Is(err, sql.ErrNoRows) {
		// Body not synced yet — callers treat empty as "fetch from server".
		return body, nil
	}
	return body, err
}

func (s *Store) UpsertAttachment(ctx context.Context, a Attachment, data []byte) (int64, error) {
	var id int64
	err := s.db.QueryRowContext(ctx, `
		INSERT INTO attachments (message_id, filename, mime_type, size, content_id, data)
		VALUES (?, ?, ?, ?, ?, ?) RETURNING id`,
		a.MessageID, a.Filename, a.MimeType, a.Size, a.ContentID, data).Scan(&id)
	return id, err
}

func (s *Store) ListAttachments(ctx context.Context, messageID int64) ([]Attachment, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT id, message_id, filename, mime_type, size, content_id
		FROM attachments WHERE message_id = ? ORDER BY id`, messageID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	attachments := []Attachment{}
	for rows.Next() {
		var a Attachment
		if err := rows.Scan(&a.ID, &a.MessageID, &a.Filename, &a.MimeType,
			&a.Size, &a.ContentID); err != nil {
			return nil, err
		}
		attachments = append(attachments, a)
	}
	return attachments, rows.Err()
}

func (s *Store) GetAttachment(ctx context.Context, id int64) (Attachment, error) {
	var a Attachment
	err := s.db.QueryRowContext(ctx, `
		SELECT id, message_id, filename, mime_type, size, content_id
		FROM attachments WHERE id = ?`, id).
		Scan(&a.ID, &a.MessageID, &a.Filename, &a.MimeType, &a.Size, &a.ContentID)
	if errors.Is(err, sql.ErrNoRows) {
		return Attachment{}, fmt.Errorf("attachment %d not found", id)
	}
	return a, err
}

// AttachmentData returns the stored bytes (nil when not yet downloaded).
func (s *Store) AttachmentData(ctx context.Context, id int64) ([]byte, error) {
	var data []byte
	err := s.db.QueryRowContext(ctx,
		`SELECT data FROM attachments WHERE id = ?`, id).Scan(&data)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, fmt.Errorf("attachment %d not found", id)
	}
	return data, err
}

func (s *Store) SetAttachmentData(ctx context.Context, id int64, data []byte) error {
	_, err := s.db.ExecContext(ctx,
		`UPDATE attachments SET data = ?, size = ? WHERE id = ?`,
		data, len(data), id)
	return err
}
