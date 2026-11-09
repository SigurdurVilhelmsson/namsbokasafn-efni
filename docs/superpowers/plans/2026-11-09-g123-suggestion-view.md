# G1.23 — AI term suggestions in the segment editor — Implementation Plan (index)

> **For agentic workers:** this file is the index. Each PR has its own plan file (table below); execute one PR's plan
> task by task, in order, test first. Steps use checkbox (`- [ ]`) syntax. REQUIRED SUB-SKILL: use
> superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. **The tree wins:** where a
> measurement disagrees with a plan, stop, say so, and re-derive; never force the plan's expectation.

**Goal:** show the AI term pass's kept changes (layer 2) to chemistry editors as inline suggestions they take or
refuse per ruling, log every accept, reject and left-open twice (an editing record the screen uses, and a research
event through G1.2's one call), and switch the view on per book before any unit opens.

**Architecture:** three pull requests. PR1 builds the read side and changes nothing an editor sees: the change-log
reader, the drop filter, the eligibility and integrity rules, the placement rule, migration `057`, and step 5 of the
module route. PR2 builds the write side on the server: the accepted list on a save, the reject route, left-open at
the two finishing acts, the save-time claim check, and the two research emitters. PR3 builds the screen and, last,
the route that writes the per-book switch, so the view cannot be switched on before editors can see it. Everything
the screen depends on lives in `sessions.db`; G1.23 writes nothing to `research.db` except through `researchLog.record`.

**Tech Stack:** Node 22, Express (CommonJS under `server/`), better-sqlite3 13 (only in `server/node_modules`), browser
JS with no build step (`server/public/js/`, classic scripts; DOM-free files are dual-mode IIFEs that also set
`module.exports`), Vitest from the repository root (`environment: 'node'`, no DOM), Playwright E2E
(`cd server && CI=1 npm run test:e2e`).

**Spec:** [`docs/superpowers/specs/2026-11-02-suggestion-view-design.md`](../specs/2026-11-02-suggestion-view-design.md)
(frozen, approved 2026-11-03). **Read order:**
1. The active register's newest ⏩ RESUME entry (`docs/plans/2026-07-21-post-item17-followup-campaign.md`, top).
2. The G1.23 spec, whole, starting with its `✏️ AMENDED 2026-11-09` block, which carries this plan's approved
   departures and answers.
3. The G1.1 + G1.2 spec ([`2026-11-03-served-version-and-event-log-design.md`](../specs/2026-11-03-served-version-and-event-log-design.md)):
   §5.4 (step 5's place), §5.8, §5.9 (the event table and `served_version_id` sources), §5.10, §5.11, §5.13, §7, §8's
   G1.23 row, §11.
4. The three decision records the G1.23 spec names in its §1 (2026-10-28 term pass, 2026-10-28 rule layer,
   2026-11-02 short look), and the Skerfur plan's §4.3 (the B3 fence).
5. This index, then the PR's own plan.

## State of this plan (read first)

- **Written 2026-11-09, pinned to `main` = `47fee618e`.** Every `path:line` in these plans was read at that tree. If
  the tree has moved, trust the named construct over the number, and re-derive.
- **Approved 2026-11-09:** [USER] answered all eight questions at the end as written ("I approve all 8 points"). The
  departures and answers are in the G1.23 spec's `✏️ AMENDED 2026-11-09` block, as was done for G1.1 + G1.2 on
  2026-11-04. Work status lives in the register, never here.
- **`Expected:` lines are predictions.** No test named here exists yet. The corpus numbers were measured on
  2026-11-09 with read-only probes that replicate the rules (method in decision 15); each PR re-measures them.
- **The spec's premises are hypotheses** (CLAUDE.md § One source of truth). Each task's first step re-reads the code
  it is about to change.

## The three PRs

| PR | Plan | Holds | Gate | Needs on `main` | Migration |
|---|---|---|---|---|---|
| **PR1** | [the read side](2026-11-09-g123-pr1-read-side.md) | `suggestion-placement.js` (dual-mode), `suggestionLogs.js`, `suggestionView.js` (read half), `moduleOpenings.readOpening`, migration `057` (two tables and one column), module route step 5, the reference artifact, acceptance checks 1–3 | inert: no switch row can exist, so no segment carries `suggestions` | G1.1 + G1.2 PR1–PR3 (on `main` and deployed) | `057` (predicted) |
| **PR2** | [the write side](2026-11-09-g123-pr2-write-side.md) | the accepted list on save and re-save, the reject route, left-open at *Staðfesta MT* and approval, the claim check in `CLAIM_VALIDATORS`, `emitSuggestionReject` / `emitSuggestionLeftOpen` | inert (no switch row) | PR1 | none |
| **PR3** | [the screen and the switch](2026-11-09-g123-pr3-screen-and-switch.md) | the client (swaps, GG tags, *Nota*/*Hafna*, ruling lines, drafts), the switch writer and its admin route and control, E2E checks 4–6 | **live only once [USER] switches it on** (production procedure below) | PR2 | none |

## Decisions the plan takes

1. **Three PRs, the switch writer last.** Nothing writes `book_switch_events` today (`server/lib/bookSwitches.js:6`:
   "G1.23 writes the rows; this file only reads"). Shipping the writer with the screen means the book cannot be
   switched on while editors would see nothing, which would make every module opened in that window "eligible"
   though no suggestion was shown.
2. **Where the code lives.**
   - The change-log reader, drop filter, eligibility and integrity rules are server-own: `server/lib/suggestionLogs.js`
     and `server/services/suggestionView.js`. No `.cjs` module: no tool consumes this reader (tools read layer 2
     through `tools/lib/mt-layers.js`, ESM, whose reader is private).
   - The §6.5 placement rule is **one** file, `server/public/js/suggestion-placement.js`, a DOM-free dual-mode IIFE
     (global `suggestionPlacement`, plus `module.exports`), like `segment-save-state.js`. The browser uses it to show
     swaps and re-find GG tags; the server requires it for the save-time claim check and for `shown_at_finish`.
     Precedent for server → `public/js`: `server/services/moduleOpenings.js:53` requires `accept-eligibility.js`.
3. **The opening is read in a service.** No reader exists. PR1 adds `readOpening` to `moduleOpenings.js`.
   `researchBoundary.test.js` forbids any `routes/` file from naming `module_openings`, `module_opening_inflight` or
   `opened_at_ms`, and no opened time or switch time may reach a browser (G1.1 + G1.2 spec §11).
4. **Eligibility** (spec §6.2) is, in this order: the book is a study book (`isStudyBook`, G1.1 + G1.2 §8: "a book off
   the study allowlist records no opening, so G1.23 treats its modules as never eligible"); the switch's current value
   is on; its first switch-on time exists; the module's opening exists; and **`firstSwitchOnMs < openedAtMs`,
   strictly**. A tie is not eligible. *(The current-value clause is question Q6.)*
5. **Integrity** (spec §6.3) compares the route's `seg.baseSha256` with the `beforeSha256` of the first record in the
   segment's full chain, before the drop. G1.23 never hashes `is`. A segment without `baseSha256` (a duplicated id, a
   book that is not minted) gets no suggestions.
6. **The snapshot** (spec §6.3a): a `module_opening_inflight` row with `occurrence = -1` covers every occurrence of its
   segment id (`snapshotRows`, `moduleOpenings.js:108`).
7. **The response.** Step 5 adds one per-segment key, `suggestions: { groups, tagged }`, **only on segments that have
   a group or a tag**, so every other module's JSON is unchanged. No key at any depth may match
   `researchBoundary.test.js`'s `FORBIDDEN_KEY` (`opened|switched|inflight|…|research|consent`); no time is sent. PR1
   adds the key to `MODULE_JSON_ALLOWED`, so PR2 and PR3 do not contend for it.
8. **Storage** (migration `057`, never-throw, the `048` shape): `suggestion_rejections`, `suggestion_left_open`, and
   `segment_edits.accepted_suggestions` (JSON text, NULL meaning none). The column is classified `dropped` in
   `server/lib/researchFilter.js`'s `BEFORE_FIELD_CLASSES`, because research never reads G1.23's editing rows (G1.1 +
   G1.2 spec §5.22); its drift guard (`researchFilter.test.js`, "every column of both tables is classified") would
   otherwise go red. The two tables join `FORBIDDEN_TABLES` in `researchBoundary.test.js` (the comment there reserves
   the place).
9. **The accepted list is screen state, so it travels in its own save-body field**, `acceptedSuggestions:
   [{ opId, occurrence }]`, never in the research-only `assists`. On the client the pane's assist list stays the one
   record (it is already in drafts); `acceptedSuggestions` is derived from its `ai-suggestion` items at save. The
   server keeps only entries whose op is in the module's change log for that segment and occurrence and whose
   `replace` text is in the saved text. On re-save it keeps the old list plus the new, minus any whose `replace` text
   is gone (spec §7).
10. **A reject on a stale base is checked, marked, never refused.** The echoed `baseSha256` and a mismatch flag go in
    the event's detail; the reject is keyed on the op, so it hides the change on any base. Its `served_version_id` is
    the current base, minted on the server (G1.1 + G1.2 §5.9). *(Question Q4.)*
11. **Left open is written for every group still open at the finishing act**, at *Staðfesta MT* and at a head editor's
    approval: every group that passes the static rules (§6.1–6.4, §6.6) and is not in the finishing edit's accepted
    list. `shown_at_finish` records whether the group still placed on the finished text (§6.5), so a typed-over group
    is counted and told apart. The editing rows are written whatever the actor's consent; the research events go
    through `record`, so a declining approver's closures leave editing rows and no event (G1.1 + G1.2 §5.9). *(Question
    Q5.)*
12. **The claim check** (G1.1 + G1.2 §5.10) marks an `ai-suggestion` item `validated` only if its op is in the
    module's kept change log for that segment and occurrence, its group passed the static rules, the group places on
    the text that was on screen (the displayed edit's text, or the base `is_text` of the save's served version), and
    its `replace` text is in the saved text. Anything else is `mismatch`; a check that cannot run stays `unverified`
    (the existing `catch` in `claimAssistItems`).
13. **Chapter metadata goes through with no special case.** The module route accepts `chapter-metadata`
    (`server/middleware/validateParams.js:43`), the loader serves `chapter:title:ch02`, and its log follows the
    `<module>-changes.jsonl` naming. Excluding it would be the special case. *(Question Q2; departure A4.)*
14. **Provenance mismatches do not gate.** Three modules (`m68744`, `m68852`, `m68856`) now have a layer-1s overlay
    while their `revision.json` says `overlay: null`, so `verifyRevision` reports a mismatch. Suggestions are gated per
    segment by the base hash (§6.3), never per module by `verifyRevision`: a provenance mismatch is not a text
    mismatch, and the hash catches the real case when plan 10-10 4.1's loader starts reading layer 1s.
15. **The corpus numbers, and how they were measured** (2026-11-09, `47fee618e`, read-only `node` probes that load
    each module through `segmentParser.loadModuleForEditing` and replicate `drop-set.mjs`'s rule):
    3,438 change records in 170 logs (33 empty); 2,328 chains; the drop removes 100 groups, 265 changes (term 146,
    agreement 111, term-sense 8), leaving 3,173 kept (3,172 without chapter metadata); exactly 3 chains fail §6.3,
    all on duplicated ids; 8 kept changes depend on another group's change. PR1's Task 1 regenerates these as a
    committed artifact; its `Expected:` lines quote these values.
16. **The E2E unit is `ch02/m68693`, with a dedicated user.** No E2E spec touches chapter 2, while sibling specs serve
    `ch01` modules in parallel workers. An assignment row for a shared test user on chapter 1 could let a sibling's
    serve open `m68664` before the switch row exists, making it ineligible for the whole run. `m68693` has 113
    segments and 20 groups (17 of one change, 3 of more) and holds the spec's own dependent pair (`isomers` needs
    `spatial-isomers`, `ch02/m68693/003.op4`).
17. **The client keeps suggestion state in memory, not only in the DOM.** No function re-renders one row today, and the
    table is rebuilt wholesale after every open (`loadTermData` and `loadRepetitions` each call `renderSegments()`).
    So *Hafna* removes the group from the segment's `suggestions` in the module data `renderSegmentRow` already reads
    (`moduleData`), then redraws that row's suggestion parts in place with a new `refreshSuggestionView(segmentId)`,
    which never touches an open edit panel's textarea. It never calls `loadModule`, so a later full re-render agrees.
18. **Marker characters.** A group whose `find` or `replace` contains `[[`, `]]`, `**`, `__`, `<!--` or `|` is not
    offered (spec §6.5's last paragraph). Today no record has one.
19. **Fail-soft.** A missing, unreadable or malformed log or revision file gives that module no suggestions and one
    warning naming the module and the reason, never text and never an error page (spec §5).
20. **The B3 fence holds by construction.** An accepted suggestion is an `ai-suggestion` *item* on an `editor-save`
    row. `ai-pass` stays a reserved write-path *origin* for B3's own automatic writes (G1.1 + G1.2 §5.10 keeps the
    three vocabularies apart). The editing row's `accepted_suggestions` says which words came from the AI, which is
    what lets B3 exclude AI-derived forms from its "share written automatically". *(Question Q3.)*

## Departures from the frozen spec (approved 2026-11-09)

Each is recorded in the G1.23 spec's `✏️ AMENDED 2026-11-09` block. The spec text itself is not edited.

- **A1. ch10 is in scope.** Spec §3 says "ch10 … has no layer 2 … this view shows it nothing". [USER] ruled that ch10
  gets suggestions from a re-buy under the full run's inputs "so all 23 chapters share one condition" (register,
  "ch10: re-buy it"), and the re-buy wrote ch10's layer 2 on 2026-11-08 (register, "ch10's AI term pass re-bought").
- **A2. Check 1's reference set is regenerated over all 23 chapters.** `drop-set.json` (2026-11-02) covers the full
  run without ch10. The rule is unchanged; the population grew by ch10's 406 records. A new dated artifact holds the
  reference (PR1 Task 1); the 2026-11-02 file stays frozen as evidence. Measured: 265 dropped in 100 groups, of which
  ch10 contributes 12 changes in 6 groups.
- **A3. Check 2's integrity reference is three chains, not two:** `ch05/m68726:para:fs-idm94618544#0`,
  `ch08/m68747:para:fs-idm99049568#0`, and ch10's `m68773:para:fs-idp76470512#0`, all on duplicated ids. Measured on
  the loader's served `is`, not on raw file text.
- **A4. Chapter metadata is shown** (decision 13). Spec §3's non-goal rests on "the segment loader does not serve
  chapter metadata", which the G1.1 + G1.2 spec's §12 item 3 found false; it also names the wrong chapter (the change
  is in `ch02/chapter-metadata-changes.jsonl`, *Frumeindir → Atóm*). §12 there leaves the call to G1.23's builder.
- **A5. Spec §4's measured shape is stale** (it predates ch10): 3,173 kept changes now, not 2,778. Informational.
- **A6. Spec §12's "storage shapes for … the per-book switch and its switch-on time"** are settled by G1.1 + G1.2
  (`book_switch_events`, read by `bookSwitches.js`). G1.23 builds only the writer and its route.

## Test placement

| What | Where | PR |
|---|---|---|
| The placement rule (pure) | `server/__tests__/suggestionPlacement.test.js` | 1 |
| The reader, drop and fail-soft | `server/__tests__/suggestionLogs.test.js` | 1 |
| Eligibility, integrity, snapshot, duplicates, closed ops, the offered set | `server/__tests__/suggestionView.test.js` (temp DB via `helpers/freshMigratedDb`) | 1, 2 |
| Acceptance checks 1–3 over committed layer 2 | `server/__tests__/suggestionCorpus.test.js` | 1 |
| Migration `057`, `checks.schema` | `server/__tests__/migration057.test.js` plus the existing schema-health test | 1 |
| Module route step 5, response keys, T10 byte-identity | `server/__tests__/moduleRouteSuggestions.test.js` (the `router.stack` / `invoke` pattern of `acceptanceRoutes.test.js`) plus `researchBoundary.test.js` additions | 1 |
| Save, reject, left-open, claim check, emitters | `server/__tests__/suggestionWrites.test.js`, `server/__tests__/suggestionEmission.test.js` | 2 |
| Client DOM-free values (`segment-save-state.js` additions) | `server/__tests__/segmentSaveState.test.js` | 3 |
| Client source pins for `segment-editor.js` | `server/__tests__/suggestionClientPins.test.js` (the `fnBody` pattern of `servedBaseClientPins.test.js`) | 3 |
| The switch writer and its route | `server/__tests__/suggestionSwitch.test.js` | 3 |
| End to end (checks 4–6) | `server/e2e/suggestion-view.spec.js` | 3 |

Every test that asserts "not shown" also asserts that a sibling group in the same fixture **is** shown (spec §9.6).
Every check compares values or sets, never only counts.

## Cross-PR interfaces

Names later PRs rely on. Each owning task's **Interfaces** block gives the exact signature.

- `server/public/js/suggestion-placement.js` (PR1): `MARKER_TOKENS`, `hasMarker(s)`, `applyOnce(text, find, replace)`,
  `placeGroup(text, group)`, `visibleGroups(text, groups)`, `tagSpans(text, changes)`.
- **The group shape** (PR1), sent to the browser and used by the server:
  `{ key, segmentId, occurrence, rulingId, source, label: { en, is }, changes: [{ opId, occurrence, find, replace,
  category, runId, chainIndex }] }`, with `key = "<segmentId>#<occurrence>|<rulingId>"`, changes in chain order, groups
  ordered by their first `chainIndex`.
- `server/lib/suggestionLogs.js` (PR1): `DROPPED_CATEGORIES`, `readModuleLog({ book, chapter, moduleId }, opts)`,
  `dropFilter(log)`, `keptGroups(log)`, `firstBeforeSha256(log, segmentId, occurrence)`. No cache for the logs (one small file per
  module load); only the ruling set's labels are kept in memory, keyed on path and sha256.
- `server/services/suggestionView.js` (PR1): `isEligible(conn, key)`, `closedOpKeys(conn, key)`,
  `moduleContext(conn, key)`, `staticGroupsFor(ctx, segment)`, `offeredForModule(conn, input)`. PR2 adds
  `acceptedForSave(log, input)` (pure), `displayedTextForSave(conn, saved)`, `checkAcceptedGroups(conn, input)`,
  `recordRejection(conn, input)`, `closeLeftOpen(conn, input)`.
- `suggestionPlacement.withSentinels(text, marks)` and its `SENTINEL` constants (PR3), for drawing swaps through
  `renderMarkdownPreview` without splitting an inline marker.
- `server/services/moduleOpenings.js` (PR1): `readOpening(conn, { book, chapter, moduleId })`.
- The reject route (PR2): `POST /api/segment-editor/:book/:chapter/:moduleId/suggestions/reject`.
- The save body field (PR2 reads, PR3 sends): `acceptedSuggestions`.
- `researchEmission.emitSuggestionReject`, `researchEmission.emitSuggestionLeftOpen` (PR2).
- `server/services/suggestionSwitch.js` `setSuggestionView(conn, { book, enabled, nowMs })` and
  `POST /api/admin/books/:book/suggestion-view` (PR3).

## Global Constraints (every PR)

- **Organic** (`lifraen-efnafraedi`): nothing reads, offers, writes or switches anything for it. Its modules have no
  `baseSha256` and no layer 2; the switch route refuses it.
- **No layer-2 writes.** `02-mt-revised/` and `ai-review/` are read only. **Never** read `<module>-segments.is.md`.
- **Paths** resolve from the file's own location (`__dirname`), never `process.cwd()`. Chapter dirs come from
  `server/lib/chapterLabel.js` `chapterDir()`; appendices are the `-1` sentinel.
- **CommonJS under `server/`**; tests are ESM with `createRequire` (copy the header of `server/__tests__/moduleOpenings.test.js`).
- **Migrations never throw** (the `048` shape: `up(db)` is only the try/warn boundary), are added to the explicit
  list in `server/services/migrationRunner.js`, and land with their `EXPECTED_SCHEMA` entry in
  `server/lib/schemaHealth.js` in the same commit. Re-check `ls server/migrations` before merging.
- **Never `INSERT OR IGNORE` across a foreign key** in a migration; it does not suppress FK violations.
- **Never send a time, an opened state or a switch state to a browser** (G1.1 + G1.2 §11); never a research field.
- **Routes reach research only through `researchEmission` emitters**; G1.23 never checks consent.
- **The editing record is written first and committed; the research call runs after and never changes the response.**
- **A segment id's `elementId` is `[\w-]` only**; DOM ids come from `cssId()` (`segment-editor.js:3126`).
- **`DROPPED_CATEGORIES = ['agreement']`**, one value in code; changing it regenerates nothing.
- **Use `grep -a`** in every census (committed files hold NUL bytes).

## Review Focus (cross-PR)

The input classes most likely to bite an editor that no single task's tests would otherwise reach, most likely
first. Each line names the task that adds its test.

1. **An editor has typed in a pane, then accepts or rejects on that row.** The typed text must survive; *Nota*
   applies to the pane's text, and *Hafna*'s row re-render must not close a dirty pane. → PR3 Task 4.
2. **Two editors, one group.** A rejects a group while B holds it accepted in an unsaved pane; B saves. B's save keeps
   B's text and accepted list (the record says what B's edit took), and its item is marked `mismatch`. → PR2 Task 2.
3. **A reload or tab crash after accepting, before saving.** The restored draft re-tags the accepted words and still
   sends their items and accepted list. → PR3 Task 3.
4. **A save refused with 409 after accepting** (`STALE_BASE`, `STALE_DISPLAYED`). The typed text and its accepted
   items go to the draft, as for any refused save (G1.1 + G1.2 §5.18). → PR3 Task 3.
5. **A module whose log or ruling labels are damaged.** The editor gets the module, without suggestions, never an
   error page; other modules are unaffected. → PR1 Task 3 (service) and Task 6 (route).

## Production procedure

1. PR1 merged and deployed. `/api/health` `checks.schema` clean with `057`. No segment carries `suggestions`.
2. PR2 merged and deployed. Still inert.
3. PR3 merged and deployed. Still inert: no switch row exists.
4. [USER] previews the view on a local server (a local database, an assignment row for themself on a chemistry
   chapter, the switch on there). Production cannot preview it: an unassigned serve records no opening, so it is
   never eligible.
5. [USER] switches `suggestion-view` on for `efnafraedi-2e` on the admin page. **The first switch-on time can never
   move**, so this is done once, deliberately. The register records it. **Nothing becomes visible on production at
   this step:** chemistry holds no assignment rows (register, 2026-11-06), so no module can open, and an unopened
   module is never eligible.
6. **Before any unit opens** (not G1.23's to build; the order is recorded here): G1.7's freeze markers (G-1g), G1.12
   for the 83 affected modules (R4), and only then G1.13's assignments (R6), each only to an editor whose consent
   decision and licence clause are recorded.
7. Suggestions first appear when an assigned editor first serves a module: that serve records the opening (after the
   switch-on, so the module is eligible) and step 5 of the module route offers its groups in the same request.

## Before each PR, and merging

- Cut each PR's branch from `main` after the previous PR has merged.
- The gate, run locally as CI runs it: `npm test` from the root, `npm run lint`, `npm run format:check`,
  `npm run docs:check`, and `cd server && CI=1 npm run test:e2e`. The Actions tab owns the CI verdict.
- A docs-only change to `segment-editor.html` or `server/public/js/` still needs the E2E job.

## Questions for [USER] (all eight approved as written, 2026-11-09)

1. **Q1.** Approve departures A1–A6?
2. **Q2.** Show the one chapter-metadata change (ch02, *Frumeindir → Atóm*) with no special case (decision 13)?
   Recommended: yes.
3. **Q3.** Confirm the B3 fence reading in decision 20: accepted suggestions are items on an editor's save, and
   `ai-pass` stays reserved for B3's automatic writes.
4. **Q4.** A reject on a base that has changed since the screen loaded is flagged in the research event, never
   refused (decision 10)?
5. **Q5.** A group typed over by the time its segment is finished is still written as left open, with
   `shown_at_finish = 0` (decision 11)?
6. **Q6.** Switching the view **off** hides every suggestion at once (a kill switch), while the first switch-on time
   stays fixed, so switching it on again restores the same eligibility. Recommended: yes.
7. **Q7.** Only the admin role may flip the switch, and the first switch-on asks for a typed confirmation?
8. **Q8.** The Icelandic strings PR3 adds beyond the spec's: the button titles *Nota tillögu* / *Hafna tillögu* (the
   head editor's reject already uses *Hafna*); the failure toast *Ekki tókst að hafna tillögunni. Reyndu aftur.*; the
   admin control *Tillögur gervigreindar í ritli*; its first switch-on prompt *Sláðu inn heiti bókarinnar til að
   kveikja á tillögum gervigreindar. Fyrsti tíminn sem kveikt er á verður ekki færður.*; and the states *Kveikt* /
   *Slökkt*.

## Not in this plan

G1.15's retention rule for editing records, which must now also cover `suggestion_rejections`,
`suggestion_left_open` (each names a user id) and `segment_edits.accepted_suggestions`; rule suggestions' display and
module-wide accept-all (the data model carries `source` and the item shape carries `ruleId`); the term pass's notes
for editors (a later item); G1.12's duplicate-id fix, after which §6.4 lifts with no
data change; G1.7's freeze markers; G1.13's assignments; a general in-place row update (G1.21); plan 10-10 4.1's
layer-1s loader switch.
