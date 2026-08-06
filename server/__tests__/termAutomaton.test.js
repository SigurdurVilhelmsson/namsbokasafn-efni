import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { isWholeWordAt } = require('../lib/wordBoundary');

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
