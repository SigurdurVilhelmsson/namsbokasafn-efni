import { DOMParser } from '@xmldom/xmldom';
import { CNXML_NS, MATHML_NS } from './cnxml-dom.js';

// Namespaces used when wrapping a bare CNXML fragment for parsing (mirrors
// tools/lib/cnxml-dom.js). Real CNXML files declare these on <document>
// already; test fixtures and loose fragments may not, so wrapping keeps
// collectMathTokens robust to both without changing its public behavior.
// CNXML_NS/MATHML_NS are imported (not re-declared) so the two files' wrap
// strings can never drift apart.

const TOKEN_NAMES = new Set(['m:mtext', 'm:mi']);
const SCRIPT_PARENTS = new Set(['m:msub', 'm:msup', 'm:msubsup']);

/** Element children of a node, in document order. */
function elementChildren(node) {
  const out = [];
  for (let c = node.firstChild; c; c = c.nextSibling) if (c.nodeType === 1) out.push(c);
  return out;
}

/** True if `node` sits in a subscript/superscript slot: it descends from the ≥2nd
 *  element-child of an m:msub/m:msup/m:msubsup ancestor (index 0 is the base). */
function isScriptPosition(node) {
  let child = node;
  let parent = node.parentNode;
  while (parent && parent.nodeType === 1) {
    if (SCRIPT_PARENTS.has(parent.tagName) && elementChildren(parent).indexOf(child) >= 1) {
      return true;
    }
    child = parent;
    parent = parent.parentNode;
  }
  return false;
}

/** Nearest enclosing <m:math> ancestor, or null. */
function enclosingMath(node) {
  for (let p = node.parentNode; p && p.nodeType === 1; p = p.parentNode) {
    if (p.tagName === 'm:math') return p;
  }
  return null;
}

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

/**
 * Extract every <m:mtext>/<m:mi> text value from one CNXML string via DOM, each with:
 *  - context: space-joined tokens of the enclosing <m:math> (document order); '' if none
 *  - position: 'script' (subscript/superscript slot) | 'body'
 * Throws on a fatal XML parse error (fail-loud — never silently drop a file's tokens).
 *
 * The fragment is wrapped in a synthetic root that declares the CNXML/MathML
 * namespaces (mirrors tools/lib/cnxml-dom.js's parseCnxmlFragment) so this
 * works for a bare fragment (no single root element, no xmlns declared) as
 * well as a full CNXML document that already declares its own namespaces.
 * @param {string} cnxml
 * @returns {Array<{ text: string, context: string, position: 'script'|'body' }>}
 */
export function collectMathTokens(cnxml) {
  const wrapped = `<root xmlns="${CNXML_NS}" xmlns:m="${MATHML_NS}">${cnxml}</root>`;
  let fatal = false;
  const doc = new DOMParser({
    onError: (level) => {
      if (level === 'fatalError') fatal = true;
    },
  }).parseFromString(wrapped, 'text/xml');
  if (fatal || !doc || !doc.documentElement) {
    throw new Error('collectMathTokens: fatal XML parse error');
  }

  const tokenNodes = Array.from(doc.getElementsByTagName('*')).filter((el) =>
    TOKEN_NAMES.has(el.tagName)
  );
  const contextCache = new Map(); // math element -> context string
  const results = [];
  for (const node of tokenNodes) {
    const text = node.textContent.trim();
    if (!text) continue;
    const math = enclosingMath(node);
    let context = '';
    if (math) {
      if (!contextCache.has(math)) {
        const toks = Array.from(math.getElementsByTagName('*'))
          .filter((el) => TOKEN_NAMES.has(el.tagName))
          .map((el) => el.textContent.trim())
          .filter(Boolean);
        contextCache.set(math, toks.join(' '));
      }
      context = contextCache.get(math);
    }
    results.push({ text, context, position: isScriptPosition(node) ? 'script' : 'body' });
  }
  return results;
}

/**
 * Tally distinct token values into label / other buckets, additionally tracking
 * how many occurrences render as a subscript/superscript slot ('script') vs
 * plain body text ('body'). `klass` is 'subscript' if any occurrence was
 * script-positioned, else 'inline'.
 * @param {Array<{text:string,context:string,position?:'script'|'body'}>} tokens
 * @param {Set<string>} [stoplist]
 * @returns {{ labels: Map<string,{count:number,context:string,scriptCount:number,bodyCount:number,klass:'subscript'|'inline'}>,
 *             others: Map<string,{count:number,context:string,scriptCount:number,bodyCount:number,klass:'subscript'|'inline'}> }}
 */
export function aggregate(tokens, stoplist = DEFAULT_STOPLIST) {
  const labels = new Map();
  const others = new Map();
  for (const { text, context, position } of tokens) {
    const target = bucketToken(text, stoplist) === 'label' ? labels : others;
    let cur = target.get(text);
    if (!cur) {
      cur = { count: 0, context, scriptCount: 0, bodyCount: 0 };
      target.set(text, cur);
    }
    cur.count += 1;
    if (position === 'script') cur.scriptCount += 1;
    else cur.bodyCount += 1;
  }
  for (const map of [labels, others]) {
    for (const v of map.values()) v.klass = v.scriptCount > 0 ? 'subscript' : 'inline';
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
