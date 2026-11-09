/**
 * scripts/research-backup.sh — the research file's own backup job (G1.1 + G1.2 spec §5.17; T19, T9's held-reader part;
 * PR4 Task 11, decisions 13, 22, 24, 26–28 and 37).
 *
 * Every run uses a fake rclone (helpers/fakeBins.mjs) whose "remote" is a directory, and a research file derived from a
 * temp SESSIONS_DB_PATH, so nothing here touches a real remote or pipeline-output/. Each case records the state of the
 * real pipeline-output/ research files before and asserts it unchanged after.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { spawnSync, execFileSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { makeFakeBins } from './helpers/fakeBins.mjs';

const require = createRequire(import.meta.url);
const REPO = path.resolve(import.meta.dirname, '..', '..');
const SCRIPT = path.join(REPO, 'scripts', 'research-backup.sh');
const INSTALL_CRON = path.join(REPO, 'scripts', 'install-cron.sh');
const VERIFY_SCRIPT = path.join(REPO, 'scripts', 'verify-research-backup.sh');
const WITHDRAWAL_SCRIPT = path.join(REPO, 'server', 'scripts', 'research-withdrawal.js');
const Database = require(path.join(REPO, 'server', 'node_modules', 'better-sqlite3'));
const freshMigratedDb = require(
  path.join(REPO, 'server', '__tests__', 'helpers', 'freshMigratedDb.js')
);
const { ensureResearchSchema } = require(path.join(REPO, 'server', 'lib', 'researchSchema.js'));
const { deriveResearchPath } = require(path.join(REPO, 'server', 'lib', 'researchDbPath.js'));
const { researchFilesFor } = require(path.join(REPO, 'server', 'lib', 'researchFiles.js'));
const { COPY_NAME, copyName } = require(
  path.join(REPO, 'server', 'lib', 'researchBackupPolicy.js')
);

const H = 3_600_000;
const K = 'a'.repeat(32);
const K2 = 'b'.repeat(32);
const SENTINEL_INTERVAL = 7340021; // an id no other row of the fixture can take
const mode = (p) => statSync(p).mode & 0o777;
const REAL = [
  path.join(REPO, 'pipeline-output', '.last-research-backup'),
  path.join(REPO, 'pipeline-output', 'research-backups'),
];
const realState = () => REAL.map((p) => (existsSync(p) ? statSync(p).mtimeMs : null));

const cleanup = [];
afterEach(() => {
  while (cleanup.length) rmSync(cleanup.pop(), { recursive: true, force: true });
});

function setup() {
  const before = realState();
  const fresh = freshMigratedDb();
  fresh.db.close(); // closed before any spawn
  const sessionsPath = fresh.path;
  cleanup.push(path.dirname(sessionsPath));
  const researchPath = deriveResearchPath(sessionsPath);
  const files = researchFilesFor(researchPath);
  const db = new Database(researchPath);
  try {
    expect(ensureResearchSchema(db).ok).toBe(true);
    db.pragma('journal_mode = WAL');
    db.prepare('INSERT INTO editor_keys (interval_id, editor_key) VALUES (1, ?)').run(K);
    db.prepare(
      `INSERT INTO research_events
         (id, key_seq, event_type, editor_key, server_time_ms, replayed, book, chapter, module_id,
          content_json, flag_snapshot_json, commit_source)
       VALUES (101, 1, 'edit-save', ?, 1700000000000, 0, 'efnafraedi-2e', 1, 'm1',
               '{"text":"SENTINEL-JOB"}', '{}', 'unknown')`
    ).run(K);
  } finally {
    db.close();
  }
  const fake = makeFakeBins();
  cleanup.push(fake.root);
  const env = {
    ...process.env,
    ...fake.env(),
    PATH: `${fake.binDir}:${process.env.PATH}`,
    SESSIONS_DB_PATH: sessionsPath,
    RESEARCH_NODE: process.execPath,
    RESEARCH_REMOTE: 'research-secret:',
  };
  const now = Date.now();
  const oldName = copyName(now - 170 * H);
  const youngName = copyName(now - 10 * H);
  mkdirSync(files.backupsDir, { recursive: true });
  for (const n of [oldName, youngName]) {
    writeFileSync(path.join(files.backupsDir, n), 'local');
    writeFileSync(path.join(fake.remoteDir, n), 'remote');
  }
  const run = (over = {}) =>
    spawnSync('bash', [SCRIPT], { env: { ...env, ...over }, encoding: 'utf8' });
  const local = () => readdirSync(files.backupsDir).sort();
  const remote = () => readdirSync(fake.remoteDir).sort();
  const newCopies = () =>
    local().filter((n) => n !== youngName && n !== oldName && COPY_NAME.test(n));
  const withSessions = (fn) => {
    const s = new Database(sessionsPath);
    try {
      return fn(s);
    } finally {
      s.close();
    }
  };
  const checkReal = () => expect(realState()).toEqual(before);
  return {
    sessionsPath,
    researchPath,
    files,
    fake,
    env,
    run,
    local,
    remote,
    newCopies,
    oldName,
    youngName,
    withSessions,
    checkReal,
  };
}

/** A withdrawn interval due for deletion: its starting row (id = interval_id) with withdrawn_at_ms, and its key row. */
function seedDue(ctx, intervalId, key) {
  ctx.withSessions((s) =>
    s
      .prepare(
        `INSERT INTO research_consent
           (id, user_id, decision, interval_id, consent_text_version, consent_text_sha256, given_at_ms, withdrawn_at_ms)
         VALUES (?, 999999, 'consented', ?, 'prufa-1', ?, 1700000000000, 1700000001000)`
      )
      .run(intervalId, intervalId, 'a'.repeat(64))
  );
  if (key) {
    const db = new Database(ctx.researchPath);
    try {
      const has = db.prepare('SELECT 1 FROM editor_keys WHERE interval_id = ?').get(intervalId);
      if (!has)
        db.prepare('INSERT INTO editor_keys (interval_id, editor_key) VALUES (?, ?)').run(
          intervalId,
          key
        );
    } finally {
      db.close();
    }
  }
}

