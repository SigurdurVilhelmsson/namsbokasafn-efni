/**
 * Tests for Segment Parser Service
 */

import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const {
  parseSegments,
  assembleSegments,
  normalizeTermMarkers,
} = require('../services/segmentParser');

describe('parseSegments', () => {
  it('parses HTML comment markers', () => {
    const content = `<!-- SEG:m68663:para:fs-id001 -->
This is a paragraph.

<!-- SEG:m68663:title:fs-id002 -->
This is a title.`;

    const segments = parseSegments(content);
    expect(segments).toHaveLength(2);
    expect(segments[0].segmentId).toBe('m68663:para:fs-id001');
    expect(segments[0].moduleId).toBe('m68663');
    expect(segments[0].segmentType).toBe('para');
    expect(segments[0].elementId).toBe('fs-id001');
    expect(segments[0].content).toBe('This is a paragraph.');
    expect(segments[1].segmentId).toBe('m68663:title:fs-id002');
    expect(segments[1].content).toBe('This is a title.');
  });

  it('parses mustache markers', () => {
    const content = `{{SEG:m68663:para:fs-id001}}
First paragraph.

{{SEG:m68663:para:fs-id002}}
Second paragraph.`;

    const segments = parseSegments(content);
    expect(segments).toHaveLength(2);
    expect(segments[0].segmentId).toBe('m68663:para:fs-id001');
    expect(segments[0].content).toBe('First paragraph.');
    expect(segments[1].segmentId).toBe('m68663:para:fs-id002');
    expect(segments[1].content).toBe('Second paragraph.');
  });

  it('handles mixed marker formats', () => {
    const content = `<!-- SEG:m68663:title:fs-id001 -->
Title text

{{SEG:m68663:para:fs-id002}}
Paragraph text`;

    const segments = parseSegments(content);
    expect(segments).toHaveLength(2);
    expect(segments[0].moduleId).toBe('m68663');
    expect(segments[1].moduleId).toBe('m68663');
  });

  it('normalizes hard-wrapped content into single line', () => {
    const content = `<!-- SEG:m68663:para:fs-id001 -->
Line one.
Line two.
Line three.`;

    const segments = parseSegments(content);
    expect(segments).toHaveLength(1);
    expect(segments[0].content).toBe('Line one. Line two. Line three.');
  });

  it('preserves double-newline paragraph breaks', () => {
    const content = `<!-- SEG:m68663:para:fs-id001 -->
Paragraph one.

Paragraph two.`;

    const segments = parseSegments(content);
    expect(segments).toHaveLength(1);
    expect(segments[0].content).toBe('Paragraph one.\n\nParagraph two.');
  });

  it('captures content on same line as HTML comment marker', () => {
    const content = `<!-- SEG:m68663:para:fs-id001 --> Þetta er efnisgrein.

<!-- SEG:m68663:title:fs-id002 --> Þetta er titill.`;

    const segments = parseSegments(content);
    expect(segments).toHaveLength(2);
    expect(segments[0].content).toBe('Þetta er efnisgrein.');
    expect(segments[1].content).toBe('Þetta er titill.');
  });

  it('captures content on same line as mustache marker', () => {
    const content = `{{SEG:m68663:para:fs-id001}} Fyrsta efnisgrein.

{{SEG:m68663:para:fs-id002}} Önnur efnisgrein.`;

    const segments = parseSegments(content);
    expect(segments).toHaveLength(2);
    expect(segments[0].content).toBe('Fyrsta efnisgrein.');
    expect(segments[1].content).toBe('Önnur efnisgrein.');
  });

  it('handles inline content with hard wraps (MT output format)', () => {
    const content = `<!-- SEG:m68663:para:fs-id001 --> Þetta er langt
innihald sem er brotið yfir í
margar línur vegna MT úttaks.`;

    const segments = parseSegments(content);
    expect(segments).toHaveLength(1);
    expect(segments[0].content).toBe(
      'Þetta er langt innihald sem er brotið yfir í margar línur vegna MT úttaks.'
    );
  });

  it('returns empty array for content with no markers', () => {
    const segments = parseSegments('Just some text without markers.');
    expect(segments).toHaveLength(0);
  });

  it('ignores content before first marker', () => {
    const content = `Some preamble text.

<!-- SEG:m68663:para:fs-id001 -->
Actual content.`;

    const segments = parseSegments(content);
    expect(segments).toHaveLength(1);
    expect(segments[0].content).toBe('Actual content.');
  });

  it('handles math placeholders in content', () => {
    const content = `<!-- SEG:m68663:para:fs-id001 -->
The formula [[MATH:1]] shows that [[MATH:2]] is valid.`;

    const segments = parseSegments(content);
    expect(segments).toHaveLength(1);
    expect(segments[0].content).toContain('[[MATH:1]]');
    expect(segments[0].content).toContain('[[MATH:2]]');
  });
});

