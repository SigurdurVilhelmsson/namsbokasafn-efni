# Item 13 — Concurrent-Edit Lost Updates — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One canonical "newest saved content wins" rule for concurrent edits: per-editor localization pending rows (finding 7), stale save-retry cancellation (finding 8), convergent preview/publish winner selection (I12-R5), plus approve-time guards.

**Architecture:** New shared comparator `server/lib/editRecency.js` consumed by both editorial services; migration 041 rebuilds `localization_pending_edits` (039 pattern) for per-editor pendings + `'superseded'`; `applyApprovedEdits` becomes convergent (winners across ALL approved rows); `saveRetry.js` becomes a UMD factory with injectable deps so the queue finally gets behavioral tests.

**Tech Stack:** Node 22 / CommonJS in `server/`, better-sqlite3 (synchronous), Vitest (run `npm test` from repo root), Express 5.

**Spec:** `docs/superpowers/specs/2026-07-17-item13-concurrent-edit-design.md` (approved 2026-07-17).

## Global Constraints

- Branch: `fix/item13-concurrent-edit-lost-updates`; one PR; `npm test` from repo root is the authoritative gate (no branch protection — local green is the proof).
- `server/` is CommonJS; tests are ESM Vitest files using `createRequire`.
- Editor-facing strings are Icelandic (tool = "Ritill", reviewer = "Yfirlesari" conventions).
- Migrations: idempotent, registered in the HARDCODED list in `server/services/migrationRunner.js` (no auto-discovery); table rebuilds follow migration 039's transactional pattern with explicit column lists (never `SELECT *`).
- Never resolve paths via `process.cwd()` (server cwd is `server/`).
- `editor_id` is stored as TEXT — always bind `String(editorId)` in localization service SQL.
- Keep these exact source strings in `saveRetry.js` (static pins in `clientMessageContracts.test.js` depend on them): `data.message || data.error`, the `// Non-retryable` comment marker, the two-argument `response.json().then(function …, function …)` form with no `.catch(` inside that block, and the outer `.catch(function (err) {`.
- No book-content files are touched by this PR (server/client/migration code + docs only).

---

### Task 1: Shared recency comparator `server/lib/editRecency.js`

**Files:**
- Create: `server/lib/editRecency.js`
- Test: `server/__tests__/editRecency.test.js`

**Interfaces:**
- Produces: `isNewer(a, b) -> boolean` — edit `a` strictly newer than `b` by `(created_at, id)`; `pickLatest(edits) -> edit|null`. Edits are rows with `created_at` (SQLite TEXT `YYYY-MM-DD HH:MM:SS`) and `id` (number). Consumed by Tasks 4, 6, 7, 8.

- [ ] **Step 1: Write the failing test**

```js
// server/__tests__/editRecency.test.js
/**
 * Canonical "newest saved content wins" comparator (item 13, Part 0).
 * One rule for preview, apply, and both approve guards. created_at is
 * SQLite CURRENT_TIMESTAMP TEXT (lexicographic == chronological); id
 * breaks same-second ties. id order alone is NOT recency: in-place
 * re-saves refresh created_at but keep the row id.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { isNewer, pickLatest } = require('../lib/editRecency');

const e = (id, createdAt) => ({ id, created_at: createdAt });

describe('editRecency.isNewer', () => {
  it('later created_at wins regardless of id (in-place re-save case)', () => {
    expect(isNewer(e(1, '2026-07-17 10:05:00'), e(2, '2026-07-17 10:03:00'))).toBe(true);
    expect(isNewer(e(2, '2026-07-17 10:03:00'), e(1, '2026-07-17 10:05:00'))).toBe(false);
  });

  it('same-second tie falls back to higher id (F15 convention)', () => {
    expect(isNewer(e(2, '2026-07-17 12:00:00'), e(1, '2026-07-17 12:00:00'))).toBe(true);
    expect(isNewer(e(1, '2026-07-17 12:00:00'), e(2, '2026-07-17 12:00:00'))).toBe(false);
  });

  it('is a strict order: an edit is never newer than itself', () => {
    expect(isNewer(e(1, '2026-07-17 12:00:00'), e(1, '2026-07-17 12:00:00'))).toBe(false);
  });

  it('tolerates missing created_at (treated as oldest)', () => {
    expect(isNewer(e(2, '2026-07-17 12:00:00'), e(1, null))).toBe(true);
    expect(isNewer(e(1, null), e(2, '2026-07-17 12:00:00'))).toBe(false);
  });
});

describe('editRecency.pickLatest', () => {
  it('returns the newest of a list', () => {
    const winner = pickLatest([
      e(3, '2026-07-17 10:00:00'),
      e(1, '2026-07-17 10:05:00'),
      e(2, '2026-07-17 10:00:00'),
    ]);
    expect(winner.id).toBe(1);
  });

  it('returns null for an empty list', () => {
    expect(pickLatest([])).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run server/__tests__/editRecency.test.js` (from repo root)
Expected: FAIL — `Cannot find module '../lib/editRecency'`

- [ ] **Step 3: Write the implementation**

```js
// server/lib/editRecency.js
/**
 * Canonical edit-recency comparator (item 13, Part 0).
 *
 * ONE rule for "which edit wins a segment", shared by Pass-1 preview
 * (buildEffectiveSegments), Pass-1 apply (applyApprovedEdits), the Pass-1
 * approve guard, and the localization approve guard. Newest created_at wins;
 * id breaks same-second ties (CURRENT_TIMESTAMP is 1s-granular).
 *
 * Why not id alone: saves UPDATE pending rows in place (created_at refreshes,
 * id doesn't), so the highest id is creation order, not content recency.
 * Lives in lib/ because segmentEditorService and localizationReviewService
 * both consume it and must not import each other.
 */

/**
 * @param {{id: number, created_at: string|null}} a
 * @param {{id: number, created_at: string|null}} b
 * @returns {boolean} true when a is strictly newer than b
 */
function isNewer(a, b) {
  const ta = a.created_at || '';
  const tb = b.created_at || '';
  // SQLite CURRENT_TIMESTAMP TEXT ('YYYY-MM-DD HH:MM:SS'): lexicographic
  // comparison IS chronological comparison.
  if (ta !== tb) return ta > tb;
  return a.id > b.id;
}

/**
 * @param {Array<{id: number, created_at: string|null}>} edits
 * @returns {object|null} the newest edit, or null for an empty list
 */
function pickLatest(edits) {
  let latest = null;
  for (const e of edits) {
    if (!latest || isNewer(e, latest)) latest = e;
  }
  return latest;
}

module.exports = { isNewer, pickLatest };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run server/__tests__/editRecency.test.js`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add server/lib/editRecency.js server/__tests__/editRecency.test.js
git commit -m "feat(item13): shared edit-recency comparator (newest saved wins)"
```

---

### Task 2: Migration 041 — localization per-editor pendings

**Files:**
- Create: `server/migrations/041-localization-pending-per-editor.js`
- Modify: `server/services/migrationRunner.js` (append to the hardcoded list after the `040-service-table-ownership` line)
- Test: `server/__tests__/migration041.test.js`

**Interfaces:**
- Produces: rebuilt `localization_pending_edits` with status CHECK `('pending','approved','rejected','superseded')` and partial unique index `idx_loc_pending_one_per_editor` on `(book, module_id, segment_id, editor_id) WHERE status='pending'`. Tasks 3–5 depend on this schema.

- [ ] **Step 1: Write the failing test**

```js
// server/__tests__/migration041.test.js
/**
 * Migration 041: localization_pending_edits rebuild (item 13, finding 7).
 * 'superseded' joins the status CHECK; the one-pending invariant becomes
 * per-(book, module, segment, EDITOR) via a partial unique index — two
 * editors may each hold a pending on the same segment; one editor may not
 * hold two. 039-pattern transactional rebuild; idempotent re-run.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const Database = require('better-sqlite3');
const m034 = require('../migrations/034-localization-review');
const m041 = require('../migrations/041-localization-pending-per-editor');

const INSERT = `INSERT INTO localization_pending_edits
  (book, chapter, module_id, segment_id, original_content, edited_content,
   status, editor_id, editor_username)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`;

describe('migration 041', () => {
  let db;

  beforeEach(() => {
    db = new Database(':memory:');
    m034.up(db);
  });

  afterEach(() => db.close());

  it('preserves legacy rows across the rebuild', () => {
    db.prepare(INSERT).run('b', 1, 'm1', 's1', 'o', 'e1', 'pending', '4', 'editorA');
    db.prepare(INSERT).run('b', 1, 'm1', 's2', 'o', 'e2', 'approved', '4', 'editorA');
    db.prepare(INSERT).run('b', 1, 'm1', 's3', 'o', 'e3', 'rejected', '4', 'editorA');

    m041.up(db);

    const rows = db
      .prepare(`SELECT segment_id, status, edited_content FROM localization_pending_edits ORDER BY id`)
      .all();
    expect(rows).toEqual([
      { segment_id: 's1', status: 'pending', edited_content: 'e1' },
      { segment_id: 's2', status: 'approved', edited_content: 'e2' },
      { segment_id: 's3', status: 'rejected', edited_content: 'e3' },
    ]);
  });

  it("accepts 'superseded' after the rebuild (CHECK rebuilt)", () => {
    m041.up(db);
    expect(() =>
      db.prepare(INSERT).run('b', 1, 'm1', 's1', 'o', 'e', 'superseded', '4', 'editorA')
    ).not.toThrow();
  });

  it('unique index: one pending per editor per segment; two editors may coexist', () => {
    m041.up(db);
    db.prepare(INSERT).run('b', 1, 'm1', 's1', 'o', 'eA', 'pending', '4', 'editorA');
    // different editor, same segment: allowed
    expect(() =>
      db.prepare(INSERT).run('b', 1, 'm1', 's1', 'o', 'eB', 'pending', '5', 'editorB')
    ).not.toThrow();
    // same editor, same segment, second pending: blocked
    expect(() =>
      db.prepare(INSERT).run('b', 1, 'm1', 's1', 'o', 'eA2', 'pending', '4', 'editorA')
    ).toThrow(/UNIQUE/);
    // non-pending statuses never collide
    expect(() =>
      db.prepare(INSERT).run('b', 1, 'm1', 's1', 'o', 'eA3', 'superseded', '4', 'editorA')
    ).not.toThrow();
  });

  it('re-run is a no-op (idempotent)', () => {
    db.prepare(INSERT).run('b', 1, 'm1', 's1', 'o', 'e1', 'pending', '4', 'editorA');
    m041.up(db);
    m041.up(db);
    expect(db.prepare(`SELECT COUNT(*) AS n FROM localization_pending_edits`).get().n).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run server/__tests__/migration041.test.js`
Expected: FAIL — `Cannot find module '../migrations/041-localization-pending-per-editor'`

- [ ] **Step 3: Write the migration**

```js
// server/migrations/041-localization-pending-per-editor.js
/**
 * Migration 041: localization_pending_edits — per-editor pendings +
 * 'superseded' (item 13, finding 7).
 *
 * The 034 table kept one pending per (book, module, segment) by service-level
 * lookup only, so a second editor's submit silently overwrote the first
 * editor's pending row (content AND author). Pass-1 parity: each editor owns
 * their pending row, enforced by a partial unique index; 'superseded' joins
 * the status vocabulary so a losing pending resolves as history, not as a
 * bogus rejection.
 *
 * SQLite cannot alter a CHECK constraint → table rebuild inside one
 * db.transaction() (pattern: migration 039 — a crash at any point rolls back
 * to the intact pre-041 table). Explicit column list in the copy INSERT.
 * Idempotent: guarded on 'superseded' being absent from the current CHECK.
 * The unique index cannot fail on legacy data: pre-041 code kept at most one
 * pending per segment overall, which is strictly tighter.
 */

