# Editing System Full-Scale Audit — Design Spec

**Date:** 2026-03-13
**Goal:** Pre-launch readiness + maintenance housekeeping. Verify the editing system is solid and clean after multiple architectural transitions (file-based → DB, markdown editor → segment editor, old review dashboard → integrated review queue, dual status tracking → unified pipeline status).

**Scope:** All three books (efnafraedi-2e deep, liffraedi-2e representative, orverufraedi representative). Local first, then production spot-check.

**Approach:** Parallel tracks — code integrity audit (automated) and UI/UX walkthrough (mixed automated + manual). Cross-reference findings at the end.

---

## Context

### System Under Test

A translation workflow system for Icelandic OpenStax textbooks with:

- **Two editing passes:** Pass 1 (segment editor — faithful linguistic review with approval workflow) and Pass 2 (localization editor — cultural adaptation, no approval needed)
- **An 8-stage pipeline:** extraction → mtReady → mtOutput → linguisticReview → tmCreated → injection → rendering → publication
- **5 roles:** viewer → contributor → editor → head-editor → admin
- **Three publication tracks:** mt-preview, faithful, localized

### Current Pipeline State

- MT output exists in `02-mt-output/` for all extracted chapters
- MT-preview HTML exists in `05-publication/mt-preview/`
- **No faithful or localized content has gone through the full pipeline yet** — these tracks must be emulated during testing

### Architectural Transitions to Validate

| Old System | New System | Migration |
|---|---|---|
| `edit_history` + `pending_reviews` tables | `segment_edits` + `module_reviews` tables | Migration 008, 021 drops old tables |
| `editorHistory` service + reviews route | `segmentEditorService` + integrated review queue | Dead code archived |
| `status.json` files as source of truth | `chapter_pipeline_status` DB table | Migration 017, status.json is derived cache |
| Single book (`efnafraedi`) | Multi-book (`efnafraedi-2e`, `liffraedi-2e`, `orverufraedi`) | Migration 015-016, filesystem rename |
| File-based status tracking | Unified pipeline status service | `pipelineStatusService.js` |

### Previous Audit Coverage

- 26 issues found and fixed across 5 audit iterations (2026-02-22 through 2026-03-01)
- ~387 automated tests (308 Vitest unit [1 failing — see Known Baseline below] + ~79 Playwright E2E across 10 spec files)
- 59 documented manual test cases (in `editor-test-checklist.md` and `docs/testing/manual-test-plan-editors.md`)
- Dead code cleanup in progress (uncommitted: removes reviews.js, editorHistory.js, reviews.html, update-status.js)

### Known Baseline Issues

- **1 failing Vitest test:** `new-features.test.js` — `runPrepareTm` should throw on missing faithful translation directory but doesn't (directory now exists as untracked content). Pre-existing, not caused by current changes.
- **Migration 021 not yet registered:** `server/migrations/021-drop-dead-tables.js` exists on disk but is NOT listed in `migrationRunner.js`. Must be registered as part of the dead code cleanup commit before this audit begins.

---

## Track 1: Code Integrity Audit

Mostly automated. Claude runs checks and reports findings.

### 1A: Dead Code & Remnant Scan

**Objective:** Verify all references to removed systems are gone from active code.

**Checks:**

1. Search all active (non-archived) JS/HTML files for references to:
   - `edit_history` table name
   - `pending_reviews` table name
   - `editorHistory` service (as require/import)
   - `reviews` route (as require/import, excluding the 301 redirect in views.js)
   - `update-status` script

2. **Prerequisite fix:** Register migration 021 (`drop-dead-tables`) in `migrationRunner.js` so it runs on next startup. This is part of the uncommitted dead code cleanup — it must be committed before the audit begins. Verify it runs without error on a test DB copy.

3. Verify archived files have no inbound references from active code:
   - `server/routes/archived/reviews.js`
   - `server/services/archived/editorHistory.js`
   - `server/views/archived/reviews.html`
   - `scripts/archived/update-status.js`

4. Scan for stale TODO/FIXME/HACK comments that reference completed work or removed features

5. Check `package.json` scripts for references to removed files

**Pass criteria:** Zero references to removed systems in active code. Migration 021 registered and runnable.

### 1B: Schema & Data Flow Consistency

**Objective:** Verify database schema, code references, and data flow chains are consistent.

**Checks:**

1. **Table coverage:** Map every SQL table name referenced in active `server/services/` and `server/routes/` code → verify each exists in a migration's `up()` function

2. **Import integrity:** Map every `require()` in active `server/` code → verify the target file exists on disk

