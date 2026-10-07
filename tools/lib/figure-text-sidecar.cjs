/**
 * The figure-text sidecar: the COMMITTED record of a translated figure's
 * Icelandic text and its review state.
 *
 * ⚠️ .cjs on purpose. Both trees consume this: `tools/` is ESM and `server/` is
 * CommonJS. That dual-consumer requirement is the only legitimate reason to
 * reach for .cjs in this repo.
 *
 * ⚠️ This file is why `tools/cnxml-render.js` needs no database access. Review
 * state reaches the renderer through a committed file, so no MIT -> AGPL import
 * edge is created (root LICENSE, known gap E-2) and the CLI works on a fresh
 * clone with no server running.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const SIDECAR_VERSION = 1;

/**
 * Bump when a composer change alters pixels for unchanged text. Doing so
 * invalidates every stored renderHash, which correctly sends every approved
 * figure back to mt-preview until re-reviewed.
 *
 * '2' (2026-09-13, §C140 ①): kept figure text is drawn run-exact.
 * '3' (2026-09-14, §C140 ② ③ ⑨): translated labels keep their formula formatting and are laid
 * out against their own container; English-kept numbers are drawn with a decimal comma; the
 * artwork's cairo blend chains are collapsed so a browser can load them.
 *
 * '4' (2026-09-17, §C140 ㊱): no composer change of its own. It covers three pixel-changing
 * composer changes merged without a bump: ④ (graphics-state operators kept inside text objects),
 * ⑥a (kept STIX symbols drawn in FigSym) and ⑥b (translated labels drawn with font-kerning:none).
 * Each had recomposed every figure it touched instead. ④ and ⑥a skipped the bump because no
 * committed sidecar carried a review `state` — prod's lack of figure approvals was not visible from
 * the tree, and [USER] confirmed it only after their deploy; ⑥b skipped it on both grounds (④'s
 * spec S3 and its correction, ⑥a's T6, ⑥b's K4, under docs/superpowers/specs/2026-09-17-c140-*).
 * That exception is CLOSED by '4': `composedVersion`
 * again tells media drawn before them from media drawn after, so `figure-run.js`'s `isStale` names
 * a bought figure a recompose missed.
 *
 * '5' (2026-10-04, §C140 ㊾, the step-2 recompose pass): one recompose for every composer change since
 * '4' that alters pixels or bytes, and for three made for the pass. Since '4': §C159 (ccabafd08:
 * textless figures recomposed from source, and font subsets saved with a pinned timestamp, so an
 * unchanged figure recomposes byte-identical), §C168 (11c7ee82f: the heavy tail drawn as raster
 * artwork under live text), ㉗ (6d32335a7, ade93a3c2: FigIS subsets renamed, carrying the OFL
 * licence in `<metadata>`) and ⑭ (f9b4cbfff: artwork holding an in-document feImage rasterised
 * the same way, because Firefox paints it transparent). ㊸ (a5f5b3750, the ring detector's
 * memoised walk) is output-neutral — test_figrings.py section 6b asserts it finds exactly what the
 * original walk finds — and is named so nobody bumps for it. Made for the pass: ㉑ (a label
 * block's visual line count read from its own cues and alignment), §C161 (`/Annots` comment icons
 * dropped before the artwork is drawn) and `heldBlockValues` (a held, send:false block drawn with
 * a value [USER] ruled; figure-compose.py reads it from figure-text.config.json and hands it to
 * compose.py, like numloc's decimal comma it changes no sidecar, and a later change to a value
 * reaches a sidecar figure's media only at the next bump).
 *
 * '6' (2026-10-07, §C140 '6', the formatting class; spec
 * docs/superpowers/specs/2026-10-05-c140-composer-formatting-class-design.md). The code merged as
 * PR-A (#544, 91c85c33f) without a bump; this one covers it and the tables PR-B filled. Seven
 * mechanisms: M1 (source-anchored row cuts, applied after selection), M2 (a whitespace-only visual
 * line folds into its neighbour, R-17), M3 (a cell's height budget admits the source's own rows),
 * M4 (A2v: a single-line label guessed as centred takes its source column's side; P1v: a label
 * drawn on its source line count takes the source pitch), M5 (seven narrow script-transfer rules),
 * M6 (STIX Italic, Bold and BoldItalic drawn in their own official faces, as FigSym siblings) and
 * M7 (a box holding more than one label is laid out as a cell). Also R-16 (a label below the 7.5 pt
 * floor shrinks to 0.8 × its source size; docs/decisions/2026-10-06-figure-labels-below-floor-
 * shrink-to-0-8.md), R-5a's explicit `\n` line break in a translated value, and three per-figure
 * config tables beside `heldBlockValues`: `artworkEdits` (R-15a: edits to the staged artwork PDF,
 * applied at prepare), `anchorExclusions` (R-20: M1 turned off for named block keys) and
 * `sourceAlignedBoxes` (R-5c2: a figure's boxes keep the source's alignment;
 * docs/decisions/2026-10-07-hazdiamond-keeps-source-box-alignment.md). PR-B filled them for
 * FoodLabel, HazDiamond and PentIso, and added FoodLabel's two held bullets.
 *
 * THE RULE FROM HERE: skip a bump only if no sidecar carries `state` AND prod holds no figure
 * approval up to the deploy that carries the change (editors approve against prod's own checkout of
 * the media); otherwise bump. ⚠️ A bump's recompose must be bare `--stale` (never `--force`, which
 * hides whether every sidecar went stale) and changes ONE sidecar field, `composedVersion`; a
 * sidecar's `composerVersion` stays the version its `renderHash` was hashed under.
 * The bump commit also re-pins tools/__tests__/figure-text-config.test.js's COMPOSER_TABLES_PIN for the
 * new version (§C140 '6' G6): it fingerprints the config tables that change pixels outside renderHash
 * (figure-text-config.js COMPOSER_PIXEL_TABLES) for the figures with a sidecar, and goes red when one
 * of them changes without a bump.
 * ⚠️ WHAT A BARE `--stale` REACHES CHANGED WITH ㊴ (#529): it selects a figure with a sidecar file
 * OR an image-mapping row, so it reaches the §C159 textless figures too, and it never buys (a
 * selected figure with no sidecar that classifies `translated` is refused `skipped-unbought`).
 * Textless figures carry no stamp, so EVERY `--stale` run recomposes them: check their convergence
 * by byte identity across two runs, never by `skipped-current`. A figure in `keptCopies` is
 * refused at resolution and never recomposed. Run the pass as
 * `node tools/figure-run.js --book <slug> --chapter <N> --stale`, one chapter at a time, never
 * through `scripts/chemistry-autorun-chapter.sh`, which runs the driver without `--stale`.
 */
