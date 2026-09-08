/**
 * The ONE figure/image enumeration predicate, shared by the M5 figure driver
 * (`tools/figure-run.js`, ESM) and the review panel
 * (`server/services/figureReviewService.js`, CJS). Dual-consumer is the only
 * legitimate reason for a `.cjs` in this repo.
 *
 * 🔴 IT COMPUTES **TWO** SETS, AND THAT IS A [USER] RULING (R7), NOT A CHOICE.
 * See docs/superpowers/specs/2026-09-06-m5-figure-driver-design.md:39 and :197.
 *
 *   ENUMERATION   every `<image src>` in the chapter's CNXML. This is what the
 *                 driver translates, because readers are the point.
 *   REVIEWABILITY the subset the review panel can show an editor: an image with
 *                 a node in the generated `02-structure/` that carries a `src`
 *                 to key on. `via` says which construct supplied it.
 *
 * The module's job is to compute both and NAME the gap — never to make them
 * agree.
 *
 * 🔴 §C139 TIER 1 (2026-09-08) WIDENED REVIEWABILITY FROM "IS IT IN A
 * `<figure>`" TO FOUR CONSTRUCTS. `via` names which one supplied the record:
 *   figure       a `type:'figure'` node — the only one that can carry a caption
 *   inlineMedia  the top-level `inlineMedia` array
 *   media        a `type:'media'` node loose in the content tree
 *   cellAlt      a table cell's `alt` object (`rows[].cells[].alt`), which
 *                carries both a `src` and its §C88 alt segment
 * ⚠️ THE COUNTS ARE NOT RESTATED HERE. §C139 in the active register owns them
 * and says "do not quote this table"; the test file holds them as executable
 * anchors. A census copied into a docstring is exactly what this repo keeps
 * finding stale.
 *
 * 🔴 "UNREVIEWABLE" MEANS **02-structure HAS NO SRC-KEYED NODE FOR THIS IMAGE**
 * — IT DOES *NOT* MEAN "ABSENT FROM 02-structure", AND THE DIFFERENCE DECIDES
 * WHAT AN OPERATOR SHOULD DO. This header said the latter for one commit and an
 * adversarial review measured it false: most of chemistry's residue HAS a
 * `type:'media'` node carrying a full alt segment and missing only `src`,
 * because the extractor never writes one there. Re-extraction with today's
 * extractor reproduces it byte for byte, so it is an EXTRACTOR defect, not a
 * stale vintage. ▶ Each book's residue has its own cause — organic's was
 * entirely `cellAlt` and chemistry has zero of those — so **a gap measured on
 * one book says nothing about the other.** The test file pins both.
 *
 * 🔴 THE ATTRACTIVE SHORTCUT IS STILL CLOSED, BUT ITS ORIGINAL JUSTIFICATION
 * WAS REFUTED BY MEASUREMENT AND IS RECORDED HERE RATHER THAN QUIETLY FIXED.
 * This paragraph read: "the 12 non-figure ch04 images have **no node there in
 * any form** (0 hits, against a 3-hit positive control)". Re-measured
 * 2026-09-08 with a raw text search over ch04's structure files: **2 of the 12
 * ARE there**, in `inlineMedia`. The instrument behind "0 hits" could only have
 * been looking at figure nodes, so it was answering a narrower question than
 * the sentence claimed — and had anyone trusted it, tier 1 would have looked
 * impossible. ▶ The CONCLUSION survives: reading `01-source/*.cnxml` is
 * load-bearing, and so is doing it with `TAG_ATTR_SPAN`. A rationale can be
 * false while the conclusion is right. ⚠️ The same error was then committed a
 * second time in this very file — see the "no src-keyed node" paragraph above —
 * which is why the remaining gap is now stated as a property of the LOOKUP and
 * never as a claim about what the corpus contains.
 *
 * ⚠️ `reviewable` here is STRUCTURAL — "does this image have a src-keyed node
 * in 02-structure". It is deliberately NOT the review panel's *runtime* sense
 * ("does `books/<slug>/figure-text/<basename>.is.json` exist"), which is false
 * for every figure until the driver has spent money and would make a
 * `--dry-run` report zero reviewable figures for ever.
 *
 * 🔴 THIS MODULE MUST NOT REQUIRE ANYTHING UNDER `server/`.
 * `server/` (AGPL) -> `tools/lib` (MIT) is the permitted import direction and
 * the reverse is not (see the comment at figureReviewService.js:23-24); a
 * `server/lib/chapterLabel` require here would be that reverse edge AND a
 * require cycle. So the CHAPTER DIRECTORY NAME arrives as a parameter, already
 * resolved: the ESM driver — which the server never loads — calls
 * `chapterDir(normalizeChapter(arg))` and passes the result in.
 */
