import { Button } from "@/components/ui/button";
import { KbdShortcut } from "./components/ui/kbd";
import { formatShortcut } from "./lib/keyboard";
import { InputGroup, InputGroupAddon, InputGroupInput } from "./components/ui/input-group";
import { HugeiconsIcon } from "@hugeicons/react";
import { SearchIcon } from "@hugeicons/core-free-icons";
import { useCommandPalette } from "./components/command-palette";

export function App() {
	const { setOpen } = useCommandPalette();

	return (
		<div className="flex min-h-svh pb-6 bg-secondary flex-col">
			<div className="flex flex-col items-start pt-4 border-b pb-4 px-3.5 min-w-sm">
				<div className="flex flex-row w-full pl-0.5 items-center justify-between">
					<div className="flex flex-row items-center gap-2.5">
						<h1 className="font-semibold">All accounts</h1>
						<p className="font-extralight text-xs mt-0.5">3 unread</p>
					</div>

					<Button variant={"ghost"} className={"text-muted-foreground"} size={"xs"}>Compact {formatShortcut("mod+b")}</Button>
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
		</div>
	);
}

export default App;
