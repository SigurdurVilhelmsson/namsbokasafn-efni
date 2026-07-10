# Server/Editor Two-Perspective Review — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce two ranked, evidence-backed findings reports on `server/` — a code review (function + interface) and an editorial-workflow review (professional translator/editor lens) — plus a joint remediation-batch summary, without changing any code.

**Architecture:** Code review runs as one background Fable fan-out workflow (6 finder lenses → dedup → 3-skeptic refute → synth). The editorial-workflow review runs inline in the main session across six phases (documented-workflow model → docs↔code drift → live persona walkthrough → manual-QA §0–§5 absorption → practice benchmark → verify fan-out). The two share one exclusion list so neither re-reports already-tracked issues.

**Tech Stack:** Node 22.x, Express 5, better-sqlite3, Playwright (drives the live server via minted-JWT cookies — no Entra needed), the Workflow tool with `model:'fable'` subagents, Vitest.

## Global Constraints

- **Read-only review.** No source edits, no fixes, no "quick wins" land during this work. Everything goes in a report or a register. (Design §4.1)
- **Findings-first.** Ranked, `file:line`-anchored, code-quoted, concrete-failure-scenario, severity + CONFIRMED/PLAUSIBLE confidence, fix sketch. Most-severe first. (Design §4.2)
- **Exclusion list is authoritative.** Compiled in Task 0; every finder and the dedup stage honor it; tracked items are cross-referenced, never re-reported. (Design §4.3)
- **Environment hygiene.** Kill port 3456 before any live step; `SESSIONS_DB_PATH` → throwaway DB under `pipeline-output/`; live writes hit only `books/__e2e-fixture__`; `git status` must be clean after the walkthrough (Task 5 teardown gate). (Design §4.4)
- **Audience boundary.** Editors are chemistry teachers, not translators. The professional lens critiques the *process*, never re-jargonizes the UI. (Design §6E)
- **Out-of-scope finds** (anything not server/editor) → register (`docs/plans/2026-06-28-pipeline-architecture-implementation-plan.md`) + memory. (Design §4.5)
- **Ops gates on the fan-out:** check `agents_error` and the journal before trusting any empty result; grep transcripts for `"type":"fallback"`; main session hand-spot-checks top findings. (Design §5)
- **Model/effort:** subagents inherit the session model (Fable 5). Finders + synth `effort:'high'`; skeptics `medium`; mechanical stages `low`.
- **Scratchpad root for intermediate artifacts:** `/tmp/claude-1000/-home-siggi-dev-repos-namsbokasafn-efni/0f8a1aa0-d1bd-4b9c-a9e9-62f5c41fd512/scratchpad/server-review/` (referred to below as `SCRATCH/`).

---

## File / Artifact Map

**Intermediate (SCRATCH/, not committed):**
- `exclusion-list.md` — compiled known-issues the review must not re-report
- `finder-context.md` — server file inventory + the six lens briefs (shared context pack)
- `code-review-workflow.js` — the Workflow script (persisted by the tool; path captured)
- `code-findings-raw.json` — harvested ranked findings from the fan-out
- `workflow-model.md` — Phase A: the documented workflow as a state/role/gate/artifact model
- `drift-catalog.md` — Phase B: docs↔code drift, both directions
- `walkthrough-log.md` — Phase C: per-persona evidence + screenshot paths
- `qa-evidence.md` — Phase D: QA §0–§5 pass/fail/prod-only table
- `practice-benchmark.md` — Phase E: per-dimension professional assessment
- `verify-notes.md` — Phase F: fact-check verdicts on both reports

**Deliverables (committed on a docs branch):**
- `docs/audit/2026-07-10-server-code-review.md`
- `docs/audit/2026-07-10-editorial-workflow-review.md`
- `docs/audit/2026-07-10-server-review-joint-summary.md`
- Register update in `docs/plans/2026-06-28-pipeline-architecture-implementation-plan.md`
- Memory topic file `server-editor-review-2026-07.md` + `MEMORY.md` pointer

---

## Task 0: Environment gate + exclusion list + finder context pack

**Files:**
- Create: `SCRATCH/exclusion-list.md`
- Create: `SCRATCH/finder-context.md`
- Read: RUN 4/5/6 reports, register, roadmaps, CLAUDE.md follow-ups (paths in Step 2)

