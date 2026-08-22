// Date/size formatting for mail rows and the reading pane.

const DAY = 86400

/**
 * Gmail-style compact relative time: "12:30" today, "Mon" this week,
 * "Aug 10" this year, "8/10/25" before that.
 */
export function formatRelativeTime(unixSeconds: number): string {
	if (!unixSeconds) return ""
	const date = new Date(unixSeconds * 1000)
	const now = new Date()
	const elapsed = (now.getTime() - date.getTime()) / 1000

	const sameDay = date.toDateString() === now.toDateString()
	if (sameDay) {
		return date.toLocaleTimeString(undefined, {
			hour: "numeric",
			minute: "2-digit",
		})
	}
	if (elapsed < 7 * DAY) {
		return date.toLocaleDateString(undefined, { weekday: "short" })
	}
	if (date.getFullYear() === now.getFullYear()) {
		return date.toLocaleDateString(undefined, { month: "short", day: "numeric" })
	}
	return date.toLocaleDateString(undefined, {
		year: "2-digit",
		month: "numeric",
		day: "numeric",
	})
}

/** Full timestamp for tooltips and the envelope card. */
export function formatFullDate(unixSeconds: number): string {
	if (!unixSeconds) return ""
	return new Date(unixSeconds * 1000).toLocaleString(undefined, {
		weekday: "short",
		year: "numeric",
		month: "short",
		day: "numeric",
		hour: "numeric",
		minute: "2-digit",
	})
}

export function formatBytes(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`
	if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
	return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
