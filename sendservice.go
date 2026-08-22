package main

import (
	"context"
	"fmt"
	"os"
	"path/filepath"

	"github.com/wailsapp/wails/v3/pkg/application"

	"mailyard/internal/mail"
)

// SendService covers composing: SMTP send, server-side drafts, and the
// attachment picker.
type SendService struct {
	sync *SyncService
}

// PickedFile is what the compose sheet shows for a chosen attachment; only
// the path travels back on send.
type PickedFile struct {
	Path string `json:"path"`
	Name string `json:"name"`
	Size int64  `json:"size"`
}

func (s *SendService) engine() (*mail.Engine, error) {
	engine := s.sync.engineHandle()
	if engine == nil {
		return nil, fmt.Errorf("mail engine is not running yet")
	}
	return engine, nil
}

func (s *SendService) SendMessage(ctx context.Context, out mail.Outgoing) error {
	engine, err := s.engine()
	if err != nil {
		return err
	}
	return engine.Send(ctx, out)
}

func (s *SendService) SaveDraft(ctx context.Context, out mail.Outgoing, replaceID int64) (int64, error) {
	engine, err := s.engine()
	if err != nil {
		return 0, err
	}
	return engine.SaveDraft(ctx, out, replaceID)
}

func (s *SendService) DeleteDraft(ctx context.Context, messageID int64) error {
	engine, err := s.engine()
	if err != nil {
		return err
	}
	return engine.DeleteDraft(ctx, messageID)
}

// PickAttachments opens the native multi-select file dialog.
func (s *SendService) PickAttachments(ctx context.Context) ([]PickedFile, error) {
	paths, err := application.Get().Dialog.OpenFile().
		CanChooseFiles(true).
		PromptForMultipleSelection()
	if err != nil {
		return nil, err
	}
	files := []PickedFile{}
	for _, path := range paths {
		info, err := os.Stat(path)
		if err != nil {
			continue
		}
		files = append(files, PickedFile{
			Path: path,
			Name: filepath.Base(path),
			Size: info.Size(),
		})
	}
	return files, nil
}
