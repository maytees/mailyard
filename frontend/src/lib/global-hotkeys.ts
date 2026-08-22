// Binds every registry command with a shortcut to one window-level keydown
// listener. Plain listener (not useHotkeys) so it can run outside React —
// hooks only work inside components.
//
// Two kinds of shortcut coexist:
//  - chords ("mod+shift+s", "e") — matched per keydown
//  - sequences ("g+i" = g, then i) — tracked across keydowns with a timeout
// When a key opens a sequence prefix, it wins over any single-key chord.
import { commands, type AppCommand } from "@/lib/command"
import {
	advanceSequence,
	isEditableTarget,
	isSequenceShortcut,
	matchesShortcut,
	shortcutKeys,
} from "@/lib/keyboard"

const SEQUENCE_WINDOW_MS = 1000

let initialized = false

export function initializeGlobalHotkeys() {
	if (initialized) return // idempotent
	initialized = true

	// Dummy commands (no run) must not claim their keys yet.
	const bound = commands.filter((c) => c.shortcut && c.run)
	const chords = bound.filter((c) => !isSequenceShortcut(c.shortcut!))
	const sequences = bound
		.filter((c) => isSequenceShortcut(c.shortcut!))
		.map((c) => ({ keys: shortcutKeys(c.shortcut!), value: c }))

	let pending: string[] = []
	let pendingTimer: ReturnType<typeof setTimeout> | null = null

	const clearPending = () => {
		pending = []
		if (pendingTimer) {
			clearTimeout(pendingTimer)
			pendingTimer = null
		}
	}

	window.addEventListener("keydown", (event) => {
		if (event.repeat) return
		// Never fire shortcuts while the user is typing.
		if (isEditableTarget(event.target)) return

		// Bare printable keys feed the sequence matcher first.
		const isPlainKey =
			!event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey &&
			event.key.length === 1

		if (isPlainKey && sequences.length > 0) {
			const step = advanceSequence<AppCommand>(
				pending,
				event.key.toLowerCase(),
				sequences
			)
			if (step.match) {
				clearPending()
				event.preventDefault()
				step.match.run!()
				return
			}
			if (step.pending.length > 0) {
				clearPending()
				pending = step.pending
				pendingTimer = setTimeout(clearPending, SEQUENCE_WINDOW_MS)
				event.preventDefault()
				return
			}
			clearPending()
		}

		const command = chords.find((c) => matchesShortcut(event, c.shortcut!))
		if (!command) return

		event.preventDefault()
		command.run!()
	})
}
