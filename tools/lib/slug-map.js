// tools/lib/slug-map.js
/**
 * §C9 — the old→new slug map a render emits when it supersedes a page.
 *
 * CONTRACT WITH namsbokasafn-vefur: every `to` names a file that CURRENTLY EXISTS.
 * Chains are collapsed on write, so a consumer does ONE lookup — no transitive walk,
 * no cycle handling, and no redirect that lands on a page we deleted.
 *
 * Lives at `books/<slug>/05-publication/<track>/slug-map.json`: inside the tree
 * `sync-content.js` copies (it copies only `05-publication/{mt-preview,faithful}/`),
 * and at TRACK ROOT rather than in `chapters/NN/`, which the renderer's sweep empties
 * and vefur's generate-toc reads as pages.
 */
import fs from 'node:fs';
import path from 'node:path';

export const SLUG_MAP_FILENAME = 'slug-map.json';

const CONTRACT =
  'C9 — old→new so vefur can serve redirects. Every value is CURRENT: chains are ' +
  'collapsed on write, so a single lookup suffices and no transitive walk is needed.';

/** Absolute path to a book+track's map. `trackDir` is `<book>/05-publication/<track>`. */
export function slugMapPath(trackDir) {
  return path.join(trackDir, SLUG_MAP_FILENAME);
}

/**
 * Read the map, or return a fresh empty one.
 *
 * Fails SAFE on a corrupt file: losing redirect history is recoverable, aborting a
 * render is not proportionate. The next successful render rewrites the file.
 */
export function readSlugMap(mapPath, { book, track }) {
  const empty = { book, track, contract: CONTRACT, renames: {} };
  try {
    const parsed = JSON.parse(fs.readFileSync(mapPath, 'utf8'));
    if (
      !parsed ||
      typeof parsed !== 'object' ||
      typeof parsed.renames !== 'object' ||
      !parsed.renames
    ) {
      return empty;
    }
    return { book, track, contract: CONTRACT, renames: parsed.renames };
  } catch {
    return empty;
  }
}

/**
 * Record `from → to`, collapsing chains so every value stays current.
 *
 * Order matters and is the whole algorithm:
 *   1. Re-point every entry that used to end at `from` so it ends at `to`.
 *   2. Drop any entry that has become an identity (a rename that returned to its
 *      original name) — that file exists again and must not redirect.
 *   3. Add `from → to`, unless nothing moved.
 *
 * @param {object} map        as returned by readSlugMap; MUTATED and returned
 * @param {object} rename     { from, to, moduleId, recordedAt } — paths are track-relative
 */
export function recordRename(map, { from, to, moduleId, recordedAt }) {
  if (from === to) return map;

  for (const [key, entry] of Object.entries(map.renames)) {
    if (entry.to === from) map.renames[key] = { to, moduleId, recordedAt };
  }
  for (const key of Object.keys(map.renames)) {
    if (map.renames[key].to === key) delete map.renames[key];
  }

  map.renames[from] = { to, moduleId, recordedAt };
  return map;
}

/** Write the map, sorted by key so the committed diff is stable. */
export function writeSlugMap(mapPath, map) {
  const renames = {};
  for (const key of Object.keys(map.renames).sort()) renames[key] = map.renames[key];
  const payload = { book: map.book, track: map.track, contract: CONTRACT, renames };
  fs.mkdirSync(path.dirname(mapPath), { recursive: true });
  fs.writeFileSync(mapPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}
