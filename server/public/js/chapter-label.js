/**
 * Canonical chapter DISPLAY labels for editor UIs (item 16 PR2, I14-R9).
 *
 * Display half of the item-14 appendices contract: server memory and every
 * DB column carry the NUMBER -1 for the appendices chapter. This module
 * turns that value — plus the dialects UI code actually receives ('-1'
 * from <select> values, 'appendices' from analytics events, numeric
 * strings) — into the human labels:
 *   full():    'Viðaukar' | 'Kafli N'
 *   compact(): 'Við.'     | 'KN'
 * Unrecognized values fall back to legacy concatenation so no call site
 * renders a blank it didn't render before.
 *
 * The conversion half (disk dirs / CLI argv) is server/lib/chapterLabel.js
 * — a separate concern; do not merge the two modules.
 *
 * UMD: browser global `chapterLabel` + CommonJS module.exports,
 * same pattern as segment-validation.js.
 */
(function (root) {
  'use strict';

  // Mirrors server/lib/chapterLabel.normalizeChapter's dialect acceptance.
  function normalize(value) {
    if (value === 'appendices') return -1;
    if (typeof value === 'number') return Number.isInteger(value) ? value : null;
    if (typeof value === 'string' && /^-?\d+$/.test(value.trim())) {
      return parseInt(value.trim(), 10);
    }
    return null;
  }

  function full(value) {
    const n = normalize(value);
    if (n === -1) return 'Viðaukar';
    return 'Kafli ' + (n === null ? String(value) : n);
  }

  function compact(value) {
    const n = normalize(value);
    if (n === -1) return 'Við.';
    return 'K' + (n === null ? String(value) : n);
  }

  const api = { full: full, compact: compact };
  if (typeof root !== 'undefined') root.chapterLabel = api;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})(typeof window !== 'undefined' ? window : globalThis);
