// server/__tests__/domains.test.js
/**
 * The domain vocabulary has ONE owner.
 *
 * It existed in three independent copies until 2026-08-08 (register §C36
 * finding 5) with no shared constant and no test. All three were measured
 * clean — and nothing kept them clean. A typo'd domain is not a crash: it
 * produces a fallback level that matches nothing, so a book silently scopes to
 * less than it should while every check stays green.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { DOMAINS, DOMAIN_SET, BOOK_DOMAIN_PRIORITY } = require('../lib/domains');
const { COLLECTION_DOMAIN, conceptFromEntry } = require('../lib/conceptFromEntry');
const { DOMAINS: VERIFY_DOMAINS } = require('../scripts/verify-concept-import');

describe('domain vocabulary has exactly one owner', () => {
  it('is the seven values the spec names', () => {
    expect([...DOMAINS].sort()).toEqual(
      [
        'anatomy-physiology',
        'astronomy',
        'biology',
        'chemistry',
        'earth-science',
        'mathematics',
        'physics',
      ].sort()
    );
  });

  it('every COLLECTION_DOMAIN value is a known domain', () => {
    const unknown = Object.entries(COLLECTION_DOMAIN)
      .filter(([, d]) => !DOMAIN_SET.has(d))
      .map(([c, d]) => `${c}→${d}`);
    expect(unknown).toEqual([]);
  });

  it('every BOOK_DOMAIN_PRIORITY domain is a known domain', () => {
    const unknown = Object.entries(BOOK_DOMAIN_PRIORITY)
      .flatMap(([slug, ds]) => ds.map((d) => [slug, d]))
      .filter(([, d]) => !DOMAIN_SET.has(d))
      .map(([slug, d]) => `${slug}→${d}`);
    expect(unknown).toEqual([]);
  });

  it('the verifier does not keep its own copy', () => {
    expect(VERIFY_DOMAINS).toBe(DOMAIN_SET);
  });

  it('a book lists each domain at most once', () => {
    for (const [slug, ds] of Object.entries(BOOK_DOMAIN_PRIORITY)) {
      expect(new Set(ds).size, `${slug} repeats a domain`).toBe(ds.length);
    }
  });

  it('every book names at least one domain — a book scoped to nothing is the bug', () => {
    for (const [slug, ds] of Object.entries(BOOK_DOMAIN_PRIORITY)) {
      expect(ds.length, `${slug} has no domains`).toBeGreaterThan(0);
    }
  });
});

describe('a typo cannot enter silently', () => {
  it('conceptFromEntry throws when asked to build with an unknown domain', () => {
    expect(() =>
      conceptFromEntry(
        { words: [{ fklanguage: 'IS', word: 'x' }] },
        { collection: 'EFNAFR', domain: 'chemsitry' }
      )
    ).toThrow(/chemsitry/);
  });

  it('still builds normally for a known domain', () => {
    const built = conceptFromEntry(
      { id: 1, words: [{ fklanguage: 'IS', word: 'frumeind' }] },
      { collection: 'EFNAFR', domain: 'chemistry' }
    );
    expect(built.concept.domain).toBe('chemistry');
  });
});
