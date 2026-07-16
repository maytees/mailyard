import { Moon02Icon, Sun03Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { motion } from "motion/react"
import * as React from "react"

import { useTheme } from "@/components/theme-provider"
import { KbdShortcut } from "@/components/ui/kbd"
import { SidebarMenuButton } from "@/components/ui/sidebar"

const COLOR_SCHEME_QUERY = "(prefers-color-scheme: dark)"

function subscribeToSystemTheme(callback: () => void) {
	const mediaQuery = window.matchMedia(COLOR_SCHEME_QUERY)
	mediaQuery.addEventListener("change", callback)
	return () => mediaQuery.removeEventListener("change", callback)
}

export function ThemeToggle() {
	const { theme, setTheme } = useTheme()
	const systemDark = React.useSyncExternalStore(
		subscribeToSystemTheme,
		() => window.matchMedia(COLOR_SCHEME_QUERY).matches
	)
	const isDark = theme === "system" ? systemDark : theme === "dark"

	return (
		<SidebarMenuButton
			tooltip={<KbdShortcut shortcut="mod+d">Toggle Theme</KbdShortcut>}
			size="md"
			className="rounded-full"
			aria-label="Toggle theme"
			onClick={() => setTheme(isDark ? "light" : "dark")}
		>
			{/* Keyed on theme so a toggle remounts the icon and replays the spin-in. */}
			<motion.span
				key={isDark ? "dark" : "light"}
				initial={{ rotate: -120, scale: 0.5, opacity: 0 }}
				animate={{ rotate: 0, scale: 1, opacity: 1 }}
				transition={{ type: "spring", stiffness: 250, damping: 18 }}
				className="flex items-center justify-center"
			>
				<HugeiconsIcon icon={isDark ? Moon02Icon : Sun03Icon} />
			</motion.span>
		</SidebarMenuButton>
	)
}
