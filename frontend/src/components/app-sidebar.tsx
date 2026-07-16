import {
	Sidebar,
	SidebarContent,
	SidebarFooter,
	SidebarGroup,
	SidebarHeader,
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
	// SidebarSeparator,
} from "@/components/ui/sidebar"
// import MailyardIcon from "./MailyardIcon"
import { MailboxList } from "./mailbox-list"
import { PencilIcon, TokenSquareIcon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { KbdShortcut } from "./ui/kbd"
import { ThemeToggle } from "./theme-toggle"
import { useWindowStore } from "@/stores/window"
import { cn } from "@/lib/utils"

export function AppSidebar() {
	const { isFullscreen } = useWindowStore()

	return (
		<Sidebar variant="sidebar" className="" collapsible="icon">
			<SidebarHeader className={cn("pt-15", {
				// TODO: should probably check if macos as well, since macos has the things
				// on the left, and windows or smthn else would have unnecessary padding. ok
				// for now tho since we're only using macos.
				"pt-4": isFullscreen
			})}>
				<SidebarMenu className="items-center">
					<SidebarMenuItem className="flex items-center justify-center">
						<img src="/logo.svg" alt="Mailyard Logo" height={1024} width={1024} className="size-9 dark:opacity-80" />
						{/*<Avatar size="lg">
							<AvatarImage src="htps://github.com/maytees.png" />
							<AvatarFallback>MA</AvatarFallback>
						</Avatar>*/}
					</SidebarMenuItem>
					{/*<SidebarMenuItem className="flex items-center justify-center">
						<MailyardIcon />
					</SidebarMenuItem>*/}
				</SidebarMenu>
			</SidebarHeader>
			{/*<SidebarSeparator className={"max-w-10 mx-auto"} />*/}
			<SidebarContent>
				<SidebarGroup>
					<MailboxList />
				</SidebarGroup>
			</SidebarContent>
			<SidebarFooter className="mb-5">
				<SidebarMenu className="gap-3">
					<SidebarMenuItem>
					</SidebarMenuItem>
					<SidebarMenuButton
						tooltip={<KbdShortcut shortcut=".">AI</KbdShortcut>}
						size="md"
					>
						<HugeiconsIcon icon={TokenSquareIcon} />
					</SidebarMenuButton>

					<SidebarMenuItem>
						<ThemeToggle />
					</SidebarMenuItem>
					<SidebarMenuItem>
						<SidebarMenuButton tooltip={
							<KbdShortcut shortcut="alt+c">Compose</KbdShortcut>
						} size={"md"} color="rose" className="rounded-full" >
							<HugeiconsIcon className="-rotate-35" icon={PencilIcon} />
						</SidebarMenuButton>
					</SidebarMenuItem>
				</SidebarMenu>
			</SidebarFooter>
		</Sidebar>
	)
}
