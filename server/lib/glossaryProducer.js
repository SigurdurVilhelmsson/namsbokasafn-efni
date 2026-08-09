/**
 * Which program wrote a glossary-unified.json payload (register C14 ② step 4).
 *
 * Pure by design — no filesystem, no DB — so the producer question can be
 * asked of any payload, including one a test built.
 *
 * WHY THIS EXISTS. The shrink guard in glossaryExportDecision.js names the
 * real threat correctly ("this exporter SWAPS producers rather than
 * refreshing") and then measures term COUNTS, which is the one dimension on
 * which the two producers are indistinguishable. On 2026-08-03 that let a
 * wholesale producer swap through unattended: chemistry -36.5% passed under
 * the 0.5 halving threshold, and biology GREW, which a shrink ratio is
 * structurally blind to.
 *
 * THE FINGERPRINT IS MEASURED, NOT ASSUMED. Across all 4,496 terms in the
 * three committed glossaries (2026-08-04): 4,496 carry `category` + `chapter`
 * and 0 carry `subjects`. exportBookGlossary emits the exact complement —
 * `subjects` always (possibly []), never `category`/`chapter`. Two disjoint
 * shapes, no counter-example. glossaryProducer.test.js re-measures this
 * against the real files rather than trusting this comment. (This figure was
 * corrected from 3,496 on initial draft; re-derive rather than trust it.)
 *
 * ⚠️ A HYBRID IS `unknown`, DELIBERATELY. A payload carrying both fingerprints
 * is a shape neither producer emits today, so it means something has changed
 * that this detector does not model. `unknown` differs from the stamped
 * `next`, so the call site refuses and waits for --adopt: when we cannot tell
 * what we would destroy, a human decides. The cost of being wrong is one book
 * skipped and reported; the cost of guessing is a silent overwrite.
 */

const PRODUCER_EXPORT = 'export-terminology';
const PRODUCER_MERGE = 'merge-glossary';
const PRODUCER_RESOLVED = 'export-terminology-resolved';
const PRODUCER_UNKNOWN = 'unknown';

/** Presence, not truthiness: exportBookGlossary emits `subjects: []` for an untagged term. */
const hasKey = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);

/**
 * @param {unknown} payload - a parsed glossary-unified.json, or an exportBookGlossary return
 * @returns {'export-terminology'|'export-terminology-resolved'|'merge-glossary'|'unknown'}
 */
function detectProducer(payload) {
  if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) {
    return PRODUCER_UNKNOWN;
  }
  if (payload.producer === PRODUCER_EXPORT) return PRODUCER_EXPORT;

  // B3: the resolved view is a DIFFERENT producer, deliberately. Its payload is
  // a subject-filtered dump's replacement, not its refresh — and detectProducer
  // short-circuits on the stamp BEFORE reading `terms`, so without its own
  // constant the reshape would pass the producer gate unnoticed. That is the
  // failure class C14 and C21 exist to prevent, arriving through the door they
  // left open.
  //
  // A matching top-level stamp short-circuits BEFORE any term is read — this
  // branch inherits that property from the pre-existing PRODUCER_EXPORT branch
  // above (not something introduced here). So a payload stamped
  // 'export-terminology-resolved' whose terms are legacy- or hybrid-shaped is
  // trusted as PRODUCER_RESOLVED rather than refused as `unknown`: an accepted,
  // pinned trade-off (see glossaryProducer.test.js — "a resolved stamp is
  // trusted over a contradictory term shape"), not a bug to fix here.
  //
  // Shape inference below IS exhaustive, but only on the UNSTAMPED path: a
  // resolved term carries `domain`, never `subjects`/`category`/`chapter`, so
  // an unstamped resolved payload falls through to `unknown` and refuses.
  // Fail-closed, per the hybrid rule — for the unstamped case only.
  if (payload.producer === PRODUCER_RESOLVED) return PRODUCER_RESOLVED;

  const terms = payload.terms;
  if (!Array.isArray(terms) || terms.length === 0) return PRODUCER_UNKNOWN;

  const isTerm = (t) => t !== null && typeof t === 'object';
  const subjects = terms.filter((t) => isTerm(t) && hasKey(t, 'subjects')).length;
  const legacy = terms.filter(
    (t) => isTerm(t) && (hasKey(t, 'category') || hasKey(t, 'chapter'))
  ).length;

  // Exclusive on purpose — see the hybrid note in the header.
  if (subjects > 0 && legacy === 0) return PRODUCER_EXPORT;
  if (legacy > 0 && subjects === 0) return PRODUCER_MERGE;
  return PRODUCER_UNKNOWN;
}

module.exports = {
  detectProducer,
  PRODUCER_EXPORT,
  PRODUCER_MERGE,
  PRODUCER_RESOLVED,
  PRODUCER_UNKNOWN,
};
