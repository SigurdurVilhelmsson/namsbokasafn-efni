# 1B: Schema & Data Flow Consistency

**Date:** 2026-03-13
**Result:** PASS (with 3 moderate and 2 low findings)

---

## Step 1: SQL Table Names — Active Code vs. Migrations

### Tables referenced in active `server/services/*.js` and `server/routes/*.js`

| Table | Migration | Service/Route Files |
|---|---|---|
| `segment_edits` | 008 | segmentEditorService.js, pipelineService.js, my-work.js |
| `module_reviews` | 008 | segmentEditorService.js |
| `segment_discussions` | 008 | segmentEditorService.js |
| `localization_edits` | 011 | localizationEditService.js |
| `chapter_pipeline_status` | 017 | pipelineStatusService.js |
| `chapter_locks` | 018 | chapterLock.js (lib), pipeline-status.js |
| `chapter_generation_log` | 007 | pipelineStatusService.js, chapterFilesService.js |
| `chapter_generated_files` | 007 | chapterFilesService.js |
| `chapter_assignments` | 012 | workflow.js, my-work.js |
| `users` | 006 | userService.js, workflow.js |
| `user_book_access` | 006 | userService.js |
| `user_chapter_assignments` | 010 | userService.js |
| `registered_books` | 003 | bookRegistration.js, bookDataGenerator.js, terminologyService.js, pipelineService.js, terminology.js |
| `book_chapters` | 003 | bookRegistration.js, bookDataGenerator.js |
| `book_sections` | 003 | bookRegistration.js, localizationSuggestions.js, workflowPersistence.js |
| `openstax_catalogue` | 003 | openstaxCatalogue.js |
| `localization_logs` | 003 | localizationLog.js, bookRegistration.js |
| `localization_suggestions` | 004 | localizationSuggestions.js |
| `terminology_terms` | 004 (recreated in 020) | terminologyService.js |
| `terminology_discussions` | 004 | terminologyService.js, my-work.js |
| `terminology_imports` | 004 | terminologyService.js |
| `sessions` | 001 (sessionCore.js also has CREATE IF NOT EXISTS) | sessionCore.js, session.js |
| `feedback` | 005 (feedbackService.js also has CREATE IF NOT EXISTS) | feedbackService.js |
| `feedback_responses` | 005 (feedbackService.js also has CREATE IF NOT EXISTS) | feedbackService.js |
| `analytics_events` | 005 (analyticsService.js also has CREATE IF NOT EXISTS) | analyticsService.js |
| `activity_log` | (activityLog.js has CREATE IF NOT EXISTS) | activityLog.js |
| `notifications` | (notifications.js has CREATE IF NOT EXISTS) | notifications.js |
| `notification_preferences` | (notifications.js has CREATE IF NOT EXISTS) | notifications.js |
| `sqlite_master` | (built-in) | my-work.js, userService.js, chapterFilesService.js, openstaxCatalogue.js |

### Finding 1B-01 (LOW): `terminology` table reference in my-work.js

`server/routes/my-work.js:70` checks for a table named `terminology` and queries `FROM terminology t`. However, migrations create `terminology_terms`, not `terminology`. The code has a defensive guard (`SELECT name FROM sqlite_master WHERE type='table' AND name='terminology'`) so this will silently return empty results rather than crash. The query at line 79 selects `FROM terminology t` which references the wrong table name.

**Impact:** The "my pending terminology proposals" section of the My Work page will always return empty results. No data loss or crash.

**Location:** `server/routes/my-work.js:70-87`

### Result: PASS

All other tables referenced in active code have corresponding migration `up()` functions. No table is referenced without being created. Several services (activityLog, notifications, feedbackService, analyticsService, sessionCore) use `CREATE TABLE IF NOT EXISTS` in their init code as a safety net; these tables are also created in migrations.

---

## Step 2: require() Import Verification

All relative `require()` paths in active `server/services/*.js`, `server/routes/*.js`, and `server/index.js` were checked.

