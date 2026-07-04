/**
 * Units and math functions confirmed to STAY unchanged in Icelandic.
 * NOTE: `mol` is deliberately absent — it localizes to `mól`, so it must
 * surface as a Bucket-1 fill slot. Only all-lowercase, ≥3-letter tokens are
 * meaningful here (shorter or uppercase-bearing tokens are already routed to
 * 'other' by bucketToken before the stoplist is consulted).
 */
export const DEFAULT_STOPLIST = new Set(['atm', 'torr', 'ppb', 'log', 'exp', 'sin', 'cos', 'tan']);

/**
 * Bucket a single math text-node value.
 * Bucket 1 ('label') iff all-lowercase ASCII, length ≥ 3, and not stoplisted.
 * Everything else ('other') — formulae (uppercase element symbols), operators,
 * single-letter/2-letter variables, and stoplisted units/functions.
 * @param {string} text
 * @param {Set<string>} [stoplist]
 * @returns {'label' | 'other'}
 */
export function bucketToken(text, stoplist = DEFAULT_STOPLIST) {
  if (!/^[a-z]{3,}$/.test(text)) return 'other';
  if (stoplist.has(text)) return 'other';
  return 'label';
}
