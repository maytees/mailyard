import * as React from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { useAccountsStore } from "@/stores/accounts"
import { loadAIConfig, useAIStore } from "@/stores/ai"
import { refreshMailList, refreshUnreadCounts } from "@/stores/mail"
import { useSettingsStore } from "@/stores/settings"
import { useThemeStore } from "@/stores/theme"
import { useUIStore } from "@/stores/ui"
import * as AccountService from "~/bindings/mailyard/accountservice"
import * as AIService from "~/bindings/mailyard/aiservice"
import * as SettingsService from "~/bindings/mailyard/settingsservice"
import * as TransferService from "~/bindings/mailyard/transferservice"
import type { Account } from "~/bindings/mailyard/internal/store/models"

function Section({
	title,
	children,
}: {
	title: string
	children: React.ReactNode
}) {
	return (
		<section className="flex flex-col gap-3">
			<h3 className="font-heading text-xs font-semibold tracking-wide text-muted-foreground uppercase">
				{title}
			</h3>
			{children}
		</section>
	)
}

function errorText(raw: unknown) {
	return raw instanceof Error ? raw.message : String(raw)
}

export function SettingsDialog() {
	const open = useUIStore((s) => s.settingsOpen)
	const setOpen = useUIStore((s) => s.setSettingsOpen)

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogContent className="sm:max-w-xl">
				<DialogHeader>
					<DialogTitle>Settings</DialogTitle>
				</DialogHeader>
				<div className="flex max-h-[65vh] flex-col gap-7 overflow-y-auto pr-1">
					<GeneralSection />
					<MailboxesSection />
					<AISection />
					<SyncSection />
					<AppearanceSection />
					<DataSection />
				</div>
			</DialogContent>
		</Dialog>
	)
}

// ---- general ---------------------------------------------------------------

function GeneralSection() {
	const [name, setName] = React.useState("")
	const [busy, setBusy] = React.useState(false)

	React.useEffect(() => {
		SettingsService.GetUserName()
			.then((existing) => setName(existing))
			.catch(() => {})
	}, [])

	const save = async () => {
		setBusy(true)
		try {
			await SettingsService.SetUserName(name)
			toast.success("Name saved")
		} catch (raw: unknown) {
			toast.error(errorText(raw))
		} finally {
			setBusy(false)
		}
	}

	return (
		<Section title="You">
			<label className="flex flex-col gap-1.5">
				<span className="text-xs text-muted-foreground">
					Your name — used to sign emails the AI writes
				</span>
				<div className="flex flex-row gap-2">
					<Input
						value={name}
						onChange={(e) => setName(e.target.value)}
						placeholder="Maytham Ajam"
					/>
					<Button size="sm" disabled={busy || !name.trim()} onClick={() => void save()}>
						Save
					</Button>
				</div>
			</label>
		</Section>
	)
}

// ---- mailboxes -------------------------------------------------------------

function MailboxesSection() {
	const accounts = useAccountsStore((s) => s.accounts)
	const openAddMailbox = useUIStore((s) => s.setAddMailboxOpen)

	return (
		<Section title="Mailboxes">
			{accounts.length === 0 && (
				<p className="text-sm text-muted-foreground">No mailboxes yet.</p>
			)}
			{accounts.map((account) => (
				<AccountRow key={account.id} account={account} />
			))}
			<Button
				variant="outline"
				size="xs"
				className="self-start rounded-full"
				onClick={() => openAddMailbox(true)}
			>
				Add mailbox
			</Button>
		</Section>
	)
}

