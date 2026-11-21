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
