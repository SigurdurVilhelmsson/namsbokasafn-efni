# Unified Progress Reporting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace 4 conflicting progress metrics with one consistent editorial completion percentage (distinct approved segments / total segments) across all UI surfaces.

**Architecture:** Add a centralized `getEditorialProgress(book)` function in `segmentEditorService.js` that returns per-chapter and book-wide totals. All pages call this one function. The SQL counts distinct segment_ids with approved status (not edit records). Total segments come from `segmentParser.countModuleSegments()`.

**Tech Stack:** Express 5, better-sqlite3, vanilla JS, Vitest

**Spec:** `docs/superpowers/specs/2026-03-30-progress-consistency-design.md`

---

### Task 1: Create centralized getEditorialProgress function

**Files:**
- Modify: `server/services/segmentEditorService.js`
- Create: `server/__tests__/editorialProgress.test.js`

- [ ] **Step 1: Write the test**

Create `server/__tests__/editorialProgress.test.js`:

```javascript
const { describe, it, expect, beforeAll, afterAll } = require('vitest');

// We test getEditorialProgress via the service module
// It needs a DB with segment_edits and filesystem with EN segment files

describe('getEditorialProgress', () => {
  it('is exported from segmentEditorService', () => {
    const service = require('../services/segmentEditorService');
    expect(typeof service.getEditorialProgress).toBe('function');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npx vitest run __tests__/editorialProgress.test.js`
Expected: FAIL — `getEditorialProgress` is not exported

- [ ] **Step 3: Implement getEditorialProgress**

In `server/services/segmentEditorService.js`, add the function. Read the file first to find the exports and the `getDb()` pattern used by other functions (e.g., `getBookEditsByModule` at line 820).

The function combines a DB query for edit counts with filesystem calls for segment totals:

```javascript
/**
 * Get editorial progress for a book, broken down by chapter.
 * Uses distinct segment counts (not edit record counts) for accuracy.
 *
 * @param {string} book - Book slug
 * @returns {{ chapters: Object<number, {approvedSegments, editedSegments, totalSegments, percentComplete}>, summary: {approvedSegments, editedSegments, totalSegments, percentComplete, modulesComplete, totalModules} }}
 */
function getEditorialProgress(book) {
  const conn = getDb();

  // 1. Get distinct segment counts per chapter from DB
  const editRows = conn
    .prepare(
      `SELECT
        chapter,
        COUNT(DISTINCT segment_id) as edited_segments,
        COUNT(DISTINCT CASE WHEN status = 'approved' THEN segment_id ELSE NULL END) as approved_segments
      FROM segment_edits
      WHERE book = ?
      GROUP BY chapter`
    )
    .all(book);

  // Index by chapter
  const editMap = {};
  for (const row of editRows) {
    editMap[row.chapter] = row;
  }

  // 2. Get segment totals from filesystem
  const chapterNums = segmentParser.listChapters(book);
  const chapters = {};
  let totalApproved = 0;
  let totalEdited = 0;
  let totalSegments = 0;
  let modulesComplete = 0;
  let totalModules = 0;

  for (const chNum of chapterNums) {
    const chLabel = chNum === -1 ? 'appendices' : String(chNum);
    const modules = segmentParser.listChapterModules(book, chNum);
    let chSegments = 0;

    for (const mod of modules) {
      const segCount = segmentParser.countModuleSegments(book, chLabel, mod.moduleId);
      chSegments += segCount;
      totalModules++;

      // A module is "complete" if it has approved segments == total segments
      // We need per-module approved count for this — get from the detailed query
      // For now, module completion uses the existing getBookEditsByModule approach
    }

    const edits = editMap[chLabel] || { approved_segments: 0, edited_segments: 0 };
    const approved = edits.approved_segments;
    const edited = edits.edited_segments;

    chapters[chNum] = {
      approvedSegments: approved,
      editedSegments: edited,
      totalSegments: chSegments,
      percentComplete: chSegments > 0 ? Math.round((approved / chSegments) * 1000) / 10 : 0,
    };

    totalApproved += approved;
    totalEdited += edited;
    totalSegments += chSegments;
  }

  // Module completion: reuse existing getBookEditsByModule for per-module record counts.
  // Module completion logic is unchanged from the existing status.js approach —
  // a module is "complete" when approved edit records >= segment count.
  // This is the one place we still use record counts (not distinct segments),
  // because module completion needs per-module granularity that our chapter-level
  // distinct query doesn't provide. Acceptable approximation for the stat card.
  const moduleEdits = getBookEditsByModule(book);
  const moduleEditMap = {};
  for (const row of moduleEdits) {
    moduleEditMap[row.module_id] = row;
  }

  for (const chNum of chapterNums) {
    const chLabel = chNum === -1 ? 'appendices' : String(chNum);
    const modules = segmentParser.listChapterModules(book, chNum);
    for (const mod of modules) {
      const segCount = segmentParser.countModuleSegments(book, chLabel, mod.moduleId);
      const edits = moduleEditMap[mod.moduleId];
      if (edits && segCount > 0) {
        const approvedRecords = (edits.approved || 0) + (edits.applied || 0);
        if (approvedRecords >= segCount) {
          modulesComplete++;
        }
      }
    }
  }

  return {
    chapters,
    summary: {
      approvedSegments: totalApproved,
      editedSegments: totalEdited,
      totalSegments,
      totalModules,
      modulesComplete,
      percentComplete: totalSegments > 0 ? Math.round((totalApproved / totalSegments) * 1000) / 10 : 0,
    },
  };
}
```

