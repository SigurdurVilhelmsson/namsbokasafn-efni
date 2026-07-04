import { describe, it, expect } from 'vitest';
import {
  bucketToken,
  DEFAULT_STOPLIST,
  collectMathTokens,
  decodeEntities,
  aggregate,
  mergeSkeleton,
  validateValue,
  validateMap,
} from '../lib/math-label-inventory.js';

describe('bucketToken', () => {
  it('routes lowercase words (incl. mol) to label bucket', () => {
    for (const t of ['rate', 'surr', 'and', 'vap', 'mol', 'cell']) {
      expect(bucketToken(t)).toBe('label');
    }
  });
  it('routes formulae, units, operators, short/var tokens to other', () => {
    for (const t of ['atm', 'MnO', 'HCl', 'pOH', 'kPa', 'kJ', '−', 'k', 'aq', 'log']) {
      expect(bucketToken(t)).toBe('other');
    }
  });
  it('mol is not in the default stoplist', () => {
    expect(DEFAULT_STOPLIST.has('mol')).toBe(false);
  });
});

describe('collectMathTokens', () => {
  const cnxml = `
    <para>text before math</para>
    <m:math><m:mrow><m:mi>q</m:mi><m:msub><m:mtext>H</m:mtext></m:msub>
      <m:mtext>vap</m:mtext></m:mrow></m:math>
    <m:math><m:mtext>rate</m:mtext></m:math>`;

  it('pulls every mtext/mi occurrence', () => {
    const toks = collectMathTokens(cnxml).map((t) => t.text);
    expect(toks).toEqual(['q', 'H', 'vap', 'rate']);
  });
  it('gives each token the enclosing expression as context', () => {
    const vap = collectMathTokens(cnxml).find((t) => t.text === 'vap');
    expect(vap.context).toBe('q H vap');
  });
  it('ignores non-math text', () => {
    const toks = collectMathTokens(cnxml).map((t) => t.text);
    expect(toks).not.toContain('text');
  });
  it('decodes entities in token content', () => {
    expect(decodeEntities('&#8722;')).toBe('−');
    expect(decodeEntities('a&amp;b')).toBe('a&b');
  });
});

describe('aggregate', () => {
  const toks = [
    { text: 'rate', context: 'rate a' },
    { text: 'rate', context: 'rate b' },
    { text: 'mol', context: 'n mol' },
    { text: 'atm', context: 'P atm' },
    { text: 'MnO', context: 'MnO' },
  ];
  it('counts occurrences and buckets labels vs others', () => {
    const { labels, others } = aggregate(toks);
    expect(labels.get('rate').count).toBe(2);
    expect(labels.get('mol').count).toBe(1);
    expect(labels.has('atm')).toBe(false);
    expect(others.has('atm')).toBe(true);
    expect(others.has('MnO')).toBe(true);
  });
  it('keeps the first-seen context', () => {
    const { labels } = aggregate(toks);
    expect(labels.get('rate').context).toBe('rate a');
  });
});

describe('mergeSkeleton', () => {
  const labels = new Map([
    ['rate', { count: 2, context: 'rate' }],
    ['cell', { count: 1, context: 'E cell' }],
  ]);
  it('adds new keys empty and preserves filled values', () => {
    const { merged, addedKeys } = mergeSkeleton({ rate: 'hraði' }, labels);
    expect(merged).toEqual({ rate: 'hraði', cell: '' });
    expect(addedKeys).toEqual(['cell']);
  });
  it('keeps and reports keys absent from discovery (never deletes)', () => {
    const { merged, orphanKeys } = mergeSkeleton({ aq: 'vökvi' }, labels);
    expect(merged.aq).toBe('vökvi');
    expect(orphanKeys).toEqual(['aq']);
  });
});

describe('validateValue', () => {
  it('accepts a short Icelandic value and a self-map', () => {
    expect(validateValue('hraði')).toBeNull(); // 5 code points
    expect(validateValue('surr')).toBeNull(); // self-map keeps English
  });
  it('rejects empty, too-long, whitespace, and XML-special', () => {
    expect(validateValue('')).toMatch(/empty/);
    expect(validateValue('bakskaut')).toMatch(/> 6/); // 8 chars
    expect(validateValue('a b')).toMatch(/whitespace/);
    expect(validateValue('x<')).toMatch(/forbidden/);
  });
  it('counts Icelandic letters as single code points (þ, ð, æ, ö ok up to 6)', () => {
    expect(validateValue('þðæösý')).toBeNull(); // 6 code points, allowed
  });
});

describe('validateMap', () => {
  it('returns one entry per violating key', () => {
    const v = validateMap({ rate: 'hraði', surr: '', cathode: 'bakskaut' });
    expect(v.map((x) => x.key).sort()).toEqual(['cathode', 'surr']);
  });
});
