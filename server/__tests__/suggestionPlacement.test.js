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

  it('places an earlier change (chain order) that sits AFTER the later change in the text (PR1 R15)', () => {
    // Change 0 lengthens a word near the end; change 1 shortens a word at the start, searched in
    // the text change 0 produced. Both spans must come back in the INPUT text's coordinates.
    const text = 'Fyrst kemur alfa, svo beta og loks gamma';
    const r = P.placeGroup(text, g('k', ['late', 'gamma', 'gammagildi'], ['early', 'alfa', 'a']));
    expect(r.ok).toBe(true);
    expect(r.result).toBe('Fyrst kemur a, svo beta og loks gammagildi');
    expect(r.spans).toEqual([
      { opId: 'late', start: text.indexOf('gamma'), end: text.indexOf('gamma') + 5 },
      { opId: 'early', start: text.indexOf('alfa'), end: text.indexOf('alfa') + 4 },
    ]);
    expect(r.spans.map((s) => text.slice(s.start, s.end))).toEqual(['gamma', 'alfa']);
  });
});

// ── Sentinels (G1.23 PR3, controller rulings R14 and R21) ─────────────
// The page's escapeHtml (htmlUtils.js), copied: that file wraps fetch at load.
const escapeHtml = (t) =>
  t == null
    ? ''
    : String(t)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#x27;');
const { OPEN, CLOSE, END } = P.SENTINEL;
const open = (id) => `${OPEN}${id}${END}`;
const close = (id) => `${CLOSE}${id}${END}`;
const ANY_SENTINEL = /[\uE000-\uE002]/;
/** A drawMark that makes a drawn mark visible and checkable. */
const box = (id, inner) => `<b data-m="${id}">${inner}</b>`;

describe('SENTINEL / hasSentinel', () => {
  it('exports three distinct private-use code points, frozen', () => {
    expect(Object.isFrozen(P.SENTINEL)).toBe(true);
    expect([OPEN, CLOSE, END]).toEqual(['\uE000', '\uE001', '\uE002']);
  });
  it('detects a sentinel and passes plain text', () => {
    expect(P.hasSentinel(`a${CLOSE}b`)).toBe(true);
    expect(P.hasSentinel('plain þ text')).toBe(false);
  });
  it('the escaping the renderer applies leaves the sentinels and the ids alone', () => {
    const wrapped = P.withSentinels('a & <b>', [{ start: 0, end: 1, id: 7 }]);
    expect(escapeHtml(wrapped)).toBe(`${open(7)}a${close(7)} &amp; &lt;b&gt;`);
  });
});

describe('withSentinels', () => {
  it("wraps a mark in the input's coordinates", () => {
    expect(P.withSentinels('abc def', [{ start: 4, end: 7, id: 0 }])).toBe(
      `abc ${open(0)}def${close(0)}`
    );
  });

  it('wraps several marks, given in any order, each around its own span', () => {
    const out = P.withSentinels('aa bb cc', [
      { start: 6, end: 8, id: 2 },
      { start: 0, end: 2, id: 0 },
    ]);
    expect(out).toBe(`${open(0)}aa${close(0)} bb ${open(2)}cc${close(2)}`);
  });

  it('keeps adjacent marks (adjacent is not overlapping)', () => {
    expect(
      P.withSentinels('abcd', [
        { start: 0, end: 2, id: 0 },
        { start: 2, end: 4, id: 1 },
      ])
    ).toBe(`${open(0)}ab${close(0)}${open(1)}cd${close(1)}`);
  });

  it('drops a mark that overlaps an earlier-listed one, and keeps the earlier (so it never nests)', () => {
    const out = P.withSentinels('abcdef', [
      { start: 1, end: 4, id: 0 },
      { start: 3, end: 6, id: 1 },
    ]);
    expect(out).toBe(`a${open(0)}bcd${close(0)}ef`);
    expect(out).not.toContain(open(1));
  });

  it('drops malformed marks: empty, reversed, out of range, non-integer, a bad id, a repeated id', () => {
    const bad = [
      { start: 2, end: 2, id: 0 },
      { start: 3, end: 1, id: 1 },
      { start: 0, end: 99, id: 2 },
      { start: -1, end: 1, id: 3 },
      { start: 0.5, end: 1, id: 4 },
      { start: 0, end: 1, id: 'x' },
      { start: 0, end: 1, id: '1|2' },
    ];
    expect(P.withSentinels('abcdef', bad)).toBe('abcdef');
    // A repeated id: the first keeps it.
    expect(
      P.withSentinels('abcdef', [
        { start: 0, end: 1, id: 5 },
        { start: 4, end: 5, id: 5 },
      ])
    ).toBe(`${open(5)}a${close(5)}bcdef`);
  });

  it('refuses a text that already holds a sentinel, and accepts the same text without it', () => {
    expect(() => P.withSentinels(`ab${OPEN}c`, [])).toThrow(TypeError);
    expect(P.withSentinels('abc', [])).toBe('abc');
  });
});

