# WS4 item 5 — math-label substitution + F8 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Substitute English math labels (`rate`→`hraði`, …) into Icelandic at inject using the filled overlay + glossary, and add a warn-only fidelity check (F8) so math edits are visible in the oracle.

**Architecture:** One pure lib `tools/lib/math-label-substitute.js` owns resolution + byte-minimal regex substitution + the report pass. `cnxml-inject.js` imports it and substitutes at the equations load seam (mutating the loaded `equations` object — every emit site inherits it). `cnxml-fidelity-check.js` imports the *same* `substituteMathLabels`, runs it on the source math, and compares to the on-disk translated math (F8, warn-only until WS5).

**Tech Stack:** Node.js 22 ESM, Vitest, `@xmldom/xmldom` (via the existing `collectMathTokens`).

## Global Constraints

- **Vanilla JS ES modules.** `npm test` from the **repo root** is the authoritative gate (no branch protection).
- **Resolution precedence (locked, from `docs/superpowers/specs/2026-07-05-math-label-overlay-model-design.md`):** overlay-Icelandic → self-map = English STOP → pending (empty/absent) → glossary-approved-term-else-English.
- **Glossary lookup MUST filter** `status === 'approved'` **and** non-empty `icelandic` — the glossary has ~330 empty-Icelandic terms; an unfiltered lookup would substitute a blank.
- **Whole-node exact match, never substring** — `<m:mtext>14.82 g carbon</m:mtext>` must stay untouched; only a bare `<m:mtext>carbon</m:mtext>` is replaced.
- **Byte-minimal:** regex mutation only. No DOM re-serialization of equations (it reflows attrs/whitespace and breaks source parity that F8 + OpenStax-remerge depend on).
- **OV-M2:** charset-assert every substituted value at emit (no `< > & " '`), self-maps included — fail loud.
- **F8 = warn-only:** never affects the fidelity-check exit code (mirror the existing `orderMismatchModules` order check).
- **Do NOT fill the 7 pending labels** (`con`/`dep`/`eff`/`ele`/`frz`/`sub`/`tet`) — pending→English is designed behavior.
- One PR off `main`.

---

### Task 1: Pure substitution lib + resolution + report

**Files:**
- Create: `tools/lib/math-label-substitute.js`
- Test: `tools/__tests__/math-label-substitute.test.js`
- Modify: `tools/lib/math-label-inventory.js` (OV-M1: reword stale help text in `renderReport`)

**Interfaces:**
- Consumes: `collectMathTokens`, `bucketToken` from `./math-label-inventory.js`.
- Produces:
  - `buildGlossaryMap(glossary) → Map<englishLower, icelandic>`
  - `resolveLabel(label, { overlay, glossaryMap }) → { value: string, source: 'overlay-translated'|'overlay-self'|'glossary'|'english' }`
  - `buildResolver({ overlay, glossaryMap }) → (label) => resolveResult`
  - `substituteMathLabels(mathml, resolve) → string` (throws on forbidden charset in a value — OV-M2)
  - `reportMathLabels(cnxml, resolve, { overlay }) → { unmapped: string[], longSubscriptFills: Array<{token,value,cp}> }`
  - `loadMathLabelResolver(bookDir) → { resolve, overlay, glossaryMap }`

- [ ] **Step 1: Write the failing tests**

