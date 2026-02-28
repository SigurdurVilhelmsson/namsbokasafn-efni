/**
 * Save Retry Queue
 *
 * Catches retryable save failures, queues them in localStorage,
 * and retries with exponential backoff. Shows toast notifications.
 */

// eslint-disable-next-line no-unused-vars
const saveRetry = (function () {
  'use strict';

  const STORAGE_KEY = 'save-retry-queue';
  const MAX_ATTEMPTS = 3;
  const BACKOFF_BASE = 1000; // 1s, 2s, 4s
  const EXPIRY_MS = 60 * 60 * 1000; // 1 hour
  const TOAST_SUCCESS_MS = 5000;

  let toastContainer = null;
  const activeTimers = {};

  // ----------------------------------------------------------------
  // QUEUE MANAGEMENT (localStorage)
  // ----------------------------------------------------------------

  function loadQueue() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      // parse error
      return [];
    }
  }

  function saveQueue(queue) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
    } catch {
      /* quota exceeded */
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
  // TOAST UI
  // ----------------------------------------------------------------

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

  function showToast(message, type, persistent) {
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

  // ----------------------------------------------------------------
  // RETRY LOGIC
  // ----------------------------------------------------------------

  function executeRetry(queueItem) {
    const delay = BACKOFF_BASE * Math.pow(2, queueItem.attempts - 1);

    activeTimers[queueItem.key] = setTimeout(function () {
      delete activeTimers[queueItem.key];

      fetch(queueItem.url, queueItem.options)
        .then(function (response) {
          if (response.ok) {
            removeFromQueue(queueItem.key);
            showToast('Vista t\u00F3kst eftir endurtilraun', 'success');
          } else if (isRetryableResponse(response) && queueItem.attempts < MAX_ATTEMPTS) {
            queueItem.attempts++;
            queueItem.nextRetry = Date.now() + BACKOFF_BASE * Math.pow(2, queueItem.attempts - 1);
            addToQueue(queueItem);
            executeRetry(queueItem);
          } else {
            removeFromQueue(queueItem.key);
            showToast(
              'Vista mist\u00F3kst eftir ' +
                queueItem.attempts +
                ' tilraunir. Vinsamlegast reyndu aftur.',
              'error',
              true
            );
          }
        })
        .catch(function (err) {
          if (isRetryableError(err) && queueItem.attempts < MAX_ATTEMPTS) {
            queueItem.attempts++;
            queueItem.nextRetry = Date.now() + BACKOFF_BASE * Math.pow(2, queueItem.attempts - 1);
            addToQueue(queueItem);
            executeRetry(queueItem);
          } else {
            removeFromQueue(queueItem.key);
            showToast(
              'Vista mist\u00F3kst eftir ' +
                queueItem.attempts +
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
    return fetch(url, options)
      .then(function (response) {
        if (response.ok) {
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
            nextRetry: Date.now() + BACKOFF_BASE,
            createdAt: Date.now(),
          };
          addToQueue(queueItem);
          showToast('Vista mist\u00F3kst \u2014 reyni aftur...', 'error');
          executeRetry(queueItem);

          return Promise.reject(
            new Error('Server villa (' + response.status + ') \u2014 reyni aftur')
          );
        }

        // Non-retryable — parse error and reject
        return response
          .json()
          .then(function (data) {
            const err = new Error(data.error || 'Villa ' + response.status);
            err.status = response.status;
            return Promise.reject(err);
          })
          .catch(function () {
            const err = new Error('Villa ' + response.status);
            err.status = response.status;
            return Promise.reject(err);
          });
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
            nextRetry: Date.now() + BACKOFF_BASE,
            createdAt: Date.now(),
          };
          addToQueue(queueItem);
          showToast('Vista mist\u00F3kst \u2014 reyni aftur...', 'error');
          executeRetry(queueItem);
        }
        return Promise.reject(err);
      });
  }

  /**
   * Process any pending items in the queue (called on page load).
   */
  function processQueue() {
    const queue = loadQueue();
    const now = Date.now();
    const active = [];

    for (let i = 0; i < queue.length; i++) {
      const item = queue[i];
      // Expire old items
      if (now - item.createdAt > EXPIRY_MS) continue;
      // Skip if max attempts exceeded
      if (item.attempts >= MAX_ATTEMPTS) continue;
      active.push(item);
    }

    // Update queue to only active items
    saveQueue(active);

    if (active.length > 0) {
      showToast(
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

  // Auto-process queue on load
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', processQueue);
  } else {
    setTimeout(processQueue, 1000);
  }

  return {
    attempt: attempt,
    processQueue: processQueue,
    pending: pending,
    isRetryable: isRetryable,
  };
})();
