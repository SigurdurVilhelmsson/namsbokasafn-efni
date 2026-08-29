/**
 * remt-ctx.test.js — Task N1's unit tests for the Tier-0/Tier-1 ctx loader.
 *
 * ⚠️ THE IMPORT OF `../remt-battery.js` IS NOT A NO-OP AND MUST NOT BE "TIDIED" TO
 * `./lib/remt-battery.js`. The REGISTRY is populated by the five side-effect imports
 * that ONLY the top-level CLI performs, so importing the lib gives a registry of 0 and
 * every `REGISTRY.get('E9')` below reads `undefined`. Importing the CLI takes it from
 * 0 to 33 entries; its `main()` is guarded by `process.argv[1] === fileURLToPath(...)`
 * so nothing runs. `VERDICT`/`runCheck` come from the lib, which the CLI re-exports
 * nothing of — so both imports are needed, and both are load-bearing.
 */
import { describe, it, expect } from 'vitest';
import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import '../remt-battery.js'; // side-effect ONLY: takes REGISTRY from 0 to 33 entries
import { REGISTRY, runCheck, VERDICT } from '../lib/remt-battery.js';
import {
  parseJsonStrict,
  isPlainRecord,
  loadTier0Ctx,
  loadTier1Ctx,
  loadCtx,
  provenanceFor,
  representativeUnitFor,
  representativeUnitsFor,
  probeJudgeableSubset,
  PROBE_REPRESENTATIVES,
  mtOutputPathFor,
  chapterDirOf,
  expectedInputs,
  assertSameUnit,
  unitsFor,
  segPathOfUnit,
  judgeableIds,
  excludedIds,
  sentinelCtxFor,
  UNIT_KINDS,
  CTX_CAPABILITY,
  RUN_BOOKS,
  REPO_ROOT,
  RUN_START_FLOOR_MS,
  resetSubsetCache,
} from '../remt-ctx.js';
import { runState, snapshotFixture } from './helpers/remt-run-state.js';

describe('parseJsonStrict — I2, the three states of "nothing" collapsed to null', () => {
  it('parseJsonStrict returns null for a missing file, not {}', () => {
    expect(parseJsonStrict(null, isPlainRecord)).toBe(null);
  });

  it('parseJsonStrict returns null for malformed JSON, and does NOT throw', () => {
    expect(parseJsonStrict('{not json', isPlainRecord)).toBe(null);
  });

  it('🔴 parseJsonStrict returns null for the four bytes `null` — the §C21 type collision', () => {
    // A committed glossary holding literal `null` PARSED, so a gate keyed on `kind !== absent`
    // stood down while `null` was also the sentinel for "no previous producer". Measured: all
    // three glossary gates stood down and the cron WROTE.
    expect(parseJsonStrict('null', isPlainRecord)).toBe(null);
  });

  it('parseJsonStrict returns null for a well-formed value of the WRONG SHAPE', () => {
    expect(parseJsonStrict('[]', isPlainRecord)).toBe(null);
    expect(parseJsonStrict('42', isPlainRecord)).toBe(null);
  });

  it('POSITIVE CONTROL — a well-formed record survives, so the nulls above mean something', () => {
    expect(parseJsonStrict('{"entries":[]}', isPlainRecord)).toEqual({ entries: [] });
  });
});

