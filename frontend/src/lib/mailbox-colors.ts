// Mailbox accent color variants, shared by Button and SidebarMenuButton.
// Class strings must stay literal so Tailwind's scanner picks them up.
// Each color covers rest / hover / pressed (active) / selected (data-active)
// states so component base styles (e.g. active:bg-sidebar-accent) get overridden.
export const colorVariants = {
	red: "bg-red-500/20 text-red-700 ring-red-500/40 hover:bg-red-500/30 hover:text-red-700 active:bg-red-500/40 active:text-red-700 data-active:bg-red-500/35 data-active:text-red-700 focus-visible:border-red-500/40 focus-visible:ring-red-500/30 dark:text-red-300 dark:hover:text-red-300 dark:active:text-red-200 dark:data-active:text-red-300",
	orange:
		"bg-orange-500/20 text-orange-700 ring-orange-500/40 hover:bg-orange-500/30 hover:text-orange-700 active:bg-orange-500/40 active:text-orange-700 data-active:bg-orange-500/35 data-active:text-orange-700 focus-visible:border-orange-500/40 focus-visible:ring-orange-500/30 dark:text-orange-300 dark:hover:text-orange-300 dark:active:text-orange-200 dark:data-active:text-orange-300",
	amber:
		"bg-amber-500/20 text-amber-700 ring-amber-500/40 hover:bg-amber-500/30 hover:text-amber-700 active:bg-amber-500/40 active:text-amber-700 data-active:bg-amber-500/35 data-active:text-amber-700 focus-visible:border-amber-500/40 focus-visible:ring-amber-500/30 dark:text-amber-300 dark:hover:text-amber-300 dark:active:text-amber-200 dark:data-active:text-amber-300",
	yellow:
		"bg-yellow-500/20 text-yellow-700 ring-yellow-500/40 hover:bg-yellow-500/30 hover:text-yellow-700 active:bg-yellow-500/40 active:text-yellow-700 data-active:bg-yellow-500/35 data-active:text-yellow-700 focus-visible:border-yellow-500/40 focus-visible:ring-yellow-500/30 dark:text-yellow-300 dark:hover:text-yellow-300 dark:active:text-yellow-200 dark:data-active:text-yellow-300",
	lime: "bg-lime-500/20 text-lime-700 ring-lime-500/40 hover:bg-lime-500/30 hover:text-lime-700 active:bg-lime-500/40 active:text-lime-700 data-active:bg-lime-500/35 data-active:text-lime-700 focus-visible:border-lime-500/40 focus-visible:ring-lime-500/30 dark:text-lime-300 dark:hover:text-lime-300 dark:active:text-lime-200 dark:data-active:text-lime-300",
	green:
		"bg-green-500/20 text-green-700 ring-green-500/40 hover:bg-green-500/30 hover:text-green-700 active:bg-green-500/40 active:text-green-700 data-active:bg-green-500/35 data-active:text-green-700 focus-visible:border-green-500/40 focus-visible:ring-green-500/30 dark:text-green-300 dark:hover:text-green-300 dark:active:text-green-200 dark:data-active:text-green-300",
	emerald:
		"bg-emerald-500/20 text-emerald-700 ring-emerald-500/40 hover:bg-emerald-500/30 hover:text-emerald-700 active:bg-emerald-500/40 active:text-emerald-700 data-active:bg-emerald-500/35 data-active:text-emerald-700 focus-visible:border-emerald-500/40 focus-visible:ring-emerald-500/30 dark:text-emerald-300 dark:hover:text-emerald-300 dark:active:text-emerald-200 dark:data-active:text-emerald-300",
	teal: "bg-teal-500/20 text-teal-700 ring-teal-500/40 hover:bg-teal-500/30 hover:text-teal-700 active:bg-teal-500/40 active:text-teal-700 data-active:bg-teal-500/35 data-active:text-teal-700 focus-visible:border-teal-500/40 focus-visible:ring-teal-500/30 dark:text-teal-300 dark:hover:text-teal-300 dark:active:text-teal-200 dark:data-active:text-teal-300",
	cyan: "bg-cyan-500/20 text-cyan-700 ring-cyan-500/40 hover:bg-cyan-500/30 hover:text-cyan-700 active:bg-cyan-500/40 active:text-cyan-700 data-active:bg-cyan-500/35 data-active:text-cyan-700 focus-visible:border-cyan-500/40 focus-visible:ring-cyan-500/30 dark:text-cyan-300 dark:hover:text-cyan-300 dark:active:text-cyan-200 dark:data-active:text-cyan-300",
	sky: "bg-sky-500/20 text-sky-700 ring-sky-500/40 hover:bg-sky-500/30 hover:text-sky-700 active:bg-sky-500/40 active:text-sky-700 data-active:bg-sky-500/35 data-active:text-sky-700 focus-visible:border-sky-500/40 focus-visible:ring-sky-500/30 dark:text-sky-300 dark:hover:text-sky-300 dark:active:text-sky-200 dark:data-active:text-sky-300",
	blue: "bg-blue-500/20 text-blue-700 ring-blue-500/40 hover:bg-blue-500/30 hover:text-blue-700 active:bg-blue-500/40 active:text-blue-700 data-active:bg-blue-500/35 data-active:text-blue-700 focus-visible:border-blue-500/40 focus-visible:ring-blue-500/30 dark:text-blue-300 dark:hover:text-blue-300 dark:active:text-blue-200 dark:data-active:text-blue-300",
	indigo:
		"bg-indigo-500/20 text-indigo-700 ring-indigo-500/40 hover:bg-indigo-500/30 hover:text-indigo-700 active:bg-indigo-500/40 active:text-indigo-700 data-active:bg-indigo-500/35 data-active:text-indigo-700 focus-visible:border-indigo-500/40 focus-visible:ring-indigo-500/30 dark:text-indigo-300 dark:hover:text-indigo-300 dark:active:text-indigo-200 dark:data-active:text-indigo-300",
	violet:
		"bg-violet-500/20 text-violet-700 ring-violet-500/40 hover:bg-violet-500/30 hover:text-violet-700 active:bg-violet-500/40 active:text-violet-700 data-active:bg-violet-500/35 data-active:text-violet-700 focus-visible:border-violet-500/40 focus-visible:ring-violet-500/30 dark:text-violet-300 dark:hover:text-violet-300 dark:active:text-violet-200 dark:data-active:text-violet-300",
	purple:
		"bg-purple-500/20 text-purple-700 ring-purple-500/40 hover:bg-purple-500/30 hover:text-purple-700 active:bg-purple-500/40 active:text-purple-700 data-active:bg-purple-500/35 data-active:text-purple-700 focus-visible:border-purple-500/40 focus-visible:ring-purple-500/30 dark:text-purple-300 dark:hover:text-purple-300 dark:active:text-purple-200 dark:data-active:text-purple-300",
	fuchsia:
		"bg-fuchsia-500/20 text-fuchsia-700 ring-fuchsia-500/40 hover:bg-fuchsia-500/30 hover:text-fuchsia-700 active:bg-fuchsia-500/40 active:text-fuchsia-700 data-active:bg-fuchsia-500/35 data-active:text-fuchsia-700 focus-visible:border-fuchsia-500/40 focus-visible:ring-fuchsia-500/30 dark:text-fuchsia-300 dark:hover:text-fuchsia-300 dark:active:text-fuchsia-200 dark:data-active:text-fuchsia-300",
	pink: "bg-pink-500/20 text-pink-700 ring-pink-500/40 hover:bg-pink-500/30 hover:text-pink-700 active:bg-pink-500/40 active:text-pink-700 data-active:bg-pink-500/35 data-active:text-pink-700 focus-visible:border-pink-500/40 focus-visible:ring-pink-500/30 dark:text-pink-300 dark:hover:text-pink-300 dark:active:text-pink-200 dark:data-active:text-pink-300",
	rose: "bg-rose-500/20 text-rose-700 ring-rose-500/40 hover:bg-rose-500/30 hover:text-rose-700 active:bg-rose-500/40 active:text-rose-700 data-active:bg-rose-500/35 data-active:text-rose-700 focus-visible:border-rose-500/40 focus-visible:ring-rose-500/30 dark:text-rose-300 dark:hover:text-rose-300 dark:active:text-rose-200 dark:data-active:text-rose-300",
} as const

export type MailboxColor = keyof typeof colorVariants
