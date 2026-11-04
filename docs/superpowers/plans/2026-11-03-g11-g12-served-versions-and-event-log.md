# G1.1 + G1.2 — served versions, the opening record, the event log, deletion and the export — Implementation Plan (index)

> **For agentic workers:** this file is the index. Each PR has its own plan file (table below); execute one PR's plan
> task by task, in order, test first. Steps use checkbox (`- [ ]`) syntax. No plan-execution skill is installed in this
> repository, so follow the steps as written. **The tree wins:** where a measurement disagrees with a plan, stop, say
> so, and re-derive; never force the plan's expectation.

**Goal:** build the measurement base the Skerfur study needs before any chemistry unit opens: a served-version record
with a stale-base refusal on every save and accept (G1.1), a set-once opened time with its in-flight snapshot, one
never-throwing logging call that writes consenting editors' acts to a separate research file (G1.2), withdrawal,
retention and its own 7-day backups (G1.4's data side, G1.20's research file), and the end-of-editing export (R5).

**Architecture:** five pull requests, in the order of
[the spec's §13a](../specs/2026-11-03-served-version-and-event-log-design.md), with one departure (decision 1 below).
Everything the editor's screen depends on lives in `sessions.db`; only research rows live in
`pipeline-output/research.db`. Each PR lands its migration, its columns, the code that writes them and the tests that
post them together, and grows the two cross-cutting guards (`checks.schema`; the research-boundary test) by what it
adds.

**Tech Stack:** Node 22, Express (CommonJS under `server/`), better-sqlite3 13 (only in `server/node_modules`), browser
JS with no build step (`server/public/js/`, `sourceType: 'script'`), Vitest from the repository root, Playwright E2E
(`cd server && npm run test:e2e`), bash for the backup's upload half.

**Spec, and the read order:**
1. The active register's newest ⏩ RESUME entry (`docs/plans/2026-07-21-post-item17-followup-campaign.md`, top).
2. [The spec](../specs/2026-11-03-served-version-and-event-log-design.md), whole. Frozen and approved as written, with
   its 24 Claude's calls (§14): this plan does not reopen them. §13 is the plan's to decide; §13a is the PR split.
3. [The decision record](../../decisions/2026-11-03-research-capture-consent-and-retention-rulings.md) (R1–R6, A1–A3).
4. G1.23's spec, §8 ([`2026-11-02-suggestion-view-design.md`](../specs/2026-11-02-suggestion-view-design.md)): the
   contract this project meets. The spec's §7 maps it.
5. [The handoff](../../plans/2026-11-03-g11-g12-implementation-plan-handoff.md) (frozen; its line numbers are pinned
   to `d24681b8`).
6. This index, then the PR's own plan.

## State of this plan (read first)

- **Written 2026-11-03 with its five PR plans; ✅ approved by [USER] on 2026-11-04** ("Yes for all" to the questions
  below, with four clarifications the same day; see "Answers"). Status lives in the register, never here. Each PR plan was drafted, adversarially reviewed by two or three lenses and
  fixed, and the five were then cross-checked against each other and reconciled. No `Expected:` line was run: the
  plans' tests do not exist yet.
- **Pinned to `main` = `ed10180c`.** Its `server/`, `tools/`, `scripts/` and `.github/` are byte-identical to
  `d24681b8` and to `3a1db909`, where the spec's citations were read (`git diff --name-only 3a1db909 ed10180c --
  server tools scripts .github` is empty). Every `path:line` in these plans is at that tree. If the tree has moved,
  trust the named construct over the number, and re-derive.
- **The spec's premises are hypotheses** (CLAUDE.md § One source of truth). Each PR plan opens the code a claim says is
  missing before writing it, and its first step re-greps what it is about to change (spec §9, G-5).

## The five PRs

| PR | Plan | Holds (spec §13a, with decision 1) | Gate | Needs on `main` first | Migration (predicted) |
|---|---|---|---|---|---|
| **PR1** | [G1.1 core](2026-11-03-g11-g12-pr1-served-versions-core.md) | `servedText.js`, **`researchScope.js` (moved from PR3)**, `served_text_versions` and the new editing columns, the serve hook (steps 1–3, 6), `servedEdit.js` and every refusal, propagation minting, the re-attach script's refusal, the client changes (§5.18), the test bodies (G-5), `checks.schema` (first part) | none | — | `053` |
| **PR2** | [the opening record](2026-11-03-g11-g12-pr2-opening-record.md) | `module_openings`, `module_opening_inflight`, the predicate, the 503, the read-only production probe (G-1c…G-1g), `close-pending-edits.js` refusing once a unit of its book has opened (§5.6's last bullet; PR2's decision 29) | merged only after G-1d has run on production and [USER] has made the §9 choice if chemistry holds assignment rows | PR1 | `054` |
| **PR3** | [G1.2, the event log](2026-11-03-g11-g12-pr3-event-log.md) | the research path, connection and schema; the consent tables (`research_consent`, `research_capture_losses`), `researchConsentText.js` (empty) and routes; `editor_keys`; `record`; `book_switch_events`; the flag registry; the server commit (with `deploy.sh`); emission at every write route (including `write-refused` from PR1 and `module-opened` from PR2), with the services returning before-images; `checks.research_db`; `research-status.js` | inert until an approved text is listed; **G1.23 may start once PR1–PR3 are on `main`** | PR1, PR2 | `055` |
| **PR4** | [deletion and backups](2026-11-03-g11-g12-pr4-deletion-and-backups.md) | `research_deletions`, `research_derived_datasets`; the withdrawal and retention scripts and the withdraw route's immediate deletion; the admin reader module; the paper-consent script; the research backup job, its own remote and bucket, its cron line, heartbeat and `backup-stale`; the restore script; the prune and prefix tests; the checklist and backup-doc corrections; the probe's G-1a (crontab) and G-1h parts | gates consent collection, not G1.23. Before the first *consented* row: G-1a, G-1b, G-1h, the data protection officer's review, then [USER] lists the text | PR3 | `056` |
| **PR5** | [the end-of-editing export](2026-11-03-g11-g12-pr5-end-of-editing-export.md) | `export-served-versions.js`, `opening-eligibility.js`, the raw research export (§5.19's last bullet) | any time before G3.2, but only after PR4: all three scripts write into the directories PR4's `researchFiles.js` derives, `opening-eligibility.js` reads PR2's and PR3's tables, and the raw research export reads through PR4's admin reader | PR4 | none |

**Before any unit opens, whatever the PR order** (spec §13a, not this plan's to build): G1.7's freeze markers (G-1g),
G1.12 for the 83 affected modules (R4), and assignment only after G1.23's switch-on (R6).

## Decisions the plan takes

Each is a §13 item, a seam the spec leaves open (handoff §3), or a placement §13a does not make.

1. **`server/lib/researchScope.js` ships in PR1, not PR3. ✅ [USER] approved this change to §13a's table on
   2026-11-03,** and the spec carries a dated `✏️ AMENDED` block recording it (precedent:
   `docs/superpowers/specs/2026-10-27-ai-layer-runner-design.md:8`); the spec is not otherwise edited. Two consumers
   come before PR3: the id-based re-attach script must refuse the study book once `saveOnServedBase` exists (spec
   §5.6, decision 7), and PR2's opening predicate requires the book to be on the allowlist (§5.5).
2. **PR1 and PR2 refuse and open without logging; PR3 adds the emission at those points** (handoff §3 item 2).
   `record` does not exist before PR3, so `write-refused` (§5.6, §5.7) and `module-opened` (§5.5) are emitted from
   PR3. T4, T5 and T16 split along that line: their `sessions.db` halves are PR1's tests, their event halves PR3's.
3. **`checks.schema` grows per PR** (handoff §3 item 3). PR1 creates `server/lib/schemaHealth.js` (a helper tested
   directly, since `/api/health` is inline in `server/index.js` and cannot be required by a test) listing PR1's tables
   and columns; each later PR appends its own, in the same commit as its migration. Otherwise production would read
   `degraded` from PR1's deploy until PR4's.
4. **PR1 ships all of §5.18's client changes, as §13a says; PR1's server accepts and ignores the research-only fields**
   (`clientActionId`, `clientActionTime`, `assists`, `acceptOrigin`, `reviewedEditSha256`, `replayed`) until PR3
   reads them (handoff §3 item 4). Reason: the draft format then changes once (`{text, baseSha256, occurrence,
   assists}`), so there is one legacy-draft path, not two; and T23 is one test.
5. **The withdraw route ships in PR3 and only sets `withdrawn_at_ms`; its immediate deletion, `research_deletions` and
   both scripts ship in PR4** (handoff §3 item 5). While no approved text is listed no interval can exist, so the gap
   between the two PRs holds nothing to delete.
6. **Placements §13a does not make** (handoff §3 item 6): `research-status.js` (§5.20, reads only
   `research_capture_losses`) → PR3; the admin reader module (§5.16) → PR4, with its first consumers, the deletion
   scripts; the paper-consent script (§5.14) → PR4, because its withdrawal path needs the immediate deletion; the raw
   research export (§5.19, last bullet) → PR5; T21 → PR1. Any decided/undecided per-editor report is G1.13's, not
   this plan's: `research-status.js` must not name `research_consent` (§5.22 allows only two exceptions).
7. **The id-based re-attach script refuses the study book; it is not retired** (§5.6 offers either). It keeps its use
   for books outside the study, where id matching is what it was built for. It reads the allowlist from
   `researchScope.js` (a new edge into `server/`, so root `LICENSE`'s enumeration changes in the same commit), and
   refuses before planning, in a dry run too. Re-attach by content (10-10 plan 4.2) stays unbuilt here.
8. **G-4 is not a gate for PR1** (handoff §3 item 8). PR1 refuses every write on a duplicated id and mints nothing for
   one, so no record of the wrong copy can be written whatever G-4 finds. G-4 is G1.12's precondition (§9).
9. **Migration numbers are assigned in merge order, at build time** (handoff §5): `ls server/migrations` on the branch
   just before the migration's commit, and again just before merging. The table's `053`–`056` are predictions from
   `main` = `ed10180c` (highest `052`). Two branches holding the same number, or a gap, turn `test` red
   (`startup.test.js:80-90`, `migrationRunnerCoverage.test.js`).
10. **One migration per PR**, idempotent steps inside one never-throw boundary around the whole unit (the shape of
    `server/migrations/048-book-term-preference.js:373-392`). The same commit adds every new `segment_edits` column to
    `server/__tests__/helpers/segmentEditsSchema.cjs` by hand (it has no drift guard), and a drift guard test that
    compares that copy with the migrated schema (decision 11).
11. **A drift guard for `segmentEditsSchema.cjs` ships in PR1** (handoff §5 found none). It builds a fresh migrated
    database and compares `PRAGMA table_info(segment_edits)` with the hand copy's by column name and type, so the next
    PR that adds a column and forgets the copy turns `test` red instead of passing suites against a stale table.
12. **The refused-save experience (§13):** on a refusal (`STALE_BASE`, `STALE_DISPLAYED`, `BASE_MISSING`,
    `DUPLICATE_ID`, `BOOK_NOT_MINTED`, `NO_LAYER`, or any non-5xx answer to a replay: §5.6's wording, a superset of
    §5.18's "any 409"; and, since [USER]'s answer of 2026-11-04, a 5xx that exhausts a replay's retries; PR1's
    decisions 5, 28 and 30), the client moves the typed text and its assist list
    into the module's draft, keyed by segment, with the `baseSha256` it was typed on, then reloads. On restore, a draft
    whose `baseSha256` differs from the row's newly served one opens in that segment's edit pane with a notice above
    it: the text it was typed on has changed, the row shows the new text, redo the change and save. A `DUPLICATE_ID`
    draft stays in the draft with a notice that the segment cannot be saved until a later fix (it is never lost and
    never sent). `BASE_MISSING` tells the editor to reload the page (F5), because an old page's JS is what sent no
    hash.
13. **The Icelandic wording (§13)** for every new refusal is drafted in PR1's and PR3's plans as proposals, client
    strings in `server/public/js/ui-strings.js` (guarded by `ui-strings.test.js`), server messages beside each code.
    **[USER] checks the wording before the PR is opened.**
14. **The production probe is one committed read-only script, `server/scripts/read-research-preconditions.js`,** sent
    on stdin as `server/scripts/read-pending-edits.js:13-18` describes. PR2 builds it with the database, file-system
    and service-configuration checks (G-1c, G-1d, G-1e, G-1f, G-1g; G-1c and G-1d also read `journalctl` and
    `systemctl` through a never-throw child-process wrapper), because G-1d gates PR2's merge; it runs from the PR2
    branch before the merge (stdin needs no deploy). PR4 adds G-1a's crontab half and G-1h. G-1a's
    Linode half and G-1b are console checks [USER] makes. Its output names no editor (counts and ids only), so it can
    be pasted into the register.
15. **Test-file placement for the cross-cutting tests:** T17 is one file, `server/__tests__/researchBoundary.test.js`,
    created in PR1 and extended by every PR with the boundary that PR adds; T18 is split across PR1 (allowlist,
    organic serve and writes) and PR3 (an event for a non-study book).
16. **The `structuralBackstopWiring.test.js` pin moves on purpose** (handoff §5): §5.6 step 5 puts
    `segmentValidation.validateStructure` inside `saveOnServedBase`, for every caller, so the call and its Icelandic
    refusal string move to `server/services/servedEdit.js` and the test's pin moves with them, in the same commit.
17. **Branches:** each PR is built on its own branch cut from `main` after the previous PR merged (the executing
    session's harness may assign the name). PR5 may be built beside PR4 but merges after it.

## Test placement (spec §10)

Every T-test is carried by exactly one PR, or split as listed. A split names which half each PR owns.

| Test | PR | Note |
|---|---|---|
| T1 the integrity set | PR1 | corpus test over committed layer 2; ch00 and the duplicated ids through the same mint function on the loader's output |
| T2 hash sentinels | PR1 | |
| T3 served versions | PR1 | |
| T4 stale base | PR1 (refusals, stored values, the displayed pair, the DOM-read accept, re-attach) + PR3 (`write-refused` event) | |
| T5 duplicated id refused | PR1 (no rows, the 409, propagation skip) + PR3 (`write-refused` event) | |
| T6 opened time | PR2 | |
| T7 the snapshot | PR2 | the warning is a server log line, so it is PR2's too |
| T8 consent gate | PR3 | the withdrawn editor is set up by the PR3 route (no deletion yet) |
| T9 withdrawal | PR4 | |
| T10 the research file down | PR3 | |
| T11 replay | PR3 | the spec's "non-held fixture book" cannot produce a recorded apply event, since `record` captures only study books (§5.11 step 1) and the study book is held; PR3's decision 60 runs the apply arm on chemistry in a temporary books root with the apply hold stubbed for that test, **which needs [USER]'s yes** |
| T12 no deferred write | PR3 | |
| T13 server commit | PR3 | |
| T14 flags | PR3 | |
| T15 reviewer on a decliner's edit | PR3 | |
| T16 propagation | PR1 (target rows) + PR3 (the event, the preview hash and its flag) | |
| T17 nothing reaches a browser or a route | every PR: PR1 (column allowlist; no research field in module JSON), PR2 (no opened time or snapshot), PR3 (routes vs `researchDb`/`editor_keys`; `research-*` forbidden tables, with the exception list and `research-withdrawal.js`'s entry; `record`'s failure log), PR4 (the admin reader module; the exception exercised on the real `research-withdrawal.js`; the scan widened to `server/scripts/lib/research*.js`), PR5 (the eligibility output) | one file, `researchBoundary.test.js` (decision 15) |
| T18 scope | PR1 (allowlist; organic serve, save, accept, propagation) + PR3 (non-study event) | |
| T19 backups | PR4 | |
| T20 times | PR3 | |
| T21 MT lock | PR1 | |
| T22 export | PR5 | |
| T23 client | PR1 | |

## Cross-PR interfaces

PR1's plan owns the exact signatures and lists them in its "Interfaces produced for later PRs" section; later plans
consume them by name. The names:

- `server/lib/servedText.js`: `sha256Text(s)`; the not-minted book list and its predicate.
- `server/lib/researchScope.js`: the study allowlist and `isStudyBook(book)`.
- `server/lib/editOrigins.js`: the write-path vocabulary (`EDIT_ORIGINS`, `RESERVED_EDIT_ORIGINS`), which PR3's
  `record` validates against.
- `server/services/servedVersions.js`: annotate a served list (occurrence, `baseSha256`, the duplicated ids) and mint
  versions in one `sessions.db` transaction, returning their ids.
- `server/services/servedEdit.js`: `saveOnServedBase(…)` and its refusal codes.
- `server/lib/schemaHealth.js`: the expected tables and columns, and the check.
- `server/__tests__/researchBoundary.test.js`: the boundary assertions, extended per PR.
- `server/public/js/segment-save-state.js` (client, DOM-free): the row values, request bodies, drafts and the assist
  item shape, including `ITEM_SOURCES`, which G1.23 extends and PR3 reads; and `saveRetry.js`'s key policies and
  parking (`setKeyPolicy`, `takeParked`).

PR2's plan owns the opening step's seam (`moduleOpenings.js`, and what the `module-opened` event receives). PR3's plan
owns `researchLog.record(…)`'s input (spec §5.9's list plus two fields, as PR3's plan lists them) and the before-image shape each
service returns; where PR1's plan proposed one (its "before-state PR3 needs" table), PR3's supersedes it, notably
propagation's per-target facts, which travel in a separate `writes` key the route strips, never on the entries the
route sends. PR4 and PR5 consume them.

## Global Constraints (every PR)

- **Test first, one commit per task.** Every task writes its failing test, runs it and sees the predicted failure,
  then implements. `Expected:` lines are predictions at `ed10180c`, not facts.
- **The gate is what CI runs, not a subset** (CLAUDE.md § CI): `npm test` from the repository root (diff the failing
  set by name against `main`'s, never the count); `npm run lint` **and** `npm run format:check` (CI's Lint job runs
  both; `server/**/*.js` is in both); `npm run docs:check` whenever a route line or a file in `server/routes/` changes
  (it regenerates `docs/_generated/routes.md`, which must be committed); `cd server && CI=1 npm run test:e2e` for
  anything touching a route or `server/public/js/`; `npm audit --audit-level=high` in both trees only if a dependency
  is added (none is planned). `git status --porcelain` empty at the end.
- **Module systems:** `server/` is CommonJS; root is ESM; tests `import` vitest and `createRequire(import.meta.url)`
  for server modules (the header of `server/__tests__/importConcepts.test.js:9-11`). `tools/lib/mt-layers.js` is ESM,
  so its one-line hash is ported, never required (§5.3).
- **better-sqlite3 resolves only from `server/node_modules`,** so every script that opens either database lives under
  `server/`. Never `node:sqlite`, never a cwd-relative require.
- **Paths from `__dirname` or `resolveDbPath()`, never `process.cwd()`.** The server runs with cwd `server/`.
- **Never-throw migrations and schema steps** (`048`). `INSERT OR IGNORE` does not suppress a foreign-key violation, and
  foreign keys are on in this build (CLAUDE.md § Tech Stack).
- **Organic never** (CLAUDE.md § Organic): nothing mints, opens or captures for `lifraen-efnafraedi`, and every write to
  it is refused.
- **No research field in any column the module route sends** (`SELECT *`), no time of a person in any response, no
  read route to research tables (§11).
- **`process.exitCode`, never `process.exit()`, after output** in new scripts; a script whose exit code is a verdict
  sets a failure default on entry (CLAUDE.md § Commands). New admin scripts are dry-run unless `--write`
  (`server/scripts/close-pending-edits.js`). The one exception is the Node half of a cron job whose writing
  subcommands only its own shell script runs (PR4's `research-backup.js`, PR4's decision 42).
- **A decision that changes what the frozen spec says is built only after [USER]'s yes.** The yes is recorded as a
  dated `✏️ AMENDED` block on the spec, in a commit that carries only that edit, before the task that builds the
  decision. A no builds the decision's named fallback. The twenty such decisions in these plans were approved on
  2026-11-04 and are recorded in the spec's `✏️ AMENDED 2026-11-04` block, so no spec commit is owed before any task. A
  departure found while building follows the same rule.
- **Grep with `-a`.** `server/scripts/verify-b4b0-gates.js` and `server/services/termMiningService.js` hold NUL bytes.
- **A mutation check restores from a golden `cp`, never `git checkout`; `git status --porcelain` after any agent that
  mutates files goes quiet** (CLAUDE.md § Commands).
- **Nothing committed names a grant or fund.** Commit messages end with the executing session's attribution trailer
  lines, after a blank line. The `git commit` lines in the PR plans carry no trailer, so the executing session
  appends its own.
- **No count, test total or CI verdict in prose** in any document a PR touches.

## Review Focus (cross-PR)

1. **A page loaded before PR1's deploy** sends no `baseSha256`. It must get `BASE_MISSING` with the reload-the-page
   message, never a pass. Its old `saveRetry` drops the replay with a toast, which this plan cannot change for old
   pages. → PR1.
2. **`chapter-metadata`** is one module id for 21 chapters: the chapter is in every new key, so a ch02 serve neither
   mints ch05's versions nor opens ch05. → PR1, PR2.
3. **A layerless module** (no faithful and no MT file) mints nothing and refuses every write. → PR1.
4. **A duplicated id** gets no served-version row, no `baseSha256`, and every write is refused or skipped
   (`DUPLICATE_ID`), including a propagation target. → PR1.
5. **Two branches taking the same migration number**, or the hand-copied `segmentEditsSchema.cjs` missing a column. →
   decisions 9–11.
6. **The opening predicate's fail-open neighbours:** an admin, a head editor, or an editor with no row while colleagues
   hold rows must never set the opened time. → PR2.
7. **A decliner's or an undecided editor's act** reaches neither the research file nor the loss ledger, even with the
   research file down. → PR3.
8. **A deletion promise broken by a copy:** the editorial backup's globs, a stale `-wal`, a backup taken after a
   withdrawal, a restored file. → PR4.

## Production checks (spec §9), and who runs them

| Check | When | By |
|---|---|---|
| G-1d | before PR2 merges | the probe (PR2), sent on stdin from the PR2 branch (PR2's last task); [USER] makes the §9 choice if chemistry holds rows |
| G-1c, G-1e, G-1f, G-1g | with G-1d (same run) | the probe |
| G-1a | before the first consented row | [USER] in Linode's console; the probe's crontab half (PR4) |
| G-1b | before the first consented row, and again after G1.20 lands | [USER] or the builder, in the provider's console |
| G-1h | before the first consented row | the probe (PR4), after the cron line is installed and one `--write` run completed |
| G-4 | before G1.12, not before PR1 (decision 8) | the builder, in the repository |
| G-5 | the first step of PR1 | the builder (re-grep) |

Every production run is read-only and is recorded in the register by its output.

## Before each PR, and merging

1. The gate, as above, on the branch's tip.
2. **A whole-branch adversarial review.** The newest practice is a blind pair, Opus and Fable on the same brief, neither
   seeing the other's findings; **ask [USER] before commissioning the Fable half.** The alternative is a review
   workflow with several lenses and a skeptic per finding. Fold confirmed findings in as their own commits.
3. **Push, open the PR (draft), and deploy only on [USER]'s go.** Merge as a **merge commit**, never squash or rebase
   (the register cites individual SHAs).
4. **A push to `main` from dev puts prod's content backup behind until the next deploy** (CLAUDE.md § Content
   delivery): deploy after merging, or expect the next content tick to fail.
5. A new top entry in the register: what merged, what was measured, what is next.

## Questions for [USER], across the five plans, and the answers

### Answers ([USER], 2026-11-04)

[USER] answered **"Yes for all"** to the list below, then clarified four points the same day:

1. **Five questions phrased so that "yes" changes the plan are adopted:**
   - PR1 d39: a replayed save passes the displayed check when the displayed row already holds exactly the text being
     saved;
   - PR1 d28: a 5xx that exhausts the retries is parked too, never dropped with a toast;
   - PR1 Review Focus 1: the server's `BASE_MISSING` message also tells an old page's editor how to keep the text
     before F5: copy it, or answer Cancel to the page's own "close open panes" confirm, which is the prompt that
     actually appears. *(✏️ The controller's brief first said "the browser's leave-page prompt"; PR1's editor found
     in the code that the page's confirm comes first, and that Cancel at the browser's prompt only keeps the old page.
     See PR1 decision 20.)*
   - PR3 d49: `SEGMENT_CONFLICT` and the accept's eligibility refusals are also logged as `write-refused`;
   - PR3 d65: a saved or propagated text identical to another editor's live edit is stored as its hash only.
2. **PR4:** the research backup's log carries a verdict only per run (ok, or failed and which step), never interval ids
   or counts.
3. **PR5:** the end-of-editing export and the eligibility file run on the production host, by hand, reading the live
   `sessions.db` read-only; their output stays in that host's gitignored `pipeline-output/`.
4. **§C209** is fixed in a separate small PR now, not in these plans.

What follows from that:
- **Departures.** All twenty (the eighteen in table 1 plus PR1 d39 and PR3 d65) are recorded in the spec's
  `✏️ AMENDED 2026-11-04` block.
- **Behaviour choices.** Every other one is approved as written. The Icelandic proposals are approved as proposed,
  except a string the approval pass added or changed, which [USER] checks before its PR opens.
- **Asked for later, not in these PRs** (the register owns them):
  - E2E seeding to prove an opening end to end (PR2 d14);
  - an admin path for a lost research file (PR4 d33);
  - the consent text saying that the request log shows a withdrawal was posted (PR3 Review Focus 12; a dated note under
    G1.4 in the Skerfur plan).
- **Built after all:** the C16 runbook names exit code 6 (PR1 d16), in PR1 Task 17.
- **Still open, at PR2's time:** who runs the production probe, and the §9 choice if chemistry holds assignment rows.
- **Reviews.** The Fable half of each whole-branch blind-pair review is commissioned.

**Later answers ([USER], 2026-11-04, after the merge of #620):**
- **Wording.** "Síðan var hlaðin" becomes "Síðunni var hlaðið" (hlaða takes the dative). It is corrected in every
  proposed string that uses the construction: PR1's `BASE_MISSING`, `STALE_BASE` and `STALE_DISPLAYED`, and PR3's
  `CONSENT_TEXT_CHANGED`. The other strings the approval pass changed (`UI.draftNotice.refused` and the park toast)
  are approved as written.
- **A replay that network errors exhaust is kept too,** like one that 5xx answers exhaust (PR1 decision 28, Task 7).
  It is no longer dropped with a toast.

### The list as [USER] saw it

Gathered from every plan's own Decisions and Questions by a cross-check of all five. Each plan's text, with its reason,
is the full statement; this list points to it.

**1. Departures from the spec's wording,** each now approved and recorded in the spec's amendment block.

| Plan, decision | What it does beyond the spec's wording |
|---|---|
| PR1 d3 | `checks.schema` also reports the unique index `idx_served_text_versions_key` (§5.20 names tables and columns) |
| PR1 d7 | `STALE_DISPLAYED` also fires when `displayedEditId` names a row of another book, module or segment (§5.6 step 4) |
| PR1 d36 | past `express.json`'s 1 MiB, the sent body drops `detail.text` from the oldest whole-text assists; the draft keeps all (§5.10, §14 call 18). Fallback: such a save answers 413 and keeps its text |
| PR1 d39 | *not adopted:* a replay whose displayed row already holds the replayed text would pass the displayed check |
| PR2 d4 | a throw in the users or assignment lookup on a chemistry serve answers 503, not "predicate not met" |
| PR3 d9 | a before-image never stores identity raw, the actor's own included; only the actor's own times are kept (§5.9's field table, §14 call 14) |
| PR3 d26 | the consent POST requires the text version the page showed, and answers 409 `CONSENT_TEXT_CHANGED` when it is stale |
| PR3 d48 | apply's per-row outcomes go in the event's detail, not its content |
| PR3 d54 | propagation stores the client's text once, not again in every target event's detail |
| PR3 d60 | T11's apply arm runs on chemistry in a temporary books root with the apply hold stubbed (the spec's "non-held fixture book" cannot be captured) |
| PR4 d9 | only withdrawals set `deletion_done_at_ms`; retention writes its own `research_deletions` row (§5.15 vs §5.22) |
| PR4 d10 | an export directory that cannot be emptied keeps the interval due |
| PR4 d11 | retention stays due until its deletion is recorded |
| PR4 d12 | retention refuses `--write` for want of a derived dataset only when something is due |
| PR4 d18 | the paper-consent script is not a §5.22 exception (it names no forbidden table) |
| PR4 d19 | a paper decision must name the current approved text version |
| PR4 d20 | a paper decision's time is when it is recorded |
| PR5 d7 | a reviewed-but-unapplied text's `final_sha256` is taken over its served (loader-normalised) view |

**2. Behaviour choices, built as written unless [USER] says no.**
- PR1 d2: live foreign keys from the two `served_version_id` columns (G1.15 must clear them before deleting a version).
  PR2 d2: the snapshot's foreign key to its opening, with cascade.
- PR1 d14: `POST /edit` answers 400 to a non-string `editedContent` (today a number is stored as text).
- PR1 d16: the re-attach script's new exit code 6; should the C16 runbook name it?
- PR1 d28: a 5xx that exhausts the retries is still dropped with today's toast; park it too?
- PR1 d31: *Hætta við* and *Endurstilla* ask before discarding a text a refused save kept.
- PR1 Review Focus 1: should `BASE_MISSING`'s message tell an old page's editor to answer Cancel to the closing prompt,
  or copy the text, before F5?
- PR2 d3: a deactivated account with a valid token still opens a unit it is assigned to (the spec's predicate).
- PR2 d13: only `OPENING_UNRECORDED` takes the module away; other failed reloads leave saveable rows on screen.
- PR2 d14: seed a users row and an assignment into E2E later, to prove an opening end to end?
- PR2 d29: `close-pending-edits.js` refuses in code once a unit has opened (not only an operational rule).
- PR3 d16: a replay with no client time is neither captured nor counted.
- PR3 d25: PR3 ships the consent routes and no consent page (G1.4 decides in-tool versus paper).
- PR3 d49: log `SEGMENT_CONFLICT` and the accept's eligibility refusals as `write-refused` too?
- PR3 d65 *(open)*: when a save or propagation sends text identical to another editor's live edit, keep only its hash?
- PR3 Review Focus 12: the request log shows that someone posted a withdrawal, and when (not who); should the consent
  text say so?
- PR4 d21: with the research file absent, the paper script refuses a consent but records a withdrawal or decline.
- PR4 d29: the monthly restore test holds a decrypted research copy for the minutes it runs.
- PR4 d32: a restore deletes the live file it replaces rather than keeping it aside.
- PR4 d33: a lost research file with no copy stays missing until [USER] decides; build an admin path later?
- PR4: the backup's log carries withdrawn interval ids and step outcomes; or a bare verdict from cron?
- PR5 d6: "never the running server" read as "never inside the server process"; run the export on the production host,
  or in a dev clone with a `sessions.db` copy?
- PR5 d9: an active acceptance beside an approved, unapplied edit is decided for the edit ("newest" read as the newest
  decision).
- PR5 d17: a never-opened module reads "no", so research cannot tell it from "opened before the switch-on".
- PR5 d20: the raw research export carries no stratum (G1.5's).
- PR5, found while planning: applying one chapter's `chapter-metadata` stamps other chapters' winners applied and lapses
  their acceptances. It is blocked while the hold is on; it needs a register entry and an owner before the hold lifts.

**3. Wording to check** (Icelandic, all proposals): PR1 d20 and its Before the PR item 4 (the server's refusal
messages, `UI.refusal.*`, `UI.draftNotice.*`, the park toast); PR2 d28 (`OPENING_UNRECORDED`, server and client); PR3
d64 (the consent route messages). PR4 and PR5 add none.

**4. Production steps that need [USER]**
- Every PR: commission the Fable half of the blind-pair review or not; push, PR and deploy only on [USER]'s go. After
  PR1's deploy, tell the editors that a page loaded before it answers `BASE_MISSING` until F5.
- PR2's last task (gates its merge): run the read-only probe on production, or authorise it; the §9 choice if chemistry
  holds assignment rows.
- PR3: the first deploy runs the old `deploy.sh`, so events say `git-head` until the second (nothing is captured before
  a text is listed).
- PR4, before the first consented row: escrow the research passphrase; create its own bucket (versioning off, a
  bucket-limited key) and its crypt remote; install the printed cron lines; hand-run the backup and its restore test;
  G-1a in Linode's console and the probe's root run (`--sections G-1a`); G-1b in the provider's console (again after
  G1.20); G-1h; the data protection officer's review of G1.4's text; then [USER] lists the text.

## Not in this plan

G1.3's tick capture; G1.4's consent wording and the officer's review; G1.5's protocol and the derived dataset;
G1.6's analysis; G1.7's freeze manifest and markers; G1.12's duplicate-id fix; G1.13's assignments; G1.15's retention
rule for editing records; G1.20's editorial backup changes; G1.23's suggestion view, its switch route and its events'
emission; re-attach by content (10-10 plan 4.2), and with it §5.9's re-attach emission, whose call shape PR3's
handoff records.
