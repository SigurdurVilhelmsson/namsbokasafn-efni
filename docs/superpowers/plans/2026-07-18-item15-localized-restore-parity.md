# Item 15 — Localized Restore Parity — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give Pass-2 localized content (`04-localized-content/`) the faithful versioning triple — pre-write DB snapshots, restore API, "Útgáfusaga" modal — via a `track` discriminator on `content_versions` and one parameterized `contentVersionService`, absorbing I12-M1/M3 (write-then-mark test) and I12-R4 (version-numbering wording).

**Architecture:** Migration 042 rebuilds `content_versions` with `track TEXT NOT NULL DEFAULT 'faithful'` (041-style transactional rebuild). Every `contentVersionService` function gains a trailing `track = 'faithful'` param; an internal `TRACK_CONFIG` selects loader/writer/current-content-field/post-write-hooks per track (localized: no hooks). New wrapper `saveLocalizedWithSnapshot` becomes the single localized write path (3 call sites). Four mirror routes under `/api/localization-editor`; the vh-overlay modal ports to the localization editor. Spec: `docs/superpowers/specs/2026-07-18-item15-localized-restore-design.md`.

**Tech Stack:** Node 22 CJS server, better-sqlite3, Vitest (server workspace sequential), in-memory-DB + `_setTestDb` + `_setTestBooksDir` harness (authority: `server/__tests__/contentVersionService.test.js`), router.stack handler extraction (authority: `locApproveConflict.test.js`).

## Global Constraints

- Branch: `fix/item15-localized-restore` — create at execution start FROM current local main (which carries spec commit `53a462d2`), then reset local `main` to `origin/main` (item-14 precedent: spec+plan ride the item PR).
- `npm test` from the repo root is the authoritative gate. `git status --porcelain books/` must be empty before every commit (tests use temp dirs only).
- Server code is CommonJS; tests are ESM Vitest via `createRequire`.
- `tools/` untouched. The F3 write-then-mark ordering in `approveAndApply` is load-bearing — the snapshot is ADDED BEFORE it; the ordering itself must not change.
- Existing faithful callers of `contentVersionService` must need ZERO changes (track param defaults `'faithful'`).
- `chapter` stays INTEGER, `-1` = appendices (item-14 `chapterLabel` contract).
- Snapshot failures on save paths: logged loud, non-fatal. Restore failures: loud. Unknown `track`: TypeError.
- Commit style: `feat(item15):` / `fix(item15):` / `test(item15):` / `docs(item15):`.

---

### Task 1: Migration 042 — `track` column on `content_versions`

**Files:**
- Create: `server/migrations/042-content-versions-track.js`
- Test: `server/__tests__/migration042Track.test.js` (create)

**Interfaces:**
- Produces: `content_versions` with `track TEXT NOT NULL DEFAULT 'faithful' CHECK(track IN ('faithful','localized'))`, `UNIQUE(book, track, module_id, segment_id, version)`; existing rows carry `track='faithful'`. Later tasks' SQL filters `AND track = ?`.

- [ ] **Step 1: Write the failing test**

Create `server/__tests__/migration042Track.test.js`:

```js
/**
 * Migration 042 — track discriminator on content_versions (item 15).
 * Verifies: rebuild adds track with 'faithful' default + CHECK; existing rows
 * preserved; UNIQUE now includes track (same version number may exist per
 * track); idempotent re-run.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const Database = require('better-sqlite3');
const migration031 = require('../migrations/031-content-versions');
const migration042 = require('../migrations/042-content-versions-track');

let db;

beforeEach(() => {
  db = new Database(':memory:');
  migration031.up(db);
  db.prepare(
    `INSERT INTO content_versions (book, chapter, module_id, segment_id, content, version, applied_by)
     VALUES ('bok', 3, 'm11111', 'm11111:para:a', 'gamalt efni', 1, 'ed1')`
  ).run();
});

afterEach(() => db.close());

describe('migration 042 content_versions track', () => {
  it('adds track with faithful default and preserves existing rows', () => {
    migration042.up(db);
    const row = db.prepare(`SELECT * FROM content_versions WHERE module_id = 'm11111'`).get();
    expect(row.track).toBe('faithful');
    expect(row.content).toBe('gamalt efni');
    expect(row.version).toBe(1);
  });

  it('CHECK rejects unknown track values', () => {
    migration042.up(db);
    expect(() =>
      db
        .prepare(
          `INSERT INTO content_versions (book, chapter, module_id, segment_id, content, version, track)
           VALUES ('bok', 3, 'm11111', 'm11111:para:a', 'x', 2, 'mt-preview')`
        )
        .run()
    ).toThrow(/CHECK/);
  });

  it('UNIQUE includes track: same version per track is allowed, per-track dup is not', () => {
    migration042.up(db);
    const ins = db.prepare(
      `INSERT INTO content_versions (book, chapter, module_id, segment_id, content, version, track)
       VALUES ('bok', 3, 'm11111', 'm11111:para:a', ?, 1, ?)`
    );
    ins.run('staðfært efni', 'localized'); // same (book,module,segment,version), other track → OK
    expect(() => ins.run('tvítak', 'localized')).toThrow(/UNIQUE/);
  });

  it('is idempotent on re-run', () => {
    migration042.up(db);
    expect(() => migration042.up(db)).not.toThrow();
    expect(db.prepare(`SELECT COUNT(*) c FROM content_versions`).get().c).toBe(1);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run (repo root): `npx vitest run server/__tests__/migration042Track.test.js`
Expected: FAIL — `Cannot find module '../migrations/042-content-versions-track'`

- [ ] **Step 3: Write the migration**

Create `server/migrations/042-content-versions-track.js`:

```js
/**
 * Migration 042: content_versions — track discriminator (item 15, rem-2.2).
 *
 * Unit 1 (031) built version snapshots for faithful content only; the table
 * had no track column, so localized (Pass-2) snapshots would interleave with
 * faithful ones under a single version counter. Adds
 * track TEXT NOT NULL DEFAULT 'faithful' CHECK(track IN ('faithful','localized'))
 * and widens the UNIQUE constraint to include it.
 *
 * SQLite cannot alter a UNIQUE constraint → table rebuild inside one
 * db.transaction() (pattern: migration 041 — a crash rolls back to the intact
 * pre-042 table). Existing rows copy through as track='faithful' via the
 * column default. Idempotent: guarded on 'track' being absent from the
 * current table SQL.
 */

