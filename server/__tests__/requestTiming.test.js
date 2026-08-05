/**
 * Request-timing middleware (register C23).
 *
 * C23 came from a live nginx 504 that left NO server-side trace. The whole
 * point of these tests is that the middleware must survive the shape of that
 * incident, so the aborted-request cases are the load-bearing ones, not the
 * happy path.
 *
 * Measured on Node v22.22.2 with a real http server (see the C23 register
 * entry): a normal response emits `finish` then `close`; a response whose
 * client goes away mid-handler emits ONLY `close`, with
 * `res.writableFinished === false`. A middleware listening on `finish` would
 * therefore have logged nothing at all for the incident that motivated it.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'events';
import { createRequestTimer, DEFAULT_SLOW_REQUEST_MS } from '../middleware/requestTiming.js';

/** Collects pino-shaped calls: logger.info(fields, message). */
function fakeLogger() {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    calls: function (level) {
      return this[level].mock.calls.map(([fields, message]) => ({ fields, message }));
    },
  };
}

function fakeReq({ method = 'GET', path = '/api/books' } = {}) {
  return {
    method,
    path,
    // Present so a test can prove the middleware does NOT log it: originalUrl
    // carries the query string, and /api/auth/callback?code=… would put a live
    // OAuth authorization code into the logs.
    originalUrl: `${path}?code=SECRET-OAUTH-CODE`,
  };
}

function fakeRes({ statusCode = 200 } = {}) {
  const res = new EventEmitter();
  res.statusCode = statusCode;
  res.writableFinished = false;
  /** Normal completion: Node sets writableFinished before emitting close. */
  res.complete = () => {
    res.writableFinished = true;
    res.emit('close');
  };
  /** Client (nginx) gave up mid-handler: close only, writableFinished false. */
  res.abort = () => {
    res.writableFinished = false;
    res.emit('close');
  };
  return res;
}

/**
 * Drives one request through the middleware with a controlled elapsed time.
 * `now` is injected so duration is decided by the test, not the clock.
 */
function runRequest(timer, { req, res, elapsedMs, clock }) {
  clock.value = 0;
  timer(req, res, () => {});
  clock.value = elapsedMs;
}

