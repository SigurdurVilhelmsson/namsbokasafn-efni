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
  if (typeof alt === 'string') return alt;
  const translated = alt.segmentId && getSeg ? getSeg(alt.segmentId) : null;
  return translated || alt.text || '';
}
