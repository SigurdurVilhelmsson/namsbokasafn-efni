# Editing System Full-Scale Audit — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Verify the editing system is solid and clean for real editor use after multiple architectural transitions.

**Architecture:** Four parallel-capable tracks — code integrity (automated grep/analysis), editorial workflow E2E (browser automation + CLI), UI/UX checks (Playwright + manual checklist), and convergence reporting. Track 1 and 3A run independently. Track 2 is sequential (2A→2B→2C). All converge in Track 4.

**Tech Stack:** Node.js 24, Express 5, better-sqlite3 12, Vitest, Playwright, Chrome DevTools MCP

**Spec:** `docs/superpowers/specs/2026-03-13-editing-system-audit-design.md`

---

## Prerequisites

Before starting the audit:

1. The dead code cleanup must be committed (the uncommitted changes removing reviews.js, editorHistory.js, etc.)
2. Migration 021 must be registered in `migrationRunner.js`
3. The local server must be startable via `cd server && node index.js`
4. A backup copy of `pipeline-output/sessions.db` must exist for safe rollback

---

## Chunk 1: Track 1 — Code Integrity Audit

All tasks in this chunk can run as parallel sub-agents. No server needed. No browser needed. Pure code analysis.

### Task 1: Dead Code & Remnant Scan (1A)

**Files to analyze:**
- All `server/routes/*.js` (24 files, excluding `server/routes/archived/`)
- All `server/services/*.js` (excluding `server/services/archived/`)
- All `server/views/*.html` (excluding `server/views/archived/`)
- `server/index.js`
- `server/public/js/*.js`
- `package.json`
- `server/services/migrationRunner.js:28-49`

**Findings file:** `docs/audit/findings/1a-dead-code.md`

- [ ] **Step 1: Search for `edit_history` table references in active code**

```bash
# Must return 0 matches outside archived/ and migrations/
grep -r "edit_history" server/routes/ server/services/ server/views/ server/public/ \
  --include="*.js" --include="*.html" \
  | grep -v "/archived/" | grep -v "/migrations/"
```

Expected: No matches. If matches found, record file:line in findings.

- [ ] **Step 2: Search for `pending_reviews` table references in active code**

```bash
grep -r "pending_reviews" server/routes/ server/services/ server/views/ server/public/ \
  --include="*.js" --include="*.html" \
  | grep -v "/archived/" | grep -v "/migrations/"
```

Expected: No matches.

- [ ] **Step 3: Search for `editorHistory` service imports**

```bash
grep -r "editorHistory\|editor-history\|editor_history" server/routes/ server/services/ server/index.js \
  --include="*.js" | grep -v "/archived/"
```

Expected: No matches.

- [ ] **Step 4: Search for reviews route imports (excluding redirect)**

```bash
grep -r "require.*reviews\|from.*reviews" server/routes/ server/services/ server/index.js \
  --include="*.js" | grep -v "/archived/" | grep -v "redirect"
```

Expected: No matches.

- [ ] **Step 5: Verify migration 021 is registered (prerequisite check)**

Read `server/services/migrationRunner.js`. Check that the `migrations` array (starting at line 28) includes:
```js
require('../migrations/021-drop-dead-tables'),
```

This should have been done as part of the Prerequisites (committing the dead code cleanup). If still missing: **STOP the audit.** Register migration 021 in the array after migration 020, commit the dead code cleanup, then restart the audit.

- [ ] **Step 6: Verify archived files have no inbound references**

```bash
grep -r "archived" server/routes/ server/services/ server/index.js server/views/ \
  --include="*.js" --include="*.html" | grep -v "node_modules" | grep -v "/archived/"
```

Expected: No matches (no active code imports from archived/).

- [ ] **Step 7: Scan for stale TODO/FIXME/HACK comments**

```bash
grep -rn "TODO\|FIXME\|HACK\|XXX" server/ tools/ --include="*.js" \
  | grep -v "node_modules" | grep -v "/archived/"
```

Review each match: does it reference completed work or removed features? Record stale ones in findings.

- [ ] **Step 8: Check package.json for removed script references**

Read `package.json` `scripts` section. Verify no script references `scripts/update-status.js` or any other removed file.

- [ ] **Step 9: Write findings to `docs/audit/findings/1a-dead-code.md`**

Format:
```markdown
# 1A: Dead Code & Remnant Scan

**Date:** 2026-03-13
**Result:** PASS / FAIL

## Findings
| # | Check | Result | Details |
|---|---|---|---|
| 1 | edit_history refs | PASS/FAIL | ... |
...
```

---

### Task 2: Schema & Data Flow Consistency (1B)

**Files to analyze:**
- `server/services/segmentEditorService.js` — Pass 1 data flow
- `server/services/localizationEditService.js` — Pass 2 data flow
- `server/services/pipelineStatusService.js` — pipeline status
- `server/services/activityLog.js` — activity logging
- `server/routes/segment-editor.js` — Pass 1 routes
- `server/routes/localization-editor.js` — Pass 2 routes
- `server/routes/status.js` — dashboard routes
- All files in `server/migrations/` — schema definitions
- `tools/lib/segmentParser.js` — segment file format (used by inject)

**Findings file:** `docs/audit/findings/1b-schema-dataflow.md`

- [ ] **Step 1: Map all SQL table names referenced in active code**

Search all `server/services/*.js` and `server/routes/*.js` (excluding archived/) for SQL table names used in `.prepare()` and `.exec()` calls. Build a list of unique table names.