module.exports = {
  name: '042-content-versions-track',

  up(db) {
    const tableInfo = db
      .prepare(`SELECT sql FROM sqlite_master WHERE type='table' AND name='content_versions'`)
      .get();

    if (!tableInfo) return;
    if (/\btrack\b/.test(tableInfo.sql)) return; // already rebuilt

    const rebuild = db.transaction(() => {
      db.exec(`
      DROP TABLE IF EXISTS content_versions_new;

      CREATE TABLE content_versions_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        book TEXT NOT NULL,
        chapter INTEGER NOT NULL,
        module_id TEXT NOT NULL,
        segment_id TEXT NOT NULL,
        content TEXT NOT NULL,
        version INTEGER NOT NULL DEFAULT 1,
        track TEXT NOT NULL DEFAULT 'faithful' CHECK(track IN ('faithful', 'localized')),
        applied_by TEXT,
        applied_at DATETIME DEFAULT CURRENT_TIMESTAMP,

        UNIQUE(book, track, module_id, segment_id, version)
      );

      INSERT INTO content_versions_new (
        id, book, chapter, module_id, segment_id, content, version, applied_by, applied_at
      )
      SELECT
        id, book, chapter, module_id, segment_id, content, version, applied_by, applied_at
      FROM content_versions;

      DROP TABLE content_versions;

      ALTER TABLE content_versions_new RENAME TO content_versions;

      CREATE INDEX IF NOT EXISTS idx_content_versions_module
        ON content_versions(book, track, module_id);
      CREATE INDEX IF NOT EXISTS idx_content_versions_segment
        ON content_versions(book, track, module_id, segment_id);
    `);
    });
    rebuild();
  },
};
```

Note: the two index names collide with 031's (`CREATE INDEX IF NOT EXISTS` guards the NAME, and the old indexes died with the dropped table — so these recreate cleanly with the new leading columns; same idiom 041 uses).

- [ ] **Step 4: Run to verify it passes + idempotency suite**

Run: `npx vitest run server/__tests__/migration042Track.test.js server/__tests__/migrationIdempotency.test.js`
Expected: PASS (042 is picked up by `runAllMigrations` automatically; the idempotency suite runs everything twice).

- [ ] **Step 5: Commit**

```bash
git add server/migrations/042-content-versions-track.js server/__tests__/migration042Track.test.js
git commit -m "feat(item15): migration 042 — track discriminator on content_versions"
```

---

### Task 2: Parameterize `contentVersionService` by track + localized restore branch

**Files:**
- Modify: `server/services/contentVersionService.js` (whole file — every function)
- Test: `server/__tests__/contentVersionService.test.js` (extend)

**Interfaces:**
- Consumes: Task 1's schema.
- Produces (later tasks rely on these EXACT signatures):
  - `snapshotModule(book, chapter, moduleId, segments, appliedBy, db = getDb(), track = 'faithful')`
  - `getModuleVersions(book, moduleId, track = 'faithful')`
  - `getVersionContent(book, moduleId, version, track = 'faithful')`
  - `getSegmentHistory(book, moduleId, segmentId, track = 'faithful')`
  - `restoreVersion(book, chapter, moduleId, version, restoredBy = {}, track = 'faithful')` — localized branch loads via `loadModuleForLocalization`, current content = `seg.hasLocalized ? seg.localized : seg.faithful`, writes via `saveLocalizedSegments`, runs NO post-write hooks, activity metadata gains `track`.
  - All throw `TypeError` on unknown track.

- [ ] **Step 1: Write the failing tests**

Append to `server/__tests__/contentVersionService.test.js` (inside the existing top-level describe, reusing its in-memory DB + temp-books harness — read its `beforeEach` first; it runs migration 031's `up(db)` to build the table: **add `require('../migrations/042-content-versions-track').up(db);` immediately after that line** so the schema matches production). The harness's module-file writer creates faithful fixtures; extend it (or add a sibling helper) to also write `04-localized-content` files:

```js
  describe('track parameterization (item 15)', () => {
    // Helper: write EN + faithful + (optionally) localized fixture files for a module.
    // Mirrors the file layout segmentParser.getModulePaths expects.
    function writeLocModule(moduleId, { faithful, localized }) {
      const seg = (id, text) => `<!-- SEG:${moduleId}:para:${id} -->\n${text}\n`;
      const base = join(booksDir, BOOK);
      const files = [
        ['02-for-mt/ch03', `${moduleId}-segments.en.md`, seg('a', 'EN one') + '\n' + seg('b', 'EN two')],
        ['03-faithful-translation/ch03', `${moduleId}-segments.is.md`, seg('a', faithful[0]) + '\n' + seg('b', faithful[1])],
      ];
      if (localized) {
        files.push([
          '04-localized-content/ch03',
          `${moduleId}-segments.is.md`,
          seg('a', localized[0]) + '\n' + seg('b', localized[1]),
        ]);
      }
      for (const [dir, name, content] of files) {
        mkdirSync(join(base, dir), { recursive: true });
        writeFileSync(join(base, dir, name), content);
      }
    }

    it('keeps independent version counters per track for the same module', () => {
      const segs = [{ segmentId: 'mX:para:a', content: 'A' }];
      contentVersionService.snapshotModule(BOOK, 3, 'mX', segs, 'ed1');
      contentVersionService.snapshotModule(BOOK, 3, 'mX', segs, 'ed1');
      contentVersionService.snapshotModule(BOOK, 3, 'mX', segs, 'ed1', undefined, 'localized');
      expect(contentVersionService.getModuleVersions(BOOK, 'mX').map((v) => v.version)).toEqual([2, 1]);
      expect(
        contentVersionService.getModuleVersions(BOOK, 'mX', 'localized').map((v) => v.version)
      ).toEqual([1]);
    });

    it('throws TypeError on unknown track', () => {
      expect(() => contentVersionService.getModuleVersions(BOOK, 'mX', 'mt-preview')).toThrow(
        TypeError
      );
      expect(() =>
        contentVersionService.restoreVersion(BOOK, 3, 'mX', 1, {}, 'mt-preview')
      ).toThrow(TypeError);
    });

    it('localized restore round-trips through the localized file', () => {
      writeLocModule('m77001', {
        faithful: ['trúr A', 'trúr B'],
        localized: ['staðfært A v1', 'staðfært B v1'],
      });
      // Snapshot the v1 localized state (as saveLocalizedWithSnapshot would pre-write)
      contentVersionService.snapshotModule(
        BOOK,
        3,
        'm77001',
        [
          { segmentId: 'm77001:para:a', content: 'staðfært A v1' },
          { segmentId: 'm77001:para:b', content: 'staðfært B v1' },
        ],
        'ed1',
        undefined,
        'localized'
      );
      // Editor writes v2 on disk
      segmentParser.saveLocalizedSegments(BOOK, 3, 'm77001', [
        { segmentId: 'm77001:para:a', content: 'staðfært A v2' },
        { segmentId: 'm77001:para:b', content: 'staðfært B v2' },
      ]);

      const result = contentVersionService.restoreVersion(BOOK, 3, 'm77001', 1, {}, 'localized');
      expect(result.segmentsRestored).toBe(2);
      expect(result.snapshotVersion).toBe(2); // current v2 content snapshotted first

      const filePath = join(booksDir, BOOK, '04-localized-content/ch03/m77001-segments.is.md');
      let file = readFileSync(filePath, 'utf-8');
      expect(file).toContain('staðfært A v1');
      expect(file).not.toContain('staðfært A v2');
      // Faithful history untouched by localized activity
      expect(contentVersionService.getModuleVersions(BOOK, 'm77001')).toEqual([]);

      // Restore is itself reversible: roll forward to the pre-restore snapshot (v2)
      const forward = contentVersionService.restoreVersion(BOOK, 3, 'm77001', 2, {}, 'localized');
      expect(forward.segmentsRestored).toBe(2);
      file = readFileSync(filePath, 'utf-8');
      expect(file).toContain('staðfært A v2');
    });

    it('localized current-content field is hasLocalized ? localized : faithful', () => {
      writeLocModule('m77002', { faithful: ['trúr A', 'trúr B'] }); // NO localized file yet
      // Snapshot v1 then create a localized file so restore has a writer target
      contentVersionService.snapshotModule(
        BOOK,
        3,
        'm77002',
        [
          { segmentId: 'm77002:para:a', content: 'fyrsta staðfærsla' },
          { segmentId: 'm77002:para:b', content: '' },
        ],
        'ed1',
        undefined,
        'localized'
      );
      segmentParser.saveLocalizedSegments(BOOK, 3, 'm77002', [
        { segmentId: 'm77002:para:a', content: 'önnur staðfærsla' },
        { segmentId: 'm77002:para:b', content: 'ný staðfærsla B' },
      ]);
      const result = contentVersionService.restoreVersion(BOOK, 3, 'm77002', 1, {}, 'localized');
      expect(result.segmentsRestored).toBe(2);
      // The pre-restore snapshot (v2) captured the CURRENT localized content
      const v2 = contentVersionService.getVersionContent(BOOK, 'm77002', 2, 'localized');
      expect(v2.find((s) => s.segment_id === 'm77002:para:a').content).toBe('önnur staðfærsla');
      // Empty string from v1 restored verbatim (F19: empties are recorded)
      const file = readFileSync(
        join(booksDir, BOOK, '04-localized-content/ch03/m77002-segments.is.md'),
        'utf-8'
      );
      expect(file).toContain('fyrsta staðfærsla');
    });
  });