3. **Pass 1 data flow chain:**
   - `saveSegmentEdit()` → writes to `segment_edits` table
   - `submitModuleForReview()` → writes to `module_reviews` table
   - `approveEdit()` / `rejectEdit()` / `markForDiscussion()` → updates `segment_edits` status
   - `completeModuleReview()` → updates `module_reviews` status, calls `applyApprovedEdits()`
   - `applyApprovedEdits()` → reads approved edits, writes faithful file, sets `applied_at`, auto-advances pipeline status
   - Verify no gaps in this chain (missing error handling, silent failures, unchecked return values)

4. **Pass 2 data flow chain:**
   - Localization editor save → writes file to `04-localized-content/`
   - Save handler → logs to `localization_edits` table
   - Verify audit trail is complete (no save without log)
   - **File format consistency:** Verify localized segment files use the same markdown format as faithful files (both must be parseable by `cnxml-inject.js` via the same `parseSegments()` function)

5. **Pipeline status source of truth:** Search for code that reads `status.json` as primary data source (should only be read as fallback/cache, never as authoritative)

6. **Activity logging completeness:** Verify all editor actions (save, submit, approve, reject, discuss, apply) log to `activity_log` table

**Pass criteria:** All chains complete with no gaps. No orphaned table references. Pipeline status reads from DB first.

### 1C: Cross-Book Data Isolation

**Objective:** Verify multi-book support doesn't leak data between books.

**Checks:**

1. **DB query scoping:** Every query in `segmentEditorService.js`, `localizationEditService.js`, `pipelineStatusService.js`, and route files that returns book-specific data must filter by `book_slug` or `book`

2. **File path scoping:** All file read/write operations in editor routes and services use the book parameter in path construction (no hardcoded `efnafraedi-2e`)

3. **Review queue isolation:** `getPendingModuleReviews()` and `getReviewQueue()` — do they filter by book, or show cross-book? (Either is valid, but should be intentional)

4. **Pipeline status isolation:** `getChapterStage()` requires book parameter, no global queries without book filter

5. **Practical test:** Create a segment edit in book A, verify it doesn't appear when querying book B

**Pass criteria:** All queries correctly scoped. No accidental cross-book data leakage.

### 1D: Security Spot-Check

**Objective:** Verify auth and input handling on all editor endpoints.

**Checks:**

1. **Middleware coverage:** Every route in all active route files has appropriate `requireAuth()` and/or `requireRole()` middleware. Priority files (editor-facing): `segment-editor.js`, `localization-editor.js`, `pipeline-status.js`, `status.js`, `my-work.js`. Also check: `admin.js`, `publication.js`, `terminology.js`, `pipeline.js`, `sync.js`

2. **Role enforcement on sensitive actions:**
   - Approve/reject/discuss: requires head-editor or admin
   - Apply to files: requires head-editor or admin
   - Complete review: requires head-editor or admin
   - Pipeline stage transitions: requires appropriate role

3. **Input sanitization:**
   - Segment content (edited text) — stored and rendered safely?
   - Editor notes and discussion comments — XSS risk?
   - Book/chapter/module parameters — path traversal risk?

4. **CSP compliance:** Verify all editor views (`segment-editor.html`, `localization-editor.html`, `chapter-pipeline.html`) load without CSP violations

**Pass criteria:** All endpoints protected. No XSS or injection vectors. CSP clean.

---

## Track 2: Editorial Workflow End-to-End Test

Mixed automated and manual. Exercises all three books with emulated content for faithful and localized tracks.

### 2A: Pass 1 — Faithful Translation (Segment Editor)

**Full journey on efnafraedi-2e ch01:**

| Step | Action | Verification |
|---|---|---|
| 1 | Log in as contributor | Redirected to My Work, correct role displayed |
| 2 | Navigate to segment editor | Book selector shows all 3 books |
| 3 | Select efnafraedi-2e → ch01 → module m68664 (first content module; m68663 is the introduction and may have limited segments) | Segments load with EN source and IS MT text |
| 4 | Click a segment, edit the IS text | Edit panel opens, shows original and editable field |
| 5 | Select category "terminology", add editor note | Category selector and note field work |
| 6 | Save edit | Success feedback, segment shows "pending" indicator |
| 7 | Edit and save a second segment | Both edits visible in segment list |
| 8 | Submit module for review | Success message, module appears in review queue |
| 9 | Switch to head-editor role | Review queue visible in nav |
| 10 | Open review queue, find submitted module | Module listed with correct segment count |
| 11 | Approve first edit | Edit status changes to "approved" |
| 12 | Reject second edit with note | Edit status changes to "rejected", note visible |
| 13 | Complete the review | `applyApprovedEdits()` runs |
| 14 | Verify faithful file | `03-faithful-translation/ch01/m68664-segments.is.md` exists with approved content |
| 15 | Verify edit statuses in DB | Approved edit has `applied_at` set, rejected stays rejected |
| 16 | Verify pipeline status | `linguisticReview` stage should NOT advance (only one module was reviewed, not all). Verify the stage remains unchanged and no false-positive auto-advance occurred. |

