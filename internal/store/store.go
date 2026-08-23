// Package store owns Mailyard's local SQLite database: schema, migrations,
// and every query the services run. The app is local-first — the sync engine
// writes here, the UI only ever reads from here.
package store

import (
	"context"
	"database/sql"
	"fmt"
	"net/url"
	"os"
	"path/filepath"

	_ "modernc.org/sqlite"
)

type Store struct {
	db   *sql.DB
	path string
}

// DefaultPath is the production database location
// (~/Library/Application Support/Mailyard/mailyard.db on macOS).
func DefaultPath() (string, error) {
	configDir, err := os.UserConfigDir()
	if err != nil {
		return "", fmt.Errorf("resolve user config dir: %w", err)
	}
	return filepath.Join(configDir, "Mailyard", "mailyard.db"), nil
}

// Open opens (creating if needed) the database at path and runs migrations.
func Open(path string) (*Store, error) {
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		return nil, fmt.Errorf("create data dir: %w", err)
	}

	// WAL keeps readers unblocked during sync writes; busy_timeout papers over
	// the brief write locks that remain.
	dsn := fmt.Sprintf(
		"file:%s?_pragma=foreign_keys(1)&_pragma=journal_mode(WAL)&_pragma=busy_timeout(5000)&_pragma=synchronous(NORMAL)",
		url.PathEscape(path),
	)
	db, err := sql.Open("sqlite", dsn)
	if err != nil {
		return nil, fmt.Errorf("open database: %w", err)
	}

	s := &Store{db: db, path: path}
	if err := s.migrate(context.Background()); err != nil {
		db.Close()
		return nil, err
	}
	return s, nil
}

func (s *Store) Close() error {
	return s.db.Close()
}

// Path returns the location of the live database file.
func (s *Store) Path() string {
	return s.path
}

// VacuumInto writes a compact, consistent snapshot of the database to path —
// the export mechanism (safe while the database is in use).
func (s *Store) VacuumInto(ctx context.Context, path string) error {
	_, err := s.db.ExecContext(ctx, `VACUUM INTO ?`, path)
	return err
}

// SettingUserName holds the person's name (email sign-offs, onboarding) —
// distinct from per-mailbox display names like "Personal".
const SettingUserName = "user_name"

// WipeMail deletes every downloaded message (bodies/attachments cascade,
// search index cleared) and resets folder sync state so accounts re-sync
// from scratch. Accounts themselves stay.
func (s *Store) WipeMail(ctx context.Context) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	for _, stmt := range []string{
		`DELETE FROM messages_fts`,
		`DELETE FROM messages`,
		`UPDATE folders SET uidvalidity = 0, uidnext = 0, last_synced_at = 0`,
	} {
		if _, err := tx.ExecContext(ctx, stmt); err != nil {
			return err
		}
	}
	return tx.Commit()
}

// WipeArtifacts clears every cached AI output (summaries, digests, triage).
func (s *Store) WipeArtifacts(ctx context.Context) error {
	_, err := s.db.ExecContext(ctx, `DELETE FROM ai_artifacts`)
	return err
}

// WipeSettings clears the settings KV (user name, sync tunables, AI config).
func (s *Store) WipeSettings(ctx context.Context) error {
	_, err := s.db.ExecContext(ctx, `DELETE FROM settings`)
	return err
}

// SettingGet returns the stored value for key, or fallback when unset.
func (s *Store) SettingGet(ctx context.Context, key, fallback string) (string, error) {
	var value string
	err := s.db.QueryRowContext(ctx,
		`SELECT value FROM settings WHERE key = ?`, key).Scan(&value)
	if err == sql.ErrNoRows {
		return fallback, nil
	}
	if err != nil {
		return "", err
	}
	return value, nil
}

func (s *Store) SettingSet(ctx context.Context, key, value string) error {
	_, err := s.db.ExecContext(ctx,
		`INSERT INTO settings (key, value) VALUES (?, ?)
		 ON CONFLICT(key) DO UPDATE SET value = excluded.value`, key, value)
	return err
}
