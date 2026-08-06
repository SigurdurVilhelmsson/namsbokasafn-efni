/**
 * Whole-word boundary test, byte-equivalent to the lookarounds in
 * terminologyService.wholeWordRegex:
 *   (?<![\p{L}\p{N}_]) ... (?![\p{L}\p{N}_])   with the iu flags
 *
 * Applied to the ORIGINAL text, never the folded copy.
 *
 * ⚠️ The `i` is LOAD-BEARING, not decoration. Production builds that regex with
 * flags 'giu', so its class is CASE-INSENSITIVE. Exactly ONE code point in all of
 * Unicode is admitted to [\p{L}\p{N}_] by `i` and rejected without it:
 * U+0345 COMBINING GREEK YPOGEGRAMMENI, which case-folds to ι, a letter. Verified
 * by sweeping all 1,112,064 code points — U+0345 is the only divergence. Writing
 * this class with a bare /u makes the predicate OVER-MATCH production on BOTH
 * flanks: a U+0345 neighbour ends the word here but not there. Pinned, both
 * flanks, in termAutomaton.test.js.
 *
 * A consequence worth knowing: with `i` the class is closed under case folding,
 * and foldString is length-stable, so this predicate returns the SAME answer on
 * the folded copy as on the original. That is a theorem, not a coincidence — so
 * no test can distinguish the two by boundary outcome alone.
 *
 * NOTE the deliberate omission of \p{M}: this reproduces a PRE-EXISTING quirk
 * where the boundary succeeds mid-grapheme, so "Bru" matches decomposed "Brünn"
 * (U+0075 U+0308) but not precomposed "Brünn". Preserved on purpose — changing it
 * would be a behaviour change outside C24's scope. ⚠️ The exclusion is "marks,
 * EXCEPT U+0345": that one mark case-folds to a letter, so the `i` flag above
 * admits it to the class and the boundary does NOT succeed beside it. Production
 * does the same, which is exactly why the `i` has to be here.
 */
const WORD_CHAR = /[\p{L}\p{N}_]/iu;

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
