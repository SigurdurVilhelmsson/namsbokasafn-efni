/**
 * Tier 1 — E9, the pre-MT pre-flight.
 *
 * 🔴 THIS FILE DEVIATES FROM PLAN B'S TASK 6 SKETCH IN TWO PLACES, BOTH MEASURED FIRST.
 *
 *   plan's test                                   why it is not reproduced here
 *   ─────────────────────────────────────────────────────────────────────────────────────
 *   runCheck(E9, {mtOutputPath, force}) and the   the gate is PURE and takes VALUES. Leg 5's
 *   gate calls isMtLocked / stats / shells out    estimate comes from `api-translate --force
 *                                                 --dry-run`, which costs real money and which
 *                                                 the test conventions forbid a test reaching.
 *                                                 A gate that cannot be exercised is not a gate.
 *
 *   expect(r.examined).toBe(5) over a ctx          a CONSTANT examined is §C82 L6 verbatim, and
 *   carrying one real input                        `tools/remt-battery.js`'s ctx docstring
 *                                                  already names THIS test as the anti-pattern.
 *                                                  Here 5 is asserted only when all five legs
 *                                                  are supplied, and 0 when none are.
 *
 * ⚠️ THE LOCK LEG HAS NO NATURAL FIXTURE AND MUST NOT BE GIVEN ONE. In-scope live locks are
 * ZERO since `cc725a62`; the single surviving `.locked` in the tree is biology's `m66443`,
 * deliberately kept, and biology is withdrawn from the run. So the SHOULD-TRIP is synthetic —
 * which the pure gate makes trivial, since "locked" arrives as a boolean rather than a path.
 * The end-to-end property that `isMtLocked` is fail-safe on an UNREADABLE marker is asserted
 * against the real helper below, because that fail-safe is the loader's contract and losing it
 * is invisible to the gate.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { runCheck, VERDICT, REGISTRY } from '../lib/remt-battery.js';
import { E9, E9_LEGS, EXTRACT_CHECKS } from '../lib/remt-checks-extract.js';

const require = createRequire(import.meta.url);
const { isMtLocked, mtLockPathFor } = require('../lib/mt-lock.cjs');

/** A ctx with all five legs supplied and every one of them clean. */
const cleanCtx = () => ({
  locked: false,
  handEdits: [],
  inputs: [{ path: 'books/x/02-for-mt/ch01/m1-segments.en.md', exists: true, bytes: 2485 }],
  force: true,
  costEstimate: { isk: 1200, withForce: true },
});

