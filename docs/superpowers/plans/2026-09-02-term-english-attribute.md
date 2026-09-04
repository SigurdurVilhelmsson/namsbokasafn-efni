# Term English Attribute Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

---

## 🔴 AMENDMENTS — 2026-09-03, MEASURED. READ BEFORE ANY TASK.

⚠️ **ANCHOR ON FUNCTION NAMES, NOT ON `tools/cnxml-render.js` LINE NUMBERS — EVERY ONE BELOW
IS ALREADY STALE BY ~+70.** A parallel session's figure-review work inserts ~117 lines above
`renderGlossary` in that file (`renderGlossary` 2047 → 2117 once it merges), so any citation
here or in the original task text drifts the moment this branch rebases. Line numbers are kept
below only as a *hint about where to start looking*; the function name is the identifier.
`tools/lib/cnxml-elements.js` is untouched by that work, so its numbers are stable.

**Tasks 1 and 2 are DONE and shipped** (`b0abe8d8`, `cd615b9c`, `92f1ab81` on
`feat/term-english-data-attribute`). **Tasks 3–6 are NOT SAFE TO EXECUTE AS WRITTEN** —
each carries at least one premise that a 24-agent adversarial audit falsified against the
tree and could not refute on re-attack. Every item below was settled by execution, not by
reading. Fix the plan text before working the step, or you will write code that changes no
rendered byte and tests that pass while asserting nothing.

### Global — the Known-red baseline is dead, and so is its METHOD
- **"red on 60 tests / 18 files" is a pre-⑱ figure**, measured 10+ commits ago. The eight
  §C118 ⑱ red-clearing commits plus the two ruling commits (`5a01f2b7`, `58b0031e`) are all
  ancestors of HEAD; the plan was committed *before* them. The register's live figure is
  **19 assertions / 10 files, plus `findTermsGolden` as an 11th red FILE with zero failing
  assertions**.
- 🔴 **AND 60 WAS NEVER A TEST COUNT.** The plan's own cited source,
  `test-results/c118-53-goldens-classification-2026-09-01.json`, reads
  `totals: {files: 16, findings: 60, disputes: 59}` — **60 counts agent FINDINGS over 16
  files**. The plan transposed a counting unit and then used it as a gate.
- ▶ **Replace the criterion, not just the number.** A count is the wrong acceptance test:
  capture the failing-test-NAME set on this branch before Task 3, **strip vitest's per-run
  `NNms` suffix** (it invented 18 false "newly red" entries on 2026-09-02), then assert
  set-equality in BOTH directions, with a planted row proving the comparator fires. A
  `beforeAll` timeout converts a file's assertions to SKIPS, so a real red can go *missing*
  rather than appear.

### Task 1 — CORRECTED AND SHIPPED, but the reason matters for Task 2 onward
- 🔴 **Step 5's rewire was NOT behaviour-identical: it silently folded MathML case.**
  `stripTermMarkersToText` lowercases **before** substituting MathML, so symbols escape the
  fold; routing it through a single `flattenMarkersToText` folds them too. Measured with the
  real equations maps: **6 real inputs** — `ΔHf° → δhf°`, `ΔGf° → δgf°`, `Eker° → eker°`.
  Both call sites **write** this into output CNXML as `(e. …)`, and the affected glosses are
  in **published HTML today** (`05-publication/mt-preview/chapters/05/5-key-terms.html`,
  `.../17/17-key-terms.html`).
- ⚠️ **The invariant was already written down** — in `stripTermMarkersToText`'s own docstring,
  naming it "the m68852 invariant" and spelling out *"ΔHf° must not become δhf°"*. The plan
  was written against that code anyway. **A comment stating a rule is not the rule.**
- ⚠️ **Step 6's remedy text would have shipped the bug.** The whitespace half of the change
  breaks three *committed* assertions (`cnxml-inject.test.js:2086/:2089/:2095`), so the suite
  goes red — but for the whitespace reason only, and Step 6 says *"differs … in a way beyond
  case; diff the two functions and fix"*. Fixing the whitespace turns Step 6 green and ships
  `δhf°`: **no existing test covered the case invariant**, because its MathML fixture is the
  already-lowercase `x`.
- ✅ Shipped fix: three primitives (`stripInlineMarkers` / `resolveMathPlaceholders` /
  `flattenMarkersToText`), wrapper composes strip → lowercase → resolve. Verified by value
  over **82,979 real call-site inputs, 0 divergences**, with a control that catches the
  plan's version.

### Task 3 — TWO BLOCKING ERRORS
- 🔴 **"Site 1", `renderTerm` (`cnxml-elements.js:646`), IS DEAD CODE — zero callers anywhere
  in the repo.** Patching it changes no rendered byte, and Step 1's tests import it
  *directly*, so they would go green while asserting on an unreachable function. Control: the
  same search finds `renderGlossary`'s call site, so the instrument works.
- 🔴 **Step 6's own verification command returns EMPTY and the plan has no branch for that.**
  There is no `const BOOKS_DIR`. It is `let BOOKS_DIR = DEFAULT_BOOKS_DIR` (`:149`) where
  `const DEFAULT_BOOKS_DIR = 'books/efnafraedi-2e'` (`:148`) — a **bare relative literal**,
  reassigned only inside `main()`. A worker following the text literally proceeds with a
  cwd-relative path, violating the plan's own Global Constraint.
- 🔴 **And the server never calls `main()`.** It calls `renderCnxmlToHtml` **in-process** for
  the editor's live preview with `cwd=server/`, so `BOOKS_DIR` stays at its relative default
  and `loadTermEnglish` would read `server/books/efnafraedi-2e/02-structure/…` — a miss for
  every book, **silently swallowed by the plan's own bare `catch { return {map:{}} }`**, exit
  0, no `data-en`. For a non-chemistry book it would also use the wrong slug.

### Task 4 — THE ARCHITECTURE IS WRONG, NOT THE STEPS
- 🔴 **A glossary definition's `<term>` NEVER reaches the id-less `<dfn>` branch, so Task 4 as
  written annotates 0 of the 763 in-definition terms.** Both glossary renderers strip the
  `<term>` tag *before* calling `processInlineContent` (`renderGlossary` matches
  `/<term>([\s\S]*?)<\/term>/` and passes `termMatch[1]`).
- 🔴 **There is a FOURTH `<dfn>`-bearing site the plan never names: `renderCompiledGlossary`
  (`cnxml-render.js:2511`, called at `:3798`)** — and it is the one that builds the chapter
  key-terms page, i.e. the page where these glosses are most visible.
- ▶ This is exactly what the spec warned about in its own §4.2: *"Site 3 is 46% of the corpus
  and is the one a plan omits … Do not treat this enumeration as complete."* **Re-derive the
  emit sites from the rendered output before writing Task 4.**

### Task 5 — THE GUARD CANNOT DETECT WHAT IT IS FOR
- 🔴 **Both sides of the proposed comparison hash the SAME immutable file.** Measured across
  the **14 committed manifest vintages of m68700**: `sourceHash` is byte-identical
  (`8b0d4d033c6a1cce`) in all 14, while `segmentCount` moves **282 → 312**. That 282→312 *is*
  an extraction-vintage shift, and the guard is silent on it.
- 🔴 **Its stated rationale is also false: extract does not MINT term ids.** It passes through
  the id already present in READ-ONLY `01-source` (`cnxml-extract.js:427`). Since `01-source`
  cannot change, a re-extraction cannot shift them.
- ▶ A vintage guard is still worth having — but it must compare something that actually moves
  between vintages (`segmentCount`, or the segment-id set), not `sourceHash`.

### Task 6 — FOUR OF SIX ASSERTIONS ARE UNREACHABLE
- 🔴 Chemistry ch03 renders **20 `<dfn>`**, so `toBeGreaterThan(30)` is false and
  `toBeGreaterThanOrEqual(32)` is unreachable — **32 counts `<term>` elements in CNXML
  (16 id-bearing + 16 id-less), not rendered `<dfn>`**. And `idLess.length > 0` is false:
  **0 id-less `<dfn>` exist** in that output, per the Task 4 finding above.

### Smaller, recorded so they are not re-derived
- ⚠️ **The "1,005 flattened glosses" figure (plan lines 73, 181, 377) reproduces under NO
  counting unit.** Over `05-publication/**/*.html`: 3,072 gloss occurrences · 1,401 distinct
  gloss strings · 2,113 distinct (file, gloss) pairs · 1,202 `<dfn>` elements carrying a
  gloss. **State the unit or drop the number.**
- ⚠️ **Key-space disjointness holds for the two live books but NOT corpus-wide** — 6 id values
  serve as both a `<term>` id and a `<definition>` id, all in `edlisfraedi-2e` (retired). The
  flat map is safe today; assert disjointness per module rather than assuming it globally.
- ⚠️ **Step 2's expected failure text is imprecise.** Vitest 4 does not fail at link time on a
  missing named export; the observed failure is a runtime `TypeError:
  buildManifestForTest is not a function`. Same outcome, different reason.
- ⚠️ **Read a math label through the REAL pipeline.** `applyMathLabelSubstitution` runs first,
  so the shipped value is the Icelandic `Eker°`, not the `Ecell°` a raw replay of
  `equations.json` reports. A probe that skips a pipeline stage reports plausible, wrong
  strings.

---

**Goal:** Emit each term's English as a `data-en` attribute on the rendered `<dfn>`, so the visible gloss becomes vefur's presentation decision instead of text spliced into the translation.

**Architecture:** `cnxml-extract.js` writes a per-module `termEnglish` map into the existing `02-structure/…-manifest.json`, keyed on the id the rendered CNXML exposes (an inline `<term id>`, or the parent `<definition id>` for glossary terms). `cnxml-render.js` threads that map through the `context` object it already builds and emits `data-en` at the three `<dfn>` call sites. No CNXML changes; no new artifact; no fuzzy matching.

**Tech Stack:** Node 22 ESM (`tools/` is `"type": "module"`), Vitest, `@xmldom/xmldom`.

**Spec:** [`docs/superpowers/specs/2026-09-01-term-english-attribute-design.md`](../specs/2026-09-01-term-english-attribute-design.md) — read it before Task 1; this plan argues from it.

## Domain primer (you have no context — read this)

This repo translates OpenStax textbooks into Icelandic. The pipeline is:

```
01-source/*.cnxml  →  extract  →  02-for-mt/*.en.md + 02-structure/*.json
                                        ↓ (paid machine translation)
                                  02-mt-output/*.is.md
                                        ↓ inject
                                  03-translated/*.cnxml
                                        ↓ render
                                  05-publication/*.html   →  sister repo (vefur) serves it
```

- **Segments** are units of translatable text delimited by `<!-- SEG:module:type:elementId -->` markers. **No space after the colon** — the spaced form parses to an empty list, silently.
- **Inline markers** are `[[type:payload]]`, e.g. `[[i:italic]]`, `[[term:mole|term-00002]]`. **They nest**, including two levels deep: `[[term:Avogadro's number ([[i:N[[sub:A]]]])|term-00003]]`.
- A `<term>` in CNXML renders to `<dfn class="term">` in HTML.

## Global Constraints

- **Node 22.x** — `.nvmrc` is the single source of truth. Run `npm test` from the **repo root**.
- **`tools/` and `scripts/` are ESM**; `server/` is CommonJS; `tools/lib/*.cjs` exists only for modules consumed by both. **This work is tools-only — do not create a `.cjs`.**
- **Test files import vitest with `import`**, never `require`. Copy the header style from `tools/__tests__/span-marker-roundtrip.test.js`.
- 🔴 **NEVER use a `[^\]]*`-style character class to find the end of a nested marker.** That is the exact defect (§C115, register ⑰) this work exists to stop reproducing. Use the depth-aware scanner from Task 1.
- 🔴 **`books/*/01-source/` is READ-ONLY.** Nothing in this plan writes there.
- **Use `grep -a` for every text search** — committed files in this repo contain raw NUL bytes, and plain `grep` silently reports nothing for strings such files demonstrably contain.
- **Resolve resource paths against `import.meta.url`, never `process.cwd()`.**
- CI runs `npm run lint` **and** `npm run format:check`. Run both before the final commit.

## Known-red baseline

The branch is **red on 60 tests / 18 files** before you start — corpus goldens and premise pins, classified in `test-results/c118-53-goldens-classification-2026-09-01.json` and register item ⑱. **That is expected.** Your acceptance is that the failing set does not *grow*: after each task, the red count must still be 60 and the red file set unchanged. Anything new is yours.

Capture the baseline once, before Task 1:

```bash
npm test > /tmp/baseline.log 2>&1; echo "EXIT=$?" >> /tmp/baseline.log
grep -aE "Test Files|Tests  " /tmp/baseline.log
```

---

## File Structure