```

Adjust helper naming/paths to the file's existing conventions (`booksDir`/`BOOK` etc. — the harness defines them; read the file's setup block first and reuse rather than duplicate).

- [ ] **Step 2: Run to verify the new tests fail**

Run: `npx vitest run server/__tests__/contentVersionService.test.js`
Expected: FAIL — no `track` param (extra args ignored today → wrong counters / no TypeError / restore writes the FAITHFUL file). Pre-existing tests stay green (their calls omit track → default).

- [ ] **Step 3: Implement**

In `server/services/contentVersionService.js`:

(a) Add near the top (after the requires):

```js
// item 15: the two content tracks that carry version history. Each entry
// wires the loader, the editable-content field, the writer, and the
// post-write cache hooks for restoreVersion.
const TRACKS = {
  faithful: {
    load: (book, chapter, moduleId) => segmentParser.loadModuleForEditing(book, chapter, moduleId),
    currentContent: (seg) => seg.is || '',
    write: (book, chapter, moduleId, segments) =>
      segmentParser.saveModuleSegments(book, chapter, moduleId, segments),
    runPostWriteHooks: true,
  },
  localized: {
    load: (book, chapter, moduleId) =>
      segmentParser.loadModuleForLocalization(book, chapter, moduleId),
    // The loc editor's editable baseline: localized when present, else faithful.
    currentContent: (seg) => (seg.hasLocalized ? seg.localized : seg.faithful) || '',
    write: (book, chapter, moduleId, segments) =>
      segmentParser.saveLocalizedSegments(book, chapter, moduleId, segments),
    // TM regen + concordance both consume FAITHFUL content — a localized
    // restore must refresh neither.
    runPostWriteHooks: false,
  },
};

function trackConfig(track) {
  const cfg = TRACKS[track];
  if (!cfg) {
    throw new TypeError(`Unknown content track: ${JSON.stringify(track)}`);
  }
  return cfg;
}
```

(b) `snapshotModule(book, chapter, moduleId, segments, appliedBy, db = getDb(), track = 'faithful')` — call `trackConfig(track)` first (validation), add `AND track = ?` to the MAX query and `track` to the INSERT column list/values.

(c) `getModuleVersions(book, moduleId, track = 'faithful')`, `getVersionContent(book, moduleId, version, track = 'faithful')`, `getSegmentHistory(book, moduleId, segmentId, track = 'faithful')` — validate via `trackConfig(track)`, add `AND track = ?` to each WHERE.

(d) `restoreVersion(book, chapter, moduleId, version, restoredBy = {}, track = 'faithful')`:
- `const cfg = trackConfig(track);` first.
- Step 1: `getVersionContent(book, moduleId, version, track)`.
- Step 2: `const data = cfg.load(book, chapter, moduleId);`
- Step 3: `currentSegments` built with `content: cfg.currentContent(seg)`; `snapshotModule(..., actorName, getDb(), track)`.
- Step 4 (rebuild/triage): unchanged except `seg.is || ''` → `cfg.currentContent(seg)`.
- Step 5: `const savedPath = cfg.write(book, chapter, moduleId, restoredSegments);`
- Hooks: wrap the existing tmService/concordance block in `if (cfg.runPostWriteHooks) { ... }`.
- Activity: add `track` to `metadata`.

- [ ] **Step 4: Run to verify green**

Run: `npx vitest run server/__tests__/contentVersionService.test.js`
Expected: PASS (new + all pre-existing).

- [ ] **Step 5: Commit**

```bash
git add server/services/contentVersionService.js server/__tests__/contentVersionService.test.js
git commit -m "feat(item15): contentVersionService parameterized by track — localized snapshots, restore, no faithful-cache hooks"
```

---

### Task 3: `saveLocalizedWithSnapshot` wrapper + all three write sites

**Files:**
- Modify: `server/services/contentVersionService.js` (add wrapper + export)
- Modify: `server/routes/localization-editor.js:406` (`/save`) and `:616` (`/save-all`) — the two `segmentParser.saveLocalizedSegments(...)` calls
- Modify: `server/services/localizationReviewService.js:248` (`approveAndApply` write)
- Test: `server/__tests__/locApproveSnapshot.test.js` (create — the I12-M1/M3 test lives here)

**Interfaces:**
- Consumes: Task 2's `snapshotModule(..., track)` and `TRACKS.localized`.
- Produces: `saveLocalizedWithSnapshot(book, chapter, moduleId, segments, actor)` → returns `{ savedPath }`; `actor` is a display string (username). Snapshot failure logged via `log.error`, never thrown.

- [ ] **Step 1: Write the failing test**

Create `server/__tests__/locApproveSnapshot.test.js`:

```js
/**
 * approveAndApply × content snapshots (item 15; closes I12-M3, documents I12-M1).
 * Pins: (1) a localized snapshot of the PRE-approval content exists after
 * approval; (2) F3 ordering survives: when the status-UPDATE transaction
 * throws AFTER the file write, the file carries the new content, the edit row
 * stays 'pending', and a retry approve succeeds (idempotent rewrite).
 * Residual documented (I12-M1): rejecting after such a partial approval
 * leaves the written content live — rejectEdit never touches files.
 */
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

