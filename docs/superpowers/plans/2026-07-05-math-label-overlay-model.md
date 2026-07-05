# Math-label Overlay Model — Implementation Plan (items 1–4)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. **Task 4 is controller-executed (needs the lead's editorial input) — do NOT delegate it to a subagent.**

**Goal:** Reclassify the math-label validation from a hard cap into correctness-only-hard + advisory warnings + a pending state, add a `--pending` work-list, and transfer the lead's reviewed Icelandic choices into `math-label-map.json`.

**Architecture:** `math-label-map.json` is a math-rendering overlay with three states — translated / final-English (self-map) / pending (empty). Validation hard-fails only on MathML-corrupting characters; length (subscript-only) and whitespace become advisory; empty is pending (safe — substitution falls back to the glossary, then English). The glossary-aware substitution that consumes this model is **item 5, specified separately** — NOT in this plan.

**Tech Stack:** Node 22 ESM, Vitest. No new dependencies.

Spec: `docs/superpowers/specs/2026-07-05-math-label-overlay-model-design.md`

## Global Constraints

- **Scope = items 1–4 only.** Glossary-aware substitution at inject (item 5) is a separate PR built to the spec's resolution contract; do not build it here.
- **Three states:** overlay value is Icelandic (≠ English) = **translated**; value == English = **final-English** (self-map, no auto-replace); empty/absent = **pending** (renders English via glossary→English, auto-upgrades).
- **Validation:** `< > & " '` = **HARD fail** (exit 1) — the only correctness break. length > 6 = **advisory warning, SUBSCRIPT-CLASS ONLY**. whitespace = **advisory warning**. empty = **pending** (informational, never fails).
- **`--validate` exits 0 unless a hard (charset) violation exists, and ALWAYS prints** the warnings + pending/final-English summary even on a green run.
- Map file format unchanged: `{ "english": "icelandic" }`, keys sorted.
- Path resolution via `import.meta.url`, never `process.cwd()`. Never write under `01-source/`.
- **No AI-generated Icelandic** — Task 4 transfers the lead's own reviewed values.
- Test gate: local `npm test` from repo root. One PR off `main` (branch `feat/chem-ws4-math-labels-fill`, already checked out).

---

## File Structure

- **Modify `tools/lib/math-label-inventory.js`** — reshape `validateValue` and `validateMap` (Task 1).
- **Modify `tools/inventory-math-labels.js`** — new `runValidate` output + exit semantics (Task 2); add `--pending` flag + `runPending` (Task 3).
- **Modify `tools/__tests__/math-label-inventory.test.js`** — rewrite the `validateValue`/`validateMap` describe blocks (Task 1); the CLI is exercised manually (consistent with existing tool convention).
- **Modify `books/efnafraedi-2e/math-label-map.json`** — data transfer (Task 4).

---

### Task 1: Reshape the validation model (validateValue + validateMap)

Both change together — `validateValue`'s new return type would break `validateMap` if split, so this is one atomic task that keeps the suite green.

**Files:**
- Modify: `tools/lib/math-label-inventory.js`
- Test: `tools/__tests__/math-label-inventory.test.js`

**Interfaces:**
- Produces:
  - `validateValue(value: string, opts?: { enforceLength?: boolean }): { hard: string|null, warnings: string[] }` — value-level. `hard` = charset reason or null; `warnings` = whitespace and/or (when `enforceLength`) length advisories. Empty value → `{ hard: null, warnings: [] }`.
  - `validateMap(map: Record<string,string>, classes?: Record<string,'subscript'|'inline'>): { hard: Array<{key,value,reason}>, warnings: Array<{key,value,warning}>, pending: string[], finalEnglish: string[] }` — a value that equals its key → `finalEnglish`; empty → `pending`; otherwise runs `validateValue` with `enforceLength = classes[key] === 'subscript'`.

- [ ] **Step 1: Replace the existing `validateValue` + `validateMap` unit tests**

In `tools/__tests__/math-label-inventory.test.js`, DELETE the current `describe('validateValue', …)`, `describe('validateMap', …)`, `describe('validateValue position-aware', …)`, and `describe('validateMap position-aware', …)` blocks, and replace them with:

```js
describe('validateValue (value-level: charset hard, length/whitespace advisory)', () => {
  it('empty value is neither hard nor warned (map decides pending)', () => {
    expect(validateValue('')).toEqual({ hard: null, warnings: [] });
  });
  it('charset is the only hard failure', () => {
    expect(validateValue('a<b').hard).toMatch(/forbidden/);
    expect(validateValue('a&b').hard).toMatch(/forbidden/);
    expect(validateValue('hraði').hard).toBeNull();
  });
  it('whitespace is an advisory warning, not hard', () => {
    const r = validateValue('fast efni');
    expect(r.hard).toBeNull();
    expect(r.warnings.join(' ')).toMatch(/whitespace|multi-word/);
  });
  it('length >6 warns only when enforceLength (subscript); never hard', () => {
    const sub = validateValue('uppgufun', { enforceLength: true }); // 8 cp
    expect(sub.hard).toBeNull();
    expect(sub.warnings.join(' ')).toMatch(/> ?6/);
    const inl = validateValue('uppgufun', { enforceLength: false });
    expect(inl.warnings.join(' ')).not.toMatch(/> ?6/);
  });
  it('6 Icelandic code points is within the cap (no length warning)', () => {
    expect(validateValue('þðæösý', { enforceLength: true }).warnings).toEqual([]);
  });
});

describe('validateMap (states: translated / final-English / pending + advisories)', () => {
  it('classifies self-map as final-English and empty as pending', () => {
    const r = validateMap({ ppm: 'ppm', sub: '', rate: 'hraði' }, {});
    expect(r.finalEnglish).toEqual(['ppm']);
    expect(r.pending).toEqual(['sub']);
    expect(r.hard).toEqual([]);
    expect(r.warnings).toEqual([]);
  });
  it('length warning fires for subscript class only', () => {
    const r = validateMap(
      { vap: 'uppgufun', pancakes: 'pönnukökur' },
      { vap: 'subscript', pancakes: 'inline' }
    );
    expect(r.warnings.map((w) => w.key)).toEqual(['vap']); // inline long value: no warning
    expect(r.hard).toEqual([]);
  });
  it('collects a charset value as hard', () => {
    const r = validateMap({ bad: 'a<b' }, { bad: 'inline' });
    expect(r.hard.map((h) => h.key)).toEqual(['bad']);
  });
  it('a value equal to its key is final-English even if long', () => {
    const r = validateMap({ reaction: 'reaction' }, { reaction: 'subscript' });
    expect(r.finalEnglish).toEqual(['reaction']);
    expect(r.warnings).toEqual([]);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run tools/__tests__/math-label-inventory.test.js`
Expected: FAIL — current `validateValue` returns a string (not `{hard,warnings}`) and `validateMap` returns an array (not `{hard,warnings,pending,finalEnglish}`).

- [ ] **Step 3: Replace the implementations**

In `tools/lib/math-label-inventory.js`, replace the whole current `validateValue` function and the whole current `validateMap` function with:

```js
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
```

- [ ] **Step 4: Run to verify they pass**

Run: `npx vitest run tools/__tests__/math-label-inventory.test.js`
Expected: PASS (all blocks; the non-validation tests are untouched and still pass).

- [ ] **Step 5: Commit**

```bash
git add tools/lib/math-label-inventory.js tools/__tests__/math-label-inventory.test.js
git commit -m "feat(ws4): reclassify validation — charset hard, length/whitespace advisory, empty=pending [WS4]"
```

---

### Task 2: CLI `runValidate` — new output + exit semantics

**Files:**
- Modify: `tools/inventory-math-labels.js`

**Interfaces:**
- Consumes: the new `validateMap` return shape from Task 1.
- Produces: `runValidate` exits 0 unless `hard` is non-empty; always prints warnings + pending/final-English summary.

- [ ] **Step 1: Replace `runValidate`'s result-handling**

In `tools/inventory-math-labels.js`, replace the body of `runValidate` from the `const violations = validateMap(...)` line to the end of the function with:

```js
  const { hard, warnings, pending, finalEnglish } = validateMap(map, classes);
  const translated = Object.keys(map).length - pending.length - finalEnglish.length - hard.length;

  if (warnings.length) {
    console.log(`⚠ ${warnings.length} advisory (not blocking):`);
    for (const { key, value, warning } of warnings) {
      console.log(`  '${key}' → '${value}' : ${warning}`);
    }
  }
  console.log(
    `Pending (render English, auto-upgrade from glossary): ${pending.length}` +
      (pending.length ? ` — ${pending.join(', ')}` : '')
  );
  console.log(
    `Final-English (kept, no auto-replace): ${finalEnglish.length}` +
      (finalEnglish.length ? ` — ${finalEnglish.join(', ')}` : '')
  );

  if (hard.length === 0) {
    console.log(`✓ no correctness errors. ${translated} translated, ${warnings.length} advisory.`);
    return;
  }
  console.error(`✗ ${hard.length} correctness error(s) — must fix:`);
  for (const { key, value, reason } of hard) {
    console.error(`  '${key}' → '${value}' : ${reason}`);
  }
  process.exit(1);
```

