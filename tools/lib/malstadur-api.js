/**
 * malstadur-api.js — Client library for the Miðeind Málstaður translation API
 *
 * Provides sync and async translation endpoints, glossary support,
 * rate limiting, retry with exponential backoff, and usage tracking.
 *
 * Authentication: set MALSTADUR_API_KEY environment variable.
 *
 * @example
 * import { createClient } from './lib/malstadur-api.js';
 * const client = createClient();
 * const result = await client.translate('Hello world', { targetLanguage: 'is' });
 * console.log(result.text); // Icelandic translation
 */

import { findGlossaryCollisions } from './glossary-collisions.js';

// ─── Constants ──────────────────────────────────────────────────────

const API_BASE = 'https://api.malstadur.is';
const SYNC_CHAR_LIMIT = 10_000;
const DEFAULT_RATE_DELAY_MS = 500;
const MAX_RETRIES = 3;
const INITIAL_BACKOFF_MS = 1000;
const ASYNC_POLL_INTERVAL_MS = 2000;
const ASYNC_MAX_POLL_ATTEMPTS = 180; // 6 minutes at 2s intervals

// Málstaður/Erlendur price: 1 ISK per 100 characters = 10 ISK per 1,000.
// (lead-confirmed 2026-06-30; was wrongly 5/1000 — audit #31)
const ISK_PER_1000_CHARS = 10;

/**
 * Estimate translation cost in ISK for a character count.
 * Single source of truth for the rate (used by the usage tracker and the
 * api-translate dry-run estimate).
 * @param {number} chars
 * @returns {number} estimated ISK
 */
function estimateIsk(chars) {
  return (chars * ISK_PER_1000_CHARS) / 1000;
}

// ─── Usage Tracker ──────────────────────────────────────────────────

function createUsageTracker() {
  const stats = {
    totalChars: 0,
    totalCost: 0,
    requestCount: 0,
    failedCount: 0,
    startTime: Date.now(),
  };

  return {
    record(usage) {
      if (usage) {
        stats.totalChars += usage.units || 0;
        stats.totalCost += usage.cost || 0;
      }
      stats.requestCount++;
    },
    recordFailure() {
      stats.failedCount++;
    },
    getStats() {
      return {
        ...stats,
        elapsedMs: Date.now() - stats.startTime,
        estimatedISK: estimateIsk(stats.totalChars),
      };
    },
  };
}

// ─── Rate Limiter ───────────────────────────────────────────────────

function createRateLimiter(delayMs) {
  let lastRequestTime = 0;

  return async function waitForSlot() {
    const now = Date.now();
    const elapsed = now - lastRequestTime;
    if (elapsed < delayMs) {
      await new Promise((resolve) => setTimeout(resolve, delayMs - elapsed));
    }
    lastRequestTime = Date.now();
  };
}

// ─── Retry Logic ────────────────────────────────────────────────────

async function withRetry(
  fn,
  { maxRetries = MAX_RETRIES, initialBackoff = INITIAL_BACKOFF_MS } = {}
) {
  let lastError;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;

      // Don't retry on client errors (except 429 rate limit)
      if (
        err.statusCode &&
        err.statusCode >= 400 &&
        err.statusCode < 500 &&
        err.statusCode !== 429
      ) {
        throw err;
      }

      if (attempt < maxRetries) {
        const backoff = initialBackoff * Math.pow(2, attempt);
        await new Promise((resolve) => setTimeout(resolve, backoff));
      }
    }
  }

  throw lastError;
}

// ─── API Error ──────────────────────────────────────────────────────

class MalstadurApiError extends Error {
  constructor(message, statusCode, body) {
    super(message);
    this.name = 'MalstadurApiError';
    this.statusCode = statusCode;
    this.body = body;
  }
}

// ─── Core HTTP ──────────────────────────────────────────────────────

async function apiRequest(apiKey, method, endpoint, body = null) {
  const url = `${API_BASE}${endpoint}`;
  const headers = {
    'X-API-KEY': apiKey,
    Accept: 'application/json',
  };

  const options = { method, headers };

  if (body !== null) {
    headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(body);
  }

  const response = await fetch(url, options);

  if (!response.ok) {
    let errorBody;
    try {
      errorBody = await response.json();
    } catch {
      errorBody = await response.text().catch(() => '(no body)');
    }
    throw new MalstadurApiError(
      `API ${method} ${endpoint} returned ${response.status}: ${typeof errorBody === 'string' ? errorBody : JSON.stringify(errorBody)}`,
      response.status,
      errorBody
    );
  }

  return response.json();
}

// ─── Glossary Helpers ───────────────────────────────────────────────

