import * as React from "react"

export type CommandPaletteContextValue = {
	open: boolean
	setOpen: (open: boolean) => void
}

export const CommandPaletteContext =
	React.createContext<CommandPaletteContextValue | null>(null)

export function useCommandPalette() {
	const context = React.useContext(CommandPaletteContext)
	if (!context) {
		throw new Error(
			"useCommandPalette must be used within a CommandPaletteProvider"
		)
	}
	return context
}
