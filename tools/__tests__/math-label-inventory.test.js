import { describe, it, expect } from 'vitest';
import { bucketToken, DEFAULT_STOPLIST } from '../lib/math-label-inventory.js';

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
