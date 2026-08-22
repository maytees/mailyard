import { HugeiconsIcon } from "@hugeicons/react"
import * as React from "react"
import { useHotkeys } from "react-hotkeys-hook"

import { CommandPaletteContext } from "@/hooks/use-command-palette"
import { useAccountsStore } from "@/stores/accounts"
import { setAccountFilter } from "@/stores/mail"
import {
	Command,
	CommandDialog,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
	CommandSeparator,
	CommandShortcut,
} from "@/components/ui/command"
import { KbdShortcut } from "@/components/ui/kbd"
import { commandGroups, resolveCommandField } from "@/lib/command"
import type { MailboxColor } from "@/lib/mailbox-colors"

// Mock results until the Go backend feeds real mail in.
interface MockEmail {
	id: string
	from: string
	subject: string
	mailbox: MailboxColor
}

const mockEmails: MockEmail[] = [
	{ id: "1", from: "GitHub", subject: "[mailyard] Your build passed", mailbox: "violet" },
	{ id: "2", from: "GMU Registrar", subject: "Fall registration opens Monday", mailbox: "blue" },
	{ id: "3", from: "Stripe", subject: "Your invoice for Petzio is ready", mailbox: "emerald" },
	{ id: "4", from: "Mom", subject: "Dinner on Sunday?", mailbox: "rose" },
	{ id: "5", from: "Vercel", subject: "Deployment failed: petzio-web", mailbox: "emerald" },
]

function MailboxDot({ color }: { color: string }) {
	return (
		<span
			aria-hidden
			className="size-2 shrink-0 rounded-full"
			style={{ backgroundColor: `var(--color-mailbox-${color})` }}
		/>
	)
}

/** Highlights the first case-insensitive occurrence of query inside text. */
function Highlight({ text, query }: { text: string; query: string }) {
	const q = query.trim()
	const index = q ? text.toLowerCase().indexOf(q.toLowerCase()) : -1
	if (index === -1) {
		return <>{text}</>
	}
	return (
		<>
			{text.slice(0, index)}
			<mark className="rounded-xs bg-primary/25 text-inherit">
				{text.slice(index, index + q.length)}
			</mark>
			{text.slice(index + q.length)}
		</>
	)
}

export function CommandPaletteProvider({
	children,
}: {
	children: React.ReactNode
}) {
	const [open, setOpen] = React.useState(false)

	useHotkeys("mod+k", () => setOpen((current) => !current), {
		preventDefault: true,
		enableOnFormTags: true,
	})

	const value = React.useMemo(() => ({ open, setOpen }), [open])

	return (
		<CommandPaletteContext.Provider value={value}>
			{children}
			<CommandPalette open={open} onOpenChange={setOpen} />
		</CommandPaletteContext.Provider>
	)
}

function CommandPalette({
	open,
	onOpenChange,
}: {
	open: boolean
	onOpenChange: (open: boolean) => void
}) {
	const [query, setQuery] = React.useState("")
	const accounts = useAccountsStore((s) => s.accounts)

	// Reset the query on close (in the handler, not an effect — the dialog
	// only ever closes through here).
	const handleOpenChange = (next: boolean) => {
		if (!next) {
			setQuery("")
		}
		onOpenChange(next)
	}

	// Close first so the palette feels instant, then run the action.
	const run = (action?: () => void) => {
		handleOpenChange(false)
		action?.()
	}

	// Mail search is a fallback: only shown once the user starts typing.
	const q = query.trim().toLowerCase()
	const emailMatches = q
		? mockEmails.filter((email) =>
			`${email.from} ${email.subject}`.toLowerCase().includes(q)
		)
		: []

	return (
		<CommandDialog
			open={open}
			onOpenChange={handleOpenChange}
			title="Search & Commands"
			description="Search your mail or run a command"
			className="top-1/2 -translate-y-1/2 sm:max-w-2xl"
		>
			<Command>
				<CommandInput
					placeholder="Search mail or type a command..."
					value={query}
					onValueChange={setQuery}
				/>
				<CommandList className="max-h-[26rem]">
					<CommandEmpty>No matching emails or commands.</CommandEmpty>

					{commandGroups.map((group, groupIndex) => (
						<React.Fragment key={group.heading}>
							{groupIndex > 0 && <CommandSeparator />}
							<CommandGroup heading={group.heading}>
								{group.commands.map((command) => {
									const label = resolveCommandField(command.label)
									return (
										<CommandItem
											key={command.id}
											value={label}
											onSelect={() => run(command.run)}
										>
											<HugeiconsIcon
												icon={resolveCommandField(command.icon)}
											/>
											<span>
												<Highlight text={label} query={query} />
											</span>
											{command.shortcut && (
												<CommandShortcut>
													<KbdShortcut shortcut={command.shortcut} />
												</CommandShortcut>
											)}
										</CommandItem>
									)
								})}
							</CommandGroup>
						</React.Fragment>
					))}

					<CommandSeparator />

					{accounts.length > 0 && (
						<CommandGroup heading="Mailboxes">
							{accounts.map((account, i) => (
								<CommandItem
									key={account.id}
									value={`Go to ${account.displayName} ${account.email}`}
									onSelect={() => run(() => setAccountFilter(account.id))}
								>
									<MailboxDot color={account.color} />
									<span>
										<Highlight
											text={`Go to ${account.displayName}`}
											query={query}
										/>
									</span>
									<span className="truncate font-normal text-muted-foreground">
										<Highlight text={account.email} query={query} />
									</span>
									{i < 9 && (
										<CommandShortcut>
											<KbdShortcut shortcut={`mod+${i + 1}`} />
										</CommandShortcut>
									)}
								</CommandItem>
							))}
						</CommandGroup>
					)}

					{emailMatches.length > 0 && (
						<>
							<CommandSeparator />
							<CommandGroup heading="Mail">
								{emailMatches.map((email) => (
									<CommandItem
										key={email.id}
										value={`${email.from} ${email.subject}`}
										onSelect={() => run()}
									>
										<MailboxDot color={email.mailbox} />
										<span className="shrink-0">
											<Highlight text={email.from} query={query} />
										</span>
										<span className="truncate font-normal text-muted-foreground">
											<Highlight text={email.subject} query={query} />
										</span>
									</CommandItem>
								))}
							</CommandGroup>
						</>
					)}
				</CommandList>
			</Command>
		</CommandDialog>
	)
}