const COMPOSER_VERSION = '6';

/**
 * @param {string} bookDir  the BOOK directory, i.e. `books/<slug>` — NOT the books
 *   root. cnxml-render.js's BOOKS_DIR is already `books/<slug>`, so a (root, slug)
 *   signature made its only caller wrong by construction.
 */
function sidecarPath(bookDir, basename) {
  return path.join(bookDir, 'figure-text', `${basename}.is.json`);
}

function readSidecar(bookDir, basename) {
  try {
    const raw = fs.readFileSync(sidecarPath(bookDir, basename), 'utf-8');
    const obj = JSON.parse(raw);
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return null;
    return obj;
  } catch {
    // Absent or malformed. A missing sidecar is the normal case for an
    // untranslated figure; returning null rather than throwing keeps a render
    // of the whole chapter from dying on one bad file.
    return null;
  }
}

function writeSidecar(bookDir, basename, data) {
  const p = sidecarPath(bookDir, basename);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const tmp = `${p}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(data, null, 1)}\n`, 'utf-8');
  fs.renameSync(tmp, p); // atomic: a crash mid-write must not leave a half file
}

function computeRenderHash(blocks, composerVersion) {
  const h = crypto.createHash('sha256');
  h.update(String(composerVersion));
  for (const k of Object.keys(blocks).sort()) {
    h.update('\0'); // separator that cannot appear in a block key
    h.update(k);
    h.update('\0');
    h.update(String(blocks[k]));
  }
  return h.digest('hex').slice(0, 16);
}

/**
 * THE EDITORIAL VERDICT: has an editor approved THESE EXACT blocks?
 *
 * Deliberately says nothing about the composer. This is the value
 * applyApprovedFigureEdits WRITES as the sidecar's `state`, and gating it on
 * composedHash would deadlock the feature: every approval would be written as
 * 'mt-preview', effectiveState() below short-circuits on `state !== 'approved'`,
 * and no later stamp could ever flip it. 'approved' would be unreachable.
 */
