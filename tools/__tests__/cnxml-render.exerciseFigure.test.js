/**
 * cnxml-render.exerciseFigure.test.js — R4-5: dedup a para-nested figure in
 * renderExercise (mirror renderExample's paraHandler).
 *
 * Real case: m68764 ch10 — <figure id="CNX_Chem_10_02_Needlefloa"> nested
 * inside a <para> inside a <problem>. It rendered TWICE on the compiled
 * exercises page.
 *
 * ROOT CAUSE (confirmed by reading the code, not just the brief): the second
 * render is NOT produced by renderExercise's own inner DOM seam
 * (renderBlockChildrenInOrder / renderSectionContent) — that seam only
 * hoists ['list','equation','table'] out of a para, so a nested figure is
 * never independently re-dispatched *within* renderExercise. Calling
 * renderExercise() alone (in isolation) does NOT reproduce the duplicate —
 * verified: with the unmodified code it renders the figure exactly once.
 *
 * The REAL second render comes from the top-level document walk in
 * renderCnxmlToHtml (~line 884): `extractNestedElements(contentWithoutSections,
 * 'figure')` scans the WHOLE content string for <figure> elements, including
 * ones nested inside <exercise>/<problem>/<para> — and dispatches each
 * independently via renderFigure (~line 981-982), regardless of whether an
 * enclosing <exercise> already rendered it inline. renderFigure only
 * suppresses a re-render via `context.renderedFigureIds` (~line 1069), and
 * nothing registers a para-nested figure's id when renderExercise renders it
 * inline via renderPara. renderExample already solves this for the identical
 * top-level mechanism via its paraHandler (~1431-1438), which pre-registers
 * ids into ctx.renderedFigureIds; renderExercise never got the same mirror.
 *
 * So the reproducing test goes through renderCnxmlToHtml (the same entry
 * point renderCompiledExercises uses), not a bare renderExercise() call.
 */
import { describe, it, expect } from 'vitest';
import { renderCnxmlToHtml, renderExercise, _loadBookConfigForTest } from '../cnxml-render.js';

_loadBookConfigForTest('efnafraedi-2e');

function renderExerciseContent(inner) {
  const cnxml = `<document xmlns="http://cnx.rice.edu/cnxml" xmlns:m="http://www.w3.org/1998/Math/MathML"><title>T</title><metadata xmlns:md="http://cnx.rice.edu/mdml"><md:content-id>m68764</md:content-id><md:title>T</md:title></metadata><content>${inner}</content></document>`;
  return renderCnxmlToHtml(cnxml, { moduleId: 'm68764', chapter: 10, lang: 'is' }).html;
}

const exerciseCnxml =
  '<exercise id="fs-idm82765632"><problem id="fs-idp7685184">' +
  '<para id="fs-idm164104512">Text before the figure.<newline/>' +
  '<figure id="CNX_Chem_10_02_Needlefloa" class="scaled-down">' +
  '<media id="fs-idm208311120" alt="a needle floating on water">' +
  '<image mime-type="image/jpeg" src="../../media/CNX_Chem_10_02_Needlefloa_img.jpg"/>' +
  '</media><caption>(credit: Cory Zanker)</caption>' +
  '</figure></para></problem></exercise>';

describe('renderExercise para-nested figure dedup (R4-5)', () => {
  it('renders a para-nested exercise figure exactly once through the full document walk', () => {
    const html = renderExerciseContent(exerciseCnxml);
    expect((html.match(/id="CNX_Chem_10_02_Needlefloa"/g) || []).length).toBe(1);
  });

  it('a bare renderExercise() call renders the figure inline once (unit-level sanity)', () => {
    // renderExercise's own DOM seam never double-renders in isolation — the
    // duplicate is produced by the OUTER top-level walk (see file header).
    // This pins that renderExercise itself stays correct after the fix.
    const exercise = {
      id: 'fs-idm82765632',
      content:
        '<problem id="fs-idp7685184"><para id="fs-idm164104512">Text before the figure.<newline/>' +
        '<figure id="CNX_Chem_10_02_Needlefloa" class="scaled-down">' +
        '<media id="fs-idm208311120" alt="a needle floating on water">' +
        '<image mime-type="image/jpeg" src="../../media/CNX_Chem_10_02_Needlefloa_img.jpg"/>' +
        '</media><caption>(credit: Cory Zanker)</caption>' +
        '</figure></para></problem>',
    };
    const html = renderExercise(exercise, {
      renderedFigureIds: new Set(),
      chapterExerciseNumbers: new Map(),
      exerciseCounter: 0,
      chapterFigureNumbers: new Map(),
      figureNumbers: new Map(),
      moduleId: 'm68764',
      chapter: 10,
    });
    expect((html.match(/id="CNX_Chem_10_02_Needlefloa"/g) || []).length).toBe(1);
  });
});
