import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  getNoteTypeLabel,
  translateTitle,
  formatChapterDir,
  calculateColspan,
  renderPara,
  renderCnxmlToHtml,
} from '../cnxml-render.js';

const FIXTURES = join(import.meta.dirname, 'fixtures');

// ─── getNoteTypeLabel ─────────────────────────────────────────────

describe('getNoteTypeLabel', () => {
  it('returns null for null/undefined noteClass', () => {
    expect(getNoteTypeLabel(null)).toBe(null);
    expect(getNoteTypeLabel(undefined)).toBe(null);
  });

  it('returns exact match for known note types', () => {
    expect(getNoteTypeLabel('link-to-learning')).toBe('Tengill til náms');
    expect(getNoteTypeLabel('sciences-interconnect')).toBe('Hvernig vísindagreinar tengjast');
    expect(getNoteTypeLabel('safety-hazard')).toBe('Öryggisviðvörun');
  });

  it('returns partial match for compound classes', () => {
    // A class like "chemistry everyday-life" should match "everyday-life"
    expect(getNoteTypeLabel('chemistry everyday-life')).toBe('Efnafræði í daglegu lífi');
  });

  it('returns null for unknown note types', () => {
    expect(getNoteTypeLabel('completely-unknown-type')).toBe(null);
  });
});

// ─── translateTitle ───────────────────────────────────────────────

describe('translateTitle', () => {
  it('translates known English titles to Icelandic', () => {
    expect(translateTitle('Solution')).toBe('Lausn');
    expect(translateTitle('Answer:')).toBe('Svar:');
    expect(translateTitle('Check Your Learning')).toBe('Prófaðu þekkingu þína');
  });

  it('returns original title when no translation exists', () => {
    expect(translateTitle('Unknown Title')).toBe('Unknown Title');
  });

  it('handles whitespace around titles', () => {
    expect(translateTitle('  Solution  ')).toBe('Lausn');
    expect(translateTitle(' Answer: ')).toBe('Svar:');
  });
});

// ─── formatChapterDir ─────────────────────────────────────────────

describe('formatChapterDir', () => {
  it('formats single-digit chapter with zero padding', () => {
    expect(formatChapterDir(1)).toBe('ch01');
    expect(formatChapterDir(9)).toBe('ch09');
  });

  it('formats double-digit chapter without extra padding', () => {
    expect(formatChapterDir(10)).toBe('ch10');
    expect(formatChapterDir(21)).toBe('ch21');
  });

  it('returns "appendices" for appendices chapter', () => {
    expect(formatChapterDir('appendices')).toBe('appendices');
  });
});

// ─── calculateColspan ─────────────────────────────────────────────

describe('calculateColspan', () => {
  it('calculates span from numbered columns', () => {
    expect(calculateColspan('c1', 'c3')).toBe(3);
    expect(calculateColspan('c2', 'c4')).toBe(3);
  });

  it('handles columns without "c" prefix', () => {
    expect(calculateColspan('1', '5')).toBe(5);
  });

  it('returns 1 for same start and end', () => {
    expect(calculateColspan('c1', 'c1')).toBe(1);
  });

  it('returns 1 for non-matching patterns', () => {
    expect(calculateColspan('start', 'end')).toBe(1);
  });
});

// ─── renderPara ───────────────────────────────────────────────────

