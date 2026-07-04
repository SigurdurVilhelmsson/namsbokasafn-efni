# WS4 Math-label Inventory Tool — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a read-only tool that scans a book's math (`<m:mtext>`/`<m:mi>`) for English-looking labels, emits a ranked two-bucket report plus a `math-label-map.json` skeleton for the lead to fill with Icelandic, and validates the filled map fail-loud.

**Architecture:** Pure, side-effect-free helpers in `tools/lib/math-label-inventory.js` (extraction, bucketing, aggregation, merge, validation, report rendering); a thin CLI wrapper `tools/inventory-math-labels.js` that does file IO and wires the two modes (generate / `--validate`). Mirrors the WS1 pattern (`tools/lib/residue-scan.js` + `tools/scan-residue.js`).

**Tech Stack:** Node 22 ESM, Vitest. No new dependencies. Regex scan over CNXML (not xmldom) — text-node contents + counts only, no structural editing.

Spec: `docs/superpowers/specs/2026-07-04-ws4-math-label-inventory-design.md`

## Global Constraints

- **Scope = inventory tool only.** No inject-side substitution, no F8 math-content hash — those are separate later items that consume the filled map.
- **`books/*/01-source/` is READ-ONLY** — scan only; never write under it.
- **Path resolution via `import.meta.url`**, never `process.cwd()`. In a `tools/`-level file: `const REPO_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');`
- **No AI-generated Icelandic** — the lead supplies every map value by hand. The tool only produces empty skeletons and validates.
- **`mol` is a translatable label** (→ `mól`), so it is NOT in the stoplist. The stoplist holds only units/functions confirmed to stay unchanged.
- **Bucket 2 is always fully printed** — the stoplist only reranks; a mis-tuned stoplist may misrank a token but must never hide it.
- **Test gate:** local `npm test` from the repo root (no branch protection). One PR off `main`, branch `feat/chem-ws4-math-label-inventory` (already created).
- **Value rules (validate):** non-empty; ≤ 6 code points; no whitespace; none of `< > & " '`. A self-map (`surr`→`surr`) is valid; empty is not.

---

## File Structure

- **Create `tools/lib/math-label-inventory.js`** — pure helpers, all exported: `DEFAULT_STOPLIST`, `decodeEntities`, `collectMathTokens`, `bucketToken`, `aggregate`, `mergeSkeleton`, `validateValue`, `validateMap`, `renderReport`. No `fs`, no `process`, no CLI.
- **Create `tools/inventory-math-labels.js`** — CLI wrapper: arg parsing, file discovery/read/write, generate + validate modes. Imports everything from the lib.
- **Create `tools/__tests__/math-label-inventory.test.js`** — unit tests for the pure helpers.
- **Generated at run time (committed as deliverables):** `books/efnafraedi-2e/math-label-map.json`, `books/efnafraedi-2e/math-label-inventory.md`.

---

### Task 1: Bucketing helper + stoplist

**Files:**
- Create: `tools/lib/math-label-inventory.js`
- Test: `tools/__tests__/math-label-inventory.test.js`

**Interfaces:**
- Produces: `DEFAULT_STOPLIST: Set<string>`; `bucketToken(text: string, stoplist?: Set<string>): 'label' | 'other'`.

- [ ] **Step 1: Write the failing test**

```js
// tools/__tests__/math-label-inventory.test.js
import { describe, it, expect } from 'vitest';
import { bucketToken, DEFAULT_STOPLIST } from '../lib/math-label-inventory.js';

describe('bucketToken', () => {
  it('routes lowercase words (incl. mol) to label bucket', () => {
    for (const t of ['rate', 'surr', 'and', 'vap', 'mol', 'cell']) {
      expect(bucketToken(t)).toBe('label');
    }
  });
  it('routes formulae, units, operators, short/var tokens to other', () => {
    for (const t of ['atm', 'MnO', 'HCl', 'pOH', 'kPa', 'kJ', '−', 'k', 'aq', 'log']) {
      expect(bucketToken(t)).toBe('other');
    }
  });
  it('mol is not in the default stoplist', () => {
    expect(DEFAULT_STOPLIST.has('mol')).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tools/__tests__/math-label-inventory.test.js`
Expected: FAIL — cannot import `bucketToken` from a non-existent module.

- [ ] **Step 3: Write minimal implementation**

