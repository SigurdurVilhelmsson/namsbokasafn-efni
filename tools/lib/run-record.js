/**
 * run-record.js — the per-module MT run record (§C82 prerequisite 2).
 *
 * `writeProvenance` (tools/lib/provenance.js) records WHO produced a module's
 * MT output. This module records WHAT HAPPENED while producing it.
 *
 * Why it has to exist: the in-pipeline repairs erase their own evidence before
 * the file is written. `repairSegTags`, `normalizeSegMarkers` and
 * `unwrapInventedMarkers` all fix their finding and proceed, so a post-hoc scan
 * of 02-mt-output reads identically for a clean run and a heavily-repaired one.
 * Battery checks A2(a), A4 and A8, and the §C82 ③ glossary-arm decision, read
 * these counters; without them those checks are ceremony.
 *
 * Everything here is a bounded scalar or a small tally — never a raw text
 * array — so the sidecar cannot grow with module size.
 *
 * Design: docs/superpowers/specs/2026-08-13-remt-check-battery.md §5 item 2.
 */
import crypto from 'node:crypto';

export const RUN_RECORD_VERSION = 1;

/**
 * Stable content hash of the glossary actually handed to the MT step.
 *
 * Sorted by the source\ttarget pair so payload key order cannot change the
 * hash. The §C82 ③ arm decision is only valid for the glossary it was measured
 * on — a later glossary change must invalidate it, and this is how the ledger
 * notices.
 *
 * @param {{terms?: Array<{sourceWord: string, targetWord: string}>}|null} glossary
 * @returns {string|null} sha256 hex, or null when no glossary was sent
 */
export function glossaryContentHash(glossary) {
  const terms = glossary?.terms;
  if (!Array.isArray(terms) || terms.length === 0) return null;
  const canonical = terms
    .map((t) => `${t.sourceWord}\t${t.targetWord}`)
    .sort()
    .join('\n');
  return crypto.createHash('sha256').update(canonical, 'utf8').digest('hex');
}

/**
 * Tally `{type}`-bearing findings into `{type: count}`.
 * @param {Array<{type?: string}>|undefined} items
 * @returns {Record<string, number>}
 */
function tallyByType(items) {
  const out = {};
  for (const it of items || []) {
    const t = it?.type ?? 'unknown';
    out[t] = (out[t] || 0) + 1;
  }
  return out;
}

/**
 * Build the run record from translateModule's return value plus its inputs.
 *
 * @param {object} p
 * @param {number} p.chars input characters sent to the API
 * @param {number} p.usage API-reported usage units
 * @param {number} p.estimatedIsk estimateIsk(chars) — an estimate, never the invoice
 * @param {number} p.markersNormalized SEG markers un-glued by normalizeSegMarkers
 * @param {Array<object>} [p.mismatches] per-segment id-reattachment mismatches
 * @param {Record<string, number>} [p.bracketDelta] module-level bracket delta
 * @param {Array<{type: string}>} [p.unwrapped] invented glossary markers removed
 * @param {'glossary'|'no-glossary'} p.glossaryArm which arm the CALLER asked for —
 *   intent, not outcome. A glossary can be asked for and never reach the wire:
 *   the per-chunk text filter drops it when none of its terms appear in that
 *   chunk, and the truncation retry always drops it. Read `chunksWithGlossary`/
 *   `chunksTotal` alongside `arm`, never `arm` alone, to know whether the
 *   glossary was actually used.
 * @param {string|null} p.glossaryHash glossaryContentHash of the glossary sent
 * @param {number|null} p.glossaryTermCount terms in the unfiltered glossary
 * @param {number} p.chunksWithGlossary chunks whose actual (used) API call carried a glossary
 * @param {number} p.chunksTotal total chunks the module was split into (>=1)
 * @returns {object} the run record, JSON-serializable
 */
export function buildRunRecord({
  chars,
  usage,
  estimatedIsk,
  markersNormalized,
  mismatches,
  bracketDelta,
  unwrapped,
  glossaryArm,
  glossaryHash,
  glossaryTermCount,
  chunksWithGlossary,
  chunksTotal,
}) {
  return {
    runRecordVersion: RUN_RECORD_VERSION,
    chars,
    usage,
    estimatedIsk,
    markersNormalized,
    mismatchCount: (mismatches || []).length,
    bracketDelta: bracketDelta || {},
    unwrappedCount: (unwrapped || []).length,
    unwrappedByType: tallyByType(unwrapped),
    glossary: {
      arm: glossaryArm,
      contentHash: glossaryHash,
      termCount: glossaryTermCount,
      chunksWithGlossary,
      chunksTotal,
    },
  };
}
