import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { isWholeWordAt } = require('../lib/wordBoundary');
const { foldChar } = require('../lib/caseFold');

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
    expect(/(?<![\p{L}\p{N}_])atom(?![\p{L}\p{N}_])/u.test(text)).toBe(false);
  });

  it('accepts after an astral character that is NOT a letter', () => {
    const text = '\u{1F600}atom'; // emoji, not \p{L}
    expect(isWholeWordAt(text, 2, 6)).toBe(true);
    expect(/(?<![\p{L}\p{N}_])atom(?![\p{L}\p{N}_])/u.test(text)).toBe(true);
  });

  it('steps by CODE POINT (forward) next to an astral character', () => {
    // Mirror of the backward case above: the astral character sits AFTER the
    // match, so a naive text[end] would read only the high surrogate half of
    // the pair. codePointAt(end) must read the whole code point.
    const text = 'atom\u{1D400}';
    expect(isWholeWordAt(text, 0, 4)).toBe(false);
    expect(/(?<![\p{L}\p{N}_])atom(?![\p{L}\p{N}_])/u.test(text)).toBe(false);
  });

  it('accepts before an astral character that is NOT a letter (forward)', () => {
    const text = 'atom\u{1F600}';
    expect(isWholeWordAt(text, 0, 4)).toBe(true);
    expect(/(?<![\p{L}\p{N}_])atom(?![\p{L}\p{N}_])/u.test(text)).toBe(true);
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
    expect(/(?<![\p{L}\p{N}_])Bru(?![\p{L}\p{N}_])/u.test(decomposed)).toBe(true);
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
    expect(/(?<![\p{L}\p{N}_])Bru(?![\p{L}\p{N}_])/u.test(precomposed)).toBe(false);
  });

  it('does not crash when a lone low surrogate sits at the very start of text', () => {
    // Guards wordBoundary.js's `&& i > 0` check: without it, stepping back
    // from a lone low surrogate at index 0 would compute codePointAt(-1) and
    // throw `RangeError: Invalid code point NaN` instead of returning a value.
    const text = '\uDC00atom';
    expect(isWholeWordAt(text, 1, 5)).toBe(true);
    expect(/(?<![\p{L}\p{N}_])atom(?![\p{L}\p{N}_])/u.test(text)).toBe(true);
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

  it('applies the boundary to the ORIGINAL text, never the folded copy', () => {
    // GREEK SMALL LETTER IOTA (U+03B9) folds to U+0345, a COMBINING mark, and
    // wordBoundary deliberately omits \p{M}. So a neighbour that is \p{L} in the
    // original becomes a NON-word character once folded: checking the boundary
    // against foldString(text) would match here, where production does not.
    // Built from its numeric code point, never a literal — the premise is one exact
    // code point, and this matches the String.fromCharCode convention used above.
    const a = build([[1, 'atom']]);
    const text = String.fromCharCode(0x03b9) + 'atom';
    expect(foldChar('ι')).toBe('ͅ'); // pins the premise: folds to a COMBINING mark
    expect(findFirstOccurrences(a, text).has(1)).toBe(false);
    expect(/(?<![\p{L}\p{N}_])atom(?![\p{L}\p{N}_])/u.test(text)).toBe(false);
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
