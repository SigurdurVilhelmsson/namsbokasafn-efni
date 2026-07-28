/**
 * Task 7 (C1a R2): publication read-path accepts appendices.
 *
 * Pre-fix, publicationService builds `ch${String(-1).padStart(2,'0')}` = `ch-1`
 * for the appendices chapter (-1) — a directory that never exists on disk.
 * Post-fix it must resolve the real `appendices/` directory instead.
 *
 * Pinned against the REAL committed efnafraedi-2e content:
 *   books/efnafraedi-2e/02-mt-output/appendices/ contains 13 modules with
 *   `mNNNNN-segments.is.md` files (verified via `ls` before writing this test).
 */

import { describe, it, expect, vi, afterEach, beforeAll } from 'vitest';
import { createRequire } from 'module';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);

const REPO_ROOT = fileURLToPath(new URL('../..', import.meta.url));
const BOOK = 'efnafraedi-2e';

/**
 * Observe the tree the way checkTrackReadiness/files-exist do.
 *
 * Used to derive EXPECTATIONS from the current on-disk state instead of pinning
 * it: appendix segment editing already works (C1a / item-14), so an approved
 * appendix edit legitimately creates
 * `03-faithful-translation/appendices/mNNNNN-segments.is.md`
 * (segmentParser.getModulePaths) and the 2h git-backup cron commits it. A test
 * that pinned that dir's ABSENCE would turn the authoritative local suite red on
 * ordinary editorial use, with no code change — so assert that the code AGREES
 * with the tree instead, which still catches wrong-convention resolution.
 *
 * @param {...string} relDirSegments - path segments under `books/`
 * @returns {boolean} true if the dir exists and holds >=1 IS segment file
 */
function hasIsSegmentFiles(...relDirSegments) {
  const dir = path.join(REPO_ROOT, 'books', ...relDirSegments);
  return fs.existsSync(dir) && fs.readdirSync(dir).some((f) => /^m\d+-segments\.is\.md$/.test(f));
}

// Spy on child_process.spawn BEFORE publicationService.js is first required
// (below and in the describe block that follows). publicationService.js
// destructures `const { spawn } = require('child_process');` at module-load
// time — CJS require has no live bindings, so whatever `.spawn` holds at
// THAT moment is what the module calls forever after. The spy must already
// be installed the first time this file (and thus publicationService.js)
// is loaded, or it will silently miss every call.
const childProcess = require('child_process');
const spawnSpy = vi.spyOn(childProcess, 'spawn');
const { validateBeforePublish } = require('../services/publicationService');

/**
 * Build a fake child_process child that resolves validateBeforePublish's
 * Promise with the given (already-JSON-stringified) validate-chapter.js
 * `--json` stdout payload.
 */
function makeFakeChild(jsonStdout) {
  const child = new EventEmitter();
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  queueMicrotask(() => {
    child.stdout.emit('data', Buffer.from(jsonStdout));
    child.emit('close', 0);
  });
  return child;
}

describe('validateBeforePublish sends the CLI-safe chapter arg (C1d task 3)', () => {
  afterEach(() => {
    spawnSpy.mockReset();
  });

  it('spawns validate-chapter.js with "appendices" (not "-1") in the chapter-arg slot for the appendices chapter', async () => {
    spawnSpy.mockImplementation(() => makeFakeChild('{"valid":true,"checks":{},"summary":{}}'));

    await validateBeforePublish('efnafraedi-2e', -1, 'mt-preview');

    expect(spawnSpy).toHaveBeenCalledTimes(1);
    const [command, args] = spawnSpy.mock.calls[0];
    expect(command).toBe('node');
    // args: [validate-chapter.js path, bookSlug, chapterArg, '--track', track, '--json']
    // Assert the chapter arg's POSITION (index 2, right after the book slug),
    // not just membership — a bare `.toContain('appendices')` would pass even
    // if the value landed in the wrong slot.
    expect(args[1]).toBe('efnafraedi-2e');
    expect(args[2]).toBe('appendices');
  });

  it('spawns validate-chapter.js with "5" in the chapter-arg slot for a numeric chapter (no behaviour change)', async () => {
    spawnSpy.mockImplementation(() => makeFakeChild('{"valid":true,"checks":{},"summary":{}}'));

    await validateBeforePublish('efnafraedi-2e', 5, 'mt-preview');

    expect(spawnSpy).toHaveBeenCalledTimes(1);
    const [, args] = spawnSpy.mock.calls[0];
    expect(args[1]).toBe('efnafraedi-2e');
    expect(args[2]).toBe('5');
  });
});