| Import | Source File | Target | Exists? |
|---|---|---|---|
| `./config` | index.js | server/config.js | Inferred (used successfully) |
| `./services/migrationRunner` | index.js | server/services/migrationRunner.js | Yes |
| `./routes/modules` | index.js | server/routes/modules.js | Yes |
| `./routes/status` | index.js | server/routes/status.js | Yes |
| `./routes/matecat` | index.js | server/routes/matecat.js | Yes |
| `./routes/auth` | index.js | server/routes/auth.js | Yes |
| `./routes/workflow` | index.js | server/routes/workflow.js | Yes |
| `./routes/issues` | index.js | server/routes/issues.js | Yes |
| `./routes/sync` | index.js | server/routes/sync.js | Yes |
| `./routes/images` | index.js | server/routes/images.js | Yes |
| `./routes/views` | index.js | server/routes/views.js | Yes |
| `./routes/books` | index.js | server/routes/books.js | Yes |
| `./routes/notifications` | index.js | server/routes/notifications.js | Yes |
| `./routes/activity` | index.js | server/routes/activity.js | Yes |
| `./routes/admin` | index.js | server/routes/admin.js | Yes |
| `./routes/sections` | index.js | server/routes/sections.js | Yes |
| `./routes/terminology` | index.js | server/routes/terminology.js | Yes |
| `./routes/suggestions` | index.js | server/routes/suggestions.js | Yes |
| `./routes/my-work` | index.js | server/routes/my-work.js | Yes |
| `./routes/publication` | index.js | server/routes/publication.js | Yes |
| `./routes/feedback` | index.js | server/routes/feedback.js | Yes |
| `./routes/analytics` | index.js | server/routes/analytics.js | Yes |
| `./routes/segment-editor` | index.js | server/routes/segment-editor.js | Yes |
| `./routes/pipeline` | index.js | server/routes/pipeline.js | Yes |
| `./routes/localization-editor` | index.js | server/routes/localization-editor.js | Yes |
| `./routes/pipeline-status` | index.js | server/routes/pipeline-status.js | Yes |
| `../services/segmentParser` | segment-editor.js | server/services/segmentParser.js | Yes |
| `../services/segmentEditorService` | segment-editor.js | server/services/segmentEditorService.js | Yes |
| `../services/activityLog` | segment-editor.js | server/services/activityLog.js | Yes |
| `../services/bookDataLoader` | segment-editor.js | server/services/bookDataLoader.js | Yes |
| `../services/terminologyService` | segment-editor.js | server/services/terminologyService.js | Yes |
| `../services/pipelineService` | segment-editor.js | server/services/pipelineService.js | Yes |
| `../services/localizationEditService` | localization-editor.js | server/services/localizationEditService.js | Yes |
| `../services/pipelineStatusService` | pipelineStatusService.js | N/A (self) | Yes |
| `../lib/chapterLock` | pipeline-status.js | server/lib/chapterLock.js | Yes |
| `../services/bookRegistration` | status.js:1507 (lazy) | server/services/bookRegistration.js | Yes |
| `./pipelineService` | segmentEditorService.js | server/services/pipelineService.js | Yes |
| `./segmentParser` | segmentEditorService.js | server/services/segmentParser.js | Yes |
| `./pipelineStatusService` | pipelineService.js | server/services/pipelineStatusService.js | Yes |

### Result: PASS

All `require()` imports in active server code resolve to existing files. No broken imports found.

---

## Step 3: Pass 1 Data Flow Chain

### Chain: saveSegmentEdit -> submitModuleForReview -> approveEdit -> completeModuleReview -> applyApprovedEdits

#### 3a. `saveSegmentEdit()` (segmentEditorService.js:37-105)

- **INSERT/UPDATE:** Yes, inserts into or updates `segment_edits` table
- **Dedup:** Checks for existing pending edit by same editor on same segment; updates if found
- **Revert detection:** If `editedContent === originalContent`, deletes existing pending edit (withdraw)
- **Error handling:** Throws on DB errors (bubbles up). No silent failures.
- **Transaction:** No explicit transaction (single-statement operations). Acceptable since each operation is atomic.
- **Validation:** Route validates `segmentId`, `editedContent`, `category` before calling service.

**Result:** PASS

#### 3b. `submitModuleForReview()` (segmentEditorService.js:278-319)

- **INSERT:** Yes, inserts into `module_reviews`
- **Duplicate check:** Yes, checks for existing pending/in_review review (`WHERE status IN ('pending', 'in_review')`). Throws if found.
- **Edit count:** Counts pending edits (line 297-304) and stores in `edited_segments` column.
- **Error handling:** Throws `'Module already has a pending review'` on duplicate. Route catches and returns 409.

