/**
 * term-pass-request.js — the term pass's prompt loader and request builder: a work list
 * (worklist.js) in, Messages API request bodies out, one per chunk of one module.
 *
 * Design: docs/superpowers/specs/2026-10-27-ai-layer-runner-design.md, "The glue".
 *
 * - The prompt file IS the system prompt, verbatim, and its single fenced `json` block under
 *   `## Response schema` is the structured-output schema. So one file and one sha256 cover
 *   everything fixed that the model sees; the per-request data is the user document.
 * - The user document (`term-pass-user/2`) is JSON, one ruling or segment per line, so the
 *   apply step can parse the recorded request back and check that what the model saw is
 *   still the current base. Version 2 gives each segment `maxOps`, its operation budget
 *   (gate.js segmentOpBudget); version 1, which recorded runs still hold, had a flat cap of 6
 *   stated in the prompt. The parser reads both; the renderer writes version 2 only.
 * - Chunks never cross a module, hold at most `segmentsPerRequest` segments and at most
 *   `charBudget` characters of English plus Icelandic (an item above the budget goes
 *   alone). A request shows the FIRST occurrence of a duplicated segment id; the gate
 *   applies the operations to every occurrence (gateOccurrences).
 * - Pure and deterministic: the same inputs give byte-identical bodies (a resumed batch is
 *   checked against its recorded requests that way).
 */
import fs from 'node:fs';
import crypto from 'node:crypto';
import { segmentOpBudget } from './gate.js';

export const USE = 'term-pass';
export const USER_FORMAT = 'term-pass-user/2';
/** Every user-document format the parser reads, oldest first. */
export const USER_FORMATS = Object.freeze(['term-pass-user/1', USER_FORMAT]);
/** Repo-relative path of the prompt; records carry it in this form. */
export const PROMPT_PATH = 'tools/ai-review/prompts/term-pass-v2.md';
export const DEFAULT_SEGMENTS_PER_REQUEST = 8;
export const DEFAULT_CHAR_BUDGET = 16000;

const SCHEMA_HEADING = '## Response schema';
const KEY_INDEX_WIDTH = 3;

/**
 * Read the prompt file: its text (the system prompt), its sha256, and the response schema.
 * @param {string} absPath
 * @returns {{ text: string, sha256: string, schema: object }}
 */
