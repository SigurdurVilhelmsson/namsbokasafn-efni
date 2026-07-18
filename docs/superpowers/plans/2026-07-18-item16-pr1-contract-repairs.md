# Item 16 PR1 — Dashboard/View Contract Repairs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the seven mechanical view↔route contract mismatches (F11, F12, F13, F18, F26, F27, F31) so dashboards show truthful data, and ship the anti-recurrence infrastructure (endpoint-contract reference + static-pin test suite).

**Architecture:** Server-side fixes are surgical (one query-param read, one SQL predicate pair, two one-line count formulas); everything else is view-side reads aligned to what routes actually send. New `server/__tests__/viewRouteContracts.test.js` pins view source reads statically (no jsdom infra exists — same mechanism as `clientMessageContracts.test.js`); behavioral fixes get route-harness/service tests in the existing idioms.

**Tech Stack:** Node 22 / Express 5 / better-sqlite3 / Vitest. Views are inline ES5-style scripts in `server/views/*.html` (use `var`, string-concat HTML, `escapeHtml`).

**Spec:** `docs/superpowers/specs/2026-07-18-item16-dashboard-contract-design.md` (§3). All file:line refs current at branch point `3610e0c3`; match by pattern if drifted.

## Global Constraints

- Branch: `fix/item16-pr1-contract-repairs` (exists; spec committed).
- `npm test` from **repo root** is the authoritative gate (never `--project server` — broken under vitest 4.1.10; scope by path instead: `npx vitest run server/__tests__/<file>`).
- Test files that reach any service MUST pin `process.env.SESSIONS_DB_PATH` (and `JWT_SECRET` if a route file is required) **before any `require` of server code** (campaign lesson: unpinned tests polluted the real dev DB).
- NO authz changes (the `GET /api/activity` HEAD_EDITOR gate stays — register I16-R4).
- NO behavior changes beyond the seven findings; UI strings Icelandic.
- Commit after every task; end commit messages with `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- F18 makes reported completion numbers DROP — that is correct behavior; do not "fix" dashboards back.

---

### Task 1: F13 — term-lookup route reads `bookSlug`

**Files:**
- Modify: `server/routes/segment-editor.js:100,107`
- Test: `server/__tests__/termLookupBookSlug.test.js` (create)

**Interfaces:**
- Consumes: `terminologyService.lookupTerm(query, bookSlug)` — second param is a slug **string** or null (see `server/services/terminologyService.js:175`). Client already sends `bookSlug` (`server/public/js/segment-editor.js:2263`).
- Produces: no new interfaces — route behavior only.

- [ ] **Step 1: Write the failing test**

Create `server/__tests__/termLookupBookSlug.test.js`:

```js
/**
 * F13 (item 16 PR1): the segment-editor term-lookup route must read the
 * bookSlug the client actually sends (public/js/segment-editor.js:2263)
 * and pass it to lookupTerm as a slug string — the old `bookId` read was
 * never sent by any caller, so book-priority ranking never applied.
 * Harness idiom: handler extraction + monkey-patched service, cf.
 * statusChapterRoute.test.js (bypasses router-level middleware).
 */
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

const work = mkdtempSync(path.join(tmpdir(), 'termlookup-'));
process.env.SESSIONS_DB_PATH = path.join(work, 'sessions.db');
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';

let handler;
let terminology;
let origLookup;
let captured;

function invoke(h, req) {
  let resolveResult;
  const done = new Promise((resolve) => {
    resolveResult = resolve;
  });
  const res = {
    statusCode: 200,
    status(c) {
      this.statusCode = c;
      return this;
    },
    json(body) {
      resolveResult({ status: this.statusCode, body });
    },
  };
  return Promise.resolve(h(req, res)).then(() => done);
}

beforeAll(() => {
  const { runAllMigrations } = require('../services/migrationRunner');
  runAllMigrations();

  terminology = require('../services/terminologyService');
  origLookup = terminology.lookupTerm;
  terminology.lookupTerm = (q, bookSlug) => {
    captured = { q, bookSlug };
    return [];
  };

  const router = require('../routes/segment-editor');
  const layer = router.stack.find(
    (l) => l.route && l.route.path === '/terminology/lookup' && l.route.methods.get
  );
  handler = layer.route.stack[layer.route.stack.length - 1].handle;
});

afterAll(() => {
  terminology.lookupTerm = origLookup;
  rmSync(work, { recursive: true, force: true });
});

