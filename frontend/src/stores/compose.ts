// Compose state: one sheet, prefilled differently for new/reply/forward.
// Lives in a store (not component state) so palette commands and mail-view
// buttons can both drive it.
import { create } from "zustand"
import { toast } from "sonner"

import { formatFullDate } from "@/lib/format"
import { useAccountsStore } from "@/stores/accounts"
import { useMailStore } from "@/stores/mail"
import * as MailService from "~/bindings/mailyard/mailservice"
import * as SendService from "~/bindings/mailyard/sendservice"
import type { PickedFile } from "~/bindings/mailyard/models"
import type { Message } from "~/bindings/mailyard/internal/store/models"

export type ComposeMode = "new" | "reply" | "reply-all" | "forward"

interface ComposeState {
	open: boolean
	mode: ComposeMode
	accountId: string
	to: string
	cc: string
	bcc: string
	subject: string
	body: string
	attachments: PickedFile[]
	inReplyTo: string
	references: string
	replyToMessageId: number
	/** Local id of the last autosaved draft version (replaced on resave). */
	draftId: number
	sending: boolean
	error: string
}

const emptyDraft = {
	mode: "new" as ComposeMode,
	accountId: "",
	to: "",
	cc: "",
	bcc: "",
	subject: "",
	body: "",
	attachments: [] as PickedFile[],
	inReplyTo: "",
	references: "",
	replyToMessageId: 0,
	draftId: 0,
	sending: false,
	error: "",
}

export const useComposeStore = create<ComposeState>(() => ({
	open: false,
	...emptyDraft,
}))

export function setComposeField<K extends keyof ComposeState>(
	field: K,
	value: ComposeState[K]
) {
	useComposeStore.setState({ [field]: value } as Pick<ComposeState, K>)
	scheduleDraftSave()
}

export function openCompose(prefill: Partial<ComposeState> = {}) {
	const fallbackAccount =
		useMailStore.getState().accountFilter ||
		(useAccountsStore.getState().accounts[0]?.id ?? "")
	useComposeStore.setState({
		open: true,
		...emptyDraft,
		accountId: prefill.accountId || fallbackAccount,
		...prefill,
	})
}

/** Closes the sheet, autosaving anything worth keeping as a draft. */
export function closeCompose() {
	const state = useComposeStore.getState()
	cancelDraftSave()
	if (!state.sending && hasContent(state)) {
		void saveDraftNow()
	}
	useComposeStore.setState({ open: false })
}

function hasContent(state: ComposeState) {
	return Boolean(state.to.trim() || state.subject.trim() || state.body.trim())
}

function splitAddresses(raw: string): string[] {
	return raw
		.split(/[,;\s]+/)
		.map((part) => part.trim())
		.filter(Boolean)
}

function toOutgoing(state: ComposeState) {
	return {
		accountId: state.accountId,
		to: splitAddresses(state.to),
		cc: splitAddresses(state.cc),
		bcc: splitAddresses(state.bcc),
		subject: state.subject,
		textBody: state.body,
		inReplyTo: state.inReplyTo,
		references: state.references,
		attachmentPaths: state.attachments.map((file) => file.path),
		replyToMessageId: state.replyToMessageId,
	}
}

export async function sendCompose() {
	const state = useComposeStore.getState()
	if (state.sending) return
	useComposeStore.setState({ sending: true, error: "" })
	cancelDraftSave()
	try {
		await SendService.SendMessage(toOutgoing(state))
		if (state.draftId) {
			SendService.DeleteDraft(state.draftId).catch(() => {})
		}
		useComposeStore.setState({ open: false, ...emptyDraft })
		toast.success("Message sent")
	} catch (raw: unknown) {
		useComposeStore.setState({
			sending: false,
			error: raw instanceof Error ? raw.message : String(raw),
		})
	}
}

