import type * as React from "react"
import { Toaster as Sonner, type ToasterProps } from "sonner"

import { useThemeStore } from "@/stores/theme"

/** App-themed sonner toaster; tokens map onto the popover surface. */
export function Toaster(props: ToasterProps) {
	const isDark = useThemeStore((s) => s.isDark)

	return (
		<Sonner
			theme={isDark ? "dark" : "light"}
			position="bottom-right"
			className="toaster group"
			style={
				{
					"--normal-bg": "var(--popover)",
					"--normal-text": "var(--popover-foreground)",
					"--normal-border": "var(--border)",
					"--border-radius": "calc(var(--radius) * 1.6)",
				} as React.CSSProperties
			}
			{...props}
		/>
	)
}
