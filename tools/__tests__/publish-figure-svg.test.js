// tools/__tests__/publish-figure-svg.test.js
/**
 * ⑰ — publishing a composed figure, and the guards that make it safe.
 *
 * The composer writes `experiments/figure-text-translation/out/translated.svg`.
 * Nothing carried it to `books/<slug>/media/<basename>_IS.svg`, which is what
 * `cnxml-inject` swaps in and what a reader actually sees — so `composedHash`
 * described a file no reader would ever load. This module closes that.
 *
 * 🔴 IT IS JS, NOT PYTHON, AND THAT RETIRES A RULE RATHER THAN GUARDING IT.
 * The mapping lookup keeps its one owner (`loadImageBasenameMap`), and
 * `computeRenderHash` lives here too — so there is no hashing in the Python
 * tree at all, and "the composer must COPY the hash, never compute one" stops
 * being something a pin has to enforce.
 *
 * ⚠️ This REPLACES published, reader-visible artwork. That is intended: the
 * figures currently in `books/<slug>/media/` came from a June test run with NO
 * editorial surface, and were published as MT preview. Replacing them with
 * output the editor can review — and which the renderer badges `mt-preview`
 * until approved — is the point. All 691 are git-tracked, so `git checkout` is
 * the restore and no .bak machinery is needed.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { createRequire } from 'module';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { publishFigureSvg } from '../publish-figure-svg.js';

const require = createRequire(import.meta.url);
const {
  writeSidecar,
  readSidecar,
  computeRenderHash,
  COMPOSER_VERSION,
} = require('../lib/figure-text-sidecar.cjs');

const BASENAME = 'CNX_Chem_01_06_TempScales';
const BLOCKS = { Celsius: 'Celsíus', 'Boiling point of water': 'Suðumark vatns' };

let root, bookDir, outDir;

/** A books/<slug>/ tree with a figure-text sidecar, a media mapping, and out/. */
function scaffold({
  mapped = true,
  withSvg = true,
  metaBasename = BASENAME,
  sidecar,
  outputName = `${BASENAME}_IS.svg`,
} = {}) {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'pubfig-'));
  bookDir = path.join(root, 'books', 'efnafraedi-2e');
  fs.mkdirSync(path.join(bookDir, 'media'), { recursive: true });
  writeSidecar(bookDir, BASENAME, sidecar || { version: 1, basename: BASENAME, blocks: BLOCKS });
  fs.writeFileSync(
    path.join(bookDir, 'media', 'image-mapping.json'),
    JSON.stringify(mapped ? [{ originalImage: BASENAME, outputName }] : [], null, 1)
  );
  outDir = path.join(root, 'out');
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(
    path.join(outDir, 'meta.json'),
    JSON.stringify({ source: `/somewhere/Chapter 1/${metaBasename}.pdf`, page: [468, 328] })
  );
  if (withSvg) fs.writeFileSync(path.join(outDir, 'translated.svg'), '<svg>composed</svg>');
  return {
    sidecarPath: path.join(bookDir, 'figure-text', `${BASENAME}.is.json`),
    svgPath: path.join(outDir, 'translated.svg'),
    metaPath: path.join(outDir, 'meta.json'),
  };
}

afterEach(() => root && fs.rmSync(root, { recursive: true, force: true }));

describe('publishFigureSvg', () => {
  it('writes the composed SVG at the name the mapping gives it', () => {
    const args = scaffold();
    const r = publishFigureSvg(args);
    expect(r.ok).toBe(true);
    expect(r.outputName).toBe(`${BASENAME}_IS.svg`);
    // The BYTES, not merely the path: a publisher that created an empty file at
    // the right name would satisfy an existence check.
    expect(fs.readFileSync(path.join(bookDir, 'media', `${BASENAME}_IS.svg`), 'utf-8')).toBe(
      '<svg>composed</svg>'
    );
  });

  it('derives the book and basename from the sidecar path — no flags needed', () => {
    const args = scaffold();
    const r = publishFigureSvg(args);
    expect(r.book).toBe('efnafraedi-2e');
    expect(r.basename).toBe(BASENAME);
  });

  it('reports that it REPLACED an existing published figure', () => {
    const args = scaffold();
    const target = path.join(bookDir, 'media', `${BASENAME}_IS.svg`);
    fs.writeFileSync(target, '<svg>the June test run</svg>');
    const r = publishFigureSvg(args);
    // Replacing is intended — the file being replaced is itself unreviewed MT
    // preview — but a run that silently overwrote published artwork without
    // saying so would be the wrong kind of quiet.
    expect(r.replaced).toBe(true);
    expect(fs.readFileSync(target, 'utf-8')).toBe('<svg>composed</svg>');
  });

  it('says so when it created rather than replaced', () => {
    const r = publishFigureSvg(scaffold());
    expect(r.replaced).toBe(false); // control: `replaced` is not hardcoded true
  });
});

