# Term English Attribute Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

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

## Task 3: Render emits `data-en` at the two id-bearing sites

**Files:**
- Modify: `tools/cnxml-render.js` — manifest load + `context` at line ~668
- Modify: `tools/lib/cnxml-elements.js` — `renderTerm` at line ~646, regex branch at line ~802
- Create: `tools/__tests__/render-term-english.test.js`

**Interfaces:**
- Consumes: `manifest.termEnglish` from Task 2.
- Produces: `context.termEnglish` (`Record<string,string>`), read by Task 4.

- [ ] **Step 1: Write the failing test**

Create `tools/__tests__/render-term-english.test.js`:

```js
/**
 * `<dfn data-en="…">` — the attribute vefur's tier-1 term matching consumes.
 *
 * THREE call sites emit a <dfn> and all three must carry the attribute. Site 3
 * (the id-less glossary branch) is 46% of the corpus and is the one a plan
 * omits; it is covered in Task 4.
 */
import { describe, it, expect } from 'vitest';
import { renderTerm, processInlineContent } from '../lib/cnxml-elements.js';

const ctx = (termEnglish) => ({ termEnglish, terms: {}, equations: [], figures: [] });

describe('site 1 — renderTerm()', () => {
  it('emits data-en when the id is in the map', () => {
    const html = renderTerm('formúlumassa', { id: 'term-00001' }, ctx({ 'term-00001': 'formula mass' }));
    expect(html).toContain('data-en="formula mass"');
    expect(html).toContain('id="term-00001"');
  });

  it('omits the attribute entirely when the id is absent — degrade, never corrupt', () => {
    const html = renderTerm('formúlumassa', { id: 'term-99999' }, ctx({ 'term-00001': 'formula mass' }));
    expect(html).not.toContain('data-en');
    expect(html).toContain('<dfn');
  });

  it('escapes a quote in the English rather than breaking the attribute', () => {
    const html = renderTerm('x', { id: 't1' }, ctx({ t1: 'the "mole" concept' }));
    expect(html).not.toMatch(/data-en="the "mole"/);
    expect(html).toContain('&quot;');
  });

  it('CONTROL — an empty map yields a well-formed <dfn> with no attribute', () => {
    expect(renderTerm('x', { id: 't1' }, ctx({}))).toContain('<dfn');
  });
});

describe('site 2 — the id-bearing regex branch in processInlineContent', () => {
  it('emits data-en for an inline <term id>', () => {
    const html = processInlineContent(
      'Eitt <term id="term-00002">mól</term> af efni',
      ctx({ 'term-00002': 'mole' })
    );
    expect(html).toContain('data-en="mole"');
  });

  it('omits it when unknown', () => {
    const html = processInlineContent('<term id="term-777">x</term>', ctx({ 'term-00002': 'mole' }));
    expect(html).not.toContain('data-en');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tools/__tests__/render-term-english.test.js`
Expected: FAIL — `expected '<dfn id="term-00001" class="term">formúlumassa</dfn>' to contain 'data-en="formula mass"'`.

- [ ] **Step 3: Emit the attribute at site 1**

In `tools/lib/cnxml-elements.js`, replace `renderTerm` (line ~646) with:

```js
export function renderTerm(content, attrs, context) {
  const id = attrs.id || null;
  const processedContent = processInlineContent(content, context);
  // data-en is vefur's tier-1 term key. Absent when unknown — degraded, never
  // corrupt. See docs/superpowers/specs/2026-09-01-term-english-attribute-design.md
  const en = id && context && context.termEnglish ? context.termEnglish[id] : undefined;
  const dfnAttrs = { id, class: 'term' };
  if (en) dfnAttrs['data-en'] = en;
  return createElement('dfn', dfnAttrs, processedContent);
}
```

- [ ] **Step 4: Emit the attribute at site 2**

In the same file, replace the id-bearing regex branch (line ~802) with:

```js
  result = result.replace(/<term\s+id="([^"]*)"[^>]*>([\s\S]*?)<\/term>/g, (match, id, inner) => {
    const en = context && context.termEnglish ? context.termEnglish[id] : undefined;
    const enAttr = en ? ` data-en="${escapeAttr(en)}"` : '';
    return `<dfn id="${escapeAttr(id)}" class="term"${enAttr}>${processInlineContent(inner, context)}</dfn>`;
  });
```

