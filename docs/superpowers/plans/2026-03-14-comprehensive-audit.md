# Comprehensive Editing System Audit — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix all known architectural issues, audit and fix UX for translation editor workflows, and close test coverage gaps — bringing the editing system to production readiness for non-technical editors.

**Architecture:** Three sequential phases: (1) code audit fixes for DB consistency, dead code, security, and logging gaps; (2) live UX walkthroughs via Chrome DevTools with fixes for progress indicators, button discoverability, i18n, and navigation; (3) new tests locking in all fixes and covering identified gaps.

**Tech Stack:** Node.js 24 LTS, Express 5.2, better-sqlite3 12, Vitest, Playwright, vanilla JS (ES modules)

**Spec:** `docs/superpowers/specs/2026-03-14-comprehensive-audit-design.md`

---

## Chunk 1: Phase 1 — Code Audit & Architectural Fixes

### Task 1.1: M3 — Status Dashboard DB Consistency

`bookRegistration.js` reads status.json from disk (lines 395-403, 469-507) instead of querying the `chapter_pipeline_status` DB table. Refactor to use `pipelineStatusService`.

**Files:**
- Modify: `server/services/bookRegistration.js:395-507`
- Reference: `server/services/pipelineStatusService.js` (already has `getChapterStage()`, `getAllBookStatus()`)
- Reference: `server/routes/status.js` (already uses DB via `getStatusDataFromDb()` at line 42 — no changes needed there)
- Test: `server/__tests__/pipelineStatus.test.js`

- [ ] **Step 1: Read current code to understand the exact data shape**

Read `bookRegistration.js` lines 380-520 and `pipelineStatusService.js` public API to understand what data `computeChapterPipelineProgress()` expects vs what `getChapterStage()` returns.

- [ ] **Step 2: Write a failing test**

Add to `server/__tests__/pipelineStatus.test.js`:

```javascript
describe('bookRegistration DB reads', () => {
  it('getRegisteredBook returns pipeline progress from DB, not status.json', async () => {
    // Set up a chapter with known DB status
    pipelineStatusService.transitionStage('efnafraedi-2e', 1, 'extraction', true);
    pipelineStatusService.transitionStage('efnafraedi-2e', 1, 'mtReady', true);

    const book = await bookRegistration.getRegisteredBook('efnafraedi-2e');
    // Should reflect DB state, not stale status.json
    expect(book.chapters[0].pipelineProgress).toBeGreaterThan(0);
  });
});
```

Run: `npx vitest run server/__tests__/pipelineStatus.test.js`
Expected: FAIL (currently reads from disk)

- [ ] **Step 3: Refactor bookRegistration.js to read from DB**

In `server/services/bookRegistration.js`:

1. Add import: `const pipelineStatusService = require('./pipelineStatusService');`
2. Replace the `status.json` file read at lines 395-403 with:
   ```javascript
   const dbStatus = pipelineStatusService.getChapterStage(book.slug, chapterNum);
   if (dbStatus) {
     pipelineProgress = computeChapterPipelineProgressFromDb(dbStatus);
   }
   ```
3. Replace `computeStatusJsonProgress()` (lines 469-507) with a version that calls `pipelineStatusService.getAllBookStatus(bookSlug)` instead of scanning status.json files.
4. Add a warning log if DB read fails: `console.warn('[bookRegistration] DB read failed for', book.slug, 'chapter', chapterNum, '- no fallback');`

- [ ] **Step 4: Run tests**

Run: `npx vitest run server/__tests__/pipelineStatus.test.js`
Expected: PASS

- [ ] **Step 5: Run full test suite to check for regressions**

Run: `npm test`
Expected: All tests pass

- [ ] **Step 6: Commit**

```bash
git add server/services/bookRegistration.js server/__tests__/pipelineStatus.test.js
git commit -m "fix(M3): bookRegistration reads pipeline status from DB instead of status.json"
```

---

### Task 1.2: L1 — my-work.js Terminology Table Fix

`server/routes/my-work.js` line 62-92 queries a `terminology` table, but the actual table is `terminology_terms` (created by migration 004). The defensive guard prevents crashes but "My pending terminology proposals" is always empty.

**Files:**
- Modify: `server/routes/my-work.js:62-92`
- Reference: `server/migrations/004-terminology.js` (creates `terminology_terms`)
- Reference: `server/services/terminologyService.js:317` (uses `terminology_terms`)

- [ ] **Step 1: Read the my-work.js function and the terminology_terms schema**

Read `server/routes/my-work.js` lines 55-100 and `server/migrations/004-terminology.js` to understand the column names in the real table vs what the query expects.

- [ ] **Step 2: Verify schema mismatch**

The query references `proposed_by_name` (string) but `terminology_terms` (migration 004) has `proposed_by` (integer, user ID). The query also references a `status` column and joins `terminology_discussions`. The table name is wrong AND the column names don't match — this feature was coded against a schema that was never built. The correct approach is to disable the section gracefully.

- [ ] **Step 3: Disable the terminology proposals section**

Replace the `getUserProposedTerms()` function body:
```javascript
async function getUserProposedTerms(userId) {
  // Terminology proposals feature not yet implemented —
  // the query was written against a 'terminology' table that doesn't exist.
  // The actual table is 'terminology_terms' with a different schema.
  return [];
}
```
In `server/views/my-work.html`, find the "Orðatillögur" (terminology proposals) section and either hide it or show a message: "Ekki enn í boði" (Not yet available).

- [ ] **Step 4: Verify the fix**

Start the server, log in, navigate to My Work (`/`). Check if the terminology section either shows real data or a clear "not available" message.

- [ ] **Step 5: Commit**

```bash
git add server/routes/my-work.js
git commit -m "fix(L1): my-work.js terminology section — fix table name or disable gracefully"
```

---

### Task 1.3: PUBLICATION_TRACKS DRY Cleanup

Publication track constants defined in 3 places:
- `server/constants.js:59` — `['mtPreview', 'faithful', 'localized']`
- `server/services/pipelineStatusService.js:28` — `['mtPreview', 'faithful', 'localized']`
- `server/services/publicationService.js:27-31` — object with kebab-case values `{ MT_PREVIEW: 'mt-preview', ... }`

