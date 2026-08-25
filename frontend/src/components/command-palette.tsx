import { HugeiconsIcon } from "@hugeicons/react"
import * as React from "react"
import { useHotkeys } from "react-hotkeys-hook"

import { CommandPaletteContext } from "@/hooks/use-command-palette"
import { useAccountsStore } from "@/stores/accounts"
import { useAIStore } from "@/stores/ai"
import { openMessage, setAccountFilter } from "@/stores/mail"
import { useUIStore } from "@/stores/ui"
import * as SearchService from "~/bindings/mailyard/searchservice"
import type { Message } from "~/bindings/mailyard/internal/store/models"
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

const SEARCH_DEBOUNCE_MS = 150
const SEARCH_LIMIT = 8

/** Debounced FTS search against the Go backend while the user types. */
function useMailSearch(query: string) {
	const [hits, setHits] = React.useState<Message[]>([])

	React.useEffect(() => {
		const q = query.trim()
		const timer = setTimeout(() => {
			if (!q) {
				setHits([])
				return
			}
			SearchService.Search(q, "", SEARCH_LIMIT)
				.then((results) => setHits(results ?? []))
				.catch(() => setHits([]))
		}, SEARCH_DEBOUNCE_MS)
		return () => clearTimeout(timer)
	}, [query])

	return hits
}

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
	// Open state lives in the ui store so registry commands (e.g. the AI
	// sidebar button's ".") can open the palette from outside React.
	const open = useUIStore((s) => s.paletteOpen)
	const setOpen = useUIStore((s) => s.setPaletteOpen)

	useHotkeys("mod+k", () => setOpen(!useUIStore.getState().paletteOpen), {
		preventDefault: true,
		enableOnFormTags: true,
	})

	const value = React.useMemo(() => ({ open, setOpen }), [open, setOpen])

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
	const emailMatches = useMailSearch(query)
	const aiSummaries = useAIStore((s) => s.summaries)

	const accountColor = React.useMemo(() => {
		const map: Record<string, string> = {}
		for (const account of accounts) {
			map[account.id] = account.color
		}
		return map
	}, [accounts])

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
								{emailMatches.map((email) => {
									// The AI digest (when generated) beats the raw opening
									// line at telling similar mails apart.
									const preview =
										aiSummaries[String(email.id)] ?? email.snippet
									return (
										<CommandItem
											key={email.id}
											// FTS matches on the body too, which cmdk's fuzzy filter
											// can't see — append the query so hits always survive it.
											// The id keeps values unique: cmdk tracks highlight by
											// value, so same-sender same-subject rows would
											// otherwise hover as one.
											value={`${email.from.name} ${email.subject} ${query} ${email.id}`}
											onSelect={() => run(() => openMessage(email))}
										>
											<MailboxDot
												color={accountColor[email.accountId] ?? "violet"}
											/>
											<div className="flex min-w-0 flex-col">
												<div className="flex min-w-0 flex-row items-baseline gap-2">
													<span className="shrink-0">
														<Highlight
															text={email.from.name || email.from.email}
															query={query}
														/>
													</span>
													<span className="truncate font-normal text-muted-foreground">
														<Highlight
															text={email.subject || "(no subject)"}
															query={query}
														/>
													</span>
												</div>
												{preview && (
													<span className="truncate text-xs font-normal text-muted-foreground/70">
														{preview}
													</span>
												)}
											</div>
										</CommandItem>
									)
								})}
							</CommandGroup>
						</>
					)}
				</CommandList>
			</Command>
		</CommandDialog>
	)
}
