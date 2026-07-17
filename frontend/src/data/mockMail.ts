// Mock mail dataset for UI development until the Go backend feeds real IMAP data.
// Accounts mirror the mailboxes in the sidebar rail (see mailbox-list.tsx).

export type AccountId = "personal" | "personal-2" | "school" | "petzio"

export interface Account {
	name: string
	email: string
	color: string
	initial: string
}

export interface Attachment {
	kind: "file" | "image"
	ext: string
	name: string
	size: string
}

export interface MessageBlock {
	type: "paragraph" | "list" | "quote" | "image"
	text?: string
	lead?: string
	items?: string[]
	caption?: string
}

export interface ThreadEntry {
	sender: string
	email: string
	time: string
	snippet?: string
	blocks: MessageBlock[]
	attachments: Attachment[]
}

export interface Message {
	id: string
	account: AccountId
	sender: string
	subject: string
	time: string
	unread: boolean
	hasAttachments: boolean
	snippet: string
	summary: string
	thread: ThreadEntry[]
}

export interface MockMail {
	accounts: Record<AccountId, Account>
	accountOrder: AccountId[]
	messages: Message[]
}

// Temporary — mailbox colors are user-defined eventually. Values come from the
// mailbox accent palette in index.css (Tailwind 500s).
export const mailboxToColor: Record<AccountId, string> = {
	personal: "var(--color-mailbox-violet)",
	"personal-2": "var(--color-mailbox-rose)",
	school: "var(--color-mailbox-blue)",
	petzio: "var(--color-mailbox-emerald)",
}

