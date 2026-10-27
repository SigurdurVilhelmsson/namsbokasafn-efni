/**
 * The term pass's request builder: prompt loading, chunking, the user document and the
 * request body (design: docs/superpowers/specs/2026-10-27-ai-layer-runner-design.md, "The glue").
 */
import { describe, it, expect, afterAll } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import {
  USE,
  USER_FORMAT,
  PROMPT_PATH,
  DEFAULT_SEGMENTS_PER_REQUEST,
  DEFAULT_CHAR_BUDGET,
  loadPrompt,
  rulingForRequest,
  renderUserMessage,
  parseUserMessage,
  chunkItems,
  buildRequests,
} from '../ai-review/term-pass-request.js';
import { validateRequestBody } from '../ai-review/harness.js';
import { loadRulingSet } from '../ai-review/ruling-set.js';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const RULINGS = loadRulingSet(
  'experiments/terminology-consistency/results/2026-10-26/ruling-set-2026-10-26.json'
);
const RUN = { model: 'claude-opus-5-5', effort: 'high', maxTokens: 16000 };

const item = (id, en, is, rulingIds = ['atom'], extra = {}) => ({
  segmentId: id,
  occurrences: [{ occurrence: 0, key: id, en, is }],
  candidateIds: rulingIds,
  rulingIds,
  ...extra,
});
const workList = (units) => ({ chapterDir: 'ch02', units, counts: {} });
const prompt = () => loadPrompt(path.join(REPO, PROMPT_PATH));
const TEMP = [];
afterAll(() => {
  for (const d of TEMP) fs.rmSync(d, { recursive: true, force: true });
});

describe('constants', () => {
  it('names the use, the user format and the defaults', () => {
    expect(USE).toBe('term-pass');
    expect(USER_FORMAT).toBe('term-pass-user/1');
    expect(PROMPT_PATH).toBe('tools/ai-review/prompts/term-pass-v1.md');
    expect(DEFAULT_SEGMENTS_PER_REQUEST).toBe(8);
    expect(DEFAULT_CHAR_BUDGET).toBe(16000);
  });
});

describe('loadPrompt', () => {
  it('returns the whole file as text, its sha256 and the schema block', () => {
    const file = path.join(REPO, PROMPT_PATH);
    const bytes = fs.readFileSync(file);
    const p = loadPrompt(file);
    expect(p.text).toBe(bytes.toString('utf8'));
    expect(p.sha256).toBe(crypto.createHash('sha256').update(bytes).digest('hex'));
    expect(p.schema.type).toBe('object');
    expect(p.schema.required).toEqual(['segments']);
  });

  it('refuses a file with no schema block, or two', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tp-prompt-'));
    TEMP.push(dir);
    const none = path.join(dir, 'none.md');
    fs.writeFileSync(none, '# x\n\n## Response schema\n\nno block\n');
    expect(() => loadPrompt(none)).toThrow(/schema/);
    const two = path.join(dir, 'two.md');
    fs.writeFileSync(
      two,
      '# x\n\n## Response schema\n\n```json\n{"type":"object"}\n```\n\n```json\n{}\n```\n'
    );
    expect(() => loadPrompt(two)).toThrow(/exactly one/);
    const ok = path.join(dir, 'ok.md');
    fs.writeFileSync(
      ok,
      '# x\n\n## Response schema\n\n```json\n{"type":"object"}\n```\n\n## Next\n'
    );
    expect(loadPrompt(ok).schema).toEqual({ type: 'object' });
  });
});

describe('rulingForRequest', () => {
  it('shows id, English forms, target and competitors for an unsensed ruling', () => {
    expect(rulingForRequest(RULINGS.byId.get('atom'))).toEqual({
      id: 'atom',
      en: ['atom'],
      target: 'atóm',
      competitors: ['frumeind'],
    });
  });

  it('adds the ruled sense and the closed list, ruled sense first, for a sensed ruling', () => {
    const r = rulingForRequest(RULINGS.byId.get('cell'));
    expect(r.sense).toBe('electrochemical-cell');
    expect(r.senses.map((s) => s.id)).toEqual([
      'electrochemical-cell',
      'living-cell',
      'unit-cell',
      'other-cell',
    ]);
    expect(Object.keys(r)).toEqual(['id', 'en', 'target', 'competitors', 'sense', 'senses']);
  });
});