/**
 * 🔴 THE GUARD THAT MATTERS MOST. `out/` holds whatever figure was extracted
 * LAST. Publishing it under a sidecar for a different figure would put figure
 * A's artwork on the page under figure B's translations — a correct-looking
 * translation of the wrong picture, which is exactly the failure sources.py
 * exists to prevent one stage earlier.
 *
 * Neither source can catch it alone: the sidecar filename says which figure the
 * TEXT is for, and out/meta.json's source PDF says which figure the ARTWORK is
 * of. Only comparing them answers "are these the same figure?".
 */
describe('the basename cross-check', () => {
  it('REFUSES when out/ holds a different figure than the sidecar names', () => {
    const args = scaffold({ metaBasename: 'CNX_Chem_01_01_SciMethod' });
    const r = publishFigureSvg(args);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('basename-mismatch');
    // The names of BOTH sides, or the operator cannot tell which is stale.
    expect(r.message).toContain(BASENAME);
    expect(r.message).toContain('CNX_Chem_01_01_SciMethod');
    // ...and nothing was written.
    expect(fs.existsSync(path.join(bookDir, 'media', `${BASENAME}_IS.svg`))).toBe(false);
  });

  it('accepts when they agree — the control that keeps the refusal meaningful', () => {
    expect(publishFigureSvg(scaffold()).ok).toBe(true);
  });
});

describe('refusals, each leaving the tree untouched', () => {
  const published = () => fs.existsSync(path.join(bookDir, 'media', `${BASENAME}_IS.svg`));

  it('refuses a figure with no image-mapping entry', () => {
    // The mapped name is the ONLY way to know the filename. Building one from a
    // suffix would restate DEFAULT_SUFFIX, whose owner is
    // tools/generate-image-mapping.js.
    const r = publishFigureSvg(scaffold({ mapped: false }));
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('unmapped');
    expect(published()).toBe(false);
  });

  it('refuses when the composed SVG is not there', () => {
    const r = publishFigureSvg(scaffold({ withSvg: false }));
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('no-svg');
    expect(published()).toBe(false);
  });

  it('refuses a sidecar path that is not books/<slug>/figure-text/<name>.is.json', () => {
    const args = scaffold();
    const r = publishFigureSvg({ ...args, sidecarPath: path.join(root, 'stray.is.json') });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('bad-sidecar-path');
    expect(published()).toBe(false);
  });

  it('refuses when the sidecar itself is missing or malformed', () => {
    const args = scaffold();
    fs.writeFileSync(args.sidecarPath, '{ not json');
    const r = publishFigureSvg(args);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('no-sidecar');
    expect(published()).toBe(false);
  });
});

/**
 * The stamp records "the image ON DISK was composed from the blocks that
 * produced this hash" — and now it is the PUBLISHED image, which is the whole
 * point of ⑰. It COPIES the sidecar's own renderHash; nothing recomputes.
 */
