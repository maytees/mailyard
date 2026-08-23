# Mailyard

**Note: this project is heavily vibe coded and not a representation of my software engineering skills, it's just a utility app I needed quickly.**

A unified AI mailbox. One inbox for every account — offline-first, keyboard-driven, with AI woven in.

Built with [Wails v3](https://v3.wails.io) (Go backend) and React 19 / Tailwind v4 / shadcn.

## Features

- **Unified inbox** across any number of IMAP accounts, interleaved and color-coded, with per-account filtering (`⌘1…9`) and folder views (Inbox/Drafts/Sent/Archive/Trash).
- **Offline-first**: everything lives in a local SQLite database. Sync uses IMAP IDLE for push plus polling, with a capped 90-day backfill on first sync (tunable in Settings).
- **Full mail client**: HTML rendering (sanitized, remote images blocked until you allow them), attachments, compose/reply/reply-all/forward with server-side draft autosave, archive/delete with 5-second Undo, star, snooze, mark-all-read.
- **AI everywhere** (bring your own key — Anthropic, OpenAI, Google, or local Ollama):
  - Summarize thread (`⌘⇧S`), streamed into the reading pane and cached
  - Draft reply with AI (`⌘⇧R`), streamed into the composer above the quote
  - Rewrite drafts (concise / friendly / formal), translate, extract action items
  - Smart triage — priority dots on inbox rows
  - Unsubscribe suggestions from `List-Unsubscribe` headers + sender volume
  - Optional AI one-line digests replacing snippets in the list
- **Keyboard-driven**: `⌘K` palette (which is also full-text search over all mail), Gmail-style sequences (`g` then `i/s/d/a/t`), `j/k` navigation, `r/a/f/e/h/s` actions, `?` for the full map.
- **Portable data**: Export/Import from the palette moves your mail database between machines (passwords stay in the macOS keychain and are never exported).

## Setup

```sh
# prerequisites: Go 1.25+, pnpm, wails3 CLI
go install github.com/wailsapp/wails/v3/cmd/wails3@latest

just dev        # development (hot reload)
wails3 package  # build Mailyard.app
```

On first launch, add a mailbox with an **app password**:

- **Gmail**: enable 2FA, then create one at myaccount.google.com/apppasswords
- **iCloud**: account.apple.com → Sign-In and Security → App-Specific Passwords
- **Outlook / Fastmail / anything IMAP**: presets included; custom servers supported

For AI features, open Settings (`⌘,`) and paste an API key for your provider of choice. Keys and mail passwords are stored only in the system keychain.

## Development

Two task runners by design: Wails' embedded `Taskfile.yml` handles build/package; the `justfile` holds the everyday `dev`/`generate` recipes.

```sh
just generate            # regenerate TS bindings after changing Go services
go test ./internal/...   # Go tests (store, sync engine, parser, send, AI)
cd frontend && pnpm test # frontend tests (vitest)
```

See `CLAUDE.md` for architecture notes and conventions.