- [ ] **Step 2: Smoke-check against the current committed map**

Run: `node tools/inventory-math-labels.js --book efnafraedi-2e --validate; echo "exit: $?"`
Expected: prints an advisory block (if any), a `Pending …` line and a `Final-English …` line, then either `✓ no correctness errors …` with `exit: 0`, or `✗ … must fix` with `exit: 1` only if a value contains `< > & " '`. (With the current machine-prefilled map there are no charset values, so **exit 0** — a change from the old behavior, which exited 1 on empties.)

- [ ] **Step 3: Commit**

```bash
git add tools/inventory-math-labels.js
git commit -m "feat(ws4): validate prints advisories + pending summary, hard-fails only on charset [WS4]"
```

---

### Task 3: `--pending` report mode

**Files:**
- Modify: `tools/inventory-math-labels.js`

**Interfaces:**
- Consumes: `collectMathTokens`, `aggregate`, `validateMap` (already imported); `findCnxml`, `readJsonOrExit` (already in this file).
- Produces: a `--pending` CLI mode printing the pending work-list (by class) + final-English list; exits 0.

- [ ] **Step 1: Add the `--pending` flag to arg parsing**

In `tools/inventory-math-labels.js`, in `main()`, the `parseArgs` option list currently has `BOOK_OPTION` and the `validate` flag. Add a `pending` flag and route to it. Change the options array and the dispatch:

```js
  const args = parseArgs(process.argv.slice(2), [
    BOOK_OPTION,
    { name: 'validate', flags: ['--validate'], type: 'boolean', default: false },
    { name: 'pending', flags: ['--pending'], type: 'boolean', default: false },
  ]);
  requireBook(args);

  const bookDir = path.join(REPO_ROOT, 'books', args.book);
  const mapPath = path.join(bookDir, 'math-label-map.json');
  const reportPath = path.join(bookDir, 'math-label-inventory.md');
  const srcDir = path.join(bookDir, '01-source');

  if (args.pending) return runPending(mapPath, srcDir);
  if (args.validate) return runValidate(mapPath, srcDir);
  return runGenerate(args.book, bookDir, mapPath, reportPath);
```

(If `main()` already computes `mapPath`/`srcDir` differently, keep its existing variables — only add the `pending` option and the `if (args.pending)` dispatch line.)

- [ ] **Step 2: Add `runPending`**

Add this function next to `runValidate` in `tools/inventory-math-labels.js`:

```js
/**
 * Print the pending work-list — labels currently rendering English, grouped by class,
 * plus the final-English (self-mapped) set for reference. Read-only; exits 0.
 */
function runPending(mapPath, srcDir) {
  if (!fs.existsSync(mapPath)) {
    console.error(`ERROR: ${mapPath} not found — run generate first.`);
    process.exit(1);
  }
  if (!fs.existsSync(srcDir)) {
    console.error(`ERROR: no 01-source/ under ${srcDir}`);
    process.exit(1);
  }
  const map = readJsonOrExit(mapPath);
  const tokens = [];
  for (const file of findCnxml(srcDir)) tokens.push(...collectMathTokens(fs.readFileSync(file, 'utf8')));
  const { labels, others } = aggregate(tokens);
  const classes = {};
  for (const [k, v] of [...labels, ...others]) classes[k] = v.klass;

  const { pending, finalEnglish } = validateMap(map, classes);
  const sub = pending.filter((k) => classes[k] === 'subscript');
  const inl = pending.filter((k) => classes[k] !== 'subscript');
  console.log(`Pending labels — render English now, auto-upgrade when a glossary term lands: ${pending.length}`);
  console.log(`  subscript (${sub.length}): ${sub.join(', ') || '—'}`);
  console.log(`  inline    (${inl.length}): ${inl.join(', ') || '—'}`);
  console.log(`\nFinal-English (self-mapped, kept as-is): ${finalEnglish.length}`);
  console.log(`  ${finalEnglish.join(', ') || '—'}`);
}
```

- [ ] **Step 3: Smoke-check**

Run: `node tools/inventory-math-labels.js --book efnafraedi-2e --pending; echo "exit: $?"`
Expected: prints the pending subscript/inline lists + final-English list, `exit: 0`.

- [ ] **Step 4: Full suite + commit**

Run: `npm test` (from repo root) → all green.
```bash
git add tools/inventory-math-labels.js
git commit -m "feat(ws4): --pending work-list report [WS4]"
```

---

### Task 4: Data transfer (CONTROLLER-EXECUTED — needs the lead's editorial input)

