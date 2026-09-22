/**
 * cnxml-parser.test.js — characterization tests for the string-based parser core
 * (Track C C0 safety net). These pin the CURRENT behavior of extractElements /
 * extractNestedElements / parseAttributes before the render→DOM migration, which
 * leans on this core. They document actual behavior — including the known
 * limitations (same-tag nesting, self-closing handling) — so a refactor that
 * changes any of it is caught.
 */

import { describe, it, expect } from 'vitest';
import {
  extractElements,
  extractNestedElements,
  parseAttributes,
  extractDocumentTitle,
  extractDocumentTitleRaw,
} from '../lib/cnxml-parser.js';

describe('parseAttributes', () => {
  it('parses a single attribute', () => {
    expect(parseAttributes('id="p1"')).toEqual({ id: 'p1' });
  });

  it('parses multiple attributes', () => {
    expect(parseAttributes('id="p1" class="intro"')).toEqual({ id: 'p1', class: 'intro' });
  });

  it('parses namespaced attribute names (colon)', () => {
    expect(parseAttributes('xml:lang="is" effect="italics"')).toEqual({
      'xml:lang': 'is',
      effect: 'italics',
    });
  });

  it('returns an empty object for an empty string', () => {
    expect(parseAttributes('')).toEqual({});
  });

  it('keeps an empty attribute value', () => {
    expect(parseAttributes('alt=""')).toEqual({ alt: '' });
  });

  it('ignores leading slash / unquoted noise', () => {
    expect(parseAttributes(' id="m1" /')).toEqual({ id: 'm1' });
  });
});

describe('extractElements', () => {
  it('extracts a single paired element with id and content', () => {
    const els = extractElements('<para id="p1">hello</para>', 'para');
    expect(els).toHaveLength(1);
    expect(els[0]).toMatchObject({ id: 'p1', content: 'hello' });
    expect(els[0].attributes).toEqual({ id: 'p1' });
    expect(els[0].fullMatch).toBe('<para id="p1">hello</para>');
  });

  it('extracts multiple sibling elements', () => {
    const els = extractElements('<para id="a">one</para><para id="b">two</para>', 'para');
    expect(els.map((e) => e.id)).toEqual(['a', 'b']);
    expect(els.map((e) => e.content)).toEqual(['one', 'two']);
  });

  it('extracts a self-closing element with empty content', () => {
    const els = extractElements('<media id="m1" src="x.png"/>', 'media');
    expect(els).toHaveLength(1);
    expect(els[0]).toMatchObject({ id: 'm1', content: '' });
    expect(els[0].attributes).toEqual({ id: 'm1', src: 'x.png' });
  });

  it('reports null id when the element has no id attribute', () => {
    const els = extractElements('<para>x</para>', 'para');
    expect(els[0].id).toBeNull();
    expect(els[0].attributes).toEqual({});
  });

  it('preserves nested DIFFERENT-tag content verbatim', () => {
    const els = extractElements('<para id="p"><emphasis>bold</emphasis> text</para>', 'para');
    expect(els[0].content).toBe('<emphasis>bold</emphasis> text');
  });

  it('does NOT handle same-tag nesting (non-greedy stops at first close)', () => {
    // Known limitation — extractNestedElements exists precisely for this case.
    const els = extractElements('<note id="outer"><note id="inner">x</note></note>', 'note');
    expect(els).toHaveLength(1);
    expect(els[0].id).toBe('outer');
    expect(els[0].content).toBe('<note id="inner">x');
    expect(els[0].fullMatch).toBe('<note id="outer"><note id="inner">x</note>');
  });

  it('returns an empty array for an unterminated element', () => {
    expect(extractElements('<para id="p1">hello', 'para')).toEqual([]);
  });

  it('returns an empty array when the tag is absent', () => {
    expect(extractElements('<para>x</para>', 'figure')).toEqual([]);
  });
});

