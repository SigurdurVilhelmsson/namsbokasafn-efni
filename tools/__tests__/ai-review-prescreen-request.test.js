/**
 * The glossary pre-screen's prompt and request builder (c19; spec §5 and §7): the prompt's
 * schema and its worked example, the user document, and the request bodies.
 *
 * The worked example is part of the measurement: a row it judges must be neither a control
 * nor a row the run can send, or the system prompt hands the model an answer.
 */
import { describe, it, expect } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  USE,
  PROMPT_PATH,
  USER_FORMAT,
  ROWS_PER_REQUEST,
  DEFAULT_EFFORT,
  DEFAULT_MAX_TOKENS,
  MODELS,
  FLAG_KINDS,
  renderUserMessage,
  buildRequests,
} from '../ai-review/prescreen-request.js';
import { loadPrompt } from '../ai-review/term-pass-request.js';
import { conforms, assertSupported } from '../ai-review/response-document.js';
import { validateRequestBody } from '../ai-review/harness.js';
import { CONTROLS } from '../ai-review/prescreen-population.js';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const RULING_SET =
  'experiments/terminology-consistency/results/2026-11-02/ruling-set-2026-11-02.json';
const EXPORT = 'books/efnafraedi-2e/glossary/glossary-unified.json';
const readJson = (rel) => JSON.parse(fs.readFileSync(path.join(REPO, rel), 'utf8'));

let cached;
const prompt = () => (cached ??= loadPrompt(path.join(REPO, PROMPT_PATH)));

const item = (n, over = {}) => ({
  id: `r${String(n).padStart(3, '0')}`,
  english: `word${n}`,
  icelandic: `orð${n}`,
  sentences: [`The word${n} is used here.`, `Another word${n} sentence.`],
  ...over,
});
const items = (count) => Array.from({ length: count }, (_, i) => item(i + 1));
const RUN = { effort: DEFAULT_EFFORT, maxTokens: DEFAULT_MAX_TOKENS };

describe('the constants', () => {
  it('names the use, the prompt and the user-document format', () => {
    expect(USE).toBe('glossary-prescreen');
    expect(PROMPT_PATH).toBe('tools/ai-review/prompts/glossary-prescreen-v1.md');
    expect(USER_FORMAT).toBe('glossary-prescreen-user/1');
  });

  it('holds the run defaults the spec sets', () => {
    expect([ROWS_PER_REQUEST, DEFAULT_EFFORT, DEFAULT_MAX_TOKENS]).toEqual([8, 'high', 16000]);
  });

  it('allows the two models only', () => {
    expect(MODELS).toEqual(['claude-fable-5-2', 'claude-opus-5-5']);
  });

  it('lists the five flag kinds', () => {
    expect(FLAG_KINDS).toEqual([
      'wrong-sense',
      'some-senses-only',
      'wrong-register',
      'not-a-word',
      'other-error',
    ]);
  });
});

describe('the prompt file', () => {
  it('loads, and its schema uses only keywords conforms understands', () => {
    expect(() => assertSupported(prompt().schema)).not.toThrow();
  });

  it('makes kind one of the flag kinds, or null', () => {
    const row = prompt().schema.properties.rows.items;
    expect(row.properties.kind).toEqual({
      anyOf: [{ type: 'string', enum: FLAG_KINDS }, { type: 'null' }],
    });
  });

  it('requires every key of a row answer', () => {
    const row = prompt().schema.properties.rows.items;
    expect(row.required).toEqual(['id', 'verdict', 'kind', 'reason', 'proposed', 'rightSenses']);
    expect(row.properties.verdict).toEqual({ type: 'string', enum: ['fine', 'flag'] });
  });

  // The model must not learn that some rows have known answers or come from other subjects.
  it('mentions no domain, control or population', () => {
    expect(prompt().text).not.toMatch(/domain|control|population/i);
  });
});

/** The worked example's request and answer: the two json blocks after `## Example`. */
function example() {
  const text = prompt().text;
  const at = text.indexOf('\n## Example\n');
  expect(at).toBeGreaterThan(-1);
  const blocks = [...text.slice(at).matchAll(/^```json\n([\s\S]*?)^```$/gm)].map((m) => m[1]);
  expect(blocks).toHaveLength(2);
  return { request: JSON.parse(blocks[0]), answer: JSON.parse(blocks[1]) };
}

