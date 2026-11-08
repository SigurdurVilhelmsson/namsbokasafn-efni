/**
 * T19 — the editorial backup tier never picks up the research file (G1.1 + G1.2 spec §5.17, §8; PR4 Task 15,
 * decision 38). No script changes: these pin today's behaviour, behaviour first and the patterns second.
 *
 * Every backup-db.sh run passes a temp backups directory as its argument: with none, it writes a copy and
 * .last-offbox-backup into the real pipeline-output/backups/ and prunes there. Each case records that directory's
 * listing before and asserts it unchanged after.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { makeFakeBins } from './helpers/fakeBins.mjs';

const require = createRequire(import.meta.url);
const REPO = path.resolve(import.meta.dirname, '..', '..');
const BACKUP_DB = path.join(REPO, 'scripts', 'backup-db.sh');
const VERIFY_DB = path.join(REPO, 'scripts', 'verify-db-backup.sh');
const REAL_BACKUPS = path.join(REPO, 'pipeline-output', 'backups');
const realBackups = () => [
  existsSync(REAL_BACKUPS),
  existsSync(REAL_BACKUPS) ? readdirSync(REAL_BACKUPS).sort() : [],
];

const cleanup = [];
afterEach(() => {
  while (cleanup.length) rmSync(cleanup.pop(), { recursive: true, force: true });
});

function work() {
  const dir = mkdtempSync(path.join(tmpdir(), 'research-isolation-'));
  cleanup.push(dir);
  return dir;
}
// As backup-db.test.mjs: a tiny real database, built without the sqlite3 CLI.
function makeTestDb(dbPath) {
  const Database = require(path.join(REPO, 'server', 'node_modules', 'better-sqlite3'));
  const d = new Database(dbPath);
  d.exec('CREATE TABLE t(x); INSERT INTO t VALUES (1);');
  d.close();
}
function fakes(opts) {
  const fake = makeFakeBins(opts);
  cleanup.push(fake.root);
  return fake;
}

describe('T19: the editorial tier never picks up a research copy', () => {
  it("backup-db.sh's local prune never touches a research copy beside its own", () => {
    const before = realBackups();
    const dir = work();
    const db = path.join(dir, 'sessions.db');
    makeTestDb(db);
    const backups = path.join(dir, 'backups');
    mkdirSync(backups);
    const at = (f) => path.join(backups, f);
    const name = (i) => `sessions.2020-01-01-0000${String(i).padStart(2, '0')}.db`;
    const base = Date.UTC(2020, 0, 1) / 1000;
    const touch = (f, t, body = 'x') => {
      writeFileSync(at(f), body);
      utimesSync(at(f), t, t);
    };
    for (let i = 0; i <= 30; i++) touch(name(i), base + i * 60);
    const research = 'research.2020-01-01T000000Z.db';
    touch(research, base - 60, 'research bytes'); // the oldest of all
    touch(`${research}-wal`, base - 60, 'research wal bytes');

    const r = spawnSync('bash', [BACKUP_DB, backups], {
      env: { ...process.env, DB_PATH_OVERRIDE: db, BACKUP_REMOTE: '' },
      encoding: 'utf8',
    });
    expect(r.status, r.stdout + r.stderr).toBe(0);
    expect(readFileSync(at(research), 'utf8')).toBe('research bytes');
    expect(readFileSync(at(`${research}-wal`), 'utf8')).toBe('research wal bytes');
    // Positive control: the prune ran, and took the two oldest sessions copies.
    expect(existsSync(at(name(0)))).toBe(false);
    expect(existsSync(at(name(1)))).toBe(false);
    expect(existsSync(at(name(2)))).toBe(true);
    expect(realBackups()).toEqual(before);
  });

  it("backup-db.sh's remote prune deletes only sessions.* objects", () => {
    const before = realBackups();
    const dir = work();
    const db = path.join(dir, 'sessions.db');
    makeTestDb(db);
    const backups = path.join(dir, 'backups');
    const fake = fakes();
    for (const n of [
      'sessions.2020-01-01-000000.db',
      'sessions.2020-01-02-000000.db',
      'research.2099-01-01T000000Z.db',
    ]) {
      writeFileSync(path.join(fake.remoteDir, n), 'x');
    }
    const r = spawnSync('bash', [BACKUP_DB, backups], {
      env: {
        ...process.env,
        ...fake.env(),
        PATH: `${fake.binDir}:${process.env.PATH}`,
        DB_PATH_OVERRIDE: db,
        BACKUP_REMOTE: 'secret:',
        BACKUP_REMOTE_KEEP: '1',
      },
      encoding: 'utf8',
    });
    expect(r.status, r.stdout + r.stderr).toBe(0);
    expect(existsSync(path.join(backups, '.last-offbox-backup'))).toBe(true);
    expect(
      fake
        .calls()
        .filter((l) => l.startsWith('deletefile'))
        .sort()
    ).toEqual([
      'deletefile secret:sessions.2020-01-01-000000.db',
      'deletefile secret:sessions.2020-01-02-000000.db',
    ]);
    expect(existsSync(path.join(fake.remoteDir, 'research.2099-01-01T000000Z.db'))).toBe(true);
    expect(realBackups()).toEqual(before);
  });

  it('verify-db-backup.sh never restores a research object', () => {
    const fake = fakes({ sqlite3: true });
    const env = {
      ...process.env,
      ...fake.env(),
      PATH: `${fake.binDir}:${process.env.PATH}`,
      BACKUP_REMOTE: 'secret:',
    };
    // The red arm: a remote holding only a research object.
    writeFileSync(path.join(fake.remoteDir, 'research.2099-01-01T000000Z.db'), 'x');
    const r = spawnSync('bash', [VERIFY_DB], { env, encoding: 'utf8' });
    expect(r.status).toBe(1);
    expect(r.stdout).toMatch(/RESTORE VERIFY: FAIL \(no off-box backup found\)/);
    expect(fake.calls().filter((l) => l.startsWith('copyto'))).toEqual([]);

    // Control, in the same case: with a sessions object added, the same script restores it and passes.
    writeFileSync(path.join(fake.remoteDir, 'sessions.2020-01-02-000000.db'), 'x');
    const ok = spawnSync('bash', [VERIFY_DB], { env, encoding: 'utf8' });
    expect(ok.stdout).toMatch(/RESTORE VERIFY: PASS/);
    const copies = fake.calls().filter((l) => l.startsWith('copyto'));
    expect(copies).toHaveLength(1);
    expect(copies[0]).toMatch(/^copyto secret:sessions\.2020-01-02-000000\.db /);
  });

  it("the patterns themselves (spec §5.17's citations), as a second line behind the behaviour above", () => {
    const backupDb = readFileSync(BACKUP_DB, 'utf8');
    const verifyDb = readFileSync(VERIFY_DB, 'utf8');
    for (const s of [
      'pipeline-output/sessions.db',
      'sessions.${TIMESTAMP}.db',
      '"$BACKUP_DIR"/sessions.*.db',
      'sessions.*.db-shm',
      'sessions.*.db-wal',
      "grep '^sessions\\.'",
    ]) {
      expect(backupDb, s).toContain(s);
    }
    expect(verifyDb).toContain("grep '^sessions\\.'");
    expect(backupDb).not.toMatch(/research/);
    expect(verifyDb).not.toMatch(/research/);
    // Control: the same pattern, read the same way, does fire on the research scripts. (research-backup.sh never
    // spells a copy's name: the names live in its Node part, decision 22.)
    for (const f of ['research-backup.sh', 'verify-research-backup.sh']) {
      expect(readFileSync(path.join(REPO, 'scripts', f), 'utf8')).toMatch(/research/);
    }
  });
});