```javascript
// tools/__tests__/math-label-substitute.test.js
import { describe, it, expect } from 'vitest';
import {
  buildGlossaryMap,
  resolveLabel,
  buildResolver,
  substituteMathLabels,
  reportMathLabels,
} from '../lib/math-label-substitute.js';

describe('buildGlossaryMap', () => {
  it('keeps only approved terms with non-empty Icelandic, keyed lowercase', () => {
    const g = {
      terms: [
        { english: 'Rate', icelandic: 'hraði', status: 'approved' },
        { english: 'sub', icelandic: '', status: 'approved' }, // empty → dropped
        { english: 'cell', icelandic: 'ker', status: 'pending' }, // not approved → dropped
      ],
    };
    const m = buildGlossaryMap(g);
    expect(m.get('rate')).toBe('hraði');
    expect(m.has('sub')).toBe(false);
    expect(m.has('cell')).toBe(false);
  });
});

describe('resolveLabel precedence', () => {
  const glossaryMap = new Map([['dep', 'útfelling']]);
  it('overlay Icelandic wins', () => {
    expect(resolveLabel('rate', { overlay: { rate: 'hraði' }, glossaryMap }))
      .toEqual({ value: 'hraði', source: 'overlay-translated' });
  });
  it('self-map → English, STOP (no glossary)', () => {
    expect(resolveLabel('ppm', { overlay: { ppm: 'ppm' }, glossaryMap }))
      .toEqual({ value: 'ppm', source: 'overlay-self' });
  });
  it('pending (empty) falls through to an approved glossary term', () => {
    expect(resolveLabel('dep', { overlay: { dep: '' }, glossaryMap }))
      .toEqual({ value: 'útfelling', source: 'glossary' });
  });
  it('pending with no glossary term keeps English', () => {
    expect(resolveLabel('tet', { overlay: { tet: '' }, glossaryMap }))
      .toEqual({ value: 'tet', source: 'english' });
  });
  it('absent key behaves as pending', () => {
    expect(resolveLabel('zzz', { overlay: {}, glossaryMap }))
      .toEqual({ value: 'zzz', source: 'english' });
  });
});

describe('substituteMathLabels', () => {
  const resolve = buildResolver({ overlay: { rate: 'hraði', ppm: 'ppm' }, glossaryMap: new Map() });
  it('replaces a bare exact-match label', () => {
    expect(substituteMathLabels('<m:mi>rate</m:mi>', resolve)).toBe('<m:mi>hraði</m:mi>');
  });
  it('leaves a multi-word phrase untouched (whole-node, not substring)', () => {
    const s = '<m:mtext>14.82 g carbon</m:mtext>';
    expect(substituteMathLabels(s, resolve)).toBe(s);
  });
  it('leaves a self-map/English label byte-identical', () => {
    expect(substituteMathLabels('<m:mtext>ppm</m:mtext>', resolve)).toBe('<m:mtext>ppm</m:mtext>');
  });
  it('does not match a node containing child elements', () => {
    const s = '<m:mtext><m:mi>rate</m:mi></m:mtext>';
    // inner has "<" so the outer node is not matched; the inner m:mi still is
    expect(substituteMathLabels(s, resolve)).toBe('<m:mtext><m:mi>hraði</m:mi></m:mtext>');
  });
  it('preserves surrounding whitespace inside the node', () => {
    expect(substituteMathLabels('<m:mtext>  rate  </m:mtext>', resolve)).toBe('<m:mtext>  hraði  </m:mtext>');
  });
  it('throws (OV-M2) if a resolved value carries a forbidden XML char', () => {
    const bad = buildResolver({ overlay: { rate: 'a<b' }, glossaryMap: new Map() });
    expect(() => substituteMathLabels('<m:mi>rate</m:mi>', bad)).toThrow(/forbidden/);
  });
});

describe('reportMathLabels', () => {
  it('flags a bucket-1 label absent from the overlay as unmapped', () => {
    const resolve = buildResolver({ overlay: {}, glossaryMap: new Map() });
    const r = reportMathLabels('<m:math><m:mi>newlabel</m:mi></m:math>', resolve, { overlay: {} });
    expect(r.unmapped).toContain('newlabel');
  });
  it('advises when a glossary fill exceeds 6 chars in a subscript slot', () => {
    const overlay = { surr: '' };
    const glossaryMap = new Map([['surr', 'umhverfi']]); // 8 chars
    const resolve = buildResolver({ overlay, glossaryMap });
    const cnxml = '<m:math><m:msub><m:mi>q</m:mi><m:mtext>surr</m:mtext></m:msub></m:math>';
    const r = reportMathLabels(cnxml, resolve, { overlay });
    expect(r.longSubscriptFills).toEqual([{ token: 'surr', value: 'umhverfi', cp: 8 }]);
  });
  it('does not advise for a glossary fill in a non-subscript (inline) slot', () => {
    const overlay = { surr: '' };
    const glossaryMap = new Map([['surr', 'umhverfi']]);
    const resolve = buildResolver({ overlay, glossaryMap });
    const cnxml = '<m:math><m:mtext>surr</m:mtext></m:math>';
    const r = reportMathLabels(cnxml, resolve, { overlay });
    expect(r.longSubscriptFills).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tools/__tests__/math-label-substitute.test.js`
