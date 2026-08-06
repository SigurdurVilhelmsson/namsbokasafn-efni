import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { isWholeWordAt } = require('../lib/wordBoundary');
const { foldChar } = require('../lib/caseFold');

// The inline /(?<![\p{L}\p{N}_])…(?![\p{L}\p{N}_])/iu literals below are a
// hand transcription of production's wholeWordRegex (terminologyService.js),
// which builds its lookarounds with flags 'giu'. ⚠️ Transcribe the `i` — a
// reference written /u is not production, and a reference that is not
// production cannot falsify the predicate it is supposed to check. (`g` is
// omitted deliberately: it makes .test() stateful via lastIndex, and it does
// not affect the verdict.)
describe('isWholeWordAt', () => {
  const at = (text, word) =>
    isWholeWordAt(text, text.indexOf(word), text.indexOf(word) + word.length);

  it('accepts a standalone word', () => expect(at('the mass here', 'mass')).toBe(true));
  it('rejects a word inside a longer word', () => expect(at('bitmasses', 'mass')).toBe(false));
  it('accepts at string start', () => expect(at('mass here', 'mass')).toBe(true));
  it('accepts at string end', () => expect(at('the mass', 'mass')).toBe(true));
  it('rejects when followed by a digit', () => expect(at('mass2', 'mass')).toBe(false));
  it('rejects when preceded by an underscore', () => expect(at('a_mass', 'mass')).toBe(false));
  it('accepts across punctuation', () => expect(at('(mass)', 'mass')).toBe(true));
  it('accepts across an Icelandic letter boundary correctly', () =>
    expect(at('þungi mass hér', 'mass')).toBe(true));
  it('rejects when preceded by an Icelandic letter', () => expect(at('þmass', 'mass')).toBe(false));

  it('steps by CODE POINT, not code unit, next to an astral character', () => {
    // U+1D400 is two UTF-16 units. A naive text[begin-1] reads a lone low
    // surrogate, which is never \p{L}, so the boundary would wrongly pass.
    const text = '\u{1D400}atom';
    expect(isWholeWordAt(text, 2, 6)).toBe(false);
    // and the regex it replaces agrees:
    expect(/(?<![\p{L}\p{N}_])atom(?![\p{L}\p{N}_])/iu.test(text)).toBe(false);
  });

  it('accepts after an astral character that is NOT a letter', () => {
    const text = '\u{1F600}atom'; // emoji, not \p{L}
    expect(isWholeWordAt(text, 2, 6)).toBe(true);
    expect(/(?<![\p{L}\p{N}_])atom(?![\p{L}\p{N}_])/iu.test(text)).toBe(true);
  });

  it('steps by CODE POINT (forward) next to an astral character', () => {
    // Mirror of the backward case above: the astral character sits AFTER the
    // match, so a naive text[end] would read only the high surrogate half of
    // the pair. codePointAt(end) must read the whole code point.
    const text = 'atom\u{1D400}';
    expect(isWholeWordAt(text, 0, 4)).toBe(false);
    expect(/(?<![\p{L}\p{N}_])atom(?![\p{L}\p{N}_])/iu.test(text)).toBe(false);
  });

  it('accepts before an astral character that is NOT a letter (forward)', () => {
    const text = 'atom\u{1F600}';
    expect(isWholeWordAt(text, 0, 4)).toBe(true);
    expect(/(?<![\p{L}\p{N}_])atom(?![\p{L}\p{N}_])/iu.test(text)).toBe(true);
  });

  it('reproduces the pre-existing \\p{M} omission: matches mid-grapheme in decomposed text', () => {
    // Decomposed word: 'B' 'r' 'u' + COMBINING DIAERESIS (U+0308) + 'n' 'n'.
    // The mark is built from its numeric code point via String.fromCharCode --
    // never a literal or \u-escaped combining character anywhere in this
    // source file -- so there is nothing for a prettier/editor NFC pass to
    // normalize; the source itself contains only ASCII. The normalize() check
    // below still asserts the premise at runtime, belt-and-braces.
    const decomposed = 'Bru' + String.fromCharCode(0x0308) + 'nn';
    expect(decomposed.normalize('NFC')).not.toBe(decomposed);
    const begin = decomposed.indexOf('Bru');
    expect(begin).toBe(0); // "Bru" is a literal contiguous substring here -- the mark comes after
    expect(isWholeWordAt(decomposed, begin, begin + 3)).toBe(true);
    expect(/(?<![\p{L}\p{N}_])Bru(?![\p{L}\p{N}_])/iu.test(decomposed)).toBe(true);
  });

  it('the same boundary correctly rejects in precomposed text (contrast case)', () => {
    // Precomposed word: the u-with-diaeresis is a single code point (U+00FC),
    // so this string has no literal "Bru" substring at all -- offsets 0..3
    // span "Br" + that one letter, not "B" "r" "u". Checking those same 0..3
    // offsets shows the boundary now correctly fails, because index 3 lands
    // on 'n' -- an actual \p{L} -- not a combining mark.
    const precomposed = 'Br' + String.fromCharCode(0xfc) + 'nn';
    expect(precomposed.normalize('NFC')).toBe(precomposed);
    expect(precomposed.indexOf('Bru')).toBe(-1); // confirms no literal "Bru" substring exists
    expect(isWholeWordAt(precomposed, 0, 3)).toBe(false);
    expect(/(?<![\p{L}\p{N}_])Bru(?![\p{L}\p{N}_])/iu.test(precomposed)).toBe(false);
  });

  it('does not crash when a lone low surrogate sits at the very start of text', () => {
    // Guards wordBoundary.js's `&& i > 0` check: without it, stepping back
    // from a lone low surrogate at index 0 would compute codePointAt(-1) and
    // throw `RangeError: Invalid code point NaN` instead of returning a value.
    const text = '\uDC00atom';
    expect(isWholeWordAt(text, 1, 5)).toBe(true);
    expect(/(?<![\p{L}\p{N}_])atom(?![\p{L}\p{N}_])/iu.test(text)).toBe(true);
  });

  // ── U+0345: the one code point where the `i` flag is load-bearing ──────────
  // U+0345 COMBINING GREEK YPOGEGRAMMENI case-folds to ι (a letter), so
  // production's case-insensitive [\p{L}\p{N}_] admits it while a bare /u does
  // not. Sweeping all 1,112,064 code points found EXACTLY ONE such divergence,
  // so these two tests are the complete pin for this axis — and both flanks are
  // affected, not just the leading one.
  //
  // Built with String.fromCharCode per this file's convention: no literal or
  // \u-escaped combining character ever appears in this source, so there is
  // nothing for a prettier/editor NFC pass to silently normalize away.
  const YPOGEGRAMMENI = String.fromCharCode(0x0345);

  it('treats U+0345 as a word character on the LEADING flank, as production does', () => {
    const text = YPOGEGRAMMENI + 'atom';
    // Premise: the flag sets genuinely disagree on this character.
    expect(/[\p{L}\p{N}_]/u.test(YPOGEGRAMMENI)).toBe(false);
    expect(/[\p{L}\p{N}_]/iu.test(YPOGEGRAMMENI)).toBe(true);
    // Production finds NO whole-word match: U+0345 is a word char to it.
    expect(/(?<![\p{L}\p{N}_])atom(?![\p{L}\p{N}_])/iu.test(text)).toBe(false);
    // The predicate must agree. Drop the `i` from WORD_CHAR and this returns
    // true — an OVER-MATCH production never emits.
    expect(isWholeWordAt(text, 1, 5)).toBe(false);
  });

  it('treats U+0345 as a word character on the TRAILING flank, as production does', () => {
    // Mirror of the above. ⚠️ This side matters independently: an early review
    // of this defect reported the trailing flank as identical, and it is not.
    const text = 'atom' + YPOGEGRAMMENI;
    expect(/(?<![\p{L}\p{N}_])atom(?![\p{L}\p{N}_])/iu.test(text)).toBe(false);
    expect(isWholeWordAt(text, 0, 4)).toBe(false);
  });

  it('does NOT step back over an UNPAIRED low surrogate — a real pair is required', () => {
    // ⚠️ A low surrogate is not proof of a surrogate pair. Here an unpaired
    // U+DC00 sits between 'a' and the match, so the code point immediately
    // before 'atom' IS that lone surrogate — never \p{L} — and production
    // matches at index 2. Stepping back unconditionally reads 'a' at index 0
    // instead, a word char, and DROPS the term.
    //
    // ⚠️ This is an UNDER-match — the OPPOSITE direction from the two U+0345
    // tests above, which over-match. The two bugs are independent and lived
    // three lines apart in the same function; fixing either did not fix the
    // other. The contrast case (a REAL pair, which MUST still step back) is
    // the '\u{1D400}atom' test higher up, which expects false.
    const text = 'a' + String.fromCharCode(0xdc00) + 'atom rest';
    const m = /(?<![\p{L}\p{N}_])atom(?![\p{L}\p{N}_])/iu.exec(text);
    expect(m && m.index).toBe(2); // production's verdict
    expect(isWholeWordAt(text, 2, 6)).toBe(true); // the predicate must agree
  });
});