export async function pickComposeAttachments() {
	try {
		const picked = (await SendService.PickAttachments()) ?? []
		if (picked.length === 0) return
		const current = useComposeStore.getState().attachments
		const seen = new Set(current.map((file) => file.path))
		useComposeStore.setState({
			attachments: [...current, ...picked.filter((f) => !seen.has(f.path))],
		})
		scheduleDraftSave()
	} catch (error) {
		console.error("pick attachments failed", error)
	}
}

export function removeComposeAttachment(path: string) {
	useComposeStore.setState((s) => ({
		attachments: s.attachments.filter((file) => file.path !== path),
	}))
	scheduleDraftSave()
}

// ---- draft autosave --------------------------------------------------------

const DRAFT_DEBOUNCE_MS = 2000
let draftTimer: ReturnType<typeof setTimeout> | null = null

function scheduleDraftSave() {
	cancelDraftSave()
	draftTimer = setTimeout(() => void saveDraftNow(), DRAFT_DEBOUNCE_MS)
}

function cancelDraftSave() {
	if (draftTimer) {
		clearTimeout(draftTimer)
		draftTimer = null
	}
}

async function saveDraftNow() {
	const state = useComposeStore.getState()
	if (state.sending || !hasContent(state) || !state.accountId) return
	try {
		const id = await SendService.SaveDraft(toOutgoing(state), state.draftId)
		if (id) {
			useComposeStore.setState({ draftId: id })
		}
	} catch {
		// Draft autosave is best-effort (e.g. offline); sending still works.
	}
}

// ---- prefill from an existing message --------------------------------------

function quoteBody(message: Message, text: string) {
	const attribution = `On ${formatFullDate(message.date)}, ${
		message.from.name || message.from.email
	} wrote:`
	const quoted = text
		.split("\n")
		.map((line) => `> ${line}`)
		.join("\n")
	return `\n\n${attribution}\n${quoted}`
}

function withPrefix(subject: string, prefix: string) {
	return subject.toLowerCase().startsWith(prefix.toLowerCase())
		? subject
		: `${prefix} ${subject}`
}

/** Opens compose prefilled as reply / reply-all / forward of a message. */
export async function composeFromMessage(message: Message, mode: ComposeMode) {
	const account = useAccountsStore
		.getState()
		.accounts.find((a) => a.id === message.accountId)
	const ownEmail = account?.email ?? ""

	let quotedSource = ""
	try {
		const fetched = await MailService.GetMessageBody(message.id)
		quotedSource = fetched.textBody
	} catch {
		// Quote an empty body if the cache misses.
	}
	const body = quoteBody(message, quotedSource)

	const prefill: Partial<ComposeState> = {
		mode,
		accountId: message.accountId,
		body,
		inReplyTo: mode === "forward" ? "" : message.messageId,
		references: mode === "forward" ? "" : message.messageId,
		replyToMessageId: mode === "forward" ? 0 : message.id,
	}

	if (mode === "forward") {
		prefill.subject = withPrefix(message.subject, "Fwd:")
	} else {
		prefill.subject = withPrefix(message.subject, "Re:")
		prefill.to = message.from.email
		if (mode === "reply-all") {
			const others = [...(message.to ?? []), ...(message.cc ?? [])]
				.map((address) => address.email)
				.filter((email) => email && email !== ownEmail)
			prefill.cc = [...new Set(others)].join(", ")
		}
	}

	openCompose(prefill)
}

/** Opens a saved draft back into the compose sheet. */
export async function editDraft(message: Message) {
	let body = ""
	try {
		const fetched = await MailService.GetMessageBody(message.id)
		body = fetched.textBody
	} catch {
		// empty body is fine
	}
	openCompose({
		accountId: message.accountId,
		to: (message.to ?? []).map((a) => a.email).join(", "),
		cc: (message.cc ?? []).map((a) => a.email).join(", "),
		subject: message.subject,
		body,
		draftId: message.id,
	})
}