const work = mkdtempSync(path.join(tmpdir(), 'loc-snap-'));
process.env.SESSIONS_DB_PATH = path.join(work, 'sessions.db');
process.env.JWT_SECRET = process.env.JWT_SECRET || 'prufa-leyndarmal';

const BOOK = 'synthetic-loc-snap-book';
const MODULE = 'mLSNAP1';
const SEG_A = `${MODULE}:para:a`;

let review;
let contentVersionService;
let segmentParser;
let realBooksDir;
let db;

beforeAll(() => {
  const { runAllMigrations } = require('../services/migrationRunner');
  runAllMigrations();

  segmentParser = require('../services/segmentParser');
  realBooksDir = segmentParser.BOOKS_DIR;
  const booksDir = path.join(work, 'books');
  const seg = (id, text) => `<!-- SEG:${MODULE}:para:${id} -->\n${text}\n`;
  mkdirSync(path.join(booksDir, BOOK, '02-for-mt/ch01'), { recursive: true });
  mkdirSync(path.join(booksDir, BOOK, '03-faithful-translation/ch01'), { recursive: true });
  mkdirSync(path.join(booksDir, BOOK, '04-localized-content/ch01'), { recursive: true });
  writeFileSync(path.join(booksDir, BOOK, '02-for-mt/ch01', `${MODULE}-segments.en.md`), seg('a', 'EN a'));
  writeFileSync(
    path.join(booksDir, BOOK, '03-faithful-translation/ch01', `${MODULE}-segments.is.md`),
    seg('a', 'trúr a')
  );
  writeFileSync(
    path.join(booksDir, BOOK, '04-localized-content/ch01', `${MODULE}-segments.is.md`),
    seg('a', 'staðfært gamalt')
  );
  segmentParser._setTestBooksDir(booksDir);

  review = require('../services/localizationReviewService');
  contentVersionService = require('../services/contentVersionService');
  const Database = require('better-sqlite3');
  db = new Database(process.env.SESSIONS_DB_PATH);
});

afterAll(() => {
  segmentParser._setTestBooksDir(realBooksDir);
  db.close();
  rmSync(work, { recursive: true, force: true });
});

function submitPending(content) {
  return review.submitEdit({
    book: BOOK,
    chapter: 1,
    moduleId: MODULE,
    segmentId: SEG_A,
    originalContent: 'staðfært gamalt',
    editedContent: content,
    category: null,
    editorId: 'ed1',
    editorUsername: 'editor1',
  });
}

const locFile = () =>
  readFileSync(
    path.join(work, 'books', BOOK, '04-localized-content/ch01', `${MODULE}-segments.is.md`),
    'utf-8'
  );

describe('approveAndApply snapshots + write-then-mark (I12-M3)', () => {
  it('records a localized snapshot of the pre-approval content', () => {
    const { id } = submitPending('staðfært nýtt');
    review.approveAndApply(id, 'he1', 'headeditor', null);
    expect(locFile()).toContain('staðfært nýtt');
    const versions = contentVersionService.getModuleVersions(BOOK, MODULE, 'localized');
    expect(versions.length).toBe(1);
    const v1 = contentVersionService.getVersionContent(BOOK, MODULE, 1, 'localized');
    expect(v1.find((s) => s.segment_id === SEG_A).content).toBe('staðfært gamalt');
  });

  it('write-succeeds-DB-throws: file updated, row stays pending, retry succeeds', () => {
    const { id } = submitPending('staðfært þriðja');
    db.exec(`CREATE TRIGGER force_fail BEFORE UPDATE ON localization_pending_edits
             BEGIN SELECT RAISE(ABORT, 'forced-test-failure'); END;`);
    expect(() => review.approveAndApply(id, 'he1', 'headeditor', null)).toThrow(/forced/);
    // F3 contract observable: the file HAS the new content...
    expect(locFile()).toContain('staðfært þriðja');
    // ...and the row is still pending (retryable, rejectable — I12-M1 residual:
    // rejecting NOW would leave 'staðfært þriðja' silently live in the file).
    const row = db.prepare(`SELECT status FROM localization_pending_edits WHERE id = ?`).get(id);
    expect(row.status).toBe('pending');
    db.exec(`DROP TRIGGER force_fail;`);
    const result = review.approveAndApply(id, 'he1', 'headeditor', null);
    expect(result.savedPath).toBeTruthy();
    expect(db.prepare(`SELECT status FROM localization_pending_edits WHERE id = ?`).get(id).status).toBe(
      'approved'
    );
  });
});
```

(If `submitEdit`'s return shape differs from `{ id }`, read `localizationReviewService.submitEdit` and adapt the destructuring — the service is the authority.)

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run server/__tests__/locApproveSnapshot.test.js`
Expected: first test FAILS — `getModuleVersions(..., 'localized')` returns `[]` (no snapshot hook exists yet). The trigger test may partially pass (F3 ordering already holds) — its snapshot-related expectations come live with the wrapper.

- [ ] **Step 3: Implement the wrapper**

In `server/services/contentVersionService.js`, add and export:

```js
/**
 * The single localized write path (item 15): snapshot current content, then
 * write. All writers of 04-localized-content/ MUST go through this — the
 * snapshot lives here (not in segmentParser) because segmentParser cannot
 * require this service (require cycle).
 *
 * Snapshot failure is logged loud but never blocks the save (parity with the
 * faithful apply hook's posture).
 *
 * @param {string} book
 * @param {number} chapter
 * @param {string} moduleId
 * @param {Array<{segmentId: string, content: string}>} segments - new content to write
 * @param {string} [actor] - username for the snapshot's applied_by
 * @returns {{ savedPath: string }}
 */
function saveLocalizedWithSnapshot(book, chapter, moduleId, segments, actor) {
  try {
    const data = segmentParser.loadModuleForLocalization(book, chapter, moduleId);
    const current = data.segments.map((seg) => ({
      segmentId: seg.segmentId,
      content: TRACKS.localized.currentContent(seg),
    }));
    snapshotModule(book, chapter, moduleId, current, actor, getDb(), 'localized');
  } catch (err) {
    log.error({ err, book, moduleId }, 'Localized pre-write snapshot failed (save proceeds)');
  }
  const savedPath = segmentParser.saveLocalizedSegments(book, chapter, moduleId, segments);
  return { savedPath };
}
```

Add `saveLocalizedWithSnapshot,` to `module.exports`.

- [ ] **Step 4: Switch the three write sites**

(a) `server/routes/localization-editor.js` — add `const contentVersionService = require('../services/contentVersionService');` to the require block, then at BOTH sites (`:406` `/save`, `:616` `/save-all`) replace

```js
      const savedPath = segmentParser.saveLocalizedSegments(
        req.params.book,
        req.chapterNum,
        req.params.moduleId,
        segments            // (allSegments in the /save-all site)
      );
```

with

```js
      const { savedPath } = contentVersionService.saveLocalizedWithSnapshot(
        req.params.book,
        req.chapterNum,
        req.params.moduleId,
        segments,           // (allSegments in the /save-all site)
        req.user.username
      );
```

(b) `server/services/localizationReviewService.js` — add the same require, and replace the `segmentParser.saveLocalizedSegments(edit.book, edit.chapter, edit.module_id, segments)` call at `:248` with

```js
  const { savedPath } = contentVersionService.saveLocalizedWithSnapshot(
    edit.book,
    edit.chapter,
    edit.module_id,
    segments,
    reviewerUsername
  );
```

(the F3 comment block above it stays; the snapshot slots in front of the file write, inside the same "before any status change" position). Check for a require cycle: `contentVersionService` does NOT require `localizationReviewService` (verified — its requires are segmentParser/activityLog/tmService/concordanceService), so this direction is safe.

- [ ] **Step 5: Run to verify green + neighbors**

