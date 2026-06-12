# Remediation Roadmap — June 2026

**Date:** 2026-06-10
**Status:** Approved by project lead 2026-06-10. Living document — update checkboxes and the log as work lands across sessions.
**Source audit:** [`docs/audit/2026-06-10-security-quality-review.md`](../audit/2026-06-10-security-quality-review.md)
**QA checklist:** [`docs/plans/2026-06-10-qa-checklist.md`](./2026-06-10-qa-checklist.md)

> **How to use this across sessions:** each unit below is sized to one working session. Before starting a unit, read its "Pre" note. After finishing, tick the boxes, run the matching section of the QA checklist if marked **QA**, append a line to the Progress Log at the bottom, and commit. Branch names are fixed so a future session can `git checkout` and continue.

> **▶ Recommended next step (as of 2026-06-12): Unit 2 — `feat/localization-review-tier`** (or Unit 3 — `feat/assignment-enforcement`; both are now unblocked).
> Unit 0 (security hotfixes, merged in #102) and Unit 1 (`content-restore`,
> code-complete) are done — work is now reversible after apply, in-app. Manual
> QA checklists §0 and §1 still need a pass on a running server. Unit 2 brings
> Pass 2 (localization) up to Pass 1's review/four-eyes parity (the
> student-facing asset currently has no second reviewer); Unit 3 turns chapter
> assignment into a real boundary and depends on Unit 0.3 (now landed). A small
> standalone quick-win also exists (see Unit 4): a "rebuild" affordance when a
> faithful file is deleted but its edits are marked applied.

---

## Sequencing overview

| Order | Branch | Theme | Depends on | QA gate |
|-------|--------|-------|------------|---------|
| 0 | `main` (via `claude/codebase-security-quality-review-hv5af4`) | Hotfix: 4 immediate, low-risk fixes | — | **Yes** |
| 1 | `feat/content-restore` | Make work reversible after apply | Hotfix #2 (book-scope) | **Yes** |
| 2 | `feat/localization-review-tier` | Pass 2 checks & balances | Branch 1 patterns | **Yes** |
| 3 | `feat/assignment-enforcement` | Make chapter assignment a real boundary | Hotfix #3 (authz) | **Yes** |
| 4 | `feat/editor-ux-dejargon` | De-jargon editor surfaces + concurrency parity | — (parallel) | Yes |
| 5 | `chore/defense-and-housekeeping` | Defense-in-depth + cleanup | — (parallel) | Light |

Rationale: ship the integrity/security hotfixes first (two of them also harden the workflow); then reversibility (Branch 1) because it is the weakest link in governance and the data already exists; then the multi-editor/multi-book safety (Branches 2–3); then UX and housekeeping polish in parallel.

---

## Unit 0 — Hotfix to `main`

**Branch:** `claude/codebase-security-quality-review-hv5af4` → PR to `main` (draft).
**Pre:** no schema changes; keep each fix in its own commit so they can be reverted independently.
**QA:** run QA checklist §0 before merge.

- [x] **0.1 — Preview path traversal (F1).** Add `validateModule` middleware to the `/:book/:chapter/:moduleId/preview` route; validate `track` against `VALID_TRACKS` (400 on miss). `server/routes/segment-editor.js:992`.
- [x] **0.2 — Render restore-on-failure (F3).** In the failure cleanup loop, restore each file's `.backup.*` instead of `unlink`; only delete files that had no prior version. Fix the misleading error message. `tools/cnxml-render.js:3685`.
- [x] **0.3 — Book-scope head-editor endpoints (F2).** Replace bare `requireRole(HEAD_EDITOR)` with a per-book ownership check (admin bypasses) on approve/reject/discuss/unapprove/complete/apply/apply-and-render/apply-all in `segment-editor.js` and the three `publication.js` endpoints.
- [x] **0.4 — Terminology + page-data escaping (F4, F5).** Wrap `formatSubject`/`formatSource`/`formatStatus` output through `escapeHtml` in `terminology.html`; add `</script>`-safe escaping to the page-data JSON in `cnxml-render.js`.
- [x] Update Progress Log; open/refresh draft PR.

---

## Unit 1 — `feat/content-restore`