**Interfaces:**
- Produces: `SCRATCH/exclusion-list.md` (consumed by Task 1's workflow and Task 6's dedup) and `SCRATCH/finder-context.md` (consumed by Task 1's finders — contains the file inventory table and the six lens briefs verbatim).

- [ ] **Step 1: Create the scratch directory and confirm a clean, correct starting environment**

```bash
SCRATCH="/tmp/claude-1000/-home-siggi-dev-repos-namsbokasafn-efni/0f8a1aa0-d1bd-4b9c-a9e9-62f5c41fd512/scratchpad/server-review"
mkdir -p "$SCRATCH"
cd /home/siggi/dev/repos/namsbokasafn-efni
git status --short          # expect: clean (design doc + this plan already committed)
node --version             # expect: v22.x  (run `nvm use` first if not)
lsof -ti:3456 || echo "port 3456 free"
```
Expected: clean tree, Node 22.x, port free. If port 3456 is occupied by a stray server, `kill $(lsof -ti:3456)`.

- [ ] **Step 2: Harvest already-tracked issues into the exclusion list**

Read these and extract every *server/editor* issue already recorded, with its tracking location:
- `docs/audit/2026-07-09-fable5-run4-chem-pipeline-review.md`, `...-run5-biology-readiness-review.md`, `...-run6-cross-repo-seam-review.md` (RUN5-R2/R3/R5/R6 and RUN6-R2/R3/R4 touch server code)
- `docs/plans/2026-06-28-pipeline-architecture-implementation-plan.md` (the register)
- `docs/plans/2026-06-24-next-session-roadmap.md` (throughput backlog: concordance/mining/spellcheck adoption; Greynir sidecar deploy)
- `docs/plans/2026-05-10-editorial-workflow-redesign-plan.md` (deferred dashboard Phases 2b–6: `/yfirferd` inbox, `ENABLE_DIRECT_QUEUE`, CI invariant tests)
- `docs/plans/2026-06-10-qa-checklist.md` (which items are already ✅ auto vs open)
- CLAUDE.md "Recent changes" + memory `MEMORY.md` known follow-ups: `getRegisteredBook`/`listRegisteredBooks` INNER JOIN hiding catalogue-less books; `analyticsService.js` eager DB open; RUN5-R5 `admin.js:1058/1098` chapter-cap-30; the "kill book-scoped module globals" workstream.

Write `SCRATCH/exclusion-list.md` as a table: `Issue | Where tracked | server file:line if known | Re-report? (No — cross-ref)`.

- [ ] **Step 3: Build the file inventory + lens briefs context pack**

Write `SCRATCH/finder-context.md` containing:
1. The **file inventory** (from the survey already in context): routes/ (19), services/ (35), middleware/ (3), lib/ (4), migrations/ (~35), public/js/ (12), views/ (12), index.js/config.js/constants.js — each with its line count and one-line responsibility guess. This tells finders the whole surface so none is missed.
2. The **six lens briefs** copied verbatim from this plan's Task 1 Step 1 (so the context pack is self-contained if a finder reads only it).
3. A pointer line: "Honor `SCRATCH/exclusion-list.md` — cross-reference tracked items, do not re-report."

- [ ] **Step 4: Verify the context pack is complete**

```bash
grep -c "^| " "$SCRATCH/finder-context.md"   # inventory rows present
test -s "$SCRATCH/exclusion-list.md" && echo "exclusion list non-empty"
```
Expected: inventory has ≥80 rows (every server .js/.html file), exclusion list non-empty.

- [ ] **Step 5: Commit the context pack pointers (optional durability)**

The scratch artifacts are intentionally uncommitted. No commit here — proceed to Task 1. (This step is a no-op checkpoint confirming Task 0's outputs exist before the fan-out consumes them.)

---

## Task 1: Author and launch the code-review fan-out (background)

**Files:**
- Create (inline via Workflow tool): `code-review-workflow.js` — the tool persists it; capture the returned `scriptPath` and `runId` into `SCRATCH/workflow-run.txt`.

**Interfaces:**
- Consumes: `SCRATCH/finder-context.md`, `SCRATCH/exclusion-list.md` (their *contents* are embedded into the workflow script's prompts, since workflow subagents can't rely on scratch files being in their context — the script reads them at author time and inlines the text).
- Produces: a background workflow run; its ranked result is harvested in Task 6. `SCRATCH/workflow-run.txt` holds `runId` + `scriptPath`.

- [ ] **Step 1: Finalize the six lens briefs**

These are the finder prompts (each finder also receives the file inventory and exclusion list, inlined):

1. **AuthZ / security** — For every route file, build a route × method × middleware × required-role map. Flag: endpoints missing `requireAuth`/`requireRole`; head-editor powers not book-scoped via `requireHeadEditor(bookParam)`/`requireHeadEditorFor` (approve/reject/discuss/unapprove/complete/apply/publish/restore); IDOR (book/chapter/module from params used without ownership check); missing/weak `validateParams`; unescaped output into HTML/JSON script blocks; missing rate limits on mutating or expensive endpoints; multer upload validation (type/size/path); JWT verification + cookie flags (SameSite=Lax expected; Strict is a regression).
2. **Data integrity** — Multi-write operations that should be transactional but aren't (apply/`applyApprovedEdits`, restore/`restoreVersion`, propagation, localization apply); better-sqlite3 coercion traps (booleans as 0/1, `undefined` binding throws); migration idempotency (re-run safety; `CREATE INDEX IF NOT EXISTS` guarding name not columns — see `migrationSchema.createIndexIfColumnsExist`) and ordering; apply→version→restore round-trip correctness; FTS5 index staleness vs source table.
3. **State & concurrency** — Module-level mutable state in services (singleton DB is fine; per-request state in a module global is not); `moduleLocks` correctness + self-prune; optimistic-concurrency tokens (`baseEditId` for segments, its localization counterpart) — is every mutating path guarded, any TOCTOU between the 409-check and the write?; ambient-state trust (cwd, env, `process.cwd()` vs `import.meta.url`/`resolveDbPath()` — the #210/#213 class).
4. **Silent-fallback / fail-loud** — Swallowed `catch` blocks (empty, or logging nothing); fallback-to-default values that mask a config/data gap (the RUN 4/5 theme); phase-misattributing error labels (the #96 inject-vs-render class); endpoints returning 200 on partial failure; `log.error` present where a catch would otherwise hide a fault.
5. **Interface-contract drift** — For each route that feeds a view/client-JS file, diff the JSON shape produced vs consumed: fields advertised in JSDoc/response but never populated (May-audit F3 `workload`/`readyForAssignment` class), fields the client reads that the server never sends, type/shape mismatches; client `fetchJson` error handling of non-2xx; `ui-strings.js` coverage vs hardcoded inline strings.
6. **Dead code & config rot** — Never-referenced endpoints/services/exports; half-wired features (a service written but never called from a route — e.g. is `qaCheckService`/`check-consistency` reachable?); env flags read but never set, or set but never read; stale `server/data/*.json`; dependencies in package.json unused, or used but undeclared.

- [ ] **Step 2: Author the workflow script and launch it in the background**

Invoke the Workflow tool with the script below. Before invoking, read `SCRATCH/finder-context.md` and `SCRATCH/exclusion-list.md` and paste their contents into the `INVENTORY` and `EXCLUSIONS` template literals (the script cannot read scratch files at run time). Launch with `run_in_background` default (true).

```javascript
export const meta = {
  name: 'server-code-review',
  description: 'Six-lens fan-out code review of server/ with adversarial verification',
  phases: [
    { title: 'Find', detail: 'six lens finders over server/' },
    { title: 'Verify', detail: '3-skeptic refute-by-default per finding' },
    { title: 'Synthesize', detail: 'rank + dedup + fix sketches' },
  ],
}

// --- inlined context (pasted from SCRATCH at author time) ---
const INVENTORY = `<<PASTE finder-context.md file-inventory table here>>`
const EXCLUSIONS = `<<PASTE exclusion-list.md here>>`
const ROOT = '/home/siggi/dev/repos/namsbokasafn-efni/server'

const FINDING_SCHEMA = {
  type: 'object',
  properties: {
    findings: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          file: { type: 'string' },
          line: { type: 'integer' },
          summary: { type: 'string' },
          failure_scenario: { type: 'string' },
          severity: { type: 'string', enum: ['critical', 'high', 'medium', 'low'] },
          confidence: { type: 'string', enum: ['CONFIRMED', 'PLAUSIBLE'] },
          dimension: { type: 'string' },
          fix_sketch: { type: 'string' },
        },
        required: ['file', 'line', 'summary', 'failure_scenario', 'severity', 'dimension'],
      },
    },
  },
  required: ['findings'],
}

const LENSES = [
  { key: 'authz',     brief: `<<lens 1 brief>>` },
  { key: 'integrity', brief: `<<lens 2 brief>>` },
  { key: 'state',     brief: `<<lens 3 brief>>` },
  { key: 'failloud',  brief: `<<lens 4 brief>>` },
  { key: 'contract',  brief: `<<lens 5 brief>>` },
  { key: 'deadcode',  brief: `<<lens 6 brief>>` },
]

const VERDICT_SCHEMA = {
  type: 'object',
  properties: {
    refuted: { type: 'boolean' },
    reason: { type: 'string' },
  },
  required: ['refuted', 'reason'],
}

phase('Find')
// Pipeline: each lens's findings flow into verification as soon as that lens finishes.
const perLens = await pipeline(
  LENSES,
  (lens) =>
    agent(
      `You are reviewing the code under ${ROOT} through ONE lens.\n\n` +
      `LENS: ${lens.brief}\n\n` +
      `FILE INVENTORY (cover all of it for your lens):\n${INVENTORY}\n\n` +
      `ALREADY-TRACKED — DO NOT RE-REPORT, cross-reference only:\n${EXCLUSIONS}\n\n` +
      `Read the actual files. Every finding: exact file, 1-indexed line, one-sentence ` +
      `summary, concrete failure scenario (inputs/state → wrong outcome), severity, ` +
      `confidence, and a one-line fix sketch. Report ONLY defects in your lens. ` +
      `Quote the offending code in failure_scenario. If nothing survives scrutiny, return an empty array.`,
      { label: `find:${lens.key}`, phase: 'Find', schema: FINDING_SCHEMA, effort: 'high' }
    ).then((r) => ({ lens: lens.key, findings: (r?.findings ?? []) })),
  // As each lens returns, verify its findings adversarially (no barrier across lenses).
  (lensResult) =>
    parallel(
      lensResult.findings.map((f) => () =>
        parallel(
          [0, 1, 2].map((i) => () =>
            agent(
              `Adversarially REFUTE this code-review finding. Default to refuted=true unless ` +
              `you can confirm the defect is real by reading the code.\n\n` +
              `FILE: ${f.file}:${f.line}\nCLAIM: ${f.summary}\nSCENARIO: ${f.failure_scenario}\n\n` +
              `Read ${ROOT}/${f.file} around line ${f.line}. Is the failure scenario actually reachable ` +
              `with the guards/validation/types present? If a guard, transaction, or caller already ` +
              `prevents it, refute. skeptic #${i}.`,
              { label: `verify:${f.file}:${f.line}#${i}`, phase: 'Verify', schema: VERDICT_SCHEMA, effort: 'medium' }
            )
          )
        ).then((votes) => {
          const refutes = votes.filter(Boolean).filter((v) => v.refuted).length
          return { ...f, lens: lensResult.lens, survives: refutes < 2, refutes }
        })
      )
    )
)

