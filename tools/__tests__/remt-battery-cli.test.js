import { describe, it, expect, afterEach } from 'vitest';
import { defineCheck, REGISTRY, VERDICT } from '../lib/remt-battery.js';
import { runTier, exitCodeFor, parseTier, TIER_MIN, TIER_MAX } from '../remt-battery.js';

const mk = (id, verdict, blocking, examined = 1, tier = 1) =>
  defineCheck({ id, tier, blocking, version: 1, run: () => ({ verdict, examined, findings: [] }) });

describe('runTier', () => {
  it('exit 1 when a BLOCKING check fails', async () => {
    const r = await runTier(1, {}, [mk('B1', VERDICT.FAIL, true)]);
    expect(exitCodeFor(r)).toBe(1);
  });

  it('exit 0 when only an ADVISORY check fails', async () => {
    const r = await runTier(1, {}, [mk('B2', VERDICT.FAIL, false)]);
    expect(exitCodeFor(r)).toBe(0);
  });

  it('a SKIPPED blocking check does NOT pass silently — it is reported and exits 1', async () => {
    // §C60: examined 0 is the shape that must never read as clean.
    const r = await runTier(1, {}, [mk('B3', VERDICT.PASS, true, 0)]);
    expect(r.results[0].verdict).toBe(VERDICT.SKIPPED);
    expect(exitCodeFor(r)).toBe(1);
  });

  it('every result carries id, version and examined — the JSON contract', async () => {
    const r = await runTier(1, {}, [mk('B4', VERDICT.PASS, true)]);
    for (const res of r.results) {
      expect(res).toHaveProperty('id');
      expect(res).toHaveProperty('version');
      expect(res).toHaveProperty('examined');
    }
  });
});

/**
 * 🔴 L5 — AN EMPTY SELECTED SET MUST NOT REPORT A CLEAN RUN.
 *
 * This is the tier-level twin of the contract's `examined 0` rule, and it is
 * reachable today rather than hypothetically: **L3 measured that no task in either
 * plan ever CALLS `registerChecks()`.** Plan B's two occurrences of
 * `registerChecks(` are the doc comment and the definition; the third mention is an
 * import BINDING, which a keyword grep cannot tell from a call. So a literal
 * transcription of the plan runs with an empty REGISTRY, selects 0 checks, computes
 * `blockingFailures = []`, and exits **0** for every tier — the whole battery
 * reporting clean while judging nothing.
 *
 * ▶ IT THROWS RATHER THAN RETURNING A FLAG, and that choice is the point. Plan C's
 * driver reaches its halt decision from `blockingFailures`; a returned `selected: 0`
 * is a field a consumer can simply not read, whereas an exception cannot be ignored
 * by anyone. The CLI's own catch maps it to exit 2 (usage-or-environment), so
 * `exitCodeFor` keeps the plan's documented 0/1 contract untouched.
 */
describe('the empty-selection refusal', () => {
  it('throws rather than returning a green empty run', async () => {
    await expect(runTier(1, {}, [])).rejects.toThrow(/no checks selected/);
  });

  it('throws when the REGISTRY holds nothing for the requested tier', async () => {
    // The L3 shape exactly: nothing registered for tier 3.
    await expect(runTier(3, {})).rejects.toThrow(/no checks selected/);
  });

  it('the message says how big the registry is, so the cause is readable', async () => {
    await expect(runTier(3, {})).rejects.toThrow(/registry holds \d+/);
  });

  it('POSITIVE CONTROL: a registered check IS selected from the REGISTRY by tier', async () => {
    // Without this, the refusal above could be passing because selection is broken
    // rather than because the registry is empty.
    const { registerChecks } = await import('../lib/remt-battery.js');
    registerChecks([mk('B5', VERDICT.PASS, true, 7, 4)]);
    const r = await runTier(4, {});
    expect(r.results.map((x) => x.id)).toEqual(['B5']);
    expect(r.results[0].examined).toBe(7);
  });
});

/**
 * 🔴 L4 — `--tier` COULD NOT BE TRUSTED, AND THE FAILURE WAS A SILENT EXIT 0.
 *
 * `parseArgs` coerces `type: 'number'` with `parseInt(raw, 10)` (parseArgs.js:178).
 * Measured: `parseInt('abc')` is **NaN**, and the plan's guard is
 * `if (args.tier == null)` — but **`NaN == null` is false**, so NaN passes the
 * guard; `c.tier === NaN` then selects zero checks and the run exits 0.
 *
 * ⚠️ AND IT IS WORSE THAN THAT, which is why `--tier` is declared as a STRING here
 * and validated, rather than guarded after the fact: `parseInt` TRUNCATES.
 * `parseInt('1.5')` is **1** and `parseInt('1abc')` is **1** — both already lossy by
 * the time any numeric guard could see them, so `Number.isInteger` on the parsed
 * value cannot detect either. Only inspecting the raw string can.
 */
describe('parseTier — the raw string is the only place the error is still visible', () => {
  it('accepts every tier the battery defines', () => {
    for (let t = TIER_MIN; t <= TIER_MAX; t++) expect(parseTier(String(t))).toBe(t);
  });

  it('rejects a non-numeric tier — parseInt would have yielded NaN', () => {
    expect(parseTier('abc')).toBeNull();
  });

  it('rejects a fractional tier — parseInt would have TRUNCATED it to 1', () => {
    expect(parseTier('1.5')).toBeNull();
  });

  it('rejects a trailing-garbage tier — parseInt would have TRUNCATED it to 1', () => {
    expect(parseTier('1abc')).toBeNull();
  });

  it('rejects a tier outside the range', () => {
    expect(parseTier('5')).toBeNull();
    expect(parseTier('-1')).toBeNull();
  });

  it('rejects absent and empty', () => {
    expect(parseTier(null)).toBeNull();
    expect(parseTier('')).toBeNull();
    expect(parseTier(undefined)).toBeNull();
  });
});

describe('exitCodeFor keeps the plan’s documented 0/1 contract', () => {
  it('is 0 when nothing blocking failed', async () => {
    const r = await runTier(1, {}, [mk('B6', VERDICT.PASS, true, 3)]);
    expect(exitCodeFor(r)).toBe(0);
  });

  it('counts a blocking FAIL and a blocking SKIPPED alike', async () => {
    const r = await runTier(1, {}, [
      mk('B7', VERDICT.FAIL, true),
      mk('B8', VERDICT.PASS, true, 0),
      mk('B9', VERDICT.PASS, false, 0),
    ]);
    expect(r.blockingFailures.map((f) => f.id).sort()).toEqual(['B7', 'B8']);
    expect(exitCodeFor(r)).toBe(1);
  });
});

afterEach(() => {
  // The registry is a module singleton. Vitest isolates per FILE, not per test, so
  // ids must stay unique within this file; nothing is torn down deliberately —
  // `resetRegistry()` was considered and rejected, because an exported
  // registry-emptier is itself a new wrong-PASS surface.
  expect(REGISTRY).toBeInstanceOf(Map);
});
