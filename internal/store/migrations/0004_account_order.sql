-- User-defined mailbox order for the sidebar rail. Existing rows share 0 and
-- fall back to created_at, preserving the old order until the first reorder.
ALTER TABLE accounts ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0;
