# Generalize appendix-link resolution across all render contexts — Design (roadmap #18 + #19)

**Date:** 2026-07-09
**Branch:** `fix/chem-appendix-resolution-contexts`
**Roadmap rows:** #18 (`appendixIdMap` missing from the 4 compiled contexts) + #19 (`renderCompiledGlossary` / `renderKeyEquations` contexts lack the appendix maps)
**Predecessor:** #10 piece 2 (PR #255) wired `appendixModuleLetters` into the per-module + 4 compiled contexts; this closes the sibling gaps it deliberately left.

## Problem

`resolveCrossModuleHref` (`tools/lib/cnxml-elements.js`) resolves appendix cross-references two ways:

- **`document=` links** (`<link document="<appendix-module>">text</link>`) → its branch reads `context.bookSlug` + `context.appendixModuleLetters`.
- **`target-id` links** (`<link target-id="<appendix-element-id>">text</link>`, the A1 case) → its branch reads `context.bookSlug` + `context.appendixIdMap`.

`main()` in `tools/cnxml-render.js` builds **six** independent render-context literals, each hand-listing its fields. They diverge on which appendix fields they carry:

| Context (site) | routes via | `bookSlug` | `appendixModuleLetters` | `appendixIdMap` |
|---|---|---|---|---|
| per-module render (~3422) | `renderCnxmlToHtml` | ✔ (hardcoded) | ✔ | ✔ |
| end-of-chapter section (~3528 `options`) | `renderCnxmlToHtml` | ✔ (hardcoded) | ✔ (piece 2) | ✗ **missing** |
| compiled summary (~3710 `options`) | `renderCnxmlToHtml` | ✔ (hardcoded) | ✔ (piece 2) | ✗ **missing** |
| answer key (~3758 `options`) | `renderCnxmlToHtml` | ✔ (hardcoded) | ✔ (piece 2) | ✗ **missing** |
| compiled exercises (`renderContext` ~3811) | `renderCnxmlToHtml` | ✔ (explicit) | ✔ (piece 2) | ✗ **missing** |
| glossary (`glossaryContext` ~3567) | `processInlineContent` **directly** | ✗ **missing** | ✗ **missing** | ✗ **missing** |
| key-equations (`renderKeyEquations` internal ctx, ~2279) | `processInlineContent` **directly** | ✔ (explicit) | ✗ **missing** | ✗ **missing** |

Consequences:

- **#18** — the four compiled contexts carry `appendixModuleLetters` but not its sibling `appendixIdMap`. A `target-id` appendix link on a compiled page (exercises/summary/answer-key/end-of-chapter) would not resolve — it falls through to a broken same-page `#id` anchor.
- **#19** — the glossary and key-equations contexts render CNXML via `processInlineContent` directly (bypassing `renderCnxmlToHtml`'s field defaults + hardcoded `bookSlug`), so they carry neither appendix map; `glossaryContext` also lacks `bookSlug`. An appendix link in a `<meaning>` or key-equation cell would not resolve.

**Root cause:** six hand-listed context literals; appendix fields get forgotten in some. The asymmetry itself (one appendix map present, the other not, in the same object) is a latent trap for the next reader/editor.

## Dormancy — important scoping fact

This is a **dormant** fix. Across the entire `efnafraedi-2e` translated corpus:

- Exactly **one** A1 `target-id` appendix link exists (`fs-idm379479808`, the periodic-table appendix, in `ch02/m68692`), and it lives on a **module** page, which already resolves correctly today.
- **Zero** `target-id` appendix links land on compiled pages; **zero** `<link>`s appear in glossary `<meaning>` or key-equation cells (grep-verified).

Therefore:

- **0 published pages change** → **no re-render, no sync, no vefur change.**
- There is no live content to render-assert against → tests are **contract-level with synthetic links** (see Testing).
- The entire value is **parity + future-proofing** (biology characterization, or a future edit, could introduce a compiled-page / glossary appendix link) and **drift elimination** (one field-source instead of six).

## Design

### Core mechanism — one shared `appendixResolution` object

In `main()`, immediately after `appendixModuleLetters` is destructured (~line 3230):

```js
// The fields both appendix branches of resolveCrossModuleHref need. Defined
// once and spread into every appendix-capable render context so the set can't
// drift across the (many) context literals main() builds (#18/#19).
const appendixResolution = { bookSlug: BOOK_SLUG, appendixIdMap, appendixModuleLetters };
```

