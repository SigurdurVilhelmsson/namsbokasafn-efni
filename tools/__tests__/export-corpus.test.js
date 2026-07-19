import { describe, it, expect } from 'vitest';
import { corpusCleanText, splitSegId, computePostEdited, buildRow } from '../export-corpus.js';

describe('corpusCleanText', () => {
  it('strips TM markers and decodes lb/rb escapes to literal brackets', () => {
    expect(corpusCleanText('pH [[lb:]]H[[sub:3]]O[[sup:+]][[rb:]]')).toBe('pH [H3O+]');
  });

  it('keeps MATH and MEDIA placeholders verbatim', () => {
    expect(corpusCleanText('See [[MATH:2]] and [[MEDIA:1]]')).toBe(
      'See [[MATH:2]] and [[MEDIA:1]]'
    );
  });

  it('decodes lb/rb LAST so restored brackets never form new markers', () => {
    // Literal source text "[[i:x]]" arrives bracket-escaped; the restored
    // brackets must NOT be re-parsed and stripped as an [[i:]] marker.
    expect(corpusCleanText('[[lb:]][[lb:]]i:x]]')).toBe('[[i:x]]');
  });

  it('leaves single-char legacy markers alone (TM ambiguity rationale)', () => {
    expect(corpusCleanText('H~2~O og *Macro* og __efnafræði__')).toBe(
      'H~2~O og *Macro* og __efnafræði__'
    );
  });
});

describe('splitSegId', () => {
  it('splits a 3-part id', () => {
    expect(splitSegId('m68664:para:fs-idm183676832')).toEqual({
      moduleId: 'm68664',
      segmentType: 'para',
      elementId: 'fs-idm183676832',
    });
  });

  it('tolerates short ids with nulls', () => {
    expect(splitSegId('chapter-title')).toEqual({
      moduleId: 'chapter-title',
      segmentType: null,
      elementId: null,
    });
  });
});

describe('computePostEdited', () => {
  it('is false when faithful equals the normalized MT view (untouched segment)', () => {
    // MT carries a hard wrap + malstadur backslash escapes; the faithful file
    // holds the editor-visible normalization of the same text — no human edit.
    const en = 'Water is a [[i:solid]].';
    const mt = 'Vatn er\n\\[\\[MATH:1\\]\\] fast efni.';
    const faithful = 'Vatn er [[MATH:1]] fast efni.';
    expect(computePostEdited(en, mt, faithful)).toBe(false);
  });

  it('applies the EN-aware term-marker repair before comparing', () => {
    // EN has __term__; MT came back with ** (malstadur artifact). The editor
    // view converts ** back to __ — faithful saved from that view must NOT
    // read as a human edit.
    const en = 'A __mole__ is a unit.';
    const mt = 'Eitt **mól** er eining.';
    const faithful = 'Eitt __mól__ er eining.';
    expect(computePostEdited(en, mt, faithful)).toBe(false);
  });

  it('is true for a real edit', () => {
    expect(computePostEdited('Water.', 'Vatn.', 'Vatnið.')).toBe(true);
  });

  it('is null when either IS tier is missing', () => {
    expect(computePostEdited('Water.', null, 'Vatn.')).toBeNull();
    expect(computePostEdited('Water.', 'Vatn.', null)).toBeNull();
  });
});

describe('buildRow', () => {
  it('emits the frozen field order, raw+clean tiers, and null for absent tiers', () => {
    const row = buildRow({
      id: 'm1:para:p1',
      book: 'efnafraedi-2e',
      chapter: '1',
      module: 'm1',
      licence: 'CC BY 4.0',
      en: 'Water is [[i:wet]].',
      mt: 'Vatn er [[i:blautt]].',
      faithful: null,
      localized: null,
    });
    expect(Object.keys(row)).toEqual([
      'id',
      'book',
      'chapter',
      'module',
      'type',
      'elementId',
      'licence',
      'en',
      'mt',
      'faithful',
      'localized',
      'postEdited',
    ]);
    expect(row.type).toBe('para');
    expect(row.elementId).toBe('p1');
    expect(row.en).toEqual({ raw: 'Water is [[i:wet]].', clean: 'Water is wet.' });
    expect(row.mt.clean).toBe('Vatn er blautt.');
    expect(row.faithful).toBeNull();
    expect(row.localized).toBeNull();
    expect(row.postEdited).toBeNull();
  });
});
