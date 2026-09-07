/**
 * tools/lib/figure-enumerate.cjs — the ONE figure/image enumeration predicate.
 *
 * 🔴 THE MODULE COMPUTES TWO SETS, NOT ONE ([USER] ruling R7,
 * docs/superpowers/specs/2026-09-06-m5-figure-driver-design.md:39 and :197):
 *   - ENUMERATION  = every `<image src>` in the chapter's CNXML. The driver
 *     translates all of them, because readers are the point.
 *   - REVIEWABILITY = the `<figure>` subset that has a node in 02-structure,
 *     i.e. the ones the review panel can actually show an editor.
 * The job is to compute BOTH and NAME the gap, never to make them agree.
 *
 * ⚠️ `reviewable` here is STRUCTURAL — "does this image sit inside a <figure>"
 * — and deliberately NOT the runtime sense the review panel uses at request
 * time ("does books/<slug>/figure-text/<basename>.is.json exist"). The runtime
 * sense is 0-for-everything before the driver has spent a krona, so a
 * --dry-run built on it would report zero reviewable figures for ever.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createRequire } from 'module';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const {
  basenameFromSrc,
  listCnxmlImages,
  listStructureFigures,
  enumerateChapterImages,
} = require('../lib/figure-enumerate.cjs');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const CHEM_DIR = path.join(REPO_ROOT, 'books', 'efnafraedi-2e');

let tmpRoot;
beforeAll(() => {
  // /tmp here is a ~4.9 GB tmpfs that runs hot; afterAll removes this.
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'figenum-'));
});
afterAll(() => {
  if (tmpRoot) fs.rmSync(tmpRoot, { recursive: true, force: true });
});

/** Build a throwaway books/<slug> tree. Returns its bookDir. */
function fixtureBook(name, files) {
  const bookDir = path.join(tmpRoot, name);
  for (const [rel, body] of Object.entries(files)) {
    const abs = path.join(bookDir, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, body, 'utf-8');
  }
  return bookDir;
}

describe('basenameFromSrc — the ONE key derivation both halves share', () => {
  it('strips the directory and the extension', () => {
    expect(basenameFromSrc('../../media/CNX_Chem_04_01_rxn2.jpg')).toBe('CNX_Chem_04_01_rxn2');
  });

  it('returns null for a missing or non-string src rather than inventing a key', () => {
    expect(basenameFromSrc(undefined)).toBeNull();
    expect(basenameFromSrc('')).toBeNull();
    expect(basenameFromSrc(42)).toBeNull();
  });

  it('does NOT strip a -[0-9a-f]{4} hash suffix — identity is the UNSTRIPPED basename', () => {
    // Spec invariant 6: a figure's identity is the unstripped CNXML basename
    // everywhere (sidecar filename, --out dir, mapping entry). The de-hash is
    // the driver's lookup-only artwork fallback and must never rename anything.
    expect(basenameFromSrc('../../media/CNX_Chem_03_02_moles-6296.jpg')).toBe(
      'CNX_Chem_03_02_moles-6296'
    );
  });
});

