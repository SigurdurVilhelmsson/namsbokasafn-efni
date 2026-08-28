/**
 * remt-ctx-invariants.test.js — Task N2: I1 · I2 · I3 · I4, the INVERSE-DIRECTION gate.
 *
 * 🔴 WHY THIS FILE EXISTS AT ALL. `remt-ctx-contract.test.js` enforces exactly ONE direction —
 * *no check reads a ctx key the contract does not document* (checks ⊆ contract). NOTHING
 * enforces the other direction, `loader ⊇ what the checks require`, so the loader can ship
 * silently incomplete with every existing test green: a key it never supplies makes a check
 * SKIP, and a SKIP looks like "nothing to judge here" rather than "the pre-spend gate did not
 * run". This is the pre-spend gate for a paid MT run budgeted around 51,000 ISK.
 *
 * ⚠️ THE IMPORT OF `../remt-battery.js` IS NOT A NO-OP (same reason as `remt-ctx.test.js`):
 * the REGISTRY is populated by the five side-effect imports only the top-level CLI performs,
 * so importing the lib alone gives a registry of 0 and every `REGISTRY.get(...)` reads
 * `undefined`. Its `main()` is argv-guarded, so nothing runs.
 *
 * ── THE POPULATION, AND WHY IT IS SPLIT BY TIER ──
 * Tier 1 is MODULE-scoped, so per-unit variation is real and the sweep covers ALL 220 units
 * (~16 s). Tier 0 is BOOK-scoped — all four of its keys resolve to one file per book — so
 * running it per unit would be 220 spawns to evaluate 2 distinct ctx values. It is therefore
 * swept over every `(book, kind)` combination that EXISTS (5, not 6: chemistry has no
 * `exercises` unit), and the book-scope premise that licenses the reduction is PINNED below
 * rather than assumed. If the loader ever becomes unit-scoped at tier 0, that pin goes red and
 * this reduction must be revisited.
 *
 * ── THE SWEEP RUNS ONCE ──
 * Every invariant below reads one `beforeAll` sweep instead of rebuilding its own. A control
 * that recomputes a 16 s corpus walk to count what the assertion just measured doubles the
 * cost to prove the same thing; each `it` asserts a distinct facet of one measured result.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import '../remt-battery.js'; // side-effect ONLY: takes REGISTRY from 0 to 33 entries
import { REGISTRY, runCheck, VERDICT } from '../lib/remt-battery.js';
import {
  assertSameUnit,
  chapterDirOf, // re-imported for the FLIPPED gap test: it binds the expected chapter dir
  EXTRACTION_DERIVED,
  excludedIds,
  isPlainRecord,
  isSnapshot,
  judgeableIds,
  loadTier0Ctx,
  loadTier1Ctx,
  loadCtx,
  RUN_BOOKS,
  UNIT_KINDS,
  unitsFor,
} from '../remt-ctx.js';
import { runState } from './helpers/remt-run-state.js';

const ALL_UNITS = RUN_BOOKS.flatMap((b) => unitsFor(b));
const label = (u) => `${u.book}/${u.chapter}/${u.module}`;
const blockingOf = (tier) => [...REGISTRY.values()].filter((c) => c.tier === tier && c.blocking);

/**
 * One real unit per `(book, kind)` that EXISTS — 5 today, because chemistry holds no
 * `exercises` unit. A naive nested loop over RUN_BOOKS × UNIT_KINDS names a 6th combination
 * that has no member, and the loader would then be probed with a unit built from nothing.
 */
const TIER0_COMBOS = RUN_BOOKS.flatMap((book) =>
  UNIT_KINDS.map((kind) => unitsFor(book).find((u) => u.kind === kind)).filter(Boolean)
);

/**
 * I2 IN A TABLE: the shape each value the LOADER ITSELF PRODUCES must satisfy WHEN PRESENT.
 * The property is *absent, `null`, or well-formed*; the shape I2 exists to refuse is
 * present-but-shapeless, which is truthy and passes every `if (ctx.key)` its consumers write.
 *
 * ⚠️ THE SCOPE SENTENCE IS NARROW ON PURPOSE — IT USED TO CLAIM "every key that reaches ctx
 * through a parse, a spawn, a file read or a shape guard", AND THAT WAS UNTRUE OF ITS OWN
 * CONTENTS. Three such keys were missing (`handEdits`, a `git log` spawn; `inputs`, a set of
 * `fs.statSync` reads; `locked`, an fs-backed `isMtLocked`), so the next author could read the
 * docstring, conclude spawn-sourced values were covered, and add a fourth without a counter.
 * That is this repo's own "a comment that generalises past its code". Two of the three are now
 * IN the table; the third is named below as excluded, with its mechanism.
 *
 * ── WHAT IS DELIBERATELY NOT HERE, AND WHY ──
 * · `locked` — a BOOLEAN, and a guard on it could not fire on its realistic failure. A broken
 *   `isMtLocked` yields `undefined`, which `censusI2` skips BY DESIGN (absent is legal), so
 *   `typeof v === 'boolean'` would only ever catch a string or a number, which nothing
 *   produces. Measured 2026-08-28: `boolean` on 220/220 units and `true` on **0** — a
 *   saturated value, so such a counter would read as coverage while separating nothing.
 * · `book`, `chapter`, `module` — copied straight off `unit`; they cannot half-succeed.
 * · `force`, `costEstimate`, `emittedFiles` — the DRIVER's, passed through unexamined. The
 *   loader is not their producer, so guarding them here would pin the test fixture rather than
 *   the loader. ▶ THEY ARE NOT UNCOVERED: the judgeable-subset pin below is what catches one
 *   of them going missing, and `emittedFiles` is precisely the key it was added for.
 *
 * ⚠️ `payloadVerdict` DEMANDS A `producer` STRING, not merely a non-empty record, because
 * that is the value G5 reads. ⚠️ The two string keys demand `!== ''`: an empty file read
 * yields `''`, which is falsy-but-present — the mirror image of the same defect, and
 * `skipIfCtxUnusable` tests for it explicitly. This is STRICTER than the loader's own
 * `!== null` guard, and deliberately so (see `readOrNull`, ruling R18).
 * ⚠️ The two ARRAY guards are satisfied by `[]` — `[].every()` is vacuously true — so the
 * container alone proves nothing. `i2NonEmptyPayloads` counts the payload separately.
 */
