-- Persisted AI-extracted action items, tied to threads for now; the future
-- todo/calendar surface queries this table globally.
CREATE TABLE action_items (
    id         INTEGER PRIMARY KEY,
    account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    thread_id  TEXT NOT NULL,
    task       TEXT NOT NULL,
    owner      TEXT NOT NULL DEFAULT 'you',
    due        TEXT NOT NULL DEFAULT '',
    done       INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    UNIQUE (account_id, thread_id, task)
);
CREATE INDEX idx_action_items_thread ON action_items(account_id, thread_id);
