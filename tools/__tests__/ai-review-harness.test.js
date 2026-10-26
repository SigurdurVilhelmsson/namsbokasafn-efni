/**
 * ai-review-harness.test.js — the generic AI-call harness (Unit D,
 * docs/superpowers/specs/2026-10-26-ai-layer-scaffolding-design.md).
 *
 * The harness takes prebuilt request bodies, each standing for one key string, and
 * records what happened. Most tests drive it through a mock transport; the last block
 * drives the real SDK transport through an injected fetch. No test reaches the network
 * (the global fetch is stubbed to throw) and none needs ANTHROPIC_API_KEY.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { runInteractive, runBatch, validateRequestBody } from '../ai-review/harness.js';
import { readLedger, summarizeLedger, reserve, settle } from '../ai-review/ledger.js';
import { createAnthropicTransport, sdkInfo } from '../ai-review/transport-anthropic.js';
import { CAP_USD } from '../ai-review/config.js';

const MODEL = 'claude-opus-5-5';
const BOGUS_KEY = 'sk-ant-harness-test-BOGUS-KEY-4d2e8b1c';

// Per request with the mock defaults (100 input tokens counted, max_tokens 1000,
// 100 in / 50 out actually used):
const WORST = 110 * 4e-6 + 1000 * 20e-6; // 0.02044 — input × 1.1 margin, max_tokens out
const ACTUAL = 100 * 4e-6 + 50 * 20e-6; // 0.0014

const tmpDirs = [];
function tmp() {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-review-harness-'));
  tmpDirs.push(d);
  return d;
}

beforeEach(() => {
  vi.stubGlobal('fetch', () => {
    throw new Error('network forbidden in tests');
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
  while (tmpDirs.length) fs.rmSync(tmpDirs.pop(), { recursive: true, force: true });
});

function message(overrides = {}) {
  return {
    id: 'msg_x',
    type: 'message',
    role: 'assistant',
    model: MODEL,
    content: [{ type: 'text', text: '{"ops":[]}' }],
    stop_reason: 'end_turn',
    stop_sequence: null,
    usage: { input_tokens: 100, output_tokens: 50 },
    ...overrides,
  };
}

function req(key, bodyOverrides = {}, extra = {}) {
  return {
    key,
    body: {
      model: MODEL,
      max_tokens: 1000,
      system: 'You review Icelandic chemistry segments.',
      messages: [{ role: 'user', content: `segment ${key}` }],
      output_config: {
        effort: 'high',
        format: { type: 'json_schema', schema: { type: 'object' } },
      },
      ...bodyOverrides,
    },
    ...extra,
  };
}

function fixedClock(start = Date.parse('2026-10-26T22:00:00Z')) {
  let t = start;
  return () => new Date((t += 1000));
}

function baseOpts(recordsDir, transport, extra = {}) {
  return {
    recordsDir,
    transport,
    use: 'ai-pass',
    model: MODEL,
    effort: 'high',
    maxTokens: 1000,
    prompts: [{ path: 'tools/ai-review/prompts/ai-pass-v1.md', sha256: 'a'.repeat(64) }],
    rulingSet: {
      path: 'experiments/terminology-consistency/results/2026-10-26/ruling-set-2026-10-26.json',
      sha256: 'b'.repeat(64),
    },
    now: fixedClock(),
    sleep: async () => {},
    harnessCommit: () => 'c'.repeat(40),
    ...extra,
  };
}

/** A mock transport recording every call. */
function mockTransport({
  inputTokens = 100,
  reply = () => message(),
  sendError = null,
  countError = null,
  pollsUntilEnded = 2,
  results = null,
  submitError = null,
  onGetBatch = null,
  resultsThrowAfter = null,
} = {}) {
  const calls = { send: [], countTokens: [], submitBatch: [], getBatch: [], batchResults: [] };
  let version = null;
  let submitted = null;
  const touch = () => {
    version = '2026-10-21';
  };
  return {
    calls,
    anthropicVersion: () => version,
    sdk: () => ({ name: '@anthropic-ai/sdk', version: 'mock' }),
    async countTokens(body) {
      touch();
      calls.countTokens.push(body);
      if (countError) throw countError(calls.countTokens.length - 1);
      return { input_tokens: inputTokens };
    },
    async send(body) {
      touch();
      calls.send.push(body);
      const i = calls.send.length - 1;
      if (sendError) {
        const e = sendError(i);
        if (e) throw e;
      }
      return reply(body, i);
    },
    async submitBatch(requests) {
      touch();
      calls.submitBatch.push(requests);
      if (submitError) throw submitError;
      submitted = requests;
      return { id: 'msgbatch_mock', processing_status: 'in_progress', request_counts: {} };
    },
    async getBatch(id) {
      touch();
      calls.getBatch.push(id);
      if (onGetBatch) onGetBatch(id);
      const ended = calls.getBatch.length >= pollsUntilEnded;
      return {
        id,
        processing_status: ended ? 'ended' : 'in_progress',
        request_counts: { processing: ended ? 0 : 1 },
      };
    },
    async *batchResults(id) {
      calls.batchResults.push(id);
      const list = results
        ? results()
        : submitted.map((r) => ({
            custom_id: r.custom_id,
            result: { type: 'succeeded', message: message() },
          }));
      let n = 0;
      for (const r of [...list].reverse()) {
        if (resultsThrowAfter !== null && n === resultsThrowAfter) {
          throw new Error('connection reset while streaming results');
        }
        n++;
        yield r;
      }
    },
  };
}

