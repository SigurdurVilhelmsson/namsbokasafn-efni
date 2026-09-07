/**
 * `tools/figure-run.js` — the figure driver's FREE half (M5 Task 6a).
 *
 * 🔴 EVERY TEST IN THIS FILE MUST COST ZERO ISK, AND THE SUITE PROVES IT RATHER THAN
 * ASSERTING IT. `experiments/figure-text-translation/translate-blocks.mjs` is the only stage
 * that spends; the driver reaches every child process through ONE injectable `spawn`, so the
 * money test is a counter over that seam — `translate` spawns 0 — paired in the SAME run with
 * `prepare` spawns > 0 and a tally that sums to a non-zero figure count, because "0 spawns
 * because it did nothing" and "0 spawns because it correctly did not spend" are different facts
 * and only the control separates them.
 *
 * ⚠️ NO TEST HERE TOUCHES REAL ARTWORK. `sources.local.json` and `~/repos/Myndir` are
 * machine-local and gitignored, so a suite that depended on them would be vacuous in CI and on
 * anyone else's box. The real chain is exercised by Task 6a Step 5's corpus run, which is
 * recorded in the commit message, not here. What the suite DOES use is the tracked corpus —
 * `books/efnafraedi-2e/01-source/ch04/*.cnxml` and its `02-structure/` — because enumeration is
 * exactly the part that must be measured against real CNXML rather than a fixture.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync } from 'child_process';
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import {
  parseCli,
  CliError,
  mappingPreflight,
  applyMappingPreflight,
  enumerateChapterFigures,
  isStale,
  normaliseTranslations,
  summarise,
  runFigures,
  main,
} from '../figure-run.js';

const require = createRequire(import.meta.url);
const { computeRenderHash, COMPOSER_VERSION } = require('../lib/figure-text-sidecar.cjs');
const { emptyTally, tallyOutcome } = await import('../lib/figure-outcomes.js');

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..', '..');

/** `git status --porcelain`, as the instrument for "nothing under books/ was written". */
function porcelain() {
  return execFileSync('git', ['status', '--porcelain'], {
    cwd: REPO_ROOT,
    encoding: 'utf-8',
    maxBuffer: 32 * 1024 * 1024,
  });
}

/**
 * A fake `spawn` that records every child the driver would have started and fabricates the
 * files each stage promises. `plan` lets one test bend one figure without re-writing the rest.
 *
 * @param {object} [plan]
 * @param {(name:string)=>object|null} [plan.resolve] per-basename resolution
 * @param {(basename:string, outDir:string)=>object} [plan.prepare] the prepare.json payload,
 *   or `{__fail: 'message'}` to make prepare exit 1, or `{__meta: 'other'}` to make meta.json
 *   name a different figure.
 */
function fakeSpawn(plan = {}) {
  const calls = [];
  const fn = ({ stage, argv }) => {
    calls.push({ stage, argv });
    if (stage === 'resolve') {
      const names = argv.slice(argv.indexOf('--json') + 2);
      const out = {};
      for (const n of names) {
        out[n] = plan.resolve
          ? plan.resolve(n)
          : { path: `/fake/artwork/${n}.pdf`, edition: 'first-edition' };
      }
      return { status: 0, stdout: JSON.stringify(out), stderr: '' };
    }
    if (stage === 'prepare') {
      const outDir = argv[argv.indexOf('--out') + 1];
      const basename = argv[argv.indexOf('--basename') + 1];
      fs.mkdirSync(outDir, { recursive: true });
      // How many figure directories exist AT THIS MOMENT. A real prepare leaves ~14 MB behind,
      // so this is the peak-disk invariant measured directly rather than through a proxy field.
      fn.liveDirs.push(fs.readdirSync(path.dirname(outDir)).length);
      const payload = plan.prepare ? plan.prepare(basename, outDir) : {};
      if (payload.__fail) {
        fs.writeFileSync(
          path.join(outDir, 'prepare.json'),
          JSON.stringify({ error: payload.__fail, warnings: [] })
        );
        return { status: 1, stdout: '', stderr: payload.__fail };
      }
      const metaStem = payload.__meta || basename;
      fs.writeFileSync(
        path.join(outDir, 'meta.json'),
        JSON.stringify({ source: path.join(outDir, `${metaStem}.pdf`) })
      );
      fs.writeFileSync(
        path.join(outDir, 'prepare.json'),
        JSON.stringify({
          basename,
          source: `/fake/artwork/${basename}.pdf`,
          blocks: 0,
          sendable: 0,
          undecodedBlocks: 0,
          verbatimBlocks: 0,
          missingFontBlocks: 0,
          chars: 0,
          artworkSvgPath: path.join(outDir, 'artwork.svg'),
          imageXObjects: 1,
          paintOps: 0,
          formTextXObjects: 0,
          warnings: [],
          ...payload,
        })
      );
      return { status: 0, stdout: '', stderr: '' };
    }
    throw new Error(`fakeSpawn was asked for an unexpected stage: ${stage}`);
  };
  fn.calls = calls;
  fn.liveDirs = [];
  fn.countOf = (stage) => calls.filter((c) => c.stage === stage).length;
  return fn;
}

