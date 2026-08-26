/**
 * remt-checks-output.test.js — §C82 Plan B Task 11, Tier 3 (R1-R5).
 *
 * ⚠️ READ `tools/lib/remt-checks-output.js`'s HEADER FIRST. It records why three of the
 * five checks are advisory, what each one's `examined` unit is and what its zero-set is,
 * and — the finding that shapes the tier — that Tier 3 is the first tier whose INPUTS are
 * OUTPUTS of the pipeline it judges, so no base rate measured today is a rate for the
 * code that will run.
 *
 * 🔴 TWO CONVENTIONS THIS FILE HOLDS TO, BOTH FROM MEASURED FAILURES:
 * ① **Every positive fixture that must be READ is built by CALLING THE REAL PRODUCER**
 *    (§C82 L48). R2's must-trip comes from `buildCnxml`, not from a hand-written report
 *    object, so a producer-side rename surfaces here as a red test rather than as a check
 *    that agrees with its fixture and disagrees with reality.
 * ② **Every zero is paired with a non-zero in the same test** (§C82 L37: `[].every(...)`
 *    is vacuously true, and an assertion that names the thing without binding what
 *    distinguishes it pins nothing). Where a check is asserted CLEAN, the count it
 *    examined is asserted non-zero beside it.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { runCheck, VERDICT } from '../lib/remt-battery.js';
import {
  R1,
  R2,
  R3,
  R4,
  R5,
  OUTPUT_CHECKS,
  elementNamesCompared,
  leafElementsCompared,
  spawnSchemaCheck,
} from '../lib/remt-checks-output.js';
import { loadAllowlist, loadAllowlistOrNull } from '../lib/fidelity-allowlist.js';
import { extractSegments, formatSegmentsMarkdown } from '../cnxml-extract.js';
import { parseSegments, buildCnxml } from '../cnxml-inject.js';

const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..');
const read = (p) => fs.readFileSync(path.join(REPO_ROOT, p), 'utf8');
const SRC = (b, ch, m) => read(`books/${b}/01-source/${ch}/${m}.cnxml`);
const TR = (b, ch, m, track = 'mt-preview') =>
  read(`books/${b}/03-translated/${track}/${ch}/${m}.cnxml`);

describe('the tier registers as tier 3, and the blocking split is the measured one', () => {
  it('all five are tier 3', () => {
    expect(OUTPUT_CHECKS.map((c) => c.tier)).toEqual([3, 3, 3, 3, 3]);
    expect(OUTPUT_CHECKS.map((c) => c.id)).toEqual(['R1', 'R2', 'R3', 'R4', 'R5']);
  });

  it('R2 and R3 block; R1, R4 and R5 do not — each for a reason recorded in the header', () => {
    // 🔴 A PIN, NOT A RESTATEMENT. Global Constraint 4 needs a measured base rate ≤ ~5%
    // AND a known-bad fixture. R2 = 1.20% (2 of 166), R3 = 0.0% (0 of 161, with the
    // default allowlist giving 250 errors in 136 files as the control that makes the zero
    // mean something). R1's organic denominator is 100% March 2026, R4's ID rate is
    // unmeasurable against a July render, R5 is ≥16.8%. Flipping any of these needs a new
    // measurement, and this assertion is what makes that deliberate.
    expect(Object.fromEntries(OUTPUT_CHECKS.map((c) => [c.id, c.blocking]))).toEqual({
      R1: false,
      R2: true,
      R3: true,
      R4: false,
      R5: false,
    });
  });
});

describe('R1 — unexplained tag-count discrepancies', () => {
  it('a module whose discrepancies are ALL allowlisted passes, and examined is non-zero', () => {
    const ctx = {
      book: 'efnafraedi-2e',
      module: 'm68846',
      cnxml: SRC('efnafraedi-2e', 'ch20', 'm68846'),
      translatedCnxml: TR('efnafraedi-2e', 'ch20', 'm68846'),
      fidelityAllowlist: loadAllowlist('books/efnafraedi-2e'),
    };
    const r = R1.run(ctx);
    expect(r.verdict).toBe(VERDICT.PASS);
    expect(r.findings).toHaveLength(0);
    // 🔴 THE NON-VACUITY CONTROL. m68846 really does carry two discrepancies
    // (emphasis −2, sup −1); a PASS here means "explained", not "nothing was compared".
    // Without this the test would pass just as well on an empty comparison.
    expect(r.examined).toBeGreaterThan(0);
    expect(r.message).toMatch(/0 unexplained of 2 tag-count discrepancies/);
  });

  it('THE SAME MODULE FAILS with no allowlist — which is why the loader must be OrNull', () => {
    // §C21/§C82 L57's third instance. `loadAllowlist` returns `{entries: []}` for an
    // ABSENT file, so a book with no allowlist would be judged "nothing is pre-explained"
    // and be indistinguishable from a deliberately-empty one. Here the two states are
    // shown to produce DIFFERENT verdicts on identical bytes — which is exactly why the
    // distinction has to survive the loader.
    const base = {
      book: 'efnafraedi-2e',
      module: 'm68846',
      cnxml: SRC('efnafraedi-2e', 'ch20', 'm68846'),
      translatedCnxml: TR('efnafraedi-2e', 'ch20', 'm68846'),
    };
    const r = R1.run({ ...base, fidelityAllowlist: null });
    expect(r.verdict).toBe(VERDICT.FAIL);
    expect(r.findings).toHaveLength(2);
    expect(r.message).toMatch(/NOTHING is pre-explained/);
  });

  it('lifraen-efnafraedi genuinely has NO allowlist file, and OrNull says so', () => {
    // The measurement behind the rule, asserted rather than described: of the six books
    // with an `01-source`, exactly one has a fidelity allowlist. If organic ever gains
    // one, this goes red and R1's advisory rationale must be re-derived.
    expect(loadAllowlistOrNull('books/lifraen-efnafraedi')).toBeNull();
    expect(loadAllowlistOrNull('books/efnafraedi-2e').entries.length).toBeGreaterThan(0);
    // …and the plain loader flattens the two into the same value. This is the defect.
    expect(loadAllowlist('books/lifraen-efnafraedi')).toEqual({ entries: [] });
  });

  it('SKIPPED, naming the loader, when fidelityAllowlist is undefined rather than null', () => {
    const r = R1.run({
      book: 'efnafraedi-2e',
      module: 'm68846',
      cnxml: SRC('efnafraedi-2e', 'ch20', 'm68846'),
      translatedCnxml: TR('efnafraedi-2e', 'ch20', 'm68846'),
    });
    expect(r.verdict).toBe(VERDICT.SKIPPED);
    expect(r.message).toMatch(/loadAllowlistOrNull/);
  });

  it('SKIPPED when either side of the comparison is missing', () => {
    expect(R1.run({ book: 'x', cnxml: 'a', fidelityAllowlist: null }).verdict).toBe(
      VERDICT.SKIPPED
    );
    expect(R1.run({ book: 'x', translatedCnxml: 'a', fidelityAllowlist: null }).verdict).toBe(
      VERDICT.SKIPPED
    );
  });

  it('`examined` counts element NAMES, and is non-zero on every real module', () => {
    // The unit decision, bound. Keying `examined` to diff ROWS would be 0 for 126 of 149
    // chemistry modules (84.6%) — `runCheck` would downgrade PASS to SKIPPED on a clean
    // module, i.e. the check would report "never ran" precisely when it had nothing to say.
    const clean = SRC('efnafraedi-2e', 'ch01', 'm68663');
    expect(elementNamesCompared(clean, TR('efnafraedi-2e', 'ch01', 'm68663'))).toBeGreaterThan(0);
    // A clean module still reports a PASS that survives runCheck's zero-examined downgrade.
    const r = runCheck(R1, {
      book: 'efnafraedi-2e',
      module: 'm68663',
      cnxml: clean,
      translatedCnxml: TR('efnafraedi-2e', 'ch01', 'm68663'),
      fidelityAllowlist: loadAllowlist('books/efnafraedi-2e'),
    });
    return Promise.resolve(r).then((res) => {
      expect(res.verdict).toBe(VERDICT.PASS);
      expect(res.examined).toBeGreaterThan(0);
    });
  });
});

describe('R2 — the injector reported no positional-restore attribute mismatch', () => {
  /**
   * 🔴 THE FIXTURE IS BUILT BY CALLING `buildCnxml`, NOT HAND-WRITTEN — §C82 L48.
   * And it is deliberately an ORGANIC module: R2's only two NATURAL must-trips are legacy
   * `{{term}}` chemistry modules whose markers a fresh re-extract converts to
   * `[[term:…]]`, so both expire on the day the loop starts. A synthetic built from the
   * real producer does not expire.
   */
  const injectFixture = (mutate) => {
    const src = SRC('lifraen-efnafraedi', 'ch03', 'm00032');
    const { segments, structure, equations, inlineAttrs } = extractSegments(src);
    const parsed = parseSegments(formatSegmentsMarkdown(segments));
    if (mutate) mutate(parsed);
    return buildCnxml(structure, parsed, equations, src, {}, inlineAttrs).report;
  };

  it('a clean inject passes, with a NON-ZERO examined beside the zero findings', () => {
    const report = injectFixture(null);
    expect(report.attrMismatches).toEqual([]);
    const r = R2.run({ injectReport: report });
    expect(r.verdict).toBe(VERDICT.PASS);
    expect(r.findings).toHaveLength(0);
    // §C82 L37 — the count beside the predicate. `segmentsFound` is 81 here; keying
    // `examined` to `attrMismatches.length` would be 0 for 164 of 166 modules (98.8%)
    // and SKIP the one Tier-3 check whose rate qualifies it to block.
    expect(r.examined).toBeGreaterThan(0);
    expect(r.examined).toBe(report.segmentsFound);
  });

  it('MUST-TRIP: total per-segment marker annihilation is detected', () => {
    let targetKey = null;
    const report = injectFixture((parsed) => {
      for (const [k, v] of parsed) {
        if (/\[\[term:/.test(String(v))) {
          targetKey = k;
          parsed.set(k, String(v).replace(/\[\[term:[^\]]*\]\]/g, 'X'));
          break;
        }
      }
    });
    // The fixture found something to destroy — without this the test could pass
    // vacuously on a module that never had a marker.
    expect(targetKey).not.toBeNull();
    const r = R2.run({ injectReport: report });
    expect(r.verdict).toBe(VERDICT.FAIL);
    expect(r.findings).toHaveLength(1);
    expect(r.findings[0]).toMatchObject({ family: 'terms', expected: 1, found: 0 });
    expect(r.findings[0].segmentId).toBe(targetKey);
  });

  it('DOCUMENTED BLINDNESS, deliberately not fixed: a DUPLICATED marker is invisible', () => {
    // 🔴 §C82 L61's shape — bound by a test so a future reader cannot mistake R2's low
    // base rate (1.20%) for health. R2 detects only TOTAL per-segment annihilation.
    // Duplication yields a DUPLICATE id in the output and an empty attrMismatches.
    // The cross-side detector for partial marker damage is Tier 2's blocking A2b; the
    // fix does not belong here, and widening R2 without a base rate would be a guess.
    let found = false;
    const report = injectFixture((parsed) => {
      for (const [k, v] of parsed) {
        const m = String(v).match(/\[\[term:[^\]]*\]\]/);
        if (m) {
          found = true;
          parsed.set(k, String(v).replace(m[0], m[0] + m[0]));
          break;
        }
      }
    });
    expect(found).toBe(true);
    const r = R2.run({ injectReport: report });
    // The blindness, asserted. If this ever goes red, R2 got STRONGER — re-measure its
    // base rate before celebrating, and update the header's claim.
    expect(r.verdict).toBe(VERDICT.PASS);
    expect(r.findings).toHaveLength(0);
    expect(r.message).toMatch(/DETECTS ONLY TOTAL/);
  });

  it('an absent attrMismatches KEY is a different state from an empty array', () => {
    // §C82 L48: a producer-side shape change must surface as SKIPPED naming the field,
    // never as a clean pass. `|| []` here would hide a rename forever.
    const missing = R2.run({ injectReport: { segmentsFound: 5 } });
    expect(missing.verdict).toBe(VERDICT.SKIPPED);
    expect(missing.message).toMatch(/attrMismatches is absent or not an array/);

    const empty = R2.run({ injectReport: { segmentsFound: 5, attrMismatches: [] } });
    expect(empty.verdict).toBe(VERDICT.PASS);
    expect(empty.examined).toBe(5);
  });

  it('SKIPPED naming the producer when injectReport is absent', () => {
    const r = R2.run({});
    expect(r.verdict).toBe(VERDICT.SKIPPED);
    expect(r.message).toMatch(/buildCnxml/);
  });
});

