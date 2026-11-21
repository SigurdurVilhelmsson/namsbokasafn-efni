// server/__tests__/termPrefixRule.test.js
//
// §C246: which Icelandic terms the term check may accept as the START of a
// word (a closed compound such as `magnesíumklóríð` for `magnesíum`).
// Spec: docs/superpowers/specs/2026-11-21-c246-term-check-prefix-rule-design.md §3.1.
//
// The two values are enforceable values, so this test pins them; their only
// copy is server/lib/termPrefixRule.js.
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const {
  MIN_PREFIX_TERM_LENGTH,
  PREFIX_EXCLUDED_FORMS,
  prefixQualifies,
} = require('../lib/termPrefixRule');

describe('the rule values ([USER] rulings 2 and 3, 2026-11-21)', () => {
  it('sets the minimum term length to four', () => {
    expect(MIN_PREFIX_TERM_LENGTH).toBe(4);
  });

  it('excludes exactly the form merki', () => {
    expect(PREFIX_EXCLUDED_FORMS).toEqual(['merki']);
  });

  it('freezes the exclusion list', () => {
    expect(Object.isFrozen(PREFIX_EXCLUDED_FORMS)).toBe(true);
  });
});

describe('prefixQualifies', () => {
  it.each([
    // single words: the 4-code-point minimum
    ['ál', false],
    ['jón', false],
    ['glas', true],
    ['vetni', true],
    // the exclusion: exact and case-insensitive
    ['merki', false],
    ['Merki', false],
    ['formerki', true],
    // multi-word and hyphenated: judged by the last part (B3)
    ['Lewis-mynd', true],
    ['einsetulögmál Pauli', true],
    ['oxunar-afoxunarhvarf', true],
    ['sýrubindandi lyf', false],
    ['fjölatóma jón', false],
    ['upphafs-', false],
  ])('%j → %s', (text, expected) => {
    expect(prefixQualifies(text)).toBe(expected);
  });

  it.each([[''], [null], [undefined]])('nothing to judge: %j → false', (text) => {
    expect(prefixQualifies(text)).toBe(false);
  });
});

// KNOWN LIMIT, register §C247 (1): only ASCII hyphens and whitespace split a term. An en dash or a
// non-breaking hyphen is not a split character, so a term written with one is judged on its full
// length: `ál–jón` qualifies although its last part, `jón`, has three letters. Widening the split
// would change ruling 5 (B3) and is [USER]'s call; this pin makes such a change deliberate. The
// characters are built from code points so the source shows which one is meant.
describe('KNOWN LIMIT (§C247 (1)): only ASCII hyphens and whitespace split a term', () => {
  const EN_DASH = String.fromCodePoint(0x2013);
  const NB_HYPHEN = String.fromCodePoint(0x2011);

  it.each([
    ['an en dash', `ál${EN_DASH}jón`],
    ['a non-breaking hyphen', `ál${NB_HYPHEN}jón`],
  ])('a term joined by %s is judged on its full length', (_label, text) => {
    expect(prefixQualifies(text)).toBe(true);
  });

  it('control: the same term with an ASCII hyphen is judged by its last part', () => {
    expect(prefixQualifies('ál-jón')).toBe(false);
  });
});