function readJsonl(file) {
  if (!fs.existsSync(file)) return [];
  return fs
    .readFileSync(file, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l));
}

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
    const p = path.join(dir, d.name);
    return d.isDirectory() ? walk(p) : [p];
  });
}

function sdkLikeError({ status, type, message: msg, requestID = 'req_1' }) {
  return Object.assign(new Error(`${status} ${msg}`), {
    name: 'APIError',
    status,
    headers: { authorization: `Bearer ${BOGUS_KEY}`, 'x-api-key': BOGUS_KEY },
    error: { type: 'error', error: { type, message: msg } },
    requestID,
  });
}

// ────────────────────────────────────────────────────────────────────────────

describe('validateRequestBody', () => {
  const run = { model: MODEL, effort: 'high', maxTokens: 1000 };
  it('accepts the shape the harness is built for (control)', () => {
    expect(validateRequestBody(req('k').body, run)).toEqual([]);
  });
  it.each([
    ['temperature', { temperature: 0 }],
    ['top_p', { top_p: 0.9 }],
    ['top_k', { top_k: 5 }],
    ['fallbacks', { fallbacks: [{ model: 'claude-sonnet-4-6' }] }],
    ['stream', { stream: true }],
    ['speed', { speed: 'fast' }],
    ['service_tier', { service_tier: 'auto' }],
    ['inference_geo', { inference_geo: 'us' }],
    ['tools', { tools: [{ name: 't', input_schema: { type: 'object' } }] }],
    ['tool_choice', { tool_choice: { type: 'tool', name: 't' } }],
  ])('refuses a body carrying %s', (_name, extra) => {
    expect(validateRequestBody(req('k', extra).body, run).length).toBeGreaterThan(0);
  });
  it('refuses a thinking budget, and accepts adaptive thinking', () => {
    expect(
      validateRequestBody(
        req('k', { thinking: { type: 'enabled', budget_tokens: 2000 } }).body,
        run
      ).length
    ).toBeGreaterThan(0);
    expect(validateRequestBody(req('k', { thinking: { type: 'adaptive' } }).body, run)).toEqual([]);
  });
  it('refuses a body whose model, effort or max_tokens differ from the run', () => {
    expect(validateRequestBody(req('k', { model: 'claude-x' }).body, run).length).toBeGreaterThan(
      0
    );
    expect(validateRequestBody(req('k', { max_tokens: 999 }).body, run).length).toBeGreaterThan(0);
    expect(
      validateRequestBody(req('k', { output_config: { effort: 'low' } }).body, run).length
    ).toBeGreaterThan(0);
    expect(validateRequestBody(req('k', { output_config: {} }).body, run).length).toBeGreaterThan(
      0
    );
  });
});