**Finding 1B-02 (LOW):** `submitModuleForReview` counts ALL pending edits for the module, not just those by the submitting editor. This is intentional behavior (all pending edits go into the review) but could surprise an editor who sees edits from other contributors included in "their" review.

**Result:** PASS

#### 3c. `approveEdit()` (segmentEditorService.js:172-195)

- **UPDATE:** Yes, updates `segment_edits SET status = 'approved'`
- **Self-approval guard:** Yes, uses `==` type-coercing comparison (`edit.editor_id == reviewerId`) to prevent self-approval. Correctly handles the better-sqlite3 type gotcha.
- **Status guard:** Checks `edit.status !== 'pending'` before approving.
- **Error handling:** Throws on not-found, self-approval, and non-pending status.

**Result:** PASS

#### 3d. `completeModuleReview()` (segmentEditorService.js:363-413)

- **Status calculation:** Counts pending, discuss, approved, rejected edits using `created_at >= review.submitted_at` to scope to the review cycle.
- **Auto-status:** Sets `approved` if no pending/discuss edits remain; otherwise `changes_requested`.
- **Does NOT call `applyApprovedEdits` directly.** The route handler (`segment-editor.js:489-524`) checks if `result.status === 'approved'` and then calls `applyApprovedEdits()` as a best-effort step.
- **Error handling:** Throws on review not found. Route catches and returns 400.

**Finding 1B-03 (MODERATE):** If `applyApprovedEdits()` fails during auto-apply (line 512), the error is caught and returned as `applied: { error: message }` in the response. The review is still marked `approved`, but edits are NOT applied to files. The head editor sees the error in the response but must manually trigger `/apply` again. This is documented as "best-effort" but could lead to data inconsistency: the review is `approved` but the faithful file doesn't exist. A subsequent `submitModuleForReview` would fail because there's already an `approved` review, and the editor can't re-submit.

**Mitigation:** The `/apply` endpoint exists for manual re-triggering. But there's no UI cue that apply failed (only the JSON response body includes the error).

#### 3e. `applyApprovedEdits()` (segmentEditorService.js:472-663)

- **IMMEDIATE transaction:** Yes (`applyTransaction.immediate()` at line 634).
- **Writes to:** `03-faithful-translation/` via `segmentParser.saveModuleSegments()` (line 589).
- **Sets `applied_at`:** Yes, for winner edits (line 613).
- **Superseded edits:** Marks older approved edits for same segment as rejected with Icelandic note (line 615-616).
- **File verification:** Checks file exists after write (line 592), checks non-empty (line 597), verifies sample content (line 601-608).
- **Self-healing:** If faithful file was deleted, resets `applied_at` and retries once (lines 506-532). Has recursion guard.
- **Auto-advance:** After transaction, checks if all modules have faithful files and advances `linguisticReview` stage (lines 636-660). Best-effort with try/catch.
- **Stale edit warning:** Logs warning if approved edit references a segment ID that no longer exists in current extraction (line 573-576). Does NOT skip the edit -- it still applies, but the content may not appear in the output if the segment was removed.

**Result:** PASS (robust implementation with multiple safety checks)

### Overall Pass 1 Chain Result: PASS with 1 MODERATE finding

---

## Step 4: Pass 2 Data Flow Chain

### Chain: localization editor save -> file write -> localization_edits log

#### 4a. Single-segment save (`/save` — localization-editor.js:139-251)

- **Lock:** Uses per-module async lock (`acquireModuleLock`) to serialize concurrent writes.
- **Conflict detection:** Checks file mtime against `lastModified` from client; returns 409 on conflict.
- **File write:** Calls `segmentParser.saveLocalizedSegments()` which writes to `04-localized-content/chNN/moduleId-segments.is.md`.
- **Audit log:** Calls `localizationEditService.logLocalizationEdit()` in fire-and-forget try/catch (lines 221-236). Only logs if content actually changed (`previousContent !== content`).
- **Format:** Both faithful and localized files use `assembleSegments()` which produces `<!-- SEG:moduleId:segmentType:elementId -->` markers, parseable by `parseSegments()`.

