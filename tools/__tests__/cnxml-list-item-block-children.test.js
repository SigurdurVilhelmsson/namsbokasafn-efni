// tools/__tests__/cnxml-list-item-block-children.test.js
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { analyzeModuleOrder } from '../analyze-order-causes.js';
import {
  extractSegments,
  extractSegments as _extract,
  formatSegmentsMarkdown,
} from '../cnxml-extract.js';
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

describe('OC-E Layer 2: <para> wrapper on multi-child item', () => {
  it('m68793 item-1 renders <para id=fs-idm136564352>…</para><equation …/> inside the item', () => {
    const out = buildFresh(read('ch12', 'm68793'));
    const para = out.indexOf('id="fs-idm136564352"');
    const eq = out.indexOf('id="fs-idm98497056"');
    const listClose = out.indexOf('</list>', out.indexOf('id="fs-idm90348816"'));
    // both the para wrapper and the equation are present, inside the list, in order
    expect(para).toBeGreaterThan(-1);
    expect(eq).toBeGreaterThan(para);
    expect(eq).toBeLessThan(listClose);
    // the equation is NOT nested inside the para (para closes before the equation)
    const paraClose = out.indexOf('</para>', para);
    expect(paraClose).toBeLessThan(eq);
    // fidelity: the equation's original class="unnumbered" must be preserved
    // (it lives on the [[MATH:N]] placeholder meta, not the id-keyed equations entry;
    // dropping it would be a silent regression from the pre-Layer-2 in-item render)
    expect(out).toContain('class="unnumbered"');
  });
});

describe('OC-E: fail-loud guard', () => {
  it('throws if a list-nested block equation has no in-item placeholder or content node', () => {
    // Synthetic module: a list item references a block equation by id, but the
    // equation has NO <m:math> (so no [[MATH:N]] placeholder is produced) and it
    // is inside the list (so Task 2 strips it from top-level content) → it would
    // be silently dropped. The guard must throw.
    const bad = `<?xml version="1.0"?>
<document xmlns="http://cnx.rice.edu/cnxml" xmlns:m="http://www.w3.org/1998/Math/MathML" id="mTEST">
<title>t</title><content>
<list id="L1"><item><equation id="EQGHOST"></equation></item></list>
</content></document>`;
    expect(() => _extract(bad, 'mTEST')).toThrow(/EQGHOST/);
  });

  it('throws if a list-nested block equation is hidden behind a nested list with a sibling block (nested-list under-scoping)', () => {
    // Synthetic module: L1's item contains a nested list L2, followed by a
    // SIBLING <equation> in the same item. A non-greedy `<list...>...</list>`
    // regex would terminate at L2's closing </list> and never see EQAFTER,
    // hiding a genuine drop from step 1 of the guard. extractNestedElements
    // (depth-correct) must still catch it.
    const bad = `<?xml version="1.0"?>
<document xmlns="http://cnx.rice.edu/cnxml" xmlns:m="http://www.w3.org/1998/Math/MathML" id="mTEST">
<title>t</title><content>
<list id="L1"><item><list id="L2"><item>x</item></list><equation id="EQAFTER"></equation></item></list>
</content></document>`;
    expect(() => _extract(bad, 'mTEST')).toThrow(/EQAFTER/);
  });

  it('does not throw for the real modules (all in-item blocks accounted for)', () => {
    // m68739/m68793: bare block equation/media directly in a list item, covered
    // via [[MATH:N]]/[[MEDIA:N]] placeholders (Task 2's fix).
    // m68685: <figure><media/></figure> nested in a list item — the figure is
    // hoisted to top-level content by the pre-existing (Task-2-independent)
    // blanket <figure> extraction in processTopLevelContent, so its media id
    // renders via the figure's own `media.id` field rather than a placeholder.
    // Exercises the guard's figure-aware coverage branch against the real gate.
    for (const [ch, m] of [
      ['ch07', 'm68739'],
      ['ch12', 'm68793'],
      ['ch02', 'm68685'],
    ]) {
      expect(() => _extract(read(ch, m), m)).not.toThrow();
    }
  });
});
