# buildModuleSections collection-order authority Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `buildModuleSections` derive chapter/appendix order from the authoritative `collection-order.json` (chapters via `chapters[].modules`, appendices via `appendixModules`) so a null/stale `sectionOrder` can no longer mis-order a chapter — fixing ch06 (m68733 → section 6.3) and preventing recurrence.

**Architecture:** Extract the current `sectionOrder`/alphabetical comparator into a named fallback, add two pure helpers (`authoritativeOrder` resolves a chapter to its ordered module-id list; `sortByAuthoritativeOrder` sorts structure entries by that list, appends unlisted stragglers with a loud warn), then wire them into `buildModuleSections` behind a memoized `loadCollectionOrder(book)`. Falls back to the current comparator only when no authoritative order exists (chapter 0/preface, or a book lacking the file).

**Tech Stack:** Node 22 ES modules, Vitest. `tools/lib/module-sections.js`, new `tools/__tests__/module-sections.test.js`.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-07-module-sections-collection-order-design.md`. Roadmap #6 in `docs/plans/2026-07-07-byte-perfect-efnafraedi-roadmap.md`.
- **`npm test` from the repo root is the authoritative gate** (no branch protection).
- **Provably inert except the ch06 fix:** verified empirically — sorting by collection-order matches today's `sectionOrder` order in every chapter of all 5 books except efnafraedi ch06, and equals `appendixModules` for the appendices. The fix must not change any other chapter's/appendix's section numbering or URLs.
- **`collection-order.json` is authoritative** and validated identical to the upstream OpenStax `collection.xml` (all 21 chapters, module order + titles). Shape: `{ chapters: [ { chapter: <number>, title, modules: [<id>…] } ], preface: "<id>", appendixModules: [<id>…] }`.
- **Fail-visible, not fail-fatal:** a structure module absent from the authoritative array → `console.warn` + deterministic placement after listed modules. Never `throw` (this helper runs in the editorial server's live-preview).
- **Code + tests only.** No `books/` re-render in this change (the ch06 re-render is deferred to F1).
- Robustness > expedience: one authoritative code path; the fallback is the documented exception for chapters/books the file doesn't cover.
- Branch: `fix/chem-module-sections-collection-order` (off `main` after F2 PR #249 merged).

---

### Task 1: Pure order-resolution helpers (TDD)

**Files:**
- Modify: `tools/lib/module-sections.js` (add helpers; extract the existing comparator — do NOT yet change `buildModuleSections`'s sort call)
- Test: `tools/__tests__/module-sections.test.js` (create)

**Interfaces:**
- Produces:
  - `legacyStructComparator(a, b) → number` — the current comparator, extracted verbatim; sorts `{ filename, data:{ sectionOrder } }` entries by `sectionOrder` (nulls last), then `filename`.
  - `authoritativeOrder(co, chapter) → string[] | null` — resolves the collection-order object + chapter to that chapter's ordered module-id array: numeric chapter → `co.chapters[].modules`; `'appendices'` → `co.appendixModules`; otherwise (chapter 0/preface, unknown, or `co == null`) → `null`.
  - `sortByAuthoritativeOrder(structEntries, authIds, { book, chapter }) → structEntries[]` — returns entries ordered by their `data.moduleId`'s index in `authIds`; entries whose id is not in `authIds` ("stragglers") are appended, ordered by `legacyStructComparator`, and a `console.warn` naming book/chapter/ids is emitted.
- Consumes (Task 2 uses these): all three exported helpers.

- [ ] **Step 1: Write the failing tests**

Create `tools/__tests__/module-sections.test.js`:

```javascript
import { describe, it, expect, vi } from 'vitest';
import {
  authoritativeOrder,
  sortByAuthoritativeOrder,
  legacyStructComparator,
} from '../lib/module-sections.js';

