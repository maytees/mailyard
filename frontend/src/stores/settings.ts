// this file is written by ai at this state
import { create } from "zustand"
import { persist } from "zustand/middleware"

interface SettingsState {
	compact: boolean
	toggleCompact: () => void
}

export const useSettingsStore = create<SettingsState>()(
	persist(
		(set) => ({
			compact: false,
			toggleCompact: () => set((s) => ({ compact: !s.compact })),
		}),
		{ name: "settings" } // survives restarts
	)
)
