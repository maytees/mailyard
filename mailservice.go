package main

import (
	"context"
	"fmt"
	"log"
	"os"

	"github.com/emersion/go-imap/v2"
	"github.com/wailsapp/wails/v3/pkg/application"

	"mailyard/internal/store"
)

// MailService is the UI's read path onto local mail, plus the small write
// operations reading implies (mark read). Heavier actions live in Phase 5.
type MailService struct {
	boot *BootService
	sync *SyncService
}

func (m *MailService) st() (*store.Store, error) {
	st := m.boot.storeHandle()
	if st == nil {
		return nil, fmt.Errorf("database is not available: %s", m.boot.BootError())
	}
	return st, nil
}

func (m *MailService) ListMessages(ctx context.Context, filter store.ListFilter) ([]store.Message, error) {
	st, err := m.st()
	if err != nil {
		return nil, err
	}
	return st.ListMessages(ctx, filter)
}

func (m *MailService) GetThread(ctx context.Context, accountID, threadID string) ([]store.Message, error) {
	st, err := m.st()
	if err != nil {
		return nil, err
	}
	return st.GetThread(ctx, accountID, threadID)
}

func (m *MailService) GetMessageBody(ctx context.Context, messageID int64) (store.MessageBody, error) {
	st, err := m.st()
	if err != nil {
		return store.MessageBody{}, err
	}
	return st.GetMessageBody(ctx, messageID)
}

func (m *MailService) UnreadCounts(ctx context.Context) (map[string]int, error) {
	st, err := m.st()
	if err != nil {
		return nil, err
	}
	return st.UnreadCounts(ctx)
}

// MarkRead applies locally at once (snappy UI) and pushes the \Seen flag to
// the server in the background; the next reconcile heals any failed push.
func (m *MailService) MarkRead(ctx context.Context, messageID int64, read bool) error {
	st, err := m.st()
	if err != nil {
		return err
	}
	if err := st.SetUnread(ctx, []int64{messageID}, !read); err != nil {
		return err
	}
	if engine := m.sync.engineHandle(); engine != nil {
		go func() {
			if err := engine.SetMessageFlag(context.Background(), messageID, imap.FlagSeen, read); err != nil {
				log.Printf("mark read push failed: %v", err)
			}
		}()
	}
	return nil
}

// Archive moves a message into the account's archive folder on the server.
func (m *MailService) Archive(ctx context.Context, messageID int64) error {
	engine := m.sync.engineHandle()
	if engine == nil {
		return fmt.Errorf("mail engine is not running yet")
	}
	return engine.MoveMessageToRole(ctx, messageID, store.RoleArchive)
}

// Trash moves a message into the account's trash folder on the server.
func (m *MailService) Trash(ctx context.Context, messageID int64) error {
	engine := m.sync.engineHandle()
	if engine == nil {
		return fmt.Errorf("mail engine is not running yet")
	}
	return engine.MoveMessageToRole(ctx, messageID, store.RoleTrash)
}

// SetStarred applies locally at once and pushes \Flagged in the background.
func (m *MailService) SetStarred(ctx context.Context, messageID int64, starred bool) error {
	st, err := m.st()
	if err != nil {
		return err
	}
	if err := st.SetStarred(ctx, []int64{messageID}, starred); err != nil {
		return err
	}
	if engine := m.sync.engineHandle(); engine != nil {
		go func() {
			if err := engine.SetMessageFlag(context.Background(), messageID, imap.FlagFlagged, starred); err != nil {
				log.Printf("star push failed: %v", err)
			}
		}()
	}
	return nil
}

// Snooze hides a message from lists until the wake time (local-only).
func (m *MailService) Snooze(ctx context.Context, messageID int64, until int64) error {
	st, err := m.st()
	if err != nil {
		return err
	}
	return st.SnoozeMessage(ctx, messageID, until)
}

// MarkAllRead clears unread across the current view, pushing \Seen flags in
// the background.
func (m *MailService) MarkAllRead(ctx context.Context, filter store.ListFilter) error {
	st, err := m.st()
	if err != nil {
		return err
	}
	ids, err := st.UnreadIDs(ctx, filter)
	if err != nil || len(ids) == 0 {
		return err
	}
	if err := st.SetUnread(ctx, ids, false); err != nil {
		return err
	}
	if engine := m.sync.engineHandle(); engine != nil {
		go func() {
			for _, id := range ids {
				if err := engine.SetMessageFlag(context.Background(), id, imap.FlagSeen, true); err != nil {
					log.Printf("mark all read push failed: %v", err)
					return
				}
			}
		}()
	}
	return nil
}

// SearchContacts powers compose autocomplete: known correspondents matching
// the typed fragment, best matches first.
func (m *MailService) SearchContacts(ctx context.Context, query string, limit int) ([]store.Contact, error) {
	st, err := m.st()
	if err != nil {
		return nil, err
	}
	return st.SearchContacts(ctx, query, limit)
}

func (m *MailService) ListAttachments(ctx context.Context, messageID int64) ([]store.Attachment, error) {
	st, err := m.st()
	if err != nil {
		return nil, err
	}
	return st.ListAttachments(ctx, messageID)
}

// SaveAttachment prompts for a location and writes the stored bytes. Returns
// the chosen path, or "" when the user cancels.
func (m *MailService) SaveAttachment(ctx context.Context, attachmentID int64) (string, error) {
	st, err := m.st()
	if err != nil {
		return "", err
	}
	data, err := st.AttachmentData(ctx, attachmentID)
	if err != nil {
		return "", err
	}
	if data == nil {
		return "", fmt.Errorf("attachment content is not downloaded yet")
	}
	attachment, err := st.GetAttachment(ctx, attachmentID)
	if err != nil {
		return "", err
	}

	path, err := application.Get().Dialog.SaveFile().
		SetFilename(attachment.Filename).
		CanCreateDirectories(true).
		PromptForSingleSelection()
	if err != nil {
		return "", err
	}
	if path == "" {
		return "", nil // user cancelled
	}
	if err := os.WriteFile(path, data, 0o644); err != nil {
		return "", fmt.Errorf("write file: %w", err)
	}
	return path, nil
}
