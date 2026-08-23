// AI state: provider config, the streaming output panel in the reading pane,
// and per-message artifacts (list digests, triage labels).
import { create } from "zustand"
import { Events } from "@wailsio/runtime"
import { toast } from "sonner"

import { setComposeField, useComposeStore } from "@/stores/compose"
import { getActiveMessage, useMailStore } from "@/stores/mail"
import * as AIService from "~/bindings/mailyard/aiservice"
import type {
	Config,
	StreamChunk,
} from "~/bindings/mailyard/internal/ai/models"
import type { UnsubscribeCandidate } from "~/bindings/mailyard/internal/store/models"
import type { Message } from "~/bindings/mailyard/internal/store/models"

export type AIPanelKind = "summary" | "translation"

interface AIPanel {
	kind: AIPanelKind
	/** accountId:threadId — the panel only renders on its own thread. */
	threadKey: string
	content: string
	streaming: boolean
	error: string
}

interface AIState {
	config: Config | null
	panel: AIPanel | null
	/** message id → one-line digest (opt-in list summaries). */
	summaries: Record<string, string>
	/** message id → "high" | "normal" | "low". */
	triage: Record<string, string>
	unsubscribes: UnsubscribeCandidate[] | null
	unsubscribesOpen: boolean
	/** Bumped whenever a thread's action items change; cards refetch. */
	actionItemsRefresh: number
	/** threadKey currently being extracted (card shows progress). */
	extractingActionItems: string | null
	translateOpen: boolean
	busy: boolean
}

export const useAIStore = create<AIState>(() => ({
	config: null,
	panel: null,
	summaries: {},
	triage: {},
	unsubscribes: null,
	unsubscribesOpen: false,
	actionItemsRefresh: 0,
	extractingActionItems: null,
	translateOpen: false,
	busy: false,
}))

export function threadKeyOf(message: Message) {
	return `${message.accountId}:${message.threadId}`
}

export async function loadAIConfig() {
	const config = await AIService.GetConfig()
	useAIStore.setState({ config })
}

// ---- streaming plumbing ----------------------------------------------------

type ChunkHandler = (chunk: StreamChunk) => void
const handlers = new Map<string, ChunkHandler>()
// Chunks can beat handler registration over the event bus (especially cached
// replays, which emit immediately) — buffer orphans and flush on register,
// or the request "hangs" forever.
const orphanChunks = new Map<string, StreamChunk[]>()
// Wails dispatches each emitted event on its own goroutine, so events for
// one request can arrive OUT OF ORDER (a done before its content — the empty
// panel bug). Chunks are reassembled by seq before delivery.
const sequencers = new Map<string, { next: number; ahead: Map<number, StreamChunk> }>()

function handleChunk(chunk: StreamChunk) {
	const sequencer = sequencers.get(chunk.requestId) ?? {
		next: 0,
		ahead: new Map<number, StreamChunk>(),
	}
	sequencers.set(chunk.requestId, sequencer)

	if (chunk.seq > sequencer.next) {
		sequencer.ahead.set(chunk.seq, chunk)
		return
	}
	if (chunk.seq < sequencer.next) {
		return // duplicate
	}

	let current: StreamChunk | undefined = chunk
	while (current) {
		deliverChunk(current)
		sequencer.next++
		if (current.done) {
			sequencers.delete(current.requestId)
			return
		}
		current = sequencer.ahead.get(sequencer.next)
		if (current) sequencer.ahead.delete(sequencer.next)
	}
}

function deliverChunk(chunk: StreamChunk) {
	const handler = handlers.get(chunk.requestId)
	if (!handler) {
		const buffered = orphanChunks.get(chunk.requestId) ?? []
		buffered.push(chunk)
		orphanChunks.set(chunk.requestId, buffered)
		return
	}
	handler(chunk)
	if (chunk.done) {
		handlers.delete(chunk.requestId)
	}
}

/** Registers a stream handler and replays anything that arrived early. */
function registerHandler(requestId: string, handler: ChunkHandler) {
	handlers.set(requestId, handler)
	const buffered = orphanChunks.get(requestId)
	if (!buffered) return
	orphanChunks.delete(requestId)
	for (const chunk of buffered) {
		deliverChunk(chunk)
	}
}

/** Streams into the reading-pane panel. */
async function streamIntoPanel(
	kind: AIPanelKind,
	threadKey: string,
	start: () => Promise<string>
) {
	useAIStore.setState({
		panel: { kind, threadKey, content: "", streaming: true, error: "" },
	})
	try {
		const requestId = await start()
		registerHandler(requestId, (chunk) => {
			useAIStore.setState((s) => {
				if (!s.panel || s.panel.threadKey !== threadKey) return s
				const content = s.panel.content + (chunk.chunk ?? "")
				// A silent empty finish must never look like success.
				const error =
					chunk.error ||
					(chunk.done && !content
						? "No output arrived — is Ollama running and the model pulled? (Settings ⌘,)"
						: "")
				return {
					panel: { ...s.panel, content, streaming: !chunk.done, error },
				}
			})
		})
	} catch (raw: unknown) {
		useAIStore.setState((s) =>
			s.panel
				? {
						panel: {
							...s.panel,
							streaming: false,
							error: raw instanceof Error ? raw.message : String(raw),
						},
					}
				: s
		)
	}
}