const WELL_FORMED = {
  glossary: (v) => isPlainRecord(v) && Object.keys(v).length > 0,
  glossariesByBook: (v) =>
    isPlainRecord(v) &&
    Object.keys(v).length > 0 &&
    Object.values(v).every((g) => isPlainRecord(g) && Object.keys(g).length > 0),
  payloadVerdict: (v) => isPlainRecord(v) && typeof v.producer === 'string',
  payloadText: (v) => typeof v === 'string' && v !== '',
  cnxml: (v) => typeof v === 'string' && v !== '',
  segText: (v) => typeof v === 'string' && v !== '',
  committedExtract: isSnapshot,
  freshExtract: isSnapshot,
  // `git log` output. An EMPTY array is legitimate (a unit nobody hand-edited), so emptiness
  // is not a violation — but every element must be a subject string.
  handEdits: (v) => Array.isArray(v) && v.every((s) => typeof s === 'string'),
  // `fs.statSync` results. `[]` IS a defect here — `expectedInputs` always returns at least
  // the EN segment path — and an empty one silently empties E9's leg 3.
  inputs: (v) =>
    Array.isArray(v) &&
    v.length > 0 &&
    v.every(
      (i) =>
        isPlainRecord(i) &&
        typeof i.path === 'string' &&
        typeof i.exists === 'boolean' &&
        typeof i.bytes === 'number'
    ),
};

/** The array-valued keys above, whose CONTAINER passing says nothing about their PAYLOAD. */
const ARRAY_PAYLOAD_KEYS = ['handEdits', 'inputs'];

/**
 * 🔴 C1's ANCHOR: THE MEASURED JUDGEABLE/EXCLUDED SUBSET, FROZEN AS A LITERAL.
 *
 * ── WHY A GOLDEN MASTER IS THE ONLY THING THAT WORKS HERE ──
 * `sentinelCtxForUnit` builds its probe ctx from THE SAME LOADER the sweep then runs. So a
 * SYSTEMATICALLY omitted ctx key is invisible to both directions of I1: the check SKIPs during
 * the probe → recorded `excluded` → the sweep runs it on an equally deficient ctx → it SKIPs →
 * direction B is satisfied. The three representatives agree with each other, so the
 * disagreement tripwire never fires either. **Demonstrated by the N2 reviewer: mutating
 * `emittedFiles: undefined` in `loadTier1Ctx` stopped E6 — a BLOCKING check — running on all
 * 220 units, with 23/23 tests passing and exit 0.** That is *a gate whose two sides derive
 * from the same token cannot see damage to its own anchor*, exactly.
 * ▶ This table is the cross-side anchor: a literal the loader's damage cannot reach.
 *
 * ⚠️ IT IS NOT THE ENUMERATION [LEAD] RULED AGAINST. That ruling forbids a table of *which ctx
 * keys each check requires* — which cannot be derived mechanically anyway (E9 reads all five
 * of its keys through `const c = ctx || {}`). This is a different object: a pin on the
 * MEASURED RESULT of the probe, derived by running it and then frozen.
 *
 * ⚠️ EVERY `excluded: []` BELOW IS LOAD-BEARING — DO NOT DELETE THEM AS `[]`-vs-`[]` NOISE.
 * `'1:module'.excluded` is THE Mutation-B assertion: E6 appearing in that array is the
 * failure, and an empty literal is the only way to say "nothing was dropped here".
 * ⚠️ A NEWLY REGISTERED CHECK REDDENS THIS TABLE, ON PURPOSE. Adding a check changes which
 * kinds it can judge; that is a decision a human should confirm and record here, not one the
 * suite should absorb silently. Re-derive with `probeJudgeableSubset(tier, kind, runState())`.
 *
 * ✅ MEASURED 2026-08-28 over the live corpus, both tiers, all three kinds.
 */
