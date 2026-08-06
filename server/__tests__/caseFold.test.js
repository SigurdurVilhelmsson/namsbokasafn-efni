import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { foldString, foldChar } = require('../lib/caseFold');

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const iuEq = (a, b) => new RegExp(`^${esc(a)}$`, 'iu').test(b);

/** Closure of a code point under per-character toLowerCase/toUpperCase. */
function candidates(ch) {
  const seen = new Set([ch]);
  const queue = [ch];
  while (queue.length) {
    const c = queue.pop();
    for (const next of [c.toLowerCase(), c.toUpperCase()]) {
      if ([...next].length !== 1 || seen.has(next)) continue;
      seen.add(next);
      queue.push(next);
    }
  }
  return [...seen];
}

describe('caseFold', () => {
  it('is length-stable for every code point', () => {
    const bad = [];
    for (let cp = 0; cp <= 0x10ffff; cp++) {
      if (cp >= 0xd800 && cp <= 0xdfff) continue;
      const ch = String.fromCodePoint(cp);
      if (foldChar(ch).length !== ch.length) bad.push(cp.toString(16));
    }
    expect(bad).toEqual([]);
  });

  it('agrees with /iu on every code point and its case-closure', () => {
    // O(n) — NOT all pairs. Compare each code point only against its own
    // lower/upper closure, which is where every /iu equivalence lives.
    const bad = [];
    for (let cp = 0; cp <= 0x10ffff; cp++) {
      if (cp >= 0xd800 && cp <= 0xdfff) continue;
      const ch = String.fromCodePoint(cp);
      for (const other of candidates(ch)) {
        if (other === ch) continue;
        const foldSame = foldChar(ch) === foldChar(other);
        if (foldSame !== iuEq(ch, other)) {
          bad.push(`U+${cp.toString(16)} vs U+${other.codePointAt(0).toString(16)}`);
        }
      }
    }
    expect(bad).toEqual([]);
  });

  it('leaves U+0130 alone — the only length-changing lowercase in Unicode', () => {
    expect('İ'.toLowerCase().length).toBe(2); // the hazard
    expect(foldChar('İ')).toBe('İ'); // the guard
    expect(iuEq('İ', 'i')).toBe(false); // and /iu agrees
  });

  it('is context-free, so Final_Sigma cannot apply', () => {
    expect('ΟΣ'.toLowerCase()).toBe('ος'); // whole-string lowercase: wrong
    expect(foldString('ΟΣ')).toBe(foldString('οσ')); // per-char: right
    expect(/σ/iu.test('ΟΣ')).toBe(true); // and matches /iu
  });

  it('folds the documented divergent pairs', () => {
    for (const [a, b] of [
      ['µ', 'μ'], // MICRO SIGN vs GREEK SMALL MU
      ['ſ', 's'], // LONG S
      ['ς', 'σ'], // FINAL SIGMA vs SIGMA
      ['ϕ', 'φ'], // PHI SYMBOL vs PHI
    ]) {
      expect(foldChar(a)).toBe(foldChar(b));
    }
  });

  it('preserves indices, so automaton offsets map onto the original string', () => {
    const s = 'The MASS of the Sample';
    expect(foldString(s).length).toBe(s.length);
    expect(foldString(s).indexOf('mass')).toBe(s.indexOf('MASS'));
  });
});
