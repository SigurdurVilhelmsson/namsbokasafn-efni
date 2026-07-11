import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { mtLockPathFor, isMtLocked, writeMtLock } = require('../lib/mt-lock.cjs');

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
