/**
 * Request-duration logging (register C23).
 *
 * Replaces the entry-only `log.info({method, path}, 'request')` that used to
 * sit inline in index.js. That line recorded that a request *arrived*; it
 * never recorded how long one took, so p95 latency on this server was
 * unknowable and a 504 named no endpoint.
 *
 * ⚠️ DO NOT re-hang this on `res.on('finish')`. C23 came from a live nginx
 * 504: nginx gave up, dropped the upstream connection, and the Node handler
 * was still running — so `finish` never fired. Measured on Node v22.22.2 with
 * a real server:
 *
 *   normal   →  finish(writableFinished=true) → close(writableFinished=true)
 *   aborted  →  close(writableFinished=false)                  ← no finish
 *
 * `close` fires in both cases and `res.writableFinished` tells them apart, so
 * `close` is the only listener that can see the incident this exists for.
 *
 * ⚠️ Log `req.path`, never `req.originalUrl`. originalUrl carries the query
 * string, and /api/auth/callback?code=… would write a live OAuth
 * authorization code to disk. logger.js's `redact` covers headers only — it
 * would not save us.
 */

/**
 * Two orders of magnitude above normal. Measured on prod during the C23
 * incident: /api/health answers in 2.7 ms and every ch3 module loads in 5 ms,
 * so anything past a second is pathological rather than merely large. This is
 * only the *alarm* threshold — every request's duration is logged at info
 * regardless, which is what makes p95 computable at all.
 */
const DEFAULT_SLOW_REQUEST_MS = 1000;

/**
 * @param {object} p
 * @param {{info: Function, warn: Function}} p.logger — pino-shaped: (fields, message).
 * @param {number} [p.thresholdMs] — warn above this. Injected by index.js from
 *   SLOW_REQUEST_MS so the number is not repeated there.
 * @param {() => number} [p.now] — monotonic milliseconds. Injected so tests
 *   decide duration instead of the clock.
 * @returns {import('express').RequestHandler}
 */
function createRequestTimer({
  logger,
  thresholdMs = DEFAULT_SLOW_REQUEST_MS,
  now = () => performance.now(),
}) {
  return function requestTimer(req, res, next) {
    const start = now();

    // ⚠️ CAPTURED AT ENTRY, and that is load-bearing. Express strips a
    // router's mount prefix from req.url during dispatch and only restores it
    // on the way out, so req.path read inside the close handler is the
    // POST-STRIP value whenever the client aborts mid-dispatch. Measured on
    // express 5.2.1: '/api/segment-editor/module/hang' at entry,
    // '/module/hang' at close. index.js mounts 19 routers under /api/…, so
    // reading it late would name no endpoint in exactly the aborted-request
    // case this exists to diagnose.
    const { method, path } = req;

    // ⚠️ The client can already be gone before we are reached. express.static
    // is mounted above this and does an async fs.stat before calling next(),
    // so 'close' can fire in that window — before res.once('close') below is
    // attached. That listener then never fires while the watchdog still does,
    // leaving a lone 'request still in flight' warning with no terminal
    // partner: the precise signature this file documents as "the process died
    // mid-request" (register C20). An observability feature that manufactures
    // false instances of the incident class it detects is worse than none.
    // Measured against the real stack before this guard: 30 of 200 aborting
    // requests. Deliberately carries NO duration_ms — the request cannot be
    // timed, and a fictitious 0 would drag p95 down.
    if (res.closed) {
      logger.info({ method, path, completed: false }, 'request closed before timing');
      return next();
    }

    // In-flight warning. A close-time-only design logs NOTHING if the process
    // dies mid-request — and register C20 (live, P1) is an uncaught archive
    // stream error that kills this exact process, while C23's own incident
    // included an unexplained 1,236 MB RSS spike. This line is emitted while
    // the request is still hanging, so it survives both.
    const watchdog = setTimeout(() => {
      logger.warn({ method, path, threshold_ms: thresholdMs }, 'request still in flight');
    }, thresholdMs);
    // Without unref(), every in-flight request would hold the event loop open
    // through the graceful-shutdown path in index.js.
    watchdog.unref();

    res.once('close', () => {
      clearTimeout(watchdog);

      const duration_ms = Math.round(now() - start);
      const completed = res.writableFinished === true;
      const fields = {
        method,
        path,
        // Keyed on headersSent, NOT on `completed`. A response truncated
        // mid-body did send a real status line, and collapsing it to null
        // would make it byte-identical to a request that never answered at
        // all — the one distinction this log exists to draw. When no headers
        // went out, statusCode is still its 200 default, which nobody ever
        // received; reporting that would be a comforting fiction.
        status: res.headersSent ? res.statusCode : null,
        duration_ms,
        completed,
      };

      if (duration_ms >= thresholdMs) {
        logger.warn(fields, 'slow request');
      } else {
        logger.info(fields, 'request');
      }
    });

    next();
  };
}

module.exports = { createRequestTimer, DEFAULT_SLOW_REQUEST_MS };
