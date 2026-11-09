// server/__tests__/researchBackupNode.test.js — the research backup's Node part (G1.1 + G1.2 spec §5.17, §5.15; T19,
// T9's copy part; PR4 Task 10, decisions 22–25, 29, 30 and 42)
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { createRequire } from 'module';
import { spawnSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
const require = createRequire(import.meta.url);

// Env BEFORE any server require: the research file, its copies and its heartbeat derive into this directory.
const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'research-backup-node-'));
process.env.SESSIONS_DB_PATH = path.join(tmpRoot, 'sessions.db');
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-research-backup-node';

const Database = require('better-sqlite3');
const { runAllMigrations } = require('../services/migrationRunner');
const { resolveResearchDbPath } = require('../lib/researchDbPath');
const { researchFilesFor } = require('../lib/researchFiles');
const { COPY_NAME, copyName } = require('../lib/researchBackupPolicy');
const researchDb = require('../services/researchDb');
const researchLog = require('../services/researchLog');
const researchConsent = require('../services/researchConsent');
const researchConsentText = require('../lib/researchConsentText');
const serverCommit = require('../lib/serverCommit');
const { runWithdrawal } = require('../scripts/research-withdrawal');
const { pruneLocal, takeCopy, writeHeartbeat, verifyCopy } = require('../scripts/research-backup');
const freshMigratedDb = require('./helpers/freshMigratedDb');
const {
  APPROVED,
  makeUser,
  consent,
  saveEvent,
  readResearch,
} = require('./helpers/researchFixture.cjs');

const SCRIPT_PATH = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'scripts',
  'research-backup.js'
);
const { researchPath, editorialPath } = resolveResearchDbPath();
const files = researchFilesFor(researchPath);
const H = 3_600_000;
const mode = (p) => fs.statSync(p).mode & 0o777;
const uid = {};
let A; // p-wd's interval
let K; // p-keep's interval

const holdsIn = (paths, s) =>
  paths.some((p) => fs.existsSync(p) && fs.readFileSync(p).includes(Buffer.from(s, 'ascii')));
const liveHolds = (s) => holdsIn([researchPath, files.walPath], s);
const run = (args, input, env = { ...process.env, SESSIONS_DB_PATH: editorialPath }) =>
  spawnSync(process.execPath, [SCRIPT_PATH, ...args], { env, input, encoding: 'utf8' });
const keyOf = (i) => {
  const db = readResearch();
  try {
    return db.prepare('SELECT editor_key FROM editor_keys WHERE interval_id = ?').get(i).editor_key;
  } finally {
    db.close();
  }
};
const copyNow = () => takeCopy({ files, sessionsPath: editorialPath, nowMs: Date.now() });

let actionSeq = 0;
function recordEvent(actor, text) {
  const r = researchLog.record(
    saveEvent({
      actorProviderId: actor,
      content: { text, note: null, category: null },
      clientActionId: `bk-act-${++actionSeq}`,
    })
  );
  expect(r.status).toBe('written');
}

beforeAll(() => {
  runAllMigrations();
  researchDb.openAtBoot();
  researchConsentText._setTestApprovedTexts(APPROVED);
  serverCommit._setTestServerCommit({
    serverCommit: 'c'.repeat(40),
    commitSource: 'deploy-file',
    codeDirty: 0,
  });
  for (const p of ['p-wd', 'p-keep']) uid[p] = makeUser(p);
});

