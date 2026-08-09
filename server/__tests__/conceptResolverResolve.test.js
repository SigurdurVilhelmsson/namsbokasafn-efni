// server/__tests__/conceptResolverResolve.test.js
/**
 * A literal Scope and a literal candidate array — NO DATABASE ANYWHERE IN THIS
 * FILE. That is the point of the split, and it is still true after B4a.
 *
 * ⚠️ B4a narrowed the claim by exactly one statement. `resolveCandidates` reads
 * `scope.stmts.termById` on the preference-FAULT path alone, to tell a stale row
 * from a misfiled one. The fault cases below stub that ONE `.get()` on a plain
 * object literal; nothing here opens, migrates or imports a connection.
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

  // ⚠️ RE-KEYED 2026-08-09 (B4a, §C38). These fixtures used to be
  // `new Map([[10, …]])` — the numeric conceptId — which meant this file never
  // exercised buildPreferenceMap's key at all and stayed green for the wrong
  // reason. A preference is keyed on the LOWERCASED ENGLISH STRING now, so it
  // is no longer per-candidate: every candidate in one resolution shares the
  // same string, and `english` must be passed as the 4th argument or the
  // override never runs.
  it('a book preference beats the head form, and says so', () => {
    const pref = new Map([['cell', { termId: 101, tier: 'book' }]]);
    const r = resolveCandidates(
      chemScope(pref),
      [
        cand(10, 'chemistry', [
          ['fruma', 1, 100],
          ['sella', 2, 101],
        ]),
      ],
      [],
      'cell'
    );
    expect(r.winner.text).toBe('sella');
    expect(r.reason).toBe('book-preference');
  });

  it('a chapter preference reports chapter-preference', () => {
    const pref = new Map([['cell', { termId: 101, tier: 'chapter' }]]);
    const r = resolveCandidates(
      chemScope(pref),
      [
        cand(10, 'chemistry', [
          ['fruma', 1, 100],
          ['sella', 2, 101],
        ]),
      ],
      [],
      'cell'
    );
    expect(r.reason).toBe('chapter-preference');
  });

  // ⚠️ CONTROL for the whole re-key: `english` is OPTIONAL so resolveCandidates
  // stays pure and every existing call site keeps working. A caller that does
  // not name the string gets the position walk and nothing else — the
  // preference map is not consulted, because there is no string to consult it
  // with. Without this, a mutant that defaulted `english` to something truthy
  // would go unnoticed.
  it('omitting `english` leaves the preference map unread', () => {
    const pref = new Map([['cell', { termId: 101, tier: 'book' }]]);
    const r = resolveCandidates(chemScope(pref), [
      cand(10, 'chemistry', [
        ['fruma', 1, 100],
        ['sella', 2, 101],
      ]),
    ]);
    expect(r.winner.text).toBe('fruma');
    expect(r.reason).toBe('head-form');
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
      alsoInScope: [],
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

  it('TIE DETECTION READS HEAD FORMS, never preferred terms — the override runs AFTER', () => {
    // ⚠️ REWRITTEN 2026-08-09 (B4a, §C38). HISTORY, kept on purpose: this was
    // "a NOMINAL tie winner's reason tracks how THAT candidate resolved — a
    // preference, not a hardcoded value", and it asserted `nominalTie` was
    // [70, 71]. That was true while step 3 applied the preference PER
    // CANDIDATE, which made 70 contribute 'nytt' to the tie comparison and so
    // agree with 71. B4a moves the preference out of step 3 entirely: the
    // position walk now always compares HEAD forms, so 70 contributes
    // 'gamalt' and this fixture is a REAL tie ('gamalt' vs 'nytt'), which the
    // override then answers.
    //
    // The same fixture therefore now pins the design claim at the centre of
    // this task — "AFTER the position walk, never instead of it" — which
    // nothing else in the suite pins from this direction. A mutant that moved
    // the preference back into step 3 would produce nominalTie [70, 71] and
    // turn this red.
    const pref = new Map([['renewal', { termId: 701, tier: 'book' }]]);
    const r = resolveCandidates(
      chemScope(pref),
      [
        cand(70, 'biology', [
          ['gamalt', 1, 700],
          ['nytt', 2, 701],
        ]),
        cand(71, 'biology', [['nytt', 1, 710]]),
      ],
      [],
      'renewal'
    );
    expect(r.winner.text).toBe('nytt');
    expect(r.winner.conceptId).toBe(70);
    expect(r.reason).toBe('book-preference');
    // A REAL tie on head forms — NOT a nominal one. The override answered it,
    // so `tied` is cleared and 71 is re-homed rather than lost.
    expect(r.nominalTie).toEqual([]);
    expect(r.tied).toEqual([]);
    expect(r.alsoInScope.map((a) => a.conceptId)).toEqual([71]);
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

  it('a preference DOES break a real tie — B4a, and this is the third name of this test', () => {
    // ⚠️ HISTORY, kept on purpose — a silent rename erases why the first one
    // happened. Written as "a preference BREAKS a real tie — that is what
    // preference is for"; renamed 2026-08-08 to "does NOT break a real tie —
    // it selects within a concept, never between", which was correct for the
    // concept-keyed model (a preference named a concept, so it could only
    // choose among that one concept's terms and never arbitrate between two
    // competing concepts); inverted again 2026-08-09 by B4a, where a
    // preference names ONE TERM on one concept and IS the answer — §C38's
    // whole point, since chemistry's `accuracy` must be able to reach
    // biology's `hittni` at position 3.
    //
    // The 2026-08-08 comment also recorded that the old fixture was a no-op
    // (concept 41 had exactly one is-term and the preference named it, so
    // disabling preference lookup left the test green). That is no longer
    // true: the preference now moves the answer from "no winner" to concept
    // 41, so this fixture is mutation-load-bearing on its own.
    //
    // The tied members are not lost — they move to alsoInScope (asserted below).
    const pref = new Map([['bond', { termId: 410, tier: 'book' }]]);
    const r = resolveCandidates(
      chemScope(pref),
      [cand(41, 'physics', [['tengi', 1, 410]]), cand(42, 'physics', [['bindi', 1, 420]])],
      [],
      'bond'
    );
    expect(r.winner.text).toBe('tengi');
    expect(r.reason).toBe('book-preference');
    expect(r.tied).toEqual([]);
    expect(r.alsoInScope.map((a) => a.conceptId)).toEqual([42]);
  });
});

describe('resolveCandidates — integrity codes', () => {
  // ⚠️ REWRITTEN 2026-08-09 (B4a). `orphan-preference` is RETIRED — one code
  // for three faults with three different remedies (delete a stale row · fix a
  // misfiled one · add a domain to the book's chain) undercut the diagnostic
  // purpose it was logged for. The three replacements are asserted in the D4
  // block below; these cases keep their original ARRAY-shape intent.
  //
  // `stmts.termById` is stubbed, not mocked away: the term row EXISTS (so this
  // is `preference-not-a-candidate`, a misfiled row) but no candidate for this
  // English string carries it.
  const withRealTermRow = (pref) => {
    const s = chemScope(pref);
    s.stmts = { termById: { get: () => ({ term_id: 999, concept_id: 77 }) } };
    return s;
  };

  it('a preference naming a term of ANOTHER concept falls back to the head form and reports', () => {
    const pref = new Map([['matter', { termId: 999, tier: 'book' }]]); // 999 is on concept 77
    const r = resolveCandidates(
      withRealTermRow(pref),
      [cand(10, 'chemistry', [['efni', 1, 100]])],
      [],
      'matter'
    );
    expect(r.winner.text).toBe('efni');
    // ⚠️ The SECOND half is what a naive implementation gets wrong: reporting
    // the fault is not enough, the resolution must otherwise be the
    // UNPREFERRED one — same winner AND same reason as if no row existed.
    expect(r.reason).toBe('head-form');
    expect(r.integrity).toContain('preference-not-a-candidate');
  });

  it('integrity is an ARRAY, so a merge-cycle and a preference fault coexist', () => {
    const pref = new Map([['matter', { termId: 999, tier: 'book' }]]);
    const r = resolveCandidates(
      withRealTermRow(pref),
      [cand(10, 'chemistry', [['efni', 1, 100]])],
      ['merge-cycle'],
      'matter'
    );
    expect(r.integrity.sort()).toEqual(['merge-cycle', 'preference-not-a-candidate']);
  });

  it('CONTROL: a clean resolution reports an EMPTY integrity array', () => {
    const r = resolveCandidates(
      chemScope(),
      [cand(10, 'chemistry', [['efni', 1, 100]])],
      [],
      'matter'
    );
    expect(r.integrity).toEqual([]);
  });

  it('AT MOST ONE preference fault per resolution — one English string, one row', () => {
    // ⚠️ REPLACES the old "de-dup guard: TWO orphaned preferences report
    // 'orphan-preference' only ONCE". Under the concept key a resolution could
    // carry one preference PER CANDIDATE, so a `codes.includes()` guard was
    // load-bearing against a double push. Under the English key that is
    // STRUCTURAL: a resolution names exactly one string, which selects at most
    // one row, so the push is unconditional and cannot repeat — even with two
    // in-scope candidates, neither of which carries the term.
    //
    // `toEqual`, not `toContain` — a duplicate push would still pass `toContain`.
    const pref = new Map([['matter', { termId: 999, tier: 'book' }]]);
    const r = resolveCandidates(
      withRealTermRow(pref),
      [cand(10, 'chemistry', [['efni', 1, 100]]), cand(20, 'physics', [['kraftur', 1, 200]])],
      [],
      'matter'
    );
    expect(r.integrity).toEqual(['preference-not-a-candidate']);
  });
});

describe('resolveCandidates — the preference override (§C38)', () => {
  // §C38's exact defect: chemistry resolved BOTH `accuracy` and `precision` to
  // `nákvæmni`, collapsing the pair a measurements chapter exists to
  // distinguish. Chemistry's chain is 1.chemistry → 2.physics → 3.biology and
  // chemistry has no `accuracy` concept, so physics@2 decided and biology's
  // `hittni` at position 3 was never consulted.
  const acc = (pref) =>
    resolveCandidates(
      chemScope(pref),
      [cand(1, 'physics', [['nákvæmni', 1, 10]]), cand(2, 'biology', [['hittni', 1, 20]])],
      [],
      'accuracy'
    );

  it('THE ANCHOR — a preferred term on a losing in-scope concept wins', () => {
    const r = acc(new Map([['accuracy', { termId: 20, tier: 'book' }]]));
    expect(r.winner).toMatchObject({ text: 'hittni', domain: 'biology', position: 3 });
    expect(r.reason).toBe('book-preference');
  });

  // ⚠️ THE CONTROL THE ANCHOR IS WORTHLESS WITHOUT. A change that broke
  // position ordering generally would PASS the anchor and FAIL this — an
  // anchor alone proves only that some code ran.
  it('THE CONTROL — position still decides when there is no preference', () => {
    const r = acc(new Map());
    expect(r.winner).toMatchObject({ text: 'nákvæmni', domain: 'physics', position: 2 });
    expect(r.reason).toBe('head-form');
  });

  it('the displaced position-winner moves to alsoInScope, not out of sight', () => {
    const r = acc(new Map([['accuracy', { termId: 20, tier: 'book' }]]));
    expect(r.alsoInScope.map((a) => a.conceptId)).toEqual([1]);
  });

  it('a chapter-tier preference reports chapter-preference through the override', () => {
    const r = acc(new Map([['accuracy', { termId: 20, tier: 'chapter' }]]));
    expect(r.winner.text).toBe('hittni');
    expect(r.reason).toBe('chapter-preference');
  });

  // ⚠️ THE REGRESSION TEST FOR THE DEFECT THAT CAUSED THE SPEC REWRITE. Under
  // the concept key, preferring a term for 'accuracy' moved every OTHER English
  // string on that concept too. No other test in the suite would catch its
  // return: the fixture is identical, only the string being resolved differs.
  it('THE LEAK CONTROL — a preference for one English string does not move another', () => {
    const pref = new Map([['accuracy', { termId: 20, tier: 'book' }]]);
    const other = resolveCandidates(
      chemScope(pref),
      [cand(1, 'physics', [['nákvæmni', 1, 10]]), cand(2, 'biology', [['hittni', 1, 20]])],
      [],
      'exactness'
    );
    expect(other.winner).toMatchObject({ text: 'nákvæmni', domain: 'physics' });
    expect(other.reason).toBe('head-form');
  });

  // ⚠️ THE COLLATION CONTRACT, and the second half of conceptResolverScope's
  // "found in any case" test. book_term_preference.english is COLLATE NOCASE
  // so SQLite folds case on the column, and buildPreferenceMap keys its Map on
  // the LOWERCASED string — but a JS Map does not fold anything, so the LOOKUP
  // must lowercase too or the row is stored and never found, silently.
  it('THE COLLATION CONTRACT — the lookup lowercases, matching buildPreferenceMap', () => {
    const r = resolveCandidates(
      chemScope(new Map([['accuracy', { termId: 20, tier: 'book' }]])),
      [cand(1, 'physics', [['nákvæmni', 1, 10]]), cand(2, 'biology', [['hittni', 1, 20]])],
      [],
      'Accuracy'
    );
    expect(r.winner.text).toBe('hittni');
    expect(r.reason).toBe('book-preference');
  });

  // ⚠️ THE CLAIM "EVERY EXISTING REPORT SURVIVES; ONLY THE ANSWER CHANGES" WAS
  // PROSE, NOT A PIN — measured 2026-08-09 in review: blanking the successful
  // override's return to `outOfScope: [], integrity: [], unscoped: true` left
  // 109/109 green across all 7 covering files. `unscoped: true` is the damning
  // one — a consumer-visible state change no test could see. Only `nominalTie`
  // and `alsoInScope` were asserted; the other three pass-through fields were
  // unpinned.
  //
  // This compares a WITH-preference run against a WITHOUT-preference run on the
  // same candidates, so it pins the invariant itself rather than three literals.
  // The fixture is built so both `outOfScope` and `integrity` are NON-EMPTY:
  // two empty arrays agree, and their agreement would prove nothing.
  it('EVERY PASS-THROUGH FIELD SURVIVES the override — only the answer changes', () => {
    const cands = [
      cand(1, 'physics', [['nákvæmni', 1, 10]]),
      cand(2, 'biology', [['hittni', 1, 20]]),
      cand(3, 'mathematics', [['stæ', 1, 30]]), // out of scope → non-empty outOfScope
    ];
    const run = (pref) => resolveCandidates(chemScope(pref), cands, ['merge-cycle'], 'accuracy');
    const without = run(new Map());
    const with_ = run(new Map([['accuracy', { termId: 20, tier: 'book' }]]));

    // The override really did fire — without this the comparison below is vacuous.
    expect(without.winner.text).toBe('nákvæmni');
    expect(with_.winner.text).toBe('hittni');

    // ⚠️ Non-emptiness first, for the same reason: identical empties agree.
    expect(without.outOfScope.length).toBeGreaterThan(0);
    expect(without.integrity.length).toBeGreaterThan(0);

    expect(with_.outOfScope).toEqual(without.outOfScope);
    expect(with_.integrity).toEqual(without.integrity);
    expect(with_.unscoped).toEqual(without.unscoped);
  });

  it('a nominalTie is PRESERVED when the override fires — it reports concepts to merge', () => {
    // ⚠️ THE MEASURED REASON THE OVERRIDE RUNS AFTER THE WALK. A short-circuit
    // that returned the preferred term immediately skips step 5 entirely, and
    // that was measured to destroy this merge hint when the tie members
    // straddle the preference: nominalTie went [1, 2] → []. A duplicate pair of
    // concepts is worth merging regardless of which term the book uses.
    const r = resolveCandidates(
      chemScope(new Map([['x', { termId: 30, tier: 'book' }]])),
      [
        cand(1, 'physics', [['sama', 1, 10]]),
        cand(2, 'physics', [['sama', 1, 20]]),
        cand(3, 'biology', [['annad', 1, 30]]),
      ],
      [],
      'x'
    );
    expect(r.winner.text).toBe('annad');
    expect(r.nominalTie.sort()).toEqual([1, 2]);
    // Both tie members are still offerable answers the editor chose against.
    expect(r.alsoInScope.map((a) => a.conceptId)).toEqual([1, 2]);
  });
});

describe('resolveCandidates — the three preference faults (D4)', () => {
  // ⚠️ THREE CODES, THREE REMEDIES. `orphan-preference` named all three at
  // once: delete a stale row · re-file a misfiled one · add a domain to the
  // book's priority chain. Each case asserts BOTH halves — the code is
  // reported AND the resolution is otherwise the unpreferred one. The second
  // half is what a naive implementation gets wrong.
  const two = [cand(1, 'physics', [['nákvæmni', 1, 10]]), cand(2, 'biology', [['hittni', 1, 20]])];
  const unpreferred = { text: 'nákvæmni', domain: 'physics' };

  it('preference-not-a-candidate: the term is real but not on any candidate here', () => {
    const scope = chemScope(new Map([['accuracy', { termId: 999, tier: 'book' }]]));
    scope.stmts = { termById: { get: () => ({ term_id: 999, concept_id: 77 }) } };
    const r = resolveCandidates(scope, two, [], 'accuracy');
    expect(r.integrity).toContain('preference-not-a-candidate');
    expect(r.winner).toMatchObject(unpreferred);
    expect(r.reason).toBe('head-form');
  });

  it('preference-term-missing: the term row is gone', () => {
    const scope = chemScope(new Map([['accuracy', { termId: 999, tier: 'book' }]]));
    scope.stmts = { termById: { get: () => undefined } };
    const r = resolveCandidates(scope, two, [], 'accuracy');
    expect(r.integrity).toContain('preference-term-missing');
    expect(r.winner).toMatchObject(unpreferred);
    expect(r.reason).toBe('head-form');
  });

  // ⚠️ CONTROL on the two above: the SAME missing owner produces DIFFERENT
  // codes depending only on whether the term row exists. Without this, an
  // implementation that hardcoded either code would pass one of the two tests
  // and the pair would look like coverage.
  it('CONTROL: missing-row and misfiled-row are DISTINGUISHABLE, not one code', () => {
    const mk = (get) => {
      const s = chemScope(new Map([['accuracy', { termId: 999, tier: 'book' }]]));
      s.stmts = { termById: { get } };
      return resolveCandidates(s, two, [], 'accuracy').integrity;
    };
    expect(mk(() => ({ term_id: 999, concept_id: 77 }))).not.toEqual(mk(() => undefined));
  });

  // ⚠️ FAIL LOUD, DO NOT GUESS. A `scope.stmts && scope.stmts.termById &&`
  // guard used to stand here, and it degraded to the WRONG remedy: a scope with
  // no statements silently reported `preference-term-missing` — "delete this
  // stale row" — for a row whose term exists and is merely misfiled. That is the
  // exact conflation the three-code split exists to end, reintroduced by the
  // defensive check meant to be harmless. Unreachable in production
  // (`buildScope` always sets `stmts`), so this is an API-contract guard.
  it('a scope with no stmts THROWS on this path rather than guessing a remedy', () => {
    const scope = chemScope(new Map([['accuracy', { termId: 999, tier: 'book' }]]));
    expect(scope.stmts).toBeUndefined();
    expect(() => resolveCandidates(scope, two, [], 'accuracy')).toThrow(/stmts\.termById/);
  });

  // ⚠️ CONTROL: the throw is scoped to the fault path only. The same
  // stmts-less scope resolves perfectly well when the preference IS honourable
  // — a guard that fired on every resolution would be a performance and API
  // regression, not a safety net.
  it('CONTROL: the same stmts-less scope resolves fine when the preference is honourable', () => {
    const scope = chemScope(new Map([['accuracy', { termId: 20, tier: 'book' }]]));
    expect(resolveCandidates(scope, two, [], 'accuracy').winner.text).toBe('hittni');
  });

  it('preference-out-of-scope: the term is on a concept outside the domain chain', () => {
    const withMath = [...two, cand(3, 'mathematics', [['stæ', 1, 30]])];
    const r = resolveCandidates(
      chemScope(new Map([['accuracy', { termId: 30, tier: 'book' }]])),
      withMath,
      [],
      'accuracy'
    );
    expect(r.integrity).toContain('preference-out-of-scope');
    expect(r.winner).toMatchObject(unpreferred);
    expect(r.reason).toBe('head-form');
  });

  // ⚠️ THE ONE A NAIVE IMPLEMENTATION MISSES, and the reason the owner search
  // runs over ALL candidates rather than over the `outOfScope` OUTPUT. That
  // output is lossy in two independent ways, both present in this fixture:
  //   ① it carries only the HEAD FORM's `text` and no termId at all, so a
  //      preferred term that is not the head form (concept 3's rank-2 'stærð')
  //      is unrecoverable from it;
  //   ② step 2 DROPS term-less candidates before recording them (pinned by
  //      'a term-less out-of-scope concept is not listed as a suggestion
  //      either'), so concept 4 never appears in it at all.
  //
  // ⚠️ DEVIATION FROM THE BRIEF, recorded on purpose. The brief's fixture for
  // this case set `withEmpty[2].isTerms = [{text:'stæ', rank:1, termId:30}]`,
  // which is byte-identical to what `cand(3,'mathematics',[['stæ',1,30]])`
  // already builds — a no-op that made the test a duplicate of the one above.
  // A literally term-less owner is UNREACHABLE (empty isTerms cannot carry the
  // preferred termId), so this pins the reachable form of the same hazard.
  it('preference-out-of-scope fires for a term the outOfScope output cannot express', () => {
    const withLossy = [
      ...two,
      cand(3, 'mathematics', [
        ['stæ', 1, 30],
        ['stærð', 2, 31], // ← the preferred term, NOT the head form
      ]),
      cand(4, 'mathematics', []), // ← term-less: dropped from outOfScope entirely
    ];
    const r = resolveCandidates(
      chemScope(new Map([['accuracy', { termId: 31, tier: 'book' }]])),
      withLossy,
      [],
      'accuracy'
    );
    expect(r.outOfScope).toEqual([{ conceptId: 3, text: 'stæ', domain: 'mathematics' }]);
    expect(r.integrity).toContain('preference-out-of-scope');
    expect(r.winner).toMatchObject(unpreferred);
  });

  it('CONTROL: a preference on an IN-scope concept reports no fault at all', () => {
    const r = resolveCandidates(
      chemScope(new Map([['accuracy', { termId: 20, tier: 'book' }]])),
      two,
      [],
      'accuracy'
    );
    expect(r.integrity).toEqual([]);
    expect(r.winner.text).toBe('hittni');
  });
});

describe('resolveCandidates — alsoInScope', () => {
  it('reports an in-scope concept that lost the position race', () => {
    const r = resolveCandidates(chemScope(), [
      cand(1, 'physics', [['nákvæmni', 1, 10]]),
      cand(2, 'biology', [['hittni', 1, 20]]),
    ]);
    expect(r.winner.text).toBe('nákvæmni');
    expect(r.alsoInScope).toEqual([
      { conceptId: 2, termId: 20, text: 'hittni', domain: 'biology', position: 3 },
    ]);
  });

  // ⚠️ termId is here because B4c CANNOT WRITE A PREFERENCE WITHOUT IT. Dropping
  // it would force the panel to re-derive term ids from display text.
  it('carries termId, which is what a write path needs', () => {
    const r = resolveCandidates(chemScope(), [
      cand(1, 'chemistry', [['a', 1, 10]]),
      cand(2, 'physics', [['b', 1, 20]]),
    ]);
    expect(r.alsoInScope[0].termId).toBe(20);
  });

  it('excludes tied members — they are already reported in `tied`', () => {
    const r = resolveCandidates(chemScope(), [
      cand(1, 'physics', [['ein', 1, 10]]),
      cand(2, 'physics', [['tvo', 1, 20]]),
      cand(3, 'biology', [['thrju', 1, 30]]),
    ]);
    expect(r.tied.map((t) => t.conceptId).sort()).toEqual([1, 2]);
    expect(r.alsoInScope.map((a) => a.conceptId)).toEqual([3]);
  });

  it('excludes nominalTie members — identical text is noise, not an alternative', () => {
    const r = resolveCandidates(chemScope(), [
      cand(1, 'physics', [['sama', 1, 10]]),
      cand(2, 'physics', [['sama', 1, 20]]),
    ]);
    expect(r.nominalTie.sort()).toEqual([1, 2]);
    expect(r.alsoInScope).toEqual([]);
  });

  // ⚠️ conceptId 50 carries the LOWEST position (2) but the HIGHEST conceptId —
  // position and conceptId deliberately disagree, so a sort that dropped the
  // position key (conceptId-only: [2, 5, 50]) would produce a DIFFERENT order
  // than the real one ([50, 2, 5]) and this test would catch it. The earlier
  // fixture had its lowest-position candidate also carry the lowest conceptId,
  // so a conceptId-only sort coincidentally matched — this one cannot.
  it('is ordered by position then conceptId — deterministic', () => {
    const r = resolveCandidates(chemScope(), [
      cand(1, 'chemistry', [['w', 1, 10]]),
      cand(50, 'physics', [['z', 1, 40]]), // position 2, conceptId HIGH
      cand(2, 'biology', [['x', 1, 20]]), // position 3, conceptId low
      cand(5, 'biology', [['y', 1, 30]]), // position 3, conceptId mid
    ]);
    expect(r.alsoInScope.map((a) => a.conceptId)).toEqual([50, 2, 5]);
  });

  // ⚠️ A term-less in-scope candidate is dropped by the step-3 filter BEFORE it
  // ever reaches `chosen` (parent spec §6's ordering defect). alsoInScope must be
  // built from `chosen`, never from `inScope` or the raw candidates — an
  // implementation that read `inScope` here would let this candidate leak
  // through with `termId`/`text` both `undefined`, since it never picked a term.
  it('excludes a term-less in-scope candidate — it never became a chosen answer', () => {
    const r = resolveCandidates(chemScope(), [
      cand(1, 'chemistry', [['efni', 1, 10]]),
      cand(2, 'physics', []), // en term exists, no 'is' term — dropped at step 3
    ]);
    expect(r.winner.conceptId).toBe(1);
    expect(r.alsoInScope).toEqual([]);
  });

  it('is [] when there is nothing to report — the shape is TOTAL', () => {
    expect(resolveCandidates(chemScope(), []).alsoInScope).toEqual([]);
    expect(resolveCandidates({ unscoped: 'unregistered' }, []).alsoInScope).toEqual([]);
  });
});
