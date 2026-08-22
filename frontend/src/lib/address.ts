// Helpers for the comma-separated address fields in compose.

/** The fragment being typed: everything after the last comma, trimmed. */
export function currentToken(value: string): string {
	const lastComma = value.lastIndexOf(",")
	return value.slice(lastComma + 1).trim()
}

/** Emails already committed in the field (every comma-separated part but the
 * fragment being typed). */
export function committedEmails(value: string): string[] {
	const parts = value.split(",").map((part) => part.trim().toLowerCase())
	return parts.slice(0, -1).filter(Boolean)
}

/**
 * Replaces the in-progress fragment with a picked address and re-opens a slot
 * for the next one ("ann@x.com, tam" + pick → "ann@x.com, tammarajam@…, ").
 */
export function applySuggestion(value: string, email: string): string {
	const lastComma = value.lastIndexOf(",")
	const kept = lastComma === -1 ? "" : value.slice(0, lastComma + 1) + " "
	return `${kept}${email}, `
}
