/**
 * ai-review-transport.test.js — the live Anthropic transport, driven through an
 * injected fetch (Unit D, docs/superpowers/specs/2026-10-26-ai-layer-scaffolding-design.md).
 *
 * No network: the SDK is handed a fake `fetch`, and the global one is stubbed to throw,
 * so a request that escaped the injection would fail the test instead of reaching the API.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  createAnthropicTransport,
  sdkInfo,
  describeApiError,
  COUNT_TOKENS_FIELDS,
} from '../ai-review/transport-anthropic.js';
import { REPO_ROOT } from '../ai-review/config.js';

const MODEL = 'claude-opus-5-5';
const BOGUS_KEY = 'sk-ant-transport-test-BOGUS-KEY-7f3a9c';

const json = (obj, status = 200, headers = {}) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });

function message(overrides = {}) {
  return {
    id: 'msg_1',
    type: 'message',
    role: 'assistant',
    model: MODEL,
    content: [{ type: 'text', text: '{"ops":[]}' }],
    stop_reason: 'end_turn',
    stop_sequence: null,
    usage: { input_tokens: 10, output_tokens: 5 },
    ...overrides,
  };
}

/** A fake API: records each request (url, method, headers, parsed body) and answers it. */
function fakeApi(routes = {}) {
  const seen = [];
  const fetch = async (input, init = {}) => {
    const url = typeof input === 'string' ? input : input.url;
    const method = init.method ?? 'GET';
    const headers = new Headers(init.headers ?? {});
    const body = typeof init.body === 'string' ? JSON.parse(init.body) : undefined;
    seen.push({ url, method, headers, body });
    const { pathname } = new URL(url);
    const handler = routes[`${method} ${pathname}`];
    if (!handler) return json({ type: 'error', error: { type: 'not_found_error' } }, 404);
    return handler({ body, seen });
  };
  return { fetch, seen };
}

const body = {
  model: MODEL,
  max_tokens: 1000,
  system: 'You review.',
  messages: [{ role: 'user', content: 'hi' }],
  output_config: { effort: 'high', format: { type: 'json_schema', schema: { type: 'object' } } },
  metadata: { user_id: 'x' },
  stop_sequences: ['END'],
};

