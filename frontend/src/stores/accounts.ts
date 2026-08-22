// Real accounts from the Go backend — the single source for the mailbox rail,
// the palette's Mailboxes group, and account filtering.
import { create } from "zustand"
import { Events } from "@wailsio/runtime"

import * as AccountService from "~/bindings/mailyard/accountservice"
import type { Account } from "~/bindings/mailyard/internal/store/models"

interface AccountsState {
	accounts: Account[]
	/** False until the first successful fetch — gates the onboarding screen. */
	loaded: boolean
}

export const useAccountsStore = create<AccountsState>(() => ({
	accounts: [],
	loaded: false,
}))

export async function refreshAccounts() {
	const accounts = (await AccountService.ListAccounts()) ?? []
	useAccountsStore.setState({ accounts, loaded: true })
}

let initialized = false

export async function initAccountsStore() {
	if (initialized) return // idempotent
	initialized = true

	Events.On("accounts:changed", () => {
		refreshAccounts().catch((error: unknown) =>
			console.error("refresh accounts failed", error)
		)
	})
	await refreshAccounts()
}
