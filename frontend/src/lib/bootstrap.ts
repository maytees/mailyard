// App boot sequence. The splash screen stays up until every gate below
// resolves. Gates are local readiness only (stores, cache, backend init) —
// never network/IMAP sync, so the app opens instantly offline too.
import { Events } from "@wailsio/runtime"

import { useSettingsStore } from "@/stores/settings"
import { initWindowStore } from "@/stores/window"
import { IsBackendReady } from "~/bindings/changeme/bootservice"

export interface BootGate {
	name: string
	check: () => Promise<void>
}

/** Hard ceiling — a hung gate must never mean an infinite splash. */
const GATE_TIMEOUT_MS = 8000
/** Floor — long enough for the splash intro to land instead of blinking. */
const MIN_SPLASH_MS = 700

// Adding a subsystem later = adding one entry here. Nothing else changes.
const gates: BootGate[] = [
	// Wails runtime state (fullscreen etc.) — async round-trip to Go.
	{ name: "window", check: () => initWindowStore() },
	// Settings hydrate synchronously from localStorage today, but gate them
	// anyway so swapping in async storage later can't break startup.
	{
		name: "settings",
		check: async () => {
			if (useSettingsStore.persist.hasHydrated()) return
			await new Promise<void>((resolve) => {
				useSettingsStore.persist.onFinishHydration(() => resolve())
			})
		},
	},
	// Go backend finished ServiceStartup (future: DB open + migrated, keychain
	// checked, cache warmed).
	{
		name: "backend",
		check: () =>
			new Promise<void>((resolve, reject) => {
				// Listener attaches before the check call so the event can't fire
				// into the gap; IsBackendReady covers "already fired before now".
				const off = Events.On("backend:ready", () => {
					off()
					resolve()
				})
				IsBackendReady().then(
					(ready) => {
						if (ready) {
							off()
							resolve()
						}
					},
					(error: unknown) => {
						off()
						reject(error instanceof Error ? error : new Error(String(error)))
					}
				)
			}),
	},
	// Future gates, e.g.:
	// { name: "cache", check: loadCachedInbox },  // local SQLite mail
]

function delay(ms: number) {
	return new Promise<void>((resolve) => setTimeout(resolve, ms))
}

function withTimeout(promise: Promise<unknown>, ms: number) {
	return Promise.race([promise, delay(ms)])
}

let bootPromise: Promise<void> | null = null

/**
 * Runs every boot gate in parallel. Idempotent — StrictMode double-mounts
 * effects, so callers share one boot.
 */
export function runBootstrap(): Promise<void> {
	bootPromise ??= (async () => {
		const allGates = Promise.all(
			gates.map((gate) =>
				gate.check().catch((error: unknown) => {
					// One failing subsystem degrades gracefully; never trap the splash.
					console.error(`boot gate "${gate.name}" failed`, error)
				})
			)
		)
		await Promise.all([
			withTimeout(allGates, GATE_TIMEOUT_MS),
			delay(MIN_SPLASH_MS),
		])

		// Tell Go we're ready — it swaps the native splash window for the main
		// window. Rejects harmlessly in a plain browser (no Wails runtime).
		Events.Emit("frontend:ready", true).catch(() => {})
	})()
	return bootPromise
}
