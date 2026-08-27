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
import { parseJsonStrict, isPlainRecord } from '../remt-ctx.js';

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
