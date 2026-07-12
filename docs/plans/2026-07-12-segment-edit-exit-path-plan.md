# Segment-Edit Exit Path + Dropped Messages — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give `discuss`/`rejected` segment edits a real exit path (rebuild `segment_edits` with a partial unique index + `'superseded'` status, supersede-on-save, head-editor return-to-pending) and surface the currently-dropped pipeline-confirmation and save-conflict messages.

**Architecture:** Migration 039 rebuilds `segment_edits` (mirror of migration 026's rebuild pattern): the 5-column `UNIQUE` that made every repeat transition collide becomes a partial unique index on pending rows only, and the status CHECK gains `'superseded'`. `saveSegmentEdit` supersedes the editor's own stale discuss/rejected rows in the same transaction as the new insert; a new `returnEditToPending` service+route is the manual exit; the apply-time supersede site and the two `status != 'rejected'` consumers adopt the new vocabulary in the same PR. Test fixtures move to one canonical schema helper — the current fixtures omit the UNIQUE constraint entirely, which is exactly why this bug class was invisible to the suite.

**Tech Stack:** Express 5 (CommonJS in `server/`), better-sqlite3, Vitest (in-memory/temp-file DBs), vanilla-JS client (IIFE files in `server/public/js/`, inline scripts in `server/views/`).

**Design doc:** `docs/plans/2026-07-12-segment-edit-exit-path-design.md` (lead-approved 2026-07-12). One design update discovered while planning (record in the design amendment at T8): the five status-count queries need **no changes** (they count by explicit status, so `superseded` drops out automatically), but two OTHER consumers the design didn't list must adopt the vocabulary: `buildEffectiveSegments` (`segmentEditorService.js:197` — skips `rejected` when overlaying the latest edit) and `submitModuleForReview`'s `stampEdits` (`:476` — `status != 'rejected'`). Both are handled in Task 5.

## Global Constraints

- Branch: `fix/segment-edit-exit-path` (already checked out, design committed). One PR at the end.
- `npm test` from the **repo root** is the authoritative gate (no branch protection).
- `server/` is CommonJS; tests are ESM Vitest using `createRequire`.
- **Vocabulary + consumers change together** (B1-F7 lesson): `'superseded'` lands in the same PR as its badge, label, CSS, and the two `!= 'rejected'` consumer queries.
- **History is never deleted**: supersede is a status change; reviewer fields stay.
- Migration must be idempotent (internal guard, 026 pattern) and use **explicit column lists** in the copy INSERT (026 lesson: never `SELECT *`).
- Icelandic for all user-facing strings. New status label: **"Leyst úr gildi"**. Reopen button label: **"Opna aftur"**.
- `activityLogging.test.js` pins the `ACTIVITY_TYPES` count at **22** — Task 4 adds one member and bumps the pin to **23** (B1-F1 lesson).
- The repo's `no-unused-vars` (error) + lint-staged pre-commit hook reject symbols defined in one task but used only in a later one — if that arises, use a scoped `// eslint-disable-next-line no-unused-vars -- <reason>` and have the consuming task remove it (B1-F1 lesson). Task order below avoids this in the normal path.
- Every commit message ends with: `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`
- `git fetch origin` BEFORE the first push (post-merge pack gotcha).

---

### Task 1: Migration 039 — rebuild `segment_edits`

**Files:**
- Create: `server/migrations/039-segment-edit-exit-path.js`
- Test: `server/__tests__/migration039.test.js` (new; mirrors `migration038.test.js`'s temp-DB style)

**Interfaces:**
- Consumes: nothing from other tasks. Live schema facts (verified): 008 columns + `applied_at DATETIME` (009) + `review_id INTEGER REFERENCES module_reviews(id)` (038); indexes `idx_segment_edits_module(book, module_id)`, `_status(status)`, `_editor(editor_id)`, `_segment(module_id, segment_id)` (008), `_applied(module_id, status, applied_at)` (009).
- Produces: the canonical post-039 schema — the exact DDL Task 2's helper duplicates. New partial unique index name: `idx_segment_edits_one_pending`. New CHECK: `status IN ('pending','approved','rejected','discuss','superseded')`.

- [ ] **Step 1: Write the failing test**

Create `server/__tests__/migration039.test.js`:

```js
/**
 * Migration 039: segment_edits rebuild — partial unique index + 'superseded'.
 *
 * The 008 table-level UNIQUE(book, module_id, segment_id, status, editor_id)
 * made every repeat transition into an occupied status collide (live-reproduced:
 * re-discussing a revised segment surfaced the raw SQLite constraint text in a
 * browser alert). Only the one-pending-per-(segment, editor) invariant is
 * load-bearing; 039 keeps exactly that as a partial unique index and adds
 * 'superseded' to the status vocabulary as the discuss/rejected exit.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createRequire } from 'module';
import os from 'os';
import path from 'path';
import fs from 'fs';

const require = createRequire(import.meta.url);

const TMP_DB = path.join(os.tmpdir(), `migration-039-${process.pid}.db`);
process.env.SESSIONS_DB_PATH = TMP_DB;
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';

const Database = require('better-sqlite3');
const { runAllMigrations } = require('../services/migrationRunner');

function rm() {
  for (const s of ['', '-wal', '-shm']) fs.rmSync(TMP_DB + s, { force: true });
}

beforeAll(rm);
afterAll(rm);

describe('migration 039 — segment_edits exit-path rebuild', () => {
  let db;

  beforeAll(() => {
    const result = runAllMigrations();
    expect(result.errors).toEqual([]);
    db = new Database(TMP_DB);
  });

  afterAll(() => db?.close());

  it('drops the 5-column UNIQUE and keeps every live column', () => {
    const sql = db
      .prepare(`SELECT sql FROM sqlite_master WHERE type='table' AND name='segment_edits'`)
      .get().sql;
    expect(sql).not.toContain('UNIQUE(book, module_id, segment_id, status, editor_id)');

    const cols = db.prepare(`PRAGMA table_info(segment_edits)`).all().map((c) => c.name);
    for (const col of [
      'id', 'book', 'chapter', 'module_id', 'segment_id', 'original_content',
      'edited_content', 'category', 'editor_note', 'status', 'editor_id',
      'editor_username', 'reviewer_id', 'reviewer_username', 'reviewer_note',
      'created_at', 'reviewed_at', 'applied_at', 'review_id',
    ]) {
      expect(cols).toContain(col);
    }
  });

  it('has the partial unique index on pending plus the five plain indexes', () => {
    const indexes = db.prepare(`PRAGMA index_list(segment_edits)`).all();
    const names = indexes.map((i) => i.name);
    expect(names).toContain('idx_segment_edits_one_pending');
    expect(indexes.find((i) => i.name === 'idx_segment_edits_one_pending').unique).toBe(1);
    // Partiality: the index DDL carries the WHERE clause.
    const idxSql = db
      .prepare(`SELECT sql FROM sqlite_master WHERE type='index' AND name='idx_segment_edits_one_pending'`)
      .get().sql;
    expect(idxSql).toContain("WHERE status = 'pending'");
    for (const idx of [
      'idx_segment_edits_module', 'idx_segment_edits_status',
      'idx_segment_edits_editor', 'idx_segment_edits_segment',
      'idx_segment_edits_applied',
    ]) {
      expect(names).toContain(idx);
    }
  });

  const baseRow = {
    book: 'b', chapter: 1, module_id: 'm1', segment_id: 's1',
    original_content: 'o', edited_content: 'e',
    editor_id: 'u1', editor_username: 'user1',
  };
  function insert(overrides = {}) {
    const row = { ...baseRow, ...overrides };
    return db
      .prepare(
        `INSERT INTO segment_edits
         (book, chapter, module_id, segment_id, original_content, edited_content,
          status, editor_id, editor_username)
         VALUES (@book, @chapter, @module_id, @segment_id, @original_content,
                 @edited_content, @status, @editor_id, @editor_username)`
      )
      .run(row);
  }

  it("accepts 'superseded' and still rejects unknown statuses", () => {
    expect(() => insert({ status: 'superseded', segment_id: 's-chk' })).not.toThrow();
    expect(() => insert({ status: 'bogus', segment_id: 's-chk2' })).toThrow(/CHECK/);
  });

  it('enforces one pending per (book, module, segment, editor) and nothing else', () => {
    insert({ status: 'pending', segment_id: 's-inv' });
    expect(() => insert({ status: 'pending', segment_id: 's-inv' })).toThrow(/UNIQUE/);
    // Repeat non-pending statuses are now legal (the old constraint blocked these).
    insert({ status: 'rejected', segment_id: 's-inv' });
    expect(() => insert({ status: 'rejected', segment_id: 's-inv' })).not.toThrow();
    expect(() => insert({ status: 'discuss', segment_id: 's-inv' })).not.toThrow();
  });

  it('copies pre-existing rows across the rebuild intact (FK check clean)', () => {
    // runAllMigrations bootstrapped 008 → seeded nothing; verify structural health.
    expect(db.prepare(`PRAGMA foreign_key_check`).all()).toEqual([]);
  });

  it('is idempotent — a re-run over the migrated DB is clean', () => {
    const second = runAllMigrations();
    expect(second.errors).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run server/__tests__/migration039.test.js`
Expected: FAIL — the sqlite_master `sql` still contains the 5-column UNIQUE (migration 039 does not exist yet), and the `'superseded'` insert throws `CHECK`.

- [ ] **Step 3: Write the migration**

Create `server/migrations/039-segment-edit-exit-path.js`:

```js
/**
 * Migration 039: segment_edits exit path — partial unique index + 'superseded'.
 *
 * The 008 table-level UNIQUE(book, module_id, segment_id, status, editor_id)
 * made every repeat transition into an occupied status collide with a raw
 * SQLite error (re-discuss was live-reproduced; re-reject/re-approve/unapprove
 * and the apply-time supersede hit the same wall). The only load-bearing
 * invariant is one PENDING edit per (book, module, segment, editor) — keep
 * exactly that as a partial unique index. 'superseded' joins the status
 * vocabulary so a stale discuss/rejected row can be resolved by a newer save
 * without deleting history.
 *
 * SQLite cannot alter constraints → table rebuild (pattern: migration 026).
 * Explicit column mapping in the copy INSERT — never SELECT * (026 lesson).
 * Idempotent: guarded on the old UNIQUE still being present in sqlite_master
 * (belt-and-braces on top of the runner's applied-migrations tracking).
 */

module.exports = {
  name: '039-segment-edit-exit-path',

  up(db) {
    const tableInfo = db
      .prepare(`SELECT sql FROM sqlite_master WHERE type='table' AND name='segment_edits'`)
      .get();

    if (!tableInfo) return;
    if (!tableInfo.sql.includes('UNIQUE(book, module_id, segment_id, status, editor_id)')) {
      return; // already rebuilt
    }

    db.exec(`
      CREATE TABLE segment_edits_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        book TEXT NOT NULL,
        chapter INTEGER NOT NULL,
        module_id TEXT NOT NULL,
        segment_id TEXT NOT NULL,
        original_content TEXT NOT NULL,
        edited_content TEXT NOT NULL,
        category TEXT CHECK(category IN (
          'terminology', 'accuracy', 'readability', 'style', 'omission'
        )),
        editor_note TEXT,
        status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN (
          'pending', 'approved', 'rejected', 'discuss', 'superseded'
        )),
        editor_id TEXT NOT NULL,
        editor_username TEXT NOT NULL,
        reviewer_id TEXT,
        reviewer_username TEXT,
        reviewer_note TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        reviewed_at DATETIME,
        applied_at DATETIME,
        review_id INTEGER REFERENCES module_reviews(id)
      );

      INSERT INTO segment_edits_new (
        id, book, chapter, module_id, segment_id, original_content, edited_content,
        category, editor_note, status, editor_id, editor_username, reviewer_id,
        reviewer_username, reviewer_note, created_at, reviewed_at, applied_at, review_id
      )
      SELECT
        id, book, chapter, module_id, segment_id, original_content, edited_content,
        category, editor_note, status, editor_id, editor_username, reviewer_id,
        reviewer_username, reviewer_note, created_at, reviewed_at, applied_at, review_id
      FROM segment_edits;

      DROP TABLE segment_edits;

      ALTER TABLE segment_edits_new RENAME TO segment_edits;

      CREATE UNIQUE INDEX IF NOT EXISTS idx_segment_edits_one_pending
        ON segment_edits(book, module_id, segment_id, editor_id)
        WHERE status = 'pending';

      CREATE INDEX IF NOT EXISTS idx_segment_edits_module
        ON segment_edits(book, module_id);
      CREATE INDEX IF NOT EXISTS idx_segment_edits_status
        ON segment_edits(status);
      CREATE INDEX IF NOT EXISTS idx_segment_edits_editor
        ON segment_edits(editor_id);
      CREATE INDEX IF NOT EXISTS idx_segment_edits_segment
        ON segment_edits(module_id, segment_id);
      CREATE INDEX IF NOT EXISTS idx_segment_edits_applied
        ON segment_edits(module_id, status, applied_at);
    `);
  },
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run server/__tests__/migration039.test.js server/__tests__/migrationIdempotency.test.js server/__tests__/migration038.test.js`
Expected: PASS (039 asserts green; the idempotency suite auto-covers the new migration; 038's own test — which builds the OLD schema deliberately — still passes).

- [ ] **Step 5: Commit**

```bash
git add server/migrations/039-segment-edit-exit-path.js server/__tests__/migration039.test.js
git commit -m "feat(db): migration 039 — segment_edits partial unique index + 'superseded' status

The 008 UNIQUE(book,module,segment,status,editor) made every repeat
transition collide (re-discuss live-reproduced as a raw SQLite alert()).
Rebuild keeps the one load-bearing invariant (one pending per editor per
segment) as a partial unique index and adds 'superseded' as the
discuss/rejected exit vocabulary. Pattern: migration 026 (explicit column
copy, sqlite_master guard, idempotent).

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: Canonical test-schema helper + convert the 8 drifted fixtures

**Files:**
- Create: `server/__tests__/helpers/segmentEditsSchema.cjs`
- Modify (replace their inline `CREATE TABLE segment_edits` + `idx_segment_edits_*` DDL with the helper): `server/__tests__/segmentEditorService.test.js`, `server/__tests__/segmentEditConflict.test.js`, `server/__tests__/dashboardReadModel.test.js`, `server/__tests__/applyStatusRebuild.test.js`, `server/__tests__/errorHandling.test.js`, `server/__tests__/mtLockOnFirstEdit.test.js`, `server/__tests__/termMiningService.test.js`, `server/__tests__/propagationService.test.js`
- Do NOT touch: `server/__tests__/migration038.test.js` (it builds the OLD schema deliberately to test 038 itself).

**Interfaces:**
- Consumes: the canonical DDL from Task 1 (duplicated verbatim into the helper — the helper's header comment binds them).
- Produces: `createSegmentEditsSchema(db)` — creates `segment_edits` (post-039 shape) and its six indexes on the given better-sqlite3 handle. Tasks 3–5 write their tests against fixtures created by this helper.

**Why this task exists:** every current fixture omits the table-level UNIQUE constraint — the suite could never see the collision class this PR fixes. Fixtures must carry the real constraints or the next constraint bug is invisible too.

- [ ] **Step 1: Create the helper**

Create `server/__tests__/helpers/segmentEditsSchema.cjs`:

```js
/**
 * Canonical segment_edits schema for test fixtures — POST-migration-039 shape.
 *
 * Keep in lockstep with server/migrations/039-segment-edit-exit-path.js
 * (same columns, same CHECK, same indexes). The pre-039 fixtures hand-rolled
 * this DDL and silently omitted the table-level UNIQUE constraint — which is
 * exactly why the transition-collision bug class (stranded discuss/rejected
 * rows) never showed in the suite. Fixtures must enforce what production
 * enforces.
 */
function createSegmentEditsSchema(db) {
  db.exec(`
    CREATE TABLE segment_edits (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      book TEXT NOT NULL,
      chapter INTEGER NOT NULL,
      module_id TEXT NOT NULL,
      segment_id TEXT NOT NULL,
      original_content TEXT NOT NULL,
      edited_content TEXT NOT NULL,
      category TEXT CHECK(category IN (
        'terminology', 'accuracy', 'readability', 'style', 'omission'
      )),
      editor_note TEXT,
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN (
        'pending', 'approved', 'rejected', 'discuss', 'superseded'
      )),
      editor_id TEXT NOT NULL,
      editor_username TEXT NOT NULL,
      reviewer_id TEXT,
      reviewer_username TEXT,
      reviewer_note TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      reviewed_at DATETIME,
      applied_at DATETIME,
      review_id INTEGER
    );

    CREATE UNIQUE INDEX idx_segment_edits_one_pending
      ON segment_edits(book, module_id, segment_id, editor_id)
      WHERE status = 'pending';
    CREATE INDEX idx_segment_edits_module ON segment_edits(book, module_id);
    CREATE INDEX idx_segment_edits_status ON segment_edits(status);
    CREATE INDEX idx_segment_edits_editor ON segment_edits(editor_id);
    CREATE INDEX idx_segment_edits_segment ON segment_edits(module_id, segment_id);
    CREATE INDEX idx_segment_edits_applied ON segment_edits(module_id, status, applied_at);
  `);
}

module.exports = { createSegmentEditsSchema };
```

(`review_id INTEGER` without the `REFERENCES` clause: most fixtures do not create `module_reviews`, and better-sqlite3 leaves `foreign_keys` off, so the reference is inert in tests anyway — a comment-worthy simplification, not drift. Add this note as a one-line comment above the column.)

- [ ] **Step 2: Convert the 8 fixtures**

In each of the 8 listed test files: add at the top (with the other `require` calls):

```js
const { createSegmentEditsSchema } = require('./helpers/segmentEditsSchema.cjs');
```

and replace the file's inline `db.exec(\`CREATE TABLE segment_edits (…)\`)` block — including any `CREATE INDEX idx_segment_edits_*` statements it carries — with:

```js
  createSegmentEditsSchema(db);
```

Leave each file's OTHER tables (`module_reviews`, `content_versions`, etc.) untouched. If a file interleaves `segment_edits` DDL and other DDL inside one `db.exec`, split it: helper call for segment_edits, remaining DDL stays inline.

- [ ] **Step 3: Run the server suite and adjudicate reveals**

Run: `npx vitest run server/__tests__/`
Expected: PASS. **If any test now fails on `UNIQUE constraint failed: … idx_segment_edits_one_pending`**, that test was creating two pending rows for the same (book, module, segment, editor) — a state production has never allowed. Do NOT weaken the helper and do NOT rewrite the assertion to expect a throw: report the failing test in your task report as DONE_WITH_CONCERNS (or BLOCKED if widespread) so the controller can adjudicate whether the test's seed data or its subject code is wrong.

- [ ] **Step 4: Commit**

```bash
git add server/__tests__/helpers/segmentEditsSchema.cjs server/__tests__/segmentEditorService.test.js server/__tests__/segmentEditConflict.test.js server/__tests__/dashboardReadModel.test.js server/__tests__/applyStatusRebuild.test.js server/__tests__/errorHandling.test.js server/__tests__/mtLockOnFirstEdit.test.js server/__tests__/termMiningService.test.js server/__tests__/propagationService.test.js
git commit -m "test: one canonical segment_edits fixture schema (post-039, constraints included)

Every hand-rolled fixture omitted the table-level UNIQUE constraint — the
exact reason the transition-collision class never showed in the suite.
All 8 service-level fixtures now build from one helper that mirrors
migration 039 (partial unique index + 'superseded' CHECK) verbatim.
migration038.test.js keeps its intentional old-schema build.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: Supersede-on-save (the exit path itself)

**Files:**
- Modify: `server/services/segmentEditorService.js` (`saveSegmentEdit`, lines ~85–165)
- Test: `server/__tests__/segmentEditorService.test.js`

**Interfaces:**
- Consumes: post-039 fixture schema via Task 2's helper (`createSegmentEditsSchema`).
- Produces: new `saveSegmentEdit` behavior Tasks 4–5 rely on — a fresh INSERT marks the same editor's `discuss`/`rejected` rows on that segment `'superseded'`, atomically with the INSERT.

- [ ] **Step 1: Write the failing tests**

Add to `server/__tests__/segmentEditorService.test.js` (uses the file's existing `service`, `createTestDb`/setup helpers — follow its established save/approve call shapes):

```js
describe('discuss/rejected exit path — supersede-on-save + collision matrix', () => {
  // Shorthand: a save by editor u1 on segment s1 of module m1.
  function save(overrides = {}) {
    return service.saveSegmentEdit({
      book: 'testbook',
      chapter: 1,
      moduleId: 'm00001',
      segmentId: 'seg-exit-1',
      originalContent: 'original',
      editedContent: 'edited v' + Math.random(),
      editorId: 'u1',
      editorUsername: 'editor1',
      ...overrides,
    });
  }

  it('re-discuss after a re-save is clean (the live-reproduced alert() bug)', () => {
    const first = save();
    service.markForDiscussion(first.id, 'rev1', 'reviewer1', 'ræðum þetta');
    const second = save(); // supersedes the stranded discuss row
    expect(() =>
      service.markForDiscussion(second.id, 'rev1', 'reviewer1', 'aftur')
    ).not.toThrow();
    const rows = service.getSegmentEditHistory('testbook', 'm00001', 'seg-exit-1');
    expect(rows.find((r) => r.id === first.id).status).toBe('superseded');
    expect(rows.find((r) => r.id === second.id).status).toBe('discuss');
  });

  it('re-reject after a re-save is clean', () => {
    const first = save({ segmentId: 'seg-exit-2' });
    service.rejectEdit(first.id, 'rev1', 'reviewer1', 'nei');
    const second = save({ segmentId: 'seg-exit-2' });
    expect(() => service.rejectEdit(second.id, 'rev1', 'reviewer1', 'enn nei')).not.toThrow();
  });

  it('a second approval while an earlier approved row is unapplied is clean', () => {
    const first = save({ segmentId: 'seg-exit-3' });
    service.approveEdit(first.id, 'rev1', 'reviewer1');
    const second = save({ segmentId: 'seg-exit-3' });
    expect(() => service.approveEdit(second.id, 'rev1', 'reviewer1')).not.toThrow();
    // The approved row is live work product — save must NOT supersede it.
    const rows = service.getSegmentEditHistory('testbook', 'm00001', 'seg-exit-3');
    expect(rows.find((r) => r.id === first.id).status).toBe('approved');
  });

  it('supersedes only the SAME editor’s rows on the SAME segment', () => {
    const mine = save({ segmentId: 'seg-exit-4' });
    service.rejectEdit(mine.id, 'rev1', 'reviewer1', 'nei');
    const theirs = save({ segmentId: 'seg-exit-4', editorId: 'u2', editorUsername: 'editor2' });
    service.rejectEdit(theirs.id, 'rev1', 'reviewer1', 'nei');
    const otherSeg = save({ segmentId: 'seg-exit-5' });
    service.rejectEdit(otherSeg.id, 'rev1', 'reviewer1', 'nei');

    save({ segmentId: 'seg-exit-4' }); // u1 re-saves seg-exit-4 only
    const seg4 = service.getSegmentEditHistory('testbook', 'm00001', 'seg-exit-4');
    expect(seg4.find((r) => r.id === mine.id).status).toBe('superseded');
    expect(seg4.find((r) => r.id === theirs.id).status).toBe('rejected'); // other editor untouched
    const seg5 = service.getSegmentEditHistory('testbook', 'm00001', 'seg-exit-5');
    expect(seg5.find((r) => r.id === otherSeg.id).status).toBe('rejected'); // other segment untouched
  });

  it('supersede preserves the reviewer’s fields as history', () => {
    const first = save({ segmentId: 'seg-exit-6' });
    service.markForDiscussion(first.id, 'rev1', 'reviewer1', 'athugasemd');
    save({ segmentId: 'seg-exit-6' });
    const row = service
      .getSegmentEditHistory('testbook', 'm00001', 'seg-exit-6')
      .find((r) => r.id === first.id);
    expect(row.status).toBe('superseded');
    expect(row.reviewer_note).toBe('athugasemd');
    expect(row.reviewer_username).toBe('reviewer1');
  });

  it('withdraw (content == original) does NOT supersede anything', () => {
    const first = save({ segmentId: 'seg-exit-7' });
    service.markForDiscussion(first.id, 'rev1', 'reviewer1', 'ræðum');
    save({ segmentId: 'seg-exit-7', editedContent: 'original' }); // withdraw path
    const row = service
      .getSegmentEditHistory('testbook', 'm00001', 'seg-exit-7')
      .find((r) => r.id === first.id);
    expect(row.status).toBe('discuss'); // no new revision happened — history stands
  });
});
```

Note: `getSegmentEditHistory(book, moduleId, segmentId)` is the existing service function (`segmentEditorService.js:280`) returning all rows newest-first.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run server/__tests__/segmentEditorService.test.js`
Expected: FAIL — but NOT with a UNIQUE violation: the post-039 fixture only constrains pending rows, so the old collision cannot reproduce; instead the supersede assertions fail (`expect(status).toBe('superseded')` receives `'discuss'`/`'rejected'`) because `saveSegmentEdit` does not supersede yet. Record exactly which assertions fail.

- [ ] **Step 3: Implement supersede-on-save**

In `server/services/segmentEditorService.js`, `saveSegmentEdit`: replace the block from the `// Create new edit` comment through the INSERT `.run(...)` call (lines ~115–134) with a transaction that supersedes then inserts:

```js
  // Create new edit. A fresh revision is also the exit path for the editor's
  // own stale discuss/rejected rows on this segment (batch 2): they become
  // 'superseded' — reviewer note preserved as history — so review actions on
  // the new row can't collide and the old row stops counting as awaiting work.
  // Same transaction as the INSERT: a save either fully lands or fully doesn't.
  const insertWithSupersede = conn.transaction(() => {
    conn
      .prepare(
        `UPDATE segment_edits SET status = 'superseded'
         WHERE book = ? AND module_id = ? AND segment_id = ? AND editor_id = ?
           AND status IN ('discuss', 'rejected')`
      )
      .run(book, moduleId, segmentId, editorId);

    return conn
      .prepare(
        `INSERT INTO segment_edits
       (book, chapter, module_id, segment_id, original_content, edited_content,
        category, editor_note, editor_id, editor_username)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        book,
        chapter,
        moduleId,
        segmentId,
        originalContent,
        editedContent,
        category || null,
        editorNote || null,
        editorId,
        editorUsername
      );
  });
  const result = insertWithSupersede();