function editorialState(sidecar, currentBlocks, composerVersion) {
  if (!sidecar || !sidecar.state) return 'mt-preview';
  if (sidecar.state === 'flagged') return 'flagged';
  if (sidecar.state !== 'approved') return 'mt-preview';
  const now = computeRenderHash(currentBlocks, composerVersion);
  return now === sidecar.renderHash ? 'approved' : 'mt-preview';
}

/**
 * WHAT THE READER AND THE EDITOR SEE: does the PUBLISHED IMAGE carry approved
 * text? The card, the /figures payload and cnxml-render all use this one.
 *
 * 🔴 The defect it closes ([USER] ruling C, 2026-09-04): approving does not run
 * the composer — nothing in the server invokes it, compose.py is run by hand —
 * so an editor could correct `Selsíus` → `Celsíus`, approve, and every surface
 * would report approved while books/<slug>/media/<basename>_IS.svg still read
 * `Selsíus`. NO check in the repo could see it, because the sidecar's renderHash
 * is consistent with the sidecar's own blocks BY CONSTRUCTION.
 *
 * Two conditions, both from values already in the sidecar — no extra file read:
 *   editorialState === 'approved'                  (blocks unchanged since approval)
 *   sidecar.composedHash === sidecar.renderHash    (the SVG was composed from them)
 *
 * ▶ It inverts the flow correctly, and that is the point rather than a nuisance:
 * approve → still mt-preview → run the composer → approved.
 *
 * 🔴 composedHash ABSENT yields mt-preview, never approved. An approved sidecar
 * with no composedHash means the image was never composed from approved text;
 * failing safe costs nothing today (no legacy sidecars exist) and protects every
 * future one. The truthiness check also stops a degenerate '' === '' pair from
 * reading as approval.
 */
function effectiveState(sidecar, currentBlocks, composerVersion) {
  const editorial = editorialState(sidecar, currentBlocks, composerVersion);
  if (editorial !== 'approved') return editorial;
  return sidecar.composedHash && sidecar.composedHash === sidecar.renderHash
    ? 'approved'
    : 'mt-preview';
}

/**
 * A line made only of characters that draw nothing on their own: format, combining or control
 * characters. U+200B, U+00AD and U+034F are in the pinned faces' cmap, so the composer's no-glyph
 * check passes them, and `String.prototype.trim` keeps U+200B: such a line would erase its label.
 * 🔴 A SECOND IMPLEMENTATION of experiments/figure-text-translation/heldvalues.py's
 * INVISIBLE_CATEGORIES ('Cf', 'Mn', 'Me', 'Cc'); each reads its engine's own Unicode tables, so
 * the two can differ on a newly assigned code point. Its one JS owner is this module (§C140 '6' D6);
 * figure-config-validate.js imports it.
 */
const INVISIBLE_LINE = /^[\p{Cf}\p{Mn}\p{Me}\p{Cc}]+$/u;

/**
 * The block key's '|'-segments that are source LINES (§C140 '6' M2, ruling R-17 [USER] 2026-10-05).
 * A segment of only U+0020 is the next row's indent space (figtext.is_blank_line, its Python twin):
 * the composer folds it into its neighbour, so it is no line a value can fill (FoodLabel's
 * `more is| `). An EMPTY segment ('a||b') is kept, as M2 keeps it.
 *
 * @param {string} key a sidecar block key: the English source lines joined with '|'
 * @returns {string[]} the segments that count as lines, in key order (possibly empty)
 */
function keyInkSegments(key) {
  return String(key)
    .split('|')
    .filter((s) => !(s !== '' && /^ +$/.test(s)));
}

/**
 * How many lines a value for `key` may have: its ink segments, or - when every segment is spaces
 * only - the raw segment count (so the result is never 0). This is the UPPER bound the boundaries can
 * check without geometry; the exact visual line count is the composer's (`figtext.explicit_lines`'
 * `line-count`, against the block's folded visual lines).
 * The review panel's textarea predicate (server/public/js/segment-editor.js
 * `figureKeyInkLineCount`) is a browser copy of this function, which cannot require a .cjs; its
 * parity is pinned over every committed key by server/__tests__/figureCardClientPins.test.js.
 *
 * @param {string} key
 * @returns {number}
 */
