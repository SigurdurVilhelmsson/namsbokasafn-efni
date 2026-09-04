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
 */
const COMPOSER_VERSION = '1';

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
