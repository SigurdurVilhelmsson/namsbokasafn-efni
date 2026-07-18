/**
 * Canonical chapter-label conversion for the appendices chapter (item 14,
 * audit Batch G — findings 17+23).
 *
 * CONTRACT: server memory and every DB column carry the NUMBER -1 for the
 * appendices chapter. The WORD 'appendices' exists at exactly two
 * boundaries: on-disk directory names and CLI --chapter argv. Conversion
 * happens only at those boundaries, through this module — never inline.
 *
 * This module only translates dialects. Bounds (1..MAX_CHAPTERS, rejecting
 * 0, etc.) remain each caller's policy: valid chapter sets differ per route
 * and chapter 0 (front-matter, ch00) is real.
 */

/**
 * Normalize any chapter dialect to the canonical integer.
 * 'appendices' | '-1' | -1 → -1 ; '3' | 3 → 3 ; anything else → null.
 * Callers at HTTP boundaries map null to a 400; internal callers treat
 * null as a programmer error and throw.
 *
 * @param {number|string} value
 * @returns {number|null}
 */
function normalizeChapter(value) {
  if (value === 'appendices') return -1;
  if (typeof value === 'number') return Number.isInteger(value) ? value : null;
  if (typeof value === 'string' && /^-?\d+$/.test(value.trim())) {
    return parseInt(value.trim(), 10);
  }
  return null;
}

/**
 * Directory name for a canonical chapter number: -1 → 'appendices', N → 'chNN'.
 * @param {number} chapter
 * @returns {string}
 */
function chapterDir(chapter) {
  return chapter === -1 ? 'appendices' : `ch${String(chapter).padStart(2, '0')}`;
}

/**
 * CLI --chapter argv value for a canonical chapter number: -1 → 'appendices',
 * N → 'N' (matches tools/lib/parseArgs CHAPTER_OPTION, which passes the word
 * through and parseInt's everything else).
 * @param {number} chapter
 * @returns {string}
 */
function cliChapterArg(chapter) {
  return chapter === -1 ? 'appendices' : String(chapter);
}

module.exports = { normalizeChapter, chapterDir, cliChapterArg };
