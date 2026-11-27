// server/__tests__/editorialBackupCopy.test.js — G1.20 Task 2. Synthetic databases only.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import crypto from 'crypto';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const Database = require('better-sqlite3');
const freshMigratedDb = require('./helpers/freshMigratedDb');
const { takeCopy, retentionDue, main, USAGE } = require('../scripts/editorial-backup');

const NOW = Date.parse('2027-01-02T03:04:05Z');
const TOKEN = 'zq-sentinel-7f3a91';
let tmp;
let dir;
let live;

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'edbk-'));
  dir = path.join(tmp, 'copies');
  live = path.join(tmp, 'live.db');
});
afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

function sink() {
  let s = '';
  return {
    write: (c) => (s += c),
    get text() {
      return s;
    },
  };
}

describe('takeCopy', () => {
  it("a copy holds live rows only: a deleted row's token is gone from the copy, while the live file still holds it", () => {
    const db = new Database(live);
    db.exec('CREATE TABLE t(id INTEGER PRIMARY KEY, v TEXT)');
    const ins = db.prepare('INSERT INTO t(v) VALUES (?)');
    for (let i = 0; i < 200; i++) ins.run(i === 100 ? TOKEN.repeat(120) : `row ${i}`);
    db.prepare('DELETE FROM t WHERE id = 101').run();
    db.close();
    const r = takeCopy({ sessionsPath: live, dir, nowMs: NOW });
    expect(r.ok).toBe(true);
    expect(fs.readFileSync(live).includes(Buffer.from(TOKEN))).toBe(true); // control
    expect(fs.readFileSync(r.path).includes(Buffer.from(TOKEN))).toBe(false);
  });

  it('a copy equals its source by value, table by table, including a table with no integer key', () => {
    const db = new Database(live);
    db.exec('CREATE TABLE t1(id INTEGER PRIMARY KEY, v TEXT); CREATE TABLE t2(a TEXT, b TEXT)');
    for (let i = 0; i < 30; i++) {
      db.prepare('INSERT INTO t1(v) VALUES (?)').run(`v${i}`);
      db.prepare('INSERT INTO t2(a, b) VALUES (?, ?)').run(`a${i}`, `b${i % 3}`);
    }
    db.exec("DELETE FROM t1 WHERE id % 4 = 0; DELETE FROM t2 WHERE a LIKE 'a1%'");
    const r = takeCopy({ sessionsPath: live, dir, nowMs: NOW });
    expect(r.ok).toBe(true);
    const copy = new Database(r.path, { readonly: true });
    const rows = (d, sql) => d.prepare(sql).all();
    const q1 = 'SELECT * FROM t1 ORDER BY id, v';
    const q2 = 'SELECT * FROM t2 ORDER BY a, b';
    expect(rows(copy, q1)).toEqual(rows(db, q1));
    expect(rows(copy, q2)).toEqual(rows(db, q2));
    expect(rows(copy, q2).length).toBeGreaterThan(0);
    copy.close();
    db.close();
  });

  it('the copy is 0600, journal_mode delete, integrity ok, named sessions.<UTC stamp>.db', () => {
    const db = new Database(live);
    db.exec('CREATE TABLE t(x)');
    db.close();
    const r = takeCopy({ sessionsPath: live, dir, nowMs: Date.parse('2027-01-02T03:04:05Z') });
    expect(path.basename(r.path)).toBe('sessions.2027-01-02-030405.db');
    expect(fs.statSync(r.path).mode & 0o777).toBe(0o600);
    const c = new Database(r.path, { readonly: true });
    expect(c.pragma('journal_mode', { simple: true })).toBe('delete');
    expect(c.pragma('integrity_check', { simple: true })).toBe('ok');
    c.close();
    expect(fs.readdirSync(dir).filter((n) => /-(wal|shm|journal)$/.test(n))).toEqual([]);
  });

  it('refuses a name already taken and leaves the existing copy untouched', () => {
    const db = new Database(live);
    db.exec('CREATE TABLE t(x)');
    db.close();
    const a = takeCopy({ sessionsPath: live, dir, nowMs: NOW });
    const sha = () => crypto.createHash('sha256').update(fs.readFileSync(a.path)).digest('hex');
    const before = sha();
    expect(takeCopy({ sessionsPath: live, dir, nowMs: NOW })).toEqual({
      ok: false,
      reason: 'name-taken',
    });
    expect(sha()).toBe(before);
  });

  it('a copy that fails AFTER its partial exists removes the partial and its side files', () => {
    const db = new Database(live);
    db.exec('CREATE TABLE t(id INTEGER PRIMARY KEY, v TEXT)');
    const ins = db.prepare('INSERT INTO t(v) VALUES (?)');
    for (let i = 0; i < 2000; i++) ins.run(`row ${i} `.repeat(20));
    db.close();
    // damage every page after the first two: the schema still opens, the VACUUM read does not
    const buf = fs.readFileSync(live);
    buf.fill(0xff, 8192);
    fs.writeFileSync(live, buf);
    const r = takeCopy({ sessionsPath: live, dir, nowMs: NOW });
    expect(r.ok).toBe(false);
    expect(r.reason).not.toBe('name-taken');
    expect(fs.readdirSync(dir)).toEqual([]);
  });

  it('a partial another run created is left untouched: name-taken, same bytes', () => {
    const db = new Database(live);
    db.exec('CREATE TABLE t(x)');
    db.close();
    fs.mkdirSync(dir, { recursive: true });
    const other = path.join(dir, 'sessions.2027-01-02-030405.db.partial');
    fs.writeFileSync(other, 'another run in flight');
    expect(takeCopy({ sessionsPath: live, dir, nowMs: NOW })).toEqual({
      ok: false,
      reason: 'name-taken',
    });
    expect(fs.readFileSync(other, 'utf8')).toBe('another run in flight');
  });

  it('an unusable backup directory is a failed copy, not a throw', () => {
    fs.writeFileSync(dir, 'a file where the directory should be');
    const r = takeCopy({ sessionsPath: live, dir, nowMs: NOW });
    expect(r.ok).toBe(false);
  });

  it('a failed copy leaves no partial file', () => {
    const r = takeCopy({ sessionsPath: path.join(dir, 'missing.db'), dir, nowMs: NOW });
    expect(r.ok).toBe(false);
    expect(fs.readdirSync(dir).filter((n) => n.includes('.partial'))).toEqual([]);
  });
});