module.exports = {
  name: '041-localization-pending-per-editor',

  up(db) {
    const tableInfo = db
      .prepare(
        `SELECT sql FROM sqlite_master WHERE type='table' AND name='localization_pending_edits'`
      )
      .get();

    if (!tableInfo) return;
    if (tableInfo.sql.includes("'superseded'")) return; // already rebuilt

    const rebuild = db.transaction(() => {
      db.exec(`
      DROP TABLE IF EXISTS localization_pending_edits_new;

      CREATE TABLE localization_pending_edits_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        book TEXT NOT NULL,
        chapter INTEGER NOT NULL,
        module_id TEXT NOT NULL,
        segment_id TEXT NOT NULL,
        original_content TEXT NOT NULL,
        edited_content TEXT NOT NULL,
        category TEXT,
        status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN (
          'pending', 'approved', 'rejected', 'superseded'
        )),
        editor_id TEXT NOT NULL,
        editor_username TEXT NOT NULL,
        reviewer_id TEXT,
        reviewer_username TEXT,
        reviewer_note TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        reviewed_at DATETIME,
        applied_at DATETIME
      );

      INSERT INTO localization_pending_edits_new (
        id, book, chapter, module_id, segment_id, original_content,
        edited_content, category, status, editor_id, editor_username,
        reviewer_id, reviewer_username, reviewer_note, created_at,
        reviewed_at, applied_at
      )
      SELECT
        id, book, chapter, module_id, segment_id, original_content,
        edited_content, category, status, editor_id, editor_username,
        reviewer_id, reviewer_username, reviewer_note, created_at,
        reviewed_at, applied_at
      FROM localization_pending_edits;

      DROP TABLE localization_pending_edits;

      ALTER TABLE localization_pending_edits_new RENAME TO localization_pending_edits;

      CREATE UNIQUE INDEX IF NOT EXISTS idx_loc_pending_one_per_editor
        ON localization_pending_edits(book, module_id, segment_id, editor_id)
        WHERE status = 'pending';

      CREATE INDEX IF NOT EXISTS idx_loc_pending_module
        ON localization_pending_edits(book, module_id);
      CREATE INDEX IF NOT EXISTS idx_loc_pending_status
        ON localization_pending_edits(status);
      CREATE INDEX IF NOT EXISTS idx_loc_pending_segment
        ON localization_pending_edits(book, module_id, segment_id);
    `);
    });
    rebuild();
  },
};
```

- [ ] **Step 4: Register in the migration runner**

In `server/services/migrationRunner.js`, directly after the line
`require('../migrations/040-service-table-ownership'),` add:

```js
    require('../migrations/041-localization-pending-per-editor'),
```

- [ ] **Step 5: Run tests**

Run: `npx vitest run server/__tests__/migration041.test.js server/__tests__/migrationIdempotency.test.js server/__tests__/startup.test.js`
Expected: PASS (041 unit cases; the idempotency harness re-runs ALL registered migrations including 041; startup count expectations — if `startup.test.js` pins a migration count, update that pin in the same commit).

- [ ] **Step 6: Commit**

```bash
git add server/migrations/041-localization-pending-per-editor.js server/services/migrationRunner.js server/__tests__/migration041.test.js
git commit -m "feat(item13): migration 041 — loc pendings per editor + superseded status"
```

---

### Task 3: `submitEdit` per-editor scoping

**Files:**
- Modify: `server/services/localizationReviewService.js:92-97` (the pending lookup)
- Test: `server/__tests__/localizationReviewService.test.js` (update harness to run 034+041; add cross-editor cases)

**Interfaces:**
- Consumes: migration 041 schema (Task 2).
- Produces: `submitEdit({... editorId ...})` upserts per `(book, module, segment, editor)`; cross-editor submits create separate rows. Tasks 4–5 rely on multiple pendings per segment existing.

- [ ] **Step 1: Update the test harness schema (fixture-drift rule: fixtures must match the canonical post-041 schema)**

In `server/__tests__/localizationReviewService.test.js`, after the existing
`const migration = require('../migrations/034-localization-review');` add:

```js
const migration041 = require('../migrations/041-localization-pending-per-editor');
```

and in `beforeEach`, after `migration.up(db);` add:

```js
    migration041.up(db); // canonical schema: per-editor pendings + 'superseded'
```

- [ ] **Step 2: Write the failing test (append inside the top-level describe)**

```js
  it('cross-editor submit preserves both pending rows (finding 7)', () => {
    review.submitEdit({
      book: BOOK,
      chapter: CHAPTER,
      moduleId: MODULE,
      segmentId: SEG('fs-id001'),
      originalContent: 'Hrein fs-id001',
      editedContent: 'Útgáfa ritstjóra A',
      editorId: 4,
      editorUsername: 'editorA',
    });
    const second = review.submitEdit({
      book: BOOK,
      chapter: CHAPTER,
      moduleId: MODULE,
      segmentId: SEG('fs-id001'),
      originalContent: 'Hrein fs-id001',
      editedContent: 'Útgáfa ritstjóra B',
      editorId: 5,
      editorUsername: 'editorB',
    });

    expect(second.updated).toBe(false); // B got their OWN row, not A's
    const pending = review.getPendingByModule(BOOK, MODULE);
    expect(pending).toHaveLength(2);
    const byEditor = Object.fromEntries(pending.map((p) => [p.editor_username, p]));
    expect(byEditor.editorA.edited_content).toBe('Útgáfa ritstjóra A');
    expect(byEditor.editorB.edited_content).toBe('Útgáfa ritstjóra B');
  });

  it('same-editor re-submit still updates in place after per-editor scoping', () => {
    const first = review.submitEdit({
      book: BOOK,
      chapter: CHAPTER,
      moduleId: MODULE,
      segmentId: SEG('fs-id001'),
      originalContent: 'Hrein fs-id001',
      editedContent: 'v1',
      editorId: 4,
      editorUsername: 'editorA',
    });
    const second = review.submitEdit({
      book: BOOK,
      chapter: CHAPTER,
      moduleId: MODULE,
      segmentId: SEG('fs-id001'),
      originalContent: 'Hrein fs-id001',
      editedContent: 'v2',
      editorId: 4,
      editorUsername: 'editorA',
    });
    expect(second.id).toBe(first.id);
    expect(second.updated).toBe(true);
    expect(review.getPendingByModule(BOOK, MODULE)).toHaveLength(1);
  });