const { buildTermAutomaton, findFirstOccurrences } = require('../lib/termAutomaton');

const build = (pairs) =>
  buildTermAutomaton(pairs.map(([headwordId, english]) => ({ headwordId, english })));

describe('findFirstOccurrences — THE INVARIANT', () => {
  it('takes the EARLIEST WHOLE-WORD occurrence, filtering before reducing', () => {
    // Three occurrences of "mass" (verified against the automaton: 0, 26, 37);
    // the middle one is interior to "bitmasses".
    // filter-then-earliest => 0.  last-wins (`>=`, or an unconditional set) => 37.
    // ⚠️ This text does NOT distinguish earliest-then-filter: its earliest RAW hit is
    // also 0, so it passes here. The NEXT test is the one that catches that reduction.
    // The invariant is pinned by the two tests JOINTLY, never by this one alone.
    const a = build([[1, 'mass']]);
    const text = 'mass spectrometry uses bitmasses and mass units';
    expect(findFirstOccurrences(a, text).get(1)).toEqual({ index: 0, length: 4 });
  });

  it('finds a later occurrence when the FIRST raw hit is not whole-word', () => {
    const a = build([[1, 'mass']]);
    const text = 'bitmasses contain mass';
    expect(findFirstOccurrences(a, text).get(1)).toEqual({ index: 18, length: 4 });
  });

  it('reports nothing when every occurrence is interior', () => {
    const a = build([[1, 'mass']]);
    expect(findFirstOccurrences(a, 'bitmasses and bitmasses').has(1)).toBe(false);
  });

  it('returns overlapping terms independently — the tiler decides, not the automaton', () => {
    const a = build([
      [1, 'atomic mass'],
      [2, 'mass'],
    ]);
    const found = findFirstOccurrences(a, 'The atomic mass unit is defined.');
    expect(found.get(1)).toEqual({ index: 4, length: 11 });
    expect(found.get(2)).toEqual({ index: 11, length: 4 });
  });

  it('is case-insensitive via folding, with offsets into the ORIGINAL string', () => {
    const a = build([[1, 'mass']]);
    const text = 'The MASS is large.';
    expect(findFirstOccurrences(a, text).get(1)).toEqual({ index: 4, length: 4 });
    expect(text.slice(4, 8)).toBe('MASS');
  });

  it('gives every headword sharing one english the SAME position', () => {
    // UNIQUE(english, pos) permits this; production has zero today (spec §4.1.1),
    // so this is a guard against a schema-permitted state, not observed behaviour.
    const a = build([
      [1, 'bond'],
      [2, 'bond'],
    ]);
    const found = findFirstOccurrences(a, 'The bond is strong.');
    expect(found.get(1)).toEqual({ index: 4, length: 4 });
    expect(found.get(2)).toEqual({ index: 4, length: 4 });
  });

  it('matches Icelandic headwords case-insensitively', () => {
    const a = build([[1, 'þungi']]);
    expect(findFirstOccurrences(a, 'Þungi hlutarins.').get(1)).toEqual({ index: 0, length: 5 });
  });

  it('rejects a match whose neighbour is a letter that case-folds to a combining mark', () => {
    // GREEK SMALL LETTER IOTA (U+03B9) folds to U+0345, a COMBINING mark.
    //
    // ⚠️ RENAMED AND RE-SCOPED. This test was called "applies the boundary to the
    // ORIGINAL text, never the folded copy", and under the old bare-/u WORD_CHAR
    // it really did prove that: U+0345 was then a NON-word character, so running
    // the boundary on foldString(text) would have matched where the original does
    // not. WORD_CHAR now carries the `i` flag production has always had (flags
    // 'giu' — see wordBoundary.js), which closes the class under case folding;
    // foldString is length-stable; so isWholeWordAt now returns the SAME answer on
    // the folded copy as on the original, for EVERY input. Fold-invariance is a
    // theorem, not a coincidence — a sweep of all 1,112,064 code points found ZERO
    // fixtures that could still tell the two apart. So the old name promised a
    // discrimination no test can make, and keeping it would have left a
    // vacuous-but-green guard behind.
    //
    // What survives is the OUTCOME guard below: an iota neighbour must block the
    // match. The `i` flag it now depends on is pinned directly by the two U+0345
    // tests in the isWholeWordAt block above.
    //
    // Fixtures are built from numeric code points, never literals, per this file's
    // convention — nothing here for an NFC pass to silently mangle.
    const a = build([[1, 'atom']]);
    const text = String.fromCharCode(0x03b9) + 'atom';
    // Pins the premise this test's reasoning depends on: foldChar really does fold
    // iota to a combining mark.
    expect(foldChar(String.fromCharCode(0x03b9))).toBe(String.fromCharCode(0x0345));
    expect(findFirstOccurrences(a, text).has(1)).toBe(false);
    expect(/(?<![\p{L}\p{N}_])atom(?![\p{L}\p{N}_])/iu.test(text)).toBe(false);
  });

  it('recovers the earliest span when one headword reaches two keywords', () => {
    // matchInText emits hits by END ascending, so 'b' (begin 2) arrives BEFORE
    // 'a b c' (begin 0). Strictly-less is what recovers the 0 — this is the test
    // that forbids simplifying the reduce to `if (existing === undefined)`.
    const a = build([
      [1, 'b'],
      [1, 'a b c'],
    ]);
    expect(findFirstOccurrences(a, 'a b c').get(1)).toEqual({ index: 0, length: 5 });
  });
});

