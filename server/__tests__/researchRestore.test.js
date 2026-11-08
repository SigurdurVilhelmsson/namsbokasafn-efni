// server/__tests__/researchRestore.test.js — research-restore.js (G1.1 + G1.2 spec §5.15 "A restore", §5.1, §5.17;
// T9's restore part; PR4 Task 14, decisions 32 and 33)
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { createRequire } from 'module';
import { spawnSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
const require = createRequire(import.meta.url);

// Env BEFORE any server require: the research file, its copies and its staging file derive into this directory.
const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'research-restore-'));
process.env.SESSIONS_DB_PATH = path.join(tmpRoot, 'sessions.db');
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-research-restore';

const Database = require('better-sqlite3');
const { runAllMigrations } = require('../services/migrationRunner');
const { resolveResearchDbPath } = require('../lib/researchDbPath');
const { researchFilesFor } = require('../lib/researchFiles');
const { copyName } = require('../lib/researchBackupPolicy');
const researchDb = require('../services/researchDb');
const researchLog = require('../services/researchLog');
const researchConsent = require('../services/researchConsent');
const researchConsentText = require('../lib/researchConsentText');
const serverCommit = require('../lib/serverCommit');
const { runWithdrawal } = require('../scripts/research-withdrawal');
const { runRetention } = require('../scripts/research-retention');
const { takeCopy } = require('../scripts/research-backup');
const { restoreResearch } = require('../scripts/research-restore');
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
  'research-restore.js'
);
const { researchPath, editorialPath } = resolveResearchDbPath();
const files = researchFilesFor(researchPath);
const uid = {};
const inactive = () => ({ ran: true, code: 3, stdout: 'inactive\n', stderr: '' });
const active = () => ({ ran: true, code: 0, stdout: 'active\n', stderr: '' });

const holdsIn = (p, s) => fs.existsSync(p) && fs.readFileSync(p).includes(Buffer.from(s, 'ascii'));
const liveHolds = (s) => holdsIn(researchPath, s) || holdsIn(files.walPath, s);
const keyOf = (i) => {
  const db = readResearch();
  try {
    return db.prepare('SELECT editor_key FROM editor_keys WHERE interval_id = ?').get(i).editor_key;
  } finally {
    db.close();
  }
};
const sessions = () => researchConsent.getSessionsDb();
const deletionsFor = (i) =>
  sessions()
    .prepare("SELECT * FROM research_deletions WHERE kind = 'withdrawal' AND interval_id = ?")
    .all(i);
const stagingLeft = () =>
  ['', '-wal', '-shm', '-journal'].filter((s) => fs.existsSync(`${files.stagingPath}${s}`));
const restore = (over) => {
  researchDb._reset(); // the stopped server
  return restoreResearch({
    files,
    sessionsPath: editorialPath,
    write: true,
    exec: inactive,
    ...over,
  });
};
const freshCopy = async (nowMs = Date.now()) => {
  const r = await takeCopy({ files, sessionsPath: editorialPath, nowMs });
  expect(r.ok, r.reason).toBe(true);
  return r.path;
};
function filesUnder(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? filesUnder(p) : [p];
  });
}

