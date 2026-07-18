# Item 14 — Appendices Label Unification — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One canonical appendices-chapter label per layer (number `-1` in server/DB, word `appendices` on disk/CLI argv), converted only at boundaries through a new shared `server/lib/chapterLabel.js` — fixing audit findings 17 (progress zero-counts, concordance skip) and 23 (pipeline panel rejection + broken CLI argv, incl. Vista + Birta for appendices).

**Architecture:** New CJS lib `server/lib/chapterLabel.js` (`normalizeChapter`, `chapterDir`, `cliChapterArg`); `segmentParser` re-exports `chapterDir` from it (zero churn for existing callers); the ~8 buggy server sites route through the lib; 3 minimal front-end touches in `segment-editor.js`. Spec: `docs/superpowers/specs/2026-07-18-item14-appendices-label-design.md`.

**Tech Stack:** Node 22 CJS server modules, Vitest (server workspace runs **sequential**), better-sqlite3 test DBs via `SESSIONS_DB_PATH` env + `runAllMigrations()`, fake-req/res router.stack handler extraction (idiom: `server/__tests__/locApproveConflict.test.js`).

## Global Constraints

- Branch: `fix/item14-appendices-label` (create via superpowers:using-git-worktrees at execution start; base = current `main`).
- `npm test` **from the repo root** is the authoritative gate (no branch protection). Run `nvm use` first if npm-install is ever needed (must stay npm 10 / Node 22).
- Server code is CommonJS (`require`/`module.exports`); tests are ESM Vitest files using `createRequire`.
- `tools/` are **untouched** in this item. `books/` must not be mutated: `git status --porcelain books/` must be empty before every commit.
- Do NOT change validation *bounds* semantics beyond adding the `-1` exception: chapter `0` stays rejected wherever it is rejected today.
- Test-seam naming follows repo precedent: `/** @internal Test-only */` + underscore prefix (`_setTestBooksDir`, `_setTestDb`, `_jobsMap`).
- Commit after every task; message style `fix(item14): …` / `test(item14): …`.

---

### Task 1: `server/lib/chapterLabel.js` — the boundary converter

**Files:**
- Create: `server/lib/chapterLabel.js`
- Test: `server/__tests__/chapterLabel.test.js`

**Interfaces:**
- Produces: `normalizeChapter(value: number|string) => number|null`; `chapterDir(chapterNum: number) => string`; `cliChapterArg(chapterNum: number) => string`. All later tasks require this module from `../lib/chapterLabel` (services/routes) — exact names matter.

- [ ] **Step 1: Write the failing test**

Create `server/__tests__/chapterLabel.test.js`:

```js
/**
 * Dialect matrix for the appendices chapter-label converter (item 14).
 * Contract: -1 is canonical in server memory/DB; 'appendices' exists only
 * as directory name and CLI argv; this module is the only translator.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { normalizeChapter, chapterDir, cliChapterArg } = require('../lib/chapterLabel');

describe('normalizeChapter', () => {
  it('maps the word appendices to -1', () => {
    expect(normalizeChapter('appendices')).toBe(-1);
  });
  it('maps the string "-1" to -1', () => {
    expect(normalizeChapter('-1')).toBe(-1);
  });
  it('passes the number -1 through', () => {
    expect(normalizeChapter(-1)).toBe(-1);
  });
  it('parses numeric strings', () => {
    expect(normalizeChapter('3')).toBe(3);
    expect(normalizeChapter('21')).toBe(21);
  });
  it('passes integers through (including 0 — front-matter is real)', () => {
    expect(normalizeChapter(3)).toBe(3);
    expect(normalizeChapter(0)).toBe(0);
  });
  it('returns null on unrecognizable input (no silent fallthrough)', () => {
    expect(normalizeChapter('chappendices')).toBeNull();
    expect(normalizeChapter('ch03')).toBeNull();
    expect(normalizeChapter('')).toBeNull();
    expect(normalizeChapter('3.5')).toBeNull();
    expect(normalizeChapter(3.5)).toBeNull();
    expect(normalizeChapter(NaN)).toBeNull();
    expect(normalizeChapter(undefined)).toBeNull();
    expect(normalizeChapter(null)).toBeNull();
  });
});

describe('chapterDir', () => {
  it('maps -1 to the appendices directory', () => {
    expect(chapterDir(-1)).toBe('appendices');
  });
  it('zero-pads regular chapters', () => {
    expect(chapterDir(3)).toBe('ch03');
    expect(chapterDir(21)).toBe('ch21');
    expect(chapterDir(0)).toBe('ch00');
  });
});

describe('cliChapterArg', () => {
  it('maps -1 to the word appendices (tools CHAPTER_OPTION dialect)', () => {
    expect(cliChapterArg(-1)).toBe('appendices');
  });
  it('stringifies regular chapters without padding', () => {
    expect(cliChapterArg(3)).toBe('3');
    expect(cliChapterArg(21)).toBe('21');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run (repo root): `npx vitest run server/__tests__/chapterLabel.test.js`
Expected: FAIL — `Cannot find module '../lib/chapterLabel'`

- [ ] **Step 3: Write the implementation**

Create `server/lib/chapterLabel.js`:

```js
/**
 * Canonical chapter-label conversion for the appendices chapter (item 14,
 * audit Batch G — findings 17+23).
 *
 * CONTRACT: server memory and every DB column carry the NUMBER -1 for the
 * appendices chapter. The WORD 'appendices' exists at exactly two
 * boundaries: on-disk directory names and CLI --chapter argv. Conversion
 * happens only at those boundaries, through this module — never inline.
 *
 * This module only translates dialects. Bounds (1..MAX_CHAPTERS, rejecting
 * 0, etc.) remain each caller's policy: valid chapter sets differ per route
 * and chapter 0 (front-matter, ch00) is real.
 */

