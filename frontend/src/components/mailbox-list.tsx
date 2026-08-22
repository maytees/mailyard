import { MailPlus } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

import { useIcon } from "@/lib/icon-library"
import {
	SidebarMenu,
	SidebarMenuBadge,
	SidebarMenuButton,
	SidebarMenuItem,
} from "@/components/ui/sidebar"
import { shortcutFor } from "@/lib/command"
import type { MailboxColor } from "@/lib/mailbox-colors"
import { useAccountsStore } from "@/stores/accounts"
import { setAccountFilter, useMailStore } from "@/stores/mail"
import { useUIStore } from "@/stores/ui"
import { KbdShortcut } from "./ui/kbd"

/** Chosen hugeicons glyph, or the account's initial while none is set. */
function AccountGlyph({ icon, fallback }: { icon: string; fallback: string }) {
	const resolved = useIcon(icon)
	if (resolved) {
		return <HugeiconsIcon icon={resolved} />
	}
	return <span className="text-sm font-semibold font-heading">{fallback}</span>
}

export function MailboxList() {
	const accounts = useAccountsStore((s) => s.accounts)
	const activeId = useMailStore((s) => s.accountFilter)
	const unreadCounts = useMailStore((s) => s.unreadCounts)
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
						className="rounded-lg [&_svg]:size-5"
						isActive={account.id === activeId}
						onClick={() => setAccountFilter(account.id)}
					>
						<AccountGlyph
							icon={account.icon}
							fallback={(account.displayName || account.email)
								.charAt(0)
								.toUpperCase()}
						/>
					</SidebarMenuButton>
					{(unreadCounts[account.id] ?? 0) > 0 && (
						<SidebarMenuBadge className="rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground">
							{Math.min(unreadCounts[account.id], 99)}
						</SidebarMenuBadge>
					)}
				</SidebarMenuItem>
			))}
			<SidebarMenuItem>
				<SidebarMenuButton
					tooltip={
						<KbdShortcut shortcut={shortcutFor("add-mailbox") ?? ""}>
							Add Mailbox
						</KbdShortcut>
					}
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