```bash
grep -ohP "(?:FROM|INTO|UPDATE|JOIN|TABLE|DELETE FROM)\s+(\w+)" server/services/*.js server/routes/*.js \
  | grep -v "/archived/" | sort -u
```

Cross-reference each table against migration `up()` functions. Any table referenced in code but not created in a migration is a CRITICAL finding.

- [ ] **Step 2: Verify all require() imports resolve to existing files**

```bash
# Extract all require() paths from active server code
grep -rohP "require\(['\"]([^'\"]+)['\"]\)" server/services/*.js server/routes/*.js server/index.js \
  | sort -u
```

For each relative path, verify the target file exists on disk. Missing targets are CRITICAL.

- [ ] **Step 3: Trace Pass 1 data flow chain**

Read `server/services/segmentEditorService.js` and `server/routes/segment-editor.js`. Verify each link in the chain:

1. `saveSegmentEdit()` — does it INSERT into `segment_edits`? What happens on error?
2. `submitModuleForReview()` — does it INSERT into `module_reviews`? Does it check for existing pending review?
3. `approveEdit()` — does it UPDATE `segment_edits` SET status='approved'? Does it verify the caller is not the same editor?
4. `completeModuleReview()` — does it call `applyApprovedEdits()`? What if some edits are still pending?
5. `applyApprovedEdits()` — does it use IMMEDIATE transaction? Does it write to `03-faithful-translation/`? Does it set `applied_at`? Does it call pipeline status auto-advance?

Record any gap, silent failure, or missing error handling.

- [ ] **Step 4: Trace Pass 2 data flow chain**

Read `server/routes/localization-editor.js` and `server/services/localizationEditService.js`. Verify:

1. Save handler writes file to `04-localized-content/{chapter}/{moduleId}-segments.is.md`
2. Save handler logs to `localization_edits` table (fire-and-forget is OK, but must not silently skip)
3. The segment file format is identical to faithful files (same `<!-- SEG:... -->` markers) — both must be parseable by `parseSegments()` in `tools/lib/segmentParser.js`

- [ ] **Step 5: Verify pipeline status source of truth**

Search for code that reads `status.json` files:

```bash
grep -rn "status\.json" server/ --include="*.js" | grep -v "/archived/" | grep -v "node_modules"
```

For each match: is it reading as primary source or as cache/fallback? The DB (`chapter_pipeline_status` table via `pipelineStatusService.js`) should be authoritative. Any code reading `status.json` as primary data source is a MODERATE finding.

- [ ] **Step 6: Verify activity logging completeness**

Read `server/routes/segment-editor.js`. For each user action endpoint, verify `activityLog.log()` is called:

| Endpoint | Activity Type Expected |
|---|---|
| POST `/:book/:chapter/:moduleId/edit` | `segment_edit_saved` |
| POST `/:book/:chapter/:moduleId/submit` | (check) |
| POST `/edit/:editId/approve` | `segment_edit_approved` |
| POST `/edit/:editId/reject` | `segment_edit_rejected` |
| POST `/edit/:editId/discuss` | `segment_edit_discuss` |
| POST `/:book/:chapter/:moduleId/apply` | `segment_edits_applied` |

Missing logging is a LOW finding (fire-and-forget is fine, but absence means no audit trail).

- [ ] **Step 7: Write findings to `docs/audit/findings/1b-schema-dataflow.md`**

---

### Task 3: Cross-Book Data Isolation (1C)

**Files to analyze:**
- `server/services/segmentEditorService.js` — all exported functions
- `server/services/localizationEditService.js` — all exported functions
- `server/services/pipelineStatusService.js` — all exported functions
- `server/routes/segment-editor.js` — route parameter extraction
- `server/routes/localization-editor.js` — route parameter extraction
- `server/routes/status.js` — dashboard queries

**Findings file:** `docs/audit/findings/1c-cross-book-isolation.md`

- [ ] **Step 1: Audit DB query scoping in segmentEditorService.js**

Read every `.prepare()` call. For each query that returns data:
- Does it include `WHERE book = ?` or `WHERE book_slug = ?`?
- Could it accidentally return data from another book?

Functions to check: `saveSegmentEdit`, `getModuleEdits`, `getSegmentEdits`, `approveEdit`, `rejectEdit`, `submitModuleForReview`, `getPendingModuleReviews`, `getReviewQueue`, `getModuleReviewWithEdits`, `completeModuleReview`, `applyApprovedEdits`, `getGlobalEditStats`, `getDiscussEdits`.

Note: `getGlobalEditStats` and `getDiscussEdits` may intentionally be cross-book for the admin dashboard. Document whether this is intentional.

- [ ] **Step 2: Audit DB query scoping in localizationEditService.js**

Same check for all queries. Functions: `logLocalizationEdit`, `getSegmentHistory`, `getModuleHistory`.

- [ ] **Step 3: Audit DB query scoping in pipelineStatusService.js**

Functions: `getChapterStage`, `transitionStage`, `revertStage`, `getStageHistory`, `getBookProgress`.

- [ ] **Step 4: Check file path construction for hardcoded book slugs**

```bash
grep -rn "efnafraedi-2e\|liffraedi-2e\|orverufraedi" server/services/ server/routes/ \
  --include="*.js" | grep -v "/archived/" | grep -v "node_modules" | grep -v "test"
```

