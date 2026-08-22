import {
	Cancel01Icon,
	CheckListIcon,
	SparklesIcon,
	TranslateIcon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { AnimatePresence, motion } from "motion/react"

import { Button } from "@/components/ui/button"
import { closeAIPanel, useAIStore, type AIPanelKind } from "@/stores/ai"

const PANEL_META: Record<AIPanelKind, { title: string; icon: typeof SparklesIcon }> = {
	summary: { title: "Summary", icon: SparklesIcon },
	translation: { title: "Translation", icon: TranslateIcon },
	"action-items": { title: "Action items", icon: CheckListIcon },
}

/** Streaming AI output pinned above the thread it belongs to. */
export function AIPanel({ threadKey }: { threadKey: string }) {
	const panel = useAIStore((s) => s.panel)
	const show = panel !== null && panel.threadKey === threadKey

	return (
		<AnimatePresence>
			{show && (
				<motion.div
					initial={{ opacity: 0, y: -8 }}
					animate={{ opacity: 1, y: 0 }}
					exit={{ opacity: 0, y: -8 }}
					transition={{ duration: 0.18, ease: "easeOut" }}
					className="mx-6 mt-4 rounded-3xl border bg-secondary/60 px-5 py-4"
				>
					<div className="mb-2 flex flex-row items-center justify-between">
						<div className="flex flex-row items-center gap-1.5 text-xs font-medium text-muted-foreground">
							<HugeiconsIcon
								icon={PANEL_META[panel.kind].icon}
								className="size-3.5"
							/>
							{PANEL_META[panel.kind].title}
						</div>
						<Button
							variant="ghost"
							size="icon-xs"
							aria-label="Dismiss"
							onClick={closeAIPanel}
						>
							<HugeiconsIcon icon={Cancel01Icon} className="size-3" />
						</Button>
					</div>

					{panel.error ? (
						<p className="text-sm text-destructive">{panel.error}</p>
					) : panel.kind === "action-items" ? (
						<ActionItemList
							items={panel.items}
							streaming={panel.streaming}
						/>
					) : (
						<p className="text-sm leading-relaxed whitespace-pre-wrap">
							{panel.content}
							{panel.streaming && <StreamingCaret />}
						</p>
					)}
				</motion.div>
			)}
		</AnimatePresence>
	)
}

function ActionItemList({
	items,
	streaming,
}: {
	items: { text: string; owner: string }[]
	streaming: boolean
}) {
	if (streaming) {
		return (
			<div className="space-y-2">
				<div className="h-3 w-2/3 animate-pulse rounded bg-muted" />
				<div className="h-3 w-1/2 animate-pulse rounded bg-muted" />
			</div>
		)
	}
	if (items.length === 0) {
		return (
			<p className="text-sm text-muted-foreground">
				No action items in this thread.
			</p>
		)
	}
	return (
		<ul className="space-y-1.5 text-sm">
			{items.map((item, index) => (
				<li key={index} className="flex flex-row items-start gap-2">
					<span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary" />
					<span>
						{item.text}
						{item.owner && item.owner !== "you" && (
							<span className="text-muted-foreground"> — {item.owner}</span>
						)}
					</span>
				</li>
			))}
		</ul>
	)
}

function StreamingCaret() {
	return (
		<motion.span
			className="ml-0.5 inline-block h-3.5 w-1.5 rounded-xs bg-primary/70 align-middle"
			animate={{ opacity: [1, 0.2, 1] }}
			transition={{ duration: 1, repeat: Infinity }}
		/>
	)
}
