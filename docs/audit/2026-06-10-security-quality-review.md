# Security & Code-Quality Review — June 2026

**Date:** 2026-06-10
**Author:** Generated with Claude Code based on review of `server/`, `tools/`, `scripts/` at commit `cdedcf41`
**Scope:** Whole-codebase security + code-quality sweep, with emphasis on the `server/` editorial interface and the tiered (editor → head-editor → applied) workflow it presents. Includes a head-translator assessment of workflow soundness, reversibility, and editor UX.
**Out of scope:** The `-vefur` sister repo, the DB engine and auth provider internals, the Pass 1 / Pass 2 content model as a product decision.
**Companion plan:** [`docs/plans/2026-06-10-remediation-roadmap.md`](../plans/2026-06-10-remediation-roadmap.md)
**QA checklist:** [`docs/plans/2026-06-10-qa-checklist.md`](../plans/2026-06-10-qa-checklist.md)

---

## 1. Executive summary

The pipeline's command-execution layer is uniformly safe — every `spawn`/`execFileSync` uses array arguments with no shell, and inputs are route-validated — so there are **no command-injection findings**. No secrets are committed; `.env` is gitignored. Service-layer SQL uses bound parameters throughout.

The real weaknesses cluster in four areas:

1. **Path handling** — one reachable path-traversal in the live-preview route, plus several latent ones.
2. **Tiered-workflow authorization** — head-editor authority is checked by *role level*, not *book ownership*, so a head-editor of one book can approve/apply/publish another book's content. Chapter assignment is fail-open.
3. **Stored XSS** — a few `innerHTML` sinks interpolate import-controlled DB strings without escaping; the render tool emits page-data JSON that can break out of its `<script>` block.
4. **Reversibility / data-loss** — content snapshots are *taken* before every apply but there is **no path to restore them**; the render tool deletes already-published files on failure without restoring backups.

