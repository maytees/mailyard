package main

import (
	"context"
	"sync"

	"github.com/wailsapp/wails/v3/pkg/application"
)

// BootService owns backend startup. Everything the app needs before first
// paint happens in ServiceStartup — future: open SQLite + run migrations,
// check keychain accounts, warm the local mail cache. The frontend splash
// gates on this via IsBackendReady / the "backend:ready" event.
type BootService struct {
	mu    sync.RWMutex
	ready bool
}

func (b *BootService) ServiceStartup(ctx context.Context, options application.ServiceOptions) error {
	// Future startup work goes here. Keep it local-only (DB, cache, keychain);
	// IMAP sync starts after the app is revealed, never before.

	// DEV: uncomment to hold the splash open for a closer look. (The React
	// splash's minimum display time is MIN_SPLASH_MS in frontend/src/lib/bootstrap.ts.)
	// time.Sleep(4 * time.Second)

	b.mu.Lock()
	b.ready = true
	b.mu.Unlock()

	// Frontends that attached late can't miss this — they call
	// IsBackendReady() first and only then wait for the event.
	application.Get().Event.Emit("backend:ready", true)
	return nil
}

// IsBackendReady reports whether backend startup finished. The frontend calls
// this before listening for "backend:ready" to avoid the missed-event race.
func (b *BootService) IsBackendReady() bool {
	b.mu.RLock()
	defer b.mu.RUnlock()
	return b.ready
}