describe('GET /terminology/lookup (segment-editor router)', () => {
  it('passes the client-sent bookSlug through as a slug string', async () => {
    captured = undefined;
    const r = await invoke(handler, { query: { q: 'orka', bookSlug: 'liffraedi-2e' } });
    expect(r.status).toBe(200);
    expect(captured).toEqual({ q: 'orka', bookSlug: 'liffraedi-2e' });
  });

  it('passes null when no book context is sent', async () => {
    captured = undefined;
    const r = await invoke(handler, { query: { q: 'orka' } });
    expect(r.status).toBe(200);
    expect(captured.bookSlug).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run server/__tests__/termLookupBookSlug.test.js`
Expected: FAIL — `captured` is `{ q: 'orka', bookSlug: null }` for the first case (route reads the never-sent `bookId`).

- [ ] **Step 3: Fix the route**

In `server/routes/segment-editor.js`, the `/terminology/lookup` handler (~line 99). Replace:

```js
  const { q, bookId } = req.query;
```
with:
```js
  const { q, bookSlug } = req.query;
```
and replace:
```js
    const terms = terminology.lookupTerm(q, bookId ? parseInt(bookId, 10) : null);
```
with (mirrors the already-correct sibling `routes/terminology.js:86-93`):
```js
    const terms = terminology.lookupTerm(q, bookSlug || null);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run server/__tests__/termLookupBookSlug.test.js`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add server/routes/segment-editor.js server/__tests__/termLookupBookSlug.test.js
git commit -m "fix(server): term-lookup route reads bookSlug the client sends (F13, item 16 PR1)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: F18 — progress formula stops double-counting applied work

**Files:**
- Modify: `server/services/segmentEditorService.js:1333`
- Modify: `server/routes/status.js:979`
- Test: `server/__tests__/progressDoubleCount.test.js` (create)

**Interfaces:**
- Consumes: `getBookEditsByModule(book)` per-module counts where SQL guarantees `applied` ⊂ `approved` (`segmentEditorService.js:1261` counts `status='approved'`; `:1264` counts `status='approved' AND applied_at IS NOT NULL`). Do NOT change that SQL.
- Produces: `getEditorialProgress(book).summary.modulesComplete` and the `/:book/editorial-progress` route's `moduleDetails[].segmentsApproved`/`status` now use the `approved` count alone.

- [ ] **Step 1: Write the failing test**

Create `server/__tests__/progressDoubleCount.test.js`:

```js
/**
 * F18 (item 16 PR1): `applied` is a strict subset of `approved` by SQL
 * construction (apply stamps applied_at, status stays 'approved'), so
 * approved + applied double-counts every applied segment. A module with
 * 1-of-2 segments approved-and-applied must NOT report complete.
 * Two halves: service (getEditorialProgress) and route
 * (/:book/editorial-progress moduleDetails) — handler-extraction idiom
 * cf. statusChapterRoute.test.js.
 */
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

const work = mkdtempSync(path.join(tmpdir(), 'dblcount-'));
process.env.SESSIONS_DB_PATH = path.join(work, 'sessions.db');
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';

const BOOK = 'synthetic-dblcount-book';
const MODULE = 'm99902';

let service;
let progressHandler;
let segmentParser;
let realBooksDir;

function invoke(h, req) {
  let resolveResult;
  const done = new Promise((resolve) => {
    resolveResult = resolve;
  });
  const res = {
    statusCode: 200,
    status(c) {
      this.statusCode = c;
      return this;
    },
    json(body) {
      resolveResult({ status: this.statusCode, body });
    },
  };
  return Promise.resolve(h(req, res)).then(() => done);
}

beforeAll(() => {
  const { runAllMigrations } = require('../services/migrationRunner');
  runAllMigrations();

  segmentParser = require('../services/segmentParser');
  realBooksDir = segmentParser.BOOKS_DIR;
  const booksDir = path.join(work, 'books');
  const chDir = path.join(booksDir, BOOK, '02-for-mt', 'ch01');
  mkdirSync(chDir, { recursive: true });
  writeFileSync(
    path.join(chDir, `${MODULE}-segments.en.md`),
    `<!-- SEG:${MODULE}:para:fs-id001 -->\nFirst.\n\n<!-- SEG:${MODULE}:para:fs-id002 -->\nSecond.\n`
  );
  segmentParser._setTestBooksDir(booksDir);

  const { VALID_BOOKS } = require('../config');
  VALID_BOOKS.push(BOOK);

  // ONE approved edit, already applied, on a 2-segment module. Old formula:
  // approved(1) + applied(1) = 2 >= 2 → falsely complete.
  const Database = require('better-sqlite3');
  const db = new Database(process.env.SESSIONS_DB_PATH);
  db.prepare(
    `INSERT INTO segment_edits
       (book, chapter, module_id, segment_id, original_content, edited_content,
        status, editor_id, editor_username, applied_at)
     VALUES (?, ?, ?, ?, ?, ?, 'approved', 'ed1', 'editor1', datetime('now'))`
  ).run(BOOK, 1, MODULE, `${MODULE}:para:fs-id001`, 'First.', 'Fyrsti.');
  db.close();

  service = require('../services/segmentEditorService');
  const router = require('../routes/status');
  const progressLayer = router.stack.find(
    (l) => l.route && l.route.path === '/:book/editorial-progress' && l.route.methods.get
  );
  progressHandler = progressLayer.route.stack[progressLayer.route.stack.length - 1].handle;
});

afterAll(() => {
  segmentParser._setTestBooksDir(realBooksDir);
  const { VALID_BOOKS } = require('../config');
  const idx = VALID_BOOKS.indexOf(BOOK);
  if (idx !== -1) VALID_BOOKS.splice(idx, 1);
  rmSync(work, { recursive: true, force: true });
});

describe('applied-and-approved segments are counted once (F18)', () => {
  it('service: a half-reviewed module is not modulesComplete', () => {
    const progress = service.getEditorialProgress(BOOK);
    expect(progress.summary.modulesComplete).toBe(0);
  });

  it('route: moduleDetails reports 1 approved segment, status in-progress', async () => {
    const r = await invoke(progressHandler, { params: { book: BOOK }, query: {} });
    expect(r.status).toBe(200);
    const ch = r.body.chapters.find((c) => String(c.chapter) === '1');
    const mod = ch.moduleDetails.find((m) => m.moduleId === MODULE);
    expect(mod.segmentsApproved).toBe(1);
    expect(mod.status).toBe('in-progress');
  });
});
```

NOTE: if the route response nests chapters differently (check the actual shape while running the RED test — `r.body` may be `{ book, chapters: [...] }` or keyed object), adjust the two lookup lines to the real shape; the assertions themselves stand.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run server/__tests__/progressDoubleCount.test.js`
Expected: FAIL — `modulesComplete` is 1 and `segmentsApproved` is 2 / `status` is `'complete'` (the double-count).

- [ ] **Step 3: Fix both formulas**

`server/services/segmentEditorService.js` (~:1333). Replace:

```js
        const approvedRecords = (modEdits.approved || 0) + (modEdits.applied || 0);
```
with:
```js
        // applied ⊂ approved by SQL construction (applied_at is a stamp on an
        // 'approved' row) — approved alone is the whole reviewed count (F18).
        const approvedRecords = modEdits.approved || 0;
```

`server/routes/status.js` (~:979). Replace:

```js
        const approved = edits ? edits.approved + edits.applied : 0;
```
with:
```js
        const approved = edits ? edits.approved : 0;
```

Do not touch the `getBookEditsByModule` SQL — the `applied` column stays (other consumers may read it).

- [ ] **Step 4: Run the new test and the neighbors to verify no collateral**

Run: `npx vitest run server/__tests__/progressDoubleCount.test.js server/__tests__/editorialProgress.test.js server/__tests__/statusChapterRoute.test.js`
Expected: ALL PASS (editorialProgress's fixture has approved-unapplied rows: 2 approved ≥ 2 segments still complete).

- [ ] **Step 5: Commit**

```bash
git add server/services/segmentEditorService.js server/routes/status.js server/__tests__/progressDoubleCount.test.js
git commit -m "fix(server): progress formulas stop double-counting applied segments (F18, item 16 PR1)

Reported completion counts drop where modules had applied work —
that inflation was the bug, not the new numbers.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: F12 server half — activity search supports the chapter filter

**Files:**
- Modify: `server/services/activityLog.js:110-124` (search + count SQL), `:224-238` (search())
- Modify: `server/routes/activity.js:25-34`
- Test: `server/__tests__/activityChapterFilter.test.js` (create)

**Interfaces:**
- Consumes: `activityLog.log(options)` (never-throws) to seed rows; `search(options)` returns `{ activities, total, limit, offset }` with `parseRow` camelCase rows.
- Produces: `search({ ..., chapter })` — `chapter` is coerced `String(chapter)` and compared against `CAST(chapter AS TEXT)` (activity_log.chapter storage is TEXT-affinity but historical rows may be mixed number/string — the CAST makes both match; appendices rows store `String(-1)` per I14-R7). Route forwards `chapter: chapter || null`. Task 4's client relies on the filter actually working.

- [ ] **Step 1: Write the failing test**

Create `server/__tests__/activityChapterFilter.test.js`:

```js
/**
 * F12 server half (item 16 PR1): the chapter activity panel sends
 * ?chapter=N, but search() had no chapter predicate — the panel silently
 * showed whole-book activity. Chapter compare is CAST(chapter AS TEXT) = ?
 * with String() coercion so number/string storage both match (I14-R7:
 * appendices rows store String(-1)).
 */
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createRequire } from 'module';
import fs from 'fs';

const require = createRequire(import.meta.url);

const work = mkdtempSync(path.join(tmpdir(), 'actchapter-'));
process.env.SESSIONS_DB_PATH = path.join(work, 'sessions.db');

const BOOK = 'synthetic-actfilter-book';
let activityLog;

beforeAll(() => {
  const { runAllMigrations } = require('../services/migrationRunner');
  runAllMigrations();
  activityLog = require('../services/activityLog');

  activityLog.log({
    type: 'segment_edit_saved', userId: 'u1', username: 'ed1',
    book: BOOK, chapter: 1, description: 'ch1 edit',
  });
  activityLog.log({
    type: 'segment_edit_saved', userId: 'u1', username: 'ed1',
    book: BOOK, chapter: '2', description: 'ch2 edit',
  });
});

afterAll(() => {
  rmSync(work, { recursive: true, force: true });
});

describe('activityLog.search chapter filter (F12)', () => {
  it('filters by chapter regardless of number/string storage', () => {
    const asNumber = activityLog.search({ book: BOOK, chapter: 1 });
    expect(asNumber.activities.map((a) => a.description)).toEqual(['ch1 edit']);
    expect(asNumber.total).toBe(1);

    const asString = activityLog.search({ book: BOOK, chapter: '2' });
    expect(asString.activities.map((a) => a.description)).toEqual(['ch2 edit']);
  });

  it('omitting chapter returns all book rows (unchanged behavior)', () => {
    const all = activityLog.search({ book: BOOK });
    expect(all.total).toBe(2);
  });

  it('route destructures chapter and forwards it', () => {
    const src = fs.readFileSync(require.resolve('../routes/activity.js'), 'utf8');
    expect(src).toMatch(/const\s*\{\s*book,\s*type,\s*user,\s*chapter\b/);
    expect(src).toMatch(/chapter:\s*chapter\s*\|\|\s*null/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run server/__tests__/activityChapterFilter.test.js`
Expected: FAIL — chapter filter returns both rows (`total` 2), route pin fails.

- [ ] **Step 3: Implement the filter**

`server/services/activityLog.js` — in `initStatements`, extend the two prepared statements:

```js
    search: db.prepare(`
      SELECT * FROM activity_log
      WHERE (book = ? OR ? IS NULL)
        AND (type = ? OR ? IS NULL)
        AND (user_id = ? OR ? IS NULL)
        AND (CAST(chapter AS TEXT) = ? OR ? IS NULL)
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `),
    count: db.prepare(`
      SELECT COUNT(*) as count FROM activity_log
      WHERE (book = ? OR ? IS NULL)
        AND (type = ? OR ? IS NULL)
        AND (user_id = ? OR ? IS NULL)
        AND (CAST(chapter AS TEXT) = ? OR ? IS NULL)
    `),
```

And `search()` (~:224):

```js
function search(options = {}) {
  const { book = null, type = null, userId = null, chapter = null, limit = 50, offset = 0 } = options;
  const chapterText = chapter == null ? null : String(chapter);

  const rows = stmts().search.all(
    book,
    book,
    type,
    type,
    userId,
    userId,
    chapterText,
    chapterText,
    Math.min(limit, 200),
    offset
  );

  const countResult = stmts().count.get(book, book, type, type, userId, userId, chapterText, chapterText);
```
(the return block is unchanged).

`server/routes/activity.js` GET `/` handler (~:25):

```js
  const { book, type, user, chapter, limit, offset } = req.query;

  try {
    const result = activityLog.search({
      book: book || null,
      type: type || null,
      userId: user || null,
      chapter: chapter || null,
      limit: Math.min(Math.max(parseInt(limit, 10) || 50, 1), 200),
      offset: Math.max(parseInt(offset, 10) || 0, 0),
    });
```

- [ ] **Step 4: Run tests to verify pass + neighbors**

Run: `npx vitest run server/__tests__/activityChapterFilter.test.js server/__tests__/activityLogging.test.js server/__tests__/activityLogNeverThrow.test.js`
Expected: ALL PASS (existing search callers pass no `chapter` → predicate is `? IS NULL` → no behavior change).

- [ ] **Step 5: Commit**

```bash
git add server/services/activityLog.js server/routes/activity.js server/__tests__/activityChapterFilter.test.js
git commit -m "feat(server): activity search honors the chapter filter the panel already sends (F12 server half, item 16 PR1)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: F12 client half — books.html activity panel reads real fields (deduped)

**Files:**
- Modify: `server/views/books.html:2076-2117` (loadChapterActivity), `:2516-2557` (cvLoadActivity), `:2836-2846` (getActivityIcon map)
- Test: `server/__tests__/viewRouteContracts.test.js` (create — grows in Tasks 5–8)

**Interfaces:**
- Consumes: `GET /api/activity` rows: `{ type, username, description, createdAt, book, chapter, ... }` (parseRow camelCase; Task 3 made the chapter filter real). `escapeHtml` (nullish→''), `formatTimeAgo` (falsy→'') already in the file.
- Produces: one shared `renderActivityRows(activities)` used by both panels; `viewRouteContracts.test.js` exists for Tasks 5–8 to append to.

- [ ] **Step 1: Write the failing static-pin test**

Create `server/__tests__/viewRouteContracts.test.js`:

```js
/**
 * Item 16 PR1 — static view↔route contract pins (Batch F).
 *
 * No jsdom infra exists for the inline view scripts, so these pin the
 * source-level reads against what the routes actually send (same mechanism
 * as clientMessageContracts.test.js). The companion behavioral halves live
 * in the route-harness/service suites; the endpoint shapes are documented
 * in docs/technical/view-route-contracts.md.
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const here = path.dirname(fileURLToPath(import.meta.url));
const view = (name) => fs.readFileSync(path.join(here, '..', 'views', name), 'utf8');

describe('books.html chapter activity panel (F12)', () => {
  const src = view('books.html');

  it('reads the fields /api/activity actually sends', () => {
    expect(src).toMatch(/getActivityIcon\(a\.type\)/);
    expect(src).toMatch(/escapeHtml\(a\.username \|\| 'Kerfi'\)/);
    expect(src).toMatch(/escapeHtml\(a\.description\)/);
    expect(src).toMatch(/formatTimeAgo\(a\.createdAt\)/);
  });

  it('no longer reads the phantom action-style fields', () => {
    expect(src).not.toMatch(/getActivityIcon\(a\.action\)/);
    expect(src).not.toMatch(/a\.userName\b/);
    expect(src).not.toMatch(/escapeHtml\(a\.details\)/);
    expect(src).not.toMatch(/formatTimeAgo\(a\.timestamp\)/);
  });

  it('both panels share one render function (dedupe)', () => {
    expect(src.match(/function renderActivityRows\(/g)).toHaveLength(1);
    expect(src.match(/renderActivityRows\(activities\)/g).length).toBeGreaterThanOrEqual(2);
  });

  it('icon map keys on live ACTIVITY_TYPES vocabulary', () => {
    expect(src).toMatch(/segment_edit_saved:/);
    expect(src).toMatch(/segment_edit_approved:/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run server/__tests__/viewRouteContracts.test.js`
Expected: FAIL on all four F12 pins.

- [ ] **Step 3: Implement the client fix**

In `server/views/books.html`:

(a) Add the shared renderer in the UTILITY FUNCTIONS section (directly after `formatTimeAgo`, ~:2834):

```js
      function renderActivityRows(activities) {
        return activities
          .map(function (a) {
            return (
              '<div class="activity-row">' +
              '<span class="activity-icon">' +
              getActivityIcon(a.type) +
              '</span>' +
              '<div class="activity-content">' +
              '<span class="activity-user">' +
              escapeHtml(a.username || 'Kerfi') +
              '</span> ' +
              '<span>' +
              escapeHtml(a.description) +
              '</span>' +
              '<span class="activity-time">' +
              formatTimeAgo(a.createdAt) +
              '</span>' +
              '</div>' +
              '</div>'
            );
          })
          .join('');
      }
```

(b) In `loadChapterActivity` (~:2091-2112) and `cvLoadActivity` (~:2531-2552), replace the whole `panel.innerHTML = activities.map(...).join('');` expression (from `panel.innerHTML =` through `.join('');`) with:

```js
          panel.innerHTML = renderActivityRows(activities);
```

(c) Re-key the icon map (~:2836) to the live `ACTIVITY_TYPES` vocabulary (the old action-style keys match nothing the API sends — every row fell back to 📌). Replace the `getActivityIcon` function body's map:

```js
      function getActivityIcon(type) {
        var icons = {
          segment_edit_saved: '✏️',
          segment_edit_approved: '✅',
          segment_edit_rejected: '❌',
          segment_edit_discuss: '💬',
          segment_edits_applied: '📥',
          review_submitted: '📤',
          review_approved: '✅',
          changes_requested: '📝',
          version_restored: '🔄',
          assignment_created: '👤',
          assignment_completed: '✓',
        };
        return icons[type] || '📌';
      }
```
(literal UTF-8 emoji are fine — the views are UTF-8; the current map at ~:2836 uses escapes but both forms are idiomatic in these files. Icons mirror the server map in `routes/status.js:1662-1691` for the types the panel actually receives.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run server/__tests__/viewRouteContracts.test.js`
Expected: PASS. Also run `node --check` is not applicable to HTML — instead grep for leftovers:
`grep -n "a\.userName\|a\.details\|a\.timestamp\|a\.action" server/views/books.html`
Expected: no output.

- [ ] **Step 5: Commit**

```bash
git add server/views/books.html server/__tests__/viewRouteContracts.test.js
git commit -m "fix(views): chapter activity panel reads real /api/activity fields, deduped renderer, live icon vocabulary (F12, item 16 PR1)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: F11 — status.html stage badges read the array the API sends

**Files:**
- Modify: `server/views/status.html:642-643`
- Modify: `server/views/books.html:2559-2569` (delete dead `cvLoadStatus`) + its call site
- Test: extend `server/__tests__/statusChapterRoute.test.js` (shape pins) + `server/__tests__/viewRouteContracts.test.js`

**Interfaces:**
- Consumes: `GET /api/status/:book/:chapter` → `{ book, chapter, chapterDir, title, progress, nextStage, stages: [ { stage, status, symbol, complete, ... } ], files, actions }` — `stages` is a **top-level array**; the publication entry additionally carries `mtPreview`/`faithful` objects.
- Produces: none new.

- [ ] **Step 1: Add failing pins**

Append to the existing `describe` in `server/__tests__/statusChapterRoute.test.js` (uses the existing `handler` + fixture):

```js
  it('response shape contract (F11): stages is a top-level array, no status key', async () => {
    const r = await invoke(handler, {
      params: { book: BOOK, chapter: 'appendices' },
      query: {},
    });
    expect(r.status).toBe(200);
    expect(Array.isArray(r.body.stages)).toBe(true);
    expect(r.body.status).toBeUndefined();
    const pub = r.body.stages.find((s) => s.stage === 'publication');
    expect(pub).toBeDefined();
    expect(pub).toHaveProperty('mtPreview');
    expect(pub).toHaveProperty('faithful');
  });
```

Append to `server/__tests__/viewRouteContracts.test.js`:

```js
describe('status.html pipeline badges (F11)', () => {
  const src = view('status.html');

  it('converts the top-level stages array instead of reading data.status', () => {
    expect(src).not.toMatch(/data\.status\s*&&\s*data\.status\.stages/);
    expect(src).toMatch(/data\.stages \|\| \[\]/);
  });
});

describe('books.html dead cvLoadStatus removed (F11 rider)', () => {
  it('the object-shaped misread is gone', () => {
    const src = view('books.html');
    expect(src).not.toMatch(/function cvLoadStatus\(/);
    expect(src).not.toMatch(/cvLoadStatus\(/);
  });
});
```

- [ ] **Step 2: Run to verify the view pins fail**

Run: `npx vitest run server/__tests__/viewRouteContracts.test.js server/__tests__/statusChapterRoute.test.js`
Expected: the two new view describes FAIL; the route shape pin should already PASS (it documents existing route truth — that is fine, it guards regressions).

- [ ] **Step 3: Fix status.html and delete cvLoadStatus**

`server/views/status.html` `loadPipelineBadges` — replace (~:642-643):

```js
        var stages = (data.status && data.status.stages) || data.status || {};
        var pub = stages.publication || {};
```
with (mirrors books.html:2131-2136):
```js
        // API returns stages as an array of {stage, complete, ...} — convert to object keyed by name
        var stagesArr = data.stages || [];
        var stages = {};
        for (var i = 0; i < stagesArr.length; i++) {
          stages[stagesArr[i].stage] = stagesArr[i];
        }
        var pub = stages.publication || {};
```

NOTE: the badge loop below also uses `var i` implicitly? It uses `badges.map(function(b){...})` — no collision; keep the new loop's `var i` (function-scoped, no other `i` in this function).

`server/views/books.html` — delete the whole `cvLoadStatus` function (`async function cvLoadStatus(book, chapter) { ... }`, ~:2559-2569) and its call site: run `grep -n "cvLoadStatus" server/views/books.html` first; remove the call line(s) (expected one caller in the chapter-view loader) along with the definition.

- [ ] **Step 4: Run tests**

Run: `npx vitest run server/__tests__/viewRouteContracts.test.js server/__tests__/statusChapterRoute.test.js`
Expected: ALL PASS.

- [ ] **Step 5: Commit**

```bash
git add server/views/status.html server/views/books.html server/__tests__/statusChapterRoute.test.js server/__tests__/viewRouteContracts.test.js
git commit -m "fix(views): stage badges read the stages array the status API sends; drop dead cvLoadStatus (F11, item 16 PR1)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: F27 — status.html timeline renders the server's timeAgo

**Files:**
- Modify: `server/views/status.html:702-707`
- Test: extend `server/__tests__/viewRouteContracts.test.js`

**Interfaces:**
- Consumes: `GET /api/status/activity/timeline` rows: `{ ...parseRow, timeAgo, icon, color }` (`routes/status.js:362-367`) — pre-formatted Icelandic `timeAgo`, camelCase `createdAt`.
- Produces: none new.

- [ ] **Step 1: Add failing pins**

Append to `viewRouteContracts.test.js`:

```js
describe('status.html activity timeline (F27)', () => {
  const src = view('status.html');

  it('renders the server-provided timeAgo, no client date parsing', () => {
    expect(src).toMatch(/a\.timeAgo/);
    expect(src).not.toMatch(/new Date\(a\.created_at \|\| a\.timestamp\)/);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run server/__tests__/viewRouteContracts.test.js`
Expected: FAIL on the F27 describe.

- [ ] **Step 3: Fix renderTimeline**

In `server/views/status.html` (~:702-707), replace:

```js
        var time = new Date(a.created_at || a.timestamp);
        var timeStr = time.toLocaleDateString('is-IS', { month: 'short', day: 'numeric' }) +
          ' ' + time.toLocaleTimeString('is-IS', { hour: '2-digit', minute: '2-digit' });

        li.innerHTML = '<span class="timeline-time">' + timeStr + '</span>' +
```
with (server already formats; client parsing would also mis-read SQLite UTC strings as local time):
```js
        var timeStr = a.timeAgo || '';

        li.innerHTML = '<span class="timeline-time">' + escapeHtml(timeStr) + '</span>' +
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run server/__tests__/viewRouteContracts.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/views/status.html server/__tests__/viewRouteContracts.test.js
git commit -m "fix(views): timeline shows the server's timeAgo instead of Invalid Date (F27, item 16 PR1)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 7: F26 — my-work.html activity timestamps read createdAt

**Files:**
- Modify: `server/views/my-work.html:1655`
- Test: extend `server/__tests__/viewRouteContracts.test.js`

**Interfaces:**
- Consumes: `GET /api/my-work` → `recentActivity` = `activityLog.getByUser` parseRow rows (camelCase `createdAt` only; icon field `a.type` at `:1652` is already correct — do not touch it).
- Produces: none new.

- [ ] **Step 1: Add failing pins**

Append to `viewRouteContracts.test.js`:

```js
describe('my-work.html personal activity feed (F26)', () => {
  const src = view('my-work.html');

  it('timestamp reads the camelCase field parseRow sends', () => {
    expect(src).toMatch(/formatTimeAgo\(a\.createdAt\)/);
    expect(src).not.toMatch(/a\.created_at\b/);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run server/__tests__/viewRouteContracts.test.js`
Expected: FAIL. Also verify the absence pin is achievable: `grep -n "created_at" server/views/my-work.html` — expected exactly the one line (~:1655); if more turn up, inspect each (they would be the same defect) before proceeding.

- [ ] **Step 3: Fix the read**

In `server/views/my-work.html` `renderEditorActivity` (~:1655), replace:

```js
            '<span class="editor-activity-time">' + formatTimeAgo(a.created_at) + '</span>' +
```
with:
```js
            '<span class="editor-activity-time">' + formatTimeAgo(a.createdAt) + '</span>' +
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run server/__tests__/viewRouteContracts.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/views/my-work.html server/__tests__/viewRouteContracts.test.js
git commit -m "fix(views): personal activity timestamps read createdAt (F26, item 16 PR1)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 8: F31 — admin activity feed icon + theme-safe color classes

**Files:**
- Modify: `server/views/my-work.html:1893-1897` (renderActivityItem) + CSS block (~:815, after `.admin-activity-icon`)
- Test: extend `server/__tests__/viewRouteContracts.test.js`

**Interfaces:**
- Consumes: `GET /api/status/dashboard` `teamActivity` rows: `{ ...parseRow, timeAgo, icon, color }` where `icon` is ALWAYS truthy (fallback 📌, `routes/status.js:1690`) and `color` ∈ `'success' | 'warning' | 'info' | 'default'` (class tokens, `:1696-1701`) — a closed server-side set.
- Produces: CSS modifier classes `.admin-activity-icon.success/.warning/.info` (`default` = base styles).

- [ ] **Step 1: Add failing pins**

Append to `viewRouteContracts.test.js`:

```js
describe('my-work.html admin activity feed (F31)', () => {
  const src = view('my-work.html');

  it('icon renders when present (ternary was backwards)', () => {
    expect(src).toMatch(/activity\.icon \|\| '●'/);
    expect(src).not.toMatch(/activity\.icon \? '' :/);
  });

  it('color applied as a CSS class, not an inline hex-alpha style', () => {
    expect(src).not.toMatch(/background:' \+ activity\.color \+ '20/);
    expect(src).toMatch(/admin-activity-icon' \+ \(activity\.color \? ' ' \+/);
    expect(src).toMatch(/\.admin-activity-icon\.success/);
    expect(src).toMatch(/\.admin-activity-icon\.warning/);
    expect(src).toMatch(/\.admin-activity-icon\.info/);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run server/__tests__/viewRouteContracts.test.js`
Expected: FAIL on the F31 describe.

- [ ] **Step 3: Fix markup + CSS**

In `renderActivityItem` (~:1893-1897), replace:

```js
        return '<div class="admin-activity-item">' +
          '<div class="admin-activity-icon" ' +
            (activity.color ? 'style="background:' + activity.color + '20;color:' + activity.color + '"' : '') + '>' +
            (activity.icon ? '' : '●') +
          '</div>' +
```
with (`activity.color` is a closed server-side token set; class-based styling keeps dark mode working via CSS vars):
```js
        return '<div class="admin-activity-item">' +
          '<div class="admin-activity-icon' + (activity.color ? ' ' + escapeHtml(activity.color) : '') + '">' +
            (activity.icon || '●') +
          '</div>' +
```
NOTE: the CURRENT file spells the bullet as a unicode escape (backslash-u-25CF) — match the real file text when locating the old code, but write the replacement with the literal `●` shown here (the views are UTF-8 and use literal characters widely; the Step 1 pin asserts the literal form).

In the CSS block, directly after the `.admin-activity-icon { ... }` rule (~:815), add:

```css
    .admin-activity-icon.success { background: var(--success-subtle); color: var(--success); }
    .admin-activity-icon.warning { background: var(--warning-subtle); color: var(--warning); }
    .admin-activity-icon.info { background: var(--info-subtle); color: var(--info); }
    /* .default keeps the base .admin-activity-icon styles */
```

(`--success-subtle`/`--warning-subtle`/`--info-subtle` are already used elsewhere in this file, e.g. `:605-608`, `:753`.)

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run server/__tests__/viewRouteContracts.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/views/my-work.html server/__tests__/viewRouteContracts.test.js
git commit -m "fix(views): admin activity feed shows icons; color via theme-safe classes (F31, item 16 PR1)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 9: Contract reference doc + full-suite gate

**Files:**
- Create: `docs/technical/view-route-contracts.md`
- Test: full suite

**Interfaces:**
- Consumes: everything above.
- Produces: the reference future view work checks against (kept honest by `viewRouteContracts.test.js`).

- [ ] **Step 1: Write the reference doc**

Create `docs/technical/view-route-contracts.md`:

```markdown
# View ↔ Route Contracts

**What this is:** the response fields the server views actually consume, per
endpoint — the reference to check BEFORE reading a field in a view. Batch F
(audit 2026-07-11; item 16) was twelve dashboards silently blank because view
reads drifted from route sends with no test in between. The static pins in
`server/__tests__/viewRouteContracts.test.js` enforce the reads below; if you
change a route's shape, update the consuming views, the pins, and this file
together.

**Field-name convention:** everything that flows through
`activityLog.parseRow` is camelCase (`createdAt`, `userId`) — there are NO
snake_case fields in any activity response.

## GET /api/status/:book/:chapter — routes/status.js
Consumed by: status.html (pipeline badges), books.html (chapter status).
Shape: `{ book, chapter, chapterDir, title, progress, nextStage, stages,
files, actions }`. **`stages` is a top-level ARRAY** of
`{ stage, status, symbol, complete, date, editor, notes }`; the
`stage === 'publication'` entry additionally carries `mtPreview` and
`faithful` objects (each `{ complete, ... }`). There is NO `status` key.
Views convert the array to a name-keyed object locally.

## GET /api/activity — routes/activity.js (HEAD_EDITOR-gated)
Consumed by: books.html chapter activity panel (both chapter views).
Shape: `{ activities, total, limit, offset }`; rows are parseRow:
`{ id, type, userId, username, book, chapter, section, description,
metadata, createdAt }`. Filters: `book`, `type`, `user`, `chapter`
(chapter compares as TEXT — send the number or the string, both match).
Note (register I16-R4): plain editors get 403 — the panel renders its
empty state for them.

## GET /api/status/activity/timeline — routes/status.js
Consumed by: status.html timeline.
Rows are parseRow **plus** `{ timeAgo, icon, color }` — `timeAgo` is a
pre-formatted Icelandic string; render it directly, do not parse dates
client-side (SQLite UTC strings parse as local time in browsers).

## GET /api/status/dashboard — routes/status.js
Consumed by: my-work.html admin panels.
Fields consumed: `needsAttention` `{ unassignedWork, pendingReviews,
blockedIssues (a NUMBER), overdueCount }`, `teamActivity` (timeline-shaped
rows incl. `timeAgo`/`icon`/`color` — `icon` is always truthy, `color` is a
class token `success|warning|info|default`), `readyForAssignment`.
`overdueCount` is structurally 0 today (F28 → removed in item 16 PR2).

## GET /api/my-work and /api/my-work/today — routes/my-work.js
Consumed by: my-work.html.
`/api/my-work`: `recentActivity` = parseRow rows (camelCase `createdAt`).
`/today`: `{ user, currentTask, upNext, needsAttention, quickStats
{ totalTasks, changesRequested, pendingReview, completedThisWeek,
proposedTerms }, adminStats, allTasks }`. There is NO `blockedIssues` and
NO `quickStats.overdue` (dead reads removed in item 16 PR2).

## GET {API_BASE}/terminology/lookup — routes/segment-editor.js
Consumed by: segment-editor popup autocomplete.
Query: `q` (min 2 chars), `bookSlug` (slug string — ranks the current
book's terms first). Response: `{ terms }`.
```

- [ ] **Step 2: Run the full suite**

Run from repo root: `npm test`
Expected: ALL GREEN (baseline was 2898 tests; this branch adds ~15).
If anything unrelated is red, STOP and report — do not "fix" unrelated suites in this PR.

- [ ] **Step 3: Commit**

```bash
git add docs/technical/view-route-contracts.md
git commit -m "docs(technical): view↔route contract reference (item 16 PR1)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

- [ ] **Step 4: Push and open the PR**

Use the commit-push-pr flow. PR description must include:
- The seven findings fixed (F11, F12, F13, F18, F26, F27, F31) with one line each.
- **The F18 honesty note:** module/chapter completion numbers on the progress dashboard will DROP where applied work was double-counted — the old numbers were inflated; do not expect parity.
- Manual QA click-through list: (1) progress page — stage badges show ✓ for completed stages, timeline shows Icelandic relative times (no "Invalid Date"); (2) book list chapter view — activity panel shows real usernames/descriptions/times for a head-editor, filtered to the chapter; (3) personal dashboard — activity feed timestamps render; (4) admin feed — icons visible, colored bubbles in both themes; (5) segment editor — term autocomplete ranks current-book terms first.
- Register note I16-R4 (activity panel is HEAD_EDITOR-only by design; editors see the empty state).

---

## Self-review (done at write time)

- **Spec coverage:** F11 → Task 5; F12 → Tasks 3+4; F13 → Task 1; F18 → Task 2; F26 → Task 7; F27 → Task 6; F31 → Task 8; contract doc + static pins + harness tests → Tasks 4–9. PR2 items (F25/F28/F29/F30, I14-R9, registers I16-R1..R3) are deliberately NOT here — separate plan after PR1 merges. I16-R4 register text rides the PR description (Task 9) and the campaign-doc register update rides PR2's register commit.
- **Placeholder scan:** clean — every code step shows the code; the one adaptive note (Task 2 route-shape lookup) names the exact two lines that may need adjusting and pins the assertions.
- **Type consistency:** `renderActivityRows` (Tasks 4/5 pins match implementation); `viewRouteContracts.test.js` `view()` helper defined in Task 4 and reused in 5–8; `invoke()` harness duplicated per test file by design (files are isolated).
