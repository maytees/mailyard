import { StrictMode } from "react"
import { createRoot } from "react-dom/client"

import "./index.css"
import App from "./App.tsx"
import { TooltipProvider } from "./components/ui/tooltip.tsx"
import { SidebarProvider } from "./components/ui/sidebar.tsx"
import { AppSidebar } from "./components/app-sidebar.tsx"
import { AddMailboxDialog } from "./components/add-mailbox-dialog.tsx"
import { CommandPaletteProvider } from "./components/command-palette.tsx"
import { ComposeSheet } from "./components/compose-sheet.tsx"
import { SettingsDialog } from "./components/settings-dialog.tsx"
import { ShortcutHelpDialog } from "./components/shortcut-help-dialog.tsx"
import { SplashGate } from "./components/splash-screen.tsx"
import { LabelPickerDialog } from "./components/label-picker-dialog.tsx"
import { TranslateDialog } from "./components/translate-dialog.tsx"
import { UnsubscribeDialog } from "./components/unsubscribe-dialog.tsx"
import { Toaster } from "./components/ui/sonner.tsx"
import { initThemeStore } from "./stores/theme.ts"
import { initializeGlobalHotkeys } from "./lib/global-hotkeys.ts"

// Theme applies before first paint so the splash renders in the right scheme.
// Async init (window store, future backend/cache) runs as boot gates behind
// the splash — see lib/bootstrap.ts.
initThemeStore()
initializeGlobalHotkeys()

createRoot(document.getElementById("root")!).render(
	<StrictMode>
		<SplashGate>
			<TooltipProvider>
				<CommandPaletteProvider>
					<SidebarProvider defaultOpen={false}>
						<AppSidebar />
						{/* min-w-0 + clip: a flex item's min-width defaults to its
						    content, so one wide email could widen the whole shell. */}
						<main className="w-full min-w-0 overflow-x-clip">
							<App />
						</main>
						<AddMailboxDialog />
						<ComposeSheet />
						<SettingsDialog />
						<ShortcutHelpDialog />
						<LabelPickerDialog />
					<TranslateDialog />
						<UnsubscribeDialog />
						<Toaster />
					</SidebarProvider>
				</CommandPaletteProvider>
			</TooltipProvider>
		</SplashGate>
	</StrictMode>
)
