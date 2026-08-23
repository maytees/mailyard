package store

import (
	"context"
	"time"
)

// ActionItemRow is one persisted checklist entry for a thread.
type ActionItemRow struct {
	ID        int64  `json:"id"`
	AccountID string `json:"accountId"`
	ThreadID  string `json:"threadId"`
	Task      string `json:"task"`
	Owner     string `json:"owner"`
	Due       string `json:"due"`
	Done      bool   `json:"done"`
	CreatedAt int64  `json:"createdAt"`
}

// ReplaceActionItems swaps a thread's open items for a fresh extraction:
// undone rows are cleared (a re-extract reflects asks handled since), done
// rows survive as history, and re-extracted tasks matching a done row are
// ignored via the UNIQUE constraint so they don't reopen.
func (s *Store) ReplaceActionItems(ctx context.Context, accountID, threadID string, items []ActionItemRow) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	if _, err := tx.ExecContext(ctx, `
		DELETE FROM action_items
		WHERE account_id = ? AND thread_id = ? AND done = 0`,
		accountID, threadID); err != nil {
		return err
	}
	now := time.Now().Unix()
	for _, item := range items {
		if _, err := tx.ExecContext(ctx, `
			INSERT OR IGNORE INTO action_items
				(account_id, thread_id, task, owner, due, done, created_at)
			VALUES (?, ?, ?, ?, ?, 0, ?)`,
			accountID, threadID, item.Task, item.Owner, item.Due, now); err != nil {
			return err
		}
	}
	return tx.Commit()
}

// ListActionItems returns a thread's checklist, open items first.
func (s *Store) ListActionItems(ctx context.Context, accountID, threadID string) ([]ActionItemRow, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT id, account_id, thread_id, task, owner, due, done, created_at
		FROM action_items
		WHERE account_id = ? AND thread_id = ?
		ORDER BY done, id`, accountID, threadID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	items := []ActionItemRow{}
	for rows.Next() {
		var item ActionItemRow
		if err := rows.Scan(&item.ID, &item.AccountID, &item.ThreadID,
			&item.Task, &item.Owner, &item.Due, &item.Done, &item.CreatedAt); err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

// SetActionItemDone toggles one checklist entry.
func (s *Store) SetActionItemDone(ctx context.Context, id int64, done bool) error {
	_, err := s.db.ExecContext(ctx,
		`UPDATE action_items SET done = ? WHERE id = ?`, done, id)
	return err
}
