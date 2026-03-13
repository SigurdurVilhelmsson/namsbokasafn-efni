# Unified Pipeline Status Layer — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Consolidate the dual status tracking systems (status.json files + DB timestamp fields) into a single `chapter_pipeline_status` table as source of truth, with status.json demoted to a derived cache.

**Architecture:** New migration 017 creates `chapter_pipeline_status` table. A standalone backfill script reads all existing status.json files and populates the table idempotently. The existing `advanceChapterStatus()` and `resetChapterStage()` are replaced by four new functions (`getChapterStage`, `transitionStage`, `revertStage`, `getStageHistory`) that write to the DB first, then update the file cache. All existing callers are updated to use the new API.

**Tech Stack:** better-sqlite3 12 (transactions), Node.js 24, Vitest for tests

---

## Stage Definitions

The eight stages in pipeline order:

```
STAGE_ORDER = ['extraction', 'mtReady', 'mtOutput', 'linguisticReview',
               'tmCreated', 'injection', 'rendering', 'publication']
```

Publication has three independent sub-tracks: `publication.mtPreview`, `publication.faithful`, `publication.localized`.

Valid status values: `'not_started'`, `'in_progress'`, `'complete'`.

---

### Task 1: Migration 017 — Create `chapter_pipeline_status` Table

**Files:**
- Create: `server/migrations/017-pipeline-status.js`
- Modify: `server/services/migrationRunner.js:28-45` (add to migration list)

**Step 1: Write the migration file**

```js
// server/migrations/017-pipeline-status.js
module.exports = {
  name: '017-pipeline-status',

  up(db) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS chapter_pipeline_status (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        book_slug TEXT NOT NULL,
        chapter_num INTEGER NOT NULL,
        stage TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'not_started',
        completed_at DATETIME,
        completed_by TEXT,
        notes TEXT,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(book_slug, chapter_num, stage)
      );
    `);

    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_pipeline_status_book_chapter
        ON chapter_pipeline_status(book_slug, chapter_num);
    `);

    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_pipeline_status_stage
        ON chapter_pipeline_status(stage);
    `);

    db.exec(`
      CREATE TRIGGER IF NOT EXISTS update_pipeline_status_timestamp
        AFTER UPDATE ON chapter_pipeline_status
        BEGIN
          UPDATE chapter_pipeline_status SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
        END;
    `);
  },

  down(db) {
    db.exec('DROP TRIGGER IF EXISTS update_pipeline_status_timestamp;');
    db.exec('DROP TABLE IF EXISTS chapter_pipeline_status;');
  },
};
```

**Step 2: Register in migrationRunner.js**

Add to the migrations array (after line 44):
```js
require('../migrations/017-pipeline-status'),
```

**Step 3: Run tests to verify nothing breaks**

Run: `npm test`
Expected: All 182 tests pass. Migration is CREATE IF NOT EXISTS so idempotent.

**Step 4: Verify migration runs**

Run: `node -e "const {runAllMigrations} = require('./server/services/migrationRunner'); console.log(runAllMigrations())"`
Expected: Output includes `applied: 1` (or `skipped` if already run).

**Step 5: Commit**

```bash
git add server/migrations/017-pipeline-status.js server/services/migrationRunner.js
git commit -m "feat: add chapter_pipeline_status table (migration 017)"
```

---

### Task 2: Backfill Script — `migrate-pipeline-status.js`

**Files:**
- Create: `tools/migrate-pipeline-status.js`

**Context needed:**
- status.json structure: `{ status: { extraction: { complete: true, date: "2026-01-12", notes: "..." }, ... } }`
- Publication sub-tracks stored as: `status.publication.mtPreview`, `.faithful`, `.localized`
- Chapter dirs: `books/{book}/chapters/ch{NN}/status.json` and `books/{book}/chapters/appendices/status.json`
- Books to scan: all dirs under `books/` that have a `chapters/` subdirectory
- The script must be idempotent (use INSERT OR IGNORE)
- Publication sub-tracks become three rows with stages: `publication.mtPreview`, `publication.faithful`, `publication.localized`

**Step 1: Write the backfill script**

```js
#!/usr/bin/env node
// tools/migrate-pipeline-status.js
//
// One-time backfill: reads status.json files and populates chapter_pipeline_status.
// Idempotent — safe to run multiple times (uses INSERT OR IGNORE).
//
// Usage: node tools/migrate-pipeline-status.js [--dry-run]

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const PROJECT_ROOT = path.join(__dirname, '..');
const BOOKS_DIR = path.join(PROJECT_ROOT, 'books');
const DB_PATH = path.join(PROJECT_ROOT, 'pipeline-output', 'sessions.db');

const STAGE_ORDER = [
  'extraction', 'mtReady', 'mtOutput', 'linguisticReview',
  'tmCreated', 'injection', 'rendering', 'publication',
];

const PUBLICATION_TRACKS = ['mtPreview', 'faithful', 'localized'];

const dryRun = process.argv.includes('--dry-run');