```js
// tools/lib/math-label-inventory.js

/**
 * Units and math functions confirmed to STAY unchanged in Icelandic.
 * NOTE: `mol` is deliberately absent — it localizes to `mól`, so it must
 * surface as a Bucket-1 fill slot. Only all-lowercase, ≥3-letter tokens are
 * meaningful here (shorter or uppercase-bearing tokens are already routed to
 * 'other' by bucketToken before the stoplist is consulted).
 */
export const DEFAULT_STOPLIST = new Set([
  'atm', 'torr', 'ppb', 'log', 'exp', 'sin', 'cos', 'tan',
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tools/__tests__/math-label-inventory.test.js`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add tools/lib/math-label-inventory.js tools/__tests__/math-label-inventory.test.js
git commit -m "feat(ws4): math-label bucketing helper + stoplist [WS4]"
```

---

### Task 2: Token collection from CNXML

**Files:**
- Modify: `tools/lib/math-label-inventory.js`
- Test: `tools/__tests__/math-label-inventory.test.js`

**Interfaces:**
- Produces: `decodeEntities(s: string): string`; `collectMathTokens(cnxml: string): Array<{ text: string, context: string }>` — one entry per `<m:mtext>`/`<m:mi>` occurrence; `context` is the space-joined math-text tokens of the enclosing `<m:math>` block (or `''` for a stray node outside any block).

- [ ] **Step 1: Write the failing test**

```js
// append to tools/__tests__/math-label-inventory.test.js
import { collectMathTokens, decodeEntities } from '../lib/math-label-inventory.js';

