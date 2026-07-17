/**
 * cnxml-render-prescan-unify.test.js — item 10: per-module pre-scans on the
 * shared scanner. Gated shapes activate (multi-class unnumbered equations and
 * figures skipped from numbering; class-first figures numbered); id-first
 * corpus shapes number identically (equivalence pins).
 */

import { describe, it, expect } from 'vitest';
import { renderCnxmlToHtml, _loadBookConfigForTest } from '../cnxml-render.js';

_loadBookConfigForTest('efnafraedi-2e');

const MATHML = '<m:math xmlns:m="http://www.w3.org/1998/Math/MathML"><m:mi>x</m:mi></m:math>';

function doc(inner) {
  return (
    '<document xmlns="http://cnx.rice.edu/cnxml" xmlns:m="http://www.w3.org/1998/Math/MathML">' +
    '<title>T</title><content>' +
    inner +
    '</content></document>'
  );
}
const render = (inner) =>
  renderCnxmlToHtml(doc(inner), { lang: 'is', chapter: 3, moduleId: 'mT', moduleSections: {} })
    .html;

describe('P0-2 — equation numbering skips multi-class unnumbered', () => {
  it('class="foo unnumbered" equation consumes no number slot', () => {
    const html = render(
      `<equation id="e1" class="foo unnumbered">${MATHML}</equation>` +
        `<equation id="e2">${MATHML}</equation>`
    );
    // e2 is the FIRST numbered equation → 3.1 (pre-fix it was 3.2)
    expect(html).toContain('data-equation-number="3.1"');
    expect(html).not.toContain('data-equation-number="3.2"');
  });

  it('equivalence pin: exact-string single-class unnumbered behaves as before', () => {
    const html = render(
      `<equation id="e1" class="unnumbered">${MATHML}</equation>` +
        `<equation id="e2">${MATHML}</equation>`
    );
    expect(html).toContain('data-equation-number="3.1"');
    expect(html).not.toContain('data-equation-number="3.2"');
  });
});

describe('RV-3 — figure numbering: class-first ids found, unnumbered skipped', () => {
  const FIG = (attrs) =>
    `<figure ${attrs}><media id="${Math.random().toString(36).slice(2)}" alt="a">` +
    `<image src="x.jpg" mime-type="image/jpeg"/></media><caption>Test caption</caption></figure>`;

  it('class-first figure gets numbered (old id-first regex missed it)', () => {
    const html = render(FIG('class="scaled-down" id="f1"') + FIG('id="f2"'));
    expect(html).toContain('<span class="figure-label">Mynd 3.1</span>');
    expect(html).toContain('<span class="figure-label">Mynd 3.2</span>');
  });

  it('unnumbered figure consumes no slot', () => {
    const html = render(FIG('id="f1" class="unnumbered scaled-down"') + FIG('id="f2"'));
    expect(html).toContain('<span class="figure-label">Mynd 3.1</span>'); // f2 gets 3.1
    expect(html).not.toContain('<span class="figure-label">Mynd 3.2</span>');
  });

  it('equivalence pin: plain id-first figures number 3.1, 3.2 as before', () => {
    const html = render(FIG('id="f1"') + FIG('id="f2"'));
    expect(html).toContain('<span class="figure-label">Mynd 3.1</span>');
    expect(html).toContain('<span class="figure-label">Mynd 3.2</span>');
  });
});
