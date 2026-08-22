# Mailyard — Full Implementation Plan

Goal: take Mailyard from a mock-data UI prototype to a **daily-drivable, offline-first, AI-assisted unified mail client for macOS**. Every command palette entry works, accounts can be added, mail is real (IMAP/SMTP), AI runs through GoAI, data lives in local SQLite with import/export, and the whole thing is keyboard-driven.

Working agreements for the entire plan:

- **Incremental commits** in the existing style (`feat:`, `misc:`, `fix:`, `style:`, `test:`, lowercase, short). Each phase is 2–6 commits, each leaving the app bootable (`wails3 dev` works, `pnpm typecheck` + `pnpm lint` + `go build ./...` + `go test ./...` pass).
- **Read docs before using anything**: shadcn (base-luma/Base UI variants — NOT Radix examples), GoAI guide/providers/streaming, go-imap v2, Wails v3 alpha (services, events, dialogs, notifications — verify against the actual `alpha2.117` module source since alpha docs drift).
- **UI consistency**: reuse existing tokens (OKLCH vars, mailbox accent palette, rounded-4xl language, hugeicons, motion for animation, Kbd chips from the registry). No new visual idioms.
- **Code organization**: Go logic in `internal/` packages, thin Wails service structs on top. Frontend logic in `lib/`/`stores/`, presentational components thin.
- **Secrets never touch the DB**: IMAP/SMTP passwords and AI API keys go in the macOS keychain.

---

## Library choices (decided)

| Concern | Choice | Why |
|---|---|---|
| SQLite | `modernc.org/sqlite` (pure Go) | no extra CGO burden on top of Wails; FTS5 included |
| IMAP | `github.com/emersion/go-imap/v2` | de-facto standard, IDLE + SPECIAL-USE support, has a memory server for tests |
| MIME parse/build | `github.com/emersion/go-message` | pairs with go-imap; handles multipart, encodings |
| SMTP | `github.com/emersion/go-smtp` (client) | same family |
| HTML sanitize | `github.com/microcosm-cc/bluemonday` | battle-tested allowlist sanitizer |
| Keychain | `github.com/zalando/go-keyring` | macOS Keychain now, cross-platform later |
| AI | `github.com/zendev-sh/goai` | user-specified; Anthropic provider default (`claude-sonnet-5`), provider/model configurable |
| Frontend tests | `vitest` + `@testing-library/react` + `jsdom` | standard for Vite; bindings mocked |

Auth model: **IMAP/SMTP with app passwords** (Gmail/iCloud require an app password with 2FA; presets link to the provider help page). OAuth (Gmail XOAUTH2 / Microsoft) is explicitly a post-goal stretch — it's a large lift and app passwords make the client usable today.

---

## Phase 0 — De-template & housekeeping

The repo still carries template scars that get more expensive to fix later.

- Rename Go module `changeme` → `mailyard`; regenerate bindings (new path `frontend/bindings/mailyard/…`), update the `~/bindings/changeme/…` imports (bootstrap.ts).
- Fix `justfile generate` to target `frontend/bindings` (the live dir); delete the stale `frontend/src/bindings/` tree.
- Delete the committed 15 MB `changeme` binary; add it (and `mailyard`) to `.gitignore`.
- Remove `greetservice.go` and the per-second `time` demo event/goroutine.
- Fix `build/config.yml` metadata (product identifier, description, author) and rerun `wails3 task common:update:build-assets`; set `index.html` title to "Mailyard" + `logo.svg` favicon.
- Add `vitest` + testing-library dev deps and a `pnpm test` script (empty suite for now).

Commits: `misc: rename go module to mailyard` · `misc: remove template leftovers & committed binary` · `misc: fix bindings generation & app metadata` · `misc: add vitest scaffolding`
Verify: splash handshake still reveals, typecheck/lint/build green.

## Phase 1 — Data layer (SQLite)

`internal/store` package.

- DB at `~/Library/Application Support/Mailyard/mailyard.db`; embedded, versioned SQL migrations (`schema_version` in a `meta` table).
- Schema:
  - `accounts(id, email, display_name, color, imap_host, imap_port, smtp_host, smtp_port, username, auth_kind, created_at)`
  - `folders(id, account_id, name, role, uidvalidity, uidnext, last_synced_at)` — role ∈ inbox/sent/drafts/archive/trash/spam/other
  - `messages(id, account_id, folder_id, uid, message_id, thread_id, subject, from_name, from_email, to_json, cc_json, date, snippet, is_unread, is_starred, is_answered, has_attachments, size)`
  - `message_bodies(message_id, text_body, html_sanitized)`
  - `attachments(id, message_id, filename, mime_type, size, content_id, data BLOB NULL)` — content lazily fetched
  - `ai_artifacts(id, kind, ref_id, content, model, created_at)` — summaries, triage labels, etc.
  - `settings(key, value)`
  - `messages_fts` — FTS5 over subject/from/body, maintained by triggers
