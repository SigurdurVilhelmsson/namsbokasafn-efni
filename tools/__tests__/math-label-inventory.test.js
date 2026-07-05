import { describe, it, expect } from 'vitest';
import {
  bucketToken,
  DEFAULT_STOPLIST,
  collectMathTokens,
  decodeEntities,
  aggregate,
  mergeSkeleton,
  validateValue,
  validateMap,
} from '../lib/math-label-inventory.js';

describe('bucketToken', () => {
  it('routes lowercase words (incl. mol) to label bucket', () => {
    for (const t of ['rate', 'surr', 'and', 'vap', 'mol', 'cell']) {
      expect(bucketToken(t)).toBe('label');
    }
  });
  it('routes formulae, units, operators, short/var tokens to other', () => {
    for (const t of ['atm', 'MnO', 'HCl', 'pOH', 'kPa', 'kJ', '−', 'k', 'aq', 'log']) {
      expect(bucketToken(t)).toBe('other');
    }
  });
  it('mol is not in the default stoplist', () => {
    expect(DEFAULT_STOPLIST.has('mol')).toBe(false);
  });
});

describe('collectMathTokens', () => {
  const cnxml = `
    <para>text before math</para>
    <m:math><m:mrow><m:mi>q</m:mi><m:msub><m:mtext>H</m:mtext></m:msub>
      <m:mtext>vap</m:mtext></m:mrow></m:math>
    <m:math><m:mtext>rate</m:mtext></m:math>`;

  it('pulls every mtext/mi occurrence', () => {
    const toks = collectMathTokens(cnxml).map((t) => t.text);
    expect(toks).toEqual(['q', 'H', 'vap', 'rate']);
  });
  it('gives each token the enclosing expression as context', () => {
    const vap = collectMathTokens(cnxml).find((t) => t.text === 'vap');
    expect(vap.context).toBe('q H vap');
  });
  it('ignores non-math text', () => {
    const toks = collectMathTokens(cnxml).map((t) => t.text);
    expect(toks).not.toContain('text');
  });
  it('decodes entities in token content', () => {
    expect(decodeEntities('&#8722;')).toBe('−');
    expect(decodeEntities('a&amp;b')).toBe('a&b');
  });
});

describe('aggregate', () => {
  const toks = [
    { text: 'rate', context: 'rate a' },
    { text: 'rate', context: 'rate b' },
    { text: 'mol', context: 'n mol' },
    { text: 'atm', context: 'P atm' },
    { text: 'MnO', context: 'MnO' },
  ];
  it('counts occurrences and buckets labels vs others', () => {
    const { labels, others } = aggregate(toks);
    expect(labels.get('rate').count).toBe(2);
    expect(labels.get('mol').count).toBe(1);
    expect(labels.has('atm')).toBe(false);
    expect(others.has('atm')).toBe(true);
    expect(others.has('MnO')).toBe(true);
  });
  it('keeps the first-seen context', () => {
    const { labels } = aggregate(toks);
    expect(labels.get('rate').context).toBe('rate a');
  });
});

describe('mergeSkeleton', () => {
  const labels = new Map([
    ['rate', { count: 2, context: 'rate' }],
    ['cell', { count: 1, context: 'E cell' }],
  ]);
  it('adds new keys empty and preserves filled values', () => {
    const { merged, addedKeys } = mergeSkeleton({ rate: 'hraði' }, labels);
    expect(merged).toEqual({ rate: 'hraði', cell: '' });
    expect(addedKeys).toEqual(['cell']);
  });
  it('keeps and reports keys absent from discovery (never deletes)', () => {
    const { merged, orphanKeys } = mergeSkeleton({ aq: 'vökvi' }, labels);
    expect(merged.aq).toBe('vökvi');
    expect(orphanKeys).toEqual(['aq']);
  });
});

describe('validateValue (value-level: charset hard, length/whitespace advisory)', () => {
  it('empty value is neither hard nor warned (map decides pending)', () => {
    expect(validateValue('')).toEqual({ hard: null, warnings: [] });
  });
  it('charset is the only hard failure', () => {
    expect(validateValue('a<b').hard).toMatch(/forbidden/);
    expect(validateValue('a&b').hard).toMatch(/forbidden/);
    expect(validateValue('hraði').hard).toBeNull();
  });
  it('whitespace is an advisory warning, not hard', () => {
    const r = validateValue('fast efni');
    expect(r.hard).toBeNull();
    expect(r.warnings.join(' ')).toMatch(/whitespace|multi-word/);
  });
  it('length >6 warns only when enforceLength (subscript); never hard', () => {
    const sub = validateValue('uppgufun', { enforceLength: true }); // 8 cp
    expect(sub.hard).toBeNull();
    expect(sub.warnings.join(' ')).toMatch(/> ?6/);
    const inl = validateValue('uppgufun', { enforceLength: false });
    expect(inl.warnings.join(' ')).not.toMatch(/> ?6/);
  });
  it('6 Icelandic code points is within the cap (no length warning)', () => {
    expect(validateValue('þðæösý', { enforceLength: true }).warnings).toEqual([]);
  });
  it('flags a whitespace-only value as a hard error (would delete the label)', () => {
    expect(validateValue(' ').hard).toMatch(/whitespace-only/);
  });
  it('still treats a multi-word value as advisory, not hard', () => {
    expect(validateValue('fast efni').hard).toBeNull();
  });
});

