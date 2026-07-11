import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, existsSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const REPO = path.resolve(import.meta.dirname, '..', '..');
const SCRIPT = path.join(REPO, 'scripts', 'backup-db.sh');
const hasRclone = (() => { try { execFileSync('rclone', ['version']); return true; } catch { return false; } })();

// Build a real SQLite file via better-sqlite3 (a repo dependency) so the test does
// NOT depend on the `sqlite3` CLI being installed — the always-run case must be
// portable (backup-db.sh's own WAL checkpoint already tolerates a missing sqlite3 CLI).
function makeTestDb(dbPath) {
  const Database = require(path.join(REPO, 'server', 'node_modules', 'better-sqlite3'));
  const d = new Database(dbPath);
  d.exec('CREATE TABLE t(x); INSERT INTO t VALUES (1);');
  d.close();
}

// verify-db-backup.sh sanity-checks a few real production tables (segment_edits,
// terminology_translations, content_versions — see server/migrations 008/031/032).
// makeTestDb only builds the minimal `t` fixture the A1 upload tests need, so add
// these separately rather than changing that shared helper. Empty tables satisfy the
// script's "table exists" check — it only fails when the table is absent, not on
// zero rows.
function addRequiredTables(dbPath) {
  const Database = require(path.join(REPO, 'server', 'node_modules', 'better-sqlite3'));
  const d = new Database(dbPath);
  d.exec(`
    CREATE TABLE segment_edits (id INTEGER PRIMARY KEY);
    CREATE TABLE terminology_translations (id INTEGER PRIMARY KEY);
    CREATE TABLE content_versions (id INTEGER PRIMARY KEY);
  `);
  d.close();
}

describe('backup-db.sh off-box upload', () => {
  it('skips upload and exits 0 when BACKUP_REMOTE is unset', () => {
    const work = mkdtempSync(path.join(tmpdir(), 'bkup-'));
    const db = path.join(work, 'sessions.db');
    makeTestDb(db);
    const out = execFileSync('bash', [SCRIPT, path.join(work, 'backups')], {
      env: { ...process.env, DB_PATH_OVERRIDE: db, BACKUP_REMOTE: '' }, encoding: 'utf8',
    });
    expect(out).toMatch(/BACKUP_REMOTE not set.*skipping off-box/i);
    rmSync(work, { recursive: true, force: true });
  });

  it.skipIf(!hasRclone)('uploads an encrypted object and writes the heartbeat', () => {
    const work = mkdtempSync(path.join(tmpdir(), 'bkup-'));
    const db = path.join(work, 'sessions.db');
    const remoteDir = path.join(work, 'remote');
    const backups = path.join(work, 'backups');
    makeTestDb(db);
    // rclone config via env: a crypt remote wrapping a local remote.
    const env = {
      ...process.env, DB_PATH_OVERRIDE: db,
      RCLONE_CONFIG_LOCALBK_TYPE: 'local',
      RCLONE_CONFIG_SECRET_TYPE: 'crypt',
      RCLONE_CONFIG_SECRET_REMOTE: `localbk:${remoteDir}`,
      RCLONE_CONFIG_SECRET_PASSWORD: execFileSync('rclone', ['obscure', 'testpass'], { encoding: 'utf8' }).trim(),
      BACKUP_REMOTE: 'secret:',  // crypt remote; passphrase is in RCLONE_CONFIG_SECRET_PASSWORD, not a script env
    };
    execFileSync('bash', [SCRIPT, backups], { env, encoding: 'utf8' });
    expect(existsSync(path.join(backups, '.last-offbox-backup'))).toBe(true);
    // The crypt remote wrote an encrypted (name-obscured) object under remoteDir.
    const walk = (d) => readdirSync(d, { withFileTypes: true }).flatMap((e) =>
      e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);
    expect(walk(remoteDir).length).toBeGreaterThan(0);
    rmSync(work, { recursive: true, force: true });
  });
});

