// scripts/__tests__/backup-db-retention.test.mjs
// backup-db.sh runs the editorial retention before its copy (G1.15(b) spec §4.6; plan Task 8): no new backup holds
// what a step just removed, and a failed retention is logged without stopping the backup.
import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, chmodSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const REPO = path.resolve(import.meta.dirname, '..', '..');
const SCRIPT = path.join(REPO, 'scripts', 'backup-db.sh');
const freshMigratedDb = require(path.join(REPO, 'server', '__tests__', 'helpers', 'freshMigratedDb'));
const { pinSeeds } = require(path.join(REPO, 'server', '__tests__', 'helpers', 'retentionPlant.cjs'));
const Database = createRequire(path.join(REPO, 'server', 'package.json'))('better-sqlite3');

/**
 * A migrated database on which every step can run in any year: its seeds pinned before the first date (a migration
 * stamps them with the OS clock), and the research retention recorded, which step 3 requires (final review I-2).
 */
function setup() {
  const dir = mkdtempSync(path.join(tmpdir(), 'backup-retention-'));
  const fresh = freshMigratedDb();
  pinSeeds(fresh.db);
  fresh.db
    .prepare(
      "INSERT INTO research_deletions (kind, interval_id, done_at_ms, verified) VALUES ('retention', NULL, ?, 1)"
    )
    .run(Date.UTC(2030, 0, 1, 1));
  fresh.db.close();
  return { dir, dbPath: fresh.path, backups: path.join(dir, 'backups') };
}
/** A stand-in for node that records how it was called and exits with STUB_EXIT. */
function stub(dir) {
  const p = path.join(dir, 'node-stub.sh');
  writeFileSync(p, '#!/bin/sh\nprintf "%s\\n" "$SESSIONS_DB_PATH" "$@" > "$STUB_OUT"\nexit "${STUB_EXIT:-0}"\n');
  chmodSync(p, 0o755);
  return p;
}
function backup({ dbPath, backups }, env) {
  const clean = { ...process.env };
  delete clean.BACKUP_REMOTE;
  return spawnSync('bash', [SCRIPT, backups], { env: { ...clean, DB_PATH_OVERRIDE: dbPath, ...env }, encoding: 'utf8' });
}
const backupFiles = (backups) => (existsSync(backups) ? readdirSync(backups).filter((f) => /^sessions\..*\.db$/.test(f)) : []);

describe('backup-db.sh and the editorial retention', () => {
  it('runs the retention before the checkpoint and the copy', () => {
    const src = readFileSync(SCRIPT, 'utf8');
    const retention = src.indexOf('editorial-retention.js');
    const checkpoint = src.indexOf('PRAGMA wal_checkpoint(TRUNCATE)');
    const copy = src.indexOf('cp "$DB_PATH" "$BACKUP_FILE"');
    expect(retention).toBeGreaterThan(0);
    expect(retention).toBeLessThan(checkpoint);
    expect(checkpoint).toBeLessThan(copy);
  });

  it('calls it with --write on the database it is about to copy', () => {
    const s = setup();
    const out = path.join(s.dir, 'stub.out');
    const r = backup(s, { RETENTION_NODE: stub(s.dir), STUB_OUT: out });
    expect(r.status).toBe(0);
    const [dbPath, script, flag] = readFileSync(out, 'utf8').trim().split('\n');
    expect(dbPath).toBe(s.dbPath);
    expect(script).toBe(path.join(REPO, 'server', 'scripts', 'editorial-retention.js'));
    expect(flag).toBe('--write');
    expect(backupFiles(s.backups)).toHaveLength(1);
  });

  it('a failed retention is logged and the backup is still taken', () => {
    const s = setup();
    const r = backup(s, { RETENTION_NODE: stub(s.dir), STUB_OUT: path.join(s.dir, 'stub.out'), STUB_EXIT: '1' });
    expect(r.status).toBe(0);
    expect(r.stderr).toMatch(/WARNING: editorial retention did not complete/);
    expect(backupFiles(s.backups)).toHaveLength(1);
  });

  it('with the real script on a migrated database, the backup is taken and nothing is logged as failed', () => {
    const s = setup();
    const r = backup(s, { RETENTION_NODE: process.execPath });
    expect(r.status).toBe(0);
    expect(r.stderr).not.toMatch(/editorial retention/);
    expect(backupFiles(s.backups)).toHaveLength(1);
  });

  // The script reads its own clock (Date.now()); a test pins it by preloading a fake one into the spawned node. Never a
  // clock override in the script or in backup-db.sh: on a script that deletes on dates that is an early-deletion lever.
  it('in 2031 too (a clock preloaded past every date), the real script logs nothing as failed (final review I-2)', () => {
    const s = setup();
    const clock = path.join(s.dir, 'clock-2031.cjs');
    writeFileSync(clock, 'Date.now = () => Date.UTC(2031, 0, 2);\n');
    const r = backup(s, { RETENTION_NODE: process.execPath, NODE_OPTIONS: `--require ${clock}` });
    expect(r.status).toBe(0);
    expect(r.stderr).not.toMatch(/editorial retention/);
    expect(backupFiles(s.backups)).toHaveLength(1);
    // The control: the clock reached the script, so all three steps ran and were recorded (an ignored preload would
    // leave nothing due, and the lines above would pass on a run that did nothing).
    const db = new Database(s.dbPath, { readonly: true });
    const kinds = db.prepare('SELECT kind FROM retention_runs ORDER BY kind').pluck().all();
    db.close();
    expect(kinds).toEqual(['consent', 'named', 'unnamed']);
  });
});
