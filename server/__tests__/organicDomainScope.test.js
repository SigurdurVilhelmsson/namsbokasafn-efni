/**
 * §C119 [USER] ruling 2026-09-04: organic is CHEMISTRY-ONLY.
 *
 * The biology and physics fallback tiers put 872 biology and 475 physics
 * headwords into an organic chemistry textbook's glossary. A full-coverage
 * adversarial audit of the 543 single-word non-chemistry additions confirmed
 * 119 harmful — `ants -> maurar` firing 180 times, 179 of them on
 * reactants/plants/constants/locants, and `activate -> örva` matching
 * `deactivate` and so inverting the chemistry in the electrophilic-aromatic-
 * substitution chapter.
 *
 * THIS TEST EXISTS BECAUSE THE SAME TRIM HAS ALREADY BEEN REVERTED ONCE. Made
 * in SQL it lasted 102 seconds — migration 047 re-asserts this table from
 * domains.js on every boot. domains.js is the only place it survives, so the
 * ruling is pinned here rather than left as a value someone may "restore" for
 * symmetry with the other books.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { BOOK_DOMAIN_PRIORITY } = require('../lib/domains.js');

describe('organic domain scope (§C119 [USER] ruling)', () => {
  it('is chemistry only', () => {
    expect([...BOOK_DOMAIN_PRIORITY['lifraen-efnafraedi']]).toEqual(['chemistry']);
  });

  it('carries no biology fallback', () => {
    expect(BOOK_DOMAIN_PRIORITY['lifraen-efnafraedi']).not.toContain('biology');
  });

  it('carries no physics fallback', () => {
    expect(BOOK_DOMAIN_PRIORITY['lifraen-efnafraedi']).not.toContain('physics');
  });

  // CONTROL. Without this the assertions above would also pass if the map were
  // emptied or the key renamed — and the sibling book proves the fallback
  // mechanism itself is untouched, so this is a scoping decision for ONE book
  // rather than a change to how scoping works.
  it('CONTROL: the other chemistry book keeps its fallback tiers', () => {
    expect([...BOOK_DOMAIN_PRIORITY['efnafraedi-2e']]).toEqual(['chemistry', 'physics', 'biology']);
  });
});
