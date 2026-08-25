// User-facing mail actions with optimistic UI and delayed, undoable
// execution: rows disappear immediately, the server call fires after the
// undo window closes.
import { toast } from "sonner"

import {
	getActiveMessage,
	refreshMailList,
	refreshUnreadCounts,
	useMailStore,
} from "@/stores/mail"
import * as MailService from "~/bindings/mailyard/mailservice"

const UNDO_WINDOW_MS = 5000

const activeMessage = getActiveMessage

/** Optimistically drops a row and advances the selection to its neighbor. */
function removeRowLocally(id: number) {
	useMailStore.setState((s) => {
		const index = s.messages.findIndex((m) => m.id === id)
		const messages = s.messages.filter((m) => m.id !== id)
		const next = messages[Math.min(index, messages.length - 1)]
		return {
			messages,
			activeMessageId:
				s.activeMessageId === id ? (next?.id ?? null) : s.activeMessageId,
		}
	})
}

/**
 * Runs a destructive action after the undo window: the row vanishes now,
 * Undo restores it (backend untouched until the timer fires).
 */
function runUndoable(id: number, label: string, execute: () => Promise<void>) {
	removeRowLocally(id)
	// The timer runs independently of the toast: dismissing ≠ undoing.
	const timer = setTimeout(() => {
		execute().catch((error: unknown) => {
			console.error(`${label} failed`, error)
			toast.error(`${label} failed`)
			void refreshMailList()
		})
	}, UNDO_WINDOW_MS)

	toast(label, {
		duration: UNDO_WINDOW_MS,
		action: {
			label: "Undo",
			onClick: () => {
				clearTimeout(timer)
				void refreshMailList()
			},
		},
	})
}

export function archiveActive() {
	const message = activeMessage()
	if (!message) return
	runUndoable(message.id, "Archived", () => MailService.Archive(message.id))
}

/**
 * Archives everything in the current label view. Deliberately refuses the
 * "All" view — a whole-inbox sweep is one misclick from disaster; per-label
 * sweeps are the intended clear-the-clutter gesture.
 */
export async function archiveAllInView() {
	const { accountFilter, folderRole, labelFilter } = useMailStore.getState()
	if (folderRole !== "inbox") {
		toast("Archive all works in the inbox")
		return
	}
	if (labelFilter === 0) {
		toast("Pick a label first — archiving all of All is a lot")
		return
	}
	try {
		const count = await MailService.ArchiveAll({
			accountId: accountFilter,
			folderRole,
			labelId: labelFilter,
			limit: 0,
			offset: 0,
		})
		await refreshMailList()
		refreshUnreadCounts()
		toast(count > 0 ? `Archived ${count} emails` : "Nothing to archive")
	} catch (raw: unknown) {
		toast.error(raw instanceof Error ? raw.message : String(raw))
		void refreshMailList()
	}
}

export function trashActive() {
	const message = activeMessage()
	if (!message) return
	runUndoable(message.id, "Deleted", () => MailService.Trash(message.id))
}

export function toggleStarActive() {
	const message = activeMessage()
	if (!message) return
	const starred = !message.starred
	useMailStore.setState((s) => ({
		messages: s.messages.map((m) => (m.id === message.id ? { ...m, starred } : m)),
	}))
	MailService.SetStarred(message.id, starred).catch((error: unknown) => {
		console.error("star failed", error)
		void refreshMailList()
	})
}

export function markActiveUnread() {
	const message = activeMessage()
	if (!message || message.unread) return
	useMailStore.setState((s) => {
		const counts = { ...s.unreadCounts }
		counts[message.accountId] = (counts[message.accountId] ?? 0) + 1
		return {
			messages: s.messages.map((m) =>
				m.id === message.id ? { ...m, unread: true } : m
			),
			unreadCounts: counts,
		}
	})
	MailService.MarkRead(message.id, false).catch((error: unknown) => {
		console.error("mark unread failed", error)
		void refreshMailList()
	})
}

export function markAllRead() {
	const { accountFilter, folderRole } = useMailStore.getState()
	MailService.MarkAllRead({
		accountId: accountFilter,
		folderRole,
		labelId: 0,
		limit: 0,
		offset: 0,
	})
		.then(() => Promise.all([refreshMailList(), refreshUnreadCounts()]))
		.then(() => toast("Marked all as read"))
		.catch((error: unknown) => console.error("mark all read failed", error))
}
