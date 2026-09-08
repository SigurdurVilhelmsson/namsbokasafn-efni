/**
 * tools/lib/figure-enumerate.cjs — the ONE figure/image enumeration predicate.
 *
 * 🔴 THE MODULE COMPUTES TWO SETS, NOT ONE ([USER] ruling R7,
 * docs/superpowers/specs/2026-09-06-m5-figure-driver-design.md:39 and :197):
 *   - ENUMERATION  = every `<image src>` in the chapter's CNXML. The driver
 *     translates all of them, because readers are the point.
 *   - REVIEWABILITY = the subset with a src-keyed node in 02-structure, i.e.
 *     the ones the review panel can actually show an editor.
 * The job is to compute BOTH and NAME the gap, never to make them agree.
 *
 * 🔴 §C139 TIER 1 WIDENED THE SECOND SET FROM "THE `<figure>` SUBSET" TO THREE
 * CONSTRUCTS — `figure`, the top-level `inlineMedia` array, and a loose
 * `type:'media'` node — recorded per record as `via`. The gap therefore now
 * means "absent from 02-structure entirely", a claim about re-extraction. On
 * chemistry: 1,148 images = 627 + 227 + 97 reviewable, 197 absent.
 *
 * ⚠️ `reviewable` here is STRUCTURAL — "does this image have a node in
 * 02-structure to key on" — and deliberately NOT the runtime sense the review
 * panel uses at request time ("does books/<slug>/figure-text/<basename>.is.json
 * exist"). The runtime sense is 0-for-everything before the driver has spent a
 * krona, so a --dry-run built on it would report zero reviewable figures for
 * ever.
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
      { basename: 'Deep', captionSegmentId: 'cap-1', altSegmentId: 'alt-1', via: 'figure' },
    ]);
  });

  it('returns [] for an absent or malformed structure file — never throws', () => {
    expect(listStructureFigures(path.join(tmpRoot, 'does-not-exist.json'))).toEqual([]);
    const bad = path.join(tmpRoot, 'structure-bad.json');
    fs.writeFileSync(bad, '{ not json', 'utf-8');
    expect(listStructureFigures(bad)).toEqual([]);
  });
});

/**
 * §C139 TIER 1 — the review panel's surface widened to `inlineMedia`.
 *
 * 🔴 THE GAP IS NOT ONE POPULATION, AND TREATING IT AS ONE IS WHY IT LOOKED
 * UNREACHABLE. Measured over all 23 chemistry chapters with the enumerator
 * itself: 1,148 images, 627 in a `<figure>`, 521 not. Of those 521, **227 are
 * already in `02-structure` — in the top-level `inlineMedia` array** — and only
 * the remaining 294 need the extractor change plus a re-extraction. Reading an
 * array that was already being written is the whole of tier 1.
 *
 * ⚠️ An `inlineMedia` image has NO caption: it is an `<image>` loose in a para,
 * an example or an exercise solution, not a `<figure>`. `captionSegmentId` is
 * therefore null by construction, and that degrades correctly rather than by
 * luck — `buildFigurePayload` hands the joined reference text to
 * `captionDivergence`, whose docstring calls the empty-reference `[]` "designed
 * silence, NOT a false all-clear".
 *
 * 🔴 `via` EXISTS SO THE R7 DISTINCTION SURVIVES AS DATA RATHER THAN BEING
 * ERASED. The reviewable set is no longer "the `<figure>` subset", so the
 * independent `<figure>`-open-tag instrument below would have had nothing left
 * to check. Keeping the provenance on each record lets that cross-check go on
 * pinning the extractor's figure fidelity, and lets the driver say WHY a figure
 * is unreviewable — which is now "no node in 02-structure at all", a statement
 * about re-extraction, not about `<figure>`.
 */
