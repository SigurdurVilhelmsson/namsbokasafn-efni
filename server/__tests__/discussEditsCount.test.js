/**
 * C10-R4: the dashboard's `blockedIssues` stat must be a real count, not the
 * length of a `LIMIT ?` row list.
 *
 * `routes/status.js` derived `needsAttention.blockedIssues` from
 * `getDiscussEdits(10).length`, so the head editor's "til umræðu" tile
 * (`views/my-work.html:1522-1523`) saturated at 10 no matter how many segments
 * were actually blocked.
 *
 * Harness idiom: handler extracted from the router stack, invoked with fake
 * req/res (cf. statusChapterRoute.test.js). The dashboard handler wraps each
 * concern in its own try/catch, so the discuss-edits block is exercised
 * independently of the filesystem-scanning blocks.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

const work = mkdtempSync(join(tmpdir(), 'discuss-count-'));
process.env.SESSIONS_DB_PATH = join(work, 'sessions.db');
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';

const Database = require('better-sqlite3');
const service = require('../services/segmentEditorService');
const { createSegmentEditsSchema } = require('./helpers/segmentEditsSchema.cjs');

const DISCUSS_COUNT = 12; // deliberately > the route's old LIMIT of 10

let db;
let dashboardHandler;

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

  db = new Database(':memory:');
  db.pragma('journal_mode = WAL');
  createSegmentEditsSchema(db);
  service._setTestDb(db);

  const insert = db.prepare(
    `INSERT INTO segment_edits
       (book, chapter, module_id, segment_id, original_content, edited_content,
        editor_id, editor_username, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'discuss')`
  );
  for (let i = 0; i < DISCUSS_COUNT; i++) {
    insert.run(
      'efnafraedi-2e',
      1,
      'm00001',
      `m00001:para:fs-id${String(i).padStart(3, '0')}`,
      'original',
      'breytt',
      'editor-1',
      'editor1'
    );
  }

  const router = require('../routes/status');
  const layer = router.stack.find((l) => l.route && l.route.path === '/dashboard');
  dashboardHandler = layer.route.stack[layer.route.stack.length - 1].handle;
});

afterAll(() => {
  service._setTestDb(null);
  db.close();
  rmSync(work, { recursive: true, force: true });
});

describe('countDiscussEdits (C10-R4)', () => {
  it('returns the true total, not a page of rows', () => {
    expect(service.countDiscussEdits()).toBe(DISCUSS_COUNT);
  });

  it('is not capped the way the paged list is', () => {
    // The list is deliberately paged; the count must not inherit that cap.
    expect(service.getDiscussEdits(10)).toHaveLength(10);
    expect(service.countDiscussEdits()).toBeGreaterThan(service.getDiscussEdits(10).length);
  });

  it('counts only discuss-status rows', () => {
    db.prepare(
      `INSERT INTO segment_edits
         (book, chapter, module_id, segment_id, original_content, edited_content,
          editor_id, editor_username, status)
       VALUES ('efnafraedi-2e', 1, 'm00002', 'm00002:para:fs-id001', 'o', 'e',
               'editor-1', 'editor1', 'pending')`
    ).run();
    try {
      expect(service.countDiscussEdits()).toBe(DISCUSS_COUNT);
    } finally {
      db.prepare(`DELETE FROM segment_edits WHERE module_id = 'm00002'`).run();
    }
  });
});

describe('GET /api/status/dashboard blockedIssues (C10-R4)', () => {
  it('reports every blocked segment, not just the first page', async () => {
    const { body } = await invoke(dashboardHandler, { query: {}, params: {}, user: {} });
    expect(body.needsAttention.blockedIssues).toBe(DISCUSS_COUNT);
  });

  it('still caps the attention ITEMS list at 5 (display concern, unchanged)', async () => {
    const { body } = await invoke(dashboardHandler, { query: {}, params: {}, user: {} });
    const blocked = body.needsAttention.items.filter((i) => i.type === 'blocked');
    expect(blocked).toHaveLength(5);
  });
});
