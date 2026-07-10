# Server/Editor Two-Perspective Review — Design

**Date:** 2026-07-10
**Status:** Design approved in-session; execution plan to follow (writing-plans)
**Trigger:** Content-side review campaign (Fable RUNs 1–6 + Phase-0/1 remediation) is delivered; the lead is turning to the `server/` editorial platform, which the campaign explicitly left unreviewed ("server/ authz pass" in the review-strategy backlog).

---

## 1. Objective

Two complementary reviews of the `server/` editorial workflow platform:

1. **Code review** — function and interface: correctness, security/authz, data integrity, state, error handling, contract drift between backend and the client JS/views, dead code.
2. **Editorial-workflow review** — the workflow as a *process*, judged from the seat of a seasoned professional translator/editor, grounded in what the repo documentation says the process is, what the code actually implements, and what a real editing session feels like.

The May 2026 audit (`docs/audit/2026-05-10-editorial-workflow-audit.md`) took the lens "our users are chemistry teachers, not translators" and fixed UX truthfulness. This review inverts the lens — *is the process itself professionally sound?* — while keeping the May audience constraint as a hard boundary on recommendations: process rigor yes, re-jargonized UI no.

## 2. Decisions already made (approved in-session 2026-07-10)

| Decision | Choice |
|---|---|
| Deliverable mode | **Findings-first.** Ranked, verified findings reports in `docs/audit/`; no code changes during review; lead triages afterwards (RUN 1–6 → consolidated-remediation pattern). |
| Workflow-review depth | **Live walkthrough + absorb manual QA §0–§5.** Local server, throwaway DB, fixture book; the outstanding remediation QA checklists get executed and evidenced; lead keeps a lighter confirmation pass. |
| Method | **Hybrid.** Code review = one Fable fan-out workflow (campaign shape). Workflow review = inline by the main session, with a small verify fan-out on its factual claims. |

## 3. Scope