Each match: is it a hardcoded default, or is it used where a parameter should be? Hardcoded defaults in CLI tools are OK. Hardcoded values in service/route code are a MODERATE finding.

- [ ] **Step 5: Verify review queue scoping**

Read `getPendingModuleReviews()` and `getReviewQueue()` in `segmentEditorService.js`. Do they accept a `book` parameter? If they return cross-book data, is that intentional (admin dashboard) or a bug?

- [ ] **Step 6: Write findings to `docs/audit/findings/1c-cross-book-isolation.md`**

---

### Task 4: Security Spot-Check (1D)

**Files to analyze:**
- All 24 route files in `server/routes/*.js` (listed above)
- `server/middleware/requireAuth.js`
- `server/middleware/requireRole.js`
- `server/index.js` (middleware mounting order)
- `server/views/segment-editor.html`, `localization-editor.html`, `chapter-pipeline.html`

**Findings file:** `docs/audit/findings/1d-security.md`

- [ ] **Step 1: Map middleware on every route**

For each route file, list every `router.get()`, `router.post()`, `router.put()`, `router.delete()` call and what auth middleware is applied. Check:
- Is `requireAuth()` applied (either per-route or via `router.use()`)?
- For write operations, is `requireRole()` or `requireContributor()` applied?
- For admin operations, is `requireAdmin()` applied?

Priority files (editor-facing):
- `server/routes/segment-editor.js`
- `server/routes/localization-editor.js`
- `server/routes/pipeline-status.js`
- `server/routes/status.js`
- `server/routes/my-work.js`

Also check:
- `server/routes/admin.js`
- `server/routes/publication.js`
- `server/routes/terminology.js`
- `server/routes/pipeline.js`
- `server/routes/sync.js`

Missing auth on any write endpoint is CRITICAL. Missing auth on read endpoints is MODERATE.

- [ ] **Step 2: Verify role enforcement on sensitive actions**

In `server/routes/segment-editor.js`, check these specific endpoints:
- `POST /edit/:editId/approve` — must require head-editor or admin
- `POST /edit/:editId/reject` — must require head-editor or admin
- `POST /edit/:editId/discuss` — must require head-editor or admin
- `POST /reviews/:reviewId/complete` — must require head-editor or admin
- `POST /:book/:chapter/:moduleId/apply` — must require head-editor or admin

Verify by reading the route definitions and checking for `requireRole(ROLES.HEAD_EDITOR)`, `requireHeadEditor()`, or `requireBookAccess()` (which internally delegates to `requireRole(ROLES.CONTRIBUTOR)` — note the indirection). The key is that write endpoints have auth middleware; the exact middleware function may vary.

- [ ] **Step 3: Check input sanitization**

Search for user-input fields that are stored in DB or rendered in HTML:

In segment-editor routes, check `req.body.editedContent`, `req.body.editorNote`, `req.body.comment`:
- Are they validated (non-empty, type-checked)?
- Are they sanitized before DB storage?
- Are they escaped before HTML rendering? (Check corresponding `.html` files for `innerHTML` vs `textContent`)

```bash
grep -n "innerHTML" server/views/segment-editor.html server/views/localization-editor.html
```

Each `innerHTML` assignment using user data without escaping is a CRITICAL XSS finding.

- [ ] **Step 4: Check book/chapter/module parameter validation**

In route files, check that `:book`, `:chapter`, `:moduleId` URL parameters are validated:
- Do they reject path traversal attempts (e.g., `../../etc/passwd`)?
- Are they checked against known-good values (book catalogue, chapter list)?

```bash
grep -n "req.params" server/routes/segment-editor.js server/routes/localization-editor.js | head -20
```

- [ ] **Step 5: Verify CSP headers on editor views**

Start the local server and use curl to check CSP headers:

```bash
# Get a test token
TOKEN=$(node -e "const jwt=require('jsonwebtoken'); console.log(jwt.sign({sub:1,username:'test',role:'admin',books:[]}, 'test-secret', {issuer:'namsbokasafn-pipeline'}))")

curl -s -D - -o /dev/null http://localhost:3456/segment-editor \
  -H "Cookie: auth_token=$TOKEN" | grep -i "content-security-policy"
```

Verify CSP includes `script-src 'self'`, no `unsafe-eval`. Check for `segment-editor`, `localization-editor`, and `chapter-pipeline` views.

- [ ] **Step 6: Write findings to `docs/audit/findings/1d-security.md`**

---

## Chunk 2: Track 2 — Editorial Workflow End-to-End

These tasks are **sequential** — each depends on content produced by the previous. Requires a running local server.

**Server startup:**
```bash
cd server && JWT_SECRET=test-secret-for-e2e-not-production node index.js
```

**Important:** Use a copy of the DB or be prepared to clean up test data afterward. Consider copying `pipeline-output/sessions.db` to `pipeline-output/sessions.db.bak` before starting.

### Task 5: Pass 1 — Full Journey on efnafraedi-2e (2A)

**Files involved:**
- Browser: `http://localhost:3456/segment-editor`
- API endpoints in `server/routes/segment-editor.js`
- Service: `server/services/segmentEditorService.js`
- Output: `books/efnafraedi-2e/03-faithful-translation/ch01/m68664-segments.is.md`

**Findings file:** `docs/audit/findings/2a-pass1-journey.md`

- [ ] **Step 1: Open segment editor as contributor**

