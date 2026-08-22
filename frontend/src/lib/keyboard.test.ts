import { describe, expect, it } from "vitest"

import {
	formatShortcut,
	isMac,
	matchesShortcut,
	isEditableTarget,
} from "@/lib/keyboard"

function keyEvent(key: string, mods: Partial<KeyboardEvent> = {}) {
	return new KeyboardEvent("keydown", {
		key,
		ctrlKey: false,
		metaKey: false,
		altKey: false,
		shiftKey: false,
		...mods,
	})
}

// jsdom reports no platform hints, so getPlatform() resolves to "linux" here —
// mod means ctrl in these tests.
describe("formatShortcut", () => {
	it("orders modifiers conventionally and uppercases keys", () => {
		expect(formatShortcut("shift+mod+k")).toEqual(
			isMac ? ["⇧", "⌘", "K"] : ["Shift", "Ctrl", "K"]
		)
	})

	it("maps special keys to symbols", () => {
		expect(formatShortcut("alt+arrowup")).toEqual(
			isMac ? ["⌥", "↑"] : ["Alt", "↑"]
		)
	})
})

describe("matchesShortcut", () => {
	it("matches mod against the platform's primary modifier", () => {
		const event = keyEvent("k", isMac ? { metaKey: true } : { ctrlKey: true })
		expect(matchesShortcut(event, "mod+k")).toBe(true)
	})

	it("requires exact modifier state", () => {
		const event = keyEvent("k", {
			ctrlKey: !isMac,
			metaKey: isMac,
			shiftKey: true,
		})
		expect(matchesShortcut(event, "mod+k")).toBe(false)
		expect(matchesShortcut(event, "mod+shift+k")).toBe(true)
	})

	it("does not fire bare keys when modifiers are held", () => {
		expect(matchesShortcut(keyEvent("j", { altKey: true }), "j")).toBe(false)
		expect(matchesShortcut(keyEvent("j"), "j")).toBe(true)
	})
})

describe("isEditableTarget", () => {
	it("flags inputs and textareas, not plain elements", () => {
		expect(isEditableTarget(document.createElement("input"))).toBe(true)
		expect(isEditableTarget(document.createElement("textarea"))).toBe(true)
		expect(isEditableTarget(document.createElement("div"))).toBe(false)
		expect(isEditableTarget(null)).toBe(false)
	})
})
