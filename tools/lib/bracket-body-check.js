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
 * ⚠️ `examined`/`findings` do not cover every raw marker: a marker nested
 * inside another marker, or carrying a trailing `|payload` (every id-bearing
 * `term`, every `em`), cannot match the body regex at all and is invisible to
 * both — not a partial match at a shorter body, no match whatsoever. Reported,
 * not silently absorbed, via `skippedNested` (review round 1, finding 1).
 *
 * Design: docs/superpowers/specs/2026-08-13-remt-check-battery.md §5 item 10.
 */
import { parseModuleDoc } from './extraction-coverage.js';

/**
 * Bracket type -> the source element localNames whose text can legitimately
 * become that body. Types NOT listed here fall into two different groups:
 *
 *   - Genuinely opaque, no comparable source text at all: placeholders
 *     (MATH/TABLE/MEDIA/SPACE/BR/EQ/math) and id references (xref/docref) —
 *     nothing to compare, skipped by design.
 *   - `link`/`fn` carry REAL prose bodies (`[[link:${stripTags(inner)}|${url}]]`,
 *     `[[fn:${fnText}|${id}]]` in cnxml-extract.js — extracted with the same
 *     lazy regex shape as `<emphasis>`, equally exposed to a swallow) that this
 *     check does NOT validate. ⚠️ CORRECTED — review round 1, finding 2: this
 *     comment used to claim their text was "checked elsewhere". It is not; no
 *     check in tools/lib/ or the battery spec validates link/fn body text
 *     against source. This is an acknowledged gap, not a delegation. Not
 *     closed here — adding them changes this check's measured base rate, which
 *     is Plan B's input, so it is a scope decision for the register, not this
 *     file. `lb`/`rb` are real too, despite not appearing in cnxml-extract.js/
 *     cnxml-inject.js — they're opaque escape markers from the os-embed
 *     exercise-field converter (item 9/D3, tools/lib/exercise-html.js; see
 *     tools/api-translate.js's BRACKET_MARKER_TYPES comment) and carry no
 *     source-comparable text, same as MATH/TABLE/MEDIA.
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

/**
 * Every normalized+trimmed text value the given source elements hold.
 *
 * ⚠️ CORRECTED — review round 1, finding 3. This used to also `add(t)`
 * untrimmed, and the comparison below tried `candidates.has(b)` untrimmed
 * first. Both were dead: `sourceTexts` always adds the trimmed form too, and
 * trim is pure (`b === t ⇒ b.trim() === t.trim()`), so the untrimmed lookup
 * could never succeed where the trimmed one would not. Confirmed by removing
 * both and rerunning every test, including the leading-space MUST-NOT-TRIP
 * case (`Heat of[[i: fusion]]`) this looked like it existed to protect — all
 * still pass, because `b.trim()` alone already covers it.
 */
function sourceTexts(root, localNames) {
  const out = new Set();
  if (!root) return out;
  for (const name of localNames) {
    const els = root.getElementsByTagName(name);
    for (let i = 0; i < els.length; i++) {
      out.add(norm(els[i].textContent).trim());
    }
  }
  return out;
}

/**
 * E2 — check every bracket-marker body against source element content.
 *
 * @param {string} cnxmlText the module's 01-source CNXML
 * @param {string} segText the module's 02-for-mt segment file text
 * @returns {{examined: number, findings: Array<{segId: string, type: string, body: string}>, skippedNested: number, ok: boolean}}
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
  let skippedNested = 0;

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

    // ⚠️ NOT A FIX — REPORTED, PER review round 1 finding 1. The body regex
    // below (`[^\[\]|]*` then literal `]]`) does not partially match a marker
    // whose body contains a nested `[[...]]` or a `|payload` tail — it fails
    // to match THAT MARKER AT ALL, so it is silently invisible to `examined`
    // and `findings`, whatever its true content is. This is not only a
    // nesting edge case: `[[term:x|id]]` (every id-bearing term) and
    // `[[em:x|class]]` (every em — there is no class-less em) hit the exact
    // same wall via their trailing pipe payload. Measured on the full
    // chemistry corpus: 445 of 17,436 raw opens (2.6%) across 36 of 149
    // modules are structurally unexaminable — 319 of those are nested `i`
    // alone (m68733 loses 40 of its own 330), the rest are id-bearing
    // term/em. `skippedNested` counts the raw `[[type:` openers (for types
    // this check knows how to compare at all) that the match below could not
    // reach, so `examined` is never mistaken for the true population — same
    // idiom as `checkAltCoverage`'s `unreachable` in extraction-coverage.js.
    // Deliberately not a change to what IS matched/compared: that would move
    // the pinned `examined`/`findings` numbers Plan B's base-rate decision
    // depends on, and this task is additive reporting only.
    let rawOpens = 0;
    for (const om of String(text).matchAll(/\[\[([A-Za-z]+):/g)) {
      if (BODY_SOURCE_ELEMENTS[om[1]]) rawOpens++;
    }
    let matchedHere = 0;

    // Innermost-first: `[^\[\]|]` refuses to span a nested marker or a |payload,
    // so `[[i:e[[sub:g]]]]` yields the sub body, never a body containing brackets.
    for (const m of String(text).matchAll(/\[\[([A-Za-z]+):([^\[\]|]*)\]\]/g)) {
      const [, type, body] = m;
      if (!BODY_SOURCE_ELEMENTS[type]) continue; // opaque or payload-bearing — nothing to compare
      examined++;
      matchedHere++;
      const candidates = textsFor(type);
      if (!candidates.has(norm(body).trim())) {
        findings.push({ segId, type, body });
      }
    }
    skippedNested += rawOpens - matchedHere;
  }

  return { examined, findings, skippedNested, ok: findings.length === 0 };
}
