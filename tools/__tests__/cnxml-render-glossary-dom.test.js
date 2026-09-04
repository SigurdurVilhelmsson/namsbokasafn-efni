import { describe, it, expect } from 'vitest';
import { renderCnxmlToHtml, renderCompiledGlossary } from '../cnxml-render.js';

const MATH =
  '<m:math xmlns:m="http://www.w3.org/1998/Math/MathML"><m:msubsup><m:mi>E</m:mi><m:mi>k</m:mi><m:mo>°</m:mo></m:msubsup></m:math>';
function render(cnxml) {
  return renderCnxmlToHtml(cnxml, {
    lang: 'is',
    chapter: 17,
    bookSlug: 'efnafraedi-2e',
    moduleId: 'mTEST',
    moduleSections: {},
  }).html;
}

// 🔴 CORRECTED 2026-09-03 — THIS COMMENT SAID "Glossary sits inside <content> in
// real CNXML files". MEASURED: IT NEVER DOES. Across the two live books'
// READ-ONLY 01-source, 109 modules carry a <glossary> and ALL 109 place it as a
// SIBLING after </content> — 0 inside. (Counting unit: module FILE containing a
// <glossary>, over books/{efnafraedi-2e,lifraen-efnafraedi}/01-source.)
//
// ▶ The consequence is that `renderGlossary` — which renderContent reaches by
// matching against doc.rawContent, i.e. <content>'s INNER — never runs on this
// corpus. The chapter key-terms page is built by renderCompiledGlossary instead,
// and it emits <dt>, not <dfn>.
//
// ⚠️ This file therefore CHARACTERIZES A CORPUS-UNREACHABLE PATH. That is not a
// reason to delete it: the fixture below nests the glossary deliberately, a
// synthetic nested <glossary> really does reach renderGlossary, and nothing
// guarantees the corpus stays this way. Do not "tidy" renderGlossary away, and do
// not assume it is dead code — assume it is unexercised.
function makeDoc(glossaryInner) {
  return (
    '<document xmlns="http://cnx.rice.edu/cnxml"><content>' +
    '<glossary>' +
    glossaryInner +
    '</glossary>' +
    '</content></document>'
  );
}

describe('renderGlossary — inline math in definitions', () => {
  it('renders math embedded in a <term> (was dropped)', () => {
    const html = render(
      makeDoc(
        `<definition id="d1"><term>staðalkerspenna (${MATH})</term>` +
          '<meaning id="me1">Spennan við staðalskilyrði.</meaning></definition>'
      )
    );
    expect(html).toContain('<mjx-container');
    expect(html).toContain('staðalkerspenna');
  });

  it('renders math embedded in a <meaning> (ch21 case)', () => {
    const html = render(
      makeDoc(
        '<definition id="d2"><term>jáeind</term>' +
          `<meaning id="me2">Ögn táknuð ${MATH} sem ...</meaning></definition>`
      )
    );
    expect(html.split('<mjx-container').length - 1).toBeGreaterThanOrEqual(1);
  });

  it('a plain text-only definition still renders (no regression)', () => {
    const html = render(
      makeDoc(
        '<definition id="d3"><term>hvati</term><meaning id="me3">Efni sem flýtir efnahvarfi.</meaning></definition>'
      )
    );
    expect(html).toContain('hvati');
    expect(html).toContain('Efni sem flýtir');
  });
});

// Compiled key-terms path: collectChapterGlossary → renderCompiledGlossary
// Tests exercise renderCompiledGlossary directly (the real path for ch16/17).
describe('renderCompiledGlossary — inline math in term (compiled key-terms path)', () => {
  const MATH_TERM = `staðalkerspenna (${MATH})`;

  function makeContext() {
    return {
      chapter: 17,
      figures: {},
      tables: {},
      examples: {},
      terms: {},
      footnotes: [],
      equationTextDictionary: null,
    };
  }

  it('renders math embedded in a term (was escaped as plain text)', () => {
    const defs = [
      {
        id: 'd1',
        term: 'staðalkerspenna', // plain-text key (sort / termsMap)
        termContent: MATH_TERM, // raw inner HTML with <m:math>
        meaningContent: 'Spennan við staðalskilyrði.',
        moduleId: 'mTEST',
      },
    ];
    const html = renderCompiledGlossary(17, defs, makeContext());
    expect(html).toContain('<mjx-container');
    expect(html).toContain('staðalkerspenna');
  });

  it('plain-text term still renders correctly (no regression)', () => {
    const defs = [
      {
        id: 'd2',
        term: 'hvati',
        termContent: 'hvati',
        meaningContent: 'Efni sem flýtir efnahvarfi.',
        moduleId: 'mTEST',
      },
    ];
    const html = renderCompiledGlossary(17, defs, makeContext());
    expect(html).toContain('hvati');
    expect(html).toContain('Efni sem flýtir');
  });
});