export function closeAIPanel() {
	useAIStore.setState({ panel: null })
}

// ---- feature actions -------------------------------------------------------

export function summarizeThread(message: Message) {
	void streamIntoPanel("summary", threadKeyOf(message), () =>
		AIService.SummarizeThread(message.accountId, message.threadId)
	)
}

/** Full-body translate: fetches the active body first for better input. */
export async function translateActiveThread(language: string) {
	const message = activeMailMessage()
	if (!message) return
	useAIStore.setState({ translateOpen: false })
	await streamIntoPanel("translation", threadKeyOf(message), async () => {
		const { GetMessageBody } = await import("~/bindings/mailyard/mailservice")
		const body = await GetMessageBody(message.id).catch(() => null)
		const text = body?.textBody || message.snippet
		return AIService.Translate(`Subject: ${message.subject}\n\n${text}`, language)
	})
}

/**
 * Re-extracts a thread's action items (persisted server-side; open items
 * replaced, done history kept) and refreshes the reading-pane card.
 */
export async function extractActionItems(message: Message) {
	const key = threadKeyOf(message)
	useAIStore.setState({ extractingActionItems: key })
	try {
		const items =
			(await AIService.ActionItems(message.accountId, message.threadId)) ?? []
		const open = items.filter((item) => !item.done).length
		useAIStore.setState((s) => ({
			actionItemsRefresh: s.actionItemsRefresh + 1,
		}))
		toast(
			open === 0
				? "No open action items in this thread"
				: `${open} open action ${open === 1 ? "item" : "items"}`
		)
	} catch (raw: unknown) {
		toast.error(raw instanceof Error ? raw.message : String(raw))
	} finally {
		useAIStore.setState({ extractingActionItems: null })
	}
}

/** Toggles a checklist entry and refreshes cards. */
export async function toggleActionItem(id: number, done: boolean) {
	try {
		await AIService.SetActionItemDone(id, done)
		useAIStore.setState((s) => ({
			actionItemsRefresh: s.actionItemsRefresh + 1,
		}))
	} catch (raw: unknown) {
		toast.error(raw instanceof Error ? raw.message : String(raw))
	}
}

/** Opens a reply and streams an AI draft above the quoted original. */
export async function draftReplyWithAI(message: Message) {
	const { composeFromMessage } = await import("@/stores/compose")
	await composeFromMessage(message, "reply")
	const quoted = useComposeStore.getState().body

	useComposeStore.setState({ aiWriting: true })
	try {
		const requestId = await AIService.DraftReply(message.accountId, message.threadId)
		let draft = ""
		registerHandler(requestId, (chunk) => {
			if (chunk.error) {
				toast.error(chunk.error)
				useComposeStore.setState({ aiWriting: false })
				return
			}
			if (chunk.done) {
				useComposeStore.setState({ aiWriting: false })
				return
			}
			draft += chunk.chunk
			setComposeField("body", draft + quoted)
		})
	} catch (raw: unknown) {
		toast.error(raw instanceof Error ? raw.message : String(raw))
		useComposeStore.setState({ aiWriting: false })
	}
}

/**
 * Writes the email from the user's instructions, streaming into the compose
 * body. Follow-up instructions are conversational: the model sees the
 * current draft plus earlier dictations and outputs the complete revised
 * email (edit or replacement — its call), which replaces the body.
 *
 * The model's first line is "Subject: …"; it fills the subject field only
 * when that field is empty, so replies ("Re: …") and user-typed subjects
 * are never overwritten. The line is buffered out of the body stream.
 */
export async function composeFromInstructions(instructions: string) {
	const compose = useComposeStore.getState()
	const trimmed = instructions.trim()
	if (!compose.accountId || !trimmed) return
	useComposeStore.setState({ aiWriting: true })
	try {
		const requestId = await AIService.ComposeInstructed({
			accountId: compose.accountId,
			replyToMessageId: compose.replyToMessageId,
			instructions: trimmed,
			currentDraft: compose.body,
			priorInstructions: compose.aiInstructionHistory,
		})
		const subjectWasEmpty = compose.subject.trim() === ""
		let raw = ""
		let headerDone = false
		let bodyStart = 0
		registerHandler(requestId, (chunk) => {
			if (chunk.error) {
				toast.error(chunk.error)
				useComposeStore.setState({ aiWriting: false })
				return
			}
			if (chunk.done) {
				if (!headerDone) setComposeField("body", raw)
				useComposeStore.setState((s) => ({
					aiWriting: false,
					aiInstructionHistory: [...s.aiInstructionHistory, trimmed],
				}))
				return
			}
			raw += chunk.chunk
			if (!headerDone) {
				// Could still be mid-way through the literal "Subject:" prefix.
				if ("Subject:".startsWith(raw)) return
				if (raw.startsWith("Subject:")) {
					const newline = raw.indexOf("\n")
					if (newline === -1) return // subject line still streaming
					const subject = raw.slice("Subject:".length, newline).trim()
					if (subject && subjectWasEmpty) {
						setComposeField("subject", subject)
					}
					bodyStart = newline + 1
				}
				headerDone = true
			}
			setComposeField("body", raw.slice(bodyStart).replace(/^\n+/, ""))
		})
	} catch (raw: unknown) {
		toast.error(raw instanceof Error ? raw.message : String(raw))
		useComposeStore.setState({ aiWriting: false })
	}
}

