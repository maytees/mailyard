import { SearchIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import { useCommandPalette } from "@/components/command-palette";
import { MailList } from "@/components/mail-list";
import { Button } from "@/components/ui/button";
import {
	InputGroup,
	InputGroupAddon,
	InputGroupInput,
} from "@/components/ui/input-group";
import { KbdShortcut } from "@/components/ui/kbd";
import { formatShortcut } from "@/lib/keyboard";
import { useMailStore } from "@/stores/mail";
import { useSettingsStore } from "@/stores/settings";

/** Account summary + density toggle + the search trigger. */
function MailPaneHeader() {
	const { setOpen } = useCommandPalette();
	const compact = useSettingsStore((s) => s.compact);
	const toggleCompact = useSettingsStore((s) => s.toggleCompact);

	return (
		<div className="flex flex-col justify-between shrink-0 items-start pt-4 border-b pb-4 px-3.5">
			<div className="flex flex-row w-full pl-0.5 items-center justify-between">
				<div className="flex flex-row items-center gap-2.5">
					<h1 className="font-semibold">All accounts</h1>
					<p className="font-extralight text-xs mt-0.5">3 unread</p>
				</div>

				<Button
					variant={"outline"}
					className={"text-muted-foreground"}
					size={"xs"}
					onClick={toggleCompact}
				>
					{compact ? "Cozy" : "Compact"} {formatShortcut("mod+b")}
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
	const activeMessageId = useMailStore((s) => s.activeMessageId);
	const setActiveMessage = useMailStore((s) => s.setActiveMessage);

	return (
		<div className="flex h-svh bg-secondary max-w-md flex-col border-r">
			<MailPaneHeader />
			<MailList
				activeId={activeMessageId ?? undefined}
				onSelect={(message) => setActiveMessage(message.id)}
			/>
		</div>
	);
}
