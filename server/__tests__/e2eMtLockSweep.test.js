/**
 * E2E stray MT edit-lock sweep (§C118 ⑨).
 *
 * WHY THIS EXISTS. The Playwright suite saves segment edits against the REAL
 * `efnafraedi-2e` book (ux-phase2.spec.js M5, segment-editor.spec.js), and
 * `segmentEditorService`'s first-edit hook writes a `-segments.locked` marker
 * next to that module's MT output. Every run seeds a fresh DB, so "first edit"
 * fires every run. `global-teardown.js` swept only `books/__e2e-fixture__/`,
 * so the real-book marker survived — inside a tree CLAUDE.md marks READ ONLY —
 * and `mtRunDecision` then returns `locked-skip` for that module, silently
 * excluding it from a paid re-MT with every exit code green.
 *
 * ux-phase2.spec.js justified the real-book write with "the module's MT
 * edit-lock marker is committed and writeMtLock no-ops when one exists". That
 * was true when written and is not now: PR #411's Phase 2.1 deleted all seven
 * committed chemistry locks — m68664, the module that spec edits, among them.
 *
 * THE INVARIANT: an E2E run must leave `books/` byte-clean, and must never
 * delete a lock it did not create. Hence the snapshot: a marker present before
 * the run is a real editorial lock and is KEPT; one that appears during the run
 * is this run's litter and is REMOVED. The fixture book is swept
 * unconditionally, preserving the teardown's documented aborted-run cleanup.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(new URL(import.meta.url).pathname);
const sweep = require('../e2e/helpers/mt-lock-sweep.js');

const LOCK = '-segments.locked';
let booksDir;

/** Plant a lock marker for <book>/<chapterDir>/<module> and return its abs path. */
function plantLock(book, chapterDir, moduleId) {
  const dir = path.join(booksDir, book, '02-mt-output', chapterDir);
  fs.mkdirSync(dir, { recursive: true });
  const p = path.join(dir, `${moduleId}${LOCK}`);
  fs.writeFileSync(p, JSON.stringify({ lockedAt: 'x', reason: 'editing-started' }), 'utf8');
  return p;
}

beforeEach(() => {
  booksDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mt-lock-sweep-'));
});

afterEach(() => {
  fs.rmSync(booksDir, { recursive: true, force: true });
});

describe('listLockFiles', () => {
  it('finds a planted marker', () => {
    plantLock('efnafraedi-2e', 'ch01', 'm68664');
    expect(sweep.listLockFiles(booksDir)).toEqual([
      path.join('efnafraedi-2e', '02-mt-output', 'ch01', `m68664${LOCK}`),
    ]);
  });

  it('returns an empty list when the books dir does not exist', () => {
    expect(sweep.listLockFiles(path.join(booksDir, 'nope'))).toEqual([]);
  });

  it('ignores files that are not lock markers', () => {
    const dir = path.join(booksDir, 'efnafraedi-2e', '02-mt-output', 'ch01');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'm68664-segments.is.md'), 'x', 'utf8');
    expect(sweep.listLockFiles(booksDir)).toEqual([]);
  });
});

describe('sweepStrayLocks', () => {
  it('REMOVES a real-book marker that appeared after the snapshot', () => {
    const snapshot = sweep.listLockFiles(booksDir); // empty
    const stray = plantLock('efnafraedi-2e', 'ch01', 'm68664');
    sweep.sweepStrayLocks(booksDir, snapshot);
    expect(fs.existsSync(stray)).toBe(false);
  });

  it('reports the removal, so a caller can log what it did', () => {
    const snapshot = sweep.listLockFiles(booksDir);
    plantLock('efnafraedi-2e', 'ch01', 'm68664');
    const result = sweep.sweepStrayLocks(booksDir, snapshot);
    expect(result.removed).toEqual([
      path.join('efnafraedi-2e', '02-mt-output', 'ch01', `m68664${LOCK}`),
    ]);
  });

  // NON-VACUITY CONTROL. A sweep-everything mutation passes every assertion
  // above and fails here. This is the assertion that makes the others mean
  // something: deleting a real editorial lock is the data loss the marker
  // exists to prevent (`isMtLocked` treats even an unreadable marker as
  // locked — never clobber an edited baseline).
  it('KEEPS a real-book marker that was already present at snapshot time', () => {
    const committed = plantLock('liffraedi-2e', 'ch03', 'm66443');
    const snapshot = sweep.listLockFiles(booksDir);
    sweep.sweepStrayLocks(booksDir, snapshot);
    expect(fs.existsSync(committed)).toBe(true);
  });

  it('reports the kept marker rather than staying silent about it', () => {
    plantLock('liffraedi-2e', 'ch03', 'm66443');
    const snapshot = sweep.listLockFiles(booksDir);
    const result = sweep.sweepStrayLocks(booksDir, snapshot);
    expect(result.kept).toEqual([
      path.join('liffraedi-2e', '02-mt-output', 'ch03', `m66443${LOCK}`),
    ]);
  });

  // Preserves global-teardown.js's documented property: "catches markers
  // stranded by a previous aborted run". The fixture book is never a place a
  // human edits, so an unconditional sweep there loses nothing.
  it('REMOVES a fixture-book marker even when the snapshot contains it', () => {
    const stranded = plantLock('__e2e-fixture__', 'ch01', 'm68664');
    const snapshot = sweep.listLockFiles(booksDir); // contains it
    sweep.sweepStrayLocks(booksDir, snapshot);
    expect(fs.existsSync(stranded)).toBe(false);
  });

  it('leaves a non-marker file in the same directory untouched', () => {
    const snapshot = sweep.listLockFiles(booksDir);
    plantLock('efnafraedi-2e', 'ch01', 'm68664');
    const sibling = path.join(
      booksDir,
      'efnafraedi-2e',
      '02-mt-output',
      'ch01',
      'm68664-segments.is.md'
    );
    fs.writeFileSync(sibling, 'x', 'utf8');
    sweep.sweepStrayLocks(booksDir, snapshot);
    expect(fs.existsSync(sibling)).toBe(true);
  });
});