const EXPECTED_SUBSET = Object.freeze({
  '0:module': { judgeable: ['G1', 'G2', 'G3', 'G4', 'G5'], excluded: [] },
  '0:exercises': { judgeable: ['G1', 'G2', 'G3', 'G4', 'G5'], excluded: [] },
  '0:chapter-metadata': { judgeable: ['G1', 'G2', 'G3', 'G4', 'G5'], excluded: [] },
  '1:module': {
    judgeable: ['E1', 'E2', 'E3', 'E4', 'E5', 'E6', 'E7', 'E9'],
    excluded: [],
  },
  // E1/E2/E4/E5 are source-side: these kinds have no CNXML, so their exclusion is REAL.
  '1:exercises': { judgeable: ['E3', 'E6', 'E7', 'E9'], excluded: ['E1', 'E2', 'E4', 'E5'] },
  '1:chapter-metadata': {
    judgeable: ['E3', 'E6', 'E7', 'E9'],
    excluded: ['E1', 'E2', 'E4', 'E5'],
  },
});

/**
 * The whole measurement: every unit, both tiers, every BLOCKING check, plus the I2 shape
 * census and the I4 provenance census — in one walk.
 *
 * 🔴 IT COUNTS AS WELL AS COLLECTS, AND THE COUNTS ARE HALF THE POINT. `expect(offences)
 * .toEqual([])` is satisfied by a loop that examined nothing — this repo shipped a bug behind
 * exactly that equivalence pin. Every offence list below has a paired counter proving the
 * comparison was non-empty, and the counters are per-DIRECTION and per-KEY because a single
 * global total is satisfied by one populated direction while the other is vacuous.
 */
async function sweepCorpus() {
  const state = runState();
  const out = {
    unitsSwept: 0,
    // I1
    skipOffences: [], // judgeable blocking check that SKIPPED
    excludedJudgedOffences: [], // excluded blocking check that reached a real verdict
    legOffences: [], // judgeable blocking check reporting `leg-not-checked`
    judgeablePairs: 0, // direction A's denominator
    excludedPairs: 0, // direction B's denominator
    tier0Pairs: 0,
    findingsTotal: 0,
    // I2
    i2Violations: [],
    i2Observed: {}, // ctx key -> how many well-formed values were actually seen
    i2NonEmptyPayloads: {}, // array key -> how many NON-EMPTY ones were seen
    // I4
    i4UnitOffences: [],
    i4VintageOffences: [],
    i4AssertOffences: [],
    i4SourcesChecked: 0,
    i4VintageChecked: 0,
    i4AssertChecked: { t0: 0, t1: 0 }, // per TIER: a global total hides a vacuous tier
  };

  const censusI2 = (ctx, where) => {
    for (const [key, wellFormed] of Object.entries(WELL_FORMED)) {
      if (!(key in ctx) || ctx[key] === null || ctx[key] === undefined) continue;
      if (wellFormed(ctx[key])) out.i2Observed[key] = (out.i2Observed[key] || 0) + 1;
      else
        out.i2Violations.push(`${where}: ctx.${key} = ${JSON.stringify(ctx[key])?.slice(0, 80)}`);
    }
    // 🔴 THE CONTAINER IS NOT THE PAYLOAD. Both array guards above accept `[]` (`handEdits`
    // legitimately, `inputs` only because `length > 0` is inside the guard), so an
    // `i2Observed` count proves a value was SHAPED, never that it CARRIED anything. Counted
    // separately so the control can say which of the two it is asserting.
    for (const key of ARRAY_PAYLOAD_KEYS) {
      if (Array.isArray(ctx[key]) && ctx[key].length > 0) {
        out.i2NonEmptyPayloads[key] = (out.i2NonEmptyPayloads[key] || 0) + 1;
      }
    }
  };

  const judgeBlocking = async (tier, unit, ctx, judgeable) => {
    for (const check of blockingOf(tier)) {
      const r = await runCheck(check, ctx);
      out.findingsTotal += (r.findings || []).length;
      if (judgeable.has(check.id)) {
        out.judgeablePairs++;
        if (r.verdict === VERDICT.SKIPPED) {
          out.skipOffences.push(`${label(unit)} t${tier} ${check.id}: SKIPPED — ${r.message}`);
        }
        for (const f of r.findings || []) {
          if (f.kind === 'leg-not-checked') {
            out.legOffences.push(`${label(unit)} t${tier} ${check.id}: leg ${f.leg} — ${f.why}`);
          }
        }
      } else {
        out.excludedPairs++;
        if (r.verdict !== VERDICT.SKIPPED) {
          out.excludedJudgedOffences.push(
            `${label(unit)} t${tier} ${check.id}: EXCLUDED from kind '${unit.kind}' but reached ` +
              `${r.verdict} (examined ${r.examined}) — the subset dropped a judgeable blocking check`
          );
        }
      }
    }
  };

  // ── TIER 0: book-scoped, so one unit per (book, kind) that exists ──
  for (const unit of TIER0_COMBOS) {
    const { ctx, provenance } = await loadCtx(0, unit, state);
    censusI2(ctx, `t0 ${label(unit)}`);
    const before = out.judgeablePairs + out.excludedPairs;
    await judgeBlocking(0, unit, ctx, new Set(await judgeableIds(0, unit.kind, state)));
    out.tier0Pairs += out.judgeablePairs + out.excludedPairs - before;
    out.i4AssertChecked.t0++;
    try {
      assertSameUnit(unit, provenance);
    } catch (e) {
      out.i4AssertOffences.push(`t0 ${label(unit)}: ${e.message}`);
    }
  }

  // ── TIER 1: module-scoped, so every unit ──
  const runStartedAt = Date.parse(state.extractRunStartedAt);
  for (const unit of ALL_UNITS) {
    const { ctx, provenance } = await loadCtx(1, unit, state);
    out.unitsSwept++;
    censusI2(ctx, `t1 ${label(unit)}`);
    await judgeBlocking(1, unit, ctx, new Set(await judgeableIds(1, unit.kind, state)));

    for (const [key, src] of Object.entries(provenance.sources)) {
      out.i4SourcesChecked++;
      if (!src.path.includes(unit.module)) {
        out.i4UnitOffences.push(`${label(unit)}: ctx.${key} reads ${src.path}`);
      }
      if (!EXTRACTION_DERIVED.has(key)) continue;
      out.i4VintageChecked++;
      if (!(src.mtime >= runStartedAt)) {
        out.i4VintageOffences.push(
          `${label(unit)}: ctx.${key} mtime ${new Date(src.mtime).toISOString()} predates the run`
        );
      }
    }
    out.i4AssertChecked.t1++;
    try {
      assertSameUnit(unit, provenance);
    } catch (e) {
      out.i4AssertOffences.push(`t1 ${label(unit)}: ${e.message}`);
    }
  }
  return out;
}

