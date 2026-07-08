# Path to a byte-perfect efnafraedi-2e (before onboarding other textbooks)

**Date:** 2026-07-07 · **Owner directive:** finish a clean, byte-perfect chemistry book *before* biology/other-book onboarding continues.

This consolidates every deferred and emerging follow-up from the STALE-STRUCT re-extract delivery (PR #248) and its Fable reader-experience review, ranked by importance and sequenced by dependency. It is the single "definition of done" for clean chemistry. Source rows also live in the register (`docs/plans/2026-06-28-pipeline-architecture-implementation-plan.md`, "STALE-STRUCT delivery outcome"); this doc is the ranked view.

## Where efnafraedi-2e stands after PR #248

Reading-order scrambles are fixed **where the scramble was in the data** (complete modules; m68702 verified). The reader is NOT yet fully served: a render-layer bug re-scrambles 10 pages, 2 tables render broken (excluded), and a chunk of the book is still untranslated. "Byte-perfect" = every published page reads correctly, every table/figure/reference is right, and the order/fidelity gates are hard (not warn-only) with an empty unexplained set.

## Ranked backlog

Legend: `[fix]` code tech-debt · `[build]` scheduled/content work · `[decision]` needs lead call. Rank = do-order within the goal.

### Tier 1 — reader-facing correctness (blocks "clean for readers")

| # | Item | Why it blocks | Owner | Status |
|---|---|---|---|---|
| 1 | **F2 — render section-order fix** (`renderSection` child-before-parent) | 10 pages still render subsections before parent intro; numbers jump. The renderer half of the original STALE-STRUCT problem | `[fix]` | ✅ **DELIVERED 2026-07-07** (PR — branch `fix/chem-f2-render-section-order`). Unified 3 ordering paths into `renderChildrenInDocumentOrder` (2-commit refactor-then-fix); `renderSection` now emits children in document order. 17 pages re-rendered (pure reorder, 0 renames); 9/10 F2 pages fixed. **Fable-confirmed SAFE TO SHIP** + opus whole-branch YES. Suite 1927 green, fidelity 0. **ch06 excluded** (trips #6 — lead: ship clean, do #6 next). 4-2 (m68710) stays scrambled = data-caused (needs #2/#4). |
| 2a | **F1-part-1 — re-include m68710/m68733 + defensive parser fix** | the 2 tables were excluded from #248; their leading-empty cell was dropped at extraction | `[fix]` | ✅ **DELIVERED 2026-07-08** (branch `fix/chem-f1-entry-leak-render`). Re-extract captured the empty cell (segment-safe, 0 FAIL equivalence) → re-inject (paired `<entry></entry>`) → re-render: **4-2 (m68710) + 6-3 (m68733) render correctly, zero URL renames.** Also landed the shared `extractElements` greedy→lazy fix (real self-closing-`<tag/>` bug, unit-tested) — but **inert on current render** (no live table uses the standalone path); kept as defensive. Golden lock for both tables. Suite 1970 green. |
| 2b | **F1b — para-nested `<table>` render leak (THE headline)** | m68791 (ch12 12-4) + the ch10/12/18 exercises pages leak raw `<entry>`/`<row>` into published HTML — the live leak #2 is named after. **Actual root cause** (systematic-debugging): container renderers (`renderExample`/`renderExercise`/`renderNote`) hoist only `list`/`equation` out of a `<para>`, so a para-nested `<table>` falls to `renderPara`→`processInlineContent` which dumps `<row>`/`<entry>` raw. (Earlier "double-emission/morerows" guess was wrong.) | `[fix]` | ✅ **DELIVERED 2026-07-08** (branch `fix/chem-f1b-para-nested-table-render`). Uniform fix: `table: renderTable` dispatch + hoist `'table'` at all three container renderers. **Render-only (no re-MT).** 12 pages re-rendered: 4 leak-fixes (12-4/10-12-18-exercises), 4 note-table position fixes (direct-child note table now renders inside the aside — closed a pinned `nesting.test.js` known-gap), 4 pure MathJax-id churn. **Zero raw `<entry>`/`<row>`/`<colspec>` in any published page; zero URL renames.** Goldens: m68789 (excluded-section, byte-identical) + m68791 (real witness). Suite 1976 green. **Roadmap #2 (2a+2b) now fully RESOLVED.** |
| 3 | **Pass-1 completion of the 15 incomplete modules** | residue gate refuses to publish untranslated-EN modules → they retain WS5-stale order + ship English; 5 of them are order-broken. `m68662, m68696, m68698, m68700, m68729, m68739, m68750, m68752, m68784, m68798, m68804, m68809, m68858, m68862, m68865` | `[build]` | the big content-labor item; per-module MTPE review → re-inject → re-render |
| 4 | **B4 — the 6 re-MT modules** (`m68764, m68770, m68789, m68791, m68793, m68829`) | excluded from re-extract (segment-id-set changes); keep stale structure (2 flag order), and any editor "Vista+Birta" on them injects new structure vs old ids → dropped segments. Includes signature-(a) list-double-record family (m68789/m68793) + RC3/RC4 | `[build]` | re-extract + re-MT with RC3/RC4; anchor ids in markers before any Pass-1 push on them |

### Tier 2 — governance / gates (blocks "byte-perfect / verified")

| # | Item | Why | Owner | Status |
|---|---|---|---|---|
| 5 | **Flip order gate warn→hard** (+ fingerprint allowlist, `assertOrderAllowlistScope`) | the STALE-STRUCT plan's Task 6, DEFERRED: it was contingent on "order → near-0", which needs #3 (5 incomplete) + #4 (re-MT) resolved first. Then the flip is real | `[decision]`/`[build]` | plan text ready in the STALE-STRUCT plan Task 6; gated on #3 + #4 |
| 6 | **buildModuleSections null-`sectionOrder` fallback → `collection-order.json`** | it sorted null-`sectionOrder` modules to chapter END (caused ch10/ch18 in STALE-STRUCT, then blocked ch06 from the F2 re-render — m68733 null → mislabeled 6.5) | `[fix]` | ✅ **DELIVERED 2026-07-07** (branch `fix/chem-module-sections-collection-order`, own PR). `buildModuleSections` now orders chapters via `collection-order.json` `chapters[].modules` + appendices via `appendixModules` (validated identical to upstream `collection.xml`); legacy `sectionOrder` sort kept as fallback for chapter 0/no-file. **Provably inert except ch06** (real legacy-vs-new test across all 22 targets). Opus whole-branch merge YES; suite 1965 green, 0 goldens. **Unblocks ch06's clean re-render under F1.** |
| 7 | **F8 math-content gate** (warn→hard) + re-triage | separate warn-only axis (WS4 substitution coverage); several flags are the same stale/(a) modules → resolves alongside #4 | `[build]` | triage after #4 |

### Tier 3 — robustness / tech-debt (quality; not reader-blocking)

| # | Item | Why | Owner |
|---|---|---|---|
| 8 | **cnxml-extract.js `--chapter 0` guard bug** | `if(!args.input && !args.chapter)` trips on falsy `0`; inject/render already use `== null`. ch00 needed an `--input` workaround this run | `[fix]` one-liner |
| 9 | **MATH-resolve duplication** (`annotateInlineTerms` + `buildCnxml` glossary) | same ~10-line block in two sites (this dup caused the m68852 brief's misdiagnosis) — extract `stripTermMarkersToText(text, equations)`; also consolidates the pre-existing sub/sup/i/b dup | `[fix]` |
| 10 | **source↔output link-target parity check** | no gate compares source vs output `<link target-id>`/`document` (m68692 dead local link invisible); marker/link fixes not delivered by the order-only run | `[fix]` |
| 11 | **F3-preexisting: glossary annotation lowercases literal symbols** | `(e. …)` lowercases the whole EN term → mangles literal `e°cell`/`°c`/`δs°`/`joule (j)` in page-data (identical in base — NOT this delivery). The NEW-notation case bug was already fixed | `[fix]` low-pri |
| 12 | **verify-reextract-equivalence execSync template-string** | `loadCommitted` interpolates a path into `git show` (CLI-only, local paths) | `[fix]` low-pri |
| 13 | **render-golden coverage gap for section ordering** | no `render-golden/` fixture has the "loose-content-after-nested-subsection" shape, so the golden gate structurally could NOT have caught an F2 regression (only the synthetic unit test + Fable did). Surfaced by the F2 whole-branch review | `[fix]` — promote one affected efnafraedi module (7-6/m68742 or 18-3) into `render-golden/` to lock section ordering byte-exact; also guards the F1 fix (#2) |
| 14 | **MathJax id counter shared across a `--chapter` render** | the `MJX-NNN` id counter is not reset per page, so any module content change shifts the ids on every LATER page in that chapter → spurious cosmetic churn (4 ch12 pages churned in F1b re-render). Golden tests already normalize MJX ids; published pages carry the raw ids | `[fix]` low-pri — reset the counter per page (or per module) in `cnxml-render.js`. Surfaced by the F1b whole-book re-render |
| 15 | **Section-level para-nested `<table>` is unguarded** | F1b routed para-nested tables through `renderTable` in the three container renderers (example/exercise/note), but `renderBlockChildrenInOrder` has no section-level (`renderContent`) caller — a `<table>` nested in a top-level `<para>` would still leak via `renderPara`. **0 instances in efnafraedi-2e** (book-wide grep clean), so not a live defect, but a residual class the next book (biology) could hit | `[fix]` — check during biology characterization; if present, extend the same dispatch+hoist pattern to the section walk. Surfaced by the F1b whole-branch review |

## Suggested sequence

1. ✅ **F2 (#1)** — DONE 2026-07-07 (delivered clean, ch06 excluded, Fable-confirmed).
2. ✅ **#6** — DONE 2026-07-07 (collection-order authority for chapters + appendices; provably inert except ch06; ch06 re-render now produces correct 6.3 numbering, matching the currently-published URLs — no reader URL churn).
3. ✅ **F1-part-1 (#2a)** — DONE 2026-07-08 (m68710/m68733 re-included + rendered correctly; defensive `extractElements` fix). Execution found the live leak is a *separate* example-table render bug → split out as **F1b (#2b)**, the real headline, NEXT. Full narrative + the corrected mechanism: `docs/superpowers/specs/2026-07-07-f1-entry-leak-render-design.md` § Delivery outcome.
   - ✅ **F1b (#2b)** — DONE 2026-07-08. Root cause was para-nested tables not hoisted in container renderers (not the `morerows`/double-emission guess); uniform table dispatch+hoist at renderExample/renderExercise/renderNote; 12 pages re-rendered, zero raw markup book-wide. **Roadmap #2 fully resolved.** Corrected mechanism: `docs/superpowers/specs/2026-07-08-f1b-para-nested-table-render-design.md`.
4. **#8, #9, #10, #11, #12, #13** — the rest of the code tech-debt sweep; small, independent, can batch (#13 = add a section-ordering golden fixture so this class is gated).
5. **Pass-1 (#3)** — the sustained content-labor track (MTPE the 15 incomplete modules).
6. **B4 (#4)** — re-MT the 6, id-anchored.
7. **Flip the gates (#5, #7)** once #3 + #4 clear the residuals → order + F8 become hard, unexplained set empty.
8. **THEN** resume other-textbook onboarding on a proven-clean pipeline.

"Byte-perfect" is reached when: every published efnafraedi-2e page reads in document order (F2), no broken tables (F1), no untranslated residue (Pass-1) or stale-structure modules (B4), and the order + F8 + fidelity gates are all hard with zero unexplained findings.