describe('normalizeTermMarkers', () => {
  it('converts ** back to __ when EN has terms and IS has bold', () => {
    const en = 'A __term__ in context';
    const is = 'Ein **hugtak** í samhengi';
    expect(normalizeTermMarkers(en, is)).toBe('Ein __hugtak__ í samhengi');
  });

  it('only converts excess bold when EN has both terms and bold', () => {
    const en = 'A __term__ and **bold** text';
    const is = 'Ein **hugtak** og **feitletrað** texti';
    const result = normalizeTermMarkers(en, is);
    // One term in EN, one bold in EN → one excess bold in IS to convert
    expect(result).toBe('Ein __hugtak__ og **feitletrað** texti');
  });

  it('leaves IS unchanged when EN has no terms', () => {
    const en = 'Some **bold** text';
    const is = 'Nokkur **feitletruð** texti';
    expect(normalizeTermMarkers(en, is)).toBe('Nokkur **feitletruð** texti');
  });

  it('leaves IS unchanged when terms already correct', () => {
    const en = 'A __term__ here';
    const is = 'Ein __hugtak__ hér';
    expect(normalizeTermMarkers(en, is)).toBe('Ein __hugtak__ hér');
  });

  it('handles multiple terms converted by MT', () => {
    const en = 'Both __alpha__ and __beta__ are terms';
    const is = 'Bæði **alfa** og **beta** eru hugtök';
    const result = normalizeTermMarkers(en, is);
    expect(result).toBe('Bæði __alfa__ og __beta__ eru hugtök');
  });

  it('returns IS unchanged for empty inputs', () => {
    expect(normalizeTermMarkers('', 'some text')).toBe('some text');
    expect(normalizeTermMarkers('has __term__', '')).toBe('');
  });
});

describe('assembleSegments', () => {
  it('reassembles segments with HTML comment markers', () => {
    const segments = [
      { segmentId: 'm68663:para:fs-id001', content: 'First paragraph.' },
      { segmentId: 'm68663:title:fs-id002', content: 'A title.' },
    ];

    const output = assembleSegments(segments);
    expect(output).toContain('<!-- SEG:m68663:para:fs-id001 -->');
    expect(output).toContain('First paragraph.');
    expect(output).toContain('<!-- SEG:m68663:title:fs-id002 -->');
    expect(output).toContain('A title.');
  });

  it('round-trips through parse and assemble', () => {
    const original = `<!-- SEG:m68663:para:fs-id001 -->
First paragraph.

<!-- SEG:m68663:title:fs-id002 -->
A title.`;

    const segments = parseSegments(original);
    const reassembled = assembleSegments(segments);
    const reparsed = parseSegments(reassembled);

    expect(reparsed).toHaveLength(segments.length);
    for (let i = 0; i < segments.length; i++) {
      expect(reparsed[i].segmentId).toBe(segments[i].segmentId);
      expect(reparsed[i].content).toBe(segments[i].content);
    }
  });

  it('round-trips inline-content format through parse and assemble', () => {
    const inlineFormat = `<!-- SEG:m68663:para:fs-id001 --> Fyrsta efnisgrein.

<!-- SEG:m68663:title:fs-id002 --> Titill.`;

    const segments = parseSegments(inlineFormat);
    expect(segments).toHaveLength(2);
    expect(segments[0].content).toBe('Fyrsta efnisgrein.');
    expect(segments[1].content).toBe('Titill.');

    // Assemble produces canonical format (marker on own line)
    const reassembled = assembleSegments(segments);
    const reparsed = parseSegments(reassembled);

    expect(reparsed).toHaveLength(segments.length);
    for (let i = 0; i < segments.length; i++) {
      expect(reparsed[i].segmentId).toBe(segments[i].segmentId);
      expect(reparsed[i].content).toBe(segments[i].content);
    }
  });
});
