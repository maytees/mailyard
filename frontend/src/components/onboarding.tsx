import { ArrowRight02Icon, MailPlus } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import * as React from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { KbdShortcut } from "@/components/ui/kbd"
import { useUIStore } from "@/stores/ui"
import * as SettingsService from "~/bindings/mailyard/settingsservice"

type Step = "loading" | "name" | "mailbox"

/** Shown instead of the mail panes until the first account exists.
 * Step 1 asks for the user's name (it signs their emails), step 2 adds the
 * first mailbox. */
export function Onboarding() {
	const openAddMailbox = useUIStore((s) => s.setAddMailboxOpen)
	const [step, setStep] = React.useState<Step>("loading")
	const [name, setName] = React.useState("")
	const [savedName, setSavedName] = React.useState("")

	React.useEffect(() => {
		let cancelled = false
		SettingsService.GetUserName()
			.then((existing) => {
				if (cancelled) return
				setSavedName(existing)
				setStep(existing ? "mailbox" : "name")
			})
			.catch(() => {
				if (!cancelled) setStep("name")
			})
		return () => {
			cancelled = true
		}
	}, [])

	const saveName = async () => {
		const trimmed = name.trim()
		if (!trimmed) return
		try {
			await SettingsService.SetUserName(trimmed)
		} catch {
			// Saving can be retried from Settings; don't block onboarding.
		}
		setSavedName(trimmed)
		setStep("mailbox")
	}

	return (
		<div className="flex h-svh w-full flex-col items-center justify-center gap-6">
			<img
				src="/logo.svg"
				alt=""
				className="size-16 dark:opacity-80"
				height={1024}
				width={1024}
			/>

			{step === "name" && (
				<>
					<div className="flex flex-col items-center gap-1.5 text-center">
						<h1 className="font-heading text-xl font-semibold">
							Welcome to Mailyard
						</h1>
						<p className="max-w-sm text-sm text-muted-foreground">
							First things first — what's your name? It signs your emails.
						</p>
					</div>
					<form
						className="flex w-64 flex-col gap-2.5"
						onSubmit={(event) => {
							event.preventDefault()
							void saveName()
						}}
					>
						<Input
							value={name}
							onChange={(e) => setName(e.target.value)}
							placeholder="Maytham Ajam"
							autoFocus
							className="text-center"
						/>
						<Button type="submit" color="rose" disabled={!name.trim()}>
							Continue
							<HugeiconsIcon icon={ArrowRight02Icon} />
						</Button>
					</form>
				</>
			)}

			{step === "mailbox" && (
				<>
					<div className="flex flex-col items-center gap-1.5 text-center">
						<h1 className="font-heading text-xl font-semibold">
							{savedName
								? `Nice to meet you, ${savedName.split(" ")[0]}`
								: "Welcome to Mailyard"}
						</h1>
						<p className="max-w-sm text-sm text-muted-foreground">
							One inbox for every account. Add your first mailbox to start
							syncing mail.
						</p>
					</div>
					<Button color="rose" onClick={() => openAddMailbox(true)}>
						<HugeiconsIcon icon={MailPlus} />
						Add mailbox
					</Button>
					<p className="text-xs text-muted-foreground">
						<KbdShortcut shortcut="alt+shift+m" />
					</p>
				</>
			)}
		</div>
	)
}
