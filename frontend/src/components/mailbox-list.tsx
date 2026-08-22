import {
	closestCenter,
	DndContext,
	PointerSensor,
	useSensor,
	useSensors,
	type DragEndEvent,
} from "@dnd-kit/core"
import {
	arrayMove,
	SortableContext,
	useSortable,
	verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { MailPlus } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

import { shortcutFor } from "@/lib/command"
import { useIcon } from "@/lib/icon-library"
import type { MailboxColor } from "@/lib/mailbox-colors"
import { cn } from "@/lib/utils"
import { refreshAccounts, useAccountsStore } from "@/stores/accounts"
import { setAccountFilter, useMailStore } from "@/stores/mail"
import { useUIStore } from "@/stores/ui"
import * as AccountService from "~/bindings/mailyard/accountservice"
import type { Account } from "~/bindings/mailyard/internal/store/models"
import {
	SidebarMenu,
	SidebarMenuBadge,
	SidebarMenuButton,
	SidebarMenuItem,
} from "@/components/ui/sidebar"
import { KbdShortcut } from "./ui/kbd"

/** Chosen hugeicons glyph, or the account's initial while none is set. */
function AccountGlyph({ icon, fallback }: { icon: string; fallback: string }) {
	const resolved = useIcon(icon)
	if (resolved) {
		return <HugeiconsIcon icon={resolved} />
	}
	return <span className="text-sm font-semibold font-heading">{fallback}</span>
}

/** One draggable rail entry. The whole item is the drag handle. */
function SortableMailbox({
	account,
	index,
	activeId,
	unread,
}: {
	account: Account
	index: number
	activeId: string
	unread: number
}) {
	const {
		setNodeRef,
		transform,
		transition,
		attributes,
		listeners,
		isDragging,
	} = useSortable({ id: account.id })

	return (
		<SidebarMenuItem
			ref={setNodeRef}
			style={{
				transform: CSS.Transform.toString(transform),
				transition,
			}}
			className={cn(isDragging && "relative z-10 opacity-80")}
			{...attributes}
			{...listeners}
		>
			<SidebarMenuButton
				tooltip={
					index <= 9 ? (
						<KbdShortcut shortcut={`mod+${index + 1}`}>
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
			{unread > 0 && (
				<SidebarMenuBadge className="rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground">
					{Math.min(unread, 99)}
				</SidebarMenuBadge>
			)}
		</SidebarMenuItem>
	)
}

export function MailboxList() {
	const accounts = useAccountsStore((s) => s.accounts)
	const activeId = useMailStore((s) => s.accountFilter)
	const unreadCounts = useMailStore((s) => s.unreadCounts)
	const openAddMailbox = useUIStore((s) => s.setAddMailboxOpen)

	// 6px of movement before a drag starts — plain clicks keep filtering.
	const sensors = useSensors(
		useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
	)

	const handleDragEnd = (event: DragEndEvent) => {
		const { active, over } = event
		if (!over || active.id === over.id) return
		const ids = accounts.map((account) => account.id)
		const from = ids.indexOf(String(active.id))
		const to = ids.indexOf(String(over.id))
		if (from === -1 || to === -1) return

		// Optimistic: the rail settles instantly; the backend write follows
		// and accounts:changed re-fetches the same order.
		const next = arrayMove(accounts, from, to)
		useAccountsStore.setState({ accounts: next })
		AccountService.ReorderAccounts(next.map((account) => account.id)).catch(
			(error: unknown) => {
				console.error("reorder failed", error)
				void refreshAccounts()
			}
		)
	}

	return (
		<SidebarMenu className="space-y-3.5 mt-5">
			<DndContext
				sensors={sensors}
				collisionDetection={closestCenter}
				onDragEnd={handleDragEnd}
			>
				<SortableContext
					items={accounts.map((account) => account.id)}
					strategy={verticalListSortingStrategy}
				>
					{accounts.map((account, index) => (
						<SortableMailbox
							key={account.id}
							account={account}
							index={index}
							activeId={activeId}
							unread={unreadCounts[account.id] ?? 0}
						/>
					))}
				</SortableContext>
			</DndContext>
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
