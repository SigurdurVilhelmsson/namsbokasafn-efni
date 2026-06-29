/**
 * cnxml-render-table-attrs.test.js — attributed <thead>/<tbody> recovery (C4-adjacent).
 *
 * renderTable matched the BARE tags `/<thead>/` and `/<tbody>/`. OpenStax CNXML
 * frequently carries attributes (`<thead valign="middle">`, `<tbody valign="middle">`),
 * so those tables matched NOTHING and rendered as an empty <table> + caption —
 * silently dropping every cell (text AND equations). Confirmed live on
 * namsbokasafn.is (e.g. efnafraedi-2e Tafla 21.1, m68856). Allowing attributes
 * (`/<thead[^>]*>/`, `/<tbody[^>]*>/`) recovers the cells; bare-tag tables are
 * byte-identical (the capture group is unchanged).
 */

import { describe, it, expect } from 'vitest';
import { renderCnxmlToHtml, _loadBookConfigForTest } from '../cnxml-render.js';

_loadBookConfigForTest('efnafraedi-2e');

function renderTableContent(inner) {
  const cnxml = `<document xmlns="http://cnx.rice.edu/cnxml" xmlns:m="http://www.w3.org/1998/Math/MathML"><title>T</title><metadata xmlns:md="http://cnx.rice.edu/mdml"><md:content-id>m00001</md:content-id><md:title>T</md:title></metadata><content>${inner}</content></document>`;
  return renderCnxmlToHtml(cnxml, { moduleId: 'm00001', chapter: 3, lang: 'is' }).html;
}

const ATTRIBUTED = `<table id="T"><tgroup cols="2">
  <thead valign="middle"><row><entry>Haus</entry><entry>Jafna</entry></row></thead>
  <tbody valign="middle"><row><entry>Lína</entry><entry><m:math><m:mi>CELLMATH</m:mi></m:math></entry></row></tbody>
</tgroup></table>`;

const BARE = `<table id="T"><tgroup cols="2">
  <thead><row><entry>Haus</entry><entry>B</entry></row></thead>
  <tbody><row><entry>Lína</entry><entry>C</entry></row></tbody>
</tgroup></table>`;

describe('renderTable — attributed <thead>/<tbody> (recovers dropped cells)', () => {
  it('renders header and body cells when thead/tbody carry attributes', () => {
    const html = renderTableContent(ATTRIBUTED);
    expect(html).toContain('<th'); // header cell present
    expect(html).toContain('<td'); // body cell present
    expect(html).toContain('Haus'); // header text
    expect(html).toContain('Lína'); // body text
    // the cell equation renders (subsumed by the body recovery — it reaches
    // processInlineContent once the tbody matches)
    expect(html).toContain('<mjx-container');
  });
});

describe('renderTable — bare <thead>/<tbody> (regression guard)', () => {
  it('still renders cells for bare tags', () => {
    const html = renderTableContent(BARE);
    expect((html.match(/<th\b/g) || []).length).toBe(2);
    expect((html.match(/<td\b/g) || []).length).toBe(2);
  });
});
