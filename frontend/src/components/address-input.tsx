import * as React from "react"

import { Input } from "@/components/ui/input"
import {
	applySuggestion,
	committedEmails,
	currentToken,
} from "@/lib/address"
import { cn } from "@/lib/utils"
import * as MailService from "~/bindings/mailyard/mailservice"
import type { Contact } from "~/bindings/mailyard/internal/store/models"

const SEARCH_DEBOUNCE_MS = 120
const SUGGESTION_LIMIT = 6

/**
 * A To/Cc/Bcc row with contact autocomplete over everyone Mailyard has seen
 * in synced mail. Arrow keys navigate, Enter/Tab or click accepts, Escape
 * closes just the dropdown (not the sheet).
 */
export function AddressInput({
	label,
	value,
	onChange,
	autoFocus,
}: {
	label: string
	value: string
	onChange: (value: string) => void
	autoFocus?: boolean
}) {
	const [suggestions, setSuggestions] = React.useState<Contact[]>([])
	const [open, setOpen] = React.useState(false)
	const [active, setActive] = React.useState(0)

	React.useEffect(() => {
		const token = currentToken(value)
		const timer = setTimeout(() => {
			if (!token) {
				setSuggestions([])
				setOpen(false)
				return
			}
			const taken = new Set(committedEmails(value))
			MailService.SearchContacts(token, SUGGESTION_LIMIT)
				.then((contacts) => {
					const usable = (contacts ?? []).filter(
						(contact) =>
							!taken.has(contact.email) &&
							// Nothing to suggest once the fragment IS the address.
							contact.email !== token.toLowerCase()
					)
					setSuggestions(usable)
					setOpen(usable.length > 0)
					setActive(0)
				})
				.catch(() => {
					setSuggestions([])
					setOpen(false)
				})
		}, SEARCH_DEBOUNCE_MS)
		return () => clearTimeout(timer)
	}, [value])

	const pick = (contact: Contact) => {
		onChange(applySuggestion(value, contact.email))
		setOpen(false)
	}

	const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
		if (!open || suggestions.length === 0) return
		switch (event.key) {
		case "ArrowDown":
			event.preventDefault()
			setActive((current) => (current + 1) % suggestions.length)
			break
		case "ArrowUp":
			event.preventDefault()
			setActive((current) => (current - 1 + suggestions.length) % suggestions.length)
			break
		case "Enter":
		case "Tab":
			event.preventDefault()
			pick(suggestions[active])
			break
		case "Escape":
			// Only dismiss the dropdown — never the compose sheet behind it.
			event.preventDefault()
			event.stopPropagation()
			setOpen(false)
			break
		}
	}

	return (
		<div className="relative flex flex-row items-center gap-2 border-b py-1">
			<span className="w-8 shrink-0 text-xs text-muted-foreground">
				{label}
			</span>
			<Input
				value={value}
				onChange={(e) => onChange(e.target.value)}
				onKeyDown={handleKeyDown}
				onBlur={() => setOpen(false)}
				autoFocus={autoFocus}
				role="combobox"
				aria-expanded={open}
				aria-autocomplete="list"
				className="h-7 rounded-none border-none bg-transparent px-0 focus-visible:ring-0 focus-visible:border-transparent"
			/>

			{open && (
				<div
					role="listbox"
					className="absolute top-full left-10 z-50 mt-1 w-[calc(100%-2.5rem)] max-w-sm overflow-hidden rounded-2xl border bg-popover py-1 shadow-lg"
				>
					{suggestions.map((contact, index) => (
						<button
							key={contact.email}
							type="button"
							role="option"
							aria-selected={index === active}
							// onMouseDown fires before the input's blur closes us.
							onMouseDown={(event) => {
								event.preventDefault()
								pick(contact)
							}}
							onMouseEnter={() => setActive(index)}
							className={cn(
								"flex w-full flex-col items-start px-3 py-1.5 text-left",
								index === active && "bg-muted"
							)}
						>
							{contact.name ? (
								<>
									<span className="text-sm font-medium">{contact.name}</span>
									<span className="text-xs text-muted-foreground">
										{contact.email}
									</span>
								</>
							) : (
								<span className="text-sm">{contact.email}</span>
							)}
						</button>
					))}
				</div>
			)}
		</div>
	)
}
