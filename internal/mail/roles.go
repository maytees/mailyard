package mail

import (
	"strings"

	"github.com/emersion/go-imap/v2"

	"mailyard/internal/store"
)

// folderRole maps an IMAP mailbox to a Mailyard role, preferring SPECIAL-USE
// attributes and falling back to well-known names (Gmail's "[Gmail]/Sent
// Mail" carries \Sent, but plain servers often only have the name).
func folderRole(name string, attrs []imap.MailboxAttr) string {
	for _, attr := range attrs {
		switch attr {
		case imap.MailboxAttrSent:
			return store.RoleSent
		case imap.MailboxAttrDrafts:
			return store.RoleDrafts
		case imap.MailboxAttrTrash:
			return store.RoleTrash
		case imap.MailboxAttrJunk:
			return store.RoleSpam
		case imap.MailboxAttrArchive, imap.MailboxAttrAll:
			// Gmail's "All Mail" (\All) is where archived mail lives.
			return store.RoleArchive
		}
	}

	if strings.EqualFold(name, "INBOX") {
		return store.RoleInbox
	}
	lower := strings.ToLower(name)
	switch {
	case strings.Contains(lower, "sent"):
		return store.RoleSent
	case strings.Contains(lower, "draft"):
		return store.RoleDrafts
	case strings.Contains(lower, "trash"), strings.Contains(lower, "deleted"):
		return store.RoleTrash
	case strings.Contains(lower, "junk"), strings.Contains(lower, "spam"):
		return store.RoleSpam
	case strings.Contains(lower, "archive"):
		return store.RoleArchive
	}
	return store.RoleOther
}