describe('verify-db-backup.sh', () => {
  const VERIFY = path.join(REPO, 'scripts', 'verify-db-backup.sh');

  it.skipIf(!hasRclone)('downloads, decrypts, and integrity-checks the latest off-box backup', () => {
    const work = mkdtempSync(path.join(tmpdir(), 'bkup-'));
    const db = path.join(work, 'sessions.db');
    const remoteDir = path.join(work, 'remote');
    const backups = path.join(work, 'backups');
    makeTestDb(db);
    addRequiredTables(db);
    const env = {
      ...process.env, DB_PATH_OVERRIDE: db,
      RCLONE_CONFIG_LOCALBK_TYPE: 'local',
      RCLONE_CONFIG_SECRET_TYPE: 'crypt',
      RCLONE_CONFIG_SECRET_REMOTE: `localbk:${remoteDir}`,
      RCLONE_CONFIG_SECRET_PASSWORD: execFileSync('rclone', ['obscure', 'testpass'], { encoding: 'utf8' }).trim(),
      BACKUP_REMOTE: 'secret:',
    };
    // Arrange: populate the crypt remote with one off-box backup (same recipe as A1).
    execFileSync('bash', [SCRIPT, backups], { env, encoding: 'utf8' });

    const out = execFileSync('bash', [VERIFY], { env, encoding: 'utf8' });
    expect(out).toMatch(/integrity_check: ok/i);
    expect(out).toMatch(/RESTORE VERIFY: PASS/);
    rmSync(work, { recursive: true, force: true });
  });

  // Regression guard for a real `set -e`+`pipefail` gotcha: when `grep` finds no
  // match (empty/unpopulated remote), a bare `VAR="$(pipeline)"` assignment aborts
  // the whole script immediately unless the pipeline ends in `|| true` — bypassing
  // the intended graceful "no off-box backup found" message entirely. This test
  // never runs backup-db.sh, so the remote stays empty.
  it.skipIf(!hasRclone)('fails loudly (not a raw crash) when the remote has no backup yet', () => {
    const work = mkdtempSync(path.join(tmpdir(), 'bkup-'));
    const remoteDir = path.join(work, 'remote'); // intentionally never populated
    const env = {
      ...process.env,
      RCLONE_CONFIG_LOCALBK_TYPE: 'local',
      RCLONE_CONFIG_SECRET_TYPE: 'crypt',
      RCLONE_CONFIG_SECRET_REMOTE: `localbk:${remoteDir}`,
      RCLONE_CONFIG_SECRET_PASSWORD: execFileSync('rclone', ['obscure', 'testpass'], { encoding: 'utf8' }).trim(),
      BACKUP_REMOTE: 'secret:',
    };
    let error;
    try {
      execFileSync('bash', [VERIFY], { env, encoding: 'utf8' });
    } catch (e) {
      error = e;
    }
    expect(error).toBeDefined();
    expect(error.status).not.toBe(0);
    expect(error.stdout).toMatch(/RESTORE VERIFY: FAIL \(no off-box backup found\)/);
    rmSync(work, { recursive: true, force: true });
  });

  it.skipIf(!hasRclone)('fails loudly when a required table is absent from the restored backup', () => {
    const work = mkdtempSync(path.join(tmpdir(), 'bkup-'));
    const db = path.join(work, 'sessions.db');
    const remoteDir = path.join(work, 'remote');
    const backups = path.join(work, 'backups');
    makeTestDb(db); // deliberately WITHOUT addRequiredTables — only table `t` exists
    const env = {
      ...process.env, DB_PATH_OVERRIDE: db,
      RCLONE_CONFIG_LOCALBK_TYPE: 'local',
      RCLONE_CONFIG_SECRET_TYPE: 'crypt',
      RCLONE_CONFIG_SECRET_REMOTE: `localbk:${remoteDir}`,
      RCLONE_CONFIG_SECRET_PASSWORD: execFileSync('rclone', ['obscure', 'testpass'], { encoding: 'utf8' }).trim(),
      BACKUP_REMOTE: 'secret:',
    };
    execFileSync('bash', [SCRIPT, backups], { env, encoding: 'utf8' });

    let error;
    try {
      execFileSync('bash', [VERIFY], { env, encoding: 'utf8' });
    } catch (e) {
      error = e;
    }
    expect(error).toBeDefined();
    expect(error.status).not.toBe(0);
    expect(error.stdout).toMatch(/RESTORE VERIFY: FAIL \(segment_edits absent\)/);
    rmSync(work, { recursive: true, force: true });
  });
});
