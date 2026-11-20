import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { findWholeWord, englishHit, matchSegment, excerptOf } = require('../lib/worklistMatch');

const ci = { exactCase: false };

describe('findWholeWord', () => {
  it('does not find ker inside kerfi or kerspenna', () => {
    expect(findWholeWord('Í kerfinu og kerspennu', ['ker'], ci)).toBeNull();
  });

  it('folds case, Icelandic letters included', () => {
    expect(findWholeWord('Kerið er fullt', ['kerið'], ci)).toEqual({ index: 0, length: 5 });
  });

  it('folds uppercase Icelandic letters', () => {
    expect(findWholeWord('ÞRÝSTINGUR', ['þrýstingur'], ci)).toEqual({ index: 0, length: 10 });
  });

  it('treats a bracket marker as a boundary', () => {
    expect(findWholeWord('[[i:ker]] og', ['ker'], ci).index).toBe(4);
  });

  it('returns the earliest hit across words, the longer on a tie', () => {
    expect(findWholeWord('keri og ker', ['ker', 'keri'], ci)).toEqual({ index: 0, length: 4 });
  });

  it('tries overlapping candidates after a boundary failure', () => {
    expect(findWholeWord('kerker ker', ['ker'], ci)).toEqual({ index: 7, length: 3 });
  });

  it('skips empty words', () => {
    expect(findWholeWord('ker', ['', 'ker'], ci)).toEqual({ index: 0, length: 3 });
  });

  it('escapes regex metacharacters in a word', () => {
    expect(findWholeWord('a (b) c', ['(b)'], ci)).toEqual({ index: 2, length: 3 });
  });

  it('matches its own case only when exactCase is set', () => {
    expect(findWholeWord('si', ['SI'], { exactCase: true })).toBeNull();
  });
});

describe('englishHit', () => {
  it('a symbol-shaped form matches its own case only', () => {
    expect(englishHit('Si is silicon', ['SI'])).toBeNull();
  });

  it('a symbol-shaped form is found in its own case', () => {
    expect(englishHit('the SI unit', ['SI'])).toBe('SI');
  });

  it('a longer form folds case', () => {
    expect(englishHit('A Salt bridge forms', ['salt bridge'])).toBe('salt bridge');
  });
});

describe('matchSegment', () => {
  const words = { english: ['salt bridge'], oldForms: ['brú', 'brúar'] };

  it('is null when the English has no hit', () => {
    expect(matchSegment({ enContent: 'a bridge', isContent: 'brú' }, words)).toBeNull();
  });

  it('is null when the Icelandic has no hit', () => {
    expect(matchSegment({ enContent: 'a salt bridge', isContent: 'saltbrú' }, words)).toBeNull();
  });

  it('locates the Icelandic word when both sides hit', () => {
    expect(
      matchSegment({ enContent: 'a salt bridge', isContent: 'Þessi brú er sterk' }, words)
    ).toEqual({ english: 'salt bridge', index: 6, length: 3 });
  });
});

describe('excerptOf', () => {
  it('keeps the match offset and says where it cut', () => {
    const text = 'a'.repeat(150) + 'MATCH' + 'b'.repeat(145);
    const e = excerptOf(text, 150, 5);
    expect(e.text.slice(e.start, e.start + e.length)).toBe('MATCH');
    expect([e.cutBefore, e.cutAfter]).toEqual([true, true]);
  });

  it('returns the whole short text with no cuts', () => {
    const text = 'short text with ker!';
    const e = excerptOf(text, 16, 3);
    expect(e.text).toBe(text);
    expect([e.cutBefore, e.cutAfter]).toEqual([false, false]);
  });
});