describe('E9 — the five-leg pre-flight', () => {
  it('PASSES a clean ctx and examines all five legs', async () => {
    const r = await runCheck(E9, cleanCtx());
    expect(r.verdict).toBe(VERDICT.PASS);
    expect(r.examined).toBe(5);
    expect(E9_LEGS).toHaveLength(5);
  });

  it('SKIPS — not PASSES — a ctx carrying none of the five legs', async () => {
    const r = await runCheck(E9, {});
    expect(r.verdict).toBe(VERDICT.SKIPPED);
    expect(r.examined).toBe(0);
  });

  it('reports examined as legs SUPPLIED, never the constant 5 (§C82 L6)', async () => {
    const r = await runCheck(E9, { force: true });
    expect(r.examined).toBe(1);
    expect(r.verdict).not.toBe(VERDICT.PASS);
  });

  it('a leg the ctx does not carry is itself a FINDING — a pre-flight cannot pass what it did not check', async () => {
    const r = await runCheck(E9, { force: true });
    const unchecked = r.findings.filter((f) => f.kind === 'leg-not-checked').map((f) => f.leg);
    expect(unchecked.sort()).toEqual(['cost', 'handEdits', 'inputs', 'locked']);
  });

  it('WARNs — no longer FAILs — when a .locked sibling is present (advisory since 2026-08-30)', async () => {
    const r = await runCheck(E9, { ...cleanCtx(), locked: true });
    expect(r.verdict).toBe(VERDICT.WARN);
    // 🔴 THE FINDING MUST SURVIVE THE DOWNGRADE. Advisory was chosen OVER DELETION precisely
    // so the report still names the affected units; a WARN that dropped its findings would be
    // indistinguishable from a PASS and would defeat the reason for the choice.
    expect(r.findings.map((f) => f.leg)).toContain('locked');
    expect(r.examined).toBe(5); // a WARN at examined 0 is still a blocking failure in runTier
  });

  it('treats a NON-boolean locked as not-checked, never as "not locked"', async () => {
    // The permissive reading of a forgotten leg is the one that clobbers an edited baseline.
    for (const bad of [undefined, null, 'false', 0]) {
      const ctx = { ...cleanCtx(), locked: bad };
      const r = await runCheck(E9, ctx);
      expect(r.verdict, `locked=${JSON.stringify(bad)}`).toBe(VERDICT.FAIL);
      expect(r.findings.some((f) => f.kind === 'leg-not-checked' && f.leg === 'locked')).toBe(true);
    }
  });

  it('FAILS without --force — the loop always writes over existing output', async () => {
    const r = await runCheck(E9, { ...cleanCtx(), force: false });
    expect(r.verdict).toBe(VERDICT.FAIL);
    expect(r.findings.map((f) => f.leg)).toContain('force');
  });

  it('WARNs on a hand-edited 02-mt-output baseline, and still carries the commit', async () => {
    const r = await runCheck(E9, { ...cleanCtx(), handEdits: ['deadbeef'] });
    expect(r.verdict).toBe(VERDICT.WARN);
    // The commit list IS the artifact the decision doc names as the reason for advisory over
    // deletion — "the input to re-applying it". Assert the payload, never just the container.
    expect(r.findings.find((f) => f.leg === 'handEdits')?.commit).toBe('deadbeef');
    expect(r.examined).toBe(5);
  });

  /**
   * 🔴 THE PARTITION IS ON (leg, kind), AND THIS IS THE HALF THAT PROTECTS THE ARTIFACT.
   * `leg-not-checked` on an advisory leg still FAILS. Without this, a loader that silently
   * stopped supplying `handEdits` would return WARN / exit 0 with an EMPTY hand-edit report —
   * byte-identical to a genuinely clean run, and the exact N2-class shape `remt-ctx.js`'s
   * runState contract exists to prevent. Advisory means "we looked and are not halting",
   * never "we did no work".
   */
  describe('advisory is a property of the (leg, kind) PAIR, never of the leg alone', () => {
    for (const leg of ['locked', 'handEdits']) {
      it(`a leg-not-checked on the advisory leg '${leg}' still FAILS`, async () => {
        const ctx = { ...cleanCtx() };
        delete ctx[leg];
        const r = await runCheck(E9, ctx);
        expect(r.verdict).toBe(VERDICT.FAIL);
        expect(r.findings.some((f) => f.kind === 'leg-not-checked' && f.leg === leg)).toBe(true);
      });
    }

    it('a blocking finding beats a concurrent advisory one — FAIL, not WARN', async () => {
      const r = await runCheck(E9, { ...cleanCtx(), handEdits: ['deadbeef'], force: false });
      expect(r.verdict).toBe(VERDICT.FAIL);
      // Control: the advisory finding is still recorded alongside the blocking one, so this
      // is a verdict change and not a suppression.
      expect(r.findings.map((f) => f.leg)).toEqual(expect.arrayContaining(['handEdits', 'force']));
    });

    it('the message reports the two counts SEPARATELY, so a WARN cannot read as a PASS', async () => {
      const r = await runCheck(E9, { ...cleanCtx(), handEdits: ['a', 'b'] });
      expect(r.message).toMatch(/0 blocking findings/);
      expect(r.message).toMatch(/2 advisory/);
    });

    it('E9 stays BLOCKING — the downgrade is in the VERDICT, not in the flag', () => {
      // `blocking: false` would be the wrong lever: it would also stand down inputs, force
      // and cost, the three legs that gate a run which spends money.
      expect(E9.blocking).toBe(true);
    });
  });

  it('FAILS on a missing input', async () => {
    const r = await runCheck(E9, {
      ...cleanCtx(),
      inputs: [{ path: 'a/b.md', exists: false, bytes: 0 }],
    });
    expect(r.findings.find((f) => f.leg === 'inputs')?.detail).toBe('missing');
  });

  it('FAILS on a ZERO-BYTE input — it exists, so an existence check waves it through', async () => {
    const r = await runCheck(E9, {
      ...cleanCtx(),
      inputs: [{ path: 'a/b.md', exists: true, bytes: 0 }],
    });
    expect(r.findings.find((f) => f.leg === 'inputs')?.detail).toBe('empty');
  });

  it('REFUSES a cost estimate not produced with --force, however reasonable the number', async () => {
    // 🔴 A bare `--dry-run` reports ~0 ISK once output exists — a wrong answer that looks
    // like an answer. The leg checks PROVENANCE before it checks the value.
    const r = await runCheck(E9, { ...cleanCtx(), costEstimate: { isk: 1200, withForce: false } });
    expect(r.verdict).toBe(VERDICT.FAIL);
    expect(r.findings.find((f) => f.leg === 'cost')?.detail).toContain('--force --dry-run');
  });

  it('FAILS an estimate outside a supplied band, and PASSES inside it', async () => {
    const band = { minIsk: 100, maxIsk: 5000 };
    const out = await runCheck(E9, {
      ...cleanCtx(),
      costBand: band,
      costEstimate: { isk: 99999, withForce: true },
    });
    expect(out.verdict).toBe(VERDICT.FAIL);
    const inside = await runCheck(E9, { ...cleanCtx(), costBand: band });
    expect(inside.verdict).toBe(VERDICT.PASS);
  });

  it('FAILS an unusable estimate value', async () => {
    const r = await runCheck(E9, { ...cleanCtx(), costEstimate: { isk: NaN, withForce: true } });
    expect(r.verdict).toBe(VERDICT.FAIL);
  });
});