describe('composedHash', () => {
  const approved = () => ({
    version: 1,
    basename: BASENAME,
    state: 'approved',
    renderHash: computeRenderHash(BLOCKS, COMPOSER_VERSION),
    composerVersion: COMPOSER_VERSION,
    blocks: BLOCKS,
  });

  it('stamps the sidecar with its own renderHash, so effectiveState can go approved', () => {
    const args = scaffold({ sidecar: approved() });
    const before = readSidecar(bookDir, BASENAME);
    const r = publishFigureSvg(args);
    expect(r.composedHash).toBe(before.renderHash);
    expect(readSidecar(bookDir, BASENAME).composedHash).toBe(before.renderHash);
  });

  it('COPIES an implausible value rather than computing one', () => {
    // 'not-a-hash-at-all' cannot be produced by hashing anything, so a
    // recomputing implementation fails here and only here.
    const args = scaffold({ sidecar: { ...approved(), renderHash: 'not-a-hash-at-all' } });
    publishFigureSvg(args);
    expect(readSidecar(bookDir, BASENAME).composedHash).toBe('not-a-hash-at-all');
  });

  it('keeps the canonical key order — composedHash directly after renderHash', () => {
    // applyApprovedFigureEdits rewrites this same committed file on the next
    // approval. If the two writers disagreed about where the key goes, every
    // publish/approve cycle would move a line and churn the diff.
    publishFigureSvg(scaffold({ sidecar: approved() }));
    const keys = Object.keys(readSidecar(bookDir, BASENAME));
    expect(keys[keys.indexOf('renderHash') + 1]).toBe('composedHash');
  });

  it('publishes a sidecar with NO renderHash and stamps nothing', () => {
    // ⚠️ CORRECTED 2026-09-07 (M5 Task 6b). This used to be described as "the ordinary case:
    // a sidecar nobody has approved has no renderHash to copy". The driver now mints every
    // sidecar WITH a renderHash and no `state`, so this shape is the exception — hand-written,
    // or from before the driver existed. It must still publish rather than error, and
    // effectiveState reads mt-preview regardless, so the reader gets a badged figure.
    const r = publishFigureSvg(scaffold());
    expect(r.ok).toBe(true);
    expect(r.composedHash).toBeNull();
    expect(readSidecar(bookDir, BASENAME).composedHash).toBeUndefined();
  });

  it('leaves the rest of the sidecar byte-identical when it stamps', () => {
    const args = scaffold({ sidecar: approved() });
    const before = fs.readFileSync(args.sidecarPath, 'utf-8');
    publishFigureSvg(args);
    const after = fs.readFileSync(args.sidecarPath, 'utf-8');
    const norm = (t) =>
      t
        .split('\n')
        .map((l) => l.trim().replace(/,$/, ''))
        .filter(Boolean);
    const added = norm(after).filter((l) => !norm(before).includes(l));
    expect(added).toHaveLength(1);
    expect(added[0]).toContain('composedHash');
    expect(norm(before).filter((l) => !norm(after).includes(l))).toEqual([]);
  });

  // 🔴 A SHIPPED BUG, found while reviewing the M5 driver plan (register §C138).
  // `withComposedHash` stamped the NEW hash when the loop reached `renderHash`, then
  // walked on to the sidecar's OWN pre-existing `composedHash` key and copied the STALE
  // value back over it. The returned object is built from `sidecar.renderHash` by a
  // different path and stayed correct — so a test asserting on `r.composedHash` passes
  // VACUOUSLY against the live bug. These assert on disk, which is the only place the
  // defect is observable.
  //
  // Consequence: a re-publish never completed the correction loop. `composedHash` stayed
  // behind `renderHash` for ever, so every later `--stale` query re-selected the same
  // figure and an approved figure's badge could never go green.
  it('OVERWRITES a stale composedHash that is already in the sidecar', () => {
    const args = scaffold({
      sidecar: { ...approved(), composedHash: 'stale-from-an-earlier-publish' },
    });
    const expected = readSidecar(bookDir, BASENAME).renderHash;
    const r = publishFigureSvg(args);
    expect(r.ok).toBe(true);
    expect(readSidecar(bookDir, BASENAME).composedHash).toBe(expected);
  });

  // The control for the fix's SHAPE. Skipping the key in the loop must still place it
  // directly after `renderHash`, even when the file on disk had it somewhere else —
  // otherwise the fix trades a stale value for a churning diff. An unconditional
  // re-assign passes the test above and fails this one.
  it('restores the canonical key order when composedHash arrived BEFORE renderHash', () => {
    const renderHash = computeRenderHash(BLOCKS, COMPOSER_VERSION);
    const args = scaffold({
      sidecar: {
        version: 1,
        basename: BASENAME,
        composedHash: 'stale-and-in-the-wrong-place',
        state: 'approved',
        renderHash,
        composerVersion: COMPOSER_VERSION,
        blocks: BLOCKS,
      },
    });
    publishFigureSvg(args);
    const written = readSidecar(bookDir, BASENAME);
    const keys = Object.keys(written);
    expect(keys[keys.indexOf('renderHash') + 1]).toBe('composedHash');
    expect(written.composedHash).toBe(renderHash);
    // Non-vacuity: the key really was somewhere else before, so this is a MOVE.
    expect(keys.filter((k) => k === 'composedHash')).toHaveLength(1);
  });
});