```

Leave everything after (the MT-lock block, which reads `result.lastInsertRowid`) unchanged — the lock writes a file and deliberately stays outside the DB transaction.

Deliberate scoping (state this in a brief comment if not obvious from the code): the supersede runs only on the INSERT path, not on the update-existing-pending path — a pending row can only exist after an earlier INSERT already superseded the stale rows, and reject/discuss only ever consume a pending row, so no discuss/rejected row can appear while a pending one exists.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run server/__tests__/segmentEditorService.test.js server/__tests__/segmentEditConflict.test.js server/__tests__/mtLockOnFirstEdit.test.js`
Expected: PASS (including the pre-existing save-path and MT-lock suites — the save path gained a transaction wrapper).

- [ ] **Step 5: Commit**

```bash
git add server/services/segmentEditorService.js server/__tests__/segmentEditorService.test.js
git commit -m "feat(editor): supersede-on-save — the discuss/rejected exit path

A new revision by the same editor marks their own stale discuss/rejected
rows on that segment 'superseded' (atomically with the insert, history
preserved). Kills the live-reproduced re-discuss UNIQUE-constraint
alert() and the same-shape re-reject/re-approve collisions.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: `returnEditToPending` — head-editor manual exit (service + route + enum)

**Files:**
- Modify: `server/services/segmentEditorService.js` (new function after `unapproveEdit`, ~line 419; add to `module.exports`)
- Modify: `server/routes/segment-editor.js` (new route after `/edit/:editId/unapprove`, ~line 673)
- Modify: `server/services/activityLog.js` (one `ACTIVITY_TYPES` member)
- Test: `server/__tests__/segmentEditorService.test.js`, `server/__tests__/activityLogging.test.js` (count pin 22 → 23)

**Interfaces:**
- Consumes: Task 3's supersede-on-save (for the guard's rationale), post-039 schema.
- Produces: `returnEditToPending(editId)` → updated edit row (throws `Error` with `.code = 'PENDING_EXISTS'` when blocked); route `POST /api/segment-editor/edit/:editId/return-to-pending` (401/403 via existing middleware, 409 on `PENDING_EXISTS`, 400 otherwise); `ACTIVITY_TYPES.SEGMENT_EDIT_REOPENED = 'segment_edit_reopened'`. Task 6's button calls this route.

- [ ] **Step 1: Write the failing tests**

Add to `server/__tests__/segmentEditorService.test.js`:

```js
describe('returnEditToPending — head-editor manual exit', () => {
  function save(overrides = {}) {
    return service.saveSegmentEdit({
      book: 'testbook', chapter: 1, moduleId: 'm00001',
      segmentId: 'seg-rtp-1', originalContent: 'original',
      editedContent: 'edited v' + Math.random(),
      editorId: 'u1', editorUsername: 'editor1',
      ...overrides,
    });
  }

  it('returns a discuss row to pending and clears reviewer fields', () => {
    const e = save();
    service.markForDiscussion(e.id, 'rev1', 'reviewer1', 'ræðum');
    const back = service.returnEditToPending(e.id);
    expect(back.status).toBe('pending');
    expect(back.reviewer_id).toBeNull();
    expect(back.reviewer_username).toBeNull();
    expect(back.reviewer_note).toBeNull();
    expect(back.reviewed_at).toBeNull();
  });

  it('returns a rejected row to pending', () => {
    const e = save({ segmentId: 'seg-rtp-2' });
    service.rejectEdit(e.id, 'rev1', 'reviewer1', 'nei');
    expect(service.returnEditToPending(e.id).status).toBe('pending');
  });

  it('refuses when the editor already has a newer pending row (409 code)', () => {
    const e = save({ segmentId: 'seg-rtp-3' });
    service.rejectEdit(e.id, 'rev1', 'reviewer1', 'nei');
    save({ segmentId: 'seg-rtp-3' }); // editor already responded — old row is superseded…
    // …so returnEditToPending must refuse on status, or on the pending guard for
    // a row that somehow stayed rejected. Recreate that state directly:
    const conn = testDb; // the file's shared handle
    conn
      .prepare(`UPDATE segment_edits SET status = 'rejected' WHERE id = ?`)
      .run(e.id);
    let err;
    try {
      service.returnEditToPending(e.id);
    } catch (x) {
      err = x;
    }
    expect(err?.code).toBe('PENDING_EXISTS');
  });

  it('refuses non-discuss/rejected rows and applied rows', () => {
    const e = save({ segmentId: 'seg-rtp-4' });
    expect(() => service.returnEditToPending(e.id)).toThrow(/discuss/);
    service.rejectEdit(e.id, 'rev1', 'reviewer1', 'nei');
    testDb
      .prepare(`UPDATE segment_edits SET applied_at = CURRENT_TIMESTAMP WHERE id = ?`)
      .run(e.id);
    expect(() => service.returnEditToPending(e.id)).toThrow(/applied/);
  });
});
```

(`testDb` = whatever handle name the file's setup exposes; match the file's existing convention when writing the test.)

And in `server/__tests__/activityLogging.test.js`: bump the `ACTIVITY_TYPES` count pin from 22 to 23 and add `'segment_edit_reopened'` to the segment-editor family assertion (follow the per-family assertion structure added in PR #269).

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run server/__tests__/segmentEditorService.test.js server/__tests__/activityLogging.test.js`
Expected: FAIL — `service.returnEditToPending is not a function`; the count pin fails at 22 vs expected 23 only after the enum edit (it currently passes — it goes red when Step 3 adds the member, then green with the pin bump; do the pin bump in the same step as the enum change).