describe('fromSentinels', () => {
  // Fake renderers shaped like renderMarkdownPreview's rules.
  const attrCopy = (t) =>
    escapeHtml(t).replace(/\[\[term:([^|\]]+)\|([^\]]+)\]\]/g, '<span title="$2">$1</span>');
  const dropping = (t) => escapeHtml(t).replace(/\[\[em:([^|\]]+)\|[^\]]+\]\]/g, '<em>$1</em>');
  const formatting = (t) => escapeHtml(t).replace(/\^(.+?)\^/g, '<sup>$1</sup>');

  it('draws a mark whose find renders as plain text (the control)', () => {
    const html = escapeHtml(P.withSentinels('x < sódíum', [{ start: 4, end: 10, id: 0 }]));
    expect(P.fromSentinels(html, box)).toEqual({
      html: 'x &lt; <b data-m="0">sódíum</b>',
      drawn: ['0'],
    });
  });

  it('does not draw a mark copied into an attribute, and strips it there', () => {
    const text = '[[term:A|kalín]] og natrín';
    const wrapped = P.withSentinels(text, [
      { start: 9, end: 14, id: 0 }, // inside the title capture
      { start: 20, end: 26, id: 1 }, // plain text: the control
    ]);
    const r = P.fromSentinels(attrCopy(wrapped), box);
    expect(r.drawn).toEqual(['1']);
    expect(r.html).toBe('<span title="kalín">A</span> og <b data-m="1">natrín</b>');
    expect(r.html).not.toMatch(ANY_SENTINEL);
  });

  it('does not draw a mark whose capture the renderer drops', () => {
    const text = '[[em:A|kalín]] og natrín';
    const wrapped = P.withSentinels(text, [
      { start: 7, end: 12, id: 0 },
      { start: 18, end: 24, id: 1 },
    ]);
    const r = P.fromSentinels(dropping(wrapped), box);
    expect(r.drawn).toEqual(['1']);
    expect(r.html).toBe('<em>A</em> og <b data-m="1">natrín</b>');
  });

  it('does not draw a mark with a tag between its open and its close', () => {
    // The span starts outside ^…^ and ends inside it, so <sup> lands between the sentinels.
    const text = 'x a^2^ y';
    const wrapped = P.withSentinels(text, [
      { start: 2, end: 5, id: 0 },
      { start: 7, end: 8, id: 1 },
    ]);
    const r = P.fromSentinels(formatting(wrapped), box);
    expect(r.drawn).toEqual(['1']);
    expect(r.html).toBe('x a<sup>2</sup> <b data-m="1">y</b>');
  });

  it('does not draw a mark whose close comes before its open, nor one with a missing half', () => {
    const r = P.fromSentinels(`a${close(0)}b${open(0)}c ${open(1)}d e${close(2)} f`, box);
    expect(r.drawn).toEqual([]);
    expect(r.html).toBe('abc d e f');
  });

  it('does not draw a mark whose open appears twice (a capture copied twice)', () => {
    const html = `${open(0)}w${close(0)} ${open(0)}w${close(0)}`;
    expect(P.fromSentinels(html, box)).toEqual({ html: 'w w', drawn: [] });
  });

  it('does not draw a mark with another sentinel between its open and close', () => {
    const r = P.fromSentinels(`${open(0)}a${open(1)}b${close(1)}c${close(0)}`, box);
    expect(r.drawn).toEqual(['1']);
    expect(r.html).toBe('a<b data-m="1">b</b>c');
  });

  it('does not draw a mark whose open sits inside a tag', () => {
    const r = P.fromSentinels(`<i title="${open(0)}a${close(0)}">t</i>`, box);
    expect(r).toEqual({ html: '<i title="a">t</i>', drawn: [] });
  });

  it('strips a lone sentinel character, and lists drawn ids in order of appearance', () => {
    const html = `${open(3)}a${close(3)} ${OPEN}x ${open(1)}b${close(1)}`;
    const r = P.fromSentinels(html, box);
    expect(r.drawn).toEqual(['3', '1']);
    expect(r.html).toBe('<b data-m="3">a</b> x <b data-m="1">b</b>');
  });
});

