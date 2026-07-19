/**
 * mt-normalize.cjs — the MT-draft normalization chain, shared between the
 * editorial server (segmentParser re-exports these by reference) and the
 * corpus exporter (tools/export-corpus.js), which must reproduce the
 * editor-visible view of a segment to compute an honest postEdited flag.
 *
 * Moved verbatim from server/services/segmentParser.js (campaign item 20).
 * CommonJS so both the ESM tools (named import) and the CommonJS server
 * (sync require) can consume it — the seg-markers.cjs pattern.
 */

/**
 * Normalize hard line wraps in segment content.
 * Joins single-newline continuation lines into spaces while preserving
 * intentional paragraph breaks (double newlines).
 *
 * @param {string} text - Raw segment content
 * @returns {string} Content with hard wraps normalized
 */
function normalizeWraps(text) {
  return text.replace(/(?<!\n)\n(?!\n)/g, ' ');
}

/**
 * Unescape MT-introduced backslash escapes in segment content.
 * The malstadur.is MT service escapes markdown-like brackets:
 *   \[\[MATH:4\]\] → [[MATH:4]]
 *   \_\_term\_\_   → __term__
 *   \*bold\*       → *bold*
 *
 * The injection pipeline (cnxml-inject.js:452-457) already handles this
 * for published HTML, but the segment editor shows raw file content.
 * Unescaping here ensures editors see clean markers.
 *
 * @param {string} text - Raw segment content
 * @returns {string} Content with MT escapes removed
 */
function unescapeMtMarkers(text) {
  if (!text) return text;
  return text
    .replace(/\\\[/g, '[')
    .replace(/\\\]/g, ']')
    .replace(/\\\*/g, '*')
    .replace(/\\_/g, '_');
}

/**
 * Normalize term markers in IS content based on EN source.
 * MT engines (e.g. malstadur.is) convert __term__ to **term**.
 * This detects excess ** in IS (compared to EN) and converts them back to __.
 *
 * @param {string} enContent - EN source segment content
 * @param {string} isContent - IS translation segment content
 * @returns {string} IS content with term markers normalized
 */
// B4 note: bracket-era EN segments ([[term:text|id]]) contain no __term__
// markers, so enTermCount is 0 and this repair is a deliberate no-op for them.
function normalizeTermMarkers(enContent, isContent) {
  if (!enContent || !isContent) return isContent;

  const enTermCount = (enContent.match(/__(.+?)__/g) || []).length;
  if (enTermCount === 0) return isContent;

  const enBoldCount = (enContent.match(/\*\*(.+?)\*\*/g) || []).length;
  const isTermCount = (isContent.match(/__(.+?)__/g) || []).length;
  const isBoldCount = (isContent.match(/\*\*(.+?)\*\*/g) || []).length;

  const missingTerms = enTermCount - isTermCount;
  if (missingTerms <= 0) return isContent;

  const excessBold = isBoldCount - enBoldCount;
  if (excessBold <= 0) return isContent;

  const termsToConvert = Math.min(missingTerms, excessBold);
  let converted = 0;
  return isContent.replace(/\*\*(.+?)\*\*/g, (match, text) => {
    if (converted < termsToConvert) {
      converted++;
      return `__${text}__`;
    }
    return match;
  });
}

module.exports = { normalizeWraps, unescapeMtMarkers, normalizeTermMarkers };
