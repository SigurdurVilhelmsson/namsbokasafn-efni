/**
 * remt-battery.js — the §C82 check contract.
 *
 * 🔴 EVERY CHECK EMITS THREE THINGS, ALWAYS: its verdict, its own version stamp,
 * and the number of units it examined. This file is what makes that mechanical.
 *
 * WHY `examined` IS NOT OPTIONAL. §C60: a check reported `Total findings: 0`
 * while reading ZERO files. The §C82 Plan A review measured cnxml-fidelity-check
 * and cnxml-linguistic-check exiting 0 having examined zero modules on a --module
 * that matched nothing. The battery spec's 2026-08-16 amendment makes it binding:
 * "Any driver this spec describes must still treat 'examined 0 units' as a failure
 * in its own right, not infer a pass from exit 0."
 *
 * WHY `version` IS NOT OPTIONAL. Design §5: "without a per-module record of which
 * instrument version judged it, a mid-campaign fix makes earlier green verdicts
 * unfalsifiable and the quarantine cannot be scoped." Decision ① (quarantine on a
 * fingerprint change) is unimplementable without it.
 *
 * WHY `verdict` IS VALIDATED TOO, and why that is not a refinement. Global
 * Constraint 1 names three things; the plan's draft enforced two. An absent or
 * misspelt verdict was carried through to the caller verbatim, and `exitCodeFor`
 * (Task 2) counts only FAIL and SKIPPED as blocking failures — so an unrecognised
 * verdict READ AS A PASS. `{ examined: 0 }` with no verdict slipped past both
 * existing guards at once: 0 is finite, so the count guard stood down, and
 * `undefined !== PASS`, so the zero-examined downgrade stood down too. That is
 * §C60 inside the file built to make §C60 impossible.
 *
 * ▶ THIS IS THE CHOKEPOINT, WHICH IS WHY THE GUARDS LIVE IN `runCheck` AND NOT IN
 * `runTier`. Plan C constraint 2: "The driver never judges. Every verdict comes
 * from Plan B's `runCheck()`." A guard in the tier runner would be bypassed by the
 * one consumer whose decision spends money.
 *
 * THE GUARDS, AND THE ONE THING THEY HAVE IN COMMON. Each closes a path on which a
 * defect READ AS A PASS rather than announcing itself:
 *   defineCheck  tier      an unselectable check never runs and reports nothing
 *   defineCheck  version   a NaN stamp serialises to null; decision ① loses its key
 *   defineCheck  blocking  the field that decides whether a FAIL halts a paid run
 *   runCheck     examined  a count is a non-negative integer or it is a defect
 *   runCheck     verdict   an unrecognised verdict is neither FAIL nor SKIPPED
 *   runCheck     findings  a non-array `.length` is undefined, so FAIL reads PASS
 * ⚠️ NONE OF THEM DEFAULTS. Every one throws or returns FAIL, because the permissive
 * branch is in each case the one that spends money on a corrupted module.
 */

/** @type {{PASS:'PASS', FAIL:'FAIL', WARN:'WARN', SKIPPED:'SKIPPED'}} */
export const VERDICT = Object.freeze({
  PASS: 'PASS',
  FAIL: 'FAIL',
  WARN: 'WARN',
  SKIPPED: 'SKIPPED',
});

/** The closed set a check may return. Anything else is a defect in the check. */
const VALID_VERDICTS = new Set(Object.values(VERDICT));

/** Tiers the battery defines: 0 glossary · 1 extract · 2 MT · 3 output · 4 chapter. */
const MIN_TIER = 0;
const MAX_TIER = 4;

/**
 * @param {object} spec
 * @param {string} spec.id            battery id, e.g. 'E4'
 * @param {0|1|2|3|4} spec.tier
 * @param {boolean} spec.blocking     a FAIL halts the loop
 * @param {number} spec.version       bump whenever the JUDGEMENT changes
 * @param {(ctx:object)=>({verdict:string,examined:number,findings?:Array,message?:string})|Promise<any>} spec.run
 * @returns {object} the check
 */
export function defineCheck({ id, tier, blocking, version, run }) {
  if (!id) throw new Error('defineCheck: id is required');
  // 🔴 A TIER TYPO MAKES A CHECK INVISIBLE, NOT BROKEN. `runTier` selects with
  // `c.tier === tier` — strict equality against the number the CLI validated — so
  // a string or out-of-range tier is never selected, never runs, and reports
  // nothing. "A gate that is never called is indistinguishable from one that does
  // not exist." Closed here, at construction, where it costs one line; the
  // alternative is discovering it from a sweep that reports zeros.
  if (!Number.isInteger(tier) || tier < MIN_TIER || tier > MAX_TIER) {
    throw new Error(
      `defineCheck(${id}): tier must be an integer ${MIN_TIER}-${MAX_TIER}, got ${JSON.stringify(tier)}`
    );
  }
  // A blocking gate with no version cannot be quarantined by decision ①. `typeof`
  // alone was too weak, and in the direction that matters: `typeof NaN` is
  // 'number', and `JSON.stringify(NaN)` is `null` — so a NaN version reaches the
  // ledger as a null where the stamp is meant to be, erasing exactly the record
  // the comment above claims it keeps. Same for ±Infinity.
  if (!Number.isInteger(version) || version < 1) {
    throw new Error(
      `defineCheck(${id}): an integer version >= 1 is required, got ${JSON.stringify(version)}`
    );
  }
  // 🔴 `blocking` DECIDES WHETHER A FAIL HALTS A PAID RUN, AND IT WAS THE ONE FIELD
  // WITH NO GUARD — `Boolean(blocking)`, which fails OPEN. A spec-BLOCKING check
  // written without the key was accepted as `blocking: false`, and `exitCodeFor`
  // then returns 0 while the gate prints FAIL over hundreds of examined units: the
  // gate runs, finds the defect, and its verdict is discarded.
  // ⚠️ THE COERCION WAS UNSAFE IN BOTH DIRECTIONS, which is why it is gone rather
  // than merely guarded: `Boolean('false')` is `true`, turning an advisory check
  // into a halt on a paid run — the failure the spec's amendment ④ already records
  // happening for real (10 false halts across 6 organic modules).
  // ▶ There is deliberately NO DEFAULT. `false` is the bug above; `true` converts
  // every omitting advisory check into a halt gate. It must be stated.
  if (typeof blocking !== 'boolean') {
    throw new Error(
      `defineCheck(${id}): blocking must be an explicit boolean, got ${JSON.stringify(blocking)}`
    );
  }
  if (typeof run !== 'function') throw new Error(`defineCheck(${id}): run must be a function`);
  return { id, tier, blocking, version, run };
}