describe('R3 — RelaxNG schema validity', () => {
  it('clean verdict passes, with examined = filesChecked', () => {
    const r = R3.run({
      book: 'efnafraedi-2e',
      schemaVerdict: { filesChecked: 12, errors: [], suppressed: [{ rule: 'c1-abstract-id' }] },
    });
    expect(r.verdict).toBe(VERDICT.PASS);
    expect(r.examined).toBe(12);
    expect(r.message).toMatch(/1 suppressed/);
  });

  it('a fatal is FAIL for every book', () => {
    for (const book of ['efnafraedi-2e', 'lifraen-efnafraedi']) {
      const r = R3.run({
        book,
        schemaVerdict: { filesChecked: 1, errors: [{ type: 'fatal', message: 'boom' }] },
      });
      expect(r.verdict).toBe(VERDICT.FAIL);
      expect(r.findings[0].kind).toBe('schema-fatal');
    }
  });

  it('a structural error is FAIL for chemistry and WARN elsewhere — the spec split', () => {
    const err = { filesChecked: 1, errors: [{ type: 'error', message: 'bad', rule: 'x' }] };
    expect(R3.run({ book: 'efnafraedi-2e', schemaVerdict: err }).verdict).toBe(VERDICT.FAIL);
    expect(R3.run({ book: 'lifraen-efnafraedi', schemaVerdict: err }).verdict).toBe(VERDICT.WARN);
    // ⚠️ THE ASSERTION THAT SEPARATES THEM. Without asserting the two differ, a mutation
    // collapsing the ternary to one branch passes whichever branch it kept.
    expect(R3.run({ book: 'efnafraedi-2e', schemaVerdict: err }).verdict).not.toBe(
      R3.run({ book: 'lifraen-efnafraedi', schemaVerdict: err }).verdict
    );
  });

  it('a MISSING INSTRUMENT is SKIPPED — and because R3 blocks, that halts the run', async () => {
    // 🔴 The fail-closed decision, bound. Two independent absence modes exist (no jing in
    // any CI workflow; the RelaxNG schema is gitignored, so a fresh clone has none), and
    // an unvalidated module must not be certified.
    const r = await runCheck(R3, {
      book: 'efnafraedi-2e',
      schemaVerdict: { instrumentMissing: true, reason: 'FATAL: jing not found on PATH' },
    });
    expect(r.verdict).toBe(VERDICT.SKIPPED);
    expect(r.examined).toBe(0);
    expect(r.blocking).toBe(true);
    expect(r.message).toMatch(/jing not found/);
  });

  it('SKIPPED naming the loader when schemaVerdict is absent', () => {
    const r = R3.run({ book: 'efnafraedi-2e' });
    expect(r.verdict).toBe(VERDICT.SKIPPED);
    expect(r.message).toMatch(/spawnSchemaCheck/);
  });
});

