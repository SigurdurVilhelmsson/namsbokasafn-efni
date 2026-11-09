// server/__tests__/researchWithdrawal.test.js — research-withdrawal.js (G1.1 + G1.2 spec §5.15, §5.1, §5.16; T9's
// script part; PR4 Task 6, decisions 4–10 and 13)
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { createRequire } from 'module';
import { spawnSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
const require = createRequire(import.meta.url);

// Env BEFORE any server require: every research-side file then derives into this temp directory, never
// pipeline-output/. JWT_SECRET: the flag snapshot loads auth.js, which throws at load without one.
const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'research-withdrawal-'));
process.env.SESSIONS_DB_PATH = path.join(tmpRoot, 'sessions.db');
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-research-withdrawal';

const Database = require('better-sqlite3');
const { runAllMigrations } = require('../services/migrationRunner');
const { resolveResearchDbPath, deriveResearchPath } = require('../lib/researchDbPath');
const { researchFilesFor } = require('../lib/researchFiles');
const researchDb = require('../services/researchDb');
const researchLog = require('../services/researchLog');
const researchConsent = require('../services/researchConsent');
const researchConsentText = require('../lib/researchConsentText');
const serverCommit = require('../lib/serverCommit');
const researchPurge = require('../scripts/lib/researchPurge');
const { dueIntervals, runWithdrawal } = require('../scripts/research-withdrawal');
const freshMigratedDb = require('./helpers/freshMigratedDb');
const {
  APPROVED,
  makeUser,
  consent,
  saveEvent,
  readResearch,
  losses,
} = require('./helpers/researchFixture.cjs');

const SCRIPT_PATH = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'scripts',
  'research-withdrawal.js'
);
const { researchPath, editorialPath } = resolveResearchDbPath();
const files = researchFilesFor(researchPath);
const byId = (a, b) => a - b; // interval ids are numbers: [9, 11].sort() is [11, 9]
const uid = {};
let A; // p-wd's interval
let K; // p-keep's interval
let R; // p-re's first interval, withdrawn in beforeEach
let B; // p-re's second interval

const run = (write, over = {}) =>
  runWithdrawal({ researchPath, sessionsPath: editorialPath, write, busyTimeoutMs: 100, ...over });

function bytes() {
  const parts = [fs.readFileSync(researchPath)];
  if (fs.existsSync(files.walPath)) parts.push(fs.readFileSync(files.walPath));
  return Buffer.concat(parts);
}
const holds = (s) => bytes().includes(Buffer.from(s, 'ascii'));