describe('runInteractive — the flow on a mock transport', () => {
  it('counts, reserves, sends, records and settles each request', async () => {
    const dir = tmp();
    const t = mockTransport();
    const out = await runInteractive({
      ...baseOpts(dir, t),
      requests: [req('m1:para:a'), req('m1:para:a#1'), req('m2:title:t')],
    });
    expect(out.status).toBe('complete');
    expect(t.calls.countTokens).toHaveLength(3);
    expect(t.calls.send).toHaveLength(3);

    const runDir = path.join(dir, 'runs', out.runId);
    expect(out.runDir).toBe(runDir);
    const requests = readJsonl(path.join(runDir, 'requests.jsonl'));
    expect(requests.map((r) => r.key)).toEqual(['m1:para:a', 'm1:para:a#1', 'm2:title:t']);
    expect(requests[0].body).toEqual(req('m1:para:a').body);
    const responses = readJsonl(path.join(runDir, 'responses.jsonl'));
    expect(responses).toHaveLength(3);
    for (const r of responses) {
      expect(r.model).toBe(MODEL);
      expect(r.stop_reason).toBe('end_turn');
      expect(r.outcome).toBe('succeeded');
      expect(r.usage).toEqual({ input_tokens: 100, output_tokens: 50 });
      expect(r.costUsd).toBeCloseTo(ACTUAL, 12);
      expect(r.response).toEqual(message());
    }
    expect(fs.existsSync(path.join(runDir, 'errors.jsonl'))).toBe(false);

    const s = summarizeLedger(readLedger(path.join(dir, 'ledger.jsonl')));
    expect(s.settledUsd).toBeCloseTo(3 * ACTUAL, 12);
    expect(s.openUsd).toBe(0);
    const types = readLedger(path.join(dir, 'ledger.jsonl')).map((e) => e.type);
    expect(types.filter((x) => x === 'reserve')).toHaveLength(3);
    expect(types.filter((x) => x === 'settle')).toHaveLength(3);

    const end = JSON.parse(fs.readFileSync(path.join(runDir, 'run-end.json'), 'utf8'));
    expect(end.status).toBe('complete');
    expect(end.counts).toMatchObject({ planned: 3, sent: 3, succeeded: 3, errored: 0 });
    expect(end.totalUsd).toBeCloseTo(3 * ACTUAL, 12);
  });

  it('records run.json with everything the spec lists', async () => {
    const dir = tmp();
    const t = mockTransport();
    const out = await runInteractive({ ...baseOpts(dir, t), requests: [req('k1')] });
    const run = JSON.parse(fs.readFileSync(path.join(out.runDir, 'run.json'), 'utf8'));
    expect(run).toMatchObject({
      runId: out.runId,
      use: 'ai-pass',
      mode: 'interactive',
      model: MODEL,
      effort: 'high',
      max_tokens: 1000,
      prompts: [{ path: 'tools/ai-review/prompts/ai-pass-v1.md', sha256: 'a'.repeat(64) }],
      rulingSet: {
        path: 'experiments/terminology-consistency/results/2026-10-26/ruling-set-2026-10-26.json',
        sha256: 'b'.repeat(64),
      },
      sdk: { name: '@anthropic-ai/sdk', version: 'mock' },
      anthropicVersion: '2026-10-21',
      harnessCommit: 'c'.repeat(40),
      cap: { usd: CAP_USD },
    });
    expect(typeof run.startedAt).toBe('string');
  });

  it('mints custom_ids that do not encode the key', async () => {
    const dir = tmp();
    const out = await runInteractive({
      ...baseOpts(dir, mockTransport()),
      requests: [req('m68727:para:fs-idm1#1'), req('chapter-metadata:title:x')],
    });
    const requests = readJsonl(path.join(out.runDir, 'requests.jsonl'));
    for (const r of requests) {
      expect(r.custom_id).toMatch(/^[A-Za-z0-9_-]{1,64}$/);
      expect(r.custom_id).not.toContain('m68727');
    }
    expect(new Set(requests.map((r) => r.custom_id)).size).toBe(2);
  });

  it('records a refusal as an outcome and does not retry it on another model', async () => {
    const dir = tmp();
    const t = mockTransport({
      reply: (_b, i) => (i === 0 ? message({ stop_reason: 'refusal', content: [] }) : message()),
    });
    const out = await runInteractive({
      ...baseOpts(dir, t),
      requests: [req('k-refused'), req('k-fine')],
    });
    expect(t.calls.send).toHaveLength(2);
    expect(t.calls.send.every((b) => b.model === MODEL)).toBe(true);
    const responses = readJsonl(path.join(out.runDir, 'responses.jsonl'));
    expect(responses.find((r) => r.key === 'k-refused').outcome).toBe('refusal');
    expect(responses.find((r) => r.key === 'k-refused').stop_reason).toBe('refusal');
    expect(responses.find((r) => r.key === 'k-fine').outcome).toBe('succeeded');
    const end = JSON.parse(fs.readFileSync(path.join(out.runDir, 'run-end.json'), 'utf8'));
    expect(end.counts.refusal).toBe(1);
  });

  it('records the model that answered, and settles the worst case when it cannot price it', async () => {
    const dir = tmp();
    const t = mockTransport({ reply: () => message({ model: 'claude-unpriced-9' }) });
    const out = await runInteractive({ ...baseOpts(dir, t), requests: [req('k1')] });
    const [r] = readJsonl(path.join(out.runDir, 'responses.jsonl'));
    expect(r.model).toBe('claude-unpriced-9');
    expect(r.costUsd).toBeNull();
    const s = summarizeLedger(readLedger(path.join(dir, 'ledger.jsonl')));
    expect(s.settledUsd).toBeCloseTo(WORST, 12);
    expect(s.openUsd).toBe(0);
  });

  it('on an API error releases the reservation, records whitelisted fields, and goes on', async () => {
    const dir = tmp();
    const t = mockTransport({
      sendError: (i) =>
        i === 0
          ? sdkLikeError({ status: 529, type: 'overloaded_error', message: 'Overloaded' })
          : null,
    });
    const out = await runInteractive({ ...baseOpts(dir, t), requests: [req('k1'), req('k2')] });
    expect(out.status).toBe('complete');
    const [e] = readJsonl(path.join(out.runDir, 'errors.jsonl'));
    expect(e).toMatchObject({
      key: 'k1',
      stage: 'send',
      error: {
        name: 'APIError',
        status: 529,
        type: 'overloaded_error',
        message: 'Overloaded',
        requestId: 'req_1',
      },
    });
    expect(JSON.stringify(e)).not.toContain(BOGUS_KEY);
    expect(e.error).not.toHaveProperty('headers');
    const s = summarizeLedger(readLedger(path.join(dir, 'ledger.jsonl')));
    expect(s.openUsd).toBe(0);
    expect(s.settledUsd).toBeCloseTo(ACTUAL, 12); // only k2 was billed
    expect(readJsonl(path.join(out.runDir, 'responses.jsonl')).map((r) => r.key)).toEqual(['k2']);
  });

  it('settles the worst case when a send fails with no status (it may have been billed)', async () => {
    const dir = tmp();
    const t = mockTransport({
      sendError: () => Object.assign(new Error('socket hang up'), { name: 'APIConnectionError' }),
    });
    const out = await runInteractive({ ...baseOpts(dir, t), requests: [req('k1')] });
    const s = summarizeLedger(readLedger(path.join(dir, 'ledger.jsonl')));
    expect(s.openUsd).toBe(0);
    expect(s.settledUsd).toBeCloseTo(WORST, 12);
    expect(out.totalUsd).toBeCloseTo(WORST, 12);
    const [e] = readJsonl(path.join(out.runDir, 'errors.jsonl'));
    expect(e).toMatchObject({ key: 'k1', stage: 'send', error: { status: null } });
  });

  it('stops at once on an authentication error', async () => {
    const dir = tmp();
    const t = mockTransport({
      sendError: () => sdkLikeError({ status: 401, type: 'authentication_error', message: 'x' }),
    });
    const out = await runInteractive({
      ...baseOpts(dir, t),
      requests: [req('k1'), req('k2'), req('k3')],
    });
    expect(out.status).toBe('stopped-on-errors');
    expect(t.calls.send).toHaveLength(1);
  });

  it('stops after too many consecutive errors', async () => {
    const dir = tmp();
    const t = mockTransport({
      sendError: () => sdkLikeError({ status: 500, type: 'api_error', message: 'x' }),
    });
    const out = await runInteractive({
      ...baseOpts(dir, t, { maxConsecutiveErrors: 3 }),
      requests: [req('k1'), req('k2'), req('k3'), req('k4'), req('k5')],
    });
    expect(out.status).toBe('stopped-on-errors');
    expect(t.calls.send).toHaveLength(3);
  });

  it('records a count_tokens failure without reserving', async () => {
    const dir = tmp();
    const t = mockTransport({
      countError: () => sdkLikeError({ status: 500, type: 'api_error', message: 'x' }),
    });
    const out = await runInteractive({
      ...baseOpts(dir, t, { maxConsecutiveErrors: 1 }),
      requests: [req('k1')],
    });
    const [e] = readJsonl(path.join(out.runDir, 'errors.jsonl'));
    expect(e.stage).toBe('count_tokens');
    expect(t.calls.send).toHaveLength(0);
    expect(readLedger(path.join(dir, 'ledger.jsonl'))).toEqual([]);
  });

  it('rewrites run.json with the anthropic-version once the first call has sent it', async () => {
    const dir = tmp();
    const t = mockTransport();
    const out = await runInteractive({ ...baseOpts(dir, t), requests: [req('k1')] });
    const run = JSON.parse(fs.readFileSync(path.join(out.runDir, 'run.json'), 'utf8'));
    expect(run.anthropicVersion).toBe('2026-10-21');
  });
});

