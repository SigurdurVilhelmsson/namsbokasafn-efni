/**
 * cnxml-render-cyl-source-keyed.test.js — H3 item 1: the heading after each
 * worked example renders as the house value, keyed on the READ-ONLY SOURCE.
 *
 * Ruling: docs/decisions/2026-11-08-h3-four-form-rulings-chemistry.md. The
 * September MT renders the 292 English "Check Your Learning" headings in 16
 * forms. The renderer already looked para-titles up in TITLE_TRANSLATIONS, but
 * it looked up the TRANSLATED title, while the house value is keyed on the
 * English, so it never matched. The fix looks up the source title by para id.
 *
 * Every render here passes the book config per call (options.bookConfig), the
 * way the server's renderModule() does, and never calls _loadBookConfigForTest:
 * module globals are per test file, so this file starts with an EMPTY title
 * map, exactly as the server does. That is what makes the bookConfig leg of
 * the fix observable.
 */

import { describe, it, expect } from 'vitest';
import { renderCnxmlToHtml, sourceParaTitles } from '../cnxml-render.js';
import { getBookRenderConfig } from '../lib/book-rendering-config.js';

const HOUSE = 'Prófaðu þekkingu þína';

const doc = (inner) =>
  `<document xmlns="http://cnx.rice.edu/cnxml" xmlns:m="http://www.w3.org/1998/Math/MathML"><title>T</title><metadata xmlns:md="http://cnx.rice.edu/mdml"><md:content-id>m00001</md:content-id><md:title>T</md:title></metadata><content>${inner}</content></document>`;

// The English source, as OpenStax ships it (both typo'd spellings occur in
// chemistry's source: m68759 "Check your Learning", m68805 "Check Your Learning.").
const SOURCE = doc(
  '<example id="E">' +
    '<para id="p1"><title>An Example Title</title>Text.</para>' +
    '<para id="p2"><title>Solution</title>Answer.</para>' +
    '<para id="fs-cyl"><title>Check Your Learning</title>Question?</para>' +
    '<para id="fs-cyl-lc"><title>Check your Learning</title>Question 2?</para>' +
    '<para id="fs-cyl-dot"><title>Check Your Learning.</title>Question 3?</para>' +
    '<para id="fs-other"><title>Think About It</title>Question 4?</para>' +
    '</example>'
);

// The same module after MT and inject: ids kept, titles translated (and varied).
const TRANSLATED = doc(
  '<example id="E">' +
    '<para id="p1"><title>Dæmatitill</title>Texti.</para>' +
    '<para id="p2"><title>Úrlausn</title>Svar.</para>' +
    '<para id="fs-cyl"><title>Kannaðu þekkingu þína</title>Spurning?</para>' +
    '<para id="fs-cyl-lc"><title>Spyrðu þig</title>Spurning 2?</para>' +
    '<para id="fs-cyl-dot"><title>Kannaðu þekkingu þína.</title>Spurning 3?</para>' +
    '<para id="fs-other"><title>Kannaðu þekkingu þína</title>Spurning 4?</para>' +
    '</example>'
);

const render = (extra = {}) =>
  renderCnxmlToHtml(TRANSLATED, {
    moduleId: 'm00001',
    chapter: 3,
    lang: 'is',
    bookConfig: getBookRenderConfig('efnafraedi-2e'),
    ...extra,
  }).html;

/** The para-title rendered for the para with this id (it sits right before the para's `<p id>`). */
const titleAt = (html, id) => {
  const m = html.match(
    new RegExp(`<p class="para-title"><strong>([^<]*)</strong></p>\\s*<p id="${id}"`)
  );
  return m ? m[1] : null;
};

describe('sourceParaTitles', () => {
  it('maps each para id to the title that leads it', () => {
    const titles = sourceParaTitles(SOURCE);
    expect(titles.get('fs-cyl')).toBe('Check Your Learning');
  });

  it('skips a para whose title is not its first child', () => {
    const titles = sourceParaTitles(
      doc('<para id="x">Lead text <title>Not leading</title></para>')
    );
    expect(titles.has('x')).toBe(false);
  });

  it('reads the id past a raw > in an earlier attribute value', () => {
    const titles = sourceParaTitles(
      doc('<para class="a > b" id="y"><title>Check Your Learning</title>Q</para>')
    );
    expect(titles.get('y')).toBe('Check Your Learning');
  });
});

describe('worked-example "Check Your Learning" heading (H3 item 1)', () => {
  it('renders the house value where the source title is "Check Your Learning"', () => {
    expect(titleAt(render({ sourceCnxml: SOURCE }), 'fs-cyl')).toBe(HOUSE);
  });

  it('renders it for the source spelling "Check your Learning"', () => {
    expect(titleAt(render({ sourceCnxml: SOURCE }), 'fs-cyl-lc')).toBe(HOUSE);
  });

  it('renders it for the source spelling "Check Your Learning."', () => {
    expect(titleAt(render({ sourceCnxml: SOURCE }), 'fs-cyl-dot')).toBe(HOUSE);
  });

  it('leaves a "Solution" heading as translated', () => {
    expect(titleAt(render({ sourceCnxml: SOURCE }), 'p2')).toBe('Úrlausn');
  });

  it('keys on the source, not the translated text: another source title keeps its MT heading', () => {
    expect(titleAt(render({ sourceCnxml: SOURCE }), 'fs-other')).toBe('Kannaðu þekkingu þína');
  });

  it('keeps the translated heading when no source is given', () => {
    expect(titleAt(render(), 'fs-cyl')).toBe('Kannaðu þekkingu þína');
  });
});
