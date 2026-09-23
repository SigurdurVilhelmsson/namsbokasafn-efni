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
 * A math abbreviation of at most this many characters keeps its ENGLISH by
 * default. [USER] ruling 2026-09-04.
 */
export const SHORT_LABEL_MAX = 4;

/**
 * The ONLY short math labels that may be localized — [USER]-approved 2026-09-04.
 *
 * 🔴 THE DEFAULT IS INVERTED HERE, AND THAT IS THE POINT. Before this ruling a
 * short label was translated unless someone self-mapped it in a book's
 * `math-label-map.json`; now it renders English unless it appears below. The
 * trigger: `E°cell` shipped as `Eker°` and `E°sys` as `Ekerfis°` in published
 * chemistry. `cell` genuinely means *ker* — but `E°cell` is international
 * formula convention, so the entry was correct for the WORD and wrong for the
 * SYMBOL. That is §C82 ③'s wrong-REGISTER class, the same shape as
 * `ln → náttúrlegur logri` ruining `S = k ln W`.
 *
 * ⚠️ DELIBERATELY NOT the union of "what the map happens to translate today".
 * Each entry is a word Icelandic actually writes in a formula slot — a unit
 * (`mol` → mól), a substance or object (`ice`, `iron`, `eggs`), or descriptive
 * prose (`avg`, `fast`, `then`). Everything a chemist reads as a *symbol*
 * subscript is absent on purpose and must stay absent; the ruling's named set is
 * `RULED_ENGLISH_SHORT_LABELS` below, its one enforceable copy. (`rxn` was named too
 * until [USER] reversed it for that one label on 2026-09-19; see its entry below.)
 *
 * ⚠️ `red` is here for the COLOUR: its 13 corpus firings are all
 * `2HgO(s, rauður)`, red mercuric oxide. It is NOT the `E_red` reduction
 * subscript, which does not occur as a bare math leaf in this corpus. If that
 * ever changes, `red` must leave this list — the two senses cannot share an
 * entry, and a flat map cannot tell them apart.
 *
 * To localize a new short label: add it here, with its reason. Adding it to a
 * book's `math-label-map.json` alone will NOT work, by design.
 */
export const LOCALIZABLE_SHORT_LABELS = new Set([
  // units and quantities Icelandic writes in formulae
  'mol',
  'mmol',
  'min',
  'gal',
  'oct',
  'time',
  'mass',
  'rate',
  'avg',
  'heat',
  // substances and objects named in worked examples
  'ice',
  'iron',
  'eggs',
  'bomb',
  'acid',
  'base',
  'atom',
  'soln',
  'solv',
  'elec',
  'univ',
  'red',
  'day',
  // descriptive prose used as a subscript
  'and',
  'for',
  'then',
  'with',
  'fast',
  'slow',
  // [USER] 2026-09-19: `ΔH°rxn` renders `ΔH°hvarf`. Reverses the 2026-09-04
  // ruling for THIS label only, after ch05's re-render turned published `hvarf`
  // (07-10 vintage) into `rxn`. The other symbol subscripts above stay English.
  'rxn',
]);

/**
 * The short symbol subscripts the 2026-09-04 [USER] ruling NAMED as keeping their
 * English (listed in its prose until 2026-09-19; this Set is now the only copy).
 *
 * Read by `tools/chapter-term-check.js`, which surfaces every short label a book's
 * map translates but the default keeps English: a label named here is reported as
 * already ruled, so each chapter's review asks only about labels nobody has ruled
 * on. Removing a label from here re-opens the question; it does not localize it —
 * only `LOCALIZABLE_SHORT_LABELS` does that.
 */
export const RULED_ENGLISH_SHORT_LABELS = new Set([
  'cell',
  'surr',
  'sys',
  'vap',
  'fus',
  'sub',
  'con',
  'dep',
  'eff',
  'ele',
  'frz',
  'tet',
  'rev',
]);

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

const NAMED_ENTITIES = { lt: '<', gt: '>', quot: '"', apos: "'", amp: '&' };

/**
 * Decode the small set of XML entities that can appear in MathML text nodes
 * and attribute values.
 *
 * 🔴 ONE PASS, NEVER A CHAIN OF `.replace`s (§C126 #4 review, 2026-09-23). The
 * previous form decoded numeric references first and `&amp;` last, and "last"
 * only protected against `&amp;` — a numeric reference that DECODES TO `&`
 * re-introduced an entity for the next pass: `a &#38;lt; b` (literally
 * `a &lt; b`) came out as `a < b`, a different meaning. A single alternation
 * scans each reference exactly once, so decoded text is never re-read.
 * Behaviour-identical on the corpus: 0 tracked book files carry `&#38;` or
 * `&#x26;` (measured the same day), the only shape the chain got wrong.
 * @param {string} s
 * @returns {string}
 */