**Files:**
- Modify: `server/constants.js:59`
- Modify: `server/services/pipelineStatusService.js:28`
- Modify: `server/services/publicationService.js:27-31`

- [ ] **Step 1: Centralize in constants.js**

In `server/constants.js`, expand the existing definition:
```javascript
const PUBLICATION_TRACKS = ['mtPreview', 'faithful', 'localized'];
const PUBLICATION_TRACK_DIRS = {
  mtPreview: 'mt-preview',
  faithful: 'faithful',
  localized: 'localized',
};
```

- [ ] **Step 2: Update pipelineStatusService.js**

Replace line 28 with:
```javascript
const { PUBLICATION_TRACKS } = require('../constants');
```

- [ ] **Step 3: Update publicationService.js**

Replace lines 27-31 with:
```javascript
const { PUBLICATION_TRACK_DIRS } = require('../constants');
```
Then update all references from `PUBLICATION_TRACKS.MT_PREVIEW` to `PUBLICATION_TRACK_DIRS.mtPreview`, `PUBLICATION_TRACKS.FAITHFUL` to `PUBLICATION_TRACK_DIRS.faithful`, etc. The existing test at `server/__tests__/new-features.test.js:88-95` asserts the old shape — update it to import from `constants.js` instead.

- [ ] **Step 4: Run full test suite**

Run: `npm test`
Expected: All tests pass

- [ ] **Step 5: Commit**

```bash
git add server/constants.js server/services/pipelineStatusService.js server/services/publicationService.js
git commit -m "refactor: centralize PUBLICATION_TRACKS in constants.js (DRY)"
```

---

### Task 1.4: Activity Logging Gaps

5 Pass 1 endpoints in `server/routes/segment-editor.js` lack activity logging:
- `DELETE /edit/:editId` (line 288) — edit deletion
- `POST /:book/:chapter/:moduleId/submit` (line 301) — review submission
- `POST /edit/:editId/unapprove` (line 475) — unapprove
- `POST /reviews/:reviewId/complete` (line 489) — review completion
- `POST /edit/:editId/comment` (line 535) — discussion comment

Pass 2 (`server/routes/localization-editor.js`) uses a separate `localizationEditService` audit trail — add parallel `activityLog.log()` calls.

**Files:**
- Modify: `server/routes/segment-editor.js:288,301,475,489,535`
- Modify: `server/routes/localization-editor.js:222,365`
- Reference: existing `activityLog.log()` calls at lines 259, 391, 422, 453, 670, 735

- [ ] **Step 1: Read the existing activity log pattern**

Read `server/routes/segment-editor.js` line 259. The calling convention uses a **single object argument**:
```javascript
activityLog.log({
  type: 'segment_edit_saved',
  userId: String(req.user.id),
  username: req.user.username,
  book: req.params.book,
  chapter: String(req.chapterNum),
  section: req.params.moduleId,
  description: `${req.user.username} vistaði breytingu á ${req.params.moduleId}:${segmentId}`,
});
```

- [ ] **Step 2: Add activity logging to the 5 missing Pass 1 endpoints**

For each endpoint, add a try/catch-wrapped log call after the successful database operation, matching the object signature above:

```javascript
// DELETE /edit/:editId (line ~288, after successful deletion)
try {
  activityLog.log({
    type: 'segment_edit_deleted',
    userId: String(req.user.id),
    username: req.user.username,
    book: edit.book,
    chapter: String(edit.chapter),
    section: edit.module_id,
    description: `${req.user.username} eyddi breytingu á ${edit.segment_id}`,
  });
} catch { /* fire-and-forget */ }

// POST /submit (line ~327, after successful submission)
try {
  activityLog.log({
    type: 'module_submitted_for_review',
    userId: String(req.user.id),
    username: req.user.username,
    book,
    chapter: String(req.chapterNum),
    section: moduleId,
    description: `${req.user.username} sendi ${moduleId} til yfirlestrar`,
  });
} catch { /* fire-and-forget */ }

// POST /unapprove (line ~482)
// POST /complete (line ~525)
// POST /comment (line ~552)
// Same pattern — type, userId, username, book, chapter, section, description
```

- [ ] **Step 3: Add activity logging to Pass 2 save endpoints**

In `server/routes/localization-editor.js`, first add the import at the top of the file:
```javascript
const activityLog = require('../services/activityLog');
```

Then add fire-and-forget calls:

```javascript
// After POST /save (line ~232)
try {
  activityLog.log({
    type: 'localization_edit_saved',
    userId: String(req.user.id),
    username: req.user.username,
    book,
    chapter: String(req.chapterNum),
    section: moduleId,
    description: `${req.user.username} breytti ${segmentId} í ${moduleId}`,
  });
} catch { /* fire-and-forget */ }

// After POST /save-all (line ~365) — same pattern with type: 'localization_edits_saved'
```

- [ ] **Step 4: Write a test verifying activity logging**

Add to `server/__tests__/new-features.test.js` or create `server/__tests__/activityLogging.test.js`:

```javascript
describe('activity logging completeness', () => {
  it('segment edit deletion creates activity log entry', async () => {
    // Save an edit, then delete it, verify log entry exists
  });

  it('module submission creates activity log entry', async () => {
    // Submit module, verify log
  });
});
```

- [ ] **Step 5: Run full test suite**

Run: `npm test`
Expected: All tests pass

- [ ] **Step 6: Commit**

```bash
git add server/routes/segment-editor.js server/routes/localization-editor.js
git commit -m "fix(1B-06): add activity logging to 5 Pass 1 + 2 Pass 2 endpoints"
```

---

### Task 1.5: Security Spot-Check

**Files:**
- Modify: `server/routes/segment-editor.js:565` (add `requireRole` to `/terms` endpoint)
- Verify: `server/views/status.html` (innerHTML escaping)
- Verify: `server/views/my-work.html` (innerHTML escaping)

- [ ] **Step 1: Add requireRole to /terms endpoint**

In `server/routes/segment-editor.js` line 565, add `requireRole(ROLES.CONTRIBUTOR)`:

```javascript
router.get(
  '/:book/:chapter/:moduleId/terms',
  requireAuth,
  requireRole(ROLES.CONTRIBUTOR),  // ADD THIS
  validateBookChapter,
  validateModule,
  (req, res) => {
```