**Result:** PASS

#### 4b. Bulk save (`/save-all` — localization-editor.js:258-383)

- **Lock:** Same per-module lock.
- **Conflict detection:** Same mtime check.
- **Audit log:** Uses `logLocalizationEdits()` (batch version) for all changed segments.
- **Format:** Same `assembleSegments()` output format.

**Result:** PASS

#### 4c. File format consistency verification

- `saveModuleSegments()` (faithful) uses `assembleSegments()` -> `<!-- SEG:moduleId:segmentType:elementId -->\ncontent`
- `saveLocalizedSegments()` (localized) uses the same `assembleSegments()` -> identical format
- `parseSegments()` handles both `<!-- SEG:... -->` and `{{SEG:...}}` formats
- Both are parseable by `tools/lib/segmentParser.js` (which has the same regex)

**Result:** PASS

#### 4d. Category constraint mismatch

**Finding 1B-04 (MODERATE):** The `/log` endpoint (`localization-editor.js:446-478`) passes `category: type || 'other'` to `logLocalizationEdit()`. However, the `localization_edits` table has a CHECK constraint that only allows: `'unit-conversion', 'cultural-adaptation', 'example-replacement', 'formatting', 'unchanged'`. The value `'other'` is NOT in this list.

If a user submits a manual log entry without a `type` field (or with `type` set to a value not in the CHECK list), the INSERT will fail with a constraint violation, caught by the try/catch which returns a 500 error.

**Location:** `server/routes/localization-editor.js:467` and `server/migrations/011-localization-edits.js:21-24`

