/**
 * mt-output-guards.js — per-segment checks on what the paid MT RETURNED, for the damage
 * every count-based gate is blind to (2026-09-26 ruling, §C183 paid-run guards).
 *
 * Every check compares VALUES keyed on the SEG id. A tally cannot see these defects: a
 * substituted symbol leaves every marker intact, a truncated one-segment chunk still
 * carries exactly one SEG marker, and a marker cut before its `-->` still counts as a
 * `<!-- SEG:` prefix (`validateMarkers` counts prefixes).
 *
 *   ① greekConservationBySegment — an English Greek letter missing from the Icelandic.
 *   ② segmentIdSetDelta — ids lost or invented; the precondition for the value legs.
 *      truncationSuspectsBySegment — a long segment that came back far too short, or
 *      that stops mid-sentence where its English ends one.
 *
 * Pure: strings in, findings out. The caller decides the verdict.
 */

import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { parseSegmentsMap } = require('./seg-markers.cjs');

// ─── ① Greek-letter conservation ─────────────────────────────────────

/**
 * Look-alike codepoints folded to the Greek letter they stand for, BEFORE comparing.
 * Applied after NFKC (see greekLetters), which already maps µ, the Ohm sign, the Greek
 * symbol variants (ϵ ϑ ϕ ϖ ϱ ϰ ϐ) and mathematical-alphanumeric Greek to their letters.
 * These three have NO Unicode decomposition, so NFKC leaves them alone.
 *
 * Built from code points on purpose: each is visually identical to the letter it maps to,
 * so a literal table reads as an identity map — a formatter turned the first version's
 * escapes into exactly that.
 *
 * 🔴 WHAT THE FOLD IS FOR — corrected 2026-09-28 by the adversarial review; the first
 * version of this comment had it backwards. None of the three is `\p{Script=Greek}`, so
 * WITHOUT the fold an EN `∆` never enters the EN multiset and the MT's proper `Δ` reads as
 * an ADDITION — reported, not held. The fold matters to the HOLD verdict in two
 * directions: an EN look-alike that the IS LOSES (`∆H` → `H`, invisible without it), and
 * an IS look-alike where the EN had the proper letter. Chemistry's committed MT
 * normalises them all (in EN → IS: ∆ 2 → 0, Ʃ 5 → 0, ∑ 2 → 1). The corpus test pins the
 * fold through the ADDITION set: without it, six more segments read as additions.
 * ⚠️ Case is deliberately NOT folded: α → Α (chemistry m68852) is a real defect — the
 * reader sees what looks like a Latin A.
 */
export const GREEK_LOOKALIKE_FOLD = Object.freeze(
  Object.fromEntries([
    [String.fromCodePoint(0x2206), String.fromCodePoint(0x0394)], // INCREMENT → capital delta
    [String.fromCodePoint(0x01a9), String.fromCodePoint(0x03a3)], // Latin capital esh (a sum sign) → sigma
    [String.fromCodePoint(0x2211), String.fromCodePoint(0x03a3)], // N-ary summation → sigma
  ])
);

const LOOKALIKE_RE = new RegExp(`[${Object.keys(GREEK_LOOKALIKE_FOLD).join('')}]`, 'gu');
const GREEK_RE = /\p{Script=Greek}/gu;

/**
 * The Greek letters in `text`, look-alikes folded, sorted (so two multisets compare as
 * arrays).
 *
 * NFKC first: a symbol VARIANT is the same letter (organic's MT turned `ϵ` into `ε`,
 * measured), and holding a chapter back for it would be noise. NFKC also reduces a bare
 * tonos to a combining accent, which is not Script=Greek.
 * ⚠️ A known false-hold class no fold can cover: the MT CORRECTING a source error. Organic
 * m00036 writes υ (upsilon) "where υ is the Greek letter nu", and the MT wrote ν. That is
 * held back, and a human confirms it.
 * @param {string} text
 * @returns {string[]}
 */
