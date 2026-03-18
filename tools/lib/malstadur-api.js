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

// ─── Constants ──────────────────────────────────────────────────────

const API_BASE = 'https://api.malstadur.is';
const SYNC_CHAR_LIMIT = 10_000;
const DEFAULT_RATE_DELAY_MS = 500;
const MAX_RETRIES = 3;
const INITIAL_BACKOFF_MS = 1000;
const ASYNC_POLL_INTERVAL_MS = 2000;
const ASYNC_MAX_POLL_ATTEMPTS = 180; // 6 minutes at 2s intervals

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
        estimatedISK: (stats.totalChars * 5) / 1000, // 5 ISK per 1000 chars
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
 * @param {Array<{english: string, icelandic: string, status?: string}>} terms
 * @param {object} [options]
 * @param {string} [options.domain='chemistry'] - Domain label for the glossary
 * @param {boolean} [options.approvedOnly=true] - Only include approved terms
 * @returns {object} API-formatted glossary object
 */
function formatGlossary(terms, { domain = 'chemistry', approvedOnly = true } = {}) {
  const filtered = approvedOnly ? terms.filter((t) => t.status === 'approved') : terms;

  return {
    domain,
    sourceLanguage: 'en',
    targetLanguage: 'is',
    terms: filtered.map((t) => ({
      sourceWord: t.english,
      targetWord: t.icelandic,
    })),
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
      const task = await apiRequest(apiKey, 'GET', `/v1/translate/tasks/${taskId}`);

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

export { createClient, formatGlossary, MalstadurApiError, SYNC_CHAR_LIMIT };