/**
 * Convert project glossary terms to API glossary format.
 *
 * Malformed entries are DROPPED rather than sent: a blank side (empty or
 * whitespace-only) or a non-string side on either `english` or `icelandic`.
 * Málstaður rejects a glossary containing a blank word with a 400 that fails
 * the WHOLE request, so one malformed row would kill an entire paid
 * translation chunk. Dropping costs one term of MT priming; sending costs the
 * batch. The count is surfaced by `options.onSkipped` so the loss is visible,
 * not silent.
 *
 * The type check is not pedantry: `String({})` is '[object Object]' and
 * `String(['a'])` is 'a', so a coercing guard would pass wrong-typed values
 * through as plausible-looking words. This is a boundary function taking
 * arbitrary arrays from two producers plus an audit harness.
 *
 * ⚠️ The returned object IS the outbound request body — filterGlossaryForText
 * spreads it and this module assigns it to `body.glossaries`. Do NOT add keys
 * to it: they would be sent to a third party and count against the character
 * budget whose overflow triggers a truncation-retry. Report out-of-band.
 *
 * @param {Array<{english: string, icelandic: string, status?: string}>} terms
 * @param {object} [options]
 * @param {string} [options.domain='chemistry'] - Domain label for the glossary
 * @param {boolean} [options.approvedOnly=true] - Only include approved terms
 * @param {(dropped: Array<object>) => void} [options.onSkipped] - Called once with
 *   the dropped entries, when any were dropped. Reporting channel only.
 * @param {(report: {omitted: Array<{sourceWord: string, targetWord: string}>, competitions: Array<object>, commaLists: Array<object>}) => void} [options.onOmitted] - Called when
 *   glossary terms are omitted due to competitions or comma-separated lists.
 * @returns {{domain: string, sourceLanguage: string, targetLanguage: string,
 *   terms: Array<{sourceWord: string, targetWord: string}>}} API-formatted glossary
 */
function formatGlossary(
  terms,
  { domain = 'chemistry', approvedOnly = true, onSkipped, onOmitted } = {}
) {
  const filtered = approvedOnly ? terms.filter((t) => t.status === 'approved') : terms;

  // C18: an unresolved competition must not prime MT at all. Sending both
  // atom→frumeind AND atom→atóm in one request is a contradiction the API
  // resolves however it likes. Omitting BOTH candidates is deliberate —
  // picking one here would be an unreviewed editorial decision.
  //
  // Detected over the POST-FILTER set, because callers disagree on
  // approvedOnly (api-translate.js passes true, translate-chapter-titles.js
  // passes false), so "what competes" depends on what is actually being sent.
  const { competitions, commaLists } = findGlossaryCollisions(filtered, { approvedOnly: false });
  const competingKeys = new Set(competitions.map((c) => c.english));
  const listValues = new Set(commaLists.map((c) => c.value));

  const usable = [];
  const skipped = [];
  const omitted = [];
  for (const t of filtered) {
    const sourceWord = typeof t.english === 'string' ? t.english.trim() : '';
    const targetWord = typeof t.icelandic === 'string' ? t.icelandic.trim() : '';
    if (!sourceWord || !targetWord) {
      skipped.push(t);
      continue;
    }
    if (competingKeys.has(sourceWord.toLowerCase()) || listValues.has(targetWord)) {
      omitted.push({ sourceWord, targetWord });
      continue;
    }
    usable.push({ sourceWord, targetWord });
  }

  if (skipped.length > 0 && typeof onSkipped === 'function') {
    onSkipped(skipped);
  }
  if (omitted.length > 0 && typeof onOmitted === 'function') {
    onOmitted({ omitted, competitions, commaLists });
  }

  // ⚠️ This object IS the outbound request body (see :242, body.glossaries).
  // Never add a field here — reporting goes through the callbacks above.
  return {
    domain,
    sourceLanguage: 'en',
    targetLanguage: 'is',
    terms: usable,
  };
}

// ─── Client Factory ─────────────────────────────────────────────────

/**
 * Create a Málstaður API client.
 *
 * @param {object} [options]
 * @param {string} [options.apiKey] - API key (defaults to MALSTADUR_API_KEY env var)
 * @param {number} [options.rateDelayMs=500] - Minimum ms between requests
 * @param {number} [options.maxRetries=3] - Max retry attempts on transient errors
 * @returns {object} Client with translate, translateAsync, pollTask, listGlossaries methods
 */
