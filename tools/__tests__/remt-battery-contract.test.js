import { describe, it, expect } from 'vitest';
import { defineCheck, runCheck, registerChecks, REGISTRY, VERDICT } from '../lib/remt-battery.js';

describe('the check contract', () => {
  it('turns a zero-examined PASS into SKIPPED — a pass is never inferred from an empty run', async () => {
    const check = defineCheck({
      id: 'X1',
      tier: 1,
      blocking: true,
      version: 1,
      run: () => ({ verdict: VERDICT.PASS, examined: 0, findings: [] }),
    });
    const r = await runCheck(check, {});
    expect(r.verdict).toBe(VERDICT.SKIPPED);
    expect(r.message).toMatch(/examined 0 units/);
  });

  it('stamps id, tier, blocking and version onto every result', async () => {
    const check = defineCheck({
      id: 'X2',
      tier: 0,
      blocking: false,
      version: 7,
      run: () => ({ verdict: VERDICT.PASS, examined: 3, findings: [] }),
    });
    const r = await runCheck(check, {});
    expect(r).toMatchObject({ id: 'X2', tier: 0, blocking: false, version: 7, examined: 3 });
  });

  it('a throwing check becomes FAIL, never an absent result', async () => {
    const check = defineCheck({
      id: 'X3',
      tier: 1,
      blocking: true,
      version: 1,
      run: () => {
        throw new Error('boom');
      },
    });
    const r = await runCheck(check, {});
    expect(r.verdict).toBe(VERDICT.FAIL);
    expect(r.message).toMatch(/boom/);
  });

  it('refuses a check that declares blocking without a version', () => {
    expect(() => defineCheck({ id: 'X4', tier: 1, blocking: true, run: () => ({}) })).toThrow(
      /version/
    );
  });

  it('a FAIL with examined 0 stays FAIL — only a PASS is downgraded', async () => {
    const check = defineCheck({
      id: 'X5',
      tier: 1,
      blocking: true,
      version: 1,
      run: () => ({ verdict: VERDICT.FAIL, examined: 0, findings: ['bad'] }),
    });
    expect((await runCheck(check, {})).verdict).toBe(VERDICT.FAIL);
  });
});

/**
 * 🔴 THE VERDICT GUARD. Global Constraint 1 says every gate returns THREE things,
 * always: verdict, version, examined. `version` is enforced at define time and
 * `examined` at run time — but a verdict that is absent or misspelt was carried
 * straight through to the caller, and Plan C's driver reaches its halt decision by
 * calling runCheck() directly ("the driver never judges", Plan C constraint 2).
 * Downstream, `exitCodeFor` counts only FAIL and SKIPPED as blocking failures, so
 * an unrecognised verdict READ AS A PASS and let a paid module through — §C60 in
 * the one file built to make §C60 impossible.
 *
 * Every test in this block was RED against the contract as the plan wrote it,
 * measured before the guard was typed. See the commit body for the run.
 */
describe('the verdict guard — an unrecognised verdict must never read as a pass', () => {
  const mk = (id, out) => defineCheck({ id, tier: 1, blocking: true, version: 1, run: () => out });

  it('a check that returns NO verdict at all becomes FAIL', async () => {
    // The sharpest shape: `examined: 0` is finite so the missing-count guard stands
    // down, and `undefined !== VERDICT.PASS` so the zero-examined downgrade stands
    // down too. It slipped past BOTH guards and exited 0.
    const r = await runCheck(mk('X6', { examined: 0, findings: [] }), {});
    expect(r.verdict).toBe(VERDICT.FAIL);
    expect(r.message).toMatch(/verdict/i);
  });

  it('a misspelt verdict becomes FAIL rather than passing through', async () => {
    const r = await runCheck(mk('X7', { verdict: 'ok', examined: 5, findings: [] }), {});
    expect(r.verdict).toBe(VERDICT.FAIL);
    expect(r.message).toMatch(/ok/);
  });

  it('POSITIVE CONTROL: all four legitimate verdicts survive the guard unchanged', async () => {
    // Without this, a guard that simply failed everything would look identical.
    for (const v of [VERDICT.PASS, VERDICT.FAIL, VERDICT.WARN, VERDICT.SKIPPED]) {
      const r = await runCheck(mk(`X8-${v}`, { verdict: v, examined: 4, findings: [] }), {});
      expect(r.verdict).toBe(v);
    }
  });
});

