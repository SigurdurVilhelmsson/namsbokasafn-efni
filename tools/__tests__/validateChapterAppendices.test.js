import { validateChapter, parseArgs, TRACKS } from '../validate-chapter.js'; // already exported at validate-chapter.js:1238
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

describe('validate-chapter parseArgs — appendices', () => {
  it('captures "appendices" as chapter -1', () => {
    expect(parseArgs(['efnafraedi-2e', 'appendices']).chapter).toBe(-1);
  });
  it('captures bare "-1" as chapter -1 (not dropped as a flag)', () => {
    expect(parseArgs(['efnafraedi-2e', '-1']).chapter).toBe(-1);
  });
  it('numeric chapter unchanged', () => {
    expect(parseArgs(['efnafraedi-2e', '5']).chapter).toBe(5);
  });
  it('a real flag is still parsed as a flag', () => {
    expect(parseArgs(['efnafraedi-2e', '5', '--track', 'mt-preview']).track).toBe('mt-preview');
  });
  it('does not swallow an out-of-range negative like -5 as a chapter', () => {
    expect(parseArgs(['efnafraedi-2e', '-5']).chapter).toBe(null);
  });
  it('captures bare "-1" without eating the flag that follows', () => {
    const result = parseArgs(['efnafraedi-2e', '-1', '--track', 'mt-preview']);
    expect(result.chapter).toBe(-1);
    expect(result.track).toBe('mt-preview');
  });
});

// ─── Dir-builder resolution (Task 2) ─────────────────────────────────
//
// Asserted BEHAVIOURALLY through the real entry point against a temp-dir
// projectRoot — a static pin on a helper would prove the helper exists, not
// that the 11 `context.chapterDir` consumers resolve. Harness idiom mirrors
// tools/__tests__/validate-chapter.test.js.
//
// TWO on-disk conventions are exercised, and they are deliberately NOT the
// same builder:
//   • source/structure/status dirs are `ch`-PREFIXED  → `ch05` / `appendices`
//   • publication OUTPUT dirs are BARE               → `05`   / `appendices`
// The numeric pins below exist to stop a well-meaning "DRY" refactor from
// collapsing the bare pub dir onto chapterDir() (which would yield
// `chapters/ch05` and break every numeric publish). Mirrors the intent of
// server/__tests__/publicationAppendices.test.js on the server side.

const BOOK = 'test-book';
const TRACK = 'mt-preview';

function createTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'validate-chapter-appendices-'));
}