/**
 * Normalize any chapter dialect to the canonical integer.
 * 'appendices' | '-1' | -1 → -1 ; '3' | 3 → 3 ; anything else → null.
 * Callers at HTTP boundaries map null to a 400; internal callers treat
 * null as a programmer error and throw.
 *
 * @param {number|string} value
 * @returns {number|null}
 */
function normalizeChapter(value) {
  if (value === 'appendices') return -1;
  if (typeof value === 'number') return Number.isInteger(value) ? value : null;
  if (typeof value === 'string' && /^-?\d+$/.test(value.trim())) {
    return parseInt(value.trim(), 10);
  }
  return null;
}

/**
 * Directory name for a canonical chapter number: -1 → 'appendices', N → 'chNN'.
 * @param {number} chapter
 * @returns {string}
 */
function chapterDir(chapter) {
  return chapter === -1 ? 'appendices' : `ch${String(chapter).padStart(2, '0')}`;
}

/**
 * CLI --chapter argv value for a canonical chapter number: -1 → 'appendices',
 * N → 'N' (matches tools/lib/parseArgs CHAPTER_OPTION, which passes the word
 * through and parseInt's everything else).
 * @param {number} chapter
 * @returns {string}
 */
function cliChapterArg(chapter) {
  return chapter === -1 ? 'appendices' : String(chapter);
}

module.exports = { normalizeChapter, chapterDir, cliChapterArg };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run server/__tests__/chapterLabel.test.js`
Expected: PASS (all tests)

- [ ] **Step 5: Commit**

```bash
git add server/lib/chapterLabel.js server/__tests__/chapterLabel.test.js
git commit -m "feat(item14): chapterLabel boundary converter — canonical -1 / 'appendices' dialects"
```

---

### Task 2: segmentParser — delegate `chapterDir`, fix `countModuleSegments`

**Files:**
- Modify: `server/services/segmentParser.js:131-140` (chapterDir) and `:494-513` (countModuleSegments)
- Test: `server/__tests__/segmentParser.test.js` (extend)

**Interfaces:**
- Consumes: `normalizeChapter`, `chapterDir` from Task 1.
- Produces: `segmentParser.chapterDir` remains exported and MUST be reference-identical to `chapterLabel.chapterDir` (external consumer: `scripts/backfill-mt-locks.js`). `countModuleSegments(book, chapter, moduleId)` now truly accepts `-1 | '-1' | 'appendices' | N | 'N'` and **throws TypeError** on unrecognizable chapter.

- [ ] **Step 1: Write the failing tests**

Append to `server/__tests__/segmentParser.test.js` (top of file already has `createRequire`; add `fs`/`os`/`path` imports at the top import block):

```js
import fs from 'fs';
import os from 'os';
import path from 'path';
```

and a new describe block at the end (also pull `chapterDir` and `countModuleSegments` — extend the existing destructuring require or require the service namespace):

```js
const segmentParser = require('../services/segmentParser');
const chapterLabelLib = require('../lib/chapterLabel');

describe('chapterDir re-export (item 14 contract)', () => {
  it('is reference-identical to lib/chapterLabel.chapterDir (protects backfill-mt-locks.js)', () => {
    expect(segmentParser.chapterDir).toBe(chapterLabelLib.chapterDir);
  });
});

describe('countModuleSegments appendices dialects (item 14, finding 17a)', () => {
  let tmpRoot;
  let realBooksDir;

  beforeEach(() => {
    realBooksDir = segmentParser.BOOKS_DIR;
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'segcount-'));
    const booksDir = path.join(tmpRoot, 'books');
    const write = (chDir, moduleId, nSegs) => {
      const dir = path.join(booksDir, 'testbook', '02-for-mt', chDir);
      fs.mkdirSync(dir, { recursive: true });
      const body = Array.from(
        { length: nSegs },
        (_, i) => `<!-- SEG:${moduleId}:para:fs-id00${i + 1} -->\nText ${i + 1}.\n`
      ).join('\n');
      fs.writeFileSync(path.join(dir, `${moduleId}-segments.en.md`), body);
    };
    write('appendices', 'm99901', 2);
    write('ch03', 'm99902', 1);
    segmentParser._setTestBooksDir(booksDir);
  });

  afterEach(() => {
    segmentParser._setTestBooksDir(realBooksDir);
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  it('counts appendix segments identically for -1, "-1", and "appendices"', () => {
    expect(segmentParser.countModuleSegments('testbook', -1, 'm99901')).toBe(2);
    expect(segmentParser.countModuleSegments('testbook', '-1', 'm99901')).toBe(2);
    expect(segmentParser.countModuleSegments('testbook', 'appendices', 'm99901')).toBe(2);
  });

  it('counts regular chapters for number and string forms', () => {
    expect(segmentParser.countModuleSegments('testbook', 3, 'm99902')).toBe(1);
    expect(segmentParser.countModuleSegments('testbook', '3', 'm99902')).toBe(1);
  });

  it('returns 0 for a valid chapter whose file is missing (dashboard semantics)', () => {
    expect(segmentParser.countModuleSegments('testbook', 5, 'm99999')).toBe(0);
  });

  it('throws TypeError on unrecognizable chapter (no silent zero)', () => {
    expect(() => segmentParser.countModuleSegments('testbook', 'chappendices', 'm99901')).toThrow(
      TypeError
    );
  });
});
```

Note: `beforeEach`/`afterEach` must be added to the vitest import at the top of the file if not already imported.

- [ ] **Step 2: Run to verify the new tests fail**

Run: `npx vitest run server/__tests__/segmentParser.test.js`
Expected: FAIL — `'appendices'` case returns 0 (not 2), garbage case returns 0 (doesn't throw). The re-export identity test also fails (local function ≠ lib function). Pre-existing tests stay green.

- [ ] **Step 3: Implement**

In `server/services/segmentParser.js`:

(a) Near the top (after existing requires), add:

```js
const { normalizeChapter, chapterDir } = require('../lib/chapterLabel');
```

(b) Delete the local `chapterDir` function (lines 131-140, including its JSDoc — the lib carries the doc now). The existing `module.exports` entry `chapterDir,` (line ~532) stays and now exports the lib function.

(c) Replace `countModuleSegments` body line `const chDir = chapterDir(parseInt(chapter, 10) || chapter);` with:

```js
  const chapterNum = normalizeChapter(chapter);
  if (chapterNum === null) {
    throw new TypeError(`countModuleSegments: unrecognizable chapter ${JSON.stringify(chapter)}`);
  }
  const chDir = chapterDir(chapterNum);
