-- Initial schema. Conventions: TEXT uuids for accounts (stable across
-- export/import), INTEGER rowids elsewhere; timestamps are unix seconds;
-- booleans are 0/1 integers.

CREATE TABLE accounts (
    id            TEXT PRIMARY KEY,
    email         TEXT NOT NULL UNIQUE,
    display_name  TEXT NOT NULL,
    color         TEXT NOT NULL,
    imap_host     TEXT NOT NULL,
    imap_port     INTEGER NOT NULL,
    smtp_host     TEXT NOT NULL,
    smtp_port     INTEGER NOT NULL,
    username      TEXT NOT NULL,
    auth_kind     TEXT NOT NULL DEFAULT 'password',
    created_at    INTEGER NOT NULL
);

CREATE TABLE folders (
    id             INTEGER PRIMARY KEY,
    account_id     TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    name           TEXT NOT NULL,
    role           TEXT NOT NULL DEFAULT 'other',
    uidvalidity    INTEGER NOT NULL DEFAULT 0,
    uidnext        INTEGER NOT NULL DEFAULT 0,
    last_synced_at INTEGER NOT NULL DEFAULT 0,
    UNIQUE (account_id, name)
);
CREATE INDEX idx_folders_account_role ON folders(account_id, role);

CREATE TABLE messages (
    id              INTEGER PRIMARY KEY,
    account_id      TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    folder_id       INTEGER NOT NULL REFERENCES folders(id) ON DELETE CASCADE,
    uid             INTEGER NOT NULL,
    message_id      TEXT NOT NULL DEFAULT '',
    refs            TEXT NOT NULL DEFAULT '',
    thread_id       TEXT NOT NULL,
    subject         TEXT NOT NULL DEFAULT '',
    from_name       TEXT NOT NULL DEFAULT '',
    from_email      TEXT NOT NULL DEFAULT '',
    to_json         TEXT NOT NULL DEFAULT '[]',
    cc_json         TEXT NOT NULL DEFAULT '[]',
    date            INTEGER NOT NULL DEFAULT 0,
    snippet         TEXT NOT NULL DEFAULT '',
    is_unread       INTEGER NOT NULL DEFAULT 1,
    is_starred      INTEGER NOT NULL DEFAULT 0,
    is_answered     INTEGER NOT NULL DEFAULT 0,
    has_attachments INTEGER NOT NULL DEFAULT 0,
    size            INTEGER NOT NULL DEFAULT 0,
    snoozed_until   INTEGER NOT NULL DEFAULT 0,
    UNIQUE (folder_id, uid)
);
CREATE INDEX idx_messages_list ON messages(folder_id, date DESC);
CREATE INDEX idx_messages_account_date ON messages(account_id, date DESC);
CREATE INDEX idx_messages_thread ON messages(thread_id);
CREATE INDEX idx_messages_message_id ON messages(message_id);

CREATE TABLE message_bodies (
    message_id     INTEGER PRIMARY KEY REFERENCES messages(id) ON DELETE CASCADE,
    text_body      TEXT NOT NULL DEFAULT '',
    html_sanitized TEXT NOT NULL DEFAULT ''
);

CREATE TABLE attachments (
    id         INTEGER PRIMARY KEY,
    message_id INTEGER NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    filename   TEXT NOT NULL,
    mime_type  TEXT NOT NULL DEFAULT '',
    size       INTEGER NOT NULL DEFAULT 0,
    content_id TEXT NOT NULL DEFAULT '',
    data       BLOB
);
CREATE INDEX idx_attachments_message ON attachments(message_id);

CREATE TABLE ai_artifacts (
    id         INTEGER PRIMARY KEY,
    kind       TEXT NOT NULL,
    ref_id     TEXT NOT NULL,
    content    TEXT NOT NULL,
    model      TEXT NOT NULL DEFAULT '',
    created_at INTEGER NOT NULL,
    UNIQUE (kind, ref_id)
);

CREATE TABLE settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

-- Maintained from Go inside the same transaction as messages writes (no
-- triggers: bodies live in a second table, which triggers handle poorly).
-- rowid mirrors messages.id.
CREATE VIRTUAL TABLE messages_fts USING fts5(subject, sender, body);
