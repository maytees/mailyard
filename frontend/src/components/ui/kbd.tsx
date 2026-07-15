import { formatShortcut } from "@/lib/keyboard"
import { cn } from "@/lib/utils"

function Kbd({ className, ...props }: React.ComponentProps<"kbd">) {
  return (
    <kbd
      data-slot="kbd"
      className={cn(
        "pointer-events-none inline-flex h-5.5 w-fit min-w-5.5 items-center justify-center gap-1 rounded-lg bg-muted px-1.5 font-sans text-xs font-medium text-muted-foreground select-none in-data-[slot=input-group]:bg-input in-data-[slot=tooltip-content]:bg-background/20 in-data-[slot=tooltip-content]:text-background dark:in-data-[slot=tooltip-content]:bg-background/10 [&_svg:not([class*='size-'])]:size-3",
        className
      )}
      {...props}
    />
  )
}

function KbdGroup({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <kbd
      data-slot="kbd-group"
      className={cn("inline-flex items-center gap-1", className)}
      {...props}
    />
  )
}

/**
 * Renders a platform-neutral shortcut as a KbdGroup of Kbd keys, with an
 * optional label in front.
 * <KbdShortcut shortcut="mod+k" /> → [⌘][K] on macOS, [Ctrl][K] elsewhere.
 * <KbdShortcut shortcut="alt+c">Compose</KbdShortcut> → Compose [⌥][C]
 */
function KbdShortcut({
  shortcut,
  children,
  className,
  ...props
}: React.ComponentProps<"div"> & { shortcut: string }) {
  const keys = formatShortcut(shortcut).map((key) => (
    <Kbd key={key}>{key}</Kbd>
  ))

  if (children == null) {
    return (
      <KbdGroup className={className} {...props}>
        {keys}
      </KbdGroup>
    )
  }

  return (
    <span
      data-slot="kbd-shortcut"
      className={cn("inline-flex items-center gap-1.5", className)}
      {...props}
    >
      {children}
      <KbdGroup>{keys}</KbdGroup>
    </span>
  )
}

export { Kbd, KbdGroup, KbdShortcut }
