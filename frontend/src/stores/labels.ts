// Category labels (Primary/Newsletters/…): the pill filter row, list-row
// badges, and the AI classifier trigger.
import { create } from "zustand"
import { toast } from "sonner"

import * as LabelService from "~/bindings/mailyard/labelservice"
import type { Label } from "~/bindings/mailyard/internal/store/models"
import { refreshMailList } from "@/stores/mail"

interface LabelsState {
	labels: Label[]
}

export const useLabelsStore = create<LabelsState>(() => ({
	labels: [],
}))

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
	await refreshLabels()
}