```

- [ ] **Step 3: Run test to verify the cross-editor case fails**

Run: `npx vitest run server/__tests__/localizationReviewService.test.js`
Expected: FAIL — `cross-editor submit preserves both pending rows` gets `updated: true` / length 1 (the overwrite bug). All pre-existing cases must still PASS (same-editor upsert is unchanged behavior).

- [ ] **Step 4: Implement the scoping**

In `server/services/localizationReviewService.js`, replace the lookup (lines 92-97):

```js
  const conn = getDb();
  const existing = conn
    .prepare(
      `SELECT id FROM localization_pending_edits
       WHERE book = ? AND module_id = ? AND segment_id = ?
         AND editor_id = ? AND status = 'pending'`
    )
    .get(book, moduleId, segmentId, String(editorId));
```

(Only the SQL and the `.get(...)` binding change; the UPDATE/INSERT branches stay as they are.)

Also update the function's doc comment (lines 75-79) to:

```js
/**
 * Submit a proposed localized segment for review. Keeps one open (pending)
 * edit per segment PER EDITOR (post-041): a re-submit by the same editor
 * updates their pending row in place; a different editor's submit creates
 * their own row — it can no longer overwrite someone else's pending work
 * (finding 7). The partial unique index idx_loc_pending_one_per_editor
 * backs the invariant.
 */
