import { describe, it, expect } from 'vitest';
import {
  parseCnxmlFragment,
  serializeCnxmlFragment,
  replaceParaContent,
  replaceListItems,
  removeElementsByTag,
  insertCnxmlBefore,
} from '../lib/cnxml-dom.js';

// ─── parseCnxmlFragment ──────────────────────────────────────────

describe('parseCnxmlFragment', () => {
  it('parses simple para, getElementById works via getElementsByTagName', () => {
    const { root } = parseCnxmlFragment('<para id="p1">Hello world</para>');
    const paras = root.getElementsByTagName('para');
    expect(paras.length).toBe(1);
    expect(paras[0].getAttribute('id')).toBe('p1');
  });

  it('parses MathML namespace, m:math elements found', () => {
    const { root } = parseCnxmlFragment(
      '<para id="p1">H<sub>2</sub>O is <m:math><m:mi>x</m:mi></m:math></para>'
    );
    const maths = root.getElementsByTagNameNS('http://www.w3.org/1998/Math/MathML', 'math');
    expect(maths.length).toBe(1);
    expect(maths[0].localName).toBe('math');
  });

  it('parses multiple elements, all accessible', () => {
    const { root } = parseCnxmlFragment(
      '<para id="p1">First</para><para id="p2">Second</para><figure id="f1"/>'
    );
    const paras = root.getElementsByTagName('para');
    expect(paras.length).toBe(2);
    expect(paras[0].getAttribute('id')).toBe('p1');
    expect(paras[1].getAttribute('id')).toBe('p2');
    const figs = root.getElementsByTagName('figure');
    expect(figs.length).toBe(1);
  });

  it('returns doc and root element', () => {
    const { doc, root } = parseCnxmlFragment('<para id="p1">test</para>');
    expect(doc).toBeDefined();
    expect(root).toBeDefined();
    expect(root.tagName).toBe('root');
    expect(doc.documentElement).toBe(root);
  });
});

// ─── serializeCnxmlFragment ──────────────────────────────────────

describe('serializeCnxmlFragment', () => {
  it('produces clean output without xmlns declarations', () => {
    const { root } = parseCnxmlFragment('<para id="p1">Hello</para>');
    const para = root.getElementsByTagName('para')[0];
    const result = serializeCnxmlFragment(para);
    expect(result).not.toContain('xmlns=');
    expect(result).not.toContain('xmlns:m=');
    expect(result).toContain('<para id="p1">Hello</para>');
  });

  it('preserves attributes (id, effect, class)', () => {
    const { root } = parseCnxmlFragment('<emphasis effect="italics" id="em1">hello</emphasis>');
    const em = root.getElementsByTagName('emphasis')[0];
    const result = serializeCnxmlFragment(em);
    expect(result).toContain('effect="italics"');
    expect(result).toContain('id="em1"');
    expect(result).toContain('>hello</emphasis>');
  });

  it('preserves self-closing elements (newline, space)', () => {
    const { root } = parseCnxmlFragment(
      '<para id="p1">Hello<newline/>world<space count="3"/></para>'
    );
    const para = root.getElementsByTagName('para')[0];
    const result = serializeCnxmlFragment(para);
    expect(result).toContain('<newline/>');
    expect(result).toContain('<space count="3"/>');
  });

  it('preserves MathML content with m: prefix', () => {
    const { root } = parseCnxmlFragment(
      '<para id="p1">E = <m:math><m:mi>m</m:mi><m:msup><m:mi>c</m:mi><m:mn>2</m:mn></m:msup></m:math></para>'
    );
    const para = root.getElementsByTagName('para')[0];
    const result = serializeCnxmlFragment(para);
    expect(result).toContain('<m:math>');
    expect(result).toContain('<m:mi>m</m:mi>');
    expect(result).toContain('<m:msup>');
    // Should not have MathML xmlns re-declared on m:math
    expect(result).not.toContain('xmlns:m=');
  });

  it('preserves nested element structure', () => {
    const { root } = parseCnxmlFragment(
      '<para id="p1"><emphasis effect="bold">Important: </emphasis>text <sub>2</sub></para>'
    );
    const para = root.getElementsByTagName('para')[0];
    const result = serializeCnxmlFragment(para);
    expect(result).toBe(
      '<para id="p1"><emphasis effect="bold">Important: </emphasis>text <sub>2</sub></para>'
    );
  });
});