**Abbreviated on liffraedi-2e ch03:**

| Step | Action | Verification |
|---|---|---|
| 1 | Select liffraedi-2e → ch03 → first module | Segments load correctly |
| 2 | Edit one segment, save, submit | Edit saved, module in review queue |
| 3 | Approve and complete review | Faithful file written correctly |

**Abbreviated on orverufraedi ch01:**

| Step | Action | Verification |
|---|---|---|
| 1 | Select orverufraedi → ch01 → first module | Segments load correctly |
| 2 | Edit one segment, save, submit | Edit saved, module in review queue |
| 3 | Approve and complete review | Faithful file written correctly |

### 2B: Pass 2 — Localization (Localization Editor)

**Full journey on efnafraedi-2e ch01 (after Pass 1 produces faithful file):**

| Step | Action | Verification |
|---|---|---|
| 1 | Navigate to localization editor | Book selector shows all 3 books |
| 2 | Select efnafraedi-2e → ch01 → m68664 | Three-column layout: EN \| Faithful IS \| Localized IS |
| 3 | Edit a segment with category "unit-conversion" | Edit field works, category selected |
| 4 | Save single segment | File written to `04-localized-content/ch01/`, success feedback |
| 5 | Edit 2 more segments | Changes visible in editor |
| 6 | Save all | Batch write succeeds, all segments persisted |
| 7 | Check edit history popover | Audit trail shows edits in `localization_edits` table |
| 8 | Navigate away and back | Edits persist in file |

**Smoke on liffraedi-2e and orverufraedi:**
- Load one module from each, verify three-column layout populates correctly

### 2C: Pipeline Continuity (Injection → Rendering → Publication)

**Objective:** Verify the full pipeline produces correct HTML from emulated faithful and localized content.

**On efnafraedi-2e ch01:**

| Step | Command / Action | Verification |
|---|---|---|
| 1 | (Pass 1 already produced faithful file in 2A) | `03-faithful-translation/ch01/m68664-segments.is.md` exists |
| 2 | `node tools/cnxml-inject.js --book efnafraedi-2e --chapter 1 --source-dir 03-faithful-translation` | CNXML output in `03-translated/faithful/ch01/` |
| 3 | `node tools/cnxml-render.js --book efnafraedi-2e --chapter 1 --track faithful` | HTML output in `05-publication/faithful/ch01/` |
| 4 | Open faithful HTML in browser | Content matches edited segments, MathML renders as SVG, figures numbered correctly |
| 5 | (Pass 2 already produced localized file in 2B) | `04-localized-content/ch01/m68664-segments.is.md` exists |
| 6 | `node tools/cnxml-inject.js --book efnafraedi-2e --chapter 1 --source-dir 04-localized-content` | CNXML output in `03-translated/localized/ch01/` |
| 7 | `node tools/cnxml-render.js --book efnafraedi-2e --chapter 1 --track localized` | HTML output in `05-publication/localized/ch01/` |
| 8 | Compare mt-preview, faithful, and localized HTML | Differences match the edits made in 2A and 2B |
| 9 | Check pipeline status page | Correct stages shown for each track |
| 10 | Revert emulated files | `git checkout` affected directories to avoid polluting repo |

**On liffraedi-2e ch03 (abbreviated):**

| Step | Command / Action | Verification |
|---|---|---|
| 1 | Inject faithful track (use `--allow-incomplete` — Biology has partial MT coverage: 194/429 segments) | CNXML produced |
| 2 | Render faithful track | HTML produced with Biology-specific rendering config (different note types, exercise types) |
| 3 | Verify rendered HTML | Biology-specific elements render correctly |

### 2D: Error Paths & Edge Cases

