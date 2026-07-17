import { create } from "zustand";

export type Theme = "dark" | "light" | "system";

const STORAGE_KEY = "theme";
const COLOR_SCHEME_QUERY = "(prefers-color-scheme: dark)";
const THEME_VALUES: Theme[] = ["dark", "light", "system"];

function isTheme(value: string | null): value is Theme {
	return value !== null && THEME_VALUES.includes(value as Theme);
}

function systemPrefersDark() {
	return window.matchMedia(COLOR_SCHEME_QUERY).matches;
}

function resolveIsDark(theme: Theme) {
	return theme === "system" ? systemPrefersDark() : theme === "dark";
}

// Swap the root class without animating every themed property on the page.
function applyThemeClass(isDark: boolean) {
	const style = document.createElement("style");
	style.appendChild(
		document.createTextNode(
			"*,*::before,*::after{-webkit-transition:none!important;transition:none!important}"
		)
	);
	document.head.appendChild(style);

	const root = document.documentElement;
	root.classList.remove("light", "dark");
	root.classList.add(isDark ? "dark" : "light");

	window.getComputedStyle(document.body);
	requestAnimationFrame(() => {
		requestAnimationFrame(() => {
			style.remove();
		});
	});
}

interface ThemeState {
	theme: Theme;
	/** Resolved theme — true when the app is rendering dark (accounts for "system"). */
	isDark: boolean;
	setTheme: (theme: Theme) => void;
	toggleTheme: () => void;
}

export const useThemeStore = create<ThemeState>()((set, get) => ({
	theme: "system",
	isDark: false,
	setTheme: (theme) => {
		localStorage.setItem(STORAGE_KEY, theme);
		const isDark = resolveIsDark(theme);
		applyThemeClass(isDark);
		set({ theme, isDark });
	},
	toggleTheme: () => {
		get().setTheme(get().isDark ? "light" : "dark");
	},
}));

let initialized = false;

/** Reads the stored theme, applies it, and wires OS + cross-window listeners. */
export function initThemeStore() {
	if (initialized) return; // idempotent
	initialized = true;

	const stored = localStorage.getItem(STORAGE_KEY);
	const theme = isTheme(stored) ? stored : "system";
	const isDark = resolveIsDark(theme);
	applyThemeClass(isDark);
	useThemeStore.setState({ theme, isDark });

	// Follow OS appearance while in "system" mode.
	window.matchMedia(COLOR_SCHEME_QUERY).addEventListener("change", () => {
		if (useThemeStore.getState().theme !== "system") return;
		const isDark = systemPrefersDark();
		applyThemeClass(isDark);
		useThemeStore.setState({ isDark });
	});

	// Keep multiple windows in sync via localStorage.
	window.addEventListener("storage", (event) => {
		if (event.storageArea !== localStorage || event.key !== STORAGE_KEY) return;
		const theme = isTheme(event.newValue) ? event.newValue : "system";
		const isDark = resolveIsDark(theme);
		applyThemeClass(isDark);
		useThemeStore.setState({ theme, isDark });
	});
}
