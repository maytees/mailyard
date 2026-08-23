import { beforeEach, describe, expect, it, vi } from "vitest"

// The stores pull in the whole binding surface transitively — stub it all.
vi.mock("@wailsio/runtime", () => ({
	Events: { On: vi.fn(), Emit: vi.fn(async () => {}) },
	Browser: { OpenURL: vi.fn(async () => {}) },
	Application: { Quit: vi.fn(async () => {}) },
}))
vi.mock("sonner", () => ({
	toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
}))
vi.mock("~/bindings/mailyard/aiservice", () => ({
	SummarizeThread: vi.fn(),
	GetConfig: vi.fn(async () => null),
	MessageArtifacts: vi.fn(async () => ({})),
}))
vi.mock("~/bindings/mailyard/mailservice", () => ({}))
vi.mock("~/bindings/mailyard/sendservice", () => ({}))
vi.mock("~/bindings/mailyard/accountservice", () => ({}))

import { SummarizeThread } from "~/bindings/mailyard/aiservice"
import { summarizeThread, useAIStore, _test } from "@/stores/ai"
import type { Message } from "~/bindings/mailyard/internal/store/models"

const message = {
	id: 1,
	accountId: "acc1",
	threadId: "<t1@x>",
} as Message

function chunk(
	partial: Partial<{
		requestId: string
		seq: number
		chunk: string
		done: boolean
		error: string
	}>
) {
	return { requestId: "req-1", seq: 0, chunk: "", done: false, error: "", ...partial }
}

async function settle() {
	// Let streamIntoPanel's awaits resolve.
	await Promise.resolve()
	await Promise.resolve()
}

beforeEach(() => {
	useAIStore.setState({ panel: null })
	vi.mocked(SummarizeThread).mockReset()
})

describe("ai stream → panel", () => {
	it("delivers a single-chunk result (structured summaries)", async () => {
		vi.mocked(SummarizeThread).mockResolvedValue("req-1")
		summarizeThread(message)
		await settle()

		_test.handleChunk(chunk({ seq: 0, chunk: "Jamie confirmed Friday." }))
		_test.handleChunk(chunk({ seq: 1, done: true }))

		const panel = useAIStore.getState().panel
		expect(panel?.content).toBe("Jamie confirmed Friday.")
		expect(panel?.streaming).toBe(false)
		expect(panel?.error).toBe("")
	})

	it("replays chunks that arrive before the handler registers", async () => {
		// The binding promise resolves AFTER the events landed — the race that
		// used to hang forever.
		let resolveCall: (id: string) => void = () => {}
		vi.mocked(SummarizeThread).mockImplementation(
			() => new Promise((resolve) => (resolveCall = resolve)) as never
		)
		summarizeThread(message)
		await settle()

		_test.handleChunk(chunk({ seq: 0, chunk: "Early bird." }))
		_test.handleChunk(chunk({ seq: 1, done: true }))
		resolveCall("req-1")
		await settle()

		const panel = useAIStore.getState().panel
		expect(panel?.content).toBe("Early bird.")
		expect(panel?.streaming).toBe(false)
	})

	it("reorders a done that arrives before its content (wails goroutine race)", async () => {
		vi.mocked(SummarizeThread).mockResolvedValue("req-1")
		summarizeThread(message)
		await settle()

		// The exact probe-observed order: done first, content second.
		_test.handleChunk(chunk({ seq: 1, done: true }))
		_test.handleChunk(chunk({ seq: 0, chunk: "Out of order but intact." }))

		const panel = useAIStore.getState().panel
		expect(panel?.content).toBe("Out of order but intact.")
		expect(panel?.streaming).toBe(false)
		expect(panel?.error).toBe("")
	})

	it("surfaces backend errors", async () => {
		vi.mocked(SummarizeThread).mockResolvedValue("req-1")
		summarizeThread(message)
		await settle()

		_test.handleChunk(chunk({ done: true, error: "model not found" }))
		expect(useAIStore.getState().panel?.error).toBe("model not found")
	})

	it("never finishes silently empty", async () => {
		vi.mocked(SummarizeThread).mockResolvedValue("req-1")
		summarizeThread(message)
		await settle()

		_test.handleChunk(chunk({ done: true }))
		const panel = useAIStore.getState().panel
		expect(panel?.streaming).toBe(false)
		expect(panel?.error).toContain("No output arrived")
	})
})
