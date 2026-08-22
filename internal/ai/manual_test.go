//go:build manual

package ai

// Manual integration check against a locally running Ollama:
//
//	go test ./internal/ai/ -tags manual -run TestManualOllamaSummary -v
//
// Excluded from normal test runs — it needs the ollama service and a pulled
// model.

import (
	"context"
	"strings"
	"testing"

	"github.com/zendev-sh/goai"
	"github.com/zendev-sh/goai/provider/ollama"
)

func TestManualOllamaSummary(t *testing.T) {
	thread := "From: Jamie <j@x.com>\nSubject: 7.24 Website Body Copy Revisions\n\n" +
		"[Share image] Jamie invited you to edit a file. Here are the Home Page and " +
		"Service Pages copy changes. Owner Page and Team bios expected tomorrow " +
		"morning. Document: https://example.sharepoint.com/very/long/path/doc.docx\n\n---\n\n" +
		"From: Maytham <m@x.com>\n\nIs the Young meeting Thursday or Friday?\n\n---\n\n" +
		"From: Jamie <j@x.com>\n\nI set it up in Teams for Friday, waiting on Young to confirm."

	result, err := goai.GenerateObject[summaryOutput](context.Background(),
		ollama.Chat("qwen3:8b"),
		goai.WithSystem("Summarize the email thread for its owner: who wants "+
			"what, what was decided, what happens next. 1-3 plain sentences, "+
			"60 words maximum. Plain text only — never markdown, headings, "+
			"bullets, links, or preamble."),
		goai.WithPrompt(thread),
		goai.WithMaxOutputTokens(400),
		goai.WithProviderOptions(map[string]any{"think": false}),
	)
	if err != nil {
		t.Fatalf("generate: %v", err)
	}
	summary := SanitizeSummary(result.Object.Summary, 70)
	t.Logf("summary (%d words): %s", len(strings.Fields(summary)), summary)

	if summary == "" {
		t.Fatal("empty summary")
	}
	if words := len(strings.Fields(summary)); words > 75 {
		t.Fatalf("too long: %d words", words)
	}
	for _, banned := range []string{"**", "###", "\n"} {
		if strings.Contains(summary, banned) {
			t.Fatalf("markdown survived: %q", summary)
		}
	}
}