// ─── replaceParaContent ──────────────────────────────────────────

describe('replaceParaContent', () => {
  it('replaces simple para text entirely', () => {
    const { doc, root } = parseCnxmlFragment('<para id="p1">Original text here.</para>');
    const para = root.getElementsByTagName('para')[0];
    replaceParaContent(doc, para, 'Upprunalegur texti her.');
    const result = serializeCnxmlFragment(para);
    expect(result).toBe('<para id="p1">Upprunalegur texti her.</para>');
  });

  it('removes emphasis and inserts translated text with new emphasis', () => {
    const { doc, root } = parseCnxmlFragment(
      '<para id="p1">This is <emphasis effect="bold">important</emphasis> text.</para>'
    );
    const para = root.getElementsByTagName('para')[0];
    replaceParaContent(doc, para, 'Þetta er <emphasis effect="bold">mikilvægur</emphasis> texti.');
    const result = serializeCnxmlFragment(para);
    expect(result).toBe(
      '<para id="p1">Þetta er <emphasis effect="bold">mikilvægur</emphasis> texti.</para>'
    );
  });

  it('preserves nested list, removes text+emphasis, inserts translation before list', () => {
    const { doc, root } = parseCnxmlFragment(
      '<para id="p1">Introduction <emphasis effect="italics">text</emphasis>:' +
        '<list id="l1"><item>a</item><item>b</item></list></para>'
    );
    const para = root.getElementsByTagName('para')[0];
    replaceParaContent(doc, para, 'Inngangur:');
    const result = serializeCnxmlFragment(para);
    expect(result).toContain('Inngangur:');
    expect(result).toContain('<list id="l1">');
    expect(result).toContain('<item>a</item>');
    // Translation should come before the list
    expect(result.indexOf('Inngangur:')).toBeLessThan(result.indexOf('<list'));
  });

  it('preserves nested list + equation, inserts translation before both', () => {
    const { doc, root } = parseCnxmlFragment(
      '<para id="p1">Some text here.' +
        '<list id="l1"><item>x</item></list>' +
        '<equation id="eq1"><m:math><m:mi>x</m:mi></m:math></equation></para>'
    );
    const para = root.getElementsByTagName('para')[0];
    replaceParaContent(doc, para, 'Einhver texti.');
    const result = serializeCnxmlFragment(para);
    expect(result).toContain('Einhver texti.');
    expect(result).toContain('<list id="l1">');
    expect(result).toContain('<equation id="eq1">');
    const textPos = result.indexOf('Einhver texti.');
    const listPos = result.indexOf('<list');
    const eqPos = result.indexOf('<equation');
    expect(textPos).toBeLessThan(listPos);
    expect(listPos).toBeLessThan(eqPos);
  });

  it('removes title and text, inserts new title + translation, preserves list', () => {
    const { doc, root } = parseCnxmlFragment(
      '<para id="p1"><title>Original Title</title>Some content here.' +
        '<list id="l1"><item>item1</item></list></para>'
    );
    const para = root.getElementsByTagName('para')[0];
    replaceParaContent(doc, para, 'Nýr texti.', '<title>Nýr Titill</title>');
    const result = serializeCnxmlFragment(para);
    expect(result).toContain('<title>Nýr Titill</title>');
    expect(result).toContain('Nýr texti.');
    expect(result).toContain('<list id="l1">');
    expect(result).not.toContain('Original Title');
    expect(result).not.toContain('Some content');
    // Title should come first, then text, then list
    const titlePos = result.indexOf('<title>Nýr Titill</title>');
    const textPos = result.indexOf('Nýr texti.');
    const listPos = result.indexOf('<list');
    expect(titlePos).toBeLessThan(textPos);
    expect(textPos).toBeLessThan(listPos);
  });

  it('handles para with only block children — inserts translation before first block', () => {
    const { doc, root } = parseCnxmlFragment(
      '<para id="p1"><list id="l1"><item>a</item></list>' +
        '<figure id="f1"><media id="m1"><image src="img.png"/></media></figure></para>'
    );
    const para = root.getElementsByTagName('para')[0];
    replaceParaContent(doc, para, 'Nýr texti.');
    const result = serializeCnxmlFragment(para);
    expect(result).toContain('Nýr texti.');
    expect(result).toContain('<list id="l1">');
    expect(result).toContain('<figure id="f1">');
    expect(result.indexOf('Nýr texti.')).toBeLessThan(result.indexOf('<list'));
  });

  it('empty translation: removes inline content, block children remain', () => {
    const { doc, root } = parseCnxmlFragment(
      '<para id="p1">Text to remove.<list id="l1"><item>keep</item></list></para>'
    );
    const para = root.getElementsByTagName('para')[0];
    replaceParaContent(doc, para, '');
    const result = serializeCnxmlFragment(para);
    expect(result).not.toContain('Text to remove');
    expect(result).toContain('<list id="l1">');
    expect(result).toContain('<item>keep</item>');
  });

  it('translated CNXML with emphasis, sub, sup, m:math all parsed correctly', () => {
    const { doc, root } = parseCnxmlFragment('<para id="p1">Old text.</para>');
    const para = root.getElementsByTagName('para')[0];
    replaceParaContent(
      doc,
      para,
      'Vatn er H<sub>2</sub>O og <emphasis effect="italics">mikilvægt</emphasis> efni' +
        ' með Ca<sup>2+</sup> og <m:math><m:mi>x</m:mi></m:math>.'
    );
    const result = serializeCnxmlFragment(para);
    expect(result).toContain('<sub>2</sub>');
    expect(result).toContain('<sup>2+</sup>');
    expect(result).toContain('<emphasis effect="italics">mikilvægt</emphasis>');
    expect(result).toContain('<m:math><m:mi>x</m:mi></m:math>');
    expect(result).not.toContain('Old text');
  });

  it('malformed translated CNXML falls back to text node', () => {
    const { doc, root } = parseCnxmlFragment('<para id="p1">Old text.</para>');
    const para = root.getElementsByTagName('para')[0];
    // Truly broken XML (invalid tag syntax) triggers xmldom error handler
    // Note: xmldom is tolerant of unclosed tags (auto-closes them), so we need
    // genuinely invalid syntax like bare angle brackets to trigger the fallback
    replaceParaContent(doc, para, '<>broken stuff</>');
    const result = serializeCnxmlFragment(para);
    // The fallback inserts the raw string as a text node, which gets XML-escaped
    expect(result).toContain('&lt;&gt;broken stuff&lt;/&gt;');
    expect(result).not.toContain('Old text');
  });

  it('preserves note block element inside para', () => {
    const { doc, root } = parseCnxmlFragment(
      '<para id="p1">Intro text.<note id="n1">Note content</note></para>'
    );
    const para = root.getElementsByTagName('para')[0];
    replaceParaContent(doc, para, 'Inngangur.');
    const result = serializeCnxmlFragment(para);
    expect(result).toContain('Inngangur.');
    expect(result).toContain('<note id="n1">Note content</note>');
    expect(result).not.toContain('Intro text');
  });

  it('removes inline m:math (not wrapped in equation) as inline content', () => {
    const { doc, root } = parseCnxmlFragment(
      '<para id="p1">The formula <m:math><m:mi>E</m:mi></m:math> is important.</para>'
    );
    const para = root.getElementsByTagName('para')[0];
    replaceParaContent(doc, para, 'Formúlan <m:math><m:mi>E</m:mi></m:math> er mikilvæg.');
    const result = serializeCnxmlFragment(para);
    expect(result).toContain('Formúlan');
    expect(result).toContain('<m:math><m:mi>E</m:mi></m:math>');
    expect(result).not.toContain('The formula');
    expect(result).not.toContain('is important');
  });

  it('preserves media block element inside para', () => {
    const { doc, root } = parseCnxmlFragment(
      '<para id="p1">Caption text.' +
        '<media id="m1" alt="photo"><image src="photo.jpg" mime-type="image/jpeg"/></media></para>'
    );
    const para = root.getElementsByTagName('para')[0];
    replaceParaContent(doc, para, 'Myndatexti.');
    const result = serializeCnxmlFragment(para);
    expect(result).toContain('Myndatexti.');
    expect(result).toContain('<media id="m1"');
    expect(result).toContain('<image src="photo.jpg"');
    expect(result).not.toContain('Caption text');
  });
});

