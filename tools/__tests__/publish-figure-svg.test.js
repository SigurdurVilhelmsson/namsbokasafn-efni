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

  it('publishes an UNAPPROVED figure and stamps nothing', () => {
    // 🔴 The ordinary case, and it must not be an error: the plan is to publish
    // MT output and review it afterwards. A sidecar nobody has approved has no
    // renderHash to copy, and effectiveState reads mt-preview regardless — so
    // the reader correctly gets a badged figure.
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
