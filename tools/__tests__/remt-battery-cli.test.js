import { describe, it, expect, afterEach, beforeAll, afterAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
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

  /**
   * ⚠️ THE PROBE TIER IS 9, AND IT USED TO BE 3 — Task 11 registered tier 3 (R1-R5) and
   * both of these went red, exactly as predicted before that module was written.
   *
   * 🔴 THE OBVIOUS REPAIR — 3 → 4 — IS WRONG: Task 12 registers tier 4 and inherits the
   * identical breakage one task later. The property under test is `runTier`'s OWN
   * contract ("a run that judged nothing must not report clean"), not a fact about which
   * tiers happen to be empty today, and every tier 0-4 is populated by the end of Plan B.
   *
   * ▶ 9 IS SOUND RATHER THAN A DODGE, and the mechanism is unchanged: `runTier` does NOT
   * range-validate its tier — it only filters `REGISTRY` by `c.tier === tier` — so tier 9
   * exercises the same selection path and the same empty-set refusal. Only the CLI
   * validates the 0-4 range, via `parseTier`, so a tier outside it is unreachable from the
   * CLI and can never be claimed by a future task.
   * ⚠️ Do NOT try to `mk()` a tier-9 check to pair with this: `defineCheck` rejects any
   * tier outside 0-4 at construction. These tests need no synthetic check at all — that
   * is the point of them.
   */
  it('throws when the REGISTRY holds nothing for the requested tier', async () => {
    await expect(runTier(9, {})).rejects.toThrow(/no checks selected/);
  });

  it('the message says how big the registry is, so the cause is readable', async () => {
    await expect(runTier(9, {})).rejects.toThrow(/registry holds \d+/);
  });

  it('CONTROL: the refusal is about EMPTINESS, not about the number 9', async () => {
    // Without this, both tests above would still pass if `runTier` had been changed to
    // reject every unknown tier for its own reasons — the assertion would name the tier
    // rather than the empty selection. Tier 3 is populated now, so it must NOT throw.
    await expect(runTier(3, {})).resolves.toBeDefined();
  });

  it('POSITIVE CONTROL: selection really filters BY TIER, not "whatever is registered"', async () => {
    // ⚠️ Registering ONE check was not a control: a filter mutated to `() => true`,
    // to `&& c.blocking`, or to a hard-coded tier all return the sole entry and the
    // assertion still passes. Two checks in DIFFERENT tiers, differing in `blocking`
    // too, is what makes those three mutants fail.
    const { registerChecks } = await import('../lib/remt-battery.js');
    registerChecks([mk('B5', VERDICT.PASS, true, 7, 4), mk('B5b', VERDICT.PASS, false, 9, 2)]);
    const r = await runTier(4, {});
    expect(r.results.map((x) => x.id)).toEqual(['B5']);
    expect(r.results[0].examined).toBe(7);

    // ⚠️ WIDENED WHEN TIER 2 WAS WIRED (Task 8), AND THE THREE MUTANTS IT KILLS ARE
    // UNCHANGED. Tier 2 is no longer synthetic-only — `remt-checks-mt.js` registers A1,
    // A6, A2b and A2c at import time — so an exact `toEqual(['B5b'])` was asserting that
    // the REAL checks are absent. That is the failure mode this file's own header warns
    // about: a probe whose synthetic check has stopped being the sole determinant.
    // The synthetic is restored as the determinant by asserting its PRESENCE and the
    // other tier's ABSENCE, which is what each mutant breaks:
    //   `() => true`      → tier 4 returns everything, killed by the toEqual above
    //   `&& c.blocking`   → drops B5b (blocking:false), killed by toContain('B5b')
    //   hard-coded tier   → returns B5 for tier 2, killed by not.toContain('B5')
    const r2 = await runTier(2, {});
    const ids2 = r2.results.map((x) => x.id);
    expect(ids2).toContain('B5b');
    expect(ids2).not.toContain('B5');
    expect(ids2.every((id) => REGISTRY.get(id).tier === 2)).toBe(true);
    // L37: the COUNT beside the predicate — `[].every(...)` is vacuously true. A premise
    // pin, updated by the task that widens the tier: Task 9 adds A2a, A4 and A8.
    // ✅ TASK 9 DID: 4 free-half + 3 run-record + the synthetic B5b = 8.
    // ✅ TASK 10 ADDED A3, A5 and A7 (the gating half): 4 + 3 + 3 + B5b = 11.
    expect(ids2).toHaveLength(11);
  });
});

