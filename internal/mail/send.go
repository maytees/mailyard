package mail

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"mime"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/emersion/go-imap/v2"
	gomail "github.com/emersion/go-message/mail"
	"github.com/emersion/go-sasl"
	"github.com/emersion/go-smtp"

	"mailyard/internal/store"
)

// Outgoing is a message the user composed: a fresh mail, a reply (threading
// headers set), or a draft.
type Outgoing struct {
	AccountID       string   `json:"accountId"`
	To              []string `json:"to"`
	Cc              []string `json:"cc"`
	Bcc             []string `json:"bcc"`
	Subject         string   `json:"subject"`
	TextBody        string   `json:"textBody"`
	InReplyTo       string   `json:"inReplyTo"`  // "<id>" header of the replied-to message
	References      string   `json:"references"` // space-joined "<id>" chain
	AttachmentPaths []string `json:"attachmentPaths"`
	// Local id of the message being answered; gets \Answered on success.
	ReplyToMessageID int64 `json:"replyToMessageId"`
}

// SMTPDialFunc opens an SMTP connection; tests inject a plain dialer.
type SMTPDialFunc func(host string, port int) (*smtp.Client, error)

// DefaultSMTPDialer speaks implicit TLS on 465 and STARTTLS elsewhere.
func DefaultSMTPDialer(host string, port int) (*smtp.Client, error) {
	addr := fmt.Sprintf("%s:%d", host, port)
	if port == 465 {
		return smtp.DialTLS(addr, nil)
	}
	return smtp.DialStartTLS(addr, nil)
}

func (e *Engine) smtpDial(host string, port int) (*smtp.Client, error) {
	if e.SMTPDial != nil {
		return e.SMTPDial(host, port)
	}
	return DefaultSMTPDialer(host, port)
}

// Send submits the message over SMTP, appends it to the Sent folder, and
// marks a replied-to message answered.
func (e *Engine) Send(ctx context.Context, out Outgoing) error {
	account, err := e.Store.GetAccount(ctx, out.AccountID)
	if err != nil {
		return err
	}
	if len(out.To) == 0 {
		return fmt.Errorf("add at least one recipient")
	}
	password, err := e.Password(account.ID)
	if err != nil {
		return err
	}

	raw, err := buildMIME(account, out)
	if err != nil {
		return err
	}

	client, err := e.smtpDial(account.SMTPHost, account.SMTPPort)
	if err != nil {
		return fmt.Errorf("connect to smtp: %w", err)
	}
	defer client.Close()
	if err := client.Auth(sasl.NewPlainClient("", account.Username, password)); err != nil {
		return fmt.Errorf("smtp login: %w", err)
	}

	rcpts := append(append(append([]string{}, out.To...), out.Cc...), out.Bcc...)
	if err := client.SendMail(account.Email, rcpts, bytes.NewReader(raw)); err != nil {
		return fmt.Errorf("send: %w", err)
	}

	// Best-effort bookkeeping — the mail is out either way.
	if _, err := e.appendToRole(ctx, account, store.RoleSent, raw,
		[]imap.Flag{imap.FlagSeen}); err != nil {
		return fmt.Errorf("sent, but copying to Sent failed: %w", err)
	}
	if out.ReplyToMessageID != 0 {
		if err := e.SetMessageFlag(ctx, out.ReplyToMessageID, imap.FlagAnswered, true); err != nil {
			return nil // answered flag is cosmetic; don't fail the send
		}
	}
	return nil
}

// SaveDraft appends the draft to the Drafts folder (replacing an earlier
// version when replaceID is set) and returns the local message id.
func (e *Engine) SaveDraft(ctx context.Context, out Outgoing, replaceID int64) (int64, error) {
	account, err := e.Store.GetAccount(ctx, out.AccountID)
	if err != nil {
		return 0, err
	}
	raw, err := buildMIME(account, out)
	if err != nil {
		return 0, err
	}
	id, err := e.appendToRole(ctx, account, store.RoleDrafts, raw,
		[]imap.Flag{imap.FlagDraft, imap.FlagSeen})
	if err != nil {
		return 0, err
	}
	if replaceID != 0 && replaceID != id {
		if err := e.DeleteDraft(ctx, replaceID); err != nil {
			return id, nil // stale draft copy is cosmetic
		}
	}
	return id, nil
}

// DeleteDraft removes a draft from the server and the local store.
func (e *Engine) DeleteDraft(ctx context.Context, messageID int64) error {
	message, err := e.Store.GetMessage(ctx, messageID)
	if err != nil {
		return err
	}
	folder, err := e.Store.GetFolder(ctx, message.FolderID)
	if err != nil {
		return err
	}
	conn, err := e.actionConn(ctx, message.AccountID)
	if err != nil {
		return err
	}
	if err := conn.selectMailbox(folder.Name); err != nil {
		e.dropConn(message.AccountID)
		return err
	}
	uidSet := imap.UIDSetNum(imap.UID(message.UID))
	if err := conn.client.Store(uidSet, &imap.StoreFlags{
		Op: imap.StoreFlagsAdd, Flags: []imap.Flag{imap.FlagDeleted}, Silent: true,
	}, nil).Close(); err != nil {
		e.dropConn(message.AccountID)
		return err
	}
	if err := conn.client.Expunge().Close(); err != nil {
		e.dropConn(message.AccountID)
		return err
	}
	if err := e.Store.DeleteMessage(ctx, messageID); err != nil {
		return err
	}
	e.events().Emit("mail:changed", MailChanged{
		AccountID: message.AccountID, FolderRole: folder.Role,
	})
	return nil
}

