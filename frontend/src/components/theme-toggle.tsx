import { Moon02Icon, Sun03Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { motion } from "motion/react"

import { useThemeStore } from "@/stores/theme"
import { KbdShortcut } from "@/components/ui/kbd"
import { SidebarMenuButton } from "@/components/ui/sidebar"

export function ThemeToggle() {
	const isDark = useThemeStore((s) => s.isDark)
	const toggleTheme = useThemeStore((s) => s.toggleTheme)

	return (
		<SidebarMenuButton
			tooltip={<KbdShortcut shortcut="mod+d">Toggle Theme</KbdShortcut>}
			size="md"
			aria-label="Toggle theme"
			onClick={toggleTheme}
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
