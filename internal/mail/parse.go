package mail

import (
	"bytes"
	"fmt"
	"io"
	"strings"
	"time"

	// Registers decoders for non-UTF-8 charsets (ISO-8859-*, windows-125*, …)
	// so go-message can read them; without this import parsing such mail fails.
	_ "github.com/emersion/go-message/charset"
	gomail "github.com/emersion/go-message/mail"
	"github.com/microcosm-cc/bluemonday"

	"mailyard/internal/store"
)

type ParsedAttachment struct {
	Filename  string
	MimeType  string
	ContentID string
	Data      []byte
}

// ParsedMessage is everything Mailyard keeps from one RFC 822 message.
type ParsedMessage struct {
	// MessageID and Refs use "<id>" form: angle brackets make the store's
	// substring-based thread lookup exact instead of prefix-collidable.
	MessageID     string
	Refs          string
	Subject       string
	From          store.Address
	To            []store.Address
	Cc            []store.Address
	Date          time.Time
	TextBody      string
	HTMLSanitized string
	Snippet       string
	// Raw List-Unsubscribe header value ("" when absent).
	ListUnsubscribe string
	Attachments     []ParsedAttachment
}

// htmlPolicy keeps email markup (tables, inline styles, images) while
// stripping scripts and event handlers. Remote-image *loading* is a frontend
// concern — the sanitized HTML still contains img tags.
var htmlPolicy = func() *bluemonday.Policy {
	p := bluemonday.UGCPolicy()
	p.AllowAttrs("style").Globally()
	p.AllowAttrs("bgcolor", "align", "valign", "width", "height", "border",
		"cellpadding", "cellspacing").OnElements(
		"table", "tbody", "thead", "tfoot", "tr", "td", "th", "body")
	p.AllowElements("center", "font", "html", "head", "body")
	p.AllowAttrs("color", "face", "size").OnElements("font")
	p.AllowImages()
	return p
}()

// snippetPolicy strips every tag — used to build list snippets from HTML-only
// messages.
var snippetPolicy = bluemonday.StrictPolicy()

// ParseMessage parses a raw message into bodies, addresses, threading refs
// and attachments. The HTML body comes back sanitized.
func ParseMessage(raw []byte) (*ParsedMessage, error) {
	reader, err := gomail.CreateReader(bytes.NewReader(raw))
	if err != nil {
		return nil, fmt.Errorf("parse message: %w", err)
	}
	defer reader.Close()

	parsed := &ParsedMessage{}
	header := reader.Header

	if id, err := header.MessageID(); err == nil && id != "" {
		parsed.MessageID = "<" + id + ">"
	}
	refs := []string{}
	if list, err := header.MsgIDList("References"); err == nil {
		refs = append(refs, list...)
	}
	if list, err := header.MsgIDList("In-Reply-To"); err == nil {
		refs = append(refs, list...)
	}
	parsed.Refs = joinRefs(refs)

	if subject, err := header.Subject(); err == nil {
		parsed.Subject = subject
	}
	if date, err := header.Date(); err == nil {
		parsed.Date = date
	}
	if from, err := header.AddressList("From"); err == nil && len(from) > 0 {
		parsed.From = store.Address{Name: from[0].Name, Email: from[0].Address}
	}
	parsed.To = toAddresses(header, "To")
	parsed.Cc = toAddresses(header, "Cc")
	parsed.ListUnsubscribe = header.Get("List-Unsubscribe")

	for {
		part, err := reader.NextPart()
		if err == io.EOF {
			break
		}
		if err != nil {
			// One malformed part must not lose the whole message.
			break
		}

		switch h := part.Header.(type) {
		case *gomail.InlineHeader:
			contentType, _, _ := h.ContentType()
			switch {
			case contentType == "text/plain" && parsed.TextBody == "":
				body, _ := io.ReadAll(part.Body)
				parsed.TextBody = string(body)
			case contentType == "text/html" && parsed.HTMLSanitized == "":
				body, _ := io.ReadAll(part.Body)
				parsed.HTMLSanitized = htmlPolicy.Sanitize(string(body))
			case strings.HasPrefix(contentType, "image/"):
				// Inline images (multipart/related) are kept as attachments so
				// cid: references can resolve later.
				parsed.Attachments = append(parsed.Attachments,
					readAttachment(part.Body, "", contentType, h.Get("Content-Id")))
			}
		case *gomail.AttachmentHeader:
			filename, _ := h.Filename()
			contentType, _, _ := h.ContentType()
			parsed.Attachments = append(parsed.Attachments,
				readAttachment(part.Body, filename, contentType, h.Get("Content-Id")))
		}
	}

	parsed.Snippet = makeSnippet(parsed.TextBody, parsed.HTMLSanitized)
	return parsed, nil
}

func toAddresses(header gomail.Header, key string) []store.Address {
	list, err := header.AddressList(key)
	if err != nil {
		return nil
	}
	addresses := make([]store.Address, 0, len(list))
	for _, a := range list {
		addresses = append(addresses, store.Address{Name: a.Name, Email: a.Address})
	}
	return addresses
}

func readAttachment(body io.Reader, filename, mimeType, contentID string) ParsedAttachment {
	data, _ := io.ReadAll(body)
	if filename == "" {
		filename = "attachment"
	}
	return ParsedAttachment{
		Filename:  filename,
		MimeType:  mimeType,
		ContentID: strings.Trim(contentID, "<>"),
		Data:      data,
	}
}

func joinRefs(ids []string) string {
	seen := map[string]bool{}
	parts := make([]string, 0, len(ids))
	for _, id := range ids {
		id = strings.Trim(strings.TrimSpace(id), "<>")
		if id == "" || seen[id] {
			continue
		}
		seen[id] = true
		parts = append(parts, "<"+id+">")
	}
	return strings.Join(parts, " ")
}

const snippetLength = 180

func makeSnippet(textBody, html string) string {
	source := textBody
	if source == "" && html != "" {
		// Pad tags so stripped block elements don't fuse adjacent words.
		source = snippetPolicy.Sanitize(strings.ReplaceAll(html, "<", " <"))
	}
	collapsed := strings.Join(strings.Fields(source), " ")
	if len(collapsed) > snippetLength {
		cut := collapsed[:snippetLength]
		if idx := strings.LastIndexByte(cut, ' '); idx > snippetLength/2 {
			cut = cut[:idx]
		}
		collapsed = cut + "…"
	}
	return collapsed
}
