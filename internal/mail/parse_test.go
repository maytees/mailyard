package mail

import (
	"strings"
	"testing"

	"github.com/emersion/go-imap/v2"
)

const multipartFixture = "Message-ID: <reply1@example.com>\r\n" +
	"In-Reply-To: <root@example.com>\r\n" +
	"References: <root@example.com>\r\n" +
	"From: \"Ann Example\" <ann@example.com>\r\n" +
	"To: Bob <bob@example.com>, carol@example.com\r\n" +
	"Cc: dave@example.com\r\n" +
	"Subject: =?UTF-8?Q?Caf=C3=A9_plans?=\r\n" +
	"Date: Mon, 10 Aug 2026 12:30:00 +0000\r\n" +
	"MIME-Version: 1.0\r\n" +
	"Content-Type: multipart/mixed; boundary=OUTER\r\n" +
	"\r\n" +
	"--OUTER\r\n" +
	"Content-Type: multipart/alternative; boundary=INNER\r\n" +
	"\r\n" +
	"--INNER\r\n" +
	"Content-Type: text/plain; charset=utf-8\r\n" +
	"\r\n" +
	"Let's meet at the café.\r\n" +
	"--INNER\r\n" +
	"Content-Type: text/html; charset=utf-8\r\n" +
	"\r\n" +
	"<p>Let's meet at the <b>café</b>.</p><script>alert(1)</script>\r\n" +
	"--INNER--\r\n" +
	"--OUTER\r\n" +
	"Content-Type: application/pdf\r\n" +
	"Content-Disposition: attachment; filename=\"menu.pdf\"\r\n" +
	"Content-Transfer-Encoding: base64\r\n" +
	"\r\n" +
	"JVBERi0=\r\n" +
	"--OUTER--\r\n"

func TestParseMultipartMessage(t *testing.T) {
	parsed, err := ParseMessage([]byte(multipartFixture))
	if err != nil {
		t.Fatalf("parse: %v", err)
	}

	if parsed.MessageID != "<reply1@example.com>" {
		t.Errorf("message id: %q", parsed.MessageID)
	}
	if parsed.Refs != "<root@example.com>" {
		t.Errorf("refs (deduped from References+In-Reply-To): %q", parsed.Refs)
	}
	if parsed.Subject != "Café plans" {
		t.Errorf("encoded subject: %q", parsed.Subject)
	}
	if parsed.From.Name != "Ann Example" || parsed.From.Email != "ann@example.com" {
		t.Errorf("from: %+v", parsed.From)
	}
	if len(parsed.To) != 2 || parsed.To[1].Email != "carol@example.com" {
		t.Errorf("to: %+v", parsed.To)
	}
	if len(parsed.Cc) != 1 {
		t.Errorf("cc: %+v", parsed.Cc)
	}
	if parsed.Date.IsZero() {
		t.Error("date not parsed")
	}
	if !strings.Contains(parsed.TextBody, "café") {
		t.Errorf("text body: %q", parsed.TextBody)
	}
	if !strings.Contains(parsed.HTMLSanitized, "<b>") {
		t.Errorf("html formatting stripped: %q", parsed.HTMLSanitized)
	}
	if strings.Contains(parsed.HTMLSanitized, "script") {
		t.Errorf("script survived sanitization: %q", parsed.HTMLSanitized)
	}
	if len(parsed.Attachments) != 1 || parsed.Attachments[0].Filename != "menu.pdf" {
		t.Fatalf("attachments: %+v", parsed.Attachments)
	}
	if string(parsed.Attachments[0].Data) != "%PDF-" {
		t.Errorf("attachment not base64-decoded: %q", parsed.Attachments[0].Data)
	}
	if !strings.HasPrefix(parsed.Snippet, "Let's meet") {
		t.Errorf("snippet: %q", parsed.Snippet)
	}
}

func TestParseHTMLOnlySnippet(t *testing.T) {
	raw := "From: x@example.com\r\n" +
		"Subject: HTML only\r\n" +
		"MIME-Version: 1.0\r\n" +
		"Content-Type: text/html; charset=utf-8\r\n" +
		"\r\n" +
		"<div><h1>Big sale</h1><p>Everything must   go.</p></div>\r\n"

	parsed, err := ParseMessage([]byte(raw))
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	if parsed.TextBody != "" {
		t.Errorf("unexpected text body: %q", parsed.TextBody)
	}
	if parsed.Snippet != "Big sale Everything must go." {
		t.Errorf("snippet from html: %q", parsed.Snippet)
	}
}

func TestParseLongSnippetTruncatesAtWord(t *testing.T) {
	body := strings.Repeat("wordy ", 60)
	raw := "From: x@example.com\r\nSubject: Long\r\nContent-Type: text/plain\r\n\r\n" + body

	parsed, err := ParseMessage([]byte(raw))
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	if len(parsed.Snippet) > snippetLength+4 {
		t.Errorf("snippet too long: %d chars", len(parsed.Snippet))
	}
	if !strings.HasSuffix(parsed.Snippet, "…") {
		t.Errorf("snippet not ellipsized: %q", parsed.Snippet)
	}
}

func TestFolderRoles(t *testing.T) {
	cases := []struct {
		name string
		attr string
		want string
	}{
		{"INBOX", "", "inbox"},
		{"inbox", "", "inbox"},
		{"[Gmail]/Sent Mail", "\\Sent", "sent"},
		{"Sent Items", "", "sent"},
		{"Drafts", "", "drafts"},
		{"Deleted Items", "", "trash"},
		{"[Gmail]/All Mail", "\\All", "archive"},
		{"Junk", "", "spam"},
		{"Projects", "", "other"},
	}
	for _, tc := range cases {
		attrs := []imap.MailboxAttr{}
		if tc.attr != "" {
			attrs = append(attrs, imap.MailboxAttr(tc.attr))
		}
		if got := folderRole(tc.name, attrs); got != tc.want {
			t.Errorf("folderRole(%q, %q) = %q, want %q", tc.name, tc.attr, got, tc.want)
		}
	}
}