describe('extractElements — self-closing with attributes (F1 regression)', () => {
  it('parses a leading self-closing empty entry as its own cell (3 cells, no leak)', () => {
    const row =
      '<entry align="left"/>\n<entry align="left">Reactants</entry>\n<entry align="left">Products</entry>';
    const cells = extractElements(row, 'entry');
    expect(cells.map((c) => c.content.trim())).toEqual(['', 'Reactants', 'Products']);
    expect(cells[0].attributes.align).toBe('left');
    // No raw opening tag leaked into cell content:
    expect(cells.some((c) => c.content.includes('<entry'))).toBe(false);
  });

  it('parses a bare self-closing entry followed by a paired entry', () => {
    const cells = extractElements('<entry/><entry>X</entry>', 'entry');
    expect(cells.length).toBe(2);
    expect(cells[1].content).toBe('X');
  });

  it('leaves paired entries with attributes byte-identical (no regression)', () => {
    const cells = extractElements(
      '<entry align="left">A</entry><entry namest="c1" nameend="c2">B</entry>',
      'entry'
    );
    expect(cells.length).toBe(2);
    expect(cells[0].content).toBe('A');
    expect(cells[1].attributes.namest).toBe('c1');
    expect(cells[1].attributes.nameend).toBe('c2');
  });

  it('parses two consecutive empty self-closing entries as two cells', () => {
    const cells = extractElements('<entry align="left"/><entry align="left"/>', 'entry');
    expect(cells.length).toBe(2);
    expect(cells.every((c) => c.content === '')).toBe(true);
  });
});

