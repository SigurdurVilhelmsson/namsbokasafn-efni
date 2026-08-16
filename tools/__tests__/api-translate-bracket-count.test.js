import { describe, it, expect } from 'vitest';
import {
  countBracketMarkers,
  bracketMarkerDelta,
  formatBracketDelta,
  countBracketMarkersAll,
  bracketMarkerDeltaBySegment,
} from '../api-translate.js';

describe('countBracketMarkers', () => {
  it('tallies each inline bracket type, including nested and payload-bearing', () => {
    const t =
      'A [[i:x]] and [[sub:2]] and [[link:t|http://e]] and [[term:mól|term-1]] and [[i:[[sub:g]]]]';
    const c = countBracketMarkers(t);
    expect(c.i).toBe(2); // [[i:x]] and the outer [[i:[[sub:g]]]]
    expect(c.sub).toBe(2); // [[sub:2]] and the nested [[sub:g]]
    expect(c.link).toBe(1);
    expect(c.term).toBe(1);
    expect(c.b).toBe(0);
  });

  // Final review m6 (widened): the opaque/escape marker family introduced
  // for os-embed exercise fields (item 9/D3, tools/lib/exercise-html.js)
  // rides the same [[type:…]] bracket dialect through the MT API — the B3
  // producer-side delta report should cover them too, not just the
  // long-standing prose inline markers.
  it('tallies the opaque/escape marker family (MEDIA, lb, rb)', () => {
    const t = 'before [[MEDIA:0]] middle [[lb:]]x[[rb:]] after [[MEDIA:1]]';
    const c = countBracketMarkers(t);
    expect(c.MEDIA).toBe(2);
    expect(c.lb).toBe(1);
    expect(c.rb).toBe(1);
  });
});

describe('bracketMarkerDelta', () => {
  it('reports only types whose output count differs from input', () => {
    const input = 'x [[i:a]] [[i:b]] [[link:t|u]]';
    const output = 'x [[i:a]]'; // dropped one [[i:]] and the [[link:]]
    expect(bracketMarkerDelta(input, output)).toEqual({ i: -1, link: -1 });
  });

  it('is empty for a clean round-trip', () => {
    const s = 'x [[i:a]] [[sub:2]]';
    expect(bracketMarkerDelta(s, s)).toEqual({});
  });
});

describe('formatBracketDelta', () => {
  it('renders a one-line note for a non-empty delta', () => {
    expect(formatBracketDelta('m66438', { link: -1, i: -2 })).toBe(
      'm66438: bracket-marker delta (output vs input) — link -1, i -2'
    );
  });
  it('returns null for an empty delta', () => {
    expect(formatBracketDelta('m1', {})).toBeNull();
  });
});

describe('countBracketMarkersAll — the six types the 14-type set omits', () => {
  it('counts MATH, TABLE, SPACE, BR, math and EQ', () => {
    const c = countBracketMarkersAll(
      '[[MATH:1]] [[TABLE:2]] [[SPACE:3]] [[BR:4]] [[math:5]] [[EQ:6]]'
    );
    expect(c.MATH).toBe(1);
    expect(c.TABLE).toBe(1);
    expect(c.SPACE).toBe(1);
    expect(c.BR).toBe(1);
    expect(c.math).toBe(1);
    expect(c.EQ).toBe(1);
  });

  it('still counts the original 14', () => {
    expect(countBracketMarkersAll('[[i:x]] [[sub:2]]')).toMatchObject({ i: 1, sub: 1 });
  });
});

