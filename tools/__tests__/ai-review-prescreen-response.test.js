/**
 * Parsing a pre-screen answer into per-row verdicts and judging the control rows (c19; spec §7).
 */
import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadPrompt } from '../ai-review/term-pass-request.js';
import { PROMPT_PATH } from '../ai-review/prescreen-request.js';
import { parsePrescreenResponse, judgeControls } from '../ai-review/prescreen-response.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const { schema } = loadPrompt(path.join(ROOT, PROMPT_PATH));

const row = (id, over = {}) => ({
  id,
  verdict: 'fine',
  kind: null,
  reason: 'ok',
  proposed: [],
  rightSenses: null,
  ...over,
});
const message = (rows, stop_reason = 'end_turn') => ({
  stop_reason,
  content: [
    { type: 'thinking', thinking: '...' },
    { type: 'text', text: JSON.stringify({ rows }) },
  ],
});
const parse = (rows, presentedIds, stop) =>
  parsePrescreenResponse({ message: message(rows, stop), presentedIds, schema });

describe('parsePrescreenResponse', () => {
  it('a refusal is a problem with no verdicts', () => {
    const r = parse([], ['a'], 'refusal');
    expect(r.problem).toBe('response-refusal');
    expect(r.verdicts.size).toBe(0);
  });
  it('a refusal lists every presented id as missing', () => {
    expect(parse([], ['a', 'b'], 'refusal').missing).toEqual(['a', 'b']);
  });
  it('a conforming answer gives one verdict per id', () => {
    const r = parse([row('a'), row('b', { verdict: 'flag', kind: 'wrong-sense' })], ['a', 'b']);
    expect([r.problem, [...r.verdicts.keys()]]).toEqual([null, ['a', 'b']]);
  });
  it('a verdict carries its fields', () => {
    const r = parse(
      [
        row('a', {
          verdict: 'flag',
          kind: 'wrong-sense',
          reason: 'x',
          proposed: ['p'],
          rightSenses: 's',
        }),
      ],
      ['a']
    );
    expect(r.verdicts.get('a')).toEqual({
      verdict: 'flag',
      kind: 'wrong-sense',
      reason: 'x',
      proposed: ['p'],
      rightSenses: 's',
    });
  });
  it('drops an unknown id', () => {
    expect(parse([row('zz')], ['a']).dropped).toEqual([{ id: 'zz', reason: 'unknown-id' }]);
  });
  it('an id answered twice is unjudged: both entries dropped, neither kept', () => {
    const r = parse(
      [row('a'), row('a', { verdict: 'flag', kind: 'other-error' }), row('b')],
      ['a', 'b']
    );
    expect([r.dropped, r.verdicts.has('a'), r.missing, [...r.verdicts.keys()]]).toEqual([
      [
        { id: 'a', reason: 'duplicate-id' },
        { id: 'a', reason: 'duplicate-id' },
      ],
      false,
      ['a'],
      ['b'],
    ]);
  });
  it('an id answered twice the same way is still unjudged', () => {
    expect(parse([row('a'), row('a')], ['a']).missing).toEqual(['a']);
  });
  it('drops a flag without a kind', () => {
    expect(parse([row('a', { verdict: 'flag' })], ['a']).dropped).toEqual([
      { id: 'a', reason: 'flag-without-kind' },
    ]);
  });
  it('drops a fine with a kind', () => {
    expect(parse([row('a', { kind: 'other-error' })], ['a']).dropped).toEqual([
      { id: 'a', reason: 'fine-with-kind' },
    ]);
  });
  it('a dropped entry leaves its id missing', () => {
    expect(parse([row('a', { verdict: 'flag' })], ['a']).missing).toEqual(['a']);
  });
  it('reports a presented id with no entry as missing', () => {
    expect(parse([row('a')], ['a', 'b']).missing).toEqual(['b']);
  });
  it('a duplicate whose first entry is malformed leaves the id missing too', () => {
    const r = parse([row('a', { verdict: 'flag' }), row('a')], ['a']);
    expect([r.dropped, r.missing]).toEqual([
      [
        { id: 'a', reason: 'duplicate-id' },
        { id: 'a', reason: 'duplicate-id' },
      ],
      ['a'],
    ]);
  });
  it('text that is not JSON is response-unparseable with no verdicts', () => {
    const msg = { stop_reason: 'end_turn', content: [{ type: 'text', text: 'not json' }] };
    const r = parsePrescreenResponse({ message: msg, presentedIds: ['a'], schema });
    expect([r.problem, r.verdicts.size, r.missing]).toEqual(['response-unparseable', 0, ['a']]);
  });
  it('JSON that breaks the schema is response-invalid with no verdicts', () => {
    const r = parse([row('a', { verdict: 'maybe' })], ['a']);
    expect([r.problem, r.verdicts.size, r.missing]).toEqual(['response-invalid', 0, ['a']]);
  });
});

