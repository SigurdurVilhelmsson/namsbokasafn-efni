/**
 * prescreen-request.js — the glossary pre-screen's requests (c19): items in, Messages API
 * request bodies out, `rowsPerRequest` rows to a request.
 *
 * Design: docs/superpowers/specs/2026-11-17-c19-glossary-prescreen-design.md, §7.
 *
 * - The prompt file is the system prompt, read by the term pass's `loadPrompt`: its single
 *   json block under `## Response schema` is the structured-output schema.
 * - Per row the model sees three things only: the English headword, the Icelandic word the
 *   editor expects, and the sample sentences. `renderUserMessage` copies exactly those and
 *   drops every other field an item carries, so nothing marks a control or a subject.
 * - Chunks follow item order. Two rows with the same (English, Icelandic) pair never share a
 *   request (the homograph control sends one pair twice); `assembleItems` keeps them apart,
 *   and the builder refuses a chunk that holds both.
 * - Pure and deterministic: the same inputs give byte-identical bodies. No import from
 *   server/ (the MIT to AGPL boundary).
 */

export const USE = 'glossary-prescreen';
/** Repo-relative path of the prompt; records carry it in this form. */
export const PROMPT_PATH = 'tools/ai-review/prompts/glossary-prescreen-v1.md';
export const USER_FORMAT = 'glossary-prescreen-user/1';
export const ROWS_PER_REQUEST = 8;
export const DEFAULT_EFFORT = 'high';
export const DEFAULT_MAX_TOKENS = 16000;
export const MODELS = Object.freeze(['claude-fable-5-2', 'claude-opus-5-5']);
/** The flag kinds of spec §7, in the order the prompt and the schema list them. */
export const FLAG_KINDS = Object.freeze([
  'wrong-sense',
  'some-senses-only',
  'wrong-register',
  'not-a-word',
  'other-error',
]);

const KEY_INDEX_WIDTH = 3;

/**
 * The user document of one request (`glossary-prescreen-user/1`), pretty-printed JSON.
 * @param {Array<{ id: string, english: string, icelandic: string, sentences: string[] }>} items
 * @returns {string}
 */
export function renderUserMessage(items) {
  return JSON.stringify(
    {
      format: USER_FORMAT,
      rows: items.map(({ id, english, icelandic, sentences }) => ({
        id,
        en: english,
        is: icelandic,
        sentences,
      })),
    },
    null,
    2
  );
}

const pairKey = (it) => `${it.english}\0${it.icelandic}`;

/**
 * Build every request of a run: chunks of `rowsPerRequest` items in order, keyed `g001`, ….
 * @param {{ items: Array<{ id: string, english: string, icelandic: string, sentences: string[] }>,
 *   prompt: { text: string, schema: object }, model: string, effort: string, maxTokens: number,
 *   rowsPerRequest?: number }} args
 * @returns {Array<{ key: string, body: object, presented: string[] }>} `presented` holds the
 *   chunk's item ids, in order
 * @throws {Error} on a bad `rowsPerRequest`, a repeated item id, or a chunk holding one
 *   (English, Icelandic) pair twice
 */
export function buildRequests({
  items,
  prompt,
  model,
  effort,
  maxTokens,
  rowsPerRequest = ROWS_PER_REQUEST,
}) {
  if (!Number.isSafeInteger(rowsPerRequest) || rowsPerRequest < 1) {
    throw new Error('glossary-prescreen: rowsPerRequest must be a positive integer');
  }
  const ids = new Set();
  for (const it of items) {
    if (ids.has(it.id)) throw new Error(`glossary-prescreen: item id ${it.id} appears twice`);
    ids.add(it.id);
  }
  const requests = [];
  for (let start = 0; start < items.length; start += rowsPerRequest) {
    const chunk = items.slice(start, start + rowsPerRequest);
    const pairs = new Map();
    for (const it of chunk) {
      const other = pairs.get(pairKey(it));
      if (other) {
        throw new Error(
          `glossary-prescreen: items ${other} and ${it.id} share the pair ` +
            `${JSON.stringify(it.english)} → ${JSON.stringify(it.icelandic)} in one request`
        );
      }
      pairs.set(pairKey(it), it.id);
    }
    const n = requests.length + 1;
    requests.push({
      key: `g${String(n).padStart(KEY_INDEX_WIDTH, '0')}`,
      body: {
        model,
        max_tokens: maxTokens,
        system: [{ type: 'text', text: prompt.text, cache_control: { type: 'ephemeral' } }],
        messages: [{ role: 'user', content: renderUserMessage(chunk) }],
        thinking: { type: 'adaptive', display: 'summarized' },
        output_config: { effort, format: { type: 'json_schema', schema: prompt.schema } },
      },
      presented: chunk.map((it) => it.id),
    });
  }
  return requests;
}
