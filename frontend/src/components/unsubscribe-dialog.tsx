import { LinkSquare02Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { Browser } from "@wailsio/runtime"

import { Button } from "@/components/ui/button"
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog"
import { setUnsubscribesOpen, useAIStore } from "@/stores/ai"

/** Bulk senders worth pruning, with their working unsubscribe links. */
export function UnsubscribeDialog() {
	const open = useAIStore((s) => s.unsubscribesOpen)
	const candidates = useAIStore((s) => s.unsubscribes)

	return (
		<Dialog open={open} onOpenChange={setUnsubscribesOpen}>
			<DialogContent className="sm:max-w-lg">
				<DialogHeader>
					<DialogTitle>Suggested unsubscribes</DialogTitle>
					<DialogDescription>
						Frequent senders in your inbox, ranked by volume.
					</DialogDescription>
				</DialogHeader>

				{candidates === null ? (
					<div className="space-y-2 py-2">
						<div className="h-4 w-3/4 animate-pulse rounded bg-muted" />
						<div className="h-4 w-2/3 animate-pulse rounded bg-muted" />
					</div>
				) : candidates.length === 0 ? (
					<p className="py-2 text-sm text-muted-foreground">
						Nothing stands out — your inbox looks tidy.
					</p>
				) : (
					<div className="flex max-h-[50vh] flex-col gap-1 overflow-y-auto">
						{candidates.map((candidate) => (
							<div
								key={candidate.fromEmail}
								className="flex flex-row items-center gap-3 rounded-2xl px-2 py-2 hover:bg-muted/50"
							>
								<div className="min-w-0 flex-1">
									<p className="truncate text-sm font-medium">
										{candidate.fromName || candidate.fromEmail}
									</p>
									<p className="truncate text-xs text-muted-foreground">
										{candidate.fromEmail} · {candidate.count} emails ·{" "}
										{candidate.unreadCount} unread
									</p>
								</div>
								{candidate.unsubscribeUrl ? (
									<Button
										variant="outline"
										size="xs"
										className="shrink-0 rounded-full"
										onClick={() =>
											void Browser.OpenURL(candidate.unsubscribeUrl)
										}
									>
										Unsubscribe
										<HugeiconsIcon icon={LinkSquare02Icon} className="size-3" />
									</Button>
								) : (
									<span className="shrink-0 text-xs text-muted-foreground">
										no link
									</span>
								)}
							</div>
						))}
					</div>
				)}
			</DialogContent>
		</Dialog>
	)
}
