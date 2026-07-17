/**
 * cnxml-render-item10-hardenings.test.js — item 10: P0-3 (null-info outline
 * entry excluded, not thrown), P0-4 (roman number-styles), P0-5 (emphasis
 * classes preserved verbatim, not just emphasis-one).
 */

import { describe, it, expect } from 'vitest';
import {
  renderCnxmlToHtml,
  filterOutlineEntries,
  _loadBookConfigForTest,
} from '../cnxml-render.js';
import { escapeAttr } from '../lib/cnxml-elements.js';

_loadBookConfigForTest('efnafraedi-2e');

function doc(inner) {
  return (
    '<document xmlns="http://cnx.rice.edu/cnxml"><title>T</title><content>' +
    inner +
    '</content></document>'
  );
}
const render = (inner) =>
  renderCnxmlToHtml(doc(inner), { lang: 'is', chapter: 3, moduleId: 'mT', moduleSections: {} })
    .html;

describe('P0-3 — filterOutlineEntries', () => {
  it('excludes a null-info entry instead of throwing', () => {
    expect(
      filterOutlineEntries({ a: { section: '1' }, broken: null, _meta: { section: 'x' } })
    ).toEqual([['a', { section: '1' }]]);
  });
});

describe('P0-4 — roman number-styles', () => {
  it('lower-roman enumerated list emits list-style-type: lower-roman', () => {
    const html = render(
      '<list id="l1" list-type="enumerated" number-style="lower-roman"><item>a</item></list>'
    );
    expect(html).toContain('list-style-type: lower-roman');
  });
  it('upper-roman emits upper-roman', () => {
    const html = render(
      '<list id="l1" list-type="enumerated" number-style="upper-roman"><item>a</item></list>'
    );
    expect(html).toContain('list-style-type: upper-roman');
  });
  it('equivalence pin: lower-alpha unchanged', () => {
    const html = render(
      '<list id="l1" list-type="enumerated" number-style="lower-alpha"><item>a</item></list>'
    );
    expect(html).toContain('list-style-type: lower-alpha');
  });
});

describe('P0-5 — emphasis class preservation', () => {
  it('effect-less emphasis keeps an arbitrary class', () => {
    const html = render('<para id="p1"><emphasis class="centered-text">c</emphasis></para>');
    expect(html).toContain('<em class="centered-text">c</em>');
  });
  it('bold emphasis keeps a multi-class attribute verbatim', () => {
    const html = render('<para id="p1"><emphasis effect="bold" class="a b-c">t</emphasis></para>');
    expect(html).toContain('<strong class="a b-c">t</strong>');
  });
  it('equivalence pin: emphasis-one still carried', () => {
    const html = render('<para id="p1"><emphasis class="emphasis-one">t</emphasis></para>');
    expect(html).toContain('<em class="emphasis-one">t</em>');
  });
  it('class attr value is escaped', () => {
    const html = render('<para id="p1"><emphasis class="a&quot;b">t</emphasis></para>');
    expect(html).toContain('<em class="a&amp;quot;b">t</em>');
  });
});

describe('escapeAttr unit test', () => {
  it('escapeAttr escapes a literal double-quote (the branch the pipeline cannot reach)', () => {
    expect(escapeAttr('a"b')).toBe('a&quot;b');
  });
});
