/**
 * transport-anthropic.js — the live transport: the Anthropic SDK behind five methods,
 * plus `secrets()`, the key in use once known, which the harness's record guard reads.
 *
 * Design: docs/superpowers/specs/2026-10-26-ai-layer-scaffolding-design.md, Unit D.
 *
 * - The SDK client is built LAZILY, on the first call, so this module loads (and a
 *   transport can be constructed) in CI with no API key.
 * - An injected `fetch` replaces the network entirely, which is how the tests drive the
 *   real SDK offline.
 * - A wrapping fetch reads the `anthropic-version` header off each outgoing request and
 *   keeps it for `run.json`. It reads no other header and keeps nothing else.
 * - No `fallbacks` parameter is ever added: a refusal comes back as an outcome, so the
 *   model a response names is always the model that answered.
 * - The client is built with `maxRetries: 0`. A POST retried after a lost response can be
 *   billed twice, and for a batch submit that means a second batch. Read-only calls
 *   (count_tokens, which is free, and the batch GETs) are retried per call.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import Anthropic from '@anthropic-ai/sdk';
import { resolveApiKey } from './config.js';

const require = createRequire(import.meta.url);
const READ_RETRIES = 2;

/** The request fields the count_tokens endpoint accepts that can change a count. */
export const COUNT_TOKENS_FIELDS = Object.freeze([
  'model',
  'messages',
  'system',
  'output_config',
  'thinking',
  'cache_control',
  'tools',
  'tool_choice',
]);

/**
 * The installed SDK's name and version, read from its own package.json (the package
 * does not export `./package.json`, and `Anthropic.VERSION` is undefined in 1.x).
 * @returns {{ name: string, version: string }}
 */
export function sdkInfo() {
  let dir = path.dirname(require.resolve('@anthropic-ai/sdk'));
  for (;;) {
    const file = path.join(dir, 'package.json');
    if (fs.existsSync(file)) {
      const pkg = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (pkg.name === '@anthropic-ai/sdk') return { name: pkg.name, version: pkg.version };
    }
    const up = path.dirname(dir);
    if (up === dir) throw new Error('transport: cannot find @anthropic-ai/sdk/package.json');
    dir = up;
  }
}

/**
 * The fields of an SDK error that are safe to record: never its headers.
 * @param {unknown} err
 * @returns {{ name: string, status: number|null, type: string|null, message: string,
 *   requestId: string|null }}
 */
export function describeApiError(err) {
  const e = /** @type {any} */ (err) ?? {};
  const inner = e.error && typeof e.error === 'object' ? (e.error.error ?? e.error) : null;
  const str = (v) => (typeof v === 'string' ? v : null);
  return {
    name: str(e.name) ?? 'Error',
    status: typeof e.status === 'number' ? e.status : null,
    type: str(inner?.type) ?? null,
    message: (str(inner?.message) ?? str(e.message) ?? String(err)).slice(0, 2000),
    requestId: str(e.requestID) ?? null,
  };
}

const plain = (value) => JSON.parse(JSON.stringify(value));

function pickCountable(body) {
  return Object.fromEntries(
    COUNT_TOKENS_FIELDS.filter((k) => body[k] !== undefined).map((k) => [k, body[k]])
  );
}

/**
 * Build the live transport.
 * @param {{ apiKey?: string, fetch?: typeof fetch, timeout?: number,
 *   keyOptions?: { env?: object, envFile?: string } }} [opts]
 *   `apiKey` absent → resolved by `resolveApiKey(keyOptions)` when the first call needs it.
 *   `timeout` (ms) lifts the SDK's local refusal of a non-streaming call whose max_tokens
 *   implies more than 10 minutes.
 */
export function createAnthropicTransport({ apiKey, fetch, timeout, keyOptions } = {}) {
  let client = null;
  let anthropicVersion = null;
  /** The key in use, once known: given, or resolved by the first call that needs it. */
  let key = apiKey ?? null;
  const baseFetch = fetch ?? ((input, init) => globalThis.fetch(input, init));
  const wrappedFetch = async (input, init) => {
    const source = init?.headers ?? (input instanceof Request ? input.headers : undefined);
    const version = new Headers(source ?? {}).get('anthropic-version');
    if (version) anthropicVersion = version;
    return baseFetch(input, init);
  };
  const getClient = () => {
    if (!client) {
      key = key ?? resolveApiKey(keyOptions);
      client = new Anthropic({
        apiKey: key,
        fetch: wrappedFetch,
        maxRetries: 0,
        ...(timeout ? { timeout } : {}),
      });
    }
    return client;
  };
  return {
    /** @param {object} body @returns {Promise<object>} the raw message */
    async send(body) {
      return plain(await getClient().messages.create(body));
    },
    /** @param {object} body @returns {Promise<{input_tokens: number}>} */
    async countTokens(body) {
      const r = await getClient().messages.countTokens(pickCountable(body), {
        maxRetries: READ_RETRIES,
      });
      return { input_tokens: r.input_tokens };
    },
    /** @param {Array<{custom_id: string, params: object}>} requests */
    async submitBatch(requests) {
      return plain(await getClient().messages.batches.create({ requests }));
    },
    /** @param {string} id */
    async getBatch(id) {
      return plain(
        await getClient().messages.batches.retrieve(id, undefined, { maxRetries: READ_RETRIES })
      );
    },
    /** @param {string} id @returns {AsyncGenerator<object>} results, in any order */
    async *batchResults(id) {
      const results = await getClient().messages.batches.results(id, undefined, {
        maxRetries: READ_RETRIES,
      });
      for await (const r of results) yield plain(r);
    },
    /** @returns {string|null} the anthropic-version header actually sent, once a call has gone */
    anthropicVersion: () => anthropicVersion,
    sdk: () => sdkInfo(),
    /**
     * The strings a record must never contain: the key in use, once known (empty before
     * a lazily resolved key has been resolved). The harness reads this at every write.
     * @returns {string[]}
     */
    secrets: () => (key ? [key] : []),
  };
}
