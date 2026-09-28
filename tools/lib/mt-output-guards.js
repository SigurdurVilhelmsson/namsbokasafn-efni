/**
 * mt-output-guards.js — per-segment checks on what the paid MT RETURNED, for the damage
 * every count-based gate is blind to (2026-09-26 ruling, §C183 paid-run guards).
 *
 * Both checks compare VALUES segment by segment, keyed on the SEG id. A tally cannot see
 * either defect: a substituted symbol leaves every marker intact, and a truncated
 * one-segment chunk still carries exactly one SEG marker (`validateMarkers` counts them).
 *
 *   ① greekConservationBySegment — an English Greek letter missing from the Icelandic.
 *   ② truncationSuspectsBySegment — a long segment that came back far too short, or
 *      that stops mid-sentence where its English ends cleanly.
 *
 * Pure: strings in, findings out. The caller decides the verdict.
 */

import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { parseSegmentsMap } = require('./seg-markers.cjs');

// ─── ① Greek-letter conservation ─────────────────────────────────────

/**
 * Look-alike codepoints folded to the Greek letter they stand for, BEFORE comparing.
 *
 * 🔴 CORPUS-DERIVED, NOT GUESSED. OpenStax's English writes these, and the MT returns the
 * proper Greek letter — measured 2026-09-28 over chemistry's committed pairs: `∆` 2 in EN
 * → 0 in IS, `Ʃ` 5 → 0, `∑` 2 → 1, `µ` 4 → 3. Without the fold, 7 correct normalisations
 * read as losses and bury the 4 real substitutions. U+2126 OHM SIGN is included because it
 * is CANONICALLY the same character as Greek Ω (NFC maps one to the other), not because
 * chemistry carries it.
 * ⚠️ Case is deliberately NOT folded: α → Α (chemistry m68852) is a real defect — the
 * reader sees what looks like a Latin A.
 */
export const GREEK_LOOKALIKE_FOLD = Object.freeze({
  '∆': 'Δ', // ∆ INCREMENT → Δ
  Ʃ: 'Σ', // Ʃ LATIN CAPITAL ESH (used as a sum sign) → Σ
  '∑': 'Σ', // ∑ N-ARY SUMMATION → Σ
  µ: 'μ', // µ MICRO SIGN → μ
  Ω: 'Ω', // Ω OHM SIGN → Ω
});

const LOOKALIKE_RE = new RegExp(`[${Object.keys(GREEK_LOOKALIKE_FOLD).join('')}]`, 'gu');
const GREEK_RE = /\p{Script=Greek}/gu;

/**
 * The Greek letters in `text`, look-alikes folded, sorted (so two multisets compare as
 * arrays).
 * @param {string} text
 * @returns {string[]}
 */
export function greekLetters(text) {
  const folded = String(text ?? '').replace(LOOKALIKE_RE, (ch) => GREEK_LOOKALIKE_FOLD[ch]);
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
 * Only ids present in BOTH texts are compared — a missing id is the SEG-count check's job.
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
 * The ratio leg: an EN segment at least this long whose IS is shorter than
 * TRUNCATION_MAX_RATIO × its length is a truncation suspect.
 *
 * 🔴 MEASURED, WITH HEADROOM. Over every committed EN/IS pair in six books on 2026-09-28
 * (32,402 aligned segments), the lowest IS/EN ratio for an EN segment of ≥ 200 characters
 * was 0.633 (a chemistry caption); ≥ 1,000 characters, 0.779. Below 200 characters ratios
 * fall to 0.08 legitimately (a 52-character title rendered as one word), so short
 * segments are not judged. The floor sits well under the lowest honest value.
 */
export const TRUNCATION_MIN_EN_CHARS = 200;
export const TRUNCATION_MAX_RATIO = 0.5;

/**
 * The unterminated leg: an EN segment at least this long that ends in terminal
 * punctuation, whose IS does not, is a truncation suspect.
 *
 * 🔴 THIS CATCHES WHAT THE RATIO CANNOT — a response cut near its END, which barely moves
 * the ratio. Measured 2026-09-28 over the same pairs: 4,049 EN segments of ≥ 300
 * characters end cleanly, and 0 of their IS do not.
 */
export const UNTERMINATED_MIN_EN_CHARS = 300;

// A clean ending: sentence punctuation, a closing bracket or marker (`]]`), or a closing
// quote in either language's convention (Icelandic closes „…“ with U+201C).
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
    } else if (
      enLen >= UNTERMINATED_MIN_EN_CHARS &&
      CLEAN_END.test(enText) &&
      !CLEAN_END.test(isText)
    ) {
      suspects.push({ ...base, reason: 'unterminated' });
    }
  }
  return suspects;
}
