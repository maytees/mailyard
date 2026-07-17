import { StrictMode } from "react"
import { createRoot } from "react-dom/client"

import "./index.css"
import App from "./App.tsx"
import { TooltipProvider } from "./components/ui/tooltip.tsx"
import { SidebarProvider } from "./components/ui/sidebar.tsx"
import { AppSidebar } from "./components/app-sidebar.tsx"
import { CommandPaletteProvider } from "./components/command-palette.tsx"
import { initWindowStore } from "./stores/window.ts"
import { initThemeStore } from "./stores/theme.ts"
import { initializeGlobalHotkeys } from "./lib/global-hotkeys.ts"

initWindowStore()
initThemeStore()
initializeGlobalHotkeys()

createRoot(document.getElementById("root")!).render(
	<StrictMode>
		<TooltipProvider>
			<CommandPaletteProvider>
				<SidebarProvider defaultOpen={false}>
					<AppSidebar />
					<main>
						<App />
					</main>
				</SidebarProvider>
			</CommandPaletteProvider>
		</TooltipProvider>
	</StrictMode>
)