const fs = require('fs');
const path = require('path');

/**
 * `tools/lib/cnxml-parser.js` is ESM, and this file is CJS, so reaching it is
 * `require(esm)` — unflagged from Node 22.12.0 and a throw before it. Both
 * `engines` floors now declare `>=22.12.0` for exactly this reason, pinned by
 * `tools/__tests__/ci-node-version.test.js`.
 *
 * 🔴 BUT THE FLOOR IS NOT WHAT MAKES THIS SAFE, AND THE LAZY LOAD IS — DO NOT
 * "SIMPLIFY" IT TO A TOP-LEVEL REQUIRE ON THE STRENGTH OF THAT FLOOR.
 * `engines` is advisory: no `.npmrc`, `engine-strict` false, npm only warns and
 * Node never reads it, so a box on 22.11 installs, runs, and throws. Loading
 * lazily confines the requirement to the CNXML half — `server/` requires this
 * module for `listStructureFigures`, which never reaches here (verified with a
 * `Module._load` probe on chemistry and on the e2e fixture book). That is a
 * property of the code and survives whatever any machine happens to run.
 */
let _parser = null;
function parser() {
  if (!_parser) _parser = require('./cnxml-parser.js');
  return _parser;
}

/**
 * The single key derivation both halves share, which is the only reason the
 * two sets are comparable at all.
 *
 * 🔴 It does NOT strip a `-[0-9a-f]{4}` hash suffix. A figure's identity is the
 * UNSTRIPPED CNXML basename everywhere — sidecar filename, `--out` directory,
 * `image-mapping.json` entry — and the driver's de-hash is a lookup-only
 * fallback for finding artwork, which must never rename anything.
 *
 * @param {unknown} src - an `<image src>` or a structure node's `media.src`
 * @returns {string|null} the basename, or null when there is nothing to key on
 */
function basenameFromSrc(src) {
  if (typeof src !== 'string' || !src) return null;
  const base = path.basename(src, path.extname(src));
  return base || null;
}

/**
 * How much a `via` provenance is worth when two modules of one chapter both
 * claim a basename. `figure` outranks the two captionless constructs; those two
 * are disjoint on the corpus (0 basenames in both) and interchangeable if they
 * ever met. An unknown value ranks lowest so a future construct cannot silently
 * displace a figure by being added here and forgotten there.
 *
 * @param {string|null|undefined} via
 * @returns {number}
 */
function viaRank(via) {
  if (via === 'figure') return 2;
  if (via === 'inlineMedia' || via === 'media' || via === 'cellAlt') return 1;
  return 0;
}

/**
 * Every `<image>` in one CNXML module, in document order, deduplicated.
 *
 * ⚠️ Uses `openTagPattern`/`TAG_ATTR_SPAN`, never `[^>]*`: a raw `>` is legal
 * inside an XML attribute value, and the naive form truncates the open tag
 * mid-attribute, yielding a capture with no `src` in it at all — a SILENTLY
 * MISSING figure, invisible to any count (§C115).
 *
 * ⚠️ XML comments are stripped first. Measured on the corpus: 2 of organic's
 * 2,165 `<image>` tags sit inside `<!-- -->` (ch16/m00198, ch28/m00309) and
 * chemistry has 0. A commented-out image is not in the document; enumerating
 * one would buy a translation from the paid MT for artwork no reader can see.
 *
 * An `<image>` whose `src` cannot be read is REPORTED, not dropped — a missing
 * artefact is as much a defect as an empty one, and only one of the two is
 * visible in a tally.
 *
 * @param {string} cnxmlPath - absolute path to a module's `.cnxml`
 * @returns {{images: Array<{basename: string, src: string}>,
 *            warnings: Array<{file: string, reason: string, tag: string}>}}
 */
