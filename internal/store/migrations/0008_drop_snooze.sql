-- Snooze is gone: nobody used it, and its 'h' key now drives label
-- navigation. Any still-hidden snoozed rows become visible again.
ALTER TABLE messages DROP COLUMN snoozed_until;
