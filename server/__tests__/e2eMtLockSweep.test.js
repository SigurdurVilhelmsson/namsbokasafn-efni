/**
 * E2E stray MT edit-lock sweep (§C118 (9)).
 *
 * WHY THIS EXISTS. The Playwright suite saves segment edits against the REAL
 * `efnafraedi-2e` book (ux-phase2.spec.js M5, segment-editor.spec.js), and
 * `segmentEditorService`'s first-edit hook writes a `-segments.locked` marker
 * next to that module's MT output. Every run seeds a fresh DB, so "first edit"
 * fires every run. `global-teardown.js` swept only `books/__e2e-fixture__/`, so
 * the real-book marker survived — inside a tree CLAUDE.md marks READ ONLY — and
 * `mtRunDecision` then returns `locked-skip` for that module, silently excluding
 * it from a paid re-MT with every exit code green. `scripts/git-backup.sh:173`
 * stages these markers deliberately, so on a tree running both the suite and
 * that cron the stray is COMMITTED and skips the module for everyone.
 *
 * ux-phase2.spec.js justified the real-book write with "the module's MT
 * edit-lock marker is committed and writeMtLock no-ops when one exists". That
 * was true when written and is not now: PR #411's Phase 2.1 deleted all seven
 * committed chemistry locks — m68664, the module that spec edits, among them.
 *
 * THE INVARIANT: an E2E run must leave `books/` byte-clean, and must never
 * delete a lock it did not create. Hence the snapshot; hence the run token on
 * it, after an adversarial review found the first version's fail-safe did not
 * engage (a fixed-path snapshot outlived the run, so "setup never ran" produced
 * the PREVIOUS run's list rather than null, and a lock created in between was
 * then classified as litter and deleted).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'module';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const require = createRequire(import.meta.url);
// fileURLToPath, not new URL(...).pathname: the latter leaves %20 undecoded.
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const sweep = require('../e2e/helpers/mt-lock-sweep.js');
const { mtLockPathFor } = require('../../tools/lib/mt-lock.cjs');

const LOCK = sweep.LOCK_SUFFIX;
let booksDir;
let snapFile;

/** Plant a lock marker for <book>/<chapterDir>/<module>; returns its abs path. */
function plantLock(book, chapterDir, moduleId) {
  const dir = path.join(booksDir, book, '02-mt-output', chapterDir);
  fs.mkdirSync(dir, { recursive: true });
  const p = path.join(dir, `${moduleId}${LOCK}`);
  fs.writeFileSync(p, JSON.stringify({ lockedAt: 'x', reason: 'editing-started' }), 'utf8');
  return p;
}

const rel = (book, ch, mod) => `${book}/02-mt-output/${ch}/${mod}${LOCK}`;

beforeEach(() => {
  booksDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mt-lock-sweep-'));
  snapFile = path.join(booksDir, '.snap.json');
  delete process.env[sweep.RUN_TOKEN_ENV];
});

afterEach(() => {
  fs.rmSync(booksDir, { recursive: true, force: true });
  delete process.env[sweep.RUN_TOKEN_ENV];
});

// The suffix is DERIVED from tools/lib/mt-lock.cjs, not restated. A third copy
// would let an owner-side rename leave every test green and the sweep blind.
describe('LOCK_SUFFIX derivation', () => {
  it('matches what the owning module actually produces', () => {
    expect(`m1${sweep.LOCK_SUFFIX}`).toBe(path.basename(mtLockPathFor('/a/b/m1-segments.is.md')));
  });
});

describe('listLockFiles', () => {
  it('finds a planted marker', () => {
    plantLock('efnafraedi-2e', 'ch01', 'm68664');
    expect(sweep.listLockFiles(booksDir)).toEqual([rel('efnafraedi-2e', 'ch01', 'm68664')]);
  });

  it('ignores files that are not lock markers', () => {
    const dir = path.join(booksDir, 'efnafraedi-2e', '02-mt-output', 'ch01');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'm68664-segments.is.md'), 'x', 'utf8');
    expect(sweep.listLockFiles(booksDir)).toEqual([]);
  });

  it('tolerates a book with no 02-mt-output at all', () => {
    fs.mkdirSync(path.join(booksDir, 'some-book', '01-source'), { recursive: true });
    expect(sweep.listLockFiles(booksDir)).toEqual([]);
  });

  // FAIL-CLOSED, not fail-open. "No markers exist" authorizes deletion;
  // "I could not look" must not, and returning [] for both conflated them.
  it('THROWS when the books dir itself cannot be enumerated', () => {
    const notADir = path.join(booksDir, 'a-file');
    fs.writeFileSync(notADir, 'x', 'utf8');
    expect(() => sweep.listLockFiles(notADir)).toThrow();
  });
});