function listCnxmlImages(cnxmlPath) {
  const { openTagPattern, parseAttributes } = parser();
  const raw = fs.readFileSync(cnxmlPath, 'utf-8');
  const text = raw.replace(/<!--[\s\S]*?-->/g, '');
  const re = openTagPattern('image', { capture: true, flags: 'g', selfClosing: true });
  const images = [];
  const warnings = [];
  const seen = new Set();
  let m;
  while ((m = re.exec(text)) !== null) {
    const attrs = parseAttributes(m[1]);
    const basename = basenameFromSrc(attrs.src);
    if (!basename) {
      warnings.push({ file: cnxmlPath, reason: 'unreadable-src', tag: m[0] });
      continue;
    }
    if (seen.has(basename)) continue;
    seen.add(basename);
    images.push({ basename, src: attrs.src });
  }
  return { images, warnings };
}

/**
 * Every REVIEWABLE image basename in one module's `02-structure` file, in
 * document order, deduplicated — not only the `<figure>` ones.
 *
 * ⚠️ THE NAME IS NARROWER THAN THE BEHAVIOUR AND IS KEPT ON PURPOSE. Since
 * §C139 tier 1 this returns three constructs, tagged by `via`: a
 * `type:'figure'` node, a `type:'media'` node loose in the content tree, and an
 * entry of the top-level `inlineMedia` array. Renaming it would churn both
 * trees and every caller for no behavioural gain; the docstring is the fix.
 *
 * PRECEDENCE IS RANKED, NOT ORDERED, AND THAT IS A CORRECTION. This said
 * "`content` is walked before `inlineMedia`, and the figure branch precedes the
 * media branch, so `seen` gives a `<figure>` precedence" — true per NODE and
 * FALSE ACROSS SIBLINGS: a first-wins set makes precedence depend on document
 * order, so a loose `type:'media'` node appearing before its `<figure>` sibling
 * would take the slot and the caption would be lost. Measured exposure on both
 * kept books: 0 — i.e. it was correct by luck, which is the cheapest possible
 * moment to make it a rule. Records are now collected into a Map and `viaRank`
 * decides, here and in enumerateChapterImages, so one rule covers both the
 * intra-module and cross-module cases.
 *
 * ⚠️ Figures nest arbitrarily (section > example > figure), so this walks the
 * whole structure tree rather than scanning one level. The basename idiom is a
 * plain `path.basename(src, extname(src))`, so
 * `../../media/CNX_Chem_01_01_ChemWeb.jpg` -> `CNX_Chem_01_01_ChemWeb`.
 *
 * 🔴 DO NOT "UNIFY" THIS WITH THE RENDERER'S DERIVATION. This comment used to
 * say the idiom was identical to the renderer's, and that WAS true — which is
 * precisely why the review badge fired on zero production figures. The two
 * sides read different vintages of the same figure and must derive the key
 * differently:
 *   - HERE the input is 02-structure/, extracted from 01-source, so the src
 *     basename already IS the English one and a plain basename is correct.
 *   - the RENDERER's input is 03-translated/, cnxml-inject's OUTPUT, where a
 *     mapped `<image src>` has been swapped to the translated variant; it must
 *     invert books/<slug>/media/image-mapping.json first (see
 *     sidecarBasenameForSrc in cnxml-render.js).
 * Both then agree on the ENGLISH basename, which is the join key the sidecar
 * and applyApprovedFigureEdits are written against. Copying either derivation
 * onto the other side reintroduces the defect.
 *
 * Returns the caption/alt segment ids alongside, because the caller needs the
 * module's own prose as captionDivergence's reference text.
 *
 * @param {string} structurePath - absolute path to `<moduleId>-structure.json`
 * @returns {Array<{basename:string, captionSegmentId:string|null,
 *                   altSegmentId:string|null, via:'figure'|'inlineMedia'|'media'}>}
 *   Empty when the module has no structure file or no reviewable image — never
 *   throws. `captionSegmentId` is null for every `via` but 'figure'.
 */