const CO = {
  chapters: [
    { chapter: 6, title: 'Electronic Structure', modules: ['m68728', 'm68729', 'm68732', 'm68733', 'm68734', 'm68735'] },
  ],
  preface: 'm68662',
  appendixModules: ['m68859', 'm68860', 'm68861'],
};

describe('authoritativeOrder', () => {
  it('returns the chapter modules array for a numeric chapter', () => {
    expect(authoritativeOrder(CO, 6)).toEqual(['m68728', 'm68729', 'm68732', 'm68733', 'm68734', 'm68735']);
  });
  it('accepts a numeric-string chapter', () => {
    expect(authoritativeOrder(CO, '6')).toEqual(CO.chapters[0].modules);
  });
  it('returns appendixModules for the appendices', () => {
    expect(authoritativeOrder(CO, 'appendices')).toEqual(['m68859', 'm68860', 'm68861']);
  });
  it('returns null for chapter 0 / preface (not in chapters)', () => {
    expect(authoritativeOrder(CO, 0)).toBeNull();
  });
  it('returns null for an unknown chapter number', () => {
    expect(authoritativeOrder(CO, 99)).toBeNull();
  });
  it('returns null when the collection-order object is null', () => {
    expect(authoritativeOrder(null, 6)).toBeNull();
  });
});

