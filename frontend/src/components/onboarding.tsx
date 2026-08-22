import { MailPlus } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

import { Button } from "@/components/ui/button"
import { KbdShortcut } from "@/components/ui/kbd"
import { useUIStore } from "@/stores/ui"

/** Shown instead of the mail panes until the first account exists. */
export function Onboarding() {
	const openAddMailbox = useUIStore((s) => s.setAddMailboxOpen)

	return (
		<div className="flex h-svh w-full flex-col items-center justify-center gap-6">
			<img
				src="/logo.svg"
				alt=""
				className="size-16 dark:opacity-80"
				height={1024}
				width={1024}
			/>
			<div className="flex flex-col items-center gap-1.5 text-center">
				<h1 className="font-heading text-xl font-semibold">
					Welcome to Mailyard
				</h1>
				<p className="max-w-sm text-sm text-muted-foreground">
					One inbox for every account. Add your first mailbox to start
					syncing mail.
				</p>
			</div>
			<Button color="rose" onClick={() => openAddMailbox(true)}>
				<HugeiconsIcon icon={MailPlus} />
				Add mailbox
			</Button>
			<p className="text-xs text-muted-foreground">
				<KbdShortcut shortcut="alt+shift+m" />
			</p>
		</div>
	)
}
