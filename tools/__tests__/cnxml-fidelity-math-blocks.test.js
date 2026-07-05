import { describe, it, expect } from 'vitest';
import { extractMathBlocks, compareMathBlocks } from '../cnxml-fidelity-check.js';
import { buildResolver } from '../lib/math-label-substitute.js';

const resolve = buildResolver({ overlay: { rate: 'hraði' }, glossaryMap: new Map() });

describe('extractMathBlocks', () => {
  it('returns each <m:math> block in document order', () => {
    const cnxml = '<p><m:math><m:mi>a</m:mi></m:math> x <m:math><m:mi>b</m:mi></m:math></p>';
    expect(extractMathBlocks(cnxml)).toEqual([
      '<m:math><m:mi>a</m:mi></m:math>',
      '<m:math><m:mi>b</m:mi></m:math>',
    ]);
  });
});

describe('compareMathBlocks', () => {
  it('matches when translated == substituted source', () => {
    const source = '<m:math><m:mi>rate</m:mi></m:math>';
    const translated = '<m:math><m:mi>hraði</m:mi></m:math>';
    const r = compareMathBlocks(source, translated, resolve);
    expect(r.ok).toBe(true);
    expect(r.mismatched).toBe(0);
  });
  it('flags a corrupted translated block', () => {
    const source = '<m:math><m:mrow><m:mi>rate</m:mi></m:mrow></m:math>';
    const translated = '<m:math><m:mi>hraði</m:mi></m:math>'; // lost <m:mrow>
    expect(compareMathBlocks(source, translated, resolve).ok).toBe(false);
  });
  it('flags a stale (still-English) translated block — the pre-WS5 warn case', () => {
    const source = '<m:math><m:mi>rate</m:mi></m:math>';
    const translated = '<m:math><m:mi>rate</m:mi></m:math>'; // never re-injected
    expect(compareMathBlocks(source, translated, resolve).ok).toBe(false);
  });
  it('flags a block-count mismatch', () => {
    const source = '<m:math><m:mi>a</m:mi></m:math><m:math><m:mi>b</m:mi></m:math>';
    const translated = '<m:math><m:mi>a</m:mi></m:math>';
    expect(compareMathBlocks(source, translated, resolve).mismatched).toBe(1);
  });
});
