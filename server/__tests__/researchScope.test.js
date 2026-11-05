// server/__tests__/researchScope.test.js
//
// T18, PR1 half (spec §11, §5.5): the study-book allowlist is an enforceable value, a frozen
// constant in server/lib/researchScope.js. It is chemistry and only chemistry, and it must never
// hold organic (CLAUDE.md § Organic). Reads nothing from disk and writes nothing.
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { STUDY_BOOKS, isStudyBook } = require('../lib/researchScope');
const { NOT_MINTED_BOOKS } = require('../lib/servedText');
const { VALID_BOOKS } = require('../config');

describe('T18, PR1 half: the study allowlist (spec §11)', () => {
  it('is chemistry and only chemistry, frozen', () => {
    expect([...STUDY_BOOKS]).toEqual(['efnafraedi-2e']);
    expect(Object.isFrozen(STUDY_BOOKS)).toBe(true);
  });

  it('never holds organic', () => {
    expect(STUDY_BOOKS).not.toContain('lifraen-efnafraedi');
    expect(STUDY_BOOKS.filter((b) => NOT_MINTED_BOOKS.includes(b))).toEqual([]);
  });

  it('isStudyBook', () => {
    // the `true` is the control: a predicate that answered false for everything would pass the rest
    expect([
      isStudyBook('efnafraedi-2e'),
      isStudyBook('lifraen-efnafraedi'),
      isStudyBook('liffraedi-2e'),
    ]).toEqual([true, false, false]);
  });

  it('names a book the server knows (a typo control)', () => {
    for (const book of STUDY_BOOKS) expect(VALID_BOOKS).toContain(book);
  });
});