describe('the cap', () => {
  it('refuses the first request when settlements from another use leave no room', async () => {
    const dir = tmp();
    const ledgerPath = path.join(dir, 'ledger.jsonl');
    const { id } = reserve({ ledgerPath, runId: 'earlier', use: 'glossary-prescreen', usd: 99.99 });
    settle({ ledgerPath, id, usd: 99.99 });
    const t = mockTransport();
    const out = await runInteractive({ ...baseOpts(dir, t), requests: [req('k1'), req('k2')] });
    expect(out.status).toBe('stopped-at-cap');
    expect(t.calls.send).toHaveLength(0);
    const [e] = readJsonl(path.join(out.runDir, 'errors.jsonl'));
    expect(e).toMatchObject({ key: 'k1', stage: 'reserve', error: { type: 'cap_exceeded' } });
    expect(readJsonl(path.join(out.runDir, 'requests.jsonl'))).toEqual([]);
    const end = JSON.parse(fs.readFileSync(path.join(out.runDir, 'run-end.json'), 'utf8'));
    expect(end.counts).toMatchObject({ planned: 2, sent: 0, notSent: 2 });
  });

  it('stops — does not skip ahead — at the first request that would cross the cap', async () => {
    const dir = tmp();
    const t = mockTransport();
    // cap 0.021: request 1's worst case (0.02044) fits; after it settles at 0.0014,
    // request 2's worst case (0.0014 + 0.02044 = 0.02184) does not.
    const out = await runInteractive({
      ...baseOpts(dir, t, { cap: 0.021 }),
      requests: [req('k1'), req('k2'), req('k3')],
    });
    expect(out.status).toBe('stopped-at-cap');
    expect(t.calls.send).toHaveLength(1);
  });

  it('refuses a cap above CAP_USD before any call', async () => {
    const dir = tmp();
    const t = mockTransport();
    await expect(
      runInteractive({ ...baseOpts(dir, t, { cap: CAP_USD + 1 }), requests: [req('k1')] })
    ).rejects.toThrow(/CAP_USD/);
    expect(t.calls.countTokens).toHaveLength(0);
  });
});

