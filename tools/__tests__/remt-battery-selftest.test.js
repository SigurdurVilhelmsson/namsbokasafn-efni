/**
 * remt-battery-selftest.test.js — the META-test: does `--self-test` itself work?
 *
 * ── THE ONLY QUESTION THAT MATTERS HERE ──────────────────────────────────────
 * 🔴 A SELF-TEST THAT CANNOT GO RED IS WORSE THAN NO SELF-TEST, because it
 * prints reassurance. `server/scripts/verify-b4b0-gates.js:289-301` records the
 * live instance: deleting gate 1's assertion left it reporting PASS on a real
 * violation while the self-test still printed DETECTED. So this file does not
 * ask "does selfTest() pass?" — it NEUTERS gates and asks whether it notices.
 *
 * ── THE FOUR MUTANTS, AND WHY FOUR RATHER THAN ONE ───────────────────────────
 * Plan B's Task 13 specifies one: an always-PASS check must appear in
 * `failures`. That single assertion is satisfied by a `selfTest` that returns
 * EVERY id as a failure, which is the mirror tautology. So:
 *
 *   always-PASS   -> the id appears, kind `blind`        (the plan's case)
 *   always-FAIL   -> the id appears, kind `trigger-happy` (only the GOOD arm sees this)
 *   FAIL/examined 0 -> the id appears, kind `fixture`     (runCheck downgrades only PASS)
 *   NO OVERRIDES  -> `failures` is EMPTY                  ← the control
 *
 * ▶ THE CONTROL IS THE LOAD-BEARING ONE. Without it the other three pass
 * against an always-failing `selfTest`, and this file would certify nothing.
 * [[engineering-lessons]]: "pair every null with a positive control."
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { defineCheck, VERDICT, REGISTRY, runCheck } from '../lib/remt-battery.js';
import { selfTest, formatSelfTest, SELF_TEST_FIXTURES, FAILURE } from '../lib/remt-selftest.js';

const alwaysPass = (id, tier) =>
  defineCheck({
    id,
    tier,
    blocking: true,
    version: 1,
    run: () => ({ verdict: VERDICT.PASS, examined: 99, findings: [] }),
  });

describe('the self-test goes RED when a gate is neutered — it is not a tautology', () => {
  it('an always-PASS gate is reported BLIND (Plan B Task 13, step 1)', async () => {
    const report = await selfTest({ overrides: [alwaysPass('E4', 1)] });
    expect(report.failures.map((f) => f.id)).toContain('E4');
    // Bind the KIND, not just the presence: a `fixture` failure would also put
    // E4 in the list, and would mean something entirely different.
    expect(report.failures.find((f) => f.id === 'E4').kind).toBe(FAILURE.BLIND);
    expect(report.ok).toBe(false);
  });

  it('an always-FAIL gate is reported TRIGGER-HAPPY — the good arm earns its keep', async () => {
    // 🔴 THIS IS THE MUTANT THE PLAN'S SINGLE-ARM TEST CANNOT SEE. A gate that
    // fires on everything detects every planted defect and would halt a paid run
    // over healthy content. Only the known-good arm distinguishes it.
    const trigger = defineCheck({
      id: 'K2',
      tier: 4,
      blocking: true,
      version: 1,
      run: () => ({ verdict: VERDICT.FAIL, examined: 7, findings: [{ kind: 'x' }] }),
    });
    const report = await selfTest({ overrides: [trigger] });
    const f = report.failures.find((x) => x.id === 'K2');
    expect(f).toBeDefined();
    expect(f.kind).toBe(FAILURE.TRIGGER_HAPPY);
    // 🔴 `ok` WAS BOUND FOR ONLY ONE OF THE FOUR KINDS. `--self-test`'s exit code
    // and its "OK —" banner both read `report.ok`, so a rule that softened any
    // other kind would let the CLI print reassurance over a filed failure, with
    // every meta-test still green.
    expect(report.ok).toBe(false);
  });

  it('a gate that FAILs having examined nothing is a FIXTURE failure on BOTH arms', async () => {
    // `runCheck` downgrades only PASS, so a FAIL with `examined: 0` sails through
    // the contract and reads as a working detector. Both arms must object.
    const hollow = defineCheck({
      id: 'R3',
      tier: 3,
      blocking: true,
      version: 1,
      run: () => ({ verdict: VERDICT.FAIL, examined: 0, findings: [{ kind: 'x' }] }),
    });
    const report = await selfTest({ overrides: [hollow] });
    const arms = report.failures.filter((f) => f.id === 'R3');
    expect(arms.map((a) => a.arm).sort()).toEqual(['bad', 'good']);
    expect(new Set(arms.map((a) => a.kind))).toEqual(new Set([FAILURE.FIXTURE]));
    expect(report.ok).toBe(false);
    // The detail must NOT assert a mechanism it cannot know: examined 0 arrives
    // both from a ctx that never reached the gate AND from a gate that threw, and
    // `runCheck` renders the second as FAIL/0 with the exception in `message`.
    expect(arms[0].detail).toContain('or the gate threw');
    expect(arms[0].detail).toContain('Message:');
  });

  it('CONTROL — with no overrides the self-test is clean, so the three above mean something', async () => {
    const report = await selfTest();
    // 🔴 WITHOUT THIS, AN ALWAYS-FAILING `selfTest` PASSES EVERY TEST ABOVE.
    expect(report.failures).toEqual([]);
    expect(report.ok).toBe(true);
    // THE CONTAINER IS NOT THE PAYLOAD: assert it actually ran over the registry.
    expect(report.checked).toBe(REGISTRY.size);
    expect(report.results.length).toBe(REGISTRY.size);
  });
});

describe('the self-test covers the whole registry, or says which id it does not', () => {
  it('every registered check has a fixture pair', () => {
    const missing = [...REGISTRY.keys()].filter((id) => !SELF_TEST_FIXTURES[id]).sort();
    // `toEqual([])` so the failure NAMES the id rather than printing a count.
    expect(missing).toEqual([]);
    expect(REGISTRY.size).toBeGreaterThan(30); // control: an empty registry would pass vacuously
  });

  it('a check with no fixture is a NAMED failure, not a silent omission', async () => {
    // The scenario this guards: someone adds a 34th check and does not write a
    // fixture. An absent row would read exactly like a row with nothing to report.
    const registry = new Map(REGISTRY);
    registry.set(
      'Z9',
      defineCheck({
        id: 'Z9',
        tier: 2,
        blocking: true,
        version: 1,
        run: () => ({ verdict: VERDICT.PASS, examined: 1 }),
      })
    );
    const report = await selfTest({ registry });
    const f = report.failures.find((x) => x.id === 'Z9');
    expect(f).toBeDefined();
    expect(f.kind).toBe(FAILURE.NO_FIXTURE);
    expect(report.ok).toBe(false);
  });

  it('an override naming an unregistered id is refused', async () => {
    // A typo'd id would ADD a check nobody registered, so a meta-test would
    // "neuter" a gate that never existed and pass while proving nothing.
    await expect(selfTest({ overrides: [alwaysPass('E44', 1)] })).rejects.toThrow(
      /not a registered check id/
    );
  });
});

describe('every fixture arm actually reaches its gate', () => {
  // These duplicate what `selfTest()` asserts internally, on purpose: if the
  // internal assertions were ever weakened, the CONTROL test above would still
  // pass (empty failures) while the fixtures had silently stopped working. This
  // states the property from OUTSIDE the mechanism that enforces it.
  it('bad arms trip with examined > 0; good arms pass with examined > 0', async () => {
    const report = await selfTest();
    expect(report.results.length).toBe(REGISTRY.size);
    for (const r of report.results) {
      expect([VERDICT.FAIL, VERDICT.WARN], `${r.id} bad arm`).toContain(r.bad.verdict);
      expect(r.bad.examined, `${r.id} bad arm examined`).toBeGreaterThan(0);
      expect(r.good.verdict, `${r.id} good arm`).toBe(VERDICT.PASS);
      expect(r.good.examined, `${r.id} good arm examined`).toBeGreaterThan(0);
      // A bad arm with zero findings would be a verdict with nothing behind it.
      expect(r.bad.findings, `${r.id} bad arm findings`).toBeGreaterThan(0);
      expect(r.good.findings, `${r.id} good arm findings`).toBe(0);
    }
  });
});

describe('the self-test does no I/O — which is what keeps the CLI off the toucher list', () => {
  const read = (p) => fs.readFileSync(path.resolve(import.meta.dirname, '..', p), 'utf8');

  it('neither the CLI nor the self-test module imports a filesystem module', () => {
    // 🔴 `tools/remt-battery.js`'s docstring claims "This file performs NO I/O AT
    // ALL", and `source-write-guard.test.js` nets top-level `tools/*.js` that name
    // the read-only source tree. The claim is load-bearing: the day it stops being
    // true, that file belongs in the guard's ALLOW set with a classification.
    // The corpus reader lives in `tools/remt-sweep.js` instead, which IS in that set.
    for (const f of ['remt-battery.js', 'lib/remt-selftest.js']) {
      const src = read(f);
      expect(src, `${f} imports fs`).not.toMatch(
        /from\s+'node:fs'|require\(['"]node:fs|from\s+'fs'/
      );
    }
  });

  it('no fixture reaches the filesystem', () => {
    // The fixture thunks are evaluated in a process that must not read anything.
    // Checked structurally rather than by text: call every thunk and confirm none
    // throws and none returns a value carrying a function (which could close over I/O).
    for (const [id, f] of Object.entries(SELF_TEST_FIXTURES)) {
      for (const arm of ['bad', 'good']) {
        const ctx = f[arm]();
        expect(ctx, `${id}.${arm}`).toBeTypeOf('object');
        for (const [k, v] of Object.entries(ctx)) {
          expect(typeof v, `${id}.${arm}.${k} is a function`).not.toBe('function');
        }
      }
    }
    expect(Object.keys(SELF_TEST_FIXTURES).length).toBe(REGISTRY.size); // control
  });

  it('thunks return FRESH objects, so one check cannot contaminate the next', () => {
    const a = SELF_TEST_FIXTURES.E1.bad();
    const b = SELF_TEST_FIXTURES.E1.bad();
    expect(a).not.toBe(b);
    expect(a).toEqual(b);
  });
});

describe('formatSelfTest reports the failure, not just the count', () => {
  it('a clean report says so and disclaims what it is not', async () => {
    const text = formatSelfTest(await selfTest());
    expect(text).toContain('OK —');
    // The disclaimer is load-bearing: a green self-test says nothing about base
    // rates and nothing about whether a producer payload shape is current.
    expect(text).toContain('NOT a base rate');
  });

  it('a failing report names the id, the kind and the detail', async () => {
    const text = formatSelfTest(await selfTest({ overrides: [alwaysPass('E4', 1)] }));
    expect(text).toContain('E4');
    expect(text).toContain(FAILURE.BLIND);
    expect(text).toMatch(/blind/);
    expect(text).not.toContain('OK —');
  });
});

describe("each bad arm trips the leg its note NAMES — not merely 'some' leg", () => {
  /**
   * 🔴 TWO OF THESE WERE WRONG WHEN FIRST WRITTEN, AND BOTH WERE HAND-AUTHORED
   * NOTES RATHER THAN EXECUTED ONES. E5's note said "the figure-alt coverage leg"
   * while the fixture trips `alt-orphan-key` and leaves the coverage tally CLEAN;
   * E4's said "the segment-count leg" while the finding is a duplicate seg-id.
   * Both are §C82 L44③/L98/L103's shape a fourth time — an assertion naming a
   * thing without binding what distinguishes it — and neither was visible to any
   * assertion in this file, because every one of them was satisfied by "the bad
   * arm tripped".
   *
   * ⚠️ E5's case is the one with teeth: E5 is BLOCKING and its corpus rate comes
   * from the COVERAGE leg, so the self-test was certifying the leg that does NOT
   * fire on the corpus. The gap is acceptable — `remt-checks-extract-alt.test.js`
   * pins the coverage leg directly — but it had to be SAID, and now it cannot
   * drift silently.
   *
   * The signature is `leg || kind || type`, falling back to the finding's own
   * shape for the two checks whose findings carry none (E4 emits `{id, count}`;
   * E7 emits a plain string).
   */
  const EXPECTED_LEG = {
    G1: 'glossary-competition',
    G2: 'element-suffix',
    G3: 'function-word-headword',
    G4: 'cross-book-disagreement',
    G5: 'payload',
    E1: 'legacy-marker',
    E2: 'i',
    E3: 'xml-residue',
    E4: '{count,id}',
    E5: 'alt-orphan-key',
    E6: 'unexpected-file:duplicate',
    E7: 'segment-id-set changed',
    E9: 'force',
    A1: 'seg-id-set-mismatch',
    A6: 'legacy-marker',
    A2b: 'id-charset',
    A2c: 'spaced-seg-marker',
    A2a: 'markers-normalized',
    A4: 'invented-marker',
    A8: 'malformed-usage',
    A3: 'marker-delta',
    A5: 'en-residue',
    A7: 'number-mismatch',
    R1: 'unexplained-tag-count',
    R2: 'attr-count-mismatch',
    R3: 'schema-error',
    R4: 'render-error',
    R5: 'untranslated-leaf',
    K1: 'shape-drift',
    K2: 'cross-stage-drop',
    K3: 'unaccounted-rename',
    K4: 'genuine-math-drop',
    K5: 'raw-cnxml-leak',
  };

  it('every registered check has an expected leg — no id drifts out of this table', () => {
    expect(Object.keys(EXPECTED_LEG).sort()).toEqual([...REGISTRY.keys()].sort());
  });

  it('the observed leg matches the expected one for all 33', async () => {
    expect(Object.keys(EXPECTED_LEG).length).toBe(REGISTRY.size); // control: a vacuous loop passes
    for (const id of REGISTRY.keys()) {
      const r = await runCheck(REGISTRY.get(id), SELF_TEST_FIXTURES[id].bad());
      const f = r.findings[0];
      expect(f, `${id} bad arm produced no finding`).toBeDefined();
      const sig =
        typeof f === 'string'
          ? f
          : f.leg || f.kind || f.type || `{${Object.keys(f).sort().join(',')}}`;
      expect(sig, `${id} tripped a different leg than its note claims`).toBe(EXPECTED_LEG[id]);
    }
  });
});

