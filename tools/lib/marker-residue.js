/**
 * marker-residue.js — the ONE owner of the "a bracket marker survived into
 * output" predicate, for both the inject-side gate (`assertNoMarkerResidue`,
 * tools/cnxml-inject.js) and the render-side gate on emitted HTML
 * (tools/cnxml-render.js). Register §C145 ① and ②.
 *
 * 🔴 WHY OPENER-ONLY. The gate this replaces matched a WHOLE token:
 *   /\[\[(?!MATH:|MEDIA:)[A-Za-z][\w]*:[^\]]*\]\]/
 * ⑰'s `annotateInlineTerms` corruption CONSUMES the closing `]]`, so that
 * pattern scored 0 matches on the committed corrupt chemistry m68700
 * (`66612e43d`) while the literal `[[term:tala Avogadros …` sat in the file and
 * later reached a prepared reader page, where it went unnoticed for eleven days.
 * ▶ **A gate that finds residue by matching the whole token cannot see a token
 * whose end was destroyed.** The opener alone is the part the damage cannot eat.
 *
 * The carve-out `(?!MATH:|MEDIA:)` is CASE-SENSITIVE and deliberately identical
 * to the old gate's, on both sides:
 *  - `[[MATH:n]]` / `[[MEDIA:n]]` are positional placeholders with a
 *    pre-existing tolerant soft-report path at inject, and
 *    `term-text.js`'s `stripInlineMarkers` keeps `[[MATH:n]]` on purpose for
 *    `flattenMarkersToText` to resolve — so a render-side gate that flagged
 *    them would refuse on a shape the pipeline maintains by design.
 *  - Their count is still reported, non-gating, via `countPlaceholderMarkers`.
 * A lowercase `[[math:n]]` is NOT carved out, and that is intended: the
 * lowercase form exists only mid-pipeline (`resolveMathPlaceholders` matches
 * `/gi` for a caller that folds case first), so one reaching output is a defect.
 *
 * ⚠️ Measured 2026-09-17 across every tracked `.cnxml` and `.html` under
 * `books/` in all five books (01-source, 03-translated, 05-publication):
 * exactly ONE opener hit, `[[b:]]` in microbiology m58805 — a CLOSED marker the
 * old gate also matches. So widening to opener-only adds no new refusal to
 * today's corpus; it only adds sight of the truncated shape. Re-derive that
 * census rather than trusting this paragraph.
 */

/** Source of the opener-only predicate. Kept as a string so every consumer
 * mints its own `RegExp` — a shared `/g` regex carries `lastIndex` state and
 * two consumers would silently interleave. */
export const MARKER_RESIDUE_OPENER_SOURCE = '\\[\\[(?!MATH:|MEDIA:)[A-Za-z]\\w*:';

/**
 * How far the end-scan will look for a marker's close before calling it
 * truncated. Real marker bodies are short — the longest in the corpus is a
 * 485-character figure alt — so a `]]` further away than this belongs to
 * something else, and claiming it would invent a token that is not there.
 */
const MAX_MARKER_SPAN = 2000;

/**
 * Find the end of the marker that starts at `start`, DEPTH-AWARE.
 *
 * ⚠️ This deliberately does NOT use `[^\]]*\]\]`. That is the very idiom this
 * whole item exists to correct (CLAUDE.md § a bare `>` … / §C115: a character
 * class used to find the end of a structured token), and it fails here in two
 * measured ways: it stops at the first `]` of a NESTED marker's close, and on a
 * genuinely truncated marker it runs on and matches a `]]` belonging to some
 * later marker — reporting a token that does not exist in the file.
 *
 * @returns {number|null} index just past the closing `]]`, or null if the marker
 *   never closes within `MAX_MARKER_SPAN` — i.e. its end was destroyed.
 */
function markerEnd(text, start) {
  const limit = Math.min(text.length, start + MAX_MARKER_SPAN);
  let depth = 1;
  let i = start + 2;
  while (i < limit && depth > 0) {
    if (text.startsWith('[[', i)) {
      depth++;
      i += 2;
    } else if (text.startsWith(']]', i)) {
      depth--;
      i += 2;
    } else {
      i++;
    }
  }
  return depth === 0 ? i : null;
}

const PLACEHOLDER_RE = /\[\[(MATH|MEDIA):\d+\]\]/g;

/** @returns {RegExp} a fresh global opener matcher (no shared `lastIndex`). */
export function markerResidueRegex() {
  return new RegExp(MARKER_RESIDUE_OPENER_SOURCE, 'g');
}

/**
 * Find every surviving bracket marker in `text`.
 *
 * @param {string} text - injected CNXML or emitted HTML
 * @param {{contextChars?: number}} [opts]
 * @returns {Array<{opener: string, token: string|null, index: number, context: string}>}
 *   `token` is the whole `[[type:…]]` when the marker is intact, and `null`
 *   when its closing `]]` was destroyed — the shape the old gate could not see.
 *   `context` is a whitespace-collapsed window around the hit, which is what
 *   makes a truncated hit diagnosable at all (`[[term:` alone names no module
 *   position and no content).
 */
export function findMarkerResidue(text, opts = {}) {
  const contextChars = opts.contextChars ?? 60;
  const src = String(text ?? '');
  const re = markerResidueRegex();
  const hits = [];
  let m;
  while ((m = re.exec(src)) !== null) {
    const end = markerEnd(src, m.index);
    hits.push({
      opener: m[0],
      token: end === null ? null : src.slice(m.index, end),
      index: m.index,
      context: src
        .slice(Math.max(0, m.index - contextChars), m.index + contextChars)
        .replace(/\s+/g, ' ')
        .trim(),
    });
    // A zero-length match is impossible here (the pattern consumes `[[x:`),
    // so `exec` always advances.
  }
  return hits;
}

/**
 * Count the carved-out positional placeholders. Non-gating by design: reported
 * so a render summary can show them, never so a render refuses on them.
 * @param {string} text
 * @returns {{math: number, media: number}}
 */
export function countPlaceholderMarkers(text) {
  const out = { math: 0, media: 0 };
  const re = new RegExp(PLACEHOLDER_RE.source, 'g');
  let m;
  while ((m = re.exec(String(text ?? ''))) !== null) {
    if (m[1] === 'MATH') out.math++;
    else out.media++;
  }
  return out;
}

/**
 * Render hits as an error/report body: one line per distinct hit, showing the
 * whole token where it survives, `[[term:` + context where it does not, and
 * flagging truncation explicitly — a reader of the message must be able to tell
 * the two apart, because they have different causes and different fixes.
 *
 * @param {Array<{opener:string, token:string|null, index:number, context:string}>} hits
 * @param {{max?: number}} [opts]
 * @returns {string}
 */
export function describeMarkerResidue(hits, opts = {}) {
  const max = opts.max ?? 10;
  const seen = new Set();
  const lines = [];
  for (const h of hits) {
    const key = `${h.opener}|${h.token ?? ''}|${h.context}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (lines.length >= max) continue;
    // A token may legitimately be long (a figure alt runs to hundreds of
    // characters); the context window carries the position, so the token is
    // shown only far enough to identify it.
    const token = h.token && h.token.length > 120 ? `${h.token.slice(0, 117)}...` : h.token;
    lines.push(
      token
        ? `  ${token} @${h.index} — …${h.context}…`
        : `  ${h.opener} @${h.index} TRUNCATED (no closing ]]) — …${h.context}…`
    );
  }
  const extra = seen.size > lines.length ? `\n  … and ${seen.size - lines.length} more` : '';
  return lines.join('\n') + extra;
}