describe('Tier-0 ctx — the book-scoped glossary keys', () => {
  it('Tier-0 ctx: payloadVerdict is ALWAYS PRESENT, and is a record or `null`', () => {
    // 🔴 THIS TEST USED TO GO RED WHEN THE LOADER BEHAVED EXACTLY AS L137 REQUIRES. It read
    // `if ('payloadVerdict' in ctx) expect(isPlainRecord(ctx.payloadVerdict)).toBe(true)`, and
    // `loadTier0Ctx` sets that key UNCONDITIONALLY — so the branch is always entered, and
    // `isPlainRecord(null)` is `false`. The moment `spawnGlossaryPayloadCheck` returns `null`
    // (the child script deleted or renamed, a fork failure, a child crash — the DESIGNED path)
    // this went red while the loader was correct, and it contradicted the test below it, which
    // explicitly allows `null`.
    // 🔴 THE REPAIR IT INVITED IS THE HAZARD L137 EXISTS TO PREVENT: making the loader omit the
    // key or emit `{}`. G5 is BLOCKING, `examined` is a literal on its verdict path so
    // runCheck's zero-examined backstop cannot save it, and it PASSES over `{}`.
    // ▶ What is pinned HERE is the half the neighbour does not cover: the key is never OMITTED.
    // Whether a TRUTHY value is judgeable is the next test's job — do not fold it back in here,
    // or the contradiction returns.
    const { ctx } = loadTier0Ctx({ book: 'lifraen-efnafraedi', kind: 'module' });
    expect('payloadVerdict' in ctx).toBe(true);
    expect(ctx.payloadVerdict === null || isPlainRecord(ctx.payloadVerdict)).toBe(true);
  });

  it('🔴 the loader never emits a SHAPELESS payloadVerdict — L137 is a value property', () => {
    // 🔴 THIS REPLACES THE BRIEF'S `expect(r.verdict).not.toBe(VERDICT.PASS)`, WHICH IS
    // REFUTED BY THE LIVE CORPUS. Measured over both kept books: the spawn returns
    // {"kind":"ok","producer":"export-terminology-resolved"}, so G5 reaches a REAL JUDGED
    // verdict — and on a healthy glossary that verdict IS PASS (examined 1, 0 findings).
    // The brief's own comment says "FAIL or a real judged verdict", so the assertion
    // contradicted its own intent; tuning the loader to make G5 not-PASS would mean
    // withholding a key that is genuinely present, i.e. manufacturing a blocking failure.
    // ▶ The invariant L137 actually asks for is about the LOADER'S OUTPUT, not G5's verdict:
    // never hand G5 a truthy value it cannot judge. That is what is asserted here, and the
    // hazard it prevents is pinned by the planted negative control below.
    for (const book of ['lifraen-efnafraedi', 'efnafraedi-2e']) {
      const { ctx } = loadTier0Ctx({ book, kind: 'module' });
      const v = ctx.payloadVerdict;
      expect(v === null || (isPlainRecord(v) && typeof v.producer === 'string')).toBe(true);
    }
  });

  it('🔴 NEGATIVE CONTROL — G5 PASSes over all four shapeless verdicts, so the filter is load-bearing', async () => {
    // G5 is BLOCKING and its verdict path hardcodes `examined: 1`, so runCheck's
    // "PASS + examined 0 -> SKIPPED" backstop is STRUCTURALLY DISABLED for it. Without this
    // control the assertion above is satisfiable by a loader that filters nothing, because a
    // healthy corpus never produces a shapeless value to filter.
    const { ctx } = loadTier0Ctx({ book: 'lifraen-efnafraedi', kind: 'module' });
    for (const shapeless of [{}, { error: 'boom' }, [], { kind: 'ok' }]) {
      const r = await runCheck(REGISTRY.get('G5'), { ...ctx, payloadVerdict: shapeless });
      expect(r.verdict, `G5 should pass over ${JSON.stringify(shapeless)}`).toBe(VERDICT.PASS);
    }
    // …and both spellings of "nothing" are refused, which is what the loader emits instead.
    for (const nothing of [null, undefined]) {
      const r = await runCheck(REGISTRY.get('G5'), { ...ctx, payloadVerdict: nothing });
      expect(r.verdict).toBe(VERDICT.FAIL);
      expect(r.findings.some((f) => f.kind === 'leg-not-checked' && f.leg === 'producer')).toBe(
        true
      );
    }
  });

  it('POSITIVE CONTROL — G5 reaches a JUDGED verdict over the loader ctx, naming the producer', async () => {
    const { ctx } = loadTier0Ctx({ book: 'efnafraedi-2e', kind: 'module' });
    const r = await runCheck(REGISTRY.get('G5'), ctx);
    expect(r.verdict).not.toBe(VERDICT.SKIPPED);
    expect(r.examined).toBe(1);
    expect(r.message).toContain('producer ');
    expect(r.message).not.toContain('producer NOT CHECKED');
  });

  it('G4 gets both books, so the one cross-book gate is not structurally inert', () => {
    const { ctx } = loadTier0Ctx({ book: 'efnafraedi-2e', kind: 'module' });
    expect(Object.keys(ctx.glossariesByBook).sort()).toEqual([...RUN_BOOKS].sort());
  });

  it('I4: tier-0 provenance names only glossary sources — assertSameUnit accepts it', () => {
    const unit = { book: 'efnafraedi-2e', kind: 'module', module: 'm68662' };
    const { provenance } = loadTier0Ctx(unit);
    expect(Object.keys(provenance.sources).length).toBeGreaterThan(0);
    expect(() => assertSameUnit(unit, provenance)).not.toThrow();
  });
});