describe('R4 — render output audit', () => {
  it('a module that could not be audited is a FINDING and is OUT of examined', () => {
    // 🔴 THE §C60 DEFECT THIS CHECK EXISTS FOR. `audit-render-output.js` counted modules
    // ATTEMPTED, so a chapter in which every module failed printed `Result: PASS` and
    // exited 0 — measured on 30 of organic's 31 mt-preview chapters (329 modules) and 19
    // of chemistry's 23 faithful ones.
    const r = R4.run({
      auditResults: [
        { moduleId: 'm1', issues: [] },
        { moduleId: 'm2', error: 'Rendered HTML not found for m2' },
      ],
    });
    expect(r.verdict).toBe(VERDICT.FAIL);
    expect(r.examined).toBe(1); // NOT 2 — the unauditable module is not evidence
    expect(r.findings).toEqual([
      { kind: 'module-not-audited', module: 'm2', reason: 'Rendered HTML not found for m2' },
    ]);
  });

  it('a chapter where EVERY module failed reaches SKIPPED, not a clean PASS', async () => {
    const r = await runCheck(R4, {
      auditResults: [
        { moduleId: 'm1', error: 'Rendered HTML not found for m1' },
        { moduleId: 'm2', error: 'Rendered HTML not found for m2' },
      ],
    });
    expect(r.examined).toBe(0);
    // FAIL, not PASS — and even had it been PASS, runCheck's zero-examined downgrade
    // would have made it SKIPPED. Two independent guards, which is the point.
    expect(r.verdict).toBe(VERDICT.FAIL);
  });

  it('an error-severity issue is a finding; a warning is not', () => {
    const r = R4.run({
      auditResults: [
        {
          moduleId: 'm1',
          issues: [
            { severity: 'error', check: 'id-preservation', message: '3 ID(s) missing' },
            { severity: 'warning', check: 'exercises', message: '0/7 in output' },
          ],
        },
      ],
    });
    expect(r.findings).toHaveLength(1);
    expect(r.findings[0]).toMatchObject({ kind: 'render-error', check: 'id-preservation' });
    expect(r.examined).toBe(1);
  });

  it('a fully clean chapter passes with examined equal to the module count', () => {
    const r = R4.run({ auditResults: [{ moduleId: 'm1', issues: [] }, { moduleId: 'm2' }] });
    expect(r.verdict).toBe(VERDICT.PASS);
    expect(r.examined).toBe(2);
  });

  it('SKIPPED when auditResults is not an array', () => {
    expect(R4.run({}).verdict).toBe(VERDICT.SKIPPED);
    expect(R4.run({ auditResults: {} }).verdict).toBe(VERDICT.SKIPPED);
  });
});

