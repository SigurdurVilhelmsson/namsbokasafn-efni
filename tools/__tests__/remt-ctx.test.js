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
import '../remt-battery.js'; // side-effect ONLY: takes REGISTRY from 0 to 33 entries
import { REGISTRY, runCheck, VERDICT } from '../lib/remt-battery.js';
import {
  parseJsonStrict,
  isPlainRecord,
  loadTier0Ctx,
  loadTier1Ctx,
  mtOutputPathFor,
  assertSameUnit,
  RUN_BOOKS,
} from '../remt-ctx.js';
import { runState } from './helpers/remt-run-state.js';

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
  it('Tier-0 ctx: payloadVerdict is a well-formed object or absent — never a bare {}', () => {
    const { ctx } = loadTier0Ctx({ book: 'lifraen-efnafraedi', kind: 'module' });
    if ('payloadVerdict' in ctx) expect(isPlainRecord(ctx.payloadVerdict)).toBe(true);
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
