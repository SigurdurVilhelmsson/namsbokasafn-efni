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
  'lifraen-efnafraedi': Object.freeze(['chemistry', 'biology', 'physics']),
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
