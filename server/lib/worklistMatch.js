/**
 * The text rules of the book glossary worklist (design §5.5): whole-word
 * search over English and Icelandic segment text. Pure: no database, no fs.
 *
 * Case folding goes through the regex `iu` flags, never `toLowerCase()`, which
 * is not length-stable, so every offset returned indexes the ORIGINAL text.
 */
const { isWholeWordAt } = require('./wordBoundary');
const { isSymbolShaped } = require('./conceptMatcher');

const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * The earliest whole-word occurrence of any word (ties: the longer).
 * @param {string} text
 * @param {string[]} words empty entries are skipped
 * @param {{exactCase: boolean}} opts exactCase true matches case-sensitively
 * @returns {{index: number, length: number} | null}
 */
function findWholeWord(text, words, { exactCase }) {
  let best = null;
  for (const word of words) {
    if (!word) continue;
    const re = new RegExp(escapeRegExp(word), exactCase ? 'gu' : 'giu');
    let m;
    while ((m = re.exec(text)) !== null) {
      const index = m.index;
      const length = m[0].length;
      if (isWholeWordAt(text, index, index + length)) {
        if (!best || index < best.index || (index === best.index && length > best.length)) {
          best = { index, length };
        }
        break;
      }
      re.lastIndex = index + 1;
    }
  }
  return best;
}

/**
 * The first English form found in the text. A symbol-shaped form matches its
 * own case only (design §5.5: the matcher's rule).
 * @param {string} enText
 * @param {string[]} forms
 * @returns {string | null}
 */
function englishHit(enText, forms) {
  for (const form of forms) {
    if (findWholeWord(enText, [form], { exactCase: isSymbolShaped(form) })) return form;
  }
  return null;
}

/**
 * A segment matches when its English holds one of the forms AND its Icelandic
 * holds one of the old words. A segment whose Icelandic also holds the change's
 * new Icelandic (whole word, any case) is already fixed and does not match
 * (design 2026-11-20, second AMENDED block; register §C244 M8). A null or
 * absent `newIcelandic` (a removal) never skips.
 * @param {{enContent: string, isContent: string}} segment
 * @param {{english: string[], oldForms: string[], newIcelandic?: string | null}} words
 * @returns {null | {english: string, index: number, length: number}}
 */
function matchSegment({ enContent, isContent }, { english, oldForms, newIcelandic }) {
  const hit = englishHit(enContent, english);
  if (hit === null) return null;
  if (newIcelandic && findWholeWord(isContent, [newIcelandic], { exactCase: false })) return null;
  const is = findWholeWord(isContent, oldForms, { exactCase: false });
  if (is === null) return null;
  return { english: hit, index: is.index, length: is.length };
}

/**
 * A window of text around a match, as text plus offsets (never HTML).
 * @param {string} text
 * @param {number} index match start in `text`
 * @param {number} length match length
 * @param {number} [radius=60] characters kept each side
 * @returns {{text: string, start: number, length: number, cutBefore: boolean, cutAfter: boolean}}
 *   `start` is the match's offset inside the excerpt's `text`
 */
function excerptOf(text, index, length, radius = 60) {
  const from = Math.max(0, index - radius);
  const to = Math.min(text.length, index + length + radius);
  return {
    text: text.slice(from, to),
    start: index - from,
    length,
    cutBefore: from > 0,
    cutAfter: to < text.length,
  };
}

module.exports = { findWholeWord, englishHit, matchSegment, excerptOf };