```

(JSDoc above it — "`@param {string} chapter - Chapter number or 'appendices'`" — is now true; leave it.)

- [ ] **Step 4: Run the full segmentParser suites**

Run: `npx vitest run server/__tests__/segmentParser.test.js server/__tests__/segmentParserExercises.test.js`
Expected: PASS (new + all pre-existing)

- [ ] **Step 5: Commit**

```bash
git add server/services/segmentParser.js server/__tests__/segmentParser.test.js
git commit -m "fix(item14): segmentParser delegates chapterDir to chapterLabel; countModuleSegments honors all dialects, throws on garbage"
```

---

### Task 3: `getEditorialProgress` — stop manufacturing the text label

**Files:**
- Modify: `server/services/segmentEditorService.js:1321-1341`
- Test: `server/__tests__/editorialProgress.test.js` (extend — currently only an export-presence check)

**Interfaces:**
- Consumes: Task 2's dialect-tolerant `countModuleSegments` (called with the number now anyway).
- Produces: `getEditorialProgress(book).chapters[-1]` carries real appendix numbers; no signature change.

- [ ] **Step 1: Write the failing test**

Replace the whole `server/__tests__/editorialProgress.test.js` with (keeps the existing export check as the first test):

```js
/**
 * getEditorialProgress — appendices label fix (item 14, finding 17a).
 * Both halves pinned: FS segment count (was 0 via 'chappendices') and DB
 * editMap join (was 0 via key 'appendices' vs stringified integer '-1').
 */
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

const work = mkdtempSync(path.join(tmpdir(), 'edprog-'));
process.env.SESSIONS_DB_PATH = path.join(work, 'sessions.db');

const BOOK = 'synthetic-edprog-book';
const MODULE = 'm99901';

let service;
let segmentParser;
let realBooksDir;
let booksDir;

beforeAll(() => {
  const { runAllMigrations } = require('../services/migrationRunner');
  runAllMigrations();

  segmentParser = require('../services/segmentParser');
  realBooksDir = segmentParser.BOOKS_DIR;
  booksDir = path.join(work, 'books');
  const appDir = path.join(booksDir, BOOK, '02-for-mt', 'appendices');
  mkdirSync(appDir, { recursive: true });
  writeFileSync(
    path.join(appDir, `${MODULE}-segments.en.md`),
    `<!-- SEG:${MODULE}:para:fs-id001 -->\nFirst.\n\n<!-- SEG:${MODULE}:para:fs-id002 -->\nSecond.\n`
  );
  segmentParser._setTestBooksDir(booksDir);

  // Write fixture rows through a direct connection to the same file the
  // service's lazy singleton will open (env was set before any require).
  const Database = require('better-sqlite3');
  const db = new Database(process.env.SESSIONS_DB_PATH);
  const insert = db.prepare(
    `INSERT INTO segment_edits
       (book, chapter, module_id, segment_id, original_content, edited_content,
        status, editor_id, editor_username)
     VALUES (?, ?, ?, ?, ?, ?, 'approved', 'ed1', 'editor1')`
  );
  insert.run(BOOK, -1, MODULE, `${MODULE}:para:fs-id001`, 'First.', 'Fyrsti.');
  insert.run(BOOK, -1, MODULE, `${MODULE}:para:fs-id002`, 'Second.', 'Annar.');
  db.close();

  service = require('../services/segmentEditorService');
});

afterAll(() => {
  segmentParser._setTestBooksDir(realBooksDir);
  rmSync(work, { recursive: true, force: true });
});

describe('getEditorialProgress', () => {
  it('is exported from segmentEditorService', () => {
    expect(typeof service.getEditorialProgress).toBe('function');
  });

  it('counts appendix segments from the filesystem (17a half 1)', () => {
    const progress = service.getEditorialProgress(BOOK);
    expect(progress.chapters[-1]).toBeDefined();
    expect(progress.chapters[-1].totalSegments).toBe(2);
  });

  it('joins appendix DB edit aggregates (17a half 2) and reaches complete', () => {
    const progress = service.getEditorialProgress(BOOK);
    expect(progress.chapters[-1].approvedSegments).toBe(2);
    expect(progress.chapters[-1].percentComplete).toBe(100);
    expect(progress.summary.modulesComplete).toBe(1);
  });
});
```

(Verified: `segmentEditorService` opens its own lazy singleton on `resolveDbPath()` — env set at module top of the test file, before any require, is what makes this line up. Idiom authority: `locApproveConflict.test.js`.)

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run server/__tests__/editorialProgress.test.js`
Expected: FAIL — `totalSegments` 0 and `approvedSegments` 0 (both halves broken today). Export check passes.

- [ ] **Step 3: Implement**

In `server/services/segmentEditorService.js`, within the `for (const chNum of chapterNums)` loop (lines 1321-1341):

