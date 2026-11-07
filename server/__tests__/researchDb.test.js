// server/__tests__/researchDb.test.js — spec §5.1 (G1.2 PR3, Task 6)
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { vi } from 'vitest';
import { createRequire } from 'module';
import fs from 'fs';
import os from 'os';
import path from 'path';
const require = createRequire(import.meta.url);

// Never let anything here open the real handle under pipeline-output/.
const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'research-db-'));
process.env.SESSIONS_DB_PATH = path.join(tmpRoot, 'sessions.db');

const Database = require('better-sqlite3');
const { runAllMigrations } = require('../services/migrationRunner');
const { resolveResearchDbPath } = require('../lib/researchDbPath');
const { ensureResearchSchema } = require('../lib/researchSchema');
const researchDb = require('../services/researchDb');

const { researchPath, editorialPath } = resolveResearchDbPath();
let editorial;
let golden;

const EVENT_BASE = {
  key_seq: 1,
  event_type: 't',
  editor_key: 'a'.repeat(32),
  server_time_ms: 1,
  replayed: 0,
  book: 'b',
  chapter: 1,
  module_id: 'm',
  flag_snapshot_json: '{}',
  commit_source: 'unknown',
};
const rmResearch = () => {
  for (const s of ['', '-wal', '-shm']) fs.rmSync(`${researchPath}${s}`, { force: true });
};
const plantConsent = () => {
  editorial
    .prepare(
      `INSERT INTO research_consent (user_id, decision, interval_id, consent_text_version,
         consent_text_sha256, given_at_ms) VALUES (1, 'consented', 1, 'v', ?, 1)`
    )
    .run('a'.repeat(64));
  editorial.prepare('UPDATE research_consent SET interval_id = id').run();
};

beforeAll(() => {
  runAllMigrations();
  editorial = new Database(editorialPath);
  const goldenPath = path.join(tmpRoot, 'golden.db');
  const g = new Database(goldenPath); // default rollback-journal mode: the file holds the whole schema
  ensureResearchSchema(g);
  g.close();
  golden = goldenPath;
});

afterEach(() => {
  researchDb._reset();
  researchDb._setTestPaths(null);
  vi.useRealTimers();
  rmResearch();
  editorial.prepare('DELETE FROM research_consent').run();
});