| File | Responsibility |
|---|---|
| `tools/lib/term-text.js` *(create)* | Two pure functions: flatten marker text to plain text (**case-preserving**), and scan `[[term:…]]` markers **depth-aware**. No I/O. |
| `tools/__tests__/term-text.test.js` *(create)* | Unit tests for the above, including the two-level nesting that broke ⑰. |
| `tools/cnxml-inject.js` *(modify)* | `stripTermMarkersToText` re-implemented as a thin wrapper over the new lib so its two existing callers are byte-identical. |
| `tools/cnxml-extract.js` *(modify)* | `buildManifest` gains a `termEnglish` map. |
| `tools/__tests__/manifest-term-english.test.js` *(create)* | Both key shapes; disjointness; case preservation. |
| `tools/cnxml-render.js` *(modify)* | Loads the manifest, puts `termEnglish` on `context`, scopes `definitionId` in `renderGlossary`, reports annotated/skipped, warns on vintage mismatch. |
| `tools/lib/cnxml-elements.js` *(modify)* | Three `<dfn>` sites emit `data-en`. |
| `tools/__tests__/render-term-english.test.js` *(create)* | Per-site unit tests + the corpus reach test. |
| `docs/handoff/2026-09-02-vefur-term-english-contract.md` *(create)* | The written contract for the sister repo. |

---

## Task 1: A shared, case-preserving term-text library

**Why first:** `stripTermMarkersToText` currently lives in `tools/cnxml-inject.js:849` and **lowercases its output**. Extract cannot import from inject without coupling the two largest tools, and `data-en` must preserve case — the published corpus today shows 1,005 glosses with proper nouns flattened (`(e. avogadro's law)`, `(e. celsius (°c)`). This task extracts the reusable half and leaves the lowercasing at the one call site that needs it for comparison.

**Files:**
- Create: `tools/lib/term-text.js`
- Create: `tools/__tests__/term-text.test.js`
- Modify: `tools/cnxml-inject.js:849-871`

**Interfaces:**
- Produces: `flattenMarkersToText(text, equations) -> string` (case-preserving) and `scanTermMarkers(text) -> Array<{ body: string, id: string|null }>` (depth-aware). Task 2 consumes both.

- [ ] **Step 1: Write the failing test**

Create `tools/__tests__/term-text.test.js`:

```js
/**
 * term-text.js — the shared, case-preserving half of the old
 * stripTermMarkersToText, plus a depth-aware [[term:…]] scanner.
 *
 * 🔴 The nesting cases below are not hypothetical. `TERM_TEXT` in
 * cnxml-inject.js tolerates ONE level of nested markers while the corpus has
 * TWO, and a truncated match put a literal `[[term:` into published CNXML
 * (register ⑰). A `[^\]]*` character class cannot find the end of a nested
 * marker; only depth counting can.
 */
import { describe, it, expect } from 'vitest';
import { flattenMarkersToText, scanTermMarkers } from '../lib/term-text.js';

describe('flattenMarkersToText', () => {
  it('strips inline markers and PRESERVES case', () => {
    expect(flattenMarkersToText('Avogadro’s number ([[i:N[[sub:A]]]])', {})).toBe(
      'Avogadro’s number (NA)'
    );
  });

  it('leaves plain text untouched', () => {
    expect(flattenMarkersToText('formula mass', {})).toBe('formula mass');
  });

  it('unwraps an id-anchored marker to its display text', () => {
    expect(flattenMarkersToText('[[term:mole|term-00002]]', {})).toBe('mole');
  });

  it('resolves a MATH placeholder from the equations map', () => {
    const eq = { 'math-1': { mathml: '<m:mi>x</m:mi>' } };
    expect(flattenMarkersToText('value [[MATH:1]]', eq)).toBe('value x');
  });

  it('drops an unresolvable MATH placeholder rather than emitting the marker', () => {
    expect(flattenMarkersToText('value [[MATH:9]]', {})).toBe('value');
  });
});

describe('scanTermMarkers — depth aware', () => {
  it('finds a flat marker with its id', () => {
    expect(scanTermMarkers('a [[term:mole|term-00002]] b')).toEqual([
      { body: 'mole', id: 'term-00002' },
    ]);
  });

  it('🔴 finds a TWO-level nested marker without truncating — the ⑰ case', () => {
    expect(
      scanTermMarkers('as [[term:Avogadro’s number ([[i:N[[sub:A]]]])|term-00003]] or')
    ).toEqual([{ body: 'Avogadro’s number ([[i:N[[sub:A]]]])', id: 'term-00003' }]);
  });

  it('finds several markers in one segment', () => {
    const got = scanTermMarkers('[[term:mole|term-1]] and [[term:mass|term-2]]');
    expect(got.map((m) => m.id)).toEqual(['term-1', 'term-2']);
  });

  it('reports id null when the marker carries none', () => {
    expect(scanTermMarkers('[[term:mole]]')).toEqual([{ body: 'mole', id: null }]);
  });

  it('ignores non-term markers', () => {
    expect(scanTermMarkers('[[i:x]] [[sub:2]]')).toEqual([]);
  });

  it('CONTROL — a naive [^\\]]* regex truncates where the scanner does not', () => {
    const s = '[[term:Avogadro’s number ([[i:N[[sub:A]]]])|term-00003]]';
    const naive = /\[\[term:([^\]]*)\|([^\]]*)\]\]/.exec(s);
    expect(naive).toBeNull(); // the regex cannot match it at all
    expect(scanTermMarkers(s)[0].id).toBe('term-00003');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tools/__tests__/term-text.test.js`
Expected: FAIL — `Failed to load ../lib/term-text.js` (the module does not exist yet).

- [ ] **Step 3: Write the implementation**

Create `tools/lib/term-text.js`:

```js
/**
 * term-text.js — flattening and scanning for [[term:…]] marker text.
 *
 * Extracted from cnxml-inject.js's stripTermMarkersToText so that
 * cnxml-extract.js can use it without importing from cnxml-inject.js — a
 * dependency between the two largest tools in the pipeline.
 *
 * 🔴 TWO DELIBERATE DIFFERENCES FROM THE ORIGINAL:
 *  1. NO toLowerCase(). The original lowercased because its only consumers
 *     compared case-insensitively and displayed the result; that flattened
 *     proper nouns in 1,005 published glosses (`(e. avogadro’s law)`).
 *     `data-en` must preserve source case. The lowercasing now lives at the
 *     one call site that needs it.
 *  2. scanTermMarkers counts BRACKET DEPTH. A `[^\]]*` class stops at the
 *     first `]`, so it truncates a two-level nested marker — the defect that
 *     put a literal `[[term:` into published CNXML (register ⑰).
 */

/**
 * Flatten inline markers to plain text, preserving case.
 * @param {string} text - marker-bearing text
 * @param {Object} equations - `math-N` -> { mathml }
 * @returns {string} plain text
 */
export function flattenMarkersToText(text, equations = {}) {
  const out = String(text ?? '')
    .replace(/\[\[sup:([^\]]+)\]\]/g, '$1')
    .replace(/\[\[sub:([^\]]+)\]\]/g, '$1')
    .replace(/\[\[i:([^\]]+)\]\]/g, '$1')
    .replace(/\[\[b:([^\]]+)\]\]/g, '$1')
    .replace(/\{\{i\}\}([\s\S]*?)\{\{\/i\}\}/g, '$1')
    .replace(/\{\{b\}\}([\s\S]*?)\{\{\/b\}\}/g, '$1')
    // Unwrap id-anchored markers to their display text BEFORE the catch-all
    // below deletes unknown [[type:…]] markers wholesale.
    .replace(/\[\[(?:term|fn|em):([^\]|]*)\|[^\]]*\]\]/g, '$1')
    .replace(/\[\[(?:term|fn|u):([^\]]*)\]\]/g, '$1')
    .replace(/\[\[(?!MATH:)[A-Za-z][\w]*:[^\]]*\]\]/g, '');
  return out
    .replace(/\[\[MATH:(\d+)\]\]/g, (m, n) => {
      const eq = equations[`math-${n}`];
      if (!eq || !eq.mathml) return '';
      return eq.mathml
        .replace(/<[^>]+>/g, '')
        .replace(/\s+/g, ' ')
        .trim();
    })
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Find every `[[term:…]]` marker, depth-aware, returning body and id.
 * @param {string} text
 * @returns {Array<{body: string, id: string|null}>}
 */
export function scanTermMarkers(text) {
  const s = String(text ?? '');
  const out = [];
  let i = 0;
  while ((i = s.indexOf('[[term:', i)) >= 0) {
    let depth = 0;
    let j = i;
    for (; j < s.length; j++) {
      if (s.startsWith('[[', j)) {
        depth++;
        j++;
      } else if (s.startsWith(']]', j)) {
        depth--;
        j++;
        if (depth === 0) {
          j++;
          break;
        }
      }
    }
    const whole = s.slice(i, j); // `[[term:…]]`
    const inner = whole.slice('[[term:'.length, -2);
    // The id is the trailing `|<id>` at depth 0. Scan from the right, counting
    // depth, so a `|` inside a nested marker is not mistaken for the separator.
    let d = 0;
    let bar = -1;
    for (let k = inner.length - 1; k >= 0; k--) {
      if (inner.startsWith(']]', k - 1)) {
        d++;
        k--;
      } else if (inner.startsWith('[[', k)) {
        d--;
      } else if (inner[k] === '|' && d === 0) {
        bar = k;
        break;
      }
    }
    out.push({
      body: bar >= 0 ? inner.slice(0, bar) : inner,
      id: bar >= 0 ? inner.slice(bar + 1) : null,
    });
    i = j;
  }
  return out;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tools/__tests__/term-text.test.js`
Expected: PASS, 11 tests.

- [ ] **Step 5: Rewire `stripTermMarkersToText` to the new lib, behaviour-identical**

In `tools/cnxml-inject.js`, add to the imports at the top of the file:

```js
import { flattenMarkersToText } from './lib/term-text.js';
```

Replace the body of `stripTermMarkersToText` (line ~849) with:

```js
function stripTermMarkersToText(text, equations, { trim = false } = {}) {
  // Lowercasing stays HERE, not in the shared lib: both callers compare
  // case-insensitively. `data-en` must preserve case, so the lib does not.
  const out = flattenMarkersToText(text, equations);
  return trim ? out.trim().toLowerCase() : out.toLowerCase();
}
```

- [ ] **Step 6: Verify the two existing callers are unaffected**

Run: `npx vitest run tools/__tests__/ --reporter=basic 2>&1 | grep -aE "Tests  |Test Files"`
Expected: the same failing count as your baseline — **60 failed**. If it grew, `flattenMarkersToText` differs from the original in a way beyond case; diff the two functions and fix.

- [ ] **Step 7: Commit**

```bash
git add tools/lib/term-text.js tools/__tests__/term-text.test.js tools/cnxml-inject.js
git commit -m "refactor(term-text): extract a shared, case-preserving marker flattener + depth-aware scanner"
```

---

## Task 2: Extract writes `termEnglish` into the manifest

**Files:**
- Modify: `tools/cnxml-extract.js` — `buildManifest` at line ~2730
- Create: `tools/__tests__/manifest-term-english.test.js`

**Interfaces:**
- Consumes: `flattenMarkersToText`, `scanTermMarkers` from Task 1.
- Produces: `manifest.termEnglish` — `Record<string, string>`, id → plain-text English. Tasks 3–5 consume it.

**Background you need:** `buildManifest(result, sourceContent)` receives `result.segments`, an **array** of `{ id, type, text }`. Two populations carry term English:

| population | how to find it | key to store under |
|---|---|---|
| glossary definition term | `seg.type === 'glossary-term'`, id `m68700:glossary-term:fs-idp40901280-term` | `fs-idp40901280` (the `<definition id>`) |
| inline prose term | `[[term:EN\|term-00003]]` inside any segment's `text` | `term-00003` (the `<term id>`) |

The two key spaces are disjoint (measured: 0 collisions over 24 term ids and 762 definition ids).

- [ ] **Step 1: Write the failing test**

Create `tools/__tests__/manifest-term-english.test.js`:

```js
/**
 * The manifest's `termEnglish` map — the join table render uses to emit data-en.
 *
 * Keyed on whatever id the RENDERED CNXML exposes at that spot: an inline
 * `<term id>`, or the parent `<definition id>` for a glossary term (whose
 * `<term>` child carries no id of its own — 765 of 1,656 injected terms).
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { extractSegments, buildManifestForTest } from '../cnxml-extract.js';

const REPO_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const M68700 = path.join(REPO_ROOT, 'books/efnafraedi-2e/01-source/ch03/m68700.cnxml');

describe('manifest.termEnglish', () => {
  const src = fs.readFileSync(M68700, 'utf8');
  const result = extractSegments(src);
  const manifest = buildManifestForTest(result, src);
  const map = manifest.termEnglish;

  it('exists and is non-empty — a vacuous map would make every later test pass', () => {
    expect(map).toBeTypeOf('object');
    expect(Object.keys(map).length).toBeGreaterThan(0);
  });

  it('keys glossary terms on the DEFINITION id', () => {
    expect(map['fs-idp40905984']).toBe('formula mass');
    expect(map['fs-idp40908432']).toBe('mole');
  });

  it('keys inline terms on the TERM id', () => {
    expect(map['term-00001']).toBe('formula mass');
    expect(map['term-00002']).toBe('mole');
  });

  it('🔴 flattens a two-level nested payload without truncating', () => {
    expect(map['term-00003']).toBe('Avogadro’s number (NA)');
    expect(map['fs-idp40901280']).toBe('Avogadro’s number (NA)');
  });

  it('🔴 PRESERVES CASE — the old helper lowercased 1,005 published glosses', () => {
    expect(map['term-00003']).toMatch(/^Avogadro/);
    expect(map['term-00003']).not.toContain('avogadro');
  });

  it('stores no marker syntax in any value', () => {
    for (const [k, v] of Object.entries(map)) {
      expect(v, `value for ${k}`).not.toMatch(/\[\[|\]\]/);
    }
  });

  it('the same English legitimately appears under both key shapes', () => {
    // m68700 mentions each of its four glossary terms inline as well. Duplicate
    // VALUES under distinct keys are expected.
    expect(map['term-00001']).toBe(map['fs-idp40905984']);
  });

  it('🔴 the two KEY SPACES are disjoint — the premise that lets one flat map work', () => {
    // Measured over the whole corpus: 24 <term> ids, 762 <definition> ids, 0
    // collisions. If they ever overlap, one population silently overwrites the
    // other and the map needs namespacing. Assert it, do not assume it.
    const keys = Object.keys(map);
    const inline = keys.filter((k) => /^term-\d+$/.test(k));
    const definition = keys.filter((k) => !/^term-\d+$/.test(k));
    expect(inline.length).toBeGreaterThan(0);
    expect(definition.length).toBeGreaterThan(0);
    expect(inline.filter((k) => definition.includes(k))).toEqual([]);
    // …and together they account for every key, so nothing is silently uncategorised.
    expect(inline.length + definition.length).toBe(keys.length);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tools/__tests__/manifest-term-english.test.js`
Expected: FAIL — `buildManifestForTest is not a function`.

- [ ] **Step 3: Implement `buildTermEnglish` and wire it into the manifest**

In `tools/cnxml-extract.js`, add to the imports at the top:

```js
import { flattenMarkersToText, scanTermMarkers } from './lib/term-text.js';
```

Add this function immediately above `buildManifest`:

```js
/**
 * Build the id → English map render uses to emit `data-en` on each `<dfn>`.
 *
 * TWO POPULATIONS, TWO KEY SHAPES, ONE FLAT MAP. The key spaces are disjoint
 * (0 collisions over the whole corpus), so a single object is unambiguous:
 *   - glossary definition terms → the parent `<definition>` id, because the
 *     `<term>` child carries no id of its own (765 of 1,656 injected terms);
 *   - inline prose terms → the `<term>` id.
 *
 * @param {Array<{id: string, type: string, text: string}>} segments
 * @param {Object} equations - `math-N` -> { mathml }
 * @returns {Record<string, string>}
 */
function buildTermEnglish(segments, equations) {
  const out = {};
  for (const seg of segments || []) {
    if (seg.type === 'glossary-term') {
      const m = /:glossary-term:(.+)-term$/.exec(seg.id || '');
      if (m) out[m[1]] = flattenMarkersToText(seg.text, equations);
      continue;
    }
    for (const marker of scanTermMarkers(seg.text || '')) {
      if (marker.id) out[marker.id] = flattenMarkersToText(marker.body, equations);
    }
  }
  return out;
}
```

Inside `buildManifest`, add `termEnglish` to the returned object. Find the `return {` at the end of `buildManifest` and add the field alongside `elementIds`:

```js
    termEnglish: buildTermEnglish(segments, equations || {}),
```

- [ ] **Step 4: Export a test seam**

At the bottom of `tools/cnxml-extract.js`, beside the existing exports, add:

```js
// Test seam: buildManifest is internal, but its `termEnglish` map is a contract
// with cnxml-render.js and must be testable without writing to books/.
export { buildManifest as buildManifestForTest };
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run tools/__tests__/manifest-term-english.test.js`
Expected: PASS, 8 tests.

- [ ] **Step 6: Regenerate ch03's manifests and eyeball the real output**

```bash
node tools/cnxml-extract.js --book efnafraedi-2e --chapter 3
node tools/cnxml-extract.js --book lifraen-efnafraedi --chapter 3
node -e "const m=require('./books/efnafraedi-2e/02-structure/ch03/m68700-manifest.json'); console.log(JSON.stringify(m.termEnglish,null,1))"
```

Expected: eight entries — four `term-0000N` and four `fs-id*` — with `Avogadro’s number (NA)` capitalised.

⚠️ **This rewrites tracked files under `books/`.** That is intended and safe: `02-structure/` is GENERATED. Confirm with `git status --porcelain books/ | wc -l` that only `02-structure` manifests changed.

- [ ] **Step 7: Confirm the suite did not grow redder, then commit**

```bash
npm test > /tmp/t2.log 2>&1; grep -aE "Test Files|Tests  " /tmp/t2.log
git add tools/cnxml-extract.js tools/__tests__/manifest-term-english.test.js books/*/02-structure/ch03
git commit -m "feat(extract): record term English in the manifest, keyed on the id render exposes"
```

Expected in `/tmp/t2.log`: **60 failed**, unchanged file set.

---

<!-- ===================================================================== -->

## 🔴 TASKS 3–6 WERE REPLACED WHOLESALE ON 2026-09-03 — READ THIS FIRST

The original Tasks 3–6 are **deleted**, not amended: their site enumeration was wrong in
KIND, not in count. What follows was produced by a measurement pass and is **evidence-backed
but not all personally re-derived** — so here is exactly which claims were, so you know which
half to attack first.

**Re-derived by hand, by execution, before this text was accepted:**
- `renderTerm` has **zero callers and zero tests** — with a control proving the search finds
  references (`renderGlossary` appears in `cnxml-render-glossary-dom.test.js`). ⚠️ The naive
  grep returns 2 hits for `renderTerms` — **plural, an unrelated browser function in
  `server/views/my-work.html`** — which reads as "it has callers".
- **`term-0000N` RESTARTS IN EVERY MODULE.** `m68700`→`formula mass`, `m68702`→`percent
  composition`, `m00033`→`alkanes`. A flat chapter merge collides **31 of 79 `(module,key)`
  pairs in ch03 alone, all 31 carrying DIFFERENT English** (11 chemistry + 20 organic). That
  is a populated slot holding the wrong text — §C82 L144 — and **no count can see it.**
  ▶ Every map here is per-module. There is no flat chapter merge anywhere, by design.
- **Site B is real**: `cnxml-elements.js` converts terms with
  `/<term\s+id="([^"]*)"[^>]*>/`, so `id` must be the FIRST attribute. Executed:
  `<term id=… class=…>` → `<dfn id=… class="term">`, `<term class=… id=…>` → `<dfn
  class="term">`, **id silently discarded**. Census of READ-ONLY source: **81 class-first
  `<term id>`** against 1,325 id-first. ⚠️ Note the `[^>]*` in that same pattern — §C115's
  truncation idiom is sitting inside the very regex being fixed.
- **The manifest must reach render through `options`, never a `BOOKS_DIR`-relative read.**
  Not a new idea: `renderCnxmlToHtml` already does exactly this for `embedMap`, and its
  comment names the server-preview case and *"future callers"*. `renderService.js` resolves
  against an intrinsic `PROJECT_ROOT`. ⚠️ Severity, established jointly with the figure-text
  session: the in-process path is the editor **PREVIEW**, not the publisher — `renderModule`
  returns `{html}` and writes nothing — so published output is correct and the `BOOKS_DIR`
  defect is a UX gap, not a reader defect.

**NOT independently re-derived — treat as the strongest available claim, not as settled:**
every per-site `<dfn>`/`<dt>` count, the 810/83 corpus split, the four manifest states, the
`renderGlossary`-is-unreachable finding, and Task 6's acceptance numbers. **Each step below
carries the command that re-derives its own number. Run it.**

<!-- ===================================================================== -->

Tree clean, `tools/` hashes identical to the audit's (`cnxml-render.js` = `29bc376e`, `cnxml-elements.js` = `9c456d0e`). Every number below I re-derived myself in this worktree.

---

# REPLACEMENT TEXT — Tasks 3, 4, 5, 6

*Paste over the existing `## Task 3` … `## Task 6` block (plan lines 613–1114). Task 7 is unchanged; two pointers are added to it at the end.*

---

## Preamble to Tasks 3–6 — read once, applies to all four

**Measured 2026-09-03 in this worktree at `6e877f6d`, `tools/` clean (`tools/cnxml-render.js` blob `29bc376e`, `tools/lib/cnxml-elements.js` blob `9c456d0e`). Re-derive every count below before trusting it; each step gives the command.**

**What the audit settled, and what it deletes from the old text:**

| Old plan said | Measured | Consequence |
|---|---|---|
| Three `<dfn>` call sites | **One live `<dfn>` emitter**: the id-bearing branch, `tools/lib/cnxml-elements.js:802-804` | Sites are renamed A–F below |
| Site 1 = `renderTerm` (`cnxml-elements.js:646`) | **0 callers.** Not in `cnxml-render.js`'s import list (`:48-55`); no `import * as` of that module exists anywhere | **DELETED.** Old Task 3 Steps 1 (its tests) and 3 are gone |
| Site 3 = the id-less `<dfn>` branch carries the glossary population | **0 glossary terms reach it.** `extractChapterGlossary` (`cnxml-render.js:2485`) matches `/<term>([\s\S]*?)<\/term>/` and passes `termMatch[1]` — the tag is stripped before `processInlineContent` | **DELETED.** Old Task 4's `definitionId` context clone is dead plumbing |
| `renderGlossary` (`:2000`, called `:921`) needs a scoping fix | **Dead on this corpus.** `<glossary>` is a **sibling** of `<content>` in 111 of 111 module files that have one; `renderContent` matches against `doc.rawContent`, which is `<content>`'s inner | **DO NOTHING.** Not dead *code* — a synthetic nested `<glossary>` reaches it. Do not delete it, do not assume it stays unreachable |
| — | **A fourth site the plan never named:** `renderCompiledGlossary` (`cnxml-render.js:2511`, `<dt>` written at `:2524`, called at `:3798`) builds the chapter key-terms page | **NEW Task 4** |
| Render loads the manifest itself via `BOOKS_DIR` | `const DEFAULT_BOOKS_DIR = 'books/efnafraedi-2e'` (`:148`), `let BOOKS_DIR = …` (`:149`), reassigned only in `main()` (`:3324`). `server/services/renderService.js` calls `renderCnxmlToHtml` **in-process with `cwd=server/`**, and `options.bookSlug` is a measured no-op | **The caller loads and passes it**, exactly like `embedMap: loadEmbedMapping(book)` at `renderService.js:105` |
| A `sourceHash` vintage guard | Both sides hash the **same immutable `01-source` file**. 8 committed vintages of `m68700-manifest.json` all carry `sourceHash 8b0d4d033c6a1cce` while `segmentCount` moves 282 → 312 | **DELETED.** Replaced by a `moduleId` identity guard *in the loader* (Task 3) |

**🔴 The failure that actually corrupts a reader's page is a WRONG-MODULE map, not a stale one.** `term-0000N` is OpenStax's own id in READ-ONLY `01-source` and it **restarts in every module**. Verified here:

```bash
node -e "for (const m of ['m00032','m00033']) console.log(m, JSON.parse(require('fs').readFileSync('books/lifraen-efnafraedi/02-structure/ch03/'+m+'-manifest.json','utf8')).termEnglish['term-00001'])"
```
Expected: `m00032 functional group` / `m00033 alkanes`.

A chapter-flat merge therefore gives **31 of the 79 `(moduleId, key)` pairs in the two ch03 chapters** plausible wrong English — a populated slot holding the wrong text, invisible to every count (§C82 L144). **Every map in this design is per-module. There is no flat chapter merge anywhere.** Two field names keep the shapes from being confused:

- `context.termEnglish` — a flat `Record<id, en>` for **this one module** (Site A).
- `context.termEnglishByModule` — `Map<moduleId, Record<id, en>>` (Site C only, because `glossaryContext` has no `moduleId`).

### ⚠️ COORDINATION-REQUIRED — `tools/cnxml-render.js`

A peer session is editing that file on `feat/figure-text-review`. Its **committed** footprint (uncommitted edits will not show; never read the worktree directory):

```bash
git diff main...feat/figure-text-review --stat -- tools/
```
Expected: 7 files, `tools/cnxml-render.js` +118 lines among them.

**Every line number in Tasks 3–6 for `cnxml-render.js` may move. Re-anchor on the function names** — `renderCnxmlToHtml`, `renderCompiledGlossary`, `extractChapterGlossary`, `buildKeyTermsItems`, `main` — not on the digits. The loader (`tools/lib/term-english-map.js`) is an uncontested new file; land it and its test first.

### The red baseline — method, not a number

The "60 tests / 18 files" criterion is dead (60 counted agent *findings* over 16 files). Capture the failing-test-NAME set once, before Task 3, and assert set-equality in both directions after each task:

```bash
pgrep -x node | wc -l   # expect a small number; a peer vitest run turns a 3s file into 141s
npm test > /tmp/te-base.log 2>&1
grep -aoE '^\s*[×✕] .*' /tmp/te-base.log | sed -E 's/[0-9]+ms[[:space:]]*$//; s/[[:space:]]+$//' | sort -u > /tmp/te-base.set
wc -l /tmp/te-base.set   # POSITIVE CONTROL: must be non-zero, or the extractor is wrong, not the suite
```
After each task, produce `/tmp/te-tN.set` the same way and run `diff /tmp/te-base.set /tmp/te-tN.set`. **Expected: no output.** A line only in the new set is yours; a line only in the base set may be a rename or a `beforeAll` timeout converting assertions to SKIPS — investigate both directions, never the count.

### Writes into `books/`

**Tasks 3, 4 and 5 write nothing into `books/`.** All reach verification renders in-process into the scratchpad. Every commit step below ends with `git status --porcelain books/ | wc -l` → **expected `0`**.

🔴 **The one `books/` write is gated and is a decision, not a side effect.** `m68700` is in the `--no-annotate-en` holding state, so **any** chemistry ch03 re-render committed today ships **8 fewer reader-visible glosses** (4 `<dfn>` + 4 `<dt>`) than the published page — before `data-en` is considered, and with nothing rendering in their place until vefur ships. That is Task 6 Step 6, and it needs a [LEAD]/user decision.

---

## Task 3: The per-module loader, and Site A — the one live `<dfn>` emitter

**Deleted from the old Task 3:** Step 1's `renderTerm` describe block, Step 3 (`renderTerm` patch), and Step 6's in-render `loadTermEnglish`. `renderTerm` has zero callers — tests importing it directly go green while asserting on unreachable code.

**Files:**
- Create: `tools/lib/term-english-map.js`
- Create: `tools/__tests__/term-english-map.test.js`
- Create: `tools/__tests__/render-term-english.test.js`
- Modify: `tools/lib/cnxml-elements.js` — the id-bearing branch at `:802-804`
- Modify: `tools/cnxml-render.js` — context literal `~:668`, `main()` `~:3380` and `~:3622` — **COORDINATION-REQUIRED**
- Modify: `server/services/renderService.js` — `~:99`

**Interfaces:**
- Consumes: `manifest.termEnglish` from Task 2.
- Produces: `loadChapterTermEnglish()` and `classifyManifest()` from `tools/lib/term-english-map.js`; `context.termEnglish` (flat, this module), read by Site A.

**Background you need.** `books/*/02-structure/**/*-manifest.json` is in **four states**, and a bare `catch { return {} }` collapses all of them. Re-derive:

```bash
node -e "
const fs=require('fs'),path=require('path');let f=[];
(function w(d){for(const e of fs.readdirSync(d,{withFileTypes:true})){const p=path.join(d,e.name);
 if(e.isDirectory())w(p);else if(e.name.endsWith('-manifest.json')&&p.includes('02-structure'))f.push(p);}})('books');
let absent=0,empty=[],ok=[];for(const p of f){const m=JSON.parse(fs.readFileSync(p,'utf8'));
 if(!('termEnglish' in m))absent++;else if(Object.keys(m.termEnglish||{}).length===0)empty.push(path.basename(p));else ok.push(path.basename(p));}
console.log('total',f.length,'key-absent',absent,'empty',empty.length,empty,'ok',ok.length);"
```
Expected: `total 523 key-absent 510 empty 3 [ 'm68699-manifest.json', 'm00031-manifest.json', 'm00036-manifest.json' ] ok 10`.
*(Counting unit: **manifest FILE** under `books/*/02-structure/`. The 10 `ok` are the five chemistry ch03 modules minus `m68699`, plus six of organic ch03's seven. **Only ch03 of the two live books has been re-extracted** — 510 of 523 predate Task 2, so rollout is per chapter and render must degrade **counted**, not silently.)*

- [ ] **Step 1: Write the failing loader test**

Create `tools/__tests__/term-english-map.test.js`:

```js
/**
 * The join table render reads: books/<book>/02-structure/<chapterDir>/<mod>-manifest.json
 * → one termEnglish map PER MODULE.
 *
 * 🔴 PER-MODULE IS THE CORRECTNESS PROPERTY, NOT AN IMPLEMENTATION DETAIL.
 * `term-0000N` is OpenStax's own id and restarts in every module. A wrong-module
 * map does not MISS — it HITS with wrong values (m68703's map over m68704: 5 of 5
 * hits, 5 of 5 wrong English), which a hits/total counter cannot see.
 */
import { describe, it, expect, afterAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { loadChapterTermEnglish, classifyManifest } from '../lib/term-english-map.js';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

describe('classifyManifest — the four states a manifest can be in', () => {
  it('ok: termEnglish present and non-empty, moduleId agrees', () => {
    const r = classifyManifest('m68700', { moduleId: 'm68700', termEnglish: { 'term-00001': 'formula mass' } });
    expect(r.state).toBe('ok');
    expect(r.map['term-00001']).toBe('formula mass');
  });

  it('empty: the module legitimately has no terms — NOT the same as a stale manifest', () => {
    expect(classifyManifest('m68699', { moduleId: 'm68699', termEnglish: {} }).state).toBe('empty');
  });

  it('key-absent: a pre-Task-2 vintage — 510 of 523 manifests today', () => {
    const r = classifyManifest('m00130', { moduleId: 'm00130', segmentCount: 12 });
    expect(r.state).toBe('key-absent');
    expect(r.map).toBeNull();
  });

  it('🔴 moduleId-mismatch: the guard that stops a wrong-module map being joined', () => {
    const r = classifyManifest('m68704', { moduleId: 'm68703', termEnglish: { 'term-00001': 'concentration' } });
    expect(r.state).toBe('moduleId-mismatch');
    expect(r.map).toBeNull();
  });

  it('unreadable: a non-object payload is "nothing" in a shape a gate can walk past (§C21)', () => {
    expect(classifyManifest('m68700', null).state).toBe('unreadable');
    expect(classifyManifest('m68700', []).state).toBe('unreadable');
  });
});

describe('loadChapterTermEnglish — against the real corpus', () => {
  it('loads a module map and keys it on the module', () => {
    const { byModule } = loadChapterTermEnglish('efnafraedi-2e', 'ch03');
    expect(Object.keys(byModule.get('m68700'))).toHaveLength(8);
    expect(byModule.get('m68700')['term-00001']).toBe('formula mass');
    expect(byModule.get('m68700')['fs-idp40901280']).toBe('Avogadro’s number (NA)');
  });

  it('🔴 the SAME key means different things in different modules — a flat merge is wrong', () => {
    const { byModule } = loadChapterTermEnglish('lifraen-efnafraedi', 'ch03');
    expect(byModule.get('m00032')['term-00001']).toBe('functional group');
    expect(byModule.get('m00033')['term-00001']).toBe('alkanes');
  });

  it('reports key-absent for an un-re-extracted chapter, and offers no map for it', () => {
    const { byModule, state } = loadChapterTermEnglish('lifraen-efnafraedi', 'ch11');
    const states = [...state.values()];
    expect(states.length).toBeGreaterThan(0);            // control: the chapter was found
    expect(states.every((s) => s === 'key-absent')).toBe(true);
    expect(byModule.size).toBe(0);
  });

  it('a chapter that does not exist yields empty maps, not a throw', () => {
    const r = loadChapterTermEnglish('efnafraedi-2e', 'ch99');
    expect(r.byModule.size).toBe(0);
    expect(r.state.size).toBe(0);
  });
});

describe('cwd independence — the server renders with cwd=server/', () => {
  const originalCwd = process.cwd();
  afterAll(() => process.chdir(originalCwd));

  it('🔴 resolves against import.meta.url, not process.cwd()', () => {
    process.chdir(path.join(REPO_ROOT, 'server'));
    // PROVE THE CHDIR ACTUALLY MOVED. Without this the test is vacuous — it would
    // pass identically from the repo root, where a cwd-relative path also works.
    expect(fs.existsSync('books')).toBe(false);
    const { byModule } = loadChapterTermEnglish('efnafraedi-2e', 'ch03');
    expect(byModule.get('m68700')['term-00001']).toBe('formula mass');
  });
});
```

⚠️ `process.chdir` throws under vitest's **threads** pool. `pool`/`isolate` are unset in `vitest.config.js`, so the operative default here is a **forked, isolated child process per test file** and `chdir` works. If it throws `not supported in workers`, add `// @vitest-environment node` and re-run — do **not** delete the assertion; without it the whole test is vacuous.

- [ ] **Step 2: Run the test to verify it fails**

```bash
npx vitest run tools/__tests__/term-english-map.test.js
```
Expected: FAIL — `Failed to resolve import "../lib/term-english-map.js"`. **This is the right reason:** the module does not exist yet. If it fails on an assertion instead, you created the file early.

- [ ] **Step 3: Implement the loader**

Create `tools/lib/term-english-map.js`:

```js
/**
 * term-english-map.js
 *
 * Loads the per-module `termEnglish` maps cnxml-extract writes into
 * books/<book>/02-structure/<chapterDir>/<moduleId>-manifest.json.
 *
 * 🔴 WHY RENDER DOES NOT LOAD THIS ITSELF. cnxml-render.js's BOOKS_DIR is a bare
 * relative literal ('books/efnafraedi-2e') reassigned only inside main(), and
 * server/services/renderService.js calls renderCnxmlToHtml IN-PROCESS with
 * cwd=server/ — where 'books/…' resolves to server/books/… and misses for every
 * book. options.bookSlug is a measured no-op. So the CALLER loads and passes,
 * exactly as it already does for `embedMap: loadEmbedMapping(book)`.
 *
 * 🔴 WHY PER-MODULE. `term-0000N` is OpenStax's own id in READ-ONLY 01-source and
 * it RESTARTS in every module: in lifraen-efnafraedi ch03 `term-00001` is
 * "functional group" in m00032 and "alkanes" in m00033. A chapter-flat merge gives
 * 31 of 79 (moduleId,key) pairs plausible WRONG English — a populated slot holding
 * the wrong text, which no count can see (§C82 L144).
 *
 * 🔴 WHY THERE IS NO sourceHash GUARD. `sourceHash` hashes the immutable 01-source
 * file, so both sides of such a comparison are always equal: measured byte-identical
 * across 8 committed vintages of m68700-manifest.json while segmentCount moved
 * 282 → 312. The real hazard is a WRONG-module map, and only keying on the
 * manifest's own moduleId catches it.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/** @typedef {'ok'|'empty'|'key-absent'|'moduleId-mismatch'|'unreadable'} TermManifestState */

/**
 * Decide whether a parsed manifest may be joined to `moduleId`, and why not if not.
 * Pure — the wrong-module case is unreachable on the committed corpus, so it is
 * tested here rather than by planting a file.
 *
 * @param {string} moduleId - module id taken from the FILENAME
 * @param {unknown} manifest - parsed manifest, or null when it would not parse
 * @returns {{state: TermManifestState, map: Record<string,string>|null}}
 */
export function classifyManifest(moduleId, manifest) {
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
    return { state: 'unreadable', map: null };
  }
  // ORDER MATTERS. A pre-Task-2 manifest is benign and must not be reported as a
  // mismatch; only a manifest that actually CARRIES a map has to prove its identity.
  if (!Object.prototype.hasOwnProperty.call(manifest, 'termEnglish')) {
    return { state: 'key-absent', map: null };
  }
  if (manifest.moduleId !== moduleId) {
    return { state: 'moduleId-mismatch', map: null };
  }
  const map = manifest.termEnglish && typeof manifest.termEnglish === 'object' ? manifest.termEnglish : {};
  return { state: Object.keys(map).length > 0 ? 'ok' : 'empty', map };
}

/**
 * @param {string} book - book slug
 * @param {string} chapterDir - ALREADY formatted ('ch03' / 'appendices'). Taken as a
 *   string on purpose: this file adds no fifth chapter-dir formatter (CLAUDE.md's
 *   two-conventions rule), and both callers already hold one.
 * @returns {{byModule: Map<string, Record<string,string>>, state: Map<string, TermManifestState>}}
 */
export function loadChapterTermEnglish(book, chapterDir) {
  const byModule = new Map();
  const state = new Map();
  const dir = path.join(REPO_ROOT, 'books', book, '02-structure', chapterDir);

  let files;
  try {
    files = fs.readdirSync(dir).filter((f) => f.endsWith('-manifest.json'));
  } catch {
    return { byModule, state };
  }

  for (const file of files.sort()) {
    const moduleId = file.replace(/-manifest\.json$/, '');
    let parsed = null;
    try {
      parsed = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf-8'));
    } catch {
      parsed = null;
    }
    const { state: s, map } = classifyManifest(moduleId, parsed);
    state.set(moduleId, s);
    if (map) byModule.set(moduleId, map);
  }
  return { byModule, state };
}
```

- [ ] **Step 4: Run the loader test to verify it passes**

```bash
npx vitest run tools/__tests__/term-english-map.test.js
```
Expected: **PASS, 9 tests.**

- [ ] **Step 5: Write the failing render test for Site A**

Create `tools/__tests__/render-term-english.test.js`:

```js
/**
 * `<dfn data-en="…">` — the attribute vefur's term matching will consume.
 *
 * SITE A is the ONLY live <dfn> emitter: the id-bearing branch of
 * processInlineContent (tools/lib/cnxml-elements.js:802-804). `renderTerm` in the
 * same file has ZERO callers and is deliberately not tested here — a test that
 * imported it would pass while asserting on unreachable code.
 *
 * The chapter key-terms page emits <dt>, not <dfn>, and is Task 4.
 */
import { describe, it, expect } from 'vitest';
import { processInlineContent } from '../lib/cnxml-elements.js';

const ctx = (termEnglish) => ({ termEnglish, terms: {}, equations: [], figures: [] });

describe('site A — the id-bearing <term> branch', () => {
  it('emits data-en when the id is in THIS module’s map', () => {
    const html = processInlineContent('Eitt <term id="term-00002">mól</term> af efni', ctx({ 'term-00002': 'mole' }));
    expect(html).toContain('<dfn id="term-00002" class="term" data-en="mole">');
  });

  it('omits the attribute when the id is absent — degrade, never corrupt', () => {
    const html = processInlineContent('<term id="term-00777">x</term>', ctx({ 'term-00002': 'mole' }));
    expect(html).not.toContain('data-en');
    expect(html).toContain('<dfn id="term-00777" class="term">');
  });

  it('omits it when the context carries no map at all — every pre-rollout chapter', () => {
    const html = processInlineContent('<term id="term-00002">mól</term>', ctx(null));
    expect(html).not.toContain('data-en');
    expect(html).toContain('<dfn id="term-00002" class="term">');
  });

  it('escapes a quote rather than breaking out of the attribute', () => {
    const html = processInlineContent('<term id="t1">x</term>', ctx({ t1: 'the "mole" concept' }));
    expect(html).not.toMatch(/data-en="the "mole"/);
    expect(html).toContain('&quot;');
  });

  it('🔴 the SAME id yields DIFFERENT English under different module maps', () => {
    // m00032 term-00001 = "functional group"; m00033 term-00001 = "alkanes".
    // This is what a chapter-flat merge would get wrong on 31 of 79 ch03 pairs.
    const src = '<term id="term-00001">virknihópur</term>';
    expect(processInlineContent(src, ctx({ 'term-00001': 'functional group' }))).toContain('data-en="functional group"');
    expect(processInlineContent(src, ctx({ 'term-00001': 'alkanes' }))).toContain('data-en="alkanes"');
  });

  it('CONTROL — an empty map still yields a well-formed, id-bearing <dfn>', () => {
    expect(processInlineContent('<term id="t1">x</term>', ctx({}))).toBe('<dfn id="t1" class="term">x</dfn>');
  });
});
```

- [ ] **Step 6: Run it to verify it fails**

```bash
npx vitest run tools/__tests__/render-term-english.test.js
```
Expected: FAIL — `expected '<dfn id="term-00002" class="term">mól</dfn>' to contain '<dfn id="term-00002" class="term" data-en="mole">'`. The last test (CONTROL) must **PASS** already; if it fails, you changed the emission shape.

- [ ] **Step 7: Emit the attribute at Site A**

In `tools/lib/cnxml-elements.js`, replace the id-bearing branch at `:802-804`:

```js
  result = result.replace(/<term\s+id="([^"]*)"[^>]*>([\s\S]*?)<\/term>/g, (match, id, inner) => {
    // data-en is vefur's term key. Read from THIS MODULE's map only: `term-0000N`
    // is OpenStax's own id and restarts in every module, so a chapter-wide map
    // emits plausible wrong English that no count can see (§C82 L144).
    // Absent key ⇒ absent attribute. Degrade, never corrupt.
    const map = (context && context.termEnglish) || null;
    const en = map && typeof map[id] === 'string' ? map[id] : '';
    const enAttr = en ? ` data-en="${escapeAttr(en)}"` : '';
    // `id` is deliberately left UNESCAPED — this is the pre-existing emission, and
    // keeping it byte-identical is what makes Task 6's "empty map ⇒ unchanged
    // output" pin mean something.
    return `<dfn id="${id}" class="term"${enAttr}>${processInlineContent(inner, context)}</dfn>`;
  });
```

`escapeAttr` needs no import — it is defined and exported in this same file at `:419`. (The old plan's ⚠️ about importing it was wrong.)

Then in `tools/cnxml-render.js`, add one field to the context literal at `~:668`, beside the existing `moduleId` — **COORDINATION-REQUIRED**:

```js
    termEnglish: options.termEnglish || null, // THIS module's id → English (tools/lib/term-english-map.js)
```

⚠️ **Do not add a third parameter to `processInlineContent`** — it has 39 non-test call sites. The context object is the seam.

- [ ] **Step 8: Run it to verify it passes**

```bash
npx vitest run tools/__tests__/render-term-english.test.js
```
Expected: **PASS, 6 tests.**

- [ ] **Step 9: Thread the map at both callers**

**(a) CLI — `tools/cnxml-render.js` `main()`. COORDINATION-REQUIRED.** Beside the existing `buildModuleSections` call (`~:3380`), where `chapterDir` is already in scope:

```js
    // Per-module English term maps for data-en. Loaded once per chapter; the
    // loader keys on each manifest's own moduleId, so a wrong-module map is
    // refused rather than joined.
    const termEnglish = loadChapterTermEnglish(BOOK_SLUG, chapterDir);
```

Import it at the top beside `buildModuleSections` (`:62`):

```js
import { loadChapterTermEnglish } from './lib/term-english-map.js';
```

Then in the per-module `renderCnxmlToHtml` options object (`~:3622`), add:

```js
            termEnglish: termEnglish.byModule.get(moduleId) || null,
```

**(b) Server preview — `server/services/renderService.js` `~:99`.** This is a `server/` file (CommonJS, dynamic `import()` of ESM tools — the idiom is already there at `:83`). Beside `embedMap: loadEmbedMapping(book)`:

```js
  const { loadChapterTermEnglish } = await import(
    path.join(PROJECT_ROOT, 'tools', 'lib', 'term-english-map.js')
  );
  const termEnglishByModule = loadChapterTermEnglish(book, chapterStr).byModule;
```
…and in the options object:
```js
    termEnglish: termEnglishByModule.get(moduleId) || null,
```

⚠️ **Why touch the server at all, honestly:** `data-en` is invisible without vefur's CSS/JS, so this changes nothing an editor sees. It is here so the two render paths do not silently diverge — the preview path is exactly where `options.bookSlug` already rots unnoticed. **`server/` is not linted by CI** (root `lint` is `eslint tools/ scripts/`); `lint-staged`'s pre-commit hook does cover it, so run the commit normally rather than with `--no-verify`. This edge is `server/` → `tools/` (AGPL consuming MIT), the safe direction — root `LICENSE`'s MIT→AGPL enumeration does **not** need updating.

- [ ] **Step 10: Prove reach at the RENDERED OUTPUT, in-process, without writing to `books/`**

Create `<scratchpad>/reach.mjs`:

```js
import fs from 'fs';
import path from 'path';
import { renderCnxmlToHtml } from '/ABSOLUTE/PATH/TO/repo/tools/cnxml-render.js';
import { loadChapterTermEnglish } from '/ABSOLUTE/PATH/TO/repo/tools/lib/term-english-map.js';
const ROOT = '/ABSOLUTE/PATH/TO/repo';
const c = (h, re) => (h.match(re) || []).length;
for (const [book, ch] of [['efnafraedi-2e', 3], ['lifraen-efnafraedi', 3]]) {
  const dir = path.join(ROOT, 'books', book, '03-translated/mt-preview/ch03');
  const { byModule } = loadChapterTermEnglish(book, 'ch03');
  let dfn = 0, withId = 0, withEn = 0;
  for (const f of fs.readdirSync(dir).filter((f) => f.endsWith('.cnxml')).sort()) {
    const moduleId = f.replace('.cnxml', '');
    const html = renderCnxmlToHtml(fs.readFileSync(path.join(dir, f), 'utf8'),
      { chapter: ch, moduleId, lang: 'is', termEnglish: byModule.get(moduleId) || null }).html;
    dfn += c(html, /<dfn\b/g); withId += c(html, /<dfn\s+id="/g); withEn += c(html, /<dfn[^>]*\sdata-en="/g);
  }
  console.log(book, 'dfn', dfn, 'withId', withId, 'withEn', withEn);
}
```

```bash
node <scratchpad>/reach.mjs 2>&1 | grep -a dfn
git status --porcelain books/ | wc -l
```
Expected exactly:
```
efnafraedi-2e dfn 20 withId 20 withEn 20
lifraen-efnafraedi dfn 39 withId 39 withEn 39
```
and `0` from `git status`.
*(Counting unit: **rendered `<dfn>` ELEMENT**, ch03, `mt-preview`, rendered fresh from `03-translated`. These are not the spec's "16 + 16" or "38" — those count `<term>` elements in CNXML that carry a gloss, a different unit. The in-process render is faithful for this element: its per-module counts are 0/4/2/9/5 chemistry and 16/8/2/1/9/3 organic, identical to the committed pages.)*

- [ ] **Step 11: Failing-set check, then commit**

```bash
npm test > /tmp/te-t3.log 2>&1
grep -aoE '^\s*[×✕] .*' /tmp/te-t3.log | sed -E 's/[0-9]+ms[[:space:]]*$//; s/[[:space:]]+$//' | sort -u > /tmp/te-t3.set
diff /tmp/te-base.set /tmp/te-t3.set
git status --porcelain books/ | wc -l
git add tools/lib/term-english-map.js tools/__tests__/term-english-map.test.js \
        tools/__tests__/render-term-english.test.js tools/lib/cnxml-elements.js \
        tools/cnxml-render.js server/services/renderService.js
git commit -m "feat(render): per-module data-en on the one live <dfn> emitter"
```
Expected: `diff` prints nothing; `git status … books/` prints `0`.

---

## Task 4: Site C — the chapter key-terms page, which emits `<dt>` and not `<dfn>`

**This replaces the old "Site 3 — the id-less glossary branch" entirely.** That site annotates **0 of the 763** in-definition terms: `extractChapterGlossary` (`cnxml-render.js:2485`) strips the `<term>` tag before `processInlineContent` ever sees it. The glossary population's real destination is `renderCompiledGlossary` (`:2511`), which writes a bare `<dt id="<definition id>">` at `:2524`. Verify before you start:

```bash
grep -aoh '<dt[^>]*>' books/efnafraedi-2e/05-publication/mt-preview/chapters/03/3-key-terms.html | head -2
grep -aoc '<dfn' books/efnafraedi-2e/05-publication/mt-preview/chapters/03/3-key-terms.html
```
Expected: `<dt id="fs-idp40901280">` / `<dt id="fs-idp40905984">`, then `0`.
*(Counting unit: **rendered element** on one page. Corpus-wide: 905 `<dfn>` all on section pages, 851 `<dt>` all on `*-key-terms.html`, two disjoint non-empty populations.)*

**🔴 CROSS-REPO DECISION — NAME IT, DO NOT SILENTLY PICK IT.** vefur's `src/lib/actions/glossaryTerms.ts:318` does `node.querySelectorAll('dfn.term')`. **A `<dt data-en>` is invisible to the consumer that already exists.** Emitting it here is additive and reader-invisible, so ship it — but it means **spec §4.7 (retire `annotateInlineTerms`) is BLOCKED** until one of these is chosen and built:

- **(i)** vefur widens its walker to `dt[data-en]` (no efni change), or
- **(ii)** the `<dt>` wraps its term in `<dfn class="term" data-en>` (an efni change that alters the key-terms DOM and is a `content.css` contract change to coordinate with vefur).

Flipping `annotateEn` off before that strips `(e. …)` from **851 published `<dt>` elements across chemistry** with nothing rendering in its place. Record the choice in Task 7's handover doc; do not decide it in this task.

**Files:**
- Modify: `tools/cnxml-render.js` — `renderCompiledGlossary` `:2511-2524`, `glossaryContext` `~:3787` — **COORDINATION-REQUIRED**
- Modify: `tools/__tests__/render-term-english.test.js`

**Interfaces:**
- Consumes: `loadChapterTermEnglish().byModule` from Task 3.
- Produces: `context.termEnglishByModule` — `Map<moduleId, Record<id,en>>`, **read only by `renderCompiledGlossary`**.

**Why a different field and a different shape:** `glossaryContext` (`:3787`) is chapter-wide and carries **no `moduleId`**; the definitions do (`def.moduleId`, stamped by `extractChapterGlossary`). Both `def.id` and `def.moduleId` are loop locals on the exact line that writes the `<dt>`, so this is a **one-line attribute append — no context clone, no new parameter, and nothing routed through `processInlineContent`.** Any design that puts this lookup inside `processInlineContent` emits **zero** `data-en` on the key-terms page while every module page looks correct — a partial success that reads as a success.

- [ ] **Step 1: Write the failing test**

Append to `tools/__tests__/render-term-english.test.js`:

```js
import { renderCompiledGlossary } from '../cnxml-render.js';

describe('site C — the chapter key-terms page (<dt>, not <dfn>)', () => {
  const defs = [
    { id: 'fs-idp40905984', term: 'formúlumassi', termContent: 'formúlumassi', meaningContent: 'skilgreining', moduleId: 'm68700' },
  ];
  const gctx = (byModule) => ({ termEnglishByModule: byModule, terms: {}, figures: {}, tables: {}, examples: {}, footnotes: [] });

  it('emits data-en on the <dt>, keyed on (def.moduleId, def.id)', () => {
    const byModule = new Map([['m68700', { 'fs-idp40905984': 'formula mass' }]]);
    const html = renderCompiledGlossary(3, defs, gctx(byModule));
    expect(html).toContain('<dt id="fs-idp40905984" data-en="formula mass">');
  });

  it('🔴 keys on the DEFINITION’S module, not on any chapter-flat merge', () => {
    // Same definition id, two modules, two Englishes. A flat merge cannot tell
    // them apart; this asserts the code reads def.moduleId.
    const byModule = new Map([
      ['m68700', { 'fs-idp40905984': 'formula mass' }],
      ['m68703', { 'fs-idp40905984': 'WRONG — other module' }],
    ]);
    expect(renderCompiledGlossary(3, defs, gctx(byModule))).toContain('data-en="formula mass"');
  });

  it('omits the attribute when that module’s map lacks the id', () => {
    const byModule = new Map([['m68700', { 'fs-idOTHER': 'x' }]]);
    const html = renderCompiledGlossary(3, defs, gctx(byModule));
    expect(html).not.toContain('data-en');
    expect(html).toContain('<dt id="fs-idp40905984">');
  });

  it('omits it when there is no map at all — every pre-rollout chapter', () => {
    const html = renderCompiledGlossary(3, defs, gctx(undefined));
    expect(html).not.toContain('data-en');
    expect(html).toContain('<dt id="fs-idp40905984">');
  });

  it('🔴 CONTROL — this page emits NO <dfn>, so a future refactor routing it through the <dfn> path is caught here', () => {
    const byModule = new Map([['m68700', { 'fs-idp40905984': 'formula mass' }]]);
    const html = renderCompiledGlossary(3, defs, gctx(byModule));
    expect(html).not.toContain('<dfn');
    expect(html).toContain('<dl>');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
npx vitest run tools/__tests__/render-term-english.test.js -t "site C"
```
Expected: FAIL on the first two — `expected '… <dt id="fs-idp40905984">formúlumassi</dt> …' to contain '<dt id="fs-idp40905984" data-en="formula mass">'`. The last three must already **PASS** (they assert today's behaviour, and are the controls that stop the fix from being written blindly).

- [ ] **Step 3: Emit the attribute at Site C** — **COORDINATION-REQUIRED**

In `tools/cnxml-render.js`, inside `renderCompiledGlossary`'s loop, replace the `<dt>` line (`:2524`):

```js
      // data-en keyed on the DEFINITION's own module. glossaryContext is
      // chapter-wide and has no moduleId, but every def carries one — and
      // definition ids are unique within a chapter (0 duplicates in all 21
      // chemistry chapters), so this join is unambiguous.
      const defMap =
        def.id && context && context.termEnglishByModule
          ? context.termEnglishByModule.get(def.moduleId)
          : null;
      const defEn = defMap && typeof defMap[def.id] === 'string' ? defMap[def.id] : '';
      const enAttr = defEn ? ` data-en="${escapeAttr(defEn)}"` : '';
      lines.push(`    <dt${def.id ? ` id="${escapeAttr(def.id)}"` : ''}${enAttr}>${termHtml}</dt>`);
```

Then add one field to the `glossaryContext` literal at `~:3787`:

```js
          termEnglishByModule: termEnglish.byModule,
```
(`termEnglish` is already in scope from Task 3 Step 9a.)

⚠️ **Do NOT touch `renderGlossary` (`:2000`).** It is unreachable on this corpus — `<glossary>` is a sibling of `<content>` in 111 of 111 module files — but a synthetic nested `<glossary>` does reach it. Leave it, and do not assume it stays unreachable.

- [ ] **Step 4: Run it to verify it passes**

```bash
npx vitest run tools/__tests__/render-term-english.test.js
```
Expected: **PASS, 11 tests.**

- [ ] **Step 5: Correct the frozen spec and the false test comment**

Two documents assert the falsified enumeration and will send the next reader back down it.

**(a)** `docs/superpowers/specs/2026-09-01-term-english-attribute-design.md` — add a banner-dated amendment under §4.2 and under §8. It is a **frozen design record**, so amend with a dated block; do not rewrite the original text:

> 🔴 **AMENDED 2026-09-03, MEASURED.** §4.2's three-site enumeration and §8's "✅ ANSWERED" are wrong. `renderTerm` (site 1) has **0 callers**. A glossary definition's `<term>` never reaches site 3 — `extractChapterGlossary` (`cnxml-render.js:2485`) strips the tag first, so **0 of 763** in-definition terms are reachable there. `renderGlossary`, whose scoping §8 resolves, **never runs**: `<glossary>` is a sibling of `<content>` in 111 of 111 module files. The real second site is `renderCompiledGlossary` (`:2511`), and it emits **`<dt>`, not `<dfn>`** — outside the `dfn.term` contract §4.5 promises and outside what vefur's `glossaryTerms.ts` walks, which **blocks §4.7**. §4.4's vintage guard cannot fire (both sides hash the same immutable file); the real hazard is a wrong-**module** map. §4.4's premise that extract *mints* `term-0000N` is also false — they are OpenStax's own ids in `01-source`.

**(b)** `tools/__tests__/cnxml-render-glossary-dom.test.js:16` carries the comment *"Glossary sits inside `<content>` in real CNXML files"*. Measured: **111 of 111** put it outside. Correct the comment in place and label the file as characterizing a corpus-unreachable path. Re-derive first:

```bash
node -e "
const fs=require('fs'),path=require('path');let inside=0,outside=0,files=0;
(function w(d){for(const e of fs.readdirSync(d,{withFileTypes:true})){const p=path.join(d,e.name);
 if(e.isDirectory())w(p); else if(e.name.endsWith('.cnxml')&&p.includes('03-translated')){
  const s=fs.readFileSync(p,'utf8'); if(!/<glossary>/.test(s))return; files++;
  const cm=s.match(/<content>([\s\S]*?)<\/content>/); (cm&&/<glossary>/.test(cm[1])?inside++:outside++);}}})('books/efnafraedi-2e');
(function w(d){for(const e of fs.readdirSync(d,{withFileTypes:true})){const p=path.join(d,e.name);
 if(e.isDirectory())w(p); else if(e.name.endsWith('.cnxml')&&p.includes('03-translated')){
  const s=fs.readFileSync(p,'utf8'); if(!/<glossary>/.test(s))return; files++;
  const cm=s.match(/<content>([\s\S]*?)<\/content>/); (cm&&/<glossary>/.test(cm[1])?inside++:outside++);}}})('books/lifraen-efnafraedi');
console.log('glossary-bearing files',files,'inside <content>',inside,'outside',outside);"
```
Expected: a **non-zero** file count with `inside 0` — the non-zero denominator is the control that makes the zero mean something.

- [ ] **Step 6: Failing-set check, then commit**

```bash
npm test > /tmp/te-t4.log 2>&1
grep -aoE '^\s*[×✕] .*' /tmp/te-t4.log | sed -E 's/[0-9]+ms[[:space:]]*$//; s/[[:space:]]+$//' | sort -u > /tmp/te-t4.set
diff /tmp/te-base.set /tmp/te-t4.set
git status --porcelain books/ | wc -l
git add tools/cnxml-render.js tools/__tests__/render-term-english.test.js \
        tools/__tests__/cnxml-render-glossary-dom.test.js \
        docs/superpowers/specs/2026-09-01-term-english-attribute-design.md
git commit -m "feat(render): data-en on the key-terms <dt>, keyed on the definition's own module"
```
Expected: `diff` silent, `0` from `git status`.

### Site D — organic's key-terms `<li><a>`: DEFERRED, with its trigger

`buildKeyTermsItems` (`cnxml-render.js:3288`) builds organic's key-terms page from `<link document target-id>` items — a **third markup shape**, 36 of them in ch03, all resolving in the manifests. It is **not built here**, for a measured reason:

```bash
grep -ac '(e\. ' books/lifraen-efnafraedi/05-publication/mt-preview/chapters/03/3-key-terms.html
```
Expected: **`0`.** That page carries **no gloss today**, so it is not a §4.7 regression risk, and vefur has no consumer for an `<a data-en>`. The `<dfn>` each link points at already gets `data-en` via Site A.

▶ **Trigger to build it:** vefur asks for the English on the key-terms index, **or** that grep ever returns non-zero. Log it in the register's deferred-work ledger, not here.

---

## Task 5: The visible coverage report, and the attribute-order fix that gives 81 `<dfn>` a key

**The old Task 5 is deleted.** Its guard compared `sourceHash` against `sourceHash` — both sides hash the same immutable `01-source` file, byte-identical across 8 committed vintages of `m68700-manifest.json` while `segmentCount` moved 282 → 312. Its stated rationale (extract *mints* `term-0000N`) is also false: they are OpenStax's own ids. **The identity guard that does work already shipped in Task 3's loader**, keyed on the manifest's own `moduleId`. What remains is the half that is genuinely valuable — making an absence *visible* — plus a producer/consumer defect the audit surfaced.

**Files:**
- Modify: `tools/cnxml-render.js` — per-module loop `~:3622`, compiled-glossary block `~:3798` — **COORDINATION-REQUIRED**
- Modify: `tools/lib/cnxml-elements.js` — the two `<term>` branches at `:802-807`
- Modify: `tools/__tests__/render-term-english.test.js`

### Part 1 — the report (one commit)

- [ ] **Step 1: Add the per-module coverage line**

In `tools/cnxml-render.js`, after each module's `renderResult.html` is available (`~:3630`):

```js
          // §4.3: a missing key degrades to no attribute, and a silent drop is this
          // project's recurring failure. Denominator is <dfn id>, not <dfn>: an
          // id-less <dfn> structurally CANNOT be keyed (2 such <term> exist in
          // READ-ONLY chemistry source and no id join will ever reach them).
          const dfnWithId = (html.match(/<dfn\s+id="/g) || []).length;
          const dfnWithEn = (html.match(/<dfn[^>]*\sdata-en="/g) || []).length;
          if (dfnWithId > 0) {
            const stale = termEnglish.state.get(moduleId) === 'key-absent'
              ? ` — manifest has no termEnglish (re-run: node tools/cnxml-extract.js --book ${BOOK_SLUG} --chapter ${args.chapter})`
              : '';
            console.log(`  terms: ${dfnWithEn}/${dfnWithId} <dfn id> carry data-en${stale}`);
          }
```

Add the same two lines after `renderCompiledGlossary` returns (`~:3801`), counting `<dt\s+id="` and `<dt[^>]*\sdata-en="`, printed as `key-terms: N/M <dt id> carry data-en`.

⚠️ **Never print "32/40".** That mixes units — 32 counts glossed `<term>` elements in CNXML, 40 counts `<term>` elements. The report counts **rendered elements**.

- [ ] **Step 2: See the report on a real run — WITHOUT writing to `books/`**

Extend `<scratchpad>/reach.mjs` to print `termEnglish.state` per module, or run the CLI against a throwaway copy. **Do not run `node tools/cnxml-render.js --book …` yet** — it writes `05-publication` and would ship the m68700 gloss loss ahead of the gated Task 6 Step 6.

Expected values, per **rendered `<dfn id>` / `<dt id>` element**, ch03 `mt-preview`:
```
chemistry:  m68699 (no line) · m68700 4/4 · m68702 2/2 · m68703 9/9 · m68704 5/5 · key-terms 20/20
organic:    m00032 16/16 · m00033 8/8 · m00034 2/2 · m00035 1/1 · m00037 9/9 · m00038 3/3 · no key-terms glossary (0 definitions collected)
```

- [ ] **Step 3: Commit part 1**

```bash
npm test > /tmp/te-t5a.log 2>&1
grep -aoE '^\s*[×✕] .*' /tmp/te-t5a.log | sed -E 's/[0-9]+ms[[:space:]]*$//; s/[[:space:]]+$//' | sort -u > /tmp/te-t5a.set
diff /tmp/te-base.set /tmp/te-t5a.set
git add tools/cnxml-render.js && git commit -m "feat(render): report data-en coverage per module and name the stale-manifest remedy"
```
Expected: `diff` silent.

### Part 2 — Site B: render discards an id that extract wrote (separate commit)

**🔴 This is a §C89-shaped producer/consumer mismatch, and it is NOT part of the `data-en` diff.** `cnxml-extract.js:414` reads `<term>` attributes **order-independently** (`/<term([^>]*)>/` + `parseAttributes`) and writes `[[term:EN|term-000NN]]`. `cnxml-elements.js:802` requires `id` to be the **first attribute**, so it discards the very key extract wrote. Verify by execution:

```bash
node --input-type=module -e "
import { processInlineContent } from './tools/lib/cnxml-elements.js';
const ctx={terms:{},equations:[],figures:[]};
console.log('id-first   :', processInlineContent('<term id=\"term-00043\" class=\"no-emphasis\">Thomson</term>', ctx));
console.log('class-first:', processInlineContent('<term class=\"no-emphasis\" id=\"term-00042\">Thomson</term>', ctx));"
```
Expected today: `<dfn id="term-00043" class="term">Thomson</dfn>` and `<dfn class="term">Thomson</dfn>` — same element, same attributes, **order alone decides**.

⚠️ **This is DOM-visible: 81 published chemistry `<dfn>` gain an `id=`.** Anchors, deep links and any vefur selector keyed on `dfn[id]` presence could shift. It is a correctness fix and should ship — but on its own commit, with its own before/after count.

⚠️ **Its `data-en` reach stays 0 on those chapters until they are re-extracted** (510 of 523 manifests are `key-absent`). That is the degrade rule working, not a failure.

- [ ] **Step 4: Measure the before/after, per `<dfn>` element**

Create `<scratchpad>/siteb.mjs` — render every `03-translated/mt-preview` module of both books in-process and print `withId` / `idLess` totals, plus `m68685` alone as the named control:

```bash
node <scratchpad>/siteb.mjs
```
Expected **before**: `m68685 dfn 6 withId 4 idLess 2` (I measured this) and a corpus split the audit reports as **810 withId / 83 idLess** (conservation 893). **Write down the numbers you actually get**; the corpus may have moved and the conservation total is the check that your harness neither creates nor destroys a `<term>`.

- [ ] **Step 5: Write the failing test**

Append to `tools/__tests__/render-term-english.test.js`:

```js
describe('site B — the <term> id must be read order-independently (§C89 producer/consumer)', () => {
  it('🔴 class-first <term> keeps its id — extract reads it, render used to discard it', () => {
    const html = processInlineContent('<term class="no-emphasis" id="term-00042">Thomson</term>', ctx(null));
    expect(html).toBe('<dfn id="term-00042" class="term">Thomson</dfn>');
  });

  it('CONTROL — id-first is unchanged', () => {
    const html = processInlineContent('<term id="term-00043" class="no-emphasis">Thomson</term>', ctx(null));
    expect(html).toBe('<dfn id="term-00043" class="term">Thomson</dfn>');
  });

  it('a genuinely bare <term> still emits an id-less <dfn> — 2 exist in READ-ONLY source', () => {
    expect(processInlineContent('<term>efnajöfnu</term>', ctx(null))).toBe('<dfn class="term">efnajöfnu</dfn>');
  });

  it('a class-first <term> now joins the map too', () => {
    const html = processInlineContent('<term class="no-emphasis" id="term-00042">Thomson</term>', ctx({ 'term-00042': 'Thomson' }));
    expect(html).toContain('data-en="Thomson"');
  });

  it('🔴 §C115 — a raw ">" inside an attribute value must not truncate the open tag', () => {
    const html = processInlineContent('<term alt="a > b" id="term-00050">x</term>', ctx({ 'term-00050': 'greater' }));
    expect(html).toContain('id="term-00050"');
    expect(html).toContain('data-en="greater"');
  });
});
```

- [ ] **Step 6: Run it to verify it fails**

```bash
npx vitest run tools/__tests__/render-term-english.test.js -t "site B"
```
Expected: FAIL on tests 1, 4 and 5 — `expected '<dfn class="term">Thomson</dfn>' to be '<dfn id="term-00042" class="term">Thomson</dfn>'`. Tests 2 and 3 must **PASS** already; they are the controls proving the harness is aimed correctly.

- [ ] **Step 7: Implement — one quote-aware handler, per §C115**

In `tools/lib/cnxml-elements.js`, replace **both** branches (`:802-807`) with one. `TAG_ATTR_SPAN` and `parseAttributes` are already imported at `:16`. **Do not write a fresh `[^>]*`** — the trailing `[^>]*` at `:802` is itself a §C115 exposure, and the class is *"find the end of an open tag, however written"*.

```js
  // §C89/§C115: ONE order-independent, quote-aware read. Extract reads <term>
  // attributes with parseAttributes and writes [[term:EN|id]]; requiring `id`
  // FIRST here discarded that key on 81 chemistry <dfn> across 16 chapters —
  // the producer emitted, the consumer dropped. TAG_ATTR_SPAN is the §C115
  // drop-in for `[^>]*`: a bare `>` is legal inside an attribute value.
  const TERM_OPEN = new RegExp(`<term(${TAG_ATTR_SPAN})>([\\s\\S]*?)<\\/term>`, 'g');
  result = result.replace(TERM_OPEN, (match, attrString, inner) => {
    const id = parseAttributes(attrString).id || null;
    const body = processInlineContent(inner, context);
    if (!id) return `<dfn class="term">${body}</dfn>`;
    const map = (context && context.termEnglish) || null;
    const en = map && typeof map[id] === 'string' ? map[id] : '';
    const enAttr = en ? ` data-en="${escapeAttr(en)}"` : '';
    return `<dfn id="${id}" class="term"${enAttr}>${body}</dfn>`;
  });
```

- [ ] **Step 8: Run it to verify it passes, then re-measure the corpus**

```bash
npx vitest run tools/__tests__/render-term-english.test.js
node <scratchpad>/siteb.mjs
```
Expected: **PASS, 16 tests.** And `m68685 dfn 6 withId 6 idLess 0`, with the corpus moving to **891 withId / 2 idLess** and the conservation total unchanged at **893**. If the total moved, the regex change is not behaviour-identical elsewhere — stop and diff.

- [ ] **Step 9: Prove the class-wide regex change is otherwise inert**

A class-wide regex change without a byte-identity diff is unverified (CLAUDE.md §C115). Render every `03-translated/mt-preview` module of both books to two scratch trees — one at the parent commit, one at HEAD — and diff:

```bash
diff -rq <scratchpad>/render-before <scratchpad>/render-after | wc -l
```
Expected: a **small, enumerable** set of changed files, and every difference must be an added ` id="term-000NN"` on a `<dfn>`. Account for each one individually. Anything else is a regression.

- [ ] **Step 10: Commit part 2 separately**

```bash
npm test > /tmp/te-t5b.log 2>&1
grep -aoE '^\s*[×✕] .*' /tmp/te-t5b.log | sed -E 's/[0-9]+ms[[:space:]]*$//; s/[[:space:]]+$//' | sort -u > /tmp/te-t5b.set
diff /tmp/te-base.set /tmp/te-t5b.set
git status --porcelain books/ | wc -l
git add tools/lib/cnxml-elements.js tools/__tests__/render-term-english.test.js
git commit -m "fix(render): read the <term> id order-independently — extract wrote it, render discarded it"
```
Expected: `diff` silent, `0` from `git status`. **Note in the commit body that 81 published `<dfn>` will gain an `id=` at the next re-render**, so vefur can be told.

---

## Task 6: Corpus acceptance — reach at the rendered output, rendered fresh

**Why this task exists separately:** every previous task tested a function. This tests the **composition** — where this pipeline's defects live. Two changes from the old text:

- **It renders in-process from `03-translated`, not from `05-publication`.** That tree is a mixed vintage: chemistry ch03's published pages carry 4 more `<dfn>` glosses and 4 more `<dt>` glosses than a fresh render, because `m68700` is in the `--no-annotate-en` holding state. A test reading it would compare two vintages.
- **All four of the old assertions are replaced.** `toBeGreaterThan(30)` is false (chemistry ch03 renders 20 `<dfn>`); `toBeGreaterThanOrEqual(32)` is unreachable (32 counts glossed `<term>` in CNXML); `idLess.length > 0` is unreachable in **both** books (0 id-less `<dfn>` in ch03, and after Task 5 Part 2 only 2 remain in the whole chemistry corpus).

**Files:**
- Create: `tools/__tests__/term-english-corpus.test.js`
- Modify: `tools/cnxml-render.js` — one line in the export block (`~:4252`) — **COORDINATION-REQUIRED**

- [ ] **Step 1: Add the test seam for `extractChapterGlossary`**

`renderCompiledGlossary` and `buildKeyTermsItems` are already exported; `extractChapterGlossary` is not, and the `<dt>` half of acceptance cannot reach the real path without it. Add to the export block:

```js
  extractChapterGlossary as _extractChapterGlossaryForTest,
```

Reproducing its regex in the test instead would test the test, not the renderer.

- [ ] **Step 2: Write the acceptance test**

Create `tools/__tests__/term-english-corpus.test.js`:

```js
/**
 * Reach, measured at the RENDERED OUTPUT — not at the manifest, and not at the
 * committed 05-publication tree.
 *
 * A manifest entry is not evidence the renderer used it (§C82 L149: a container
 * fix once reached the injected CNXML 102/102 and the HTML 0/102). And
 * 05-publication is a MIXED VINTAGE — chemistry ch03's pages carry 4 <dfn> + 4
 * <dt> glosses a fresh render no longer produces — so this renders in-process
 * from 03-translated, which is the tree the next render will actually read.
 *
 * ⚠️ SLOW (~10-30s): MathJax initialises once, then ~12 module renders. Do not
 * run it alongside a peer session's vitest — two full suites on this box turn a
 * ~3s file into 141s and manufacture timeout-shaped reds.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { renderCnxmlToHtml, renderCompiledGlossary, _extractChapterGlossaryForTest } from '../cnxml-render.js';
import { loadChapterTermEnglish } from '../lib/term-english-map.js';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const count = (h, re) => (h.match(re) || []).length;

function renderChapter(book, chapter = 3) {
  const dir = path.join(REPO_ROOT, 'books', book, '03-translated/mt-preview', `ch0${chapter}`);
  const { byModule } = loadChapterTermEnglish(book, `ch0${chapter}`);
  const modules = fs.readdirSync(dir).filter((f) => f.endsWith('.cnxml')).sort().map((f) => f.replace('.cnxml', ''));
  const pages = modules.map((moduleId) =>
    renderCnxmlToHtml(fs.readFileSync(path.join(dir, `${moduleId}.cnxml`), 'utf8'), {
      chapter, moduleId, lang: 'is', termEnglish: byModule.get(moduleId) || null,
    }).html
  );
  const definitions = _extractChapterGlossaryForTest(chapter, modules, 'mt-preview');
  const keyTerms = renderCompiledGlossary(chapter, definitions, {
    termEnglishByModule: byModule, terms: {}, figures: {}, tables: {}, examples: {}, footnotes: [],
  });
  const all = pages.join('\n');
  return {
    definitions,
    dfn: count(all, /<dfn\b/g),
    dfnWithId: count(all, /<dfn\s+id="/g),
    dfnWithEn: count(all, /<dfn[^>]*\sdata-en="/g),
    dtWithId: count(keyTerms, /<dt\s+id="/g),
    dtWithEn: count(keyTerms, /<dt[^>]*\sdata-en="/g),
    html: all,
    keyTerms,
  };
}

describe('data-en reach, ch03, both live books', () => {
  let chem, org;
  beforeAll(() => { chem = renderChapter('efnafraedi-2e'); org = renderChapter('lifraen-efnafraedi'); }, 120000);

  it('🔴 chemistry: EVERY id-bearing <dfn> carries data-en', () => {
    expect(chem.dfnWithId).toBe(20);          // non-vacuity FIRST: an equality of two zeros proves nothing
    expect(chem.dfnWithEn).toBe(chem.dfnWithId);
  });

  it('🔴 organic: EVERY id-bearing <dfn> carries data-en', () => {
    expect(org.dfnWithId).toBe(39);
    expect(org.dfnWithEn).toBe(org.dfnWithId);
  });

  it('🔴 chemistry key-terms page: every <dt id> carries data-en — the <dt>, not a <dfn>', () => {
    expect(chem.dtWithId).toBe(20);
    expect(chem.dtWithEn).toBe(chem.dtWithId);
    expect(chem.keyTerms).not.toContain('<dfn');
  });

  it('organic has no <dt> population — paired with the control that EXPLAINS the zero', () => {
    expect(org.definitions.length).toBe(0);   // organic ch03 carries no <glossary> at all
    expect(org.dtWithEn).toBe(0);
  });

  it('🔴 DEGRADE PIN — with no map, output is byte-identical apart from the missing attributes', () => {
    const dir = path.join(REPO_ROOT, 'books/efnafraedi-2e/03-translated/mt-preview/ch03');
    const src = fs.readFileSync(path.join(dir, 'm68700.cnxml'), 'utf8');
    const { byModule } = loadChapterTermEnglish('efnafraedi-2e', 'ch03');
    const withMap = renderCnxmlToHtml(src, { chapter: 3, moduleId: 'm68700', lang: 'is', termEnglish: byModule.get('m68700') }).html;
    const without = renderCnxmlToHtml(src, { chapter: 3, moduleId: 'm68700', lang: 'is', termEnglish: null }).html;
    expect(count(withMap, /\sdata-en="/g)).toBe(4);        // control: the arms really differ
    expect(without).not.toContain('data-en');
    expect(withMap.replace(/ data-en="[^"]*"/g, '')).toBe(without);
  });

  it('🔴 CASE IS PRESERVED — data-en is strictly higher fidelity than the inline gloss', () => {
    const dt = /<dt id="fs-idp40901280"[^>]*>/.exec(chem.keyTerms)[0];
    expect(dt).toContain('data-en="Avogadro’s number (NA)"');
    // The published inline gloss on the SAME element is lowercased by the inject-side
    // annotator: "(e. avogadro’s number (na))". Contrast is the control.
    expect(dt).not.toContain('avogadro’s number (na)');
  });

  it('no data-en value contains raw marker syntax', () => {
    const values = [...chem.html.matchAll(/\sdata-en="([^"]*)"/g), ...org.html.matchAll(/\sdata-en="([^"]*)"/g)].map((m) => m[1]);
    expect(values.length).toBeGreaterThan(0);
    for (const v of values) expect(v).not.toMatch(/\[\[|\]\]/);
  });
});
```

**What would make each assertion fail — if you cannot name one, the assertion is worthless:**

| Assertion | Fails when |
|---|---|
| chemistry 20/20, organic 39/39 `<dfn>` | Site A's emit is dropped, or `main()`/`renderService` stops passing `options.termEnglish`, or the loader's moduleId guard wrongly refuses a valid manifest |
| chemistry 20/20 `<dt>`, and no `<dfn>` on that page | Site C's emit is dropped, keyed on the wrong module, or routed through `processInlineContent` (which would emit 0 while every module page still looked right) |
| organic `definitions.length === 0` paired with `dtWithEn === 0` | `extractChapterGlossary` stops stamping `moduleId`, or the zero starts coming from a broken renderer instead of an empty input |
| degrade pin (byte-identical modulo the attribute) | the attribute is emitted with an empty/undefined value, the `id` emission is changed (e.g. by adding `escapeAttr` to it), or any other byte moves alongside `data-en` |
| case pin | a lowercase fold returns to the flatten path (Task 1's shipped defect), or the key-terms lookup starts reading the inject-side gloss instead of the manifest |
| no marker syntax | `flattenMarkersToText` regresses to a `[^\]]*` scan and truncates a two-level nested payload |

- [ ] **Step 3: Run it**

```bash
pgrep -x node | wc -l      # confirm no peer suite is running
npx vitest run tools/__tests__/term-english-corpus.test.js
```
Expected: **PASS, 7 tests.** If `dfnWithId` is 20 but `dfnWithEn` is 0, Task 3 Step 9's caller wiring did not land — the unit tests would still be green, because they pass the option directly.

- [ ] **Step 4: Confirm the free, source-anchored QC tier is untouched**

```bash
node tools/source-roundtrip-check.js efnafraedi-2e ch03 --verbose | tail -3
node tools/render-oracle-check.js efnafraedi-2e ch03 --control | tail -3
node tools/render-oracle-check.js lifraen-efnafraedi ch03 --control | tail -3
```
Expected: the round-trip shows the **same known differences as the pre-Task-3 baseline** (`meaning#` ids, plus organic's single `list-type`) and **both controls pass**. `data-en` is render-only, so the round-trip must be byte-unchanged — **if it moved, something wrote into the CNXML**, which §5 of the spec forbids. Capture the baseline output before Task 3 if you have not already; a clean result with no control is not evidence.

- [ ] **Step 5: Commit the acceptance test**

```bash
npm test > /tmp/te-t6.log 2>&1
grep -aoE '^\s*[×✕] .*' /tmp/te-t6.log | sed -E 's/[0-9]+ms[[:space:]]*$//; s/[[:space:]]+$//' | sort -u > /tmp/te-t6.set
diff /tmp/te-base.set /tmp/te-t6.set
git status --porcelain books/ | wc -l
git add tools/__tests__/term-english-corpus.test.js tools/cnxml-render.js
git commit -m "test(term-english): pin data-en reach at the rendered output for both element shapes"
```
Expected: `diff` silent, `0` from `git status`.

- [ ] **Step 6: 🔴 GATED — the re-render that writes `05-publication`. STOP AND ASK FIRST.**

**Do not run this on your own judgement.** `03-translated` is ahead of `05-publication`: `m68700` was re-injected under `--no-annotate-en` (the holding state for register ⑰), so **a chemistry ch03 re-render deletes 8 reader-visible glosses** — `m68700`'s 4 `<dfn>` and its 4 `<dt>` — with nothing rendering in their place until vefur consumes `data-en`. That is true before this work and is not caused by it, but this task is what would ship it.

Surface it as a decision, with the options:
1. **Hold.** Land Tasks 3–6 as tools-only commits; re-render when vefur's consumer is live. `data-en` reaches readers a cycle later; nothing is lost.
2. **Re-render now**, accepting 8 fewer glosses on `3-1-formulumassi-og-molhugtakid.html` and `3-key-terms.html` for one cycle.
3. **Re-annotate `m68700` first** (retire the `--no-annotate-en` holding state), which requires register ⑰'s nesting fix to be confirmed on that module.

If and only if the user chooses (2) or (3):

```bash
node tools/cnxml-render.js --book efnafraedi-2e --chapter 3 2>&1 | grep -a "terms:\|key-terms:"
node tools/cnxml-render.js --book lifraen-efnafraedi --chapter 3 2>&1 | grep -a "terms:\|key-terms:"
git status --porcelain books/ | grep -av '^ M books/[^/]*/05-publication/mt-preview/chapters/03/' | wc -l
```
Expected: the coverage lines from Task 5 Step 2; and **`0`** from the last command — proving *only* ch03 publication pages moved, nothing else under `books/`.

Then, before committing, confirm the gloss delta is exactly the expected one:

```bash
git diff --numstat books/efnafraedi-2e/05-publication/mt-preview/chapters/03/
grep -aoc 'data-en=' books/efnafraedi-2e/05-publication/mt-preview/chapters/03/3-key-terms.html
```
Expected: `20` from the second command, and the diff limited to `data-en` additions plus the 8 removed `(e. …)` glosses on `m68700`'s two pages.

⚠️ **§C9 prune-on-rename:** if any page is superseded, hand vefur the `from`/`to`/`moduleId` rows from `books/<slug>/05-publication/mt-preview/slug-map.mt-preview.json` **before** the sync — a redirect entry is inert until its target is published, so landing it early is the only ordering with no 404 window.

---


## Task 7: The vefur handover contract

**Do NOT flip `annotateEn` off in this task.** The spec's §4.7 says to default it off; taken literally that is a reader-visible regression, because a chapter re-rendered before vefur ships its half would lose the gloss entirely. The correct order is: emit `data-en` **alongside** the existing inline gloss, and flip the default only once vefur is live.

**Files:**
- Create: `docs/handoff/2026-09-02-vefur-term-english-contract.md`

- [ ] **Step 1: Write the contract**

Create `docs/handoff/2026-09-02-vefur-term-english-contract.md`:

```markdown
# Contract: `data-en` on `dfn.term` (efni → vefur)

**Shipped from efni:** (paste the output of `git rev-parse --short HEAD` here)
**Spec:** `namsbokasafn-efni/docs/superpowers/specs/2026-09-01-term-english-attribute-design.md`

## What efni now emits

`<dfn id="term-00001" class="term" data-en="formula mass">formúlumassa</dfn>`

- `data-en` holds **plain-text English**, original case, no marker syntax.
- It is **absent** when the English is unknown. Absence is normal, not an error.
- Nothing else about the element changed.
- It appears only in **re-rendered** chapters. Rollout is per chapter.

## What vefur should do

1. In `src/lib/actions/glossaryTerms.ts`, which already walks every `dfn.term`:
   append a real `<span class="term-en"> (e. …)</span>`. **A real element, not a
   CSS `::after`** — generated content is not selectable, not copyable, and is
   announced inconsistently by screen readers.
2. **Do not double-render.** A page may carry an old inline `(e. dynamics)` in
   the text AND a new `data-en`. The existing `stripEnglishSuffix()` already
   detects the inline form: if the text already ends in `(e. …)`, add no span.
3. Add `showTermEnglish: boolean` to the settings store, default `true`,
   following `glossaryHighlighting` exactly (same `isBoolean` validator, same
   `set`/`toggle` pair).
4. Tier 1 of the three-tier match can now use `data-en` against `englishMap`
   instead of scraping the English out of display text.
5. Add a test in vefur's own suite that fails if `data-en` stops being read. efni
   cannot pin this from its side today (the consumer does not exist yet); once it
   does, efni adds the mirror assertion in the
   `tools/__tests__/css-contract.test.js` style, which already reads vefur's
   `static/styles/content.css` across the repo boundary.

## The gate that must not be skipped

efni will keep emitting the inline `(e. …)` gloss until vefur ships. **Tell efni
when this is live**; only then does efni flip `annotateEn` to default off and
retire `annotateInlineTerms` (which is the cause of register defect ⑰).

## Not covered by this contract

Register ⑯ — a whole-segment `[[docref:]]` is never translated (49 of 49) — is a
separate defect in the same marker layer and is a **precondition on publishing
organic ch03**. This contract does not address it.
```

- [ ] **Step 2: Run lint and format, exactly as CI does**

```bash
npm run lint && npm run format:check
```

Expected: both clean. If prettier complains, run `npx prettier --write` on the files it names and re-run.

- [ ] **Step 3: Final full-suite check**

```bash
npm test > /tmp/final.log 2>&1; echo "EXIT=$?" >> /tmp/final.log
grep -aE "Test Files|Tests  |EXIT" /tmp/final.log
```

Expected: **60 failed**, and passing risen by exactly the number of tests this plan added (11 + 8 + 6 + 3 + 3 + 6 = 37). A failing count above 60 is a regression you introduced — do not proceed.

- [ ] **Step 4: Commit**

```bash
git add docs/handoff/2026-09-02-vefur-term-english-contract.md
git commit -m "docs(handoff): the data-en contract for vefur, and the gate before retiring annotateEn"
```

---

## Additions to Task 7 (the handover contract) — do not rewrite it, add these

Task 7 already correctly refuses to flip `annotateEn` off. Add three facts it must carry, all measured:

1. **efni emits `data-en` on TWO element shapes.** `<dfn id class="term" data-en>` on section pages (20 chemistry / 39 organic in ch03), and **`<dt id data-en>` on `*-key-terms.html`** (20 chemistry, 0 organic). vefur's `glossaryTerms.ts:318` walks `dfn.term` only, so **the `<dt>` half has no consumer today**. Name the choice — vefur widens to `dt[data-en]`, or efni wraps the `<dt>`'s term in a `<dfn class="term">` (a `content.css` contract change) — and record that **spec §4.7 is blocked on it**.
2. **Dedupe must key on the marker, never on equality with `data-en`.** vefur's `stripEnglishSuffix()` searches for the literal `' (e. '`; the inline gloss is **lowercased** by the inject-side annotator while `data-en` is **case-preserving** — measured on the same element: `data-en="Avogadro’s number (NA)"` against a text reading `(e. avogadro’s number (na))`. A string comparison between the two will never match, and would render the gloss twice.
3. **`EN === IS` must not render `"R (e. R)"`.** Organic ch03's `<dfn id="term-00002" class="term">R</dfn>` has manifest English `"R"`. Today's `annotateInlineTerms` skips it; vefur's presentation layer must skip it too.

Also record the two structural limits, so a future reach test is not written against an impossible 100%:
- **2 of 854** in-content chemistry `<term>` carry no id in READ-ONLY `01-source` (`ch04/m68709` *efnajöfnu*, `ch06/m68735` *samrafeinda*). Extract does not mint ids, so no id join will ever reach them. The ceiling is **852 of 854**.
- **510 of 523** manifests have no `termEnglish` key. Rollout is **per chapter, on re-extraction**; until then those chapters render `0/N` and say so in the coverage line. That is the degrade rule working, not a code failure.
## Follow-ups, deliberately out of scope

- **Retiring `annotateInlineTerms`** — gated on vefur shipping (Task 7). It is the cause of register ⑰.
- **The efni-side cross-repo pin (spec §6 item 5).** The spec asks for a `css-contract.test.js`-style
  assertion that the contract holds across the repo boundary. **It is not in this plan and that is
  deliberate:** the only thing worth pinning from efni is that vefur still *reads* `data-en`, and
  vefur's consumer does not exist yet — a test written now would assert nothing, which is worse than
  no test. It lands in the same change that retires `annotateInlineTerms`. Task 6 pins the efni half
  (rendered `dfn.term` carries `data-en`) today.
- **`data-term`** (the Icelandic lemma) — measured 77.9%, rejected on YAGNI in the spec §5.
- **`cnxml-render.js:353`** resolves its dictionary path with `path.join('books', …)` — cwd-relative, which the Global Constraints forbid. Pre-existing, unrelated, logged in the spec §7.
- **Register ⑯** — the untranslated `[[docref:]]` labels. Same marker layer, different defect, and it blocks publishing organic ch03.
