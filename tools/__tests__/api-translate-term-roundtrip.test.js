import { describe, it, expect } from 'vitest';
// reattachIds is used by Task 2's describe block (B4-D11 SDD task-1-brief.md); imported
// now per brief so this file's diff is additive across tasks. The disable below becomes
// removable once Task 2 adds tests that use it.
// eslint-disable-next-line no-unused-vars
import { stripTermFnToPaired, reattachIds } from '../api-translate.js';

const SEG = (id, body) => `<!-- SEG:${id} -->\n${body}\n`;

describe('stripTermFnToPaired', () => {
  it('rewrites an id-anchored term to paired brackets and captures the id', () => {
    const input = SEG('m1:para:a', 'The [[term:viscosity|term-00001]] of a liquid.');
    const { wireText, segments } = stripTermFnToPaired(input);
    expect(wireText).toContain('[[term]]viscosity[[/term]]');
    expect(wireText).not.toContain('[[term:');
    expect(segments).toHaveLength(1);
    expect(segments[0].segId).toBe('m1:para:a');
    expect(segments[0].termIds).toEqual(['term-00001']);
    expect(segments[0].fnIds).toEqual([]);
    expect(segments[0].originalText).toContain('[[term:viscosity|term-00001]]');
  });

  it('captures a null id for the no-id variant', () => {
    const { segments } = stripTermFnToPaired(SEG('m1:para:b', 'A [[term:mól]] here.'));
    expect(segments[0].termIds).toEqual([null]);
  });

  it('rewrites footnotes and keeps term/fn ids separate', () => {
    const input = SEG('m1:para:c', 'X [[term:t|term-1]] Y [[fn:note|fs-id9]] Z');
    const { wireText, segments } = stripTermFnToPaired(input);
    expect(wireText).toContain('[[term]]t[[/term]]');
    expect(wireText).toContain('[[fn]]note[[/fn]]');
    expect(segments[0].termIds).toEqual(['term-1']);
    expect(segments[0].fnIds).toEqual(['fs-id9']);
  });

  it('preserves nested inline markers inside the term text', () => {
    const input = SEG(
      'm1:para:d',
      'The [[term:activation energy ([[i:E]][[sub:a]])|term-6]] matters.'
    );
    const { wireText, segments } = stripTermFnToPaired(input);
    expect(wireText).toContain('[[term]]activation energy ([[i:E]][[sub:a]])[[/term]]');
    expect(segments[0].termIds).toEqual(['term-6']);
  });

  it('captures ids per-segment in source order across multiple segments', () => {
    const input =
      SEG('m1:para:a', 'A [[term:one|id1]] B') +
      SEG('m1:para:b', 'C [[term:two|id2]] D [[term:three|id3]] E');
    const { segments } = stripTermFnToPaired(input);
    expect(segments.map((s) => s.segId)).toEqual(['m1:para:a', 'm1:para:b']);
    expect(segments[0].termIds).toEqual(['id1']);
    expect(segments[1].termIds).toEqual(['id2', 'id3']);
  });
});
