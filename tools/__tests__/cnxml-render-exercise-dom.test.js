/**
 * cnxml-render-exercise-dom.test.js — renderExercise equation handling (Track C, C2 follow-up).
 *
 * renderExercise's section renderer (renderSectionContent) originally dispatched
 * only {para, media, figure, list}. With no `equation` dispatcher:
 *   1. a <equation> that is a DIRECT CHILD of <problem>/<solution> was DROPPED
 *      entirely by the DOM seam (silent content loss — e.g. m68670's density
 *      formula d = m/V vanished);
 *   2. an <equation> nested in a problem/solution <para> rendered as a cramped
 *      inline <span class="math-inline"> copy instead of a centered display
 *      block (same artifact the example fix addressed — m68667).
 *
 * The fix adds `equation: renderEquation` to the dispatch and `equation` to
 * hoistTags, so both render once as a centered display block.
 */

import { describe, it, expect } from 'vitest';
import { renderCnxmlToHtml, _loadBookConfigForTest } from '../cnxml-render.js';

_loadBookConfigForTest('efnafraedi-2e');

function renderExerciseContent(inner) {
  const cnxml = `<document xmlns="http://cnx.rice.edu/cnxml" xmlns:m="http://www.w3.org/1998/Math/MathML"><title>T</title><metadata xmlns:md="http://cnx.rice.edu/mdml"><md:content-id>m00001</md:content-id><md:title>T</md:title></metadata><content>${inner}</content></document>`;
  return renderCnxmlToHtml(cnxml, { moduleId: 'm00001', chapter: 3, lang: 'is' }).html;
}

describe('renderExercise — direct-child equation (was dropped)', () => {
  it('renders an <equation> that is a direct child of <problem> as a display block', () => {
    const html = renderExerciseContent(
      '<exercise id="E"><problem id="P">' +
        '<para id="a">Eðlismassi er skilgreindur svona:</para>' +
        '<equation id="Q" class="unnumbered"><m:math><m:mi>EXDIRECT</m:mi></m:math></equation>' +
        '<para id="b">Útskýrðu hvers vegna.</para>' +
        '</problem></exercise>'
    );
    // the equation must survive (it was dropped before) — once, as a display block
    expect(html.split('<mjx-container').length - 1).toBe(1);
    expect(html).toContain('class="equation unnumbered"');
    expect(html).toContain('class="mathjax-display"');
  });
});

describe('renderExercise — in-para equation (was inline)', () => {
  it('renders an in-para problem equation once, as a centered display block', () => {
    const html = renderExerciseContent(
      '<exercise id="E"><problem id="P"><para id="a">Efnajafnan er:<newline/>' +
        '<equation id="Q" class="unnumbered"><m:math><m:mi>EXINPARA</m:mi></m:math></equation>' +
        '</para></problem></exercise>'
    );
    expect(html.split('<mjx-container').length - 1).toBe(1);
    expect(html).toContain('class="equation unnumbered"');
    expect(html).toContain('class="mathjax-display"');
    expect(html).not.toContain('class="math-inline"');
  });
});

describe('renderExercise — table inside a problem para (F1b leak fix)', () => {
  // The brief's original draft put the table in a <solution> para, but
  // renderExercise only renders <solution> when context.includeSolutions is
  // true (answer-key pages use a separate extractAnswerKey/renderAnswerKey
  // path instead), which this harness never sets — so a solution-based test
  // never exercises renderSectionContent's hoist/dispatch and can't RED. The
  // live bug (m68789 problem, e.g. fs-idm84914160) is a table nested in a
  // <problem> para, which IS always rendered — use that instead so the test
  // actually reds before the fix and greens after.
  it('renders a para-nested <table> in a problem as a real table, not raw <entry>/<row>', () => {
    const html = renderExerciseContent(
      '<exercise id="E"><problem id="P"><para id="b"><title>Lausn</title>Niðurstöður:<newline/>' +
        '<table id="T" summary="s" class="unnumbered"><tgroup cols="2">' +
        '<colspec colnum="1" colname="c1"/><colspec colnum="2" colname="c2"/>' +
        '<tbody><row><entry>x</entry><entry>y</entry></row>' +
        '<row><entry>1</entry><entry>2</entry></row></tbody>' +
        '</tgroup></table></para></problem></exercise>'
    );
    expect(html).toContain('<table id="T"');
    expect(html).toContain('<td');
    expect(html).not.toMatch(/<entry\b/);
    expect(html).not.toMatch(/<row\b/);
    expect(html).not.toMatch(/<colspec\b/);
  });
});