Using Chrome DevTools MCP or Playwright:
1. Navigate to `http://localhost:3456/segment-editor`
2. Inject auth cookie for contributor role (user ID 99996)
3. Verify page loads without JS errors
4. Verify book selector shows efnafraedi-2e, liffraedi-2e, orverufraedi

- [ ] **Step 2: Load module m68664**

1. Select book: efnafraedi-2e
2. Select chapter: ch01
3. Select module: m68664 (first content module — "1.1 Chemistry in Context" or equivalent)
4. Verify segments load with EN text in left column and IS (MT) text in right column
5. Count segments displayed — record the number

- [ ] **Step 3: Edit and save a segment**

1. Click on the first translatable segment
2. Verify edit panel opens with: original text, editable field, category dropdown, editor note field
3. Modify the IS text (e.g., add "AUDIT-TEST-1" prefix for easy identification)
4. Select category: "terminology"
5. Add editor note: "Audit test edit 1"
6. Click save
7. Verify: success toast appears, segment shows "pending" indicator
8. Record the segment ID from the UI or API response

- [ ] **Step 4: Edit and save a second segment**

1. Click on a different segment
2. Modify text (add "AUDIT-TEST-2" prefix)
3. Select category: "accuracy"
4. Save
5. Verify both edits visible in the segment list with pending status

- [ ] **Step 5: Submit module for review**

1. Click "Submit for review" button (or equivalent)
2. Verify: success message appears
3. Verify: module appears in the review queue

API verification:
```bash
curl -s http://localhost:3456/api/segment-editor/reviews \
  -H "Cookie: auth_token=$(node -e "...")" | jq '.[] | select(.module_id=="m68664")'
```

- [ ] **Step 6: Switch to head-editor and review**

1. Change auth cookie to head-editor role (user ID 99998)
2. Navigate to review queue (or reload page)
3. Find the submitted module m68664
4. Open the review
5. Verify: both segment edits are listed with their categories and notes

- [ ] **Step 7: Approve first edit, reject second**

1. Click "Approve" on AUDIT-TEST-1 edit
2. Verify: status changes to "approved" in UI
3. Click "Reject" on AUDIT-TEST-2 edit, enter note: "Audit test rejection"
4. Verify: status changes to "rejected" in UI, rejection note visible

- [ ] **Step 8: Complete the review**

1. Click "Complete review" (or equivalent)
2. Verify: `applyApprovedEdits()` runs (check server console for log output)
3. Verify: faithful file created at `books/efnafraedi-2e/03-faithful-translation/ch01/m68664-segments.is.md`

```bash
# Verify file exists and contains the approved edit
cat books/efnafraedi-2e/03-faithful-translation/ch01/m68664-segments.is.md | grep "AUDIT-TEST-1"
# Should find the approved text

cat books/efnafraedi-2e/03-faithful-translation/ch01/m68664-segments.is.md | grep "AUDIT-TEST-2"
# Should NOT find the rejected text
```

- [ ] **Step 9: Verify edit statuses in DB**

```bash
sqlite3 pipeline-output/sessions.db "SELECT id, segment_id, status, applied_at FROM segment_edits WHERE module_id='m68664' AND book='efnafraedi-2e' ORDER BY id DESC LIMIT 5"
```

Expected: approved edit has `applied_at` set, rejected edit has `applied_at` NULL.

- [ ] **Step 10: Verify pipeline status did NOT auto-advance**

```bash
sqlite3 pipeline-output/sessions.db "SELECT stage, status FROM chapter_pipeline_status WHERE book_slug='efnafraedi-2e' AND chapter_num=1 AND stage='linguisticReview'"
```

Expected: status should NOT be 'complete' (only one module was reviewed, not all).

- [ ] **Step 11: Write findings to `docs/audit/findings/2a-pass1-journey.md`**

Record every step's pass/fail, any unexpected behavior, screenshots if using Chrome DevTools.

---

### Task 6: Pass 1 — Abbreviated on liffraedi-2e and orverufraedi (2A continued)

**Findings file:** append to `docs/audit/findings/2a-pass1-journey.md`

- [ ] **Step 1: Test liffraedi-2e ch03**

1. Select liffraedi-2e → ch03 → first available module
2. Edit one segment (add "AUDIT-BIO-1" prefix), save
3. Submit for review
4. Switch to head-editor, approve, complete review
5. Verify faithful file written to `books/liffraedi-2e/03-faithful-translation/ch03/`

- [ ] **Step 2: Test orverufraedi ch01**

1. Select orverufraedi → ch01 → first available module
2. Edit one segment (add "AUDIT-MICRO-1" prefix), save
3. Submit for review
4. Switch to head-editor, approve, complete review
5. Verify faithful file written to `books/orverufraedi/03-faithful-translation/ch01/`

Note: If orverufraedi has no extracted chapters/modules yet, record this as an expected limitation and skip.

- [ ] **Step 3: Record findings**

---

### Task 7: Pass 2 — Localization Editor (2B)

**Depends on:** Task 5 (needs faithful file from Pass 1)

**Files involved:**
- Browser: `http://localhost:3456/localization-editor`
- API endpoints in `server/routes/localization-editor.js`
- Service: `server/services/localizationEditService.js`
- Output: `books/efnafraedi-2e/04-localized-content/ch01/m68664-segments.is.md`

**Findings file:** `docs/audit/findings/2b-pass2-journey.md`

- [ ] **Step 1: Open localization editor as contributor**

