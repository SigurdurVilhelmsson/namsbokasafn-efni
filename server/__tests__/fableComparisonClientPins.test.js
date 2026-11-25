/**
 * The Fable comparison's client wiring (whole-branch review of PR 2: A I-1 / B C1, deferred minor 8). Static pins,
 * PRESENCE ONLY: the behaviour (the panel opens, records once, closes) is server/e2e/fable-flag.spec.js, and the
 * diff's cost on the real tree is wordDiffRealTree.test.js.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const serverDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = readFileSync(join(serverDir, 'public', 'js', 'segment-editor.js'), 'utf-8');
const fnBody = (name, next) => {
  const start = src.indexOf(`function ${name}(`);
  const end = src.indexOf(next, start);
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  return src.slice(start, end);
};

describe('the comparison diff is built on the first opening, not on a table render', () => {
  it('renderSegmentRow never calls the diff itself', () => {
    const row = fnBody('renderSegmentRow', 'function eligibilityView(');
    expect(row).toContain('fableMeaning'); // control: this is the function that draws the flag
    expect(row).not.toMatch(/wordDiff\(|comparisonHtml\(|renderWordDiffHtml\(/);
  });

  it('renderSegmentRow fills the panel only when it is open, from the cache', () => {
    const row = fnBody('renderSegmentRow', 'function eligibilityView(');
    expect(row).toMatch(/open \? fableComparisonDiffHtml\(seg\) : ''/);
  });

  it('toggleFableComparison builds the diff (through the cache) when it opens the panel', () => {
    const toggle = fnBody('toggleFableComparison', 'window.toggleFableComparison =');
    expect(toggle).toContain('fableComparisonDiffHtml(seg)');
  });

  it('the cache builds through word-diff.js comparisonHtml, keyed on both texts', () => {
    const cache = fnBody('fableComparisonDiffHtml', 'function toggleFableComparison(');
    expect(cache).toContain('window.wordDiffLib.comparisonHtml(before, after)');
    expect(cache).toMatch(/hit\.before === before && hit\.after === after/);
  });
});

describe('a unit opened again starts with its comparisons closed (deferred minor 8)', () => {
  it('resetFableComparisons empties the open and the posting sets', () => {
    const reset = fnBody('resetFableComparisons', 'function fableComparisonDiffHtml(');
    expect(reset).toContain('fableComparisonOpen.clear()');
    expect(reset).toContain('fableComparisonPosting.clear()');
  });

  it('leaveModule resets them', () => {
    expect(fnBody('leaveModule', 'BACK BUTTON')).toContain('resetFableComparisons()');
  });

  it('loadModule resets them when another unit is loaded', () => {
    expect(fnBody('loadModule', 'function loadTermData(')).toMatch(
      /if \(moduleId !== currentModuleId\) resetFableComparisons\(\);\s*currentModuleId = moduleId;/
    );
  });
});

describe("the loader's refusal reaches the editor in the server's words (whole-branch review B I1)", () => {
  // fetchJson builds err.message from data.error first (htmlUtils.js), which is the bare code; the §6.10 text
  // the server sends is in err.data.message.
  it('loadModule shows err.data.message for FABLE_LAYER_MISSING', () => {
    const load = fnBody('loadModule', 'function loadTermData(');
    expect(load).toMatch(
      /err\.status === 409 &&\s*err\.data &&\s*err\.data\.error === 'FABLE_LAYER_MISSING'/
    );
    expect(load).toMatch(/fableMissing\s*\?\s*err\.data\.message/);
  });

  it('the server sends the §6.10 text as message beside the code (control on what the client reads)', () => {
    const route = readFileSync(join(serverDir, 'routes', 'segment-editor.js'), 'utf-8');
    expect(route).toContain(
      "res.status(409).json({ error: 'FABLE_LAYER_MISSING', message: err.message })"
    );
  });
});