- [ ] **Step 3: Implement service + enum + route**

`server/services/segmentEditorService.js`, after `unapproveEdit` (line ~419):

```js
/**
 * Return a discussed/rejected edit to pending for re-review (head-editor
 * manual exit path — mirror of unapproveEdit). Refused when the same editor
 * already has a pending row on the segment: the one-pending invariant would
 * be violated, and that pending row IS the editor's answer to the old one
 * (it supersedes it on save).
 */
function returnEditToPending(editId) {
  const conn = getDb();
  const edit = conn.prepare(`SELECT * FROM segment_edits WHERE id = ?`).get(editId);
  if (!edit) throw new Error('Edit not found');
  if (edit.status !== 'discuss' && edit.status !== 'rejected') {
    throw new Error('Edit is not in discuss/rejected status');
  }
  if (edit.applied_at) throw new Error('Edit has already been applied to files');

  const pending = conn
    .prepare(
      `SELECT id FROM segment_edits
     WHERE book = ? AND module_id = ? AND segment_id = ? AND editor_id = ?
       AND status = 'pending'`
    )
    .get(edit.book, edit.module_id, edit.segment_id, edit.editor_id);
  if (pending) {
    const err = new Error(
      'Ritstjórinn á nýrri breytingu í bið á þessum bút — sú eldri leysist úr gildi við næstu vistun.'
    );
    err.code = 'PENDING_EXISTS';
    throw err;
  }

  conn
    .prepare(
      `UPDATE segment_edits
     SET status = 'pending',
         reviewer_id = NULL,
         reviewer_username = NULL,
         reviewer_note = NULL,
         reviewed_at = NULL
     WHERE id = ?`
    )
    .run(editId);

  return conn.prepare(`SELECT * FROM segment_edits WHERE id = ?`).get(editId);
}
```

