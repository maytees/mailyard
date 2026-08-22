package ai

import (
	"regexp"
	"strings"
)

var (
	codeFenceRe  = regexp.MustCompile("(?s)```.*?```")
	linkRe       = regexp.MustCompile(`\[([^\]]*)\]\([^)]*\)`)
	headingRe    = regexp.MustCompile(`(?m)^\s*#{1,6}\s*`)
	bulletRe     = regexp.MustCompile(`(?m)^\s*(?:[-*•]|\d+[.)])\s+`)
	ruleRe       = regexp.MustCompile(`(?m)^\s*(?:-{3,}|\*{3,}|_{3,})\s*$`)
	emphasisRe   = regexp.MustCompile(`(\*\*|__|\*|_{1})`)
	preambleRe   = regexp.MustCompile(`(?i)^(here'?s?\s+(is\s+)?(a\s+|the\s+)?[^:]{0,60}:\s*)`)
	whitespaceRe = regexp.MustCompile(`\s+`)
)

// SanitizeSummary flattens whatever a model produced into the plain prose the
// summary UI expects: markdown stripped, preamble dropped, whitespace
// collapsed, and hard-capped at maxWords. Belt-and-suspenders — small local
// models decorate output no matter what the prompt demands.
func SanitizeSummary(raw string, maxWords int) string {
	text := codeFenceRe.ReplaceAllString(raw, " ")
	text = linkRe.ReplaceAllString(text, "$1")
	text = headingRe.ReplaceAllString(text, "")
	text = ruleRe.ReplaceAllString(text, " ")
	text = bulletRe.ReplaceAllString(text, "")
	text = emphasisRe.ReplaceAllString(text, "")
	text = preambleRe.ReplaceAllString(strings.TrimSpace(text), "")
	text = strings.TrimSpace(whitespaceRe.ReplaceAllString(text, " "))

	if maxWords > 0 {
		words := strings.Fields(text)
		if len(words) > maxWords {
			text = strings.Join(words[:maxWords], " ") + "…"
		}
	}
	return text
}