⚠️ Confirm `escapeAttr` is already imported in this file; if not, add it from wherever the sibling escapers come from (`grep -an "escapeAttr" tools/lib/cnxml-elements.js`).

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run tools/__tests__/render-term-english.test.js`
Expected: PASS, 6 tests.

- [ ] **Step 6: Load the manifest into the render context**

In `tools/cnxml-render.js`, add a loader near `loadEquationTextDictionary` (line ~352):

```js
/**
 * Load a module's `termEnglish` map from its extraction manifest.
 * Resolved against import.meta.url, never process.cwd() — the server runs with
 * cwd=server/, and a cwd-relative path silently points at the wrong tree.
 * @returns {{map: Record<string,string>, sourceHash: string|null}}
 */
function loadTermEnglish(bookSlug, chapterDir, moduleId) {
  const p = path.join(BOOKS_DIR, bookSlug, '02-structure', chapterDir, `${moduleId}-manifest.json`);
  try {
    const m = JSON.parse(fs.readFileSync(p, 'utf-8'));
    return { map: m.termEnglish || {}, sourceHash: m.sourceHash || null };
  } catch {
    return { map: {}, sourceHash: null };
  }
}
```

⚠️ `BOOKS_DIR` must already be an absolute constant in this file. Verify with `grep -an "const BOOKS_DIR" tools/cnxml-render.js`. If it is built from `process.cwd()`, fix it to derive from `import.meta.url` — that is a Global Constraint.

Then in the `context` object at line ~668, add:

```js
    termEnglish: TERM_ENGLISH.map,
