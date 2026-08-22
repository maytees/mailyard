-- Per-account icon (a hugeicons export name, e.g. "SchoolIcon"); empty means
-- the rail falls back to the account's initial letter.
ALTER TABLE accounts ADD COLUMN icon TEXT NOT NULL DEFAULT '';
