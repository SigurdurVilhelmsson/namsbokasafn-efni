/**
 * term-english-map.js
 *
 * Loads the per-module `termEnglish` maps cnxml-extract writes into
 * books/<book>/02-structure/<chapterDir>/<moduleId>-manifest.json.
 *
 * 🔴 WHY RENDER DOES NOT LOAD THIS ITSELF. cnxml-render.js's BOOKS_DIR is a bare
 * relative literal ('books/efnafraedi-2e') reassigned only inside main(), and
 * server/services/renderService.js calls renderCnxmlToHtml IN-PROCESS with
 * cwd=server/ — where 'books/…' resolves to server/books/… and misses for every
 * book. So the CALLER loads and passes, exactly as it already does for
 * `embedMap: loadEmbedMapping(book)`; renderCnxmlToHtml's own comment on that
 * option names the server-preview case and "future callers".
 *
 * 🔴 WHY PER-MODULE. `term-0000N` is OpenStax's own id in READ-ONLY 01-source and
 * it RESTARTS in every module: in lifraen-efnafraedi ch03 `term-00001` is
 * "functional group" in m00032 and "alkanes" in m00033. A chapter-flat merge gives
 * 31 of 79 (moduleId,key) pairs plausible WRONG English — a populated slot holding
 * the wrong text, which no count can see (§C82 L144).
 *
 * 🔴 WHY THERE IS NO sourceHash GUARD. `sourceHash` hashes the immutable 01-source
 * file, so both sides of such a comparison are always equal: byte-identical across
 * the committed vintages of m68700-manifest.json while segmentCount moved
 * 282 → 312. The real hazard is a WRONG-module map, and only keying on the
 * manifest's own moduleId catches it.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/** @typedef {'ok'|'empty'|'key-absent'|'moduleId-mismatch'|'unreadable'} TermManifestState */

/**
 * Decide whether a parsed manifest may be joined to `moduleId`, and why not if not.
 * Pure — the wrong-module case is unreachable on the committed corpus, so it is
 * tested here rather than by planting a file.
 *
 * @param {string} moduleId - module id taken from the FILENAME
 * @param {unknown} manifest - parsed manifest, or null when it would not parse
 * @returns {{state: TermManifestState, map: Record<string,string>|null}}
 */
export function classifyManifest(moduleId, manifest) {
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
    return { state: 'unreadable', map: null };
  }
  // ORDER MATTERS. A pre-Task-2 manifest is benign and must not be reported as a
  // mismatch; only a manifest that actually CARRIES a map has to prove its identity.
  if (!Object.prototype.hasOwnProperty.call(manifest, 'termEnglish')) {
    return { state: 'key-absent', map: null };
  }
  if (manifest.moduleId !== moduleId) {
    return { state: 'moduleId-mismatch', map: null };
  }
  const map =
    manifest.termEnglish && typeof manifest.termEnglish === 'object' ? manifest.termEnglish : {};
  return { state: Object.keys(map).length > 0 ? 'ok' : 'empty', map };
}

/**
 * Load every module's term-English map for one chapter of one book.
 *
 * @param {string} book - book slug
 * @param {string} chapterDir - ALREADY formatted ('ch03' / 'appendices'). Taken as a
 *   string on purpose: this file adds no fifth chapter-dir formatter (CLAUDE.md's
 *   two-conventions rule), and both callers already hold one.
 * @returns {{byModule: Map<string, Record<string,string>>, state: Map<string, TermManifestState>}}
 */
export function loadChapterTermEnglish(book, chapterDir) {
  const byModule = new Map();
  const state = new Map();
  const dir = path.join(REPO_ROOT, 'books', book, '02-structure', chapterDir);

  let files;
  try {
    files = fs.readdirSync(dir).filter((f) => f.endsWith('-manifest.json'));
  } catch {
    // A chapter that has never been extracted is not an error — render degrades,
    // counted, and says so. Returning empty maps is that degrade path.
    return { byModule, state };
  }

  for (const file of files.sort()) {
    const moduleId = file.replace(/-manifest\.json$/, '');
    let parsed = null;
    try {
      parsed = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf-8'));
    } catch {
      parsed = null;
    }
    const { state: s, map } = classifyManifest(moduleId, parsed);
    state.set(moduleId, s);
    if (map) byModule.set(moduleId, map);
  }
  return { byModule, state };
}