```

…where `TERM_ENGLISH` is assigned from `loadTermEnglish(BOOK_SLUG, chapterDir, moduleId)` at the point the module's CNXML is read. Find that read (`grep -an "translatedCnxmlPath" tools/cnxml-render.js`) and place the call beside it so both use the same `moduleId`.

- [ ] **Step 7: Verify end to end on a real module**

```bash
node tools/cnxml-render.js --book efnafraedi-2e --chapter 3
grep -aoh '<dfn[^>]*data-en="[^"]*"' books/efnafraedi-2e/05-publication/mt-preview/chapters/03/*.html | head -5
```

Expected: `<dfn id="term-00001" class="term" data-en="formula mass"` — with **capitalised** proper nouns where applicable.

- [ ] **Step 8: Commit**

```bash
npm test > /tmp/t3.log 2>&1; grep -aE "Test Files|Tests  " /tmp/t3.log
git add tools/cnxml-render.js tools/lib/cnxml-elements.js tools/__tests__/render-term-english.test.js books/*/05-publication
git commit -m "feat(render): emit data-en on id-bearing <dfn> from the manifest term map"
```

Expected in `/tmp/t3.log`: **60 failed**, unchanged file set.

---

## Task 4: Site 3 — the id-less glossary branch

**Why it is separate:** this site is **46% of the corpus** (765 of 1,656 injected `<term>` elements have no id) and needs the enclosing `<definition>` id, which lives one function away. It is also the site where a careless fix introduces a real bug — see Step 3.

**Files:**
- Modify: `tools/cnxml-render.js` — `renderGlossary` at line ~1993
- Modify: `tools/lib/cnxml-elements.js` — id-less regex branch at line ~805
- Modify: `tools/__tests__/render-term-english.test.js`

**Interfaces:**
- Consumes: `context.termEnglish` from Task 3.
- Produces: `context.definitionId` — a **scoped** string, set only while rendering a definition's `<term>`.

- [ ] **Step 1: Write the failing test**

Append to `tools/__tests__/render-term-english.test.js`:

```js
describe('site 3 — the id-less glossary branch', () => {
  const ctx3 = (termEnglish, definitionId) => ({
    termEnglish,
    definitionId,
    terms: {},
    equations: [],
    figures: [],
  });

  it('emits data-en for an id-less <term> using the scoped definition id', () => {
    const html = processInlineContent(
      '<term>formúlumassa</term>',
      ctx3({ 'fs-idp40905984': 'formula mass' }, 'fs-idp40905984')
    );
    expect(html).toContain('data-en="formula mass"');
    expect(html).toContain('<dfn class="term"');
  });

  it('emits nothing when no definitionId is scoped — a bare inline <term> in prose', () => {
    const html = processInlineContent(
      '<term>formúlumassa</term>',
      ctx3({ 'fs-idp40905984': 'formula mass' }, undefined)
    );
    expect(html).not.toContain('data-en');
  });

  it('🔴 a <term> nested inside a <meaning> must NOT inherit the definition English', () => {
    // renderGlossary calls processInlineContent twice — once for the term, once
    // for the meaning. Scoping definitionId to the term call is what stops the
    // meaning's nested terms being mislabelled. 0 of 763 definitions do this
    // today; it is guarded anyway, because the corpus sets the exposure.
    const html = processInlineContent(
      '<term>eitthvað annað</term>',
      ctx3({ 'fs-idp40905984': 'formula mass' }, undefined)
    );
    expect(html).not.toContain('formula mass');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tools/__tests__/render-term-english.test.js -t "id-less"`
Expected: FAIL on the first case — no `data-en` emitted.

- [ ] **Step 3: Emit the attribute at site 3**

In `tools/lib/cnxml-elements.js`, replace the id-less regex branch (line ~805) with:

```js
  result = result.replace(/<term[^>]*>([\s\S]*?)<\/term>/g, (match, inner) => {
    // A glossary definition's <term> carries no id of its own; its English is
    // keyed on the PARENT <definition> id, which renderGlossary scopes onto the
    // context for this call only.
    const defId = context && context.definitionId;
    const en = defId && context.termEnglish ? context.termEnglish[defId] : undefined;
    const enAttr = en ? ` data-en="${escapeAttr(en)}"` : '';
    return `<dfn class="term"${enAttr}>${processInlineContent(inner, context)}</dfn>`;
  });
```

- [ ] **Step 4: Scope `definitionId` in `renderGlossary`**

In `tools/cnxml-render.js`, inside `renderGlossary`'s loop (line ~2010), change **only the term call**:

```js
      const termInner = termMatch[1].trim();
      // Scoped clone: the definition id applies to the TERM, never to the
      // MEANING. A definition-wide context would let a <term> nested inside a
      // <meaning> inherit the wrong English.
      const termHtml = processInlineContent(termInner, { ...context, definitionId: id });
      const meaning = processInlineContent(meaningMatch[1], context);
```

⚠️ **Do not** add `definitionId` to the `meaning` call. That is the whole point of Step 1's third test.

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run tools/__tests__/render-term-english.test.js`
Expected: PASS, 9 tests.

- [ ] **Step 6: Verify on the real corpus**

```bash
node tools/cnxml-render.js --book efnafraedi-2e --chapter 3
grep -aoh '<dfn class="term" data-en="[^"]*"' books/efnafraedi-2e/05-publication/mt-preview/chapters/03/*.html | head -5
```

Expected: id-less glossary `<dfn>` elements now carry `data-en`.

- [ ] **Step 7: Commit**

```bash
npm test > /tmp/t4.log 2>&1; grep -aE "Test Files|Tests  " /tmp/t4.log
git add tools/cnxml-render.js tools/lib/cnxml-elements.js tools/__tests__/render-term-english.test.js books/*/05-publication
git commit -m "feat(render): id-less glossary terms get data-en via a scoped definition id"
```

Expected: **60 failed**, unchanged.

---

## Task 5: Vintage guard and a visible annotated/skipped count

**Why:** extract **mints** `term-0000N` positionally (m68700 has 8 source `<term>`, only 4 with an id), so a manifest from a different extraction vintage shifts every inline term's English silently and plausibly. And a silently missing attribute is exactly this project's recurring failure mode — a number that moves is visible, an absence is not.

**Files:**
- Modify: `tools/cnxml-render.js`
- Modify: `tools/__tests__/render-term-english.test.js`

**Interfaces:**
- Consumes: `loadTermEnglish` from Task 3 (now also returns `sourceHash`).

- [ ] **Step 1: Write the failing test**

Append to `tools/__tests__/render-term-english.test.js`:

```js
import { termEnglishVintageWarning } from '../cnxml-render.js';

describe('vintage guard', () => {
  it('warns when the manifest hash does not match the module being rendered', () => {
    expect(termEnglishVintageWarning('aaaa', 'bbbb', 'm68700')).toMatch(/m68700/);
    expect(termEnglishVintageWarning('aaaa', 'bbbb', 'm68700')).toMatch(/stale/i);
  });

  it('is silent when the hashes agree', () => {
    expect(termEnglishVintageWarning('aaaa', 'aaaa', 'm68700')).toBeNull();
  });

  it('is silent when there is no manifest hash to compare — absence is not a mismatch', () => {
    expect(termEnglishVintageWarning(null, 'bbbb', 'm68700')).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tools/__tests__/render-term-english.test.js -t "vintage"`
Expected: FAIL — `termEnglishVintageWarning is not a function`.

- [ ] **Step 3: Implement the guard**

In `tools/cnxml-render.js`, add beside `loadTermEnglish`:

```js
/**
 * Compare the manifest's extraction vintage against the module being rendered.
 * Returns a warning string, or null when there is nothing to warn about.
 *
 * Extract MINTS `term-0000N` ids positionally, so a stale manifest shifts every
 * inline term's English by one — silently, and plausibly. This is the
 * same-unit/same-vintage invariant (§C82 L136), made checkable at the point of
 * use rather than assumed.
 */
export function termEnglishVintageWarning(manifestHash, moduleHash, moduleId) {
  if (!manifestHash || !moduleHash) return null;
  if (manifestHash === moduleHash) return null;
  return `⚠️  ${moduleId}: term manifest is a STALE VINTAGE (manifest ${manifestHash} vs source ${moduleHash}) — data-en may be shifted; re-run cnxml-extract for this chapter`;
}
```

Call it where the module is rendered, printing to `console.error` when non-null.

⚠️ The `moduleHash` is the hash of the **`01-source` CNXML**, computed the same way `buildManifest` computes `sourceHash`. Find that function (`grep -an "sourceHash" tools/cnxml-extract.js`) and reuse the identical algorithm, or the comparison will always mismatch.

- [ ] **Step 4: Add the annotated/skipped report**

Where the module finishes rendering, count and print:

```js
  const dfnTotal = (html.match(/<dfn\b/g) || []).length;
  const dfnWithEn = (html.match(/<dfn[^>]*\sdata-en=/g) || []).length;
  if (dfnTotal > 0) {
    console.log(`  terms: ${dfnWithEn}/${dfnTotal} carry data-en`);
  }
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run tools/__tests__/render-term-english.test.js`
Expected: PASS, 11 tests.

- [ ] **Step 6: See the report on a real run**

```bash
node tools/cnxml-render.js --book efnafraedi-2e --chapter 3 2>&1 | grep -a "terms:"
```

Expected: lines like `terms: 32/40 carry data-en`.

- [ ] **Step 7: Commit**

```bash
npm test > /tmp/t5.log 2>&1; grep -aE "Test Files|Tests  " /tmp/t5.log
git add tools/cnxml-render.js tools/__tests__/render-term-english.test.js
git commit -m "feat(render): warn on a stale term manifest and report data-en coverage per module"
```

---

## Task 6: Corpus acceptance — reach, measured at the rendered HTML

**Why this task exists separately:** every previous task tested a function. This one tests the **composition**, which is where this pipeline's defects actually live: a marker can be emitted, resolved and residue-checked and the output still be wrong. It also pins the no-regression number, which is the only thing that proves site 3 was not missed.

**Files:**
- Create: `tools/__tests__/term-english-corpus.test.js`

- [ ] **Step 1: Capture the pre-change reach number**

```bash
git stash
node -e "
const fs=require('fs'),path=require('path'),d='books/efnafraedi-2e/03-translated/mt-preview/ch03';
let g=0,t=0;for(const f of fs.readdirSync(d).filter(f=>f.endsWith('.cnxml'))){
 const s=fs.readFileSync(path.join(d,f),'utf8');
 for(const m of s.matchAll(/<term\b[^>]*>([\s\S]*?)<\/term>/g)){t++;if(/\(e\. /.test(m[1]))g++;}}
console.log('chemistry ch03: '+g+' glossed of '+t);"
git stash pop
```

Expected: `chemistry ch03: 32 glossed of 40` (16 id-bearing + 16 id-less). **Write the number you actually get into the test below** — the corpus may have moved.

- [ ] **Step 2: Write the failing test**

Create `tools/__tests__/term-english-corpus.test.js`:

```js
/**
 * Reach, measured at the RENDERED HTML — not at the manifest.
 *
 * A manifest entry is not evidence the renderer used it. §C82 L149's rule is
 * that reach is measured emitted → injected → RENDERED, because a container fix
 * once reached the injected CNXML 102/102 and the HTML 0/102.
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const REPO_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const chapterDir = (book) =>
  path.join(REPO_ROOT, 'books', book, '05-publication/mt-preview/chapters/03');

function dfns(book) {
  const d = chapterDir(book);
  const out = [];
  for (const f of fs.readdirSync(d).filter((f) => f.endsWith('.html'))) {
    const html = fs.readFileSync(path.join(d, f), 'utf8');
    for (const m of html.matchAll(/<dfn\b[^>]*>/g)) out.push(m[0]);
  }
  return out;
}

describe('data-en reach over the rendered ch03 corpus', () => {
  it('chemistry: the corpus is non-empty — otherwise every assertion below is vacuous', () => {
    expect(dfns('efnafraedi-2e').length).toBeGreaterThan(30);
  });

  it('🔴 chemistry: no regression — at least as many terms carry data-en as carried a gloss', () => {
    const all = dfns('efnafraedi-2e');
    const withEn = all.filter((d) => /\sdata-en=/.test(d));
    // 32 of 40 carried "(e. …)" before this change. Update if Step 1 differed.
    expect(withEn.length).toBeGreaterThanOrEqual(32);
  });

  it('🔴 chemistry: BOTH populations are covered — id-bearing and id-less', () => {
    const all = dfns('efnafraedi-2e').filter((d) => /\sdata-en=/.test(d));
    const idBearing = all.filter((d) => /\sid="/.test(d));
    const idLess = all.filter((d) => !/\sid="/.test(d));
    // Site 3 is 46% of the corpus. A plan that misses it shows up HERE as 0.
    expect(idBearing.length).toBeGreaterThan(0);
    expect(idLess.length).toBeGreaterThan(0);
  });

  it('organic: covered too, and it has no id-less population — a different shape', () => {
    const withEn = dfns('lifraen-efnafraedi').filter((d) => /\sdata-en=/.test(d));
    expect(withEn.length).toBeGreaterThanOrEqual(38);
  });

  it('🔴 case is preserved — proper nouns are not flattened', () => {
    const all = [...dfns('efnafraedi-2e'), ...dfns('lifraen-efnafraedi')];
    const values = all
      .map((d) => /\sdata-en="([^"]*)"/.exec(d))
      .filter(Boolean)
      .map((m) => m[1]);
    expect(values.length).toBeGreaterThan(0);
    expect(values.some((v) => /^[A-Z]/.test(v))).toBe(true);
  });

  it('no attribute contains raw marker syntax', () => {
    const all = [...dfns('efnafraedi-2e'), ...dfns('lifraen-efnafraedi')];
    for (const d of all) expect(d).not.toMatch(/data-en="[^"]*\[\[/);
  });
});
```

- [ ] **Step 3: Run it**

Run: `npx vitest run tools/__tests__/term-english-corpus.test.js`
Expected: PASS, 6 tests — the render runs in Tasks 3 and 4 already produced the output.

If the id-less assertion fails, Task 4 Step 4 did not take effect; re-run the render.

- [ ] **Step 4: Confirm the free QC tier still passes**

```bash
node tools/source-roundtrip-check.js efnafraedi-2e ch03 --verbose | tail -3
node tools/render-oracle-check.js efnafraedi-2e ch03 --control | tail -3
node tools/render-oracle-check.js lifraen-efnafraedi ch03 --control | tail -3
```

Expected: the round-trip shows the same known differences as before (`meaning#` ids only, plus organic's single `list-type`), and **both controls pass**. `data-en` is render-only, so the round-trip must be untouched — if it moved, something wrote into the CNXML.

- [ ] **Step 5: Commit**

```bash
git add tools/__tests__/term-english-corpus.test.js
git commit -m "test(term-english): pin data-en reach at the rendered HTML for both populations"
```

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