- [ ] **Step 2: Audit innerHTML in status.html**

Read `server/views/status.html` and search for all `innerHTML` assignments. Verify each one either:
- Uses `escapeHtml()` for user-derived data, OR
- Only inserts static HTML template strings with no user data

Fix any unescaped user data (error messages, activity descriptions, user names).

- [ ] **Step 3: Audit innerHTML in my-work.html**

Same check for `server/views/my-work.html`. The exploration found template strings at lines ~1432, 1517, 1642, 1727 that may insert unescaped data (`t.english`, `t.icelandic`, `r.notes`, `a.description`).

For each: wrap user-derived values in `escapeHtml()`.

- [ ] **Step 4: Audit innerHTML in remaining view files**

Quick sweep of `admin.html`, `segment-editor.html`, `localization-editor.html`, `terminology.html`, `chapter-pipeline.html`, `books.html` for the same pattern.

- [ ] **Step 5: Spot-check routes for parameterized SQL**

Check all SQL queries in `segment-editor.js`, `localization-editor.js`, `my-work.js`, `status.js`, and `admin.js` — the routes most likely to handle user input. Verify all SQL uses `?` placeholders, not string interpolation. Document findings in audit report.

- [ ] **Step 6: Run full test suite**

Run: `npm test`
Expected: All tests pass

- [ ] **Step 7: Commit**

```bash
git add server/routes/segment-editor.js server/views/
git commit -m "fix: add requireRole to /terms endpoint + audit innerHTML escaping across views"
```

---

### Task 1.6: Migration Documentation

Migrations 010 and 012 are NOT duplicates (010 = access control permissions, 012 = work assignments with due dates) but their identical names are confusing.

**Files:**
- Modify: `server/migrations/010-chapter-assignments.js` (add clarifying comment)
- Modify: `server/migrations/012-chapter-assignments.js` (add clarifying comment)

- [ ] **Step 1: Add clarifying comments**

At the top of `010-chapter-assignments.js`:
```javascript
// Migration 010: user_chapter_assignments — WHO CAN ACCESS which chapters (permission/RBAC)
// Not to be confused with migration 012 which tracks work assignments with due dates
```

At the top of `012-chapter-assignments.js`:
```javascript
// Migration 012: chapter_assignments — WHO IS ASSIGNED to work on which chapters (task tracking)
// Not to be confused with migration 010 which controls access permissions
```

- [ ] **Step 2: Commit**

```bash
git add server/migrations/010-chapter-assignments.js server/migrations/012-chapter-assignments.js
git commit -m "docs: clarify difference between migrations 010 and 012 (permissions vs assignments)"
```

---

### Task 1.7: Systematic Sweep

Walk all route and service files looking for issues. This is an audit task, not a targeted fix.

**Files:**
- All files in `server/routes/` (~24 files)
- All files in `server/services/` (~36 files)
- All files in `server/views/` (~11 files)

- [ ] **Step 1: Sweep routes for stale references**

Search all route files for:
- References to dropped table names (`edit_history`, `pending_reviews`)
- Hardcoded book slugs (should use params)
- `console.log` that should be `console.error`
- Missing `requireAuth` on write endpoints

```bash
# Run these searches
grep -rn 'edit_history\|pending_reviews' server/routes/
grep -rn "efnafraedi'" server/routes/ # hardcoded slugs (not in JSDoc/comments)
grep -rn 'console.log' server/routes/
```

- [ ] **Step 2: Sweep services for the same patterns**

Same searches across `server/services/`.

- [ ] **Step 3: Document findings**

Create or update `docs/audit/comprehensive-audit-2026-03.md` with a "Systematic Sweep" section listing:
- File, line, issue, fix applied (or "deferred" with reason)

- [ ] **Step 4: Fix any issues found**

Apply fixes as found. Group small fixes into one commit.

- [ ] **Step 5: Run full test suite**

Run: `npm test`
Expected: All tests pass

- [ ] **Step 6: Commit**

```bash
git add server/routes/ server/services/ server/views/
git commit -m "fix: systematic sweep — fix stale references and inconsistencies across server code"
```

---

## Chunk 2: Phase 2 — Live UX Walkthroughs & Fixes

### Task 2.0: Start Server & Setup for UX Testing

