/**
 * `tools/figure-run.js` — the figure driver's PAID half (M5 Task 6b).
 *
 * 🔴 EVERY TEST HERE COSTS ZERO ISK, AND THE SUITE PROVES IT RATHER THAN ASSERTING IT.
 * `experiments/figure-text-translation/translate-blocks.mjs` is the only stage that spends, and
 * the driver reaches it through the SAME injectable `spawn` seam every other child goes through
 * — so "the MT was spawned N times" is a counter a test reads, not a claim a comment makes.
 * ⚠️ A count of zero is only evidence when something else in the SAME run is non-zero: every
 * "spends nothing" test below asserts a live control beside it (compose spawned, a figure
 * published, a stamp written), because "0 because it refused to spend" and "0 because it did
 * nothing at all" are different facts.
 *
 * 🔴 AND NO TEST HERE TOUCHES `books/` IN THE REPO. The live path WRITES — a sidecar, a mapping
 * entry, an SVG in `media/` — so every test drives it against a throwaway `<tmp>/books/<slug>`
 * tree via `deps.booksRoot`. The publisher's own `parseSidecarPath` requires the grandparent
 * directory to be literally `books`, which is why the fixture is `<tmp>/books/...` and not
 * `<tmp>/<slug>`.
 *
 * ⚠️ THE PUBLISHER IS THE REAL ONE unless a test says otherwise. `publishFigureSvg` is where
 * three of this task's findings live (seven refusal codes, two unguarded throw sites, and the
 * §C138 stale-stamp bug), and a stub cannot reproduce any of them. `deps.publish` exists for
 * the one case that needs a fabricated failure, and is otherwise left at its default.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { createRequire } from 'module';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

import { runFigures, main, isStale, applyDriftGuard, summarise } from '../figure-run.js';

const require = createRequire(import.meta.url);
const {
  readSidecar,
  writeSidecar,
  sidecarPath,
  computeRenderHash,
  editorialState,
  effectiveState,
  COMPOSER_VERSION,
} = require('../lib/figure-text-sidecar.cjs');

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..', '..');
const SLUG = 'figrun-testbook';

/** Every fixture tree this file made, torn down after each test — /tmp here is a small tmpfs. */
const madeRoots = [];
afterEach(() => {
  while (madeRoots.length) {
    const root = madeRoots.pop();
    // A test may have chmod'ed a directory read-only to force EACCES; put it back or the
    // teardown itself fails and the next test inherits a full /tmp.
    try {
      fs.chmodSync(path.join(root, 'books', SLUG, 'media'), 0o755);
    } catch {
      /* the directory may not exist; nothing to restore */
    }
    fs.rmSync(root, { recursive: true, force: true });
  }
});

/**
 * A throwaway `books/<slug>` tree.
 *
 * `figures` are basenames; each becomes an `<image src>` inside its own `<figure>` in one
 * module. A basename listed in `unmintable` is written with a RAW `>` inside an earlier
 * attribute value — legal XML, and §C115's exact shape: the quote-aware enumeration sees it
 * while `generate-image-mapping.js`'s `[^>]*` scan does not, so the driver can enumerate a
 * figure it could never mint a mapping entry for. That disagreement is the pre-flight's whole
 * reason to exist, and it is reproduced here rather than simulated.
 *
 * `rawSidecars` writes the BYTES given, bypassing `writeSidecar` — the only way to plant a
 * sidecar that is present on disk and unparsable, which is money/F1's whole subject.
 */
function makeBook({
  figures,
  unmintable = [],
  mapping = null,
  sidecars = {},
  rawSidecars = {},
} = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'figrun-paid-'));
  madeRoots.push(root);
  const booksRoot = path.join(root, 'books');
  const bookDir = path.join(booksRoot, SLUG);
  const sourceDir = path.join(bookDir, '01-source', 'ch01');
  fs.mkdirSync(sourceDir, { recursive: true });
  fs.mkdirSync(path.join(bookDir, 'media'), { recursive: true });

  const body = figures
    .map((b, i) => {
      const alt = unmintable.includes(b) ? ' alt="a > b"' : '';
      return (
        `<figure id="fig${i}"><media alt="m${i}">` +
        `<image${alt} mime-type="application/pdf" src="../../media/${b}.pdf"/>` +
        `</media></figure>`
      );
    })
    .join('\n');
  fs.writeFileSync(path.join(sourceDir, 'm00001.cnxml'), `<document>\n${body}\n</document>\n`);

  if (mapping) {
    fs.writeFileSync(
      path.join(bookDir, 'media', 'image-mapping.json'),
      `${JSON.stringify(mapping, null, 2)}\n`
    );
  }
  for (const [basename, sidecar] of Object.entries(sidecars)) {
    writeSidecar(bookDir, basename, sidecar);
  }
  for (const [basename, bytes] of Object.entries(rawSidecars)) {
    const p = sidecarPath(bookDir, basename);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, bytes, 'utf-8');
  }
  return { root, booksRoot, bookDir, sourceDir };
}

/** The sidecar the driver mints, built here so a test can plant one that looks driver-made. */
function madeSidecar(basename, blocks, extra = {}) {
  return {
    version: 1,
    basename,
    renderHash: computeRenderHash(blocks, COMPOSER_VERSION),
    composerVersion: COMPOSER_VERSION,
    blocks,
    ...extra,
  };
}

/**
 * A published, current sidecar, so `isStale` is false. That takes BOTH publish stamps:
 * `composedHash === renderHash` (the SVG was drawn from this text) and `composedVersion ===
 * COMPOSER_VERSION` (by this composer). A sidecar carrying only the first is one a bump has
 * invalidated, and it must recompose — see the COMPOSER_VERSION-bump describe below.
 */
function currentSidecar(basename, blocks, extra = {}) {
  const hash = computeRenderHash(blocks, COMPOSER_VERSION);
  return {
    version: 1,
    basename,
    renderHash: hash,
    composedHash: hash,
    composerVersion: COMPOSER_VERSION,
    composedVersion: COMPOSER_VERSION,
    blocks,
    ...extra,
  };
}

/**
 * A fake `spawn` covering all FOUR stages, fabricating what each one promises on disk.
 *
 * @param {object} [plan]
 * @param {(b:string)=>object|null} [plan.resolve]
 * @param {(b:string)=>object} [plan.prepare] merged into prepare.json; `__blocks` overrides the
 *   generated blocks.json, `__fail` makes prepare exit 1.
 * @param {(b:string, blocks:Array)=>object} [plan.translate] `{__exit: n}` to fail, `{__absent:
 *   true}` to write no translations file, `{__blocks: {...}}` for a literal payload; the default
 *   returns one Icelandic value per `send:true` block.
 * @param {(b:string)=>object} [plan.compose] `{__error: 'msg'}` to make compose exit 1.
 */
function fakeSpawn(plan = {}) {
  const calls = [];
  const fn = ({ stage, argv }) => {
    calls.push({ stage, argv });
    const outDir = argv.includes('--out') ? argv[argv.indexOf('--out') + 1] : null;

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
      const basename = argv[argv.indexOf('--basename') + 1];
      fs.mkdirSync(outDir, { recursive: true });
      // How many figure directories exist AT THIS MOMENT — the peak-disk invariant measured
      // directly rather than through a proxy field. A real prepare leaves ~14 MB behind.
      fn.liveDirs.push(fs.readdirSync(path.dirname(outDir)).length);
      const extra = plan.prepare ? plan.prepare(basename) : {};
      if (extra.__fail) {
        fs.writeFileSync(
          path.join(outDir, 'prepare.json'),
          JSON.stringify({ error: extra.__fail, warnings: [] })
        );
        return { status: 1, stdout: '', stderr: extra.__fail };
      }
      const sendable = extra.sendable === undefined ? 2 : extra.sendable;
      const blocks =
        extra.__blocks ||
        Array.from({ length: sendable }, (_, i) => ({
          key: `k${i}`,
          english: `English ${i}`,
          lines: [`English ${i}`],
          arc: false,
          send: true,
        }));
      fs.writeFileSync(path.join(outDir, 'blocks.json'), JSON.stringify(blocks));
      fs.writeFileSync(
        path.join(outDir, 'meta.json'),
        JSON.stringify({ source: path.join(outDir, `${basename}.pdf`) })
      );
      fs.writeFileSync(path.join(outDir, 'artwork.svg'), '<svg/>');
      // `__blocks` is the fake's own control channel, not a prepare.json field — strip it so
      // the written manifest holds only what the real tool would write.
      const rest = Object.fromEntries(Object.entries(extra).filter(([k]) => k !== '__blocks'));
      fs.writeFileSync(
        path.join(outDir, 'prepare.json'),
        JSON.stringify({
          basename,
          source: `/fake/artwork/${basename}.pdf`,
          blocks: blocks.length,
          sendable,
          undecodedBlocks: 0,
          verbatimBlocks: 0,
          missingFontBlocks: 0,
          chars: sendable * 10,
          artworkSvgPath: path.join(outDir, 'artwork.svg'),
          imageXObjects: 1,
          paintOps: 5,
          formTextXObjects: 0,
          warnings: [],
          ...rest,
        })
      );
      return { status: 0, stdout: '', stderr: '' };
    }

    if (stage === 'translate') {
      const blocks = JSON.parse(fs.readFileSync(path.join(outDir, 'blocks.json'), 'utf-8'));
      const basename = path.basename(outDir);
      const spec = plan.translate ? plan.translate(basename, blocks) : {};
      if (spec.__exit) return { status: spec.__exit, stdout: '', stderr: 'the API said no' };
      if (spec.__absent) return { status: 0, stdout: '', stderr: '' };
      const payload =
        spec.__blocks ||
        Object.fromEntries(blocks.filter((b) => b.send).map((b) => [b.key, [`IS ${b.key}`]]));
      fs.writeFileSync(
        path.join(outDir, 'translations-api.json'),
        JSON.stringify({ _source: 'stub, no glossary', blocks: payload })
      );
      return { status: 0, stdout: '', stderr: '' };
    }

    if (stage === 'compose') {
      const basename = path.basename(outDir);
      const spec = plan.compose ? plan.compose(basename) : {};
      if (spec.__error) {
        fs.rmSync(path.join(outDir, 'translated.svg'), { force: true });
        fs.writeFileSync(
          path.join(outDir, 'compose.json'),
          JSON.stringify({ error: spec.__error, keys: [] })
        );
        return { status: 1, stdout: '', stderr: spec.__error };
      }
      fs.writeFileSync(path.join(outDir, 'translated.svg'), `<svg id="${basename}"/>`);
      fs.writeFileSync(
        path.join(outDir, 'compose.json'),
        JSON.stringify({ outputPath: path.join(outDir, 'translated.svg') })
      );
      return { status: 0, stdout: '', stderr: '' };
    }
    throw new Error(`fakeSpawn was asked for an unexpected stage: ${stage}`);
  };
  fn.calls = calls;
  fn.liveDirs = [];
  fn.countOf = (stage) => calls.filter((c) => c.stage === stage).length;
  fn.outDirsFor = (stage) =>
    calls
      .filter((c) => c.stage === stage)
      .map((c) => path.basename(c.argv[c.argv.indexOf('--out') + 1]));
  return fn;
}

