import { MailIcon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import * as React from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover"
import {
	humanizeIconName,
	iconByName,
	iconModule,
	loadIconLibrary,
	searchIcons,
	SUGGESTED_ICONS,
	useIcon,
} from "@/lib/icon-library"
import { cn } from "@/lib/utils"

const RESULT_LIMIT = 96

/**
 * Searchable picker over the whole hugeicons free library. Value is the icon
 * export name; "" means "no icon" (the rail shows the initial letter).
 */
export function IconPicker({
	value,
	onChange,
}: {
	value: string
	onChange: (name: string) => void
}) {
	const [open, setOpen] = React.useState(false)
	const [query, setQuery] = React.useState("")
	const [ready, setReady] = React.useState(false)
	const selected = useIcon(value)

	// The library chunk loads the first time the picker opens.
	React.useEffect(() => {
		if (!open || ready) return
		let cancelled = false
		loadIconLibrary().then(() => {
			if (!cancelled) setReady(true)
		})
		return () => {
			cancelled = true
		}
	}, [open, ready])

	const results = React.useMemo(() => {
		if (!ready) return []
		const module = iconModule()
		if (!module) return []
		if (query.trim()) {
			return searchIcons(module, query, RESULT_LIMIT)
		}
		return SUGGESTED_ICONS.filter((name) => module[name])
	}, [ready, query])

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger
				render={
					<Button
						type="button"
						variant="outline"
						size="icon"
						aria-label="Choose an icon"
					/>
				}
			>
				{selected ? (
					<HugeiconsIcon icon={selected} />
				) : (
					<HugeiconsIcon icon={MailIcon} className="opacity-40" />
				)}
			</PopoverTrigger>
			<PopoverContent align="start" className="w-72 p-3">
				<Input
					value={query}
					onChange={(e) => setQuery(e.target.value)}
					placeholder="Search icons…"
					autoFocus
					className="mb-2 h-8"
				/>
				{!ready ? (
					<p className="py-4 text-center text-xs text-muted-foreground">
						Loading icon library…
					</p>
				) : results.length === 0 ? (
					<p className="py-4 text-center text-xs text-muted-foreground">
						No icons match “{query.trim()}”
					</p>
				) : (
					<div className="grid max-h-56 grid-cols-7 gap-0.5 overflow-y-auto">
						<button
							type="button"
							title="No icon (use initial letter)"
							onClick={() => {
								onChange("")
								setOpen(false)
							}}
							className={cn(
								"flex size-9 items-center justify-center rounded-lg text-[10px] font-semibold text-muted-foreground hover:bg-muted",
								value === "" && "bg-muted ring-1 ring-ring"
							)}
						>
							Aa
						</button>
						{results.map((name) => {
							const icon = iconByName(name)
							if (!icon) return null
							return (
								<button
									key={name}
									type="button"
									title={humanizeIconName(name)}
									onClick={() => {
										onChange(name)
										setOpen(false)
									}}
									className={cn(
										"flex size-9 items-center justify-center rounded-lg hover:bg-muted [&_svg]:size-4.5",
										value === name && "bg-muted ring-1 ring-ring"
									)}
								>
									<HugeiconsIcon icon={icon} />
								</button>
							)
						})}
					</div>
				)}
			</PopoverContent>
		</Popover>
	)
}
