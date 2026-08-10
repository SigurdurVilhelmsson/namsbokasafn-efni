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

  // ⚠️ RE-KEYED 2026-08-09 (B4a): the preference map is keyed on the LOWERCASED
  // ENGLISH STRING, not the conceptId, and `english` is the 4th argument.
  it('PREFERENCE TIER matters: the same termId reports a different reason', () => {
    const c = [
      cand(10, 'chemistry', [
        ['a', 1, 100],
        ['b', 2, 101],
      ]),
    ];
    const asBook = resolveCandidates(
      scope(new Map([['thing', { termId: 101, tier: 'book' }]])),
      c,
      [],
      'thing'
    );
    const asChapter = resolveCandidates(
      scope(new Map([['thing', { termId: 101, tier: 'chapter' }]])),
      c,
      [],
      'thing'
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

/**
 * B4a / §C38 — the override's own mutation table. Each case names the exact line
 * of `applyPreference` it kills, and each was CONFIRMED red by breaking that
 * line and re-running this file (see task-6-report.md for the verbatim output).
 * A mutation table asserted in prose is not a measurement.
 */
describe('mutation controls — the preference override', () => {
  const accCands = [
    cand(1, 'physics', [['nákvæmni', 1, 10]]),
    cand(2, 'biology', [['hittni', 1, 20]]),
  ];

  // MUTATION: `return result` unchanged when a preference is found.
  it('THE OVERRIDE ITSELF matters: adding a preference row moves the winner', () => {
    const without = resolveCandidates(scope(), accCands, [], 'accuracy');
    const with_ = resolveCandidates(
      scope(new Map([['accuracy', { termId: 20, tier: 'book' }]])),
      accCands,
      [],
      'accuracy'
    );
    expect(without.winner.text).toBe('nákvæmni');
    expect(with_.winner.text).toBe('hittni');
    expect(without.winner.text).not.toBe(with_.winner.text);
  });

  // MUTATION: drop `.toLowerCase()` from the map lookup. The Map is keyed
  // lowercase by buildPreferenceMap; a raw-string lookup finds nothing.
  it('CASE FOLDING matters: the same row is found under any casing of the string', () => {
    const pref = new Map([['accuracy', { termId: 20, tier: 'book' }]]);
    const lower = resolveCandidates(scope(pref), accCands, [], 'accuracy');
    const mixed = resolveCandidates(scope(pref), accCands, [], 'Accuracy');
    expect(mixed.winner.text).toBe('hittni');
    expect(mixed.winner).toEqual(lower.winner);
  });

  // MUTATION: search only `inScope` for the owner. The out-of-scope concept is
  // then never found, and the fault reported is the WRONG one — which reads as
  // "we noticed something" while naming the wrong remedy.
  it('THE OWNER SEARCH BREADTH matters: an out-of-scope owner is FOUND, and named as such', () => {
    const withMath = [...accCands, cand(3, 'mathematics', [['stæ', 1, 30]])];
    const s = scope(new Map([['accuracy', { termId: 30, tier: 'book' }]]));
    // stmts present and answering "the row exists", so an inScope-only search
    // would report `preference-not-a-candidate` — plausible, and wrong.
    s.stmts = { termById: { get: () => ({ term_id: 30, concept_id: 3 }) } };
    const r = resolveCandidates(s, withMath, [], 'accuracy');
    expect(r.integrity).toEqual(['preference-out-of-scope']);
  });

  // MUTATION: clear `nominalTie` along with `tied`.
  it('NOMINAL-TIE PASSTHROUGH matters: the merge hint survives an override', () => {
    const cands = [
      cand(1, 'physics', [['sama', 1, 10]]),
      cand(2, 'physics', [['sama', 1, 20]]),
      cand(3, 'biology', [['annad', 1, 30]]),
    ];
    const without = resolveCandidates(scope(), cands, [], 'x');
    const with_ = resolveCandidates(
      scope(new Map([['x', { termId: 30, tier: 'book' }]])),
      cands,
      [],
      'x'
    );
    // The override changes the ANSWER and nothing else about the report.
    expect(without.nominalTie).toEqual([1, 2]);
    expect(with_.nominalTie).toEqual([1, 2]);
    expect(with_.winner.text).toBe('annad');
  });

  // MUTATION: clear `tied` without re-homing to `alsoInScope`. The members
  // would then appear in NEITHER list — D3's own invisibility, inside D3.
  it('RE-HOMING matters: an answered tie’s members move, they do not evaporate', () => {
    const cands = [
      cand(41, 'physics', [['tengi', 1, 410]]),
      cand(42, 'physics', [['bindi', 1, 420]]),
    ];
    const asTie = resolveCandidates(scope(), cands, [], 'bond');
    const answered = resolveCandidates(
      scope(new Map([['bond', { termId: 410, tier: 'book' }]])),
      cands,
      [],
      'bond'
    );
    expect(asTie.tied.map((t) => t.conceptId)).toEqual([41, 42]);
    expect(answered.tied).toEqual([]);
    // ⚠️ THE HALF THAT CATCHES THE MUTANT. Every concept reported before the
    // override is still reported after it, in one list or the other.
    const before = new Set([
      ...asTie.tied.map((t) => t.conceptId),
      ...asTie.alsoInScope.map((a) => a.conceptId),
    ]);
    const after = new Set([
      answered.winner.conceptId,
      ...answered.tied.map((t) => t.conceptId),
      ...answered.alsoInScope.map((a) => a.conceptId),
    ]);
    expect([...after].sort()).toEqual([...before].sort());
  });
});