**In:**
- `server/index.js`, `config.js`, `constants.js`
- `server/routes/` (19 files), `server/services/` (35), `server/middleware/` (3), `server/lib/`
- `server/migrations/` (~35) — idempotency + schema sanity
- `server/public/js/` (12 client files) and `server/views/` (12 templates) — as the interface surface
- `server/__tests__/` — read as *coverage-gap evidence* (what's untested), not test-style critique
- `server/greynir-sidecar/` — shallow: interface + failure modes only
- The `renderService.js` ↔ `tools/cnxml-render.js` seam (server-side of it)
- The full workflow-doc corpus (see §6 Phase A)

**Out:**
- `tools/` pipeline internals (just reviewed by RUNs 1–6), except the seam above
- namsbokasafn-vefur (RUN 6 covered the seam)
- Entra ID as a provider; better-sqlite3 as an engine; the stack choices themselves
- Translation content quality (that's the content track)

## 4. Ground rules

1. **Read-only.** No fixes land during the review. Trivia included — everything goes in the report or register.
2. **Evidence grammar** (both reports): every finding anchored to `file:line`, code quoted, concrete failure scenario, severity + CONFIRMED/PLAUSIBLE confidence, fix sketch. Ranked most-severe first.
3. **Exclusion list — "don't re-report, do cross-reference."** Compiled at execution start from: RUN 4/5/6 report findings (several server-side ones are tracked but NOT yet fixed, e.g. RUN5-R5 admin chapter-cap-30 at `admin.js:1058/1098`, and the "kill book-scoped module globals" workstream), the register in `docs/plans/2026-06-28-pipeline-architecture-implementation-plan.md`, the roadmap (`docs/plans/2026-06-24-next-session-roadmap.md`), deferred dashboard Phases 2b–6 (`docs/plans/2026-05-10-editorial-workflow-redesign-plan.md`), and known follow-ups in CLAUDE.md/memory (e.g. `getRegisteredBook` INNER JOIN; `analyticsService` eager DB open). Finders receive the list; dedup enforces it; reports cite tracked items where relevant instead of re-reporting them.
4. **Environment hygiene.** Live parts: kill :3456 first; `SESSIONS_DB_PATH` → throwaway DB; writes target the committed fixture book only and are reverted afterwards; `git status` checked clean after the walkthrough (finder/walkthrough agents with Bash have dirtied the tree before — Phase-0 lesson).
5. **Out-of-scope finds** (anything not server/editor) → register + memory, per standing feedback rule.

## 5. Perspective 1 — Code review (Fable fan-out workflow)

One Workflow run, the proven campaign shape: **find → dedup → 3-skeptic refute-by-default → synthesize.**

**Six finder lenses** (each finder gets: its lens brief, the server file inventory with line counts, the exclusion list, and a structured-output schema — file, line, summary, failure_scenario, severity, confidence, dimension):

| # | Lens | Prompt focus |
|---|---|---|
| 1 | AuthZ / security | Per-route sweep: route × middleware × role table; book-scoping of head-editor powers (Unit-0 middleware actually covering what it claims); IDOR; param validation; output escaping; rate limiting; upload handling (multer); JWT/cookie handling |
| 2 | Data integrity | Transactions around multi-write operations (apply, restore, propagation); better-sqlite3 coercion gotchas; migration idempotency + ordering; apply/restore/version round-trips; FTS index consistency |
| 3 | State & concurrency | Module-level state in services; `moduleLocks`; optimistic-concurrency seams (`baseEditId` and its localization counterpart); the "trusts ambient state" lens (cwd, env, singleton DB); race windows between check and write |
| 4 | Silent-fallback / fail-loud | Swallowed catches; fallback-to-default values masking config gaps; error labels that misattribute phase (the #96 class); endpoints returning 200 with partial failure; logging that hides vs surfaces |
| 5 | Interface-contract drift | Route ↔ client-JS ↔ view triples: fields advertised but never produced (May-audit F3 class), fields produced but never read, shape mismatches, client error-path handling of non-2xx, `ui-strings.js` coverage vs inline strings |
| 6 | Dead code & config rot | Never-called endpoints/services; half-wired features; env flags read but unset (or set but unread); stale `server/data/` artifacts; dependency use vs package.json |

**Verification:** cross-finder dedup (plain code + one dedup agent, merged against the exclusion list) → 3 skeptics per surviving finding, refute-by-default, kill on ≥2 refutes → one synthesis agent producing the ranked draft with fix sketches and suggested remediation batches.

**Effort/model:** agents inherit the session model (Fable 5). Finders + synth `effort: high`; skeptics `medium` (raised to `high` for findings whose refutation needs deep tracing); mechanical stages `low`.

**Ops gates (campaign lessons):** check `agents_error` and the journal before trusting any empty result; grep run transcripts for `"type":"fallback"` (expected ≈ 0 — server code shouldn't trip the `bio` classifier; a stray fallback is cache-read-billed and acceptable, >2 finders fallen back = flag as hybrid in the report). Main session hand-spot-checks the top findings before they're published (RUN 1 pattern).

## 6. Perspective 2 — Editorial-workflow review (inline, six phases)

**A — Ground truth.** Read the process corpus: `docs/workflow/simplified-workflow.md`, `master-pipeline.md`, `mt-process.md`, `config-and-rerun-guide.md`, `editor-improvements-jan2026.md`; `docs/editorial/pass1-linguistic.md`, `pass2-localization.md`, `terminology.md`; skills `editorial-pass1`, `localization`, `review-protocol`, `workflow-status`; `docs/plans/2026-06-12-editorial-throughput-roadmap.md` (MTPE amendment = current process model); May audit + redesign plan. Output: a state/role/gate/artifact model of the *documented* workflow.

**B — Docs ↔ code cross-walk.** Verify each documented step/claim against the implementation; catalog drift both directions (docs ahead of code, code ahead of docs). CLAUDE.md itself warns this drift exists.

**C — Live persona walkthrough.** Local server (`npm run server:dev` posture, throwaway `SESSIONS_DB_PATH`, fixture book `books/__e2e-fixture__`), driven via Playwright + direct API calls using the E2E auth helper (`loginAs(role)`, no Entra needed). Scenarios:
1. **Editor:** log in → find my work → open module → MTPE loop (segment editing, bracket markers, term hints, concordance search, repetition/propagation) → save → "am I done? what happens next?" — the Anna test, re-run against the post-remediation UI.
2. **Head-editor:** find pending work → approve/reject/discuss → apply ("Vista + Birta") → rebuild affordance → edit-again → version history → restore round-trip.
3. **Admin:** assignments + enforcement toggle (403/503 behavior), book settings, terminology governance (mining queue → approve → glossary → export), dashboard truthfulness vs DB state.
4. **Cross-cutting:** two editors colliding on one segment (409 path, both editors' experience of it); Pass 2 with `enforce_localization_review` ON; QA/spellcheck behavior with the Greynir sidecar absent (as in prod today); notifications/digest paths.

Screenshots captured where a UI finding warrants evidence.

**D — Manual QA §0–§5 absorption.** Execute the objective items of `docs/plans/2026-06-10-qa-checklist.md` against the local server; report gets a per-item pass/fail evidence table. Items requiring prod config (real Entra OAuth flow, nginx headers, deploy-path behavior) are marked **prod-only — remains on the lead's pass**.

**E — Professional-practice benchmark.** Judge the observed process against seasoned translation-shop practice, one verdict (sound / gap / risk) per dimension:
- Review states & four-eyes integrity (incl. self-approval policy)
- TM lifecycle — is the human-verified corpus actually accumulating and reusable? (auto-regen on apply; exact-match leverage; concordance)
- Terminology governance loop — mining → approval → glossary → MT priming; consistency enforcement at save/submit
- QA gates — terminology consistency, number consistency, EN-residue, spellcheck; where they sit in the flow and whether they can be skipped
- Reviewer/editor throughput ergonomics — keyboard-first flow, batching, queue design, SLA visibility
- Traceability & audit trail — who changed what when; supersede chains; activity log fidelity
- Rollback & recovery safety — version restore, rebuild, backup posture
- Onboarding load — what a new editor must be told vs what the system teaches

Constraint: recommendations must serve chemistry-teacher users; the professional lens critiques the *process*, not the vocabulary.

**F — Mini verify fan-out.** ~5–8 agents adversarially check the draft report's *factual* claims (file:line assertions, repro steps, QA pass/fail evidence). Judgment verdicts stay the main session's, labeled as such.

## 7. Deliverables

1. `docs/audit/2026-07-<run-date>-server-code-review.md` — ranked findings, campaign grammar, "already tracked" section.
2. `docs/audit/2026-07-<run-date>-editorial-workflow-review.md` — drift catalog (B), walkthrough findings (C), QA §0–§5 evidence table (D), practice assessment (E), ranked recommendations.
3. Register updates (2026-06-28 plan register + roadmap) for out-of-scope finds; a memory topic file for this review thread.
4. **Joint executive summary** proposing consolidated remediation batches across both reports, sized for the lead's triage (analogous to the Phase-0 grouping).

All committed on a docs branch → PR (campaign precedent).

## 8. Sequencing

1. Compile exclusion list + finder context pack (file inventory, lens briefs).
2. **Launch the code fan-out in the background.**
3. While it runs: Phases A → B → C → D inline.
4. Fan-out completes → ops gates → hand-spot-check top findings.
5. Phases E → F.
6. Write both reports + joint summary; update register/memory; branch + PR.

Wall-clock: the fan-out is sub-hour; the inline half is the long pole (a solid working session). Token spend: ~2.5–3.5M (fan-out) + ~0.5M (mini-verify) + ordinary session spend — RUN 4/5 territory, per-run go-ahead already given by approving this design.

## 9. Success criteria

- Every route, service, middleware, migration, client-JS file, and view touched by at least one finder lens; the six lenses' coverage is stated in the code report.
- Every documented workflow step either walked live or explicitly marked not-walkable (with reason).
- Every QA §0–§5 item: pass / fail / prod-only, with evidence.
- Zero re-reported known items; tracked items cross-referenced instead.
- Both reports ranked, confidence-labeled, with fix sketches; joint summary proposes triage batches.
- Working tree clean after the walkthrough; no changes to real book content or prod.

## 10. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Port 3456 / stray server collision | Kill first (e2e pattern); throwaway DB via `SESSIONS_DB_PATH` |
| Walkthrough writes to committed fixture book | Revert after; `git status` gate in §4 |
| Fan-out fallback contamination | Transcript grep; >2 finders fallen back → label run hybrid in report (cache-read billing keeps cost low) |
| Finder findings plausible-but-wrong | 3-skeptic refute-by-default + main-session hand-spot-check of top findings |
| Report volume overwhelming a solo lead | Ranked + deduped + batched; the joint summary is the triage entry point |
| Greynir sidecar not running locally | That's itself a walkthrough scenario (graceful-degradation check), not a blocker |
