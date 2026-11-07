import path from 'path';

/**
 * Join a content-derived name onto a base directory, returning null if the
 * result would escape the base (e.g. a `..`-bearing exercise nickname or a
 * URL-decoded image filename). Defense-in-depth for F17 — these names come
 * from CNXML/rendered HTML, not a fully trusted source.
 *
 * Moved unchanged from cnxml-render.js so image-dimensions.js can share the
 * one containment check (cnxml-render imports image-dimensions, so the lib
 * module cannot import it back).
 *
 * @param {string} baseDir
 * @param {string} name
 * @returns {string|null} the resolved path inside `baseDir`, or null
 */
export function safeJoin(baseDir, name) {
  if (typeof name !== 'string' || name.length === 0) return null;
  const resolvedBase = path.resolve(baseDir);
  const candidate = path.resolve(resolvedBase, name);
  if (candidate !== resolvedBase && !candidate.startsWith(resolvedBase + path.sep)) {
    return null;
  }
  return candidate;
}