**Important:** This function requires `segmentParser` to be available. Read the top of `segmentEditorService.js` to see how other services are imported — it likely requires segmentParser at the top. If not, add:
```javascript
const segmentParser = require('./segmentParser');
```

Also add `getEditorialProgress` to the `module.exports` object at the bottom of the file.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd server && npx vitest run __tests__/editorialProgress.test.js`
Expected: PASS

- [ ] **Step 5: Run full test suite**

Run: `cd server && npx vitest run`
Expected: All tests pass — no regressions

- [ ] **Step 6: Commit**

```bash
git add server/services/segmentEditorService.js server/__tests__/editorialProgress.test.js
git commit -m "feat(progress): add centralized getEditorialProgress function"
```

---

### Task 2: Update progress page to use centralized function

**Files:**
- Modify: `server/routes/status.js` (lines 889-1045)
- Modify: `server/views/status.html` (lines 495-558)

- [ ] **Step 1: Read the current editorial-progress route**

Read `server/routes/status.js` lines 889-1045 to understand the full current implementation.

- [ ] **Step 2: Simplify the route to use getEditorialProgress**

Replace the inline calculation in the `/:book/editorial-progress` route (lines ~919-1014) with a call to the centralized function. The key change: the route currently builds its own aggregation from `getBookEditsByModule` + `countModuleSegments`. Replace with:

```javascript
const progress = segmentEditorService.getEditorialProgress(book);
```

Then map the response to the existing API shape so the client doesn't break:

```javascript
// Build chapter array matching existing response shape
const chapterProgress = chapters.map((chapterNum) => {
  const chData = progress.chapters[chapterNum] || {
    approvedSegments: 0, editedSegments: 0, totalSegments: 0, percentComplete: 0,
  };

  return {
    chapter: chapterNum,
    // ... keep existing fields like title, modules list, attention items
    segmentsTotal: chData.totalSegments,
    segmentsApproved: chData.approvedSegments,
    segmentsEdited: chData.editedSegments,
    percentComplete: chData.percentComplete,
  };
});
```

Update the summary section:

```javascript
summary: {
  totalModules: progress.summary.totalModules,
  totalSegments: progress.summary.totalSegments,
  segmentsEdited: progress.summary.editedSegments,
  segmentsApproved: progress.summary.approvedSegments,
  modulesComplete: progress.summary.modulesComplete,
  percentComplete: progress.summary.percentComplete,
},
```

**Keep** the attention items logic (pending reviews, discuss edits) — that's separate from progress and should remain.

- [ ] **Step 3: Update stat card labels in status.html**

In `server/views/status.html`, find the stat card HTML (search for `stat-segments-approved` and `stat-segments-edited`). Update the labels:

```html
<!-- Before: "HLUTIR SAMÞYKKTIR" (Items approved) -->
<!-- After: -->
BÚTAR SAMÞYKKTIR