describe('listCnxmlImages — quote-aware and comment-aware', () => {
  const RAW_GT_CNXML = [
    '<document>',
    // 🔴 The raw `>` sits BEFORE src on purpose. A naive `<image[^>]*>` stops at
    // it, so its capture never reaches src and the image is LOST — the §C115
    // failure. After src, the naive form would still find src and the fixture
    // would prove nothing.
    '  <media id="a"><image alt="yield > 90%" mime-type="image/jpeg" ' +
      'src="../../media/RawGt.jpg"/></media>',
    '  <media id="b"><image mime-type="image/jpeg" src="../../media/Ordinary.jpg"/></media>',
    '</document>',
  ].join('\n');

  it('reads src past a raw > inside an earlier attribute value, and the ordinary tag too', () => {
    const file = path.join(tmpRoot, 'rawgt.cnxml');
    fs.writeFileSync(file, RAW_GT_CNXML, 'utf-8');
    const { images, warnings } = listCnxmlImages(file);
    expect(images.map((i) => i.basename)).toEqual(['RawGt', 'Ordinary']);
    expect(warnings).toEqual([]);
  });

  it('and the naive [^>]* form really does lose that image — the fixture discriminates', () => {
    // Non-vacuity control for the test above. If this ever stops failing, the
    // fixture has stopped exercising the hazard and the test above is free.
    const naive = [...RAW_GT_CNXML.matchAll(/<image([^>]*)>/g)].map((m) =>
      /src="([^"]*)"/.exec(m[1])
    );
    expect(naive).toHaveLength(2);
    expect(naive[0]).toBeNull(); // src truncated away by the raw >
    expect(naive[1]).not.toBeNull(); // the ordinary tag survives either way
  });

  it('does NOT enumerate an <image> that is commented out, but DOES enumerate its neighbour', () => {
    // Measured on the real corpus: 2 of organic's 2,165 <image> tags sit inside
    // XML comments (ch16/m00198, ch28/m00309) and chemistry has 0. A phantom
    // like that would be bought from the paid MT and could never be published.
    const file = path.join(tmpRoot, 'commented.cnxml');
    fs.writeFileSync(
      file,
      [
        '<document>',
        '  <!--<image mime-type="image/jpeg" src="../../media/Retired.jpg"/>-->',
        '  <media id="b"><image mime-type="image/jpeg" src="../../media/Live.jpg"/></media>',
        '</document>',
      ].join('\n'),
      'utf-8'
    );
    const { images } = listCnxmlImages(file);
    expect(images.map((i) => i.basename)).toEqual(['Live']);
  });

  it('REPORTS an <image> whose src cannot be read instead of dropping it silently', () => {
    const file = path.join(tmpRoot, 'nosrc.cnxml');
    fs.writeFileSync(
      file,
      '<document><media id="a"><image mime-type="image/jpeg"/></media></document>',
      'utf-8'
    );
    const { images, warnings } = listCnxmlImages(file);
    expect(images).toEqual([]);
    expect(warnings).toHaveLength(1);
    expect(warnings[0].reason).toBe('unreadable-src');
  });

  it('deduplicates within a file, keeping document order', () => {
    const file = path.join(tmpRoot, 'dupes.cnxml');
    fs.writeFileSync(
      file,
      [
        '<document>',
        '  <image src="../../media/B.jpg"/>',
        '  <image src="../../media/A.jpg"/>',
        '  <image src="../../media/B.jpg"/>',
        '</document>',
      ].join('\n'),
      'utf-8'
    );
    expect(listCnxmlImages(file).images.map((i) => i.basename)).toEqual(['B', 'A']);
  });
});

describe('listStructureFigures — the review panel’s predicate, verbatim', () => {
  it('takes only type:figure nodes, nested arbitrarily deep, with caption and alt ids', () => {
    const file = path.join(tmpRoot, 'structure-ok.json');
    fs.writeFileSync(
      file,
      JSON.stringify({
        content: [
          {
            type: 'section',
            children: [
              {
                type: 'figure',
                media: { src: '../../media/Deep.jpg', alt: { segmentId: 'alt-1' } },
                caption: { segmentId: 'cap-1' },
              },
            ],
          },
          { type: 'para', media: { src: '../../media/NotAFigure.jpg' } },
        ],
      }),
      'utf-8'
    );
    expect(listStructureFigures(file)).toEqual([
      { basename: 'Deep', captionSegmentId: 'cap-1', altSegmentId: 'alt-1' },
    ]);
  });

  it('returns [] for an absent or malformed structure file — never throws', () => {
    expect(listStructureFigures(path.join(tmpRoot, 'does-not-exist.json'))).toEqual([]);
    const bad = path.join(tmpRoot, 'structure-bad.json');
    fs.writeFileSync(bad, '{ not json', 'utf-8');
    expect(listStructureFigures(bad)).toEqual([]);
  });
});

