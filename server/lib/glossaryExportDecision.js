/**
 * Decision logic for the unattended glossary export (register C14).
 *
 * Pure by design — no DB, no filesystem — so the two rules that make the
 * export safe to run from cron can be tested without a sessions.db.
 *
 * WRITE-IF-CHANGED: exportBookGlossary stamps a fresh `generated` timestamp
 * on every call (terminologyService.js:1581). Once books/*\/glossary/ is
 * staged by scripts/git-backup.sh, that stamp alone would make the file
 * dirty every 2h — ~4,380 timestamp-only commits a year — and git-backup's
 * healthy "nothing to commit" path would never fire again.
 *
 * SHRINK GUARD: the committed glossary-unified.json files were produced by
 * tools/merge-glossary.js, not by this exporter, so cron-ing it SWAPS
 * PRODUCERS rather than refreshing. Migration 032 dropped the
 * terminology_terms table merge-glossary still writes to, and
 * exportBookGlossary is deliberately subject-strict (item 18), so the new
 * export can legitimately be far smaller than the file it replaces —
 * chemistry could go from 617 approved terms to near zero, silently
 * degrading MT quality for weeks. ⚠️ This file's blast radius is NOT
 * MT-only, so a silent shrink is not only an MT-quality problem: approved
 * terms are also substituted into published CNXML/HTML by
 * tools/lib/math-label-substitute.js's buildGlossaryMap, consumed by
 * cnxml-inject.js's substituteMathLabels — reader-visible (full consumer
 * list: register C14). The guard makes a catastrophic shrink a loud refusal
 * instead of a silent write.
 */

const { detectProducer } = require('./glossaryProducer');

/** Approved terms are what actually primes MT (api-translate loads approvedOnly). */
function countApproved(data) {
  if (!data || !Array.isArray(data.terms)) return 0;
  return data.terms.filter((t) => t && t.status === 'approved').length;
}

/** Total terms, whatever their status — the only signal for a file with zero approved terms. */
function countTerms(data) {
  return data && Array.isArray(data.terms) ? data.terms.length : 0;
}

/**
 * True when the two payloads carry identical term content, ignoring
 * `generated`. A payload written by a different producer simply compares
 * unequal, which is the correct outcome (the shrink guard then decides).
 *
 * ⚠️ ORDER-SENSITIVE (parked minor from the Task 3 per-task review, resolved
 * 2026-07-28): this is a `JSON.stringify` comparison, so two payloads with
 * the same terms in a different order compare unequal. `exportBookGlossary`
 * orders by `h.english COLLATE NOCASE ASC`, which is stable across headwords
 * — but it has NO secondary tiebreaker for multiple translations sharing one
 * headword, so their relative order is whatever SQLite's join happens to
 * produce, which is not guaranteed stable run-to-run.
 *
 * This is acceptable, not a latent bug, because of which way it can fail: an
 * unstable tie order can only produce a false "different" (two runs with
 * identical term VALUES compare unequal because a tied pair swapped
 * position) — a spurious rewrite, at worst a spurious commit. It can never
 * produce a false "same" (a silent non-write of content that actually
 * changed): `JSON.stringify` equality requires both the values AND their
 * order to match, so any real content change is still caught regardless of
 * tie ordering. A spurious commit is cosmetic; a silently-skipped write is
 * the failure mode this whole file exists to prevent. If this is ever
 * observed to flap (the same DB state producing a different serialization
 * across cron runs), that is the mechanism — add a secondary tiebreaker
 * (e.g. translation id) to `exportBookGlossary`'s `ORDER BY`, not here.
 */
function sameTerms(prev, next) {
  if (!prev || !Array.isArray(prev.terms)) return false;
  if (!next || !Array.isArray(next.terms)) return false;
  return JSON.stringify(prev.terms) === JSON.stringify(next.terms);
}

/**
 * Deliberately loose: it targets catastrophe, not drift. Legitimate
 * shrinkage happens — a head editor un-approves, or item-18 subject scoping
 * tightens — and refusing on those would train people to pass --force.
 */
const SHRINK_RATIO = 0.5;

/**
 * @returns {{refuse: boolean, prevApproved: number, nextApproved: number, prevTotal: number, nextTotal: number}}
 */
function shrinkVerdict(prev, next) {
  const prevApproved = countApproved(prev);
  const nextApproved = countApproved(next);
  const prevTotal = countTerms(prev);
  const nextTotal = countTerms(next);

  // BOTH metrics, because approved-count alone is INERT for a file with zero
  // approved terms — and books/liffraedi-2e/glossary/glossary-unified.json is
  // exactly that: 2262 terms, all needs_review. That is the largest committed
  // glossary in the repo and precisely the merge-glossary artifact this guard
  // exists to protect from the producer swap. Measuring only the MT-priming
  // subset let the guard be structurally disabled for it.
  //
  // (Parked minor from the Task 3 per-task review, resolved 2026-07-28: an
  // earlier version of this function had a standalone `if (prevApproved ===
  // 0) return { refuse: false, ... }` early return, flagged then as
  // "mathematically dead" — nextApproved is a count, so `< prevApproved *
  // 0.5` is already false once prevApproved is 0. That flag was RIGHT about
  // the code path and WRONG about the consequence: the defect wasn't the
  // branch, it was the METRIC — measuring approved-only left the whole
  // function structurally inert for a book like liffraedi-2e. The critical
  // fix rebuilt this as the two-clause OR below; the standalone early return
  // no longer exists. The `prevApproved > 0` and `prevTotal > 0` guards in
  // each clause remain individually redundant in the same sense as before
  // — a count can never be negative, so the inequality on their right is
  // already false when the count on their left is 0 — but are kept
  // deliberately, as the explicit statement of "nothing to protect," rather
  // than relying on a reader to re-derive that from non-negativity.)
  const refuse =
    (prevApproved > 0 && nextApproved < prevApproved * SHRINK_RATIO) ||
    (prevTotal > 0 && nextTotal < prevTotal * SHRINK_RATIO);

  return { refuse, prevApproved, nextApproved, prevTotal, nextTotal };
}