// ─── replaceListItems ────────────────────────────────────────────

describe('replaceListItems', () => {
  it('replaces items positionally with translated text', () => {
    const { doc, root } = parseCnxmlFragment(
      '<list id="l1"><item>apple</item><item>banana</item><item>cherry</item></list>'
    );
    const list = root.getElementsByTagName('list')[0];
    const items = [{ segmentId: 's1' }, { segmentId: 's2' }, { segmentId: 's3' }];
    const getSeg = (id) => {
      const map = { s1: 'epli', s2: 'banani', s3: 'kirsuber' };
      return map[id] || null;
    };
    replaceListItems(doc, list, items, getSeg);
    const result = serializeCnxmlFragment(list);
    expect(result).toContain('<item>epli</item>');
    expect(result).toContain('<item>banani</item>');
    expect(result).toContain('<item>kirsuber</item>');
    expect(result).not.toContain('apple');
    expect(result).not.toContain('banana');
    expect(result).not.toContain('cherry');
  });

  it('keeps extra items unchanged when more items than translations', () => {
    const { doc, root } = parseCnxmlFragment(
      '<list id="l1"><item>first</item><item>second</item><item>third</item></list>'
    );
    const list = root.getElementsByTagName('list')[0];
    const items = [{ segmentId: 's1' }]; // Only one in structure
    const getSeg = (id) => (id === 's1' ? 'fyrsta' : null);
    replaceListItems(doc, list, items, getSeg);
    const result = serializeCnxmlFragment(list);
    expect(result).toContain('<item>fyrsta</item>');
    // Remaining items kept as-is
    expect(result).toContain('<item>second</item>');
    expect(result).toContain('<item>third</item>');
  });

  it('preserves nested block structures inside items', () => {
    const { doc, root } = parseCnxmlFragment(
      '<list id="l1"><item>Text here.<list id="l2"><item>nested</item></list></item></list>'
    );
    const list = root.getElementsByTagName('list')[0];
    const items = [{ segmentId: 's1' }];
    const getSeg = (id) => (id === 's1' ? 'Texti her.' : null);
    replaceListItems(doc, list, items, getSeg);
    const result = serializeCnxmlFragment(list);
    expect(result).toContain('Texti her.');
    expect(result).toContain('<list id="l2">');
    expect(result).toContain('<item>nested</item>');
    expect(result).not.toContain('Text here.');
  });

  it('restores item id attribute from structure', () => {
    const { doc, root } = parseCnxmlFragment('<list id="l1"><item>first item</item></list>');
    const list = root.getElementsByTagName('list')[0];
    const items = [{ segmentId: 's1', id: 'item-001' }];
    const getSeg = (id) => (id === 's1' ? 'fyrsta atriði' : null);
    replaceListItems(doc, list, items, getSeg);
    const result = serializeCnxmlFragment(list);
    expect(result).toContain('id="item-001"');
    expect(result).toContain('fyrsta atriði');
  });

  it('does not overwrite existing item id', () => {
    const { doc, root } = parseCnxmlFragment(
      '<list id="l1"><item id="existing-id">text</item></list>'
    );
    const list = root.getElementsByTagName('list')[0];
    const items = [{ segmentId: 's1', id: 'new-id' }];
    const getSeg = (id) => (id === 's1' ? 'texti' : null);
    replaceListItems(doc, list, items, getSeg);
    const result = serializeCnxmlFragment(list);
    // Existing id should be preserved, not replaced
    expect(result).toContain('id="existing-id"');
  });

  it('skips items without segmentId', () => {
    const { doc, root } = parseCnxmlFragment(
      '<list id="l1"><item>keep this</item><item>replace this</item></list>'
    );
    const list = root.getElementsByTagName('list')[0];
    const items = [
      { id: 'i1' }, // No segmentId — skip
      { segmentId: 's2' },
    ];
    const getSeg = (id) => (id === 's2' ? 'skipt um' : null);
    replaceListItems(doc, list, items, getSeg);
    const result = serializeCnxmlFragment(list);
    expect(result).toContain('keep this');
    expect(result).toContain('skipt um');
    expect(result).not.toContain('replace this');
  });

  it('handles item with CNXML markup in translation', () => {
    const { doc, root } = parseCnxmlFragment('<list id="l1"><item>original</item></list>');
    const list = root.getElementsByTagName('list')[0];
    const items = [{ segmentId: 's1' }];
    const getSeg = (id) =>
      id === 's1' ? '<emphasis effect="bold">feitletrað</emphasis> texti' : null;
    replaceListItems(doc, list, items, getSeg);
    const result = serializeCnxmlFragment(list);
    expect(result).toContain('<emphasis effect="bold">feitletrað</emphasis>');
    expect(result).toContain('texti');
    expect(result).not.toContain('original');
  });

  it('skips item when getSeg returns null', () => {
    const { doc, root } = parseCnxmlFragment('<list id="l1"><item>keep me</item></list>');
    const list = root.getElementsByTagName('list')[0];
    const items = [{ segmentId: 'missing' }];
    const getSeg = () => null;
    replaceListItems(doc, list, items, getSeg);
    const result = serializeCnxmlFragment(list);
    expect(result).toContain('keep me');
  });
});

