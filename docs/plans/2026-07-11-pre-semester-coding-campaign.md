# Pre-Semester Coding Campaign — 2026-07-11

**Constraints:** ~2 weeks until biology onboarding starts; ~5 weeks until semester start.
**Priority rule (lead-set):** maximize Claude-executable coding work; lead-manual tasks run in a parallel lane, never on the critical path.
**Method (standing workflow):** each numbered item below becomes its own session: `superpowers:brainstorming` → `writing-plans` → SDD execution, one PR each, `npm test` from repo root as the gate. This document is the ORDERING, not the implementation plan.

## Phase 0 — ✅ COMPLETE (2026-07-11)
Track C (MT edit-lock) SHIPPED + MERGED (PR #266; final whole-branch review: ready-to-merge, 0 Critical/Important). #265 merged. All three provenance-remediation tracks are shipped (A #262 · B #264 · C #266); remaining activation is operational, in the LEAD lane (L1/L2 below).

## Phase 1 — server security & correctness sprint (~days 1–3, 4 small PRs)
Rationale: highest-severity unfixed defects; protects live editors immediately; all sized S; zero dependence on biology decisions.
1. **Batch 1 — book-scoped authz sweep**: wire `requireHeadEditorFor` into `pipeline.js:29`, `sections.js:627`, `sections.js:156` (+ `books.js:509` SA-11 rider); one shared cross-book test.
2. **Batch 2 — `discuss`/`rejected` exit path + dropped error messages**: server-side path for stale-row re-save (kills the raw-SQL `alert()`); surface clean server messages (`pipeline.js:83`, `saveRetry.js:209`).
3. **Batch 4 — fail-loud sweep**: ~6 silent `catch{}` on approve/reject/unapprove audit writes; no fake zeros on admin-list failures; fix eager DB-open.
4. **SR-OOS-2 — server-side structural-marker backstop** on the save route (client-only today).
4b. **git-backup.sh atomic-add hardening** (Track C final-review recommendation): one empty pathspec in the shared `git add` list silently no-ops the ENTIRE content backup (`|| true` hides the exit-128). Per-pattern staging or drop `2>/dev/null` so failures log. Small, and a durability feature (the `.locked` glob) now leans on this cron.

### Register — findings discovered DURING batch 1 (item 1), logged per standing feedback
- **B1-F1 `[fix]` — `suggestions.js` activityLog shape bug (7 sites).** Same class as the bug fixed in `07cd26e0`: `{action, entityType, entityId, details}` vs the service's `{type, description, metadata}` NOT NULL contract → every mutating suggestions action likely 500s on its audit write. Fix-or-retire (usage check first, mirrors the upload-route decision). Small standalone PR.
- **B1-F2 `[fix]` — status route's NON-elevated transitions are un-book-scoped for plain editors.** An editor of book A can drive book B's section through editor-level transitions (`review_in_progress`→`review_submitted`). Outside batch 1's ratified findings; needs an editor-scoping design (editors carry no `books[]` — assignments model). Candidate rider on batch 5/6 or its own item.
- **B1-F3 `[fix]` — `books.js` `files/scan` route: role-gated DB-write path.** `scanAndRegisterExistingFiles(bookId, …)` writes registration rows, gated by `requireEditor()` only — same missing book scope, lower stakes (registers existing on-disk files, accepts no content). Fold into B1-F2's editor-scoping item.
- **B1-F4 `[test]` — `requireHeadEditorFor`'s `!book`→404 branch has no route-level test** (loadSection's not-found guard always fires first on section routes; the pipeline resolver can't return falsy without the guard 404ing pre-validation — covered only at middleware-unit level if at all). Nice-to-have unit case on the middleware itself.
- **B1-F5 `[fix]` — `admin.js` `GET /assignments/:book` (~:986) is un-book-scoped (read, not mutation).** Discovered while fixing the sibling POST/DELETE mutation routes (Task 6, whole-branch review finding). Gated by `requireAuth, requireRole(ROLES.HEAD_EDITOR)` only — any head-editor can read another book's chapter assignments, assigned-editor names, and editorial progress via `:book` in the URL. Lower severity than the POST/DELETE fix (data leak, not an access-control mutation) — deliberately NOT fixed in Task 6's commit (read vs mutation, keep diffs surgical). Same fix shape: swap in `requireHeadEditor('book')`.
- **B1-F6 `[test]` — harness-coverage gap: `crossBookAuthz.test.js`'s minimal DB schema has no `users` table**, so `userService.assignChapter`/`getBookAssignments` throw/fail-open before reaching the interesting owner-case behavior (Task 6's admin assignment routes: owner-case POST asserts only `not-401/403` because it actually 500s on `isUserTableReady()===false`; owner-case DELETE happens to clear to 200 because `getBookAssignments` fails open to `[]` and the handler no-ops). Both assertions correctly catch the security property (cross-book → 403) but the owner-case "happy path" isn't really exercised. Candidate for T7 test-hardening: add a minimal `users` + `user_chapter_assignments` table pair to the harness schema.
- **B1-F7 `[fix]` — `activityLog` `type` strings fragment the audit vocabulary.** Three of the section-route call sites fixed in `07cd26e0` keep action-style `type` values that near-miss the service's `ACTIVITY_TYPES` enum: `submit_review`/`approve_review`/`request_changes` vs the enum's `review_submitted`/`review_approved`/`changes_requested`. `GET /api/activity/types` publishes only the enum, so any future type-filter built on it never matches these rows. **Latent, do NOT churn in a security PR:** `status.js`'s `getActivityIcon`/`getActivityColor` maps already key on the action-style strings, so aligning the `type` values to the enum would BREAK the icon map unless both are changed together. No live consumer filters by `type` today (whole-branch review confirmed). Resolve deliberately: pick one vocabulary and update service enum + call sites + icon map together.
- **B1-F8 `[fix]` — `userService.getBookAssignments` fails open to `[]` on any "no such table" error** (userService.js:729-730), not just complete DB absence. A partial-migration state (e.g. `users` present but `user_chapter_assignments` dropped) would make `DELETE /api/admin/assignments/:book/:chapter` silently return `{success:true}` without removing anything and without surfacing an error. Pre-existing (unchanged by Task 6, surfaced by its whole-branch review); fail-loud-batch-adjacent (batch 4) — the swallow should distinguish "table genuinely absent at bootstrap" from "table unexpectedly missing at runtime".

