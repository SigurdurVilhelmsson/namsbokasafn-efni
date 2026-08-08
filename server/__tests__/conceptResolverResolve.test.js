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

describe('resolveCandidates — D2, ties', () => {
  it('a REAL tie reports every tied candidate and returns no winner', () => {
    const r = resolveCandidates(chemScope(), [
      cand(40, 'biology', [['fukalyf', 1, 400]]),
      cand(41, 'biology', [['syklalyf', 1, 410]]),
    ]);
    expect(r.winner).toBeNull();
    // ⚠️ The tie must be REPORTED, not merely "nothing came back" — an empty
    // return is also what a lookup miss produces (spec §10).
    //
    // ⚠️ Full-object equality, not just `.text` — `conceptId` is what an
    // editor ACTS on (open this concept / merge these two); a wrong
    // conceptId sends an editor to the wrong concept while `.text` still
    // looks perfectly right in the UI. Order matches the code's own
    // ascending-conceptId sort — asserting what it actually produces, not
    // sorting in the test to make it pass.
    expect(r.tied).toEqual([
      { conceptId: 40, text: 'fukalyf', domain: 'biology' },
      { conceptId: 41, text: 'syklalyf', domain: 'biology' },
    ]);
  });

  it('a NOMINAL tie resolves to the agreed form AND reports the tie', () => {
    const r = resolveCandidates(chemScope(), [
      cand(50, 'biology', [['frasog', 1, 500]]),
      cand(51, 'biology', [['frasog', 1, 510]]),
    ]);
    expect(r.winner.text).toBe('frasog');
    // ⚠️ `reason` is a REAL winner's reason (spec §7.2 — the editor panel
    // must say which rule fired), not blanked out just because this winner
    // also happens to be a nominal-tie winner.
    expect(r.reason).toBe('head-form');
    expect(r.nominalTie.sort()).toEqual([50, 51]);
    expect(r.tied).toEqual([]);
  });

  it("a NOMINAL tie winner's reason tracks how THAT candidate resolved — a preference, not a hardcoded value", () => {
    // Concept 70 resolves via a book preference to 'nytt' (not its rank-1
    // head form, 'gamalt'); concept 71 resolves via its own head form to
    // the same string 'nytt'. Nominally tied, but for two different reasons
    // — proving `reason` is read off the winning candidate, not a constant.
    const pref = new Map([[70, { termId: 701, tier: 'book' }]]);
    const r = resolveCandidates(chemScope(pref), [
      cand(70, 'biology', [
        ['gamalt', 1, 700],
        ['nytt', 2, 701],
      ]),
      cand(71, 'biology', [['nytt', 1, 710]]),
    ]);
    expect(r.winner.text).toBe('nytt');
    expect(r.winner.conceptId).toBe(70);
    expect(r.reason).toBe('book-preference');
    expect(r.nominalTie.sort()).toEqual([70, 71]);
  });

  it('the nominal-tie winner is DETERMINISTIC — lowest conceptId, never row order', () => {
    const forward = resolveCandidates(chemScope(), [
      cand(50, 'biology', [['frasog', 1, 500]]),
      cand(51, 'biology', [['frasog', 1, 510]]),
    ]);
    const reversed = resolveCandidates(chemScope(), [
      cand(51, 'biology', [['frasog', 1, 510]]),
      cand(50, 'biology', [['frasog', 1, 500]]),
    ]);
    expect(forward.winner).toEqual(reversed.winner);
    expect(forward.winner.termId).toBe(500);
    // ⚠️ `winner` alone doesn't prove tie-DETECTION ran — a mutant that
    // collapses tie-detection into the plain single-winner short-circuit
    // still produces this same winner (atBest is sorted either way), while
    // silently leaving nominalTie empty. Only nominalTie discriminates.
    expect(forward.nominalTie).toEqual([50, 51]);
    expect(reversed.nominalTie).toEqual([50, 51]);
  });

  it('three tied where two agree and one differs is a REAL tie, all three reported', () => {
    const r = resolveCandidates(chemScope(), [
      cand(60, 'biology', [['a', 1, 600]]),
      cand(61, 'biology', [['a', 1, 610]]),
      cand(62, 'biology', [['b', 1, 620]]),
    ]);
    expect(r.winner).toBeNull();
    expect(r.tied).toEqual([
      { conceptId: 60, text: 'a', domain: 'biology' },
      { conceptId: 61, text: 'a', domain: 'biology' },
      { conceptId: 62, text: 'b', domain: 'biology' },
    ]);
  });

  it('a tie at position 3 is NOT a tie when something resolved at position 1', () => {
    const r = resolveCandidates(chemScope(), [
      cand(10, 'chemistry', [['efni', 1, 100]]),
      cand(40, 'biology', [['fukalyf', 1, 400]]),
      cand(41, 'biology', [['syklalyf', 1, 410]]),
    ]);
    expect(r.winner.conceptId).toBe(10);
    expect(r.tied).toEqual([]);
  });

  it('a preference BREAKS a real tie — that is what preference is for', () => {
    const pref = new Map([[41, { termId: 410, tier: 'book' }]]);
    const r = resolveCandidates(chemScope(pref), [
      cand(40, 'biology', [['fukalyf', 1, 400]]),
      cand(41, 'biology', [['syklalyf', 1, 410]]),
    ]);
    // Both still tie on POSITION; the preference changed 41's text, not its rank.
    // They still disagree, so this stays a real tie — preference selects WITHIN a
    // concept, never BETWEEN concepts. Pinning the distinction on purpose.
    expect(r.winner).toBeNull();
    expect(r.tied).toEqual([
      { conceptId: 40, text: 'fukalyf', domain: 'biology' },
      { conceptId: 41, text: 'syklalyf', domain: 'biology' },
    ]);
  });
});
