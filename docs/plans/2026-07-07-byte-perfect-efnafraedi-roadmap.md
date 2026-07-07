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
| 1 | **F2 — render section-order fix** (`renderSection` child-before-parent) | 10 pages still render subsections before parent intro; numbers jump. The renderer half of the original STALE-STRUCT problem | `[fix]` | **SPEC READY** → `docs/superpowers/specs/2026-07-07-f2-render-section-order-design.md`; next: writing-plans |
| 2 | **F1 — table `<entry>`-leak render fix** | 2 tables (m68710/m68733) render misaligned/misleading in a worked example → **excluded** from PR #248; unblocks their re-inclusion | `[fix]` | tracked `docs/plans/2026-07-06-table-cell-translation-gate-followup.md`; do with/after F2 (same file) |
| 3 | **Pass-1 completion of the 15 incomplete modules** | residue gate refuses to publish untranslated-EN modules → they retain WS5-stale order + ship English; 5 of them are order-broken. `m68662, m68696, m68698, m68700, m68729, m68739, m68750, m68752, m68784, m68798, m68804, m68809, m68858, m68862, m68865` | `[build]` | the big content-labor item; per-module MTPE review → re-inject → re-render |
| 4 | **B4 — the 6 re-MT modules** (`m68764, m68770, m68789, m68791, m68793, m68829`) | excluded from re-extract (segment-id-set changes); keep stale structure (2 flag order), and any editor "Vista+Birta" on them injects new structure vs old ids → dropped segments. Includes signature-(a) list-double-record family (m68789/m68793) + RC3/RC4 | `[build]` | re-extract + re-MT with RC3/RC4; anchor ids in markers before any Pass-1 push on them |

### Tier 2 — governance / gates (blocks "byte-perfect / verified")

| # | Item | Why | Owner | Status |
|---|---|---|---|---|
| 5 | **Flip order gate warn→hard** (+ fingerprint allowlist, `assertOrderAllowlistScope`) | the STALE-STRUCT plan's Task 6, DEFERRED: it was contingent on "order → near-0", which needs #3 (5 incomplete) + #4 (re-MT) resolved first. Then the flip is real | `[decision]`/`[build]` | plan text ready in the STALE-STRUCT plan Task 6; gated on #3 + #4 |
| 6 | **buildModuleSections null-`sectionOrder` fallback → `collection-order.json`** | it sorts null-`sectionOrder` modules to chapter END (caused the ch10/ch18 regression this run fixed by hand). A future null could silently mis-order again | `[fix]` | one-function fix in `tools/lib/module-sections.js` |
| 7 | **F8 math-content gate** (warn→hard) + re-triage | separate warn-only axis (WS4 substitution coverage); several flags are the same stale/(a) modules → resolves alongside #4 | `[build]` | triage after #4 |

### Tier 3 — robustness / tech-debt (quality; not reader-blocking)

| # | Item | Why | Owner |
|---|---|---|---|
| 8 | **cnxml-extract.js `--chapter 0` guard bug** | `if(!args.input && !args.chapter)` trips on falsy `0`; inject/render already use `== null`. ch00 needed an `--input` workaround this run | `[fix]` one-liner |
| 9 | **MATH-resolve duplication** (`annotateInlineTerms` + `buildCnxml` glossary) | same ~10-line block in two sites (this dup caused the m68852 brief's misdiagnosis) — extract `stripTermMarkersToText(text, equations)`; also consolidates the pre-existing sub/sup/i/b dup | `[fix]` |
| 10 | **source↔output link-target parity check** | no gate compares source vs output `<link target-id>`/`document` (m68692 dead local link invisible); marker/link fixes not delivered by the order-only run | `[fix]` |
| 11 | **F3-preexisting: glossary annotation lowercases literal symbols** | `(e. …)` lowercases the whole EN term → mangles literal `e°cell`/`°c`/`δs°`/`joule (j)` in page-data (identical in base — NOT this delivery). The NEW-notation case bug was already fixed | `[fix]` low-pri |
| 12 | **verify-reextract-equivalence execSync template-string** | `loadCommitted` interpolates a path into `git show` (CLI-only, local paths) | `[fix]` low-pri |

## Suggested sequence

1. **F2 (#1)** now — spec ready, unblocks the 10 pages.
2. **F1 (#2)** with/right after F2 (same render file, same review cycle) → re-include m68710/m68733.
3. **#6, #8, #9, #10, #11, #12** — the code tech-debt sweep; small, independent, can batch (do #6 before any further re-render so a null can't recur).
4. **Pass-1 (#3)** — the sustained content-labor track (MTPE the 15 incomplete modules).
5. **B4 (#4)** — re-MT the 6, id-anchored.
6. **Flip the gates (#5, #7)** once #3 + #4 clear the residuals → order + F8 become hard, unexplained set empty.
7. **THEN** resume other-textbook onboarding on a proven-clean pipeline.

"Byte-perfect" is reached when: every published efnafraedi-2e page reads in document order (F2), no broken tables (F1), no untranslated residue (Pass-1) or stale-structure modules (B4), and the order + F8 + fidelity gates are all hard with zero unexplained findings.
