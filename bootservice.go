package main

import (
	"context"
	"log"
	"sync"

	"github.com/wailsapp/wails/v3/pkg/application"

	"mailyard/internal/store"
)

// BootService owns backend startup. Everything the app needs before first
// paint happens in ServiceStartup — today that is opening SQLite and running
// migrations; keychain checks and cache warming join it in later phases. The
// frontend splash gates on this via IsBackendReady / the "backend:ready"
// event. Other services in this package reach the shared store through
// BootService.st.
type BootService struct {
	mu      sync.RWMutex
	ready   bool
	bootErr string
	st      *store.Store
}

func (b *BootService) ServiceStartup(ctx context.Context, options application.ServiceOptions) error {
	// Local-only work here (DB, cache, keychain); IMAP sync starts after the
	// app is revealed, never before.

	// DEV: uncomment to hold the splash open for a closer look. (The React
	// splash's minimum display time is MIN_SPLASH_MS in frontend/src/lib/bootstrap.ts.)
	// time.Sleep(4 * time.Second)

	path, err := store.DefaultPath()
	var st *store.Store
	if err == nil {
		st, err = store.Open(path)
	}

	b.mu.Lock()
	b.ready = true
	b.st = st
	if err != nil {
		// A broken database must not trap the user on the splash — reveal the
		// app and let store-backed calls surface the error in the UI.
		b.bootErr = err.Error()
		log.Printf("boot: opening store failed: %v", err)
	}
	b.mu.Unlock()

	// Frontends that attached late can't miss this — they call
	// IsBackendReady() first and only then wait for the event.
	application.Get().Event.Emit("backend:ready", true)
	return nil
}

func (b *BootService) ServiceShutdown() error {
	b.mu.Lock()
	defer b.mu.Unlock()
	if b.st != nil {
		return b.st.Close()
	}
	return nil
}

// IsBackendReady reports whether backend startup finished. The frontend calls
// this before listening for "backend:ready" to avoid the missed-event race.
func (b *BootService) IsBackendReady() bool {
	b.mu.RLock()
	defer b.mu.RUnlock()
	return b.ready
}

// BootError returns the startup failure message, empty when startup was clean.
func (b *BootService) BootError() string {
	b.mu.RLock()
	defer b.mu.RUnlock()
	return b.bootErr
}

// storeHandle is how sibling services share the database. Nil until
// ServiceStartup has run — which the boot handshake guarantees happens before
// any UI-triggered call.
func (b *BootService) storeHandle() *store.Store {
	b.mu.RLock()
	defer b.mu.RUnlock()
	return b.st
}
