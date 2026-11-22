// server/__tests__/editorialRetentionCli.test.js
/**
 * editorial-retention.js: compaction, verification, the run record and the command line (G1.15(b) spec §4.4; plan
 * Task 7).
 *
 * A step is recorded in retention_runs only when it changed what it should, the file was compacted (checkpoint,
 * VACUUM, checkpoint), the structural check passes, the free-page count is 0, the WAL is 0 bytes, and no refusal
 * stands ([USER], 2026-11-21: recording a step with a refusal would hide the refusal from the health check). The
 * database here is a migrated file in WAL mode, as production's is, and the planted names are absent from users, so
 * these tests can do what production cannot: scan the file's bytes for them.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { createRequire } from 'module';
import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
const require = createRequire(import.meta.url);
const Database = require('better-sqlite3');
const freshMigratedDb = require('./helpers/freshMigratedDb');
const { plantAll, insert, pinSeeds } = require('./helpers/retentionPlant.cjs');
const { NAMED_EDITING_RECORDS, effectiveMs } = require('../lib/retentionDates');
const { planStep } = require('../lib/editorialRetention');
const { runEditorialRetention } = require('../scripts/editorial-retention');
const researchPurge = require('../scripts/lib/researchPurge');

const SCRIPT = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'scripts',
  'editorial-retention.js'
);
const AT = effectiveMs(NAMED_EDITING_RECORDS);

let dbPath;
let names;
beforeEach(() => {
  const fresh = freshMigratedDb();
  fresh.db.pragma('journal_mode = WAL');
  pinSeeds(fresh.db);
  names = plantAll(fresh.db).names;
  fresh.db.close();
  dbPath = fresh.path;
});

const wal = () => `${dbPath}-wal`;
const bytes = () =>
  Buffer.concat([
    fs.readFileSync(dbPath),
    fs.existsSync(wal()) ? fs.readFileSync(wal()) : Buffer.alloc(0),
  ]);
const sha = () => crypto.createHash('sha256').update(bytes()).digest('hex');
const held = () => {
  const b = bytes();
  return names.filter((n) => b.includes(Buffer.from(n, 'utf8')));
};
const run = (over = {}) =>
  runEditorialRetention({ dbPath, write: true, nowMs: AT, busyTimeoutMs: 200, ...over });
function withDb(fn) {
  const db = new Database(dbPath);
  try {
    return fn(db);
  } finally {
    db.close();
  }
}
const runs = () =>
  withDb((db) => db.prepare('SELECT kind, rows_changed FROM retention_runs').all());
const stepOf = (report, kind) => report.steps.find((s) => s.kind === kind);

describe('editorial-retention.js: compaction, verification and the run record', () => {
  it('a write run strips, compacts, verifies and records named, and no planted name is left in the file or the WAL', () => {
    expect(held().length).toBeGreaterThan(0); // control: the byte scan sees the planted names before the run
    const report = run();
    expect(stepOf(report, 'named')).toMatchObject({
      due: true,
      compact: 'ok',
      verified: true,
      recorded: true,
    });
    expect(report.ok).toBe(true);
    expect(runs()).toEqual([{ kind: 'named', rows_changed: expect.any(Number) }]);
    expect(runs()[0].rows_changed).toBeGreaterThan(30);
    expect(held()).toEqual([]);
  });

  it('the report names no one', () => {
    const report = run();
    const text = JSON.stringify(report);
    expect(names.filter((n) => text.includes(n))).toEqual([]);
  });

  it('a second run finds named recorded and changes nothing', () => {
    run();
    const after = withDb((db) => db.prepare('SELECT * FROM segment_edits').all());
    const report = run();
    expect(stepOf(report, 'named')).toEqual({ kind: 'named', due: false });
    expect(withDb((db) => db.prepare('SELECT * FROM segment_edits').all())).toEqual(after);
    expect(runs()).toHaveLength(1);
  });

  it('before 2029 nothing is due: the run writes nothing and is ok', () => {
    const before = fs.readFileSync(dbPath);
    const report = run({ nowMs: AT - 1 });
    expect(report.ok).toBe(true);
    expect(report.steps.every((s) => s.due === false)).toBe(true);
    expect(fs.readFileSync(dbPath).equals(before)).toBe(true);
  });

  it('a step with a refusal is applied but not recorded, and the run is not ok', () => {
    withDb((db) =>
      insert(db, 'feedback', {
        type: 'bug',
        message: 'm',
        user_name: 'Late Writer',
        created_at: '2029-02-01 09:00:00',
      })
    );
    const report = run();
    expect(stepOf(report, 'named')).toMatchObject({ verified: true, recorded: false, ok: false });
    expect(stepOf(report, 'named').refusals).toContainEqual({
      reason: 'later-records',
      table: 'feedback',
      rows: 1,
    });
    expect(report.ok).toBe(false);
    expect(runs()).toEqual([]);
    expect(held()).toEqual([]); // the covered names were still stripped and compacted away
  });

  it('a failed compaction leaves the step applied, unrecorded and still due', () => {
    const report = run({
      steps: { ...researchPurge, compact: () => ({ ok: false, step: 'vacuum' }) },
    });
    expect(stepOf(report, 'named')).toMatchObject({
      compact: 'vacuum',
      verified: false,
      recorded: false,
      ok: false,
    });
    expect(runs()).toEqual([]);
    expect(withDb((db) => planStep(db, 'named', AT).due)).toBe(true);
  });

  it('a compaction that reports ok but did nothing fails the file check: the WAL still holds the step', () => {
    const report = run({ steps: { ...researchPurge, compact: () => ({ ok: true }) } });
    expect(stepOf(report, 'named')).toMatchObject({
      compact: 'ok',
      verified: false,
      recorded: false,
      ok: false,
    });
    expect(runs()).toEqual([]);
  });

  // Production's file had 24 free pages on 2026-11-21. VACUUM is what brings them to 0, and the free-page check is
  // what proves it ran.
  it('a file with free pages before the run has none after it, and the step is recorded', () => {
    withDb((db) => {
      db.exec(
        'CREATE TABLE junk (b BLOB); INSERT INTO junk SELECT randomblob(4000) FROM (SELECT 1 UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4 UNION ALL SELECT 5 UNION ALL SELECT 6 UNION ALL SELECT 7 UNION ALL SELECT 8); DROP TABLE junk;'
      );
      db.pragma('wal_checkpoint(TRUNCATE)');
      expect(db.pragma('freelist_count', { simple: true })).toBeGreaterThan(0); // control
    });
    const report = run();
    expect(stepOf(report, 'named')).toMatchObject({ verified: true, recorded: true });
    expect(withDb((db) => db.pragma('freelist_count', { simple: true }))).toBe(0);
  });

  // The structural check reads names, which production cannot byte-scan for, so the step's writes zero what they free
  // (secure_delete) as well as VACUUM rebuilding the file: either alone leaves no planted name in the file.
  it('with the VACUUM skipped, the secure delete alone leaves no planted name in the file or the WAL', () => {
    const checkpointsOnly = (db) =>
      researchPurge.checkpointBusy(db) || researchPurge.checkpointBusy(db)
        ? { ok: false, step: 'checkpoint-1' }
        : { ok: true };
    run({ steps: { ...researchPurge, compact: checkpointsOnly } });
    expect(held()).toEqual([]);
  });

  it('a covered name written between the step and its verification leaves the step unrecorded', () => {
    const compactThenWrite = (db) => {
      db.prepare(
        "UPDATE segment_discussions SET user_id = 'Ghost Writer' WHERE user_id LIKE 'fjarlægt-%'"
      ).run();
      return researchPurge.compact(db);
    };
    const report = run({ steps: { ...researchPurge, compact: compactThenWrite } });
    expect(stepOf(report, 'named')).toMatchObject({
      compact: 'ok',
      verified: false,
      recorded: false,
    });
    expect(runs()).toEqual([]);
  });

  it('a busy preflight checkpoint writes nothing', () => {
    const before = withDb((db) => db.prepare('SELECT * FROM segment_edits').all());
    const report = run({ steps: { ...researchPurge, checkpointBusy: () => true } });
    expect(stepOf(report, 'named')).toMatchObject({ ok: false, failed: 'checkpoint-preflight' });
    expect(withDb((db) => db.prepare('SELECT * FROM segment_edits').all())).toEqual(before);
    expect(runs()).toEqual([]);
  });

  it('the dry run reports what is due and writes nothing', () => {
    const before = sha();
    const report = run({ write: false });
    expect(stepOf(report, 'named')).toMatchObject({ due: true });
    expect(stepOf(report, 'named').counts.segment_edits).toBe(1);
    expect(report.ok).toBe(true);
    expect(sha()).toBe(before);
  });
});

describe('editorial-retention.js: the command line', () => {
  const cli = (args) =>
    spawnSync(process.execPath, [SCRIPT, ...args], {
      env: { ...process.env, SESSIONS_DB_PATH: dbPath },
      encoding: 'utf8',
    });

  it('refuses an unknown argument with exit 2 and writes nothing', () => {
    const before = sha();
    const r = cli(['--write', '--date', '2020-01-01']);
    expect(r.status).toBe(2);
    expect(r.stdout).toBe('');
    expect(r.stderr).toMatch(/usage: editorial-retention\.js \[--write\]/);
    expect(sha()).toBe(before);
  });

  // main reads the real clock and the real database path. Before 2029 nothing is due, so the write run exits 0; after
  // it, this temp file's planted rows are due and the run strips them, which exits 0 or 1 by what it found.
  it('a write run on the real clock prints a report and exits with its verdict', () => {
    const r = cli(['--write']);
    const report = JSON.parse(r.stdout);
    expect(report).toMatchObject({ script: 'editorial-retention', write: true });
    expect(report.steps.map((s) => s.kind)).toEqual(['named', 'unnamed', 'consent']);
    expect(r.status).toBe(report.ok ? 0 : 1);
    if (Date.now() < AT) expect(report.steps.map((s) => s.due)).toEqual([false, false, false]);
  });
});