1. Navigate to `http://localhost:3456/localization-editor`
2. Auth as contributor
3. Select efnafraedi-2e → ch01 → m68664
4. Verify three-column layout: EN | Faithful IS | Localized IS
5. The "Faithful IS" column should show the content from the faithful file (including the AUDIT-TEST-1 edit from Task 5)

- [ ] **Step 2: Edit and save a single segment**

1. Click a segment
2. Modify the localized text (add "AUDIT-LOC-1" prefix)
3. Select category: "unit-conversion"
4. Save single segment
5. Verify: file written to `books/efnafraedi-2e/04-localized-content/ch01/m68664-segments.is.md`

```bash
cat books/efnafraedi-2e/04-localized-content/ch01/m68664-segments.is.md | grep "AUDIT-LOC-1"
```

- [ ] **Step 3: Edit multiple segments and save all**

1. Edit 2 more segments (add "AUDIT-LOC-2", "AUDIT-LOC-3")
2. Click "Save all"
3. Verify: all 3 edits persisted in the file

- [ ] **Step 4: Check edit history / audit trail**

1. Click on the history icon for a segment (if available)
2. Verify: popover shows edit history with editor name and timestamp

```bash
sqlite3 pipeline-output/sessions.db "SELECT segment_id, category, editor_username, created_at FROM localization_edits WHERE module_id='m68664' AND book='efnafraedi-2e' ORDER BY created_at DESC LIMIT 5"
```

Expected: 3 rows matching the edits just made.

- [ ] **Step 5: Navigate away and back**

1. Navigate to a different module
2. Navigate back to m68664
3. Verify: edits are still displayed (loaded from file)

- [ ] **Step 6: Smoke test other books**

1. Select liffraedi-2e → ch03 → first module (if faithful file exists from Task 6)
2. Verify three-column layout loads
3. Select orverufraedi → ch01 → first module (if faithful file exists)
4. Verify three-column layout loads

- [ ] **Step 7: Write findings to `docs/audit/findings/2b-pass2-journey.md`**

---

### Task 8: Pipeline Continuity — Inject and Render (2C)

**Depends on:** Task 5 (faithful file), Task 7 (localized file)

**Findings file:** `docs/audit/findings/2c-pipeline-continuity.md`

- [ ] **Step 1: Inject faithful track for efnafraedi-2e ch01**

```bash
node tools/cnxml-inject.js --book efnafraedi-2e --chapter 1 --source-dir 03-faithful-translation
```

Expected: CNXML files in `books/efnafraedi-2e/03-translated/faithful/ch01/`. Exit code 0 (or warnings about incomplete modules, which is expected since only m68664 has a faithful file).

- [ ] **Step 2: Render faithful track**

```bash
node tools/cnxml-render.js --book efnafraedi-2e --chapter 1 --track faithful
```

Expected: HTML files in `books/efnafraedi-2e/05-publication/faithful/ch01/`. Check for:
- No error output
- At least one `.html` file produced
- MathML rendered as SVG (grep for `<svg` in output)

- [ ] **Step 3: Verify faithful HTML content**

```bash
# Check that the AUDIT-TEST-1 edit appears in the rendered HTML
grep -l "AUDIT-TEST-1" books/efnafraedi-2e/05-publication/faithful/ch01/*.html
```

Open the HTML file in a browser (via Chrome DevTools MCP `navigate_page` or manually). Verify:
- Content displays correctly
- Figures have correct numbering
- End-of-chapter sections present (if applicable)

- [ ] **Step 4: Inject localized track**

```bash
node tools/cnxml-inject.js --book efnafraedi-2e --chapter 1 --source-dir 04-localized-content
```

Expected: CNXML files in `books/efnafraedi-2e/03-translated/localized/ch01/`.

- [ ] **Step 5: Render localized track**

```bash
node tools/cnxml-render.js --book efnafraedi-2e --chapter 1 --track localized
```

Expected: HTML files in `books/efnafraedi-2e/05-publication/localized/ch01/`.

- [ ] **Step 6: Compare three tracks**

```bash
# List files in each track to compare structure
# Note: mt-preview uses 'chapters/NN/' path, faithful may use 'ch01/' — verify actual paths
ls books/efnafraedi-2e/05-publication/mt-preview/chapters/01/ 2>/dev/null || echo "mt-preview not at chapters/01/"
ls books/efnafraedi-2e/05-publication/faithful/ch01/ 2>/dev/null || echo "faithful not at ch01/"
# Adjust paths based on actual directory structure

# Check AUDIT-LOC-1 appears in localized but not in faithful
grep -c "AUDIT-LOC-1" books/efnafraedi-2e/05-publication/localized/ch01/*.html || echo "Not found in localized"
grep -c "AUDIT-LOC-1" books/efnafraedi-2e/05-publication/faithful/ch01/*.html || echo "Not found in faithful (expected)"
```

- [ ] **Step 7: Test Biology rendering (liffraedi-2e)**

```bash
# Only if Task 6 produced a faithful file for liffraedi-2e ch03
node tools/cnxml-inject.js --book liffraedi-2e --chapter 3 --source-dir 03-faithful-translation --allow-incomplete
node tools/cnxml-render.js --book liffraedi-2e --chapter 3 --track faithful
```

Verify: HTML produced with Biology-specific rendering config (different note types, exercise types per `tools/lib/book-rendering-config.js`).