```

- [ ] **Step 5: Run tests**

Run: `npx vitest run server/__tests__/localizationReviewService.test.js`
Expected: PASS (all, including both new cases)

- [ ] **Step 6: Commit**

```bash
git add server/services/localizationReviewService.js server/__tests__/localizationReviewService.test.js
git commit -m "fix(item13): scope loc pending-edit upsert by editor (finding 7)"
```

---

### Task 4: `approveAndApply` — newer-pending guard + supersede-on-approve

**Files:**
- Modify: `server/services/localizationReviewService.js` (top require + `approveAndApply`)
- Test: `server/__tests__/localizationReviewService.test.js` (append cases)

**Interfaces:**
- Consumes: `isNewer` from `server/lib/editRecency` (Task 1); per-editor rows (Task 3).
- Produces: `approveAndApply` throws `err.code === 'PENDING_EXISTS'` when a newer pending exists on the segment; on success it flips all older pendings on the segment to `'superseded'`. Task 5's route mapping depends on the `PENDING_EXISTS` code.

- [ ] **Step 1: Write the failing tests (append inside the top-level describe)**

```js
  it('approve refuses (PENDING_EXISTS) when a newer pending exists on the segment', () => {
    const older = review.submitEdit({
      book: BOOK,
      chapter: CHAPTER,
      moduleId: MODULE,
      segmentId: SEG('fs-id001'),
      originalContent: 'Hrein fs-id001',
      editedContent: 'Eldri útgáfa',
      editorId: 4,
      editorUsername: 'editorA',
    });
    const newer = review.submitEdit({
      book: BOOK,
      chapter: CHAPTER,
      moduleId: MODULE,
      segmentId: SEG('fs-id001'),
      originalContent: 'Hrein fs-id001',
      editedContent: 'Nýrri útgáfa',
      editorId: 5,
      editorUsername: 'editorB',
    });
    // Force a deterministic cross-second recency inversion-proof ordering
    // (CURRENT_TIMESTAMP is 1s-granular; same trick as the F15 test).
    db.prepare(`UPDATE localization_pending_edits SET created_at = '2026-07-17 10:00:00' WHERE id = ?`).run(older.id);
    db.prepare(`UPDATE localization_pending_edits SET created_at = '2026-07-17 10:00:05' WHERE id = ?`).run(newer.id);

    let err;
    try {
      review.approveAndApply(older.id, 2, 'headX', null);
    } catch (e) {
      err = e;
    }
    expect(err).toBeTruthy();
    expect(err.code).toBe('PENDING_EXISTS');
    // Nothing changed: both rows still pending, no file write for this segment.
    expect(review.getPendingByModule(BOOK, MODULE)).toHaveLength(2);
  });

  it('approving the newest pending supersedes older pendings on the segment', () => {
    const older = review.submitEdit({
      book: BOOK,
      chapter: CHAPTER,
      moduleId: MODULE,
      segmentId: SEG('fs-id001'),
      originalContent: 'Hrein fs-id001',
      editedContent: 'Eldri útgáfa',
      editorId: 4,
      editorUsername: 'editorA',
    });
    const newer = review.submitEdit({
      book: BOOK,
      chapter: CHAPTER,
      moduleId: MODULE,
      segmentId: SEG('fs-id001'),
      originalContent: 'Hrein fs-id001',
      editedContent: 'Nýrri útgáfa',
      editorId: 5,
      editorUsername: 'editorB',
    });
    db.prepare(`UPDATE localization_pending_edits SET created_at = '2026-07-17 10:00:00' WHERE id = ?`).run(older.id);
    db.prepare(`UPDATE localization_pending_edits SET created_at = '2026-07-17 10:00:05' WHERE id = ?`).run(newer.id);

    const { edit } = review.approveAndApply(newer.id, 2, 'headX', null);
    expect(edit.status).toBe('approved');
    expect(readLocalized(booksDir)[SEG('fs-id001')]).toBe('Nýrri útgáfa');

    const olderRow = review.getEditById(older.id);
    expect(olderRow.status).toBe('superseded');
    expect(olderRow.reviewer_note).toBe('Leyst úr gildi af nýrri samþykktri breytingu');
    expect(olderRow.reviewer_username).toBe('headX');
    expect(review.getPendingByModule(BOOK, MODULE)).toHaveLength(0);
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run server/__tests__/localizationReviewService.test.js`
Expected: FAIL — first new case approves without error; second leaves the older row `'pending'`.

- [ ] **Step 3: Implement guard + supersede**

In `server/services/localizationReviewService.js`, add to the requires at the top:

```js
const { isNewer } = require('../lib/editRecency');
```

In `approveAndApply`, after the `if (edit.status !== 'pending') throw ...` line and BEFORE the file write, insert:

```js
  // Item 13 guard: resolve newest-first. If another editor's pending on this
  // segment is newer, approving THIS one would either publish stale content
  // or immediately lose to the newer row — refuse with the Pass-1 idiom.
  const siblingPendings = conn
    .prepare(
      `SELECT id, created_at FROM localization_pending_edits
       WHERE book = ? AND module_id = ? AND segment_id = ?
         AND status = 'pending' AND id != ?`
    )
    .all(edit.book, edit.module_id, edit.segment_id, editId);
  if (siblingPendings.some((s) => isNewer(s, edit))) {
    const err = new Error(
      'Nýrri breyting í bið er til á þessum bút — farið yfir hana í staðinn.'
    );
    err.code = 'PENDING_EXISTS';
    throw err;
  }
```

Then extend the existing post-write transaction (the `conn.transaction(() => { ... })()` that marks approved+applied) so it ALSO supersedes the older pendings — the full transaction becomes:

```js
  // 2. Mark approved + applied, and supersede the (strictly older — the guard
  // above proved none is newer) sibling pendings, atomically. The losing
  // editor's work becomes history, not a bogus rejection and not a stuck
  // queue item (item 13, Pass-1 parity).
  conn.transaction(() => {
    conn
      .prepare(
        `UPDATE localization_pending_edits
         SET status = 'approved', reviewer_id = ?, reviewer_username = ?,
             reviewer_note = ?, reviewed_at = CURRENT_TIMESTAMP,
             applied_at = CURRENT_TIMESTAMP
         WHERE id = ?`
      )
      .run(String(reviewerId), reviewerUsername, reviewerNote || null, editId);

    conn
      .prepare(
        `UPDATE localization_pending_edits
         SET status = 'superseded', reviewer_id = ?, reviewer_username = ?,
             reviewer_note = 'Leyst úr gildi af nýrri samþykktri breytingu',
             reviewed_at = CURRENT_TIMESTAMP
         WHERE book = ? AND module_id = ? AND segment_id = ?
           AND status = 'pending' AND id != ?`
      )
      .run(String(reviewerId), reviewerUsername, edit.book, edit.module_id, edit.segment_id, editId);
  })();
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run server/__tests__/localizationReviewService.test.js`
Expected: PASS (all)

- [ ] **Step 5: Commit**

```bash
git add server/services/localizationReviewService.js server/__tests__/localizationReviewService.test.js
git commit -m "fix(item13): loc approve — newest-first guard + supersede older pendings"
```

---

### Task 5: Localization approve route — 409 mapping

**Files:**
- Modify: `server/routes/localization-editor.js` (the `POST /loc-edit/:editId/approve` catch block, ~line 164-167)
- Test: `server/__tests__/locApproveConflict.test.js` (new)

**Interfaces:**
- Consumes: `PENDING_EXISTS` coded error from Task 4.
- Produces: HTTP 409 `{ error: <Icelandic message> }` on that code; 404 'not found' and generic 400 unchanged.

- [ ] **Step 1: Write the failing route test**

The harness follows `localizationSaveBackstop.test.js`'s idiom exactly: env before requires, `runAllMigrations()` against a temp `SESSIONS_DB_PATH`, extract the route's last handler from the router stack, invoke with a fake req/res. The fixture book mirrors the service test's layout.

```js
// server/__tests__/locApproveConflict.test.js
/**
 * Route-level 409 mapping for the loc approve newest-first guard (item 13).
 * PENDING_EXISTS -> 409; 'not found' -> 404 stays; generic errors -> 400 stay.
 * Harness idiom: localizationSaveBackstop.test.js (handler extracted from the
 * router stack, invoked with fake req/res).
 */
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

const work = mkdtempSync(path.join(tmpdir(), 'loc-approve-409-'));
process.env.SESSIONS_DB_PATH = path.join(work, 'sessions.db');
process.env.JWT_SECRET = process.env.JWT_SECRET || 'prufa-leyndarmal';

const BOOK = 'synthetic-loc-approve-book';
const MODULE = 'mLOCA01';
const SEG = `${MODULE}:para:seg1`;

let approveHandler;
let review;
let segmentParser;
let realBooksDir;
let synRoot;

function invoke(handler, req) {
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
  return Promise.resolve(handler(req, res)).then(() => done);
}

beforeAll(() => {
  const { runAllMigrations } = require('../services/migrationRunner');
  runAllMigrations();

  segmentParser = require('../services/segmentParser');
  realBooksDir = segmentParser.BOOKS_DIR;
  synRoot = mkdtempSync(path.join(tmpdir(), 'loc-approve-syn-'));
  const bookDir = path.join(synRoot, BOOK);
  mkdirSync(path.join(bookDir, '02-for-mt', 'ch01'), { recursive: true });
  mkdirSync(path.join(bookDir, '03-faithful-translation', 'ch01'), { recursive: true });
  writeFileSync(
    path.join(bookDir, '02-for-mt', 'ch01', `${MODULE}-segments.en.md`),
    `<!-- SEG:${SEG} -->\nEN text\n`
  );
  writeFileSync(
    path.join(bookDir, '03-faithful-translation', 'ch01', `${MODULE}-segments.is.md`),
    `<!-- SEG:${SEG} -->\nHrein þýðing\n`
  );
  segmentParser._setTestBooksDir(synRoot);

  review = require('../services/localizationReviewService');

  const router = require('../routes/localization-editor');
  const layer = router.stack.find(
    (l) => l.route && l.route.path === '/loc-edit/:editId/approve' && l.route.methods.post
  );
  approveHandler = layer.route.stack[layer.route.stack.length - 1].handle;
});

afterAll(() => {
  segmentParser._setTestBooksDir(realBooksDir);
  rmSync(synRoot, { recursive: true, force: true });
  rmSync(work, { recursive: true, force: true });
});

describe('POST /loc-edit/:editId/approve conflict mapping', () => {
  it('maps PENDING_EXISTS to 409 with the Icelandic message', async () => {
    const older = review.submitEdit({
      book: BOOK,
      chapter: 1,
      moduleId: MODULE,
      segmentId: SEG,
      originalContent: 'Hrein þýðing',
      editedContent: 'Eldri',
      editorId: 4,
      editorUsername: 'editorA',
    });
    const newer = review.submitEdit({
      book: BOOK,
      chapter: 1,
      moduleId: MODULE,
      segmentId: SEG,
      originalContent: 'Hrein þýðing',
      editedContent: 'Nýrri',
      editorId: 5,
      editorUsername: 'editorB',
    });
    const Database = require('better-sqlite3');
    const db = new Database(process.env.SESSIONS_DB_PATH);
    db.prepare(`UPDATE localization_pending_edits SET created_at = '2026-07-17 10:00:00' WHERE id = ?`).run(older.id);
    db.prepare(`UPDATE localization_pending_edits SET created_at = '2026-07-17 10:00:05' WHERE id = ?`).run(newer.id);
    db.close();

    const { status, body } = await invoke(approveHandler, {
      params: { editId: String(older.id) },
      user: { id: 2, username: 'headX', role: 'head_editor', books: [BOOK] },
      body: {},
    });
    expect(status).toBe(409);
    expect(body.error).toMatch(/Nýrri breyting í bið/);
  });

  it('keeps 404 for a missing edit', async () => {
    const { status } = await invoke(approveHandler, {
      params: { editId: '999999' },
      user: { id: 2, username: 'headX', role: 'head_editor', books: [BOOK] },
      body: {},
    });
    expect(status).toBe(404);
  });
});
```

- [ ] **Step 2: Run test to verify the 409 case fails**

Run: `npx vitest run server/__tests__/locApproveConflict.test.js`
Expected: FAIL — status 400 (route maps everything non-'not found' to 400 today). The 404 case already passes.

- [ ] **Step 3: Implement the mapping**

In `server/routes/localization-editor.js`, in the approve route's catch block, replace:

```js
    } catch (err) {
      const status = err.message.includes('not found') ? 404 : 400;
      res.status(status).json({ error: err.message });
    }
```

with:

```js
    } catch (err) {
      const status =
        err.code === 'PENDING_EXISTS' ? 409 : err.message.includes('not found') ? 404 : 400;
      res.status(status).json({ error: err.message });
    }
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run server/__tests__/locApproveConflict.test.js server/__tests__/localizationSaveBackstop.test.js`
Expected: PASS (both files)

- [ ] **Step 5: Commit**

```bash
git add server/routes/localization-editor.js server/__tests__/locApproveConflict.test.js
git commit -m "fix(item13): loc approve route maps PENDING_EXISTS to 409"
```

---

### Task 6: `buildEffectiveSegments` — shared comparator + honest docstring

**Files:**
- Modify: `server/services/segmentEditorService.js` (requires + `buildEffectiveSegments`, lines ~245-264)
- Test: `server/__tests__/segmentEditorService.test.js` (append case)

**Interfaces:**
- Consumes: `isNewer` from `server/lib/editRecency`.
- Produces: preview winner per segment = newest by `(created_at, id)`. Task 7 aligns apply to the identical rule.

- [ ] **Step 1: Write the failing test**

Append inside `segmentEditorService.test.js` (same describe level as the F15 test; reuse the file's existing setup helpers — it already creates two editors' edits and a module fixture; follow the surrounding tests' exact save/approve helper idioms):

```js
  it('preview winner: in-place re-save (older id, newer created_at) wins (item 13)', () => {
    // editor-1 saves first (row id A), editor-2 saves second (row id B > A),
    // then editor-1's row is refreshed in place — newest CONTENT, lowest id.
    const a = service.saveSegmentEdit({
      book: 'testbook', chapter: 1, moduleId: 'm00001',
      segmentId: 'm00001:para:fs-id001',
      originalContent: 'MT texti', editedContent: 'Útgáfa A v1',
      editorId: 'editor-1', editorUsername: 'ritstjoriA',
    });
    const b = service.saveSegmentEdit({
      book: 'testbook', chapter: 1, moduleId: 'm00001',
      segmentId: 'm00001:para:fs-id001',
      originalContent: 'MT texti', editedContent: 'Útgáfa B',
      editorId: 'editor-2', editorUsername: 'ritstjoriB',
    });
    // Deterministic cross-second timestamps (CURRENT_TIMESTAMP is 1s-granular).
    db.prepare(`UPDATE segment_edits SET created_at = '2026-07-17 10:00:00' WHERE id = ?`).run(b.id);
    db.prepare(`UPDATE segment_edits SET created_at = '2026-07-17 10:00:05', edited_content = 'Útgáfa A v2' WHERE id = ?`).run(a.id);

    const segs = service.buildEffectiveSegments('testbook', 1, 'm00001');
    const seg = segs.find((s) => s.segmentId === 'm00001:para:fs-id001');
    expect(seg.isContent).toBe('Útgáfa A v2');
  });
