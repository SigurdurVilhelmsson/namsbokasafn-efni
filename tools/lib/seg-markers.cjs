/**
 * seg-markers.cjs — the single SEG-marker parser. Replaces 7 hand-maintained
 * copies (audit #14). CommonJS so both the ESM tools (named import) and the
 * CommonJS server (sync require) can consume it.
 *
 * Marker format: <!-- SEG:module:type:elementId -->. Content runs from a marker
 * to the next marker (or EOF), trimmed — marker-based, so a marker glued onto
 * the previous line is handled (the PR #96 failure).
 */

// Whitespace-tolerant, permissive 3-part id. Proven identical to the prior
// permissive/strict/exact variants across 54,379 corpus markers.
const SEG_MARKER = /<!--\s*SEG:([^\s]+?)\s*-->/g;

/**
 * Parse into Map<id, text>.
 *
 * CANONICAL DUPLICATE-SEG-ID POLICY (campaign item #15): a seg-id's occurrences must
 * carry the same VISIBLE content. `'first'` here is the deliberate RUNTIME TOLERANCE —
 * a benign duplicate (identical normalized visible text; the depth-blind duplicate-
 * emission artifact) loses nothing because the source element is unique and filled once.
 * ENFORCEMENT lives at the pre-freeze gate (tools/verify-extraction-coverage.js →
 * checkDuplicateSegIds), which fails only on a *real* duplicate (occurrences with
 * DIFFERENT visible text = a content drop). Do not add duplicate-id failing here — the
 * runtime path must stay tolerant so already-frozen benign dups never break inject.
 *
 * @param {string} content
 * @param {{duplicates?: 'first'|'last'}} [opts] - 'first' (default) skips repeats; 'last' overwrites.
 * @returns {Map<string,string>}
 */
function parseSegmentsMap(content, { duplicates = 'first' } = {}) {
  const segments = new Map();
  if (!content) return segments;
  const re = new RegExp(SEG_MARKER.source, 'g');
  let currentId = null;
  let contentStart = 0;
  for (const match of content.matchAll(re)) {
    if (currentId !== null) {
      const text = content.slice(contentStart, match.index).trim();
      if (duplicates === 'last' || !segments.has(currentId)) segments.set(currentId, text);
    }
    currentId = match[1];
    contentStart = match.index + match[0].length;
  }
  if (currentId !== null) {
    const text = content.slice(contentStart).trim();
    if (duplicates === 'last' || !segments.has(currentId)) segments.set(currentId, text);
  }
  return segments;
}

/**
 * Parse into ordered records, keeping ALL occurrences.
 * @param {string} content
 * @returns {Array<{segmentId:string,moduleId:string,segmentType:string,elementId:string,content:string}>}
 */
function parseSegmentRecords(content) {
  const records = [];
  if (!content) return records;
  const re = new RegExp(SEG_MARKER.source, 'g');
  let current = null;
  let contentStart = 0;
  for (const match of content.matchAll(re)) {
    if (current) {
      current.content = content.slice(contentStart, match.index).trim();
      records.push(current);
    }
    const id = match[1];
    const [moduleId, segmentType, elementId] = id.split(':');
    current = { segmentId: id, moduleId, segmentType, elementId, content: '' };
    contentStart = match.index + match[0].length;
  }
  if (current) {
    current.content = content.slice(contentStart).trim();
    records.push(current);
  }
  return records;
}

/**
 * The key of one OCCURRENCE of a segment id within a file: the bare id for occurrence 0,
 * `${segmentId}#${k}` for k ≥ 1. `k` is 0-based on occurrences (the occurrences of the same
 * FULL id seen before this one), so the second occurrence is `#1` — the form
 * `tools/api-translate.js`'s `buildOccurrenceMap` and `remt-checks-mt.js`'s
 * `pairByOccurrence` already mint. Those two private copies predate this export and are left
 * alone; the cross-check test (`seg-markers-occurrence.test.js`) pins the identity.
 *
 * Refuses an id holding `#`: `a#1` at occurrence 0 and `a` at occurrence 1 would collide.
 *
 * @param {string} segmentId full `module:type:element` id
 * @param {number} occurrence non-negative integer
 * @returns {string}
 */
function occurrenceKey(segmentId, occurrence) {
  if (typeof segmentId !== 'string' || segmentId === '') {
    throw new TypeError(`occurrenceKey: segment id must be a non-empty string`);
  }
  if (segmentId.includes('#')) {
    throw new TypeError(
      `occurrenceKey: segment id ${segmentId} holds '#', which makes keys ambiguous`
    );
  }
  if (!Number.isInteger(occurrence) || occurrence < 0) {
    throw new TypeError(
      `occurrenceKey: occurrence must be a non-negative integer, got ${occurrence}`
    );
  }
  return occurrence === 0 ? segmentId : `${segmentId}#${occurrence}`;
}

/**
 * Copy records (each with a `segmentId`), adding `occurrence` (0-based ordinal among the
 * records with the same full id, in the given order) and `key` (`occurrenceKey`). The input
 * is not mutated.
 *
 * @template {{segmentId: string}} R
 * @param {R[]} records
 * @returns {Array<R & {occurrence: number, key: string}>}
 */
function withOccurrences(records) {
  const seen = new Map();
  return records.map((record) => {
    const occurrence = seen.get(record.segmentId) || 0;
    seen.set(record.segmentId, occurrence + 1);
    return { ...record, occurrence, key: occurrenceKey(record.segmentId, occurrence) };
  });
}

module.exports = {
  SEG_MARKER,
  parseSegmentsMap,
  parseSegmentRecords,
  occurrenceKey,
  withOccurrences,
};