describe('R5 — untranslated leaf text', () => {
  it('m68662 WARNs with real findings, and examined is the compared count', () => {
    const src = SRC('efnafraedi-2e', 'ch00', 'm68662');
    const tr = TR('efnafraedi-2e', 'ch00', 'm68662');
    const r = R5.run({ cnxml: src, translatedCnxml: tr });
    expect(r.verdict).toBe(VERDICT.WARN); // never FAIL — advisory by measurement
    expect(r.findings.length).toBeGreaterThan(0);
    expect(r.examined).toBeGreaterThan(r.findings.length);
  });

  it('a clean module passes with a NON-ZERO examined', () => {
    const src = SRC('efnafraedi-2e', 'ch01', 'm68663');
    const tr = TR('efnafraedi-2e', 'ch01', 'm68663');
    const r = R5.run({ cnxml: src, translatedCnxml: tr });
    expect(r.verdict).toBe(VERDICT.PASS);
    expect(r.findings).toHaveLength(0);
    // The unit that makes the PASS meaningful. Keying `examined` to the FINDING count
    // would be 0 here — and on 81 of 149 chemistry modules (54.4%) — so a healthy module
    // would report SKIPPED, i.e. "never ran".
    expect(r.examined).toBeGreaterThan(0);
  });

  it('the appendices zero-set is REAL, not an instrument failure', () => {
    // 12 of 149 chemistry modules compare zero leaf elements; all 12 are appendices and
    // 11 hold literally no <para>/<item>/<caption>. SKIPPED is correct there. Asserted
    // with a positive control from the same book so "zero" cannot mean "my walk broke".
    const appendix = SRC('efnafraedi-2e', 'appendices', 'm68865');
    expect(leafElementsCompared(appendix, appendix)).toBe(0);
    const normal = SRC('efnafraedi-2e', 'ch01', 'm68663');
    expect(leafElementsCompared(normal, normal)).toBeGreaterThan(0);
  });

  it('SKIPPED when either side is missing', () => {
    expect(R5.run({ cnxml: 'a' }).verdict).toBe(VERDICT.SKIPPED);
    expect(R5.run({ translatedCnxml: 'a' }).verdict).toBe(VERDICT.SKIPPED);
  });
});