/**
 * Severity routing is CODE, not data: validateBeforePublish pushes a check's
 * issues into `errors`/`warnings` only when the check's severity is 'error' /
 * 'warning', so an INFO-severity finding can never block a publish.
 *
 * Asserted against a hand-built validate-chapter payload rather than the real
 * tree, because the real tree currently has exactly ONE failing check for the
 * appendices (the INFO status-match finding) — the moment that finding is
 * resolved (the [LEAD] status-advance data op this branch logged as wanted),
 * a real-tree version of this assertion would go silently vacuous.
 *
 * Must stay ABOVE the Task-4 block: that block's beforeAll calls
 * spawnSpy.mockRestore(), which un-patches the spy permanently.
 */
describe('validateBeforePublish severity routing: INFO never reaches the publish gate', () => {
  afterEach(() => {
    spawnSpy.mockReset();
  });

  it('routes error/warning issues and drops info-severity issues', async () => {
    spawnSpy.mockImplementation(() =>
      makeFakeChild(
        JSON.stringify({
          valid: false,
          checks: {
            'files-exist': {
              severity: 'error',
              passed: false,
              issues: [{ file: '/books/x/03-faithful-translation/appendices', message: 'ERR' }],
            },
            images: {
              severity: 'warning',
              passed: false,
              issues: [{ file: 'm68859.html', message: 'WARN' }],
            },
            'status-match': {
              severity: 'info',
              passed: false,
              issues: [
                {
                  file: 'status.json',
                  message:
                    "Files exist for mt-preview track, but status doesn't indicate completion",
                },
              ],
            },
          },
          summary: { errors: 1, warnings: 1, info: 1, passed: 0 },
        })
      )
    );

    const result = await validateBeforePublish('efnafraedi-2e', -1, 'mt-preview');

    expect(result.errors.map((e) => e.validator)).toEqual(['files-exist']);
    expect(result.warnings.map((w) => w.validator)).toEqual(['images']);
    expect([...result.errors, ...result.warnings].some((i) => i.validator === 'status-match')).toBe(
      false
    );
  });
});

describe('publicationService resolves the appendices dir (not ch-1)', () => {
  const {
    checkMtPreviewReadiness,
    getPublicationStatus,
  } = require('../services/publicationService');

  it('mt-preview readiness for appendices reflects the real appendices/ content', () => {
    const result = checkMtPreviewReadiness('efnafraedi-2e', -1);

    // Pre-fix: ready=false, reason mentions the nonexistent `ch-1` dir, no moduleCount.
    // Post-fix: ready=true, moduleCount=13 (real file count), sourceDir points at
    // the real `appendices/` directory.
    expect(result.ready).toBe(true);
    expect(result.moduleCount).toBe(13);
    expect(result.sourceDir).toBe('02-mt-output/appendices');
    expect(result.modules).toContain('m68859');
  });

  it('getPublicationStatus for appendices reads the real 05-publication/mt-preview/chapters/appendices/ dir (not chapters/-1)', () => {
    // Real committed data: books/efnafraedi-2e/05-publication/mt-preview/chapters/appendices/
    // has 13 rendered .html files (verified via `ls` before writing this test).
    // Pre-fix this site built `chapters/-1` (String(-1).padStart(2,'0') === '-1'),
    // a nonexistent dir → published:false, fileCount:0.
    const status = getPublicationStatus('efnafraedi-2e', -1);

    expect(status.mtPreview.published).toBe(true);
    expect(status.mtPreview.fileCount).toBe(13);
    expect(status.mtPreview.path).toBe('05-publication/mt-preview/chapters/appendices');
  });

  it('getPublicationStatus for a numeric chapter is unaffected (no accidental ch-prefix regression)', () => {
    // Guards against a future "DRY" refactor of the bare-dir site to chapterDir()
    // (which would wrongly produce `chapters/ch01` instead of `chapters/01`).
    const status = getPublicationStatus('efnafraedi-2e', 1);

    expect(status.mtPreview.path).toBe('05-publication/mt-preview/chapters/01');
  });
});

