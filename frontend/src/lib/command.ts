// File is mostly written by claude
import {
	archiveActive,
	markActiveUnread,
	markAllRead,
	snoozeActive,
	toggleStarActive,
	trashActive,
} from "@/lib/mail-actions"
import { useAccountsStore } from "@/stores/accounts"
import { composeFromMessage, openCompose } from "@/stores/compose"
import {
	refreshMailList,
	refreshUnreadCounts,
	selectNeighborMessage,
	setAccountFilter,
	setFolderRole,
	useMailStore,
} from "@/stores/mail"
import { useSettingsStore } from "@/stores/settings"
import { useThemeStore } from "@/stores/theme"
import { useUIStore } from "@/stores/ui"
import * as SyncService from "~/bindings/mailyard/syncservice"

/** The message the list currently has selected, if any. */
function activeMessage() {
	const { messages, activeMessageId } = useMailStore.getState()
	return messages.find((m) => m.id === activeMessageId)
}
import {
	AiBrain01Icon,
	AiEditingIcon,
	Archive02Icon,
	ArchiveIcon,
	ArrowDown02Icon,
	ArrowExpand01Icon,
	ArrowShrink02Icon,
	ArrowUp02Icon,
	CheckListIcon,
	Delete01Icon,
	Delete02Icon,
	FilterMailRemoveIcon,
	Flag02Icon,
	ForwardIcon,
	InboxIcon,
	InboxUnreadIcon,
	KeyboardIcon,
	Logout02Icon,
	MagicWandIcon,
	MailEditIcon,
	MailPlus,
	MailReplyAllIcon,
	MailReplyIcon,
	Moon02Icon,
	NotificationSnoozeIcon,
	PencilIcon,
	PrinterIcon,
	RefreshIcon,
	SentIcon,
	Settings01Icon,
	SparklesIcon,
	Sun03Icon,
	TickDoubleIcon,
	TranslateIcon,
} from "@hugeicons/core-free-icons"
import type { IconSvgElement } from "@hugeicons/react"
import { Application } from "@wailsio/runtime"

export type CommandGroupHeading = "AI" | "Mail actions" | "Navigation" | "App"

export interface AppCommand {
	id: string
	// label/icon can be functions so they reflect live store state each time
	// they're rendered, instead of being frozen at module load.
	label: string | (() => string)
	icon: IconSvgElement | (() => IconSvgElement)
	shortcut?: string // keyboard.ts format: "mod+b" (chord) or "g+i" (sequence)
	group: CommandGroupHeading
	/** Omitted for dummy commands — selecting them in the palette just closes it. */
	run?: () => void
	/** Keyboard-only commands: bound to their shortcut but kept out of the palette. */
	hidden?: boolean
}

/** Shortcut for a command id, for tooltips — one source, no drift. */
export function shortcutFor(id: string): string | undefined {
	return commands.find((command) => command.id === id)?.shortcut
}

/** Resolves a static-or-lazy AppCommand field to its current value. */
export function resolveCommandField<T>(value: T | (() => T)): T {
	return typeof value === "function" ? (value as () => T)() : value
}