function main() {
  if (!fs.existsSync(DB_PATH)) {
    console.error('Database not found at', DB_PATH);
    console.error('Start the server once to create it, then run this script.');
    process.exit(1);
  }

  const db = new Database(DB_PATH);

  // Ensure the table exists (in case migration hasn't run via server)
  const tableExists = db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='chapter_pipeline_status'"
  ).get();

  if (!tableExists) {
    console.error('Table chapter_pipeline_status does not exist.');
    console.error('Run migration 017 first (start the server or run migrations manually).');
    db.close();
    process.exit(1);
  }

  const insert = db.prepare(`
    INSERT OR IGNORE INTO chapter_pipeline_status
      (book_slug, chapter_num, stage, status, completed_at, notes)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  let inserted = 0;
  let skipped = 0;
  let errors = 0;

  // Find all books with chapters/ directories
  const bookDirs = fs.readdirSync(BOOKS_DIR).filter(d => {
    const chaptersDir = path.join(BOOKS_DIR, d, 'chapters');
    return fs.existsSync(chaptersDir) && fs.statSync(chaptersDir).isDirectory();
  });

  for (const bookSlug of bookDirs) {
    const chaptersDir = path.join(BOOKS_DIR, bookSlug, 'chapters');
    const chapterDirs = fs.readdirSync(chaptersDir).filter(d => {
      return fs.existsSync(path.join(chaptersDir, d, 'status.json'));
    });

    for (const chDir of chapterDirs) {
      const statusPath = path.join(chaptersDir, chDir, 'status.json');
      let statusData;

      try {
        statusData = JSON.parse(fs.readFileSync(statusPath, 'utf8'));
      } catch (err) {
        console.error(`  ERROR reading ${statusPath}: ${err.message}`);
        errors++;
        continue;
      }

      // Parse chapter number: 'ch01' → 1, 'appendices' → -1 (special sentinel)
      const chapterNum = chDir === 'appendices' ? -1 : parseInt(chDir.replace('ch', ''), 10);
      if (isNaN(chapterNum)) {
        console.error(`  SKIP unrecognized chapter dir: ${chDir}`);
        continue;
      }

      const stageData = statusData.status || {};

      // Process the 7 non-publication stages
      for (const stage of STAGE_ORDER) {
        if (stage === 'publication') continue;

        const entry = stageData[stage];
        const status = entry && entry.complete ? 'complete' : 'not_started';
        const completedAt = entry && entry.complete && entry.date ? entry.date : null;
        const notes = entry && entry.notes ? entry.notes : null;

        if (dryRun) {
          console.log(`  DRY-RUN: ${bookSlug} ch${chapterNum} ${stage} → ${status}`);
          continue;
        }

        const result = insert.run(bookSlug, chapterNum, stage, status, completedAt, notes);
        if (result.changes > 0) {
          inserted++;
        } else {
          skipped++;
        }
      }

      // Process publication sub-tracks
      const pubData = stageData.publication || {};
      for (const track of PUBLICATION_TRACKS) {
        const entry = pubData[track];
        const stage = `publication.${track}`;
        const status = entry && entry.complete ? 'complete' : 'not_started';
        const completedAt = entry && entry.complete && entry.date ? entry.date : null;
        const notes = entry && entry.notes ? entry.notes : null;

        if (dryRun) {
          console.log(`  DRY-RUN: ${bookSlug} ch${chapterNum} ${stage} → ${status}`);
          continue;
        }

        const result = insert.run(bookSlug, chapterNum, stage, status, completedAt, notes);
        if (result.changes > 0) {
          inserted++;
        } else {
          skipped++;
        }
      }

      if (!dryRun) {
        console.log(`  ${bookSlug}/${chDir}: processed`);
      }
    }
  }

  db.close();

  console.log('');
  console.log('=== Backfill Summary ===');
  console.log(`  Inserted: ${inserted}`);
  console.log(`  Skipped (already existed): ${skipped}`);
  console.log(`  Errors: ${errors}`);

  if (dryRun) {
    console.log('  (DRY RUN — no rows were written)');
  }
}

main();
```

**Step 2: Run with --dry-run first**

Run: `node tools/migrate-pipeline-status.js --dry-run`
Expected: Prints each (book, chapter, stage, status) pair without writing. Should show ~23 chapters × 10 stages = ~230 lines for efnafraedi-2e, plus 10 for liffraedi-2e ch03.

**Step 3: Run for real**

Run: `node tools/migrate-pipeline-status.js`
Expected: `Inserted: ~230`, `Skipped: 0`, `Errors: 0`

**Step 4: Verify idempotency**

Run: `node tools/migrate-pipeline-status.js`
Expected: `Inserted: 0`, `Skipped: ~230`, `Errors: 0`

**Step 5: Spot-check DB contents**

Run: `node -e "const Database = require('better-sqlite3'); const db = new Database('pipeline-output/sessions.db', {readonly:true}); console.log(db.prepare('SELECT * FROM chapter_pipeline_status WHERE book_slug=? AND chapter_num=?').all('efnafraedi-2e', 1)); db.close()"`
Expected: 10 rows for ch01 — 7 stages + 3 publication sub-tracks. `extraction` should be `complete` with date `2026-01-12`.

**Step 6: Commit**

```bash
git add tools/migrate-pipeline-status.js
git commit -m "feat: add pipeline status backfill script (idempotent)"
```

---

### Task 3: Write Failing Tests for the Four Helper Functions

**Files:**
- Create: `server/__tests__/pipelineStatus.test.js`

**Context needed:**
- Tests use in-memory better-sqlite3 DB
- The stage order and validation rules must be tested
- Publication sub-tracks are stages named `publication.mtPreview`, etc.
- `revertStage` goes back one stage, requires a note

**Step 1: Write the test file**

```js
// server/__tests__/pipelineStatus.test.js
import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';

// We'll import these after implementation — for now, test the contract
let getChapterStage, transitionStage, revertStage, getStageHistory;
let _setTestDb;

// Create a fresh in-memory DB with the pipeline_status schema for each test
function createTestDb() {
  const db = new Database(':memory:');

  db.exec(`
    CREATE TABLE chapter_pipeline_status (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      book_slug TEXT NOT NULL,
      chapter_num INTEGER NOT NULL,
      stage TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'not_started',
      completed_at DATETIME,
      completed_by TEXT,
      notes TEXT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(book_slug, chapter_num, stage)
    );
  `);

  db.exec(`
    CREATE TABLE chapter_generation_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      book_slug TEXT NOT NULL,
      chapter_num INTEGER NOT NULL,
      action TEXT NOT NULL,
      user_id TEXT,
      username TEXT,
      details TEXT DEFAULT '{}',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  return db;
}