- Delete line 1322: `const chLabel = chNum === -1 ? 'appendices' : String(chNum);`
- Line 1327: `segmentParser.countModuleSegments(book, chLabel, mod.moduleId)` → `segmentParser.countModuleSegments(book, chNum, mod.moduleId)`
- Line 1341: `const edits = editMap[chLabel] || {…}` → `const edits = editMap[chNum] || {…}` (object-key coercion matches SQLite's integer key stringification, incl. `-1` → `"-1"`).

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run server/__tests__/editorialProgress.test.js`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add server/services/segmentEditorService.js server/__tests__/editorialProgress.test.js
git commit -m "fix(item14): getEditorialProgress passes canonical -1 — appendix counts and editMap join both live"
```

---

### Task 4: `routes/status.js` — editorial-progress + chapter GET

**Files:**
- Modify: `server/routes/status.js:960-974` (editorial-progress handler) and `:1223-1247` (GET `/:book/:chapter`)
- Test: `server/__tests__/statusChapterRoute.test.js` (create)

**Interfaces:**
- Consumes: `normalizeChapter` + `chapterDir` from Task 1 (namespace-require as `chapterLabel` to avoid shadowing the route's local `chapterDir` variable); Task 2's tolerant `countModuleSegments`.
- Produces: `GET /api/status/:book/appendices` (and `/-1`) reaches the handler body; response `chapterDir` field says `'appendices'`.

- [ ] **Step 1: Write the failing test**

Create `server/__tests__/statusChapterRoute.test.js`:

```js
/**
 * GET /api/status/:book/:chapter accepts the appendices chapter (item 14).
 * Harness idiom: handler extracted from the router stack, invoked with fake
 * req/res (cf. locApproveConflict.test.js).
 */
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

const work = mkdtempSync(path.join(tmpdir(), 'status-route-'));
process.env.SESSIONS_DB_PATH = path.join(work, 'sessions.db');

const BOOK = 'synthetic-status-book';
const MODULE = 'm99901';

let handler;
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

  // Appendices fixture: one module, two EN segments, two approved edits.
  segmentParser = require('../services/segmentParser');
  realBooksDir = segmentParser.BOOKS_DIR;
  const booksDir = path.join(work, 'books');
  const appDir = path.join(booksDir, BOOK, '02-for-mt', 'appendices');
  mkdirSync(appDir, { recursive: true });
  writeFileSync(
    path.join(appDir, `${MODULE}-segments.en.md`),
    `<!-- SEG:${MODULE}:para:fs-id001 -->\nFirst.\n\n<!-- SEG:${MODULE}:para:fs-id002 -->\nSecond.\n`
  );
  segmentParser._setTestBooksDir(booksDir);

  const Database = require('better-sqlite3');
  const db = new Database(process.env.SESSIONS_DB_PATH);
  const insert = db.prepare(
    `INSERT INTO segment_edits
       (book, chapter, module_id, segment_id, original_content, edited_content,
        status, editor_id, editor_username)
     VALUES (?, ?, ?, ?, ?, ?, 'approved', 'ed1', 'editor1')`
  );
  insert.run(BOOK, -1, MODULE, `${MODULE}:para:fs-id001`, 'First.', 'Fyrsti.');
  insert.run(BOOK, -1, MODULE, `${MODULE}:para:fs-id002`, 'Second.', 'Annar.');
  db.close();

  const router = require('../routes/status');
  const layer = router.stack.find(
    (l) => l.route && l.route.path === '/:book/:chapter' && l.route.methods.get
  );
  handler = layer.route.stack[layer.route.stack.length - 1].handle;
  const progressLayer = router.stack.find(
    (l) => l.route && l.route.path === '/:book/editorial-progress' && l.route.methods.get
  );
  progressHandler = progressLayer.route.stack[progressLayer.route.stack.length - 1].handle;
});

afterAll(() => {
  segmentParser._setTestBooksDir(realBooksDir);
  rmSync(work, { recursive: true, force: true });
});

describe('GET /api/status/:book/:chapter appendices acceptance', () => {
  it('accepts "appendices" — 404 (no data), NOT 400', async () => {
    const r = await invoke(handler, { params: { book: 'nosuch-book', chapter: 'appendices' } });
    expect(r.status).toBe(404);
    expect(r.body.message).toContain('chapter -1');
  });

  it('accepts "-1" identically', async () => {
    const r = await invoke(handler, { params: { book: 'nosuch-book', chapter: '-1' } });
    expect(r.status).toBe(404);
  });

  it('still rejects 0', async () => {
    const r = await invoke(handler, { params: { book: 'nosuch-book', chapter: '0' } });
    expect(r.status).toBe(400);
  });

  it('still rejects garbage', async () => {
    const r = await invoke(handler, { params: { book: 'nosuch-book', chapter: 'chappendices' } });
    expect(r.status).toBe(400);
  });

  it('still accepts regular chapters (404 without data, not 400)', async () => {
    const r = await invoke(handler, { params: { book: 'nosuch-book', chapter: '3' } });
    expect(r.status).toBe(404);
  });
});

describe('GET /api/status/:book/editorial-progress appendices counts (finding 17a route surface)', () => {
  it('reports real segment totals for the appendix chapter', async () => {
    const r = await invoke(progressHandler, { params: { book: BOOK }, query: {} });
    expect(r.status).toBe(200);
    const appendixEntry = r.body.chapters.find((c) => c.chapter === -1);
    expect(appendixEntry).toBeDefined();
    expect(appendixEntry.segmentsTotal).toBe(2);
    expect(appendixEntry.moduleDetails[0].segmentCount).toBe(2);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run server/__tests__/statusChapterRoute.test.js`
Expected: FAIL — 'appendices' and '-1' cases get 400 today, and the editorial-progress test sees `segmentsTotal: 0` (the route's manufactured text label dead-ends in `countModuleSegments`).

- [ ] **Step 3: Implement**

In `server/routes/status.js`:

(a) Top of file, with the other requires:

```js
const chapterLabel = require('../lib/chapterLabel');
```

(b) GET `/:book/:chapter` handler (line ~1227): replace

```js
  const chapterNum = parseInt(chapter, 10);

  if (isNaN(chapterNum) || chapterNum < 1) {
```

with

```js
  const chapterNum = chapterLabel.normalizeChapter(chapter);

  if (chapterNum === null || (chapterNum !== -1 && chapterNum < 1)) {
```

(error body unchanged) and replace line ~1240

```js
    const chapterDir = `ch${String(chapterNum).padStart(2, '0')}`;
```

with

```js
    const chapterDir = chapterLabel.chapterDir(chapterNum);
```

(c) Editorial-progress handler (line ~960): delete `const chapterLabel = chapterNum === -1 ? 'appendices' : String(chapterNum);` — **first rename check**: the file-level require above uses the name `chapterLabel`, and this local const shadows it; deleting the local resolves it. Then line ~974: `segmentParser.countModuleSegments(book, chapterLabel, mod.moduleId)` → `segmentParser.countModuleSegments(book, chapterNum, mod.moduleId)`. Grep the surrounding function for any other use of the deleted local (`grep -n "chapterLabel" server/routes/status.js`) — every remaining hit must be the required module, not the deleted local.

- [ ] **Step 4: Run to verify**

Run: `npx vitest run server/__tests__/statusChapterRoute.test.js server/__tests__/editorialProgress.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add server/routes/status.js server/__tests__/statusChapterRoute.test.js
git commit -m "fix(item14): status routes — appendices accepted on chapter GET; editorial-progress passes canonical -1"
```

---

### Task 5: concordanceService — backfill boundary + canonical stored label

**Files:**
- Modify: `server/services/concordanceService.js:95-110` (indexModule) and `:157-180` (backfill)
- Test: `server/__tests__/concordanceService.test.js` (extend — its `writeModule(book, chDir, moduleId, pairs)` helper already takes a chapter-dir name)

**Interfaces:**
- Consumes: `normalizeChapter` from Task 1.
- Produces: `tm_segments.chapter` stores `String(normalizeChapter(chapter))` — appendices rows store `"-1"` from every entry path; `indexModule` throws TypeError on unrecognizable chapter.

- [ ] **Step 1: Write the failing tests**

Append inside the existing `describe('concordanceService', …)` block in `server/__tests__/concordanceService.test.js`:

```js
  describe('appendices label unification (item 14, finding 17b)', () => {
    it('backfill indexes an appendices module (was silently skipped)', () => {
      writeModule('bok', 'appendices', 'm99903', [
        ['para', 'fs-a1', 'Periodic table.', 'Lotukerfið.'],
      ]);
      const r = concordance.backfill('bok');
      expect(r.indexed).toBe(1);
    });

    it('stores the canonical "-1" chapter label from the backfill path', () => {
      writeModule('bok', 'appendices', 'm99903', [
        ['para', 'fs-a1', 'Periodic table.', 'Lotukerfið.'],
      ]);
      concordance.backfill('bok');
      const row = db.prepare(`SELECT chapter FROM tm_segments WHERE module_id = 'm99903'`).get();
      expect(row.chapter).toBe('-1');
    });

    it('stores "-1" from the apply-path form too (indexModule with -1)', () => {
      writeModule('bok', 'appendices', 'm99904', [
        ['para', 'fs-a2', 'Units appendix.', 'Einingaviðauki.'],
      ]);
      concordance.indexModule('bok', -1, 'm99904');
      const row = db.prepare(`SELECT chapter FROM tm_segments WHERE module_id = 'm99904'`).get();
      expect(row.chapter).toBe('-1');
    });

    it('repetitionReport finds appendix rows when filtered by -1', () => {
      writeModule('bok', 'appendices', 'm99905', [
        ['para', 'fs-a3', 'Same sentence.', 'Sama setning.'],
        ['para', 'fs-a4', 'Same sentence.', 'Sama setning.'],
      ]);
      concordance.indexModule('bok', -1, 'm99905');
      const report = concordance.repetitionReport('bok', -1, { limit: 10 });
      expect(report.length).toBeGreaterThan(0);
    });

    it('indexModule throws on unrecognizable chapter', () => {
      expect(() => concordance.indexModule('bok', 'chappendices', 'm99903')).toThrow(TypeError);
    });
  });
```

(Verified: `repetitionReport` returns an **array** of `{ en_text, count, distinctTranslations, agree, modules }` rows, chapter-filtered via `String(chapter)` — so `-1` matches the stored `"-1"`; the two identical EN segments in `m99905` satisfy its `HAVING count > 1`.)

- [ ] **Step 2: Run to verify the new tests fail**

Run: `npx vitest run server/__tests__/concordanceService.test.js`
Expected: FAIL — backfill `indexed` is 0 (module skipped via `chappendices` dead-end); throw case doesn't throw. Pre-existing tests green.

- [ ] **Step 3: Implement**

In `server/services/concordanceService.js`:

(a) Top of file:

```js
const { normalizeChapter } = require('../lib/chapterLabel');
```

(b) `indexModule` — at the very top of the function (before `loadModuleForEditing`):

```js
  const chapterNum = normalizeChapter(chapter);
  if (chapterNum === null) {
    throw new TypeError(`indexModule: unrecognizable chapter ${JSON.stringify(chapter)}`);
  }
```

then use `chapterNum` in the load call (`segmentParser.loadModuleForEditing(book, chapterNum, moduleId)`) and replace `const chapterLabel = String(chapter);` with `const chapterLabel = String(chapterNum);`.

(c) `backfill` — line ~169: replace

```js
      const chapter = dir === 'appendices' ? 'appendices' : parseInt(dir.replace('ch', ''), 10);
```

with

```js
      const chapter = dir === 'appendices' ? -1 : parseInt(dir.replace('ch', ''), 10);
```

- [ ] **Step 4: Run to verify**

Run: `npx vitest run server/__tests__/concordanceService.test.js`
Expected: PASS (new + pre-existing)

- [ ] **Step 5: Commit**

```bash
git add server/services/concordanceService.js server/__tests__/concordanceService.test.js
git commit -m "fix(item14): concordance — backfill converts dirname at boundary; canonical '-1' stored label; loud on garbage"
```

---

### Task 6: `routes/pipeline.js` — accept the appendices chapter

**Files:**
- Modify: `server/routes/pipeline.js:34-60` (validateParams) + one test-seam line at the bottom
- Test: `server/__tests__/pipelineValidateParams.test.js` (create)

**Interfaces:**
- Consumes: `normalizeChapter` from Task 1.
- Produces: `validateParams` returns `{ book, chapter: -1, track, moduleId }` for appendices; exposed for tests as `router._validateParams` (`/** @internal Test-only */`). Task 7's runners receive number `-1`.

- [ ] **Step 1: Write the failing test**

Create `server/__tests__/pipelineValidateParams.test.js`:

```js
/**
 * routes/pipeline.js validateParams — appendices acceptance matrix (item 14,
 * finding 23 first half). Uses the router._validateParams internal seam.
 */
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

// Insurance against any transitive eager DB open (dbPath resolves at require
// time in several services): point at a throwaway DB before the first require.
const work = mkdtempSync(path.join(tmpdir(), 'pipe-validate-'));
process.env.SESSIONS_DB_PATH = path.join(work, 'sessions.db');

let validateParams;
let BOOK;

beforeAll(() => {
  const { runAllMigrations } = require('../services/migrationRunner');
  runAllMigrations();
  const router = require('../routes/pipeline');
  validateParams = router._validateParams;
  const { VALID_BOOKS } = require('../config');
  if (!VALID_BOOKS.length) VALID_BOOKS.push('efnafraedi-2e');
  BOOK = VALID_BOOKS[0];
});

afterAll(() => {
  rmSync(work, { recursive: true, force: true });
});

function run(body) {
  let status = 200;
  let jsonBody = null;
  const res = {
    status(c) {
      status = c;
      return this;
    },
    json(b) {
      jsonBody = b;
    },
  };
  const result = validateParams({ body }, res);
  return { result, status, jsonBody };
}

describe('pipeline validateParams appendices matrix', () => {
  it('is exposed for tests', () => {
    expect(typeof validateParams).toBe('function');
  });

  it.each([['appendices'], ['-1'], [-1]])('accepts %j as chapter -1', (chapter) => {
    const { result } = run({ book: BOOK, chapter });
    expect(result).not.toBeNull();
    expect(result.chapter).toBe(-1);
  });

  it('accepts regular numeric chapters', () => {
    const { result } = run({ book: BOOK, chapter: '3' });
    expect(result).toEqual({ book: BOOK, chapter: 3, track: 'faithful', moduleId: undefined });
  });

  it.each([['0'], ['100'], ['chappendices'], ['']])('rejects %j with 400', (chapter) => {
    const { result, status } = run({ book: BOOK, chapter });
    expect(result).toBeNull();
    expect(status).toBe(400);
  });
});
```

(Verified: `server/config.js:99` seeds `VALID_BOOKS` with `'efnafraedi-2e'` hardcoded; the `beforeAll` guard covers the empty-after-refresh edge regardless.)

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run server/__tests__/pipelineValidateParams.test.js`
Expected: FAIL — `router._validateParams` is undefined.

- [ ] **Step 3: Implement**

In `server/routes/pipeline.js`:

(a) Top of file: `const { normalizeChapter } = require('../lib/chapterLabel');`

(b) In `validateParams`, replace

```js
  const chapterNum = parseInt(chapter, 10);
  if (isNaN(chapterNum) || chapterNum < 1 || chapterNum > MAX_CHAPTERS) {
    res.status(400).json({ error: 'Invalid chapter number' });
    return null;
  }
```

with

```js
  const chapterNum = normalizeChapter(chapter);
  if (chapterNum === null || (chapterNum !== -1 && (chapterNum < 1 || chapterNum > MAX_CHAPTERS))) {
    res.status(400).json({ error: 'Invalid chapter number' });
    return null;
  }
```

(c) Just above the file's `module.exports = router;`:

```js
/** @internal Test-only: expose validateParams for the acceptance-matrix test */
router._validateParams = validateParams;
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run server/__tests__/pipelineValidateParams.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add server/routes/pipeline.js server/__tests__/pipelineValidateParams.test.js
git commit -m "fix(item14): pipeline route accepts appendices (-1) — panel inject/render/run no longer 400s"
```

---

### Task 7: pipelineService — `cliChapterArg` on spawn argv

**Files:**
- Modify: `server/services/pipelineService.js:16` (spawn indirection), `:58`, `:193`, `:231` (the three argv sites), exports block `:933`
- Test: `server/__tests__/pipelineSpawnArgs.test.js` (create)

**Interfaces:**
- Consumes: `cliChapterArg` from Task 1.
- Produces: spawned argv carries `--chapter appendices` for `-1`; job records keep number `-1` (hasRunningJob strict-equality contract unchanged); `/** @internal */ _setTestSpawn(fn)` export (pass `null` to restore).

- [ ] **Step 1: Write the failing test**

Create `server/__tests__/pipelineSpawnArgs.test.js`:

```js
/**
 * pipelineService spawn argv — the CLI boundary emits the word 'appendices'
 * for chapter -1 (item 14, finding 23 second half; also fixes Vista+Birta
 * for appendix modules via runPipeline → runInject/runRender).
 */
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

// REQUIRED, not insurance: pipelineStatusService resolves SESSIONS_DB_PATH at
// require time, and runExtract's completion continuation (advanceChapterStatus
// + resetChapterStage) WRITES chapter status when the fake spawn exits 0. Point
// all of it at a throwaway migrated DB before the first require.
const work = mkdtempSync(path.join(tmpdir(), 'pipe-spawn-'));
process.env.SESSIONS_DB_PATH = path.join(work, 'sessions.db');

const pipeline = require('../services/pipelineService');

let spawnedCalls;

function fakeSpawn(command, args) {
  spawnedCalls.push({ command, args });
  return {
    stdout: { on() {} },
    stderr: { on() {} },
    on(event, cb) {
      if (event === 'close') setImmediate(() => cb(0));
    },
  };
}

beforeAll(() => {
  const { runAllMigrations } = require('../services/migrationRunner');
  runAllMigrations();
});

afterAll(() => {
  rmSync(work, { recursive: true, force: true });
});

beforeEach(() => {
  spawnedCalls = [];
  pipeline._setTestSpawn(fakeSpawn);
});

afterEach(() => {
  pipeline._setTestSpawn(null);
});

function chapterArgOf(call) {
  const i = call.args.indexOf('--chapter');
  expect(i).toBeGreaterThan(-1);
  return call.args[i + 1];
}

describe('spawn argv chapter dialect', () => {
  it('runInject emits --chapter appendices for -1 and keeps job.chapter = -1', async () => {
    const { jobId, promise } = pipeline.runInject({
      book: 'testbook',
      chapter: -1,
      moduleId: 'm99901',
    });
    await promise;
    expect(chapterArgOf(spawnedCalls[0])).toBe('appendices');
    expect(pipeline.getJob(jobId).chapter).toBe(-1);
  });

  it('runRender emits --chapter appendices for -1', async () => {
    const { promise } = pipeline.runRender({ book: 'testbook', chapter: -1 });
    await promise;
    expect(chapterArgOf(spawnedCalls[0])).toBe('appendices');
  });

  it('runExtract emits --chapter appendices for -1', async () => {
    const { promise } = pipeline.runExtract({ book: 'testbook', chapter: -1 });
    await promise;
    expect(chapterArgOf(spawnedCalls[0])).toBe('appendices');
  });

  it('regular chapters stay plain numbers on argv', async () => {
    const { promise } = pipeline.runRender({ book: 'testbook', chapter: 3 });
    await promise;
    expect(chapterArgOf(spawnedCalls[0])).toBe('3');
  });
});
```

(Verified: `runInject`/`runRender` return `spawnJob(...)` with no fs preconditions and no continuation; `runExtract` has no fs precondition but DOES attach a completion continuation calling `computeSourceHash` (fs-only, harmlessly null for the fake book) + `advanceChapterStatus` + `resetChapterStage` — the DB writes land in the temp migrated DB set up above. `spawnJob`'s close handler itself only mutates the in-memory job record.)

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run server/__tests__/pipelineSpawnArgs.test.js`
Expected: FAIL — `pipeline._setTestSpawn` is not a function.

- [ ] **Step 3: Implement**

In `server/services/pipelineService.js`:

(a) Line 16 area — replace

```js
const { spawn } = require('child_process');
```

with

```js
const { spawn } = require('child_process');
const { cliChapterArg } = require('../lib/chapterLabel');

// Test seam: spawnJob spawns through this indirection (item 14).
let spawnImpl = spawn;

/** @internal Test-only: override the spawn implementation (null restores). */
function _setTestSpawn(fn) {
  spawnImpl = fn || spawn;
}
```

(b) In `spawnJob` (~line 392): `const child = spawn(command, args, {` → `const child = spawnImpl(command, args, {`.

(c) The three argv sites — `runExtract` (:58), `runInject` (:193), `runRender` (:231): replace the `String(chapter),` argv element with `cliChapterArg(chapter),`.

(d) Add `_setTestSpawn,` to the `module.exports` block (next to `_jobsMap`).

Do NOT touch `runProtect`/`runUnprotect`/`runGenerateTm`/`computeSourceHash` — registered I14-R10, out of scope.

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run server/__tests__/pipelineSpawnArgs.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add server/services/pipelineService.js server/__tests__/pipelineSpawnArgs.test.js
git commit -m "fix(item14): pipelineService spawn argv emits 'appendices' for -1 — panel actions and Vista+Birta reach the tools"
```

---

### Task 8: front-end — three appendices touches in segment-editor.js

**Files:**
- Modify: `server/public/js/segment-editor.js:398-401` (concordance hit), `:753` (repetition hint), `:2525` (autoLoadFromParams)

**Interfaces:**
- Consumes: server now stores `"-1"` in `tm_segments.chapter` (Task 5); dropdown option values are `"-1"` for Viðaukar (existing behavior).
- Produces: nothing downstream; display + deep-link behavior only. No unit harness exists for this pane — covered by the manual-QA lines in spec register **I14-R8**.

- [ ] **Step 1: Concordance hit rendering (~line 398)**

Replace

```js
          const prov = `${escapeHtml(r.module_id)} · kafli ${escapeHtml(String(r.chapter))}`;
```

with

```js
          const provChapter =
            Number(r.chapter) === -1 ? 'Viðaukar' : `kafli ${escapeHtml(String(r.chapter))}`;
          const prov = `${escapeHtml(r.module_id)} · ${provChapter}`;
```

(The `href` two lines below stays unchanged — `chapter=-1` in the URL matches the dropdown option value `"-1"` via the autoload matcher.)

- [ ] **Step 2: Repetition hint provenance (~line 753)**

Replace

```js
        s.chapter === 'appendices'
          ? escapeHtml(s.module_id)
          : `${escapeHtml(s.module_id)} (kafli ${escapeHtml(String(s.chapter))})`;
```

with

```js
        Number(s.chapter) === -1
          ? `${escapeHtml(s.module_id)} (Viðaukar)`
          : `${escapeHtml(s.module_id)} (kafli ${escapeHtml(String(s.chapter))})`;
```

(The old string-compare tested a label the DB never stores; rows carry `"-1"`.)

- [ ] **Step 3: Deep-link autoload normalization (~line 2525)**

Replace

```js
    const chapter = params.get('chapter');
```

with

```js
    let chapter = params.get('chapter');
    // Item 14: status-page deep links and old bookmarks say 'appendices';
    // dropdown option values are canonical '-1'.
    if (chapter === 'appendices') chapter = '-1';
```

- [ ] **Step 4: Syntax check + full test suite**

Run: `node --check server/public/js/segment-editor.js`
Expected: no output (clean parse)

Run (repo root): `npm test`
Expected: full suite green — record the test-file/test count for the PR description.

- [ ] **Step 5: Commit**

```bash
git add server/public/js/segment-editor.js
git commit -m "fix(item14): editor pane — Viðaukar provenance labels + appendices deep-link normalization"
```

---

### Task 9: docs — campaign register + spec amendment

**Files:**
- Modify: `docs/plans/2026-07-11-pre-semester-coding-campaign.md` (add item-14 register block under Phase 3)
- Modify: `docs/superpowers/specs/2026-07-18-item14-appendices-label-design.md` (§5 R2 line + new R10)

**Interfaces:** none — documentation of deferred findings per the standing log-out-of-scope feedback rule.

- [ ] **Step 1: Add the register block to the campaign plan**

Insert after the item-13 register section (`### Register — findings/deferrals from item 13 (2026-07-17)` block) in `docs/plans/2026-07-11-pre-semester-coding-campaign.md`:

```markdown
### Register — findings/deferrals from item 14 (2026-07-18)
- **I14-R1 `[fix][lead]` — appendix authz lockout:** appendix assignment rows are impossible (`admin.js:1067` rejects `-1`) AND `hasChapterAccess`'s legacy branch (`userService.js:631`, via `requireBookAccess` on save/submit/propagate + loc save routes) 403s appendix saves for ANY editor holding ≥1 assignment in the book, even with enforcement OFF. Lead decision needed: allow `-1` assignment rows vs. book-level appendices access. Blocks appendix Pass-1 editing by assigned editors.
- **I14-R2 `[fix]` — remaining inline chapter validators rejecting appendices:** `publication.js:47` (whole publication API), `books.js:372/487` + bare unvalidated `parseInt` at `:213/248/276/522`, `admin.js:497/1067`, `status.js:1279` (`/sections`) and `:1846`.
- **I14-R3 `[fix]` — `ch`-prefix scan family silently skipping `appendices/`:** `scripts/validate-status.js:245` (`npm run validate` never validates `chapters/appendices/status.json`), `routes/status.js:148/628/826`, `pipelineService.checkBookDownstreamWork:654` + `checkExtractionImpact:504`, `bookRegistration.scanAndUpdateStatus:1020`, `generate-glossary.js:139`, `terminologyService.importFromKeyTerms:922`, `publicationService.checkTrackReadiness:54`, `exercise-extract.js:99`, `audit-equation-notation.js:66`.
- **I14-R4 `[fix]` — section registry never contains appendices** (`bookRegistration.registerBook:199` iterates `bookData.chapters` only) → sections/suggestions/localization review tab have no appendices rows in any label form.
- **I14-R5 `[fix]` — `tools/validate-chapter.js:987/1055`** can't validate appendices in either dialect.
- **I14-R6 `[hygiene]` — tools' ~7 copy-pasted `formatChapter` ternaries** could consolidate into one tools-lib helper; behavior already correct; refactor kept out of a behavioral PR per standing feedback.
- **I14-R7 `[contract]` — `routes/activity.js:114`** passes the raw `:chapter` URL param into the section activity query while rows store `String(-1)`.
- **I14-R8 `[test-gap][qa]` — zero appendices E2E coverage**; `__e2e-fixture__` has no appendices dir. Manual QA for the item-14 client touches: status dashboard appendix row shows real counts; "Opna ritil" deep link from an appendix row lands with Viðaukar selected; pipeline panel inject/render on Viðaukar runs; concordance hit from an appendix row renders "Viðaukar" and its provenance link loads.
- **I14-R9 `[ux]` — "Kafli -1" display labels** in `my-work.html:1380` (+5 sites) and `books.html:1786/2325` (item 16 / Batch 7 territory).
- **I14-R10 `[latent]` — pipelineService non-panel runners still chNN-only:** `runProtect`/`runUnprotect` (:102/:144, archived-tool runners), `runGenerateTm` (:856 throws loud on `-1` dir check; only whole-book callers exist today), `computeSourceHash` (:591 returns null for appendices → staleness checks blind there). Deploy note (I12-R3 precedent): one-time prod sanity `SELECT COUNT(*) FROM tm_segments WHERE chapter = 'appendices';` — expected 0.
```

- [ ] **Step 2: Amend the spec register**

In `docs/superpowers/specs/2026-07-18-item14-appendices-label-design.md` §5: extend the I14-R2 line with `status.js:1279 (/sections) and :1846`, and append the I14-R10 entry (same text as above, minus the deploy note which the spec already carries in §3.2).

- [ ] **Step 3: Full-suite gate + books/ purity check**

Run (repo root): `npm test`
Expected: green.

Run: `git status --porcelain books/`
Expected: empty output.

- [ ] **Step 4: Commit**

```bash
git add docs/plans/2026-07-11-pre-semester-coding-campaign.md docs/superpowers/specs/2026-07-18-item14-appendices-label-design.md
git commit -m "docs(item14): register I14-R1..R10 (appendices deferrals) + spec R2/R10 amendment"
```

---

## Completion

After Task 9: full `npm test` from repo root green → superpowers:requesting-code-review (campaign convention: whole-branch adversarial review before merge) → PR via superpowers:finishing-a-development-branch, title `fix(item14): appendices label unification (Batch G — findings 17+23)`. PR body lists: the contract, the 8 server sites + 3 client touches, register I14-R1..R10, suite count delta, and the I12-R3-style deploy sanity query.
