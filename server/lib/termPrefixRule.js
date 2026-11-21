/**
 * termPrefixRule.js — which Icelandic terms the editor's term check may accept
 * as the START of a word (§C246).
 *
 * Icelandic writes compounds as one word, so `magnesíumklóríð` holds
 * `magnesíum` with no right word boundary. The term check
 * (terminologyService.findTermsInSegments) accepts such a word for a winner or
 * a tie option whose text qualifies here; alternatives and stored inflected
 * forms stay whole-word. Design and [USER]'s five rulings of 2026-11-21:
 * docs/superpowers/specs/2026-11-21-c246-term-check-prefix-rule-design.md.
 *
 * ⚠️ THE TWO VALUES BELOW ARE ENFORCEABLE VALUES AND THIS IS THEIR ONLY COPY
 * (CLAUDE.md § One source of truth). server/__tests__/termPrefixRule.test.js
 * pins them. Change them here, never restate them elsewhere.
 */

/** A term shorter than this many code points never takes the prefix (ruling 2). */
const MIN_PREFIX_TERM_LENGTH = 4;

/**
 * Forms that never take the prefix, compared to the lowercased term text
 * exactly (ruling 3): `merki` starts `merking`, which is not its compound.
 * Exact, so `formerki` is not excluded.
 */
const PREFIX_EXCLUDED_FORMS = Object.freeze(['merki']);

/**
 * Whether a term's text may match as the start of a word.
 *
 * A single word qualifies at MIN_PREFIX_TERM_LENGTH code points or more. A
 * multi-word or hyphenated term qualifies when its last part (split on
 * whitespace and hyphens) does (ruling 5, B3), so a term ending in a hyphen
 * (`upphafs-`) has an empty last part and never qualifies.
 *
 * @param {string|null|undefined} text the term text as stored
 * @returns {boolean}
 */
function prefixQualifies(text) {
  if (typeof text !== 'string' || text === '') return false;
  if (PREFIX_EXCLUDED_FORMS.includes(text.toLowerCase())) return false;
  const parts = text.split(/[\s-]/);
  const last = parts[parts.length - 1];
  return [...last].length >= MIN_PREFIX_TERM_LENGTH;
}

module.exports = { MIN_PREFIX_TERM_LENGTH, PREFIX_EXCLUDED_FORMS, prefixQualifies };