**Suggested fix:** Either add `'other'` to the migration CHECK constraint (requires a new migration since SQLite can't alter CHECK constraints in-place), or change the route to use `null` when `type` is not a valid PASS2 category.

---

## Step 5: Pipeline Status Source of Truth

### status.json reads in active server code

| File | Lines | Pattern | Primary or Cache? |
|---|---|---|---|
| `server/routes/status.js` | 104, 550, 753, 874, 940, 1014 | Reads status.json for dashboard display | **PRIMARY** |
| `server/services/pipelineStatusService.js` | 371 | `syncStatusJsonCache()` — WRITES status.json from DB | Writer (DB -> cache) |
| `server/services/publicationService.js` | 249, 415 | `updateChapterStatus()` — fallback direct write to status.json when DB transition fails | **Fallback writer** |
| `server/services/bookRegistration.js` | 397, 489, 982, 1140 | Reads status.json for pipeline progress computation | **PRIMARY** |
| `server/services/pipelineService.js` | 645-670 | `getStageStatus()` — reads from DB via `pipelineStatus.getChapterStage()` | DB (correct) |

**Finding 1B-05 (MODERATE):** `server/routes/status.js` reads `status.json` files as the **primary** data source for all dashboard endpoints (`/dashboard`, `/:book`, `/:book/:chapter`, `/:book/summary`, and the task list). It does NOT query `chapter_pipeline_status` from the database. This means the dashboard shows stale data if `syncStatusJsonCache()` fails or hasn't run.

Similarly, `server/services/bookRegistration.js` reads `status.json` directly in `computeStatusJsonProgress()` and `getBookWithChapters()` for pipeline progress display.

**Context:** The design intention (per MEMORY.md) is that "DB is authoritative, status.json is derived cache." The `pipelineStatusService.syncStatusJsonCache()` is called after every `transitionStage()` call. However, `status.js` routes bypass the DB entirely and read from the filesystem cache.

**Impact:** If `syncStatusJsonCache()` fails (logged to console but non-fatal), the dashboard will show outdated status. The risk is LOW in practice because sync runs after every transition, but the architecture is inconsistent with the documented source-of-truth model.

**Contrast:** `pipelineService.getStageStatus()` correctly reads from the DB via `pipelineStatus.getChapterStage()`. This function is used by pipeline routes for prerequisite checks. So the pipeline itself uses DB-authoritative data, but the status dashboard does not.

---

## Step 6: Activity Logging Completeness

### Segment Editor Actions

| Endpoint | Route Handler | Activity Log? | Type | Notes |
|---|---|---|---|---|
| `POST /:book/:chapter/:moduleId/edit` | segment-editor.js:220 | Yes | `segment_edit_saved` | Fire-and-forget |
| `POST /:book/:chapter/:moduleId/submit` | segment-editor.js:301 | **NO** | — | Missing activity log for review submission |
| `DELETE /edit/:editId` | segment-editor.js:288 | **NO** | — | Missing activity log for edit deletion |
| `POST /edit/:editId/approve` | segment-editor.js:382 | Yes | `segment_edit_approved` | Fire-and-forget |
| `POST /edit/:editId/reject` | segment-editor.js:413 | Yes | `segment_edit_rejected` | Fire-and-forget |
| `POST /edit/:editId/discuss` | segment-editor.js:444 | Yes | `segment_edit_discuss` | Fire-and-forget |
| `POST /edit/:editId/unapprove` | segment-editor.js:475 | **NO** | — | Missing activity log for un-approve |
| `POST /reviews/:reviewId/complete` | segment-editor.js:489 | **NO** | — | Missing activity log for review completion |
| `POST /edit/:editId/comment` | segment-editor.js:534 | **NO** | — | Missing activity log for discussion comment |
| `POST /:book/:chapter/:moduleId/apply` | segment-editor.js:654 | Yes | `segment_edits_applied` | Fire-and-forget |
| `POST /:book/:chapter/:moduleId/apply-and-render` | segment-editor.js:700 | Yes | `segment_edits_applied` | Fire-and-forget |
| `POST /:book/:chapter/apply-all` | segment-editor.js:766 | **NO** | — | Missing activity log for bulk apply |

### Localization Editor Actions

| Endpoint | Route Handler | Activity Log? | Type | Notes |
|---|---|---|---|---|
| `POST /:book/:chapter/:moduleId/save` | localization-editor.js:139 | Audit trail only | `localization_edits` table | No `activity_log` entry |
| `POST /:book/:chapter/:moduleId/save-all` | localization-editor.js:258 | Audit trail only | `localization_edits` table | No `activity_log` entry |
| `POST /:book/:chapter/:moduleId/log` | localization-editor.js:446 | Audit trail only | `localization_edits` table | No `activity_log` entry |

**Finding 1B-06 (LOW):** Five Pass 1 endpoints lack activity logging:
1. `POST /:book/:chapter/:moduleId/submit` (review submission)
2. `DELETE /edit/:editId` (edit deletion/withdrawal)
3. `POST /edit/:editId/unapprove` (reverting approval)
4. `POST /reviews/:reviewId/complete` (review completion)
5. `POST /:book/:chapter/apply-all` (bulk apply)

Of these, #1 and #4 are the most significant — review submission and completion are important workflow milestones that should appear in the activity log.

Pass 2 (localization) has its own audit trail via the `localization_edits` table but does not log to the shared `activity_log`. This means localization edits won't appear in the admin activity feed alongside Pass 1 actions. This may be intentional (separate audit trail) but reduces dashboard visibility.

---

## Summary of Findings

| # | Severity | Finding | Location |
|---|---|---|---|
| 1B-01 | LOW | `my-work.js` queries non-existent `terminology` table (should be `terminology_terms`) | `server/routes/my-work.js:70-87` |
| 1B-02 | LOW | `submitModuleForReview` counts all editors' pending edits, not just the submitter's | `server/services/segmentEditorService.js:297-304` |
| 1B-03 | MODERATE | Review marked `approved` even when `applyApprovedEdits()` fails — no retry mechanism or UI indication | `server/routes/segment-editor.js:504-516` |
| 1B-04 | MODERATE | `localization-editor /log` endpoint passes `'other'` category which violates CHECK constraint on `localization_edits` table | `server/routes/localization-editor.js:467` vs `server/migrations/011-localization-edits.js:21-24` |
| 1B-05 | MODERATE | `status.js` routes and `bookRegistration.js` read `status.json` as primary source instead of querying DB, contrary to documented DB-authoritative design | `server/routes/status.js` (6 reads), `server/services/bookRegistration.js` (4 reads) |
| 1B-06 | LOW | 5 of 12 Pass 1 editor endpoints lack `activityLog.log()` calls; Pass 2 has no activity_log integration | `server/routes/segment-editor.js`, `server/routes/localization-editor.js` |

**Critical findings:** 0
**Moderate findings:** 3
**Low findings:** 3
