// Platform-aware keyboard helpers.
//
// Shortcuts are written once in a platform-neutral form ("mod+shift+k") and
// translated per-OS for display ("⌘ ⇧ K" on macOS, "Ctrl Shift K" elsewhere).
// "mod" is the primary modifier: ⌘ on macOS, Ctrl on Windows/Linux.

export type Platform = "mac" | "windows" | "linux"

export type Modifier = "mod" | "ctrl" | "alt" | "shift" | "meta"

export function getPlatform(): Platform {
	if (typeof navigator === "undefined") return "linux"
	const nav = navigator as Navigator & {
		userAgentData?: { platform: string }
	}
	const raw = (
		nav.userAgentData?.platform ??
		navigator.platform ??
		navigator.userAgent
	).toLowerCase()
	if (raw.includes("mac")) return "mac"
	if (raw.includes("win")) return "windows"
	return "linux"
}

export const isMac = getPlatform() === "mac"

const MODIFIER_LABELS: Record<Platform, Record<Modifier, string>> = {
	mac: { mod: "⌘", ctrl: "⌃", alt: "⌥", shift: "⇧", meta: "⌘" },
	windows: { mod: "Ctrl", ctrl: "Ctrl", alt: "Alt", shift: "Shift", meta: "Win" },
	linux: { mod: "Ctrl", ctrl: "Ctrl", alt: "Alt", shift: "Shift", meta: "Super" },
}

// Conventional display order: Ctrl, Alt, Shift, Cmd/Win.
const MODIFIER_ORDER: Modifier[] = ["ctrl", "alt", "shift", "mod", "meta"]

const KEY_LABELS: Record<string, string> = {
	arrowup: "↑",
	arrowdown: "↓",
	arrowleft: "←",
	arrowright: "→",
	enter: "Enter",
	escape: "Esc",
	backspace: "⌫",
	delete: "Del",
	space: "Space",
	tab: "Tab",
}

function isModifier(part: string): part is Modifier {
	return part in MODIFIER_LABELS.mac
}

/**
 * Translate a platform-neutral shortcut into display labels, one per key —
 * ready to map over <Kbd> elements.
 *
 * formatShortcut("mod+k")        → ["⌘", "K"] on macOS, ["Ctrl", "K"] elsewhere
 * formatShortcut("mod+shift+p")  → ["⌘", "⇧", "P"] / ["Ctrl", "Shift", "P"]
 * formatShortcut("alt+arrowup")  → ["⌥", "↑"] / ["Alt", "↑"]
 */
export function formatShortcut(shortcut: string): string[] {
	const platform = getPlatform()
	const parts = shortcut.toLowerCase().split("+")
	const modifiers = parts
		.filter(isModifier)
		.sort((a, b) => MODIFIER_ORDER.indexOf(a) - MODIFIER_ORDER.indexOf(b))
		.map((mod) => MODIFIER_LABELS[platform][mod])
	const keys = parts
		.filter((part) => !isModifier(part))
		.map((key) => KEY_LABELS[key] ?? key.toUpperCase())
	return [...modifiers, ...keys]
}

/** Same as formatShortcut, joined for plain-text contexts (tooltips, aria labels). */
export function formatShortcutText(shortcut: string): string {
	return formatShortcut(shortcut).join(isMac ? "" : "+")
}

/** True when the event target is a place the user types (input, textarea, contenteditable). */
export function isEditableTarget(target: EventTarget | null): boolean {
	if (!(target instanceof HTMLElement)) {
		return false
	}
	if (target.isContentEditable) {
		return true
	}
	return (
		target.closest("input, textarea, select, [contenteditable='true']") !==
		null
	)
}

/**
 * Check a KeyboardEvent against a platform-neutral shortcut.
 * "mod" matches metaKey on macOS and ctrlKey on Windows/Linux; all other
 * modifier states must match exactly (so "mod+k" won't fire on mod+shift+k).
 *
 * matchesShortcut(event, "mod+k")
 */
export function matchesShortcut(
	event: KeyboardEvent | React.KeyboardEvent,
	shortcut: string
): boolean {
	const parts = shortcut.toLowerCase().split("+")
	const key = parts.find((part) => !isModifier(part))
	const mods = new Set(parts.filter(isModifier))

	const wantsMod = mods.has("mod")
	const wantsCtrl = mods.has("ctrl") || (wantsMod && !isMac)
	const wantsMeta = mods.has("meta") || (wantsMod && isMac)

	return (
		(key === undefined || event.key.toLowerCase() === key) &&
		event.ctrlKey === wantsCtrl &&
		event.metaKey === wantsMeta &&
		event.altKey === mods.has("alt") &&
		event.shiftKey === mods.has("shift")
	)
}
