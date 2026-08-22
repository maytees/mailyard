package main

import (
	"context"
	"fmt"
	"sync"

	"github.com/wailsapp/wails/v3/pkg/application"

	"mailyard/internal/mail"
	"mailyard/internal/secrets"
)

// wailsEmitter bridges the sync engine's events onto the Wails bus.
type wailsEmitter struct{}

func (wailsEmitter) Emit(name string, data any) {
	application.Get().Event.Emit(name, data)
}

// SyncService owns the IMAP sync engine. The engine starts only after the
// window is revealed (never during boot) and follows account changes.
type SyncService struct {
	boot *BootService

	mu     sync.Mutex
	engine *mail.Engine
	cancel context.CancelFunc
}

// start brings the engine up; called once from main on first reveal.
func (s *SyncService) start() {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.engine != nil {
		return
	}
	st := s.boot.storeHandle()
	if st == nil {
		return // no database, nothing to sync
	}

	ctx, cancel := context.WithCancel(context.Background())
	s.cancel = cancel
	s.engine = &mail.Engine{
		Store:  st,
		Events: wailsEmitter{},
		Password: func(accountID string) (string, error) {
			return secrets.Keychain{}.Get(accountID)
		},
	}
	s.engine.Start(ctx)

	// New/removed accounts adjust the worker set live.
	application.Get().Event.On("accounts:changed", func(*application.CustomEvent) {
		s.mu.Lock()
		engine := s.engine
		s.mu.Unlock()
		if engine != nil {
			engine.Reconcile(ctx)
		}
	})
}

func (s *SyncService) ServiceShutdown() error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.cancel != nil {
		s.cancel()
	}
	return nil
}

// SyncNow runs one incremental pass over every account (palette "Sync now").
func (s *SyncService) SyncNow(ctx context.Context) error {
	s.mu.Lock()
	engine := s.engine
	s.mu.Unlock()
	if engine == nil {
		return fmt.Errorf("sync engine is not running")
	}
	return engine.SyncAll(ctx)
}
