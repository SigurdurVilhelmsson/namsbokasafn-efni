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
