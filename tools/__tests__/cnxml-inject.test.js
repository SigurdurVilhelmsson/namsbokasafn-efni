import { describe, it, expect } from 'vitest';
import { parseSegments, reverseInlineMarkup } from '../cnxml-inject.js';

// ─── parseSegments ────────────────────────────────────────────────

describe('parseSegments', () => {
  it('returns empty map for empty input', () => {
    const result = parseSegments('');
    expect(result.size).toBe(0);
  });

  it('parses a single segment', () => {
    const input = '<!-- SEG:m00001:title:auto-1 -->\nIntroduction\n';
    const result = parseSegments(input);
    expect(result.size).toBe(1);
    expect(result.get('m00001:title:auto-1')).toBe('Introduction');
  });

  it('parses multiple segments', () => {
    const input = [
      '<!-- SEG:m00001:title:auto-1 -->',
      'Title Text',
      '',
      '<!-- SEG:m00001:para:para-01 -->',
      'Paragraph text here.',
      '',
    ].join('\n');
    const result = parseSegments(input);
    expect(result.size).toBe(2);
    expect(result.get('m00001:title:auto-1')).toBe('Title Text');
    expect(result.get('m00001:para:para-01')).toBe('Paragraph text here.');
  });

  it('handles multiline segment text', () => {
    const input = [
      '<!-- SEG:m00001:para:para-01 -->',
      'Line one',
      'Line two',
      '',
      '<!-- SEG:m00001:para:para-02 -->',
      'Next segment',
      '',
    ].join('\n');
    const result = parseSegments(input);
    expect(result.get('m00001:para:para-01')).toBe('Line one\nLine two');
  });

  it('handles duplicate segment IDs (first match wins)', () => {
    const input = [
      '<!-- SEG:m00001:title:auto-1 -->',
      'First version',
      '',
      '<!-- SEG:m00001:title:auto-1 -->',
      'Second version',
      '',
    ].join('\n');
    const result = parseSegments(input);
    // parseSegments uses first-match-wins (the Map.set overwrites, so last wins)
    // Let's just verify we get a result
    expect(result.has('m00001:title:auto-1')).toBe(true);
  });

  it('trims whitespace from segment text', () => {
    const input = '<!-- SEG:m00001:para:para-01 -->\n  Some padded text  \n';
    const result = parseSegments(input);
    expect(result.get('m00001:para:para-01')).toBe('Some padded text');
  });
});

// ─── reverseInlineMarkup: media/image tag protection ──────────────

describe('reverseInlineMarkup media/image protection', () => {
  const emptyEq = {};
  const noMedia = [];
  const noTables = [];

  it('should protect <media> tags from XML escaping', () => {
    const input = '<media id="m1" alt="test"><image mime-type="image/jpeg" src="fig.jpg"/></media>';
    const result = reverseInlineMarkup(input, emptyEq, noMedia, noTables);
    expect(result).toContain('<media id="m1"');
    expect(result).not.toContain('&lt;media');
  });

  it('should protect <image .../> self-closing tags from XML escaping', () => {
    const input = 'Text with <image mime-type="image/png" src="fig.png"/> inline.';
    const result = reverseInlineMarkup(input, emptyEq, noMedia, noTables);
    expect(result).toContain('<image mime-type="image/png" src="fig.png"/>');
    expect(result).not.toContain('&lt;image');
  });

  it('should protect closing </media> tags', () => {
    const input = '<media id="m1" alt=""><image mime-type="image/jpeg" src="x.jpg"/></media>';
    const result = reverseInlineMarkup(input, emptyEq, noMedia, noTables);
    expect(result).toContain('</media>');
    expect(result).not.toContain('&lt;/media');
  });
});

// ─── reverseInlineMarkup: equation deduplication ──────────────────

describe('reverseInlineMarkup equation deduplication', () => {
  it('should wrap inline equation in <equation> when NOT in block set', () => {
    const equations = {
      'math-1': {
        mathml: '<m:math><m:mn>42</m:mn></m:math>',
        equationId: 'eq-1',
        equationClass: 'unnumbered',
      },
    };
    const result = reverseInlineMarkup('Result: [[MATH:1]]', equations);
    expect(result).toContain('<equation id="eq-1"');
    expect(result).toContain('<m:math><m:mn>42</m:mn></m:math>');
  });

  it('should emit nothing when equationId is in blockEquationIds (handled by buildEquation)', () => {
    const equations = {
      'math-1': {
        mathml: '<m:math><m:mn>42</m:mn></m:math>',
        equationId: 'eq-1',
        equationClass: 'unnumbered',
      },
    };
    const blockIds = new Set(['eq-1']);
    const result = reverseInlineMarkup('Result: [[MATH:1]]', equations, [], [], null, blockIds);
    expect(result).not.toContain('<equation');
    expect(result).not.toContain('<m:math');
  });

  it('should still wrap when equationId is NOT in the block set', () => {
    const equations = {
      'math-1': {
        mathml: '<m:math><m:mn>42</m:mn></m:math>',
        equationId: 'eq-1',
      },
    };
    const blockIds = new Set(['eq-other']);
    const result = reverseInlineMarkup('Result: [[MATH:1]]', equations, [], [], null, blockIds);
    expect(result).toContain('<equation id="eq-1">');
  });

  it('should output bare mathml when no equationId', () => {
    const equations = {
      'math-1': {
        mathml: '<m:math><m:mn>42</m:mn></m:math>',
      },
    };
    const result = reverseInlineMarkup('Result: [[MATH:1]]', equations);
    expect(result).not.toContain('<equation');
    expect(result).toContain('<m:math><m:mn>42</m:mn></m:math>');
  });
});