describe('spawnSchemaCheck — the loader helper', () => {
  /**
   * 🔴 THE MISSING-INSTRUMENT PATH IS THE ONE CI ACTUALLY TAKES, so it is asserted here
   * rather than skipped. jing is absent from all seven workflows AND the RelaxNG schema
   * lives under `experiments/cnxml-validation-gate/external/`, which is gitignored (480
   * files, 0 tracked) — so a fresh clone cannot run this gate for two independent reasons.
   * A conditionally-skipped test would leave the guard out of the loop entirely (§C82 L57).
   *
   * It is driven by handing the child an empty PATH, which is why `spawnSchemaCheck` takes
   * an `env`: the real loader needs no such option, but without it the only reachable
   * failure is a *usage* error, which is a different thing and must not be conflated.
   */
  it('an absent jing is reported as instrumentMissing, never as a clean verdict', async () => {
    const r = await spawnSchemaCheck([path.join(REPO_ROOT, 'books/efnafraedi-2e/03-translated')], {
      repoRoot: REPO_ROOT,
      env: { ...process.env, PATH: '' },
    });
    expect(r.instrumentMissing).toBe(true);
    expect(r.reason).toMatch(/jing not found|schema not found/);
    // The verdict must carry NO clean-looking fields — a consumer that reads
    // `filesChecked` or `errors` off this must find nothing to mistake for a pass.
    expect(r.errors).toBeUndefined();
    expect(r.filesChecked).toBeUndefined();
    // …and R3 turns exactly that into a blocking SKIPPED.
    const gate = await runCheck(R3, { book: 'efnafraedi-2e', schemaVerdict: r });
    expect(gate.verdict).toBe(VERDICT.SKIPPED);
    expect(gate.examined).toBe(0);
  }, 30000);

  it('a USAGE error REJECTS — it is not the same thing as a missing instrument', async () => {
    // ⚠️ THE DISTINCTION IS LOAD-BEARING, and the first draft of this file conflated the
    // two: a bad `--allowlist` is MY argument being wrong, not the environment lacking a
    // tool. Rejecting is correct — it must not be swallowed into a verdict object, because
    // `instrumentMissing` is a fact about the box that a human is expected to act on.
    await expect(
      spawnSchemaCheck([path.join(REPO_ROOT, 'books/efnafraedi-2e/03-translated')], {
        repoRoot: REPO_ROOT,
        allowlist: path.join(REPO_ROOT, 'no-such-allowlist.json'),
      })
    ).rejects.toThrow(/could not parse --json/);
  }, 30000);
});