let actionSeq = 0;
function recordEvent(actor, text) {
  const r = researchLog.record(
    saveEvent({
      actorProviderId: actor,
      content: { text, note: null, category: null },
      clientActionId: `rs-act-${++actionSeq}`,
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
  for (const p of ['p-wd', 'p-keep', 'p-r', 'p-s']) uid[p] = makeUser(p);
});

afterAll(() => {
  researchDb._reset();
  researchConsentText._setTestApprovedTexts(null);
  serverCommit._setTestServerCommit(null);
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

beforeEach(() => {
  sessions().exec(
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
  for (const s of ['', '-wal', '-shm', '-journal'])
    fs.rmSync(`${files.stagingPath}${s}`, { force: true });
  fs.rmSync(files.backupsDir, { recursive: true, force: true });
  consent(uid['p-wd']);
  recordEvent('p-wd', 'SENTINEL-WD-1');
  consent(uid['p-keep']);
  recordEvent('p-keep', 'SENTINEL-KEEP-1');
});

describe('research-restore.js', () => {
  it('T9: restoring a pre-withdrawal copy removes the withdrawn rows again, before the file goes live', async () => {
    const interval = consent(uid['p-r']);
    recordEvent('p-r', 'SENTINEL-RESTORE');
    const key = keyOf(interval);
    const C = await freshCopy();
    expect(holdsIn(C, 'SENTINEL-RESTORE')).toBe(true); // control: the copy predates the withdrawal
    researchConsent.withdraw({ userId: uid['p-r'], nowMs: Date.now() });
    expect(
      runWithdrawal({ researchPath, sessionsPath: editorialPath, write: true, busyTimeoutMs: 100 })
        .ok
    ).toBe(true);
    expect(liveHolds('SENTINEL-RESTORE')).toBe(false);
    const recordedBefore = deletionsFor(interval).length;

    const r = restore({ from: C });
    expect(r.ok, JSON.stringify(r)).toBe(true);
    expect(r.current).toBe('deleted');
    expect(liveHolds('SENTINEL-RESTORE')).toBe(false);
    expect(liveHolds(key)).toBe(false);
    expect(liveHolds('SENTINEL-KEEP-1')).toBe(true); // control
    expect(fs.readdirSync(files.backupsDir)).toEqual([path.basename(C)]); // nothing set aside
    expect(stagingLeft()).toEqual([]);
    expect(fs.existsSync(files.walPath)).toBe(false);
    expect(deletionsFor(interval).length).toBe(recordedBefore + 1); // the purge ran on the restored file
  });

  it("a live file still holding a due interval's rows is deleted, not kept (decision 32)", async () => {
    const interval = consent(uid['p-s']);
    recordEvent('p-s', 'SENTINEL-DUE');
    const key = keyOf(interval);
    const C = await freshCopy();
    researchConsent.withdraw({ userId: uid['p-s'], nowMs: Date.now() }); // and no deletion runs
    expect(liveHolds('SENTINEL-DUE')).toBe(true); // control

    const r = restore({ from: C });
    expect(r.ok, JSON.stringify(r)).toBe(true);
    expect(r.current).toBe('deleted');
    expect(
      typeof sessions()
        .prepare('SELECT deletion_done_at_ms FROM research_consent WHERE id = ?')
        .get(interval).deletion_done_at_ms
    ).toBe('number');
    expect(deletionsFor(interval)).toHaveLength(1);
    for (const f of filesUnder(files.dir).filter((p) => p !== C)) {
      expect(holdsIn(f, 'SENTINEL-DUE'), f).toBe(false);
      expect(holdsIn(f, key), f).toBe(false);
    }
    expect(holdsIn(C, 'SENTINEL-DUE')).toBe(true); // it predates the withdrawal and ages out by its stamp
  });

  it('refuses while the service is active', async () => {
    const C = await freshCopy();
    const live = fs.readFileSync(researchPath);
    expect(restore({ from: C, exec: active })).toEqual({ ok: false, refused: 'SERVICE_ACTIVE' });
    expect(fs.readFileSync(researchPath)).toEqual(live);
    expect(stagingLeft()).toEqual([]);
  });

  // Review finding (2026-11-08): the one guard against swapping the file under a live server refused only when
  // systemctl positively printed an active state, so a timeout, a permission error or a missing systemctl proceeded.
  it('refuses unless systemctl positively reports the service stopped (fail closed)', async () => {
    const C = await freshCopy();
    const live = fs.readFileSync(researchPath);
    const answers = [
      { ran: true, code: null, stdout: '', stderr: '' }, // timed out
      { ran: true, code: 1, stdout: '', stderr: 'Access denied' },
      { ran: true, code: 0, stdout: 'maintenance\n', stderr: '' },
      { ran: false, code: null, stdout: '', stderr: '' }, // no systemctl here
    ];
    for (const answer of answers) {
      expect(restore({ from: C, exec: () => answer }), JSON.stringify(answer)).toMatchObject({
        ok: false,
        refused: 'SERVICE_STATE_UNKNOWN',
      });
    }
    expect(fs.readFileSync(researchPath)).toEqual(live);
    expect(stagingLeft()).toEqual([]);
    // Control: each stopped state proceeds (a dry run, so nothing is written).
    for (const word of ['inactive', 'failed', 'unknown']) {
      const stopped = () => ({ ran: true, code: 3, stdout: `${word}\n`, stderr: '' });
      expect(restore({ from: C, exec: stopped, write: false }).ok, word).toBe(true);
    }
  });

  it('restores only from one of its copies', async () => {
    const C = await freshCopy();
    const outside = path.join(tmpRoot, path.basename(C));
    fs.copyFileSync(C, outside);
    const partial = path.join(files.backupsDir, `${copyName(Date.now() - 60_000)}.partial`);
    fs.copyFileSync(C, partial);
    for (const from of [researchPath, outside, partial]) {
      expect(restore({ from }), from).toEqual({ ok: false, refused: 'NOT_A_COPY' });
    }
  });

  it('refuses a copy that fails verification', async () => {
    const C = await freshCopy();
    const bad = path.join(files.backupsDir, copyName(Date.now() - 60_000));
    const buf = fs.readFileSync(C);
    const raw = (buf[16] << 8) | buf[17];
    const pageSize = raw === 1 ? 65536 : raw;
    const offset = buf.length >= pageSize * 2 ? pageSize : 100; // start of page 2
    buf[offset] ^= 0xff;
    fs.writeFileSync(bad, buf);
    const live = fs.readFileSync(researchPath);
    expect(restore({ from: bad })).toMatchObject({ ok: false, refused: 'COPY_INVALID' });
    expect(fs.readFileSync(researchPath)).toEqual(live);
  });

  it('a purge that fails leaves the live file untouched and removes the staged copy (decision 32)', async () => {
    const C = await freshCopy();
    const live = fs.readFileSync(researchPath);
    const r = restore({ from: C, deps: { runWithdrawal: () => ({ ok: false }), runRetention } });
    expect(r).toMatchObject({ ok: false, refused: 'PURGE_FAILED' });
    expect(fs.readFileSync(researchPath)).toEqual(live);
    expect(stagingLeft()).toEqual([]); // it may hold withdrawn rows
  });

  it('a dry run writes nothing', async () => {
    const C = await freshCopy();
    researchDb._reset(); // close the server's handle first: closing it removes the -wal/-shm, which is not the dry run
    const before = filesUnder(files.dir).sort();
    const r = restore({ from: C, write: false });
    expect(r).toMatchObject({
      ok: true,
      staging: files.stagingPath,
      current: 'present',
      write: false,
    });
    expect(filesUnder(files.dir).sort()).toEqual(before);
  });

  it('the command line', async () => {
    const C = await freshCopy();
    const cli = (args) =>
      spawnSync(process.execPath, [SCRIPT_PATH, ...args], {
        env: { ...process.env, SESSIONS_DB_PATH: editorialPath },
        encoding: 'utf8',
      });
    expect(cli([]).status).toBe(2);
    expect(cli(['--from', C, '--force']).status).toBe(2);
    const dry = cli(['--from', C]);
    expect(dry.status, dry.stdout + dry.stderr).toBe(0);
    expect(JSON.parse(dry.stdout).write).toBe(false);
  });
});