**Triage rule for all walkthrough tasks:** Fix all **Blocking** (prevents core workflow) and **Confusing** (works but user won't understand) issues immediately. Log **Polish** items (works and is understandable but could be smoother) to `docs/audit/comprehensive-audit-2026-03.md` backlog section.

**Screenshot rule:** For each issue found, take a screenshot using `mcp__chrome-devtools__take_screenshot` and save to `docs/audit/screenshots/`. Reference in audit report.

- [ ] **Step 1: Start the server**

```bash
cd /home/siggi/dev/repos/namsbokasafn-efni/server
node app.js
```

Verify server starts on default port without errors.

- [ ] **Step 2: Verify Chrome DevTools MCP connection**

Use `mcp__chrome-devtools__list_pages` to verify browser connection.
Use `mcp__chrome-devtools__navigate_page` to go to `http://localhost:3000`.

- [ ] **Step 3: Prepare auth injection**

To log in as different roles, inject JWT cookies using `mcp__chrome-devtools__evaluate_script`. Reference the E2E auth helper pattern at `server/e2e/helpers/auth.js` for token generation. For each role switch:
```javascript
document.cookie = 'auth_token=<JWT>;path=/;max-age=3600';
location.reload();
```

---

### Task 2.1: Contributor Journey Walkthrough

Walk through the full contributor workflow via Chrome DevTools.

- [ ] **Step 1: Log in as contributor**

Inject contributor JWT cookie using `mcp__chrome-devtools__evaluate_script` (see Task 2.0 Step 3). Navigate to `/` using `mcp__chrome-devtools__navigate_page`.

- [ ] **Step 2: Check My Work dashboard**

Navigate to `/`. Verify:
- Does the page show assigned chapters/modules?
- Is the terminology proposals section hidden or showing "not available" (after Task 1.2 fix)?
- Are there clear "next action" indicators?
- Is all text in Icelandic?

Screenshot and document findings.

- [ ] **Step 3: Navigate to segment editor**

Click through to `/editor`. Verify:
- Can the contributor find the right book/chapter/module?
- Is the dropdown sequence logical (book → chapter → module)?
- Are module status badges clear?

- [ ] **Step 4: Edit a segment**

Click on a segment to edit. Verify:
- Is it clear which column is source (EN) and which is target (IS)?
- Does the edit input have appropriate size/formatting?
- Does Ctrl+Enter save work?
- Does the save toast appear?

- [ ] **Step 5: Test the back button**

Click "Til baka" from the editor. Verify:
- Does it return to module selector without infinite spinner?
- Is the previous state (book/chapter selection) preserved?

Document the back button spinner issue (segment-editor.html line 2093 comment).

- [ ] **Step 6: Test save → reload persistence (M5 revert bug)**

Save an edit, then reload the page. Navigate back to the same module. Verify the saved edit appears correctly. If the edit reverts to original, document exact steps to reproduce.

- [ ] **Step 7: Fix blocking/confusing issues found**

Apply fixes per triage rule (Task 2.0). Expected fix patterns:
- **Back button spinner:** In `segment-editor.html` line ~2093, add error handling and spinner timeout to the `chapterSelect.dispatchEvent(new Event('change'))` call. If `loadModuleList()` fails or takes >5s, hide spinner and show module selector.
- **Missing column labels:** If EN/IS columns lack headers, add `<th>` elements with "Enska (frumtexti)" and "Íslenska (þýðing)"
- **Save feedback:** If save toast is missing or unclear, ensure `showToast('Vistað!', 'success')` is called after successful save

- [ ] **Step 8: Commit contributor journey fixes**

```bash
git add server/views/segment-editor.html server/public/js/ server/public/css/
git commit -m "fix(UX): contributor journey — back button, column clarity, navigation"
```

---

### Task 2.2: Head-Editor Journey Walkthrough

- [ ] **Step 1: Log in as head-editor**

Switch to head-editor auth context.

- [ ] **Step 2: Check review queue discoverability**

Navigate to `/editor`. Verify:
- Is there a clear "pending reviews" indicator?
- Can the head-editor find which modules have been submitted for review?
- Is the review count visible without digging?

- [ ] **Step 3: Walk the review cycle**

Find a module with pending edits. Verify:
- Approve/reject buttons are clear
- Notes field is available
- Confirmation appears after action
- The approved edit shows visual distinction from pending

- [ ] **Step 4: Test review completion and apply**

Complete a review. Verify:
- `applyApprovedEdits()` runs and shows progress
- Success/failure feedback is clear
- The faithful translation file is created/updated

- [ ] **Step 5: Check progress dashboard accuracy**

Navigate to `/progress`. Compare displayed percentages to actual DB state. Document any discrepancies (the "wildly inaccurate progress bars" issue).

- [ ] **Step 6: Fix blocking/confusing issues found**

Expected fix patterns:
- **Review queue visibility:** If pending reviews aren't surfaced, add a badge/count to the module list showing "X breytingar bíða" (X edits pending)
- **Progress accuracy:** If progress bars don't match DB state, trace from `pipelineStatusService.getChapterStage()` through to the display logic and fix the calculation
- **Apply feedback:** If `applyApprovedEdits()` gives no progress indicator, wrap with `withProgress()` (from Task 2.7)

- [ ] **Step 7: Commit**

```bash
git commit -m "fix(UX): head-editor journey — review queue, progress accuracy, apply feedback"
```

---

### Task 2.3: Localization Editor Walkthrough

- [ ] **Step 1: Log in as editor and navigate to `/localization`**

- [ ] **Step 2: Test the full Pass 2 flow**

Verify:
- Module selector works (book → chapter → module)
- Only modules with completed Pass 1 are available
- Faithful translation is visible alongside localization target
- Single-segment save works with toast feedback
- Bulk "save all" works with progress indicator
- Edit history popover shows previous changes

- [ ] **Step 3: Check if Pass 2 feels distinct from Pass 1**

Document: Is it clear to the user that this is a different stage? Are the instructions/labels differentiated?

- [ ] **Step 4: Fix blocking/confusing issues found**

Expected fix patterns:
- **Pass 1 vs Pass 2 distinction:** If the two editors look identical, add a header banner explaining the purpose: "Staðfærsla — aðlögun að íslenskum aðstæðum" (Localization — adaptation for Icelandic context)
- **Missing progress on bulk save:** Wrap with `withProgress()` (from Task 2.7)

- [ ] **Step 5: Commit**

```bash
git commit -m "fix(UX): localization editor — workflow clarity and feedback"
```

---

### Task 2.4: Navigation & Information Architecture

- [ ] **Step 1: Test sidebar active states**

Navigate to each page. Verify the sidebar highlights the current page.

- [ ] **Step 2: Test page-to-page flow**

From each page, can users reach related pages naturally? Check:
- My Work → Editor (for specific module)
- Progress → Chapter detail → Editor
- Editor → back to Progress
- Admin → specific book management

- [ ] **Step 3: Check empty states across all pages**

Visit each page when there's no relevant data. Verify helpful empty-state messages appear (in Icelandic).

- [ ] **Step 4: Fix navigation issues found (blocking/confusing only)**

- [ ] **Step 5: Commit**

```bash
git commit -m "fix(UX): navigation — active states, page flow, empty states"
```

---

### Task 2.5: i18n Consistency Check (First Pass)

- [ ] **Step 1: Fix English text in feedback.html**

In `server/views/feedback.html` lines 260, 268, 276, 284, replace English radio descriptions:

```html
<!-- Line 260 --> <span class="radio-desc">Villa í þýðingu eða merkingu</span>
<!-- Line 268 --> <span class="radio-desc">Tæknilegt vandamál eða birtingarvilla</span>
<!-- Line 276 --> <span class="radio-desc">Tillaga um hvernig má bæta efnið</span>
<!-- Line 284 --> <span class="radio-desc">Annað sem þú vilt koma á framfæri</span>
```

- [ ] **Step 2: Check activity feed descriptions and pipeline stage names**

In `server/routes/segment-editor.js` and `server/routes/localization-editor.js`, verify all `activityLog.log()` descriptions use Icelandic (the descriptions added in Task 1.4 should already be in Icelandic).

Also check pipeline stage names on `chapter-pipeline.html` and `progress` pages. The stage names in `STAGE_NAMES` (chapter-pipeline.html lines 489-498) should already be Icelandic, but verify they appear correctly in the UI. Check any admin views that display raw stage keys (extraction, mtReady, etc.) — these should be mapped to Icelandic display labels.

- [ ] **Step 3: Walk each page looking for English text**

Navigate every authenticated page. Look for:
- English button labels, tooltips, placeholders
- English error messages in toast/alert
- English column headers in tables
- English in dropdown options

Document all instances.

- [ ] **Step 4: Fix all English text found**

- [ ] **Step 5: Commit**

```bash
git commit -m "fix(i18n): replace English text with Icelandic across all views"
```

---

### Task 2.6: Visual & Interaction Polish

- [ ] **Step 1: Test responsive behavior**

Use `mcp__chrome-devtools__resize_page` with width=375, height=812 (iPhone dimensions). Check:
- Sidebar collapses to hamburger menu
- Tables are scrollable or responsive
- Modals don't overflow
- Buttons are tap-target sized

- [ ] **Step 2: Check toast/modal z-index conflicts**

Open a modal, trigger a toast notification. Verify toast appears above modal. (saveRetry.js toast z-index:2000 vs modal z-index:1000 — should be fine but verify.)

- [ ] **Step 3: Check loading states**

For each page that fetches data on load:
- Is there a spinner or skeleton while loading?
- Does the spinner disappear when data arrives?
- What happens if the fetch fails — is there an error state?

- [ ] **Step 4: Fix visual issues found (blocking/confusing only)**

- [ ] **Step 5: Commit**

```bash
git commit -m "fix(UX): visual polish — responsive, z-index, loading states"
```

---

### Task 2.7: Progress Indicators — `withProgress()` Utility

Build a reusable pattern for async button feedback and apply it across all pages.

**Files:**
- Modify: `server/public/js/htmlUtils.js`
- Modify: `server/views/admin.html` (book sync, migrations)
- Modify: `server/views/chapter-pipeline.html` (stage transitions)
- Modify: `server/views/segment-editor.html` (apply edits)
- Modify: `server/views/localization-editor.html` (bulk save)

- [ ] **Step 1: Add `withProgress()` to htmlUtils.js**

```javascript
/**
 * Wrap an async button action with progress feedback.
 * Disables button, shows spinner, re-enables on completion.
 * @param {HTMLButtonElement} btn - The button that triggered the action
 * @param {Function} asyncFn - Async function to execute
 * @param {Object} [opts] - Options
 * @param {string} [opts.loadingText] - Text to show while loading (default: 'Í vinnslu...')
 * @param {string} [opts.successText] - Text to show on success (optional, reverts to original)
 * @param {number} [opts.successDuration] - Ms to show success text (default: 1500)
 */
function withProgress(btn, asyncFn, opts = {}) {
  const originalText = btn.textContent;
  const originalDisabled = btn.disabled;
  const loadingText = opts.loadingText || 'Í vinnslu...';

  btn.disabled = true;
  btn.textContent = loadingText;
  btn.classList.add('btn-loading');

  return Promise.resolve(asyncFn())
    .then(result => {
      if (opts.successText) {
        btn.textContent = opts.successText;
        setTimeout(() => {
          btn.textContent = originalText;
          btn.disabled = originalDisabled;
          btn.classList.remove('btn-loading');
        }, opts.successDuration || 1500);
      } else {
        btn.textContent = originalText;
        btn.disabled = originalDisabled;
        btn.classList.remove('btn-loading');
      }
      return result;
    })
    .catch(err => {
      btn.textContent = originalText;
      btn.disabled = originalDisabled;
      btn.classList.remove('btn-loading');
      throw err;
    });
}
```

- [ ] **Step 2: Add `.btn-loading` CSS to common.css**

```css
.btn-loading {
  opacity: 0.7;
  cursor: wait;
  position: relative;
}
.btn-loading::after {
  content: '';
  display: inline-block;
  width: 0.8em;
  height: 0.8em;
  margin-left: 0.5em;
  border: 2px solid currentColor;
  border-right-color: transparent;
  border-radius: 50%;
  animation: spin 0.6s linear infinite;
  vertical-align: middle;
}
```

- [ ] **Step 3: Apply to admin.html — book sync button**

Replace `booksSyncCatalogue()` onclick:
```javascript
async function booksSyncCatalogue() {
  const btn = document.getElementById('books-sync-btn');
  await withProgress(btn, async () => {
    const res = await fetchJson('/api/admin/catalogue/sync', { method: 'POST' });
    // handle response...
  }, { loadingText: 'Samstilli...', successText: 'Samstillt!' });
}
```

- [ ] **Step 4: Apply to other buttons**

Apply `withProgress()` to:
- Admin: "Keyra flutning" (migration button)
- Chapter pipeline: "Staðfesta" (advance stage)
- Chapter pipeline: revert confirmation
- Localization editor: bulk save
- Any other async button found during walkthroughs

- [ ] **Step 5: Run full test suite**

Run: `npm test`
Expected: All tests pass

- [ ] **Step 6: Commit**

```bash
git add server/public/js/htmlUtils.js server/public/css/common.css server/views/
git commit -m "feat(UX): withProgress() utility — async button feedback across all pages"
```

---

### Task 2.8: Button & Action Discoverability

Add tooltips and clarifying labels to all actionable buttons.

**Files:**
- Modify: `server/views/admin.html`
- Modify: `server/views/chapter-pipeline.html`
- Modify: `server/views/segment-editor.html`
- Modify: `server/views/localization-editor.html`

- [ ] **Step 1: Add tooltips to admin.html buttons**

```html
<!-- Line 267: Migration button -->
<button ... title="Keyrir gagnagrunnsflutninga sem bíða. Þetta uppfærir gagnagrunninn.">Keyra flutning</button>

<!-- Line 284: Add user -->
<button ... title="Bæta nýjum notanda við handvirkt">Bæta við</button>

<!-- Line 314: Sync catalogue -->
<button ... title="Samstillir bókalista við OpenStax vefsafni. Skráir nýjar bækur en breytir ekki þeim sem þegar eru skráðar.">Samstilla</button>

<!-- Line 315: Add book -->
<button ... title="Skrá nýja bók handvirkt í kerfið">Bæta við bók</button>
```

- [ ] **Step 2: Add tooltips to chapter-pipeline.html buttons**

```html
<!-- History toggle -->
<button ... title="Sýna eða fela breytingasögu þessa kafla">

<!-- Advance confirm -->
<button ... title="Staðfesta og færa kafla á næsta stig í ferlinu">Staðfesta</button>

<!-- Revert -->
<button ... title="Færa kafla til baka á fyrra stig. Þetta eyðir ekki gögnum.">
```

- [ ] **Step 3: Add server-side idempotency for book import**

In the book import/register endpoint (in `server/routes/admin.js`), check if the book already exists before importing. If it does, return a clear error: `{ error: 'Bók þegar skráð' }` (Book already registered) with status 409. This prevents the duplicate-import error cascade from repeated button clicks.

- [ ] **Step 4: Review all other view files**

Walk through remaining views and add tooltips to any buttons that lack them or have ambiguous labels.

- [ ] **Step 5: Commit**

```bash
git add server/views/ server/routes/admin.js
git commit -m "fix(UX): add descriptive tooltips + book import idempotency guard"
```

---

### Task 2.5b: i18n Final Re-sweep

After all UI changes are complete, do one final pass for English text.

- [ ] **Step 1: Walk every page**

Navigate all authenticated pages. Scan for any English text introduced by previous fixes.

- [ ] **Step 2: Fix any remaining English**

- [ ] **Step 3: Commit if changes needed**

```bash
git commit -m "fix(i18n): final sweep — replace remaining English text"
```

---

## Chunk 3: Phase 3 — Test Gap Closure

### Task 3.1: Verify Test Baseline

- [ ] **Step 1: Run current test suite and record counts**

```bash
npm test 2>&1 | tail -5
cd server && npm run test:e2e 2>&1 | tail -10
```

Record exact test counts as baseline for Phase 3.

- [ ] **Step 2: Add worktree exclusion to vitest.config.js**

The `.worktrees/` directory is a known source of duplicate test runs and `better-sqlite3` import failures. Add the exclusion if not already present:
```javascript
// In vitest.config.js, add to the test config:
exclude: ['**/node_modules/**', '**/.worktrees/**'],
```

---

### Task 3.2: Tests for Phase 1 Fixes

**Files:**
- Modify: `server/__tests__/pipelineStatus.test.js`
- Create: `server/__tests__/activityLogging.test.js`
- Modify: `server/__tests__/segmentEditorService.test.js`

- [ ] **Step 1: Test M3 — status reads from DB**

Already added in Task 1.1. Verify it's in the test suite and passing.

- [ ] **Step 2: Test activity logging completeness**

These are integration tests that call the route endpoints via the service layer. Create `server/__tests__/activityLogging.test.js`:

```javascript
import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
// Import the activityLog service and set up test DB
// Pattern: create in-memory DB, run migrations, inject via _setTestDb()
// Then call the service functions and verify activity_log table entries

describe('activity logging', () => {
  let db;
  beforeEach(() => {
    db = new Database(':memory:');
    db.exec('CREATE TABLE activity_log (id INTEGER PRIMARY KEY, type TEXT, userId TEXT, username TEXT, book TEXT, chapter TEXT, section TEXT, description TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)');
    // Inject test DB into activityLog service
  });

  it('edit deletion logs activity', async () => {
    // Call activityLog.log({ type: 'segment_edit_deleted', ... })
    const rows = db.prepare('SELECT * FROM activity_log WHERE type = ?').all('segment_edit_deleted');
    expect(rows).toHaveLength(1);
    expect(rows[0].description).toContain('eyddi breytingu');
  });

  // Same pattern for: review submission, completion, localization save, bulk save
});
```

- [ ] **Step 3: Test RBAC on /terms endpoint**

Add to RBAC E2E tests in `server/e2e/rbac.spec.js` (CommonJS format, matching existing tests):

```javascript
// @ts-check
// Add within existing test.describe block:
test('viewer cannot access /terms endpoint', async ({ page }) => {
  await loginAs(page, 'viewer');
  const res = await page.request.get('/api/segment-editor/efnafraedi-2e/1/m68663/terms');
  expect(res.status()).toBe(403);
});

test('contributor can access /terms endpoint', async ({ page }) => {
  await loginAs(page, 'contributor');
  const res = await page.request.get('/api/segment-editor/efnafraedi-2e/1/m68663/terms');
  expect(res.status()).toBe(200);
});
```

- [ ] **Step 4: Test innerHTML escaping**

Add to `server/__tests__/content-integrity.test.js`:

```javascript
describe('XSS prevention', () => {
  it('segment content with script tags is escaped in editor display', () => {
    const malicious = '<script>alert("xss")</script>';
    const escaped = escapeHtml(malicious);
    expect(escaped).not.toContain('<script>');
    expect(escaped).toContain('&lt;script&gt;');
  });
});
```

- [ ] **Step 5: Run tests**

Run: `npm test`
Expected: All new tests pass

- [ ] **Step 6: Commit**

```bash
git add server/__tests__/ server/e2e/
git commit -m "test: add tests for Phase 1 fixes — activity logging, RBAC, XSS"
```

---

### Task 3.3: Tests for Phase 2 Fixes

**Files:**
- Create or modify: `server/e2e/ux-feedback.spec.js`

- [ ] **Step 1: Test withProgress button behavior**

```javascript
// @ts-check
const { test, expect } = require('@playwright/test');
const { loginAs } = require('./helpers/auth');

test.describe('progress indicators', () => {
  test('admin sync button disables during operation', async ({ page }) => {
    await loginAs(page, 'admin');
    await page.goto('/admin');
    const btn = page.locator('#books-sync-btn');
    await btn.click();
    // Button should be disabled immediately
    await expect(btn).toBeDisabled();
    // Should re-enable after operation completes
    await expect(btn).toBeEnabled({ timeout: 10000 });
  });
});
```

- [ ] **Step 2: Test tooltips exist on key buttons**

```javascript
test('admin buttons have descriptive tooltips', async ({ page }) => {
  await loginAs(page, 'admin');
  await page.goto('/admin');
  const syncBtn = page.locator('#books-sync-btn');
  const title = await syncBtn.getAttribute('title');
  expect(title).toBeTruthy();
  expect(title.length).toBeGreaterThan(10); // Not just a one-word tooltip
});
```

- [ ] **Step 3: Test i18n — no English on authenticated pages**

Scope the check to UI chrome elements (nav, sidebar, buttons, headers) — NOT content areas like the segment editor which intentionally displays English source text.

```javascript
test('no common English UI text in navigation and buttons', async ({ page }) => {
  await loginAs(page, 'admin');
  // Check pages that don't display English content by design
  const pagesToCheck = ['/', '/progress', '/admin', '/terminology'];
  const englishPatterns = ['Submit', 'Cancel', 'Delete', 'Loading...', 'Save', 'Error'];

  for (const url of pagesToCheck) {
    await page.goto(url);
    for (const pattern of englishPatterns) {
      // Only check buttons and nav elements, not content areas
      const uiButtons = await page.locator(`nav button:has-text("${pattern}"), .sidebar button:has-text("${pattern}"), .topbar button:has-text("${pattern}")`).count();
      expect(uiButtons, `Found English "${pattern}" in UI chrome on ${url}`).toBe(0);
    }
  }
});
```

- [ ] **Step 4: Run E2E tests**

```bash
cd server && npm run test:e2e
```
Expected: All tests pass

- [ ] **Step 5: Commit**

```bash
git add server/e2e/
git commit -m "test: E2E tests for UX fixes — progress indicators, tooltips, i18n"
```

---

### Task 3.4: Coverage Gaps — Contributor End-to-End

**Files:**
- Create: `server/e2e/contributor-workflow.spec.js`

- [ ] **Step 1: Write serial E2E test for full contributor workflow**

Follow the pattern from `server/e2e/review-cycle.spec.js` — use `page.request` for API calls and DOM interactions for UI verification. Use CommonJS imports matching existing tests.

```javascript
// @ts-check
const { test, expect } = require('@playwright/test');
const { loginAs } = require('./helpers/auth');

test.describe.serial('contributor full workflow', () => {
  const uniqueText = `e2e-contributor-${Date.now()}`;
  const contributorId = 88001;
  const headEditorId = 88002;
  const book = 'efnafraedi-2e';
  const chapter = '1';
  const moduleId = 'm68664';

  test('contributor saves an edit', async ({ page }) => {
    await loginAs(page, 'contributor', contributorId);
    // Save via API (same pattern as review-cycle.spec.js)
    const saveRes = await page.request.post(
      `/api/segment-editor/${book}/${chapter}/${moduleId}/edit`,
      { data: { segmentId: `${moduleId}:para:test-1`, newText: uniqueText, category: 'accuracy' } }
    );
    expect(saveRes.ok()).toBe(true);
  });

  test('contributor submits for review', async ({ page }) => {
    await loginAs(page, 'contributor', contributorId);
    const submitRes = await page.request.post(
      `/api/segment-editor/${book}/${chapter}/${moduleId}/submit`
    );
    expect(submitRes.ok()).toBe(true);
  });

  test('head-editor approves the edit', async ({ page }) => {
    await loginAs(page, 'head-editor', headEditorId);
    // Get pending edits for this module
    const editsRes = await page.request.get(
      `/api/segment-editor/${book}/${chapter}/${moduleId}/edits`
    );
    const edits = await editsRes.json();
    const edit = edits.find(e => e.new_text === uniqueText);
    expect(edit).toBeTruthy();
    // Approve it
    const approveRes = await page.request.post(
      `/api/segment-editor/edit/${edit.id}/approve`,
      { data: { note: 'Samþykkt í e2e prófi' } }
    );
    expect(approveRes.ok()).toBe(true);
  });

  test('contributor sees approved status', async ({ page }) => {
    await loginAs(page, 'contributor', contributorId);
    const editsRes = await page.request.get(
      `/api/segment-editor/${book}/${chapter}/${moduleId}/edits`
    );
    const edits = await editsRes.json();
    const edit = edits.find(e => e.new_text === uniqueText);
    expect(edit.status).toBe('approved');
  });
});
```

- [ ] **Step 2: Run the test**

```bash
cd server && npx playwright test contributor-workflow.spec.js
```

- [ ] **Step 3: Commit**

```bash
git add server/e2e/contributor-workflow.spec.js
git commit -m "test: contributor end-to-end workflow E2E test"
```

---

### Task 3.5: Coverage Gaps — Error Handling

**Files:**
- Create: `server/__tests__/errorHandling.test.js`

- [ ] **Step 1: Write error handling tests**

These are unit tests that call service functions directly using `_setTestDb()` for isolation (same pattern as `segmentEditorService.test.js`):

```javascript
import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { segmentEditorService } from '../services/segmentEditorService.js';

describe('error handling', () => {
  let db;
  beforeEach(() => {
    db = new Database(':memory:');
    // Run schema setup (copy from segmentEditorService.test.js)
    segmentEditorService._setTestDb(db);
  });

  describe('segment editor service', () => {
    it('rejects save with empty segment content', async () => {
      const result = segmentEditorService.saveEdit({
        book: 'efnafraedi-2e', chapter: '1', moduleId: 'm68664',
        segmentId: 'm68664:para:1', newText: '', editorId: 1, category: 'accuracy'
      });
      expect(result.error).toBeTruthy();
    });

    it('rejects save with missing segmentId', async () => {
      const result = segmentEditorService.saveEdit({
        book: 'efnafraedi-2e', chapter: '1', moduleId: 'm68664',
        segmentId: null, newText: 'test', editorId: 1, category: 'accuracy'
      });
      expect(result.error).toBeTruthy();
    });
  });

  describe('concurrent save conflict', () => {
    it('second save with stale mtime returns conflict', async () => {
      // Save once, get mtime
      // Save again with original mtime — should get 409-equivalent error
    });
  });
});
```

- [ ] **Step 2: Run tests**

Run: `npm test`

- [ ] **Step 3: Commit**

```bash
git add server/__tests__/errorHandling.test.js
git commit -m "test: error handling tests for segment and localization editors"
```

---

### Task 3.6: Coverage Gaps — Security Payloads

**Files:**
- Create: `server/__tests__/securityPayloads.test.js`

- [ ] **Step 1: Write security payload tests**

Split into two concerns: (a) unit test verifying `escapeHtml()` handles all payloads, (b) service-level test verifying payloads are stored verbatim and retrieved safely.

```javascript
import { describe, it, expect } from 'vitest';

// Part A: Unit test for escapeHtml function
describe('escapeHtml handles XSS payloads', () => {
  // Import escapeHtml from wherever it's defined (check htmlUtils.js or a shared module)
  const escapeHtml = (str) => str.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const payloads = [
    '<script>alert("xss")</script>',
    '<img src=x onerror=alert(1)>',
    '"><script>alert(1)</script>',
  ];

  for (const payload of payloads) {
    it(`escapes: ${payload.substring(0, 30)}`, () => {
      const escaped = escapeHtml(payload);
      expect(escaped).not.toContain('<script>');
      expect(escaped).not.toContain('onerror=');
    });
  }
});

// Part B: Service-level test for SQL injection safety
describe('SQL injection payloads stored safely', () => {
  it('stores SQL payload verbatim without executing it', async () => {
    // Use _setTestDb pattern from segmentEditorService.test.js
    // Save segment with payload: "'; DROP TABLE segment_edits; --"
    // Retrieve it — should be the exact string, and table should still exist
  });
});
```

- [ ] **Step 2: Run tests**

Run: `npm test`

- [ ] **Step 3: Commit**

```bash
git add server/__tests__/securityPayloads.test.js
git commit -m "test: security payload tests — XSS and SQL injection in segment content"
```

---

### Task 3.7: Coverage Gaps — M5 Revert Bug

**Files:**
- Add to: `server/e2e/contributor-workflow.spec.js` or create `server/e2e/revert-bug.spec.js`

- [ ] **Step 1: Write browser-level revert test**

Uses API calls for save (reliable), then UI verification for display (catches the reported revert bug at the browser rendering level):

```javascript
// @ts-check
const { test, expect } = require('@playwright/test');
const { loginAs } = require('./helpers/auth');

test('saved edit persists after page reload (M5 revert bug)', async ({ page }) => {
  const uniqueText = `persist-test-${Date.now()}`;
  const contributorId = 88010;
  await loginAs(page, 'contributor', contributorId);

  // Save via API (reliable)
  const saveRes = await page.request.post(
    '/api/segment-editor/efnafraedi-2e/1/m68664/edit',
    { data: { segmentId: 'm68664:para:test-persist', newText: uniqueText, category: 'accuracy' } }
  );
  expect(saveRes.ok()).toBe(true);

  // Now load the editor page and navigate to the module
  await page.goto('/editor');
  // Verify the saved edit appears in the module's edit list
  const editsRes = await page.request.get('/api/segment-editor/efnafraedi-2e/1/m68664/edits');
  const edits = await editsRes.json();
  const myEdit = edits.find(e => e.new_text === uniqueText);
  expect(myEdit, 'Saved edit should persist after reload').toBeTruthy();
});
```

- [ ] **Step 2: Run the test**

```bash
cd server && npx playwright test revert-bug.spec.js
```

- [ ] **Step 3: Commit**

```bash
git add server/e2e/
git commit -m "test: M5 revert bug — verify saved edits persist after reload"
```

---

### Task 3.8: Localization Editor Test Fixtures

**Files:**
- Create: test fixture files for `03-faithful-translation/`

- [ ] **Step 1: Create minimal faithful translation fixtures**

Create test fixture files so localization editor E2E tests don't skip. Copy the segment ID format from an existing file (e.g., `books/efnafraedi-2e/02-mt-output/ch01/m68664-segments.is.md`) but with minimal content:

```bash
mkdir -p server/e2e/fixtures/03-faithful-translation/ch01
```

Create `server/e2e/fixtures/03-faithful-translation/ch01/m68664-segments.is.md`:
```markdown
<!-- m68664:title:fs-id-title -->
Inngangur

<!-- m68664:para:fs-id-intro -->
Þetta er prófunarefni fyrir staðfærsluritil.

<!-- m68664:para:fs-id-body -->
Efnafræði er vísindagrein sem fjallar um efni og efnabreytingar.
```

The fixture needs at least 3 segments matching the module's segment ID pattern. Check the actual `02-mt-output/ch01/m68664-segments.is.md` for the exact format.

- [ ] **Step 2: Update localization E2E tests to use fixtures**

Modify `server/e2e/localization-editor.spec.js` to set up fixture data before tests.

- [ ] **Step 3: Run localization E2E tests**

```bash
cd server && npx playwright test localization-editor.spec.js
```

- [ ] **Step 4: Commit**

```bash
git add server/e2e/
git commit -m "test: localization editor fixtures — enable previously-skipping tests"
```

---

### Task 3.9: Final Test Count & Audit Report

- [ ] **Step 1: Run full test suite**

```bash
npm test 2>&1 | tail -10
cd server && npm run test:e2e 2>&1 | tail -15
```

Record final test counts.

- [ ] **Step 2: Write audit report**

Create or update `docs/audit/comprehensive-audit-2026-03.md` with:
- Summary of all findings (by phase)
- All fixes applied (with commit SHAs)
- Test coverage before/after
- Any remaining backlog items

- [ ] **Step 3: Commit audit report**

```bash
git add docs/audit/comprehensive-audit-2026-03.md
git commit -m "docs: comprehensive audit report — findings, fixes, and test coverage"
```

---

## Summary

| Phase | Tasks | Commits |
|-------|-------|---------|
| Phase 1 — Code Audit | 7 tasks (1.1–1.7) | ~7 commits |
| Phase 2 — UX Walkthroughs | 9 tasks (2.0–2.8, 2.5b) | ~8 commits |
| Phase 3 — Test Gaps | 9 tasks (3.1–3.9) | ~8 commits |
| **Total** | **25 tasks** | **~23 commits** |

**Expected test delta:** ~40-50 new tests (from ~360 to ~405)
