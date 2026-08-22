package main

import (
	"context"
	"fmt"
	"strconv"
	"sync"
	"time"

	"github.com/wailsapp/wails/v3/pkg/application"

	"mailyard/internal/mail"
	"mailyard/internal/secrets"
	"mailyard/internal/store"
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

	mu         sync.Mutex
	engine     *mail.Engine
	cancel     context.CancelFunc
	subscribed bool
}

// Settings keys for the tunable sync behavior (values are integers).
const (
	settingPollMinutes  = "sync_poll_minutes"
	settingBackfillDays = "sync_backfill_days"
)

// start brings the engine up; called from main on first reveal and again
// after Restart.
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

	background := context.Background()
	pollMinutes := settingInt(st, settingPollMinutes, 5)
	backfillDays := settingInt(st, settingBackfillDays, 90)

	ctx, cancel := context.WithCancel(background)
	s.cancel = cancel
	s.engine = &mail.Engine{
		Store:  st,
		Events: wailsEmitter{},
		Password: func(accountID string) (string, error) {
			return secrets.Keychain{}.Get(accountID)
		},
		PollInterval:   time.Duration(pollMinutes) * time.Minute,
		BackfillWindow: time.Duration(backfillDays) * 24 * time.Hour,
		OnNewMail:      notifyNewMail,
	}
	s.engine.Start(ctx)

	if !s.subscribed {
		s.subscribed = true
		// New/removed accounts adjust the worker set live.
		application.Get().Event.On("accounts:changed", func(*application.CustomEvent) {
			s.mu.Lock()
			engine := s.engine
			s.mu.Unlock()
			if engine != nil {
				engine.Reconcile(context.Background())
			}
		})
	}
}

func settingInt(st *store.Store, key string, fallback int) int {
	raw, err := st.SettingGet(context.Background(), key, "")
	if err != nil || raw == "" {
		return fallback
	}
	value, err := strconv.Atoi(raw)
	if err != nil || value <= 0 {
		return fallback
	}
	return value
}

// stop tears the engine down (import swaps the store out from under it).
func (s *SyncService) stop() {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.cancel != nil {
		s.cancel()
		s.cancel = nil
	}
	s.engine = nil
}

// Restart rebuilds the engine, picking up new settings or a swapped store.
func (s *SyncService) Restart(ctx context.Context) error {
	s.stop()
	s.start()
	return nil
}

func (s *SyncService) ServiceShutdown() error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.cancel != nil {
		s.cancel()
	}
	return nil
}

// engineHandle exposes the running engine to sibling services (nil before
// first reveal).
func (s *SyncService) engineHandle() *mail.Engine {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.engine
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