describe('bracketMarkerDeltaBySegment — per segment, so losses cannot cancel', () => {
  const EN = [
    '<!-- SEG:m1:para:p1 -->',
    'A [[i:first]] and a [[i:second]].',
    '',
    '<!-- SEG:m1:para:p2 -->',
    'Plain text.',
    '',
  ].join('\n');

  it('reports {} when nothing changed', () => {
    const r = bracketMarkerDeltaBySegment(EN, EN);
    expect(r.total).toEqual({});
    expect(r.segmentsWithDelta).toBe(0);
    expect(r.segmentsExamined).toBe(2);
  });

  it('catches a loss and an invention that cancel at module level', () => {
    // p1 loses one [[i:]], p2 gains one. The MODULE-level delta is zero.
    const IS = [
      '<!-- SEG:m1:para:p1 -->',
      'Eitt [[i:fyrsta]] og annað.',
      '',
      '<!-- SEG:m1:para:p2 -->',
      'Venjulegur [[i:texti]].',
      '',
    ].join('\n');
    const r = bracketMarkerDeltaBySegment(EN, IS);
    expect(r.total).toEqual({});
    expect(r.segmentsWithDelta).toBe(2);
    expect(r.bySegment['m1:para:p1']).toEqual({ i: -1 });
    expect(r.bySegment['m1:para:p2']).toEqual({ i: 1 });
  });

  it('catches a MATH loss the 14-type instrument cannot see', () => {
    const en = '<!-- SEG:m1:para:p1 -->\n[[MATH:1]] and [[MATH:2]].\n';
    const is = '<!-- SEG:m1:para:p1 -->\n[[MATH:1]] og.\n';
    expect(bracketMarkerDeltaBySegment(en, is).bySegment['m1:para:p1']).toEqual({ MATH: -1 });
  });

  it('reports a segment present in one side and not the other', () => {
    const is = '<!-- SEG:m1:para:p1 -->\nEitt [[i:fyrsta]] og [[i:annað]].\n';
    const r = bracketMarkerDeltaBySegment(EN, is);
    expect(r.unpairedSegIds).toEqual(['m1:para:p2']);
  });

  it('reports the number of units it examined even when clean', () => {
    // §C60: a check reported `Total findings: 0` while reading zero files.
    const r = bracketMarkerDeltaBySegment('', '');
    expect(r.segmentsExamined).toBe(0);
    expect(r.segmentsWithDelta).toBe(0);
  });

  // Fix round 1: parseSegmentsMap's default `duplicates: 'first'` silently
  // dropped every occurrence of a duplicated raw seg-id but the first, on
  // BOTH sides — a delta confined to a non-first occurrence was invisible,
  // and segmentsExamined undercounted. Verified red against the originally
  // shipped code (commit 10c8b208, which used parseSegmentsMap) before the
  // fix: both cases below returned a false-clean result.
  it('a duplicated seg-id whose SECOND occurrence loses a marker is still caught, keyed segId#1', () => {
    const en = [
      '<!-- SEG:m1:para:p1 -->',
      'First occurrence [[i:a]].',
      '',
      '<!-- SEG:m1:para:p1 -->',
      'Second occurrence [[i:b]] and [[i:c]].',
      '',
    ].join('\n');
    const is = [
      '<!-- SEG:m1:para:p1 -->',
      'Fyrsta tilvik [[i:a]].',
      '',
      '<!-- SEG:m1:para:p1 -->',
      'Annað tilvik [[i:b]].', // dropped [[i:c]] — the SECOND occurrence's loss
      '',
    ].join('\n');
    const r = bracketMarkerDeltaBySegment(en, is);
    expect(r.segmentsExamined).toBe(2);
    expect(r.segmentsWithDelta).toBe(1);
    expect(r.bySegment['m1:para:p1#1']).toEqual({ i: -1 });
    expect(r.bySegment['m1:para:p1']).toBeUndefined(); // first occurrence is clean
    expect(r.total).toEqual({ i: -1 });
    expect(r.unpairedSegIds).toEqual([]);
  });

  it('2 raw EN occurrences of an id against 1 raw IS occurrence reports the missing one, keyed segId#1', () => {
    const en = [
      '<!-- SEG:m1:para:p1 -->',
      'First.',
      '',
      '<!-- SEG:m1:para:p1 -->',
      'Second.',
      '',
    ].join('\n');
    const is = ['<!-- SEG:m1:para:p1 -->', 'Fyrsta.', ''].join('\n'); // only one occurrence
    const r = bracketMarkerDeltaBySegment(en, is);
    expect(r.segmentsExamined).toBe(2);
    expect(r.unpairedSegIds).toEqual(['m1:para:p1#1']);
  });
});
