# D6 — Per-book Characterization Test + Parametrized CSS-Contract (Design)

**Status:** approved by lead 2026-06-29, ready for implementation plan.
**Roadmap item:** D6 in [docs/plans/2026-06-28-pipeline-architecture-implementation-plan.md](2026-06-28-pipeline-architecture-implementation-plan.md)
(Track D — cross-book onboarding; `blocks all`). A biology-onboarding foundation.
**Guiding directive:** robustness & future-proofing over expedience (`feedback-robustness-over-expedience`).

## Problem

The only end-to-end render coverage is efnafraedi-2e (`pipeline-integration.test.js`), and the
CSS-contract test is hardcoded to `books/efnafraedi-2e/05-publication` and **silently skips** when the
sister vefur repo is absent (`css-contract.test.js` `it.skipIf(!vefurExists || !pubExists)`). So a render
change that breaks a *non-chemistry* book, or a class-name mismatch with vefur's CSS in another book, ships
undetected.

## Part 1 — Per-book render characterization

**New `tools/__tests__/render-characterization.test.js`** — one `describe` block per book. Each renders
small **inline CNXML** through `renderCnxmlToHtml(cnxml, { ..., bookConfig })` (the book's real config from
`getBookRenderConfig(slug)`), asserting **structural HTML outcomes** for that book's distinctive
constructs. No MT/inject — raw inline CNXML, mirroring the existing `cnxml-render.test.js` inline pattern.
Assertions are **structural/label-based, not byte-golden** (robust, not brittle).

Per-book distinctive constructs (sourced from each `book-config.json`):

| Book | Characterizes |
|------|---------------|
| efnafraedi-2e | a `chemistry everyday-life` note → "Efnafræði í daglegu lífi"; an `<example>` renders its box; a key-equations construct |
| liffraedi-2e (biology) | `visual-connection`/`evolution`/`career` notes → Sjónræn tenging/Þróun/Starfsferill; a `multiple-choice` exercise renders; **biology's 0-examples reality** — a biology-shaped module (notes + exercises, no `<example>`) renders cleanly |
| orverufraedi (microbiology) | `microbiology clinical-focus` note → "Klínísk sjónarmið"; an exercise type renders |
| lifraen-efnafraedi (organic) | a `<section class="key-terms">` and a note render (os-embed is D3's concern, not asserted here) |
| edlisfraedi-2e (physics) | `conceptual-questions` / `problems-exercises` exercise types render |

**Why structural, not config-lookup:** D1's tests already prove render reads the right label from config.
What's untested per-book is whether each book's distinctive *structure* still renders after a future
render refactor. The characterization exercises each book end-to-end through `renderCnxmlToHtml` with its
real config, catching the bug class where a render change silently breaks the one book using construct X.

A shared helper (`renderFor(slug, cnxml)`) loads the book config and renders, so each `describe` is a few
focused `it`s.

## Part 2 — Parametrized CSS-contract

**Modify `tools/__tests__/css-contract.test.js`:**
- Replace the single hardcoded `PUBLICATION_DIR` with iteration over **all `books/*/05-publication`** dirs
  that exist (all 5 currently do). The two existing contract checks (class↔CSS match; dead-selector scan)
  run **per book**.
- **`VEFUR_CONTRACT=1` hard-fail:** today the suite `it.skipIf`s when the vefur CSS is absent. New: when
  `process.env.VEFUR_CONTRACT === '1'` **and** the vefur CSS is missing → a test **fails loudly**
  ("VEFUR_CONTRACT=1 but vefur CSS not found at …"). Without the flag (common local case) → skip as today,
  so a plain `npm test` without vefur stays green.

## Cross-repo (vefur IS checked out at `../namsbokasafn-vefur`)

Running the parametrized contract against the **real** vefur `content.css` may surface classes that
non-efnafraedi books emit but vefur doesn't style (the plan's [VEFUR] note already flags `summary`,
`summary-section`, `periodic-table-link` as genuinely unstyled). Each finding is resolved by:
1. **Adding the vefur selector** (preferred, per lead) — *after* reading vefur's `CLAUDE.md` + memory index
   per the cross-repo protocol; record the learning in vefur's memory; **or**
2. an **intentional-allowlist entry** in `css-contract.test.js` (the existing `EXTERNAL_CLASSES` /
   `STRUCTURAL_CLASSES` pattern) when the class is deliberately unstyled.
Decided per-finding during implementation. Any vefur edits are a coordinated, separately-committed change
in that repo.

## Acceptance

- Each of the 5 books has a characterization `describe`, all green (raw inline CNXML, no MT).
- The css-contract runs over every book's `05-publication` (vefur present); hard-fails when
  `VEFUR_CONTRACT=1` and vefur is absent; plain `npm test` (no flag) stays green.

## Architecture

- `tools/__tests__/render-characterization.test.js` (new) — per-book `describe` + shared `renderFor` helper.
- `tools/__tests__/css-contract.test.js` (modify) — parametrize over books + `VEFUR_CONTRACT` hard-fail.
- *(possibly)* `../namsbokasafn-vefur/static/styles/content.css` — add selectors for genuinely-unstyled
  cross-book classes the contract surfaces (separate vefur commit).

## Out of scope (documented per `feedback-log-out-of-scope-issues`)

- **Re-rendering books** — the contract reads committed `05-publication`; characterization uses inline CNXML.
- **Byte-golden HTML snapshots** — targeted structural assertions instead (less brittle).
- **vefur-side restructuring** beyond adding missing selectors for surfaced classes.
- **The content gaps themselves** (D3 os-embed, D4 iframe, D7 species) — D6 only characterizes the render
  *shape* of what each book already produces.
