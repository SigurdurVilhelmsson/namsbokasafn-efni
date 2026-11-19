import { describe, it, expect, afterEach, vi } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync, readFileSync, utimesSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const {
  mtLockPathFor,
  isMtLocked,
  writeMtLock,
  FREEZE_LOCK_BODY,
  freezeLockState,
  writeFreezeLock,
} = require('../lib/mt-lock.cjs');

const dirs = [];
afterEach(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
  dirs.length = 0;
});
function tmp() {
  const d = mkdtempSync(path.join(tmpdir(), 'mtlock-'));
  dirs.push(d);
  return d;
}

describe('mt-lock', () => {
  it('derives the .locked sibling from an mtOutput path', () => {
    const p = '/x/books/b/02-mt-output/ch01/m68664-segments.is.md';
    expect(mtLockPathFor(p)).toBe('/x/books/b/02-mt-output/ch01/m68664-segments.locked');
  });
  it('isMtLocked is false when no marker exists', () => {
    const mt = path.join(tmp(), 'm1-segments.is.md');
    expect(isMtLocked(mt)).toBe(false);
  });
  it('writeMtLock creates the marker; isMtLocked then true; second write is a no-op', () => {
    const mt = path.join(tmp(), 'm1-segments.is.md');
    writeMtLock(mt, { reason: 'editing-started', firstEditId: 7 });
    expect(isMtLocked(mt)).toBe(true);
    const lock = mtLockPathFor(mt);
    const first = require('fs').readFileSync(lock, 'utf8');
    writeMtLock(mt, { reason: 'again', firstEditId: 99 }); // idempotent
    expect(require('fs').readFileSync(lock, 'utf8')).toBe(first);
  });
  it('indeterminate marker (unparseable) is treated as LOCKED (fail-safe)', () => {
    const mt = path.join(tmp(), 'm1-segments.is.md');
    writeFileSync(mtLockPathFor(mt), '{ this is not json');
    expect(isMtLocked(mt)).toBe(true);
  });
});

describe('freeze marker (G1.7)', () => {
  it('FREEZE_LOCK_BODY is the constant, parses, and holds no date', () => {
    expect(FREEZE_LOCK_BODY).toBe('{\n  "reason": "freeze"\n}\n');
    expect(JSON.parse(FREEZE_LOCK_BODY)).toEqual({ reason: 'freeze' });
    expect(FREEZE_LOCK_BODY).not.toMatch(/\d{4}-\d{2}-\d{2}/);
  });
  it('absent -> writes exactly the body; state goes absent -> freeze; isMtLocked agrees', () => {
    const mt = path.join(tmp(), 'ch01', 'm1-segments.is.md');
    expect(freezeLockState(mt)).toBe('absent');
    expect(writeFreezeLock(mt)).toBe('written');
    expect(readFileSync(mtLockPathFor(mt), 'utf8')).toBe(FREEZE_LOCK_BODY);
    expect(freezeLockState(mt)).toBe('freeze');
    expect(isMtLocked(mt)).toBe(true);
  });
  it('identical marker -> "already", no write (mtime unchanged)', () => {
    const mt = path.join(tmp(), 'm1-segments.is.md');
    writeFreezeLock(mt);
    const lock = mtLockPathFor(mt);
    const past = new Date('2020-01-01T00:00:00Z');
    utimesSync(lock, past, past);
    expect(writeFreezeLock(mt)).toBe('already');
    expect(statSync(lock).mtimeMs).toBe(past.getTime());
  });
  it('foreign marker -> throws FOREIGN_LOCK, bytes unchanged, message carries no body', () => {
    const mt = path.join(tmp(), 'm1-segments.is.md');
    writeMtLock(mt, { reason: 'editing-started', firstEditId: 7 });
    const lock = mtLockPathFor(mt);
    const before = readFileSync(lock, 'utf8');
    expect(freezeLockState(mt)).toBe('foreign');
    let err;
    try {
      writeFreezeLock(mt);
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(Error);
    expect(err.code).toBe('FOREIGN_LOCK');
    expect(readFileSync(lock, 'utf8')).toBe(before);
    expect(err.message).toContain(lock);
    expect(err.message).not.toContain('lockedAt');
    expect(err.message).not.toContain('firstEditId');
    expect(err.message).not.toContain(JSON.parse(before).lockedAt);
  });
  it('an unreadable or non-JSON marker is foreign, never freeze', () => {
    const mt = path.join(tmp(), 'm1-segments.is.md');
    writeFileSync(mtLockPathFor(mt), 'not json');
    expect(freezeLockState(mt)).toBe('foreign');
  });
});

// The write is an exclusive create: a marker that appears between the state check and the write
// (a first save on the editing path) is re-read, never overwritten. The seam: `mkdirSync` runs
// between the two, so a spy on the shared CommonJS `fs` plants the marker there.
describe('writeFreezeLock when a marker appears between its check and its write', () => {
  const PAST = new Date('2020-01-01T00:00:00Z');
  function plantDuringMkdir(lock, body) {
    const fs = require('fs');
    const realMkdir = fs.mkdirSync;
    return vi.spyOn(fs, 'mkdirSync').mockImplementation((...args) => {
      const r = realMkdir(...args);
      writeFileSync(lock, body);
      utimesSync(lock, PAST, PAST);
      return r;
    });
  }
  it('a freeze marker planted there: "already", and the planted file is not rewritten', () => {
    const mt = path.join(tmp(), 'm1-segments.is.md');
    const lock = mtLockPathFor(mt);
    const spy = plantDuringMkdir(lock, FREEZE_LOCK_BODY);
    let result;
    try {
      result = writeFreezeLock(mt);
    } finally {
      spy.mockRestore();
    }
    expect([result, statSync(lock).mtimeMs]).toEqual(['already', PAST.getTime()]);
  });
  it('a foreign marker planted there: FOREIGN_LOCK, its bytes unchanged, the message path only', () => {
    const mt = path.join(tmp(), 'm1-segments.is.md');
    const lock = mtLockPathFor(mt);
    const body = '{"lockedAt":"2099-01-01T00:00:00.000Z","firstEditId":424242}';
    const spy = plantDuringMkdir(lock, body);
    let err;
    try {
      writeFreezeLock(mt);
    } catch (e) {
      err = e;
    } finally {
      spy.mockRestore();
    }
    expect(readFileSync(lock, 'utf8')).toBe(body);
    expect(err && err.code).toBe('FOREIGN_LOCK');
    expect(err.message).toContain(lock);
    expect(err.message).not.toMatch(/2099|424242|lockedAt/);
  });
});
