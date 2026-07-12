# Fail-Loud Sweep Implementation Plan (Campaign Batch 4)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make audit-trail writes, DB opens, and admin/status failure paths fail loud through one code path each, per the approved design `docs/plans/2026-07-12-fail-loud-sweep-design.md` (D1–D10).

**Architecture:** `activityLog.log()` becomes never-throw (internal catch → pino error), which makes all 41 unguarded/silent call sites correct and lets us delete the 23 hand-rolled wrappers. Migration 040 takes schema ownership of the three service-created tables; all five eager-open services convert to the lazy `getDb()` + `_testDb`-first pattern with a lazily-built prepared-statements cache. userService's four read-side "no such table" swallows are deleted (write/read symmetry), and the dbUser-null enforcement decision moves into `hasChapterAccess`.

**Tech Stack:** Node 22 CJS in `server/`, Express 5, better-sqlite3, pino (single shared instance at `server/lib/logger.js`), Vitest (server project runs sequentially).

## Global Constraints

- Branch: `fix/fail-loud-sweep` (already created off `main` @ `b758dff6`; design doc committed as `9fda2019`). One PR at the end.
- Gate: `npm test` from the **repo root** (baseline 2201 tests green). Never claim success without running it.
- Commit after every task. lint-staged runs on commit; if eslint `no-unused-vars` flags a symbol a later task will use, scope the disable to the line and REMOVE it in that later task (B1-F1 lesson).
- Logger convention: `const log = require('../lib/logger')` — a single shared pino instance. **Exception:** inside `server/services/activityLog.js` import it as `logger` (the file exports a function named `log`).
- Log call shape: merged object first, message second — `log.error({ err, ...context }, 'Message')`.
- Resolve paths against `__dirname`/`resolveDbPath()`, never `process.cwd()`.
- Migrations export `{ name, up(db) }`; next free number is **040**. `migrationRunner.runAllMigrations()` picks up new files automatically, and `server/__tests__/migrationIdempotency.test.js` runs the whole chain twice — 040 gets idempotency coverage for free.
- Verified by spike (2026-07-12): `logger.error` is an own, writable, configurable property of the pino instance and the CJS cache shares one instance — `vi.spyOn(require('../lib/logger'), 'error')` intercepts calls made from any module. Use `.mockImplementation(() => {})` to keep test output clean and always `mockRestore()` in `afterEach`.
- The uniform lazy-DB pattern for this batch (used in Tasks 2, 4, 5 — repeated in each task so tasks are self-contained):

```js
let _testDb = null;
function _setTestDb(db) {
  _testDb = db;
  _stmts = null; // statements must be rebuilt against the new handle
}

let _db;
function getDb() {
  if (_testDb) return _testDb;
  if (!_db) {
    const dbDir = path.dirname(DB_PATH);
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }
    _db = new Database(DB_PATH);
    _db.pragma('journal_mode = WAL');
  }
  return _db;
}

let _stmts = null;
function stmts() {
  if (!_stmts) {
    _stmts = initStatements(getDb());
  }
  return _stmts;
}
```

  **Design amendment (record in Task 11):** the design's D4 said "inline `conn.prepare` per call"; this plan uses the lazily-built statements cache above instead — inline prepares would churn ~40 call sites across three files for zero robustness gain, while the cache keeps each file's existing SQL centralization. `_setTestDb` resets the cache, which also fixes the "statements point at a closed test DB" footgun.

---

### Task 1: Migration 040 — service-table ownership

**Files:**
- Create: `server/migrations/040-service-table-ownership.js`
- Create: `server/__tests__/migration040.test.js`

**Interfaces:**
- Produces: migration `040-service-table-ownership` creating `activity_log` (+4 indexes), `notifications` (+3 indexes), `notification_preferences` — the exact DDL Tasks 2 and 4 delete from the services. Test suites in Tasks 2 and 4 apply this migration to `:memory:` DBs via `require('../migrations/040-service-table-ownership').up(db)`.

- [ ] **Step 1: Write the failing test**

Create `server/__tests__/migration040.test.js`:

```js
/**
 * Migration 040 — service-table ownership
 *
 * activity_log / notifications / notification_preferences were created only
 * as an import-time side effect of their services. Batch 4 makes those
 * services lazy-open, so the schema must be migration-owned. This pins:
 * tables + indexes exist after up(), and up() is locally idempotent.
 * (Chain-level idempotency is covered by migrationIdempotency.test.js.)
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const Database = require('better-sqlite3');
const migration = require('../migrations/040-service-table-ownership');

let db;

beforeAll(() => {
  db = new Database(':memory:');
});

afterAll(() => {
  db.close();
});

function tableNames() {
  return db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
    .all()
    .map((r) => r.name);
}

function indexNames() {
  return db
    .prepare("SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_%' ORDER BY name")
    .all()
    .map((r) => r.name);
}

describe('migration 040', () => {
  it('exports the standard shape', () => {
    expect(migration.name).toBe('040-service-table-ownership');
    expect(typeof migration.up).toBe('function');
  });

  it('creates the three service tables', () => {
    migration.up(db);
    const tables = tableNames();
    expect(tables).toContain('activity_log');
    expect(tables).toContain('notifications');
    expect(tables).toContain('notification_preferences');
  });

  it('creates the verbatim index names the services used to create', () => {
    const idx = indexNames();
    expect(idx).toEqual(
      expect.arrayContaining([
        'idx_activity_log_type',
        'idx_activity_log_user_id',
        'idx_activity_log_book',
        'idx_activity_log_created_at',
        'idx_notifications_user_id',
        'idx_notifications_read',
        'idx_notifications_created_at',
      ])
    );
  });

  it('is idempotent when re-run on the same database', () => {
    expect(() => migration.up(db)).not.toThrow();
  });

  it('activity_log enforces the NOT NULL audit columns', () => {
    expect(() =>
      db.prepare('INSERT INTO activity_log (type) VALUES (?)').run('x')
    ).toThrow(/NOT NULL/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run server/__tests__/migration040.test.js`
Expected: FAIL — `Cannot find module '../migrations/040-service-table-ownership'`

- [ ] **Step 3: Write the migration**

Create `server/migrations/040-service-table-ownership.js`. The DDL is copied **verbatim** from `server/services/activityLog.js:65-83` and `server/services/notifications.js:98-122` (same table bodies, same index names — that is what makes this a no-op on existing production DBs):

```js
/**
 * Migration: take ownership of service-created tables
 *
 * activity_log, notifications, and notification_preferences were created
 * only as an import-time side effect of activityLog.js / notifications.js.
 * The fail-loud sweep (batch 4) makes those services lazy-open, so the
 * schema moves here, where every other table is owned. IF NOT EXISTS +
 * verbatim table/index DDL keeps this a no-op on databases that already
 * have the tables.
 */

module.exports = {
  name: '040-service-table-ownership',

  up(db) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS activity_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        type TEXT NOT NULL,
        user_id TEXT NOT NULL,
        username TEXT NOT NULL,
        book TEXT,
        chapter TEXT,
        section TEXT,
        description TEXT NOT NULL,
        metadata TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_activity_log_type ON activity_log(type);
      CREATE INDEX IF NOT EXISTS idx_activity_log_user_id ON activity_log(user_id);
      CREATE INDEX IF NOT EXISTS idx_activity_log_book ON activity_log(book);
      CREATE INDEX IF NOT EXISTS idx_activity_log_created_at ON activity_log(created_at);

      CREATE TABLE IF NOT EXISTS notifications (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        type TEXT NOT NULL,
        title TEXT NOT NULL,
        message TEXT NOT NULL,
        link TEXT,
        metadata TEXT,
        read INTEGER DEFAULT 0,
        email_sent INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
      CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(read);
      CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at);

      CREATE TABLE IF NOT EXISTS notification_preferences (
        user_id TEXT PRIMARY KEY,
        preferences TEXT NOT NULL,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);
  },
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run server/__tests__/migration040.test.js server/__tests__/migrationIdempotency.test.js`
Expected: both PASS (idempotency runs the whole chain twice and now includes 040).

