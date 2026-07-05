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
    const m = buildGlossaryMap(g);
    expect(m.get('rate')).toBe('hraði');
    expect(m.has('sub')).toBe(false);
    expect(m.has('cell')).toBe(false);
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
