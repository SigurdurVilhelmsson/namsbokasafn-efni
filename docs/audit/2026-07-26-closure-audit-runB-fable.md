> **⚠️ This is Run B — the blind Fable 5 replication, preserved EXACTLY as its harness wrote it.**
> It has had **no** correction pass. Where it disagrees with the Opus run, adjudication settled six
> disputes **3–3**; see [`2026-07-26-closure-audit-model-comparison.md`](2026-07-26-closure-audit-model-comparison.md).
> Known uncorrected defects its own critic identified: the `~13` counted-only figure is wrong (true
> value 11), the two `UNDETERMINED` cross-walk claims are wrongly folded into it, and the `viewer`-role
> half of the contributor drift bullet has no row. Left in place deliberately — this file is evidence,
> not a deliverable.

---

# Closure Audit — 2026-07-11 review findings × current `main`

**Date:** 2026-07-26 · **Baseline:** `main` `9107ed1d` (audit branch `audit/closure-audit-2026-07-26`)
**Method:** read-only workflow fan-out grouped by file/subsystem, findings re-located by symbol and behavior (never line number); every `CLOSED` disposition attacked by 3 adversarial skeptics under refute-by-default (kill on ≥2); every `OPEN-UNTRACKED` re-checked against all four register sources at synthesis.
**Purpose:** the finding-level disposition ledger for the 2026-07-11 two-perspective review (37 code findings + 4 refutations + the editorial-workflow report + the 9-batch joint triage). It answers *"are we on target?"* with evidence, and it is the exclusion list a future diff-scoped review consumes (spec: `docs/superpowers/specs/2026-07-26-closure-audit-design.md`).

---

## 1. Headline

**Yes, we are on target for everything that was ranked High or Medium — and the register did lose things, but only at the lowest severity tier.** Every High and Medium code finding is `CLOSED` on `main` with the fixing code quoted and attributed; joint batches 1, 2, 4, 5, 6 and 8 are 100% closed, batch 7 is 11/12 (the last item deliberately decision-gated). What is NOT closed is concentrated in exactly two places: **joint batch 3 (docs authority triage) and batch 9 (dependency/dead-code hygiene) are 0% closed** — both parked whole in the P3 tail as items 23 and 22 — and **3 low-tier editorial findings fell out of the registers entirely** (resurrect list, §3). The single most actionable residue is not untracked at all: finding **#9 (undeclared `glob`)** is tracked, but its original *"fix first — can fail a clean install anytime"* urgency annotation evaporated in summarization, precisely the failure mode this audit was built to catch.

### Disposition counts (116 ledger rows)

| Disposition | Count |
|---|---|
| CLOSED | **62** |
| CLOSED-BY-REFUTATION | **4** |
| OPEN-TRACKED | **47** |
| OPEN-UNTRACKED | **3** |
| SUPERSEDED | 0 |
| UNVERIFIABLE | 0 |
| UNRECOVERABLE (counted-only drift rows, §6 — collective, no individual rows possible) | **~13** |

### OPEN-UNTRACKED, up front (full detail in §3)

None is High or Medium. All three are from the editorial review's lowest tier (drift-catalog / walkthrough nuance):

1. **ed-drift-e** — publication status has a dual model (stored nested `publicationStatus` schema + independent filesystem-scan read path) that no document describes (CODE-AHEAD drift).
2. **ed-drift-d** — the 2026-05-10 audit's Open Question 1 (admin override of head-editor decisions) is resolved architecturally by the admin bypass in `requireHeadEditorFor`, but no document records the resolution (CODE-AHEAD drift).
3. **ed-walk-1** — the my-work zero-task greeting (`'Engin verkefni í dag – vel gert!'`) cannot distinguish never-assigned from cleared-a-real-queue (minor wording nuance).

### Calibration check — PASSED

The four hand-verified known-answer items resolve exactly as required: **#1 CLOSED** (`requireHeadEditorFor` on pipeline inject/render/run, PR #268) · **#9 OPEN**-TRACKED (`glob` only in `server/package.json` `overrides`, which does not install it; `require('glob')` live at `terminologyService.js:1876`) · **#35 OPEN**-TRACKED (all five dead env vars still in `server/.env.example`, zero readers) · **#36 OPEN**-TRACKED (`decisions.json` + zero-byte `workflow.db` still committed, still boot-parsed and script-excluded). The fan-out agrees with the hand-verified sample on all four.

### Contradictions reconciled at synthesis

- **ed-drift-f vs ed-walk-5** — two verifiers dispositioned the *same* claim (terminology report documented as firing "on submit" but actually firing on module open) differently: OPEN-UNTRACKED vs OPEN-TRACKED. Reconciled to **OPEN-TRACKED** under item 23 · Batch 3: the joint summary defines Batch 3 as drawing from the *entire* "Editorial §2 drift catalog", which contains this bullet, and the audit's standing rule prefers TRACKED when coverage is arguable. **Caveat carried forward:** the coverage is transitive — the claim is not named in any register scope line, so whoever executes item 23 must work from the full §2 catalog, not the batch one-liner (the same caveat applies to ed-drift-b, ed-drift-c's README half, ed-dim-docs-b/c and ed-dr3-1).
- **QA-table PASS rows marked OPEN-TRACKED** — not a contradiction, but a semantic the lead should not misread: for §4 QA rows, `CLOSED` means *machine-pinned by an automated test on main*; `OPEN-TRACKED` means *the row passed live on 2026-07-11 but its durable sign-off (A4 walk, PR-1b E2E tier, or prod-only case) is still outstanding*. An OPEN QA row is not a regression claim.

### Coverage honesty

All 29 fan-out groups returned substantive results; no group came back empty or thin. 116 rows cover: 37 code findings (finding 17 split into 17a/17b for its two call sites), 4 refutations, 10 narrated drift claims (several split into sub-claims), 11 walkthrough items, 32 QA rows, 8 practice dimensions, 6 recommendations. The joint summary is covered structurally via the batch roll-up (§4) rather than duplicate rows. Two minor honesty notes: ed-qa-1e survived 2 skeptics rather than 3 (one skeptic did not report; the two that did both failed to refute); and the ~13 counted-only drift rows are a permanent evidence gap (§6), not covered rows.

---

## 2. Ledger

Original severity language is the review's own. Line numbers are **current as of 2026-07-26 on `9107ed1d`**. `[R]` = register item cited in the last column. Full verifier evidence (quoted code, commits, PR numbers) is preserved in the fan-out result set; this table is the terse authoritative index — commits named here were verified on `main`, and where attribution was not determinable the row says so.

### 2.1 `docs/audit/2026-07-11-server-code-review.md` — 37 ranked findings