describe('enumerateChapterImages over efnafraedi-2e ch04 — BOTH sets, and the named gap', () => {
  let r;
  beforeAll(() => {
    r = enumerateChapterImages({ bookDir: CHEM_DIR, chapterDir: 'ch04' });
  });

  it('enumerates every image in the chapter, and finds some', () => {
    expect(r.figures.length).toBeGreaterThan(0);
    expect(r.moduleIds.length).toBeGreaterThan(0);
  });

  it('finds a non-empty reviewable set', () => {
    expect(r.reviewable.length).toBeGreaterThan(0);
  });

  it('reviewable is a PROPER subset of enumeration — both directions asserted', () => {
    const enumerated = new Set(r.figures.map((f) => f.basename));
    // direction 1: nothing reviewable is outside the enumeration
    expect(r.reviewable.filter((b) => !enumerated.has(b))).toEqual([]);
    // direction 2: the enumeration is strictly larger — if this is 0 the whole
    // R7 distinction has collapsed and the test above proves nothing
    expect(r.reviewable.length).toBeLessThan(enumerated.size);
  });

  it('NAMES the gap rather than only counting it', () => {
    expect(r.unreviewable.length).toBeGreaterThan(0);
    expect(r.unreviewable.every((b) => typeof b === 'string' && b.length > 0)).toBe(true);
    const reviewable = new Set(r.reviewable);
    expect(r.unreviewable.filter((b) => reviewable.has(b))).toEqual([]);
  });

  it('the two sets partition the enumeration exactly — nothing lost, nothing double-counted', () => {
    expect(r.reviewable.length + r.unreviewable.length).toBe(r.figures.length);
    expect([...r.reviewable, ...r.unreviewable].sort()).toEqual(
      r.figures.map((f) => f.basename).sort()
    );
  });

  it('basenames are unique and contain no path separator', () => {
    const names = r.figures.map((f) => f.basename);
    expect(new Set(names).size).toBe(names.length);
    expect(names.filter((b) => b.includes('/'))).toEqual([]);
  });

  it('reads every src on the real corpus — no warnings', () => {
    // The fixture suite above proves warnings CAN fire, so this null is a
    // measurement rather than an incapable instrument.
    expect(r.warnings).toEqual([]);
  });

  it('the reviewable count matches an INDEPENDENT instrument: <figure> open tags in the CNXML', () => {
    // Derived from the raw source rather than from 02-structure, so a lossy
    // structure extractor would show up here as a disagreement.
    // ⚠️ It rests on two MEASURED properties of this chapter, not on a law:
    // one <image> per <figure>, and no basename reused across modules (both
    // hold on ch04 and appendices today). If this ever goes red, read it as
    // "the corpus changed shape", not "the module broke", and check those two
    // first — the partition and multiset tests are the ones that pin the code.
    let figureTags = 0;
    for (const id of r.moduleIds) {
      const txt = fs.readFileSync(path.join(r.sourceDir, `${id}.cnxml`), 'utf-8');
      figureTags += (txt.match(/<figure[\s>]/g) || []).length;
    }
    expect(r.reviewable.length).toBe(figureTags);
  });

  it('reports no structure-only figure — 02-structure never names an image the CNXML lacks', () => {
    expect(r.structureOnly).toEqual([]);
  });

  it('carries the module id and src alongside each basename', () => {
    for (const f of r.figures) {
      expect(f.moduleId).toMatch(/^m\d+$/);
      expect(f.src).toContain(f.basename);
    }
  });
});

describe('chapter directories: appendices is a first-class chapter', () => {
  it('accepts the appendices directory and computes both sets there too', () => {
    const app = enumerateChapterImages({ bookDir: CHEM_DIR, chapterDir: 'appendices' });
    expect(app.figures.length).toBeGreaterThan(0);
    expect(app.reviewable.length).toBeGreaterThan(0);
    expect(app.unreviewable.length).toBeGreaterThan(0);
    expect(app.moduleIds.length).toBeGreaterThan(0);
    // and it is genuinely a different chapter, not ch04 returned twice
    const ch04 = enumerateChapterImages({ bookDir: CHEM_DIR, chapterDir: 'ch04' });
    const overlap = app.figures
      .map((f) => f.basename)
      .filter((b) => ch04.figures.some((g) => g.basename === b));
    expect(overlap).toEqual([]);
  });

  it('a numeric chapter directory still works', () => {
    const ch01 = enumerateChapterImages({ bookDir: CHEM_DIR, chapterDir: 'ch01' });
    expect(ch01.figures.length).toBeGreaterThan(0);
    expect(ch01.chapterDir).toBe('ch01');
  });

  it('THROWS on a missing source directory — chapterDir(NaN) must be a loud ENOENT', () => {
    expect(() => enumerateChapterImages({ bookDir: CHEM_DIR, chapterDir: 'chNaN' })).toThrow(
      /chNaN/
    );
  });

  it('a missing 02-structure directory makes every image unreviewable, and SAYS SO', () => {
    const bookDir = fixtureBook('nostructure', {
      '01-source/ch01/m1.cnxml': '<document><image src="../../media/Solo.jpg"/></document>',
    });
    const r = enumerateChapterImages({ bookDir, chapterDir: 'ch01' });
    expect(r.structureDirExists).toBe(false);
    expect(r.figures.map((f) => f.basename)).toEqual(['Solo']);
    expect(r.reviewable).toEqual([]);
    expect(r.unreviewable).toEqual(['Solo']);
  });

  it('an image that IS in 02-structure comes back reviewable — the positive control', () => {
    const bookDir = fixtureBook('withstructure', {
      '01-source/ch01/m1.cnxml':
        '<document><image src="../../media/Shown.jpg"/><image src="../../media/Hidden.jpg"/></document>',
      '02-structure/ch01/m1-structure.json': JSON.stringify({
        content: [{ type: 'figure', media: { src: '../../media/Shown.jpg' } }],
      }),
    });
    const r = enumerateChapterImages({ bookDir, chapterDir: 'ch01' });
    expect(r.structureDirExists).toBe(true);
    expect(r.reviewable).toEqual(['Shown']);
    expect(r.unreviewable).toEqual(['Hidden']);
  });

  it('names a structure figure the CNXML does not have, instead of hiding it', () => {
    const bookDir = fixtureBook('structureonly', {
      '01-source/ch01/m1.cnxml': '<document><image src="../../media/Real.jpg"/></document>',
      '02-structure/ch01/m1-structure.json': JSON.stringify({
        content: [{ type: 'figure', media: { src: '../../media/Ghost.jpg' } }],
      }),
    });
    const r = enumerateChapterImages({ bookDir, chapterDir: 'ch01' });
    expect(r.structureOnly).toEqual(['Ghost']);
    expect(r.figures.map((f) => f.basename)).toEqual(['Real']);
  });
});

