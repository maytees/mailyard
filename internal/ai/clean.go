package ai

import (
	"regexp"
	"strings"
)

var (
	// "On Mon, Jan 2, 2026 at 3:04 PM, Ann <a@x> wrote:" and variants.
	attributionRe = regexp.MustCompile(`(?i)^on .{0,120}wrote:\s*$`)
	// The RFC 3676 signature delimiter is exactly "-- " (trailing space
	// often stripped in transit, so accept both).
	sigDelimiterRe = regexp.MustCompile(`^--\s?$`)
	mobileSigRe    = regexp.MustCompile(`(?i)^sent from my `)
	blankRunsRe    = regexp.MustCompile(`\n{3,}`)
)

// CleanBody strips the parts of an email body that drown a model in noise:
// quoted reply chains ("> …" plus their attribution line), the signature
// block, and mobile-client taglines. Without this, a five-message thread
// shows the model the same text five times and it summarizes the noise.
func CleanBody(text string) string {
	lines := strings.Split(text, "\n")
	kept := make([]string, 0, len(lines))

	for _, line := range lines {
		trimmed := strings.TrimSpace(line)
		if sigDelimiterRe.MatchString(trimmed) {
			break // everything below the delimiter is signature
		}
		if strings.HasPrefix(trimmed, ">") {
			continue // quoted reply chain
		}
		if attributionRe.MatchString(trimmed) || mobileSigRe.MatchString(trimmed) {
			continue
		}
		kept = append(kept, line)
	}

	cleaned := strings.TrimSpace(strings.Join(kept, "\n"))
	return blankRunsRe.ReplaceAllString(cleaned, "\n\n")
}
