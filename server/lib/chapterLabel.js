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

/**
 * Chapter number for an on-disk chapter directory name, or null if the name is
 * not a chapter dir. 'appendices' → -1 ; 'chNN' → N ; anything else → null.
 * Replaces the fragile `parseInt(dir.replace('ch',''), 10)` idiom (which
 * NaN-maps 'appendices' and mis-parses non-ch dirs).
 * @param {string} dir
 * @returns {number|null}
 */
function chapterFromDir(dir) {
  if (dir === 'appendices') return -1;
  const m = /^ch(\d{1,2})$/.exec(dir);
  return m ? parseInt(m[1], 10) : null;
}

/**
 * Sort comparator ordering numeric chapters ascending with the appendices
 * chapter (-1) placed AFTER all non-negative chapters. Mirrors the ordering in
 * tools/lib/update-translation-errors.js.
 * @param {number} a
 * @param {number} b
 * @returns {number}
 */
function compareChapters(a, b) {
  if (a === -1) return b === -1 ? 0 : 1;
  if (b === -1) return -1;
  return a - b;
}

module.exports = { normalizeChapter, chapterDir, cliChapterArg, chapterFromDir, compareChapters };
