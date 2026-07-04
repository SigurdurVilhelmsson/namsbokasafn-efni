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

/**
 * Decode the small set of XML entities that can appear in MathML text nodes.
 * `&amp;` is decoded last so it cannot re-introduce another entity.
 * @param {string} s
 * @returns {string}
 */
export function decodeEntities(s) {
  return s
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

const NODE_RE = /<m:(?:mtext|mi)\b[^>]*>([\s\S]*?)<\/m:(?:mtext|mi)>/g;

/**
 * Extract every <m:mtext>/<m:mi> text value from one CNXML string, each with a
 * best-effort readable context = the space-joined tokens of its enclosing
 * <m:math> block. Nodes outside any <m:math> (defensive; rare) get context ''.
 * @param {string} cnxml
 * @returns {Array<{ text: string, context: string }>}
 */
export function collectMathTokens(cnxml) {
  const results = [];
  const push = (raw, context) => {
    const t = decodeEntities(raw).trim();
    if (t) results.push({ text: t, context });
  };
  // 1. Tokens inside <m:math> blocks, carrying enclosing-expression context.
  //    Blank each block from a working copy so step 2 only sees stray nodes.
  const withoutBlocks = cnxml.replace(/<m:math\b[^>]*>([\s\S]*?)<\/m:math>/g, (_full, inner) => {
    const raws = [...inner.matchAll(new RegExp(NODE_RE.source, 'g'))].map((m) => m[1]);
    const context = raws
      .map((r) => decodeEntities(r).trim())
      .filter(Boolean)
      .join(' ');
    for (const r of raws) push(r, context);
    return '';
  });
  // 2. Defensive: any mtext/mi outside a math block — no silent miss.
  for (const m of withoutBlocks.matchAll(new RegExp(NODE_RE.source, 'g'))) push(m[1], '');
  return results;
}
