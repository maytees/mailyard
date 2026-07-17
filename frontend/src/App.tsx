import { Button } from "@/components/ui/button";
import { KbdShortcut } from "./components/ui/kbd";
import { formatShortcut } from "./lib/keyboard";
import { InputGroup, InputGroupAddon, InputGroupInput } from "./components/ui/input-group";
import { HugeiconsIcon } from "@hugeicons/react";
import { SearchIcon } from "@hugeicons/core-free-icons";
import { useCommandPalette } from "./components/command-palette";
import { ScrollArea } from "./components/ui/scroll-area";
import { mailboxToColor, mockMail, type Message } from "./data/mockMail";
import { cn } from "./lib/utils";
import { useSettingsStore } from "./stores/settings";

export function App() {
	const { setOpen } = useCommandPalette();
	// TODO: tie into a setting
	const compact = useSettingsStore((s) => s.compact)
	const toggleCompact = useSettingsStore((s) => s.toggleCompact)

	return (
		<div className="flex h-svh bg-secondary max-w-md flex-col border-r">
			<div className="flex flex-col justify-between shrink-0 items-start pt-4 border-b pb-4 px-3.5">
				<div className="flex flex-row w-full pl-0.5 items-center justify-between">
					<div className="flex flex-row items-center gap-2.5">
						<h1 className="font-semibold">All accounts</h1>
						<p className="font-extralight text-xs mt-0.5">3 unread</p>
					</div>

					<Button variant={"outline"} className={"text-muted-foreground"} size={"xs"} onClick={toggleCompact}>{compact ? "Cozy" : "Compact"} {formatShortcut("mod+b")}</Button>
				</div>
				{/* Placeholder search — the command palette IS the search. Opens on
				    click (not focus): opening mid-mousedown makes the dialog treat the
				    mouseup as an outside press and instantly dismiss itself. */}
				<InputGroup
					className="mt-5 cursor-pointer"
					onClick={(event) => {
						(event.currentTarget.querySelector("input") as HTMLInputElement | null)?.blur();
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

			<ScrollArea hideScrollbar className="flex-1 w-full min-w-md min-h-0">
				{
					mockMail.messages.map((msg) => (
						<PreviewMailCard
							key={msg.id}
							message={msg}
							// made into a prop instead of directly using
							// state bcz later on it will be stored as a setting
							compact={compact}
						/>
					))
				}
			</ScrollArea>
		</div>
	);
}

const PreviewMailCard = ({ message, compact }: { message: Message, compact: boolean }) => {
	return (
		<div
			className={cn(
				"h-24 opacity-40 bg-secondary hover:bg-neutral-200 dark:hover:bg-neutral-900 cursor-pointer max-w-full dark:shadow-[inset_0_-1px_rgba(255,255,255,0.1)] shadow-[inset_0_-1px_0_#e5e7eb]", {
				// "bg-mauve-200 dark:bg-neutral-800 hover:bg-neutral-300 dark:hover:bg-neutral-950 opacity-100": message.unread,
				"opacity-100": message.unread,
				"h-fit": compact
			})}
			style={{ borderLeft: `6px solid ${mailboxToColor[message.account]}` }}
		>
			<div className={"px-4 py-2 flex gap-1.5 select-none flex-col justify-between h-full"}>
				{/* TODO: sender or subject pops out first? add as a setting in the future? */}
				<div className="-space-y-1">
					<div className="flex flex-row items-center justify-between w-full">
						<h2 className={cn("truncate",
							{
								"font-bold": message.unread
							})}>{message.sender}</h2>
						{/*TODO: format time (prolly not formated originally, this is just mock data)*/}
						<span className="text-muted-foreground text-xs font-medium">{message.time}</span>
					</div>
					<span className={cn("text-sm text-muted-foreground truncate", {
						"font-bold": message.unread
					})}>{message.subject}</span>
				</div>
				{!compact &&
					<p className={cn("text-xs line-clamp-2 mb-auto font-light text-muted-foreground", {
						"font-medium": message.unread
					})}>
						{message.summary}
					</p>
				}
			</div>
		</div>
	);
};

export default App;
