import {
	ArrowDown01Icon,
	Attachment01Icon,
	Download01Icon,
	File01Icon,
	ForwardIcon,
	Image01Icon,
	MailIcon,
	MailReplyAllIcon,
	MailReplyIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import * as React from "react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	HoverCard,
	HoverCardContent,
	HoverCardTrigger,
} from "@/components/ui/hover-card";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import {
	mailboxColorNames,
	mockMail,
	type Attachment,
	type Message,
	type MessageBlock,
	type ThreadEntry,
} from "@/data/mockMail";
import { cn } from "@/lib/utils";
import { useMailStore } from "@/stores/mail";

/** The reading pane: subject header + full thread for the active message. */
export function MailView() {
	const activeMessageId = useMailStore((s) => s.activeMessageId);
	const message = mockMail.messages.find((m) => m.id === activeMessageId);

	if (!message) {
		return (
			<div className="flex h-svh flex-1 min-w-0 flex-col items-center justify-center gap-3 text-muted-foreground">
				<HugeiconsIcon icon={MailIcon} className="size-8 opacity-50" />
				<p className="text-sm">Select an email to read</p>
			</div>
		);
	}

	// Keyed by message id so expand/collapse state resets per thread.
	return <MailThread key={message.id} message={message} />;
}

function MailThread({ message }: { message: Message }) {
	const account = mockMail.accounts[message.account];
	// Older entries start collapsed, Gmail-style; the newest stays open.
	const [expanded, setExpanded] = React.useState<ReadonlySet<number>>(
		() => new Set([message.thread.length - 1])
	);

	const toggle = (index: number) =>
		setExpanded((current) => {
			const next = new Set(current);
			if (next.has(index)) next.delete(index);
			else next.add(index);
			return next;
		});

	return (
		<section className="flex h-svh flex-1 min-w-0 flex-col">
			<header className="flex shrink-0 flex-row items-start justify-between gap-4 border-b px-6 pt-5 pb-4">
				<div className="flex min-w-0 flex-col gap-1.5">
					<h1 className="truncate font-heading text-xl font-semibold">
						{message.subject}
					</h1>
					<div className="flex flex-row items-center gap-2 text-xs text-muted-foreground">
						<Badge color={mailboxColorNames[message.account]} className="h-4.5">
							{account.name}
						</Badge>
						<span>
							{message.thread.length}{" "}
							{message.thread.length === 1 ? "message" : "messages"}
						</span>
					</div>
				</div>
			</header>

			<ScrollArea hideScrollbar className="min-h-0 flex-1">
				{message.thread.map((entry, index) => (
					<ThreadMessage
						key={index}
						entry={entry}
						accountEmail={account.email}
						expanded={expanded.has(index)}
						isLast={index === message.thread.length - 1}
						onToggle={() => toggle(index)}
					/>
				))}
			</ScrollArea>
		</section>
	);
}

function ThreadMessage({
	entry,
	accountEmail,
	expanded,
	isLast,
	onToggle,
}: {
	entry: ThreadEntry;
	accountEmail: string;
	expanded: boolean;
	isLast: boolean;
	onToggle: () => void;
}) {
	if (!expanded) {
		return (
			<button
				type="button"
				onClick={onToggle}
				className="flex w-full cursor-pointer flex-row items-center gap-3 border-b px-6 py-3 text-left hover:bg-muted/50"
			>
				<SenderAvatar name={entry.sender} size="sm" />
				<span className="shrink-0 text-sm font-medium">{entry.sender}</span>
				<span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
					{entry.snippet ?? blocksPreview(entry.blocks)}
				</span>
				<span className="shrink-0 text-xs text-muted-foreground">
					{entry.time}
				</span>
			</button>
		);
	}

	return (
		<article className={cn("px-6 py-5", !isLast && "border-b")}>
			{/* The whole header row collapses the message; nested interactive
			    bits (actions, recipients card) stop propagation. */}
			<div
				className="flex cursor-pointer flex-row items-center gap-3"
				onClick={onToggle}
			>
				<SenderAvatar name={entry.sender} />
				<div className="min-w-0 flex-1">
					<div className="flex flex-row items-center justify-between gap-2">
						<span className="truncate text-sm font-semibold">
							{entry.sender}
						</span>
						<div
							className="flex shrink-0 flex-row items-center gap-0.5"
							onClick={(event) => event.stopPropagation()}
						>
							<span className="mr-1.5 text-xs text-muted-foreground">
								{entry.time}
							</span>
							<MessageAction icon={MailReplyIcon} label="Reply" />
							<MessageAction icon={MailReplyAllIcon} label="Reply all" />
							<MessageAction icon={ForwardIcon} label="Forward" />
						</div>
					</div>
					<span onClick={(event) => event.stopPropagation()}>
						<RecipientsPopover entry={entry} accountEmail={accountEmail} />
					</span>
				</div>
			</div>

			<div className="mt-4 space-y-3 text-sm leading-relaxed">
				{entry.blocks.map((block, i) => (
					<Block key={i} block={block} />
				))}
			</div>

			{entry.attachments.length > 0 && (
				<AttachmentList attachments={entry.attachments} />
			)}
		</article>
	);
}

function MessageAction({
	icon,
	label,
}: {
	icon: IconSvgElement;
	label: string;
}) {
	return (
		<Tooltip>
			<TooltipTrigger
				render={
					<Button variant="ghost" size="icon-sm" aria-label={label}>
						<HugeiconsIcon icon={icon} />
					</Button>
				}
			/>
			<TooltipContent>{label}</TooltipContent>
		</Tooltip>
	);
}

