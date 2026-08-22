package store

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
)

// UpsertFolder inserts or updates by (account, name) and returns the folder id.
func (s *Store) UpsertFolder(ctx context.Context, f Folder) (int64, error) {
	var id int64
	err := s.db.QueryRowContext(ctx, `
		INSERT INTO folders (account_id, name, role, uidvalidity, uidnext, last_synced_at)
		VALUES (?, ?, ?, ?, ?, ?)
		ON CONFLICT(account_id, name) DO UPDATE SET
			role = excluded.role,
			uidvalidity = excluded.uidvalidity,
			uidnext = excluded.uidnext,
			last_synced_at = excluded.last_synced_at
		RETURNING id`,
		f.AccountID, f.Name, f.Role, f.UIDValidity, f.UIDNext, f.LastSyncedAt).
		Scan(&id)
	return id, err
}

func (s *Store) GetFolder(ctx context.Context, id int64) (Folder, error) {
	var f Folder
	err := s.db.QueryRowContext(ctx, `
		SELECT id, account_id, name, role, uidvalidity, uidnext, last_synced_at
		FROM folders WHERE id = ?`, id).
		Scan(&f.ID, &f.AccountID, &f.Name, &f.Role,
			&f.UIDValidity, &f.UIDNext, &f.LastSyncedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return Folder{}, fmt.Errorf("folder %d not found", id)
	}
	return f, err
}

func (s *Store) ListFolders(ctx context.Context, accountID string) ([]Folder, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT id, account_id, name, role, uidvalidity, uidnext, last_synced_at
		FROM folders WHERE account_id = ? ORDER BY name`, accountID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	folders := []Folder{}
	for rows.Next() {
		var f Folder
		if err := rows.Scan(&f.ID, &f.AccountID, &f.Name, &f.Role,
			&f.UIDValidity, &f.UIDNext, &f.LastSyncedAt); err != nil {
			return nil, err
		}
		folders = append(folders, f)
	}
	return folders, rows.Err()
}

// FolderByRole finds an account's folder for a role (e.g. the trash folder
// when deleting). Errors when the account has no folder in that role.
func (s *Store) FolderByRole(ctx context.Context, accountID, role string) (Folder, error) {
	var f Folder
	err := s.db.QueryRowContext(ctx, `
		SELECT id, account_id, name, role, uidvalidity, uidnext, last_synced_at
		FROM folders WHERE account_id = ? AND role = ? LIMIT 1`,
		accountID, role).
		Scan(&f.ID, &f.AccountID, &f.Name, &f.Role,
			&f.UIDValidity, &f.UIDNext, &f.LastSyncedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return Folder{}, fmt.Errorf("account %s has no %q folder", accountID, role)
	}
	return f, err
}