/**
 * §C119 — THE MIRROR OF SHRINK_RATIO, AND DELIBERATELY NOT ITS EXACT MIRROR.
 *
 * The shrink guard targets a catastrophic LOSS. Growth was structurally
 * invisible to it, which is how `lifraen-efnafraedi` went 827 -> 1,595 in one
 * unattended tick with every gate green — same producer stamp, baseline
 * present, nothing to shrink — and shipped 768 unreviewed headwords of which
 * 119 were confirmed harmful.
 *
 * THE THRESHOLD IS MEASURED, NOT CHOSEN. Exact symmetry with SHRINK_RATIO
 * (0.5) would be 2.0, and the incident was 1.928x — a symmetric guard would
 * have MISSED IT BY 3.6%. The observed values separate cleanly:
 *   legitimate   chemistry 2,006 -> 2,090 = 1.042x   (must pass)
 *   incident     organic     827 -> 1,595 = 1.928x   (must refuse)
 *   trim rebound organic     172 ->   840 = 4.88x    (must refuse)
 * 1.5 sits in the empty gap between 1.04 and 1.93. Do not raise it to 2
 * for tidiness; the tidy value is the one that fails.
 *
 * Like the shrink guard: catastrophe, not drift, and `--force` is the same
 * deliberate override — which the unattended cron cannot reach.
 */
const GROWTH_RATIO = 1.5;

/**
 * A RATIO ALONE IS MEANINGLESS ON SMALL COUNTS, and leaving it out broke 15
 * existing tests in glossaryExportRun.test.js — whose fixtures seed ONE term
 * and export five. 1 -> 5 is 5x and is not an explosion.
 *
 * This is the asymmetry with the shrink guard, and it is why the mirror needed
 * measuring rather than assuming: shrinking from 2 terms harms nothing, so
 * SHRINK_RATIO needs no floor, while ANY small seed trips a growth ratio.
 *
 * So an explosion must also be LARGE IN ABSOLUTE TERMS. The separation is wide:
 *   fixtures        1 ->     5   delta     4   must pass
 *   incident      827 -> 1,595   delta   768   must refuse
 *   trim rebound  172 ->   840   delta   668   must refuse
 * 100 sits in the empty gap between 4 and 668.
 */
const GROWTH_MIN_DELTA = 100;

/**
 * @returns {{refuse: boolean, prevApproved: number, nextApproved: number, prevTotal: number, nextTotal: number}}
 */
function growthVerdict(prev, next) {
  const prevApproved = countApproved(prev);
  const nextApproved = countApproved(next);
  const prevTotal = countTerms(prev);
  const nextTotal = countTerms(next);

  // BOTH metrics, for the same reason shrinkVerdict uses both: a file whose
  // terms are all needs_review has zero approved, so an approved-only test is
  // structurally inert for it. The `> 0` guards are what make growth FROM AN
  // EMPTY FILE permitted — there is no ratio to measure against nothing, and a
  // first population is the absent-baseline gate's business (§C21), not this
  // one's.
  // BOTH the ratio AND a material absolute delta, per metric: a proportional
  // jump that moves only a handful of terms is not the catastrophe this guards.
  const exploded = (prev, next) =>
    prev > 0 && next > prev * GROWTH_RATIO && next - prev >= GROWTH_MIN_DELTA;
  const refuse = exploded(prevApproved, nextApproved) || exploded(prevTotal, nextTotal);

  return { refuse, prevApproved, nextApproved, prevTotal, nextTotal };
}

/**
 * Categorical companion to shrinkVerdict (register C14 ② step 4).
 *
 * Evaluated BEFORE the shrink gate at the call site. Reporting "1117 → 709, a
 * 36.5% shrink" about a file another program wrote invites the operator to
 * reason about two numbers that count different things.
 *
 * A corrupt existing file never reaches here — readExisting reports it as its
 * own kind and the call site maps it straight to a refusal. "Is this
 * parseable" and "who wrote it" stay separate questions, answered in separate
 * places.
 *
 * @returns {{refuse: boolean, prevProducer: string, nextProducer: string}}
 */
function producerVerdict(prev, next) {
  const nextProducer = detectProducer(next);
  if (prev === null || prev === undefined) {
    return { refuse: false, prevProducer: null, nextProducer };
  }
  const prevProducer = detectProducer(prev);
  return { refuse: prevProducer !== nextProducer, prevProducer, nextProducer };
}

module.exports = {
  countApproved,
  countTerms,
  sameTerms,
  shrinkVerdict,
  growthVerdict,
  producerVerdict,
  SHRINK_RATIO,
  GROWTH_RATIO,
  GROWTH_MIN_DELTA,
};