describe('sweepStrayLocks', () => {
  it('REMOVES a real-book marker that appeared after the snapshot', () => {
    const snapshot = sweep.listLockFiles(booksDir); // empty
    const stray = plantLock('efnafraedi-2e', 'ch01', 'm68664');
    sweep.sweepStrayLocks(booksDir, snapshot);
    expect(fs.existsSync(stray)).toBe(false);
  });

  // NON-VACUITY CONTROL. A sweep-everything mutation passes the test above and
  // fails here. Deleting a real editorial lock is the data loss the marker
  // exists to prevent (isMtLocked treats even an unreadable marker as locked).
  it('KEEPS a real-book marker that was already present at snapshot time', () => {
    const committed = plantLock('liffraedi-2e', 'ch03', 'm66443');
    const snapshot = sweep.listLockFiles(booksDir);
    sweep.sweepStrayLocks(booksDir, snapshot);
    expect(fs.existsSync(committed)).toBe(true);
  });

  // THE PRODUCTION SHAPE, and the review was right that its absence was a hole:
  // with only the two tests above, `ourLitter = known.size === 0` passes BOTH
  // (empty snapshot => sweep, non-empty => keep) and the membership predicate is
  // never bound. Measured: that mutant survived all 20 of the first version's
  // tests. Both a keep and a sweep must be decided in ONE call.
  it('partitions correctly when the snapshot is non-empty AND a stray appears', () => {
    const committed = plantLock('liffraedi-2e', 'ch03', 'm66443');
    const snapshot = sweep.listLockFiles(booksDir);
    const stray = plantLock('efnafraedi-2e', 'ch01', 'm68664');
    const result = sweep.sweepStrayLocks(booksDir, snapshot);
    expect({
      strayGone: !fs.existsSync(stray),
      committedKept: fs.existsSync(committed),
      removed: result.removed,
      kept: result.kept,
    }).toEqual({
      strayGone: true,
      committedKept: true,
      removed: [rel('efnafraedi-2e', 'ch01', 'm68664')],
      kept: [rel('liffraedi-2e', 'ch03', 'm66443')],
    });
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

  it('deletes nothing when the books dir cannot be enumerated', () => {
    const notADir = path.join(booksDir, 'a-file');
    fs.writeFileSync(notADir, 'x', 'utf8');
    expect(sweep.sweepStrayLocks(notADir, [])).toEqual({ removed: [], kept: [], failed: [] });
  });
});

// A missing, corrupt or FOREIGN snapshot must not license a blanket delete.
// Keeping a marker we cannot prove we created costs one skipped module in a
// re-MT; deleting one costs an editor's baseline.
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
    fs.writeFileSync(snapFile, '{not json', 'utf8');
    expect(sweep.loadSnapshot(snapFile, 'tok')).toBe(null);
  });

  it('loadSnapshot returns null for a payload with no files array', () => {
    fs.writeFileSync(snapFile, '{"token":"tok"}', 'utf8');
    expect(sweep.loadSnapshot(snapFile, 'tok')).toBe(null);
  });

  it('loadSnapshot returns the list when the token matches', () => {
    sweep.saveSnapshot(snapFile, ['a/b.locked'], 'tok');
    expect(sweep.loadSnapshot(snapFile, 'tok')).toEqual(['a/b.locked']);
  });

  // THE DEFECT THE REVIEW FOUND. The snapshot lives at one fixed path that
  // outlives the run, so without a token "global-setup never ran" reads as the
  // PREVIOUS run's baseline — and a lock a human created in between is absent
  // from it, hence deleted. The token is what makes the fail-safe real.
  it('loadSnapshot returns null for a snapshot from ANOTHER run', () => {
    sweep.saveSnapshot(snapFile, ['a/b.locked'], 'previous-run');
    expect(sweep.loadSnapshot(snapFile, 'this-run')).toBe(null);
  });

  it('loadSnapshot returns null when no token is supplied at all', () => {
    sweep.saveSnapshot(snapFile, ['a/b.locked'], 'previous-run');
    expect(sweep.loadSnapshot(snapFile, undefined)).toBe(null);
  });

  // Consumed on read: a snapshot is valid for exactly one teardown, so a second
  // teardown without a setup cannot reuse it even by luck.
  it('loadSnapshot consumes the file', () => {
    sweep.saveSnapshot(snapFile, ['a/b.locked'], 'tok');
    sweep.loadSnapshot(snapFile, 'tok');
    expect(fs.existsSync(snapFile)).toBe(false);
  });

  it('mintRunToken does not repeat', () => {
    expect(sweep.mintRunToken()).not.toBe(sweep.mintRunToken());
  });
});

