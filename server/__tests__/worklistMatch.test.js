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

  // §C244 T1d: an empty list finds nothing (an `every`-style refactor would find everything).
  it('finds nothing for an empty word list', () => {
    expect(findWholeWord('ker og kerið', [], ci)).toBeNull();
  });

  // §C244 T1a: after a match that is not a whole word, the search restarts one UTF-16 unit on,
  // which for a letter outside the BMP is between the halves of its surrogate pair. Under the `u`
  // flag the next exec simply carries on from there; it neither loops on the same match nor
  // misses the next one. Measured 2026-11-26 in Node 22.
  it('restarts safely inside a surrogate pair after a match that is not a whole word', () => {
    const alpha = '\u{1D6FC}'; // MATHEMATICAL ITALIC SMALL ALPHA: a letter, two UTF-16 units
    const text = alpha + alpha + ' ' + alpha;
    expect(findWholeWord(text, [alpha], { exactCase: true })).toEqual({ index: 5, length: 2 });
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

  // §C244 T1d
  it('an empty form list has no hit', () => {
    expect(englishHit('A salt bridge forms', [])).toBeNull();
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

describe('matchSegment, new word (§C244 M8)', () => {
  const words = { english: ['zcell'], oldForms: ['zker'], newIcelandic: 'galvanískt zker' };

  it('matchSegment skips a segment that also holds the new Icelandic', () => {
    const en = 'A zcell.';
    expect(matchSegment({ enContent: en, isContent: 'Eitt galvanískt zker.' }, words)).toBeNull();
    expect(matchSegment({ enContent: en, isContent: 'Eitt zker.' }, words)).toMatchObject({
      english: 'zcell',
    });
  });

  it('a new word in another case still skips the segment', () => {
    expect(
      matchSegment({ enContent: 'A zcell.', isContent: 'Eitt Galvanískt Zker.' }, words)
    ).toBeNull();
  });

  // §C244 M8c: the rule looks at the whole segment, not at the old word's neighbourhood, so a
  // segment holding the new word in one sentence and the old, unfixed word in another is skipped
  // too (the M8 ruling accepts this). Route fixture p4 covers it; this names it. The unfixed
  // sentence comes FIRST, so the earliest old word lies outside the new word.
  it('a new word in one sentence skips the segment even where another sentence keeps the old word', () => {
    expect(
      matchSegment(
        { enContent: 'A zcell. Another zcell.', isContent: 'Eitt zker hér. Galvanískt zker þar.' },
        words
      )
    ).toBeNull();
  });

  it('a null or absent new Icelandic never skips', () => {
    const seg = { enContent: 'A zcell.', isContent: 'Eitt galvanískt zker.' };
    expect(matchSegment(seg, { ...words, newIcelandic: null })).not.toBeNull();
    expect(matchSegment(seg, { english: words.english, oldForms: words.oldForms })).not.toBeNull();
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