| # | Scenario | Method | Expected Behavior |
|---|---|---|---|
| 1 | **Cross-tab conflict** — open same module in two browser tabs, edit in both | Manual (two tabs) | BroadcastChannel warning appears in second tab |
| 2 | **Offline save** — disconnect network, save edit | Manual (devtools network throttle) | Retry queue activates, toast notification, save completes on reconnect |
| 3 | **Concurrent review** — two approved edits on same segment | Automated (DB insert) | `applyApprovedEdits()` uses latest-reviewed edit, older marked superseded |
| 4 | **Missing segments** — inject chapter with incomplete MT | CLI | Fails without `--allow-incomplete`, succeeds with flag and logs warnings |
| 5 | **Appendices** — load appendices in segment editor | Browser | Works correctly (chapter_num = -1 edge case) |
| 6 | **Autosave conflict (409)** — trigger save conflict | Automated | Editor stops autosave timer, prompts reload (no infinite retry) |
| 7 | **Deleted faithful file** — apply edits, delete file, re-apply | CLI + manual | Self-healing: resets `applied_at`, rewrites file |
| 8 | **Empty module** — module with no translatable segments | Browser | Editor handles gracefully (no crash, informative message) |

---

## Track 3: UI/UX Audit

Split: automated mechanical checks (Claude) + subjective walkthrough (user).

### 3A: Automated UI Checks

Run via Playwright or Chrome DevTools against local server.

**Page load & data display (all roles × all editor pages):**

| # | Check | Pages | Roles |
|---|---|---|---|
| 1 | Page loads without JS errors | All nav pages | viewer, contributor, editor, head-editor, admin |
| 2 | Role-appropriate nav items visible/hidden | Sidebar | All 5 roles |
| 3 | Admin-only elements hidden for non-admin | Admin panel, status dashboard | viewer, contributor, editor, head-editor |
| 3b | Viewer role cannot access edit endpoints | segment-editor save/submit, localization-editor save | viewer |
| 4 | Book selector populates with all 3 books | segment-editor, localization-editor | contributor |
| 5 | Chapter lists load correctly per book | Both editors | contributor |
| 6 | Module lists load correctly per chapter | Both editors | contributor |
| 7 | Segment data displays in correct columns | Both editors | contributor |
| 8 | Pipeline status shows correct stage data | /pipeline/:book/:chapter, /progress | contributor, admin |

**Interactive elements:**

| # | Check | Page |
|---|---|---|
| 9 | Edit panel opens on segment click | segment-editor |
| 10 | Save sends correct payload, shows feedback | segment-editor |
| 11 | Category selector and note field work | segment-editor |
| 12 | Submit-for-review completes without error | segment-editor |
| 13 | Review queue loads for head-editor | segment-editor |
| 14 | Approve/reject/discuss buttons update status | segment-editor |
| 15 | Terminology lookup returns results | segment-editor |
| 16 | Localization save (single + batch) works | localization-editor |
| 17 | Edit history popover shows data | localization-editor |

### 3B: Manual UX Walkthrough Checklist

Provided as a fillable markdown document for the user.

**Logical progression:**

| # | Question | Pass/Fail | Notes |
|---|---|---|---|
| 1 | As a new contributor, can you figure out what to do first from My Work? | | |
| 2 | Does the segment editor make the editing task clear? (What am I looking at? What should I change? How do I save?) | | |
| 3 | Is the relationship between Pass 1 (segment editor) and Pass 2 (localization editor) obvious? | | |
| 4 | Does the pipeline status page tell you where each chapter is and what needs to happen next? | | |
| 5 | After submitting for review, is it clear what happens next and where to find the result? | | |
| 6 | After a review is completed, does the contributor see clear feedback? | | |

**Icelandic UI consistency:**

| # | Question | Pass/Fail | Notes |
|---|---|---|---|
| 7 | Are all user-facing labels, buttons, and messages in Icelandic? | | |
| 8 | Are error messages in Icelandic? | | |
| 9 | Are role names displayed consistently? | | |
| 10 | Are pipeline stage names in Icelandic on user-facing pages? | | |

**Navigation & discoverability:**

| # | Question | Pass/Fail | Notes |
|---|---|---|---|
| 11 | Can you reach every relevant page from the sidebar without guessing URLs? | | |
| 12 | Do page titles and breadcrumbs orient you (which book? chapter? module?)? | | |
| 13 | When you complete an action, is the next logical step obvious? | | |
| 14 | Does My Work surface the right priorities for your role? | | |

**Multi-book experience:**

| # | Question | Pass/Fail | Notes |
|---|---|---|---|
| 15 | Is switching between books smooth? | | |
| 16 | Are books visually distinguishable? | | |
| 17 | Does pipeline status show all three books clearly? | | |
| 18 | After switching books, does the editor reset state correctly (no stale chapter/module from previous book)? | | |