Expected: FAIL — `Failed to resolve import "../lib/math-label-substitute.js"`.

- [ ] **Step 3: Write the lib**

```javascript
// tools/lib/math-label-substitute.js
import fs from 'fs';
import path from 'path';
import { collectMathTokens, bucketToken } from './math-label-inventory.js';

const FORBIDDEN_XML = /[<>&"']/;

/**
 * Build a lowercase-English → Icelandic map from the unified glossary, keeping
 * only approved terms with a non-empty Icelandic (the ~330 empty-Icelandic terms
 * must never substitute a blank).
 * @param {{terms?: Array<{english?:string,icelandic?:string,status?:string}>}} glossary
 * @returns {Map<string,string>}
 */
export function buildGlossaryMap(glossary) {
  const map = new Map();
  const terms = glossary && Array.isArray(glossary.terms) ? glossary.terms : [];
  for (const t of terms) {
    if (t.status !== 'approved') continue;
    const en = (t.english || '').trim().toLowerCase();
    const is = (t.icelandic || '').trim();
    if (en && is) map.set(en, is);
  }
  return map;
}

/**
 * Resolve one label to its rendered value per the locked precedence.
 * @param {string} label
 * @param {{overlay?:Record<string,string>, glossaryMap?:Map<string,string>}} ctx
 * @returns {{value:string, source:'overlay-translated'|'overlay-self'|'glossary'|'english'}}
 */
export function resolveLabel(label, { overlay = {}, glossaryMap = new Map() } = {}) {
  const ov = overlay[label];
  if (typeof ov === 'string' && ov.length > 0) {
    return ov === label
      ? { value: label, source: 'overlay-self' }
      : { value: ov, source: 'overlay-translated' };
  }
  const g = glossaryMap.get(label);
  if (typeof g === 'string' && g.trim()) return { value: g, source: 'glossary' };
  return { value: label, source: 'english' };
}

/** Curry a resolver over a fixed overlay + glossary. */
export function buildResolver({ overlay = {}, glossaryMap = new Map() } = {}) {
  return (label) => resolveLabel(label, { overlay, glossaryMap });
}

// Matches a leaf <m:mtext>/<m:mi> node: open tag (with any attrs) + text with no
// child elements ([^<]*) + close tag. Nodes containing child elements never match.
const LEAF_MATH_TOKEN = /(<m:m(?:text|i)\b[^>]*>)([^<]*)(<\/m:m(?:text|i)>)/g;

/**
 * Byte-minimal substitution of exact-match English math labels → resolved value.
 * Only replaces when the trimmed node text exactly equals a label that resolves
 * to something other than itself; preserves surrounding whitespace and all other
 * bytes. Throws (OV-M2) if a resolved value carries a forbidden XML char.
 * @param {string} mathml
 * @param {(label:string)=>{value:string,source:string}} resolve
 * @returns {string}
 */
export function substituteMathLabels(mathml, resolve) {
  if (typeof mathml !== 'string') return mathml;
  return mathml.replace(LEAF_MATH_TOKEN, (full, open, inner, close) => {
    const trimmed = inner.trim();
    if (!trimmed) return full;
    const { value } = resolve(trimmed);
    if (value === trimmed) return full;
    if (FORBIDDEN_XML.test(value)) {
      throw new Error(
        `math-label substitution: value "${value}" for "${trimmed}" contains a forbidden XML character`
      );
    }
    return open + inner.replace(trimmed, value) + close;
  });
}

/**
 * Analysis pass (read-only): find bucket-1 labels absent from the overlay
 * (unmapped) and glossary fills that exceed 6 chars in a subscript slot.
 * @param {string} cnxml
 * @param {(label:string)=>{value:string,source:string}} resolve
 * @param {{overlay?:Record<string,string>}} opts
 * @returns {{unmapped:string[], longSubscriptFills:Array<{token:string,value:string,cp:number}>}}
 */
export function reportMathLabels(cnxml, resolve, { overlay = {} } = {}) {
  const agg = new Map(); // token -> { script:boolean }
  for (const { text, position } of collectMathTokens(cnxml)) {
    if (bucketToken(text) !== 'label') continue;
    if (!agg.has(text)) agg.set(text, { script: false });
    if (position === 'script') agg.get(text).script = true;
  }
  const unmapped = [];
  const longSubscriptFills = [];
  for (const [token, info] of agg) {
    if (!Object.prototype.hasOwnProperty.call(overlay, token)) {
      unmapped.push(token);
      continue;
    }
    const r = resolve(token);
    const cp = [...r.value].length;
    if (r.source === 'glossary' && info.script && cp > 6) {
      longSubscriptFills.push({ token, value: r.value, cp });
    }
  }
  return { unmapped, longSubscriptFills };
}

/**
 * Load a book's overlay + glossary and build the resolver. Reads
 * <bookDir>/math-label-map.json and <bookDir>/glossary/glossary-unified.json;
 * missing files degrade to empty (pending → English).
 * @param {string} bookDir  e.g. "books/efnafraedi-2e"
 * @returns {{resolve:Function, overlay:Record<string,string>, glossaryMap:Map<string,string>}}
 */
export function loadMathLabelResolver(bookDir) {
  const overlayPath = path.join(bookDir, 'math-label-map.json');
  const glossaryPath = path.join(bookDir, 'glossary', 'glossary-unified.json');
  const overlay = fs.existsSync(overlayPath)
    ? JSON.parse(fs.readFileSync(overlayPath, 'utf8'))
    : {};
  const glossary = fs.existsSync(glossaryPath)
    ? JSON.parse(fs.readFileSync(glossaryPath, 'utf8'))
    : { terms: [] };
  const glossaryMap = buildGlossaryMap(glossary);
  return { resolve: buildResolver({ overlay, glossaryMap }), overlay, glossaryMap };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tools/__tests__/math-label-substitute.test.js`
