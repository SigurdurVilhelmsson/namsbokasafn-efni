/**
 * bracket-body-check.js — E2: every bracket-marker body is real source content.
 *
 * ⚠️ THE INSTRUMENT THIS REPLACES WAS WRONG IN BOTH DIRECTIONS. Scanning the
 * segment file for the byte pattern `[[type: ` (marker, colon, space) produced
 * 89% false positives by occurrence — 8 of 9 live hits are correct extractions
 * of source-legitimate leading spaces (`[[sub: fusion]]`, `[[i: molecules]]`) —
 * and it is blind to the defect whenever the swallowed text has no leading
 * space, which is m68710's shape. It could not be tuned; it had to be replaced.
 *
 * The predicate here is SOURCE-ANCHORED: a body must equal the normalized text
 * of some element of the corresponding kind in the module's own 01-source. A
 * body matching nothing was swallowed by the extractor's regex.
 *
 * Why equality against a SET and not positional matching: segment ids do not map
 * 1:1 onto source elements (a para's inline elements are flattened), and the
 * check must not depend on extraction order — which is exactly the fragile
 * coupling that makes an instrument rot. Set membership is weaker but honest.
 *
 * Design: docs/superpowers/specs/2026-08-13-remt-check-battery.md §5 item 10.
 */
import { parseModuleDoc } from './extraction-coverage.js';

/**
 * Bracket type -> the source element localNames whose text can legitimately
 * become that body. Types NOT listed here carry no comparable source text —
 * opaque placeholders (MATH/TABLE/MEDIA/SPACE/BR/EQ/math), id references
 * (xref/docref), and payload-bearing markers whose visible text is checked
 * elsewhere (link/fn/lb/rb) — and are skipped rather than guessed at.
 */
export const BODY_SOURCE_ELEMENTS = Object.freeze({
  i: ['emphasis'],
  b: ['emphasis'],
  u: ['emphasis'],
  em: ['emphasis'],
  sub: ['sub'],
  sup: ['sup'],
  term: ['term'],
});

/** Collapse whitespace for comparison; leading/trailing space is preserved as a single space. */
function norm(s) {
  return String(s || '').replace(/\s+/g, ' ');
}

/** Every normalized text value the given source elements hold, plus their trimmed forms. */
function sourceTexts(root, localNames) {
  const out = new Set();
  if (!root) return out;
  for (const name of localNames) {
    const els = root.getElementsByTagName(name);
    for (let i = 0; i < els.length; i++) {
      const t = norm(els[i].textContent);
      out.add(t);
      out.add(t.trim());
    }
  }
  return out;
}

/**
 * E2 — check every bracket-marker body against source element content.
 *
 * @param {string} cnxmlText the module's 01-source CNXML
 * @param {string} segText the module's 02-for-mt segment file text
 * @returns {{examined: number, findings: Array<{segId: string, type: string, body: string}>, ok: boolean}}
 */
export function checkBracketBodies(cnxmlText, segText) {
  // ⚠️ THE WHOLE DOCUMENT, NOT `<content>`. `<glossary>` sits OUTSIDE `<content>`
  // (measured in m68768: `</content>` at byte 69688, `<glossary` at 69699) while the
  // extractor emits 763 `glossary-def` + 763 `glossary-term` segments across chemistry.
  // Scoping the source scan to `<content>` therefore reports every glossary-sourced
  // marker as a swallow: measured, that inflates the module firing rate from 1.3% to
  // 10.1% and makes the MUST-NOT-TRIP fixture m68768 fire twice on
  // `<meaning>…see also <emphasis effect="italics">melting point</emphasis></meaning>`.
  const { doc } = parseModuleDoc(cnxmlText);
  const root = doc.documentElement;

  // Cache one text set per bracket type; a module can hold hundreds of markers.
  const cache = new Map();
  const textsFor = (type) => {
    if (!cache.has(type)) cache.set(type, sourceTexts(root, BODY_SOURCE_ELEMENTS[type]));
    return cache.get(type);
  };

  const findings = [];
  let examined = 0;

  // ⚠️ RAW OCCURRENCES, NOT `parseSegmentsMap`. That helper defaults to
  // `duplicates: 'first'`, so every marker in a NON-FIRST occurrence of a
  // duplicated seg-id would never be examined. Measured on chemistry: the
  // deduped form examined 16,630 markers and found 2 defects; raw iteration
  // examines 16,991 (+361) and finds 3 — it was MISSING A REAL SWALLOW.
  // Corroborated independently: the battery spec's own fixture note reads
  // `m68710:716,722`, naming TWO locations for that swallow, and only raw
  // iteration reports both. Same idiom and same reason as
  // `checkDuplicateSegIds` in tools/lib/extraction-coverage.js.
  for (const part of String(segText || '').split(/(?=<!--\s*SEG:)/)) {
    const marker = part.match(/<!--\s*SEG:([^\s]+?)\s*-->/);
    if (!marker) continue;
    const segId = marker[1];
    const text = part.replace(/<!--\s*SEG:[^>]*-->/, '');
    // Innermost-first: `[^\[\]|]` refuses to span a nested marker or a |payload,
    // so `[[i:e[[sub:g]]]]` yields the sub body, never a body containing brackets.
    for (const m of String(text).matchAll(/\[\[([A-Za-z]+):([^\[\]|]*)\]\]/g)) {
      const [, type, body] = m;
      if (!BODY_SOURCE_ELEMENTS[type]) continue; // opaque or payload-bearing — nothing to compare
      examined++;
      const candidates = textsFor(type);
      const b = norm(body);
      if (!candidates.has(b) && !candidates.has(b.trim())) {
        findings.push({ segId, type, body });
      }
    }
  }

  return { examined, findings, ok: findings.length === 0 };
}
