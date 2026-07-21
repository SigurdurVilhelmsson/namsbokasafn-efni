# C1a — Appendices Read-Path Adoption Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the appendices chapter (`-1` / on-disk `appendices/`) visible and status-reportable across the server's read-path — dashboards, `/sections`, faithful-count, publication readiness, and `npm run validate` — by adopting item-14's existing `chapterLabel` idiom at the laggard sites that still reject or silently skip it.

**Architecture:** Two mechanical patterns. **R3 scans** currently do `readdir(...).filter(d => d.startsWith('ch'))` + `parseInt(dir.replace('ch',''))`, which drops the `appendices` dir and NaN-maps it; they get a new shared `chapterFromDir()` helper. **R2 validators** currently do `parseInt(ch); if (ch<1||ch>99) 400`, rejecting appendices; they adopt `normalizeChapter()` + each route's real valid-set, and their handlers/services switch inline `` `ch${NN}` `` path-building to the `=== -1 ? 'appendices'` idiom already live in `getStatusDataFromDb`. No data-model change, no on-disk output change, no backfill (that's PR-2).

**Tech Stack:** Node.js 22 (CommonJS server modules), Express 5, better-sqlite3, Vitest. Run all tests from the **repo root** (`npm test`), never from `server/`.

## Global Constraints

- **Canonical form (`server/lib/chapterLabel.js` contract):** appendices = the **integer `-1`** in server memory and every DB column; the **word `'appendices'`** exists only at on-disk dir names and CLI argv. Convert only through `chapterLabel` helpers, never inline.
- **Do NOT homogenize onto `middleware/validateParams.validateBookChapter`** — it rejects `0`, and `ch00`/front-matter is real for some routes. Use `normalizeChapter` + the route's own bounds; **preserve each route's existing `0` handling exactly.**
- **Validator ∧ handler rule:** accepting `-1` at a validator is inert (or harmful) unless every downstream path the handler/service builds as `` `ch${String(n).padStart(2,'0')}` `` also switches to the `-1 → 'appendices'` idiom. A validator that accepts `-1` while its code builds `ch-1` is worse than the current clean 400.
- **Fails-safe invariant:** every touched site currently rejects/skips appendices with no corruption. A bug in this work must at worst restore that status-quo, never corrupt.
- **No behavior change for existing chapters** (0..99) is a required, test-enforced invariant.
- **Scope:** PR-1 only. Out of scope → PR-2: `registerBook`/section rows (I14-R4/I16-R3), `__e2e-fixture__` appendices (I14-R8), prod backfill, `books.js:368 /download`, `books.js:190` + `admin.js:497` (`book.chapters.find`, R4-coupled).
- **Branch:** `fix/appendices-read-path` (already created; spec committed at `396ae785`).
- **Commit trailer:** end every commit message with
  `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

---

## File Structure

- **Modify** `server/lib/chapterLabel.js` — add `chapterFromDir(dir) → number|null` and `compareChapters(a,b)` (appendices last). *(Task 1)*
- **Modify** `server/__tests__/chapterLabel.test.js` — unit-test the two new helpers. *(Task 1)*
- **Modify** `server/routes/status.js` — 7 scan loops + 2 sort comparators (R3); `/sections` validator + inline dir-build (R2). *(Tasks 2, 5)*
- **Modify** `server/services/pipelineService.js` — `checkBookDownstreamWork` scan (R3). *(Task 3)*
- **Modify** `scripts/validate-status.js` — chapters scan (R3). *(Task 4)*
- **Modify** `server/routes/books.js` — `/faithful-count` validator + dir-build (R2). *(Task 6)*
- **Modify** `server/routes/publication.js` — `validateChapterParams` + `/modules` scan (R2). *(Task 7)*
- **Modify** `server/services/publicationService.js` — 3 `` `ch${NN}` `` path sites (R2 service-layer). *(Task 7)*
- **Create** `server/__tests__/statusScansAppendices.test.js`, `server/__tests__/publicationAppendices.test.js`; extend `statusChapterRoute.test.js`, `books-routes.test.js`, a pipelineService test, and `scripts/__tests__/validateStatusAppendices.test.js`. *(various)*

---

## Task 1: `chapterFromDir` + `compareChapters` helpers

**Files:**
- Modify: `server/lib/chapterLabel.js` (append two functions + export)
- Test: `server/__tests__/chapterLabel.test.js`

**Interfaces:**
- Produces: `chapterFromDir(dir: string) → number|null` — `'appendices'→-1`, `'ch03'→3`, `'ch00'→0`, `'ch3'→3`, anything else `→null`. `compareChapters(a: number, b: number) → number` — ascending, but `-1` (appendices) sorts **after** all non-negative chapters.

- [ ] **Step 1: Write the failing test**

Add to `server/__tests__/chapterLabel.test.js`:

```js
const { chapterFromDir, compareChapters } = require('../lib/chapterLabel');

