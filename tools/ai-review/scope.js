/**
 * scope.js — which chapters a ruling may act in, and whether its width is ruled yet
 * (design: docs/superpowers/specs/2026-10-26-ai-layer-scaffolding-design.md, Unit C).
 *
 * A scope has exactly three shapes:
 *   { kind: 'book' } · { kind: 'chapters', chapters: [...] } · { kind: 'exclude', chapters: [...] }
 * with chapters as the strings `chNN` / `appendices`, never integers (`0` meant both ch00 and
 * "book" in older data; Unit B converts legacy integers on read, so none reach this module).
 *
 * The status rule: a ruling whose `scopeStatus` is `proposed` admits NO operation
 * (`scope-unruled`) until [USER] rules its width. D2 (2026-10-11) ruled the CLASS of
 * exception (the `group`/`cell` homographs), not the chapters.
 *
 * Everything fails closed: a malformed scope, status or chapter token admits nothing.
 */

export const CHAPTER_DIR_RE = /^(ch\d\d|appendices)$/;
export const SCOPE_STATUSES = Object.freeze(['default', 'proposed', 'ruled']);

/** @param {unknown} value */
export const isChapterDir = (value) => typeof value === 'string' && CHAPTER_DIR_RE.test(value);

/**
 * Is `scope` one of the three shapes, with nothing extra?
 * @param {unknown} scope
 */
export function isValidScope(scope) {
  if (scope === null || typeof scope !== 'object' || Array.isArray(scope)) return false;
  const keys = Object.keys(scope).sort().join(',');
  if (scope.kind === 'book') return keys === 'kind';
  if (scope.kind === 'chapters' || scope.kind === 'exclude') {
    return (
      keys === 'chapters,kind' &&
      Array.isArray(scope.chapters) &&
      scope.chapters.every(isChapterDir)
    );
  }
  return false;
}

/**
 * Does `scope` admit `chapterDir`? False for any malformed input.
 * @param {unknown} scope
 * @param {unknown} chapterDir
 */
export function inScope(scope, chapterDir) {
  if (!isValidScope(scope) || !isChapterDir(chapterDir)) return false;
  if (scope.kind === 'book') return true;
  const listed = scope.chapters.includes(chapterDir);
  return scope.kind === 'chapters' ? listed : !listed;
}

/**
 * The gate's scope reasons for one ruling in one chapter. Empty means admitted.
 * `scope-invalid` stands alone (nothing else can be judged); otherwise `scope-unruled` and
 * `scope-excluded` are both reported when both apply, so a log shows the whole picture.
 * @param {{ scope: unknown, scopeStatus: unknown }} ruling
 * @param {string} chapterDir
 * @returns {string[]}
 */
export function scopeReasons(ruling, chapterDir) {
  if (!isValidScope(ruling?.scope) || !SCOPE_STATUSES.includes(ruling?.scopeStatus)) {
    return ['scope-invalid'];
  }
  const reasons = [];
  if (ruling.scopeStatus === 'proposed') reasons.push('scope-unruled');
  if (!inScope(ruling.scope, chapterDir)) reasons.push('scope-excluded');
  return reasons;
}