describe('stripSentinels', () => {
  it('removes whole tokens and lone sentinel characters, and nothing else', () => {
    expect(P.stripSentinels(`a${open(12)}b${close(12)}c${END}d 7`)).toBe('abcd 7');
  });
});

describe('drawSuggestions', () => {
  const sg = (key, rulingId, ...changes) => ({
    key,
    rulingId,
    label: { en: rulingId, is: rulingId },
    changes: changes.map(([opId, find, replace, chainIndex]) => ({
      opId,
      occurrence: 0,
      find,
      replace,
      category: 'term',
      runId: 'r',
      chainIndex,
    })),
  });
  const draw = (render = escapeHtml) => ({
    render,
    swap: (offer, ci, inner) =>
      `<s data-g="${offer.number}" data-c="${ci}">${inner}→${escapeHtml(offer.group.changes[ci].replace)}</s>`,
    tag: (change, inner) => `<t data-op="${change.opId}">${inner}</t>`,
  });
  const T = 'komplexjónir og sundrunarföstum, komplexjónina';
  const complex = sg(
    'k',
    'complex-ion',
    ['c1', 'komplexjónir', 'flókajónir', 0],
    ['c2', 'komplexjónina', 'flókajónina', 2]
  );
  const dissoc = sg('d', 'dissociation-constant', ['d1', 'sundrunarföstum', 'klofnunarföstum', 1]);

  it('renders exactly as the renderer does when the segment has no suggestions', () => {
    expect(P.drawSuggestions('a < b', undefined, [], draw())).toEqual({
      html: 'a &lt; b',
      offered: [],
    });
  });

  it('draws every change of every placeable group and numbers the groups in order', () => {
    const r = P.drawSuggestions(T, { groups: [complex, dissoc], tagged: [] }, [], draw());
    expect(r.offered.map((o) => [o.group.key, o.number])).toEqual([
      ['k', 1],
      ['d', 2],
    ]);
    expect(r.html).toBe(
      '<s data-g="1" data-c="0">komplexjónir→flókajónir</s> og ' +
        '<s data-g="2" data-c="0">sundrunarföstum→klofnunarföstum</s>, ' +
        '<s data-g="1" data-c="1">komplexjónina→flókajónina</s>'
    );
  });

  it('offers no part of a group one of whose marks cannot be drawn, and draws its sibling', () => {
    const attrCopy = (t) =>
      escapeHtml(t).replace(/\[\[term:([^|\]]+)\|([^\]]+)\]\]/g, '<span title="$2">$1</span>');
    const text = '[[term:A|komplexjónir]] og sundrunarföstum, komplexjónina';
    const r = P.drawSuggestions(
      text,
      { groups: [complex, dissoc], tagged: [] },
      [],
      draw(attrCopy)
    );
    expect(r.offered.map((o) => [o.group.key, o.number])).toEqual([['d', 1]]);
    // The undrawable group's plain-text word is plain, not half a swap.
    expect(r.html).toBe(
      '<span title="komplexjónir">A</span> og ' +
        '<s data-g="1" data-c="0">sundrunarföstum→klofnunarföstum</s>, komplexjónina'
    );
    expect(r.html).not.toMatch(ANY_SENTINEL);
  });

  it('does not offer a group accepted in the open pane, and tags its words; with no pane it comes back', () => {
    const accepted = P.placeGroup(T, complex).result;
    const groups = { groups: [complex, dissoc], tagged: [] };
    const r = P.drawSuggestions(accepted, groups, ['c1', 'c2'], draw());
    expect(r.offered.map((o) => o.group.key)).toEqual(['d']);
    expect(r.html).toBe(
      '<t data-op="c1">flókajónir</t> og ' +
        '<s data-g="1" data-c="0">sundrunarföstum→klofnunarföstum</s>, ' +
        '<t data-op="c2">flókajónina</t>'
    );
    // Hætta við: the pane's assists are gone and the text is the base again.
    expect(P.drawSuggestions(T, groups, [], draw()).offered.map((o) => o.group.key)).toEqual([
      'k',
      'd',
    ]);
  });

  it('does not offer a pane-accepted group even where its old words are back in the text', () => {
    // The editor took the group, then typed the old words back: the accept is still in the pane.
    const groups = { groups: [complex, dissoc], tagged: [] };
    const r = P.drawSuggestions(T, groups, ['c1', 'c2'], draw());
    expect(r.offered.map((o) => o.group.key)).toEqual(['d']);
    expect(r.html).not.toContain('data-c="1"'); // no second change of any group is drawn
    // Control: without the pane's accept, the same text offers it.
    expect(P.drawSuggestions(T, groups, [], draw()).offered.map((o) => o.group.key)).toEqual([
      'k',
      'd',
    ]);
  });

  it("tags the saved edit's accepted changes", () => {
    const saved = 'Nýtt. flókajónir og sundrunarföstum';
    const r = P.drawSuggestions(
      saved,
      {
        groups: [dissoc],
        tagged: [{ opId: 'c1', replace: 'flókajónir', find: 'komplexjónir', chainIndex: 0 }],
      },
      [],
      draw()
    );
    expect(r.html).toBe(
      'Nýtt. <t data-op="c1">flókajónir</t> og <s data-g="1" data-c="0">sundrunarföstum→klofnunarföstum</s>'
    );
  });

  it('does not show a tag it cannot place, and still offers the groups (control)', () => {
    const r = P.drawSuggestions(
      'flókajónir og flókajónir, sundrunarföstum',
      {
        groups: [dissoc],
        tagged: [{ opId: 'c1', replace: 'flókajónir', find: 'x', chainIndex: 0 }],
      },
      [],
      draw()
    );
    expect(r.html).not.toContain('<t ');
    expect(r.offered.map((o) => o.group.key)).toEqual(['d']);
  });

  it('drops a swap that overlaps a tag; the tag stays', () => {
    const over = sg('o', 'other', ['o1', 'jónir og', 'X', 3]);
    const r = P.drawSuggestions(
      'flókajónir og meira',
      { groups: [over], tagged: [{ opId: 'c1', replace: 'flókajónir', find: 'x', chainIndex: 0 }] },
      [],
      draw()
    );
    expect(r.offered).toEqual([]);
    expect(r.html).toBe('<t data-op="c1">flókajónir</t> og meira');
  });

  it("draws nothing over a text that already holds a sentinel, and keeps the editor's character", () => {
    const text = `komplexjónir og ${OPEN}sundrunarföstum, komplexjónina`;
    const r = P.drawSuggestions(text, { groups: [complex, dissoc], tagged: [] }, [], draw());
    expect(r).toEqual({ html: text, offered: [] });
    // Control: the same text without the character offers both.
    expect(
      P.drawSuggestions(T, { groups: [complex, dissoc], tagged: [] }, [], draw()).offered
    ).toHaveLength(2);
  });

  it('draws nothing when the sentinels change how the renderer parses the text', () => {
    // A renderer rule with a closed character class: a sentinel inside the id stops the match.
    const chips = (t) => escapeHtml(t).replace(/\[#([a-zé]+)\]/g, '<i title="$1">#</i>');
    const id = sg('i', 'idword', ['i1', 'kafli', 'hluti', 0]);
    const r = P.drawSuggestions('sjá [#kafli] hér', { groups: [id], tagged: [] }, [], draw(chips));
    expect(r).toEqual({ html: 'sjá <i title="kafli">#</i> hér', offered: [] });
    // Control: the same group on plain text is drawn by the same renderer.
    expect(
      P.drawSuggestions('sjá kafli hér', { groups: [id], tagged: [] }, [], draw(chips)).offered
    ).toHaveLength(1);
  });

  it('never offers a group whose replace holds a sentinel', () => {
    const bad = sg('b', 'bad', ['b1', 'sundrunarföstum', `klofnun${END}`, 1]);
    const r = P.drawSuggestions(T, { groups: [complex, bad], tagged: [] }, [], draw());
    expect(r.offered.map((o) => o.group.key)).toEqual(['k']);
    expect(r.html).not.toMatch(ANY_SENTINEL);
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
