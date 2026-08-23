package ai

// Every default AI instruction lives as a markdown file in prompts/ —
// that directory is the single source of truth for prompt text. Users can
// override any of them in Settings → AI → Customize instructions; overrides
// live in the settings KV under "ai_prompt_<id>" (empty = use the default
// file). {placeholders} are substituted at request time.

import (
	"context"
	"embed"
	"strings"
)

//go:embed prompts/*.md
var promptFS embed.FS

func defaultPrompt(file string) string {
	data, err := promptFS.ReadFile("prompts/" + file)
	if err != nil {
		panic(err) // embedded at compile time; missing file = build bug
	}
	return strings.TrimRight(string(data), "\n")
}

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

// PromptDefs — every instruction, in the order the editor lists them.
var PromptDefs = []PromptDef{
	{
		ID:    "summarize",
		Title: "Summarize thread",
		Description: "System prompt for the reading-pane summary. The thread " +
			"arrives as <thread>/<message> XML with the owner's address in <owner>.",
		Default: defaultPrompt("summarize.md"),
	},
	{
		ID:           "compose",
		Title:        "Write with AI (compose dictation)",
		Description:  "System prompt for the composer's instruction line.",
		Placeholders: []string{"mailbox_name", "mailbox_email", "your_name"},
		Default:      defaultPrompt("compose.md"),
	},
	{
		ID:           "draft-reply",
		Title:        "Draft reply with AI",
		Description:  "System prompt for the one-click AI reply draft.",
		Placeholders: []string{"mailbox_name", "mailbox_email", "your_name"},
		Default:      defaultPrompt("draft-reply.md"),
	},
	{
		ID:           "rewrite",
		Title:        "Rewrite draft",
		Description:  "System prompt for the tone buttons (concise/friendly/formal).",
		Placeholders: []string{"tone"},
		Default:      defaultPrompt("rewrite.md"),
	},
	{
		ID:           "translate",
		Title:        "Translate email",
		Description:  "System prompt for translations.",
		Placeholders: []string{"language"},
		Default:      defaultPrompt("translate.md"),
	},
	{
		ID:          "action-items",
		Title:       "Extract action items",
		Description: "System prompt for the action-item checklist.",
		Default:     defaultPrompt("action-items.md"),
	},
	{
		ID:          "triage",
		Title:       "Smart triage",
		Description: "System prompt for inbox priority labels.",
		Default:     defaultPrompt("triage.md"),
	},
	{
		ID:          "list-digest",
		Title:       "List digests",
		Description: "System prompt for the opt-in one-line digests in the mail list.",
		Default:     defaultPrompt("list-digest.md"),
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
