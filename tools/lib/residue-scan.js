/**
 * Pair two SEG-marker segment files by ID and classify each IS segment as
 * verbatim-English residue or a "mostly English" ratio warning. Pure, no I/O.
 *
 * @param {string} enContent  raw text of an m*-segments.en.md file
 * @param {string} isContent  raw text of the matching m*-segments.is.md file
 * @param {object} [opts]     forwarded to detectResidue (minTokens, warnThreshold, minWordLen)
 * @returns {{exact: string[], warnings: {segmentId: string, ratio: number}[]}}
 */
import { parseSegmentsMap } from './seg-markers.cjs';
import { detectResidue } from './residue-check.js';

export function scanSegmentsForResidue(enContent, isContent, opts = {}) {
  const en = parseSegmentsMap(enContent);
  const is = parseSegmentsMap(isContent);
  const exact = [];
  const warnings = [];
  for (const [segId, isText] of is) {
    const enText = en.get(segId);
    if (enText == null) continue; // no EN counterpart -> cannot judge
    const r = detectResidue(enText, isText, opts);
    if (r.exact) exact.push(segId);
    else if (r.warn) warnings.push({ segmentId: segId, ratio: Number(r.ratio.toFixed(3)) });
  }
  return { exact, warnings };
}
