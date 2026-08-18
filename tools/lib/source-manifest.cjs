'use strict';

/**
 * Source-manifest helpers for the F2 01-source provenance guard.
 *
 * Committed manifest: books/<book>/01-source/.source-manifest.json — a per-CNXML
 * sha256 baseline that makes any silent swap of the irrevocable CC BY copies
 * detectable (fails `npm test`). Algorithm matches cnxml-extract.js's `sourceHash`
 * (sha256 of raw bytes); the extract manifest stores the first 16 chars.
 *
 * CommonJS so both the ESM tools (import) and the CJS server (require) can use it,
 * like tools/lib/seg-markers.cjs.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const MANIFEST_NAME = '.source-manifest.json';

/** Absolute paths of every *.cnxml under `dir`, recursive. [] if dir is absent. */
function listCnxmlFiles(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...listCnxmlFiles(full));
    } else if (entry.isFile() && entry.name.endsWith('.cnxml')) {
      out.push(full);
    }
  }
  return out;
}

/** { posixRelPath -> sha256hex } for every CNXML under sourceDir, sorted keys. */
function computeFiles(sourceDir) {
  const files = {};
  for (const abs of listCnxmlFiles(sourceDir).sort()) {
    const rel = path.relative(sourceDir, abs).split(path.sep).join('/');
    files[rel] = crypto.createHash('sha256').update(fs.readFileSync(abs)).digest('hex');
  }
  return files;
}

/** Deterministic manifest object (no timestamp — the generate CLI stamps that). */
function computeSourceManifest(sourceDir, { book }) {
  return {
    version: 1,
    book,
    algorithm: 'sha256',
    files: computeFiles(sourceDir),
  };
}

/**
 * Read + parse the committed manifest, v1 or v2 alike. Returns null if the file
 * is absent. Does NOT swallow a JSON parse error — a corrupt manifest must not
 * silently read as "no manifest", which would misroute a caller (e.g. G2) into
 * the wrong refusal path.
 */
function readSourceManifest(sourceDir) {
  const manifestPath = path.join(sourceDir, MANIFEST_NAME);
  if (!fs.existsSync(manifestPath)) return null;
  return JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
}

/**
 * The `localOrigin` carve-out declared in a v2 manifest (§C93 G4) — file paths
 * and directory prefixes for bytes that did not come from upstream, e.g.
 * chemistry's re-authored `ch00/m68662.cnxml`. A v1 manifest, or a v2 manifest
 * that simply omits the key, has none: this always returns an array and never
 * throws on the older shape.
 *
 * Read support only — writing `localOrigin` happens on the refresher path.
 *
 * @param {string} sourceDir absolute path to a book's `01-source` directory
 * @returns {Array<{path: string, reason?: string, evidence?: string}>}
 */
function readLocalOrigin(sourceDir) {
  const manifest = readSourceManifest(sourceDir);
  if (!manifest || manifest.version < 2 || !Array.isArray(manifest.localOrigin)) return [];
  return manifest.localOrigin;
}

/**
 * Compare the committed manifest to the current tree. Reads v1 and v2 manifests
 * alike — both carry the same `files` map (posixRelPath -> sha256hex); v2's
 * extra keys (`upstream`, `localOrigin`, `supersedes`) are additive and don't
 * change what gets compared here.
 */
function verifySourceManifest(sourceDir) {
  const manifest = readSourceManifest(sourceDir);
  if (!manifest) {
    return { ok: false, manifestMissing: true, changed: [], missing: [], added: [] };
  }
  const expected = manifest.files || {};
  const actual = computeFiles(sourceDir);

  const changed = [];
  const missing = [];
  const added = [];
  for (const rel of Object.keys(expected)) {
    if (!(rel in actual)) missing.push(rel);
    else if (actual[rel] !== expected[rel]) changed.push(rel);
  }
  for (const rel of Object.keys(actual)) {
    if (!(rel in expected)) added.push(rel);
  }

  const ok = changed.length === 0 && missing.length === 0 && added.length === 0;
  return {
    ok,
    manifestMissing: false,
    changed: changed.sort(),
    missing: missing.sort(),
    added: added.sort(),
  };
}

module.exports = {
  MANIFEST_NAME,
  listCnxmlFiles,
  computeFiles,
  computeSourceManifest,
  readSourceManifest,
  readLocalOrigin,
  verifySourceManifest,
};
