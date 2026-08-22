// Cross-cutting UI state that commands and components both drive (the palette
// runs outside React, so dialogs it opens live here rather than in props).
import { create } from "zustand"

interface UIState {
	addMailboxOpen: boolean
	setAddMailboxOpen: (open: boolean) => void
	shortcutHelpOpen: boolean
	setShortcutHelpOpen: (open: boolean) => void
	/** Command palette visibility — in the store so commands can open it. */
	paletteOpen: boolean
	setPaletteOpen: (open: boolean) => void
}

export const useUIStore = create<UIState>((set) => ({
	addMailboxOpen: false,
	setAddMailboxOpen: (open) => set({ addMailboxOpen: open }),
	shortcutHelpOpen: false,
	setShortcutHelpOpen: (open) => set({ shortcutHelpOpen: open }),
	paletteOpen: false,
	setPaletteOpen: (open) => set({ paletteOpen: open }),
}))
