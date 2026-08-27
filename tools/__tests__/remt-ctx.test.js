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
  assertSameUnit,
  RUN_BOOKS,
} from '../remt-ctx.js';

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
