// Lazy access to the full hugeicons free library for account icons.
// The library is ~4k icons, so it loads as its own chunk on first use (the
// picker or a rail rendering a chosen icon) — never in the main bundle.
import * as React from "react"
import type { IconSvgElement } from "@hugeicons/react"

type IconModule = Record<string, IconSvgElement>

let cache: IconModule | null = null
let loading: Promise<IconModule> | null = null

export function loadIconLibrary(): Promise<IconModule> {
	loading ??= import("@hugeicons/core-free-icons").then((module) => {
		cache = module as unknown as IconModule
		return cache
	})
	return loading
}

/** The loaded library module (null until loadIconLibrary resolves). */
export function iconModule(): IconModule | null {
	return cache
}

/** Sync lookup once the library has loaded ("" / unknown → null). */
export function iconByName(name: string): IconSvgElement | null {
	if (!name || !cache) return null
	return cache[name] ?? null
}

/** Resolves an icon name, loading the library on demand. */
export function useIcon(name: string): IconSvgElement | null {
	const [, forceRender] = React.useReducer((n: number) => n + 1, 0)

	React.useEffect(() => {
		if (!name || cache) return
		let cancelled = false
		loadIconLibrary().then(() => {
			if (!cancelled) forceRender()
		})
		return () => {
			cancelled = true
		}
	}, [name])

	return iconByName(name)
}

/** All icon export names ("...Icon"), for search. */
export function allIconNames(module: IconModule): string[] {
	return Object.keys(module).filter((key) => key.endsWith("Icon"))
}

/** "AirplaneTakeOff01Icon" → "airplane take off 01" for matching/labels. */
export function humanizeIconName(name: string): string {
	return name
		.replace(/Icon$/, "")
		.replace(/([a-z])([A-Z0-9])/g, "$1 $2")
		.toLowerCase()
}

export function searchIcons(
	module: IconModule,
	query: string,
	limit: number
): string[] {
	const q = query.trim().toLowerCase()
	if (!q) return []
	const results: string[] = []
	for (const name of allIconNames(module)) {
		if (humanizeIconName(name).includes(q)) {
			results.push(name)
			if (results.length >= limit) break
		}
	}
	return results
}

// Shown before the user types. Names that don't exist in the installed
// library version are filtered out at runtime.
export const SUGGESTED_ICONS = [
	"MailIcon",
	"Home01Icon",
	"Briefcase01Icon",
	"SchoolIcon",
	"GraduationScrollIcon",
	"UserIcon",
	"UserGroupIcon",
	"Store01Icon",
	"ShoppingCart01Icon",
	"Wallet01Icon",
	"BankIcon",
	"CodeIcon",
	"GameController01Icon",
	"MusicNote01Icon",
	"Camera01Icon",
	"Airplane01Icon",
	"Car01Icon",
	"CatIcon",
	"DogIcon",
	"YogaMatIcon",
	"Dumbbell01Icon",
	"GlobalIcon",
	"StarIcon",
	"Rocket01Icon",
	"PaintBrush01Icon",
	"BookOpen01Icon",
	"Football01Icon",
	"Leaf01Icon",
	"FireIcon",
	"Moon02Icon",
	"Sun03Icon",
	"HeartCheckIcon",
] as const
