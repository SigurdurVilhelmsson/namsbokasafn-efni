// tools/__tests__/math-label-substitute.test.js
import { describe, it, expect } from 'vitest';
import {
  buildGlossaryMap,
  resolveLabel,
  buildResolver,
  substituteMathLabels,
  reportMathLabels,
} from '../lib/math-label-substitute.js';

describe('buildGlossaryMap', () => {
  it('keeps only approved terms with non-empty Icelandic, keyed lowercase', () => {
    const g = {
      terms: [
        { english: 'Rate', icelandic: 'hraði', status: 'approved' },
        { english: 'sub', icelandic: '', status: 'approved' }, // empty → dropped
        { english: 'cell', icelandic: 'ker', status: 'pending' }, // not approved → dropped
      ],
    };
    const { map } = buildGlossaryMap(g);
    expect(map.get('rate')).toBe('hraði');
    expect(map.has('sub')).toBe(false);
    expect(map.has('cell')).toBe(false);
  });

  it('reports a competition instead of resolving it silently (C18)', () => {
    const g = {
      terms: [
        { english: 'atom', icelandic: 'frumeind', status: 'approved' },
        { english: 'atom', icelandic: 'atóm', status: 'approved' },
      ],
    };
    const { collisions } = buildGlossaryMap(g);
    expect(collisions.competitions).toHaveLength(1);
    expect(collisions.competitions[0].candidates).toEqual(['frumeind', 'atóm']);
  });

  // BYTE-NEUTRALITY. This PR must not change a single rendered byte, so the
  // Map must keep resolving to the LAST qualifying entry exactly as before.
  // Stated as "last wins" rather than "same as before the change" because the
  // latter is untestable — it collapses to hardcoding the value.
  it('still resolves to the LAST qualifying entry (byte-neutral)', () => {
    const g = {
      terms: [
        { english: 'atom', icelandic: 'frumeind', status: 'approved' },
        { english: 'atom', icelandic: 'atóm', status: 'approved' },
      ],
    };
    const { map } = buildGlossaryMap(g);
    expect(map.get('atom')).toBe('atóm');
  });

  // The report must not be able to drift from the Map it describes. Asserting
  // them independently would let a confidently-wrong report ship green.
  it('chosen equals what the map actually returns', () => {
    const g = {
      terms: [
        { english: 'group', icelandic: 'flokkur', status: 'approved' },
        { english: 'group', icelandic: 'hópur', status: 'approved' },
      ],
    };
    const { map, collisions } = buildGlossaryMap(g);
    expect(collisions.competitions[0].chosen).toBe(map.get('group'));
  });
});

describe('resolveLabel precedence', () => {
  const glossaryMap = new Map([['dep', 'útfelling']]);
  it('overlay Icelandic wins', () => {
    expect(resolveLabel('rate', { overlay: { rate: 'hraði' }, glossaryMap })).toEqual({
      value: 'hraði',
      source: 'overlay-translated',
    });
  });
  it('self-map → English, STOP (no glossary)', () => {
    expect(resolveLabel('ppm', { overlay: { ppm: 'ppm' }, glossaryMap })).toEqual({
      value: 'ppm',
      source: 'overlay-self',
    });
  });
  it('pending (empty) falls through to an approved glossary term', () => {
    expect(resolveLabel('dep', { overlay: { dep: '' }, glossaryMap })).toEqual({
      value: 'útfelling',
      source: 'glossary',
    });
  });
  it('pending with no glossary term keeps English', () => {
    expect(resolveLabel('tet', { overlay: { tet: '' }, glossaryMap })).toEqual({
      value: 'tet',
      source: 'english',
    });
  });
  it('absent key behaves as pending', () => {
    expect(resolveLabel('zzz', { overlay: {}, glossaryMap })).toEqual({
      value: 'zzz',
      source: 'english',
    });
  });
});

describe('substituteMathLabels', () => {
  const resolve = buildResolver({ overlay: { rate: 'hraði', ppm: 'ppm' }, glossaryMap: new Map() });
  it('replaces a bare exact-match label', () => {
    expect(substituteMathLabels('<m:mi>rate</m:mi>', resolve)).toBe('<m:mi>hraði</m:mi>');
  });
  it('leaves a multi-word phrase untouched (whole-node, not substring)', () => {
    const s = '<m:mtext>14.82 g carbon</m:mtext>';
    expect(substituteMathLabels(s, resolve)).toBe(s);
  });
  it('leaves a self-map/English label byte-identical', () => {
    expect(substituteMathLabels('<m:mtext>ppm</m:mtext>', resolve)).toBe('<m:mtext>ppm</m:mtext>');
  });
  it('does not match a node containing child elements', () => {
    const s = '<m:mtext><m:mi>rate</m:mi></m:mtext>';
    // inner has "<" so the outer node is not matched; the inner m:mi still is
    expect(substituteMathLabels(s, resolve)).toBe('<m:mtext><m:mi>hraði</m:mi></m:mtext>');
  });
  it('preserves surrounding whitespace inside the node', () => {
    expect(substituteMathLabels('<m:mtext>  rate  </m:mtext>', resolve)).toBe(
      '<m:mtext>  hraði  </m:mtext>'
    );
  });
  it('throws (OV-M2) if a resolved value carries a forbidden XML char', () => {
    const bad = buildResolver({ overlay: { rate: 'a<b' }, glossaryMap: new Map() });
    expect(() => substituteMathLabels('<m:mi>rate</m:mi>', bad)).toThrow(/forbidden/);
  });
  it('throws (OV-M2) on a self-map whose value carries a forbidden XML char', () => {
    const r = buildResolver({ overlay: { 'a"b': 'a"b' }, glossaryMap: new Map() });
    expect(() => substituteMathLabels('<m:mtext>a"b</m:mtext>', r)).toThrow(/forbidden/);
  });
  it('does not throw on english-passthrough text containing legal quotes/entities', () => {
    const r = buildResolver({ overlay: { rate: 'hraði' }, glossaryMap: new Map() });
    const s = '<m:mtext>"products" &amp; more</m:mtext>';
    expect(() => substituteMathLabels(s, r)).not.toThrow();
    expect(substituteMathLabels(s, r)).toBe(s);
  });
});

