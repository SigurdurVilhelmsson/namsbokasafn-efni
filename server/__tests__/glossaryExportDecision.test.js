/**
 * Decision logic for the unattended glossary export (register C14).
 *
 * Two jobs, both load-bearing once the export runs from the 2h cron:
 *
 * 1. WRITE-IF-CHANGED. exportBookGlossary stamps a fresh `generated`
 *    timestamp every run (terminologyService.js:1581), so without this the
 *    file would be dirty every cycle: ~4,380 timestamp-only commits a year,
 *    and git-backup.sh's healthy "nothing to commit" path would never fire
 *    again.
 *
 * 2. SHRINK GUARD. The committed glossary-unified.json files were written by
 *    tools/merge-glossary.js, NOT by this exporter — so cron-ing it swaps
 *    producers rather than refreshing. Migration 032 dropped the table
 *    merge-glossary still writes to, and exportBookGlossary is deliberately
 *    subject-strict, so chemistry could go from 617 approved terms to near
 *    zero silently. This turns that into a loud refusal. The guard checks
 *    BOTH the approved-term count and the total-term count: approved-only
 *    is inert for a file with zero approved terms — exactly the shape of
 *    liffraedi-2e's committed 2262-term, all-needs_review export.
 */

import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const {
  countApproved,
  countTerms,
  sameTerms,
  shrinkVerdict,
  SHRINK_RATIO,
} = require('../lib/glossaryExportDecision');

const approved = (n) =>
  Array.from({ length: n }, (_, i) => ({
    english: `t${i}`,
    icelandic: `i${i}`,
    status: 'approved',
  }));

/** All needs_review, i.e. zero approved — the liffraedi-2e shape. */
const needsReview = (n) =>
  Array.from({ length: n }, (_, i) => ({
    english: `t${i}`,
    icelandic: `i${i}`,
    status: 'needs_review',
  }));

/**
 * `approvedCount` approved terms plus the remainder needs_review — the shape
 * every real committed glossary actually has (efnafraedi-2e and
 * lifraen-efnafraedi are both 1117 total / 617 approved). Whole-branch
 * adversarial review (2026-07-28): the `approved()` and `needsReview()`
 * fixtures above are both degenerate for `shrinkVerdict` — `approved(n)`
 * always has `total === approved`, so its shrink ratio moves in lockstep on
 * both clauses and can never isolate the approved-count clause; `needsReview`
 * pins `approved` at 0 throughout, isolating the total clause but never the
 * approved one. Without a fixture that varies them independently, deleting
 * the approved clause from `shrinkVerdict` entirely still passes every test
 * that used only `approved()`, because the total clause fires in lockstep.
 */
const mixed = (total, approvedCount) =>
  Array.from({ length: total }, (_, i) => ({
    english: `t${i}`,
    icelandic: `i${i}`,
    status: i < approvedCount ? 'approved' : 'needs_review',
  }));

const payload = (terms, generated = '2026-01-01T00:00:00.000Z') => ({
  generated,
  book: 'prufubok',
  stats: {},
  terms,
});

describe('countApproved', () => {
  it('counts only approved terms', () => {
    expect(
      countApproved(
        payload([
          { english: 'a', icelandic: 'a', status: 'approved' },
          { english: 'b', icelandic: 'b', status: 'needs_review' },
        ])
      )
    ).toBe(1);
  });

  it('returns 0 for null', () => {
    expect(countApproved(null)).toBe(0);
  });

  it('returns 0 when terms is missing or not an array', () => {
    expect(countApproved({ terms: 'nope' })).toBe(0);
    expect(countApproved({})).toBe(0);
  });
});

describe('countTerms', () => {
  it('counts every term regardless of status', () => {
    expect(
      countTerms(
        payload([
          { english: 'a', icelandic: 'a', status: 'approved' },
          { english: 'b', icelandic: 'b', status: 'needs_review' },
        ])
      )
    ).toBe(2);
  });

  it('returns 0 for null', () => {
    expect(countTerms(null)).toBe(0);
  });

  it('returns 0 when terms is missing or not an array', () => {
    expect(countTerms({ terms: 'nope' })).toBe(0);
    expect(countTerms({})).toBe(0);
  });
});

describe('sameTerms', () => {
  it('is true when only the generated stamp differs', () => {
    const terms = approved(3);
    expect(
      sameTerms(
        payload(terms, '2026-01-01T00:00:00.000Z'),
        payload(terms, '2026-07-27T09:00:00.000Z')
      )
    ).toBe(true);
  });

  it('is false when a term changed', () => {
    const prev = payload(approved(3));
    const next = payload([
      ...approved(2),
      { english: 't2', icelandic: 'BREYTT', status: 'approved' },
    ]);
    expect(sameTerms(prev, next)).toBe(false);
  });

  it('is false when a term was added', () => {
    expect(sameTerms(payload(approved(3)), payload(approved(4)))).toBe(false);
  });

  it('is false when there is no previous payload (nothing to compare)', () => {
    expect(sameTerms(null, payload(approved(3)))).toBe(false);
  });

  it('is false when the previous payload has no terms array', () => {
    expect(sameTerms({ generated: 'x' }, payload(approved(1)))).toBe(false);
  });
});