// Dynamic import — tests will fail until implementation exists
beforeEach(async () => {
  const mod = await import('../services/pipelineStatusService.js');
  getChapterStage = mod.getChapterStage;
  transitionStage = mod.transitionStage;
  revertStage = mod.revertStage;
  getStageHistory = mod.getStageHistory;
  _setTestDb = mod._setTestDb;
});

describe('pipelineStatusService', () => {
  let db;

  beforeEach(() => {
    db = createTestDb();
    _setTestDb(db);
  });

  // -----------------------------------------------------------------
  // getChapterStage
  // -----------------------------------------------------------------
  describe('getChapterStage', () => {
    it('returns not_started for all stages when no rows exist', () => {
      const result = getChapterStage('efnafraedi-2e', 1);
      expect(result.currentStage).toBe('extraction');
      expect(result.stages.extraction).toBe('not_started');
      expect(result.stages.rendering).toBe('not_started');
      expect(result.publication.mtPreview).toBe('not_started');
      expect(result.publication.faithful).toBe('not_started');
      expect(result.publication.localized).toBe('not_started');
    });

    it('returns correct current stage when some stages are complete', () => {
      db.prepare(`INSERT INTO chapter_pipeline_status (book_slug, chapter_num, stage, status, completed_at) VALUES (?, ?, ?, ?, ?)`)
        .run('efnafraedi-2e', 1, 'extraction', 'complete', '2026-01-12');
      db.prepare(`INSERT INTO chapter_pipeline_status (book_slug, chapter_num, stage, status, completed_at) VALUES (?, ?, ?, ?, ?)`)
        .run('efnafraedi-2e', 1, 'mtReady', 'complete', '2026-01-12');
      db.prepare(`INSERT INTO chapter_pipeline_status (book_slug, chapter_num, stage, status) VALUES (?, ?, ?, ?)`)
        .run('efnafraedi-2e', 1, 'mtOutput', 'in_progress');

      const result = getChapterStage('efnafraedi-2e', 1);
      expect(result.currentStage).toBe('mtOutput');
      expect(result.stages.extraction).toBe('complete');
      expect(result.stages.mtReady).toBe('complete');
      expect(result.stages.mtOutput).toBe('in_progress');
      expect(result.stages.linguisticReview).toBe('not_started');
    });

    it('reports publication sub-tracks independently', () => {
      db.prepare(`INSERT INTO chapter_pipeline_status (book_slug, chapter_num, stage, status, completed_at) VALUES (?, ?, ?, ?, ?)`)
        .run('efnafraedi-2e', 1, 'publication.mtPreview', 'complete', '2026-01-13');

      const result = getChapterStage('efnafraedi-2e', 1);
      expect(result.publication.mtPreview).toBe('complete');
      expect(result.publication.faithful).toBe('not_started');
      expect(result.publication.localized).toBe('not_started');
    });

    it('handles appendices (chapter_num = -1)', () => {
      db.prepare(`INSERT INTO chapter_pipeline_status (book_slug, chapter_num, stage, status) VALUES (?, ?, ?, ?)`)
        .run('efnafraedi-2e', -1, 'extraction', 'complete');

      const result = getChapterStage('efnafraedi-2e', -1);
      expect(result.stages.extraction).toBe('complete');
    });
  });

  // -----------------------------------------------------------------
  // transitionStage
  // -----------------------------------------------------------------
  describe('transitionStage', () => {
    it('allows setting extraction to complete on a fresh chapter', () => {
      const result = transitionStage('efnafraedi-2e', 1, 'extraction', 'complete', 'user1', 'Extracted OK');
      expect(result.stage).toBe('extraction');
      expect(result.status).toBe('complete');

      const row = db.prepare('SELECT * FROM chapter_pipeline_status WHERE book_slug = ? AND chapter_num = ? AND stage = ?')
        .get('efnafraedi-2e', 1, 'extraction');
      expect(row.status).toBe('complete');
      expect(row.completed_by).toBe('user1');
      expect(row.notes).toBe('Extracted OK');
    });

    it('allows setting a stage to in_progress', () => {
      transitionStage('efnafraedi-2e', 1, 'extraction', 'in_progress', 'user1');
      const row = db.prepare('SELECT * FROM chapter_pipeline_status WHERE book_slug = ? AND chapter_num = ? AND stage = ?')
        .get('efnafraedi-2e', 1, 'extraction');
      expect(row.status).toBe('in_progress');
      expect(row.completed_at).toBeNull();
    });

    it('rejects completing a stage when prior stage is not complete', () => {
      // Try to complete mtReady without extraction being complete
      expect(() => {
        transitionStage('efnafraedi-2e', 1, 'mtReady', 'complete', 'user1');
      }).toThrow(/extraction.*must be complete/i);
    });

    it('allows setting a stage to in_progress even if prior stage is not complete', () => {
      // in_progress is allowed at any time (e.g., "extraction started")
      transitionStage('efnafraedi-2e', 1, 'extraction', 'in_progress', 'user1');
      const row = db.prepare('SELECT * FROM chapter_pipeline_status WHERE book_slug = ? AND chapter_num = ? AND stage = ?')
        .get('efnafraedi-2e', 1, 'extraction');
      expect(row.status).toBe('in_progress');
    });

    it('rejects invalid stage names', () => {
      expect(() => {
        transitionStage('efnafraedi-2e', 1, 'bogusStage', 'complete', 'user1');
      }).toThrow(/invalid stage/i);
    });

    it('rejects invalid status values', () => {
      expect(() => {
        transitionStage('efnafraedi-2e', 1, 'extraction', 'maybe', 'user1');
      }).toThrow(/invalid status/i);
    });

    it('allows publication sub-track transitions independently', () => {
      // Complete all 7 pre-publication stages first
      const stages = ['extraction', 'mtReady', 'mtOutput', 'linguisticReview', 'tmCreated', 'injection', 'rendering'];
      for (const stage of stages) {
        db.prepare(`INSERT INTO chapter_pipeline_status (book_slug, chapter_num, stage, status, completed_at) VALUES (?, ?, ?, ?, ?)`)
          .run('efnafraedi-2e', 1, stage, 'complete', '2026-01-12');
      }

      transitionStage('efnafraedi-2e', 1, 'publication.mtPreview', 'complete', 'user1', 'Published');
      const result = getChapterStage('efnafraedi-2e', 1);
      expect(result.publication.mtPreview).toBe('complete');
      expect(result.publication.faithful).toBe('not_started');
    });

    it('rejects publication sub-track completion if rendering is not complete', () => {
      expect(() => {
        transitionStage('efnafraedi-2e', 1, 'publication.mtPreview', 'complete', 'user1');
      }).toThrow(/rendering.*must be complete/i);
    });

    it('updates existing row on repeated transition', () => {
      transitionStage('efnafraedi-2e', 1, 'extraction', 'in_progress', 'user1');
      transitionStage('efnafraedi-2e', 1, 'extraction', 'complete', 'user1', 'Done');

      const rows = db.prepare('SELECT * FROM chapter_pipeline_status WHERE book_slug = ? AND chapter_num = ? AND stage = ?')
        .all('efnafraedi-2e', 1, 'extraction');
      expect(rows).toHaveLength(1);
      expect(rows[0].status).toBe('complete');
    });
  });

  // -----------------------------------------------------------------
  // revertStage
  // -----------------------------------------------------------------
  describe('revertStage', () => {
    it('reverts the latest complete stage to not_started', () => {
      db.prepare(`INSERT INTO chapter_pipeline_status (book_slug, chapter_num, stage, status, completed_at) VALUES (?, ?, ?, ?, ?)`)
        .run('efnafraedi-2e', 1, 'extraction', 'complete', '2026-01-12');
      db.prepare(`INSERT INTO chapter_pipeline_status (book_slug, chapter_num, stage, status, completed_at) VALUES (?, ?, ?, ?, ?)`)
        .run('efnafraedi-2e', 1, 'mtReady', 'complete', '2026-01-12');

      const result = revertStage('efnafraedi-2e', 1, 'admin1', 'Re-extract needed');
      expect(result.revertedStage).toBe('mtReady');
      expect(result.newStatus).toBe('not_started');

      const row = db.prepare('SELECT * FROM chapter_pipeline_status WHERE book_slug = ? AND chapter_num = ? AND stage = ?')
        .get('efnafraedi-2e', 1, 'mtReady');
      expect(row.status).toBe('not_started');
      expect(row.completed_at).toBeNull();
    });

    it('requires a non-empty note', () => {
      db.prepare(`INSERT INTO chapter_pipeline_status (book_slug, chapter_num, stage, status) VALUES (?, ?, ?, ?)`)
        .run('efnafraedi-2e', 1, 'extraction', 'complete');

      expect(() => {
        revertStage('efnafraedi-2e', 1, 'admin1', '');
      }).toThrow(/note.*required/i);

      expect(() => {
        revertStage('efnafraedi-2e', 1, 'admin1');
      }).toThrow(/note.*required/i);
    });

    it('throws when no stages are complete', () => {
      expect(() => {
        revertStage('efnafraedi-2e', 1, 'admin1', 'Revert needed');
      }).toThrow(/no completed stage/i);
    });
  });

  // -----------------------------------------------------------------
  // getStageHistory
  // -----------------------------------------------------------------
  describe('getStageHistory', () => {
    it('returns pipeline status rows merged with generation log', () => {
      db.prepare(`INSERT INTO chapter_pipeline_status (book_slug, chapter_num, stage, status, completed_at, completed_by, notes) VALUES (?, ?, ?, ?, ?, ?, ?)`)
        .run('efnafraedi-2e', 1, 'extraction', 'complete', '2026-01-12', 'user1', 'Extracted');

      db.prepare(`INSERT INTO chapter_generation_log (book_slug, chapter_num, action, user_id, username, details) VALUES (?, ?, ?, ?, ?, ?)`)
        .run('efnafraedi-2e', 1, 'extract', 'user1', 'User One', '{"modules": 7}');

      const history = getStageHistory('efnafraedi-2e', 1);
      expect(history.length).toBeGreaterThanOrEqual(2);
      expect(history.some(h => h.type === 'status' && h.stage === 'extraction')).toBe(true);
      expect(history.some(h => h.type === 'log' && h.action === 'extract')).toBe(true);
    });

    it('returns empty array when no data exists', () => {
      const history = getStageHistory('nonexistent', 99);
      expect(history).toEqual([]);
    });
  });
});
```

**Step 2: Run the tests to verify they fail**

Run: `npx vitest run server/__tests__/pipelineStatus.test.js`
Expected: FAIL — `Cannot find module '../services/pipelineStatusService.js'`

**Step 3: Commit**

```bash
git add server/__tests__/pipelineStatus.test.js
git commit -m "test: add failing tests for pipeline status service"
```

---

### Task 4: Implement `pipelineStatusService.js`

**Files:**
- Create: `server/services/pipelineStatusService.js`

**Context needed:**
- DB path: `pipeline-output/sessions.db`
- Must support `_setTestDb(db)` for injecting in-memory test DBs
- Stage order: `['extraction', 'mtReady', 'mtOutput', 'linguisticReview', 'tmCreated', 'injection', 'rendering', 'publication']`
- Publication sub-tracks: `publication.mtPreview`, `publication.faithful`, `publication.localized`
- `transitionStage` must validate: to complete stage N, stage N-1 must be complete
- Publication sub-tracks require `rendering` to be complete
- `revertStage` finds the latest completed stage in order and resets it

**Step 1: Write the service**

```js
// server/services/pipelineStatusService.js
/**
 * Pipeline Status Service
 *
 * Single source of truth for pipeline stage tracking.
 * Reads/writes chapter_pipeline_status table.
 * status.json is a derived cache — updated after DB writes.
 */

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const PROJECT_ROOT = path.join(__dirname, '..', '..');
const BOOKS_DIR = path.join(PROJECT_ROOT, 'books');
const DB_PATH = path.join(PROJECT_ROOT, 'pipeline-output', 'sessions.db');

