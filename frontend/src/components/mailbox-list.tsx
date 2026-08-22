import { MailPlus } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

import {
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
} from "@/components/ui/sidebar"
import { mailboxes, type Mailbox } from "@/data/mailboxes"
import { KbdShortcut } from "./ui/kbd"

interface MailboxListProps {
	items?: Mailbox[]
	activeId?: string
	onSelect?: (mailbox: Mailbox) => void
	onAddMailbox?: () => void
}

export function MailboxList({
	items = mailboxes,
	activeId,
	onSelect,
	onAddMailbox,
}: MailboxListProps) {
	return (
		<SidebarMenu className="space-y-3.5 mt-5">
			{items.map((mailbox, i) => (
				<SidebarMenuItem key={mailbox.id}>
					{/*TODO: add an option to hide the email from the hover; might be too long in some cases.*/}
					<SidebarMenuButton
						tooltip={i <= 9 ? <KbdShortcut shortcut={`mod+${i + 1}`}>{mailbox.name} ({mailbox.email})</KbdShortcut> : `${mailbox.name} (${mailbox.email})`}
						color={mailbox.color}
						size="default"
						className="[&_svg]:size-5 rounded-lg"
						isActive={mailbox.id === activeId}
						onClick={() => onSelect?.(mailbox)}
					>
						<HugeiconsIcon icon={mailbox.icon} />
					</SidebarMenuButton>
				</SidebarMenuItem>
			))}
			<SidebarMenuItem>
				<SidebarMenuButton
					tooltip={
						<KbdShortcut shortcut="alt+shift+m">Add Mailbox</KbdShortcut>
					}
					variant="transparent"
					size="default"
					className="[&_svg]:size-5 rounded-lg"
					onClick={onAddMailbox}
				>
					<HugeiconsIcon icon={MailPlus} />
				</SidebarMenuButton>
			</SidebarMenuItem>
		</SidebarMenu>
	)
}
