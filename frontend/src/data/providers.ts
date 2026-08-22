// Known-provider presets for the add-mailbox dialog. All use app passwords —
// the appPasswordUrl explains where to create one.
export interface MailProvider {
	id: string
	name: string
	imapHost: string
	imapPort: number
	smtpHost: string
	smtpPort: number
	appPasswordUrl?: string
}

export const providers: MailProvider[] = [
	{
		id: "gmail",
		name: "Gmail",
		imapHost: "imap.gmail.com",
		imapPort: 993,
		smtpHost: "smtp.gmail.com",
		smtpPort: 465,
		appPasswordUrl: "https://myaccount.google.com/apppasswords",
	},
	{
		id: "icloud",
		name: "iCloud",
		imapHost: "imap.mail.me.com",
		imapPort: 993,
		smtpHost: "smtp.mail.me.com",
		smtpPort: 587,
		appPasswordUrl: "https://account.apple.com/account/manage",
	},
	{
		id: "outlook",
		name: "Outlook",
		imapHost: "outlook.office365.com",
		imapPort: 993,
		smtpHost: "smtp-mail.outlook.com",
		smtpPort: 587,
		appPasswordUrl: "https://account.live.com/proofs/manage/additional",
	},
	{
		id: "fastmail",
		name: "Fastmail",
		imapHost: "imap.fastmail.com",
		imapPort: 993,
		smtpHost: "smtp.fastmail.com",
		smtpPort: 465,
		appPasswordUrl: "https://app.fastmail.com/settings/security/apppasswords",
	},
	{
		id: "custom",
		name: "Custom",
		imapHost: "",
		imapPort: 993,
		smtpHost: "",
		smtpPort: 587,
	},
]
