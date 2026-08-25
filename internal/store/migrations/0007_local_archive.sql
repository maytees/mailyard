-- Local archive: the archive-all sweep hides mail from the inbox with one
-- UPDATE instead of per-message IMAP moves. Locally archived mail shows in
-- the Archive view alongside true server archives; the server copy stays
-- where it is.
ALTER TABLE messages ADD COLUMN local_archived INTEGER NOT NULL DEFAULT 0;