let sweep;
beforeAll(async () => {
  sweep = await sweepCorpus();
}, 300_000);

describe('I1 — a blocking check either JUDGES the unit, or is EXCLUDED and provably unjudgeable', () => {
  // 🔴 I1's ORIGINAL WORDING WAS STRUCTURALLY BLIND TO THE FAILURE IT MOST NEEDED TO SEE.
  // "No blocking check SKIPs over a unit the loader emitted" watches for SKIPs — but an
  // EXCLUDED check is never invoked, so it never SKIPs. A judgeable subset that wrongly
  // dropped E1/E2/E4/E5 over all 166 module units would satisfy that wording perfectly.
  // ▶ So BOTH directions are asserted, which is what makes the loader's exclusion decision
  // falsifiable rather than self-certifying.

  it('direction A — no JUDGEABLE blocking check SKIPs over a unit the loader emitted', () => {
    // A SKIP here means the loader failed to supply something it could have: the pre-spend
    // gate reports "nothing to judge" over inputs that are on disk.
    expect(sweep.skipOffences).toEqual([]);
  });

  it('🔴 CONTROL — direction A was measured over a non-empty set of pairs', () => {
    // Measured 2026-08-28: 1,344 (unit, tier, blocking check) pairs — 1,324 at tier 1
    // (166 modules × 7 + 54 source-less × 3) and 20 at tier 0. A FLOOR, not a pin: the
    // corpus grows, and pinning the number would make a new chapter a test failure.
    expect(sweep.judgeablePairs).toBeGreaterThan(1000);
  });

  it('direction B — no EXCLUDED blocking check reaches a real verdict when run anyway', () => {
    // The F1 hole. If a check the loader excluded can in fact judge the unit, the exclusion
    // dropped a blocking check that would have run — and nothing else in the suite can see it.
    expect(sweep.excludedJudgedOffences).toEqual([]);
  });

  it('🔴 CONTROL — direction B is NOT vacuous: exclusions really are being exercised', () => {
    // 🔴 THIS IS THE CONTROL THAT GETS OMITTED, AND WITHOUT IT DIRECTION B IS THE `[]`-vs-`[]`
    // pin. Its live content today is exactly {exercises, chapter-metadata} × {E1,E2,E4,E5} =
    // 54 units × 4 = 216 pairs; TIER 0 EXCLUDES NOTHING FOR ANY KIND, so tier-0 direction B is
    // vacuous whatever the population. If a future change made every check judgeable
    // everywhere, direction B would test nothing and stay green — this floor goes red instead.
    expect(sweep.excludedPairs).toBeGreaterThan(100);
  });

  it('direction A — no judgeable blocking check reports a `leg-not-checked` finding', () => {
    // A partially-loaded ctx does not SKIP: E9 and G5 report the legs they could not check and
    // still return a verdict. That is a loader omission wearing a content verdict's clothes.
    expect(sweep.legOffences).toEqual([]);
  });

  it('🔴 CONTROL — findings WERE produced, so the empty leg list is not an empty corpus', () => {
    // `legOffences === []` is also what a corpus where no check emits any finding at all looks
    // like. E9 alone contributes ≥ 220 findings (its hand-edit leg fires on every unit), so
    // this control is live and free.
    expect(sweep.findingsTotal).toBeGreaterThan(100);
  });

  it('CONTROL — the sweep really visited every unit the loader emits', () => {
    expect(sweep.unitsSwept).toBe(ALL_UNITS.length);
  });

  it('CONTROL — every tier has blocking checks, so neither tier is silently unguarded', () => {
    // Without this, a tier whose checks were all made non-blocking would make its whole half
    // of I1 vacuous while every assertion above stayed green. Measured: 4 at tier 0
    // (G1,G2,G3,G5 — G4 is not blocking) and 7 at tier 1 (E1-E6 less E7, plus E9).
    expect(blockingOf(0).length).toBeGreaterThan(0);
    expect(blockingOf(1).length).toBeGreaterThan(0);
    expect(sweep.tier0Pairs).toBeGreaterThan(10);
  });
});

