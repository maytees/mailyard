// this file is written by ai at this state
import { create } from "zustand"
import { persist } from "zustand/middleware"

export type ComposeStyle = "sheet" | "modal" | "docked"

interface SettingsState {
	compact: boolean
	toggleCompact: () => void
	/** How the composer presents: side panel, centered modal, or docked
	 * bottom-right (Gmail-style). */
	composeStyle: ComposeStyle
	setComposeStyle: (style: ComposeStyle) => void
	/** User-dragged width of the side-panel composer, px. */
	composeWidth: number
	setComposeWidth: (width: number) => void
}

export const useSettingsStore = create<SettingsState>()(
	persist(
		(set) => ({
			compact: false,
			toggleCompact: () => set((s) => ({ compact: !s.compact })),
			composeStyle: "sheet",
			setComposeStyle: (composeStyle) => set({ composeStyle }),
			composeWidth: 672,
			setComposeWidth: (composeWidth) => set({ composeWidth }),
		}),
		{ name: "settings" } // survives restarts
	)
)
