// server/__tests__/suggestionPlacement.test.js
//
// The placement rule (G1.23 spec §6.5, §7): where a suggestion group's changes land in the displayed
// text. One DOM-free file shared by the browser and the server.
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const P = require('../public/js/suggestion-placement');

const g = (key, ...changes) => ({
  key,
  changes: changes.map(([opId, find, replace], i) => ({ opId, find, replace, chainIndex: i })),
});
const TEXT =
  'Stundum er jafnvægi fyrir komplexjónir lýst með sundrunarföstum. Fyrir komplexjónina er';

describe('applyOnce', () => {
  it('replaces a find that occurs exactly once', () => {
    expect(P.applyOnce('a b c', 'b', 'X')).toBe('a X c');
  });
  it('returns null when the find occurs zero times', () => {
    expect(P.applyOnce('a b c', 'z', 'X')).toBeNull();
  });
  it('returns null when the find occurs twice', () => {
    expect(P.applyOnce('a b b', 'b', 'X')).toBeNull();
  });
});

describe('hasMarker / MARKER_TOKENS', () => {
  it('lists the marker tokens and is frozen', () => {
    expect([...P.MARKER_TOKENS]).toEqual(['[[', ']]', '**', '__', '<!--', '|']);
    expect(Object.isFrozen(P.MARKER_TOKENS)).toBe(true);
  });
  it('detects a token and passes plain text', () => {
    expect(P.hasMarker('a|b')).toBe(true);
    expect(P.hasMarker('plain text')).toBe(false);
  });
});

describe('placeGroup', () => {
  it('places a two-change group and reports both spans in the displayed text', () => {
    const r = P.placeGroup(
      TEXT,
      g('k', ['a', 'komplexjónir', 'flókajónir'], ['b', 'komplexjónina', 'flókajónina'])
    );
    expect(r.ok).toBe(true);
    expect(r.result).toBe(
      'Stundum er jafnvægi fyrir flókajónir lýst með sundrunarföstum. Fyrir flókajónina er'
    );
    expect(r.spans.map((s) => TEXT.slice(s.start, s.end))).toEqual([
      'komplexjónir',
      'komplexjónina',
    ]);
    expect(r.spans.map((s) => s.opId)).toEqual(['a', 'b']);
  });

  it('maps spans back through earlier length deltas (change 1 sits after a longer replace)', () => {
    const text = 'aa bb cc';
    const r = P.placeGroup(text, g('k', ['a', 'aa', 'aaaaaa'], ['b', 'cc', 'c']));
    expect(r.ok).toBe(true);
    expect(r.result).toBe('aaaaaa bb c');
    expect(r.spans.map((s) => text.slice(s.start, s.end))).toEqual(['aa', 'cc']);
  });

  it('accepts a dependent chain: the later find is unique only after the earlier change', () => {
    const text = 'x ab y b';
    // "b" occurs twice in text, once after 'ab' -> 'cd' is applied.
    const r = P.placeGroup(text, g('k', ['a', 'ab', 'cd'], ['b', 'b', 'Q']));
    expect(r.ok).toBe(true);
    expect(r.result).toBe('x cd y Q');
    expect(r.spans.map((s) => text.slice(s.start, s.end))).toEqual(['ab', 'b']);
    expect(r.spans[1].start).toBe(7);
  });

  it('reports overlap when a later find lies inside an earlier replace', () => {
    expect(P.placeGroup('x foo y', g('k', ['a', 'foo', 'barbaz'], ['b', 'baz', 'Q']))).toEqual({
      ok: false,
      reason: 'overlap',
    });
  });

  it('treats adjacent intervals as not overlapping (positive control for overlap)', () => {
    const r = P.placeGroup('x foo y', g('k', ['a', 'foo', 'bar'], ['b', ' y', ' Z']));
    expect(r.ok).toBe(true);
    expect(r.result).toBe('x bar Z');
  });

  it('reports not-unique when a find occurs twice, with a unique find in the same text succeeding', () => {
    expect(P.placeGroup('b and b', g('k', ['a', 'b', 'X']))).toEqual({
      ok: false,
      reason: 'not-unique',
    });
    expect(P.placeGroup('b and c', g('k', ['a', 'b', 'X'])).ok).toBe(true);
  });

  it('reports not-unique when a find is absent', () => {
    expect(P.placeGroup('abc', g('k', ['a', 'zzz', 'X']))).toEqual({
      ok: false,
      reason: 'not-unique',
    });
  });

  it('refuses a change carrying a marker token', () => {
    expect(P.placeGroup('a [[b]] c', g('m', ['z', '[[b]]', 'd']))).toEqual({
      ok: false,
      reason: 'marker',
    });
  });

  it('refuses a marker in the replace, and checks markers before uniqueness', () => {
    expect(P.placeGroup('a b c', g('m', ['z', 'b', 'x|y']))).toEqual({
      ok: false,
      reason: 'marker',
    });
    expect(P.placeGroup('b b', g('m', ['z', 'b', '**']))).toEqual({ ok: false, reason: 'marker' });
  });
});

