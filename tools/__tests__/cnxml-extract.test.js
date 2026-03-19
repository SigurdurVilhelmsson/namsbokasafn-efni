import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  generateSegmentId,
  extractInlineText,
  extractSegments,
  formatSegmentsMarkdown,
} from '../cnxml-extract.js';

const FIXTURES = join(import.meta.dirname, 'fixtures');

// ─── generateSegmentId ────────────────────────────────────────────

describe('generateSegmentId', () => {
  it('uses element ID when provided', () => {
    expect(generateSegmentId('m00001', 'para', 'para-01', 1)).toBe('m00001:para:para-01');
  });

  it('uses auto-counter when no element ID', () => {
    expect(generateSegmentId('m00001', 'title', null, 1)).toBe('m00001:title:auto-1');
  });

  it('includes type in the ID', () => {
    expect(generateSegmentId('m00001', 'caption', 'fig-01', 5)).toBe('m00001:caption:fig-01');
  });

  it('handles different counter values', () => {
    expect(generateSegmentId('m99999', 'note', null, 42)).toBe('m99999:note:auto-42');
  });
});

// ─── extractInlineText ────────────────────────────────────────────

describe('extractInlineText', () => {
  it('returns plain text unchanged', () => {
    const mathMap = new Map();
    const counters = { math: 0, media: 0, segment: 0 };
    const result = extractInlineText('Simple text without markup', mathMap, counters);
    expect(result).toContain('Simple text without markup');
  });

  it('replaces MathML with [[MATH:n]] placeholders', () => {
    const mathMap = new Map();
    const counters = { math: 0, media: 0, segment: 0 };
    const input =
      'Force equals <m:math xmlns:m="http://www.w3.org/1998/Math/MathML"><m:mrow><m:mi>F</m:mi></m:mrow></m:math> newtons';
    const result = extractInlineText(input, mathMap, counters);
    expect(result).toContain('[[MATH:1]]');
    expect(result).not.toContain('<m:math');
    expect(mathMap.size).toBe(1);
  });

  it('increments math counter for multiple equations', () => {
    const mathMap = new Map();
    const counters = { math: 0, media: 0, segment: 0 };
    const input =
      '<m:math xmlns:m="http://www.w3.org/1998/Math/MathML"><m:mi>a</m:mi></m:math> and <m:math xmlns:m="http://www.w3.org/1998/Math/MathML"><m:mi>b</m:mi></m:math>';
    const result = extractInlineText(input, mathMap, counters);
    expect(result).toContain('[[MATH:1]]');
    expect(result).toContain('[[MATH:2]]');
    expect(counters.math).toBe(2);
  });

  it('converts <newline/> to [[BR]] placeholder', () => {
    const mathMap = new Map();
    const counters = { math: 0, media: 0, segment: 0 };
    const result = extractInlineText('Line one<newline/>Line two', mathMap, counters);
    expect(result).toContain('[[BR]]');
  });

  it('strips HTML/CNXML tags (term, emphasis, etc.)', () => {
    const mathMap = new Map();
    const counters = { math: 0, media: 0, segment: 0 };
    const input = 'A <term id="t1">molecule</term> is important';
    const result = extractInlineText(input, mathMap, counters);
    expect(result).toContain('molecule');
    expect(result).not.toContain('<term');
  });

  it('handles inline media with inlineMediaMap', () => {
    const mathMap = new Map();
    const counters = { math: 0, media: 0, segment: 0 };
    const mediaMap = new Map();
    const input =
      'See <media id="m1" alt="icon"><image mime-type="image/png" src="icon.png"/></media> here';
    const result = extractInlineText(input, mathMap, counters, mediaMap);
    expect(result).toContain('[[MEDIA:1]]');
    expect(mediaMap.size).toBe(1);
  });

  it('converts <space/> tags to placeholders', () => {
    const mathMap = new Map();
    const counters = { math: 0, media: 0, segment: 0 };
    const result = extractInlineText('A<space count="3"/>B', mathMap, counters);
    expect(result).toContain('[[SPACE:3]]');
  });

  it('handles emphasis tags', () => {
    const mathMap = new Map();
    const counters = { math: 0, media: 0, segment: 0 };
    const result = extractInlineText(
      'This is <emphasis effect="bold">important</emphasis> text',
      mathMap,
      counters
    );
    expect(result).toContain('important');
    expect(result).not.toContain('<emphasis');
  });
});