/** A publisher that refuses, counting its calls so "the mapping is unchanged" cannot pass
 *  because the publish was never reached. */
function refusingPublisher(reason = 'no-svg') {
  const fn = () => {
    fn.calls += 1;
    return { ok: false, reason, message: `stub publisher refused: ${reason}` };
  };
  fn.calls = 0;
  return fn;
}

const live = (booksRoot, over = {}) => ({
  book: SLUG,
  chapter: '1',
  modules: null,
  figures: null,
  dryRun: false,
  stale: false,
  force: false,
  ...over,
});

/** Two legacy figure-id rows (liffraedi-2e's whole file is this shape) plus one new-route row. */
const mapping3 = () => [
  { figureId: 'legacy-1', outputName: 'LEGACY_ONE.png' },
  { figureId: 'legacy-2', outputName: 'LEGACY_TWO.png' },
  { originalImage: 'SOMETHING_ELSE', outputName: 'SOMETHING_ELSE_IS.svg', extension: '.svg' },
];

const rec = (result, basename) => result.figures.find((f) => f.basename === basename);
const mapEntries = (bookDir) =>
  JSON.parse(fs.readFileSync(path.join(bookDir, 'media', 'image-mapping.json'), 'utf-8'));

// ─────────────────────────────────────────────────────────────────────────────────────────
// 🔴 N2 — THE PURCHASE IS RECORDED BEFORE ANYTHING THAT CAN FAIL AFTER IT.
// Without this, adopting Task 4's key-set check converts a new DETECTION into a new LOSS: the
// paid Icelandic otherwise lives only in a mkdtemp directory nothing records and nothing rereads.
describe('the purchase is recorded before anything that can fail after it', () => {
  const short = (b, blocks) => ({
    __blocks: Object.fromEntries(
      blocks
        .filter((x) => x.send)
        .slice(0, -1)
        .map((x) => [x.key, [`IS ${x.key}`]])
    ),
  });

  it('writes the sidecar as soon as the MT returns, even when the post-MT check then FAILS', async () => {
    const { booksRoot, bookDir } = makeBook({ figures: ['FIG_A'] });
    const spawn = fakeSpawn({ prepare: () => ({ sendable: 8 }), translate: short });
    const result = await runFigures(live(booksRoot), { spawn, booksRoot });

    expect(rec(result, 'FIG_A').outcome).toBe('failed-mt');
    // …AND all seven translations are on disk. A COUNT would pass against an implementation
    // that wrote a different seven, so compare the object.
    const onDisk = readSidecar(bookDir, 'FIG_A');
    expect(onDisk.blocks).toEqual({
      k0: 'IS k0',
      k1: 'IS k1',
      k2: 'IS k2',
      k3: 'IS k3',
      k4: 'IS k4',
      k5: 'IS k5',
      k6: 'IS k6',
    });
    expect(rec(result, 'FIG_A').reason).toMatch(/k7/); // it NAMES the key that was lost
    expect(spawn.countOf('compose')).toBe(0); // and it does not compose over the hole
  });

  // THE CONTROL. Same fixture, same stages, a complete return: without it the test above passes
  // against a driver that buckets every MT return as a failure.
  it('a complete return is translated, composed and published (the control)', async () => {
    const { booksRoot, bookDir } = makeBook({ figures: ['FIG_A'] });
    const spawn = fakeSpawn({ prepare: () => ({ sendable: 8 }) });
    const result = await runFigures(live(booksRoot), { spawn, booksRoot });

    expect(rec(result, 'FIG_A').outcome).toBe('translated');
    expect(Object.keys(readSidecar(bookDir, 'FIG_A').blocks)).toHaveLength(8);
    expect(spawn.countOf('compose')).toBe(1);
    expect(fs.existsSync(path.join(bookDir, 'media', 'FIG_A_IS.svg'))).toBe(true);
    expect(result.verdict.ok).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────
describe('a figure whose publish fails is never reported done', () => {
  // 🔴 D3. WHAT THIS TEST PROVES IS UNCHANGED; ITS TRIGGER HAD TO MOVE, AND MY OWN FIX IS WHY.
  // It used to force the refusal with an `outputName` that escapes media/ — a REAL
  // `unsafe-output-name` from the real publisher. money/F3 moved that decision into the
  // pre-flight, ahead of the money, so the old trigger now refuses with NO sidecar at all and
  // this test's whole premise (a purchase that a publish then refuses) is unreachable through
  // it. That the old trigger is now caught before the money is asserted next door, in "the
  // pre-flight refuses an UNPUBLISHABLE mapped entry before the money".
  //
  // The refusal here is therefore fabricated through `deps.publish`, which is what that seam
  // exists for. A REAL post-money refusal from the real publisher is still exercised — see
  // `sidecar-moved` in "a sidecar that moves during compose", where the trigger is a race the
  // pre-flight cannot possibly see.
  it('a refused publish leaves no composedHash, lands in failed-publish, and is NOT skipped next run', async () => {
    const { booksRoot, bookDir } = makeBook({
      figures: ['FIG_A'],
      mapping: [{ originalImage: 'FIG_A', outputName: 'FIG_A_IS.svg', extension: '.svg' }],
    });
    const spawn = fakeSpawn();
    const refuse = refusingPublisher();
    const first = await runFigures(live(booksRoot), { spawn, booksRoot, publish: refuse });

    expect(spawn.countOf('translate')).toBe(1); // the figure WAS bought — the premise
    expect(refuse.calls).toBe(1); // NON-VACUITY: the publish really was attempted
    expect(rec(first, 'FIG_A').outcome).toBe('failed-publish');
    expect(first.verdict.ok).toBe(false);
    const after = readSidecar(bookDir, 'FIG_A');
    expect(after.blocks).toEqual({ k0: 'IS k0', k1: 'IS k1' }); // the purchase is on disk
    expect(after.composedHash).toBeUndefined(); // the stamp is the publish-success marker
    expect(isStale(after)).toBe(true);

    // The second run: still not done, and it does NOT buy the figure again.
    const spawn2 = fakeSpawn();
    const second = await runFigures(live(booksRoot), { spawn: spawn2, booksRoot });
    expect(rec(second, 'FIG_A').outcome).not.toBe('skipped-current');
    expect(second.tally['skipped-current']).toBe(0);
    expect(spawn2.countOf('translate')).toBe(0); // R8: a sidecar exists, so nothing is bought
    expect(spawn2.countOf('compose')).toBe(1); // …and the control: it really did re-run
  });

  // 🔴 `publishFigureSvg` has THREE outcomes, not two: `fs.copyFileSync` is unguarded and throws
  // past every refusal. Proven with a real EACCES rather than a fabricated throw.
  it('buckets a THROW from publish as failed-publish', async () => {
    // The mapping entry is SEEDED, so the driver mints nothing and `media/` is untouched until
    // `publishFigureSvg`'s own unguarded `fs.copyFileSync`. Without that, the mint would throw
    // EACCES first and this test would pass while proving the wrong throw site.
    const { booksRoot, bookDir } = makeBook({
      figures: ['FIG_A'],
      mapping: [{ originalImage: 'FIG_A', outputName: 'FIG_A_IS.svg', extension: '.svg' }],
    });
    const mediaDir = path.join(bookDir, 'media');
    fs.chmodSync(mediaDir, 0o500);
    // THE INSTRUMENT'S OWN CONTROL: running as root ignores the mode bits, and this test would
    // then pass for the wrong reason. Prove the directory really is unwritable first.
    let writable = true;
    try {
      fs.writeFileSync(path.join(mediaDir, '__probe__'), 'x');
      fs.rmSync(path.join(mediaDir, '__probe__'), { force: true });
    } catch {
      writable = false;
    }
    expect(writable).toBe(false);

    const result = await runFigures(live(booksRoot), { spawn: fakeSpawn(), booksRoot });
    expect(rec(result, 'FIG_A').outcome).toBe('failed-publish');
    expect(rec(result, 'FIG_A').reason).toMatch(/EACCES/);
    expect(rec(result, 'FIG_A').reason).toMatch(/THREW/); // …from publish, not from the mint
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────
// 🔴 THE SIDECAR MOVING UNDER A COMPOSE. The driver reads every sidecar up front, hands the
// FILE to `figure-compose.py` as `--translations`, and the publisher re-reads that same file
// afterwards to merge its stamp in. A `writeSidecar` landing inside that window — a head
// editor pressing approve on the figure being recomposed — used to make the stamp certify
// blocks the SVG was never drawn from, and every downstream surface then agreed the figure was
// finished: `composedHash === renderHash`, effectiveState 'approved', no badge, `isStale`
// false. The reader kept the PRE-correction artwork permanently, and only `--force` ever
// revisited it.
describe('a sidecar that moves during compose', () => {
  const V1 = { k0: 'IS-k0-VERSION-ONE', k1: 'IS-k1' };
  const V2 = { k0: 'IS-k0-SECOND-CORRECTION', k1: 'IS-k1' };
  const H1 = computeRenderHash(V1, COMPOSER_VERSION);
  const H2 = computeRenderHash(V2, COMPOSER_VERSION);

  /** A book whose one figure has an approved-but-never-composed sidecar: stale, recomposable. */
  const staleBook = () =>
    makeBook({
      figures: ['FIG_A'],
      mapping: [{ originalImage: 'FIG_A', outputName: 'FIG_A_IS.svg', extension: '.svg' }],
      sidecars: {
        FIG_A: {
          version: 1,
          basename: 'FIG_A',
          state: 'approved',
          renderHash: H1,
          composerVersion: COMPOSER_VERSION,
          blocks: V1,
        },
      },
    });

  it('REFUSES to publish, and does not certify blocks the SVG was never composed from', async () => {
    const { booksRoot, bookDir } = staleBook();
    const composedFrom = [];
    // The plan callback fires inside the compose stage, before the SVG is written — exactly
    // where the real composer has already read its --translations and not yet drawn. It reads
    // the same file the composer would, then lands the concurrent approval: byte-for-byte what
    // `applyApprovedFigureEdits` writes (new blocks, new renderHash, no composedHash to carry).
    const spawn = fakeSpawn({
      compose: () => {
        composedFrom.push(readSidecar(bookDir, 'FIG_A').blocks.k0);
        writeSidecar(bookDir, 'FIG_A', {
          version: 1,
          basename: 'FIG_A',
          state: 'approved',
          renderHash: H2,
          composerVersion: COMPOSER_VERSION,
          blocks: V2,
        });
        return {};
      },
    });
    const result = await runFigures(live(booksRoot, { stale: true }), { spawn, booksRoot });

    // The instrument's own control: the composer really did read the OLD blocks, so the SVG
    // it produced is V1 artwork and stamping H2 on it would be a lie.
    expect(composedFrom).toEqual(['IS-k0-VERSION-ONE']);
    expect(spawn.countOf('translate')).toBe(0); // R8: a sidecar exists, so nothing was bought

    expect(rec(result, 'FIG_A').outcome).toBe('failed-publish');
    expect(rec(result, 'FIG_A').reason).toMatch(/sidecar-moved/);

    // The editor's correction survives untouched, and carries NO stamp — so the figure reads
    // stale and the next run recomposes it from V2 instead of skipping it for ever.
    const after = readSidecar(bookDir, 'FIG_A');
    expect(after.blocks).toEqual(V2);
    expect(after.composedHash).toBeUndefined();
    expect(isStale(after)).toBe(true);
    // …and no V1 artwork was published under the V2 stamp.
    expect(fs.existsSync(path.join(bookDir, 'media', 'FIG_A_IS.svg'))).toBe(false);
  });

  it('the next run finishes the figure from the corrected blocks', async () => {
    // The recovery arm. Without it, "refuses" would be indistinguishable from "wedged".
    const { booksRoot, bookDir } = staleBook();
    let raced = false;
    const spawn = fakeSpawn({
      compose: () => {
        if (!raced) {
          raced = true;
          writeSidecar(bookDir, 'FIG_A', {
            version: 1,
            basename: 'FIG_A',
            state: 'approved',
            renderHash: H2,
            composerVersion: COMPOSER_VERSION,
            blocks: V2,
          });
        }
        return {};
      },
    });
    await runFigures(live(booksRoot, { stale: true }), { spawn, booksRoot });
    const second = await runFigures(live(booksRoot, { stale: true }), {
      spawn: fakeSpawn(),
      booksRoot,
    });
    expect(rec(second, 'FIG_A').outcome).toBe('translated');
    const after = readSidecar(bookDir, 'FIG_A');
    expect(after.composedHash).toBe(H2);
    expect(isStale(after)).toBe(false);
    expect(fs.existsSync(path.join(bookDir, 'media', 'FIG_A_IS.svg'))).toBe(true);
  });

  it('publishes normally when nothing moves — the control', async () => {
    // The same fixture and the same stage sequence with the concurrent write removed. Without
    // it, a driver that refused every publish would satisfy the refusal above.
    const { booksRoot, bookDir } = staleBook();
    const result = await runFigures(live(booksRoot, { stale: true }), {
      spawn: fakeSpawn(),
      booksRoot,
    });
    expect(rec(result, 'FIG_A').outcome).toBe('translated');
    expect(readSidecar(bookDir, 'FIG_A').composedHash).toBe(H1);
    expect(fs.existsSync(path.join(bookDir, 'media', 'FIG_A_IS.svg'))).toBe(true);
  });

  it('a benign approval that leaves the blocks alone still publishes', async () => {
    // 🔴 THE FALSE-POSITIVE ARM, and the reason the check is keyed on `renderHash` rather than
    // on the file's bytes or its mtime. Approving unchanged blocks rewrites the sidecar with a
    // new `state` and the SAME hash; the SVG really was composed from those blocks, so
    // refusing here would strand the very approval the editor just made.
    const { booksRoot, bookDir } = makeBook({
      figures: ['FIG_A'],
      mapping: [{ originalImage: 'FIG_A', outputName: 'FIG_A_IS.svg', extension: '.svg' }],
      sidecars: { FIG_A: madeSidecar('FIG_A', V1) }, // no state: an unreviewed mint
    });
    const spawn = fakeSpawn({
      compose: () => {
        writeSidecar(bookDir, 'FIG_A', {
          version: 1,
          basename: 'FIG_A',
          state: 'approved', // the editor approved; the BLOCKS did not move
          renderHash: H1,
          composerVersion: COMPOSER_VERSION,
          blocks: V1,
        });
        return {};
      },
    });
    const result = await runFigures(live(booksRoot, { stale: true }), { spawn, booksRoot });
    expect(rec(result, 'FIG_A').outcome).toBe('translated');
    const after = readSidecar(bookDir, 'FIG_A');
    expect(after.state).toBe('approved'); // the approval survived the merge
    expect(after.composedHash).toBe(H1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────
// 🔴 R8 — THE ONLY SPENDABLE FIGURE IS ONE WITH NO SIDECAR. After an editor's correction the
// sidecar's blocks ARE the corrected Icelandic; re-running the MT would overwrite the
// correction AND charge for it. To re-buy, a human deletes the `.is.json`.
describe('--stale and --force spend NOTHING', () => {
  const STALE = { FIG_A: madeSidecar('FIG_A', { k0: 'IS k0', k1: 'IS k1' }) };

  it('spends NOTHING on --stale: it recomposes from the sidecar’s own blocks', async () => {
    const { booksRoot, bookDir } = makeBook({ figures: ['FIG_A', 'FIG_B'], sidecars: STALE });
    const spawn = fakeSpawn();
    const result = await runFigures(live(booksRoot, { stale: true }), { spawn, booksRoot });

    expect(spawn.countOf('translate')).toBe(0);
    // THE CONTROLS, in the same run: --stale narrowed to the sidecar-bearing figure, and that
    // figure was really recomposed and really published.
    expect(result.figures.map((f) => f.basename)).toEqual(['FIG_A']);
    expect(spawn.countOf('compose')).toBe(1);
    expect(rec(result, 'FIG_A').outcome).toBe('translated');
    expect(fs.existsSync(path.join(bookDir, 'media', 'FIG_A_IS.svg'))).toBe(true);
    // …and the recompose composed from the SIDECAR, not from a fresh MT payload.
    const composeCall = spawn.calls.find((c) => c.stage === 'compose');
    expect(composeCall.argv).toContain(sidecarPath(bookDir, 'FIG_A'));
  });

  it('spends NOTHING on --force either, and --force is what makes a current figure move', async () => {
    const blocks = { k0: 'IS k0', k1: 'IS k1' };
    const make = () =>
      makeBook({ figures: ['FIG_A'], sidecars: { FIG_A: currentSidecar('FIG_A', blocks) } });

    // Without --force, a current figure is skipped before anything is resolved or prepared.
    const plain = make();
    const spawnPlain = fakeSpawn();
    const skipped = await runFigures(live(plain.booksRoot), {
      spawn: spawnPlain,
      booksRoot: plain.booksRoot,
    });
    expect(rec(skipped, 'FIG_A').outcome).toBe('skipped-current');
    expect(spawnPlain.countOf('compose')).toBe(0);

    // With --force it is recomposed and republished — and STILL costs nothing.
    const forced = make();
    const spawnForced = fakeSpawn();
    const result = await runFigures(live(forced.booksRoot, { force: true }), {
      spawn: spawnForced,
      booksRoot: forced.booksRoot,
    });
    expect(spawnForced.countOf('translate')).toBe(0);
    expect(spawnForced.countOf('compose')).toBe(1);
    expect(rec(result, 'FIG_A').outcome).toBe('translated');
    expect(result.tally['skipped-current']).toBe(0);
  });

  // 🔴 THE TEST THE RULE EXISTS FOR. Drives the REAL publisher over an APPROVED sidecar whose
  // Icelandic an editor corrected, carrying a STALE composedHash — the §C138 shape.
  it('does not overwrite an editor’s corrected text, and the approval survives the recompose', async () => {
    const corrected = { k0: 'Celsíus', k1: 'Suðumark' };
    const approved = {
      version: 1,
      basename: 'FIG_A',
      state: 'approved',
      renderHash: computeRenderHash(corrected, COMPOSER_VERSION),
      composedHash: 'STALE-FROM-AN-OLDER-COMPOSE',
      composerVersion: COMPOSER_VERSION,
      blocks: corrected,
    };
    const { booksRoot, bookDir } = makeBook({ figures: ['FIG_A'], sidecars: { FIG_A: approved } });
    const rawBefore = fs.readFileSync(sidecarPath(bookDir, 'FIG_A'), 'utf-8');
    const spawn = fakeSpawn();
    const result = await runFigures(live(booksRoot, { stale: true }), { spawn, booksRoot });

    expect(spawn.countOf('translate')).toBe(0);
    // 🔴 THE RULE ITSELF, NOT ITS CONSEQUENCE: a recompose writes the sidecar under NO
    // circumstances — the publisher's stamp is the only write. The assertions below on
    // `blocks`/`state` would all pass against a driver that REWROTE the file faithfully, and
    // the rewrite that drops `state` is exactly the failure this rule exists to forbid.
    expect(rec(result, 'FIG_A').sidecarWritten).toBe(false);
    const norm = (t) =>
      t
        .split('\n')
        .map((l) => l.trim().replace(/,$/, ''))
        .filter(Boolean);
    const rawAfter = fs.readFileSync(sidecarPath(bookDir, 'FIG_A'), 'utf-8');
    const added = norm(rawAfter).filter((l) => !norm(rawBefore).includes(l));
    // TWO lines changed, and both are the publish stamp: `composedHash` (which text the SVG was
    // drawn from) and `composedVersion` (which composer drew it). Nothing else moved.
    expect(added).toHaveLength(2);
    expect(added.map((l) => l.split(':')[0])).toEqual(['"composedHash"', '"composedVersion"']);
    expect(rec(result, 'FIG_A').outcome).toBe('translated');
    const after = readSidecar(bookDir, 'FIG_A');
    expect(after.blocks).toEqual(corrected); // the correction is untouched
    expect(after.state).toBe('approved'); // and so is the head editor's approval
    expect(after.composedHash).toBe(after.renderHash); // the stamp converged (§C138)
    // ⚠️ ON DISK, not the publisher's return value: the shipped bug returned the right hash
    // while writing the stale one, so a test reading the return value passed vacuously.
    expect(after.composedHash).not.toBe('STALE-FROM-AN-OLDER-COMPOSE');
  });

  it('spends only on the figure with NO sidecar when the chapter is mixed', async () => {
    const { booksRoot } = makeBook({
      figures: ['FIG_A', 'FIG_B', 'FIG_C'],
      sidecars: {
        FIG_A: madeSidecar('FIG_A', { k0: 'IS k0', k1: 'IS k1' }),
        FIG_C: madeSidecar('FIG_C', { k0: 'IS k0', k1: 'IS k1' }),
      },
    });
    const spawn = fakeSpawn();
    const result = await runFigures(live(booksRoot), { spawn, booksRoot });

    expect(spawn.countOf('translate')).toBe(1);
    expect(spawn.outDirsFor('translate')).toEqual(['FIG_B']); // NAMED, not counted
    expect(spawn.countOf('compose')).toBe(3); // the control: all three still reached compose
    expect(result.tally.translated).toBe(3);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────
describe('the MT failure modes each leave the figure eligible', () => {
  it('a non-zero exit from the MT buckets failed-mt, writes NO sidecar, and stays eligible', async () => {
    const { booksRoot, bookDir } = makeBook({ figures: ['FIG_A'] });
    const spawn = fakeSpawn({ translate: () => ({ __exit: 1 }) });
    const result = await runFigures(live(booksRoot), { spawn, booksRoot });

    expect(rec(result, 'FIG_A').outcome).toBe('failed-mt');
    expect(fs.existsSync(sidecarPath(bookDir, 'FIG_A'))).toBe(false);
    expect(readSidecar(bookDir, 'FIG_A')).toBeNull();
    expect(isStale(readSidecar(bookDir, 'FIG_A'))).toBe(true); // eligible again next run
    expect(spawn.countOf('compose')).toBe(0);

    // …and the next run really does re-buy it. Without this the "eligible" claim is a comment.
    const spawn2 = fakeSpawn();
    await runFigures(live(booksRoot), { spawn: spawn2, booksRoot });
    expect(spawn2.countOf('translate')).toBe(1);
  });

  // ⚠️ THE CLAUSE THAT STOPS AN IMPLEMENTER MINTING AN EMPTY SIDECAR R8 WOULD LOCK FOR EVER.
  // "Write the sidecar regardless of step 8's verdict" read literally invites `blocks: {}` with
  // a perfectly valid renderHash — which makes the figure permanently ineligible to spend.
  it('mints NO sidecar when translations-api.json is absent', async () => {
    const { booksRoot, bookDir } = makeBook({ figures: ['FIG_A'] });
    const spawn = fakeSpawn({ translate: () => ({ __absent: true }) });
    const result = await runFigures(live(booksRoot), { spawn, booksRoot });
    expect(rec(result, 'FIG_A').outcome).toBe('failed-mt');
    expect(fs.existsSync(sidecarPath(bookDir, 'FIG_A'))).toBe(false);
  });

  it('mints NO sidecar when translations-api.json parses to zero usable blocks', async () => {
    const { booksRoot, bookDir } = makeBook({ figures: ['FIG_A'] });
    // Present, well-formed, and every value empty — D9's shape: `normaliseTranslations` drops
    // them all, and a driver that trusted "the file exists" would mint `blocks: {}`.
    const spawn = fakeSpawn({ translate: () => ({ __blocks: { k0: [''], k1: ['   '] } }) });
    const result = await runFigures(live(booksRoot), { spawn, booksRoot });
    expect(rec(result, 'FIG_A').outcome).toBe('failed-mt');
    expect(fs.existsSync(sidecarPath(bookDir, 'FIG_A'))).toBe(false);
    expect(rec(result, 'FIG_A').reason).toMatch(/k0/);
  });

  it('buckets a compose refusal as failed-compose and keeps the paid sidecar', async () => {
    const { booksRoot, bookDir } = makeBook({ figures: ['FIG_A'] });
    const spawn = fakeSpawn({ compose: () => ({ __error: 'the English-kept blocks are wrong' }) });
    const result = await runFigures(live(booksRoot), { spawn, booksRoot });
    expect(rec(result, 'FIG_A').outcome).toBe('failed-compose');
    expect(rec(result, 'FIG_A').reason).toMatch(/English-kept/);
    expect(readSidecar(bookDir, 'FIG_A').blocks).toEqual({ k0: 'IS k0', k1: 'IS k1' });
    expect(fs.existsSync(path.join(bookDir, 'media', 'FIG_A_IS.svg'))).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────
// 🔴 D4 — `unmapped` MUST BE UNREACHABLE AFTER MONEY HAS BEEN SPENT.
describe('the pre-flight refuses before the money', () => {
  it('refuses an unmintable figure BEFORE the MT is called', async () => {
    const { booksRoot, bookDir } = makeBook({
      figures: ['FIG_RAWGT', 'FIG_PLAIN'],
      unmintable: ['FIG_RAWGT'],
    });
    const spawn = fakeSpawn();
    const result = await runFigures(live(booksRoot), { spawn, booksRoot });

    expect(rec(result, 'FIG_RAWGT').outcome).toBe('failed-publish');
    expect(spawn.outDirsFor('translate')).toEqual(['FIG_PLAIN']); // the money went elsewhere
    expect(fs.existsSync(sidecarPath(bookDir, 'FIG_RAWGT'))).toBe(false);
    // The control: the OTHER figure in the same chapter went all the way through.
    expect(rec(result, 'FIG_PLAIN').outcome).toBe('translated');
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────
describe('the minted sidecar and the minted mapping entry', () => {
  it('mints renderHash and NO state, so the figure reads mt-preview and publish can stamp', async () => {
    const { booksRoot, bookDir } = makeBook({ figures: ['FIG_A'] });
    await runFigures(live(booksRoot), { spawn: fakeSpawn(), booksRoot });
    const s = readSidecar(bookDir, 'FIG_A');
    expect(Object.keys(s)).not.toContain('state');
    expect(s.renderHash).toBe(computeRenderHash(s.blocks, COMPOSER_VERSION));
    expect(s.version).toBe(1);
    expect(s.basename).toBe('FIG_A');
    expect(s.composerVersion).toBe(COMPOSER_VERSION);
    // The stamp is what the publisher wrote, and it needed only renderHash to do it.
    expect(s.composedHash).toBe(s.renderHash);
  });

  it('mints the mapping entry itself and preserves every entry already there', async () => {
    const { booksRoot, bookDir } = makeBook({
      figures: ['FIG_A'],
      // A legacy figure-id entry with NO originalImage: `mergeMapping` keys on that field, so a
      // pair of them would collapse onto `undefined`. Nothing in the committed corpus has one
      // today; this is here so the merge cannot start losing them unnoticed.
      mapping: mapping3(),
    });
    await runFigures(live(booksRoot), { spawn: fakeSpawn(), booksRoot });

    const entries = mapEntries(bookDir);
    expect(entries).toContainEqual({
      originalImage: 'FIG_A',
      outputName: 'FIG_A_IS.svg',
      extension: '.svg',
    });
    // 🔴 BOTH legacy rows survive, IN ORDER. `mergeMapping` keys on `originalImage`, so a pair
    // of rows without one collapses onto `undefined` and only the last survives — measured on
    // books/liffraedi-2e, whose whole 34-row file is that shape.
    expect(entries.filter((e) => e.figureId).map((e) => e.figureId)).toEqual([
      'legacy-1',
      'legacy-2',
    ]);
    expect(entries.slice(0, 3)).toEqual(mapping3()); // and nothing was reordered
    expect(entries).toHaveLength(4);
  });

  // 🔴 A DANGLING MAPPING ENTRY IS A READER-VISIBLE BROKEN IMAGE: `applyImageBasenameSwaps`
  // rewrites `<image src>` on a basename match and never checks the target exists. So a mint
  // that outlives a failed publish would put a 404 on the page at the next render.
  it('rolls the minted entry back when the publish that follows it fails', async () => {
    const { booksRoot, bookDir } = makeBook({ figures: ['FIG_A'] });
    const before = fs.existsSync(path.join(bookDir, 'media', 'image-mapping.json'));
    expect(before).toBe(false); // the pre-state this test is about: no mapping file at all
    const refuse = refusingPublisher();
    const result = await runFigures(live(booksRoot), {
      spawn: fakeSpawn(),
      booksRoot,
      publish: refuse,
    });
    expect(refuse.calls).toBe(1); // NON-VACUITY: the publish really was attempted
    expect(rec(result, 'FIG_A').outcome).toBe('failed-publish');
    expect(fs.existsSync(path.join(bookDir, 'media', 'image-mapping.json'))).toBe(false);
  });

  it('leaves an entry it did not mint alone when the publish fails', async () => {
    const seeded = [
      { originalImage: 'FIG_A', outputName: 'FIG_A_IS.svg', extension: '.svg' },
      { originalImage: 'OTHER', outputName: 'OTHER_IS.svg', extension: '.svg' },
    ];
    const { booksRoot, bookDir } = makeBook({ figures: ['FIG_A'], mapping: seeded });
    const refuse = refusingPublisher();
    await runFigures(live(booksRoot), { spawn: fakeSpawn(), booksRoot, publish: refuse });
    expect(refuse.calls).toBe(1); // NON-VACUITY: without this the assertion below is trivial
    expect(mapEntries(bookDir)).toEqual(seeded);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────
describe('the live run’s own housekeeping', () => {
  // 🔴 PEAK DISK, LIVE. The dry run removes each figure directory as soon as it is classified;
  // the live path must keep it until publish and then remove it just the same. One prepared
  // figure is ~14 MB and /tmp here is a 4.9 GB tmpfs routinely over 90% full.
  it('never holds more than one figure directory at a time, live', async () => {
    const { booksRoot } = makeBook({ figures: ['FIG_A', 'FIG_B', 'FIG_C', 'FIG_D'] });
    const spawn = fakeSpawn();
    const result = await runFigures(live(booksRoot), { spawn, booksRoot });
    expect(spawn.liveDirs).toHaveLength(4); // non-vacuity: it really prepared four figures
    expect(Math.max(...spawn.liveDirs)).toBe(1);
    expect(result.figures.every((f) => f.outDir === null)).toBe(true);
    expect(fs.existsSync(result.tmpRoot)).toBe(false);
  });

  // A drifted read layer: the sidecar says this figure has text, prepare now finds none.
  // Recomposing would publish the artwork with its labels STRIPPED and nothing drawn back.
  it('refuses to recompose a figure whose text the read layer no longer sees', async () => {
    const { booksRoot, bookDir } = makeBook({
      figures: ['FIG_A'],
      sidecars: { FIG_A: madeSidecar('FIG_A', { k0: 'IS k0' }) },
    });
    const spawn = fakeSpawn({ prepare: () => ({ sendable: 0, __blocks: [] }) });
    const result = await runFigures(live(booksRoot), { spawn, booksRoot });
    expect(rec(result, 'FIG_A').outcome).toBe('failed-compose');
    expect(spawn.countOf('compose')).toBe(0);
    expect(readSidecar(bookDir, 'FIG_A').blocks).toEqual({ k0: 'IS k0' }); // untouched
    // …and the reason NAMES the bucket it drifted into. Reading `rec.outcome` after the
    // overwrite reports `failed-compose` back to itself and loses the whole diagnosis;
    // copied-photo, copied-textless and unreadable-text mean three different upstream faults.
    expect(rec(result, 'FIG_A').reason).toMatch(/classified copied-textless/);
  });

  it('names copied-photo, not a generic label, when THAT is the bucket it drifted into', () => {
    // The control for the assertion above: a fixed string would satisfy one case and not two.
    const drifted = {
      outcome: 'copied-photo',
      sidecar: { blocks: { k0: 'IS k0' } },
      reason: null,
    };
    applyDriftGuard(drifted);
    expect(drifted.outcome).toBe('failed-compose');
    expect(drifted.reason).toMatch(/classified copied-photo/);
  });

  it('leaves a copied figure with NO sidecar alone (the drift guard’s own control)', () => {
    const clean = { outcome: 'copied-textless', sidecar: null, reason: null };
    applyDriftGuard(clean);
    expect(clean.outcome).toBe('copied-textless');
    expect(clean.reason).toBeNull();
  });

  it('main() runs live now, returns 0 on a clean chapter, and 1 when a figure needs a human', async () => {
    const ok = makeBook({ figures: ['FIG_A'] });
    const code = await main(['--book', SLUG, '--chapter', '1'], {
      spawn: fakeSpawn(),
      booksRoot: ok.booksRoot,
    });
    expect(code).toBe(0);

    const bad = makeBook({ figures: ['FIG_A'] });
    const badCode = await main(['--book', SLUG, '--chapter', '1'], {
      spawn: fakeSpawn({ translate: () => ({ __exit: 1 }) }),
      booksRoot: bad.booksRoot,
    });
    expect(badCode).toBe(1);
  });

  it('leaves the repo’s own books/ untouched: no fixture path escapes into it', async () => {
    const { booksRoot } = makeBook({ figures: ['FIG_A'] });
    await runFigures(live(booksRoot), { spawn: fakeSpawn(), booksRoot });
    expect(fs.existsSync(path.join(REPO_ROOT, 'books', SLUG))).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────
// 🔴 money/F1 — A SIDECAR THAT EXISTS BUT CANNOT BE READ IS NOT "NO SIDECAR".
//
// `readSidecar` returns null for BOTH "absent" and "present but malformed" (the renderer's
// reason: one bad file must not kill a whole chapter render). The spend gate reads that one
// value, so a git-conflicted, truncated or hand-mangled sidecar was SPENDABLE — and step 7's
// `writeSidecar` then overwrote it, destroying a head editor's approved Icelandic and the
// `state` key with a green verdict and no bucket.
//
// This is CLAUDE.md §C14 ③'s class exactly: a gate keyed on one representation of "nothing",
// walked past by another representation of "nothing" (there, four bytes of `null` in
// glossary-unified.json; here, any byte sequence JSON.parse refuses).
//
// ⚠️ EVERY CASE BELOW IS PAIRED WITH THE VALID-SIDECAR CONTROL in the same describe: an
// unreadable-file suite that only ever refuses would pass against a driver that refuses
// everything, and the money assertion (`translate` spawned 0) would then be meaningless.
describe('a sidecar that is present but unreadable is refused, never re-bought', () => {
  const CONFLICTED =
    '<<<<<<< HEAD\n' +
    JSON.stringify({
      version: 1,
      basename: 'FIG_A',
      state: 'approved',
      blocks: { k0: 'Celsíus' },
    }) +
    '\n=======\n' +
    JSON.stringify({ version: 1, basename: 'FIG_A', blocks: { k0: 'IS k0' } }) +
    '\n>>>>>>> origin/main\n';
  const TRUNCATED = '{"version": 1, "basename": "FIG_A", "blocks": {"k0": "Cels';
  // 🔴 THE SHAPE THAT PARSES. `readSidecar` returns null for a top-level array too, so this
  // one never reaches JSON.parse's throw — it is refused by the type check. A fix keyed on
  // `try { JSON.parse } catch` alone would leave this arm open, which is why it is here.
  const ARRAY = '[{"version": 1, "blocks": {"k0": "Celsíus"}}]\n';

  for (const [label, bytes] of [
    ['a git merge conflict', CONFLICTED],
    ['a truncated write', TRUNCATED],
    ['a top-level array', ARRAY],
  ]) {
    it(`refuses ${label}: no MT, no overwrite, and the run needs a human`, async () => {
      const { booksRoot, bookDir } = makeBook({
        figures: ['FIG_A'],
        rawSidecars: { FIG_A: bytes },
      });
      const before = fs.readFileSync(sidecarPath(bookDir, 'FIG_A'), 'utf-8');
      const spawn = fakeSpawn();
      const result = await runFigures(live(booksRoot), { spawn, booksRoot });

      expect(spawn.countOf('translate')).toBe(0); // THE MONEY ASSERTION
      expect(rec(result, 'FIG_A').spent).toBe(false);
      expect(rec(result, 'FIG_A').outcome).toBe('failed-sidecar');
      expect(rec(result, 'FIG_A').reason).toContain(sidecarPath(bookDir, 'FIG_A'));
      // …and the bytes are EXACTLY as they were. A count of keys would pass against a driver
      // that rewrote the file with the same number of different ones.
      expect(fs.readFileSync(sidecarPath(bookDir, 'FIG_A'), 'utf-8')).toBe(before);
      expect(result.verdict.ok).toBe(false);
      // It costs nothing: the resolver is never even asked about it.
      expect(spawn.countOf('prepare')).toBe(0);
    });
  }

  // 🔴 THE CONTROL. Same fixture, same stages, one byte-level difference in the file: a VALID
  // sidecar with no composedHash is paid for and never published, so it recomposes and
  // publishes. Without this the three refusals above are indistinguishable from a driver that
  // refuses every figure that has any sidecar at all.
  it('a VALID sidecar in the same harness still recomposes and publishes (the control)', async () => {
    const { booksRoot, bookDir } = makeBook({
      figures: ['FIG_A'],
      sidecars: { FIG_A: madeSidecar('FIG_A', { k0: 'Celsíus' }) },
    });
    const spawn = fakeSpawn();
    const result = await runFigures(live(booksRoot), { spawn, booksRoot });
    expect(spawn.countOf('translate')).toBe(0);
    expect(rec(result, 'FIG_A').outcome).toBe('translated');
    expect(result.verdict.ok).toBe(true);
    expect(readSidecar(bookDir, 'FIG_A').blocks).toEqual({ k0: 'Celsíus' });
  });

  // 🔴 AND THE ONE THAT SEPARATES "unreadable" FROM "absent": a figure with NO sidecar file at
  // all in the SAME run is bought. Both arms are needed, or "refuses the unreadable one" is
  // satisfied by a driver that has stopped spending altogether.
  it('buys the figure with no sidecar FILE while refusing the unreadable one beside it', async () => {
    const { booksRoot, bookDir } = makeBook({
      figures: ['FIG_A', 'FIG_B'],
      rawSidecars: { FIG_A: TRUNCATED },
    });
    const spawn = fakeSpawn();
    const result = await runFigures(live(booksRoot), { spawn, booksRoot });
    expect(spawn.outDirsFor('translate')).toEqual(['FIG_B']); // NAMED, not counted
    expect(rec(result, 'FIG_A').outcome).toBe('failed-sidecar');
    expect(rec(result, 'FIG_B').outcome).toBe('translated');
    expect(fs.existsSync(path.join(bookDir, 'media', 'FIG_B_IS.svg'))).toBe(true);
  });

  // `--force` suppresses only the skipped-current check. It must not make an unreadable
  // sidecar spendable — spendability is a property of the file, never of a flag.
  it('--force cannot make an unreadable sidecar spendable', async () => {
    const { booksRoot } = makeBook({ figures: ['FIG_A'], rawSidecars: { FIG_A: TRUNCATED } });
    const spawn = fakeSpawn();
    const result = await runFigures(live(booksRoot, { force: true }), { spawn, booksRoot });
    expect(spawn.countOf('translate')).toBe(0);
    expect(rec(result, 'FIG_A').outcome).toBe('failed-sidecar');
  });

  // 🔴 THE REPORT LINE, WHICH WAS MEASURABLY WRONG. `--stale` narrows to the figures that
  // already HAVE a sidecar; the unreadable one HAS one, so it must be SELECTED and named —
  // not deselected and described to the operator as "no sidecar … the ones a run WITHOUT
  // --stale would buy", which is the exact opposite of the truth about it.
  it('--stale SELECTS it and the report does not call it "no sidecar"', async () => {
    const { booksRoot, bookDir } = makeBook({
      figures: ['FIG_A', 'FIG_B'],
      rawSidecars: { FIG_A: CONFLICTED },
    });
    const result = await runFigures(live(booksRoot, { stale: true }), {
      spawn: fakeSpawn(),
      booksRoot,
    });
    expect(result.enumerated).toBe(1); // FIG_A selected…
    expect(result.deselected).toBe(1); // …FIG_B, the one with no file, is not
    expect(rec(result, 'FIG_A').outcome).toBe('failed-sidecar');
    const report = summarise(result);
    expect(report).toMatch(/1 figure\(s\) in this chapter have no sidecar/);
    expect(report).toContain(sidecarPath(bookDir, 'FIG_A'));
    expect(report).toMatch(/VERDICT needs a human/);
  });

  // The dry run must see it too — a pre-flight exists to surface exactly this before any money
  // moves, and the refusal costs one existsSync.
  it('a dry run reports it as well', async () => {
    const { booksRoot } = makeBook({ figures: ['FIG_A'], rawSidecars: { FIG_A: ARRAY } });
    const result = await runFigures(live(booksRoot, { dryRun: true }), {
      spawn: fakeSpawn(),
      booksRoot,
    });
    expect(rec(result, 'FIG_A').outcome).toBe('failed-sidecar');
    expect(result.verdict.ok).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────
// 🔴 editorial/F3 — THE PRE-FLIGHT WAS BLIND TO A CORRUPT image-mapping.json, SO THE WHOLE
// CHAPTER WAS BOUGHT BEFORE THE MINT REFUSED IT.
//
// `mappingPreflight` reads the mapping through `loadImageBasenameMap`, which swallows a parse
// error or a non-array payload into `[]` — correctly, for the RENDERER, whose chapter must not
// die on one bad file. Every figure therefore read `mintable` and passed the pre-flight, while
// `mintMappingEntry` refuses the SAME file, one stage and one purchase later.
//
// ⚠️ SAME SHAPE AS money/F1 IN THE COMMIT BEFORE THIS ONE: a reader that collapses "absent" and
// "broken" into one value, consulted by a gate that must tell them apart. A MISSING mapping is
// handled correctly (organic has none, and every figure is legitimately mintable); a CORRUPT one
// was not.
describe('a corrupt image-mapping.json aborts the run BEFORE the money', () => {
  const CORRUPT = [
    ['a JSON object rather than an array', '{"originalImage": "FIG_A"}\n'],
    ['unparsable bytes (a git conflict)', '<<<<<<< HEAD\n[]\n=======\n[]\n>>>>>>> origin/main\n'],
  ];

  for (const [label, bytes] of CORRUPT) {
    it(`refuses ${label} — nothing spawned at all`, async () => {
      const { booksRoot, bookDir } = makeBook({ figures: ['FIG_A', 'FIG_B', 'FIG_C'] });
      const mappingPath = path.join(bookDir, 'media', 'image-mapping.json');
      fs.writeFileSync(mappingPath, bytes, 'utf-8');
      const spawn = fakeSpawn();
      await expect(runFigures(live(booksRoot), { spawn, booksRoot })).rejects.toThrow(
        /image-mapping\.json/
      );
      expect(spawn.countOf('translate')).toBe(0); // THE MONEY ASSERTION
      expect(spawn.calls).toHaveLength(0); // …and not one child process was started
      expect(fs.readFileSync(mappingPath, 'utf-8')).toBe(bytes); // the file is untouched
      expect(fs.existsSync(sidecarPath(bookDir, 'FIG_A'))).toBe(false);
    });

    // 🔴 A DRY RUN REPORTED IT AS PERFECTLY HEALTHY — byte-identical to the valid case — which
    // is the report an operator reads before deciding to spend.
    it(`refuses ${label} in a DRY RUN too`, async () => {
      const { booksRoot, bookDir } = makeBook({ figures: ['FIG_A'] });
      fs.writeFileSync(path.join(bookDir, 'media', 'image-mapping.json'), bytes, 'utf-8');
      await expect(
        runFigures(live(booksRoot, { dryRun: true }), { spawn: fakeSpawn(), booksRoot })
      ).rejects.toThrow(/image-mapping\.json/);
    });

    // ⚠️ THE EXIT CODE ALONE IS TRUE ON BOTH SIDES OF THIS FIX — today's driver also exits 1,
    // having bought the chapter and landed failed-publish on the mint. The spend counter beside
    // it is what makes the assertion mean something.
    it(`exits 1 (needs a human), not 2 (usage), on ${label} — having spent nothing`, async () => {
      const { booksRoot, bookDir } = makeBook({ figures: ['FIG_A'] });
      fs.writeFileSync(path.join(bookDir, 'media', 'image-mapping.json'), bytes, 'utf-8');
      const spawn = fakeSpawn();
      const code = await main(['--book', SLUG, '--chapter', '1'], { spawn, booksRoot });
      expect(code).toBe(1); // the operator typed the command correctly; the DATA is broken
      expect(spawn.countOf('translate')).toBe(0);
    });
  }

  // 🔴 THE TWO CONTROLS, IN THE SAME DESCRIBE. Without them "refuses a corrupt mapping" is
  // satisfied by a driver that refuses every run — and an ABSENT mapping is the ordinary state
  // of a book that has never published a figure, which must keep working.
  it('an ABSENT mapping file still runs and mints (organic’s state today)', async () => {
    const { booksRoot, bookDir } = makeBook({ figures: ['FIG_A'] });
    expect(fs.existsSync(path.join(bookDir, 'media', 'image-mapping.json'))).toBe(false);
    const spawn = fakeSpawn();
    const result = await runFigures(live(booksRoot), { spawn, booksRoot });
    expect(rec(result, 'FIG_A').outcome).toBe('translated');
    expect(spawn.countOf('translate')).toBe(1);
  });

  it('a VALID array mapping still runs (the second control)', async () => {
    const { booksRoot } = makeBook({ figures: ['FIG_A'], mapping: mapping3() });
    const result = await runFigures(live(booksRoot), { spawn: fakeSpawn(), booksRoot });
    expect(rec(result, 'FIG_A').outcome).toBe('translated');
    expect(result.verdict.ok).toBe(true);
  });

  // …and repairing the file is all it takes: the SECOND run completes at 0 ISK, because the
  // refusal happens before anything is bought rather than after.
  it('completes at zero spend once the mapping is repaired', async () => {
    const { booksRoot, bookDir } = makeBook({ figures: ['FIG_A'] });
    const mappingPath = path.join(bookDir, 'media', 'image-mapping.json');
    fs.writeFileSync(mappingPath, '{"nope": true}\n', 'utf-8');
    const first = fakeSpawn();
    await expect(runFigures(live(booksRoot), { spawn: first, booksRoot })).rejects.toThrow();
    expect(first.countOf('translate')).toBe(0);

    fs.writeFileSync(mappingPath, '[]\n', 'utf-8');
    const second = fakeSpawn();
    const result = await runFigures(live(booksRoot), { spawn: second, booksRoot });
    expect(second.countOf('translate')).toBe(1); // it had never been bought, so it is bought now
    expect(rec(result, 'FIG_A').outcome).toBe('translated');
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────
// 🔴 money/F3 — THE PRE-FLIGHT CHECKED WHETHER AN ENTRY COULD BE MINTED, NEVER WHETHER THE ONE
// ALREADY THERE COULD BE PUBLISHED.
//
// `mappingPreflight` returns `mapped` for ANY existing image-mapping.json row without looking at
// its `outputName`, so two publish refusals still landed AFTER the money: the driver's own
// extension check (`the composer produced translated.svg but image-mapping.json names …`) and
// `publishFigureSvg`'s `unsafe-output-name`. Both are decidable from `rec.mapping.outputName`,
// which the pre-flight already holds, against the `.svg` literal it already uses.
//
// ⚠️ THE TWO HALVES HAVE DIFFERENT SCOPES, AND CONFLATING THEM MANUFACTURES A FALSE RED.
// Containment applies to every PUBLISH_BOUND outcome — nothing may ever be written outside
// media/. The `.svg` extension applies ONLY to `translated`, the one outcome whose composer
// output is an SVG: a `copied-photo` with a legitimate `PHOTO1_IS.png` row is healthy, and
// asserting `.svg` over all of PUBLISH_BOUND flips it to a spurious failed-publish.
describe('the pre-flight refuses an UNPUBLISHABLE mapped entry before the money', () => {
  const photo = { prepare: () => ({ sendable: 0, imageXObjects: 1, paintOps: 0 }) };

  it('refuses a mapped .png on a TRANSLATED figure before the MT, not after', async () => {
    const { booksRoot, bookDir } = makeBook({
      figures: ['FIG_A'],
      mapping: [{ originalImage: 'FIG_A', outputName: 'FIG_A_IS.png', extension: '.png' }],
    });
    const spawn = fakeSpawn();
    const result = await runFigures(live(booksRoot), { spawn, booksRoot });

    expect(spawn.countOf('translate')).toBe(0); // THE MONEY ASSERTION
    expect(rec(result, 'FIG_A').spent).toBe(false);
    expect(rec(result, 'FIG_A').outcome).toBe('failed-publish');
    expect(rec(result, 'FIG_A').reason).toMatch(/FIG_A_IS\.png/);
    expect(fs.existsSync(sidecarPath(bookDir, 'FIG_A'))).toBe(false);
    expect(spawn.countOf('compose')).toBe(0);
  });

  it('refuses a mapped outputName that escapes media/ before the MT', async () => {
    const { booksRoot, bookDir } = makeBook({
      figures: ['FIG_A'],
      mapping: [
        { originalImage: 'FIG_A', outputName: '../01-source/FIG_A.svg', extension: '.svg' },
      ],
    });
    const spawn = fakeSpawn();
    const result = await runFigures(live(booksRoot), { spawn, booksRoot });

    expect(spawn.countOf('translate')).toBe(0);
    expect(rec(result, 'FIG_A').outcome).toBe('failed-publish');
    expect(rec(result, 'FIG_A').reason).toMatch(/media\//);
    expect(fs.existsSync(sidecarPath(bookDir, 'FIG_A'))).toBe(false);
    // 🔴 AND NOTHING REACHED 01-source/, WHICH IS THE POINT OF THE CONTAINMENT RULE: those
    // bytes are the legally load-bearing OpenStax copy and their licence is fixed at the date
    // the copy was obtained.
    expect(fs.readdirSync(path.join(bookDir, '01-source', 'ch01'))).toEqual(['m00001.cnxml']);
  });

  // 🔴 CONTAINMENT IS WIDER THAN THE EXTENSION CHECK. A copy is not published by the driver
  // today, but a row that would write outside media/ is a real defect in a committed data file
  // and `unmintable` already downgrades copies for the milder reason of being unpublishable.
  it('refuses an escaping outputName on a COPIED figure too', async () => {
    const { booksRoot } = makeBook({
      figures: ['PHOTO1'],
      mapping: [{ originalImage: 'PHOTO1', outputName: '/etc/PHOTO1.svg', extension: '.svg' }],
    });
    const result = await runFigures(live(booksRoot), { spawn: fakeSpawn(photo), booksRoot });
    expect(rec(result, 'PHOTO1').outcome).toBe('failed-publish');
  });

  // 🔴 THE CONTROL THAT KILLS THE OBVIOUS OVER-FIX, measured before it was written: a
  // `copied-photo` with a legitimate `.png` row is HEALTHY and must stay `copied-photo`.
  // Asserting `.svg` across all of PUBLISH_BOUND turns this green run red for nothing.
  it('leaves a copied-photo with a legitimate .png mapping alone', async () => {
    const { booksRoot } = makeBook({
      figures: ['PHOTO1'],
      mapping: [{ originalImage: 'PHOTO1', outputName: 'PHOTO1_IS.png', extension: '.png' }],
    });
    const result = await runFigures(live(booksRoot), { spawn: fakeSpawn(photo), booksRoot });
    expect(rec(result, 'PHOTO1').outcome).toBe('copied-photo');
    expect(rec(result, 'PHOTO1').mapping).toEqual({
      status: 'mapped',
      outputName: 'PHOTO1_IS.png',
    });
    expect(result.verdict.ok).toBe(true);
  });

  // The second control: a healthy mapped .svg on a translated figure goes all the way through.
  it('publishes a translated figure whose mapped entry is a flat .svg (the control)', async () => {
    const { booksRoot, bookDir } = makeBook({
      figures: ['FIG_A'],
      mapping: [{ originalImage: 'FIG_A', outputName: 'FIG_A_IS.svg', extension: '.svg' }],
    });
    const spawn = fakeSpawn();
    const result = await runFigures(live(booksRoot), { spawn, booksRoot });
    expect(spawn.countOf('translate')).toBe(1);
    expect(rec(result, 'FIG_A').outcome).toBe('translated');
    expect(fs.existsSync(path.join(bookDir, 'media', 'FIG_A_IS.svg'))).toBe(true);
  });

  // …and the repair completes at ZERO spend, because the refusal happened before the purchase.
  it('completes at zero spend once the row is repaired', async () => {
    const { booksRoot, bookDir } = makeBook({
      figures: ['FIG_A'],
      mapping: [{ originalImage: 'FIG_A', outputName: 'FIG_A_IS.png', extension: '.png' }],
    });
    const first = fakeSpawn();
    await runFigures(live(booksRoot), { spawn: first, booksRoot });
    expect(first.countOf('translate')).toBe(0);
    fs.writeFileSync(
      path.join(bookDir, 'media', 'image-mapping.json'),
      `${JSON.stringify([{ originalImage: 'FIG_A', outputName: 'FIG_A_IS.svg', extension: '.svg' }], null, 2)}\n`
    );
    const second = fakeSpawn();
    const result = await runFigures(live(booksRoot), { spawn: second, booksRoot });
    expect(second.countOf('translate')).toBe(1); // bought once, on the run that could publish it
    expect(rec(result, 'FIG_A').outcome).toBe('translated');
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────
// 🔴 editorial/F5 — isStale AND THE PUBLISHER DISAGREED ABOUT renderHash, SO A COMPOSER_VERSION
// BUMP PUT EVERY FIGURE INTO A PERMANENT RECOMPOSE-AND-REPUBLISH LOOP.
//
// `isStale` re-hashed `blocks` under the module's CURRENT COMPOSER_VERSION and compared against
// the STORED renderHash — the documented way to invalidate every stored hash on a bump. But
// NOTHING in the driver ever rewrites renderHash: the publisher stamps
// `composedHash = sidecar.renderHash`, the value already stored, so its write guard was false
// and it wrote nothing. The figure recomposed and republished on every run, for ever, reporting
// `translated` and VERDICT ok. `applyApprovedFigureEdits` is the only writer that refreshes
// renderHash, so the loop's only exit was a human review pass — and the R7 figures with no
// <figure> node have no editor who can perform one.
//
// 🔴 THE FIX IS A SECOND STAMP, NOT A REFRESHED renderHash. Refreshing renderHash on recompose
// silently re-certifies a head editor's approval for output produced by a composer they never
// saw (measured: mt-preview/mt-preview -> approved/approved), which is the one reader-visible
// failure anywhere in this finding. `composedVersion` describes the PUBLISHED ARTWORK, exactly
// as `composedHash` does; `renderHash`/`composerVersion` keep describing the TEXT, so
// `editorialState` still demotes an approved figure to mt-preview after a bump — which is what
// COMPOSER_VERSION's own docstring promises.
describe('a COMPOSER_VERSION bump recomposes ONCE, not for ever', () => {
  const blocks = { k0: 'IS k0', k1: 'IS k1' };
  const OLD = '0'; // "the composer the stored hashes were computed under", i.e. a bump happened
  const oldHash = computeRenderHash(blocks, OLD);
  /** A sidecar minted and published by an OLDER composer: self-consistent, and now out of date. */
  const bumped = () => ({
    version: 1,
    basename: 'FIG_A',
    renderHash: oldHash,
    composedHash: oldHash,
    composerVersion: OLD,
    composedVersion: OLD,
    blocks,
  });

  it('does not loop: run 1 recomposes and republishes, run 2 is skipped-current', async () => {
    const { booksRoot, bookDir } = makeBook({
      figures: ['FIG_A'],
      mapping: [{ originalImage: 'FIG_A', outputName: 'FIG_A_IS.svg', extension: '.svg' }],
      sidecars: { FIG_A: bumped() },
    });
    expect(isStale(bumped())).toBe(true); // the premise: the bump really does reach it

    const one = fakeSpawn();
    const first = await runFigures(live(booksRoot), { spawn: one, booksRoot });
    expect(one.countOf('translate')).toBe(0); // a recompose spends NOTHING
    expect(rec(first, 'FIG_A').outcome).toBe('translated');
    expect(one.countOf('compose')).toBe(1);
    expect(rec(first, 'FIG_A').published).not.toBeNull();

    // 🔴 THE WRITE GUARD IS THE HALF THAT IS EASY TO MISS. `composedHash` did not move — it is
    // still the old hash — so a guard keyed on `composedHash` alone writes NOTHING here and the
    // new stamp is a no-op in exactly the scenario it exists to fix.
    const after = readSidecar(bookDir, 'FIG_A');
    expect(after.composedHash).toBe(oldHash); // unchanged…
    expect(after.composedVersion).toBe(COMPOSER_VERSION); // …and the version stamp DID land
    expect(isStale(after)).toBe(false);

    const two = fakeSpawn();
    const second = await runFigures(live(booksRoot), { spawn: two, booksRoot });
    expect(rec(second, 'FIG_A').outcome).toBe('skipped-current');
    expect(two.countOf('prepare')).toBe(0);
    expect(two.countOf('compose')).toBe(0);
    expect(two.countOf('translate')).toBe(0);
  });

  // 🔴 THE TWO SIDES, PINNED AGAINST EACH OTHER RATHER THAN EACH ASSERTED ALONE. Whatever the
  // publisher has just stamped, `isStale` must call current — that is the property whose absence
  // WAS the loop, and it is the one a future edit to either side can break.
  it('every sidecar the publisher stamps reads NOT stale', async () => {
    const shapes = {
      FRESH: null, // bought this run
      BUMPED: bumped(),
      PAID_UNPUBLISHED: madeSidecar('X', blocks), // renderHash, no composedHash
    };
    for (const [label, planted] of Object.entries(shapes)) {
      const { booksRoot, bookDir } = makeBook({
        figures: ['FIG_A'],
        sidecars: planted ? { FIG_A: { ...planted, basename: 'FIG_A' } } : {},
      });
      const result = await runFigures(live(booksRoot), { spawn: fakeSpawn(), booksRoot });
      expect(`${label}:${rec(result, 'FIG_A').outcome}`).toBe(`${label}:translated`);
      expect(`${label}:${isStale(readSidecar(bookDir, 'FIG_A'))}`).toBe(`${label}:false`);
    }
  });

  // 🔴 THE PROPERTY THE OBVIOUS ALTERNATIVE FIX BREAKS. A bump must send an APPROVED figure back
  // to mt-preview until a human re-reviews it — that is what COMPOSER_VERSION is for. Refreshing
  // renderHash on recompose would leave it reading 'approved' for artwork nobody approved.
  it('still demotes an approved figure to mt-preview after the bump, and after the recompose', async () => {
    const approved = { ...bumped(), state: 'approved' };
    const { booksRoot, bookDir } = makeBook({
      figures: ['FIG_A'],
      mapping: [{ originalImage: 'FIG_A', outputName: 'FIG_A_IS.svg', extension: '.svg' }],
      sidecars: { FIG_A: approved },
    });
    await runFigures(live(booksRoot), { spawn: fakeSpawn(), booksRoot });
    const after = readSidecar(bookDir, 'FIG_A');
    expect(after.state).toBe('approved'); // the stored column is untouched…
    expect(editorialState(after, after.blocks, COMPOSER_VERSION)).toBe('mt-preview');
    expect(effectiveState(after, after.blocks, COMPOSER_VERSION)).toBe('mt-preview');
    // …and the CONTROL: a sidecar whose hashes are current under THIS composer still reads
    // approved, so the demotion above is the bump and not a driver that demotes everything.
    const current = { ...currentSidecar('FIG_B', blocks), state: 'approved' };
    expect(effectiveState(current, current.blocks, COMPOSER_VERSION)).toBe('approved');
  });

  // The block-drift detector must survive the change: a sidecar whose stored renderHash no
  // longer matches its own blocks (someone edited the file by hand) is still stale. Hashing
  // under the sidecar's OWN composerVersion is what keeps this true without reopening the loop.
  it('still calls a hand-edited sidecar stale when its renderHash no longer matches its blocks', () => {
    const drifted = {
      ...currentSidecar('FIG_A', blocks),
      composedVersion: COMPOSER_VERSION,
      blocks: { ...blocks, k0: 'SOMEONE EDITED THIS BY HAND' },
    };
    expect(isStale(drifted)).toBe(true);
    // The control: the same sidecar with its blocks untouched is current.
    const clean = { ...currentSidecar('FIG_A', blocks), composedVersion: COMPOSER_VERSION };
    expect(isStale(clean)).toBe(false);
  });
});
