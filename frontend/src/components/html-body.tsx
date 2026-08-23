import { Alert02Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { Browser } from "@wailsio/runtime"
import * as React from "react"

import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { useSettingsStore } from "@/stores/settings"

// Rendered inside the shadow root, so email markup can't restyle the app and
// the app's utility classes can't distort the email. Inheritable properties
// (font, color) still flow in from the host, which is what we want.
const RESET_CSS = `
	.mail-root {
		font-size: 0.875rem;
		line-height: 1.6;
		word-break: break-word;
		overflow-wrap: anywhere;
		/* Fixed-width newsletter tables can't push past the pane; the host
		   div scrolls them horizontally instead. */
		max-width: 100%;
	}
	.mail-root img { max-width: 100%; height: auto; }
	.mail-root a { color: var(--color-primary, #c62a45); text-decoration: underline; }
	.mail-root blockquote {
		margin: 0.5em 0;
		padding-left: 0.75em;
		border-left: 2px solid rgba(128, 128, 128, 0.35);
		color: inherit;
		opacity: 0.75;
	}
	.mail-root pre { overflow-x: auto; max-width: 100%; }
	.mail-root table { max-width: 100%; border-collapse: collapse; }
`

interface ProcessedHtml {
	html: string
	blockedImages: number
}

/**
 * Privacy gate: strip remote image sources (http/https) until the user opts
 * in. cid:/data: images stay — they're local. Runs on already-sanitized HTML.
 */
function blockRemoteImages(html: string): ProcessedHtml {
	const doc = new DOMParser().parseFromString(html, "text/html")
	let blocked = 0
	for (const img of doc.querySelectorAll("img")) {
		const src = img.getAttribute("src") ?? ""
		if (/^https?:/i.test(src)) {
			img.removeAttribute("src")
			img.setAttribute("data-mailyard-blocked", src)
			img.style.display = "none"
			blocked++
		}
	}
	return { html: doc.body.innerHTML, blockedImages: blocked }
}

export function HtmlBody({
	html,
	senderEmail = "",
}: {
	html: string
	senderEmail?: string
}) {
	const hostRef = React.useRef<HTMLDivElement>(null)
	const [imagesAllowed, setImagesAllowed] = React.useState(false)
	const [trustPromptOpen, setTrustPromptOpen] = React.useState(false)

	// Trusted sender domains skip the gate entirely.
	const domain = senderEmail.split("@")[1]?.toLowerCase() ?? ""
	const trustedDomains = useSettingsStore((s) => s.trustedImageDomains)
	const allowed = imagesAllowed || (domain !== "" && trustedDomains.includes(domain))

	const processed = React.useMemo<ProcessedHtml>(
		() => (allowed ? { html, blockedImages: 0 } : blockRemoteImages(html)),
		[html, allowed]
	)

	React.useEffect(() => {
		const host = hostRef.current
		if (!host) return
		const shadow = host.shadowRoot ?? host.attachShadow({ mode: "open" })
		shadow.innerHTML = `<style>${RESET_CSS}</style><div class="mail-root">${processed.html}</div>`

		// Links open in the system browser, never inside the webview.
		const onClick = (event: Event) => {
			const path = event.composedPath()
			for (const node of path) {
				if (node instanceof HTMLAnchorElement && node.href) {
					event.preventDefault()
					Browser.OpenURL(node.href).catch(() =>
						window.open(node.href, "_blank")
					)
					return
				}
			}
		}
		shadow.addEventListener("click", onClick)
		return () => shadow.removeEventListener("click", onClick)
	}, [processed])

	return (
		<div>
			{processed.blockedImages > 0 && (
				<div className="mb-3 flex flex-row items-center gap-2 text-xs text-muted-foreground">
					<HugeiconsIcon icon={Alert02Icon} className="size-3.5" />
					<span>
						{processed.blockedImages} remote{" "}
						{processed.blockedImages === 1 ? "image" : "images"} blocked
					</span>
					<Button
						variant="outline"
						size="xs"
						className="h-5 rounded-full px-2 text-[11px]"
						onClick={() =>
							// No sender domain to trust (rare) → old one-shot behavior.
							domain === "" ? setImagesAllowed(true) : setTrustPromptOpen(true)
						}
					>
						Load images
					</Button>
				</div>
			)}
			<AlertDialog open={trustPromptOpen} onOpenChange={setTrustPromptOpen}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Load remote images?</AlertDialogTitle>
						<AlertDialogDescription>
							Remote images can tell <strong>{domain}</strong> when and where
							you read their email. Trust the domain and images from it load
							automatically from now on.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Cancel</AlertDialogCancel>
						<AlertDialogAction
							variant="outline"
							onClick={() => {
								setImagesAllowed(true)
								setTrustPromptOpen(false)
							}}
						>
							Just this once
						</AlertDialogAction>
						<AlertDialogAction
							onClick={() => {
								useSettingsStore.getState().trustImageDomain(domain)
								setTrustPromptOpen(false)
							}}
						>
							{/* The description names the domain — repeating it here
							    overflows the footer on long senders. */}
							Always trust this domain
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
			{/* Wide emails (fixed-width tables, styled divs) scroll inside this
			    host instead of stretching the flex layout — min-width:auto on
			    flex ancestors would otherwise shove the whole app sideways. */}
			<div ref={hostRef} className="min-w-0 max-w-full overflow-x-auto" />
		</div>
	)
}
