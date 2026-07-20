/**
 * Accept-eligibility predicate (MTA-R3) — the client half of the shared rule.
 *
 * Behaviour, not presence: static pins prove a string exists in a file, which
 * is exactly what let the PR1 gate divergence ship. The scenario table is
 * shared with the server-parity block in acceptanceService.test.js.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { acceptBlockReason, canAcceptMt } = require('../public/js/accept-eligibility');
const { CASES, BASELINE } = require('./helpers/acceptEligibilityCases.cjs');

function seg(edits, overrides = {}) {
  return { hasTranslation: true, is: BASELINE, edits, ...overrides };
}

describe('acceptBlockReason', () => {
  for (const c of CASES) {
    it(`${c.name} → ${c.expect || 'eligible'}`, () => {
      expect(acceptBlockReason(seg(c.edits))).toBe(c.expect);
    });
  }

  it('a segment with no translation has nothing to attest', () => {
    expect(acceptBlockReason(seg([], { hasTranslation: false }))).toBe('NO_TRANSLATION');
  });

  it('tolerates a missing edits array', () => {
    expect(acceptBlockReason({ hasTranslation: true, is: BASELINE })).toBe(null);
  });
});

describe('canAcceptMt', () => {
  it('is true exactly when nothing blocks', () => {
    expect(canAcceptMt(seg([]))).toBe(true);
  });

  it('is false when a discussion is open', () => {
    expect(canAcceptMt(seg([{ status: 'discuss', edited_content: 'x', applied_at: null }]))).toBe(
      false
    );
  });

  it("does NOT consider an existing acceptance — that is the caller's branch", () => {
    // The row renderer shows the chip+revoke for an accepted segment; the
    // predicate answers only "would the server accept this?", so the two
    // concerns stay separable and the server-parity table stays exact.
    expect(canAcceptMt(seg([], { acceptance: { id: 1 } }))).toBe(true);
  });
});