const CH04 = { book: 'efnafraedi-2e', chapter: '4', modules: null, figures: null, dryRun: true };

// ─────────────────────────────────────────────────────────────────────────────────────────
describe('parseCli', () => {
  it('parses a minimal dry run', () => {
    const args = parseCli(['--book', 'efnafraedi-2e', '--chapter', '4', '--dry-run']);
    expect(args.book).toBe('efnafraedi-2e');
    expect(args.chapter).toBe('4');
    expect(args.dryRun).toBe(true);
  });

  // 🔴 THE PLAN'S OWN SKELETON READ `args.dryRun` WHERE ITS parseCli ONLY EVER SET
  // `args['dry-run']`, so every consumer written that way would have run LIVE. The key must
  // not merely be absent from a lookup — it must be absent from the object.
  it('normalises dry-run to dryRun and leaves NO "dry-run" key behind', () => {
    const args = parseCli(['--book', 'b', '--chapter', '1', '--dry-run']);
    expect(Object.keys(args)).not.toContain('dry-run');
    expect(args.dryRun).toBe(true);
  });

  it('leaves dryRun false when --dry-run is absent (the control for the test above)', () => {
    expect(parseCli(['--book', 'b', '--chapter', '1']).dryRun).toBe(false);
  });

  it('REFUSES an unknown flag rather than dropping it', () => {
    expect(() => parseCli(['--book', 'b', '--chapter', '1', '--output-dir', '/tmp/x'])).toThrow(
      /Unknown argument: --output-dir/
    );
  });

  it('REFUSES a valued flag whose value is missing', () => {
    expect(() => parseCli(['--book', 'b', '--chapter'])).toThrow(/--chapter needs a value/);
  });

  // 🔴 `--book --dry-run` used to parse as {book: '--dry-run', dryRun: FALSE}: the operator
  // asked for a dry run and would have got a PAID one, the safety flag eaten by the slug.
  it('REFUSES a valued flag whose value begins with --, rather than eating the next flag', () => {
    expect(() => parseCli(['--chapter', '1', '--book', '--dry-run'])).toThrow(
      /--book needs a value/
    );
  });

  it('requires --book and --chapter', () => {
    expect(() => parseCli(['--chapter', '1'])).toThrow(/--book is required/);
    expect(() => parseCli(['--book', 'b'])).toThrow(/--chapter is required/);
  });

  it('collects --module and --figure both repeated and comma-separated', () => {
    const args = parseCli([
      '--book',
      'b',
      '--chapter',
      '1',
      '--module',
      'm1,m2',
      '--module',
      'm3',
      '--figure',
      'F1',
    ]);
    expect(args.modules).toEqual(['m1', 'm2', 'm3']);
    expect(args.figures).toEqual(['F1']);
  });

  it('every refusal is a CliError carrying exit code 2', () => {
    try {
      parseCli(['--nope']);
      throw new Error('parseCli accepted an unknown flag');
    } catch (err) {
      expect(err).toBeInstanceOf(CliError);
      expect(err.code).toBe(2);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────
describe('normaliseTranslations', () => {
  // ⚠️ RELABELLED, not new: an ARC block's value is written as a BARE STRING
  // (`translate-blocks.mjs`: `out[b.key] = b.arc ? got : [got]`). `Array.isArray(v) ? v[0] : v`
  // discriminates the two shapes exactly; a naive `v[0]` would yield 'S'.
  it("passes an ARC block's bare string through unchanged", () => {
    const r = normaliseTranslations({ blocks: { A: 'Suðumark' } });
    expect(r.blocks).toEqual({ A: 'Suðumark' });
    expect(r.blocks.A).not.toBe('S'); // the naive v[0] control
  });

  it('unwraps a non-arc block, which is written as a one-element array', () => {
    expect(normaliseTranslations({ blocks: { A: ['Suðumark vatns'] } }).blocks).toEqual({
      A: 'Suðumark vatns',
    });
  });

  // 🔴 D9: an empty MT value must not vanish silently — that is English left in the image with
  // no review row to notice it.
  it('REPORTS what it dropped rather than only returning survivors', () => {
    const r = normaliseTranslations({ blocks: { A: [''], B: ['ok'] } });
    expect(r.blocks).toEqual({ B: 'ok' });
    expect(r.dropped).toEqual(['A']);
  });

  it('drops nothing when every value is usable (the control for the test above)', () => {
    const r = normaliseTranslations({ blocks: { A: ['x'], B: 'y' } });
    expect(r.blocks).toEqual({ A: 'x', B: 'y' });
    expect(r.dropped).toEqual([]);
  });

  it('treats a whitespace-only value as dropped, not as a translation', () => {
    expect(normaliseTranslations({ blocks: { A: ['   '] } }).dropped).toEqual(['A']);
  });

  it('survives a payload with no blocks at all', () => {
    expect(normaliseTranslations(null)).toEqual({ blocks: {}, dropped: [] });
    expect(normaliseTranslations({})).toEqual({ blocks: {}, dropped: [] });
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────
describe('isStale', () => {
  // D3: "already done" is derived from the hashes, never from a file existing.
  it('treats a sidecar with no composedHash as NOT current — paid for but never published', () => {
    expect(isStale({ renderHash: 'aaa' })).toBe(true);
  });

  it('treats an absent sidecar as stale', () => {
    expect(isStale(null)).toBe(true);
  });

  it('treats a composedHash that disagrees with renderHash as stale', () => {
    expect(isStale({ renderHash: 'aaa', composedHash: 'bbb' })).toBe(true);
  });

  // 🔴 THE POSITIVE CONTROL. Without it "current" is never proven reachable and every
  // assertion above passes on a function that returns true unconditionally.
  it('treats a published sidecar whose blocks still hash to renderHash as CURRENT', () => {
    const blocks = { 'Boiling|point': 'Suðumark' };
    const renderHash = computeRenderHash(blocks, COMPOSER_VERSION);
    expect(isStale({ blocks, renderHash, composedHash: renderHash })).toBe(false);
  });

  it('goes stale when the blocks no longer hash to the recorded renderHash', () => {
    const blocks = { 'Boiling|point': 'Suðumark' };
    const renderHash = computeRenderHash(blocks, COMPOSER_VERSION);
    expect(
      isStale({ blocks: { 'Boiling|point': 'Annað' }, renderHash, composedHash: renderHash })
    ).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────
describe('enumerateChapterFigures — R7: every image, and which ones the panel can show', () => {
  it('enumerates every image, and flags which ones the review panel can show', () => {
    const found = enumerateChapterFigures('efnafraedi-2e', 4);
    expect(found.figures.length).toBeGreaterThan(0); // non-vacuity
    expect(new Set(found.figures.map((f) => f.basename)).size).toBe(found.figures.length);
    expect(found.figures.every((f) => !f.basename.includes('/'))).toBe(true);
    expect(found.figures.some((f) => f.reviewable)).toBe(true); // both classes present,
    expect(found.figures.some((f) => !f.reviewable)).toBe(true); // or this proves nothing
  });

  it('partitions the enumerated set into reviewable and unreviewable, by NAME', () => {
    const found = enumerateChapterFigures('efnafraedi-2e', 4);
    expect(found.reviewable.length + found.unreviewable.length).toBe(found.figures.length);
    expect([...found.reviewable, ...found.unreviewable].sort()).toEqual(
      found.figures.map((f) => f.basename).sort()
    );
  });

  // ⚠️ appendices are the -1 sentinel. `Number('appendices')` is NaN and `chapterDir(NaN)` is
  // 'chNaN', so this must go through normalizeChapter — the PARSER — and not through Number()
  // nor through cliChapterArg, which runs the other way (integer -> CLI string).
  it('accepts appendices as a chapter', () => {
    const found = enumerateChapterFigures('efnafraedi-2e', 'appendices');
    expect(found.chapterDir).toBe('appendices');
    expect(found.figures.length).toBeGreaterThan(0);
  });

  it('REFUSES a chapter it cannot parse, rather than reading chNaN', () => {
    expect(() => enumerateChapterFigures('efnafraedi-2e', 'four')).toThrow(/chapter/i);
  });

  it('restricts to --module and keeps the caller order', () => {
    const found = enumerateChapterFigures('efnafraedi-2e', 4, { modules: ['m68730'] });
    expect(found.moduleIds).toEqual(['m68730']);
    expect(found.figures.every((f) => f.moduleId === 'm68730')).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────
// 🔴 ch04 carries ZERO hashed basenames, so this whole path is invisible to every other test
// in this file. ch03 carries nine, and the artwork is delivered under the STRIPPED name — so
// the de-hash is the only way those figures resolve at all, and getting it wrong in the other
// direction (letting the stripped name become the identity) is the `basename-mismatch` refusal
// that lands AFTER the money is spent.
describe('the de-hash is LOOKUP-ONLY: it finds artwork, it never renames a figure', () => {
  const CH03 = {
    book: 'efnafraedi-2e',
    chapter: '3',
    modules: null,
    figures: null,
    dryRun: true,
  };
  const isHashed = (name) => /-[0-9a-f]{4}$/.test(name);
  /** Artwork exists under the stripped name only — chemistry's actual delivery for these nine. */
  const strippedOnly = {
    resolve: (n) =>
      isHashed(n) ? null : { path: `/fake/artwork/${n}.pdf`, edition: 'first-edition' },
  };

  it('resolves a hashed figure through its stripped name, in a SECOND resolver pass', async () => {
    const spawn = fakeSpawn(strippedOnly);
    const result = await runFigures(CH03, { spawn });
    const hashed = result.figures.filter((f) => isHashed(f.basename));
    expect(hashed.length).toBeGreaterThan(0); // non-vacuity: ch03 really carries them
    expect(hashed.every((f) => f.resolvedVia === 'de-hashed')).toBe(true);
    expect(result.tally.unresolved).toBe(0);
    // The fallback fired: one batch for everything, a second for the hashed misses.
    expect(spawn.countOf('resolve')).toBe(2);
    // CONTROL: the unhashed figures went through the FIRST pass, so "de-hashed" is not just
    // what this driver labels everything.
    expect(result.figures.some((f) => f.resolvedVia === 'basename')).toBe(true);
  });

  it('spends no second resolver pass on a chapter with no hashed basenames', async () => {
    const spawn = fakeSpawn();
    await runFigures(CH04, { spawn });
    expect(spawn.countOf('resolve')).toBe(1);
  });

  // 🔴 THE IDENTITY. Every stage downstream keys on the UNSTRIPPED CNXML basename — the
  // sidecar filename, the --out directory, the image-mapping entry — and publish cross-checks
  // meta.json against it. Preparing a figure under its stripped name is exactly how a paid
  // figure gets refused `basename-mismatch` for ever.
  it('prepares every figure under its own unstripped basename, in its own directory', async () => {
    const spawn = fakeSpawn(strippedOnly);
    const result = await runFigures(CH03, { spawn });
    const prepares = spawn.calls.filter((c) => c.stage === 'prepare');
    expect(prepares.length).toBe(result.figures.length);
    const enumerated = new Set(result.figures.map((f) => f.basename));
    for (const call of prepares) {
      const basename = call.argv[call.argv.indexOf('--basename') + 1];
      const outDir = call.argv[call.argv.indexOf('--out') + 1];
      expect(enumerated.has(basename)).toBe(true); // never a stripped name
      expect(path.basename(outDir)).toBe(basename); // and the directory agrees with it
    }
    // …and each hashed figure was prepared, under its hashed name, from stripped artwork.
    for (const f of result.figures.filter((x) => isHashed(x.basename))) {
      expect(f.artwork).toBe(`/fake/artwork/${f.basename.replace(/-[0-9a-f]{4}$/, '')}.pdf`);
    }
  });

  it('still reports a hashed figure unresolved when neither name has artwork', async () => {
    const spawn = fakeSpawn({ resolve: () => null });
    const result = await runFigures(CH03, { spawn });
    expect(result.tally.unresolved).toBe(result.figures.length);
    expect(result.verdict.ok).toBe(true); // R9: named, never fatal
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────
describe('the dry run spends nothing and writes nothing', () => {
  // 🔴 THE MONEY TEST. Assert on a SPAWN COUNTER, never on arguments — an argument check
  // passes just as happily against a call that was made with the wrong flags.
  it('spawns translate-blocks.mjs ZERO times, having actually done the work', async () => {
    const spawn = fakeSpawn();
    const result = await runFigures(CH04, { spawn });
    expect(spawn.countOf('translate')).toBe(0);
    // ⚠️ AN ALLOWLIST, NOT A BLOCKLIST. Counting the one stage named 'translate' is trivially
    // zero while no such call site exists; asserting that the ONLY stages a dry run reaches are
    // resolve and prepare fires on ANY stage 6b adds through this seam, whatever it is called.
    expect([...new Set(spawn.calls.map((c) => c.stage))].sort()).toEqual(['prepare', 'resolve']);
    // The controls, in the SAME run: it did enumerate, and it did reach the prepare stage.
    expect(result.figures.length).toBeGreaterThan(10);
    expect(spawn.countOf('prepare')).toBeGreaterThan(0);
    expect(result.enumerated).toBe(result.figures.length);
  });

  it('asserts its own partition: the tally sums to the enumerated count', async () => {
    const result = await runFigures(CH04, { spawn: fakeSpawn() });
    const summed = Object.values(result.tally).reduce((n, v) => n + v, 0);
    expect(summed).toBe(result.figures.length);
    expect(summed).toBeGreaterThan(0);
  });

  it('leaves the working tree untouched', async () => {
    const before = porcelain();
    await runFigures(CH04, { spawn: fakeSpawn() });
    expect(porcelain()).toBe(before);

    // 🔴 NON-VACUITY: prove the instrument would have SEEN a write, in exactly the place the
    // driver would make one — books/<slug>/figure-text/, the sidecar directory.
    const probeDir = path.join(REPO_ROOT, 'books', 'efnafraedi-2e', 'figure-text');
    const probe = path.join(probeDir, '__porcelain_control__.is.json');
    const dirExisted = fs.existsSync(probeDir);
    try {
      fs.mkdirSync(probeDir, { recursive: true });
      fs.writeFileSync(probe, '{}');
      expect(porcelain()).not.toBe(before);
    } finally {
      fs.rmSync(probe, { force: true });
      if (!dirExisted) fs.rmSync(probeDir, { recursive: true, force: true });
    }
    expect(porcelain()).toBe(before);
  });

  it('removes its temporary tree', async () => {
    const result = await runFigures(CH04, { spawn: fakeSpawn() });
    expect(result.tmpRoot).toBeTruthy();
    expect(fs.existsSync(result.tmpRoot)).toBe(false);
  });

  // 🔴 PEAK DISK, NOT JUST FINAL DISK. One prepared figure is ~14 MB and /tmp here is a 4.9 GB
  // tmpfs that routinely runs over 90% full, so a dry run that kept all 30 of ch04 would use
  // ~420 MB and a whole book ~16 GB — an ENOSPC that reads as a code fault. Removing the tree
  // at the END is not enough; each figure's directory must go as soon as it is classified.
  it('never holds more than one figure directory at a time in a dry run', async () => {
    const spawn = fakeSpawn();
    const result = await runFigures(CH04, { spawn });
    expect(spawn.liveDirs.length).toBeGreaterThan(10); // non-vacuity: it really did prepare
    expect(Math.max(...spawn.liveDirs)).toBe(1);
    expect(result.figures.every((f) => f.outDir === null)).toBe(true);
  });

  it('REFUSES to run live: the paid half is Task 6b, and it spawns nothing', async () => {
    const spawn = fakeSpawn();
    const code = await main(['--book', 'efnafraedi-2e', '--chapter', '4'], { spawn });
    expect(code).toBe(2);
    expect(spawn.calls.length).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────
describe('the pre-flight refusals that a dry run exists to surface', () => {
  it('files a prepare that exited non-zero as failed-prepare, not as text-less', async () => {
    const spawn = fakeSpawn({
      prepare: (b) => (b.startsWith('CNX_Chem_04_01') ? { __fail: 'ghostscript blew up' } : {}),
    });
    const result = await runFigures(CH04, { spawn });
    expect(result.tally['failed-prepare']).toBeGreaterThan(0);
    expect(result.verdict.ok).toBe(false);
    const bad = result.figures.find((f) => f.outcome === 'failed-prepare');
    expect(bad.reason).toMatch(/ghostscript blew up/);
  });

  // 🔴 THE IDENTITY SEAM. `publishFigureSvg` cross-checks basenameFromMeta(meta.json) against
  // the sidecar key and refuses `basename-mismatch` — AFTER the figure has been paid for, on
  // every run, for ever. meta.json exists the moment prepare returns, so the check is free.
  it('REFUSES a figure whose meta.json names a different figure', async () => {
    const spawn = fakeSpawn({
      prepare: (b) => (b === 'CNX_Chem_04_04_limiting' ? { __meta: 'SOME_OTHER_FIGURE' } : {}),
    });
    const result = await runFigures(CH04, { spawn });
    const rec = result.figures.find((f) => f.basename === 'CNX_Chem_04_04_limiting');
    expect(rec.outcome).toBe('failed-prepare');
    expect(rec.reason).toMatch(/basename-mismatch/);
  });

  // The positive control for the test above: with meta.json naming the right figure, the same
  // figure classifies normally. Without this the mismatch test passes against a driver that
  // refuses everything.
  it('accepts a figure whose meta.json names it, and classifies it', async () => {
    const spawn = fakeSpawn({
      prepare: () => ({ sendable: 3, chars: 40, blocks: 3 }),
    });
    const result = await runFigures(CH04, { spawn });
    const rec = result.figures.find((f) => f.basename === 'CNX_Chem_04_04_limiting');
    expect(rec.outcome).toBe('translated');
    expect(result.tally['failed-prepare']).toBe(0);
  });

  it('names an unresolved figure instead of failing the run over it (R9)', async () => {
    const spawn = fakeSpawn({
      resolve: (n) =>
        n === 'CNX_Chem_04_05_filter'
          ? null
          : { path: `/fake/artwork/${n}.pdf`, edition: 'first-edition' },
    });
    const result = await runFigures(CH04, { spawn });
    expect(result.tally.unresolved).toBe(1);
    expect(result.verdict.ok).toBe(true);
    expect(summarise(result)).toContain('CNX_Chem_04_05_filter');
  });

  // 🔴 A RESOLVER FAILURE MUST ABORT, NEVER BECOME N x unresolved. sources.py raises SystemExit
  // when a CONFIGURED artwork tree is not mounted, precisely so a per-figure `except` cannot
  // swallow it into a skip; catching the failed spawn and tallying every figure `unresolved`
  // would rebuild that defect one process up.
  it('ABORTS when the resolver itself fails, rather than filing every figure unresolved', async () => {
    const spawn = fakeSpawn();
    const failing = (call) =>
      call.stage === 'resolve'
        ? {
            status: 1,
            stdout: '',
            stderr: "Source tree 'updates-2e' is configured but is not a directory",
          }
        : spawn(call);
    await expect(runFigures(CH04, { spawn: failing })).rejects.toThrow(/updates-2e/);
  });

  it('REFUSES when --figure matches nothing, instead of exiting 0 having done nothing', async () => {
    const spawn = fakeSpawn();
    const code = await main(
      ['--book', 'efnafraedi-2e', '--chapter', '4', '--dry-run', '--figure', 'NO_SUCH_FIGURE'],
      { spawn }
    );
    expect(code).not.toBe(0);
    expect(spawn.countOf('prepare')).toBe(0);
  });

  it('runs the figure --figure DOES match (the control for the test above)', async () => {
    const spawn = fakeSpawn();
    const code = await main(
      [
        '--book',
        'efnafraedi-2e',
        '--chapter',
        '4',
        '--dry-run',
        '--figure',
        'CNX_Chem_04_04_limiting',
      ],
      { spawn }
    );
    expect(code).toBe(0);
    expect(spawn.countOf('prepare')).toBe(1);
  });

  it('REFUSES when --module names a file that does not exist', async () => {
    const spawn = fakeSpawn();
    const code = await main(
      ['--book', 'efnafraedi-2e', '--chapter', '4', '--dry-run', '--module', 'm00000'],
      { spawn }
    );
    expect(code).not.toBe(0);
    expect(spawn.countOf('prepare')).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────
describe('summarise', () => {
  let base;
  beforeAll(async () => {
    base = await runFigures(CH04, { spawn: fakeSpawn() });
  });

  // 🔴 N1: the check the old test was NAMED for but did not perform. The old one grepped the
  // source for `outcome: '<literal>'`, which is not the partition check at all and is defeated
  // by the idiomatic `` `failed-${stage}` `` form.
  it('asserts the partition at RUNTIME and fails when it does not sum', () => {
    expect(() => summarise(base)).not.toThrow(); // control: an honest result summarises
    const tampered = {
      ...base,
      tally: { ...base.tally, 'copied-photo': base.tally['copied-photo'] + 1 },
    };
    expect(() => summarise(tampered)).toThrow(/partition/i);
  });

  it('NAMES the translated figures the review panel cannot show', async () => {
    const spawn = fakeSpawn({ prepare: () => ({ sendable: 2, chars: 30, blocks: 2 }) });
    const result = await runFigures(CH04, { spawn });
    const gap = result.figures.filter((f) => f.outcome === 'translated' && !f.reviewable);
    expect(gap.length).toBeGreaterThan(0); // non-vacuity: the R7 gap is real on ch04
    const text = summarise(result);
    for (const f of gap) expect(text).toContain(f.basename);
  });

  it('labels the mode, so a dry run is not byte-identical to a live one', () => {
    expect(summarise(base)).not.toBe(summarise({ ...base, mode: 'live' }));
    expect(summarise(base)).toMatch(/DRY RUN/);
  });

  it('reports every outcome the run produced with a non-zero count', () => {
    const text = summarise(base);
    for (const [outcome, n] of Object.entries(base.tally)) {
      if (n > 0) expect(text).toContain(outcome);
    }
  });

  it('says when 02-structure is absent rather than blaming the review panel', () => {
    const text = summarise({ ...base, structureDirExists: false });
    expect(text).toMatch(/02-structure/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────
describe('the image-mapping pre-flight', () => {
  // All three arms, driven directly: the corpus test below can only see the two arms ch04
  // happens to contain today, and `unmintable` is the arm that costs money when it is wrong.
  it('reports an existing entry as mapped, and carries its outputName', () => {
    const mapped = new Map([['A', { originalImage: 'A', outputName: 'A_WHATEVER.svg' }]]);
    expect(mappingPreflight('A', { mapped, mintIndex: new Set() })).toEqual({
      status: 'mapped',
      // NOT rebuilt from DEFAULT_SUFFIX: the entry is the only source of the published name.
      outputName: 'A_WHATEVER.svg',
    });
  });

  it('reports a basename the minter can see as mintable', () => {
    const r = mappingPreflight('A', { mapped: new Map(), mintIndex: new Set(['A']) });
    expect(r.status).toBe('mintable');
    expect(r.outputName).toMatch(/^A.*\.svg$/);
  });

  // 🔴 THE ARM THAT COSTS MONEY. A basename the minter's own scan cannot see never gets an
  // entry, so publish-figure-svg.js refuses `unmapped` AFTER the MT has been paid for.
  it('reports a basename the minter cannot see as unmintable', () => {
    expect(mappingPreflight('A', { mapped: new Map(), mintIndex: new Set(['B']) })).toEqual({
      status: 'unmintable',
      outputName: null,
    });
  });

  // 🔴 THE DOWNGRADE. A figure nothing can ever publish must not be reported `translated` —
  // the run would go green and the next paid run would buy it again.
  it('downgrades an unmintable figure from translated to failed-publish', () => {
    const rec = { basename: 'A', outcome: 'translated', reason: null, mapping: null };
    applyMappingPreflight(rec, { mapped: new Map(), mintIndex: new Set(['B']) });
    expect(rec.outcome).toBe('failed-publish');
    expect(rec.reason).toMatch(/unmapped/);
  });

  it('leaves a mintable figure translated (the control for the downgrade)', () => {
    const rec = { basename: 'A', outcome: 'translated', reason: null, mapping: null };
    applyMappingPreflight(rec, { mapped: new Map(), mintIndex: new Set(['A']) });
    expect(rec.outcome).toBe('translated');
    expect(rec.mapping.status).toBe('mintable');
  });

  it('does not pre-flight an outcome that publishes nothing', () => {
    const rec = { basename: 'A', outcome: 'unresolved', reason: null, mapping: null };
    applyMappingPreflight(rec, { mapped: new Map(), mintIndex: new Set() });
    expect(rec.outcome).toBe('unresolved');
    expect(rec.mapping).toBe(null);
  });

  it('reports the already-mapped and the mintable separately', async () => {
    const result = await runFigures(CH04, { spawn: fakeSpawn() });
    const statuses = new Set(result.figures.map((f) => f.mapping.status));
    expect(statuses.has('mapped')).toBe(true); // ch04 has both, today
    expect(statuses.has('mintable')).toBe(true);
    expect(statuses.has('unmintable')).toBe(false);
  });

  it('the tally still sums when a figure is downgraded (partition survives the pre-flight)', async () => {
    const result = await runFigures(CH04, { spawn: fakeSpawn() });
    const summed = Object.values(result.tally).reduce((n, v) => n + v, 0);
    expect(summed).toBe(result.figures.length);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────
describe('the outcome vocabulary is Task 1’s, not a second copy', () => {
  it('every per-figure outcome is a key of emptyTally()', async () => {
    const result = await runFigures(CH04, { spawn: fakeSpawn() });
    const slots = emptyTally();
    for (const f of result.figures) {
      expect(() => tallyOutcome(slots, f.outcome)).not.toThrow();
    }
  });
});

afterAll(() => {
  // Nothing should be left behind, but a leaked figure-run-* tree in a 4.9 GB tmpfs is the
  // kind of thing that surfaces as an unrelated EIO three days later.
  for (const name of fs.readdirSync('/tmp')) {
    if (name.startsWith('figure-run-')) {
      fs.rmSync(path.join('/tmp', name), { recursive: true, force: true });
    }
  }
});
