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
    // '𝐀' is two UTF-16 units. A naive text[begin-1] reads a lone low surrogate,
    // which is never \p{L}, so the boundary would wrongly pass.
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
});