// A missing or corrupt snapshot must not license a blanket delete. This is the
// fail-safe direction: keeping a marker we cannot prove we created costs one
// skipped module in a re-MT; deleting one costs an editor's baseline.
describe('snapshot fail-safe', () => {
  it('KEEPS a real-book marker when the snapshot is null (unknown)', () => {
    const lock = plantLock('efnafraedi-2e', 'ch01', 'm68664');
    sweep.sweepStrayLocks(booksDir, null);
    expect(fs.existsSync(lock)).toBe(true);
  });

  it('still sweeps the fixture book when the snapshot is null', () => {
    const lock = plantLock('__e2e-fixture__', 'ch01', 'm68664');
    sweep.sweepStrayLocks(booksDir, null);
    expect(fs.existsSync(lock)).toBe(false);
  });

  it('loadSnapshot returns null for a corrupt file rather than throwing', () => {
    const f = path.join(booksDir, 'snap.json');
    fs.writeFileSync(f, '{not json', 'utf8');
    expect(sweep.loadSnapshot(f)).toBe(null);
  });

  it('loadSnapshot returns null for a non-array payload', () => {
    const f = path.join(booksDir, 'snap.json');
    fs.writeFileSync(f, '{"a":1}', 'utf8');
    expect(sweep.loadSnapshot(f)).toBe(null);
  });

  it('save then load round-trips the list', () => {
    const f = path.join(booksDir, 'nested', 'snap.json');
    sweep.saveSnapshot(f, ['a/b.locked']);
    expect(sweep.loadSnapshot(f)).toEqual(['a/b.locked']);
  });
});

// A GATE NEVER CALLED IS A GATE THAT DOESN'T EXIST. These drive the real
// Playwright entry points, not the library, so deleting the call site in either
// hook fails here.
describe('playwright hook wiring', () => {
  const globalSetup = require('../e2e/global-setup.js');
  const globalTeardown = require('../e2e/global-teardown.js');

  /** Overrides mirroring what the hooks compute from the repo root. */
  function seam() {
    return { booksDir, snapshotFile: path.join(booksDir, '.snap.json') };
  }

  it('setup + teardown together REMOVE a marker created during the run', async () => {
    await globalSetup(null, seam());
    const stray = plantLock('efnafraedi-2e', 'ch01', 'm68664');
    await globalTeardown(null, seam());
    expect(fs.existsSync(stray)).toBe(false);
  });

  it('setup + teardown together KEEP a marker that predates the run', async () => {
    const committed = plantLock('liffraedi-2e', 'ch03', 'm66443');
    await globalSetup(null, seam());
    await globalTeardown(null, seam());
    expect(fs.existsSync(committed)).toBe(true);
  });

  it('teardown reports what it removed', async () => {
    await globalSetup(null, seam());
    plantLock('efnafraedi-2e', 'ch01', 'm68664');
    const result = await globalTeardown(null, seam());
    expect(result.removed).toHaveLength(1);
  });
});

// Without globalSetup wired, no snapshot is ever written, teardown fail-safes to
// "keep everything outside the fixture book", and the sweep silently reverts to
// the pre-fix behaviour with the whole suite still green. The wiring IS the fix.
describe('playwright.config.js declares both hooks', () => {
  const cfgPath = path.join(__dirname, '..', 'e2e', 'playwright.config.js');
  const cfg = fs.readFileSync(cfgPath, 'utf8');

  it('declares globalSetup', () => {
    expect(cfg).toMatch(/globalSetup:\s*require\.resolve\('\.\/global-setup\.js'\)/);
  });

  it('declares globalTeardown', () => {
    expect(cfg).toMatch(/globalTeardown:\s*require\.resolve\('\.\/global-teardown\.js'\)/);
  });

  it('both referenced hook files exist on disk', () => {
    const missing = ['global-setup.js', 'global-teardown.js'].filter(
      (f) => !fs.existsSync(path.join(__dirname, '..', 'e2e', f))
    );
    expect(missing).toEqual([]);
  });
});