// appendToRole APPENDs raw to the account folder with the given role and
// mirrors it into the local store immediately (no waiting for the next sync).
func (e *Engine) appendToRole(ctx context.Context, account store.Account, role string, raw []byte, flags []imap.Flag) (int64, error) {
	folder, err := e.Store.FolderByRole(ctx, account.ID, role)
	if err != nil {
		return 0, err
	}
	conn, err := e.actionConn(ctx, account.ID)
	if err != nil {
		return 0, err
	}

	cmd := conn.client.Append(folder.Name, int64(len(raw)), &imap.AppendOptions{
		Flags: flags, Time: time.Now(),
	})
	if _, err := cmd.Write(raw); err != nil {
		e.dropConn(account.ID)
		return 0, err
	}
	if err := cmd.Close(); err != nil {
		e.dropConn(account.ID)
		return 0, err
	}
	data, err := cmd.Wait()
	if err != nil {
		e.dropConn(account.ID)
		return 0, fmt.Errorf("append to %s: %w", folder.Name, err)
	}

	// Without UIDPLUS the server doesn't tell us the new UID; the folder's
	// next sync will pick the message up instead.
	if data.UID == 0 {
		e.events().Emit("mail:changed", MailChanged{AccountID: account.ID, FolderRole: role})
		return 0, nil
	}

	parsed, err := ParseMessage(raw)
	if err != nil {
		return 0, nil
	}
	message := store.Message{
		AccountID:      account.ID,
		FolderID:       folder.ID,
		UID:            uint32(data.UID),
		MessageID:      parsed.MessageID,
		Refs:           parsed.Refs,
		Subject:        parsed.Subject,
		From:           parsed.From,
		To:             parsed.To,
		Cc:             parsed.Cc,
		Date:           time.Now().Unix(),
		Snippet:        parsed.Snippet,
		Unread:         false,
		HasAttachments: len(parsed.Attachments) > 0,
		Size:           int64(len(raw)),
	}
	id, inserted, err := e.Store.UpsertMessage(ctx, message)
	if err != nil {
		return 0, err
	}
	if inserted {
		if err := e.Store.SetMessageBody(ctx, id, parsed.TextBody, parsed.HTMLSanitized); err != nil {
			return id, err
		}
		for _, attachment := range parsed.Attachments {
			if _, err := e.Store.UpsertAttachment(ctx, store.Attachment{
				MessageID: id,
				Filename:  attachment.Filename,
				MimeType:  attachment.MimeType,
				Size:      int64(len(attachment.Data)),
				ContentID: attachment.ContentID,
			}, attachment.Data); err != nil {
				return id, err
			}
		}
	}
	e.events().Emit("mail:changed", MailChanged{AccountID: account.ID, FolderRole: role})
	return id, nil
}

// buildMIME renders an Outgoing into RFC 822 bytes.
func buildMIME(account store.Account, out Outgoing) ([]byte, error) {
	var header gomail.Header
	header.SetDate(time.Now())
	header.SetAddressList("From", []*gomail.Address{
		{Name: account.DisplayName, Address: account.Email},
	})
	header.SetAddressList("To", toAddressList(out.To))
	if len(out.Cc) > 0 {
		header.SetAddressList("Cc", toAddressList(out.Cc))
	}
	header.SetSubject(out.Subject)
	if err := header.GenerateMessageIDWithHostname(emailDomain(account.Email)); err != nil {
		return nil, err
	}
	if out.InReplyTo != "" {
		header.SetMsgIDList("In-Reply-To", []string{strings.Trim(out.InReplyTo, "<>")})
	}
	if out.References != "" {
		refs := []string{}
		for _, ref := range strings.Fields(out.References) {
			refs = append(refs, strings.Trim(ref, "<>"))
		}
		header.SetMsgIDList("References", refs)
	}

	var buf bytes.Buffer
	writer, err := gomail.CreateWriter(&buf, header)
	if err != nil {
		return nil, err
	}

	var textHeader gomail.InlineHeader
	textHeader.SetContentType("text/plain", map[string]string{"charset": "utf-8"})
	textWriter, err := writer.CreateSingleInline(textHeader)
	if err != nil {
		return nil, err
	}
	if _, err := io.WriteString(textWriter, out.TextBody); err != nil {
		return nil, err
	}
	if err := textWriter.Close(); err != nil {
		return nil, err
	}

	for _, path := range out.AttachmentPaths {
		if err := writeAttachment(writer, path); err != nil {
			return nil, err
		}
	}
	if err := writer.Close(); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}

func writeAttachment(writer *gomail.Writer, path string) error {
	file, err := os.Open(path)
	if err != nil {
		return fmt.Errorf("attachment %s: %w", filepath.Base(path), err)
	}
	defer file.Close()

	var header gomail.AttachmentHeader
	header.SetFilename(filepath.Base(path))
	if contentType := mime.TypeByExtension(filepath.Ext(path)); contentType != "" {
		header.SetContentType(contentType, nil)
	}
	attachmentWriter, err := writer.CreateAttachment(header)
	if err != nil {
		return err
	}
	if _, err := io.Copy(attachmentWriter, file); err != nil {
		return err
	}
	return attachmentWriter.Close()
}

func toAddressList(emails []string) []*gomail.Address {
	list := make([]*gomail.Address, 0, len(emails))
	for _, email := range emails {
		email = strings.TrimSpace(email)
		if email != "" {
			list = append(list, &gomail.Address{Address: email})
		}
	}
	return list
}

func emailDomain(email string) string {
	if at := strings.LastIndexByte(email, '@'); at >= 0 {
		return email[at+1:]
	}
	return "localhost"
}