const STAGE_ORDER = [
  'extraction', 'mtReady', 'mtOutput', 'linguisticReview',
  'tmCreated', 'injection', 'rendering', 'publication',
];

const PUBLICATION_TRACKS = ['mtPreview', 'faithful', 'localized'];

const VALID_STATUSES = ['not_started', 'in_progress', 'complete'];

// All valid stage identifiers (7 base stages + 3 publication sub-tracks)
const ALL_STAGES = [
  ...STAGE_ORDER.filter(s => s !== 'publication'),
  ...PUBLICATION_TRACKS.map(t => `publication.${t}`),
];

// Test injection
let _testDb = null;

function _setTestDb(db) {
  _testDb = db;
}

function getDb() {
  if (_testDb) return _testDb;
  return new Database(DB_PATH);
}

function closeDb(db) {
  if (_testDb) return; // don't close injected test DB
  db.close();
}

// -----------------------------------------------------------------
// chapterDir helper (shared with pipelineService)
// -----------------------------------------------------------------

function chapterDir(chapter) {
  if (chapter === -1 || chapter === 'appendices') return 'appendices';
  return `ch${String(chapter).padStart(2, '0')}`;
}

// -----------------------------------------------------------------
// getChapterStage
// -----------------------------------------------------------------

/**
 * Get the current pipeline status for a chapter.
 *
 * @param {string} bookSlug
 * @param {number} chapterNum - use -1 for appendices
 * @returns {{ currentStage: string, stages: Object, publication: Object }}
 */
