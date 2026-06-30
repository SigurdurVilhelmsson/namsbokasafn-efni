import { describe, it, expect } from 'vitest';
import { SEG_MARKER, parseSegmentsMap, parseSegmentRecords } from '../lib/seg-markers.cjs';

const DUP = [
  '<!-- SEG:m1:title:auto-1 -->',
  'First',
  '',
  '<!-- SEG:m1:para:p1 -->',
  'Para one',
  '',
  '<!-- SEG:m1:title:auto-1 -->',
  'Second',
  '',
].join('\n');

describe('parseSegmentsMap', () => {
  it('parses id→text, trimmed', () => {
    const m = parseSegmentsMap('<!-- SEG:m1:para:p1 -->\n  Hello  \n');
    expect(m.get('m1:para:p1')).toBe('Hello');
  });
  it('default duplicates=first keeps the first value', () => {
    expect(parseSegmentsMap(DUP).get('m1:title:auto-1')).toBe('First');
  });
  it('duplicates=last overwrites with the last value', () => {
    expect(parseSegmentsMap(DUP, { duplicates: 'last' }).get('m1:title:auto-1')).toBe('Second');
  });
  it('tolerates a marker glued onto the previous line (PR #96 case)', () => {
    const glued = '<!-- SEG:m1:t:a -->\nTitle<!-- SEG:m1:para:p -->\nBody';
    const m = parseSegmentsMap(glued);
    expect(m.get('m1:t:a')).toBe('Title');
    expect(m.get('m1:para:p')).toBe('Body');
  });
  it('tolerates flexible whitespace in the marker', () => {
    expect(parseSegmentsMap('<!--  SEG:m1:para:p  -->\nX').get('m1:para:p')).toBe('X');
  });
  it('returns empty map for empty input', () => {
    expect(parseSegmentsMap('').size).toBe(0);
  });
});

describe('parseSegmentRecords', () => {
  it('keeps ALL occurrences in order and splits the id', () => {
    const recs = parseSegmentRecords(DUP);
    expect(recs.map((r) => r.segmentId)).toEqual([
      'm1:title:auto-1',
      'm1:para:p1',
      'm1:title:auto-1',
    ]);
    expect(recs[0]).toMatchObject({
      moduleId: 'm1',
      segmentType: 'title',
      elementId: 'auto-1',
      content: 'First',
    });
    expect(recs[2].content).toBe('Second');
  });
  it('captures the trailing segment (EOF, no following marker)', () => {
    const recs = parseSegmentRecords('<!-- SEG:m1:para:only -->\nLast bit');
    expect(recs).toHaveLength(1);
    expect(recs[0].content).toBe('Last bit');
  });
});

describe('SEG_MARKER', () => {
  it('is a global regex', () => {
    expect(SEG_MARKER.flags).toContain('g');
  });
  it('lastIndex stays 0 after parseSegmentsMap (exported regex never mutated)', () => {
    parseSegmentsMap('<!-- SEG:m1:para:p1 -->\nHello');
    expect(SEG_MARKER.lastIndex).toBe(0);
  });
});