/**
 * `examined` is a COUNT. `Number(null)` is 0 and `Number.isFinite(-1)` is true, so
 * the plan's coercion accepted both — reporting a check's own defect as the benign
 * "examined nothing" instead of surfacing it.
 */
describe('the examined guard — a count is a non-negative integer or it is a defect', () => {
  const mk = (id, out) => defineCheck({ id, tier: 1, blocking: true, version: 1, run: () => out });

  it('a null examined is a FAIL, not a quiet SKIPPED', async () => {
    const r = await runCheck(mk('X9', { verdict: VERDICT.PASS, examined: null }), {});
    expect(r.verdict).toBe(VERDICT.FAIL);
    expect(r.message).toMatch(/examined/);
  });

  it('a negative examined is a FAIL, not a pass', async () => {
    const r = await runCheck(mk('X10', { verdict: VERDICT.PASS, examined: -1 }), {});
    expect(r.verdict).toBe(VERDICT.FAIL);
  });

  it('a missing examined is a FAIL — the §C60 rule', async () => {
    const r = await runCheck(mk('X11', { verdict: VERDICT.PASS }), {});
    expect(r.verdict).toBe(VERDICT.FAIL);
    expect(r.message).toMatch(/examined/);
  });
});

/**
 * A tier typo makes a check invisible to `runTier`, which filters on `c.tier === tier`
 * with strict equality against a parseArgs `type: 'number'`. 🔴 "A gate that is never
 * called is indistinguishable from one that does not exist" — closed at construction,
 * where it is one line, rather than discovered by a sweep that reports zeros.
 */
describe('the tier guard — a check that cannot be selected has silently ceased to exist', () => {
  it('refuses a string tier', () => {
    expect(() =>
      defineCheck({ id: 'X12', tier: '1', blocking: true, version: 1, run: () => ({}) })
    ).toThrow(/tier/);
  });

  it('refuses a tier outside 0–4', () => {
    expect(() =>
      defineCheck({ id: 'X13', tier: 5, blocking: true, version: 1, run: () => ({}) })
    ).toThrow(/tier/);
  });

  it('refuses a missing tier', () => {
    expect(() => defineCheck({ id: 'X14', blocking: true, version: 1, run: () => ({}) })).toThrow(
      /tier/
    );
  });

  it('POSITIVE CONTROL: every tier the battery actually uses is accepted', () => {
    for (const tier of [0, 1, 2, 3, 4]) {
      expect(() =>
        defineCheck({ id: `X15-${tier}`, tier, blocking: false, version: 1, run: () => ({}) })
      ).not.toThrow();
    }
  });
});

/**
 * 🔴 THE `findings` GUARD — the sharpest finding of the four review lenses, because
 * the plan's OWN Task 3 wrapper trips it. `tools/lib/bracket-body-check.js:218`
 * returns an OBJECT `{ examined, findings, skippedUnmatchable, ok }`, while Plan B
 * line 490 specifies E2 as `const findings = checkBracketBodies(cnxml, segText) || []`
 * followed by `verdict: findings.length ? FAIL : PASS`. `{}.length` is `undefined`,
 * which is falsy, so a BLOCKING Tier-1 gate reads PASS. Measured on the very modules
 * the plan names as must-trip fixtures: ch04/m68710 (ground truth 2 findings) and
 * ch06/m68733 (1 finding) both came back PASS.
 *
 * ⚠️ THIS GUARD IS A DETECTOR, NOT THE REPAIR. The repair is Task 3's
 * `const { findings } = checkBracketBodies(...)`. A green here does not close E2.
 *
 * ⚠️ AND THE OBVIOUS FIX IS THE WRONG ONE. Coercing with
 * `Array.isArray(out.findings) ? out.findings : []` was measured to still return PASS
 * *and* to erase the `ok:false` evidence — strictly worse than doing nothing. A wrong
 * shape must FAIL loudly; it must not be normalised away.
 */