describe('listStructureFigures — §C139 tier 1: inlineMedia is reviewable too', () => {
  /** A structure file with one <figure> and whatever inlineMedia is passed. */
  function structureWith(name, inlineMedia) {
    const file = path.join(tmpRoot, `${name}.json`);
    fs.writeFileSync(
      file,
      JSON.stringify({
        content: [
          {
            type: 'figure',
            media: { src: '../../media/Framed.jpg', alt: { segmentId: 'fig-alt' } },
            caption: { segmentId: 'fig-cap' },
          },
        ],
        inlineMedia,
      }),
      'utf-8'
    );
    return file;
  }

  it('returns an inlineMedia image alongside the figure, captionless and alt-keyed', () => {
    const file = structureWith('inline-basic', [
      {
        placeholder: '[[MEDIA:1]]',
        id: 'fs-idm94851696',
        src: '../../media/Loose.jpg',
        alt: { segmentId: 'm1:alt:fs-idm94851696-alt', text: 'A loose image.' },
      },
    ]);
    expect(listStructureFigures(file)).toEqual([
      { basename: 'Framed', captionSegmentId: 'fig-cap', altSegmentId: 'fig-alt', via: 'figure' },
      {
        basename: 'Loose',
        captionSegmentId: null,
        altSegmentId: 'm1:alt:fs-idm94851696-alt',
        via: 'inlineMedia',
      },
    ]);
  });

  it('lets the FIGURE win when one module carries the same image both ways', () => {
    // Measured on the corpus: efnafraedi-2e ch10/m68764 does exactly this with
    // CNX_Chem_10_02_Needlefloa_img. The figure record is the richer one — it
    // is the only one carrying a caption — so a duplicate must not displace it.
    const file = structureWith('inline-dup', [
      { src: '../../media/Framed.jpg', alt: { segmentId: 'inline-alt' } },
    ]);
    expect(listStructureFigures(file)).toEqual([
      { basename: 'Framed', captionSegmentId: 'fig-cap', altSegmentId: 'fig-alt', via: 'figure' },
    ]);
  });

  it('skips an inlineMedia entry with no usable src rather than keying on null', () => {
    // `embedSrc` is a real sibling field on these records, so an entry whose
    // `src` is the empty string is a shape the corpus can actually produce.
    const file = structureWith('inline-nosrc', [
      { src: '' },
      { src: null },
      {},
      { src: '../../media/Kept.jpg' },
    ]);
    const out = listStructureFigures(file);
    expect(out.map((f) => f.basename)).toEqual(['Framed', 'Kept']);
  });

  it('reports altSegmentId null when the entry has no alt, instead of throwing', () => {
    // drainInlineMediaAlts leaves `alt` undefined when there is no alt text,
    // and JSON.stringify drops an undefined value — so the KEY IS ABSENT, not
    // null. Reading it as `m.alt.segmentId` would throw on a real module.
    const file = structureWith('inline-noalt', [{ src: '../../media/Bare.jpg' }]);
    const bare = listStructureFigures(file).find((f) => f.basename === 'Bare');
    expect(bare).toEqual({
      basename: 'Bare',
      captionSegmentId: null,
      altSegmentId: null,
      via: 'inlineMedia',
    });
  });

  /**
   * 🔴 THE REGISTER'S "227 of 521" WAS AN UNDERCOUNT, AND THE MISSING
   * POPULATION IS IN THE TREE THE FIGURE WALK ALREADY TRAVERSES.
   *
   * §C139 named `inlineMedia` as the cheap tier. Re-deriving it — as that
   * section itself instructs — turned up a THIRD construct: a `type:'media'`
   * node sitting directly in `content`, an `<image>` loose in a para or an
   * exercise that the extractor never routed through `inlineMedia`. It has the
   * same shape as an inlineMedia record (a `src` and an `alt.segmentId`) and
   * `visit` walks straight past it, because the walk tests only for
   * `type === 'figure'`.
   *
   * Measured on chemistry: 97 more images, DISJOINT from the inlineMedia 228
   * (0 basenames in both). So the no-re-extraction tier reaches 324 of the 521,
   * not 227, and the population that genuinely needs the extractor changed and
   * a re-extraction is 197.
   */
  it('returns a type:media node loose in the content tree, the same way', () => {
    const file = path.join(tmpRoot, 'content-media.json');
    fs.writeFileSync(
      file,
      JSON.stringify({
        content: [
          {
            type: 'section',
            content: [
              { type: 'para', content: 'text' },
              {
                type: 'media',
                id: 'fs-idm244068192',
                src: '../../media/LooseInPara.jpg',
                alt: { segmentId: 'm1:alt:fs-idm244068192-alt', text: 'A loose image.' },
              },
            ],
          },
        ],
      }),
      'utf-8'
    );
    expect(listStructureFigures(file)).toEqual([
      {
        basename: 'LooseInPara',
        captionSegmentId: null,
        altSegmentId: 'm1:alt:fs-idm244068192-alt',
        via: 'media',
      },
    ]);
  });

  it('does NOT double-count a figure’s own media node', () => {
    // A figure's `media` is a bare object with no `type`, so the new branch
    // cannot fire on it — but a structure that DID carry one must still yield a
    // single record, and it must be the figure's.
    const file = path.join(tmpRoot, 'figure-inner-media.json');
    fs.writeFileSync(
      file,
      JSON.stringify({
        content: [
          {
            type: 'figure',
            caption: { segmentId: 'fig-cap' },
            media: {
              type: 'media',
              src: '../../media/Framed.jpg',
              alt: { segmentId: 'fig-alt' },
            },
          },
        ],
      }),
      'utf-8'
    );
    expect(listStructureFigures(file)).toEqual([
      { basename: 'Framed', captionSegmentId: 'fig-cap', altSegmentId: 'fig-alt', via: 'figure' },
    ]);
  });

  it('skips a type:media node with no src — the key is the SRC, never the id', () => {
    // 🔴 MEASURED, AND DELIBERATELY NOT WORKED AROUND. Two chemistry modules
    // (ch06/m68734 CNX_Chem_06_04_PhosphOrb_img, ch16/m68817
    // CNX_Chem_16_03_Matter_img) extract a type:'media' node carrying an `id`
    // that IS the basename and an `alt`, but NO `src` — although the CNXML
    // `<media>` plainly contains `<image src=…/>`. That is an extractor defect
    // logged separately; keying on `id` here would "fix" it by inventing a
    // SECOND key derivation, which is exactly what this module's basenameFromSrc
    // docstring exists to forbid. Both images are still enumerated and still
    // translated; they simply stay unreviewable until the extractor is fixed.
    const file = path.join(tmpRoot, 'media-no-src.json');
    fs.writeFileSync(
      file,
      JSON.stringify({
        content: [
          { type: 'media', id: 'CNX_Chem_06_04_PhosphOrb_img', alt: { segmentId: 'a' } },
          { type: 'media', src: '../../media/Kept.jpg', alt: { segmentId: 'b' } },
        ],
      }),
      'utf-8'
    );
    expect(listStructureFigures(file).map((f) => f.basename)).toEqual(['Kept']);
  });

  it('ignores an inlineMedia that is not an array, and still returns the figures', () => {
    for (const bad of [undefined, null, 'nope', 42, { src: 'x.jpg' }]) {
      const file = structureWith('inline-bad', bad);
      expect(listStructureFigures(file)).toEqual([
        { basename: 'Framed', captionSegmentId: 'fig-cap', altSegmentId: 'fig-alt', via: 'figure' },
      ]);
    }
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

  it('the FIGURE-sourced count matches an INDEPENDENT instrument: <figure> open tags in the CNXML', () => {
    // Derived from the raw source rather than from 02-structure, so a lossy
    // structure extractor would show up here as a disagreement.
    // ⚠️ It rests on two MEASURED properties of this chapter, not on a law:
    // one <image> per <figure>, and no basename reused across modules (both
    // hold on ch04 and appendices today). If this ever goes red, read it as
    // "the corpus changed shape", not "the module broke", and check those two
    // first — the partition and multiset tests are the ones that pin the code.
    //
    // 🔴 SCOPED TO `via === 'figure'` SINCE §C139 TIER 1. `reviewable` is no
    // longer the <figure> subset — it is <figure> PLUS inlineMedia — so the
    // whole set can no longer be compared with a <figure> tag count. Erasing
    // the provenance would have retired this check outright; carrying `via`
    // keeps the extractor's figure fidelity pinned against raw source.
    let figureTags = 0;
    for (const id of r.moduleIds) {
      const txt = fs.readFileSync(path.join(r.sourceDir, `${id}.cnxml`), 'utf-8');
      figureTags += (txt.match(/<figure[\s>]/g) || []).length;
    }
    const viaFigure = r.figures.filter((f) => f.reviewableVia === 'figure');
    expect(viaFigure.length).toBe(figureTags);
    // Non-vacuity in the other direction: ch04 really does have inlineMedia, so
    // a `via` that had silently collapsed to 'figure' everywhere would pass the
    // line above and be caught here.
    expect(r.figures.filter((f) => f.reviewableVia === 'inlineMedia').length).toBeGreaterThan(0);
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

describe('§C139 tier 1 — a chapter-wide basename claimed BOTH ways across two modules', () => {
  /**
   * 🔴 THE ORDERING HAZARD `seen` CANNOT REACH. Intra-module precedence is free:
   * listStructureFigures walks `content` before `inlineMedia`, so the figure is
   * already in its `seen` set. ACROSS modules there is no such walk —
   * `structureByBasename` is first-wins in module order, so a module whose name
   * sorts EARLIER and holds the image only as inlineMedia would shadow the
   * figure record and drop the caption.
   *
   * Measured on the corpus: efnafraedi-2e ch06 has exactly this shape
   * (CNX_Chem_06_01_2spectra is a <figure> in m68729 and inlineMedia in
   * m68732) and today it is correct BY LUCK — m68729 sorts first. This fixture
   * inverts the sort order so the tie-break is what has to hold.
   */
  function twoModuleBook(name) {
    const cnxml = (src) =>
      `<document><content><para><media><image src="${src}" mime-type="image/jpg"/></media></para></content></document>`;
    return fixtureBook(name, {
      // 'm100' sorts BEFORE 'm200', so the inlineMedia module is seen first.
      '01-source/ch01/m100.cnxml': cnxml('../../media/Shared.jpg'),
      '01-source/ch01/m200.cnxml': cnxml('../../media/Shared.jpg'),
      '02-structure/ch01/m100-structure.json': JSON.stringify({
        content: [],
        inlineMedia: [{ src: '../../media/Shared.jpg', alt: { segmentId: 'inline-alt' } }],
      }),
      '02-structure/ch01/m200-structure.json': JSON.stringify({
        content: [
          {
            type: 'figure',
            media: { src: '../../media/Shared.jpg', alt: { segmentId: 'fig-alt' } },
            caption: { segmentId: 'fig-cap' },
          },
        ],
      }),
    });
  }

  it('keeps the caption-bearing figure record even when the inline module sorts first', () => {
    const bookDir = twoModuleBook('crossmod');
    const r = enumerateChapterImages({ bookDir, chapterDir: 'ch01' });
    const rec = r.figures.find((f) => f.basename === 'Shared');
    expect(rec.reviewable).toBe(true);
    expect(rec.reviewableVia).toBe('figure');
    expect(rec.captionSegmentId).toBe('fig-cap');
    expect(rec.altSegmentId).toBe('fig-alt');
  });

  it('CONTROL — with no figure anywhere, the same image resolves via inlineMedia', () => {
    // Without this the test above passes for a module that simply preferred
    // 'm200' for some unrelated reason, and proves nothing about the tie-break.
    const bookDir = fixtureBook('crossmod-inline-only', {
      '01-source/ch01/m100.cnxml':
        '<document><content><para><media><image src="../../media/Shared.jpg"/></media></para></content></document>',
      '02-structure/ch01/m100-structure.json': JSON.stringify({
        content: [],
        inlineMedia: [{ src: '../../media/Shared.jpg', alt: { segmentId: 'inline-alt' } }],
      }),
    });
    const rec = enumerateChapterImages({ bookDir, chapterDir: 'ch01' }).figures.find(
      (f) => f.basename === 'Shared'
    );
    expect(rec.reviewable).toBe(true);
    expect(rec.reviewableVia).toBe('inlineMedia');
    expect(rec.captionSegmentId).toBeNull();
    expect(rec.altSegmentId).toBe('inline-alt');
  });
});

describe('§C139 tier 1 over the whole chemistry corpus — what "unreviewable" now MEANS', () => {
  const chapters = fs
    .readdirSync(path.join(CHEM_DIR, '01-source'))
    .filter((d) => /^(ch\d+|appendices)$/.test(d))
    .sort();

  const all = () =>
    chapters.map((c) => enumerateChapterImages({ bookDir: CHEM_DIR, chapterDir: c }));

  /**
   * 🔴 THE PROPERTY, NOT THE COUNT. Before tier 1, "unreviewable" meant two
   * different things wearing one label: "in 02-structure but not as a <figure>"
   * and "not in 02-structure at all". Only the second needs the extractor
   * change and a re-extraction. After tier 1 the label means exactly the
   * second, and THAT is the checkable claim — a raw text search of the
   * chapter's structure files must not find an unreviewable basename anywhere.
   */
  /**
   * 🔴 THE EXACT EXCEPTIONS, NOT A TOLERANCE. Two chemistry modules extract a
   * `type:'media'` node whose `src` was LOST — the node carries an `id` equal
   * to the basename and a full `alt`, while the CNXML `<media>` plainly holds
   * `<image src=…/>`. That is an extractor defect, logged separately and
   * deliberately not worked around here: keying on `id` would invent a second
   * key derivation, which basenameFromSrc's docstring forbids.
   *
   * Naming them exactly, rather than allowing "a couple", is what makes a
   * THIRD instance fail this test instead of being absorbed by a threshold.
   */
  const SRC_LOST_BY_EXTRACTOR = [
    'ch06/CNX_Chem_06_04_PhosphOrb_img',
    'ch16/CNX_Chem_16_03_Matter_img',
  ];

  it('no unreviewable image appears ANYWHERE in its chapter’s 02-structure files', () => {
    const offenders = [];
    let checked = 0;
    for (const r of all()) {
      const blobs = fs.existsSync(r.structureDir)
        ? fs
            .readdirSync(r.structureDir)
            .filter((f) => f.endsWith('-structure.json'))
            .map((f) => fs.readFileSync(path.join(r.structureDir, f), 'utf-8'))
        : [];
      for (const b of r.unreviewable) {
        checked++;
        if (blobs.some((t) => t.includes(b))) offenders.push(`${r.chapterDir}/${b}`);
      }
    }
    expect(checked).toBeGreaterThan(0); // non-vacuity: there IS still a gap to check
    expect(offenders.sort()).toEqual([...SRC_LOST_BY_EXTRACTOR].sort());
  });

  it('CONTROL — the same search DOES find a reviewable basename', () => {
    // Without this the null above is an incapable instrument, not a result.
    const r = enumerateChapterImages({ bookDir: CHEM_DIR, chapterDir: 'ch04' });
    const blobs = fs
      .readdirSync(r.structureDir)
      .filter((f) => f.endsWith('-structure.json'))
      .map((f) => fs.readFileSync(path.join(r.structureDir, f), 'utf-8'));
    expect(blobs.some((t) => t.includes(r.reviewable[0]))).toBe(true);
  });

  it('reaches BOTH new populations, and they are disjoint — the tier’s whole point', () => {
    // ⚠️ ANCHORS, not laws. Measured 2026-09-08 against this committed corpus:
    // 1,148 images = 627 <figure> + 227 inlineMedia + 97 content media + 197
    // absent. `01-source` is READ-ONLY by project rule, but `02-structure` is
    // GENERATED — a re-extraction legitimately moves every one of these. If
    // this goes red, re-derive before treating it as a defect.
    const rs = all();
    const by = (v) => rs.flatMap((r) => r.figures.filter((f) => f.reviewableVia === v));
    expect(by('figure').length).toBe(627);
    expect(by('inlineMedia').length).toBe(227);
    expect(by('media').length).toBe(97);
    // Both new classes are captionless BY CONSTRUCTION and carry an alt id.
    for (const v of ['inlineMedia', 'media']) {
      expect(by(v).every((f) => f.captionSegmentId === null)).toBe(true);
      expect(by(v).every((f) => typeof f.altSegmentId === 'string')).toBe(true);
    }
  });

  it('leaves the still-absent population intact and does NOT invent structure-only names', () => {
    const rs = all();
    expect(rs.flatMap((r) => r.unreviewable).length).toBe(197);
    expect(rs.flatMap((r) => r.figures).length).toBe(1148);
    expect(rs.flatMap((r) => r.structureOnly)).toEqual([]);
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