Expected: PASS (all cases).

- [ ] **Step 5: OV-M1 — reword the stale help text in `renderReport`**

In `tools/lib/math-label-inventory.js`, the `renderReport` value-rules block (lines ~264-268) still describes the old model (blank-deletes / ≤6-mandatory). Replace those pushed lines:

```javascript
  lines.push('**Value rules:** no `< > & " \'` (hard) · Icelandic letters ok.');
  lines.push('Leave **blank** to keep a label pending (renders English now; auto-upgrades');
  lines.push('when the glossary gains an approved term). To keep a label English *permanently*');
  lines.push('(international units like `ppm`/`psi`), self-map it to itself (e.g. `ppm` → `ppm`).');
  lines.push('**Length:** subscript labels > 6 characters get an advisory warning (not a failure);');
  lines.push('inline content-words have no length cap.');
```

- [ ] **Step 6: Run the inventory test to confirm no regression**

Run: `npx vitest run tools/__tests__/math-label-inventory.test.js`
Expected: PASS (if a test asserts old help text verbatim, update it to match the new lines).

- [ ] **Step 7: Commit**

```bash
git add tools/lib/math-label-substitute.js tools/__tests__/math-label-substitute.test.js tools/lib/math-label-inventory.js tools/__tests__/math-label-inventory.test.js
git commit -m "feat(ws4): math-label resolver + byte-minimal substitution lib [WS4]

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Wire substitution into inject at the equations load seam

**Files:**
- Modify: `tools/cnxml-inject.js` (import; add `getMathLabelResolver` cache + `applyMathLabelSubstitution`; wire at the load seam ~line 3520; export `applyMathLabelSubstitution`)
- Test: `tools/__tests__/cnxml-inject-math-labels.test.js`