**Do not delegate to a subagent.** This moves the lead's reviewed choices from the review `.md` into the map and requires the lead to sort the kept-English labels into final vs pending.

**Files:**
- Modify: `books/efnafraedi-2e/math-label-map.json`
- (reads: `books/efnafraedi-2e/math-label-erlendur-review.md`)

- [ ] **Step 1: Present the kept-English labels to the lead for the final-vs-pending split**

Parse the review file's glossary-IS column (the lead's choices) and list every entry whose value equals its English key (the kept-English set). Ask the lead which are **final-English** (self-map, never auto-replace — e.g. international units `ppm`, `psi`, `amu`, `bar`) vs **pending** (leave empty, auto-upgrade — e.g. `sub`, `con`, `dep`, `eff`, `ele`, `frz`, `tet`, `iii`). `gas`/`salt`/`egg` (Icelandic == English) are genuine translations → final-English by nature. Record the lead's split.

- [ ] **Step 2: Write the transfer script**

Create `scratchpad/transfer-review-to-map.mjs`:

```js
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const bookDir = path.join(ROOT, 'books/efnafraedi-2e');

// Labels the lead marked PENDING (leave empty) — everything else keeps its review value.
// Fill from Step 1's answer, e.g. ['sub','con','dep','eff','ele','frz','tet','iii'].
const PENDING = JSON.parse(process.env.PENDING || '[]');

const md = fs.readFileSync(path.join(bookDir, 'math-label-erlendur-review.md'), 'utf8').split('\n');
const out = {};
for (const line of md) {
  const m = line.match(/^\|\s*`([^`]+)`\s*\|\s*[0-9]+\s*\|\s*(.*?)\s*\|\s*.*?\s*\|\s*.*?\s*\|$/);
  if (!m) continue;
  const en = m[1];
  const val = m[2].replace(/`/g, '').replace(/✓/g, '').trim();
  out[en] = PENDING.includes(en) || val === '—' ? '' : val;
}
const sorted = {};
for (const k of Object.keys(out).sort()) sorted[k] = out[k];
fs.writeFileSync(path.join(bookDir, 'math-label-map.json'), `${JSON.stringify(sorted, null, 2)}\n`);
const filled = Object.values(out).filter((v) => v).length;
console.log(`wrote ${Object.keys(out).length} keys: ${filled} filled, ${Object.keys(out).length - filled} pending`);
```

- [ ] **Step 3: Run the transfer with the lead's pending set**

Run (substituting the lead's Step-1 pending list):
`PENDING='["sub","con","dep","eff","ele","frz","tet","iii"]' node scratchpad/transfer-review-to-map.mjs`
Expected: `wrote 133 keys: N filled, M pending`.

- [ ] **Step 4: Validate — expect exit 0 (advisories/pending allowed, no charset errors)**

Run: `node tools/inventory-math-labels.js --book efnafraedi-2e --validate; echo "exit: $?"`
Expected: `exit: 0`; advisory block lists the long subscripts (`univ`/`initial`/`reaction`/`rebar`/`fusion`) and multi-word values (`reverse`/`solid`/`where`) as **warnings**, and the pending line lists the lead's pending set. If exit is 1, a value contains `< > & " '` — report the offending label to the lead.

- [ ] **Step 5: Confirm 01-source untouched + full suite + commit**

Run: `git status --porcelain books/efnafraedi-2e/01-source` → empty.
Run: `npm test` (repo root) → green.
```bash
git add books/efnafraedi-2e/math-label-map.json
git commit -m "data(ws4): transfer lead's reviewed math-label choices into the overlay [WS4]"
```

---

## Self-Review

**Spec coverage:**
- Validation reclassification (charset hard; length subscript-only advisory; whitespace advisory; empty pending) → Task 1. ✓
- Three-state semantics (translated/final-English/pending) → Task 1 (`validateMap`). ✓
- `--validate` exits 0 unless charset, always prints warnings + pending summary → Task 2. ✓
- `--pending` report → Task 3. ✓
- Lead data transfer + kept-English split → Task 4. ✓
- Map format unchanged, keys sorted → Task 4 script. ✓
- Substitution (item 5) NOT built → excluded by scope; no task. ✓

**Placeholder scan:** none — every code + test step is complete. Task 4's `PENDING` list is filled from the lead's Step-1 answer at execution (documented, not a placeholder).

**Type consistency:** `validateValue → {hard, warnings}` consumed by `validateMap`; `validateMap → {hard, warnings, pending, finalEnglish}` consumed by `runValidate` (Task 2) and `runPending` (Task 3); both destructure the same field names. Classes are `'subscript'|'inline'` throughout, and length enforcement keys on `=== 'subscript'` consistently.