describe('I1 — the book-scope premise that licenses sweeping tier 0 over 5 combos, not 220 units', () => {
  it('🔴 tier-0 ctx does NOT vary by unit within a book — the reduction is tested, not assumed', async () => {
    // All four tier-0 keys resolve to ONE file per book, so a per-unit sweep would be 220
    // spawns evaluating 2 distinct values. That is only sound while this holds. Compared
    // across one unit of EVERY KIND present in the book, because `kind` is the axis a future
    // edit would plausibly branch on — first-vs-last can straddle or miss a kind entirely.
    for (const book of RUN_BOOKS) {
      const perKind = TIER0_COMBOS.filter((u) => u.book === book);
      expect(perKind.length, `${book} contributes no combo`).toBeGreaterThan(0);
      const first = JSON.stringify(loadTier0Ctx(perKind[0]).ctx);
      for (const unit of perKind.slice(1)) {
        expect(JSON.stringify(loadTier0Ctx(unit).ctx), `${book}: ${label(unit)} differs`).toBe(
          first
        );
      }
    }
  });

  it('CONTROL — the two books produce DIFFERENT tier-0 ctx, so the comparison discriminates', () => {
    // An identity assertion that would hold however the loader behaved pins nothing. If
    // `loadTier0Ctx` ignored `unit.book`, the test above would pass and every book would be
    // judged against chemistry's glossary.
    const [a, b] = RUN_BOOKS.map((book) => TIER0_COMBOS.find((u) => u.book === book));
    expect(JSON.stringify(loadTier0Ctx(a).ctx)).not.toBe(JSON.stringify(loadTier0Ctx(b).ctx));
  });
});

describe('I1 — the judgeable subset itself, pinned against a literal the loader cannot reach', () => {
  // 🔴 THIS IS THE ONLY ASSERTION IN THE FILE WHOSE ANCHOR IS NOT DERIVED FROM THE LOADER.
  // Everything else above compares the loader's probe against the loader's sweep — and when a
  // ctx key goes missing SYSTEMATICALLY, both sides move together and every one of them stays
  // green. See `EXPECTED_SUBSET` for the executed demonstration (E6, blocking, silently
  // dropped from all 220 units at 23/23 passing).

  for (const [key, expected] of Object.entries(EXPECTED_SUBSET)) {
    const [tierStr, kind] = [key.slice(0, 1), key.slice(2)];
    const tier = Number(tierStr);

    it(`${key} — the JUDGEABLE set is exactly the pinned literal`, async () => {
      const ids = [...(await judgeableIds(tier, kind, runState()))].sort();
      // Named per combination so a shrink says WHICH check stopped being judgeable on WHICH
      // kind, rather than printing two anonymous arrays.
      expect(ids, `tier ${tier} / kind '${kind}' judgeable subset changed`).toEqual(
        [...expected.judgeable].sort()
      );
    });

    it(`${key} — the EXCLUDED set is exactly the pinned literal`, async () => {
      const ids = [...(await excludedIds(tier, kind, runState()))].sort();
      expect(ids, `tier ${tier} / kind '${kind}' exclusions changed`).toEqual(
        [...expected.excluded].sort()
      );
    });
  }

  it('🔴 CONTROL — the pin covers EVERY (tier, kind) combination, so none is silently unpinned', () => {
    // A table missing a row pins nothing for that row while looking complete. 2 tiers × 3
    // kinds = 6; a new unit kind or a new tier must be added here deliberately.
    const wanted = [0, 1].flatMap((t) => UNIT_KINDS.map((k) => `${t}:${k}`));
    expect(Object.keys(EXPECTED_SUBSET).sort()).toEqual(wanted.sort());
  });

  it('🔴 CONTROL — the pin is a PARTITION of each tier: judgeable ∪ excluded = every check', async () => {
    // Binds the pin to the REGISTRY. Without it, a check added to a tier is absent from both
    // pinned arrays and the golden master silently stops describing the whole tier.
    for (const [key, expected] of Object.entries(EXPECTED_SUBSET)) {
      const tier = Number(key.slice(0, 1));
      const all = [...REGISTRY.values()].filter((c) => c.tier === tier).map((c) => c.id);
      expect(all.length, `tier ${tier} has no checks at all`).toBeGreaterThan(0);
      expect(
        [...expected.judgeable, ...expected.excluded].sort(),
        `${key} is not a partition`
      ).toEqual([...all].sort());
      // …and the two halves are disjoint, so a check cannot be pinned as both.
      expect(expected.judgeable.filter((id) => expected.excluded.includes(id))).toEqual([]);
    }
  });

  it('🔴 CONTROL — every BLOCKING check is pinned judgeable somewhere, so dropping one is red', () => {
    // 🔑 THE CONTROL THAT SEPARATES THE CASE WE CARE ABOUT. The pin only catches a dropped
    // blocking check if that check is named in some `judgeable` array to begin with. E6 is
    // blocking and appears in `1:module`, `1:exercises` and `1:chapter-metadata` — which is
    // exactly why `emittedFiles: undefined` now reddens three assertions instead of none.
    for (const tier of [0, 1]) {
      const pinnedJudgeable = new Set(
        Object.entries(EXPECTED_SUBSET)
          .filter(([k]) => Number(k.slice(0, 1)) === tier)
          .flatMap(([, v]) => v.judgeable)
      );
      const blocking = blockingOf(tier).map((c) => c.id);
      expect(blocking.length, `tier ${tier} has no blocking checks`).toBeGreaterThan(0);
      for (const id of blocking) {
        expect(pinnedJudgeable.has(id), `blocking ${id} is pinned judgeable on NO kind`).toBe(true);
      }
    }
  });

  it('🔴 CONTROL — the EXCLUDED half of the pin is not uniformly empty', () => {
    // Six `excluded: []` literals would make that half of the pin an `[]`-vs-`[]` comparison
    // that no exclusion change could ever move. Live content: {exercises, chapter-metadata} ×
    // {E1,E2,E4,E5} — the four source-side checks the two source-less kinds cannot judge.
    const totalExcluded = Object.values(EXPECTED_SUBSET).reduce((n, v) => n + v.excluded.length, 0);
    expect(totalExcluded).toBeGreaterThan(0);
  });
});