// ─── extractSegments ──────────────────────────────────────────────

describe('extractSegments', () => {
  it('extracts title from introduction document', () => {
    const cnxml = readFileSync(join(FIXTURES, 'minimal-intro.cnxml'), 'utf8');
    const result = extractSegments(cnxml, { moduleId: 'm00001' });
    expect(result.segments.some((s) => s.type === 'title' && s.text === 'Introduction')).toBe(true);
  });

  it('extracts abstract list items', () => {
    const cnxml = readFileSync(join(FIXTURES, 'minimal-intro.cnxml'), 'utf8');
    const result = extractSegments(cnxml, { moduleId: 'm00001' });
    expect(result.segments.some((s) => s.text === 'First Topic')).toBe(true);
    expect(result.segments.some((s) => s.text === 'Second Topic')).toBe(true);
  });

  it('extracts paragraph text', () => {
    const cnxml = readFileSync(join(FIXTURES, 'minimal-intro.cnxml'), 'utf8');
    const result = extractSegments(cnxml, { moduleId: 'm00001' });
    expect(result.segments.some((s) => s.text.includes('first paragraph'))).toBe(true);
  });

  it('extracts caption text', () => {
    const cnxml = readFileSync(join(FIXTURES, 'minimal-intro.cnxml'), 'utf8');
    const result = extractSegments(cnxml, { moduleId: 'm00001' });
    expect(result.segments.some((s) => s.text.includes('test caption'))).toBe(true);
  });

  it('builds structure with moduleId and document class', () => {
    const cnxml = readFileSync(join(FIXTURES, 'minimal-intro.cnxml'), 'utf8');
    const result = extractSegments(cnxml, { moduleId: 'm00001' });
    expect(result.structure.moduleId).toBe('m00001');
    expect(result.structure.documentClass).toBe('introduction');
  });

  it('extracts section titles from structured document', () => {
    const cnxml = readFileSync(join(FIXTURES, 'minimal-section.cnxml'), 'utf8');
    const result = extractSegments(cnxml, { moduleId: 'm00002' });
    expect(result.segments.some((s) => s.text === 'Atoms and Molecules')).toBe(true);
    expect(result.segments.some((s) => s.text === 'Chemical Formulas')).toBe(true);
  });

  it('extracts MathML as placeholders in segment text', () => {
    const cnxml = readFileSync(join(FIXTURES, 'minimal-section.cnxml'), 'utf8');
    const result = extractSegments(cnxml, { moduleId: 'm00002' });
    // The MathML in the para should be replaced with a [[MATH:n]] placeholder
    const bondPara = result.segments.find((s) => s.text.includes('molecule'));
    expect(bondPara.text).toContain('[[MATH:');
    expect(bondPara.text).not.toContain('<m:math');
  });

  it('returns segments array, structure object, and equations object', () => {
    const cnxml = readFileSync(join(FIXTURES, 'minimal-intro.cnxml'), 'utf8');
    const result = extractSegments(cnxml, { moduleId: 'm00001' });
    expect(Array.isArray(result.segments)).toBe(true);
    expect(typeof result.structure).toBe('object');
    expect(typeof result.equations).toBe('object');
    expect(result.inlineAttrs).toBeDefined();
  });

  it('extracts section titles containing inline markup (emphasis, sup)', () => {
    const cnxml = readFileSync(join(FIXTURES, 'inline-title.cnxml'), 'utf8');
    const result = extractSegments(cnxml, { moduleId: 'm00003' });

    // Plain title should work as before
    expect(result.segments.some((s) => s.type === 'title' && s.text === 'Plain Title')).toBe(true);

    // Title with <emphasis> and <sup> should be extracted with inline markers
    const sp2Title = result.segments.find(
      (s) => s.text.includes('^2^') && s.text.includes('Hybridization')
    );
    expect(sp2Title).toBeDefined();
    expect(sp2Title.type).toBe('title');
    // extractInlineText converts <emphasis effect="italics"> to *text* and <sup> to ^text^
    expect(sp2Title.text).toContain('*sp*');
    expect(sp2Title.text).toContain('^2^');
  });

  it('extracts complex section titles with multiple inline elements', () => {
    const cnxml = readFileSync(join(FIXTURES, 'inline-title.cnxml'), 'utf8');
    const result = extractSegments(cnxml, { moduleId: 'm00003' });

    // The complex title: <emphasis>sp</emphasis><sup>3</sup><emphasis>d</emphasis> and ...
    const complexTitle = result.segments.find(
      (s) => s.text.includes('^3^') && s.text.includes('*d*') && s.type === 'title'
    );
    expect(complexTitle).toBeDefined();
    expect(complexTitle.text).toContain('^3^');
  });

  it('includes all three section titles in structure', () => {
    const cnxml = readFileSync(join(FIXTURES, 'inline-title.cnxml'), 'utf8');
    const result = extractSegments(cnxml, { moduleId: 'm00003' });
    const titleSegments = result.segments.filter((s) => s.type === 'title');
    // Document title + 3 section titles = 4
    expect(titleSegments.length).toBe(4);
  });

  it('extracts multi-para table cells as separate segments per para', () => {
    const cnxml = readFileSync(join(FIXTURES, 'multi-para-table.cnxml'), 'utf8');
    const result = extractSegments(cnxml, { moduleId: 'm00004' });

    // The multi-para cell (e-multi) has 3 paras: Li+, Na+, K+
    // Each should be a separate segment
    const liSeg = result.segments.find((s) => s.text.includes('Li'));
    const naSeg = result.segments.find((s) => s.text.includes('Na'));
    const kSeg = result.segments.find((s) => s.text.includes('K'));
    expect(liSeg).toBeDefined();
    expect(naSeg).toBeDefined();
    expect(kSeg).toBeDefined();

    // They should be separate segments (not merged into one)
    expect(liSeg.id).not.toBe(naSeg.id);
    expect(naSeg.id).not.toBe(kSeg.id);
  });

  it('stores multi-para cell structure with paras array', () => {
    const cnxml = readFileSync(join(FIXTURES, 'multi-para-table.cnxml'), 'utf8');
    const result = extractSegments(cnxml, { moduleId: 'm00004' });

    // Find the table in the structure
    const section = result.structure.content[0];
    const table = section.content.find((el) => el.type === 'table');
    expect(table).toBeDefined();

    // Row 0, cell 1 (e-multi) should have paras array
    const multiCell = table.rows[1].cells[1]; // tbody row 0, col 1
    expect(multiCell.paras).toBeDefined();
    expect(multiCell.paras.length).toBe(3);
    expect(multiCell.paras[0].paraId).toBe('p-li');
    expect(multiCell.paras[1].paraId).toBe('p-na');
    expect(multiCell.paras[2].paraId).toBe('p-k');
  });
});