## Phase 2 — biology-readiness pipeline sprint (~days 4–10, before onboarding)
Rationale: every item here either bites ON biology intake or gates the Pass-1/re-MT push that precedes it.
5. **B4 — bracket markers for `{{term}}`/`{{fn}}`** (the last lossy ~2.3% inline class) + positional-id restore hardening. Gates the 6-module re-MT (RC3/RC4) and the Pass-1 push. After merge: re-MT of m68764/770/789/791/793/829 — needs lead OK for API spend (small; ISK estimate via --dry-run first). Note: MT edit-lock does NOT block these (unedited modules stay re-runnable — by design).
6. **P0-1 — depth-aware nested-element extraction** (`renderChildrenInDocumentOrder`/`extractNestedElements` depth-blindness; E6/E9 patched symptoms only). Biology-likely trigger.
7. **A2-a/b — inject robustness**: `--allow-en-fallback` scoping to module (not run), partial-chapter failure isolation + residue report always written.
8. **Boundary-check trio (one or two sessions)**: B3 producer bracket-marker count check; #15 duplicate-seg-ID policy unification (`seg-markers.cjs` one policy, documented); D2 shared HANDLED_INLINE/BLOCK list imported by probe+extractor+renderer.
9. **D3 — os-embed exercise translation path** (organic ships 1,961 EN problems today; biology uses os-embed too — extract→MT→inject path for `01-source/exercises/*.json` content, respecting 01-source read-only: translated output lands downstream, never in source).
10. **Renderer biology-watch sweep (one session)**: P0-2 (multi-class `unnumbered`), P0-3 (null-info section key), P0-4 (roman lists), P0-5 (dropped emphasis classes), RV-3 (figure pre-scan unnumbered skip), RV-4 (id-needle vs target-id) + appendix roadmap #20/#22 (fragment drop; key-terms fallback bypasses resolver).
11. **[Cross-repo, relaunch in vefur] embed CSS** (`.embed-responsive`/`.embed-fallback`, handoff plan vefur PR #175) — the one external gate for biology embed-bearing chapters.

## Phase 3 — semester editorial-quality sprint (weeks 3–4)
Rationale: editors return at semester start; these protect and de-confuse their daily flow.
12. **Batch 5 — apply/job/version integrity** (approve-then-write order, same-second tie-break, restore reindex, render-in-progress check, jobs get `book`).
13. **Batch 6 — concurrent-edit lost updates** (localization pending-edit scoping by editor; stale-retry cancellation).
14. **Batch 8 — appendices label unification** (progress + search indexing).
15. **rem-2.2 — localized restore parity** (version history for Pass-2, matching faithful).
16. **Batch 7 — dashboard/view contract repair** (12 mismatches; L — timebox or split).

## Phase 4 — products & provenance gaps (weeks 4–5, audit's own order)
17. **Licence metadata per product** — needs lead posture decision on Physics+Organic (CC BY-NC-SA) FIRST (decision lane); then book-config licence field → renderer emission → vefur consumption (small cross-repo tail).
18. **Terminology subject-fallback-on-miss** (lead-clarified requirement; currently hides other subjects).
19. **Glossary review-queue** (proposed terms go live immediately today).
20. **Aligned research-corpus export** (EN/MT/faithful/localized; MT↔edited is the MTPE research asset).
21. **TM + Árnastofnun export path.**

## Phase 5 — hygiene (fill-in / opportunistic, no deadline)
22. Batch 9 (undeclared `glob` first, then dead-code deletion; SR-OOS-1 archiver skew). 23. Batch 3 (docs authority triage + Submit-button decision [lead]). 24. Hardening-tests one-shot: TB-OOS-1 net widening question, Track A residuals (download-guard, health route-wiring), C3 workList-wiring test. 25. 🟢 smalls as warm-ups: #29/#30, C3-b, A2-c, TERM-1, low-cli, decision-1 disposition [lead call].

## Parallel LEAD lane (not on the coding path; unblock whenever convenient)
- L1. Linode Object Storage bucket + rclone crypt + `BACKUP_REMOTE` cron (Track A activation). **Recommendation: different region than the Linode** — see bucket note in session log; runbook line to be added.
- L2. Deploy server + one-time `node scripts/backfill-mt-locks.js --db` on prod (Track C activation).
- L3. Vefur sync + build + deploy (Phase-0/-6 content delivery — readers see appendix labels/glossary/answer fixes).
- L4. `VEFUR_DEPLOY_TOKEN` secret (revives auto-sync; infra-1).
- L5. Manual QA §0–§5 walk + 3 prod-only cases (combined efni+vefur pass, per June plan).
- L6. Greynir sidecar deploy + `GREYNIR_URL` (in-editor spellcheck goes live).
- L7. Decisions: Physics/Organic licence posture (gates #17); residue-report disposition (decision-1); table-as-image transcription (decision-2); Submit-button fate (with #23); re-MT API spend OK (with #5).

## Sizing honesty
Phases 1–2 ≈ 10–12 PR-sized sessions in ~10 working days — feasible but tight; #9 (D3) and #5 (B4) are the two likely-to-grow items. If time squeezes before onboarding: #10 and #11 must survive (biology-gating); #9 can slip into onboarding itself (organic already ships EN — no new regression). Phases 3–5 fit weeks 3–5 with room; Phase 4's #20/#21 are the first to defer past semester if needed — they serve research deliverables, not the classroom.