describe('I2 — every spawn/parse/read-sourced value is well-formed or null, never shapeless', () => {
  it('no ctx the loader emitted carries a present-but-shapeless value', () => {
    expect(sweep.i2Violations).toEqual([]);
  });

  it('🔴 CONTROL — EVERY guarded key was observed well-formed at least once, key by key', () => {
    // 🔴 PER-KEY, NOT A GLOBAL TOTAL. The assertion above skips `null`/absent values, so a
    // loader that emitted `null` for everything satisfies it perfectly — and a single global
    // counter is satisfied by one populated key while the other seven are vacuous. Measured
    // 2026-08-28: all eight keys are observed well-formed on the live corpus.
    for (const key of Object.keys(WELL_FORMED)) {
      expect(
        sweep.i2Observed[key] ?? 0,
        `ctx.${key} was never observed well-formed`
      ).toBeGreaterThan(0);
    }
  });

  it('🔴 CONTROL — the ARRAY-valued keys were seen carrying a PAYLOAD, not just a container', () => {
    // 🔴 THE COUNTER ABOVE CANNOT SEPARATE `[]` FROM A REAL VALUE. `handEdits`' guard accepts
    // an empty array on purpose (a unit nobody hand-edited is legal), and `[].every()` is
    // vacuously true — so without this, "observed well-formed 220 times" is satisfied by a
    // loader that returned 220 empty arrays, i.e. by `handEditCommits` silently failing.
    // Measured 2026-08-28: NON-EMPTY on 220/220 for both keys — `handEdits` lengths 1..10,
    // `inputs` 1 for the 54 source-less units and 2 for the 166 modules. So the control is
    // live and free, and it is what makes E9's hand-edit leg provably fed.
    for (const key of ARRAY_PAYLOAD_KEYS) {
      expect(
        sweep.i2NonEmptyPayloads[key] ?? 0,
        `ctx.${key} was never observed NON-EMPTY — the container passed, the payload is absent`
      ).toBeGreaterThan(0);
    }
  });

  it('🔴 CONTROL — the G5 trap is live, so I2 guards something real rather than a style rule', async () => {
    // 🔴 THE MEASURED SCOPE IS ONE KEY, AND SAYING SO IS THE POINT. Probed over all four
    // tier-0 blocking checks: substituting `{}` for `payloadText` makes G5 SKIP (it notices);
    // G1 and G3 FAIL on the real corpus either way, so they cannot separate anything; G2
    // PASSes over every substitution including the real ctx. EXACTLY ONE key exhibits the
    // trap — `payloadVerdict` into G5 — so the class is not generalised past its evidence.
    //
    // G5 is BLOCKING and hardcodes `examined: 1` on its verdict path, so runCheck's
    // "PASS + examined 0 -> SKIPPED" backstop is structurally disabled for it: a shapeless
    // verdict reads as a clean pre-spend gate. [LEAD] ruled work-around, not repair (L137),
    // so this control should stay red-if-changed rather than being deleted when G5 is fixed.
    const { ctx } = loadTier0Ctx(TIER0_COMBOS[0]);
    const shapeless = await runCheck(REGISTRY.get('G5'), { ...ctx, payloadVerdict: {} });
    expect(shapeless.verdict).toBe(VERDICT.PASS);
    // …and the value the loader emits INSTEAD is the one G5 can see, which is what makes the
    // filter load-bearing rather than cosmetic.
    const nulled = await runCheck(REGISTRY.get('G5'), { ...ctx, payloadVerdict: null });
    expect(nulled.verdict).toBe(VERDICT.FAIL);
  });
});

