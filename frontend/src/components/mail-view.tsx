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
	SparklesIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import { motion } from "motion/react";
import * as React from "react";

import { ActionItemsCard } from "@/components/action-items-card";
import { AIPanel } from "@/components/ai-panel";
import { HtmlBody } from "@/components/html-body";
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
import { KbdShortcut } from "@/components/ui/kbd";
import { shortcutFor } from "@/lib/command";
import { formatBytes, formatFullDate, formatRelativeTime } from "@/lib/format";
import type { MailboxColor } from "@/lib/mailbox-colors";
import { cn } from "@/lib/utils";
import { useAccountsStore } from "@/stores/accounts";
import { summarizeThread, threadKeyOf } from "@/stores/ai";
import { composeFromMessage, editDraft } from "@/stores/compose";
import { useMailStore } from "@/stores/mail";
import * as MailService from "~/bindings/mailyard/mailservice";
import type {
	Attachment,
	Message,
} from "~/bindings/mailyard/internal/store/models";

/** The reading pane: subject header + full thread for the active message. */
export function MailView() {
	const messages = useMailStore((s) => s.messages);
	const activeMessageId = useMailStore((s) => s.activeMessageId);
	const detachedMessage = useMailStore((s) => s.detachedMessage);
	const message =
		messages.find((m) => m.id === activeMessageId) ??
		(detachedMessage?.id === activeMessageId ? detachedMessage : undefined);

	if (!message) {
		return (
			<div className="flex h-svh flex-1 min-w-0 flex-col items-center justify-center gap-3 text-muted-foreground">
				<HugeiconsIcon icon={MailIcon} className="size-8 opacity-50" />
				<p className="text-sm">Select an email to read</p>
			</div>
		);
	}

	// Keyed by thread so expand/collapse state resets when switching — the
	// remount also replays the subtle entrance transition.
	return (
		<MailThread
			key={`${message.accountId}:${message.threadId}`}
			message={message}
		/>
	);
}

function MailThread({ message }: { message: Message }) {
	const accounts = useAccountsStore((s) => s.accounts);
	const account = accounts.find((a) => a.id === message.accountId);
	const folderRole = useMailStore((s) => s.folderRole);

	const [thread, setThread] = React.useState<Message[]>([message]);
	const [expandedIds, setExpandedIds] = React.useState<ReadonlySet<number>>(
		() => new Set([message.id])
	);

	React.useEffect(() => {
		let cancelled = false;
		MailService.GetThread(message.accountId, message.threadId)
			.then((entries) => {
				if (cancelled || !entries || entries.length === 0) return;
				setThread(entries);
				// Older entries start collapsed, Gmail-style; the one the user
				// opened (or the newest) stays open.
				const opened = entries.some((e) => e.id === message.id)
					? message.id
					: entries[entries.length - 1].id;
				setExpandedIds(new Set([opened]));
			})
			.catch(() => {
				// Thread lookup failing must never blank the reading pane.
			});
		return () => {
			cancelled = true;
		};
	}, [message.accountId, message.threadId, message.id]);

	const toggle = (id: number) =>
		setExpandedIds((current) => {
			const next = new Set(current);
			if (next.has(id)) next.delete(id);
			else next.add(id);
			return next;
		});

	return (
		<motion.section
			initial={{ opacity: 0, y: 6 }}
			animate={{ opacity: 1, y: 0 }}
			transition={{ duration: 0.18, ease: "easeOut" }}
			// max-w-full + clip: the reading pane can never exceed its flex
			// allocation, whatever an email renders inside it.
			className="flex h-svh flex-1 min-w-0 max-w-full flex-col overflow-x-clip"
		>
			<header className="flex shrink-0 flex-row items-start justify-between gap-4 border-b px-6 pt-5 pb-4">
				<div className="flex min-w-0 flex-col gap-1.5">
					<h1 className="truncate font-heading text-xl font-semibold">
						{message.subject || "(no subject)"}
					</h1>
					<div className="flex flex-row items-center gap-2 text-xs text-muted-foreground">
						{account && (
							<Badge color={account.color as MailboxColor} className="h-4.5">
								{account.displayName}
							</Badge>
						)}
						<span>
							{thread.length} {thread.length === 1 ? "message" : "messages"}
						</span>
					</div>
				</div>
				<div className="flex shrink-0 flex-row items-center gap-1.5">
					{folderRole === "drafts" && (
						<Button
							variant="outline"
							size="xs"
							onClick={() => void editDraft(message)}
						>
							Edit draft
						</Button>
					)}
					<Tooltip>
						<TooltipTrigger
							render={
								<Button
									variant="outline"
									size="xs"
									color="yellow"
									onClick={() => summarizeThread(message)}
								/>
							}
						>
							<HugeiconsIcon icon={SparklesIcon} className="size-3.5" />
							Summarize
						</TooltipTrigger>
						<TooltipContent>
							<KbdShortcut shortcut={shortcutFor("ai-summarize") ?? ""}>
								Summarize thread
							</KbdShortcut>
						</TooltipContent>
					</Tooltip>
				</div>
			</header>

			<AIPanel threadKey={threadKeyOf(message)} />
			<ActionItemsCard message={message} />

			<ScrollArea hideScrollbar className="min-h-0 flex-1">
				{thread.map((entry, index) => (
					<ThreadMessage
						key={entry.id}
						entry={entry}
						accountEmail={account?.email ?? ""}
						expanded={expandedIds.has(entry.id)}
						isLast={index === thread.length - 1}
						onToggle={() => toggle(entry.id)}
					/>
				))}
			</ScrollArea>
		</motion.section>
	);
}

