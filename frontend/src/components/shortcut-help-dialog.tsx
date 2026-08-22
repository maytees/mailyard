import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog"
import { KbdShortcut } from "@/components/ui/kbd"
import { commandGroups, resolveCommandField } from "@/lib/command"
import { useUIStore } from "@/stores/ui"

/**
 * The "?" overlay. Generated straight from the command registry, so it can
 * never drift from what the keys actually do.
 */
export function ShortcutHelpDialog() {
	const open = useUIStore((s) => s.shortcutHelpOpen)
	const setOpen = useUIStore((s) => s.setShortcutHelpOpen)

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogContent className="sm:max-w-2xl">
				<DialogHeader>
					<DialogTitle>Keyboard shortcuts</DialogTitle>
					<DialogDescription>
						Sequences like G then I are pressed one key at a time.
					</DialogDescription>
				</DialogHeader>
				<div className="grid max-h-[60vh] grid-cols-1 gap-x-8 gap-y-5 overflow-y-auto sm:grid-cols-2">
					{commandGroups.map((group) => {
						const withShortcuts = group.commands.filter((c) => c.shortcut)
						if (withShortcuts.length === 0) return null
						return (
							<section key={group.heading} className="flex flex-col gap-1.5">
								<h3 className="font-heading text-xs font-semibold text-muted-foreground uppercase tracking-wide">
									{group.heading}
								</h3>
								{withShortcuts.map((command) => (
									<div
										key={command.id}
										className="flex flex-row items-center justify-between gap-3 text-sm"
									>
										<span className="truncate">
											{resolveCommandField(command.label)}
										</span>
										<KbdShortcut shortcut={command.shortcut!} />
									</div>
								))}
							</section>
						)
					})}
				</div>
			</DialogContent>
		</Dialog>
	)
}
