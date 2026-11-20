'use strict';
// The terms hash of a glossary export (spec 2026-11-20-book-glossary-stage2-design §5.6).
//
// A .cjs because both trees consume it: server/scripts/export-terminology.js stamps a held
// export's status entry with it, and the developer's release step (MIT tooling, which may not
// require anything under server/) computes the same hash from the held file.
//
// It hashes `JSON.stringify(payload.terms)`, exactly the string `sameTerms`
// (server/lib/glossaryExportDecision.js) compares, so "same hash" means "same terms" in the
// sense the export already uses, and nothing else in the payload (`generated`, `stats`, the
// stamp) moves it.
const crypto = require('crypto');

/**
 * @param {{terms: unknown[]}} payload
 * @returns {string} lowercase sha256 hex of JSON.stringify(payload.terms)
 * @throws {TypeError} when payload.terms is not an array
 */
function termsSha256(payload) {
  if (payload === null || typeof payload !== 'object' || !Array.isArray(payload.terms)) {
    throw new TypeError('termsSha256: expected a payload with an array `terms` property');
  }
  return crypto.createHash('sha256').update(JSON.stringify(payload.terms)).digest('hex');
}

module.exports = { termsSha256 };