- Query API: unified/filtered message lists (account, folder role, pagination), thread fetch, unread counts, flag updates, upserts keyed on (account, folder, uid).
- Threading: `References`/`In-Reply-To` chain walk, fallback normalized-subject + participants.
- Boot integration: `BootService.ServiceStartup` opens DB + migrates (fulfilling its own comment); add a `cache` boot gate in `bootstrap.ts`.

Commits: `feat: sqlite store with migrations & fts` · `feat: open database during boot` · `test: store queries, threading, migrations`
Tests: migration idempotency, CRUD, FTS ranking, threading fixtures.

## Phase 2 — Accounts & onboarding

- `internal/secrets`: keychain wrapper (service `sh.mailyard`, key per account id / `ai-api-key`).
- `AccountService` (Wails): `AddAccount` (validates by real IMAP login before saving), `ListAccounts`, `UpdateAccount`, `RemoveAccount` (purges data + keychain).
- Provider presets: Gmail, iCloud, Outlook, Fastmail, Custom — prefilled hosts/ports, help link for app passwords.
- Frontend:
  - **Add Mailbox dialog** (shadcn Dialog + InputGroup): preset picker, email/password, accent color picker from the 17 `--color-mailbox-*` tokens, live "testing connection…" state. Wired to the sidebar button, `alt+shift+m`, and the palette command.
  - Account rail becomes DB-driven — delete the duplicated hardcoded arrays in `mailbox-list.tsx` and `mockMail.ts` (single source: an `accounts` zustand store fed by bindings).
  - **Onboarding empty state**: no accounts → centered welcome card (logo, one-line pitch, Add Account button) instead of the mail panes.

Commits: `feat: account service & keychain storage` · `feat: add mailbox dialog with provider presets` · `feat: onboarding empty state` · `test: account crud with fake keychain`

## Phase 3 — IMAP sync engine

`internal/mail`, started **after reveal** (honoring the existing comment contract).

- Per-account connection manager (go-imap v2); folder discovery via SPECIAL-USE with name-based fallback.
- Initial backfill: last **90 days, capped 500 msgs/folder** (settings-tunable) — envelopes + snippets first, bodies for the most recent eagerly, the rest fetched on open.
- MIME → `text_body` + bluemonday-sanitized HTML + attachment metadata (blobs lazy).
- Incremental sync: `UIDVALIDITY`/`UIDNEXT` deltas; **IMAP IDLE** on each inbox for push; periodic poll (default 5 min) elsewhere; reconnect with backoff.
- Outbound flag ops: read/unread, star, delete→Trash, archive→Archive (server move + local update).
- Events to frontend: `mail:changed {accountId, folderRole}`, `sync:status {accountId, state, error?}` (registered typed events).

Commits: `feat: imap sync engine` · `feat: mime parsing & html sanitization` · `feat: imap idle & incremental sync` · `test: sync against in-memory imap server, parser fixtures`

## Phase 4 — Real mail in the UI

- `MailService`: `ListMessages({accountId?, folderRole, limit, offset})`, `GetThread(threadId)` (+ mark-read), `GetUnreadCounts()`, `FetchBody(messageId)`.
- `stores/mail.ts` grows into the real store: message page cache, active account filter, active folder, active message; refetches on `mail:changed`; infinite scroll in `MailList`.
- Wire **account filtering**: rail selection + `mod+1..9` + "All accounts"; header title reflects the filter; unread badges on rail items; real "N unread" in the pane header (replacing the hardcoded "3 unread").
- **Folder navigation**: palette "Go to Inbox/Drafts/Sent/Archive/Trash" become real (folder switcher in pane header).
- Real time formatting: relative (`2h`, `Mon`, `Jul 3`) via `Intl`, absolute on tooltip.
- **Mail view rendering**: sanitized HTML inside an isolated shadow root with a typography reset matching the design system; **remote images blocked by default** with a "Load images" pill (per-sender remember option); plain-text fallback reuses the current block renderer's aesthetic. Attachment cards: save (Wails save dialog) and open.
- Delete `mockMail.ts` (fixtures move into tests). `MailView` resolves messages from the store, not the module.

