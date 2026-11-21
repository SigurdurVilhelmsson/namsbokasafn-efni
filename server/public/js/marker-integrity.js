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

  const api = { TYPES, isBracketDialect, hasLegacyMarkup, wrapFor, edgeSplit };

  root.markerIntegrity = api;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})(typeof window !== 'undefined' ? window : globalThis);
