package store

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
)

func (s *Store) UpsertAccount(ctx context.Context, a Account) error {
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO accounts
			(id, email, display_name, color, icon, imap_host, imap_port,
			 smtp_host, smtp_port, username, auth_kind, created_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT(id) DO UPDATE SET
			email = excluded.email,
			display_name = excluded.display_name,
			color = excluded.color,
			icon = excluded.icon,
			imap_host = excluded.imap_host,
			imap_port = excluded.imap_port,
			smtp_host = excluded.smtp_host,
			smtp_port = excluded.smtp_port,
			username = excluded.username,
			auth_kind = excluded.auth_kind`,
		a.ID, a.Email, a.DisplayName, a.Color, a.Icon, a.IMAPHost, a.IMAPPort,
		a.SMTPHost, a.SMTPPort, a.Username, a.AuthKind, a.CreatedAt)
	return err
}

func (s *Store) ListAccounts(ctx context.Context) ([]Account, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT id, email, display_name, color, icon, imap_host, imap_port,
		       smtp_host, smtp_port, username, auth_kind, created_at
		FROM accounts ORDER BY created_at, id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	accounts := []Account{}
	for rows.Next() {
		var a Account
		if err := rows.Scan(&a.ID, &a.Email, &a.DisplayName, &a.Color, &a.Icon,
			&a.IMAPHost, &a.IMAPPort, &a.SMTPHost, &a.SMTPPort,
			&a.Username, &a.AuthKind, &a.CreatedAt); err != nil {
			return nil, err
		}
		accounts = append(accounts, a)
	}
	return accounts, rows.Err()
}

func (s *Store) GetAccount(ctx context.Context, id string) (Account, error) {
	var a Account
	err := s.db.QueryRowContext(ctx, `
		SELECT id, email, display_name, color, icon, imap_host, imap_port,
		       smtp_host, smtp_port, username, auth_kind, created_at
		FROM accounts WHERE id = ?`, id).
		Scan(&a.ID, &a.Email, &a.DisplayName, &a.Color, &a.Icon,
			&a.IMAPHost, &a.IMAPPort, &a.SMTPHost, &a.SMTPPort,
			&a.Username, &a.AuthKind, &a.CreatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return Account{}, fmt.Errorf("account %q not found", id)
	}
	return a, err
}

// DeleteAccount removes the account and, via cascading foreign keys, all of
// its folders, messages, bodies and attachments.
func (s *Store) DeleteAccount(ctx context.Context, id string) error {
	// FTS rows don't cascade — clear them in the same transaction.
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	if _, err := tx.ExecContext(ctx, `
		DELETE FROM messages_fts WHERE rowid IN
			(SELECT id FROM messages WHERE account_id = ?)`, id); err != nil {
		return err
	}
	if _, err := tx.ExecContext(ctx,
		`DELETE FROM accounts WHERE id = ?`, id); err != nil {
		return err
	}
	return tx.Commit()
}
