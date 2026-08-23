# Mailyard — notes for AI assistants

Wails v3 (alpha) desktop mail client: Go backend, React 19 frontend. Read this before editing.

## Architecture

- `main.go` — window/splash wiring; services registered here share the store via `BootService`.
- Root `*service.go` files — thin Wails services (their exported methods become TS bindings). Logic lives in `internal/`.
- `internal/store` — SQLite (pure-Go driver), embedded migrations in `migrations/NNNN_*.sql`, FTS5 kept in sync transactionally (no triggers). Threading by References/In-Reply-To with angle-bracketed ids.
- `internal/mail` — IMAP sync engine (per-account workers, IDLE + poll, UIDNEXT incremental, flag reconciliation), MIME parse (bluemonday-sanitized HTML), SMTP send, server-side drafts, cached action connections.
- `internal/ai` — GoAI wrapper; streams over the `ai:stream` event; artifacts cached in `ai_artifacts`. Prompt defaults are markdown files in `internal/ai/prompts/` (user-overridable via settings). **Any AI feature work must follow `internal/ai/PROMPTING.md`** — the user's prompt-design guide (tagged untrusted content, examples, abstention, injection layers, caching order, temp policy).
- `internal/accounts` / `internal/secrets` — account lifecycle; all credentials in the OS keychain (service `sh.mailyard`), never in SQLite.
- Frontend: zustand stores in `src/stores` (module-level idempotent `init*Store()` guarded by a boolean), command registry in `src/lib/command.ts` (single source for palette, hotkeys, tooltips and the `?` overlay).

## Invariants — do not break

- **Boot handshake**: frontend attaches the `backend:ready` listener *before* calling `IsBackendReady()`; Go emits after setting the flag; reveal is `sync.Once` with a 10s failsafe. The splash window loads `/splash.html`, never `/`.
- `splash.html` hardcodes mirror copies of theme tokens from `index.css` — update both together.
- IMAP sync starts only **after reveal** (see `reveal()` in main.go).
- Bindings live in `frontend/bindings/` (the `~` alias). Regenerate with `just generate` after changing Go services or registered events. Never edit generated files.
- The palette's fake search input opens on **click**, not focus (mousedown/mouseup dismissal race).
- Shortcut strings: chords like `mod+shift+s`; two plain keys like `g+i` are *sequences* (g, then i) handled by `advanceSequence`. `matchesShortcut` refuses sequences by design.
- `.gitignore`'s `/mailyard` entry is root-anchored on purpose (a bare `mailyard` would ignore `frontend/bindings/mailyard/`).

## Conventions

- Commits: lowercase `feat:` / `fix:` / `misc:` / `style:` / `lint:` / `test:` / `docs:`, short subjects.
- TS is strict with `erasableSyntaxOnly` + `verbatimModuleSyntax` + `noUnusedLocals`: no enums, `import type` required, unused symbols fail the build.
- Formatting is inconsistent on purpose-ish: match the file you're in; never run repo-wide formatters.
- UI stack: shadcn **base-luma** (Base UI, not Radix), **hugeicons** (not lucide), zustand, motion, cmdk, sonner. Base UI uses `render={<el/>}` instead of `asChild`.
- Colors: the 17-entry mailbox accent palette (`--color-mailbox-*` in index.css, `src/lib/mailbox-colors.ts`).
- Gates before every commit: `go vet ./... && go test ./internal/...` and `cd frontend && pnpm typecheck && pnpm lint && pnpm test && pnpm build`.

## Testing

- Sync engine tests run against go-imap's in-memory server; send tests against an in-process go-smtp capture server. Message-ID fixtures need an `@domain` or go-message drops them.
- Frontend: vitest + jsdom (`src/**/*.test.ts`).
- Manual smoke: `wails3 task build && ./bin/mailyard`.
