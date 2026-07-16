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

module.exports = { SEG_MARKER, parseSegmentsMap, parseSegmentRecords };
