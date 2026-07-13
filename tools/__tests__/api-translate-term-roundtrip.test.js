import { describe, it, expect } from 'vitest';
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

describe('reattachIds', () => {
  it('re-attaches ids by within-segment ordinal', () => {
    const { segments } = stripTermFnToPaired(
      SEG('m1:para:a', 'A [[term:one|id1]] B [[term:two|id2]] C')
    );
    // simulate MT: text between paired brackets translated, delimiters kept
    const wireOut = SEG('m1:para:a', 'Á [[term]]einn[[/term]] B [[term]]tveir[[/term]] C');
    const { text, mismatches } = reattachIds(wireOut, segments);
    expect(text).toContain('[[term:einn|id1]]');
    expect(text).toContain('[[term:tveir|id2]]');
    expect(mismatches).toEqual([]);
  });

  it('emits no-id form when the captured id was null', () => {
    const { segments } = stripTermFnToPaired(SEG('m1:para:b', 'A [[term:mól]] B'));
    const wireOut = SEG('m1:para:b', 'Á [[term]]mól[[/term]] B');
    const { text } = reattachIds(wireOut, segments);
    expect(text).toContain('[[term:mól]]');
    expect(text).not.toContain('[[term:mól|');
  });

  it('re-attaches footnotes independently of terms', () => {
    const { segments } = stripTermFnToPaired(
      SEG('m1:para:c', 'X [[term:t|term-1]] [[fn:note|fs-9]] Z')
    );
    const wireOut = SEG('m1:para:c', 'X [[term]]hugtak[[/term]] [[fn]]neðanmáls[[/fn]] Z');
    const { text, mismatches } = reattachIds(wireOut, segments);
    expect(text).toContain('[[term:hugtak|term-1]]');
    expect(text).toContain('[[fn:neðanmáls|fs-9]]');
    expect(mismatches).toEqual([]);
  });

  it('preserves nested markers in the translated term text', () => {
    const { segments } = stripTermFnToPaired(
      SEG('m1:para:d', 'The [[term:activation energy ([[i:E]][[sub:a]])|term-6]] x')
    );
    const wireOut = SEG('m1:para:d', 'The [[term]]virkjunarorka ([[i:E]][[sub:a]])[[/term]] x');
    const { text } = reattachIds(wireOut, segments);
    expect(text).toContain('[[term:virkjunarorka ([[i:E]][[sub:a]])|term-6]]');
  });

  it('degrades to original markers + records a mismatch when a paired marker is dropped', () => {
    const { segments } = stripTermFnToPaired(
      SEG('m1:para:e', 'A [[term:one|id1]] B [[term:two|id2]] C')
    );
    // simulate a dropped closing/opening: only ONE paired term survives
    const wireOut = SEG('m1:para:e', 'Á [[term]]einn[[/term]] B tveir C');
    const { text, mismatches } = reattachIds(wireOut, segments);
    // segment falls back to ORIGINAL (English, valid markers, correct ids)
    expect(text).toContain('[[term:one|id1]]');
    expect(text).toContain('[[term:two|id2]]');
    expect(mismatches).toEqual([{ segId: 'm1:para:e', type: 'term', expected: 2, got: 1 }]);
  });
});