describe('the moduleIds filter — --module must REFUSE, not quietly do nothing', () => {
  it('narrows the enumeration to the named module', () => {
    const all = enumerateChapterImages({ bookDir: CHEM_DIR, chapterDir: 'ch04' });
    const one = enumerateChapterImages({
      bookDir: CHEM_DIR,
      chapterDir: 'ch04',
      moduleIds: ['m68730'],
    });
    expect(one.moduleIds).toEqual(['m68730']);
    expect(one.figures.length).toBeGreaterThan(0);
    expect(one.figures.length).toBeLessThan(all.figures.length);
    expect(one.figures.every((f) => f.moduleId === 'm68730')).toBe(true);
  });

  it('THROWS on a module id with no .cnxml, rather than returning an empty run', () => {
    expect(() =>
      enumerateChapterImages({ bookDir: CHEM_DIR, chapterDir: 'ch04', moduleIds: ['m00000'] })
    ).toThrow(/m00000/);
  });
});

describe('the server and the driver get the SAME answer', () => {
  // ⚠️ What this pins after the cut-over is that the two ways of REACHING the
  // predicate agree: {bookDir, chapterDir} here, and segmentParser's
  // getModulePaths inside figureReviewService. The predicate itself is shared
  // by construction. The service-side module ids are derived independently —
  // by reading 02-structure — so this is not half-circular.
  const figureReview = require(
    path.join(REPO_ROOT, 'server', 'services', 'figureReviewService.js')
  );

  const cases = [
    { chapterDir: 'ch04', chapter: 4 },
    { chapterDir: 'appendices', chapter: -1 },
  ];

  for (const { chapterDir, chapter } of cases) {
    it(`agrees on ${chapterDir}`, () => {
      const structureDir = path.join(CHEM_DIR, '02-structure', chapterDir);
      const moduleIds = fs
        .readdirSync(structureDir)
        .filter((f) => f.endsWith('-structure.json'))
        .map((f) => f.slice(0, -'-structure.json'.length))
        .sort();
      expect(moduleIds.length).toBeGreaterThan(0);

      const fromService = moduleIds
        .flatMap((id) => figureReview.listModuleFigures('efnafraedi-2e', chapter, id))
        .map((f) => f.basename)
        .sort();
      expect(fromService.length).toBeGreaterThan(0);

      const fromModule = enumerateChapterImages({ bookDir: CHEM_DIR, chapterDir });

      // The assertion that actually pins path resolution: the module walked
      // 01-source and this test walked 02-structure, so agreeing on the module
      // id list is a real cross-check. Without it a module silently dropped by
      // the readdir filter would pass unnoticed whenever it held no figure.
      expect(fromModule.moduleIds.slice().sort()).toEqual(moduleIds);

      // multiset equality: sorted arrays, duplicates included
      expect(fromModule.reviewable.slice().sort()).toEqual(fromService);
    });
  }
});

/**
 * 🔴 THE CHARSET THAT DECIDES WHETHER A FIGURE CAN BE PROCESSED AT ALL LIVES IN
 * A DIFFERENT LANGUAGE FROM THE ENUMERATOR, AND NOTHING COMPARED THE TWO.
 * `figure-prepare.py`'s `SAFE_BASENAME` is right to exist — `--basename` becomes
 * a path segment and arrives from a CLI flag — but it was hand-picked, and it
 * refused `CNX_Chem_11_02_Fe(NO3)3_img` (efnafraedi-2e ch11, m68781): argparse
 * exits 2 before `main`, so no `prepare.json` is written, the driver files the
 * figure `failed-prepare`, and chemistry ch11 could never reach `VERDICT ok`.
 *
 * The enumerator is the population the charset has to cover, so the pin belongs
 * here — next to the only instrument that can list it. It reads the pattern out
 * of the tool rather than restating it: a copy of a charset is exactly the
 * enumeration this repo keeps finding stale.
 */
