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
 *                 driver translates, because readers are the point. Measured on
 *                 chemistry ch04: 30.
 *   REVIEWABILITY the subset that has a `type:'figure'` node in the generated
 *                 `02-structure/`, i.e. what the review panel can show an
 *                 editor. Measured on chemistry ch04: 18.
 *
 * The module's job is to compute both and NAME the gap — never to make them
 * agree. Widening the review surface is a tracked follow-up, not part of M5.
 *
 * 🔴 THE ATTRACTIVE SHORTCUT IS MEASURED CLOSED. "Walk `02-structure` for all
 * images and flag the figure nodes" would make the two sets one by
 * construction and need no CNXML at all — but the 12 non-figure ch04 images
 * have **no node there in any form** (0 hits, against a 3-hit positive
 * control). Reading `01-source/*.cnxml` is therefore load-bearing, and so is
 * doing it with `TAG_ATTR_SPAN`.
 *
 * ⚠️ `reviewable` here is STRUCTURAL — "is this image inside a `<figure>`". It
 * is deliberately NOT the review panel's *runtime* sense ("does
 * `books/<slug>/figure-text/<basename>.is.json` exist"), which is false for
 * every figure until the driver has spent money and would make a `--dry-run`
 * report zero reviewable figures for ever.
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
 * Every figure basename in one module's `02-structure` file, in document
 * order, deduplicated.
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
 * @returns {Array<{basename:string, captionSegmentId:string|null, altSegmentId:string|null}>}
 *   Empty when the module has no structure file or no figures — never throws.
 */
function listStructureFigures(structurePath) {
  let structure;
  try {
    structure = JSON.parse(fs.readFileSync(structurePath, 'utf-8'));
  } catch {
    return []; // absent or malformed: a module with no structure has no figures
  }
  const out = [];
  const seen = new Set();
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
        if (basename && !seen.has(basename)) {
          seen.add(basename);
          out.push({
            basename,
            captionSegmentId: (node.caption && node.caption.segmentId) || null,
            altSegmentId: (node.media.alt && node.media.alt.segmentId) || null,
          });
        }
      }
      // deliberately no early return: a figure may nest another figure
    }
    for (const v of Object.values(node)) visit(v);
  };
  visit(structure.content);
  return out;
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
      if (!structureByBasename.has(fig.basename)) {
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
