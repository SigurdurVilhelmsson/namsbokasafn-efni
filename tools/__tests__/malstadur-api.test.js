import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  createClient,
  MalstadurApiError,
  SYNC_CHAR_LIMIT,
  estimateIsk,
  ISK_PER_1000_CHARS,
} from '../lib/malstadur-api.js';

// Build a minimal fetch Response stand-in. apiRequest reads .ok/.status and
// .json() on success, .json()/.text() on error.
function mockResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
  };
}

// rateDelayMs:0 neutralizes the rate limiter so the only timers are
// withRetry's backoff and pollTask's interval — both fast-forwarded by
// vi.runAllTimersAsync() under fake timers.
function makeClient(opts = {}) {
  return createClient({ apiKey: 'test-key', rateDelayMs: 0, ...opts });
}

let fetchMock;

beforeEach(() => {
  vi.useFakeTimers();
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('translateAuto routing at the 10K boundary', () => {
  it('routes text <= SYNC_CHAR_LIMIT to the sync endpoint', async () => {
    fetchMock.mockResolvedValueOnce(mockResponse(200, { text: 'þýtt', usage: {} }));
    const client = makeClient();

    const promise = client.translateAuto('a'.repeat(SYNC_CHAR_LIMIT));
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result.text).toBe('þýtt');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toContain('/v1/translate');
    expect(fetchMock.mock.calls[0][0]).not.toContain('/tasks');
  });

  it('routes text > SYNC_CHAR_LIMIT to the async submit+poll path', async () => {
    fetchMock
      .mockResolvedValueOnce(mockResponse(200, { taskId: 't1' })) // submit
      .mockResolvedValueOnce(
        mockResponse(200, { status: 'completed', result: { text: 'langt' }, usage: {} })
      ); // poll
    const client = makeClient();

    const promise = client.translateAuto('a'.repeat(SYNC_CHAR_LIMIT + 1));
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result.text).toBe('langt');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][0]).toContain('/v1/translate/tasks');
    expect(fetchMock.mock.calls[1][0]).toContain('/v1/translate/tasks/t1');
  });
});

describe('pollTask', () => {
  it('returns the text on a completed task', async () => {
    fetchMock.mockResolvedValueOnce(
      mockResponse(200, { status: 'completed', result: { text: 'búið' }, usage: {} })
    );
    const client = makeClient();

    const promise = client.pollTask('t1', { pollIntervalMs: 1 });
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result.text).toBe('búið');
  });

  it('throws when the task reports failed', async () => {
    fetchMock.mockResolvedValueOnce(mockResponse(200, { status: 'failed', error: 'boom' }));
    const client = makeClient();

    const promise = client.pollTask('t1', { pollIntervalMs: 1 });
    const assertion = expect(promise).rejects.toThrow(/failed: boom/);
    await vi.runAllTimersAsync();
    await assertion;
  });

  it('throws after exhausting maxAttempts (timeout)', async () => {
    fetchMock.mockResolvedValue(mockResponse(200, { status: 'pending' }));
    const client = makeClient();

    const promise = client.pollTask('t1', { pollIntervalMs: 1, maxAttempts: 3 });
    const assertion = expect(promise).rejects.toThrow(/timed out after 3 polls/);
    await vi.runAllTimersAsync();
    await assertion;

    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('recovers from a transient 5xx during a poll (A4)', async () => {
    fetchMock
      .mockResolvedValueOnce(mockResponse(503, { error: 'upstream busy' })) // transient
      .mockResolvedValueOnce(
        mockResponse(200, { status: 'completed', result: { text: 'náðist' }, usage: {} })
      );
    const client = makeClient();

    const promise = client.pollTask('t1', { pollIntervalMs: 1 });
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result.text).toBe('náðist');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not retry a 4xx during a poll (client error)', async () => {
    fetchMock.mockResolvedValue(mockResponse(404, { error: 'no such task' }));
    const client = makeClient();

    const promise = client.pollTask('t1', { pollIntervalMs: 1 });
    const assertion = expect(promise).rejects.toBeInstanceOf(MalstadurApiError);
    await vi.runAllTimersAsync();
    await assertion;

    // 4xx (non-429) is not retried -> exactly one GET
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('withRetry behaviour via the sync path', () => {
  it('retries a 5xx then succeeds', async () => {
    fetchMock
      .mockResolvedValueOnce(mockResponse(500, { error: 'oops' }))
      .mockResolvedValueOnce(mockResponse(200, { text: 'allt í lagi', usage: {} }));
    const client = makeClient();

    const promise = client.translate('hello');
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result.text).toBe('allt í lagi');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not retry a 400 client error', async () => {
    fetchMock.mockResolvedValue(mockResponse(400, { error: 'bad request' }));
    const client = makeClient();

    const promise = client.translate('hello');
    const assertion = expect(promise).rejects.toBeInstanceOf(MalstadurApiError);
    await vi.runAllTimersAsync();
    await assertion;

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

// ─── Cost estimator (audit #31) ───────────────────────────────────
// Málstaður price is 1 ISK per 100 chars (10 ISK per 1000). The estimator
// previously used (chars*5)/1000 = 0.5 ISK/100 — half the true rate.
describe('estimateIsk', () => {
  it('charges 1 ISK per 100 characters (10 ISK / 1000)', () => {
    expect(estimateIsk(100)).toBe(1);
    expect(estimateIsk(1000)).toBe(10);
  });
  it('returns 0 for empty input', () => {
    expect(estimateIsk(0)).toBe(0);
  });
  it('scales linearly (4,691,298 chars ≈ 46,913 ISK)', () => {
    expect(Math.round(estimateIsk(4_691_298))).toBe(46_913);
  });
  it('exposes the rate constant as 10 ISK / 1000 chars', () => {
    expect(ISK_PER_1000_CHARS).toBe(10);
  });
});