Spread `...appendixResolution` into every appendix-capable context, replacing the piecemeal explicit fields. `bookSlug` in the spread is ignored where `renderCnxmlToHtml` re-hardcodes it (harmless) and used directly where the object is the live context.

### Tier 1 — contexts routing through `renderCnxmlToHtml`

`renderCnxmlToHtml` already defaults `appendixIdMap`/`appendixModuleLetters` (`options.X || new Map()`) and sets `bookSlug: BOOK_SLUG` unconditionally, so these need only `appendixIdMap` added — done via the shared spread:

- **per-module context (~3435):** replace the explicit `appendixIdMap, appendixModuleLetters,` lines with `...appendixResolution`. Behaviour-preserving (spread yields the same two maps); **module-page render goldens prove no output change.** Converted for uniformity so no context is the odd-one-out with explicit fields.
- **end-of-chapter section `options` (~3540):** replace the explicit `appendixModuleLetters,` with `...appendixResolution`.
- **compiled summary `options` (~3722):** same.
- **answer-key `options` (~3771):** same (its `moduleSections: {}` + `crossModuleSections` stay untouched).
- **compiled exercises `renderContext` (~3811):** spread `...appendixResolution` into the literal (adds `appendixIdMap`; `bookSlug`/`appendixModuleLetters` already present — spread supersedes them identically). This single object feeds both `renderCompiledExercises` (~3859) and `renderSingleTypeExercises` (~3841) via `{ ...renderContext, moduleId }`.

### Tier 2 — contexts calling `processInlineContent(context)` directly

These bypass `renderCnxmlToHtml`, so the fields must live on the context object:

- **`glossaryContext` (~3567):** spread `...appendixResolution` into the literal. Gains `bookSlug` + both maps. (Other link types — intra-chapter figure refs etc. — remain out of scope; `appendixResolution` adds exactly the appendix fields.)
- **`renderKeyEquations` (def ~2277, call ~3896):** **signature change** — add a trailing `appendixResolution` parameter and spread it into the function's internal `context` literal. Pass `appendixResolution` at the call site. This is the one structural change. Key equations render math cells, so an appendix link there is the most speculative case; included for uniformity per the generalize decision.

## Testing — contract tests per context (no re-render)

All dormant, so no real content to assert against and 0 golden changes expected (module goldens must stay byte-identical, proving the Tier-1 per-module conversion is behaviour-preserving). Add per-render-path contract tests with **synthetic** appendix links:

For each of `renderEndOfChapterSection`, `renderCompiledSummary`, `renderAnswerKey`, `renderCompiledExercises`, `renderCompiledGlossary`, `renderKeyEquations`:

- Build a minimal context via `appendixResolution`-shaped fields (populated `appendixIdMap` mapping a synthetic element id → letter, and `appendixModuleLetters` mapping a synthetic module id → letter), plus `bookSlug: 'efnafraedi-2e'`.
- Feed content containing a synthetic `document=` appendix link **and** a synthetic `target-id` appendix link.
- Assert the output contains `<a href="/efnafraedi-2e/vidauki/{letter}">…</a>` for each and `not.toContain('<link')`.

Each test fails if that render path does not thread the maps to the resolver. Where a renderer is exported and cleanly callable, call it directly (mirrors piece 2's `renderCompiledExercises` contract tests). `renderKeyEquations`'s test also covers its new signature.

Full suite (`npm test` from repo root) must stay green, including all render goldens **unchanged**.

## Scope boundaries (YAGNI)

- **NOT** the central context-builder refactor (Approach C) — too broad for #18/#19.
- **NOT** roadmap #20 (document+target-id fragment drop) — stays logged, separate PR.
- **NOT** non-appendix link resolution in glossary/key-equations (intra-chapter figure/table/example refs) — only the appendix fields are added.
- **NO** `books/` changes, **no** re-render/sync, **no** vefur change.
- Commit trailer: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

## Success criteria

- `appendixResolution` is defined once in `main()` and is the sole source of the appendix fields for all appendix-capable contexts (per-module + 4 compiled + glossary + key-equations).
- Contract tests prove each of the six compiled/aux render paths resolves both a `document=` and a `target-id` appendix link to `/{book}/vidauki/{letter}`.
- `npm test` green from repo root; **render goldens byte-identical** (behaviour-preserving); zero `books/` changes.
- Roadmap #18 + #19 marked delivered.
