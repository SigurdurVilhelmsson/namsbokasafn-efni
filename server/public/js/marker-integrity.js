/**
 * Bracket-marker integrity (G1.11) and the toolbar's dialect (§C248).
 * Spec: docs/superpowers/specs/2026-11-21-c248-g111-toolbar-dialect-and-marker-gate-design.md §4.
 *
 * Two dialects of inline markup live in segment text. The new-format bracket dialect (`[[sub:2]]`, `[[b:x]]` …)
 * and the legacy one (`**x**`, `__x__`, `~x~`, `^x^`). cnxml-inject.js converts the legacy forms only in a
 * segment with no new-format marker (its `hasApiMarkers`), so a legacy wrap in a new-format segment reaches
 * readers as raw characters. This module decides which dialect a segment uses, so the toolbar writes that one.
 *
 * The type list and tiers have one owner, tools/lib/marker-types.json: required on the Node side, and served to
 * the browser as `window.markerTypes` by GET /js/marker-types.js.
 *
 * UMD: browser global `markerIntegrity` + CommonJS module.exports, like segment-validation.js.
 */
(function (root) {
  'use strict';

  const TAXONOMY =
    typeof module !== 'undefined' && module.exports
      ? require('../../../tools/lib/marker-types.json')
      : root.markerTypes;
  const TYPES = TAXONOMY.types;

  // cnxml-inject.js `hasApiMarkers`, verbatim. markerDialectAgreement.test.js holds the two in step over the
  // whole corpus.
  const API_MARKERS =
    /\{\{[ib]\}\}|\{\{[ib]:|\{\{term\}\}|\{\{fn\}\}|\[\[sub:|\[\[sup:|\[\[i:|\[\[b:|\[\[term:|\[\[fn:|\[\[u:|\[\[em:|\[\[span:|\[\[sc:/;

  // The legacy forms inject converts only when hasApiMarkers is false — the ones a bracket marker would break.
  // inject's own patterns. Not `*x*` (a literal asterisk, as in `(σ, σ*, π, π*)`, would classify the segment as
  // legacy) and not `++x++` (inject converts it in both dialects).
  const LEGACY_FORMS = [
    /\*\*([^*]+)\*\*/,
    /(?<!_)__([^_]+)__(?!_)/,
    /(?<=[^\s~])~([^\s~]{1,15})~/,
    /(?<=[^\s^])\^([^\s^]{1,15})\^/,
    /\s\^([0-9]+)\^([A-Z][a-z]?)/,
  ];
  const PLACEHOLDERS = /\[\[(MATH|MEDIA|TABLE):[^\]]*\]\]/g;

  const PAIRS = {
    bold: { bracket: '[[b:', legacy: '**' },
    italic: { bracket: '[[i:', legacy: '*' },
    term: { bracket: '[[term:', legacy: '__' },
    underline: { bracket: '[[u:', legacy: '++' },
    sub: { bracket: '[[sub:', legacy: '~' },
    sup: { bracket: '[[sup:', legacy: '^' },
  };

  /** True when the text carries a new-format marker (inject's hasApiMarkers). */
  function isBracketDialect(text) {
    return API_MARKERS.test(String(text || ''));
  }

  /** True when the text carries legacy markup that depends on the segment's dialect. */
  function hasLegacyMarkup(text) {
    const t = String(text || '').replace(PLACEHOLDERS, '');
    return LEGACY_FORMS.some((re) => re.test(t));
  }

  /**
   * The pair the toolbar writes for a kind of formatting: the bracket pair, unless the segment already holds
   * legacy markup and no new-format marker, where a bracket marker would make inject leave that markup raw.
   *
   * @param {'bold'|'italic'|'term'|'underline'|'sub'|'sup'} kind
   * @param {string} currentText the segment's text as it stands in the editor
   * @returns {{open: string, close: string}}
   */
  function wrapFor(kind, currentText) {
    const pair = PAIRS[kind];
    if (!pair) throw new TypeError('wrapFor: unknown kind ' + JSON.stringify(kind));
    if (hasLegacyMarkup(currentText) && !isBracketDialect(currentText)) {
      return { open: pair.legacy, close: pair.legacy };
    }
    return { open: pair.bracket, close: ']]' };
  }

  /** A selection's leading and trailing whitespace, split off so it stays outside the toolbar's pair. */
  function edgeSplit(selected) {
    const m = /^(\s*)([\s\S]*?)(\s*)$/.exec(String(selected || ''));
    return { lead: m[1], core: m[2], trail: m[3] };
  }

  // ── The save-gate rules (spec §4.3) ─────────────────────────────

  function tally(text, re) {
    const out = {};
    for (const m of String(text || '').matchAll(re)) out[m[1]] = (out[m[1]] || 0) + 1;
    return out;
  }

  /**
   * What markers a text holds, counted by the `[[type` prefix only: a marker body is never parsed, so nesting
   * (`[[b:… C[[sub:4]] …]]`) cannot mislead the counts.
   *
   * @param {string} text
   * @returns {{counts: Object<string, number>, spaced: Object<string, number>, empty: Object<string, number>,
   *   exact: string[], open: number, close: number, unknown: string[]}}
   */
  function scanMarkers(text) {
    const t = String(text || '');
    const counts = tally(t, /\[\[([A-Za-z]+)(?=[:\]|])/g);
    return {
      counts,
      spaced: tally(t, /\[\[([A-Za-z]+): /g),
      empty: tally(t, /\[\[([A-Za-z]+):\]\]/g),
      exact: t.match(/\[\[(TABLE|lb|rb):[^\]]*\]\]/g) || [],
      open: (t.match(/\[\[/g) || []).length,
      close: (t.match(/\]\]/g) || []).length,
      unknown: Object.keys(counts).filter((type) => !(type in TYPES)),
    };
  }

  // An italic as an editor types it: an asterisk that no letter, digit or asterisk touches on its outer side.
  // Unicode-aware (`\p{L}`, not `\w`), so `σ*`, `π*` and an asterisk after an Icelandic letter open nothing, and
  // `**x**` is not an italic. Inject's own `*x*` conversion has no boundary; it stands down by comparing the
  // asterisk count with the CNXML source's literal ones, a count checkMarkers cannot see.
  const ITALIC_WRAP = /(?<![*\p{L}\p{N}_])\*[^*\s][^*\n]*\*(?![*\p{L}\p{N}_])/gu;

  // Rule 5(a)'s legacy wraps, by the marker the editor would have typed.
  const LEGACY_WRAPS = [
    ['**', /\*\*([^*]+)\*\*/g],
    ['*', ITALIC_WRAP],
    ['__', /(?<!_)__([^_]+)__(?!_)/g],
    ['~', /(?<=[^\s~])~([^\s~]{1,15})~/g],
    ['^', /(?<=[^\s^])\^([^\s^]{1,15})\^/g],
  ];

  // [USER] 2026-11-22 (§C248): in localization a unit conversion can rightly remove a sub/sup the English carries
  // (`14,7 lb/in[[sup:2]]` → `101 kPa`), so there rule 2s warns for these two types (formatting-dropped: "was it
  // intentional?"). Every other structural type still blocks there, and the segment editor keeps rule 2s whole.
  const LOCALIZATION_WARN_ONLY = new Set(['sub', 'sup']);

  function legacyWrapCount(text, re) {
    return (
      String(text || '')
        .replace(PLACEHOLDERS, '')
        .match(re) || []
    ).length;
  }

  /**
   * The bracket-marker rules, in validateStructure's {code, params} shape (spec §4.3). The baseline is the served
   * base text (`originalIs`); rule 2 counts against min(baseline, English), so a marker the MT invented may be
   * deleted while one the English and the baseline both carry stays protected.
   *
   * @param {string} enText the English source segment
   * @param {string} originalIs the served base text
   * @param {string} editedIs the proposed text
   * @param {{localization?: boolean}} [opts] localization: the localization pane and routes, where a dropped
   *   sub/sup warns instead of blocking (LOCALIZATION_WARN_ONLY)
   * @returns {{blocked: Array<{code: string, params: Object}>, warnings: Array<{code: string, params: Object}>}}
   */
  function checkMarkers(enText, originalIs, editedIs, opts) {
    const localization = Boolean(opts && opts.localization === true);
    const blocked = [];
    const warnings = [];
    const en = scanMarkers(enText);
    const orig = scanMarkers(originalIs);
    const edit = scanMarkers(editedIs);

    // 1a: an ADDED `[[type: ` (one inherited from the source stays saveable).
    for (const type of Object.keys(edit.spaced)) {
      if (edit.spaced[type] > (orig.spaced[type] || 0)) {
        blocked.push({ code: 'marker-spaced', params: { type } });
      }
    }
    // 1b: every `[[` closed.
    if (edit.open !== edit.close) {
      blocked.push({ code: 'marker-unbalanced', params: { open: edit.open, close: edit.close } });
    }
    // 1c: an ADDED empty marker; inject fails the whole module on one. lb/rb are empty by nature.
    for (const type of Object.keys(edit.empty)) {
      if (type === 'lb' || type === 'rb') continue;
      if (edit.empty[type] > (orig.empty[type] || 0)) {
        blocked.push({ code: 'marker-empty', params: { type } });
      }
    }
    // 2s / 2p: a fall below min(baseline, English).
    for (const type of Object.keys(TYPES)) {
      const tier = TYPES[type];
      if (tier === 'atomic') continue;
      const floor = Math.min(orig.counts[type] || 0, en.counts[type] || 0);
      const now = edit.counts[type] || 0;
      if (now >= floor) continue;
      if (tier === 'structural' && !(localization && LOCALIZATION_WARN_ONLY.has(type))) {
        blocked.push({ code: 'marker-dropped', params: { type, from: floor, to: now } });
      } else {
        warnings.push({ code: 'formatting-dropped', params: { type, from: floor, to: now } });
      }
    }
    // 2a: a TABLE/lb/rb string the baseline and the English both carry. (MATH, MEDIA, BR and SPACE keep the
    // rules segment-validation.js already has.)
    for (const marker of new Set(orig.exact)) {
      if (en.exact.indexOf(marker) !== -1 && edit.exact.indexOf(marker) === -1) {
        blocked.push({ code: 'marker-dropped', params: { marker } });
      }
    }
    // 3: a type the taxonomy does not name.
    for (const type of edit.unknown) warnings.push({ code: 'marker-unknown', params: { type } });
    // 4: lb/rb pair up.
    if ((edit.counts.lb || 0) !== (edit.counts.rb || 0)) {
      warnings.push({
        code: 'marker-lb-rb',
        params: { lb: edit.counts.lb || 0, rb: edit.counts.rb || 0 },
      });
    }
    // 5(a): a legacy wrap ADDED to new-format text, which inject leaves raw there.
    if (isBracketDialect(editedIs)) {
      for (const [marker, re] of LEGACY_WRAPS) {
        if (legacyWrapCount(editedIs, re) > legacyWrapCount(originalIs, re)) {
          warnings.push({ code: 'legacy-wrap', params: { direction: 'added', marker } });
        }
      }
    }
    // 5(b): new-format markup added to a legacy segment, after which its legacy markup prints raw. An italic
    // counts here though the dialect test leaves `*x*` out: a segment whose only legacy markup is `*E. coli*`
    // flips too, and a false warning on a literal pair is cheaper than raw asterisks on a page.
    const legacyAfter = hasLegacyMarkup(editedIs) || legacyWrapCount(editedIs, ITALIC_WRAP) > 0;
    if (!isBracketDialect(originalIs) && isBracketDialect(editedIs) && legacyAfter) {
      warnings.push({ code: 'legacy-wrap', params: { direction: 'flip' } });
    }
    return { blocked, warnings };
  }

  const api = {
    TYPES,
    isBracketDialect,
    hasLegacyMarkup,
    wrapFor,
    edgeSplit,
    scanMarkers,
    checkMarkers,
  };

  root.markerIntegrity = api;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})(typeof window !== 'undefined' ? window : globalThis);
