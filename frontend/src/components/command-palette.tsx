import {
  AiBrain01Icon,
  AiEditingIcon,
  Archive02Icon,
  ArchiveIcon,
  CheckListIcon,
  Delete01Icon,
  Delete02Icon,
  FilterHorizontalIcon,
  FilterMailRemoveIcon,
  Flag02Icon,
  ForwardIcon,
  InboxIcon,
  InboxUnreadIcon,
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
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react"
import * as React from "react"
import { useHotkeys } from "react-hotkeys-hook"

import { mailboxes } from "@/components/mailbox-list"
import { useTheme } from "@/components/theme-provider"
import { useIsDarkTheme } from "@/components/theme-toggle"
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
import type { MailboxColor } from "@/lib/mailbox-colors"

interface PaletteCommand {
  id: string
  label: string
  icon: IconSvgElement
  shortcut?: string
  /** Omitted for dummy commands — selecting them just closes the palette. */
  action?: () => void
}

interface PaletteGroup {
  heading: string
  commands: PaletteCommand[]
}

// Dummy commands until real actions exist. Only "toggle-theme" is functional,
// injected in CommandPalette because it needs theme state.
const staticGroups: PaletteGroup[] = [
  {
    heading: "AI",
    commands: [
      { id: "ai-summarize", label: "Summarize thread", icon: SparklesIcon, shortcut: "mod+shift+s" },
      { id: "ai-draft-reply", label: "Draft reply with AI", icon: AiEditingIcon, shortcut: "mod+shift+r" },
      { id: "ai-rewrite", label: "Rewrite draft", icon: MagicWandIcon },
      { id: "ai-translate", label: "Translate email", icon: TranslateIcon },
      { id: "ai-action-items", label: "Extract action items", icon: CheckListIcon },
      { id: "ai-triage", label: "Smart triage inbox", icon: AiBrain01Icon },
      { id: "ai-unsubscribe", label: "Suggest unsubscribes", icon: FilterMailRemoveIcon },
    ],
  },
  {
    heading: "Mail actions",
    commands: [
      { id: "compose", label: "Compose", icon: PencilIcon, shortcut: "alt+c" },
      { id: "reply", label: "Reply", icon: MailReplyIcon, shortcut: "r" },
      { id: "reply-all", label: "Reply all", icon: MailReplyAllIcon, shortcut: "shift+r" },
      { id: "forward", label: "Forward", icon: ForwardIcon, shortcut: "f" },
      { id: "archive", label: "Archive email", icon: ArchiveIcon, shortcut: "e" },
      { id: "delete", label: "Delete email", icon: Delete02Icon },
      { id: "snooze", label: "Snooze until tomorrow", icon: NotificationSnoozeIcon, shortcut: "h" },
      { id: "mark-read", label: "Mark all as read", icon: TickDoubleIcon, shortcut: "shift+i" },
      { id: "mark-unread", label: "Mark as unread", icon: InboxUnreadIcon, shortcut: "shift+u" },
      { id: "flag", label: "Flag email", icon: Flag02Icon },
      { id: "print", label: "Print email", icon: PrinterIcon, shortcut: "mod+p" },
    ],
  },
  {
    heading: "Navigation",
    commands: [
      { id: "go-inbox", label: "Go to Inbox", icon: InboxIcon, shortcut: "g+i" },
      { id: "go-drafts", label: "Go to Drafts", icon: MailEditIcon, shortcut: "g+d" },
      { id: "go-sent", label: "Go to Sent", icon: SentIcon, shortcut: "g+s" },
      { id: "go-archive", label: "Go to Archive", icon: Archive02Icon, shortcut: "g+a" },
      { id: "go-trash", label: "Go to Trash", icon: Delete01Icon, shortcut: "g+t" },
    ],
  },
]

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

function MailboxDot({ color }: { color: MailboxColor }) {
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

type CommandPaletteContextValue = {
  open: boolean
  setOpen: (open: boolean) => void
}

const CommandPaletteContext =
  React.createContext<CommandPaletteContextValue | null>(null)

export function useCommandPalette() {
  const context = React.useContext(CommandPaletteContext)
  if (!context) {
    throw new Error(
      "useCommandPalette must be used within a CommandPaletteProvider"
    )
  }
  return context
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
  const { setTheme } = useTheme()
  const isDark = useIsDarkTheme()
  const [query, setQuery] = React.useState("")

  React.useEffect(() => {
    if (!open) {
      setQuery("")
    }
  }, [open])

  // Close first so the palette feels instant, then run the action.
  const run = (action?: () => void) => {
    onOpenChange(false)
    action?.()
  }

  const appGroup: PaletteGroup = {
    heading: "App",
    commands: [
      {
        id: "toggle-theme",
        label: `Switch to ${isDark ? "light" : "dark"} theme`,
        icon: isDark ? Sun03Icon : Moon02Icon,
        shortcut: "mod+d",
        action: () => setTheme(isDark ? "light" : "dark"),
      },
      { id: "toggle-compact", label: "Toggle compact view", icon: FilterHorizontalIcon, shortcut: "mod+b" },
      { id: "sync", label: "Sync all mailboxes", icon: RefreshIcon },
      { id: "add-mailbox", label: "Add mailbox", icon: MailPlus, shortcut: "alt+shift+m" },
      { id: "settings", label: "Open settings", icon: Settings01Icon, shortcut: "mod+," },
    ],
  }

  const groups = [...staticGroups, appGroup]

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
      onOpenChange={onOpenChange}
      title="Search & Commands"
      description="Search your mail or run a command"
      className="sm:max-w-2xl"
    >
      <Command>
        <CommandInput
          placeholder="Search mail or type a command..."
          value={query}
          onValueChange={setQuery}
        />
        <CommandList className="max-h-[26rem]">
          <CommandEmpty>No matching emails or commands.</CommandEmpty>

          {groups.map((group, groupIndex) => (
            <React.Fragment key={group.heading}>
              {groupIndex > 0 && <CommandSeparator />}
              <CommandGroup heading={group.heading}>
                {group.commands.map((command) => (
                  <CommandItem
                    key={command.id}
                    value={command.label}
                    onSelect={() => run(command.action)}
                  >
                    <HugeiconsIcon icon={command.icon} />
                    <span>
                      <Highlight text={command.label} query={query} />
                    </span>
                    {command.shortcut && (
                      <CommandShortcut>
                        <KbdShortcut shortcut={command.shortcut} />
                      </CommandShortcut>
                    )}
                  </CommandItem>
                ))}
              </CommandGroup>
            </React.Fragment>
          ))}

          <CommandSeparator />

          <CommandGroup heading="Mailboxes">
            {mailboxes.map((mailbox, i) => (
              <CommandItem
                key={mailbox.id}
                value={`Go to ${mailbox.name} ${mailbox.email}`}
                onSelect={() => run()}
              >
                <MailboxDot color={mailbox.color} />
                <span>
                  <Highlight text={`Go to ${mailbox.name}`} query={query} />
                </span>
                <span className="truncate font-normal text-muted-foreground">
                  <Highlight text={mailbox.email} query={query} />
                </span>
                {i <= 9 && (
                  <CommandShortcut>
                    <KbdShortcut shortcut={`mod+${i + 1}`} />
                  </CommandShortcut>
                )}
              </CommandItem>
            ))}
          </CommandGroup>

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