function listStructureFigures(structurePath) {
  let structure;
  try {
    structure = JSON.parse(fs.readFileSync(structurePath, 'utf-8'));
  } catch {
    return []; // absent or malformed: a module with no structure has no figures
  }
  // Keyed by basename so a <figure> can DISPLACE a captionless record already
  // taken by an earlier sibling. A plain `seen` set made precedence depend on
  // DOCUMENT ORDER — correct per node, wrong across siblings, and true on
  // today's corpus only by luck (measured: 0 such cases on both kept books).
  // Insertion order is preserved on replace, so document order still decides
  // the OUTPUT order; only the winner changes.
  const out = new Map();
  const take = (rec) => {
    const prev = out.get(rec.basename);
    if (!prev || viaRank(rec.via) > viaRank(prev.via)) out.set(rec.basename, rec);
  };
  const visit = (node) => {
    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }
    if (!node || typeof node !== 'object') return;
    if (node.type === 'figure') {
      const src = node.media && node.media.src;
      if (typeof src === 'string' && src) {
        const basename = path.basename(src, path.extname(src));
        if (basename) {
          take({
            basename,
            captionSegmentId: (node.caption && node.caption.segmentId) || null,
            altSegmentId: (node.media.alt && node.media.alt.segmentId) || null,
            via: 'figure',
          });
        }
      }
      // deliberately no early return: a figure may nest another figure
    }
    // §C139 tier 1. A `type:'media'` node loose in the tree — an <image> in a
    // para, an example or an exercise solution that never went through a
    // <figure>. Same shape as an inlineMedia record and the walk was passing
    // straight over it, because it tested only for 'figure'.
    //
    // ⚠️ A figure's own `media` is a bare object with NO `type`, so this cannot
    // fire on it; and even where a structure did carry one, the figure branch
    // above has already claimed the basename via `seen`. Both are pinned.
    //
    // 🔴 KEYED ON `src`, NEVER ON `id`. Two chemistry modules extract such a
    // node whose src was lost while its id happens to BE the basename; keying
    // on id would recover them by inventing a second key derivation, which is
    // exactly what basenameFromSrc's docstring exists to prevent. They stay
    // unreviewable — an extractor defect to fix at the extractor.
    if (node.type === 'media') {
      const basename = basenameFromSrc(node.src);
      if (basename) {
        take({
          basename,
          captionSegmentId: null, // no <figure>, so no <caption> to key on
          altSegmentId: (node.alt && node.alt.segmentId) || null,
          via: 'media',
        });
      }
    }
    // §C139 tier 1, FOURTH construct. A table cell's `alt` object carries both
    // an image `src` and its §C88 src-keyed alt segment:
    //   rows[].cells[].alt = {segmentId, text, mediaId, src}
    // Measured: this is ALL 245 of lifraen-efnafraedi's remaining unreviewable
    // images and 0 of every other book's. Organic and chemistry needed
    // different branches, and neither gap was visible from the other book —
    // which is why a per-book re-derivation, not a generalisation, is what
    // found it.
    if (Array.isArray(node.rows)) {
      for (const row of node.rows) {
        if (!row || !Array.isArray(row.cells)) continue;
        for (const cell of row.cells) {
          const alt = cell && cell.alt;
          if (!alt || typeof alt !== 'object') continue;
          const basename = basenameFromSrc(alt.src);
          if (!basename) continue;
          take({
            basename,
            captionSegmentId: null,
            altSegmentId: alt.segmentId || null,
            via: 'cellAlt',
          });
        }
      }
    }
    for (const v of Object.values(node)) visit(v);
  };
  visit(structure.content);

  // §C139 tier 1. AFTER the content walk, never before: `seen` is what gives a
  // <figure> precedence over an inlineMedia entry naming the same image within
  // one module, and the figure record is the richer one — it is the only one
  // that can carry a caption. Real instance: efnafraedi-2e ch10/m68764.
  //
  // ⚠️ `alt` may be ABSENT, not null. drainInlineMediaAlts leaves it undefined
  // when the media has no alt text, and JSON.stringify drops an undefined
  // value, so `m.alt.segmentId` would throw on a real module.
  if (Array.isArray(structure.inlineMedia)) {
    for (const media of structure.inlineMedia) {
      if (!media || typeof media !== 'object') continue;
      const basename = basenameFromSrc(media.src);
      if (!basename) continue;
      take({
        basename,
        // Null BY CONSTRUCTION, not by omission: an inlineMedia image is an
        // <image> loose in a para, an example or an exercise solution. It has
        // no <caption> to have a segment id for.
        captionSegmentId: null,
        altSegmentId: (media.alt && media.alt.segmentId) || null,
        via: 'inlineMedia',
      });
    }
  }
  return [...out.values()];
}

