/**
 * Shared rules for figure/media `alt` segments (§C81).
 *
 * Both the extractor and the injector need these, at three sites each. They live
 * here so the id rule and the dual-shape read exist once rather than six times.
 */

/**
 * The `elementId` to hand generateSegmentId for a media's alt segment.
 *
 * Media with an id get a stable, content-anchored id. The 32 id-less media in
 * scope (all standalone, all in lifraen-efnafraedi) fall back to a positional
 * index, which is only safe because §C80 re-extracts both books wholesale.
 *
 * `kind` namespaces that fallback. The inline and standalone paths keep
 * SEPARATE counters — the inline one is `counters.media`, which also builds the
 * [[MEDIA:N]] placeholder embedded in paragraph text, so nothing else may touch
 * it. Two independent counters would otherwise both reach 1 in the same module
 * and emit two segments named `media-1-alt`.
 *
 * @param {string|null|undefined} mediaId
 * @param {number} index - counters.media for inline; the standalone counter otherwise
 * @param {'media'|'standalone'} [kind='media']
 * @returns {string}
 */
export function altElementId(mediaId, index, kind = 'media') {
  if (typeof mediaId === 'string' && mediaId.length > 0) return `${mediaId}-alt`;
  return `${kind}-${index}-alt`;
}

/**
 * §C88 Unit A — a CONTENT-ANCHORED alt elementId for an id-less `<media>` sitting
 * directly in a table `<entry>`. Derived from the image `src`, never from position.
 *
 * WHY NOT POSITIONAL. The emit site used to call `altElementId(media.id, 0)` with a
 * hardcoded index, so every id-less media in a module would collide on a single
 * `media-0-alt` — which is the second failure the `if (!media.id) continue` guard
 * was suppressing while its comment documented only the first. A positional key
 * fixes that collision but inherits any future cell-indexing drift, and 🔴 an alt
 * written to the WRONG CELL is silent: no count moves (§C89). `src` is anchored to
 * the content it describes, so it cannot drift.
 *
 * WHY IT IS SLUGGED, and this is load-bearing rather than cosmetic: the canonical
 * marker parser (`server/services/segmentParser.js`) matches the elementId as
 * `[\w-]+`, so a raw `src` — slashes, dots — DOES NOT PARSE, and a marker that
 * fails to parse yields an EMPTY segment list SILENTLY, not an error. A bare
 * basename fails too, on the extension's dot (measured: 245 of 245). ⚠️ Note the
 * two parsers disagree — `tools/lib/extraction-coverage.js` uses the looser
 * `[^\s]+?`, so an unslugged key would look fine to the coverage check while being
 * invisible to the editor. Slugging satisfies both.
 *
 * Measured over organic's 245 (test-results/c88-unit-a-key-design-probe-2026-08-24.mjs
 * and c88-key-disjointness-probe-2026-08-24.mjs): 0 in-module duplicates, 0
 * collisions with segment ids the module already emits, max key length 38.
 *
 * @param {string|null|undefined} src - the child `<image>`'s src attribute
 * @returns {string|null} elementId, or null when there is no usable src — the
 *   caller must then leave the media unextracted, which is the original guard's
 *   correct behaviour for a genuinely unkeyable media (0 of 245 today).
 */
export function altElementIdFromSrc(src) {
  const base = String(src || '')
    .split('/')
    .pop();
  const slug = base.replace(/[^\w-]+/g, '_').replace(/^_+|_+$/g, '');
  return slug ? `${slug}-alt` : null;
}

/**
 * Read an alt value out of EITHER shape.
 *
 * Legacy structures (pre-§C81) carry `alt` as a plain string; new ones carry
 * `{ segmentId, text }`. §C82 re-extracts one module at a time, so both shapes
 * are live simultaneously for the whole run — this is required, not defensive.
 * Passing the new shape to code that expects a string yields "[object Object]"
 * in a published page.
 *
 * @param {string|{segmentId?: string, text?: string}|null|undefined} alt
 * @param {(id: string) => (string|null|undefined)} [getSeg]
 * @returns {string} '' when there is nothing to emit
 */
export function readAlt(alt, getSeg) {
  if (!alt) return '';
  if (typeof alt === 'string') return stripAltMarkers(alt);
  const translated = alt.segmentId && getSeg ? getSeg(alt.segmentId) : null;
  return stripAltMarkers(translated || alt.text || '');
}

/**
 * Unwrap EVERY bracket marker in an alt value to its visible content.
 *
 * 🔴 AN `alt` IS AN XML ATTRIBUTE VALUE. MARKUP CANNOT LIVE THERE, so extraction
 * can never emit a marker into an alt segment — measured 2026-09-20 across the
 * whole committed corpus: **0 of 3,312 EN alt segments carry one**. A marker on
 * the IS side is therefore INVENTED BY CONSTRUCTION, and unwrapping it to its
 * content cannot destroy anything legitimate. That 0.000% base rate is the
 * entire safety argument, and `alt-marker-unwrap.test.js` ASSERTS it rather
 * than describing it: if extraction ever starts emitting a marker into an alt,
 * that test goes red and this function becomes destructive.
 *
 * ⚠️ THIS IS ORTHOGONAL TO `unwrapInventedMarkers`, AND NEITHER SUBSUMES THE
 * OTHER. That one decides by TYPE — it strips only types absent from
 * `KNOWN_BRACKET_TYPES`, which is why it could not see this: the live instance
 * was `[[sub:]]`, a wholly legitimate type invented in a position where NO type
 * is legitimate. Type and position are independent rules.
 *
 * Found in chemistry ch12 m68791 (2026-09-20). OpenStax spells subscripts out
 * in words in alt text because screen readers read it aloud — "C subscript 4 H
 * subscript 6" — and the MT helpfully rendered them as real markup. Inject then
 * REFUSED the module rather than write a raw `[[sub:4]]` onto a published page,
 * which is the correct failure and is how this was caught at all.
 *
 * The scanner deliberately mirrors `unwrapInventedMarkers`' grammar, including
 * its reason for advancing ONE character on a non-opener: the corpus carries
 * literal square brackets abutting real markers (chemistry unit notation), so
 * skipping two would step over a real opener.
 *
 * @param {string} text
 * @returns {string} the same text with every bracket marker unwrapped
 */