function AccountRow({ account }: { account: Account }) {
	const [password, setPassword] = React.useState("")
	const [editing, setEditing] = React.useState(false)
	const [busy, setBusy] = React.useState(false)

	const savePassword = async () => {
		setBusy(true)
		try {
			await AccountService.UpdateAccount({
				id: account.id,
				displayName: "",
				color: "",
				icon: "",
				password,
			})
			toast.success(`Password updated for ${account.email}`)
			setEditing(false)
			setPassword("")
		} catch (raw: unknown) {
			toast.error(errorText(raw))
		} finally {
			setBusy(false)
		}
	}

	const remove = async () => {
		setBusy(true)
		try {
			await AccountService.RemoveAccount(account.id)
			toast(`Removed ${account.email}`)
		} catch (raw: unknown) {
			toast.error(errorText(raw))
		} finally {
			setBusy(false)
		}
	}

	return (
		<div className="flex flex-col gap-2 rounded-2xl border px-3 py-2.5">
			<div className="flex flex-row items-center gap-2.5">
				<span
					className="size-2.5 shrink-0 rounded-full"
					style={{ backgroundColor: `var(--color-mailbox-${account.color})` }}
				/>
				<div className="min-w-0 flex-1">
					<p className="truncate text-sm font-medium">{account.displayName}</p>
					<p className="truncate text-xs text-muted-foreground">
						{account.email}
					</p>
				</div>
				<Button
					variant="ghost"
					size="xs"
					disabled={busy}
					onClick={() => setEditing((current) => !current)}
				>
					Password
				</Button>
				<Button
					variant="ghost"
					size="xs"
					className="text-destructive"
					disabled={busy}
					onClick={() => void remove()}
				>
					Remove
				</Button>
			</div>
			{editing && (
				<form
					className="flex flex-row gap-2"
					onSubmit={(event) => {
						event.preventDefault()
						void savePassword()
					}}
				>
					<Input
						type="password"
						value={password}
						onChange={(e) => setPassword(e.target.value)}
						placeholder="New app password"
						autoFocus
					/>
					<Button type="submit" size="sm" disabled={busy || !password}>
						{busy ? "Verifying…" : "Save"}
					</Button>
				</form>
			)}
		</div>
	)
}

// ---- ai --------------------------------------------------------------------

const PROVIDERS = ["anthropic", "openai", "google", "ollama"] as const

// Swapping provider auto-fills a sensible model unless the user typed a
// custom one.
const PROVIDER_DEFAULT_MODEL: Record<string, string> = {
	anthropic: "claude-sonnet-5",
	openai: "gpt-4o",
	google: "gemini-2.5-flash",
	ollama: "qwen3:8b",
}

function AISection() {
	const config = useAIStore((s) => s.config)
	const [provider, setProvider] = React.useState("")
	const [model, setModel] = React.useState("")
	const [apiKey, setApiKey] = React.useState("")
	const [listSummaries, setListSummaries] = React.useState(false)
	const [busy, setBusy] = React.useState(false)
	const [loaded, setLoaded] = React.useState(false)

	// Seed the form from live config once per dialog lifetime.
	if (config && !loaded) {
		setProvider(config.provider)
		setModel(config.model)
		setListSummaries(config.listSummaries)
		setLoaded(true)
	}

	const save = async () => {
		setBusy(true)
		try {
			await AIService.SetConfig(provider, model, listSummaries, apiKey)
			await loadAIConfig()
			setApiKey("")
			toast.success("AI settings saved")
		} catch (raw: unknown) {
			toast.error(errorText(raw))
		} finally {
			setBusy(false)
		}
	}

	return (
		<Section title="AI">
			<div className="grid grid-cols-2 gap-2.5">
				<label className="flex flex-col gap-1.5">
					<span className="text-xs text-muted-foreground">Provider</span>
					<select
						value={provider}
						onChange={(e) => {
							const next = e.target.value
							setProvider(next)
							const defaults = Object.values(PROVIDER_DEFAULT_MODEL)
							if (!model || defaults.includes(model)) {
								setModel(PROVIDER_DEFAULT_MODEL[next] ?? model)
							}
						}}
						className="h-9 cursor-pointer rounded-3xl border border-transparent bg-input/50 px-3 text-sm outline-none"
					>
						{PROVIDERS.map((name) => (
							<option key={name} value={name}>
								{name === "ollama" ? "ollama (local)" : name}
							</option>
						))}
					</select>
				</label>
				<label className="flex flex-col gap-1.5">
					<span className="text-xs text-muted-foreground">Model</span>
					<Input value={model} onChange={(e) => setModel(e.target.value)} />
				</label>
			</div>
			{provider === "ollama" ? (
				<p className="text-xs text-muted-foreground">
					Runs locally through Ollama (localhost:11434) — no API key, and
					nothing leaves your machine. Pull models with{" "}
					<code className="rounded bg-muted px-1">ollama pull qwen3:8b</code>.
				</p>
			) : (
				<label className="flex flex-col gap-1.5">
					<span className="text-xs text-muted-foreground">API key</span>
					<Input
						type="password"
						value={apiKey}
						onChange={(e) => setApiKey(e.target.value)}
						placeholder={config?.hasKey ? "•••••••• (saved in keychain)" : "sk-…"}
					/>
				</label>
			)}
			<label className="flex cursor-pointer flex-row items-center gap-2 text-sm">
				<input
					type="checkbox"
					checked={listSummaries}
					onChange={(e) => setListSummaries(e.target.checked)}
					className="accent-primary"
				/>
				AI digests in the mail list (replaces snippets, uses tokens)
			</label>
			<Button
				size="sm"
				className="self-start"
				disabled={busy}
				onClick={() => void save()}
			>
				{busy ? "Saving…" : "Save AI settings"}
			</Button>
		</Section>
	)
}