- [ ] **Step 8: Write findings to `docs/audit/findings/2c-pipeline-continuity.md`**

---

### Task 9: Error Paths & Edge Cases (2D)

**Findings file:** `docs/audit/findings/2d-error-paths.md`

- [ ] **Step 1: Cross-tab conflict detection**

1. Open segment editor for m68664 in Tab A
2. Open same module in Tab B
3. Verify: Tab B shows a warning (BroadcastChannel-based conflict detection)
4. If no warning: check browser console for BroadcastChannel errors

- [ ] **Step 2: Offline save & retry queue**

1. Open segment editor, load a module
2. Open Chrome DevTools → Network → set "Offline"
3. Edit a segment and save
4. Verify: retry queue activates (check localStorage for `saveRetryQueue`)
5. Verify: Icelandic toast notification appears
6. Go back online
7. Verify: queued save completes

- [ ] **Step 3: Appendices edge case**

1. Select efnafraedi-2e → appendices (if available in chapter selector)
2. Verify: module loads correctly (chapter_num = -1 internally)
3. If not available: check if appendices appear in the chapter list and record finding

- [ ] **Step 4: Missing segments injection**

```bash
# Should fail without --allow-incomplete
node tools/cnxml-inject.js --book efnafraedi-2e --chapter 1 --source-dir 03-faithful-translation 2>&1
echo "Exit code: $?"

# Should succeed with --allow-incomplete
node tools/cnxml-inject.js --book efnafraedi-2e --chapter 1 --source-dir 03-faithful-translation --allow-incomplete 2>&1
echo "Exit code: $?"
```

First command expected: non-zero exit, error about missing segments.
Second command expected: exit 0, warnings about missing modules.

- [ ] **Step 5: Autosave conflict (409)**

This is hard to trigger manually. Check the code path instead:
1. Read `server/public/js/saveRetry.js` — verify 409 handling stops autosave timer
2. Read segment-editor.html autosave handler — verify it checks response status

- [ ] **Step 6: Concurrent review — superseded edits**

Test that when two editors submit edits for the same segment, `applyApprovedEdits()` uses the latest-reviewed edit and marks the older one superseded.

1. As contributor (user 99996), save an edit for segment X in m68664 (add "AUDIT-SUPERSEDE-A")
2. As a second contributor (user 99994 — use `loginAs(page, 'contributor', 99994)`), save a different edit for the same segment X (add "AUDIT-SUPERSEDE-B")
3. Submit the module for review
4. As head-editor, approve BOTH edits
5. Complete the review
6. Verify: faithful file contains "AUDIT-SUPERSEDE-B" (latest reviewed), not "AUDIT-SUPERSEDE-A"

```bash
sqlite3 pipeline-output/sessions.db "SELECT id, edited_content, status, applied_at FROM segment_edits WHERE edited_content LIKE '%AUDIT-SUPERSEDE%' ORDER BY reviewed_at"
```

Expected: Later edit has `applied_at` set; earlier edit is marked superseded (status='rejected' with note about superseded, or `applied_at` NULL).

- [ ] **Step 7: Empty module handling**

1. Find or identify a module with no translatable segments (check by loading various modules)
2. If found: verify the editor shows an informative message (not a crash or blank page)
3. If no truly empty modules exist: verify the editor handles a module with only 1-2 segments gracefully

