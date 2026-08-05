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
    // Captured at entry: a handler that throws can leave req in any state, and
    // these two fields are the ones the log is useless without.
    const { method, path } = req;

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
        // On an aborted response statusCode is still its 200 default, which
        // nobody ever received. Reporting it would print a comforting fiction
        // about a request that failed.
        status: completed ? res.statusCode : null,
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
