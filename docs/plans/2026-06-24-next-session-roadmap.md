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

## The headline: a large batch of merged work is UNDEPLOYED

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

## Recommended sequence

| Pri | Track | Why first | Effort |
|-----|-------|-----------|--------|
| **0** | **Deploy the merged batch** (server + content) | nothing helps anyone until shipped; unblocks QA | lead-driven, hours |
| **1** | **Manual QA on the running server** (remediation §0–5 + this session's features) | validates the deployed batch; catches what unit/E2E can't | lead, ~½ day |
| **2** | **Complete shipped-but-invisible backends** (UI follow-ups) | turns landed code into editor-usable features — high leverage, low risk | per item, small–med |
| **3** | **Greynir sidecar deploy** | the one shipped feature inert without infra | infra + wiring |
| **4** | **Review fast-follows** (batched small fixes) | cheap correctness/polish; clears debt | batch, small |
| **5** | **E2E test-isolation** (temp-book fixture) | recurring hygiene risk; keeps biting | infra, med |

Tracks 2–5 are independent and cherry-pickable; only 0→1 is strictly ordered.

---

## Track 0 — Deploy (lead-driven)
- Pull `main` on the Linode box; restart the editorial server (new server code:
  routes, services, layout, views).
- `node scripts/sync-content.js --source ../namsbokasafn-efni` (from vefur) for
  any content; deploy vefur if reader-side changes are pending.
- Live-verify the runbook's checklist + spot-check this session's features:
  logout button, "Beita víðar" propagation, Icelandic editor title, subject-scoped
  terms, no `/api/images` 404 on `/library`.
- **Caveat:** the propagation E2E left ~111 test pending-edits (`[e2e-…]`,
  `Markmiðstexti …`) in the server's `sessions.db` if E2E ran against it — these
  are NOT in the production DB (tests run in the sandbox), but if prod ever ran
  the suite, purge those marked rows first.

## Track 1 — Manual QA (lead)
- Remediation manual QA §0–5 (authz boundaries, render rollback, restore
  round-trip, enforcement 403/503, stored-XSS, page-auth redirects) — carried
  since June 10; see [`2026-06-10-qa-checklist.md`](2026-06-10-qa-checklist.md).
- This session's features on a real server (the items above).
- If QA finds save/apply-path bugs, fix before building further on those paths.

## Track 2 — Complete shipped backends (the high-leverage editor work)
These backends landed (PRs #121–#123) but have no/partial UI, so editors can't
use them. Each is a focused frontend unit:
- **Concordance search panel** (Unit 2.3) — the `GET …/concordance` endpoint
  exists; add the editor search UI + match highlighting.
- **Term-mining candidate queue UI** (Unit 3.5) — endpoints exist (and the
  route-shadowing 404 was fixed this session, #147); build the head-editor
  review queue that consumes `/mined-candidates`.
- **Repetition-report view** (Unit 2.5) — `GET …/repetition-report` exists;
  add the head-editor surfacing.
- **Live-QA report surfacing** (Units 3.3 / 4.5) — terminology + mechanical-QA
  findings as a per-module review-panel summary (currently only save-time toasts).
- **In-editor spellcheck trigger** (Unit 4.2) — once Greynir is deployed (Track 3),
  add the on-demand button calling `GET …/:moduleId/spellcheck`.

## Track 3 — Greynir spellcheck sidecar (infra)
- Deploy `server/greynir-sidecar/` (Python) on the box; set `GREYNIR_URL`.
- Glossary-seeded dictionary so chemistry terms aren't flagged.
- Then wire Track 2's in-editor trigger.

## Track 4 — Review fast-follows (batch one small PR)
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

## Track 5 — E2E test isolation (infra)
The E2E suite mutates **real** `efnafraedi-2e` content + `sessions.db`
(markers, propagated edits, TMX). Recurring risk: a crashed run or `git add -A`
could commit test markers. **Isolate the editor/propagation/terminology E2E to a
temp book fixture** (or a disposable DB), removing the per-test cleanup hacks.
Long-noted in memory; worth doing before the suite grows further.

## Deliberately still out of scope (unchanged from the throughput roadmap)
Fuzzy TM matching (MTPE framing — fresh MT beats a stale fuzzy match); Pass-2
localization buildout (starved until Pass 1 produces faithful content); real-time
collaboration / dashboard rewrites (wrong scale for a ~5-editor team); more
platform hardening (diminishing returns after remediation Units 0–5).

## Open decisions for the lead
1. **Deploy cadence:** ship the whole merged batch at once, or stage it? (One
   sync is simplest; the batch is internally consistent and green.)
2. **Track 2 priority order:** which shipped backend to surface first? Suggest the
   **term-mining queue** (turns the project's strongest asset — the glossary —
   into an active feedback loop) or **concordance panel** (most-requested editor
   aid). Lead's call.
3. **Greynir:** worth the Python-sidecar operational cost on the box, or defer
   spellcheck indefinitely? (Number/EN-residue QA already ships engine-free.)
