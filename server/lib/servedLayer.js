/**
 * servedLayer — the book-to-layer setting (spec docs/superpowers/specs/2026-11-24-fable-layer-serving-design.md §6.3).
 *
 * This is the ONE setting that says which text layer a book is served from. The loader, the assign
 * gate and the suggestion view all read it through `servedLayerFor`, and no other file restates the
 * mapping. To serve another book from the Fable layer, change this file and its test, nothing else.
 *
 * A book absent from the map is served from `'mt-output'`, the pure MT layer. The lookup never
 * throws, whatever it is given.
 *
 * It requires nothing on purpose, so any caller can load it without opening a database.
 */

/** The layer name in code and in the database. */
const FABLE_LAYER = 'fable';

/** The layer every book not named below is served from. */
const MT_OUTPUT_LAYER = 'mt-output';

/** Book slug → served layer. Frozen; read through `servedLayerFor`. */
const SERVED_LAYER_BY_BOOK = Object.freeze({ 'efnafraedi-2e': FABLE_LAYER });

/**
 * @param {unknown} book - a book slug; any other value is treated as an unknown book
 * @returns {'fable' | 'mt-output'}
 */
function servedLayerFor(book) {
  if (typeof book === 'string' && Object.hasOwn(SERVED_LAYER_BY_BOOK, book)) {
    return SERVED_LAYER_BY_BOOK[book];
  }
  return MT_OUTPUT_LAYER;
}

module.exports = { SERVED_LAYER_BY_BOOK, servedLayerFor, FABLE_LAYER, MT_OUTPUT_LAYER };