// ─── removeElementsByTag ─────────────────────────────────────────

describe('removeElementsByTag', () => {
  it('removes figure elements', () => {
    const { root } = parseCnxmlFragment(
      '<para id="p1">Text<figure id="f1"><media id="m1"><image src="a.png"/></media></figure>more</para>'
    );
    const para = root.getElementsByTagName('para')[0];
    removeElementsByTag(para, ['figure']);
    const result = serializeCnxmlFragment(para);
    expect(result).not.toContain('<figure');
    expect(result).not.toContain('<media');
    expect(result).not.toContain('<image');
    expect(result).toContain('Text');
    expect(result).toContain('more');
  });

  it('removes deeply nested targets', () => {
    const { root } = parseCnxmlFragment(
      '<section id="s1"><para id="p1"><list id="l1"><item>' +
        '<figure id="f1"><media id="m1"><image src="a.png"/></media></figure>' +
        '</item></list></para></section>'
    );
    const section = root.getElementsByTagName('section')[0];
    removeElementsByTag(section, ['figure']);
    const result = serializeCnxmlFragment(section);
    expect(result).not.toContain('<figure');
    expect(result).toContain('<list id="l1">');
    expect(result).toContain('<para id="p1">');
  });

  it('does not remove non-matching elements', () => {
    const { root } = parseCnxmlFragment(
      '<para id="p1"><emphasis>keep</emphasis><figure id="f1"/></para>'
    );
    const para = root.getElementsByTagName('para')[0];
    removeElementsByTag(para, ['figure']);
    const result = serializeCnxmlFragment(para);
    expect(result).toContain('<emphasis>keep</emphasis>');
    expect(result).not.toContain('<figure');
  });

  it('handles multiple tag names', () => {
    const { root } = parseCnxmlFragment(
      '<para id="p1">Text' +
        '<figure id="f1"><media id="m1"><image src="a.png"/></media></figure>' +
        '<table id="t1"><tgroup><tbody><row><entry>cell</entry></row></tbody></tgroup></table>' +
        '<equation id="eq1"><m:math><m:mi>x</m:mi></m:math></equation>' +
        ' end</para>'
    );
    const para = root.getElementsByTagName('para')[0];
    removeElementsByTag(para, ['figure', 'table', 'equation']);
    const result = serializeCnxmlFragment(para);
    expect(result).not.toContain('<figure');
    expect(result).not.toContain('<table');
    expect(result).not.toContain('<equation');
    expect(result).toContain('Text');
    expect(result).toContain(' end');
  });

  it('handles no matching elements gracefully', () => {
    const { root } = parseCnxmlFragment('<para id="p1"><emphasis>text</emphasis></para>');
    const para = root.getElementsByTagName('para')[0];
    removeElementsByTag(para, ['figure', 'table']);
    const result = serializeCnxmlFragment(para);
    expect(result).toBe('<para id="p1"><emphasis>text</emphasis></para>');
  });

  it('removes multiple instances of the same tag', () => {
    const { root } = parseCnxmlFragment(
      '<para id="p1">' +
        '<figure id="f1"><media id="m1"><image src="a.png"/></media></figure>' +
        'between' +
        '<figure id="f2"><media id="m2"><image src="b.png"/></media></figure>' +
        '</para>'
    );
    const para = root.getElementsByTagName('para')[0];
    removeElementsByTag(para, ['figure']);
    const result = serializeCnxmlFragment(para);
    expect(result).not.toContain('<figure');
    expect(result).toContain('between');
    // Verify both figures are gone
    const figCount = (result.match(/<figure/g) || []).length;
    expect(figCount).toBe(0);
  });
});

