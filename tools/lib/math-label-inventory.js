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

/**
 * Tally distinct token values into label / other buckets.
 * @param {Array<{text:string,context:string}>} tokens
 * @param {Set<string>} [stoplist]
 * @returns {{ labels: Map<string,{count:number,context:string}>,
 *             others: Map<string,{count:number,context:string}> }}
 */
export function aggregate(tokens, stoplist = DEFAULT_STOPLIST) {
  const labels = new Map();
  const others = new Map();
  for (const { text, context } of tokens) {
    const target = bucketToken(text, stoplist) === 'label' ? labels : others;
    const cur = target.get(text);
    if (cur) cur.count += 1;
    else target.set(text, { count: 1, context });
  }
  return { labels, others };
}

/**
 * Merge discovered Bucket-1 keys into an existing map object without clobbering
 * filled values. Never deletes: keys present in the map but absent from the
 * current discovery are preserved and reported as orphans for the lead to judge.
 * @param {Record<string,string>} existing  parsed math-label-map.json ({} if none)
 * @param {Map<string,{count,context}>} labels
 * @returns {{ merged: Record<string,string>, addedKeys: string[], orphanKeys: string[] }}
 */
export function mergeSkeleton(existing, labels) {
  const merged = {};
  const addedKeys = [];
  for (const key of labels.keys()) {
    if (Object.prototype.hasOwnProperty.call(existing, key)) merged[key] = existing[key];
    else {
      merged[key] = '';
      addedKeys.push(key);
    }
  }
  const orphanKeys = [];
  for (const key of Object.keys(existing)) {
    if (!labels.has(key)) {
      merged[key] = existing[key];
      orphanKeys.push(key);
    }
  }
  return { merged, addedKeys, orphanKeys };
}
