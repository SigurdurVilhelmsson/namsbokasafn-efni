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

  // G1.1 (spec §5.18 row 5; plan decision 27): the queue is shared, so a segment save or an MT accept is marked
  // replayed on WHICHEVER page replays it, the Pass 2 editor's included. Pass 2's own keys get no policy.
  const DEFAULT_KEY_POLICIES = Object.freeze([
    Object.freeze({ prefix: 'seg:', markReplayed: true }),
    Object.freeze({ prefix: 'acc:', markReplayed: true }),
  ]);

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

    const PARKED_KEY = 'saveRetryParked';
    const PARKED_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // the drafts' window (tabGuard.js)
    const keyPolicies = [];

    // ----------------------------------------------------------------
    // KEY POLICIES (G1.1, spec §5.18). Opt-in per key prefix, so a page
    // that registers none (the Pass 2 editor) behaves exactly as before.
    // onReplayed (PR1 review C5): a replay that succeeds runs outside the
    // caller's promise, so the caller's success path never sees its answer;
    // the hook hands it to the key's owner. A key with no hook never reads
    // the body of a successful replay, as before.
    // ----------------------------------------------------------------

    function setKeyPolicy(prefix, policy) {
      for (let i = keyPolicies.length - 1; i >= 0; i--) {
        if (keyPolicies[i].prefix === prefix) keyPolicies.splice(i, 1);
      }
      keyPolicies.push({
        prefix: prefix,
        markReplayed: !!(policy && policy.markReplayed),
        parkRefused: !!(policy && policy.parkRefused),
        onParked: policy && typeof policy.onParked === 'function' ? policy.onParked : null,
        onReplayed: policy && typeof policy.onReplayed === 'function' ? policy.onReplayed : null,
      });
    }

    function policyFor(key) {
      let best = null;
      for (let i = 0; i < keyPolicies.length; i++) {
        const p = keyPolicies[i];
        if (key.indexOf(p.prefix) === 0 && (!best || p.prefix.length > best.prefix.length))
          best = p;
      }
      return best || { markReplayed: false, parkRefused: false, onParked: null, onReplayed: null };
    }

    /** What a replay sends: the stored options, with replayed: true when the key's owner asked. */
    function replayOptions(stored) {
      const opts = stored.options;
      if (!policyFor(stored.key).markReplayed || typeof opts.body !== 'string') return opts;
      let parsed;
      try {
        parsed = JSON.parse(opts.body);
      } catch {
        return opts; // not JSON: replay it as stored
      }
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return opts;
      parsed.replayed = true;
      return {
        method: opts.method,
        headers: opts.headers,
        body: JSON.stringify(parsed),
        credentials: opts.credentials,
      };
    }

    // ----------------------------------------------------------------
    // PARKED REPLAYS (index decision 12). A replay runs outside the caller's
    // promise and can outlive the page, so a refusal answered to one, or a 5xx
    // or a network failure that leaves it no attempt, is kept here for its
    // owner instead of being dropped with a toast.
    // ----------------------------------------------------------------

    function loadParked() {
      try {
        const raw = storage.getItem(PARKED_KEY);
        const list = raw ? JSON.parse(raw) : [];
        return Array.isArray(list) ? list : [];
      } catch {
        // parse error: nothing usable is parked
        return [];
      }
    }

    function saveParked(list) {
      try {
        if (list.length === 0) storage.removeItem(PARKED_KEY);
        else storage.setItem(PARKED_KEY, JSON.stringify(list));
      } catch {
        toast('Geymsla í vafra er full — endurtilraunir gætu glatast.', 'error');
      }
    }

    // exhaustedAttempts: the attempt count when a 5xx or a network failure left no attempt (decision 28), else null.
    // status: the HTTP status answered, or null when no answer reached the page (network failures).
    function park(stored, status, data, exhaustedAttempts) {
      const item = {
        key: stored.key,
        url: stored.url,
        body: stored.options.body,
        status: status,
        code: data && typeof data.error === 'string' ? data.error : null,
        message: data && typeof data.message === 'string' ? data.message : null,
        parkedAt: now(),
      };
      const list = loadParked().filter(function (p) {
        return p.key !== item.key;
      });
      list.push(item);
      saveParked(list);
      toast(
        exhaustedAttempts
          ? // Wording added 2026-11-04 and approved as written by [USER] the same day (index § Answers, "Later
            // answers"). It shows for a replay that 5xx answers exhausted and one that network failures exhausted.
            'Vista mistókst eftir ' +
              exhaustedAttempts +
              ' tilraunir — textinn var geymdur og birtist aftur í bútnum.'
          : // Wording approved by [USER] 2026-11-04 (index decision 13).
            'Vistun var hafnað — textinn var geymdur og birtist aftur í bútnum.',
        'error',
        true
      );
      const policy = policyFor(stored.key);
      if (policy.onParked) {
        try {
          policy.onParked(item);
        } catch {
          // the owner's hook failing must not lose the text: it stays parked
        }
      }
    }

    function takeParked(prefix, options) {
      const exact = !!(options && options.exact);
      const matches = function (p) {
        return (
          typeof p.key === 'string' && (exact ? p.key === prefix : p.key.indexOf(prefix) === 0)
        );
      };
      const list = loadParked();
      const taken = list.filter(matches);
      if (taken.length > 0) {
        saveParked(
          list.filter(function (p) {
            return !matches(p);
          })
        );
      }
      return taken;
    }

    // After keyPolicies exists: the policies the caller passes (the browser wiring passes DEFAULT_KEY_POLICIES).
    (deps.keyPolicies || []).forEach(function (p) {
      setKeyPolicy(p.prefix, p);
    });

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

    // Item 13: the live queue entry for `key`, but only if it is still `qid`'s.
    // A missing or qid-mismatched entry means a success purged it or a newer
    // save replaced it under the same key. Acting on the stale attempt —
    // replaying its body, evicting the newer entry, cancelling the newer timer,
    // or firing a success toast — is exactly the stale-overwrite this module
    // exists to prevent. Shared by the fire-time guard AND both post-fetch
    // continuations: the qid identity can change during the async fetch, so it
    // must be re-checked when the fetch settles, not only when the timer fires.
    // (Pre-qid legacy entries: undefined === undefined, so a legacy entry still
    // resolves to itself — graceful.)
    function currentEntry(key, qid) {
      const live = loadQueue().find(function (q) {
        return q.key === key;
      });
      return live && live.qid === qid ? live : null;
    }

    function executeRetry(queueItem) {
      const delay = BACKOFF_BASE * Math.pow(2, queueItem.attempts - 1);

      activeTimers[queueItem.key] = setTimeoutFn(function () {
        delete activeTimers[queueItem.key];

        // Only the CURRENT entry for this key may fire (silent abort otherwise:
        // a superseded retry is a correct non-event).
        const stored = currentEntry(queueItem.key, queueItem.qid);
        if (!stored) return;

        fetchFn(stored.url, replayOptions(stored))
          .then(function (response) {
            // Re-check: a newer save may have replaced (or a cross-tab success
            // purged) this key's entry while the fetch was in flight. If so,
            // this stale completion must not touch the queue or toast.
            if (!currentEntry(stored.key, stored.qid)) return;
            if (response.ok) {
              removeFromQueue(stored.key);
              toast('Vista t\u00F3kst eftir endurtilraun', 'success');
              const onReplayed = policyFor(stored.key).onReplayed;
              if (onReplayed) {
                // The item as queued (the body without the replay's mark), and the parsed answer, or null when the
                // answer is not JSON. The save succeeded: the owner's hook failing changes nothing here.
                const item = { key: stored.key, url: stored.url, body: stored.options.body };
                const hand = function (data) {
                  try {
                    onReplayed(item, data);
                  } catch {
                    // the replay landed and its toast showed; nothing to undo
                  }
                };
                return response.json().then(hand, function () {
                  hand(null);
                });
              }
            } else if (isRetryableResponse(response) && stored.attempts < MAX_ATTEMPTS) {
              stored.attempts++;
              stored.nextRetry = now() + BACKOFF_BASE * Math.pow(2, stored.attempts - 1);
              queueForRetry(stored);
            } else if (policyFor(stored.key).parkRefused) {
              // Spec §5.6: ANY non-5xx answer to a replay keeps the text (decision 28), not only a 409; and so
              // does a 5xx that exhausts MAX_ATTEMPTS ([USER] 2026-11-04). A key with no policy falls through to
              // today's toast-and-drop below.
              const exhaustedAttempts = isRetryableResponse(response) ? stored.attempts : null;
              removeFromQueue(stored.key);
              return response.json().then(
                function (data) {
                  park(stored, response.status, data, exhaustedAttempts);
                },
                function () {
                  park(stored, response.status, null, exhaustedAttempts);
                }
              );
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
            // Same stale-completion re-check as the success branch above.
            if (!currentEntry(stored.key, stored.qid)) return;
            if (isRetryableError(err) && stored.attempts < MAX_ATTEMPTS) {
              stored.attempts++;
              stored.nextRetry = now() + BACKOFF_BASE * Math.pow(2, stored.attempts - 1);
              queueForRetry(stored);
            } else if (isRetryableError(err) && policyFor(stored.key).parkRefused) {
              // [USER] 2026-11-04 (decision 28): network failures that exhaust MAX_ATTEMPTS keep the text too,
              // as an exhausted 5xx does. No answer reached the page, so the parked item has status null: that is
              // how it says "network". A key with no policy falls through to today's toast-and-drop below.
              removeFromQueue(stored.key);
              park(stored, null, null, stored.attempts);
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
              err.code = data.error; // the server's refusal code (G1.1, §5.18); undefined when absent
              err.data = data;
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

      const parked = loadParked();
      const fresh = parked.filter(function (p) {
        return typeof p.parkedAt === 'number' && nowMs - p.parkedAt <= PARKED_MAX_AGE_MS;
      });
      if (fresh.length !== parked.length) saveParked(fresh);

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
      setKeyPolicy: setKeyPolicy,
      takeParked: takeParked,
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
      keyPolicies: DEFAULT_KEY_POLICIES,
    });

    // Auto-process queue on load (moved verbatim).
    if (root.document.readyState === 'loading') {
      root.document.addEventListener('DOMContentLoaded', root.saveRetry.processQueue);
    } else {
      root.setTimeout(root.saveRetry.processQueue, 1000);
    }
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      createSaveRetry: createSaveRetry,
      DEFAULT_KEY_POLICIES: DEFAULT_KEY_POLICIES,
    };
  }
})(typeof window !== 'undefined' ? window : globalThis);