/**
 * 🔴 L4 — `--tier` COULD NOT BE TRUSTED, AND THE FAILURE WAS A SILENT EXIT 0.
 *
 * `parseArgs` coerces `type: 'number'` with `parseInt(raw, 10)` (parseArgs.js:179 — `:178`
 * is the `else if` ABOVE the call, the exact off-by-one this branch already corrected in
 * the source-file copy of this rationale and left standing in the duplicate here).
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

  it('rejects a NUMBER — the string-only clause is the whole L4 defence', () => {
    // Dropping `typeof raw !== 'string'` leaves the regex, which coerces its operand,
    // so parseTier(1) would quietly return 1 and the guard would appear to work.
    expect(parseTier(1)).toBeNull();
    expect(parseTier(1.5)).toBeNull();
  });

  it('the LITERAL tier bounds match the regex — the two can drift apart', () => {
    // ⚠️ Asserted against literals on purpose. `String(TIER_MAX + 1)` derives from the
    // value under test, so it follows a mutated TIER_MAX and never goes red.
    expect(TIER_MIN).toBe(0);
    expect(TIER_MAX).toBe(4);
    expect(parseTier('4')).toBe(4);
    expect(parseTier('5')).toBeNull();
  });
});

describe('the ctx reaches the check', () => {
  it('runTier passes its ctx THROUGH to each check, not a fresh empty object', async () => {
    // SURVIVING MUTANT otherwise: `runCheck(c, {})` in place of `runCheck(c, ctx)`
    // passed all 16 tests, because no test read ctx. Every Tier-1 gate depends on it.
    let seen = null;
    const spy = defineCheck({
      id: 'CTX1',
      tier: 1,
      blocking: false,
      version: 1,
      run: (ctx) => {
        seen = ctx;
        return { verdict: VERDICT.PASS, examined: 1, findings: [] };
      },
    });
    await runTier(1, { book: 'efnafraedi-2e', module: 'm68663' }, [spy]);
    expect(seen).toMatchObject({ book: 'efnafraedi-2e', module: 'm68663' });
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

/**
 * 🔴 THE CLI AS A PROCESS. Everything above calls `runTier`/`exitCodeFor`/`parseTier`
 * as functions, so `main()`, `usage()`, both output branches and the entry guard had
 * ZERO coverage — and an adversarial review found three live defects in exactly that
 * gap, all invisible to an in-process test. `execFileSync` captures stdout through a
 * PIPE, which is what makes the truncation case below reproducible; a `>` redirect is
 * synchronous and stays clean, which is why a hand check misses it.
 *
 * ⚠️ `execFileSync` throws on any non-zero exit, so a bare call cannot tell exit 1
 * from exit 2 — hence the try/catch returning `{out, code}`. Idiom copied from
 * `tools/__tests__/module-flag-honesty.test.js:27-37`.
 */
