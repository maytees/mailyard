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
import { Avatar, AvatarFallback, AvatarImage } from "./ui/avatar"
import { Button } from "./ui/button"
import { CatIcon, MailIcon, MailPlus, PlusSignIcon, SchoolIcon, Work, WorkIcon, YogaMatIcon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

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
					<SidebarMenuItem className="mt-0! pt-0!">
						<SidebarMenuButton tooltip={"Personal (maythamajam@gmail.com)"} className="[&_svg]:size-5 bg-violet-500/20 hover:bg-violet-500/10 rounded-lg" size={"default"}>
							<HugeiconsIcon icon={MailIcon} />
						</SidebarMenuButton>
					</SidebarMenuItem>

					<SidebarMenuItem>
						<SidebarMenuButton tooltip={"Personal 2 (mateespublicprofile@gmail.com)"} className="[&_svg]:size-5 bg-rose-500/20 hover:bg-rose-500/10 rounded-lg" size={"default"}>
							<HugeiconsIcon icon={YogaMatIcon} />
						</SidebarMenuButton>
					</SidebarMenuItem>

					<SidebarMenuItem>
						<SidebarMenuButton tooltip={"School (majam@gmu.edu)"} className="[&_svg]:size-5 bg-blue-500/20 hover:bg-blue-500/10 rounded-lg" size={"default"}>
							<HugeiconsIcon icon={SchoolIcon} />
						</SidebarMenuButton>
					</SidebarMenuItem>

					<SidebarMenuItem>
						<SidebarMenuButton tooltip={"Petzio (majam@gmu.edu)"} className="[&_svg]:size-5 bg-emerald-500/20 hover:bg-emerald-500/10 rounded-lg" size={"default"}>
							<HugeiconsIcon icon={CatIcon} />
						</SidebarMenuButton>
					</SidebarMenuItem>

					<SidebarMenuItem>
						<SidebarMenuButton tooltip={"Add Mailbox"} className="[&_svg]:size-5 rounded-lg" variant={"outline"} size={"default"}>
							<HugeiconsIcon icon={MailPlus} />
						</SidebarMenuButton>
					</SidebarMenuItem>
				</SidebarGroup>
			</SidebarContent>
			<SidebarFooter />
		</Sidebar>
	)
}