beforeEach(() => {
  vi.stubGlobal('fetch', () => {
    throw new Error('network forbidden in tests');
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('sdkInfo', () => {
  it("reads the SDK's own package.json and agrees with the root pin", () => {
    const pinned = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'package.json'), 'utf8'))
      .dependencies['@anthropic-ai/sdk'];
    expect(sdkInfo()).toEqual({ name: '@anthropic-ai/sdk', version: pinned });
  });
});

describe('createAnthropicTransport', () => {
  it('constructs with no key and refuses only when a call needs the client', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-review-transport-'));
    try {
      const t = createAnthropicTransport({
        keyOptions: { env: {}, envFile: path.join(dir, '.env') },
      });
      expect(t.anthropicVersion()).toBeNull();
      await expect(t.send(body)).rejects.toThrow(/ANTHROPIC_API_KEY/);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('reports the key it was given as a secret for the record guard', () => {
    const t = createAnthropicTransport({ apiKey: BOGUS_KEY, fetch: fakeApi().fetch });
    expect(t.secrets()).toEqual([BOGUS_KEY]);
  });

  it('reports a key it resolves lazily once it has resolved it, and none before', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-review-transport-'));
    try {
      const envFile = path.join(dir, 'test.env');
      fs.writeFileSync(envFile, `ANTHROPIC_API_KEY=${BOGUS_KEY}\n`);
      const api = fakeApi({ 'POST /v1/messages': () => json(message()) });
      const t = createAnthropicTransport({ fetch: api.fetch, keyOptions: { env: {}, envFile } });
      expect(t.secrets()).toEqual([]);
      await t.send(body);
      expect(t.secrets()).toEqual([BOGUS_KEY]);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('sends a message and captures the anthropic-version header actually sent', async () => {
    const api = fakeApi({ 'POST /v1/messages': () => json(message()) });
    const t = createAnthropicTransport({ apiKey: BOGUS_KEY, fetch: api.fetch });
    const r = await t.send(body);
    expect(r).toEqual(message());
    expect(api.seen).toHaveLength(1);
    expect(api.seen[0].body).toEqual(body);
    expect(t.anthropicVersion()).toBe(api.seen[0].headers.get('anthropic-version'));
    expect(t.anthropicVersion()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    // control: the key really is in play — on the wire, and nowhere the transport returns
    expect(api.seen[0].headers.get('authorization')).toBe(`Bearer ${BOGUS_KEY}`);
    expect(JSON.stringify(r)).not.toContain(BOGUS_KEY);
  });

  it('sends the anthropic-workspace-id header when given a workspace id', async () => {
    const api = fakeApi({ 'POST /v1/messages': () => json(message()) });
    const t = createAnthropicTransport({
      apiKey: BOGUS_KEY,
      workspaceId: 'wrkspc_transport_test',
      fetch: api.fetch,
    });
    await t.send(body);
    expect(api.seen[0].headers.get('anthropic-workspace-id')).toBe('wrkspc_transport_test');
  });

  it('sends no workspace header when none is configured (control)', async () => {
    const api = fakeApi({ 'POST /v1/messages': () => json(message()) });
    const t = createAnthropicTransport({ apiKey: BOGUS_KEY, fetch: api.fetch });
    await t.send(body);
    expect(api.seen[0].headers.get('anthropic-workspace-id')).toBeNull();
  });

  it('resolves the workspace id from the same sources as a lazily resolved key', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-review-transport-'));
    try {
      const envFile = path.join(dir, 'test.env');
      fs.writeFileSync(
        envFile,
        `ANTHROPIC_API_KEY=${BOGUS_KEY}\nANTHROPIC_WORKSPACE_ID=wrkspc_lazy_test\n`
      );
      const api = fakeApi({ 'POST /v1/messages': () => json(message()) });
      const t = createAnthropicTransport({ fetch: api.fetch, keyOptions: { env: {}, envFile } });
      await t.send(body);
      expect(api.seen[0].headers.get('anthropic-workspace-id')).toBe('wrkspc_lazy_test');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('does not report the workspace id as a secret: it is an identifier, not a credential', () => {
    // The record guard refuses a write that contains a secret, so listing an id the API may
    // echo back would abort a paid run; the key alone is the credential.
    const t = createAnthropicTransport({
      apiKey: BOGUS_KEY,
      workspaceId: 'wrkspc_transport_test',
      fetch: fakeApi().fetch,
    });
    expect(t.secrets()).toEqual([BOGUS_KEY]);
  });

  it('counts tokens with only the fields the count endpoint accepts', async () => {
    const api = fakeApi({
      'POST /v1/messages/count_tokens': () => json({ input_tokens: 42 }),
    });
    const t = createAnthropicTransport({ apiKey: BOGUS_KEY, fetch: api.fetch });
    expect(await t.countTokens(body)).toEqual({ input_tokens: 42 });
    const sent = api.seen[0].body;
    expect(Object.keys(sent).sort()).toEqual(['messages', 'model', 'output_config', 'system']);
    expect(sent).not.toHaveProperty('max_tokens');
    for (const k of Object.keys(sent)) expect(COUNT_TOKENS_FIELDS).toContain(k);
  });

  it('submits a batch, retrieves it, and streams its results', async () => {
    const results = [
      { custom_id: 'q000001', result: { type: 'succeeded', message: message({ id: 'b' }) } },
      { custom_id: 'q000000', result: { type: 'errored', error: { type: 'error' } } },
    ];
    const batch = {
      id: 'msgbatch_1',
      type: 'message_batch',
      processing_status: 'ended',
      request_counts: { succeeded: 1, errored: 1 },
      results_url: 'https://api.anthropic.com/v1/messages/batches/msgbatch_1/results',
    };
    const api = fakeApi({
      'POST /v1/messages/batches': () => json({ ...batch, processing_status: 'in_progress' }),
      'GET /v1/messages/batches/msgbatch_1': () => json(batch),
      'GET /v1/messages/batches/msgbatch_1/results': () =>
        new Response(results.map((r) => JSON.stringify(r)).join('\n') + '\n', {
          status: 200,
          headers: { 'content-type': 'application/binary' },
        }),
    });
    const t = createAnthropicTransport({ apiKey: BOGUS_KEY, fetch: api.fetch });
    const requests = [{ custom_id: 'q000000', params: body }];
    const created = await t.submitBatch(requests);
    expect(created.id).toBe('msgbatch_1');
    expect(api.seen[0].body).toEqual({ requests });
    expect((await t.getBatch('msgbatch_1')).processing_status).toBe('ended');
    const got = [];
    for await (const r of t.batchResults('msgbatch_1')) got.push(r);
    expect(got).toEqual(results);
  });

  it('does not retry a POST (a retried submit after a lost response can double-bill)', async () => {
    const api = fakeApi({
      'POST /v1/messages': () =>
        json({ type: 'error', error: { type: 'overloaded_error', message: 'busy' } }, 529, {
          'retry-after-ms': '1',
        }),
    });
    const t = createAnthropicTransport({ apiKey: BOGUS_KEY, fetch: api.fetch });
    await expect(t.send(body)).rejects.toMatchObject({ status: 529 });
    expect(api.seen).toHaveLength(1);
  });

  it('retries a read-only GET (control for the no-retry POST above)', async () => {
    let n = 0;
    const api = fakeApi({
      'GET /v1/messages/batches/msgbatch_1': () =>
        n++ === 0
          ? json({ type: 'error', error: { type: 'api_error' } }, 500, { 'retry-after-ms': '1' })
          : json({ id: 'msgbatch_1', processing_status: 'in_progress', request_counts: {} }),
    });
    const t = createAnthropicTransport({ apiKey: BOGUS_KEY, fetch: api.fetch });
    expect((await t.getBatch('msgbatch_1')).processing_status).toBe('in_progress');
    expect(api.seen).toHaveLength(2);
  });
});

describe('describeApiError', () => {
  it('keeps only whitelisted fields — never headers, never the key', async () => {
    const api = fakeApi({
      'POST /v1/messages': () =>
        json(
          { type: 'error', error: { type: 'invalid_request_error', message: 'bad field' } },
          400,
          {
            'request-id': 'req_abc',
          }
        ),
    });
    const t = createAnthropicTransport({ apiKey: BOGUS_KEY, fetch: api.fetch });
    let err;
    try {
      await t.send(body);
    } catch (e) {
      err = e;
    }
    expect(err).toBeDefined();
    const d = describeApiError(err);
    expect(Object.keys(d).sort()).toEqual(['message', 'name', 'requestId', 'status', 'type']);
    expect(d.status).toBe(400);
    expect(d.type).toBe('invalid_request_error');
    expect(d.message).toBe('bad field');
    expect(d.requestId).toBe('req_abc');
    expect(JSON.stringify(d)).not.toContain(BOGUS_KEY);
  });

  it('describes a plain Error with nulls for the API fields', () => {
    expect(describeApiError(new Error('boom'))).toEqual({
      name: 'Error',
      status: null,
      type: null,
      message: 'boom',
      requestId: null,
    });
  });
});
