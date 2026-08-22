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
import { ShortcutHelpDialog } from "./components/shortcut-help-dialog.tsx"
import { SplashGate } from "./components/splash-screen.tsx"
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
						<main className="w-full">
							<App />
						</main>
						<AddMailboxDialog />
						<ComposeSheet />
						<ShortcutHelpDialog />
						<Toaster />
					</SidebarProvider>
				</CommandPaletteProvider>
			</TooltipProvider>
		</SplashGate>
	</StrictMode>
)