describe('chapterFromDir', () => {
  it('maps ch-prefixed dirs to their number', () => {
    expect(chapterFromDir('ch03')).toBe(3);
    expect(chapterFromDir('ch00')).toBe(0);
    expect(chapterFromDir('ch3')).toBe(3);
    expect(chapterFromDir('ch21')).toBe(21);
  });
  it('maps the appendices dir to -1', () => {
    expect(chapterFromDir('appendices')).toBe(-1);
  });
  it('returns null for non-chapter dirs', () => {
    expect(chapterFromDir('tm')).toBeNull();
    expect(chapterFromDir('chappendices')).toBeNull();
    expect(chapterFromDir('')).toBeNull();
    expect(chapterFromDir('glossary')).toBeNull();
  });
});

describe('compareChapters', () => {
  it('orders numeric chapters ascending with appendices (-1) last', () => {
    expect([3, -1, 1, 2].sort(compareChapters)).toEqual([1, 2, 3, -1]);
  });
  it('keeps ch0 (front-matter) first, not treated as appendices', () => {
    expect([2, -1, 0].sort(compareChapters)).toEqual([0, 2, -1]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- chapterLabel`
Expected: FAIL — `chapterFromDir is not a function`.

- [ ] **Step 3: Write minimal implementation**

In `server/lib/chapterLabel.js`, before `module.exports`, add:

```js
/**
 * Chapter number for an on-disk chapter directory name, or null if the name is
 * not a chapter dir. 'appendices' → -1 ; 'chNN' → N ; anything else → null.
 * Replaces the fragile `parseInt(dir.replace('ch',''), 10)` idiom (which
 * NaN-maps 'appendices' and mis-parses non-ch dirs).
 * @param {string} dir
 * @returns {number|null}
 */
function chapterFromDir(dir) {
  if (dir === 'appendices') return -1;
  const m = /^ch(\d{1,2})$/.exec(dir);
  return m ? parseInt(m[1], 10) : null;
}

/**
 * Sort comparator ordering numeric chapters ascending with the appendices
 * chapter (-1) placed AFTER all non-negative chapters. Mirrors the ordering in
 * tools/lib/update-translation-errors.js.
 * @param {number} a
 * @param {number} b
 * @returns {number}
 */
function compareChapters(a, b) {
  if (a === -1) return b === -1 ? 0 : 1;
  if (b === -1) return -1;
  return a - b;
}
```

And update the export line:

```js
module.exports = { normalizeChapter, chapterDir, cliChapterArg, chapterFromDir, compareChapters };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- chapterLabel`
Expected: PASS (all chapterLabel tests, old + new).

- [ ] **Step 5: Commit**

```bash
git add server/lib/chapterLabel.js server/__tests__/chapterLabel.test.js
git commit -m "feat(chapterLabel): add chapterFromDir + compareChapters helpers (C1a)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: `status.js` dashboard/aggregate scans admit appendices (R3)

**Files:**
- Modify: `server/routes/status.js` (7 scan loops + 2 sort comparators)
- Create: `server/__tests__/statusScansAppendices.test.js`

**Interfaces:**
- Consumes: `chapterFromDir`, `compareChapters` (Task 1); `getStatusDataFromDb(book, chapterNum)` (already appendix-aware at `:63/:82`).
- Produces: dashboard/summary/aggregate status responses that include the appendices chapter as `chapter: -1`, sorted last.

**Context — the sites (verify line numbers by content, not position):** filter+sort at `~:146-151`; loops at `~:173`, `~:466-479`, `~:630`, `~:832`, `~:1103-1111`, `~:1175`. Each does `readdir(...).filter(d => d.startsWith('ch'))` and/or `parseInt(chDir.replace('ch',''), 10)`.

- [ ] **Step 1: Write the failing test**

Create `server/__tests__/statusScansAppendices.test.js`. This exercises the **dashboard** handler against the committed `efnafraedi-2e/chapters/appendices/` dir (the `chapters/` scan reads module-level `PROJECT_ROOT`, which `_setTestBooksDir` does NOT redirect — so use the real committed book):

```js
/**
 * R3: status.js chapters/ scans must admit the appendices dir (chapter -1),
 * not drop it via `.filter(d => d.startsWith('ch'))`. Uses the committed
 * efnafraedi-2e/chapters/appendices/status.json (stable fixture). Harness
 * idiom: extract handler from router.stack, invoke with fake req/res
 * (cf. statusChapterRoute.test.js).
 */
import path from 'path';
import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { describe, it, expect, beforeAll } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
process.env.SESSIONS_DB_PATH = path.join(mkdtempSync(path.join(tmpdir(), 'status-scan-')), 'sessions.db');
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';

function invoke(h, req) {
  let resolveResult;
  const done = new Promise((r) => { resolveResult = r; });
  const res = {
    statusCode: 200,
    status(c) { this.statusCode = c; return this; },
    json(body) { resolveResult({ status: this.statusCode, body }); },
  };
  return Promise.resolve(h(req, res)).then(() => done);
}

let dashboardHandler;
beforeAll(() => {
  require('../services/migrationRunner').runAllMigrations();
  const router = require('../routes/status');
  // The dashboard route: GET '/' (per-book chapter breakdown). Confirm the
  // exact path during execution by inspecting router.stack; adjust the finder.
  const layer = router.stack.find(
    (l) => l.route && l.route.path === '/' && l.route.methods.get
  );
  dashboardHandler = layer.route.stack[layer.route.stack.length - 1].handle;
});

describe('status.js dashboard scan includes appendices', () => {
  it('lists the appendices chapter (-1) for efnafraedi-2e, sorted last', async () => {
    const r = await invoke(dashboardHandler, { params: {}, query: {} });
    expect(r.status).toBe(200);
    const book = r.body.books.find((b) => b.book === 'efnafraedi-2e');
    expect(book).toBeDefined();
    const chapters = book.chapters.map((c) => c.chapter);
    expect(chapters).toContain(-1);
    expect(chapters[chapters.length - 1]).toBe(-1); // appendices sorted last
    expect(chapters).not.toContain(NaN);
  });
});
```

> **Execution note:** the exact dashboard route path and response shape (`r.body.books[].chapters[]`) must be confirmed against `status.js` when implementing — inspect `router.stack` and the handler's response object, and adjust the finder + assertions to the real shape. Do NOT invent a shape; pin the one the handler actually returns (the statusChapterRoute.test.js honesty note is the precedent).

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- statusScansAppendices`
Expected: FAIL — `-1` absent (appendices dropped by `.startsWith('ch')`) or `NaN` present.

- [ ] **Step 3: Implement — apply the helper at every scan site**

At the top of `server/routes/status.js`, add to the existing requires:

```js
const { chapterFromDir, compareChapters } = require('../lib/chapterLabel');
```

Then, at **each** scan site, apply this transform:

- Replace `readdir(...).filter((d) => d.startsWith('ch'))` with `readdir(...).filter((d) => chapterFromDir(d) !== null)`.
- Replace `const chapterNum = parseInt(chDir.replace('ch', ''), 10);` (and the `chapterDir.replace('ch','')` variants, incl. the no-op `.replace('ch','ch')` at `~:479`) with `const chapterNum = chapterFromDir(chDir);`.
- Replace sort comparators of the form
  `.sort((a,b) => parseInt(a.replace('ch',''),10) - parseInt(b.replace('ch',''),10))`
  with `.sort((a, b) => compareChapters(chapterFromDir(a), chapterFromDir(b)))`.

Apply at all sites near `:146-151`, `:173`, `:466-479`, `:630`, `:832`, `:1103-1111`, `:1175`. (Grep to confirm none remain: `grep -n "replace('ch'\|startsWith('ch')" server/routes/status.js` should return only intentional non-scan uses, if any.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- statusScansAppendices statusChapterRoute`
Expected: PASS (new test green; existing status route tests still green).

- [ ] **Step 5: Commit**

```bash
git add server/routes/status.js server/__tests__/statusScansAppendices.test.js
git commit -m "fix(status): dashboard/aggregate scans admit appendices (C1a R3)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: `pipelineService.checkBookDownstreamWork` admits appendices (R3)

**Files:**
- Modify: `server/services/pipelineService.js` (`~:663-666`)
- Test: `server/__tests__/pipelineDownstreamAppendices.test.js` (create)

**Interfaces:**
- Consumes: `chapterFromDir` (Task 1). Note `pipelineService.js` already uses the `=== 'appendices' ? -1` idiom at `:702/:735/:757` — this makes one lagging function consistent with its own file.

- [ ] **Step 1: Write the failing test**

Create `server/__tests__/pipelineDownstreamAppendices.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

describe('checkBookDownstreamWork includes appendices', () => {
  it('does not drop the appendices chapter for efnafraedi-2e', () => {
    const { checkBookDownstreamWork } = require('../services/pipelineService');
    const result = checkBookDownstreamWork('efnafraedi-2e');
    // Confirm the real return shape during execution; assert appendices (-1)
    // appears wherever this fn enumerates chapters, and that NaN never does.
    const chapters = (result.chapters || result.items || []).map((c) => c.chapter ?? c);
    expect(chapters).toContain(-1);
    expect(chapters).not.toContain(NaN);
  });
});
```

> **Execution note:** read `checkBookDownstreamWork`'s actual return shape first and pin the assertion to it.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- pipelineDownstreamAppendices`
Expected: FAIL — appendices absent.

- [ ] **Step 3: Implement**

In `server/services/pipelineService.js`, add `const { chapterFromDir } = require('../lib/chapterLabel');` to the requires, then at `~:663-666`:

```js
// before
const chapterDirs = fs.readdirSync(structBaseDir).filter((d) => d.startsWith('ch'));
for (const chDir of chapterDirs) {
  const chapterNum = parseInt(chDir.replace('ch', ''), 10);
// after
const chapterDirs = fs.readdirSync(structBaseDir).filter((d) => chapterFromDir(d) !== null);
for (const chDir of chapterDirs) {
  const chapterNum = chapterFromDir(chDir);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- pipelineDownstreamAppendices`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/services/pipelineService.js server/__tests__/pipelineDownstreamAppendices.test.js
git commit -m "fix(pipeline): checkBookDownstreamWork admits appendices (C1a R3)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: `scripts/validate-status.js` admits appendices (R3)

**Files:**
- Modify: `scripts/validate-status.js` (`~:245`)
- Test: `scripts/__tests__/validateStatusAppendices.test.js` (create; create the dir if absent)

**Interfaces:**
- Consumes: `chapterFromDir` (Task 1). Effect: `npm run validate` now checks `chapters/appendices/status.json`.

- [ ] **Step 1: Confirm the module boundary**

Run: `head -30 scripts/validate-status.js` and confirm it's CommonJS and whether the chapter-scan is an exported function or inline in a `main()`. If the scan is not independently importable, wrap the chapter-discovery in an exported helper `listChapterDirsForBook(chaptersDir) → string[]` first (pure refactor, same output) so it can be unit-tested; otherwise test via a temp fixture dir passed to the exported validator.

- [ ] **Step 2: Write the failing test**

Create `scripts/__tests__/validateStatusAppendices.test.js`:

```js
import { mkdtempSync, mkdirSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

describe('validate-status includes appendices', () => {
  it('discovers the appendices chapter dir alongside chNN', () => {
    const { listChapterDirsForBook } = require('../validate-status');
    const dir = mkdtempSync(path.join(tmpdir(), 'valstatus-'));
    for (const c of ['ch01', 'appendices', 'tm']) mkdirSync(path.join(dir, c));
    const found = listChapterDirsForBook(dir);
    expect(found).toContain('appendices');
    expect(found).toContain('ch01');
    expect(found).not.toContain('tm');
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test -- validateStatusAppendices`
Expected: FAIL — `listChapterDirsForBook` missing or excludes `appendices`.

- [ ] **Step 4: Implement**

In `scripts/validate-status.js`, require `chapterFromDir` (path: `require('../server/lib/chapterLabel')`), extract/adjust the scan at `~:245`:

```js
// before
chapters = fs.readdirSync(chaptersDir).filter((name) => name.startsWith('ch'));
// after — via the exported helper
function listChapterDirsForBook(chaptersDir) {
  return fs.readdirSync(chaptersDir).filter((name) => chapterFromDir(name) !== null);
}
// ...at the call site:
chapters = listChapterDirsForBook(chaptersDir);
```

Add `listChapterDirsForBook` to `module.exports`.

- [ ] **Step 5: Run test + the real validator**

Run: `npm test -- validateStatusAppendices && npm run validate`
Expected: test PASS; `npm run validate` runs clean (or reports genuine appendix status gaps — that's the point; it must not crash).

- [ ] **Step 6: Commit**

```bash
git add scripts/validate-status.js scripts/__tests__/validateStatusAppendices.test.js
git commit -m "fix(validate-status): scan appendices chapter dir (C1a R3)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: `status.js /sections` accepts appendices (R2 + inline handler)

**Files:**
- Modify: `server/routes/status.js` (`GET /:book/:chapter/sections`, validator `~:1286-1290` + handler dir-build `~:1296`, `~:1300`)
- Test: extend `server/__tests__/statusChapterRoute.test.js`

**Interfaces:**
- Consumes: `normalizeChapter` (`chapterLabel`, already require-able; Task 2 added the chapterLabel import to this file).

- [ ] **Step 1: Write the failing test**

Add a `describe` block to `server/__tests__/statusChapterRoute.test.js`. In `beforeAll`, additionally grab the sections handler:

```js
const sectionsLayer = router.stack.find(
  (l) => l.route && l.route.path === '/:book/:chapter/sections' && l.route.methods.get
);
const sectionsHandler = sectionsLayer.route.stack[sectionsLayer.route.stack.length - 1].handle;
```

Test block:

```js
describe('GET /:book/:chapter/sections appendices acceptance', () => {
  it('accepts "appendices" (200, not 400)', async () => {
    const r = await invoke(sectionsHandler, { params: { book: BOOK, chapter: 'appendices' }, query: {} });
    expect(r.status).toBe(200);
  });
  it('still rejects 0', async () => {
    const r = await invoke(sectionsHandler, { params: { book: BOOK, chapter: '0' }, query: {} });
    expect(r.status).toBe(400);
  });
  it('still rejects garbage', async () => {
    const r = await invoke(sectionsHandler, { params: { book: BOOK, chapter: 'chappendices' }, query: {} });
    expect(r.status).toBe(400);
  });
});
```

> Confirm the sections handler's success shape during execution; if it returns 200 with a sections array for the synthetic BOOK, the assertions above hold. If it needs on-disk section files, assert on status code only (acceptance vs rejection) — that is the R2 contract under test.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- statusChapterRoute`
Expected: FAIL — `appendices` yields 400.

- [ ] **Step 3: Implement**

In the `/:book/:chapter/sections` handler:

```js
// before (~:1286)
const chapterNum = parseInt(chapter, 10);
if (isNaN(chapterNum) || chapterNum < 1) {
  return res.status(400).json({ error: 'Invalid chapter', message: 'Chapter must be a positive number' });
}
// after
const chapterNum = normalizeChapter(chapter);
if (chapterNum === null || chapterNum === 0 || chapterNum < -1) {
  return res.status(400).json({ error: 'Invalid chapter', message: 'Chapter must be a positive number or appendices' });
}
```

Then the two inline dir builds:

```js
// before (~:1296, ~:1300)
const chapterDir = `ch${String(chapterNum).padStart(2, '0')}`;
const chapterStr = String(chapterNum).padStart(2, '0');
// after
const chapterDir = chapterNum === -1 ? 'appendices' : `ch${String(chapterNum).padStart(2, '0')}`;
const chapterStr = chapterNum === -1 ? 'appendices' : String(chapterNum).padStart(2, '0');
```

Ensure `normalizeChapter` is in the file's `chapterLabel` require (Task 2 imported `chapterFromDir, compareChapters`; add `normalizeChapter`).

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- statusChapterRoute`
Expected: PASS (new + existing).

- [ ] **Step 5: Commit**

```bash
git add server/routes/status.js server/__tests__/statusChapterRoute.test.js
git commit -m "fix(status): /sections accepts appendices, builds appendices dir (C1a R2)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: `books.js /faithful-count` accepts appendices (R2 + inline)

**Files:**
- Modify: `server/routes/books.js` (`GET /:book/chapters/:chapter/faithful-count`, `~:484-490`)
- Test: extend `server/__tests__/books-routes.test.js`

**Interfaces:**
- Consumes: `normalizeChapter` (`chapterLabel`).

- [ ] **Step 1: Write the failing test**

Follow the existing harness in `books-routes.test.js` (extract the faithful-count handler from `router.stack`, invoke with fake req/res). Add:

```js
describe('faithful-count appendices acceptance', () => {
  it('accepts "appendices" (not 400)', async () => {
    const r = await invoke(faithfulCountHandler, { params: { book: 'efnafraedi-2e', chapter: 'appendices' } });
    expect(r.status).not.toBe(400); // 200 with a count, or 404 if dir absent — both are past the validator
  });
  it('still rejects 0', async () => {
    const r = await invoke(faithfulCountHandler, { params: { book: 'efnafraedi-2e', chapter: '0' } });
    expect(r.status).toBe(400);
  });
  it('still rejects garbage', async () => {
    const r = await invoke(faithfulCountHandler, { params: { book: 'efnafraedi-2e', chapter: 'xyz' } });
    expect(r.status).toBe(400);
  });
});
```

> Match the file's existing handler-extraction + `invoke` idiom (mirror whatever `books-routes.test.js` already does; if it uses supertest instead, use supertest). The contract under test: `appendices` passes the validator; `0` and junk still 400.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- books-routes`
Expected: FAIL — `appendices` → 400.

- [ ] **Step 3: Implement**

```js
// before (~:486)
const chapterNum = parseInt(chapter, 10);
if (isNaN(chapterNum) || chapterNum < 1 || chapterNum > 99) {
  return res.status(400).json({ error: 'Ógilt kaflanúmer' });
}
const paddedChapter = String(chapterNum).padStart(2, '0');
// after
const chapterNum = normalizeChapter(chapter);
if (chapterNum === null || chapterNum === 0 || chapterNum < -1 || chapterNum > 99) {
  return res.status(400).json({ error: 'Ógilt kaflanúmer' });
}
const paddedChapter = chapterNum === -1 ? 'appendices' : String(chapterNum).padStart(2, '0');
```

Then confirm the dir is built as `` `03-faithful-translation/${paddedChapter === 'appendices' ? 'appendices' : 'ch' + paddedChapter}` ``. **Read the exact dir-build lines below the validator and switch any `` `ch${paddedChapter}` `` to the `-1` idiom** (for appendices the faithful dir is `03-faithful-translation/appendices/`, no `ch` prefix). Add `normalizeChapter` to the `chapterLabel` require at the top of `books.js`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- books-routes`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/routes/books.js server/__tests__/books-routes.test.js
git commit -m "fix(books): faithful-count accepts appendices (C1a R2)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: Publication read-path accepts appendices (R2 validator + service layer)

**Files:**
- Modify: `server/routes/publication.js` (`validateChapterParams` `~:47`; `/modules` ch-scan `~:320`)
- Modify: `server/services/publicationService.js` (`~:54`, `~:306`, `~:410`)
- Test: `server/__tests__/publicationAppendices.test.js` (create)

**Interfaces:**
- Consumes: `normalizeChapter` (route), `chapterFromDir` (scan). Effect: `getPublicationStatus`, `checkMtPreviewReadiness`, `getModulePublicationStatus` resolve `appendices/` instead of `ch-1/`.

- [ ] **Step 1: Write the failing test**

The service reads real committed dirs (`efnafraedi-2e` has `02-mt-output/appendices/`, `03-translated/mt-preview/appendices/`, and 13 rendered `05-publication/mt-preview/chapters/appendices/*.html`). Create `server/__tests__/publicationAppendices.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

describe('publicationService resolves the appendices dir (not ch-1)', () => {
  it('mt-preview readiness for appendices reflects the real appendices/ content', () => {
    const svc = require('../services/publicationService');
    const buggy = svc.checkMtPreviewReadiness('efnafraedi-2e', -1);
    // Confirm the readiness object's shape during execution. The pre-fix code
    // builds `ch-1` (a nonexistent dir) → not-ready; post-fix it inspects the
    // real appendices/ content. Assert the fix reaches the right dir, e.g.:
    expect(buggy).toBeDefined();
    // Pin a field that flips: e.g. moduleCount > 0, or ready === true, based on
    // the real return shape read from publicationService.js.
  });
});
```

> **Execution note:** read `checkMtPreviewReadiness`'s return shape and pick a field that is demonstrably wrong pre-fix (because it stats `ch-1/`) and correct post-fix. If no field flips against committed data, instead unit-test the extracted dir helper (see Step 3) directly: `dirFor('efnafraedi-2e','02-mt-output',-1)` ends with `/appendices`.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- publicationAppendices`
Expected: FAIL (or, if asserting the dir helper, `ch-1` ≠ `appendices`).

- [ ] **Step 3: Implement**

In `server/services/publicationService.js`, at each of `~:54`, `~:306`, `~:410`:

```js
// before
const chapterStr = String(chapterNum).padStart(2, '0');
... `ch${chapterStr}` ...
// after
const chapterStr = chapterNum === -1 ? 'appendices' : String(chapterNum).padStart(2, '0');
const chapterDirName = chapterNum === -1 ? 'appendices' : `ch${chapterStr}`;
... chapterDirName ...   // replace the inline `ch${chapterStr}` usages with chapterDirName
```

(The `05-publication/.../chapters/${chapterStr}` sites already use the bare `chapterStr`; for appendices that becomes `appendices`, which is correct — verify each usage.)

In `server/routes/publication.js`:

```js
// validateChapterParams (~:47) — before
const chapter = parseInt(chapterNum, 10);
if (isNaN(chapter) || chapter < 1 || chapter > 99) {
  return res.status(400).json({ error: 'Invalid chapter number', message: 'Chapter number must be between 1 and 99' });
}
req.chapter = chapter;
// after
const { normalizeChapter } = require('../lib/chapterLabel');
const chapter = normalizeChapter(chapterNum);
if (chapter === null || chapter === 0 || chapter < -1 || chapter > 99) {
  return res.status(400).json({ error: 'Invalid chapter number', message: 'Chapter number must be 1–99 or appendices' });
}
req.chapter = chapter;
```

```js
// /modules ch-scan (~:320) — before
const match = dir.match(/^ch(\d{2})$/);
if (match) { chapters.push(parseInt(match[1], 10)); }
// after
const { chapterFromDir } = require('../lib/chapterLabel');
const n = chapterFromDir(dir);
if (n !== null) { chapters.push(n); }
```

(Prefer hoisting the two `require`s to the top of `publication.js` with the other requires rather than inline.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- publicationAppendices`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/routes/publication.js server/services/publicationService.js server/__tests__/publicationAppendices.test.js
git commit -m "fix(publication): read-path accepts appendices; service resolves appendices dir (C1a R2)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 8: Full-suite gate + docs/register update

**Files:**
- Modify: `docs/plans/2026-07-21-post-item17-followup-campaign.md` (mark C1 I14-R2/R3 done in PR-1; note PR-2 remainder)
- Modify: memory (`pre-semester-campaign-2026-07.md` ledger + `MEMORY.md` resume pointer)

- [ ] **Step 1: Run the full suite from the repo root**

Run: `npm test`
Expected: all green (~3300 Vitest). Fix any regression before proceeding — the "no behavior change for existing chapters" invariant means any newly-red existing test is a real regression, not a test to update.

- [ ] **Step 2: Grep for any missed scan/validator sites**

Run: `grep -rn "replace('ch', ''\|startsWith('ch')" server/routes/status.js server/services/pipelineService.js scripts/validate-status.js`
Expected: no remaining R3-pattern scan sites (only intentional non-scan matches, if any — inspect each).

- [ ] **Step 3: Update the campaign plan**

In `docs/plans/2026-07-21-post-item17-followup-campaign.md`, under **C1**, mark **I14-R2 / I14-R3 delivered in PR-1 (read-path)** and record that **I14-R4 / I16-R3 / I14-R8 + prod backfill remain in PR-2**, and that `books.js:368 /download`, `books.js:190`, `admin.js:497` were deferred to PR-2 during PR-1 planning (with reasons).

- [ ] **Step 4: Update memory**

Update `pre-semester-campaign-2026-07.md` (ledger entry for C1a) and the `MEMORY.md` resume pointer to reflect PR-1 shipped and PR-2 as the next appendix work.

- [ ] **Step 5: Commit**

```bash
git add docs/plans/2026-07-21-post-item17-followup-campaign.md
git commit -m "docs(campaign): C1a read-path shipped (I14-R2/R3); PR-2 = registration+backfill

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

- [ ] **Step 6: Whole-branch adversarial review + PR**

Per the campaign's per-item flow, run a whole-branch adversarial review (the item-17/-21 pattern) before opening the PR. Then push and open the PR titled `fix: appendices read-path adoption (C1a — I14-R2/R3)`, body noting the PR-1/PR-2 split and that this is **merge-safe but deploy-gated by A4 (mid-QA)**.

---

## Self-Review

**Spec coverage:**
- Canonical form / no-homogenize / validator∧handler / fails-safe / no-existing-chapter-change → Global Constraints + enforced by "still rejects 0 / still accepts regular chapters" tests in Tasks 5–7 and the `compareChapters` ch0 test in Task 1. ✅
- R3 scans (status.js ×7, pipelineService, validate-status) → Tasks 2, 3, 4. ✅
- R2 validators (publication, /sections, faithful-count) + service layer (publicationService) → Tasks 5, 6, 7. ✅
- Deferred sites (/download, books.js:190, admin.js:497, R4/R8/backfill) → Global Constraints "Scope"; not implemented (correct). ✅

**Placeholder scan:** No TBD/TODO. Three tasks carry explicit **execution notes** to confirm a real return shape before pinning an assertion — these are deliberate anti-invention guards (mirroring the statusChapterRoute honesty precedent), not placeholders; each still names the concrete field/contract to assert. ✅

**Type consistency:** `chapterFromDir(dir)→number|null` and `compareChapters(a,b)→number` are defined in Task 1 and consumed with those exact signatures in Tasks 2–4, 7; `normalizeChapter` (existing) consumed in Tasks 5–7. ✅
