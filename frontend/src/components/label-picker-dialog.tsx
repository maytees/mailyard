import { HugeiconsIcon } from "@hugeicons/react"
import { Tag01Icon } from "@hugeicons/core-free-icons"
import * as React from "react"

import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog"
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
 * manually, which wins over the classifier permanently. */
export function LabelPickerDialog() {
	const open = useLabelsStore((s) => s.pickerOpen)
	const labels = useLabelsStore((s) => s.labels)

	React.useEffect(() => {
		if (open) void loadIconLibrary()
	}, [open])

	const pick = (labelId: number) => {
		const message = getActiveMessage()
		setLabelPickerOpen(false)
		if (message) void setMessageLabel(message.id, labelId)
	}

	return (
		<Dialog open={open} onOpenChange={setLabelPickerOpen}>
			<DialogContent className="sm:max-w-sm">
				<DialogHeader>
					<DialogTitle>Set label</DialogTitle>
				</DialogHeader>
				<div className="flex flex-row flex-wrap gap-1.5">
					{labels.map((label) => {
						const accent = labelAccent(label.color)
						return (
							<button
								key={label.id}
								type="button"
								onClick={() => pick(label.id)}
								className={cn(
									"flex cursor-pointer flex-row items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors hover:bg-muted",
									accent,
									accent && "text-(--accent-fg)"
								)}
							>
								<PickerGlyph icon={label.icon} />
								{label.name}
							</button>
						)
					})}
				</div>
			</DialogContent>
		</Dialog>
	)
}