function withResearch(fn) {
  const db = readResearch();
  try {
    return fn(db);
  } finally {
    db.close();
  }
}
function withResearchWrite(fn) {
  const db = new Database(researchPath, { timeout: 1000 });
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
    db
      .prepare('SELECT id, content_json FROM research_events WHERE editor_key = ? ORDER BY id')
      .all(key)
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
const keyRowOf = (i) =>
  withResearch((db) => db.prepare('SELECT * FROM editor_keys WHERE interval_id = ?').get(i));
const researchRows = () =>
  withResearch((db) => ({
    keys: db.prepare('SELECT * FROM editor_keys ORDER BY interval_id').all(),
    events: db.prepare('SELECT * FROM research_events ORDER BY id').all(),
    items: db.prepare('SELECT * FROM research_event_items ORDER BY event_id, ordinal').all(),
  }));
const sessions = () => researchConsent.getSessionsDb();
const deletions = () =>
  sessions().prepare('SELECT * FROM research_deletions ORDER BY interval_id, rowid').all();
const doneAt = (id) =>
  sessions().prepare('SELECT deletion_done_at_ms FROM research_consent WHERE id = ?').get(id)
    .deletion_done_at_ms;
const withdrawUser = (p) => researchConsent.withdraw({ userId: uid[p], nowMs: Date.now() });

let actionSeq = 0;
function recordEvent(actor, text) {
  const r = researchLog.record(
    saveEvent({
      actorProviderId: actor,
      content: { text, note: null, category: null },
      clientActionId: `wd-act-${++actionSeq}`,
    })
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
  researchDb.openAtBoot(); // no consent yet, so the file is created
  researchConsentText._setTestApprovedTexts(APPROVED);
  serverCommit._setTestServerCommit({
    serverCommit: 'c'.repeat(40),
    commitSource: 'deploy-file',
    codeDirty: 0,
  });
  for (const p of ['p-wd', 'p-keep', 'p-re']) uid[p] = makeUser(p);
});

afterAll(() => {
  researchDb._reset();
  researchConsentText._setTestApprovedTexts(null);
  serverCommit._setTestServerCommit(null);
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

beforeEach(() => {
  // A clean slate: no consent, loss or deletion row, no research row, and no deleted bytes left from an
  // earlier case (so a "sentinel present" control cannot be satisfied by leftovers).
  sessions().exec(
    'DELETE FROM research_consent; DELETE FROM research_capture_losses; DELETE FROM research_deletions;'
  );
  withResearchWrite((db) => {
    db.exec(
      'DELETE FROM research_event_items; DELETE FROM research_events; DELETE FROM editor_keys;'
    );
    db.exec('VACUUM');
    db.pragma('wal_checkpoint(TRUNCATE)');
  });
  fs.rmSync(files.exportsDir, { recursive: true, force: true });
  fs.rmSync(files.servedVersionExportsDir, { recursive: true, force: true });

  A = consent(uid['p-wd']);
  for (const n of [1, 2, 3]) recordEvent('p-wd', `SENTINEL-WD-${n}`);
  lossFor(A, 'l-1');
  lossFor(A, 'l-2');

  K = consent(uid['p-keep']);
  for (const n of [1, 2]) recordEvent('p-keep', `SENTINEL-KEEP-${n}`);
  lossFor(K, 'k-1');

  R = consent(uid['p-re']);
  recordEvent('p-re', 'SENTINEL-OLD');
  lossFor(R, 'r-1');
  expect(withdrawUser('p-re')).toEqual({ withdrawn: true, intervalId: R });
  B = consent(uid['p-re']);
  recordEvent('p-re', 'SENTINEL-NEW');
  lossFor(B, 'b-1');

  fs.mkdirSync(files.exportsDir, { recursive: true });
  fs.writeFileSync(path.join(files.exportsDir, 'x.jsonl'), '{"x":1}\n');
  fs.mkdirSync(files.servedVersionExportsDir, { recursive: true });
  fs.writeFileSync(path.join(files.servedVersionExportsDir, 'y.jsonl'), '{"y":1}\n');
});

describe('research-withdrawal.js', () => {
  it('nothing due changes nothing and exits 0 (T9)', () => {
    sessions().prepare('UPDATE research_consent SET deletion_done_at_ms = 1 WHERE id = ?').run(R);
    const keyR = keyOf(R);
    withResearchWrite((db) => {
      db.prepare('DELETE FROM research_events WHERE editor_key = ?').run(keyR); // items cascade
      db.prepare('DELETE FROM editor_keys WHERE editor_key = ?').run(keyR); // only then the key
    });

    expect(run(true)).toEqual({ script: 'research-withdrawal', write: true, due: [], ok: true });
    expect(deletions()).toEqual([]);
    expect(fs.existsSync(path.join(files.exportsDir, 'x.jsonl'))).toBe(true);
    expect(holds('SENTINEL-KEEP-1')).toBe(true); // control
  });

  it('a dry run lists what is due and changes nothing', () => {
    withdrawUser('p-wd');
    const snapshot = () => ({
      research: researchRows(),
      losses: losses(),
      deletions: deletions(),
      x: fs.readFileSync(path.join(files.exportsDir, 'x.jsonl'), 'utf8'),
      y: fs.readFileSync(path.join(files.servedVersionExportsDir, 'y.jsonl'), 'utf8'),
    });
    const before = snapshot();

    const report = run(false);
    expect(report.due).toEqual([A, R].sort(byId));
    expect(report.ok).toBe(true);
    expect(snapshot()).toEqual(before);
  });

  it("T9: a write run deletes the interval's events, items, loss rows and key, compacts, verifies and records", () => {
    withdrawUser('p-wd');
    const keyA = keyOf(A);
    const keyR = keyOf(R);
    const eventIdsA = eventsOf(keyA).map((e) => e.id);
    // The control: present before the run.
    expect(holds('SENTINEL-WD-1')).toBe(true);
    expect(holds(keyA)).toBe(true);
    const keyK = keyOf(K);
    const keyB = keyOf(B);
    const kept = () => ({
      eventsK: eventsOf(keyK),
      eventsB: eventsOf(keyB),
      itemsK: itemsOf(keyK),
      itemsB: itemsOf(keyB),
      losses: losses().filter((l) => [K, B].includes(l.interval_id)),
      keyB: keyRowOf(B),
    });
    const keptBefore = kept();
    expect(keptBefore.losses.map((l) => l.client_action_id).sort()).toEqual(['b-1', 'k-1']);
    const yBefore = fs.readFileSync(path.join(files.servedVersionExportsDir, 'y.jsonl'));

    const report = run(true);
    expect(report).toEqual({
      script: 'research-withdrawal',
      write: true,
      due: [A, R].sort(byId),
      compact: 'ok',
      scan: 'clean',
      exports: 'emptied',
      verified: [A, R].sort(byId),
      ok: true,
    });

    expect(eventsOf(keyA)).toEqual([]);
    withResearch((db) => {
      const ids = db.prepare('SELECT event_id FROM research_event_items').pluck().all();
      expect(ids.filter((id) => eventIdsA.includes(id))).toEqual([]);
    });
    expect(keyRowOf(A)).toBeUndefined();
    expect(keyRowOf(R)).toBeUndefined();
    expect(losses().filter((l) => [A, R].includes(l.interval_id))).toEqual([]);
    for (const s of ['SENTINEL-WD', 'SENTINEL-OLD', keyA, keyR]) expect(holds(s), s).toBe(false);
    const [lo, hi] = [A, R].sort(byId);
    expect(deletions()).toEqual([
      { kind: 'withdrawal', interval_id: lo, done_at_ms: expect.any(Number), verified: 1 },
      { kind: 'withdrawal', interval_id: hi, done_at_ms: expect.any(Number), verified: 1 },
    ]);
    expect(typeof doneAt(A)).toBe('number');
    expect(typeof doneAt(R)).toBe('number');
    expect(doneAt(K)).toBeNull();
    expect(doneAt(B)).toBeNull();
    expect(fs.readdirSync(files.exportsDir)).toEqual([]);
    expect(fs.readFileSync(path.join(files.servedVersionExportsDir, 'y.jsonl'))).toEqual(yBefore);

    // Positive controls: the other editor and the re-consented interval are untouched, by value.
    expect(kept()).toEqual(keptBefore);
    expect(holds('SENTINEL-NEW')).toBe(true);
  });

  it('a second run has nothing due', () => {
    withdrawUser('p-wd');
    expect(run(true).ok).toBe(true);
    const recorded = deletions();
    expect(run(true).due).toEqual([]);
    expect(deletions()).toEqual(recorded);
  });

  it('a restored key row makes a done interval due again (spec §5.15 "A restore")', () => {
    withdrawUser('p-wd');
    const keyA = keyOf(A);
    const first = Date.now();
    expect(run(true, { nowMs: first }).ok).toBe(true);
    expect(doneAt(A)).toBe(first);

    withResearchWrite((db) =>
      db.prepare('INSERT INTO editor_keys (interval_id, editor_key) VALUES (?, ?)').run(A, keyA)
    );
    expect(run(false).due).toContain(A);
    expect(run(true, { nowMs: first + 5000 }).ok).toBe(true);
    expect(doneAt(A)).toBe(first); // set once
    expect(deletions().filter((d) => d.interval_id === A)).toHaveLength(2);
  });

  it(
    'T9: a reader holding the file keeps the interval due and deletes nothing',
    { timeout: 30_000 },
    () => {
      withdrawUser('p-keep');
      const keyK = keyOf(K);
      const reader = new Database(researchPath, { readonly: true });
      try {
        reader.exec('BEGIN');
        reader.prepare('SELECT * FROM research_events').all();

        expect(run(true)).toEqual({
          script: 'research-withdrawal',
          write: true,
          due: [K, R].sort(byId),
          ok: false,
          failed: 'checkpoint-preflight',
        });
        expect(eventsOf(keyK)).toHaveLength(2);
        expect(itemsOf(keyK)).toHaveLength(2);
        expect(losses().filter((l) => l.interval_id === K)).toHaveLength(1);
        expect(keyRowOf(K)).toBeDefined();
        expect(doneAt(K)).toBeNull();
        expect(doneAt(R)).toBeNull();
        expect(deletions()).toEqual([]);

        reader.exec('COMMIT');
      } finally {
        reader.close();
      }
      const report = run(true);
      expect(report.ok).toBe(true);
      expect(report.verified).toEqual([K, R].sort(byId));
      expect(report.scan).toBe('clean'); // the scan held both keys
    }
  );

  it('a loss-row delete that fails stops the run before the key is touched (decision 6)', () => {
    withdrawUser('p-wd');
    const keyA = keyOf(A);
    const alter = (sql) => {
      const db = new Database(editorialPath, { timeout: 1000 });
      try {
        db.exec(sql);
      } finally {
        db.close();
      }
    };
    alter('ALTER TABLE research_capture_losses RENAME TO rcl_hidden');
    try {
      expect(() => run(true)).toThrow(/no such table/);
      expect(keyOf(A)).toBe(keyA);
      expect(eventsOf(keyA)).toHaveLength(3);
      expect(deletions()).toEqual([]);
    } finally {
      alter('ALTER TABLE rcl_hidden RENAME TO research_capture_losses');
    }
    // Control: the same run passes once the table is back, and the scan still held the key.
    const report = run(true);
    expect(report.ok).toBe(true);
    expect(report.scan).toBe('clean');
    expect(deletions().find((d) => d.interval_id === A).verified).toBe(1);
  });

  it('a compaction that fails after the delete leaves the interval due, and the next run verifies by compaction alone (decision 8)', () => {
    withdrawUser('p-keep');
    const failed = run(true, {
      steps: { ...researchPurge, compact: () => ({ ok: false, step: 'checkpoint-1' }) },
    });
    expect(failed.ok).toBe(false);
    expect(failed.compact).toBe('checkpoint-1');
    expect(failed.scan).toBe('not-run');
    expect(keyRowOf(K)).toBeUndefined(); // deleted
    expect(doneAt(K)).toBeNull();
    expect(deletions()).toEqual([]);

    const next = run(true);
    expect(next.scan).toBe('no-key');
    expect(next.ok).toBe(true);
    expect(deletions().find((d) => d.interval_id === K).verified).toBe(0);
  });

  it('an export that cannot be removed keeps the interval due (decision 10)', () => {
    const failed = run(true, {
      steps: {
        ...researchPurge,
        emptyExports: () => {
          throw new Error('EACCES');
        },
      },
    });
    expect(failed.ok).toBe(false);
    expect(failed.exports).toBe('failed');
    expect(deletions()).toEqual([]);
    expect(doneAt(R)).toBeNull();
    expect(run(true).ok).toBe(true);
  });

  it('the report carries no key and no count (spec §5.15; decision 13)', () => {
    withdrawUser('p-wd');
    const text = JSON.stringify(run(true));
    expect(/[0-9a-f]{32}/.test(text)).toBe(false);
    const numbers = (text.match(/\d+/g) || []).map(Number);
    expect(numbers.length).toBeGreaterThan(0);
    expect(numbers.every((n) => [A, R].includes(n))).toBe(true);
  });

  it('dueIntervals reads withdrawn starting rows only', () => {
    withdrawUser('p-wd');
    const research = readResearch();
    const editorial = new Database(editorialPath, { readonly: true });
    try {
      expect(dueIntervals(editorial, research)).toEqual([A, R].sort(byId));
    } finally {
      research.close();
      editorial.close();
    }
  });

  describe('the command line', () => {
    const cli = (args, env = { ...process.env, SESSIONS_DB_PATH: editorialPath }) =>
      spawnSync(process.execPath, [SCRIPT_PATH, ...args], { env, encoding: 'utf8' });

    it('a dry run prints one JSON report and exits 0', () => {
      const r = cli([]);
      expect(r.status).toBe(0);
      expect(JSON.parse(r.stdout).write).toBe(false);
    });

    it('refuses an unknown argument with exit 2, writing nothing', () => {
      for (const args of [['--force'], ['--write', 'x']]) {
        const r = cli(args);
        expect(r.status, args.join(' ')).toBe(2);
        expect(r.stdout).toBe('');
      }
    });

    it('exits 1 when the research file is absent, and does not create it (spec §5.1)', () => {
      const fresh = freshMigratedDb();
      fresh.db.close();
      const absent = deriveResearchPath(fresh.path);
      expect(fs.existsSync(absent)).toBe(false);
      const r = cli([], { ...process.env, SESSIONS_DB_PATH: fresh.path });
      expect(r.status).toBe(1);
      expect(r.stderr).toMatch(/SQLITE_CANTOPEN/);
      expect(fs.existsSync(absent)).toBe(false);
    });
  });
});