const VERDICT_FAILED =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z research-backup: failed: [a-z-]+(,[a-z-]+)*\n$/;

describe('research-backup.sh', () => {
  it('a full cycle: prunes both tiers, deletes, copies, uploads to its own remote, and writes the heartbeat', () => {
    const c = setup();
    const r = c.run();
    expect(r.status, r.stdout + r.stderr).toBe(0);
    expect(c.local()).not.toContain(c.oldName);
    expect(c.remote()).not.toContain(c.oldName);
    expect(c.local()).toContain(c.youngName); // T19's positive control
    expect(c.remote()).toContain(c.youngName);
    const fresh = c.newCopies();
    expect(fresh).toHaveLength(1);
    const copyPath = path.join(c.files.backupsDir, fresh[0]);
    expect(mode(copyPath)).toBe(0o600);
    expect(mode(c.files.backupsDir)).toBe(0o700);
    expect(c.remote()).toContain(fresh[0]);
    expect(existsSync(c.files.heartbeatPath)).toBe(true);
    expect(c.fake.calls()).toEqual([
      'lsf research-secret:',
      `deletefile research-secret:${c.oldName}`,
      `copyto ${copyPath} research-secret:${fresh[0]}`,
    ]);
    c.checkReal();
  });

  it("T19: a remote that is not the research file's own is refused before any rclone call, after the local prune", () => {
    for (const [remote, status] of [
      ['secret:', 2],
      ['', 2],
      ['research-secret', 5],
    ]) {
      const c = setup();
      const r = c.run({ RESEARCH_REMOTE: remote });
      expect(r.status, `RESEARCH_REMOTE=${remote}`).toBe(status);
      expect(c.fake.calls()).toEqual([]);
      expect(c.newCopies()).toEqual([]);
      expect(existsSync(c.files.heartbeatPath)).toBe(false);
      expect(c.local()).not.toContain(c.oldName); // the local prune ran first (decision 27)
      expect(c.local()).toContain(c.youngName);
      expect(c.remote()).toEqual([c.oldName, c.youngName].sort());
      c.checkReal();
    }
  });

  it('T19: a failing upload still prunes', () => {
    const c = setup();
    const r = c.run({ FAKE_FAIL_COPYTO: '1' });
    expect(r.status).toBe(4);
    expect(c.local()).not.toContain(c.oldName);
    expect(c.remote()).not.toContain(c.oldName);
    expect(c.newCopies()).toHaveLength(1);
    expect(existsSync(c.files.heartbeatPath)).toBe(false);
    c.checkReal();
  });

  it('T19: a failing deletion step takes no copy', () => {
    const c = setup();
    for (const p of [c.researchPath, c.files.walPath, c.files.shmPath]) rmSync(p, { force: true });
    const r = c.run();
    expect(r.status).toBe(6);
    expect(c.fake.calls().some((l) => l.startsWith('copyto'))).toBe(false);
    expect(c.newCopies()).toEqual([]);
    expect(existsSync(c.files.heartbeatPath)).toBe(false);
    expect(c.local()).not.toContain(c.oldName); // step 1 does not depend on a copy
    const out = r.stdout + r.stderr;
    expect(out).toMatch(VERDICT_FAILED);
    expect(
      out
        .replace(/^\S+ research-backup: failed: /, '')
        .trim()
        .split(',')
    ).toContain('withdrawal');
    c.checkReal();
  });

  it('T19: a failing remote prune exits non-zero with no heartbeat', () => {
    const c = setup();
    const r = c.run({ FAKE_FAIL_DELETE: '1' });
    expect(r.status).toBe(7);
    expect(c.fake.calls().some((l) => l.startsWith('copyto'))).toBe(true); // the copy was still uploaded
    expect(existsSync(c.files.heartbeatPath)).toBe(false);
    const d = setup();
    expect(d.run({ FAKE_FAIL_LSF: '1' }).status).toBe(7);
    expect(existsSync(d.files.heartbeatPath)).toBe(false);
    c.checkReal();
  });

  it('a name in the remote the job did not make is left in place and fails the prune', () => {
    const c = setup();
    writeFileSync(path.join(c.fake.remoteDir, 'notes.txt'), 'not ours');
    expect(c.run().status).toBe(7);
    expect(c.remote()).toContain('notes.txt');
    expect(
      c.fake.calls().filter((l) => l.startsWith('deletefile') && l.includes('notes.txt'))
    ).toEqual([]);
    c.checkReal();
  });

  // Review finding (2026-11-08): `rclone lsf --files-only` hides an object under a prefix, so the job never deleted it
  // and never reported it, while decision 23 says a name it did not make is never ignored.
  it('a folder in the remote is a name the job did not make: left in place, and it fails the prune', () => {
    const c = setup();
    mkdirSync(path.join(c.fake.remoteDir, 'old'));
    writeFileSync(path.join(c.fake.remoteDir, 'old', c.oldName), 'remote');
    const r = c.run();
    expect(r.status, r.stdout + r.stderr).toBe(7);
    expect(existsSync(path.join(c.fake.remoteDir, 'old', c.oldName))).toBe(true);
    expect(c.fake.calls().filter((l) => l.startsWith('deletefile') && l.includes('old'))).toEqual(
      []
    );
    expect(existsSync(c.files.heartbeatPath)).toBe(false);
    c.checkReal();
  });

  it(
    'T9: a reader holding the research file fails the deletion step, and no copy is taken',
    { timeout: 30_000 },
    () => {
      const c = setup();
      seedDue(c, 1, K);
      const reader = new Database(c.researchPath, { readonly: true });
      try {
        reader.exec('BEGIN');
        reader.prepare('SELECT * FROM research_events').all();
        const r = c.run();
        expect(r.status).toBe(6);
        expect(c.fake.calls().some((l) => l.startsWith('copyto'))).toBe(false);
        expect(c.newCopies()).toEqual([]);
        expect(
          reader.prepare('SELECT editor_key FROM editor_keys WHERE interval_id = 1').get()
            .editor_key
        ).toBe(K);
        reader.exec('COMMIT');
      } finally {
        reader.close();
      }
      const r = c.run();
      expect(r.status, r.stdout + r.stderr).toBe(0);
      const [made] = c.newCopies();
      const bytes = readFileSync(path.join(c.files.backupsDir, made));
      expect(bytes.includes(Buffer.from(K))).toBe(false);
      expect(bytes.includes(Buffer.from('SENTINEL-JOB'))).toBe(false);
      c.checkReal();
    }
  );

  it('rclone missing is exit 3, after the local prune (decision 27)', () => {
    const c = setup();
    const binDir = mkdtempSync(path.join(tmpdir(), 'research-job-bin-'));
    cleanup.push(binDir);
    for (const bin of ['bash', 'dirname', 'basename', 'date']) {
      const real = execFileSync('bash', ['-lc', `command -v ${bin}`], { encoding: 'utf8' }).trim();
      symlinkSync(real, path.join(binDir, bin));
    }
    const r = spawnSync('bash', [SCRIPT], {
      env: {
        PATH: binDir,
        SESSIONS_DB_PATH: c.sessionsPath,
        RESEARCH_NODE: process.execPath,
        RESEARCH_REMOTE: 'research-secret:',
        ...c.fake.env(),
      },
      encoding: 'utf8',
    });
    expect(r.status).toBe(3);
    expect(c.local()).not.toContain(c.oldName);
    expect(c.local()).toContain(c.youngName);
    expect(c.remote()).toEqual([c.oldName, c.youngName].sort());
    expect(c.newCopies()).toEqual([]);
    expect(existsSync(c.files.heartbeatPath)).toBe(false);
    const out = r.stdout + r.stderr;
    expect(out).toMatch(VERDICT_FAILED);
    expect(out.endsWith('research-backup: failed: rclone\n')).toBe(true);
    c.checkReal();
  });

  it('the log is one verdict line per run: never an interval id or a count, and a failing step is named (decision 27)', () => {
    const c = setup();
    seedDue(c, SENTINEL_INTERVAL, K2);
    // The premise first, so the absence below is not manufactured: the withdrawal report names the interval.
    const dry = spawnSync(process.execPath, [WITHDRAWAL_SCRIPT], { env: c.env, encoding: 'utf8' });
    expect(JSON.parse(dry.stdout).due).toContain(SENTINEL_INTERVAL);

    const r = c.run();
    expect(r.status, r.stdout + r.stderr).toBe(0);
    const out = r.stdout + r.stderr;
    expect(out).not.toContain(String(SENTINEL_INTERVAL));
    expect(out).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z research-backup: ok\n$/);
    expect(/\d/.test(out.replace(/^\S+ /, ''))).toBe(false);
    // Positive control: the interval was in this run.
    expect(
      c.withSessions((s) =>
        s
          .prepare("SELECT interval_id FROM research_deletions WHERE kind = 'withdrawal'")
          .pluck()
          .all()
      )
    ).toContain(SENTINEL_INTERVAL);

    // The failing-step control, on a fresh setup (a second run in the same second would collide on the copy's name).
    const d = setup();
    const failed = d.run({ FAKE_FAIL_COPYTO: '1' });
    expect(failed.status).toBe(4);
    expect(failed.stdout + failed.stderr).toMatch(/^\S+Z research-backup: failed: upload\n$/);
  });

  it('the template prints the research job as its own line, with its own remote (decision 26)', () => {
    const printed = execFileSync('bash', [INSTALL_CRON], {
      env: { ...process.env, DEPLOY_PATH: '/srv/x' },
      encoding: 'utf8',
    });
    const lines = printed.split('\n').filter((l) => l.trim() && !l.trimStart().startsWith('#'));
    const research = lines.filter((l) => /\/scripts\/research-backup\.sh(\s|$)/.test(l));
    expect(research).toHaveLength(1);
    expect(research[0]).toMatch(/(^|\s)RESEARCH_REMOTE=research-secret:(\s|$)/);
    const editorial = lines.filter((l) => /BACKUP_REMOTE=/.test(l));
    expect(editorial.length).toBeGreaterThan(0);
    expect(editorial.filter((l) => /research/.test(l))).toEqual([]);
    const editorialRemote = editorial[0].match(/BACKUP_REMOTE=(\S+)/)[1];
    expect(editorialRemote).toBe('secret:');
    expect(editorialRemote).not.toBe('research-secret:');
  });
});

