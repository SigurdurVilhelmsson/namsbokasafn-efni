/**
 * cnxml-render-example-dom.test.js — renderExample DOM-seam behavior (Track C C2).
 *
 * renderExample moved from global string-position sorting to the document-order
 * DOM seam (renderBlockChildrenInOrder). These pin the two behavior changes the
 * migration makes by construction; golden covers the byte-identical bulk.
 */

import { describe, it, expect } from 'vitest';
import { renderCnxmlToHtml, _loadBookConfigForTest } from '../cnxml-render.js';

_loadBookConfigForTest('efnafraedi-2e');

function renderExampleContent(inner) {
  const cnxml = `<document xmlns="http://cnx.rice.edu/cnxml" xmlns:m="http://www.w3.org/1998/Math/MathML"><title>T</title><metadata xmlns:md="http://cnx.rice.edu/mdml"><md:content-id>m00001</md:content-id><md:title>T</md:title></metadata><content>${inner}</content></document>`;
  return renderCnxmlToHtml(cnxml, { moduleId: 'm00001', chapter: 3, lang: 'is' }).html;
}

describe('renderExample — equation inside a para (de-duplication)', () => {
  it('renders an in-para equation exactly once (not inline + a duplicate block)', () => {
    // The old position-sort extracted the equation separately AND renderPara
    // rendered it inline → the same equation rendered twice (natural inline
    // position + a redundant <div class="equation"> block). 44 efnafraedi
    // example sites. The top-level DOM walk renders it once, inline.
    const html = renderExampleContent(
      '<example id="E"><para id="p">Hlutfallið er:<newline/><equation id="Q"><m:math><m:mi>EQDEDUP</m:mi></m:math></equation></para></example>'
    );
    // exactly one MathJax render of the equation
    expect(html.split('<mjx-container').length - 1).toBe(1);
    // and no separate display-equation block was emitted as a duplicate
    expect(html).not.toContain('class="equation unnumbered"');
  });
});

describe('renderExample — direct-child figure (isInsidePara guard retired)', () => {
  it('keeps a direct-child figure inside the example even when a sibling para xrefs it', () => {
    // The old code used a substring guard to avoid id="X" colliding with
    // target-id="X"; the top-level DOM walk distinguishes structurally, so the
    // figure renders inside the example aside (m68700 copper pattern).
    const html = renderExampleContent(
      '<example id="E"><para id="q"><title>Útreikningur</title>Sjá (<link target-id="F"/>).</para>' +
        '<figure id="F"><media id="m" alt="a"><image mime-type="image/jpeg" src="../../media/EX_FIG.jpg"/></media><caption>Cap</caption></figure>' +
        '<para id="s"><title>Lausn</title>Svar.</para></example>'
    );
    const figIdx = html.indexOf('EX_FIG.jpg');
    const asideClose = html.indexOf('</aside>');
    expect(figIdx).toBeGreaterThan(-1);
    expect(figIdx).toBeLessThan(asideClose); // inside the example
    expect(html.split('EX_FIG.jpg').length - 1).toBe(1); // exactly once
  });
});