export const commands: AppCommand[] = [
	// AI — dummies until the backend exists.
	{ id: "ai-summarize", label: "Summarize thread", icon: SparklesIcon, shortcut: "mod+shift+s", group: "AI" },
	{ id: "ai-draft-reply", label: "Draft reply with AI", icon: AiEditingIcon, shortcut: "mod+shift+r", group: "AI" },
	{ id: "ai-rewrite", label: "Rewrite draft", icon: MagicWandIcon, group: "AI" },
	{ id: "ai-translate", label: "Translate email", icon: TranslateIcon, group: "AI" },
	{ id: "ai-action-items", label: "Extract action items", icon: CheckListIcon, group: "AI" },
	{ id: "ai-triage", label: "Smart triage inbox", icon: AiBrain01Icon, group: "AI" },
	{ id: "ai-unsubscribe", label: "Suggest unsubscribes", icon: FilterMailRemoveIcon, group: "AI" },

	// Mail actions.
	{ id: "compose", label: "Compose", icon: PencilIcon, shortcut: "alt+c", group: "Mail actions", run: () => openCompose() },
	{
		id: "reply", label: "Reply", icon: MailReplyIcon, shortcut: "r", group: "Mail actions",
		run: () => {
			const message = activeMessage()
			if (message) void composeFromMessage(message, "reply")
		},
	},
	{
		id: "reply-all", label: "Reply all", icon: MailReplyAllIcon, shortcut: "shift+r", group: "Mail actions",
		run: () => {
			const message = activeMessage()
			if (message) void composeFromMessage(message, "reply-all")
		},
	},
	{
		id: "forward", label: "Forward", icon: ForwardIcon, shortcut: "f", group: "Mail actions",
		run: () => {
			const message = activeMessage()
			if (message) void composeFromMessage(message, "forward")
		},
	},
	{ id: "archive", label: "Archive email", icon: ArchiveIcon, shortcut: "e", group: "Mail actions", run: archiveActive },
	{ id: "delete", label: "Delete email", icon: Delete02Icon, shortcut: "shift+3", group: "Mail actions", run: trashActive },
	{ id: "snooze", label: "Snooze until tomorrow", icon: NotificationSnoozeIcon, shortcut: "h", group: "Mail actions", run: snoozeActive },
	{ id: "mark-read", label: "Mark all as read", icon: TickDoubleIcon, shortcut: "shift+i", group: "Mail actions", run: markAllRead },
	{ id: "mark-unread", label: "Mark as unread", icon: InboxUnreadIcon, shortcut: "shift+u", group: "Mail actions", run: markActiveUnread },
	{ id: "flag", label: "Flag email", icon: Flag02Icon, shortcut: "s", group: "Mail actions", run: toggleStarActive },
	{ id: "print", label: "Print email", icon: PrinterIcon, shortcut: "mod+p", group: "Mail actions", run: () => window.print() },

	// Navigation — folder switching. The g-sequences bind once the sequence
	// engine lands (Phase 7); running from the palette works today.
	{ id: "go-inbox", label: "Go to Inbox", icon: InboxIcon, shortcut: "g+i", group: "Navigation", run: () => setFolderRole("inbox") },
	{ id: "go-drafts", label: "Go to Drafts", icon: MailEditIcon, shortcut: "g+d", group: "Navigation", run: () => setFolderRole("drafts") },
	{ id: "go-sent", label: "Go to Sent", icon: SentIcon, shortcut: "g+s", group: "Navigation", run: () => setFolderRole("sent") },
	{ id: "go-archive", label: "Go to Archive", icon: Archive02Icon, shortcut: "g+a", group: "Navigation", run: () => setFolderRole("archive") },
	{ id: "go-trash", label: "Go to Trash", icon: Delete01Icon, shortcut: "g+t", group: "Navigation", run: () => setFolderRole("trash") },
	{ id: "next-email", label: "Next email", icon: ArrowDown02Icon, shortcut: "j", group: "Navigation", run: () => selectNeighborMessage(1) },
	{ id: "prev-email", label: "Previous email", icon: ArrowUp02Icon, shortcut: "k", group: "Navigation", run: () => selectNeighborMessage(-1) },

	// App — functional.
	{
		id: "toggle-theme",
		label: () =>
			`Switch to ${useThemeStore.getState().isDark ? "light" : "dark"} theme`,
		icon: () => (useThemeStore.getState().isDark ? Sun03Icon : Moon02Icon),
		shortcut: "mod+d",
		group: "App",
		run: () => useThemeStore.getState().toggleTheme(),
	},
	{
		id: "toggle-compact",
		label: () =>
			useSettingsStore.getState().compact ? "Cozy view" : "Compact view",
		icon: () =>
			useSettingsStore.getState().compact ? ArrowExpand01Icon : ArrowShrink02Icon,
		shortcut: "mod+b",
		group: "App",
		run: () => useSettingsStore.getState().toggleCompact(),
	},
	{
		id: "sync",
		label: "Sync all mailboxes",
		icon: RefreshIcon,
		group: "App",
		run: () => {
			SyncService.SyncNow()
				.then(() => Promise.all([refreshMailList(), refreshUnreadCounts()]))
				.catch((error: unknown) => console.error("sync failed", error))
		},
	},
	{
		id: "add-mailbox",
		label: "Add mailbox",
		icon: MailPlus,
		shortcut: "alt+shift+m",
		group: "App",
		run: () => useUIStore.getState().setAddMailboxOpen(true),
	},
	{ id: "settings", label: "Open settings", icon: Settings01Icon, shortcut: "mod+,", group: "App" },
	{
		id: "keyboard-shortcuts",
		label: "Keyboard shortcuts",
		icon: KeyboardIcon,
		shortcut: "shift+/",
		group: "App",
		run: () => useUIStore.getState().setShortcutHelpOpen(true),
	},
	{
		id: "quit-app",
		label: "Quit Mailyard",
		icon: Logout02Icon,
		shortcut: "mod+q",
		group: "App",
		run: async () =>
			await Application.Quit()
		,
	},

	// Keyboard-only: mod+1..9 jumps to the Nth mailbox (the palette already
	// lists real mailboxes, so these stay hidden).
	...Array.from({ length: 9 }, (_, i): AppCommand => ({
		id: `switch-account-${i + 1}`,
		label: `Go to mailbox ${i + 1}`,
		icon: InboxIcon,
		shortcut: `mod+${i + 1}`,
		group: "Navigation",
		hidden: true,
		run: () => {
			const account = useAccountsStore.getState().accounts[i]
			if (account) setAccountFilter(account.id)
		},
	})),
]

export interface CommandGroup {
	heading: CommandGroupHeading
	commands: AppCommand[]
}

const GROUP_ORDER: CommandGroupHeading[] = [
	"AI",
	"Mail actions",
	"Navigation",
	"App",
]

/** Registry grouped in palette display order (hidden commands excluded). */
export const commandGroups: CommandGroup[] = GROUP_ORDER.map((heading) => ({
	heading,
	commands: commands.filter(
		(command) => command.group === heading && !command.hidden
	),
}))
