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

  it('degrades a cross-type nested term-inside-fn segment to original + records a nested mismatch', () => {
    // stripTermFnToPaired's bracket-balancing is generic across types, so a
    // [[term:]] whose text sits inside a [[fn:]] round-trips into nested paired
    // form: [[fn]]...[[term]]...[[/term]]...[[/fn]]. termSpans/fnSpans are NOT
    // mutually disjoint here — the naive count-guard would see 1==1 for both
    // types and silently splice, corrupting output.
    const raw = SEG(
      'm1:para:f',
      'The [[fn:this refers to [[term:activation energy|term-1]] concept|fs-1]] here.'
    );
    const { segments } = stripTermFnToPaired(raw);
    // simulate MT: translate the visible words, keep the paired delimiters
    const wireOut = SEG(
      'm1:para:f',
      'The [[fn]]þetta vísar til [[term]]virkjunarorka[[/term]] hugtak[[/fn]] here.'
    );
    const { text, mismatches } = reattachIds(wireOut, segments);
    // whole segment falls back to ORIGINAL (English, valid nested markers, correct ids)
    expect(text).toContain('[[fn:this refers to [[term:activation energy|term-1]] concept|fs-1]]');
    expect(text).not.toContain('[[term]]');
    expect(text).not.toContain('[[/term]]');
    expect(mismatches.length).toBeGreaterThan(0);
    expect(mismatches.some((m) => m.segId === 'm1:para:f' && m.type === 'nested')).toBe(true);
  });

  it('degrades a cross-type nested fn-inside-term segment to original + records a nested mismatch', () => {
    // symmetric case: a [[fn:]] whose text sits inside a [[term:]]
    const raw = SEG(
      'm1:para:g',
      'The [[term:activation energy [[fn:see note|fs-2]] concept|term-2]] here.'
    );
    const { segments } = stripTermFnToPaired(raw);
    const wireOut = SEG(
      'm1:para:g',
      'The [[term]]virkjunarorka [[fn]]sjá athugasemd[[/fn]] hugtak[[/term]] here.'
    );
    const { text, mismatches } = reattachIds(wireOut, segments);
    expect(text).toContain('[[term:activation energy [[fn:see note|fs-2]] concept|term-2]]');
    expect(text).not.toContain('[[fn]]');
    expect(text).not.toContain('[[/fn]]');
    expect(mismatches.length).toBeGreaterThan(0);
    expect(mismatches.some((m) => m.segId === 'm1:para:g' && m.type === 'nested')).toBe(true);
  });

  it('degrades the whole segment + records only the mismatching type when term matches but fn is dropped', () => {
    const { segments } = stripTermFnToPaired(
      SEG('m1:para:h', 'A [[term:one|id1]] B [[fn:note|fs-9]] C')
    );
    // term paired markers survive intact; fn paired markers are dropped entirely
    const wireOut = SEG('m1:para:h', 'Á [[term]]einn[[/term]] B minnispunktur C');
    const { text, mismatches } = reattachIds(wireOut, segments);
    // only the fn type mismatches — term alone would have counted OK
    expect(mismatches).toEqual([{ segId: 'm1:para:h', type: 'fn', expected: 1, got: 0 }]);
    // but the WHOLE segment degrades, including the otherwise-fine term
    expect(text).toContain('[[term:one|id1]]');
    expect(text).toContain('[[fn:note|fs-9]]');
  });
});

describe('translateChunk round-trip (mocked client)', () => {
  // import translateChunk lazily since it is not exported yet in Task 1/2
  it('sends paired form to the API and returns id-anchored translated markers', async () => {
    const { translateChunk } = await import('../api-translate.js');
    const seen = {};
    const fakeClient = {
      async translateAuto(text) {
        seen.text = text;
        // API translates the word between paired brackets, keeps delimiters + SEG
        const out = text.replace('[[term]]viscosity[[/term]]', '[[term]]seigja[[/term]]');
        return { text: out, usage: 1 };
      },
    };
    const chunk = '<!-- SEG:m1:para:a -->\nThe [[term:viscosity|term-00001]] of a liquid.\n';
    const res = await translateChunk(fakeClient, chunk, null, false, 'm1');
    expect(seen.text).toContain('[[term]]viscosity[[/term]]'); // API saw paired form
    expect(seen.text).not.toContain('[[term:'); // id did NOT ride the wire
    expect(res.text).toContain('[[term:seigja|term-00001]]'); // returned id-anchored + translated
    expect(res.mismatches).toEqual([]);
  });
});
