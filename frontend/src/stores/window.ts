// Currently this file is 100% written by Claude.
import { create } from "zustand";
import { Window, Events } from "@wailsio/runtime";

export const useWindowStore = create<{ isFullscreen: boolean }>(() => ({
	isFullscreen: false,
}));

let initialized = false;

export async function initWindowStore() {
	if (initialized) return;          // idempotent
	initialized = true;

	// seed current state — events are deltas, not snapshots
	useWindowStore.setState({ isFullscreen: await Window.IsFullscreen() });

	// subscribe to changes
	Events.On("common:WindowFullscreen", () => useWindowStore.setState({ isFullscreen: true }));
	Events.On("common:WindowUnFullscreen", () => useWindowStore.setState({ isFullscreen: false }));
}
