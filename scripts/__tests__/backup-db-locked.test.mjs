// scripts/__tests__/backup-db-locked.test.mjs
// backup-db.sh uploads each copy, gzipped, to the locked Paris remote (G1.20 spec §4.2, §4.3, §4.7; plan Task 5).
// rclone is a fake on PATH that logs every call. Three things must hold: no upload carries a lock flag (the bucket
// sets locks), the count-based London prune never addresses the locked remote, and every "cannot tell" fails closed.
import { describe, it, expect, afterEach } from 'vitest';
import { spawnSync, execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, chmodSync, existsSync, rmSync, symlinkSync, readdirSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { gunzipSync } from 'node:zlib';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const REPO = path.resolve(import.meta.dirname, '..', '..');
const SCRIPT = path.join(REPO, 'scripts', 'backup-db.sh');
const freshMigratedDb = require(path.join(REPO, 'server', '__tests__', 'helpers', 'freshMigratedDb'));

const FAKE_RCLONE = `#!/usr/bin/env bash
printf '%s\\n' "$*" >> "$FAKE_LOG"
[ "\${FAKE_FAIL:-}" = "$1" ] && exit 1
case "$1" in
  version) echo "rclone v1.75.0" ;;
  lsjson)  cat "$FAKE_LSJSON" ;;
  lsf)     ls -1 "$FAKE_STORE"; [ -z "\${FAKE_LSF_EXTRA:-}" ] || cat "$FAKE_LSF_EXTRA" ;;
  copyto)  [ -n "\${FAKE_DROP:-}" ] || cp "$2" "$FAKE_STORE/\${3##*[:/]}" ;;
  deletefile) : ;;
esac
`;

const DAY = 86400000;
const sandboxes = [];
afterEach(() => {
  while (sandboxes.length) rmSync(sandboxes.pop(), { recursive: true, force: true });
});
/** One lsjson entry whose ModTime is daysAgo days before now. size 0 is a delete marker. */
const entry = (name, daysAgo, size = 100) => ({
  Path: name,
  Name: name,
  Size: size,
  ModTime: new Date(Date.now() - daysAgo * DAY).toISOString(),
  IsDir: false,
});
const recent = (n) => Array.from({ length: n }, (_, i) => entry(`sessions.r${i}.db.gz-v${i}`, 0.01 * (i + 1)));

/** A fresh sandbox: a migrated database (nothing due), a fake rclone, and the files it reads. */
function setup(listing = recent(1)) {
  const dir = mkdtempSync(path.join(tmpdir(), 'backup-locked-'));
  sandboxes.push(dir);
  const bin = path.join(dir, 'bin');
  const store = path.join(dir, 'store');
  mkdirSync(bin);
  mkdirSync(store);
  writeFileSync(path.join(bin, 'rclone'), FAKE_RCLONE);
  chmodSync(path.join(bin, 'rclone'), 0o755);
  const fresh = freshMigratedDb();
  const dbPath = path.join(dir, 'sessions.db');
  copyFileSync(fresh.path, dbPath);
  fresh.db.close();
  const lsjson = path.join(dir, 'lsjson.json');
  writeFileSync(lsjson, JSON.stringify(listing));
  writeFileSync(path.join(dir, 'rclone.conf'), '');
  return { dir, bin, store, dbPath, lsjson, log: path.join(dir, 'rclone.log'), n: 0 };
}
const logLines = (s) => (existsSync(s.log) ? readFileSync(s.log, 'utf8').split('\n').filter(Boolean) : []);

/** Run the script into a fresh backups directory (two runs in one second would collide on the copy name). */
function run(s, env = {}) {
  const backups = path.join(s.dir, `backups${s.n++}`);
  const clean = { ...process.env };
  for (const k of ['BACKUP_REMOTE', 'LOCKED_BACKUP_REMOTE', 'LOCKED_BACKUP_S3']) delete clean[k];
  const r = spawnSync('bash', [SCRIPT, backups], {
    env: {
      ...clean,
      PATH: `${s.bin}:${process.env.PATH}`,
      DB_PATH_OVERRIDE: s.dbPath,
      BACKUP_NODE: process.execPath,
      RETENTION_NODE: process.execPath,
      RCLONE_CONFIG: path.join(s.dir, 'rclone.conf'),
      FAKE_LOG: s.log,
      FAKE_LSJSON: s.lsjson,
      FAKE_STORE: s.store,
      ...env,
    },
    encoding: 'utf8',
  });
  return { ...r, backups };
}
const PARIS = { LOCKED_BACKUP_REMOTE: 'locked-secret:', LOCKED_BACKUP_S3: 'locked-s3:bkt/' };
const copytos = (s) => logLines(s).filter((l) => l.startsWith('copyto '));
const deletes = (s) => logLines(s).filter((l) => l.startsWith('deletefile '));

describe('backup-db.sh and the locked remote', () => {
  it('uploads a gzipped copy with no lock flags, writes the heartbeat and an ok status', () => {
    const s = setup();
    const r = run(s, PARIS);
    expect(r.status).toBe(0);
    const gz = readdirSync(s.store).filter((f) => /^sessions\..*\.db\.gz$/.test(f));
    expect(gz).toHaveLength(1);
    const bytes = gunzipSync(readFileSync(path.join(s.store, gz[0])));
    expect(bytes.subarray(0, 15).toString()).toBe('SQLite format 3');
    expect(copytos(s).join('\n')).not.toMatch(/object-lock/);
    expect(copytos(s)[0]).toContain('locked-secret:sessions.');
    expect(existsSync(path.join(r.backups, '.last-offbox-backup'))).toBe(true);
    const status = JSON.parse(readFileSync(path.join(r.backups, '.offbox-locked-status.json'), 'utf8'));
    expect(status.ok).toBe(true);
    expect(status.uploaded_seen).toBe(true);
  });

  it('pauses the locked upload while a retention step is due', () => {
    const s = setup();
    const wrap = path.join(s.dir, 'node-wrap.sh');
    writeFileSync(
      wrap,
      `#!/bin/sh\nfor a in "$@"; do if [ "$a" = retention-due ]; then echo "editorial-backup: retention due: named" >&2; exit 1; fi; done\nexec "${process.execPath}" "$@"\n`
    );
    chmodSync(wrap, 0o755);
    const r = run(s, { ...PARIS, BACKUP_NODE: wrap });
    expect(r.status).toBe(6);
    expect(r.stderr).toContain('PAUSED');
    expect(copytos(s)).toHaveLength(0);
    expect(existsSync(path.join(r.backups, '.last-offbox-backup'))).toBe(false);
    expect(readdirSync(r.backups).filter((f) => /^sessions\..*\.db$/.test(f))).toHaveLength(1);
  });

  it('refuses the upload at 8 copies in 24 hours', () => {
    const s = setup(recent(8));
    const r = run(s, PARIS);
    expect(r.status).toBe(7);
    expect(copytos(s)).toHaveLength(0);
  });

  it('uploads at 7 copies in 24 hours (control)', () => {
    const s = setup(recent(7));
    const r = run(s, PARIS);
    expect(r.status).toBe(0);
    expect(copytos(s)).toHaveLength(1);
  });

  it('refuses when the pre-upload listing fails', () => {
    const s = setup();
    const r = run(s, { ...PARIS, FAKE_FAIL: 'lsjson' });
    expect(r.status).toBe(7);
    expect(copytos(s)).toHaveLength(0);
  });

  it('deletes only versions older than 356 days, by versioned name', () => {
    const s = setup([...recent(1), entry('old-v2026', 356.5), entry('young', 355.5)]);
    const r = run(s, PARIS);
    expect(r.status).toBe(0);
    expect(deletes(s)).toEqual(['deletefile --s3-versions locked-s3:bkt/old-v2026']);
    expect(deletes(s).join('\n')).not.toContain('young');
  });

  it('an unseen upload makes the status not ok and exits 8, heartbeat still written', () => {
    const s = setup();
    const r = run(s, { ...PARIS, FAKE_DROP: '1' });
    expect(r.status).toBe(8);
    expect(existsSync(path.join(r.backups, '.last-offbox-backup'))).toBe(true);
    const status = JSON.parse(readFileSync(path.join(r.backups, '.offbox-locked-status.json'), 'utf8'));
    expect(status.ok).toBe(false);
    expect(status.uploaded_seen).toBe(false);
  });

  it('a failed locked upload exits 4 and writes no heartbeat', () => {
    const s = setup();
    const r = run(s, { ...PARIS, FAKE_FAIL: 'copyto' });
    expect(r.status).toBe(4);
    expect(existsSync(path.join(r.backups, '.last-offbox-backup'))).toBe(false);
  });

  describe('rejects a malformed or forbidden remote setup before anything is sent', () => {
    const cases = {
      'a locked remote not named locked*': { LOCKED_BACKUP_REMOTE: 'secret:', LOCKED_BACKUP_S3: 'locked-s3:bkt/' },
      'a locked remote without a trailing : or /': { LOCKED_BACKUP_REMOTE: 'locked-secret', LOCKED_BACKUP_S3: 'locked-s3:bkt/' },
      'a missing LOCKED_BACKUP_S3': { LOCKED_BACKUP_REMOTE: 'locked-secret:' },
      'a LOCKED_BACKUP_S3 without a trailing : or /': { LOCKED_BACKUP_REMOTE: 'locked-secret:', LOCKED_BACKUP_S3: 'locked-s3:bkt' },
      'BACKUP_REMOTE naming a locked remote': { ...PARIS, BACKUP_REMOTE: 'locked-other:' },
      'BACKUP_REMOTE equal to the locked remote': { ...PARIS, BACKUP_REMOTE: 'locked-secret:' },
      'BACKUP_REMOTE locked with no locked remote set': { BACKUP_REMOTE: 'locked-secret:' },
    };
    for (const [name, env] of Object.entries(cases)) {
      it(name, () => {
        const s = setup([...recent(1), entry('old-v2026', 400)]);
        const r = run(s, env);
        expect(r.status).toBe(5);
        expect(r.stderr).toContain('ERROR');
        expect(copytos(s)).toHaveLength(0);
        expect(deletes(s)).toHaveLength(0);
      });
    }
  });

  it('exits 3 when a remote is set and rclone is missing', () => {
    const s = setup();
    // An isolated bin dir holding every external the script needs EXCEPT rclone (as backup-db.test.mjs does)
    const iso = path.join(s.dir, 'iso-bin');
    mkdirSync(iso);
    const needed = ['bash', 'cp', 'du', 'cut', 'ls', 'wc', 'tail', 'xargs', 'rm', 'mkdir', 'date', 'basename', 'grep', 'sort', 'dirname', 'cat', 'gzip', 'mktemp'];
    for (const bin of needed) {
      let real = '';
      try {
        real = execFileSync('bash', ['-lc', `command -v ${bin}`], { encoding: 'utf8' }).trim();
      } catch {
        // not resolvable here
      }
      if (real) symlinkSync(real, path.join(iso, bin));
    }
    const r = run(s, { ...PARIS, PATH: iso });
    expect(r.status).toBe(3);
    expect(logLines(s)).toHaveLength(0);
  });

  it("today's count-based prune never runs against the locked remote", () => {
    const s = setup([...recent(1), entry('old-v2026', 356.5)]);
    for (let i = 0; i < 35; i++) writeFileSync(path.join(s.store, `sessions.2026-01-01-${String(i).padStart(6, '0')}.db`), 'x');
    const r = run(s, { ...PARIS, BACKUP_REMOTE: 'secret:' });
    expect(r.status).toBe(0);
    const del = deletes(s);
    expect(del.filter((l) => l.startsWith('deletefile secret:'))).toHaveLength(6); // London's prune did run (35 - 29 kept)
    for (const l of del) {
      expect(l.startsWith('deletefile secret:') || l.startsWith('deletefile --s3-versions locked-s3:')).toBe(true);
    }
    expect(del.join('\n')).not.toContain('locked-secret:');
    expect(del.filter((l) => l.startsWith('deletefile --s3-versions'))).toEqual(['deletefile --s3-versions locked-s3:bkt/old-v2026']);
    // with both remotes set, London writes no heartbeat of its own: Paris's heartbeat is the one
    expect(existsSync(path.join(r.backups, '.last-offbox-backup'))).toBe(true);
  });

  it('with only London set, behaviour is unchanged and no status file is written', () => {
    const s = setup();
    const r = run(s, { BACKUP_REMOTE: 'secret:' });
    expect(r.status).toBe(0);
    expect(existsSync(path.join(r.backups, '.last-offbox-backup'))).toBe(true);
    expect(existsSync(path.join(r.backups, '.offbox-locked-status.json'))).toBe(false);
    expect(logLines(s).some((l) => l.startsWith('lsjson'))).toBe(false);
  });

  it('London failing does not stop Paris, and the run exits 4', () => {
    const s = setup();
    // fail only London's copyto: a wrapper around the fake that fails when the destination begins "secret:"
    const real = path.join(s.bin, 'rclone');
    const wrapped = path.join(s.bin, 'rclone-real');
    copyFileSync(real, wrapped);
    chmodSync(wrapped, 0o755);
    writeFileSync(real, `#!/usr/bin/env bash\n[ "$1" = copyto ] && case "$3" in secret:*) printf '%s\\n' "$*" >> "$FAKE_LOG"; exit 1;; esac\nexec "${wrapped}" "$@"\n`);
    chmodSync(real, 0o755);
    const r = run(s, { ...PARIS, BACKUP_REMOTE: 'secret:' });
    expect(r.status).toBe(4);
    expect(readdirSync(s.store).some((f) => f.endsWith('.db.gz'))).toBe(true);
    expect(existsSync(path.join(r.backups, '.offbox-locked-status.json'))).toBe(true);
  });

  it('the seen check finds an upload that is not last in a long listing (no SIGPIPE)', () => {
    const s = setup();
    const extra = path.join(s.dir, 'extra.txt');
    writeFileSync(extra, Array.from({ length: 5000 }, (_, i) => `sessions.9999-${String(i).padStart(6, '0')}.db.gz`).join('\n') + '\n');
    const r = run(s, { ...PARIS, FAKE_LSF_EXTRA: extra });
    expect(r.status).toBe(0);
    expect(JSON.parse(readFileSync(path.join(r.backups, '.offbox-locked-status.json'), 'utf8')).uploaded_seen).toBe(true);
  });

  it('rejects the same remote for the crypt and the S3 path', () => {
    const s = setup();
    const r = run(s, { LOCKED_BACKUP_REMOTE: 'locked-s3:', LOCKED_BACKUP_S3: 'locked-s3:bkt/' });
    expect(r.status).toBe(5);
    expect(copytos(s)).toHaveLength(0);
    expect(deletes(s)).toHaveLength(0);
  });

  it('a listing that is not JSON refuses the upload', () => {
    const s = setup();
    writeFileSync(s.lsjson, 'not json');
    const r = run(s, PARIS);
    expect(r.status).toBe(7);
    expect(copytos(s)).toHaveLength(0);
  });

  describe('with both remotes set and Paris paused', () => {
    const pausedWrap = (s) => {
      const wrap = path.join(s.dir, 'node-wrap.sh');
      writeFileSync(
        wrap,
        `#!/bin/sh\nfor a in "$@"; do if [ "$a" = retention-due ]; then exit 1; fi; done\nexec "${process.execPath}" "$@"\n`
      );
      chmodSync(wrap, 0o755);
      return wrap;
    };
    it('London ok: exit 6 and London writes no heartbeat', () => {
      const s = setup();
      const r = run(s, { ...PARIS, BACKUP_REMOTE: 'secret:', BACKUP_NODE: pausedWrap(s) });
      expect(r.status).toBe(6);
      expect(copytos(s).some((l) => l.includes(' secret:'))).toBe(true);
      expect(existsSync(path.join(r.backups, '.last-offbox-backup'))).toBe(false);
    });
    it('London failing too: exit 6 (the locked verdict wins)', () => {
      const s = setup();
      // The fake's cp fails when the London store path cannot be written: FAKE_FAIL targets a whole subcommand, so
      // wrap rclone to fail London's copyto only.
      const real = path.join(s.bin, 'rclone');
      const wrapped = path.join(s.bin, 'rclone-real');
      copyFileSync(real, wrapped);
      chmodSync(wrapped, 0o755);
      writeFileSync(real, `#!/usr/bin/env bash\n[ "$1" = copyto ] && case "$3" in secret:*) exit 1;; esac\nexec "${wrapped}" "$@"\n`);
      chmodSync(real, 0o755);
      const r = run(s, { ...PARIS, BACKUP_REMOTE: 'secret:', BACKUP_NODE: pausedWrap(s) });
      expect(r.status).toBe(6);
    });
  });
});
