// server/lib/domains.js
/**
 * The domain vocabulary, and each book's ordered domain fallback.
 *
 * ⚠️ ONE OWNER. This existed in three independent copies until 2026-08-08
 * (register §C36 finding 5): COLLECTION_DOMAIN's values in lib/conceptFromEntry.js,
 * DOMAINS in scripts/verify-concept-import.js, and PRIORITIES's domains in
 * migrations/046-seed-domain-priority.js. All three were measured clean — and
 * nothing kept them clean. A typo'd domain is not a crash: it produces a
 * fallback level that matches nothing, so a book silently scopes to less than
 * it should and every check stays green.
 *
 * `domain` is OURS (spec §5), not Árnastofnun's. Their `collection` is retained
 * on the concept row as provenance and is never a precedence key.
 *
 * ⚠️ Migration 046 is SHIPPED and deliberately NOT edited — migrations are
 * append-only. Migration 047 is the live owner of the priority map and reads
 * BOOK_DOMAIN_PRIORITY from here; 046 still runs first on every boot and 047
 * runs after it.
 *
 * ⚠️ "ONE OWNER" IS TRUE OF DOMAIN VALUES, AND ONLY PARTLY TRUE OF BOOK KEYS.
 * 046 keeps its own frozen PRIORITIES and does not export it, and 047 iterates
 * only the books named HERE. So ADDING a book, or reordering one, is owned by
 * this file — but DELETING one is not: 046 re-seeds it on the next boot and 047
 * never clears it, leaving rows this file no longer describes. Measured
 * 2026-08-08 over a fresh clone: removing `edlisfraedi-2e` or
 * `lifraen-efnafraedi` is entirely silent; removing `orverufraedi` happens to
 * turn migrationsRealTree.test.js red, but only incidentally — that pin exists
 * for §C35 and evaporates when §C35 is fixed. **Do not delete a book from this
 * map expecting its rows to go.** Logged for Part B; the right shape is a guard
 * against removal-while-registered, not a blanket clear (which would leave a
 * registered book scoped to nothing — the exact bug spec §10 exists to prevent).
 */

/** The seven domains. Spec §5. */
const DOMAINS = Object.freeze([
  'biology',
  'chemistry',
  'physics',
  'astronomy',
  'anatomy-physiology',
  'mathematics',
  'earth-science',
]);

const DOMAIN_SET = new Set(DOMAINS);

/**
 * Each book's domain fallback order, position 1 first.
 *
 * The FIRST FALLBACK ENTRY IS LOAD-BEARING, and it is measured rather than
 * assumed. Against production's 28,903 translations (2026-08-08), efnafraedi-2e's
 * strict `chemistry` scope keeps **709** and discards **19,057** that carry
 * `physics` or `biology` — `pH`, `bond`, `carbon dioxide` and `nitrogen` among
 * them, each verified at row level. Those are exactly what the fallback returns.
 *
 * ⚠️ `mathematics` is deliberately absent from the chemistry books: a further
 * 9,137 translations carry it, and they are out of scope on purpose, not by
 * oversight.
 */
const BOOK_DOMAIN_PRIORITY = Object.freeze({
  'efnafraedi-2e': Object.freeze(['chemistry', 'physics', 'biology']),
  // §C119 [USER] 2026-09-04 — ORGANIC IS CHEMISTRY-ONLY. The biology and
  // physics fallback tiers put 872 biology and 475 physics headwords into an
  // organic chemistry textbook's glossary, of which a full-coverage
  // adversarial audit confirmed 119 harmful: `ants -> maurar` fires 180 times
  // in the corpus and 179 of those are reactants/plants/constants/locants;
  // `activate -> örva` also matches deactivate, INVERTING the chemistry in the
  // one chapter organised around activating vs deactivating groups.
  //
  // ⚠️ THIS FILE IS THE ONLY PLACE THE CHANGE SURVIVES. book_domain_priority is
  // DELETEd and re-INSERTed from here by migration 047 on every boot, so the
  // same trim made in SQL lasts until the next restart — measured 2026-08-31,
  // it lasted 102 seconds, with no error, no log line and no gate.
  //
  // ⚠️ AND NOTHING DETECTS THAT REVERT — an alarm was attempted and DROPPED as
  // unworkable. Migration 046 runs immediately before 047 and does INSERT OR
  // REPLACE from its own FROZEN copy of this map, so by the time 047 could look,
  // the operator's deleted rows are already restored: a hand trim reads as "no
  // change". Only an ADDED domain survives 046 to be seen, because INSERT OR
  // REPLACE can add but never remove. Detecting a revert would mean snapshotting
  // the table BEFORE the migration loop, which is a different change.
  //
  // ⚠️ Effect measured before committing: 1,595 -> 248 terms (0.155x), so the
  // FIRST export after this refuses on the shrink guard and needs a deliberate
  // one-time --force. That refusal is correct, not a bug.
  'lifraen-efnafraedi': Object.freeze(['chemistry']),
  'liffraedi-2e': Object.freeze(['biology', 'anatomy-physiology', 'chemistry']),
  orverufraedi: Object.freeze(['biology', 'anatomy-physiology', 'chemistry']),
  'edlisfraedi-2e': Object.freeze([
    'physics',
    'astronomy',
    'mathematics',
    'earth-science',
    'chemistry',
  ]),
  stjornufraedi: Object.freeze(['astronomy', 'physics', 'earth-science', 'mathematics']),
});

module.exports = { DOMAINS, DOMAIN_SET, BOOK_DOMAIN_PRIORITY };