/**
 * Run one check and normalise its result.
 *
 * 🔴 THE ONE RULE THAT IS NOT THE CHECK'S TO DECIDE: a PASS that examined 0 units
 * becomes SKIPPED. A check cannot opt out, because the checks most likely to
 * examine nothing are exactly the ones whose authors believed they could not.
 * ⚠️ A FAIL is NOT downgraded — a check that found something wrong while examining
 * zero units has a defect worth surfacing, and hiding it behind SKIPPED loses it.
 * WARN is likewise left alone: like FAIL it carries a finding, and only PASS is a
 * claim that rests on having looked.
 *
 * A check whose `run` throws or rejects returns FAIL rather than throwing, so one
 * broken check degrades to a halt on that check instead of taking the driver down.
 * ⚠️ Deliberately narrower than "every malformed-contract path": the shape guards
 * below sit OUTSIDE the try, so a genuinely exotic value (a throwing getter, a
 * BigInt, a cycle) still rejects. That is accepted — moving the whole body inside
 * the try was measured to emit a FAIL carrying no `id`, `version` or `blocking`,
 * which `blockingFailures` then drops and `exitCodeFor` scores 0: the correction
 * manufacturing the very §C60 shape this file exists to prevent.
 *
 * @param {object} check   from defineCheck()
 * @param {object} ctx     already-read strings/objects; gates are pure and do no I/O
 * @returns {Promise<{id:string,tier:number,blocking:boolean,version:number,verdict:string,examined:number,findings:Array,message:string}>}
 */
export async function runCheck(check, ctx) {
  const base = { id: check.id, tier: check.tier, blocking: check.blocking, version: check.version };
  const fail = (message) => ({
    ...base,
    verdict: VERDICT.FAIL,
    examined: 0,
    findings: [],
    message,
  });

  let out;
  try {
    out = await check.run(ctx);
  } catch (err) {
    return fail(String(err && err.message ? err.message : err));
  }

  // `examined` is a COUNT, so a non-negative integer or nothing. `Number(null)` is
  // 0 and `Number.isFinite(-1)` is true, so a plain finite-check accepted both and
  // reported the check's own defect as the benign "examined nothing".
  const examined = out == null ? undefined : out.examined;
  if (!Number.isInteger(examined) || examined < 0) {
    return fail(
      `${check.id} returned no usable examined count (got ${JSON.stringify(examined)}) — a count is a non-negative integer`
    );
  }

  const verdict = out.verdict;
  if (!VALID_VERDICTS.has(verdict)) {
    return fail(
      `${check.id} returned an unrecognised verdict ${JSON.stringify(verdict)} — expected one of ${[...VALID_VERDICTS].join(', ')}`
    );
  }

  // 🔴 A WRONG `findings` SHAPE MUST FAIL LOUDLY, NOT BE NORMALISED AWAY. The plan's
  // own Task 3 wrapper hands one over: `bracket-body-check.js` returns an OBJECT
  // `{examined, findings, skippedUnmatchable, ok}`, and Plan B:490 specifies E2 as
  // `checkBracketBodies(...) || []` then `findings.length ? FAIL : PASS`. `{}.length`
  // is undefined → falsy → a BLOCKING gate reads PASS. Measured PASS on both modules
  // the plan names as must-trip fixtures (ch04/m68710, ch06/m68733).
  // ⚠️ COERCING INSTEAD (`Array.isArray(x) ? x : []`) WAS MEASURED TO BE WORSE: still
  // PASS, and now the `ok:false` evidence is erased too.
  // ⚠️ `null`/absent is tolerated on purpose — `findings` is documented optional, and
  // a strict form would turn every omitting check into a false halt.
  // ▶ THIS IS A DETECTOR, NOT THE REPAIR. Task 3 must destructure:
  //   `const { findings } = checkBracketBodies(cnxml, segText)`.
  if (out.findings != null && !Array.isArray(out.findings)) {
    return fail(
      `${check.id} returned a non-array findings (${typeof out.findings}) — a wrong shape is a defect in the check, not an empty result`
    );
  }

  if (verdict === VERDICT.PASS && examined === 0) {
    return {
      ...base,
      verdict: VERDICT.SKIPPED,
      examined: 0,
      findings: [],
      message: `${check.id} examined 0 units — a pass is not inferred from an empty run`,
    };
  }

  return { ...base, verdict, examined, findings: out.findings || [], message: out.message || '' };
}

/** id -> check. Populated by the tier modules via registerChecks(). */
export const REGISTRY = new Map();

export function registerChecks(checks) {
  for (const c of checks) {
    if (REGISTRY.has(c.id)) throw new Error(`duplicate check id: ${c.id}`);
    REGISTRY.set(c.id, c);
  }
  return REGISTRY;
}
