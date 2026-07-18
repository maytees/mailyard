import { ScrollArea } from "@/components/ui/scroll-area";
import { mailboxToColor, mockMail, type Message } from "@/data/mockMail";
import { cn } from "@/lib/utils";
import { useSettingsStore } from "@/stores/settings";

interface MailListProps {
	messages?: Message[];
	/** Selected message id — the active row gets a persistent highlight. */
	activeId?: string;
	onSelect?: (message: Message) => void;
}

export function MailList({
	messages = mockMail.messages,
	activeId,
	onSelect,
}: MailListProps) {
	const compact = useSettingsStore((s) => s.compact);

	return (
		<ScrollArea hideScrollbar className="flex-1 w-full min-w-md min-h-0">
			{messages.map((message) => (
				<MailListItem
					key={message.id}
					message={message}
					compact={compact}
					active={message.id === activeId}
					onClick={() => onSelect?.(message)}
				/>
			))}
		</ScrollArea>
	);
}

const MailListItem = ({
	message,
	compact,
	active,
	onClick,
}: {
	message: Message;
	compact: boolean;
	active?: boolean;
	onClick?: () => void;
}) => {
	return (
		<div
			role="button"
			tabIndex={0}
			onClick={onClick}
			onKeyDown={(event) => {
				if (event.key === "Enter" || event.key === " ") {
					event.preventDefault();
					onClick?.();
				}
			}}
			className={cn(
				"h-24 opacity-40 bg-secondary hover:bg-neutral-200 dark:hover:bg-neutral-900 cursor-pointer max-w-full dark:shadow-[inset_0_-1px_rgba(255,255,255,0.1)] shadow-[inset_0_-1px_0_#e5e7eb]",
				{
					"opacity-100": message.unread,
					"h-fit": compact,
					"bg-neutral-200 dark:bg-neutral-900 opacity-100": active,
				}
			)}
			style={{ borderLeft: `6px solid ${mailboxToColor[message.account]}` }}
		>
			<div className="px-4 py-2 flex gap-1.5 select-none flex-col justify-between h-full">
				{/* TODO: sender or subject pops out first? add as a setting in the future? */}
				<div className="-space-y-1">
					<div className="flex flex-row items-center justify-between w-full">
						<h2 className={cn("truncate", { "font-bold": message.unread })}>
							{message.sender}
						</h2>
						{/* TODO: format time (prolly not formatted originally, this is just mock data) */}
						<span className="text-muted-foreground text-xs font-medium">
							{message.time}
						</span>
					</div>
					<span
						className={cn("text-sm text-muted-foreground truncate", {
							"font-bold": message.unread,
						})}
					>
						{message.subject}
					</span>
				</div>
				{!compact && (
					<p
						className={cn(
							"text-xs line-clamp-2 mb-auto font-light text-muted-foreground",
							{ "font-medium": message.unread }
						)}
					>
						{message.summary}
					</p>
				)}
			</div>
		</div>
	);
};