describe('the self-test cannot certify a registry it never saw', () => {
  it('an EMPTY registry throws instead of reporting ok', async () => {
    // Measured before the fix: `{ok: true, checked: 0, failures: []}` — a
    // self-test that certified nothing, reporting success. The registry is
    // populated by IMPORT, so empty means the tier modules never loaded.
    await expect(selfTest({ registry: new Map() })).rejects.toThrow(/registry is EMPTY/);
  });

  it('the self-test imports the SAME tier modules the CLI wires', () => {
    // 🔴 THE "every registered check has a fixture" GUARANTEE IS IMPORT-SCOPED.
    // `REGISTRY` holds whatever has been imported, so a sixth tier module wired
    // into the CLI but not into `remt-selftest.js` would never appear in
    // `selfTest`'s registry — and the coverage assertion, which compares fixtures
    // against that same registry, would stay green while the new tier went
    // uncertified. The assertion belongs BETWEEN the two files, because neither
    // one's own tests can see the divergence.
    // ⚠️ LINE-ANCHORED (`^import`) ON PURPOSE. The CLI's docstring QUOTES all five
    // import lines as example text, so an unanchored pattern found 10 — which the
    // control below caught on the first run. A comment that looks like code is
    // indistinguishable from code to a regex.
    const grab = (rel) =>
      [
        ...fs
          .readFileSync(path.resolve(import.meta.dirname, '..', rel), 'utf8')
          .matchAll(/^import\s+'\.[./]*(?:lib\/)?(remt-checks-[a-z]+\.js)';/gm),
      ]
        .map((m) => m[1])
        .sort();
    const cli = grab('remt-battery.js');
    const st = grab('lib/remt-selftest.js');
    expect(cli.length, 'the CLI imports no tier module — the grab pattern broke').toBe(5);
    expect(st).toEqual(cli);
  });
});