/**
 * Task 4 (C1d B4): end-to-end verification that Tasks 1-3 compose across the
 * REAL publish path — publicationService.validateBeforePublish spawning the
 * REAL tools/validate-chapter.js child process against the REAL committed
 * books/efnafraedi-2e/02-mt-output/appendices content (13 modules), exactly
 * as production does it. This is deliberately NOT mocked: task 3's own test
 * above (line ~51) already pins the spawn ARGUMENT; this suite pins that the
 * spawned process actually runs to completion and produces the right result.
 *
 * Per the brief's 2026-07-28 amendment, every assertion here is POSITIVE
 * (checks fire and pass / resolve with real data), never merely "no longer a
 * 500" — a new failure mode could satisfy a purely negative assertion.
 *
 * Do NOT assert `results.valid === true` globally here: the content-quality
 * validators now run against the real 2247-file 02-structure/appendices tree
 * for the first time, and a genuine data finding (there is one — see below)
 * is not a tool bug to be pinned away.
 *
 * ⚠️ And do not pin the CURRENT tree either (fix wave, 2026-07-28). Because
 * this branch ENABLES appendix publishing, and appendix segment editing already
 * works, ordinary legitimate use flips the state these tests read: a publish
 * writes publication.mtPreview into chapters/appendices/status.json, and an
 * applied appendix edit creates 03-faithful-translation/appendices/. Every
 * assertion below therefore either states a property of the CODE, or OBSERVES
 * the tree and asserts the code agrees with it. A pin that a legitimate data
 * operation turns red is a defect here: `npm test` from the repo root is the
 * merge gate (there is no branch protection).
 */