Add `returnEditToPending,` to the file's `module.exports`.

`server/services/activityLog.js` — add to `ACTIVITY_TYPES` in the "Segment editor actions" group (after `SEGMENT_EDITS_APPLIED`):

```js
  SEGMENT_EDIT_REOPENED: 'segment_edit_reopened',
```

`server/routes/segment-editor.js`, after the `/edit/:editId/unapprove` route (~line 673), mirroring its structure exactly (same middleware pair, same fire-and-forget log wrapper):

```js
/**
 * POST /edit/:editId/return-to-pending
 * Return a discussed/rejected edit to pending for re-review (manual exit path).
 */
router.post(
  '/edit/:editId/return-to-pending',
  requireAuth,
  requireHeadEditorFor(bookFromEditId),
  (req, res) => {
    try {
      const edit = segmentEditor.returnEditToPending(parseInt(req.params.editId, 10));
      try {
        activityLog.log({
          type: activityLog.ACTIVITY_TYPES.SEGMENT_EDIT_REOPENED,
          userId: String(req.user.id),
          username: req.user.username,
          book: edit.book,
          chapter: edit.chapter,
          section: edit.module_id,
          description: `${req.user.username} opnaði aftur breytingu á ${edit.module_id}:${edit.segment_id}`,
        });
      } catch {
        /* fire-and-forget */
      }
      res.json({ success: true, edit });
    } catch (err) {
      res.status(err.code === 'PENDING_EXISTS' ? 409 : 400).json({ error: err.message });
    }
  }
);
```