function senderName(entry: Message) {
	return entry.from.name || entry.from.email || "(unknown)";
}

function ThreadMessage({
	entry,
	accountEmail,
	expanded,
	isLast,
	onToggle,
}: {
	entry: Message;
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
				<SenderAvatar name={senderName(entry)} size="sm" />
				<span className="shrink-0 text-sm font-medium">{senderName(entry)}</span>
				<span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
					{entry.snippet}
				</span>
				<span className="shrink-0 text-xs text-muted-foreground">
					{formatRelativeTime(entry.date)}
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
				<SenderAvatar name={senderName(entry)} />
				<div className="min-w-0 flex-1">
					<div className="flex flex-row items-center justify-between gap-2">
						<span className="truncate text-sm font-semibold">
							{senderName(entry)}
						</span>
						<div
							className="flex shrink-0 flex-row items-center gap-0.5"
							onClick={(event) => event.stopPropagation()}
						>
							<span className="mr-1.5 text-xs text-muted-foreground">
								{formatRelativeTime(entry.date)}
							</span>
							<MessageAction
								icon={MailReplyIcon}
								label="Reply"
								onClick={() => void composeFromMessage(entry, "reply")}
							/>
							<MessageAction
								icon={MailReplyAllIcon}
								label="Reply all"
								onClick={() => void composeFromMessage(entry, "reply-all")}
							/>
							<MessageAction
								icon={ForwardIcon}
								label="Forward"
								onClick={() => void composeFromMessage(entry, "forward")}
							/>
						</div>
					</div>
					<span onClick={(event) => event.stopPropagation()}>
						<RecipientsPopover entry={entry} accountEmail={accountEmail} />
					</span>
				</div>
			</div>

			<div className="mt-4">
				<MessageBody messageId={entry.id} />
			</div>

			{entry.hasAttachments && <MessageAttachments messageId={entry.id} />}
		</article>
	);
}

/** Lazily fetches and renders one message's body (HTML preferred). */
function MessageBody({ messageId }: { messageId: number }) {
	const [body, setBody] = React.useState<{
		html: string;
		text: string;
	} | null>(null);

	React.useEffect(() => {
		let cancelled = false;
		MailService.GetMessageBody(messageId)
			.then((result) => {
				if (!cancelled) {
					setBody({ html: result.htmlSanitized, text: result.textBody });
				}
			})
			.catch(() => {
				if (!cancelled) setBody({ html: "", text: "" });
			});
		return () => {
			cancelled = true;
		};
	}, [messageId]);

	if (body === null) {
		return (
			<div className="space-y-2">
				<div className="h-3 w-3/4 animate-pulse rounded bg-muted" />
				<div className="h-3 w-1/2 animate-pulse rounded bg-muted" />
			</div>
		);
	}
	if (body.html) {
		return <HtmlBody html={body.html} />;
	}
	if (body.text) {
		return (
			<div className="text-sm leading-relaxed whitespace-pre-wrap break-words">
				{body.text}
			</div>
		);
	}
	return (
		<p className="text-sm text-muted-foreground italic">
			This message has no cached body yet.
		</p>
	);
}

