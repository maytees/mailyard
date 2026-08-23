package store

// Folder roles, mapped from IMAP SPECIAL-USE (with name-based fallback).
const (
	RoleInbox   = "inbox"
	RoleSent    = "sent"
	RoleDrafts  = "drafts"
	RoleArchive = "archive"
	RoleTrash   = "trash"
	RoleSpam    = "spam"
	RoleOther   = "other"
)

type Account struct {
	ID          string `json:"id"`
	Email       string `json:"email"`
	DisplayName string `json:"displayName"`
	Color       string `json:"color"`
	// Icon is a hugeicons export name ("" = show the initial letter).
	Icon      string `json:"icon"`
	IMAPHost  string `json:"imapHost"`
	IMAPPort  int    `json:"imapPort"`
	SMTPHost  string `json:"smtpHost"`
	SMTPPort  int    `json:"smtpPort"`
	Username  string `json:"username"`
	AuthKind  string `json:"authKind"`
	CreatedAt int64  `json:"createdAt"`
	// SortOrder is the rail position (0-based, user-arranged).
	SortOrder int `json:"sortOrder"`
}

type Folder struct {
	ID           int64  `json:"id"`
	AccountID    string `json:"accountId"`
	Name         string `json:"name"`
	Role         string `json:"role"`
	UIDValidity  uint32 `json:"uidValidity"`
	UIDNext      uint32 `json:"uidNext"`
	LastSyncedAt int64  `json:"lastSyncedAt"`
}

type Address struct {
	Name  string `json:"name"`
	Email string `json:"email"`
}

type Message struct {
	ID             int64     `json:"id"`
	AccountID      string    `json:"accountId"`
	FolderID       int64     `json:"folderId"`
	UID            uint32    `json:"uid"`
	MessageID      string    `json:"messageId"`
	Refs           string    `json:"-"`
	ThreadID       string    `json:"threadId"`
	Subject        string    `json:"subject"`
	From           Address   `json:"from"`
	To             []Address `json:"to"`
	Cc             []Address `json:"cc"`
	Date           int64     `json:"date"`
	Snippet        string    `json:"snippet"`
	Unread         bool      `json:"unread"`
	Starred        bool      `json:"starred"`
	Answered       bool      `json:"answered"`
	HasAttachments bool      `json:"hasAttachments"`
	Size           int64     `json:"size"`
	SnoozedUntil   int64     `json:"snoozedUntil"`
	// Raw List-Unsubscribe header, for the unsubscribe-suggestions feature.
	ListUnsubscribe string `json:"-"`
	// Assigned label (0 = not yet classified). Read-only on writes.
	LabelID int64 `json:"labelId"`
}

type MessageBody struct {
	MessageID     int64  `json:"messageId"`
	TextBody      string `json:"textBody"`
	HTMLSanitized string `json:"htmlSanitized"`
}

type Attachment struct {
	ID        int64  `json:"id"`
	MessageID int64  `json:"messageId"`
	Filename  string `json:"filename"`
	MimeType  string `json:"mimeType"`
	Size      int64  `json:"size"`
	ContentID string `json:"contentId"`
	// Data intentionally omitted — fetched separately when saving to disk.
}

// ListFilter selects a message list slice. Empty AccountID means the unified
// view across every account.
type ListFilter struct {
	AccountID  string `json:"accountId"`
	FolderRole string `json:"folderRole"`
	// LabelID narrows the list to one label (0 = all).
	LabelID int64 `json:"labelId"`
	Limit   int   `json:"limit"`
	Offset  int   `json:"offset"`
}