describe('the CLI as a process', () => {
  const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..');
  const LIB = pathToFileURL(path.join(REPO_ROOT, 'tools', 'lib', 'remt-battery.js')).href;
  let probeDir;

  /**
   * A preload module that makes ITS checks the only ones in the child's registry.
   *
   * 🔴 WHY IT MUST CLEAR, AND WHY IT CLEARS *AFTER* AN IMPORT RATHER THAN BEFORE.
   * Once a tier module is wired into the CLI (Task 3 wired tier 1), `--tier 1`
   * selects the real E2/E4/E7 alongside whatever a probe registers. They read
   * SKIPPED over a scope-only ctx, and a SKIPPED blocking check is a blocking
   * failure — so the probe's own verdict stops deciding the exit code and three
   * of these tests went red while two others started passing for the WRONG reason
   * (they expect exit 1, and E2/E4 supply one regardless of the probe).
   *
   * Register §C82 L11 predicted this class for Tasks 11/12 and prescribed
   * save/clear/restore of `REGISTRY` around the tests. That works only for the
   * in-process half above: a spawned CLI has its OWN module instance, and the
   * parent cannot reach into it. The clear therefore happens on the child's side.
   *
   * ⚠️ THE `await import` BEFORE THE CLEAR IS LOAD-BEARING, NOT DEFENSIVE. A
   * preload runs BEFORE the CLI's own imports, so clearing first would be undone
   * moments later when the CLI imports the tier module and it registers. Importing
   * it here first means the CLI's import is an ESM CACHE HIT — the module body
   * never re-runs, so `registerChecks` is never called again and the clear stands.
   * ▶ Add every newly wired tier module to WIRED below, or its checks reappear.
   *
   * ⚠️ It deliberately does NOT export a registry-emptier from the library. The
   * contract's own tests rejected `resetRegistry()` on the grounds that an exported
   * emptier is itself a new wrong-PASS surface; `REGISTRY.clear()` is the Map's own
   * method, reached only from a test-authored preload.
   */
  const WIRED = [
    pathToFileURL(path.join(REPO_ROOT, 'tools', 'lib', 'remt-checks-extract.js')).href,
  ];

  const probe = (name, body) => {
    const file = path.join(probeDir, `${name}.mjs`);
    fs.writeFileSync(
      file,
      `import { REGISTRY, defineCheck, registerChecks, VERDICT } from '${LIB}';\n` +
        WIRED.map((m) => `await import('${m}');`).join('\n') +
        `\nREGISTRY.clear();\n${body}\n`
    );
    return pathToFileURL(file).href;
  };

  const runCli = (args, preload) => {
    const nodeArgs = preload ? ['--import', preload] : [];
    try {
      const out = execFileSync(
        'node',
        [...nodeArgs, path.join('tools', 'remt-battery.js'), ...args],
        {
          cwd: REPO_ROOT,
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'pipe'],
          maxBuffer: 64 * 1024 * 1024,
        }
      );
      return { out, code: 0 };
    } catch (err) {
      return { out: `${err.stdout || ''}${err.stderr || ''}`, code: err.status ?? 1 };
    }
  };

  beforeAll(() => {
    probeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'remt-cli-'));
  });
  afterAll(() => {
    fs.rmSync(probeDir, { recursive: true, force: true });
  });

  const SCOPE = ['--book', 'efnafraedi-2e', '--tier', '1'];

  it('exits 2 with a usage error when --book is absent', () => {
    const r = runCli(['--tier', '1']);
    expect(r.code).toBe(2);
    expect(r.out).toMatch(/--book is required/);
  });

  it('exits 2 on a fractional --tier — the L4 defence, at process level', () => {
    const r = runCli(['--book', 'efnafraedi-2e', '--tier', '1.5']);
    expect(r.code).toBe(2);
    expect(r.out).toMatch(/1\.5/);
  });

  it('exits 2 rather than 0 when the registry is empty', () => {
    // The empty state is now MANUFACTURED rather than inherited: tier 1 is wired, so
    // the default registry is no longer empty. A probe that clears and registers
    // nothing reproduces the L3 shape exactly, and keeps testing what this test is
    // about — `runTier` refusing to report a clean run over an empty selection.
    const r = runCli(SCOPE, probe('empty', '/* registers nothing */'));
    expect(r.code).toBe(2);
    expect(r.out).toMatch(/no checks selected/);
  });

  it('🔴 THE COMPLEMENT: with NO probe, tier 1 selects the REAL wired checks', () => {
    // The L3 guard at process level, and the reason the test above needed a probe.
    // "A gate that is never called is indistinguishable from one that does not
    // exist" — this is the one test that would go red if the CLI's tier-module
    // import were ever dropped, and no unit test can see a missing connection.
    const r = runCli(SCOPE);
    expect(r.out).toMatch(/E2 v\d+/);
    expect(r.out).toMatch(/E4 v\d+/);
    expect(r.out).toMatch(/E7 v\d+/);
    // ...and it exits 1, not 0: E2 and E4 are blocking and the CLI passes only the
    // scope keys today, so they SKIP for want of a loader. No evidence is not a pass.
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/ctx is missing cnxml and segText/);
  });

  it('POSITIVE CONTROL: exits 0 when every blocking check passes', () => {
    const p = probe(
      'pass',
      `registerChecks([defineCheck({id:'CP1',tier:1,blocking:true,version:3,run:()=>({verdict:VERDICT.PASS,examined:12,findings:[]})})]);`
    );
    const r = runCli(SCOPE, p);
    expect(r.code).toBe(0);
    expect(r.out).toMatch(/PASS\s+CP1 v3 \(examined 12\)/);
  });

  it('exits 1 on a blocking FAIL', () => {
    const p = probe(
      'fail',
      `registerChecks([defineCheck({id:'CF1',tier:1,blocking:true,version:1,run:()=>({verdict:VERDICT.FAIL,examined:9,findings:['x']})})]);`
    );
    expect(runCli(SCOPE, p).code).toBe(1);
  });

  /**
   * 🔴 A BLOCKING CHECK THAT EXAMINED NOTHING MUST NOT EXIT 0 — AND `WARN` WAS THE
   * ONE GREEN CELL. The comment beside `blockingFailures` states the rule generally
   * ("treat 'examined 0 units' as a failure in its own right"), and the filter
   * implemented it for three verdicts of four: FAIL and SKIPPED were caught, PASS was
   * downgraded to SKIPPED upstream — and WARN sailed through. Measured before the fix:
   * `WARN W0 v1 (examined 0)` … exit 0.
   * ⚠️ Two other repairs were considered and are WRONG: downgrading WARN→SKIPPED in
   * `runCheck` ERASES the check's findings and message, and `defineCheck` cannot decide
   * at construction whether a check may return WARN (spec:142 has R3 blocking *and*
   * WARN-returning). Widening the filter is the only one that keeps the evidence.
   */
  it('exits 1 on a blocking WARN that examined nothing — no evidence is not a pass', () => {
    const p = probe(
      'warn0',
      `registerChecks([defineCheck({id:'CW0',tier:1,blocking:true,version:1,run:()=>({verdict:VERDICT.WARN,examined:0,findings:[],message:'no evidence'})})]);`
    );
    expect(runCli(SCOPE, p).code).toBe(1);
  });

  it('POSITIVE CONTROL: a blocking WARN that DID examine still exits 0', () => {
    // Without this, the fix above could be "any WARN blocks", which would halt a paid
    // run on R3 — specified blocking and WARN-returning at once.
    const p = probe(
      'warnN',
      `registerChecks([defineCheck({id:'CWN',tier:1,blocking:true,version:1,run:()=>({verdict:VERDICT.WARN,examined:31,findings:['advisory']})})]);`
    );
    expect(runCli(SCOPE, p).code).toBe(0);
  });

  /**
   * 🔴 `process.exit()` DISCARDS QUEUED STDOUT. Node's stdout-to-a-pipe is async, so a
   * payload larger than the 64 KB pipe buffer is cut off mid-document while the exit
   * code stays correct — measured at exactly 65,536 bytes, 3 runs of 3, against
   * 150,342 valid bytes through a `>` redirect. `--json` exists precisely to be piped,
   * and the constraint is "read --json, apply the battery's threshold" — so a consumer
   * doing the right thing receives a truncated document.
   */
  it('emits COMPLETE --json through a pipe when the payload exceeds the 64 KB buffer', () => {
    const p = probe(
      'big',
      `const findings = Array.from({length:1200},(_,i)=>({seg:'m1:para:p'+i,why:'a finding long enough to matter for buffer purposes'}));
       registerChecks([defineCheck({id:'CBIG',tier:1,blocking:false,version:1,run:()=>({verdict:VERDICT.WARN,examined:1200,findings})})]);`
    );
    const r = runCli([...SCOPE, '--json'], p);
    expect(r.out.length).toBeGreaterThan(65536); // the buffer it used to be cut at
    expect(() => JSON.parse(r.out)).not.toThrow();
    expect(JSON.parse(r.out).results[0].findings).toHaveLength(1200);
  });

  /**
   * 🔴 A CHECK WHOSE PROMISE NEVER SETTLES USED TO EXIT 0 WITH NO OUTPUT — and it did
   * not hang, which is what makes it dangerous. `new Promise(() => {})` holds no
   * handle, so Node's event loop empties and the process exits NORMALLY, code 0, having
   * run no further checks and never computed `blockingFailures`. A second, blocking
   * FAIL check in the same tier never ran. The fix is a failure-default `exitCode`.
   */
  it('exits 2, not 0, when a check never settles and the run reaches no verdict', () => {
    const p = probe(
      'hang',
      `registerChecks([
         defineCheck({id:'CH1',tier:1,blocking:true,version:1,run:()=>new Promise(()=>{})}),
         defineCheck({id:'CH2',tier:1,blocking:true,version:1,run:()=>({verdict:VERDICT.FAIL,examined:5,findings:['never reached']})}),
       ]);`
    );
    const r = runCli(SCOPE, p);
    expect(r.code).toBe(2);
  });
});
