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
  dehashStemClaims,
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

  // The two flags Task 6b added. Both are BOOLEANS: putting either in VALUED_FLAGS would make
  // the bare `--stale` a usage error. Neither can cause a purchase — that is proven in
  // `figure-run-paid.test.js`, where the assertion is a spawn counter.
  it('parses --stale and --force as booleans', () => {
    const args = parseCli(['--book', 'b', '--chapter', '1', '--stale', '--force', '--dry-run']);
    expect(args.stale).toBe(true);
    expect(args.force).toBe(true);
  });

  it('leaves --stale and --force false when absent (the control for the test above)', () => {
    const args = parseCli(['--book', 'b', '--chapter', '1', '--dry-run']);
    expect(args.stale).toBe(false);
    expect(args.force).toBe(false);
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
    expect(
      isStale({ blocks, renderHash, composedHash: renderHash, composedVersion: COMPOSER_VERSION })
    ).toBe(false);
  });

  // 🔴 …AND `composedVersion` IS PART OF "PUBLISHED". Its absence means "I do not know which
  // composer drew this SVG", which fails safe exactly as an absent `composedHash` does: one
  // recompose, 0 ISK, and the stamp then lands. Same pair of assertions one field apart, so a
  // reader can see which field carries the difference.
  it('treats the same sidecar with NO composedVersion as stale', () => {
    const blocks = { 'Boiling|point': 'Suðumark' };
    const renderHash = computeRenderHash(blocks, COMPOSER_VERSION);
    expect(isStale({ blocks, renderHash, composedHash: renderHash })).toBe(true);
  });

  it('goes stale when the blocks no longer hash to the recorded renderHash', () => {
    const blocks = { 'Boiling|point': 'Suðumark' };
    const renderHash = computeRenderHash(blocks, COMPOSER_VERSION);
    expect(
      isStale({
        blocks: { 'Boiling|point': 'Annað' },
        renderHash,
        composedHash: renderHash,
        composedVersion: COMPOSER_VERSION,
      })
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

  // 🔴 THIS REPLACES 'REFUSES to run live: the paid half is Task 6b'. That guard is GONE —
  // Task 6b built the live path, so `main` without `--dry-run` now buys, writes and publishes.
  // The live behaviour is proven in `figure-run-paid.test.js`, against a THROWAWAY books tree.
  // What this file needs instead is a tripwire on ITSELF: it drives the real
  // `books/efnafraedi-2e`, so one invocation here that forgets `--dry-run` would write a
  // sidecar, a mapping entry and an SVG into the tracked corpus.
  it('never runs the live path: every invocation in THIS file is a dry run', () => {
    const src = fs.readFileSync(path.join(HERE, 'figure-run-free.test.js'), 'utf-8');
    expect(CH04.dryRun).toBe(true); // the shared arg object every describe here reuses
    expect(src).not.toMatch(/dryRun:\s*false/); // …and no local one overrides it
    const mainCalls = src.match(/main\(\s*\[[^\]]*\]/g) || [];
    expect(mainCalls.length).toBeGreaterThan(2); // non-vacuity: the pattern really finds them
    expect(mainCalls.filter((c) => !c.includes('--dry-run'))).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────
// 🔴 THIS BRANCH HAD NO EXERCISER, AND TWO MUTATIONS OF IT SURVIVED ALL 57 TESTS.
// `books/efnafraedi-2e/figure-text/` does not exist — the campaign has minted no sidecar for a
// real book yet — so `readSidecar` returns null for every figure of every chapter, `&&`
// short-circuits, and no corpus-driven test can reach `isStale` through `runFigures` at all.
// The reader is injected rather than planted on disk, because a test that writes into `books/`
// would violate the invariant the suite next door exists to prove.
describe('a figure whose sidecar is current is skipped before anything is spent', () => {
  const TARGET = 'CNX_Chem_04_04_limiting';
  const blocks = { 'Boiling|point': 'Suðumark' };
  const currentHash = computeRenderHash(blocks, COMPOSER_VERSION);
  const only = (basename, sidecar) => (_bookDir, name) => (name === basename ? sidecar : null);

  it('skips a published, current figure — no resolve, no prepare', async () => {
    const spawn = fakeSpawn();
    const result = await runFigures(CH04, {
      spawn,
      readSidecar: only(TARGET, {
        blocks,
        renderHash: currentHash,
        composedHash: currentHash,
        composedVersion: COMPOSER_VERSION,
      }),
    });
    const rec = result.figures.find((f) => f.basename === TARGET);
    expect(rec.outcome).toBe('skipped-current');
    expect(result.tally['skipped-current']).toBe(1);
    // It cost nothing: one fewer prepare, and the resolver was never even asked about it.
    expect(spawn.countOf('prepare')).toBe(result.figures.length - 1);
    const resolveCall = spawn.calls.find((c) => c.stage === 'resolve');
    expect(resolveCall.argv).not.toContain(TARGET);
    expect(Object.values(result.tally).reduce((n, v) => n + v, 0)).toBe(result.figures.length);
  });

  // 🔴 THE CONTROL, AND IT IS THE ONE THAT MATTERS FOR MONEY. A sidecar with `renderHash` and
  // no `composedHash` was PAID FOR AND NEVER PUBLISHED. Skipping it would strand that spend for
  // ever, so it must go through prepare like any other figure.
  it('does NOT skip a figure that was paid for and never published', async () => {
    const spawn = fakeSpawn();
    const result = await runFigures(CH04, {
      spawn,
      readSidecar: only(TARGET, { blocks, renderHash: currentHash }),
    });
    const rec = result.figures.find((f) => f.basename === TARGET);
    expect(rec.outcome).not.toBe('skipped-current');
    expect(result.tally['skipped-current']).toBe(0);
    expect(spawn.countOf('prepare')).toBe(result.figures.length);
  });

  it('does not skip anything when no figure has a sidecar (the real corpus today)', async () => {
    const result = await runFigures(CH04, { spawn: fakeSpawn() });
    expect(result.tally['skipped-current']).toBe(0);
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
  // `bookDir` is required now: the pre-flight also asks whether an already-MAPPED entry could be
  // published at all, and containment is answered against the book's own media/ directory.
  const BOOK = path.join(REPO_ROOT, 'books', 'efnafraedi-2e');
  it('downgrades an unmintable figure from translated to failed-publish', () => {
    const rec = { basename: 'A', outcome: 'translated', reason: null, mapping: null };
    applyMappingPreflight(rec, { mapped: new Map(), mintIndex: new Set(['B']), bookDir: BOOK });
    expect(rec.outcome).toBe('failed-publish');
    expect(rec.reason).toMatch(/unmapped/);
  });

  it('leaves a mintable figure translated (the control for the downgrade)', () => {
    const rec = { basename: 'A', outcome: 'translated', reason: null, mapping: null };
    applyMappingPreflight(rec, { mapped: new Map(), mintIndex: new Set(['A']), bookDir: BOOK });
    expect(rec.outcome).toBe('translated');
    expect(rec.mapping.status).toBe('mintable');
  });

  it('does not pre-flight an outcome that publishes nothing', () => {
    const rec = { basename: 'A', outcome: 'unresolved', reason: null, mapping: null };
    applyMappingPreflight(rec, { mapped: new Map(), mintIndex: new Set(), bookDir: BOOK });
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

// ─────────────────────────────────────────────────────────────────────────────────────────
// 🔴 integration/F1 — TWO DIFFERENT FIGURES, ONE ARTWORK FILE, AND NOTHING DOWNSTREAM CAN SEE IT.
//
// The de-hash fallback assumed the stripped→delivered map is INJECTIVE. On chemistry ch21 it is
// not: `CNX_Chem_21_03_RadioDecay-d92b` (m68852, a table of PARTICLE types) and
// `CNX_Chem_21_03_RadioDecay-e619` (m68854, a table of DECAY types) are different pictures,
// neither resolves directly, and both strip to `CNX_Chem_21_03_RadioDecay`. Both were handed the
// SAME PDF: the MT bought twice for one picture, and `-d92b` published the decay table under the
// particle-types caption and alt text, in Icelandic, with VERDICT ok.
//
// 🔴 NOTHING DOWNSTREAM COULD CATCH IT, WHICH IS WHY THE GUARD BELONGS HERE. `figure-prepare.py`
// stages the artwork AS the requested basename, so `basenameFromMeta(meta.json) === rec.basename`
// compares the name with ITSELF whatever picture was staged; `publishFigureSvg`'s
// `basename-mismatch` reads that same meta.json; and `figure-compose.py`'s key-set assertions
// compare the sidecar against a blocks.json derived from the same wrong artwork.
describe('the de-hash refuses a CONTESTED stem rather than guessing which figure owns it', () => {
  const CH21 = { book: 'efnafraedi-2e', chapter: '21', modules: null, figures: null, dryRun: true };
  const D92B = 'CNX_Chem_21_03_RadioDecay-d92b';
  const E619 = 'CNX_Chem_21_03_RadioDecay-e619';
  const STEM = 'CNX_Chem_21_03_RadioDecay';
  const isHashed = (name) => /-[0-9a-f]{4}$/.test(name);
  const strippedOnly = {
    resolve: (n) =>
      isHashed(n) ? null : { path: `/fake/artwork/${n}.pdf`, edition: 'first-edition' },
  };

  // 🔴 ANCHORED ON THE CORPUS, WITH BOTH DIRECTIONS. ch21 is the live exerciser; ch03's nine
  // hashed figures are the positive control that the predicate does not simply call everything
  // contested. Re-derived with the driver's own enumeration, not with a regex over the CNXML.
  it('names exactly the ch21 pair from the real CNXML, and nothing in ch03', () => {
    const ch21 = enumerateChapterFigures('efnafraedi-2e', '21').figures.map((f) => f.basename);
    const ch03 = enumerateChapterFigures('efnafraedi-2e', '3').figures.map((f) => f.basename);
    expect(ch21.filter(isHashed).sort()).toEqual([D92B, E619]);
    expect(ch03.filter(isHashed).length).toBe(9); // non-vacuity: ch03 really is hashed-bearing

    const contested = dehashStemClaims(ch21);
    expect([...contested.keys()]).toEqual([STEM]);
    expect(contested.get(STEM)).toEqual([D92B, E619]);
    expect([...dehashStemClaims(ch03).keys()]).toEqual([]); // the control
  });

  // An UNHASHED figure enumerated beside a hashed one claims the stem too: the artwork under
  // that name is the unhashed figure's OWN picture, so de-hashing onto it is the same defect
  // with one of the two claimants arriving through the first resolver pass.
  it('counts an unhashed figure of the same name as a claimant', () => {
    const contested = dehashStemClaims(['FOO', 'FOO-abcd', 'BAR-1234']);
    expect([...contested.keys()]).toEqual(['FOO']);
    expect(contested.get('FOO')).toEqual(['FOO', 'FOO-abcd']);
  });

  it('leaves both ch21 figures unresolved, NAMED, rather than handing them one PDF', async () => {
    const spawn = fakeSpawn(strippedOnly);
    const result = await runFigures(CH21, { spawn });
    const d = result.figures.find((f) => f.basename === D92B);
    const e = result.figures.find((f) => f.basename === E619);
    for (const r of [d, e]) {
      expect(r.outcome).toBe('unresolved');
      expect(r.artwork).toBeNull();
      expect(r.reason).toContain(STEM);
      expect(r.reason).toContain(D92B);
      expect(r.reason).toContain(E619);
    }
    // …and the resolver was never even ASKED for the contested stem. Refusing after the answer
    // came back would leave the wrong path sitting in a variable one edit away from being used.
    const asked = spawn.calls.filter((c) => c.stage === 'resolve').flatMap((c) => c.argv);
    expect(asked).not.toContain(STEM);
    expect(asked).toContain(D92B); // the control: pass 1 really did ask about them
    // R9: unresolved is named, never fatal — so the run is still green and the operator reads
    // the reason. The money assertion for the whole file is elsewhere; this one is the picture.
    expect(result.verdict.ok).toBe(true);
    expect(summarise(result)).toContain(STEM);
  });

  // 🔴 THE SCOPE IS THE CHAPTER, NOT THE SELECTION. With `--figure` or `--module` naming only
  // ONE of the two claimants, the contest is invisible inside the run — and that is exactly the
  // invocation that would buy the wrong picture, because there is no second record to compare
  // against. A guard that looked only at the selected figures would be defeated by narrowing.
  it('still refuses when --figure names only one of the two claimants', async () => {
    const spawn = fakeSpawn(strippedOnly);
    const result = await runFigures({ ...CH21, figures: [D92B] }, { spawn });
    expect(result.figures).toHaveLength(1);
    expect(result.figures[0].outcome).toBe('unresolved');
    expect(result.figures[0].reason).toContain(E619); // it names the claimant NOT in this run
  });

  it('still refuses when --module names only one of the two claimants', async () => {
    const spawn = fakeSpawn(strippedOnly);
    const result = await runFigures({ ...CH21, modules: ['m68852'] }, { spawn });
    const d = result.figures.find((f) => f.basename === D92B);
    expect(d.outcome).toBe('unresolved');
    expect(d.reason).toContain(E619);
  });

  // The control for the three above: with only ONE claimant in the whole chapter the de-hash
  // still works. ch03's nine hashed figures all resolve through their stripped names.
  it('de-hashes ch03 exactly as before — the guard refuses the contest, not the fallback', async () => {
    const spawn = fakeSpawn(strippedOnly);
    const result = await runFigures(
      { book: 'efnafraedi-2e', chapter: '3', modules: null, figures: null, dryRun: true },
      { spawn }
    );
    const hashed = result.figures.filter((f) => isHashed(f.basename));
    expect(hashed).toHaveLength(9);
    expect(hashed.every((f) => f.resolvedVia === 'de-hashed')).toBe(true);
    expect(result.tally.unresolved).toBe(0);
  });

  // 🔴 THE BACKSTOP, WHICH THE STEM GUARD CANNOT REPLACE AND WHICH CANNOT REPLACE IT. The
  // invariant is "one artwork file, one figure", however the two got there — the resolver
  // itself can map two distinct names onto one delivered file. Measured 0 times on the corpus
  // today, which is why it needs a fabricated resolver to exercise at all.
  it('refuses two figures that the RESOLVER hands one file, with no de-hash involved', async () => {
    const spawn = fakeSpawn({
      resolve: () => ({ path: '/fake/artwork/ONE_FILE.pdf', edition: 'first-edition' }),
    });
    const result = await runFigures(CH04, { spawn });
    expect(result.figures.length).toBeGreaterThan(1); // non-vacuity
    expect(result.tally.unresolved).toBe(result.figures.length);
    expect(result.figures[0].reason).toContain('/fake/artwork/ONE_FILE.pdf');
    expect(spawn.countOf('prepare')).toBe(0); // nothing was prepared from the shared file
  });

  // The backstop's control: distinct files per figure, nothing refused.
  it('leaves figures with their own artwork alone (the backstop’s control)', async () => {
    const result = await runFigures(CH04, { spawn: fakeSpawn() });
    expect(result.tally.unresolved).toBe(0);
  });

  // 🔴 `summarise()` PRINTED NEITHER `artwork` NOR `resolvedVia`, so a --dry-run was silent
  // about which figures share a source — the one report an operator would have read before
  // spending. It must name the de-hashed ones with the file each was given.
  it('shows which artwork each de-hashed figure was given', async () => {
    const report = summarise(
      await runFigures(
        { book: 'efnafraedi-2e', chapter: '3', modules: null, figures: null, dryRun: true },
        { spawn: fakeSpawn(strippedOnly) }
      )
    );
    expect(report).toMatch(/de-hashed/);
    expect(report).toContain('CNX_Chem_03_02_moles-6296');
    expect(report).toContain('/fake/artwork/CNX_Chem_03_02_moles.pdf');
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────
// 🔴 dataflow/F3 — A FIGURE CAN BE `translated` AND STILL SHIP LABELS THE READ LAYER COULD NOT
// DECODE, AND NOTHING ANYWHERE SAID SO.
//
// `classifyFigure` tests `sendable > 0` before `undecodedBlocks > 0`; that ordering is CORRECT
// (the corpus case is a figure with both, and reversing it would file a mostly-translatable
// figure as unreadable). The defect is that the fact then reached nobody: the `unreadable-text`
// NOTE cannot fire for a `translated` figure, and `summarise` printed the `held=Nv/Nu/Nf` triple
// only inside the `copied-*` block. Measured 2026-09-07 on the real artwork of ch05 — the next
// chapter this driver is meant to walk:
//
//   figure-prepare.py  -> exit 0, "47 blocks, 28 sendable (held: 17 verbatim, 2 undecoded,
//                         0 missing-font) | 788 chars" + "!! undecodable font PAGE/TT1"
//   figure-compose.py  -> exit 0, and translated.svg carried TWO live <text> elements:
//                         <text …>(cid:127) 5% or less</text> / <text …>(cid:127) 20% or</text>
//   the decisive control: artwork.svg holds 0 `<text>` elements, so strip-text removed every
//                         label and every one of them is REDRAWN by compose — there is no path
//                         on which the original English survives instead.
//   the driver          -> "1 translated / 1 = enumerated / VERDICT ok", naming neither.
describe('labels the read layer could not decode are reported for EVERY outcome', () => {
  const FOODLABEL = 'CNX_Chem_05_02_FoodLabel';
  /** figure-prepare.py's real prepare.json for that artwork, field for field. */
  const foodLabel = {
    blocks: 47,
    sendable: 28,
    undecodedBlocks: 2,
    verbatimBlocks: 17,
    missingFontBlocks: 0,
    chars: 788,
    imageXObjects: 1,
    paintOps: 38,
    formTextXObjects: 0,
    warnings: [
      'subset font PAGE/TT0',
      'subset font PAGE/TT1',
      'subset font PAGE/TT2',
      'undecodable font PAGE/TT1',
    ],
  };
  const CH05 = (over = {}) => ({
    book: 'efnafraedi-2e',
    chapter: '5',
    modules: null,
    figures: [FOODLABEL],
    dryRun: true,
    ...over,
  });

  it('still classifies it translated — the ordering is right and must not move', async () => {
    const result = await runFigures(CH05(), { spawn: fakeSpawn({ prepare: () => foodLabel }) });
    expect(result.figures[0].outcome).toBe('translated');
    expect(result.figures[0].holds).toEqual({ verbatim: 17, undecoded: 2, missingFont: 0 });
  });

  it('NAMES the figure and its undecodable label count in the report', async () => {
    const result = await runFigures(CH05(), { spawn: fakeSpawn({ prepare: () => foodLabel }) });
    const text = summarise(result);
    expect(text).toMatch(/undecodable/i);
    expect(text).toContain(FOODLABEL);
  });

  it('adds a non-fatal NOTE so a chapter walk cannot end green in silence', async () => {
    const result = await runFigures(CH05(), { spawn: fakeSpawn({ prepare: () => foodLabel }) });
    expect(result.verdict.ok).toBe(true);
    expect(result.verdict.reasons.join(' ')).toMatch(/could not decode/i);
    expect(summarise(result)).toMatch(/could not decode/i);
  });

  // The control. Without it every assertion above passes against a report that prints this
  // line for every figure in every chapter.
  it('says none of it for the same figure with no undecodable holds', async () => {
    const clean = { ...foodLabel, undecodedBlocks: 0, verbatimBlocks: 19, warnings: [] };
    const result = await runFigures(CH05(), { spawn: fakeSpawn({ prepare: () => clean }) });
    const text = summarise(result);
    expect(result.figures[0].outcome).toBe('translated');
    expect(text).not.toMatch(/undecodable/i);
    expect(result.verdict.reasons.join(' ')).not.toMatch(/could not decode/i);
  });

  // 🔴 The report line must not be keyed on the bucket. A missing-font hold is a PLUMBING
  // fault ("the read layer stopped resolving a font"), it lands in `copied-textless` because
  // the classifier has no branch for it, and F4's refuter measured that ROUTING on it would
  // re-commit the plan's 216/216 false-positive error. Reporting it is the honest shape.
  it('reports a missing-font hold too, whatever bucket the figure landed in', async () => {
    const plumbing = {
      blocks: 12,
      sendable: 0,
      undecodedBlocks: 0,
      verbatimBlocks: 0,
      missingFontBlocks: 12,
      chars: 120,
      imageXObjects: 0,
      paintOps: 40,
      formTextXObjects: 0,
      warnings: [],
    };
    const result = await runFigures(CH05(), { spawn: fakeSpawn({ prepare: () => plumbing }) });
    expect(result.figures[0].outcome).toBe('copied-textless');
    expect(summarise(result)).toMatch(/missing-font/i);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────
// 🔴 dataflow/F2 — `figure-prepare.py`'s WARNINGS WERE RECORDED AND RENDERED NOWHERE.
// `rec.warnings = payload.warnings || []` was the only write; `summarise` never read it, and
// the child's stdout (where prepare prints the same facts as `!! …` lines) is captured by
// `defaultSpawn` and used only on the failure path. So the whole channel reached nobody —
// including `unparsable content stream …`, about which figure-prepare.py says verbatim
// "Silence there would mean a form whose English may still be drawn, counted as clean", and
// `N unparsable colour operand(s); fills on this figure are unreliable`. The design's own
// Invariant 5 is "Warnings are surfaced, not swallowed".
describe('prepare warnings reach the operator', () => {
  const STREAM = 'unparsable content stream 12 0: operand stack underflow';
  const COLOUR = '3 unparsable colour operand(s); fills on this figure are unreliable';

  it('prints a warning verbatim, naming the figure that produced it', async () => {
    const spawn = fakeSpawn({
      prepare: (b) =>
        b === 'CNX_Chem_04_04_limiting' ? { sendable: 2, chars: 20, warnings: [STREAM] } : {},
    });
    const text = summarise(await runFigures(CH04, { spawn }));
    expect(text).toContain(STREAM);
    expect(text).toContain('CNX_Chem_04_04_limiting');
  });

  // 🔴 NOT KEYED ON THE BUCKET. A `copied-textless` figure is exactly the one the
  // unparsable-stream warning is about — "a form whose English may still be drawn, counted
  // as clean" — so restricting the print to `translated` would silence it where it matters.
  it('prints it for a COPIED figure too, not only for the ones that spend', async () => {
    const spawn = fakeSpawn({
      prepare: (b) => (b === 'CNX_Chem_04_05_filter' ? { warnings: [COLOUR] } : {}),
    });
    const result = await runFigures(CH04, { spawn });
    expect(result.figures.find((f) => f.basename === 'CNX_Chem_04_05_filter').outcome).toMatch(
      /^copied-/
    );
    expect(summarise(result)).toContain(COLOUR);
  });

  // The control. Without it both assertions above pass against a report that prints a
  // warnings section unconditionally, or that prints every string it can find.
  it('prints no warning section at all when prepare emitted none', async () => {
    const text = summarise(await runFigures(CH04, { spawn: fakeSpawn() }));
    expect(text).not.toMatch(/warning/i);
    expect(text).not.toContain(STREAM);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────
// 🔴 dataflow/F5 — A COPY WAS DOWNGRADED TO `failed-publish` OVER A PUBLISH THE DRIVER WAS
// NEVER GOING TO ATTEMPT, AND THE REPORT'S MINT WORK-LIST WAS WRONG FOR EVERY ENTRY IT
// PRINTED.
//
// `processFigureLive` opens with `if (rec.outcome !== 'translated') return;`, so nothing is
// composed, minted or published for a `copied-photo`/`copied-textless` — the reader keeps
// OpenStax's own artwork out of the media tree. `unmintable` nevertheless made such a figure
// `failed-publish`, which `verdict()` makes FATAL: a chapter would exit 1 and "need a human"
// over a mapping row nothing was ever going to write.
//
// ⚠️ THE FIX IS THE DOWNGRADE, NOT `PUBLISH_BOUND`. Narrowing the set to ['translated'] —
// the finding's own suggestion — would delete the CONTAINMENT check on copies, which the
// commit one before this one (money/F3) added deliberately and pinned: an outputName that
// escapes media/ is a defect in a COMMITTED data file whatever the figure's bucket, whereas
// "no row, and the minter cannot make one" is simply the ordinary state of a figure nobody
// publishes (organic has no mapping file at all). The two are different facts.
describe('a copy is not failed over a publish that never happens', () => {
  const BOOKDIR = path.join(REPO_ROOT, 'books', 'efnafraedi-2e');
  const preflight = (outcome, mintIndex) => {
    const rec = { basename: 'A', outcome, reason: null, mapping: null };
    applyMappingPreflight(rec, { mapped: new Map(), mintIndex, bookDir: BOOKDIR });
    return rec;
  };

  it('leaves an unmintable COPY in its own bucket', () => {
    const rec = preflight('copied-photo', new Set(['B']));
    expect(rec.outcome).toBe('copied-photo');
    // The pre-flight's ANSWER is still recorded — it is a fact about the book — it just
    // stops being a failure for a figure that publishes nothing.
    expect(rec.mapping).toEqual({ status: 'unmintable', outputName: null });
    expect(rec.reason).toBe(null);
  });

  it('leaves an unmintable copied-textless in its own bucket too', () => {
    expect(preflight('copied-textless', new Set(['B'])).outcome).toBe('copied-textless');
  });

  // 🔴 THE CONTROL. Without it the two assertions above pass against a pre-flight that has
  // stopped downgrading anything at all — and the unmintable downgrade on a TRANSLATED
  // figure is the one that saves the money.
  it('still fails an unmintable TRANSLATED figure, which is what the check is for', () => {
    const rec = preflight('translated', new Set(['B']));
    expect(rec.outcome).toBe('failed-publish');
    expect(rec.reason).toMatch(/unmapped/);
  });

  // Corpus. Today ch04's mint work-list is 9 of 9 copies — wrong for every entry it prints.
  it('names in the mint work-list only figures the run will actually publish', async () => {
    const copies = await runFigures(CH04, { spawn: fakeSpawn() });
    expect(copies.figures.every((f) => f.outcome.startsWith('copied-'))).toBe(true);
    // The pre-flight still ANSWERS for a copy — 9 of ch04's 30 are `mintable` — and that
    // fact is what the containment check needs. It is the REPORT and the DOWNGRADE that
    // stop acting on it, so this is the non-vacuity control for the two assertions below.
    expect(copies.figures.filter((f) => f.mapping.status === 'mintable').length).toBe(9);
    expect(
      copies.figures
        .filter((f) => f.outcome === 'translated' && f.mapping.status === 'mintable')
        .map((f) => f.basename)
    ).toEqual([]);
    expect(copies.tally['failed-publish']).toBe(0);
    expect(summarise(copies)).not.toMatch(/minted before publish/);
  });

  it('DOES name them when the same figures are translated (the control above)', async () => {
    const translated = await runFigures(CH04, {
      spawn: fakeSpawn({ prepare: () => ({ sendable: 2, chars: 20, blocks: 2 }) }),
    });
    const mintable = translated.figures.filter((f) => f.mapping.status === 'mintable');
    expect(mintable.length).toBeGreaterThan(0);
    expect(summarise(translated)).toMatch(/minted before publish/);
  });
});
