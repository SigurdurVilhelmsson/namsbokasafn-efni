// server/__tests__/researchDeletion.test.js — the immediate deletion at withdrawal (G1.1 + G1.2 spec §5.15 "When
// they run", §5.16; T17's write-only surface; PR4 Task 8, decision 14)
import { describe, it, expect, vi, beforeAll, beforeEach, afterAll, afterEach } from 'vitest';
import { createRequire } from 'module';
import fs from 'fs';
import os from 'os';
import path from 'path';
const require = createRequire(import.meta.url);

// Env BEFORE any server require: the research file derives into this temp directory.
const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'research-deletion-'));
process.env.SESSIONS_DB_PATH = path.join(tmpRoot, 'sessions.db');
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-research-deletion';

const Database = require('better-sqlite3');
const { runAllMigrations } = require('../services/migrationRunner');
const { resolveResearchDbPath } = require('../lib/researchDbPath');
const researchDb = require('../services/researchDb');
const researchLog = require('../services/researchLog');
const researchConsent = require('../services/researchConsent');
const researchConsentText = require('../lib/researchConsentText');
const serverCommit = require('../lib/serverCommit');
const logger = require('../lib/logger');
const { deleteIntervalRowsNow } = require('../services/researchDeletion');
const {
  APPROVED,
  makeUser,
  consent,
  saveEvent,
  readResearch,
  losses,
} = require('./helpers/researchFixture.cjs');

const { researchPath, editorialPath } = resolveResearchDbPath();
const uid = {};
let A;
let B;

function withResearch(fn) {
  const db = readResearch();
  try {
    return fn(db);
  } finally {
    db.close();
  }
}
const keyOf = (i) =>
  withResearch(
    (db) =>
      db.prepare('SELECT editor_key FROM editor_keys WHERE interval_id = ?').get(i)?.editor_key ??
      null
  );
const eventsOf = (key) =>
  withResearch((db) =>
    db.prepare('SELECT * FROM research_events WHERE editor_key = ? ORDER BY id').all(key)
  );
const itemsOf = (key) =>
  withResearch((db) =>
    db
      .prepare(
        `SELECT * FROM research_event_items WHERE event_id IN
           (SELECT id FROM research_events WHERE editor_key = ?) ORDER BY event_id, ordinal`
      )
      .all(key)
  );

let actionSeq = 0;
function recordEvent(actor) {
  const r = researchLog.record(
    saveEvent({ actorProviderId: actor, clientActionId: `del-act-${++actionSeq}` })
  );
  expect(r.status).toBe('written');
}
function lossFor(intervalId, clientActionId) {
  expect(
    researchConsent.recordLoss({
      intervalId,
      book: 'efnafraedi-2e',
      chapter: 1,
      moduleId: 'm98001',
      eventType: 'edit-save',
      errorClass: 'busy',
      clientActionId,
      nowMs: Date.now(),
    })
  ).toBe(true);
}

beforeAll(() => {
  runAllMigrations();
  researchDb.openAtBoot();
  researchConsentText._setTestApprovedTexts(APPROVED);
  serverCommit._setTestServerCommit({
    serverCommit: 'c'.repeat(40),
    commitSource: 'deploy-file',
    codeDirty: 0,
  });
  for (const p of ['p-a', 'p-b']) uid[p] = makeUser(p);
});

beforeEach(() => {
  researchConsent
    .getSessionsDb()
    .exec('DELETE FROM research_consent; DELETE FROM research_capture_losses;');
  const w = new Database(researchPath, { timeout: 1000 });
  try {
    w.exec(
      'DELETE FROM research_event_items; DELETE FROM research_events; DELETE FROM editor_keys;'
    );
  } finally {
    w.close();
  }
  A = consent(uid['p-a']);
  recordEvent('p-a');
  recordEvent('p-a');
  lossFor(A, 'a-1');
  B = consent(uid['p-b']);
  recordEvent('p-b');
  lossFor(B, 'b-1');
});

afterEach(() => {
  vi.restoreAllMocks();
  researchDb._setTestPaths(null);
});

afterAll(() => {
  researchDb._reset();
  researchConsentText._setTestApprovedTexts(null);
  serverCommit._setTestServerCommit(null);
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

describe('researchDeletion.deleteIntervalRowsNow', () => {
  it("deletes the interval's events, items and loss rows, and leaves its key for the script (spec §5.15)", () => {
    const keyA = keyOf(A);
    const keyB = keyOf(B);
    expect(eventsOf(keyA)).toHaveLength(2);
    expect(itemsOf(keyA)).toHaveLength(2);
    const bBefore = {
      events: eventsOf(keyB),
      items: itemsOf(keyB),
      losses: losses().filter((l) => l.interval_id === B),
    };
    expect(bBefore.losses).toHaveLength(1);

    expect(deleteIntervalRowsNow(A)).toEqual({ research: 'deleted', losses: 'deleted' });
    expect(eventsOf(keyA)).toEqual([]);
    expect(itemsOf(keyA)).toEqual([]);
    expect(losses().filter((l) => l.interval_id === A)).toEqual([]);
    expect(keyOf(A)).toBe(keyA); // the key row stays for research-withdrawal.js
    // Control: the other interval is untouched, by value.
    expect({
      events: eventsOf(keyB),
      items: itemsOf(keyB),
      losses: losses().filter((l) => l.interval_id === B),
    }).toEqual(bBefore);
  });

  it('an interval with no key still loses its loss rows', () => {
    lossFor(999999, 'none-1');
    expect(deleteIntervalRowsNow(999999)).toEqual({ research: 'no-key', losses: 'deleted' });
    expect(losses().filter((l) => l.interval_id === 999999)).toEqual([]);
  });

  it('never throws: the research file missing, locked, or a bad id', () => {
    researchDb._setTestPaths({ researchPath: '/nonexistent/dir/r.db', editorialPath });
    try {
      expect(deleteIntervalRowsNow(A)).toEqual({ research: 'failed', losses: 'deleted' });
    } finally {
      researchDb._setTestPaths(null);
    }

    const holder = new Database(researchPath);
    try {
      holder.exec('BEGIN EXCLUSIVE');
      const t0 = Date.now();
      const r = deleteIntervalRowsNow(B);
      expect(r.research).toBe('failed');
      expect(Date.now() - t0).toBeLessThan(researchDb.BUSY_TIMEOUT_MS + 900);
      holder.exec('ROLLBACK');
    } finally {
      holder.close();
    }
    expect(eventsOf(keyOf(B))).toHaveLength(1);
    researchDb._reset(); // clear the busy cool-off the failure started

    expect(deleteIntervalRowsNow('x')).toEqual({ research: 'failed', losses: 'failed' });
    expect(deleteIntervalRowsNow(-1)).toEqual({ research: 'failed', losses: 'failed' });
  });

  it('logs an error code and nothing else', () => {
    const spy = vi.spyOn(logger, 'error');
    researchDb._setTestPaths({ researchPath: '/nonexistent/dir/r.db', editorialPath });
    try {
      deleteIntervalRowsNow(A);
    } finally {
      researchDb._setTestPaths(null);
    }
    expect(spy).toHaveBeenCalled();
    for (const call of spy.mock.calls) expect(Object.keys(call[0])).toEqual(['errorCode']);
  });

  it('is write-only to routes (spec §5.16)', () => {
    expect(Object.keys(require('../services/researchDeletion'))).toEqual(['deleteIntervalRowsNow']);
  });
});