(No `notifyDecision` call: reopening puts the row back in the head-editor's own queue; the editor's work is unchanged — nothing to notify. Deliberate, per design.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run server/__tests__/segmentEditorService.test.js server/__tests__/activityLogging.test.js server/__tests__/notifyEditDecision.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/services/segmentEditorService.js server/routes/segment-editor.js server/services/activityLog.js server/__tests__/segmentEditorService.test.js server/__tests__/activityLogging.test.js
git commit -m "feat(editor): returnEditToPending — head-editor manual exit for discuss/rejected

Mirror of unapprove: discuss/rejected → pending with reviewer fields
cleared; 409 (PENDING_EXISTS) when the editor already has a newer pending
row; applied rows refused. Enum-correct SEGMENT_EDIT_REOPENED activity type.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: Apply-site vocabulary + the two `!= 'rejected'` consumers

**Files:**
- Modify: `server/services/segmentEditorService.js` (`:812` apply-supersede SQL; `buildEffectiveSegments` `:197`; `submitModuleForReview` stampEdits `:476`)
- Test: `server/__tests__/segmentEditorService.test.js`

**Interfaces:**
- Consumes: `'superseded'` status (Tasks 1–2 schema).
- Produces: apply marks losing approved rows `'superseded'` (not `'rejected'`); `buildEffectiveSegments` and review-stamping skip `superseded` like `rejected`. Task 6 renders the resulting status.

- [ ] **Step 1: Write the failing tests**

Add to `server/__tests__/segmentEditorService.test.js` (inside/alongside the file's existing apply-path describe, reusing its temp-dir module fixtures — follow the existing apply test setup exactly):

```js
describe("apply-time supersede uses 'superseded' (was mislabelled 'rejected')", () => {
  it('marks the losing approved row superseded, keeps note + applied_at stamp', () => {
    // Arrange two approved edits by the same editor on one segment (the second
    // save supersedes nothing — the first row is approved, which save leaves
    // alone; approval of the second is clean post-039).
    // …use the file's existing apply-path fixture helpers to save→approve twice,
    // then applyApprovedEdits, then:
    const rows = service.getSegmentEditHistory('testbook', 'm00001', '<segmentId>');
    const loser = rows.find((r) => r.status === 'superseded');
    expect(loser).toBeDefined();
    expect(loser.reviewer_note).toBe('Leyst úr gildi af nýrri samþykktri breytingu');
    expect(loser.applied_at).not.toBeNull();
    expect(rows.filter((r) => r.status === 'rejected')).toEqual([]);
  });

  it('apply is clean when the editor also has an old rejected row on the segment (the :812 in-transaction collision)', () => {
    // save → reject → save → approve → apply: pre-039 the apply-supersede
    // UPDATE to 'rejected' collided with the old rejected row inside the
    // apply transaction. Post-039 + 'superseded' it cannot.
    // …drive via the file's fixture helpers; assert applyApprovedEdits resolves
    // without throwing and the faithful file is written.
  });
});

describe("superseded rows are invisible to effective content and review stamping", () => {
  it('buildEffectiveSegments ignores superseded rows (withdraw-after-supersede regression)', () => {
    // save v1 → reject → save v2 (v1 becomes superseded) → withdraw v2 (delete).
    // The baseline must win: a superseded row must never resurface as the
    // "latest non-rejected" edit.
    // …assert buildEffectiveSegments returns the baseline `is` content for the segment.
  });

  it('submitModuleForReview does not stamp superseded rows into the new review', () => {
    // save → reject → save → submitModuleForReview: the superseded row keeps
    // review_id NULL; the fresh pending row is stamped.
  });
});
```

The comment-skeleton bodies above MUST be written out fully against the file's real fixture helpers (module temp dirs, seg IDs) — the implementer writes them following the file's existing apply-path tests; the assertions shown are the required outcomes.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run server/__tests__/segmentEditorService.test.js`
Expected: FAIL — losers are labelled `'rejected'`; the effective-content test sees the superseded row's content override the baseline; stamping stamps it.

- [ ] **Step 3: Implement the three edits**

`segmentEditorService.js:811-813` — the apply-supersede statement becomes:

```js
    const markSuperseded = conn.prepare(
      `UPDATE segment_edits SET status = 'superseded', reviewer_note = 'Leyst úr gildi af nýrri samþykktri breytingu', applied_at = CURRENT_TIMESTAMP WHERE id = ?`
    );
```

(Also update the step-comment above it: `// 6. Mark winning edits as applied; mark losing approved edits as superseded`.)

`buildEffectiveSegments` (`:197`):

```js
    if (e.status === 'rejected' || e.status === 'superseded') continue;
```

`submitModuleForReview` stampEdits (`:476`):

```js
       AND status NOT IN ('rejected', 'superseded')
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run server/__tests__/segmentEditorService.test.js server/__tests__/applyStatusRebuild.test.js server/__tests__/dashboardReadModel.test.js server/__tests__/migration038.test.js`
Expected: PASS (038's review-stamping backfill test unaffected — it exercises the migration, not `submitModuleForReview`).

- [ ] **Step 5: Commit**

```bash
git add server/services/segmentEditorService.js server/__tests__/segmentEditorService.test.js
git commit -m "fix(editor): apply-supersede says 'superseded'; effective-content and review stamping skip it

The apply path labelled auto-superseded approved rows 'rejected' (editors
saw phantom rejections) and could collide with a real rejected row inside
the apply transaction. buildEffectiveSegments and submitModuleForReview
now treat superseded like rejected (resolved history, not live work).

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: Client — superseded badge, re-edit gate, reopen button

**Files:**
- Modify: `server/public/js/ui-strings.js` (`editStatus` map ~line 88; add a tooltip string)
- Modify: `server/public/js/segment-editor.js` (status gate ~`:778`, review-actions block ~`:797-802`)
- Modify: `server/views/segment-editor.html` (`.edit-status.*` CSS block)
- Test: covered by Task 7's static contract test (`clientMessageContracts.test.js` asserts the strings/handlers exist); behavioral coverage is the Playwright suite + the manual-QA note in T8's PR body — there is no jsdom unit infra for `public/js` IIFEs in this repo.

**Interfaces:**
- Consumes: route `POST /api/segment-editor/edit/:editId/return-to-pending` (Task 4), `'superseded'` rows (Tasks 3/5).
- Produces: UI strings `UI.editStatus.superseded`, `UI.tooltips.reopenEdit`; a reopen button rendered for head-editors on `discuss`/`rejected` latest edits.

- [ ] **Step 1: UI strings**

`server/public/js/ui-strings.js` — extend `editStatus` (line ~88):

```js
  editStatus: {
    pending: 'Bíður',
    approved: 'Samþykkt',
    rejected: 'Hafnað',
    discuss: 'Umræða',
    superseded: 'Leyst úr gildi',
  },
```

and add to the `tooltips` map (find it via the existing `UI.tooltips.otherEditor` used at `segment-editor.js:840`):

```js
    reopenEdit: 'Opna aftur til yfirferðar',
```

- [ ] **Step 2: Re-edit gate + reopen button in `segment-editor.js`**

At the gate around line 778 (block starting `latestEdit.status === 'rejected' || latestEdit.status === 'discuss' ||`): add `superseded` alongside them:

```js
      latestEdit.status === 'rejected' ||
      latestEdit.status === 'discuss' ||
      latestEdit.status === 'superseded' ||
```

(Read the surrounding block first and match its exact structure — this is the "editor may write a fresh revision" affordance; a superseded latest edit — reachable after a withdraw — must allow re-editing.)

In the review-actions template block (around lines 797–802, where `isHeadEditor && latestEdit.status === 'pending'` renders the approve/reject/discuss buttons): add a sibling branch rendering the reopen button for stale rows:

```js
            isHeadEditor &&
            (latestEdit.status === 'discuss' || latestEdit.status === 'rejected') &&
            !latestEdit.applied_at
              ? `<button class="btn btn-sm btn-reopen" onclick="reopenEdit(${latestEdit.id})" title="${UI.tooltips.reopenEdit}">&#8634;</button>`
              : ''
```

and add the handler near the existing `reviewEdit` function (match its fetch/reload pattern — find `function reviewEdit` and mirror its post-action refresh exactly):

```js
  async function reopenEdit(editId) {
    try {
      await fetchJson(`/api/segment-editor/edit/${editId}/return-to-pending`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      });
      await loadModule(currentModuleId); // match reviewEdit's actual refresh call
    } catch (err) {
      alert(err.message);
    }
  }
```

Expose it the same way `reviewEdit` is exposed to inline `onclick` (check how the IIFE publishes it — e.g. `window.reviewEdit = reviewEdit;` — and mirror).

- [ ] **Step 3: Badge CSS**

In `server/views/segment-editor.html`, find the `.edit-status.rejected` / `.edit-status.discuss` style rules and add a muted-grey sibling:

```css
      .edit-status.superseded {
        background: var(--badge-muted-bg, #e2e2e2);
        color: var(--badge-muted-fg, #555);
      }
```

(Match the exact declaration style of the neighboring `.edit-status.*` rules — if they use raw hex values without CSS variables, use raw hex `#e2e2e2`/`#555` alone.)

- [ ] **Step 4: Eyeball + focused suite**

Run: `npx vitest run server/__tests__/` — expected all green (no server behavior changed in this task). Load `views/segment-editor.html` changes by reading the diff once more for template-literal syntax errors (the file is inline-script heavy; a stray backtick breaks the page silently).

- [ ] **Step 5: Commit**

```bash
git add server/public/js/ui-strings.js server/public/js/segment-editor.js server/views/segment-editor.html
git commit -m "feat(editor-ui): 'Leyst úr gildi' badge + reopen button for discuss/rejected edits

Superseded rows render as resolved history (muted badge, re-edit allowed);
head-editors get an 'Opna aftur' action on stale discuss/rejected rows,
wired to POST /edit/:id/return-to-pending.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 7: Dropped-message riders — saveRetry order, pipeline 409 handshake, fetchJson error data

**Files:**
- Modify: `server/public/js/htmlUtils.js` (`fetchJson`, lines 34–51)
- Modify: `server/public/js/saveRetry.js` (line 209)
- Modify: `server/routes/pipeline.js` (the three `requiresConfirmation` 409 payloads at lines ~87, ~134, ~181)
- Modify: `server/public/js/segment-editor.js` (`runPipelineAction`, lines ~1692–1726)
- Test: `server/__tests__/clientMessageContracts.test.js` (new — static source contracts, same mechanism as the `notifications.create(` guard in `crossBookAuthz.test.js`)

**Interfaces:**
- Consumes: nothing from other tasks (independent rider; scheduled last-but-one to keep the exit-path arc contiguous).
- Produces: `fetchJson` errors now carry `.status` (number) and `.data` (parsed body or undefined) — available to all callers.

- [ ] **Step 1: Write the failing static contract tests**

Create `server/__tests__/clientMessageContracts.test.js`:

```js
/**
 * Static source contracts for the client message-surfacing fixes (batch 2).
 *
 * There is no jsdom unit infra for the public/js IIFEs, so these pin the
 * source-level contracts the fixes introduced — the same mechanism as the
 * notifications.create( guard in crossBookAuthz.test.js. Behavior rides the
 * Playwright suite.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
import fs from 'fs';

const require = createRequire(import.meta.url);
const read = (p) => fs.readFileSync(require.resolve(p), 'utf8');

describe('saveRetry conflict message order (finding 24)', () => {
  it('reads data.message before data.error', () => {
    const src = read('../public/js/saveRetry.js');
    expect(src).toMatch(/data\.message\s*\|\|\s*data\.error/);
    expect(src).not.toMatch(/new Error\(data\.error \|\|/);
  });
});

describe('fetchJson exposes status + parsed body on thrown errors', () => {
  it('attaches err.status and err.data', () => {
    const src = read('../public/js/htmlUtils.js');
    expect(src).toMatch(/err\.status\s*=\s*res\.status/);
    expect(src).toMatch(/err\.data\s*=/);
  });
});

describe('pipeline confirmation handshake (finding 14)', () => {
  it('server: every requiresConfirmation 409 also carries error + message', () => {
    const src = read('../routes/pipeline.js');
    const blocks = src.split('requiresConfirmation: true').slice(1);
    expect(blocks.length).toBe(3);
    for (const b of blocks) {
      const head = b.slice(0, 400);
      expect(head).toMatch(/error:/);
      expect(head).toMatch(/message:/);
    }
  });

  it('client: runPipelineAction implements confirm-and-resend', () => {
    const src = read('../public/js/segment-editor.js');
    expect(src).toMatch(/requiresConfirmation/);
    expect(src).toMatch(/confirmed:\s*true/);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run server/__tests__/clientMessageContracts.test.js`
Expected: FAIL on all four describes (none of the fixes exist yet).

- [ ] **Step 3: Implement the four fixes**

**`htmlUtils.js` `fetchJson`** — replace the `if (!res.ok)` block (lines 40–49) with:

```js
  if (!res.ok) {
    let msg = 'Villa: HTTP ' + res.status;
    let data;
    try {
      data = await res.json();
      msg = data.error || data.message || msg;
    } catch {
      /* non-JSON error body */
    }
    const err = new Error(msg);
    err.status = res.status;
    err.data = data;
    throw err;
  }
```

Also fix the stale comment above the `fetch` call in the same function: it says "the auth cookie is SameSite=strict" — it is **Lax** since the 2026-07-01 login-loop fix (and must stay Lax); reword to "the auth cookie is SameSite=Lax".

**`saveRetry.js:209`**:

```js
            const err = new Error(data.message || data.error || 'Villa ' + response.status);
```

**`routes/pipeline.js`** — each of the three `requiresConfirmation` 409 payloads (inject ~:87, render ~:134, run ~:181) gains generic fields so ANY client shows real text; keep each route's existing `warning` string verbatim as the `message`:

```js
        return res.status(409).json({
          requiresConfirmation: true,
          error: 'Staðfestingar krafist',
          message:
            'Extraction has not been run for this chapter. Inject may fail without extracted segments.',
          warning:
            'Extraction has not been run for this chapter. Inject may fail without extracted segments.',
        });
```

(Repeat per route with that route's own existing warning text — read each site and duplicate its exact string into `message`. `warning` stays for the handshake contract; `error`/`message` are the generic-fallback fields `fetchJson` reads.)

**`segment-editor.js` `runPipelineAction`** — extend the catch to complete the handshake (mirror of `views/admin.html:1071`):

```js
    } catch (err) {
      if (err.data && err.data.requiresConfirmation) {
        if (window.confirm(err.data.warning || err.message)) {
          try {
            const data = await fetchJson(`/api/pipeline/${action}`, {
              method: 'POST',
              credentials: 'include',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                book: currentBook,
                chapter: currentChapter,
                moduleId: currentModuleId !== 'all' ? currentModuleId : undefined,
                track,
                confirmed: true,
              }),
            });
            pollJobStatus(data.jobId);
            return;
          } catch (retryErr) {
            err = retryErr;
          }
        }
      }
      badge.textContent = UI.common.error;
      badge.className = 'pipeline-status-badge failed';
      output.textContent += `Error: ${err.message}\n`;
      setPipelineButtonsDisabled(false);
    }