function keyInkLineCount(key) {
  return keyInkSegments(key).length || String(key).split('|').length;
}

/**
 * Why a translated block VALUE may not be stored, as `reason: detail` strings - [] when it may.
 * §C140 '6' R-5a ([USER] 2026-10-05): an LF (U+000A) in a value is the editor's explicit line
 * break, drawn on its own line by the composer or refused by name. The boundaries refuse every shape
 * the composer would refuse that they can see without geometry, so a malformed break never reaches a
 * sidecar: the block-save route (400, no write) and the committed-corpus sweep
 * (tools/__tests__/figure-text-sidecar.test.js V10). Reasons, in the order the composer checks them:
 *   carriage-return  any CR, with or without an LF (a browser's textarea value is LF-normalised, so
 *                    a CR comes only from a non-browser client)
 *   empty-line       a line that is empty or whitespace only            (LF values only)
 *   edge-space       a line with leading or trailing whitespace         (LF values only)
 *   invisible-line   a line of only INVISIBLE_LINE characters once its spaces (\p{Zs}) are set
 *                    aside: U+200B U+0020 U+200B draws nothing too (G21, F2 n3; figtext.explicit_lines
 *                    judges it alike). ALSO a whole no-LF value of that shape, on ANY key (G21 #16):
 *                    it would erase its label, and the route's trim() guard keeps U+200B
 *   line-count       more lines than keyInkLineCount(key): a single-line key takes no LF
 * 🔴 A SECOND IMPLEMENTATION of figtext.explicit_lines' refusals (the composer's, which also refuses
 * `arc`, `break-at-joint` and `run-exact` and checks the exact visual count; none is visible here),
 * with ONE DELIBERATE DIVERGENCE: the whole-value invisible-line refusal above is this boundary's
 * alone — the composer lays out a no-LF value as before, byte for byte, so a sidecar written before
 * this rule (the committed corpus held 0 of 2,717 on 2026-10-06) still composes. `trim`
 * and Python's `str.strip` differ at the edges of Unicode whitespace (U+FEFF is trimmed here, not
 * there; U+001C-U+001F the reverse), so the two sides can disagree on a value carrying one of those
 * at a line's edge. Accepted gap (D14): a key with more '|' lines than VISUAL lines (the ㉑ merges)
 * can be saved here and then refused at compose, by name.
 *
 * @param {string} key   the block key (English source lines joined with '|')
 * @param {string} value the translated value an editor or a file supplies
 * @returns {string[]}
 */
function blockValueProblems(key, value) {
  const problems = [];
  const v = String(value);
  if (v.includes('\r')) {
    problems.push('carriage-return: the value holds a CR (U+000D); a line break is an LF only');
  }
  if (!v.includes('\n')) {
    // G21 #16: a value of ONLY invisible characters erases its label on any key, and the route's
    // `!isText.trim()` guard cannot see it (trim keeps U+200B). Refused here, LF or not.
    if (INVISIBLE_LINE.test(v.replace(/\p{Zs}/gu, ''))) {
      problems.push('invisible-line: the value has no visible character');
    }
    return problems;
  }
  const lines = v.split('\n');
  lines.forEach((l, i) => {
    const n = i + 1;
    if (l.trim() === '') {
      problems.push(`empty-line: line ${n} is empty or whitespace only`);
    } else if (l !== l.trim()) {
      problems.push(`edge-space: line ${n} has leading or trailing whitespace`);
    } else if (INVISIBLE_LINE.test(l.replace(/\p{Zs}/gu, ''))) {
      problems.push(`invisible-line: line ${n} has no visible character`);
    }
  });
  const max = keyInkLineCount(key);
  if (lines.length > max) {
    problems.push(
      `line-count: the value has ${lines.length} lines but its key has ${max} source line${max === 1 ? '' : 's'}`
    );
  }
  return problems;
}

module.exports = {
  SIDECAR_VERSION, COMPOSER_VERSION,
  sidecarPath, readSidecar, writeSidecar, computeRenderHash,
  editorialState, effectiveState,
  INVISIBLE_LINE, keyInkSegments, keyInkLineCount, blockValueProblems,
};
