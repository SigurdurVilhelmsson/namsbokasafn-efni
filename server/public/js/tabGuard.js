/**
 * tabGuard.js — Cross-tab editing conflict detection via BroadcastChannel.
 *
 * Usage:
 *   tabGuard.claim('loc:chemistry/3/m68667')  — claim a module for editing
 *   tabGuard.release()                        — release the current claim
 *   tabGuard.tabId                            — unique ID for this tab
 *
 * When another tab claims the same module, both tabs see a warning banner.
 * Draft keys should include tabGuard.tabId to prevent localStorage collisions.
 */
(function () {
  'use strict';

  const TAB_ID = Math.random().toString(36).slice(2, 10);
  let channel = null;
  let currentKey = null;
  let warningEl = null;

  try {
    channel = new BroadcastChannel('editor-tab-guard');
  } catch {
    // BroadcastChannel not supported — no cross-tab detection
  }

  function createWarningBanner() {
    if (warningEl) return warningEl;
    warningEl = document.createElement('div');
    warningEl.id = 'tab-guard-warning';
    warningEl.style.cssText =
      'display:none;background:#b45309;color:#fff;padding:10px 16px;text-align:center;' +
      'font-size:14px;position:sticky;top:0;z-index:9999;line-height:1.4;';
    warningEl.innerHTML =
      '<strong>Aðvörun:</strong> Þessi eining er opin í öðrum flipa. ' +
      'Breytingar gætu skrifað yfir hvort annað. ' +
      '<button id="tab-guard-dismiss" style="margin-left:8px;background:rgba(255,255,255,0.2);' +
      'border:1px solid rgba(255,255,255,0.4);color:#fff;padding:2px 10px;border-radius:4px;' +
      'cursor:pointer;font-size:13px;">Hunsa</button>';
    document.body.insertBefore(warningEl, document.body.firstChild);
    document.getElementById('tab-guard-dismiss').addEventListener('click', function () {
      warningEl.style.display = 'none';
    });
    return warningEl;
  }

  function showWarning() {
    createWarningBanner().style.display = 'block';
  }

  function hideWarning() {
    if (warningEl) warningEl.style.display = 'none';
  }

  if (channel) {
    channel.onmessage = function (e) {
      const msg = e.data;
      if (msg.tabId === TAB_ID) return; // ignore own messages

      if (msg.type === 'claim' && msg.key === currentKey) {
        // Another tab is claiming our module — warn both
        channel.postMessage({ type: 'ack', key: currentKey, tabId: TAB_ID });
        showWarning();
      }

      if (msg.type === 'ack' && msg.key === currentKey) {
        // Another tab acknowledged our claim — show warning
        showWarning();
      }

      if (msg.type === 'release' && msg.key === currentKey) {
        // Other tab released — we're the only one now
        hideWarning();
      }
    };
  }

  window.addEventListener('beforeunload', function () {
    if (channel && currentKey) {
      channel.postMessage({ type: 'release', key: currentKey, tabId: TAB_ID });
    }
  });

  /**
   * Find the most recent draft matching a key prefix across all tab-specific keys.
   * @param {string} prefix - e.g. 'loc-draft:chemistry/3/m68667:'
   * @returns {{ key: string, data: object }|null}
   */
  function findNewestDraft(prefix) {
    let best = null;
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || !k.startsWith(prefix)) continue;
      try {
        const parsed = JSON.parse(localStorage.getItem(k));
        if (parsed && parsed.ts && (!best || parsed.ts > best.data.ts)) {
          best = { key: k, data: parsed };
        }
      } catch {
        // skip corrupt entries
      }
    }
    return best;
  }

  /**
   * Remove all drafts matching a key prefix (cleanup after restore or discard).
   * @param {string} prefix - e.g. 'loc-draft:chemistry/3/m68667:'
   */
  function clearDraftsByPrefix(prefix) {
    const toRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(prefix)) toRemove.push(k);
    }
    for (let j = 0; j < toRemove.length; j++) {
      localStorage.removeItem(toRemove[j]);
    }
  }

  window.tabGuard = {
    tabId: TAB_ID,

    /**
     * Claim a module for editing. If another tab has it, both get warned.
     * @param {string} key - unique key like 'seg:chemistry/3/m68667'
     */
    claim: function (key) {
      currentKey = key;
      if (channel) {
        channel.postMessage({ type: 'claim', key: key, tabId: TAB_ID });
      }
    },

    /**
     * Release the current claim.
     */
    release: function () {
      if (channel && currentKey) {
        channel.postMessage({ type: 'release', key: currentKey, tabId: TAB_ID });
      }
      currentKey = null;
      hideWarning();
    },

    findNewestDraft: findNewestDraft,
    clearDraftsByPrefix: clearDraftsByPrefix,
  };
})();
