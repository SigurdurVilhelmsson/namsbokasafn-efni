import { describe, it, expect } from 'vitest';
import {
  bucketToken,
  DEFAULT_STOPLIST,
  collectMathTokens,
  decodeEntities,
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