const survivors = perLens.flat().filter(Boolean).flat().filter((f) => f && f.survives)
log(`${survivors.length} findings survived adversarial verification`)

phase('Synthesize')
const synthesis = await agent(
  `Synthesize these verified server/ code-review findings into a single ranked report.\n\n` +
  `FINDINGS (JSON):\n${JSON.stringify(survivors, null, 2)}\n\n` +
  `Tasks: (1) dedup findings that are the same defect seen by two lenses; ` +
  `(2) drop anything matching the ALREADY-TRACKED list and instead note it under a ` +
  `"Cross-referenced (already tracked)" heading:\n${EXCLUSIONS}\n` +
  `(3) rank most-severe first (critical→low, CONFIRMED before PLAUSIBLE within a tier); ` +
  `(4) group into suggested remediation batches (e.g. "authz hardening", "transaction wrapping"). ` +
  `Output GitHub-flavored markdown: a ranked findings table, then one detail block per finding ` +
  `(file:line, quoted code, failure scenario, severity, confidence, fix sketch), then batches, ` +
  `then the cross-referenced list. Return the full markdown as your text.`,
  { label: 'synth', phase: 'Synthesize', effort: 'high' }
)

return { survivorCount: survivors.length, report: synthesis }
```

- [ ] **Step 3: Record the run handle**

From the Workflow tool result, write `runId` and `scriptPath` to `SCRATCH/workflow-run.txt`. Do NOT block on completion — proceed to Task 2 (inline work) while it runs in the background. You'll be notified when it finishes.

```bash
echo "runId=<wf_...>" > "$SCRATCH/workflow-run.txt"
echo "scriptPath=<...>" >> "$SCRATCH/workflow-run.txt"
```
Expected: file written; workflow is running in background.

---

## Task 2: Phase A — model the documented workflow

**Files:**
- Create: `SCRATCH/workflow-model.md`
- Read: the workflow-doc corpus (Step 1)

**Interfaces:**
- Produces: `SCRATCH/workflow-model.md` — a state/role/gate/artifact model of the workflow *as documented*. Consumed by Task 3 (drift cross-walk) and Task 4 (the walkthrough scenarios test this model).

- [ ] **Step 1: Read the process corpus**

Read in full:
- `docs/workflow/simplified-workflow.md`, `master-pipeline.md`, `mt-process.md`, `config-and-rerun-guide.md`, `editor-improvements-jan2026.md`
- `docs/editorial/pass1-linguistic.md`, `pass2-localization.md`, `terminology.md`
- `.claude/skills/editorial-pass1.md`, `localization.md`, `review-protocol.md`, `workflow-status.md`
- `docs/plans/2026-06-12-editorial-throughput-roadmap.md` (the MTPE amendment — this is the *current* process intent)
- `docs/audit/2026-05-10-editorial-workflow-audit.md` + `docs/plans/2026-05-10-editorial-workflow-redesign-plan.md`

- [ ] **Step 2: Write the documented-workflow model**

`SCRATCH/workflow-model.md` captures, from the docs alone:
- **States** an edit/segment/module moves through (e.g. MT-output → pending → approved/rejected/discuss → applied → published; localization pending → approved → applied).
- **Roles** and what each may do at each state (editor, head-editor, admin; self-approval policy).
- **Gates** — where human approval is required, where QA is supposed to run (terminology consistency, EN-residue, spellcheck, number-consistency), where four-eyes applies.
- **Artifacts** each step reads/writes (`02-mt-output/`, `03-faithful-translation/`, `tm/`, glossary, `04-localized-content/`, `05-publication/`).
- **The MTPE reframe:** every segment starts with an MT draft; Pass 1 is review-dedup, not from-scratch translation.
- Note any place the docs are internally inconsistent or silent (e.g. what "completed this week" means — May audit Open Question 7).

- [ ] **Step 3: Verify the model is grounded**

```bash
grep -c "§\|state\|gate\|role\|artifact" "$SCRATCH/workflow-model.md"
```
Expected: a structured doc with an explicit state list, role×state matrix, and gate list. Sanity-check: every stage in CLAUDE.md's "Status Updates" table (extraction…publication) appears in the model.

---

## Task 3: Phase B — docs ↔ code drift catalog

**Files:**
- Create: `SCRATCH/drift-catalog.md`
- Read: route/service files named by the model's gates + the model from Task 2

**Interfaces:**
- Consumes: `SCRATCH/workflow-model.md`.
- Produces: `SCRATCH/drift-catalog.md` — a two-column drift list (docs-ahead-of-code, code-ahead-of-docs) with `file:line` evidence. Consumed by Task 8's editorial report.

- [ ] **Step 1: Cross-walk each documented step against the implementation**

For each gate/state in the model, open the implementing code and confirm it matches. Concretely verify at least:
- **Pass 1 apply model** — CLAUDE.md says `loadModuleForEditing` reads `03-faithful-translation` as baseline once it exists, else `02-mt-output`; `applyApprovedEdits` rebuilds from current published + newly-approved. Confirm in `services/segmentEditorService.js`.
- **Four-eyes / self-approval** — docs say self-approval is permitted (policy, not enforced). Confirm approve endpoints in `routes/segment-editor.js` + `routes/localization-editor.js` and their role guards.
- **QA gates** — the throughput roadmap claims terminology consistency (`check-consistency`), EN-residue, spellcheck, number-consistency exist. Confirm each is *wired into a save/submit path*, not just present as an unreferenced service (`services/qaCheckService.js`, `concordanceService.js`, `termMiningService.js`, `greynirEngine.js`). This overlaps lens 6 but from the process side.
- **TM lifecycle** — docs say TM auto-regens on apply via `tmService`. Confirm the call site; confirm the design note that `tm/` is empty project-wide (deliverable not yet produced) still holds.
- **Enforcement toggles** — `enforce_assignments`, `enforce_localization_review` (migrations 034–035, `book_settings`). Confirm the toggles gate what the docs claim.

- [ ] **Step 2: Record drift both directions**

`SCRATCH/drift-catalog.md`, two sections:
- **Docs ahead of code** — a documented capability that isn't implemented / is wired but never called / behaves differently.
- **Code ahead of docs** — behavior in code the docs don't describe (a reviewer/editor would be surprised by).
Each row: claim, doc source, code `file:line`, verdict (match / drift-direction), one-line consequence for an editor.

- [ ] **Step 3: Verify coverage**

Confirm every gate in `workflow-model.md` has a corresponding row (match or drift) in `drift-catalog.md`. No documented gate left unverified.

---

## Task 4: Phase C — live server bring-up + persona walkthroughs

**Files:**
- Create: `SCRATCH/walkthrough-log.md`, screenshots under `SCRATCH/shots/`
- Create (temporary, driver): `SCRATCH/walk.spec.js` — a Playwright spec run against the live server
- Read: `server/e2e/helpers/auth.js`, `server/e2e/playwright.config.js`, existing specs for patterns

**Interfaces:**
- Consumes: `SCRATCH/workflow-model.md` (scenarios exercise its states).
- Produces: `SCRATCH/walkthrough-log.md` — per-persona narrative with friction points, each anchored to a screen/endpoint + screenshot. Consumed by Task 8's editorial report and Task 5's QA table.

- [ ] **Step 1: Bring up a throwaway live server**

```bash
cd /home/siggi/dev/repos/namsbokasafn-efni/server
lsof -ti:3456 | xargs -r kill
E2E_DB="$(pwd)/../pipeline-output/review-sessions.db"
rm -f "$E2E_DB" "$E2E_DB-wal" "$E2E_DB-shm"
SESSIONS_DB_PATH="$E2E_DB" node e2e/seed-fixture.js
SESSIONS_DB_PATH="$E2E_DB" JWT_SECRET=test-secret-for-e2e-not-production \
  RATE_LIMIT_MAX=10000000 PORT=3456 node index.js &
