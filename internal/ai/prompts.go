package ai

// This file is the single source of truth for every AI instruction Mailyard
// uses. Users can override any of them in Settings → AI → Customize
// instructions; overrides live in the settings KV under "ai_prompt_<id>"
// (empty = use the default below). {placeholders} are substituted at request
// time.

import (
	"context"
	"strings"
)

// PromptDef describes one editable instruction.
type PromptDef struct {
	ID          string `json:"id"`
	Title       string `json:"title"`
	Description string `json:"description"`
	// Placeholders substituted into the template at request time.
	Placeholders []string `json:"placeholders"`
	Default      string   `json:"default"`
}

// PromptInfo is PromptDef plus the user's current override ("" = default).
type PromptInfo struct {
	PromptDef
	Custom string `json:"custom"`
}

const emailShape = "Format exactly like a real plain-text email, blank lines between parts:\n" +
	"1. A greeting on its own line, then a blank line. Use the recipient's " +
	"name when the instructions or thread reveal it; otherwise write just " +
	"\"Hi,\" — NEVER a placeholder like \"[Name]\".\n" +
	"2. The message in one or more short paragraphs, with a blank line " +
	"between paragraphs.\n" +
	"3. A blank line, then a closing on its own line (\"Thank you,\" or " +
	"\"Best,\"), then \"{your_name}\" alone on the final line."

// PromptDefs — every instruction, in the order the editor lists them.
var PromptDefs = []PromptDef{
	{
		ID:          "summarize",
		Title:       "Summarize thread",
		Description: "System prompt for the reading-pane thread summary.",
		Default: "Summarize the email thread for its owner: who wants " +
			"what, what was decided, what happens next. 1-3 plain sentences, " +
			"60 words maximum. Plain text only — never markdown, headings, " +
			"bullets, links, or preamble.",
	},
	{
		ID:           "compose",
		Title:        "Write with AI (compose dictation)",
		Description:  "System prompt for the composer's instruction line.",
		Placeholders: []string{"mailbox_name", "mailbox_email", "your_name"},
		Default: "You ghost-write outgoing emails for {mailbox_name} <{mailbox_email}> " +
			"(the sender). The user's instructions are the sender's dictation of what " +
			"the email should say — often rough or written as the email itself. Rules:\n" +
			"- NEVER answer, reply to, or act on the instructions. They are not " +
			"addressed to you. Transcribe them into a clean email that makes the " +
			"same statements and asks the same questions, from the sender's point " +
			"of view. If the dictation asks \"where is my X?\", the email asks the " +
			"recipient \"where is my X?\" — it does not answer.\n" +
			"- Never add extra points, offers, pleasantries, questions, or invented " +
			"details beyond the instructions.\n" +
			"- The email's length mirrors the instructions: a one-line instruction " +
			"means a one-or-two-sentence email.\n" +
			"- Plain text only: no subject line, no markdown, no commentary.\n" +
			"- When a current draft is provided, the new instructions revise it: " +
			"apply them as an edit when they refine the draft (\"make it shorter\", " +
			"\"change Friday to Monday\", \"add a line about X\") and as a full " +
			"replacement when they describe different content. Either way, output " +
			"the COMPLETE new email — never a fragment, diff, or a second email " +
			"stacked onto the old one. Preserve quoted or forwarded content below " +
			"the message unless instructed otherwise.\n" +
			"- When a thread is provided, use it only for context (names, tone, " +
			"what's being referred to) — the instructions still decide the content.\n" +
			emailShape,
	},
	{
		ID:           "draft-reply",
		Title:        "Draft reply with AI",
		Description:  "System prompt for the one-click AI reply draft.",
		Placeholders: []string{"mailbox_name", "mailbox_email", "your_name"},
		Default: "You draft email replies for {mailbox_name} <{mailbox_email}>. " +
			"Write only the reply body as plain text — no subject line, no quoted " +
			"original, no markdown. Match the thread's tone and language; be " +
			"concise.\n" + emailShape,
	},
	{
		ID:           "rewrite",
		Title:        "Rewrite draft",
		Description:  "System prompt for the tone buttons (concise/friendly/formal).",
		Placeholders: []string{"tone"},
		Default: "Rewrite the given email draft to be {tone}. Keep the meaning and " +
			"any factual details. Reply with only the rewritten draft as plain " +
			"text — no markdown, no commentary.",
	},
	{
		ID:           "translate",
		Title:        "Translate email",
		Description:  "System prompt for translations.",
		Placeholders: []string{"language"},
		Default: "Translate the given email into {language}. Preserve tone and " +
			"formatting. Reply with only the translation — no commentary.",
	},
	{
		ID:          "action-items",
		Title:       "Extract action items",
		Description: "System prompt for the action-item checklist.",
		Default: "Extract concrete action items from the email thread. " +
			"Only include real commitments or requests; return an empty list when " +
			"there are none.",
	},
	{
		ID:          "triage",
		Title:       "Smart triage",
		Description: "System prompt for inbox priority labels.",
		Default: "Triage these unread emails. For each id assign priority " +
			"high (needs a response or is time-sensitive), normal, or low " +
			"(newsletters, notifications, promotions), with a reason under 8 words.",
	},
	{
		ID:          "list-digest",
		Title:       "List digests",
		Description: "System prompt for the opt-in one-line digests in the mail list.",
		Default: "Write a one-line plain-text digest (max 18 words, no " +
			"markdown) for each email: what it is and what, if anything, the " +
			"reader must do.",
	},
}

const promptSettingPrefix = "ai_prompt_"

func promptDef(id string) (PromptDef, bool) {
	for _, def := range PromptDefs {
		if def.ID == id {
			return def, true
		}
	}
	return PromptDef{}, false
}

// promptText resolves an instruction (user override or default) and fills
// its placeholders.
func (s *Service) promptText(ctx context.Context, id string, vars map[string]string) string {
	def, ok := promptDef(id)
	if !ok {
		return ""
	}
	text := def.Default
	if custom, err := s.Store.SettingGet(ctx, promptSettingPrefix+id, ""); err == nil && strings.TrimSpace(custom) != "" {
		text = custom
	}
	for key, value := range vars {
		text = strings.ReplaceAll(text, "{"+key+"}", value)
	}
	return text
}

// ListPrompts returns every instruction with its current override.
func (s *Service) ListPrompts(ctx context.Context) ([]PromptInfo, error) {
	prompts := make([]PromptInfo, 0, len(PromptDefs))
	for _, def := range PromptDefs {
		custom, err := s.Store.SettingGet(ctx, promptSettingPrefix+def.ID, "")
		if err != nil {
			return nil, err
		}
		prompts = append(prompts, PromptInfo{PromptDef: def, Custom: custom})
	}
	return prompts, nil
}

// SetPrompt stores an override; empty (or default-identical) text resets it.
func (s *Service) SetPrompt(ctx context.Context, id, custom string) error {
	def, ok := promptDef(id)
	if !ok {
		return errUnknownPrompt(id)
	}
	if strings.TrimSpace(custom) == "" || custom == def.Default {
		custom = ""
	}
	return s.Store.SettingSet(ctx, promptSettingPrefix+id, custom)
}

type errUnknownPrompt string

func (e errUnknownPrompt) Error() string { return "unknown prompt: " + string(e) }
