// server/__tests__/saveRetryQueue.test.js
/**
 * Behavioral tests for the save-retry queue (item 13, finding 8) — the first
 * non-static coverage of this module, via createSaveRetry's injectable deps.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { createSaveRetry } = require('../public/js/saveRetry');

function makeHarness() {
  const store = new Map();
  const storage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  };
  let nextTimer = 1;
  const timers = new Map();
  const setTimeoutFn = (fn, delay) => {
    const id = nextTimer++;
    timers.set(id, { fn, delay });
    return id;
  };
  const clearTimeoutFn = (id) => timers.delete(id);
  const fireAllTimers = async () => {
    const batch = [...timers.values()];
    timers.clear();
    for (const t of batch) await t.fn();
  };
  const fetchCalls = [];
  let fetchScript = [];
  const ok = (body) => () =>
    Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body || {}) });
  const fail500 = () => () =>
    Promise.resolve({ ok: false, status: 500, json: () => Promise.resolve({}) });
  const fetchFn = (url, options) => {
    fetchCalls.push({ url, options });
    const next = fetchScript.shift();
    return (next || ok())();
  };
  const toasts = [];
  const sr = createSaveRetry({
    fetch: fetchFn,
    storage,
    setTimeout: setTimeoutFn,
    clearTimeout: clearTimeoutFn,
    now: () => 1_000_000,
    toast: (message, type) => toasts.push({ message, type }),
  });
  const queue = () => JSON.parse(store.get('saveRetryQueue') || '[]');
  return {
    sr,
    queue,
    timers,
    fireAllTimers,
    fetchCalls,
    toasts,
    setFetchScript: (s) => (fetchScript = s),
    ok,
    fail500,
    store,
  };
}

describe('saveRetry factory smoke (behavior-preserving refactor)', () => {
  it('successful save resolves with parsed JSON and queues nothing', async () => {
    const h = makeHarness();
    h.setFetchScript([h.ok({ success: true })]);
    const result = await h.sr.attempt('seg:k1', '/api/x', { method: 'POST' });
    expect(result).toEqual({ success: true });
    expect(h.queue()).toEqual([]);
    expect(h.timers.size).toBe(0);
  });

  it('5xx failure queues the item, schedules a retry, and rejects', async () => {
    const h = makeHarness();
    h.setFetchScript([h.fail500()]);
    await expect(h.sr.attempt('seg:k1', '/api/x', { method: 'POST' })).rejects.toThrow(
      /reyni aftur/
    );
    expect(h.queue()).toHaveLength(1);
    expect(h.timers.size).toBe(1);
  });

  it('queued retry that succeeds removes the entry', async () => {
    const h = makeHarness();
    h.setFetchScript([h.fail500(), h.ok()]);
    await h.sr.attempt('seg:k1', '/api/x', { method: 'POST' }).catch(() => {});
    await h.fireAllTimers();
    expect(h.queue()).toEqual([]);
  });
});

describe('saveRetry stale-replay cancellation (finding 8)', () => {
  it('a successful save purges an earlier failed save queued under the same key', async () => {
    const h = makeHarness();
    h.setFetchScript([h.fail500(), h.ok()]);
    await h.sr.attempt('seg:k1', '/api/x', { method: 'POST', body: 'OLD' }).catch(() => {});
    expect(h.queue()).toHaveLength(1);

    await h.sr.attempt('seg:k1', '/api/x', { method: 'POST', body: 'NEW' });
    expect(h.queue()).toEqual([]); // entry purged
    expect(h.timers.size).toBe(0); // timer cancelled

    await h.fireAllTimers(); // nothing scheduled — the stale body can never replay
    expect(h.fetchCalls.filter((c) => c.options.body === 'OLD')).toHaveLength(1); // only the original attempt
  });

  it('a firing timer aborts silently when its entry was removed (cross-tab success)', async () => {
    const h = makeHarness();
    h.setFetchScript([h.fail500()]);
    await h.sr.attempt('seg:k1', '/api/x', { method: 'POST', body: 'OLD' }).catch(() => {});
    expect(h.timers.size).toBe(1);

    h.store.delete('saveRetryQueue'); // another tab's success cleared storage
    const callsBefore = h.fetchCalls.length;
    await h.fireAllTimers();
    expect(h.fetchCalls.length).toBe(callsBefore); // no replay fetch
    expect(h.toasts.filter((t) => t.type === 'error').length).toBe(1); // only the original failure toast
  });

  it('a newer failed save replaces the entry AND cancels the old timer (one live timer per key)', async () => {
    const h = makeHarness();
    h.setFetchScript([h.fail500(), h.fail500(), h.ok()]);
    await h.sr.attempt('seg:k1', '/api/x', { method: 'POST', body: 'V1' }).catch(() => {});
    await h.sr.attempt('seg:k1', '/api/x', { method: 'POST', body: 'V2' }).catch(() => {});

    expect(h.queue()).toHaveLength(1);
    expect(h.queue()[0].options.body).toBe('V2');
    expect(h.timers.size).toBe(1); // old timer cancelled, exactly one live

    await h.fireAllTimers();
    const retryBodies = h.fetchCalls.slice(2).map((c) => c.options.body);
    expect(retryBodies).toEqual(['V2']); // V1 never replays
  });

  it('retry uses the STORED entry, not the timer closure copy', async () => {
    const h = makeHarness();
    h.setFetchScript([h.fail500(), h.ok()]);
    await h.sr.attempt('seg:k1', '/api/x', { method: 'POST', body: 'V1' }).catch(() => {});
    // Simulate another tab replacing the entry's body but keeping key+qid
    // (degenerate but pins the read-from-storage contract).
    const q = h.queue();
    q[0].options.body = 'V1-updated';
    h.store.set('saveRetryQueue', JSON.stringify(q));
    await h.fireAllTimers();
    expect(h.fetchCalls[h.fetchCalls.length - 1].options.body).toBe('V1-updated');
  });
});