/** Create `books/<book>/<trackSourceDir>/<dirName>/` and return it. */
function makeSourceDir(tmpDir, dirName) {
  const dir = path.join(tmpDir, 'books', BOOK, TRACKS[TRACK].sourceDir, dirName);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/** Create `books/<book>/<trackPubDir>/chapters/<dirName>/` and return it. */
function makePubDir(tmpDir, dirName) {
  const dir = path.join(tmpDir, 'books', BOOK, TRACKS[TRACK].pubDir, 'chapters', dirName);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function addSegmentFile(dir, moduleId) {
  fs.writeFileSync(
    path.join(dir, `${moduleId}-segments.is.md`),
    '<!-- SEG:m68859:para:auto-1 -->\nTest segment'
  );
}

const run = (tmpDir, chapter) =>
  validateChapter({ book: BOOK, chapter, track: TRACK, projectRoot: tmpDir });

describe('validateChapter — appendix dir resolution (ch-prefixed source/structure)', () => {
  let tmpDir;
  beforeEach(() => {
    tmpDir = createTempDir();
  });
  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('resolves the source dir for chapter -1 to appendices/ (pre-fix: 02-mt-output/ch-1)', async () => {
    addSegmentFile(makeSourceDir(tmpDir, 'appendices'), 'm68859');

    const results = await run(tmpDir, -1);

    expect(results.checks['files-exist'].passed).toBe(true);
    expect(results.checks['files-exist'].issues).toHaveLength(0);
  });

  it('reports chapterDir "appendices" for chapter -1', async () => {
    addSegmentFile(makeSourceDir(tmpDir, 'appendices'), 'm68859');

    const results = await run(tmpDir, -1);

    // The `chapterDir` KEY is part of the tool's --json output that
    // publicationService.validateBeforePublish parses — the key must not move.
    expect(results.chapterDir).toBe('appendices');
  });

  it('leaks no wrong-convention path anywhere in the result', async () => {
    addSegmentFile(makeSourceDir(tmpDir, 'appendices'), 'm68859');

    const results = await run(tmpDir, -1);

    expect(JSON.stringify(results)).not.toMatch(/ch-1|chappendices|chapters[/\\]-1/);
  });

  it('resolves 02-structure/, 01-source/ and 02-for-mt/ appendices dirs in manifest-consistency', async () => {
    // Each of the three dirs is behind an existsSync guard, so a wrong-convention
    // build yields SILENCE (check passes vacuously). Asserting that BOTH issues
    // fire proves all three resolved: the hash issue needs 01-source/appendices,
    // the count issue needs 02-for-mt/appendices, and neither is even reached
    // unless 02-structure/appendices resolved first.
    const structDir = path.join(tmpDir, 'books', BOOK, '02-structure', 'appendices');
    fs.mkdirSync(structDir, { recursive: true });
    fs.writeFileSync(
      path.join(structDir, 'm68859-manifest.json'),
      JSON.stringify({ moduleId: 'm68859', sourceHash: 'deadbeefdeadbeef', segmentCount: 5 })
    );

    const srcDir = path.join(tmpDir, 'books', BOOK, '01-source', 'appendices');
    fs.mkdirSync(srcDir, { recursive: true });
    fs.writeFileSync(path.join(srcDir, 'm68859.cnxml'), '<document>appendix A</document>');

    const forMtDir = path.join(tmpDir, 'books', BOOK, '02-for-mt', 'appendices');
    fs.mkdirSync(forMtDir, { recursive: true });
    fs.writeFileSync(
      path.join(forMtDir, 'm68859-segments.en.md'),
      '<!-- SEG:m68859:para:auto-1 -->\nFirst\n<!-- SEG:m68859:para:auto-2 -->\nSecond'
    );

    const results = await run(tmpDir, -1);

    const messages = results.checks['manifest-consistency'].issues.map((i) => i.message);
    expect(messages.some((m) => m.includes('has changed since extraction'))).toBe(true);
    expect(messages.some((m) => m.includes('Segment count mismatch'))).toBe(true);
  });

  it('still builds ch05 for a numeric chapter (no appendices regression)', async () => {
    addSegmentFile(makeSourceDir(tmpDir, 'ch05'), 'm00001');

    const results = await run(tmpDir, 5);

    expect(results.chapterDir).toBe('ch05');
    expect(results.checks['files-exist'].passed).toBe(true);
  });
});

/**
 * Seed a bare pub dir with the minimum content that trips ALL FOUR
 * publication-output checks.
 *
 * Every one of those checks early-returns when its dir does not resolve, so a
 * test asserting a check PASSES is vacuous under a dir-resolution regression.
 * Asserting all four FIRE is what makes these pins real: they can only fire if
 * the dir resolved. (Verified by mutation — see the task report.)
 */
function seedFailingPubDir(dir, dirName) {
  fs.writeFileSync(path.join(dir, 'tomt.html'), ''); // html-non-empty
  fs.writeFileSync(
    path.join(dir, 'gallad.html'),
    '<main><p>Nógu langur texti til að falla ekki á lengdarprófinu í html-non-empty.</p>' +
      '<p>Leki: [[MATH:1]]</p>' + // html-placeholder-leaks
      `<img src="/content/${BOOK}/chapters/${dirName}/vantar.png" alt="x">` + // html-images-exist
      '<div class="equation"><merror>bilun</merror></div></main>' // html-equation-render
  );
}

function expectAllPubChecksFired(results) {
  expect(results.checks['html-placeholder-leaks'].passed).toBe(false);
  expect(results.checks['html-images-exist'].passed).toBe(false);
  expect(results.checks['html-non-empty'].passed).toBe(false);
  expect(results.checks['html-equation-render'].passed).toBe(false);
}

describe('validateChapter — appendix dir resolution (BARE publication output)', () => {
  let tmpDir;
  beforeEach(() => {
    tmpDir = createTempDir();
  });
  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('reads the bare chapters/appendices pub dir for chapter -1 (pre-fix: chapters/-1)', async () => {
    seedFailingPubDir(makePubDir(tmpDir, 'appendices'), 'appendices');

    expectAllPubChecksFired(await run(tmpDir, -1));
  });

  it('still reads the BARE chapters/05 pub dir for chapter 5 — not chapters/ch05', async () => {
    // Anti-DRY guard covering all four bare-pub sites at once: if any is ever
    // "unified" onto chapterDir(), its dir stops resolving and its check falls
    // silent here.
    seedFailingPubDir(makePubDir(tmpDir, '05'), '05');

    expectAllPubChecksFired(await run(tmpDir, 5));
  });

  it('resolves a /content/<book>/chapters/appendices/ image src against the appendix pub dir', async () => {
    const pubDir = makePubDir(tmpDir, 'appendices');
    fs.writeFileSync(path.join(pubDir, 'mynd.png'), 'PNG');
    fs.writeFileSync(
      path.join(pubDir, 'a-1-vidauki.html'),
      `<main><p>Nóg af texta til að standast lágmarkslengdina í html-non-empty prófinu hér.</p>` +
        `<img src="/content/${BOOK}/chapters/appendices/mynd.png" alt="Mynd"></main>`
    );

    const results = await run(tmpDir, -1);

    // Pre-fix the `\d+` path regex never matches `appendices`, so the src is not
    // reduced to its basename and the probe lands on a path that cannot exist.
    // No 01-source/media/ fallback is created, so the miss surfaces as an issue.
    expect(results.checks['html-images-exist'].issues).toHaveLength(0);
    expect(results.checks['html-images-exist'].passed).toBe(true);
  });

  it('still resolves a /content/<book>/chapters/05/ image src for a numeric chapter', async () => {
    const pubDir = makePubDir(tmpDir, '05');
    fs.writeFileSync(path.join(pubDir, 'mynd.png'), 'PNG');
    fs.writeFileSync(
      path.join(pubDir, '5-1-inngangur.html'),
      `<main><p>Nóg af texta til að standast lágmarkslengdina í html-non-empty prófinu hér.</p>` +
        `<img src="/content/${BOOK}/chapters/05/mynd.png" alt="Mynd"></main>`
    );

    const results = await run(tmpDir, 5);

    expect(results.checks['html-images-exist'].passed).toBe(true);
  });
});