- [ ] **Step 5: Commit**

```bash
git add server/migrations/040-service-table-ownership.js server/__tests__/migration040.test.js
git commit -m "feat(db): migration 040 owns activity_log + notifications tables (was import-time service DDL)"
```

---

### Task 2: `activityLog.js` — lazy open + never-throw `log()`

**Files:**
- Modify: `server/services/activityLog.js` (whole file restructure; exports gain `_setTestDb`)
- Create: `server/__tests__/activityLogNeverThrow.test.js`
- Modify: `server/__tests__/activityLogging.test.js` (its `search()` block currently only passes on CI **because** the eager import created the tables — that crutch disappears)

**Interfaces:**
- Consumes: migration 040 (`require('../migrations/040-service-table-ownership').up(db)` for test schema).
- Produces: `activityLog.log(options)` → row-info object on success, **`null` on any failure, never throws**; `activityLog._setTestDb(db)` (null restores production path); read functions (`getRecent`, `getByUser`, `getByBook`, `getBySection`, `search`) unchanged in signature and still throw on failure (their route callers already log + 500). Task 3 relies on `log()` never throwing.

- [ ] **Step 1: Write the failing tests**

Create `server/__tests__/activityLogNeverThrow.test.js`:

```js
/**
 * activityLog fail-loud contract (batch 4, design D1/D2):
 * - log() writes a row on the happy path
 * - log() NEVER throws: on any failure it pino-logs
 *   'Activity log write failed' with { err, type, book, userId } and
 *   returns null (the mutation that triggered the audit write must not
 *   fail over its audit record)
 * - a malformed payload (B1-F1 class: missing NOT NULL field) is the
 *   same never-throw path — visible in pino, invisible to the caller
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const Database = require('better-sqlite3');
const logger = require('../lib/logger');
const migration040 = require('../migrations/040-service-table-ownership');
const activityLog = require('../services/activityLog');

let db;
let errorSpy;

beforeEach(() => {
  db = new Database(':memory:');
  migration040.up(db);
  activityLog._setTestDb(db);
  errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => {});
});

afterEach(() => {
  errorSpy.mockRestore();
  activityLog._setTestDb(null);
  db.close();
});

const VALID = {
  type: 'segment_edit_approved',
  userId: '42',
  username: 'prufa',
  book: 'efnafraedi-2e',
  chapter: '5',
  section: 'm68700',
  description: 'prufa samþykkti breytingu',
};

describe('activityLog.log — happy path', () => {
  it('inserts a row and returns it', () => {
    const result = activityLog.log(VALID);
    expect(result).not.toBeNull();
    expect(result.id).toBeGreaterThan(0);
    const row = db.prepare('SELECT * FROM activity_log WHERE id = ?').get(result.id);
    expect(row.type).toBe('segment_edit_approved');
    expect(errorSpy).not.toHaveBeenCalled();
  });
});

describe('activityLog.log — never-throw contract', () => {
  it('returns null and pino-logs when the table is missing', () => {
    db.exec('DROP TABLE activity_log');
    let result;
    expect(() => {
      result = activityLog.log(VALID);
    }).not.toThrow();
    expect(result).toBeNull();
    expect(errorSpy).toHaveBeenCalledTimes(1);
    const [ctx, msg] = errorSpy.mock.calls[0];
    expect(msg).toBe('Activity log write failed');
    expect(ctx.type).toBe('segment_edit_approved');
    expect(ctx.book).toBe('efnafraedi-2e');
    expect(ctx.userId).toBe('42');
    expect(ctx.err).toBeTruthy();
  });

  it('returns null and pino-logs on a malformed payload (missing NOT NULL description)', () => {
    const { description: _omit, ...malformed } = VALID;
    let result;
    expect(() => {
      result = activityLog.log(malformed);
    }).not.toThrow();
    expect(result).toBeNull();
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(db.prepare('SELECT COUNT(*) AS c FROM activity_log').get().c).toBe(0);
  });
});

describe('activityLog reads still fail loud', () => {
  it('search() throws when the table is missing (route callers log + 500)', () => {
    db.exec('DROP TABLE activity_log');
    expect(() => activityLog.search({})).toThrow(/no such table/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run server/__tests__/activityLogNeverThrow.test.js`
Expected: FAIL — `activityLog._setTestDb is not a function`

- [ ] **Step 3: Restructure the service**

In `server/services/activityLog.js`:

1. Change the logger-less import block (lines 8-14) to import pino **as `logger`** (the file exports a function named `log` — do not shadow it):

```js
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const logger = require('../lib/logger');
const resolveDbPath = require('../lib/dbPath');

// Database path
const DB_PATH = resolveDbPath();
```

2. `ACTIVITY_TYPES` (lines 17-52) unchanged.
3. Delete `initDb()` (lines 55-86), `const db = initDb();` (line 88), and the module-level `const statements = {...}` (lines 91-139). Replace with the Global-Constraints lazy pattern plus an `initStatements` factory holding the **same eight statements verbatim**:

```js
let _testDb = null;
function _setTestDb(db) {
  _testDb = db;
  _stmts = null; // statements must be rebuilt against the new handle
}

let _db;
function getDb() {
  if (_testDb) return _testDb;
  if (!_db) {
    const dbDir = path.dirname(DB_PATH);
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }
    _db = new Database(DB_PATH);
    _db.pragma('journal_mode = WAL');
  }
  return _db;
}

function initStatements(db) {
  return {
    insert: db.prepare(`
      INSERT INTO activity_log (type, user_id, username, book, chapter, section, description, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `),
    getRecent: db.prepare(`
      SELECT * FROM activity_log
      ORDER BY created_at DESC
      LIMIT ?
    `),
    // ...getByUser, getByBook, getBySection, getByType, search, count —
    // copied verbatim from the deleted module-level statements object
  };
}

let _stmts = null;
function stmts() {
  if (!_stmts) {
    _stmts = initStatements(getDb());
  }
  return _stmts;
}
```

4. Rewrite `log()` (lines 144-179) as never-throw — the try wraps **everything** that can fail (statement prep on first use, `JSON.stringify`, the insert):

```js
/**
 * Log an activity. NEVER throws (design D1, batch 4): the mutation that
 * triggered an audit write must not fail over its audit record. On any
 * failure this pino-logs 'Activity log write failed' and returns null —
 * the error log is the fail-loud channel for a broken audit trail.
 */
function log(options) {
  const {
    type,
    userId,
    username,
    book = null,
    chapter = null,
    section = null,
    description,
    metadata = {},
  } = options;

  try {
    const result = stmts().insert.run(
      type,
      userId,
      username,
      book,
      chapter,
      section,
      description,
      JSON.stringify(metadata)
    );

    return {
      id: result.lastInsertRowid,
      type,
      userId,
      username,
      book,
      chapter,
      section,
      description,
      metadata,
      createdAt: new Date().toISOString(),
    };
  } catch (err) {
    logger.error({ err, type, book, userId }, 'Activity log write failed');
    return null;
  }
}
```

5. In the read functions (`getRecent`, `getByUser`, `getByBook`, `getBySection`, `search`), replace each `statements.` with `stmts().` — no other change; they keep throwing.
6. Add `_setTestDb` to `module.exports`.

(No production caller reads `log()`'s return value — verified by grep 2026-07-12: zero `= activityLog.log(` assignments outside tests.)

- [ ] **Step 4: Fix `activityLogging.test.js`'s real-DB dependency**

The existing test's `search()` calls only work because the eager import used to create the table. Convert its DB-touching describe block to the injected pattern — add at the top of the file's setup (keep the existing export-shape and `ACTIVITY_TYPES` pins untouched):

```js
const Database = require('better-sqlite3');
const migration040 = require('../migrations/040-service-table-ownership');

let _db;
beforeAll(() => {
  _db = new Database(':memory:');
  migration040.up(_db);
  activityLog._setTestDb(_db);
});
afterAll(() => {
  activityLog._setTestDb(null);
  _db.close();
});
```

Read the file first and adapt import style (it uses vitest globals/imports already); update its header comment ("against the real database — no mocking needed") to describe the injected DB.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run server/__tests__/activityLogNeverThrow.test.js server/__tests__/activityLogging.test.js server/__tests__/migration040.test.js`
Expected: all PASS

- [ ] **Step 6: Commit**

```bash
git add server/services/activityLog.js server/__tests__/activityLogNeverThrow.test.js server/__tests__/activityLogging.test.js
git commit -m "feat(audit): activityLog.log() is never-throw + lazy DB open (design D1/D4)"
```

---

### Task 3: Delete the 23 hand-rolled wrappers + static tripwire

**Files:**
- Modify: `server/routes/segment-editor.js` (12 sites), `server/routes/localization-editor.js` (7 activityLog sites — NOT the two `localizationEditService` guards), `server/routes/publication.js` (3 sites), `server/services/contentVersionService.js` (1 site)
- Create: `server/__tests__/activityLogCallsiteGuard.test.js`

**Interfaces:**
- Consumes: Task 2's never-throw `activityLog.log()`.
- Produces: every activityLog call site is a bare `activityLog.log({...})`; the tripwire test pins that no silent-catch or try-wrapped audit write reappears.

- [ ] **Step 1: Verify the census before editing**

Run: `grep -rn "fire-and-forget \*/" server/routes/ | wc -l`
Expected: `12` (segment-editor.js 432, 560, 597, 634, 667, 697, 796; localization-editor.js 120, 169, 206, 395, 587). If the count differs, STOP and re-census before proceeding.

- [ ] **Step 2: Write the failing tripwire test**

Create `server/__tests__/activityLogCallsiteGuard.test.js`:

```js
/**
 * Static tripwire (batch 4, design D1): activityLog.log() is never-throw,
 * so call sites must NOT wrap it in their own try/catch — and the silent
 * empty catch whose body is only the fire-and-forget comment must never
 * return. If this test fails on new code, call activityLog.log() bare; it
 * cannot throw.
 *
 * Narrow by design (B1-F1 lesson: reword offending comments, never weaken
 * the guard): prose mentions of "fire-and-forget" elsewhere (tmService)
 * are fine — only the empty-catch idiom and try-wrapped audit writes trip.
 * (NB: never quote the literal catch idiom inside a block comment here —
 * its asterisk-slash would terminate the comment.)
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCAN_DIRS = [
  path.join(__dirname, '..', 'routes'),
  path.join(__dirname, '..', 'services'),
];

const SILENT_CATCH = /catch\s*(?:\([^)]*\)\s*)?\{\s*\/\*\s*fire-and-forget\s*\*\/\s*\}/;
const TRY_WRAPPED_AUDIT = /try\s*\{\s*activityLog\.log\(/;

function jsFiles(dir) {
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.js'))
    .map((f) => path.join(dir, f));
}

describe('activityLog call-site guard', () => {
  for (const dir of SCAN_DIRS) {
    for (const file of jsFiles(dir)) {
      const rel = path.relative(path.join(__dirname, '..'), file);
      const src = fs.readFileSync(file, 'utf-8');

      it(`${rel}: no silent fire-and-forget catch`, () => {
        expect(src).not.toMatch(SILENT_CATCH);
      });

      it(`${rel}: no try-wrapped activityLog.log (it is never-throw)`, () => {
        expect(src).not.toMatch(TRY_WRAPPED_AUDIT);
      });
    }
  }
});
```

- [ ] **Step 3: Run tripwire to verify it fails on current code**

Run: `npx vitest run server/__tests__/activityLogCallsiteGuard.test.js`
Expected: FAIL on segment-editor.js, localization-editor.js, publication.js, contentVersionService.js (both patterns present).

- [ ] **Step 4: Remove the wrappers**

The two mechanical transforms (keep every `activityLog.log({...})` payload **byte-identical**, only remove the wrapper and re-indent):

**Silent shape** (12 sites — segment-editor.js at 422, 550, 587, 624, 657, 687; localization-editor.js at 112, 159, 196, 385, 577):

```js
// BEFORE
    try {
      activityLog.log({
        type: 'segment_edit_approved',
        // ...payload...
      });
    } catch {
      /* fire-and-forget */
    }

// AFTER
    activityLog.log({
      type: 'segment_edit_approved',
      // ...payload...
    });
```

**Logging shape** (11 sites — segment-editor.js at 351, 465, 744, 1102, 1167; localization-editor.js at 440, 623; publication.js at 145, 203, 263; contentVersionService.js at 236): identical removal — delete the `try {` line and the whole `} catch (logErr) { log.error({ err: logErr }, '...'); }` block. In contentVersionService.js **keep** the explanatory comment line above the call (`// 6. Audit trail (best-effort — never fail the restore over a log write)`) — it is still accurate.

**The comment-route site** (segment-editor.js 784-797) also guards a lookup — hoist it so a lookup failure still reaches the route's own error handling:

```js
// BEFORE (current code)
    res.json({ success: true, commentId: result.id });
    try {
      const edit = segmentEditor.getEditById(parseInt(req.params.editId, 10));
      activityLog.log({
        type: 'segment_edit_comment',
        userId: String(req.user.id),
        username: req.user.username,
        book: edit?.book || '',
        chapter: String(edit?.chapter || ''),
        section: edit?.module_id || '',
        description: `${req.user.username} bætti við athugasemd á ${edit?.segment_id || req.params.editId}`,
      });
    } catch {
      /* fire-and-forget */
    }

// AFTER — response stays first (the comment IS saved; a context-lookup
// failure must not flip a committed mutation into a 400 — that is the
// nested-site defect class this batch fixes). Only the lookup is guarded,
// with a log; the audit write goes bare with degraded context on lookup
// failure (edit stays null → the || '' fallbacks apply).
    res.json({ success: true, commentId: result.id });
    let edit = null;
    try {
      edit = segmentEditor.getEditById(parseInt(req.params.editId, 10));
    } catch (lookupErr) {
      log.error(
        { err: lookupErr, editId: req.params.editId },
        'Edit lookup for comment audit failed'
      );
    }
    activityLog.log({
      type: 'segment_edit_comment',
      userId: String(req.user.id),
      username: req.user.username,
      book: edit?.book || '',
      chapter: String(edit?.chapter || ''),
      section: edit?.module_id || '',
      description: `${req.user.username} bætti við athugasemd á ${edit?.segment_id || req.params.editId}`,
    });
```

Do NOT touch localization-editor.js's `localizationEditService` guards at 417-430 and 609-612 (`'Audit log failed (single save)'` / `'(bulk save)'`) — different service, still throwing.

- [ ] **Step 5: Verify no dedicated wrapper remains and the tripwire passes**

Run: `grep -rn "fire-and-forget \*/" server/routes/ | wc -l` → Expected: `0`
Run: `npx vitest run server/__tests__/activityLogCallsiteGuard.test.js`
Expected: PASS

- [ ] **Step 6: Run the full server test project**

Run: `npx vitest run server/__tests__`
Expected: PASS (route files have no route-level tests, but static pins elsewhere — e.g. `securityPayloads.test.js`, `ui-strings.test.js` — read these sources; confirm nothing broke).

- [ ] **Step 7: Commit**

```bash
git add server/routes/segment-editor.js server/routes/localization-editor.js server/routes/publication.js server/services/contentVersionService.js server/__tests__/activityLogCallsiteGuard.test.js
git commit -m "refactor(audit): delete 23 hand-rolled activityLog guards; add call-site tripwire (12 were silent)"
```

---

### Task 4: `notifications.js` + `localizationLog.js` lazy conversion

**Files:**
- Modify: `server/services/notifications.js`, `server/services/localizationLog.js`
- Create: `server/__tests__/notificationsLazyDb.test.js`

**Interfaces:**
- Consumes: migration 040 (notifications schema for tests).
- Produces: both modules import-side-effect-free; `notifications._setTestDb(db)` and `localizationLog._setTestDb(db)` exported. All existing exports unchanged in signature.

- [ ] **Step 1: Write the failing test**

Create `server/__tests__/notificationsLazyDb.test.js`:

```js
/**
 * notifications lazy-DB seam (batch 4, design D4): the service used to
 * open the production DB at require() time (no injection possible).
 * Pins: _setTestDb works, createNotification + getUnreadCount round-trip
 * against an injected migration-040 schema.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const Database = require('better-sqlite3');
const migration040 = require('../migrations/040-service-table-ownership');
const notifications = require('../services/notifications');

let db;

beforeEach(() => {
  db = new Database(':memory:');
  migration040.up(db);
  notifications._setTestDb(db);
});

afterEach(() => {
  notifications._setTestDb(null);
  db.close();
});

describe('notifications with injected DB', () => {
  it('createNotification writes a row readable via getUnreadCount', async () => {
    await notifications.createNotification({
      userId: '7',
      type: 'review_submitted',
      title: 'Prufa',
      message: 'Prufuskilaboð',
    });
    expect(notifications.getUnreadCount('7')).toBe(1);
    const row = db.prepare('SELECT * FROM notifications WHERE user_id = ?').get('7');
    expect(row.type).toBe('review_submitted');
  });

  it('preferences round-trip against the injected DB', () => {
    const prefs = notifications.setPreferences('7', { reviews: { inApp: false, email: false } });
    expect(prefs.reviews.inApp).toBe(false);
    expect(notifications.getPreferences('7').reviews.email).toBe(false);
  });
});
```

Before finalizing, read `server/services/notifications.js` around `createNotification`/`getUnreadCount` and adapt the assertions to their real signatures/return shapes (e.g. `getUnreadCount` may return `{ count }` — pin what the code actually returns; `createNotification` is async and may email-skip when SMTP is unconfigured — assert the DB row, not the email).

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run server/__tests__/notificationsLazyDb.test.js`
Expected: FAIL — `notifications._setTestDb is not a function`

- [ ] **Step 3: Convert `notifications.js`**

Same restructure as Task 2's activityLog (this file keeps its `const log = require('../lib/logger')` name — it exports no `log` function):
1. Delete `initDb()` (lines 88-125) and `const db = initDb();` (line 127).
2. Wrap the existing statements object (lines 130-170) verbatim in `function initStatements(db) { return { ... }; }`.
3. Add the Global-Constraints lazy block (`_setTestDb` / `getDb` / `_stmts` / `stmts()`).
4. Replace every `statements.` reference with `stmts().` (8 references — grep to confirm).
5. Export `_setTestDb`.

- [ ] **Step 4: Convert `localizationLog.js`**

1. Delete the module-level open (lines 33-38) **including the stale `// Module-level singleton database connection (matches sessionCore.js pattern)` comment** (sessionCore.js was deleted in the 2026-03 refocus).
2. Add the lazy block WITHOUT the statements cache (this file prepares inline per call — keep that):

```js
let _testDb = null;
function _setTestDb(db) {
  _testDb = db;
}

let _db;
function getDb() {
  if (_testDb) return _testDb;
  if (!_db) {
    const dbDir = path.dirname(DB_PATH);
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }
    _db = new Database(DB_PATH);
    _db.pragma('journal_mode = WAL');
  }
  return _db;
}
```

3. Each of the seven exported functions (`getOrCreateLog`, `addEntry`, `updateEntry`, `removeEntry`, `getLog`, `saveEntries`, `getStats`) gains `const db = getDb();` as its first line (the function bodies already reference `db`; the module-level `const db` is gone, so this compiles to the same code lazily). **Watch the shadowing in `getOrCreateLog`/`getStats`:** both declare a local `const log = ...` / loop over `logs` — the new `const db` must not collide; it doesn't (no local `db` exists), but verify with eslint.
4. Export `_setTestDb`. Table is migration-003-owned — there is no DDL to delete.

- [ ] **Step 5: Check the one production caller's tests**

Run: `npx vitest run server/__tests__/localizationSuggestions.test.js`
`localizationSuggestions.js:705` requires localizationLog inside its sync path. If any test exercises that path it previously wrote to the REAL DB via the eager open; it must now inject `localizationLog._setTestDb(db)` alongside the existing suggestion-service injection (and the injected DB needs the `localization_logs` table — apply `require('../migrations/003-book-catalogue').up(db)` or reuse however that test builds its schema). If no test reaches the sync path, no change — note which case held in the commit message.

- [ ] **Step 6: Run tests**

Run: `npx vitest run server/__tests__/notificationsLazyDb.test.js server/__tests__/notifyEditDecision.test.js server/__tests__/localizationSuggestions.test.js`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add server/services/notifications.js server/services/localizationLog.js server/__tests__/notificationsLazyDb.test.js
git commit -m "refactor(db): notifications + localizationLog lazy-open with _setTestDb seam (design D4)"
```

---

### Task 5: `feedbackService.js` + `analyticsService.js` lazy conversion

**Files:**
- Modify: `server/services/feedbackService.js`, `server/services/analyticsService.js`
- Modify: `server/__tests__/feedbackService.test.js` (schema now comes from migration 005 — design D5)
- Create: `server/__tests__/analyticsService.test.js` (first-ever coverage)

**Interfaces:**
- Consumes: migration 005 (`require('../migrations/005-feedback')` — owns `feedback`, `feedback_responses`, `analytics_events`).
- Produces: `feedbackService._setTestDb(db)` becomes a **pure setter** (no table creation; `null` genuinely restores); `analyticsService._setTestDb(db)` exists for the first time. All existing exports unchanged.

- [ ] **Step 1: Update `feedbackService.test.js` first (it will fail until the service is converted)**

In `server/__tests__/feedbackService.test.js`, the harness (lines 18-27) currently relies on `_setTestDb` creating tables. Change to migration-owned schema:

```js
const migration005 = require('../migrations/005-feedback');

beforeAll(() => {
  db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  migration005.up(db);
  feedbackService._setTestDb(db);
});
```

(afterAll stays `feedbackService._setTestDb(null); db.close();` — with the pure setter this now genuinely restores instead of leaving the module pointed at a closed DB.) Update the file's header comment accordingly.

- [ ] **Step 2: Write the failing analytics test**

Create `server/__tests__/analyticsService.test.js`:

```js
/**
 * analyticsService — first coverage (batch 4). The service previously
 * opened the production DB at require() time with no injection seam, so
 * it was untestable. Pins the basic event round-trip and getStats shape.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const Database = require('better-sqlite3');
const migration005 = require('../migrations/005-feedback');
const analytics = require('../services/analyticsService');

let db;

beforeEach(() => {
  db = new Database(':memory:');
  migration005.up(db);
  analytics._setTestDb(db);
});

afterEach(() => {
  analytics._setTestDb(null);
  db.close();
});

describe('analyticsService with injected DB', () => {
  it('logEvent inserts a row and getRecentEvents returns it', () => {
    const result = analytics.logEvent({
      eventType: 'page_view',
      book: 'efnafraedi-2e',
      sessionId: 'prufa-session',
    });
    expect(result.id).toBeGreaterThan(0);
    const recent = analytics.getRecentEvents(10);
    expect(recent).toHaveLength(1);
    expect(recent[0].eventType).toBe('page_view');
  });

  it('getStats aggregates by type for the period', () => {
    analytics.logEvent({ eventType: 'page_view', sessionId: 's1' });
    analytics.logEvent({ eventType: 'chapter_view', book: 'efnafraedi-2e', sessionId: 's1' });
    const stats = analytics.getStats('-1 day');
    expect(stats.byType.page_view).toBe(1);
    expect(stats.byType.chapter_view).toBe(1);
    expect(stats.uniqueSessions).toBe(1);
  });
});
```

(Read `getStats`'s return object first and pin the real property name for unique sessions — adapt if it is `stats.uniqueSessions.count` or similar.)

- [ ] **Step 3: Run both to verify failures**

Run: `npx vitest run server/__tests__/analyticsService.test.js server/__tests__/feedbackService.test.js`
Expected: analytics FAILS (`_setTestDb is not a function`); feedback FAILS (`no such table: feedback` — `_setTestDb` no longer receives pre-created tables… it still creates them pre-conversion, so it may PASS until Step 4; either way proceed).

- [ ] **Step 4: Convert `feedbackService.js`**

1. Delete `initDb()` (lines 74-125), `let db = initDb();` (127), `let statements = initStatements(db);` (213).
2. Keep the existing `initStatements(database)` factory (lines 129-211) exactly as is.
3. Add the Global-Constraints lazy block (`_setTestDb` resets `_stmts`).
4. Replace the old `_setTestDb` (lines 218-254) entirely — the new one is the pure setter from the lazy block (delete the embedded CREATE TABLE DDL).
5. Replace every `statements.` reference with `stmts().` (14 references — grep to confirm).

- [ ] **Step 5: Convert `analyticsService.js`**

1. Delete `initDb()` (lines 36-67) and `const db = initDb();` (69).
2. Wrap the statements object (lines 72-121) verbatim in `function initStatements(db) { return { ... }; }`.
3. Add the lazy block; replace the 9 `statements.` references (`logEvent`, `getRecentEvents`, `getStats`) with `stmts().`.
4. Export `_setTestDb`.

- [ ] **Step 6: Run tests**

Run: `npx vitest run server/__tests__/feedbackService.test.js server/__tests__/analyticsService.test.js`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add server/services/feedbackService.js server/services/analyticsService.js server/__tests__/feedbackService.test.js server/__tests__/analyticsService.test.js
git commit -m "refactor(db): feedbackService + analyticsService lazy-open; analytics gets first tests (design D4/D5)"
```

---

### Task 6: Eager-open regression test (all five services)

**Files:**
- Create: `server/__tests__/lazyDbOpen.test.js`

**Interfaces:**
- Consumes: Tasks 2, 4, 5 (all five services now lazy).
- Produces: a subprocess-based pin that `require()` of any of the five services does not create the DB file.

- [ ] **Step 1: Write the test**

```js
/**
 * Import-time DB-open regression (batch 4, design D4 / audit finding 20).
 *
 * Five services used to open (and create!) the production sessions.db as a
 * require() side effect, defeating SESSIONS_DB_PATH-based test isolation.
 * Each case requires the module in a SUBPROCESS with SESSIONS_DB_PATH
 * pointing into a fresh temp dir and asserts no DB file appears.
 * (Subprocess because DB_PATH freezes at import — an in-process require
 * would hit the module cache.)
 */
import { describe, it, expect } from 'vitest';
import { spawnSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER_DIR = path.join(__dirname, '..');

const SERVICES = [
  'services/activityLog',
  'services/notifications',
  'services/localizationLog',
  'services/feedbackService',
  'services/analyticsService',
];

function requireInSubprocess(mod, dbPath, extraCode = '') {
  return spawnSync(
    process.execPath,
    ['-e', `require(${JSON.stringify(path.join(SERVER_DIR, mod))}); ${extraCode}`],
    {
      env: { ...process.env, SESSIONS_DB_PATH: dbPath, JWT_SECRET: 'prufa' },
      encoding: 'utf-8',
      timeout: 30000,
    }
  );
}

describe('services do not open the DB at import time', () => {
  for (const mod of SERVICES) {
    it(`${mod}: require() creates no DB file`, () => {
      const work = fs.mkdtempSync(path.join(os.tmpdir(), 'lazy-'));
      const dbPath = path.join(work, 'sessions.db');
      const res = requireInSubprocess(mod, dbPath);
      expect(res.status, res.stderr).toBe(0);
      expect(fs.existsSync(dbPath)).toBe(false);
      fs.rmSync(work, { recursive: true, force: true });
    });
  }

  it('positive control: first real call DOES open/create the file', () => {
    const work = fs.mkdtempSync(path.join(os.tmpdir(), 'lazy-'));
    const dbPath = path.join(work, 'sessions.db');
    // getRecent throws (no table in a fresh DB) but opening creates the file
    const res = requireInSubprocess(
      'services/activityLog',
      dbPath,
      'try { require(' +
        JSON.stringify(path.join(SERVER_DIR, 'services/activityLog')) +
        ').getRecent(1); } catch {}'
    );
    expect(res.status, res.stderr).toBe(0);
    expect(fs.existsSync(dbPath)).toBe(true);
    fs.rmSync(work, { recursive: true, force: true });
  });
});
```

- [ ] **Step 2: Run it — it must PASS now, and would have failed before Tasks 2/4/5**

Run: `npx vitest run server/__tests__/lazyDbOpen.test.js`
Expected: PASS. Spot-check the counterfactual: `git stash` is NOT needed — instead run one service pre-fix mentally impossible now; trust the subprocess mechanics (the positive control proves the harness detects file creation).

- [ ] **Step 3: Commit**

```bash
git add server/__tests__/lazyDbOpen.test.js
git commit -m "test(db): subprocess regression pin — no import-time DB open in the five converted services"
```

---

### Task 7: Admin honesty — no fabricated zeros (+ `books.html`)

**Files:**
- Modify: `server/routes/admin.js` (five catch sites), `server/views/books.html:1647-1671`
- Create: `server/__tests__/adminBooksHonesty.test.js`

**Interfaces:**
- Consumes: nothing new.
- Produces: `GET /api/admin/books` marks failures as `editorialProgress: null` + `editorialProgressUnavailable: true` (design D9). Client renders "Framvinda ótiltæk".

- [ ] **Step 1: Write the failing behavioral test**

Create `server/__tests__/adminBooksHonesty.test.js` (router-introspection precedent: `books-routes.test.js`; env-before-require precedent: `crossBookAuthz.test.js`):

```js
/**
 * GET /api/admin/books honesty (batch 4, audit finding 22 / design D9).
 *
 * A real editorial-progress failure used to render as fabricated zeros —
 * byte-identical to an untouched book, with no log line. Pins: on a
 * progress-computation failure the route returns editorialProgress: null +
 * editorialProgressUnavailable: true and pino-logs the error.
 *
 * Harness: temp-file DB via SESSIONS_DB_PATH (set BEFORE any server
 * require), real migrations, one registered book row, then DROP the
 * segment_edits table so getEditorialProgress throws. The route handler is
 * invoked directly via router introspection (auth middlewares bypassed).
 */
import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

// Env BEFORE any server require: resolveDbPath()/JWT config load at import.
const work = mkdtempSync(path.join(tmpdir(), 'adminbooks-'));
process.env.SESSIONS_DB_PATH = path.join(work, 'sessions.db');
process.env.JWT_SECRET = process.env.JWT_SECRET || 'prufa-leyndarmal';

const logger = require('../lib/logger');

let handler;
let db;

beforeAll(() => {
  const { runAllMigrations } = require('../services/migrationRunner');
  runAllMigrations();

  const Database = require('better-sqlite3');
  db = new Database(process.env.SESSIONS_DB_PATH);
  // Minimal registered book — inspect migration 003's books DDL and satisfy
  // its NOT NULL columns; add an openstax_catalogue row if
  // listRegisteredBooks still INNER JOINs it (check bookRegistration.js).
  db.prepare(
    "INSERT INTO books (slug, title_is, title_en) VALUES ('prufubok', 'Prufubók', 'Test Book')"
  ).run();
  db.exec('DROP TABLE segment_edits'); // force getEditorialProgress to throw

  const router = require('../routes/admin');
  const layer = router.stack.find(
    (l) => l.route && l.route.path === '/books' && l.route.methods.get
  );
  handler = layer.route.stack[layer.route.stack.length - 1].handle;
});

afterEach(() => vi.restoreAllMocks());

function invoke() {
  return new Promise((resolve) => {
    const req = { user: { id: 'u-adm', username: 'adm', role: 'admin' }, params: {}, query: {} };
    const res = {
      statusCode: 200,
      status(c) { this.statusCode = c; return this; },
      json(body) { resolve({ status: this.statusCode, body }); },
    };
    handler(req, res);
  });
}

describe('GET /api/admin/books with a broken progress pipeline', () => {
  it('marks progress unavailable instead of fabricating zeros, and logs', async () => {
    const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => {});
    const { status, body } = await invoke();
    expect(status).toBe(200);
    const book = body.books.find((b) => b.slug === 'prufubok');
    expect(book).toBeTruthy();
    expect(book.editorialProgress).toBeNull();
    expect(book.editorialProgressUnavailable).toBe(true);
    expect(errorSpy).toHaveBeenCalledWith(
      expect.objectContaining({ book: 'prufubok' }),
      expect.stringContaining('Editorial progress failed')
    );
  });
});
```

Adapt the book INSERT to migration 003's real column list (read the migration; include any NOT NULL columns) and check `bookRegistration.listRegisteredBooks()` for an `openstax_catalogue` JOIN (2026-06-10 note says INNER JOIN may hide books without catalogue rows — if so, insert a matching catalogue row too).

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run server/__tests__/adminBooksHonesty.test.js`
Expected: FAIL — `editorialProgress` is `{ percent: 0, approvedSegments: 0, totalSegments: 0 }`, `editorialProgressUnavailable` undefined, no log call.

- [ ] **Step 3: Fix the five admin.js sites**

**Site 1 — `admin.js:402-404`** (the finding):

```js
      } catch (err) {
        log.error({ err, book: book.slug }, 'Editorial progress failed for book list');
        book.editorialProgress = null;
        book.editorialProgressUnavailable = true;
      }
```

**Site 2 — `admin.js:1000-1002`** (assignments dashboard; keep the `{}` fallback, add visibility):

```js
    } catch (err) {
      // Progress data is optional on this dashboard — but a failure must be visible.
      log.error({ err, book }, 'Editorial progress failed for assignments dashboard');
    }
```

**Site 3 — `admin.js:236-238`** (VALID_BOOKS refresh after book registration):

```js
      } catch (refreshErr) {
        // Non-fatal — book will be accessible after next server restart
        log.warn({ err: refreshErr, book: slug }, 'VALID_BOOKS refresh failed after registration');
      }
```

(Verify the in-scope variable really is `slug` at that site; adapt.)

**Site 4 — `admin.js:1219-1225`** (manual-migration loop; errors reach the response but never pino):

```js
        } catch (err) {
          if (err.message && err.message.includes('duplicate column')) {
            result = { success: true, alreadyApplied: true, name: migration.name };
          } else {
            log.error({ err, migration: migration.name }, 'Manual migration failed');
            result = { success: false, error: err.message, name: migration.name };
          }
        }
```

**Site 5 — `admin.js:1297-1299`** (`getStageData` inside `/validate-pipeline`):

```js
      } catch (err) {
        log.error({ err }, 'getStageData failed; treating as missing DB stage data');
        return null;
      }
```

(Add the helper's own params — book/chapter — to the log context if they are in scope; read the enclosing function first.)

- [ ] **Step 4: Update the client renderer**

`server/views/books.html` — inside `loadBooks()`'s map callback (currently lines 1647-1671), replace the `pct` computation and the stats/progress spans:

```js
                // Use editorial progress (approved segments / total segments) — same metric as progress page
                var ep = book.editorialProgress;
                var pct = ep && typeof ep.percent === 'number' ? ep.percent : 0;
                var pctLabel = book.editorialProgressUnavailable
                  ? 'Framvinda ótiltæk'
                  : pct + '% lokið';
```

and use `pctLabel` in the stats span (`'<span>' + pctLabel + '</span>'`) while the progress-fill keeps `pct` (an unavailable book renders an empty bar, not a fake one). Keep the file's existing `\uXXXX` escape style for non-ASCII.

- [ ] **Step 5: Run tests**

Run: `npx vitest run server/__tests__/adminBooksHonesty.test.js`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add server/routes/admin.js server/views/books.html server/__tests__/adminBooksHonesty.test.js
git commit -m "fix(admin): progress failures log + render 'Framvinda ótiltæk' instead of fabricated zeros (finding 22)"
```

---

### Task 8: `status.js:75` — log the cached-fallback degradation

**Files:**
- Modify: `server/routes/status.js:75` (function `getStatusDataFromDb`)

**Interfaces:** none new (file-local function; `log` already imported at status.js:19).

- [ ] **Step 1: Make the edit**

```js
  } catch (err) {
    log.warn(
      { err, bookSlug, chapterNum },
      'Pipeline status DB read failed; serving cached status.json'
    );
    // Fallback: read status.json directly if DB is unavailable
    const chDir = chapterNum === -1 ? 'appendices' : `ch${String(chapterNum).padStart(2, '0')}`;
    const statusPath = path.join(PROJECT_ROOT, 'books', bookSlug, 'chapters', chDir, 'status.json');
    return JSON.parse(fs.readFileSync(statusPath, 'utf-8'));
  }
```

The `catch` gains the `(err)` binding (it currently binds nothing). The log line goes at the **top** of the catch, before the fallback read — so the true DB error is recorded even when the fallback itself then throws (ENOENT/SyntaxError). `warn` level per design D8 (the request still succeeds; real outages surface via `/api/health` and write paths). No behavioral test — routes/status.js has no harness and this is a single observability line; the tripwire-vs-behavior trade-off is documented in the design (§4 item 8 rationale). Verify with a source grep instead.

- [ ] **Step 2: Verify + run the file-adjacent suites**

Run: `grep -n "serving cached status.json" server/routes/status.js` → Expected: 1 hit inside the catch at ~line 76.
Run: `npx vitest run server/__tests__/dashboardReadModel.test.js server/__tests__/pipelineStatusRoutes.test.js`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add server/routes/status.js
git commit -m "fix(status): log the DB→cached-status.json fallback (finding 37, one line, warn level)"
```

---

### Task 9: B1-F8 — delete userService read-swallows; honest DELETE

**Files:**
- Modify: `server/services/userService.js` (four catch blocks), `server/routes/admin.js:1113` (DELETE payload), `server/routes/status.js:163-165` (bare catch gains log)
- Modify: `server/__tests__/userService.test.js` (new describe block)

**Interfaces:**
- Consumes: existing `isUserTableReady()` head guards (they stay — bootstrap semantics unchanged).
- Produces: `getChapterAssignments`, `getAllChapterAssignments`, `getBookAssignments`, `getEditorsForBook` **throw** on "no such table" when `users` exists (corrupted DB); DELETE `/api/admin/assignments/:book/:chapter` responds `{ success: true, removed: boolean }`. Task 10 does not depend on this task.

- [ ] **Step 1: Write the failing tests**

Add to `server/__tests__/userService.test.js` (it has an in-memory DB + `_setTestDb` harness with `users`/`user_book_access`/`user_chapter_assignments` tables — read its setup first and reuse its helpers/seeded users):

```js
describe('read-side no-such-table swallows are gone (B1-F8)', () => {
  // In each case `users` exists (isUserTableReady() → true) but a sibling
  // table was dropped — post-#212 that is a corrupted DB, not bootstrap,
  // and must fail loud instead of returning a plausible [].

  it('getBookAssignments throws when user_chapter_assignments is missing', () => {
    db.exec('DROP TABLE user_chapter_assignments');
    expect(() => userService.getBookAssignments('efnafraedi-2e')).toThrow(/no such table/);
  });

  it('getChapterAssignments throws when user_chapter_assignments is missing', () => {
    db.exec('DROP TABLE user_chapter_assignments');
    expect(() => userService.getChapterAssignments(1, 'efnafraedi-2e')).toThrow(/no such table/);
  });

  it('getAllChapterAssignments throws when user_chapter_assignments is missing', () => {
    db.exec('DROP TABLE user_chapter_assignments');
    expect(() => userService.getAllChapterAssignments(1)).toThrow(/no such table/);
  });

  it('getEditorsForBook throws when user_book_access is missing', () => {
    db.exec('DROP TABLE user_book_access');
    expect(() => userService.getEditorsForBook('efnafraedi-2e')).toThrow(/no such table/);
  });
});
```

(If the harness recreates tables per-test via beforeEach, the DROPs are isolated; if it is beforeAll-scoped, move these into their own describe with a dedicated fresh DB — read the file and follow its pattern.)

- [ ] **Step 2: Run to verify failures**

Run: `npx vitest run server/__tests__/userService.test.js`
Expected: the four new tests FAIL (functions currently return `[]`).

- [ ] **Step 3: Delete the four swallows**

In `server/services/userService.js`, for each of the four functions, remove the catch (and the now-empty `finally {}` where present), keeping the `isUserTableReady()` head guard. Example — `getBookAssignments` (lines 714-733) becomes:

```js
function getBookAssignments(bookSlug) {
  if (!isUserTableReady()) return [];

  const db = getDb();
  return db
    .prepare(
      `SELECT a.chapter, a.assigned_by, a.assigned_at,
              u.id as user_id, u.display_name as user_name, u.role
       FROM user_chapter_assignments a
       JOIN users u ON a.user_id = u.id
       WHERE a.book_slug = ?
       ORDER BY a.chapter`
    )
    .all(bookSlug);
}
```

Apply the same unwrap to `getChapterAssignments` (673-688), `getAllChapterAssignments` (693-708), `getEditorsForBook` (740-773). Do NOT touch `isAssignmentEnforced` (536-553) or `hasChapterAccess` (592-631).

- [ ] **Step 4: Honest DELETE + the dashboard's bare catch**

`server/routes/admin.js:1113` — the chapter-centric unassign response becomes:

```js
    res.json({ success: true, removed: !!current });
```

`server/routes/status.js:163-165` — the dashboard's assignment catch gains a log line (it would otherwise re-silence the new throw):

```js
      } catch (err) {
        // Assignment data unavailable — treat all as unassigned
        log.error({ err, book }, 'Failed to load chapter assignments for dashboard');
      }
```

(Verify the in-scope variable name is `book` at that site.)

- [ ] **Step 5: Check downstream callers stay loud, not crashy**

Verified during planning (2026-07-12): `teamDigestService.js:91/96` wraps `sendReviewDigests()` in `.catch((err) => log.error(...))`; `routes/feedback.js:138-140` catches + logs `'Feedback head-editor routing failed'`; admin routes catch + `log.error` + 500. Grep for any OTHER production caller of the four functions and confirm each has a logging catch or an intentional 500 path:

Run: `grep -rn "getBookAssignments\|getChapterAssignments\|getAllChapterAssignments\|getEditorsForBook" server/routes/ server/services/ | grep -v userService.js | grep -v __tests__`
Expected consumers: admin.js (assignments GET/POST/DELETE, users/:id/chapters), status.js:156, teamDigestService.js, feedback.js. Anything else: read it and add a logging catch if bare.

- [ ] **Step 6: Run tests**

Run: `npx vitest run server/__tests__/userService.test.js server/__tests__/crossBookAuthz.test.js server/__tests__/assignmentEnforcement.test.js`
Expected: PASS (crossBookAuthz's harness has real users/assignment tables since B1-F6, so nothing there relied on the swallow).

- [ ] **Step 7: Commit**

```bash
git add server/services/userService.js server/routes/admin.js server/routes/status.js server/__tests__/userService.test.js
git commit -m "fix(users): assignment reads fail loud on corrupted DB; DELETE reports removed:boolean (B1-F8)"
```

---

### Task 10: dbUser-null enforcement deny + `books.js` param rider

**Files:**
- Modify: `server/services/userService.js` (`hasChapterAccess`), `server/middleware/requireRole.js:269-295`, `server/routes/books.js:470-474` (+ handler refs)
- Modify: `server/__tests__/assignmentEnforcement.test.js`, `server/__tests__/crossBookAuthz.test.js`

**Interfaces:**
- Consumes: `hasChapterAccess(userId, bookSlug, chapter)` — signature unchanged; now accepts `null` userId.
- Produces: enforcement-ON books deny callers with no `users` row (403 via the middleware's existing "not assigned" branch); enforcement-OFF fail-open preserved. `requireBookAccess` reads `req.params.book` on the faithful-count route.

- [ ] **Step 1: Write the failing service-level tests**

Add to `server/__tests__/assignmentEnforcement.test.js` (reuse its `_setTestDb` harness with `book_settings`):

```js
describe('hasChapterAccess with a null userId (dbUser-null fall-through fix)', () => {
  it('enforcement ON → false (deny): unresolvable callers cannot be assigned', () => {
    setEnforcement('efnafraedi-2e', 1); // adapt to the file's existing helper/inserts
    expect(userService.hasChapterAccess(null, 'efnafraedi-2e', 5)).toBe(false);
  });

  it('enforcement OFF → true (legacy fail-open preserved, even when the book has assignments)', () => {
    // seed an assignment for someone else so the legacy count>0 path exists
    seedAssignment(1, 'liffraedi-2e', 3); // adapt to the file's seeding style
    expect(userService.hasChapterAccess(null, 'liffraedi-2e', 3)).toBe(true);
  });
});
```

(Adapt `setEnforcement`/`seedAssignment` to whatever the file actually uses — read it first; it already toggles `book_settings.enforce_assignments` and inserts `user_chapter_assignments` rows.)

- [ ] **Step 2: Write the failing route-level tests**

In `server/__tests__/crossBookAuthz.test.js`:

1. Add a persona next to the existing ones (line ~22) — the harness mints JWT `sub: 'u-' + username`, and no users row will exist for it:

```js
const ED_NOROW = { username: 'ed-norow', role: 'editor', books: [] }; // deliberately NO users row (dbUser-null)
```

2. Add to the enforcement-ON block (efnafraedi-2e, section 61 — see the fixture comments at lines ~614+):

```js
  it('enforcement ON: editor with NO users row → 403 (dbUser-null no longer bypasses default-deny)', async () => {
    const res = await get('/api/suggestions/61', ED_NOROW);
    expect(res.status).toBe(403);
  });
```

3. Confirm the existing fail-open pin at line ~605 (`GET /api/suggestions/60` as HE_A → 200) still passes unchanged — it is the enforcement-OFF contract.
4. Update the fixture comment at lines 174-178 (it documents the old "skips the chapter check entirely" behavior) to describe the new contract: no-row callers are denied under enforcement, fail-open otherwise.

- [ ] **Step 3: Run to verify failures**

Run: `npx vitest run server/__tests__/assignmentEnforcement.test.js server/__tests__/crossBookAuthz.test.js`
Expected: the new cases FAIL (null → check skipped → 200/undefined-behavior today).

- [ ] **Step 4: Implement the service branch**

In `server/services/userService.js`, `hasChapterAccess` (lines 592-631), insert after the `isUserTableReady()` guard:

```js
  if (!isUserTableReady()) {
    if (enforce) throw assignmentUnavailableError('user table not ready');
    return true;
  }

  // Caller not resolvable to a DB user (e.g. a JWT whose users row was
  // hard-deleted mid-token-lifetime). Under enforcement nobody unassignable
  // may pass; under the legacy model this stays fail-open — pinned by
  // crossBookAuthz.test.js.
  if (userId === null || userId === undefined) {
    if (enforce) {
      log.warn({ bookSlug, chapter }, 'Enforcement denied caller with no users row');
      return false;
    }
    return true;
  }
```

(`log` is already imported at userService.js:12. Placement matters: AFTER the table guard so missing-table-under-enforcement still 503s — pinned by `assignmentEnforcement.test.js:119`.) Update the function's JSDoc to mention the null-user contract.

- [ ] **Step 5: Implement the middleware change**

In `server/middleware/requireRole.js:269-295`, remove the `if (dbUser)` guard and pass the null through:

```js
    if (chapter) {
      // Look up the DB user ID from the provider ID in the JWT. A caller
      // with no users row is decided by hasChapterAccess: denied under
      // enforcement, legacy fail-open otherwise (batch 4, design D7).
      const dbUser = userService.findByProviderId(req.user.id);
      let allowed;
      try {
        allowed = userService.hasChapterAccess(dbUser ? dbUser.id : null, book, chapter);
      } catch (err) {
        // Enforcement is on but assignments can't be evaluated → fail closed.
        if (err.code === 'ASSIGNMENT_TABLE_UNAVAILABLE') {
          return res.status(503).json({
            error: 'Assignment enforcement unavailable',
            message:
              'Chapter assignments cannot be verified right now. Access is blocked until this is resolved.',
          });
        }
        throw err;
      }
      if (!allowed) {
        return res.status(403).json({
          error: 'Chapter access denied',
          message: `You are not assigned to chapter ${chapter} of ${book}`,
          yourRole: req.user.role,
        });
      }
    }
```

Also update the `requireBookAccessForSection` JSDoc (requireRole.js:156-160) — it documents the old fall-through ("a JWT holder with no users row falls through"); rewrite that clause to the new contract.

- [ ] **Step 6: The `books.js` rider (D10)**

`server/routes/books.js:470-474`: the route mounts `requireBookAccess()` but names its param `:bookId`, so the middleware reads `req.params.book === undefined` and no book check can ever bite. Rename the param and the handler's references (URL shape is unchanged — param names are server-side only):

```js
router.get(
  '/:book/chapters/:chapter/faithful-count',
  requireAuth,
  requireBookAccess(),
  (req, res) => {
    const { book, chapter } = req.params;
```

then replace the remaining `bookId` references inside this handler (the `path.join(booksDir, bookId, ...)` becomes `book`; grep the handler body for `bookId`).

- [ ] **Step 7: Run tests**

Run: `npx vitest run server/__tests__/assignmentEnforcement.test.js server/__tests__/crossBookAuthz.test.js server/__tests__/requireRole.test.js server/__tests__/books-routes.test.js`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add server/services/userService.js server/middleware/requireRole.js server/routes/books.js server/__tests__/assignmentEnforcement.test.js server/__tests__/crossBookAuthz.test.js
git commit -m "fix(authz): dbUser-null denied under enforcement; faithful-count param feeds requireBookAccess (D7/D10)"
```

---

### Task 11: Full gate, register + docs + design amendments

**Files:**
- Modify: `docs/plans/2026-07-11-pre-semester-coding-campaign.md` (batch-4 entry + register), `docs/plans/2026-07-12-fail-loud-sweep-design.md` (amendments section)

- [ ] **Step 1: Full suite from repo root**

Run: `npm test`
Expected: ALL PASS, count ≥ 2201 + new tests. Fix anything red before proceeding — this is the authoritative gate (no branch protection).

- [ ] **Step 2: Update the campaign doc**

In `docs/plans/2026-07-11-pre-semester-coding-campaign.md`:
- Rewrite item 3 (Batch 4) as shipped-in-progress with the census corrections: 12 silent sites (not ~6), 29 nested-logged sites fixed by the never-throw change, 5 eager services (not 1), migration 040, B1-F8 + dbUser-null folded in as planned.
- Mark register entry **B1-F8** resolved by this batch; note in **B1-F1**'s follow-up (ii) that the dbUser-null fall-through is fixed here.
- Add new register entries (from the design §5): `bookRegistration.js:620-622` bare catch; `status.js:1230` DB-outage-as-404 (+ :645/:842/:1182 silent per-chapter skews); `findByProviderId` ignores `is_active` (lead decision); `applied_by` missing on apply snapshots (batch 5).

- [ ] **Step 3: Append an Amendments section to the design doc**

Record implementation findings in `docs/plans/2026-07-12-fail-loud-sweep-design.md`:
- D4 executed with a lazily-built statements cache instead of inline prepares (rationale: ~40-call-site churn avoided; cache reset in `_setTestDb` also fixes the closed-DB footgun).
- `status.js:156` dashboard catch gained a log line (design §3.6 said "verify and add if bare" — it was bare).
- `activityLogging.test.js` only passed on fresh CI because of the eager import's table creation — converted to injected DB (discovered in Task 2).
- The tripwire targets the exact empty-catch idiom, not the phrase "fire-and-forget" (legitimate prose uses exist in tmService).
- Anything else discovered during execution.

- [ ] **Step 4: Commit**

```bash
git add docs/plans/2026-07-11-pre-semester-coding-campaign.md docs/plans/2026-07-12-fail-loud-sweep-design.md
git commit -m "docs: batch-4 register updates + design amendments"
```

- [ ] **Step 5: Hand off**

Execution complete → final whole-branch review (multi-lens Workflow review per campaign practice), then `superpowers:finishing-a-development-branch` → PR off `main` titled `fix(server): fail-loud sweep — never-throw audit writes, lazy DB opens, honest failures (batch 4)`.