describe('refusals before any spend', () => {
  it.each([
    ['an invalid body', [req('k1', { temperature: 0 })], {}],
    ['a duplicated key', [req('k1'), req('k1')], {}],
    ['an empty request list', [], {}],
    ['an unknown model', [req('k1', { model: 'claude-x' })], { model: 'claude-x' }],
    [
      'an absolute prompt path',
      [req('k1')],
      { prompts: [{ path: '/home/x/p.md', sha256: 'a'.repeat(64) }] },
    ],
    ['a bad prompt sha256', [req('k1')], { prompts: [{ path: 'p.md', sha256: 'xyz' }] }],
    ['a bad use name', [req('k1')], { use: 'AI pass' }],
  ])('refuses %s, calling nothing and writing nothing', async (_n, requests, extra) => {
    const dir = tmp();
    const t = mockTransport();
    await expect(runInteractive({ ...baseOpts(dir, t, extra), requests })).rejects.toThrow();
    await expect(runBatch({ ...baseOpts(dir, t, extra), requests })).rejects.toThrow();
    expect(Object.values(t.calls).every((c) => c.length === 0)).toBe(true);
    expect(fs.readdirSync(dir)).toEqual([]);
  });

  it('refuses loudly with no transport and no API key', async () => {
    const dir = tmp();
    const keyOptions = { env: {}, envFile: path.join(dir, 'absent.env') };
    const opts = { ...baseOpts(dir, undefined), keyOptions, requests: [req('k1')] };
    await expect(runInteractive(opts)).rejects.toThrow(/ANTHROPIC_API_KEY/);
    await expect(runBatch(opts)).rejects.toThrow(/ANTHROPIC_API_KEY/);
    expect(fs.readdirSync(dir)).toEqual([]);
  });

  it('refuses to reuse an existing run id for an interactive run', async () => {
    const dir = tmp();
    const out = await runInteractive({ ...baseOpts(dir, mockTransport()), requests: [req('k1')] });
    await expect(
      runInteractive({
        ...baseOpts(dir, mockTransport()),
        runId: out.runId,
        requests: [req('k1')],
      })
    ).rejects.toThrow(/exists/);
  });
});

