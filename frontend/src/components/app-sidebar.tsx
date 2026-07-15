import {
	Sidebar,
	SidebarContent,
	SidebarFooter,
	SidebarGroup,
	SidebarHeader,
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
	SidebarSeparator,
} from "@/components/ui/sidebar"
import MailyardIcon from "./MailyardIcon"
import { MailboxList } from "./mailbox-list"
import { Avatar, AvatarFallback, AvatarImage } from "./ui/avatar"
import { AidsIcon, PencilIcon, RoboticIcon, Sparkles, TokenSquareIcon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { KbdShortcut } from "./ui/kbd"
import { ThemeToggle } from "./theme-toggle"

export function AppSidebar() {
	return (
		<Sidebar variant="sidebar" className="" collapsible="icon">
			<SidebarHeader className="pt-15">
				<SidebarMenu className="items-center">
					<SidebarMenuItem className="flex items-center justify-center">
						<Avatar size="lg">
							<AvatarImage src="htps://github.com/maytees.png" />
							<AvatarFallback>MA</AvatarFallback>
						</Avatar>
					</SidebarMenuItem>
					<SidebarMenuItem className="flex items-center justify-center">
						<MailyardIcon />
					</SidebarMenuItem>
				</SidebarMenu>
			</SidebarHeader>
			<SidebarSeparator className={"max-w-10 mx-auto"} />
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
						size="default"
						className="rounded-full shimmer"
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
