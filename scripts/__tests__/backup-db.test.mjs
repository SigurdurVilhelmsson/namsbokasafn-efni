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