describe('resolveLabel — case + whitespace hardening', () => {
  const glossaryMap = new Map([['acid', 'sýra']]);
  it('#1 capitalized word falls back to the lowercase overlay key', () => {
    expect(resolveLabel('Rate', { overlay: { rate: 'hraði' }, glossaryMap })).toEqual({
      value: 'hraði',
      source: 'overlay-translated',
    });
  });
  it('#1 capitalized word falls back to the lowercased glossary key', () => {
    expect(resolveLabel('Acid', { overlay: {}, glossaryMap })).toEqual({
      value: 'sýra',
      source: 'glossary',
    });
  });
  it('#1 exact-case overlay key still wins over the lowercase fallback', () => {
    expect(
      resolveLabel('Rate', { overlay: { Rate: 'Hraði', rate: 'hraði' }, glossaryMap: new Map() })
    ).toEqual({ value: 'Hraði', source: 'overlay-translated' });
  });
  it('#1 a formula / short / mixed token is NOT case-folded', () => {
    // "NaCl" lowercases to "nacl" which is not a key → stays english (no false hit)
    expect(resolveLabel('NaCl', { overlay: { nacl: 'x' }, glossaryMap: new Map() })).toEqual({
      value: 'NaCl',
      source: 'english',
    });
  });
  it('#4 whitespace-only overlay value is pending (falls through), not a translation', () => {
    expect(resolveLabel('vap', { overlay: { vap: ' ' }, glossaryMap: new Map() })).toEqual({
      value: 'vap',
      source: 'english',
    });
  });
  it('#4 value equal to the key after trimming is a self-map', () => {
    expect(resolveLabel('amu', { overlay: { amu: 'amu ' }, glossaryMap: new Map() })).toEqual({
      value: 'amu',
      source: 'overlay-self',
    });
  });
  it('#4 a trailing space on a real translation is trimmed off the emitted value', () => {
    expect(resolveLabel('rate', { overlay: { rate: 'hraði ' }, glossaryMap: new Map() })).toEqual({
      value: 'hraði',
      source: 'overlay-translated',
    });
  });
});

describe('substituteMathLabels — entity-decoded matching (#5)', () => {
  const resolve = buildResolver({ overlay: { all: 'allur' }, glossaryMap: new Map() });
  it('matches a label whose node carries a trailing entity-encoded NBSP, preserving the entity', () => {
    expect(substituteMathLabels('<m:mtext>all&#x00A0;</m:mtext>', resolve)).toBe(
      '<m:mtext>allur&#x00A0;</m:mtext>'
    );
  });
  it('#4 whitespace-only overlay never blanks a label (pending → unchanged)', () => {
    const r = buildResolver({ overlay: { rate: ' ' }, glossaryMap: new Map() });
    expect(substituteMathLabels('<m:mtext>rate</m:mtext>', r)).toBe('<m:mtext>rate</m:mtext>');
  });
});

describe('reportMathLabels', () => {
  it('flags a bucket-1 label absent from the overlay as unmapped', () => {
    const resolve = buildResolver({ overlay: {}, glossaryMap: new Map() });
    const r = reportMathLabels('<m:math><m:mi>newlabel</m:mi></m:math>', resolve, { overlay: {} });
    expect(r.unmapped).toContain('newlabel');
  });
  it('advises when a glossary fill exceeds 6 chars in a subscript slot', () => {
    const overlay = { surr: '' };
    const glossaryMap = new Map([['surr', 'umhverfi']]); // 8 chars
    const resolve = buildResolver({ overlay, glossaryMap });
    const cnxml = '<m:math><m:msub><m:mi>q</m:mi><m:mtext>surr</m:mtext></m:msub></m:math>';
    const r = reportMathLabels(cnxml, resolve, { overlay });
    expect(r.longSubscriptFills).toEqual([{ token: 'surr', value: 'umhverfi', cp: 8 }]);
  });
  it('does not advise for a glossary fill in a non-subscript (inline) slot', () => {
    const overlay = { surr: '' };
    const glossaryMap = new Map([['surr', 'umhverfi']]);
    const resolve = buildResolver({ overlay, glossaryMap });
    const cnxml = '<m:math><m:mtext>surr</m:mtext></m:math>';
    const r = reportMathLabels(cnxml, resolve, { overlay });
    expect(r.longSubscriptFills).toEqual([]);
  });
});