describe('createRequestTimer', () => {
  let clock;
  let now;

  beforeEach(() => {
    vi.useFakeTimers();
    clock = { value: 0 };
    now = () => clock.value;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('calls next() so the request continues down the stack', () => {
    const timer = createRequestTimer({ logger: fakeLogger(), thresholdMs: 1000, now });
    const next = vi.fn();

    timer(fakeReq(), fakeRes(), next);

    expect(next).toHaveBeenCalledOnce();
  });

  it('logs a completed request at info with its duration', () => {
    const logger = fakeLogger();
    const timer = createRequestTimer({ logger, thresholdMs: 1000, now });
    const res = fakeRes({ statusCode: 200 });

    runRequest(timer, {
      req: fakeReq({ method: 'POST', path: '/api/tm' }),
      res,
      elapsedMs: 42,
      clock,
    });
    res.complete();

    expect(logger.calls('info')).toEqual([
      {
        fields: { method: 'POST', path: '/api/tm', status: 200, duration_ms: 42, completed: true },
        message: 'request',
      },
    ]);
  });

  it('does not warn when a request finishes under the threshold', () => {
    const logger = fakeLogger();
    const timer = createRequestTimer({ logger, thresholdMs: 1000, now });
    const res = fakeRes();

    runRequest(timer, { req: fakeReq(), res, elapsedMs: 999, clock });
    res.complete();

    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('warns instead of info when a completed request exceeds the threshold', () => {
    const logger = fakeLogger();
    const timer = createRequestTimer({ logger, thresholdMs: 1000, now });
    const res = fakeRes({ statusCode: 200 });

    runRequest(timer, { req: fakeReq({ path: '/api/terminology' }), res, elapsedMs: 1500, clock });
    res.complete();

    expect(logger.calls('warn')).toEqual([
      {
        fields: {
          method: 'GET',
          path: '/api/terminology',
          status: 200,
          duration_ms: 1500,
          completed: true,
        },
        message: 'slow request',
      },
    ]);
    expect(logger.info).not.toHaveBeenCalled();
  });

  // ─── The C23 incident shape ────────────────────────────────────────────────

  it('logs an aborted request, which emits close without finish', () => {
    const logger = fakeLogger();
    const timer = createRequestTimer({ logger, thresholdMs: 1000, now });
    const res = fakeRes();

    runRequest(timer, {
      req: fakeReq({ path: '/api/segment-editor' }),
      res,
      elapsedMs: 60_000,
      clock,
    });
    res.abort();

    const [entry] = logger.calls('warn');
    expect(entry.fields).toMatchObject({
      path: '/api/segment-editor',
      duration_ms: 60_000,
      completed: false,
    });
  });

  it('reports no status for an aborted request, because none was ever sent', () => {
    const logger = fakeLogger();
    const timer = createRequestTimer({ logger, thresholdMs: 1000, now });
    // Express leaves statusCode at its 200 default on a response nobody read.
    const res = fakeRes({ statusCode: 200 });

    runRequest(timer, { req: fakeReq(), res, elapsedMs: 60_000, clock });
    res.abort();

    expect(logger.calls('warn')[0].fields.status).toBeNull();
  });

  it('logs a fast abort at info rather than warning, so navigating away is not an alarm', () => {
    const logger = fakeLogger();
    const timer = createRequestTimer({ logger, thresholdMs: 1000, now });
    const res = fakeRes();

    runRequest(timer, { req: fakeReq(), res, elapsedMs: 12, clock });
    res.abort();

    expect(logger.warn).not.toHaveBeenCalled();
    expect(logger.calls('info')[0].fields).toMatchObject({ completed: false, duration_ms: 12 });
  });

  // ─── In-flight watchdog ────────────────────────────────────────────────────
  // A close-time-only design logs nothing if the process dies mid-request.
  // Register C20 (live, P1) is an uncaught stream error that kills this exact
  // process, and C23's own incident included an unexplained 1,236 MB RSS spike.

  it('warns while a request is still in flight, before it has completed', () => {
    const logger = fakeLogger();
    const timer = createRequestTimer({ logger, thresholdMs: 1000, now });

    timer(fakeReq({ path: '/api/publication' }), fakeRes(), () => {});
    vi.advanceTimersByTime(1000);

    expect(logger.calls('warn')).toEqual([
      {
        fields: { method: 'GET', path: '/api/publication', threshold_ms: 1000 },
        message: 'request still in flight',
      },
    ]);
  });

  it('cancels the in-flight warning when the request finishes in time', () => {
    const logger = fakeLogger();
    const timer = createRequestTimer({ logger, thresholdMs: 1000, now });
    const res = fakeRes();

    runRequest(timer, { req: fakeReq(), res, elapsedMs: 10, clock });
    res.complete();
    vi.advanceTimersByTime(60_000);

    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('does not hold the event loop open with its watchdog timer', () => {
    const timer = createRequestTimer({ logger: fakeLogger(), thresholdMs: 1000, now });
    const unref = vi.spyOn(globalThis, 'setTimeout');

    timer(fakeReq(), fakeRes(), () => {});

    // The returned handle must have been unref'd, or an in-flight request
    // would keep the process alive through a graceful shutdown.
    expect(unref.mock.results[0].value.hasRef()).toBe(false);
  });

  // ─── Credential-leak guard ─────────────────────────────────────────────────

  it('logs req.path only, never the query string', () => {
    const logger = fakeLogger();
    const timer = createRequestTimer({ logger, thresholdMs: 1000, now });
    const res = fakeRes();

    runRequest(timer, { req: fakeReq({ path: '/api/auth/callback' }), res, elapsedMs: 5, clock });
    res.complete();

    const logged = JSON.stringify(logger.calls('info'));
    expect(logged).not.toContain('SECRET-OAUTH-CODE');
    expect(logged).toContain('/api/auth/callback');
  });

  // ─── Default threshold ─────────────────────────────────────────────────────

  it('exports a default threshold, so index.js never repeats the literal', () => {
    expect(DEFAULT_SLOW_REQUEST_MS).toBeTypeOf('number');
    expect(DEFAULT_SLOW_REQUEST_MS).toBeGreaterThan(0);
  });

  it('falls back to the default threshold when none is supplied', () => {
    const logger = fakeLogger();
    const timer = createRequestTimer({ logger, now });
    const res = fakeRes();

    runRequest(timer, { req: fakeReq(), res, elapsedMs: DEFAULT_SLOW_REQUEST_MS + 1, clock });
    res.complete();

    expect(logger.warn).toHaveBeenCalledOnce();
  });
});
