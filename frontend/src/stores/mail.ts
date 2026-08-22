// The live mail store: pages of real messages from the Go backend, the
// active selection, and the account/folder filters. Refreshes on the sync
// engine's mail:changed events.
import { create } from "zustand"
import { Events } from "@wailsio/runtime"

import * as MailService from "~/bindings/mailyard/mailservice"
import type { Message } from "~/bindings/mailyard/internal/store/models"

const PAGE_SIZE = 50

export interface SyncState {
	state: "syncing" | "idle" | "error"
	error?: string
}

interface MailState {
	messages: Message[]
	activeMessageId: number | null
	/** A selection that isn't in the current list page (e.g. a search hit). */
	detachedMessage: Message | null
	/** "" = unified view across all accounts. */
	accountFilter: string
	folderRole: string
	/** Per-account unread inbox counts (rail badges + header). */
	unreadCounts: Record<string, number>
	/** Unfinished mail across all accounts (palette badge). */
	draftCount: number
	/** Per-account sync engine status (sidebar indicator). */
	syncStatus: Record<string, SyncState>
	loading: boolean
	hasMore: boolean
}

export const useMailStore = create<MailState>(() => ({
	messages: [],
	activeMessageId: null,
	detachedMessage: null,
	accountFilter: "",
	folderRole: "inbox",
	unreadCounts: {},
	draftCount: 0,
	syncStatus: {},
	loading: false,
	hasMore: false,
}))

function currentFilter(offset: number) {
	const { accountFilter, folderRole } = useMailStore.getState()
	return {
		accountId: accountFilter,
		folderRole,
		limit: PAGE_SIZE,
		offset,
	}
}

/** Reloads page one of the current view, keeping the selection when it survives. */
export async function refreshMailList() {
	useMailStore.setState({ loading: true })
	try {
		const messages = (await MailService.ListMessages(currentFilter(0))) ?? []
		const { activeMessageId, detachedMessage } = useMailStore.getState()
		const stillThere =
			messages.some((m) => m.id === activeMessageId) ||
			detachedMessage?.id === activeMessageId
		useMailStore.setState({
			messages,
			hasMore: messages.length === PAGE_SIZE,
			activeMessageId: stillThere ? activeMessageId : (messages[0]?.id ?? null),
		})
	} finally {
		useMailStore.setState({ loading: false })
	}
}

export async function loadMoreMessages() {
	const { loading, hasMore, messages } = useMailStore.getState()
	if (loading || !hasMore) return
	useMailStore.setState({ loading: true })
	try {
		const next =
			(await MailService.ListMessages(currentFilter(messages.length))) ?? []
		const seen = new Set(messages.map((m) => m.id))
		useMailStore.setState({
			messages: [...messages, ...next.filter((m) => !seen.has(m.id))],
			hasMore: next.length === PAGE_SIZE,
		})
	} finally {
		useMailStore.setState({ loading: false })
	}
}

export async function refreshUnreadCounts() {
	// The generated map type has optional values; normalize to a dense record.
	const raw = (await MailService.UnreadCounts()) ?? {}
	const counts: Record<string, number> = {}
	for (const [accountId, count] of Object.entries(raw)) {
		if (typeof count === "number") counts[accountId] = count
	}
	useMailStore.setState({ unreadCounts: counts })

	MailService.CountByRole("drafts")
		.then((draftCount) => useMailStore.setState({ draftCount }))
		.catch(() => {})
}

/** Selects a message and marks it read (optimistically; Go pushes \Seen). */
export function setActiveMessage(id: number | null) {
	useMailStore.setState({ activeMessageId: id, detachedMessage: null })
	if (id == null) return

	const { messages } = useMailStore.getState()
	const message = messages.find((m) => m.id === id)
	if (!message || !message.unread) return

	useMailStore.setState((s) => {
		const counts: Record<string, number> = { ...s.unreadCounts }
		counts[message.accountId] = Math.max(0, (counts[message.accountId] ?? 1) - 1)
		return {
			messages: s.messages.map((m) =>
				m.id === id ? { ...m, unread: false } : m
			),
			unreadCounts: counts,
		}
	})
	MailService.MarkRead(id, true).catch((error: unknown) =>
		console.error("mark read failed", error)
	)
}

/** Moves the selection down/up the list (j/k). */
export function selectNeighborMessage(direction: 1 | -1) {
	const { messages, activeMessageId } = useMailStore.getState()
	if (messages.length === 0) return
	const index = messages.findIndex((m) => m.id === activeMessageId)
	if (index === -1) {
		setActiveMessage(messages[0].id)
		return
	}
	const next = messages[index + direction]
	if (next) {
		setActiveMessage(next.id)
	} else if (direction === 1) {
		// Fetch the next page when j runs off the end.
		void loadMoreMessages()
	}
}

/** The selected message — from the list page or a detached search hit. */
export function getActiveMessage(): Message | undefined {
	const { messages, activeMessageId, detachedMessage } = useMailStore.getState()
	return (
		messages.find((m) => m.id === activeMessageId) ??
		(detachedMessage?.id === activeMessageId ? detachedMessage : undefined)
	)
}

/** Opens a message that may live outside the current view (search hits). */
export function openMessage(message: Message) {
	useMailStore.setState({
		activeMessageId: message.id,
		detachedMessage: message,
	})
	if (message.unread) {
		MailService.MarkRead(message.id, true)
			.then(() => refreshUnreadCounts())
			.catch((error: unknown) => console.error("mark read failed", error))
	}
}

/** Toggle-style account filter: selecting the active account clears it. */
export function setAccountFilter(accountId: string) {
	const current = useMailStore.getState().accountFilter
	useMailStore.setState({
		accountFilter: current === accountId ? "" : accountId,
		activeMessageId: null,
	})
	void refreshMailList()
}

export function setFolderRole(role: string) {
	if (useMailStore.getState().folderRole === role) return
	useMailStore.setState({ folderRole: role, activeMessageId: null })
	void refreshMailList()
}

let initialized = false
let refreshTimer: ReturnType<typeof setTimeout> | null = null

export async function initMailStore() {
	if (initialized) return // idempotent
	initialized = true

	Events.On("sync:status", (event) => {
		const data = (Array.isArray(event.data) ? event.data[0] : event.data) as {
			accountId: string
			state: SyncState["state"]
			error?: string
		}
		useMailStore.setState((s) => ({
			syncStatus: {
				...s.syncStatus,
				[data.accountId]: { state: data.state, error: data.error },
			},
		}))
	})

	// Sync events arrive in bursts (one per folder); trail-debounce the reload.
	Events.On("mail:changed", () => {
		if (refreshTimer) clearTimeout(refreshTimer)
		refreshTimer = setTimeout(() => {
			refreshMailList().catch((error: unknown) =>
				console.error("mail refresh failed", error)
			)
			refreshUnreadCounts().catch(() => {})
		}, 300)
	})

	await Promise.all([refreshMailList(), refreshUnreadCounts()])
}
