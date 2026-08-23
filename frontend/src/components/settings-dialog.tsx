import { Tag01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import * as React from "react"
import { toast } from "sonner"

import { IconPicker } from "@/components/icon-picker"
import { Button } from "@/components/ui/button"
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { loadIconLibrary, useIcon } from "@/lib/icon-library"
import { accentChoices, labelAccent } from "@/lib/mailbox-colors"
import { cn } from "@/lib/utils"
import { useAccountsStore } from "@/stores/accounts"
import { loadAIConfig, useAIStore } from "@/stores/ai"
import { refreshLabels, useLabelsStore } from "@/stores/labels"
import { refreshMailList, refreshUnreadCounts } from "@/stores/mail"
import { useSettingsStore } from "@/stores/settings"
import { useThemeStore } from "@/stores/theme"
import { useUIStore } from "@/stores/ui"
import * as AccountService from "~/bindings/mailyard/accountservice"
import * as AIService from "~/bindings/mailyard/aiservice"
import * as LabelService from "~/bindings/mailyard/labelservice"
import * as SettingsService from "~/bindings/mailyard/settingsservice"
import * as TransferService from "~/bindings/mailyard/transferservice"
import type { Account, Label } from "~/bindings/mailyard/internal/store/models"

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
				{/* p-1 keeps borders/focus rings from clipping on the overflow
				    boundary. */}
				<div className="flex max-h-[65vh] flex-col gap-7 overflow-y-auto p-1">
					<GeneralSection />
					<MailboxesSection />
					<LabelsSection />
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

// ---- provider API keys -----------------------------------------------------

const KEYED_PROVIDERS = ["anthropic", "openai", "google"] as const

/** Which cloud providers have a key saved — shared by the tab bar and the
 * rule form's missing-key warning. */
function useProviderKeys() {
	const [hasKey, setHasKey] = React.useState<Record<string, boolean>>({})
	const load = React.useCallback(() => {
		AIService.ListProviderKeys()
			.then((keys) => {
				const map: Record<string, boolean> = {}
				for (const key of keys ?? []) map[key.provider] = key.hasKey
				setHasKey(map)
			})
			.catch(() => {})
	}, [])
	React.useEffect(load, [load])
	return { hasKey, reload: load }
}

/** One keychain slot per cloud provider, behind a small tab bar. */
function ProviderKeysBlock({
	hasKey,
	reload,
}: {
	hasKey: Record<string, boolean>
	reload: () => void
}) {
	const [tab, setTab] = React.useState<string>("anthropic")
	const [key, setKey] = React.useState("")
	const [busy, setBusy] = React.useState(false)

	const save = async () => {
		setBusy(true)
		try {
			await AIService.SetProviderKey(tab, key)
			setKey("")
			reload()
			await loadAIConfig() // hasKey on the main config may have changed
			toast.success(key ? `${tab} key saved to the keychain` : `${tab} key removed`)
		} catch (raw: unknown) {
			toast.error(errorText(raw))
		} finally {
			setBusy(false)
		}
	}

	return (
		<div className="flex flex-col gap-2">
			<span className="text-xs text-muted-foreground">
				API keys — one per provider, stored in the macOS keychain
			</span>
			<div className="flex flex-row gap-1">
				{KEYED_PROVIDERS.map((name) => (
					<button
						key={name}
						type="button"
						onClick={() => {
							setTab(name)
							setKey("")
						}}
						className={cn(
							"cursor-pointer rounded-full border px-3 py-1 text-xs font-medium transition-colors",
							tab === name
								? "border-foreground/30 bg-muted text-foreground"
								: "border-border text-muted-foreground hover:bg-muted hover:text-foreground"
						)}
					>
						{name}
						{hasKey[name] && <span className="ml-1 text-primary">●</span>}
					</button>
				))}
			</div>
			<div className="flex flex-row gap-2">
				<Input
					type="password"
					value={key}
					onChange={(e) => setKey(e.target.value)}
					placeholder={
						hasKey[tab] ? "•••••••• (saved — enter to replace)" : `${tab} API key`
					}
				/>
				<Button
					size="sm"
					disabled={busy || (!key.trim() && !hasKey[tab])}
					onClick={() => void save()}
				>
					{key.trim() ? "Save" : hasKey[tab] ? "Remove" : "Save"}
				</Button>
			</div>
		</div>
	)
}

// ---- model rules -----------------------------------------------------------

type ModelRule = {
	feature: string
	title: string
	provider: string
	model: string
}

/**
 * One model tied to one action. A rule routes that feature to a specific
 * model (e.g. digests on local qwen); everything without a rule uses the
 * main model above.
 */
function ModelRulesBlock({ hasKey }: { hasKey: Record<string, boolean> }) {
	const [rules, setRules] = React.useState<ModelRule[]>([])
	const [actions, setActions] = React.useState<PromptInfo[]>([])
	const [feature, setFeature] = React.useState("")
	const [provider, setProvider] = React.useState("ollama")
	const [model, setModel] = React.useState(PROVIDER_DEFAULT_MODEL.ollama)
	const [busy, setBusy] = React.useState(false)

	// A cloud rule without a stored key would only fail invisibly later.
	const missingKey = provider !== "ollama" && !hasKey[provider]

	const load = React.useCallback(() => {
		AIService.ListModelRules().then((r) => setRules(r ?? [])).catch(() => {})
		AIService.ListPrompts().then((p) => setActions(p ?? [])).catch(() => {})
	}, [])
	React.useEffect(load, [load])

	// Actions without a rule yet — one rule per action.
	const available = actions.filter(
		(action) => !rules.some((rule) => rule.feature === action.id)
	)
	const selected = available.some((a) => a.id === feature)
		? feature
		: (available[0]?.id ?? "")

	const add = async () => {
		if (!selected) return
		setBusy(true)
		try {
			await AIService.SetModelRule(selected, provider, model)
			load()
		} catch (raw: unknown) {
			toast.error(errorText(raw))
		} finally {
			setBusy(false)
		}
	}

	const remove = async (rule: ModelRule) => {
		try {
			await AIService.SetModelRule(rule.feature, "", "")
			load()
		} catch (raw: unknown) {
			toast.error(errorText(raw))
		}
	}

	return (
		<div className="flex flex-col gap-2">
			<span className="text-xs text-muted-foreground">
				Model rules — route an action to a different model (everything else
				uses the main model above)
			</span>
			{rules.length > 0 && (
				<ul className="flex flex-col gap-1">
					{rules.map((rule) => (
						<li
							key={rule.feature}
							className="flex flex-row items-center gap-2 rounded-xl border px-3 py-1.5 text-sm"
						>
							<span className="font-medium">{rule.title}</span>
							<span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
								{rule.provider} · {rule.model}
							</span>
							<Button variant="ghost" size="xs" onClick={() => void remove(rule)}>
								Remove
							</Button>
						</li>
					))}
				</ul>
			)}
			{available.length > 0 && (
				<div className="flex flex-row items-center gap-2">
					<select
						value={selected}
						onChange={(e) => setFeature(e.target.value)}
						className="h-8 min-w-0 flex-1 cursor-pointer rounded-3xl border border-transparent bg-input/50 px-2.5 text-sm outline-none"
					>
						{available.map((action) => (
							<option key={action.id} value={action.id}>
								{action.title}
							</option>
						))}
					</select>
					<select
						value={provider}
						onChange={(e) => {
							const next = e.target.value
							setProvider(next)
							setModel(PROVIDER_DEFAULT_MODEL[next] ?? "")
						}}
						className="h-8 cursor-pointer rounded-3xl border border-transparent bg-input/50 px-2.5 text-sm outline-none"
					>
						{PROVIDERS.map((name) => (
							<option key={name} value={name}>
								{name === "ollama" ? "ollama (local)" : name}
							</option>
						))}
					</select>
					<Input
						value={model}
						onChange={(e) => setModel(e.target.value)}
						className="h-8 w-32"
						placeholder="model"
					/>
					<Button
						size="sm"
						disabled={busy || !selected || !model.trim() || missingKey}
						onClick={() => void add()}
					>
						Add rule
					</Button>
				</div>
			)}
			{missingKey && (
				<p className="text-xs text-destructive">
					No {provider} API key saved — add one in the API keys tabs above
					first.
				</p>
			)}
		</div>
	)
}

// ---- labels ----------------------------------------------------------------

function LabelGlyphInline({ icon, className }: { icon: string; className?: string }) {
	const resolved = useIcon(icon)
	return <HugeiconsIcon icon={resolved ?? Tag01Icon} className={className} />
}

function LabelsSection() {
	const labels = useLabelsStore((s) => s.labels)
	const [autoCreate, setAutoCreate] = React.useState(false)
	const [editing, setEditing] = React.useState<Label | null>(null)
	const [creating, setCreating] = React.useState(false)

	React.useEffect(() => {
		void loadIconLibrary()
		LabelService.AutoCreateEnabled().then(setAutoCreate).catch(() => {})
	}, [])

	const toggleAutoCreate = async (enabled: boolean) => {
		setAutoCreate(enabled)
		try {
			await LabelService.SetAutoCreate(enabled)
		} catch (raw: unknown) {
			setAutoCreate(!enabled)
			toast.error(errorText(raw))
		}
	}

	const remove = async (label: Label) => {
		try {
			await LabelService.DeleteLabel(label.id)
			await refreshLabels()
			await refreshMailList()
			toast(`“${label.name}” deleted — its emails moved to Other`)
		} catch (raw: unknown) {
			toast.error(errorText(raw))
		}
	}

	return (
		<Section title="Labels">
			<p className="text-xs text-muted-foreground">
				The AI sorts inbox mail into these. Each label’s description is the
				classifier’s definition — edit it to retune what lands there.
			</p>
			<ul className="flex flex-col gap-1">
				{labels.map((label) => {
					const accent = labelAccent(label.color)
					return (
						<li
							key={label.id}
							className="flex flex-row items-center gap-2 rounded-xl border px-3 py-2"
						>
							<span
								className={cn(
									"inline-flex size-6 shrink-0 items-center justify-center rounded-full",
									accent
										? cn(accent, "bg-(--accent)/15 text-(--accent-fg)")
										: "bg-muted text-muted-foreground"
								)}
							>
								<LabelGlyphInline icon={label.icon} className="size-3.5" />
							</span>
							<div className="min-w-0 flex-1">
								<span className="text-sm font-medium">
									{label.name}
									{label.createdBy === "ai" && (
										<span className="ml-1.5 text-xs font-normal text-muted-foreground">
											AI-created
										</span>
									)}
								</span>
								<p className="truncate text-xs text-muted-foreground">
									{label.definition}
								</p>
							</div>
							<Button variant="ghost" size="xs" onClick={() => setEditing(label)}>
								Edit
							</Button>
							{label.id !== OTHER_LABEL_ID && (
								<Button
									variant="ghost"
									size="xs"
									className="text-destructive"
									onClick={() => void remove(label)}
								>
									Delete
								</Button>
							)}
						</li>
					)
				})}
			</ul>
			<div className="flex flex-row items-center justify-between">
				<Button variant="outline" size="sm" onClick={() => setCreating(true)}>
					New label
				</Button>
			</div>
			<label className="flex cursor-pointer flex-row items-center gap-2 text-sm">
				<input
					type="checkbox"
					checked={autoCreate}
					onChange={(e) => void toggleAutoCreate(e.target.checked)}
					className="accent-primary"
				/>
				Let the AI create new labels when none fit (otherwise: best fit or
				Other)
			</label>
			<LabelEditDialog
				key={editing ? editing.id : creating ? "new" : "closed"}
				label={editing}
				open={editing !== null || creating}
				onClose={() => {
					setEditing(null)
					setCreating(false)
				}}
			/>
		</Section>
	)
}

/** The Other label's id — seeded by the migration, protected in the store. */
const OTHER_LABEL_ID = 5

function LabelEditDialog({
	label,
	open,
	onClose,
}: {
	label: Label | null
	open: boolean
	onClose: () => void
}) {
	// State initializes from props — the parent remounts this dialog via key
	// whenever a different label (or the create form) opens.
	const [name, setName] = React.useState(label?.name ?? "")
	const [definition, setDefinition] = React.useState(label?.definition ?? "")
	const [color, setColor] = React.useState<string>(label?.color ?? "blue")
	const [icon, setIcon] = React.useState(label?.icon ?? "Tag01Icon")
	const [busy, setBusy] = React.useState(false)

	const save = async () => {
		setBusy(true)
		try {
			if (label) {
				await LabelService.UpdateLabel({ ...label, name, definition, color, icon })
			} else {
				await LabelService.CreateLabel({
					id: 0, name, definition, color, icon,
					sortOrder: 0, builtin: false, createdBy: "user",
				})
			}
			await refreshLabels()
			await refreshMailList()
			onClose()
		} catch (raw: unknown) {
			toast.error(errorText(raw))
		} finally {
			setBusy(false)
		}
	}

	return (
		<Dialog open={open} onOpenChange={(o) => !o && onClose()}>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>{label ? `Edit “${label.name}”` : "New label"}</DialogTitle>
				</DialogHeader>
				<div className="flex flex-col gap-4">
					<div className="flex flex-row items-end gap-2">
						<label className="flex flex-1 flex-col gap-1.5">
							<span className="text-xs text-muted-foreground">Name</span>
							<Input value={name} onChange={(e) => setName(e.target.value)} />
						</label>
						<IconPicker value={icon} onChange={setIcon} />
					</div>
					<label className="flex flex-col gap-1.5">
						<span className="text-xs text-muted-foreground">
							Definition — one sentence telling the AI what belongs here
						</span>
						<Textarea
							value={definition}
							onChange={(e) => setDefinition(e.target.value)}
							rows={2}
						/>
					</label>
					<div className="flex flex-row flex-wrap gap-2">
						{accentChoices.map((choice) => (
							<button
								key={choice}
								type="button"
								aria-label={`${choice} accent`}
								className={cn(
									"size-7 rounded-full transition-transform hover:scale-110",
									choice === color &&
										"ring-2 ring-ring ring-offset-2 ring-offset-popover"
								)}
								style={{ backgroundColor: `var(--color-mailbox-${choice})` }}
								onClick={() => setColor(choice)}
							/>
						))}
					</div>
					<div className="flex flex-row justify-end gap-2">
						<Button variant="outline" size="sm" onClick={onClose}>
							Cancel
						</Button>
						<Button size="sm" disabled={busy || !name.trim()} onClick={() => void save()}>
							{label ? "Save" : "Create"}
						</Button>
					</div>
				</div>
			</DialogContent>
		</Dialog>
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
	const providerKeys = useProviderKeys()
	const [provider, setProvider] = React.useState("")
	const [model, setModel] = React.useState("")
	const [listSummaries, setListSummaries] = React.useState(false)
	const [busy, setBusy] = React.useState(false)
	const [loaded, setLoaded] = React.useState(false)
	const [promptsOpen, setPromptsOpen] = React.useState(false)

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
			// Keys live in the per-provider tabs below; none rides along here.
			await AIService.SetConfig(provider, model, listSummaries, "")
			await loadAIConfig()
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
			{provider === "ollama" && (
				<p className="text-xs text-muted-foreground">
					Runs locally through Ollama (localhost:11434) — no API key, and
					nothing leaves your machine. Pull models with{" "}
					<code className="rounded bg-muted px-1">ollama pull qwen3:8b</code>.
				</p>
			)}
			<ProviderKeysBlock hasKey={providerKeys.hasKey} reload={providerKeys.reload} />
			<label className="flex cursor-pointer flex-row items-center gap-2 text-sm">
				<input
					type="checkbox"
					checked={listSummaries}
					onChange={(e) => setListSummaries(e.target.checked)}
					className="accent-primary"
				/>
				AI digests in the mail list (replaces snippets, uses tokens)
			</label>
			<ModelRulesBlock hasKey={providerKeys.hasKey} />
			<div className="flex flex-row gap-2">
				<Button size="sm" disabled={busy} onClick={() => void save()}>
					{busy ? "Saving…" : "Save AI settings"}
				</Button>
				<Button
					variant="outline"
					size="sm"
					onClick={() => setPromptsOpen(true)}
				>
					Customize instructions…
				</Button>
			</div>
			<PromptEditorDialog open={promptsOpen} onOpenChange={setPromptsOpen} />
		</Section>
	)
}

// ---- ai instruction editor -------------------------------------------------

type PromptInfo = {
	id: string
	title: string
	description: string
	placeholders: string[] | null
	default: string
	custom: string
}

/** Full control over every AI system prompt; defaults live in
 * internal/ai/prompts.go. */
function PromptEditorDialog({
	open,
	onOpenChange,
}: {
	open: boolean
	onOpenChange: (open: boolean) => void
}) {
	const [prompts, setPrompts] = React.useState<PromptInfo[]>([])
	const [selectedId, setSelectedId] = React.useState("")
	const [text, setText] = React.useState("")
	const [busy, setBusy] = React.useState(false)

	const selected = prompts.find((prompt) => prompt.id === selectedId)

	React.useEffect(() => {
		if (!open) return
		let cancelled = false
		AIService.ListPrompts()
			.then((raw) => {
				if (cancelled) return
				const list = (raw ?? []) as PromptInfo[]
				setPrompts(list)
				const first = list[0]
				if (first) {
					setSelectedId(first.id)
					setText(first.custom || first.default)
				}
			})
			.catch((raw: unknown) => toast.error(errorText(raw)))
		return () => {
			cancelled = true
		}
	}, [open])

	const pick = (id: string) => {
		setSelectedId(id)
		const prompt = prompts.find((p) => p.id === id)
		if (prompt) setText(prompt.custom || prompt.default)
	}

	const save = async (value: string) => {
		if (!selected) return
		setBusy(true)
		try {
			await AIService.SetPrompt(selected.id, value)
			const refreshed = ((await AIService.ListPrompts()) ?? []) as PromptInfo[]
			setPrompts(refreshed)
			toast.success(
				value ? `“${selected.title}” instructions saved` : `“${selected.title}” reset to default`
			)
			if (!value) setText(selected.default)
		} catch (raw: unknown) {
			toast.error(errorText(raw))
		} finally {
			setBusy(false)
		}
	}

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-2xl">
				<DialogHeader>
					<DialogTitle>AI instructions</DialogTitle>
					<DialogDescription>
						Every prompt Mailyard sends is editable. Placeholders in braces
						are filled at request time.
					</DialogDescription>
				</DialogHeader>

				<div className="flex flex-col gap-3">
					<select
						value={selectedId}
						onChange={(e) => pick(e.target.value)}
						className="h-9 cursor-pointer rounded-3xl border border-transparent bg-input/50 px-3 text-sm outline-none"
					>
						{prompts.map((prompt) => (
							<option key={prompt.id} value={prompt.id}>
								{prompt.title}
								{prompt.custom ? " • customized" : ""}
							</option>
						))}
					</select>

					{selected && (
						<>
							<p className="text-xs text-muted-foreground">
								{selected.description}
								{selected.placeholders && selected.placeholders.length > 0 && (
									<>
										{" — placeholders: "}
										{selected.placeholders.map((name) => (
											<code
												key={name}
												className="mx-0.5 rounded bg-muted px-1"
											>
												{`{${name}}`}
											</code>
										))}
									</>
								)}
							</p>
							<Textarea
								value={text}
								onChange={(e) => setText(e.target.value)}
								className="h-64 resize-none font-mono text-xs leading-relaxed"
							/>
							<div className="flex flex-row justify-end gap-2">
								<Button
									variant="ghost"
									size="sm"
									disabled={busy || !selected.custom}
									onClick={() => void save("")}
								>
									Reset to default
								</Button>
								<Button
									size="sm"
									disabled={busy || !text.trim()}
									onClick={() => void save(text)}
								>
									{busy ? "Saving…" : "Save instructions"}
								</Button>
							</div>
						</>
					)}
				</div>
			</DialogContent>
		</Dialog>
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

const COMPOSE_STYLES = [
	{ key: "sheet", label: "Side panel" },
	{ key: "modal", label: "Centered" },
	{ key: "docked", label: "Docked" },
] as const

function AppearanceSection() {
	const theme = useThemeStore((s) => s.theme)
	const setTheme = useThemeStore((s) => s.setTheme)
	const compact = useSettingsStore((s) => s.compact)
	const toggleCompact = useSettingsStore((s) => s.toggleCompact)
	const composeStyle = useSettingsStore((s) => s.composeStyle)
	const setComposeStyle = useSettingsStore((s) => s.setComposeStyle)

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
			<div className="flex flex-row items-center gap-2">
				<span className="text-xs text-muted-foreground">Compose as</span>
				{COMPOSE_STYLES.map((option) => (
					<Button
						key={option.key}
						variant={composeStyle === option.key ? "default" : "outline"}
						size="xs"
						className="rounded-full"
						onClick={() => setComposeStyle(option.key)}
					>
						{option.label}
					</Button>
				))}
			</div>
		</Section>
	)
}

// ---- data ------------------------------------------------------------------

// Reset categories — coarse subjects, not individual items.
const RESET_CATEGORIES = [
	{
		key: "mailboxes",
		label: "Mailboxes",
		description: "All accounts, their passwords and every downloaded email",
	},
	{
		key: "mail",
		label: "Downloaded mail",
		description: "The local message cache — accounts stay and re-sync fresh",
	},
	{
		key: "drafts",
		label: "Drafts",
		description: "Every draft, including the copies on your mail servers",
	},
	{
		key: "aiCache",
		label: "AI cache",
		description: "Cached summaries, list digests and triage labels",
	},
	{
		key: "preferences",
		label: "Preferences",
		description: "Your name, sync & AI settings, API key, appearance",
	},
] as const

type ResetKey = (typeof RESET_CATEGORIES)[number]["key"]

function ResetDataDialog({
	open,
	onOpenChange,
}: {
	open: boolean
	onOpenChange: (open: boolean) => void
}) {
	const [selected, setSelected] = React.useState<Set<ResetKey>>(new Set())
	const [busy, setBusy] = React.useState(false)

	const toggle = (key: ResetKey) =>
		setSelected((current) => {
			const next = new Set(current)
			if (next.has(key)) next.delete(key)
			else next.add(key)
			return next
		})

	const reset = async () => {
		setBusy(true)
		try {
			await TransferService.ResetData({
				mailboxes: selected.has("mailboxes"),
				mail: selected.has("mail"),
				drafts: selected.has("drafts"),
				aiCache: selected.has("aiCache"),
				preferences: selected.has("preferences"),
			})
			if (selected.has("preferences")) {
				// Frontend-side preferences live in localStorage.
				localStorage.removeItem("settings")
				localStorage.removeItem("theme")
				localStorage.removeItem("mailyard-draft-backup")
			}
			// A reload is the cleanest way to reflect wiped state everywhere.
			window.location.reload()
		} catch (raw: unknown) {
			toast.error(errorText(raw))
			setBusy(false)
		}
	}

	return (
		<Dialog
			open={open}
			onOpenChange={(next) => {
				if (!busy) {
					setSelected(new Set())
					onOpenChange(next)
				}
			}}
		>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>Reset data</DialogTitle>
					<DialogDescription>
						Pick what to delete. This cannot be undone.
					</DialogDescription>
				</DialogHeader>
				<div className="flex flex-col gap-2.5">
					{RESET_CATEGORIES.map((category) => (
						<label
							key={category.key}
							className="flex cursor-pointer flex-row items-start gap-2.5 rounded-2xl border px-3 py-2.5 hover:bg-muted/40"
						>
							<input
								type="checkbox"
								checked={selected.has(category.key)}
								onChange={() => toggle(category.key)}
								className="mt-0.5 accent-primary"
							/>
							<span className="flex flex-col">
								<span className="text-sm font-medium">{category.label}</span>
								<span className="text-xs text-muted-foreground">
									{category.description}
								</span>
							</span>
						</label>
					))}
				</div>
				<div className="flex flex-row justify-end gap-2">
					<Button
						variant="ghost"
						disabled={busy}
						onClick={() => onOpenChange(false)}
					>
						Cancel
					</Button>
					<Button
						variant="destructive"
						disabled={busy || selected.size === 0}
						onClick={() => void reset()}
					>
						{busy ? "Deleting…" : `Delete selected (${selected.size})`}
					</Button>
				</div>
			</DialogContent>
		</Dialog>
	)
}

function DataSection() {
	const [busy, setBusy] = React.useState(false)
	const [resetOpen, setResetOpen] = React.useState(false)

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
				<Button
					variant="outline"
					size="sm"
					className="text-destructive"
					disabled={busy}
					onClick={() => setResetOpen(true)}
				>
					Reset data…
				</Button>
			</div>
			<ResetDataDialog open={resetOpen} onOpenChange={setResetOpen} />
		</Section>
	)
}
