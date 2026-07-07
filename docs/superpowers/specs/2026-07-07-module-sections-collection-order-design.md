# buildModuleSections collection-order authority — design spec

- **Date:** 2026-07-07
- **Status:** Approved (brainstormed)
- **Roadmap item:** #6 (Tier 2) in `docs/plans/2026-07-07-byte-perfect-efnafraedi-roadmap.md`
- **Register:** `docs/plans/2026-06-28-pipeline-architecture-implementation-plan.md` ("buildModuleSections null-sectionOrder fallback" row)

## Problem

`buildModuleSections(book, chapter)` in `tools/lib/module-sections.js` derives each module's section number, slug, and rendered HTML filename. It sorts a chapter's modules by the `sectionOrder` field in each module's `structure.json`, and when a module's `sectionOrder` is `null` it pushes that module to the **end of the chapter** (`if (aOrder != null) return -1;`). Section numbers are then assigned by *position in the sorted array* (intro → `'0'`, the rest sequentially), so a mis-sorted module gets a wrong number and a wrong URL.

This bit twice. During the STALE-STRUCT delivery it mis-ordered ch10/ch18 (fixed by hand by back-filling `sectionOrder`). During the F2 delivery it blocked ch06 entirely: **m68733** ("Development of Quantum Theory", document position 3) was excluded from the re-extract over the F1 broken-table bug, so its committed `structure.json` still has `sectionOrder: null`, while its ch06 siblings were re-extracted and got real values (0,1,2,4,5). The null sorts m68733 to the chapter end → it renders as **6.5 instead of 6.3**, renaming three section URLs. ch06 had to be excluded from the F2 re-render as a result.

`sectionOrder` in `structure.json` is a **derived, mutable, per-module** value that goes stale or null whenever a module is excluded from re-extraction. The **authoritative** reading order is `books/<book>/01-source/collection-order.json` — an immutable, provenance-protected artifact whose per-chapter `modules[]` array *is* the OpenStax document order.

## Goal

Make `buildModuleSections` derive chapter order from `collection-order.json` (the authoritative source) for any chapter that file lists, so a null/stale `sectionOrder` can no longer mis-order a chapter — fixing ch06 (m68733 → 6.3) and preventing recurrence, without changing any other chapter's section numbering or URLs.

## Key facts (verified)

- **`collection-order.json` shape:** `{ chapters: [ { chapter: <number>, title, modules: [<moduleId>, …] } ], preface: "<moduleId>", appendixModules: [<moduleId>, …] }`. Each chapter's `modules[]` is the authoritative per-chapter document order; `appendixModules[]` is the authoritative appendix order; `preface` is the single front-matter module (m68662). Present in `01-source/` for **all 5 books**. Generated at intake by `download-source.js:459` from the parsed OpenStax collection.
- **Validated against upstream ground truth:** the committed `collection-order.json` was diffed against the OpenStax `chemistry-2e/collection.xml` (the raw collection file, provided by the lead; not stored in the repo — only its derivative is). **All 21 chapters match on both module order *and* title**, and the appendix module list matches the bare post-subcollection modules. So `collection-order.json` is a faithful transcription of the authoritative source — safe to treat as the order authority.
- **Equivalence proven book-wide:** sorting each chapter's non-intro modules by their index in `collection-order.json` produces an **identical** order to today's `sectionOrder` sort in **every chapter of all 5 books, except efnafraedi ch06** (the bug). Only **one** null-`sectionOrder` module exists in efnafraedi's chapters (m68733); every chapter module is listed in collection-order (0 unlisted). So adopting collection-order as the authority is provably inert everywhere except the ch06 fix. (The biology-family books carry 8–11 null-`sectionOrder` modules each but still match today; for their *future* chapters collection-order becomes the correct authority where `sectionOrder` is absent.)
- **Appendices are ALL null-`sectionOrder`** (13/13 in efnafraedi). They render correctly today only by *coincidence* — their module IDs happen to be in both alphabetical and collection order, so the current alphabetical fallback matches `appendixModules`. This is the same null-`sectionOrder` fragility as the ch06 bug; a future appendix module out of alphabetical order (cf. ch01, where m68683 sorts last in collection order) would mis-order. Using `appendixModules` removes the coincidence dependency (inert today — identical order — but robust).
- **Intro numbering is order-independent:** the intro module is numbered `'0'` via `documentClass === 'introduction'`, and the sequential counter only advances for non-intro modules, so the intro's position in the sort never affects other modules' numbers.
- **Single consumer:** only `tools/cnxml-render.js` calls `buildModuleSections` (per-chapter at :3213, appendices at :292).

## Design

### One change in `tools/lib/module-sections.js`

Replace the current `sectionOrder`-primary comparator (the `structEntries.sort(...)` at ~113–123) with a collection-order-driven sort:

