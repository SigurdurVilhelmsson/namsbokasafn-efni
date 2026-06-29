# D1 PR-A — Config as Data (Mechanism) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move every book's render config + domain out of code into `books/<slug>/book-config.json`, loaded + deep-merged under `SHARED_*` defaults, with **render output byte-identical** (no enforcement yet — that's PR-B).

**Architecture:** `tools/lib/book-rendering-config.js` keeps its import surface but its five hardcoded per-book config objects move into data files; `getBookRenderConfig(slug)` reads the JSON and shallow-merges it over the in-code `SHARED_*` defaults (reproducing today's `{...SHARED, ...override}` spreads exactly). `bookToDomain` moves here and reads `config.domain`. A per-book golden-equality test is the migration oracle: loaded config must deep-equal the pre-migration code config.

**Tech Stack:** Node 22 ESM, Vitest, `fs`/`path`. No new dependencies.

**Design spec:** [docs/plans/2026-06-29-d1-book-config-as-data-design.md](2026-06-29-d1-book-config-as-data-design.md)

## Global Constraints

- **Robustness & future-proofing are the deciding factors** (plan Constraints / memory `feedback-robustness-over-expedience`): one real code path, overrides-only (no `SHARED_*` duplication → no drift), every committed book gets an explicit config.
- **Behavior-preserving PR:** render output must be byte-identical. The golden-equality test is the gate; a missing config file still falls back to SHARED-only (PR-B flips that to fail-loud).
- Node 22 / ESM: `export function`/`export const`, import siblings with `.js`.
- Test gate is **local**: `npm test` (CI credits may be exhausted).
- Commit trailer on every commit: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`
- 🔒 `books/*/01-source/` READ-ONLY (this PR writes only `books/<slug>/book-config.json`).

## File structure

- **Create** `books/<slug>/book-config.json` for 5 production books (efnafraedi-2e, liffraedi-2e, orverufraedi, lifraen-efnafraedi, edlisfraedi-2e) + 3 fixture/intake books (`__e2e-fixture__`, `testbook`, `stjornufraedi`).
- **Create** `tools/__tests__/fixtures/book-config-golden.json` — snapshot of current resolved configs (migration oracle).
- **Create** `tools/__tests__/book-rendering-config.test.js` — golden-equality + merge unit + bookToDomain tests.
- **Modify** `tools/lib/book-rendering-config.js` — add JSON loader + `bookToDomain`; delete the 5 code config objects + `BOOK_CONFIGS`.
- **Modify** `tools/api-translate.js` — delete the local `bookToDomain`; import + re-export it from `book-rendering-config.js`.

## Domain map (from current `bookToDomain`)

`efnafraedi-2e`→`chemistry`, `liffraedi-2e`→`biology`, `orverufraedi`→`microbiology`, `lifraen-efnafraedi`→`chemistry`, `edlisfraedi-2e`→`physics`. Fixture/intake books → `science`.

---

### Task 1: Capture the golden snapshot + characterization test

Establishes the migration oracle **from current code, before any change**. The test passes on current code (it's a characterization guard for Tasks 2–3, not a red-first test).

**Files:**
- Create: `tools/__tests__/fixtures/book-config-golden.json`
- Create: `tools/__tests__/book-rendering-config.test.js`

**Interfaces:**
- Consumes: current `getBookRenderConfig(slug)` from `tools/lib/book-rendering-config.js`.
- Produces: the golden fixture + a `describe('getBookRenderConfig golden equality')` block later tasks must keep green.

- [ ] **Step 1: Generate the golden fixture from current code**

Run this one-time script (not committed):

```bash
node --input-type=module -e '
import { getBookRenderConfig } from "./tools/lib/book-rendering-config.js";
import fs from "fs";
const slugs = ["efnafraedi-2e","liffraedi-2e","orverufraedi","lifraen-efnafraedi","edlisfraedi-2e"];
const golden = {};
for (const s of slugs) golden[s] = getBookRenderConfig(s);
fs.mkdirSync("tools/__tests__/fixtures", { recursive: true });
fs.writeFileSync("tools/__tests__/fixtures/book-config-golden.json", JSON.stringify(golden, null, 2) + "\n");
console.log("wrote golden for", slugs.length, "books");
'
```
Expected: `wrote golden for 5 books`.

- [ ] **Step 2: Write the characterization test**

Create `tools/__tests__/book-rendering-config.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { getBookRenderConfig } from '../lib/book-rendering-config.js';

const golden = JSON.parse(
  readFileSync(new URL('./fixtures/book-config-golden.json', import.meta.url), 'utf-8')
);

describe('getBookRenderConfig golden equality (migration oracle)', () => {
  for (const slug of Object.keys(golden)) {
    it(`reproduces the pre-migration config for ${slug}`, () => {
      expect(getBookRenderConfig(slug)).toEqual(golden[slug]);
    });
  }
});
```

- [ ] **Step 3: Run the test (green on current code)**

Run: `npx vitest run tools/__tests__/book-rendering-config.test.js`
Expected: PASS (5 tests) — the golden was captured from this same code.

- [ ] **Step 4: Commit**

```bash
git add tools/__tests__/fixtures/book-config-golden.json tools/__tests__/book-rendering-config.test.js
git commit -m "test(config): golden snapshot of per-book render configs (D1 PR-A oracle)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Generate `book-config.json` files + JSON loader

Generate the 5 override files from current code (correct-by-construction), then replace the code configs with the loader. Golden must stay green.

**Files:**
- Create: `books/{efnafraedi-2e,liffraedi-2e,orverufraedi,lifraen-efnafraedi,edlisfraedi-2e}/book-config.json`
- Modify: `tools/lib/book-rendering-config.js`
- Test: `tools/__tests__/book-rendering-config.test.js` (extend)

**Interfaces:**
- Consumes: `SHARED_NOTE_LABELS`, `SHARED_TITLE_TRANSLATIONS`, `SHARED_END_OF_CHAPTER` (in-code defaults, unchanged); the golden fixture from Task 1.
- Produces: `getBookRenderConfig(slug)` reading `books/<slug>/book-config.json` and shallow-merging over `SHARED_*`. Same return shape as before. Behavior on missing file: SHARED-only + `console.warn` (PR-B flips to throw).

- [ ] **Step 1: Generate the 5 override files from current code**

Run this one-time script **before** editing the loader (it relies on the code configs still existing):

```bash
node --input-type=module -e '
import { getBookRenderConfig } from "./tools/lib/book-rendering-config.js";
import { SHARED_NOTE_LABELS, SHARED_TITLE_TRANSLATIONS } from "./tools/lib/book-rendering-config.js";
import fs from "fs";
// SHARED_END_OF_CHAPTER is not exported; inline its keys (summary, glossary).
const SHARED_EOC_KEYS = ["summary", "glossary"];
const stripKeys = (obj, keys) => Object.fromEntries(Object.entries(obj).filter(([k]) => !keys.includes(k)));
const stripShared = (obj, shared) => Object.fromEntries(Object.entries(obj).filter(([k]) => !(k in shared)));
const domains = { "efnafraedi-2e":"chemistry","liffraedi-2e":"biology","orverufraedi":"microbiology","lifraen-efnafraedi":"chemistry","edlisfraedi-2e":"physics" };
for (const [slug, domain] of Object.entries(domains)) {
  const full = getBookRenderConfig(slug);
  const cfg = {
    domain,
    noteTypeLabels: stripShared(full.noteTypeLabels, SHARED_NOTE_LABELS),
    titleTranslations: stripShared(full.titleTranslations, SHARED_TITLE_TRANSLATIONS),
    endOfChapterSections: stripKeys(full.endOfChapterSections, SHARED_EOC_KEYS),
    excludedSectionClasses: full.excludedSectionClasses,
    specialModules: full.specialModules,
  };
  fs.writeFileSync(`books/${slug}/book-config.json`, JSON.stringify(cfg, null, 2) + "\n");
  console.log("wrote", slug);
}
'
```
Expected: `wrote efnafraedi-2e` … `wrote edlisfraedi-2e` (5 lines). Spot-check `books/efnafraedi-2e/book-config.json` contains `"domain": "chemistry"`, `"key-equations"` under `endOfChapterSections`, and `"m68859": "periodic-table"` under `specialModules`.

- [ ] **Step 2: Write a failing unit test for the new merge loader**

Add to `tools/__tests__/book-rendering-config.test.js`:

```js
describe('book-config.json loader merge semantics', () => {
  it('shallow-merges file overrides over SHARED defaults', () => {
    // efnafraedi-2e: SHARED note label survives, book-specific override is present
    const cfg = getBookRenderConfig('efnafraedi-2e');
    expect(cfg.noteTypeLabels['link-to-learning']).toBe('Tengill til náms'); // from SHARED
    expect(cfg.noteTypeLabels['green-chemistry']).toBe('Græn efnafræði'); // from file
  });

  it('keeps SHARED end-of-chapter sections (summary/glossary) after merge', () => {
    const cfg = getBookRenderConfig('liffraedi-2e');
    expect(cfg.endOfChapterSections.summary.titleIs).toBe('Samantekt');
    expect(cfg.endOfChapterSections.glossary.slug).toBe('key-terms');
  });

  it('falls back to SHARED-only for a book with no config file', () => {
    const cfg = getBookRenderConfig('no-such-book-xyz');
    expect(cfg.excludedSectionClasses).toEqual(['summary']);
    expect(cfg.specialModules).toEqual({});
  });
});
```

- [ ] **Step 3: Run — the new tests should still pass on current code, golden green**

Run: `npx vitest run tools/__tests__/book-rendering-config.test.js`
Expected: PASS (current code already satisfies these; this pins the contract before the refactor).

- [ ] **Step 4: Replace the loader; delete the code config objects**

In `tools/lib/book-rendering-config.js`: add `fs`/`path` imports at top; **delete** `CHEMISTRY_CONFIG`, `BIOLOGY_CONFIG`, `MICROBIOLOGY_CONFIG`, `ORGANIC_CHEMISTRY_CONFIG`, `COLLEGE_PHYSICS_CONFIG`, and `BOOK_CONFIGS`; replace `getBookRenderConfig` with the loader. Keep `SHARED_*`, `generateFallbackLabel`, `getExerciseSectionClasses`, and all exports. Add `bookToDomain`.

```js
import fs from 'fs';
import path from 'path';

// ... SHARED_NOTE_LABELS / SHARED_TITLE_TRANSLATIONS / SHARED_END_OF_CHAPTER unchanged ...

const _fileCache = new Map();

/** Read books/<slug>/book-config.json (memoized). Returns null if absent; throws on malformed JSON. */
function readBookConfigFile(bookSlug) {
  if (_fileCache.has(bookSlug)) return _fileCache.get(bookSlug);
  const p = path.join('books', bookSlug, 'book-config.json');
  const data = fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf-8')) : null;
  _fileCache.set(bookSlug, data);
  return data;
}

/** Shallow-merge file overrides over SHARED defaults (reproduces the old `{...SHARED, ...book}` spreads). */
function mergeWithShared(file) {
  const f = file || {};
  return {
    noteTypeLabels: { ...SHARED_NOTE_LABELS, ...(f.noteTypeLabels || {}) },
    titleTranslations: { ...SHARED_TITLE_TRANSLATIONS, ...(f.titleTranslations || {}) },
    endOfChapterSections: { ...SHARED_END_OF_CHAPTER, ...(f.endOfChapterSections || {}) },
    excludedSectionClasses: f.excludedSectionClasses || ['summary'],
    specialModules: f.specialModules || {},
  };
}

/**
 * Get rendering config for a book from its book-config.json, merged over SHARED defaults.
 * PR-A: a missing file falls back to SHARED-only (warn). PR-B flips this to fail-loud.
 * @param {string} bookSlug
 * @returns {object}
 */
function getBookRenderConfig(bookSlug) {
  const file = readBookConfigFile(bookSlug);
  if (!file) {
    console.warn(`Warning: No book-config.json for book "${bookSlug}", using defaults`);
  }
  return mergeWithShared(file);
}

/** Resolve a book's translation domain from book-config.json; 'science' when unknown. */
function bookToDomain(bookSlug) {
  const file = readBookConfigFile(bookSlug);
  return (file && file.domain) || 'science';
}
```

Update the export block to add `bookToDomain`:

```js
export {
  getBookRenderConfig,
  bookToDomain,
  generateFallbackLabel,
  getExerciseSectionClasses,
  SHARED_NOTE_LABELS,
  SHARED_TITLE_TRANSLATIONS,
};
```

- [ ] **Step 5: Run the config test — golden must stay green**

Run: `npx vitest run tools/__tests__/book-rendering-config.test.js`
Expected: PASS (golden equality for 5 books + merge units). If a golden case fails, the override generation lost a key — fix the file, do not edit the golden.

- [ ] **Step 6: Commit**

```bash
git add books/efnafraedi-2e/book-config.json books/liffraedi-2e/book-config.json books/orverufraedi/book-config.json books/lifraen-efnafraedi/book-config.json books/edlisfraedi-2e/book-config.json tools/lib/book-rendering-config.js tools/__tests__/book-rendering-config.test.js
git commit -m "refactor(config): load per-book render config from book-config.json (D1 PR-A)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Move `bookToDomain` off slug-prefix matching

`bookToDomain` now lives in `book-rendering-config.js` (Task 2). Point `api-translate.js` at it and delete its local copy, preserving the existing `api-translate.test.js` import.

**Files:**
- Modify: `tools/api-translate.js:305` (delete local `bookToDomain`; import + re-export)
- Test: `tools/__tests__/api-translate.test.js` (existing `bookToDomain` block — must stay green)

**Interfaces:**
- Consumes: `bookToDomain` from `tools/lib/book-rendering-config.js`.
- Produces: `api-translate.js` still exports `bookToDomain` (re-export), so `api-translate.test.js:11` import is unchanged.

- [ ] **Step 1: Run the existing bookToDomain tests (baseline green)**

Run: `npx vitest run tools/__tests__/api-translate.test.js -t "bookToDomain"`
Expected: PASS (4 tests) — they currently hit the local prefix-matching impl.

- [ ] **Step 2: Replace the local definition with an import + re-export**

In `tools/api-translate.js`: delete the `export function bookToDomain(bookSlug) { ... }` block (`:305-313`). Add to the existing imports from the config lib (or a new import line):

```js
import { getBookRenderConfig, bookToDomain } from './lib/book-rendering-config.js';
```
(adjust to merge with any existing `book-rendering-config.js` import). Then re-export so callers/tests keep working:

```js
export { bookToDomain };
```

- [ ] **Step 3: Run the bookToDomain tests against the config-backed impl**

Run: `npx vitest run tools/__tests__/api-translate.test.js -t "bookToDomain"`
Expected: PASS — `efnafraedi-2e`→chemistry, `liffraedi-2e`→biology, `orverufraedi`→microbiology (from their `book-config.json` `domain`), `unknown-book`→science (no file → default).

- [ ] **Step 4: Run the full api-translate suite (no regressions from the import change)**

Run: `npx vitest run tools/__tests__/api-translate.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add tools/api-translate.js
git commit -m "refactor(config): bookToDomain reads book-config.json domain, not slug prefix (D1 PR-A)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: First-class configs for fixture/intake books + full-suite green

Give `__e2e-fixture__`, `testbook`, `stjornufraedi` explicit `book-config.json` (domain `science`, SHARED-only render config) so no committed book relies on the implicit fallback — the robustness invariant PR-B's fail-loud depends on. Behavior-preserving: these resolve to the same SHARED-only config they get today (minus the warning).

**Files:**
- Create: `books/{__e2e-fixture__,testbook,stjornufraedi}/book-config.json`

**Interfaces:**
- Consumes: the Task 2 loader. Produces: every `books/*/` dir has a `book-config.json`.

- [ ] **Step 1: Write the minimal fixture configs**

For each of `__e2e-fixture__`, `testbook`, `stjornufraedi`, create `books/<slug>/book-config.json`:

```json
{
  "domain": "science",
  "noteTypeLabels": {},
  "titleTranslations": {},
  "endOfChapterSections": {},
  "excludedSectionClasses": ["summary"],
  "specialModules": {}
}
```

- [ ] **Step 2: Verify these resolve to SHARED-only (behavior-preserving)**

Run:
```bash
node --input-type=module -e '
import { getBookRenderConfig, bookToDomain } from "./tools/lib/book-rendering-config.js";
const c = getBookRenderConfig("__e2e-fixture__");
console.log("domain:", bookToDomain("__e2e-fixture__"));
console.log("excluded:", JSON.stringify(c.excludedSectionClasses));
console.log("noteLabel link-to-learning:", c.noteTypeLabels["link-to-learning"]);
'
```
Expected: `domain: science`, `excluded: ["summary"]`, `noteLabel link-to-learning: Tengill til náms` (SHARED survives the merge; no "No book-config.json" warning prints).

- [ ] **Step 3: Run the full local gate**

Run: `npm test`
Expected: PASS (full suite, incl. `cnxml-render`, `api-translate`, and the E2E-fixture-touching specs — render output unchanged because every production config is golden-equal and fixture books resolve to the prior SHARED-only default).

- [ ] **Step 4: Run validate (no new failures; PR-A adds no validate rules yet)**

Run: `npm run validate`
Expected: PASS (24/24 or current baseline — PR-A doesn't add config-coverage checks; that's PR-B).

- [ ] **Step 5: Commit**

```bash
git add books/__e2e-fixture__/book-config.json books/testbook/book-config.json books/stjornufraedi/book-config.json
git commit -m "chore(config): first-class book-config.json for fixture/intake books (D1 PR-A)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Self-review

**Spec coverage (PR-A scope only):**
- Dedicated `book-config.json` per book → Tasks 2 & 4. ✅
- Loader + shallow-merge reproducing `{...SHARED, ...override}` → Task 2 Step 4. ✅
- `bookToDomain` moves here, reads `config.domain` → Tasks 2 & 3. ✅
- Migration-fidelity oracle (config-equality, byte-identical render by construction) → Task 1 golden + Task 2 Step 5. ✅
- Every committed book gets an explicit config (incl. fixture/intake) → Task 4. ✅
- Loader tolerant of missing file in PR-A (fail-loud deferred to PR-B) → Task 2 Step 4 fallback. ✅
- Out of scope held: no `--book` required, no fail-loud throw, no `chapter-modules` change, no validate coverage — all PR-B. ✅

**Placeholder scan:** no TBD/TODO; every code step shows complete code; commands have expected output. ✅

**Type consistency:** `getBookRenderConfig(slug)` returns `{noteTypeLabels, titleTranslations, endOfChapterSections, excludedSectionClasses, specialModules}` (Task 2) — same shape the golden captured (Task 1) and the existing `cnxml-render.js`/`getExerciseSectionClasses` consume. `bookToDomain(slug)` signature identical to the deleted `api-translate.js` version (Task 3); re-export keeps `api-translate.test.js` import valid. `book-config.json` keys (`domain`, `noteTypeLabels`, `titleTranslations`, `endOfChapterSections`, `excludedSectionClasses`, `specialModules`) identical across the generator (Task 2 Step 1), the loader (Task 2 Step 4), and the fixture files (Task 4). ✅