describe('Tier-1 ctx — module-scoped, E9 five legs, the bare chapter form', () => {
  it('E9 reports NO leg-not-checked finding over a ctx this loader built', async () => {
    // E9 is the POSITIVE EXEMPLAR the invariants are written against: it emits
    // {kind:'leg-not-checked', leg, why} for every input it could not use, and its verdict is
    // `findings.length ? FAIL : PASS` — so a PARTIALLY loaded ctx becomes a FAIL, loud, and a
    // wholly absent one becomes SKIPPED with the LOADER named as the cause.
    // ⚠️ CHAPTER CORRECTED FROM THE BRIEF'S '1' TO '3': m00033 lives in organic ch03, and
    // organic ch01 holds only an exercises bundle. The brief's unit does not exist on disk.
    const unit = { book: 'lifraen-efnafraedi', chapter: '3', module: 'm00033', kind: 'module' };
    const { ctx } = await loadTier1Ctx(unit, runState());
    const r = await runCheck(REGISTRY.get('E9'), ctx);
    const notChecked = (r.findings || []).filter((f) => f.kind === 'leg-not-checked');
    expect(notChecked.map((f) => f.leg)).toEqual([]);
  });

  it('chapter is the BARE string form — `ch01` and -1 both read EMPTY', async () => {
    // ⚠️ MODULE CORRECTED FROM THE BRIEF'S m68662 TO m68663: m68662 is the ch00 preface (the
    // brief's own next test says so), so pairing it with chapter '01' names nothing on disk.
    const unit = { book: 'efnafraedi-2e', chapter: '01', module: 'm68663', kind: 'module' };
    const { ctx } = await loadTier1Ctx(unit, runState());
    expect(ctx.chapter).toBe('01');
    expect(String(ctx.chapter).startsWith('ch')).toBe(false);
    expect(ctx.chapter).not.toBe(-1);
    expect(ctx.cnxml).toBeTypeOf('string'); // the padded form really did resolve
  });

  it('POSITIVE CONTROL — chapter 0 survives, and it is FALSY', async () => {
    // Chemistry ch00 holds m68662, the only A5 fixture. `if (!chapter)` drops it.
    const unit = { book: 'efnafraedi-2e', chapter: '0', module: 'm68662', kind: 'module' };
    const { ctx } = await loadTier1Ctx(unit, runState());
    expect(ctx.chapter).toBe('0');
    expect(ctx.cnxml).toBeTypeOf('string');
  });

  it('🔴 the appendix chapter resolves — `ch` + padStart would build `chappendices`', async () => {
    // Chemistry keeps 12 real appendix units. padStart(2,'0') leaves 'appendices' untouched,
    // so the naive `ch${…}` template names a directory that has never existed, and all four
    // source-side blocking checks would SKIP over a unit whose source is right there.
    const unit = {
      book: 'efnafraedi-2e',
      chapter: 'appendices',
      module: 'm68859',
      kind: 'module',
    };
    const { ctx } = await loadTier1Ctx(unit, runState());
    expect(ctx.chapter).toBe('appendices');
    expect(ctx.cnxml).toBeTypeOf('string');
    expect(ctx.segText).toBeTypeOf('string');
  });

  it('`locked` comes from isMtLocked(), not existsSync — and is a BOOLEAN', async () => {
    // A non-boolean `locked` is treated by E9 as NOT CHECKED rather than as "not locked",
    // because the permissive reading of a forgotten leg is the one that clobbers an edited
    // baseline. isMtLocked's fail-safe (unreadable marker => locked) is discarded by a bare
    // existsSync, and no gate can see the difference.
    const unit = { book: 'efnafraedi-2e', chapter: '0', module: 'm68662', kind: 'module' };
    const { ctx } = await loadTier1Ctx(unit, runState());
    expect(ctx.locked).toBeTypeOf('boolean');
    expect(mtOutputPathFor(unit).endsWith('m68662-segments.is.md')).toBe(true);
  });

  it('a SOURCE-LESS kind omits cnxml rather than emitting an empty string', async () => {
    // I2 again: `''` is falsy but present, and skipIfCtxUnusable tests `!== ''` explicitly.
    // Emitting the key would also make `expectedInputs` claim an input that cannot exist.
    const unit = {
      book: 'lifraen-efnafraedi',
      chapter: '3',
      module: 'exercises',
      kind: 'exercises',
    };
    const { ctx } = await loadTier1Ctx(unit, runState());
    expect('cnxml' in ctx).toBe(false);
    expect(ctx.segText).toBeTypeOf('string');
    expect(ctx.inputs.every((i) => i.exists === true && i.bytes > 0)).toBe(true);
    expect(ctx.inputs.length).toBeGreaterThan(0); // the container is not the payload
  });

  it('I4: every tier-1 provenance source belongs to the unit it was loaded for', async () => {
    const unit = { book: 'efnafraedi-2e', chapter: '0', module: 'm68662', kind: 'module' };
    const { provenance } = await loadTier1Ctx(unit, runState());
    expect(Object.keys(provenance.sources)).toEqual(expect.arrayContaining(['cnxml', 'segText']));
    expect(() => assertSameUnit(unit, provenance)).not.toThrow();
    // NEGATIVE CONTROL — the assertion is not vacuous: another module's provenance throws.
    const other = { ...unit, module: 'm68663' };
    expect(() => assertSameUnit(other, provenance)).toThrow(/does not belong to unit/);
  });
});