// ---- sync ------------------------------------------------------------------

function SyncSection() {
	const [pollMinutes, setPollMinutes] = React.useState("5")
	const [backfillDays, setBackfillDays] = React.useState("90")
	const [busy, setBusy] = React.useState(false)

	React.useEffect(() => {
		SettingsService.GetAppSettings()
			.then((settings) => {
				setPollMinutes(String(settings.pollMinutes))
				setBackfillDays(String(settings.backfillDays))
			})
			.catch(() => {})
	}, [])

	const save = async () => {
		setBusy(true)
		try {
			await SettingsService.SetAppSettings({
				pollMinutes: Number(pollMinutes) || 0,
				backfillDays: Number(backfillDays) || 0,
			})
			toast.success("Sync settings saved")
		} catch (raw: unknown) {
			toast.error(errorText(raw))
		} finally {
			setBusy(false)
		}
	}

	return (
		<Section title="Sync">
			<div className="grid grid-cols-2 gap-2.5">
				<label className="flex flex-col gap-1.5">
					<span className="text-xs text-muted-foreground">
						Poll every (minutes)
					</span>
					<Input
						inputMode="numeric"
						value={pollMinutes}
						onChange={(e) => setPollMinutes(e.target.value)}
					/>
				</label>
				<label className="flex flex-col gap-1.5">
					<span className="text-xs text-muted-foreground">
						Backfill window (days)
					</span>
					<Input
						inputMode="numeric"
						value={backfillDays}
						onChange={(e) => setBackfillDays(e.target.value)}
					/>
				</label>
			</div>
			<Button
				size="sm"
				className="self-start"
				disabled={busy}
				onClick={() => void save()}
			>
				{busy ? "Saving…" : "Save sync settings"}
			</Button>
		</Section>
	)
}

// ---- appearance ------------------------------------------------------------

function AppearanceSection() {
	const theme = useThemeStore((s) => s.theme)
	const setTheme = useThemeStore((s) => s.setTheme)
	const compact = useSettingsStore((s) => s.compact)
	const toggleCompact = useSettingsStore((s) => s.toggleCompact)

	return (
		<Section title="Appearance">
			<div className="flex flex-row items-center gap-2">
				{(["light", "dark", "system"] as const).map((option) => (
					<Button
						key={option}
						variant={theme === option ? "default" : "outline"}
						size="xs"
						className="rounded-full capitalize"
						onClick={() => setTheme(option)}
					>
						{option}
					</Button>
				))}
				<span className="mx-2 h-4 w-px bg-border" />
				<Button
					variant="outline"
					size="xs"
					className="rounded-full"
					onClick={toggleCompact}
				>
					{compact ? "Cozy rows" : "Compact rows"}
				</Button>
			</div>
		</Section>
	)
}

// ---- data ------------------------------------------------------------------

function DataSection() {
	const [busy, setBusy] = React.useState(false)

	const doExport = async () => {
		setBusy(true)
		try {
			const path = await TransferService.Export()
			if (path) toast.success(`Exported to ${path}`)
		} catch (raw: unknown) {
			toast.error(errorText(raw))
		} finally {
			setBusy(false)
		}
	}

	const doImport = async () => {
		setBusy(true)
		try {
			const path = await TransferService.Import()
			if (path) {
				await Promise.all([refreshMailList(), refreshUnreadCounts()])
				toast.success("Import complete — re-enter passwords for synced mailboxes if prompted")
			}
		} catch (raw: unknown) {
			toast.error(errorText(raw))
		} finally {
			setBusy(false)
		}
	}

	return (
		<Section title="Data">
			<p className="text-sm text-muted-foreground">
				Move your mail and settings to another machine. Passwords stay in the
				keychain and are never exported.
			</p>
			<div className="flex flex-row gap-2">
				<Button variant="outline" size="sm" disabled={busy} onClick={() => void doExport()}>
					Export data…
				</Button>
				<Button variant="outline" size="sm" disabled={busy} onClick={() => void doImport()}>
					Import data…
				</Button>
			</div>
		</Section>
	)
}