function getChapterStage(bookSlug, chapterNum) {
  const db = getDb();

  try {
    const rows = db.prepare(
      'SELECT stage, status, completed_at, completed_by, notes FROM chapter_pipeline_status WHERE book_slug = ? AND chapter_num = ?'
    ).all(bookSlug, chapterNum);

    // Build lookup
    const lookup = {};
    for (const row of rows) {
      lookup[row.stage] = row;
    }

    // Build stages object (7 base stages)
    const stages = {};
    for (const stage of STAGE_ORDER) {
      if (stage === 'publication') continue;
      stages[stage] = lookup[stage]?.status || 'not_started';
    }

    // Build publication sub-tracks
    const publication = {};
    for (const track of PUBLICATION_TRACKS) {
      const key = `publication.${track}`;
      publication[track] = lookup[key]?.status || 'not_started';
    }

    // Determine current stage: first non-complete stage, or the in_progress one
    let currentStage = 'publication';
    for (const stage of STAGE_ORDER) {
      if (stage === 'publication') continue;
      if (stages[stage] !== 'complete') {
        currentStage = stage;
        break;
      }
    }

    return { currentStage, stages, publication };
  } finally {
    closeDb(db);
  }
}

// -----------------------------------------------------------------
// transitionStage
// -----------------------------------------------------------------

/**
 * Transition a pipeline stage to a new status.
 * Validates legal transitions: to complete stage N, stage N-1 must be complete.
 * Publication sub-tracks require rendering to be complete.
 *
 * @param {string} bookSlug
 * @param {number} chapterNum
 * @param {string} stage - stage name (e.g. 'extraction', 'publication.mtPreview')
 * @param {string} status - 'not_started', 'in_progress', or 'complete'
 * @param {string} [user] - who triggered the transition
 * @param {string} [note] - optional note
 * @returns {{ stage: string, status: string }}
 */
