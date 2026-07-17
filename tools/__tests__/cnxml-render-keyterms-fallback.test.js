/**
 * cnxml-render-keyterms-fallback.test.js — item 10 (#22): the key-terms
 * fallback (organic-format books, zero <glossary>) routes appendix-document
 * links to /vidauki/{letter}; every other link keeps today's section URL
 * byte-identical (characterization).
 */

import { describe, it, expect } from 'vitest';
import { buildKeyTermsItems } from '../cnxml-render.js'; // extracted in Step 3

const itemsCnxml = [
  '<item><link document="m00032" target-id="term-00006">alcohol</link></item>',
  '<item><link document="m9001" target-id="term-00007">appendix term</link></item>',
  '<item>plain text term</item>',
].join('');

const args = {
  sectionSlugFor: (_moduleId) => `3-2-nafn`, // stand-in for the getOutputFilename wiring
  bookSlug: 'lifraen-efnafraedi',
  chapterStr: 'ch03',
  appendixResolution: {
    bookSlug: 'lifraen-efnafraedi',
    appendixModuleLetters: new Map([['m9001', 'D']]),
    appendixIdMap: new Map(),
  },
};

describe('#22 — key-terms fallback link routing', () => {
  it('ordinary module link keeps the exact section URL shape (characterization)', () => {
    const lines = buildKeyTermsItems(itemsCnxml, args);
    expect(lines[0]).toBe(
      '<li><a href="/content/lifraen-efnafraedi/chapters/ch03/3-2-nafn.html">alcohol</a></li>'
    );
  });
  it('appendix-document link resolves to /vidauki/{letter}#target', () => {
    const lines = buildKeyTermsItems(itemsCnxml, args);
    expect(lines[1]).toBe(
      '<li><a href="/lifraen-efnafraedi/vidauki/D#term-00007">appendix term</a></li>'
    );
  });
  it('plain-text item unchanged', () => {
    const lines = buildKeyTermsItems(itemsCnxml, args);
    expect(lines[2]).toBe('<li>plain text term</li>');
  });
});
