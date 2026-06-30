import { describe, it, expect } from 'vitest';
import { restoreSupersubMarkers } from '../cnxml-inject.js';

// A segment whose IS has an excess legacy ^...^ sup vs EN — the mutate path would strip it.
function fixtures() {
  const en = new Map([['m1:para:a', 'water H2O']]);
  const is = new Map([['m1:para:a', 'vatn H^2^O^extra^']]);
  return { en, is };
}

describe('restore under mutate vs warn (B2 routing contract)', () => {
  it('mutate policy: running on the real map changes it', () => {
    const { en, is } = fixtures();
    const before = is.get('m1:para:a');
    restoreSupersubMarkers(is, en); // mutate path runs on real segments
    expect(is.get('m1:para:a')).not.toBe(before); // excess sup stripped
  });

  it('warn policy: running on a clone leaves the real map untouched', () => {
    const { en, is } = fixtures();
    const before = is.get('m1:para:a');
    const clone = new Map(is);
    const { supStripped } = restoreSupersubMarkers(clone, en); // warn path uses a clone
    expect(supStripped).toBeGreaterThan(0); // detector still reports
    expect(is.get('m1:para:a')).toBe(before); // real segments unchanged
  });
});
