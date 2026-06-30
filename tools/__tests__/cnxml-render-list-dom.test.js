import { describe, it, expect } from 'vitest';
import { renderCnxmlToHtml } from '../cnxml-render.js';

const MATH = '<m:math xmlns:m="http://www.w3.org/1998/Math/MathML"><m:mi>x</m:mi></m:math>';
function render(cnxml) {
  return renderCnxmlToHtml(cnxml, {
    lang: 'is',
    chapter: 13,
    bookSlug: 'efnafraedi-2e',
    moduleId: 'mTEST',
    moduleSections: {},
  }).html;
}

describe('renderList — block children inside list items', () => {
  it('renders an <equation> that is a sibling of <para> inside an item (was dropped)', () => {
    const html = render(
      '<document xmlns="http://cnx.rice.edu/cnxml"><content>' +
        '<example id="ex1"><list list-type="enumerated" class="stepwise">' +
        '<item><para id="p1">Skref eitt</para>' +
        `<equation id="eqLOST" class="unnumbered">${MATH}</equation></item>` +
        '</list></example></content></document>'
    );
    expect(html.split('<mjx-container').length - 1).toBe(1);
    expect(html).toContain('Skref eitt');
  });

  it('renders a <media> image that is a sibling of <para> inside an item (was dropped)', () => {
    const html = render(
      '<document xmlns="http://cnx.rice.edu/cnxml"><content>' +
        '<example id="ex2"><list class="stepwise">' +
        '<item><para id="p2">Sjá töflu</para>' +
        '<media id="m1" class="scaled-down" alt="ICE tafla"><image src="ICETableX_img_IS.svg" mime-type="image/svg+xml"/></media>' +
        '</item></list></example></content></document>'
    );
    expect(html).toContain('ICETableX_img_IS.svg');
    expect(html).toContain('Sjá töflu');
  });

  it('preserves source order: para before equation', () => {
    const html = render(
      '<document xmlns="http://cnx.rice.edu/cnxml"><content>' +
        '<list class="stepwise"><item><para id="pA">Fyrst</para>' +
        `<equation id="eqA" class="unnumbered">${MATH}</equation></item></list>` +
        '</content></document>'
    );
    expect(html.indexOf('Fyrst')).toBeLessThan(html.indexOf('<mjx-container'));
  });

  it('still renders a plain text-only item unchanged (no regression)', () => {
    const html = render(
      '<document xmlns="http://cnx.rice.edu/cnxml"><content>' +
        '<list><item>Bara texti</item></list></content></document>'
    );
    expect(html).toContain('Bara texti');
    expect(html.split('<li>').length - 1).toBe(1);
  });
});