describe("isMtLocked — the loader's contract for leg 1", () => {
  it('is fail-safe: an existing but UNREADABLE marker counts as locked', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'e9-lock-'));
    try {
      const mt = path.join(dir, 'm1-segments.is.md');
      fs.writeFileSync(mt, 'x');
      expect(isMtLocked(mt)).toBe(false); // positive control: no marker => not locked

      fs.writeFileSync(mtLockPathFor(mt), '{"reason":"test"}');
      expect(isMtLocked(mt)).toBe(true);

      fs.writeFileSync(mtLockPathFor(mt), 'not json at all');
      // ⚠️ THIS is what a loader substituting fs.existsSync would keep by accident and what a
      // loader parsing the marker itself would LOSE: indeterminate must read as locked.
      expect(isMtLocked(mt)).toBe(true);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('registration', () => {
  it('registers E9 as a blocking Tier-1 gate', () => {
    expect(EXTRACT_CHECKS.map((c) => c.id)).toEqual([
      'E1',
      'E2',
      'E3',
      'E4',
      'E5',
      'E6',
      'E7',
      'E9',
    ]);
    expect(REGISTRY.get('E9')?.id).toBe('E9');
    expect(E9.tier).toBe(1);
    expect(E9.blocking).toBe(true);
  });
});

describe('E9 — findings from the blind adversarial review', () => {
  it('does NOT pass an EMPTY inputs list — the loader discovering nothing is not a clean leg', async () => {
    // 🔴 §C60's founding incident ("a --module that matched nothing, exit 0") reappearing
    // INSIDE the gate built to prevent it. A typo'd module id yields exactly this ctx end to
    // end: glob -> [], git log over nothing -> [], no file -> locked:false, dry-run over
    // nothing -> isk 0. Every leg reads green. Measured PASS/examined 5 before the fix.
    const r = await runCheck(E9, {
      locked: false,
      handEdits: [],
      inputs: [],
      force: true,
      costEstimate: { isk: 0, withForce: true },
    });
    expect(r.verdict).toBe(VERDICT.FAIL);
    expect(r.findings.find((f) => f.leg === 'inputs')?.detail).toContain('discovered nothing');
  });

  it('still PASSES one real input — the positive control for the empty-list FAIL above', async () => {
    const r = await runCheck(E9, cleanCtx());
    expect(r.verdict).toBe(VERDICT.PASS);
  });

  it('REFUSES an unusable costBand rather than silently dropping the ceiling', async () => {
    // `isk < undefined` and `isk > NaN` are both false, so each of these shapes removed the
    // ONLY value check on money while the operator believed a ceiling was enforced.
    // All three measured PASS at isk 99999 before the fix.
    for (const band of [
      { min: 100, max: 5000 }, // misspelt keys — the parseArgs class
      { minIsk: NaN, maxIsk: NaN },
      { minIsk: 100 }, // half-specified: max silently unenforced
      { minIsk: 5000, maxIsk: 100 }, // inverted: matches nothing, so never fires
    ]) {
      const r = await runCheck(E9, {
        ...cleanCtx(),
        costBand: band,
        costEstimate: { isk: 99999, withForce: true },
      });
      expect(r.verdict, `band ${JSON.stringify(band)}`).toBe(VERDICT.FAIL);
      expect(r.findings.find((f) => f.leg === 'cost')?.detail).toContain('unusable costBand');
    }
  });

  it('a WELL-FORMED band still bounds normally — the control for the refusals above', async () => {
    const band = { minIsk: 100, maxIsk: 5000 };
    expect((await runCheck(E9, { ...cleanCtx(), costBand: band })).verdict).toBe(VERDICT.PASS);
    const over = await runCheck(E9, {
      ...cleanCtx(),
      costBand: band,
      costEstimate: { isk: 99999, withForce: true },
    });
    expect(over.findings.find((f) => f.leg === 'cost')?.detail).toContain('outside band');
  });
});

describe('E9 leg 5 — the VALUE, not only the provenance', () => {
  it('REFUSES isk 0 — the exact symptom the leg exists to catch', async () => {
    // The leg's rationale is that a bare `--dry-run` reports ~0 ISK once output exists.
    // `withForce` is an assertion the gate cannot verify, and `Number.isFinite(0)` is true,
    // so before this fix `isk: 0` and `isk: -500` both read as clean estimates.
    for (const isk of [0, -500]) {
      const r = await runCheck(E9, { ...cleanCtx(), costEstimate: { isk, withForce: true } });
      expect(r.verdict, `isk=${isk}`).toBe(VERDICT.FAIL);
      expect(r.findings.find((f) => f.leg === 'cost')?.detail).toContain('unusable estimate');
    }
  });

  it('accepts a positive estimate — the control for the refusals above', async () => {
    const r = await runCheck(E9, { ...cleanCtx(), costEstimate: { isk: 1, withForce: true } });
    expect(r.verdict).toBe(VERDICT.PASS);
  });
});
