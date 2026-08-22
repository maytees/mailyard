package store

import (
	"context"
	"database/sql"
	"embed"
	"errors"
	"fmt"
	"sort"
	"strconv"
	"strings"
)

// Migrations are plain SQL files named NNNN_description.sql, applied in order.
// The current version lives in meta.schema_version; files at or below it are
// skipped, so Open is safe to call on any database age.
//
//go:embed migrations/*.sql
var migrationFS embed.FS

func (s *Store) migrate(ctx context.Context) error {
	// meta must exist before we can read the version out of it.
	if _, err := s.db.ExecContext(ctx,
		`CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)`); err != nil {
		return fmt.Errorf("create meta table: %w", err)
	}

	current, err := s.schemaVersion(ctx)
	if err != nil {
		return err
	}

	entries, err := migrationFS.ReadDir("migrations")
	if err != nil {
		return fmt.Errorf("read migrations: %w", err)
	}
	names := make([]string, 0, len(entries))
	for _, entry := range entries {
		names = append(names, entry.Name())
	}
	sort.Strings(names)

	for _, name := range names {
		version, err := strconv.Atoi(strings.SplitN(name, "_", 2)[0])
		if err != nil {
			return fmt.Errorf("migration %q: bad version prefix: %w", name, err)
		}
		if version <= current {
			continue
		}

		script, err := migrationFS.ReadFile("migrations/" + name)
		if err != nil {
			return fmt.Errorf("read migration %q: %w", name, err)
		}

		tx, err := s.db.BeginTx(ctx, nil)
		if err != nil {
			return err
		}
		if _, err := tx.ExecContext(ctx, string(script)); err != nil {
			tx.Rollback()
			return fmt.Errorf("apply migration %q: %w", name, err)
		}
		if _, err := tx.ExecContext(ctx,
			`INSERT INTO meta (key, value) VALUES ('schema_version', ?)
			 ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
			strconv.Itoa(version)); err != nil {
			tx.Rollback()
			return err
		}
		if err := tx.Commit(); err != nil {
			return err
		}
	}
	return nil
}

func (s *Store) schemaVersion(ctx context.Context) (int, error) {
	raw, err := s.SettingFromMeta(ctx, "schema_version")
	if err != nil {
		return 0, err
	}
	if raw == "" {
		return 0, nil
	}
	version, err := strconv.Atoi(raw)
	if err != nil {
		return 0, fmt.Errorf("parse schema_version %q: %w", raw, err)
	}
	return version, nil
}

// SettingFromMeta reads an internal bookkeeping value ("" when unset).
func (s *Store) SettingFromMeta(ctx context.Context, key string) (string, error) {
	var value string
	err := s.db.QueryRowContext(ctx,
		`SELECT value FROM meta WHERE key = ?`, key).Scan(&value)
	if errors.Is(err, sql.ErrNoRows) {
		return "", nil
	}
	if err != nil {
		return "", err
	}
	return value, nil
}