describe('buildTermAutomaton — degenerate input parity with wholeWordRegex', () => {
  it('EXCLUDES falsy english, which would otherwise match zero-width everywhere', () => {
    // wholeWordRegex maps falsy to /(?!)/ — matches nothing (terminologyService.js:1886).
    // The automaton instead returns a zero-width hit at EVERY position.
    //
    // ⚠️ The haystack MUST contain a position flanked by two NON-word characters,
    // hence the parens. In 'an acid here' every one of the 13 zero-width hits is
    // rejected by the boundary filter anyway, so the term is dropped even without the
    // build-time guard — the assertion then holds for the wrong reason and deleting
    // `if (!english) continue` survives. In 'an acid (here)' the zero-width hits at 8
    // and 14 DO pass the boundary, so the guard is what keeps headword 1 out.
    const a = build([
      [1, ''],
      [2, 'acid'],
    ]);
    const found = findFirstOccurrences(a, 'an acid (here)');
    expect(found.has(1)).toBe(false);
    expect(found.get(2)).toEqual({ index: 3, length: 4 });
  });

  it('INCLUDES whitespace-only english, which today does match a lone space', () => {
    // ' ' passes the !english guards at :278/:985/:1074; only :1116 trims, so it must
    // NOT be dropped at build time the way falsy english is.
    //
    // ⚠️ The haystack MUST flank the space with non-word characters. A space between
    // letters ('a b') is NOT a whole-word match — the \p{L} lookbehind fails on 'a' —
    // so 'a b' asserts nothing here and makes this test fail. Verified against the real
    // wholeWordRegex (terminologyService.js:1884): '( )' -> index 1, 'a b' -> no match.
    const a = build([[1, ' ']]);
    expect(findFirstOccurrences(a, '( )').get(1)).toEqual({ index: 1, length: 1 });
  });

  it('handles an empty haystack and an empty term list', () => {
    expect(findFirstOccurrences(build([[1, 'acid']]), '').size).toBe(0);
    expect(findFirstOccurrences(build([]), 'acid').size).toBe(0);
  });

  it('handles a term longer than the haystack', () => {
    expect(findFirstOccurrences(build([[1, 'acid anhydride']]), 'acid').size).toBe(0);
  });
});
