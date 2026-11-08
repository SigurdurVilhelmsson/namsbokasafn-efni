/**
 * The shared purge steps: compact, byte scan, empty the exports (G1.1 + G1.2 spec §5.15 steps 2–4,
 * §9 G-2; PR4 Task 5, decisions 5 and 7).
 *
 * Each case builds its own research-shaped file in its own temp directory. bytesHave reads the
 * file and its -wal, the two places §5.15 says a deleted row's bytes can survive.
 */
import { describe, it, expect, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const Database = require('better-sqlite3');
const {
  checkpointBusy,
  compact,
  scanForKeys,
  emptyExports,
} = require('../scripts/lib/researchPurge');

const K1 = 'a1b2c3d4e5f60718293a4b5c6d7e8f90';
const K2 = 'b'.repeat(32);
const K3 = 'c'.repeat(32);

const dirs = [];
const handles = [];
afterEach(() => {
  while (handles.length) {
    const db = handles.pop();
    if (db.open) {
      if (db.inTransaction) db.exec('ROLLBACK');
      db.close();
    }
  }
  while (dirs.length) fs.rmSync(dirs.pop(), { recursive: true, force: true });
});

function tempDir() {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'research-purge-'));
  dirs.push(d);
  return d;
}
const openDb = (p, opts) => {
  const db = new Database(p, opts);
  handles.push(db);
  return db;
};
/** A research-shaped file in WAL mode, with its table; the handle stays open. */
function walFile({ timeout } = {}) {
  const p = path.join(tempDir(), 'research.db');
  const db = openDb(p, timeout === undefined ? {} : { timeout });
  db.pragma('journal_mode = WAL');
  db.exec('CREATE TABLE t (k TEXT, x TEXT)');
  return { p, db };
}
function bytesHave(p, s) {
  const needle = Buffer.from(s, 'ascii');
  return [p, `${p}-wal`].some((f) => fs.existsSync(f) && fs.readFileSync(f).includes(needle));
}
const userVersion = (db) => Number(db.pragma('user_version', { simple: true }));