describe('the findings guard — a wrong shape must fail loudly, never be normalised away', () => {
  const mk = (id, out) => defineCheck({ id, tier: 1, blocking: true, version: 1, run: () => out });

  it('a non-array findings is a FAIL — the shape Task 3 would otherwise hand it', async () => {
    const objectShaped = { examined: 342, findings: ['swallowed body'], ok: false };
    const r = await runCheck(
      mk('X16', { verdict: VERDICT.PASS, examined: 342, findings: objectShaped }),
      {}
    );
    expect(r.verdict).toBe(VERDICT.FAIL);
    expect(r.message).toMatch(/findings/);
  });

  it('POSITIVE CONTROL: an omitted findings is still fine — it is documented optional', async () => {
    const r = await runCheck(mk('X17', { verdict: VERDICT.PASS, examined: 4 }), {});
    expect(r.verdict).toBe(VERDICT.PASS);
    expect(r.findings).toEqual([]);
  });

  it('POSITIVE CONTROL: supplied findings arrive UNCHANGED — the evidence is not dropped', async () => {
    // Without this, the mutant `findings: []` on the main return path survives the
    // whole suite, silently discarding the evidence behind every blocking FAIL.
    const given = [{ seg: 'm1:para:p1', why: 'marker body swallowed' }];
    const r = await runCheck(
      mk('X18', { verdict: VERDICT.FAIL, examined: 9, findings: given }),
      {}
    );
    expect(r.findings).toEqual(given);
  });
});

/**
 * 🔴 `blocking` DECIDES WHETHER A FAIL HALTS A PAID RUN, AND IT WAS THE ONE FIELD WITH
 * NO GUARD. `id`, `tier`, `version` and `run` all throw on a bad value; `blocking` was
 * `Boolean(blocking)`, which fails OPEN. Four independent review lenses reproduced the
 * same trace: a spec-BLOCKING check written without the key is accepted as
 * `blocking: false`, and Task 2's `exitCodeFor` then returns 0 while the gate is
 * printing FAIL over 342 examined units.
 *
 * ⚠️ `Boolean()` is unsafe in BOTH directions — `blocking: 'false'` coerced to `true`,
 * turning an advisory check into a halt on a paid run. Only an explicit type check
 * closes both, which is why the coercion is gone rather than merely guarded.
 */
describe('the blocking guard — the field that decides whether a paid run halts', () => {
  it('refuses an omitted blocking — it must be stated, not defaulted', () => {
    expect(() => defineCheck({ id: 'X19', tier: 1, version: 1, run: () => ({}) })).toThrow(
      /blocking/
    );
  });

  it("refuses the string 'false', which Boolean() would have coerced to TRUE", () => {
    expect(() =>
      defineCheck({ id: 'X20', tier: 1, blocking: 'false', version: 1, run: () => ({}) })
    ).toThrow(/blocking/);
  });

  it("refuses the string 'yes'", () => {
    expect(() =>
      defineCheck({ id: 'X21', tier: 1, blocking: 'yes', version: 1, run: () => ({}) })
    ).toThrow(/blocking/);
  });

  it('POSITIVE CONTROL: both booleans construct and round-trip onto the result', async () => {
    for (const blocking of [true, false]) {
      const c = defineCheck({
        id: `X22-${blocking}`,
        tier: 1,
        blocking,
        version: 1,
        run: () => ({ verdict: VERDICT.FAIL, examined: 2, findings: [] }),
      });
      expect(c.blocking).toBe(blocking);
      expect((await runCheck(c, {})).blocking).toBe(blocking);
    }
  });
});

/**
 * `version` used `typeof version !== 'number'` while the line above it used
 * `Number.isInteger`. `typeof NaN === 'number'`, so `version: NaN` was accepted — and
 * `JSON.stringify(NaN)` is `null`, so the ledger would carry a null where the stamp
 * that decision ① quarantines on is supposed to be.
 */
describe('the version guard — a stamp that serialises to null is not a stamp', () => {
  const ok = (version) => () =>
    defineCheck({ id: `X23-${version}`, tier: 1, blocking: true, version, run: () => ({}) });

  it('refuses NaN — typeof says number, JSON.stringify says null', () => {
    expect(ok(NaN)).toThrow(/version/);
  });

  it('refuses Infinity, for the same reason', () => {
    expect(ok(Infinity)).toThrow(/version/);
  });

  it('refuses a fractional version', () => {
    expect(ok(1.5)).toThrow(/version/);
  });

  it('POSITIVE CONTROL: the versions the plan actually writes are accepted', () => {
    expect(ok(1)).not.toThrow();
    expect(ok(7)).not.toThrow();
  });
});

