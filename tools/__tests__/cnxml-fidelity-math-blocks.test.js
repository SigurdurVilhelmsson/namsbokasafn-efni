import { describe, it, expect } from 'vitest';
import { extractMathBlocks, compareMathBlocks } from '../cnxml-fidelity-check.js';
import { buildResolver } from '../lib/math-label-substitute.js';

const resolve = buildResolver({ overlay: { rate: 'hraði' }, glossaryMap: new Map() });
const noop = buildResolver({ overlay: {}, glossaryMap: new Map() });

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
  it('#2 treats a numeric charref vs its literal as equal (xmldom DOM-emit normalization)', () => {
    const source = '<m:math><m:mtext>&#x394;H</m:mtext></m:math>';
    const translated = '<m:math><m:mtext>ΔH</m:mtext></m:math>';
    expect(compareMathBlocks(source, translated, noop).ok).toBe(true);
  });
  it('#2 treats a raw > vs &gt; as equal', () => {
    const source = '<m:math><m:mo>></m:mo></m:math>';
    const translated = '<m:math><m:mo>&gt;</m:mo></m:math>';
    expect(compareMathBlocks(source, translated, noop).ok).toBe(true);
  });
  it('#2 still flags a genuinely corrupted block', () => {
    const source = '<m:math><m:mrow><m:mi>a</m:mi></m:mrow></m:math>';
    const translated = '<m:math><m:mi>a</m:mi></m:math>';
    expect(compareMathBlocks(source, translated, noop).ok).toBe(false);
  });
});