describe('renderPara', () => {
  // renderPara needs a context object with certain properties
  function makeContext(overrides = {}) {
    return {
      moduleId: 'm00001',
      lang: 'is',
      verbose: false,
      mathJax: null,
      mathSvgCache: new Map(),
      equationCounter: { value: 0 },
      figureCounter: { value: 0 },
      tableCounter: { value: 0 },
      exampleCounter: { value: 0 },
      exerciseCounter: { value: 0 },
      equationTextDictionary: [],
      excludeSections: false,
      renderStats: { equations: 0, success: 0, failures: [] },
      chapterNumber: '01',
      ...overrides,
    };
  }

  it('renders a simple paragraph as <p> tag', () => {
    const para = { id: 'para-01', content: 'Simple text', attributes: {} };
    const html = renderPara(para, makeContext());
    expect(html).toContain('<p');
    expect(html).toContain('Simple text');
    expect(html).toContain('id="para-01"');
  });

  it('preserves paragraph id attribute', () => {
    const para = { id: 'my-para', content: 'Test content', attributes: {} };
    const html = renderPara(para, makeContext());
    expect(html).toContain('id="my-para"');
  });

  it('handles paragraph without id', () => {
    const para = { id: null, content: 'No id paragraph', attributes: {} };
    const html = renderPara(para, makeContext());
    expect(html).toContain('<p>');
    expect(html).toContain('No id paragraph');
  });

  it('processes inline content within paragraph', () => {
    const para = {
      id: 'p1',
      content: 'Text with <emphasis effect="bold">bold</emphasis> word',
      attributes: {},
    };
    const html = renderPara(para, makeContext());
    expect(html).toContain('<strong>bold</strong>');
  });
});

// ─── renderCnxmlToHtml ───────────────────────────────────────────

describe('renderCnxmlToHtml', () => {
  it('renders a minimal CNXML document to HTML', () => {
    const cnxml = readFileSync(join(FIXTURES, 'minimal-translated.cnxml'), 'utf8');
    const result = renderCnxmlToHtml(cnxml, {
      moduleId: 'm00001',
      chapter: 1,
      lang: 'is',
    });
    expect(result.html).toContain('Þetta er fyrsta málsgreinin');
  });

  it('includes module title in page title', () => {
    const cnxml = readFileSync(join(FIXTURES, 'minimal-translated.cnxml'), 'utf8');
    const result = renderCnxmlToHtml(cnxml, {
      moduleId: 'm00001',
      chapter: 1,
    });
    expect(result.html).toContain('<title>1.0 Inngangur</title>');
  });

  it('includes page data JSON script in rendered HTML', () => {
    const cnxml = readFileSync(join(FIXTURES, 'minimal-translated.cnxml'), 'utf8');
    const result = renderCnxmlToHtml(cnxml, {
      moduleId: 'm00001',
      chapter: 1,
    });
    expect(result.html).toContain('id="page-data"');
    expect(result.html).toContain('"moduleId": "m00001"');
  });

  it('renders paragraphs with IDs preserved', () => {
    const cnxml = readFileSync(join(FIXTURES, 'minimal-translated.cnxml'), 'utf8');
    const result = renderCnxmlToHtml(cnxml, {
      moduleId: 'm00001',
      chapter: 1,
    });
    expect(result.html).toContain('id="para-01"');
    expect(result.html).toContain('id="para-02"');
  });

  it('renders term elements with appropriate markup', () => {
    const cnxml = readFileSync(join(FIXTURES, 'minimal-translated.cnxml'), 'utf8');
    const result = renderCnxmlToHtml(cnxml, {
      moduleId: 'm00001',
      chapter: 1,
    });
    expect(result.html).toContain('efnafræði');
  });

  it('handles abstract list items', () => {
    const cnxml = readFileSync(join(FIXTURES, 'minimal-translated.cnxml'), 'utf8');
    const result = renderCnxmlToHtml(cnxml, {
      moduleId: 'm00001',
      chapter: 1,
    });
    // Abstract items should appear in the output somehow
    expect(result.html).toContain('Fyrsta efni');
  });

  it('includes document class as CSS class on article', () => {
    const cnxml = readFileSync(join(FIXTURES, 'minimal-translated.cnxml'), 'utf8');
    const result = renderCnxmlToHtml(cnxml, {
      moduleId: 'm00001',
      chapter: 1,
    });
    expect(result.html).toContain('class="cnx-module introduction"');
  });

  it('wraps content in article with data-module-id', () => {
    const cnxml = readFileSync(join(FIXTURES, 'minimal-translated.cnxml'), 'utf8');
    const result = renderCnxmlToHtml(cnxml, {
      moduleId: 'm00001',
      chapter: 1,
    });
    expect(result.html).toContain('data-module-id="m00001"');
  });
});
