/**
 * servedText — the one hash of served text, and the books for which no served version is minted
 * (G1.1; spec §5.3, §5.4, §11).
 *
 * Why one function: every served version, every stale-base check and every later reader compares
 * the same hash of the same string. G1.23 §6.3 reads `seg.baseSha256` from the module response and
 * never hashes its own copy of `is`, so this file is the only place the hash of served text is
 * computed (spec §5.3: one mechanism, not two).
 *
 * Why it is a port: the hash must be directly comparable with the layer-2 change records'
 * `beforeSha256` (`tools/lib/mt-layers.js`'s `buildChangeRecord`). That module is ESM, this server
 * is CommonJS, and its `sha256` is not exported, so its one line is ported here. A test pins the
 * two together, and against the committed `beforeSha256` values.
 *
 * Why organic is listed: Organic Chemistry (`lifraen-efnafraedi`) is not translated (CLAUDE.md
 * § Organic). No other server constant says so, so this list is where that rule becomes code: no
 * served version is minted for a book on it, and every write to it is refused (spec §5.4, §11).
 */
const crypto = require('crypto');

/** Books served read-only: no served version is minted for them and every write is refused (spec §5.4, §11). */
const NOT_MINTED_BOOKS = Object.freeze(['lifraen-efnafraedi']);

/** sha256 of the UTF-8 bytes of s, 64 lowercase hex characters (spec §5.3). The only place it is computed. */
function sha256Text(s) {
  if (typeof s !== 'string') throw new TypeError(`sha256Text: expected a string, got ${typeof s}`);
  return crypto.createHash('sha256').update(s, 'utf8').digest('hex');
}

function isNotMintedBook(book) {
  return NOT_MINTED_BOOKS.includes(book);
}

module.exports = { sha256Text, NOT_MINTED_BOOKS, isNotMintedBook };
