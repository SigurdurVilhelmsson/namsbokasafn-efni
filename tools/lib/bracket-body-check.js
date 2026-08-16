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
 * ⚠️ `examined`/`findings` still do not cover every raw marker: a marker
 * NESTED inside another marker cannot match the body regex at all (the body
 * class `[^\[\]|]*` refuses `[`) and is invisible to both — not a partial
 * match at a shorter body, no match whatsoever. Reported, not silently
 * absorbed, via `skippedUnmatchable` (review round 1, finding 1; renamed
 * round 2, finding ②, after round 1 also found a SECOND, larger cause under
 * the same name — see the regex comment below for why that second cause is
 * now fixed rather than merely counted).
 *
 * Design: docs/superpowers/specs/2026-08-13-remt-check-battery.md §5 item 10.
 */
import { parseModuleDoc } from './extraction-coverage.js';
// Reuses the project's existing decoder rather than adding a second one — it is
// the same helper cnxml-fidelity-check and cnxml-render already normalize with.
import { decodeEntities } from './math-label-inventory.js';

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
/**
 * 🔴 DECODES ENTITIES, AND THAT IS THE POINT — not just whitespace collapsing.
 *
 * The two sides of this comparison arrive in different encodings. The SOURCE
 * side reads `element.textContent` through the DOM, which has already decoded
 * every character reference; the BODY side is raw text lifted out of the
 * segment file, where `&#8722;` is still five characters. Comparing them
 * directly reports a swallow for every marker body containing a character
 * reference, even though nothing was swallowed.
 *
 * Measured 2026-08-16 on FRESH extraction — which is exactly what the §C82
 * loop's step 2 does: **6 of 342 organic modules fired, 10 false findings**
 * (m00226 x4, m00109 x2, m00111, m00204, m00255, m00329), on bodies like
 * `&#603;`, `&#43;`, `&#8722;`, `&#x2212;`, `&#8211;`. E2 is specified as a
 * BLOCKING check on a 1.3% base rate, so each of these is a false halt on a
 * paid run.
 *
 * Applied inside `norm` deliberately, because `norm` is the ONLY thing both
 * sides pass through (sourceTexts at the top of this file, and the body
 * comparison below). Decoding one side alone would trade this asymmetry for
 * its mirror image. The source side is already decoded, so its second decode
 * is a no-op for ordinary text — and where source text legitimately contains a
 * literal `&#...;`, both sides receive the identical treatment and still match.
 */
function norm(s) {
  return decodeEntities(String(s || '')).replace(/\s+/g, ' ');
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
 * @returns {{examined: number, findings: Array<{segId: string, type: string, body: string}>, skippedUnmatchable: number, ok: boolean}}
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
  let skippedUnmatchable = 0;

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

    // ⚠️ NESTING IS STILL REPORTED, NOT FIXED — review round 1 finding 1,
    // unchanged by round 2. A marker nested inside another marker (body
    // contains `[[...]]`) cannot match the body regex at all: the body class
    // `[^\[\]|]*` refuses `[`, so there is no shorter partial match, only no
    // match. `skippedUnmatchable` counts the raw `[[type:` openers (for types
    // this check can compare at all) that the match below could not reach —
    // same idiom as `checkAltCoverage`'s `unreachable` in
    // extraction-coverage.js. Deliberately not a fix: unlike the payload case
    // just below, there is no positional sub-body to recover from a nested
    // marker without guessing which part of it was the real content.
    let rawOpens = 0;
    for (const om of String(text).matchAll(/\[\[([A-Za-z]+):/g)) {
      if (BODY_SOURCE_ELEMENTS[om[1]]) rawOpens++;
    }
    let matchedHere = 0;

    // ⚠️ WIDENED — review round 2, finding ①. Round 1 found a SECOND,
    // structurally distinct cause behind the same "unmatchable" symptom:
    // every id-bearing `term` marker (`[[term:x|id]]`, cnxml-extract.js's
    // documented B4/RC3 shape) and every `em` marker (`[[em:x|class]]` —
    // there is no class-less em; cnxml-extract.js falls back to `[[i:...]]`
    // for that case) carries a trailing `|payload`, and the OLD regex's
    // `[^\[\]|]*` immediately followed by literal `]]` never matches a
    // `|id]]`/`|class]]` tail. Unlike nesting, this one IS fixable: the
    // payload is a known, well-formed suffix, not an ambiguous embedded
    // marker, so `(?:\|[^\[\]]*)?` consumes it (uncaptured) while the body
    // group still captures only the pre-pipe text — the actual prose to
    // compare. Innermost-first is unaffected: a nested `[[...]]` still
    // contains `[`, which both the body class AND the payload class refuse,
    // so a genuinely nested marker still cannot match, by design.
    // ⚠️ CORRECTED 2026-08-16 — this said `term` (61/61), i.e. FULLY reachable.
    // Re-measured across chemistry's 149 `02-for-mt` files: 61 raw `[[term:`
    // openers, 59 matched by the regex below. **59/61, not 61/61** — two `term`
    // markers (m68791/m68793) are nested and stay unmatchable, so a swallow in
    // either is invisible to E2. Do not cite this comment as "term is covered"
    // when scoping the nesting work; the 2 are real and they are not counted.
    // Measured corpus-wide: this makes `term` (59/61) and `em` (1/1)
    // reachable — `examined` +60, `skippedUnmatchable` -60, `findings`
    // UNCHANGED at 3, firing set UNCHANGED at {m68710, m68733}. See
    // task-7-report.md "Fix round 2" for the full before/after table.
    for (const m of String(text).matchAll(/\[\[([A-Za-z]+):([^\[\]|]*)(?:\|[^\[\]]*)?\]\]/g)) {
      const [, type, body] = m;
      if (!BODY_SOURCE_ELEMENTS[type]) continue; // opaque or id-reference — nothing to compare
      examined++;
      matchedHere++;
      const candidates = textsFor(type);
      if (!candidates.has(norm(body).trim())) {
        findings.push({ segId, type, body });
      }
    }
    skippedUnmatchable += rawOpens - matchedHere;
  }

  return { examined, findings, skippedUnmatchable, ok: findings.length === 0 };
}
