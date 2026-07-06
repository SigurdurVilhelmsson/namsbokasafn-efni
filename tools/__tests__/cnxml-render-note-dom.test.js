/**
 * cnxml-render-note-dom.test.js — renderNote DOM-seam behavior (Track C C1).
 *
 * renderNote moved from global string-position sorting to a document-order DOM
 * walk. These tests pin the two behaviors that motivated and constrain C1:
 *   1. id-less <para> ordering FIX — the position-sort collapsed every id-less
 *      para to indexOf('<para') (the first para's offset), so an id-less para
 *      after an id'd one rendered BEFORE it. 95 biology notes hit this. Source
 *      order from the DOM walk fixes it.
 *   2. nested-block HOIST is preserved — renderPara drops block children, so a
 *      <list> inside a note <para> must still render (hoisted after the para).
 */

import { describe, it, expect } from 'vitest';
import { renderCnxmlToHtml, _loadBookConfigForTest } from '../cnxml-render.js';

_loadBookConfigForTest('efnafraedi-2e');

function renderNoteContent(inner) {
  const cnxml = `<document xmlns="http://cnx.rice.edu/cnxml" xmlns:m="http://www.w3.org/1998/Math/MathML"><title>T</title><metadata xmlns:md="http://cnx.rice.edu/mdml"><md:content-id>m00001</md:content-id><md:title>T</md:title></metadata><content>${inner}</content></document>`;
  return renderCnxmlToHtml(cnxml, { moduleId: 'm00001', chapter: 3, lang: 'is' }).html;
}

describe('renderNote — id-less <para> ordering', () => {
  it('renders an id-less para AFTER a preceding id-d para (source order)', () => {
    const html = renderNoteContent(
      '<note id="N"><para id="a">FIRST_PARA</para><para>SECOND_PARA</para></note>'
    );
    expect(html.indexOf('FIRST_PARA')).toBeLessThan(html.indexOf('SECOND_PARA'));
  });

  it('preserves source order across multiple mixed-id paras', () => {
    const html = renderNoteContent(
      '<note id="N"><para>P1</para><para id="x">P2</para><para>P3</para></note>'
    );
    expect(html.indexOf('P1')).toBeLessThan(html.indexOf('P2'));
    expect(html.indexOf('P2')).toBeLessThan(html.indexOf('P3'));
  });
});

describe('renderNote — commented-out content (real biology fix)', () => {
  it('does NOT render a <para> that is inside an XML comment', () => {
    // The string-position renderer used extractElements, whose regex matched
    // paras INSIDE <!-- --> comments and rendered them. 95 biology
    // "visual-connection" notes comment out their answer para (e.g. m66430
    // ch02): the figure + question should show, the commented answer must not.
    const html = renderNoteContent(
      '<note id="N" class="visual-connection">' +
        '<para id="q">How many neutrons do carbon-12 and carbon-13 have?</para>' +
        '<!--<para>Carbon-12 has six neutrons. Carbon-13 has seven neutrons.</para>-->' +
        '</note>'
    );
    expect(html).toContain('How many neutrons');
    expect(html).not.toContain('Carbon-12 has six neutrons');
  });
});

describe('renderNote — direct-child equation (was silently dropped)', () => {
  it('renders an <equation> that is a direct child of a note as a display block', () => {
    // renderNote's seam dispatch was {para,figure,list,media} — no `equation` —
    // so an <equation> placed directly in a note (between paras) was silently
    // dropped by the seam (e.g. m68849 ch20 lost 2 reaction equations). Adding
    // the dispatcher recovers it as a centered display block, once.
    const html = renderNoteContent(
      '<note id="N"><para id="p">Hvarfið er:</para>' +
        '<equation id="Q" class="unnumbered"><m:math><m:mi>NOTEEQ</m:mi></m:math></equation>' +
        '</note>'
    );
    expect(html.split('<mjx-container').length - 1).toBe(1);
    expect(html).toContain('class="equation unnumbered"');
    expect(html).toContain('class="mathjax-display"');
  });
});

describe('renderNote — nested-block hoist (characterization)', () => {
  it('renders a <list> nested inside a note <para> hoisted after the para', () => {
    const html = renderNoteContent(
      '<note id="N"><para id="p1">BEFORE_TEXT<list id="L"><item>NESTED_ITEM</item></list>AFTER_TEXT</para></note>'
    );
    // renderPara drops the block child: inline text is concatenated...
    expect(html).toContain('<p id="p1">BEFORE_TEXTAFTER_TEXT</p>');
    // ...and the list is hoisted out and rendered after the para.
    expect(html).toContain('<ul id="L">');
    expect(html).toContain('NESTED_ITEM');
    expect(html.indexOf('<p id="p1">')).toBeLessThan(html.indexOf('<ul id="L">'));
  });
});

describe('renderNote — title with inline markup (WS5 residual fix b, class hardening)', () => {
  it('does not leak a markup note <title>; renders it as the note h4', () => {
    // Same [^<]+ bug class fixed in renderExample: a note <title> carrying
    // <sub>/<emphasis> must be captured whole, not leaked as literal text.
    const html = renderNoteContent(
      '<note id="N"><title>Útreikningur á <emphasis effect="italics">K</emphasis><sub>a</sub></title>' +
        '<para id="p">Texti.</para></note>'
    );
    // only the single <head> title remains (no leaked body <title>)
    expect(html.split('<title>').length - 1).toBe(1);
    // the note heading renders the markup
    expect(html).toMatch(/<h4>Útreikningur á <em>K<\/em><sub>a<\/sub><\/h4>/);
  });
});
