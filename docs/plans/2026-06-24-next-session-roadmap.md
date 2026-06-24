# Next-session roadmap — editorial throughput & shipping (2026-06-24)

**Purpose.** Consolidate everything left after the 2026-06-23 live-QA follow-up
session (8 PRs merged: #147–#153) into a prioritized agenda a later session can
pick up cold. This is a planning doc, not a spec — each chosen item still gets
its own design → plan → build cycle.

**Sources folded in:** the June-2026 editorial-throughput roadmap
([`2026-06-12-editorial-throughput-roadmap.md`](2026-06-12-editorial-throughput-roadmap.md),
Units 0–6 cores landed, sub-items deferred), the remediation roadmap
([`2026-06-10-remediation-roadmap.md`](2026-06-10-remediation-roadmap.md), manual
QA outstanding), the deferred fixlist
([`2026-06-17-deferred-fixlist-items.md`](2026-06-17-deferred-fixlist-items.md)),
and the review fast-follows accumulated this session.

---

## ✅ UPDATE 2026-06-24: Track 0 (editorial-server deploy) DONE
The lead ran `./scripts/deploy.sh` on the box → editorial server (`ritstjorn`)
is live at `main` (df952f5a); all 8 PRs (#147–#153) are deployed (DB backed up,
health check passed). **No vefur content sync was needed** for this batch — all
8 PRs are editorial-server code (no rendered-HTML output change; A1/A2 reader
output already shipped 2026-06-23). **Next priority is now Track 1 (manual QA on
the running server), then Track 2 (complete shipped-but-invisible backends).**
The section below is kept for context.

## The headline: a large batch of merged work is UNDEPLOYED (resolved — see update above)

Everything below the line is gated on one fact — **`main` is far ahead of
production**. Merged but not deployed:
- This session: L, B-4, N, M, B-1/2/3, K, terminology Unicode fix, O (#147–#153).
- Prior session: A1/A2 appendix/footnote fixes, intro-outline links, 3 feature
  pairs (check-knowledge, objectives, etc.), Item-D slug 404s — see
  [`2026-06-22-qa-and-deploy-runbook.md`](2026-06-22-qa-and-deploy-runbook.md).

None of it helps an editor or reader until it ships. The "Sync Content to Vefur"
Action is unconfigured (`VEFUR_DEPLOY_TOKEN` unset) and GitHub Actions credits
were exhausted (renews ~2026-07-01) — so **deploy is lead-driven and manual**
(`git pull` on the box + `node scripts/sync-content.js`, vefur deploy separately).

**This is the highest value-per-effort work available and should lead the next
session.** It is also a prerequisite for the manual QA below (you QA the running
server, not `main`).

---

## ⚠️ CORRECTION 2026-06-24: the "building" phase is DONE — re-aimed

A code audit this session found that **all of the throughput roadmap's
editor-facing features are already built AND wired** on `main` — the
"shipped-but-invisible backend" framing below (taken from the throughput
roadmap's stale 2026-06-13 "remaining UI" notes) is wrong:

| Feature | State on `main` |
|---|---|
| Concordance search panel | ✅ built + wired (search/highlight/provenance) |
| Term-mining candidate queue UI | ✅ built + wired (`loadMinedCandidates`/promote/dismiss) |
| Repetition-report view | ✅ built + wired (editor button → `runRepetitionReport`) |
| Live-QA review-summary panel | ✅ built + wired (terms/spell/repetition) |
| In-editor spellcheck trigger | ✅ button + `runSpellcheck` wired (needs only the sidecar deployed) |

**So the binding constraint is no longer code — it's DATA and ADOPTION.** Only
**3 faithful modules are applied project-wide**, so the data-driven aids
(concordance / TM / repetition) have almost nothing to search. More features
cannot move throughput; only (a) editors producing reviewed Pass-1 content and
(b) the Greynir sidecar getting deployed will. The corrected priorities:

| Pri | Track | Owner | Note |
|-----|-------|-------|------|
| **0** | ✅ Editorial-server deploy | done | #147–#153 live |
| **1** | **Manual QA on the running server** + **use the platform** | lead | the real lever now — exercise the built features; produce faithful content to populate the indexes |
| **2** | **Greynir sidecar deploy** (Python on box + `GREYNIR_URL`) | lead/infra | the one feature still inert (UI exists; engine isn't deployed) |
| **3** | ✅ **E2E test-isolation** (DB env-path + `__e2e-fixture__` book) | done | merged 2026-06-24; `books/` + `sessions.db` no longer mutated by tests; B-1 fixed. Residual: Logout parallel flake, `completeModuleReview` review-scoping (both small follow-ups) |
| **4** | **Review fast-follows** (small batch) | AI-doable | correctness/polish debt from this session's reviews |

There is **no net-new feature building left** in the throughput roadmap.
Tracks 3–4 are the only AI-doable work, and both are debt/quality, not features.

---

## Track 1 — QA + adoption (lead) — THE lever now
- Remediation manual QA §0–5 (authz boundaries, render rollback, restore
  round-trip, enforcement 403/503, stored-XSS, page-auth redirects) — carried
  since June 10; see [`2026-06-10-qa-checklist.md`](2026-06-10-qa-checklist.md).
- Exercise the now-live features on the real server: concordance search,
  term-mining queue (promote/dismiss), repetition report, review summary, "Beita
  víðar" propagation, logout, subject-scoped terms.
- **Produce faithful content.** The data-driven aids stay empty until editors
  review + apply Pass-1 content (3 modules today). This is what actually raises
  throughput — the tooling is ready and waiting for input.

## Track 2 — Greynir spellcheck sidecar (lead/infra)
- Deploy `server/greynir-sidecar/` (Python) on the box; set `GREYNIR_URL`. The
  in-editor `btn-spellcheck` → `runSpellcheck` → `GET …/:moduleId/spellcheck`
  path is already built and returns nothing until the sidecar runs.
- Glossary-seeded dictionary so chemistry terms aren't flagged.

## Track 4 — Review fast-follows (AI-doable; batch one small PR)
From this session's reviews (all non-blocking, recorded in memory):
- **O:** re-propagation self-conflict (own prior pending rows reported as
  "þegar breytt"); move inline `'Villa við fjölgun:'` into `ui-strings.js`;
  add category/length validation to the propagate route (parity with `/edit`).
- **B-4:** `highlightTermsInHtml` runs the term regex over rendered HTML — latent
  span-splice if a glossary headword equals a structural token (0 in committed
  glossaries today; guard it); `[[link:]]` chip title shows the full URL.
- **Terminology:** consider applying the Unicode word-boundary helper to the
  client EN highlighter too (currently ASCII-only; fine for English, but
  symmetrical).

## Track 3 — E2E test isolation (AI-doable; infra)
The E2E suite mutates **real** `efnafraedi-2e` content + `sessions.db`
(markers, propagated edits, TMX). Recurring risk: a crashed run or `git add -A`
could commit test markers (this session reverted `books/` ~6×, and the
propagation E2E needed a direct-DB cleanup hack + left ~111 stray pending
edits). **Isolate the editor/propagation/terminology E2E to a temp book fixture**
(or a disposable DB), removing the per-test cleanup hacks. Highest-value
AI-doable item — it pays off every future session.

## Deliberately still out of scope (unchanged from the throughput roadmap)
Fuzzy TM matching (MTPE framing — fresh MT beats a stale fuzzy match); Pass-2
localization buildout (starved until Pass 1 produces faithful content); real-time
collaboration / dashboard rewrites (wrong scale for a ~5-editor team); more
platform hardening (diminishing returns after remediation Units 0–5).

## Open decisions for the lead
1. **Greynir:** worth the Python-sidecar operational cost on the box, or defer
   spellcheck indefinitely? (Number/EN-residue QA already ships engine-free; the
   in-editor button is built and waiting.)
2. **AI-doable next:** Track 3 (E2E isolation) and Track 4 (fast-follows) are the
   only remaining build tasks, both debt/quality. Worth doing now, or park until
   the QA/adoption phase surfaces concrete needs? (Recommendation: Track 3 — it
   removes a real, recurring test-hygiene hazard.)
3. **Bigger picture:** the platform is feature-complete for throughput; the
   bottleneck is faithful-content production (3 modules applied). Is there a
   non-code blocker to editors doing Pass 1 at volume worth investigating?
