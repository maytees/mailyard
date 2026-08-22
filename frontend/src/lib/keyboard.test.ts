import { describe, expect, it } from "vitest"

import {
	advanceSequence,
	formatShortcut,
	isMac,
	isSequenceShortcut,
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

describe("sequences", () => {
	const sequences = [
		{ keys: ["g", "i"], value: "inbox" },
		{ keys: ["g", "s"], value: "sent" },
	]

	it("classifies g+i as a sequence, mod+shift+s as a chord", () => {
		expect(isSequenceShortcut("g+i")).toBe(true)
		expect(isSequenceShortcut("mod+shift+s")).toBe(false) // one plain key
		expect(isSequenceShortcut("e")).toBe(false)
	})

	it("never chord-matches a sequence on its first key", () => {
		expect(matchesShortcut(keyEvent("g"), "g+i")).toBe(false)
	})

	it("completes a sequence across two keys", () => {
		const first = advanceSequence([], "g", sequences)
		expect(first.match).toBeUndefined()
		expect(first.pending).toEqual(["g"])

		const second = advanceSequence(first.pending, "i", sequences)
		expect(second.match).toBe("inbox")
		expect(second.pending).toEqual([])
	})

	it("distinguishes sequences sharing a prefix", () => {
		const first = advanceSequence([], "g", sequences)
		expect(advanceSequence(first.pending, "s", sequences).match).toBe("sent")
	})

	it("drops a dead-end buffer", () => {
		const first = advanceSequence([], "g", sequences)
		const dead = advanceSequence(first.pending, "x", sequences)
		expect(dead.match).toBeUndefined()
		expect(dead.pending).toEqual([])
	})

	it("recovers when a new prefix starts mid-buffer", () => {
		// g, g → the trailing g still opens a sequence.
		const first = advanceSequence([], "g", sequences)
		const second = advanceSequence(first.pending, "g", sequences)
		expect(second.pending).toEqual(["g"])
		expect(advanceSequence(second.pending, "i", sequences).match).toBe("inbox")
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
