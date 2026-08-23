import { HugeiconsIcon } from "@hugeicons/react"
import { InboxIcon, Tag01Icon } from "@hugeicons/core-free-icons"

import { useIcon, loadIconLibrary } from "@/lib/icon-library"
import { labelAccent } from "@/lib/mailbox-colors"
import { cn } from "@/lib/utils"
import { labelById, useLabelsStore } from "@/stores/labels"
import { setLabelFilter, useMailStore } from "@/stores/mail"
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip"
import * as React from "react"
import type { Label } from "~/bindings/mailyard/internal/store/models"

function LabelGlyph({ icon, className }: { icon: string; className?: string }) {
	const resolved = useIcon(icon)
	return (
		<HugeiconsIcon icon={resolved ?? Tag01Icon} className={className} />
	)
}

/** The filter row under the search bar: one pill per label, toggle-style. */
export function LabelPills() {
	const labels = useLabelsStore((s) => s.labels)
	const active = useMailStore((s) => s.labelFilter)
	const folderRole = useMailStore((s) => s.folderRole)

	React.useEffect(() => {
		void loadIconLibrary() // label glyphs live in the lazy icon chunk
	}, [])

	// Labels categorize incoming mail; other folders keep the full width.
	if (folderRole !== "inbox" || labels.length === 0) return null

	return (
		<div className="flex w-full flex-row gap-1.5 overflow-x-auto pt-3 [scrollbar-width:none]">
			{/* "All" is a fixture, not a label row — it clears the filter. */}
			<button
				type="button"
				onClick={() => setLabelFilter(0)}
				className={cn(
					"flex shrink-0 cursor-pointer flex-row items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
					active === 0
						? "border-foreground/30 bg-muted text-foreground"
						: "border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground"
				)}
			>
				<HugeiconsIcon icon={InboxIcon} className="size-3.5" />
				All
			</button>
			{labels.map((label) => {
				const accent = labelAccent(label.color)
				const isActive = active === label.id
				return (
					<button
						key={label.id}
						type="button"
						onClick={() => setLabelFilter(label.id)}
						className={cn(
							"flex shrink-0 cursor-pointer flex-row items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
							accent,
							isActive
								? accent
									? "border-(--accent) bg-(--accent)/15 text-(--accent-fg)"
									: "border-foreground/30 bg-muted text-foreground"
								: "border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground"
						)}
					>
						<LabelGlyph icon={label.icon} className="size-3.5" />
						{label.name}
					</button>
				)
			})}
		</div>
	)
}

/** The shortened per-row badge: icon-only pill in the label's color. */
export function LabelBadge({ labelId }: { labelId: number }) {
	const label: Label | undefined = labelById(labelId)
	// Primary is the inbox's default state — badging it is noise.
	if (!label || label.name === "Primary") return null
	const accent = labelAccent(label.color)

	return (
		<Tooltip>
			<TooltipTrigger
				render={
					<span
						className={cn(
							"inline-flex size-4 shrink-0 items-center justify-center rounded-full align-middle",
							accent
								? cn(accent, "bg-(--accent)/15 text-(--accent-fg)")
								: "bg-muted text-muted-foreground"
						)}
					/>
				}
			>
				<LabelGlyph icon={label.icon} className="size-2.5" />
			</TooltipTrigger>
			<TooltipContent>{label.name}</TooltipContent>
		</Tooltip>
	)
}