describe('verify-research-backup.sh', () => {
  /** setup() plus one full job run, so the remote holds a real copy N, and an older valid copy beside it. */
  function withCopy() {
    const c = setup();
    const r = c.run();
    expect(r.status, r.stdout + r.stderr).toBe(0);
    const [N] = c.newCopies();
    writeFileSync(
      path.join(c.fake.remoteDir, 'research.2026-01-01T000000Z.db'),
      readFileSync(path.join(c.fake.remoteDir, N))
    );
    const verify = (over = {}) =>
      spawnSync('bash', [VERIFY_SCRIPT], { env: { ...c.env, ...over }, encoding: 'utf8' });
    const lastLine = (r2) => r2.stdout.trimEnd().split('\n').pop();
    const leftovers = () => c.local().filter((n) => n.endsWith('.verify'));
    return { ...c, N, verify, lastLine, leftovers };
  }

  it('downloads the newest copy into the copies directory under its own stamp, verifies it, and removes it', () => {
    const c = withCopy();
    const r = c.verify();
    expect(r.status, r.stdout + r.stderr).toBe(0);
    expect(c.lastLine(r)).toBe('RESEARCH RESTORE VERIFY: PASS');
    expect(c.fake.calls()).toContain(
      `copyto research-secret:${c.N} ${c.files.backupsDir}/${c.N}.verify`
    );
    expect(c.leftovers()).toEqual([]);
    c.checkReal();
  });

  it('fails loudly when the remote holds no copy', () => {
    const c = withCopy();
    for (const n of readdirSync(c.fake.remoteDir)) rmSync(path.join(c.fake.remoteDir, n));
    const r = c.verify();
    expect(r.status).toBe(1);
    expect(c.lastLine(r)).toBe('RESEARCH RESTORE VERIFY: FAIL (no off-box copy found)');
  });

  it('fails loudly on a corrupt newest copy, and removes the download', () => {
    const c = withCopy();
    const target = path.join(c.fake.remoteDir, c.N);
    const buf = readFileSync(target);
    const raw = (buf[16] << 8) | buf[17];
    const pageSize = raw === 1 ? 65536 : raw;
    const offset = buf.length >= pageSize * 2 ? pageSize : 100; // start of page 2
    buf[offset] ^= 0xff;
    writeFileSync(target, buf);
    const r = c.verify();
    expect(r.status).toBe(1);
    expect(c.lastLine(r)).toMatch(/^RESEARCH RESTORE VERIFY: FAIL \(/);
    expect(c.leftovers()).toEqual([]);
  });

  it("refuses a remote that is not the research file's own", () => {
    const c = setup();
    const r = spawnSync('bash', [VERIFY_SCRIPT], {
      env: { ...c.env, RESEARCH_REMOTE: 'secret:' },
      encoding: 'utf8',
    });
    expect(r.status).toBe(2);
    expect(c.fake.calls()).toEqual([]);
  });

  it('the template prints it monthly, with the research remote', () => {
    const printed = execFileSync('bash', [INSTALL_CRON], {
      env: { ...process.env, DEPLOY_PATH: '/srv/x' },
      encoding: 'utf8',
    });
    const line = printed
      .split('\n')
      .find(
        (l) =>
          !l.trimStart().startsWith('#') && /\/scripts\/verify-research-backup\.sh(\s|$)/.test(l)
      );
    expect(line).toBeTruthy();
    expect(line.trim().split(/\s+/).slice(2, 5)).toEqual(['1', '*', '*']);
    expect(line).toMatch(/(^|\s)RESEARCH_REMOTE=research-secret:(\s|$)/);
  });
});