/**
 * 🔴 THE COMPOSE VINTAGE CHECK — the window this publisher's own re-read opens.
 *
 * `publishFigureSvg` reads the sidecar from disk AFTER the caller has already composed the
 * SVG. It has to: `withComposedHash` MERGES the stamp into the file as it now stands, so a
 * publisher handed the caller's in-memory copy would write that copy back wholesale and
 * silently un-approve a head editor's concurrent correction. The re-read is correct; what was
 * missing is any check that it read the SAME blocks the SVG was drawn from.
 *
 * Without it, a `writeSidecar` landing inside the caller's compose — `applyApprovedFigureEdits`
 * on the very figure being recomposed — makes the stamp certify blocks the SVG was never
 * composed from: `composedHash === renderHash`, `effectiveState` goes 'approved', the renderer
 * emits NO badge, `isStale` goes false, and the reader sees the PRE-correction artwork for
 * ever. Nothing in the repo can see it, because the sidecar is self-consistent by construction.
 *
 * ⚠️ The expectation is `renderHash` COPIED from the caller's own sidecar, never a hash
 * recomputed from its blocks: a hand-written sidecar whose stored hash disagrees with its
 * blocks would otherwise refuse on every run, for ever. "Copied, never computed" is the rule
 * on both sides of this call.
 */
describe('the compose vintage check', () => {
  const approved = () => ({
    version: 1,
    basename: BASENAME,
    state: 'approved',
    renderHash: computeRenderHash(BLOCKS, COMPOSER_VERSION),
    composerVersion: COMPOSER_VERSION,
    blocks: BLOCKS,
  });

  it('REFUSES when the sidecar on disk is not the one the caller composed from', () => {
    const args = scaffold({ sidecar: approved() });
    const r = publishFigureSvg({ ...args, expectedRenderHash: 'the-vintage-the-caller-composed' });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('sidecar-moved');
    // BOTH sides named, as `basename-mismatch` does — otherwise the operator cannot tell
    // which of the two is the stale one.
    expect(r.message).toContain('the-vintage-the-caller-composed');
    expect(r.message).toContain(approved().renderHash);
  });

  it('leaves the tree exactly as it was when it refuses', () => {
    const args = scaffold({ sidecar: approved() });
    const before = fs.readFileSync(args.sidecarPath, 'utf-8');
    publishFigureSvg({ ...args, expectedRenderHash: 'moved' });
    // No artwork published, and no stamp: a refusal must be a non-event on disk, or the
    // next run would read the figure as current and never revisit it.
    expect(fs.existsSync(path.join(bookDir, 'media', `${BASENAME}_IS.svg`))).toBe(false);
    expect(fs.readFileSync(args.sidecarPath, 'utf-8')).toBe(before);
  });

  it('PUBLISHES when the vintage agrees — the control that keeps the refusal meaningful', () => {
    const args = scaffold({ sidecar: approved() });
    const expected = approved().renderHash;
    const r = publishFigureSvg({ ...args, expectedRenderHash: expected });
    expect(r.ok).toBe(true);
    expect(readSidecar(bookDir, BASENAME).composedHash).toBe(expected);
  });

  it('COPIES the expectation rather than recomputing it from the blocks', () => {
    // A sidecar whose stored renderHash cannot be the hash of its own blocks. A publisher
    // that compared `computeRenderHash(sidecar.blocks, …)` against the caller's expectation
    // refuses here — for ever, on every run — while a publisher that compares the stored
    // values agrees. Only this fixture separates the two.
    const args = scaffold({ sidecar: { ...approved(), renderHash: 'not-a-hash-at-all' } });
    const r = publishFigureSvg({ ...args, expectedRenderHash: 'not-a-hash-at-all' });
    expect(r.ok).toBe(true);
    expect(readSidecar(bookDir, BASENAME).composedHash).toBe('not-a-hash-at-all');
  });

  it('does not check at all when the caller states no expectation', () => {
    // The hand-run CLI composes by hand and passes no key, and must keep publishing. The
    // check is the DRIVER's, because only the driver knows which blocks it fed the composer.
    const args = scaffold({ sidecar: approved() });
    expect(publishFigureSvg(args).ok).toBe(true);
    expect('expectedRenderHash' in args).toBe(false); // non-vacuity: the key really is absent
  });

  it('accepts a null expectation against a sidecar that has no renderHash', () => {
    // The legacy shape: hand-written, or from before the driver existed. The driver passes
    // `null` for it, which must agree with `undefined` on disk rather than refusing.
    const args = scaffold();
    const r = publishFigureSvg({ ...args, expectedRenderHash: null });
    expect(r.ok).toBe(true);
    expect(r.composedHash).toBeNull();
  });

  it('REFUSES a null expectation once a renderHash has appeared underneath it', () => {
    // The same legacy shape, with a concurrent approval landing during compose. `null` vs a
    // real hash is a move, and the || null normalisation must not swallow it.
    const args = scaffold({ sidecar: approved() });
    const r = publishFigureSvg({ ...args, expectedRenderHash: null });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('sidecar-moved');
  });
});

