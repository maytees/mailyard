import { CheckListIcon, RefreshIcon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { AnimatePresence, motion } from "motion/react"
import * as React from "react"

import { Button } from "@/components/ui/button"
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import {
	extractActionItems,
	threadKeyOf,
	toggleActionItem,
	useAIStore,
} from "@/stores/ai"
import * as AIService from "~/bindings/mailyard/aiservice"
import type {
	ActionItemRow,
	Message,
} from "~/bindings/mailyard/internal/store/models"

/**
 * Persisted per-thread checklist in the reading pane. Renders only when the
 * thread has saved items (or is being extracted); the palette command and
 * the refresh button re-extract. Groundwork for the future todo/calendar
 * surface — items stay email-tied for now.
 */
export function ActionItemsCard({ message }: { message: Message }) {
	const threadKey = threadKeyOf(message)
	const refresh = useAIStore((s) => s.actionItemsRefresh)
	const extracting = useAIStore((s) => s.extractingActionItems) === threadKey
	const [items, setItems] = React.useState<ActionItemRow[]>([])

	React.useEffect(() => {
		let cancelled = false
		AIService.ListActionItems(message.accountId, message.threadId)
			.then((rows) => {
				if (!cancelled) setItems(rows ?? [])
			})
			.catch(() => {
				if (!cancelled) setItems([])
			})
		return () => {
			cancelled = true
		}
	}, [message.accountId, message.threadId, refresh])

	const show = items.length > 0 || extracting
	const open = items.filter((item) => !item.done).length

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
							<HugeiconsIcon icon={CheckListIcon} className="size-3.5" />
							Action items
							{open > 0 && <span>· {open} open</span>}
						</div>
						<Tooltip>
							<TooltipTrigger
								render={
									<Button
										variant="ghost"
										size="icon-xs"
										aria-label="Re-extract action items"
										disabled={extracting}
										onClick={() => void extractActionItems(message)}
									/>
								}
							>
								<HugeiconsIcon
									icon={RefreshIcon}
									className={cn("size-3", extracting && "animate-spin")}
								/>
							</TooltipTrigger>
							<TooltipContent>Re-extract from thread</TooltipContent>
						</Tooltip>
					</div>

					{extracting && items.length === 0 ? (
						<div className="space-y-2">
							<div className="h-3 w-2/3 animate-pulse rounded bg-muted" />
							<div className="h-3 w-1/2 animate-pulse rounded bg-muted" />
						</div>
					) : (
						<ul className="space-y-1">
							{items.map((item) => (
								<li key={item.id}>
									<label className="flex cursor-pointer flex-row items-baseline gap-2 rounded-lg px-1 py-0.5 text-sm hover:bg-muted/40">
										<input
											type="checkbox"
											checked={item.done}
											onChange={(e) =>
												void toggleActionItem(item.id, e.target.checked)
											}
											className="translate-y-0.5 accent-primary"
										/>
										<span
											className={cn(
												"min-w-0 flex-1",
												item.done && "text-muted-foreground line-through"
											)}
										>
											{item.task}
										</span>
										<span
											className={cn(
												"shrink-0 text-xs",
												item.owner === "you"
													? "font-medium text-primary"
													: "text-muted-foreground"
											)}
										>
											{item.owner}
										</span>
										{item.due && (
											<span className="shrink-0 text-xs text-muted-foreground">
												{item.due}
											</span>
										)}
									</label>
								</li>
							))}
						</ul>
					)}
				</motion.div>
			)}
		</AnimatePresence>
	)
}