The single most urgent fix is the preview path-traversal (#1 below). The highest-value *workflow* fix is wiring up content restore (snapshots already exist). Two of the security fixes — render restore-on-failure and book-scoping the head-editor endpoints — are also workflow-integrity fixes.

---

## 2. Method

**Reviewed directly:** `server/index.js`, `server/config.js`, all middleware (`requireAuth`, `requireRole`, `validateParams`), `services/auth.js` + `routes/auth.js`, all 20 route files under `server/routes/`, the core workflow services (`segmentEditorService`, `renderService`, `pipelineService`, `gitService`, `chapterLock`, `userService`, `contentVersionService`), `constants.js`, and the role/edit/stage vocabulary.

**Reviewed via sub-agents (verified in context):** all 28 files in `server/services/`, the frontend (`server/public/js/`, `server/views/`, `routes/views.js`), and the `tools/` + `scripts/` CLI layer including the four Python tools.

---

## 3. Findings by severity

Severity reflects exploitability *and* blast radius for this deployment (small editorial team, authenticated users, academically citable output).

### Critical / High

**F1 — Path traversal in the live-preview render.**
`server/routes/segment-editor.js:992` (route) + `server/services/renderService.js:55-82` (sink).
The `/:book/:chapter/:moduleId/preview` route is the *only* segment-editor route missing the `validateModule` middleware, and `track` comes straight from `req.query.track`. Both flow unsanitized into
`path.join(... '03-translated', track, chapterStr, `${moduleId}.cnxml`)`.
An authenticated editor can set `track=../../../..` and a traversing `moduleId` to read arbitrary `*.cnxml`-suffixed files, returned rendered as HTML.
**Fix:** add `validateModule` to the route; validate `track` against `VALID_TRACKS`.

**F2 — Tiered-workflow authority is level-only, not book-scoped.**
`server/routes/segment-editor.js` (approve / reject / discuss / unapprove / complete / apply / apply-and-render / apply-all); same pattern in `routes/publication.js:131,190,250`.
All use `requireRole(HEAD_EDITOR)`, which checks role *level*, not book ownership. A head-editor assigned to book A can approve, apply, and publish book B — writing another book's `03-faithful-translation/` and triggering its pipeline. The codebase already has `requireHeadEditor()` / `requireBookAccess()` for exactly this scoping; they are simply not applied here.
**Fix:** gate these endpoints on per-book head-editor ownership (admin still bypasses).

**F3 — Failed render deletes already-published files.**
`tools/cnxml-render.js:3685-3697`.
On any mid-pass error the cleanup loop `unlink`s every file written in the pass — including good previous versions `safeWrite` had just overwritten — without restoring the `.backup.*`, while the thrown error claims "Previous versions are intact."
**Fix:** on failure, restore each file's backup rather than unlinking.

### Medium

**F4 — Stored XSS in the terminology list.**
`server/views/terminology.html:1169-1171` (also detail modal ~1289-1305, metadata `<option>` ~1081-1091).
`formatSubject()` / `formatSource()` / `formatStatus()` return raw DB strings (fallback `|| value`) interpolated into `innerHTML` without `escapeHtml`, while the adjacent `term.english` / `icelandic` *are* escaped. `source` / `subjects` are CSV/Excel-import-controlled; `status` also lands unescaped inside a `class="..."` attribute.
**Fix:** wrap all three through `escapeHtml`.

**F5 — `</script>` breakout in embedded page-data JSON.**
`tools/cnxml-render.js:510-511` (same pattern 2677, 2786, 2950).
`JSON.stringify(pageData)` is written into `<script type="application/json">` without escaping `<`. A translated title/term containing `</script><img onerror=...>` injects markup into the published page.
**Fix:** `.replace(/</g, '\\u003c')` on the serialized JSON.

**F6 — Latent SQL injection via column-name interpolation.**
`server/services/bookRegistration.js:817-822`.
`updateSectionStatus` builds `` `${snakeKey} = ?` `` from object keys with no column whitelist, unlike the sibling `userService.updateUser` / `terminologyService` which all whitelist. Not exploitable today (callers pass hardcoded keys); a future caller forwarding request keys would be.
**Fix:** add an allowed-column whitelist.

**F7 — `--update-status` marks chapters complete on partial failure.**
`tools/api-translate.js:713-717`. Filters on `!m.skip` rather than success, so a chapter whose every module *failed* still transitions to `mtOutput: complete`. Corrupts pipeline status silently.

**F8 — Book glossary always dropped in title translation.**
`tools/translate-chapter-titles.js:109-111`. Reads `glossary-unified.json` expecting an array, but the file is `{ ..., terms: [...] }`. The approved terms are silently discarded; "Glossary: 1 terms" is logged as if intended. **Fix:** use `bookTerms.terms`.

**F9 — In-place rewrite of human-reviewed files, no backup, lossy reconstruction.**
`tools/auto-insert-placeholders.js:284-292`. Rebuilds the whole `03-faithful-translation/` file from `<!-- SEG: -->`-matched segments; uncaptured content is discarded, with no `.bak` despite the directory's "backup before editing" convention. Same no-backup pattern in `tools/repair-emphasis.js:330` (lower stakes).

**F10 — FS/DB write not atomic in apply.**
`server/services/segmentEditorService.js:603`. The faithful file is overwritten *inside* a SQLite transaction; a later DB statement throwing rolls back the DB but not the file (mitigated by the content snapshot taken just before).

### Low (hardening / housekeeping)

- **F11 — No CSRF tokens** anywhere; sole defense is `SameSite=strict`. Inconsistent `fetch` credentials modes (`include` vs `same-origin` vs omitted).
- **F12 — View routes serve every page (incl. `/admin`) with no auth** (`routes/views.js`); access control is client-side only (no defense-in-depth).
- **F13 — Segment editor has no optimistic-concurrency token** (`public/js/segment-editor.js:864`) — silent last-write-wins, while the localization editor sends `lastModified` for 409 conflict detection.
- **F14 — Fail-open chapter authorization** (`services/userService.js:535-562`) — `hasChapterAccess` returns `true` when the user has zero assignments *and* when the table is missing.
- **F15 — Path traversal, chapter download** (`routes/books.js:327`) — `chapter` from query into a path; `padStart` is a no-op for long strings (`chapter=../../..` traverses; constrained to zipping `.md`/`.html`).
- **F16 — Unbounded redirect following** (`tools/openstax-fetch.cjs:199`, `services/openstaxFetcher.js:176`) — no depth cap or host allowlist.
- **F17 — Content-derived path names** (`tools/resolve-os-embed.js:80,180`, `cnxml-render.js:115,1976`) — exercise nicknames and URL-decoded image filenames used raw in `path.join`.
- **F18 — GitHub token in argv** (`tools/download-source.js:255,302`) — `Bearer ${token}` as a curl CLI arg, visible via `ps`/`/proc` on a shared host.
- **F19 — No URL-scheme sanitization on links** (`tools/lib/cnxml-elements.js:506-522`; frontend markdown preview) — a `javascript:` URL surviving MT lands in `href`.
- **F20 — EN fallback publishes untranslated content** (`tools/cnxml-inject.js:3117`) — missing IS file → injects EN with only a stderr warning.
- **F21 — Legacy migrations crash boot** (`services/migrationRunner.js:70-79` + `index.js:34`) — legacy `migrate()` calls run without the try/catch that wraps modern `up(db)`.
- **F22 — Dead/broken `gitService`** (`services/gitService.js`) — not imported by any route; its `NEVER_COMMIT` filter is both over- and under-matching. Delete or fix.
- **F23 — Misc:** `localization-editor.js:31` `moduleLocks` Map never pruned; `/log` endpoint skips `requireBookAccess`; `pipeline-status.js` GET opens a fresh DB handle per request instead of the singleton; `repairSegTags` fuzzy match (`api-translate.js:146`) accepts single-digit overlap vs documented ≥80%.

### Verified clean

JWT/OAuth flow and login CSRF state token; all service SQL bound-parameterized incl. generated `IN(...)` placeholders; `spawn`/`execFileSync` injection-safe with validated inputs; `escapeHtml` correctly applied to high-volume content sinks (segment text, feedback, usernames, email templates) and inject-side translated content; atomic write-temp-then-rename in `safeWrite`/`saveModuleSegments`; multi-statement DB writes wrapped in transactions; per-call DB handles closed in `finally`; Python tools use HTTPS + parameterized SQL; no ReDoS on user input; no secrets in localStorage or git.

---

## 4. Head-translator assessment

### 4.1 Workflow soundness & checks and balances

Pass 1 (faithful) is a genuine two-tier system and **four-eyes is actually enforced**: `approveEdit` throws "Cannot approve your own edit" (`segmentEditorService.js:180`). Supporting controls: review queue with SLA aging, per-segment discussion threads, reviewer notes, activity log, 2-hour chapter locks, mtime conflict detection (409).

Structural gaps:
- **Pass 2 (localization) has no review tier at all** — edits save straight to the student-facing `04-localized-content/` with only an audit log.
- **Head-editor authority is not book-scoped** on review/apply/publish (see F2).
- **Chapter assignment is advisory, not enforced** (fail-open, F14) — assigning batches scopes nothing unless every chapter is assigned.
- **Four-eyes creates a solo-lead deadlock** — a single head-editor who also edits cannot advance their own work; plan for ≥2 head-level people or an explicit audited lead-override.

### 4.2 Reversibility

- **Before apply:** fully reversible — delete pending edit, unapprove (pre-apply), reject with notes.
- **After apply:** effectively *not* reversible in-app. `contentVersionService.snapshotModule` *takes* a snapshot before each overwrite and the UI can *view* old versions, but **no endpoint writes a snapshot back** — `version_restored` is a defined activity type that is never emitted. Recovery means hand-editing files or `git revert` out of band, and the in-app git helper is dead code (F22). Localization is worse: in-place overwrite, no snapshot.
- **Active hazard:** F3 destroys published pages on render failure.
- **Stage-level:** admin can `revertStage` (status only, not content) via `pipeline-status.js:163`.

**Bottom line:** reversible up to apply; after that, only someone with shell access can undo it. Closing this is the roadmap's highest-value feature (Branch A).

### 4.3 Editor UX

Strong instincts: the "Today / My Work" view is task-first (current task / up next / changes requested) with plain-Icelandic labels, hiding the pipeline. Three-column EN/faithful/localized editors with keyboard shortcuts and inline terminology lookups are the right model.

Friction for non-CAT subject experts: **pipeline vocabulary leaks into editor surfaces** — module IDs (`mNNNNN`), eight pipeline stages (`mtReady`, `injection`, `rendering`…), and three "tracks" appear in editor-facing URLs and the status dashboard. A chemistry teacher thinks in chapters, sections, and titles. Recommendation: push pipeline nouns behind an admin/lead-only view. Secondary: concurrency inconsistency between the two editors (F13).

---

## 5. Pointer to the plan

The prioritised remediation sequence — one hotfix to `main` plus five feature branches — is maintained as a living checklist in
[`docs/plans/2026-06-10-remediation-roadmap.md`](../plans/2026-06-10-remediation-roadmap.md),
with a hands-on QA checklist to run between steps in
[`docs/plans/2026-06-10-qa-checklist.md`](../plans/2026-06-10-qa-checklist.md).
