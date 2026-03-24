import { describe, it, expect } from 'vitest';
import { findUntranslatedText } from '../cnxml-linguistic-check.js';

describe('findUntranslatedText', () => {
  it('returns empty array when all text is translated', () => {
    const source =
      '<document xmlns="http://cnx.rice.edu/cnxml"><para id="p1">Hello world</para></document>';
    const translated =
      '<document xmlns="http://cnx.rice.edu/cnxml"><para id="p1">Halló heimur</para></document>';
    expect(findUntranslatedText(source, translated)).toEqual([]);
  });

  it('flags identical text as untranslated', () => {
    const source =
      '<document xmlns="http://cnx.rice.edu/cnxml"><para id="p1">This text was not translated at all</para></document>';
    const translated =
      '<document xmlns="http://cnx.rice.edu/cnxml"><para id="p1">This text was not translated at all</para></document>';
    const result = findUntranslatedText(source, translated);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ id: 'p1', tag: 'para' });
  });

  it('skips short text below minLength threshold', () => {
    const source =
      '<document xmlns="http://cnx.rice.edu/cnxml"><para id="p1">Short</para></document>';
    const translated =
      '<document xmlns="http://cnx.rice.edu/cnxml"><para id="p1">Short</para></document>';
    expect(findUntranslatedText(source, translated)).toEqual([]);
  });

  it('skips metadata blocks entirely', () => {
    const source =
      '<document xmlns="http://cnx.rice.edu/cnxml"><metadata><md:abstract><para id="abs1">This module introduces chemistry</para></md:abstract></metadata><para id="p1">Translated here ok</para></document>';
    const translated =
      '<document xmlns="http://cnx.rice.edu/cnxml"><metadata><md:abstract><para id="abs1">This module introduces chemistry</para></md:abstract></metadata><para id="p1">Þýtt hér allt í lagi</para></document>';
    expect(findUntranslatedText(source, translated)).toEqual([]);
  });

  it('skips MathML content inside paragraphs', () => {
    const source =
      '<document xmlns="http://cnx.rice.edu/cnxml"><para id="p1">The equation <m:math><m:mi>x</m:mi><m:mo>=</m:mo><m:mn>5</m:mn></m:math> shows the result</para></document>';
    const translated =
      '<document xmlns="http://cnx.rice.edu/cnxml"><para id="p1">Jafnan <m:math><m:mi>x</m:mi><m:mo>=</m:mo><m:mn>5</m:mn></m:math> sýnir niðurstöðuna</para></document>';
    expect(findUntranslatedText(source, translated)).toEqual([]);
  });

  it('does not flag para whose only content is MathML', () => {
    const source =
      '<document xmlns="http://cnx.rice.edu/cnxml"><para id="p1"><m:math><m:mrow><m:mi>E</m:mi><m:mo>=</m:mo><m:mi>m</m:mi><m:msup><m:mi>c</m:mi><m:mn>2</m:mn></m:msup></m:mrow></m:math></para></document>';
    const translated =
      '<document xmlns="http://cnx.rice.edu/cnxml"><para id="p1"><m:math><m:mrow><m:mi>E</m:mi><m:mo>=</m:mo><m:mi>m</m:mi><m:msup><m:mi>c</m:mi><m:mn>2</m:mn></m:msup></m:mrow></m:math></para></document>';
    expect(findUntranslatedText(source, translated)).toEqual([]);
  });

  it('handles list items inside notes', () => {
    const source = `<document xmlns="http://cnx.rice.edu/cnxml">
      <note id="n1"><list id="l1" list-type="bulleted">
        <item id="i1">What are the main types of organisms?</item>
        <item id="i2">Name some characteristics.</item>
      </list></note></document>`;
    const translated = `<document xmlns="http://cnx.rice.edu/cnxml">
      <note id="n1"><list id="l1" list-type="bulleted">
        <item id="i1">What are the main types of organisms?</item>
        <item id="i2">Name some characteristics.</item>
      </list></note></document>`;
    const result = findUntranslatedText(source, translated);
    expect(result).toHaveLength(2);
    expect(result.map((r) => r.id)).toContain('i1');
    expect(result.map((r) => r.id)).toContain('i2');
  });

  it('flags id-less items via positional key when text is identical', () => {
    const source = `<document xmlns="http://cnx.rice.edu/cnxml">
      <list><item>What are the main types of organisms here?</item></list></document>`;
    const translated = `<document xmlns="http://cnx.rice.edu/cnxml">
      <list><item>What are the main types of organisms here?</item></list></document>`;
    const result = findUntranslatedText(source, translated, { minLength: 5 });
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('item#0');
    expect(result[0].tag).toBe('item');
  });

  it('respects custom minLength option', () => {
    const source =
      '<document xmlns="http://cnx.rice.edu/cnxml"><para id="p1">Medium text</para></document>';
    const translated =
      '<document xmlns="http://cnx.rice.edu/cnxml"><para id="p1">Medium text</para></document>';
    expect(findUntranslatedText(source, translated, { minLength: 5 })).toHaveLength(1);
    expect(findUntranslatedText(source, translated, { minLength: 20 })).toEqual([]);
  });

  it('skips text that is purely numeric', () => {
    const source =
      '<document xmlns="http://cnx.rice.edu/cnxml"><para id="p1">123456789012345</para></document>';
    const translated =
      '<document xmlns="http://cnx.rice.edu/cnxml"><para id="p1">123456789012345</para></document>';
    expect(findUntranslatedText(source, translated)).toEqual([]);
  });

  it('skips text that is purely whitespace or punctuation', () => {
    const source =
      '<document xmlns="http://cnx.rice.edu/cnxml"><para id="p1">--- ... ,,, !!! ???</para></document>';
    const translated =
      '<document xmlns="http://cnx.rice.edu/cnxml"><para id="p1">--- ... ,,, !!! ???</para></document>';
    expect(findUntranslatedText(source, translated)).toEqual([]);
  });

  it('skips text matching URL patterns', () => {
    const source =
      '<document xmlns="http://cnx.rice.edu/cnxml"><para id="p1">https://openstax.org/books/chemistry/pages/1</para></document>';
    const translated =
      '<document xmlns="http://cnx.rice.edu/cnxml"><para id="p1">https://openstax.org/books/chemistry/pages/1</para></document>';
    expect(findUntranslatedText(source, translated)).toEqual([]);
  });

  it('skips text matching DOI patterns', () => {
    const source =
      '<document xmlns="http://cnx.rice.edu/cnxml"><para id="p1">10.1234/some-doi-reference-here</para></document>';
    const translated =
      '<document xmlns="http://cnx.rice.edu/cnxml"><para id="p1">10.1234/some-doi-reference-here</para></document>';
    expect(findUntranslatedText(source, translated)).toEqual([]);
  });

  it('only flags IDs present in both source and translated', () => {
    const source =
      '<document xmlns="http://cnx.rice.edu/cnxml"><para id="p1">This text is only in source and is long enough</para></document>';
    const translated =
      '<document xmlns="http://cnx.rice.edu/cnxml"><para id="p2">Þessi texti er bara í þýðingu</para></document>';
    expect(findUntranslatedText(source, translated)).toEqual([]);
  });

  it('extracts caption elements', () => {
    const source =
      '<document xmlns="http://cnx.rice.edu/cnxml"><caption id="c1">A diagram showing chemical bonds</caption></document>';
    const translated =
      '<document xmlns="http://cnx.rice.edu/cnxml"><caption id="c1">A diagram showing chemical bonds</caption></document>';
    const result = findUntranslatedText(source, translated);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ id: 'c1', tag: 'caption' });
  });

  it('strips inner XML tags before comparing text', () => {
    const source =
      '<document xmlns="http://cnx.rice.edu/cnxml"><para id="p1">This has <emphasis effect="bold">bold</emphasis> and <term>terms</term></para></document>';
    const translated =
      '<document xmlns="http://cnx.rice.edu/cnxml"><para id="p1">Þetta hefur <emphasis effect="bold">feitletrað</emphasis> og <term>hugtök</term></para></document>';
    expect(findUntranslatedText(source, translated)).toEqual([]);
  });

  it('includes text in flagged results', () => {
    const source =
      '<document xmlns="http://cnx.rice.edu/cnxml"><para id="p1">This is the untranslated text content</para></document>';
    const translated =
      '<document xmlns="http://cnx.rice.edu/cnxml"><para id="p1">This is the untranslated text content</para></document>';
    const result = findUntranslatedText(source, translated);
    expect(result).toHaveLength(1);
    expect(result[0].text).toBe('This is the untranslated text content');
  });
});
