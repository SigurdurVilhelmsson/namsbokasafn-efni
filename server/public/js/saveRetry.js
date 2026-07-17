/**
 * Save Retry Queue
 *
 * Catches retryable save failures, queues them in localStorage,
 * and retries with exponential backoff. Shows toast notifications.
 *
 * UMD factory (item 13): browser global `saveRetry` instantiated with real
 * deps; CommonJS exports `createSaveRetry` so Vitest can drive the queue
 * behaviorally with fake fetch/storage/timers — the queue's first behavioral
 * tests (static pins prove presence, not behavior).
 */
(function (root) {
  'use strict';

  function createSaveRetry(deps) {
    const fetchFn = deps.fetch;
    const storage = deps.storage;
    const setTimeoutFn = deps.setTimeout;
    const clearTimeoutFn = deps.clearTimeout;
    const now = deps.now;
    const toast = deps.toast;

    const STORAGE_KEY = 'saveRetryQueue';
    const MAX_ATTEMPTS = 3;
    const BACKOFF_BASE = 1000; // 1s, 2s, 4s
    const EXPIRY_MS = 60 * 60 * 1000; // 1 hour

    const activeTimers = {};

    // ----------------------------------------------------------------
    // QUEUE MANAGEMENT (localStorage)
    // ----------------------------------------------------------------

    function loadQueue() {
      try {
        const raw = storage.getItem(STORAGE_KEY);
        return raw ? JSON.parse(raw) : [];
      } catch {
        // parse error
        return [];
      }
    }

    function saveQueue(queue) {
      try {
        storage.setItem(STORAGE_KEY, JSON.stringify(queue));
      } catch {
        toast('Geymsla í vafra er full — endurtilraunir gætu glatast.', 'error');
      }
    }

    function addToQueue(item) {
      let queue = loadQueue();
      // Deduplicate by key
      queue = queue.filter(function (q) {
        return q.key !== item.key;
      });
      queue.push(item);
      saveQueue(queue);
    }

    function removeFromQueue(key) {
      let queue = loadQueue();
      queue = queue.filter(function (q) {
        return q.key !== key;
      });
      saveQueue(queue);
    }

    function cancelPending(key) {
      if (activeTimers[key] !== undefined) {
        clearTimeoutFn(activeTimers[key]);
        delete activeTimers[key];
      }
      removeFromQueue(key);
    }

    // ----------------------------------------------------------------
    // RETRYABLE CHECK
    // ----------------------------------------------------------------

    function isRetryableError(err) {
      // TypeError = network failure (fetch failed)
      if (err instanceof TypeError) return true;
      // HTTP 5xx
      if (err.status && err.status >= 500 && err.status < 600) return true;
      return false;
    }

    function isRetryableResponse(response) {
      return response.status >= 500 && response.status < 600;
    }

    // ----------------------------------------------------------------
    // RETRY LOGIC
    // ----------------------------------------------------------------

    function queueForRetry(item) {
      // Exactly one live timer per key: cancel a predecessor before queueing.
      if (activeTimers[item.key] !== undefined) {
        clearTimeoutFn(activeTimers[item.key]);
        delete activeTimers[item.key];
      }
      addToQueue(item);
      executeRetry(item);
    }

    function executeRetry(queueItem) {
      const delay = BACKOFF_BASE * Math.pow(2, queueItem.attempts - 1);

      activeTimers[queueItem.key] = setTimeoutFn(function () {
        delete activeTimers[queueItem.key];

        // Item 13: only the CURRENT entry for this key may fire. A missing or
        // qid-mismatched entry means a success purged it or a newer save
        // replaced it — replaying the closure copy is exactly the stale-
        // overwrite this module exists to prevent. Silent abort: a superseded
        // retry is a correct non-event. (Pre-qid legacy entries: undefined
        // === undefined passes, graceful.)
        const stored = loadQueue().find(function (q) {
          return q.key === queueItem.key;
        });
        if (!stored || stored.qid !== queueItem.qid) return;

        fetchFn(stored.url, stored.options)
          .then(function (response) {
            if (response.ok) {
              removeFromQueue(stored.key);
              toast('Vista t\u00F3kst eftir endurtilraun', 'success');
            } else if (isRetryableResponse(response) && stored.attempts < MAX_ATTEMPTS) {
              stored.attempts++;
              stored.nextRetry = now() + BACKOFF_BASE * Math.pow(2, stored.attempts - 1);
              queueForRetry(stored);
            } else {
              removeFromQueue(stored.key);
              toast(
                'Vista mist\u00F3kst eftir ' +
                  stored.attempts +
                  ' tilraunir. Vinsamlegast reyndu aftur.',
                'error',
                true
              );
            }
          })
          .catch(function (err) {
            if (isRetryableError(err) && stored.attempts < MAX_ATTEMPTS) {
              stored.attempts++;
              stored.nextRetry = now() + BACKOFF_BASE * Math.pow(2, stored.attempts - 1);
              queueForRetry(stored);
            } else {
              removeFromQueue(stored.key);
              toast(
                'Vista mist\u00F3kst eftir ' +
                  stored.attempts +
                  ' tilraunir. Vinsamlegast reyndu aftur.',
                'error',
                true
              );
            }
          });
      }, delay);
    }

    // ----------------------------------------------------------------
    // PUBLIC API
    // ----------------------------------------------------------------

    /**
     * Attempt a save with retry on failure.
     * @param {string} key - Unique key for deduplication
     * @param {string} url - The fetch URL
     * @param {object} options - The fetch options (method, headers, body, credentials)
     * @returns {Promise<object>} - Resolves with parsed JSON on success
     */
    function attempt(key, url, options) {
      return fetchFn(url, options)
        .then(function (response) {
          if (response.ok) {
            cancelPending(key);
            return response.json();
          }

          if (isRetryableResponse(response)) {
            const queueItem = {
              key: key,
              url: url,
              options: {
                method: options.method,
                headers: options.headers,
                body: options.body,
                credentials: options.credentials,
              },
              attempts: 1,
              nextRetry: now() + BACKOFF_BASE,
              createdAt: now(),
              qid: now() + ':' + Math.random().toString(36).slice(2),
            };
            queueForRetry(queueItem);
            toast('Vista mist\u00F3kst \u2014 reyni aftur...', 'error');

            return Promise.reject(
              new Error('Server villa (' + response.status + ') \u2014 reyni aftur')
            );
          }

          // Non-retryable — parse error and reject. Two-argument .then(onFulfilled,
          // onRejected) — NOT a single-argument .then(onFulfilled) chained into a
          // separate catch handler — is load-bearing here: a rejected promise
          // returned from onFulfilled propagates to the *next* handler in the
          // chain, so a trailing catch would intercept the deliberate
          // Promise.reject(err) crafted below (with the Icelandic conflict
          // message from data.message/data.error) and silently replace it with
          // the generic 'Villa <status>' text — the message never reaches the
          // user. The two-arg form's second callback only ever fires when
          // response.json() itself fails to parse.
          return response.json().then(
            function (data) {
              const err = new Error(data.message || data.error || 'Villa ' + response.status);
              err.status = response.status;
              return Promise.reject(err);
            },
            function () {
              const err = new Error('Villa ' + response.status);
              err.status = response.status;
              return Promise.reject(err);
            }
          );
        })
        .catch(function (err) {
          // Network failure (TypeError from fetch)
          if (isRetryableError(err) && !err.status) {
            const queueItem = {
              key: key,
              url: url,
              options: {
                method: options.method,
                headers: options.headers,
                body: options.body,
                credentials: options.credentials,
              },
              attempts: 1,
              nextRetry: now() + BACKOFF_BASE,
              createdAt: now(),
              qid: now() + ':' + Math.random().toString(36).slice(2),
            };
            queueForRetry(queueItem);
            toast('Vista mist\u00F3kst \u2014 reyni aftur...', 'error');
          }
          return Promise.reject(err);
        });
    }

    /**
     * Process any pending items in the queue (called on page load).
     */
    function processQueue() {
      const queue = loadQueue();
      const nowMs = now();
      const active = [];

      for (let i = 0; i < queue.length; i++) {
        const item = queue[i];
        // Expire old items
        if (nowMs - item.createdAt > EXPIRY_MS) continue;
        // Skip if max attempts exceeded
        if (item.attempts >= MAX_ATTEMPTS) continue;
        active.push(item);
      }

      // Update queue to only active items
      saveQueue(active);

      if (active.length > 0) {
        toast(
          'Reyni a\u00F0 vista ' + active.length + ' \u00F3vista\u00F0ar breytingar...',
          'info'
        );
        for (let j = 0; j < active.length; j++) {
          active[j].attempts++;
          executeRetry(active[j]);
        }
      }
    }

    /**
     * Number of items currently in the retry queue.
     */
    function pending() {
      return loadQueue().length;
    }

    /**
     * Check if an error is retryable.
     */
    function isRetryable(err) {
      return isRetryableError(err);
    }

    return {
      attempt: attempt,
      processQueue: processQueue,
      pending: pending,
      isRetryable: isRetryable,
      showToast: toast,
    };
  }

  // ── Browser wiring: real deps + the existing DOM toast ──
  if (typeof root !== 'undefined' && typeof root.document !== 'undefined') {
    const TOAST_SUCCESS_MS = 5000;
    let toastContainer = null;

    function ensureContainer() {
      if (toastContainer) return toastContainer;
      toastContainer = document.getElementById('toast-container');
      if (!toastContainer) {
        toastContainer = document.createElement('div');
        toastContainer.id = 'toast-container';
        toastContainer.style.cssText =
          'position:fixed;bottom:2rem;left:50%;transform:translateX(-50%);z-index:2000;display:flex;flex-direction:column;gap:0.5rem;align-items:center;';
        document.body.appendChild(toastContainer);
      }
      return toastContainer;
    }

    function domToast(message, type, persistent) {
      const container = ensureContainer();
      const toast = document.createElement('div');
      toast.className = 'toast toast-' + (type || 'info') + ' show';
      toast.textContent = message;
      container.appendChild(toast);

      if (!persistent) {
        setTimeout(function () {
          toast.classList.remove('show');
          setTimeout(function () {
            toast.remove();
          }, 400);
        }, TOAST_SUCCESS_MS);
      }

      return toast;
    }

    root.saveRetry = createSaveRetry({
      fetch: root.fetch.bind(root),
      storage: root.localStorage,
      setTimeout: root.setTimeout.bind(root),
      clearTimeout: root.clearTimeout.bind(root),
      now: function () {
        return Date.now();
      },
      toast: domToast,
    });

    // Auto-process queue on load (moved verbatim).
    if (root.document.readyState === 'loading') {
      root.document.addEventListener('DOMContentLoaded', root.saveRetry.processQueue);
    } else {
      root.setTimeout(root.saveRetry.processQueue, 1000);
    }
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { createSaveRetry: createSaveRetry };
  }
})(typeof window !== 'undefined' ? window : globalThis);
