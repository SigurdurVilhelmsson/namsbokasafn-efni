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
  chapterDirOf,
  EXTRACTION_DERIVED,
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
 * I2 IN A TABLE: the shape each loader-supplied value must satisfy WHEN PRESENT. Every key
 * here reaches ctx through a parse, a spawn, a file read or a shape guard — i.e. through
 * something that can half-succeed. The property is *absent, `null`, or well-formed*; the
 * shape I2 exists to refuse is present-but-shapeless, which is truthy and passes every
 * `if (ctx.key)` its consumers write.
 *
 * ⚠️ `payloadVerdict` DEMANDS A `producer` STRING, not merely a non-empty record, because
 * that is the value G5 reads. ⚠️ The two string keys demand `!== ''`: an empty file read
 * yields `''`, which is falsy-but-present — the mirror image of the same defect, and
 * `skipIfCtxUnusable` tests for it explicitly.
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
};

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
    // I4
    i4UnitOffences: [],
    i4VintageOffences: [],
    i4AssertOffences: [],
    i4SourcesChecked: 0,
    i4VintageChecked: 0,
  };

  const censusI2 = (ctx, where) => {
    for (const [key, wellFormed] of Object.entries(WELL_FORMED)) {
      if (!(key in ctx) || ctx[key] === null || ctx[key] === undefined) continue;
      if (wellFormed(ctx[key])) out.i2Observed[key] = (out.i2Observed[key] || 0) + 1;
      else
        out.i2Violations.push(`${where}: ctx.${key} = ${JSON.stringify(ctx[key])?.slice(0, 80)}`);
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

  it('every source a ctx read belongs to THAT unit, over the whole corpus', () => {
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

  it('🔴 KNOWN GAP — cross-wiring two units whose module BASENAME is shared is NOT detected', async () => {
    // 🔴 MEASURED 2026-08-28, AND IT REFUTES THE TASK BRIEF'S OWN I4 CONTROL, WHICH USED
    // `unitsFor('lifraen-efnafraedi')[0]` AND `[1]` — both of them `exercises` units. Written
    // as the brief has it, that control does NOT throw and ships red.
    //
    // The predicate is `src.path.includes(unit.module)`, and 54 of 220 units carry a module
    // basename that is a shared LITERAL: `exercises` ×31 and `chapter-metadata` ×23. For those
    // units "this source belongs to that unit" is satisfied by ANY unit of the same kind, in
    // any chapter, in either book. ▶ So I4's same-unit half is enforced on 166 units, not 220,
    // and the discriminator it is missing is the chapter directory.
    //
    // ▶ THIS IS PINNED, NOT ACCEPTED. Whether `assertSameUnit` should also require
    // `chapterDirOf(unit.chapter)` in the path is a [LEAD]/loader-owner call, not a test
    // author's — Task N2 creates one test file and N1's loader is reviewed and committed. The
    // pin is here so the gap is VISIBLE and so a fix goes RED and lands on this comment,
    // rather than the gap living only in a report nobody re-reads.
    const [a, b] = ALL_UNITS.filter((u) => u.kind === 'exercises');
    expect(a.module).toBe(b.module); // the shared literal — this is what defeats the check
    expect(a.chapter).not.toBe(b.chapter); // …while the units are genuinely different
    const crossed = { ...(await loadTier1Ctx(a, runState())).provenance };
    crossed.sources = (await loadTier1Ctx(b, runState())).provenance.sources;
    // …and the crossed source really is the OTHER unit's file: its chapter directory is b's,
    // not a's. Without this the pin could be satisfied by provenance that never crossed.
    const paths = Object.values(crossed.sources).map((s) => s.path);
    expect(paths.length).toBeGreaterThan(0);
    expect(paths.every((p) => p.includes(`/${chapterDirOf(b.chapter)}/`))).toBe(true);
    expect(paths.some((p) => p.includes(`/${chapterDirOf(a.chapter)}/`))).toBe(false);
    expect(() => assertSameUnit(a, crossed)).not.toThrow(); // ← goes RED when the gap is closed
  });
});
