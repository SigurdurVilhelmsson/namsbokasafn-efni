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
 *    zero silently. This turns that into a loud refusal.
 */

import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const {
  countApproved,
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

  it('does not refuse when the previous file had no approved terms', () => {
    // liffraedi-2e today: 2262 terms, all needs_review.
    const prev = payload([{ english: 'a', icelandic: 'a', status: 'needs_review' }]);
    expect(shrinkVerdict(prev, payload([])).refuse).toBe(false);
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

  it('exposes the ratio as a named constant', () => {
    expect(SHRINK_RATIO).toBe(0.5);
  });
});
