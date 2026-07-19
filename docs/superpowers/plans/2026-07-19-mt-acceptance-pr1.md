# MT-Acceptance PR1 ("Staðfesta vélþýðingu") Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the per-segment MT-acceptance record end-to-end — table, service, apply integration, derived sidecar, API, editor UI — so "the MT is fine as-is" becomes a first-class, byte-anchored, per-segment human attestation (campaign item 20b, PR1 of 2).

**Architecture:** New `segment_acceptances` table (migration 043) owned by a new `server/services/acceptanceService.js` (accept/revoke/supersede/drift-lapse/applied-stamp + the derived per-module `-review-status.json` sidecar). `segmentEditorService` widens the apply gate (edits OR acceptances), supersedes acceptances on edit-save, and stamps/lapses acceptances inside the apply transaction. Two new routes mirror existing middleware chains. The editor UI adds an accept button, Staðfest chip, revoke, two filter facets, stats/progress redefinition, and Ctrl/Cmd+Shift+Enter accept-and-advance.

**Tech Stack:** Node 22 / Express 5 / better-sqlite3 12 / Vitest / Playwright. Spec: `docs/superpowers/specs/2026-07-19-mt-acceptance-design.md` (approved).

## Global Constraints

- **Vocabulary (spec §3):** UI button **"Staðfesta MT"**, state **"Staðfest"**, facets **"Staðfest"** and **"Óyfirfarnir"**. "Samþykkja" stays reserved for the head editor's approve verb. Code/English identifiers use `acceptance` (`segment_acceptances`, `acceptSegment`, `revokeAcceptance`).
- **Single-step accept:** any editor with book access (`requireBookAccess()`) accepts; no HE ratification, no per-book toggle, **no accept-all/bulk** (spec §2).
- **Byte anchor:** `accepted_content` must equal the `loadModuleForEditing` view of the segment at accept time (409 `STALE_CONTENT`); it lapses (`content-drift`) whenever those bytes change. Acceptance rows are **never deleted** — status flips to `superseded` with a reason (`'superseded-by-edit' | 'content-drift' | 'revoked'`).
- **One active acceptance per segment** — partial unique index `WHERE status = 'active'` (segment-level, NOT per-editor).
- **Keep apply-gate error strings verbatim:** `'No approved edits to apply for this module'`, `'All approved edits have already been applied'`, `'Edits were applied by a concurrent request'` — the route maps 400 on `includes('No approved')`/`includes('already been')` and `segmentEditorService.test.js:1075` pins the substring `'No approved edits to apply'`. Do not reword them.
- **Sidecar:** `books/{book}/03-faithful-translation/chNN/{moduleId}-review-status.json`, regenerated at apply and at faithful-track restore; `.gitattributes` gets a `merge=ours` line for it; it rides the existing `books/*/03-faithful-translation/` git-backup pathspec with zero script changes.
- **Keyboard:** Ctrl/Cmd+**Shift**+Enter. The existing plain Ctrl+Enter save handler must gain `&& !e.shiftKey` or both fire.
- **Migration count pins:** `server/__tests__/startup.test.js` has THREE `42` sites (`toBe(42)` + two `i <= 42` loops) that all become `43`.
- **Authoritative gate:** `npm test` from the **repo root** (vitest workspace; server suite is sequential). E2E: `cd server && npm run test:e2e`.
- **Out of scope (spec §11):** corpus changes (PR2), localization-track acceptance, acceptance notes/categories, backfill of the 4 existing faithful modules, accept-all.
- Icelandic UI strings are raw UTF-8 in `ui-strings.js` / HTML / client JS — static pins must match file bytes, not escapes (campaign lesson).

## File Map

| File | Change |
|---|---|
| `server/migrations/043-segment-acceptances.js` | **Create** — table + 2 indexes |
| `server/services/migrationRunner.js` | Append 043 to the array (after line 74) |
| `server/__tests__/startup.test.js` | 42 → 43 (three sites + comment) |
| `server/services/acceptanceService.js` | **Create** — all acceptance logic + sidecar |
| `server/services/segmentEditorService.js` | supersede-on-edit; apply gate widening + in-txn stamp/lapse + post-txn sidecar; `getApplyStatus`; `getModuleStats`; `getEditorialProgress` |
| `server/services/contentVersionService.js` | faithful-restore hook: drift-lapse + sidecar |
| `server/routes/segment-editor.js` | `POST …/accept`, `POST /acceptance/:id/revoke`, module GET `acceptances` |
| `server/public/js/segment-editor.js` | accept/revoke/cursor/keyboard/filters/stats/progress/apply-status/withdraw-UX |
| `server/views/segment-editor.html` | 2 filter options + CSS |
| `server/public/js/ui-strings.js` | `UI.acceptance.*`, `UI.apply.unappliedCombined` |
| `.gitattributes` | sidecar `merge=ours` |
| Tests | `migration043.test.js`, `acceptanceService.test.js`, `acceptanceApply.test.js`, `acceptanceRoutes.test.js`, `acceptanceUiPins.test.js`, `e2e/acceptance.spec.js` |

---

### Task 0: Branch

- [ ] **Step 0.1:** From a clean `main`: `git checkout -b feat/item20b-mt-acceptance`

---

### Task 1: Migration 043 + runner registration + startup pins

**Files:**
- Create: `server/migrations/043-segment-acceptances.js`
- Modify: `server/services/migrationRunner.js:74` (append after 042)
- Modify: `server/__tests__/startup.test.js` (three 42→43 sites)
- Test: `server/__tests__/migration043.test.js`

**Interfaces:**
- Produces: table `segment_acceptances` (columns exactly as spec §4), partial unique index `idx_segment_acceptances_one_active`, index `idx_segment_acceptances_module`. Module export shape `{ name, up(db) }` — later tasks call `migration043.up(db)` in test DBs.

- [ ] **Step 1.1: Write the failing test**

Create `server/__tests__/migration043.test.js`:

```js
/**
 * Migration 043 — segment_acceptances (item 20b, "Staðfesta vélþýðingu").
 * Verifies: schema shape, one-active-per-segment partial unique index,
 * status CHECK, idempotent re-run, registration in migrationRunner,
 * startup pin count.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const Database = require('better-sqlite3');
const migration043 = require('../migrations/043-segment-acceptances');

const __dirname = dirname(fileURLToPath(import.meta.url));

let db;

beforeEach(() => {
  db = new Database(':memory:');
  migration043.up(db);
});

afterEach(() => db.close());

function insertActive(segmentId = 'm1:para:a') {
  return db
    .prepare(
      `INSERT INTO segment_acceptances
         (book, chapter, module_id, segment_id, accepted_content, accepted_by, accepted_by_username)
       VALUES ('bok', 1, 'm1', ?, 'texti', 'u1', 'editor1')`
    )
    .run(segmentId);
}

describe('migration 043 segment_acceptances', () => {
  it('creates the table with expected defaults', () => {
    insertActive();
    const row = db.prepare(`SELECT * FROM segment_acceptances`).get();
    expect(row.status).toBe('active');
    expect(row.accepted_at).toBeTruthy();
    expect(row.applied_at).toBeNull();
    expect(row.superseded_at).toBeNull();
    expect(row.superseded_reason).toBeNull();
  });

  it('one ACTIVE acceptance per segment (partial unique index)', () => {
    insertActive();
    expect(() => insertActive()).toThrow(/UNIQUE/);
    // A superseded row does NOT block a new active one
    db.prepare(`UPDATE segment_acceptances SET status = 'superseded'`).run();
    expect(() => insertActive()).not.toThrow();
  });

  it('status CHECK rejects unknown values', () => {
    insertActive();
    expect(() =>
      db.prepare(`UPDATE segment_acceptances SET status = 'accepted'`).run()
    ).toThrow(/CHECK/);
  });

  it('is idempotent on re-run', () => {
    insertActive();
    expect(() => migration043.up(db)).not.toThrow();
    expect(db.prepare(`SELECT COUNT(*) AS n FROM segment_acceptances`).get().n).toBe(1);
  });

  it('is registered in migrationRunner after 042', () => {
    const src = readFileSync(
      join(__dirname, '..', 'services', 'migrationRunner.js'),
      'utf-8'
    );
    expect(src).toContain(`'../migrations/043-segment-acceptances'`);
    expect(src.indexOf('042-content-versions-track')).toBeLessThan(
      src.indexOf('043-segment-acceptances')
    );
  });
});
```

- [ ] **Step 1.2: Run it — expect FAIL**

Run: `npx vitest run server/__tests__/migration043.test.js`
Expected: FAIL — `Cannot find module '../migrations/043-segment-acceptances'`

- [ ] **Step 1.3: Create the migration**

Create `server/migrations/043-segment-acceptances.js` (SQL verbatim from spec §4):

```js
/**
 * Migration 043: segment_acceptances — per-segment MT-acceptance record
 * ("Staðfesta vélþýðingu", campaign item 20b).
 *
 * An acceptance attests that a human read a segment's IS draft and confirmed
 * SPECIFIC bytes (accepted_content). One ACTIVE acceptance per segment —
 * the partial unique index makes it a segment-level fact, unlike
 * segment_edits' per-editor pending index. Revoked/superseded rows are kept
 * (status flip, never DELETE): the history is provenance.
 *
 * chapter uses the item-14 chapterLabel contract: -1 = appendices.
 * Sibling-table pattern (034/041 precedent); idempotent via IF NOT EXISTS.
 */

module.exports = {
  name: '043-segment-acceptances',

  up(db) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS segment_acceptances (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        book TEXT NOT NULL,
        chapter INTEGER NOT NULL,
        module_id TEXT NOT NULL,
        segment_id TEXT NOT NULL,
        accepted_content TEXT NOT NULL,
        accepted_by TEXT NOT NULL,
        accepted_by_username TEXT NOT NULL,
        accepted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','superseded')),
        superseded_at DATETIME,
        superseded_reason TEXT,
        applied_at DATETIME
      );

      CREATE UNIQUE INDEX IF NOT EXISTS idx_segment_acceptances_one_active
        ON segment_acceptances(book, module_id, segment_id) WHERE status = 'active';

      CREATE INDEX IF NOT EXISTS idx_segment_acceptances_module
        ON segment_acceptances(book, module_id);
    `);
  },
};
```

- [ ] **Step 1.4: Register in migrationRunner**

In `server/services/migrationRunner.js`, after the line `require('../migrations/042-content-versions-track'),` add:

```js
    require('../migrations/043-segment-acceptances'),