describe('retentionDue', () => {
  it('nothing due on a migrated database before 2028', () => {
    const { db, path: p } = freshMigratedDb();
    db.close();
    expect(retentionDue({ sessionsPath: p, nowMs: Date.parse('2027-06-01T00:00:00Z') })).toEqual({
      due: false,
      steps: [],
    });
  });

  it('the named step is due on a migrated database after its date and unrecorded', () => {
    const { db, path: p } = freshMigratedDb();
    db.close();
    const r = retentionDue({ sessionsPath: p, nowMs: Date.parse('2029-02-01T00:00:00Z') });
    expect(r.due).toBe(true);
    expect(r.steps).toContain('named');
  });

  it('a database it cannot read counts as due (fail closed)', () => {
    const db = new Database(live);
    db.exec('CREATE TABLE t(x)');
    db.close();
    // before 2028 no step reads a table, so an unreadable database is only observable after a step's date
    const r = retentionDue({ sessionsPath: live, nowMs: Date.parse('2029-02-01T00:00:00Z') });
    expect(r.due).toBe(true);
    expect(r.error).toBeTruthy();
  });
});

describe('main', () => {
  const run = async (args, at = '2029-02-01T00:00:00Z') => {
    const out = sink();
    const err = sink();
    const code = await main(['node', 'editorial-backup.js', ...args], {
      out,
      err,
      nowMs: () => Date.parse(at),
    });
    return { code, out: out.text, err: err.text };
  };
  const bare = () => {
    const db = new Database(live);
    db.exec('CREATE TABLE t(x)');
    db.close();
  };

  it('copy prints only the path and exits 0', async () => {
    bare();
    const r = await run(['copy', live, dir]);
    expect(r.code).toBe(0);
    expect(r.out).toBe(`${path.join(dir, fs.readdirSync(dir)[0])}\n`);
    expect(r.err).toBe('');
  });

  it('retention-due exits 1 on a bare database, naming it unknown', async () => {
    bare();
    const r = await run(['retention-due', live]);
    expect(r.code).toBe(1);
    expect(r.err).toMatch(/^editorial-backup: retention unknown \(.+\)\n$/);
  });

  it('retention-due exits 0 when nothing is due', async () => {
    const { db, path: p } = freshMigratedDb();
    db.close();
    expect((await run(['retention-due', p], '2027-06-01T00:00:00Z')).code).toBe(0);
  });

  it('a wrong argument count exits 2 with USAGE on stderr', async () => {
    const r = await run(['copy', live]);
    expect(r.code).toBe(2);
    expect(r.err).toBe(`${USAGE}\n`);
    expect((await run([])).code).toBe(2);
  });

  it('a failed copy exits 1 with the reason on stderr', async () => {
    const r = await run(['copy', path.join(tmp, 'nope.db'), dir]);
    expect(r.code).toBe(1);
    expect(r.err).toMatch(/^editorial-backup: no copy \(.+\)\n$/);
    expect(r.out).toBe('');
  });
});