function transitionStage(bookSlug, chapterNum, stage, status, user, note) {
  // Validate inputs
  if (!ALL_STAGES.includes(stage)) {
    throw new Error(`Invalid stage: '${stage}'. Valid stages: ${ALL_STAGES.join(', ')}`);
  }
  if (!VALID_STATUSES.includes(status)) {
    throw new Error(`Invalid status: '${status}'. Valid statuses: ${VALID_STATUSES.join(', ')}`);
  }

  const db = getDb();

  try {
    const doTransition = db.transaction(() => {
      // Validation: completing a stage requires prior stage to be complete
      if (status === 'complete') {
        if (stage.startsWith('publication.')) {
          // Publication sub-tracks require rendering to be complete
          const renderingRow = db.prepare(
            'SELECT status FROM chapter_pipeline_status WHERE book_slug = ? AND chapter_num = ? AND stage = ?'
          ).get(bookSlug, chapterNum, 'rendering');

          if (!renderingRow || renderingRow.status !== 'complete') {
            throw new Error(
              `Cannot complete ${stage}: rendering must be complete first`
            );
          }
        } else {
          // Regular stage: check the prior stage in STAGE_ORDER
          const baseStages = STAGE_ORDER.filter(s => s !== 'publication');
          const idx = baseStages.indexOf(stage);

          if (idx > 0) {
            const priorStage = baseStages[idx - 1];
            const priorRow = db.prepare(
              'SELECT status FROM chapter_pipeline_status WHERE book_slug = ? AND chapter_num = ? AND stage = ?'
            ).get(bookSlug, chapterNum, priorStage);

            if (!priorRow || priorRow.status !== 'complete') {
              throw new Error(
                `Cannot complete ${stage}: ${priorStage} must be complete first`
              );
            }
          }
        }
      }

      // Upsert the status row
      const completedAt = status === 'complete' ? new Date().toISOString() : null;

      db.prepare(`
        INSERT INTO chapter_pipeline_status (book_slug, chapter_num, stage, status, completed_at, completed_by, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(book_slug, chapter_num, stage) DO UPDATE SET
          status = excluded.status,
          completed_at = excluded.completed_at,
          completed_by = excluded.completed_by,
          notes = COALESCE(excluded.notes, chapter_pipeline_status.notes)
      `).run(bookSlug, chapterNum, stage, status, completedAt, user || null, note || null);
    });

    doTransition();

    // Update the status.json cache (best-effort)
    syncStatusJsonCache(bookSlug, chapterNum);

    return { stage, status };
  } finally {
    closeDb(db);
  }
}

// -----------------------------------------------------------------
// revertStage
// -----------------------------------------------------------------

/**
 * Revert the latest completed pipeline stage to not_started.
 * Admin-only operation. Requires a non-empty note explaining why.
 *
 * @param {string} bookSlug
 * @param {number} chapterNum
 * @param {string} user - who triggered the revert
 * @param {string} note - required explanation
 * @returns {{ revertedStage: string, newStatus: string }}
 */
function revertStage(bookSlug, chapterNum, user, note) {
  if (!note || !note.trim()) {
    throw new Error('A note is required when reverting a stage');
  }

  const db = getDb();

  try {
    const doRevert = db.transaction(() => {
      // Find all complete stages for this chapter
      const rows = db.prepare(
        `SELECT stage, status FROM chapter_pipeline_status
         WHERE book_slug = ? AND chapter_num = ? AND status = 'complete'`
      ).all(bookSlug, chapterNum);

      if (rows.length === 0) {
        throw new Error('No completed stage to revert');
      }

      // Find the latest completed stage in pipeline order
      // Check publication sub-tracks first, then base stages in reverse
      const completedStages = new Set(rows.map(r => r.stage));

      let latestStage = null;

      // Check publication sub-tracks (they come after base stages)
      for (const track of [...PUBLICATION_TRACKS].reverse()) {
        const key = `publication.${track}`;
        if (completedStages.has(key)) {
          latestStage = key;
          break;
        }
      }

      // If no publication track was complete, check base stages in reverse
      if (!latestStage) {
        const baseStages = STAGE_ORDER.filter(s => s !== 'publication');
        for (let i = baseStages.length - 1; i >= 0; i--) {
          if (completedStages.has(baseStages[i])) {
            latestStage = baseStages[i];
            break;
          }
        }
      }

      if (!latestStage) {
        throw new Error('No completed stage to revert');
      }

      // Revert it
      db.prepare(`
        UPDATE chapter_pipeline_status
        SET status = 'not_started', completed_at = NULL, completed_by = NULL, notes = ?
        WHERE book_slug = ? AND chapter_num = ? AND stage = ?
      `).run(`Reverted by ${user}: ${note}`, bookSlug, chapterNum, latestStage);

      return { revertedStage: latestStage, newStatus: 'not_started' };
    });

    const result = doRevert();

    // Update the status.json cache
    syncStatusJsonCache(bookSlug, chapterNum);

    return result;
  } finally {
    closeDb(db);
  }
}

// -----------------------------------------------------------------
// getStageHistory
// -----------------------------------------------------------------

/**
 * Get full audit trail for a chapter: pipeline status + generation log.
 *
 * @param {string} bookSlug
 * @param {number} chapterNum
 * @returns {Array<{ type: string, ... }>}
 */