describe('visibleGroups', () => {
  it('hides a group whose find is not unique until another group is accepted', () => {
    const dep = g('iso', ['x', 'ísómerum', 'hverfum']);
    const pre = g('sp', ['y', 'rúmísómerum', 'rúmhverfum']);
    const text = 'um rúmísómerum og ísómerum';
    expect(P.visibleGroups(text, [pre, dep]).map((v) => v.group.key)).toEqual(['sp']);
    const after = P.placeGroup(text, pre).result;
    expect(P.visibleGroups(after, [dep]).map((v) => v.group.key)).toEqual(['iso']); // positive control
  });

  it('drops the later of two overlapping groups and keeps the earlier with its spans', () => {
    const text = 'um komplexjónir hér';
    const first = g('first', ['a', 'komplexjónir', 'flókajónir']);
    const second = g('second', ['b', 'plexjón', 'XX']);
    const v = P.visibleGroups(text, [first, second]);
    expect(v.map((x) => x.group.key)).toEqual(['first']);
    expect(v[0].spans.map((s) => text.slice(s.start, s.end))).toEqual(['komplexjónir']);
    // Reversed order: the other one wins, so order really decides.
    expect(P.visibleGroups(text, [second, first]).map((x) => x.group.key)).toEqual(['second']);
  });

  it('keeps non-overlapping groups and drops ones that fail placement', () => {
    const text = 'aa bb cc';
    const a = g('a', ['1', 'aa', 'A']);
    const c = g('c', ['2', 'cc', 'C']);
    const bad = g('bad', ['3', 'zz', 'Z']);
    expect(P.visibleGroups(text, [a, bad, c]).map((x) => x.group.key)).toEqual(['a', 'c']);
  });
});

describe('tagSpans', () => {
  it('tags accepted words in a saved text that has other typing in it', () => {
    const saved = 'Nýr inngangur. Fyrir flókajónir og flókajónina';
    expect(
      P.tagSpans(saved, [
        { opId: 'a', replace: 'flókajónir' },
        { opId: 'b', replace: 'flókajónina' },
      ]).map((s) => saved.slice(s.start, s.end))
    ).toEqual(['flókajónir', 'flókajónina']);
  });

  it('does not tag a replace that occurs twice', () => {
    expect(P.tagSpans('melmi og melmi', [{ opId: 'a', replace: 'melmi' }])).toEqual([]);
  });

  it('ignores occurrences inside an already tagged span', () => {
    const saved = 'ab abc';
    // 'ab' occurs at 0 and inside 'abc'; tag 'abc' first, then 'ab' is unique outside it.
    const tags = P.tagSpans(saved, [
      { opId: 'x', replace: 'abc' },
      { opId: 'y', replace: 'ab' },
    ]);
    expect(tags.map((s) => [s.opId, saved.slice(s.start, s.end)])).toEqual([
      ['x', 'abc'],
      ['y', 'ab'],
    ]);
    expect(tags[1].start).toBe(0);
  });

  it('never tags an empty replace', () => {
    expect(P.tagSpans('abc', [{ opId: 'a', replace: '' }])).toEqual([]);
  });
});