- [ ] **Step 8: Deleted faithful file self-healing (spec 2D #7)**

```bash
# After Task 5 created the faithful file, delete it
rm books/efnafraedi-2e/03-faithful-translation/ch01/m68664-segments.is.md

# Re-apply approved edits via API or direct function call
curl -X POST http://localhost:3456/api/segment-editor/efnafraedi-2e/ch01/m68664/apply \
  -H "Cookie: auth_token=$(node -e "const jwt=require('jsonwebtoken'); console.log(jwt.sign({sub:99999,username:'test-admin',role:'admin',books:[]}, 'test-secret-for-e2e-not-production', {issuer:'namsbokasafn-pipeline'}))")"

# Verify file is recreated
ls -la books/efnafraedi-2e/03-faithful-translation/ch01/m68664-segments.is.md
```

- [ ] **Step 9: Write findings to `docs/audit/findings/2d-error-paths.md`**

---

## Chunk 3: Track 3 — UI/UX Audit

### Task 10: Automated UI Checks (3A)

Requires server running on port 3456. Uses Chrome DevTools MCP or Playwright.

**Findings file:** `docs/audit/findings/3a-automated-ui.md`

- [ ] **Step 1: Page load test — all roles × all pages**

For each role (viewer, contributor, editor, head-editor, admin), navigate to each page and check for JS errors:

Pages to test:
- `/my-work`
- `/segment-editor`
- `/localization-editor`
- `/progress`
- `/terminology`
- `/admin` (admin only)
- `/library` (admin only)
- `/feedback`

For each page + role combination:
1. Set auth cookie for role
2. Navigate to page
3. Wait for `networkidle`
4. Check `page.on('pageerror')` — any JS exceptions?
5. Record PASS/FAIL

Expected: ~40 combinations. All should load without JS errors (some pages may redirect lower roles, which is valid behavior).

- [ ] **Step 2: Role-based nav visibility**

For each role, check the sidebar navigation:
1. Navigate to `/my-work` (or any page)
2. Count visible nav links
3. Verify admin-only items (`/admin`, `/library`) hidden for non-admin roles
4. Verify review-related items visible for editor+ roles

- [ ] **Step 3: Viewer role access denial**

As viewer (user ID 99995):
1. Attempt `POST /api/segment-editor/efnafraedi-2e/ch01/m68664/edit` with a test payload
2. Expected: 403 Forbidden
3. Attempt `POST /api/localization-editor/efnafraedi-2e/ch01/m68664/save` with a test payload
4. Expected: 403 Forbidden

- [ ] **Step 4: Book selector population**

As contributor:
1. Navigate to `/segment-editor`
2. Wait for book selector to populate
3. Verify it contains exactly 3 options: efnafraedi-2e, liffraedi-2e, orverufraedi
4. Repeat for `/localization-editor`

- [ ] **Step 5: Chapter and module loading per book**

For each book in the selector:
1. Select book
2. Verify chapter list loads (non-empty, correct count)
3. Select first chapter
4. Verify module list loads (non-empty)

Expected chapter counts (from `server/data/` JSON files):
- efnafraedi-2e: should have chapters (check `chemistry-2e.json`)
- liffraedi-2e: 47 chapters (from `biology-2e.json`)
- orverufraedi: 26 chapters (from `microbiology.json`)

- [ ] **Step 6: Segment data display in both editors**

As contributor in segment editor:
1. Load efnafraedi-2e → ch01 → m68664
2. Verify: EN column has English text, IS column has Icelandic text
3. Verify: no empty/missing columns

As contributor in localization editor (if faithful file exists):
1. Load efnafraedi-2e → ch01 → m68664
2. Verify: three columns (EN, Faithful IS, Localized IS)

- [ ] **Step 7: Interactive element checks**

In segment editor as contributor:
1. Click segment → verify edit panel opens
2. Modify text, select category, add note → verify fields work
3. Save → verify success feedback (toast/indicator)

In segment editor as head-editor:
4. Navigate to review queue → verify it loads with pending reviews
5. Open a review → verify edit details shown
6. (Do not approve/reject — that was tested in Task 5)

- [ ] **Step 8: Terminology lookup**

1. In segment editor, find terminology lookup (search box or dedicated panel)
2. Type a chemistry term (e.g., "efni" or "sýra")
3. Verify: results appear with term, definition, status

- [ ] **Step 9: Write findings to `docs/audit/findings/3a-automated-ui.md`**

---

### Task 11: Manual UX Walkthrough Checklist (3B)

**Output file:** `docs/audit/findings/3b-ux-walkthrough-checklist.md`

- [ ] **Step 1: Generate the fillable checklist**

Create the file at `docs/audit/findings/3b-ux-walkthrough-checklist.md` with the following content:

```markdown
# Manual UX Walkthrough — Editing System Audit

**Date:** 2026-03-13
**Tester:** _______________
**Server:** localhost:3456

## Instructions

Walk through each question below. Log in with the role specified and navigate
through the system naturally. Fill in Pass/Fail and any notes.

---

## A. Logical Progression (as contributor)

| # | Question | Pass/Fail | Notes |
|---|---|---|---|
| 1 | From /my-work, can you figure out what to do first? Is there a clear call-to-action? | | |
| 2 | Does the segment editor make clear: what you're looking at, what to change, and how to save? | | |
| 3 | Is the relationship between Pass 1 (Ritstjóri) and Pass 2 (Staðfærsla) obvious from the nav? | | |
| 4 | Does /progress tell you where each chapter is and what needs to happen next? | | |
| 5 | After submitting for review, is it clear what happens next? Where do you find the result? | | |
| 6 | After a review is completed (approved/rejected), do you see clear feedback on /my-work? | | |

## B. Icelandic UI Consistency

| # | Question | Pass/Fail | Notes |
|---|---|---|---|
| 7 | Are all user-facing labels, buttons, and messages in Icelandic? List any English text found. | | |
| 8 | Are error messages in Icelandic? (Try saving without changes, or with empty fields) | | |
| 9 | Are role names displayed consistently (all Icelandic or all English)? | | |
| 10 | Are pipeline stage names in Icelandic on user-facing pages? (Check /progress) | | |

## C. Navigation & Discoverability

| # | Question | Pass/Fail | Notes |
|---|---|---|---|
| 11 | Can you reach every relevant page from the sidebar without guessing URLs? | | |
| 12 | Do page titles orient you? (Which book? Which chapter? Which module?) | | |
| 13 | When you complete an action (save/submit/approve), is the next step obvious? | | |
| 14 | Does /my-work surface the right priorities? | | |

## D. Multi-Book Experience

| # | Question | Pass/Fail | Notes |
|---|---|---|---|
| 15 | Is switching between books smooth in the editor? | | |
| 16 | Are books visually distinguishable (colors, labels, icons)? | | |
| 17 | Does /progress show all three books clearly? | | |
| 18 | After switching books, does the editor reset correctly (no stale chapter/module)? | | |

## E. Error States & Feedback

| # | Question | Pass/Fail | Notes |
|---|---|---|---|
| 19 | What happens when you try to edit without selecting a module? | | |
| 20 | What happens when a save fails? Is the error message helpful? | | |
| 21 | Is the cross-tab warning clear about what to do? | | |
| 22 | When network is slow, is there loading feedback (spinners, skeleton, etc.)? | | |

---

## Summary

**Total checks:** 22
**Passed:** ___
**Failed:** ___
**Critical issues found:** ___

**Top 3 UX concerns:**
1.
2.
3.
```

- [ ] **Step 2: Inform the user the checklist is ready**

Tell the user: "The UX walkthrough checklist is at `docs/audit/findings/3b-ux-walkthrough-checklist.md`. Start the server and walk through it at your convenience. Fill in Pass/Fail and notes as you go."

---

## Chunk 4: Track 4 — Convergence & Reporting

**Depends on:** All of Chunks 1-3.

### Task 12: Cross-Reference and Final Report (4A + 4B)

**Input files:**
- `docs/audit/findings/1a-dead-code.md`
- `docs/audit/findings/1b-schema-dataflow.md`
- `docs/audit/findings/1c-cross-book-isolation.md`
- `docs/audit/findings/1d-security.md`
- `docs/audit/findings/2a-pass1-journey.md`
- `docs/audit/findings/2b-pass2-journey.md`
- `docs/audit/findings/2c-pipeline-continuity.md`
- `docs/audit/findings/2d-error-paths.md`
- `docs/audit/findings/3a-automated-ui.md`
- `docs/audit/findings/3b-ux-walkthrough-checklist.md` (user-completed)

**Output file:** `docs/audit/editing-system-audit-2026-03.md`

- [ ] **Step 1: Create findings directory**

```bash
mkdir -p docs/audit/findings
```

- [ ] **Step 2: Read all findings files**

Read each findings file and compile a cross-referenced list of all issues found.

- [ ] **Step 3: Cross-reference code ↔ UX findings**

For each code issue (Tracks 1): does it cause a visible UX problem?
For each UX issue (Tracks 2-3): does it trace to a code remnant or architectural gap?

- [ ] **Step 4: Write the final report**

Create `docs/audit/editing-system-audit-2026-03.md` with this structure:

```markdown
# Editing System Audit Report — March 2026

**Date:** 2026-03-13
**Auditor:** Claude + [user name]
**Scope:** Full editing system across 3 books
**Spec:** docs/superpowers/specs/2026-03-13-editing-system-audit-design.md

## Executive Summary

[1 paragraph: overall readiness assessment — ready/not ready for real editors]

## Results by Track

| Track | Section | Result | Critical | Moderate | Low |
|---|---|---|---|---|---|
| 1 | 1A: Dead Code | PASS/FAIL | N | N | N |
| 1 | 1B: Schema | PASS/FAIL | N | N | N |
| ... | ... | ... | ... | ... | ... |

## Critical Issues (Must Fix)

[Numbered list with: description, location, root cause, suggested fix, effort]

## Moderate Issues (Should Fix)

[Same format]

## Low Issues (Can Defer)

[Same format]

## Test Coverage Gaps

[List of areas that need new automated tests based on findings]

## Recommendations

[Prioritized fix list: what to do first, second, third]
```

- [ ] **Step 5: Commit the report**

```bash
git add docs/audit/
git commit -m "docs: editing system full-scale audit report (March 2026)"
```

---

## Cleanup

After the audit is complete:

- [ ] **Revert emulated test content**

Some directories are newly created (untracked) — `git checkout` won't remove them. Use `rm -rf` for new directories and `git checkout` for modified files.

```bash
# efnafraedi-2e: remove audit-created content
rm -rf books/efnafraedi-2e/03-faithful-translation/ch01/
rm -rf books/efnafraedi-2e/04-localized-content/ch01/
rm -rf books/efnafraedi-2e/03-translated/faithful/
rm -rf books/efnafraedi-2e/03-translated/localized/
rm -rf books/efnafraedi-2e/05-publication/faithful/
rm -rf books/efnafraedi-2e/05-publication/localized/

# liffraedi-2e (if test content was created in Task 6/8)
rm -rf books/liffraedi-2e/03-faithful-translation/ch03/
rm -rf books/liffraedi-2e/03-translated/faithful/
rm -rf books/liffraedi-2e/05-publication/faithful/

# orverufraedi (if test content was created in Task 6)
rm -rf books/orverufraedi/03-faithful-translation/ch01/
```

Verify no test content remains:
```bash
git status --short books/
```

- [ ] **Clean up DB test data**

**Important:** Run these in order — discussions and reviews must be deleted before segment_edits, because their subqueries reference segment_edits rows.

```bash
# 1. Delete discussion comments on audit edits
sqlite3 pipeline-output/sessions.db "DELETE FROM segment_discussions WHERE segment_edit_id IN (SELECT id FROM segment_edits WHERE edited_content LIKE '%AUDIT-%')"

# 2. Delete module reviews (must run while segment_edits still exist for the subquery)
sqlite3 pipeline-output/sessions.db "DELETE FROM module_reviews WHERE module_id IN (SELECT DISTINCT module_id FROM segment_edits WHERE edited_content LIKE '%AUDIT-%')"

# 3. Delete the segment edits themselves (last, so subqueries above can reference them)
sqlite3 pipeline-output/sessions.db "DELETE FROM segment_edits WHERE edited_content LIKE '%AUDIT-%'"

# 4. Delete localization audit trail
sqlite3 pipeline-output/sessions.db "DELETE FROM localization_edits WHERE new_content LIKE '%AUDIT-%'"
```

Or restore from the backup:
```bash
cp pipeline-output/sessions.db.bak pipeline-output/sessions.db
```

- [ ] **Restore DB backup**

```bash
cp pipeline-output/sessions.db.bak pipeline-output/sessions.db
```