function getStageHistory(bookSlug, chapterNum) {
  const db = getDb();

  try {
    // Get status rows
    const statusRows = db.prepare(
      `SELECT stage, status, completed_at, completed_by, notes, updated_at
       FROM chapter_pipeline_status
       WHERE book_slug = ? AND chapter_num = ?
       ORDER BY updated_at DESC`
    ).all(bookSlug, chapterNum);

    // Get generation log rows (if table exists)
    let logRows = [];
    try {
      logRows = db.prepare(
        `SELECT action, user_id, username, details, created_at
         FROM chapter_generation_log
         WHERE book_slug = ? AND chapter_num = ?
         ORDER BY created_at DESC`
      ).all(bookSlug, chapterNum);
    } catch {
      // Table may not exist — that's fine
    }

    // Merge and sort by timestamp descending
    const merged = [
      ...statusRows.map(r => ({
        type: 'status',
        stage: r.stage,
        status: r.status,
        completedAt: r.completed_at,
        completedBy: r.completed_by,
        notes: r.notes,
        timestamp: r.updated_at,
      })),
      ...logRows.map(r => ({
        type: 'log',
        action: r.action,
        userId: r.user_id,
        username: r.username,
        details: r.details ? JSON.parse(r.details) : {},
        timestamp: r.created_at,
      })),
    ];

    merged.sort((a, b) => {
      const ta = a.timestamp || '';
      const tb = b.timestamp || '';
      return tb.localeCompare(ta);
    });

    return merged;
  } finally {
    closeDb(db);
  }
}

// -----------------------------------------------------------------
// syncStatusJsonCache — write status.json as derived cache
// -----------------------------------------------------------------

/**
 * Update the status.json file from DB state.
 * Best-effort: errors are logged, not thrown.
 *
 * @param {string} bookSlug
 * @param {number} chapterNum
 */
function syncStatusJsonCache(bookSlug, chapterNum) {
  // Skip in test mode — no filesystem
  if (_testDb) return;

  try {
    const dir = chapterDir(chapterNum);
    const statusPath = path.join(BOOKS_DIR, bookSlug, 'chapters', dir, 'status.json');

    // Read existing status.json to preserve non-pipeline fields
    let statusData = {};
    if (fs.existsSync(statusPath)) {
      statusData = JSON.parse(fs.readFileSync(statusPath, 'utf8'));
    }

    // Get current state from DB
    const { stages, publication } = getChapterStage(bookSlug, chapterNum);

    // Rebuild the status object in the format status.json expects
    const newStatus = {};

    for (const stage of STAGE_ORDER) {
      if (stage === 'publication') {
        // Publication has sub-tracks
        newStatus.publication = {};
        for (const track of PUBLICATION_TRACKS) {
          const dbStatus = publication[track];
          const existing = statusData.status?.publication?.[track] || {};
          newStatus.publication[track] = {
            complete: dbStatus === 'complete',
            ...(existing.date && dbStatus === 'complete' ? { date: existing.date } : {}),
            ...(dbStatus === 'complete' && !existing.date ? { date: new Date().toISOString().split('T')[0] } : {}),
            ...(existing.notes ? { notes: existing.notes } : {}),
          };
        }
      } else {
        const dbStatus = stages[stage];
        const existing = statusData.status?.[stage] || {};
        newStatus[stage] = {
          complete: dbStatus === 'complete',
          ...(existing.date && dbStatus === 'complete' ? { date: existing.date } : {}),
          ...(dbStatus === 'complete' && !existing.date ? { date: new Date().toISOString().split('T')[0] } : {}),
          ...(existing.notes ? { notes: existing.notes } : {}),
        };
      }
    }

    statusData.status = newStatus;

    const statusDir = path.dirname(statusPath);
    if (!fs.existsSync(statusDir)) {
      fs.mkdirSync(statusDir, { recursive: true });
    }

    fs.writeFileSync(statusPath, JSON.stringify(statusData, null, 2), 'utf8');
  } catch (err) {
    console.error(`syncStatusJsonCache failed for ${bookSlug} ch${chapterNum}:`, err.message);
  }
}