describe('I3 — the loader emits exactly the units the spender pays for', () => {
  it('the emitted work-list is 220 units over the two kept books', () => {
    // 🔴 ASSERTED, NOT IMPORTED FROM `api-translate.js` SO THE TWO AGREE BY CONSTRUCTION.
    // Measured: that tool exports `discoverModules` (166) and `discoverExercisesFile` (31) but
    // NOT `discoverChapters`, and assembles the work-list inline in `main()` — its exported
    // surface cannot enumerate the corpus, so importing it is unavailable, not merely lossy.
    // ⚠️ 220 IS THE SPEND-UNIT DENOMINATOR. §C82 L106/L126 records five live counts of "the
    // corpus" — 166 module pairs · 197 IS segment files · 220 exactly-paired basenames · 227 ·
    // 112 chapter×track cells — none wrong and none interchangeable. Do not compare it to the
    // other four.
    expect(ALL_UNITS.length).toBe(220);
  });

  it('🔴 CONTROL — the 23 chapter-metadata units are PRESENT: they are what a naive import drops', () => {
    // A source-driven walk (or `discoverModules` alone) silently loses the two kinds with no
    // source module — 31 exercises + 23 chapter-metadata, a quarter of the work-list. The
    // decomposition is asserted so that a count of 220 reached by the wrong mixture is red.
    expect(ALL_UNITS.filter((u) => u.kind === 'chapter-metadata')).toHaveLength(23);
    expect(ALL_UNITS.filter((u) => u.kind === 'exercises')).toHaveLength(31);
    expect(ALL_UNITS.filter((u) => u.kind === 'module')).toHaveLength(166);
  });

  it('🔴 no unit is emitted twice — a duplicate is a module paid for twice', () => {
    // The spender pays per unit. `unitsFor` walks directories, so a duplicate would arrive
    // from a second directory naming the same module rather than from a bad loop, and the
    // total would still look plausible.
    const keys = ALL_UNITS.map(label);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys.length).toBeGreaterThan(0); // the container is not the payload
  });
});

