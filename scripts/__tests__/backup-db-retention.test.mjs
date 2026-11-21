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

function setup() {
  const dir = mkdtempSync(path.join(tmpdir(), 'backup-retention-'));
  const fresh = freshMigratedDb();
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
});
