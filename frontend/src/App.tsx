import { HugeiconsIcon } from "@hugeicons/react";
import { MailPane } from "./components/mail-pane";
import { MailView } from "./components/mail-view";
import { Badge } from "./components/ui/badge";
import { MailIcon } from "@hugeicons/core-free-icons";
import { Tooltip, TooltipContent, TooltipTrigger } from "./components/ui/tooltip";
import { Button } from "./components/ui/button";
import { formatShortcut } from "./lib/keyboard";

export function App() {
	return <div className="flex flex-row w-full">
		<MailPane />
		{/* hidden for now, dont even know if i'll show this */}
		<nav className="bg-secondary hidden px-4 border-b  flex-row items-center justify-between h-16 w-full">
			<Tooltip >
				{/*<TooltipTrigger className={"flex flex-row items-center max-w-xs gap-2"}>*/}
				<TooltipTrigger>
					{/* TODO: on click, should filter to only this mailbox? */}
					<Badge color="cyan">
						<HugeiconsIcon icon={MailIcon} />
						Personal
					</Badge>
					{/*TODO: show or no show? would be redundant if there is hover state.*/}
					{/*<span className="text-xs text-muted-foreground truncate">maythamajam@gmail.com</span>*/}
				</TooltipTrigger>
				<TooltipContent align="start">
					maythamajam@gmail.com
				</TooltipContent>
			</Tooltip>

			<Button size={"xs"} color={"yellow"} variant={"outline"}>Summarize {formatShortcut("mod+shift+s")}</Button>
		</nav>

		<MailView />
	</div>;
}

export default App;
