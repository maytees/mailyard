import { HugeiconsIcon } from "@hugeicons/react"
import { Tag01Icon } from "@hugeicons/core-free-icons"
import * as React from "react"

import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog"
import { Kbd } from "@/components/ui/kbd"
import { useIcon, loadIconLibrary } from "@/lib/icon-library"
import { labelAccent } from "@/lib/mailbox-colors"
import { cn } from "@/lib/utils"
import {
	setLabelPickerOpen,
	setMessageLabel,
	useLabelsStore,
} from "@/stores/labels"
import { getActiveMessage } from "@/stores/mail"

function PickerGlyph({ icon }: { icon: string }) {
	const resolved = useIcon(icon)
	return <HugeiconsIcon icon={resolved ?? Tag01Icon} className="size-3.5" />
}

/** The "Set label…" command: assigns a label to the active message
 * manually, which wins over the classifier permanently. Rows are a
 * scrollable list (labels are user-defined and unbounded) and the first
 * nine get 1–9 hotkeys. */
export function LabelPickerDialog() {
	const open = useLabelsStore((s) => s.pickerOpen)
	const labels = useLabelsStore((s) => s.labels)

	React.useEffect(() => {
		if (open) void loadIconLibrary()
	}, [open])

	const pick = React.useCallback((labelId: number) => {
		const message = getActiveMessage()
		setLabelPickerOpen(false)
		if (message) void setMessageLabel(message.id, labelId)
	}, [])

	// 1–9 assigns by position, matching the printed hints.
	React.useEffect(() => {
		if (!open) return
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.metaKey || event.ctrlKey || event.altKey) return
			const index = Number.parseInt(event.key, 10) - 1
			const label = useLabelsStore.getState().labels[index]
			if (Number.isNaN(index) || index < 0 || !label) return
			event.preventDefault()
			pick(label.id)
		}
		window.addEventListener("keydown", onKeyDown)
		return () => window.removeEventListener("keydown", onKeyDown)
	}, [open, pick])

	return (
		<Dialog open={open} onOpenChange={setLabelPickerOpen}>
			<DialogContent className="sm:max-w-sm">
				<DialogHeader>
					<DialogTitle>Set label</DialogTitle>
				</DialogHeader>
				<div className="-mx-1 flex max-h-72 flex-col gap-0.5 overflow-y-auto p-1">
					{labels.map((label, index) => {
						const accent = labelAccent(label.color)
						return (
							<button
								key={label.id}
								type="button"
								onClick={() => pick(label.id)}
								className="flex w-full cursor-pointer flex-row items-center gap-2.5 rounded-xl px-2 py-1.5 text-left text-sm transition-colors hover:bg-muted"
							>
								<span
									className={cn(
										"inline-flex size-6 shrink-0 items-center justify-center rounded-full",
										accent
											? cn(accent, "bg-(--accent)/15 text-(--accent-fg)")
											: "bg-muted text-muted-foreground"
									)}
								>
									<PickerGlyph icon={label.icon} />
								</span>
								<span className="min-w-0 flex-1 truncate font-medium">
									{label.name}
								</span>
								{index < 9 && <Kbd>{index + 1}</Kbd>}
							</button>
						)
					})}
				</div>
			</DialogContent>
		</Dialog>
	)
}
