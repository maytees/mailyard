import * as React from "react"

import { Button } from "@/components/ui/button"
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import {
	setTranslateOpen,
	translateActiveThread,
	useAIStore,
} from "@/stores/ai"

const QUICK_LANGUAGES = ["English", "Spanish", "French", "German", "Arabic", "Japanese"]

/** Small prompt for the translate command's target language. */
export function TranslateDialog() {
	const open = useAIStore((s) => s.translateOpen)
	const [language, setLanguage] = React.useState("")

	const go = (target: string) => {
		if (!target.trim()) return
		setLanguage("")
		void translateActiveThread(target.trim())
	}

	return (
		<Dialog open={open} onOpenChange={setTranslateOpen}>
			<DialogContent className="sm:max-w-sm">
				<DialogHeader>
					<DialogTitle>Translate to…</DialogTitle>
				</DialogHeader>
				<form
					className="flex flex-col gap-3"
					onSubmit={(event) => {
						event.preventDefault()
						go(language)
					}}
				>
					<Input
						value={language}
						onChange={(e) => setLanguage(e.target.value)}
						placeholder="Any language"
						autoFocus
					/>
					<div className="flex flex-wrap gap-1.5">
						{QUICK_LANGUAGES.map((quick) => (
							<Button
								key={quick}
								type="button"
								variant="outline"
								size="xs"
								className="rounded-full"
								onClick={() => go(quick)}
							>
								{quick}
							</Button>
						))}
					</div>
				</form>
			</DialogContent>
		</Dialog>
	)
}