/** Rewrites the current compose body in the requested tone (streaming). */
export async function rewriteComposeBody(tone: string) {
	const body = useComposeStore.getState().body
	if (!body.trim()) return
	useComposeStore.setState({ aiWriting: true })
	try {
		const requestId = await AIService.Rewrite(body, tone)
		let rewritten = ""
		registerHandler(requestId, (chunk) => {
			if (chunk.error) {
				toast.error(chunk.error)
				useComposeStore.setState({ aiWriting: false })
				return
			}
			if (chunk.done) {
				useComposeStore.setState({ aiWriting: false })
				return
			}
			rewritten += chunk.chunk
			setComposeField("body", rewritten)
		})
	} catch (raw: unknown) {
		toast.error(raw instanceof Error ? raw.message : String(raw))
		useComposeStore.setState({ aiWriting: false })
	}
}

export async function triageInbox() {
	useAIStore.setState({ busy: true })
	try {
		const { accountFilter } = useMailStore.getState()
		const results = (await AIService.TriageInbox(accountFilter)) ?? []
		const triage: Record<string, string> = { ...useAIStore.getState().triage }
		for (const result of results) {
			triage[String(result.messageId)] = result.priority
		}
		useAIStore.setState({ triage })
		const high = results.filter((r) => r.priority === "high").length
		toast(`Triaged ${results.length} emails — ${high} high priority`)
	} catch (raw: unknown) {
		toast.error(raw instanceof Error ? raw.message : String(raw))
	} finally {
		useAIStore.setState({ busy: false })
	}
}

export async function suggestUnsubscribes() {
	useAIStore.setState({ unsubscribesOpen: true, unsubscribes: null })
	try {
		const candidates = (await AIService.SuggestUnsubscribes()) ?? []
		useAIStore.setState({ unsubscribes: candidates })
	} catch (raw: unknown) {
		toast.error(raw instanceof Error ? raw.message : String(raw))
		useAIStore.setState({ unsubscribesOpen: false })
	}
}

export function setUnsubscribesOpen(open: boolean) {
	useAIStore.setState({ unsubscribesOpen: open })
}

export function setTranslateOpen(open: boolean) {
	useAIStore.setState({ translateOpen: open })
}

export function activeMailMessage(): Message | undefined {
	return getActiveMessage()
}

// ---- per-message artifacts (list digests + triage badges) ------------------

export async function refreshMessageArtifacts() {
	const { config } = useAIStore.getState()
	const ids = useMailStore.getState().messages.map((m) => m.id)
	if (ids.length === 0) return

	const wants: Promise<void>[] = []
	if (config?.listSummaries) {
		wants.push(
			AIService.MessageArtifacts("msg-summary", ids).then((map) => {
				useAIStore.setState((s) => ({
					summaries: { ...s.summaries, ...normalize(map) },
				}))
			})
		)
	}
	wants.push(
		AIService.MessageArtifacts("triage", ids).then((map) => {
			const triage: Record<string, string> = {}
			for (const [id, content] of Object.entries(normalize(map))) {
				triage[id] = content.split("|")[0]
			}
			useAIStore.setState((s) => ({ triage: { ...s.triage, ...triage } }))
		})
	)
	await Promise.all(wants).catch(() => {})
}

function normalize(map: { [key: string]: string | undefined } | null) {
	const dense: Record<string, string> = {}
	for (const [key, value] of Object.entries(map ?? {})) {
		if (typeof value === "string") dense[key] = value
	}
	return dense
}

// Exposed for tests — the stream plumbing is where hangs hide.
export const _test = { handleChunk }

// ---- init ------------------------------------------------------------------

let initialized = false

export async function initAIStore() {
	if (initialized) return // idempotent
	initialized = true

	Events.On("ai:stream", (event) => {
		const chunk = (Array.isArray(event.data) ? event.data[0] : event.data) as StreamChunk
		handleChunk(chunk)
	})
	Events.On("ai:artifacts-updated", () => {
		refreshMessageArtifacts().catch(() => {})
	})

	// Artifacts follow the visible list.
	useMailStore.subscribe((state, previous) => {
		if (state.messages !== previous.messages) {
			refreshMessageArtifacts().catch(() => {})
		}
	})

	await loadAIConfig().catch(() => {})
}
