import {
	Attachment01Icon,
	Cancel01Icon,
	MagicWandIcon,
	SentIcon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import * as React from "react"

import { AddressInput } from "@/components/address-input"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { KbdShortcut } from "@/components/ui/kbd"
import {
	Sheet,
	SheetContent,
	SheetHeader,
	SheetTitle,
} from "@/components/ui/sheet"
import { Textarea } from "@/components/ui/textarea"
import { formatBytes } from "@/lib/format"
import { matchesShortcut } from "@/lib/keyboard"
import { useAccountsStore } from "@/stores/accounts"
import { rewriteComposeBody } from "@/stores/ai"
import {
	closeCompose,
	pickComposeAttachments,
	removeComposeAttachment,
	sendCompose,
	setComposeField,
	useComposeStore,
} from "@/stores/compose"


export function ComposeSheet() {
	const state = useComposeStore()
	const accounts = useAccountsStore((s) => s.accounts)
	// Cc/Bcc start revealed only when prefilled; manual reveal sticks for the
	// session. Keyed on `open` via manual reset in the reveal handler below.
	const [ccBccRevealed, setCcBccRevealed] = React.useState(false)
	const showCcBcc = ccBccRevealed || Boolean(state.cc || state.bcc)

	const titles = {
		new: "New message",
		reply: "Reply",
		"reply-all": "Reply all",
		forward: "Forward",
	} as const

	return (
		<Sheet
			open={state.open}
			onOpenChange={(open) => {
				if (!open) {
					setCcBccRevealed(false)
					closeCompose()
				}
			}}
		>
			<SheetContent
				side="right"
				className="sm:max-w-xl gap-0 p-0"
				onKeyDown={(event) => {
					if (matchesShortcut(event, "mod+enter")) {
						event.preventDefault()
						void sendCompose()
					}
				}}
			>
				<SheetHeader className="border-b px-5 py-4">
					<SheetTitle>{titles[state.mode]}</SheetTitle>
				</SheetHeader>

				<div className="flex min-h-0 flex-1 flex-col gap-1 px-5 pt-3">
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

					<Textarea
						value={state.body}
						onChange={(e) => setComposeField("body", e.target.value)}
						placeholder="Write your message…"
						className="mt-2 min-h-40 flex-1 resize-none rounded-none border-none bg-transparent px-0 focus-visible:ring-0 focus-visible:border-transparent"
					/>

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

				{/* flex-wrap: with the rewrite tones visible this row is wider than
				    the sheet, and Send must never clip. */}
				<div className="flex flex-row flex-wrap items-center justify-between gap-y-2 border-t px-5 py-3">
					<div className="flex flex-row items-center gap-1">
						<Button
							variant="ghost"
							size="icon-sm"
							aria-label="Attach files"
							onClick={() => void pickComposeAttachments()}
						>
							<HugeiconsIcon icon={Attachment01Icon} />
						</Button>
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
			</SheetContent>
		</Sheet>
	)
}
