// File is mostly written by claude
import { useSettingsStore } from "@/stores/settings"
import { useThemeStore } from "@/stores/theme"
import {
	AiBrain01Icon,
	AiEditingIcon,
	Archive02Icon,
	ArchiveIcon,
	ArrowExpand01Icon,
	ArrowShrink02Icon,
	CheckListIcon,
	Delete01Icon,
	Delete02Icon,
	FilterMailRemoveIcon,
	Flag02Icon,
	ForwardIcon,
	InboxIcon,
	InboxUnreadIcon,
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
	shortcut?: string // keyboard.ts format: "mod+b"
	group: CommandGroupHeading
	/** Omitted for dummy commands — selecting them in the palette just closes it. */
	run?: () => void
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

	// Mail actions — dummies.
	{ id: "compose", label: "Compose", icon: PencilIcon, shortcut: "alt+c", group: "Mail actions" },
	{ id: "reply", label: "Reply", icon: MailReplyIcon, shortcut: "r", group: "Mail actions" },
	{ id: "reply-all", label: "Reply all", icon: MailReplyAllIcon, shortcut: "shift+r", group: "Mail actions" },
	{ id: "forward", label: "Forward", icon: ForwardIcon, shortcut: "f", group: "Mail actions" },
	{ id: "archive", label: "Archive email", icon: ArchiveIcon, shortcut: "e", group: "Mail actions" },
	{ id: "delete", label: "Delete email", icon: Delete02Icon, group: "Mail actions" },
	{ id: "snooze", label: "Snooze until tomorrow", icon: NotificationSnoozeIcon, shortcut: "h", group: "Mail actions" },
	{ id: "mark-read", label: "Mark all as read", icon: TickDoubleIcon, shortcut: "shift+i", group: "Mail actions" },
	{ id: "mark-unread", label: "Mark as unread", icon: InboxUnreadIcon, shortcut: "shift+u", group: "Mail actions" },
	{ id: "flag", label: "Flag email", icon: Flag02Icon, group: "Mail actions" },
	{ id: "print", label: "Print email", icon: PrinterIcon, shortcut: "mod+p", group: "Mail actions" },

	// Navigation — dummies.
	{ id: "go-inbox", label: "Go to Inbox", icon: InboxIcon, shortcut: "g+i", group: "Navigation" },
	{ id: "go-drafts", label: "Go to Drafts", icon: MailEditIcon, shortcut: "g+d", group: "Navigation" },
	{ id: "go-sent", label: "Go to Sent", icon: SentIcon, shortcut: "g+s", group: "Navigation" },
	{ id: "go-archive", label: "Go to Archive", icon: Archive02Icon, shortcut: "g+a", group: "Navigation" },
	{ id: "go-trash", label: "Go to Trash", icon: Delete01Icon, shortcut: "g+t", group: "Navigation" },

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
	{ id: "sync", label: "Sync all mailboxes", icon: RefreshIcon, group: "App" },
	{ id: "add-mailbox", label: "Add mailbox", icon: MailPlus, shortcut: "alt+shift+m", group: "App" },
	{ id: "settings", label: "Open settings", icon: Settings01Icon, shortcut: "mod+,", group: "App" },
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

/** Registry grouped in palette display order. */
export const commandGroups: CommandGroup[] = GROUP_ORDER.map((heading) => ({
	heading,
	commands: commands.filter((command) => command.group === heading),
}))
