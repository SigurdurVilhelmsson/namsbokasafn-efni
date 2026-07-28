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
 * `generated`. Serialization order is stable because exportBookGlossary
 * orders by `h.english COLLATE NOCASE ASC` and builds each term from one
 * object literal; a payload written by a different producer simply compares
 * unequal, which is the correct outcome (the shrink guard then decides).
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
  const refuse =
    (prevApproved > 0 && nextApproved < prevApproved * SHRINK_RATIO) ||
    (prevTotal > 0 && nextTotal < prevTotal * SHRINK_RATIO);

  return { refuse, prevApproved, nextApproved, prevTotal, nextTotal };
}

module.exports = { countApproved, countTerms, sameTerms, shrinkVerdict, SHRINK_RATIO };