// ─── formatSegmentsMarkdown ───────────────────────────────────────

describe('formatSegmentsMarkdown', () => {
  it('formats segments with SEG comment markers', () => {
    const segments = [
      { id: 'm00001:title:auto-1', text: 'Introduction' },
      { id: 'm00001:para:para-01', text: 'First paragraph.' },
    ];
    const md = formatSegmentsMarkdown(segments);
    expect(md).toContain('<!-- SEG:m00001:title:auto-1 -->');
    expect(md).toContain('Introduction');
    expect(md).toContain('<!-- SEG:m00001:para:para-01 -->');
    expect(md).toContain('First paragraph.');
  });

  it('separates segments with blank lines', () => {
    const segments = [
      { id: 'a', text: 'First' },
      { id: 'b', text: 'Second' },
    ];
    const md = formatSegmentsMarkdown(segments);
    // Each segment: marker line, text line, blank line
    const lines = md.split('\n');
    expect(lines[0]).toBe('<!-- SEG:a -->');
    expect(lines[1]).toBe('First');
    expect(lines[2]).toBe('');
    expect(lines[3]).toBe('<!-- SEG:b -->');
  });

  it('handles empty segments array', () => {
    const md = formatSegmentsMarkdown([]);
    expect(md).toBe('');
  });
});
