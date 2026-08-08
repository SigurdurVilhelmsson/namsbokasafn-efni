// server/__tests__/conceptResolverMutation.test.js
/**
 * Each case here perturbs ONE input the resolver branches on and asserts the
 * output changes. If a perturbation leaves the result identical, that field is
 * either not load-bearing or not observed — and §C20 is the record of how
 * expensive it is to not know which.
 *
 * These are not redundant with the behaviour tests: those assert what the code
 * does, these assert that specific inputs MATTER.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { resolveCandidates } = require('../lib/conceptResolver');

const scope = (preference = new Map()) => ({
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

describe('mutation controls', () => {
  it('RANK matters: swapping rank 1 and 2 changes the resolved term', () => {
    const a = resolveCandidates(scope(), [
      cand(10, 'chemistry', [
        ['fyrsta', 1, 100],
        ['onnur', 2, 101],
      ]),
    ]);
    const b = resolveCandidates(scope(), [
      cand(10, 'chemistry', [
        ['onnur', 1, 101],
        ['fyrsta', 2, 100],
      ]),
    ]);
    expect(a.winner.text).toBe('fyrsta');
    expect(b.winner.text).toBe('onnur');
    expect(a.winner.text).not.toBe(b.winner.text);
  });

  it('POSITION matters: reordering the domain priority changes the winner', () => {
    const candidates = [
      cand(10, 'chemistry', [['efna', 1, 100]]),
      cand(30, 'biology', [['lif', 1, 300]]),
    ];
    const chemFirst = resolveCandidates(scope(), candidates);
    const bioFirst = resolveCandidates(
      {
        ...scope(),
        positionOf: new Map([
          ['biology', 1],
          ['chemistry', 2],
        ]),
      },
      candidates
    );
    expect(chemFirst.winner.domain).toBe('chemistry');
    expect(bioFirst.winner.domain).toBe('biology');
  });

  it('PREFERENCE TIER matters: the same termId reports a different reason', () => {
    const c = [
      cand(10, 'chemistry', [
        ['a', 1, 100],
        ['b', 2, 101],
      ]),
    ];
    const asBook = resolveCandidates(scope(new Map([[10, { termId: 101, tier: 'book' }]])), c);
    const asChapter = resolveCandidates(
      scope(new Map([[10, { termId: 101, tier: 'chapter' }]])),
      c
    );
    expect(asBook.reason).toBe('book-preference');
    expect(asChapter.reason).toBe('chapter-preference');
  });

  it('THE TERM-LESS FILTER matters: removing chemistry’s term moves the winner to biology', () => {
    const withTerm = resolveCandidates(scope(), [
      cand(10, 'chemistry', [['efna', 1, 100]]),
      cand(30, 'biology', [['lif', 1, 300]]),
    ]);
    const withoutTerm = resolveCandidates(scope(), [
      cand(10, 'chemistry', []),
      cand(30, 'biology', [['lif', 1, 300]]),
    ]);
    expect(withTerm.winner.domain).toBe('chemistry');
    expect(withoutTerm.winner.domain).toBe('biology');
  });

  it('THE TIE TEXT COMPARISON matters: changing one character flips nominal to real', () => {
    const agree = resolveCandidates(scope(), [
      cand(50, 'biology', [['frasog', 1, 500]]),
      cand(51, 'biology', [['frasog', 1, 510]]),
    ]);
    const differ = resolveCandidates(scope(), [
      cand(50, 'biology', [['frasog', 1, 500]]),
      cand(51, 'biology', [['frasogn', 1, 510]]),
    ]);
    expect(agree.winner).not.toBeNull();
    expect(agree.nominalTie).toHaveLength(2);
    expect(differ.winner).toBeNull();
    expect(differ.tied).toHaveLength(2);
  });

  it('CANDIDATE ORDER does NOT matter — the one input that must not change the answer', () => {
    // A tie at the WINNING position is required here. With a single, unique
    // position winner (an earlier version of this test had only `a` vs `b`,
    // chemistry vs biology, never tied) `atBest` never holds more than one
    // element and `.sort((a, b) => a.conceptId - b.conceptId)` is never
    // reached — a mutant that deletes that sort left the old version of this
    // test green. Two chemistry candidates share the winning position (1)
    // and the same head-form text ('efna'), forcing the nominal-tie path
    // (and its sort) to run; biology (position 3) still always loses,
    // preserving the original clear-winner contrast.
    const a = cand(10, 'chemistry', [['efna', 1, 100]]);
    const c = cand(11, 'chemistry', [['efna', 1, 110]]);
    const b = cand(30, 'biology', [['lif', 1, 300]]);
    const forward = resolveCandidates(scope(), [a, c, b]);
    const reversed = resolveCandidates(scope(), [b, c, a]);
    expect(forward).toEqual(reversed);
    // Pin the tie-path shape directly too — toEqual alone would also pass if
    // both sides independently short-circuited to the same wrong answer.
    expect(forward.winner.conceptId).toBe(10);
    expect(forward.nominalTie).toEqual([10, 11]);
  });
});