```

(Adapt the fixture identifiers — book/module/segment ids and the `db` handle — to the file's existing helpers; the F15 test at line ~907 shows the exact local idiom, including the raw-SQL timestamp forcing.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run server/__tests__/segmentEditorService.test.js -t 'in-place re-save'`
Expected: FAIL — `isContent` is `'Útgáfa B'` (highest id wins today)

- [ ] **Step 3: Implement**

In `server/services/segmentEditorService.js`, add to the requires at the top of the file:

```js
const { isNewer, pickLatest } = require('../lib/editRecency');
```

In `buildEffectiveSegments`, replace the winner pick:

```js
    const cur = latestBySeg[e.segment_id];
    if (!cur || e.id > cur.id) latestBySeg[e.segment_id] = e;
```

with:

```js
    const cur = latestBySeg[e.segment_id];
    if (!cur || isNewer(e, cur)) latestBySeg[e.segment_id] = e;
```

Replace the function's doc comment (lines ~244-250) with:

```js
/**
 * Build the module's effective segments: faithful/MT baseline with the newest
 * live edit per segment overlaid (rejected and superseded rows are skipped).
 * "Newest" is the canonical (created_at, id) rule shared with
 * applyApprovedEdits — see lib/editRecency. NOTE: pending/discuss edits are
 * deliberately included (spellcheck/terminology consumers need draft state),
 * so this is "the draft state once everything live is approved", NOT literally
 * what apply would write today.
 *
 * @returns {Array<{segmentId, enContent, isContent}>}
 */
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run server/__tests__/segmentEditorService.test.js`
Expected: PASS (all — the F15 test's same-second tie still resolves to the higher id via the comparator's tiebreak)

- [ ] **Step 5: Commit**

```bash
git add server/services/segmentEditorService.js server/__tests__/segmentEditorService.test.js
git commit -m "fix(item13): preview winner uses shared recency comparator"
```

---

### Task 7: Convergent `applyApprovedEdits`

**Files:**
- Modify: `server/services/segmentEditorService.js` (`applyApprovedEdits`, lines ~792-975)
- Test: `server/__tests__/segmentEditorService.test.js` (append cases)

**Interfaces:**
- Consumes: `pickLatest` from `server/lib/editRecency` (already required in Task 6).
- Produces: invariant — after any apply, the faithful file equals "newest approved content per segment" (winners chosen across ALL approved rows, applied or not); unapplied losers become `'superseded'`; `appliedCount` = newly-applied winners. The route contracts (`No approved edits…` / `All approved edits have already been applied` 400s) are unchanged.

- [ ] **Step 1: Write the failing tests**

Append to `segmentEditorService.test.js` (same local idioms as the F15 test — save via `saveSegmentEdit` as two editors, approve via `approveEdit`, force timestamps by raw SQL, apply, then parse the faithful file exactly the way the surrounding tests do):

```js
  it('approval-order inversion cannot regress published content (I12-R5)', () => {
    const older = service.saveSegmentEdit({
      book: 'testbook', chapter: 1, moduleId: 'm00001',
      segmentId: 'm00001:para:fs-id001',
      originalContent: 'MT texti', editedContent: 'Eldri breyting',
      editorId: 'editor-1', editorUsername: 'ritstjoriA',
    });
    const newer = service.saveSegmentEdit({
      book: 'testbook', chapter: 1, moduleId: 'm00001',
      segmentId: 'm00001:para:fs-id001',
      originalContent: 'MT texti', editedContent: 'Nýrri breyting',
      editorId: 'editor-2', editorUsername: 'ritstjoriB',
    });
    db.prepare(`UPDATE segment_edits SET created_at = '2026-07-17 10:00:00' WHERE id = ?`).run(older.id);
    db.prepare(`UPDATE segment_edits SET created_at = '2026-07-17 10:00:05' WHERE id = ?`).run(newer.id);

    // Approve the NEWER first and apply it (publishes 'Nýrri breyting').
    service.approveEdit(newer.id, 'he-1', 'yfirlesari', null);
    service.applyApprovedEdits('testbook', 1, 'm00001');

    // Now approve the OLDER and apply again — pre-fix this overwrote the
    // published content with the older edit.
    service.approveEdit(older.id, 'he-1', 'yfirlesari', null);
    const second = service.applyApprovedEdits('testbook', 1, 'm00001');

    expect(second.appliedCount).toBe(0); // nothing NEW published
    expect(second.supersededCount).toBe(1);
    expect(readFaithful()['m00001:para:fs-id001']).toBe('Nýrri breyting');
    expect(service.getEditById(older.id).status).toBe('superseded');
    expect(service.getEditById(newer.id).status).toBe('approved');
  });

  it('apply is convergent: preview and file agree after any approval order', () => {
    const a = service.saveSegmentEdit({
      book: 'testbook', chapter: 1, moduleId: 'm00001',
      segmentId: 'm00001:para:fs-id001',
      originalContent: 'MT texti', editedContent: 'A-efni',
      editorId: 'editor-1', editorUsername: 'ritstjoriA',
    });
    const b = service.saveSegmentEdit({
      book: 'testbook', chapter: 1, moduleId: 'm00001',
      segmentId: 'm00001:para:fs-id001',
      originalContent: 'MT texti', editedContent: 'B-efni',
      editorId: 'editor-2', editorUsername: 'ritstjoriB',
    });
    db.prepare(`UPDATE segment_edits SET created_at = '2026-07-17 10:00:00' WHERE id = ?`).run(a.id);
    db.prepare(`UPDATE segment_edits SET created_at = '2026-07-17 10:00:05' WHERE id = ?`).run(b.id);

    service.approveEdit(b.id, 'he-1', 'yfirlesari', null);
    service.approveEdit(a.id, 'he-1', 'yfirlesari', null);
    service.applyApprovedEdits('testbook', 1, 'm00001');

    const preview = service
      .buildEffectiveSegments('testbook', 1, 'm00001')
      .find((s) => s.segmentId === 'm00001:para:fs-id001');
    expect(preview.isContent).toBe('B-efni');
    expect(readFaithful()['m00001:para:fs-id001']).toBe('B-efni');
  });
```

Note for the implementer: `readFaithful()` stands for however the surrounding tests parse the written faithful file (the F15 test block contains the exact code — reuse it verbatim, e.g. via `segmentParser.parseSegments(readFileSync(...))` into a map). The second test requires Task 8's guard to NOT be in place yet for `approveEdit(a.id, ...)` to succeed — **therefore Task 7 must be implemented and committed BEFORE Task 8**; after Task 8 lands, this second test must be updated to expect the 409 path instead (Task 8 Step 1 includes that update).

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run server/__tests__/segmentEditorService.test.js -t 'I12-R5'`
Expected: FAIL — file holds `'Eldri breyting'` after the second apply (the regression this task fixes)

- [ ] **Step 3: Implement convergent winner selection**

In `applyApprovedEdits`, inside the `applyTransaction`, replace the re-query + lookup block (steps "Re-query inside the transaction" and "2. Build approved-content lookup", lines ~863-889) with:

```js
    // Re-query inside the transaction to ensure consistency. Unapplied rows
    // gate the run; winners are then chosen across ALL approved rows —
    // applied or not — so a late approval of an older edit can never regress
    // a segment whose newer approved content already published (I12-R5).
    const unapplied = conn
      .prepare(
        `SELECT id FROM segment_edits
         WHERE book = ? AND module_id = ? AND status = 'approved' AND applied_at IS NULL`
      )
      .all(book, moduleId);

    if (unapplied.length === 0) {
      throw new Error('Edits were applied by a concurrent request');
    }

    const allApproved = conn
      .prepare(
        `SELECT id, segment_id, edited_content, created_at, applied_at
         FROM segment_edits
         WHERE book = ? AND module_id = ? AND status = 'approved'`
      )
      .all(book, moduleId);

    // 2. Winner per segment = canonical newest (created_at, id) — the same
    // rule buildEffectiveSegments uses. Unapplied losers are superseded;
    // already-applied losers stay as resolved history (unchanged behavior).
    const bySegment = {};
    for (const edit of allApproved) {
      (bySegment[edit.segment_id] = bySegment[edit.segment_id] || []).push(edit);
    }
    const approvedLookup = {};
    const supersededIds = [];
    for (const [segId, list] of Object.entries(bySegment)) {
      const winner = pickLatest(list);
      approvedLookup[segId] = winner;
      for (const edit of list) {
        if (edit.id !== winner.id && edit.applied_at === null) {
          supersededIds.push(edit.id);
        }
      }
    }
```

Then adjust the marking block (step 6, lines ~955-969): replace

```js
    const winnerIds = Object.values(approvedLookup).map((e) => e.id);