describe('the worked example', () => {
  it('is a user document as renderUserMessage writes it', () => {
    const { request } = example();
    const asItems = request.rows.map((r) => ({
      id: r.id,
      english: r.en,
      icelandic: r.is,
      sentences: r.sentences,
    }));
    expect(request).toEqual(JSON.parse(renderUserMessage(asItems)));
  });

  it('has an answer that conforms to the schema', () => {
    expect(conforms(prompt().schema, example().answer)).toBe(true);
  });

  it('answers every row once, in order', () => {
    const { request, answer } = example();
    expect(answer.rows.map((r) => r.id)).toEqual(request.rows.map((r) => r.id));
  });

  it('gives a kind exactly to the flagged rows, and senses only to some-senses-only', () => {
    for (const r of example().answer.rows) {
      expect(r.kind === null).toBe(r.verdict === 'fine');
      expect(r.rightSenses !== null).toBe(r.kind === 'some-senses-only');
      if (r.verdict === 'fine') expect(r.proposed).toEqual([]);
    }
  });

  // An example where most rows are flagged would prime the flag rate (spec §6 stops at 25%).
  it('judges more rows fine than flagged', () => {
    const verdicts = example().answer.rows.map((r) => r.verdict);
    const fine = verdicts.filter((v) => v === 'fine').length;
    expect(fine).toBeGreaterThan(verdicts.length - fine);
  });

  it('uses no control row', () => {
    const controlEnglish = new Set(
      [...CONTROLS.positives, ...CONTROLS.negatives, { english: 'addition' }].map((c) =>
        c.english.toLowerCase()
      )
    );
    for (const r of example().request.rows) {
      expect(controlEnglish.has(r.en.toLowerCase())).toBe(false);
    }
  });

  // classifyRow drops a ruled English form first and a pair the export lacks before the
  // physics and biology rows. The check is on the HEADWORD, not the pair: an export row
  // `stress → álag` would be sendable, and an example judging `stress` would hand over its answer.
  it('uses only headwords the run cannot send: ruled, or absent from the export', () => {
    const ruled = new Set(
      readJson(RULING_SET).rulings.flatMap((r) => r.en.map((e) => e.toLowerCase()))
    );
    const exported = new Set(readJson(EXPORT).terms.map((t) => t.english.toLowerCase()));
    for (const r of example().request.rows) {
      const en = r.en.toLowerCase();
      expect(ruled.has(en) || !exported.has(en)).toBe(true);
    }
  });

  it('shows no control headword in its sentences', () => {
    const heads = [...CONTROLS.positives, ...CONTROLS.negatives, { english: 'addition' }].map(
      (c) => new RegExp(`(?<![\\p{L}\\p{N}_])${c.english}(?![\\p{L}\\p{N}_])`, 'iu')
    );
    for (const s of example().request.rows.flatMap((r) => r.sentences)) {
      expect(heads.filter((re) => re.test(s))).toEqual([]);
    }
  });
});

describe('renderUserMessage', () => {
  it('writes the format and, per row, its id, English, Icelandic and sentences', () => {
    const doc = JSON.parse(renderUserMessage([item(1)]));
    expect(doc).toEqual({
      format: USER_FORMAT,
      rows: [
        {
          id: 'r001',
          en: 'word1',
          is: 'orð1',
          sentences: ['The word1 is used here.', 'Another word1 sentence.'],
        },
      ],
    });
  });

  it('pretty-prints with two spaces', () => {
    const list = [item(1)];
    expect(renderUserMessage(list)).toBe(
      JSON.stringify(
        {
          format: USER_FORMAT,
          rows: list.map((i) => ({
            id: i.id,
            en: i.english,
            is: i.icelandic,
            sentences: i.sentences,
          })),
        },
        null,
        2
      )
    );
  });

  // Only the three things the model may see leave the builder, whatever else an item carries.
  it('carries no domain, control or population field', () => {
    const tagged = items(3).map((i) => ({
      ...i,
      domain: 'physics',
      kind: 'control',
      population: true,
      expected: 'flag',
    }));
    expect(renderUserMessage(tagged)).not.toMatch(/domain|control|population/i);
  });
});

describe('buildRequests', () => {
  const build = (list, over = {}) =>
    buildRequests({
      items: list,
      prompt: prompt(),
      model: MODELS[0],
      effort: DEFAULT_EFFORT,
      maxTokens: DEFAULT_MAX_TOKENS,
      rowsPerRequest: 8,
      ...over,
    });

  it('chunks 17 items into requests g001, g002, g003 in item order', () => {
    const reqs = build(items(17));
    expect(reqs.map((r) => r.key)).toEqual(['g001', 'g002', 'g003']);
    expect(reqs.map((r) => r.presented.length)).toEqual([8, 8, 1]);
    expect(reqs.flatMap((r) => r.presented)).toEqual(items(17).map((i) => i.id));
  });

  it('presents every id in exactly one request', () => {
    const seen = build(items(17)).flatMap((r) => r.presented);
    expect(new Set(seen).size).toBe(17);
    expect(seen).toHaveLength(17);
  });

  it('defaults to ROWS_PER_REQUEST rows', () => {
    const reqs = build(items(17), { rowsPerRequest: undefined });
    expect(reqs.map((r) => r.presented.length)).toEqual([8, 8, 1]);
  });

  it.each(MODELS)('builds bodies the harness accepts for %s', (model) => {
    for (const r of build(items(17), { model })) {
      expect(validateRequestBody(r.body, { model, ...RUN })).toEqual([]);
    }
  });

  it('builds the body as the term pass does, with the chunk as the user document', () => {
    const list = items(3);
    const [req] = build(list);
    expect(req.body).toEqual({
      model: MODELS[0],
      max_tokens: DEFAULT_MAX_TOKENS,
      system: [{ type: 'text', text: prompt().text, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: renderUserMessage(list) }],
      thinking: { type: 'adaptive', display: 'summarized' },
      output_config: {
        effort: DEFAULT_EFFORT,
        format: { type: 'json_schema', schema: prompt().schema },
      },
    });
  });

  it('is deterministic', () => {
    expect(build(items(17))).toEqual(build(items(17)));
  });

  it('throws when one chunk holds the same English and Icelandic twice', () => {
    const list = items(8);
    list[5] = item(6, { english: list[1].english, icelandic: list[1].icelandic });
    expect(() => build(list)).toThrow(/same|twice|pair/i);
  });

  // The homograph control sends one pair twice, in different requests; that must still build.
  it('builds the same pair in two different chunks', () => {
    const list = items(9);
    list[8] = item(9, { english: list[0].english, icelandic: list[0].icelandic });
    expect(build(list).map((r) => r.presented.length)).toEqual([8, 1]);
  });

  it('throws on a repeated id', () => {
    const list = items(10);
    list[9] = item(3, { english: 'other', icelandic: 'annað' });
    expect(() => build(list)).toThrow(/r003/);
  });

  it.each([0, -1, 1.5, '8'])('throws on rowsPerRequest %p', (n) => {
    expect(() => build(items(3), { rowsPerRequest: n })).toThrow(/rowsPerRequest/);
  });
});