describe('researchPurge', () => {
  it('compaction removes deleted bytes from the file and its WAL; a DELETE alone does not (G-2; measured)', () => {
    const { p, db } = walFile();
    const insert = db.prepare('INSERT INTO t (k, x) VALUES (?, ?)');
    for (let i = 0; i < 50; i++) insert.run(K1, `SENTINEL-PURGE ${'x'.repeat(200)}`);
    db.exec('DELETE FROM t');
    // The control: deleted, and still on disk.
    expect(bytesHave(p, 'SENTINEL-PURGE')).toBe(true);

    expect(compact(db)).toEqual({ ok: true });
    expect(bytesHave(p, 'SENTINEL-PURGE')).toBe(false);
    expect(bytesHave(p, K1)).toBe(false);
    expect(fs.statSync(`${p}-wal`).size).toBe(0);
  });

  it('a reader holding a transaction makes the first checkpoint busy, and compaction stops before VACUUM', () => {
    const { p, db } = walFile({ timeout: 100 });
    db.prepare('INSERT INTO t (k, x) VALUES (?, ?)').run(K1, 'row');
    const reader = openDb(p);
    reader.exec('BEGIN');
    reader.prepare('SELECT * FROM t').all();

    expect(compact(db)).toEqual({ ok: false, step: 'checkpoint-1' });
    reader.exec('COMMIT');
    // Control: the same compaction passes once the reader is gone.
    expect(compact(db)).toEqual({ ok: true });
  });

  it('a reader that began while the WAL was empty is still seen (read-lock 0; decision 5)', () => {
    const p = path.join(tempDir(), 'research.db');
    const writer = openDb(p);
    writer.pragma('journal_mode = WAL');
    writer.exec('CREATE TABLE t (k TEXT, x TEXT)');
    writer.prepare('INSERT INTO t (k, x) VALUES (?, ?)').run(K1, 'row');
    writer.close(); // the last connection: no -wal left
    expect(fs.existsSync(`${p}-wal`)).toBe(false);

    const reader = openDb(p);
    reader.exec('BEGIN');
    reader.prepare('SELECT * FROM t').all();
    const db = openDb(p, { timeout: 100 });

    // The premise, in this fixture: a bare checkpoint of an empty WAL cannot see a lock-0 reader.
    expect(Number(db.pragma('wal_checkpoint(TRUNCATE)')[0].busy)).toBe(0);
    const before = userVersion(db);
    expect(checkpointBusy(db)).toBe(true);
    expect(userVersion(db)).toBe(before); // the frame changed nothing

    reader.exec('COMMIT');
    // Control.
    expect(checkpointBusy(db)).toBe(false);
    expect(fs.statSync(`${p}-wal`).size).toBe(0);
  });

  it('an idle second connection does not make it busy', () => {
    const { p, db } = walFile({ timeout: 100 });
    db.prepare('INSERT INTO t (k, x) VALUES (?, ?)').run(K1, 'row');
    const idle = openDb(p);
    idle.prepare('SELECT * FROM t').all();
    expect(idle.inTransaction).toBe(false);
    expect(checkpointBusy(db)).toBe(false);
  });

  it('a writer holding the lock makes it busy, without throwing', () => {
    const { p, db } = walFile({ timeout: 100 });
    const other = openDb(p);
    other.exec('BEGIN IMMEDIATE');
    expect(checkpointBusy(db)).toBe(true);
    other.exec('COMMIT');
    expect(checkpointBusy(db)).toBe(false);
  });

  it('a rollback-journal file compacts', () => {
    const p = path.join(tempDir(), 'research.db');
    const db = openDb(p);
    db.exec('CREATE TABLE t (k TEXT, x TEXT)');
    db.prepare('INSERT INTO t (k, x) VALUES (?, ?)').run(K1, 'row');
    expect(db.pragma('journal_mode', { simple: true })).toBe('delete');
    expect(compact(db)).toEqual({ ok: true });
  });

  it('scanForKeys finds a key wherever SQLite put it, and only those given', () => {
    const d = tempDir();
    const a = path.join(d, 'a');
    const b = path.join(d, 'b');
    const c = path.join(d, 'c'); // absent
    fs.writeFileSync(a, `prefix ${K1} suffix`);
    fs.writeFileSync(b, Buffer.concat([Buffer.from([0, 1, 2]), Buffer.from(K2, 'ascii')]));
    expect(scanForKeys([a, b, c], [K2, K1, K3, K1])).toEqual([K1, K2].sort());
    expect(scanForKeys([c], [K1])).toEqual([]);
  });

  it('emptyExports empties the directory, keeps it, and never follows a link', () => {
    const d = tempDir();
    const exportsDir = path.join(d, 'research-exports');
    expect(emptyExports(exportsDir)).toBe('absent');
    expect(fs.existsSync(exportsDir)).toBe(false);

    const outside = path.join(d, 'outside');
    fs.mkdirSync(outside);
    fs.writeFileSync(path.join(outside, 'keep.txt'), 'kept bytes');
    fs.mkdirSync(path.join(exportsDir, 'sub'), { recursive: true });
    fs.writeFileSync(path.join(exportsDir, 'a.jsonl'), '{}');
    fs.writeFileSync(path.join(exportsDir, 'sub', 'b.jsonl'), '{}');
    fs.symlinkSync(path.join(outside, 'keep.txt'), path.join(exportsDir, 'link'));
    const served = path.join(d, 'served-version-exports');
    fs.mkdirSync(served);
    fs.writeFileSync(path.join(served, 'y.jsonl'), 'served bytes');

    expect(emptyExports(exportsDir)).toBe('emptied');
    expect(fs.existsSync(exportsDir)).toBe(true);
    expect(fs.readdirSync(exportsDir)).toEqual([]);
    expect(fs.readFileSync(path.join(outside, 'keep.txt'), 'utf8')).toBe('kept bytes');
    // The control at this level: only the named directory is touched.
    expect(fs.readFileSync(path.join(served, 'y.jsonl'), 'utf8')).toBe('served bytes');
  });
});