/**
 * Both sets for one chapter of one book.
 *
 * @param {object} opts
 * @param {string} opts.bookDir - `books/<slug>` (NOT `books/`), matching
 *   figure-text-sidecar.cjs's convention.
 * @param {string} opts.chapterDir - the chapter DIRECTORY NAME, already
 *   resolved: `'ch04'` or `'appendices'`. Never a number and never `-1`; the
 *   caller does `chapterDir(normalizeChapter(arg))` because this module may
 *   not require `server/lib/chapterLabel` (see the header).
 * @param {string[]} [opts.moduleIds] - restrict to these modules. Any id
 *   without a `.cnxml` THROWS, so `--module` refuses instead of exiting 0
 *   having done nothing.
 * @returns {{
 *   bookDir: string, chapterDir: string, sourceDir: string, structureDir: string,
 *   structureDirExists: boolean, moduleIds: string[],
 *   figures: Array<{basename:string, src:string, moduleId:string, reviewable:boolean,
 *                   reviewableVia:'figure'|'inlineMedia'|'media'|null,
 *                   captionSegmentId:string|null, altSegmentId:string|null}>,
 *   reviewable: string[], unreviewable: string[], structureOnly: string[],
 *   warnings: Array<{moduleId:string, file:string, reason:string, tag?:string}>
 * }}
 *   `reviewable` and `unreviewable` partition `figures` exactly, so a caller's
 *   tally can be asserted against `figures.length`.
 */