Run: `npx vitest run server/__tests__/locApproveSnapshot.test.js server/__tests__/contentVersionService.test.js server/__tests__/locApproveConflict.test.js server/__tests__/localizationReviewService.test.js`
(If the last file doesn't exist under that name, run the loc-review suites that do — `ls server/__tests__ | grep -i localization`.)
Expected: PASS across the board.

- [ ] **Step 6: Commit**

```bash
git add server/services/contentVersionService.js server/routes/localization-editor.js server/services/localizationReviewService.js server/__tests__/locApproveSnapshot.test.js
git commit -m "feat(item15): saveLocalizedWithSnapshot — single localized write path with pre-write snapshots (closes I12-M3 test gap)"
```

---

### Task 4: Localized version routes (mirror faithful) + lock/mtime composition

**Files:**
- Modify: `server/routes/localization-editor.js` (add 4 routes; follows the faithful block at `routes/segment-editor.js:1248-1345` exactly)
- Test: `server/__tests__/locRestoreRoutes.test.js` (create)

**Interfaces:**
- Consumes: Task 2's service signatures; the file's existing `acquireModuleLock` (`localization-editor.js:53`) and `segmentParser.getLocalizedMtime`.
- Produces: under `/api/localization-editor`: GET `/:book/:chapter/:moduleId/versions`, GET `.../versions/:version`, GET `.../version-history/:segmentId` (EDITOR), POST `.../restore/:version` (HEAD_EDITOR + `{confirm:true}`) → `{ success, ...restoreResult, lastModified }`.

- [ ] **Step 1: Write the failing test**

Create `server/__tests__/locRestoreRoutes.test.js` (router.stack idiom; same env preamble as `locApproveSnapshot.test.js` — `SESSIONS_DB_PATH` + `JWT_SECRET` before any require, `runAllMigrations`, fixture book with EN/faithful/localized files for one module, `_setTestBooksDir`, restore in afterAll):

```js
/**
 * Localized version routes (item 15) — handler-level tests via router.stack
 * extraction (bypasses requireAuth/requireHeadEditor; authz composition is
 * pinned by asserting the middleware stack, not by invoking it).
 */
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

const work = mkdtempSync(path.join(tmpdir(), 'loc-routes-'));
process.env.SESSIONS_DB_PATH = path.join(work, 'sessions.db');
process.env.JWT_SECRET = process.env.JWT_SECRET || 'prufa-leyndarmal';

const BOOK = 'synthetic-loc-routes-book';
const MODULE = 'mLROUT1';

let router;
let versionsHandler;
let restoreHandler;
let restoreLayer;
let saveHandler;
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
  const seg = (id, text) => `<!-- SEG:${MODULE}:para:${id} -->\n${text}\n`;
  mkdirSync(path.join(booksDir, BOOK, '02-for-mt/ch01'), { recursive: true });
  mkdirSync(path.join(booksDir, BOOK, '03-faithful-translation/ch01'), { recursive: true });
  mkdirSync(path.join(booksDir, BOOK, '04-localized-content/ch01'), { recursive: true });
  writeFileSync(
    path.join(booksDir, BOOK, '02-for-mt/ch01', `${MODULE}-segments.en.md`),
    seg('a', 'EN a')
  );
  writeFileSync(
    path.join(booksDir, BOOK, '03-faithful-translation/ch01', `${MODULE}-segments.is.md`),
    seg('a', 'trúr a')
  );
  writeFileSync(
    path.join(booksDir, BOOK, '04-localized-content/ch01', `${MODULE}-segments.is.md`),
    seg('a', 'staðfært v1')
  );
  segmentParser._setTestBooksDir(booksDir);

  router = require('../routes/localization-editor');
  const find = (p, method) =>
    router.stack.find((l) => l.route && l.route.path === p && l.route.methods[method]);
  versionsHandler = find('/:book/:chapter/:moduleId/versions', 'get').route.stack.at(-1).handle;
  restoreLayer = find('/:book/:chapter/:moduleId/restore/:version', 'post');
  restoreHandler = restoreLayer.route.stack.at(-1).handle;
  saveHandler = find('/:book/:chapter/:moduleId/save', 'post').route.stack.at(-1).handle;
});

afterAll(() => {
  segmentParser._setTestBooksDir(realBooksDir);
  rmSync(work, { recursive: true, force: true });
});

describe('localized version routes', () => {
  it('restore route mounts requireHeadEditor in its middleware stack', () => {
    const names = restoreLayer.route.stack.map((l) => l.handle.name);
    // requireHeadEditor() returns a named middleware; assert it is present
    expect(names.join(',')).toMatch(/headEditor/i);
  });

  it('restore 400s without { confirm: true }', async () => {
    const r = await invoke(restoreHandler, {
      params: { book: BOOK, chapter: '1', moduleId: MODULE, version: '1' },
      chapterNum: 1,
      body: {},
      user: { id: 'he1', username: 'headeditor' },
    });
    expect(r.status).toBe(400);
  });

  it('restore 404s an unknown version', async () => {
    const r = await invoke(restoreHandler, {
      params: { book: BOOK, chapter: '1', moduleId: MODULE, version: '99' },
      chapterNum: 1,
      body: { confirm: true },
      user: { id: 'he1', username: 'headeditor' },
    });
    expect(r.status).toBe(404);
  });

  it('lists versions and restores, returning fresh lastModified', async () => {
    // seed: snapshot v1 via the wrapper by simulating a save of v2
    const contentVersionService = require('../services/contentVersionService');
    contentVersionService.saveLocalizedWithSnapshot(BOOK, 1, MODULE, [
      { segmentId: `${MODULE}:para:a`, content: 'staðfært v2' },
    ], 'editor1');

    const list = await invoke(versionsHandler, {
      params: { book: BOOK, chapter: '1', moduleId: MODULE },
      chapterNum: 1,
    });
    expect(list.status).toBe(200);
    expect(list.body.versions.length).toBe(1);

    const r = await invoke(restoreHandler, {
      params: { book: BOOK, chapter: '1', moduleId: MODULE, version: '1' },
      chapterNum: 1,
      body: { confirm: true },
      user: { id: 'he1', username: 'headeditor' },
    });
    expect(r.status).toBe(200);
    expect(r.body.snapshotVersion).toBe(2);
    expect(typeof r.body.lastModified).toBe('number');

    expect(r.body.lastModified).toBe(segmentParser.getLocalizedMtime(BOOK, 1, MODULE));
  });

  it('a save carrying a pre-restore lastModified token 409s (conflict composition)', async () => {
    const staleToken = segmentParser.getLocalizedMtime(BOOK, 1, MODULE);
    // Restore bumps the file mtime (previous test restored to v1; restore again
    // to the newest snapshot so this test is order-independent within the file).
    const versions = require('../services/contentVersionService').getModuleVersions(
      BOOK,
      MODULE,
      'localized'
    );
    await invoke(restoreHandler, {
      params: { book: BOOK, chapter: '1', moduleId: MODULE, version: String(versions[0].version) },
      chapterNum: 1,
      body: { confirm: true },
      user: { id: 'he1', username: 'headeditor' },
    });
    const r = await invoke(saveHandler, {
      params: { book: BOOK, chapter: '1', moduleId: MODULE },
      chapterNum: 1,
      body: {
        segmentId: `${MODULE}:para:a`,
        content: 'árekstur',
        lastModified: staleToken,
      },
      user: { id: 'ed1', username: 'editor1' },
    });
    expect(r.status).toBe(409);
  });
});
```

Note on the 409 test: the `/save` handler checks the `lastModified` precondition before writing (the existing conflict machinery); if fixture-file mtime granularity makes `staleToken` equal the post-restore mtime on a fast filesystem, insert a `await new Promise((r) => setTimeout(r, 20))` before the restore call. If the handler's guard order rejects the request for a different reason first (e.g., a structure guard), read the handler and supply the minimal extra body fields it requires — the assertion stays `409`.

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run server/__tests__/locRestoreRoutes.test.js`
Expected: FAIL — the route paths don't exist (`find(...)` returns undefined).

- [ ] **Step 3: Implement the four routes**

In `server/routes/localization-editor.js`, append (before `module.exports = router;`), mirroring `routes/segment-editor.js:1248-1345` with these deltas — service calls pass `'localized'` as track, the restore wraps in the module lock and returns fresh mtime, and the per-segment history path is `version-history/:segmentId` (the existing `/:segmentId/history` audit-log route stays untouched):

```js
/**
 * GET /:book/:chapter/:moduleId/versions — localized content version list (item 15).
 */
router.get(
  '/:book/:chapter/:moduleId/versions',
  requireAuth,
  requireRole(ROLES.EDITOR),
  validateBookChapter,
  (req, res) => {
    try {
      const versions = contentVersionService.getModuleVersions(
        req.params.book,
        req.params.moduleId,
        'localized'
      );
      res.json({ versions });
    } catch (err) {
      log.error({ err }, 'Error loading localized versions');
      res.status(500).json({ error: err.message });
    }
  }
);

/**
 * GET /:book/:chapter/:moduleId/versions/:version — one localized version's segments.
 */
router.get(
  '/:book/:chapter/:moduleId/versions/:version',
  requireAuth,
  requireRole(ROLES.EDITOR),
  validateBookChapter,
  (req, res) => {
    try {
      const segments = contentVersionService.getVersionContent(
        req.params.book,
        req.params.moduleId,
        parseInt(req.params.version, 10),
        'localized'
      );
      res.json({ segments });
    } catch (err) {
      log.error({ err }, 'Error loading localized version content');
      res.status(500).json({ error: err.message });
    }
  }
);

/**
 * GET /:book/:chapter/:moduleId/version-history/:segmentId — per-segment
 * localized snapshot history. Distinct from GET /:segmentId/history, which
 * serves the localization_edits audit log.
 */
router.get(
  '/:book/:chapter/:moduleId/version-history/:segmentId',
  requireAuth,
  requireRole(ROLES.EDITOR),
  validateBookChapter,
  (req, res) => {
    try {
      const history = contentVersionService.getSegmentHistory(
        req.params.book,
        req.params.moduleId,
        req.params.segmentId,
        'localized'
      );
      res.json({ history });
    } catch (err) {
      log.error({ err }, 'Error loading localized segment history');
      res.status(500).json({ error: err.message });
    }
  }
);

/**
 * POST /:book/:chapter/:moduleId/restore/:version — restore localized content
 * to a previous snapshot. Head-editor only; requires { confirm: true }.
 * Takes the module lock (restore is a write) and returns the fresh mtime so
 * clients update lastModified; an editor holding a stale token 409s on their
 * next save — restore composes with the conflict machinery, not around it.
 */
router.post(
  '/:book/:chapter/:moduleId/restore/:version',
  requireAuth,
  requireHeadEditor(),
  validateBookChapter,
  validateModule,
  async (req, res) => {
    const version = parseInt(req.params.version, 10);
    if (!Number.isInteger(version) || version < 1) {
      return res.status(400).json({ error: `Invalid version: ${req.params.version}` });
    }
    if (req.body?.confirm !== true) {
      return res.status(400).json({
        error: 'Confirmation required',
        message: 'Pass { "confirm": true } to restore this module to a previous version',
      });
    }

    const lockKey = `${req.params.book}/${req.chapterNum}/${req.params.moduleId}`;
    const release = await acquireModuleLock(lockKey);
    try {
      const result = contentVersionService.restoreVersion(
        req.params.book,
        req.chapterNum,
        req.params.moduleId,
        version,
        { userId: req.user.id, username: req.user.username },
        'localized'
      );
      const lastModified = segmentParser.getLocalizedMtime(
        req.params.book,
        req.chapterNum,
        req.params.moduleId
      );
      res.json({ success: true, ...result, lastModified });
    } catch (err) {
      log.error({ err }, 'Error restoring localized version');
      const status = err.message.includes('not found') ? 404 : 500;
      res.status(status).json({ error: err.message });
    } finally {
      release();
    }
  }
);
```

Check the file's existing requires: `requireHeadEditor`, `requireRole`, `ROLES`, `validateModule` may need adding to the import lines (the save routes already import `requireAuth`, `validateBookChapter`, `contentVersionService` from Task 3). Match the exact `lockKey` construction used at `:318` — read it and reuse its format verbatim (if it differs from the template above, the file is the authority).

- [ ] **Step 4: Run to verify green**

Run: `npx vitest run server/__tests__/locRestoreRoutes.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/routes/localization-editor.js server/__tests__/locRestoreRoutes.test.js
git commit -m "feat(item15): localized version routes — list/content/segment-history + head-editor restore with lock and fresh mtime"
```

---

### Task 5: "Útgáfusaga" modal in the localization editor

**Files:**
- Modify: `server/views/localization-editor.html` (toolbar button + modal markup + vh CSS)
- Modify: `server/public/js/localization-editor.js` (ed-prefixed port of the three functions + wiring)

**Interfaces:**
- Consumes: Task 4's routes; existing state `edCurrentBook`/`edCurrentChapter`/`edCurrentModuleId`, `edLastModified`, `ED_API_BASE`, `edIsHeadEditor()`, `edLoadModule(moduleId)`, `escapeHtml`, `fetchJson`, `saveRetry.showToast`.
- Produces: UI only; no downstream consumers.

- [ ] **Step 1: HTML — button, modal, CSS**

In `server/views/localization-editor.html`:

(a) In the `.toolbar` inside `.module-header` (line ~1465, next to `#btn-save-all`), add:

```html
                <button class="btn btn-secondary" id="ed-btn-history" hidden
                        title="Skoða eldri útgáfur og færa einingu aftur í fyrri útgáfu">
                  Útgáfusaga
                </button>
```

(b) Before the closing `</body>` script block, add the modal (port of segment-editor.html:1532-1540, ed-prefixed ids, plus the I12-R4 caption — Task 6 adds the same caption to the faithful modal):

```html
  <div class="vh-overlay" id="ed-vh-overlay">
    <div class="vh-modal" role="dialog" aria-modal="true" aria-labelledby="ed-vh-title">
      <header>
        <h3 id="ed-vh-title">Útgáfusaga</h3>
        <button class="btn btn-secondary btn-sm" id="ed-vh-close" title="Loka">Loka</button>
      </header>
      <p class="vh-caption">Hver útgáfa sýnir efnið eins og það var <strong>áður en</strong> viðkomandi vistun átti sér stað.</p>
      <div class="vh-list" id="ed-vh-list"></div>
    </div>
  </div>
```

(c) Copy the `.vh-overlay`/`.vh-modal`/`.vh-list`/`.vh-row`/`.vh-meta`/`.vh-ver`/`.vh-sub`/`.vh-empty` CSS block from segment-editor.html (lines 1252-~1300 — copy the whole vh-prefixed rule set verbatim) into this file's `<style>` section, and add:

```css
      .vh-caption { margin: 0; padding: 8px 16px; font-size: 0.85em; color: var(--text-muted, #666); border-bottom: 1px solid var(--border, #e2e2e2); }
```

- [ ] **Step 2: JS — port the three functions**

In `server/public/js/localization-editor.js` (inside the IIFE, near the other ed* module functions), add — a direct port of segment-editor.js:2036-2145 with ed-prefixed names/ids, `ED_API_BASE`, and the `edLastModified` update:

```js
  function edVhFormatDate(raw) {
    if (!raw) return '';
    const d = new Date(raw.replace(' ', 'T') + 'Z');
    return isNaN(d.getTime()) ? raw : d.toLocaleString('is-IS');
  }

  function edCloseVersionHistory() {
    document.getElementById('ed-vh-overlay').classList.remove('active');
  }

  async function edOpenVersionHistory() {
    const overlay = document.getElementById('ed-vh-overlay');
    const list = document.getElementById('ed-vh-list');
    list.innerHTML = '<div class="vh-empty">Hleður…</div>';
    overlay.classList.add('active');

    try {
      const data = await fetchJson(
        `${ED_API_BASE}/${edCurrentBook}/${edCurrentChapter}/${edCurrentModuleId}/versions`,
        { credentials: 'include' }
      );
      const versions = data.versions || [];
      if (versions.length === 0) {
        list.innerHTML =
          '<div class="vh-empty">Engar eldri útgáfur. Útgáfur verða til þegar staðfærsla er vistuð.</div>';
        return;
      }

      const newest = versions[0].version;
      list.innerHTML = versions
        .map((v) => {
          const who = v.applied_by ? escapeHtml(v.applied_by) : '—';
          const when = escapeHtml(edVhFormatDate(v.applied_at));
          const latest = v.version === newest ? ' · nýjasta' : '';
          return (
            '<div class="vh-row">' +
            '<div class="vh-meta">' +
            '<div><span class="vh-sub">' + who + ' · ' + when + '</span></div>' +
            '<div><span class="vh-ver">Útgáfa ' + v.version + '</span> <span class="vh-sub">(' +
            v.segments + ' einingar' + latest + ')</span></div>' +
            '</div>' +
            '<button class="btn btn-secondary btn-sm vh-restore" data-version="' + v.version +
            '">Færa í þessa útgáfu</button>' +
            '</div>'
          );
        })
        .join('');

      list.querySelectorAll('.vh-restore').forEach((btn) => {
        btn.addEventListener('click', () =>
          edRestoreToVersion(parseInt(btn.getAttribute('data-version'), 10))
        );
      });
    } catch (err) {
      list.innerHTML =
        '<div class="vh-empty">Villa við að sækja sögu: ' + escapeHtml(err.message) + '</div>';
    }
  }

  async function edRestoreToVersion(version) {
    const ok = window.confirm(
      'Færa þessa einingu aftur í útgáfu ' +
        version +
        '?\n\nNúverandi efni er fyrst vistað sem ný útgáfa, svo þetta er afturkræft.'
    );
    if (!ok) return;

    try {
      const result = await fetchJson(
        `${ED_API_BASE}/${edCurrentBook}/${edCurrentChapter}/${edCurrentModuleId}/restore/${version}`,
        {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ confirm: true }),
        }
      );
      edCloseVersionHistory();
      if (result.lastModified) edLastModified = result.lastModified;
      if (saveRetry && saveRetry.showToast) {
        saveRetry.showToast(
          'Fært í útgáfu ' + version + ' (núverandi efni vistað sem útgáfa ' +
            result.snapshotVersion + ')',
          'success'
        );
      }
      await edLoadModule(edCurrentModuleId);
    } catch (err) {
      alert('Villa: ' + err.message);
    }
  }
```

Wiring (with the other event listeners; note the row layout leads with actor+date — the I12-R4 ordering):

```js
  document.getElementById('ed-btn-history').addEventListener('click', edOpenVersionHistory);
  document.getElementById('ed-vh-close').addEventListener('click', edCloseVersionHistory);
  document.getElementById('ed-vh-overlay').addEventListener('click', (e) => {
    if (e.target.id === 'ed-vh-overlay') edCloseVersionHistory();
  });
```

Head-editor gating: find where the module header/toolbar becomes visible after `edLoadModule` (and/or where `edIsHeadEditor()` already gates affordances) and add:

```js
    document.getElementById('ed-btn-history').hidden = !edIsHeadEditor();
```

(The button is `hidden` by default in the HTML; reveal only for head-editors, on module load. Also check `edLoadModule` refreshes `edLastModified` from its response — it does, via the module data's `lastModified`; if the variable is assigned elsewhere, match the file's idiom. If `alert('Villa: ' + ...)` deviates from this file's error idiom, use the file's — read a neighboring catch block.)

- [ ] **Step 3: Syntax check + focused suites**

Run: `node --check server/public/js/localization-editor.js`
Expected: clean.
Run: `npx vitest run server/__tests__/locRestoreRoutes.test.js server/__tests__/locApproveSnapshot.test.js`
Expected: PASS (no server changes in this task — regression guard only).

- [ ] **Step 4: Commit**

```bash
git add server/views/localization-editor.html server/public/js/localization-editor.js
git commit -m "feat(item15): Útgáfusaga modal in localization editor — head-editor restore with confirm + lastModified refresh"
```

---

### Task 6: I12-R4 — version-numbering wording in the faithful modal

**Files:**
- Modify: `server/views/segment-editor.html` (caption in the vh modal + `.vh-caption` CSS)
- Modify: `server/public/js/segment-editor.js:2065-2090` (row layout: actor+date first)

**Interfaces:** none — display-only; closes register item I12-R4 for BOTH editors (Task 5 already built the localized modal with the corrected layout).

- [ ] **Step 1: Caption + CSS in segment-editor.html**

In the vh modal (line ~1532-1540), after the `<header>` element add:

```html
      <p class="vh-caption">Hver útgáfa sýnir efnið eins og það var <strong>áður en</strong> viðkomandi vistun átti sér stað.</p>
```

and add the same `.vh-caption` CSS rule as Task 5 step 1(c) to this file's vh CSS block.

- [ ] **Step 2: Row layout in segment-editor.js**

In `openVersionHistory` (lines ~2065-2090), reorder each row's `.vh-meta` so the actor+date line comes FIRST and the version line second (exactly the Task-5 localized layout):

```js
            '<div class="vh-meta">' +
            '<div><span class="vh-sub">' + who + ' · ' + when + '</span></div>' +
            '<div><span class="vh-ver">Útgáfa ' + v.version + '</span> <span class="vh-sub">(' +
            v.segments + ' einingar' + latest + ')</span></div>' +
            '</div>' +
```

- [ ] **Step 3: Syntax check + commit**

Run: `node --check server/public/js/segment-editor.js` — clean.

```bash
git add server/views/segment-editor.html server/public/js/segment-editor.js
git commit -m "fix(item15): I12-R4 — version-history modals lead with actor+date and state pre-write snapshot semantics"
```

---

### Task 7: Full-suite gate + campaign register

**Files:**
- Modify: `docs/plans/2026-07-11-pre-semester-coding-campaign.md` (item-15 register block; close I12-R4/M1/M3 annotations)

**Interfaces:** none — docs + verification.

- [ ] **Step 1: Register block**

Insert after the item-14 register block (before `## Phase 4`):

```markdown
### Register — findings/deferrals from item 15 (2026-07-18)
- **I15-R1 `[ux]`** — pending-edit `original_content` diffs read stale against a restored baseline (drafts intentionally survive restore — approval imposes only that one segment); display/recompute decision when the review tier sees real use.
- **I15-R2 `[qa]`** — manual QA for the client work: history modal lists versions after saves; restore round-trips visibly and updates `lastModified`; an editor with a stale tab 409s on next save after someone restores; both editors' modals show the pre-write-semantics caption and actor-first rows.
- **I15-R3 `[note]`** — `approveAndApply` still takes no module lock and no mtime precondition (pre-existing, unchanged by item 15; more visible now that restore exists and does take the lock).
```

And annotate the item-12 register lines: **I12-R4** → append `**Closed by item 15** (caption + actor-first rows in both modals).`; **I12-M1..M7** → append to the entry: `M1 documented + M3 closed by item 15 (locApproveSnapshot.test.js pins write-then-mark incl. the DB-throw branch).`

- [ ] **Step 2: Gates**

Run (repo root): `npm test` — expected all green (record files/tests counts for the PR).
Run: `git status --porcelain books/` — empty.

- [ ] **Step 3: Commit**

```bash
git add docs/plans/2026-07-11-pre-semester-coding-campaign.md
git commit -m "docs(item15): register I15-R1..R3; close I12-R4/M3, document I12-M1"
```

---

## Completion

Full `npm test` green → final whole-branch review (campaign convention: 3-lens Fable workflow + 3-vote adversarial verify over the merge-base diff) → fix wave if needed → PR `fix(item15): localized restore parity (rem-2.2 + I12-R4/M1/M3)`. PR body: the track contract, the wrapper-as-single-write-path, restore/lock/mtime composition, register I15-R1..R3 + closed items, suite delta.