```

(`track` is already in scope at the top of `runPipelineAction`; note the original body builds the same payload minus `confirmed` — keep both in sync.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run server/__tests__/clientMessageContracts.test.js server/__tests__/crossBookAuthz.test.js`
Expected: PASS (crossBookAuthz mounts `/api/pipeline` — its inject/render/run cases must be unaffected: they 403/400 before the confirmation branch).

- [ ] **Step 5: Commit**

```bash
git add server/public/js/htmlUtils.js server/public/js/saveRetry.js server/routes/pipeline.js server/public/js/segment-editor.js server/__tests__/clientMessageContracts.test.js
git commit -m "fix(ui): surface dropped server messages — conflict text + pipeline confirmation handshake

saveRetry reads the Icelandic message before the machine code (was: bare
'conflict'). fetchJson errors now carry status + parsed body. The pipeline
prerequisite 409s gain error/message fields, and the segment editor's
pipeline panel finally implements the confirm-and-resend half of the
handshake (pattern: admin.html OpenStax-update flow).

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 8: Full-suite gate, docs, PR

**Files:**
- Modify: `docs/plans/2026-07-12-segment-edit-exit-path-design.md` (amendment section)
- Modify: `docs/plans/2026-07-11-pre-semester-coding-campaign.md` (item 2 → shipped, with PR#)
- Modify (outside repo): project memory (`server-editor-review-2026-07.md`, `MEMORY.md` resume point)

**Interfaces:**
- Consumes: all prior tasks committed; PR number from `gh pr create`.

- [ ] **Step 1: Authoritative gate**

Run (repo root): `npm test`
Expected: full suite green. STOP on any red and report.

- [ ] **Step 2: Design amendment**

Append to `docs/plans/2026-07-12-segment-edit-exit-path-design.md`:

```markdown
## Amendment (2026-07-12, implementation)