afterAll(() => {
  researchDb._reset();
  researchConsentText._setTestApprovedTexts(null);
  serverCommit._setTestServerCommit(null);
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

beforeEach(() => {
  researchConsent
    .getSessionsDb()
    .exec(
      'DELETE FROM research_consent; DELETE FROM research_capture_losses; DELETE FROM research_deletions;'
    );
  const w = new Database(researchPath, { timeout: 1000 });
  try {
    w.exec(
      'DELETE FROM research_event_items; DELETE FROM research_events; DELETE FROM editor_keys;'
    );
    w.exec('VACUUM');
    w.pragma('wal_checkpoint(TRUNCATE)');
  } finally {
    w.close();
  }
  for (const p of [
    files.backupsDir,
    files.heartbeatPath,
    files.stagingPath,
    `${files.stagingPath}-wal`,
  ]) {
    fs.rmSync(p, { recursive: true, force: true });
  }
  A = consent(uid['p-wd']);
  for (const n of [1, 2, 3]) recordEvent('p-wd', `SENTINEL-WD-${n}`);
  K = consent(uid['p-keep']);
  for (const n of [1, 2]) recordEvent('p-keep', `SENTINEL-KEEP-${n}`);
});

describe('prune-local (T19: a copy older than the cut-off is pruned)', () => {
  const plantCopies = (now, extra = []) => {
    fs.mkdirSync(files.backupsDir, { recursive: true });
    fs.chmodSync(files.backupsDir, 0o755); // on purpose: the prune re-asserts 0700
    const expired = [
      copyName(now - 170 * H),
      `${copyName(now - 170 * H)}-wal`,
      `${copyName(now - 200 * H)}.partial`,
      `${copyName(now - 180 * H)}.verify`,
    ];
    const kept = [copyName(now - 100 * H), `${copyName(now - 10 * H)}.verify`];
    for (const n of [...expired, ...kept, ...extra])
      fs.writeFileSync(path.join(files.backupsDir, n), 'x');
    return { expired, kept };
  };

  it('removes what has reached the cut-off on its stamp, keeps the rest, and re-asserts the directory mode', () => {
    const now = Date.now();
    const { expired, kept } = plantCopies(now);
    expect(pruneLocal({ files, nowMs: now })).toEqual({
      ok: true,
      removed: [...expired].sort(),
      unknown: [],
    });
    expect(fs.readdirSync(files.backupsDir).sort()).toEqual([...kept].sort());
    expect(mode(files.backupsDir)).toBe(0o700);
  });

  it('a name it did not make fails the prune and is left in place', () => {
    const now = Date.now();
    const foreign = ['notes.txt', `${copyName(now - 200 * H)}.replaced`];
    const { expired } = plantCopies(now, foreign);
    const r = pruneLocal({ files, nowMs: now });
    expect(r.ok).toBe(false);
    expect(r.unknown).toEqual([...foreign].sort());
    expect(r.removed).toEqual([...expired].sort());
    for (const n of foreign) expect(fs.existsSync(path.join(files.backupsDir, n))).toBe(true);
  });

  it('a staging file a killed restore left beside the research file fails the prune and is left in place (decision 23)', () => {
    const now = Date.now();
    const { expired } = plantCopies(now);
    fs.writeFileSync(files.stagingPath, 'staged');
    fs.writeFileSync(`${files.stagingPath}-wal`, 'staged-wal');
    const r = pruneLocal({ files, nowMs: now });
    expect(r.ok).toBe(false);
    expect(r.unknown).toEqual([
      path.basename(files.stagingPath),
      `${path.basename(files.stagingPath)}-wal`,
    ]);
    expect(fs.existsSync(files.stagingPath)).toBe(true);
    expect(fs.existsSync(`${files.stagingPath}-wal`)).toBe(true);
    for (const n of expired) expect(fs.existsSync(path.join(files.backupsDir, n))).toBe(false);
    // Control: with the staging files gone, the same prune is clean.
    fs.rmSync(files.stagingPath);
    fs.rmSync(`${files.stagingPath}-wal`);
    expect(pruneLocal({ files, nowMs: now }).ok).toBe(true);
  });

  it('no directory yet is a clean prune', () => {
    expect(pruneLocal({ files, nowMs: Date.now() })).toEqual({
      ok: true,
      removed: [],
      unknown: [],
    });
    expect(fs.existsSync(files.backupsDir)).toBe(false);
  });

  it('expired-names on the command line', () => {
    const now = Date.now();
    const names = [copyName(now - 170 * H), copyName(now - H), ''];
    const ok = run(['expired-names'], names.join('\n'));
    expect(ok.status).toBe(0);
    expect(ok.stdout).toBe(`${copyName(now - 170 * H)}\n`);
    const bad = run(['expired-names'], [...names, 'notes.txt'].join('\n'));
    expect(bad.status).toBe(1);
    expect(bad.stdout).toBe(`${copyName(now - 170 * H)}\n`);
    expect(bad.stderr).toMatch(/notes\.txt/);
  });
});

describe('copy', () => {
  it('T19: a 0600 copy in a 0700 directory, named research.<stamp>.db, one self-contained file', async () => {
    const r = await copyNow();
    expect(r.ok).toBe(true);
    expect(path.dirname(r.path)).toBe(files.backupsDir);
    expect(COPY_NAME.test(path.basename(r.path))).toBe(true);
    expect(mode(r.path)).toBe(0o600);
    expect(mode(files.backupsDir)).toBe(0o700);
    expect([...fs.readFileSync(r.path).subarray(18, 20)]).toEqual([1, 1]); // rollback journal
    expect(fs.readdirSync(files.backupsDir)).toEqual([path.basename(r.path)]);
    const ro = new Database(r.path, { readonly: true, fileMustExist: true });
    try {
      expect(ro.pragma('integrity_check', { simple: true })).toBe('ok');
    } finally {
      ro.close();
    }
    expect(fs.readdirSync(files.backupsDir)).toEqual([path.basename(r.path)]); // the open created nothing
    expect(holdsIn([r.path], 'SENTINEL-KEEP-1')).toBe(true); // positive control
  });

  it("T9: a copy taken after the withdrawal script lacks the withdrawn editor's text and key", async () => {
    const keyA = keyOf(A);
    // The control arm: a copy taken before the withdrawal holds them.
    const before = await takeCopy({ files, sessionsPath: editorialPath, nowMs: Date.now() - 1000 });
    expect(before.ok).toBe(true);
    expect(holdsIn([before.path], 'SENTINEL-WD-1')).toBe(true);
    expect(holdsIn([before.path], keyA)).toBe(true);

    researchConsent.withdraw({ userId: uid['p-wd'], nowMs: Date.now() });
    expect(
      runWithdrawal({ researchPath, sessionsPath: editorialPath, write: true, busyTimeoutMs: 100 })
        .ok
    ).toBe(true);
    const after = await copyNow();
    expect(after.ok).toBe(true);
    expect(holdsIn([after.path], 'SENTINEL-WD')).toBe(false);
    expect(holdsIn([after.path], keyA)).toBe(false);
    expect(holdsIn([after.path], 'SENTINEL-KEEP-1')).toBe(true);
  });

  it('never copies deleted bytes: it compacts before every copy (decision 25)', async () => {
    const keyK = keyOf(K);
    const w = new Database(researchPath, { timeout: 1000 });
    try {
      w.prepare('DELETE FROM research_events WHERE editor_key = ?').run(keyK); // items cascade
    } finally {
      w.close();
    }
    // The premise, in this fixture: a plain online backup from this state still holds the deleted text.
    const scratch = path.join(tmpRoot, 'plain-backup.db');
    fs.rmSync(scratch, { force: true });
    const plain = new Database(researchPath, { readonly: true });
    try {
      await plain.backup(scratch);
    } finally {
      plain.close();
    }
    expect(holdsIn([scratch], 'SENTINEL-KEEP-1')).toBe(true);

    const r = await copyNow();
    expect(r.ok).toBe(true);
    expect(holdsIn([r.path], 'SENTINEL-KEEP-1')).toBe(false);
    expect(liveHolds('SENTINEL-KEEP-1')).toBe(false);
    expect(holdsIn([r.path], 'SENTINEL-WD-1')).toBe(true); // positive control
  });

  it('a withdrawal due after the copy discards the copy (decision 25)', async () => {
    researchConsent.withdraw({ userId: uid['p-wd'], nowMs: Date.now() });
    expect(await copyNow()).toEqual({ ok: false, reason: 'withdrawal-due' });
    expect(fs.readdirSync(files.backupsDir)).toEqual([]);
    // Control: once the withdrawal script has run, the copy is taken.
    expect(
      runWithdrawal({ researchPath, sessionsPath: editorialPath, write: true, busyTimeoutMs: 100 })
        .ok
    ).toBe(true);
    expect((await copyNow()).ok).toBe(true);
  });

  it('a retention due after the copy discards it', async () => {
    expect(
      await takeCopy({
        files,
        sessionsPath: editorialPath,
        retentionDate: '2026-01-01',
        nowMs: Date.UTC(2026, 10, 3),
      })
    ).toEqual({ ok: false, reason: 'retention-due' });
    expect(fs.readdirSync(files.backupsDir)).toEqual([]);
  });

  it('a busy compaction takes no copy', { timeout: 30_000 }, async () => {
    const reader = new Database(researchPath, { readonly: true });
    try {
      reader.exec('BEGIN');
      reader.prepare('SELECT * FROM research_events').all();
      expect(
        await takeCopy({
          files,
          sessionsPath: editorialPath,
          nowMs: Date.now(),
          busyTimeoutMs: 100,
        })
      ).toEqual({ ok: false, reason: 'compact-busy' });
      expect(fs.readdirSync(files.backupsDir)).toEqual([]);
      reader.exec('COMMIT');
    } finally {
      reader.close();
    }
    expect((await copyNow()).ok).toBe(true); // control
  });

  it('refuses a name already taken', async () => {
    const nowMs = Date.now();
    fs.mkdirSync(files.backupsDir, { recursive: true });
    const taken = path.join(files.backupsDir, copyName(nowMs));
    fs.writeFileSync(taken, 'already here');
    expect(await takeCopy({ files, sessionsPath: editorialPath, nowMs })).toEqual({
      ok: false,
      reason: 'name-taken',
    });
    expect(fs.readFileSync(taken, 'utf8')).toBe('already here');
  });

  it('the command line prints exactly the path, or fails with nothing written', () => {
    const r = run(['copy']);
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/^\/\S+\.db\n$/);
    expect(fs.existsSync(r.stdout.trim())).toBe(true);

    // A migrated database beside no research file (the live one is held open by this process).
    const fresh = freshMigratedDb();
    fresh.db.close();
    const freshFiles = researchFilesFor(path.join(path.dirname(fresh.path), 'research.db'));
    expect(fs.existsSync(freshFiles.researchPath)).toBe(false);
    const failed = run(['copy'], undefined, { ...process.env, SESSIONS_DB_PATH: fresh.path });
    expect(failed.status).toBe(1);
    expect(failed.stdout).toBe('');
    expect(
      fs.existsSync(freshFiles.backupsDir) ? fs.readdirSync(freshFiles.backupsDir) : []
    ).toEqual([]);
  });
});

describe('heartbeat, where, verify', () => {
  it('heartbeat writes the file, and a second call moves it', () => {
    writeHeartbeat(files);
    expect(fs.existsSync(files.heartbeatPath)).toBe(true);
    const anHourAgo = new Date(Date.now() - H);
    fs.utimesSync(files.heartbeatPath, anHourAgo, anHourAgo);
    writeHeartbeat(files);
    expect(Math.abs(fs.statSync(files.heartbeatPath).mtimeMs - Date.now())).toBeLessThan(5000);
  });

  it('where prints the copies directory', () => {
    expect(run(['where']).stdout).toBe(`${files.backupsDir}\n`);
  });

  it('verify passes a copy and creates no side file, and fails a corrupt, foreign or missing one', async () => {
    const r = await copyNow();
    expect(r.ok).toBe(true);
    const listing = fs.readdirSync(files.backupsDir);
    expect(verifyCopy(r.path)).toEqual({ ok: true });
    expect(fs.readdirSync(files.backupsDir)).toEqual(listing);
    const pass = run(['verify', r.path]);
    expect(pass.status).toBe(0);
    expect(pass.stdout).toBe('RESEARCH RESTORE VERIFY: PASS\n');

    const corrupt = path.join(tmpRoot, 'corrupt.db');
    const buf = fs.readFileSync(r.path);
    const raw = (buf[16] << 8) | buf[17];
    const pageSize = raw === 1 ? 65536 : raw;
    const offset = buf.length >= pageSize * 2 ? pageSize : 100; // start of page 2
    buf[offset] ^= 0xff;
    fs.writeFileSync(corrupt, buf);
    expect(verifyCopy(corrupt).ok).toBe(false);
    const fail = run(['verify', corrupt]);
    expect(fail.status).toBe(1);
    expect(fail.stdout).toMatch(/^RESEARCH RESTORE VERIFY: FAIL \(/);

    const empty = path.join(tmpRoot, 'empty.db');
    fs.rmSync(empty, { force: true });
    new Database(empty).close();
    expect(verifyCopy(empty)).toEqual({ ok: false, reason: 'schema' });
    expect(verifyCopy(path.join(tmpRoot, 'no-such.db')).ok).toBe(false);
  });

  it('an unknown subcommand is a usage error', () => {
    expect(run(['backup']).status).toBe(2);
  });
});