describe('runBatch — the flow on a mock transport', () => {
  function batchResults() {
    return [
      { custom_id: 'q000000', result: { type: 'succeeded', message: message() } },
      {
        custom_id: 'q000001',
        result: { type: 'succeeded', message: message({ stop_reason: 'refusal', content: [] }) },
      },
      {
        custom_id: 'q000002',
        result: { type: 'errored', error: { type: 'invalid_request_error', message: 'bad' } },
      },
    ];
  }

  it('records the batch id before polling, keys results by custom_id, and settles once', async () => {
    const dir = tmp();
    let batchJsonSeenAtFirstPoll = null;
    const sleeps = [];
    const t = mockTransport({
      results: batchResults,
      onGetBatch: () => {
        if (batchJsonSeenAtFirstPoll !== null) return;
        const runs = fs.readdirSync(path.join(dir, 'runs'));
        const p = path.join(dir, 'runs', runs[0], 'batch.json');
        batchJsonSeenAtFirstPoll = fs.existsSync(p)
          ? JSON.parse(fs.readFileSync(p, 'utf8'))
          : false;
      },
    });
    const out = await runBatch({
      ...baseOpts(dir, t, { sleep: async (ms) => sleeps.push(ms), pollIntervalMs: 1234 }),
      requests: [req('k0'), req('k1'), req('k2')],
    });
    expect(out.status).toBe('complete');
    expect(batchJsonSeenAtFirstPoll).toMatchObject({ batchId: 'msgbatch_mock' });
    expect(t.calls.submitBatch).toHaveLength(1);
    expect(t.calls.submitBatch[0].map((r) => r.custom_id)).toEqual([
      'q000000',
      'q000001',
      'q000002',
    ]);
    expect(t.calls.submitBatch[0][0].params).toEqual(req('k0').body);
    expect(t.calls.getBatch).toHaveLength(2);
    expect(sleeps).toEqual([1234]);

    const responses = readJsonl(path.join(out.runDir, 'responses.jsonl'));
    expect(responses).toHaveLength(2);
    const byId = Object.fromEntries(responses.map((r) => [r.custom_id, r]));
    expect(byId.q000000).toMatchObject({ key: 'k0', outcome: 'succeeded' });
    expect(byId.q000001).toMatchObject({ key: 'k1', outcome: 'refusal' });
    expect(byId.q000000.costUsd).toBeCloseTo(ACTUAL / 2, 12);
    const errors = readJsonl(path.join(out.runDir, 'errors.jsonl'));
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({ custom_id: 'q000002', key: 'k2', stage: 'batch_result' });

    const entries = readLedger(path.join(dir, 'ledger.jsonl'));
    expect(entries.map((e) => e.type)).toEqual(['reserve', 'settle', 'release']);
    expect(entries[0].usd).toBeCloseTo((3 * WORST) / 2, 12);
    expect(entries[1].usd).toBeCloseTo(ACTUAL, 12); // two billed results at half price
    expect(summarizeLedger(entries).openUsd).toBe(0);

    const end = JSON.parse(fs.readFileSync(path.join(out.runDir, 'run-end.json'), 'utf8'));
    expect(end).toMatchObject({ status: 'complete', batchId: 'msgbatch_mock' });
    expect(end.counts).toMatchObject({ planned: 3, sent: 3, succeeded: 1, refusal: 1, errored: 1 });
  });

  it('uses a supplied token estimate instead of counting', async () => {
    const dir = tmp();
    const t = mockTransport();
    await runBatch({
      ...baseOpts(dir, t),
      requests: [req('k0', {}, { inputTokensEstimate: 100 })],
    });
    expect(t.calls.countTokens).toHaveLength(0);
    const [r] = readLedger(path.join(dir, 'ledger.jsonl'));
    expect(r.usd).toBeCloseTo(WORST / 2, 12);
  });

  it('refuses at the cap without submitting', async () => {
    const dir = tmp();
    const t = mockTransport();
    const out = await runBatch({
      ...baseOpts(dir, t, { cap: 0.01 }),
      requests: [req('k0'), req('k1')],
    });
    expect(out.status).toBe('stopped-at-cap');
    expect(t.calls.submitBatch).toHaveLength(0);
    expect(fs.existsSync(path.join(out.runDir, 'batch.json'))).toBe(false);
    expect(readLedger(path.join(dir, 'ledger.jsonl'))).toEqual([]);
  });

  it('records a missing result and an unknown custom_id as errors', async () => {
    const dir = tmp();
    const t = mockTransport({
      results: () => [
        { custom_id: 'q000000', result: { type: 'succeeded', message: message() } },
        { custom_id: 'q999999', result: { type: 'succeeded', message: message() } },
      ],
    });
    const out = await runBatch({ ...baseOpts(dir, t), requests: [req('k0'), req('k1')] });
    const errors = readJsonl(path.join(out.runDir, 'errors.jsonl'));
    expect(errors.map((e) => e.stage).sort()).toEqual(['missing_result', 'unknown_custom_id']);
    expect(errors.find((e) => e.stage === 'missing_result').key).toBe('k1');
  });
});