Implemented per `docs/plans/2026-07-12-segment-edit-exit-path-plan.md`. Two findings
against this design from planning-time verification: (1) the five status-count
queries need no changes (explicit per-status COUNTs — superseded drops out
automatically), but two consumers the design missed adopted the vocabulary:
`buildEffectiveSegments` (skip superseded like rejected — a withdraw could
otherwise resurface a resolved row's content) and `submitModuleForReview`'s
review-stamping (superseded rows must not join a new review). (2) The test-fixture
audit found all 8 hand-rolled `segment_edits` fixtures omitted the table-level
UNIQUE constraint entirely — the reason this bug class was invisible to the suite;
they now build from one canonical post-039 helper
(`server/__tests__/helpers/segmentEditsSchema.cjs`).
```

- [ ] **Step 3: Push and open the PR**

```bash
git fetch origin
git push -u origin fix/segment-edit-exit-path
gh pr create --title "fix(editor): discuss/rejected exit path (migration 039) + dropped-message surfacing (batch 2)" --body "$(cat <<'EOF'
## Summary
- **Exit path (live-reproduced bug):** migration 039 rebuilds `segment_edits` — the 5-column UNIQUE that made every repeat transition collide (re-discuss surfaced raw SQLite text in a browser alert) becomes a partial unique index on pending rows only, and the status vocabulary gains `'superseded'`.
- **Supersede-on-save:** a new revision by the same editor supersedes their stale discuss/rejected rows (atomic with the insert, reviewer notes preserved) — stranded rows stop blocking review actions and stop inflating "awaiting decision" counts.
- **Manual exit:** head-editors get `POST /edit/:id/return-to-pending` (mirror of unapprove; 409 when a newer pending row exists) with an "Opna aftur" button.
- **Vocabulary honesty:** apply-time supersede now says `'superseded'` (editors saw phantom "rejections"); `buildEffectiveSegments` and review-stamping skip superseded like rejected.
- **Fixture-drift fix:** all 8 hand-rolled segment_edits test fixtures omitted the UNIQUE constraint (why the suite never saw this class); they now share one canonical post-039 schema helper.
- **Dropped messages:** saveRetry shows the Icelandic conflict explanation (was: the word "conflict"); the pipeline prerequisite 409s carry error/message fields and the segment-editor pipeline panel implements the confirm-and-resend handshake (pattern: admin.html).

## Deploy note
Migration 039 is a table rebuild of `segment_edits` — `deploy.sh`'s pre-pull DB backup covers rollback; the migration is guarded + idempotent and gated by the migration-idempotency suite.

## Manual QA (post-deploy, 2 min)
Revise a previously-discussed segment, click discuss again → clean flow, no alert. Reopen a rejected edit → returns to pending. Run inject on a chapter without extraction → confirmation dialog appears and can proceed.

## Test plan
migration039 rebuild-fidelity + idempotency; collision matrix (re-discuss/re-reject/re-approve); supersede scoping + history preservation; returnEditToPending guards; apply-supersede vocabulary + the :812 in-transaction collision regression; effective-content/stamping exclusion; static message contracts. Full `npm test` green.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Note the PR number from the output.

- [ ] **Step 4: Campaign register update (substitute the real PR#)**

In `docs/plans/2026-07-11-pre-semester-coding-campaign.md`, replace item 2's line:

```markdown
2. **Batch 2 — ✅ SHIPPED PR #<PR> (2026-07-12).** `discuss`/`rejected` exit path: migration 039 (partial unique index + `'superseded'`), supersede-on-save, `return-to-pending` route/button, apply-supersede vocabulary fix, fixture-drift fix (8 fixtures → canonical schema helper); dropped messages surfaced (`pipeline.js` confirmation handshake completed client-side, `saveRetry.js:209` message-first, `fetchJson` err.status/err.data). Design+plan: `docs/plans/2026-07-12-segment-edit-exit-path-{design,plan}.md`.
```

If new findings surfaced during implementation, log them in the register per the standing feedback rule. Commit both docs + push:

```bash
git add docs/plans/2026-07-11-pre-semester-coding-campaign.md docs/plans/2026-07-12-segment-edit-exit-path-design.md docs/plans/2026-07-12-segment-edit-exit-path-plan.md
git commit -m "docs: batch 2 shipped — register + design amendment

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
git push
```

- [ ] **Step 5: Memory update (outside repo)**

- `server-editor-review-2026-07.md`: batch-2 shipped section (PR#, migration-039 rebuild, fixture-drift lesson — hand-rolled fixtures hid the constraint class; canonical helper now exists for segment_edits).
- `MEMORY.md` ACTIVE RESUME: batch 2 → shipped; **▶ RESUME = batch 4 (fail-loud sweep)** per campaign ordering.

- [ ] **Step 6: Report to the lead**

PR link, the two design-amendment findings, the fixture-drift discovery, deploy note (migration rebuild + backup), manual-QA one-liner. Merge is the lead's call.

---

## Self-Review (performed at plan-writing time)

1. **Spec coverage:** design D1 → T1; D2 supersede-on-save → T3, return-to-pending → T4, apply vocabulary → T5; D3 consumers → T5 (queries verified no-change; two extra consumers found and covered) + T6 (badge/CSS/labels/gates); D4 riders → T7 (incl. fetchJson enabler the design implied); D5 testing → per-task TDD + T2 fixture-fidelity + T8 gate. Fixture-drift work (T2) is additive to the design — recorded in the T8 amendment.
2. **Placeholder scan:** T5 Step 1 contains two comment-skeleton test bodies with explicit required assertions — deliberately bound to "follow the file's existing apply-path fixture helpers" because those helpers' exact call shapes are file-internal; the required outcomes are fully specified. No TBDs elsewhere; the PR number is the only substitution (unknowable pre-create).
3. **Type consistency:** `createSegmentEditsSchema(db)` (T2) matches T2's helper export and T3–T5 usage; `returnEditToPending(editId)` consistent between T4 service/route and T6 button endpoint (`/return-to-pending`); `SEGMENT_EDIT_REOPENED` enum name consistent T4↔activityLogging pin; `err.data`/`err.status` (T7 fetchJson) match `runPipelineAction`'s usage; index/status names identical across T1 migration, T1 test, and T2 helper.