export const mockMail: MockMail = {
	accounts: {
		personal: {
			name: "Personal",
			email: "maythamajam@gmail.com",
			color: "var(--color-mailbox-violet)",
			initial: "P",
		},
		"personal-2": {
			name: "Personal 2",
			email: "mateespublicprofile@gmail.com",
			color: "var(--color-mailbox-rose)",
			initial: "P",
		},
		school: {
			name: "School",
			email: "majam@gmu.edu",
			color: "var(--color-mailbox-blue)",
			initial: "S",
		},
		petzio: {
			name: "Petzio",
			email: "maytham@petzio.app",
			color: "var(--color-mailbox-emerald)",
			initial: "P",
		},
	},
	accountOrder: ["personal", "personal-2", "school", "petzio"],
	messages: [
		{
			id: "m1",
			account: "school",
			sender: "Priya Nair",
			subject: "Q3 planning doc — comments by Friday",
			time: "9:42 AM",
			unread: true,
			hasAttachments: true,
			snippet:
				"v2 attached with your section 2 notes folded in. What I still need from you…",
			summary:
				"Three-message thread. Priya sent the draft yesterday, you did a first pass on section 2, and this morning she sent v2: she needs comments on sections 2 and 4 before Friday's leads sync. Margin comments only — consolidation is Thursday night.",
			thread: [
				{
					sender: "Priya Nair",
					email: "pnair@gmu.edu",
					time: "Yesterday, 4:02 PM",
					snippet:
						"First full draft attached. Sections 2 and 4 need the most work…",
					blocks: [
						{ type: "paragraph", text: "Maytham —" },
						{
							type: "paragraph",
							text: "First full draft of the Q3 planning doc is attached. Most of it is carried over from the offsite notes, so don't re-litigate settled things — sections 2 (headcount) and 4 (platform bets) are where the real work is.",
						},
						{ type: "paragraph", text: "— P" },
					],
					attachments: [
						{
							kind: "file",
							ext: "PDF",
							name: "Q3-planning-draft.pdf",
							size: "1.2 MB",
						},
					],
				},
				{
					sender: "Maytham Ajam",
					email: "majam@gmu.edu",
					time: "Yesterday, 6:31 PM",
					snippet:
						"Took a first pass — headcount math in section 2 checks out, but the…",
					blocks: [
						{
							type: "paragraph",
							text: "Took a first pass. Headcount math in section 2 checks out against the finance sheet, but the platform-team split assumes the infra hire closes in July — worth a footnote.",
						},
						{
							type: "paragraph",
							text: "Proper read on section 4 tomorrow morning. — M",
						},
					],
					attachments: [],
				},
				{
					sender: "Priya Nair",
					email: "pnair@gmu.edu",
					time: "Today, 9:42 AM",
					snippet: "v2 attached with your section 2 notes folded in…",
					blocks: [
						{
							type: "paragraph",
							text: "Morning — v2 attached, with your section 2 notes folded in (footnote added on the infra hire).",
						},
						{
							type: "paragraph",
							lead: "What I still need from you: ",
							text: "comments on sections 2 and 4 before Friday's leads sync.",
						},
						{
							type: "list",
							items: [
								"Section 2 — headcount: sanity-check the platform team split one more time",
								"Section 4 — platform bets: is the storage migration under-scoped?",
								"Appendix C is informational; skip it",
							],
						},
						{
							type: "quote",
							text: "If anything feels under-baked, flag it in the margins rather than rewriting — Tomás and I will do a consolidation pass Thursday night.",
						},
						{
							type: "image",
							caption: "q3-sequencing.png · inline · Q3 sequencing chart",
						},
						{ type: "paragraph", text: "Thanks — P" },
					],
					attachments: [
						{
							kind: "file",
							ext: "PDF",
							name: "Q3-planning-v2.pdf",
							size: "1.4 MB",
						},
						{
							kind: "image",
							ext: "IMG",
							name: "q3-sequencing.png",
							size: "420 KB",
						},
					],
				},
			],
		},
		{
			id: "m2",
			account: "petzio",
			sender: "Jules Andrade",
			subject: "v0.4 build failing on ARM runners",
			time: "9:18 AM",
			unread: true,
			hasAttachments: true,
			snippet:
				"Started after the toolchain bump this morning. x86 is green; I suspect the…",
			summary:
				"ARM CI broke after this morning's toolchain bump; x86 is unaffected. Jules suspects the new linker flags and needs a pin-vs-patch decision before the afternoon build. Build log attached.",
			thread: [
				{
					sender: "Jules Andrade",
					email: "jules@petzio.app",
					time: "Today, 9:18 AM",
					blocks: [
						{ type: "paragraph", text: "Hey —" },
						{
							type: "paragraph",
							text: "ARM runners started failing right after the toolchain bump this morning. x86 is green, so it's almost certainly the new linker flags rather than anything in our code. Full log attached — the relevant section starts at line 4,812.",
						},
						{
							type: "list",
							items: [
								"Option A: pin the old toolchain, ship v0.4 on schedule",
								"Option B: patch forward, slip the release a day",
							],
						},
						{
							type: "paragraph",
							text: "I lean pin-and-ship, but it's your call — before the afternoon build, ideally. — J",
						},
					],
					attachments: [
						{
							kind: "file",
							ext: "LOG",
							name: "arm-build-4812.log",
							size: "88 KB",
						},
					],
				},
			],
		},
		{
			id: "m3",
			account: "personal",
			sender: "Mom",
			subject: "Cabin weekend — which dates work?",
			time: "8:55 AM",
			unread: true,
			hasAttachments: false,
			snippet:
				"Your uncle can do the 18th or the 25th. The 18th is better for the weather…",
			summary:
				"Family cabin weekend: options are July 18 or 25. The 18th is preferred (weather, uncle's schedule, no church-picnic conflict). She needs an answer by the weekend to book the boat rental.",
			thread: [
				{
					sender: "Mom",
					email: "theajams@gmail.com",
					time: "Today, 8:55 AM",
					blocks: [
						{ type: "paragraph", text: "Hi sweetheart," },
						{
							type: "paragraph",
							text: "Your uncle can do the 18th or the 25th for the cabin. He says the 18th is better for the weather, and honestly it's better for me too — the 25th bumps into the church picnic.",
						},
						{
							type: "paragraph",
							text: "Can you let me know by the weekend? I need to call about the boat rental.",
						},
						{ type: "paragraph", text: "Love, Mom" },
					],
					attachments: [],
				},
			],
		},
		{
			id: "m4",
			account: "school",
			sender: "Calendar",
			subject: "Standup moved to 10:30 today",
			time: "8:30 AM",
			unread: false,
			hasAttachments: false,
			snippet:
				"Priya moved today's standup to 10:30 to make room for the vendor call…",
			summary:
				"One-line schedule change: today's standup is at 10:30 instead of 10:00.",
			thread: [
				{
					sender: "Calendar",
					email: "calendar@gmu.edu",
					time: "Today, 8:30 AM",
					blocks: [
						{
							type: "paragraph",
							text: "Today's standup has been moved to 10:30 AM to make room for the vendor call. Same room, same link.",
						},
					],
					attachments: [],
				},
			],
		},
		{
			id: "m5",
			account: "personal-2",
			sender: "Dana K.",
			subject: "Loving the beta — one request",
			time: "Yesterday",
			unread: false,
			hasAttachments: true,
			snippet:
				"Been using Petzio daily for two weeks now. One thing that would make it perfect…",
			summary:
				"A happy beta user (daily for two weeks) requests keyboard-only reordering. Screenshots of her workflow attached; she offered to test rough builds.",
			thread: [
				{
					sender: "Dana K.",
					email: "dana.k@fastmail.com",
					time: "Yesterday, 4:12 PM",
					blocks: [
						{
							type: "paragraph",
							text: "Hi! Found your profile through the beta page. Been using Petzio daily for two weeks now and it's replaced two other tools for me.",
						},
						{
							type: "paragraph",
							lead: "One request: ",
							text: "let me reorder items entirely from the keyboard.",
						},
						{
							type: "paragraph",
							text: "I can select and move with the mouse, but arrow-key reordering would make it perfect for how I work. Screenshots of my setup attached so you can see the flow I mean.",
						},
						{ type: "paragraph", text: "Happy to test rough builds — Dana" },
					],
					attachments: [
						{
							kind: "image",
							ext: "IMG",
							name: "workflow-before.png",
							size: "1.1 MB",
						},
						{
							kind: "image",
							ext: "IMG",
							name: "workflow-after.png",
							size: "980 KB",
						},
					],
				},
			],
		},
		{
			id: "m6",
			account: "personal",
			sender: "Fern Creek Library",
			subject: "Hold available: The Overstory",
			time: "Yesterday",
			unread: false,
			hasAttachments: false,
			snippet:
				"Your hold is ready for pickup at the front desk. We'll keep it until July 16…",
			summary: "Library hold ready for pickup; held until July 16.",
			thread: [
				{
					sender: "Fern Creek Library",
					email: "holds@ferncreeklib.org",
					time: "Yesterday, 11:03 AM",
					blocks: [
						{
							type: "paragraph",
							text: "Your hold on The Overstory (Powers) is ready for pickup at the front desk. We'll keep it until July 16, after which it moves to the next patron.",
						},
					],
					attachments: [],
				},
			],
		},
		{
			id: "m7",
			account: "petzio",
			sender: "Tomás Rivera",
			subject: "Re: hiring loop feedback",
			time: "Yesterday",
			unread: false,
			hasAttachments: false,
			snippet:
				"Agreed on the systems round — I'll rework the rubric before the next loop and…",
			summary:
				"Two-message thread. Tomás agrees the systems round rewards memorized answers; he'll rework the rubric before the next loop. No action needed.",
			thread: [
				{
					sender: "Maytham Ajam",
					email: "maytham@petzio.app",
					time: "Monday, 3:15 PM",
					snippet:
						"The systems round feels off — strong candidates keep stumbling on…",
					blocks: [
						{
							type: "paragraph",
							text: "The systems round feels off. Strong candidates keep stumbling on the same sub-question, which suggests we're testing recall of a specific pattern rather than judgment.",
						},
					],
					attachments: [],
				},
				{
					sender: "Tomás Rivera",
					email: "tomas@petzio.app",
					time: "Yesterday, 9:40 AM",
					blocks: [
						{
							type: "paragraph",
							text: "Agreed — the rubric rewards memorized answers over judgment. I'll rework it before the next loop and send you the draft.",
						},
						{
							type: "paragraph",
							text: "No action needed from you; just keeping you posted. — T",
						},
					],
					attachments: [],
				},
			],
		},
		{
			id: "m8",
			account: "petzio",
			sender: "Petzio Reports",
			subject: "Weekly usage — 214 weekly actives",
			time: "Tue",
			unread: false,
			hasAttachments: false,
			snippet:
				"214 weekly actives, up 12 from last week. Median session length held at 9 minutes…",
			summary:
				"Steady growth: 214 weekly actives (+12), median session 9 min, week-4 retention flat at 41%.",
			thread: [
				{
					sender: "Petzio Reports",
					email: "reports@petzio.app",
					time: "Tuesday, 7:00 AM",
					blocks: [
						{
							type: "paragraph",
							text: "214 weekly actives this week, up 12 from last week. Median session length held at 9 minutes; week-4 retention is flat at 41%. Full breakdown in the dashboard.",
						},
					],
					attachments: [],
				},
			],
		},
		{
			id: "m9",
			account: "personal-2",
			sender: "Ren",
			subject: "Photos from Saturday",
			time: "Tue",
			unread: false,
			hasAttachments: true,
			snippet:
				"Finally went through the roll — the ones from the overlook came out great…",
			summary:
				"Ren shared three photos from Saturday's hike and suggests printing the overlook shot. Purely social.",
			thread: [
				{
					sender: "Ren",
					email: "ren.ito@gmail.com",
					time: "Tuesday, 8:21 PM",
					blocks: [
						{
							type: "paragraph",
							text: "Finally went through the roll from Saturday — the ones from the overlook came out great, especially the one of you pretending the fog was intentional.",
						},
						{ type: "paragraph", text: "Print the overlook one? — R" },
					],
					attachments: [
						{
							kind: "image",
							ext: "IMG",
							name: "overlook-01.jpg",
							size: "3.4 MB",
						},
						{
							kind: "image",
							ext: "IMG",
							name: "ridge-trail.jpg",
							size: "2.9 MB",
						},
						{
							kind: "image",
							ext: "IMG",
							name: "fog-portrait.jpg",
							size: "3.1 MB",
						},
					],
				},
			],
		},
	],
}
