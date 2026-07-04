// tools/__tests__/cnxml-list-item-block-children.test.js
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { analyzeModuleOrder } from '../analyze-order-causes.js';
import { extractSegments, formatSegmentsMarkdown } from '../cnxml-extract.js';
import { buildCnxml, parseSegments } from '../cnxml-inject.js';
import { compareTagCounts } from '../cnxml-fidelity-check.js';

const SRC = join(process.cwd(), 'books/efnafraedi-2e/01-source');
const read = (ch, m) => readFileSync(join(SRC, ch, `${m}.cnxml`), 'utf8');

/** Build fresh injected CNXML the same way analyzeModuleOrder does. */
function buildFresh(src) {
  const { segments, structure, equations, inlineAttrs } = extractSegments(src);
  const parsed = parseSegments(formatSegmentsMarkdown(segments));
  return buildCnxml(structure, parsed, equations, src, {}, inlineAttrs).cnxml;
}

const MODULES = [
  ['ch07', 'm68739'],
  ['ch12', 'm68793'],
  ['ch18', 'm68832'],
  ['ch21', 'm68852'],
];

describe('OC-E: block children inside <list><item>', () => {
  for (const [ch, m] of MODULES) {
    it(`${m}: no reordered ids`, () => {
      expect(analyzeModuleOrder(read(ch, m)).moved).toEqual([]);
    });
    it(`${m}: no dropped equation/media (tag-count parity)`, () => {
      const src = read(ch, m);
      const diffs = compareTagCounts(src, buildFresh(src));
      const lost = diffs.filter(
        (d) => (d.tag === 'equation' || d.tag === 'media') && d.difference < 0
      );
      expect(lost).toEqual([]);
    });
  }

  it('m68793: item-1 equation renders inside its list, not after it', () => {
    const out = buildFresh(read('ch12', 'm68793'));
    // The list fs-idm90348816 closes; item-1's equation fs-idm98497056 must
    // appear BEFORE that </list>, i.e. inside the list.
    const listOpen = out.indexOf('id="fs-idm90348816"');
    const listClose = out.indexOf('</list>', listOpen);
    const eq = out.indexOf('id="fs-idm98497056"');
    expect(eq).toBeGreaterThan(listOpen);
    expect(eq).toBeLessThan(listClose);
  });
});