function enumerateChapterImages({ bookDir, chapterDir, moduleIds } = {}) {
  if (typeof bookDir !== 'string' || !bookDir) {
    throw new Error('figure-enumerate: bookDir is required (books/<slug>)');
  }
  if (typeof chapterDir !== 'string' || !chapterDir) {
    throw new Error(
      'figure-enumerate: chapterDir is required and must be the directory NAME, ' +
        'e.g. "ch04" or "appendices"'
    );
  }
  const sourceDir = path.join(bookDir, '01-source', chapterDir);
  const structureDir = path.join(bookDir, '02-structure', chapterDir);

  let entries;
  try {
    entries = fs.readdirSync(sourceDir);
  } catch (err) {
    // Loud on purpose: chapterDir(NaN) is 'chNaN', and a chapter that silently
    // enumerates nothing is how 36 unmapped figures go unnoticed.
    throw new Error(`figure-enumerate: no CNXML source directory at ${sourceDir} (${err.code})`);
  }
  const present = entries
    .filter((f) => f.endsWith('.cnxml'))
    .map((f) => f.slice(0, -'.cnxml'.length))
    .sort();

  let ids = present;
  if (moduleIds !== undefined) {
    if (!Array.isArray(moduleIds) || moduleIds.length === 0) {
      throw new Error('figure-enumerate: moduleIds must be a non-empty array when given');
    }
    const missing = moduleIds.filter((id) => !present.includes(id));
    if (missing.length) {
      throw new Error(`figure-enumerate: no such module in ${sourceDir}: ${missing.join(', ')}`);
    }
    ids = moduleIds.slice();
  }

  const structureDirExists = fs.existsSync(structureDir);
  const warnings = [];

  // The reviewable side first, so each enumerated image can be answered in one
  // lookup. Keyed chapter-wide: an image that is a <figure> in ANY module of
  // the chapter is reviewable.
  const structureByBasename = new Map();
  for (const id of ids) {
    let figs;
    try {
      figs = listStructureFigures(path.join(structureDir, `${id}-structure.json`));
    } catch (err) {
      // listStructureFigures swallows absent/malformed, but a structure file
      // that parses to a non-object still throws inside it. That is the
      // service's exact behaviour and is preserved; here it must not take the
      // whole chapter down.
      warnings.push({
        moduleId: id,
        file: path.join(structureDir, `${id}-structure.json`),
        reason: 'unreadable-structure',
        tag: String(err && err.message),
      });
      continue;
    }
    for (const fig of figs) {
      const prev = structureByBasename.get(fig.basename);
      // First-wins, WITH ONE EXCEPTION (§C139 tier 1): a `<figure>` record
      // outranks a captionless one whatever the module order. Intra-module
      // precedence is handled by listStructureFigures' own `seen` set; ACROSS
      // modules there is no such walk, so without this a module sorting
      // earlier and holding the image only as loose media would shadow the
      // figure and drop its caption. Real instance: efnafraedi-2e ch06, where
      // CNX_Chem_06_01_2spectra is a <figure> in m68729 and inlineMedia in
      // m68732 — correct today only because m68729 happens to sort first.
      //
      // Ranked on PROVENANCE rather than on "has a caption": a <figure> with
      // no caption is still the richer record, and ranking says so without
      // depending on whether this particular one happens to carry one.
      if (!prev || viaRank(fig.via) > viaRank(prev.via)) {
        structureByBasename.set(fig.basename, fig);
      }
    }
  }

  const figures = [];
  const byBasename = new Map();
  for (const id of ids) {
    const { images, warnings: w } = listCnxmlImages(path.join(sourceDir, `${id}.cnxml`));
    for (const one of w) warnings.push({ moduleId: id, ...one });
    for (const img of images) {
      if (byBasename.has(img.basename)) continue;
      const st = structureByBasename.get(img.basename);
      const rec = {
        basename: img.basename,
        src: img.src,
        moduleId: id,
        reviewable: Boolean(st),
        // WHY it is reviewable: 'figure' | 'inlineMedia' | 'media' | 'cellAlt'
        // | null — the same set viaRank ranks, kept in step with it. The R7 gap is
        // no longer one population, and a bare boolean cannot say which. It is
        // also what keeps the independent `<figure>`-open-tag cross-check on
        // the extractor alive now that `reviewable` is the wider set.
        reviewableVia: st ? st.via : null,
        captionSegmentId: st ? st.captionSegmentId : null,
        altSegmentId: st ? st.altSegmentId : null,
      };
      byBasename.set(img.basename, rec);
      figures.push(rec);
    }
  }

  return {
    bookDir,
    chapterDir,
    sourceDir,
    structureDir,
    structureDirExists,
    moduleIds: ids,
    figures,
    reviewable: figures.filter((f) => f.reviewable).map((f) => f.basename),
    unreviewable: figures.filter((f) => !f.reviewable).map((f) => f.basename),
    // 02-structure naming an image the CNXML does not have would mean the
    // extractor invented one. Reported rather than quietly dropped.
    // ⚠️ Since §C139 tier 1 this covers inlineMedia and loose media nodes too,
    // so it is a wider check than it was — and it is still empty on both books.
    structureOnly: [...structureByBasename.keys()].filter((b) => !byBasename.has(b)),
    warnings,
  };
}

module.exports = {
  basenameFromSrc,
  listCnxmlImages,
  listStructureFigures,
  enumerateChapterImages,
};