export function greekLetters(text) {
  const folded = String(text ?? '')
    .normalize('NFKC')
    .replace(LOOKALIKE_RE, (ch) => GREEK_LOOKALIKE_FOLD[ch]);
  return (folded.match(GREEK_RE) || []).sort();
}

/** Multiset difference a − b over sorted arrays. */
function minus(a, b) {
  const left = new Map();
  for (const ch of b) left.set(ch, (left.get(ch) || 0) + 1);
  const out = [];
  for (const ch of a) {
    const n = left.get(ch) || 0;
    if (n > 0) left.set(ch, n - 1);
    else out.push(ch);
  }
  return out;
}

/**
 * Per segment: which English Greek letters the Icelandic LOST, and which it ADDED.
 *
 * 🔴 A SUBSTITUTION ALWAYS SHOWS UP AS A LOSS, so a loss is the defect the caller should
 * act on. Measured on chemistry's committed MT: σ,π → Δ,Δ (m68745), π → Β (m68846),
 * α → Α and γ → Γ (m68852) — every marker intact, every existing gate green.
 * ⚠️ An ADDITION is not a defect by itself: the MT turns OpenStax's spelled-out
 * accessibility names into symbols ("wavelength lambda" → λ, m68729), and 19 of
 * chemistry's 191 table summaries spell Greek out. Report additions; do not block on them.
 * ⚠️ The one shape this misses: a substitution masked by an addition of the SAME letter
 * (a real σ becomes Δ while a spelled "sigma" becomes σ). Rare, and strict equality would
 * trade it for a false alarm on every spelled-out name.
 *
 * Only ids present in BOTH texts are compared — a lost or invented id is
 * segmentIdSetDelta's job, and the caller must run it too.
 *
 * @param {string} enContent an EN segment file (or chunk)
 * @param {string} isContent the IS returned for it
 * @returns {Array<{segId: string, lost: string[], added: string[]}>} changed segments only
 */
export function greekConservationBySegment(enContent, isContent) {
  const en = parseSegmentsMap(enContent);
  const is = parseSegmentsMap(isContent);
  const findings = [];
  for (const [segId, enText] of en) {
    if (!is.has(segId)) continue;
    const e = greekLetters(enText);
    const i = greekLetters(is.get(segId));
    const lost = minus(e, i);
    const added = minus(i, e);
    if (lost.length || added.length) findings.push({ segId, lost, added });
  }
  return findings;
}

// ─── ② Silent truncation ─────────────────────────────────────────────

/**
 * Which SEG ids differ between an EN chunk and the IS returned for it — compared as SETS
 * of PARSED ids, never as a count of the literal `<!-- SEG:` prefix.
 *
 * 🔴 THIS IS THE CHECK THE VALUE LEGS DEPEND ON. They judge only ids present on BOTH
 * sides, so a segment whose MARKER was lost is never judged at all. Found by the
 * 2026-09-28 adversarial review: a response cut INSIDE the next marker (`…flæðir.\n\n<!-- SEG:`)
 * keeps the literal count equal (`validateMarkers` passes), the parser needs `-->` so the
 * cut segment is simply absent, and the stray prefix became part of the previous segment's
 * text — written to disk. A mangled id (m68742 for m68724) and a duplicated marker standing
 * in for a dropped one take the same route. Measured base rate: 0 of 205 committed EN/IS
 * pairs across four books differ in id set.
 *
 * @param {string} enContent an EN segment file (or chunk)
 * @param {string} isContent the IS returned for it
 * @returns {{missing: string[], extra: string[]}} EN ids the IS lacks; IS ids the EN lacks
 */
export function segmentIdSetDelta(enContent, isContent) {
  const en = new Set(parseSegmentsMap(enContent).keys());
  const is = new Set(parseSegmentsMap(isContent).keys());
  return {
    missing: [...en].filter((id) => !is.has(id)),
    extra: [...is].filter((id) => !en.has(id)),
  };
}