/** "to you ⌄" — hover/click for the full From/To/Cc envelope. */
function RecipientsPopover({
	entry,
	accountEmail,
}: {
	entry: ThreadEntry;
	accountEmail: string;
}) {
	const to = entry.to ?? [accountEmail];
	const isSelf = entry.email === accountEmail;

	return (
		<HoverCard>
			<HoverCardTrigger
				delay={200}
				closeDelay={100}
				render={
					<button
						type="button"
						className="group/recipients flex cursor-pointer flex-row items-center gap-0.5 text-xs text-muted-foreground hover:text-foreground"
					/>
				}
			>
				{isSelf ? "you" : entry.email} · to{" "}
				{to.includes(accountEmail) ? "you" : to[0]}
				<HugeiconsIcon
					icon={ArrowDown01Icon}
					className="size-3 transition-transform group-data-popup-open/recipients:rotate-180"
				/>
			</HoverCardTrigger>
			<HoverCardContent
				align="start"
				className="flex w-fit max-w-sm flex-col gap-2 text-xs"
			>
				<EnvelopeRow label="from">
					{entry.sender}{" "}
					<span className="text-muted-foreground">&lt;{entry.email}&gt;</span>
				</EnvelopeRow>
				<EnvelopeRow label="to">
					{to.map((address) => (
						<div key={address}>
							{address === accountEmail ? `you <${address}>` : address}
						</div>
					))}
				</EnvelopeRow>
				{entry.cc && entry.cc.length > 0 && (
					<EnvelopeRow label="cc">
						{entry.cc.map((address) => (
							<div key={address}>{address}</div>
						))}
					</EnvelopeRow>
				)}
				<EnvelopeRow label="date">{entry.time}</EnvelopeRow>
			</HoverCardContent>
		</HoverCard>
	);
}

function EnvelopeRow({
	label,
	children,
}: {
	label: string;
	children: React.ReactNode;
}) {
	return (
		<div className="grid grid-cols-[3rem_1fr] gap-2">
			<span className="text-right text-muted-foreground">{label}:</span>
			<div className="min-w-0">{children}</div>
		</div>
	);
}

function SenderAvatar({
	name,
	size = "default",
}: {
	name: string;
	size?: "default" | "sm";
}) {
	return (
		<Avatar size={size}>
			<AvatarFallback className="font-medium">{initials(name)}</AvatarFallback>
		</Avatar>
	);
}

function initials(name: string) {
	return name
		.split(/\s+/)
		.slice(0, 2)
		.map((part) => part[0]?.toUpperCase() ?? "")
		.join("");
}

function blocksPreview(blocks: MessageBlock[]) {
	return blocks.find((b) => b.type === "paragraph" && b.text)?.text ?? "";
}

// ---- body blocks -----------------------------------------------------------

function Block({ block }: { block: MessageBlock }) {
	switch (block.type) {
		case "paragraph":
			return (
				<p>
					{block.lead && <span className="font-semibold">{block.lead}</span>}
					{block.text}
				</p>
			);
		case "list":
			return (
				<ul className="list-disc space-y-1 pl-5">
					{block.items?.map((item, i) => <li key={i}>{item}</li>)}
				</ul>
			);
		case "quote":
			return (
				<blockquote className="border-l-2 border-border pl-3 text-muted-foreground italic">
					{block.text}
				</blockquote>
			);
		case "image":
			return (
				<figure className="space-y-1.5">
					{/* Placeholder frame until real inline images exist. */}
					<div className="flex h-40 items-center justify-center rounded-2xl border bg-muted/30">
						<HugeiconsIcon
							icon={Image01Icon}
							className="size-8 text-muted-foreground/50"
						/>
					</div>
					{block.caption && (
						<figcaption className="text-xs text-muted-foreground">
							{block.caption}
						</figcaption>
					)}
				</figure>
			);
	}
}

// ---- attachments -----------------------------------------------------------

function AttachmentList({ attachments }: { attachments: Attachment[] }) {
	return (
		<div className="mt-5">
			<div className="mb-2 flex flex-row items-center gap-1.5 text-xs font-medium text-muted-foreground">
				<HugeiconsIcon icon={Attachment01Icon} className="size-3.5" />
				{attachments.length}{" "}
				{attachments.length === 1 ? "attachment" : "attachments"}
			</div>
			<div className="flex flex-row flex-wrap gap-2">
				{attachments.map((attachment) => (
					<AttachmentCard key={attachment.name} attachment={attachment} />
				))}
			</div>
		</div>
	);
}

function AttachmentCard({ attachment }: { attachment: Attachment }) {
	return (
		<div className="group/attachment flex flex-row items-center gap-2.5 rounded-2xl border bg-background py-2 pr-1.5 pl-3">
			<HugeiconsIcon
				icon={attachment.kind === "image" ? Image01Icon : File01Icon}
				className="size-4 shrink-0 text-muted-foreground"
			/>
			<div className="flex flex-col">
				<span className="max-w-48 truncate text-xs font-medium">
					{attachment.name}
				</span>
				<span className="text-[11px] text-muted-foreground">
					{attachment.ext} · {attachment.size}
				</span>
			</div>
			<Tooltip>
				<TooltipTrigger
					render={
						<Button
							variant="ghost"
							size="icon-xs"
							aria-label={`Download ${attachment.name}`}
							className="opacity-0 transition-opacity group-hover/attachment:opacity-100"
						>
							<HugeiconsIcon icon={Download01Icon} />
						</Button>
					}
				/>
				<TooltipContent>Download</TooltipContent>
			</Tooltip>
		</div>
	);
}