// A GATE NEVER CALLED IS A GATE THAT DOESN'T EXIST. These drive the real
// Playwright entry points, not the library, so deleting the call site in either
// hook fails here.
describe('playwright hook wiring', () => {
  const globalSetup = require('../e2e/global-setup.js');
  const globalTeardown = require('../e2e/global-teardown.js');

  const seam = () => ({ booksDir, snapshotFile: snapFile, projectRoot: booksDir });

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
    expect(result.removed).toEqual([rel('efnafraedi-2e', 'ch01', 'm68664')]);
  });

  // Teardown WITHOUT a preceding setup: the stale-snapshot scenario end to end.
  // Before the run token this deleted the marker; now it keeps it.
  it('teardown alone, against a PREVIOUS run snapshot, keeps a real-book marker', async () => {
    sweep.saveSnapshot(snapFile, [], 'a-previous-run'); // stale: predates the lock
    const lock = plantLock('efnafraedi-2e', 'ch01', 'm68664');
    await globalTeardown(null, seam());
    expect(fs.existsSync(lock)).toBe(true);
  });

  // A snapshot that could not be written must not leave a token behind: a token
  // with no file still reads as null in teardown, but leaving one is a lie about
  // what happened, and the next assertion is what pins the SAFE direction.
  it('setup mints no run token when the snapshot cannot be written', async () => {
    const blocker = path.join(booksDir, 'blocker');
    fs.writeFileSync(blocker, 'x', 'utf8'); // its "parent dir" is a file
    const r = await globalSetup(null, {
      booksDir,
      snapshotFile: path.join(blocker, 'x.json'),
      projectRoot: booksDir,
    });
    expect(r.token).toBe(null);
  });

  it('and a real-book marker then SURVIVES teardown', async () => {
    const blocker = path.join(booksDir, 'blocker');
    fs.writeFileSync(blocker, 'x', 'utf8');
    const seamBlocked = {
      booksDir,
      snapshotFile: path.join(blocker, 'x.json'),
      projectRoot: booksDir,
    };
    await globalSetup(null, seamBlocked);
    const lock = plantLock('efnafraedi-2e', 'ch01', 'm68664');
    await globalTeardown(null, seamBlocked);
    expect(fs.existsSync(lock)).toBe(true);
  });

  it('the hooks default to the repo books dir when no override is given', () => {
    expect(sweep.snapshotPathFor('/repo')).toBe(
      path.join('/repo', 'pipeline-output', '.e2e-mt-lock-snapshot.json')
    );
  });
});

// Without globalSetup wired, no token reaches the environment, teardown reads
// null, and the sweep silently reverts to the pre-fix behaviour with the whole
// suite still green. The wiring IS the fix.
describe('playwright.config.js declares both hooks', () => {
  const cfgPath = path.join(__dirname, '..', 'e2e', 'playwright.config.js');
  const cfg = fs.readFileSync(cfgPath, 'utf8');

  /** A line declaring `hook`, ignoring commented-out ones. */
  const declares = (hook) =>
    cfg
      .split('\n')
      .filter((l) => !l.trim().startsWith('//'))
      .some((l) =>
        new RegExp(
          `${hook}:\\s*require\\.resolve\\('\\./${hook.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase())}\\.js'\\)`
        ).test(l)
      );

  it('declares globalSetup, not merely mentions it in a comment', () => {
    expect(declares('globalSetup')).toBe(true);
  });

  it('declares globalTeardown, not merely mentions it in a comment', () => {
    expect(declares('globalTeardown')).toBe(true);
  });

  it('both referenced hook files exist on disk', () => {
    const missing = ['global-setup.js', 'global-teardown.js'].filter(
      (f) => !fs.existsSync(path.join(__dirname, '..', 'e2e', f))
    );
    expect(missing).toEqual([]);
  });
});
