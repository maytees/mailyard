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
