/**
 * Guard-the-guard (SR-OOS-2): the shared rules only protect what calls them.
 * Pins: all four server enforcement sites call validateStructure; both panes
 * delegate to the shared module (no resurrected inline rule bodies); both
 * views load the script; the UMD module keeps its CJS export.
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const read = (rel) => fs.readFileSync(path.join(__dirname, '..', rel), 'utf-8');

describe('server enforcement sites', () => {
  it('segment-editor route guards the save path', () => {
    const src = read('routes/segment-editor.js');
    expect(src).toMatch(/segmentValidation\.validateStructure\(/);
    expect(src).toMatch(/Vistun hafnað: byggingarmerki vantar eða hafa breyst\./);
  });
  it('localization route guards save AND save-all (two call sites)', () => {
    const src = read('routes/localization-editor.js');
    expect(
      src.match(/segmentValidation\.validateStructure\(/g)?.length ?? 0
    ).toBeGreaterThanOrEqual(2);
  });
  it('propagation guards per-occurrence', () => {
    const src = read('services/propagationService.js');
    expect(src).toMatch(/validateStructure\(/);
    expect(src).toMatch(/structure_blocked/);
  });
});

describe('propagation guard arming (SR-OOS-2 FIX4)', () => {
  it('routes/segment-editor.js wires sourceEn into the propagate call (omitting it would disarm the guard)', () => {
    const src = read('routes/segment-editor.js');
    expect(src).toMatch(/sourceEn:\s*sourceSeg\?\.en/);
  });
});

describe('client panes delegate (no inline rule bodies)', () => {
  for (const pane of ['public/js/segment-editor.js', 'public/js/localization-editor.js']) {
    it(`${pane} calls the shared module and owns no MATH regex`, () => {
      const src = read(pane);
      expect(src).toMatch(/segmentValidation\.validateStructure\(/);
      // the rule regex lives ONLY in segment-validation.js now
      // Match specifically: the mark extraction pattern used in validation (\.match() call)
      // Not tokenizers or display patterns (they're in alternations or escaped contexts)
      expect(src).not.toMatch(/\.match\(\/\\\[\\\[MATH:\\d\+\\\]\\\]/);
    });
  }
});

describe('views load the shared script before the pane bundle', () => {
  for (const view of ['views/segment-editor.html', 'views/localization-editor.html']) {
    it(`${view} includes /js/segment-validation.js`, () => {
      expect(read(view)).toMatch(/src="\/js\/segment-validation\.js"/);
    });
  }
});

describe('UMD contract', () => {
  it('module is requirable from CJS and exports validateStructure', async () => {
    const { createRequire } = await import('module');
    const req = createRequire(import.meta.url);
    expect(typeof req('../public/js/segment-validation').validateStructure).toBe('function');
  });
});