module.exports = {
  getChapterStage,
  transitionStage,
  revertStage,
  getStageHistory,
  syncStatusJsonCache,
  _setTestDb,
  STAGE_ORDER,
  PUBLICATION_TRACKS,
  ALL_STAGES,
  VALID_STATUSES,
};
```

**Step 2: Run the tests**

Run: `npx vitest run server/__tests__/pipelineStatus.test.js`
Expected: All tests pass.

**Step 3: Run full test suite**

Run: `npm test`
Expected: All 182 existing tests still pass + new tests pass.

**Step 4: Commit**

```bash
git add server/services/pipelineStatusService.js
git commit -m "feat: implement pipelineStatusService with stage validation"
```

---

### Task 5: Update `advanceChapterStatus` and `resetChapterStage` in `pipelineService.js`

**Files:**
- Modify: `server/services/pipelineService.js:676-732` (replace advanceChapterStatus + resetChapterStage)
- Modify: `server/services/pipelineService.js:1-20` (add require)
- Modify: `server/services/pipelineService.js:640-660` (update getStageStatus)

**Context needed:**
- 8 callers of `advanceChapterStatus` across pipelineService.js and segmentEditorService.js
- 1 caller of `resetChapterStage` in pipelineService.js
- 3 callers of `getStageStatus` in pipeline.js routes
- The new functions should be drop-in replacements — same signature, but now write to DB first
- `advanceChapterStatus` maps to `transitionStage(book, chapter, stage, 'complete', null, extra-notes)`
- `resetChapterStage` maps to `transitionStage(book, chapter, stage, 'not_started')`
- `getStageStatus` should read from DB via `getChapterStage`, returning the same shape callers expect

**Step 1: Add the import**

At top of pipelineService.js (after line 19):
```js
const pipelineStatus = require('./pipelineStatusService');
```

**Step 2: Replace `advanceChapterStatus`**

Replace lines 676-706 with:
```js
function advanceChapterStatus(book, chapter, stage, extra = {}) {
  try {
    const chapterNum = chapter === 'appendices' ? -1 : Number(chapter);
    const notes = extra.notes || (extra.track ? `track: ${extra.track}` : null) ||
      (extra.sourceHash ? `sourceHash: ${extra.sourceHash}` : null);

    pipelineStatus.transitionStage(book, chapterNum, stage, 'complete', null, notes);
  } catch (err) {
    console.error(`Auto-advance status failed for ch${chapter} ${stage}:`, err.message);
  }
}
```

**Step 3: Replace `resetChapterStage`**

Replace lines 716-732 with:
```js
function resetChapterStage(book, chapter, stage) {
  try {
    const chapterNum = chapter === 'appendices' ? -1 : Number(chapter);
    pipelineStatus.transitionStage(book, chapterNum, stage, 'not_started');
  } catch (err) {
    console.error(`Reset stage failed for ch${chapter} ${stage}:`, err.message);
  }
}
```

**Step 4: Update `getStageStatus`**

Replace lines 651-661 with:
```js
function getStageStatus(book, chapter) {
  try {
    const chapterNum = chapter === 'appendices' ? -1 : Number(chapter);
    const { stages, publication } = pipelineStatus.getChapterStage(book, chapterNum);

    // Convert to the shape callers expect: { stage: { complete: bool, ... } }
    const result = {};
    for (const [stage, status] of Object.entries(stages)) {
      result[stage] = { complete: status === 'complete' };
    }
    result.publication = {};
    for (const [track, status] of Object.entries(publication)) {
      result.publication[track] = { complete: status === 'complete' };
    }
    return result;
  } catch {
    return {};
  }
}
```

**Step 5: Run tests**

Run: `npm test`
Expected: All tests pass. The pipeline integration tests call advanceChapterStatus indirectly through pipeline runs.

**Step 6: Commit**

```bash
git add server/services/pipelineService.js
git commit -m "refactor: route advanceChapterStatus through pipelineStatusService"
```

---

### Task 6: Update `segmentEditorService.js` Caller

**Files:**
- Modify: `server/services/segmentEditorService.js:11` (import change)
- Modify: `server/services/segmentEditorService.js:645` (caller)

**Context needed:**
- Line 11: `const { advanceChapterStatus } = require('./pipelineService');`
- Line 645: `advanceChapterStatus(book, chapter, 'linguisticReview');`
- Line 685 in books.js: `advanceChapterStatus(bookId, chapterNum, 'mtOutput');`
- These callers don't need changes — they call the same function in pipelineService.js which now delegates to pipelineStatusService internally

**Step 1: Verify no changes needed**

The `advanceChapterStatus` function in pipelineService.js has the same signature as before. The callers in segmentEditorService.js and books.js import from pipelineService.js and will automatically use the new implementation.

Verify: `npm test`
Expected: All tests pass.

**Step 2: (No commit needed — no changes)**

---

### Task 7: Manual Verification

**Step 1: Run the backfill script**

Run: `node tools/migrate-pipeline-status.js`
Expected: All chapters populated from status.json.

**Step 2: Verify DB matches status.json for ch01**

Run:
```bash
node -e "
  const Database = require('better-sqlite3');
  const db = new Database('pipeline-output/sessions.db', {readonly:true});
  const rows = db.prepare('SELECT stage, status, completed_at, notes FROM chapter_pipeline_status WHERE book_slug = ? AND chapter_num = ? ORDER BY stage').all('efnafraedi-2e', 1);
  console.table(rows);
  db.close();
"
```
Expected: extraction=complete, mtReady=complete, mtOutput=complete, linguisticReview=not_started, etc. Publication.mtPreview=complete.

**Step 3: Verify the round-trip**

Run:
```bash
node -e "
  const svc = require('./server/services/pipelineStatusService');
  console.log(JSON.stringify(svc.getChapterStage('efnafraedi-2e', 1), null, 2));
"
```
Expected: Shows current stage + all stage statuses + publication sub-tracks.

**Step 4: Run full test suite one final time**

Run: `npm test`
Expected: All tests pass (182 existing + new pipelineStatus tests).

---

## File Change Summary

| Action | File | Purpose |
|--------|------|---------|
| CREATE | `server/migrations/017-pipeline-status.js` | New table migration |
| CREATE | `server/services/pipelineStatusService.js` | Four helper functions |
| CREATE | `server/__tests__/pipelineStatus.test.js` | Tests for the service |
| CREATE | `tools/migrate-pipeline-status.js` | One-time backfill script |
| MODIFY | `server/services/migrationRunner.js` | Register migration 017 |
| MODIFY | `server/services/pipelineService.js` | Replace advanceChapterStatus, resetChapterStage, getStageStatus |

## What This Does NOT Change

- No new API endpoints (Step 4 of the user's request: "Do not add API endpoints yet")
- No frontend changes
- No changes to segment editor, localization editor, or publication routes
- The `books.js` route and `segmentEditorService.js` callers continue to work unchanged — they call `advanceChapterStatus` from pipelineService.js which now delegates internally
