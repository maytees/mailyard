import { create } from "zustand";

import { mockMail } from "@/data/mockMail";

interface MailState {
	/** Currently open message (thread) id; null shows the empty reading pane. */
	activeMessageId: string | null;
	setActiveMessage: (id: string | null) => void;
}

export const useMailStore = create<MailState>()((set) => ({
	// Default to the newest message so the reading pane isn't empty on boot.
	activeMessageId: mockMail.messages[0]?.id ?? null,
	setActiveMessage: (id) => set({ activeMessageId: id }),
}));