**Interfaces:**
- Consumes: `loadMathLabelResolver`, `substituteMathLabels`, `reportMathLabels` from `./lib/math-label-substitute.js`; module-level `BOOKS_DIR`.
- Produces: `applyMathLabelSubstitution(equations, resolve) → { modulesSubstituted: number }` (mutates `eq.mathml` in place).

- [ ] **Step 1: Write the failing test**

```javascript
// tools/__tests__/cnxml-inject-math-labels.test.js
import { describe, it, expect } from 'vitest';
import { applyMathLabelSubstitution } from '../cnxml-inject.js';
import { buildResolver } from '../lib/math-label-substitute.js';

describe('applyMathLabelSubstitution', () => {
  const resolve = buildResolver({ overlay: { rate: 'hraði' }, glossaryMap: new Map() });

  it('mutates eq.mathml in place and counts changed equations', () => {
    const equations = {
      'math-1': { mathml: '<m:math><m:mi>rate</m:mi></m:math>' },
      'math-2': { mathml: '<m:math><m:mtext>14.82 g carbon</m:mtext></m:math>' },
    };
    const report = applyMathLabelSubstitution(equations, resolve);
    expect(equations['math-1'].mathml).toBe('<m:math><m:mi>hraði</m:mi></m:math>');
    expect(equations['math-2'].mathml).toBe('<m:math><m:mtext>14.82 g carbon</m:mtext></m:math>');
    expect(report.modulesSubstituted).toBe(1);
  });

  it('tolerates equations without a mathml string', () => {
    const equations = { 'math-1': {}, 'math-2': null };
    expect(() => applyMathLabelSubstitution(equations, resolve)).not.toThrow();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tools/__tests__/cnxml-inject-math-labels.test.js`
Expected: FAIL — `applyMathLabelSubstitution` is not exported.

- [ ] **Step 3: Add the import (top of `tools/cnxml-inject.js`, with the other `./lib/` imports)**

```javascript
import {
  loadMathLabelResolver,
  substituteMathLabels,
  reportMathLabels,
} from './lib/math-label-substitute.js';
```

- [ ] **Step 4: Add the per-book resolver cache + `applyMathLabelSubstitution` (near the other module-level helpers, above `main`)**

```javascript
// WS4 item 5 — math-label substitution. Resolver (overlay + glossary) is per-book;
// cache it so a whole-book inject run builds it once.
const _mathLabelResolverCache = new Map();
function getMathLabelResolver(bookDir) {
  if (!_mathLabelResolverCache.has(bookDir)) {
    _mathLabelResolverCache.set(bookDir, loadMathLabelResolver(bookDir));
  }
  return _mathLabelResolverCache.get(bookDir);
}

/**
 * Substitute English math labels → Icelandic across a loaded equations object,
 * mutating each eq.mathml in place. Byte-minimal (see substituteMathLabels).
 * @param {Record<string,{mathml?:string}>} equations
 * @param {(label:string)=>{value:string,source:string}} resolve
 * @returns {{modulesSubstituted:number}}
 */
export function applyMathLabelSubstitution(equations, resolve) {
  let modulesSubstituted = 0;
  for (const eq of Object.values(equations)) {
    if (eq && typeof eq.mathml === 'string') {
      const before = eq.mathml;
      eq.mathml = substituteMathLabels(eq.mathml, resolve);
      if (eq.mathml !== before) modulesSubstituted += 1;
    }
  }
  return { modulesSubstituted };
}
```

- [ ] **Step 5: Wire at the equations load seam**

In the module-inject function, immediately after:

```javascript
  const equations = fs.existsSync(eqPath) ? JSON.parse(fs.readFileSync(eqPath, 'utf-8')) : {};
```

insert:

```javascript
  // WS4 item 5: substitute English math labels before any emit site reads eq.mathml.
  const { resolve: resolveMathLabel, overlay: mathLabelOverlay } = getMathLabelResolver(BOOKS_DIR);
  const mathLabelReport = reportMathLabels(
    Object.values(equations)
      .map((e) => e && e.mathml)
      .filter(Boolean)
      .join('\n'),
    resolveMathLabel,
    { overlay: mathLabelOverlay }
  );
  if (mathLabelReport.unmapped.length) {
    console.error(
      `  ⚠ ${moduleId}: ${mathLabelReport.unmapped.length} unmapped math label(s): ${mathLabelReport.unmapped.join(', ')}`
    );
  }
  for (const a of mathLabelReport.longSubscriptFills) {
    console.error(
      `  ⚠ ${moduleId}: glossary term "${a.value}" is ${a.cp} chars in a subscript (label "${a.token}") — consider a compact overlay override`
    );
  }
  applyMathLabelSubstitution(equations, resolveMathLabel);
```

(If the enclosing function's module-id variable is not named `moduleId`, use whatever it is named — it is in scope at the load seam per `tools/cnxml-inject.js:3519`.)

- [ ] **Step 6: Add `applyMathLabelSubstitution` to the module's export block**

In the `export { ... }` block at the bottom of `tools/cnxml-inject.js`, add `applyMathLabelSubstitution,`.

- [ ] **Step 7: Run the test to verify it passes**

Run: `npx vitest run tools/__tests__/cnxml-inject-math-labels.test.js`
Expected: PASS.

- [ ] **Step 8: Smoke-test a real inject and confirm Icelandic math labels appear**

Run:
```bash
node tools/cnxml-inject.js efnafraedi-2e 5 2>/dev/null
grep -l "m:mtext>hraði\|m:mtext>umhv\|m:mi>kerfi" books/efnafraedi-2e/03-translated/mt-preview/ch05/*.cnxml | head
```
Expected: at least one file listed (a real substitution happened). `git checkout` the touched `03-translated/` files afterward — **this task does not commit content bytes** (those land in WS5).

```bash
git checkout books/efnafraedi-2e/03-translated/
```

- [ ] **Step 9: Commit (code only)**

```bash
git add tools/cnxml-inject.js tools/__tests__/cnxml-inject-math-labels.test.js
git commit -m "feat(ws4): substitute math labels at inject load seam + unmapped/advisory report [WS4]

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: F8 — math-content check in the fidelity checker (warn-only)

**Files:**
- Modify: `tools/cnxml-fidelity-check.js` (import `loadMathLabelResolver` + `substituteMathLabels`; add + export `extractMathBlocks` and `compareMathBlocks`; load resolver in `main`; per-module warn + summary line)
- Test: `tools/__tests__/cnxml-fidelity-math-blocks.test.js`

**Interfaces:**
- Consumes: `loadMathLabelResolver`, `substituteMathLabels` from `./lib/math-label-substitute.js`.
- Produces:
  - `extractMathBlocks(cnxml) → string[]`
  - `compareMathBlocks(sourceCnxml, translatedCnxml, resolve) → { ok:boolean, mismatched:number, sourceBlocks:number, translatedBlocks:number }`

- [ ] **Step 1: Write the failing test**

```javascript
// tools/__tests__/cnxml-fidelity-math-blocks.test.js
import { describe, it, expect } from 'vitest';
import { extractMathBlocks, compareMathBlocks } from '../cnxml-fidelity-check.js';
import { buildResolver } from '../lib/math-label-substitute.js';

const resolve = buildResolver({ overlay: { rate: 'hraði' }, glossaryMap: new Map() });

describe('extractMathBlocks', () => {
  it('returns each <m:math> block in document order', () => {
    const cnxml = '<p><m:math><m:mi>a</m:mi></m:math> x <m:math><m:mi>b</m:mi></m:math></p>';
    expect(extractMathBlocks(cnxml)).toEqual([
      '<m:math><m:mi>a</m:mi></m:math>',
      '<m:math><m:mi>b</m:mi></m:math>',
    ]);
  });
});

describe('compareMathBlocks', () => {
  it('matches when translated == substituted source', () => {
    const source = '<m:math><m:mi>rate</m:mi></m:math>';
    const translated = '<m:math><m:mi>hraði</m:mi></m:math>';
    const r = compareMathBlocks(source, translated, resolve);
    expect(r.ok).toBe(true);
    expect(r.mismatched).toBe(0);
  });
  it('flags a corrupted translated block', () => {
    const source = '<m:math><m:mrow><m:mi>rate</m:mi></m:mrow></m:math>';
    const translated = '<m:math><m:mi>hraði</m:mi></m:math>'; // lost <m:mrow>
    expect(compareMathBlocks(source, translated, resolve).ok).toBe(false);
  });
  it('flags a stale (still-English) translated block — the pre-WS5 warn case', () => {
    const source = '<m:math><m:mi>rate</m:mi></m:math>';
    const translated = '<m:math><m:mi>rate</m:mi></m:math>'; // never re-injected
    expect(compareMathBlocks(source, translated, resolve).ok).toBe(false);
  });
  it('flags a block-count mismatch', () => {
    const source = '<m:math><m:mi>a</m:mi></m:math><m:math><m:mi>b</m:mi></m:math>';
    const translated = '<m:math><m:mi>a</m:mi></m:math>';
    expect(compareMathBlocks(source, translated, resolve).mismatched).toBe(1);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tools/__tests__/cnxml-fidelity-math-blocks.test.js`
Expected: FAIL — `extractMathBlocks`/`compareMathBlocks` not exported.

- [ ] **Step 3: Add the import to `tools/cnxml-fidelity-check.js`**

Below the existing `import { loadAllowlist, classifyDiff } ...` line:

```javascript
import { loadMathLabelResolver, substituteMathLabels } from './lib/math-label-substitute.js';
```

- [ ] **Step 4: Add the two exported functions (near `compareElementOrder`)**

```javascript
/**
 * Every <m:math>…</m:math> block in document order (verbatim substrings).
 * @param {string} cnxml
 * @returns {string[]}
 */
export function extractMathBlocks(cnxml) {
  return cnxml.match(/<m:math[\s\S]*?<\/m:math>/g) || [];
}

/**
 * F8 (warn-only): does substitute(source math) equal the translated math on disk?
 * Runs the SAME substitution on the source side so intended label substitutions
 * cancel; any other difference (corruption, or stale/never-re-injected math) is a
 * mismatch. A block-count difference counts each unpaired block as a mismatch.
 * @param {string} sourceCnxml
 * @param {string} translatedCnxml
 * @param {(label:string)=>{value:string,source:string}} resolve
 * @returns {{ok:boolean, mismatched:number, sourceBlocks:number, translatedBlocks:number}}
 */
export function compareMathBlocks(sourceCnxml, translatedCnxml, resolve) {
  const src = extractMathBlocks(sourceCnxml).map((b) => substituteMathLabels(b, resolve));
  const trans = extractMathBlocks(translatedCnxml);
  let mismatched = 0;
  const n = Math.max(src.length, trans.length);
  for (let i = 0; i < n; i++) {
    if (src[i] !== trans[i]) mismatched += 1;
  }
  return { ok: mismatched === 0, mismatched, sourceBlocks: src.length, translatedBlocks: trans.length };
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run tools/__tests__/cnxml-fidelity-math-blocks.test.js`
Expected: PASS.

- [ ] **Step 6: Wire into `main()` — warn-only, mirroring the order check**

After `const allowlist = loadAllowlist(BOOKS_DIR);`:

```javascript
  const { resolve: mathResolve } = loadMathLabelResolver(BOOKS_DIR);
```

Next to `const orderMismatchModules = [];`:

```javascript
  const mathMismatchModules = []; // F8: warn-only, never affects exit code (pre-WS5 noise)
```

Right after the order-check block (after its closing `}` at ~line 309), inside the module loop:

```javascript
      // F8: math-content check (warn-only until WS5 re-inject; committed 03-translated
      // is stale English pre-WS5, so mismatches are expected noise until then).
      const mathCmp = compareMathBlocks(sourceCnxml, translatedCnxml, mathResolve);
      if (!mathCmp.ok) {
        mathMismatchModules.push(mod.moduleId);
        console.log(
          `  MATH [warn-only]: ${mod.moduleId} — ${mathCmp.mismatched} math block(s) differ from substituted source`
        );
      }
```

In the summary block (after the order-check summary line):

```javascript
  console.log(
    `Math check (warn-only): ${mathMismatchModules.length} module(s) with math differing from substituted source`
  );
```

Leave the exit line unchanged — F8 must not affect it.

- [ ] **Step 7: Run the fidelity-check test suite**

Run: `npx vitest run tools/__tests__/cnxml-fidelity-check.test.js tools/__tests__/cnxml-fidelity-math-blocks.test.js`
Expected: PASS (existing tests unaffected; F8 tests green).

- [ ] **Step 8: Confirm F8 is warn-only on a real run (exit 0 despite math warnings)**

Run:
```bash
node tools/cnxml-fidelity-check.js --book efnafraedi-2e --chapter 5; echo "exit=$?"
```
Expected: `MATH [warn-only]` lines appear (committed math is stale English), the summary shows the math-check count, and `exit=0`.

- [ ] **Step 9: Commit**

```bash
git add tools/cnxml-fidelity-check.js tools/__tests__/cnxml-fidelity-math-blocks.test.js
git commit -m "feat(ws4): F8 math-content check in fidelity checker (warn-only until WS5) [WS4]

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Full-suite gate + PR

**Files:** none (verification).

- [ ] **Step 1: Run the whole suite from the repo root**

Run: `npm test`
Expected: all green (the authoritative gate — no branch protection).

- [ ] **Step 2: Confirm the working tree has no stray content bytes**

Run: `git status --porcelain books/`
Expected: empty (no `03-translated/` or other content changes committed — those land in WS5).

- [ ] **Step 3: Push and open the PR**

```bash
git push -u origin feat/chem-ws4-item5-substitution-f8
gh pr create --title "feat(ws4): math-label substitution at inject + F8 math-content check [WS4]" --body "$(cat <<'EOF'
## Summary
- New pure lib `tools/lib/math-label-substitute.js` — resolver (overlay→self-map→glossary→English) + byte-minimal regex substitution + report pass.
- `cnxml-inject.js` substitutes English math labels → Icelandic at the equations load seam (all emit sites inherit it); emits unmapped + subscript-length advisories. Code only — content bytes land in WS5.
- `cnxml-fidelity-check.js` gains F8: `substitute(source) === translated`, per math block, **warn-only until WS5** (mirrors the order check).
- OV-M1 (stale help text reworded) + OV-M2 (charset-assert at emit).

## Not in scope
Filling the 7 pending labels; the F8 hard-gate flip; WS5 re-render/sync.

Spec: `docs/superpowers/specs/2026-07-05-ws4-substitution-f8-design.md`
Plan: `docs/superpowers/plans/2026-07-05-ws4-substitution-f8.md`

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Self-Review

**Spec coverage:**
- Shared lib, two importers → Task 1 (lib) + Task 2 (inject importer) + Task 3 (fidelity importer). ✓
- Resolution precedence → `resolveLabel` (Task 1), tested all four states. ✓
- Glossary filter (approved + non-empty) → `buildGlossaryMap` (Task 1), tested. ✓
- Byte-minimal whole-node regex → `substituteMathLabels` (Task 1), tested incl. the `14.82 g carbon` case. ✓
- Subscript-length advisory + loud unmapped report → `reportMathLabels` (Task 1) wired in Task 2. ✓
- OV-M2 charset assert → in `substituteMathLabels`, tested. ✓
- OV-M1 help-text reword → Task 1 Step 5. ✓
- F8 = substitute-both-sides, per block, warn-only → `compareMathBlocks` + Task 3 wiring, tested incl. stale/corrupt/count cases + exit-0 smoke. ✓
- Don't fill 7 pending labels → Global Constraints; no task touches the map. ✓
- No content bytes committed → Task 2 Step 8 + Task 4 Step 2. ✓

**Placeholder scan:** none — every code step shows complete code.

**Type consistency:** `resolve` return `{value, source}` is consistent across `resolveLabel`/`buildResolver`/`substituteMathLabels`/`reportMathLabels`/`compareMathBlocks`. `loadMathLabelResolver` returns `{resolve, overlay, glossaryMap}` used consistently in Tasks 2 and 3. `applyMathLabelSubstitution(equations, resolve)` signature matches its test.