describe('shrinkVerdict', () => {
  it('does not refuse when there is no previous file', () => {
    expect(shrinkVerdict(null, payload(approved(5))).refuse).toBe(false);
  });

  it('REFUSES a catastrophic shrink even when the previous file had NO approved terms', () => {
    // This used to be "does not refuse when the previous file had no approved
    // terms" and asserted refuse:false — that pinned the exact bug finding 1
    // found: liffraedi-2e's real committed file is 2262 terms, ALL
    // needs_review (0 approved), so the approved-only metric was structurally
    // inert for it and an empty export would have been written and pushed.
    // The total-term metric must catch what the approved metric cannot.
    const prev = payload(needsReview(2262));
    const v = shrinkVerdict(prev, payload([]));
    expect(v.refuse).toBe(true);
    expect(v.prevTotal).toBe(2262);
    expect(v.nextTotal).toBe(0);
  });

  it('does not refuse when there is genuinely nothing to protect (both baselines empty)', () => {
    expect(shrinkVerdict(payload([]), payload([])).refuse).toBe(false);
  });

  it('permits ordinary total-term drift when approved counts are flat at zero', () => {
    // Corrected 2026-07-28 (whole-branch adversarial review, MINOR): this
    // test was misnamed "REFUSES a catastrophic total-term shrink..." while
    // its body asserted refuse:false — the name claimed the opposite of what
    // it checks. 2262 -> 2000 needs_review terms is a 12% shrink
    // (2000/2262 ≈ 0.88), well above SHRINK_RATIO — ordinary drift, not the
    // catastrophe the guard targets. This is the PERMIT-side boundary
    // companion to 'REFUSES the real liffraedi-2e-shaped catastrophic
    // shrink' below, which holds the same approved-flat-at-zero shape but on
    // the refuse side. The genuinely-refusing case for a total-only collapse
    // is exercised there and in the mixed-fixture isolator tests below.
    const v = shrinkVerdict(payload(needsReview(2262)), payload(needsReview(2000)));
    expect(v.refuse).toBe(false); // 2000 / 2262 > 0.5, legitimate drift
  });

  it('REFUSES the real liffraedi-2e-shaped catastrophic shrink (2262 -> 100, still 0 approved)', () => {
    const v = shrinkVerdict(payload(needsReview(2262)), payload(needsReview(100)));
    expect(v.refuse).toBe(true);
    expect(v.prevTotal).toBe(2262);
    expect(v.nextTotal).toBe(100);
  });

  it('does not refuse on growth', () => {
    expect(shrinkVerdict(payload(approved(100)), payload(approved(200))).refuse).toBe(false);
  });

  it('does not refuse on modest shrinkage (an editor un-approving terms)', () => {
    expect(shrinkVerdict(payload(approved(100)), payload(approved(80))).refuse).toBe(false);
  });

  it('REFUSES when approved terms fall below half', () => {
    const v = shrinkVerdict(payload(approved(617)), payload(approved(100)));
    expect(v.refuse).toBe(true);
    expect(v.prevApproved).toBe(617);
    expect(v.nextApproved).toBe(100);
  });

  it('REFUSES the empty-DB case outright', () => {
    // Running the exporter from a dev checkout, whose sessions.db has ~0
    // approved terms, would otherwise blank the committed export.
    expect(shrinkVerdict(payload(approved(617)), payload([])).refuse).toBe(true);
  });

  it('does not refuse exactly at the ratio boundary', () => {
    expect(shrinkVerdict(payload(approved(100)), payload(approved(50))).refuse).toBe(false);
  });

  it('refuses just below the ratio boundary', () => {
    expect(shrinkVerdict(payload(approved(100)), payload(approved(49))).refuse).toBe(true);
  });

  describe('clause isolation (whole-branch adversarial review, 2026-07-28, IMPORTANT)', () => {
    // Every fixture above the `mixed()` definition moves `total` and
    // `approved` in lockstep (`approved()`: total === approved throughout)
    // or pins `approved` at zero (`needsReview()`), so the compound
    // condition's two clauses were never exercised independently — deleting
    // the approved clause from `shrinkVerdict` left every pre-existing test
    // green. These use `mixed()` (the real efnafraedi-2e/lifraen-efnafraedi
    // shape, 1117 total / 617 approved) to hold one ratio on the permit side
    // while the other crosses SHRINK_RATIO.

    it('REFUSES on the approved-count clause alone (total ratio stays well above the boundary)', () => {
      // 1117/617 -> 1100/300: total 1100/1117 ≈ 0.985 (nowhere near 0.5,
      // clause 2 does not fire) but approved 300/617 ≈ 0.486 < 0.5 (clause 1
      // fires). This must go red if the approved clause is removed.
      const v = shrinkVerdict(payload(mixed(1117, 617)), payload(mixed(1100, 300)));
      expect(v.refuse).toBe(true);
      expect(v.prevApproved).toBe(617);
      expect(v.nextApproved).toBe(300);
      expect(v.prevTotal).toBe(1117);
      expect(v.nextTotal).toBe(1100);
    });

    it('permits ordinary drift on both counts (mixed fixture, neither clause fires)', () => {
      // 1117/617 -> 1000/560: total 1000/1117 ≈ 0.895, approved 560/617 ≈
      // 0.908 — both comfortably above SHRINK_RATIO. The companion negative
      // case: confirms the guard stays quiet on realistic day-to-day drift
      // once both clauses are correctly wired, not just when one is broken.
      const v = shrinkVerdict(payload(mixed(1117, 617)), payload(mixed(1000, 560)));
      expect(v.refuse).toBe(false);
    });

    // The total-clause-alone isolator is 'REFUSES the real
    // liffraedi-2e-shaped catastrophic shrink (2262 -> 100, still 0
    // approved)' above: `needsReview()` pins prevApproved at 0, so the
    // approved clause's `prevApproved > 0` guard can never fire there —
    // deliberately not duplicated here per the sibling MINOR finding.
  });

  it('exposes the ratio as a named constant', () => {
    expect(SHRINK_RATIO).toBe(0.5);
  });
});