/**
 * The ratio leg: an EN segment at least this long whose IS is shorter than
 * TRUNCATION_MAX_RATIO × its length is a truncation suspect.
 *
 * 🔴 MEASURED, WITH HEADROOM. Over every committed EN/IS pair in six books on 2026-09-28
 * (32,402 aligned segments), the lowest IS/EN ratio for an EN segment of ≥ 200 characters
 * was 0.633 (a chemistry caption); ≥ 1,000 characters, 0.779. Below 200 characters ratios
 * fall to 0.08 legitimately (a 52-character title rendered as one word), so short
 * segments are not judged. The floor sits well under the lowest honest value.
 * ⚠️ A length check has a built-in blind spot: a response cut cleanly at a sentence
 * boundary that keeps more than half the segment passes BOTH legs. No threshold closes
 * it without refusing honest output (0.633 is the floor of the honest distribution).
 */
export const TRUNCATION_MIN_EN_CHARS = 200;
export const TRUNCATION_MAX_RATIO = 0.5;

/**
 * The sentence leg: where an EN segment of at least this many characters ends a
 * SENTENCE, its IS must end one too.
 *
 * 🔴 THIS CATCHES WHAT THE RATIO CANNOT — a response cut near its END, which barely moves
 * the ratio. Measured 2026-09-28 over every committed pair in every book: 8,087 EN
 * segments of ≥ 100 characters end a sentence, and 0 of their IS do not.
 * ⚠️ It is strict on purpose (adversarial review, same day). `)`, `;`, `:` and a closing
 * `]]` are ordinary INTERIOR characters in chemistry prose (`Na(aq)`, `[[sup:+]]`), so the
 * first version, which accepted any of them as an ending, passed an IS cut right after one.
 */
export const UNTERMINATED_MIN_EN_CHARS = 100;

/**
 * The loose leg: an EN segment this long that ends in a closer but NOT a sentence
 * (e.g. `… (aq)`) keeps the first version's check, so it loses no coverage. Measured:
 * 4,049 EN segments of ≥ 300 characters end in CLEAN_END, and 0 of their IS do not.
 */
export const LOOSE_END_MIN_EN_CHARS = 300;

// A sentence end: `.` `!` `?` `…`, then any closers — a quote in either language's
// convention (Icelandic closes „…“ with U+201C), a `)`, or a closing marker `]]`.
const SENTENCE_END = /[.!?…](?:["'”“»)]|\]\])*$/u;
// Anything that closes something: the loose leg's predicate.
const CLEAN_END = /[.!?:;)\]"'”“»…]$/u;

/**
 * Per segment: does the IS look truncated?
 *
 * @param {string} enContent an EN segment file (or chunk)
 * @param {string} isContent the IS returned for it
 * @returns {Array<{segId: string, reason: 'ratio'|'unterminated', enLen: number,
 *   isLen: number, ratio: number, isTail: string}>} suspects only; `isTail` is the last
 *   80 characters of the IS, so the evidence survives a refusal to write
 */
export function truncationSuspectsBySegment(enContent, isContent) {
  const en = parseSegmentsMap(enContent);
  const is = parseSegmentsMap(isContent);
  const suspects = [];
  for (const [segId, enText] of en) {
    if (!is.has(segId)) continue;
    const isText = is.get(segId);
    const enLen = enText.length;
    const isLen = isText.length;
    const ratio = Math.round((isLen / Math.max(1, enLen)) * 1000) / 1000;
    const base = { segId, enLen, isLen, ratio, isTail: isText.slice(-80) };
    if (enLen >= TRUNCATION_MIN_EN_CHARS && isLen / enLen < TRUNCATION_MAX_RATIO) {
      suspects.push({ ...base, reason: 'ratio' });
    } else if (SENTENCE_END.test(enText)) {
      if (enLen >= UNTERMINATED_MIN_EN_CHARS && !SENTENCE_END.test(isText)) {
        suspects.push({ ...base, reason: 'unterminated' });
      }
    } else if (
      enLen >= LOOSE_END_MIN_EN_CHARS &&
      CLEAN_END.test(enText) &&
      !CLEAN_END.test(isText)
    ) {
      suspects.push({ ...base, reason: 'unterminated' });
    }
  }
  return suspects;
}
