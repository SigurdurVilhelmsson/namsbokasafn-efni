// tools/__tests__/image-basename-map.test.js
/**
 * The basename-keyed image map, extracted to .cjs so BOTH trees can read it.
 *
 * ⚠️ Why .cjs: `tools/` is ESM and `server/` is CommonJS, and this map is now a
 * dual-consumer fact — cnxml-inject swaps <image src> with it, cnxml-render
 * inverts it to find a figure's sidecar, and figureReviewService uses the
 * FORWARD direction to serve a translated figure to the editor. Per CLAUDE.md
 * that dual-consumer requirement is the only legitimate reason to reach for
 * .cjs, and it is the reason here.
 *
 * The function had no covering test at all before this file (verified with
 * codegraph's blast radius), which is what made moving it a risk worth pinning.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'module';
import fs from 'fs';
import os from 'os';
import path from 'path';

const require = createRequire(import.meta.url);
const { loadImageBasenameMap } = require('../lib/image-basename-map.cjs');

let bookDir;
beforeEach(() => {
  bookDir = fs.mkdtempSync(path.join(os.tmpdir(), 'imgmap-'));
});
afterEach(() => fs.rmSync(bookDir, { recursive: true, force: true }));

function writeMapping(entries) {
  fs.mkdirSync(path.join(bookDir, 'media'), { recursive: true });
  fs.writeFileSync(
    path.join(bookDir, 'media', 'image-mapping.json'),
    JSON.stringify(entries, null, 2)
  );
}

describe('loadImageBasenameMap', () => {
  it('returns the entries that carry originalImage', () => {
    writeMapping([
      { originalImage: 'CNX_Chem_01_01_ChemWeb', outputName: 'CNX_Chem_01_01_ChemWeb_IS.svg' },
    ]);
    expect(loadImageBasenameMap(bookDir)).toEqual([
      { originalImage: 'CNX_Chem_01_01_ChemWeb', outputName: 'CNX_Chem_01_01_ChemWeb_IS.svg' },
    ]);
  });

  it('excludes the legacy figure-id (docx-import) route, which has no originalImage', () => {
    writeMapping([
      { docxImage: 'image1.jpg', figureId: 'fig-ch03_00_01', outputName: 'F_is.jpg' },
      { originalImage: 'CNX_Keep', outputName: 'CNX_Keep_IS.svg' },
    ]);
    // The kept entry is the positive control: a loader that returned [] for
    // everything would pass the exclusion half trivially.
    expect(loadImageBasenameMap(bookDir).map((e) => e.originalImage)).toEqual(['CNX_Keep']);
  });

  it('an absent mapping file is [] — an untranslated book is the ordinary case', () => {
    expect(loadImageBasenameMap(bookDir)).toEqual([]);
  });

  it('a malformed mapping file is [], not a throw', () => {
    fs.mkdirSync(path.join(bookDir, 'media'), { recursive: true });
    fs.writeFileSync(path.join(bookDir, 'media', 'image-mapping.json'), '{not json');
    expect(loadImageBasenameMap(bookDir)).toEqual([]);
  });

  it('a non-array payload is [] — the object shape is the legacy one', () => {
    writeMapping({ 'fig-1': 'whatever' });
    expect(loadImageBasenameMap(bookDir)).toEqual([]);
  });
});

describe('the committed corpus', () => {
  const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..');

  it("chemistry's real mapping loads, and every entry carries both fields", () => {
    const entries = loadImageBasenameMap(path.join(repoRoot, 'books', 'efnafraedi-2e'));
    expect(entries.length).toBeGreaterThan(600); // 691 at time of writing
    for (const e of entries) {
      expect(typeof e.originalImage).toBe('string');
      expect(typeof e.outputName).toBe('string');
    }
  });

  it("biology's docx-route mapping is excluded WHOLESALE — the real exclusion control", () => {
    // liffraedi-2e's committed file is entirely figureId/docxImage entries, so
    // it is the corpus's own proof that the filter fires on real data and not
    // only on a fixture built to be filtered.
    const bio = path.join(repoRoot, 'books', 'liffraedi-2e');
    const raw = JSON.parse(fs.readFileSync(path.join(bio, 'media', 'image-mapping.json'), 'utf-8'));
    expect(raw.length).toBeGreaterThan(0); // the file really has entries to exclude
    expect(loadImageBasenameMap(bio)).toEqual([]);
  });
});

describe('one implementation, not two', () => {
  /**
   * Cross-side anchor: cnxml-render imports loadImageBasenameMap FROM
   * cnxml-inject, so a second copy living there would drift silently. Binding
   * identity is what makes "extracted, not duplicated" checkable.
   *
   * ⚠️ BOTH SIDES ARE REACHED THE SAME WAY, and that is load-bearing. Measured
   * 2026-09-04: in real Node, `createRequire()` and `import()` of this .cjs
   * yield ONE object; under vitest they yield TWO, because vitest interops a
   * CJS module through its own runner rather than Node's require cache. An
   * identity assertion that crossed the two instruments therefore failed on a
   * property that HOLDS in production — the harness, not the code. Comparing
   * import() to import() measures the binding this file exists to pin.
   */
  it('cnxml-inject re-exports the SAME function object', async () => {
    const inject = await import('../cnxml-inject.js');
    const lib = await import('../lib/image-basename-map.cjs');
    const libFn = lib.loadImageBasenameMap || lib.default.loadImageBasenameMap;
    expect(libFn).toBeTypeOf('function'); // the instrument really resolved something
    expect(inject.loadImageBasenameMap).toBe(libFn);
  });

  it('cnxml-inject defines no local copy beside the re-export', () => {
    // Source-level control, independent of any module-instance question: the
    // implementation MOVED, it was not copied. This is what goes red if a
    // future edit reinstates the old body next to the re-export.
    //
    // ⚠️ NOT a grep for 'image-mapping.json' — that was the first draft of this
    // assertion and its premise was false. cnxml-inject legitimately keeps a
    // SECOND reader of that same file, loadImageMapping(), for the legacy
    // figureId/docx-import route: different key, different filter, different
    // consumers. The two routes coexist on purpose (liffraedi-2e's committed
    // mapping is entirely the legacy shape), so the name is the discriminator.
    const src = fs.readFileSync(new URL('../cnxml-inject.js', import.meta.url), 'utf-8');
    expect(src).not.toMatch(/function\s+loadImageBasenameMap/);
  });
});
