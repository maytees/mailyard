// Cross-cutting UI state that commands and components both drive (the palette
// runs outside React, so dialogs it opens live here rather than in props).
import { create } from "zustand"

interface UIState {
	addMailboxOpen: boolean
	setAddMailboxOpen: (open: boolean) => void
}

export const useUIStore = create<UIState>((set) => ({
	addMailboxOpen: false,
	setAddMailboxOpen: (open) => set({ addMailboxOpen: open }),
}))
