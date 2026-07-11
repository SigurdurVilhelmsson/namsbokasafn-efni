import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, existsSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const REPO = path.resolve(import.meta.dirname, '..', '..');
const SCRIPT = path.join(REPO, 'scripts', 'backup-db.sh');
const hasRclone = (() => { try { execFileSync('rclone', ['version']); return true; } catch { return false; } })();

describe('backup-db.sh off-box upload', () => {
  it('skips upload and exits 0 when BACKUP_REMOTE is unset', () => {
    const work = mkdtempSync(path.join(tmpdir(), 'bkup-'));
    const db = path.join(work, 'sessions.db');
    execFileSync('sqlite3', [db, 'CREATE TABLE t(x); INSERT INTO t VALUES (1);']);
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
    execFileSync('sqlite3', [db, 'CREATE TABLE t(x); INSERT INTO t VALUES (1);']);
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