describe('extractNestedElements', () => {
  it('extracts a single element', () => {
    const els = extractNestedElements('<note id="n1">body</note>', 'note');
    expect(els).toHaveLength(1);
    expect(els[0]).toMatchObject({ id: 'n1', content: 'body' });
  });

  it('returns only the outermost element for depth-2 same-tag nesting', () => {
    const els = extractNestedElements('<note id="outer"><note id="inner">x</note></note>', 'note');
    expect(els).toHaveLength(1);
    expect(els[0].id).toBe('outer');
    expect(els[0].content).toBe('<note id="inner">x</note>');
  });

  it('handles depth-3 same-tag nesting, returning the outermost only', () => {
    const input = '<note id="a"><note id="b"><note id="c">deep</note></note></note>';
    const els = extractNestedElements(input, 'note');
    expect(els).toHaveLength(1);
    expect(els[0].id).toBe('a');
    expect(els[0].content).toBe('<note id="b"><note id="c">deep</note></note>');
  });

  it('extracts multiple non-nested siblings', () => {
    const els = extractNestedElements('<note id="a">one</note><note id="b">two</note>', 'note');
    expect(els.map((e) => e.id)).toEqual(['a', 'b']);
  });

  it('returns an empty array for an unterminated open tag', () => {
    expect(extractNestedElements('<note id="n">body', 'note')).toEqual([]);
  });

  it('does not match a self-closing tag (no close tag to pair)', () => {
    expect(extractNestedElements('<media id="m" />', 'media')).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('extractDocumentTitle — §C126 blocker #2', () => {
  /**
   * 🔴 THE DEFECT, AND IT SUBSTITUTES RATHER THAN DROPS. The pattern was
   * `/<document[^>]*>[\s\S]*?<title>([^<]+)<\/title>/`. `([^<]+)` is a run of
   * non-`<`, so a title containing ANY child element fails to match AT THAT
   * POSITION — and the lazy `[\s\S]*?` then walks on and returns a LATER,
   * markup-free `<title>`: a section heading, an exercise block's "Problems",
   * or the literal fallback `'Untitled'`.
   *
   * ▶ **A POPULATED SLOT HOLDING THE WRONG TEXT IS WORSE THAN AN EMPTY ONE** —
   * no coverage count can see it, because the slot is filled either way.
   * Measured 2026-09-22: organic **32 of 342 module titles carry markup, and
   * 32 of 32 returned the wrong string** (a SATURATED rate, so a category);
   * 3 of them fell through to `'Untitled'`. Chemistry is **0 of 149** and
   * structurally so — OpenStax never puts markup in a chemistry module title,
   * which is exactly why a chemistry-only corpus could not catch this.
   * m00165's real title is `sp²  Hybrid Orbitals…`; it returned
   * `"Drawing Electron-Dot and Line-Bond Structures"`.
   *
   * ⚠️ IT WAS UNTESTED. No test in this repo referenced `extractDocumentTitle`
   * before this block, which is how a saturated defect survived in a function
   * whose output reaches the rendered `<h1>`, the reader's URL slug AND the
   * paid MT wire.
   */
  const doc = (inner, rest = '') => `<document xmlns="x"><title>${inner}</title>${rest}</document>`;

  it('returns a markup-free title unchanged (control: the common case still works)', () => {
    expect(extractDocumentTitle(doc('Acids and Bases'))).toBe('Acids and Bases');
  });

  it('returns the RIGHT title when it contains markup, not a later one', () => {
    const cnxml = doc(
      '<emphasis effect="italics">sp</emphasis><sup>3</sup> Hybrid Orbitals',
      '<section id="s1"><title>Drawing Electron-Dot Structures</title></section>'
    );
    expect(extractDocumentTitle(cnxml)).toBe('sp3 Hybrid Orbitals');
  });

  it('does not fall through to a later section title — the m00165 shape', () => {
    const cnxml = doc(
      'Predicting Acid–Base Reactions from p<emphasis effect="italics">K</emphasis><sub>a</sub>',
      '<section><title>Problems</title></section>'
    );
    const got = extractDocumentTitle(cnxml);
    expect(got).toBe('Predicting Acid–Base Reactions from pKa');
    expect(got).not.toBe('Problems');
  });

  it("never returns 'Untitled' for a document that HAS a markup-bearing title", () => {
    expect(extractDocumentTitle(doc('<emphasis effect="italics">sp</emphasis><sup>3</sup>'))).toBe(
      'sp3'
    );
  });

  it("still returns 'Untitled' when there is genuinely no title (control)", () => {
    expect(extractDocumentTitle('<document xmlns="x"><content/></document>')).toBe('Untitled');
  });

  it('is not truncated by a bare `>` inside a <document> attribute (§C115)', () => {
    // Only `<` and `&` MUST be escaped in an attribute value, so a raw `>` is
    // legal there — and `<document[^>]*>` stops at the first one.
    const cnxml = '<document xmlns="x" data-note="a>b"><title>Real Title</title></document>';
    expect(extractDocumentTitle(cnxml)).toBe('Real Title');
  });

  it('ignores a <title> that appears BEFORE <document> (control for the anchor)', () => {
    expect(extractDocumentTitle('<title>Outside</title>' + doc('Inside'))).toBe('Inside');
  });
});

describe('extractDocumentTitleRaw — the markup-preserving shape', () => {
  /**
   * 🔴 TWO SHAPES, DELIBERATELY, BECAUSE THE TWO CONSUMERS WANT DIFFERENT THINGS
   * and collapsing them is how §C176 happened one file over.
   *   EXTRACT wants the RAW inner, so `extractInlineText` can turn it into the
   *     bracket markers the wire carries — the house pattern, already visible in
   *     62 committed title segments (`Steric Effects in the S[[sub:N]]2 Reaction`).
   *   RENDER wants TEXT, because it does `escapeHtml(title)` into the `<h1>`;
   *     handing it markup would publish a literal `<emphasis>` to a reader.
   * ⚠️ So `extractDocumentTitle` keeps its plain-text contract unchanged. The
   * bug being fixed is WHICH title it finds, not what it returns.
   */
  const doc = (inner) => `<document xmlns="x"><title>${inner}</title></document>`;

  it('preserves child markup verbatim', () => {
    expect(
      extractDocumentTitleRaw(doc('<emphasis effect="italics">sp</emphasis><sup>3</sup> X'))
    ).toBe('<emphasis effect="italics">sp</emphasis><sup>3</sup> X');
  });

  it('agrees with the text shape when there is no markup', () => {
    expect(extractDocumentTitleRaw(doc('Acids and Bases'))).toBe('Acids and Bases');
  });

  it("returns '' — not 'Untitled' — when there is no title, so a caller can tell them apart", () => {
    expect(extractDocumentTitleRaw('<document xmlns="x"><content/></document>')).toBe('');
  });
});