function createClient(options = {}) {
  const apiKey = options.apiKey || process.env.MALSTADUR_API_KEY;

  if (!apiKey) {
    throw new Error(
      'Málstaður API key required. Set MALSTADUR_API_KEY environment variable ' +
        'or pass apiKey option.'
    );
  }

  const rateDelay = options.rateDelayMs ?? DEFAULT_RATE_DELAY_MS;
  const maxRetries = options.maxRetries ?? MAX_RETRIES;
  const rateLimiter = createRateLimiter(rateDelay);
  const usage = createUsageTracker();

  /**
   * Translate text synchronously (max 10,000 characters).
   *
   * @param {string} text - Text to translate
   * @param {object} [opts]
   * @param {string} [opts.targetLanguage='is'] - Target language code
   * @param {Array} [opts.glossaries] - API-formatted glossary objects
   * @returns {Promise<{text: string, usage: object}>}
   */
  async function translate(text, opts = {}) {
    if (text.length > SYNC_CHAR_LIMIT) {
      throw new Error(
        `Text exceeds sync limit (${text.length} > ${SYNC_CHAR_LIMIT} chars). ` +
          `Use translateAsync() for longer texts.`
      );
    }

    const body = {
      text,
      targetLanguage: opts.targetLanguage || 'is',
    };

    if (opts.glossaries && opts.glossaries.length > 0) {
      body.glossaries = opts.glossaries;
    }

    await rateLimiter();

    try {
      const result = await withRetry(() => apiRequest(apiKey, 'POST', '/v1/translate', body), {
        maxRetries,
      });
      usage.record(result.usage);
      return result;
    } catch (err) {
      usage.recordFailure();
      throw err;
    }
  }

  /**
   * Submit text for asynchronous translation (for texts > 10K chars).
   *
   * @param {string} text - Text to translate
   * @param {object} [opts]
   * @param {string} [opts.targetLanguage='is'] - Target language code
   * @param {Array} [opts.glossaries] - API-formatted glossary objects
   * @returns {Promise<{taskId: string}>}
   */
  async function translateAsync(text, opts = {}) {
    const body = {
      text,
      targetLanguage: opts.targetLanguage || 'is',
    };

    if (opts.glossaries && opts.glossaries.length > 0) {
      body.glossaries = opts.glossaries;
    }

    await rateLimiter();

    try {
      const result = await withRetry(
        () => apiRequest(apiKey, 'POST', '/v1/translate/tasks', body),
        { maxRetries }
      );
      return result;
    } catch (err) {
      usage.recordFailure();
      throw err;
    }
  }

  /**
   * Poll an async translation task until complete.
   *
   * @param {string} taskId
   * @param {object} [opts]
   * @param {number} [opts.pollIntervalMs=2000] - Polling interval
   * @param {number} [opts.maxAttempts=180] - Max poll attempts
   * @param {function} [opts.onPoll] - Called with task status on each poll
   * @returns {Promise<{text: string, usage: object}>}
   */
  async function pollTask(taskId, opts = {}) {
    const interval = opts.pollIntervalMs || ASYNC_POLL_INTERVAL_MS;
    const maxAttempts = opts.maxAttempts || ASYNC_MAX_POLL_ATTEMPTS;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      await rateLimiter();
      // Wrap the poll GET in withRetry so a transient blip (5xx/429) on a
      // single poll doesn't fail the whole module — parity with the wrapped
      // submit/translate calls. 4xx (non-429) still fails fast.
      const task = await withRetry(
        () => apiRequest(apiKey, 'GET', `/v1/translate/tasks/${taskId}`),
        { maxRetries }
      );

      if (opts.onPoll) opts.onPoll(task);

      if (task.status === 'completed' || task.result?.text) {
        usage.record(task.usage);
        // Normalize: async returns text in task.result.text, sync returns it in task.text
        return { text: task.result?.text || task.text, usage: task.usage };
      }

      if (task.status === 'failed' || task.status === 'error') {
        usage.recordFailure();
        throw new MalstadurApiError(
          `Async task ${taskId} failed: ${task.error || 'unknown error'}`,
          null,
          task
        );
      }

      // Still processing — wait before next poll
      await new Promise((resolve) => setTimeout(resolve, interval));
    }

    throw new MalstadurApiError(
      `Async task ${taskId} timed out after ${maxAttempts} polls`,
      null,
      null
    );
  }

  /**
   * Translate text, automatically choosing sync or async based on length.
   *
   * @param {string} text - Text to translate
   * @param {object} [opts] - Same options as translate/translateAsync
   * @returns {Promise<{text: string, usage: object}>}
   */
  async function translateAuto(text, opts = {}) {
    if (text.length <= SYNC_CHAR_LIMIT) {
      return translate(text, opts);
    }
    const { taskId } = await translateAsync(text, opts);
    return pollTask(taskId, opts);
  }

  /**
   * List available server-side glossaries.
   * @returns {Promise<Array>}
   */
  async function listGlossaries() {
    await rateLimiter();
    return apiRequest(apiKey, 'GET', '/v1/translate/glossaries');
  }

  /**
   * Get details for a specific server-side glossary.
   * @param {string} glossaryId
   * @returns {Promise<object>}
   */
  async function getGlossary(glossaryId) {
    await rateLimiter();
    return apiRequest(apiKey, 'GET', `/v1/translate/glossaries/${glossaryId}`);
  }

  return {
    translate,
    translateAsync,
    pollTask,
    translateAuto,
    listGlossaries,
    getGlossary,
    getUsage: () => usage.getStats(),
    SYNC_CHAR_LIMIT,
  };
}

// ─── Exports ────────────────────────────────────────────────────────

export {
  createClient,
  formatGlossary,
  MalstadurApiError,
  SYNC_CHAR_LIMIT,
  estimateIsk,
  ISK_PER_1000_CHARS,
};
