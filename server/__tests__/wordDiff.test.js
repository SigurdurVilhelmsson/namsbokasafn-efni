import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { wordDiff, renderWordDiffHtml, MAX_CELLS } = require('../public/js/word-diff.js');

const join = (ops, keep) =>
  ops
    .filter((o) => keep.includes(o.op))
    .map((o) => o.text)
    .join('');

describe('wordDiff', () => {
  it('returns one same op for identical strings', () => {
    expect(wordDiff('a b c', 'a b c')).toEqual([{ op: 'same', text: 'a b c' }]);
  });

  it('returns an empty list for two empty strings', () => {
    expect(wordDiff('', '')).toEqual([]);
  });

  it('marks one changed word as a del and an ins', () => {
    const ops = wordDiff('the red cat', 'the blue cat');
    expect(ops.filter((o) => o.op === 'del').map((o) => o.text)).toEqual(['red']);
    expect(ops.filter((o) => o.op === 'ins').map((o) => o.text)).toEqual(['blue']);
  });

  it('reproduces after from same+ins texts', () => {
    const before = 'Atóm eru rafhlutlaus, ef þau innihalda jafnmargar agnir.';
    const after = 'Atóm eru hlutlaus ef þau innihalda jafn margar agnir!';
    expect(join(wordDiff(before, after), ['same', 'ins'])).toBe(after);
  });

  it('reproduces before from same+del texts', () => {
    const before = 'Atóm eru rafhlutlaus, ef þau innihalda jafnmargar agnir.';
    const after = 'Atóm eru hlutlaus ef þau innihalda jafn margar agnir!';
    expect(join(wordDiff(before, after), ['same', 'del'])).toBe(before);
  });

  it('keeps a [[term:…]] marker whole as one token', () => {
    const marker = '[[term:x|term-00001]]';
    const ops = wordDiff(`Sjá ${marker} nú`, `Sjá ${marker} þá`);
    expect(ops.some((o) => o.op === 'same' && o.text.includes(marker))).toBe(true);
    // No op may carry half a marker.
    for (const o of ops) {
      const opens = (o.text.match(/\[\[/g) || []).length;
      const closes = (o.text.match(/\]\]/g) || []).length;
      expect(opens).toBe(closes);
    }
  });

  it('shows a changed marker as a whole del and a whole ins', () => {
    const ops = wordDiff('a [[term:x|term-00001]] b', 'a [[term:y|term-00002]] b');
    expect(ops.find((o) => o.op === 'del').text).toBe('[[term:x|term-00001]]');
    expect(ops.find((o) => o.op === 'ins').text).toBe('[[term:y|term-00002]]');
  });
});

describe('wordDiff edges (deferred minors 5 and 7)', () => {
  it('an empty before is one insertion of the whole after', () => {
    expect(wordDiff('', 'nýr texti')).toEqual([{ op: 'ins', text: 'nýr texti' }]);
  });

  it('an empty after is one deletion of the whole before', () => {
    expect(wordDiff('gamall texti', '')).toEqual([{ op: 'del', text: 'gamall texti' }]);
  });

  it('keeps a nested marker whole, up to the ]] that closes the outer one', () => {
    const nested = '10[[sup:[[i:x]]]]';
    const ops = wordDiff(`reikna ${nested} nú`, `reikna ${nested} þá`);
    expect(ops[0]).toEqual({ op: 'same', text: `reikna ${nested} ` });
  });

  it('shows a changed nested marker as one whole del and one whole ins', () => {
    const ops = wordDiff('a [[fn:sjá [[i:W]] hér]] b', 'a [[fn:sjá [[i:m]] hér]] b');
    expect(ops.filter((o) => o.op !== 'same')).toEqual([
      { op: 'del', text: '[[fn:sjá [[i:W]] hér]]' },
      { op: 'ins', text: '[[fn:sjá [[i:m]] hér]]' },
    ]);
  });

  it('ends an unclosed nested opener at the first ]], as before, and keeps the join', () => {
    const before = 'x [[a [[b]] y';
    const after = 'x [[a [[b]] z';
    expect(join(wordDiff(before, after), ['same', 'del'])).toBe(before);
  });
});

describe('wordDiff past the cell budget', () => {
  // Two texts that share no token at either end and whose middles exceed MAX_CELLS.
  const side = Math.ceil(Math.sqrt(MAX_CELLS)) + 10;
  const before = Array.from({ length: side }, (_, k) => `a${k}`).join(' ');
  const after = Array.from({ length: side }, (_, k) => `b${k}`).join(' ');

  it('returns the whole before as one del and the whole after as one ins', () => {
    expect(wordDiff(before, after)).toEqual([
      { op: 'del', text: before },
      { op: 'ins', text: after },
    ]);
  });

  it('trims a shared prefix and suffix before measuring, so a local edit in long texts is still marked', () => {
    const long = Array.from({ length: side * 2 }, (_, k) => `w${k}`).join(' ');
    const ops = wordDiff(`${long} rauður ${long}`, `${long} blár ${long}`);
    expect(ops.filter((o) => o.op !== 'same')).toEqual([
      { op: 'del', text: 'rauður' },
      { op: 'ins', text: 'blár' },
    ]);
  });
});

describe('renderWordDiffHtml', () => {
  it('escapes <b>&"\' in a same op', () => {
    const html = renderWordDiffHtml([{ op: 'same', text: `<b>&"'` }]);
    expect(html).not.toContain('<b>');
    expect(html).toContain('&lt;b&gt;&amp;&quot;&#39;');
  });

  it('escapes the text of del and ins ops', () => {
    const html = renderWordDiffHtml([
      { op: 'del', text: '<img src=x onerror=1>' },
      { op: 'ins', text: '"><script>' },
    ]);
    expect(html).not.toContain('<img');
    expect(html).not.toContain('<script');
  });

  it('wraps del in <del> and ins in <ins>', () => {
    const html = renderWordDiffHtml([
      { op: 'del', text: 'a' },
      { op: 'ins', text: 'b' },
    ]);
    expect(html).toMatch(/<del[^>]*>a<\/del>/);
    expect(html).toMatch(/<ins[^>]*>b<\/ins>/);
  });

  it('shows a marker as it appears, escaped but intact', () => {
    const html = renderWordDiffHtml(wordDiff('[[term:x|term-00001]]', '[[term:x|term-00001]]'));
    expect(html).toContain('[[term:x|term-00001]]');
  });
});
