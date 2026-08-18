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

/**
 * The map's filename is TRACK-QUALIFIED, and that is load-bearing rather than cosmetic.
 *
 * 🔴 WHY. `namsbokasafn-vefur` FLATTENS both publication tracks into one directory
 * (`static/content/<book>/`): `mt-preview` is mirrored first, then `faithful` is copied on top.
 * Its overlay filter has no branch for a track-root file, so a single `slug-map.json` from the
 * faithful track would be copied over the mt-preview one with `force: true` — and
 * `pipelineService.runRender` defaults to `track = 'faithful'`, so an ordinary editor republish is
 * the colliding writer. Qualifying the name means both maps arrive intact and the SYNCED tree is
 * self-describing: a consumer needs no access to this repo to know which track a map describes.
 *
 * ⚠️ The map is NOT regenerable. Its entries are recorded once, at the moment a prune happens;
 * re-rendering a chapter that no longer has a duplicate records nothing. Treat it as data.
 *
 * @param {string} track publication track, e.g. 'mt-preview' or 'faithful'
 * @returns {string} e.g. 'slug-map.mt-preview.json'
 */
export function slugMapFilename(track) {
  // This value is interpolated into a filename, so it is validated rather than trusted: `track`
  // arrives from a CLI flag, and a separator or `..` here would place the map outside trackDir.
  if (typeof track !== 'string' || !/^[a-z0-9][a-z0-9-]*$/.test(track)) {
    throw new Error(
      `slug-map: refusing to build a filename from an unsafe track name ${JSON.stringify(track)}. ` +
        `Expected lowercase alphanumerics and hyphens, e.g. 'mt-preview'.`
    );
  }
  return `slug-map.${track}.json`;
}

const CONTRACT =
  'C9 — old→new so vefur can serve redirects. Every value is CURRENT: chains are ' +
  'collapsed on write, so a single lookup suffices and no transitive walk is needed. ' +
  'SCOPE: this map describes ONE track of ONE book. The reader site flattens both tracks into ' +
  "one directory, so a consumer must read each track's map separately and reconcile them " +
  "itself; a `to` here can also be superseded at the destination by the reader site's own " +
  'overlay pruning.';

/** Absolute path to a book+track's map. `trackDir` is `<book>/05-publication/<track>`. */
export function slugMapPath(trackDir, track) {
  return path.join(trackDir, slugMapFilename(track));
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
      !parsed.renames ||
      Array.isArray(parsed.renames)
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
 *   2. Drop any entry KEYED by `to` — `to` names a file that is live as of this
 *      rename (freshly created, or a freed slug this rename is reclaiming), so no
 *      entry may go on redirecting away from it. An identity (a rename that returned
 *      to its original name) is just the case where step 1 repointed `renames[to]`
 *      to itself; this same guard drops it, so it needs no separate handling.
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
  delete map.renames[to];

  map.renames[from] = { to, moduleId, recordedAt };
  return map;
}

/**
 * Write the map, sorted by key so the committed diff is stable.
 *
 * Atomic: writes to `<mapPath>.tmp` then renames over the destination, so a process
 * killed mid-write (e.g. SIGINT) never leaves a truncated/zero-length `slug-map.json`
 * on disk — `readSlugMap` would silently treat that as an empty map and the next
 * render would rewrite it with only its own entry, losing every prior rename.
 */
export function writeSlugMap(mapPath, map) {
  const renames = {};
  for (const key of Object.keys(map.renames).sort()) renames[key] = map.renames[key];
  const payload = { book: map.book, track: map.track, contract: CONTRACT, renames };
  fs.mkdirSync(path.dirname(mapPath), { recursive: true });
  const tmpPath = `${mapPath}.tmp`;
  fs.writeFileSync(tmpPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  fs.renameSync(tmpPath, mapPath);
}
