import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { decimalSeparatorWarnings, captionDivergence } = require('../lib/figure-consistency.cjs');

describe('decimalSeparatorWarnings', () => {
  it('flags a decimal point and suggests the Icelandic comma', () => {
    const w = decimalSeparatorWarnings({ k: '373.15 K' });
    expect(w).toHaveLength(1);
    expect(w[0].suggested).toBe('373,15 K');
  });
  it('does NOT flag a thousands group — the separators invert and a blind swap is wrong', () => {
    expect(decimalSeparatorWarnings({ k: '1,000 g' })).toEqual([]);
  });
  it('does not flag an integer', () => {
    expect(decimalSeparatorWarnings({ k: '212 °F' })).toEqual([]);
  });
  it('does not flag prose containing a full stop', () => {
    expect(decimalSeparatorWarnings({ k: 'Suðumark vatns.' })).toEqual([]);
  });
});

describe('captionDivergence', () => {
  const caption = 'Fahrenheit-, Celsíus- og kelvinhitakvarðarnir eru bornir saman.';
  it('flags a figure word whose near-variant appears in the caption', () => {
    const d = captionDivergence({ c: 'Selsíus' }, caption);
    expect(d).toHaveLength(1);
    expect(d[0].note).toContain('Celsíus');
  });
  it('is silent when the figure agrees with the caption', () => {
    expect(captionDivergence({ c: 'Celsíus' }, caption)).toEqual([]);
  });
  it('is silent — not wrong — when there is no reference text at all', () => {
    expect(captionDivergence({ c: 'Selsíus' }, '')).toEqual([]);
  });
  it('does not flag the same word differing only by sentence-initial capitalisation', () => {
    expect(captionDivergence({ c: 'efni' }, 'Efni er notað í tilraun.')).toEqual([]);
  });
  it('CONTROL: still flags the real divergence once case is normalised', () => {
    const d = captionDivergence({ c: 'Selsíus' }, caption);
    expect(d).toHaveLength(1);
    expect(d[0].note).toContain('Celsíus');
  });
});