```

- [ ] **Step 1.5: Bump the startup pins**

In `server/__tests__/startup.test.js` make these exact edits:
- `it('all 42 migration files exist on disk', () => {` → `it('all 43 migration files exist on disk', () => {`
- `// 42 as of migration 042-content-versions-track (bumped from 41).` → `// 43 as of migration 043-segment-acceptances (bumped from 42).`
- `expect(files.length).toBe(42);` → `expect(files.length).toBe(43);`
- `for (let i = 1; i <= 42; i++) {` → `for (let i = 1; i <= 43; i++) {` (**both** occurrences)
- `it('migrationRunner references all 42 migrations', () => {` → `it('migrationRunner references all 43 migrations', () => {`

- [ ] **Step 1.6: Run both suites — expect PASS**

Run: `npx vitest run server/__tests__/migration043.test.js server/__tests__/startup.test.js server/__tests__/migrationIdempotency.test.js`
Expected: PASS (migrationIdempotency auto-discovers 043 and re-runs it; IF NOT EXISTS keeps it clean)

- [ ] **Step 1.7: Commit**

```bash
git add server/migrations/043-segment-acceptances.js server/services/migrationRunner.js server/__tests__/startup.test.js server/__tests__/migration043.test.js
git commit -m "feat(item20b): migration 043 segment_acceptances + runner registration + pin bumps"
```

---

### Task 2: acceptanceService — accept, idempotence, guards, MT-lock

**Files:**
- Create: `server/services/acceptanceService.js`
- Test: `server/__tests__/acceptanceService.test.js`

**Interfaces:**
- Consumes: `segmentParser.loadModuleForEditing(book, chapter, moduleId)` (segments have `{segmentId, is, hasTranslation}`), `segmentParser.getModulePaths(...).mtOutput`, `mtLock.writeMtLock(mtOutputPath, meta)`, `require('../lib/dbPath')`, `require('../lib/editRecency').pickLatest`.
- Produces (used by Tasks 3–9):
  - `acceptSegment({book, chapter, moduleId, segmentId, acceptedContent, userId, username})` → `{alreadyAccepted: boolean, acceptance: <row>}`; throws `Error` with `.code` in `'STALE_CONTENT' | 'EDIT_EXISTS' | 'NO_TRANSLATION' | 'SEGMENT_NOT_FOUND'`
  - `getModuleAcceptances(book, moduleId)` → active rows (array)
  - `getAcceptanceById(id)` → row | undefined
  - `revokeAcceptance(id, {actorId, actorRole, actorBooks})` → updated row; throws `.code='FORBIDDEN'` / `'Acceptance not found'` / `'Acceptance is not active'` (Task 3 tests it)
  - `supersedeForEdit(book, moduleId, segmentId, dbConn)` (Task 3)
  - `lapseDrifted(book, moduleId, writtenSegments, dbConn)` → lapsed count (Task 3)
  - `stampApplied(book, moduleId, dbConn)` → stamped count (Task 3)
  - `writeReviewStatusSidecar(book, chapter, moduleId, dbConn)` → sidecar path; `sidecarPathFor(book, chapter, moduleId)` (Task 4)
  - `_setTestDb(db)`
- All mutating helpers accept an optional trailing `dbConn` (default: own singleton) — callers inside another connection's transaction MUST pass their own connection (same rule as `contentVersionService.snapshotModule`).

- [ ] **Step 2.1: Write the failing tests**

Create `server/__tests__/acceptanceService.test.js`:

```js
/**
 * Acceptance Service Tests (item 20b) — accept happy path + idempotence,
 * 409 guards (STALE_CONTENT / EDIT_EXISTS / NO_TRANSLATION), first-accept
 * MT-lock, revoke authz, supersede-on-edit, content-drift lapse,
 * applied_at stamping, sidecar (Task 3/4 describes live in this file too).
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createRequire } from 'module';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, unlinkSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

const require = createRequire(import.meta.url);

// Pin the DB env BEFORE any server require (same rule as segmentEditorService.test.js)
process.env.SESSIONS_DB_PATH = join(tmpdir(), `acc-test-${process.pid}.db`);

const Database = require('better-sqlite3');
const acceptance = require('../services/acceptanceService');
const editorService = require('../services/segmentEditorService');
const segmentParser = require('../services/segmentParser');
const mtLock = require('../../tools/lib/mt-lock.cjs');
const { createSegmentEditsSchema } = require('./helpers/segmentEditsSchema.cjs');
const migration043 = require('../migrations/043-segment-acceptances');

const BOOK = 'accbook';
const MODULE = 'm00001';
const originalBooksDir = segmentParser.BOOKS_DIR;

let db;
let tmpDir;
let booksDir;

beforeAll(() => {
  db = new Database(':memory:');
  db.pragma('journal_mode = WAL');
  createSegmentEditsSchema(db);
  migration043.up(db);
  acceptance._setTestDb(db);
  editorService._setTestDb(db);

  tmpDir = mkdtempSync(join(tmpdir(), 'acc-svc-'));
  booksDir = join(tmpDir, 'books');
  const en = join(booksDir, BOOK, '02-for-mt', 'ch01');
  const mt = join(booksDir, BOOK, '02-mt-output', 'ch01');
  mkdirSync(en, { recursive: true });
  mkdirSync(mt, { recursive: true });
  writeFileSync(
    join(en, `${MODULE}-segments.en.md`),
    [
      '<!-- SEG:m00001:para:fs-id001 -->',
      'Paragraph one.',
      '',
      '<!-- SEG:m00001:para:fs-id002 -->',
      'Paragraph two.',
      '',
      '<!-- SEG:m00001:para:fs-id004 -->',
      'Untranslated paragraph.',
    ].join('\n'),
    'utf-8'
  );
  writeFileSync(
    join(mt, `${MODULE}-segments.is.md`),
    [
      '<!-- SEG:m00001:para:fs-id001 -->',
      'Fyrsta efnisgrein.',
      '',
      '<!-- SEG:m00001:para:fs-id002 -->',
      'Önnur efnisgrein.',
    ].join('\n'),
    'utf-8'
  );
  segmentParser._setTestBooksDir(booksDir);
  editorService._setTestBooksDir(booksDir);
});

afterAll(() => {
  db.close();
  acceptance._setTestDb(null);
  editorService._setTestDb(null);
  segmentParser._setTestBooksDir(originalBooksDir);
  editorService._setTestBooksDir(originalBooksDir);
});

beforeEach(() => {
  db.exec('DELETE FROM segment_acceptances');
  db.exec('DELETE FROM segment_edits');
  const lockPath = mtLock.mtLockPathFor(
    segmentParser.getModulePaths(BOOK, 1, MODULE).mtOutput
  );
  if (existsSync(lockPath)) unlinkSync(lockPath);
});

function accept(segmentId = 'm00001:para:fs-id001', content = 'Fyrsta efnisgrein.') {
  return acceptance.acceptSegment({
    book: BOOK,
    chapter: 1,
    moduleId: MODULE,
    segmentId,
    acceptedContent: content,
    userId: 'user-1',
    username: 'editor1',
  });
}

/**
 * Assert fn throws an error carrying the given .code — toThrow with
 * asymmetric matchers is version-sensitive; this is explicit and portable.
 */
function expectCode(fn, code) {
  let thrown = null;
  try {
    fn();
  } catch (e) {
    thrown = e;
  }
  expect(thrown, `expected a thrown error with code ${code}`).toBeTruthy();
  expect(thrown.code).toBe(code);
}

describe('acceptSegment', () => {
  it('records an active acceptance with the exact bytes', () => {
    const result = accept();
    expect(result.alreadyAccepted).toBe(false);
    expect(result.acceptance.status).toBe('active');
    expect(result.acceptance.accepted_content).toBe('Fyrsta efnisgrein.');
    expect(result.acceptance.accepted_by).toBe('user-1');
    expect(result.acceptance.accepted_by_username).toBe('editor1');
    expect(result.acceptance.chapter).toBe(1);
  });

  it('is idempotent: second accept returns alreadyAccepted, one row', () => {
    accept();
    const second = accept();
    expect(second.alreadyAccepted).toBe(true);
    expect(
      db.prepare(`SELECT COUNT(*) AS n FROM segment_acceptances`).get().n
    ).toBe(1);
  });

  it('409 STALE_CONTENT when bytes differ from the current baseline', () => {
    expectCode(() => accept('m00001:para:fs-id001', 'Aðrir bætar.'), 'STALE_CONTENT');
  });

  it('409 EDIT_EXISTS on a pending edit', () => {
    editorService.saveSegmentEdit({
      book: BOOK, chapter: 1, moduleId: MODULE,
      segmentId: 'm00001:para:fs-id001',
      originalContent: 'Fyrsta efnisgrein.', editedContent: 'Breytt.',
      editorId: 'user-2', editorUsername: 'editor2',
    });
    expectCode(() => accept(), 'EDIT_EXISTS');
  });

  it('409 EDIT_EXISTS on an approved-but-unapplied edit', () => {
    const { id } = editorService.saveSegmentEdit({
      book: BOOK, chapter: 1, moduleId: MODULE,
      segmentId: 'm00001:para:fs-id001',
      originalContent: 'Fyrsta efnisgrein.', editedContent: 'Breytt.',
      editorId: 'user-2', editorUsername: 'editor2',
    });
    editorService.approveEdit(id, 'rev-1', 'reviewer1');
    expectCode(() => accept(), 'EDIT_EXISTS');
  });

  it('a REJECTED edit does not block acceptance', () => {
    const { id } = editorService.saveSegmentEdit({
      book: BOOK, chapter: 1, moduleId: MODULE,
      segmentId: 'm00001:para:fs-id001',
      originalContent: 'Fyrsta efnisgrein.', editedContent: 'Breytt.',
      editorId: 'user-2', editorUsername: 'editor2',
    });
    editorService.rejectEdit(id, 'rev-1', 'reviewer1');
    expect(accept().alreadyAccepted).toBe(false);
  });

  it('NO_TRANSLATION for a segment with no IS content', () => {
    expectCode(() => accept('m00001:para:fs-id004', ''), 'NO_TRANSLATION');
  });

  it('SEGMENT_NOT_FOUND for an unknown segment', () => {
    expectCode(() => accept('m00001:para:nope', 'x'), 'SEGMENT_NOT_FOUND');
  });

  it('writes the Track-C MT lock on the module FIRST acceptance only', () => {
    const lockPath = mtLock.mtLockPathFor(
      segmentParser.getModulePaths(BOOK, 1, MODULE).mtOutput
    );
    expect(existsSync(lockPath)).toBe(false);
    accept();
    expect(existsSync(lockPath)).toBe(true);
  });

  it('getModuleAcceptances returns only active rows', () => {
    accept();
    accept('m00001:para:fs-id002', 'Önnur efnisgrein.');
    db.prepare(
      `UPDATE segment_acceptances SET status = 'superseded'
       WHERE segment_id = 'm00001:para:fs-id002'`
    ).run();
    const rows = acceptance.getModuleAcceptances(BOOK, MODULE);
    expect(rows).toHaveLength(1);
    expect(rows[0].segment_id).toBe('m00001:para:fs-id001');
  });
});
```

- [ ] **Step 2.2: Run — expect FAIL**

Run: `npx vitest run server/__tests__/acceptanceService.test.js`
Expected: FAIL — `Cannot find module '../services/acceptanceService'`

- [ ] **Step 2.3: Create the service**

Create `server/services/acceptanceService.js`:

```js
/**
 * Acceptance Service — per-segment MT-acceptance records (item 20b).
 *
 * "Staðfesta vélþýðingu": an editor attests that a segment's existing IS
 * content (usually the MT draft) is correct as-is. The record is
 * byte-anchored: accepted_content must equal the editor-view baseline at
 * accept time (STALE_CONTENT) and lapses when the segment's content later
 * changes by any route (content-drift) — it can never silently bless bytes
 * the editor didn't read.
 *
 * Also owns the derived per-module review-status sidecar written next to
 * the faithful file at apply/restore time (rides the 03-faithful-translation
 * git-backup pathspec).
 *
 * Mutating helpers take an optional trailing dbConn: callers already inside
 * a write transaction on their OWN connection (saveSegmentEdit, apply) must
 * pass it — a second connection's write would hit SQLITE_BUSY (same rule as
 * contentVersionService.snapshotModule).
 */

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const log = require('../lib/logger');
const mtLock = require('../../tools/lib/mt-lock.cjs');
const segmentParser = require('./segmentParser');
const resolveDbPath = require('../lib/dbPath');
const { pickLatest } = require('../lib/editRecency');

const DB_PATH = resolveDbPath();

let db;
function getDb() {
  if (!db) {
    const dbDir = path.dirname(DB_PATH);
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
  }
  return db;
}

function codedError(code, message) {
  const err = new Error(message);
  err.code = code;
  return err;
}

/**
 * Record an acceptance of a segment's current content.
 *
 * The baseline is the same loadModuleForEditing view the client loaded, so
 * the byte comparison is both the concurrency token and the saveRetry replay
 * guard: a queued replay after content changed 409s instead of blessing
 * unseen bytes.
 *
 * @returns {{ alreadyAccepted: boolean, acceptance: object }}
 */
function acceptSegment({ book, chapter, moduleId, segmentId, acceptedContent, userId, username }) {
  const conn = getDb();

  const data = segmentParser.loadModuleForEditing(book, chapter, moduleId);
  const seg = data.segments.find((s) => s.segmentId === segmentId);
  if (!seg) {
    throw codedError('SEGMENT_NOT_FOUND', 'segment not found');
  }
  if (!seg.hasTranslation) {
    throw codedError('NO_TRANSLATION', 'Þessi bútur hefur enga þýðingu til að staðfesta.');
  }
  if (acceptedContent !== seg.is) {
    throw codedError(
      'STALE_CONTENT',
      'Innihald bútsins hefur breyst — endurhlaðið eininguna og staðfestið aftur.'
    );
  }

  // An active (pending or approved-but-unapplied) edit outranks acceptance:
  // the segment is not "MT as-is" while a revision is in flight.
  const activeEdit = conn
    .prepare(
      `SELECT id FROM segment_edits
       WHERE book = ? AND module_id = ? AND segment_id = ?
         AND (status = 'pending' OR (status = 'approved' AND applied_at IS NULL))`
    )
    .get(book, moduleId, segmentId);
  if (activeEdit) {
    throw codedError(
      'EDIT_EXISTS',
      'Bútur er með virka breytingu í ferli — staðfesting á ekki við.'
    );
  }

  const existing = conn
    .prepare(
      `SELECT * FROM segment_acceptances
       WHERE book = ? AND module_id = ? AND segment_id = ? AND status = 'active'`
    )
    .get(book, moduleId, segmentId);
  if (existing) {
    return { alreadyAccepted: true, acceptance: existing };
  }

  let insertResult;
  try {
    insertResult = conn
      .prepare(
        `INSERT INTO segment_acceptances
           (book, chapter, module_id, segment_id, accepted_content, accepted_by, accepted_by_username)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(book, chapter, moduleId, segmentId, acceptedContent, String(userId), username);
  } catch (err) {
    // Two concurrent accepts race past the SELECT: the partial unique index
    // decides, and the loser resolves to the winner's row (idempotent).
    if (String(err.code || '').startsWith('SQLITE_CONSTRAINT')) {
      const winner = conn
        .prepare(
          `SELECT * FROM segment_acceptances
           WHERE book = ? AND module_id = ? AND segment_id = ? AND status = 'active'`
        )
        .get(book, moduleId, segmentId);
      if (winner) return { alreadyAccepted: true, acceptance: winner };
    }
    throw err;
  }

  // MT edit-lock (Track C, mirror of the first-edit path in saveSegmentEdit):
  // a module whose MT a human has REVIEWED must never be silently
  // re-translated. Loud but non-blocking — a lock-write failure must never
  // break the accept itself.
  try {
    const priorCount = conn
      .prepare(
        `SELECT count(*) AS n FROM segment_acceptances
         WHERE book = ? AND chapter = ? AND module_id = ?`
      )
      .get(book, chapter, moduleId).n;
    if (priorCount === 1) {
      const { mtOutput } = segmentParser.getModulePaths(book, chapter, moduleId);
      if (fs.existsSync(mtOutput)) {
        mtLock.writeMtLock(mtOutput, {
          reason: 'acceptance-started',
          firstAcceptanceId: insertResult.lastInsertRowid,
        });
      }
    }
  } catch (err) {
    log.error({ err, book, chapter, moduleId }, 'MT lock write failed on first acceptance');
  }

  return {
    alreadyAccepted: false,
    acceptance: conn
      .prepare(`SELECT * FROM segment_acceptances WHERE id = ?`)
      .get(insertResult.lastInsertRowid),
  };
}

/** Active acceptances for a module. */
function getModuleAcceptances(book, moduleId) {
  return getDb()
    .prepare(
      `SELECT * FROM segment_acceptances
       WHERE book = ? AND module_id = ? AND status = 'active'
       ORDER BY id ASC`
    )
    .all(book, moduleId);
}

function getAcceptanceById(id) {
  return getDb().prepare(`SELECT * FROM segment_acceptances WHERE id = ?`).get(id);
}

/**
 * Revoke an active acceptance. Owner, or a head editor scoped to the row's
 * book (admin bypasses) — the authz lives here because owner-OR-HE cannot be
 * expressed by the route middleware (same pattern as deleteSegmentEdit).
 */
function revokeAcceptance(acceptanceId, { actorId, actorRole, actorBooks }) {
  const conn = getDb();
  const row = conn.prepare(`SELECT * FROM segment_acceptances WHERE id = ?`).get(acceptanceId);
  if (!row) throw new Error('Acceptance not found');
  if (row.status !== 'active') throw new Error('Acceptance is not active');

  const isOwner = String(row.accepted_by) === String(actorId);
  const isHead =
    actorRole === 'admin' ||
    (actorRole === 'head-editor' && Array.isArray(actorBooks) && actorBooks.includes(row.book));
  if (!isOwner && !isHead) {
    throw codedError(
      'FORBIDDEN',
      'Aðeins eigandi staðfestingar eða ritstjóri bókarinnar getur afturkallað hana.'
    );
  }

  conn
    .prepare(
      `UPDATE segment_acceptances
       SET status = 'superseded', superseded_at = CURRENT_TIMESTAMP, superseded_reason = 'revoked'
       WHERE id = ?`
    )
    .run(acceptanceId);
  return conn.prepare(`SELECT * FROM segment_acceptances WHERE id = ?`).get(acceptanceId);
}

/**
 * Supersede the segment's active acceptance because an edit was saved on it
 * (spec §7). Called from inside saveSegmentEdit's transactions — pass conn.
 */
function supersedeForEdit(book, moduleId, segmentId, dbConn = getDb()) {
  dbConn
    .prepare(
      `UPDATE segment_acceptances
       SET status = 'superseded', superseded_at = CURRENT_TIMESTAMP,
           superseded_reason = 'superseded-by-edit'
       WHERE book = ? AND module_id = ? AND segment_id = ? AND status = 'active'`
    )
    .run(book, moduleId, segmentId);
}

/**
 * Lapse acceptances whose attested bytes no longer match the content just
 * written for their segment. writtenSegments is [{segmentId, content}] — the
 * exact bytes the caller (apply/restore) wrote, so no disk re-read and no
 * normalization ambiguity. A segment missing from the written set counts as
 * drifted (the extraction no longer carries it).
 *
 * @returns {number} lapsed row count
 */
function lapseDrifted(book, moduleId, writtenSegments, dbConn = getDb()) {
  const byId = new Map(writtenSegments.map((s) => [s.segmentId, s.content]));
  const active = dbConn
    .prepare(
      `SELECT id, segment_id, accepted_content FROM segment_acceptances
       WHERE book = ? AND module_id = ? AND status = 'active'`
    )
    .all(book, moduleId);
  const lapse = dbConn.prepare(
    `UPDATE segment_acceptances
     SET status = 'superseded', superseded_at = CURRENT_TIMESTAMP,
         superseded_reason = 'content-drift'
     WHERE id = ?`
  );
  let lapsed = 0;
  for (const a of active) {
    if (byId.get(a.segment_id) !== a.accepted_content) {
      lapse.run(a.id);
      lapsed++;
    }
  }
  return lapsed;
}

/**
 * Stamp all still-active, not-yet-applied acceptances as published (spec §7:
 * "acceptances that are active at a successful apply get applied_at").
 *
 * @returns {number} stamped row count
 */
function stampApplied(book, moduleId, dbConn = getDb()) {
  return dbConn
    .prepare(
      `UPDATE segment_acceptances SET applied_at = CURRENT_TIMESTAMP
       WHERE book = ? AND module_id = ? AND status = 'active' AND applied_at IS NULL`
    )
    .run(book, moduleId).changes;
}

/** Sidecar path: sibling of the faithful segments file. */
function sidecarPathFor(book, chapter, moduleId) {
  const { faithful } = segmentParser.getModulePaths(book, chapter, moduleId);
  return faithful.replace(/-segments\.is\.md$/, '-review-status.json');
}

/**
 * Derive and write the per-module review-status sidecar (spec §8) from DB
 * state + the faithful file. Key order = file segment order (deterministic).
 *
 * Status per segment:
 *   accepted  — active acceptance. Checked FIRST: drift-lapse runs before
 *               every sidecar regeneration, so an active acceptance is
 *               content-verified for the CURRENT bytes even when an older
 *               applied edit exists on the segment (restore edge).
 *   edited    — an approved+applied edit exists (newest by the canonical
 *               recency rule); by/at = editor_username/reviewed_at.
 *   carryover — published without per-segment review.
 *
 * @returns {string} the sidecar path
 */
function writeReviewStatusSidecar(book, chapter, moduleId, dbConn = getDb()) {
  const { faithful } = segmentParser.getModulePaths(book, chapter, moduleId);
  if (!fs.existsSync(faithful)) {
    throw new Error(`Faithful file not found — no sidecar to derive: ${faithful}`);
  }
  const fileSegments = segmentParser.parseSegments(fs.readFileSync(faithful, 'utf-8'));

  const acceptancesBySeg = new Map(
    dbConn
      .prepare(
        `SELECT * FROM segment_acceptances
         WHERE book = ? AND module_id = ? AND status = 'active'`
      )
      .all(book, moduleId)
      .map((a) => [a.segment_id, a])
  );

  const appliedEditsBySeg = {};
  for (const e of dbConn
    .prepare(
      `SELECT id, segment_id, editor_username, reviewed_at, created_at
       FROM segment_edits
       WHERE book = ? AND module_id = ? AND status = 'approved' AND applied_at IS NOT NULL`
    )
    .all(book, moduleId)) {
    (appliedEditsBySeg[e.segment_id] = appliedEditsBySeg[e.segment_id] || []).push(e);
  }

  const segments = {};
  for (const seg of fileSegments) {
    const acc = acceptancesBySeg.get(seg.segmentId);
    if (acc) {
      segments[seg.segmentId] = {
        status: 'accepted',
        by: acc.accepted_by_username,
        at: acc.accepted_at,
      };
    } else if (appliedEditsBySeg[seg.segmentId]) {
      const winner = pickLatest(appliedEditsBySeg[seg.segmentId]);
      segments[seg.segmentId] = {
        status: 'edited',
        by: winner.editor_username,
        at: winner.reviewed_at,
      };
    } else {
      segments[seg.segmentId] = { status: 'carryover' };
    }
  }

  const sidecar = {
    generated: new Date().toISOString(),
    book,
    chapter: String(chapter),
    module: moduleId,
    segments,
  };
  const outPath = sidecarPathFor(book, chapter, moduleId);
  fs.writeFileSync(outPath, JSON.stringify(sidecar, null, 2) + '\n', 'utf-8');
  return outPath;
}

/** @internal Test-only: inject an in-memory DB instance */
function _setTestDb(testDb) {
  db = testDb;
}

module.exports = {
  acceptSegment,
  getModuleAcceptances,
  getAcceptanceById,
  revokeAcceptance,
  supersedeForEdit,
  lapseDrifted,
  stampApplied,
  sidecarPathFor,
  writeReviewStatusSidecar,
  _setTestDb,
};
```

- [ ] **Step 2.4: Run — expect PASS**

Run: `npx vitest run server/__tests__/acceptanceService.test.js`
Expected: PASS (all `acceptSegment` describes)

- [ ] **Step 2.5: Commit**

```bash
git add server/services/acceptanceService.js server/__tests__/acceptanceService.test.js
git commit -m "feat(item20b): acceptanceService — accept + guards + idempotence + first-accept MT-lock"
```

---

### Task 3: Lifecycle — revoke authz, supersede-on-edit, drift-lapse, applied-stamp

**Files:**
- Modify: `server/services/segmentEditorService.js` (require + two transaction hooks in `saveSegmentEdit`)
- Test: `server/__tests__/acceptanceService.test.js` (append describes)

**Interfaces:**
- Consumes: Task 2's `revokeAcceptance` / `supersedeForEdit` / `lapseDrifted` / `stampApplied` (already implemented in Task 2's file — this task WIRES `supersedeForEdit` into `saveSegmentEdit` and proves all four behaviors).

- [ ] **Step 3.1: Write the failing tests** — append to `server/__tests__/acceptanceService.test.js`:

```js
describe('revokeAcceptance authz', () => {
  it('owner can revoke; row flips to superseded(revoked)', () => {
    const { acceptance: a } = accept();
    const row = acceptance.revokeAcceptance(a.id, {
      actorId: 'user-1', actorRole: 'editor', actorBooks: [],
    });
    expect(row.status).toBe('superseded');
    expect(row.superseded_reason).toBe('revoked');
    expect(row.superseded_at).toBeTruthy();
  });

  it('another editor cannot revoke (FORBIDDEN)', () => {
    const { acceptance: a } = accept();
    expectCode(
      () =>
        acceptance.revokeAcceptance(a.id, {
          actorId: 'user-9', actorRole: 'editor', actorBooks: [],
        }),
      'FORBIDDEN'
    );
  });

  it('book-scoped head editor can revoke; head editor of ANOTHER book cannot', () => {
    const { acceptance: a } = accept();
    expectCode(
      () =>
        acceptance.revokeAcceptance(a.id, {
          actorId: 'he-2', actorRole: 'head-editor', actorBooks: ['other-book'],
        }),
      'FORBIDDEN'
    );
    const row = acceptance.revokeAcceptance(a.id, {
      actorId: 'he-1', actorRole: 'head-editor', actorBooks: [BOOK],
    });
    expect(row.status).toBe('superseded');
  });

  it('admin can revoke', () => {
    const { acceptance: a } = accept();
    const row = acceptance.revokeAcceptance(a.id, {
      actorId: 'adm', actorRole: 'admin', actorBooks: [],
    });
    expect(row.status).toBe('superseded');
  });

  it('unknown id / non-active row throw', () => {
    expect(() =>
      acceptance.revokeAcceptance(99999, {
        actorId: 'user-1', actorRole: 'editor', actorBooks: [],
      })
    ).toThrow('Acceptance not found');
    const { acceptance: a } = accept();
    acceptance.revokeAcceptance(a.id, {
      actorId: 'user-1', actorRole: 'editor', actorBooks: [],
    });
    expect(() =>
      acceptance.revokeAcceptance(a.id, {
        actorId: 'user-1', actorRole: 'editor', actorBooks: [],
      })
    ).toThrow('Acceptance is not active');
  });
});

describe('edit supersedes acceptance (spec §7)', () => {
  it('saving an edit on an accepted segment lapses the acceptance', () => {
    const { acceptance: a } = accept();
    editorService.saveSegmentEdit({
      book: BOOK, chapter: 1, moduleId: MODULE,
      segmentId: 'm00001:para:fs-id001',
      originalContent: 'Fyrsta efnisgrein.', editedContent: 'Breytt efnisgrein.',
      editorId: 'user-2', editorUsername: 'editor2',
    });
    const row = acceptance.getAcceptanceById(a.id);
    expect(row.status).toBe('superseded');
    expect(row.superseded_reason).toBe('superseded-by-edit');
  });

  it('withdrawing the edit does NOT resurrect the acceptance (re-accept is one keypress)', () => {
    const { acceptance: a } = accept();
    editorService.saveSegmentEdit({
      book: BOOK, chapter: 1, moduleId: MODULE,
      segmentId: 'm00001:para:fs-id001',
      originalContent: 'Fyrsta efnisgrein.', editedContent: 'Breytt efnisgrein.',
      editorId: 'user-2', editorUsername: 'editor2',
    });
    // Withdraw: identical content deletes the pending row (server :107-115)
    editorService.saveSegmentEdit({
      book: BOOK, chapter: 1, moduleId: MODULE,
      segmentId: 'm00001:para:fs-id001',
      originalContent: 'Fyrsta efnisgrein.', editedContent: 'Fyrsta efnisgrein.',
      editorId: 'user-2', editorUsername: 'editor2',
    });
    expect(acceptance.getAcceptanceById(a.id).status).toBe('superseded');
    // ...and the segment can simply be re-accepted
    expect(accept().alreadyAccepted).toBe(false);
  });

  it('the UPDATE-existing-pending path also supersedes a later acceptance', () => {
    // pending edit first, acceptance would be blocked — so build the edge the
    // other way: edit on seg2, accept seg2 is blocked; instead verify the
    // update path on seg1: edit → (acceptance impossible) — so directly
    // insert an active acceptance row, then update the pending edit.
    editorService.saveSegmentEdit({
      book: BOOK, chapter: 1, moduleId: MODULE,
      segmentId: 'm00001:para:fs-id001',
      originalContent: 'Fyrsta efnisgrein.', editedContent: 'Breytt v1.',
      editorId: 'user-2', editorUsername: 'editor2',
    });
    db.prepare(
      `INSERT INTO segment_acceptances
         (book, chapter, module_id, segment_id, accepted_content, accepted_by, accepted_by_username)
       VALUES (?, 1, ?, 'm00001:para:fs-id001', 'Fyrsta efnisgrein.', 'u9', 'editor9')`
    ).run(BOOK, MODULE);
    editorService.saveSegmentEdit({
      book: BOOK, chapter: 1, moduleId: MODULE,
      segmentId: 'm00001:para:fs-id001',
      originalContent: 'Fyrsta efnisgrein.', editedContent: 'Breytt v2.',
      editorId: 'user-2', editorUsername: 'editor2',
    });
    const row = db
      .prepare(`SELECT * FROM segment_acceptances WHERE accepted_by = 'u9'`)
      .get();
    expect(row.status).toBe('superseded');
    expect(row.superseded_reason).toBe('superseded-by-edit');
  });
});

describe('lapseDrifted + stampApplied', () => {
  it('lapses when written bytes differ; keeps a matching acceptance active', () => {
    accept();
    accept('m00001:para:fs-id002', 'Önnur efnisgrein.');
    const lapsed = acceptance.lapseDrifted(BOOK, MODULE, [
      { segmentId: 'm00001:para:fs-id001', content: 'Allt aðrir bætar.' },
      { segmentId: 'm00001:para:fs-id002', content: 'Önnur efnisgrein.' },
    ]);
    expect(lapsed).toBe(1);
    const rows = db
      .prepare(`SELECT segment_id, status, superseded_reason FROM segment_acceptances ORDER BY id`)
      .all();
    expect(rows[0]).toMatchObject({ status: 'superseded', superseded_reason: 'content-drift' });
    expect(rows[1]).toMatchObject({ status: 'active', superseded_reason: null });
  });

  it('a segment missing from the written set lapses too', () => {
    accept();
    expect(acceptance.lapseDrifted(BOOK, MODULE, [])).toBe(1);
  });

  it('stampApplied stamps active NULL rows only, returns the count', () => {
    accept();
    accept('m00001:para:fs-id002', 'Önnur efnisgrein.');
    expect(acceptance.stampApplied(BOOK, MODULE)).toBe(2);
    // Second stamp is a no-op (already applied)
    expect(acceptance.stampApplied(BOOK, MODULE)).toBe(0);
    const stamped = db
      .prepare(`SELECT COUNT(*) AS n FROM segment_acceptances WHERE applied_at IS NOT NULL`)
      .get().n;
    expect(stamped).toBe(2);
  });
});
```

- [ ] **Step 3.2: Run — expect FAIL** (the two supersede-on-edit tests fail: `saveSegmentEdit` doesn't touch acceptances yet; the revoke/lapse/stamp describes pass because Task 2 shipped them)

Run: `npx vitest run server/__tests__/acceptanceService.test.js`
Expected: FAIL on `'edit supersedes acceptance'` describes only

- [ ] **Step 3.3: Wire supersede-on-edit into `saveSegmentEdit`**

In `server/services/segmentEditorService.js`:

1. Near the top imports (after `const contentVersionService = require('./contentVersionService');`) add:

```js
const acceptanceService = require('./acceptanceService');
```

2. In the `updateWithSupersede` transaction (the UPDATE-existing-pending branch), add as the FIRST statement inside the transaction callback:

```js
      // item 20b: a saved revision supersedes the segment's active acceptance
      // (spec §7) — same transaction, same connection.
      acceptanceService.supersedeForEdit(book, moduleId, segmentId, conn);
```

3. In the `insertWithSupersede` transaction (the INSERT branch), add the identical line as the FIRST statement inside the transaction callback.

(The withdraw branch at the top of `saveSegmentEdit` — `editedContent === originalContent` — is deliberately untouched: withdrawing never resurrects an acceptance.)

- [ ] **Step 3.4: Run — expect PASS**

Run: `npx vitest run server/__tests__/acceptanceService.test.js server/__tests__/segmentEditorService.test.js`
Expected: PASS (both files — the second proves no regression in the save path)

- [ ] **Step 3.5: Commit**

```bash
git add server/services/segmentEditorService.js server/__tests__/acceptanceService.test.js
git commit -m "feat(item20b): revoke authz + supersede-on-edit + drift-lapse + applied-stamp"
```

---

### Task 4: Review-status sidecar + .gitattributes

**Files:**
- Modify: `.gitattributes`
- Test: `server/__tests__/acceptanceService.test.js` (append a describe)

**Interfaces:**
- Consumes: Task 2's `writeReviewStatusSidecar` / `sidecarPathFor` (implemented in Task 2's file; this task proves the derived-map contract).
- Produces: sidecar JSON `{generated, book, chapter: "<string>", module, segments: {<segId>: {status, by?, at?}}}` — PR2's corpus reader consumes this exact shape.

- [ ] **Step 4.1: Write the failing test** — append to `server/__tests__/acceptanceService.test.js`:

```js
describe('writeReviewStatusSidecar (spec §8)', () => {
  const FAITHFUL_DIR = () => join(booksDir, BOOK, '03-faithful-translation', 'ch01');

  function writeFaithful(entries) {
    mkdirSync(FAITHFUL_DIR(), { recursive: true });
    writeFileSync(
      join(FAITHFUL_DIR(), `${MODULE}-segments.is.md`),
      entries.map(([segId, text]) => `<!-- SEG:${segId} -->\n${text}`).join('\n\n'),
      'utf-8'
    );
  }

  it('derives the full per-segment map with all three statuses, file key order', () => {
    writeFaithful([
      ['m00001:para:fs-id001', 'Breytt og birt.'],
      ['m00001:para:fs-id002', 'Önnur efnisgrein.'],
      ['m00001:para:fs-id003', 'Carryover texti.'],
    ]);
    // fs-id001: approved+applied edit
    db.prepare(
      `INSERT INTO segment_edits
         (book, chapter, module_id, segment_id, original_content, edited_content,
          editor_id, editor_username, status, reviewed_at, applied_at)
       VALUES (?, 1, ?, 'm00001:para:fs-id001', 'x', 'Breytt og birt.',
               'u2', 'editor2', 'approved', '2026-07-19 10:00:00', '2026-07-19 10:05:00')`
    ).run(BOOK, MODULE);
    // fs-id002: active acceptance
    accept('m00001:para:fs-id002', 'Önnur efnisgrein.');

    const outPath = acceptance.writeReviewStatusSidecar(BOOK, 1, MODULE);
    expect(outPath).toBe(acceptance.sidecarPathFor(BOOK, 1, MODULE));
    const sidecar = JSON.parse(require('fs').readFileSync(outPath, 'utf-8'));

    expect(sidecar.book).toBe(BOOK);
    expect(sidecar.chapter).toBe('1');
    expect(sidecar.module).toBe(MODULE);
    expect(sidecar.generated).toBeTruthy();
    // Deterministic key order = file segment order
    expect(Object.keys(sidecar.segments)).toEqual([
      'm00001:para:fs-id001',
      'm00001:para:fs-id002',
      'm00001:para:fs-id003',
    ]);
    expect(sidecar.segments['m00001:para:fs-id001']).toEqual({
      status: 'edited', by: 'editor2', at: '2026-07-19 10:00:00',
    });
    expect(sidecar.segments['m00001:para:fs-id002']).toMatchObject({
      status: 'accepted', by: 'editor1',
    });
    expect(sidecar.segments['m00001:para:fs-id003']).toEqual({ status: 'carryover' });
  });

  it('an active acceptance outranks an older applied edit on the same segment (restore edge)', () => {
    writeFaithful([['m00001:para:fs-id001', 'Fyrsta efnisgrein.']]);
    db.prepare(
      `INSERT INTO segment_edits
         (book, chapter, module_id, segment_id, original_content, edited_content,
          editor_id, editor_username, status, reviewed_at, applied_at)
       VALUES (?, 1, ?, 'm00001:para:fs-id001', 'x', 'Gömul breyting.',
               'u2', 'editor2', 'approved', '2026-07-01 10:00:00', '2026-07-01 10:05:00')`
    ).run(BOOK, MODULE);
    accept('m00001:para:fs-id001', 'Fyrsta efnisgrein.');
    const sidecar = JSON.parse(
      require('fs').readFileSync(
        acceptance.writeReviewStatusSidecar(BOOK, 1, MODULE),
        'utf-8'
      )
    );
    expect(sidecar.segments['m00001:para:fs-id001'].status).toBe('accepted');
  });

  it('throws when no faithful file exists', () => {
    require('fs').rmSync(FAITHFUL_DIR(), { recursive: true, force: true });
    expect(() => acceptance.writeReviewStatusSidecar(BOOK, 1, MODULE)).toThrow(
      'Faithful file not found'
    );
  });
});
```

**Note for the implementer:** this describe writes into `03-faithful-translation/ch01` inside the test's temp `booksDir` — add `rmSync(join(booksDir, BOOK, '03-faithful-translation'), { recursive: true, force: true })` to the shared `beforeEach` so describes stay isolated, and extend the file's top fs import to `{ mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, unlinkSync, rmSync }` (this describe uses `readFileSync`/`rmSync` — do NOT re-require fs inline).

- [ ] **Step 4.2: Run — expect PASS or fix**

Run: `npx vitest run server/__tests__/acceptanceService.test.js`
Expected: PASS (Task 2 shipped the implementation; if a mismatch surfaces, fix `writeReviewStatusSidecar` — the TEST is the contract, taken verbatim from spec §8)

- [ ] **Step 4.3: Add the merge driver line**

In `.gitattributes`, append after the `books/*/residue-report.*.json merge=ours` line:

```
# books/<book>/03-faithful-translation/<ch>/<module>-review-status.json is the
# derived per-module review-status sidecar (item 20b): regenerated from DB
# state on every apply/restore, committed by both the prod git-backup cron and
# dev — same class as the manifests above, keep the current side.
books/*/03-faithful-translation/*/*-review-status.json merge=ours
```

- [ ] **Step 4.4: Commit**

```bash
git add .gitattributes server/__tests__/acceptanceService.test.js
git commit -m "feat(item20b): review-status sidecar contract tests + merge=ours for the derived sidecar"
```

---

### Task 5: Apply integration — gate widening, stamp/lapse in-txn, sidecar, apply-status

**Files:**
- Modify: `server/services/segmentEditorService.js` (`applyApprovedEdits`, `getApplyStatus`)
- Test: `server/__tests__/acceptanceApply.test.js` (create)

**Interfaces:**
- Consumes: Task 2/3 helpers (`lapseDrifted`, `stampApplied`, `writeReviewStatusSidecar` — all take the apply's `conn` where inside the transaction).
- Produces:
  - `applyApprovedEdits(...)` result gains `acceptedCount` (acceptances newly stamped) and `lapsedAcceptances` (drift-lapsed during this apply); succeeds for accept-only modules.
  - `getApplyStatus(book, moduleId, chapter)` gains `unapplied_acceptances` and `applied_acceptances`; `can_rebuild` also true for acceptance-only modules whose faithful file vanished.
  - Error strings unchanged (Global Constraints).

- [ ] **Step 5.1: Write the failing tests**

Create `server/__tests__/acceptanceApply.test.js`:

```js
/**
 * Apply-path integration for MT acceptances (item 20b, spec §8) — the
 * previously-IMPOSSIBLE path: an accept-only module applies, writes the
 * faithful file + sidecar, stamps acceptances, and fires the post-apply
 * hooks. Plus mixed modules, the unchanged both-empty gate, and
 * getApplyStatus widening.
 *
 * Hook assertions are behavioral at the service seam: tmService/
 * concordanceService are called via module-object property lookup, so
 * vi.spyOn intercepts. advanceChapterStatus is destructured at import time
 * in segmentEditorService, so the spy seam is one level down —
 * pipelineStatusService.transitionStage (called via property lookup from
 * pipelineService).
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { createRequire } from 'module';
import {
  mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync,
} from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

const require = createRequire(import.meta.url);
process.env.SESSIONS_DB_PATH = join(tmpdir(), `acc-apply-${process.pid}.db`);

const Database = require('better-sqlite3');
const service = require('../services/segmentEditorService');
const acceptance = require('../services/acceptanceService');
const segmentParser = require('../services/segmentParser');
const tmService = require('../services/tmService');
const concordanceService = require('../services/concordanceService');
const pipelineStatusService = require('../services/pipelineStatusService');
const { createSegmentEditsSchema } = require('./helpers/segmentEditsSchema.cjs');
const migration042 = require('../migrations/042-content-versions-track');
const migration043 = require('../migrations/043-segment-acceptances');

const BOOK = 'accapplybook';
const MODULE = 'm00001';
const originalBooksDir = segmentParser.BOOKS_DIR;

let db;
let tmpDir;
let booksDir;

beforeAll(() => {
  // Build the temp FILE DB's schema too: services this suite does NOT inject
  // a test DB into (activityLog inside restoreVersion, concordance) lazily
  // open SESSIONS_DB_PATH — give them real tables (locRestoreRoutes pattern).
  const { runAllMigrations } = require('../services/migrationRunner');
  runAllMigrations();

  db = new Database(':memory:');
  db.pragma('journal_mode = WAL');
  createSegmentEditsSchema(db);
  // content_versions in its production (042) shape — apply snapshots into it
  db.exec(`
    CREATE TABLE content_versions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      book TEXT NOT NULL, chapter INTEGER NOT NULL,
      module_id TEXT NOT NULL, segment_id TEXT NOT NULL,
      content TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1,
      applied_by TEXT, applied_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(book, module_id, segment_id, version)
    );
  `);
  migration042.up(db);
  migration043.up(db);
  service._setTestDb(db);
  acceptance._setTestDb(db);

  tmpDir = mkdtempSync(join(tmpdir(), 'acc-apply-'));
  booksDir = join(tmpDir, 'books');
  const en = join(booksDir, BOOK, '02-for-mt', 'ch01');
  const mt = join(booksDir, BOOK, '02-mt-output', 'ch01');
  mkdirSync(en, { recursive: true });
  mkdirSync(mt, { recursive: true });
  writeFileSync(
    join(en, `${MODULE}-segments.en.md`),
    [
      '<!-- SEG:m00001:para:fs-id001 -->', 'Paragraph one.', '',
      '<!-- SEG:m00001:para:fs-id002 -->', 'Paragraph two.', '',
      '<!-- SEG:m00001:title:fs-id003 -->', 'Chapter Title',
    ].join('\n'),
    'utf-8'
  );
  writeFileSync(
    join(mt, `${MODULE}-segments.is.md`),
    [
      '<!-- SEG:m00001:para:fs-id001 -->', 'Fyrsta efnisgrein.', '',
      '<!-- SEG:m00001:para:fs-id002 -->', 'Önnur efnisgrein.', '',
      '<!-- SEG:m00001:title:fs-id003 -->', 'Titill kafla',
    ].join('\n'),
    'utf-8'
  );
  service._setTestBooksDir(booksDir);
  segmentParser._setTestBooksDir(booksDir);
});

afterAll(() => {
  db.close();
  service._setTestDb(null);
  acceptance._setTestDb(null);
  service._setTestBooksDir(originalBooksDir);
  segmentParser._setTestBooksDir(originalBooksDir);
  rmSync(tmpDir, { recursive: true, force: true });
});

beforeEach(() => {
  db.exec('DELETE FROM segment_edits');
  db.exec('DELETE FROM segment_acceptances');
  db.exec('DELETE FROM content_versions');
  rmSync(join(booksDir, BOOK, '03-faithful-translation'), { recursive: true, force: true });
  vi.restoreAllMocks();
});

function accept(segmentId, content) {
  return acceptance.acceptSegment({
    book: BOOK, chapter: 1, moduleId: MODULE,
    segmentId, acceptedContent: content,
    userId: 'user-1', username: 'editor1',
  });
}

function saveAndApprove(segmentId, editedContent) {
  const { id } = service.saveSegmentEdit({
    book: BOOK, chapter: 1, moduleId: MODULE, segmentId,
    originalContent: 'original', editedContent,
    editorId: 'editor-1', editorUsername: 'editor1',
  });
  service.approveEdit(id, 'reviewer-1', 'reviewer1');
  return id;
}

describe('accept-only apply (the previously-impossible path)', () => {
  it('applies with zero edits: writes the faithful file, stamps acceptances, writes the sidecar', () => {
    accept('m00001:para:fs-id001', 'Fyrsta efnisgrein.');
    accept('m00001:para:fs-id002', 'Önnur efnisgrein.');

    const transitionSpy = vi
      .spyOn(pipelineStatusService, 'transitionStage')
      .mockImplementation(() => {});
    const tmSpy = vi.spyOn(tmService, 'scheduleTmRegen').mockImplementation(() => {});
    const concSpy = vi.spyOn(concordanceService, 'indexModule').mockImplementation(() => {});

    const result = service.applyApprovedEdits(BOOK, 1, MODULE);
    expect(result.appliedCount).toBe(0);
    expect(result.acceptedCount).toBe(2);
    expect(existsSync(result.savedPath)).toBe(true);

    // File content = untouched MT baseline
    const segs = segmentParser.parseSegments(readFileSync(result.savedPath, 'utf-8'));
    expect(segs.find((s) => s.segmentId === 'm00001:para:fs-id001').content).toBe(
      'Fyrsta efnisgrein.'
    );

    // Acceptances stamped
    const stamped = db
      .prepare(
        `SELECT COUNT(*) AS n FROM segment_acceptances
         WHERE status = 'active' AND applied_at IS NOT NULL`
      )
      .get().n;
    expect(stamped).toBe(2);

    // Sidecar: accepted ×2 + carryover ×1, file key order
    const sidecar = JSON.parse(
      readFileSync(acceptance.sidecarPathFor(BOOK, 1, MODULE), 'utf-8')
    );
    expect(Object.keys(sidecar.segments)).toEqual([
      'm00001:para:fs-id001', 'm00001:para:fs-id002', 'm00001:title:fs-id003',
    ]);
    expect(sidecar.segments['m00001:para:fs-id001'].status).toBe('accepted');
    expect(sidecar.segments['m00001:title:fs-id003'].status).toBe('carryover');

    // Post-apply hooks fired (behavioral: the seams were invoked)
    expect(transitionSpy).toHaveBeenCalledWith(
      BOOK, 1, 'linguisticReview', 'complete', null, null
    );
    expect(tmSpy).toHaveBeenCalledWith(BOOK);
    expect(concSpy).toHaveBeenCalledWith(BOOK, 1, MODULE);
  });

  it('mixed module: edit overlays its segment, acceptance stamps, sidecar mixes statuses', () => {
    saveAndApprove('m00001:para:fs-id001', 'Yfirfarin efnisgrein.');
    accept('m00001:para:fs-id002', 'Önnur efnisgrein.');
    vi.spyOn(pipelineStatusService, 'transitionStage').mockImplementation(() => {});

    const result = service.applyApprovedEdits(BOOK, 1, MODULE);
    expect(result.appliedCount).toBe(1);
    expect(result.acceptedCount).toBe(1);

    const segs = segmentParser.parseSegments(readFileSync(result.savedPath, 'utf-8'));
    expect(segs.find((s) => s.segmentId === 'm00001:para:fs-id001').content).toBe(
      'Yfirfarin efnisgrein.'
    );
    const sidecar = JSON.parse(
      readFileSync(acceptance.sidecarPathFor(BOOK, 1, MODULE), 'utf-8')
    );
    expect(sidecar.segments['m00001:para:fs-id001'].status).toBe('edited');
    expect(sidecar.segments['m00001:para:fs-id002'].status).toBe('accepted');
  });

  it('gate still throws verbatim with neither edits nor acceptances', () => {
    expect(() => service.applyApprovedEdits(BOOK, 1, MODULE)).toThrow(
      'No approved edits to apply'
    );
  });

  it('all-already-applied still throws verbatim (acceptance-only module, second apply)', () => {
    accept('m00001:para:fs-id001', 'Fyrsta efnisgrein.');
    vi.spyOn(pipelineStatusService, 'transitionStage').mockImplementation(() => {});
    service.applyApprovedEdits(BOOK, 1, MODULE);
    expect(() => service.applyApprovedEdits(BOOK, 1, MODULE)).toThrow(
      'All approved edits have already been applied'
    );
  });

  it('acceptance-only self-heal: file deleted → re-apply rebuilds and restamps', () => {
    accept('m00001:para:fs-id001', 'Fyrsta efnisgrein.');
    vi.spyOn(pipelineStatusService, 'transitionStage').mockImplementation(() => {});
    const first = service.applyApprovedEdits(BOOK, 1, MODULE);
    rmSync(first.savedPath);
    const second = service.applyApprovedEdits(BOOK, 1, MODULE);
    expect(existsSync(second.savedPath)).toBe(true);
    expect(second.acceptedCount).toBe(1);
  });
});

describe('getApplyStatus widening', () => {
  it('reports unapplied/applied acceptance counts', () => {
    accept('m00001:para:fs-id001', 'Fyrsta efnisgrein.');
    let status = service.getApplyStatus(BOOK, MODULE, 1);
    expect(status.unapplied_acceptances).toBe(1);
    expect(status.applied_acceptances).toBe(0);
    vi.spyOn(pipelineStatusService, 'transitionStage').mockImplementation(() => {});
    service.applyApprovedEdits(BOOK, 1, MODULE);
    status = service.getApplyStatus(BOOK, MODULE, 1);
    expect(status.unapplied_acceptances).toBe(0);
    expect(status.applied_acceptances).toBe(1);
  });

  it('can_rebuild covers an acceptance-only module whose faithful file vanished', () => {
    accept('m00001:para:fs-id001', 'Fyrsta efnisgrein.');
    vi.spyOn(pipelineStatusService, 'transitionStage').mockImplementation(() => {});
    const result = service.applyApprovedEdits(BOOK, 1, MODULE);
    rmSync(result.savedPath);
    const status = service.getApplyStatus(BOOK, MODULE, 1);
    expect(status.faithful_exists).toBe(false);
    expect(status.can_rebuild).toBe(true);
  });
});
```

- [ ] **Step 5.2: Run — expect FAIL**

Run: `npx vitest run server/__tests__/acceptanceApply.test.js`
Expected: FAIL — accept-only apply throws `'No approved edits to apply for this module'`; `getApplyStatus` lacks the new fields

- [ ] **Step 5.3: Implement in `segmentEditorService.js`**

All edits inside `applyApprovedEdits` / `getApplyStatus`:

1. Right after the `approvedEdits` pre-check query (the `SELECT id … applied_at IS NULL` `.all()`), add:

```js
  const unappliedAcceptances = conn
    .prepare(
      `SELECT COUNT(*) AS n FROM segment_acceptances
       WHERE book = ? AND module_id = ? AND status = 'active' AND applied_at IS NULL`
    )
    .get(book, moduleId).n;
```

2. Change `if (approvedEdits.length === 0) {` → `if (approvedEdits.length === 0 && unappliedAcceptances === 0) {`

3. Inside that branch, replace

```js
    if (anyApproved.count === 0) {
      throw new Error('No approved edits to apply for this module');
    }
```

with

```js
    const anyAcceptances = conn
      .prepare(
        `SELECT COUNT(*) AS count FROM segment_acceptances
         WHERE book = ? AND module_id = ? AND status = 'active'`
      )
      .get(book, moduleId);

    if (anyApproved.count === 0 && anyAcceptances.count === 0) {
      throw new Error('No approved edits to apply for this module');
    }
```

4. In the faithful-file-missing self-heal branch, directly after the existing `UPDATE segment_edits SET applied_at = NULL …` `.run(book, moduleId)`, add:

```js
      // item 20b: the acceptance mirror of the reset — an acceptance-only
      // module whose faithful file vanished must also be rebuildable.
      conn
        .prepare(
          `UPDATE segment_acceptances SET applied_at = NULL
           WHERE book = ? AND module_id = ? AND status = 'active' AND applied_at IS NOT NULL`
        )
        .run(book, moduleId);
```

5. Inside the transaction, replace

```js
    if (unapplied.length === 0) {
      throw new Error('Edits were applied by a concurrent request');
    }
```

with

```js
    const unappliedAccInTxn = conn
      .prepare(
        `SELECT COUNT(*) AS n FROM segment_acceptances
         WHERE book = ? AND module_id = ? AND status = 'active' AND applied_at IS NULL`
      )
      .get(book, moduleId).n;
    if (unapplied.length === 0 && unappliedAccInTxn === 0) {
      throw new Error('Edits were applied by a concurrent request');
    }
```

6. After step 6 of the transaction (the `markApplied`/`markSuperseded` loops), before the `return {…}`, add:

```js
    // 7. Acceptance lifecycle (item 20b, spec §7): lapse attestations whose
    // bytes this apply just changed, then stamp the surviving active ones as
    // published. Same connection, same transaction — atomic with the file
    // bookkeeping. `segments` is the exact array written to disk in step 5.
    const lapsedAcceptances = acceptanceService.lapseDrifted(book, moduleId, segments, conn);
    const acceptedCount = acceptanceService.stampApplied(book, moduleId, conn);
```

and extend the transaction's return object with `acceptedCount, lapsedAcceptances`:

```js
    return {
      appliedCount,
      supersededCount: supersededIds.length,
      totalEditsMarked: winnerIds.length + supersededIds.length,
      acceptedCount,
      lapsedAcceptances,
      savedPath,
    };
```

7. After `const result = applyTransaction.immediate();`, before the status-advance block, add:

```js
  // Derived review-status sidecar (item 20b) — best-effort; it regenerates
  // on the next apply/restore if this write fails.
  try {
    acceptanceService.writeReviewStatusSidecar(book, chapter, moduleId, conn);
  } catch (err) {
    log.error({ err, book, moduleId }, 'Review-status sidecar write failed');
  }
```

8. In `getApplyStatus`, after the `counts` query, add:

```js
  const accCounts = conn
    .prepare(
      `SELECT
         COUNT(CASE WHEN applied_at IS NULL THEN 1 END) AS unapplied_acceptances,
         COUNT(CASE WHEN applied_at IS NOT NULL THEN 1 END) AS applied_acceptances
       FROM segment_acceptances
       WHERE book = ? AND module_id = ? AND status = 'active'`
    )
    .get(book, moduleId);
```

change the `canRebuild` line to:

```js
    canRebuild =
      !faithfulExists &&
      counts.unapplied_count === 0 &&
      accCounts.unapplied_acceptances === 0 &&
      (counts.applied_count > 0 || accCounts.applied_acceptances > 0);
```

and the return to:

```js
  return { ...counts, ...accCounts, faithful_exists: faithfulExists, can_rebuild: canRebuild };
```

- [ ] **Step 5.4: Run — expect PASS (plus no regressions)**

Run: `npx vitest run server/__tests__/acceptanceApply.test.js server/__tests__/segmentEditorService.test.js server/__tests__/applyStatusRebuild.test.js server/__tests__/applyAndRenderGuard.test.js`
Expected: PASS. If `applyStatusRebuild.test.js` fails on the new fields/`can_rebuild` logic, its expectations may need the two new keys added — extend that test rather than weakening the new behavior.

- [ ] **Step 5.5: Commit**

```bash
git add server/services/segmentEditorService.js server/__tests__/acceptanceApply.test.js
git commit -m "feat(item20b): apply gate widening + in-txn acceptance stamp/lapse + sidecar + apply-status"
```

---

### Task 6: Faithful-restore hook — drift-lapse + sidecar

**Files:**
- Modify: `server/services/contentVersionService.js` (imports + `restoreVersion` post-write hooks)
- Test: `server/__tests__/acceptanceApply.test.js` (append a describe)

**Interfaces:**
- Consumes: `acceptanceService.lapseDrifted(book, moduleId, restoredSegments)` / `writeReviewStatusSidecar(book, chapter, moduleId)` (own-connection defaults are correct here — restore holds no open transaction).
- Dependency direction stays acyclic: `contentVersionService → acceptanceService → segmentParser`.

- [ ] **Step 6.1: Write the failing test** — append to `server/__tests__/acceptanceApply.test.js`:

```js
describe('faithful restore lapses drifted acceptances (spec §7)', () => {
  it('restoreVersion supersedes acceptances whose bytes it rewrote, and refreshes the sidecar', () => {
    const contentVersionService = require('../services/contentVersionService');
    contentVersionService._setTestDb(db);
    try {
      vi.spyOn(pipelineStatusService, 'transitionStage').mockImplementation(() => {});
      // Round 1: an edit publishes v-baseline snapshot
      saveAndApprove('m00001:para:fs-id001', 'Útgáfa eitt.');
      service.applyApprovedEdits(BOOK, 1, MODULE);
      // Round 2: edit again → apply snapshots "Útgáfa eitt." as version 2
      saveAndApprove('m00001:para:fs-id001', 'Útgáfa tvö.');
      service.applyApprovedEdits(BOOK, 1, MODULE);
      // Accept an untouched sibling segment at its current bytes
      accept('m00001:para:fs-id002', 'Önnur efnisgrein.');
      // Accept-record for the edited segment's CURRENT bytes via direct
      // insert (UI never offers this; simulates the restore-drift edge)
      db.prepare(
        `INSERT INTO segment_acceptances
           (book, chapter, module_id, segment_id, accepted_content, accepted_by, accepted_by_username)
         VALUES (?, 1, ?, 'm00001:para:fs-id001', 'Útgáfa tvö.', 'u1', 'editor1')`
      ).run(BOOK, MODULE);

      // Restore version 2 ("Útgáfa eitt.") → fs-id001's acceptance drifts,
      // fs-id002's survives (same bytes restored)
      contentVersionService.restoreVersion(BOOK, 1, MODULE, 2, { username: 'he1' });

      const rows = db
        .prepare(
          `SELECT segment_id, status, superseded_reason FROM segment_acceptances ORDER BY id`
        )
        .all();
      const drifted = rows.find((r) => r.segment_id === 'm00001:para:fs-id001');
      const kept = rows.find((r) => r.segment_id === 'm00001:para:fs-id002');
      expect(drifted).toMatchObject({ status: 'superseded', superseded_reason: 'content-drift' });
      expect(kept.status).toBe('active');

      const sidecar = JSON.parse(
        readFileSync(acceptance.sidecarPathFor(BOOK, 1, MODULE), 'utf-8')
      );
      expect(sidecar.segments['m00001:para:fs-id002'].status).toBe('accepted');
    } finally {
      contentVersionService._setTestDb(null);
    }
  });
});
```

- [ ] **Step 6.2: Run — expect FAIL** (`restoreVersion` doesn't lapse; the fs-id001 row stays `active`)

Run: `npx vitest run server/__tests__/acceptanceApply.test.js`

- [ ] **Step 6.3: Implement the hook**

In `server/services/contentVersionService.js`:

1. Add to the imports (after `const concordanceService = require('./concordanceService');`):

```js
const acceptanceService = require('./acceptanceService');
```

2. In `restoreVersion`, inside the `if (cfg.runPostWriteHooks) {` block, after the concordance try/catch, add:

```js
    // item 20b: a restore rewrites faithful bytes without touching
    // segment_acceptances — lapse any attestation whose bytes just changed
    // (spec §7) and refresh the derived sidecar. Best-effort, same posture
    // as the TM/concordance hooks above.
    try {
      acceptanceService.lapseDrifted(book, moduleId, restoredSegments);
      acceptanceService.writeReviewStatusSidecar(book, chapter, moduleId);
    } catch (err) {
      log.error({ err, book, moduleId }, 'Acceptance drift-lapse/sidecar after restore failed');
    }
```

(`restoredSegments` is the exact `[{segmentId, content}]` array `cfg.write` just wrote — already in scope.)

- [ ] **Step 6.4: Run — expect PASS**

Run: `npx vitest run server/__tests__/acceptanceApply.test.js`
Expected: PASS. Also run `npx vitest run server/__tests__/` once here — `contentVersionService` has its own suite; confirm no regression.

- [ ] **Step 6.5: Commit**

```bash
git add server/services/contentVersionService.js server/__tests__/acceptanceApply.test.js
git commit -m "feat(item20b): faithful restore lapses drifted acceptances + regenerates sidecar"
```

---

### Task 7: Routes — accept, revoke, module-GET acceptances

**Files:**
- Modify: `server/routes/segment-editor.js`
- Test: `server/__tests__/acceptanceRoutes.test.js` (create)

**Interfaces:**
- Produces:
  - `POST /api/segment-editor/:book/:chapter/:moduleId/accept` — body `{segmentId, acceptedContent}`; chain `requireAuth, validateBookChapter, requireBookAccess(), validateModule` (mirror of `/edit`); 409 `{error: 'STALE_CONTENT'|'EDIT_EXISTS', message}`; 400 for missing fields / `NO_TRANSLATION` / >10000 chars; 200 `{success: true, alreadyAccepted, acceptance}`; activity type `segment_accepted` (only on a NEW acceptance).
  - `POST /api/segment-editor/acceptance/:id/revoke` — chain `requireAuth, requireRole(ROLES.EDITOR)`; owner-or-HE enforced in the service; 403 on `FORBIDDEN`, 404 unknown; 200 `{success: true, acceptance}`; activity type `acceptance_revoked`.
  - Module GET response gains `acceptances`: `{ [segmentId]: <active acceptance row> }`.

- [ ] **Step 7.1: Write the failing tests**

Create `server/__tests__/acceptanceRoutes.test.js` (handler-level via `router.stack`, pattern of `locRestoreRoutes.test.js`; gate-INVOKE pins per the item-19 MF2 lesson — prove the gates fire, don't just name-pin them):

```js
/**
 * Acceptance routes (item 20b) — middleware-invoke pins (the gates FIRE,
 * item-19 MF2 lesson) + handler-level status mapping via router.stack
 * extraction, on a real temp DB + mini book fixture.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

const work = mkdtempSync(path.join(tmpdir(), 'acc-routes-'));
process.env.SESSIONS_DB_PATH = path.join(work, 'sessions.db');
process.env.JWT_SECRET = process.env.JWT_SECRET || 'prufa-leyndarmal';

const BOOK = 'efnafraedi-2e'; // must pass VALID_BOOKS + validateBookChapter
const MODULE = 'mACCRT1';

let router;
let acceptLayer;
let acceptHandler;
let revokeLayer;
let revokeHandler;
let moduleGetLayer;
let segmentParser;
let realBooksDir;
let acceptance;

function invoke(h, req) {
  let resolveResult;
  const done = new Promise((resolve) => {
    resolveResult = resolve;
  });
  const res = {
    statusCode: 200,
    status(c) { this.statusCode = c; return this; },
    json(body) { resolveResult({ status: this.statusCode, body }); },
  };
  return Promise.resolve(h(req, res)).then(() => done);
}

beforeAll(() => {
  const { runAllMigrations } = require('../services/migrationRunner');
  runAllMigrations();

  segmentParser = require('../services/segmentParser');
  acceptance = require('../services/acceptanceService');
  realBooksDir = segmentParser.BOOKS_DIR;
  const booksDir = path.join(work, 'books');
  const seg = (id, text) => `<!-- SEG:${MODULE}:para:${id} -->\n${text}\n`;
  mkdirSync(path.join(booksDir, BOOK, '02-for-mt/ch01'), { recursive: true });
  mkdirSync(path.join(booksDir, BOOK, '02-mt-output/ch01'), { recursive: true });
  writeFileSync(
    path.join(booksDir, BOOK, '02-for-mt/ch01', `${MODULE}-segments.en.md`),
    seg('a', 'EN a') + '\n' + seg('b', 'EN b')
  );
  writeFileSync(
    path.join(booksDir, BOOK, '02-mt-output/ch01', `${MODULE}-segments.is.md`),
    seg('a', 'IS a') + '\n' + seg('b', 'IS b')
  );
  segmentParser._setTestBooksDir(booksDir);
  require('../services/segmentEditorService')._setTestBooksDir(booksDir);

  router = require('../routes/segment-editor');
  const find = (p, method) =>
    router.stack.find((l) => l.route && l.route.path === p && l.route.methods[method]);
  acceptLayer = find('/:book/:chapter/:moduleId/accept', 'post');
  acceptHandler = acceptLayer.route.stack.at(-1).handle;
  revokeLayer = find('/acceptance/:id/revoke', 'post');
  revokeHandler = revokeLayer.route.stack.at(-1).handle;
  moduleGetLayer = find('/:book/:chapter/:moduleId', 'get');
});

afterAll(() => {
  segmentParser._setTestBooksDir(realBooksDir);
  require('../services/segmentEditorService')._setTestBooksDir(realBooksDir);
  rmSync(work, { recursive: true, force: true });
});

beforeEach(() => {
  const Database = require('better-sqlite3');
  const db = new Database(process.env.SESSIONS_DB_PATH);
  db.exec('DELETE FROM segment_acceptances; DELETE FROM segment_edits;');
  db.close();
});

const EDITOR = { id: 'u-ed1', username: 'editor1', role: 'editor', books: [] };

function acceptReq(overrides = {}) {
  return {
    params: { book: BOOK, chapter: '1', moduleId: MODULE },
    chapterNum: 1,
    user: EDITOR,
    body: { segmentId: `${MODULE}:para:a`, acceptedContent: 'IS a' },
    ...overrides,
  };
}

describe('route registration + gate pins', () => {
  it('accept mounts the edit-save chain: requireAuth, validateBookChapter, requireBookAccess, validateModule', () => {
    expect(acceptLayer).toBeTruthy();
    expect(acceptLayer.route.stack).toHaveLength(5);
  });

  it('accept requireBookAccess gate FIRES: viewer → 403', async () => {
    const gate = acceptLayer.route.stack[2].handle;
    const out = await invoke(gate, {
      params: { book: BOOK, chapter: '1', moduleId: MODULE },
      user: { id: 'v1', username: 'v', role: 'viewer' },
    });
    expect(out.status).toBe(403);
  });

  it('revoke requireRole(EDITOR) gate FIRES: viewer → 403', async () => {
    expect(revokeLayer.route.stack).toHaveLength(3);
    const gate = revokeLayer.route.stack[1].handle;
    const out = await invoke(gate, {
      user: { id: 'v1', username: 'v', role: 'viewer' },
    });
    expect(out.status).toBe(403);
  });
});

describe('accept handler mapping', () => {
  it('happy path 200 with acceptance row', async () => {
    const out = await invoke(acceptHandler, acceptReq());
    expect(out.status).toBe(200);
    expect(out.body.success).toBe(true);
    expect(out.body.alreadyAccepted).toBe(false);
    expect(out.body.acceptance.segment_id).toBe(`${MODULE}:para:a`);
  });

  it('repeat → 200 alreadyAccepted', async () => {
    await invoke(acceptHandler, acceptReq());
    const out = await invoke(acceptHandler, acceptReq());
    expect(out.status).toBe(200);
    expect(out.body.alreadyAccepted).toBe(true);
  });

  it('byte mismatch → 409 STALE_CONTENT', async () => {
    const out = await invoke(
      acceptHandler,
      acceptReq({ body: { segmentId: `${MODULE}:para:a`, acceptedContent: 'stale' } })
    );
    expect(out.status).toBe(409);
    expect(out.body.error).toBe('STALE_CONTENT');
  });

  it('active edit → 409 EDIT_EXISTS', async () => {
    require('../services/segmentEditorService').saveSegmentEdit({
      book: BOOK, chapter: 1, moduleId: MODULE,
      segmentId: `${MODULE}:para:a`,
      originalContent: 'IS a', editedContent: 'IS a breytt',
      editorId: 'u-ed2', editorUsername: 'editor2',
    });
    const out = await invoke(acceptHandler, acceptReq());
    expect(out.status).toBe(409);
    expect(out.body.error).toBe('EDIT_EXISTS');
  });

  it('missing segmentId / missing acceptedContent → 400', async () => {
    expect((await invoke(acceptHandler, acceptReq({ body: {} }))).status).toBe(400);
    expect(
      (await invoke(acceptHandler, acceptReq({ body: { segmentId: 'x' } }))).status
    ).toBe(400);
  });

  it('unknown segment → 404', async () => {
    const out = await invoke(
      acceptHandler,
      acceptReq({ body: { segmentId: `${MODULE}:para:zz`, acceptedContent: 'x' } })
    );
    expect(out.status).toBe(404);
  });
});

describe('revoke handler mapping', () => {
  async function makeAcceptance() {
    const out = await invoke(acceptHandler, acceptReq());
    return out.body.acceptance.id;
  }

  it('owner revokes → 200', async () => {
    const id = await makeAcceptance();
    const out = await invoke(revokeHandler, { params: { id: String(id) }, user: EDITOR });
    expect(out.status).toBe(200);
    expect(out.body.acceptance.status).toBe('superseded');
  });

  it('other editor → 403; book-scoped HE → 200', async () => {
    let id = await makeAcceptance();
    const other = { id: 'u-ed9', username: 'editor9', role: 'editor', books: [] };
    expect(
      (await invoke(revokeHandler, { params: { id: String(id) }, user: other })).status
    ).toBe(403);
    const he = { id: 'u-he1', username: 'he1', role: 'head-editor', books: [BOOK] };
    expect(
      (await invoke(revokeHandler, { params: { id: String(id) }, user: he })).status
    ).toBe(200);
  });

  it('unknown id → 404', async () => {
    const out = await invoke(revokeHandler, { params: { id: '99999' }, user: EDITOR });
    expect(out.status).toBe(404);
  });
});

describe('module GET exposes acceptances', () => {
  it('returns acceptances keyed by segmentId', async () => {
    await invoke(acceptHandler, acceptReq());
    const getHandler = moduleGetLayer.route.stack.at(-1).handle;
    const out = await invoke(getHandler, {
      params: { book: BOOK, chapter: '1', moduleId: MODULE },
      chapterNum: 1,
      user: EDITOR,
    });
    expect(out.status).toBe(200);
    expect(out.body.acceptances[`${MODULE}:para:a`]).toMatchObject({
      status: 'active',
      accepted_by_username: 'editor1',
    });
    expect(out.body.acceptances[`${MODULE}:para:b`]).toBeUndefined();
  });
});
```

- [ ] **Step 7.2: Run — expect FAIL** (routes not found: `acceptLayer` undefined)

Run: `npx vitest run server/__tests__/acceptanceRoutes.test.js`

- [ ] **Step 7.3: Implement the routes**

In `server/routes/segment-editor.js`:

1. Add to the service requires (after `const segmentEditor = require('../services/segmentEditorService');`):

```js
const acceptanceService = require('../services/acceptanceService');
```

2. In the module GET handler (`GET /:book/:chapter/:moduleId`), after the `stats` line and before `otherPendingSegments`, add:

```js
      // Active MT acceptances keyed by segmentId (item 20b)
      const acceptances = {};
      for (const a of acceptanceService.getModuleAcceptances(
        req.params.book,
        req.params.moduleId
      )) {
        acceptances[a.segment_id] = a;
      }
```

and add `acceptances,` to the `res.json({ ...data, edits: editsBySegment, … })` object.

3. Directly after the `POST /:book/:chapter/:moduleId/edit` route, add:

```js
/**
 * POST /:book/:chapter/:moduleId/accept
 * Record a per-segment MT acceptance ("Staðfesta vélþýðingu", item 20b).
 * Chain mirrors the edit save. acceptedContent must equal the current
 * baseline byte-for-byte (409 STALE_CONTENT — doubles as the saveRetry
 * replay guard); an active edit wins (409 EDIT_EXISTS).
 */
router.post(
  '/:book/:chapter/:moduleId/accept',
  requireAuth,
  validateBookChapter,
  requireBookAccess(),
  validateModule,
  (req, res) => {
    const { segmentId, acceptedContent } = req.body || {};
    if (!segmentId) {
      return res.status(400).json({ error: 'segmentId is required' });
    }
    if (typeof acceptedContent !== 'string' || acceptedContent === '') {
      return res.status(400).json({ error: 'acceptedContent is required' });
    }
    if (acceptedContent.length > 10000) {
      return res.status(400).json({ error: 'Content too long (max 10,000 characters)' });
    }

    try {
      const result = acceptanceService.acceptSegment({
        book: req.params.book,
        chapter: req.chapterNum,
        moduleId: req.params.moduleId,
        segmentId,
        acceptedContent,
        userId: String(req.user.id),
        username: req.user.username,
      });

      if (!result.alreadyAccepted) {
        activityLog.log({
          type: 'segment_accepted',
          userId: String(req.user.id),
          username: req.user.username,
          book: req.params.book,
          chapter: String(req.chapterNum),
          section: req.params.moduleId,
          description: `${req.user.username} staðfesti vélþýðingu á ${req.params.moduleId}:${segmentId}`,
        });
      }

      res.json({ success: true, ...result });
    } catch (err) {
      if (err.code === 'STALE_CONTENT' || err.code === 'EDIT_EXISTS') {
        return res.status(409).json({ error: err.code, message: err.message });
      }
      if (err.code === 'NO_TRANSLATION') {
        return res.status(400).json({ error: err.code, message: err.message });
      }
      if (err.code === 'SEGMENT_NOT_FOUND' || err.message.includes('not found')) {
        return res.status(404).json({ error: err.message });
      }
      log.error({ err }, 'Error accepting segment');
      res.status(500).json({ error: err.message });
    }
  }
);

/**
 * POST /acceptance/:id/revoke
 * Revoke an active acceptance. Route gate is editor-tier; the owner-or-
 * book-scoped-head-editor rule lives in the service (owner-OR-HE cannot be
 * expressed as middleware — same pattern as DELETE /edit/:editId).
 */
router.post('/acceptance/:id/revoke', requireAuth, requireRole(ROLES.EDITOR), (req, res) => {
  try {
    const row = acceptanceService.revokeAcceptance(parseInt(req.params.id, 10), {
      actorId: String(req.user.id),
      actorRole: req.user.role,
      actorBooks: req.user.books || [],
    });
    res.json({ success: true, acceptance: row });
    activityLog.log({
      type: 'acceptance_revoked',
      userId: String(req.user.id),
      username: req.user.username,
      book: row.book,
      chapter: String(row.chapter),
      section: row.module_id,
      description: `${req.user.username} afturkallaði staðfestingu á ${row.module_id}:${row.segment_id}`,
    });
  } catch (err) {
    if (err.code === 'FORBIDDEN') {
      return res.status(403).json({ error: err.message });
    }
    res.status(err.message.includes('not found') ? 404 : 400).json({ error: err.message });
  }
});
```

- [ ] **Step 7.4: Run — expect PASS**

Run: `npx vitest run server/__tests__/acceptanceRoutes.test.js server/__tests__/crossBookAuthz.test.js server/__tests__/startup.test.js`
Expected: PASS (crossBookAuthz + startup prove no route-table regression)

- [ ] **Step 7.5: Commit**

```bash
git add server/routes/segment-editor.js server/__tests__/acceptanceRoutes.test.js
git commit -m "feat(item20b): accept/revoke routes + module GET acceptances, gate-invoke pins"
```

---

### Task 8: Metrics redefinition — reviewed = approved ∪ accepted

**Files:**
- Modify: `server/services/segmentEditorService.js` (`getModuleStats`, `getEditorialProgress`)
- Test: `server/__tests__/acceptanceApply.test.js` (append a describe)

**Interfaces:**
- Produces:
  - `getModuleStats(book, moduleId)` gains `accepted` (count of active acceptances) — the client stats bar reads `s.accepted`.
  - `getEditorialProgress(book)`: per-chapter `approvedSegments` and module-completion now count `DISTINCT(segment with approved edit ∪ segment with active acceptance)`. JSON keys unchanged (dashboard compatibility). **MTA-R1 comms:** numbers RISE on deploy.

- [ ] **Step 8.1: Write the failing tests** — append to `server/__tests__/acceptanceApply.test.js`:

```js
describe('metrics redefinition: reviewed = approved ∪ accepted (spec §8)', () => {
  it('getModuleStats reports accepted count', () => {
    accept('m00001:para:fs-id001', 'Fyrsta efnisgrein.');
    const stats = service.getModuleStats(BOOK, MODULE);
    expect(stats.accepted).toBe(1);
  });

  it('module completes when distinct approved ∪ accepted covers every segment', () => {
    // 3 segments: 1 approved edit + 2 acceptances = complete
    saveAndApprove('m00001:para:fs-id001', 'Yfirfarin.');
    accept('m00001:para:fs-id002', 'Önnur efnisgrein.');
    accept('m00001:title:fs-id003', 'Titill kafla');
    const progress = service.getEditorialProgress(BOOK);
    expect(progress.summary.modulesComplete).toBe(1);
    expect(progress.chapters[1].approvedSegments).toBe(3);
  });

  it('overlap does not double-count: edit + acceptance on the same segment = 1', () => {
    saveAndApprove('m00001:para:fs-id001', 'Yfirfarin.');
    // acceptance on the SAME segment via direct insert (API blocks this
    // while the edit is active; the metric must still be distinct-safe)
    db.prepare(
      `INSERT INTO segment_acceptances
         (book, chapter, module_id, segment_id, accepted_content, accepted_by, accepted_by_username)
       VALUES (?, 1, ?, 'm00001:para:fs-id001', 'Yfirfarin.', 'u1', 'editor1')`
    ).run(BOOK, MODULE);
    const progress = service.getEditorialProgress(BOOK);
    expect(progress.chapters[1].approvedSegments).toBe(1);
    expect(progress.summary.modulesComplete).toBe(0);
  });
});
```

- [ ] **Step 8.2: Run — expect FAIL**

Run: `npx vitest run server/__tests__/acceptanceApply.test.js`
Expected: FAIL — `stats.accepted` undefined; completion/counts miss acceptances

- [ ] **Step 8.3: Implement**

In `server/services/segmentEditorService.js`:

1. `getModuleStats` — change the body to merge an acceptance count:

```js
function getModuleStats(book, moduleId) {
  const conn = getDb();

  const editStats = conn
    .prepare(
      `SELECT
       COUNT(*) as total_edits,
       COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending,
       COUNT(CASE WHEN status = 'approved' THEN 1 END) as approved,
       COUNT(CASE WHEN status = 'rejected' THEN 1 END) as rejected,
       COUNT(CASE WHEN status = 'discuss' THEN 1 END) as discuss,
       COUNT(DISTINCT segment_id) as segments_edited,
       COUNT(DISTINCT editor_id) as editors,
       COUNT(CASE WHEN category = 'terminology' THEN 1 END) as cat_terminology,
       COUNT(CASE WHEN category = 'accuracy' THEN 1 END) as cat_accuracy,
       COUNT(CASE WHEN category = 'readability' THEN 1 END) as cat_readability,
       COUNT(CASE WHEN category = 'style' THEN 1 END) as cat_style,
       COUNT(CASE WHEN category = 'omission' THEN 1 END) as cat_omission
     FROM segment_edits
     WHERE book = ? AND module_id = ?`
    )
    .get(book, moduleId);

  // item 20b: active MT acceptances are the second reviewed-tier signal
  const accepted = conn
    .prepare(
      `SELECT COUNT(*) as n FROM segment_acceptances
       WHERE book = ? AND module_id = ? AND status = 'active'`
    )
    .get(book, moduleId).n;

  return { ...editStats, accepted };
}
```

2. `getEditorialProgress` — two changes:

Replace the `editRows` query with a reviewed-union variant (keep the `edited_segments` edit-only meaning, redefine `approved_segments` as the reviewed union — spec §8 metrics redefinition):

```js
  const editRows = conn
    .prepare(
      `SELECT
        e.chapter,
        e.edited_segments,
        COALESCE(r.reviewed_segments, 0) as approved_segments
      FROM (
        SELECT chapter, COUNT(DISTINCT segment_id) as edited_segments
        FROM segment_edits WHERE book = ? GROUP BY chapter
      ) e
      LEFT JOIN (
        SELECT chapter, COUNT(DISTINCT segment_id) as reviewed_segments FROM (
          SELECT chapter, segment_id FROM segment_edits
           WHERE book = ? AND status = 'approved'
          UNION
          SELECT chapter, segment_id FROM segment_acceptances
           WHERE book = ? AND status = 'active'
        ) GROUP BY chapter
      ) r ON r.chapter = e.chapter`
    )
    .all(book, book, book);
```

**Correction (self-review):** an acceptance-only chapter has no `segment_edits` rows at all, so driving the join from `e` drops it. Use a full union keyed by chapter instead:

```js
  const editRows = conn
    .prepare(
      `SELECT
         chapter,
         SUM(edited) as edited_segments,
         SUM(reviewed) as approved_segments
       FROM (
         SELECT chapter, COUNT(DISTINCT segment_id) as edited, 0 as reviewed
           FROM segment_edits WHERE book = ? GROUP BY chapter
         UNION ALL
         SELECT chapter, 0 as edited, COUNT(DISTINCT segment_id) as reviewed FROM (
           SELECT chapter, segment_id FROM segment_edits
            WHERE book = ? AND status = 'approved'
           UNION
           SELECT chapter, segment_id FROM segment_acceptances
            WHERE book = ? AND status = 'active'
         ) GROUP BY chapter
       )
       GROUP BY chapter`
    )
    .all(book, book, book);
```

Then, for module completion, add ONE new per-module reviewed query right after the `moduleEditMap` loop:

```js
  // item 20b: module completion counts DISTINCT(approved-edit ∪ active-
  // acceptance) segments — reviewed(segment) has two flavors now (spec §8).
  const reviewedByModule = {};
  for (const row of conn
    .prepare(
      `SELECT module_id, COUNT(DISTINCT segment_id) as reviewed FROM (
         SELECT module_id, segment_id FROM segment_edits
          WHERE book = ? AND status = 'approved'
         UNION
         SELECT module_id, segment_id FROM segment_acceptances
          WHERE book = ? AND status = 'active'
       ) GROUP BY module_id`
    )
    .all(book, book)) {
    reviewedByModule[row.module_id] = row.reviewed;
  }
```

and replace the completion check body:

```js
      // Module is "complete" when reviewed (approved ∪ accepted) segments
      // cover the segment count (item 20b redefinition; F18-class comms —
      // numbers RISE at deploy, see register MTA-R1).
      const reviewedCount = reviewedByModule[mod.moduleId] || 0;
      if (segCount > 0 && reviewedCount >= segCount) {
        modulesComplete++;
      }
```

(The old `modEdits`/`approvedRecords` block is fully replaced; `moduleEditMap` stays — `getBookEditsByModule` is still used elsewhere. If lint flags `moduleEditMap` as unused inside this function after the change, delete the map-building lines too.)

- [ ] **Step 8.4: Run — expect PASS + no regression**

Run: `npx vitest run server/__tests__/acceptanceApply.test.js server/__tests__/segmentEditorService.test.js`
Expected: PASS

- [ ] **Step 8.5: Commit**

```bash
git add server/services/segmentEditorService.js server/__tests__/acceptanceApply.test.js
git commit -m "feat(item20b): metrics redefinition — reviewed = approved-edit ∪ active-acceptance"
```

---

### Task 9: Editor UI — button, chip, revoke, filters, stats, keyboard, transport, withdraw-UX

**Files:**
- Modify: `server/public/js/ui-strings.js`
- Modify: `server/views/segment-editor.html`
- Modify: `server/public/js/segment-editor.js`
- Test: `server/__tests__/acceptanceUiPins.test.js` (create)

**Interfaces:**
- Consumes: module GET `acceptances` map, `POST …/accept`, `POST /acceptance/:id/revoke`, `getApplyStatus.unapplied_acceptances`, `stats.accepted` (Tasks 5, 7, 8).
- Produces: `window.acceptSegmentAndAdvance(segmentId)`, `window.revokeAcceptance(acceptanceId)` (used by HTML onclick); Ctrl/Cmd+Shift+Enter accept-and-advance; `UI.acceptance.*` strings.

- [ ] **Step 9.1: Write the failing static-pin tests**

Create `server/__tests__/acceptanceUiPins.test.js`:

```js
/**
 * UI static pins for MT acceptance (item 20b). Pins prove PRESENCE only —
 * behavior is covered by e2e/acceptance.spec.js (campaign lesson: static
 * pins prove presence, not behavior). Strings are raw UTF-8 Icelandic:
 * match FILE BYTES.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const serverDir = join(__dirname, '..');

const clientJs = readFileSync(join(serverDir, 'public', 'js', 'segment-editor.js'), 'utf-8');
const html = readFileSync(join(serverDir, 'views', 'segment-editor.html'), 'utf-8');
const strings = readFileSync(join(serverDir, 'public', 'js', 'ui-strings.js'), 'utf-8');
const gitattributes = readFileSync(join(serverDir, '..', '.gitattributes'), 'utf-8');

describe('acceptance UI pins', () => {
  it('ui-strings carries the acceptance vocabulary (spec §3)', () => {
    expect(strings).toContain('Staðfesta MT');
    expect(strings).toContain("acceptance: {");
  });

  it('client renders accept + revoke and exposes the handlers', () => {
    expect(clientJs).toContain('acceptSegmentAndAdvance');
    expect(clientJs).toContain('window.acceptSegmentAndAdvance');
    expect(clientJs).toContain('window.revokeAcceptance');
    expect(clientJs).toMatch(/\/accept`/); // the POST …/accept URL template
    expect(clientJs).toContain('/acceptance/'); // the revoke URL
    expect(clientJs).toContain('acc:'); // saveRetry queue key prefix
  });

  it('keyboard: Ctrl+Shift+Enter accepts; plain Ctrl+Enter save excludes shiftKey', () => {
    expect(clientJs).toContain('e.shiftKey) {');
    expect(clientJs).toContain('!e.shiftKey');
    expect(clientJs).toContain('acceptAtCursor');
  });

  it('filter facets Staðfest + Óyfirfarnir exist in the HTML', () => {
    expect(html).toContain('<option value="accepted">Staðfest</option>');
    expect(html).toContain('<option value="unhandled">Óyfirfarnir</option>');
  });

  it('accepted chip + row CSS exist', () => {
    expect(html).toContain('.edit-status.accepted');
    expect(html).toContain('.segment-row.accepted-row');
    expect(html).toContain('.segment-row.kbd-cursor');
  });

  it('stats bar renders the accepted chip; progress counts acceptances', () => {
    expect(clientJs).toContain('s.accepted');
    expect(clientJs).toContain('moduleData.acceptances');
  });

  it('apply panel reads unapplied_acceptances', () => {
    expect(clientJs).toContain('unapplied_acceptances');
  });

  it('.gitattributes carries the sidecar merge=ours line', () => {
    expect(gitattributes).toContain(
      'books/*/03-faithful-translation/*/*-review-status.json merge=ours'
    );
  });
});
```

- [ ] **Step 9.2: Run — expect FAIL**

Run: `npx vitest run server/__tests__/acceptanceUiPins.test.js`
Expected: FAIL on every pin except the `.gitattributes` one (Task 4)

- [ ] **Step 9.3: ui-strings.js**

1. After the `editStatus: { … }` block's closing `},` add nothing there — instead extend nothing in editStatus (the chip uses `UI.acceptance.chip`). Add a new top-level section directly BEFORE the `// ── Edit status labels ──` comment:

```js
  // ── MT acceptance (Staðfesta vélþýðingu, item 20b) ─────────
  acceptance: {
    acceptButton: 'Staðfesta MT',
    acceptTooltip: 'Staðfesta að vélþýðingin sé rétt eins og hún er (Ctrl+Shift+Enter)',
    chip: 'Staðfest',
    chipTitle: function (by, at) {
      return 'Staðfest af ' + by + (at ? ' · ' + at : '');
    },
    revokeButton: 'Afturkalla staðfestingu',
    revokeConfirm: 'Afturkalla staðfestingu á þessum bút? Hann telst þá óyfirfarinn aftur.',
    conflict:
      'Innihald bútsins hefur breyst eða bútur er með virka breytingu í ferli. Endurhleð...',
    noneLeft: 'Engir óyfirfarnir bútar eftir í einingunni.',
    unchangedNothingSaved:
      'Textinn er óbreyttur — engin breyting er vistuð og flokkur/athugasemd fylgja ekki með.\n\n' +
      'Ef vélþýðingin er rétt eins og hún er, notaðu „Staðfesta MT".',
    unchangedWithdrawConfirm:
      'Textinn er aftur eins og upprunalega — breytingin í bið verður dregin til baka og ' +
      'flokkur/athugasemd falla niður.\n\n' +
      'Ef vélþýðingin er rétt eins og hún er, notaðu „Staðfesta MT".\n\nHalda áfram?',
  },
```

2. In the `apply: { … }` section, after the `unapplied:` function, add:

```js
    unappliedCombined: function (edits, acceptances) {
      return (
        edits + ' samþykktar breytingar og ' + acceptances + ' staðfestingar til að vista'
      );
    },
```

- [ ] **Step 9.4: segment-editor.html**

1. Filter options — in the `filter-status` select:

```html
            <option value="unedited">Óbreyttir</option>
```
becomes
```html
            <option value="unedited">Óbreyttir</option>
            <option value="unhandled">Óyfirfarnir</option>
```
and
```html
            <option value="approved">Samþykkt</option>
```
becomes
```html
            <option value="approved">Samþykkt</option>
            <option value="accepted">Staðfest</option>
```

2. CSS — after the `.segment-row.discuss { … }` rule add:

```css
    /* MT acceptance (item 20b) */
    .segment-row.accepted-row {
      background: var(--success-subtle);
    }

    /* Keyboard accept-and-advance cursor */
    .segment-row.kbd-cursor td:first-child {
      box-shadow: inset 3px 0 0 var(--accent);
    }
```

and after the `.edit-status.superseded { … }` rule add:

```css
    .edit-status.accepted {
      background: var(--success-subtle);
      color: var(--success);
    }
```

and after the `.btn-reopen:hover { … }` line add:

```css
    .btn-accept {
      background: var(--success-subtle);
      color: var(--success);
      border: 1px solid var(--success);
    }
    .btn-accept:hover { filter: brightness(1.1); }
```

- [ ] **Step 9.5: segment-editor.js**

1. **State** — after `let lastFocusedTextarea = null;` add:

```js
  let cursorSegmentId = null; // keyboard accept-and-advance cursor (item 20b)
```

2. **renderSegmentRow** — after `const latestEdit = edits[0]; // Most recent` add:

```js
    const acceptance = moduleData.acceptances?.[seg.segmentId] || null;
```

after the `if (!seg.is && !latestEdit) { rowClass += ' no-translation'; }` block add:

```js
    if (!latestEdit && acceptance) {
      rowClass += ' accepted-row';
    }
    if (seg.segmentId === cursorSegmentId) {
      rowClass += ' kbd-cursor';
    }
```

Replace the no-edit `else` branch of `actionsHtml`:

```js
    } else {
      actionsHtml = `
          <button class="btn btn-sm btn-secondary btn-edit" onclick="openEditPanel('${seg.segmentId}')">
            Breyta
          </button>
        `;
    }
```

with:

```js
    } else if (acceptance) {
      const canRevoke = acceptance.accepted_by_username === userName || isHeadEditor;
      actionsHtml = `
          <div>
            <span class="edit-status accepted" title="${escapeHtml(UI.acceptance.chipTitle(acceptance.accepted_by_username, acceptance.accepted_at))}">${UI.acceptance.chip}</span>
          </div>
          ${
            canRevoke
              ? `<button class="btn btn-sm btn-secondary" onclick="revokeAcceptance(${acceptance.id})" style="margin-top: 0.25rem;">&#8617; ${UI.acceptance.revokeButton}</button>`
              : ''
          }
          <button class="btn btn-sm btn-secondary btn-edit" onclick="openEditPanel('${seg.segmentId}')" style="margin-top: 0.25rem;">
            Breyta
          </button>
        `;
    } else {
      actionsHtml = `
          ${
            seg.hasTranslation
              ? `<button class="btn btn-sm btn-accept" onclick="acceptSegmentAndAdvance('${seg.segmentId}')" title="${UI.acceptance.acceptTooltip}">&#10003; ${UI.acceptance.acceptButton}</button>`
              : ''
          }
          <button class="btn btn-sm btn-secondary btn-edit" onclick="openEditPanel('${seg.segmentId}')"${seg.hasTranslation ? ' style="margin-top: 0.25rem;"' : ''}>
            Breyta
          </button>
        `;
    }
```

3. **New functions** — insert a new section directly before `// EDIT ACTIONS`:

```js
  // ================================================================
  // MT ACCEPTANCE ("Staðfesta vélþýðingu", item 20b)
  // ================================================================

  /** Unhandled = has a translation but no edit and no acceptance. */
  function isUnhandled(seg) {
    return (
      seg.hasTranslation &&
      !(moduleData.edits[seg.segmentId] || []).length &&
      !moduleData.acceptances?.[seg.segmentId]
    );
  }

  /** Next unhandled segment AFTER the given one (document order), or null. */
  function nextUnhandledAfter(segmentId) {
    const segs = moduleData?.segments || [];
    const start = segs.findIndex((s) => s.segmentId === segmentId);
    for (let i = start + 1; i < segs.length; i++) {
      if (isUnhandled(segs[i])) return segs[i].segmentId;
    }
    return null;
  }

  /** Re-apply the cursor class (rows are re-rendered on reload) and scroll it into view. */
  function paintCursor() {
    document
      .querySelectorAll('.segment-row.kbd-cursor')
      .forEach((r) => r.classList.remove('kbd-cursor'));
    if (!cursorSegmentId) return;
    const row = document.getElementById('row-' + cssId(cursorSegmentId));
    if (row) {
      row.classList.add('kbd-cursor');
      row.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  }

  async function acceptSegment(segmentId) {
    if (!moduleData?.segments) return;
    const seg = moduleData.segments.find((s) => s.segmentId === segmentId);
    if (!seg || !seg.hasTranslation) return;

    try {
      await saveRetry.attempt(
        `acc:${currentBook}/${currentChapter}/${currentModuleId}:${segmentId}`,
        `${API_BASE}/${currentBook}/${currentChapter}/${currentModuleId}/accept`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ segmentId, acceptedContent: seg.is }),
        }
      );
      lastServerSaveTime = Date.now();
      await loadModule(currentModuleId, { force: true });
      paintCursor();
    } catch (err) {
      if (err.status === 409) {
        // Content changed or an edit is in flight — reload to the fresh state
        // (parity with the edit-save conflict flow).
        alert(err.message || UI.acceptance.conflict);
        await loadModule(currentModuleId, { force: true });
        paintCursor();
      } else if (!saveRetry.isRetryable(err)) {
        alert(UI.common.errorPrefix + err.message);
      }
      // Retryable errors queue in saveRetry; the STALE_CONTENT guard makes
      // a late replay safe (it 409s instead of blessing changed bytes).
    }
  }

  /** Accept a segment and advance the cursor to the next unhandled row. */
  async function acceptSegmentAndAdvance(segmentId) {
    cursorSegmentId = nextUnhandledAfter(segmentId);
    await acceptSegment(segmentId);
  }

  /**
   * Keyboard entry point (Ctrl/Cmd+Shift+Enter): first press positions the
   * visible cursor on the first unhandled row; a press with the cursor on an
   * unhandled row accepts it and advances. Never blind-accepts a row the
   * editor hasn't seen highlighted.
   */
  function acceptAtCursor() {
    if (!moduleData?.segments) return;
    const cur =
      cursorSegmentId && moduleData.segments.find((s) => s.segmentId === cursorSegmentId);
    if (cur && isUnhandled(cur)) {
      acceptSegmentAndAdvance(cur.segmentId);
      return;
    }
    const first = moduleData.segments.find(isUnhandled);
    if (!first) {
      saveRetry.showToast(UI.acceptance.noneLeft, 'info');
      return;
    }
    cursorSegmentId = first.segmentId;
    paintCursor();
  }

  async function revokeAcceptance(acceptanceId) {
    if (!confirm(UI.acceptance.revokeConfirm)) return;
    try {
      await fetchJson(`${API_BASE}/acceptance/${acceptanceId}/revoke`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      });
      await loadModule(currentModuleId, { force: true });
    } catch (err) {
      alert(UI.common.errorPrefix + err.message);
    }
  }
```

4. **renderStats** — in the template, after the `samþykkt` chip line add:

```js
        <div class="stat-chip${chipVal(s.accepted)}"><strong>${s.accepted || 0}</strong> staðfest</div>
```

5. **renderProgress** — replace the counting loop body:

```js
    // Count segments that have at least one edit (any status) OR an active
    // acceptance (item 20b: edits ∪ acceptances drive the progress bar)
    let editedCount = 0;
    for (const seg of moduleData.segments) {
      const edits = moduleData.edits[seg.segmentId] || [];
      if (edits.length > 0 || moduleData.acceptances?.[seg.segmentId]) {
        editedCount++;
      }
    }
```

6. **renderSegments** — in the status-filter block, before the `if (filterStatus === 'unedited')` check add:

```js
        if (filterStatus === 'accepted') {
          return !!moduleData.acceptances?.[s.segmentId];
        }
        if (filterStatus === 'unhandled') {
          return (
            !(moduleData.edits[s.segmentId] || []).length &&
            !moduleData.acceptances?.[s.segmentId]
          );
        }
```

7. **saveEdit withdraw-UX** — directly after the existing early-return block (`if (editedContent === seg.is && !category && !editorNote && !hasPendingEdit) { … }`), add:

```js
    // Withdraw-branch honesty (item 20b, spec §6): an unchanged save that
    // carries a category/note is NOT an edit — the server's withdraw branch
    // would silently drop the annotation (and delete a pending edit).
    // Explain, and point at Staðfesta MT. Server behavior unchanged.
    if (editedContent === seg.is && (category || editorNote)) {
      if (!hasPendingEdit) {
        alert(UI.acceptance.unchangedNothingSaved);
        return;
      }
      if (!confirm(UI.acceptance.unchangedWithdrawConfirm)) return;
    }
```

8. **Keyboard** — in the `keydown` listener, BEFORE the `// Ctrl+Enter to save active edit` block insert:

```js
    // Ctrl/Cmd+Shift+Enter: accept-and-advance (Staðfesta MT, item 20b)
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && e.shiftKey) {
      e.preventDefault();
      acceptAtCursor();
      return;
    }
```

and change the plain save branch condition from
`if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {`
to
`if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && !e.shiftKey) {`

9. **Reset state** — in the back-button handler, after `repetitionData = {};` add:

```js
    cursorSegmentId = null;
```

10. **Expose** — in the window-expose block at the bottom add:

```js
  window.acceptSegmentAndAdvance = acceptSegmentAndAdvance;
  window.revokeAcceptance = revokeAcceptance;
```

11. **loadApplyStatus** — replace the destructure + first condition:

```js
      const { unapplied_count, unapplied_acceptances, total_approved, can_rebuild } = data;
      const totalUnapplied = (unapplied_count || 0) + (unapplied_acceptances || 0);

      if (totalUnapplied > 0) {
        statusEl.textContent =
          unapplied_acceptances > 0
            ? UI.apply.unappliedCombined(unapplied_count || 0, unapplied_acceptances)
            : UI.apply.unapplied(unapplied_count);
        btnApply.disabled = false;
        btnApplyRender.disabled = false;
      } else if (can_rebuild) {
```

(rest of the function unchanged)

- [ ] **Step 9.6: Run — expect PASS**

Run: `npx vitest run server/__tests__/acceptanceUiPins.test.js`
Expected: PASS. Also run `node --check server/public/js/segment-editor.js` and `node --check server/public/js/ui-strings.js` (campaign lesson: syntax-check hand-edited client files).

- [ ] **Step 9.7: Commit**

```bash
git add server/public/js/segment-editor.js server/public/js/ui-strings.js server/views/segment-editor.html server/__tests__/acceptanceUiPins.test.js
git commit -m "feat(item20b): editor UI — Staðfesta MT button, chip, revoke, facets, cursor keyboard, withdraw honesty"
```

---

### Task 10: Playwright e2e — accept, keyboard advance, revoke

**Files:**
- Create: `server/e2e/acceptance.spec.js`

**Interfaces:**
- Consumes: fixture book `__e2e-fixture__` ch01 (modules m68663/m68664). Uses m68664 and targets rows via `.btn-accept` presence so parallel specs' edits don't collide. Serial mode; the final test revokes to leave clean state.

- [ ] **Step 10.1: Write the spec**

Create `server/e2e/acceptance.spec.js`:

```js
// @ts-check
const { test, expect } = require('@playwright/test');
const { loginAs } = require('./helpers/auth');

/**
 * MT acceptance (item 20b): accept → chip + stats change; keyboard cursor +
 * accept-and-advance; revoke restores the unhandled state.
 */

const BOOK = '__e2e-fixture__';
const CHAPTER = '1';
const MODULE = 'm68664';

async function openModule(page) {
  await page.goto(`/editor?book=${BOOK}&chapter=${CHAPTER}&module=${MODULE}`);
  await expect(page.locator('#editor-container')).toBeVisible({ timeout: 15000 });
  await expect(page.locator('#segments-body tr').first()).toBeVisible({ timeout: 10000 });
}

test.describe('MT acceptance', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeEach(async ({ page }) => {
    await loginAs(page, 'admin');
  });

  test('click-accept renders the Staðfest chip and bumps the stats chip', async ({ page }) => {
    await openModule(page);

    const acceptButtons = page.locator('#segments-body .btn-accept');
    const before = await acceptButtons.count();
    expect(before).toBeGreaterThan(0);

    // Accept the LAST unhandled row (other specs edit early rows of m68664)
    await acceptButtons.last().click();

    await expect(page.locator('#segments-body .edit-status.accepted').first()).toBeVisible({
      timeout: 10000,
    });
    await expect(page.locator('#stats-bar')).toContainText('staðfest');
    // One fewer accept button after reload
    await expect
      .poll(() => page.locator('#segments-body .btn-accept').count(), { timeout: 10000 })
      .toBeLessThan(before);
  });

  test('Ctrl+Shift+Enter positions the cursor, then accepts and advances', async ({ page }) => {
    await openModule(page);
    const before = await page.locator('#segments-body .btn-accept').count();
    test.skip(before < 2, 'needs at least two unhandled segments');

    // Press 1: cursor appears, nothing accepted
    await page.keyboard.press('Control+Shift+Enter');
    await expect(page.locator('#segments-body tr.kbd-cursor')).toHaveCount(1);
    expect(await page.locator('#segments-body .btn-accept').count()).toBe(before);

    // Press 2: cursor row accepted, cursor advanced
    await page.keyboard.press('Control+Shift+Enter');
    await expect
      .poll(() => page.locator('#segments-body .btn-accept').count(), { timeout: 10000 })
      .toBe(before - 1);
    await expect(page.locator('#segments-body tr.kbd-cursor')).toHaveCount(1);
  });

  test('revoke returns the segments to unhandled (cleanup)', async ({ page }) => {
    await openModule(page);
    // Revoke every acceptance this spec created
    // (button text from UI.acceptance.revokeButton)
    page.on('dialog', (d) => d.accept());
    while ((await page.locator('#segments-body button:has-text("Afturkalla staðfestingu")').count()) > 0) {
      await page
        .locator('#segments-body button:has-text("Afturkalla staðfestingu")')
        .first()
        .click();
      await expect(page.locator('#segments-body tr').first()).toBeVisible({ timeout: 10000 });
    }
    await expect(page.locator('#segments-body .edit-status.accepted')).toHaveCount(0);
  });
});
```

- [ ] **Step 10.2: Run the e2e suite**

Run: `cd server && npm run test:e2e -- acceptance.spec.js` (starts the seeded fixture server per `e2e/playwright.config.js`)
Expected: 3 passed. If the runner requires the full suite, run `npm run test:e2e` and confirm no other spec regressed.

- [ ] **Step 10.3: Commit**

```bash
git add server/e2e/acceptance.spec.js
git commit -m "test(item20b): e2e — accept chip+stats, keyboard cursor/advance, revoke"
```

---

### Task 11: Full-suite gate, register notes, PR

- [ ] **Step 11.1: Full unit suite from the repo root**

Run: `npm test`
Expected: ALL green (~3043+ tests before this branch; the suite count grows). Fix anything red before proceeding — **local `npm test` is the authoritative gate; there is no branch protection.**

- [ ] **Step 11.2: Full e2e suite**

Run: `cd server && npm run test:e2e`
Expected: all specs green (including the pre-existing editor specs against the widened module GET response).

- [ ] **Step 11.3: Register queue additions**

Append to the campaign register (`docs/plans/2026-07-11-pre-semester-coding-campaign.md`, item-20b section — same style as I20-R*):

- **MTA-R1 `[comms]`** (from spec §12) — deploy release-note to ritstjórn: completion metrics rise (approved ∪ accepted), the new Staðfesta MT workflow, re-review plan for the 4 faithful modules.
- **MTA-R2 `[design note]`** (from spec §12) — `module_reviews.edited_segments` stays edit-only; review-queue acceptance counts deferred.
- **MTA-R3 `[ux follow-up]`** (new, from this plan) — the accept button renders only in the no-edit branch (spec §6), so a segment whose latest edit was REJECTED/superseded cannot be accepted from the UI even though the server allows it; revisit if editors hit it.
- **MTA-R4 `[design note]`** (new) — sidecar status precedence is acceptance-first (an active, drift-checked acceptance outranks an older applied edit on the same segment — the restore edge); PR2's corpus reader inherits this.

- [ ] **Step 11.4: Push + PR**

```bash
git push -u origin feat/item20b-mt-acceptance
gh pr create --title "feat(item20b): MT-acceptance record — Staðfesta vélþýðingu (PR1: workflow end-to-end)" --body "$(cat <<'EOF'
## Summary
- Migration 043 `segment_acceptances` + acceptanceService (accept / revoke / supersede-on-edit / content-drift lapse / applied-stamp / review-status sidecar)
- Apply gate widened: accept-only modules now apply, write the faithful file + sidecar, advance chapter status, and fire TM/concordance hooks
- Routes: POST …/accept (409 STALE_CONTENT / EDIT_EXISTS, first-accept MT-lock), POST /acceptance/:id/revoke (owner-or-HE)
- Editor UI: Staðfesta MT button, Staðfest chip + revoke, Staðfest/Óyfirfarnir facets, stats/progress redefinition, Ctrl+Shift+Enter accept-and-advance, withdraw-branch honesty message
- Metrics: reviewed(segment) = approved edit ∪ active acceptance (numbers RISE at deploy — register MTA-R1 comms)

Spec: docs/superpowers/specs/2026-07-19-mt-acceptance-design.md (approved). PR2 (corpus reviewStatus) follows.

## Test plan
- [x] npm test (repo root) green
- [x] cd server && npm run test:e2e green (new acceptance.spec.js)

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Self-Review Notes (already applied)

- **Spec coverage:** §4 → Task 1; §5 → Task 7; §6 → Task 9; §7 → Tasks 3, 5, 6; §8 → Tasks 4, 5, 8; §10 test list → Tasks 1–10 (migration ✓, service ✓, apply ✓, routes-with-gate-invoke ✓, metrics ✓, sidecar ✓, UI pins + e2e ✓); §12 → Task 11.
- **Error-string pins:** the apply gate keeps all three legacy messages verbatim (see Global Constraints) — verified against `segmentEditorService.test.js:1075` and the route's `includes()` mapping.
- **Cycle check:** `acceptanceService` requires only `segmentParser`/libs; `segmentEditorService → acceptanceService` and `contentVersionService → acceptanceService` are both acyclic.
- **Connection discipline:** every acceptance write that runs inside `saveSegmentEdit`/`applyApprovedEdits` transactions passes the caller's `conn`; route-facing paths use the service's own singleton (same DB file).
- **Task 8 SQL:** the first-draft LEFT-JOIN progress query dropped acceptance-only chapters; the corrected UNION-ALL query in Step 8.3 is the one to implement.