describe("figure-prepare.py's basename guards, against the corpus they must admit", () => {
  const PREPARE_PY = path.join(
    REPO_ROOT,
    'experiments',
    'figure-text-translation',
    'figure-prepare.py'
  );
  const KEPT_BOOKS = ['efnafraedi-2e', 'lifraen-efnafraedi'];
  // The figure the hand-picked class refused. Its `01-source` is READ-ONLY by
  // project rule, so this is a stable anchor, and it is what makes the
  // "0 refusals" result below mean something other than "nothing interesting
  // was enumerated".
  const PAREN_BASENAME = 'CNX_Chem_11_02_Fe(NO3)3_img';

  /** The charset AS THE TOOL SPELLS IT. A failed extraction must fail the test. */
  function safeBasenamePattern() {
    const src = fs.readFileSync(PREPARE_PY, 'utf-8');
    const m = src.match(/^SAFE_BASENAME = re\.compile\(r'(.+)'\)$/m);
    expect(m, `no SAFE_BASENAME literal found in ${PREPARE_PY}`).not.toBeNull();
    return new RegExp(m[1]);
  }

  /** The reserved names the tool refuses outright, likewise read from it. */
  function reservedBasenames() {
    const src = fs.readFileSync(PREPARE_PY, 'utf-8');
    const m = src.match(/^RESERVED_BASENAMES = \{([^}]*)\}$/m);
    expect(m, `no RESERVED_BASENAMES literal found in ${PREPARE_PY}`).not.toBeNull();
    const names = [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]);
    expect(names.length).toBeGreaterThan(0);
    return new Set(names);
  }

  /** Every enumerated figure of both kept books: chNN and appendices. */
  function everyKeptFigure() {
    const out = [];
    for (const slug of KEPT_BOOKS) {
      const bookDir = path.join(REPO_ROOT, 'books', slug);
      const sourceRoot = path.join(bookDir, '01-source');
      const chapterDirs = fs
        .readdirSync(sourceRoot, { withFileTypes: true })
        .filter((d) => d.isDirectory() && (/^ch\d+$/.test(d.name) || d.name === 'appendices'))
        .map((d) => d.name)
        .sort();
      expect(chapterDirs.length).toBeGreaterThan(0);
      for (const chapterDir of chapterDirs) {
        for (const f of enumerateChapterImages({ bookDir, chapterDir }).figures) {
          out.push({ slug, chapterDir, basename: f.basename });
        }
      }
    }
    return out;
  }

  it('CONTROL the pattern read out of the tool is a real charset, not .*', () => {
    const re = safeBasenamePattern();
    expect(re.test('CNX_Chem_04_01_rxn2')).toBe(true);
    // the property the class exists for — none of these may be admitted
    expect(re.test('a/../b')).toBe(false);
    expect(re.test('..')).toBe(false);
    expect(re.test('/etc/passwd')).toBe(false);
    expect(re.test('-x')).toBe(false);
    expect(re.test('.hidden')).toBe(false);
    expect(re.test('')).toBe(false);
  });

  it('admits every basename either kept book enumerates', () => {
    const figures = everyKeptFigure();
    // NON-VACUITY, two ways: the corpus is large, and it contains the exact
    // figure whose refusal this pin exists to prevent recurring.
    expect(figures.length).toBeGreaterThan(3000);
    expect(figures.map((f) => f.basename)).toContain(PAREN_BASENAME);

    const re = safeBasenamePattern();
    const refused = figures
      .filter((f) => !re.test(f.basename))
      .map((f) => `${f.slug}/${f.chapterDir}: ${f.basename}`);
    expect(refused).toEqual([]);
  });

  it('and no enumerated basename collides with a RESERVED name', () => {
    const reserved = reservedBasenames();
    const figures = everyKeptFigure();
    expect(figures.length).toBeGreaterThan(3000);
    // CONTROL: a PLANTED row for every reserved name, so the [] below is a
    // measurement of the corpus rather than a predicate that never fires.
    const planted = [...reserved].map((n) => ({ slug: 'planted', chapterDir: '-', basename: n }));
    expect(planted.filter((f) => reserved.has(f.basename))).toHaveLength(reserved.size);
    const collisions = figures
      .filter((f) => reserved.has(f.basename))
      .map((f) => `${f.slug}/${f.chapterDir}: ${f.basename}`);
    expect(collisions).toEqual([]);
  });
});
