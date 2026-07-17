// Binds every registry command with a shortcut to one window-level keydown
// listener. Plain listener (not useHotkeys) so it can run outside React —
// hooks only work inside components.
import { commands } from "@/lib/command"
import { isEditableTarget, matchesShortcut } from "@/lib/keyboard"

let initialized = false

export function initializeGlobalHotkeys() {
	if (initialized) return // idempotent
	initialized = true

	// Dummy commands (no run) must not claim their keys yet.
	const bound = commands.filter((c) => c.shortcut && c.run)

	window.addEventListener("keydown", (event) => {
		if (event.repeat) return
		// Never fire single-key shortcuts while the user is typing.
		if (isEditableTarget(event.target)) return

		const command = bound.find((c) => matchesShortcut(event, c.shortcut!))
		if (!command) return

		event.preventDefault()
		command.run!()
	})
}