1. **Load `collection-order.json` once**, memoized per book, via a small internal helper `loadCollectionOrder(book) → object | null` reading `books/<book>/01-source/collection-order.json` (returns `null` if the file is absent — never throws on a missing file; a book without one is a valid state).
2. **Resolve the authoritative order** for this chapter via a helper `authoritativeOrder(co, chapter) → moduleId[] | null`:
   - numeric `chapter` → `co.chapters.find(c => Number(c.chapter) === Number(chapter))?.modules ?? null`
   - `chapter === 'appendices'` → `co.appendixModules ?? null`
   - anything else (chapter `0`/preface, or `co` is `null`) → `null`
3. **If an authoritative order array is returned** — build a `Map<moduleId, index>` from it and sort `structEntries` by that index. `sectionOrder` is **not consulted**.
   - A structure-dir module **not** present in the authoritative array (genuine data drift) is placed **after** all listed modules, ordered among such stragglers by the *existing* comparator (sectionOrder/alphabetical), and a **loud `console.warn`** names the book, chapter, and unlisted module id(s). Not a `throw`: this helper runs in the editorial server's live-preview, and a throw would break preview/render for a whole chapter over a possibly-benign newly-added module. (Dormant today — 0 unlisted modules book-wide.)
4. **If `null` is returned** (chapter 0/preface, or a book with no `collection-order.json`) — use the **current** `sectionOrder`/alphabetical comparator, unchanged, byte-for-byte.

This makes **both** chapters (`co.chapters[].modules`) and appendices (`co.appendixModules`) authoritative through one code path. Everything after the sort (segment-title lookup, intro-`'0'`/sequential numbering, slug generation, `_chapterTitle`) is untouched — it just receives a correct order.

### Interface

- `buildModuleSections(book, chapter)` — signature and return shape unchanged (`{ moduleId → { section, titleEn, titleIs, slug }, _chapterTitle }`).
- New internal helpers `loadCollectionOrder(book)` (memoized) and `authoritativeOrder(co, chapter)` (pure; export it if a focused unit test wants it directly).

## Scope

**Code + tests only. No `books/` re-render in this change.** The fix "arms" correct ordering; it is fully verified by unit tests on `buildModuleSections` output (no render needed to prove it). The ch06 re-render is deferred to **F1** (roadmap #2, sequenced immediately after #6): F1 re-extracts m68733 — fixing its broken table *and* giving it a real `sectionOrder` — then re-renders ch06 fully correct in one pass. Re-rendering ch06 inside this change would ship a page (with m68733's still-broken F1 table) that F1 immediately re-touches.

## Testing & verification

New `tools/__tests__/module-sections.test.js`:

- **Regression guard (the bug):** a chapter present in collection-order with a **null-`sectionOrder`** module lands at its collection-order slot, not the chapter end. Assert `buildModuleSections('efnafraedi-2e', 6)` returns m68733 at section `'3'` (and its siblings at 1,2,4,5, intro at 0) — the real ch06 case.
- **Inert elsewhere:** a chapter present in collection-order with all `sectionOrder` values present orders identically to collection-order (== current behavior).
- **Appendices authoritative:** `buildModuleSections('efnafraedi-2e', 'appendices')` orders by `appendixModules` (all 13 are null-`sectionOrder`); assert the order equals `appendixModules` and is unchanged from today (currently correct only by alphabetical coincidence — now robustly sourced).
- **Fallback preserved:** a lookup that resolves to no authoritative order (chapter `0`/preface, or a book/path without `collection-order.json`) takes the `sectionOrder`/alphabetical sort — current behavior unchanged; the helper returns `null`, no throw.
- **Fail-loud drift:** a chapter/appendix whose structure dir has a module **not** in the authoritative array → `console.warn` fired (spy) + the straggler placed after listed modules deterministically.
- **Book-wide inertness assertion:** for efnafraedi-2e, the section→moduleId assignment is unchanged for all chapters (and appendices) except ch06 (encodes the equivalence check that grounded this design).

Gate: `npm test` from repo root (authoritative — no branch protection). The full render golden suite and `npm run fidelity:render` should be unaffected (no re-render), but run them to confirm no incidental change.

## Out of scope

- **F1** table `<entry>`-leak fix and the ch06 re-render (roadmap #2, next).
- Back-filling `sectionOrder` into m68733's `structure.json` (superseded by this fix; F1's re-extract will set it anyway).
- Roadmap #13 (add a section-ordering render-golden fixture) — separate tech-debt item.

## Risks / mitigations

| Risk | Mitigation |
|---|---|
| Changes another chapter's numbering/URLs | Empirically verified inert across all 21 efnafraedi chapters + appendices + all 4 other books (0 mismatches except ch06); collection-order.json itself validated identical to upstream `collection.xml`; book-wide-inertness unit assertion locks it |
| A book lacks `collection-order.json` | `loadCollectionOrder` returns `null` → current comparator used unchanged |
| Chapter 0 / preface (no authoritative array) | `authoritativeOrder` returns `null` → current comparator used unchanged |
| Appendices ordering | Now sourced from `appendixModules` (all 13 modules are null-`sectionOrder`); identical to today's alphabetical result but no longer coincidence-dependent |
| A module missing from the authoritative array silently mis-orders | Loud `console.warn` + deterministic placement after listed modules (fail-visible without breaking live-preview) |