describe('judgeControls', () => {
  const flagV = (kind) => ({ verdict: 'flag', kind, reason: '', proposed: [], rightSenses: null });
  const fineV = { verdict: 'fine', kind: null, reason: '', proposed: [], rightSenses: null };
  const key = {
    p: { kind: 'control', name: 'pos', expected: 'flag' },
    n: { kind: 'control', name: 'neg', expected: 'fine' },
    ad: {
      kind: 'control',
      name: 'addition-adding',
      expected: 'flag',
      flagKinds: ['wrong-sense', 'some-senses-only'],
    },
    pop: { kind: 'population' },
  };
  const good = () =>
    new Map([
      ['p', flagV('not-a-word')],
      ['n', fineV],
      ['ad', flagV('some-senses-only')],
      ['pop', flagV('other-error')],
    ]);
  it('passes when every control is as expected', () => {
    expect(judgeControls({ verdicts: good(), key }).pass).toBe(true);
  });
  it('ignores non-control entries', () => {
    expect(judgeControls({ verdicts: good(), key }).results.map((r) => r.id)).toEqual([
      'p',
      'n',
      'ad',
    ]);
  });
  it('fails a positive answered fine', () => {
    const v = good();
    v.set('p', fineV);
    const r = judgeControls({ verdicts: v, key });
    expect([r.pass, r.results.find((x) => x.id === 'p').ok]).toEqual([false, false]);
  });
  it('fails a negative answered flag', () => {
    const v = good();
    v.set('n', flagV('other-error'));
    expect(judgeControls({ verdicts: v, key }).results.find((x) => x.id === 'n').ok).toBe(false);
  });
  it('fails addition-adding answered wrong-register', () => {
    const v = good();
    v.set('ad', flagV('wrong-register'));
    expect(judgeControls({ verdicts: v, key }).results.find((x) => x.id === 'ad').ok).toBe(false);
  });
  it('judges by flagKinds, not by name', () => {
    const k = {
      x: { kind: 'control', name: 'renamed', expected: 'flag', flagKinds: ['not-a-word'] },
    };
    const ok = judgeControls({ verdicts: new Map([['x', flagV('not-a-word')]]), key: k });
    const bad = judgeControls({ verdicts: new Map([['x', flagV('wrong-sense')]]), key: k });
    expect([ok.pass, bad.pass]).toEqual([true, false]);
  });
  it('an unjudged control is not ok', () => {
    const v = good();
    v.delete('n');
    const r = judgeControls({ verdicts: v, key }).results.find((x) => x.id === 'n');
    expect([r.got, r.ok]).toEqual(['unjudged', false]);
  });
  it('a key with no controls does not pass', () => {
    const r = judgeControls({ verdicts: new Map(), key: { pop: { kind: 'population' } } });
    expect(r.pass).toBe(false);
  });
  it('an expected value that is neither flag nor fine is bad-expected, never judged fine', () => {
    const k = { x: { kind: 'control', name: 'typo', expected: 'fien' } };
    const r = judgeControls({ verdicts: new Map([['x', fineV]]), key: k });
    expect([r.results[0].got, r.results[0].ok]).toEqual(['bad-expected', false]);
  });
  it('a bad-expected control fails the pass', () => {
    const k = { x: { kind: 'control', name: 'typo', expected: 'fien' } };
    expect(judgeControls({ verdicts: new Map([['x', fineV]]), key: k }).pass).toBe(false);
  });
  it('a fine verdict on a flag control with flagKinds fails', () => {
    const k = {
      ad: {
        kind: 'control',
        name: 'addition-adding',
        expected: 'flag',
        flagKinds: ['wrong-sense', 'some-senses-only'],
      },
    };
    const r = judgeControls({ verdicts: new Map([['ad', fineV]]), key: k });
    expect(r.results[0].ok).toBe(false);
  });
  it('an addition-reaction control (expected fine) answered flag fails', () => {
    const k = { ar: { kind: 'control', name: 'addition-reaction', expected: 'fine' } };
    const r = judgeControls({ verdicts: new Map([['ar', flagV('other-error')]]), key: k });
    expect(r.results[0].ok).toBe(false);
  });
});