describe('C1d Task 4: end-to-end publish-path assertions (mt-preview reaches publish; faithful stays gated)', () => {
  // The two describe blocks above installed a custom spawn mockImplementation
  // per-test and reset it in their own afterEach. vi.spyOn's mockReset()
  // restores call-through to the REAL child_process.spawn (it does not zero
  // the implementation out — verified against @vitest/spy's source), so by
  // the time this block runs the spy already calls through. mockRestore()
  // here is belt-and-suspenders: it un-patches the spy entirely so this
  // suite's real-process assertions can never depend on sibling test order.
  beforeAll(() => {
    spawnSpy.mockRestore();
  });

  const { checkTrackReadiness } = require('../services/publicationService');

  it('assertion 1: validateBeforePublish resolves with parseable results for the real appendices mt-preview content (pre-C1d: rejected on empty stdout)', async () => {
    const result = await validateBeforePublish('efnafraedi-2e', -1, 'mt-preview');

    expect(typeof result.valid).toBe('boolean');
    expect(Array.isArray(result.errors)).toBe(true);
    expect(Array.isArray(result.warnings)).toBe(true);
    expect(result.summary).toBeTruthy();
    expect(typeof result.summary.passed).toBe('number');
  }, 15000);

  it('assertion 2: the dir-resolving ERROR check passes for the appendix chapter, proving context.chapterDir resolved the real appendices/ tree', async () => {
    // Goes one level below validateBeforePublish (which only surfaces
    // errors/warnings, not the full per-check `passed` map) to the tool's own
    // validateChapter(), an ES module — dynamic import from this CJS test.
    const { validateChapter } = await import('../../tools/validate-chapter.js');

    const results = await validateChapter({
      book: BOOK,
      chapter: -1,
      track: 'mt-preview',
    });

    expect(results.chapterDir).toBe('appendices');
    // files-exist reads 02-mt-output/<chapterDir> and PUSHES an issue when that
    // dir is missing (validate-chapter.js:97-103) — it does not early-return —
    // so `passed:true` can only mean the real appendices/ dir was found. Pre-fix
    // it looked for the nonexistent `ch-1`. (02-mt-output is a READ-ONLY dir by
    // project rule, so depending on its content is safe.)
    expect(results.checks['files-exist'].passed).toBe(true);
    expect(results.checks['files-exist'].issues).toHaveLength(0);
    // Unconditional, data-robust: the whole result carries `chapterDir` and every
    // issue path, so a wrong-convention build shows up here whatever the content.
    expect(JSON.stringify(results)).not.toMatch(/ch-1\b|chappendices|chapters[/\\]-1\b/);

    // manifest-consistency is deliberately NOT asserted here. It early-returns
    // when 02-structure/<chapterDir> is missing (validate-chapter.js:940) and
    // `passed` is `issues.length === 0` — so `passed:true` is EXACTLY what the
    // pre-fix `ch-1` build produces (verified: chapter 97 → passed:true,
    // issues:[]). The assertion that used to live here proved nothing, and it
    // doubled as a pin on real manifest data (a future appendices re-extraction
    // changing a sourceHash or segmentCount would have turned it red).
    // That validator's appendix resolution IS covered non-vacuously — by
    // asserting its issues FIRE against a seeded temp tree — in
    // tools/__tests__/validateChapterAppendices.test.js.
  });

  it('assertion 3: the faithful-track ERROR check agrees with the tree, and no wrong-convention path leaks into errors/warnings', async () => {
    // mt-preview has no wrong-dir errors to inspect (everything resolves and
    // passes — see assertion 2), so a scan of ITS `errors`/`warnings` would run
    // against `[]`. The faithful track is used instead because it is the track
    // whose appendices dir is currently absent — but that absence is DATA, not a
    // property of the code, so it is OBSERVED rather than assumed. Whichever
    // state the tree is in, one of (a)/(b) below is the discriminator:
    //   • dir absent (today)  → (b) pins the resolved path in the ERROR payload
    //   • dir present (after an applied appendix edit) → (a) goes red on a
    //     `ch-1` build, which would still report files-exist as failing
    const faithfulReady = hasIsSegmentFiles(BOOK, '03-faithful-translation', 'appendices');

    const result = await validateBeforePublish(BOOK, -1, 'faithful');
    const filesExistErrors = result.errors.filter((e) => e.validator === 'files-exist');

    // (a) files-exist fires iff the resolved dir holds no IS segment files.
    expect(filesExistErrors.length > 0).toBe(!faithfulReady);

    // (b) When it fires, its `file` field IS the resolved source dir — the only
    //     non-empty, path-bearing payload the wrong-convention scan can scan.
    //     Written as an equality (not an `if`) so it can never silently no-op.
    expect(JSON.stringify(filesExistErrors).includes('03-faithful-translation/appendices')).toBe(
      !faithfulReady
    );

    // (c) Whatever the tree holds, no wrong-convention path may appear.
    const serialized = JSON.stringify([...result.errors, ...result.warnings]);
    expect(serialized).not.toMatch(/ch-1\b/);
    expect(serialized).not.toMatch(/chappendices/);
    expect(serialized).not.toMatch(/chapters[/\\]-1\b/);
  }, 15000);

  it('assertion 4a: fail-closed is a property of the CODE — a missing faithful appendices dir is reported against the appendix convention', () => {
    // This is the constraint the whole task exists to protect: publish-path
    // support for mt-preview must not accidentally open a write path for a
    // track that has no source content. publishChapter() calls
    // checkTrackReadiness() BEFORE validateBeforePublish() and throws on
    // ready:false, so this stays a hard gate regardless of Tasks 1-3.
    //
    // checkTrackReadiness resolves via a module-level BOOKS_DIR and takes no
    // projectRoot, so the missing-dir branch is exercised through a book slug
    // that cannot exist rather than a temp tree. That makes this assertion
    // data-independent: no content operation on any real book can flip it.
    const result = checkTrackReadiness('__c1d-nonexistent-book__', -1, 'faithful');

    expect(result.ready).toBe(false);
    // ready:false alone doesn't prove chapterDir resolved correctly — it would
    // also be false for a nonexistent `ch-1`. Pinning the reason's path proves
    // the appendix convention was used.
    expect(result.reason).toContain('03-faithful-translation/appendices');
    expect(result.reason).not.toMatch(/ch-1\b|chappendices/);
  });

  it('assertion 4b: faithful readiness for the real book agrees with the tree, and names the resolved appendices dir either way', () => {
    // Gating on CONTENT (rather than on the chapter being appendices) is
    // precisely the behaviour the C1 campaign exists to reach, so `ready` must
    // track the tree — it must NOT be pinned to today's `false`.
    const faithfulReady = hasIsSegmentFiles(BOOK, '03-faithful-translation', 'appendices');

    const result = checkTrackReadiness(BOOK, -1, 'faithful');

    expect(result.ready).toBe(faithfulReady);
    // Either branch carries the resolved dir — `reason` when it gates,
    // `sourceDir` when it is ready — so this discriminates in both states.
    expect(result.ready ? result.sourceDir : result.reason).toContain(
      '03-faithful-translation/appendices'
    );
  });

  it('status-match reads chapters/appendices/status.json and its verdict agrees with what is actually on disk', async () => {
    // The appendices status.json currently reports every stage incomplete while
    // 13 modules are rendered — a real, logged [LEAD] data finding. It is NOT
    // pinned here: publishing appendices/mt-preview through the route this
    // branch enables writes `publication.mtPreview.complete` into that very
    // file (publicationService.js:250) and the 2h git-backup cron commits it,
    // so a pin on "still failing" would turn the authoritative local suite red
    // on legitimate use. Observe both inputs the validator reads
    // (validate-chapter.js:493-511) and assert the tool AGREES with them.
    const { validateChapter } = await import('../../tools/validate-chapter.js');
    const results = await validateChapter({ book: BOOK, chapter: -1, track: 'mt-preview' });

    const statusPath = path.join(REPO_ROOT, 'books', BOOK, 'chapters', 'appendices', 'status.json');
    const status = fs.existsSync(statusPath)
      ? JSON.parse(fs.readFileSync(statusPath, 'utf-8')).status || {}
      : {};
    const statusSaysComplete = Boolean(
      status.mtOutput?.complete || status.publication?.mtPreview?.complete
    );
    const mtDir = path.join(REPO_ROOT, 'books', BOOK, '02-mt-output', 'appendices');
    const hasContent = fs.existsSync(mtDir) && fs.readdirSync(mtDir).some((f) => f.endsWith('.md'));

    const statusCheck = results.checks['status-match'];
    // Severity is code, not data.
    expect(statusCheck.severity).toBe('info');
    // The validator reports an issue exactly when its two sides disagree, so
    // `passed` must equal "the observed sides agree". A `ch-1` build reads
    // NEITHER file (both dirs are absent) and so reports agreement-by-emptiness
    // — red here as long as one observed side is non-empty, which the next
    // assertion states explicitly rather than leaving implicit.
    expect(statusCheck.passed).toBe(statusSaysComplete === hasContent);
    expect(hasContent || statusSaysComplete).toBe(true);
    // Permanent, data-independent discriminator: statusPath is built from this
    // same chapterDir value (validate-chapter.js:1099-1100).
    expect(results.chapterDir).toBe('appendices');

    // End-to-end half of the severity-routing mechanism (the data-independent
    // half lives in its own describe above, against a hand-built payload):
    // while the INFO finding is open, it must be absent from the publish gate.
    const published = await validateBeforePublish(BOOK, -1, 'mt-preview');
    const infoValidators = Object.entries(results.checks)
      .filter(([, check]) => check.severity === 'info')
      .map(([name]) => name);
    for (const issue of [...published.errors, ...published.warnings]) {
      expect(infoValidators).not.toContain(issue.validator);
    }
  }, 15000);
});
