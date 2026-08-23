package store

import (
	"context"
	"fmt"
	"strings"
)

// OtherLabelID is the seeded catch-all: the classifier's abstention target
// and the reassignment home for deleted labels. It cannot be deleted.
const OtherLabelID int64 = 5

// Label is a Gmail-category-style bucket: global across accounts, one per
// message. Definition feeds the classifier prompt verbatim.
type Label struct {
	ID         int64  `json:"id"`
	Name       string `json:"name"`
	Definition string `json:"definition"`
	Color      string `json:"color"`
	Icon       string `json:"icon"`
	SortOrder  int64  `json:"sortOrder"`
	Builtin    bool   `json:"builtin"`
	CreatedBy  string `json:"createdBy"` // user | ai
}

func (s *Store) ListLabels(ctx context.Context) ([]Label, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT id, name, definition, color, icon, sort_order, builtin, created_by
		FROM labels ORDER BY sort_order, id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	labels := []Label{}
	for rows.Next() {
		var l Label
		if err := rows.Scan(&l.ID, &l.Name, &l.Definition, &l.Color, &l.Icon,
			&l.SortOrder, &l.Builtin, &l.CreatedBy); err != nil {
			return nil, err
		}
		labels = append(labels, l)
	}
	return labels, rows.Err()
}

// CreateLabel inserts a label, or returns the existing one when the name is
// already taken (case-insensitive) — the get-or-create the AI path needs.
func (s *Store) CreateLabel(ctx context.Context, l Label) (Label, error) {
	l.Name = strings.TrimSpace(l.Name)
	if l.Name == "" {
		return Label{}, fmt.Errorf("label name is empty")
	}
	if l.Color == "" {
		l.Color = "slate"
	}
	if l.CreatedBy == "" {
		l.CreatedBy = "user"
	}
	if existing, err := s.labelByName(ctx, l.Name); err == nil {
		return existing, nil
	}
	// New labels take Other's slot; the catch-all stays last.
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return Label{}, err
	}
	defer tx.Rollback()
	result, err := tx.ExecContext(ctx, `
		INSERT INTO labels (name, definition, color, icon, sort_order, builtin, created_by)
		VALUES (?, ?, ?, ?,
			(SELECT COALESCE(sort_order, 0) FROM labels WHERE id = ?),
			0, ?)`,
		l.Name, l.Definition, l.Color, l.Icon, OtherLabelID, l.CreatedBy)
	if err != nil {
		return Label{}, err
	}
	if _, err := tx.ExecContext(ctx,
		`UPDATE labels SET sort_order = sort_order + 1 WHERE id = ?`, OtherLabelID); err != nil {
		return Label{}, err
	}
	if l.ID, err = result.LastInsertId(); err != nil {
		return Label{}, err
	}
	return l, tx.Commit()
}

func (s *Store) labelByName(ctx context.Context, name string) (Label, error) {
	row := s.db.QueryRowContext(ctx, `
		SELECT id, name, definition, color, icon, sort_order, builtin, created_by
		FROM labels WHERE name = ? COLLATE NOCASE`, name)
	var l Label
	err := row.Scan(&l.ID, &l.Name, &l.Definition, &l.Color, &l.Icon,
		&l.SortOrder, &l.Builtin, &l.CreatedBy)
	return l, err
}

// UpdateLabel edits name/definition/color/icon. Builtin labels can be edited
// too — retuning a definition retunes the classifier.
func (s *Store) UpdateLabel(ctx context.Context, l Label) error {
	l.Name = strings.TrimSpace(l.Name)
	if l.Name == "" {
		return fmt.Errorf("label name is empty")
	}
	_, err := s.db.ExecContext(ctx, `
		UPDATE labels SET name = ?, definition = ?, color = ?, icon = ? WHERE id = ?`,
		l.Name, l.Definition, l.Color, l.Icon, l.ID)
	return err
}

func (s *Store) ReorderLabels(ctx context.Context, ids []int64) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	for order, id := range ids {
		if _, err := tx.ExecContext(ctx,
			`UPDATE labels SET sort_order = ? WHERE id = ?`, order, id); err != nil {
			return err
		}
	}
	return tx.Commit()
}

// DeleteLabel removes a label and reassigns its messages to Other. The Other
// label itself is protected.
func (s *Store) DeleteLabel(ctx context.Context, id int64) error {
	if id == OtherLabelID {
		return fmt.Errorf("the Other label is the catch-all and cannot be deleted")
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if _, err := tx.ExecContext(ctx,
		`UPDATE message_labels SET label_id = ? WHERE label_id = ?`,
		OtherLabelID, id); err != nil {
		return err
	}
	if _, err := tx.ExecContext(ctx, `DELETE FROM labels WHERE id = ?`, id); err != nil {
		return err
	}
	return tx.Commit()
}

// SetMessageLabel assigns a label. source "user" marks a manual choice the
// classifier must never overwrite; the classifier passes "ai" and loses to
// any existing user row.
func (s *Store) SetMessageLabel(ctx context.Context, messageID, labelID int64, source string) error {
	if source != "user" {
		source = "ai"
	}
	if source == "user" {
		_, err := s.db.ExecContext(ctx, `
			INSERT INTO message_labels (message_id, label_id, source) VALUES (?, ?, 'user')
			ON CONFLICT(message_id) DO UPDATE SET label_id = excluded.label_id, source = 'user'`,
			messageID, labelID)
		return err
	}
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO message_labels (message_id, label_id, source) VALUES (?, ?, 'ai')
		ON CONFLICT(message_id) DO UPDATE SET label_id = excluded.label_id
		WHERE message_labels.source != 'user'`,
		messageID, labelID)
	return err
}

// MessagesWithoutLabel returns recent inbox messages the classifier hasn't
// seen yet, newest first.
func (s *Store) MessagesWithoutLabel(ctx context.Context, limit int) ([]Message, error) {
	if limit <= 0 {
		limit = 25
	}
	return s.queryMessages(ctx, `
		SELECT `+messageColumns+`
		FROM messages m JOIN folders fo ON fo.id = m.folder_id
		WHERE fo.role = ? AND NOT EXISTS
			(SELECT 1 FROM message_labels ml WHERE ml.message_id = m.id)
		ORDER BY m.date DESC LIMIT ?`, RoleInbox, limit)
}
