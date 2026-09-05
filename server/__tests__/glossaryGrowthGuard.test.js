/**
 * The glossary size guard was ONE-SIDED, and the missing half is what shipped
 * 768 unreviewed headwords (§C119).
 *
 * SHRINK_RATIO catches a catastrophic loss — the producer-swap case C14 exists
 * for. It says nothing about growth, so `lifraen-efnafraedi` going 827 -> 1,595
 * passed every gate silently: same producer stamp, baseline present, and pure
 * growth is structurally invisible to a shrink test. 119 of the 543 judged
 * additions were then confirmed harmful (`ants -> maurar` fires 180 times in
 * the corpus, 179 of them on `reactants`/`plants`/`constants`/`locants`).
 *
 * WHY THE THRESHOLD IS NOT THE MIRROR OF SHRINK_RATIO, and this is measured
 * rather than chosen. Exact symmetry with 0.5 would be 2.0 — and the incident
 * was 1.928x, so a symmetric guard would have MISSED IT BY 3.6%. The observed
 * numbers separate cleanly: legitimate growth in the same commit was
 * chemistry 2,006 -> 2,090 = 1.042x, while the pathological cases were
 * 827 -> 1,595 = 1.928x and the post-trim rebound 172 -> 840 = 4.88x. 1.5 sits
 * in the wide empty gap between 1.04 and 1.93.
 *
 * Like the shrink guard this targets catastrophe, not drift, and `--force` is
 * the same deliberate override — which the cron cannot reach.
 */

import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const {
  growthVerdict,
  GROWTH_RATIO,
  GROWTH_MIN_DELTA,
} = require('../lib/glossaryExportDecision.js');

const g = (n, approved = n) => ({
  terms: Array.from({ length: n }, (_, i) => ({
    english: `t${i}`,
    status: i < approved ? 'approved' : 'needs_review',
  })),
});

describe('growthVerdict', () => {
  // THE INCIDENT. This is the assertion the guard exists for.
  it('REFUSES the measured 827 -> 1595 explosion', () => {
    expect(growthVerdict(g(827), g(1595)).refuse).toBe(true);
  });

  // The legitimate growth in the very same commit must pass, or the guard
  // trains people to --force and becomes decoration.
  it('permits the legitimate 2006 -> 2090 growth from the same commit', () => {
    expect(growthVerdict(g(2006), g(2090)).refuse).toBe(false);
  });

  it('REFUSES the post-trim rebound 172 -> 840', () => {
    expect(growthVerdict(g(172), g(840)).refuse).toBe(true);
  });

  // A symmetric 2.0 would have missed the incident. This pins the threshold as
  // a measured value, so raising it silently re-opens the hole.
  it('uses a threshold below the naive mirror of SHRINK_RATIO', () => {
    expect(GROWTH_RATIO).toBeLessThan(2);
  });

  it('permits an unchanged size', () => {
    expect(growthVerdict(g(100), g(100)).refuse).toBe(false);
  });

  it('permits a shrink — that is the other guard job, not this one', () => {
    expect(growthVerdict(g(100), g(10)).refuse).toBe(false);
  });

  // Growth FROM ZERO has no ratio to measure and is a first population, not an
  // explosion; the absent-baseline gate (§C21) owns that case.
  it('permits growth from an empty previous file', () => {
    expect(growthVerdict(g(0), g(500)).refuse).toBe(false);
  });

  // BOTH metrics, for the same reason the shrink guard uses both: a file whose
  // terms are all needs_review has zero approved, so an approved-only test is
  // structurally inert for it (liffraedi-2e is exactly that shape).
  it('catches an explosion in TOTAL terms even when none are approved', () => {
    expect(growthVerdict(g(100, 0), g(1000, 0)).refuse).toBe(true);
  });

  it('catches an explosion in APPROVED terms even when the total barely moves', () => {
    expect(growthVerdict(g(1000, 10), g(1000, 900)).refuse).toBe(true);
  });

  // A RATIO ALONE IS MEANINGLESS ON SMALL COUNTS. Omitting the absolute floor
  // broke 15 tests in glossaryExportRun.test.js, whose fixtures seed ONE term
  // and export five — the asymmetry with the shrink guard, which needs no floor
  // because shrinking from 2 terms harms nothing.
  it('permits the 1 -> 5 fixture growth: proportional, but four terms', () => {
    expect(growthVerdict(g(1), g(5)).refuse).toBe(false);
  });

  it('permits a big ratio that moves few terms', () => {
    expect(growthVerdict(g(10), g(60)).refuse).toBe(false);
  });

  it('still refuses a big ratio that moves many terms', () => {
    expect(growthVerdict(g(100), g(400)).refuse).toBe(true);
  });

  it('the floor is small enough to leave the incident caught', () => {
    expect(GROWTH_MIN_DELTA).toBeLessThan(768);
  });

  // PINS THE RATIO CLAUSE ITSELF, not just its value. Without this, DELETING
  // `next > prev * GROWTH_RATIO` leaves every other assertion green — measured,
  // 14/14 — because each one is decided by the DELTA. Even "permits the
  // legitimate 2006 -> 2090" passes on its delta of 84 being under the floor.
  // The discriminating case is a LARGE delta with a SMALL ratio, which no other
  // fixture has.
  //
  // ▶ Mutating a constant tests that its VALUE matters; only deleting the term
  //   tests that the TERM matters. GROWTH_RATIO = 2.0 went red and felt like
  //   proof — it only proved the value mattered for cases the delta decided.
  it('permits a LARGE absolute jump whose ratio is small — the ratio clause earns its place', () => {
    expect(growthVerdict(g(10000), g(10200)).refuse).toBe(false);
  });

  it('and still refuses when that same delta comes with a big ratio', () => {
    expect(growthVerdict(g(200), g(400)).refuse).toBe(true);
  });

  it('reports both sides so the operator can judge before forcing', () => {
    const v = growthVerdict(g(827), g(1595));
    expect({ p: v.prevTotal, n: v.nextTotal }).toEqual({ p: 827, n: 1595 });
  });
});
