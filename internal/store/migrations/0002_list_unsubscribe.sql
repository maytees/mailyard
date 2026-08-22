-- Captures the List-Unsubscribe header so the unsubscribe-suggestions
-- feature can offer working links.
ALTER TABLE messages ADD COLUMN list_unsubscribe TEXT NOT NULL DEFAULT '';