```

with

```js
    // Only stamp winners not already applied — appliedCount reports what THIS
    // apply newly published.
    const winnerIds = Object.values(approvedLookup)
      .filter((e) => e.applied_at === null)
      .map((e) => e.id);
```

and replace the `appliedCount` computation (step 5b, line ~941):

```js
    const appliedCount = Object.keys(approvedLookup).length;
```

with

```js
    const appliedCount = winnerIds.length;
```

and in the returned object, set:

```js
      totalEditsMarked: winnerIds.length + supersededIds.length,
```

Finally, in the PRE-transaction pre-check (lines ~798-805), the `ORDER BY reviewed_at DESC, id DESC` is now dead weight — reduce that query to:

```js
  const approvedEdits = conn
    .prepare(
      `SELECT id FROM segment_edits
       WHERE book = ? AND module_id = ? AND status = 'approved' AND applied_at IS NULL`
    )
    .all(book, moduleId);
```

(Its only use is `.length` checks; the rebuild/`already been applied` logic below it is untouched.)

- [ ] **Step 4: Run tests**

Run: `npx vitest run server/__tests__/segmentEditorService.test.js server/__tests__/applyStatusRebuild.test.js server/__tests__/applyAndRenderGuard.test.js`
Expected: PASS — including the F15 same-second test (tie → higher id via comparator; appliedCount 1 / superseded 1 as before) and the pre-existing forward-supersede test.

- [ ] **Step 5: Commit**

```bash
git add server/services/segmentEditorService.js server/__tests__/segmentEditorService.test.js
git commit -m "fix(item13): convergent apply — newest approved wins across applies (I12-R5)"
```

---

### Task 8: `approveEdit` guard + route 409 (`SUPERSEDED_BY_NEWER`)

**Files:**
- Modify: `server/services/segmentEditorService.js` (`approveEdit`, lines ~380-403)
- Modify: `server/routes/segment-editor.js` (approve route catch, ~line 604-606)
- Test: `server/__tests__/segmentEditorService.test.js` (append + update Task 7's second test)

**Interfaces:**
- Consumes: `isNewer` (already required); convergent apply (Task 7).
- Produces: `approveEdit` throws `err.code === 'SUPERSEDED_BY_NEWER'` when a newer APPROVED edit exists on the segment; route maps it to 409. Newer *pending/discuss* edits do NOT block approval.

- [ ] **Step 1: Write the failing test + update Task 7's convergence test**

Append:

```js
  it('approveEdit refuses (SUPERSEDED_BY_NEWER) when a newer approved edit exists', () => {
    const older = service.saveSegmentEdit({
      book: 'testbook', chapter: 1, moduleId: 'm00001',
      segmentId: 'm00001:para:fs-id001',
      originalContent: 'MT texti', editedContent: 'Eldri',
      editorId: 'editor-1', editorUsername: 'ritstjoriA',
    });
    const newer = service.saveSegmentEdit({
      book: 'testbook', chapter: 1, moduleId: 'm00001',
      segmentId: 'm00001:para:fs-id001',
      originalContent: 'MT texti', editedContent: 'Nýrri',
      editorId: 'editor-2', editorUsername: 'ritstjoriB',
    });
    db.prepare(`UPDATE segment_edits SET created_at = '2026-07-17 10:00:00' WHERE id = ?`).run(older.id);
    db.prepare(`UPDATE segment_edits SET created_at = '2026-07-17 10:00:05' WHERE id = ?`).run(newer.id);

    service.approveEdit(newer.id, 'he-1', 'yfirlesari', null);

    let err;
    try {
      service.approveEdit(older.id, 'he-1', 'yfirlesari', null);
    } catch (e) {
      err = e;
    }
    expect(err).toBeTruthy();
    expect(err.code).toBe('SUPERSEDED_BY_NEWER');
    expect(service.getEditById(older.id).status).toBe('pending'); // untouched
  });

  it('approveEdit is NOT blocked by a newer pending edit (review freedom)', () => {
    const older = service.saveSegmentEdit({
      book: 'testbook', chapter: 1, moduleId: 'm00001',
      segmentId: 'm00001:para:fs-id001',
      originalContent: 'MT texti', editedContent: 'Eldri',
      editorId: 'editor-1', editorUsername: 'ritstjoriA',
    });
    service.saveSegmentEdit({
      book: 'testbook', chapter: 1, moduleId: 'm00001',
      segmentId: 'm00001:para:fs-id001',
      originalContent: 'MT texti', editedContent: 'Nýrri (enn í bið)',
      editorId: 'editor-2', editorUsername: 'ritstjoriB',
    });
    expect(() => service.approveEdit(older.id, 'he-1', 'yfirlesari', null)).not.toThrow();
  });
```

AND update Task 7's `'apply is convergent'` test: `approveEdit(a.id, …)` (the older edit, approved second) now throws `SUPERSEDED_BY_NEWER` — rewrite that test's middle section to:

```js
    service.approveEdit(b.id, 'he-1', 'yfirlesari', null);
    // Task 8 guard: approving the outranked older edit is refused — it could
    // never publish. Convergence is then trivially "the newer one".
    expect(() => service.approveEdit(a.id, 'he-1', 'yfirlesari', null)).toThrow(
      /Nýrri samþykkt breyting/
    );
    service.applyApprovedEdits('testbook', 1, 'm00001');
```

(assertions on preview + file content unchanged; `a` stays `'pending'`).

- [ ] **Step 2: Run tests to verify the new guard test fails**

Run: `npx vitest run server/__tests__/segmentEditorService.test.js -t 'SUPERSEDED_BY_NEWER'`
Expected: FAIL — no error thrown today

- [ ] **Step 3: Implement**

In `approveEdit`, after the `if (edit.status !== 'pending') throw ...` line, insert:

```js
  // Item 13 guard: approving an edit a newer APPROVED edit already outranks
  // is a meaningless act — convergent apply would supersede it immediately.
  // Tell the head-editor now instead of silently flipping it later. A newer
  // PENDING/discuss edit does NOT block (normal review freedom).
  const newerApproved = conn
    .prepare(
      `SELECT id, created_at FROM segment_edits
       WHERE book = ? AND module_id = ? AND segment_id = ? AND status = 'approved'`
    )
    .all(edit.book, edit.module_id, edit.segment_id)
    .some((e) => isNewer(e, edit));
  if (newerApproved) {
    const err = new Error('Nýrri samþykkt breyting er þegar til á þessum bút.');
    err.code = 'SUPERSEDED_BY_NEWER';
    throw err;
  }
```

In `server/routes/segment-editor.js`, the approve route's catch block, replace:

```js
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
```

with (mirror of the unapprove route's `PENDING_EXISTS` mapping at ~line 697):

```js
    } catch (err) {
      const status = err.code === 'SUPERSEDED_BY_NEWER' ? 409 : 400;
      res.status(status).json({ error: err.message });
    }
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run server/__tests__/segmentEditorService.test.js`
Expected: PASS (all, including the updated convergence test)

- [ ] **Step 5: Commit**

```bash
git add server/services/segmentEditorService.js server/routes/segment-editor.js server/__tests__/segmentEditorService.test.js
git commit -m "fix(item13): approve guard — 409 when a newer approved edit outranks"
```

---

### Task 9: `saveRetry` UMD factory refactor (behavior-preserving)

**Files:**
- Modify: `server/public/js/saveRetry.js` (restructure IIFE → UMD factory; NO semantic changes in this task)
- Test: `server/__tests__/saveRetryQueue.test.js` (new harness + smoke tests)

**Interfaces:**
- Produces: `createSaveRetry({ fetch, storage, setTimeout, clearTimeout, now, toast })` returning `{ attempt, processQueue, pending, isRetryable, showToast }`; browser global `saveRetry` unchanged (instantiated with real deps + the existing DOM toast, auto-`processQueue` on load preserved). Task 10 adds the semantic fixes on top.

- [ ] **Step 1: Restructure the module**

Rewrite `server/public/js/saveRetry.js` with this exact shape (all existing logic moves inside the factory verbatim except that `fetch` → `fetchFn`, `localStorage` → `storage`, `setTimeout`/`clearTimeout` → `setTimeoutFn`/`clearTimeoutFn`, `Date.now()` → `now()`, and every `showToast(...)` call → `toast(...)`; the DOM toast implementation moves to the browser wrapper):

```js
/**
 * Save Retry Queue
 *
 * Catches retryable save failures, queues them in localStorage,
 * and retries with exponential backoff. Shows toast notifications.
 *
 * UMD factory (item 13): browser global `saveRetry` instantiated with real
 * deps; CommonJS exports `createSaveRetry` so Vitest can drive the queue
 * behaviorally with fake fetch/storage/timers — the queue's first behavioral
 * tests (static pins prove presence, not behavior).
 */