/**
 * 🔴 PROVENANCE. `01-source` holds the legally load-bearing OpenStax CNXML, and the
 * licence governing each book is the one in force on the date that copy was obtained.
 * This publisher writes a file whose NAME comes from a committed JSON data file — so a
 * traversing `outputName` turns a figure publish into a write inside the licensed tree.
 * Found by a provenance audit 2026-09-05, which proved both arms: the traversal wrote
 * into `01-source/` AND the call still returned `ok: true`.
 */
describe('the published name may not escape media/', () => {
  const TRAVERSALS = [
    '../01-source/media/CNX_Fake.jpg',
    '../../efnafraedi-2e/01-source/ch01/m68663.cnxml',
    'sub/../../01-source/media/x.svg',
    '/etc/passwd',
  ];

  for (const outputName of TRAVERSALS) {
    it(`refuses ${outputName} and writes nothing`, () => {
      const args = scaffold({ outputName });
      const before = walk(bookDir);
      const res = publishFigureSvg(args);
      expect(res.ok).toBe(false);
      expect(res.reason).toBe('unsafe-output-name');
      // The refusal must also be a NON-EVENT on disk — a rejected call that already
      // copied the file would report safety it does not have.
      expect(walk(bookDir)).toEqual(before);
    });
  }

  it('still publishes an ordinary name — the control', () => {
    // Without this, "refuses everything" would pass every assertion above.
    const args = scaffold();
    expect(publishFigureSvg(args).ok).toBe(true);
  });
});

/** Every file under dir, relative and sorted — a comparable snapshot of the tree. */
function walk(dir) {
  const out = [];
  const rec = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) rec(p);
      else out.push(path.relative(dir, p));
    }
  };
  rec(dir);
  return out.sort();
}

describe('the committed corpus', () => {
  const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..');

  it("resolves a real chemistry figure through the book's own mapping", () => {
    // Corpus control: the resolution path is exercised against the real
    // image-mapping.json, not only against a fixture built to resolve.
    const { loadImageBasenameMap } = require('../lib/image-basename-map.cjs');
    const entries = loadImageBasenameMap(path.join(repoRoot, 'books', 'efnafraedi-2e'));
    const hit = entries.find((e) => e.originalImage === BASENAME);
    expect(hit, `${BASENAME} must be in the committed mapping`).toBeTruthy();
    expect(hit.outputName).toBe(`${BASENAME}_IS.svg`);
  });
});