| id | orig. severity | claim (compressed) | state on main | evidence (current) | disposition | register |
|---|---|---|---|---|---|---|
| code-1 | High, CONFIRMED | pipeline inject/render/run not book-scoped | Fixed | `pipeline.js:69,120,170` `requireHeadEditorFor((req) => req.body?.book)` — commit `366206b5`, PR #268 | **CLOSED** ✔calibration | — |
| code-2 | High, CONFIRMED | section approve/assign/request-changes + elevated status bare role check | Fixed | `sections.js:92,175,429,501` scoped guard; `:303-313` `isOwningHeadEditor` — `fc6b8b67`, PR #268 | **CLOSED** | — |
| code-3 | Medium (↓High), CONFIRMED | loc approve marks DB approved before file write | Fixed — write-first inversion | `localizationReviewService.js:237-293` file write precedes `UPDATE … status='approved'` — `109f3f0e`, PR #298 (item 12 F3) | **CLOSED** | — |
| code-4 | Medium, CONFIRMED | unscoped section upload route writes into protected tiers | Route deleted (review's own option 2) | no `upload`/`multer` in `sections.js` — `69619720`, PR #268 | **CLOSED** | — |
| code-5 | Medium, CONFIRMED | pipeline jobs carry no book; running-check collides cross-book | Fixed | `pipelineService.js:383-396` job has `book`; `:469-481` `hasRunningJob(book, chapter, type)`; 8 call sites pass book — `ceb53bb8`, PR #298 | **CLOSED** | (read-only jobs leak = distinct I12-R1/issue #328, tracked) |
| code-6 | Medium, CONFIRMED | Vista+Birta applies edits before running-job check | Fixed — guard FIRST | `routes/segment-editor.js:1304-1325` hasRunningJob + capacity 409 before `applyApprovedEdits` — `be98d5de`, PR #298 | **CLOSED** | — |
| code-7 | Medium, CONFIRMED | loc pending-edit upsert unscoped by editor → silent overwrite | Fixed | `localizationReviewService.js:97-103` `AND editor_id = ?`; PENDING_EXISTS + supersede at approve — `a2230ac5`, PR #299 | **CLOSED** | — |
| code-8 | Medium, CONFIRMED | successful save never cancels queued failed-save retry | Fixed | `saveRetry.js:196` success → `cancelPending(key)`; qid identity checks `:118-123,:133-141` — `e73f164d` et al., PR #299 | **CLOSED** | — |
| code-9 | Medium, CONFIRMED | `glob` undeclared; `require('glob')` resolves by accident | **Still present** | `terminologyService.js:1876` `require('glob')` (outside try); `server/package.json:15` glob ONLY in `overrides`; server lockfile has zero glob; resolves via ROOT tree (@mathjax/src→rimraf→glob) | **OPEN-TRACKED** ✔calibration | item 22 · Batch 9 (both registers) — **urgency note lost**, see §3 |
| code-10 | Medium, CONFIRMED | review-tab picker calls nonexistent `GET /api/sections/:book/:ch` | Still present | `localization-editor.js:1767` two-segment fetch vs `sections.js:53` single `GET /:sectionId` | **OPEN-TRACKED** | C5 · B1-F1 + I16-R1 (decision-gated keep-vs-retire; deep-link path works meanwhile) |
| code-11 | Medium, CONFIRMED | status.html reads stage shape API doesn't send → badges always incomplete | Fixed | `status.html:643-667` reads `data.stages` array; pinned `viewRouteContracts.test.js:51-58` — `8047b431`, PR #303 | **CLOSED** | — |
| code-12 | Medium, CONFIRMED | chapter activity panel wrong field names ×2 + dead chapter filter | Fixed, all three sub-claims | `books.html:2805-2828` real fields, deduped renderer; `activity.js:25-32` + `activityLog.js:132` server-side filter — `32878c35`+`be375496`, PR #303 | **CLOSED** | — |
| code-13 | Medium, CONFIRMED | term-lookup reads `bookId` client never sends, coerced to number | Fixed | `routes/segment-editor.js:101,108` reads `bookSlug`, passes through — `6948668f`, PR #303 | **CLOSED** | — |
| code-14 | Medium, CONFIRMED | 409 `requiresConfirmation` has no client handler, no error fields | Fixed both halves | `segment-editor.js:1960-1991` confirm-and-retry; `pipeline.js:87-94` error/message/warning fields — `f7fe8ba0`, PR #270 | **CLOSED** | — |
| code-15 | Low (↓Med), CONFIRMED | same-second approvals picked nondeterministically; preview/apply disagree | Fixed — shared comparator | `server/lib/editRecency.js:20-27` created_at + id tie-break; used by apply `:966` AND preview `:271` — item 13 commits `3bd2a226`/`70f97c51`/`7cb7cc8e` | **CLOSED** | — |
| code-16 | Low (↓Med), CONFIRMED | restore doesn't reindex concordance / regen TM | Fixed | `contentVersionService.js:302-312` scheduleTmRegen + indexModule post-restore — `809566d7`, PR #298 | **CLOSED** | (test gap I15-R6 register-noted) |
| code-17a | Low, CONFIRMED | segmentParser 'appendices' vs −1 → zero segment counts | Fixed | `segmentParser.js:430-435` normalizeChapter+chapterDir (shared `chapterLabel.js`); loud TypeError on garbage — `d631d612`, PR #300 | **CLOSED** | — |
| code-17b | Low, CONFIRMED | concordance backfill same mismatch + divergent stored labels | Fixed, all three sub-claims | `concordanceService.js:97-99,111,174-180` boundary conversion, canonical `'-1'` label — `a8d9aa64`, PR #300 | **CLOSED** | — |
| code-18 | Low, CONFIRMED | progress double-counts applied⊂approved, two sites | Fixed twice over | `f3450ed9` removed summation both sites; item 20b DISTINCT-count shared helper `segmentEditorService.js:1368`/`status.js:953`; `progressDoubleCount.test.js` | **CLOSED** | — |
| code-19 | Low, CONFIRMED | snapshots skip empty-content segments → restore not reversible | Fixed | `contentVersionService.js:114-131` every segment inserted, empty string included; nullish fails loud — `cae59e8a`, PR #298 | **CLOSED** | (I12-M6 test-hygiene minor register-noted) |
| code-20 | Low, CONFIRMED | feedbackService opens prod DB at module load | Fixed — lazy + `_setTestDb` | `feedbackService.js:74-91,178-181` — `12dcdb7c`, PR #271 | **CLOSED** | — |
| code-21 | Low, CONFIRMED | six audit-log writes in bare `catch {}` | Fixed structurally | `activityLog.js:154-205` never-throw contract, internal `logger.error('Activity log write failed')`; zero bare catches remain — `e2194bb1`, PR #271 | **CLOSED** | — |
| code-22 | Low, CONFIRMED | admin book list fabricates zeros on progress failure, silently | Fixed both halves | `admin.js:409-413` log.error + `editorialProgressUnavailable`; `books.html:1663-1665` 'Framvinda ótiltæk' — `fd7360b3`, PR #271 | **CLOSED** | — |
| code-23 | Low, CONFIRMED | pipeline route rejects appendices (−1); CLI gets literal '-1' | Fixed both halves | `pipeline.js:43-44` normalizeChapter accepts −1; `pipelineService.js:202,240` `cliChapterArg` → `'appendices'`; `parseArgs.js:65` parses it — `9e38df15`, PR #300 | **CLOSED** | (publish write-path residue = C1 PR-2/C1d, distinct; `tm.js` export rejection = logged C1a follow-up) |
| code-24 | Low, CONFIRMED | conflict error shows `data.error` before `data.message` | Fixed | `saveRetry.js:235` `data.message \|\| data.error \|\| …`; pinned `clientMessageContracts.test.js:16-20` — `f7fe8ba0`/`94ac094e`, PR #270 (re-verified closed by item 13) | **CLOSED** | — |
| code-25 | Low, CONFIRMED | dueDate plain string, overdue count never sent | Closed by DELETION (lead decision) | dormant branch removed, absence-pinned `viewRouteContracts.test.js:171-187` — `172ff5e5`, PR #304 | **CLOSED** | (successor feature = I16-R2; cleanup residue I16-R13) |
| code-26 | Low, CONFIRMED (icon half refuted 2nd pass) | personal activity reads snake_case field → blank timestamps | Fixed | `my-work.html:1480` `formatTimeAgo(a.createdAt)` matching `activityLog.js:309` — `7ff20d63`, PR #303 | **CLOSED** | — |
| code-27 | Low, CONFIRMED | timeline reads fields server never sends → 'Invalid Date' | Fixed | `status.html:708-711` uses server `timeAgo`; pinned `viewRouteContracts.test.js:68-75` — `0ce73b45`, PR #303 | **CLOSED** | — |
| code-28 | Low, CONFIRMED | overdueCount hardcoded 0, never updated | Closed by removal (recorded lead decision 'F28 REMOVE') | no `overdueCount` in `status.js`/`my-work.html`, absence-pinned `viewRouteContracts.test.js:144-153` — `ab64c471`, PR #304 | **CLOSED** | — |
| code-29 | Low, CONFIRMED | blocked-issues banner: dead field + retired /issues link | Closed by removal | grep zero; absence-pinned `:157-167` (live admin stat distinguished and kept) — `b381eb62`, PR #304 | **CLOSED** | (retarget weakness = I16-R11, distinct) |
| code-30 | Low, CONFIRMED (dormant) | assignment badge renders literal 'undefined' | Closed by removing the dormant branch (review's own alternative) | grep zero (`typeLabel`/`getDueDateText`/`STAGE_LABELS`); pinned `:171-187` — `172ff5e5`, PR #304 | **CLOSED** | (revival path registered I16-R2) |
| code-31 | Low, CONFIRMED | admin feed icon ternary backwards + class-as-color | Fixed both halves | `my-work.html:1712-1713` `activity.icon \|\| '●'`, color as class; CSS `:717-719` — `fd69dde0`, PR #303 | **CLOSED** | — |
| code-32 | Low, CONFIRMED | hardcoded Icelandic strings bypass ui-strings.js (4 categories) | All four still present (drifted lines) | `segment-editor.js:2161` rebuild, `:2070/:2091` unicode-escaped badges, `:1419` conflict fallback, `:2322-2403` version-history dialog | **OPEN-TRACKED** | item 22 · Batch 9 |
| code-33 | Low, CONFIRMED | 4 dead notification fns + 4 type constants, zero callers | Still present | `notifications.js:360,393,432,461`, exports `:829-832`, constants `:35-38`; repo-wide grep = no caller | **OPEN-TRACKED** | item 22 · Batch 9 |
| code-34 | Low, CONFIRMED | analytics trackingMiddleware + log helpers built but never wired | Still present | `analyticsService.js:283` defined, `:332` exported, zero mounts anywhere | **OPEN-TRACKED** | item 22 · Batch 9 (file touched by PR #271 lazy-open — different finding) |
| code-35 | Low, CONFIRMED | dead env vars in `.env.example` (GitHub-PR-sync + Matecat) | Still present — all five unread | `.env.example:29-31,:37-38`; repo grep for readers = zero; last touch pre-review | **OPEN-TRACKED** ✔calibration | item 22 · Batch 9 |
| code-36 | Low, CONFIRMED | stale `decisions.json` + zero-byte `workflow.db` committed, boot-parsed, script-excluded | Still present, every element | git-tracked; `bookDataLoader.js:17-22` parses+discards; `validate-pipeline-consistency.js:37,226` name-excludes; `architecture.md:377` stale ref | **OPEN-TRACKED** ✔calibration | item 22 · Batch 9 |
| code-37 | Low (↓Med), PLAUSIBLE (↓CONF) | DB→status.json fallback logs nothing | Fixed — the exact one-line warn prescribed | `status.js:76-84` `log.warn({err,bookSlug,chapterNum}, 'Pipeline status DB read failed; serving cached status.json')` — `0912b32f`, PR #271 | **CLOSED** | — |

### 2.2 Code review — the four second-pass refutations (re-confirmed to still hold)

| id | original claim | refutation status on main | evidence | disposition |
|---|---|---|---|---|
| code-ref-1 | false `complete:true` on refused stage transition (`publicationService`) | Holds: catch logs `log.error(…'Pipeline status transition failed')`; `complete:true` only inside `job.status === 'completed'` guard | `publicationService.js:233-258` | **CLOSED-BY-REFUTATION** |
| code-ref-2 | chapter import reports success though DB registration failed (`books.js`) | Holds: `log.error` on the catch; files already on disk via `renameSync` before registration; retryable | `books.js:625-651` | **CLOSED-BY-REFUTATION** |
| code-ref-3 | faithful file overwritten inside DB transaction → corrupt-on-disk risk | Holds: timestamped `.bak` + atomic tmp+rename + in-transaction post-write verification with auto-retry semantics | `segmentParser.js:196-208`; `segmentEditorService.js:1028-1090` | **CLOSED-BY-REFUTATION** |
| code-ref-4 | pre-apply snapshot failure swallowed silently | Holds: `log.error(…'Content snapshot failed (non-fatal, continuing apply)')`; design deliberate; since strengthened (runs on apply's own connection) | `segmentEditorService.js:1014-1025` | **CLOSED-BY-REFUTATION** |

### 2.3 `docs/audit/2026-07-11-editorial-workflow-review.md` §2 — narrated drift catalog

| id | orig. class | claim (compressed) | state on main | evidence (current) | disposition | register |
|---|---|---|---|---|---|---|
| ed-drift1-a | headline drift 1 | `dashboardReadModel` completely undocumented in CLAUDE.md/README | Still true — grep exit 1 | service live at `dashboardReadModel.js:6`, consumed `status.js:278`, `my-work.js:265` | **OPEN-TRACKED** | item 23 · Batch 3 |
| ed-drift1-b | headline drift 1 | `ENABLE_DIRECT_QUEUE` exists only in planning docs, never built | Still true — repo grep hits only 4 docs | n/a (absence is the finding) | **OPEN-TRACKED** | item 23 · Batch 3 + A5/L7 |
| ed-drift1-c | headline drift 1 / rec 4 | Submit button live, unconditional, feeds only narrower SLA queue | Still true | `segment-editor.html:1402`; `segment-editor.js:1545` ungated POST …/submit | **OPEN-TRACKED** | item 23 · Batch 3, decision-gated on **L7** |
| ed-dr2-update-status | headline drift 2 | CLAUDE.md documents nonexistent `npm run update-status` | Still true (narrowed: now only the Status Updates section, not the Commands table) | CLAUDE.md:266; `package.json:7-23` no script; implementer in `scripts/archived/` | **OPEN-TRACKED** | item 23 · Batch 3 (named in joint priority #3) |
| ed-dr2-tmcreated-orphan | headline drift 2 (tail) | `tmCreated` stage orphaned — nothing advances it | Still true; sole nominal promoter checks a legacy per-section TMX layout `generate-tm.js` never produces | `pipelineService.js` advance sites (none tmCreated); `bookRegistration.js:1043` dead scan rule vs `tm-export.cjs:467-469` per-book path; CLAUDE.md:275 still documents stage as live | **OPEN-TRACKED** (by citation only — 'tmCreated' named in no register; code half exceeds a docs-only triage, needs scoping when item 23 is picked up) | item 23 · Batch 3 |
| ed-dr3-1 | headline drift 3 | roadmap's "tm/ is empty in every book" stale (chemistry has a real 3-TU TMX) | Still uncorrected verbatim | `2026-06-12-editorial-throughput-roadmap.md:18`; on-disk state re-verified (3 `<tu>`; other books no tm/) — CLAUDE.md:450 repeats the stale line | **OPEN-TRACKED** | item 23 · Batch 3 (drift-catalog granularity — not named in scope line) |
| ed-dr3-2 | MATCH (positive) | tmService scheduleTmRegen mechanism matches docs exactly | Re-verified accurate (debounce 5000, spawn generate-tm, fired from apply) | `tmService.js:21,80,32`; `segmentEditorService.js:1127-1129` | **CLOSED** (MATCH re-confirmed; nothing to fix) | — |
| ed-dim-docs-a | DOCS-AHEAD / rec 1 | master-pipeline.md self-declares authoritative, describes retired pipeline | Still true, file untouched since review | `master-pipeline.md:3,26,62-63,129`; cited tools only in `tools/archived/` | **OPEN-TRACKED** | item 23 · Batch 3 (named explicitly) |
| ed-dim-docs-b | DOCS-AHEAD | mt-process.md documents retired manual malstadur.is workflow as current | Still true, untouched | `mt-process.md:3,73,82,132` | **OPEN-TRACKED** | item 23 · Batch 3 (transitive — flag to executor) |
| ed-dim-docs-c | DOCS-AHEAD | auto-loaded workflow-status skill teaches retired pipeline | Still true, untouched | `.claude/skills/workflow-status.md:13-16,41-44` | **OPEN-TRACKED** | item 23 · Batch 3 (transitive — flag to executor) |
| ed-dim-docs-d | DOCS-AHEAD, "most consequential for onboarding" | auto-triggering review-protocol skill teaches retired files.json/Word model | Still true, untouched | `.claude/skills/review-protocol.md:19-20,37,43-51,100` | **OPEN-TRACKED** | item 23 · Batch 3 (named explicitly) |
| ed-drift-a | DOCS-AHEAD | terminology.md calls stale CSV "the authoritative source"; api-translate reads only glossary-unified.json | Still true both halves | `terminology.md:220`; `api-translate.js:623-624` | **OPEN-TRACKED** | item 23 · Batch 3 (named verbatim: "dead-CSV claim") |
| ed-drift-b | DOCS-AHEAD | 04-localization/ README describes two-stage promote workflow no code references | Still true; zero code refs to `04-localization` | `books/efnafraedi-2e/04-localization/README.md:32`; `localizationReviewService.js:203` writes direct | **OPEN-TRACKED** | item 23 · Batch 3 (weak/transitive — file not named; also CLAUDE.md:177 same family) |
| ed-drift-c | DOCS-AHEAD | retired 'contributor' role still documented (README 5-role line + master-pipeline actor) | Still true both halves | `README.md:164`; `master-pipeline.md:436`; migration 023 exists | **OPEN-TRACKED** | item 23 · Batch 3 (partial — README half transitive) |
| ed-drift-d | CODE-AHEAD | admin-override open question resolved in code, resolution never documented | Still true — 2026-05-10 audit §11 unannotated; register grep finds nothing | `requireRole.js:~119-121` admin bypass; `2026-05-10-editorial-workflow-audit.md:277` | **OPEN-UNTRACKED** → §3 | — |
| ed-drift-e | CODE-AHEAD | dual publication-status model (nested schema + filesystem scan) undocumented | Still true — both artifacts persist, no doc, no register item | `chapter-status.schema.json:134`; `publicationService.js:308-330` | **OPEN-UNTRACKED** → §3 | — |
| ed-drift-f | DRIFT (minor) | terminology report documented 'on submit', fires on module open | Still true | roadmap 3.2 vs `segment-editor.js:421-428` | **OPEN-TRACKED** (reconciled — see §1 contradictions; same claim as ed-walk-5) | item 23 · Batch 3 (transitive via §2 catalog) |

### 2.4 Editorial review §3 — live walkthrough

| id | orig. severity | claim (compressed) | state on main | evidence (current) | disposition | register |
|---|---|---|---|---|---|---|
| ed-walk-1 | minor | zero-task greeting can't distinguish never-assigned vs cleared | Still present | `my-work.html:1128` `'Engin verkefni í dag – vel gert!'` unconditional on totalTasks===0 | **OPEN-UNTRACKED** → §3 | — |
| ed-walk-2 | medium (mental-model) | Submit button live/unconditional, gating flag never built | Still present (deliberately parked) | `segment-editor.html:1402`; `segment-editor.js:1545` | **OPEN-TRACKED** | item 23 · Batch 3 + A5/L7 |
| ed-walk-3 | headline drift | module_reviews queue vs dashboardReadModel visibility = two divergent systems | Unchanged by design pending L7 | `segmentEditorService.js:659` submit-gated query; `dashboardReadModel.js:210` | **OPEN-TRACKED** | item 23/L7 (+ MTA-R2 design note) |
| ed-walk-4 | **high for this report** (live-reproduced) | discuss/rejected have no exit; raw `UNIQUE constraint failed` via alert() | Fixed both halves | migration 039 partial unique index (pending only); supersede-on-save `segmentEditorService.js:138-142`; `returnEditToPending` route `:838-843` — PR #270 | **CLOSED** | — |
| ed-walk-5 | minor (docs drift) | terminology report 'on submit' vs on-open | Behavior unchanged (judged better); doc fix owed | `segment-editor.js:428` | **OPEN-TRACKED** | item 23 · Batch 3 (= ed-drift-f, reconciled) |
| ed-walk-6 | medium (MT-priming gap) | glossary-unified.json export is CLI/cron-only, no in-repo wiring | Still true — grep: script only, no route/cron/workflow ref | `server/scripts/export-terminology.js:56`; `terminologyService.js:1513` | **OPEN-TRACKED** | CLAUDE.md 2026-07-26 glossary blocker (a) + MEMORY ▶NEXT [CODE] |
| ed-walk-7 | narrow, non-exploitable | enforcement-ON let a row-less identity through (`if (dbUser)` fall-through) | Fixed — denies under enforcement, legacy fail-open kept deliberately | `userService.js:610-615`; `requireRole.js:274-296` — PR #271 (Batch 4 D7) | **CLOSED** | — |
| ed-walk-8 | nuance | pre-write snapshot semantics ambiguous in Saga útgáfa modal | Fixed — explicit caption in BOTH editors | `segment-editor.html:1605`; `localization-editor.html:2065` — I12-R4 via item 15, PR #301 | **CLOSED** | — |
| ed-walk-9 | low (fixture-only) | underscore-slug TM regen silently WARN-skips; success:true unqualified | Trigger unchanged; the observability channel is registered | `parseArgs.js:23` pattern; `tmService.js:56-60` warn-only | **OPEN-TRACKED** | C8 · I21-R2 (identical warn-only path; underscore trigger itself not itemized, remains fixture-only as scoped) |
| ed-walk-10 | low (audit-trail) | apply snapshot lacks applied_by attribution | Fixed | `contentVersionService.js:108` column; appliedBy threaded from all 3 route sites — `6e974844` (B4-F5) | **CLOSED** | — |
| ed-walk-11 | n/a (positive confirmations) | all §3 rows asserting correct behavior | No defect asserted; spot-checked mechanisms still exist (409 split, restore round-trip, rebuild affordance) | e.g. `contentVersionService.js:211-338` | **CLOSED** (no open work; live re-confirmation = A4's job) | — |

### 2.5 Editorial review §4 — QA §0–§5 evidence table

`CLOSED` = machine-pinned on main. `OPEN-TRACKED` = passed live 2026-07-11 (or was skipped) and the durable sign-off is still outstanding under A4 / PR-1b. Test pins were largely added by A4 buildout **PR #326**.

| id | orig. row status | disposition | current pin / tracking |
|---|---|---|---|
| ed-qa-0.1a | PARTIAL | **CLOSED** | `e2e/segment-editor.spec.js:425` — real-module preview renders HTML (the exact unmet sub-claim) |
| ed-qa-0.1b | PASS | **CLOSED** | `e2e/segment-editor.spec.js:439` traversal track → 400 |
| ed-qa-0.1c | PASS | **CLOSED** | `e2e/segment-editor.spec.js:447` bad moduleId → 400 |
| ed-qa-0.3a | PASS | **CLOSED** | `e2e/rbac.spec.js:112` cross-book apply → 403 (DB-resolved reject branch = A4 carve-out (c), register line 127) |
| ed-qa-0.3b | PASS | **CLOSED** | `requireRole.test.js:56` + end-to-end in `review-cycle.spec.js:143` |
| ed-qa-0.3c | PASS | **CLOSED** | `e2e/rbac.spec.js:134` admin not book-blocked (hermetic 400) |
| ed-qa-0.3d | PASS | **CLOSED** | `e2e/rbac.spec.js:128` cross-book publish → 403 |
| ed-qa-0.reg | PASS (adapted) | **CLOSED** | `e2e/review-cycle.spec.js:31` full chain incl. the submit step the review skipped |
| ed-qa-1b | PASS | **CLOSED** | `e2e/review-cycle.spec.js:158,203` restore + no-confirm 400 |
| ed-qa-1d | PASS | **CLOSED** | `e2e/review-cycle.spec.js:212` version_restored in activity log |
| ed-qa-1e | PASS | **CLOSED** (survived 2/2 skeptics — one absent) | `e2e/rbac.spec.js:143` cross-book restore → 403 |
| ed-qa-1f | SKIPPED | **OPEN-TRACKED** | A4 walk / runbook Phase 2 step 9 — needs a real divergent-extraction case |
| ed-qa-1g | N/A | **CLOSED** | Moot by recorded decision: no git-per-apply (qa-checklist.md:68, CLAUDE.md Unit 1) |
| ed-qa-2a–2c | PASS ×3 | **OPEN-TRACKED** ×3 | Vitest-covered (`localizationReviewService.test`), browser E2E deferred to **PR-1b** (A4 carve-out (b)) |
| ed-qa-2f | PARTIAL | **OPEN-TRACKED** | visual-judgment step, runbook Phase 2 step 10 |
| ed-qa-3a–3d | PASS ×4 (3c SKIPPED) | **OPEN-TRACKED** ×4 | `assignmentEnforcement.test.js` covers all; E2E tier = PR-1b |
| ed-qa-3e | SKIPPED | **OPEN-TRACKED** | unit test drops the table (`assignmentEnforcement.test.js:119`); live sign-off = A4 |
| ed-qa-3f | PASS | **OPEN-TRACKED** | visual-judgment, runbook step 10 |
| ed-qa-4a | PASS (nuance) | **OPEN-TRACKED** | A4 found my-work renders raw mNNNNN (`my-work.html:1249`) — logged low-severity UX item, A4 carve-out (a) |
| ed-qa-4b | PARTIAL | **OPEN-TRACKED** | organic links DO expose module=mNNNNN (`my-work.js:54,86`) — same carve-out (a) |
| ed-qa-4c | PASS | **CLOSED** | `e2e/a4-coverage.spec.js:166` role-gating both directions |
| ed-qa-4d | PASS | **CLOSED** | `e2e/concurrent-editing.spec.js:29` (pre-existing) + `segmentEditConflict.test.js` |
| ed-qa-4e | PASS (informal) | **OPEN-TRACKED** | editorial judgment, runbook step 10 |
| ed-qa-5a | PASS | **CLOSED** | `e2e/a4-coverage.spec.js:113` transport-level no-flash proof |
| ed-qa-5b | PASS | **CLOSED** | `e2e/rbac.spec.js:151` anon mutation rejected |
| ed-qa-5c | PROD-ONLY | **OPEN-TRACKED** | A4 prod-only case 3 (runbook prescribes throwaway box — hence not UNVERIFIABLE) |
| ed-qa-5d | PASS | **CLOSED** | suite 3368 green + console sweep `a4-coverage.spec.js:137` (C2's 2 e2e reds are the separate accepted baseline, since resolved per register) |

### 2.6 Editorial review §5 — practice-benchmark dimensions (see §5 for the delta)

| id | orig. verdict | disposition | basis |
|---|---|---|---|
| ed-dim-1 four-eyes | RISK | **CLOSED** (all 4 code drivers fixed: #1, #2, #4, bug a) | `pipeline.js:69…`; `sections.js:92…`; `returnEditToPending`; verdict re-score needs A4 |
| ed-dim-2 TM lifecycle | GAP | **OPEN-TRACKED** | silent regen (`tmService.js:46`) + tm/glossary not in `git-backup.sh:75-85` → C8·I21-R2 + C3·I20-R1 |
| ed-dim-3 terminology governance | GAP | **OPEN-TRACKED** | `terminology.md:220` stale claim (item 23); export cron prod-external; durability C3; bridge gap = CLAUDE.md 2026-07-26 blocker (a) |
| ed-dim-4 QA gates | SOUND (1 caveat) | **CLOSED** | caveat closed: server-side SR-OOS-2 backstop `routes/segment-editor.js:373-411` |
| ed-dim-5 throughput ergonomics | GAP | **OPEN-TRACKED** | #28, #8 both fixed; residual = submit-gated queue → item 23/L7 |
| ed-dim-6 traceability | GAP | **CLOSED** (all 3 drivers: #12, #21, version caption) | `books.html:2100`; `activityLog.js:155-203`; `segment-editor.html:1605` |
| ed-dim-7 rollback/recovery | RISK | **CLOSED** (all 3 drivers: #6, #3, empty-segment) | guards-first + write-first + record-all-segments (I12-M1 edge register-noted) |
| ed-dim-8 onboarding | RISK | **OPEN-TRACKED** | doc corpus untouched (the load-bearing driver); code compounders (bug a, #14) closed → item 23 · Batch 3 |

### 2.7 Editorial review §6 — ranked recommendations

| id | rank | disposition | evidence / register |
|---|---|---|---|
| ed-rec-1 docs authority | #1 | **OPEN-TRACKED** | every cited [FACT] re-verified true; zero commits to the three docs since review → item 23 · Batch 3 |
| ed-rec-2 book-scoping | #2 | **CLOSED** | PR #268 (`366206b5`, `fc6b8b67`, `69619720`); later sections.js editor-level status residue = distinct C5·B1-F2 |
| ed-rec-3 discuss/rejected exit | #3 | **CLOSED** | PR #270, migration 039 + `returnEditToPending` (MTA-R8/R9 = new-feature interactions, tracked C6) |
| ed-rec-4 Submit-button fate | #4 | **OPEN-TRACKED** | button unchanged (`segment-editor.js:1545`); parked as lead decision L7 in both registers |
| ed-rec-5 audit-trail write path | #5 | **CLOSED** | never-throw `activityLog.log()` (PR #271) + applied_by threading (`6e974844`) |
| ed-rec-6 Saga útgáfa disambiguation | #6 | **CLOSED** | the recommended one-line copy fix shipped verbatim (`4bc9d86f`, I12-R4/item 15) |

---

## 3. Resurrect list — OPEN-UNTRACKED, ranked by original severity

All three survivors are from the editorial review's lowest severity tier — **no High or Medium finding escaped the registers.** Each was re-checked against both campaign registers, CLAUDE.md and the MEMORY snapshot at synthesis (greps for symbol, file and concept) before landing here. Proposed homes use the live campaign's tiers.

| # | id | original severity | what | proposed home |
|---|---|---|---|---|
| 1 | **ed-drift-e** | CODE-AHEAD (drift catalog, no numeric severity) | Publication status is a **dual model** — nested `publicationStatus` per-track schema (`schemas/chapter-status.schema.json:134`) + an independent request-time filesystem scan (`publicationService.getPublicationStatus`, `publicationService.js:308`) — and neither CLAUDE.md's flat field nor master-pipeline.md describes it. C1a touched the scan for appendix paths without documenting the model. | **P3 — extend item 23 · Batch 3's scope** with one paragraph in `architecture.md` (or the master-pipeline.md replacement). Natural rider on C1 PR-2, which touches `publicationService` anyway. |
| 2 | **ed-drift-d** | CODE-AHEAD (drift catalog) | The 2026-05-10 audit's Open Question 1 (admin override of head-editor decisions; possible 'override' field) is answered architecturally by the admin bypass in `requireHeadEditorFor` (`requireRole.js:~119-121`), but the audit doc (`2026-05-10-editorial-workflow-audit.md:277`) is unannotated and no other document states the resolution. | **P3 — extend item 23 · Batch 3**: a one-line annotation on the old audit's Open Question 1 pointing at the bypass. (Append-only decision-file convention applies — annotate, don't rewrite.) |
| 3 | **ed-walk-1** | minor (wording nuance) | `my-work.html:1128` — `'Engin verkefni í dag – vel gert!'` fires unconditionally on zero tasks, indistinguishable for a never-assigned fresh login vs an editor who cleared a real queue. | **P3 — fold into the existing low-severity my-work UX item** (A4 carve-out (a), campaign line 127 — the mNNNNN header item) or item 25 "Smalls"; same file, same surface, one PR. |

**Also for the lead, though tracked:** finding **#9 (undeclared `glob`)** deserves a severity restoration, not just a register slot. The joint summary ordered it *"first — can fail a clean install anytime"*; it now sits undated in the P3 opportunistic tail as part of item 22, and its accidental provider has meanwhile shifted to the repo-ROOT tree (`@mathjax/src → mj-context-menu → rimraf → glob@13`) — the server's own tree provides nothing, so any root-dependency change or a server-only checkout breaks the terminology-import feature with an uncaught throw (the `require` sits outside `findFiles`' try/catch). Recommended: pull the one-line `dependencies` declaration out of item 22 and ship it standalone, per the original triage.

---

## 4. Batch roll-up

### Joint-summary batches 1–9 (the lead's triage order)

| # | Batch | Members (this ledger) | % closed | Status |
|---|---|---|---|---|
| 1 | Book-scoped authz sweep | code-1, 2, 4 (+SA-11 rider) + ed-rec-2/dim-1 | **100%** | Shipped as PR #268, 2026-07-11 — "ship first, ship alone" honored |
| 2 | discuss/rejected + dropped messages | ed-walk-4, ed-rec-3, code-14, code-24 | **100%** | Shipped as PR #270 (migration 039, returnEditToPending, message-first, confirm handshake) |
| 3 | Documentation authority triage | ed-rec-1, ed-rec-4, ed-drift1-a/b/c, ed-dr2-*, ed-dr3-1, ed-dim-docs-a–d, ed-drift-a/b/c/f, ed-dim-8 | **0%** | Entirely open — parked whole as item 23 · P3; Submit-button half decision-gated on L7. Zero commits to any named doc since the review. |
| 4 | Fail-loud sweep | code-20, 21, 22, 37 + ed-rec-5 | **100%** | Shipped as PR #271 (never-throw activityLog, lazy DB opens, honest unavailability) |
| 5 | Apply, job-model & version integrity | code-3, 5, 6, 15, 16, 19 + ed-dim-7 | **100%** | Shipped as campaign items 12/13 (PRs #298/#299) |
| 6 | Concurrent-edit lost updates | code-7, 8 + ed-dim-5/7 aspects | **100%** | Shipped as PR #299 (editor-scoped upsert, qid'd retry queue) |
| 7 | Dashboard/view contract repair | code-10, 11, 12, 13, 18, 25–31 | **92% (11/12)** | Shipped as item 16 PR1+PR2 (#303/#304); residual #10 is decision-gated (C5·B1-F1/I16-R1), not forgotten |
| 8 | Appendices label unification | code-17a, 17b, 23 | **100%** | Shipped as item 14 (PR #300) + C1a (PR #323). Publish write-path *enablement* = C1 PR-2/C1d, a tracked successor, not this batch |
| 9 | Dependency & dead-code hygiene | code-9, 32, 33, 34, 35, 36 | **0%** | Entirely open — item 22 · P3. **#9's "declare first" urgency evaporated** (see §3 rider) |

### Code-review batches A–H

| Batch | Findings | % closed | Note |
|---|---|---|---|
| A | 1, 2, 4 (+SA-11) | **100%** | = joint 1 |
| B | 3, 15, 16, 19 | **100%** | = joint 5 (write-order/snapshot half) |
| C | 5, 6, 14 | **100%** | job book-field + guard-first + confirm handshake (joint 5 + joint 2's #14) |
| D | 7, 8, 24 | **100%** | lost-update campaign (joint 6 + joint 2's #24) |
| E | 20, 21, 22, 37 | **100%** | = joint 4 |
| F | 10, 11, 12, 13, 18, 25–31 | **92%** | = joint 7; #10 decision-gated |
| G | 17, 23 | **100%** | = joint 8 |
| H | 9, 32–36 | **0%** | = joint 9 — the only fully-open code batch |

**Roll-up in one line:** **30 of 37 code findings CLOSED; 7 OPEN-TRACKED (#9, #10, #32–#36); 0 untracked; 0 superseded.** Six of the seven open are Batch H hygiene; the seventh (#10) is decision-gated. Every open code finding has a register home — but #9 no longer carries its original "fix first" urgency annotation.

---

## 5. Practice-benchmark delta

Re-scoring rule: this audit can re-score only where code reading suffices. Where the original verdict rested on live observation, the code basis is stated and the final re-score is explicitly deferred to the **A4 manual walk** — the audit does not guess.

| Dim | 2026-07-11 | Code-basis delta (2026-07-26) | Re-score |
|---|---|---|---|
| 1 four-eyes integrity | RISK | All four defect drivers fixed (#1, #2, #4, bug a) | Code basis for RISK is gone → **candidate SOUND; not re-scorable without A4** (self-approval soundness was a live observation) |
| 2 TM lifecycle | GAP | Unchanged: regen still fire-and-forget warn-only; tm/ + glossary/ still absent from git-backup PATHSPECS | **GAP stands** (C8·I21-R2, C3·I20-R1) |
| 3 terminology governance | GAP | Unchanged: stale-CSV doc claim persists; DB→glossary bridge CLI-only; cron status prod-external (unverifiable from repo); 2026-07-26 biology work independently re-confirmed the seam as a live blocker | **GAP stands** |
| 4 QA gates | SOUND | Sole caveat closed (server-side structural-marker backstop, SR-OOS-2) | **SOUND, strengthened** |
| 5 throughput ergonomics | GAP | Both code defects fixed (#28 removed honestly, #8 qid'd); residual is the submit-gated queue design decision | **Improved; final score gated on L7 decision** |
| 6 traceability & audit trail | GAP | All three drivers fixed (#12, #21 structural, version-semantics caption) + applied_by threading | Code basis gone → **candidate SOUND; not re-scorable without A4** (activity-feed fidelity was live-verified) |
| 7 rollback & recovery | RISK | All three drivers fixed (#6 guard-first, #3 write-first, #19 record-all); I12-M1 disk-full edge register-noted | Code basis gone → **candidate SOUND; not re-scorable without A4** |
| 8 onboarding load | RISK | Code compounders closed (bug a, #14); **the load-bearing driver — the actively-wrong, auto-triggering doc corpus — is untouched** | **RISK stands** until item 23 executes |

Net: 1 SOUND / 4 GAP / 3 RISK → on code evidence, **2 SOUND / 2 GAP / 1 RISK / 3 pending-A4**. The three pending re-scores are exactly why finishing A4 is step 3 of the approved sequence.

---

## 6. Unrecoverable — the counted-only drift rows

The editorial review's §2 tallied **68 cross-walked claims: 45 MATCH / 11 DOCS-AHEAD / 9 CODE-AHEAD / 1 DRIFT / 2 UNDETERMINED** — but its working artifacts (documented-workflow model, drift catalog, walkthrough log, QA evidence, practice-benchmark synthesis) were, per its own closing note, *"session-scoped working files, not committed separately."* Only ~10 non-MATCH rows were narrated in committed prose; those 10 are dispositioned in §2.3 above.

That leaves **~13 of the 23 non-MATCH rows (drawn from the 11 DOCS-AHEAD / 9 CODE-AHEAD / 1 DRIFT / 2 UNDETERMINED tallies) existing only as a count.** Their identity — which document, which claim — was never committed. They are hereby recorded as **UNRECOVERABLE: a permanent evidence gap.** They are NOT reported as MATCH, NOT reported as closed, and cannot be individually dispositioned, resurrected, or excluded. This is itself a second confirmed instance of the evaporation pattern this audit exists to catch, and the standing lesson for future reviews: **cross-walk tallies without committed row-level artifacts are unauditable — commit the catalog, not just the count.**

(The 45 MATCH rows are likewise mostly unidentifiable, but a lost positive confirmation costs a re-check, not a lost defect — the asymmetry that governs this audit's whole method.)

---

## 7. Exclusion list

Copy-pasteable. A future diff-scoped review of this repo **must not re-report** any of the following; cross-reference the id instead. Format: `id = disposition`.

```
# server-code-review (37 findings + 4 refutations)
code-1=CLOSED  code-2=CLOSED  code-3=CLOSED  code-4=CLOSED  code-5=CLOSED
code-6=CLOSED  code-7=CLOSED  code-8=CLOSED
code-9=OPEN-TRACKED(item22)  code-10=OPEN-TRACKED(C5-B1-F1/I16-R1)
code-11=CLOSED  code-12=CLOSED  code-13=CLOSED  code-14=CLOSED  code-15=CLOSED
code-16=CLOSED  code-17a=CLOSED  code-17b=CLOSED  code-18=CLOSED  code-19=CLOSED
code-20=CLOSED  code-21=CLOSED  code-22=CLOSED  code-23=CLOSED  code-24=CLOSED
code-25=CLOSED  code-26=CLOSED  code-27=CLOSED  code-28=CLOSED  code-29=CLOSED
code-30=CLOSED  code-31=CLOSED
code-32=OPEN-TRACKED(item22)  code-33=OPEN-TRACKED(item22)  code-34=OPEN-TRACKED(item22)
code-35=OPEN-TRACKED(item22)  code-36=OPEN-TRACKED(item22)  code-37=CLOSED
code-ref-1=CLOSED-BY-REFUTATION  code-ref-2=CLOSED-BY-REFUTATION
code-ref-3=CLOSED-BY-REFUTATION  code-ref-4=CLOSED-BY-REFUTATION
# SA-11 rider (books.js import scope): closed with Batch A/PR #268 scope sweep — do not re-report as new

# editorial-workflow-review §2 drift (narrated rows)
ed-drift1-a=OPEN-TRACKED(item23)  ed-drift1-b=OPEN-TRACKED(item23)  ed-drift1-c=OPEN-TRACKED(item23/L7)
ed-dr2-update-status=OPEN-TRACKED(item23)  ed-dr2-tmcreated-orphan=OPEN-TRACKED(item23,needs-scoping)
ed-dr3-1=OPEN-TRACKED(item23)  ed-dr3-2=CLOSED(MATCH-reconfirmed)
ed-dim-docs-a=OPEN-TRACKED(item23)  ed-dim-docs-b=OPEN-TRACKED(item23)
ed-dim-docs-c=OPEN-TRACKED(item23)  ed-dim-docs-d=OPEN-TRACKED(item23)
ed-drift-a=OPEN-TRACKED(item23)  ed-drift-b=OPEN-TRACKED(item23)  ed-drift-c=OPEN-TRACKED(item23)
ed-drift-d=OPEN-UNTRACKED(resurrect#2)  ed-drift-e=OPEN-UNTRACKED(resurrect#1)
ed-drift-f=OPEN-TRACKED(item23,reconciled-with-ed-walk-5)

# editorial §3 walkthrough
ed-walk-1=OPEN-UNTRACKED(resurrect#3)  ed-walk-2=OPEN-TRACKED(item23/L7)
ed-walk-3=OPEN-TRACKED(item23/L7)  ed-walk-4=CLOSED  ed-walk-5=OPEN-TRACKED(item23)
ed-walk-6=OPEN-TRACKED(glossary-blocker-a)  ed-walk-7=CLOSED  ed-walk-8=CLOSED
ed-walk-9=OPEN-TRACKED(C8-I21-R2)  ed-walk-10=CLOSED  ed-walk-11=CLOSED(positive)

# editorial §4 QA table
ed-qa-0.1a=CLOSED  ed-qa-0.1b=CLOSED  ed-qa-0.1c=CLOSED  ed-qa-0.3a=CLOSED
ed-qa-0.3b=CLOSED  ed-qa-0.3c=CLOSED  ed-qa-0.3d=CLOSED  ed-qa-0.reg=CLOSED
ed-qa-1b=CLOSED  ed-qa-1d=CLOSED  ed-qa-1e=CLOSED  ed-qa-1f=OPEN-TRACKED(A4)
ed-qa-1g=CLOSED(decision)  ed-qa-2a=OPEN-TRACKED(A4/PR-1b)  ed-qa-2b=OPEN-TRACKED(A4/PR-1b)
ed-qa-2c=OPEN-TRACKED(A4/PR-1b)  ed-qa-2f=OPEN-TRACKED(A4)  ed-qa-3a=OPEN-TRACKED(A4/PR-1b)
ed-qa-3b=OPEN-TRACKED(A4/PR-1b)  ed-qa-3c=OPEN-TRACKED(A4/PR-1b)  ed-qa-3d=OPEN-TRACKED(A4/PR-1b)
ed-qa-3e=OPEN-TRACKED(A4/PR-1b)  ed-qa-3f=OPEN-TRACKED(A4)  ed-qa-4a=OPEN-TRACKED(A4-carveout-a)
ed-qa-4b=OPEN-TRACKED(A4-carveout-a)  ed-qa-4c=CLOSED  ed-qa-4d=CLOSED
ed-qa-4e=OPEN-TRACKED(A4)  ed-qa-5a=CLOSED  ed-qa-5b=CLOSED
ed-qa-5c=OPEN-TRACKED(A4-prod-only-3)  ed-qa-5d=CLOSED

# editorial §5 dimensions
ed-dim-1=CLOSED(rescore-needs-A4)  ed-dim-2=OPEN-TRACKED(I21-R2+I20-R1)
ed-dim-3=OPEN-TRACKED(item23+C3+C7)  ed-dim-4=CLOSED  ed-dim-5=OPEN-TRACKED(item23/L7)
ed-dim-6=CLOSED(rescore-needs-A4)  ed-dim-7=CLOSED(rescore-needs-A4)  ed-dim-8=OPEN-TRACKED(item23)

# editorial §6 recommendations
ed-rec-1=OPEN-TRACKED(item23)  ed-rec-2=CLOSED  ed-rec-3=CLOSED
ed-rec-4=OPEN-TRACKED(item23/L7)  ed-rec-5=CLOSED  ed-rec-6=CLOSED

# joint-summary batches: covered structurally by §4 roll-up; batches 1,2,4,5,6,8=100% closed,
# batch 7=92% (residual code-10), batches 3,9=0% (items 23,22) — do not re-derive
# ~13 counted-only §2 drift rows: UNRECOVERABLE — cannot be excluded by id; a future review
# re-finding one of them is NEW SIGNAL, not a duplicate
```

---

## Appendix — notes-only observations surfaced by verifiers (per scope discipline: not ledger rows)

Logged here for the register keeper; none was turned into a finding:

1. **glob's accidental provider chain moved** to the repo root (`@mathjax/src → mj-context-menu@1.0.0 → rimraf@6.1.3 → glob@13.0.6`); the `overrides` entry (`e4ac93bc`) can mislead a reviewer into thinking the dependency is declared. Sharpens #9's failure mode: uncaught throw, not silent empty result.
2. **CLAUDE.md:177** still lists `04-localization/ # ✏️ Localization in progress` (same drift family as ed-drift-b) and **CLAUDE.md:450** repeats the stale "tm/ empty in every book" line (same as ed-dr3-1) — both should ride item 23.
3. **MEMORY snapshot staleness:** line 44 still claims analyticsService "opens DB eagerly at module load" — stale since PR #271's lazy-open conversion.
4. **tmCreated's disconnection is now double:** item 21's `tm-export.cjs` modernized TM output paths while the status-sync scan rule (`bookRegistration.js:1043`) and the per-section TMX display checks (`routes/status.js:1313, 1401-1412`) still assume the legacy `tm/chNN/{section}.tmx` layout.
5. **`git-backup.sh` contradicts `export-terminology.js`'s own header** ("the 2h git-backup already stages books/…") — glossary/ is not in the PATHSPECS. Already tracked as C3·I20-R1; the header comment should be corrected when C3 lands.
6. **I16-R10** (two other hardcoded label ternaries in segment-editor.js) corroborates that #32's list is representative, not exhaustive — item 22's executor should sweep, not enumerate.
7. **C1c follow-up adjacency:** appendix deep links now carry `chapter=-1` and the localization-editor page's client-side handling of `chapter=-1` is unverified (noted in the live campaign; adjacent to but distinct from code-10).