describe('runBatch — resume', () => {
  it('resumes an unfinished batch instead of resubmitting it', async () => {
    const dir = tmp();
    const requests = [req('k0'), req('k1')];
    const first = mockTransport({ pollsUntilEnded: Infinity });
    const out1 = await runBatch({ ...baseOpts(dir, first, { maxPolls: 1 }), requests });
    expect(out1.status).toBe('pending');
    expect(first.calls.submitBatch).toHaveLength(1);
    expect(summarizeLedger(readLedger(path.join(dir, 'ledger.jsonl'))).openUsd).toBeGreaterThan(0);

    const second = mockTransport({
      pollsUntilEnded: 1,
      results: () =>
        ['q000000', 'q000001'].map((id) => ({
          custom_id: id,
          result: { type: 'succeeded', message: message() },
        })),
    });
    const out2 = await runBatch({ ...baseOpts(dir, second), runId: out1.runId });
    expect(out2.status).toBe('complete');
    expect(second.calls.submitBatch).toHaveLength(0);
    expect(second.calls.getBatch).toEqual(['msgbatch_mock']);
    const entries = readLedger(path.join(dir, 'ledger.jsonl'));
    expect(entries.map((e) => e.type)).toEqual(['reserve', 'settle', 'release']);
    expect(summarizeLedger(entries).openUsd).toBe(0);
    expect(readJsonl(path.join(out2.runDir, 'responses.jsonl'))).toHaveLength(2);
  });

  it('after a crash mid-results, records each result once and settles once', async () => {
    const dir = tmp();
    const requests = [req('k0'), req('k1'), req('k2')];
    const all = () =>
      ['q000000', 'q000001', 'q000002'].map((id) => ({
        custom_id: id,
        result: { type: 'succeeded', message: message() },
      }));
    const first = mockTransport({ pollsUntilEnded: 1, results: all, resultsThrowAfter: 1 });
    await expect(runBatch({ ...baseOpts(dir, first), requests })).rejects.toThrow(/connection/);
    const runId = fs.readdirSync(path.join(dir, 'runs'))[0];
    expect(readJsonl(path.join(dir, 'runs', runId, 'responses.jsonl'))).toHaveLength(1);

    const second = mockTransport({ pollsUntilEnded: 1, results: all });
    const out = await runBatch({ ...baseOpts(dir, second), runId });
    expect(out.status).toBe('complete');
    const responses = readJsonl(path.join(out.runDir, 'responses.jsonl'));
    expect(responses.map((r) => r.custom_id).sort()).toEqual(['q000000', 'q000001', 'q000002']);
    const entries = readLedger(path.join(dir, 'ledger.jsonl'));
    expect(entries.filter((e) => e.type === 'settle')).toHaveLength(1);
    expect(entries.find((e) => e.type === 'settle').usd).toBeCloseTo((3 * ACTUAL) / 2, 12);
  });

  it('after a crash between settling and run-end, finishes without settling again', async () => {
    const dir = tmp();
    const requests = [req('k0')];
    const first = await runBatch({
      ...baseOpts(dir, mockTransport({ pollsUntilEnded: 1 })),
      requests,
    });
    fs.rmSync(path.join(first.runDir, 'run-end.json')); // the crash: settled, no run-end
    const out = await runBatch({
      ...baseOpts(dir, mockTransport({ pollsUntilEnded: 1, results: () => [] })),
      runId: first.runId,
    });
    expect(out.status).toBe('complete');
    const entries = readLedger(path.join(dir, 'ledger.jsonl'));
    expect(entries.map((e) => e.type)).toEqual(['reserve', 'settle', 'release']);
    expect(readJsonl(path.join(out.runDir, 'responses.jsonl'))).toHaveLength(1);
  });

  it('refuses to resume when a submit may have happened but recorded no batch id', async () => {
    const dir = tmp();
    const first = mockTransport({ submitError: new Error('socket hang up') });
    const out1 = await runBatch({ ...baseOpts(dir, first), requests: [req('k0')] });
    expect(out1.status).toBe('submit-unknown');
    expect(summarizeLedger(readLedger(path.join(dir, 'ledger.jsonl'))).openUsd).toBeGreaterThan(0);
    const second = mockTransport();
    await expect(runBatch({ ...baseOpts(dir, second), runId: out1.runId })).rejects.toThrow(
      /may have been submitted/
    );
    expect(second.calls.submitBatch).toHaveLength(0);
  });

  it('releases the reservation when the API definitively rejected the submit', async () => {
    const dir = tmp();
    const t = mockTransport({
      submitError: sdkLikeError({ status: 400, type: 'invalid_request_error', message: 'bad' }),
    });
    const out = await runBatch({ ...baseOpts(dir, t), requests: [req('k0')] });
    expect(out.status).toBe('submit-failed');
    expect(summarizeLedger(readLedger(path.join(dir, 'ledger.jsonl'))).openUsd).toBe(0);
  });

  it('refuses to resume with requests that differ from the recorded ones', async () => {
    const dir = tmp();
    const first = mockTransport({ pollsUntilEnded: Infinity });
    const out1 = await runBatch({
      ...baseOpts(dir, first, { maxPolls: 1 }),
      requests: [req('k0')],
    });
    await expect(
      runBatch({ ...baseOpts(dir, mockTransport()), runId: out1.runId, requests: [req('k9')] })
    ).rejects.toThrow(/differ/);
  });

  it('refuses to resume a finished run', async () => {
    const dir = tmp();
    const out = await runBatch({ ...baseOpts(dir, mockTransport()), requests: [req('k0')] });
    await expect(runBatch({ ...baseOpts(dir, mockTransport()), runId: out.runId })).rejects.toThrow(
      /finished/
    );
  });
});

