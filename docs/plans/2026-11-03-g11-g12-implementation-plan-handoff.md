# G1.1 + G1.2 — inputs for the implementation plan (handoff)

- **Date:** 2026-11-03
- **For:** the session that writes the implementation plan for PR1–PR5 of
  [the G1.1 + G1.2 design](../superpowers/specs/2026-11-03-served-version-and-event-log-design.md) (§13a).
- **Measured at:** `main` = `d24681b8` (the #618 merge). Its code is byte-identical to `3a1db909`, where the spec's
  citations were read: `git diff --name-only 3a1db909 d24681b8 -- server tools scripts .github` is empty. Read-only,
  USD 0. A three-agent workflow (plan format, per-PR inventory, an adversarial check of both) produced it; the check's
  corrections are applied here.
- **Status of the work:** the active register's newest ⏩ RESUME entry, never this file.

> **FROZEN EVIDENCE — banner-dated 2026-11-03.** This file is a dated input sheet, never status. Every `path:line` is
> pinned to `d24681b8`: if the tree has moved, trust the named construct over the line number, and **the tree wins**
> over this file. Every count is a measurement on that date, not a live value; re-derive it before relying on it. If
> this file disagrees with the active register, the register wins. Do not sync it; supersede it.

## 0. Read first, in this order

1. The register's newest entry (`docs/plans/2026-07-21-post-item17-followup-campaign.md`, top).
2. The spec, whole. It is frozen and approved as written, including its 24 Claude's calls (§14), so **the plan does
   not reopen them.** §13 ("Left to the builder") is the plan's to decide. §13a is the PR split and the gates.
3. `docs/decisions/2026-11-03-research-capture-consent-and-retention-rulings.md` (R1–R6, A1–A3).
4. The G1.23 spec's §8 (`docs/superpowers/specs/2026-11-02-suggestion-view-design.md`), the contract this project
   meets; the spec's §7 maps it.
5. This file.

**The spec's premises are hypotheses.** CLAUDE.md § One source of truth: open the code a document says is missing
before you write it. The spec's own cited lines drifted once already (its §12 item 5), and G-5 says "re-grep before
building".

## 1. The house format for an implementation plan

No skill for writing or executing plans is installed here (`grep -ailE 'writing-plans|implementation plan|executing-plans' -r .claude/`
returns nothing, and no `superpowers:*` plugin is present). Follow the existing plans in `docs/superpowers/plans/`.
The newest full examples: `2026-11-02-term-pass-request-flag.md`, `2026-10-03-chemistry-faithful-retirement.md`,
`2026-10-01-c140-c40-retire-and-pins.md`.

- **File:** `docs/superpowers/plans/YYYY-MM-DD-<slug>.md`, dated the day it is written. Title
  `# <scope> — <what> — Implementation Plan`.
- **Opening:** the "For agentic workers" blockquote on line 3 (copy it from a recent plan), then `**Goal:**` (one
  sentence), `**Architecture:**`, `**Tech Stack:**`, `**Spec:**` (relative link, what to read first). A live plan has
  no banner and no status.
- **Before the tasks:** `## Global Constraints` (branch, gates, module systems, never-push rules, the commit trailer)
  and `## Review Focus` (numbered input cases the spec implies but its tests do not exercise, each ending `→ Task N`;
  `term-pass-request-flag.md:29-35`).
- **Each task:** `### Task N: <behaviour>`, then `**Files:**` (Create / Modify / Test, naming functions) and
  `**Interfaces:**` (Consumes / Produces, exact signatures). Steps are `- [ ] **Step N: …**`, usually: write the
  failing test with exact assertions → run it, `Expected: FAIL — <exact reason>` → implement → run it, expected output
  → commit with exact `git add` paths. **Test-first is mandatory**, one commit per task, line numbers pinned to a
  named SHA.
- **Spec traceability:** cite the spec's ids (§5.6, T4, R4, G-5). Carry each T-test into the task that owns it.
- **Decisions the plan takes** (from §13 and §3 below) go in a numbered list near the top with a reason each
  (`c140-step2-code-fixes.md:53`). **A refinement that changes what the frozen spec says goes to [USER] first**, then
  as a dated `✏️ AMENDED` block (precedent: `docs/superpowers/specs/2026-10-27-ai-layer-runner-design.md:8`).
- **Split:** the precedent is one plan per PR (item8-pr1/pr2, item16-pr1/pr2, C82 Plans A–C as companion plans), or
  one plan with parts and local task numbers plus a binding "Handoff to <next PR>" section
  (`c140-step2-code-fixes.md:18`, `:3438`). §13a's five PRs have five different gates, which fits either.
- **No test counts, migration counts or CI verdicts in prose.** An `Expected:` line is a prediction at a named SHA.

## 2. CI, and the idioms to copy

| Job | Runs | Notes |
|---|---|---|
| `lint` | `npm run lint` (`eslint tools/ scripts/ server/`) **and** `npm run format:check` (prettier on `tools/`, `scripts/`, `server/` `**/*.js`) | `server/public/**/*.js` is linted as `sourceType: 'script'` with browser globals; `no-var` is an error everywhere. `.mjs` tests are linted, not prettier-checked |
| `test` | `npm test` = `vitest run` from the root | also discovers `scripts/__tests__/*.test.mjs` |
| `e2e` | `cd server && npm run test:e2e` (Playwright) | `npm test` does **not** run it |
| `audit` | `npm audit --audit-level=high` in root and `server/` | bites only if a dependency is added |
| `check-docs` | `npm run docs:generate`, then fails if `docs/_generated/` is dirty | path-filtered (`tools/**`, `server/routes/**`, `scripts/**`); root `npm ci` only. A new `router.<verb>('…')` line, or a new file in `server/routes/`, changes `docs/_generated/routes.md`, which must be committed |

- **Vitest header:** `server/__tests__/importConcepts.test.js:8-11` (`import` vitest, `createRequire(import.meta.url)`
  for server modules).
- **`freshMigratedDb`** (`server/__tests__/helpers/freshMigratedDb.js`) applies every file in `server/migrations/`:
  that is why the research schema must not live there (spec §5.1).
- **`SESSIONS_DB_PATH` before `require`**, then `runAllMigrations()`: `segmentEditBackstop.test.js:48-51`, `:99-101`.
- **`_setTestDb` seams:** `segmentEditorService.js:1546`, `acceptanceService.js:439`, `propagationService.js:27`,
  `userService.js:20`, `activityLog.js:61-73` (the model for `researchDb.js`). Books: `segmentParser._setTestBooksDir`
  (`segmentParser.js:475`) and `segmentEditorService._setTestBooksDir` (`:1551`).
- **A real route handler without HTTP:** take the layer from `router.stack` by path and method, call
  `route.stack.at(-1).handle` with fake `req`/`res` (`segmentEditBackstop.test.js:53-67`, `:104-108`).
- **Never-throw:** `activityLogNeverThrow.test.js:57-97`. `activityLogCallsiteGuard.test.js` fails on any comment-less
  empty `catch` under `server/routes/` and `server/services/`, which covers the new `servedEdit.js`, `researchLog.js`
  and `researchDb.js`.
- **Health thresholds derived from cron:** `healthOffboxBackup.test.js:21-48` parses `scripts/install-cron.sh`.
  `/api/health` is inline in `server/index.js:245-358` and cannot be required in a test (`startup.test.js:150`), so a
  new check lives in a `server/lib/*` helper tested directly.
- **Admin script shape:** `server/scripts/close-pending-edits.js` (dry-run unless `--write`, `process.exitCode = 1` on
  entry, `require.main === module`), tested by `closePendingEdits.test.js`. **A read-only production probe sent on
  stdin:** `server/scripts/read-pending-edits.js:13-18`. No committed G-1a…G-1h probe exists yet.
- **Shell scripts:** `scripts/__tests__/backup-db.test.mjs` (fake rclone, prune, cron template).
  `scripts/__tests__/shell-syntax.test.mjs:20` runs `bash -n` over an explicit list, so a new shell script is covered
  only if added there.
- **Subagents:** `.claude/settings.json` wires a SubagentStart/SubagentStop hook (`.claude/hooks/subagent-tree-check.mjs`)
  that reports each subagent's working-tree change, the automated form of CLAUDE.md's `git status --porcelain` rule.

## 3. Seams the spec leaves to the plan

1. **The study allowlist is needed before PR3.** PR2's opening predicate requires the book to be on it (§11), but
   `server/lib/researchScope.js` is listed under PR3. Move it to PR1 or PR2.
2. **`write-refused` (PR1) and `module-opened` (PR2) need `record` (PR3).** PR1 and PR2 refuse or open without
   logging; PR3 adds the emission at those points. T4, T5, T7 and T16 split along that line.
3. **`checks.schema`** (§5.20) names tables from PR1–PR4. Grow it per PR, or production reads `degraded` until PR4.
4. **PR1 ships the §5.18 client fields** (`clientActionId`, `clientActionTime`, `assists`, `acceptOrigin`,
   `reviewedEditSha256`, `replayed`) whose only consumer is PR3; PR1's server accepts and ignores them.
5. **The withdraw route** sits in PR3 (it sets `withdrawn_at_ms`, inert while no text is approved) and its deletion in
   PR4. `research_deletions` can go in either.
6. **Not placed in §13a:** `server/scripts/research-status.js` (§5.20); the admin reader (§5.16); the paper-consent
   script (§5.14); retiring the id-based re-attach script or making it refuse the study book (§5.6,
   `scripts/reattach-segment-edits.js:235`; if its server edge changes, root `LICENSE` enumerates it); T21 (fits PR1:
   `writeMtLock` already does nothing when a marker exists, `tools/lib/mt-lock.cjs:26-28`).
7. **PR5 cannot merge before PR3** despite its "any time" gate: `opening-eligibility.js` reads PR2's and PR3's tables.
8. **G-4 before PR1** (occurrence k pairs EN with IS for all 285 duplicated ids) is a sensible ordering, but the spec
   does not require it; say so if the plan adopts it.
9. **§13's items:** migration names, index names and types; every reader of `original_content` before the re-save
   starts moving it (§4 PR1 lists them); the refused-save UX; the Icelandic message wording (client strings live in
   `server/public/js/ui-strings.js`, guarded by `ui-strings.test.js`); the consent page layout and admin-script
   arguments; the research backup's shell/Node split.

## 4. Per PR

### PR1 — G1.1 core (gate: none)

- **New:** `server/lib/servedText.js` (`sha256Text`), `server/services/servedEdit.js` (`saveOnServedBase`), the next
  migration in `server/migrations/` (all absent at `d24681b8`).
- **`server/routes/segment-editor.js`:** the module GET `:264-332` (loader `:272`, all editors' edits `:279`, single
  `res.json` `:320-326`); `/edit` `:338-490` (`checkEditConflict` `:370-376` stays first; baseline `.find` `:390-395`;
  `validateStructure` `:405-417`; `saveSegmentEdit` `:419-431`, storing the client's `originalContent || ''` at
  `:424`; 409 mapping `:482-484`); `/accept` `:871-939`; `/propagate` `:1477-1525`.
- **Services:** `segmentEditorService.saveSegmentEdit` `:82-233` (withdraw `:110-116`, re-save UPDATE `:145-151`,
  INSERT `:182-198`, MT lock `:209-231`; `checkEditConflict` `:58-77` skips at `:59` when `baseEditId` is absent);
  `acceptanceService.acceptSegment` `:79-225`; `propagationService.createPropagatedEdits` `:63-165` (in-place UPDATE
  `:92-96`) and `findOccurrences` `:189-219`.
- **`saveSegmentEdit` has many direct test calls** (89 across 8 suites, measured). Keeping its signature and having
  `saveOnServedBase` pass the server's base as `originalContent` (§5.6 step 6) gives the "withdraw = current base"
  rule without touching them. `propagationService.test.js` **will** change, because §5.6 rewrites
  `createPropagatedEdits`.
- **Client** (`server/public/js/segment-editor.js`): `saveDraft` `:84-99`, `restoreDraft` `:111-140`, `loadModule`
  `:256` (error path `:303-307`), `renderModule` `:1081` (ignores `renderSegments`' result at `:1124`),
  `renderSegments` `:1197`, accept `:1698-1711` (`acceptedContent: seg.is` at `:1711` → read from the DOM),
  `saveEdit` `:1929` (body `:1981-1996`), 409 reload `:2061-2065`, `latestEditIdForSegment` `:2077-2084`,
  `reviewEdit` `:2135-2150`, `cssId` `:2458-2460`, assists `:874-884`, `:3261`, `:3308`. `saveRetry.js`: `:26`,
  `:149-157`, error construction `:234-245` (shared with `localization-editor.js`, so new fields stay optional).
- **Also:** `server/services/migrationRunner.js` explicit list (`:32-85`); `server/index.js` `checks.schema`;
  `server/__tests__/helpers/segmentEditsSchema.cjs` (see §5).
- **Readers of `original_content`** (`git grep -an "original_content\|originalContent"` over `server scripts tools`,
  tests, e2e and migrations excluded): `termMiningService.js:105,113` (its "before" text), `read-apply-exposure.js:54,111`,
  `close-pending-edits.js:138`, `scripts/render-segment-edits-md.js:104`, `scripts/reattach-segment-edits.js:103`, and
  every `SELECT *` consumer (`segmentEditorService.js:242` reaches the browser).
- **Unit tests that post bodies the PR changes:** `segmentEditBackstop.test.js` posts `/edit` with no hash at `:186`,
  `:211`, `:237`, `:261`, `:275`, `:328`, `:346`; each needs the hash from a module load, and one `BASE_MISSING` case
  stays. Its case 6 (`:250-280`) pins that the conflict check runs before the structural guard, which the new order
  keeps; the structural-400 cases (`:186`, `:211`, `:237`) will hit `BASE_MISSING` first unless they carry the hash.
  `acceptanceRoutes.test.js`' accept bodies are not forced (accept keeps its value check).
- **E2E specs:**

  | Spec:line | Change |
  |---|---|
  | `concurrent-editing.spec.js:127-134` | send `seg.baseSha256` (module already loaded at `:112`) |
  | `review-cycle.spec.js:60-67` | send `seg.baseSha256` (loaded at `:45`) |
  | `editor-workflow.spec.js:70-75` and `ux-phase2.spec.js:130-135` | **three edits:** add `baseSha256` to `chooseSegment`'s return in `server/e2e/helpers/segments.js:112-117`, and pass `baseSha256: picked.baseSha256` at each call site, which builds its body field by field. Pin the helper's new field in `server/__tests__/e2eSegmentPicker.test.js` (it runs in `test`, not `e2e`) |
  | `segment-editor.spec.js:353-361` | posts `originalContent: ''` with no prior GET: add a module GET for the hash |
  | `editor-lifecycle.spec.js:157`, `:206` | ride the client; the replayed body must keep `baseSha256` |
  | `editor-lifecycle.spec.js:272-283`, `:294-310` | pin today's draft format (`{ts, drafts:{segId: …}}` under `seg-draft:…`); §5.18 changes it and requires legacy drafts to restore, so Test 7 becomes the legacy-draft case |
  | `acceptance.spec.js`, `segment-editor.spec.js:249` | ride the client's DOM-read values (T23) |

  No module the E2E specs use has a duplicated id (fixture m68663, m68664; chemistry m68663, m68664), so
  `DUPLICATE_ID` cannot fire there. The fixture has `02-mt-output`, so "no layer → refuse" does not break it; any new
  unit fixture for `servedEdit` must write an MT or faithful file.
- **Deploy note:** static JS has no cache-busting (`server/index.js:173`). A page loaded before the deploy sends no
  hash, and its old `saveRetry` drops a non-5xx replay with a toast, so `BASE_MISSING` must tell the editor to press F5.

### PR2 — the opening record (gate: merged only after G-1d)

- **New:** a migration for `module_openings` and `module_opening_inflight`.
- **Route:** the opening step after the mint, before `res.json` (`:320`). The route does not require `userService`
  today; add it. `isEditInFlight` comes from `server/public/js/accept-eligibility.js` (UMD; the route already
  requires public JS at `:42`).
- **Predicate:** `userService.findByProviderId` (`userService.js:57`) plus a direct `user_chapter_assignments` lookup
  (`010-chapter-assignments.js:17-26`). **Not** `hasChapterAccess` (fail-open at `:632-635`, `:641-647`, `:666`,
  `:677-678`), and **not** the legacy `chapter_assignments` table from migration 012, which has no reader.
- **Tests:** T6, T7. Idioms: `assignmentEnforcement.test.js:16,54-56`, `visitorSessions.test.js`.
- **E2E:** no change. `server/e2e/seed-fixture.js` inserts no `users` or assignment rows and logins are injected JWTs,
  so the predicate is never true in E2E and the 503 cannot fire there.

### PR3 — G1.2 (gate: inert until an approved consent text is listed; G1.23 may start once PR1–PR3 are on `main`)

- **New** (all absent at `d24681b8`): `server/lib/researchDbPath.js`, `server/services/researchDb.js`,
  `server/lib/researchSchema.js`, `server/lib/researchScope.js` (unless moved earlier, §3 item 1),
  `server/lib/researchConsentText.js`, `server/services/researchLog.js`, `server/lib/featureFlags.js`, a migration for
  the consent, loss and switch tables, and the consent routes (a new route file needs a mount in `server/index.js`
  `:214-242` before the API 404 handler, which `startup.test.js:131` pins last, and a regenerated `routes.md`).
- **`server/index.js`:** research schema after the editorial migrations (`:33-45`), never stopping boot; the server
  commit read near `:93`; `checks.research_db`.
- **`scripts/deploy.sh`:** write `pipeline-output/.deployed-commit` after the pull (`:73`). Tests that read
  `deploy.sh`: `tools/__tests__/deployPathSingleSource.test.js`, `scripts/__tests__/shell-syntax.test.mjs`,
  `deploy-health-readout.test.mjs`, `git-backup.test.mjs`, `server/__tests__/glossaryExportHealth.test.js`. The first
  deploy after PR3 still runs the old `deploy.sh`, so `commit_source='git-head'` is expected once.
- **`server/e2e/playwright.config.js`:** the `rm -f` at `:35` adds the derived research file and its `-wal`/`-shm`.
- **`record` at every write route** in `segment-editor.js`: save `:338`, accept `:871`, revoke `:942`, delete `:976`,
  submit `:1001`, approve `:1091`, reject `:1125`, discuss `:1158`, unapprove `:1191`, return-to-pending `:1218`,
  review-complete `:1246`, comment `:1306`, propagate `:1477`, apply `:1636`, apply-and-render `:1684`, restore
  `:1818`. Services return their before-images (the list is in spec §5.9).
- **T10's path rule** must be tested against real suite names that lack `sessions`: `acc-test-${pid}.db`
  (`acceptanceService.test.js:24`), `acc-apply-${pid}.db` (`acceptanceApply.test.js:22`), `authz-test.db`
  (`crossBookAuthz.test.js:11`).

### PR4 — deletion and backups (gate: consent collection, after G-1a, G-1b, G-1h, the officer's review, and [USER] listing the text)

- **New:** `server/scripts/research-withdrawal.js`, `server/scripts/research-retention.js`,
  `server/lib/researchRetention.js`, a migration for `research_derived_datasets`, the backup pair (a `server/scripts`
  part using better-sqlite3's online backup; a `scripts/` shell part for the upload to its own remote), the restore
  script.
- **Modified:** `scripts/install-cron.sh` (a line beside `:38`; the script only prints lines to paste);
  `scripts/__tests__/shell-syntax.test.mjs:20`; `docs/deployment/linode-deployment-checklist.md` §9 (`:236`, `:243`,
  the spec's §12 item 10); `docs/technical/backup-and-restore.md` (`:13`, `:30`). **Pinned, not changed** (T19):
  `scripts/backup-db.sh` (`:23`, `:45-46`, `:53`, `:103-105`) and `scripts/verify-db-backup.sh:19`.

### PR5 — the end-of-editing export (gate: before G3.2, and after PR3, §3 item 7)

- **New:** `server/scripts/export-served-versions.js` (writes `pipeline-output/served-version-exports/`, never
  `books/`), `server/scripts/opening-eligibility.js` (writes `pipeline-output/research-exports/`).
- Module enumeration as `segmentParser.listChapterModules` (`:408-430`; its `endsWith('-segments.en.md')` at `:421`
  is what skips the legacy `*-segments(b).en.md` files). `check-docs` does not run while the PR touches only
  `server/scripts/**`.

## 5. Traps found while measuring

- **Migration numbers are dense, and two tests enforce it.** `startup.test.js:80-90` requires numbering from 001 with
  no gaps and no duplicate prefixes, and `migrationRunnerCoverage.test.js` requires every file in the runner's list.
  So assign numbers **in merge order**: a PR that merges 054 before 053 is on `main`, or two branches that both take
  053, turns `test` red. The highest number on `main` at `d24681b8` is 052; re-derive with `ls server/migrations`.
- **`segmentEditsSchema.cjs` has no drift guard.** It is a hand copy of `segment_edits` used by many suites; nothing
  compares it with the migrated schema. Add the new columns to it by hand **in the same commit** as the migration.
  Suites that build `segment_acceptances` by calling migration 043 directly also need the new columns.
- **`structuralBackstopWiring.test.js:16-20`** pins `segmentValidation.validateStructure(` and the Icelandic refusal
  string in `routes/segment-editor.js`, and `:34-37` pins `sourceEn: sourceSeg?.en` there. §5.6 moves the backstop
  into `saveOnServedBase`, so the plan decides which file holds the call and moves the pin on purpose.
- **`clientMessageContracts.test.js:39-52`** constrains how `saveRetry.js` may add `err.code` and `err.data`: its
  `// Non-retryable` block must keep the two-argument `response.json().then(fn, fn)` form and contain no `.catch(`.
- **NUL bytes:** `server/scripts/verify-b4b0-gates.js` and `server/services/termMiningService.js` contain NULs; use
  `grep -a`.
- **`close-pending-edits.js`** writes raw SQL and must not run once any unit has opened (§5.6).

## 6. Before a PR, and merging

- **Gate as CI runs:** `npm test` from the root (diff the failing set by name against `main`'s, never the count),
  `npm run lint`, `npm run format:check`, `npm run docs:check` where it applies, E2E with `CI=1` for anything touching
  routes or the client, and `git status --porcelain` empty.
- **Whole-branch adversarial review before each PR.** The newest practice is a blind pair (Opus and Fable, same brief,
  neither sees the other's findings; the register's 2026-11-02 entry). **Ask [USER] before commissioning the Fable
  half** (the register cites a standing rule to ask first, held in project memory that is not on every box). The
  alternative is a review workflow with several lenses and a skeptic per finding; a mutation pass restores from a
  golden `cp`, never `git checkout`.
- **Push, PR and deploy only on [USER]'s go.** Merge as a **merge commit**, never squash or rebase (the register cites
  individual SHAs). A push to `main` from dev puts prod's content backup behind until the next deploy (CLAUDE.md
  § Content delivery).
- **Production checks** (spec §9) are read-only, through a committed script sent on stdin: G-1d before PR2 merges;
  G-1a, G-1b and G-1h before any consented row.