/**
 * 🔴 NO TEST EXERCISED AN ASYNC CHECK AT ALL, and Task 7's G5 is necessarily async —
 * it is resolved by SPAWNING `server/scripts/check-glossary-payload.js` (the MIT→AGPL
 * boundary is why it is spawned and not imported), with a JSON-parse failure specified
 * to reject with stderr attached. Measured: deleting the `await` in runCheck survived
 * the whole suite, and under that mutant a rejecting check escapes the try/catch as an
 * unhandled rejection that KILLS THE PROCESS.
 *
 * ⚠️ The message assertion below is load-bearing — without it the mutant still returns
 * *a* FAIL and the test passes.
 */
describe('async checks — the shape G5 must take', () => {
  it('an async check that resolves is awaited, not treated as a missing count', async () => {
    const c = defineCheck({
      id: 'X24',
      tier: 0,
      blocking: true,
      version: 1,
      run: async () => ({ verdict: VERDICT.PASS, examined: 5, findings: [] }),
    });
    const r = await runCheck(c, {});
    expect(r.verdict).toBe(VERDICT.PASS);
    expect(r.examined).toBe(5);
  });

  it('an async check that REJECTS becomes FAIL carrying its reason, not a crash', async () => {
    const c = defineCheck({
      id: 'X25',
      tier: 0,
      blocking: true,
      version: 1,
      run: async () => {
        throw new Error('spawn died: check-glossary-payload.js emitted no JSON');
      },
    });
    const r = await runCheck(c, {});
    expect(r.verdict).toBe(VERDICT.FAIL);
    expect(r.message).toMatch(/spawn died/);
  });
});

/**
 * Mutation kills for guards that were otherwise unpinned. Each of these went red
 * against a deliberately mutated copy of the module.
 */
describe('mutation kills — guards that no other test could see', () => {
  const mk = (id, run) => defineCheck({ id, tier: 1, blocking: true, version: 1, run });

  it('a check returning nothing at all is a FAIL and RESOLVES — a block-body arrow typo', async () => {
    // ⚠️ Assert on /examined/, never on /null/: JSON.stringify(undefined) yields the
    // string "undefined" for BOTH of these, so a /null/ matcher goes red against
    // correct code.
    for (const run of [() => {}, () => null]) {
      const r = await runCheck(mk(`X26-${run.length}${String(run)}`.slice(0, 12), run), {});
      expect(r.verdict).toBe(VERDICT.FAIL);
      expect(r.message).toMatch(/examined/);
    }
  });

  it('a fractional examined is a FAIL — isFinite would have let it through', async () => {
    // Reachable: Plan B:792 warns E5's author off residue-check.js's `ratio`, which
    // sits in the same return object as the count they do want.
    const r = await runCheck(
      mk('X27', () => ({ verdict: VERDICT.PASS, examined: 2.5 })),
      {}
    );
    expect(r.verdict).toBe(VERDICT.FAIL);
  });

  it('a WARN that examined 0 stays WARN AND KEEPS ITS FINDINGS — only PASS is downgraded', async () => {
    const r = await runCheck(
      mk('X28', () => ({ verdict: VERDICT.WARN, examined: 0, findings: ['quarantine me'] })),
      {}
    );
    expect(r.verdict).toBe(VERDICT.WARN);
    expect(r.findings).toEqual(['quarantine me']);
  });
});

describe('registerChecks', () => {
  const mk = (id) => defineCheck({ id, tier: 2, blocking: false, version: 1, run: () => ({}) });

  it('registers a check and returns the registry', () => {
    const reg = registerChecks([mk('X29')]);
    expect(reg).toBe(REGISTRY);
    expect(REGISTRY.get('X29').id).toBe('X29');
  });

  it('refuses a duplicate id — two checks answering to one name is unresolvable', () => {
    registerChecks([mk('X30')]);
    expect(() => registerChecks([mk('X30')])).toThrow(/duplicate/);
  });
});
