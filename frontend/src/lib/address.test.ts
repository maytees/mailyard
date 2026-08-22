import { describe, expect, it } from "vitest"

import {
	applySuggestion,
	committedEmails,
	currentToken,
} from "@/lib/address"

describe("address field helpers", () => {
	it("extracts the fragment being typed", () => {
		expect(currentToken("tam")).toBe("tam")
		expect(currentToken("ann@x.com, tam")).toBe("tam")
		expect(currentToken("ann@x.com, ")).toBe("")
		expect(currentToken("")).toBe("")
	})

	it("lists committed emails, excluding the live fragment", () => {
		expect(committedEmails("ann@x.com, Bob@y.com, tam")).toEqual([
			"ann@x.com",
			"bob@y.com",
		])
		expect(committedEmails("tam")).toEqual([])
	})

	it("replaces the fragment and opens the next slot", () => {
		expect(applySuggestion("tam", "tammarajam@gmail.com")).toBe(
			"tammarajam@gmail.com, "
		)
		expect(applySuggestion("ann@x.com, tam", "tammarajam@gmail.com")).toBe(
			"ann@x.com, tammarajam@gmail.com, "
		)
		expect(applySuggestion("ann@x.com, ", "b@y.com")).toBe(
			"ann@x.com, b@y.com, "
		)
	})
})