export function loadPrompt(absPath) {
  const bytes = fs.readFileSync(absPath);
  const text = bytes.toString('utf8');
  if (!Buffer.from(text, 'utf8').equals(bytes)) {
    throw new Error(`term-pass: ${absPath} is not valid UTF-8`);
  }
  const at = text.indexOf(`\n${SCHEMA_HEADING}\n`);
  if (at === -1)
    throw new Error(`term-pass: ${absPath} has no "${SCHEMA_HEADING}" section (schema)`);
  const rest = text.slice(at + SCHEMA_HEADING.length + 2);
  const next = rest.search(/^## /m);
  const section = next === -1 ? rest : rest.slice(0, next);
  const blocks = [...section.matchAll(/^```json\n([\s\S]*?)^```$/gm)];
  if (blocks.length !== 1) {
    throw new Error(
      `term-pass: the "${SCHEMA_HEADING}" section must hold exactly one json block (schema), ` +
        `found ${blocks.length}`
    );
  }
  let schema;
  try {
    schema = JSON.parse(blocks[0][1]);
  } catch (err) {
    throw new Error(`term-pass: the schema block does not parse: ${err.message}`);
  }
  if (schema === null || typeof schema !== 'object' || Array.isArray(schema)) {
    throw new Error('term-pass: the schema block is not a JSON object');
  }
  return {
    text,
    sha256: crypto.createHash('sha256').update(bytes).digest('hex'),
    schema,
  };
}

/**
 * A ruling as the model sees it. A sensed ruling also carries its ruled sense id and the
 * closed list of senses, the ruled one first.
 * @param {object} ruling a compiled ruling (ruling-set.js)
 */
export function rulingForRequest(ruling) {
  const out = {
    id: ruling.id,
    en: [...ruling.en],
    target: ruling.is,
    competitors: [...ruling.competitors],
  };
  if (ruling.sense) {
    out.sense = ruling.sense.id;
    out.senses = [
      { id: ruling.sense.id, gloss: ruling.sense.gloss },
      ...ruling.sense.otherSenses.map((s) => ({ id: s.id, gloss: s.gloss })),
    ];
  }
  return out;
}

const isBudget = (n) => Number.isSafeInteger(n) && n > 0;

/**
 * The user document of one request (`term-pass-user/2`): JSON, one ruling or segment per line.
 * @param {{ chapterDir: string, stem: string, rulings: object[],
 *   segments: Array<{ id: string, rulings: string[], maxOps: number, en: string, is: string }> }} doc
 * @returns {string}
 * @throws {Error} when a segment has no positive whole `maxOps`
 */
export function renderUserMessage({ chapterDir, stem, rulings, segments }) {
  const bad = segments.find((s) => !isBudget(s.maxOps));
  if (bad) throw new Error(`term-pass: segment ${bad.id} has no positive whole maxOps`);
  const head = `{"format":${JSON.stringify(USER_FORMAT)},"chapter":${JSON.stringify(chapterDir)},"module":${JSON.stringify(stem)},`;
  const list = (name, items) =>
    `"${name}":[\n${items.map((x) => JSON.stringify(x)).join(',\n')}\n]`;
  return `${head}\n${list('rulings', rulings)},\n${list('segments', segments)}}`;
}

const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const sameKeys = (o, keys) =>
  isPlainObject(o) &&
  Object.keys(o).length === keys.length &&
  keys.every((k) => Object.hasOwn(o, k));
const isStringArray = (v) => Array.isArray(v) && v.every((s) => typeof s === 'string');

/**
 * Parse a user document back (the apply step reads recorded requests this way). Reads every
 * format in USER_FORMATS; refuses another format and any shape its renderer did not write:
 * a version 2 segment has `maxOps` (a positive whole number), a version 1 segment has none.
 * @param {string} text
 * @returns {{ format: string, chapter: string, module: string, rulings: object[],
 *   segments: Array<{ id: string, rulings: string[], maxOps?: number, en: string, is: string }> }}
 */
export function parseUserMessage(text) {
  const doc = JSON.parse(text);
  if (!isPlainObject(doc) || !USER_FORMATS.includes(doc.format)) {
    throw new Error(`term-pass: not a ${USER_FORMATS.join(' or ')} document (format)`);
  }
  const v2 = doc.format === USER_FORMAT;
  if (!sameKeys(doc, ['format', 'chapter', 'module', 'rulings', 'segments'])) {
    throw new Error(
      'term-pass: a user document has exactly format, chapter, module, rulings, segments'
    );
  }
  if (typeof doc.chapter !== 'string' || typeof doc.module !== 'string') {
    throw new Error('term-pass: chapter and module must be strings');
  }
  if (
    !Array.isArray(doc.rulings) ||
    !doc.rulings.every((r) => isPlainObject(r) && typeof r.id === 'string')
  ) {
    throw new Error('term-pass: rulings must be objects with an id');
  }
  const keys = v2 ? ['id', 'rulings', 'maxOps', 'en', 'is'] : ['id', 'rulings', 'en', 'is'];
  const segOk = (s) =>
    sameKeys(s, keys) &&
    typeof s.id === 'string' &&
    isStringArray(s.rulings) &&
    (!v2 || isBudget(s.maxOps)) &&
    typeof s.en === 'string' &&
    typeof s.is === 'string';
  if (!Array.isArray(doc.segments) || !doc.segments.every(segOk)) {
    throw new Error(
      `term-pass: ${doc.format} segments must be { ${keys.join(', ')} }` +
        (v2 ? ', maxOps a positive whole number' : '')
    );
  }
  return doc;
}

const itemChars = (it) => it.occurrences[0].en.length + it.occurrences[0].is.length;

/**
 * Split one module's items into chunks, in order.
 * @param {object[]} items work-list items of ONE unit
 * @param {{ segmentsPerRequest: number, charBudget: number }} limits
 * @returns {object[][]}
 */
export function chunkItems(items, { segmentsPerRequest, charBudget }) {
  if (!Number.isSafeInteger(segmentsPerRequest) || segmentsPerRequest < 1) {
    throw new Error('term-pass: segmentsPerRequest must be a positive integer');
  }
  if (!Number.isSafeInteger(charBudget) || charBudget < 1) {
    throw new Error('term-pass: charBudget must be a positive integer');
  }
  const chunks = [];
  let cur = [];
  let chars = 0;
  for (const it of items) {
    const c = itemChars(it);
    if (cur.length > 0 && (cur.length >= segmentsPerRequest || chars + c > charBudget)) {
      chunks.push(cur);
      cur = [];
      chars = 0;
    }
    cur.push(it);
    chars += c;
  }
  if (cur.length > 0) chunks.push(cur);
  return chunks;
}

const sortedUnique = (xs) => [...new Set(xs)].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

/**
 * Build every request of one chapter's work list.
 * @param {{ workList: { chapterDir: string, units: object[] }, rulingsById: Map<string, object>,
 *   prompt: { text: string, schema: object }, model: string, effort: string, maxTokens: number,
 *   segmentsPerRequest?: number, charBudget?: number }} args
 * @returns {Array<{ key: string, body: object, presented: { chapterDir: string, stem: string,
 *   segments: Array<{ segmentId: string, occurrence: number, candidateIds: string[],
 *   rulingIds: string[] }> } }>}
 */
export function buildRequests({
  workList,
  rulingsById,
  prompt,
  model,
  effort,
  maxTokens,
  segmentsPerRequest = DEFAULT_SEGMENTS_PER_REQUEST,
  charBudget = DEFAULT_CHAR_BUDGET,
}) {
  const { chapterDir } = workList;
  const seenStems = new Set();
  const requests = [];
  for (const unit of workList.units) {
    if (seenStems.has(unit.stem)) {
      throw new Error(
        `term-pass: unit ${unit.stem} appears twice in the work list (keys would repeat)`
      );
    }
    seenStems.add(unit.stem);
    chunkItems(unit.items, { segmentsPerRequest, charBudget }).forEach((chunk, n) => {
      const ids = sortedUnique(chunk.flatMap((it) => it.rulingIds));
      const rulings = ids.map((id) => {
        const r = rulingsById.get(id);
        if (!r) throw new Error(`term-pass: ruling ${id} is not in the ruling set`);
        return rulingForRequest(r);
      });
      const segments = chunk.map((it) => {
        const segRulings = sortedUnique(it.rulingIds);
        const en = it.occurrences[0].en;
        return {
          id: it.segmentId,
          rulings: segRulings,
          maxOps: segmentOpBudget({ en, rulings: segRulings.map((id) => rulingsById.get(id)) }),
          en,
          is: it.occurrences[0].is,
        };
      });
      const key = `${chapterDir}/${unit.stem}/${String(n + 1).padStart(KEY_INDEX_WIDTH, '0')}`;
      requests.push({
        key,
        body: {
          model,
          max_tokens: maxTokens,
          system: [{ type: 'text', text: prompt.text, cache_control: { type: 'ephemeral' } }],
          messages: [
            {
              role: 'user',
              content: renderUserMessage({ chapterDir, stem: unit.stem, rulings, segments }),
            },
          ],
          thinking: { type: 'adaptive', display: 'summarized' },
          output_config: { effort, format: { type: 'json_schema', schema: prompt.schema } },
        },
        presented: {
          chapterDir,
          stem: unit.stem,
          segments: chunk.map((it) => ({
            segmentId: it.segmentId,
            occurrence: it.occurrences[0].occurrence,
            candidateIds: sortedUnique(it.candidateIds),
            rulingIds: sortedUnique(it.rulingIds),
          })),
        },
      });
    });
  }
  return requests;
}
