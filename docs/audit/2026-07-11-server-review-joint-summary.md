# Server Review — Joint Executive Summary

**Date:** 2026-07-11
**Sources:** [`2026-07-11-server-code-review.md`](2026-07-11-server-code-review.md) (37 code findings, adversarially re-verified) and [`2026-07-11-editorial-workflow-review.md`](2026-07-11-editorial-workflow-review.md) (docs↔code drift, live persona walkthrough, QA re-walk, 8-dimension practice benchmark). This document synthesizes only — no new findings, no code changed.

## 1. What this was

Two independent, differently-lensed reviews of `server/` ran back to back: a code review that fanned six correctness lenses out via a Fable-5 agent fan-out, then independently re-verified every surviving finding in a second pass; and an editorial-workflow review that built a documented model from `docs/` alone, cross-walked it against code, drove a live persona walkthrough, re-walked the QA checklist, and scored the result against an 8-dimension practice benchmark. Both are findings-first and read-only — no code, config, or content changed.

## 2. The through-line

Three problems show up independently in both reports.

**(a) Book-scoping is a proven pattern that two route files never adopted.** The code review's only two High findings — `pipeline.js:29` (any head-editor can inject/render/publish another book's content) and `sections.js:627` (cross-book approve/assign/request-changes) — plus the Medium `sections.js:156` (unscoped upload into `03-faithful-translation/`) are the exact mechanism behind the editorial review's four-eyes-integrity RISK (dimension 1 of 8). Unit 0 built and tested `requireHeadEditor`/`requireHeadEditorFor` for exactly this; these three routes never wired it in.

**(b) Failure handling swings between silent and raw, never lands on "fail loud with a clean message."** Six confirmed silent `catch {}` blocks swallow audit-log writes on approve/reject/unapprove; `admin.js:397` renders a real pipeline failure identically to "book untouched"; the live walkthrough's TM auto-regeneration failure (fixture-only) logged only an invisible WARN while its response still said `success:true`. At the opposite extreme, a raw SQLite `UNIQUE constraint failed` reached a head-editor via a browser `alert()` when `discuss`/`rejected` segment states hit their nonexistent resolution path — reproduced live, in ordinary use. In between, two contract findings show the server already computing a clean message and the client discarding it for a bare code.

**(c) Documentation and configuration both drift toward describing what no longer exists.** `master-pipeline.md` self-declares "authoritative" while describing a fully retired pipeline; `review-protocol.md` — a skill that *auto-triggers* on "discussing reviews or approvals" — teaches a review model disconnected from the live system; `terminology.md` calls a dead CSV "the authoritative source"; CLAUDE.md's own `npm run update-status` command doesn't exist; `ENABLE_DIRECT_QUEUE` was documented as the workflow-trap fix but never built. The code review found the identical shape in config: `.env.example` documents four environment variables nothing reads, seeded into every fresh setup as if live.

## 3. Proposed remediation batches (triage order)

Ordered by severity and live-reproducibility first, then by cost/leverage. "Draws from" cites the code report's own batch letters and finding numbers for traceability.