describe('unitsFor — I3, the corpus enumerated honestly', () => {
  it('enumerates the two kept books and nothing else', () => {
    const units = RUN_BOOKS.flatMap((b) => unitsFor(b));
    expect(new Set(units.map((u) => u.book))).toEqual(new Set(RUN_BOOKS));
    expect(units.every((u) => UNIT_KINDS.includes(u.kind))).toBe(true);
    expect(units.length).toBeGreaterThan(0); // the container is not the payload
  });

  it('every unit kind is actually present in the corpus — an empty kind would throw later', () => {
    const units = RUN_BOOKS.flatMap((b) => unitsFor(b));
    for (const kind of UNIT_KINDS) {
      expect(units.filter((u) => u.kind === kind).length).toBeGreaterThan(0);
    }
  });

  it('🔴 every unit round-trips to a segment file that exists — the chapter form is not decorative', () => {
    // A unit whose chapter form does not rebuild its own directory reads an empty ctx, and
    // four blocking checks then SKIP over inputs that are on disk. Asserted over the WHOLE
    // population rather than a sample, because the appendix and ch00 cases are each one dir.
    for (const u of RUN_BOOKS.flatMap((b) => unitsFor(b))) {
      expect(existsSync(segPathOfUnit(u)), `${u.book}/${u.chapter}/${u.module}`).toBe(true);
    }
  });

  it('excludes the parenthesised re-extract duplicates — they are not units', () => {
    // `m68865-segments(b).en.md`-shaped files are COMMITTED in chemistry's 02-for-mt —
    // measured 2026-08-27: 49 of them, spread over 9 chapter dirs.
    // POSITIVE CONTROL: they exist, so this exclusion is not vacuous. Scanned across the
    // whole book rather than one named chapter, because a hardcoded dir manufactures the
    // absence it is meant to rule out — this control failed exactly that way when first
    // written against ch20, which holds none.
    const forMt = path.join(REPO_ROOT, 'books', 'efnafraedi-2e', '02-for-mt');
    const dupes = readdirSync(forMt, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .flatMap((e) => readdirSync(path.join(forMt, e.name)))
      .filter((f) => /\(\w+\)\.en\.md$/.test(f));
    expect(dupes.length).toBeGreaterThan(0);
    const modules = unitsFor('efnafraedi-2e').map((u) => u.module);
    expect(modules.every((m) => !m.includes('('))).toBe(true);
  });
});

describe('judgeableIds — Option C, probed by execution', () => {
  it('every unit kind gets a NON-EMPTY judgeable subset — an empty one THROWS in runTier', async () => {
    // 🔴 `runTier(tier, ctx, checks)` refuses a clean run over an empty set BY DESIGN, and `[]`
    // is TRUTHY, so `checks || [...]` passes it straight through to the throw. If the loader ever
    // computes an empty subset for a unit kind, the tier does not report — it DIES.
    for (const kind of UNIT_KINDS) {
      expect((await judgeableIds(1, kind, runState())).length).toBeGreaterThan(0);
    }
  });

  it('L136 (a): E3 is judgeable on EVERY source-less unit kind', async () => {
    for (const kind of UNIT_KINDS.filter((k) => !CTX_CAPABILITY[k].has('cnxml'))) {
      expect(await judgeableIds(1, kind, runState())).toContain('E3');
    }
  });

  it('🔴 judgeableIds returns ONLY checks of the tier asked for — runTier will NOT re-check', async () => {
    // Measured on main: runTier(1, ctx, [G1]) RAN the tier-0 check G1 and reported it as
    // {tier: 1, ranIds: ['G1']}. `tier` is a LABEL when `checks` is supplied, not a filter, and
    // the no-checks fallback path DOES filter — so the safe path validates and the explicit path
    // does not. The loader owns this agreement outright; nothing downstream re-checks it.
    for (const kind of UNIT_KINDS) {
      for (const tier of [0, 1]) {
        for (const id of await judgeableIds(tier, kind, runState())) {
          expect(REGISTRY.get(id).tier, `${id} leaked into tier ${tier}`).toBe(tier);
        }
      }
    }
  });

  it('POSITIVE CONTROL — the `module` kind gets MORE checks than a source-less kind', async () => {
    // Without this, "every kind gets a non-empty subset" is satisfied by giving them all the
    // same set, and Option C would be unimplemented while both assertions above passed.
    const sourceless = UNIT_KINDS.find((k) => !CTX_CAPABILITY[k].has('cnxml'));
    expect((await judgeableIds(1, 'module', runState())).length).toBeGreaterThan(
      (await judgeableIds(1, sourceless, runState())).length
    );
  });

  it('🔴 the SUBSET PROBE can satisfy E9 and E6 — otherwise it silently excludes them everywhere', async () => {
    // Without this, `judgeableIds` returning a plausible non-empty list is indistinguishable from
    // a probe too poor to reach a verdict on the checks that matter most.
    const sentinel = await sentinelCtxFor('module', runState());
    for (const id of ['E9', 'E6']) {
      const r = await runCheck(REGISTRY.get(id), sentinel);
      expect(r.verdict, `${id} SKIPPED during the probe`).not.toBe(VERDICT.SKIPPED);
    }
    expect(await judgeableIds(1, 'module', runState())).toEqual(
      expect.arrayContaining(['E9', 'E6'])
    );
  });

  it('L136 (c): the exclusions are REPORTED, never dropped silently', async () => {
    for (const kind of UNIT_KINDS) {
      const ids = await judgeableIds(1, kind, runState());
      const excluded = await excludedIds(1, kind, runState());
      // Together they must account for the whole tier — nothing may vanish between them.
      const tierIds = [...REGISTRY.values()].filter((c) => c.tier === 1).map((c) => c.id);
      expect([...ids, ...excluded].sort()).toEqual(tierIds.sort());
    }
    // POSITIVE CONTROL — a source-less kind really does exclude something, so an
    // always-empty `excludedIds` cannot satisfy the assertion above.
    expect((await excludedIds(1, 'exercises', runState())).length).toBeGreaterThan(0);
  });
});

describe('the guards that must not default', () => {
  it('🔴 chapterDirOf keeps chapter 0 and the appendix sentinel apart from a falsy check', () => {
    expect(chapterDirOf(0)).toBe('ch00'); // numeric 0 is FALSY — `if (!chapter)` drops it
    expect(chapterDirOf('0')).toBe('ch00');
    expect(chapterDirOf('00')).toBe('ch00');
    expect(chapterDirOf('4')).toBe('ch04');
    expect(chapterDirOf('appendices')).toBe('appendices'); // never `chappendices`
    // …and a genuinely absent chapter is refused rather than silently building `chNaN`.
    for (const bad of [null, undefined, '']) {
      expect(() => chapterDirOf(bad)).toThrow(/chapter is required/);
    }
  });

  it('🔴 an unrecognised unit.kind THROWS rather than silently dropping the cnxml input', () => {
    // The permissive branch costs money: `CTX_CAPABILITY[kind]?.has('cnxml')` reads false for
    // a misspelt kind, so E9's blocking leg 3 would certify a module whose source it never
    // looked for. POSITIVE CONTROL below: a real kind does list the source input.
    const bad = { book: 'efnafraedi-2e', chapter: '0', module: 'm68662', kind: 'modules' };
    expect(() => expectedInputs(bad)).toThrow(/unit\.kind must be one of/);
    const good = { ...bad, kind: 'module' };
    expect(expectedInputs(good).some((i) => i.path.endsWith('m68662.cnxml'))).toBe(true);
    expect(expectedInputs(good).every((i) => i.exists === true && i.bytes > 0)).toBe(true);
  });

  it('🔴 loadTier1Ctx refuses a runState missing any member the driver owes it', async () => {
    const unit = { book: 'efnafraedi-2e', chapter: '0', module: 'm68662', kind: 'module' };
    await expect(loadTier1Ctx(unit, {})).rejects.toThrow(/runState is missing/);
    await expect(loadTier1Ctx(unit, null)).rejects.toThrow(/needs the driver's runState/);
    // POSITIVE CONTROL — the complete one is accepted, so the rejections are not vacuous.
    await expect(loadTier1Ctx(unit, runState())).resolves.toHaveProperty('ctx.module', 'm68662');
  });
});

describe('the subset probe SAMPLES the corpus — one unit may not decide a whole kind', () => {
  it('probes PROBE_REPRESENTATIVES DISTINCT units per kind, spread rather than first-N', () => {
    for (const kind of UNIT_KINDS) {
      const reps = representativeUnitsFor(kind);
      expect(reps.length, kind).toBe(PROBE_REPRESENTATIVES);
      expect(new Set(reps.map((u) => `${u.book}/${u.chapter}/${u.module}`)).size).toBe(
        PROBE_REPRESENTATIVES
      );
      expect(reps.every((u) => u.kind === kind)).toBe(true);
    }
    // POSITIVE CONTROL — the sample really is spread. `unitsFor` sorts chapter dirs lexically,
    // so `'appendices' < 'ch00'` and the FIRST three `module` units are three chemistry
    // APPENDIX modules out of one directory: a sample that agrees with itself by construction
    // and would make the disagreement check below vacuous.
    expect(new Set(representativeUnitsFor('module').map((u) => u.chapter)).size).toBeGreaterThan(1);
    // …and the single-representative export still names the first, which is what the sentinel
    // is built from.
    expect(representativeUnitFor('module')).toEqual(representativeUnitsFor('module', 1)[0]);
  });

  it('🔴 the probe THROWS when representatives DISAGREE — the failure I1 structurally cannot see', async () => {
    // The hazard: a module unit with an absent or zero-byte `cnxml` sorts first for its kind,
    // `skipIfCtxUnusable` makes E1/E2/E4/E5 SKIP during the probe, all four are recorded
    // `excluded`, `ids` is still non-empty so the empty-subset guard never fires — and four
    // BLOCKING checks silently stop running over all 166 modules. A check that was excluded is
    // never invoked, so it never SKIPs, so an invariant watching for SKIPs is blind to it.
    // Planted here through E7's snapshots because they are the one ctx input a runState can
    // withhold per unit; the ctx damage it stands in for is the `cnxml` case above.
    // ⚠️ `probeJudgeableSubset` is the UNCACHED probe on purpose — `judgeableIds` memoises on
    // `tier:kind`, so probing through it with a deliberately impoverished runState would poison
    // the cache for every later call in this file.
    const reps = representativeUnitsFor('module');
    const odd = reps[reps.length - 1];
    const crippled = runState({
      freshExtractFor: (u) => (u.module === odd.module ? null : snapshotFixture()),
    });
    let msg = '';
    try {
      await probeJudgeableSubset(1, 'module', crippled);
    } catch (e) {
      msg = e.message;
    }
    expect(msg).toMatch(/DISAGREES/);
    expect(msg).toContain('E7'); // the differing check id
    expect(msg).toContain(`${odd.book}/${odd.chapter}/${odd.module}`); // the unit it came from
    expect(msg).toContain(`${reps[0].book}/${reps[0].chapter}/${reps[0].module}`); // …and the other side

    // POSITIVE CONTROL — the same probe over an intact runState AGREES and keeps E7, so the
    // throw above is a property of the planted defect and not of probing three units at all.
    const intact = await probeJudgeableSubset(1, 'module', runState());
    expect(intact.ids).toContain('E7');
    expect(intact.excluded).toEqual([]);
  });
});

describe('the probe asks a CAPABILITY question — run progress may not decide a kind"s subset', () => {
  // 🔴 THE DEFECT THESE PIN. `remt-ctx.js` tells the driver `emittedFiles` is "THIS RUN's
  // listing only". An honest run-scoped `emittedFilesFor` therefore returns [] or undefined for
  // the three representatives `probeJudgeableSubset` samples — the run has not extracted them.
  // Measured at c291313d: BOTH answers excluded E6, a BLOCKING check, from every unit kind, and
  // nothing downstream could see it (an excluded check is never invoked, so it never SKIPs, so
  // I1's SKIP-watching direction is structurally blind to it). No mutation was needed: a driver
  // author obeying a comment in this file reaches it.
  // ⚠️ `probeJudgeableSubset` throughout, never `judgeableIds` — the latter memoises on
  // `tier:kind`, so probing with a deliberately impoverished runState would poison the cache
  // for every later test in this file.

  it('🔴 A6 REGRESSION — an honest run-scoped `emittedFilesFor: () => []` does NOT exclude E6', async () => {
    const honest = runState({ emittedFilesFor: () => [] });
    const { ids, excluded } = await probeJudgeableSubset(1, 'module', honest);
    expect(excluded, 'E6 was silently excluded — this is the c291313d defect').not.toContain('E6');
    expect(ids).toContain('E6');
    // …and the `undefined` answer, which reaches the same SKIP by E6's own not-an-array arm
    // rather than by runCheck's zero-examined downgrade. Two routes, one defect.
    const undef = await probeJudgeableSubset(
      1,
      'module',
      runState({ emittedFilesFor: () => undefined })
    );
    expect(undef.excluded).not.toContain('E6');
    expect(undef.ids).toContain('E6');
    // 🔴 CONTROL — the assertions above are not satisfied by a probe that judges everything
    // unconditionally: the source-less kinds still exclude their four source-side checks.
    const sourceless = await probeJudgeableSubset(1, 'exercises', honest);
    expect(sourceless.excluded.sort()).toEqual(['E1', 'E2', 'E4', 'E5']);
  });

  it('🔴 A1 — the probe is EXEMPT from I4"s vintage clause, and a JUDGED unit is NOT', async () => {
    // Both directions, or the exemption silently widens from the probe to the whole run.
    // A real driver stamps the run's start, which is AFTER every committed source, so before
    // the exemption the very first probe threw (measured, 3 of 3 unit kinds).
    const future = new Date(Date.now() + 86400000).toISOString();
    const state = runState({ extractRunStartedAt: future });

    // DIRECTION 1 — the probe asks a capability question, and a capability has no vintage.
    await expect(probeJudgeableSubset(1, 'module', state)).resolves.toBeTruthy();
    await expect(sentinelCtxFor('module', state)).resolves.toBeTruthy();

    // DIRECTION 2 — the NEGATIVE CONTROL that keeps the exemption narrow. The same stamp on a
    // unit that is actually being judged still throws: that unit is about to be spent on.
    const unit = representativeUnitFor('module');
    await expect(loadTier1Ctx(unit, state)).rejects.toThrow(/OLDER extraction vintage/);
  });

  it('🔴 A2 — a runState function returning the WRONG SHAPE throws, naming unit, key and function', async () => {
    // `requireRunState` checked only that the four members are functions. A function returning
    // the wrong thing was accepted in silence, and for three of the four that cost a check its
    // verdict — `emittedFilesFor` → non-array is the N2 incident exactly.
    const unit = representativeUnitFor('module');
    const cases = [
      ['emittedFilesFor', 'emittedFiles', 'not-an-array'],
      ['costEstimateFor', 'costEstimate', 42],
      ['committedExtractFor', 'committedExtract', { segIds: new Set() }], // half-built
      ['freshExtractFor', 'freshExtract', 'snapshot'],
    ];
    for (const [fn, key, bad] of cases) {
      let msg = '';
      try {
        await loadTier1Ctx(unit, runState({ [fn]: () => bad }));
      } catch (e) {
        msg = e.message;
      }
      expect(msg, `${fn} returning ${JSON.stringify(bad)}`).toContain(`runState.${fn}`);
      expect(msg).toContain(`ctx.${key}`); // the key it would have become
      expect(msg).toContain(unit.module); // the unit it was loading
    }
    // 🔴 CONTROL — nullish is NOT a wrong shape. A driver truthfully saying "this run has not
    // produced that yet" must not be refused, or the honest answer becomes an error and the
    // pressure is to return a plausible-looking fake instead.
    for (const [fn] of cases) {
      await expect(loadTier1Ctx(unit, runState({ [fn]: () => undefined }))).resolves.toBeTruthy();
      await expect(loadTier1Ctx(unit, runState({ [fn]: () => null }))).resolves.toBeTruthy();
    }
  });

  it('🔴 A3 — a BLOCKING check may not be excluded while a run-supplied value is unusable', async () => {
    // The discriminator is the PROVENANCE of the key, never the check or the message: a value
    // the RUN supplies says how far the loop has got, and the subset is cached and applied to
    // every unit of the kind.
    let msg = '';
    try {
      await probeJudgeableSubset(1, 'exercises', runState({ costEstimateFor: () => undefined }));
    } catch (e) {
      msg = e.message;
    }
    expect(msg).toMatch(/would EXCLUDE the blocking check/);
    expect(msg).toContain('ctx.costEstimate'); // the key
    expect(msg).toContain('runState.costEstimateFor'); // the accessor that owes it
    expect(msg).toMatch(/E1|E2|E4|E5/); // the blocking checks it refused to drop

    // 🔴 CONTROL, AND IT IS THE WHOLE POINT OF A3 — this is NOT "never exclude a blocking
    // check". With every run-supplied value intact, the SAME four blocking checks are excluded
    // from the SAME kind without complaint, because that exclusion is STRUCTURAL: these kinds
    // have no CNXML, a fact about files on disk that no run can change.
    const ok = await probeJudgeableSubset(1, 'exercises', runState());
    expect(ok.excluded.sort()).toEqual(['E1', 'E2', 'E4', 'E5']);
  });

  it('A4 — resetSubsetCache is the way back from a poisoned subset', async () => {
    // Without it the FIRST runState a process probes with decides the subset for the life of
    // the process, with no way back — and there was no reset anywhere before 2026-08-29.
    const first = await judgeableIds(1, 'module', runState());
    expect(first).toContain('E6');
    resetSubsetCache();
    // CONTROL — the reset really cleared it: a probe that would now be REFUSED throws rather
    // than quietly returning the cached answer from before the reset.
    await expect(
      judgeableIds(1, 'exercises', runState({ committedExtractFor: () => undefined }))
    ).rejects.toThrow(/would EXCLUDE the blocking check/);
    resetSubsetCache(); // …and leave the cache clean for whatever runs after this file's block
    expect(await judgeableIds(1, 'module', runState())).toEqual(first);
  });
});

describe('I4 vintage — assertSameUnit enforces the half EXTRACTION_DERIVED only NAMED', () => {
  // The middle representative, so this is not the same unit every other test uses.
  const unit = representativeUnitsFor('module')[1];
  const provWith = (extractRunStartedAt) =>
    provenanceFor(unit, { segText: segPathOfUnit(unit) }, { extractRunStartedAt });

  it('🔴 NEGATIVE CONTROL — a source OLDER than the run start throws, naming key, both times and the drift', () => {
    // Without this the assertion below passes on a function that checks nothing at all.
    const stamp = new Date().toISOString(); // now: after every committed segment file
    let msg = '';
    try {
      assertSameUnit(unit, provWith(stamp));
    } catch (e) {
      msg = e.message;
    }
    expect(msg).toMatch(/OLDER extraction vintage/);
    expect(msg).toContain("'segText'"); // the key
    expect(msg).toContain(stamp); // the run start
    expect(msg).toMatch(/mtime \d{4}-\d{2}-\d{2}T/); // the source's own timestamp
    expect(msg).toMatch(/drift \d+ ms/); // and the size of the gap
  });

  it('POSITIVE CONTROL — the SAME source with a run start that precedes it does not throw', () => {
    // 2026-07-01 precedes the oldest committed EN segment file (2026-07-07T09:12:25.604Z,
    // efnafraedi-2e/appendices/m68859, measured over all 220 units on 2026-08-28).
    expect(() => assertSameUnit(unit, provWith('2026-07-01T00:00:00.000Z'))).not.toThrow();
    expect(() =>
      assertSameUnit(unit, provWith(Date.parse('2026-07-01T00:00:00.000Z')))
    ).not.toThrow();
  });

  it('🔴 an UNDEFINED stamp THROWS — the second representation of "nothing" may not walk past', () => {
    // `requireRunState` does not validate `extractRunStartedAt`, so a driver that forgets it
    // produces `extractRunStartedAt: undefined` silently — and that is precisely the input the
    // missing assertion needed. Standing the clause down over it is §C21's type collision.
    expect(() => assertSameUnit(unit, provWith(undefined))).toThrow(/UNDEFINED/);
  });

  it('an EXPLICIT null declares a pre-extract pass, and only then is the clause inapplicable', () => {
    // The pre-extract pass judges the COMMITTED vintage before the loop re-extracts anything,
    // so its sources legitimately predate every run. The driver must SAY so rather than omit.
    expect(() => assertSameUnit(unit, provWith(null))).not.toThrow();
  });

  it('an unparseable stamp throws rather than comparing against NaN', () => {
    // `mtime >= NaN` is false for every operand, so this would otherwise read as drift.
    expect(() => assertSameUnit(unit, provWith('not-a-date'))).toThrow(/not a usable run start/);
  });

  // ── THE FIFTH REPRESENTATION OF "NOTHING" (2026-08-29) ────────────────────────────────
  // Measured on this exact function before the floor landed: `0` and `-1` were ENFORCED
  // against `startedAt <= 0`, so `mtime >= startedAt` held for every file that has ever
  // existed; and `'0'` parses to 2000-01-01, so it was enforced against a bar nothing in a
  // 2026 corpus can fail. All three stood down SILENTLY while looking enforced.
  // 🔴 ASSERTED AS A PROPERTY, NOT AS THREE LITERALS. An enumeration that has been wrong once
  // should be replaced by the property — the three literals are only the members of it that
  // were measured, and `Number(entry.tier)`-style coercion can mint others (`''`, `false`,
  // `null` all coerce to 0 through arithmetic, and a truncated ISO string parses low).
  it('🔴 EVERY stamp that cannot be a real run start is refused — the property, not the literals', () => {
    const belowFloor = [
      0, // the measured no-op
      -1, // the measured no-op, negative
      '0', // 🔴 the nastiest: Date.parse('0') = 2000-01-01, enforced against an unfailable bar
      1, // one millisecond after the epoch
      -86400000, // a day before the epoch
      RUN_START_FLOOR_MS - 1, // the boundary, from the wrong side
      '1970-01-01T00:00:00.000Z',
      '1999-12-31T23:59:59.999Z',
      '2000-01-01T00:00:00.000Z', // exactly what `'0'` parses to
      new Date(RUN_START_FLOOR_MS - 1).toISOString(), // the boundary again, as a string
    ];
    for (const v of belowFloor) {
      expect(() => assertSameUnit(unit, provWith(v)), `stamp ${JSON.stringify(v)}`).toThrow(
        /not a usable run start/
      );
    }
    // 🔴 CONTROL — the floor is a FLOOR, not a blanket refusal. The boundary instant itself and
    // anything above it pass it; without this the assertions above are satisfied by a function
    // that refuses every stamp, which would break the clause in the opposite direction.
    expect(() => assertSameUnit(unit, provWith(RUN_START_FLOOR_MS))).not.toThrow();
    expect(() => assertSameUnit(unit, provWith(RUN_START_FLOOR_MS + 1))).not.toThrow();
    expect(() =>
      assertSameUnit(unit, provWith(new Date(RUN_START_FLOOR_MS).toISOString()))
    ).not.toThrow();
    // 🔴 CONTROL — and the clause it guards is still LIVE, so none of the above passed because
    // the vintage comparison had been disabled. A future stamp still throws, and throws the
    // OTHER error: the drift one, not the floor one.
    expect(() => assertSameUnit(unit, provWith(Date.now() + 86400000))).toThrow(
      /OLDER extraction vintage/
    );
  });

  it('the refusal NAMES the representations it refuses, so an operator is not left guessing', () => {
    // A bare "invalid timestamp" would send an operator looking for a typo. The three silent
    // representations have to be named, and the legitimate stand-down has to be signposted.
    let msg = '';
    try {
      assertSameUnit(unit, provWith('0'));
    } catch (e) {
      msg = e.message;
    }
    expect(msg).toContain(String(new Date(RUN_START_FLOOR_MS).toISOString())); // the floor itself
    expect(msg).toMatch(/2000-01-01/); // what `'0'` actually parses to
    expect(msg).toMatch(/null/); // the way to declare a pre-extract pass instead
    expect(msg).toContain('"0"'); // the value it was given
  });

  it('the floor sits below every legitimate run start AND above the `0` trap — the three constraints', () => {
    // The constant's docstring states three constraints. They are cheap to assert, and a
    // future edit that "tidies" the floor upward would silently refuse real runs.
    expect(RUN_START_FLOOR_MS).toBeGreaterThan(Date.parse('0')); // (1) refuses the `'0'` trap
    expect(RUN_START_FLOOR_MS).toBeLessThan(Date.parse('2025-05-18T21:03:58Z')); // (2) < first commit
    // (3) below the oldest committed source, or a declared early pass is refused before it is compared
    expect(RUN_START_FLOOR_MS).toBeLessThan(Date.parse('2026-07-07T09:12:25.604Z'));
    // …and below the value the shared test helper stamps, or every pin in this suite reddens
    // for a reason that has nothing to do with its own subject.
    expect(RUN_START_FLOOR_MS).toBeLessThan(Date.parse(runState().extractRunStartedAt));
  });

  it('tier-0 provenance carries no extraction-derived source, so the clause never engages', () => {
    // glossary/payloadText are book-scoped, not extract output. A tier-0 provenance has no
    // stamp at all, and must not be refused for it.
    const u0 = { book: 'efnafraedi-2e', kind: 'module', module: 'm68662' };
    const { provenance } = loadTier0Ctx(u0);
    expect(provenance.extractRunStartedAt).toBeUndefined(); // the state that throws at tier 1
    expect(Object.keys(provenance.sources).length).toBeGreaterThan(0); // …and it is not empty
    expect(() => assertSameUnit(u0, provenance)).not.toThrow();
  });
});

describe('CTX_CAPABILITY is TRUE about the sentinel — asserted in BOTH directions', () => {
  it('🔴 every declared key is in the sentinel, and every sentinel key is declared', async () => {
    // The table under-declared by exactly `committedExtract`/`freshExtract` — the two keys E7
    // reads — while E7 is judgeable on all three kinds. An author reasoning from the table
    // ("no kind declares them, so E7 cannot be judgeable anywhere") would write an invariant
    // that TOLERATES a blocking check being dropped. The reverse containment is the direction
    // that actually failed, so it is asserted first-class rather than implied.
    for (const kind of UNIT_KINDS) {
      const sentinel = await sentinelCtxFor(kind, runState());
      const declared = [...CTX_CAPABILITY[kind]];
      expect(declared.length, kind).toBeGreaterThan(0); // the container is not the payload
      expect(
        declared.filter((k) => !(k in sentinel)),
        `${kind}: declared but not supplied`
      ).toEqual([]);
      expect(
        Object.keys(sentinel).filter((k) => !CTX_CAPABILITY[kind].has(k)),
        `${kind}: supplied but not declared`
      ).toEqual([]);
    }
  });

  it('E7 is judgeable on EVERY unit kind — which is what the two added keys claim', async () => {
    for (const kind of UNIT_KINDS) {
      expect(await judgeableIds(1, kind, runState()), kind).toContain('E7');
    }
  });
});

describe('loadCtx dispatches strictly — NO GUARD MAY DEFAULT applies to the dispatcher too', () => {
  const unit = { book: 'efnafraedi-2e', chapter: '0', module: 'm68662', kind: 'module' };

  it('tier 0 and tier 1 each return their OWN ctx, and they are not interchangeable', async () => {
    const { ctx: t0 } = await loadCtx(0, unit, runState());
    expect('glossary' in t0).toBe(true);
    expect('cnxml' in t0).toBe(false);
    const { ctx: t1 } = await loadCtx(1, unit, runState());
    expect('cnxml' in t1).toBe(true);
    expect('glossary' in t1).toBe(false); // the ctx a defaulting dispatcher handed tier 0
  });

  it('🔴 every other tier value THROWS — the STRING "0" above all', async () => {
    // Measured before the fix: `loadCtx(2,…)`, `loadCtx(4,…)`, `loadCtx('x',…)` and
    // `loadCtx(undefined,…)` all returned a 13-key TIER-1 ctx and reported success. The live
    // trigger is `'0'`: a resumed driver reading the tier out of the JSON ledger gets a ctx
    // with no glossary key at all, and all five of G1-G5 then SKIP — four of them blocking —
    // so the pre-spend glossary gate reports nothing while looking like an empty tier.
    for (const bad of [2, 4, -1, 1.5, 'x', '0', '1', undefined, null, {}]) {
      await expect(
        loadCtx(bad, unit, runState()),
        `tier ${JSON.stringify(bad)} should be refused`
      ).rejects.toThrow(/loadCtx handles tier 0 and tier 1 only/);
    }
    // …and the refusal NAMES the value and its type, so a driver author can see what to fix.
    await expect(loadCtx('0', unit, runState())).rejects.toThrow(/"0" \(string\)/);
  });
});
