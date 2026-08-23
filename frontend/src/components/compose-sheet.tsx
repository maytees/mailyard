import {
	AiEditingIcon,
	Attachment01Icon,
	Cancel01Icon,
	Delete02Icon,
	MagicWandIcon,
	Maximize01Icon,
	PictureInPictureOnIcon,
	SentIcon,
	SidebarRightIcon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react"
import * as React from "react"

import { AddressInput } from "@/components/address-input"
import { StreamingCaret } from "@/components/ai-panel"
import { Button } from "@/components/ui/button"
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { KbdShortcut } from "@/components/ui/kbd"
import {
	Sheet,
	SheetContent,
	SheetHeader,
	SheetTitle,
} from "@/components/ui/sheet"
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip"
import { Textarea } from "@/components/ui/textarea"
import { formatBytes } from "@/lib/format"
import { matchesShortcut } from "@/lib/keyboard"
import { cn } from "@/lib/utils"
import { useAccountsStore } from "@/stores/accounts"
import { composeFromInstructions, rewriteComposeBody } from "@/stores/ai"
import {
	closeCompose,
	discardCompose,
	pickComposeAttachments,
	removeComposeAttachment,
	sendCompose,
	setComposeField,
	useComposeStore,
} from "@/stores/compose"
import { useSettingsStore, type ComposeStyle } from "@/stores/settings"

const TITLES = {
	new: "New message",
	reply: "Reply",
	"reply-all": "Reply all",
	forward: "Forward",
} as const

const STYLE_OPTIONS: { key: ComposeStyle; icon: IconSvgElement; label: string }[] = [
	{ key: "sheet", icon: SidebarRightIcon, label: "Side panel" },
	{ key: "modal", icon: Maximize01Icon, label: "Centered" },
	{ key: "docked", icon: PictureInPictureOnIcon, label: "Docked" },
]

/** Toggles between the three composer presentations, from inside the composer. */
function StyleSwitcher() {
	const style = useSettingsStore((s) => s.composeStyle)
	const setStyle = useSettingsStore((s) => s.setComposeStyle)

	return (
		<div className="flex flex-row items-center gap-0.5">
			{STYLE_OPTIONS.map((option) => (
				<Tooltip key={option.key}>
					<TooltipTrigger
						render={
							<Button
								variant={style === option.key ? "secondary" : "ghost"}
								size="icon-xs"
								aria-label={option.label}
								onClick={() => setStyle(option.key)}
							/>
						}
					>
						<HugeiconsIcon icon={option.icon} className="size-3.5" />
					</TooltipTrigger>
					<TooltipContent>{option.label}</TooltipContent>
				</Tooltip>
			))}
		</div>
	)
}

/** Drag handle on the side panel's left edge. */
function ResizeHandle() {
	const setWidth = useSettingsStore((s) => s.setComposeWidth)

	const startResize = (event: React.PointerEvent<HTMLDivElement>) => {
		event.preventDefault()
		const onMove = (move: PointerEvent) => {
			const max = Math.min(960, window.innerWidth - 200)
			setWidth(Math.min(max, Math.max(440, window.innerWidth - move.clientX)))
		}
		const onUp = () => {
			window.removeEventListener("pointermove", onMove)
			window.removeEventListener("pointerup", onUp)
		}
		window.addEventListener("pointermove", onMove)
		window.addEventListener("pointerup", onUp)
	}

	return (
		<div
			onPointerDown={startResize}
			aria-hidden
			className="absolute inset-y-0 left-0 z-10 w-1.5 cursor-col-resize transition-colors hover:bg-primary/40 active:bg-primary/50"
		/>
	)
}

/** Everything inside the composer, shell-agnostic. */
function ComposeInner({ header }: { header: React.ReactNode }) {
	const state = useComposeStore()
	const accounts = useAccountsStore((s) => s.accounts)
	const [aiInstructions, setAiInstructions] = React.useState("")
	// Cc/Bcc start revealed only when prefilled; manual reveal sticks for the
	// session.
	const [ccBccRevealed, setCcBccRevealed] = React.useState(false)
	const showCcBcc = ccBccRevealed || Boolean(state.cc || state.bcc)

	const writeWithAI = () => {
		if (!aiInstructions.trim()) return
		void composeFromInstructions(aiInstructions)
		setAiInstructions("")
	}

	return (
		<div
			className="flex min-h-0 flex-1 flex-col"
			onKeyDown={(event) => {
				if (matchesShortcut(event, "mod+enter")) {
					event.preventDefault()
					void sendCompose()
				}
			}}
		>
			{header}

			<div className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto px-5 pt-3">
				{accounts.length > 1 && (
					<div className="flex flex-row items-center gap-2 border-b py-1">
						<span className="w-8 shrink-0 text-xs text-muted-foreground">
							From
						</span>
						<select
							value={state.accountId}
							onChange={(e) => setComposeField("accountId", e.target.value)}
							className="h-7 flex-1 cursor-pointer bg-transparent text-sm outline-none"
						>
							{accounts.map((account) => (
								<option key={account.id} value={account.id}>
									{account.displayName} — {account.email}
								</option>
							))}
						</select>
					</div>
				)}

				<AddressInput
					label="To"
					value={state.to}
					onChange={(v) => setComposeField("to", v)}
					autoFocus={state.mode === "new"}
				/>
				{showCcBcc ? (
					<>
						<AddressInput
							label="Cc"
							value={state.cc}
							onChange={(v) => setComposeField("cc", v)}
						/>
						<AddressInput
							label="Bcc"
							value={state.bcc}
							onChange={(v) => setComposeField("bcc", v)}
						/>
					</>
				) : (
					<button
						type="button"
						className="self-start text-xs text-muted-foreground hover:text-foreground"
						onClick={() => setCcBccRevealed(true)}
					>
						Cc / Bcc
					</button>
				)}

				<div className="border-b py-1">
					<Input
						value={state.subject}
						onChange={(e) => setComposeField("subject", e.target.value)}
						placeholder="Subject"
						autoFocus={state.mode !== "new"}
						className="h-7 rounded-none border-none bg-transparent px-0 font-medium focus-visible:ring-0 focus-visible:border-transparent"
					/>
				</div>

				{/* AI takes dictation: describe the email, get exactly that. */}
				<div className="flex flex-row items-center gap-2 border-b py-1">
					<HugeiconsIcon
						icon={AiEditingIcon}
						className="size-4 shrink-0 text-muted-foreground"
					/>
					<Input
						value={aiInstructions}
						onChange={(e) => setAiInstructions(e.target.value)}
						onKeyDown={(event) => {
							if (event.key === "Enter") {
								event.preventDefault()
								writeWithAI()
							}
						}}
						placeholder={
							state.mode === "new"
								? "Tell AI what to say — e.g. “ask Bob for the budget numbers by Friday”"
								: "Tell AI what to reply — e.g. “say Friday works, ask who else is coming”"
						}
						className="h-7 rounded-none border-none bg-transparent px-0 text-xs focus-visible:ring-0 focus-visible:border-transparent"
					/>
					<Button
						type="button"
						variant="ghost"
						size="xs"
						className="h-6 shrink-0 rounded-full px-2 text-xs text-muted-foreground"
						disabled={!aiInstructions.trim() || state.aiWriting}
						onClick={writeWithAI}
					>
						{state.aiWriting ? "Writing…" : "Write"}
					</Button>
				</div>

				<div className="relative mt-2 flex min-h-40 flex-1 flex-col">
					{/* Feedback for the dead air before the first token streams in. */}
					{state.aiWriting && !state.body && (
						<span className="pointer-events-none absolute top-0.5 left-0">
							<StreamingCaret />
						</span>
					)}
					<Textarea
						value={state.body}
						onChange={(e) => setComposeField("body", e.target.value)}
						placeholder={state.aiWriting ? "" : "Write your message…"}
						className="min-h-40 flex-1 resize-none rounded-none border-none bg-transparent px-0 focus-visible:ring-0 focus-visible:border-transparent"
					/>
				</div>

				{state.attachments.length > 0 && (
					<div className="flex flex-row flex-wrap gap-1.5 pb-2">
						{state.attachments.map((file) => (
							<span
								key={file.path}
								className="flex flex-row items-center gap-1.5 rounded-full border bg-secondary py-1 pr-1 pl-2.5 text-xs"
							>
								{file.name}
								<span className="text-muted-foreground">
									{formatBytes(file.size)}
								</span>
								<Button
									variant="ghost"
									size="icon-xs"
									aria-label={`Remove ${file.name}`}
									className="size-4"
									onClick={() => removeComposeAttachment(file.path)}
								>
									<HugeiconsIcon icon={Cancel01Icon} className="size-3" />
								</Button>
							</span>
						))}
					</div>
				)}

				{state.error && (
					<p className="pb-2 text-sm text-destructive">{state.error}</p>
				)}
			</div>

			{/* flex-wrap: with the rewrite tones visible this row can exceed
			    narrow shells, and Send must never clip. */}
			<div className="flex shrink-0 flex-row flex-wrap items-center justify-between gap-y-2 border-t px-5 py-3">
				<div className="flex flex-row items-center gap-1">
					<Button
						variant="ghost"
						size="icon-sm"
						aria-label="Attach files"
						onClick={() => void pickComposeAttachments()}
					>
						<HugeiconsIcon icon={Attachment01Icon} />
					</Button>
					<Button
						variant="ghost"
						size="icon-sm"
						aria-label="Discard draft"
						className="text-muted-foreground hover:text-destructive"
						onClick={discardCompose}
					>
						<HugeiconsIcon icon={Delete02Icon} />
					</Button>
					{state.draftStatus && (
						<span className="ml-1 text-xs text-muted-foreground">
							{state.draftStatus === "saving" ? "Saving…" : "Saved"}
						</span>
					)}
					{state.body.trim() && (
						<div className="ml-1 flex flex-row items-center gap-1">
							<HugeiconsIcon
								icon={MagicWandIcon}
								className="size-3.5 text-muted-foreground"
							/>
							{(["concise", "friendly", "formal"] as const).map((tone) => (
								<Button
									key={tone}
									variant="ghost"
									size="xs"
									className="h-6 rounded-full px-2 text-xs text-muted-foreground"
									disabled={state.aiWriting}
									onClick={() => void rewriteComposeBody(tone)}
								>
									{tone}
								</Button>
							))}
						</div>
					)}
				</div>
				<div className="flex flex-row items-center gap-2.5">
					<KbdShortcut shortcut="mod+enter" />
					<Button
						color="rose"
						size="sm"
						disabled={state.sending || !state.to.trim()}
						onClick={() => void sendCompose()}
					>
						<HugeiconsIcon icon={SentIcon} />
						{state.sending ? "Sending…" : "Send"}
					</Button>
				</div>
			</div>
		</div>
	)
}

export function ComposeSheet() {
	const open = useComposeStore((s) => s.open)
	const mode = useComposeStore((s) => s.mode)
	const style = useSettingsStore((s) => s.composeStyle)
	const width = useSettingsStore((s) => s.composeWidth)
	const title = TITLES[mode]

	if (style === "docked") {
		if (!open) return null
		return (
			<div
				className="fixed right-6 bottom-0 z-50 flex h-[560px] max-h-[85vh] w-[500px] max-w-[calc(100vw-3rem)] flex-col overflow-hidden rounded-t-3xl border bg-popover text-sm text-popover-foreground shadow-2xl"
				onKeyDown={(event) => {
					if (event.key === "Escape") {
						event.stopPropagation()
						closeCompose()
					}
				}}
			>
				<ComposeInner
					header={
						<div className="flex shrink-0 flex-row items-center justify-between border-b px-5 py-3">
							<h2 className="font-heading text-base font-medium">{title}</h2>
							<div className="flex flex-row items-center gap-1.5">
								<StyleSwitcher />
								<Button
									variant="ghost"
									size="icon-xs"
									aria-label="Close"
									onClick={closeCompose}
								>
									<HugeiconsIcon icon={Cancel01Icon} />
								</Button>
							</div>
						</div>
					}
				/>
			</div>
		)
	}

	if (style === "modal") {
		return (
			<Dialog
				open={open}
				onOpenChange={(next) => {
					if (!next) closeCompose()
				}}
			>
				<DialogContent className="flex h-[80vh] max-h-[720px] flex-col gap-0 p-0 sm:max-w-2xl">
					<ComposeInner
						header={
							<DialogHeader className="shrink-0 flex-row items-center justify-between border-b px-5 py-4">
								<DialogTitle>{title}</DialogTitle>
								<div className="mr-8">
									<StyleSwitcher />
								</div>
							</DialogHeader>
						}
					/>
				</DialogContent>
			</Dialog>
		)
	}

	return (
		<Sheet
			open={open}
			onOpenChange={(next) => {
				if (!next) closeCompose()
			}}
		>
			<SheetContent
				side="right"
				className={cn("gap-0 p-0 sm:max-w-none")}
				style={{ width, maxWidth: "90vw" }}
			>
				<ResizeHandle />
				<ComposeInner
					header={
						<SheetHeader className="shrink-0 flex-row items-center justify-between border-b px-5 py-4">
							<SheetTitle>{title}</SheetTitle>
							<div className="mr-8">
								<StyleSwitcher />
							</div>
						</SheetHeader>
					}
				/>
			</SheetContent>
		</Sheet>
	)
}
