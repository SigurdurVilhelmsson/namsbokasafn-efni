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
  it('drops the second of a duplicate id and keeps the first', () => {
    const r = parse([row('a'), row('a', { verdict: 'flag', kind: 'other-error' })], ['a']);
    expect([r.dropped, r.verdicts.get('a').verdict]).toEqual([
      [{ id: 'a', reason: 'duplicate-id' }],
      'fine',
    ]);
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
});
