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
 * THE RULE FROM HERE: skip a bump only if no sidecar carries `state` AND prod holds no figure
 * approval up to the deploy that carries the change (editors approve against prod's own checkout of
 * the media); otherwise bump. ⚠️ A bump's recompose must be bare `--stale` (never `--force`, which
 * hides whether every sidecar went stale) and changes ONE sidecar field, `composedVersion`; a
 * sidecar's `composerVersion` stays the version its `renderHash` was hashed under.
 * ⚠️ WHAT A BARE `--stale` REACHES CHANGED WITH ㊴ (#529): it selects a figure with a sidecar file
 * OR an image-mapping row, so it reaches the §C159 textless figures too, and it never buys (a
 * selected figure with no sidecar that classifies `translated` is refused `skipped-unbought`).
 * Textless figures carry no stamp, so EVERY `--stale` run recomposes them: check their convergence
 * by byte identity across two runs, never by `skipped-current`. A figure in `keptCopies` is
 * refused at resolution and never recomposed. Run the pass as
 * `node tools/figure-run.js --book <slug> --chapter <N> --stale`, one chapter at a time, never
 * through `scripts/chemistry-autorun-chapter.sh`, which runs the driver without `--stale`.
 */
const COMPOSER_VERSION = '5';

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

module.exports = {
  SIDECAR_VERSION, COMPOSER_VERSION,
  sidecarPath, readSidecar, writeSidecar, computeRenderHash,
  editorialState, effectiveState,
};