afterAll(() => {
  editorial.close();
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

const catchErr = (fn) => {
  try {
    fn();
  } catch (e) {
    return e;
  }
  return null;
};

describe('opening (spec §5.1)', () => {
  it('creates the file 0600 when no consent exists, in WAL, with the short wait and safe integers', () => {
    expect(researchDb.openAtBoot()).toEqual({ ok: true });
    expect(fs.statSync(researchPath).mode & 0o777).toBe(0o600);
    const h = researchDb.getHandle();
    h.prepare('INSERT INTO editor_keys (interval_id, editor_key) VALUES (1, ?)').run(
      'a'.repeat(32)
    );
    for (const s of ['-wal', '-shm']) {
      if (fs.existsSync(`${researchPath}${s}`)) {
        expect(fs.statSync(`${researchPath}${s}`).mode & 0o777).toBe(0o600);
      }
    }
    expect(h.pragma('journal_mode', { simple: true })).toBe('wal');
    expect(researchDb.BUSY_TIMEOUT_MS).toBe(100);
    expect(h.pragma('busy_timeout', { simple: true })).toBe(BigInt(researchDb.BUSY_TIMEOUT_MS));
    expect(h.pragma('user_version', { simple: true })).toBe(1n);
  });

  it('ids above 2^53 survive the round trip; a plain read would not (decision 4)', () => {
    researchDb.openAtBoot();
    const h = researchDb.getHandle();
    h.prepare('INSERT INTO editor_keys (interval_id, editor_key) VALUES (1, ?)').run(
      'a'.repeat(32)
    );
    const cols = Object.keys(EVENT_BASE);
    h.prepare(
      `INSERT INTO research_events (id, ${cols.join(', ')}) VALUES (?, ${cols.map(() => '?').join(', ')})`
    ).run(9007199254740993n, ...cols.map((c) => EVENT_BASE[c]));
    expect(h.prepare('SELECT id FROM research_events').get().id).toBe(9007199254740993n);
    h.pragma('wal_checkpoint(TRUNCATE)');
    const plain = new Database(researchPath, { readonly: true });
    try {
      expect(plain.prepare('SELECT id FROM research_events').get().id).toBe(9007199254740992);
    } finally {
      plain.close();
    }
  });

  it('a missing file is never recreated while a consented row exists (spec §5.1)', () => {
    plantConsent();
    expect(researchDb.openAtBoot()).toEqual({ ok: false, reason: 'missing' });
    expect(fs.existsSync(researchPath)).toBe(false);
    const err = catchErr(() => researchDb.getHandle());
    expect([err.code, err.reason]).toEqual(['RESEARCH_UNAVAILABLE', 'missing']);
    expect(fs.existsSync(researchPath)).toBe(false);
  });

  it('an existing file with no schema is not initialised while a consented row exists', () => {
    plantConsent();
    fs.writeFileSync(researchPath, '');
    expect(researchDb.openAtBoot()).toEqual({ ok: false, reason: 'missing' });
    expect(fs.statSync(researchPath).size).toBe(0);
    const c = new Database(researchPath, { readonly: true });
    try {
      expect(
        c.prepare("SELECT count(*) AS n FROM sqlite_master WHERE type = 'table'").get().n
      ).toBe(0);
    } finally {
      c.close();
    }
  });

  it('control: the same empty file, with no consented row, is initialised', () => {
    fs.writeFileSync(researchPath, '');
    expect(researchDb.openAtBoot()).toEqual({ ok: true });
    const h = researchDb.getHandle();
    expect(
      h.prepare("SELECT name FROM sqlite_master WHERE name = 'research_events'").all()
    ).toHaveLength(1);
  });

  it('an unreadable consent table leaves the file uncreated', () => {
    editorial.exec('ALTER TABLE research_consent RENAME TO rc_hidden');
    try {
      expect(researchDb.openAtBoot()).toEqual({ ok: false, reason: 'consent-unavailable' });
      expect(fs.existsSync(researchPath)).toBe(false);
    } finally {
      editorial.exec('ALTER TABLE rc_hidden RENAME TO research_consent');
    }
  });

  it('retries at most once a minute, and success clears the state', () => {
    const T = 1_800_000_000_000;
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(T);
    plantConsent();
    expect(catchErr(() => researchDb.getHandle()).reason).toBe('missing');
    expect(researchDb.status().lastAttemptAtMs).toBe(T);
    fs.copyFileSync(golden, researchPath);
    vi.setSystemTime(T + 30_000);
    expect(catchErr(() => researchDb.getHandle()).code).toBe('RESEARCH_UNAVAILABLE');
    expect(researchDb.status().lastAttemptAtMs).toBe(T);
    vi.setSystemTime(T + 60_000);
    expect(researchDb.getHandle().open).toBe(true);
    expect(researchDb.status().state).toBe('open');
  });

  it('a corrupt file stays unavailable until a restart', () => {
    const T = 1_800_000_000_000;
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(T);
    fs.writeFileSync(researchPath, 'not a database '.repeat(300));
    expect(researchDb.openAtBoot()).toEqual({ ok: false, reason: 'corrupt' });
    expect(researchDb.status().sticky).toBe(true);
    fs.copyFileSync(golden, researchPath);
    vi.setSystemTime(T + 120_000);
    expect(catchErr(() => researchDb.getHandle()).reason).toBe('corrupt');
    researchDb._reset();
    expect(researchDb.getHandle().open).toBe(true);
  });

  it('a newer schema is unavailable', () => {
    const g = new Database(researchPath);
    g.pragma('user_version = 2');
    g.close();
    expect(researchDb.openAtBoot()).toEqual({ ok: false, reason: 'unavailable' });
  });

  it('a file that cannot be created is unavailable, never a raw error (decision 20)', () => {
    researchDb._setTestPaths({
      researchPath: path.join(tmpRoot, 'no-such-dir', 'r.db'),
      editorialPath,
    });
    const err = catchErr(() => researchDb.getHandle());
    expect([err.code, err.reason]).toEqual(['RESEARCH_UNAVAILABLE', 'unavailable']);
    expect(researchDb.status()).toMatchObject({ state: 'unavailable', reason: 'unavailable' });
  });
});

describe('noteFailure and the seams', () => {
  it('noteFailure: corrupt is sticky, busy keeps the handle', () => {
    researchDb.openAtBoot();
    researchDb.noteFailure({ code: 'SQLITE_BUSY' });
    expect(researchDb.status().state).toBe('open');
    researchDb.noteFailure({ code: 'SQLITE_CORRUPT' });
    expect(researchDb.status()).toMatchObject({
      state: 'unavailable',
      sticky: true,
      reason: 'corrupt',
    });
  });

  it('noteFailure: an I/O error closes the handle and waits its minute', () => {
    const T = 1_800_000_000_000;
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(T);
    researchDb.openAtBoot();
    const h = researchDb.getHandle();
    vi.setSystemTime(T + 45_000); // the minute runs from the FAILURE, not from the open
    researchDb.noteFailure({ code: 'SQLITE_IOERR_WRITE' });
    expect(h.open).toBe(false);
    expect(researchDb.status()).toMatchObject({
      state: 'unavailable',
      sticky: false,
      lastAttemptAtMs: T + 45_000,
    });
    expect(catchErr(() => researchDb.getHandle()).reason).toBe('unavailable');
    vi.setSystemTime(T + 90_000);
    expect(catchErr(() => researchDb.getHandle()).reason).toBe('unavailable');
    vi.setSystemTime(T + 105_000);
    expect(researchDb.getHandle().open).toBe(true);
  });

  it('noteFailure: a database moved under the handle closes it and reads as missing (final review M8)', () => {
    const T = 1_800_000_000_000;
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(T);
    researchDb.openAtBoot();
    const h = researchDb.getHandle();
    researchDb.noteFailure({ code: 'SQLITE_READONLY_DBMOVED' });
    expect(h.open).toBe(false);
    expect(researchDb.status()).toMatchObject({
      state: 'unavailable',
      reason: 'missing',
      sticky: false,
      lastAttemptAtMs: T,
    });
  });

  it('refuses a research path equal to the editorial one (spec §5.1; T10)', () => {
    const names = () => {
      const c = new Database(editorialPath, { readonly: true });
      try {
        return c.prepare('SELECT name FROM sqlite_master ORDER BY name').all();
      } finally {
        c.close();
      }
    };
    const before = names();
    researchDb._setTestPaths({ researchPath: editorialPath, editorialPath });
    expect(researchDb.openAtBoot()).toEqual({ ok: false, reason: 'same-path' });
    expect(names()).toEqual(before);
    researchDb._setTestPaths(null);
    expect(researchDb.openAtBoot()).toEqual({ ok: true });
  });

  it('_setTestPaths drops an open handle, so the next getHandle uses the new paths', () => {
    expect(researchDb.openAtBoot()).toEqual({ ok: true });
    const h = researchDb.getHandle();
    expect(h.open).toBe(true);
    researchDb._setTestPaths({ researchPath: '/nonexistent/dir/r.db', editorialPath });
    expect(h.open).toBe(false);
    expect(catchErr(() => researchDb.getHandle()).code).toBe('RESEARCH_UNAVAILABLE');
    researchDb._setTestPaths(null);
    const h2 = researchDb.getHandle();
    expect([h2.open, h2.name]).toEqual([true, researchPath]);
  });
});

describe('the boot step in index.js (spec §5.1)', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'index.js'), 'utf8');
  it('opens the research file after the editorial migrations and before listening', () => {
    expect(src).toContain("require('./services/researchDb')");
    const b = src.indexOf('openAtBoot(');
    const f = src.indexOf('failLoudOnMigrationErrors(');
    const l = src.indexOf('app.listen(');
    expect([f > -1 && f < b, b < l]).toEqual([true, true]);
  });
  // The shape the boot step must keep: a try wrapping the call, and nothing after the call that can stop the boot.
  const bootShapeOk = (text) => {
    const b = text.indexOf('openAtBoot(');
    const f = text.indexOf('failLoudOnMigrationErrors(');
    const e = text.indexOf("const express = require('express')", b);
    if (b < 0 || f < 0 || e < 0 || f > b) return false;
    const tryAt = text.lastIndexOf('try {', b);
    if (tryAt < f) return false; // a try after the migrations call and before openAtBoot(
    const before = text.slice(tryAt, b);
    const after = text.slice(b, e);
    return !/\breturn\b|process\.exit|\bthrow\b/.test(before + after);
  };
  it('cannot be stopped by it: a try wraps the call, and no return, exit or throw follows it', () => {
    expect(bootShapeOk(src)).toBe(true);
  });
  it('the shape check rejects a process.exit after the call', () => {
    expect(bootShapeOk(src.replace('openAtBoot();', 'openAtBoot(); process.exit(1);'))).toBe(false);
  });
  it('the shape check rejects a top-level return after the call', () => {
    expect(
      bootShapeOk(
        src.replace(
          "const express = require('express');",
          "return;\nconst express = require('express');"
        )
      )
    ).toBe(false);
  });
  it('the shape check rejects a removed try', () => {
    const b = src.indexOf('openAtBoot(');
    const t = src.lastIndexOf('try {', b);
    expect(bootShapeOk(src.slice(0, t) + '{' + src.slice(t + 5))).toBe(false);
  });
});
