import * as React from "react"

import { Button } from "@/components/ui/button"
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { providers, type MailProvider } from "@/data/providers"
import { mailboxColors, type MailboxColor } from "@/lib/mailbox-colors"
import { cn } from "@/lib/utils"
import { useUIStore } from "@/stores/ui"
import * as AccountService from "~/bindings/mailyard/accountservice"

function Field({
	label,
	children,
}: {
	label: string
	children: React.ReactNode
}) {
	return (
		<label className="flex flex-col gap-1.5">
			<span className="text-xs font-medium text-muted-foreground">{label}</span>
			{children}
		</label>
	)
}

export function AddMailboxDialog() {
	const open = useUIStore((s) => s.addMailboxOpen)
	const setOpen = useUIStore((s) => s.setAddMailboxOpen)

	const [provider, setProvider] = React.useState<MailProvider>(providers[0])
	const [displayName, setDisplayName] = React.useState("")
	const [email, setEmail] = React.useState("")
	const [password, setPassword] = React.useState("")
	const [color, setColor] = React.useState<MailboxColor>("violet")
	const [imapHost, setImapHost] = React.useState(providers[0].imapHost)
	const [imapPort, setImapPort] = React.useState(String(providers[0].imapPort))
	const [smtpHost, setSmtpHost] = React.useState(providers[0].smtpHost)
	const [smtpPort, setSmtpPort] = React.useState(String(providers[0].smtpPort))
	const [busy, setBusy] = React.useState(false)
	const [error, setError] = React.useState("")

	const pickProvider = (next: MailProvider) => {
		setProvider(next)
		setImapHost(next.imapHost)
		setImapPort(String(next.imapPort))
		setSmtpHost(next.smtpHost)
		setSmtpPort(String(next.smtpPort))
	}

	const handleOpenChange = (next: boolean) => {
		if (busy) return // never lose a verification in flight
		if (!next) {
			setError("")
			setPassword("")
		}
		setOpen(next)
	}

	const submit = async () => {
		setBusy(true)
		setError("")
		try {
			await AccountService.AddAccount({
				displayName,
				email,
				color,
				imapHost,
				imapPort: Number(imapPort) || 0,
				smtpHost,
				smtpPort: Number(smtpPort) || 0,
				username: "",
				password,
			})
			// accounts:changed refreshes the store; just close and reset.
			setOpen(false)
			setDisplayName("")
			setEmail("")
			setPassword("")
		} catch (raw: unknown) {
			setError(raw instanceof Error ? raw.message : String(raw))
		} finally {
			setBusy(false)
		}
	}

	return (
		<Dialog open={open} onOpenChange={handleOpenChange}>
			<DialogContent className="sm:max-w-lg">
				<DialogHeader>
					<DialogTitle>Add mailbox</DialogTitle>
					<DialogDescription>
						Sign in over IMAP with an app password.{" "}
						{provider.appPasswordUrl && (
							<a href={provider.appPasswordUrl} target="_blank" rel="noreferrer">
								Create one for {provider.name}
							</a>
						)}
					</DialogDescription>
				</DialogHeader>

				<form
					className="flex flex-col gap-4"
					onSubmit={(event) => {
						event.preventDefault()
						void submit()
					}}
				>
					<div className="flex flex-wrap gap-1.5">
						{providers.map((p) => (
							<Button
								key={p.id}
								type="button"
								size="xs"
								variant={p.id === provider.id ? "default" : "outline"}
								className="rounded-full"
								onClick={() => pickProvider(p)}
							>
								{p.name}
							</Button>
						))}
					</div>

					<div className="grid grid-cols-2 gap-3">
						<Field label="Email">
							<Input
								type="email"
								value={email}
								onChange={(e) => setEmail(e.target.value)}
								placeholder="you@example.com"
								autoFocus
							/>
						</Field>
						<Field label="App password">
							<Input
								type="password"
								value={password}
								onChange={(e) => setPassword(e.target.value)}
								placeholder="••••••••••••"
							/>
						</Field>
					</div>

					<Field label="Name (optional)">
						<Input
							value={displayName}
							onChange={(e) => setDisplayName(e.target.value)}
							placeholder="Personal"
						/>
					</Field>

					{provider.id === "custom" && (
						<div className="grid grid-cols-[1fr_5rem_1fr_5rem] gap-2">
							<Field label="IMAP server">
								<Input
									value={imapHost}
									onChange={(e) => setImapHost(e.target.value)}
									placeholder="imap.example.com"
								/>
							</Field>
							<Field label="Port">
								<Input
									value={imapPort}
									onChange={(e) => setImapPort(e.target.value)}
									inputMode="numeric"
								/>
							</Field>
							<Field label="SMTP server">
								<Input
									value={smtpHost}
									onChange={(e) => setSmtpHost(e.target.value)}
									placeholder="smtp.example.com"
								/>
							</Field>
							<Field label="Port">
								<Input
									value={smtpPort}
									onChange={(e) => setSmtpPort(e.target.value)}
									inputMode="numeric"
								/>
							</Field>
						</div>
					)}

					<div className="flex flex-col gap-1.5">
						<span className="text-xs font-medium text-muted-foreground">
							Accent
						</span>
						<div className="flex flex-wrap gap-1.5">
							{mailboxColors.map((name) => (
								<button
									key={name}
									type="button"
									aria-label={`${name} accent`}
									className={cn(
										"size-5 rounded-full transition-transform hover:scale-110",
										name === color &&
											"ring-2 ring-ring ring-offset-2 ring-offset-popover"
									)}
									style={{ backgroundColor: `var(--color-mailbox-${name})` }}
									onClick={() => setColor(name)}
								/>
							))}
						</div>
					</div>

					{error && <p className="text-sm text-destructive">{error}</p>}

					<DialogFooter>
						<Button
							type="button"
							variant="ghost"
							onClick={() => handleOpenChange(false)}
							disabled={busy}
						>
							Cancel
						</Button>
						<Button type="submit" disabled={busy || !email || !password}>
							{busy ? "Verifying…" : "Add mailbox"}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	)
}
