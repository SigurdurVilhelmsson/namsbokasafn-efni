// server/__tests__/saveRetryQueue.test.js
/**
 * Behavioral tests for the save-retry queue (item 13, finding 8) — the first
 * non-static coverage of this module, via createSaveRetry's injectable deps.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { createSaveRetry, DEFAULT_KEY_POLICIES } = require('../public/js/saveRetry');

function makeHarness({ clock, keyPolicies } = {}) {
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
  // Fire exactly the oldest live timer (models a single scheduled retry firing
  // while others stay pending — needed to interleave an in-flight retry with a
  // newer save). Awaits only the timer callback, NOT the fetch it schedules, so
  // a deferred fetch entry stays in flight after this resolves.
  const fireNext = async () => {
    const [id, t] = [...timers.entries()][0];
    timers.delete(id);
    await t.fn();
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
    now: () => (clock ? clock.t : 1_000_000),
    toast: (message, type) => toasts.push({ message, type }),
    keyPolicies,
  });
  const queue = () => JSON.parse(store.get('saveRetryQueue') || '[]');
  return {
    sr,
    queue,
    timers,
    fireAllTimers,
    fireNext,
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

describe('saveRetry stale in-flight completion (final-review finding B)', () => {
  // Drain the microtask+macrotask queue so a resolved fetch's .then/.catch runs.
  const tick = () => new Promise((r) => setImmediate(r));

  // A fetch-script entry whose promise the test resolves by hand — models a
  // retry fetch that is still in flight while a newer save arrives.
  function makeDeferred() {
    let resolveFn;
    const promise = new Promise((res) => {
      resolveFn = res;
    });
    return { entry: () => promise, resolve: (v) => resolveFn(v) };
  }
  const res500 = { ok: false, status: 500, json: () => Promise.resolve({}) };
  const res200 = { ok: true, status: 200, json: () => Promise.resolve({}) };
  const res409 = { ok: false, status: 409, json: () => Promise.resolve({}) };

  it('stale retry-again completion does not evict the newer entry nor cancel its timer', async () => {
    const h = makeHarness();
    const stale = makeDeferred();
    // [attempt V1 fails] [timer1 retry — in flight] [attempt V2 fails] [timer2 retry ok]
    h.setFetchScript([h.fail500(), stale.entry, h.fail500(), h.ok()]);

    await h.sr.attempt('seg:k1', '/api/x', { method: 'POST', body: 'V1' }).catch(() => {});
    const qid1 = h.queue()[0].qid;

    // timer1 fires → its retry fetch is deferred (in flight).
    await h.fireNext();

    // While the stale retry is in flight, V2 fails and replaces the entry (qid2).
    await h.sr.attempt('seg:k1', '/api/x', { method: 'POST', body: 'V2' }).catch(() => {});
    const qid2 = h.queue()[0].qid;
    expect(qid2).not.toBe(qid1);
    expect(h.queue()[0].options.body).toBe('V2');

    // The stale (qid1) retry now completes with a retryable 5xx.
    stale.resolve(res500);
    await tick();

    // The newer entry survives untouched — no re-queue of qid1 over qid2.
    expect(h.queue()).toHaveLength(1);
    expect(h.queue()[0].qid).toBe(qid2);
    expect(h.queue()[0].options.body).toBe('V2');

    // …and V2's timer still fires and posts V2's body.
    await h.fireNext();
    expect(h.fetchCalls[h.fetchCalls.length - 1].options.body).toBe('V2');
  });

  it('stale terminal-failure completion does not remove the newer entry', async () => {
    const h = makeHarness();
    const stale = makeDeferred();
    h.setFetchScript([h.fail500(), stale.entry, h.fail500()]);

    await h.sr.attempt('seg:k1', '/api/x', { method: 'POST', body: 'V1' }).catch(() => {});
    await h.fireNext();
    await h.sr.attempt('seg:k1', '/api/x', { method: 'POST', body: 'V2' }).catch(() => {});
    const qid2 = h.queue()[0].qid;

    // Non-retryable 4xx on the stale retry → terminal (removeFromQueue) branch.
    stale.resolve(res409);
    await tick();

    expect(h.queue()).toHaveLength(1);
    expect(h.queue()[0].qid).toBe(qid2);
    expect(h.queue()[0].options.body).toBe('V2');
  });

  it('stale success completion does not remove the newer entry nor show a success toast', async () => {
    const h = makeHarness();
    const stale = makeDeferred();
    h.setFetchScript([h.fail500(), stale.entry, h.fail500()]);

    await h.sr.attempt('seg:k1', '/api/x', { method: 'POST', body: 'V1' }).catch(() => {});
    await h.fireNext();
    await h.sr.attempt('seg:k1', '/api/x', { method: 'POST', body: 'V2' }).catch(() => {});
    const qid2 = h.queue()[0].qid;
    const successBefore = h.toasts.filter((t) => t.type === 'success').length;

    // A late success on the stale retry must not purge the newer save.
    stale.resolve(res200);
    await tick();

    expect(h.queue()).toHaveLength(1);
    expect(h.queue()[0].qid).toBe(qid2);
    expect(h.toasts.filter((t) => t.type === 'success').length).toBe(successBefore);
  });
});

const res = (status, body) => () =>
  Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(body) });
const notJson = (status) => () =>
  Promise.resolve({ ok: false, status, json: () => Promise.reject(new SyntaxError('html')) });
const settle = async () => {
  for (let i = 0; i < 3; i++) await new Promise((r) => setImmediate(r));
};
const DAY = 24 * 60 * 60 * 1000;

describe('saveRetry refusal codes (G1.1, spec §5.18, T23)', () => {
  it('a non-retryable answer carries err.code and err.data, and is not queued', async () => {
    const h = makeHarness();
    const body = { error: 'STALE_BASE', message: 'Textinn hefur breyst.' };
    h.setFetchScript([res(409, body)]);
    const err = await h.sr.attempt('seg:b/1/m:s1', '/api/x', { method: 'POST' }).catch((e) => e);
    expect(err.status).toBe(409);
    expect(err.code).toBe('STALE_BASE');
    expect(err.data).toEqual(body);
    expect(err.message).toBe('Textinn hefur breyst.');
    expect(h.queue()).toEqual([]);
  });

  it('control: a 5xx carries no code and is queued', async () => {
    const h = makeHarness();
    h.setFetchScript([res(500, { error: 'boom' })]);
    const err = await h.sr.attempt('seg:b/1/m:s1', '/api/x', { method: 'POST' }).catch((e) => e);
    expect(err.code).toBeUndefined();
    expect(h.queue()).toHaveLength(1);
  });

  it("a refusal whose body is not JSON keeps today's message and has no code", async () => {
    const h = makeHarness();
    h.setFetchScript([notJson(409)]);
    const err = await h.sr.attempt('seg:b/1/m:s1', '/api/x', { method: 'POST' }).catch((e) => e);
    expect(err.message).toBe('Villa 409');
    expect(err.code).toBeUndefined();
    expect(err.data).toBeUndefined();
  });
});

describe('saveRetry key policies: replays marked, refused or exhausted replays parked (§5.9, §5.6, decision 28)', () => {
  const BODY = JSON.stringify({ segmentId: 's1', editedContent: 'typed', clientActionId: 'a1' });

  it('marks a replay replayed: true and leaves the stored entry as sent', async () => {
    const h = makeHarness();
    h.sr.setKeyPolicy('seg:', { markReplayed: true });
    h.setFetchScript([h.fail500(), h.ok()]);
    await h.sr.attempt('seg:b/1/m:s1', '/api/x', { method: 'POST', body: BODY }).catch(() => {});
    expect(h.queue()[0].options.body).toBe(BODY);
    await h.fireAllTimers();
    expect(h.fetchCalls[0].options.body).toBe(BODY); // the live attempt carries no flag
    expect(JSON.parse(h.fetchCalls[1].options.body)).toEqual({
      ...JSON.parse(BODY),
      replayed: true,
    });
  });

  it("control: a key with no policy replays byte-identical (the Pass 2 editor's keys)", async () => {
    const h = makeHarness();
    h.sr.setKeyPolicy('seg:', { markReplayed: true });
    h.setFetchScript([h.fail500(), h.ok()]);
    await h.sr.attempt('loc:b/1/m:s1', '/api/x', { method: 'POST', body: BODY }).catch(() => {});
    await h.fireAllTimers();
    expect(h.fetchCalls[1].options.body).toBe(BODY);
  });

  it('DEFAULT_KEY_POLICIES mark a seg: and an acc: replay with no page policy; loc: is untouched (decision 27)', async () => {
    const h = makeHarness({ keyPolicies: DEFAULT_KEY_POLICIES }); // what the browser wiring passes, on every page
    h.setFetchScript([h.fail500(), h.fail500(), h.fail500(), h.ok(), h.ok(), h.ok()]);
    for (const key of ['seg:b/1/m:s1', 'acc:b/1/m:s1', 'loc:b/1/m:s1']) {
      await h.sr
        .attempt(key, `/api/${key.slice(0, 3)}`, { method: 'POST', body: BODY })
        .catch(() => {});
    }
    await h.fireAllTimers();
    const replays = Object.fromEntries(h.fetchCalls.slice(3).map((c) => [c.url, c.options.body]));
    expect(JSON.parse(replays['/api/seg'])).toEqual({ ...JSON.parse(BODY), replayed: true });
    expect(JSON.parse(replays['/api/acc'])).toEqual({ ...JSON.parse(BODY), replayed: true });
    expect(replays['/api/loc']).toBe(BODY); // control: the Pass 2 editor's key replays byte-identical
  });

  it('the browser wiring registers DEFAULT_KEY_POLICIES before it schedules processQueue', () => {
    const src = require('fs').readFileSync(require.resolve('../public/js/saveRetry'), 'utf-8');
    const wiring = src.slice(src.indexOf('root.saveRetry = createSaveRetry('));
    expect(wiring).toMatch(/keyPolicies:\s*DEFAULT_KEY_POLICIES/);
    expect(wiring.indexOf('keyPolicies')).toBeLessThan(wiring.indexOf('processQueue'));
  });

  it('parks a 409 answered to a replay, hands it to the owner once, and empties the queue', async () => {
    const h = makeHarness();
    const seen = [];
    h.sr.setKeyPolicy('seg:', { parkRefused: true, onParked: (item) => seen.push(item) });
    h.setFetchScript([h.fail500(), res(409, { error: 'STALE_BASE', message: 'm' })]);
    await h.sr.attempt('seg:b/1/m:s1', '/api/x', { method: 'POST', body: BODY }).catch(() => {});
    await h.fireAllTimers();
    await settle();
    const parked = {
      key: 'seg:b/1/m:s1',
      url: '/api/x',
      body: BODY,
      status: 409,
      code: 'STALE_BASE',
      message: 'm',
      parkedAt: 1_000_000,
    };
    expect(seen).toEqual([parked]);
    expect(h.queue()).toEqual([]);
    expect(h.toasts.at(-1).message).toMatch(/geymdur/);
    expect(h.sr.takeParked('seg:b/1/m:')).toEqual([parked]);
    expect(h.sr.takeParked('seg:b/1/m:')).toEqual([]); // taken once
  });

  it("control: the same refusal on a key with no policy is dropped with today's toast", async () => {
    const h = makeHarness();
    h.sr.setKeyPolicy('seg:', { parkRefused: true });
    h.setFetchScript([h.fail500(), res(409, { error: 'conflict', message: 'm' })]);
    await h.sr.attempt('loc:b/1/m:s1', '/api/x', { method: 'POST', body: BODY }).catch(() => {});
    await h.fireAllTimers();
    await settle();
    expect(h.sr.takeParked('loc:')).toEqual([]);
    expect(h.toasts.at(-1).message).toMatch(/Vista mistókst eftir/);
  });

  it('parks any non-5xx answer to a replay, a 404 too (spec §5.6, decision 28); a 5xx is retried instead', async () => {
    const h = makeHarness();
    h.sr.setKeyPolicy('seg:', { parkRefused: true });
    h.setFetchScript([h.fail500(), res(404, { error: 'segment not found' })]);
    await h.sr.attempt('seg:b/1/m:s1', '/api/x', { method: 'POST', body: BODY }).catch(() => {});
    await h.fireAllTimers();
    await settle();
    expect(
      h.sr.takeParked('seg:b/1/m:s1', { exact: true }).map((p) => [p.key, p.status, p.code])
    ).toEqual([['seg:b/1/m:s1', 404, 'segment not found']]);
    // Control, same harness: a 5xx answered to a replay is queued again, never parked.
    h.setFetchScript([h.fail500(), h.fail500()]);
    await h.sr.attempt('seg:b/1/m:s2', '/api/x', { method: 'POST', body: BODY }).catch(() => {});
    await h.fireAllTimers();
    await settle();
    expect(h.sr.takeParked('seg:b/1/m:s2', { exact: true })).toEqual([]);
    expect(h.queue().map((q) => q.key)).toEqual(['seg:b/1/m:s2']);
  });

  // [USER] 2026-11-04 (decision 28): a 5xx that exhausts MAX_ATTEMPTS (3) is parked too. The policy goes in through
  // deps, as the browser wiring passes DEFAULT_KEY_POLICIES, so the red run reaches today's terminal branch instead of
  // stopping at a missing setKeyPolicy. Three rounds: the live 5xx queues attempt 1, replays 1 and 2 re-queue, and
  // replay 3 has no attempt left.
  const exhaust = async (h) => {
    for (let round = 0; round < 3; round++) {
      await h.fireAllTimers();
      await settle();
    }
  };

  it('parks a 5xx that exhausts the retries, with its status and code, and hands it to the owner', async () => {
    const seen = [];
    const h = makeHarness({
      keyPolicies: [{ prefix: 'seg:', parkRefused: true, onParked: (item) => seen.push(item) }],
    });
    h.setFetchScript([
      h.fail500(),
      h.fail500(),
      h.fail500(),
      res(503, { error: 'unavailable', message: 'm' }),
    ]);
    await h.sr.attempt('seg:b/1/m:s1', '/api/x', { method: 'POST', body: BODY }).catch(() => {});
    await exhaust(h);
    expect(h.fetchCalls).toHaveLength(4); // the live attempt and three replays: nothing was cut short
    expect(h.toasts.at(-1).message).toBe(
      'Vista mistókst eftir 3 tilraunir — textinn var geymdur og birtist aftur í bútnum.'
    );
    const parked = {
      key: 'seg:b/1/m:s1',
      url: '/api/x',
      body: BODY,
      status: 503,
      code: 'unavailable',
      message: 'm',
      parkedAt: 1_000_000,
    };
    expect(seen).toEqual([parked]);
    expect(h.queue()).toEqual([]);
    expect(h.sr.takeParked('seg:b/1/m:s1', { exact: true })).toEqual([parked]);
  });

  it('an exhausted 5xx whose body is not JSON parks with no code', async () => {
    const h = makeHarness({ keyPolicies: [{ prefix: 'seg:', parkRefused: true }] });
    h.setFetchScript([h.fail500(), h.fail500(), h.fail500(), notJson(502)]);
    await h.sr.attempt('seg:b/1/m:s1', '/api/x', { method: 'POST', body: BODY }).catch(() => {});
    await exhaust(h);
    expect(h.sr.takeParked('seg:').map((p) => [p.status, p.code, p.message])).toEqual([
      [502, null, null],
    ]);
  });

  it("control: a key with no policy still drops an exhausted 5xx with today's toast", async () => {
    const h = makeHarness({ keyPolicies: [{ prefix: 'seg:', parkRefused: true }] });
    h.setFetchScript([h.fail500(), h.fail500(), h.fail500(), h.fail500()]);
    await h.sr.attempt('loc:b/1/m:s1', '/api/x', { method: 'POST', body: BODY }).catch(() => {});
    await exhaust(h);
    expect(h.toasts.at(-1).message).toBe(
      'Vista mistókst eftir 3 tilraunir. Vinsamlegast reyndu aftur.'
    );
    expect(h.queue()).toEqual([]);
    expect(h.sr.takeParked('loc:')).toEqual([]);
  });

  // [USER] 2026-11-04, a later answer (decision 28): a replay whose NETWORK failures exhaust MAX_ATTEMPTS is kept too.
  // A fetch that reaches no server rejects with a TypeError, which isRetryableError counts as a network failure, so
  // the replay's .catch handles it, not the .then above. The same three rounds as `exhaust`.
  const netFail = () => () => Promise.reject(new TypeError('Failed to fetch'));

  it('parks a replay whose network failures exhaust the retries, with no status or code, and hands it to the owner', async () => {
    const seen = [];
    const h = makeHarness({
      keyPolicies: [{ prefix: 'seg:', parkRefused: true, onParked: (item) => seen.push(item) }],
    });
    h.setFetchScript([netFail(), netFail(), netFail(), netFail()]);
    await h.sr.attempt('seg:b/1/m:s1', '/api/x', { method: 'POST', body: BODY }).catch(() => {});
    await exhaust(h);
    expect(h.fetchCalls).toHaveLength(4); // the live attempt and three replays: nothing was cut short
    expect(h.toasts.at(-1).message).toBe(
      'Vista mistókst eftir 3 tilraunir — textinn var geymdur og birtist aftur í bútnum.'
    );
    const parked = {
      key: 'seg:b/1/m:s1',
      url: '/api/x',
      body: BODY,
      status: null, // no answer reached the page: how a parked item says "network"
      code: null,
      message: null,
      parkedAt: 1_000_000,
    };
    expect(seen).toEqual([parked]);
    expect(h.queue()).toEqual([]);
    expect(h.sr.takeParked('seg:b/1/m:s1', { exact: true })).toEqual([parked]);
  });

  it('control: a network failure with an attempt left is retried, not parked, and a later 200 succeeds', async () => {
    const seen = [];
    const h = makeHarness({
      keyPolicies: [{ prefix: 'seg:', parkRefused: true, onParked: (item) => seen.push(item) }],
    });
    h.setFetchScript([netFail(), netFail(), netFail(), h.ok()]);
    await h.sr.attempt('seg:b/1/m:s1', '/api/x', { method: 'POST', body: BODY }).catch(() => {});
    for (let round = 0; round < 2; round++) {
      await h.fireAllTimers();
      await settle();
    }
    // Two replays failed on the network: the item waits for its last attempt, and nothing is parked.
    expect(h.queue().map((q) => [q.key, q.attempts])).toEqual([['seg:b/1/m:s1', 3]]);
    expect(seen).toEqual([]);
    await h.fireAllTimers();
    await settle();
    expect(h.fetchCalls).toHaveLength(4);
    expect(h.toasts.at(-1)).toEqual({ message: 'Vista tókst eftir endurtilraun', type: 'success' });
    expect(h.queue()).toEqual([]);
    expect(seen).toEqual([]);
    expect(h.sr.takeParked('seg:')).toEqual([]);
  });

  it('control: a key with no policy still drops a replay whose network failures exhaust the retries', async () => {
    const h = makeHarness({ keyPolicies: [{ prefix: 'seg:', parkRefused: true }] });
    h.setFetchScript([netFail(), netFail(), netFail(), netFail()]);
    await h.sr.attempt('loc:b/1/m:s1', '/api/x', { method: 'POST', body: BODY }).catch(() => {});
    await exhaust(h);
    expect(h.fetchCalls).toHaveLength(4);
    expect(h.toasts.at(-1).message).toBe(
      'Vista mistókst eftir 3 tilraunir. Vinsamlegast reyndu aftur.'
    );
    expect(h.queue()).toEqual([]);
    expect(h.sr.takeParked('loc:')).toEqual([]);
  });

  // The .catch parking branch's other half: only a failure isRetryableError counts as a network failure parks. Any
  // other rejection (here a plain Error: not a TypeError, no status) keeps today's drop on a parkRefused key too.
  // Its positive control is the network-exhausted test above: the same key, policy and position, with a TypeError.
  it('control: a last replay that fails with an error other than a network failure is dropped, not parked', async () => {
    const seen = [];
    const h = makeHarness({
      keyPolicies: [{ prefix: 'seg:', parkRefused: true, onParked: (item) => seen.push(item) }],
    });
    h.setFetchScript([netFail(), netFail(), netFail(), () => Promise.reject(new Error('x'))]);
    await h.sr.attempt('seg:b/1/m:s1', '/api/x', { method: 'POST', body: BODY }).catch(() => {});
    await exhaust(h);
    expect(h.fetchCalls).toHaveLength(4);
    expect(h.toasts.at(-1).message).toBe(
      'Vista mistókst eftir 3 tilraunir. Vinsamlegast reyndu aftur.'
    );
    expect(h.queue()).toEqual([]);
    expect(seen).toEqual([]);
    expect(h.sr.takeParked('seg:')).toEqual([]);
  });

  it('a 409 to the LIVE attempt is never parked: the caller keeps that text', async () => {
    const h = makeHarness();
    const seen = [];
    h.sr.setKeyPolicy('seg:', { parkRefused: true, onParked: (item) => seen.push(item) });
    h.setFetchScript([res(409, { error: 'STALE_BASE', message: 'm' })]);
    const err = await h.sr
      .attempt('seg:b/1/m:s1', '/api/x', { method: 'POST', body: BODY })
      .catch((e) => e);
    expect(err.code).toBe('STALE_BASE');
    expect(seen).toEqual([]);
    expect(h.sr.takeParked('seg:')).toEqual([]);
  });

  it('takeParked with exact: true takes one key, not every key it prefixes', async () => {
    const h = makeHarness();
    h.sr.setKeyPolicy('seg:', { parkRefused: true });
    h.setFetchScript([
      h.fail500(),
      h.fail500(),
      res(409, { error: 'conflict' }),
      res(409, { error: 'conflict' }),
    ]);
    await h.sr.attempt('seg:b/1/m:s1', '/api/x', { method: 'POST', body: BODY }).catch(() => {});
    await h.sr.attempt('seg:b/1/m:s10', '/api/x', { method: 'POST', body: BODY }).catch(() => {});
    await h.fireAllTimers();
    await settle();
    expect(h.sr.takeParked('seg:b/1/m:s1', { exact: true }).map((p) => p.key)).toEqual([
      'seg:b/1/m:s1',
    ]);
    // Control: a prefix take would have taken both; the other is still there.
    expect(h.sr.takeParked('seg:b/1/m:s1').map((p) => p.key)).toEqual(['seg:b/1/m:s10']);
  });

  it('processQueue drops a parked item older than 7 days and keeps a younger one', async () => {
    const clock = { t: 1_000_000 };
    const h = makeHarness({ clock });
    h.sr.setKeyPolicy('seg:', { parkRefused: true });
    h.setFetchScript([h.fail500(), res(409, { error: 'conflict' })]);
    await h.sr.attempt('seg:b/1/m:old', '/api/x', { method: 'POST', body: BODY }).catch(() => {});
    await h.fireAllTimers();
    await settle();
    clock.t += 6 * DAY;
    h.setFetchScript([h.fail500(), res(409, { error: 'conflict' })]);
    await h.sr.attempt('seg:b/1/m:new', '/api/x', { method: 'POST', body: BODY }).catch(() => {});
    await h.fireAllTimers();
    await settle();
    clock.t += 2 * DAY; // old is 8 days, new is 2
    h.sr.processQueue();
    expect(h.sr.takeParked('seg:').map((p) => p.key)).toEqual(['seg:b/1/m:new']);
  });
});