describe('sortByAuthoritativeOrder', () => {
  const entry = (moduleId, sectionOrder = null) => ({ filename: `${moduleId}-structure.json`, data: { moduleId, sectionOrder } });

  it('orders entries by their index in the authoritative id list, regardless of input order', () => {
    const entries = [entry('m68734'), entry('m68728'), entry('m68733'), entry('m68729'), entry('m68732'), entry('m68735')];
    const sorted = sortByAuthoritativeOrder(entries, CO.chapters[0].modules, { book: 'efnafraedi-2e', chapter: 6 });
    expect(sorted.map((e) => e.data.moduleId)).toEqual(['m68728', 'm68729', 'm68732', 'm68733', 'm68734', 'm68735']);
  });

  it('appends stragglers (not in the authoritative list) after listed ones and warns', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const entries = [entry('m68733'), entry('mZZZZZ'), entry('m68728')];
    const sorted = sortByAuthoritativeOrder(entries, CO.chapters[0].modules, { book: 'efnafraedi-2e', chapter: 6 });
    expect(sorted.map((e) => e.data.moduleId)).toEqual(['m68728', 'm68733', 'mZZZZZ']);
    expect(warn).toHaveBeenCalledOnce();
    expect(warn.mock.calls[0][0]).toContain('mZZZZZ');
    warn.mockRestore();
  });

  it('does not warn when every entry is listed', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    sortByAuthoritativeOrder([entry('m68728'), entry('m68729')], CO.chapters[0].modules, { book: 'efnafraedi-2e', chapter: 6 });
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe('legacyStructComparator', () => {
  const e = (filename, sectionOrder) => ({ filename, data: { sectionOrder } });
  it('sorts by sectionOrder when both present', () => {
    expect([e('b', 2), e('a', 1)].sort(legacyStructComparator).map((x) => x.filename)).toEqual(['a', 'b']);
  });
  it('places a null sectionOrder after a non-null one (the legacy behaviour, preserved for the fallback path)', () => {
    expect([e('a', null), e('b', 5)].sort(legacyStructComparator).map((x) => x.filename)).toEqual(['b', 'a']);
  });
  it('falls back to filename when both null', () => {
    expect([e('b', null), e('a', null)].sort(legacyStructComparator).map((x) => x.filename)).toEqual(['a', 'b']);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run tools/__tests__/module-sections.test.js`
Expected: FAIL — the three helpers are not exported yet (import error / undefined).

- [ ] **Step 3: Add the three helpers to `tools/lib/module-sections.js`**

Add near the top of the module (after the imports / `REPO_ROOT`), and **export** all three:

```javascript
/**
 * Legacy structure-entry comparator: sectionOrder ascending (nulls last),
 * then filename. Retained for the fallback path (chapters/books not covered
 * by collection-order.json) and for ordering unlisted stragglers.
 * @param {{filename:string,data:{sectionOrder:?number}}} a
 * @param {{filename:string,data:{sectionOrder:?number}}} b
 * @returns {number}
 */
export function legacyStructComparator(a, b) {
  const aOrder = a.data.sectionOrder;
  const bOrder = b.data.sectionOrder;
  if (aOrder != null && bOrder != null) return aOrder - bOrder;
  if (aOrder != null) return -1;
  if (bOrder != null) return 1;
  return a.filename.localeCompare(b.filename);
}

/**
 * Resolve a chapter to its authoritative ordered module-id list from a parsed
 * collection-order.json object. Numeric chapters use chapters[].modules;
 * 'appendices' uses appendixModules; everything else (chapter 0 / preface,
 * unknown chapter, or a null object) returns null → caller uses the fallback.
 * @param {object|null} co - parsed collection-order.json (or null)
 * @param {number|string} chapter
 * @returns {string[]|null}
 */
export function authoritativeOrder(co, chapter) {
  if (!co) return null;
  if (chapter === 'appendices') return co.appendixModules ?? null;
  const chapterNum = Number(chapter);
  if (!Number.isInteger(chapterNum)) return null;
  const entry = co.chapters?.find((c) => Number(c.chapter) === chapterNum);
  return entry?.modules ?? null;
}

/**
 * Order structure entries by their moduleId's position in an authoritative
 * id list. Entries whose id is absent ("stragglers") are appended after all
 * listed ones (ordered by legacyStructComparator) and a warning is emitted —
 * this is a data-drift signal, not a fatal error.
 * @param {Array<{filename:string,data:{moduleId:string,sectionOrder:?number}}>} structEntries
 * @param {string[]} authIds - authoritative ordered module ids
 * @param {{book:string,chapter:(number|string)}} ctx
 * @returns {Array} entries in authoritative order (new array)
 */
export function sortByAuthoritativeOrder(structEntries, authIds, { book, chapter }) {
  const indexOf = new Map(authIds.map((id, i) => [id, i]));
  const listed = [];
  const stragglers = [];
  for (const entry of structEntries) {
    if (indexOf.has(entry.data.moduleId)) listed.push(entry);
    else stragglers.push(entry);
  }
  listed.sort((a, b) => indexOf.get(a.data.moduleId) - indexOf.get(b.data.moduleId));
  if (stragglers.length > 0) {
    stragglers.sort(legacyStructComparator);
    console.warn(
      `[module-sections] ${book} chapter ${chapter}: ${stragglers.length} module(s) not in collection-order.json — ` +
        `placing after listed modules: ${stragglers.map((e) => e.data.moduleId).join(', ')}`
    );
  }
  return [...listed, ...stragglers];
}
```

Do **not** change `buildModuleSections`'s existing `structEntries.sort(...)` in this task — that wiring is Task 2. (The extracted `legacyStructComparator` is now dead-until-Task-2; that is expected and the tests cover it directly.)

- [ ] **Step 4: Run to verify they pass**

Run: `npx vitest run tools/__tests__/module-sections.test.js`
Expected: PASS (all describe blocks green).

- [ ] **Step 5: Commit**

```bash
git add tools/lib/module-sections.js tools/__tests__/module-sections.test.js
git commit -m "feat(module-sections): add authoritative-order helpers (collection-order) [#6]

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Wire collection-order into `buildModuleSections` (TDD)

**Files:**
- Modify: `tools/lib/module-sections.js` (add `loadCollectionOrder`; replace the `structEntries.sort(...)` at ~113–123 with the authoritative-order branch)
- Test: `tools/__tests__/module-sections.test.js` (add an integration `describe` block, real efnafraedi-2e data)

**Interfaces:**
- Consumes: `authoritativeOrder`, `sortByAuthoritativeOrder`, `legacyStructComparator` (Task 1).
- Produces: `loadCollectionOrder(book) → object|null` — memoized read of `books/<book>/01-source/collection-order.json`; `null` if the file is absent (no throw). `buildModuleSections` signature/return shape unchanged.

- [ ] **Step 1: Write the failing integration tests**

Append to `tools/__tests__/module-sections.test.js`:

```javascript
import { buildModuleSections, loadCollectionOrder } from '../lib/module-sections.js';
import fs from 'fs';
import path from 'path';

const REPO_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..');
const readCO = (book) =>
  JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'books', book, '01-source', 'collection-order.json'), 'utf-8'));

describe('loadCollectionOrder', () => {
  it('loads the object for a real book', () => {
    const co = loadCollectionOrder('efnafraedi-2e');
    expect(co).toBeTruthy();
    expect(Array.isArray(co.chapters)).toBe(true);
  });
  it('returns null for a book with no collection-order.json (no throw)', () => {
    expect(loadCollectionOrder('nonexistent-book-xyz')).toBeNull();
  });
});

describe('buildModuleSections — collection-order authority (efnafraedi-2e)', () => {
  it('places m68733 at section 3 (the ch06 null-sectionOrder bug fix)', () => {
    const sections = buildModuleSections('efnafraedi-2e', 6);
    expect(sections['m68733'].section).toBe('3');
    // siblings keep their positions; intro is 0
    expect(sections['m68729'].section).toBe('1');
    expect(sections['m68732'].section).toBe('2');
    expect(sections['m68734'].section).toBe('4');
    expect(sections['m68735'].section).toBe('5');
    expect(sections['m68728'].section).toBe('0'); // intro
  });

  it('orders the appendices by appendixModules', () => {
    const sections = buildModuleSections('efnafraedi-2e', 'appendices');
    const co = readCO('efnafraedi-2e');
    // non-appended sanity: every appendixModules id has a section, in ascending order
    const ordered = co.appendixModules
      .filter((id) => sections[id])
      .sort((a, b) => Number(sections[a].section) - Number(sections[b].section));
    expect(ordered).toEqual(co.appendixModules.filter((id) => sections[id]));
  });

  it('is inert everywhere else: non-intro section order matches collection-order for all 21 chapters', () => {
    const co = readCO('efnafraedi-2e');
    for (const ch of co.chapters) {
      const sections = buildModuleSections('efnafraedi-2e', ch.chapter);
      // reconstruct rendered order from assigned section numbers, excluding intro ('0')
      const rendered = ch.modules
        .filter((id) => sections[id] && sections[id].section !== '0')
        .sort((a, b) => Number(sections[a].section) - Number(sections[b].section));
      const expected = ch.modules.filter((id) => sections[id] && sections[id].section !== '0');
      expect(rendered).toEqual(expected); // collection-order == assigned order
    }
  });
});
```

- [ ] **Step 2: Run to verify the ch06 test fails**

Run: `npx vitest run tools/__tests__/module-sections.test.js -t "collection-order authority"`
Expected: FAIL — `loadCollectionOrder` is undefined and/or `m68733.section` is currently `'5'` (sorted to the chapter end by the null-`sectionOrder` bug), not `'3'`.

- [ ] **Step 3: Add `loadCollectionOrder` and wire the branch**

In `tools/lib/module-sections.js`, add the memoized loader (near the other helpers) and **export** it:

```javascript
const _collectionOrderCache = new Map();

/**
 * Load and memoize a book's collection-order.json (the authoritative module
 * order, generated at intake by download-source.js). Returns null if the file
 * is absent — a book without one uses the legacy comparator.
 * @param {string} book
 * @returns {object|null}
 */
export function loadCollectionOrder(book) {
  if (_collectionOrderCache.has(book)) return _collectionOrderCache.get(book);
  const p = path.join(REPO_ROOT, 'books', book, '01-source', 'collection-order.json');
  const co = fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf-8')) : null;
  _collectionOrderCache.set(book, co);
  return co;
}
```

Then replace the existing sort (the `structEntries.sort((a, b) => { … })` block at ~113–123) with:

```javascript
  // Order by the authoritative collection-order.json when it covers this
  // chapter/appendix; otherwise fall back to the legacy sectionOrder sort.
  const authIds = authoritativeOrder(loadCollectionOrder(book), chapter);
  const orderedEntries = authIds
    ? sortByAuthoritativeOrder(structEntries, authIds, { book, chapter })
    : [...structEntries].sort(legacyStructComparator);
```

Then change the numbering loop to iterate `orderedEntries` instead of `structEntries`:

```javascript
  for (const entry of orderedEntries) {
```

(Everything else in `buildModuleSections` — segment-title lookup, intro-`'0'`/sequential numbering, slug generation, `_chapterTitle` — is unchanged.)

- [ ] **Step 4: Run to verify the integration tests pass**

Run: `npx vitest run tools/__tests__/module-sections.test.js`
Expected: PASS (Task 1 unit blocks + Task 2 integration blocks all green; m68733 → section 3; all 21 chapters inert; appendices ordered by appendixModules).

- [ ] **Step 5: Full suite + fidelity (no render change expected)**

```bash
npm test 2>&1 | grep -E 'Test Files|Tests ' | tail -2
npm run fidelity:render 2>&1 | grep 'Total findings'
```
Expected: all green; `Total findings: 0`. No golden fixture should change (this task does not re-render). If any render golden differs, STOP and investigate — the fix is meant to be inert on all currently-rendered content.

- [ ] **Step 6: Commit**

```bash
git add tools/lib/module-sections.js tools/__tests__/module-sections.test.js
git commit -m "fix(module-sections): order chapters/appendices by collection-order.json — fixes ch06 null-sectionOrder mis-order [#6]

buildModuleSections sorted null-sectionOrder modules to the chapter end,
mislabeling m68733 as 6.5 (should be 6.3) and renaming section URLs. Now
derives order from the authoritative collection-order.json (chapters[].modules
+ appendixModules); legacy sectionOrder sort kept as the fallback for chapter
0/preface and books without the file. Inert on all currently-rendered content
except the ch06 fix; appendices no longer depend on an alphabetical coincidence.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Self-Review

- **Spec coverage:** authoritative order for chapters (`chapters[].modules`) + appendices (`appendixModules`) → Task 1 `authoritativeOrder` + Task 2 wiring; memoized `loadCollectionOrder` with null-on-missing → Task 2; warn-not-throw on stragglers → Task 1 `sortByAuthoritativeOrder`; legacy fallback for chapter 0/preface + no-file → Task 2 branch + `legacyStructComparator`; ch06 regression guard, appendices-authoritative, book-wide inertness, fallback, drift-warn tests → Tasks 1 & 2. All spec test cases mapped.
- **Placeholder scan:** none — every step has concrete code/commands.
- **Type/name consistency:** `authoritativeOrder(co, chapter) → string[]|null`, `sortByAuthoritativeOrder(structEntries, authIds, {book, chapter}) → entries[]`, `legacyStructComparator(a, b)`, `loadCollectionOrder(book) → object|null` — used identically in definition (Task 1/2) and consumption (Task 2 wiring). Entry shape `{ filename, data: { moduleId, sectionOrder } }` matches the existing `structEntries` construction in `buildModuleSections`.
- **Inertness caveat:** the "no collection-order file" fallback branch is exercised at the unit level (`authoritativeOrder(null, …) → null`, `loadCollectionOrder('nonexistent-book-xyz') → null`); no real book lacks the file, so there is no integration fixture for the whole fallback render path — this is honest and acceptable (the branch is trivial and unit-covered).