**Goal:** answer "is work reversible after apply?" with **yes, in-app.** The snapshot data already exists (`content_versions`); this unit wires the path back. This is the *backward* (rollback to a prior snapshot) complement to the *forward* edit-again shipped 2026-06-12 (#99) — they are independent and both wanted.
**Pre:** branch from `main` *after* Unit 0 merges (needs the book-scope authz). Review `services/contentVersionService.js` and `applyApprovedEdits`. Note the apply model (documented in CLAUDE.md 2026-06-12): `loadModuleForEditing` reads the faithful file as the re-apply baseline, and snapshots are taken before each apply — so restore = write a chosen snapshot back as the faithful file, then it becomes the baseline for the next apply.
**QA:** QA checklist §1.

- [x] **1.1** Add `restoreVersion(book, chapter, moduleId, version, restoredBy)` to `contentVersionService` — writes the snapshot back via `segmentParser.saveModuleSegments`, takes a fresh snapshot first (so restore is itself reversible), emits the existing `version_restored` activity type. *(restoredBy is `{ userId, username }`; returns `{ restoredVersion, snapshotVersion, segmentsRestored, segmentsKept, segmentsSkipped, savedPath }`.)*
- [x] **1.2** Endpoint `POST /:book/:chapter/:moduleId/restore/:version`, book-scoped head-editor (`requireHeadEditor()` from Unit 0), behind a `{ confirm: true }` flag; 400 on bad/unconfirmed, 404 on unknown version.
- [x] **1.3** UI: "Saga útgáfa" button in the head-editor apply panel opens a modal listing versions (version · segment-count · who · when) with a "Færa í þessa útgáfu" (revert) action behind a confirm. *Note: the roadmap assumed an existing version-history view; none was wired in the segment editor (the `/versions` endpoints were unsurfaced), so a minimal one was built.*
- [x] **1.4** Decision: **not implementing git-per-apply this unit.** Rationale: in-app reversibility is now fully covered by `content_versions` + restore; an out-of-band git trail is redundant with `scripts/git-backup.sh` (2h cron already commits `books/` to `main`), and reviving the dead `gitService` (F22) would add risk for little gain. Revisit only if an auditor needs per-apply commit granularity. (F22 cleanup stays in Unit 5.6.)
- [x] **1.5** Tests: restore round-trip, restore-then-restore, restore of a module whose extraction changed (orphan ids skipped, unsnapshotted ids kept), plus unknown-version error. `server/__tests__/contentVersionService.test.js` (4 tests).

---

## Unit 2 — `feat/localization-review-tier`

**Goal:** bring Pass 2 to parity with Pass 1 so the *student-facing* asset gets a second pair of eyes.
**Pre:** mirror the Pass 1 state machine (`segment_edits` → `module_reviews`); reuse the four-eyes guard.
**QA:** QA checklist §2.

- [ ] **2.1** Schema/migration: localization edit/review tables (or extend existing) with submit → approve/reject states.
- [ ] **2.2** Snapshot-before-save for localized content (parity with F10 mitigation).
- [ ] **2.3** Four-eyes guard on localization approval (reuse `approveEdit` self-check pattern).
- [ ] **2.4** UI: submit/approve/reject in the localization editor; surface in the review queue.
- [ ] **2.5** Decision to record: does the lead want Pass 2 review *mandatory* or *opt-in per book*? Default proposal: opt-in toggle, off initially.

---

## Unit 3 — `feat/assignment-enforcement`

**Goal:** make "assign batches of chapters to editors" an actual access boundary.
**Pre:** depends on Unit 0.3 (book-scope) landing. Read `userService.hasChapterAccess` (F14) and `requireBookAccess`.
**QA:** QA checklist §3.

- [ ] **3.1** Flip `hasChapterAccess` from fail-open to default-deny, gated by a per-book `enforce_assignments` toggle (so existing books keep working until the lead opts in).
- [ ] **3.2** Fail-closed on missing assignment table (log + 503, not allow).
- [ ] **3.3** Lead dashboard: per-book assignment grid with progress + SLA (extend existing `/api/admin/assignments/:book`).
- [ ] **3.4** Migration + admin toggle UI for `enforce_assignments`.
- [ ] **3.5** Tests: assigned editor can edit assigned chapter only; unassigned blocked when enforcement on; admin/head-editor unaffected.

---

## Unit 4 — `feat/editor-ux-dejargon` (parallel)

**Goal:** editor-facing surfaces speak chapter/section/title; pipeline nouns move behind an admin view.
**QA:** QA checklist §4.

- [ ] **4.1** Replace `module=mNNNNN` and stage/track jargon in editor URLs and the editor header with human chapter/section/title.
- [ ] **4.2** Gate the 8-stage pipeline view + tracks to admin/lead role.
- [ ] **4.3** Add an optimistic-concurrency token to the segment editor save (parity with localization 409, F13).
- [ ] **4.4** Quick pass over labels for translator-jargon vs chemistry-teacher vocabulary (cross-ref the May-2026 workflow audit).
- [ ] **4.5** (Quick-win, can do standalone) "Rebuild" affordance when a faithful file is missing but its edits are marked applied. Today `getApplyStatus` only counts `applied_at IS NULL` edits, so the apply button stays greyed and recovery needs a manual `applied_at=NULL` reset (surfaced 2026-06-12 during the m68700 recovery). Surface a rebuild action — or have `getApplyStatus` report file-existence and re-enable apply — that calls the existing `applyApprovedEdits` self-heal (it resets `applied_at` and re-applies when the file is gone).

---

## Unit 5 — `chore/defense-and-housekeeping` (parallel)

**Goal:** defense-in-depth and latent-bug cleanup. Each item is independent; cherry-pick per session.

- [ ] **5.1** Auth middleware on view routes (F12) — server-side gate before serving `/admin` etc.
- [ ] **5.2** CSRF decision (F11): document SameSite=strict as the deliberate control *or* add tokens; standardize `fetch` credentials mode.
- [ ] **5.3** Migration startup hardening (F21) — wrap legacy `migrate()` in try/catch like the modern path.
- [ ] **5.4** Singleton DB handle in `pipeline-status.js` GET (F23).
- [ ] **5.5** Prune `moduleLocks` Map; add `requireBookAccess` to `/log` (F23).
- [ ] **5.6** Delete or fix dead `gitService` (F22) — coordinate with Unit 1.4 decision.
- [ ] **5.7** Remaining tool-layer lows: F7, F8, F9, F15, F16, F17, F18, F19, F20, and the `repairSegTags` fuzzy-match (F23). Batch as small independent commits.

---

## Progress log

| Date | Session | Unit/item | Notes |
|------|---------|-----------|-------|
| 2026-06-10 | review | audit + roadmap | Findings documented; roadmap approved by lead. No code changed yet. |
| 2026-06-10 | ci-restore | pre-unit infrastructure | PRs #91–#93 merged: xmldom 0.9 fix (injection pipeline un-broken), fresh-DB migration bootstrap (e2e suite green after 3.5 months red; terminology specs aligned with redesign; 2 production bugs fixed along the way), xlsx→SheetJS 0.20.3 + qs bump (audit check green). All five CI checks green — the e2e suite is now a usable QA gate for Units 0–5. No unit items started yet. |
| 2026-06-12 | unit-1 | Unit 1 (`feat/content-restore`) | Built on the merged Unit 0 (book-scope authz). **1.1** `contentVersionService.restoreVersion` — snapshots current content as a fresh version first (restore is itself reversible), then rebuilds the faithful file from the chosen snapshot *aligned to the current extraction* (restores matching ids, keeps current-only ids, skips orphan snapshot ids), and emits the previously-dead `version_restored` activity. **1.2** `POST …/restore/:version`, book-scoped head-editor, `{confirm:true}` guard. **1.3** "Saga útgáfa" modal in the editor's head-editor apply panel (no version-history UI existed before). **1.4** decided **against** git-per-apply (redundant with the 2h git-backup cron; avoids reviving dead `gitService`). **1.5** +4 unit tests (round-trip, restore-then-restore, extraction-changed, unknown-version). Full suite 1132 green; lint/prettier clean. Manual QA §1 still to be walked on a server. Developed on `claude/peaceful-meitner-g5nbdi` (session-pinned branch) rather than the roadmap's suggested `feat/content-restore`. |
| 2026-06-12 | unit-0 | Unit 0 (hotfix) | All four fixes landed on `claude/peaceful-meitner-g5nbdi`. **0.1**: `validateModule` + `VALID_TRACKS` guard on the preview route (path traversal via `track`/`moduleId` now 400s). **0.2**: render failure now restores each file's newest `.backup.*` (rename = restore + consume) and only unlinks brand-new partials; error message reports restored/removed counts instead of the old false "previous versions are intact". **0.3**: book-scoped authz — new `requireHeadEditorFor(resolveBook)` middleware resolves the owning book from `:editId`/`:reviewId` for approve/reject/discuss/unapprove/complete; `requireHeadEditor()` (now param-configurable) on apply/apply-and-render/apply-all and the three `publication.js` `:bookSlug` endpoints; admin still bypasses. **0.4**: `formatSubject`/`formatSource`/`formatStatus` wrapped in `escapeHtml`; new `escapeJsonForScript` (`<`→`<`) applied at all four page-data `<script>` sites. +15 unit tests (12 middleware, 3 escape); full suite 1128 green, lint clean. Manual QA checklist §0 still to be walked on a running server. |
| 2026-06-12 | editorial-flow | pre-unit (reactive) | Triggered by a real "Vista + Birta" failure on m68700. PRs #95–#99 merged: content-publish flow auto-trigger + `translation-errors.json` backup (#95); segment-parser dropped-segment bug + phase-aware apply errors (#96); flaky e2e dropdown test (#97); MT marker normalization/detection (#98); **edit-again** — revise published segments (#99, the *forward-editing* complement to Unit 1). Surfaced two follow-ups (see Unit 1 pre-note and Unit 4): missing-file rebuild affordance; and the apply model is now documented (faithful is the re-apply baseline). Not formal-unit work, but clears editorial-UX debt ahead of Units 3–4. |
