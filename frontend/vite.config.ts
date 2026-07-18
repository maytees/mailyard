import path from "path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"
import wails from "@wailsio/runtime/plugins/vite";

// https://vite.dev/config/
export default defineConfig({
	plugins: [react(), tailwindcss(), wails('./bindings')],
	server: {
		host: "127.0.0.1",
		port: Number(process.env.WAILS_VITE_PORT) || 9245,
		strictPort: true,
	},
	resolve: {
		alias: {
			"@": path.resolve(__dirname, "./src"),
			// Mirrors the tsconfig "~/*" path (frontend root — used for bindings).
			"~": path.resolve(__dirname, "."),
		},
	},
})
