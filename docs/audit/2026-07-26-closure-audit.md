> ⛔ **FROZEN 2026-07-26 — do not edit.**
>
> This is the disposition of the 2026-07-11 review **as of `main` `9107ed1d`**. It is never updated.
> Its forward jobs are §7's exclusion list for the next diff-scoped review, and the evidence behind
> every row (`2026-07-26-closure-audit-evidence.md`).
>
> **Current status of anything here lives in the campaign register**
> (`docs/plans/2026-07-21-post-item17-followup-campaign.md`, §C10). **If this file disagrees with the
> register, the register wins** — this file is dated, the register is live.
>
> **§1's disposition table is authoritative over every prose count in this file.**
>
> *Why frozen: this document was briefly declared a "second source of truth" alongside the register.
> That is the same failure this audit exists to name, one level up — and it produced a real
> disagreement within a day. One fact, one live home.*

# Closure Audit — 2026-07-11 review findings × current `main`

**Date:** 2026-07-26 · **Baseline:** `main` `9107ed1d` (audit branch `audit/closure-audit-2026-07-26`) · **Suite:** 3388 green
**Method:** read-only workflow fan-out by file/subsystem (19 code groups + 8 editorial groups), then **asymmetric adversarial verification** — every `CLOSED` disposition attacked by 3 skeptics with a default answer of *"not actually closed"*, killed on ≥2 refutes. `OPEN` dispositions accepted cheaply. Every finding re-located by **symbol and behaviour**, never by line number (287 files / +36,297 −5,218 lines changed in `server/` + `tools/` + `scripts/` since the review baseline — line drift is evidence of nothing).
**Design:** [`docs/superpowers/specs/2026-07-26-closure-audit-design.md`](../superpowers/specs/2026-07-26-closure-audit-design.md)

**What this document is for:** it is the finding-level disposition ledger the 2026-07-11 two-perspective review never got — it answers *"are we on target?"* with evidence at finding granularity, and it is the **exclusion list** that the planned diff-scoped review (step 4 of the approved sequence) consumes so it does not re-report already-dispositioned work.

**This audit changed no code.** Resurrected findings are the lead's to triage — landed in the live campaign as **C10** (`docs/plans/2026-07-21-post-item17-followup-campaign.md`).

> 📦 **Retention note — do not delete `2026-07-26-closure-audit-evidence.md` (688 KB) as cruft.** It is the *only* durable copy of the quoted code behind all 128 rows and of the 180 adversarial verdicts; the ledger's `file:line` citations are unauditable without it. Its size is the point: §6 records that the 2026-07-11 editorial review lost 11 real drift findings permanently by committing *counts* instead of *rows*, and this file is the correction. A future audit may supersede it; a cleanup pass should not.

---

## 1. Headline

**We are on target.** Of the dispositioned claims (**counts: see the table below, which is authoritative over every prose figure in this file**), **69 are closed** (66 `CLOSED` + 3 `CLOSED-BY-REFUTATION`) and every one survived three-skeptic refute-default. **All four High/Medium authorization findings are closed**; code batches A–E and G are 100% closed. The remaining open work is overwhelmingly *tracked*, against live register lines, concentrated in exactly two places the lead already knows about — **Batch 9 / item 22** (dependency + dead-code hygiene, 0% closed) and **Batch 3 / item 23** (documentation authority triage, 0% closed, half of it decision-gated on L7).

**The clearest signal in the data:** every dimension whose gap was **code** closed or improved. Every dimension whose gap was **documentation** — joint batches 3 and 9, both **0% closed** — is exactly where it was on 2026-07-11. The campaign shipped code and did not ship docs. That is the single most actionable pattern in this ledger.

**Only 8 claims are genuinely untracked** — the audit's actual product. None is a security hole. The three that matter are listed first below.

> ⚠️ **The one thing to act on this week:** the calibration sample was right and the fan-out confirmed it. **Finding #9 (undeclared `glob`) is OPEN**, sitting in the P3 opportunistic tail with its original urgency annotation — *"it can fail a clean install anytime, fix it first within its batch"* — evaporated. The audit additionally found the situation is **worse than the review described**: `glob` is absent from `server/node_modules` *and* from `server/package-lock.json` entirely, and resolves today only because Node walks up to the repo-root tree where MathJax happens to pull it in transitively (`@mathjax/src → mj-context-menu → rimraf → glob@13.0.6`). A routine MathJax bump silently breaks terminology key-terms import, and the `overrides` entry actively camouflages the gap from a `grep glob server/package.json`.

### Disposition counts

> ### ⚠️ Revised 2026-07-26 by blind replication
> A second, blind run of this identical audit under **Fable 5** was adjudicated against this one
> (**3–3** on six disputed claims). **Seven corrections have been applied to this ledger** — including
> the withdrawal of one finding as a false positive. Counts below are post-correction.
> Full study: [`2026-07-26-closure-audit-model-comparison.md`](2026-07-26-closure-audit-model-comparison.md) ·
> Run B verbatim: [`2026-07-26-closure-audit-runB-fable.md`](2026-07-26-closure-audit-runB-fable.md).
>
> **⚠️ Treat this ledger's line numbers as approximate anchors.** Adjudicators found a systematic
> ~4-line citation drift in a minority of rows. Every *symbol* checked out; the numbers sometimes
> lag. Re-locate by symbol, as this audit's own HARD RULE 1 requires.

| Disposition | Count | Share |
|---|---:|---:|
| `CLOSED` | 69 | 53% |
| `CLOSED-BY-REFUTATION` | 3 | 2% |
| `OPEN-TRACKED` | 47 | 36% |
| **`OPEN-UNTRACKED`** | **7** | **5%** |
| `NOT-A-DEFECT` (claim was a MATCH / never built — §8) | 2 | 2% |
| `UNVERIFIABLE` | 2 | 2% |
| **Total dispositioned** | **130** | |
| `UNRECOVERABLE` (never committed — §6) | **11** | *not dispositionable* |

### The OPEN-UNTRACKED list, ranked by original severity

| # | id | Original severity | One line | Proposed tier |
|---|---|---|---|---|
| 1 | `code-ref-3` | **Medium, PLAUSIBLE** (integrity) | Faithful file is overwritten inside a DB transaction that can still roll back afterwards, leaving disk advanced and the DB reverted — including a **lost `content_versions` snapshot**, so the pre-apply state never enters version history. Residue is file/DB divergence, **not corruption** (the atomic tmp+rename and `.bak` legs hold). ⚠️ **Narrative corrected 2026-07-26:** the refutation's leg (b) was **already false at the 2026-07-11 baseline** — `markApplied`/`markSuperseded` were post-write and in-transaction then too. Item-20b *widened* an existing window; it did not open one. Defect and priority unchanged; the "invalidated by later code" story was wrong. | **P1** |
| ~~2~~ | ~~`ed-w6b`~~ | ❌ **WITHDRAWN 2026-07-26 — FALSE POSITIVE** | Two independent verifiers (2/2, high confidence) found the asserted defect **not present**: migration 039 removed the constraint that produced the raw message, so no `SqliteError` with that text can reach `markForDiscussion`'s catch-free path. The `alert()` plumbing exists, but a latent-robustness observation is not a finding. **Run A over-claimed here; the blind Fable run's absence of a row was correct.** | ~~P2~~ **dropped** |
| 3 | `ed-drift-2b` | unrated (trailing clause of Headline drift 2) — **⚠️ escalate** | `tmCreated` is orphaned: nothing advances it. Verified consequence the review did not draw — `transitionStage` enforces sequential prerequisites, so **every DB-side `advanceChapterStatus(…, 'injection')` throws and is swallowed**. Not a cosmetic schema wart. | **P1** |
| 4 | `ed-w8` | n/a (positive confirmation, now partly falsified) | `needsAttention.blockedIssues` is `getDiscussEdits(10).length` — a **count derived from a row list capped at 10**, so it saturates. The walkthrough's "no discrepancy" was an artefact of small fixture data. (`overdueCount`, a second quarter of this row, is `SUPERSEDED` — deliberately deleted by F28.) | **P2** |
| 5 | `ed-drift-1a` | unrated (Headline drift 1a) | The read-side "workflow trap" fix (`dashboardReadModel`) is real shipped code documented **nowhere** — `grep dashboardReadModel` on `CLAUDE.md`/`README.md`/`server/README.md` returns 0. A new head-editor could re-propose a fix that already exists. | **P3** |
| 6 | `ed-drift-e` | unrated (CODE-AHEAD) | Publication status is richer than any doc describes: a nested `publicationStatus` schema **plus** a fully independent filesystem-scan read path (`getPublicationStatus` derives "what's live" by scanning at request time, never from stored status). | **P3** |
| 7 | `ed-drift-d` | unrated (CODE-AHEAD) | The 2026-05-10 audit's Open Question 1 (admin override / data-model `override` field) is architecturally answered — admin bypasses in `requireHeadEditorFor` — but was never back-annotated as resolved. **Claim narrowed by this audit**, see ledger. | **P3** |
| 8 | `ed-w1` | minor (explicitly "not a functional bug") | A never-assigned editor and an editor who cleared a real queue get the identical celebratory `'Engin verkefni í dag – vel gert!'`. | **P3** |

### Calibration check — the fan-out agrees with the hand-verified sample ✅

| Calibration item | Expected | Fan-out result | Verdict |
|---|---|---|---|
| #1 `pipeline.js` cross-book mutation | `CLOSED` | `CLOSED` — `requireHeadEditorFor((req) => req.body?.book)` on all three mutating routes | ✅ |
| #9 undeclared `glob` | `OPEN` | `OPEN-TRACKED` (item 22 · Batch 9) | ✅ |
| #35 four dead env vars | `OPEN` | `OPEN-TRACKED` (item 22 · Batch 9) | ✅ |
| #36 stale `decisions.json` | `OPEN` | `OPEN-TRACKED` (item 22 · Batch 9) | ✅ |

No contradiction with the sample. **One trap worth recording permanently:** a future reader can close #9 by mistake, because commit `e4ac93bc` *"chore: override deprecated glob in server dependencies"* added an `overrides.glob` entry — so `grep glob server/package.json` now returns a hit while the package remains undeclared and uninstalled. An `overrides` entry constrains a transitive version; it does not install anything.

### Synthesis corrections made to the fan-out's raw output

Per the design's §9 risk register, I re-checked **every** `OPEN-UNTRACKED` against all four register sources myself before it reached the resurrect list. **Eight were downgraded to `OPEN-TRACKED`** — verifiers had missed a register item, or (in five cases) two verifiers dispositioned overlapping claims differently. See §8 for the full reconciliation. Raw fan-out output was 16 `OPEN-UNTRACKED`; the audited figure was **8**, and **7** after the blind replication withdrew `ed-w6b` (see §1's table, which is authoritative).

---

## 2. Ledger

Evidence here is terse `file:line` as of `9107ed1d`. **The verbatim quoted code behind every row — ~114,000 characters, plus all 180 adversarial skeptic verdicts — is committed alongside this file as [`2026-07-26-closure-audit-evidence.md`](2026-07-26-closure-audit-evidence.md).** Severity language is the **original review's**, never re-invented.

