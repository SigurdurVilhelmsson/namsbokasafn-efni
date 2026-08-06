/**
 * Whole-word boundary test, byte-equivalent to the lookarounds in
 * terminologyService.wholeWordRegex:
 *   (?<![\p{L}\p{N}_]) ... (?![\p{L}\p{N}_])   with the u flag
 *
 * Applied to the ORIGINAL text, never the folded copy.
 *
 * NOTE the deliberate omission of \p{M}: this reproduces a PRE-EXISTING quirk
 * where the boundary succeeds mid-grapheme, so "Bru" matches decomposed "Brünn"
 * (U+0075 U+0308) but not precomposed "Brünn". Preserved on purpose — changing it
 * would be a behaviour change outside C24's scope.
 */
const WORD_CHAR = /[\p{L}\p{N}_]/u;

/** @param {number} begin inclusive @param {number} end exclusive */
function isWholeWordAt(text, begin, end) {
  if (begin > 0) {
    // Step back one CODE POINT: if text[begin-1] is a low surrogate, the code
    // point starts at begin-2. Reading the lone surrogate would never match
    // \p{L} and would wrongly pass the boundary.
    let i = begin - 1;
    const unit = text.charCodeAt(i);
    if (unit >= 0xdc00 && unit <= 0xdfff && i > 0) i -= 1;
    if (WORD_CHAR.test(String.fromCodePoint(text.codePointAt(i)))) return false;
  }
  if (end < text.length) {
    if (WORD_CHAR.test(String.fromCodePoint(text.codePointAt(end)))) return false;
  }
  return true;
}

module.exports = { isWholeWordAt };