**Error states & feedback:**

| # | Question | Pass/Fail | Notes |
|---|---|---|---|
| 19 | What happens when you try to edit without selecting a module? | | |
| 20 | What happens when a save fails? Is the error message helpful? | | |
| 21 | Is the cross-tab warning clear about what to do? | | |
| 22 | When network is slow, is there loading feedback? | | |

---

## Track 4: Convergence & Reporting

### 4A: Cross-Reference Analysis

After both tracks complete, map findings across them:

- Code issues → do they cause visible UX problems?
- UX problems → do they trace to code remnants or architectural gaps?
- Test gaps → what should be added to automated suite based on findings?

### 4B: Findings Report

Output: `docs/audit/editing-system-audit-2026-03.md`

Structure:
1. **Summary** — pass/fail per section, overall readiness assessment
2. **Critical issues** — would block or confuse real editors (must fix before inviting editors)
3. **Moderate issues** — work but confusing, inconsistent, or fragile (should fix soon)
4. **Low issues** — cosmetic, cleanup, nice-to-have (can defer)
5. **Test coverage gaps** — recommended new automated tests
6. **Recommendations** — prioritized fix list with effort (small/medium/large)

---

## Execution Plan

| Track | Section | Who | Method | Dependencies |
|---|---|---|---|---|
| 1 | 1A: Dead code scan | Claude | Automated grep/analysis | None |
| 1 | 1B: Schema consistency | Claude | Code tracing + automated tests | None |
| 1 | 1C: Cross-book isolation | Claude | Query analysis + practical test | None |
| 1 | 1D: Security spot-check | Claude | Middleware audit | None |
| 2 | 2A: Pass 1 full journey | Both | Browser automation + manual verify | Server running locally |
| 2 | 2B: Pass 2 full journey | Both | Browser automation + manual verify | 2A (needs faithful files) |
| 2 | 2C: Pipeline continuity | Both | CLI tools + visual verify | 2A + 2B (needs emulated content) |
| 2 | 2D: Error paths | Both | Automation + manual | Server running locally |
| 3 | 3A: Automated UI checks | Claude | Playwright/Chrome DevTools | Server running locally |
| 3 | 3B: Manual UX walkthrough | User | Fillable checklist | Server running locally |
| 4 | 4A: Cross-reference | Claude | Analysis | Tracks 1-3 complete |
| 4 | 4B: Findings report | Claude | Document | 4A complete |

**Track 1 (1A–1D) can run in parallel with Track 3A.** Both are independent.
**Track 2 (2A→2B→2C) is sequential** — each step depends on content produced by the previous.
**Track 2D and 3B can run in parallel** after 2A is set up.
**Track 4 runs last** after all other tracks complete.

### CLI Commands Reference

```bash
# Faithful track injection and rendering
node tools/cnxml-inject.js --book efnafraedi-2e --chapter 1 --source-dir 03-faithful-translation
node tools/cnxml-render.js --book efnafraedi-2e --chapter 1 --track faithful

# Localized track injection and rendering
node tools/cnxml-inject.js --book efnafraedi-2e --chapter 1 --source-dir 04-localized-content
node tools/cnxml-render.js --book efnafraedi-2e --chapter 1 --track localized

# Biology (different rendering config — may need --allow-incomplete due to partial MT coverage)
node tools/cnxml-inject.js --book liffraedi-2e --chapter 3 --source-dir 03-faithful-translation --allow-incomplete
node tools/cnxml-render.js --book liffraedi-2e --chapter 3 --track faithful

# Cleanup after testing (paths are within books/ directory)
git checkout -- books/efnafraedi-2e/03-faithful-translation/ books/efnafraedi-2e/04-localized-content/ \
  books/efnafraedi-2e/03-translated/faithful/ books/efnafraedi-2e/03-translated/localized/ \
  books/efnafraedi-2e/05-publication/faithful/ books/efnafraedi-2e/05-publication/localized/
```

### Test Data Cleanup

All emulated content created during testing must be reverted before committing:
- Faithful files in `03-faithful-translation/`
- Localized files in `04-localized-content/`
- Injected CNXML in `03-translated/faithful/` and `03-translated/localized/`
- Rendered HTML in `05-publication/faithful/` and `05-publication/localized/`
- Any segment_edits, module_reviews, localization_edits DB records created during testing

Use `git checkout` for file cleanup. DB records can be cleaned with a targeted DELETE or by using a test database copy.