sleep 2
curl -s localhost:3456/api/health | head -c 400
```
Expected: `/api/health` returns `ok` with db/migrations/books/auth fields. Leave the server running (background) for the walkthrough; note the PID.

- [ ] **Step 2: Author a walkthrough driver spec**

Write `SCRATCH/walk.spec.js` using `loginAs(page, role)` from `server/e2e/helpers/auth.js`. It is a *driver*, not an assertion suite — it navigates each persona's path, screenshots each screen to `SCRATCH/shots/`, and dumps any non-2xx API response + browser console errors to stdout. Cover the fixture book `__e2e-fixture__` (chapter 1, module `m68664`) since that's what the seed registers. Structure the spec by persona (below). Run headed-off:

```bash
cd /home/siggi/dev/repos/namsbokasafn-efni/server
npx playwright test --config=e2e/playwright.config.js "$SCRATCH/walk.spec.js" \
  --reporter=list 2>&1 | tee "$SCRATCH/walk-run.txt"
```
(Set the config's `reuseExistingServer` path — the running server from Step 1 will be reused.)

- [ ] **Step 3: Editor persona — the Anna test, post-remediation**

Drive: login `editor` → `/` (what's my work? is "Today" honest?) → open module editor → exercise the MTPE loop: edit a segment, observe bracket-marker handling/overlay, term hints, concordance search, repetition/propagation surfacing → save (does it tell me state? do I know what happens next?) → look for/avoid the "submit module" gesture (the F2 trap; is direct-queue live or still flag-gated?). Record friction in `walkthrough-log.md` under "Editor".

- [ ] **Step 4: Head-editor persona — the review→apply→recover loop**

Drive: login `head-editor` → find pending work (dashboard queue vs `/editor?view=reviews`) → approve/reject/discuss a segment edit → apply ("Vista + Birta") → observe the rebuild affordance (`getApplyStatus.can_rebuild`) → edit-again on a published segment → open version history → perform a restore and confirm the round-trip. Record under "Head-editor".

- [ ] **Step 5: Admin persona — governance surfaces**

Drive: login `admin` → assignments dashboard, toggle `enforce_assignments`, confirm a now-unassigned editor path 403s (via API call as `editor`) → book settings incl. `enforce_localization_review` → terminology governance (mining queue → approve a term → see it in glossary → CSV export) → dashboard truthfulness: compare the headline tiles + `Þarfnast athygli` against the actual DB row counts. Record under "Admin".

- [ ] **Step 6: Cross-cutting scenarios**

Drive: (a) two editors on one segment — second save should 409; capture both editors' experience of the prompt. (b) Pass 2 with `enforce_localization_review` ON — a localized edit enters the review queue. (c) QA/spellcheck with the Greynir sidecar absent (as in prod) — confirm graceful degradation, not a hard error. Record under "Cross-cutting".

- [ ] **Step 7: Verify walkthrough completeness**

Confirm `walkthrough-log.md` has all four persona sections, each screen has a screenshot in `SCRATCH/shots/`, and every non-2xx/console error from `walk-run.txt` is either explained or flagged as a finding. Leave the server running for Task 5, then it will be torn down.

---

## Task 5: Phase D — manual QA §0–§5 absorption + teardown gate

**Files:**
- Create: `SCRATCH/qa-evidence.md`
- Read: `docs/plans/2026-06-10-qa-checklist.md`

**Interfaces:**
- Consumes: the running server from Task 4, `SCRATCH/walkthrough-log.md` (some QA items are already evidenced there).
- Produces: `SCRATCH/qa-evidence.md` — the §0–§5 checklist re-scored with live evidence. Consumed by Task 8's editorial report.

- [ ] **Step 1: Execute the objective QA items live**

Walk `docs/plans/2026-06-10-qa-checklist.md` §0–§5. For each row currently marked ◐/⏳/👁 that is *objectively checkable on a local server*, run it and record the result + evidence. Concretely include the curl-checkable ones the checklist itself flagged:

```bash
# §0.1b path-traversal track guard → expect 400
curl -s -o /dev/null -w "%{http_code}\n" \
  "localhost:3456/api/segment-editor/__e2e-fixture__/1/m68664/preview?track=../../../../etc/passwd" \
  -H "Cookie: auth_token=$(node -e "console.log(require('./e2e/helpers/auth.js').getTestToken('editor'))")"
