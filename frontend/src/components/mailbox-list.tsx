import { MailPlus } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

import {
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
} from "@/components/ui/sidebar"
import type { MailboxColor } from "@/lib/mailbox-colors"
import { useAccountsStore } from "@/stores/accounts"
import { useUIStore } from "@/stores/ui"
import type { Account } from "~/bindings/mailyard/internal/store/models"
import { KbdShortcut } from "./ui/kbd"

interface MailboxListProps {
	activeId?: string
	onSelect?: (account: Account) => void
}

export function MailboxList({ activeId, onSelect }: MailboxListProps) {
	const accounts = useAccountsStore((s) => s.accounts)
	const openAddMailbox = useUIStore((s) => s.setAddMailboxOpen)

	return (
		<SidebarMenu className="space-y-3.5 mt-5">
			{accounts.map((account, i) => (
				<SidebarMenuItem key={account.id}>
					<SidebarMenuButton
						tooltip={
							i <= 9 ? (
								<KbdShortcut shortcut={`mod+${i + 1}`}>
									{account.displayName} ({account.email})
								</KbdShortcut>
							) : (
								`${account.displayName} (${account.email})`
							)
						}
						color={account.color as MailboxColor}
						size="default"
						className="rounded-lg"
						isActive={account.id === activeId}
						onClick={() => onSelect?.(account)}
					>
						<span className="text-sm font-semibold font-heading">
							{(account.displayName || account.email)
								.charAt(0)
								.toUpperCase()}
						</span>
					</SidebarMenuButton>
				</SidebarMenuItem>
			))}
			<SidebarMenuItem>
				<SidebarMenuButton
					tooltip={<KbdShortcut shortcut="alt+shift+m">Add Mailbox</KbdShortcut>}
					variant="transparent"
					size="default"
					className="[&_svg]:size-5 rounded-lg"
					onClick={() => openAddMailbox(true)}
				>
					<HugeiconsIcon icon={MailPlus} />
				</SidebarMenuButton>
			</SidebarMenuItem>
		</SidebarMenu>
	)
}
