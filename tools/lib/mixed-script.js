/**
 * mixed-script.js — find words that mix Latin and Cyrillic letters (vefur
 * request H4, register §C201).
 *
 * Cyrillic а, е, о, р, с, х and others look like Latin letters, so a word such as
 * "bóрата" (its last four letters Cyrillic) reads correctly on screen and is
 * still wrong: search misses it, and a student copies it into a flashcard.
 * Only a MIXED word is reported. A word written wholly in Cyrillic is a
 * different thing (a quoted Russian name, say) and is left alone.
 */

const WORD = /[\p{L}\p{M}]+/gu;
const LATIN = /\p{Script=Latin}/u;
const CYRILLIC = /\p{Script=Cyrillic}/u;

/**
 * @param {string} text - rendered HTML or any text
 * @returns {string[]} each mixed-script word, in order of appearance
 */
export function findMixedScriptWords(text) {
  const out = [];
  for (const m of String(text ?? '').matchAll(WORD)) {
    if (CYRILLIC.test(m[0]) && LATIN.test(m[0])) out.push(m[0]);
  }
  return out;
}
