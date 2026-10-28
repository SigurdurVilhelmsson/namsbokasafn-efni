/**
 * The shared occurrence-key helper in `tools/lib/seg-markers.cjs` (`occurrenceKey`,
 * `withOccurrences`), added for the AI-reviewed layer (spec 2026-10-26, Unit A).
 *
 * 🔴 THE KEY FORM IS AN IDENTITY CLAIM, AND AN IDENTITY CLAIM THAT NOTHING CROSS-CHECKS IS
 * WORTH NOTHING (remt-checks-mt.js shipped a 1-based copy once and every test passed). So the
 * form is pinned here against the instrument that already mints it — `api-translate.js`'s
 * `bracketMarkerDeltaBySegment`, whose `unpairedSegIds` carry the keys of its private
 * `buildOccurrenceMap` — not only against literals.
 */
import { describe, it, expect } from 'vitest';
import segMarkers from '../lib/seg-markers.cjs';
import { bracketMarkerDeltaBySegment } from '../api-translate.js';

const { occurrenceKey, withOccurrences, parseSegmentRecords } = segMarkers;

const ID = 'm1:para:p1';
const seg = (id, text) => `<!-- SEG:${id} -->\n${text}\n\n`;

describe('occurrenceKey — the bare id for occurrence 0, id#k for k ≥ 1', () => {
  it('occurrence 0 is the bare segment id', () => {
    expect(occurrenceKey(ID, 0)).toBe(ID);
  });
  it('occurrence 1 is id#1 (0-based on occurrences, not 1-based on repeats)', () => {
    expect(occurrenceKey(ID, 1)).toBe(`${ID}#1`);
  });
  it('occurrence 2 is id#2', () => {
    expect(occurrenceKey(ID, 2)).toBe(`${ID}#2`);
  });
  it('refuses a negative occurrence', () => {
    expect(() => occurrenceKey(ID, -1)).toThrow(/occurrence/);
  });
  it('refuses a non-integer occurrence', () => {
    expect(() => occurrenceKey(ID, 1.5)).toThrow(/occurrence/);
  });
  it('refuses a string occurrence', () => {
    expect(() => occurrenceKey(ID, '1')).toThrow(/occurrence/);
  });
  it('refuses an empty segment id', () => {
    expect(() => occurrenceKey('', 0)).toThrow(/segment id/);
  });
  it('refuses a segment id holding "#", which would make the key ambiguous', () => {
    expect(() => occurrenceKey('m1:para:a#1', 0)).toThrow(/#/);
  });
});

describe('withOccurrences — ordinal among markers with the same FULL segment id', () => {
  const text = seg(ID, 'One') + seg('m1:para:p2', 'Two') + seg(ID, 'Three') + seg(ID, 'Four');
  const records = parseSegmentRecords(text);
  const out = withOccurrences(records);

  it('numbers each id independently, in file order', () => {
    expect(out.map((r) => r.occurrence)).toEqual([0, 0, 1, 2]);
  });
  it('mints the keys with occurrenceKey', () => {
    expect(out.map((r) => r.key)).toEqual([ID, 'm1:para:p2', `${ID}#1`, `${ID}#2`]);
  });
  it('keeps every field the record already had', () => {
    expect(out[2]).toMatchObject({ segmentId: ID, segmentType: 'para', content: 'Three' });
  });
  it('returns new objects and leaves its input untouched', () => {
    expect(records.some((r) => 'occurrence' in r || 'key' in r)).toBe(false);
  });
  it('a differently-typed id with the same element id is a different id', () => {
    const t = seg('m1:para:x', 'a') + seg('m1:title:x', 'b');
    expect(withOccurrences(parseSegmentRecords(t)).map((r) => r.key)).toEqual([
      'm1:para:x',
      'm1:title:x',
    ]);
  });
});

describe('cross-check: the keys api-translate already mints (bracketMarkerDeltaBySegment)', () => {
  it('a missing 2nd and 3rd occurrence are reported under the keys withOccurrences mints', () => {
    const input = seg(ID, 'a') + seg(ID, 'b') + seg(ID, 'c');
    const output = seg(ID, 'a');
    const theirs = bracketMarkerDeltaBySegment(input, output).unpairedSegIds;
    const ours = withOccurrences(parseSegmentRecords(input))
      .slice(1)
      .map((r) => r.key);
    expect(theirs).toEqual(ours);
  });
  it('control: with all occurrences present nothing is unpaired', () => {
    const input = seg(ID, 'a') + seg(ID, 'b');
    expect(bracketMarkerDeltaBySegment(input, input).unpairedSegIds).toEqual([]);
  });
});
