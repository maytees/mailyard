import * as React from "react";

import { ScrollArea } from "@/components/ui/scroll-area";
import { formatRelativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useAccountsStore } from "@/stores/accounts";
import { loadMoreMessages, useMailStore } from "@/stores/mail";
import { useSettingsStore } from "@/stores/settings";
import type { Message } from "~/bindings/mailyard/internal/store/models";

interface MailListProps {
	messages: Message[];
	/** Selected message id — the active row gets a persistent highlight. */
	activeId?: number;
	onSelect?: (message: Message) => void;
}

export function MailList({ messages, activeId, onSelect }: MailListProps) {
	const compact = useSettingsStore((s) => s.compact);
	const accounts = useAccountsStore((s) => s.accounts);
	const hasMore = useMailStore((s) => s.hasMore);
	const sentinelRef = React.useRef<HTMLDivElement>(null);

	const colorByAccount = React.useMemo(() => {
		const map: Record<string, string> = {};
		for (const account of accounts) {
			map[account.id] = `var(--color-mailbox-${account.color})`;
		}
		return map;
	}, [accounts]);

	// Keep the active row visible during j/k navigation.
	React.useEffect(() => {
		if (activeId == null) return;
		document
			.querySelector(`[data-message-id="${activeId}"]`)
			?.scrollIntoView({ block: "nearest" });
	}, [activeId]);

	// Infinite scroll: fetch the next page when the tail sentinel becomes
	// visible, regardless of which element actually scrolls.
	React.useEffect(() => {
		const sentinel = sentinelRef.current;
		if (!sentinel || !hasMore) return;
		const observer = new IntersectionObserver((entries) => {
			if (entries.some((entry) => entry.isIntersecting)) {
				void loadMoreMessages();
			}
		});
		observer.observe(sentinel);
		return () => observer.disconnect();
	}, [hasMore, messages.length]);

	if (messages.length === 0) {
		return (
			<div className="flex flex-1 min-w-md items-center justify-center text-sm text-muted-foreground">
				No mail in this view
			</div>
		);
	}

	return (
		<ScrollArea hideScrollbar className="flex-1 w-full min-w-md min-h-0">
			{messages.map((message) => (
				<MailListItem
					key={message.id}
					message={message}
					color={colorByAccount[message.accountId] ?? "var(--color-mailbox-violet)"}
					compact={compact}
					active={message.id === activeId}
					onClick={() => onSelect?.(message)}
				/>
			))}
			{hasMore && <div ref={sentinelRef} className="h-8" />}
		</ScrollArea>
	);
}

const MailListItem = ({
	message,
	color,
	compact,
	active,
	onClick,
}: {
	message: Message;
	color: string;
	compact: boolean;
	active?: boolean;
	onClick?: () => void;
}) => {
	const sender = message.from.name || message.from.email || "(unknown)";

	return (
		<div
			role="button"
			tabIndex={0}
			data-message-id={message.id}
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
			style={{ borderLeft: `6px solid ${color}` }}
		>
			<div className="px-4 py-2 flex gap-1.5 select-none flex-col justify-between h-full">
				<div className="-space-y-1">
					<div className="flex flex-row items-center justify-between w-full">
						<h2 className={cn("truncate", { "font-bold": message.unread })}>
							{sender}
						</h2>
						<span
							className="text-muted-foreground text-xs font-medium shrink-0"
							title={formatRelativeTime(message.date)}
						>
							{formatRelativeTime(message.date)}
						</span>
					</div>
					<span
						className={cn("text-sm text-muted-foreground truncate block", {
							"font-bold": message.unread,
						})}
					>
						{message.subject || "(no subject)"}
					</span>
				</div>
				{!compact && (
					<p
						className={cn(
							"text-xs line-clamp-2 mb-auto font-light text-muted-foreground",
							{ "font-medium": message.unread }
						)}
					>
						{message.snippet}
					</p>
				)}
			</div>
		</div>
	);
};