describe('the user document', () => {
  const doc = {
    chapterDir: 'ch02',
    stem: 'm68693',
    rulings: [rulingForRequest(RULINGS.byId.get('atom'))],
    segments: [{ id: 'm68693:para:a', rulings: ['atom'], en: 'An "atom".', is: 'Frumeind.' }],
  };

  it('is one JSON document that parses back to what was rendered', () => {
    const text = renderUserMessage(doc);
    const parsed = parseUserMessage(text);
    expect(parsed).toEqual({
      format: USER_FORMAT,
      chapter: 'ch02',
      module: 'm68693',
      rulings: doc.rulings,
      segments: doc.segments,
    });
    expect(JSON.parse(text).format).toBe(USER_FORMAT);
  });

  it('puts each ruling and each segment on its own line', () => {
    const lines = renderUserMessage(doc).split('\n');
    expect(lines.filter((l) => l.startsWith('{"id":"atom"'))).toHaveLength(1);
    expect(lines.filter((l) => l.startsWith('{"id":"m68693:para:a"'))).toHaveLength(1);
  });

  it('refuses a document of another format, or a malformed one', () => {
    expect(() => parseUserMessage('{"format":"x"}')).toThrow(/format/);
    expect(() => parseUserMessage('not json')).toThrow();
    const text = renderUserMessage(doc).replace('"segments":[', '"segmentz":[');
    expect(() => parseUserMessage(text)).toThrow();
  });
});

describe('chunkItems', () => {
  const mk = (n, len = 10) =>
    Array.from({ length: n }, (_, i) => item(`m1:para:p${i}`, 'e'.repeat(len), 'i'.repeat(len)));

  it('holds at most segmentsPerRequest items per chunk, in order', () => {
    const chunks = chunkItems(mk(17), { segmentsPerRequest: 8, charBudget: 1e9 });
    expect(chunks.map((c) => c.length)).toEqual([8, 8, 1]);
    expect(chunks.flat().map((i) => i.segmentId)).toEqual(mk(17).map((i) => i.segmentId));
  });

  it('closes a chunk before the character budget would be exceeded', () => {
    // each item is 2 × 100 = 200 characters; 500 admits two
    const chunks = chunkItems(mk(5, 100), { segmentsPerRequest: 8, charBudget: 500 });
    expect(chunks.map((c) => c.length)).toEqual([2, 2, 1]);
  });

  it('gives an item larger than the budget a chunk of its own', () => {
    const items = [
      ...mk(1, 10),
      item('m1:para:big', 'e'.repeat(900), 'i'.repeat(900)),
      ...mk(1, 10),
    ];
    const chunks = chunkItems(items, { segmentsPerRequest: 8, charBudget: 500 });
    expect(chunks.map((c) => c.map((i) => i.segmentId))).toEqual([
      ['m1:para:p0'],
      ['m1:para:big'],
      ['m1:para:p0'],
    ]);
  });

  it('refuses a non-positive limit', () => {
    expect(() => chunkItems(mk(2), { segmentsPerRequest: 0, charBudget: 10 })).toThrow();
    expect(() => chunkItems(mk(2), { segmentsPerRequest: 2, charBudget: 0 })).toThrow();
  });
});

