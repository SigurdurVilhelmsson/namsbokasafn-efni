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

/**
 * Validate one filled Icelandic label value against the WS4 rules.
 * @param {string} value
 * @returns {string|null}  human-readable reason if invalid, else null
 */
export function validateValue(value) {
  if (typeof value !== 'string' || value.length === 0) {
    return 'empty (use a self-map like "surr"→"surr" to keep the English label)';
  }
  if (/\s/.test(value)) return 'contains whitespace (must be a single token)';
  if (/[<>&"']/.test(value)) return 'contains a forbidden XML character (one of < > & " \')';
  const codePoints = [...value].length;
  if (codePoints > 6) return `${codePoints} chars > 6-char cap`;
  return null;
}

/**
 * Validate every value in a filled map.
 * @param {Record<string,string>} map
 * @returns {Array<{ key: string, value: string, reason: string }>}
 */
export function validateMap(map) {
  const violations = [];
  for (const [key, value] of Object.entries(map)) {
    const reason = validateValue(value);
    if (reason) violations.push({ key, value, reason });
  }
  return violations;
}

/** Sort a Map's entries by count desc, then key asc. */
function byCountDesc(map) {
  return [...map.entries()].sort((a, b) => b[1].count - a[1].count || a[0].localeCompare(b[0]));
}

/**
 * Render the two-bucket Markdown inventory report.
 * @param {{ book: string, labels: Map, others: Map, currentMap: Record<string,string> }} p
 * @returns {string}
 */
export function renderReport({ book, labels, others, currentMap }) {
  const lines = [];
  lines.push(`# Math-label inventory — ${book}`);
  lines.push('');
  lines.push('Generated by `tools/inventory-math-labels.js`. Fill the Icelandic values in');
  lines.push('`math-label-map.json`, then run `--validate`.');
  lines.push('');
  lines.push('**Value rules:** non-empty · ≤ 6 characters · single token (no spaces) ·');
  lines.push('no `< > & " \'` · Icelandic letters ok. To keep a label English, self-map it');
  lines.push('to itself (e.g. `surr` → `surr`) — do not leave it blank (blank deletes it).');
  lines.push('');
  lines.push('## Likely labels — fill these');
  lines.push('');
  lines.push('| token | count | Icelandic (in map) | example context |');
  lines.push('|-------|------:|--------------------|-----------------|');
  for (const [text, { count, context }] of byCountDesc(labels)) {
    const val = currentMap[text] ? `\`${currentMap[text]}\`` : '_(empty)_';
    lines.push(`| \`${text}\` | ${count} | ${val} | ${context.replace(/\|/g, '\\|')} |`);
  }
  lines.push('');
  lines.push('## Also review — probably keep as-is (formulae, units, operators, variables)');
  lines.push('');
  lines.push('If a real label is hiding here, add it to `math-label-map.json` by hand — a');
  lines.push('re-run preserves hand-added keys.');
  lines.push('');
  const otherStr = byCountDesc(others)
    .map(([text, { count }]) => `\`${text}\` ×${count}`)
    .join(' · ');
  lines.push(otherStr || '_(none)_');
  lines.push('');
  return lines.join('\n');
}