(function (root) {
  'use strict';

  function createSaveRetry(deps) {
    const fetchFn = deps.fetch;
    const storage = deps.storage;
    const setTimeoutFn = deps.setTimeout;
    const clearTimeoutFn = deps.clearTimeout;
    const now = deps.now;
    const toast = deps.toast;

    const STORAGE_KEY = 'saveRetryQueue';
    const MAX_ATTEMPTS = 3;
    const BACKOFF_BASE = 1000; // 1s, 2s, 4s
    const EXPIRY_MS = 60 * 60 * 1000; // 1 hour

    const activeTimers = {};

    // ... loadQueue/saveQueue/addToQueue/removeFromQueue, isRetryableError/
    // isRetryableResponse, executeRetry, attempt, processQueue, pending,
    // isRetryable — moved VERBATIM from the current file body, with only the
    // dep renames above. Every `showToast(msg, type, persistent)` call becomes
    // `toast(msg, type, persistent)`. The `// Non-retryable` block, the
    // `data.message || data.error` line, the two-argument .then() form and the
    // outer `.catch(function (err) {` are preserved byte-for-byte (static pins
    // in clientMessageContracts.test.js).

    return {
      attempt: attempt,
      processQueue: processQueue,
      pending: pending,
      isRetryable: isRetryable,
      showToast: toast,
    };
  }

  // ── Browser wiring: real deps + the existing DOM toast ──
  if (typeof root !== 'undefined' && typeof root.document !== 'undefined') {
    const TOAST_SUCCESS_MS = 5000;
    let toastContainer = null;

    function ensureContainer() {
      /* moved verbatim from the current file */
    }

    function domToast(message, type, persistent) {
      /* the current showToast body, verbatim */
    }

    root.saveRetry = createSaveRetry({
      fetch: root.fetch.bind(root),
      storage: root.localStorage,
      setTimeout: root.setTimeout.bind(root),
      clearTimeout: root.clearTimeout.bind(root),
      now: function () {
        return Date.now();
      },
      toast: domToast,
    });

    // Auto-process queue on load (moved verbatim).
    if (root.document.readyState === 'loading') {
      root.document.addEventListener('DOMContentLoaded', root.saveRetry.processQueue);
    } else {
      root.setTimeout(root.saveRetry.processQueue, 1000);
    }
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { createSaveRetry: createSaveRetry };
  }
})(typeof window !== 'undefined' ? window : globalThis);
```

The `/* moved verbatim */` blocks are NOT placeholders for new code — they are the existing implementation relocated unchanged; the implementer copies them from the current file (git shows the pre-task content).

- [ ] **Step 2: Write the behavioral harness + smoke tests**

```js
// server/__tests__/saveRetryQueue.test.js
/**
 * Behavioral tests for the save-retry queue (item 13, finding 8) — the first
 * non-static coverage of this module, via createSaveRetry's injectable deps.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { createSaveRetry } = require('../public/js/saveRetry');

function makeHarness() {
  const store = new Map();
  const storage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  };
  let nextTimer = 1;
  const timers = new Map();
  const setTimeoutFn = (fn, delay) => {
    const id = nextTimer++;
    timers.set(id, { fn, delay });
    return id;
  };
  const clearTimeoutFn = (id) => timers.delete(id);
  const fireAllTimers = async () => {
    const batch = [...timers.values()];
    timers.clear();
    for (const t of batch) await t.fn();
  };
  const fetchCalls = [];
  let fetchScript = [];
  const ok = (body) => () => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body || {}) });
  const fail500 = () => () => Promise.resolve({ ok: false, status: 500, json: () => Promise.resolve({}) });
  const fetchFn = (url, options) => {
    fetchCalls.push({ url, options });
    const next = fetchScript.shift();
    return (next || ok())();
  };
  const toasts = [];
  const sr = createSaveRetry({
    fetch: fetchFn,
    storage,
    setTimeout: setTimeoutFn,
    clearTimeout: clearTimeoutFn,
    now: () => 1_000_000,
    toast: (message, type) => toasts.push({ message, type }),
  });
  const queue = () => JSON.parse(store.get('saveRetryQueue') || '[]');
  return {
    sr,
    queue,
    timers,
    fireAllTimers,
    fetchCalls,
    toasts,
    setFetchScript: (s) => (fetchScript = s),
    ok,
    fail500,
    store,
  };
}

describe('saveRetry factory smoke (behavior-preserving refactor)', () => {
  it('successful save resolves with parsed JSON and queues nothing', async () => {
    const h = makeHarness();
    h.setFetchScript([h.ok({ success: true })]);
    const result = await h.sr.attempt('seg:k1', '/api/x', { method: 'POST' });
    expect(result).toEqual({ success: true });
    expect(h.queue()).toEqual([]);
    expect(h.timers.size).toBe(0);
  });

  it('5xx failure queues the item, schedules a retry, and rejects', async () => {
    const h = makeHarness();
    h.setFetchScript([h.fail500()]);
    await expect(h.sr.attempt('seg:k1', '/api/x', { method: 'POST' })).rejects.toThrow(/reyni aftur/);
    expect(h.queue()).toHaveLength(1);
    expect(h.timers.size).toBe(1);
  });

  it('queued retry that succeeds removes the entry', async () => {
    const h = makeHarness();
    h.setFetchScript([h.fail500(), h.ok()]);
    await h.sr.attempt('seg:k1', '/api/x', { method: 'POST' }).catch(() => {});
    await h.fireAllTimers();
    expect(h.queue()).toEqual([]);
  });
});
```

- [ ] **Step 3: Run tests**

Run: `npx vitest run server/__tests__/saveRetryQueue.test.js server/__tests__/clientMessageContracts.test.js`
Expected: PASS — smoke tests green AND both static pins still green (the preserved source strings). If a pin fails, the refactor moved/renamed a pinned string — restore it, don't loosen the pin.

- [ ] **Step 4: Manual browser sanity note**

The two script consumers (`server/views/segment-editor.html:1546`, `server/views/localization-editor.html:2012`) load the file as a plain `<script src>` — the UMD global keeps working with zero HTML changes. Run `grep -n "saveRetry\." server/public/js/segment-editor.js server/public/js/localization-editor.js` and confirm every member used (`attempt`, `showToast`, `pending`, `isRetryable`, `processQueue`) exists on the returned object.

- [ ] **Step 5: Commit**

```bash
git add server/public/js/saveRetry.js server/__tests__/saveRetryQueue.test.js
git commit -m "refactor(item13): saveRetry UMD factory with injectable deps (no behavior change)"
```

---

### Task 10: saveRetry semantic fixes — success purge, qid identity, single live timer

**Files:**
- Modify: `server/public/js/saveRetry.js`
- Test: `server/__tests__/saveRetryQueue.test.js` (append)

**Interfaces:**
- Consumes: Task 9's factory + harness.
- Produces: (1) a successful `attempt()` purges the key's queue entry and cancels its timer; (2) each entry carries a `qid` nonce, and a firing timer aborts silently unless the stored entry for its key still carries its `qid` (retry then uses the STORED entry, not the closure copy); (3) queueing an entry for a key cancels any existing timer for that key.

- [ ] **Step 1: Write the failing tests (append)**

```js
describe('saveRetry stale-replay cancellation (finding 8)', () => {
  it('a successful save purges an earlier failed save queued under the same key', async () => {
    const h = makeHarness();
    h.setFetchScript([h.fail500(), h.ok()]);
    await h.sr.attempt('seg:k1', '/api/x', { method: 'POST', body: 'OLD' }).catch(() => {});
    expect(h.queue()).toHaveLength(1);

    await h.sr.attempt('seg:k1', '/api/x', { method: 'POST', body: 'NEW' });
    expect(h.queue()).toEqual([]); // entry purged
    expect(h.timers.size).toBe(0); // timer cancelled

    await h.fireAllTimers(); // nothing scheduled — the stale body can never replay
    expect(h.fetchCalls.filter((c) => c.options.body === 'OLD')).toHaveLength(1); // only the original attempt
  });

  it('a firing timer aborts silently when its entry was removed (cross-tab success)', async () => {
    const h = makeHarness();
    h.setFetchScript([h.fail500()]);
    await h.sr.attempt('seg:k1', '/api/x', { method: 'POST', body: 'OLD' }).catch(() => {});
    expect(h.timers.size).toBe(1);

    h.store.delete('saveRetryQueue'); // another tab's success cleared storage
    const callsBefore = h.fetchCalls.length;
    await h.fireAllTimers();
    expect(h.fetchCalls.length).toBe(callsBefore); // no replay fetch
    expect(h.toasts.filter((t) => t.type === 'error').length).toBe(1); // only the original failure toast
  });

  it('a newer failed save replaces the entry AND cancels the old timer (one live timer per key)', async () => {
    const h = makeHarness();
    h.setFetchScript([h.fail500(), h.fail500(), h.ok()]);
    await h.sr.attempt('seg:k1', '/api/x', { method: 'POST', body: 'V1' }).catch(() => {});
    await h.sr.attempt('seg:k1', '/api/x', { method: 'POST', body: 'V2' }).catch(() => {});

    expect(h.queue()).toHaveLength(1);
    expect(h.queue()[0].options.body).toBe('V2');
    expect(h.timers.size).toBe(1); // old timer cancelled, exactly one live

    await h.fireAllTimers();
    const retryBodies = h.fetchCalls.slice(2).map((c) => c.options.body);
    expect(retryBodies).toEqual(['V2']); // V1 never replays
  });

  it('retry uses the STORED entry, not the timer closure copy', async () => {
    const h = makeHarness();
    h.setFetchScript([h.fail500(), h.ok()]);
    await h.sr.attempt('seg:k1', '/api/x', { method: 'POST', body: 'V1' }).catch(() => {});
    // Simulate another tab replacing the entry's body but keeping key+qid
    // (degenerate but pins the read-from-storage contract).
    const q = h.queue();
    q[0].options.body = 'V1-updated';
    h.store.set('saveRetryQueue', JSON.stringify(q));
    await h.fireAllTimers();
    expect(h.fetchCalls[h.fetchCalls.length - 1].options.body).toBe('V1-updated');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run server/__tests__/saveRetryQueue.test.js`
Expected: FAIL — success leaves the queue entry; fired timers replay `OLD`/`V1`.

- [ ] **Step 3: Implement the three changes inside the factory**

(a) Add a cancel helper next to `removeFromQueue`:

```js
    function cancelPending(key) {
      if (activeTimers[key] !== undefined) {
        clearTimeoutFn(activeTimers[key]);
        delete activeTimers[key];
      }
      removeFromQueue(key);
    }
```

(b) In `attempt()`, make the success branch purge (this preserves the pinned strings below it):

```js
        if (response.ok) {
          cancelPending(key);
          return response.json();
        }
```

(c) Give entries a nonce and route queueing through one helper. Where `attempt()`'s two failure paths build `queueItem`, add a `qid` field:

```js
            qid: now() + ':' + Math.random().toString(36).slice(2),
```

and replace each `addToQueue(queueItem); ... executeRetry(queueItem);` pair (both in `attempt()` and in `executeRetry`'s retry-again branches) with:

```js
          queueForRetry(queueItem);
```

adding the helper:

```js
    function queueForRetry(item) {
      // Exactly one live timer per key: cancel a predecessor before queueing.
      if (activeTimers[item.key] !== undefined) {
        clearTimeoutFn(activeTimers[item.key]);
        delete activeTimers[item.key];
      }
      addToQueue(item);
      executeRetry(item);
    }
```

(d) In `executeRetry`, the timer callback re-reads storage and aborts on identity mismatch, then uses the STORED entry:

```js
    function executeRetry(queueItem) {
      const delay = BACKOFF_BASE * Math.pow(2, queueItem.attempts - 1);

      activeTimers[queueItem.key] = setTimeoutFn(function () {
        delete activeTimers[queueItem.key];

        // Item 13: only the CURRENT entry for this key may fire. A missing or
        // qid-mismatched entry means a success purged it or a newer save
        // replaced it — replaying the closure copy is exactly the stale-
        // overwrite this module exists to prevent. Silent abort: a superseded
        // retry is a correct non-event. (Pre-qid legacy entries: undefined
        // === undefined passes, graceful.)
        const stored = loadQueue().find(function (q) {
          return q.key === queueItem.key;
        });
        if (!stored || stored.qid !== queueItem.qid) return;

        fetchFn(stored.url, stored.options)
          .then(function (response) {
            if (response.ok) {
              removeFromQueue(stored.key);
              toast('Vista tókst eftir endurtilraun', 'success');
            } else if (isRetryableResponse(response) && stored.attempts < MAX_ATTEMPTS) {
              stored.attempts++;
              stored.nextRetry = now() + BACKOFF_BASE * Math.pow(2, stored.attempts - 1);
              queueForRetry(stored);
            } else {
              removeFromQueue(stored.key);
              toast(
                'Vista mistókst eftir ' + stored.attempts + ' tilraunir. Vinsamlegast reyndu aftur.',
                'error',
                true
              );
            }
          })
          .catch(function (err) {
            if (isRetryableError(err) && stored.attempts < MAX_ATTEMPTS) {
              stored.attempts++;
              stored.nextRetry = now() + BACKOFF_BASE * Math.pow(2, stored.attempts - 1);
              queueForRetry(stored);
            } else {
              removeFromQueue(stored.key);
              toast(
                'Vista mistókst eftir ' + stored.attempts + ' tilraunir. Vinsamlegast reyndu aftur.',
                'error',
                true
              );
            }
          });
      }, delay);
    }
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run server/__tests__/saveRetryQueue.test.js server/__tests__/clientMessageContracts.test.js`
Expected: PASS (all behavioral cases + both static pins)

- [ ] **Step 5: Commit**

```bash
git add server/public/js/saveRetry.js server/__tests__/saveRetryQueue.test.js
git commit -m "fix(item13): saveRetry — success purges queue, qid identity check, one timer per key (finding 8)"
```

---

### Task 11: Test-hygiene fix, campaign-doc closure, full-suite gate

**Files:**
- Modify: `server/e2e/editor-lifecycle.spec.js:409` (dead cleanup key)
- Modify: `docs/plans/2026-07-11-pre-semester-coding-campaign.md` (item 13 entry + register)

**Interfaces:**
- Consumes: everything above.
- Produces: green full suite; campaign record.

- [ ] **Step 1: Fix the dead e2e cleanup key**

In `server/e2e/editor-lifecycle.spec.js` line 409, replace:

```js
      localStorage.removeItem('save-retry-queue');
```

with:

```js
      localStorage.removeItem('saveRetryQueue');
```

(The old name never matched `saveRetry.js`'s `STORAGE_KEY = 'saveRetryQueue'` — the cleanup was dead code; found during item-13 recon.)

- [ ] **Step 2: Update the campaign doc**

In `docs/plans/2026-07-11-pre-semester-coding-campaign.md`, item 13's line gains the ship summary (mirror the style of items 8/9/10/12: PR number once known, suite count, spec/plan paths, finding-24 "verified already closed by #270", I12-R5 closed). Add register entries for the two documented residuals:

```markdown
### Register — findings/deferrals from item 13 (2026-07-17)
- **I13-R1 `[residual]` — cross-key stale-batch replay:** a queued `loc-auto:` per-module batch can replay one stale segment after a newer per-segment (`loc:`) save succeeded — different retry keys, cancellation can't see across them. Backstops: review-OFF replays carry stale `lastModified` → existing mtime 409; review-ON blast radius is the same editor's own pending row (post-041), window ≤1h + requires tab-close before the next 60s autosave. Fix shape if ever needed: a `saveRetry.rewrite(key, fn)` API that strips a segment from a queued batch on single-save success.
- **I13-R2 `[verify]` — loc badge shadowing:** with per-editor pendings, `getModuleEdits`'s newest-first list may surface another editor's row for a segment's badge in the localization pane, and the pane now also sees status `'superseded'` rows. Verify the badge rendering tolerates both (neutral fallback for unknown status); register a fix if it doesn't.
```

- [ ] **Step 3: Verify the loc pane tolerates the new status (I13-R2 check now, not later)**

Run: `grep -n "status ===\|status)" server/public/js/localization-editor.js | grep -i "pending\|approved\|rejected"` and read the badge-rendering branch. If it `else`-falls-through on unknown statuses, note "tolerates" in the register entry; if it renders broken UI for `'superseded'`, add the minimal neutral branch (Icelandic label "Leyst úr gildi") in this task and say so in the register entry.

- [ ] **Step 4: Full-suite gate**

Run from the repo root: `npm test`
Expected: entire Vitest suite green (baseline was 2799 tests / 193 files at item 12; this branch adds ~25). Any failure in a file this plan didn't touch: investigate before assuming pre-existing — the campaign rule is local-suite-green is the ONLY gate.

- [ ] **Step 5: Commit**

```bash
git add server/e2e/editor-lifecycle.spec.js docs/plans/2026-07-11-pre-semester-coding-campaign.md server/public/js/localization-editor.js
git commit -m "chore(item13): e2e cleanup key fix + campaign register (I13-R1/R2)"
```

(Drop `localization-editor.js` from the `git add` if Step 3 needed no change.)

---

## Completion

After Task 11: use superpowers:finishing-a-development-branch — push the branch, open the PR (title `fix(item13): concurrent-edit lost updates — loc per-editor pendings, saveRetry cancellation, convergent apply`), run the final whole-branch review per campaign convention, merge on green + review-clean.
