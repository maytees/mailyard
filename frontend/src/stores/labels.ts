// Category labels (Primary/Newsletters/…): the pill filter row, list-row
// badges, and the AI classifier trigger.
import { create } from "zustand"
import { toast } from "sonner"
import { Events } from "@wailsio/runtime"

import * as LabelService from "~/bindings/mailyard/labelservice"
import type { Label } from "~/bindings/mailyard/internal/store/models"
import { refreshMailList, useMailStore } from "@/stores/mail"

interface LabelsState {
	labels: Label[]
	/** The "Set label…" command's picker for the active message. */
	pickerOpen: boolean
}

export const useLabelsStore = create<LabelsState>(() => ({
	labels: [],
	pickerOpen: false,
}))

export function setLabelPickerOpen(open: boolean) {
	useLabelsStore.setState({ pickerOpen: open })
}

export async function refreshLabels() {
	const labels = (await LabelService.ListLabels()) ?? []
	useLabelsStore.setState({ labels })
}

export function labelById(id: number): Label | undefined {
	return useLabelsStore.getState().labels.find((l) => l.id === id)
}

/** One AI classification batch over unlabeled inbox mail. */
export async function labelInbox() {
	try {
		const count = await LabelService.LabelInbox()
		await refreshLabels() // the escape hatch may have created labels
		await refreshMailList()
		toast(count > 0 ? `Labeled ${count} emails` : "Nothing new to label")
	} catch (raw: unknown) {
		toast.error(raw instanceof Error ? raw.message : String(raw))
	}
}

/**
 * The h/l vim motion over the pill row: All → each label in order, wrapping
 * at both ends. Inbox only — that's the only view with pills.
 */
export function cycleLabel(delta: number) {
	const { folderRole, labelFilter } = useMailStore.getState()
	if (folderRole !== "inbox") return
	const order = [0, ...useLabelsStore.getState().labels.map((l) => l.id)]
	const index = Math.max(0, order.indexOf(labelFilter))
	const next = order[(index + delta + order.length) % order.length]
	if (next === labelFilter) return
	useMailStore.setState({ labelFilter: next, activeMessageId: null })
	void refreshMailList()
}

/** Manual assignment — wins over the classifier permanently. */
export async function setMessageLabel(messageId: number, labelId: number) {
	try {
		await LabelService.SetMessageLabel(messageId, labelId)
		await refreshMailList()
	} catch (raw: unknown) {
		toast.error(raw instanceof Error ? raw.message : String(raw))
	}
}

let initialized = false

export async function initLabelsStore() {
	if (initialized) return // idempotent
	initialized = true
	// The background classifier finished a batch (may include new AI labels).
	Events.On("labels:updated", () => {
		refreshLabels().catch(() => {})
		void refreshMailList()
	})
	await refreshLabels()
}