describe('I4 — same-unit, same-vintage provenance', () => {
  // 🔴 WHY THE OTHER THREE INVARIANTS CANNOT SEE THIS. E3 is BLOCKING, reads ONLY `segText`,
  // and cannot detect that it was handed another module's text: it answers CORRECTLY ABOUT THE
  // WRONG MODULE and returns PASS. I1 sees no SKIP, I2 sees a well-formed string, I3 sees the
  // right count. `remt-checks-extract.js:795` assigns this to the loader by name: "That is the
  // LOADER's contract (§C82 L21), not a guard's."

  it('every source the loader RECORDED belongs to THAT unit, over the whole corpus', () => {
    // ⚠️ "RECORDED", NOT "READ", AND THE DIFFERENCE IS REAL RATHER THAN PEDANTIC. This title
    // said "every source a ctx read", which is not what any assertion here checks. Measured
    // 2026-08-28: for a chemistry unit `ctx.glossariesByBook` carries BOTH books' glossaries
    // while `provenance.sources` records only chemistry's path. That is correct by design —
    // G4 is the one cross-book gate and needs both — but it means provenance is a record of
    // what the loader OPENED FOR THIS UNIT, not an inventory of every byte in the ctx.
    // ▶ Stating it makes the gap legible instead of papering over it.
    // ⚠️ This predicate is the test's OWN (`path.includes(unit.module)`), deliberately kept
    // independent of `assertSameUnit` so the two cannot fail together for one reason. It is
    // the WEAKER of the pair; `i4AssertOffences` below runs the real function.
    expect(sweep.i4UnitOffences).toEqual([]);
  });

  it('CONTROL — provenance sources were actually recorded, and counted', () => {
    // I4 passes trivially on a loader that records no sources at all. Measured: 386 sources
    // over the 220 tier-1 loads (`segText` for every unit, `cnxml` for the 166 module units).
    expect(sweep.i4SourcesChecked).toBeGreaterThan(200);
  });

  it('no ctx mixes extraction vintages', () => {
    // §C82 keeps TWO extraction vintages live for weeks, so a mixed-vintage ctx is a normal
    // accident. Every extraction-derived source must postdate this run's extract step.
    expect(sweep.i4VintageOffences).toEqual([]);
  });

  it('🔴 CONTROL — the vintage clause covered ONE key, not the three EXTRACTION_DERIVED names', () => {
    // ⚠️ SAYING WHICH KEY IS THE POINT. `EXTRACTION_DERIVED` names segText, emittedFiles and
    // freshExtract, but only `segText` can ever APPEAR in `provenance.sources` — the other two
    // come from the driver's runState and carry no path and no mtime. So the clause is
    // enforced on one key per unit, and reading the set as "three keys covered" overstates it
    // by 3×. The floor proves the filtered population was non-empty rather than silently
    // filtering everything away.
    expect(sweep.i4VintageChecked).toBeGreaterThan(200);
  });

  it('assertSameUnit accepts every ctx this loader built, at both tiers', () => {
    // The driver calls this per unit; a loader whose own output it rejects would halt the run.
    expect(sweep.i4AssertOffences).toEqual([]);
  });

  it('🔴 CONTROL — the sweep ran assertSameUnit at BOTH tiers, counted separately', () => {
    // 🔴 A GLOBAL `[]` HIDES A VACUOUS TIER. Until 2026-08-28 the tier-0 arm could not throw
    // on ANY input — tier-0 provenance is {glossary, payloadText}, both under `/glossary/`,
    // both carved out of the module check, and with no extraction-derived key the function
    // returned at vintage state 1. "at both tiers" was therefore true of the LOOP and false
    // of the CHECK. The book clause (R17) fixed the function; this counter plus the cross-book
    // control below prove the tier-0 arm is now doing work rather than being counted.
    expect(sweep.i4AssertChecked.t0).toBeGreaterThan(0);
    expect(sweep.i4AssertChecked.t1).toBe(ALL_UNITS.length);
  });

  it('🔴 CONTROL — assertSameUnit THROWS on a cross-BOOK tier-0 ctx (the arm that was a no-op)', () => {
    // The failure this separates: a tier-0 source that belongs to the OTHER book. Before R17
    // the `/glossary/` carve-out exempted these paths from every clause, so chemistry could be
    // judged against organic's glossary and the sweep would report nothing.
    const [chem, org] = RUN_BOOKS.map((book) => TIER0_COMBOS.find((u) => u.book === book));
    expect(chem.book).not.toBe(org.book); // bind what makes this case different
    const { provenance } = loadTier0Ctx(org);
    expect(Object.keys(provenance.sources).length).toBeGreaterThan(0); // not an empty loop
    expect(() => assertSameUnit(chem, provenance)).toThrow(/wrong BOOK/);
    // …and the SAME provenance against its own unit does not throw, so the throw is a property
    // of the cross-wiring rather than of tier-0 provenance being rejected wholesale.
    expect(() => assertSameUnit(org, provenance)).not.toThrow();
  });

  it('🔴 CONTROL — assertSameUnit THROWS on a deliberately cross-wired MODULE ctx', async () => {
    // Without a synthesised violation, the assertion above is satisfied by a function that
    // checks nothing. Two DISTINCT module units, because module ids are unique — see the
    // known gap pinned below for why the choice of kind decides the outcome.
    const [a, b] = ALL_UNITS.filter((u) => u.kind === 'module' && u.book === RUN_BOOKS[0]);
    expect(a.module).not.toBe(b.module); // bind what makes this case different
    const crossed = { ...(await loadTier1Ctx(a, runState())).provenance };
    crossed.sources = (await loadTier1Ctx(b, runState())).provenance.sources;
    expect(() => assertSameUnit(a, crossed)).toThrow(/does not belong to unit/);
  });

  it('🔴 cross-wiring two units whose module BASENAME is shared IS detected — by the chapter', async () => {
    // 🔴 THIS WAS A KNOWN-GAP PIN ASSERTING THE ABSENCE OF A THROW. It is now a positive test,
    // flipped in the same change that closed the gap (controller ruling R17, 2026-08-28) —
    // which is the whole reason the gap was pinned as a test rather than filed in a report.
    //
    // The old predicate was `src.path.includes(unit.module)`, and 54 of 220 units carry a
    // module basename that is a shared LITERAL: `exercises` ×31 and `chapter-metadata` ×23.
    // For those, "this source belongs to that unit" was satisfied by ANY unit of the same
    // kind, in any chapter, in either book — so I4's same-unit half was enforced on 166 units,
    // not 220. `assertSameUnit` now also requires the unit's own BOOK and, for
    // non-book-scoped sources, its own CHAPTER DIRECTORY.
    //
    // ⚠️ IT MUST BE THE **CHAPTER** CLAUSE THAT FIRES, AND THE TEST BINDS THAT RATHER THAN
    // TRUSTING IT. All 31 `exercises` units are organic today (chemistry has none), so a and b
    // share a book and the chapter is the only discriminator left — but nothing about that is
    // guaranteed, and if the population ever spans books this would pass on the BOOK clause
    // while the comment claimed the chapter one was pinned. So: same book, same module
    // literal, different chapter, and the message is matched on the chapter-specific stem
    // carrying the expected directory.
    //
    // ⚠️ THE BLAST RADIUS STAYS DELIBERATELY NARROW, AND THAT COST A REVISION. A first version
    // used a bare `.not.toThrow()`, and two mutation rounds that touched neither
    // `assertSameUnit` nor the shared-basename property (a fabricated provenance path; a
    // zeroed mtime) both turned it red, landing a future reader on a comment about a gap they
    // had not touched. A pin that reddens for reasons other than its own subject becomes noise
    // and gets deleted. ▶ So the EXPLICIT `null` vintage (state 3 — a declared pre-extract
    // pass) still decouples this from I4's other half, and the assertion still names the
    // SPECIFIC throw rather than any throw at all.
    const [a, b] = ALL_UNITS.filter((u) => u.kind === 'exercises');
    expect(a.module).toBe(b.module); // the shared literal — this is what defeated the check
    expect(a.book).toBe(b.book); // …so the BOOK clause cannot be what fires…
    expect(a.chapter).not.toBe(b.chapter); // …leaving the chapter as the only discriminator
    const own = (await loadTier1Ctx(a, runState())).provenance;
    const crossed = {
      ...own,
      sources: (await loadTier1Ctx(b, runState())).provenance.sources,
      extractRunStartedAt: null,
    };
    // The provenance really did cross: b's source file is not a's. Without this the test is
    // satisfied by provenance that never crossed at all.
    expect(crossed.sources.segText.path).not.toBe(own.sources.segText.path);
    expect(() => assertSameUnit(a, crossed)).toThrow(/wrong CHAPTER DIRECTORY/);
    // …naming the directory it expected, so the message diagnoses rather than merely refusing.
    expect(() => assertSameUnit(a, crossed)).toThrow(
      new RegExp(`expected .${chapterDirOf(a.chapter)}.`)
    );
    // POSITIVE CONTROL — a's OWN provenance is accepted, so the throw above is a property of
    // the cross-wiring and not of `exercises` units being rejected wholesale.
    expect(() => assertSameUnit(a, { ...own, extractRunStartedAt: null })).not.toThrow();
  });
});
