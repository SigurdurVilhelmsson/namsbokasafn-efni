/**
 * cnxml-parser.test.js — characterization tests for the string-based parser core
 * (Track C C0 safety net). These pin the CURRENT behavior of extractElements /
 * extractNestedElements / parseAttributes before the render→DOM migration, which
 * leans on this core. They document actual behavior — including the known
 * limitations (same-tag nesting, self-closing handling) — so a refactor that
 * changes any of it is caught.
 */

import { describe, it, expect } from 'vitest';
import { extractElements, extractNestedElements, parseAttributes } from '../lib/cnxml-parser.js';

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
