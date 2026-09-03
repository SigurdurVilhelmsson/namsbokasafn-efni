/**
 * term-text.js — flattening and scanning for [[term:…]] marker text.
 *
 * Extracted from cnxml-inject.js's stripTermMarkersToText so that
 * cnxml-extract.js can use it without importing from cnxml-inject.js — a
 * dependency between the two largest tools in the pipeline.
 *
 * 🔴 THE MODULE IS THREE PRIMITIVES, NOT ONE FLATTENER, AND THE SPLIT IS THE
 * WHOLE POINT. Its two consumers need the SAME steps in DIFFERENT ORDERS:
 *
 *   data-en (cnxml-extract)   strip → resolve MATH → normalise   [case preserved]
 *   stripTermMarkersToText    strip → lowercase → resolve MATH    [case folded,
 *                                                                 EXCEPT MathML]
 *
 * The wrapper's ordering is not an accident and must not be "simplified" into
 * a single call. Because it lowercases BEFORE substituting MathML, the
 * substituted symbols escape the fold. Measured over the real corpus with the
 * real per-module equations maps, collapsing the two orders diverges on 6
 * inputs — 1 of 1,406 [[term:]] bodies and 5 of 763 glossary-term segments —
 * and every one destroys a chemistry symbol:
 *
 *     ΔHf° → δhf°     ΔGf° → δgf°     Ecell° → ecell°     ΔHc° → δhc°
 *
 * Δ (change in) and δ (partial) are DIFFERENT SYMBOLS in chemistry, and both
 * call sites write this value into output CNXML as "(e. …)", so the corruption
 * is reader-visible. Pinned by tools/__tests__/term-text.test.js.
 *
 * ⚠️ NO toLowerCase() ANYWHERE IN THIS FILE. The original lowercased because
 * its callers compare case-insensitively; that flattened proper nouns in
 * published glosses. The lowercasing lives at the one call site that needs it.
 */

/**
 * Strip inline markers to their display text, leaving `[[MATH:n]]` in place for
 * the caller to resolve when it chooses. Case and whitespace are untouched.
 *
 * ⚠️ The final rule's `(?!MATH:)` guard is CASE-SENSITIVE and that is
 * load-bearing: it protects the uppercase placeholder the extractor emits. Run
 * this BEFORE any case folding, or the guard stops matching and MATH markers
 * are deleted instead of resolved.
 *
 * @param {string} text - marker-bearing text
 * @returns {string} text with inline markers unwrapped, MATH placeholders kept
 */
export function stripInlineMarkers(text) {
  return (
    String(text ?? '')
      .replace(/\[\[sup:([^\]]+)\]\]/g, '$1')
      .replace(/\[\[sub:([^\]]+)\]\]/g, '$1')
      .replace(/\[\[i:([^\]]+)\]\]/g, '$1')
      .replace(/\[\[b:([^\]]+)\]\]/g, '$1')
      .replace(/\{\{i\}\}([\s\S]*?)\{\{\/i\}\}/g, '$1')
      .replace(/\{\{b\}\}([\s\S]*?)\{\{\/b\}\}/g, '$1')
      // Unwrap id-anchored markers to their display text BEFORE the catch-all
      // below deletes unknown [[type:…]] markers wholesale.
      .replace(/\[\[(?:term|fn|em):([^\]|]*)\|[^\]]*\]\]/g, '$1')
      .replace(/\[\[(?:term|fn|u):([^\]]*)\]\]/g, '$1')
      .replace(/\[\[(?!MATH:)[A-Za-z][\w]*:[^\]]*\]\]/g, '')
  );
}

/**
 * Substitute `[[MATH:n]]` placeholders with the plain text of their MathML.
 * An unresolvable placeholder is DROPPED, not emitted — a marker reaching a
 * reader is worse than a missing symbol.
 *
 * Matched case-insensitively so this serves both callers: the case-preserving
 * data-en path sees `[[MATH:n]]`, and the wrapper — which folds case first —
 * sees `[[math:n]]`.
 *
 * @param {string} text
 * @param {Object} equations - `math-N` -> { mathml }
 * @returns {string}
 */
export function resolveMathPlaceholders(text, equations = {}) {
  return String(text ?? '').replace(/\[\[MATH:(\d+)\]\]/gi, (_m, n) => {
    const eq = equations[`math-${n}`];
    if (!eq || !eq.mathml) return '';
    return eq.mathml
      .replace(/<[^>]+>/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  });
}

/**
 * Flatten marker-bearing text to a plain-text display value, preserving case.
 * This is the `data-en` producer: the result becomes an HTML attribute value,
 * so newlines and runs of whitespace are normalised away.
 *
 * @param {string} text - marker-bearing text
 * @param {Object} equations - `math-N` -> { mathml }
 * @returns {string} plain text, case preserved, whitespace normalised
 */
export function flattenMarkersToText(text, equations = {}) {
  return resolveMathPlaceholders(stripInlineMarkers(text), equations).replace(/\s+/g, ' ').trim();
}

const TERM_OPEN = '[[term:';

/**
 * Find every `[[term:…]]` marker, depth-aware, returning body and id.
 *
 * 🔴 DEPTH COUNTING, NOT A CHARACTER CLASS. A `[^\]]*` class stops at the first
 * `]`, so it truncates a two-level nested marker — the defect that put a
 * literal `[[term:` into published CNXML (register ⑰).
 *
 * 🔴 THE ID SEPARATOR IS THE FIRST TOP-LEVEL `|`, NOT THE LAST `|`. A nested
 * marker may carry its own pipe — `[[span:X|red-text]]` is real in the organic
 * corpus — so a lastIndexOf split would return `red-text` as the id and
 * truncate the body.
 *
 * An unterminated marker yields nothing rather than a guess: emitting a
 * truncated body is how ⑰ reached readers.
 *
 * @param {string} text
 * @returns {Array<{body: string, id: string|null}>}
 */
export function scanTermMarkers(text) {
  const s = String(text ?? '');
  const out = [];
  let i = 0;
  while ((i = s.indexOf(TERM_OPEN, i)) >= 0) {
    const contentStart = i + TERM_OPEN.length;
    let depth = 1; // we are already inside this marker
    let j = contentStart;
    let pipe = -1;
    let end = -1;
    while (j < s.length) {
      if (s.startsWith('[[', j)) {
        depth++;
        j += 2;
        continue;
      }
      if (s.startsWith(']]', j)) {
        depth--;
        if (depth === 0) {
          end = j;
          break;
        }
        j += 2;
        continue;
      }
      if (s[j] === '|' && depth === 1 && pipe < 0) pipe = j;
      j++;
    }
    if (end < 0) break; // unterminated — report nothing rather than a truncation
    out.push(
      pipe >= 0
        ? { body: s.slice(contentStart, pipe), id: s.slice(pipe + 1, end) }
        : { body: s.slice(contentStart, end), id: null }
    );
    i = end + 2;
  }
  return out;
}