describe('validateMap (states: translated / final-English / pending + advisories)', () => {
  it('classifies self-map as final-English and empty as pending', () => {
    const r = validateMap({ ppm: 'ppm', sub: '', rate: 'hraði' }, {});
    expect(r.finalEnglish).toEqual(['ppm']);
    expect(r.pending).toEqual(['sub']);
    expect(r.hard).toEqual([]);
    expect(r.warnings).toEqual([]);
  });
  it('length warning fires for subscript class only', () => {
    const r = validateMap(
      { vap: 'uppgufun', pancakes: 'pönnukökur' },
      { vap: 'subscript', pancakes: 'inline' }
    );
    expect(r.warnings.map((w) => w.key)).toEqual(['vap']); // inline long value: no warning
    expect(r.hard).toEqual([]);
  });
  it('collects a charset value as hard', () => {
    const r = validateMap({ bad: 'a<b' }, { bad: 'inline' });
    expect(r.hard.map((h) => h.key)).toEqual(['bad']);
  });
  it('a value equal to its key is final-English even if long', () => {
    const r = validateMap({ reaction: 'reaction' }, { reaction: 'subscript' });
    expect(r.finalEnglish).toEqual(['reaction']);
    expect(r.warnings).toEqual([]);
  });
});

describe('collectMathTokens position', () => {
  const cnxml = `<doc xmlns:m="http://www.w3.org/1998/Math/MathML">
    <m:math><m:mrow><m:mtext>Δ</m:mtext><m:msub><m:mi>H</m:mi>
      <m:mrow><m:mtext>vap</m:mtext></m:mrow></m:msub></m:mrow></m:math>
    <m:math><m:mtext>pancakes</m:mtext></m:math></doc>`;

  it('marks subscript-slot tokens script and body tokens body', () => {
    const toks = collectMathTokens(cnxml);
    const vap = toks.find((t) => t.text === 'vap');
    const base = toks.find((t) => t.text === 'H');
    const pan = toks.find((t) => t.text === 'pancakes');
    expect(vap.position).toBe('script'); // 2nd child of m:msub
    expect(base.position).toBe('body'); // base (1st child) is not a script slot
    expect(pan.position).toBe('body'); // standalone mtext
  });
  it('still captures context (enclosing expression tokens)', () => {
    const vap = collectMathTokens(cnxml).find((t) => t.text === 'vap');
    expect(vap.context).toBe('Δ H vap');
  });
});

describe('collectMathTokens fail-loud', () => {
  it('throws on a fatal XML parse error (no silent miss)', () => {
    expect(() => collectMathTokens('<m:math><m:mi>x</para></m:math>')).toThrow();
  });
});

describe('aggregate classification', () => {
  it('classes a token subscript if ANY occurrence is script, else inline', () => {
    const toks = [
      { text: 'vap', context: 'H vap', position: 'script' },
      { text: 'vap', context: 'x', position: 'body' },
      { text: 'pancakes', context: 'pancakes', position: 'body' },
    ];
    const { labels } = aggregate(toks);
    expect(labels.get('vap').klass).toBe('subscript'); // any script wins
    expect(labels.get('vap').scriptCount).toBe(1);
    expect(labels.get('pancakes').klass).toBe('inline');
  });
});

import { renderReport } from '../lib/math-label-inventory.js';

describe('renderReport', () => {
  const labels = new Map([
    ['rate', { count: 64, context: 'Δ[A]/Δt = rate', klass: 'subscript' }],
    ['cell', { count: 50, context: 'E cell', klass: 'subscript' }],
  ]);
  const others = new Map([['atm', { count: 39, context: 'P atm' }]]);
  const md = renderReport({
    book: 'efnafraedi-2e',
    labels,
    others,
    currentMap: { rate: 'hraði', cell: '' },
  });

  it('lists likely labels sorted by count with counts and context', () => {
    expect(md).toMatch(/## Subscript labels/);
    expect(md).toMatch(/rate/);
    expect(md).toMatch(/64/);
    expect(md.indexOf('rate')).toBeLessThan(md.indexOf('cell')); // 64 before 50
  });
  it('shows the current filled value and marks empty ones', () => {
    expect(md).toMatch(/hraði/);
  });
  it('includes the also-review bucket and the constraints', () => {
    expect(md).toMatch(/atm/);
    expect(md).toMatch(/6/); // 6-char cap mentioned
    expect(md).toMatch(/self-map/i);
  });
});

describe('renderReport three sections', () => {
  const labels = new Map([
    ['vap', { count: 19, context: 'Δ H vap', scriptCount: 19, bodyCount: 0, klass: 'subscript' }],
    [
      'pancakes',
      { count: 3, context: 'egg pancakes', scriptCount: 0, bodyCount: 3, klass: 'inline' },
    ],
  ]);
  const others = new Map([
    ['atm', { count: 39, context: 'P atm', scriptCount: 0, bodyCount: 39, klass: 'inline' }],
  ]);
  const md = renderReport({
    book: 'efnafraedi-2e',
    labels,
    others,
    currentMap: { vap: '', pancakes: '' },
  });

  it('has a subscript section that mentions the 6-char cap', () => {
    expect(md).toMatch(/Subscript labels/);
    expect(md).toMatch(/vap/);
  });
  it('has an inline content-words section noting no length cap', () => {
    expect(md).toMatch(/Inline content-words/);
    expect(md).toMatch(/pancakes/);
    expect(md).toMatch(/no length cap|no cap/i);
  });
  it('still prints the also-review bucket', () => {
    expect(md).toMatch(/atm/);
  });
});
