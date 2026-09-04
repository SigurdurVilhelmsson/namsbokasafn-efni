'use strict';
/**
 * Does migration 047's enforcement actually CHANGE anything? (§C119)
 *
 * 047 DELETEs and re-INSERTs each named book's book_domain_priority rows from
 * domains.js on every boot. That enforcement is correct and is not changing.
 * What was missing is that it ran blind: it could not tell "already matches"
 * from "I have just undone an operator's change", so a trim made by hand
 * vanished on the next restart with no error, no log line and no gate.
 *
 * ORDER IS SEMANTIC HERE. `position` decides which domain wins a contested
 * headword, so a reorder is a real change and must not compare equal.
 *
 * SEED vs OVERWRITE, and the distinction is load-bearing. Empty -> populated is
 * a book being scoped for the first time (a fresh clone, or a book the admin
 * route has just registered); nobody's work was undone. Populated -> different
 * is an operator's live rows being replaced. Only the second is an alarm, and
 * conflating them would fire on every first boot — noise being exactly how an
 * alarm gets ignored, which is how the 2026-08-31 revert stayed invisible.
 */

/**
 * @param {string[]} before domains currently in the table, in position order
 * @param {string[]} after  domains domains.js says there should be, in order
 * @returns {{changed: boolean, kind: 'none'|'seed'|'overwrite',
 *            before: string[], after: string[]}}
 */
function reconcileDiff(before, after) {
  const b = Array.isArray(before) ? before : [];
  const a = Array.isArray(after) ? after : [];
  const changed = b.length !== a.length || b.some((d, i) => d !== a[i]);
  const kind = !changed ? 'none' : b.length === 0 ? 'seed' : 'overwrite';
  return { changed, kind, before: b, after: a };
}

module.exports = { reconcileDiff };