Commits: `feat: live mail list & unread counts` · `feat: html mail rendering with image blocking` · `feat: account & folder filtering` · `feat: attachment saving` · `misc: remove mock data`
Test checkpoint: add one seeded demo-account path used by vitest store tests.

## Phase 5 — Mail actions, compose, send

- Actions with optimistic UI + event reconciliation: archive (`e`), delete (`#`), toggle read (`u`), star (`s`) — palette + hotkeys + hover row actions.
- `SendService`: go-smtp + go-message builder (multipart, attachments, threading headers on replies); sent mail appended to the server Sent folder.
- **Compose**: right-side shadcn Sheet — From (account selector), To/Cc/Bcc chips, subject, body textarea, attachment picker (Wails open dialog), `mod+enter` send. Wired to sidebar Compose, `alt+c`, palette.
- Reply (`r`) / Reply-all (`a`) / Forward (`f`): prefill with quoted original; the dead buttons in `MailView` come alive.
- **Drafts**: autosave (debounced) to local Drafts + IMAP APPEND; reopen from Drafts folder.
- Toasts (shadcn sonner) for send/sync errors; archive/delete get a 5-second local **Undo** toast.
- Snooze: **local-only** (hidden until a chosen time, palette + `h`) — no server support needed. If it fights the schedule, it's the designated cut line of this phase.

Commits: `feat: mail actions with optimistic updates` · `feat: smtp send & compose sheet` · `feat: reply, reply-all, forward` · `feat: drafts autosave` · `feat: undo toast & local snooze`
Tests: MIME builder round-trip, action reducer transitions.

## Phase 6 — Search

- `SearchService.Search(query, accountId?)` over FTS5 with rank + snippet highlights.
- Palette "Mail" group becomes live: debounced backend query replacing `mockEmails`; Enter opens the message; keeps the existing `Highlight` treatment.
- Nice-to-have (only if cheap): `from:` / `in:` prefix filters parsed client-side.

Commits: `feat: full-text search via palette`

## Phase 7 — Keyboard-driven UX

- **Sequence engine** in `lib/keyboard.ts`: `g+i`-style two-step chords (1s window, canceled by editable targets/other keys), fixing the current matcher that would misfire on bare `g`. Optional tiny pending-key indicator (bottom corner).
- **List navigation**: `j`/`k` next/prev with scroll-into-view, `enter`/`o` open, `g+i/d/t/a/s` folder jumps.
- Wire every advertised shortcut: `mod+1..9` accounts, `alt+c` compose, `.` AI menu, `mod+shift+s` summarize, `alt+shift+m` add mailbox.
- **Shortcut help overlay on `?`**: auto-generated from the command registry (groups + Kbd chips) — this also kills tooltip drift; make `theme-toggle`/`mail-pane` tooltips read shortcuts from the registry instead of hardcoding.
- Registry gains optional `enabled()` so context commands (reply, archive) only fire with an active message.

Commits: `feat: shortcut sequence engine` · `feat: j/k list navigation` · `feat: shortcut help overlay` · `misc: tooltips read shortcuts from registry`
Tests: sequence engine timing/cancel/editable-guard unit tests (vitest).

## Phase 8 — AI via GoAI

`internal/ai` + `AIService`. Provider factory from settings (default **Anthropic `claude-sonnet-5`**; OpenAI/Google/Ollama selectable), API key from keychain. Streaming to the UI via per-request events (`ai:stream:{id}` chunk/done/error) driving a shared streaming-text hook with a subtle shimmer.

All seven palette AI commands become real:

1. **Summarize thread** (`mod+shift+s`, palette, un-hide the header button): streamed summary card pinned atop the thread; cached in `ai_artifacts`. List-row AI digests (the existing `summary` field's destiny) become an **opt-in setting** — generated in background for incoming inbox mail, snippet fallback otherwise.
2. **Draft reply**: opens compose prefilled, streams a reply drafted from the thread.
3. **Rewrite** (inside compose): concise / friendly / formal variants.
4. **Translate**: language picker → translated body rendered alongside/in place.
5. **Extract action items**: checklist card in the mail view.
6. **Smart triage**: classifies unread inbox (priority/normal/low + one-line reason) via `GenerateObject`; subtle colored dot on rows + palette command to run it.
7. **Suggest unsubscribes**: `List-Unsubscribe` headers + sender frequency → results panel with per-sender unsubscribe links/actions.

- Sidebar AI button + `.` opens the palette pre-navigated to the AI group (cmdk pages).
- Graceful "no API key" state deep-linking to settings.

Commits: `feat: goai integration & streaming ai service` · `feat: summarize thread` · `feat: ai draft reply & rewrite` · `feat: smart triage` · `feat: translate & action items` · `feat: unsubscribe suggestions`
Tests: prompt builders + artifact caching against a stubbed model interface.

## Phase 9 — Settings, import/export

- `SettingsService` + **Settings dialog** (`mod+,`, palette): Accounts (edit/remove), AI (provider/model/key/list-summaries), Sync (interval, backfill window, image loading policy), Appearance (theme/density live via existing stores).
- **Export Data** (palette): `VACUUM INTO` DB snapshot + `settings.json` + version manifest → single `.mailyard.zip` via save dialog. **Secrets are never exported.**
- **Import Data** (palette): validate manifest version, back up current DB, swap, prompt to re-enter passwords (keychain is machine-local), trigger resync.
- **Sync now** command + sync-status indicator (sidebar footer: spinning/ok/error per the `sync:status` events).

Commits: `feat: settings dialog` · `feat: export & import data` · `feat: sync status indicator`

## Phase 10 — Polish & release-readiness

- Motion pass: consistent durations/easings for row selection, pane/folder transitions, palette, compose sheet, toasts — subtle, nothing gratuitous.
- Empty/loading/error states for every surface (skeleton rows during first sync, folder empty states, offline banner).
- macOS **notifications** for new inbox mail — verify the Wails v3 alpha2.117 notifications API first; if absent/broken, cut without ceremony.
- Branding: real app icon (`build/appicon` + regenerate), Info.plist metadata, `wails3 package` produces a working ad-hoc-signed `.app`.
- Docs: rewrite `README.md` (features, setup, app-password guides per provider), add `CLAUDE.md` (conventions, gotchas, architecture map).
- Final QA: scripted pass over every palette command and shortcut with a real account; fix what falls out.

Commits: `style:`/`fix:`/`misc:` series + `docs: readme & claude.md`

---

## Consolidated essentials checklist (beyond the 4 pillars)

The user-visible bar for "ready to use":

- [ ] Onboarding empty state + add-account flow with presets & connection test
- [ ] HTML email rendering (sanitized, remote images blocked by default)
- [ ] Attachments: list, save, open; attach on compose
- [ ] Compose / Reply / Reply-all / Forward / Drafts / real SMTP send
- [ ] Archive, delete (→Trash), star, read/unread — synced to server, with Undo
- [ ] Folder navigation (Inbox/Sent/Drafts/Archive/Trash) + per-account filtering + All-accounts unified view
- [ ] Live unread counts (rail badges + header), real relative timestamps
- [ ] Full-text search from the palette
- [ ] j/k navigation, g-sequences, `?` shortcut overlay, every advertised chip actually bound
- [ ] All 7 AI commands + streaming UI + AI settings
- [ ] Settings dialog (accounts, AI, sync, appearance)
- [ ] Import/export data via palette
- [ ] Sync-now + visible sync status + error toasts
- [ ] Local snooze (cut-line item)
- [ ] App icon, metadata, packaged .app, rewritten README

**Post-goal stretch (explicitly out)**: OAuth (Gmail/Microsoft), rich-text compose, undo-send delay, cross-platform keychain/builds, JMAP.

## Testing strategy

- **Go**: `go test ./...` per phase — store/migrations/threading, MIME parser fixtures (multipart, encodings, HTML, attachments), sync engine against go-imap's in-memory server, MIME builder round-trips, AI prompt/caching with stubbed model.
- **Frontend**: vitest + testing-library — stores, sequence engine, command registry, compose logic; Wails bindings mocked at the module boundary.
- **Manual gate per phase**: `wails3 dev` smoke (boot → list → read → act) before the phase's final commit.
- **Constraint respect**: strict TS (`erasableSyntaxOnly`, unused = build error), format only touched files, match surrounding style.

## Assumptions made (flag now if wrong)

1. **App-password IMAP/SMTP auth** is acceptable for v1 (OAuth is stretch).
2. **Anthropic is the default AI provider** (`claude-sonnet-5`), with provider/model switchable in settings; key supplied by you at runtime.
3. **Module rename `changeme` → `mailyard`** happens in Phase 0 (breaks binding paths once, cheap now, painful later).
4. "Import/export to move easily across" is interpreted as **across machines** — a portable data archive.
5. `mockMail.ts` is fully deleted once Phase 4 lands (test fixtures preserve the shapes).
6. Backfill default: 90 days / 500 messages per folder, tunable in settings.
