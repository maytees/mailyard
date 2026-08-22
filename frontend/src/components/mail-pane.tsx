import { SearchIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import { useCommandPalette } from "@/hooks/use-command-palette";
import { MailList } from "@/components/mail-list";
import { Button } from "@/components/ui/button";
import {
	InputGroup,
	InputGroupAddon,
	InputGroupInput,
} from "@/components/ui/input-group";
import { KbdShortcut } from "@/components/ui/kbd";
import { shortcutFor } from "@/lib/command";
import { formatShortcut } from "@/lib/keyboard";
import { useAccountsStore } from "@/stores/accounts";
import { editDraft } from "@/stores/compose";
import { setActiveMessage, useMailStore } from "@/stores/mail";
import { useSettingsStore } from "@/stores/settings";

const FOLDER_LABELS: Record<string, string> = {
	inbox: "Inbox",
	drafts: "Drafts",
	sent: "Sent",
	archive: "Archive",
	trash: "Trash",
	spam: "Spam",
};

/** View title + unread count + density toggle + the search trigger. */
function MailPaneHeader() {
	const { setOpen } = useCommandPalette();
	const compact = useSettingsStore((s) => s.compact);
	const toggleCompact = useSettingsStore((s) => s.toggleCompact);
	const accountFilter = useMailStore((s) => s.accountFilter);
	const folderRole = useMailStore((s) => s.folderRole);
	const unreadCounts = useMailStore((s) => s.unreadCounts);
	const accounts = useAccountsStore((s) => s.accounts);

	const account = accounts.find((a) => a.id === accountFilter);
	const title = account ? account.displayName : "All accounts";
	const folderLabel = FOLDER_LABELS[folderRole] ?? folderRole;
	const unread = account
		? (unreadCounts[account.id] ?? 0)
		: Object.values(unreadCounts).reduce((sum, count) => sum + count, 0);

	return (
		<div className="flex flex-col justify-between shrink-0 items-start pt-4 border-b pb-4 px-3.5">
			<div className="flex flex-row w-full pl-0.5 items-center justify-between">
				<div className="flex flex-row items-center gap-2.5 min-w-0">
					<h1 className="font-semibold truncate">
						{title}
						{folderRole !== "inbox" && (
							<span className="text-muted-foreground font-normal">
								{" "}
								· {folderLabel}
							</span>
						)}
					</h1>
					{folderRole === "inbox" && (
						<p className="font-extralight text-xs mt-0.5 shrink-0">
							{unread} unread
						</p>
					)}
				</div>

				<Button
					variant={"outline"}
					className={"text-muted-foreground shrink-0"}
					size={"xs"}
					onClick={toggleCompact}
				>
					{compact ? "Cozy" : "Compact"}{" "}
					{formatShortcut(shortcutFor("toggle-compact") ?? "")}
				</Button>
			</div>
			{/* Placeholder search — the command palette IS the search. Opens on
			    click (not focus): opening mid-mousedown makes the dialog treat the
			    mouseup as an outside press and instantly dismiss itself. */}
			<InputGroup
				className="mt-5 cursor-pointer"
				onClick={(event) => {
					(
						event.currentTarget.querySelector("input") as HTMLInputElement | null
					)?.blur();
					setOpen(true);
				}}
			>
				<InputGroupInput
					placeholder="Search or command..."
					readOnly
					className="cursor-pointer"
				/>
				<InputGroupAddon>
					<HugeiconsIcon icon={SearchIcon} />
				</InputGroupAddon>
				<InputGroupAddon align="inline-end">
					<KbdShortcut shortcut="mod+k" />
				</InputGroupAddon>
			</InputGroup>
		</div>
	);
}

/** The second sidebar: header + scrollable message list. */
export function MailPane() {
	const messages = useMailStore((s) => s.messages);
	const activeMessageId = useMailStore((s) => s.activeMessageId);
	const folderRole = useMailStore((s) => s.folderRole);

	return (
		<div className="flex h-svh shrink-0 bg-secondary max-w-md flex-col border-r">
			<MailPaneHeader />
			<MailList
				messages={messages}
				activeId={activeMessageId ?? undefined}
				onSelect={(message) => {
					setActiveMessage(message.id);
					// Drafts open straight into the composer, Gmail-style.
					if (folderRole === "drafts") {
						void editDraft(message);
					}
				}}
			/>
		</div>
	);
}