describe('collectMathTokens', () => {
  const cnxml = `
    <para>text before math</para>
    <m:math><m:mrow><m:mi>q</m:mi><m:msub><m:mtext>H</m:mtext></m:msub>
      <m:mtext>vap</m:mtext></m:mrow></m:math>
    <m:math><m:mtext>rate</m:mtext></m:math>`;

  it('pulls every mtext/mi occurrence', () => {
    const toks = collectMathTokens(cnxml).map((t) => t.text);
    expect(toks).toEqual(['q', 'H', 'vap', 'rate']);
  });
  it('gives each token the enclosing expression as context', () => {
    const vap = collectMathTokens(cnxml).find((t) => t.text === 'vap');
    expect(vap.context).toBe('q H vap');
  });
  it('ignores non-math text', () => {
    const toks = collectMathTokens(cnxml).map((t) => t.text);
    expect(toks).not.toContain('text');
  });
  it('decodes entities in token content', () => {
    expect(decodeEntities('&#8722;')).toBe('−');
    expect(decodeEntities('a&amp;b')).toBe('a&b');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tools/__tests__/math-label-inventory.test.js`
Expected: FAIL — `collectMathTokens`/`decodeEntities` not exported.

- [ ] **Step 3: Write minimal implementation**

```js
// append to tools/lib/math-label-inventory.js

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
  const withoutBlocks = cnxml.replace(
    /<m:math\b[^>]*>([\s\S]*?)<\/m:math>/g,
    (_full, inner) => {
      const raws = [...inner.matchAll(new RegExp(NODE_RE.source, 'g'))].map((m) => m[1]);
      const context = raws.map((r) => decodeEntities(r).trim()).filter(Boolean).join(' ');
      for (const r of raws) push(r, context);
      return '';
    }
  );
  // 2. Defensive: any mtext/mi outside a math block — no silent miss.
  for (const m of withoutBlocks.matchAll(new RegExp(NODE_RE.source, 'g'))) push(m[1], '');
  return results;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tools/__tests__/math-label-inventory.test.js`
Expected: PASS (all Task 1 + Task 2 tests).

- [ ] **Step 5: Commit**

```bash
git add tools/lib/math-label-inventory.js tools/__tests__/math-label-inventory.test.js
git commit -m "feat(ws4): collect math text tokens with enclosing context [WS4]"
```

---

### Task 3: Aggregate + non-destructive merge

**Files:**
- Modify: `tools/lib/math-label-inventory.js`
- Test: `tools/__tests__/math-label-inventory.test.js`

**Interfaces:**
- Consumes: `bucketToken`, and `collectMathTokens` output shape `{text, context}`.
- Produces:
  - `aggregate(tokens: Array<{text,context}>, stoplist?): { labels: Map<string,{count:number,context:string}>, others: Map<string,{count:number,context:string}> }` — count = occurrences; context = first-seen.
  - `mergeSkeleton(existing: Record<string,string>, labels: Map<string,{count,context}>): { merged: Record<string,string>, addedKeys: string[], orphanKeys: string[] }` — preserves existing values, adds new label keys with `''`, keeps + reports keys absent from `labels` (never deletes).

- [ ] **Step 1: Write the failing test**

```js
// append to tools/__tests__/math-label-inventory.test.js
import { aggregate, mergeSkeleton } from '../lib/math-label-inventory.js';

describe('aggregate', () => {
  const toks = [
    { text: 'rate', context: 'rate a' },
    { text: 'rate', context: 'rate b' },
    { text: 'mol', context: 'n mol' },
    { text: 'atm', context: 'P atm' },
    { text: 'MnO', context: 'MnO' },
  ];
  it('counts occurrences and buckets labels vs others', () => {
    const { labels, others } = aggregate(toks);
    expect(labels.get('rate').count).toBe(2);
    expect(labels.get('mol').count).toBe(1);
    expect(labels.has('atm')).toBe(false);
    expect(others.has('atm')).toBe(true);
    expect(others.has('MnO')).toBe(true);
  });
  it('keeps the first-seen context', () => {
    const { labels } = aggregate(toks);
    expect(labels.get('rate').context).toBe('rate a');
  });
});

describe('mergeSkeleton', () => {
  const labels = new Map([
    ['rate', { count: 2, context: 'rate' }],
    ['cell', { count: 1, context: 'E cell' }],
  ]);
  it('adds new keys empty and preserves filled values', () => {
    const { merged, addedKeys } = mergeSkeleton({ rate: 'hraði' }, labels);
    expect(merged).toEqual({ rate: 'hraði', cell: '' });
    expect(addedKeys).toEqual(['cell']);
  });
  it('keeps and reports keys absent from discovery (never deletes)', () => {
    const { merged, orphanKeys } = mergeSkeleton({ aq: 'vökvi' }, labels);
    expect(merged.aq).toBe('vökvi');
    expect(orphanKeys).toEqual(['aq']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tools/__tests__/math-label-inventory.test.js`
Expected: FAIL — `aggregate`/`mergeSkeleton` not exported.

- [ ] **Step 3: Write minimal implementation**

```js
// append to tools/lib/math-label-inventory.js

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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tools/__tests__/math-label-inventory.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add tools/lib/math-label-inventory.js tools/__tests__/math-label-inventory.test.js
git commit -m "feat(ws4): aggregate buckets + non-destructive skeleton merge [WS4]"
```

---

### Task 4: Value validation

**Files:**
- Modify: `tools/lib/math-label-inventory.js`
- Test: `tools/__tests__/math-label-inventory.test.js`

**Interfaces:**
- Produces:
  - `validateValue(value: string): string | null` — reason string if invalid, else `null`. Checks order: empty → whitespace → forbidden charset → length > 6 code points.
  - `validateMap(map: Record<string,string>): Array<{ key: string, value: string, reason: string }>`.

- [ ] **Step 1: Write the failing test**

```js
// append to tools/__tests__/math-label-inventory.test.js
import { validateValue, validateMap } from '../lib/math-label-inventory.js';

describe('validateValue', () => {
  it('accepts a short Icelandic value and a self-map', () => {
    expect(validateValue('hraði')).toBeNull();   // 5 code points
    expect(validateValue('surr')).toBeNull();     // self-map keeps English
  });
  it('rejects empty, too-long, whitespace, and XML-special', () => {
    expect(validateValue('')).toMatch(/empty/);
    expect(validateValue('bakskaut')).toMatch(/> 6/);  // 8 chars
    expect(validateValue('a b')).toMatch(/whitespace/);
    expect(validateValue('x<')).toMatch(/forbidden/);
  });
  it('counts Icelandic letters as single code points (þ, ð, æ, ö ok up to 6)', () => {
    expect(validateValue('þðæösý')).toBeNull();   // 6 code points, allowed
  });
});

describe('validateMap', () => {
  it('returns one entry per violating key', () => {
    const v = validateMap({ rate: 'hraði', surr: '', cathode: 'bakskaut' });
    expect(v.map((x) => x.key).sort()).toEqual(['cathode', 'surr']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tools/__tests__/math-label-inventory.test.js`
Expected: FAIL — `validateValue`/`validateMap` not exported.

- [ ] **Step 3: Write minimal implementation**

```js
// append to tools/lib/math-label-inventory.js

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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tools/__tests__/math-label-inventory.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add tools/lib/math-label-inventory.js tools/__tests__/math-label-inventory.test.js
git commit -m "feat(ws4): fail-loud map value validation [WS4]"
```

---

### Task 5: Report rendering

**Files:**
- Modify: `tools/lib/math-label-inventory.js`
- Test: `tools/__tests__/math-label-inventory.test.js`

**Interfaces:**
- Consumes: `labels`/`others` Maps from `aggregate`, and a merged map object.
- Produces: `renderReport({ book: string, labels: Map, others: Map, currentMap: Record<string,string> }): string` — a Markdown document with a Bucket-1 table (sorted by count desc, showing token · count · context · current value) followed by a compact Bucket-2 list, and the value-constraints block.

- [ ] **Step 1: Write the failing test**

```js
// append to tools/__tests__/math-label-inventory.test.js
import { renderReport } from '../lib/math-label-inventory.js';

describe('renderReport', () => {
  const labels = new Map([
    ['rate', { count: 64, context: 'Δ[A]/Δt = rate' }],
    ['cell', { count: 50, context: 'E cell' }],
  ]);
  const others = new Map([['atm', { count: 39, context: 'P atm' }]]);
  const md = renderReport({ book: 'efnafraedi-2e', labels, others, currentMap: { rate: 'hraði', cell: '' } });

  it('lists likely labels sorted by count with counts and context', () => {
    expect(md).toMatch(/rate/);
    expect(md).toMatch(/64/);
    expect(md.indexOf('rate')).toBeLessThan(md.indexOf('cell')); // 64 before 50
  });
  it('shows the current filled value and marks empty ones', () => {
    expect(md).toMatch(/hraði/);
  });
  it('includes the also-review bucket and the constraints', () => {
    expect(md).toMatch(/atm/);
    expect(md).toMatch(/6/);            // 6-char cap mentioned
    expect(md).toMatch(/self-map/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tools/__tests__/math-label-inventory.test.js`
Expected: FAIL — `renderReport` not exported.

- [ ] **Step 3: Write minimal implementation**

```js
// append to tools/lib/math-label-inventory.js

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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tools/__tests__/math-label-inventory.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add tools/lib/math-label-inventory.js tools/__tests__/math-label-inventory.test.js
git commit -m "feat(ws4): two-bucket markdown report renderer [WS4]"
```

---

### Task 6: CLI wrapper + smoke run on efnafraedi-2e

**Files:**
- Create: `tools/inventory-math-labels.js`
- Generated & committed: `books/efnafraedi-2e/math-label-map.json`, `books/efnafraedi-2e/math-label-inventory.md`

**Interfaces:**
- Consumes: everything exported from `tools/lib/math-label-inventory.js`; `parseArgs`, `BOOK_OPTION`, `requireBook` from `tools/lib/parseArgs.js`.
- Produces: the CLI executable (no exported API needed).

- [ ] **Step 1: Write the CLI**

```js
#!/usr/bin/env node

/**
 * inventory-math-labels.js — WS4 math-label inventory tool (read-only scan).
 *
 * generate (default): scan a book's 01-source math text nodes → write a ranked
 *   two-bucket report (math-label-inventory.md) + a fill-in skeleton
 *   (math-label-map.json, Bucket-1 keys, empty values). Non-destructive: an
 *   existing map's filled values are preserved; new keys added empty; keys no
 *   longer in source are kept and reported (never deleted).
 * --validate: re-read the filled map and fail loud (exit 1) on any value that
 *   breaks the length/token/charset/emptiness rules.
 *
 * Never writes under 01-source/.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { parseArgs, BOOK_OPTION, requireBook } from './lib/parseArgs.js';
import {
  collectMathTokens,
  aggregate,
  mergeSkeleton,
  validateMap,
  renderReport,
} from './lib/math-label-inventory.js';

const REPO_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Recursively collect *.cnxml paths under a directory. */
function findCnxml(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...findCnxml(full));
    else if (entry.name.endsWith('.cnxml')) out.push(full);
  }
  return out;
}

/** Serialize a map object with keys sorted alphabetically + trailing newline. */
function serializeMap(mapObj) {
  const sorted = {};
  for (const key of Object.keys(mapObj).sort()) sorted[key] = mapObj[key];
  return `${JSON.stringify(sorted, null, 2)}\n`;
}

function main() {
  const args = parseArgs(process.argv.slice(2), [
    BOOK_OPTION,
    { name: 'validate', flags: ['--validate'], type: 'boolean', default: false },
  ]);
  requireBook(args);

  const bookDir = path.join(REPO_ROOT, 'books', args.book);
  const mapPath = path.join(bookDir, 'math-label-map.json');
  const reportPath = path.join(bookDir, 'math-label-inventory.md');

  if (args.validate) return runValidate(mapPath);
  return runGenerate(args.book, bookDir, mapPath, reportPath);
}

function runGenerate(book, bookDir, mapPath, reportPath) {
  const srcDir = path.join(bookDir, '01-source');
  if (!fs.existsSync(srcDir)) {
    console.error(`ERROR: no 01-source/ under ${bookDir}`);
    process.exit(2);
  }
  const tokens = [];
  for (const file of findCnxml(srcDir)) {
    tokens.push(...collectMathTokens(fs.readFileSync(file, 'utf8')));
  }
  const { labels, others } = aggregate(tokens);
  const existing = fs.existsSync(mapPath) ? JSON.parse(fs.readFileSync(mapPath, 'utf8')) : {};
  const { merged, addedKeys, orphanKeys } = mergeSkeleton(existing, labels);

  fs.writeFileSync(mapPath, serializeMap(merged));
  fs.writeFileSync(reportPath, renderReport({ book, labels, others, currentMap: merged }));

  console.log(`Math-label inventory — ${book}`);
  console.log(`  likely labels: ${labels.size}   also-review: ${others.size}`);
  console.log(`  wrote ${path.relative(REPO_ROOT, reportPath)}`);
  console.log(`  wrote ${path.relative(REPO_ROOT, mapPath)} (${Object.keys(merged).length} keys)`);
  if (addedKeys.length) console.log(`  new keys (empty): ${addedKeys.join(', ')}`);
  if (orphanKeys.length) {
    console.log(`  ⚠ keys in map but not in source (kept — verify): ${orphanKeys.join(', ')}`);
  }
}

function runValidate(mapPath) {
  if (!fs.existsSync(mapPath)) {
    console.error(`ERROR: ${mapPath} not found — run generate first (without --validate).`);
    process.exit(1);
  }
  const map = JSON.parse(fs.readFileSync(mapPath, 'utf8'));
  const violations = validateMap(map);
  if (violations.length === 0) {
    console.log(`✓ ${Object.keys(map).length} label values valid.`);
    return;
  }
  console.error(`✗ ${violations.length} invalid value(s):`);
  for (const { key, value, reason } of violations) {
    console.error(`  '${key}' → '${value}' : ${reason}`);
  }
  process.exit(1);
}

main();
```

- [ ] **Step 2: Smoke-run generate on chemistry**

Run: `node tools/inventory-math-labels.js --book efnafraedi-2e`
Expected: prints a summary; creates `books/efnafraedi-2e/math-label-map.json` and `…/math-label-inventory.md`. The map should contain keys including `mol`, `rate`, `cell`, `surr`, `vap`, `sys`, `mass` with empty `""` values.

Verify:
```bash
node -e "const m=require('./books/efnafraedi-2e/math-label-map.json'); console.log('keys',Object.keys(m).length); for (const k of ['mol','rate','cell','surr']) console.log(k, k in m ? 'present' : 'MISSING');"
```
Expected: all four `present`; `atm`/`MnO` NOT in the map (they are Bucket-2, report-only).

- [ ] **Step 3: Smoke-run validate on the empty skeleton**

Run: `node tools/inventory-math-labels.js --book efnafraedi-2e --validate`
Expected: exit 1, listing every key as `empty (...)` — correct, because the skeleton is unfilled. This confirms validate is fail-loud. (It will pass once the lead fills the values.)

- [ ] **Step 4: Confirm 01-source untouched**

Run: `git status --porcelain books/efnafraedi-2e/01-source`
Expected: no output (read-only honored). Only `math-label-map.json` and `math-label-inventory.md` are new under `books/efnafraedi-2e/`.

- [ ] **Step 5: Full suite from repo root**

Run: `npm test`
Expected: all green (existing ~1810 + the new math-label-inventory tests).

- [ ] **Step 6: Commit**

```bash
git add tools/inventory-math-labels.js books/efnafraedi-2e/math-label-map.json books/efnafraedi-2e/math-label-inventory.md
git commit -m "feat(ws4): inventory-math-labels CLI + efnafraedi-2e skeleton [WS4]"
```

---

## Self-Review

**Spec coverage:**
- Interface (`--book`, `--validate`) → Task 6. ✓
- Generate data flow (discover / collect / bucket / write two artifacts) → Tasks 2, 3, 5, 6. ✓
- Two-bucket ranking + stoplist (mol excluded) → Tasks 1, 5. ✓
- Non-destructive regeneration (merge, report orphans) → Task 3 + Task 6 wiring. ✓
- Validate mode + rules table → Task 4 + Task 6. ✓
- Artifact locations under `books/<book>/` → Task 6. ✓
- Regex-not-DOM, pure helpers exported → Tasks 1–5. ✓
- Read-only 01-source, import.meta.url path → Global Constraints + Task 6 Step 4. ✓
- Testing (bucketer / validator / merge / fixture) → Tasks 1–5 tests. ✓

**Placeholder scan:** none — every code step is complete.

**Type consistency:** `collectMathTokens → {text,context}` consumed by `aggregate`; `aggregate → {labels,others}` (Maps of `{count,context}`) consumed by `mergeSkeleton` and `renderReport`; `mergeSkeleton → {merged,addedKeys,orphanKeys}` consumed by the CLI; `validateMap → [{key,value,reason}]` consumed by `runValidate`. Names match across tasks.

---

## Amendment 2026-07-04 — position-aware length cap (Tasks 7–9)

Post-smoke-run lead decision (spec § Amendment 2026-07-04): the `≤6` cap becomes
**position-aware** — enforced only for tokens that render as subscripts/superscripts.
Tasks 1–6 remain as committed; these tasks layer position-awareness on top.

**Added Global Constraints:**
- Position of a token = `script` iff its node descends from the **≥2nd element-child** of
  an `m:msub`/`m:msup`/`m:msubsup` ancestor; else `body`. Requires DOM (`@xmldom/xmldom`,
  already a dep) — a regex cannot see structural role through `<m:mrow>` wrapping.
- A distinct token is `subscript`-class if **any** occurrence is `script`, else `inline`.
- `≤6` code-point cap applies **only** to `subscript`-class keys; non-empty / no-whitespace
  / no-`< > & " '` apply to all. Map file stays `{english:icelandic}`; class is re-derived
  at validate by re-scanning `01-source/`.

---

### Task 7: DOM-based collection with position + per-key classification

**Files:**
- Modify: `tools/lib/math-label-inventory.js` (reimplement `collectMathTokens` on DOM; extend `aggregate`)
- Test: `tools/__tests__/math-label-inventory.test.js`

**Interfaces:**
- Produces:
  - `collectMathTokens(cnxml: string): Array<{ text, context, position: 'script'|'body' }>` — now DOM-based; throws on a fatal XML parse error (fail-loud, no silent miss).
  - `aggregate(...)` return entries gain `scriptCount: number`, `bodyCount: number`, `klass: 'subscript'|'inline'` (`klass = scriptCount > 0 ? 'subscript' : 'inline'`). `count`/`context` unchanged.
- Consumes: `DOMParser` from `@xmldom/xmldom`.

- [ ] **Step 1: Write the failing test**

```js
// append to tools/__tests__/math-label-inventory.test.js
describe('collectMathTokens position', () => {
  const cnxml = `<doc xmlns:m="http://www.w3.org/1998/Math/MathML">
    <m:math><m:mrow><m:mtext>Δ</m:mtext><m:msub><m:mi>H</m:mi>
      <m:mrow><m:mtext>vap</m:mtext></m:mrow></m:msub></m:mrow></m:math>
    <m:math><m:mtext>pancakes</m:mtext></m:math></doc>`;

  it('marks subscript-slot tokens script and body tokens body', () => {
    const toks = collectMathTokens(cnxml);
    const vap = toks.find((t) => t.text === 'vap');
    const base = toks.find((t) => t.text === 'H');
    const pan = toks.find((t) => t.text === 'pancakes');
    expect(vap.position).toBe('script');   // 2nd child of m:msub
    expect(base.position).toBe('body');     // base (1st child) is not a script slot
    expect(pan.position).toBe('body');      // standalone mtext
  });
  it('still captures context (enclosing expression tokens)', () => {
    const vap = collectMathTokens(cnxml).find((t) => t.text === 'vap');
    expect(vap.context).toBe('Δ H vap');
  });
});

describe('aggregate classification', () => {
  it('classes a token subscript if ANY occurrence is script, else inline', () => {
    const toks = [
      { text: 'vap', context: 'H vap', position: 'script' },
      { text: 'vap', context: 'x', position: 'body' },
      { text: 'pancakes', context: 'pancakes', position: 'body' },
    ];
    const { labels } = aggregate(toks);
    expect(labels.get('vap').klass).toBe('subscript');       // any script wins
    expect(labels.get('vap').scriptCount).toBe(1);
    expect(labels.get('pancakes').klass).toBe('inline');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tools/__tests__/math-label-inventory.test.js`
Expected: FAIL — `position`/`klass` undefined; the current regex `collectMathTokens` returns no `position`.

- [ ] **Step 3: Rewrite `collectMathTokens` on DOM + extend `aggregate`**

Replace the existing regex `collectMathTokens` body (keep `decodeEntities` exported and unchanged — it stays a tested utility even though DOM `textContent` is pre-decoded). Add the `DOMParser` import at the top of the file.

```js
// at top of tools/lib/math-label-inventory.js, with other imports (this file gains its first import)
import { DOMParser } from '@xmldom/xmldom';

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
```

Replace the `collectMathTokens` function with:

```js
/**
 * Extract every <m:mtext>/<m:mi> text value from one CNXML string via DOM, each with:
 *  - context: space-joined tokens of the enclosing <m:math> (document order); '' if none
 *  - position: 'script' (subscript/superscript slot) | 'body'
 * Throws on a fatal XML parse error (fail-loud — never silently drop a file's tokens).
 * @param {string} cnxml
 * @returns {Array<{ text: string, context: string, position: 'script'|'body' }>}
 */
export function collectMathTokens(cnxml) {
  let fatal = false;
  const doc = new DOMParser({
    onError: (level) => {
      if (level === 'fatalError') fatal = true;
    },
  }).parseFromString(cnxml, 'text/xml');
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
```

Extend `aggregate` to tally position and derive `klass`:

```js
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tools/__tests__/math-label-inventory.test.js`
Expected: PASS — all prior tests (the Task 2 regex-era `collectMathTokens` tests still pass because the DOM version returns the same tokens+context; they simply gain a `position` field they don't assert) plus the new position/classification tests.

- [ ] **Step 5: Commit**

```bash
git add tools/lib/math-label-inventory.js tools/__tests__/math-label-inventory.test.js
git commit -m "feat(ws4): DOM-based collection with subscript position + per-key class [WS4]"
```

---

### Task 8: Position-aware validation

**Files:**
- Modify: `tools/lib/math-label-inventory.js` (`validateValue`, `validateMap`)
- Test: `tools/__tests__/math-label-inventory.test.js`

**Interfaces:**
- Produces:
  - `validateValue(value: string, opts?: { enforceLength?: boolean }): string | null` — `enforceLength` defaults `true`; when `false`, the `≤6` cap is skipped (all other rules still apply).
  - `validateMap(map: Record<string,string>, classes?: Record<string,'subscript'|'inline'>): Array<{key,value,reason}>` — a key whose class is `inline` is validated with `enforceLength:false`; any other class (incl. missing) enforces length.

- [ ] **Step 1: Write the failing test**

```js
// append to tools/__tests__/math-label-inventory.test.js
describe('validateValue position-aware', () => {
  it('skips the length cap when enforceLength is false', () => {
    expect(validateValue('pönnukökur', { enforceLength: false })).toBeNull(); // 10 cp, inline ok
    expect(validateValue('a b', { enforceLength: false })).toMatch(/whitespace/); // other rules still apply
  });
  it('still enforces the cap by default', () => {
    expect(validateValue('pönnukökur')).toMatch(/> 6/);
  });
});

describe('validateMap position-aware', () => {
  it('caps subscript-class keys but not inline-class keys', () => {
    const map = { vap: 'uppgufun', pancakes: 'pönnukökur' }; // both > 6 chars
    const classes = { vap: 'subscript', pancakes: 'inline' };
    const v = validateMap(map, classes);
    expect(v.map((x) => x.key)).toEqual(['vap']); // only the subscript one is flagged
  });
  it('enforces length for keys with unknown class (safe default)', () => {
    const v = validateMap({ foo: 'toolongvalue' }, {});
    expect(v).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tools/__tests__/math-label-inventory.test.js`
Expected: FAIL — `validateValue` ignores the options arg; `validateMap` ignores `classes`.

- [ ] **Step 3: Update `validateValue` + `validateMap`**

```js
export function validateValue(value, { enforceLength = true } = {}) {
  if (typeof value !== 'string' || value.length === 0) {
    return 'empty (use a self-map like "surr"→"surr" to keep the English label)';
  }
  if (/\s/.test(value)) return 'contains whitespace (must be a single token)';
  if (/[<>&"']/.test(value)) return 'contains a forbidden XML character (one of < > & " \')';
  if (enforceLength) {
    const codePoints = [...value].length;
    if (codePoints > 6) return `${codePoints} chars > 6-char cap`;
  }
  return null;
}

export function validateMap(map, classes = {}) {
  const violations = [];
  for (const [key, value] of Object.entries(map)) {
    const enforceLength = classes[key] !== 'inline';
    const reason = validateValue(value, { enforceLength });
    if (reason) violations.push({ key, value, reason });
  }
  return violations;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tools/__tests__/math-label-inventory.test.js`
Expected: PASS — prior Task 4 tests still pass (`validateValue(v)` with no opts defaults `enforceLength:true`; `validateMap(map)` with no classes treats every key as length-enforced).

- [ ] **Step 5: Commit**

```bash
git add tools/lib/math-label-inventory.js tools/__tests__/math-label-inventory.test.js
git commit -m "feat(ws4): position-aware length cap in validation [WS4]"
```

---

### Task 9: Three-section report + validate re-scan + JSON guard + regenerate

**Files:**
- Modify: `tools/lib/math-label-inventory.js` (`renderReport`)
- Modify: `tools/inventory-math-labels.js` (validate re-scan + JSON try/catch)
- Test: `tools/__tests__/math-label-inventory.test.js`
- Regenerate & commit: `books/efnafraedi-2e/math-label-map.json`, `books/efnafraedi-2e/math-label-inventory.md`

**Interfaces:**
- Consumes: `labels` entries now carry `klass`; `aggregate` for validate re-scan.
- Produces: `renderReport` splits Bucket 1 into "Subscript labels (≤6)" and "Inline content-words (no cap)" tables; `runValidate` re-scans source to build `classes` and calls `validateMap(map, classes)`, with a JSON-parse guard.

- [ ] **Step 1: Write the failing test (renderReport 3-section)**

```js
// append to tools/__tests__/math-label-inventory.test.js
describe('renderReport three sections', () => {
  const labels = new Map([
    ['vap', { count: 19, context: 'Δ H vap', scriptCount: 19, bodyCount: 0, klass: 'subscript' }],
    ['pancakes', { count: 3, context: 'egg pancakes', scriptCount: 0, bodyCount: 3, klass: 'inline' }],
  ]);
  const others = new Map([['atm', { count: 39, context: 'P atm', scriptCount: 0, bodyCount: 39, klass: 'inline' }]]);
  const md = renderReport({ book: 'efnafraedi-2e', labels, others, currentMap: { vap: '', pancakes: '' } });

  it('has a subscript section that mentions the 6-char cap', () => {
    expect(md).toMatch(/Subscript labels/);
    expect(md).toMatch(/vap/);
  });
  it('has an inline content-words section noting no length cap', () => {
    expect(md).toMatch(/Inline content-words/);
    expect(md).toMatch(/pancakes/);
    expect(md).toMatch(/no length cap|no cap/i);
  });
  it('still prints the also-review bucket', () => {
    expect(md).toMatch(/atm/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tools/__tests__/math-label-inventory.test.js`
Expected: FAIL — current `renderReport` has a single "Likely labels" table, no subscript/inline split.

- [ ] **Step 3: Rewrite `renderReport` to split Bucket 1 by `klass`**

```js
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
  lines.push('**Value rules (all):** non-empty · single token (no spaces) · no `< > & " \'` ·');
  lines.push('Icelandic letters ok. To keep a label English, self-map it to itself');
  lines.push('(e.g. `surr` → `surr`) — do not leave it blank (blank deletes it).');
  lines.push('**Length:** subscript labels must be ≤ 6 characters (they render as small');
  lines.push('subscripts); inline content-words have no length cap.');
  lines.push('');

  const table = (entries) => {
    const rows = ['| token | count | Icelandic (in map) | example context |',
      '|-------|------:|--------------------|-----------------|'];
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
  const otherStr = byCountDesc(others).map(([text, info]) => `\`${text}\` ×${info.count}`).join(' · ');
  lines.push(otherStr || '_(none)_');
  lines.push('');
  return lines.join('\n');
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tools/__tests__/math-label-inventory.test.js`
Expected: PASS (the earlier single-table `renderReport` test from Task 5 is superseded — update it if it now fails on the renamed heading: change its `## Likely labels` expectation to `## Subscript labels` / `## Inline content-words` as appropriate, and keep the sort/empty/also-review assertions).

- [ ] **Step 5: Make `runValidate` position-aware + guard JSON parse**

In `tools/inventory-math-labels.js`, add `collectMathTokens` and `aggregate` to the lib import, and replace `runValidate` (and its call site, which must now pass `bookDir`):

```js
// import line becomes:
import {
  collectMathTokens,
  aggregate,
  mergeSkeleton,
  validateMap,
  renderReport,
} from './lib/math-label-inventory.js';

// in main(): validate branch passes bookDir
if (args.validate) return runValidate(mapPath, path.join(bookDir, '01-source'));

// helper: parse a JSON file with a friendly error
function readJsonOrExit(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    console.error(`ERROR: ${file} is not valid JSON: ${err.message}`);
    process.exit(1);
  }
}

// generate's existing map read also uses the guard:
//   const existing = fs.existsSync(mapPath) ? readJsonOrExit(mapPath) : {};

function runValidate(mapPath, srcDir) {
  if (!fs.existsSync(mapPath)) {
    console.error(`ERROR: ${mapPath} not found — run generate first (without --validate).`);
    process.exit(1);
  }
  const map = readJsonOrExit(mapPath);

  // Re-derive each key's position class by re-scanning source.
  const tokens = [];
  for (const file of findCnxml(srcDir)) {
    tokens.push(...collectMathTokens(fs.readFileSync(file, 'utf8')));
  }
  const { labels, others } = aggregate(tokens);
  const classes = {};
  for (const [k, v] of [...labels, ...others]) classes[k] = v.klass;

  const violations = validateMap(map, classes);
  if (violations.length === 0) {
    console.log(`✓ ${Object.keys(map).length} label values valid.`);
    return;
  }
  console.error(`✗ ${violations.length} invalid value(s):`);
  for (const { key, value, reason } of violations) {
    console.error(`  '${key}' → '${value}' : ${reason}`);
  }
  process.exit(1);
}
```

Also update `runGenerate`'s `existing` read to use `readJsonOrExit` (replace the inline `JSON.parse`).

- [ ] **Step 6: Regenerate the efnafraedi-2e artifacts**

Run: `node tools/inventory-math-labels.js --book efnafraedi-2e`
Expected: rewrites `books/efnafraedi-2e/math-label-map.json` (same 133 keys, values preserved — all still empty) and `…/math-label-inventory.md` (now three sections). The map is unchanged in key set; only the report layout changes.

Verify the report now separates the populations:
```bash
grep -c '^## Subscript labels' books/efnafraedi-2e/math-label-inventory.md   # 1
grep -c '^## Inline content-words' books/efnafraedi-2e/math-label-inventory.md # 1
```
Expected: both `1`. Spot-check that `vap`/`surr`/`cell` land under Subscript labels and `pancakes`/`sunlight` under Inline content-words.

- [ ] **Step 7: Confirm 01-source untouched + full suite**

Run: `git status --porcelain books/efnafraedi-2e/01-source` → no output.
Run: `npm test` (from repo root) → all green.

- [ ] **Step 8: Commit**

```bash
git add tools/lib/math-label-inventory.js tools/inventory-math-labels.js \
  tools/__tests__/math-label-inventory.test.js \
  books/efnafraedi-2e/math-label-map.json books/efnafraedi-2e/math-label-inventory.md
git commit -m "feat(ws4): three-section report + position-aware validate + regenerate [WS4]"
```
