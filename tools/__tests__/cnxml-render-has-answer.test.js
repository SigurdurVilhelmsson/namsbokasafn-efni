/**
 * cnxml-render-has-answer.test.js — the `data-has-answer` ground-truth signal.
 *
 * The reader (namsbokasafn-vefur `answerLinks.ts`) used to decide whether an
 * end-of-chapter exercise has an answer by NUMBER PARITY ("odd exercises have
 * answers in OpenStax"). That assumption breaks in efnafraedi-2e ch12–17 where
 * continuous cross-subsection numbering drifts answered exercises onto even
 * numbers → dead "Sjá svar" links (odd, no answer) and unreachable answers
 * (even, has answer).
 *
 * Fix: emit ground truth. `renderExercise` marks each `.eoc-exercise` with
 * `data-has-answer="true|false"` using the SAME predicate as the answer-key
 * generator (`<solution id="…">` present), so `data-has-answer="true"` iff an
 * `.answer-entry` will exist for this id. The reader keys off this, not parity.
 */

import { describe, it, expect } from 'vitest';
import { renderCnxmlToHtml, _loadBookConfigForTest } from '../cnxml-render.js';

_loadBookConfigForTest('efnafraedi-2e');

function renderExerciseContent(inner) {
  const cnxml = `<document xmlns="http://cnx.rice.edu/cnxml" xmlns:m="http://www.w3.org/1998/Math/MathML"><title>T</title><metadata xmlns:md="http://cnx.rice.edu/mdml"><md:content-id>m00001</md:content-id><md:title>T</md:title></metadata><content>${inner}</content></document>`;
  return renderCnxmlToHtml(cnxml, { moduleId: 'm00001', chapter: 3, lang: 'is' }).html;
}

/** Pull the opening <div ...> tag of the .eoc-exercise carrying data-exercise-id="ID". */
function eocTag(html, id) {
  const m = html.match(new RegExp(`<div[^>]*data-exercise-id="${id}"[^>]*>`));
  return m ? m[0] : '';
}

describe('renderExercise — data-has-answer signal', () => {
  it('marks an exercise WITH a <solution id="…"> as data-has-answer="true"', () => {
    const html = renderExerciseContent(
      '<exercise id="E1"><problem id="P1"><para id="a">Q</para></problem>' +
        '<solution id="S1"><para id="b">A</para></solution></exercise>'
    );
    expect(eocTag(html, 'E1')).toContain('data-has-answer="true"');
  });

  it('marks an exercise WITHOUT a solution as data-has-answer="false"', () => {
    const html = renderExerciseContent(
      '<exercise id="E2"><problem id="P2"><para id="a">Q only</para></problem></exercise>'
    );
    expect(eocTag(html, 'E2')).toContain('data-has-answer="false"');
  });

  it('treats a <solution> with NO id as data-has-answer="false" (matches the answer-key generator, which requires <solution id>)', () => {
    const html = renderExerciseContent(
      '<exercise id="E3"><problem id="P3"><para id="a">Q</para></problem>' +
        '<solution><para id="b">A without id</para></solution></exercise>'
    );
    expect(eocTag(html, 'E3')).toContain('data-has-answer="false"');
  });
});