describe('one record shape for both modes', () => {
  it('batch and interactive write the same fields in every record file', async () => {
    const dirA = tmp();
    const dirB = tmp();
    const a = await runInteractive({
      ...baseOpts(dirA, mockTransport()),
      requests: [req('k0'), req('k1')],
    });
    const b = await runBatch({
      ...baseOpts(dirB, mockTransport()),
      requests: [req('k0'), req('k1')],
    });
    const keys = (o) => Object.keys(o).sort();
    for (const f of ['requests.jsonl', 'responses.jsonl']) {
      const la = readJsonl(path.join(a.runDir, f));
      const lb = readJsonl(path.join(b.runDir, f));
      expect(la.length).toBe(2);
      expect(lb.length).toBe(2);
      expect(keys(la[0])).toEqual(keys(lb[0]));
    }
    for (const f of ['run.json', 'run-end.json']) {
      const ja = JSON.parse(fs.readFileSync(path.join(a.runDir, f), 'utf8'));
      const jb = JSON.parse(fs.readFileSync(path.join(b.runDir, f), 'utf8'));
      expect(keys(ja)).toEqual(keys(jb));
      expect(keys(ja.counts ?? {})).toEqual(keys(jb.counts ?? {}));
    }
  });
});

describe('the live transport through an injected fetch', () => {
  function fakeApi() {
    const seen = [];
    let polls = 0;
    let submitted = [];
    const json = (o, status = 200) =>
      new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json' } });
    const fetch = async (input, init = {}) => {
      const url = typeof input === 'string' ? input : input.url;
      const method = init.method ?? 'GET';
      const headers = new Headers(init.headers ?? {});
      const body = typeof init.body === 'string' ? JSON.parse(init.body) : undefined;
      seen.push({ url, method, headers, body });
      const { pathname } = new URL(url);
      if (pathname === '/v1/messages/count_tokens') return json({ input_tokens: 100 });
      if (pathname === '/v1/messages') return json(message());
      if (pathname === '/v1/messages/batches' && method === 'POST') {
        submitted = body.requests;
        return json({ id: 'msgbatch_live', processing_status: 'in_progress', request_counts: {} });
      }
      if (pathname === '/v1/messages/batches/msgbatch_live') {
        polls++;
        return json({
          id: 'msgbatch_live',
          processing_status: polls >= 2 ? 'ended' : 'in_progress',
          request_counts: {},
          results_url: 'https://api.anthropic.com/v1/messages/batches/msgbatch_live/results',
        });
      }
      if (pathname === '/v1/messages/batches/msgbatch_live/results') {
        const lines = submitted.map((r) =>
          JSON.stringify({
            custom_id: r.custom_id,
            result: { type: 'succeeded', message: message() },
          })
        );
        return new Response(lines.join('\n') + '\n', { status: 200 });
      }
      return json({ type: 'error', error: { type: 'not_found_error', message: pathname } }, 404);
    };
    return { fetch, seen };
  }

  it('writes the bogus key nowhere, while the key really was sent on the wire', async () => {
    const dir = tmp();
    const api = fakeApi();
    const transport = createAnthropicTransport({ apiKey: BOGUS_KEY, fetch: api.fetch });
    const opts = { ...baseOpts(dir, transport), secrets: [BOGUS_KEY] };
    const a = await runInteractive({ ...opts, requests: [req('k0'), req('k1')] });
    const b = await runBatch({ ...opts, requests: [req('k0'), req('k1')] });
    expect(a.status).toBe('complete');
    expect(b.status).toBe('complete');

    // control: the key was in play
    expect(api.seen.length).toBeGreaterThan(0);
    expect(api.seen.every((s) => s.headers.get('authorization') === `Bearer ${BOGUS_KEY}`)).toBe(
      true
    );

    const files = walk(dir);
    expect(files.length).toBeGreaterThanOrEqual(10); // two run dirs + the ledger
    for (const f of files) {
      const text = fs.readFileSync(f, 'latin1');
      expect(text, f).not.toContain(BOGUS_KEY);
      expect(text, f).not.toMatch(/authorization|bearer|x-api-key/i);
    }

    const run = JSON.parse(fs.readFileSync(path.join(a.runDir, 'run.json'), 'utf8'));
    expect(run.anthropicVersion).toBe(api.seen[0].headers.get('anthropic-version'));
    expect(run.sdk).toEqual(sdkInfo());
  });

  it('a batch over the live transport records the same shape as the mock', async () => {
    const dir = tmp();
    const api = fakeApi();
    const transport = createAnthropicTransport({ apiKey: BOGUS_KEY, fetch: api.fetch });
    const out = await runBatch({ ...baseOpts(dir, transport), requests: [req('k0')] });
    const [r] = readJsonl(path.join(out.runDir, 'responses.jsonl'));
    expect(r).toMatchObject({
      custom_id: 'q000000',
      key: 'k0',
      outcome: 'succeeded',
      model: MODEL,
    });
    expect(r.costUsd).toBeCloseTo(ACTUAL / 2, 12);
  });
});