describe('buildRequests', () => {
  const units = [
    {
      stem: 'm68693',
      items: [
        item('m68693:para:a', 'The atoms.', 'Frumeindirnar.'),
        item('m68693:para:b', 'A cell.', 'Klefi.', ['cell']),
      ],
      skipped: {},
    },
    { stem: 'm68694', items: [], skipped: {} },
    { stem: 'm68695', items: [item('m68695:para:c', 'An atom.', 'Frumeind.')], skipped: {} },
  ];
  const build = (over = {}) =>
    buildRequests({
      workList: workList(units),
      rulingsById: RULINGS.byId,
      prompt: prompt(),
      ...RUN,
      ...over,
    });

  it('makes one request per chunk, never across units, keyed chapter/module/nnn', () => {
    const reqs = build();
    expect(reqs.map((r) => r.key)).toEqual(['ch02/m68693/001', 'ch02/m68695/001']);
    expect(reqs[0].presented).toEqual({
      chapterDir: 'ch02',
      stem: 'm68693',
      segments: [
        { segmentId: 'm68693:para:a', occurrence: 0, candidateIds: ['atom'], rulingIds: ['atom'] },
        { segmentId: 'm68693:para:b', occurrence: 0, candidateIds: ['cell'], rulingIds: ['cell'] },
      ],
    });
  });

  it('builds a body the harness accepts for the run', () => {
    for (const r of build()) expect(validateRequestBody(r.body, RUN)).toEqual([]);
  });

  it('sends the prompt as a cached system block, adaptive summarized thinking, effort and the schema', () => {
    const p = prompt();
    const { body } = build()[0];
    expect(body.model).toBe('claude-opus-5-5');
    expect(body.max_tokens).toBe(16000);
    expect(body.system).toEqual([
      { type: 'text', text: p.text, cache_control: { type: 'ephemeral' } },
    ]);
    expect(body.thinking).toEqual({ type: 'adaptive', display: 'summarized' });
    expect(body.output_config).toEqual({
      effort: 'high',
      format: { type: 'json_schema', schema: p.schema },
    });
    expect(body.messages).toHaveLength(1);
    expect(body.messages[0].role).toBe('user');
  });

  it('shows the union of the chunk’s rulings, sorted, and each segment’s own list', () => {
    const doc = parseUserMessage(build()[0].body.messages[0].content);
    expect(doc.rulings.map((r) => r.id)).toEqual(['atom', 'cell']);
    expect(doc.segments).toEqual([
      { id: 'm68693:para:a', rulings: ['atom'], en: 'The atoms.', is: 'Frumeindirnar.' },
      { id: 'm68693:para:b', rulings: ['cell'], en: 'A cell.', is: 'Klefi.' },
    ]);
    expect(doc.chapter).toBe('ch02');
    expect(doc.module).toBe('m68693');
  });

  it('shows the first occurrence of a duplicated segment id', () => {
    const dup = {
      ...item('m1:para:d', 'Atom one.', 'Frumeind eitt.'),
      occurrences: [
        { occurrence: 0, key: 'm1:para:d', en: 'Atom one.', is: 'Frumeind eitt.' },
        { occurrence: 1, key: 'm1:para:d#1', en: 'Atom one.', is: 'Frumeind eitt.' },
      ],
    };
    const reqs = buildRequests({
      workList: workList([{ stem: 'm1', items: [dup], skipped: {} }]),
      rulingsById: RULINGS.byId,
      prompt: prompt(),
      ...RUN,
    });
    expect(reqs[0].presented.segments[0].occurrence).toBe(0);
  });

  it('is deterministic', () => {
    expect(JSON.stringify(build())).toBe(JSON.stringify(build()));
  });

  it('refuses a ruling id the ruling set does not hold', () => {
    const bad = workList([
      { stem: 'm9', items: [item('m9:para:x', 'a', 'b', ['nope'])], skipped: {} },
    ]);
    expect(() =>
      buildRequests({ workList: bad, rulingsById: RULINGS.byId, prompt: prompt(), ...RUN })
    ).toThrow(/nope/);
  });

  it('refuses a key that would repeat', () => {
    const twice = workList([
      { stem: 'm1', items: [item('m1:para:a', 'a', 'b')], skipped: {} },
      { stem: 'm1', items: [item('m1:para:b', 'a', 'b')], skipped: {} },
    ]);
    expect(() =>
      buildRequests({ workList: twice, rulingsById: RULINGS.byId, prompt: prompt(), ...RUN })
    ).toThrow(/m1/);
  });
});
