import { Alert02Icon, RefreshIcon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { motion } from "motion/react"

import { SidebarMenuButton } from "@/components/ui/sidebar"
import { useAccountsStore } from "@/stores/accounts"
import { useMailStore } from "@/stores/mail"
import * as SyncService from "~/bindings/mailyard/syncservice"

/**
 * Sidebar footer sync indicator: spins while any account syncs, shows an
 * error state with the failing account in the tooltip, and click = sync now.
 */
export function SyncStatus() {
	const syncStatus = useMailStore((s) => s.syncStatus)
	const accounts = useAccountsStore((s) => s.accounts)

	if (accounts.length === 0) return null

	const entries = Object.entries(syncStatus)
	const syncing = entries.some(([, status]) => status.state === "syncing")
	const failed = entries.find(([, status]) => status.state === "error")
	const failedAccount = failed
		? accounts.find((a) => a.id === failed[0])
		: undefined

	const tooltip = failed
		? `Sync failed for ${failedAccount?.email ?? "an account"}: ${failed[1].error ?? ""}`
		: syncing
			? "Syncing…"
			: "Synced — click to sync now"

	return (
		<SidebarMenuButton
			tooltip={tooltip}
			size="md"
			aria-label="Sync status"
			onClick={() => {
				SyncService.SyncNow().catch(() => {})
			}}
		>
			{failed ? (
				<HugeiconsIcon icon={Alert02Icon} className="text-destructive" />
			) : (
				<motion.span
					className="flex items-center justify-center"
					animate={syncing ? { rotate: 360 } : { rotate: 0 }}
					transition={
						syncing
							? { duration: 1.2, repeat: Infinity, ease: "linear" }
							: { duration: 0.2 }
					}
				>
					<HugeiconsIcon
						icon={RefreshIcon}
						className={syncing ? "" : "opacity-50"}
					/>
				</motion.span>
			)}
		</SidebarMenuButton>
	)
}