# §0.1c bad moduleId → expect 400
curl -s -o /dev/null -w "%{http_code}\n" \
  "localhost:3456/api/segment-editor/__e2e-fixture__/1/..%2F..%2Fx/preview?track=faithful" \
  -H "Cookie: auth_token=$(node -e "console.log(require('./e2e/helpers/auth.js').getTestToken('editor'))")"
# §5a anon /admin → expect redirect to /login (not 200 admin HTML)
curl -s -o /dev/null -w "%{http_code} -> %{redirect_url}\n" localhost:3456/admin
```
Expected: `400`, `400`, `302 -> /login` (or equivalent). Record actual codes.

- [ ] **Step 2: Cover the cross-book authz items live**

Using minted tokens for `head-editor` (books include `__e2e-fixture__` but not `efnafraedi-2e`… adjust per the token's `books` array) exercise §0.3a–d and §1e/§3/§5b against real endpoints — the E2E suite already asserts these, so the goal is a live confirmation, not new coverage. Record ✅/❌ with the endpoint + code.

- [ ] **Step 3: Mark prod-only items explicitly**

Items needing real Entra OAuth, nginx headers, or the deploy path (e.g. §5c broken-migration boot behavior beyond what a local `node index.js` shows, real login-loop cookie behavior) → mark **prod-only — remains on the lead's pass**, with a one-line reason. Do not fake them.

- [ ] **Step 4: Write the QA evidence table**

`SCRATCH/qa-evidence.md`: the §0–§5 rows with columns `# | Check | Expected | Live result (this review) | Evidence`. Every row: pass / fail / prod-only.