| # | Batch | What / why now | Size | Draws from |
|---|---|---|---|---|
| 1 | Book-scoped authorization sweep | Wire `requireHeadEditorFor` into `pipeline.js:29`, `sections.js:627`, `sections.js:156` (+ tracked SA-11 rider, `books.js:509`). Only 2 High findings; one PR, one shared cross-book test. | S | Code Batch A + editorial dim 1 / rec #2 |
| 2 | `discuss`/`rejected` states + dropped error messages | Give `discuss`/`rejected` a server-side exit path — a re-save on a stale row currently raw-SQL-`alert()`s a head-editor (live-reproduced). Also surface the clean messages the server already sends instead of a bare code (`pipeline.js:83`, `saveRetry.js:209`). | S | Editorial §3 bug(a)/rec #3 + code findings 14, 24 |
| 3 | Documentation authority triage | Retire/relabel `master-pipeline.md` and `review-protocol.md` (both describe a retired process; the latter auto-triggers); fix `terminology.md`'s dead-CSV claim and the nonexistent `update-status` script; decide the "Submit" button's fate. | S | Editorial §2 drift catalog + rec #1, #4 |
| 4 | Fail-loud sweep | Replace ~6 silent `catch {}` around approve/reject/unapprove audit writes; stop faking zeros on real admin-list failures; log the status-fallback catch; fix an eager DB-open (test-isolation hazard). | S | Code Batch E (findings 20, 21, 22, 37) + editorial rec #5 |
| 5 | Apply, job-model & version-history integrity | Reorder localization approve-then-write; ID tie-break same-second approvals; restore should reindex too; snapshot empty segments; check render-in-progress before applying edits; give pipeline jobs a `book` field. | M | Code Batches B+C (findings 3, 5, 6, 15, 16, 19) + editorial dim 7 |
| 6 | Concurrent-edit lost updates | Scope localization's pending-edit lookup by editor ID so a second editor can't silently overwrite a first editor's still-pending submission; cancel a queued retry once a newer save has already succeeded. | M | Code Batch D (findings 7, 8) + editorial dim 5/7 |
| 7 | Dashboard/view contract repair | 12 field-name/shape mismatches between route and page — stage badges, activity panels, personal dashboard, term-lookup scoping, a dead endpoint, a progress double-count. No content or security risk. | L | Code Batch F (12 findings) + editorial dim 5/6 |
| 8 | Appendices label unification | Two incompatible internal "appendices" labels undercount appendix progress to zero and exclude it from search indexing; the pipeline panel separately rejects the appendices chapter the editor itself offers. | S | Code Batch G (findings 17, 23) |
| 9 | Dependency & dead-code hygiene | Declare (or replace) the undeclared `glob` dependency first — it can fail a clean install anytime. Rest is deletion: dead notification functions, unused analytics middleware, 4 dead env vars, 2 stale files, stray strings. | M | Code Batch H (findings 9, 32, 33, 34, 35, 36) |

## 4. Stays on the lead's manual pass (prod-only)

Neither review exercised real Microsoft Entra ID OAuth or nginx-fronted production — both used synthetic sessions (the code review is static; the live walkthrough authenticates via minted test cookies, per project convention). This class of surface has caused real production incidents before and shouldn't be assumed fine by default.

From the QA checklist, explicitly not fully exercised this round:
- **5c (PROD-ONLY):** server boot with a deliberately broken legacy migration — requires a destructive from-scratch DB rebuild.
- **1f, 3c, 3e (SKIPPED):** restore after a divergent re-extraction; the assigned-editor-succeeds path; assignment table missing/renamed → fail-closed `503` — skipped as too destructive to a live session or already unit-tested, not because they specifically need production infrastructure.

2 rows of the docs↔code drift catalog are **UNDETERMINED** because the fact lives outside this repo's reach: whether `GREYNIR_URL` is actually set in production, and whether a reader sees a correctly-assembled "mixed" chapter page when only some of its modules are promoted past mt-preview (that assembly logic lives in namsbokasafn-vefur).

## 5. Confidence & caveats

Four findings were refuted outright on the code review's second pass and are excluded from every count above: `publicationService.js:247` and `books.js:590` (both already log via the standard logger — not silent), `segmentEditorService.js:755` (the file write is already atomic, no corruption window), and `segmentEditorService.js:750` (the missing pre-apply snapshot is a deliberate, commented best-effort choice). Some editorial verdicts are necessarily CODE-READ rather than LIVE: the project holds roughly three faithful modules and one small TMX total, so the TM-lifecycle and terminology-governance GAP verdicts partly rest on reading the mechanism rather than watching it run at volume, and the terminology review deliberately didn't exercise the glossary-export path live, to avoid mutating a real book's tracked file. Both fan-outs were effectively pure-Fable: the 145-agent first pass had exactly one safety-classifier fallback to Opus (billed as a cache read); the 42-agent second-pass verification ran with zero fallbacks. Worth noting for method: the live walkthrough caught a bug (the `discuss`/`rejected` raw-SQL `alert()`) that neither code fan-out surfaced — the concrete case for running both perspectives rather than either report alone.

---

*Companion reports: [`2026-07-11-server-code-review.md`](2026-07-11-server-code-review.md), [`2026-07-11-editorial-workflow-review.md`](2026-07-11-editorial-workflow-review.md).*
