// AI state: provider config, the streaming output panel in the reading pane,
// and per-message artifacts (list digests, triage labels).
import { create } from "zustand"
import { Events } from "@wailsio/runtime"
import { toast } from "sonner"

import { setComposeField, useComposeStore } from "@/stores/compose"
import { useMailStore } from "@/stores/mail"
import * as AIService from "~/bindings/mailyard/aiservice"
import type {
	ActionItem,
	Config,
	StreamChunk,
} from "~/bindings/mailyard/internal/ai/models"
import type { UnsubscribeCandidate } from "~/bindings/mailyard/internal/store/models"
import type { Message } from "~/bindings/mailyard/internal/store/models"

export type AIPanelKind = "summary" | "translation" | "action-items"

interface AIPanel {
	kind: AIPanelKind
	/** accountId:threadId — the panel only renders on its own thread. */
	threadKey: string
	content: string
	items: ActionItem[]
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

function handleChunk(chunk: StreamChunk) {
	const handler = handlers.get(chunk.requestId)
	if (!handler) return
	handler(chunk)
	if (chunk.done) {
		handlers.delete(chunk.requestId)
	}
}

/** Streams into the reading-pane panel. */
async function streamIntoPanel(
	kind: AIPanelKind,
	threadKey: string,
	start: () => Promise<string>
) {
	useAIStore.setState({
		panel: { kind, threadKey, content: "", items: [], streaming: true, error: "" },
	})
	try {
		const requestId = await start()
		handlers.set(requestId, (chunk) => {
			useAIStore.setState((s) => {
				if (!s.panel || s.panel.threadKey !== threadKey) return s
				return {
					panel: {
						...s.panel,
						content: s.panel.content + chunk.chunk,
						streaming: !chunk.done,
						error: chunk.error,
					},
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

export async function extractActionItems(message: Message) {
	const key = threadKeyOf(message)
	useAIStore.setState({
		panel: {
			kind: "action-items", threadKey: key, content: "", items: [],
			streaming: true, error: "",
		},
	})
	try {
		const items = (await AIService.ActionItems(message.accountId, message.threadId)) ?? []
		useAIStore.setState((s) =>
			s.panel?.threadKey === key
				? { panel: { ...s.panel, items, streaming: false } }
				: s
		)
	} catch (raw: unknown) {
		useAIStore.setState((s) =>
			s.panel?.threadKey === key
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

/** Opens a reply and streams an AI draft above the quoted original. */
export async function draftReplyWithAI(message: Message) {
	const { composeFromMessage } = await import("@/stores/compose")
	await composeFromMessage(message, "reply")
	const quoted = useComposeStore.getState().body

	try {
		const requestId = await AIService.DraftReply(message.accountId, message.threadId)
		let draft = ""
		handlers.set(requestId, (chunk) => {
			if (chunk.error) {
				toast.error(chunk.error)
				return
			}
			draft += chunk.chunk
			setComposeField("body", draft + quoted)
		})
	} catch (raw: unknown) {
		toast.error(raw instanceof Error ? raw.message : String(raw))
	}
}

/** Rewrites the current compose body in the requested tone (streaming). */
export async function rewriteComposeBody(tone: string) {
	const body = useComposeStore.getState().body
	if (!body.trim()) return
	try {
		const requestId = await AIService.Rewrite(body, tone)
		let rewritten = ""
		handlers.set(requestId, (chunk) => {
			if (chunk.error) {
				toast.error(chunk.error)
				return
			}
			rewritten += chunk.chunk
			setComposeField("body", rewritten)
		})
	} catch (raw: unknown) {
		toast.error(raw instanceof Error ? raw.message : String(raw))
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
	const { messages, activeMessageId, detachedMessage } = useMailStore.getState()
	return (
		messages.find((m) => m.id === activeMessageId) ??
		(detachedMessage?.id === activeMessageId ? detachedMessage : undefined)
	)
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