<!-- Before: "HLUTIR YFIRFARNIR" (Items reviewed) -->
<!-- After: -->
BÚTAR Í VINNSLU
```

Also update the JS rendering at lines 495-502. The `segmentsEdited` stat should now show `editedSegments - approvedSegments` (the "in progress" count, not the total edited):

```javascript
document.getElementById('stat-segments-approved').textContent =
  formatNum(s.segmentsApproved);
document.getElementById('stat-segments-edited').textContent =
  formatNum(Math.max(0, s.segmentsEdited - s.segmentsApproved));
```

- [ ] **Step 4: Verify in browser**

Navigate to `http://localhost:3000/progress` — check that:
1. The stat cards show new labels (BÚTAR SAMÞYKKTIR, BÚTAR Í VINNSLU)
2. The approved count is now a distinct segment count (should be ≤ edited count)
3. The chapter bars still render correctly
4. The percentage is consistent with the approved count

- [ ] **Step 5: Commit**

```bash
git add server/routes/status.js server/views/status.html
git commit -m "refactor(progress): use centralized editorial progress, fix stat labels"
```

---

### Task 3: Update library book card to use editorial progress

**Files:**
- Modify: `server/routes/admin.js` (book listing endpoint)
- Modify: `server/views/books.html` (lines 1290-1295)

- [ ] **Step 1: Read the current book listing**

Read `server/routes/admin.js` to find the GET `/books` endpoint that returns registered books with progress data. Also read `server/views/books.html` lines 1280-1310 to see the 3-way fallback.

- [ ] **Step 2: Add editorial progress to book listing response**

In the admin route that returns books (the one that populates the library page), add an `editorialProgress` field to each book. After fetching the books list, loop through registered books and call `getEditorialProgress`:

```javascript
const segmentEditorService = require('../services/segmentEditorService');

// Inside the books listing handler, after getting the books array:
for (const book of books) {
  try {
    const progress = segmentEditorService.getEditorialProgress(book.slug);
    book.editorialProgress = {
      percent: progress.summary.percentComplete,
      approvedSegments: progress.summary.approvedSegments,
      totalSegments: progress.summary.totalSegments,
    };
  } catch {
    book.editorialProgress = { percent: 0, approvedSegments: 0, totalSegments: 0 };
  }
}
```

**Note:** `segmentEditorService` may not be imported yet in admin.js. Check the imports at the top. If not present, add: `const segmentEditorService = require('../services/segmentEditorService');`

- [ ] **Step 3: Replace the 3-way fallback in books.html**

In `server/views/books.html` around lines 1290-1295, replace the fallback chain:

```javascript
// Before (3-way fallback):
var pct = book.statusProgress && book.statusProgress.pct > 0
  ? book.statusProgress.pct
  : (book.pipelineProgress && book.pipelineProgress.total > 0
    ? Math.round((book.pipelineProgress.faithful / book.pipelineProgress.total) * 100)
    : book.progress);

// After (single source):
var pct = book.editorialProgress ? book.editorialProgress.percent : 0;
```

Also update the text display (search for where `pct` is rendered with "lokið"):

```javascript
// The label should show: "X% lokið" using the editorial progress
escapeHtml(pct + '% lokið')
```

- [ ] **Step 4: Verify in browser**

Navigate to `http://localhost:3000/library` — the book card should now show the same percentage as the progress page (both using distinct approved segments / total segments).

- [ ] **Step 5: Commit**

```bash
git add server/routes/admin.js server/views/books.html
git commit -m "fix(library): use editorial progress instead of pipeline-stage fallback"
```

---

### Task 4: Add progress data to assignments page

**Files:**
- Modify: `server/routes/admin.js` (assignments endpoint)
- Modify: `server/public/js/assignments.js`

- [ ] **Step 1: Extend the assignments API with progress data**

In `server/routes/admin.js`, find the `GET /assignments/:book` route (around line 944). Add progress data to the response:

```javascript
router.get('/assignments/:book', requireAuth, requireRole(ROLES.HEAD_EDITOR), (req, res) => {
  const { book } = req.params;
  if (!VALID_BOOKS.includes(book)) {
    return res.status(400).json({ error: `Invalid book: ${book}` });
  }

  try {
    const assignments = userService.getBookAssignments(book);
    const editors = userService.getEditorsForBook(book);

    // Add editorial progress per chapter
    let chapterProgress = {};
    try {
      const progress = segmentEditorService.getEditorialProgress(book);
      chapterProgress = progress.chapters;
    } catch {
      // Progress data is optional — don't fail the whole request
    }

    res.json({ book, assignments, editors, chapterProgress });
  } catch (err) {
    log.error({ err }, 'Get book assignments error');
    res.status(500).json({ error: err.message });
  }
});
```

Make sure `segmentEditorService` is imported at the top of admin.js. It was likely added in Task 3 — if not, add: `const segmentEditorService = require('../services/segmentEditorService');`

- [ ] **Step 2: Render progress in assignments.js**

In `server/public/js/assignments.js`, find the `loadAssignments` function. The API now returns `chapterProgress`. Update the merge logic to attach progress data to each chapter:

In the `.then()` handler where chapters are merged (look for `(chapterList && chapterList.chapters)`), add:

```javascript
const chapterProgress = adminData.chapterProgress || {};
```

Then when building each chapter object, add the progress:

```javascript
const chProgress = chapterProgress[ch.chapter] || { percentComplete: 0 };
return Object.assign({}, ch, {
  assignment: assignmentMap[ch.chapter] || null,
  progress: chProgress,
});
```

- [ ] **Step 3: Update renderTable to show progress bars**

In the `renderTable` function, find the cell that currently shows `'<td>—</td>'` for FRAMVINDA. Replace with a progress bar:

```javascript
// Replace: '<td>—</td>'
// With:
'<td class="col-progress">' +
  '<div class="progress-mini">' +
    '<div class="progress-mini-fill" style="width:' + (ch.progress.percentComplete || 0) + '%"></div>' +
  '</div>' +
  '<span class="progress-mini-label">' + (ch.progress.percentComplete || 0) + '%</span>' +
'</td>'
```

- [ ] **Step 4: Add CSS for mini progress bars**

In `server/public/css/common.css`, add:

```css
/* Mini progress bar for assignments table */
.col-progress {
  min-width: 100px;
}

.progress-mini {
  display: inline-block;
  width: 60px;
  height: 6px;
  background: var(--border-light, #e8e2d8);
  border-radius: 3px;
  overflow: hidden;
  vertical-align: middle;
  margin-right: 0.5rem;
}

.progress-mini-fill {
  height: 100%;
  background: var(--accent, #c87941);
  border-radius: 3px;
  transition: width 0.3s ease;
}

.progress-mini-label {
  font-size: 0.8rem;
  color: var(--text-secondary, #8a7e72);
}
```

- [ ] **Step 5: Verify in browser**

Navigate to `http://localhost:3000/assignments?book=efnafraedi-2e` — the FRAMVINDA column should now show small progress bars with percentages instead of "—".

- [ ] **Step 6: Commit**

```bash
git add server/routes/admin.js server/public/js/assignments.js server/public/css/common.css
git commit -m "feat(assignments): show editorial progress per chapter"
```

---

### Task 5: Final verification

- [ ] **Step 1: Run all tests**

```bash
cd /home/siggi/dev/repos/namsbokasafn-efni && npm test
```

Expected: All tests pass.

- [ ] **Step 2: Cross-page consistency check**

Using Chrome DevTools, verify that the SAME percentage is shown for the same book across all surfaces:

1. `/progress` (Efnafræði 2e) — note the `heildarframvinda` percentage and K1 percentage
2. `/library` — note the book card percentage for Efnafræði 2e
3. `/assignments?book=efnafraedi-2e` — note K1's FRAMVINDA percentage

All three should show identical numbers for the same scope.

- [ ] **Step 3: Verify stat card logic**

On `/progress`, verify:
- "BÚTAR SAMÞYKKTIR" ≤ "BÚTAR Í VINNSLU" + "BÚTAR SAMÞYKKTIR" (the funnel is logical)
- The percentage equals `approved / total * 100`
- K1 bar percentage matches the per-chapter number

- [ ] **Step 4: Commit any fixes**

If verification reveals issues, fix and commit.
