import {
	CatIcon,
	MailIcon,
	SchoolIcon,
	YogaMatIcon,
} from "@hugeicons/core-free-icons"
import type { IconSvgElement } from "@hugeicons/react"

import type { MailboxColor } from "@/lib/mailbox-colors"

export interface Mailbox {
	id: string
	name: string
	email: string
	color: MailboxColor
	icon: IconSvgElement
}

export const mailboxes: Mailbox[] = [
	{
		id: "personal",
		name: "Personal",
		email: "maythamajam@gmail.com",
		color: "violet",
		icon: MailIcon,
	},
	{
		id: "personal-2",
		name: "Personal 2",
		email: "mateespublicprofile@gmail.com",
		color: "rose",
		icon: YogaMatIcon,
	},
	{
		id: "school",
		name: "School",
		email: "majam@gmu.edu",
		color: "blue",
		icon: SchoolIcon,
	},
	{
		id: "petzio",
		name: "Petzio",
		email: "maytham@petzio.app",
		color: "emerald",
		icon: CatIcon,
	},
]