- [ ] **Step 5: Teardown + hygiene gate (CRITICAL)**

```bash
cd /home/siggi/dev/repos/namsbokasafn-efni
lsof -ti:3456 | xargs -r kill
rm -f server/../pipeline-output/review-sessions.db*
git checkout -- books/__e2e-fixture__/            # revert any fixture writes from the walkthrough
git status --short                                # MUST be clean (ignore SCRATCH — it's outside the repo)
```
Expected: port free, throwaway DB removed, `git status` clean. **If the tree is dirty, stop and reconcile before continuing** (Phase-0 lesson: walkthrough writes must not leak into the review's commits).

---

## Task 6: Harvest the fan-out + hand-spot-check + Phase E benchmark

**Files:**
- Create: `SCRATCH/code-findings-raw.json`, `SCRATCH/practice-benchmark.md`
- Read: workflow journal/transcripts under the run's transcript dir

**Interfaces:**
- Consumes: the completed background workflow (`SCRATCH/workflow-run.txt`), plus all prior scratch artifacts.
- Produces: `SCRATCH/code-findings-raw.json` (the harvested ranked report) and `SCRATCH/practice-benchmark.md` (Phase E).

- [ ] **Step 1: Ops-gate the fan-out result**

When notified the workflow finished, before trusting it:
```bash
RUNID=$(grep runId "$SCRATCH/workflow-run.txt" | cut -d= -f2)
# find the transcript dir for the run, then:
TDIR="<session subagents/workflows/$RUNID dir>"
grep -l '"type":"fallback"' "$TDIR"/agent-*.jsonl | wc -l     # fallback count
```
Expected: `survivorCount` ≥ 0 with a real report; `agents_error` was 0 during the run. Server code shouldn't trip the `bio` classifier, so fallback count ≈ 0; if >2 finders fell back, label the code report "hybrid run (some agents Opus, cache-read billed)". If the result is empty AND errors/fallbacks are high, re-run the fan-out before trusting it (ops-lesson-3).

- [ ] **Step 2: Save the raw report and hand-spot-check the top findings**

Save the workflow's `report` markdown to `SCRATCH/code-findings-raw.json` (or `.md`). Then, for the **top 3–5 findings**, personally open the cited `file:line` and confirm the failure scenario reproduces by reading (not by re-running the finder). This is the RUN 1 discipline: the synthesis is a draft until the main session has verified the headline claims.

- [ ] **Step 3: Write the professional-practice benchmark (Phase E)**

Using the walkthrough log, drift catalog, and QA evidence, write `SCRATCH/practice-benchmark.md` — one verdict (sound / gap / risk) per dimension, each with the observation that grounds it:
- Review states & four-eyes integrity (incl. self-approval policy)
- TM lifecycle — is the human-verified corpus accumulating and reusable?
- Terminology governance loop — mining → approval → glossary → MT priming; consistency enforcement placement
- QA gates — terminology/number/EN-residue/spellcheck: where they sit, whether skippable
- Reviewer/editor throughput ergonomics — keyboard-first, batching, queue design, SLA visibility
- Traceability & audit trail — supersede chains, activity-log fidelity
- Rollback & recovery safety — version restore, rebuild, backup posture
- Onboarding load — what a new editor must be told vs what the system teaches

Constraint reminder: critique the process; keep the chemistry-teacher vocabulary boundary.

- [ ] **Step 4: Verify**

Confirm every Phase E dimension has a verdict + grounding observation, and the top code findings each carry a hand-check note.

---

## Task 7: Phase F — verify fan-out on both reports' factual claims

**Files:**
- Create: `SCRATCH/verify-notes.md`

**Interfaces:**
- Consumes: `SCRATCH/code-findings-raw.json` + the editorial draft claims (drift catalog, walkthrough, QA evidence).
- Produces: `SCRATCH/verify-notes.md` — per-claim CONFIRMED/REVISE verdicts feeding the final reports.

- [ ] **Step 1: Assemble the checkable factual claims**

List every *factual* (not judgment) claim destined for the two reports: each code finding's `file:line` + scenario; each drift-catalog row's `file:line`; each QA row's live result. Judgment verdicts (Phase E) are explicitly excluded — they stay the main session's, labeled as such.

- [ ] **Step 2: Launch a small verify fan-out**

Use `parallel()` (or a short Workflow) of ~5–8 `model:'fable'` (inherited) agents, `effort:'high'`, each taking a slice of claims and adversarially checking: open the file, confirm the line/scenario, return `{claim_id, verdict: 'CONFIRMED'|'REVISE', note}`. Refute-by-default on the code claims; for QA claims, re-run the exact curl/endpoint if cheap.

- [ ] **Step 3: Fold verdicts back**

Write `SCRATCH/verify-notes.md`. Any REVISE downgrades the claim to PLAUSIBLE or drops it, with the reason. This is the last gate before the reports are written.

- [ ] **Step 4: Verify**

Every factual claim has a verdict. Count CONFIRMED vs REVISE; if a large fraction REVISE, re-examine the finder methodology before writing the reports.

---

## Task 8: Write both reports + the joint summary

**Files:**
- Create: `docs/audit/2026-07-10-server-code-review.md`
- Create: `docs/audit/2026-07-10-editorial-workflow-review.md`
- Create: `docs/audit/2026-07-10-server-review-joint-summary.md`

**Interfaces:**
- Consumes: every SCRATCH artifact + verify verdicts.
- Produces: the three committed deliverables.

- [ ] **Step 1: Write the code review report**

`docs/audit/2026-07-10-server-code-review.md`: header (date, scope, method = 6-lens Fable fan-out + verification, coverage statement naming which files each lens touched), the ranked findings table, one detail block per CONFIRMED/PLAUSIBLE finding (file:line, quoted code, failure scenario, severity, confidence, fix sketch), suggested remediation batches, and a "Cross-referenced (already tracked)" section. State the run's model mix (pure Fable vs hybrid) per the ops gate.

- [ ] **Step 2: Write the editorial-workflow review report**

`docs/audit/2026-07-10-editorial-workflow-review.md`: header (lens = seasoned translator/editor, audience boundary noted); §1 the documented-workflow model (from Task 2); §2 drift catalog (Task 3); §3 live walkthrough findings per persona with screenshot references (Task 4); §4 the QA §0–§5 evidence table (Task 5); §5 professional-practice benchmark with per-dimension verdicts (Task 6); §6 ranked recommendations. Label judgment vs fact throughout.

- [ ] **Step 3: Write the joint executive summary**

`docs/audit/2026-07-10-server-review-joint-summary.md`: a one-screen orientation for the lead — the top cross-report themes, a proposed set of consolidated remediation batches (analogous to Phase-0 grouping) sized for solo triage, and an explicit "what stays on the lead's manual pass (prod-only)" list. This is the triage entry point.

- [ ] **Step 4: Self-review the reports**

Re-read all three with fresh eyes: no placeholder/TBD; every finding has file:line + scenario + fix sketch; no already-tracked item re-reported as new; rankings consistent; judgment claims labeled. Fix inline.

- [ ] **Step 5: Commit on a docs branch**

```bash
cd /home/siggi/dev/repos/namsbokasafn-efni
git checkout -b docs/server-editor-review
git add docs/audit/2026-07-10-server-code-review.md \
        docs/audit/2026-07-10-editorial-workflow-review.md \
        docs/audit/2026-07-10-server-review-joint-summary.md
git commit -m "docs(audit): server/editor two-perspective review — code + workflow findings"
```
Expected: three files committed on the branch.

---

## Task 9: Register/memory updates + PR

**Files:**
- Modify: `docs/plans/2026-06-28-pipeline-architecture-implementation-plan.md` (register)
- Create: memory `server-editor-review-2026-07.md`; Modify: memory `MEMORY.md`

**Interfaces:**
- Consumes: the committed reports + any out-of-scope finds noted during review.
- Produces: register rows, a memory topic file, and a PR.

- [ ] **Step 1: Log out-of-scope finds to the register**

Append any non-server/editor discoveries (e.g. a tools/ or vefur seam noticed in passing) to the register in `docs/plans/2026-06-28-pipeline-architecture-implementation-plan.md`, per the standing feedback rule.

- [ ] **Step 2: Write the memory topic file**

Create `/home/siggi/.claude/projects/-home-siggi-dev-repos-namsbokasafn-efni/memory/server-editor-review-2026-07.md` (frontmatter: type project): what the two reviews covered, where the reports live, the top themes, the model mix of the fan-out, and the RESUME POINT (lead triages the joint summary → consolidated remediation). Add a one-line pointer to `MEMORY.md` under Active Topics.

- [ ] **Step 3: Push and open the PR**

```bash
cd /home/siggi/dev/repos/namsbokasafn-efni
git add docs/plans/2026-06-28-pipeline-architecture-implementation-plan.md
git commit -m "docs(register): log out-of-scope finds from server/editor review"
git push -u origin docs/server-editor-review
gh pr create --title "Server/editor two-perspective review — findings" \
  --body "Code review (6-lens Fable fan-out) + editorial-workflow review (live walkthrough + QA §0–§5). Findings-first; no code changes. Joint summary proposes remediation batches for triage."
```
Expected: PR opened. Memory files are outside the repo — not part of the PR.

- [ ] **Step 4: Final verification**

Confirm: three reports on the branch + PR open; register updated; memory topic + pointer written; `git status` clean; no source files changed anywhere under `server/` or `books/`.

---

## Self-Review (plan vs spec)

**Spec coverage check:**
- Design §2 decisions (findings-first / live+QA / hybrid) → Global Constraints + Tasks 1 (fan-out), 4–5 (live+QA). ✅
- Design §3 scope (all server layers incl. client JS/views/migrations/sidecar-shallow/renderService seam) → Task 0 inventory + Task 1 lenses (lens 5 covers client JS/views; lens 2 covers migrations; the seam is named in §3 and falls under lens 3/4). ✅
- Design §4 ground rules → Global Constraints verbatim. ✅
- Design §5 six lenses + verification + ops gates → Task 1 (lenses/script) + Task 6 (ops gate/spot-check). ✅
- Design §6 six phases A–F → Tasks 2, 3, 4, 5, 6(E), 7(F). ✅
- Design §7 four deliverables → Task 8 (3 reports) + Task 9 (register/memory). ✅
- Design §8 sequencing (fan-out background while inline runs) → Task 1 Step 3 + task order. ✅
- Design §9 success criteria → Task 9 Step 4 + per-task verify steps. ✅
- Design §10 risks → Global Constraints (hygiene) + Task 5 teardown gate + Task 6 fallback gate. ✅

**Placeholder scan:** The `<<PASTE ...>>` / `<<lens N brief>>` markers in Task 1's script are *intentional author-time substitutions* (the lens briefs are written in full in Task 1 Step 1; the inventory/exclusions come from Task 0's committed-to-scratch files). They are instructions, not unfilled gaps — every referenced piece of content exists in the plan or a prior task's output. No true placeholders remain.

**Type consistency:** `FINDING_SCHEMA`/`VERDICT_SCHEMA` field names are consistent between finder, skeptic, and synth stages; `survivors`/`survives`/`refutes` names match across the script; scratch filenames referenced across tasks match the File/Artifact Map.

**Scope check:** Single coherent review campaign; not decomposable into independent subsystems (the two reviews share the exclusion list, the live server, and the joint summary). One plan is correct.
