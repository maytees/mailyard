// Mailbox accent color system, shared by Button, Badge and SidebarMenuButton.
//
// Each color entry only sets CSS variables (--accent + readable foregrounds);
// the accent* style strings below apply them per component variant via cva
// compoundVariants. Adding a color = one line here; adding a treatment = one
// string. Class strings must stay literal so Tailwind's scanner picks them up.
export const colorVariants = {
	red: "[--accent:var(--color-red-500)] [--accent-fg:var(--color-red-700)] [--accent-fg-active:var(--color-red-800)] dark:[--accent-fg:var(--color-red-300)] dark:[--accent-fg-active:var(--color-red-200)]",
	orange:
		"[--accent:var(--color-orange-500)] [--accent-fg:var(--color-orange-700)] [--accent-fg-active:var(--color-orange-800)] dark:[--accent-fg:var(--color-orange-300)] dark:[--accent-fg-active:var(--color-orange-200)]",
	amber:
		"[--accent:var(--color-amber-500)] [--accent-fg:var(--color-amber-700)] [--accent-fg-active:var(--color-amber-800)] dark:[--accent-fg:var(--color-amber-300)] dark:[--accent-fg-active:var(--color-amber-200)]",
	yellow:
		"[--accent:var(--color-yellow-500)] [--accent-fg:var(--color-yellow-700)] [--accent-fg-active:var(--color-yellow-800)] dark:[--accent-fg:var(--color-yellow-300)] dark:[--accent-fg-active:var(--color-yellow-200)]",
	lime: "[--accent:var(--color-lime-500)] [--accent-fg:var(--color-lime-700)] [--accent-fg-active:var(--color-lime-800)] dark:[--accent-fg:var(--color-lime-300)] dark:[--accent-fg-active:var(--color-lime-200)]",
	green:
		"[--accent:var(--color-green-500)] [--accent-fg:var(--color-green-700)] [--accent-fg-active:var(--color-green-800)] dark:[--accent-fg:var(--color-green-300)] dark:[--accent-fg-active:var(--color-green-200)]",
	emerald:
		"[--accent:var(--color-emerald-500)] [--accent-fg:var(--color-emerald-700)] [--accent-fg-active:var(--color-emerald-800)] dark:[--accent-fg:var(--color-emerald-300)] dark:[--accent-fg-active:var(--color-emerald-200)]",
	teal: "[--accent:var(--color-teal-500)] [--accent-fg:var(--color-teal-700)] [--accent-fg-active:var(--color-teal-800)] dark:[--accent-fg:var(--color-teal-300)] dark:[--accent-fg-active:var(--color-teal-200)]",
	cyan: "[--accent:var(--color-cyan-500)] [--accent-fg:var(--color-cyan-700)] [--accent-fg-active:var(--color-cyan-800)] dark:[--accent-fg:var(--color-cyan-300)] dark:[--accent-fg-active:var(--color-cyan-200)]",
	sky: "[--accent:var(--color-sky-500)] [--accent-fg:var(--color-sky-700)] [--accent-fg-active:var(--color-sky-800)] dark:[--accent-fg:var(--color-sky-300)] dark:[--accent-fg-active:var(--color-sky-200)]",
	blue: "[--accent:var(--color-blue-500)] [--accent-fg:var(--color-blue-700)] [--accent-fg-active:var(--color-blue-800)] dark:[--accent-fg:var(--color-blue-300)] dark:[--accent-fg-active:var(--color-blue-200)]",
	indigo:
		"[--accent:var(--color-indigo-500)] [--accent-fg:var(--color-indigo-700)] [--accent-fg-active:var(--color-indigo-800)] dark:[--accent-fg:var(--color-indigo-300)] dark:[--accent-fg-active:var(--color-indigo-200)]",
	violet:
		"[--accent:var(--color-violet-500)] [--accent-fg:var(--color-violet-700)] [--accent-fg-active:var(--color-violet-800)] dark:[--accent-fg:var(--color-violet-300)] dark:[--accent-fg-active:var(--color-violet-200)]",
	purple:
		"[--accent:var(--color-purple-500)] [--accent-fg:var(--color-purple-700)] [--accent-fg-active:var(--color-purple-800)] dark:[--accent-fg:var(--color-purple-300)] dark:[--accent-fg-active:var(--color-purple-200)]",
	fuchsia:
		"[--accent:var(--color-fuchsia-500)] [--accent-fg:var(--color-fuchsia-700)] [--accent-fg-active:var(--color-fuchsia-800)] dark:[--accent-fg:var(--color-fuchsia-300)] dark:[--accent-fg-active:var(--color-fuchsia-200)]",
	pink: "[--accent:var(--color-pink-500)] [--accent-fg:var(--color-pink-700)] [--accent-fg-active:var(--color-pink-800)] dark:[--accent-fg:var(--color-pink-300)] dark:[--accent-fg-active:var(--color-pink-200)]",
	rose: "[--accent:var(--color-rose-500)] [--accent-fg:var(--color-rose-700)] [--accent-fg-active:var(--color-rose-800)] dark:[--accent-fg:var(--color-rose-300)] dark:[--accent-fg-active:var(--color-rose-200)]",
} as const

export type MailboxColor = keyof typeof colorVariants

/** Every color key — for cva compoundVariants ({ color: mailboxColors, ... }). */
export const mailboxColors = Object.keys(colorVariants) as MailboxColor[]

// Treatments. Each covers rest / hover / pressed (active) / selected
// (data-active or aria-expanded) plus focus rings.

/** Solid tinted fill — the classic mailbox look (default/filled variants). */
export const accentFilled =
	"bg-(--accent)/20 text-(--accent-fg) ring-(--accent)/40 hover:bg-(--accent)/30 hover:text-(--accent-fg) active:bg-(--accent)/40 active:text-(--accent-fg-active) data-active:bg-(--accent)/35 data-active:text-(--accent-fg) aria-expanded:bg-(--accent)/25 aria-expanded:text-(--accent-fg) focus-visible:border-(--accent)/40 focus-visible:ring-(--accent)/30"

/** Softer fill for secondary emphasis. */
export const accentSecondary =
	"bg-(--accent)/10 text-(--accent-fg) ring-(--accent)/40 hover:bg-(--accent)/20 hover:text-(--accent-fg) active:bg-(--accent)/30 active:text-(--accent-fg-active) aria-expanded:bg-(--accent)/10 aria-expanded:text-(--accent-fg) focus-visible:border-(--accent)/40 focus-visible:ring-(--accent)/30"

/** Colored border, transparent body until interacted with. */
export const accentOutline =
	"border-(--accent)/40 bg-transparent text-(--accent-fg) ring-(--accent)/40 hover:bg-(--accent)/15 hover:text-(--accent-fg) active:bg-(--accent)/25 active:text-(--accent-fg-active) aria-expanded:bg-(--accent)/15 aria-expanded:text-(--accent-fg) focus-visible:border-(--accent)/40 focus-visible:ring-(--accent)/30 dark:bg-transparent dark:hover:bg-(--accent)/15"

/** No chrome at rest; tint appears on interaction. */
export const accentGhost =
	"text-(--accent-fg) hover:bg-(--accent)/15 hover:text-(--accent-fg) active:bg-(--accent)/25 active:text-(--accent-fg-active) aria-expanded:bg-(--accent)/15 aria-expanded:text-(--accent-fg) focus-visible:ring-(--accent)/30 dark:hover:bg-(--accent)/15"

/** Colored link text. */
export const accentLink = "text-(--accent-fg) active:text-(--accent-fg-active)"
