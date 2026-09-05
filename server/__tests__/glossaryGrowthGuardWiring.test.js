/**
 * The §C119 growth gate must be CALLED by the exporter.
 *
 * A GATE NEVER CALLED IS A GATE THAT DOESN'T EXIST. glossaryGrowthGuard.test.js
 * pins the verdict; without this, deleting the call site leaves it green while
 * the export writes an unreviewed explosion exactly as before.
 *
 * Text is the instrument: export-terminology.js runs a CLI main() at load.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const src = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'export-terminology.js'), 'utf8');
const live = src.split('\n').filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*'));

describe('export-terminology calls the growth gate', () => {
  // Bind the name to the CALL, not merely to its mention: the identifier also
  // appears in the import list, so matching it alone would be satisfied by an
  // import of a function nobody invokes.
  it('invokes growthVerdict on the payload', () => {
    expect(live.some((l) => /=\s*growthVerdict\(prev,\s*next\)/.test(l))).toBe(true);
  });

  it('refuses on that verdict unless --force', () => {
    expect(live.some((l) => /if\s*\(\s*growth\.refuse\s*&&\s*!force\s*\)/.test(l))).toBe(true);
  });

  it('records a distinct outcome, so the refusal is legible in the status file', () => {
    expect(live.some((l) => /'refused-growth'/.test(l))).toBe(true);
  });

  it('still has the shrink gate — the two are independent, not a replacement', () => {
    expect(live.some((l) => /=\s*shrinkVerdict\(prev,\s*next\)/.test(l))).toBe(true);
  });
});