function MessageAction({
	icon,
	label,
	onClick,
}: {
	icon: IconSvgElement;
	label: string;
	onClick?: () => void;
}) {
	return (
		<Tooltip>
			<TooltipTrigger
				render={
					<Button
						variant="ghost"
						size="icon-sm"
						aria-label={label}
						onClick={onClick}
					>
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
	entry: Message;
	accountEmail: string;
}) {
	const to = entry.to ?? [];
	const cc = entry.cc ?? [];
	const isSelf = entry.from.email === accountEmail;
	const toEmails = to.map((a) => a.email);
	const toLabel = toEmails.includes(accountEmail)
		? "you"
		: (toEmails[0] ?? "…");

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
				{isSelf ? "you" : entry.from.email} · to {toLabel}
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
					{senderName(entry)}{" "}
					<span className="text-muted-foreground">
						&lt;{entry.from.email}&gt;
					</span>
				</EnvelopeRow>
				{to.length > 0 && (
					<EnvelopeRow label="to">
						{to.map((address) => (
							<div key={address.email}>
								{address.email === accountEmail
									? `you <${address.email}>`
									: address.email}
							</div>
						))}
					</EnvelopeRow>
				)}
				{cc.length > 0 && (
					<EnvelopeRow label="cc">
						{cc.map((address) => (
							<div key={address.email}>{address.email}</div>
						))}
					</EnvelopeRow>
				)}
				<EnvelopeRow label="date">{formatFullDate(entry.date)}</EnvelopeRow>
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

// ---- attachments -----------------------------------------------------------

function MessageAttachments({ messageId }: { messageId: number }) {
	const [attachments, setAttachments] = React.useState<Attachment[]>([]);

	React.useEffect(() => {
		let cancelled = false;
		MailService.ListAttachments(messageId)
			.then((list) => {
				if (!cancelled) setAttachments(list ?? []);
			})
			.catch(() => {});
		return () => {
			cancelled = true;
		};
	}, [messageId]);

	if (attachments.length === 0) return null;

	return (
		<div className="mt-5">
			<div className="mb-2 flex flex-row items-center gap-1.5 text-xs font-medium text-muted-foreground">
				<HugeiconsIcon icon={Attachment01Icon} className="size-3.5" />
				{attachments.length}{" "}
				{attachments.length === 1 ? "attachment" : "attachments"}
			</div>
			<div className="flex flex-row flex-wrap gap-2">
				{attachments.map((attachment) => (
					<AttachmentCard key={attachment.id} attachment={attachment} />
				))}
			</div>
		</div>
	);
}

function AttachmentCard({ attachment }: { attachment: Attachment }) {
	const [saving, setSaving] = React.useState(false);
	const isImage = attachment.mimeType.startsWith("image/");

	const save = async () => {
		setSaving(true);
		try {
			await MailService.SaveAttachment(attachment.id);
		} catch (error) {
			console.error("save attachment failed", error);
		} finally {
			setSaving(false);
		}
	};

	return (
		<div className="group/attachment flex flex-row items-center gap-2.5 rounded-2xl border bg-background py-2 pr-1.5 pl-3">
			<HugeiconsIcon
				icon={isImage ? Image01Icon : File01Icon}
				className="size-4 shrink-0 text-muted-foreground"
			/>
			<div className="flex flex-col">
				<span className="max-w-48 truncate text-xs font-medium">
					{attachment.filename}
				</span>
				<span className="text-[11px] text-muted-foreground">
					{formatBytes(attachment.size)}
				</span>
			</div>
			<Tooltip>
				<TooltipTrigger
					render={
						<Button
							variant="ghost"
							size="icon-xs"
							aria-label={`Save ${attachment.filename}`}
							disabled={saving}
							className="opacity-0 transition-opacity group-hover/attachment:opacity-100"
							onClick={() => void save()}
						/>
					}
				>
					<HugeiconsIcon icon={Download01Icon} />
				</TooltipTrigger>
				<TooltipContent>Save</TooltipContent>
			</Tooltip>
		</div>
	);
}