> **Why that companion file exists.** The first draft of this ledger said *"long quotes live in the fan-out record, not here"* — while committing no such record. Its own completeness critic caught that the substrate was a session-scoped working file, i.e. **precisely the evaporation pattern §6 condemns**, reproduced inside the audit that exists to name it. The evidence is now durable.

### 2.1 `2026-07-11-server-code-review.md` — ranked findings 1–37

| id | Orig. sev | Claim (compressed) | State on main | Evidence (current) | Disposition | Register |
|---|---|---|---|---|---|---|
| code-1 | High, CONFIRMED (authz) | pipeline inject/render/run gated by global role only → any head-editor acts on any book | Book-scoped guard on all 3 mutating routes | `routes/pipeline.js:69,120,170`; `middleware/requireRole.js:135-142` | **CLOSED** | — |
| code-2 | High, CONFIRMED (authz) | 4 mutating section routes + elevated status branch unscoped | `loadSection` → `requireHeadEditorFor(sectionData.bookSlug)` on all 4; status branch scoped inline | `routes/sections.js:92,175,429,501,303-313` | **CLOSED** | — |
| code-3 | Medium (↓High), CONFIRMED | loc approve marks `approved` **before** writing file → stranded rows | Write-first, then transactional status change | `services/localizationReviewService.js:237-293` | **CLOSED** | — |
| code-4 | Medium, CONFIRMED (authz) | unscoped upload into `03-faithful-translation/`/`04-localized-content/` | Route **retired** (review's own alt. fix); absence test-pinned | `routes/sections.js` (7 routes, no upload); `__tests__/crossBookAuthz.test.js:513-524` | **CLOSED** | — |
| code-5 | Medium, CONFIRMED (state) | pipeline jobs carry no `book`; false "already running" across books | `book` on all 3 creation sites; `hasRunningJob(book, …)` | `services/pipelineService.js:469,386,285,888` | **CLOSED** | — |
| code-6 | Medium, CONFIRMED | apply-and-render applies **before** the running-job check | Guard first, + capacity guard, comment names F6 | `routes/segment-editor.js:1305-1325` | **CLOSED** | — |
| code-7 | Medium, CONFIRMED (state) | loc pending-edit lookup unscoped by editor → silent overwrite | `AND editor_id = ?` + partial unique index | `localizationReviewService.js:97-103`; `migrations/041:76-78` | **CLOSED** | — |
| code-8 | Medium, CONFIRMED (state) | successful save doesn't cancel an earlier queued failed save | `cancelPending(key)` on `response.ok` + `qid` identity guard | `public/js/saveRetry.js:196,70-76,118-123` | **CLOSED** | — |
| **code-9** | **Medium, CONFIRMED (deadcode)** | **`require('glob')` with glob undeclared in `server/package.json`** | **Still undeclared; `overrides` only; resolves via repo-root MathJax chain** | `services/terminologyService.js:1876`; `server/package.json:14-19` vs `:20-37`,`:49-51` | **OPEN-TRACKED** | item 22 · Batch 9 |
| code-10 | Medium, CONFIRMED (contract) | review tab calls `GET /api/sections/<book>/<ch>` — route doesn't exist → "Error" dropdown | Unchanged; only GET is single-segment `/:sectionId` | `public/js/localization-editor.js:1767`; `routes/sections.js:53` | **OPEN-TRACKED** | C5 · B1-F1; P3 · I16-R1 |
| code-11 | Medium, CONFIRMED (contract) | stage badges read `data.status.stages`; API sends a top-level array | Reads the array, keys by stage name | `views/status.html:643-649` | **CLOSED** | — |
| code-12 | Medium, CONFIRMED (contract) | activity panel reads `action/userName/details/timestamp`; duplicated verbatim | One shared `renderActivityRows`, correct fields, dedup test-pinned | `views/books.html:2805-2827`, called `:2106`,`:2532` | **CLOSED** | — |
| code-12b | Medium (sub-claim of 12) | `&chapter=` never applied server-side | Wired end-to-end with INTEGER-cast + GLOB numeric guard | `routes/activity.js:25-34`; `services/activityLog.js:128-143,252-261` | **CLOSED** | — |
| code-13 | Medium, CONFIRMED (contract) | route destructures `bookId`, client sends `bookSlug`, then `parseInt`s it | Reads `bookSlug`, passes through unconverted | `routes/segment-editor.js:101,108` | **CLOSED** | — |
| code-14 | Medium, CONFIRMED (contract) | 409 `requiresConfirmation` has no client half; body lacks `error`/`message` | Both halves exist; `err.data` carries parsed body | `routes/pipeline.js:87-95`; `public/js/segment-editor.js:1960-1985`; `htmlUtils.js:34-55` | **CLOSED** | — |
| code-15 | Low (↓Medium), CONFIRMED | `ORDER BY reviewed_at DESC` with no id tie-break; preview/publish disagree | Shared `(created_at, id)` comparator on both paths | `services/segmentEditorService.js:966,271`; `lib/editRecency.js:26` | **CLOSED** | — |
| code-16 | Low (↓Medium), CONFIRMED | restore writes the file but never refreshes concordance/TM | Post-write hooks run, parity with apply path | `services/contentVersionService.js:302-323` | **CLOSED** | — |
| code-17a | Low, CONFIRMED (integrity) | `countModuleSegments` given `"appendices"` builds a nonexistent dir → count 0 | `normalizeChapter` + `chapterDir`; throws on garbage | `services/segmentParser.js:430-436`; `lib/chapterLabel.js:28-41` | **CLOSED** | — |
| code-17b | Low, CONFIRMED (integrity) | concordance backfill hits the same mismatch; entry paths store different labels | Dirname converted at discovery; one canonical stored label | `services/concordanceService.js:96-111,174-180` | **CLOSED** | — |
| code-18 | Low, CONFIRMED (integrity) | `approved + applied` double-counts (applied ⊂ approved), two sites | Both sites use a `COUNT(DISTINCT segment_id)` UNION | `segmentEditorService.js:1455,1363-1380`; `routes/status.js:999` | **CLOSED** | — |
| code-19 | Low, CONFIRMED (integrity) | `if (seg.content)` skips empties → restore-undo can't return a segment to empty | Guard removed; empties recorded; nullish fails loud | `contentVersionService.js:112-131` | **CLOSED** | — |
| code-20 | Low, CONFIRMED (state) | `feedbackService` opens the real DB at require-time | Lazy `getDb()` + `_setTestDb`; subprocess-pinned | `services/feedbackService.js:79-91,177-183` | **CLOSED** | — |
| code-21 | Low, CONFIRMED (failloud) | 6 silent `catch {}` around approve/reject/unapprove audit writes | 23 hand-rolled guards deleted; never-throw contract in the service + static tripwire | `activityLog.js:160-201`; `__tests__/activityLogCallsiteGuard.test.js` | **CLOSED** | — |
| code-22 | Low, CONFIRMED (failloud) | admin book list fabricates zeros on real failures | Logs + `editorialProgress = null` + `Framvinda ótiltæk` label | `routes/admin.js:409-413`; `views/books.html:1663` | **CLOSED** | — |
| code-23 | Low, CONFIRMED (contract) | pipeline route rejects `-1` (appendices); CLI gets literal `"-1"` | `normalizeChapter` + `-1` exception; `cliChapterArg` at spawn | `routes/pipeline.js:43-47`; `pipelineService.js:66,201,239` | **CLOSED** | — |
| code-24 | Low, CONFIRMED (contract) | conflict error reads `data.error` only → user sees the word "conflict" | `data.message \|\| data.error`, **plus** two-arg `.then` so the rejection survives | `public/js/saveRetry.js:233-244,246-267` | **CLOSED** | — |
| code-25 | Low, CONFIRMED (contract) | due date sent as string; no `quickStats.overdue` → overdue UI unreachable | Both sides deleted (lead: "F30(+F25) DELETE") | `routes/my-work.js:236,283-289`; `views/my-work.html` | **CLOSED** | — |
| code-26 | Low, CONFIRMED (contract) | activity feed formats `a.created_at`; server sends `createdAt` | Reads `a.createdAt`; no snake_case remains | `views/my-work.html:1480` | **CLOSED** | — |
| code-27 | Low, CONFIRMED (contract) | timeline renders "Invalid Date" on every row | Uses the server's `timeAgo`; no client date parsing | `views/status.html:700-713` | **CLOSED** | — |
| code-28 | Low, CONFIRMED (contract) | `overdue` declared, never calculated | Removed (review's own option 2); absence test-pinned | `routes/status.js:118-135`; `__tests__/viewRouteContracts.test.js:144-155` | **CLOSED** | — |
| code-29 | Low, CONFIRMED (contract) | blocked-issues banner reads a field the endpoint never sends; links to retired `/issues` | Banner + links removed; live stat survives | `views/my-work.html:1515-1523`; pins `:157-169` | **CLOSED** | — |
| code-30 | Low, CONFIRMED (contract) | `task.stageLabel` would render "undefined" (dormant) | Ternary + `STAGE_LABELS` deleted | `views/my-work.html:1286-1291` | **CLOSED** | — |
| code-31 | Low, CONFIRMED (contract) | icon condition backwards; class name where a colour was expected | Inverted; colour consumed as a class, classes exist | `views/my-work.html:1710-1714,717-720` | **CLOSED** | — |
| **code-32** | Low, CONFIRMED (contract) | 4 categories of editor text bypass `ui-strings.js`; the ui-strings test can't catch it | All four present verbatim; no static pin covers the bytes | `public/js/segment-editor.js:2161,2070,2091,1419,2322-2401` | **OPEN-TRACKED** | item 22 · Batch 9 |
| **code-33** | Low, CONFIRMED (deadcode) | 4 notification builders + 4 orphaned type constants, zero callers | All 8 present; repo-wide grep finds no caller | `services/notifications.js:360,393,432,461,829-832,35-38` | **OPEN-TRACKED** | item 22 · Batch 9 |
| **code-34** | Low, CONFIRMED (deadcode) | page-view tracking middleware fully built, never wired | Exported, zero callers; only the route mount exists | `services/analyticsService.js:283,332,161-205` | **OPEN-TRACKED** | item 22 · Batch 9 |
| **code-35** | Low, CONFIRMED (deadcode) | 4 documented env vars no code reads | All present; **empirically 5**, not 4, reader-less names | `server/.env.example:28-38` | **OPEN-TRACKED** | item 22 · Batch 9 |
| **code-36** | Low, CONFIRMED (deadcode) | stale `decisions.json` parsed at every boot + zero-byte `workflow.db` | Both tracked; still readdir'd + parsed; 2 by-name skips | `server/data/decisions.json:1`; `services/bookDataLoader.js:14-26`; `tools/validate-pipeline-consistency.js:37,226` | **OPEN-TRACKED** | item 22 · Batch 9 |
| code-37 | Low (↓Med), PLAUSIBLE (↓CONF) | status-DB failure falls back to cached file with no log line | `log.warn` with err + both ids before the fallback | `routes/status.js:73-83` | **CLOSED** | — |

### 2.2 `2026-07-11-server-code-review.md` — §Refuted on second-pass verification

| id | Orig. sev | Refuted claim | Does the refutation still hold? | Evidence | Disposition |
|---|---|---|---|---|---|
| code-ref-1 | Medium, CONFIRMED (failloud) | publication fallback writes `complete:true` on a refused transition | **Yes** — both legs verbatim: guard `job.status === 'completed'`, catch logs at error level with `err` + `pubStage` | `services/publicationService.js:235,248-259` | **CLOSED-BY-REFUTATION** |
| code-ref-2 | Medium, CONFIRMED (failloud) | chapter import reports success when DB registration fails | **Yes on the core** ("silent" is false — `log.error`; retry path exists at `:263`). ⚠️ One *secondary* leg drifted: the review said "only two DB-backed helpers affected"; there are now ≥5 | `routes/books.js:625-639,263` | **CLOSED-BY-REFUTATION** |
| **code-ref-3** | **Medium, PLAUSIBLE (integrity)** | **faithful file overwritten inside a DB transaction that can still roll back** | **NO — leg (b) is factually false on today's tree.** Item-20b inserted `acceptanceService.lapseDrifted` + `stampApplied` (two `segment_acceptances` mutations) *between* the file write and the commit. At the review baseline that region held only write-already-failed checks. Legs (a)/(c)/(d) still hold: atomic tmp+rename, timestamped `.bak`, `applied_at` retry gate — so the residue is **file/DB divergence, not corruption** | write `segmentEditorService.js:1028`; new post-write step `:1077-1078`; commit `:1090`; `segmentParser.js:196-208` | **OPEN-UNTRACKED** ⚠️ *flipped, 2/3 refutes* |
| code-ref-4 | Low, CONFIRMED (failloud) | pre-apply snapshot failure swallowed silently | **Yes** — error-level log and the cited "non-fatal, continuing apply" comment both verbatim; same-`conn` argument strengthens it | `segmentEditorService.js:1013-1025` | **CLOSED-BY-REFUTATION** |

### 2.3 `2026-07-11-editorial-workflow-review.md` §2 — drift catalog (18 rows: 10 narrated bullets, decomposed)

| id | Orig. sev | Claim (compressed) | State on main | Evidence (current) | Disposition | Register |
|---|---|---|---|---|---|---|
| **ed-drift-1a** | unrated (Headline drift 1a) | the `dashboardReadModel` read-side "workflow trap" fix is undocumented | Unchanged; 0 hits in `CLAUDE.md`/`README.md`/`server/README.md` | `services/dashboardReadModel.js:1-16` (the only place the fact is written down) | **OPEN-UNTRACKED** | — |
| ed-drift-1b | unrated (Headline drift 1b) | `ENABLE_DIRECT_QUEUE` exists only in planning docs | Unchanged — 5 hits, all documentation, 0 code | `docs/plans/2026-05-10-…-redesign-plan.md:146,147,153,306` | **OPEN-TRACKED** | item 23 (Submit half) · A5 · L7 |
| ed-drift-1c | unrated (rec #4) | submit button still live + unconditional; hybrid state | Unchanged; static markup, no role/flag gate; queue still `module_reviews`-only | `views/segment-editor.html:1402`; `public/js/segment-editor.js:1545`; `segmentEditorService.js:659` | **OPEN-TRACKED** | item 23 · A5 · L7 |
| ed-drift-2a | Headline drift 2 (S, "widest blast radius") | `npm run update-status` documented but no such npm script | Unchanged. ⚠️ **Wider than reported** — also live in README, cli-reference, config-and-rerun-guide, and the **auto-loading** `workflow-status` skill | `CLAUDE.md:266` vs `package.json` scripts; `scripts/archived/update-status.js:17` | **OPEN-TRACKED** | P3 · item 23 · Batch 3 |
| **ed-drift-2b** | unrated (trailing clause) | `tmCreated` is advanced by nothing, manual or automatic | Unchanged — 6 `advanceChapterStatus` call sites, none `tmCreated`. **⚠️ Verified consequence the review did not draw:** `transitionStage`'s sequential prerequisite makes every DB-side `injection` advance throw, swallowed by `pipelineService`'s catch | `pipelineStatusService.js:24,161-172`; `pipelineService.js:735-746`; `schemas/chapter-status.schema.json:69-71` | **OPEN-UNTRACKED** ⚠️ **escalate** | — |
| ed-drift-3 | unrated (Headline drift 3) | roadmap's "`tm/` is empty in every book. Zero TMX files." was already stale | Unchanged and now **repeated in `CLAUDE.md:450`** and `ROADMAP.md:429` | `docs/plans/2026-06-12-editorial-throughput-roadmap.md:18` | **OPEN-TRACKED** | P3 · item 23 (by drift-catalog provenance) |
| ed-drift-3a | unrated (on-disk sub-claim) | one book with a 3-unit TMX, four with none | Byte-unchanged (3 TUs, `20260613T001935Z`); now demonstrably stale vs 4 faithful modules | `books/efnafraedi-2e/tm/efnafraedi-2e-2026-06-13.tmx` | **OPEN-TRACKED** | C3 · I20-R1 |
| ed-drift-3b | **MATCH — not a defect** | the `scheduleTmRegen` mechanism (5 s debounce, spawn `generate-tm.js`, fired from `applyApprovedEdits`) matches docs exactly | **Match still holds verbatim.** Nothing was ever open, so nothing could be "closed" | `services/tmService.js:21,32,80-91`; `segmentEditorService.js:1125-1131` | **NOT-A-DEFECT** — see §8 | *(no register cell needed)* |
| ed-drift-a | DOCS-AHEAD | `terminology.md` calls a stale disconnected CSV "the authoritative source" | Unchanged; CSV `Jan 2 2026` vs JSON `Mar 11`; **worsened** — cites `books/liffraedi/`, a directory that no longer exists | `docs/editorial/terminology.md:220` vs `tools/api-translate.js:624` | **OPEN-TRACKED** | P3 · item 23 · Batch 3 (named in scope cell) |
| ed-drift-b | DOCS-AHEAD | `04-localization/` README describes a two-stage promote workflow no code implements | Unchanged; zero code references; dir holds only the README | `books/efnafraedi-2e/04-localization/README.md:26-35` vs `segmentParser.js:399` | **OPEN-TRACKED** | P3 · item 23 · Batch 3 |
| ed-drift-c | DOCS-AHEAD | `contributor` role documented though migration 023 merged it into `editor`; `viewer` undescribed | Unchanged; `ROLES` is 4-tier | `README.md:164`; `master-pipeline.md:436` vs `server/constants.js:10-22` | **OPEN-TRACKED** | P3 · item 23 · Batch 3 (master-pipeline half named) |
| **ed-drift-d** | CODE-AHEAD | 2026-05-10 Open Question 1 already answered by admin bypass; no doc says so | Code unchanged; the audit file has never been amended (1 commit) | `middleware/requireRole.js:118-121` vs `docs/audit/2026-05-10-…-audit.md:277` | **OPEN-UNTRACKED** | — |
| **ed-drift-e** | CODE-AHEAD | nested `publicationStatus` schema + independent filesystem-scan read path, undescribed | Both present; C1a touched the function without changing the scan design | `schemas/chapter-status.schema.json:134-149`; `publicationService.js:308-343` vs `CLAUDE.md:278` | **OPEN-UNTRACKED** | — |
| ed-drift-f | **DRIFT (the single DRIFT row)** | terminology report documented as firing "on submit"; fires on module open | Both halves unchanged; no submit-path caller exists | roadmap `:118` vs `public/js/segment-editor.js:283,421-431` | **OPEN-TRACKED** | P3 · item 23 · Batch 3 |
| ed-drift-1 | DOCS-AHEAD (rec #1) | `master-pipeline.md` self-declares "authoritative" while describing the retired pipeline | Untouched since 2026-03-02; 4 inbound links present it as current | `docs/workflow/master-pipeline.md:3,155,284,408,417` | **OPEN-TRACKED** | item 23 · Batch 3 (named) |
| ed-drift-2 | DOCS-AHEAD | `mt-process.md` built entirely on the retired malstadur-web-UI + protect/unprotect account | Untouched since 2026-03-08; the GUI it documents is a 301 redirect | `docs/workflow/mt-process.md:31-33,73,132,160` | **OPEN-TRACKED** | item 23 · Batch 3 ⚠️ *not named in the scope cell* |
| ed-drift-3(skill) | DOCS-AHEAD | `.claude/skills/workflow-status.md` teaches the retired account **and auto-triggers** | Untouched since 2026-03-02. ⚠️ Its own provenance pointer (`server/services/session.js`) does not exist | `.claude/skills/workflow-status.md:13,14,16,44,86`; trigger `CLAUDE.md:256` | **OPEN-TRACKED** | item 23 · Batch 3 ⚠️ *not named* |
| ed-drift-4 | DOCS-AHEAD — review's **"Most consequential"** | `.claude/skills/review-protocol.md` auto-triggers and teaches a retired `files.json`/Word-Track-Changes model | Untouched since 2026-01-18; `find books -name files.json` → 0 | `.claude/skills/review-protocol.md:19,20,37,43-49,100`; trigger `CLAUDE.md:258` | **OPEN-TRACKED** | item 23 · Batch 3 (named) |

### 2.4 `2026-07-11-editorial-workflow-review.md` §3 — live walkthrough

| id | Orig. sev | Claim (compressed) | State on main | Evidence (current) | Disposition | Register |
|---|---|---|---|---|---|---|
| **ed-w1** | minor (not a functional bug) | empty "Today" can't distinguish never-assigned from cleared-queue | Unchanged; only input is a zero/non-zero count | `views/my-work.html:1123-1131` | **OPEN-UNTRACKED** | — |
| ed-w2 | n/a — positive | deep links, term lookup, concordance, marker overlay, honest save state all worked | Mechanisms present under the same symbols | `public/js/segment-editor.js:377-409,254` | **CLOSED** | — |
| ed-w3 | Headline drift 1 (live-confirmed) | submit button visible + unconditional; `ENABLE_DIRECT_QUEUE` never built | Unchanged | `views/segment-editor.html:1402`; `public/js/segment-editor.js:1545` | **OPEN-TRACKED** ⚠️ *downgraded, see §8* | item 23 · A5 · L7 |
| ed-w4 | headline (hybrid state) | `module_reviews` empty yet edits visible; `/reviews` stays submit-gated | Two read paths still structurally split | `dashboardReadModel.js:97` vs `segmentEditorService.js:659` | **OPEN-TRACKED** ⚠️ *downgraded, partial — see §8* | item 23 · A5 · L7 |
| ed-w5 | n/a — positive | self-approval permitted, matching deliberate design | Design comment intact; no actor check added | `public/js/segment-editor.js:845` | **CLOSED** | — |
| ed-w6a | real, reachable, head-editor-facing | no code path exits `discuss`/`rejected`; 008 UNIQUE makes re-discuss collide | **Three** exits now exist: supersede-on-save (both branches), manual `return-to-pending`, and a pending-only partial index | `migrations/039:74,102`; `segmentEditorService.js:138,175,536`; `routes/segment-editor.js:843` | **CLOSED** | — |
| ed-w6b | real, head-editor-facing | 400 relays a raw SQLite constraint message to `alert()`; `markForDiscussion` has no try/catch | ❌ **CORRECTED 2026-07-26 — this run's `OPEN-UNTRACKED` was a FALSE POSITIVE.** Two independent verifiers (2/2, high) found the asserted defect **not present**: migration 039 rebuilt `segment_edits` and dropped the UNIQUE constraint that produced the message, so no such `SqliteError` can arise in `markForDiscussion`. The relay plumbing is real but delivers nothing — a latent-robustness note, not a finding. **The blind Fable run produced no row here and was right to.** | `migrations/039-segment-edit-exit-path.js`; plumbing (inert) at `segmentEditorService.js:463-482`, `routes/segment-editor.js:804`, `public/js/segment-editor.js:1507` | **CLOSED** | — |
| ed-w7 | DRIFT (minor) | terminology report documented "on submit", fires on module open | Unchanged (duplicate of `ed-drift-f`) | `public/js/segment-editor.js:283,421-437` | **OPEN-TRACKED** ⚠️ *downgraded, see §8* | item 23 · Batch 3 |
| **ed-w8** | n/a — positive | four `needsAttention` tile counts matched live JSON; feed correctly ordered/attributed | **Partly falsified.** `overdueCount` deleted (F28 → `SUPERSEDED` for that quarter). `blockedIssues = getDiscussEdits(10).length` — a **count from a capped row list**; saturates at 10 | `routes/status.js:297-299`; `segmentEditorService.js:1314-1323`; `views/my-work.html:1522-1523` | **OPEN-UNTRACKED** ⚠️ *flipped, 3/3 refutes* | — |
| ed-w9 | finding within a working loop | UI "Export CSV" and the disk-writing JSON export are different paths; JSON export is CLI/cron-only with no wiring | Unchanged — `grep export-terminology scripts/ .github/` → 0 | `server/scripts/export-terminology.js:1-14,56`; `architecture.md:433` | **OPEN-TRACKED** | CLAUDE.md glossary blocker (a) ⚠️ *wording tension, see notes* |
| ed-w10 | n/a — positive | assignments dashboard renders live, real data | Live `userService` reads, no placeholders | `routes/admin.js:918-931` | **CLOSED** | — |
| ed-w11 | n/a — positive | two identities, same segment → clean 200/409 with a named-actor Icelandic message | `baseEditId` token + `SEGMENT_CONFLICT` branch intact, ahead of the SR-OOS-2 backstop | `routes/segment-editor.js:340,358,475` | **CLOSED** | — |
| ed-w12 | n/a — positive | spellcheck degrades gracefully with the Greynir sidecar absent | `GREYNIR_URL` gate + `enabled:false` contract unchanged | `services/greynirEngine.js:13,77`; `routes/segment-editor.js:1170` | **CLOSED** | — |
| ed-w13 | real, narrow, non-exploitable | enforcement silently skipped for an identity with no `users` row (`if (dbUser)` fall-through) | Decided **inside** `hasChapterAccess`: denied under enforcement, legacy fail-open otherwise, with an identity-bearing warn | `middleware/requireRole.js:270-303`; `services/userService.js:606-616` | **CLOSED** | — |
| ed-w14 | n/a — positive | Pass-1 apply created the faithful file for the first time | Present + more fail-loud (existence + non-empty read-back) | `segmentEditorService.js:1028-1035` | **CLOSED** | — |
| ed-w15 | nuance / two-minute follow-up | version rows are **pre-write** snapshots — "version 1 = my first change" is backwards | Follow-up done: explicit Icelandic caption in **both** history modals | `views/segment-editor.html:1605`; `views/localization-editor.html:2065` | **CLOSED** | — |
| ed-w16 | n/a — positive | restore round trip clean both directions; `version_restored` complete | Route, activity type and write path all present | `routes/segment-editor.js:1422-1428`; `activityLog.js:22` | **CLOSED** | — |
| ed-w17 | n/a — positive | edit-again works forward-only, old row untouched | Conditional affordance intact; `unapproveEdit` still refuses once applied | `public/js/segment-editor.js:882-883` | **CLOSED** | — |
| ed-w18 | n/a — positive | rebuild affordance: `can_rebuild:true`, re-apply recreates the file | Both halves present + recursion guard added | `segmentEditorService.js:1200,880-895` | **CLOSED** | — |
| ed-w19 | robustness/observability, **explicitly not a production defect** | TM regen WARN-skips silently for `__e2e-fixture__` (`BOOK_SLUG_PATTERN` needs an alphanumeric first char); apply still reports `success:true` | Every element intact: pattern, imprecise message, warn-only branch, fire-and-forget caller | `tools/lib/parseArgs.js:23,33-36`; `services/tmService.js:53-66` | **OPEN-TRACKED** | C8 · I21-R2 (observability half); trigger sub-claim untracked but review-scoped fixture-only |
| ed-w20 | n/a — positive | Pass-2 round trip with `enforce_localization_review` ON completed cleanly | Toggle + queue-vs-direct-save branch unchanged | `localizationReviewService.js:6,54-56` | **CLOSED** | — |

### 2.5 `2026-07-11-editorial-workflow-review.md` §4 — QA §0–§5 evidence table

All **17** `OPEN-TRACKED` rows here are tracked by **A4 · Manual QA §0–§5 walk** (live campaign `:125`) and/or its E2E buildout (**PR-1b**, carve-outs at `:127`). A4 is an unsigned `[LEAD]` gate.

⚠️ **This is the audit's thinnest-covered group, and it is thin in a specific way.** These 17 rows carry a July **PASS** score that cannot be re-run — there is no durable pin behind them, so "it passed once" is the entire evidence base. Two are now known to have been *too generous*: **`ed-qa-4a` fails today** and **`ed-qa-4b` resolves against the app**. Treat the remaining PASS scores as unverified until A4 walks them.

⚠️ **Read the Evidence column here differently from every other table.** Five rows — `ed-qa-2f`, `ed-qa-3e`, `ed-qa-3f`, `ed-qa-4e`, `ed-qa-5c` — cite a `qa-checklist.md` or runbook line, i.e. **the claim's own source, not the code state**. That is a consequence of what these rows are (process/visual/prod-only gates with no code to point at), not an oversight, and the bar is lower because all five are `OPEN-TRACKED` or `UNVERIFIABLE`. But **do not read those citations as verification** — they locate the claim, they do not discharge it.

⚠️ **Enumeration gap for the A4 walk:** `ed-qa-0.3b` and `ed-qa-0.reg` appear in **neither** A4 PR-1's delivered-tag list **nor** the runbook's hand-walk list. Both were flipped by skeptics (2/3) before being downgraded here. Patch the runbook's enumeration before walking, or they will be silently skipped.

| id | Orig. | Claim | State on main | Evidence | Disposition | Register |
|---|---|---|---|---|---|---|
| ed-qa-0.1a | PARTIAL | module preview renders HTML | Now hard-pinned 200 + rendered HTML against `efnafraedi-2e/m68664` | `e2e/segment-editor.spec.js:425` | **CLOSED** | — |
| ed-qa-0.1b | PASS | traversal `track` → 400 | Standing e2e pin | `e2e/segment-editor.spec.js:439` | **CLOSED** | — |
| ed-qa-0.1c | PASS | bad `moduleId` → 400 | Standing e2e pin | `e2e/segment-editor.spec.js:447` | **CLOSED** | — |
| ed-qa-0.3a | PASS | cross-book apply as head-editor → 403 | e2e pin, review's own target adaptation documented | `e2e/rbac.spec.js:112` | **CLOSED** | — |
| ed-qa-0.3b | PASS | same-book apply as head-editor succeeds | **Unit pin only** — middleware mock asserting `next()`, not an apply. The only e2e that applies runs as `admin` | `__tests__/requireRole.test.js:56` | **OPEN-TRACKED** ⚠️ *flipped 2/3, then downgraded — see §8* | A4 §0–§5 walk |
| ed-qa-0.3c | PASS | admin bypass reaches business logic (400, not 403) | e2e pin, hermetic (ch 999 → 400 before publish) | `e2e/rbac.spec.js:134` | **CLOSED** | — |
| ed-qa-0.3d | PASS | cross-book publish as head-editor → 403 | e2e pin | `e2e/rbac.spec.js:128` | **CLOSED** | — |
| ed-qa-0.reg | PASS | full editor→approve→apply→history→restore→edit-again→rebuild round trip | ✅ **CORRECTED 2026-07-26 (adjudicated 3–0 against this run's flip).** The round trip is genuinely covered; the flip converted a documentation gap into a phantom defect. Adjudicators also refuted two supporting claims: rebuild **is** integration-covered (`segmentEditorService.test.js:1084` deletes the faithful file, re-applies, asserts the file exists), and the edit-again path is `saveSegmentEdit`'s supersede logic, not the comment at `:400` this run cited | `e2e/review-cycle.spec.js:31-234`; `__tests__/segmentEditorService.test.js:1084` | **CLOSED** | — |
| ed-qa-1b | PASS | restore reverts; fresh snapshot taken first | e2e pin incl. non-zero `snapshotVersion` | `e2e/review-cycle.spec.js:158,203` | **CLOSED** | — |
| ed-qa-1d | PASS | `version_restored` logged with who/when | e2e pin scoped to this run's version pair | `e2e/review-cycle.spec.js:212` | **CLOSED** | — |
| ed-qa-1e | PASS | cross-book restore → 403 | e2e pin | `e2e/rbac.spec.js:143` | **CLOSED** | — |
| ed-qa-1f | **SKIPPED** | restore after a divergent re-extraction | Still outstanding; no `§1f` test. ⚠️ liffraedi ch03's 2026-07-26 re-extraction may have created the first real case | `qa-checklist.md:67`; runbook Phase 2 step 9 | **OPEN-TRACKED** | A4 · runbook Phase 2 §9 |
| ed-qa-1g | N/A | git commit per apply | Deliberately not built (project decision: no git-per-apply, redundant with the 2 h backup cron) — nothing was ever built or broken | `CLAUDE.md:413`; `qa-checklist.md:68` | **NOT-A-DEFECT** — see §8 | — |
| ed-qa-2a | PASS | loc edit queues under enforcement | No walk-level pin; logic Vitest-covered | no `§2` tag in `server/e2e/` | **OPEN-TRACKED** | A4 · PR-1b carve-out (b) |
| ed-qa-2b | PASS | self-approval permitted; plain-editor blocked | Half indirectly pinned (`rbac.spec`); self-approval half not | no `§2b` tag | **OPEN-TRACKED** | A4 · PR-1b (b) |
| ed-qa-2c | PASS | head-editor approval writes the live localized file | Write path Vitest-covered; no walk pin | no `§2c` tag | **OPEN-TRACKED** | A4 · PR-1b (b) |
| ed-qa-2f | **PARTIAL** | unified queue view merging Pass 1 + Pass 2 | Unchanged — nothing has merged the two endpoints into one screen | `qa-checklist.md:84` | **OPEN-TRACKED** | A4 · runbook Phase 2 §10 |
| ed-qa-3a | PASS | enforcement OFF: unassigned editor allowed | No walk pin | no `§3` tag | **OPEN-TRACKED** | A4 · PR-1b (b) |
| ed-qa-3b | PASS (with a live methodology correction) | enforcement ON: unassigned editor blocked | No walk pin. ⚠️ Its live PASS came only after a **false negative** on the first attempt — PR-1b must encode the WRITE route explicitly | no `§3b` tag | **OPEN-TRACKED** | A4 · PR-1b (b) |
| ed-qa-3c | **SKIPPED** | assigned editor succeeds | Skipped for the exact seeding gap PR-1b fills | no `§3c` tag | **OPEN-TRACKED** | A4 · PR-1b (b) |
| ed-qa-3d | PASS | head-editor/admin bypass enforcement | No walk pin; risk direction is lockout, not a hole | no `§3d` tag | **OPEN-TRACKED** | A4 · PR-1b (b) |
| ed-qa-3e | **SKIPPED** | assignment table missing → fail-closed 503 | Unit test already exercises the branch; weakest walk candidate | `qa-checklist.md:93` | **OPEN-TRACKED** | A4 (consider formally retiring to unit coverage) |
| ed-qa-3f | PASS | assignments dashboard renders per-book grid + progress | Visual row. ⚠️ More load-bearing now — PR #324 added appendix rows, #325 touched unassign | `qa-checklist.md:94` | **OPEN-TRACKED** | A4 · runbook Phase 2 §10 |
| ed-qa-4a | PASS | task header shows human title, not raw module id | **⚠️ The PASS was too generous** — `task.section` IS `module_id`, so the header renders `mNNNNN`. If walked today it **FAILS** | `views/my-work.html:1249`; `routes/my-work.js:112,227` | **OPEN-TRACKED** | A4 · PR-1 carve-out (a) |
| ed-qa-4b | **PARTIAL** | editor-facing URLs carry no pipeline/stage jargon | Resolvable without a walk, and it resolves **against** the app: organic click-through yields `/segment-editor?…&module=mNNNNN&stage=` | `routes/my-work.js:51-59`; `views/my-work.html:1261` | **OPEN-TRACKED** | A4 · PR-1 carve-out (a) |
| ed-qa-4c | PASS | 8-stage pipeline view + tracks hidden from editor | e2e pin **both directions** (hidden for editor, visible for head-editor) | `e2e/a4-coverage.spec.js:167,179` | **CLOSED** | — |
| ed-qa-4d | PASS | two editors, same segment, second save → 409 | Unit pin on the segment editor (the row's subject). ⚠️ runbook "Quick map" wrongly lists §4d as automated | `__tests__/segmentEditConflict.test.js:63` | **CLOSED** | — |
| ed-qa-4e | PASS (informal) | no untranslated CAT jargon on editor screens | Irreducibly judgment; unchanged | `qa-checklist.md:104` | **OPEN-TRACKED** | A4 · runbook Phase 2 §10 |
| ed-qa-5a | PASS | anon `/admin` → redirect, no flash | e2e pin asserts the 302 body carries no admin markup — a transport-level proof | `e2e/a4-coverage.spec.js:113` | **CLOSED** | — |
| ed-qa-5b | PASS | state-changing request with no session → rejected | e2e pin (accepts 401/403) | `e2e/rbac.spec.js:151` | **CLOSED** | — |
| ed-qa-5c | **PROD-ONLY** *(label is wrong — see below)* | boot with a deliberately broken legacy migration | ⚠️ **CORRECTED 2026-07-26 (adjudicated 2–1, third vote `both-wrong`). The "PROD-ONLY / destructive" premise is FALSE and BOTH runs inherited it from the source review without checking.** `resolveDbPath()` honours `SESSIONS_DB_PATH`, `runAllMigrations` creates a fresh DB when the file is absent, and ~30 existing tests already do exactly this in `os.tmpdir()`. The runbook line both runs quoted says *"on a throwaway box / disposable DB copy — never prod data."* **§5c is walkable locally today.** The mechanism also exists and is unit-tested (`migrationRunner.js:88-106` + `failLoudOnMigrationErrors` at `:148`); what is outstanding is only the walk | `server/lib/dbPath.js`; `migrationRunner.js:27-30,88-106,148`; `__tests__/migrationIdempotency.test.js:23-44` | **OPEN-TRACKED** | A4 — ⚠️ **move off the prod-only list (3 → 2)** |
| **ed-qa-U1** | UNDETERMINED | whether `GREYNIR_URL` is actually set in production | ⚠️ **ROW ADDED 2026-07-26** — surfaced by Run B's critic. Named in committed prose (editorial §2 ¶1; joint summary §4) so it is **recoverable, not unrecoverable**, but this run gave it no row and so left it out of every count and the exclusion list | editorial review `:43`; joint summary §4 | **UNVERIFIABLE** | A4 (prod config) |
| **ed-qa-U2** | UNDETERMINED | whether a reader sees a correctly-assembled "mixed" chapter page when only some modules are promoted past mt-preview | ⚠️ **ROW ADDED 2026-07-26** — same origin. The assembly logic lives in **namsbokasafn-vefur**, so it is unverifiable from this repo by construction | editorial review `:43`; joint summary §4 | **UNVERIFIABLE** | step-4 vefur companion |
| ed-qa-5d | PASS (by lived experience) | smoke test after housekeeping; suites explicitly NOT re-run | ✅ **CORRECTED 2026-07-26 (adjudicated 3–0).** This run labelled the row open while quoting only evidence of closure. `qa-checklist.md:117` already marks it **`✅ auto 2026-06-22`** (Vitest green, server boots, `/api/health` ok) — closed *before* the A4 buildout; the console sweep is supplementary, not the closer | `qa-checklist.md:117`; supplementary `e2e/a4-coverage.spec.js:137` | **CLOSED** | — |

### 2.6 `2026-07-11-editorial-workflow-review.md` §5 — practice benchmark (8 dimensions)

Summarised here; re-scored in §5.

| id | Orig. verdict | Code-side state | Evidence (current) | Disposition | Register |
|---|---|---|---|---|---|
| ed-dim-1 | **RISK** | all 3 authz findings + bug (a) closed | `routes/pipeline.js:69,120,170`; `routes/sections.js:92,175,429,501,302-306`; `routes/segment-editor.js:842`; `migrations/039-segment-edit-exit-path.js:1-27`; `segmentEditorService.js:536-543` | **CLOSED** (code side) | — |
| ed-dim-2 | GAP | mechanism + silent-failure path unchanged; TMX still 1 book | `services/tmService.js:53-66`; `books/efnafraedi-2e/tm/` (1 TMX, 3 TUs) | **OPEN-TRACKED** | C8 · I21-R2; C3 · I20-R1 |
| ed-dim-3 | GAP | export script has zero callers; `terminology.md` unchanged | `server/scripts/export-terminology.js:1-14,56`; `docs/editorial/terminology.md:220` | **OPEN-TRACKED** | CLAUDE.md glossary blocker (a) |
| ed-dim-4 | **SOUND** | the one caveat (client-only marker gate) closed by a **server-side** backstop | `routes/segment-editor.js:400-412`; `routes/localization-editor.js:367,566`; client half `public/js/segment-validation.js:27` | **CLOSED** | — |
| ed-dim-5 | GAP | #28 + #8 closed; submit-gated SLA queue residual | `routes/status.js:297-299` (F28 deletion); `segmentEditorService.js:659` (queue still `module_reviews`-only) | **OPEN-TRACKED** ⚠️ *downgraded, partial — §8* | item 23 · A5 · L7 |
| ed-dim-6 | GAP | all 4 defects closed (#12, #21, version nuance, apply attribution) | `views/books.html:2805-2825` (+ call sites `:2106`,`:2532`); `routes/activity.js:25,32`; `activityLog.js:160-205`; `views/segment-editor.html:1605`; `routes/segment-editor.js:1325-1330` | **CLOSED** | — |
| ed-dim-7 | **RISK** | the 3 CONFIRMED defects closed — ⚠️ **but a refutation under this dimension reopened** (`code-ref-3`) | `routes/segment-editor.js:1304-1323`; `localizationReviewService.js:236-265`; `contentVersionService.js:112-131` | **CLOSED — carve-out, see below** | `code-ref-3` → **P1** |
| ed-dim-8 | **RISK** | documentation corpus unchanged in all four named places | `master-pipeline.md:3`; `mt-process.md:31-33`; `.claude/skills/workflow-status.md:13`; `.claude/skills/review-protocol.md:19` | **OPEN-TRACKED** ⚠️ *downgraded — §8* | item 23 · Batch 3 |

> ⚠️ **`ed-dim-7` is a partial closure and must not be consumed as a whole-dimension suppression.** The three CONFIRMED defects the July RISK verdict rested on are genuinely closed, but `code-ref-3` — a *refuted* finding under this same dimension — has been **reopened by this audit** and is resurrect candidate #1. A future reviewer suppressing "dimension 7" wholesale would suppress `code-ref-3`'s neighbourhood with it. §7 encodes this as an explicit exception row, not a footnote.

### 2.7 `2026-07-11-editorial-workflow-review.md` §6 — ranked recommendations

| id | Rank | Recommendation | State | Evidence (current) | Disposition | Register |
|---|---|---|---|---|---|---|
| ed-rec-1 | **1 of 6** — "cheapest fix, widest blast radius" | fix the documentation corpus's authority problem | All four sub-claims hold verbatim; none of the four files touched since the review | `master-pipeline.md:3`; `.claude/skills/review-protocol.md:19`; `docs/editorial/terminology.md:220`; `CLAUDE.md:266` vs `package.json` scripts | **OPEN-TRACKED** | P3 · item 23 · Batch 3 |
| ed-rec-2 | 2 of 6 | close book-scoping gaps on `pipeline.js` + `sections.js` | All 3 findings closed, each with a commit naming the finding number | `routes/pipeline.js:69` (also `:120`,`:170`); `routes/sections.js:92,175,429,501,302-306` | **CLOSED** | — |
| ed-rec-3 | 3 of 6 | give `discuss`/`rejected` a resolution path | Both the minimum and the fuller fix shipped; root cause removed at schema level | `migrations/039-segment-edit-exit-path.js:101-104`; `segmentEditorService.js:536-572,129-142`; `routes/segment-editor.js:840-862` | **CLOSED** | — |
| ed-rec-4 | 4 of 6 | decide the submit button's fate on purpose | Nothing decided; every element of the hybrid state intact | `views/segment-editor.html:1402`; `public/js/segment-editor.js:1545`; `segmentEditorService.js:659` | **OPEN-TRACKED** | item 23 · A5 · L7 `[decision-gated]` |
| ed-rec-5 | 5 of 6 | harden the audit-trail write path before its read-side views | Both halves fixed, first now **statically enforced** by a call-site tripwire | `activityLog.js:195-202`; `__tests__/activityLogCallsiteGuard.test.js:29-63`; `segmentEditorService.js:1014-1025` | **CLOSED** | — |
| ed-rec-6 | 6 of 6 | two-minute check on version-numbering in the restore modal | Check performed, resolved against the modal, one-line copy fix shipped to **both** modals | `views/segment-editor.html:1605`; `views/localization-editor.html:2065` | **CLOSED** | — |

---

## 3. Resurrect list

The 8 `OPEN-UNTRACKED` items, ranked by **original severity**, each with a proposed home in the live campaign's tiers. This is the section to act on.

### P1 — correctness

**R1 · `code-ref-3` — apply writes the faithful file inside a DB transaction that can still roll back.**
*Original: Medium, PLAUSIBLE (integrity) — refuted on the review's own second pass.*
The refutation's load-bearing leg (b) — *"the only failures that can happen after a successful write are verification checks that fire when the write already failed"* — was true at the 2026-07-11 baseline and is **false today**. Item-20b (`79238056`) inserted `acceptanceService.lapseDrifted` + `stampApplied` between the file write (`segmentEditorService.js:1028`) and `applyTransaction.immediate()` (`:1090`); both mutate `segment_acceptances` on the same connection and throw for reasons unrelated to the write. Legs (a)/(c)/(d) still hold — atomic tmp+rename, timestamped `.bak`, `applied_at` retry gate — so **the residue is file/DB divergence, not corruption**: a deterministic throw in step 7 leaves the faithful file advanced with no `content_versions` snapshot (the step-4b snapshot rolls back with the transaction) and the editor reporting the edits unapplied on every retry.
→ **Proposed:** P1, alongside C6 (MTA edges), since the widening code is item-20b's. Cheapest correct shape is to move the file write after the acceptance work, or to compensate on rollback. **Do not simply re-refute it** — the July refutation is a statement about code that no longer exists.

**R2 · `ed-drift-2b` — `tmCreated` is an orphaned pipeline stage that silently blocks DB-side stage advancement.**
*Original: unrated — a trailing clause of Headline drift 2. ⚠️ This audit escalates it.*
Nothing advances `tmCreated`: the six `advanceChapterStatus` call sites cover extraction, mtReady, mtOutput, injection, rendering, linguisticReview. The review called it "an orphaned field in the schema." The verified consequence is larger: `pipelineStatusService.transitionStage:161-172` enforces a sequential prerequisite, `BASE_STAGES[4]` is `tmCreated` and `[5]` is `injection`, so **every `advanceChapterStatus(…, 'injection')` throws** and `pipelineService.js:735-746` swallows it as a log line. The project's own test suite has to hand-complete `tmCreated` in a loop before it can complete injection (`__tests__/pipelineStatus.test.js:105-117`). The one code path that references promoting it (`bookRegistration.scanAndUpdateStatus`) keys on `tm/chNN/<section>.tmx`, a layout `generate-tm.js` does not produce — so it can only ever demote.
→ **Proposed:** P1. Either wire an advance from the TM path or drop `tmCreated` from `BASE_STAGES`. Rider for item 23: the schema description at `:70` still names the retired "Matecat Align".

### P2 — hardening

~~**R3 · `ed-w6b`**~~ ❌ **WITHDRAWN 2026-07-26 — FALSE POSITIVE.** Two independent verifiers (2/2, high confidence) found the asserted defect **not present**: migration 039 removed the constraint that produced the raw message. **Do not implement.** Detail in the §1 table row and §2.4. *(The original recommendation text is preserved below, struck, only so the withdrawal is legible.)*

~~
*Original: real, head-editor-facing (the delivery half of Bug (a), which drove rec #3, ranked 3 of 6).*
The specific reproduction is dead — migration 039's partial index removed the collision — but the mechanism the review named is untouched: `markForDiscussion` (`segmentEditorService.js:463-482`) has no try/catch, its route returns `{ error: err.message }` (`routes/segment-editor.js:804`), and the client does `alert(UI.common.errorPrefix + err.message)` (`public/js/segment-editor.js:1507`). Any future `SqliteError` in that function lands on a head-editor's screen as raw SQL. Notably the codebase *did* fix this per-path for the two designed refusals (`PENDING_EXISTS` → 409 with Icelandic text), which shows the treatment was applied case-by-case rather than generically.
→ ~~**Proposed:** P2 (C5/C6 neighbourhood).~~ **Withdrawn — do not implement.**

**R4 · `ed-w8` — the `blockedIssues` attention tile is a count derived from a capped row list.**
*Original: n/a — a positive confirmation, now partly falsified.*
`routes/status.js:297-299` sets `blockedIssues = getDiscussEdits(10).length`, and `getDiscussEdits` (`segmentEditorService.js:1314-1323`) is `SELECT … WHERE status='discuss' … LIMIT ?`. `views/my-work.html:1522-1523` renders that length as a bare stat and `:1515` folds it into `totalIssues`. With ≥11 discuss rows the tile permanently reads 10. The walkthrough's "no discrepancy" held only because the fixture had a handful of rows. Separately, `overdueCount` — a second quarter of this row — is **`SUPERSEDED`**, deliberately deleted by F28 (`ab64c471`) and absence-pinned.
→ **Proposed:** P2. One-line fix (`COUNT(*)` instead of `.length`). Nearest register line, I16-R5, covers `needsAttention.items[]` fields, not the counts.

### P3 — polish / documentation

**R5 · `ed-drift-1a` — the `dashboardReadModel` read-side fix is documented nowhere.**
*Original: unrated (Headline drift 1a).* `grep dashboardReadModel` → 0 in `CLAUDE.md`, `README.md`, `server/README.md`. `docs/technical/view-route-contracts.md` (created 2026-07-18) names the module but documents field contracts, not the workflow fact. Consequence stands verbatim: a new head-editor reading only `CLAUDE.md` could re-propose or re-build a fix that already exists.
→ **Proposed:** P3, **absorb into item 23**. One paragraph in CLAUDE.md's Server Features block; no code. ⚠️ Note the *direction*: item 23 as enumerated is "retire/relabel stale docs" (docs-ahead); this is **code-ahead** — executing item 23 to its literal enumeration will not produce this paragraph.

**R6 · `ed-drift-e` — publication status is richer than any document describes.**
*Original: unrated (CODE-AHEAD).* Nested `publicationStatus` schema (`schemas/chapter-status.schema.json:134-149`) plus a fully independent filesystem-scan read path (`publicationService.js:308-343`, with `activeTrack` derived purely from scans, never from stored status) — while `CLAUDE.md:278` describes one flat stage and `master-pipeline.md:515-520` three top-level flags. C1a touched this function for appendices without changing the scan design, so the condition is unchanged, not superseded.
→ **Proposed:** P3, absorb into item 23 as a **code-ahead** rider.

**R7 · `ed-drift-d` — the 2026-05-10 Open Question 1 was answered in code and never back-annotated.**
*Original: unrated (CODE-AHEAD).* ⚠️ **Claim narrowed by this audit.** The review's flat *"no document states this resolution"* is too strong today — `docs/plans/2026-07-11-authz-book-scope-sweep-design.md:33`, `2026-06-10-remediation-roadmap.md:42` and `2026-06-10-qa-checklist.md:50` all state the admin-bypass mechanism. The genuine residual is only that `docs/audit/2026-05-10-editorial-workflow-audit.md:277` still poses the question as open (the file has one commit, never amended). Doc hygiene, not behaviour.
→ **Proposed:** P3, absorb into item 23. One back-annotation line.

**R8 · `ed-w1` — the "Today" empty state can't distinguish never-assigned from cleared-queue.**
*Original: minor, explicitly "not a functional bug".* `views/my-work.html:1123-1131`: the only input is a zero/non-zero task count, so both editors get `'Engin verkefni í dag – vel gert!'`.
→ **Proposed:** P3, bundle with the §4a/§4b my-work UX item already logged as A4 PR-1 carve-out (a) — same file, same surface, same walk.

### ⚠️ Tracked-but-thin — flagged, not resurrected

Three items are `OPEN-TRACKED` only because a **decision gate** nominally covers them. If L7 is resolved narrowly ("relabel the button"), these survive unaddressed and should be re-checked:

- `ed-w4` / `ed-dim-5` — the structured SLA queue stays submit-gated, so **unsubmitted work has no SLA age at all** (`routes/segment-editor.js:693-699` keys entirely off `submitted_at`). No register line states this consequence; L7's scope should say so explicitly.
- `ed-drift-2` / `ed-drift-3(skill)` — `mt-process.md` and the **auto-triggering** `workflow-status.md` skill are covered by item 23 only via its "Editorial §2 drift catalog" provenance, **not named in the Batch 3 scope cell**. A triager working from the register text alone will miss both.
- `ed-w9` — CLAUDE.md's glossary blocker (a) says *"nothing bridges the terminology DB → `glossary-unified.json`"*. That wording is **overstated**: the bridge script exists (`server/scripts/export-terminology.js:54`); what is missing is anything that **runs** it. Same operational consequence, wrong premise — do not inherit "no bridge exists."

---

## 4. Batch roll-up

### Joint-summary batches 1–9 (the lead's actual triage order)

| # | Batch | Draws from | Closed | Status |
|---|---|---|---|---:|
| 1 | Book-scoped authorization sweep | Code Batch A + ed dim 1 / rec #2 | **100%** (5/5) | ✅ Shipped PR #268. Both High findings closed; upload route retired. *Residual outside the batch's named scope:* non-elevated `sections.js` status transitions (C5 · B1-F2) and `GET /jobs` reads (C5 · B1-F5 / #328). |
| 2 | `discuss`/`rejected` states + dropped messages | ed §3 bug (a) / rec #3 + code 14, 24 | **100%** (5/5) | ✅ PR #270 + migration 039. Root cause removed at schema level. *(Was 80% pending `ed-w6b`; that finding was **withdrawn as a false positive** on 2026-07-26, so the batch is complete.)* |
| 3 | **Documentation authority triage** | ed §2 drift catalog + rec #1, #4 | **0%** (0/13) | ❌ **Untouched.** Not one of the four named files has been edited since the review; `master-pipeline.md` (2026-03-02), `review-protocol.md` (2026-01-18, **auto-triggers**), `terminology.md`, `update-status`. Item 23, P3, half decision-gated on L7. The review ranked this **rec #1 of 6**. |
| 4 | Fail-loud sweep | Code Batch E (20,21,22,37) + ed rec #5 | **100%** (5/5) | ✅ PR #271. Stronger than prescribed — a static call-site tripwire now bans the idiom repo-wide. |
| 5 | Apply, job-model & version-history integrity | Code Batches B+C (3,5,6,15,16,19) + ed dim 7 | **100%** (7/7) | ✅ PR #298 (item 12). ⚠️ See `code-ref-3` — a *refuted* sibling in this area reopened because item-20b widened the post-write window. |
| 6 | Concurrent-edit lost updates | Code Batch D (7,8) + ed dim 5/7 | **100%** (2/2 named) | ✅ PR #299 (item 13). Delivered stronger than any of the three options offered (query predicate **and** partial unique index; losers superseded, not clobbered). |
| 7 | Dashboard/view contract repair | Code Batch F (12 findings) + ed dim 5/6 | **92%** (11/12) | ✅ PRs #303/#304 (item 16). ⚠️ **`code-10` open** — the review-tab picker still calls a nonexistent route; deliberately decision-gated on the suggestions-family keep-vs-retire call (C5 · B1-F1). |
| 8 | Appendices label unification | Code Batch G (17, 23) | **100%** (3/3) | ✅ PR #300 (item 14) — note this predates the C1 appendix batch by three days; C1 did not cause these closures. Write-path publish remains C1d. |
| 9 | **Dependency & dead-code hygiene** | Code Batch H (9,32,33,34,35,36) | **0%** (0/6) | ❌ **Untouched.** Item 22, P3. The joint summary told the lead to fix **#9 first within the batch** — *"it can fail a clean install anytime"* — and that annotation is gone from the register. See headline. |

### Code-review batches A–H

| Batch | Findings | Closed | Status |
|---|---|---:|---|
| A — Book-scoped authz sweep ("ship first, ship alone") | 1, 2, 4 (+ SA-11 rider) | **100%** | ✅ SA-11 rider also closed — `books.js:548` now `requireHeadEditor('bookId')`. |
| B — Apply & version-history integrity | 3, 15, 16, 19 | **100%** | ✅ Fix for 15 diverged *upward*: ranks by `(created_at, id)`, not the requested `reviewed_at + id`. |
| C — Pipeline job model & confirmation parity | 5, 6, 14 | **100%** | ✅ The `book` field fix also removed the cross-book false positive that worsened #6, as the batch predicted. |
| D — Editor save-path concurrency | 7, 8, 24 | **100%** | ✅ #24 needed two passes — the first fix was dead code (swallowed by its own `.catch`), caught by adversarial verification; the two-arg `.then` is load-bearing. |
| E — Fail-loud sweep | 20, 21, 22, 37 | **100%** | ✅ #37 closed within a day of the review (`0912b32f`), ahead of the batch. |
| F — Dashboard & view contract repair | 10, 11, 12, 13, 18, 25–31 | **92%** (11/12) | ⚠️ #10 open (C5 · B1-F1). Five of the twelve were fixed by **deletion** under explicit lead decisions (F25/F28/F29/F30), so those capabilities no longer exist. |
| G — Appendices chapter handling | 17, 23 | **100%** | ✅ Both call sites now use `lib/chapterLabel.js`. Minor consolidation nits remain (`listChapters`, the backfill's inline ternary) — behaviourally correct. |
| H — **Dependency & dead-code hygiene** | 9, 32, 33, 34, 35, 36 | **0%** | ❌ Untouched. ⚠️ Batch-9 executor notes in §7. |

---

## 5. Practice-benchmark delta

The review scored 8 dimensions: **1 SOUND / 4 GAP / 3 RISK**. Re-scoring is only partly legitimate from a code read — every dimension is tagged MIXED (LIVE + CODE-READ), and the LIVE half is exactly what **A4** exists to walk. I re-score the code-side only, and say so.

| # | Dimension | Orig. | Code-side today | Verdict re-scorable? |
|---|---|---|---|---|
| 1 | Review states & four-eyes integrity | **RISK** | **All underpinning defects closed** — 2 High + 1 Medium authz + bug (a). Three independent exits now leave `discuss`/`rejected` | ❌ **Not re-scorable without A4.** The RISK also rested on live reproduction. Code-side: clean. |
| 2 | TM lifecycle | **GAP** | **Unchanged.** Validator, imprecise message, warn-only branch and fire-and-forget caller all intact; still exactly one TMX repo-wide; `git-backup.sh` still stages no `tm/` | ❌ Not re-scorable without A4 — but **nothing improved**, and the register already carries both halves (C8 · I21-R2, C3 · I20-R1). |
| 3 | Terminology governance loop | **GAP** | **Unchanged.** `export-terminology.js` still has zero callers anywhere; on-disk exports still dated March; `terminology.md`'s "authoritative CSV" claim verbatim | ❌ Not re-scorable without A4. Human half was a live positive. |
| 4 | QA gates | **SOUND** | **Improved.** The one caveat — the structural-marker gate being client-side only — is closed: `validateStructure` now runs server-side on the save path and blocks with 400, on an independently loaded baseline | ⚠️ Code-side **SOUND holds and strengthened**. The live half (Greynir degradation against a real deployment) is A4's. |
| 5 | Reviewer/editor throughput ergonomics | **GAP** | **Partly improved.** #28 removed, #8 fixed. **Residual intact:** the SLA queue is still submit-gated and SLA age keys off `submitted_at`, so unsubmitted work has no age | ❌ Not re-scorable without A4. Residual is L7-gated. |
| 6 | Traceability & audit trail | **GAP** | **All four defects closed** — #12 (both halves), #21 (now statically enforced), the version-numbering nuance, and rec #5's apply attribution | ❌ Not re-scorable without A4 (the anchor was a live positive). Code-side: clean. |
| 7 | Rollback & recovery safety | **RISK** | **All 3 CONFIRMED defects closed** (#6, #3, #19). ⚠️ **But a refutation recorded under this same dimension has reopened** — `code-ref-3`; item-20b widened the post-write failure window the refutation dismissed as negligible | ❌ Not re-scorable without A4 — and **do not read this dimension as fully clear**: R1 lives here. |
| 8 | Onboarding load | **RISK** | **Unchanged in every named place.** `review-protocol.md` (the review's "most consequential", auto-triggering) untouched since 2026-01-18; `master-pipeline.md` since 2026-03-02; `terminology.md` unchanged; `npm run update-status` still absent. The two closed halves are bug (a) and #14 | ❌ Not re-scorable without A4 — but the documentation half is **wholly unimproved**. This is joint batch 3 = 0%. |

**Net:** every dimension whose gap was *code* has closed or improved (1, 4, 6, 7 — with R1's caveat on 7). Every dimension whose gap was *documentation or process* is exactly where it was on 2026-07-11 (2, 3, 5, 8). That split is the audit's clearest signal: **the campaign shipped code and did not ship docs.**

---

## 6. Unrecoverable — a permanent evidence gap

The editorial review's closing note states its working artifacts — *"documented-workflow model, drift catalog, walkthrough log, QA evidence, practice-benchmark synthesis"* — **"were session-scoped working files, not committed separately."**

Its §2 tallies **68 cross-walked claims**:

| Category | Count | Committed in prose | Counted only |
|---|---:|---:|---:|
| MATCH | 45 | a handful, in passing | ~45 |
| **DOCS-AHEAD** | **11** | 7 | **4** |
| **CODE-AHEAD** | **9** | 2 | **7** |
| **DRIFT** | **1** | 1 | 0 |
| **UNDETERMINED** | **2** | 2 (named in joint summary §4) | 0 |
| **Non-MATCH total** | **23** | **12** | **11** |

Of the 23 non-MATCH rows, **12 are narrated** in committed prose (7 DOCS-AHEAD + 2 CODE-AHEAD + 1 DRIFT + 2 UNDETERMINED) and the remaining **11 exist only as a count.** Those 11 are hereby recorded as **`UNRECOVERABLE`**.

> ⚠️ **This table was itself wrong in the first draft**, which asserted "~10 narrated / ~13 counted-only" — the inverse of what its own columns summed to — and propagated the bad figure into §1. Corrected against the review's own tally line (`2026-07-11-editorial-workflow-review.md:43` — 45/11/9/1/2) and against §2.3, which narrates exactly 7 DOCS-AHEAD and 2 CODE-AHEAD rows. **A section whose whole point is "a count is not evidence" published its own count two incompatible ways.** Caught by the completeness critic, not by the synthesis pass.

**They must never be reported as MATCH, as closed, or as absent.** An uncheckable claim reported as fine is the same class of error this audit exists to catch. Any future review that cross-walks docs against code will re-derive some of them; that is expected and is not duplication.

**This is itself a second instance of the evaporation pattern the audit was created to detect** — and it is worse than the register case, because the register case is recoverable by reading the source documents while this one is not recoverable at all. The 45 MATCH rows are the least costly loss (a MATCH means doc and code agreed); the **11 lost DOCS-AHEAD/CODE-AHEAD rows are real drift that nobody can now name.**

**Standing lesson, for the next review's ground rules:** a review that tallies claims in a working file must commit the tally's *rows*, not just its *counts*. A count is not evidence. Where a review must compress, it should commit the full row list as an appendix table even if each row is one line.

**This audit applies its own lesson.** The evidence substrate for all 128 rows — every quoted excerpt and all 180 skeptic verdicts — is committed as [`2026-07-26-closure-audit-evidence.md`](2026-07-26-closure-audit-evidence.md). The first draft did **not** do this: it pointed at a "fan-out record" that was a session-scoped working file, exactly the pattern condemned two paragraphs above. That the audit reproduced the very defect it was auditing, and that only an independent critic pass caught it, is the strongest available evidence for the standing lesson — and for keeping a completeness critic in every future review's method.

The 2 `UNDETERMINED` rows *are* recoverable and remain open, both because the fact lives outside this repo: whether `GREYNIR_URL` is actually set in production, and whether a reader sees a correctly-assembled "mixed" chapter page when only some modules are promoted past mt-preview (that assembly lives in namsbokasafn-vefur). Both belong to **A4** and to step 4's vefur companion.

---

## 7. Exclusion list

For the diff-scoped review (step 4). **Do not re-report any of these as new.** Cross-reference this ledger instead, per the original review's ground rule #3.

### Closed — do not re-report (69)

```
CLOSED (66)
  code review:  1  2  3  4  5  6  7  8  11  12  12b  13  14  15  16  17a  17b
                18  19  20  21  22  23  24  25  26  27  28  29  30  31  37
  editorial §3: ed-w2  ed-w5  ed-w6a  ed-w10  ed-w11  ed-w12  ed-w13  ed-w14
                ed-w15  ed-w16  ed-w17  ed-w18  ed-w20
  editorial §4: ed-qa-0.1a  ed-qa-0.1b  ed-qa-0.1c  ed-qa-0.3a  ed-qa-0.3c
                ed-qa-0.3d  ed-qa-1b  ed-qa-1d  ed-qa-1e  ed-qa-4c
                ed-qa-4d  ed-qa-5a  ed-qa-5b
  editorial §5: ed-dim-1  ed-dim-4  ed-dim-6
  editorial §6: ed-rec-2  ed-rec-3  ed-rec-5  ed-rec-6

CLOSED-BY-REFUTATION (3) — refutation re-confirmed against current code
  code-ref-1 (publicationService fallback)
  code-ref-2 (books.js import DB-registration)   [secondary leg drifted, core holds]
  code-ref-4 (pre-apply snapshot logging)

WITHDRAWN (1) — asserted by this audit, then killed on blind re-verification
  ed-w6b       (raw SQLite error via alert(); migration 039 removed the constraint.
                Do NOT resurrect: 2/2 independent verifiers, high confidence.)

NOT-A-DEFECT (2) — never a defect; do not re-report, do not treat as closed work
  ed-drift-3b  (review's own explicit MATCH — scheduleTmRegen agrees with docs)
  ed-qa-1g     (git-per-apply deliberately never built)
```

⚠️ **`ed-dim-7` is deliberately NOT on the closed list.** Its three CONFIRMED defects are closed, but the dimension also carries `code-ref-3`, which this audit **reopened** (resurrect candidate R1). Suppressing "dimension 7" as a unit would suppress R1's neighbourhood. Treat `ed-dim-7` as **partially closed** and consult §2.6 before excluding anything under it. *(The first draft placed it inside this code fence behind an asterisked footnote — not a machine-readable carve-out for a list designed to be consumed as suppression input.)*

### Open and tracked — cross-reference, do not re-report (48)

```
item 22 · Batch 9 (P3):     code-9  code-32  code-33  code-34  code-35  code-36
item 23 · Batch 3 (P3):     ed-drift-1  ed-drift-2  ed-drift-3(skill)  ed-drift-4
                            ed-drift-2a  ed-drift-3  ed-drift-a  ed-drift-b
                            ed-drift-c  ed-drift-f  ed-w7  ed-dim-8  ed-rec-1
item 23 · A5 · L7 [gated]:  ed-drift-1b  ed-drift-1c  ed-w3  ed-w4  ed-dim-5  ed-rec-4
C5 · B1-F1 / I16-R1:        code-10
C3 · I20-R1 / C8 · I21-R2:  ed-drift-3a  ed-w19  ed-dim-2
CLAUDE.md glossary (a):     ed-w9  ed-dim-3
A4 · Manual QA §0–§5 (17):  ed-qa-0.3b  ed-qa-0.reg  ed-qa-1f  ed-qa-2a  ed-qa-2b
                            ed-qa-2c  ed-qa-2f  ed-qa-3a  ed-qa-3b  ed-qa-3c
                            ed-qa-3d  ed-qa-3e  ed-qa-3f  ed-qa-4a  ed-qa-4b
                            ed-qa-4e  ed-qa-5d
UNVERIFIABLE (prod-only):   ed-qa-5c
```

⚠️ **The 17 A4 rows are tracked but NOT verified.** Each carries a July PASS that no durable pin can re-run; two (`ed-qa-4a`, `ed-qa-4b`) are already known to have been scored too generously. "Tracked" here means *someone owns walking it*, not *it works*. Do not read this block as closed work.

### Open and UNTRACKED — these MAY be re-reported, or better, resurrected from §3 (7)

```
code-ref-3   ed-drift-2b   ed-w8
ed-drift-1a  ed-drift-e  ed-drift-d  ed-w1
```

### Executor notes a future reviewer must not trip over

- **`code-9`:** `grep glob server/package.json` returns a hit (`overrides`), but glob is still undeclared and uninstalled in the server tree. `e4ac93bc` is **not** a fix.
- **`code-1`:** the blanket `router.use(requireAuth, requireRole(HEAD_EDITOR))` is still at `routes/pipeline.js:30`. That is **not** evidence the finding is open — per-route scoping was *added*, not substituted.
- **`code-5`:** `pipelineService.js:439` is now an unrelated JSDoc. The finding's subject moved to `:469`.
- **`code-33`:** the four dead type constants' string values survive in the live `NOTIFICATION_CATEGORIES.assignments` list, which an editor can toggle today. Check prod `notifications.type` rows before deleting, and resolve **B1-F9** (off-enum types written inline by `sections.js`) in the same pass.
- **`code-36`:** `tools/validate-pipeline-consistency.js` skips `decisions.json` by name **twice** (`:37`, `:226`); deleting the file makes both removable.
- **`ed-qa-4d`:** the A4 runbook's "Quick map" wrongly lists §4d among PR-1's automated rows. Prefer the per-row line.
- **`ed-qa-5c`:** expected behaviour changed — PR #212 made migration failure a deliberate hard exit. Score against shipped policy, not the 2026-06-10 phrasing.
- **Register drift found in passing:** `MEMORY.md:44` still asserts *"`analyticsService.js` opens DB eagerly at module load (test hazard)"*. That is **false on main** since `12dcdb7c`.

---

## 8. Reconciliation — contradictions and synthesis corrections

Per the design's §9, I re-checked every raw `OPEN-UNTRACKED` against all four register sources myself. **Eight were downgraded.** Five of those were genuine **contradictions between verifiers**, recorded here rather than silently resolved.

| id | Raw | Audited | Why |
|---|---|---|---|
| `ed-w3` | OPEN-UNTRACKED | **OPEN-TRACKED** | ⚠️ **Contradiction.** `ed-drift-1c` dispositions the *identical* claim (submit button live + unconditional) as OPEN-TRACKED against item 23 / A5 · L7, quoting `campaign:112` and `:128`. `ed-rec-4` agrees. Three verifiers found the register line; one did not. Verified myself: `item 23 · Batch 3 — docs authority triage + Submit-button (the Submit-button half is [decision-gated] on L7)`. |
| `ed-w7` | OPEN-UNTRACKED | **OPEN-TRACKED** | ⚠️ **Contradiction.** `ed-drift-f` is the same claim (terminology report "on submit" vs module-open) and cites item 23 · Batch 3. Same doc-correction operation; tracked. |
| `ed-dim-8` | OPEN-UNTRACKED | **OPEN-TRACKED** | ⚠️ **Contradiction.** `ed-rec-1` covers the same four documents and found item 23 · Batch 3 with the enumeration in the joint-summary Batch 3 row. `ed-dim-8`'s verifier searched by keyword only; the register compresses the whole recommendation to eight words, so keyword search fails. `ed-rec-1`'s evidence is better. |
| `ed-w4` | OPEN-UNTRACKED | **OPEN-TRACKED** *(partial)* | The claim — `module_reviews` stays submit-gated while basic visibility does not — **is** the hybrid state L7 decides. Flagged in §3 as tracked-but-thin: no register line states the SLA-age consequence. |
| `ed-dim-5` | OPEN-UNTRACKED | **OPEN-TRACKED** *(partial)* | Same reasoning; its residual is the submit-gated SLA queue. Flagged as tracked-but-thin. |
| `ed-qa-0.3b` | OPEN-UNTRACKED *(flipped 2/3)* | **OPEN-TRACKED** | The flip is **correct on the merits** — the unit pin asserts `next()` on a mock, not that an apply succeeds; the only e2e that applies runs as `admin`. But the flip auto-labelled it untracked without a register check. **A4 · Manual QA §0–§5 walk** covers §0.3b by construction. ⚠️ Worth telling the lead: §0.3b appears in **neither** PR-1's delivered list **nor** the runbook's hand-walk list — an enumeration gap in the runbook. |
| `ed-qa-0.reg` | OPEN-UNTRACKED *(flipped 2/3)* | **OPEN-TRACKED** | Flip correct on the merits — the **edit-again and rebuild legs** have no e2e (`grep apply-status server/e2e/` → 0; rebuild is unit-pinned only). Tracked by A4 §0–§5. Same runbook enumeration gap. |
| `ed-drift-3b` | OPEN-UNTRACKED *(flipped 3/3)* | **`NOT-A-DEFECT`** | ⚠️ **Category error, twice over.** This row is the review's own explicitly-labelled **MATCH** — *not a defect*. All three skeptics correctly refuted `CLOSED` on the ground that nothing was ever open, so no fixing code can be quoted; the mechanism still matches documentation verbatim. **The first draft then compounded it** by filing the row as `OPEN-TRACKED` against **C3 · I20-R1** — a genuinely different gap (`git-backup.sh` stages no `tm/`) — purely so the row would have a register cell to fill. Disposition and evidence openly disagreed. Now recorded as `NOT-A-DEFECT`. **The lesson is about the harness, not the finding:** a refute-the-CLOSED-claim lens is *undefined* for a claim that was never a defect, and a table that requires every row to carry a register cell will invent one. |
| `ed-qa-1g` | CLOSED | **`NOT-A-DEFECT`** | Same category error. "git commit per apply" was a deliberate project decision never to build it (redundant with the 2 h backup cron). Nothing was ever built or broken, so there is no fixing code — the row's only evidence was two *documents*, under a disposition that demands code. |

**Two further flips I did *not* downgrade**, because the register genuinely has nothing: `code-ref-3` (searched `transaction`, `acceptanceService`, `saveModuleSegments`, `atomic`, `rollback` — the only near-hit, I12-M1, is a different service and mechanism) and `ed-w8` (searched `blockedIssues`, `getDiscussEdits`, `overdueCount` — the only `getDiscussEdits` hit is MTA-R9, about the acceptance guard, not the dashboard count).

### Coverage honesty

- **Every claim has a row and a disposition.** No group returned empty. A completeness critic independently re-enumerated the fan-out's 128 rows against all three source documents (39 + 4 + 18 + 21 + 32 + 8 + 6) and they reconciled. ⚠️ **The §1 table's 130 is the post-correction total** — it supersedes this paragraph's 128, which counts the pre-correction fan-out output (the replication added 2 rows). §1 wins.
- **Thinnest coverage: §4 QA table.** **17** of its 32 rows are `OPEN-TRACKED` on A4 with *no durable pin*, so their original PASS/PARTIAL scores rest on a July session that cannot be re-run. Two are now known to have been **too generous** — §4a fails today (`my-work.html:1249` renders the raw `mNNNNN`) and §4b resolves against the app. Treat unpinned §4 PASSes as unverified, not as verified.
- **Not dispositioned, by design:** the code review's own 18-row *"Cross-referenced (already tracked)"* table. The review states those are not among its 37 findings, so they are outside this audit's universe. One row deserved better and is recorded here instead: *"`analyticsService.js` opens its database connection eagerly at load time"* is **false on main** since `12dcdb7c` — see the register-drift note in §7.

### What an independent critic pass caught that synthesis did not

Recorded because it bears on how the *next* review should be run, not to litigate this one. A completeness critic re-read the finished ledger against the sources and found, in order of seriousness:

1. **The evidence substrate was never committed** — the ledger cited a "fan-out record" that existed only as a session-scoped working file. Fixed: [`2026-07-26-closure-audit-evidence.md`](2026-07-26-closure-audit-evidence.md).
2. **§6's own arithmetic was inverted** (10/13 stated backwards, propagated into §1) — in the section whose thesis is *"a count is not evidence."*
3. **Eight `CLOSED` rows in §2.6/§2.7 cited no code at all**, while sitting on the exclusion list. The citations existed in the fan-out output; synthesis had dropped them when compressing to a table.
4. **Two rows whose disposition contradicted their own evidence** (`ed-drift-3b`, `ed-qa-1g`) — both now `NOT-A-DEFECT`.
5. **`ed-dim-7`'s carve-out was an asterisk inside a code fence** — invisible to a list designed to be consumed as machine-readable suppression input.

Every one of these is a *presentation* defect in the synthesis layer; the critic sampled 8 of 67 `CLOSED` dispositions down to their fixing code and found **no instance of the cardinal sin** (concluding closure from line drift), and confirmed all four calibration items independently. **The finding-level conclusions held; the way they were written up did not.** A completeness critic belongs in every future review's method — the synthesis pass cannot audit itself.
- **`ed-w19`'s sub-claims** (the leading-character rule in `BOOK_SLUG_PATTERN`, and the validator's imprecise error message) are in no register. I did not split them into their own row because the review itself scoped them fixture-only and explicitly *not* a production defect.
- **Out-of-scope observations were logged as notes, never as ledger rows**, per the design's scope discipline. The substantive ones: chapter `0` is also rejected at `pipeline.js:44`; `escapeHtml(a.description)` has no `|| ''` guard in `books.html`; `concordanceService.findRepetitions`/`repetitionReport` don't normalize their chapter argument (inert — callers pass normalized values); `runningJobCount()`/`MAX_JOBS` remain global across books by design.
- **Tree state:** read-only throughout. The only untracked path is `.codegraph/`, which pre-dates this work.
