// server/__tests__/conceptResolverResolve.test.js
/**
 * resolveCandidates is PURE: a literal Scope and a literal candidate array, no
 * database anywhere in this file. That is the point of the split.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { resolveCandidates } = require('../lib/conceptResolver');

/** chemistry(1) > physics(2) > biology(3) — efnafraedi-2e's real order. */
const chemScope = (preference = new Map()) => ({
  bookId: 1,
  chapter: 3,
  positionOf: new Map([
    ['chemistry', 1],
    ['physics', 2],
    ['biology', 3],
  ]),
  preference,
  unscoped: false,
});

const cand = (conceptId, domain, isTerms) => ({
  conceptId,
  domain,
  isTerms: isTerms.map(([text, rank, termId]) => ({ text, rank, termId })),
});

describe('resolveCandidates — term choice', () => {
  it('uses the rank-1 head form when there is no preference', () => {
    const r = resolveCandidates(chemScope(), [
      cand(10, 'chemistry', [
        ['fruma', 1, 100],
        ['sella', 2, 101],
      ]),
    ]);
    expect(r.winner).toEqual({
      conceptId: 10,
      termId: 100,
      text: 'fruma',
      domain: 'chemistry',
      position: 1,
    });
    expect(r.reason).toBe('head-form');
  });

  it('a book preference beats the head form, and says so', () => {
    const pref = new Map([[10, { termId: 101, tier: 'book' }]]);
    const r = resolveCandidates(chemScope(pref), [
      cand(10, 'chemistry', [
        ['fruma', 1, 100],
        ['sella', 2, 101],
      ]),
    ]);
    expect(r.winner.text).toBe('sella');
    expect(r.reason).toBe('book-preference');
  });

  it('a chapter preference reports chapter-preference', () => {
    const pref = new Map([[10, { termId: 101, tier: 'chapter' }]]);
    const r = resolveCandidates(chemScope(pref), [
      cand(10, 'chemistry', [
        ['fruma', 1, 100],
        ['sella', 2, 101],
      ]),
    ]);
    expect(r.reason).toBe('chapter-preference');
  });
});

describe('resolveCandidates — D1, out-of-scope is a soft badged tier', () => {
  it('separates an out-of-domain concept instead of dropping it', () => {
    const r = resolveCandidates(chemScope(), [cand(20, 'anatomy-physiology', [['taug', 1, 200]])]);
    expect(r.winner).toBeNull();
    expect(r.outOfScope).toEqual([{ conceptId: 20, text: 'taug', domain: 'anatomy-physiology' }]);
  });

  it('an in-scope winner and an out-of-scope suggestion coexist', () => {
    const r = resolveCandidates(chemScope(), [
      cand(10, 'chemistry', [['efni', 1, 100]]),
      cand(20, 'mathematics', [['stak', 1, 200]]),
    ]);
    expect(r.winner.conceptId).toBe(10);
    expect(r.outOfScope.map((o) => o.conceptId)).toEqual([20]);
  });

  it('the fallback tier is what returns pH: biology wins when chemistry has nothing', () => {
    const r = resolveCandidates(chemScope(), [cand(30, 'biology', [['syrustig', 1, 300]])]);
    expect(r.winner).toEqual({
      conceptId: 30,
      termId: 300,
      text: 'syrustig',
      domain: 'biology',
      position: 3,
    });
  });
});

describe('resolveCandidates — the term-less candidate (parent spec §6 ordering defect)', () => {
  it('a term-less chemistry concept does NOT beat a biology concept that has a word', () => {
    const r = resolveCandidates(chemScope(), [
      cand(10, 'chemistry', []), // en term exists, no 'is' term
      cand(30, 'biology', [['syrustig', 1, 300]]),
    ]);
    expect(r.winner).not.toBeNull();
    expect(r.winner.domain).toBe('biology');
  });

  it('CONTROL: with a chemistry term present, chemistry DOES win', () => {
    const r = resolveCandidates(chemScope(), [
      cand(10, 'chemistry', [['syrustig-chem', 1, 100]]),
      cand(30, 'biology', [['syrustig', 1, 300]]),
    ]);
    expect(r.winner.domain).toBe('chemistry');
  });

  it('a term-less out-of-scope concept is not listed as a suggestion either', () => {
    const r = resolveCandidates(chemScope(), [cand(20, 'mathematics', [])]);
    expect(r.outOfScope).toEqual([]);
  });
});

describe('resolveCandidates — the three empty states are distinguishable', () => {
  it('a genuine miss returns empty everything, integrity []', () => {
    const r = resolveCandidates(chemScope(), []);
    expect(r).toEqual({
      winner: null,
      reason: null,
      nominalTie: [],
      tied: [],
      outOfScope: [],
      integrity: [],
      unscoped: false,
    });
  });

  it('an unscoped scope carries its cause through, not a bare null', () => {
    const r = resolveCandidates({ unscoped: 'no-priorities' }, []);
    expect(r.unscoped).toBe('no-priorities');
    expect(r.winner).toBeNull();
  });

  it('CONTROL: a miss and a misconfiguration do not look alike', () => {
    const miss = resolveCandidates(chemScope(), []);
    const bad = resolveCandidates({ unscoped: 'unregistered' }, []);
    expect(miss.unscoped).not.toBe(bad.unscoped);
  });
});