// ─── insertCnxmlBefore ───────────────────────────────────────────

describe('insertCnxmlBefore', () => {
  it('inserts parsed CNXML nodes before reference node', () => {
    const { doc, root } = parseCnxmlFragment(
      '<para id="p1"><list id="l1"><item>a</item></list></para>'
    );
    const para = root.getElementsByTagName('para')[0];
    const list = root.getElementsByTagName('list')[0];
    insertCnxmlBefore(doc, para, 'Before the list.', list);
    const result = serializeCnxmlFragment(para);
    expect(result).toContain('Before the list.');
    expect(result.indexOf('Before the list.')).toBeLessThan(result.indexOf('<list'));
  });

  it('appends when refNode is null', () => {
    const { doc, root } = parseCnxmlFragment('<para id="p1">Existing.</para>');
    const para = root.getElementsByTagName('para')[0];
    insertCnxmlBefore(doc, para, '<emphasis>appended</emphasis>', null);
    const result = serializeCnxmlFragment(para);
    expect(result).toContain('Existing.');
    expect(result).toContain('<emphasis>appended</emphasis>');
    expect(result.indexOf('Existing.')).toBeLessThan(result.indexOf('appended'));
  });

  it('returns true on valid CNXML', () => {
    const { doc, root } = parseCnxmlFragment('<para id="p1"/>');
    const para = root.getElementsByTagName('para')[0];
    const ok = insertCnxmlBefore(doc, para, '<emphasis>valid</emphasis>', null);
    expect(ok).toBe(true);
  });

  it('returns false and inserts text node on malformed CNXML', () => {
    const { doc, root } = parseCnxmlFragment('<para id="p1"/>');
    const para = root.getElementsByTagName('para')[0];
    // Truly broken XML (bare angle brackets) triggers xmldom error handler
    const ok = insertCnxmlBefore(doc, para, '<>broken stuff</>', null);
    expect(ok).toBe(false);
    const result = serializeCnxmlFragment(para);
    // Text fallback: raw string as escaped text
    expect(result).toContain('&lt;&gt;broken stuff&lt;/&gt;');
  });

  it('does nothing when cnxmlString is empty', () => {
    const { doc, root } = parseCnxmlFragment('<para id="p1">existing</para>');
    const para = root.getElementsByTagName('para')[0];
    const ok = insertCnxmlBefore(doc, para, '', null);
    expect(ok).toBe(true);
    const result = serializeCnxmlFragment(para);
    expect(result).toBe('<para id="p1">existing</para>');
  });
});