export function decodeEntities(s) {
  return s.replace(/&(?:#x([0-9a-fA-F]+)|#(\d+)|(lt|gt|quot|apos|amp));/g, (_, h, d, name) =>
    h
      ? String.fromCodePoint(parseInt(h, 16))
      : d
        ? String.fromCodePoint(parseInt(d, 10))
        : NAMED_ENTITIES[name]
  );
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
 * Value-level validation. Charset is the only hard failure; whitespace and (when
 * enforceLength) length are advisory warnings. Empty is not judged here — the map
 * decides pending. Pass non-empty values for meaningful results.
 * @param {string} value
 * @param {{ enforceLength?: boolean }} [opts]
 * @returns {{ hard: string|null, warnings: string[] }}
 */
export function validateValue(value, { enforceLength = true } = {}) {
  const warnings = [];
  if (typeof value !== 'string' || value.length === 0) return { hard: null, warnings };
  if (value.trim().length === 0) {
    return {
      hard: 'whitespace-only (would delete the label — leave blank for pending instead)',
      warnings,
    };
  }
  const hard = /[<>&"']/.test(value)
    ? 'contains a forbidden XML character (one of < > & " \')'
    : null;
  if (/\s/.test(value)) warnings.push('multi-word (contains whitespace)');
  if (enforceLength) {
    const cp = [...value].length;
    if (cp > 6) warnings.push(`${cp} chars > 6 (long for a subscript)`);
  }
  return { hard, warnings };
}

/**
 * Classify every overlay entry into a state, aggregating advisories.
 * - value === key            → finalEnglish (self-map: keep English, no auto-replace)
 * - value empty/absent       → pending (renders English; auto-upgrades from glossary)
 * - otherwise                → translated; run validateValue (subscript-only length)
 * @param {Record<string,string>} map
 * @param {Record<string,'subscript'|'inline'>} [classes]
 * @returns {{ hard: Array<{key,value,reason}>, warnings: Array<{key,value,warning}>,
 *            pending: string[], finalEnglish: string[] }}
 */
export function validateMap(map, classes = {}) {
  const hard = [];
  const warnings = [];
  const pending = [];
  const finalEnglish = [];
  for (const [key, value] of Object.entries(map)) {
    if (typeof value !== 'string' || value.length === 0) {
      pending.push(key);
      continue;
    }
    if (value === key) {
      finalEnglish.push(key);
      continue;
    }
    const r = validateValue(value, { enforceLength: classes[key] === 'subscript' });
    if (r.hard) hard.push({ key, value, reason: r.hard });
    for (const w of r.warnings) warnings.push({ key, value, warning: w });
  }
  return { hard, warnings, pending, finalEnglish };
}

/** Sort a Map's entries by count desc, then key asc. */
function byCountDesc(map) {
  return [...map.entries()].sort((a, b) => b[1].count - a[1].count || a[0].localeCompare(b[0]));
}

/**
 * Render the position-aware Markdown inventory report: subscript labels (≤6 cap),
 * inline content-words (no length cap), then the also-review bucket.
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
  lines.push('**Value rules:** no `< > & " \'` (hard) · Icelandic letters ok.');
  lines.push('Leave **blank** to keep a label pending (renders English now; auto-upgrades');
  lines.push('when the glossary gains an approved term). To keep a label English *permanently*');
  lines.push('(international units like `ppm`/`psi`), self-map it to itself (e.g. `ppm` → `ppm`).');
  lines.push(
    '**Length:** subscript labels > 6 characters get an advisory warning (not a failure);'
  );
  lines.push('inline content-words have no length cap.');
  lines.push('');

  const table = (entries) => {
    const rows = [
      '| token | count | Icelandic (in map) | example context |',
      '|-------|------:|--------------------|-----------------|',
    ];
    for (const [text, info] of entries) {
      const val = currentMap[text] ? `\`${currentMap[text]}\`` : '_(empty)_';
      rows.push(`| \`${text}\` | ${info.count} | ${val} | ${info.context.replace(/\|/g, '\\|')} |`);
    }
    return rows.join('\n');
  };

  const subs = byCountDesc(labels).filter(([, v]) => v.klass === 'subscript');
  const inline = byCountDesc(labels).filter(([, v]) => v.klass === 'inline');

  lines.push('## Subscript labels — fill these (≤ 6 characters)');
  lines.push('');
  lines.push(subs.length ? table(subs) : '_(none)_');
  lines.push('');
  lines.push('## Inline content-words — fill these (no length cap)');
  lines.push('');
  lines.push('These render as full words in the equation body (word-equations / annotations),');
  lines.push('so their Icelandic need not be compact.');
  lines.push('');
  lines.push(inline.length ? table(inline) : '_(none)_');
  lines.push('');
  lines.push('## Also review — probably keep as-is (formulae, units, operators, variables)');
  lines.push('');
  lines.push('If a real label is hiding here, add it to `math-label-map.json` by hand — a');
  lines.push('re-run preserves hand-added keys.');
  lines.push('');
  const otherStr = byCountDesc(others)
    .map(([text, info]) => `\`${text}\` ×${info.count}`)
    .join(' · ');
  lines.push(otherStr || '_(none)_');
  lines.push('');
  return lines.join('\n');
}