function unwrapBracketMarkers(text) {
  const s = String(text ?? '');
  if (!s.includes('[[')) return s; // fast path: the overwhelming majority
  let out = '';
  let i = 0;
  while (i < s.length) {
    if (!s.startsWith('[[', i)) {
      out += s[i];
      i++;
      continue;
    }
    let j = i + 2;
    let type = '';
    let sep = null;
    while (j < s.length) {
      if (s[j] === ':' || s[j] === '|') {
        sep = s[j];
        break;
      }
      if (s.startsWith(']]', j)) {
        sep = ']]';
        break;
      }
      if (s[j] === '[' || s[j] === ']' || /\s/.test(s[j])) break;
      type += s[j];
      j++;
    }
    if (sep === null || type === '') {
      // Not an opener. Advance ONE so the scan re-anchors on an inner `[[`.
      out += s[i];
      i += 1;
      continue;
    }
    if (type.startsWith('/')) {
      // A closing token carries no content; emitting its name would put the
      // marker's TYPE into the alt as prose, which is the §C67 damage shape.
      i = j + (sep === ']]' ? 2 : 1);
      if (sep !== ']]') {
        const end = s.indexOf(']]', i);
        i = end === -1 ? s.length : end + 2;
      }
      continue;
    }
    if (sep === ']]') {
      // Bare `[[word]]`: the type token IS the intended word.
      out += type;
      i = j + 2;
      continue;
    }
    const end = s.indexOf(']]', j);
    if (end === -1) {
      // Unterminated: not a marker. Advance one and re-anchor.
      out += s[i];
      i += 1;
      continue;
    }
    const inner = s.slice(j + 1, end);
    // `[[xref:label|target]]` — a reader sees the LABEL; the target is routing.
    // `[[label|target]]` (sep `|`) — the type token is itself the label.
    out += sep === '|' ? type : inner.split('|')[0];
    i = end + 2;
  }
  return out;
}

/**
 * An inline TAG in an alt — quote-aware, so a bare `>` inside an attribute
 * value cannot truncate the match.
 *
 * 🔴 `<tag[^>]*>` IS THE WRONG SPAN AND THIS REPO HAS MEASURED WHY (§C115): only
 * `<` and `&` MUST be escaped in an attribute value, so a raw `>` is legal there
 * and `[^>]*` stops at the first one — leaving half a tag in a published alt.
 * ⚠️ THE LEADING `[a-zA-Z]` IS LOAD-BEARING, not tidiness: an alt is PROSE, and
 * descriptions really do contain `x < y`. Requiring a tag NAME after `<` is what
 * keeps a mathematical comparison from being eaten as markup.
 */
const ALT_INLINE_TAG = new RegExp(`</?[a-zA-Z][a-zA-Z0-9]*(?:"[^"]*"|'[^']*'|[^>'"])*>`, 'g');

/**
 * Strip every form of markup from an alt value, leaving its visible text.
 *
 * 🔴 §C176 — §C169's UNWRAP WAS CORRECT AND STILL LET THE DEFECT REACH A READER,
 * BECAUSE ON ONE PATH IT RAN TOO LATE. `getSeg` ends in `reverseInlineMarkup()`,
 * which turns `[[sub:w]]` into `<sub>w</sub>`; `readAlt(alt, getSeg)` resolves
 * THROUGH that conversion, so the bracket scanner above finds nothing left to
 * unwrap and the markup reaches the page — where `escapeAttr` then double-escapes
 * it and a screen reader reads out the literal characters `&lt;sub&gt;`.
 * Measured on `appendices-5-eiginleikar-vatns.html` 2026-09-22.
 *
 * ▶ "PATCH THE SHARED LOOKUP, NOT THE WRITERS" WAS NECESSARY AND NOT SUFFICIENT.
 * §C169 landed in `ctx.peekSeg`, which reads `segments.get()` RAW and is
 * therefore immune — correct, and silent about `readAlt(…, getSeg)`, which is a
 * SECOND shared resolution point. A fix at one shared point says nothing about
 * the other. ▶ **Enumerate the RESOLUTION paths, not just the writers.**
 *
 * So the invariant is widened rather than another caller added: **an `alt` may
 * not contain markup, in whatever form it arrived** — brackets, tags, or both.
 * That holds no matter which reader a caller was handed, which is the property
 * the previous fix lacked.
 *
 * @param {string} text
 * @returns {string} the same text with every marker and inline tag unwrapped
 */
export function stripAltMarkers(text) {
  return unwrapBracketMarkers(text).replace(ALT_INLINE_TAG, '');
}

/**
 * The SAME transform under a name that does not say "alt".
 *
 * §C126 ② needs it for `<md:title>`, which is mdml METADATA and text-only —
 * OpenStax's own source is the proof: m00163 carries
 * `<title><emphasis effect="italics">sp</emphasis><sup>3</sup> …</title>` beside
 * `<md:title>sp3 …</md:title>`. Same words, one slot marked up and one not.
 *
 * ⚠️ AN ALIAS, NOT A COPY. A second implementation of one rule is how the two
 * halves drift apart while both look right — the failure this repo keeps
 * measuring. Same function object, so they cannot.
 */
export const stripMarkupToText = stripAltMarkers;
