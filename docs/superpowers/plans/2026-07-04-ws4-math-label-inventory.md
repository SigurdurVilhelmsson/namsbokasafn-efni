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
