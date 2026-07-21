/**
 * licence-containment.cjs — the rule for combining per-book licences into ONE
 * aggregate export (item 17 part c).
 *
 * NO caller today: every current export (corpus, TM, glossary, index, book-data)
 * row-stamps or emits per-book, and the one cross-book mixer (the item-21
 * Árnastofnun added-terms seed) is licence-neutral because terms aren't
 * copyrightable. This is the encoded rule + its test, which a FUTURE cross-book
 * aggregate MUST call so a restrictive (NC/SA) book is never silently folded
 * into a permissive (CC BY) aggregate. Codes are efni's spaced form.
 */
'use strict';

// Higher = more restrictive. Extend as new licences enter the corpus.
const RESTRICTIVENESS = { 'CC BY 4.0': 0, 'CC BY-NC-SA 4.0': 1 };

function rank(code) {
  if (!(code in RESTRICTIVENESS)) {
    throw new Error(
      `Unknown licence code "${code}" — add it to tools/lib/licence-containment.cjs RESTRICTIVENESS`
    );
  }
  return RESTRICTIVENESS[code];
}

/**
 * The most restrictive licence in the set (an aggregate's effective licence).
 * @param {string[]} licences
 * @returns {string}
 */
function mostRestrictive(licences) {
  if (!Array.isArray(licences) || licences.length === 0) {
    throw new Error('mostRestrictive requires a non-empty array of licence codes');
  }
  // Validate every code up front: Array.prototype.reduce without a seed never
  // invokes the callback for a single-element array, so a lone unknown code
  // would otherwise pass through unrank()ed and unchecked.
  licences.forEach((code) => rank(code));
  return licences.reduce((a, b) => (rank(b) > rank(a) ? b : a));
}

/**
 * Assert a set of member books may be combined into ONE aggregate labelled
 * `target`. Fail-loud: throws if any member is more restrictive than `target`.
 * @param {string[]} licences member book licence codes
 * @param {string} target the aggregate's intended licence code
 */
function assertLicenceContainment(licences, target) {
  const worst = mostRestrictive(licences);
  if (rank(worst) > rank(target)) {
    throw new Error(
      `Licence containment violation: an aggregate labelled "${target}" would include a ` +
        `more-restrictive "${worst}" book. The aggregate must be at least "${worst}".`
    );
  }
}

module.exports = { assertLicenceContainment, mostRestrictive, RESTRICTIVENESS };
