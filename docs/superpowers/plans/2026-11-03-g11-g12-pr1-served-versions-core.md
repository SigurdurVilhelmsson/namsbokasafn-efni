# G1.1 + G1.2, PR1 — G1.1 core: served versions and the stale-base refusal — Implementation Plan

> **For agentic workers:** execute this plan task by task, in order, test first. Steps use checkbox (`- [ ]`) syntax.
> No plan-execution skill is installed in this repository, so follow the steps as written. **The tree wins:** where a
> measurement disagrees with this plan, stop, say so, and re-derive; never force the plan's expectation. Read
> [the index](2026-11-03-g11-g12-served-versions-and-event-log.md) first: its decisions, its test placement and its
> Global Constraints bind this plan.

**Goal:** every save and MT accept on a served base is checked against the text the server serves now, and every new
edit and acceptance row records the served version it was made on (G1.1), with the client echoing exactly what each
row shows and keeping the editor's typed text through any refusal (§5.18).

**Architecture:** one new table, `served_text_versions`, and seven new nullable columns on `segment_edits` and
`segment_acceptances` (one never-throw migration, predicted `053`). One hash function (`server/lib/servedText.js`),
one study allowlist (`server/lib/researchScope.js`), one served-version service (`server/services/servedVersions.js`)
and one write service (`server/services/servedEdit.js`, `saveOnServedBase`), which every edit writer goes through. The
module route mints the served versions and sends `occurrence` and `baseSha256` per segment and `contentSha256` per
edit row; the save route requires the echo; the accept route and propagation place, mint and record. On the client, a
new DOM-free module (`server/public/js/segment-save-state.js`) holds the value rules, `segment-editor.js` renders them
on each row and reads them back from the row's DOM, and `saveRetry.js` carries the refusal code, marks a
replay and parks any non-5xx answer to one. `checks.schema` and the research-boundary test start here and grow per PR. No research file and
no event: PR3 adds the emission at the points this PR refuses (index decision 2).

**Tech Stack:** Node 22, Express (CommonJS under `server/`), better-sqlite3 13 (only in `server/node_modules`), browser
JS with no build step (`server/public/js/`, `sourceType: 'script'`), Vitest from the repository root, Playwright E2E
(`cd server && CI=1 npm run test:e2e`).

**Spec, and the read order:**
1. [The index](2026-11-03-g11-g12-served-versions-and-event-log.md): decisions 1–17, the test placement table, the
   cross-PR interfaces and the Global Constraints.
2. [The spec](../specs/2026-11-03-served-version-and-event-log-design.md), whole; for this PR §5.2–§5.4, §5.6–§5.8,
   §5.10, §5.18, §5.20, §9 (G-5), §10 (T1–T5, T16–T18, T21, T23), §11, §13 and §13a. Frozen and approved as written;
   this plan does not reopen §14.
3. [The decision record](../../decisions/2026-11-03-research-capture-consent-and-retention-rulings.md) (R4 for this PR).
4. [G1.23's spec, §8](../specs/2026-11-02-suggestion-view-design.md): the contract this project meets (G1.23 reads
   `seg.baseSha256` and never hashes).
5. [The handoff](../../plans/2026-11-03-g11-g12-implementation-plan-handoff.md) §4 PR1 and §5 (frozen; pinned to
   `d24681b8`, the same `server/`, `tools/`, `scripts/` and `.github/` as `ed10180c`).

## State of this plan (read first)

- **Written 2026-11-03 for [USER]'s approval, as one of the five PR plans the index lists. No code before [USER]
  approves it.** Status lives in the register, never here.
- **Pinned to `main` = `ed10180c`.** Every `path:line` below was opened at that tree (its `server/`, `tools/`,
  `scripts/`, `.github/` and `LICENSE` are byte-identical to `d24681b8` and `3a1db909`). Once an earlier task has
  shifted a file, match each edit on the quoted construct, not the number.
- **Every `Expected:` line is a prediction at `ed10180c`, and none was run while drafting:** neither tree had
  `node_modules` in the drafting sandbox. Two premises were checked by read-only probes through `segmentParser`: T1's
  two mismatching chains (`m68726:para:fs-idm94618544#0`, `m68747:para:fs-idm99049568#0`), and that both
  duplicated-id modules serve the last copy's Icelandic for both occurrences while their raw MT copies differ. Run each
  red arm before implementing; where it fails for another reason, stop and re-derive.

## Decisions taken in this plan

Each is a §13 item, a seam the spec or the index leaves open, a reading of the PR1 wire contract, or a choice between
the two halves this plan was drafted in. **Three go beyond the frozen spec's wording and each needs [USER]'s yes**
before it is built as written: decision 3 (an index in `checks.schema`, §5.20), decision 7 (a third `STALE_DISPLAYED`
condition, §5.6 step 4) and decision 36 (the sent body may lose old whole texts, §5.10 and §14 call 18). Each keeps
the spec's behaviour as its fallback. A fourth candidate (decision 39) is not adopted. All four are listed under
"Questions for [USER]".

**Server and schema**

1. **`servedText.js` owns the not-minted list.** No server constant says "organic is not translated" today:
   `grep -rnaI lifraen-efnafraedi server/ --include='*.js'` outside `server/migrations/`, `server/__tests__/` and
   `server/node_modules/` finds only `server/config.js:102`, `:114`, `:132`, `:139` (the book list and its label),
   `server/lib/domains.js:91` (a glossary domain), `server/e2e/seed-fixture.js:61` (a label) and comments; none says
   the book may not be written. So `server/lib/servedText.js` exports `NOT_MINTED_BOOKS = ['lifraen-efnafraedi']` and
   `isNotMintedBook(book)`. `servedVersions.mintVersions` refuses a not-minted book on its own as a second line
   (Task 5), so no caller can mint organic even if it skips the route check.
2. **The migration (predicted `053-served-text-versions.js`; spec §13 names and types).**
   - `served_text_versions`: `id INTEGER PRIMARY KEY AUTOINCREMENT`; `book TEXT`, `chapter INTEGER`, `module_id TEXT`,
     `segment_id TEXT`, `occurrence INTEGER CHECK (occurrence >= 0)`, `en_sha256 TEXT CHECK (length(en_sha256) = 64)`,
     `is_sha256 TEXT CHECK (length(is_sha256) = 64)`, `layer TEXT CHECK (layer IN ('mt-output','faithful','selected'))`,
     `en_text TEXT`, `is_text TEXT`, every column `NOT NULL` (spec §5.2). `selected` is in the CHECK because §5.2 names
     it as the 10-10 plan's future layer and a CHECK cannot be widened without a table rebuild.
   - Unique index `idx_served_text_versions_key` on `(book, chapter, module_id, segment_id, occurrence, en_sha256,
     is_sha256, layer)`, in that order.
   - `segment_edits`: `served_version_id INTEGER REFERENCES served_text_versions(id)`, `occurrence INTEGER`,
     `origin TEXT`, `displayed_edit_id INTEGER`, `displayed_edit_sha256 TEXT`. `segment_acceptances`:
     `served_version_id INTEGER REFERENCES served_text_versions(id)`, `occurrence INTEGER`. All nullable (NULL means
     "made before G1.1", §5.8).
   - **A foreign key on `served_version_id`, none on `displayed_edit_id`.** Foreign keys are ON in this build (CLAUDE.md
     § Tech Stack), so the reference is live: no code path deletes a served version, and a writer passing a bogus id
     fails loud. A displayed edit, by contrast, is deleted by its author's withdraw (`segmentEditorService.js:110-112`),
     so a reference there would make a withdraw fail. No `CHECK` on `origin`: the reserved values (§5.10) would need a
     table rebuild; the vocabulary is a constant pinned by a test (decision 9).
   - **One never-throw boundary around the whole unit, and one transaction inside it** (`048`'s and `052`'s shape):
     a failure anywhere rolls back every step, warns once, and the next boot retries; no half-added column set.
3. **`checks.schema` also checks the unique index. Needs [USER]'s yes: it departs from §5.20's wording**, which
   defines the check as tables and columns (`PRAGMA table_info`). A missing `idx_served_text_versions_key` would let a
   re-serve insert duplicate versions silently, and costs one more name in `EXPECTED_SCHEMA`. The output is
   `{ ok, missing: [<table> | <table>.<column> | index <name>] }`: schema names only, no counts (§5.20 "nothing
   sensitive"). If [USER] says no, drop `indexes` from `EXPECTED_SCHEMA` and the index half of Task 4's second test.
4. **The wire contract's "the key is absent" means `baseSha256`; `occurrence` goes on every served segment**, organic
   and layerless modules included (spec §5.4 step 1 adds it to each served segment and step 2 withholds only the hash;
   it is computed from the served list and costs nothing). Each edit row gains `contentSha256`; nothing else is added to
   the module response (T17 pins the key sets exactly). The client tolerates either reading (`readRowValues` reads a
   missing `data-occurrence` as `null`), so the two halves agree.
5. **`NO_LAYER` is the code for a write to a module with no layer** (spec §5.6 step 2 names none): HTTP 409, like the
   other placement refusals. The client's `KEEP_TEXT_CODES` (Task 8) uses the same name.
6. **Placement until G1.12 (b)** (spec §5.6 step 3, §5.7): an id absent from the served list is `SEGMENT_NOT_FOUND`
   (today's 404 `{ error: 'segment not found' }`, unchanged on `/edit` at `routes/segment-editor.js:402-403`, on
   `/accept`, whose `acceptanceService.js:84-86` answers the same body through the route's `:927-929`, and on
   `/propagate`); an id occurring more than once is `DUPLICATE_ID` whatever occurrence a caller names; a single
   occurrence places at 0, and a caller-named occurrence other than 0 is `SEGMENT_NOT_FOUND`. The route sends none.
7. **The displayed pair** (spec §5.6 step 4): `STALE_DISPLAYED` when `displayedEditId` is set and the row is gone,
   **or is not a row of this book, module and segment**, or `sha256Text` of its current `edited_content` differs from
   `displayedEditSha256` (a null hash with a set id differs). **Needs [USER]'s yes: the middle clause departs from
   §5.6 step 4's wording**, which names only "gone" and "the hash differs". Under the spec's wording a row on another
   segment whose text hashes the same would pass; the plan refuses it, because a row on another segment is not the
   edit this row displayed. Safer, and it is the behaviour built; if [USER] says no, drop the `here` test in
   `saveOnServedBase` and the "row on segment `b`" case in Task 13. The pair is stored only when `displayedEditId` is
   set and `requireEcho` is true; otherwise both columns are NULL. A propagation's in-place UPDATE clears the pair (its
   text was not typed over a displayed edit).
8. **Step 6 mints even when the save writes nothing** (an identity save with no pending row): the version was
   presented as the base, minting is idempotent, and it keeps step 6 one shape. A mint failure in the save path fails
   the save (500): unlike the serve, a save must never write a row without its served version.
9. **The write-path vocabulary lives in `server/lib/editOrigins.js`** (spec §5.10 "one constant, pinned by a
   test"): `EDIT_ORIGINS = ['editor-save', 'propagation', 're-attach']` and `RESERVED_EDIT_ORIGINS = ['note-apply',
   'propagated', 'ai-pass']`. `saveOnServedBase` refuses any origin not in `EDIT_ORIGINS` (a programming error,
   `TypeError`).
10. **`saveSegmentEdit`'s re-save UPDATE always sets `original_content`**, for every caller, plus the five new fields
    (NULL for a caller that passes none). A legacy direct caller re-saving a row a served save made therefore NULLs its
    `served_version_id`: its base is now unknown, which is what NULL means (§5.8), and a stale id would be false. Side
    effect, intended: `scripts/reattach-segment-edits.js`'s UPDATE branch now writes the new MT, which its comments and
    operator warning call impossible (Task 12 fixes both). Its return shape is unchanged (`errorHandling.test.js:64`
    pins `reverted` undefined on an insert).
11. **`segmentEditorService` exports `getDb`.** Mint and save must share one connection and one transaction (§5.6
    step 6); `propagationService` already exports its `getDb` (`propagationService.js:20`, `:223`).
    `saveSegmentEdit`'s own transactions become savepoints inside `saveOnServedBase`'s.
12. **The accept mints inside `acceptSegment`'s INSERT transaction**, after the `existing` lookup, from the segment
    `acceptSegment` itself loaded and compared. So `alreadyAccepted` and the unique-index race loser
    (`acceptanceService.js:180-192`) write nothing, and the minted text is exactly the compared text. `acceptSegment`
    gains an optional `occurrence`; without it (its direct test callers) it writes NULLs as today.
13. **Propagation's classifier carries the new skips.** `classifyOccurrence` returns `'duplicate-id'` (before any
    existing-edit rule) and `'no-layer'` (`occ.layer === null`), so `propagation-preview` (which spreads `...o` into the
    classifier's argument, `routes/segment-editor.js:1457-1460`) and `propagate` agree without new code in the preview.
    **`createPropagatedEdits` builds a fresh object for the classifier** (`propagationService.js:103-107`: `currentIs`,
    `editorId`, `existingEdit` only), so that object gains `duplicated` and `layer`, or the skips never fire on the
    write path. A `'duplicate-id'` skipped entry carries `occurrence` (both copies of an id can match); other skipped
    entries keep their shape (`propagationService.test.js` `toEqual`s one). `createPropagatedEdits` refuses, before any
    write, an occurrence without a string `en`, a defined `layer` and an integer `occurrence`, as it refuses a missing
    `sourceEn` (`:76-80`).
14. **The save body's new fields are type-checked in the route.** `baseSha256` that is not a non-empty string counts as
    absent (`BASE_MISSING`); `displayedEditId` must be absent, null or an integer, `displayedEditSha256` absent, null or
    a string, else 400; `editedContent` must be a string (today a number slips past `segment-editor.js:351`'s falsy
    check), else 400 (a behaviour change, listed as a question). The research-only fields (`clientActionId`,
    `clientActionTime`, `assists`, `replayed`, `acceptOrigin`, `reviewedEditSha256`) are not read (index decision 4).
15. **The save success response adds exactly three fields**, named as the request fields the next save sends:
    `baseSha256` (the server base the save was checked against), `displayedEditId` and `displayedEditSha256` (the saved
    row's id and `sha256Text(editedContent)` when the save left an in-flight row; `null`/`null` when it withdrew or
    wrote nothing). `success`, `editId`, `updated`, `termWarnings` and `qaFindings` keep their meaning. These are the
    names the client's one reader, `segmentSaveState.echoAttributeUpdates` (Task 8), was drafted against, so no rename
    is needed on either side.
16. **The re-attach script's refusal** (index decision 7): code `STUDY_BOOK`, thrown first in `planReattach`
    (top-level `snapshot.book` or any row's `book`) and again in `applyReattach` (any restore row), and mapped by the CLI
    to **exit 6**, a new code (0–5 are taken: `scripts/lib/segment-edit-reattach-rules.js:132-138` and the script's
    `process.exit(5)`), with `process.exitCode`, before any planning output and before any database is opened.
    `scripts/__tests__/segmentEditReattachRules.test.mjs` gets no case: it tests pure rules that never see a book, and
    the refusal is in the script, which the other three files exercise.
17. **T1 serves through the route, and falls back to the row builder only where the spec says.** Every chain outside
    ch00 is checked against the `is_sha256` the route minted; only ch00 (unservable, `validateParams.js:29`) and an id
    the response itself shows duplicated use `servedVersions.versionRowsFor` on the loader's output. A missing minted
    row is a mismatch, never a fallback, so the test cannot pass on a route that mints nothing.
18. **Task 11 (the `original_content` audit) is a pin, not a behaviour change**, so its first run passes; its red arm
    is the built-in control (a planted reader in a temp root is named). It is test-first in that nothing is implemented
    after it, and it makes the next new reader of `original_content` fail `test` until audited.
19. **docs:check.** No task adds a `router.<verb>('…')` line or a file under `server/routes/`, and none touches
    `tools/`, so `docs/_generated/routes.md` and `tools.md` are unchanged (`scripts/generate-route-inventory.js` reads
    only `router.<verb>(` path literals; `generate-tool-inventory.js` reads `tools/`). The `check-docs` job still runs
    (Tasks 6, 14, 15, 16 touch `server/routes/**`; Tasks 12 and 17 touch `scripts/**`): run `npm run docs:check` at the
    tip; expected clean.
20. **Icelandic server messages, all proposals for [USER]'s check** (index decision 13), beside each code in
    `server/services/servedEdit.js` (`REFUSAL_MESSAGES`, Task 13):

    | Code | HTTP | Proposed message |
    |---|---|---|
    | `BASE_MISSING` | 409 | *Síðan var hlaðin fyrir uppfærslu ritilsins. Endurhlaðið síðuna (F5) og vistið aftur.* |
    | `STALE_BASE` | 409 | *Grunntexti bútsins hefur breyst frá því að síðan var hlaðin. Vistun hafnað: endurhlaðið eininguna og gerið breytinguna aftur.* |
    | `STALE_DISPLAYED` | 409 | *Breytingin sem sýnd var í bútnum hefur breyst eða verið fjarlægð frá því að síðan var hlaðin. Vistun hafnað: endurhlaðið eininguna.* |
    | `DUPLICATE_ID` | 409 | *Auðkenni þessa bútar kemur oftar en einu sinni fyrir í einingunni og ekki er hægt að vista á hann fyrr en það hefur verið lagað.* |
    | `BOOK_NOT_MINTED` | 409 | *Þessi bók er ekki í þýðingu og ekki er tekið við breytingum á henni.* |
    | `NO_LAYER` | 409 | *Engin íslensk útgáfa er til af þessari einingu, svo ekki er hægt að vista á hana.* |
    | `STRUCTURE_BLOCKED` | 400 | *Vistun hafnað: byggingarmerki vantar eða hafa breyst.* (today's string, moved verbatim, not a proposal) |
    | `SEGMENT_NOT_FOUND` | 404 | `segment not found` (today's body, kept verbatim) |

    The server messages state facts only; what the client keeps and shows (the draft, the notice) is the client's
    `ui-strings.js` (index decision 12, Task 19). `BASE_MISSING`'s asks for F5 because a page loaded before the deploy
    can show only the server's message (decision 33).

**Client**

21. **The value rules live in a new DOM-free module, `server/public/js/segment-save-state.js` (browser global
    `segmentSaveState`, CommonJS export), and the DOM plumbing stays in `segment-editor.js`.** No DOM test environment
    exists: `vitest.config.js` sets `environment: 'node'`, neither `package.json` lists jsdom or happy-dom, and
    `segment-editor.js` cannot be required (it touches `document` at load, `clientJsSyntax.test.js:4-9`). E2E is a
    separate CI job that `npm test` does not run. The precedent is `figure-drafts.js` (its header says exactly this) and
    `accept-eligibility.js`. Browser-only behaviour (a declined re-render, a dialog, a restored pane) is tested in
    Playwright, in a new `server/e2e/served-base-client.spec.js`.
22. **Every value the save and the accept echo is read from the row's own DOM** (spec §5.18): `data-base-sha256`,
    `data-occurrence`, `data-is`, `data-displayed-edit-id`, `data-displayed-edit-sha256`, plus two the spec does not
    list: `data-base-edit-id` (the conflict token `baseEditId`, today `latestEditIdForSegment` read from `moduleData` at
    save, `segment-editor.js:1994`, `:2077-2084`; a declined re-render leaves it newer than the screen, the same defect
    class) and `data-segment-id` (so tests and the review lookup address a row by its real id, not by reversing the
    lossy `cssId`, `:2458-2460`).
23. **`data-is` is JSON-encoded** (`escapeHtml(JSON.stringify(seg.is))`, read back with `JSON.parse`). The HTML parser
    turns CR and CRLF into LF inside an attribute value, which would make an accept fail the server's exact value check
    (`acceptanceService.js:90`). Measured on 2026-11-03: `grep -rlaP '\r' --include='*.md'` finds 0 files in every
    book's `02-mt-output`, `02-for-mt` and chemistry's `03-faithful-translation`; JSON encoding makes the read-back exact
    by construction instead of by today's data.
24. **The client never hashes** (§5.3, §5.18; `grep -anE 'crypto|subtle|sha256' server/public/js/*.js` is empty). A row
    with no served hash (a duplicated id, organic, a module with no layer) sends no `baseSha256` key, and the server's
    order (§5.6 steps 1–4) decides which code answers. The client does not pre-empt that send.
25. **`originalContent` is still sent, as the row's `data-is`.** The server stops reading it in Task 14 (§5.6 step 6),
    but Task 9 lands before that task, and in between the server still stores `originalContent || ''`
    (`routes/segment-editor.js:424`). Dropping the field is a later cleanup, not this PR's.
26. **`clientActionId` and `clientActionTime` also go on the accept body**, which the wire contract lists only for the
    save. Spec §5.9's `client_action_id` is minted "when the editor acts" and makes a replayed act idempotent; an MT
    accept is such an act, and it replays through `saveRetry` (key `acc:`, `segment-editor.js:1705`). Kept, because it
    adds no server code: the PR1 server ignores it like the other research-only fields (index decision 4), and PR3
    reads it. `clientActionId` is `crypto.randomUUID()` where it exists (it needs a secure context: production is https
    and E2E is localhost), else a time-plus-random string.
27. **`replayed` is absent on a live body**; `saveRetry` adds `replayed: true` to a replay, and only for a key whose
    prefix has a policy with `markReplayed` (`saveRetry.setKeyPolicy(prefix, …)`). **`seg:` and `acc:` get that policy
    in `saveRetry.js` itself** (`DEFAULT_KEY_POLICIES`, passed by its browser wiring before `processQueue` is
    scheduled), not in `segment-editor.js`: the queue is shared and replayed by whichever page loads `saveRetry.js`
    (`saveRetry.js:373-378`; `localization-editor.html:2074` loads it too), so a policy only the segment editor
    registers would leave a segment save replayed from the Pass 2 editor's page unmarked (§5.18 row 5, T20). The Pass
    2 editor's keys (`loc:`, `loc-auto:`, `loc-all:`, `localization-editor.js:183`, `:1030`, `:1148`) have no policy and
    behave byte-for-byte as today. This is how "every new field stays optional there" is met. `parkRefused` and
    `onParked` stay page-specific (decision 28).
28. **Every non-5xx answer to a replay is parked, never dropped** (index decision 12; spec §5.6: "a queued replay that
    gets any non-5xx answer is dropped with a toast … Both paths must keep the text first"). §5.18's row and index
    decision 12 say "any 409 to a replay"; §5.6 names the whole path, and a 400, 403, 404 or 413 answered to a `seg:`
    replay drops the typed text just the same, so the branch keys on `!isRetryableResponse(response)`, a superset of
    the 409s and no contradiction of either. A 5xx that exhausts `MAX_ATTEMPTS` still drops with today's toast (§5.6
    names only the non-5xx path; a note for [USER] in "Questions"). The replay runs outside the caller's promise chain
    (`executeRetry`'s own toast, `saveRetry.js:149-157`), the queue lives in `localStorage` and is processed by
    whichever page loads `saveRetry.js` next (`saveRetry.js:373-378`; both editor views load it). So a policy with
    `parkRefused: true` moves the refused item into `localStorage['saveRetryParked']` (pruned after 7 days by
    `processQueue`, the drafts' own window, `tabGuard.js:126`) and calls the owner's `onParked`. The segment editor
    handles one for the open module at once, and drains the rest into the module's draft when that module loads.
    Because the policy is by key prefix, not stored on the queue item, **a body queued by a page loaded before the
    deploy and replayed after F5 is parked too** (it has no hash, so it comes back `BASE_MISSING`).
29. **The draft value is `{v: 2, ts, segments: {segId: {text, baseSha256, occurrence, assists, refused}}, drafts:
    {segId: text}}`**, in the same key family (`seg-draft:<book>/<chapter>/<module>:<tabId>`, `segment-editor.js:67-82`).
    `v: 2` plus `segments` is what tells it from today's `{ts, drafts}`. `ts` stays because `tabGuard` keys both its
    newest-draft lookup and its 7-day sweep on it (`tabGuard.js:95`, `:148`). **`drafts` mirrors the texts for a page
    loaded before the deploy:** its `restoreDraft` does `Object.keys(draft.drafts)` inside a `try` whose `catch` clears
    every draft for the module (`segment-editor.js:120`, `:137-138`), so without the mirror an old tab would delete the
    texts a new tab kept. `refused` (the code that kept the text, or null) is added to §5.18's four fields so a restored
    pane can say why it holds the text.
30. **The codes that keep the typed text** are `STALE_BASE`, `STALE_DISPLAYED`, `BASE_MISSING`, `DUPLICATE_ID`,
    `BOOK_NOT_MINTED` and `NO_LAYER` (one constant, `KEEP_TEXT_CODES`; §5.18 lists the first four, index decision 12
    adds `BOOK_NOT_MINTED`, decision 5 names `NO_LAYER`). A live `conflict` 409 (today's `SEGMENT_CONFLICT`, whose wire
    code is the lowercase `'conflict'`, `routes/segment-editor.js:483`) keeps today's alert-and-reload; any non-5xx
    answer to a *replay*, `conflict` included, is kept (decision 28). Nothing may key on the string `SEGMENT_CONFLICT`.
31. **How a kept text comes back** (§13's refused-save experience, index decision 12): the text, its assist list and
    the base it was sent with go into the draft and an in-memory hold; the module reloads; the held text is installed in
    its pane with a notice above it and a `draft-restore` item appended after its re-installed assists. **The next save
    from that pane sends the row's newly served base** ("the row shows the new text, redo the change and save"). The
    notice is chosen by the refusal code when there is one, else by comparing the draft's base with the row's (any
    restored draft, refused or not); a legacy draft has no base and gets no notice. A kept pane restores without the
    `draftRecovery` confirm, is carried across every later re-render of the table (it does not count as a pane that the
    `closePanels` confirm could lose), asks before Endurstilla or Hætta við discards it, and survives the Back button
    (`clearDraft()` wipes by prefix today, `:102-104`, `:2229`). **The restore reads every draft under the module's
    prefix, not only the newest** (`segmentSaveState.mergeDraftValues`, Task 8; Task 18): `tabGuard.findNewestDraft`
    returns one draft (`tabGuard.js:88-103`) and the restore then clears them all (`:109-118`), so a kept text in an
    older tab's key (two tabs on one module, or an F5 that gives the page a new `tabId`) would otherwise be deleted
    unseen. The newest draft still wins per segment; an older draft contributes only its kept entries.
32. **A `DUPLICATE_ID` text is never sent:** its pane's Vista and propagate buttons are disabled and `saveEdit` and
    `propagateSegment` return before any request while the pane holds that code (R4, §5.7). **And a refused save is
    never propagated:** `propagateSegment` saves first (`segment-editor.js:2095-2097`) and then reads the textarea
    (`:2098`), which the refusal path has just refilled with the kept text, so after `await saveEdit(segmentId)` it
    returns when the segment's text is held or its pane holds a refusal code (Task 19). Without that, a refused
    `DUPLICATE_ID` text would reach `POST /propagate`, and a `STALE_BASE` text would be propagated to every other
    occurrence.
33. **`BASE_MISSING` gets a client alert that asks for F5**, not the server's message plus "kept". From a new page it
    can only come from a hashless replay or an id that became duplicated between serve and save, and a full reload is
    right in both. **An old page cannot read client strings**, so the server's own `BASE_MISSING` message also asks for
    F5 (decision 20; Task 14's case 7 pins `/F5/`).
34. **The save response's echo fields are written onto the row before the reload** (G1.21, §7's last row, §5.18), by
    one function, `segmentSaveState.echoAttributeUpdates`, and its test. Today the client reloads after every save
    (`segment-editor.js:2054`), so the echo matters only when that re-render is declined, and after G1.21.
35. **`reviewedEditSha256` is read from the row that displays the reviewed edit** (`tr[data-displayed-edit-id=…]`). The
    approve, reject and discuss buttons render only for a pending latest edit (`segment-editor.js:1432`), which is in
    flight and therefore the displayed one; when no such row is on screen the field is `null`, and PR3 flags it.
36. **The assist list in the SENT body is bounded, so a save can never exceed `express.json`'s `1mb` limit**
    (`server/index.js:206`), which would answer 413 and refuse the editor's save over research data. **Needs [USER]'s
    yes: it departs from §5.10** ("the item's detail stores the full text the textarea held right after the item") **and
    from §14 call 18** (a repetition insert or a restored draft keeps the whole text it put in place), in the one case
    where the alternative is a 413. `buildSaveBody` measures the body without its assists in UTF-8 bytes and gives the
    assist list the rest of a 1 MiB budget less 16 KiB of headroom (`BODY_LIMIT_BYTES`, `BODY_HEADROOM_BYTES`);
    `segmentSaveState.boundAssists(items, maxBytes)` keeps every item (the sequence stays countable) and, only past that
    budget, drops `detail.text` from the oldest whole-text items first (recording `textLength` and `textDropped:
    true`), never from the newest one. The edit route caps `editedContent` at 10,000 characters
    (`routes/segment-editor.js:354`), so the budget is in practice what is left after two texts of that size, and the
    bound fires only on a list that would otherwise answer 413. **The draft keeps every text:** `draftEntry` does not
    bound (`localStorage` has its own failure path, the `localStorageFull` toast, `segment-editor.js:94-99`), so a
    refused save and a restore lose nothing. The one exception follows from the bound itself: a replay refused after
    its page was reloaded is rebuilt from the body that was sent (`entryFromParked`), so in that over-1-MiB case the
    kept entry carries the bounded list. If [USER] says no, the alternative is to let such a save answer 413 and
    keep its text through the refusal path; the plan does not build that.
37. **E2E refusals the fixture cannot produce are stubbed with `route.fulfill`:** the E2E modules hold no duplicated id
    (handoff §4 PR1) and none is organic or layerless. `STALE_BASE` and `STALE_CONTENT` come from the real server, by
    rewriting the first module GET a page receives (`route.fetch` + `route.fulfill`), which simulates "the base changed
    after the page loaded" without touching any file under `books/`. Every other success in the new spec is a stub, so
    the spec writes one edit row in all (Task 19's positive control), which it then deletes.

**Order and scope**

38. **Task order is load-bearing** (§13a: "a required field, the client that sends it and the tests that post it" ship
    together). Tasks 1–6 build the server side up to the serve hook, which puts `baseSha256` in the module GET. Tasks
    7–10 make the page render and send every new field while the server still ignores them (Tasks 7 and 8 have no
    server dependency; Task 9's row rendering needs Task 6's hash). Tasks 11–14 make the server store and then
    **require** the echo; **Task 14's single commit carries the route change, `segmentEditBackstop.test.js`'s bodies
    and every E2E direct poster's body**, so no commit has a required field that a test or the page does not send. Task
    9 must land before Task 14, or the browser-driven saves in E2E (`editor-lifecycle.spec.js:116`, `:183`, `:236`;
    `acceptance.spec.js:90`) answer `BASE_MISSING` in the commits between. Tasks 15–17 finish the server writers. Tasks
    18–20 (drafts, the refused-save experience, replays) come last because Task 19's E2E needs the real `STALE_BASE`
    from Task 14.
39. **Not adopted: letting the displayed check pass when the displayed row already equals `editedContent`** (the
    client draft's cross-half ask, for a replay whose first attempt landed but whose response was lost). Spec §5.6 step 4
    is exact ("refuse if … `sha256Text` of its current `edited_content` differs from `displayedEditSha256`"), so this
    would change what the frozen spec says and **needs [USER]'s yes**. Without it the replay is refused
    `STALE_DISPLAYED` and parked (decision 28): nothing is lost, the editor sees a notice for text that in fact landed.
    Review Focus 18 carries it.

## Global Constraints (PR1)

The shared constraints are the index's (§ Global Constraints): test first and one commit per task; the gate is what CI
runs; module systems; better-sqlite3 only under `server/`; paths from `__dirname`; never-throw migrations; organic
never; no research field in any column the module route sends; `process.exitCode` after output; `grep -a`; a mutation
check restores from a golden `cp`; nothing committed names a grant or fund; no count, test total or CI verdict in
prose. Read them there. For this PR, in addition:

- **Branch:** cut from `main` after the index and spec commits (the executing session's harness may name it; index
  decision 17). Commit messages end with the executing session's attribution trailer lines, after a blank line.
- **The order above is load-bearing** (decision 38). Do not reorder Tasks 6, 9 and 14, and do not split Task 14's
  commit.
- **Migration number:** `ls server/migrations` on the branch just before Task 3's commit, and again just before merging
  (index decision 9). If `053` is taken, use the next free number everywhere Task 3 names it.
- **No test this PR adds writes under `books/`.** Every new test that saves or accepts sets
  `segmentParser._setTestBooksDir` to a temp root: the MT lock path comes from `segmentParser.getModulePaths`
  (`segmentEditorService.js:217`, `acceptanceService.js:207`), so a save on a fixture under the real tree would write a
  `.locked` file there. The T1 test (Task 6) and the copies of `m68726`/`m68747` (Tasks 13 and 15) only read
  `books/`. **One pre-existing exception, not widened:** `segmentEditBackstop.test.js`'s real-fixture `describe`
  (`:290-356`, ed10180c) saves on the committed `__e2e-fixture__/m68664` with no temp root, so its case 4 writes
  `m68664-segments.locked` under `books/`; its own `beforeAll` and `afterAll` remove that file (`:301`, `:317`). Task
  14 keeps that `describe` as it is and puts its new case 7 on the synthetic temp-root module instead. Run `git status
  --porcelain` after every test run; anything under `books/` or `pipeline-output/` is a defect to fix before the
  commit.
- **The hand-copied schema and the 043-direct suites gain the new columns in the migration's own commit, and the
  drift guard is shown to bite before the copy is updated** (index decisions 10 and 11). → Task 3
- **`acceptanceUiPins.test.js:120` counts `baselineTextFor(seg, latestEdit)` at exactly five sites. No task adds a
  sixth:** a reset of pane state reads the row (`rowValues`, `freshPaneState`), not that function. Tasks 9, 10 and 19
  re-run that file. → Task 10, Task 19
- **Format:** run `npx prettier --write` on each `.js` file a task creates or edits under `server/`, `scripts/` or
  `tools/` before its commit (CI's Lint job runs `format:check` as well as `eslint`); `.mjs` tests are linted, not
  prettier-checked. The code blocks below show content, not final layout.
- **The research-only fields are accepted and ignored by the server** (index decision 4): no server code in PR1 reads
  `clientActionId`, `clientActionTime`, `assists`, `acceptOrigin`, `reviewedEditSha256` or `replayed`.
- **Icelandic strings:** every new UI or server string is a proposal, marked in the code for [USER]'s check before the
  PR opens (index decision 13). No book content is translated anywhere in this PR.
- **Run vitest from the repository root**, one file per command where a step says so.

## Review Focus

Input cases the spec implies but its tests do not exercise directly. Each names the task that answers it.

1. **A page loaded before PR1's deploy** posts no `baseSha256` (or a non-string one): 409 `BASE_MISSING` with the F5
   message, never a pass, even on a segment whose base has not changed. Static JS has no cache-busting
   (`views/segment-editor.html:2045`, served by `express.static`, `server/index.js:173`), so that page keeps its old JS
   until reloaded; its handler alerts `err.message`, which the old `saveRetry` builds from `data.message` first
   (`saveRetry.js:235`), and reloads only the module (`segment-editor.js:2061-2065`). **The server's `BASE_MISSING`
   message is the only text an old page shows.** Its typed text survives **only if a 5-second tick of its own draft
   (`:84-100`) captured it and the editor accepts the recovery offer**: after the alert, the old page's reload asks
   `closePanels` (`:1204`); OK closes the panes and clears `dirtyEdits` (`:1211`), and its next tick then removes the
   draft (`:85-87`); its `restoreDraft` (`:111-140`) offers only the last tick's snapshot, and Cancel on that offer
   clears it (`:122-124`). So the last seconds of typing, or the whole text after a Cancel, are lost unless the editor
   answers Cancel to the closing prompt (the pane stays on screen). A text that did reach the draft is restored as
   legacy by the new page after F5. Its own queued replay is dropped with a toast by its old `saveRetry` (index Review
   Focus 1), unless F5 comes first, in which case the new `saveRetry` parks it. The only lever over an old page is the
   server's `BASE_MISSING` message (decision 20); whether it should also tell the editor to answer Cancel to the
   closing prompt, or to copy the text, before F5 is a question for [USER]. → Task 14, Task 19, Task 20
2. **A replay frozen for up to an hour** whose `baseEditId` still passes `checkEditConflict` (an edit keeps its id
   through a re-save) is refused by `STALE_BASE` or `STALE_DISPLAYED`, in that order after `BASE_MISSING`. → Task 13
3. **The displayed pair names a row on another segment** (or a deleted row): `STALE_DISPLAYED`, and nothing is stored.
   → Task 13
4. **Mint and save are one transaction**: a save that fails after its mint leaves no served-version row; and the MT
   lock file is the one side effect inside that transaction (a commit failing after `writeMtLock` leaves a marker
   naming an edit id that does not exist; `writeMtLock` is a no-op once a marker exists, so it cannot clobber one).
   → Task 13
5. **A duplicated id**: no served-version row and no `baseSha256` on either occurrence; save, re-attach, accept and
   propagation are refused or skipped; the accept is refused **even when an active acceptance already exists on that
   id**, which `acceptanceService`'s `existing` lookup would otherwise return as `alreadyAccepted`; a propagation target
   is skipped on the write path, not only in the preview. → Task 6, Task 13, Task 15, Task 16
6. **A layerless module** serves as today, mints nothing, and every write is refused (`NO_LAYER`) or skipped
   (`no-layer`). → Task 6, Task 13, Task 15, Task 16
7. **`chapter-metadata`**: a ch02 serve mints rows with chapter 2 only; ch05's appear only after a ch05 serve.
   Appendices mint under -1. → Task 6
8. **A failed serve-time mint** (a read-only or busy handle) serves the module with `baseSha256` and logs once; a
   re-serve of an unchanged module attempts no write at all (proved on a read-only handle). → Task 5, Task 6
9. **A re-save after the base changed** moves `original_content` and `served_version_id` to the new base; a legacy
   direct `saveSegmentEdit` re-save NULLs `served_version_id` instead of leaving a stale one. → Task 12
10. **Organic, when a caller skips the route's check:** `mintVersions` refuses organic rows on its own, so no caller
    can mint `lifraen-efnafraedi` even without going through `placeOnServedBase` (T18 covers the routes). → Task 5
11. **`SEGMENT_CONFLICT`'s body says `error: 'conflict'`** (`routes/segment-editor.js:483`), not the code. The client
    sets `err.code = data.error` and so sees `'conflict'`; `KEEP_TEXT_CODES` does not hold it, and nothing keys on the
    string `SEGMENT_CONFLICT`. → Task 8, Task 14
12. **The foreign key is live**: a direct writer passing a `served_version_id` with no row fails with `FOREIGN KEY
    constraint failed`, not silently. → Task 3, Task 12
13. **The re-attach script refuses the study book in a dry run** without printing a plan and without opening a
    database, and a non-study snapshot still plans and writes. → Task 17
14. **A save or accept after a declined re-render** must send the row's DOM values (base, displayed pair, `baseEditId`,
    the text it shows), never `moduleData`'s, which is newer: `renderSegments` returns `false`
    (`segment-editor.js:1204`) and `renderModule` ignores it (`:1124`). The positive control is a save with no re-render
    sending the served values. → Task 9
15. **An `is` holding a quote, an apostrophe, a newline or a CR** must come back byte-identical from `data-is`, or the
    accept's value check refuses every such row. → Task 8
16. **The displayed pair of a row showing an in-flight edit** is that edit's id and the `contentSha256` the module
    response gave it, and `null`/`null` on a row showing the base. An editor can normally open a pane only over their
    own in-flight edit (`canEdit`, `segment-editor.js:1410-1419`); a pane over another editor's in-flight edit opens
    only through the repetition button (`:877`) or a draft restore (`:127`), or by a direct post, which is why Task 13
    and Task 14 test "another editor's edit displayed" at the service and route. → Task 9, Task 13
17. **A refused save while other panes are dirty:** every dirty pane's text is written to the draft before the reload,
    and the `closePanels` confirm counts only panes that could lose text. Declining it keeps the old screen, and the kept
    text is installed on the old row with its code's notice. → Task 19
18. **A replay whose first attempt reached the server but whose response was lost**, and which re-saved the editor's
    own displayed edit: the replay's `displayedEditSha256` is now stale, so the server answers `STALE_DISPLAYED` and the
    client parks text that in fact landed. Safe (nothing is lost), but noisy; the exception that would silence it is
    decision 39, not adopted. → Task 20
19. **A replay refused on the Pass 2 editor's page** (the queue is shared and `localization-editor.html` loads
    `saveRetry.js`): it is still sent with `replayed: true` (`DEFAULT_KEY_POLICIES`, decision 27), but no page there
    registered `parkRefused` for `seg:`, so it is dropped with today's toast. The segment editor's text then survives
    only through its own 5-second draft. → Task 7
20. **An old page (pre-deploy JS) reading a version-2 draft** must restore the text, not wipe the module's drafts
    (decision 29's `drafts` mirror). → Task 18
21. **A body over `express.json`'s `1mb` limit** would refuse the save with 413; whole-text assists are what grow it.
    Only the sent body is bounded; the draft keeps every text (decision 36). → Task 8, Task 10
22. **A term insert lands in the last-focused textarea, not the last-opened pane** (`segment-editor.js:3263`), and the
    item must be attributed to the segment whose textarea received it. → Task 10
23. **A `DUPLICATE_ID` pane** must send nothing again (Vista, Ctrl+Enter, Ctrl+S, propagate), and Hætta við,
    Endurstilla, Escape and Back must not drop its text silently. **A refused save started from Beita víðar** must not
    go on to `POST /propagate` with the kept text (decision 32). → Task 19
24. **A kept text in a draft that is not the newest under the module's prefix** (two tabs on one module, or an F5 that
    gives the page a new `tabId` while another tab writes a newer draft): `tabGuard.findNewestDraft` returns one draft
    (`tabGuard.js:88-103`) and `clearDraftsByPrefix` removes them all (`:109-118`), so the restore must read every
    draft and carry each refused entry over, or the kept text is deleted unseen. → Task 8, Task 18

## The T-tests this PR carries (index § Test placement)

| Test | Where in this PR | The half here (when split) |
|---|---|---|
| T1 the integrity set | Task 6 | whole |
| T2 hash sentinels | Task 1 (parity with `buildChangeRecord` and committed `beforeSha256`), Task 6 (one sentinel per normalisation step, from the response object) | whole, in two tasks |
| T3 served versions | Task 5 (service), Task 6 (serve), Task 14 (a relabel with identical bytes does not refuse) | whole, in three tasks |
| T4 stale base | Task 13 (service refusals, stored values, the displayed pair, re-attach), Task 14 (route; and E2E: the stored `original_content` is the server's base), Task 15 (the value check after a re-render, server side), Task 9 (the DOM-read accept and the displayed pair, client side) | PR1's: everything but the `write-refused` event (PR3) |
| T5 duplicated id refused | Task 13 (save and re-attach, on a synthetic id and on copies of `m68726`/`m68747`, per-occurrence values compared), Task 15 (accept, on a synthetic id and on the same two copies), Task 16 (propagation skip) | PR1's: no rows, the 409, the skip; the event is PR3's |
| T16 propagation | Task 16 | PR1's: the target rows; the event, the preview hash and its flag are PR3's |
| T17 nothing reaches a browser | Task 3 (column allowlist), Task 6 (module JSON) | PR1's: two `describe` blocks in `researchBoundary.test.js` |
| T18 scope | Task 2 (allowlist), Task 6 (organic serve), Tasks 13 and 14 (organic save), Task 15 (organic accept), Task 16 (organic propagation) | PR1's: all but the non-study event (PR3) |
| T21 MT lock | Task 15 | whole |
| T23 client | Task 7 (`saveRetry` errors carry `code`), Task 8 (the pure rules: legacy draft, base and assists kept, restore order), Task 9 (DOM read after a declined re-render, with its control), Task 18 (legacy draft in the browser), Task 19 (refused save and restore; the next save lists the earlier repetition insert, with its whole text, and `draft-restore`) | whole, in five tasks |

## Before Task 1: the tree check and G-5

G-5 is the first step of PR1 (index § Production checks; spec §9). Run these and compare; a difference is a reason to
stop and re-derive the named task, not to proceed.

- [ ] **The tree:** `git diff --name-only ed10180c HEAD -- server tools scripts .github LICENSE` prints nothing. If it
  prints a file, re-derive every pin a task names in that file.
- [ ] **The migrations:** `ls server/migrations | tail -1` prints `052-retire-chapter-generated-files.js` (so Task 3
  takes `053`).
- [ ] **G-5, the unit side:** `grep -rlnaE "moduleId/edit'|/:book/:chapter/:moduleId/edit" server/__tests__
  scripts/__tests__ tools/__tests__` prints only `server/__tests__/segmentEditBackstop.test.js` (Task 14 changes its
  bodies).
- [ ] **G-5, the E2E side:** `grep -anE "segment-editor/.*/edit|/edit['\`]|API\}/edit|M5_API\}/edit" server/e2e/*.js`
  prints `concurrent-editing.spec.js:127`, `editor-lifecycle.spec.js:157`, `:206`, `editor-workflow.spec.js:69`, `:81`,
  `review-cycle.spec.js:60`, `:114`, `segment-editor.spec.js:353`, `ux-phase2.spec.js:129`, `:140`. The direct `/edit`
  posters are `:127`, `editor-workflow:69`, `review-cycle:60`, `segment-editor:353` and `ux-phase2:129` (Task 14);
  `editor-lifecycle:157`, `:206` are intercepts that ride the client (Task 9); `review-cycle:114` posts the approve route
  (`/edit/:editId/approve`), whose `reviewedEditSha256` the PR1 server ignores; `editor-workflow:81` and
  `ux-phase2:140` are assertion messages. Any further line gets Task 14's edit.
- [ ] **G-5, the accept side:** `grep -rlnaE "acceptSegment\(|/accept[\`'\"]" server/__tests__ server/e2e` prints
  `acceptanceApply`, `acceptanceRoutes` and `acceptanceService` (the accept path; no body change, since accept keeps its
  value check; re-run in Task 15), `acceptanceUiPins` (static client pins; re-run in Tasks 9, 10, 19) and
  `crossBookAuthz` (a suggestions bulk-accept, not this route).

G-4 is not a gate for PR1 (index decision 8): PR1 refuses every write on a duplicated id and mints nothing for one.

---

### Task 1: one hash function and the not-minted book list

Spec §5.3, §5.4 (scope), §11 (organic never), T2 (parity half), decision 1.

**Files:**
- Create: `server/lib/servedText.js` — `sha256Text`, `NOT_MINTED_BOOKS`, `isNotMintedBook`
- Test: `server/__tests__/servedText.test.js` (new)

**Interfaces:**
- Consumes: Node `crypto`; in the test only, `buildChangeRecord(fields)` from `tools/lib/mt-layers.js` (ESM, imported by
  the vitest file; `mt-layers.js:702`, its `beforeSha256` at `:712`, its private `sha256` at `:71`).
- Produces:
  - `sha256Text(s: string): string` — 64 lowercase hex characters, `crypto.createHash('sha256').update(s,
    'utf8').digest('hex')`; throws `TypeError` on a non-string.
  - `NOT_MINTED_BOOKS: readonly string[]` — frozen, `['lifraen-efnafraedi']`.
  - `isNotMintedBook(book: string): boolean`.

- [ ] **Step 1: Write the failing test** (`server/__tests__/servedText.test.js`; header as
  `server/__tests__/importConcepts.test.js:9-11`)

```js
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import { buildChangeRecord } from '../../tools/lib/mt-layers.js';

const require = createRequire(import.meta.url);
const { sha256Text, NOT_MINTED_BOOKS, isNotMintedBook } = require('../lib/servedText');
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LAYER2 = path.join(__dirname, '..', '..', 'books', 'efnafraedi-2e', '02-mt-revised');

function committedChanges() {
  const out = [];
  for (const ch of fs.readdirSync(LAYER2)) {
    for (const f of fs.readdirSync(path.join(LAYER2, ch))) {
      if (!f.endsWith('-changes.jsonl')) continue;
      for (const line of fs.readFileSync(path.join(LAYER2, ch, f), 'utf8').split('\n')) {
        if (line) out.push({ ch, ...JSON.parse(line) });
      }
    }
  }
  return out;
}
const keyOf = (c) => `${c.ch}/${c.module}/${c.segmentId}#${c.occurrence}/${c.opId}`;

describe('sha256Text (spec §5.3)', () => {
  it('is the full lowercase hex sha256 of the UTF-8 string', () => {
    expect(sha256Text('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    // a committed beforeSha256 (ch02/chapter-metadata-changes.jsonl, line 1)
    expect(sha256Text('Frumeindir, sameindir og jónir')).toBe(
      'd50117206503094ecb8ea8b926f9daf663ab1dc91e0e347afff60fbefde80039'
    );
  });
  it('refuses anything that is not a string', () => {
    expect(() => sha256Text(undefined)).toThrow(TypeError);
    expect(() => sha256Text(Buffer.from('a'))).toThrow(TypeError);
  });
});

describe('T2, parity half: sha256Text is the change records’ hash', () => {
  it('equals buildChangeRecord(...).beforeSha256', () => {
    for (const before of ['Frumeindir, sameindir og jónir', 'ð þ æ ö „gæsalappir“', 'á b']) {
      const rec = buildChangeRecord({
        module: 'm68662', segmentId: 'm68662:para:pref-p-009', occurrence: 0, opId: 't.op1',
        source: 'rule', ruleId: 'r1', category: 'term', find: before, replace: `${before}!`,
        before, after: `${before}!`, runId: null,
      });
      expect(sha256Text(before)).toBe(rec.beforeSha256);
    }
  });
  it('equals every committed beforeSha256 in layer 2; a one-character change does not', () => {
    const all = committedChanges();
    expect(all.map(keyOf)).toContain('ch02/chapter-metadata/chapter:title:ch02#0/ch02/chapter-metadata/001.op1');
    expect(all.filter((c) => sha256Text(c.before) !== c.beforeSha256).map(keyOf)).toEqual([]);
    const planted = { ...all[0], before: `${all[0].before} ` };
    expect([planted].filter((c) => sha256Text(c.before) !== c.beforeSha256).map(keyOf)).toEqual([keyOf(planted)]);
  });
});

describe('the not-minted books (CLAUDE.md § Organic; spec §5.4)', () => {
  it('lists organic and nothing else, frozen', () => {
    expect([...NOT_MINTED_BOOKS]).toEqual(['lifraen-efnafraedi']);
    expect(Object.isFrozen(NOT_MINTED_BOOKS)).toBe(true);
  });
  it('isNotMintedBook', () => {
    expect([isNotMintedBook('lifraen-efnafraedi'), isNotMintedBook('efnafraedi-2e')]).toEqual([true, false]);
  });
});
```

- [ ] **Step 2: Run it**

Run: `npx vitest run server/__tests__/servedText.test.js`
Expected: FAIL — `Cannot find module '../lib/servedText'`.

- [ ] **Step 3: Implement** `server/lib/servedText.js` (CommonJS). Header: why one function (G1.23 §6.3 reads
  `seg.baseSha256` and never hashes its own copy, spec §5.3); why it is a port (`mt-layers.js` is ESM and does not
  export `sha256`); why organic is listed (CLAUDE.md § Organic, spec §5.4 Claude's call 4).

```js
const crypto = require('crypto');

/** Books served read-only: no served version is minted for them and every write is refused (spec §5.4, §11). */
const NOT_MINTED_BOOKS = Object.freeze(['lifraen-efnafraedi']);

/** sha256 of the UTF-8 bytes of s, 64 lowercase hex characters (spec §5.3). The only place it is computed. */
function sha256Text(s) {
  if (typeof s !== 'string') throw new TypeError(`sha256Text: expected a string, got ${typeof s}`);
  return crypto.createHash('sha256').update(s, 'utf8').digest('hex');
}

function isNotMintedBook(book) {
  return NOT_MINTED_BOOKS.includes(book);
}

module.exports = { sha256Text, NOT_MINTED_BOOKS, isNotMintedBook };
```

- [ ] **Step 4: Run it**

Run: `npx vitest run server/__tests__/servedText.test.js`
Expected: PASS, every test in the file.

- [ ] **Step 5: Commit**

```bash
git add server/lib/servedText.js server/__tests__/servedText.test.js
git commit -m "feat(server): sha256Text and the not-minted book list (G1.1)"
```

---

### Task 2: the study allowlist

Spec §11, §5.5, index decision 1 (approved; spec ✏️ AMENDED 2026-11-03), T18 (PR1 half: the allowlist).

**Files:**
- Create: `server/lib/researchScope.js` — `STUDY_BOOKS`, `isStudyBook`
- Test: `server/__tests__/researchScope.test.js` (new)

**Interfaces:**
- Consumes: nothing (the module requires nothing, Step 3). In the test only: `NOT_MINTED_BOOKS` (Task 1) and
  `VALID_BOOKS` (`server/config.js:98-104`).
- Produces: `STUDY_BOOKS: readonly string[]` (frozen, `['efnafraedi-2e']`); `isStudyBook(book: string): boolean`.

- [ ] **Step 1: Write the failing test**

- `describe('T18, PR1 half: the study allowlist (spec §11)')`:
  - `it('is chemistry and only chemistry, frozen')` — `expect([...STUDY_BOOKS]).toEqual(['efnafraedi-2e'])`;
    `Object.isFrozen(STUDY_BOOKS) === true`.
  - `it('never holds organic')` — `expect(STUDY_BOOKS).not.toContain('lifraen-efnafraedi')`;
    `expect(STUDY_BOOKS.filter((b) => NOT_MINTED_BOOKS.includes(b))).toEqual([])`.
  - `it('isStudyBook')` — `[isStudyBook('efnafraedi-2e'), isStudyBook('lifraen-efnafraedi'),
    isStudyBook('liffraedi-2e')]` equals `[true, false, false]` (the `true` is the control).
  - `it('names a book the server knows (a typo control)')` — every entry of `STUDY_BOOKS` is in `VALID_BOOKS`
    (`require('../config')`).

- [ ] **Step 2: Run it**

Run: `npx vitest run server/__tests__/researchScope.test.js`
Expected: FAIL — `Cannot find module '../lib/researchScope'`.

- [ ] **Step 3: Implement** `server/lib/researchScope.js`: the frozen array, `isStudyBook = (book) =>
  STUDY_BOOKS.includes(book)`, a header saying it is an enforceable value (spec §11), that PR2's opening predicate
  and the re-attach refusal (Task 17) read it, and that no file restates the list. It requires nothing (the re-attach
  script's dry run must open no database, Task 17).

- [ ] **Step 4: Run it**

Run: `npx vitest run server/__tests__/researchScope.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/lib/researchScope.js server/__tests__/researchScope.test.js
git commit -m "feat(server): the study-book allowlist, researchScope.js (moved to PR1)"
```

---

### Task 3: the PR1 migration, its hand-copied schema, its drift guard and the column allowlist

Spec §5.2, §5.8, §5.20 (why `checks.schema` follows in Task 4), §13 (names and types), index decisions 9, 10, 11, 15;
T17 (PR1 half: the column allowlist); decision 2.

**Files:**
- Create: `server/migrations/053-served-text-versions.js` — `migrate(db)`, `addColumnIfMissing(db, table, column,
  decl)`, `up(db)` (the boundary). **First run `ls server/migrations` on the branch: if `053` is taken, use the next
  free number everywhere below (index decision 9).**
- Modify: `server/services/migrationRunner.js` — append `require('../migrations/053-served-text-versions')` after
  `052` (the list ends at `:84`, ed10180c).
- Modify: `server/__tests__/helpers/segmentEditsSchema.cjs` — `createSegmentEditsSchema`: append the five columns after
  `review_id`, and correct its false comment (below).
- Modify (one line each, after their `migration043.up(…)` call): `server/__tests__/acceptanceApply.test.js`,
  `acceptanceService.test.js`, `applyStatusRebuild.test.js`, `errorHandling.test.js`, `mtLockOnFirstEdit.test.js`,
  `propagationService.test.js` (every one of its `freshDb()` helpers that calls `migration043.up(d)`),
  `segmentEditConflict.test.js`, `segmentEditorService.test.js`, and
  `scripts/__tests__/reattachSegmentEditsWrite.test.mjs`. Found with
  `grep -rlna "043-segment-acceptances" server/__tests__ scripts/__tests__ tools/__tests__`; re-run it.
  `server/__tests__/migration043.test.js` is excluded on purpose: it tests 043 alone.
- Test: `server/__tests__/migration053.test.js` (new), `server/__tests__/segmentEditsSchemaDrift.test.js` (new),
  `server/__tests__/researchBoundary.test.js` (new; T17, grown by every PR, index decision 15).

**Interfaces:**
- Consumes: `freshMigratedDb()` (`server/__tests__/helpers/freshMigratedDb.js:83`), `createSegmentEditsSchema(db)`.
- Produces: the schema in decision 2; `module.exports = { name: '053-served-text-versions', up(db) }`, `up` never throws.

- [ ] **Step 1: Write the failing tests**

`server/__tests__/migration053.test.js` (the model is `migration052.test.js`):
- `it('creates served_text_versions with every column NOT NULL')` — on `freshMigratedDb()`,
  `Object.fromEntries(db.pragma('table_info(served_text_versions)').map((c) => [c.name, [c.type, c.notnull]]))`
  equals `{ id: ['INTEGER', 0], book: ['TEXT', 1], chapter: ['INTEGER', 1], module_id: ['TEXT', 1], segment_id:
  ['TEXT', 1], occurrence: ['INTEGER', 1], en_sha256: ['TEXT', 1], is_sha256: ['TEXT', 1], layer: ['TEXT', 1],
  en_text: ['TEXT', 1], is_text: ['TEXT', 1] }` (an `INTEGER PRIMARY KEY` reports `notnull` 0).
- `it('has the eight-part unique key, in order')` — `db.pragma('index_list(served_text_versions)')` holds
  `{ name: 'idx_served_text_versions_key', unique: 1 }`; `db.pragma("index_info('idx_served_text_versions_key')")
  .map((c) => c.name)` equals `['book', 'chapter', 'module_id', 'segment_id', 'occurrence', 'en_sha256',
  'is_sha256', 'layer']`.
- `it('refuses a second identical version and admits a layer-only difference')` — insert one row (`'a'.repeat(64)`
  hashes, layer `mt-output`); the same values again throw `/UNIQUE/`; the same with layer `faithful` inserts (the
  control); layer `bogus` throws `/CHECK/`.
- `it('adds the new columns; rows made before G1.1 read NULL and keep their values')` — on `new
  Database(':memory:')`, run `up(db)` of `008`, `009`, `038`, `039`, `043` (they create both tables in their
  post-039 shape); insert one `segment_edits` row and one `segment_acceptances` row; snapshot each with
  `SELECT *`; run `053.up(db)`; the five and two new keys are `null`, and every pre-existing key equals the snapshot.
- `it('is idempotent: a second start changes nothing and warns nothing')` — `vi.spyOn(console, 'warn')`; the
  `sqlite_master` `sql` column (ordered by `name`) before and after a second `up(db)` on `freshMigratedDb()` is equal;
  `warn` was not called.
- `it('never throws: a missing table rolls the whole unit back, warns once, and the next start completes it')` — on
  `:memory:` run `008`, `009`, `038`, `039` (no `segment_acceptances`); `expect(() => m053.up(db)).not.toThrow()`;
  `warn` called once, its first argument matching `/^\[053\]/`; `served_text_versions` absent from `sqlite_master`
  and `segment_edits` has no `served_version_id` (atomic). Then run `043` and `053` again: both tables carry every new
  column, and `warn` was not called again (the control: the same migration completes once the fault is gone).
- `it('the foreign key is live')` — on `freshMigratedDb()`, inserting a `segment_edits` row with
  `served_version_id = 999999` throws `/FOREIGN KEY constraint failed/`; with the id of a real inserted
  `served_text_versions` row it inserts (control).
- `it('is registered in migrationRunner after 052')` — as `migration043.test.js:71-77`.

`server/__tests__/segmentEditsSchemaDrift.test.js` (index decision 11):

```js
const shape = (db) =>
  Object.fromEntries(
    db.pragma('table_info(segment_edits)').map((c) => [c.name, `${c.type}|${c.notnull}|${c.pk}`])
  );
function drift(a, b) {
  return [...new Set([...Object.keys(a), ...Object.keys(b)])].filter((n) => a[n] !== b[n]).sort();
}
it('the hand copy has the migrated columns: name, type, NOT NULL and key', () => {
  const { db } = freshMigratedDb();
  const hand = new Database(':memory:');
  createSegmentEditsSchema(hand);
  expect(drift(shape(db), shape(hand))).toEqual([]);
});
it('control: a column only one side has is named', () => {
  const { db } = freshMigratedDb();
  db.exec('ALTER TABLE segment_edits ADD COLUMN planted_probe TEXT');
  const hand = new Database(':memory:');
  createSegmentEditsSchema(hand);
  expect(drift(shape(db), shape(hand))).toEqual(['planted_probe']);
});
```

`server/__tests__/researchBoundary.test.js` (create; header: T17, spec §10 and §11, "one file, grown by every PR",
index decision 15; each PR appends its own `describe`):

```js
// Every column the module route sends to every editor's browser through SELECT *
// (segmentEditorService.js:242, acceptanceService.js:231). A column joins this list only after asking
// whether the tool needs it and whether every editor may see it (spec §5.8, R3).
const ALLOWED_COLUMNS = Object.freeze({
  segment_edits: [
    'id', 'book', 'chapter', 'module_id', 'segment_id', 'original_content', 'edited_content', 'category',
    'editor_note', 'status', 'editor_id', 'editor_username', 'reviewer_id', 'reviewer_username', 'reviewer_note',
    'created_at', 'reviewed_at', 'applied_at', 'review_id',
    'served_version_id', 'occurrence', 'origin', 'displayed_edit_id', 'displayed_edit_sha256', // PR1
  ],
  segment_acceptances: [
    'id', 'book', 'chapter', 'module_id', 'segment_id', 'accepted_content', 'accepted_by',
    'accepted_by_username', 'accepted_at', 'status', 'superseded_at', 'superseded_reason', 'applied_at',
    'served_version_id', 'occurrence', // PR1
  ],
});
function columnDrift(db, table, allowed) {
  const have = db.pragma(`table_info(${table})`).map((c) => c.name);
  return {
    unexpected: have.filter((c) => !allowed.includes(c)).sort(),
    missing: allowed.filter((c) => !have.includes(c)).sort(),
  };
}
describe('T17 (PR1): the editing columns the module route sends are an allowlist', () => {
  for (const table of Object.keys(ALLOWED_COLUMNS)) {
    it(`${table} has exactly the allowed columns`, () => {
      const { db } = freshMigratedDb();
      expect(columnDrift(db, table, ALLOWED_COLUMNS[table])).toEqual({ unexpected: [], missing: [] });
    });
  }
  it('control: a planted column is reported by name', () => {
    const { db } = freshMigratedDb();
    db.exec('ALTER TABLE segment_edits ADD COLUMN research_probe TEXT');
    expect(columnDrift(db, 'segment_edits', ALLOWED_COLUMNS.segment_edits).unexpected).toEqual([
      'research_probe',
    ]);
  });
});
```

- [ ] **Step 2: Run them**

Run: `npx vitest run server/__tests__/migration053.test.js server/__tests__/segmentEditsSchemaDrift.test.js server/__tests__/researchBoundary.test.js`
Expected: FAIL — `migration053.test.js`: `Cannot find module '../migrations/053-served-text-versions'`;
`researchBoundary.test.js`: `segment_edits` reports `missing: ['displayed_edit_id', 'displayed_edit_sha256',
'occurrence', 'origin', 'served_version_id']` and `segment_acceptances` `missing: ['occurrence',
'served_version_id']`. `segmentEditsSchemaDrift.test.js` PASSES here (no drift yet; its control runs).

- [ ] **Step 3: Implement the migration and register it**

`server/migrations/053-served-text-versions.js`. Header: what each table and column is (spec §5.2, §5.8), why
`served_version_id` has a foreign key and `displayed_edit_id` has none (decision 2), why NULL on older rows means "before
G1.1" and nothing is backfilled (§5.8), why it never throws (CLAUDE.md § Tech Stack, `048`), and that `checks.schema`
reports a swallowed failure (Task 4).

```js
function addColumnIfMissing(db, table, column, decl) {
  const has = db.pragma(`table_info(${table})`).some((c) => c.name === column);
  if (!has) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${decl}`);
}

/** The whole migration, kept apart so that up() is nothing but the never-throw boundary. */
function migrate(db) {
  db.transaction(() => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS served_text_versions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        book TEXT NOT NULL,
        chapter INTEGER NOT NULL,
        module_id TEXT NOT NULL,
        segment_id TEXT NOT NULL,
        occurrence INTEGER NOT NULL CHECK (occurrence >= 0),
        en_sha256 TEXT NOT NULL CHECK (length(en_sha256) = 64),
        is_sha256 TEXT NOT NULL CHECK (length(is_sha256) = 64),
        layer TEXT NOT NULL CHECK (layer IN ('mt-output', 'faithful', 'selected')),
        en_text TEXT NOT NULL,
        is_text TEXT NOT NULL
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_served_text_versions_key
        ON served_text_versions (book, chapter, module_id, segment_id, occurrence,
                                 en_sha256, is_sha256, layer);
    `);
    const ref = 'INTEGER REFERENCES served_text_versions(id)';
    addColumnIfMissing(db, 'segment_edits', 'served_version_id', ref);
    addColumnIfMissing(db, 'segment_edits', 'occurrence', 'INTEGER');
    addColumnIfMissing(db, 'segment_edits', 'origin', 'TEXT');
    addColumnIfMissing(db, 'segment_edits', 'displayed_edit_id', 'INTEGER');
    addColumnIfMissing(db, 'segment_edits', 'displayed_edit_sha256', 'TEXT');
    addColumnIfMissing(db, 'segment_acceptances', 'served_version_id', ref);
    addColumnIfMissing(db, 'segment_acceptances', 'occurrence', 'INTEGER');
  })();
}

module.exports = {
  name: '053-served-text-versions',
  up(db) {
    try {
      migrate(db);
    } catch (err) {
      console.warn(
        `[053] MIGRATION COULD NOT COMPLETE — ${err.code || err.name}: ${err.message}. NOTHING WAS ` +
          'APPLIED: every step is in one transaction, rolled back on failure. Saves and accepts will fail on a ' +
          'missing column until it completes, and /api/health reports checks.schema not ok. It re-attempts on ' +
          'every server start. NOT THROWN ON PURPOSE: throwing here would stop this server starting at all.'
      );
    }
  },
};
```

Append the `require` to `migrationRunner.js`'s list after `052`.

- [ ] **Step 4: Run the drift guard and see it bite**

Run: `npx vitest run server/__tests__/segmentEditsSchemaDrift.test.js`
Expected: FAIL — `drift` equals `['displayed_edit_id', 'displayed_edit_sha256', 'occurrence', 'origin',
'served_version_id']` (the migration added them; the hand copy has not).

- [ ] **Step 5: Update the hand copy and the 043-direct suites**

In `createSegmentEditsSchema`, after `review_id INTEGER`, add `served_version_id INTEGER, occurrence INTEGER,
origin TEXT, displayed_edit_id INTEGER, displayed_edit_sha256 TEXT` (same order as the migration). Replace the
comment above `review_id` (it says "better-sqlite3 leaves foreign_keys off, so the reference is inert in tests anyway",
which is false: this build has `SQLITE_DEFAULT_FOREIGN_KEYS=1`, CLAUDE.md § Tech Stack) with: *No REFERENCES on
`review_id` or `served_version_id`: most fixtures create neither `module_reviews` nor `served_text_versions`, and with
foreign keys ON a reference to a missing table makes any non-NULL insert fail with "no such table". The drift guard
(`segmentEditsSchemaDrift.test.js`) compares name, type, NOT NULL and key, which a REFERENCES clause does not change.*

In each listed suite, right after each `migration043.up(…)` call, add the next migration the same way, e.g.
`const migration053 = require('../migrations/053-served-text-versions');` beside the existing `migration043`
require, and `migration053.up(db);` (or `(d)`) after `migration043.up(db);`. In
`scripts/__tests__/reattachSegmentEditsWrite.test.mjs` the require goes through
`path.join(REPO_ROOT, 'server', 'migrations', '053-served-text-versions')`, as its `043` require does (`:13`).

- [ ] **Step 6: Run everything this commit touches**

Run: `npx vitest run server/__tests__/migration053.test.js server/__tests__/segmentEditsSchemaDrift.test.js server/__tests__/researchBoundary.test.js server/__tests__/migrationIdempotency.test.js server/__tests__/migrationRunnerCoverage.test.js server/__tests__/startup.test.js`, then each modified suite one at a time
(`npx vitest run server/__tests__/acceptanceApply.test.js`, … `scripts/__tests__/reattachSegmentEditsWrite.test.mjs`).
Expected: PASS everywhere. Then `npm test`: diff the failing set by name against `main`'s; expected no new names.

- [ ] **Step 7: Commit**

```bash
git add server/migrations/053-served-text-versions.js server/services/migrationRunner.js \
  server/__tests__/helpers/segmentEditsSchema.cjs server/__tests__/migration053.test.js \
  server/__tests__/segmentEditsSchemaDrift.test.js server/__tests__/researchBoundary.test.js \
  server/__tests__/acceptanceApply.test.js server/__tests__/acceptanceService.test.js \
  server/__tests__/applyStatusRebuild.test.js server/__tests__/errorHandling.test.js \
  server/__tests__/mtLockOnFirstEdit.test.js server/__tests__/propagationService.test.js \
  server/__tests__/segmentEditConflict.test.js server/__tests__/segmentEditorService.test.js \
  scripts/__tests__/reattachSegmentEditsWrite.test.mjs
git commit -m "feat(server): served_text_versions and the G1.1 editing columns (migration 053)"
```

---

### Task 4: `checks.schema` in `/api/health`

Spec §5.20, §5.8 ("a swallowed ALTER leaves saves failing"), index decision 3; decision 3.

**Files:**
- Create: `server/lib/schemaHealth.js` — `EXPECTED_SCHEMA`, `checkSchema(db, expected?)`
- Modify: `server/index.js` — the inline `/api/health` handler (`:245-358`, ed10180c): a `checks.schema` block after
  `checks.migrations` (`:260-268`)
- Test: `server/__tests__/schemaHealth.test.js` (new)

**Interfaces:**
- Consumes: a better-sqlite3 handle.
- Produces:
  - `EXPECTED_SCHEMA = { tables: { served_text_versions: [11 column names] }, columns: { segment_edits: [5 names],
    segment_acceptances: [2 names] }, indexes: ['idx_served_text_versions_key'] }`, deeply frozen.
  - `checkSchema(db, expected = EXPECTED_SCHEMA)` → `{ ok: true, missing: [] }` | `{ ok: false, missing: string[] }`
    (entries `served_text_versions`, `segment_edits.origin`, `index idx_served_text_versions_key`, in that order of
    checking) | `{ ok: false, missing: null, error: <err.code || err.name> }`. Never throws.

- [ ] **Step 1: Write the failing test**

- `it('a fresh migrated database is ok')` — `checkSchema(freshMigratedDb().db)` equals `{ ok: true, missing: [] }`.
- `it('a missing table is named, with its index')` — fresh db, `DROP TABLE served_text_versions` (no rows reference
  it, so the foreign key permits it); result equals `{ ok: false, missing: ['served_text_versions', 'index
  idx_served_text_versions_key'] }`.
- `it('a missing column is named')` — fresh db, `ALTER TABLE segment_edits DROP COLUMN origin`; result equals
  `{ ok: false, missing: ['segment_edits.origin'] }`.
- `it('never throws: a closed handle reports not ok')` — `db.close()` first; result has `ok: false`, `missing: null`
  and a string `error`.
- `it('index.js wires it into /api/health')` — `fs.readFileSync(server/index.js)` contains
  `require('./lib/schemaHealth')` and matches `/checks\.schema\s*=/` (the handler cannot be required in a test,
  `startup.test.js:150`; the pin shape of `startup.test.js`'s request-timing block).

- [ ] **Step 2: Run it**

Run: `npx vitest run server/__tests__/schemaHealth.test.js`
Expected: FAIL — `Cannot find module '../lib/schemaHealth'`.

- [ ] **Step 3: Implement**

`server/lib/schemaHealth.js`: the frozen constant and `checkSchema`, reading `db.pragma('table_info(<t>)')` per table
(names come from the constant, never from input) and `SELECT name FROM sqlite_master WHERE type = 'index'`; one
try/catch around the body returning the error shape. Header: grown per PR in the same commit as each PR's migration
(index decision 3); it reports names, never counts (§5.20).

`server/index.js`, after the migrations block:

```js
  // Check the editing schema (G1.1, spec §5.20): every table, column and index the migrations since 053 add.
  // checks.migrations only counts files, so a never-throw migration that failed would otherwise show only as
  // save errors.
  try {
    const Database = require('better-sqlite3');
    const { checkSchema } = require('./lib/schemaHealth');
    const db = new Database(require('./lib/dbPath')(), { readonly: true, fileMustExist: true });
    try {
      checks.schema = checkSchema(db);
    } finally {
      db.close();
    }
  } catch (err) {
    checks.schema = { ok: false, error: err.message };
  }
```

- [ ] **Step 4: Run it**

Run: `npx vitest run server/__tests__/schemaHealth.test.js server/__tests__/startup.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/lib/schemaHealth.js server/index.js server/__tests__/schemaHealth.test.js
git commit -m "feat(server): checks.schema reports a missing G1.1 table, column or index"
```

---

### Task 5: the served-version service: occurrence, rows, annotation, mint

Spec §5.2, §5.3 (the counter, not `withOccurrences`), §5.4 steps 1–3 and fail-soft, §11 (organic); T3 (service half);
decisions 1, 4.

**Files:**
- Create: `server/services/servedVersions.js` — `countOccurrences`, `buildVersionRow`, `versionRowsFor`,
  `annotateServed`, `mintVersions`, `recordServe`
- Test: `server/__tests__/servedVersions.test.js` (new)

**Interfaces:**
- Consumes: `sha256Text`, `isNotMintedBook` (Task 1); `server/lib/logger`; a better-sqlite3 handle passed in (never its own
  connection: the caller's transaction must include the mint).
- Produces (exact shapes in "Interfaces produced for later PRs"):
  - `countOccurrences(segments) → { occurrences: number[], duplicated: Set<string> }`
  - `buildVersionRow({ book, chapter, moduleId, segmentId, occurrence, en, is, layer }) → VersionRow`
  - `versionRowsFor(data, { book, chapter, moduleId }) → { rows: (VersionRow & { duplicated: boolean })[],
    duplicatedIds: string[] }`
  - `annotateServed(data, key) → { scope, duplicatedIds, rows }` (mutates `data.segments`)
  - `mintVersions(conn, rows) → number[]`
  - `recordServe(conn, data, key) → { scope, duplicatedIds, rows, mintOk, servedVersionIds }`

- [ ] **Step 1: Write the failing test** (fixtures are plain loader-shaped objects, `{ isSource, segments: [{ segmentId,
  en, is }] }`; database tests use `freshMigratedDb()`)

- `describe('countOccurrences (spec §5.3)')`:
  - ids `[a, b, a, c, a]` → `occurrences` `[0, 0, 1, 0, 2]`, `[...duplicated]` `['a']`.
  - `it('never throws on an id holding #')` — `countOccurrences([{ segmentId: 'm1:para:x#y' }])` returns
    `{ occurrences: [0] }`; control: `withOccurrences([{ segmentId: 'm1:para:x#y' }])` from
    `tools/lib/seg-markers.cjs` throws (`seg-markers.cjs:98-102`), so the hazard the spec avoids is real.
- `describe('versionRowsFor')` — for a three-segment layered module with one id twice: every row's `enSha256` and
  `isSha256` equal `sha256Text(en)`/`sha256Text(is)`; `layer` equals `data.isSource`; the two copies of the
  duplicated id carry `duplicated: true` and occurrences 0 and 1; `duplicatedIds` equals `['<that id>']`.
  A module with `isSource: null` throws an error with `code === 'NO_LAYER'`.
- `describe('annotateServed (spec §5.4 steps 1–2)')`:
  - minted book: every segment has `occurrence`; each non-duplicated segment has `baseSha256 ===
    sha256Text(seg.is)`; both copies of the duplicated id have no `baseSha256` key (`'baseSha256' in seg` is
    false); `scope === 'minted'`; `rows` are the non-duplicated segments only, by `segmentId`.
  - `lifraen-efnafraedi`: `scope 'not-minted-book'`, `rows` `[]`, no segment has `baseSha256`, every segment has
    `occurrence`.
  - `isSource: null`: `scope 'no-layer'`, `rows` `[]`, no `baseSha256`.
- `describe('mintVersions (spec §5.4 step 3)')`:
  - first call returns one integer id per row, aligned; a second identical call returns the same array, and
    `SELECT id FROM served_text_versions ORDER BY id` is unchanged (compare arrays).
  - a row differing only in `isSha256`, only in `enSha256`, or only in `layer` gets a new id each (three new ids,
    distinct from the first set).
  - `it('refuses organic and writes nothing, even in a mixed batch')` — `[chemistryRow, organicRow]` throws
    `code === 'BOOK_NOT_MINTED'`; the table's id list is unchanged.
  - `it('an unchanged set takes no write: it succeeds on a read-only handle')` — mint rows on `db`, open `new
    Database(path, { readonly: true })` on the same file: `mintVersions(ro, sameRows)` returns the same ids;
    control: `mintVersions(ro, [newRow])` throws (the read-only handle refuses the write), so the first call really
    attempted none.
- `describe('recordServe (spec §5.4 fail-soft)')`:
  - on a writable handle: `mintOk === true`; `servedVersionIds` equals `rows.map((r, i) => ({ segmentId:
    r.segmentId, occurrence: r.occurrence, servedVersionId: ids[i] }))` with `ids` read back by key.
  - on a read-only handle with a never-minted row: `mintOk === false`, `servedVersionIds === null`, every non-duplicated
    segment still carries `baseSha256`, and `vi.spyOn(logger, 'error')` was called once with a message matching
    `/Served-version mint failed/` and an object holding `book`, `chapter` and `moduleId` (no text).

- [ ] **Step 2: Run it**

Run: `npx vitest run server/__tests__/servedVersions.test.js`
Expected: FAIL — `Cannot find module '../services/servedVersions'`.

- [ ] **Step 3: Implement** `server/services/servedVersions.js` (CommonJS; no empty `catch` without a comment,
  `activityLogCallsiteGuard.test.js`). Header: why it is not inside the loader (17 callers, among them
  `propagationService.findOccurrences`; spec §5.4); why a counter and not `withOccurrences` (§5.3); why duplicated
  ids get no row (R4, §5.2); why the caller passes the connection (one transaction with the write that uses it, §5.6
  step 6).

```js
const { sha256Text, isNotMintedBook } = require('../lib/servedText');
const log = require('../lib/logger');

const coded = (code, message) => Object.assign(new Error(message), { code });

function countOccurrences(segments) {
  const seen = new Map();
  const occurrences = segments.map((s) => {
    const k = seen.get(s.segmentId) || 0;
    seen.set(s.segmentId, k + 1);
    return k;
  });
  const duplicated = new Set([...seen].filter(([, n]) => n > 1).map(([id]) => id));
  return { occurrences, duplicated };
}

function buildVersionRow({ book, chapter, moduleId, segmentId, occurrence, en, is, layer }) {
  if (!layer) throw coded('NO_LAYER', `${book}/${chapter}/${moduleId} has no layer`);
  return {
    book, chapter, moduleId, segmentId, occurrence,
    enSha256: sha256Text(en), isSha256: sha256Text(is), layer, enText: en, isText: is,
  };
}

function versionRowsFor(data, { book, chapter, moduleId }) {
  const { occurrences, duplicated } = countOccurrences(data.segments);
  const rows = data.segments.map((seg, i) => ({
    ...buildVersionRow({
      book, chapter, moduleId, segmentId: seg.segmentId, occurrence: occurrences[i],
      en: seg.en, is: seg.is, layer: data.isSource,
    }),
    duplicated: duplicated.has(seg.segmentId),
  }));
  return { rows, duplicatedIds: [...duplicated].sort() };
}

function annotateServed(data, key) {
  const { occurrences, duplicated } = countOccurrences(data.segments);
  data.segments.forEach((seg, i) => {
    seg.occurrence = occurrences[i];
  });
  const duplicatedIds = [...duplicated].sort();
  if (isNotMintedBook(key.book)) return { scope: 'not-minted-book', duplicatedIds, rows: [] };
  if (!data.isSource) return { scope: 'no-layer', duplicatedIds, rows: [] };
  const rows = [];
  data.segments.forEach((seg, i) => {
    if (duplicated.has(seg.segmentId)) return;
    const row = buildVersionRow({
      ...key, segmentId: seg.segmentId, occurrence: occurrences[i], en: seg.en, is: seg.is,
      layer: data.isSource,
    });
    seg.baseSha256 = row.isSha256; // hashed from the response object itself (spec §5.3)
    rows.push(row);
  });
  return { scope: 'minted', duplicatedIds, rows };
}

function mintVersions(conn, rows) {
  if (rows.length === 0) return [];
  const organic = rows.find((r) => isNotMintedBook(r.book));
  if (organic) throw coded('BOOK_NOT_MINTED', `${organic.book} is never minted`);
  const select = conn.prepare(
    `SELECT id FROM served_text_versions
      WHERE book = ? AND chapter = ? AND module_id = ? AND segment_id = ? AND occurrence = ?
        AND en_sha256 = ? AND is_sha256 = ? AND layer = ?`
  );
  let insert = null; // prepared only when a row is missing, so an unchanged set never prepares a write
  // A deferred transaction: it takes the write lock at its first INSERT, so re-serving unchanged text writes
  // nothing and never waits on another writer (spec §5.4 step 3).
  return conn.transaction(() =>
    rows.map((r) => {
      const k = [r.book, r.chapter, r.moduleId, r.segmentId, r.occurrence, r.enSha256, r.isSha256, r.layer];
      const hit = select.get(...k);
      if (hit) return hit.id;
      insert ??= conn.prepare(
        `INSERT INTO served_text_versions (book, chapter, module_id, segment_id, occurrence,
           en_sha256, is_sha256, layer, en_text, is_text) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      );
      return Number(insert.run(...k, r.enText, r.isText).lastInsertRowid);
    })
  )();
}

function recordServe(conn, data, key) {
  const annotation = annotateServed(data, key);
  if (annotation.rows.length === 0) return { ...annotation, mintOk: true, servedVersionIds: [] };
  try {
    const ids = mintVersions(conn, annotation.rows);
    return {
      ...annotation,
      mintOk: true,
      servedVersionIds: annotation.rows.map((r, i) => ({
        segmentId: r.segmentId, occurrence: r.occurrence, servedVersionId: ids[i],
      })),
    };
  } catch (err) {
    // Fail-soft (spec §5.4): the module is served with baseSha256; the save path mints its own base.
    log.error(
      { err: { code: err.code, message: err.message }, book: key.book, chapter: key.chapter, moduleId: key.moduleId },
      'Served-version mint failed; module served without its record (spec §5.4 fail-soft)'
    );
    return { ...annotation, mintOk: false, servedVersionIds: null };
  }
}

module.exports = {
  countOccurrences, buildVersionRow, versionRowsFor, annotateServed, mintVersions, recordServe,
};
```

- [ ] **Step 4: Run it**

Run: `npx vitest run server/__tests__/servedVersions.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/services/servedVersions.js server/__tests__/servedVersions.test.js
git commit -m "feat(server): servedVersions: occurrence, base hash and one-transaction mint (G1.1)"
```

---

### Task 6: the serve hook in the module route

Spec §5.4 steps 1–3 and 6, fail-soft, scope; §5.3; T1 (whole), T2 (route half), T3 (serve half; the relabel save is
Task 14), T17 (PR1 half: the module JSON), T18 (PR1 half: organic serve); index decisions 2 (PR2 seam), 15; decisions 4, 17.

**Files:**
- Modify: `server/routes/segment-editor.js` — requires (beside `:41-49`, ed10180c); the module GET handler
  (`:264-332`): `recordServe` after the loader call (`:272-276`), `contentSha256` in the `editsBySegment` loop
  (`:290-296`), the PR2 seam comment before `res.json` (`:320`)
- Modify: `server/services/segmentEditorService.js` — `module.exports` (`:1555-1601`) gains `getDb` (defined at `:29`;
  decision 11)
- Create: `server/__tests__/helpers/servedFixture.js` (CJS) — `segFile(pairs)`, `writeModule(root, spec)`,
  `writeRaw(root, rel, text)`, `handlerFor(router, method, routePath)`, `invoke(handler, req)`, `EDITOR`
- Test: `server/__tests__/servedServeHook.test.js` (new), `server/__tests__/servedVersionsIntegrity.test.js` (new, T1),
  `server/__tests__/researchBoundary.test.js` (extend)

**Interfaces:**
- Consumes: `servedVersions.recordServe(conn, data, key)` (Task 5), `sha256Text` (Task 1), `segmentEditor.getDb()` (exported
  here).
- Produces: module response `segments[i].occurrence` (always) and `segments[i].baseSha256` (decision 4); `edits[segId][j]
  .contentSha256`; nothing else. The route-local `served` (the `recordServe` result) is PR2's seam.

- [ ] **Step 1: Write the failing tests**

`server/__tests__/helpers/servedFixture.js` — the SEG marker with **no space after the colon** (CLAUDE.md § SEG
marker; `segmentParser.parseSegments` returns `[]` on the spaced form):

```js
const fs = require('fs');
const path = require('path');
const segFile = (pairs) => pairs.map(([id, text]) => `<!-- SEG:${id} -->\n${text}\n`).join('\n');
function writeRaw(root, rel, text) {
  fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
  fs.writeFileSync(path.join(root, rel), text);
}
/** { book, chapterDir, moduleId, en: [[id, text]], mt?: [[id, text]] | string, faithful?: same } */
function writeModule(root, { book, chapterDir, moduleId, en, mt = null, faithful = null }) {
  const body = (x) => (typeof x === 'string' ? x : segFile(x));
  writeRaw(root, `${book}/02-for-mt/${chapterDir}/${moduleId}-segments.en.md`, body(en));
  if (mt) writeRaw(root, `${book}/02-mt-output/${chapterDir}/${moduleId}-segments.is.md`, body(mt));
  if (faithful) writeRaw(root, `${book}/03-faithful-translation/${chapterDir}/${moduleId}-segments.is.md`, body(faithful));
}
function handlerFor(router, method, routePath) {
  const layer = router.stack.find((l) => l.route && l.route.path === routePath && l.route.methods[method]);
  return layer.route.stack.at(-1).handle;
}
function invoke(handler, req) {
  return new Promise((resolve) => {
    const res = {
      statusCode: 200,
      status(c) { this.statusCode = c; return this; },
      json(body) { resolve({ status: this.statusCode, body }); },
    };
    handler(req, res);
  });
}
const EDITOR = Object.freeze({ id: 'u-ed1', username: 'editor1', role: 'editor', books: [] });
module.exports = { segFile, writeModule, writeRaw, handlerFor, invoke, EDITOR };
```

`server/__tests__/servedServeHook.test.js` — env before any server require (`segmentEditBackstop.test.js:48-51`):
`SESSIONS_DB_PATH` in a `mkdtempSync` dir, `JWT_SECRET`; `beforeAll`: `runAllMigrations()`, a temp books root through
`segmentParser._setTestBooksDir(root)` (restored in `afterAll`), `get = handlerFor(router, 'get',
'/:book/:chapter/:moduleId')`. `serve(book, chapterNum, moduleId)` → `invoke(get, { params: { book, chapter:
String(chapterNum), moduleId }, chapterNum, user: EDITOR })`. `rows(where)` reads `served_text_versions` through a
second connection.

- `describe('T2, route half: each normalisation step is hashed after it, from the response object (spec §5.3)')` —
  module `efnafraedi-2e/ch01/m90001`, written with `writeRaw` so the IS body is exact:

  | id | EN | IS body in the file | served `is` (asserted) | pre-step text (asserted to differ) |
  |---|---|---|---|---|
  | `m90001:para:trim` | `Space.` | `\n   Bil í kring.   \n` between the markers | `Bil í kring.` | the untrimmed slice between the two markers |
  | `m90001:para:wrap` | `Wrap.` | `Lína eitt\nlína tvö` | `Lína eitt lína tvö` | `Lína eitt\nlína tvö` |
  | `m90001:para:esc` | `Formula [[MATH:1]] here.` | `Formúla \[\[MATH:1\]\] hér.` (literal backslashes) | `Formúla [[MATH:1]] hér.` | `Formúla \[\[MATH:1\]\] hér.` |
  | `m90001:para:term` | `The __atom__ is small.` | `**Frumeindin** er lítil.` | `__Frumeindin__ er lítil.` | `**Frumeindin** er lítil.` |
  | `m90001:para:plain` (control) | `Plain.` | `Óbreytt.` | `Óbreytt.` | `Óbreytt.` (equal) |

  For each row: `seg.is` equals the served text; `seg.baseSha256 === sha256Text(served)`; the minted row's
  `is_sha256` equals `seg.baseSha256` and its `is_text` equals `seg.is`; `sha256Text(preStep) !== seg.baseSha256`.
  Control row: `sha256Text(preStep) === seg.baseSha256`.
- `describe('T3, serve half (spec §5.2)')` — module `efnafraedi-2e/ch01/m90003` (segments `a`, `b`, and `d` twice)
  and `m90006` (control):
  - `it('serving identical text twice adds no row')` — `SELECT id … WHERE module_id = 'm90003'` before and after a
    second serve are equal arrays.
  - `it('changing the Icelandic adds exactly one row, and the old one stays')` — rewrite `b`'s IS, serve: the new id
    set minus the old is one id whose row has `segment_id 'm90003:para:b'` and the new `is_text`; the old row is still
    present.
  - `it('changing the English adds exactly one row')` — rewrite `a`'s EN, same shape.
  - `it('changing only the layer adds one row per segment, with the same is_sha256')` — copy the MT file
    byte-for-byte to `03-faithful-translation/ch01/m90003-segments.is.md`, serve: the response's `isSource` is
    `faithful`; for each non-duplicated id there is now a `faithful` row whose `is_sha256` equals its `mt-output`
    row's.
  - `it('a duplicated id and a layerless module mint nothing; a second module gains its own rows')` — no row has
    `segment_id 'm90003:para:d'`; both copies of `d` in the response carry `occurrence` 0 and 1 and no `baseSha256`;
    `m90002` (EN only) serves 200 with no `baseSha256` on any segment and no rows; control: `m90006` served in the same
    test gains rows for exactly its segment ids (compare sets).
- `describe('the chapter is in every key (Review Focus 2 of the index)')` — `chapter-metadata` written under `ch02`
  and `ch05`: after a ch02 serve, `SELECT DISTINCT chapter FROM served_text_versions WHERE module_id =
  'chapter-metadata'` is `[2]`; after a ch05 serve, `[2, 5]`. An appendix module served with `chapter: 'appendices'`,
  `chapterNum: -1` mints rows with `chapter = -1`.
- `describe('contentSha256 per edit row (spec §5.4 step 6)')` — seed two edits on `m90006` with
  `segmentEditor.saveSegmentEdit` (legacy call); serve; every row in `body.edits` has `contentSha256 ===
  sha256Text(row.edited_content)`; the column is not stored (`PRAGMA table_info(segment_edits)` has no
  `contentsha256`).
- `describe('fail-soft minting (spec §5.4)')` — `segmentEditor._setTestDb(new Database(dbPath, { readonly: true }))`
  (restored with `_setTestDb(null)` in `finally`): a module never served before answers 200, every non-duplicated
  segment has `baseSha256`, the row set is unchanged, `logger.error` was called once with
  `/Served-version mint failed/`; then, still read-only, a module served earlier with unchanged files answers 200 and
  `logger.error` is not called again (no write was attempted).
- `describe('T18, PR1 half: an organic serve mints nothing')` — `lifraen-efnafraedi/ch01/m90004` with EN and MT
  (segments `m90004:para:x`, `m90004:para:y`), and its chemistry twin `efnafraedi-2e/ch01/m90005` (`m90005:para:x`,
  `m90005:para:y`, the same texts), both served in the same `it`: the organic serve answers 200, every segment has
  `occurrence` and none has `baseSha256`; `SELECT module_id, segment_id FROM served_text_versions WHERE book =
  'lifraen-efnafraedi' ORDER BY module_id, segment_id` equals `[]`. Control, same fixture: the same query for
  `book = 'efnafraedi-2e' AND module_id = 'm90005'` equals `[{ module_id: 'm90005', segment_id: 'm90005:para:x' },
  { module_id: 'm90005', segment_id: 'm90005:para:y' }]` (spec §10: values or sets, never only counts).

`server/__tests__/servedVersionsIntegrity.test.js` (T1; real committed corpus, read-only on `books/`; temp
`SESSIONS_DB_PATH`; `it(…, { timeout: 120_000 })`):

```js
// Chains: committed layer 2, books/efnafraedi-2e/02-mt-revised/<chDir>/<stem>-changes.jsonl. A chain is the
// change records of one (chDir, module, segmentId, occurrence); its first record's beforeSha256 is what the AI read.
const chapterOf = (chDir) => (chDir === 'appendices' ? -1 : parseInt(chDir.slice(2), 10)); // appendices load as -1
const keyOf = (c) => `${c.chDir}/${c.module}/${c.segmentId}#${c.occurrence}`;
// for each chain outside ch00: serve (chDir, module) once through the real GET handler (books dir NOT overridden);
// the id is duplicated iff it occurs more than once in body.segments.
//   - not duplicated: is_sha256 = the served_text_versions row by (book, chapter, module, segment, occurrence);
//     ALSO assert body's baseSha256 for that segment equals it. A missing row is a mismatch, never a fallback.
//   - duplicated, and every ch00 chain (validateParams.js:29 refuses chapter 0): the same row builder,
//     servedVersions.versionRowsFor(segmentParser.loadModuleForEditing(...)), at (segmentId, occurrence).
it('T1: the chains whose first beforeSha256 differs from G1.1’s is_sha256 are exactly the two known ones', () => {
  expect([...mismatched].sort()).toEqual([
    'ch05/m68726/m68726:para:fs-idm94618544#0',
    'ch08/m68747/m68747:para:fs-idm99049568#0',
  ]);
  // positive control: every other chain matches, as a set; and the matched set includes chapter metadata,
  // an appendix and ch00
  expect([...matched].sort()).toEqual(allKeys.filter((k) => !mismatched.has(k)).sort());
  expect([...matched]).toEqual(expect.arrayContaining([
    'ch02/chapter-metadata/chapter:title:ch02#0',
    'appendices/m68860/m68860:para:fs-idm37591248#0',
    'ch00/m68662/m68662:para:pref-p-009#0',
  ]));
});
```

`server/__tests__/researchBoundary.test.js`, appended (move the env lines to the top of the file, before any server
require; the temp books root and handler as in `servedServeHook.test.js`):

```js
// What the module route may send (spec §5.4 step 6): today's keys plus PR1's three. Exact sets, so any new key fails.
const MODULE_JSON_ALLOWED = Object.freeze({
  top: ['book', 'chapter', 'moduleId', 'isSource', 'title', 'titleIs', 'segments', 'equations', 'segmentCount',
    'translatedCount', 'mtFindingsGeneratedAt', 'extractedAt', 'sourceHash', 'edits', 'stats', 'acceptances',
    'otherPendingSegments'],
  segment: ['segmentId', 'moduleId', 'segmentType', 'elementId', 'en', 'is', 'hasTranslation', 'mtFinding',
    'occurrence', 'baseSha256'],
  editRow: [...ALLOWED_COLUMNS.segment_edits, 'contentSha256'],
  acceptanceRow: [...ALLOWED_COLUMNS.segment_acceptances],
});
// Research and time-of-person names that must never reach a browser (spec §11), at any depth.
const FORBIDDEN_KEY =
  /(opened|switched|inflight|editor_?key|client_?action|assists?$|accept_?origin|reviewed_?edit|replayed|research|consent)/i;
const keysDeep = (v) =>
  v && typeof v === 'object'
    ? Object.entries(v).flatMap(([k, x]) => [...(Array.isArray(v) ? [] : [k]), ...keysDeep(x)])
    : [];
function jsonDrift(body) {
  const seg = body.segments.find((s) => 'baseSha256' in s);
  const firstEdit = Object.values(body.edits)[0][0];
  const firstAcc = Object.values(body.acceptances)[0];
  const odd = (keys, allowed) => keys.filter((k) => !allowed.includes(k)).sort();
  return {
    top: odd(Object.keys(body), MODULE_JSON_ALLOWED.top),
    segment: odd(Object.keys(seg), MODULE_JSON_ALLOWED.segment),
    editRow: odd(Object.keys(firstEdit), MODULE_JSON_ALLOWED.editRow),
    acceptanceRow: odd(Object.keys(firstAcc), MODULE_JSON_ALLOWED.acceptanceRow),
    forbidden: [...new Set(keysDeep(body).filter((k) => FORBIDDEN_KEY.test(k)))].sort(),
  };
}
describe('T17 (PR1): the module JSON carries no research field and no new time', () => {
  it('every key is allowed, at every level', async () => {
    // seed: one edit (segmentEditor.saveSegmentEdit, legacy call) and one acceptance
    // (acceptanceService.acceptSegment, legacy call) on a two-segment fixture module, then serve it
    const { status, body } = await serve(/* … */);
    expect(status).toBe(200);
    expect(jsonDrift(body)).toEqual({ top: [], segment: [], editRow: [], acceptanceRow: [], forbidden: [] });
  });
  it('control: a planted key is reported at each level', async () => {
    const { body } = await serve(/* same module */);
    body.opened_at_ms = 1;
    body.segments.find((s) => 'baseSha256' in s).assists = [];
    Object.values(body.edits)[0][0].clientActionId = 'x';
    expect(jsonDrift(body)).toMatchObject({ top: ['opened_at_ms'], segment: ['assists'],
      editRow: ['clientActionId'], forbidden: ['assists', 'clientActionId', 'opened_at_ms'] });
  });
});
```

- [ ] **Step 2: Run them**

Run: `npx vitest run server/__tests__/servedServeHook.test.js server/__tests__/servedVersionsIntegrity.test.js server/__tests__/researchBoundary.test.js`
Expected: FAIL — the serve tests find no `baseSha256` (undefined) and no `served_text_versions` rows (empty arrays);
T1's `mismatched` holds every non-ch00, non-duplicated chain, not the two; T17's `segment` drift is `[]` but the
`seg` lookup finds no segment carrying `baseSha256` (TypeError on `undefined`), and `editRow` lacks nothing yet.
The organic case fails on `occurrence` (absent today); its no-row half already holds (nothing is minted for any
book yet), and its control fails.

- [ ] **Step 3: Implement**

In `server/routes/segment-editor.js`, requires:

```js
const servedVersions = require('../services/servedVersions');
const { sha256Text } = require('../lib/servedText');
```

Add `getDb` to `segmentEditorService`'s `module.exports`. In the GET handler, right after `const data = segmentParser.loadModuleForEditing(…)`:

```js
      // G1.1 (spec §5.4 steps 1–3): occurrence and baseSha256 on the response's own segments, and the served
      // versions minted in one sessions.db transaction. Fail-soft: a failed mint is logged and the module is still
      // served with baseSha256; the save path mints the base it checks. Never in the loader (17 callers).
      const served = servedVersions.recordServe(segmentEditor.getDb(), data, {
        book: req.params.book,
        chapter: req.chapterNum,
        moduleId: req.params.moduleId,
      });
```

In the `editsBySegment` loop, push `{ ...edit, contentSha256: sha256Text(edit.edited_content) }` instead of `edit`.
Immediately before `res.json({`:

```js
      // ── spec §5.4 step 4, PR2's opening step, goes HERE: after every editor's edit rows are read (above) and
      //    before res.json. It reads `served.mintOk` (false while its predicate holds → 503 OPENING_UNRECORDED),
      //    `served.servedVersionIds` and `served.duplicatedIds`. Step 5 (G1.23) reads seg.baseSha256 from
      //    data.segments after it. Nothing here may add a field to the response but per-segment occurrence and
      //    baseSha256 and per-edit contentSha256 (T17). ──
```

Nothing else reads `served` in PR1, and `no-unused-vars` is an error for variables (`eslint.config.js:40` ignores only
`_`-prefixed arguments), so the line above `const served` is
`// eslint-disable-next-line no-unused-vars -- PR2's opening step reads it (spec §5.4 step 4)` (the precedent is
`server/__tests__/acceptanceRoutes.test.js:33`).

- [ ] **Step 4: Run them**

Run: `npx vitest run server/__tests__/servedServeHook.test.js server/__tests__/servedVersionsIntegrity.test.js server/__tests__/researchBoundary.test.js server/__tests__/acceptanceRoutes.test.js server/__tests__/segmentEditBackstop.test.js`
Expected: PASS (the last two are regression controls: `acceptanceRoutes.test.js:258-273` drives the same handler).

- [ ] **Step 5: Commit**

```bash
git add server/routes/segment-editor.js server/services/segmentEditorService.js \
  server/__tests__/helpers/servedFixture.js server/__tests__/servedServeHook.test.js \
  server/__tests__/servedVersionsIntegrity.test.js server/__tests__/researchBoundary.test.js
git commit -m "feat(server): the module route mints served versions and sends baseSha256 (G1.1 serve hook)"
```

---

### Task 7: `saveRetry` reports the refusal code, marks a replay, and parks a refusal answered to a replay

Spec: §5.18 (rows 5 and 6, "`saveRetry.js` is shared"), §5.6 ("a queued replay that gets any non-5xx answer is
dropped with a toast … Both paths must keep the text first"), §5.9 (`replayed`, `client_action_id`), index decisions
4 and 12, T23 (its "`saveRetry` errors carry `code`" half), T20's client precondition (a replay carries `replayed`);
decisions 27 and 28.

**Files:**
- Modify: `server/public/js/saveRetry.js` — new module-level `DEFAULT_KEY_POLICIES`; `createSaveRetry`: new
  `setKeyPolicy`, `policyFor`, `replayOptions`, `loadParked`, `saveParked`, `park`, `takeParked`, and the optional
  `deps.keyPolicies`; `executeRetry` (the fetch options and a new terminal branch); `attempt`'s non-retryable block
  (`err.code`, `err.data`); `processQueue` (prune parked items); the returned API; the browser wiring (`createSaveRetry({…})` at
  `:362-371`, ed10180c: passes `keyPolicies: DEFAULT_KEY_POLICIES`); `module.exports` (`:381-383`).
- Test: `server/__tests__/saveRetryQueue.test.js` — `makeHarness` gains an optional clock and optional key policies;
  two new `describe` blocks.

**Interfaces:**
- Consumes: nothing new.
- Produces (on the object `createSaveRetry(deps)` returns, and so on `window.saveRetry`):
  - `DEFAULT_KEY_POLICIES` (exported beside `createSaveRetry`): `[{ prefix: 'seg:', markReplayed: true }, { prefix:
    'acc:', markReplayed: true }]`, frozen; the browser wiring registers them, so a segment save or an MT accept is
    marked `replayed` on whichever page replays it (decision 27). `deps.keyPolicies` (optional array) is registered
    through `setKeyPolicy` when the object is created.
  - `setKeyPolicy(prefix: string, policy: {markReplayed?: boolean, parkRefused?: boolean, onParked?: (item) => void})`
    — the longest matching prefix wins; a second call for the same prefix replaces the first.
  - `takeParked(prefix: string, options?: {exact?: boolean})` → `Array<{key, url, body, status, code, message,
    parkedAt}>`, removed from storage as they are returned; `exact: true` matches `key === prefix`.
  - On a non-retryable live answer: `err.status`, `err.code = data.error`, `err.data = data` (additive).
  - On a replay under `markReplayed`: the fetched body (a JSON object) gains `replayed: true`; the stored entry is not
    changed.

- [ ] **Step 1: Write the failing tests**

In `server/__tests__/saveRetryQueue.test.js`, change `const { createSaveRetry } = require('../public/js/saveRetry');`
to `const { createSaveRetry, DEFAULT_KEY_POLICIES } = require('../public/js/saveRetry');`, change `function
makeHarness() {` to `function makeHarness({ clock, keyPolicies } = {}) {`, its `now: () => 1_000_000,` to `now: () =>
(clock ? clock.t : 1_000_000),`, and add `keyPolicies,` to the `createSaveRetry({ … })` deps. Append:

```js
const res = (status, body) => () =>
  Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(body) });
const notJson = (status) => () =>
  Promise.resolve({ ok: false, status, json: () => Promise.reject(new SyntaxError('html')) });
const settle = async () => {
  for (let i = 0; i < 3; i++) await new Promise((r) => setImmediate(r));
};
const DAY = 24 * 60 * 60 * 1000;

describe('saveRetry refusal codes (G1.1, spec §5.18, T23)', () => {
  it('a non-retryable answer carries err.code and err.data, and is not queued', async () => {
    const h = makeHarness();
    const body = { error: 'STALE_BASE', message: 'Textinn hefur breyst.' };
    h.setFetchScript([res(409, body)]);
    const err = await h.sr.attempt('seg:b/1/m:s1', '/api/x', { method: 'POST' }).catch((e) => e);
    expect(err.status).toBe(409);
    expect(err.code).toBe('STALE_BASE');
    expect(err.data).toEqual(body);
    expect(err.message).toBe('Textinn hefur breyst.');
    expect(h.queue()).toEqual([]);
  });

  it('control: a 5xx carries no code and is queued', async () => {
    const h = makeHarness();
    h.setFetchScript([res(500, { error: 'boom' })]);
    const err = await h.sr.attempt('seg:b/1/m:s1', '/api/x', { method: 'POST' }).catch((e) => e);
    expect(err.code).toBeUndefined();
    expect(h.queue()).toHaveLength(1);
  });

  it('a refusal whose body is not JSON keeps today\'s message and has no code', async () => {
    const h = makeHarness();
    h.setFetchScript([notJson(409)]);
    const err = await h.sr.attempt('seg:b/1/m:s1', '/api/x', { method: 'POST' }).catch((e) => e);
    expect(err.message).toBe('Villa 409');
    expect(err.code).toBeUndefined();
    expect(err.data).toBeUndefined();
  });
});

describe('saveRetry key policies: replays marked, refusals to a replay parked (§5.9, §5.6, index decision 12)', () => {
  const BODY = JSON.stringify({ segmentId: 's1', editedContent: 'typed', clientActionId: 'a1' });

  it('marks a replay replayed: true and leaves the stored entry as sent', async () => {
    const h = makeHarness();
    h.sr.setKeyPolicy('seg:', { markReplayed: true });
    h.setFetchScript([h.fail500(), h.ok()]);
    await h.sr.attempt('seg:b/1/m:s1', '/api/x', { method: 'POST', body: BODY }).catch(() => {});
    expect(h.queue()[0].options.body).toBe(BODY);
    await h.fireAllTimers();
    expect(h.fetchCalls[0].options.body).toBe(BODY); // the live attempt carries no flag
    expect(JSON.parse(h.fetchCalls[1].options.body)).toEqual({ ...JSON.parse(BODY), replayed: true });
  });

  it('control: a key with no policy replays byte-identical (the Pass 2 editor\'s keys)', async () => {
    const h = makeHarness();
    h.sr.setKeyPolicy('seg:', { markReplayed: true });
    h.setFetchScript([h.fail500(), h.ok()]);
    await h.sr.attempt('loc:b/1/m:s1', '/api/x', { method: 'POST', body: BODY }).catch(() => {});
    await h.fireAllTimers();
    expect(h.fetchCalls[1].options.body).toBe(BODY);
  });

  it('DEFAULT_KEY_POLICIES mark a seg: and an acc: replay with no page policy; loc: is untouched (decision 27)', async () => {
    const h = makeHarness({ keyPolicies: DEFAULT_KEY_POLICIES }); // what the browser wiring passes, on every page
    h.setFetchScript([h.fail500(), h.fail500(), h.fail500(), h.ok(), h.ok(), h.ok()]);
    for (const key of ['seg:b/1/m:s1', 'acc:b/1/m:s1', 'loc:b/1/m:s1']) {
      await h.sr.attempt(key, `/api/${key.slice(0, 3)}`, { method: 'POST', body: BODY }).catch(() => {});
    }
    await h.fireAllTimers();
    const replays = Object.fromEntries(h.fetchCalls.slice(3).map((c) => [c.url, c.options.body]));
    expect(JSON.parse(replays['/api/seg'])).toEqual({ ...JSON.parse(BODY), replayed: true });
    expect(JSON.parse(replays['/api/acc'])).toEqual({ ...JSON.parse(BODY), replayed: true });
    expect(replays['/api/loc']).toBe(BODY); // control: the Pass 2 editor's key replays byte-identical
  });

  it('the browser wiring registers DEFAULT_KEY_POLICIES before it schedules processQueue', () => {
    const src = require('fs').readFileSync(require.resolve('../public/js/saveRetry'), 'utf-8');
    const wiring = src.slice(src.indexOf('root.saveRetry = createSaveRetry('));
    expect(wiring).toMatch(/keyPolicies:\s*DEFAULT_KEY_POLICIES/);
    expect(wiring.indexOf('keyPolicies')).toBeLessThan(wiring.indexOf('processQueue'));
  });

  it('parks a 409 answered to a replay, hands it to the owner once, and empties the queue', async () => {
    const h = makeHarness();
    const seen = [];
    h.sr.setKeyPolicy('seg:', { parkRefused: true, onParked: (item) => seen.push(item) });
    h.setFetchScript([h.fail500(), res(409, { error: 'STALE_BASE', message: 'm' })]);
    await h.sr.attempt('seg:b/1/m:s1', '/api/x', { method: 'POST', body: BODY }).catch(() => {});
    await h.fireAllTimers();
    await settle();
    const parked = {
      key: 'seg:b/1/m:s1',
      url: '/api/x',
      body: BODY,
      status: 409,
      code: 'STALE_BASE',
      message: 'm',
      parkedAt: 1_000_000,
    };
    expect(seen).toEqual([parked]);
    expect(h.queue()).toEqual([]);
    expect(h.toasts.at(-1).message).toMatch(/geymdur/);
    expect(h.sr.takeParked('seg:b/1/m:')).toEqual([parked]);
    expect(h.sr.takeParked('seg:b/1/m:')).toEqual([]); // taken once
  });

  it('control: the same refusal on a key with no policy is dropped with today\'s toast', async () => {
    const h = makeHarness();
    h.sr.setKeyPolicy('seg:', { parkRefused: true });
    h.setFetchScript([h.fail500(), res(409, { error: 'conflict', message: 'm' })]);
    await h.sr.attempt('loc:b/1/m:s1', '/api/x', { method: 'POST', body: BODY }).catch(() => {});
    await h.fireAllTimers();
    await settle();
    expect(h.sr.takeParked('loc:')).toEqual([]);
    expect(h.toasts.at(-1).message).toMatch(/Vista mistókst eftir/);
  });

  it('parks any non-5xx answer to a replay, a 404 too (spec §5.6, decision 28); a 5xx is retried instead', async () => {
    const h = makeHarness();
    h.sr.setKeyPolicy('seg:', { parkRefused: true });
    h.setFetchScript([h.fail500(), res(404, { error: 'segment not found' })]);
    await h.sr.attempt('seg:b/1/m:s1', '/api/x', { method: 'POST', body: BODY }).catch(() => {});
    await h.fireAllTimers();
    await settle();
    expect(h.sr.takeParked('seg:b/1/m:s1', { exact: true }).map((p) => [p.key, p.status, p.code])).toEqual([
      ['seg:b/1/m:s1', 404, 'segment not found'],
    ]);
    // Control, same harness: a 5xx answered to a replay is queued again, never parked.
    h.setFetchScript([h.fail500(), h.fail500()]);
    await h.sr.attempt('seg:b/1/m:s2', '/api/x', { method: 'POST', body: BODY }).catch(() => {});
    await h.fireAllTimers();
    await settle();
    expect(h.sr.takeParked('seg:b/1/m:s2', { exact: true })).toEqual([]);
    expect(h.queue().map((q) => q.key)).toEqual(['seg:b/1/m:s2']);
  });

  it('a 409 to the LIVE attempt is never parked: the caller keeps that text', async () => {
    const h = makeHarness();
    const seen = [];
    h.sr.setKeyPolicy('seg:', { parkRefused: true, onParked: (item) => seen.push(item) });
    h.setFetchScript([res(409, { error: 'STALE_BASE', message: 'm' })]);
    const err = await h.sr.attempt('seg:b/1/m:s1', '/api/x', { method: 'POST', body: BODY }).catch((e) => e);
    expect(err.code).toBe('STALE_BASE');
    expect(seen).toEqual([]);
    expect(h.sr.takeParked('seg:')).toEqual([]);
  });

  it('takeParked with exact: true takes one key, not every key it prefixes', async () => {
    const h = makeHarness();
    h.sr.setKeyPolicy('seg:', { parkRefused: true });
    h.setFetchScript([
      h.fail500(),
      h.fail500(),
      res(409, { error: 'conflict' }),
      res(409, { error: 'conflict' }),
    ]);
    await h.sr.attempt('seg:b/1/m:s1', '/api/x', { method: 'POST', body: BODY }).catch(() => {});
    await h.sr.attempt('seg:b/1/m:s10', '/api/x', { method: 'POST', body: BODY }).catch(() => {});
    await h.fireAllTimers();
    await settle();
    expect(h.sr.takeParked('seg:b/1/m:s1', { exact: true }).map((p) => p.key)).toEqual(['seg:b/1/m:s1']);
    // Control: a prefix take would have taken both; the other is still there.
    expect(h.sr.takeParked('seg:b/1/m:s1').map((p) => p.key)).toEqual(['seg:b/1/m:s10']);
  });

  it('processQueue drops a parked item older than 7 days and keeps a younger one', async () => {
    const clock = { t: 1_000_000 };
    const h = makeHarness({ clock });
    h.sr.setKeyPolicy('seg:', { parkRefused: true });
    h.setFetchScript([h.fail500(), res(409, { error: 'conflict' })]);
    await h.sr.attempt('seg:b/1/m:old', '/api/x', { method: 'POST', body: BODY }).catch(() => {});
    await h.fireAllTimers();
    await settle();
    clock.t += 6 * DAY;
    h.setFetchScript([h.fail500(), res(409, { error: 'conflict' })]);
    await h.sr.attempt('seg:b/1/m:new', '/api/x', { method: 'POST', body: BODY }).catch(() => {});
    await h.fireAllTimers();
    await settle();
    clock.t += 2 * DAY; // old is 8 days, new is 2
    h.sr.processQueue();
    expect(h.sr.takeParked('seg:').map((p) => p.key)).toEqual(['seg:b/1/m:new']);
  });
});
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `npx vitest run server/__tests__/saveRetryQueue.test.js`
Expected: FAIL — the code tests with `expected undefined to be 'STALE_BASE'` (the non-retryable block,
`saveRetry.js:234-238`, sets only `err.status`); the policy tests with `TypeError: h.sr.setKeyPolicy is not a
function`; the `DEFAULT_KEY_POLICIES` test because the import is `undefined`, so no replay is marked
(`expected '{"segmentId":…}' to deeply equal { …, replayed: true }`), and the wiring pin finds no `keyPolicies:`. Two
new cases pin behaviour that already holds and pass today: `control: a 5xx carries no code`, and `a refusal whose
body is not JSON keeps today's message and has no code` (the second callback at `saveRetry.js:239-243` builds
`Error('Villa ' + status)` with only `.status`). Every pre-existing test in the file passes.

- [ ] **Step 3: Implement**

Inside the IIFE, before `function createSaveRetry(deps) {` (`:15`):

```js
  // G1.1 (spec §5.18 row 5; plan decision 27): the queue is shared, so a segment save or an MT accept is marked
  // replayed on WHICHEVER page replays it, the Pass 2 editor's included. Pass 2's own keys get no policy.
  const DEFAULT_KEY_POLICIES = Object.freeze([
    Object.freeze({ prefix: 'seg:', markReplayed: true }),
    Object.freeze({ prefix: 'acc:', markReplayed: true }),
  ]);
```

In `createSaveRetry`, after `const activeTimers = {};`, add the policy and parking functions. **Do not write the text
`// Non-retryable` anywhere above `attempt`:** `clientMessageContracts.test.js:40` isolates its block from the first
occurrence of that comment.

```js
    const PARKED_KEY = 'saveRetryParked';
    const PARKED_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // the drafts' window (tabGuard.js)
    const keyPolicies = [];

    // ----------------------------------------------------------------
    // KEY POLICIES (G1.1, spec §5.18). Opt-in per key prefix, so a page
    // that registers none (the Pass 2 editor) behaves exactly as before.
    // ----------------------------------------------------------------

    function setKeyPolicy(prefix, policy) {
      for (let i = keyPolicies.length - 1; i >= 0; i--) {
        if (keyPolicies[i].prefix === prefix) keyPolicies.splice(i, 1);
      }
      keyPolicies.push({
        prefix: prefix,
        markReplayed: !!(policy && policy.markReplayed),
        parkRefused: !!(policy && policy.parkRefused),
        onParked: policy && typeof policy.onParked === 'function' ? policy.onParked : null,
      });
    }

    function policyFor(key) {
      let best = null;
      for (let i = 0; i < keyPolicies.length; i++) {
        const p = keyPolicies[i];
        if (key.indexOf(p.prefix) === 0 && (!best || p.prefix.length > best.prefix.length)) best = p;
      }
      return best || { markReplayed: false, parkRefused: false, onParked: null };
    }

    /** What a replay sends: the stored options, with replayed: true when the key's owner asked. */
    function replayOptions(stored) {
      const opts = stored.options;
      if (!policyFor(stored.key).markReplayed || typeof opts.body !== 'string') return opts;
      let parsed;
      try {
        parsed = JSON.parse(opts.body);
      } catch {
        return opts; // not JSON: replay it as stored
      }
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return opts;
      parsed.replayed = true;
      return {
        method: opts.method,
        headers: opts.headers,
        body: JSON.stringify(parsed),
        credentials: opts.credentials,
      };
    }

    // ----------------------------------------------------------------
    // PARKED REPLAYS (index decision 12). A replay runs outside the caller's
    // promise and can outlive the page, so a 409 answered to one is kept here
    // for its owner instead of being dropped with a toast.
    // ----------------------------------------------------------------

    function loadParked() {
      try {
        const raw = storage.getItem(PARKED_KEY);
        const list = raw ? JSON.parse(raw) : [];
        return Array.isArray(list) ? list : [];
      } catch {
        // parse error: nothing usable is parked
        return [];
      }
    }

    function saveParked(list) {
      try {
        if (list.length === 0) storage.removeItem(PARKED_KEY);
        else storage.setItem(PARKED_KEY, JSON.stringify(list));
      } catch {
        toast('Geymsla í vafra er full — endurtilraunir gætu glatast.', 'error');
      }
    }

    function park(stored, status, data) {
      const item = {
        key: stored.key,
        url: stored.url,
        body: stored.options.body,
        status: status,
        code: data && typeof data.error === 'string' ? data.error : null,
        message: data && typeof data.message === 'string' ? data.message : null,
        parkedAt: now(),
      };
      const list = loadParked().filter(function (p) {
        return p.key !== item.key;
      });
      list.push(item);
      saveParked(list);
      // ⚠️ PROPOSED WORDING, for [USER]'s check (index decision 13).
      toast('Vistun var hafnað — textinn var geymdur og birtist aftur í bútnum.', 'error', true);
      const policy = policyFor(stored.key);
      if (policy.onParked) {
        try {
          policy.onParked(item);
        } catch {
          // the owner's hook failing must not lose the text: it stays parked
        }
      }
    }

    function takeParked(prefix, options) {
      const exact = !!(options && options.exact);
      const matches = function (p) {
        return typeof p.key === 'string' && (exact ? p.key === prefix : p.key.indexOf(prefix) === 0);
      };
      const list = loadParked();
      const taken = list.filter(matches);
      if (taken.length > 0) {
        saveParked(
          list.filter(function (p) {
            return !matches(p);
          })
        );
      }
      return taken;
    }

    // After keyPolicies exists: the policies the caller passes (the browser wiring passes DEFAULT_KEY_POLICIES).
    (deps.keyPolicies || []).forEach(function (p) {
      setKeyPolicy(p.prefix, p);
    });
```

In `executeRetry`, change `fetchFn(stored.url, stored.options)` to `fetchFn(stored.url, replayOptions(stored))`, and
insert a branch between the retry branch and the terminal `else` of the `.then`:

```js
            } else if (!isRetryableResponse(response) && policyFor(stored.key).parkRefused) {
              // Spec §5.6: ANY non-5xx answer to a replay keeps the text (decision 28), not only a 409.
              removeFromQueue(stored.key);
              return response.json().then(
                function (data) {
                  park(stored, response.status, data);
                },
                function () {
                  park(stored, response.status, null);
                }
              );
            } else {
```

In `attempt`'s non-retryable block, inside the first callback of `response.json().then(…)` (keep the two-argument form
and add no `.catch(`, `clientMessageContracts.test.js:39-52`), after `err.status = response.status;`:

```js
              err.code = data.error; // the server's refusal code (G1.1, §5.18); undefined when absent
              err.data = data;
```

In `processQueue`, before `if (active.length > 0)`:

```js
      const parked = loadParked();
      const fresh = parked.filter(function (p) {
        return typeof p.parkedAt === 'number' && nowMs - p.parkedAt <= PARKED_MAX_AGE_MS;
      });
      if (fresh.length !== parked.length) saveParked(fresh);
```

Add `setKeyPolicy: setKeyPolicy, takeParked: takeParked,` to the returned object. In the browser wiring, add
`keyPolicies: DEFAULT_KEY_POLICIES,` to the `createSaveRetry({ … })` deps (`:362-371`), which run before the
auto-process block schedules `processQueue` (`:373-378`). `module.exports` becomes `{ createSaveRetry:
createSaveRetry, DEFAULT_KEY_POLICIES: DEFAULT_KEY_POLICIES }`.

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `npx vitest run server/__tests__/saveRetryQueue.test.js`, then `npx vitest run
server/__tests__/clientMessageContracts.test.js`, then `npx vitest run server/__tests__/clientJsSyntax.test.js`
Expected: PASS, every test in each file. Then `npx eslint server/public/js/saveRetry.js
server/__tests__/saveRetryQueue.test.js` and `npx prettier --check server/public/js/saveRetry.js
server/__tests__/saveRetryQueue.test.js`: no problems.

- [ ] **Step 5: Commit**

```bash
git add server/public/js/saveRetry.js server/__tests__/saveRetryQueue.test.js
git commit -m "feat(saveRetry): refusal code on errors; replays of seg:/acc: marked; refusals to a replay parked"
```

---

### Task 8: `segment-save-state.js` — row values, request bodies, drafts and kept texts, as DOM-free rules

Spec: §5.18 (rows 1–6), §5.10 (item types, sources, whole-text items), §5.3 (no hashing in the browser), §5.7 (R4),
index decisions 12 and 4, T23 (its pure half: a legacy draft gets `{legacy: true}`; a draft keeps its base and its
assists; a restore re-installs the assists before `draft-restore`).

**Files:**
- Create: `server/public/js/segment-save-state.js` (global `segmentSaveState`; `module.exports` for tests).
- Modify: `server/views/segment-editor.html` — a `<script src="/js/segment-save-state.js"></script>` tag after
  `figure-drafts.js` (`:2042`) and before `segment-editor.js` (`:2045`).
- Test: create `server/__tests__/segmentSaveState.test.js`.

**Interfaces:**
- Consumes: nothing (no DOM, no globals).
- Produces (all on `segmentSaveState`):
  - `KEEP_TEXT_CODES: string[]`, `NOTICE_CODES: string[]` (`KEEP_TEXT_CODES` plus `'REFUSED'`), `DRAFT_VERSION = 2`,
    `BODY_LIMIT_BYTES = 1048576` (`express.json`'s `'1mb'`), `BODY_HEADROOM_BYTES = 16384`.
  - `rowDataAttributes(seg, displayedEdit, baseEditId)` → `{[attr]: string}` (unescaped values; keys
    `data-segment-id`, `data-is`, `data-base-edit-id`, and when valid `data-base-sha256`, `data-occurrence`,
    `data-displayed-edit-id`, `data-displayed-edit-sha256`).
  - `rowDataAttributeHtml(attrs, escape)` → `string` (leading space per attribute).
  - `readRowValues(el)` → `{segmentId, is, baseSha256, occurrence, displayedEditId, displayedEditSha256,
    baseEditId} | null` for anything with `getAttribute`.
  - `buildSaveBody({segmentId, row, editedContent, category, editorNote, assists, clientActionId,
    clientActionTime})`, `buildAcceptBody({segmentId, row, acceptOrigin, clientActionId, clientActionTime})`.
  - `assistItem(itemType, source, clientTimeMs, detail)` (throws `TypeError` on an unknown type or source),
    `boundAssists(items, maxBytes?)` (UTF-8 bytes of the list's JSON; called only by `buildSaveBody`, decision 36).
  - `draftEntry(e)` (never bounds its assists), `buildDraftValue(entries, now)`, `parseDraftValue(value)` →
    `{legacy, entries} | null`, `mergeDraftValues(values)` → `{legacy, entries} | null` (every draft under a module's
    prefix; the newest wins, older kept entries carried over), `draftRestoreItem(entry, now)`,
    `restoredAssists(entry, now)`.
  - `keepsText(code)`, `refusedEntry({text, row, assists, code})`, `entryFromParked(item)` → `{segmentId, entry} |
    null`, `mergeRestoreSources(fromDraft, parked)`, `noticeFor(entry, rowBaseSha256)` → a `NOTICE_CODES` member or
    `null`.
  - `echoAttributeUpdates(result, currentBaseEditId)` → `Array<[attr, string|null]>`.
  - `newClientActionId(cryptoObj)` → `string`.

- [ ] **Step 1: Write the failing test**

Create `server/__tests__/segmentSaveState.test.js`:

```js
/**
 * G1.1 client rules (spec §5.18, §5.10; T23's pure half), tested without a DOM.
 *
 * The DOM plumbing lives in segment-editor.js and is exercised by
 * server/e2e/served-base-client.spec.js. What lives here decides VALUES. E2E is
 * a separate CI job that `npm test` does not run, so a rule gated only there is
 * gated by nothing the authoritative suite sees (the figure-drafts precedent).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'module';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const S = require('../public/js/segment-save-state');
const serverDir = join(dirname(fileURLToPath(import.meta.url)), '..');

const H1 = 'a'.repeat(64);
const H2 = 'b'.repeat(64);
const H3 = 'c'.repeat(64);

/** The page's escapeHtml (htmlUtils.js), copied: that file wraps fetch at load. */
const esc = (t) =>
  String(t)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
const unesc = (t) =>
  t
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');

/** What a browser hands back from serialized attributes: each value decoded. */
function elementFrom(html) {
  const attrs = {};
  for (const m of html.matchAll(/ ([a-z0-9-]+)="([^"]*)"/g)) attrs[m[1]] = unesc(m[2]);
  return { getAttribute: (n) => (n in attrs ? attrs[n] : null) };
}

const SEG = { segmentId: 'm1:para:fs-1', is: 'Hún sagði "já"\r\nog \'nei\' <b>', baseSha256: H1, occurrence: 0 };

describe('row data attributes (§5.18): what the row renders is what the save reads', () => {
  it('reads back exactly what the row rendered, quote, apostrophe, newline and CR included', () => {
    const html = S.rowDataAttributeHtml(S.rowDataAttributes(SEG, { id: 7, contentSha256: H2 }, 9), esc);
    expect(html).not.toMatch(/[\r\n]/); // a raw CR would reach the reader as LF (HTML attribute parsing)
    expect(S.readRowValues(elementFrom(html))).toEqual({
      segmentId: 'm1:para:fs-1',
      is: SEG.is,
      baseSha256: H1,
      occurrence: 0,
      displayedEditId: 7,
      displayedEditSha256: H2,
      baseEditId: 9,
    });
  });

  it('control: a row showing the base reads a null displayed pair', () => {
    const html = S.rowDataAttributeHtml(S.rowDataAttributes(SEG, null, 0), esc);
    const row = S.readRowValues(elementFrom(html));
    expect([row.displayedEditId, row.displayedEditSha256, row.baseEditId]).toEqual([null, null, 0]);
  });

  it('a row served without a base (duplicated id, organic, no layer) renders no hash and reads null', () => {
    const noBase = { ...SEG };
    delete noBase.baseSha256;
    const attrs = S.rowDataAttributes(noBase, null, 0);
    expect('data-base-sha256' in attrs).toBe(false);
    expect(S.readRowValues(elementFrom(S.rowDataAttributeHtml(attrs, esc))).baseSha256).toBeNull();
    // Control: the same segment with its hash renders it.
    expect(S.rowDataAttributes(SEG, null, 0)['data-base-sha256']).toBe(H1);
  });

  it('a malformed hash is not rendered', () => {
    expect('data-base-sha256' in S.rowDataAttributes({ ...SEG, baseSha256: 'ABC' }, null, 0)).toBe(false);
  });

  it('readRowValues of no element is null', () => {
    expect(S.readRowValues(null)).toBeNull();
  });
});

describe('request bodies (§5.6, §5.18)', () => {
  const row = { segmentId: 's1', is: 'grunnur', baseSha256: H1, occurrence: 0, displayedEditId: 7, displayedEditSha256: H2, baseEditId: 9 };
  const wire = (b) => JSON.parse(JSON.stringify(b));

  it('the save body echoes the row, not a second copy of its values', () => {
    const assists = [S.assistItem('markup-wrap', 'toolbar', 5, { marker: '**' })];
    const body = wire(
      S.buildSaveBody({ segmentId: 's1', row, editedContent: 'nýtt', category: '', editorNote: '', assists, clientActionId: 'act-1', clientActionTime: 42 })
    );
    expect(body).toEqual({
      segmentId: 's1',
      originalContent: 'grunnur',
      editedContent: 'nýtt',
      baseEditId: 9,
      baseSha256: H1,
      displayedEditId: 7,
      displayedEditSha256: H2,
      clientActionId: 'act-1',
      clientActionTime: 42,
      assists: [{ itemType: 'markup-wrap', source: 'toolbar', clientTimeMs: 5, detail: { marker: '**' } }],
    });
    expect('occurrence' in body).toBe(false); // not sent until G1.12 (b)
    expect('replayed' in body).toBe(false); // saveRetry adds it to a replay only
  });

  it('a row with no hash sends no baseSha256 key, so the server answers by its own order', () => {
    expect('baseSha256' in wire(S.buildSaveBody({ segmentId: 's1', row: { ...row, baseSha256: null }, editedContent: 'x', assists: [] }))).toBe(false);
  });

  it('the accept body attests the row\'s text; any origin but the keyboard stream is single', () => {
    const base = { segmentId: 's1', row, clientActionId: 'a', clientActionTime: 1 };
    expect(S.buildAcceptBody({ ...base, acceptOrigin: 'keyboard-stream' })).toEqual({
      segmentId: 's1',
      acceptedContent: 'grunnur',
      acceptOrigin: 'keyboard-stream',
      clientActionId: 'a',
      clientActionTime: 1,
    });
    expect(S.buildAcceptBody({ ...base, acceptOrigin: undefined }).acceptOrigin).toBe('single');
  });

  // Decision 36 (needs [USER]'s yes): only the SENT body is bounded, and only where it would otherwise answer 413.
  const longText = 'ð'.repeat(10_000); // 20,000 UTF-8 bytes: the edit route's per-text cap, in two-byte letters
  const manyInserts = Array.from({ length: 60 }, (_, i) =>
    S.assistItem('repetition-insert', 'tm', i, { text: longText, book: 'b', chapter: 1, moduleId: 'm' })
  );

  it('the sent body stays under express.json\'s limit, keeps every item and the newest whole text', () => {
    const body = S.buildSaveBody({ segmentId: 's1', row, editedContent: longText, assists: manyInserts, clientActionId: 'a', clientActionTime: 1 });
    expect(Buffer.byteLength(JSON.stringify(body), 'utf8')).toBeLessThanOrEqual(S.BODY_LIMIT_BYTES - S.BODY_HEADROOM_BYTES);
    expect(body.assists.map((a) => a.clientTimeMs)).toEqual(manyInserts.map((a) => a.clientTimeMs)); // every item
    expect(body.assists.at(-1).detail.text).toBe(longText); // never the newest
    expect(body.assists[0].detail).toEqual({ book: 'b', chapter: 1, moduleId: 'm', textLength: 10_000, textDropped: true });
    // Control: a list that fits is sent exactly as given.
    const few = manyInserts.slice(0, 3);
    expect(wire(S.buildSaveBody({ segmentId: 's1', row, editedContent: 'x', assists: few })).assists).toEqual(wire(few));
  });

  it('a draft keeps every whole text, however long the list (§5.10, §14 call 18)', () => {
    expect(S.draftEntry({ text: 't', assists: manyInserts }).assists).toEqual(manyInserts);
    const round = S.parseDraftValue(S.buildDraftValue({ s1: { text: 't', assists: manyInserts } }, 1));
    expect(round.entries.s1.assists.map((a) => a.detail.text)).toEqual(manyInserts.map(() => longText));
    // Control: the same list in a save body does lose its oldest texts (the case above), so this one can fail.
    expect(S.buildSaveBody({ segmentId: 's1', row, editedContent: 't', assists: manyInserts }).assists[0].detail.textDropped).toBe(true);
  });
});

describe('assist items (§5.10)', () => {
  it('builds each client item type from its own sources, and refuses another', () => {
    expect(S.assistItem('term-insert', 'termbase', 3, { term: 'hugtak' })).toEqual({ itemType: 'term-insert', source: 'termbase', clientTimeMs: 3, detail: { term: 'hugtak' } });
    expect(() => S.assistItem('term-insert', 'toolbar', 3, {})).toThrow(TypeError);
    expect(() => S.assistItem('ai-suggestion', 'ai', 3, {})).toThrow(TypeError); // arrives with G1.23
  });

  it('boundAssists keeps every item and drops the oldest whole texts first, never the newest', () => {
    const big = 'x'.repeat(60);
    const items = [
      S.assistItem('repetition-insert', 'tm', 1, { text: big, book: 'b', chapter: 1, moduleId: 'm' }),
      S.assistItem('markup-wrap', 'toolbar', 2, { marker: '**' }),
      S.assistItem('repetition-insert', 'tm', 3, { text: big, book: 'b', chapter: 1, moduleId: 'm' }),
    ];
    const out = S.boundAssists(items, 250);
    expect(out.map((i) => i.itemType)).toEqual(['repetition-insert', 'markup-wrap', 'repetition-insert']);
    expect(out[0].detail).toEqual({ book: 'b', chapter: 1, moduleId: 'm', textLength: 60, textDropped: true });
    expect(out[2].detail.text).toBe(big);
    expect(items[0].detail.text).toBe(big); // the caller's list is not changed
    // Control: under the limit nothing is dropped.
    expect(S.boundAssists(items, 10_000)).toEqual(items);
  });

  it('boundAssists counts UTF-8 bytes, which is what express.json\'s limit counts, not characters', () => {
    const items = [
      S.assistItem('repetition-insert', 'tm', 1, { text: 'ð'.repeat(100), book: 'b', chapter: 1, moduleId: 'm' }),
      S.assistItem('repetition-insert', 'tm', 2, { text: 'x', book: 'b', chapter: 1, moduleId: 'm' }),
    ];
    const chars = JSON.stringify(items).length;
    const bytes = Buffer.byteLength(JSON.stringify(items), 'utf8');
    expect(bytes - chars).toBe(100); // 'ð' is two bytes
    // A budget between the two: a character count would keep the old text; the byte count drops it.
    expect(S.boundAssists(items, chars + 50)[0].detail.textDropped).toBe(true);
    // Control: a budget of the byte length keeps everything.
    expect(S.boundAssists(items, bytes)).toEqual(items);
  });
});

describe('drafts (§5.18)', () => {
  const wrap = S.assistItem('markup-wrap', 'toolbar', 5, { marker: '**' });

  it('writes version 2, with the ts tabGuard reads, and a drafts mirror a pre-deploy page reads', () => {
    const value = S.buildDraftValue({ s1: { text: 'texti', baseSha256: H1, occurrence: 0, assists: [wrap] } }, 1000);
    expect(value).toEqual({
      v: 2,
      ts: 1000,
      segments: { s1: { text: 'texti', baseSha256: H1, occurrence: 0, assists: [wrap], refused: null } },
      drafts: { s1: 'texti' },
    });
    expect(S.parseDraftValue(JSON.parse(JSON.stringify(value)))).toEqual({ legacy: false, entries: value.segments });
  });

  it('reads today\'s {ts, drafts} as legacy entries with no base', () => {
    expect(S.parseDraftValue({ ts: 1, drafts: { s1: 'gamalt' } })).toEqual({
      legacy: true,
      entries: { s1: { text: 'gamalt', baseSha256: null, occurrence: null, assists: [], refused: null, legacy: true } },
    });
  });

  it('reads neither an unknown version nor a shapeless value', () => {
    expect(S.parseDraftValue({ v: 3, ts: 1, segments: {} })).toBeNull();
    expect(S.parseDraftValue({ ts: 1 })).toBeNull();
    expect(S.parseDraftValue('texti')).toBeNull();
  });

  it('a restore re-installs the assists, then adds draft-restore with the text it put in place', () => {
    const entry = S.draftEntry({ text: 'texti', baseSha256: H1, occurrence: 0, assists: [wrap] });
    expect(S.restoredAssists(entry, 7000)).toEqual([
      wrap,
      { itemType: 'draft-restore', source: null, clientTimeMs: 7000, detail: { text: 'texti' } },
    ]);
  });

  it('a legacy restore is unverified and says so; a version-2 restore makes no claim', () => {
    const legacy = S.parseDraftValue({ ts: 1, drafts: { s1: 'gamalt' } }).entries.s1;
    expect(S.draftRestoreItem(legacy, 9)).toEqual({ itemType: 'draft-restore', source: null, clientTimeMs: 9, claim: 'unverified', detail: { legacy: true, text: 'gamalt' } });
    expect('claim' in S.draftRestoreItem(S.draftEntry({ text: 'nýtt' }), 9)).toBe(false);
  });

  it('mergeDraftValues: the newest draft wins, and a kept text in an older draft is not lost (Review Focus 24)', () => {
    const kept = { text: 'kept', baseSha256: H1, occurrence: 0, assists: [wrap], refused: 'STALE_BASE' };
    const older = S.buildDraftValue({ s1: kept, s2: { text: 'old typing', baseSha256: H1, occurrence: 0, assists: [] } }, 1000);
    const newer = S.buildDraftValue({ s3: { text: 'other tab', baseSha256: H2, occurrence: 0, assists: [] } }, 2000);
    const merged = S.mergeDraftValues([older, newer]); // storage order is not time order
    expect(Object.keys(merged.entries).sort()).toEqual(['s1', 's3']);
    expect(merged.entries.s1).toEqual(S.draftEntry(kept));
    expect(merged.entries.s3).toEqual(S.draftEntry({ text: 'other tab', baseSha256: H2, occurrence: 0, assists: [] }));
    // Control: an older UNREFUSED text is not carried; the newest draft holds the typing, as today's restore reads it.
    expect(merged.entries.s2).toBeUndefined();
    // The newest draft's own text for a kept segment wins, and keeps the older refusal (as mergeRestoreSources does).
    const both = S.mergeDraftValues([older, S.buildDraftValue({ s1: { text: 'newer', baseSha256: H2, occurrence: 0, assists: [] } }, 3000)]);
    expect(both.entries.s1).toEqual({ ...S.draftEntry({ text: 'newer', baseSha256: H2, occurrence: 0, assists: [] }), refused: 'STALE_BASE' });
    expect(S.mergeDraftValues([])).toBeNull();
    expect(S.mergeDraftValues([{ ts: 5 }, 'texti', null])).toBeNull(); // nothing parseable
  });
});

describe('kept texts (index decision 12)', () => {
  const row = { is: 'grunnur', baseSha256: H1, occurrence: 0 };
  const ALL = ['STALE_BASE', 'STALE_DISPLAYED', 'BASE_MISSING', 'DUPLICATE_ID', 'BOOK_NOT_MINTED', 'NO_LAYER', 'conflict', 'STALE_CONTENT', 'EDIT_EXISTS', undefined];

  it('keeps the text for exactly the refusal codes, not for a live conflict', () => {
    expect(ALL.filter((c) => S.keepsText(c))).toEqual(['STALE_BASE', 'STALE_DISPLAYED', 'BASE_MISSING', 'DUPLICATE_ID', 'BOOK_NOT_MINTED', 'NO_LAYER']);
  });

  it('a refused entry holds the base the save was sent with, its occurrence, its assists and the code', () => {
    const assists = [S.assistItem('markup-wrap', 'keyboard', 1, { marker: '*' })];
    const e = S.refusedEntry({ text: 'typed', row, assists, code: 'STALE_BASE' });
    expect(e).toEqual({ text: 'typed', baseSha256: H1, occurrence: 0, assists, refused: 'STALE_BASE' });
    expect(e.assists).not.toBe(assists);
  });

  it('turns a parked replay into an entry; a pre-deploy body has no base; an accept body is none', () => {
    const body = (b) => ({ key: 'seg:b/1/m:s1', body: JSON.stringify(b), status: 409, code: 'BASE_MISSING' });
    expect(S.entryFromParked(body({ segmentId: 's1', editedContent: 'typed' }))).toEqual({
      segmentId: 's1',
      entry: { text: 'typed', baseSha256: null, occurrence: null, assists: [], refused: 'BASE_MISSING' },
    });
    expect(S.entryFromParked(body({ segmentId: 's1', acceptedContent: 'x' }))).toBeNull();
    expect(S.entryFromParked({ key: 'k', body: '{not json', code: 'conflict' })).toBeNull();
  });

  it('a draft entry wins over a parked one for the same segment, and keeps the parked refusal', () => {
    const fromDraft = { legacy: false, entries: { s1: S.draftEntry({ text: 'newer', baseSha256: H2 }) } };
    const parked = [
      { key: 'seg:b/1/m:s1', body: JSON.stringify({ segmentId: 's1', editedContent: 'older', baseSha256: H1 }), code: 'conflict' },
      { key: 'seg:b/1/m:s2', body: JSON.stringify({ segmentId: 's2', editedContent: 'other' }), code: 'STALE_BASE' },
    ];
    const out = S.mergeRestoreSources(fromDraft, parked);
    expect(out.s1).toEqual({ text: 'newer', baseSha256: H2, occurrence: null, assists: [], refused: 'conflict' });
    expect(out.s2.text).toBe('other');
  });

  it('chooses the notice by code when refused, else by comparing bases; a legacy draft gets none', () => {
    const e = (over) => S.draftEntry({ text: 't', baseSha256: H1, ...over });
    expect(S.noticeFor(e({}), H2)).toBe('STALE_BASE');
    expect(S.noticeFor(e({}), H1)).toBeNull(); // control: same base, no notice
    expect(S.noticeFor(e({ refused: 'DUPLICATE_ID' }), H1)).toBe('DUPLICATE_ID');
    expect(S.noticeFor(e({ refused: 'conflict' }), H1)).toBe('REFUSED');
    expect(S.noticeFor(S.parseDraftValue({ ts: 1, drafts: { s: 't' } }).entries.s, H2)).toBeNull();
  });
});

describe('the save response\'s echo, kept on the row (G1.21, §5.18)', () => {
  // The save route's response fields (Task 14; plan decision 15). A rename changes this file and the module, nowhere else.
  it('an in-flight save sets the base, the displayed pair and the conflict token', () => {
    expect(S.echoAttributeUpdates({ editId: 12, baseSha256: H1, displayedEditId: 12, displayedEditSha256: H3 }, 9)).toEqual([
      ['data-base-sha256', H1],
      ['data-displayed-edit-id', '12'],
      ['data-displayed-edit-sha256', H3],
      ['data-base-edit-id', '12'],
    ]);
  });

  it('a withdraw clears the displayed pair', () => {
    expect(S.echoAttributeUpdates({ baseSha256: H1, displayedEditId: null, displayedEditSha256: null }, 9)).toEqual([
      ['data-base-sha256', H1],
      ['data-displayed-edit-id', null],
      ['data-displayed-edit-sha256', null],
    ]);
  });

  it('control: a response without the fields (today\'s) changes nothing', () => {
    expect(S.echoAttributeUpdates({ success: true, updated: false }, 9)).toEqual([]);
  });
});

describe('client action ids (§5.9)', () => {
  it('uses randomUUID where it exists, else a random string', () => {
    expect(S.newClientActionId({ randomUUID: () => 'uuid-1' })).toBe('uuid-1');
    const a = S.newClientActionId(undefined);
    expect(a).toMatch(/^[a-z0-9-]{12,}$/);
    expect(S.newClientActionId(undefined)).not.toBe(a);
  });
});

describe('the editor page loads the module before segment-editor.js', () => {
  it('has the script tag, in order', () => {
    const html = readFileSync(join(serverDir, 'views', 'segment-editor.html'), 'utf-8');
    const mod = html.indexOf('<script src="/js/segment-save-state.js"></script>');
    expect(mod).toBeGreaterThan(-1);
    expect(mod).toBeLessThan(html.indexOf('<script src="/js/segment-editor.js"></script>'));
  });
});

/**
 * tabGuard keys its newest-draft lookup and its 7-day sweep on `ts`. This runs
 * the REAL tabGuard over REAL values built by buildDraftValue and asserts the
 * CONSEQUENCE (the figureDrafts.test.js idiom), with a fresh value as control.
 */
describe('tabGuard reads and sweeps a version-2 segment draft', () => {
  let store;
  const saved = {};
  beforeEach(() => {
    store = new Map();
    const localStorage = {
      get length() {
        return store.size;
      },
      key: (i) => [...store.keys()][i] ?? null,
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: (k) => store.delete(k),
    };
    for (const [name, value] of [
      ['localStorage', localStorage],
      ['window', { addEventListener() {} }],
      ['document', { addEventListener() {} }],
      ['BroadcastChannel', undefined],
    ]) {
      saved[name] = globalThis[name];
      globalThis[name] = value;
    }
  });
  afterEach(() => {
    for (const name of Object.keys(saved)) globalThis[name] = saved[name];
    delete require.cache[require.resolve('../public/js/tabGuard')];
  });

  it('sweeps a stale one, keeps a fresh one, and finds the newest', () => {
    const prefix = 'seg-draft:bok/3/m1:';
    const EIGHT_DAYS = 8 * 24 * 60 * 60 * 1000;
    store.set(prefix + 'old', JSON.stringify(S.buildDraftValue({ s1: { text: 'gamalt' } }, Date.now() - EIGHT_DAYS)));
    store.set(prefix + 'legacy', JSON.stringify({ ts: Date.now() - 1000, drafts: { s1: 'eldra' } }));
    store.set(prefix + 'new', JSON.stringify(S.buildDraftValue({ s1: { text: 'nýtt' } }, Date.now())));
    delete require.cache[require.resolve('../public/js/tabGuard')];
    require('../public/js/tabGuard'); // runs cleanupStaleDrafts() on load
    expect(store.has(prefix + 'old')).toBe(false);
    expect(store.has(prefix + 'new')).toBe(true);
    const found = globalThis.window.tabGuard.findNewestDraft(prefix);
    expect(found.key).toBe(prefix + 'new');
    expect(S.parseDraftValue(found.data).entries.s1.text).toBe('nýtt');
  });
});
```

(Not `const { baseSha256: _drop, ...noBase } = SEG;`: `eslint.config.js:40` sets only `argsIgnorePattern: '^_'`, which
covers arguments, not variables, and sets no `ignoreRestSiblings`, so an unused destructured `_drop` fails `npm run
lint`.)

- [ ] **Step 2: Run the test and confirm it fails**

Run: `npx vitest run server/__tests__/segmentSaveState.test.js`
Expected: FAIL — `Cannot find module '../public/js/segment-save-state'` (the file does not exist at `ed10180c`).

- [ ] **Step 3: Implement**

Create `server/public/js/segment-save-state.js`:

```js
/**
 * segment-save-state.js — what a segment row carries for a save, what a draft
 * holds, and what a refused save keeps (G1.1, spec §5.18).
 *
 * 🔴 WHY A SEPARATE FILE. segment-editor.js touches the DOM at load and cannot
 * be required, and no DOM test environment exists, so the rules that decide
 * VALUES live here, where `npm test` can execute them. The DOM plumbing stays in
 * segment-editor.js and is exercised in the browser by
 * server/e2e/served-base-client.spec.js. Dual-loadable (browser global +
 * CommonJS), the idiom of figure-drafts.js and accept-eligibility.js.
 *
 * 🔴 NO HASHING HERE, OR ANYWHERE IN THE BROWSER (§5.3, §5.18). The client only
 * echoes the hashes the server sent; a second hash would be a second mechanism.
 */
(function (root) {
  'use strict';

  const SHA256_HEX = /^[0-9a-f]{64}$/;
  const DRAFT_VERSION = 2;

  /**
   * Refusal codes whose typed text moves into the draft (index decision 12).
   * 'NO_LAYER' is servedEdit.js's code for "the module has no layer" (spec
   * §5.6 step 2 names none; plan decision 5); keep the two in step.
   */
  const KEEP_TEXT_CODES = [
    'STALE_BASE',
    'STALE_DISPLAYED',
    'BASE_MISSING',
    'DUPLICATE_ID',
    'BOOK_NOT_MINTED',
    'NO_LAYER',
  ];
  /** What a restored pane can say; any other refusal reads as 'REFUSED'. */
  const NOTICE_CODES = KEEP_TEXT_CODES.concat(['REFUSED']);

  /** Item types the client claims (§5.10), and the sources each may name. */
  const ITEM_SOURCES = {
    'repetition-insert': ['tm'],
    'term-insert': ['termbase'],
    'markup-wrap': ['toolbar', 'keyboard'],
  };

  /** express.json({ limit: '1mb' }) (server/index.js:206) counts BYTES; '1mb' is 1,048,576. */
  const BODY_LIMIT_BYTES = 1048576;
  /** Room for what the measurement cannot see (headers are not counted; this is margin, not a calculation). */
  const BODY_HEADROOM_BYTES = 16384;

  /** UTF-8 length: JSON.stringify leaves Icelandic letters unescaped, two bytes each on the wire. */
  function utf8Length(s) {
    if (typeof TextEncoder === 'function') return new TextEncoder().encode(s).length;
    return s.length * 3; // no TextEncoder: assume the worst case
  }

  function isSha256(v) {
    return typeof v === 'string' && SHA256_HEX.test(v);
  }
  function intOrNull(v) {
    return Number.isInteger(v) && v >= 0 ? v : null;
  }
  function intAttr(raw) {
    return raw != null && /^\d+$/.test(raw) ? Number(raw) : null;
  }

  // ── The row (§5.18 row 1) ───────────────────────────────────────

  /**
   * The values a save or an accept must echo, as the row renders them.
   * `displayedEdit` is the in-flight edit the row shows, or null (the caller
   * decides with acceptEligibility.isEditInFlight: one rule, not two).
   * `is` is JSON-encoded: the HTML parser turns CR into LF inside an attribute.
   */
  function rowDataAttributes(seg, displayedEdit, baseEditId) {
    const attrs = {
      'data-segment-id': String(seg.segmentId),
      'data-is': JSON.stringify(typeof seg.is === 'string' ? seg.is : ''),
      'data-base-edit-id': String(intOrNull(baseEditId) || 0),
    };
    if (isSha256(seg.baseSha256)) attrs['data-base-sha256'] = seg.baseSha256;
    if (intOrNull(seg.occurrence) !== null) attrs['data-occurrence'] = String(seg.occurrence);
    if (displayedEdit && intOrNull(displayedEdit.id) !== null) {
      attrs['data-displayed-edit-id'] = String(displayedEdit.id);
      if (isSha256(displayedEdit.contentSha256)) {
        attrs['data-displayed-edit-sha256'] = displayedEdit.contentSha256;
      }
    }
    return attrs;
  }

  function rowDataAttributeHtml(attrs, escape) {
    return Object.keys(attrs)
      .map(function (k) {
        return ' ' + k + '="' + escape(attrs[k]) + '"';
      })
      .join('');
  }

  /** Read back what rowDataAttributes wrote, from anything with getAttribute. */
  function readRowValues(el) {
    if (!el || typeof el.getAttribute !== 'function') return null;
    const get = function (n) {
      return el.getAttribute(n);
    };
    let is = null;
    try {
      const raw = get('data-is');
      is = raw == null ? null : JSON.parse(raw);
    } catch {
      is = null; // not ours: read as nothing shown
    }
    const displayedEditId = intAttr(get('data-displayed-edit-id'));
    const displayedSha = get('data-displayed-edit-sha256');
    return {
      segmentId: get('data-segment-id'),
      is: typeof is === 'string' ? is : null,
      baseSha256: isSha256(get('data-base-sha256')) ? get('data-base-sha256') : null,
      occurrence: intAttr(get('data-occurrence')),
      displayedEditId: displayedEditId,
      displayedEditSha256: displayedEditId !== null && isSha256(displayedSha) ? displayedSha : null,
      baseEditId: intAttr(get('data-base-edit-id')) || 0,
    };
  }

  // ── Bodies (§5.6, §5.18 rows 2, 7, 8) ───────────────────────────

  function buildSaveBody(i) {
    const row = i.row || {};
    const displayedEditId = intOrNull(row.displayedEditId);
    const body = {
      segmentId: i.segmentId,
      originalContent: typeof row.is === 'string' ? row.is : '', // ignored by the server (§5.6 step 6)
      editedContent: i.editedContent,
      category: i.category || undefined,
      editorNote: i.editorNote || undefined,
      baseEditId: intOrNull(row.baseEditId) || 0,
      displayedEditId: displayedEditId,
      displayedEditSha256:
        displayedEditId !== null && isSha256(row.displayedEditSha256) ? row.displayedEditSha256 : null,
      clientActionId: i.clientActionId,
      clientActionTime: i.clientActionTime,
      assists: [],
    };
    // Absent, not null: the server's order (§5.6 steps 1-4) decides the code.
    if (isSha256(row.baseSha256)) body.baseSha256 = row.baseSha256;
    // Decision 36: the assists get what is left of the limit, so the bound fires only where a 413 would.
    const rest = utf8Length(JSON.stringify(body));
    body.assists = boundAssists(
      Array.isArray(i.assists) ? i.assists : [],
      BODY_LIMIT_BYTES - BODY_HEADROOM_BYTES - rest
    );
    return body;
  }

  function buildAcceptBody(i) {
    return {
      segmentId: i.segmentId,
      acceptedContent: i.row && typeof i.row.is === 'string' ? i.row.is : '',
      acceptOrigin: i.acceptOrigin === 'keyboard-stream' ? 'keyboard-stream' : 'single',
      clientActionId: i.clientActionId,
      clientActionTime: i.clientActionTime,
    };
  }

  // ── Assists (§5.10) ─────────────────────────────────────────────

  function assistItem(itemType, source, clientTimeMs, detail) {
    const sources = ITEM_SOURCES[itemType];
    if (!sources || sources.indexOf(source) === -1) {
      throw new TypeError('assistItem: no ' + itemType + ' from ' + source);
    }
    return { itemType: itemType, source: source, clientTimeMs: clientTimeMs, detail: detail || {} };
  }

  /**
   * For the SENT body only (decision 36; drafts never call it). Every item kept; past the budget, in UTF-8 bytes
   * of the list's JSON, the OLDEST whole texts lose their text first, never the newest.
   */
  function boundAssists(items, maxBytes) {
    const limit = typeof maxBytes === 'number' ? maxBytes : BODY_LIMIT_BYTES - BODY_HEADROOM_BYTES;
    const out = items.map(function (it) {
      return Object.assign({}, it, { detail: it.detail ? Object.assign({}, it.detail) : it.detail });
    });
    let lastWhole = -1;
    for (let i = out.length - 1; i >= 0; i--) {
      if (out[i].detail && typeof out[i].detail.text === 'string') {
        lastWhole = i;
        break;
      }
    }
    for (let i = 0; i < out.length && utf8Length(JSON.stringify(out)) > limit; i++) {
      const d = out[i].detail;
      if (i === lastWhole || !d || typeof d.text !== 'string') continue;
      d.textLength = d.text.length;
      d.textDropped = true;
      delete d.text;
    }
    return out;
  }

  // ── Drafts (§5.18 rows 3, 4) ────────────────────────────────────

  function draftEntry(e) {
    const src = e || {};
    return {
      text: typeof src.text === 'string' ? src.text : '',
      baseSha256: isSha256(src.baseSha256) ? src.baseSha256 : null,
      occurrence: intOrNull(src.occurrence),
      assists: Array.isArray(src.assists) ? src.assists.slice() : [], // every text kept (§5.10, §14 call 18)
      refused: typeof src.refused === 'string' && src.refused ? src.refused : null,
    };
  }

  /**
   * `ts`: tabGuard keys its lookup and its sweep on it. `drafts`: the texts
   * again, for a page loaded before this deploy, whose restoreDraft reads
   * `.drafts` and, finding none, clears every draft of the module.
   */
  function buildDraftValue(entries, now) {
    const segments = {};
    const drafts = {};
    Object.keys(entries).forEach(function (id) {
      segments[id] = draftEntry(entries[id]);
      drafts[id] = segments[id].text;
    });
    return { v: DRAFT_VERSION, ts: now, segments: segments, drafts: drafts };
  }

  function parseDraftValue(value) {
    if (!value || typeof value !== 'object') return null;
    const entries = {};
    if (value.v === DRAFT_VERSION && value.segments && typeof value.segments === 'object') {
      Object.keys(value.segments).forEach(function (id) {
        entries[id] = draftEntry(value.segments[id]);
      });
      return { legacy: false, entries: entries };
    }
    if (value.v === undefined && value.drafts && typeof value.drafts === 'object') {
      Object.keys(value.drafts).forEach(function (id) {
        if (typeof value.drafts[id] !== 'string') return;
        entries[id] = Object.assign(draftEntry({ text: value.drafts[id] }), { legacy: true });
      });
      return { legacy: true, entries: entries };
    }
    return null;
  }

  /**
   * Every draft found under the module's prefix, in any order (plan decision 31). tabGuard.findNewestDraft returns
   * one and the restore clears them all, so a kept text in an older tab's key would vanish. The newest by `ts`
   * wins per segment; a kept (refused) entry in an older draft is carried over, or keeps its code on the newer text.
   */
  function mergeDraftValues(values) {
    const parsed = (values || [])
      .filter(function (v) {
        return v && typeof v === 'object' && typeof v.ts === 'number';
      })
      .sort(function (a, b) {
        return b.ts - a.ts;
      })
      .map(function (v) {
        return parseDraftValue(v);
      })
      .filter(Boolean);
    if (parsed.length === 0) return null;
    const out = { legacy: parsed[0].legacy, entries: Object.assign({}, parsed[0].entries) };
    parsed.slice(1).forEach(function (older) {
      Object.keys(older.entries).forEach(function (id) {
        const e = older.entries[id];
        if (!e.refused) return;
        if (!out.entries[id]) out.entries[id] = e;
        else if (!out.entries[id].refused) {
          out.entries[id] = Object.assign({}, out.entries[id], { refused: e.refused });
        }
      });
    });
    return out;
  }

  function draftRestoreItem(entry, now) {
    const item = { itemType: 'draft-restore', source: null, clientTimeMs: now, detail: { text: entry.text } };
    if (entry.legacy) {
      item.claim = 'unverified';
      item.detail.legacy = true;
    }
    return item;
  }

  /** A restored draft re-installs its assists BEFORE the draft-restore item (§5.18). */
  function restoredAssists(entry, now) {
    return entry.assists.concat([draftRestoreItem(entry, now)]);
  }

  // ── Kept texts (index decision 12) ──────────────────────────────

  function keepsText(code) {
    return KEEP_TEXT_CODES.indexOf(code) !== -1;
  }

  /** The base recorded is the one the refused save was SENT with: what the server compared. */
  function refusedEntry(i) {
    const row = i.row || {};
    return draftEntry({
      text: i.text,
      baseSha256: row.baseSha256,
      occurrence: row.occurrence,
      assists: i.assists,
      refused: i.code,
    });
  }

  function entryFromParked(item) {
    if (!item || typeof item.body !== 'string') return null;
    let body;
    try {
      body = JSON.parse(item.body);
    } catch {
      return null; // not a segment save
    }
    if (!body || typeof body.segmentId !== 'string' || typeof body.editedContent !== 'string') return null;
    return {
      segmentId: body.segmentId,
      entry: draftEntry({
        text: body.editedContent,
        baseSha256: body.baseSha256,
        occurrence: body.occurrence,
        assists: body.assists,
        refused: typeof item.code === 'string' && item.code ? item.code : 'REFUSED',
      }),
    };
  }

  /** The draft holds the newer typing; a parked refusal still marks it kept. */
  function mergeRestoreSources(fromDraft, parked) {
    const out = {};
    (parked || []).forEach(function (p) {
      const e = entryFromParked(p);
      if (e && !out[e.segmentId]) out[e.segmentId] = e.entry;
    });
    if (fromDraft && fromDraft.entries) {
      Object.keys(fromDraft.entries).forEach(function (id) {
        const d = fromDraft.entries[id];
        out[id] = out[id] && !d.refused ? Object.assign({}, d, { refused: out[id].refused }) : d;
      });
    }
    return out;
  }

  function noticeFor(entry, rowBaseSha256) {
    if (!entry) return null;
    if (entry.refused) return NOTICE_CODES.indexOf(entry.refused) !== -1 ? entry.refused : 'REFUSED';
    if (entry.baseSha256 && isSha256(rowBaseSha256) && entry.baseSha256 !== rowBaseSha256) {
      return 'STALE_BASE';
    }
    return null;
  }

  // ── The save response (G1.21) ───────────────────────────────────

  /**
   * The save route's response fields (Task 14; plan decision 15). If they are
   * ever renamed, change them here and in segmentSaveState.test.js, nowhere else.
   */
  function echoAttributeUpdates(result, currentBaseEditId) {
    const out = [];
    if (!result || typeof result !== 'object') return out;
    const has = function (k) {
      return Object.prototype.hasOwnProperty.call(result, k);
    };
    if (has('baseSha256') && isSha256(result.baseSha256)) out.push(['data-base-sha256', result.baseSha256]);
    if (has('displayedEditId')) {
      const id = intOrNull(result.displayedEditId);
      out.push(['data-displayed-edit-id', id === null ? null : String(id)]);
      out.push([
        'data-displayed-edit-sha256',
        id !== null && isSha256(result.displayedEditSha256) ? result.displayedEditSha256 : null,
      ]);
    }
    if (intOrNull(result.editId) !== null && has('displayedEditId')) {
      out.push(['data-base-edit-id', String(Math.max(intOrNull(currentBaseEditId) || 0, result.editId))]);
    }
    return out;
  }

  function newClientActionId(cryptoObj) {
    if (cryptoObj && typeof cryptoObj.randomUUID === 'function') return cryptoObj.randomUUID();
    return (
      Date.now().toString(36) +
      '-' +
      Math.random().toString(36).slice(2) +
      Math.random().toString(36).slice(2)
    );
  }

  const api = {
    DRAFT_VERSION: DRAFT_VERSION,
    BODY_LIMIT_BYTES: BODY_LIMIT_BYTES,
    BODY_HEADROOM_BYTES: BODY_HEADROOM_BYTES,
    KEEP_TEXT_CODES: KEEP_TEXT_CODES,
    NOTICE_CODES: NOTICE_CODES,
    rowDataAttributes: rowDataAttributes,
    rowDataAttributeHtml: rowDataAttributeHtml,
    readRowValues: readRowValues,
    buildSaveBody: buildSaveBody,
    buildAcceptBody: buildAcceptBody,
    assistItem: assistItem,
    boundAssists: boundAssists,
    draftEntry: draftEntry,
    buildDraftValue: buildDraftValue,
    parseDraftValue: parseDraftValue,
    mergeDraftValues: mergeDraftValues,
    draftRestoreItem: draftRestoreItem,
    restoredAssists: restoredAssists,
    keepsText: keepsText,
    refusedEntry: refusedEntry,
    entryFromParked: entryFromParked,
    mergeRestoreSources: mergeRestoreSources,
    noticeFor: noticeFor,
    echoAttributeUpdates: echoAttributeUpdates,
    newClientActionId: newClientActionId,
  };
  if (typeof root !== 'undefined') root.segmentSaveState = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
```

(The `data-base-edit-id` echo is pushed only with the displayed pair, so a response from today's server, which also
has `editId`, changes nothing: the third `echoAttributeUpdates` test.)

Add to `server/views/segment-editor.html`, after the `figure-drafts.js` tag (`:2042`):

```html
    <!-- Before segment-editor.js: rows, saves, accepts and drafts read it (G1.1). -->
    <script src="/js/segment-save-state.js"></script>
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `npx vitest run server/__tests__/segmentSaveState.test.js`, then `npx vitest run
server/__tests__/clientJsSyntax.test.js` (it parses every file in `server/public/js/`, the new one included), then
`npx vitest run server/__tests__/figureDrafts.test.js` (the other tabGuard consumer)
Expected: PASS, every test in each file. `npx eslint` and `npx prettier --check` on the three touched files: no
problems (run `npx prettier --write` on the two `.js` files first; the code above is wrapped by hand).

- [ ] **Step 5: Commit**

```bash
git add server/public/js/segment-save-state.js server/views/segment-editor.html \
  server/__tests__/segmentSaveState.test.js
git commit -m "feat(segment-editor): segment-save-state — row values, bodies, drafts and kept texts as DOM-free rules"
```

---

### Task 9: rows render what a save and an accept echo, and both read it from the row's DOM

Spec: §5.18 rows 1, 2 (`baseSha256`, `displayedEditId`, `displayedEditSha256`, `clientActionId`, `clientActionTime`),
7 (`acceptOrigin`), 8 (`reviewedEditSha256`); §5.18's "the save response returns the row's `baseSha256` and its
displayed pair" (G1.21, §8); §5.6 (the displayed check, the base echo); index decision 4. **T23**, its "the saved and
accepted values are read from the row's DOM after a declined re-render" half with its positive control ("a save with no
re-render sends the same values"). **T4**, its client parts: the displayed pair is the one the DOM row rendered; after
a declined re-render, an accept on the old row is refused by the value check.

**Lands after Task 6 (the module GET must carry `baseSha256`) and before Task 14, which makes `baseSha256` required
(decision 38).**

**Files:**
- Modify: `server/public/js/segment-editor.js` — new `rowElement`, `rowValues`, `applySaveEcho`,
  `reviewedEditSha256For`; `renderSegmentRow` (the `<tr>` tag, `:1541`, and the accept button's onclick, `:1514`);
  `acceptSegment` (`:1698-1730`), `acceptSegmentAndAdvance` (`:1733-1736`), `acceptAtCursor` (`:1748`); `saveEdit`
  (`:1929-2070`: the three `seg.is` comparisons at `:1942`, `:1951`, `:1960`, the body at `:1986-1995`, the success
  path at `:2045`); `reviewEdit` (`:2148`). No key policy is registered here: Task 7's `DEFAULT_KEY_POLICIES` mark
  `seg:` and `acc:` replays on every page (decision 27).
- Modify: `server/e2e/helpers/segments.js` — the ownership table in the header (`:27-32`) gains a row for the new spec.
- Test: create `server/__tests__/servedBaseClientPins.test.js`; create `server/e2e/served-base-client.spec.js`; modify
  `server/e2e/editor-lifecycle.spec.js` (Test 4, `:152-196`) and `server/e2e/acceptance.spec.js` (`:27-45`, `:47-63`).

**Interfaces:**
- Consumes: `segmentSaveState.rowDataAttributes`, `.rowDataAttributeHtml`, `.readRowValues`, `.buildSaveBody`,
  `.buildAcceptBody`, `.echoAttributeUpdates`, `.newClientActionId` (Task 8); `replayed: true` on `seg:` and `acc:`
  replays (Task 7's `DEFAULT_KEY_POLICIES`); the module GET's `seg.baseSha256`, `seg.occurrence` and each edit row's
  `contentSha256` (Task 6).
- Produces: `rowValues(segmentId)` → `readRowValues(row) | null` (Tasks 10, 18, 19, 20 use it); the row attributes of decision 22; the
  save body of the wire contract; `acceptSegment(segmentId, acceptOrigin)`, `acceptSegmentAndAdvance(segmentId,
  acceptOrigin = 'single')`.

- [ ] **Step 1: Write the failing tests**

Create `server/__tests__/servedBaseClientPins.test.js` (presence only; behaviour is the E2E below, the
`acceptanceUiPins.test.js:1-5` caveat):

```js
/**
 * G1.1 client wiring (spec §5.18), static pins. PRESENCE ONLY: the behaviour
 * (a declined re-render, the bodies sent) is server/e2e/served-base-client.spec.js,
 * and the value rules are segmentSaveState.test.js.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const serverDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = readFileSync(join(serverDir, 'public', 'js', 'segment-editor.js'), 'utf-8');
const fnBody = (name, next) => {
  const start = src.indexOf(`function ${name}(`);
  const end = src.indexOf(`function ${next}(`, start);
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  return src.slice(start, end);
};

describe('the save and the accept read the row, not moduleData (§5.18, T23)', () => {
  it('rows render the served values as data- attributes', () => {
    const row = fnBody('renderSegmentRow', 'eligibilityView');
    expect(row).toContain('segmentSaveState.rowDataAttributes(');
    expect(row).toMatch(/id="row-\$\{cssId\(seg\.segmentId\)\}"\$\{rowAttrs\}/);
  });

  it('saveEdit builds its body from the row', () => {
    const save = fnBody('saveEdit', 'latestEditIdForSegment');
    expect(save).toContain('rowValues(segmentId)');
    expect(save).toContain('segmentSaveState.buildSaveBody(');
    expect(save).not.toMatch(/originalContent:\s*seg\.is/);
    expect(save).not.toMatch(/editedContent === seg\.is/);
    expect(save).toContain('applySaveEcho(segmentId, saveResult)');
  });

  it('acceptSegment attests the row\'s text and passes its origin', () => {
    const acc = fnBody('acceptSegment', 'acceptSegmentAndAdvance');
    expect(acc).toContain('segmentSaveState.buildAcceptBody(');
    expect(acc).not.toMatch(/acceptedContent:\s*seg\.is/);
    expect(src).toContain("acceptSegmentAndAdvance(cur.segmentId, 'keyboard-stream')");
    expect(src).toMatch(/onclick="acceptSegmentAndAdvance\('\$\{seg\.segmentId\}', 'single'\)"/);
  });

  it('approve, reject and discuss send the hash of the edit the reviewer sees', () => {
    expect(fnBody('reviewEdit', 'unapproveEdit')).toMatch(
      /reviewedEditSha256:\s*reviewedEditSha256For\(editId\)/
    );
  });
});
```

Create `server/e2e/served-base-client.spec.js`:

```js
// @ts-check
const { test, expect } = require('@playwright/test');
const { loginAs } = require('./helpers/auth');
const segmentValidation = require('../public/js/segment-validation');

/**
 * G1.1, the client (spec §5.18; T23; T4's client half): a save and an accept
 * echo what the ROW shows, read from its own DOM, and a refused save keeps the
 * typed text (index decision 12).
 *
 * "The base changed after the page loaded" is simulated by rewriting the FIRST
 * module GET this page receives (route.fetch + route.fulfill), so no file under
 * books/ is touched. A declined re-render is a reload with a dirty pane open and
 * the closePanels confirm dismissed.
 *
 * ⚠️ WRITES AT MOST ONE EDIT ROW: one positive control saves for real and then
 * deletes its row. Every other success is a route.fulfill stub; every other real request is one
 * the server refuses. Rows used: virgin rows nearest the middle of fixture
 * m68664, away from the rows sibling specs claim (helpers/segments.js).
 */
const BOOK = '__e2e-fixture__';
const CHAPTER = '1';
const MODULE = 'm68664';
const MODULE_URL = `/api/segment-editor/${BOOK}/${CHAPTER}/${MODULE}`;
const USER_ID = 88600;
const FAKE_SHA = 'f'.repeat(64);
const SUFFIX = ' g11-client';
const STUB_SAVED = { success: true, editId: 1, updated: false, termWarnings: [], qaFindings: [] };

async function loadModuleJson(page) {
  const res = await page.request.get(MODULE_URL);
  expect(res.ok()).toBe(true);
  return res.json();
}

/**
 * Virgin, append-safe rows nearest the module's middle (siblings claim the ends
 * and the first virgin rows). `plain`: no bracket at all, for edits that wrap or
 * replace text without the backstop seeing a marker move.
 */
function middleVirginRows(data, { plain = false } = {}) {
  const segs = data.segments;
  const mid = Math.floor(segs.length / 2);
  const ok = (s, i) =>
    i > 1 &&
    i < segs.length - 2 &&
    s.hasTranslation &&
    s.is &&
    s.segmentId !== 'm68664:abstract:auto-2' &&
    /^[0-9a-f]{64}$/.test(s.baseSha256 || '') &&
    !(data.edits[s.segmentId] || []).length &&
    !data.acceptances[s.segmentId] &&
    (!plain || !/[[\]]/.test(s.en + s.is)) &&
    !segmentValidation.validateStructure(s.en, s.is, `${s.is}${SUFFIX}`).blocked &&
    !segmentValidation.validateStructure(s.en, s.is, `${s.is}${SUFFIX}`).warnings;
  const picks = segs
    .map((s, i) => ({ s, i }))
    .filter(({ s, i }) => ok(s, i))
    .sort((a, b) => Math.abs(a.i - mid) - Math.abs(b.i - mid));
  expect(picks.length).toBeGreaterThanOrEqual(2);
  return [picks[0].s, picks[1].s];
}

/** Serve the module once with `edit` applied to one segment, then pass through. */
async function rewriteFirstServe(page, segmentId, edit) {
  let served = 0;
  await page.route(`**${MODULE_URL}`, async (route) => {
    served++;
    if (served > 1 || route.request().method() !== 'GET') return route.continue();
    const response = await route.fetch();
    const json = await response.json();
    edit(json.segments.find((s) => s.segmentId === segmentId));
    await route.fulfill({ response, json });
  });
}

async function openModule(page) {
  // Both background loads re-render the table; interact only after they have.
  const background = Promise.all([
    page.waitForResponse((r) => r.url().endsWith(`${MODULE_URL}/terms`)),
    page.waitForResponse((r) => r.url().endsWith(`${MODULE_URL}/repetitions`)),
  ]);
  await page.goto(`/editor?book=${BOOK}&chapter=${CHAPTER}&module=${MODULE}`);
  await expect(page.locator('#editor-container')).toBeVisible({ timeout: 15000 });
  await expect(page.locator('#segments-body tr').first()).toBeVisible({ timeout: 10000 });
  await background;
}

const rowOf = (page, segmentId) => page.locator(`#segments-body tr[data-segment-id="${segmentId}"]`);

/**
 * Reload the module with a dirty pane open, and decline the re-render. loadModule returns before its two
 * background loads (/terms, /repetitions; segment-editor.js:296-297) re-render the table, and each re-render asks
 * closePanels again, so wait for both responses before removing the handler. Any confirm still to come then meets
 * NO listener, and Playwright auto-dismisses a dialog nobody listens for: declined too. So no test in this file
 * installs an ACCEPTING dialog handler while a dirty pane must survive.
 */
async function declineReRender(page) {
  const dismiss = (d) => d.dismiss();
  page.on('dialog', dismiss);
  const background = Promise.all([
    page.waitForResponse((r) => r.url().endsWith(`${MODULE_URL}/terms`)),
    page.waitForResponse((r) => r.url().endsWith(`${MODULE_URL}/repetitions`)),
  ]);
  await page.evaluate((m) => window.loadModule(m, { force: true }), MODULE);
  await background;
  page.off('dialog', dismiss);
}

/**
 * Stub the next POST to MODULE_URL/<suffix>: nothing is written. AWAIT this call, so the route is installed before
 * the click; it resolves to `{ posted }`, a promise of the request body. (Wrapped in an object on purpose: an async
 * function that returned the body promise itself would adopt it, and awaiting the call would wait for the click.)
 */
async function captureAndStub(page, suffix, status, json) {
  let resolveBody;
  const posted = new Promise((r) => (resolveBody = r));
  await page.route(
    `**${MODULE_URL}/${suffix}`,
    async (route) => {
      resolveBody(route.request().postDataJSON());
      await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(json) });
    },
    { times: 1 }
  );
  return { posted };
}

test.describe('G1.1 client: the row is what the save and the accept echo', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, 'admin', USER_ID);
  });

  test('with no re-render, a save sends the served base and a null displayed pair (T23 control)', async ({
    page,
  }) => {
    const [target] = middleVirginRows(await loadModuleJson(page));
    await openModule(page);
    const row = rowOf(page, target.segmentId);
    await expect(row).toHaveAttribute('data-base-sha256', target.baseSha256);
    await row.locator('.btn-edit').click();
    await row.locator('textarea').fill(`${target.is}${SUFFIX}`);
    const { posted } = await captureAndStub(page, 'edit', 200, STUB_SAVED);
    await row.getByRole('button', { name: 'Vista', exact: true }).click();
    const body = await posted;
    expect(body.baseSha256).toBe(target.baseSha256);
    expect(body.originalContent).toBe(target.is);
    expect([body.displayedEditId, body.displayedEditSha256, body.baseEditId]).toEqual([null, null, 0]);
    expect(body.clientActionId).toMatch(/^\S{12,}$/);
    expect(typeof body.clientActionTime).toBe('number');
    expect(body.assists).toEqual([]);
    expect('occurrence' in body).toBe(false); // §5.18: not until G1.12 (b)
    expect('replayed' in body).toBe(false);
  });

  test('after a declined re-render, a save sends the row\'s own base, not the newer one (T23)', async ({
    page,
  }) => {
    const [target] = middleVirginRows(await loadModuleJson(page));
    await rewriteFirstServe(page, target.segmentId, (s) => {
      s.baseSha256 = FAKE_SHA;
    });
    await openModule(page);
    const row = rowOf(page, target.segmentId);
    await row.locator('.btn-edit').click();
    await row.locator('textarea').fill(`${target.is}${SUFFIX}`);
    await declineReRender(page); // moduleData now holds the real base; the screen does not
    await expect(row).toHaveAttribute('data-base-sha256', FAKE_SHA);
    const { posted } = await captureAndStub(page, 'edit', 200, STUB_SAVED);
    await row.getByRole('button', { name: 'Vista', exact: true }).click();
    const body = await posted;
    expect(body.baseSha256).toBe(FAKE_SHA);
    expect(body.baseSha256).not.toBe(target.baseSha256);
  });

  test('control: with no re-render, an accept sends the served text', async ({ page }) => {
    const [target] = middleVirginRows(await loadModuleJson(page));
    await openModule(page);
    const { posted } = await captureAndStub(page, 'accept', 200, { success: true });
    await rowOf(page, target.segmentId).locator('.btn-accept').click();
    const body = await posted;
    expect(body.acceptedContent).toBe(target.is);
    expect(body.acceptOrigin).toBe('single');
    expect(body.clientActionId).toMatch(/^\S{12,}$/);
  });

  test('after a declined re-render, an accept sends the row\'s own text and the value check refuses it (T4)', async ({
    page,
  }) => {
    const [target, other] = middleVirginRows(await loadModuleJson(page));
    const shownIs = `${target.is} [no longer served]`;
    await rewriteFirstServe(page, target.segmentId, (s) => {
      s.is = shownIs;
    });
    await openModule(page);
    // A dirty pane elsewhere makes the reload ask before re-rendering.
    await rowOf(page, other.segmentId).locator('.btn-edit').click();
    await rowOf(page, other.segmentId).locator('textarea').fill(`${other.is}${SUFFIX}`);
    await declineReRender(page);
    const posted = page.waitForRequest(
      (r) => r.url().endsWith(`${MODULE_URL}/accept`) && r.method() === 'POST'
    );
    const answered = page.waitForResponse((r) => r.url().endsWith(`${MODULE_URL}/accept`));
    // No dialog handler: the 409's alert and the reload's closePanels confirm are both auto-dismissed. An accepting
    // handler would let a late re-render through, rebuild the row from moduleData, and send the real `is`.
    await rowOf(page, target.segmentId).locator('.btn-accept').click();
    expect((await posted).postDataJSON().acceptedContent).toBe(shownIs); // the row, not moduleData
    const res = await answered;
    expect(res.status()).toBe(409);
    expect((await res.json()).error).toBe('STALE_CONTENT'); // the server's value check (§5.6 Accept)
    const after = await loadModuleJson(page);
    expect(after.acceptances[target.segmentId]).toBeUndefined(); // nothing written
  });
});
```

In `server/e2e/editor-lifecycle.spec.js` Test 4 (`:152-196`): before installing the route, read the row the test will
edit and its in-flight edit; collect every POST body in the route handler; assert after the success toast.

```js
    const editRow = page
      .locator('#segments-body tr')
      .filter({ has: page.locator('button.btn-edit') })
      .first();
    const segId = await editRow.getAttribute('data-segment-id');
    const mod = await (
      await page.request.get(`/api/segment-editor/${BOOK}/${CHAPTER}/${moduleId}`)
    ).json();
    const latest = (mod.edits[segId] || [])[0];
    const inFlight =
      !!latest && (latest.status === 'pending' || (latest.status === 'approved' && !latest.applied_at));
    // Control: Test 2 saved test-admin's pending SMOKE edit on this first editable row and Test 3 asserted it, so
    // the row shows an in-flight edit. Without this, a row showing the base would let the T4 assertions below
    // pass on null/null and never test the in-flight half.
    expect(inFlight).toBe(true);
    expect(latest.contentSha256).toMatch(/^[0-9a-f]{64}$/);
    // T4 (client half): the row renders the pair the module response gave that edit.
    await expect(editRow).toHaveAttribute('data-displayed-edit-id', String(latest.id));
    await expect(editRow).toHaveAttribute('data-displayed-edit-sha256', latest.contentSha256);
    const bodies = [];
```

Inside the `page.route('**/edit', …)` handler, as the first statement of the `POST` branch:
`bodies.push(route.request().postDataJSON());`. After `expect(interceptCount).toBeGreaterThanOrEqual(3);`:

```js
    // §5.9: the replays carry the live attempt's base and action id, marked replayed.
    expect(bodies[0].baseSha256).toMatch(/^[0-9a-f]{64}$/);
    expect('replayed' in bodies[0]).toBe(false);
    for (const b of bodies.slice(1)) {
      expect(b.replayed).toBe(true);
      expect(b.baseSha256).toBe(bodies[0].baseSha256);
      expect(b.clientActionId).toBe(bodies[0].clientActionId);
    }
    // T4 (client half): the save echoes the in-flight edit the row rendered (the null/null arm is the base-displayed
    // control in served-base-client.spec.js's first test).
    expect([bodies[0].displayedEditId, bodies[0].displayedEditSha256]).toEqual([latest.id, latest.contentSha256]);
```

In `server/e2e/acceptance.spec.js`: in `click-accept …` (`:27-45`), before `await acceptButtons.last().click();` add
`const posted = page.waitForRequest((r) => r.url().endsWith('/accept') && r.method() === 'POST');` and after the
click `expect((await posted).postDataJSON().acceptOrigin).toBe('single');`. In `Ctrl+Shift+Enter …` (`:47-63`), before
press 2 add the same `posted` wait and after it `expect((await posted).postDataJSON().acceptOrigin).toBe('keyboard-stream');`.

In `server/e2e/helpers/segments.js`'s ownership table (`:27-32`), add:
`| served-base-client.spec.js  | virgin rows nearest the middle | mid-module rows |`.

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `npx vitest run server/__tests__/servedBaseClientPins.test.js`
Expected: FAIL — every pin: `segment-editor.js` holds no `segmentSaveState.` reference, still has `originalContent:
seg.is` (`:1988`) and `acceptedContent: seg.is` (`:1711`), and calls `acceptSegmentAndAdvance(cur.segmentId)` with one
argument (`:1748`).

Run: `( cd server && CI=1 npx playwright test --config=e2e/playwright.config.js served-base-client.spec.js
editor-lifecycle.spec.js acceptance.spec.js )`
Expected: FAIL — `served-base-client`: `expect(row).toHaveAttribute('data-base-sha256', …)` times out (rows carry no
data attributes, `:1541`), and the body assertions see `baseSha256` undefined; the declined-re-render accept sends the
newer `moduleData` text (`:1711`), which the server *accepts*, so the 409 assertion fails and an acceptance is written.
`editor-lifecycle` Test 4: `expect(inFlight).toBe(true)` fails, because the row carries no `data-segment-id` yet, so
`segId` is `null` and no edit is found. `acceptance`: `acceptOrigin` is undefined. The other tests in those files
pass.

- [ ] **Step 3: Implement**

In `server/public/js/segment-editor.js`:

After `const API_BASE = '/api/segment-editor';` (`:150`):

```js
  /**
   * The row's own values, read from its DOM. Never moduleData: a declined
   * re-render (renderSegments returns false, renderModule ignores it) leaves
   * moduleData newer than the screen (§5.18).
   */
  function rowElement(segmentId) {
    return document.getElementById('row-' + cssId(segmentId));
  }
  function rowValues(segmentId) {
    return segmentSaveState.readRowValues(rowElement(segmentId));
  }

  /** G1.21: what the next save from this row must echo, kept on the row itself. */
  function applySaveEcho(segmentId, result) {
    const tr = rowElement(segmentId);
    if (!tr) return;
    const current = segmentSaveState.readRowValues(tr);
    for (const [name, value] of segmentSaveState.echoAttributeUpdates(result, current.baseEditId)) {
      if (value === null) tr.removeAttribute(name);
      else tr.setAttribute(name, value);
    }
  }

  /** The hash of the edit the reviewer is looking at: the row that displays it. */
  function reviewedEditSha256For(editId) {
    const id = Number(editId);
    const tr = document.querySelector('#segments-body tr[data-displayed-edit-id="' + id + '"]');
    const row = segmentSaveState.readRowValues(tr);
    return row && row.displayedEditId === id ? row.displayedEditSha256 : null;
  }
```

In `renderSegmentRow`, after `const editableText = displayIs;` (`:1321`):

```js
    // §5.18: what a save and an accept echo, rendered ON the row, so a declined
    // re-render cannot make them disagree with what the editor is looking at.
    const rowAttrs = segmentSaveState.rowDataAttributeHtml(
      segmentSaveState.rowDataAttributes(
        seg,
        hasActiveEdit ? latestEdit : null,
        latestEditIdForSegment(seg.segmentId)
      ),
      escapeHtml
    );
```

and change the row tag (`:1541`) to `<tr class="${rowClass}" id="row-${cssId(seg.segmentId)}"${rowAttrs}>`. Change the
accept button's onclick (`:1514`) to `onclick="acceptSegmentAndAdvance('${seg.segmentId}', 'single')"`.

`acceptSegment(segmentId, acceptOrigin)`: after the `hasTranslation` guard add
`const row = rowValues(segmentId);` and `if (!row || row.is === null) return; // nothing on screen to attest`, and
replace the body with:

```js
          body: JSON.stringify(
            segmentSaveState.buildAcceptBody({
              segmentId,
              row,
              acceptOrigin,
              clientActionId: segmentSaveState.newClientActionId(window.crypto),
              clientActionTime: Date.now(),
            })
          ),
```

`acceptSegmentAndAdvance(segmentId, acceptOrigin = 'single')` passes `acceptOrigin` to `acceptSegment`;
`acceptAtCursor` calls `acceptSegmentAndAdvance(cur.segmentId, 'keyboard-stream')` (`:1748`).

`saveEdit`: after `if (!seg) return;` add:

```js
    // §5.18: the base, the displayed pair and the text compared against all
    // come from the ROW, not from moduleData.
    const row = rowValues(segmentId);
    if (!row || row.is === null) return; // the pane's row is gone (navigated away mid-save)
    const shownIs = row.is;
```

Replace `seg.is` with `shownIs` at `:1942`, `:1951` and in `validateSegmentEdit(seg.en, seg.is, editedContent)`
(`:1960`; `seg.en` stays). Replace the body (`:1986-1995`) with:

```js
      body: JSON.stringify(
        segmentSaveState.buildSaveBody({
          segmentId,
          row,
          editedContent,
          category,
          editorNote,
          assists: [], // Task 10: the pane's assist list
          clientActionId: segmentSaveState.newClientActionId(window.crypto),
          clientActionTime: Date.now(),
        })
      ),
```

On success, before `dirtyEdits.delete(segmentId);` (`:2045`): `applySaveEcho(segmentId, saveResult);`. Keep
`latestEditIdForSegment` (the row render uses it).

`reviewEdit`: `body: JSON.stringify({ note, reviewedEditSha256: reviewedEditSha256For(editId) }),`.

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `npx vitest run server/__tests__/servedBaseClientPins.test.js`, then `npx vitest run
server/__tests__/acceptanceUiPins.test.js`, `npx vitest run server/__tests__/ui-strings.test.js`, `npx vitest run
server/__tests__/clientJsSyntax.test.js`, `npx vitest run server/__tests__/structuralBackstopWiring.test.js`
Expected: PASS, every test in each file (`acceptanceUiPins`' count of `baselineTextFor(seg, latestEdit)` is still
five).

Run: `( cd server && CI=1 npx playwright test --config=e2e/playwright.config.js served-base-client.spec.js
editor-lifecycle.spec.js acceptance.spec.js )`
Expected: PASS, every test in the three files. Then the whole E2E job, `( cd server && CI=1 npm run test:e2e )`:
PASS (diff any failing set by name against `main`'s). `npx eslint` and `npx prettier --check` on every touched file:
no problems.

- [ ] **Step 5: Commit**

```bash
git add server/public/js/segment-editor.js server/__tests__/servedBaseClientPins.test.js \
  server/e2e/served-base-client.spec.js server/e2e/editor-lifecycle.spec.js \
  server/e2e/acceptance.spec.js server/e2e/helpers/segments.js
git commit -m "feat(segment-editor): rows carry the served values; save, accept and review echo them from the row"
```

---

### Task 10: each pane records the assists made since it opened, and the save sends them

Spec: §5.10 (item types, sources, whole-text items keep `detail.text`, the repetition's source book, chapter and
module, "why the client must report them"), §5.18 row 6 (the list per segment; cleared on a successful save, revert,
Hætta við or Escape, and on reload), index decision 4.

**Files:**
- Modify: `server/public/js/segment-editor.js` — new state `paneState` (a `Map`), new `freshPaneState`, `addAssist`,
  `clearPaneState`; `openEditPanel` (`:1783`), `closeEditPanel` (`:1846-1864`), `revertEdit` (`:1870-1891`),
  `renderSegments` (`:1211`), `saveEdit` (the body's `assists`, the success path), `insertRepetition` (`:874-884`),
  `insertTermFromLookup` (`:3261-3281`), `wrapSelection` (`:3308-3334`, a fourth parameter), the keyboard shortcuts
  (`:3441-3450`) and the Escape close (`:3377-3388`).
- Test: `server/__tests__/servedBaseClientPins.test.js` (one `describe`); `server/e2e/served-base-client.spec.js` (one
  test).

**Interfaces:**
- Consumes: `segmentSaveState.assistItem` (Task 8); `rowValues` (Task 9).
- Produces: `paneState: Map<segId, {baseSha256: string|null, occurrence: number|null, assists: Item[], refused:
  string|null}>`, created when a pane opens and read by Tasks 18–20; `addAssist(segmentId, item)`;
  `clearPaneState(segmentId)`; `wrapSelection(textareaId, prefix, suffix, source = 'toolbar')`.

- [ ] **Step 1: Write the failing tests**

Append to `server/__tests__/servedBaseClientPins.test.js`:

```js
describe('assists are recorded at their three sites and sent (§5.10)', () => {
  it('each site adds its own item type to the pane that received it', () => {
    expect(fnBody('insertRepetition', 'highlightQuery')).toMatch(
      /addAssist\(\s*segmentId,[\s\S]*'repetition-insert',\s*'tm'/
    );
    expect(fnBody('insertTermFromLookup', 'wrapSelection')).toMatch(
      /addAssist\(\s*ta\._segmentId,[\s\S]*'term-insert',\s*'termbase'/
    );
    expect(fnBody('wrapSelection', 'waitFor')).toMatch(
      /'markup-wrap',\s*source === 'keyboard' \? 'keyboard' : 'toolbar'/
    );
    expect(src).toMatch(/wrapSelection\(taId, '\*\*', '\*\*', 'keyboard'\)/);
  });

  it('saveEdit sends the pane\'s list and clears it on success', () => {
    const save = fnBody('saveEdit', 'latestEditIdForSegment');
    expect(save).toMatch(/assists:\s*paneAssists\(segmentId\)/);
    expect(save).toContain('clearPaneState(segmentId)');
  });
});
```

(`fnBody` slices to the NEXT named function after the start: after `wrapSelection` (`:3308`) that is `waitFor`
(`:3509`), not `tokenizeForDiff` (`:2470`), which comes earlier in the file. The regexes allow line breaks because
prettier may wrap the calls.)

Append to `server/e2e/served-base-client.spec.js`'s `describe`:

```js
  test('a save lists the repetition insert, the wraps and the term insert since the pane opened (§5.10)', async ({
    page,
  }) => {
    const [target, other] = middleVirginRows(await loadModuleJson(page), { plain: true });
    // A repetition suggestion for the target, stubbed: the fixture holds no applied twin.
    const suggestion = { is_text: `${target.is}${SUFFIX}`, book: 'efnafraedi-2e', chapter: 3, module_id: 'm68000' };
    await page.route(`**${MODULE_URL}/repetitions`, (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ repetitions: [{ segmentId: target.segmentId, suggestion }] }),
      })
    );
    await openModule(page);
    const row = rowOf(page, target.segmentId);
    const ta = row.locator('textarea');
    await row.getByRole('button', { name: 'Nota þessa þýðingu' }).click(); // whole text, tm
    await expect(ta).toHaveValue(suggestion.is_text);
    await ta.evaluate((el) => el.setSelectionRange(0, 3));
    await row.locator('.format-toolbar .tb-bold').click(); // markup-wrap, toolbar
    await ta.press('Control+i'); // markup-wrap, keyboard
    // A term goes into the LAST-FOCUSED textarea: the target's, though another pane opened after it.
    await rowOf(page, other.segmentId).locator('.btn-edit').click();
    await ta.focus();
    await page.evaluate(() => window.insertTermFromLookup('hugtak'));
    const { posted } = await captureAndStub(page, 'edit', 200, STUB_SAVED);
    page.on('dialog', (d) => d.accept()); // the validation warning an empty '*' pair raises
    await row.getByRole('button', { name: 'Vista', exact: true }).click();
    const body = await posted;
    expect(body.assists.map((a) => [a.itemType, a.source])).toEqual([
      ['repetition-insert', 'tm'],
      ['markup-wrap', 'toolbar'],
      ['markup-wrap', 'keyboard'],
      ['term-insert', 'termbase'],
    ]);
    expect(body.assists[0].detail).toEqual({
      text: suggestion.is_text,
      book: 'efnafraedi-2e',
      chapter: 3,
      moduleId: 'm68000',
    });
    expect(body.assists[1].detail).toEqual({ marker: '**' });
    expect(body.assists[2].detail).toEqual({ marker: '*' });
    expect(body.assists[3].detail).toEqual({ term: 'hugtak' });
    for (const a of body.assists) expect(typeof a.clientTimeMs).toBe('number');
  });
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `npx vitest run server/__tests__/servedBaseClientPins.test.js`
Expected: FAIL — the new `describe`: no `addAssist(` in the file, `assists: []` in `saveEdit` (Task 9's
placeholder). The Task 9 pins pass.

Run: `( cd server && CI=1 npx playwright test --config=e2e/playwright.config.js served-base-client.spec.js -g "repetition insert" )`
Expected: FAIL — `body.assists` is `[]`, not the four items.

- [ ] **Step 3: Implement**

In `segment-editor.js`, in STATE after `let cursorSegmentId = null;`:

```js
  // §5.10 / §5.18: per open pane, the assists since it opened, the base its text
  // was started from, and (Task 19) why a refused save kept it.
  const paneState = new Map();
```

After `reviewedEditSha256For` (Task 9):

```js
  function freshPaneState(segmentId) {
    const row = rowValues(segmentId);
    return {
      baseSha256: row ? row.baseSha256 : null,
      occurrence: row ? row.occurrence : null,
      assists: [],
      refused: null,
    };
  }
  /** Attribute the item to the segment whose textarea received it (§5.10). */
  function addAssist(segmentId, item) {
    if (!paneState.has(segmentId)) paneState.set(segmentId, freshPaneState(segmentId));
    paneState.get(segmentId).assists.push(item);
  }
  function paneAssists(segmentId) {
    const st = paneState.get(segmentId);
    return st ? st.assists : [];
  }
  function clearPaneState(segmentId) {
    paneState.delete(segmentId);
  }
```

- `openEditPanel`: as the first line inside `if (panel) {`:
  `if (!paneState.has(segmentId)) paneState.set(segmentId, freshPaneState(segmentId));`
- `closeEditPanel`: after `dirtyEdits.delete(segmentId);` add `clearPaneState(segmentId);`.
- `revertEdit`: after `dirtyEdits.delete(segmentId);` add `paneState.set(segmentId, freshPaneState(segmentId));` (the
  pane stays open; its list starts again). **Do not call `baselineTextFor` anywhere new** (Global Constraints (PR1): `acceptanceUiPins.test.js:120` counts
  exactly five sites).
- `renderSegments`: after `dirtyEdits.clear();` (`:1211`) add `paneState.clear();` (a re-render closes every pane).
- Escape close: after `dirtyEdits.delete(segId);` (`:3386`) add `clearPaneState(segId);`.
- `saveEdit`: Task 9's `assists: [],` becomes `assists: paneAssists(segmentId),`; on success, after
  `dirtyEdits.delete(segmentId);` add `clearPaneState(segmentId);`.
- `insertRepetition`: after `ta.value = rep.suggestion.is_text;`:

```js
      addAssist(
        segmentId,
        segmentSaveState.assistItem('repetition-insert', 'tm', Date.now(), {
          text: ta.value, // the whole text right after the item (§5.10)
          book: rep.suggestion.book,
          chapter: rep.suggestion.chapter,
          moduleId: rep.suggestion.module_id,
        })
      );
```

- `insertTermFromLookup`: after `ta.selectionStart = ta.selectionEnd = start + insertion.length;`:

```js
      if (ta._segmentId) {
        addAssist(
          ta._segmentId,
          segmentSaveState.assistItem('term-insert', 'termbase', Date.now(), { term: icelandicTerm })
        );
      }
```

- `wrapSelection(textareaId, prefix, suffix, source = 'toolbar')`: after its `ta.dispatchEvent(…)`:

```js
    if (ta._segmentId) {
      addAssist(
        ta._segmentId,
        segmentSaveState.assistItem(
          'markup-wrap',
          source === 'keyboard' ? 'keyboard' : 'toolbar',
          Date.now(),
          { marker: prefix }
        )
      );
    }
```

- Keyboard shortcuts (`:3443`, `:3446`, `:3449`): pass `'keyboard'` as the fourth argument, e.g.
  `wrapSelection(taId, '**', '**', 'keyboard');`. The toolbar's onclicks (`:1558-1563`) keep three arguments.

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `npx vitest run server/__tests__/servedBaseClientPins.test.js`, `npx vitest run
server/__tests__/acceptanceUiPins.test.js`, `npx vitest run server/__tests__/clientJsSyntax.test.js`
Expected: PASS, every test in each file.

Run: `( cd server && CI=1 npx playwright test --config=e2e/playwright.config.js served-base-client.spec.js )`
Expected: PASS, every test in the file. `npx eslint` and `npx prettier --check` on the touched files: no problems.

- [ ] **Step 5: Commit**

```bash
git add server/public/js/segment-editor.js server/__tests__/servedBaseClientPins.test.js \
  server/e2e/served-base-client.spec.js
git commit -m "feat(segment-editor): each pane records its assists since opening; the save sends them"
```

---

### Task 11: audit every reader of `segment_edits.original_content` before the re-save moves it

Spec §5.8 (Claude's call 10), §13 ("checking every reader of `segment_edits.original_content`"); decision 18.

**Files:**
- Test: `server/__tests__/originalContentReaders.test.js` (new). No source change.

**The audit** (re-derived at ed10180c with `git grep -an "original_content\|originalContent" -- server scripts tools
':!*__tests__*' ':!server/e2e' ':!server/migrations' ':!*.test.*'`, plus every `SELECT * FROM segment_edits`). Moving
the base on re-save changes only rows that are **pending** (the UPDATE path matches `status = 'pending'`,
`segmentEditorService.js:102-108`):

| Reader | What it reads | Does a moved base change it? | Plan |
|---|---|---|---|
| `server/services/termMiningService.js:105`, `:113` | `original_content` of **approved** rows as the "before" of a term substitution | Only for rows later approved; their before becomes the base the final text was made on, the truer before | none |
| `server/scripts/read-apply-exposure.js:54`, `:111` | approved rows' `original_content` for the class `clean` | Its docstring (`:22`) calls it "the text the editor started from"; after Task 12 it is the base of the last re-save | Task 12 corrects the docstring line |
| `server/scripts/close-pending-edits.js:121`, `:138` | `SELECT *`, then a frozen fingerprint compare | A moved base reads as "changed since it was frozen" and the row is refused: fail-closed, correct | none |
| `scripts/reattach-segment-edits.js:103`, `:228-235`, `:313-320` | the snapshot's `original_content` (fallback for the old MT); comments and an operator warning that the UPDATE branch never writes `original_content` | The comments and the warning become false: the UPDATE branch now writes the new MT | Task 12 corrects them and pins the new behaviour |
| `scripts/render-segment-edits-md.js:104` | the snapshot's `original_content`, display only | shows the latest base | none |
| `scripts/export-segment-edits.js:61` | `SELECT *` into the snapshot | carries the latest base and the new columns | none |
| `server/scripts/read-pending-edits.js:34` | `SELECT *` of pending rows, a read-only probe | shows the latest base | none |
| `server/services/segmentEditorService.js:242`, `:362`, `:374`, `:690` and the review functions' `SELECT *` | rows sent to browsers (the module route, `/segment-history`, `/reviews/:reviewId`, review responses) | the value sent changes; no client reads `original_content` from a `segment_edits` row (`grep -rnaE "original_content" server/public server/views` finds only `localization-editor.js:629`, another table) | none |
| `server/services/segmentEditorService.js:88`, `:110`, `:185-194`; `propagationService.js:87-91` | writers | Tasks 12, 16 | — |
| `server/routes/segment-editor.js:345`, `:424`; `server/public/js/segment-editor.js:1988` | the client's `originalContent`, stored today | Task 14 stops reading it | — |
| `server/public/js/segment-save-state.js` (created in Task 8, so already on the branch when this test first runs) | `buildSaveBody` sends the row's `data-is` as `originalContent` | no: a request field, ignored by the server from Task 14 on (decision 25) | none |
| `server/lib/applyHold.js:5` | a comment (`applyApprovedEdits` never compares `original_content`) | no | none |
| `server/routes/localization-editor.js:388`, `:593`; `server/services/localizationReviewService.js:90-136`; `server/public/js/localization-editor.js:629` | `localization_pending_edits`, another table | no | none |

**Interfaces:**
- Produces: `scanReaders(root, pattern) → string[]` (repo-relative paths), local to the test.

- [ ] **Step 1: Write the test**

- `const AUDITED_READERS = [...]` — the files of the table's first column holding `original_content` or
  `originalContent`, `server/public/js/segment-save-state.js` included (the scanner walks `server/public/js`; Task 13
  adds `server/services/servedEdit.js` when it creates that file); `const AUDITED_SELECT_STAR = ['scripts/export-segment-edits.js',
  'server/scripts/close-pending-edits.js', 'server/scripts/read-pending-edits.js',
  'server/services/segmentEditorService.js']`.
- `scanReaders(root, re)`: walk `server/`, `scripts/` and `tools/` under `root`, skipping directories named
  `node_modules`, `.venv`, `__tests__`, `migrations` and `server/e2e`, and files matching `/\.test\./`; read each
  `.js`, `.cjs`, `.mjs` with `fs.readFileSync` (a NUL byte cannot hide a match here, unlike `grep` without `-a`).
- `it('every reader of original_content is in the audit')` — `scanReaders(REPO, /original_content|originalContent/)`
  filtered to those **not** in `AUDITED_READERS` equals `[]`.
- `it('every SELECT * on segment_edits is in the audit')` — same with `/SELECT\s+\*\s+FROM\s+segment_edits/`.
- `it('control: a planted reader in a temp root is named')` — a temp root with `server/services/x.js` holding
  `row.original_content`: the first check's filtered list equals `['server/services/x.js']`.

- [ ] **Step 2: Run it**

Run: `npx vitest run server/__tests__/originalContentReaders.test.js`
Expected: PASS on the first run (a pin: no behaviour changes in this task, decision 18); the control case shows the scanner
can name a reader. At `ed10180c` the scan names exactly the pre-existing files the table lists (re-measured read-only
with the same walk); with Task 8 on the branch it also names `segment-save-state.js`, which the table now
holds. If either real check fails, a reader exists that the table above lacks: audit it here before Task 12.

- [ ] **Step 3: Commit**

```bash
git add server/__tests__/originalContentReaders.test.js
git commit -m "test(server): pin the audited readers of segment_edits.original_content before re-save moves it"
```

---

### Task 12: `saveSegmentEdit` writes the served fields, and a re-save moves the base record

Spec §5.8 (the re-save rule), §5.6 step 6; decisions 10, 11.

**Files:**
- Modify: `server/services/segmentEditorService.js` — `saveSegmentEdit` (`:82-234`, ed10180c): destructure the
  optional fields (`:83-95`), the UPDATE (`:145-151`), the INSERT (`:182-198`) (`getDb` was exported in Task 6)
- Modify: `scripts/reattach-segment-edits.js` — three passages Task 12 makes false: the comment at `:211-214`
  ("segmentEditorService exposes no accessor for the one it uses": `getDb` is exported now), the comments at
  `:219-223` and `:228-234` ("an UPDATE-branch write is exactly where … silently fails"; "NOT on saveSegmentEdit's
  UPDATE branch, which never writes original_content"), and the warning at `:316-320` ("KEPT their old
  original_content")
- Modify: `server/scripts/read-apply-exposure.js:22` — the docstring's description of `clean`
- Test: `server/__tests__/saveSegmentEditServedFields.test.js` (new); `scripts/__tests__/reattachSegmentEditsWrite.test.mjs`
  (one case)

**Interfaces:**
- Consumes: `servedVersions.mintVersions` (Task 5), in the test only, for real ids.
- Produces: `saveSegmentEdit(params)` accepts, additively, `servedVersionId?: number`, `occurrence?: number`,
  `origin?: string`, `displayedEditId?: number`, `displayedEditSha256?: string` (each defaults to `null`). Return
  shape unchanged: `{ id, updated: false }` on insert, `{ id, updated: true }` on update, `{ id, updated: true,
  reverted: true }` on a withdraw that deleted, `{ id: null, updated: false, reverted: true }` on one that did not.

- [ ] **Step 1: Write the failing tests**

`server/__tests__/saveSegmentEditServedFields.test.js` on `freshMigratedDb()` (real foreign keys), with
`service._setTestDb(db)` and `service._setTestBooksDir` / `segmentParser._setTestBooksDir` on an empty temp root
(no MT file, so the lock hook writes nothing). `v1`, `v2` are ids from `mintVersions(db, [row1])`, `[row2]`.

- `it('an INSERT stores the served fields')` — `saveSegmentEdit({ …, originalContent: 'B1', editedContent: 'E1',
  servedVersionId: v1, occurrence: 0, origin: 'editor-save', displayedEditId: null, displayedEditSha256: null })`;
  the row's `[original_content, served_version_id, occurrence, origin, displayed_edit_id, displayed_edit_sha256]`
  equals `['B1', v1, 0, 'editor-save', null, null]`.
- `it('a re-save moves original_content and the served fields to this save’s values, keeping the id')` — then the same
  editor with `originalContent: 'B2', editedContent: 'E2', servedVersionId: v2, origin: 'editor-save',
  displayedEditId: 7, displayedEditSha256: 'a'.repeat(64)`: same `id`, `updated: true`, and the tuple equals
  `['B2', v2, 0, 'editor-save', 7, 'a'.repeat(64)]`, `edited_content 'E2'`.
- `it('a legacy re-save writes the base it was given and NULLs what it does not know')` — after the served INSERT, a
  call without the new fields and `originalContent: 'B3'`: tuple equals `['B3', null, null, null, null, null]`.
- `it('a legacy INSERT writes NULLs and returns today’s shape')` — `Object.keys(result).sort()` equals `['id',
  'updated']` (`errorHandling.test.js:64` pins `reverted` undefined).
- `it('withdraw is still edited === original')` — after an insert, a save with `editedContent === originalContent`
  returns `{ reverted: true, updated: true }` and the row is gone.
- `it('a servedVersionId with no row fails loud (the foreign key is live)')` — `servedVersionId: 999999` throws
  `/FOREIGN KEY constraint failed/`, and no row exists; control: `v1` saves.
- `it('getDb returns the connection saveSegmentEdit writes on')` — `service.getDb()` is `db` (a pin on Task 6's export:
  `saveOnServedBase`'s one transaction depends on it).

`scripts/__tests__/reattachSegmentEditsWrite.test.mjs`, in `describe('applyReattach — honest counts')`:
- `it('a re-run’s UPDATE branch now writes the new MT as original_content')` — plan and apply once; rewrite
  `m001-segments.is.md`'s `fs-id1` to `nýrri vélþýðing`; plan and apply again: `updatedKeys` equals
  `['testbook/m001/m001:para:fs-id1/u1']` (unchanged reporting) and `SELECT original_content` is `'nýrri vélþýðing'`.

- [ ] **Step 2: Run them**

Run: `npx vitest run server/__tests__/saveSegmentEditServedFields.test.js` then
`npx vitest run scripts/__tests__/reattachSegmentEditsWrite.test.mjs`
Expected: FAIL — the INSERT test reads `served_version_id null` (expected `v1`); the re-save test reads
`original_content 'B1'` (expected `'B2'`); the FK test does not throw (the INSERT does not name the column); the
`getDb` pin passes already; the re-attach case reads `'ný vélþýðing'` (expected `'nýrri vélþýðing'`).

- [ ] **Step 3: Implement**

`saveSegmentEdit`: destructure `servedVersionId = null, occurrence = null, origin = null, displayedEditId = null,
displayedEditSha256 = null`. The UPDATE becomes:

```js
        `UPDATE segment_edits
           SET edited_content = ?, category = ?, editor_note = ?, created_at = CURRENT_TIMESTAMP,
               original_content = ?, served_version_id = ?, occurrence = ?, origin = ?,
               displayed_edit_id = ?, displayed_edit_sha256 = ?
         WHERE id = ?`
```

run with `(editedContent, category || null, editorNote || null, originalContent, servedVersionId, occurrence,
origin, displayedEditId, displayedEditSha256, existing.id)`, and a comment: *a re-save moves the base record (spec
§5.8): the row's text is now made on this save's base; a caller that names no served version leaves it NULL
(unknown), never a stale id. The before-image is the research event's (PR3).* The INSERT adds the five columns and
values in the same order.

`scripts/reattach-segment-edits.js`: at `:211-214`, say `segmentEditorService` now exports `getDb` but a
per-row transaction stays the design (a re-run converges). Replace the `:219-223` and `:228-234` comments with one saying both branches now write the new
MT as `original_content` (since this PR's `saveSegmentEdit`), so Step 4a's guarantee is no longer what keeps the base
right; it still keeps one row per key. Replace the warning at `:316-320` with: *These keys already had a pending row:
it was updated in place, its base now the new MT. Tell the editor their pending text was replaced. (Expected count on a
first run: 0.)*

`server/scripts/read-apply-exposure.js:22`: *clean — the base equals the base the edit's current text was made on
(`original_content`; a re-save moves it since G1.1).*

- [ ] **Step 4: Run them**

Run: `npx vitest run server/__tests__/saveSegmentEditServedFields.test.js`, then one at a time
`scripts/__tests__/reattachSegmentEditsWrite.test.mjs`, `server/__tests__/segmentEditorService.test.js`,
`server/__tests__/errorHandling.test.js`, `server/__tests__/segmentEditConflict.test.js`,
`server/__tests__/originalContentReaders.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/services/segmentEditorService.js scripts/reattach-segment-edits.js \
  server/scripts/read-apply-exposure.js server/__tests__/saveSegmentEditServedFields.test.js \
  scripts/__tests__/reattachSegmentEditsWrite.test.mjs
git commit -m "feat(server): saveSegmentEdit stores the served base; a re-save moves original_content (G1.1)"
```

---

### Task 13: `saveOnServedBase`, its refusals, and the write-path vocabulary

Spec §5.6 (steps 1–6, writers with no client view), §5.7, §5.10 (origin), R4; T4 (PR1 half: service), T5 (PR1 half:
save and re-attach, on the two known ids), T18 (PR1 half: organic save, service); index decision 16 (the backstop
call and its string live here); decisions 5–9, decision 20.

**Files:**
- Create: `server/lib/editOrigins.js` — `EDIT_ORIGINS`, `RESERVED_EDIT_ORIGINS`
- Create: `server/services/servedEdit.js` — `REFUSAL_MESSAGES`, `REFUSAL_STATUS`, `refuse` (internal),
  `placeOnServedBase`, `saveOnServedBase`
- Test: `server/__tests__/servedEdit.test.js` (new), `server/__tests__/editOrigins.test.js` (new)
- Modify: `server/__tests__/originalContentReaders.test.js` (Task 11) — `AUDITED_READERS` gains
  `server/services/servedEdit.js`, a writer that passes the server's base as `originalContent` (`seg.is`, spec §5.6
  step 6); without it the audit names the new file and `npm test` goes red from this commit on

**Interfaces:**
- Consumes: `segmentParser.loadModuleForEditing`; `segmentEditor.getDb`, `getEditById` (`:372`), `saveSegmentEdit`
  (Task 12); `servedVersions.countOccurrences`, `buildVersionRow`, `mintVersions` (Task 5); `sha256Text`, `isNotMintedBook`
  (Task 1); `segmentValidation.validateStructure` (`server/public/js/segment-validation.js`, UMD).
- Produces (exact in "Interfaces produced for later PRs"): `placeOnServedBase(…) → { data, seg, occurrence,
  duplicatedIds }`; `saveOnServedBase(input) → { outcome, editId, servedVersionId, occurrence, baseSha256, layer,
  editedContentSha256, displayed }`; refusals as `Error` with `code`, `refusal: { code, echoedSha256, currentSha256 }`
  and, for `STRUCTURE_BLOCKED`, `violations`.

- [ ] **Step 1: Write the failing tests**

`server/__tests__/editOrigins.test.js`: `[...EDIT_ORIGINS]` equals `['editor-save', 'propagation', 're-attach']`;
`[...RESERVED_EDIT_ORIGINS]` equals `['note-apply', 'propagated', 'ai-pass']`; their intersection is `[]` (so
`propagation` and `propagated` are never merged, spec §5.10); both frozen.

`server/__tests__/servedEdit.test.js` — temp `SESSIONS_DB_PATH`, `runAllMigrations()`, temp books root via
`segmentParser._setTestBooksDir`. Fixture (`servedFixture.writeModule`): `efnafraedi-2e/ch01/m91001` (MT layer)
with `a` (`EN a` / `IS a`), `b` (`Some [[MATH:1]] x.` / `Eitthvað [[MATH:1]] x.`), `c` (degraded: EN `F [[MATH:2]].`,
IS `F.`), `d` twice, and `e` (`EN e` / `IS e`, used only by the step 6 transaction test, so nothing earlier mints
it); `m91002` EN only; `lifraen-efnafraedi/ch01/m91004` (EN + MT). The two known modules are
**copied** from the committed tree into the temp root (`fs.copyFileSync` of
`books/efnafraedi-2e/02-for-mt/ch05/m68726-segments.en.md` and `02-mt-output/ch05/m68726-segments.is.md`, and the
`ch08/m68747` pair), so no write can reach `books/`. `base(seg)` = `sha256Text(loaded.is)`. `save(over)` calls
`saveOnServedBase({ book: 'efnafraedi-2e', chapter: 1, moduleId: 'm91001', segmentId: 'm91001:para:a',
editedContent: 'IS a breytt', editorId: 'u1', editorUsername: 'E', origin: 'editor-save', requireEcho: true,
baseSha256: <current>, ...over })`. `snap()` returns `{ edits: SELECT * FROM segment_edits ORDER BY id, versions:
SELECT id FROM served_text_versions ORDER BY id }`; every refusal asserts `snap()` before and after are equal.

- `describe('steps 1–3, in order (spec §5.6)')`:
  - `BOOK_NOT_MINTED` for `lifraen-efnafraedi` **with a correct hash** (T18), before the load (control: a book with no
    such module at all still gets `BOOK_NOT_MINTED`, not a not-found error).
  - `NO_LAYER` for `m91002`.
  - `SEGMENT_NOT_FOUND` for `m91001:para:zz`, `err.message === 'segment not found'`; and for `occurrence: 1` on `a`.
  - `DUPLICATE_ID` for `m91001:para:d`, with `requireEcho: true` and with `requireEcho: false, origin: 're-attach'`
    (T5 re-attach half).
- `describe('T5, PR1 half: the two known duplicated ids, on copies of the committed modules (R4, spec §5.7)')`:
  - for `ch05/m68726` and `m68726:para:fs-idm94618544`, and `ch08/m68747` and `m68747:para:fs-idm99049568`, each
    with `snap()` equal before and after every call:
    - the save (chapter 5 and 8, `requireEcho: true`, `baseSha256` the served `is`'s hash) throws `DUPLICATE_ID`;
    - **the re-attach** (`requireEcho: false, origin: 're-attach'`, same id and chapter) throws `DUPLICATE_ID` (T5's
      re-attach half on the known ids, spec T5 "Run on the two known ids");
    - per occurrence, by value: after `annotateServed(loaded, key)` the segments with that id map to `[{ occurrence:
      0, hasBase: false, is: X }, { occurrence: 1, hasBase: false, is: X }]` with the same `X` for both (the loader
      serves the last copy's Icelandic for both occurrences), while the two raw copies' `content` in the
      copied `02-mt-output` file (`segmentParser.parseSegments(fs.readFileSync(…, 'utf8'))`, filtered to that id)
      differ from each other (`m68726`: `[[MATH:2]]` against `[[MATH:3]]`), so the comparison can fail;
    - `SELECT * FROM segment_edits WHERE segment_id = ?` and `SELECT * FROM served_text_versions WHERE segment_id =
      ?` both return `[]`: no row for either occurrence.
  - control: `m68726:title:auto-1` (a non-duplicated sibling in the same module) saves (`outcome 'inserted'`) and its
    served version exists.
- `describe('step 4, requireEcho (spec §5.6; T4 service half)')`:
  - no `baseSha256` **and** a stale displayed pair → `BASE_MISSING` (order), `err.refusal` equals `{ code:
    'BASE_MISSING', echoedSha256: null, currentSha256: base(a) }`.
  - a wrong `baseSha256` and a stale displayed pair → `STALE_BASE`, refusal `{ echoedSha256: <sent>, currentSha256:
    base(a) }`.
  - base file changed between serve and save (annotate, rewrite `a`'s IS, save with the old hash) → `STALE_BASE`.
  - `displayedEditId` of a deleted row → `STALE_DISPLAYED` (`currentSha256: null`); of a row on segment `b` →
    `STALE_DISPLAYED`; of editor 2's row on `a` whose text was re-saved after the echo (same id,
    `segmentEditorService.js:146-151`) → `STALE_DISPLAYED`, refusal `{ echoedSha256: sha(old), currentSha256:
    sha(new) }`.
- `describe('a save that passes (T4 positive controls)')`:
  - base displayed: `outcome 'inserted'`; the row's `original_content === loaded.is` (the server's base; no caller value
    exists), `served_version_id === result.servedVersionId`, `occurrence 0`, `origin 'editor-save'`, displayed pair
    `[null, null]`; the version row's `is_text === loaded.is`, `layer 'mt-output'`; `result.baseSha256 === base(a)`,
    `result.editedContentSha256 === sha256Text('IS a breytt')`.
  - another editor's in-flight edit displayed (`displayedEditId: id2, displayedEditSha256: sha256Text(text2)`): the
    new row stores `[id2, sha256Text(text2)]`.
  - a withdraw is decided by the server's base: the same editor saves `editedContent === loaded.is` → `outcome
    'withdrawn'`, the row is gone; saving it again → `outcome 'unchanged'`, `editId null`.
  - a re-save after the base changed (rewrite `a`'s IS to `IS a2`, save with `base(a2)`) → `outcome 'updated'`, same
    row id, `original_content 'IS a2'`, `served_version_id` the new version's id (different from the first).
- `describe('step 5, the backstop, for every caller (index decision 16)')`:
  - `requireEcho: false, origin: 're-attach'` with `b` stripped of `[[MATH:1]]` → `STRUCTURE_BLOCKED`, `err.message
    === 'Vistun hafnað: byggingarmerki vantar eða hafa breyst.'`, `err.violations` contains `{ code:
    'math-missing' }`.
  - an identity save on the degraded `c` passes (`outcome 'unchanged'`).
- `describe('step 6')`:
  - `it('a re-attached row carries its served version and origin')` — `requireEcho: false, origin: 're-attach'`: the
    row has `origin 're-attach'` and a non-null `served_version_id` (T4).
  - `it('mint and save are one transaction')` — on `m91001:para:e`, which no earlier test serves or saves: `SELECT id
    FROM served_text_versions WHERE segment_id = 'm91001:para:e'` is `[]` before; a call with `editorId: null` (NOT
    NULL fails inside `saveSegmentEdit`, after the mint) throws, and the same query is still `[]` (no orphan version)
    and `snap().edits` is unchanged. Positive control, same segment: the same call with `editorId: 'u3'` returns
    `outcome 'inserted'`, the query now returns exactly one id, equal to `result.servedVersionId`, and `SELECT id
    FROM segment_edits WHERE segment_id = 'm91001:para:e'` is `[{ id: result.editId }]` (so the mint would have
    inserted a row, and the null above is the rollback's).
  - `it('an unknown origin is a programming error')` — `origin: 'typo'` throws `TypeError`, nothing written.

- [ ] **Step 2: Run them**

Run: `npx vitest run server/__tests__/editOrigins.test.js server/__tests__/servedEdit.test.js`
Expected: FAIL — `Cannot find module '../lib/editOrigins'` and `'../services/servedEdit'`.

- [ ] **Step 3: Implement**

`server/lib/editOrigins.js`: the two frozen arrays; header citing spec §5.10 and that `propagation` (today's
repetition route) and `propagated` (B3's term pass) must never be merged.

`server/services/servedEdit.js` (header: the only way to write a `segment_edits` row on a served base, spec §5.6;
the route, re-attach by content and any script call it; none calls `saveSegmentEdit` directly for a study book):

```js
const segmentParser = require('./segmentParser');
const segmentEditor = require('./segmentEditorService');
const servedVersions = require('./servedVersions');
const segmentValidation = require('../public/js/segment-validation');
const { sha256Text, isNotMintedBook } = require('../lib/servedText');
const { EDIT_ORIGINS } = require('../lib/editOrigins');

// Icelandic: proposals for [USER]'s check (index decision 13), except STRUCTURE_BLOCKED (moved verbatim from the
// route) and SEGMENT_NOT_FOUND (today's 404 body).
const REFUSAL_MESSAGES = Object.freeze({
  BOOK_NOT_MINTED: 'Þessi bók er ekki í þýðingu og ekki er tekið við breytingum á henni.',
  NO_LAYER: 'Engin íslensk útgáfa er til af þessari einingu, svo ekki er hægt að vista á hana.',
  SEGMENT_NOT_FOUND: 'segment not found',
  DUPLICATE_ID:
    'Auðkenni þessa bútar kemur oftar en einu sinni fyrir í einingunni og ekki er hægt að vista á hann ' +
    'fyrr en það hefur verið lagað.',
  BASE_MISSING: 'Síðan var hlaðin fyrir uppfærslu ritilsins. Endurhlaðið síðuna (F5) og vistið aftur.',
  STALE_BASE:
    'Grunntexti bútsins hefur breyst frá því að síðan var hlaðin. Vistun hafnað: endurhlaðið eininguna og ' +
    'gerið breytinguna aftur.',
  STALE_DISPLAYED:
    'Breytingin sem sýnd var í bútnum hefur breyst eða verið fjarlægð frá því að síðan var hlaðin. ' +
    'Vistun hafnað: endurhlaðið eininguna.',
  STRUCTURE_BLOCKED: 'Vistun hafnað: byggingarmerki vantar eða hafa breyst.',
});
const REFUSAL_STATUS = Object.freeze({
  BOOK_NOT_MINTED: 409, NO_LAYER: 409, DUPLICATE_ID: 409, BASE_MISSING: 409, STALE_BASE: 409,
  STALE_DISPLAYED: 409, SEGMENT_NOT_FOUND: 404, STRUCTURE_BLOCKED: 400,
});

function refuse(code, { echoedSha256 = null, currentSha256 = null, violations } = {}) {
  const err = new Error(REFUSAL_MESSAGES[code]);
  err.code = code;
  err.refusal = { code, echoedSha256, currentSha256 }; // PR3's write-refused event: reason and both hashes, no text
  if (violations) err.violations = violations;
  return err;
}

/** Steps 1–3 of spec §5.6, shared by the save, the accept route and nothing else in PR1. */
function placeOnServedBase({ book, chapter, moduleId, segmentId, occurrence }) {
  if (isNotMintedBook(book)) throw refuse('BOOK_NOT_MINTED');
  const data = segmentParser.loadModuleForEditing(book, chapter, moduleId);
  if (!data.isSource) throw refuse('NO_LAYER');
  const { occurrences, duplicated } = servedVersions.countOccurrences(data.segments);
  const at = data.segments.findIndex((s) => s.segmentId === segmentId);
  if (at < 0) throw refuse('SEGMENT_NOT_FOUND');
  if (duplicated.has(segmentId)) throw refuse('DUPLICATE_ID'); // until G1.12 (b), occurrence is unknowable
  if (occurrence !== undefined && occurrence !== null && occurrence !== occurrences[at]) {
    throw refuse('SEGMENT_NOT_FOUND');
  }
  return { data, seg: data.segments[at], occurrence: occurrences[at], duplicatedIds: [...duplicated].sort() };
}

function saveOnServedBase(input) {
  const {
    book, chapter, moduleId, segmentId, occurrence, editedContent, category, editorNote, editorId,
    editorUsername, baseEditId, origin, requireEcho, baseSha256, displayedEditId = null,
    displayedEditSha256 = null,
  } = input;
  if (!EDIT_ORIGINS.includes(origin)) {
    throw new TypeError(`saveOnServedBase: origin must be one of ${EDIT_ORIGINS.join(', ')}`);
  }
  if (typeof requireEcho !== 'boolean') throw new TypeError('saveOnServedBase: requireEcho must be a boolean');
  if (typeof editedContent !== 'string') throw new TypeError('saveOnServedBase: editedContent must be a string');

  const { data, seg, occurrence: placed } = placeOnServedBase({ book, chapter, moduleId, segmentId, occurrence });
  const currentSha256 = sha256Text(seg.is);

  if (requireEcho) {
    if (typeof baseSha256 !== 'string' || baseSha256 === '') throw refuse('BASE_MISSING', { currentSha256 });
    if (baseSha256 !== currentSha256) {
      throw refuse('STALE_BASE', { echoedSha256: baseSha256, currentSha256 });
    }
    if (displayedEditId !== null) {
      const shown = segmentEditor.getEditById(displayedEditId);
      const here = shown && shown.book === book && shown.module_id === moduleId && shown.segment_id === segmentId;
      const shownSha256 = here ? sha256Text(shown.edited_content) : null;
      if (shownSha256 === null || shownSha256 !== displayedEditSha256) {
        throw refuse('STALE_DISPLAYED', { echoedSha256: displayedEditSha256, currentSha256: shownSha256 });
      }
    }
  }

  if (editedContent !== seg.is) {
    // The marker backstop, against the SERVER-loaded base, for every caller (spec §5.6 step 5; moved from
    // routes/segment-editor.js, index decision 16). An identity save skips it: text equal to the base cannot add
    // corruption, even where the base itself would fail an EN-derived rule.
    const structure = segmentValidation.validateStructure(seg.en, seg.is, editedContent);
    if (structure.blocked) throw refuse('STRUCTURE_BLOCKED', { violations: structure.blocked });
  }

  const displayed =
    requireEcho && displayedEditId !== null
      ? { editId: displayedEditId, sha256: displayedEditSha256 }
      : { editId: null, sha256: null };
  const conn = segmentEditor.getDb();
  return conn.transaction(() => {
    const [servedVersionId] = servedVersions.mintVersions(conn, [
      servedVersions.buildVersionRow({
        book, chapter, moduleId, segmentId, occurrence: placed, en: seg.en, is: seg.is, layer: data.isSource,
      }),
    ]);
    const r = segmentEditor.saveSegmentEdit({
      book, chapter, moduleId, segmentId, originalContent: seg.is, editedContent, category, editorNote,
      editorId, editorUsername, baseEditId, servedVersionId, occurrence: placed, origin,
      displayedEditId: displayed.editId, displayedEditSha256: displayed.sha256,
    });
    let outcome = r.updated ? 'updated' : 'inserted';
    if (r.reverted) outcome = r.id === null ? 'unchanged' : 'withdrawn';
    const kept = outcome === 'inserted' || outcome === 'updated';
    return {
      outcome,
      editId: r.id === null ? null : Number(r.id),
      servedVersionId,
      occurrence: placed,
      baseSha256: currentSha256,
      layer: data.isSource,
      editedContentSha256: kept ? sha256Text(editedContent) : null,
      displayed,
    };
  })();
}

module.exports = { REFUSAL_MESSAGES, REFUSAL_STATUS, placeOnServedBase, saveOnServedBase };
```

- [ ] **Step 4: Run them**

Run: `npx vitest run server/__tests__/editOrigins.test.js server/__tests__/servedEdit.test.js server/__tests__/structuralBackstopWiring.test.js`,
then `npx vitest run server/__tests__/originalContentReaders.test.js`
Expected: PASS (the wiring pin still finds the route's own call; it moves in Task 14). Run the audit once before
adding `servedEdit.js` to `AUDITED_READERS`: it fails, naming `server/services/servedEdit.js` (the audit's own red
arm on a real file); after the addition it passes.

- [ ] **Step 5: Commit**

```bash
git add server/lib/editOrigins.js server/services/servedEdit.js \
  server/__tests__/editOrigins.test.js server/__tests__/servedEdit.test.js \
  server/__tests__/originalContentReaders.test.js
git commit -m "feat(server): saveOnServedBase refuses a stale, missing, duplicated or organic base (G1.1)"
```

---

### Task 14: the save route requires the echo, and every test that posts `/edit` sends it

Spec §5.6 (Save; "a missing hash is refused, never skipped"), §5.18 ("the save response returns the row's baseSha256
and its displayed pair"), §13a ("a required field, the client that sends it and the tests that post it" ship
together), §9 G-5; T3 (the relabel save), T4 (PR1 half: the route, and end to end in E2E: the stored
`original_content` is the server's base), T18 (PR1 half: organic save, route); index decision 16 (the pin moves here);
decisions 14, 15, 20, 33, 38.

**One commit.** This task joins the server's save-route change and the client draft's E2E body task: the route makes
`baseSha256` required, so `segmentEditBackstop.test.js`'s bodies, the E2E picker and every E2E direct poster change in
the same commit. Task 9 (the page sends the hash) is already on the branch; Task 6 (the module GET carries it) before
it. `segment-editor.spec.js:408` posts `/propagate`, which needs no hash.

**Files:**
- Modify: `server/routes/segment-editor.js` — require `servedEdit`; delete `const segmentValidation =
  require('../public/js/segment-validation');` (`:42`, ed10180c: its only use, `:406`, is inside the backstop block
  this task deletes, so it would be left unused and `no-unused-vars` is an error for `server/**/*.js`,
  `eslint.config.js:40`); a route-local `sendRefusal(res, err)`; the `/edit` handler (`:338-489`): body
  (`:345-363`), `checkEditConflict` stays first (`:370-376`), the backstop block (`:378-417`) and the
  `saveSegmentEdit` call (`:419-431`) are replaced by `saveOnServedBase`, the QA condition (`:449`), the response
  (`:474-480`), the catch (`:481-488`)
- Modify: `server/__tests__/structuralBackstopWiring.test.js` — `describe('server enforcement sites')`, its first `it`
  (`:16-20`)
- Modify: `server/__tests__/segmentEditBackstop.test.js` — `invoke`, `beforeAll`, the synthetic fixture (a third
  segment `mSYN01:para:fs-id3`), cases 1–4, a new case 7 in the synthetic `describe`, header
- Modify: `server/e2e/helpers/segments.js` — `chooseSegment` (option `requireBaseSha256`, return field `baseSha256`,
  the typedef at `:61-67`), `pickEditableSegment` (`:128-140`)
- Modify: `server/e2e/concurrent-editing.spec.js` (`:119-134`), `server/e2e/review-cycle.spec.js` (`:52-74`),
  `server/e2e/editor-workflow.spec.js` (`:69-76`), `server/e2e/ux-phase2.spec.js` (`:129-136`),
  `server/e2e/segment-editor.spec.js` (`:350-362`)
- Test: `server/__tests__/servedSaveRoute.test.js` (new); `server/__tests__/e2eSegmentPicker.test.js` — the `seg`
  helper (`:25`), a new `describe`, one test in the `pickEditableSegment` describe (`:207-267`)

**Interfaces:**
- Consumes: `servedEdit.saveOnServedBase`, `REFUSAL_STATUS`, `REFUSAL_MESSAGES` (Task 13); the module GET's
  `seg.baseSha256` (Task 6).
- Produces:
  - `POST /api/segment-editor/:book/:chapter/:moduleId/edit` reads `baseSha256`, `displayedEditId`,
    `displayedEditSha256`; ignores `originalContent` and the research-only fields; refusals as decision 20; success adds
    `baseSha256`, `displayedEditId`, `displayedEditSha256` (decision 15). `SEGMENT_CONFLICT` keeps `{ error: 'conflict',
    message }`; the structural 400 keeps `{ error, violations }`; an unknown segment keeps 404 `{ error: 'segment not
    found' }`.
  - `chooseSegment(segments, {suffix, exclude?, requireBaseSha256?})` → `{segmentId, en, originalContent,
    editedContent, baseSha256}`; `pickEditableSegment` always passes `requireBaseSha256: true`.

- [ ] **Step 1: Re-grep G-5, both sides** (spec §9 G-5)

Run: `grep -rlnaE "moduleId/edit'|/:book/:chapter/:moduleId/edit" server/__tests__ scripts/__tests__ tools/__tests__`
Expected at ed10180c: `server/__tests__/segmentEditBackstop.test.js` only. `acceptanceRoutes.test.js` drives `/accept`
(Task 15); `saveSegmentEdit`'s direct callers keep its signature (Task 12). Any other name: add it to this task.

Run: `grep -anE "segment-editor/.*/edit|/edit['\`]|API\}/edit|M5_API\}/edit" server/e2e/*.js`
Expected: the list in "Before Task 1". The direct posters edited below are `concurrent-editing.spec.js:127`,
`editor-workflow.spec.js:69`, `review-cycle.spec.js:60`, `segment-editor.spec.js:353` and `ux-phase2.spec.js:129`;
`editor-lifecycle.spec.js:157`, `:206` are intercepts that ride the client (Task 9); `rbac.spec.js:18-36`'s review posts
are refused before any body is read. If the grep finds another direct poster, it gets the same edit.

- [ ] **Step 2: Write the failing unit tests**

`segmentEditBackstop.test.js`:
- `invoke(req, h = handler)`; in `beforeAll` also `getHandler` for `'/:book/:chapter/:moduleId'` GET.
- `async function servedBase(book, chapter, moduleId, segmentId)` — invokes `getHandler` with `{ params: { book,
  chapter: String(chapter), moduleId }, chapterNum: chapter, user: { id: 'u-test', username: 'prufa', role: 'editor',
  books: [book] } }` and returns that segment's `baseSha256`: the echo comes from a module load, as the page's does.
- Cases 1, 2, 3 and 4 add `baseSha256: await servedBase(…)` to their body (cases 1 and 2 reach the backstop only
  with it, case 3 reaches the identity skip, case 4 saves). Case 5 (unknown id → 404 at placement, before the hash)
  and case 6 (`checkEditConflict` first → 409 `conflict`) are unchanged: they reach their refusal first.
- The synthetic fixture (`describe('POST /edit — blocked structural violations (synthetic marker fixture)')`,
  `:112-287`) gains a third segment, `SYN_SEGMENT_ID_3 = 'mSYN01:para:fs-id3'`, EN `Plain text three.`, IS `Venjulegur
  texti þrjú.` (no marker, so the backstop passes), written into both files in its `beforeAll` and its rows deleted
  in its `afterAll` beside the other two. It lives under the describe's temp root, so a save there writes no lock
  under `books/` (Global Constraints (PR1)); the real-fixture `describe` is left as it is.
- New `it('case 7: a save with no baseSha256 is refused 409 BASE_MISSING, never let through (spec §5.6)')`, in the
  synthetic `describe`, on `SYN_SEGMENT_ID_3`: `rowsFor = () => SELECT * FROM segment_edits WHERE segment_id = ?
  ORDER BY id` (a second connection, as `countRows` does); without `baseSha256` → status 409, `body.error ===
  'BASE_MISSING'`, `body.message` matches `/F5/`, and `rowsFor()` after equals `rowsFor()` before (values, not a
  count, spec §10); then the same body with `baseSha256: await servedBase(SYN_BOOK, 1, SYN_MODULE,
  SYN_SEGMENT_ID_3)` → 200, and `rowsFor()` is exactly one row whose `edited_content` is the body's (the control).
- Header: the bodies now carry `baseSha256` from a module load (G1.1); `originalContent` is still posted by cases 1–3
  but ignored, so case 2 now proves the server never reads it.

`structuralBackstopWiring.test.js`, the first `it` becomes two:
- `it('the save path guards through servedEdit (index decision 16)')` — `read('services/servedEdit.js')` matches
  `/segmentValidation\.validateStructure\(/` and `/Vistun hafnað: byggingarmerki vantar eða hafa breyst\./`.
- `it('the segment-editor save route delegates to saveOnServedBase')` — `read('routes/segment-editor.js')` matches
  `/servedEdit\.saveOnServedBase\(/`.

`server/__tests__/servedSaveRoute.test.js` (temp DB, temp books root, `edit` and `get` handlers from
`servedFixture.handlerFor`): fixture `efnafraedi-2e/ch01/m93001` (MT layer, segments `a`, `b`, `d` twice), `m93002`
(EN only), `lifraen-efnafraedi/ch01/m93004`. **`beforeEach`: rewrite every fixture module from its literal
(`writeModule`, and remove any `03-faithful-translation` copy the relabel test made), then run `DELETE FROM
segment_acceptances; DELETE FROM segment_edits;`** (the precedent is `acceptanceRoutes.test.js:93-98`). The tests
share one database and one books root, and vitest runs them in declaration order: without the reset, the STALE_BASE
test's rewrite of `a`'s IS makes the later `original_content === 'IS a'` and withdraw (`editedContent: 'IS a'`)
assertions false, and editor 2's rows on `a` change what later tests' `checkEditConflict` sees. Leave
`served_text_versions` alone: its rows are referenced through a live foreign key, and every test compares version
id sets before and after rather than assuming an empty table.
- `it('STALE_BASE: the base file changed after the page loaded')` — GET; rewrite `a`'s IS; POST with the GET's hash →
  409 `{ error: 'STALE_BASE', message: REFUSAL_MESSAGES.STALE_BASE }`; no row.
- `it('STALE_DISPLAYED where checkEditConflict passes')` — editor 2 saves on `a` (route); editor 1 GETs (displayed
  pair = `edits[a][0].id`, `.contentSha256`); editor 2 re-saves new text (same id); editor 1 posts with
  `baseEditId` = that id, the displayed pair and the current hash → 409 `STALE_DISPLAYED`.
- `it('the stored original_content is the server’s base, whatever the client posts')` — POST with `originalContent:
  'RANGT'` and the right hash → the row's `original_content === 'IS a'`.
- `it('the success response carries what the next save echoes')` — an insert answers `baseSha256 ===` the GET's,
  `displayedEditId === body.editId`, `displayedEditSha256 === sha256Text(editedContent)`; a following withdraw
  (`editedContent: 'IS a'`) answers `displayedEditId: null, displayedEditSha256: null`, `updated: true`.
- `it('T3: a relabel with identical bytes does not refuse')` — GET (`isSource 'mt-output'`, hash H); copy the MT file
  byte-for-byte to `03-faithful-translation`; POST on `b` with H → 200; the row's `served_version_id` names a version
  with `layer 'faithful'` and `is_sha256 === H`.
- `it('DUPLICATE_ID and NO_LAYER answer 409; nothing is written')` — `m93001:para:d` and a segment of `m93002`.
- `it('T18: an organic save answers 409 BOOK_NOT_MINTED even with a correct hash')` — the hash is
  `sha256Text(loaded is)`; no `segment_edits` row and no version for `lifraen-efnafraedi`; control in the same test: a
  chemistry save with its hash answers 200.
- `it('rejects a displayed pair of the wrong type with 400')` — `displayedEditId: '12'` → 400.

`server/__tests__/e2eSegmentPicker.test.js`, replace the `seg` helper (`:25`) with:

```js
/** The module GET sends a served hash per non-duplicated segment (spec §5.4 step 6). */
const sha = (id) => require('crypto').createHash('sha256').update(id).digest('hex');
/** Minimal segment in the shape the module GET emits. */
const seg = (id, en, is, baseSha256 = sha(id)) => ({ segmentId: id, en, is, baseSha256 });
```

Add after the first `describe`:

```js
describe('chooseSegment — the served hash a save must echo (G1.1, spec §5.6, G-5)', () => {
  it("returns the picked segment's own baseSha256", () => {
    const picked = chooseSegment(PLAIN, { suffix: ' [e2e-1]' });
    const source = PLAIN.find((s) => s.segmentId === picked.segmentId);
    expect(picked.baseSha256).toBe(source.baseSha256);
    // Control: every other segment carries a different hash, so the line above can fail.
    expect(
      PLAIN.filter((s) => s.segmentId !== picked.segmentId).map((s) => s.baseSha256)
    ).not.toContain(picked.baseSha256);
  });

  it('with requireBaseSha256, skips a segment the route served without one', () => {
    const mixed = [
      seg('m:a:0', 'first', 'fyrsti'),
      { segmentId: 'm:dup:1', en: 'served twice', is: 'tvisvar' }, // no hash: a duplicated id
      seg('m:b:2', 'safe', 'öruggt'),
      seg('m:c:3', 'last', 'síðasti'),
    ];
    expect(chooseSegment(mixed, { suffix: ' [e2e-1]', requireBaseSha256: true }).segmentId).toBe(
      'm:b:2'
    );
    // Control: without the option the hashless segment is the first candidate.
    expect(chooseSegment(mixed, { suffix: ' [e2e-1]' }).segmentId).toBe('m:dup:1');
  });
});
```

In the `pickEditableSegment …` describe, add:

```js
  it('requires a served hash: a module whose segments carry none yields no pick', async () => {
    const hashless = PLAIN.map((s) => ({ segmentId: s.segmentId, en: s.en, is: s.is }));
    await expect(
      pickEditableSegment(fakeRequest(200, { segments: hashless }), {
        book: '__e2e-fixture__',
        chapter: 1,
        moduleId: 'm68664',
        suffix: ' [e2e-1]',
      })
    ).rejects.toThrow(/no append-safe segment/i);
    // Control: the same module with hashes yields one (the existing test below).
  });
```

(`require` is already in scope in that file, `e2eSegmentPicker.test.js:18-22`.)

- [ ] **Step 3: Run the unit tests and confirm they fail**

Run: `npx vitest run server/__tests__/segmentEditBackstop.test.js server/__tests__/structuralBackstopWiring.test.js server/__tests__/servedSaveRoute.test.js`
Expected: FAIL — case 7 answers 200 (the route ignores the missing hash); the delegation pin finds no
`servedEdit.saveOnServedBase(`; the route tests get 200 where 409 is expected, and the success response lacks
`baseSha256`. Cases 1–6 pass (the extra body field is ignored today).

Run: `npx vitest run server/__tests__/e2eSegmentPicker.test.js`
Expected: FAIL — `expected undefined to be '<hex>'` (`chooseSegment` returns no `baseSha256`, `segments.js:112-117`);
`requireBaseSha256` is ignored, so the first pick is `m:dup:1`; the hashless module still yields a pick, so the
`rejects` assertion fails. The other tests pass (the rot detector's loader output has no hashes and passes no option).

- [ ] **Step 4: Implement the route**

Require `const servedEdit = require('../services/servedEdit');`. Add, near `notifyDecision`:

```js
// G1.1 refusals (servedEdit.REFUSAL_STATUS). Keeps today's shapes for the 404 and the structural 400.
function sendRefusal(res, err) {
  if (!err.refusal || !servedEdit.REFUSAL_STATUS[err.code]) return false;
  if (err.code === 'SEGMENT_NOT_FOUND') res.status(404).json({ error: 'segment not found' });
  else if (err.code === 'STRUCTURE_BLOCKED') res.status(400).json({ error: err.message, violations: err.violations });
  else res.status(servedEdit.REFUSAL_STATUS[err.code]).json({ error: err.code, message: err.message });
  return true;
}
```

The `/edit` handler: destructure `{ segmentId, editedContent, category, editorNote, baseEditId, baseSha256,
displayedEditId, displayedEditSha256 }` (comment: *`originalContent` is no longer read: the server stores its own base,
spec §5.6 step 6; old pages still send it*); replace the `editedContent` presence check with `typeof editedContent !==
'string'` → 400 `editedContent is required`; add the two type checks of decision 14. Keep `checkEditConflict` first, then:

```js
      const saved = servedEdit.saveOnServedBase({
        book: req.params.book,
        chapter: req.chapterNum,
        moduleId: req.params.moduleId,
        segmentId,
        editedContent,
        category,
        editorNote,
        editorId: String(req.user.id),
        editorUsername: req.user.username,
        baseEditId: resolvedBaseEditId,
        origin: 'editor-save',
        requireEcho: true,
        baseSha256: typeof baseSha256 === 'string' ? baseSha256 : undefined,
        displayedEditId: displayedEditId ?? null,
        displayedEditSha256: displayedEditSha256 ?? null,
      });
      const kept = saved.outcome === 'inserted' || saved.outcome === 'updated';
```

Delete the backstop block and its comment (the comment's content moved to `servedEdit.js`), and delete `const
segmentValidation = require('../public/js/segment-validation');` (`:42`): its only use (`:406`) is now
`servedEdit.js`'s, and the moved `structuralBackstopWiring` pin no longer reads it from the route, so nothing keeps
the require alive and `npm run lint` would fail on it. The activity log is unchanged. The QA condition becomes `if (kept && editedContent)`. The response:

```js
      res.json({
        success: true,
        editId: saved.editId,
        updated: saved.outcome === 'updated' || saved.outcome === 'withdrawn',
        termWarnings,
        qaFindings,
        baseSha256: saved.baseSha256,
        displayedEditId: kept ? saved.editId : null,
        displayedEditSha256: kept ? saved.editedContentSha256 : null,
      });
```

The catch: `SEGMENT_CONFLICT` first (unchanged), then `if (sendRefusal(res, err)) return;`, then `if
(err.message?.includes('not found')) return res.status(404).json({ error: err.message });` (a missing module, as
today's backstop load did at `:397-400`), then the 500.

Run: `npx vitest run server/__tests__/segmentEditBackstop.test.js server/__tests__/structuralBackstopWiring.test.js server/__tests__/servedSaveRoute.test.js`
Expected: PASS.

- [ ] **Step 5: See the E2E direct posters fail against the new route**

Run, with Step 4 applied: `( cd server && CI=1 npx playwright test --config=e2e/playwright.config.js
concurrent-editing.spec.js review-cycle.spec.js editor-workflow.spec.js ux-phase2.spec.js segment-editor.spec.js )`
Expected: FAIL — each direct post answers `409` where `200`/`ok` is expected: the body carries no `baseSha256`, so the
server answers `BASE_MISSING` (§5.6 step 4). The serial suites (`review-cycle`, `editor-workflow`) also fail every
test after the first.

- [ ] **Step 6: Implement the E2E bodies and the picker**

`server/e2e/helpers/segments.js`: destructure `const { suffix, exclude = [], requireBaseSha256 = false } = options;`;
add `&& (!requireBaseSha256 || /^[0-9a-f]{64}$/.test(segment.baseSha256 || ''))` to the candidate predicate; add
`${requireBaseSha256 ? '; a served baseSha256 is required' : ''}` to the error message after the exclude clause; add
`baseSha256: candidate.baseSha256,` to the returned object; add `@property {string|undefined} baseSha256 The served
hash — send it as baseSha256 (G1.1, spec §5.6).` to the typedef and `requireBaseSha256` to the options doc; in
`pickEditableSegment`, `return chooseSegment(data.segments, { suffix, exclude, requireBaseSha256: true });` (it reads
the route, which sends the hash).

`server/e2e/concurrent-editing.spec.js`: after `expect(seg).toBeTruthy();` (`:120`) add
`expect(seg.baseSha256).toMatch(/^[0-9a-f]{64}$/); // G1.1: the save echoes it (§5.6)`, and add
`baseSha256: seg.baseSha256,` to the post's `data` (`:128-133`).

`server/e2e/review-cycle.spec.js`, test `editor saves a segment edit`: before the existing post (`:59`) insert the one
`BASE_MISSING` case G-5 keeps, with the existing save as its positive control on the same segment:

```js
    // G-5: a body without the served hash (an old page's) is refused, and writes nothing.
    const oldPage = await page.request.post(`${API}/${BOOK}/${CHAPTER}/${MODULE}/edit`, {
      data: { segmentId, originalContent, editedContent, category: 'terminology' },
    });
    expect(oldPage.status()).toBe(409);
    expect((await oldPage.json()).error).toBe('BASE_MISSING');
    expect(seg.baseSha256).toMatch(/^[0-9a-f]{64}$/);
```

add `baseSha256: seg.baseSha256,` to the existing post's `data`, and after `expect(editData.editId).toBeTruthy();`:
`expect(editData.updated).toBe(false); // an insert: the refused post above wrote no row to update`.

`server/e2e/editor-workflow.spec.js` (`:70-75`) and `server/e2e/ux-phase2.spec.js` (`:130-135`): add
`baseSha256: picked.baseSha256,` to each post's `data`.

`server/e2e/segment-editor.spec.js`, test `O-crit …`: before `// Step 1:` (`:352`) take the hash from a module GET,
since this test posts with no prior load:

```js
    const modRes = await page.request.get('/api/segment-editor/efnafraedi-2e/1/m68664');
    expect(modRes.ok()).toBe(true);
    const source = (await modRes.json()).segments.find(
      (s) => s.segmentId === 'm68664:abstract:auto-2'
    );
    expect(source?.baseSha256).toMatch(/^[0-9a-f]{64}$/);
```

add `baseSha256: source.baseSha256,` to the post's `data` (keep `originalContent: ''`), and after
`expect(editRes.ok(), …).toBe(true);`:

```js
    // T4 end to end: the client's originalContent ('') is ignored; the server stores its own base (§5.6 step 6).
    const saved = (await (await page.request.get('/api/segment-editor/efnafraedi-2e/1/m68664')).json())
      .edits['m68664:abstract:auto-2'].find((e) => e.edited_content === uniqueText);
    expect(saved.original_content).toBe(source.is);
```

- [ ] **Step 7: Run everything this commit touches, then the gate**

Run: `npx vitest run server/__tests__/segmentEditBackstop.test.js server/__tests__/structuralBackstopWiring.test.js server/__tests__/servedSaveRoute.test.js`, then `npx vitest run server/__tests__/e2eSegmentPicker.test.js`
Expected: PASS, every test in each file.

Run: `( cd server && CI=1 npx playwright test --config=e2e/playwright.config.js concurrent-editing.spec.js
review-cycle.spec.js editor-workflow.spec.js ux-phase2.spec.js segment-editor.spec.js )`, then the whole job, `( cd
server && CI=1 npm run test:e2e )`
Expected: PASS, every test (the browser-driven saves ride Task 9's client, which already sends the hash).

Then `npm test` (diff the failing set by name against `main`'s; expected no new names), `npm run lint`,
`npm run format:check` and `npm run docs:check` (expected clean, decision 19).

- [ ] **Step 8: Commit**

```bash
git add server/routes/segment-editor.js server/__tests__/structuralBackstopWiring.test.js \
  server/__tests__/segmentEditBackstop.test.js server/__tests__/servedSaveRoute.test.js \
  server/__tests__/e2eSegmentPicker.test.js server/e2e/helpers/segments.js \
  server/e2e/concurrent-editing.spec.js server/e2e/review-cycle.spec.js \
  server/e2e/editor-workflow.spec.js server/e2e/ux-phase2.spec.js server/e2e/segment-editor.spec.js
git commit -m "feat(server): POST /edit requires the served base hash and refuses a stale one (G1.1)"
```

---

### Task 15: the accept route places, mints and records the served version

Spec §5.6 (Accept), §5.7, §5.8 (acceptance columns, no origin), §5.19 (the MT lock); T4 (PR1 half: the value check
after a re-render), T5 (PR1 half: accept), T18 (PR1 half: organic accept), T21; decision 12.

**Files:**
- Modify: `server/services/acceptanceService.js` — require `servedVersions`; `acceptSegment` (`:79-225`, ed10180c):
  the optional `occurrence`, and the INSERT (`:171-192`) inside a transaction that mints first
- Modify: `server/routes/segment-editor.js` — the `/accept` handler (`:871-934`): `placeOnServedBase` before
  `acceptSegment` (`:890-898`), `occurrence` passed, `sendRefusal` first in the catch (`:913`)
- Test: `server/__tests__/servedAcceptRoute.test.js` (new), `server/__tests__/mtLockFreezeMarker.test.js` (new, T21)

**Interfaces:**
- Consumes: `servedEdit.placeOnServedBase` (Task 13), `servedVersions.buildVersionRow`, `mintVersions` (Task 5).
- Produces: `acceptSegment({ book, chapter, moduleId, segmentId, acceptedContent, userId, username, occurrence? })` →
  unchanged `{ alreadyAccepted, acceptance }`; with `occurrence` an integer, the new row carries `served_version_id`
  and `occurrence`; without it, NULLs (its direct callers). `POST …/accept` accepts and ignores `acceptOrigin`.

- [ ] **Step 1: Write the failing tests**

`server/__tests__/servedAcceptRoute.test.js` (temp DB, temp books root; `accept` and `get` handlers): fixture
`efnafraedi-2e/ch01/m94001` (MT; `a`, `b`, `d` twice), `m94002` (EN only), `lifraen-efnafraedi/ch01/m94004`, and
**copies** of the two known duplicated-id modules (`fs.copyFileSync` of the `ch05/m68726` and `ch08/m68747`
`02-for-mt` and `02-mt-output` pairs into the temp root, as Task 13 does; nothing reads or writes `books/` but the
copy). **`beforeEach`: rewrite every fixture module from its literal (`writeModule`) and run `DELETE FROM
segment_acceptances; DELETE FROM segment_edits;`** (`acceptanceRoutes.test.js:93-98`). Without it the order the tests
are declared in breaks two green arms: the T5 control accepts `b`, so the later T4 control's accept of `b`'s new
`is` returns `alreadyAccepted` with the old row (`acceptanceService.js:161-168`; a file rewrite lapses nothing),
whose version names the old `is_text`. Leave `served_text_versions` alone (a live foreign key references it; the
tests compare version id sets before and after).
- `it('stores the served version and occurrence; acceptOrigin is accepted and ignored')` — POST `{ segmentId: a,
  acceptedContent: 'IS a', acceptOrigin: 'keyboard-stream' }` → 200; the acceptance row's `served_version_id` names a
  version with `is_text 'IS a'`, `layer 'mt-output'`, `occurrence 0`; the row's `occurrence` is 0; the response holds no
  `acceptOrigin` key at any depth.
- `it('alreadyAccepted writes nothing')` — accept `a` twice: the second answers `alreadyAccepted: true`; `SELECT * FROM
  segment_acceptances ORDER BY id` and `SELECT id FROM served_text_versions ORDER BY id` are equal before and after it.
- `it('T5: a duplicated id is refused before the existing-acceptance lookup')` — raw-insert an active acceptance on
  `m94001:para:d`; POST on `d` → 409 `DUPLICATE_ID` (without placement first it would be 200 `alreadyAccepted`,
  `acceptanceService.js:161-168`); no new row; control: `b` accepts with 200.
- `it('T5 on the two known ids: the accept is refused, per occurrence, and writes nothing (spec T5)')` — for
  `ch05/m68726` and `m68726:para:fs-idm94618544`, and `ch08/m68747` and `m68747:para:fs-idm99049568`: GET the module
  (chapter 5, then 8); the two served occurrences of the id carry the same `is` (compare the values) and no
  `baseSha256`, while the two raw copies' `content` in the copied `02-mt-output` file
  (`segmentParser.parseSegments`) differ, so the comparison can fail; POST `{ segmentId: <id>, acceptedContent:
  <that served is> }` (the value check would pass) → 409 `{ error: 'DUPLICATE_ID' }`; `SELECT * FROM
  segment_acceptances ORDER BY id` and `SELECT id FROM served_text_versions ORDER BY id` equal before and after, and
  `SELECT * FROM segment_acceptances WHERE segment_id = ?` and `SELECT * FROM served_text_versions WHERE segment_id
  = ?` are `[]`. Control, same modules: `m68726:title:auto-1` (a non-duplicated sibling) accepts with its served `is`
  → 200, and its acceptance row names a version whose `is_text` is that `is`.
- `it('NO_LAYER and T18 BOOK_NOT_MINTED answer 409 and write nothing')` — `m94002`; and `m94004` with
  `acceptedContent` equal to its served `is` (the correct value); no acceptance row and no version for
  `lifraen-efnafraedi`; control: the chemistry accept above.
- `it('T4: after a declined re-render the old value is refused by the value check')` — GET; rewrite `b`'s IS; POST with
  the old `is` → 409 `STALE_CONTENT`; the acceptance and version id sets are unchanged by the POST; control: POST with
  the new `is` → 200, its version's `is_text` is the new text.
- `it('a direct legacy call still writes NULLs')` — `acceptanceService.acceptSegment` without `occurrence` → the row's
  `served_version_id` and `occurrence` are `null`.

`server/__tests__/mtLockFreezeMarker.test.js` (T21): a temp books root holding `efnafraedi-2e` (the study book's
slug) with modules `m95001`–`m95004`, each EN + MT; `m95001` and `m95003` also hold
`02-mt-output/ch01/<m>-segments.locked` with `{"reason":"freeze","freezeCommit":"<40 zeros>"}`. `tree()` maps every
file under the root (relative path) to the sha256 of its bytes.
- `it('with a freeze marker, the first save leaves every file under books/ unchanged')` — `tree()` before, a first
  `saveOnServedBase` on `m95001` (`requireEcho: false, origin: 're-attach'`), `tree()` after: equal.
- `it('with a freeze marker, the first accept leaves every file under books/ unchanged')` — route accept on `m95003`.
- `it('control: without the marker, the first save writes exactly the marker')` — on `m95002`: the after-map minus the
  before-map is exactly `{ 'efnafraedi-2e/02-mt-output/ch01/m95002-segments.locked': <any> }`, and no other key
  changed.
- `it('control: without the marker, the first accept writes exactly the marker')` — `m95004`, same shape.

- [ ] **Step 2: Run them**

Run: `npx vitest run server/__tests__/servedAcceptRoute.test.js server/__tests__/mtLockFreezeMarker.test.js`
Expected: FAIL — `served_version_id` is `null` (no mint); the duplicated id answers 200 `alreadyAccepted`; on the two
known ids the accept answers 200 and writes an acceptance (no placement refuses it today); the organic and layerless
accepts answer 200 and 400 (`NO_TRANSLATION`). The T21 cases PASS already (`writeMtLock` is a
no-op once a marker exists, `tools/lib/mt-lock.cjs:26-28`): they are pins that this task's transaction must not
break, and their controls prove the tree snapshot sees a write.

- [ ] **Step 3: Implement**

`acceptanceService.js`: `const servedVersions = require('./servedVersions');`. `acceptSegment` destructures
`occurrence`; after the `existing` lookup (`:161-170`), the INSERT becomes:

```js
  const mint = Number.isInteger(occurrence);
  let insertResult;
  try {
    // spec §5.6 Accept: the served version is minted from the segment compared above, in one transaction
    // with the INSERT, so an alreadyAccepted result or a lost race (below) writes nothing.
    insertResult = conn.transaction(() => {
      const servedVersionId = mint
        ? servedVersions.mintVersions(conn, [
            servedVersions.buildVersionRow({
              book, chapter, moduleId, segmentId, occurrence, en: seg.en, is: seg.is, layer: data.isSource,
            }),
          ])[0]
        : null;
      return conn
        .prepare(
          `INSERT INTO segment_acceptances
             (book, chapter, module_id, segment_id, accepted_content, accepted_by, accepted_by_username,
              served_version_id, occurrence)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(book, chapter, moduleId, segmentId, acceptedContent, String(userId), username,
          servedVersionId, mint ? occurrence : null);
    })();
  } catch (err) {
    // …unchanged race handling (:180-192)…
  }
```

The route: inside the `try`, before `acceptSegment`:

```js
      // spec §5.6 Accept: steps 1–3 first, so a duplicated id is refused before acceptSegment's existing lookup
      // would return the first copy's row as alreadyAccepted. acceptOrigin is the research event's (PR3).
      const placed = servedEdit.placeOnServedBase({
        book: req.params.book, chapter: req.chapterNum, moduleId: req.params.moduleId, segmentId,
      });
```

and pass `occurrence: placed.occurrence` to `acceptSegment`. The catch begins `if (sendRefusal(res, err)) return;`.

- [ ] **Step 4: Run them**

Run: `npx vitest run server/__tests__/servedAcceptRoute.test.js server/__tests__/mtLockFreezeMarker.test.js`, then one
at a time `server/__tests__/acceptanceRoutes.test.js`, `acceptanceService.test.js`, `acceptanceApply.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/services/acceptanceService.js server/routes/segment-editor.js \
  server/__tests__/servedAcceptRoute.test.js server/__tests__/mtLockFreezeMarker.test.js
git commit -m "feat(server): an MT accept records its served version; duplicated ids and organic are refused (G1.1)"
```

---

### Task 16: propagation mints each target's base and stamps its origin

Spec §5.6 (Propagation targets), §5.7, §5.8 (the re-save rule on the in-place UPDATE); T16 (PR1 half: target rows),
T5 (PR1 half: the skip), T18 (PR1 half: organic propagation); decisions 7, 13.

**Files:**
- Modify: `server/services/propagationService.js` — `classifyOccurrence` (`:39-57`, ed10180c), `createPropagatedEdits`
  (`:65-165`: the guard, the classifier call `:103-107`, the INSERT `:86-91` and its run `:148-158`, the UPDATE
  `:92-96` and its run `:144`), `findOccurrences` (`:189-219`)
- Modify: `server/routes/segment-editor.js` — the `/propagate` handler (`:1477-1524`): an organic refusal after the
  body checks (`:1487-1498`)
- Modify: `server/__tests__/propagationService.test.js` — every occurrence literal passed to `createPropagatedEdits`
  gains `en`, `layer: 'mt-output'` and `occurrence: 0` (the `describe` blocks at `:90`, `:229`, `:298`, `:355`;
  simplest through a local `occ(over)` helper), plus the new cases below
- Test: `server/__tests__/servedPropagation.test.js` (new)

**Interfaces:**
- Consumes: `servedVersions.countOccurrences`, `buildVersionRow`, `mintVersions` (Task 5); `isNotMintedBook` (Task 1);
  `REFUSAL_MESSAGES.BOOK_NOT_MINTED` (Task 13).
- Produces:
  - `findOccurrences(book, enNorm, opts)` entries gain `occurrence: number`, `duplicated: boolean`, `layer: string |
    null` (beside `chapter, moduleId, segmentId, en, currentIs, existingEdit`).
  - `classifyOccurrence` may return `'duplicate-id'` or `'no-layer'`.
  - `createPropagatedEdits` → `{ created: [{ moduleId, segmentId, superseded? }], skipped: [{ moduleId, segmentId,
    reason, occurrence? }] }` (`occurrence` only on `'duplicate-id'`); throws before any write on an occurrence
    without a string `en`, a defined `layer` or an integer `occurrence`.
  - `POST …/propagate` → 409 `{ error: 'BOOK_NOT_MINTED', message }` for organic.

- [ ] **Step 1: Write the failing tests**

In `propagationService.test.js` (each `freshDb()` already runs `migration053.up(d)`, Task 3):
- `describe('classifyOccurrence: the G1.1 skips')` — `{ duplicated: true, currentIs: '', existingEdit: <own pending>,
  editorId: '42' }` → `'duplicate-id'` (before the self-supersede rule); `{ layer: null, currentIs: '', existingEdit:
  null }` → `'no-layer'`; control: the existing cases (no `duplicated`, no `layer`) keep their verdicts.
- `it('T16: an inserted target carries origin, the target’s loaded base and its served version')` — occurrence `{
  chapter: 1, moduleId: 'm030', segmentId: 'm030:para:a', en: 'Acid.', currentIs: 'Sýra.', layer: 'mt-output',
  occurrence: 0 }`: the row's `original_content 'Sýra.'`, `origin 'propagation'`, `occurrence 0`, and its
  `served_version_id` names a version whose `en_text 'Acid.'`, `is_text 'Sýra.'`, `layer 'mt-output'`, `module_id
  'm030'`.
- `it('T16: the in-place update of the propagator’s own pending row moves the base and clears the displayed pair')` —
  seed editor 42's pending row on `m031:para:b` with `original_content 'gamalt'`, `displayed_edit_id 5`; occurrence
  with `currentIs: 'nýtt grunn'`: one row, `original_content 'nýtt grunn'`, `origin 'propagation'`, non-null
  `served_version_id` (its version's `is_text 'nýtt grunn'`), displayed pair `[null, null]`.
- `it('T5: a duplicated target is skipped and listed with its occurrence; nothing is written for it')` — two
  occurrences of `m032:para:d` (`duplicated: true`, occurrences 0 and 1) plus a plain `m033:para:e`: `skipped`
  equals `[{ moduleId: 'm032', segmentId: 'm032:para:d', reason: 'duplicate-id', occurrence: 0 }, { …, occurrence: 1
  }]`; no row and no version for `m032`; control: `m033` is created with its version.
- `it('a layerless target is skipped as no-layer')` — `layer: null` → `skipped[0].reason === 'no-layer'`, no row.
- `it('refuses before any write when an occurrence lacks en, layer or occurrence')` — each of the three omissions
  throws `/createPropagatedEdits:/`, and `segment_edits` stays empty.
- `it('findOccurrences reports occurrence, duplicated and layer')` — temp books root through
  `segmentParser._setTestBooksDir`, a module whose `d` occurs twice with the same EN: both entries returned, with
  occurrences 0 and 1 and `duplicated: true`; a single-copy match has `duplicated: false`; `layer 'mt-output'`.

`server/__tests__/servedPropagation.test.js` (route; temp DB and books root, `propagate` handler):
- `it('T18: an organic propagation answers 409 BOOK_NOT_MINTED and writes nothing')` — no `segment_edits` row, no
  version; control in the same test: the same request on an `efnafraedi-2e` fixture answers 200 with `created`
  non-empty.
- `it('a duplicated target in the book is listed as skipped, with its occurrence; a plain target is created from its
  own loaded text')` — source module `m96001:para:s` (`EN: 'Recurring.'`), target modules `m96002` (`t` once, same EN)
  and `m96003` (`u` twice, same EN): `skipped` holds the two `m96003` entries with `reason 'duplicate-id'`; the
  `m96002` row's `original_content` equals that module's served `is` and its version's `is_text` the same.

- [ ] **Step 2: Run them**

Run: `npx vitest run server/__tests__/propagationService.test.js` then `npx vitest run server/__tests__/servedPropagation.test.js`
Expected: FAIL — `classifyOccurrence` returns `'eligible'` where `'duplicate-id'` / `'no-layer'` is expected; the
inserted row's `origin` and `served_version_id` are `null`; the in-place update keeps `original_content 'gamalt'`;
the omission cases do not throw; `findOccurrences` entries lack `occurrence`; the organic propagation answers 200.

- [ ] **Step 3: Implement**

`classifyOccurrence`, first lines:

```js
  if (occ.duplicated) return 'duplicate-id'; // R4: the target cannot be placed until G1.12
  if (occ.layer === null) return 'no-layer'; // spec §5.2: no layer, no served version, no write
```

`createPropagatedEdits`, the classifier call (`:103-107`): the object it builds gains `duplicated: occ.duplicated` and
`layer: occ.layer`, beside `currentIs`, `editorId` and `existingEdit` (decision 13). That call builds a fresh object,
unlike `propagation-preview`, which spreads `...o` (`routes/segment-editor.js:1457-1460`), so without these two keys
the new skips never fire on the write path and the T5 case below fails.

`createPropagatedEdits`: after the `sourceEn` guard, refuse any occurrence with `typeof occ.en !== 'string' ||
occ.layer === undefined || !Number.isInteger(occ.occurrence)` (`throw new Error('createPropagatedEdits: occurrence
<moduleId>/<segmentId> lacks en, layer or occurrence — the served version cannot be minted')`). The skip push adds
`occurrence` when `verdict === 'duplicate-id'`. The INSERT adds `served_version_id, occurrence, origin`; the UPDATE
becomes `SET edited_content = ?, category = ?, editor_note = ?, created_at = CURRENT_TIMESTAMP, original_content = ?,
served_version_id = ?, occurrence = ?, origin = 'propagation', displayed_edit_id = NULL, displayed_edit_sha256 =
NULL`. Inside the transaction, after `supersedeForEdit` and before the UPDATE or INSERT:

```js
      // spec §5.6: a target was never served to the propagator, so its base is minted from the text the server
      // loaded for it (findOccurrences), and both writes carry it.
      const [servedVersionId] = servedVersions.mintVersions(conn, [
        servedVersions.buildVersionRow({
          book, chapter: occ.chapter, moduleId: occ.moduleId, segmentId: occ.segmentId,
          occurrence: occ.occurrence, en: occ.en, is: occ.currentIs, layer: occ.layer,
        }),
      ]);
```

`update.run(propagatedText, category || null, note || null, occ.currentIs, servedVersionId, occ.occurrence,
existingEdit.id)`; `insert.run(…, occ.currentIs, propagatedText, …, editorUsername, servedVersionId, occ.occurrence,
'propagation')` (the INSERT's `original_content` was `occ.currentIs || ''`; `currentIs` is already `seg.is || ''`).

`findOccurrences`: per module, `const { occurrences, duplicated } = servedVersions.countOccurrences(data.segments);`,
iterate with the index, and push `occurrence: occurrences[i], duplicated: duplicated.has(seg.segmentId), layer:
data.isSource` with the existing fields.

The route, after the category check:

```js
      if (isNotMintedBook(req.params.book)) {
        return res.status(409).json({
          error: 'BOOK_NOT_MINTED',
          message: servedEdit.REFUSAL_MESSAGES.BOOK_NOT_MINTED,
        });
      }
```

(require `isNotMintedBook` beside `sha256Text`). The `sourceEn: sourceSeg?.en` line stays
(`structuralBackstopWiring.test.js:34-37`).

- [ ] **Step 4: Run them**

Run: `npx vitest run server/__tests__/propagationService.test.js`, `npx vitest run server/__tests__/servedPropagation.test.js`, `npx vitest run server/__tests__/structuralBackstopWiring.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/services/propagationService.js server/routes/segment-editor.js \
  server/__tests__/propagationService.test.js server/__tests__/servedPropagation.test.js
git commit -m "feat(server): propagation mints each target's base, stamps its origin, skips duplicated ids (G1.1)"
```

---

### Task 17: the id-based re-attach script refuses the study book

Spec §5.6 (writers with no client view: "it is retired, or refuses the study book"), §8 (10-10 4.2 row); index
decision 7; decision 16.

**Files:**
- Modify: `scripts/reattach-segment-edits.js` — a top-level require of `server/lib/researchScope.js` (beside `:35`,
  ed10180c), an exported `refuseStudyBook(snapshotOrRows)`, called first in `planReattach` (`:58`) and in
  `applyReattach` (`:175`); the CLI block (`:263-323`) wraps `planReattach` and maps `STUDY_BOOK` to exit 6; the header
  (`:2-15`) names the refusal and exit 6
- Modify: root `LICENSE` — the class 2(a) entry for `scripts/reattach-segment-edits.js` (`LICENSE:120-123`)
- Test: `scripts/__tests__/reattachSegmentEdits.test.mjs`, `scripts/__tests__/reattachSegmentEditsCli.test.mjs`,
  `scripts/__tests__/reattachSegmentEditsWrite.test.mjs` (one refusal case each, with its control)

**Interfaces:**
- Consumes: `isStudyBook(book)` (Task 2).
- Produces: `refuseStudyBook({ book, edits } | rows[])` throws `Error` with `code === 'STUDY_BOOK'`; the CLI exits 6.

- [ ] **Step 1: Write the failing tests**

- `reattachSegmentEdits.test.mjs`, `describe('planReattach refuses the study book (index decision 7)')`:
  - `planReattach({ snapshot: { ...snapshotWith([edit()]), book: 'efnafraedi-2e' }, booksDir })` throws with `code
    === 'STUDY_BOOK'` and a message naming `researchScope.js`; so does a `testbook` snapshot whose one row has
    `book: 'efnafraedi-2e'`.
  - control, same fixture: the `testbook` snapshot plans with `restore` of length 1.
- `reattachSegmentEditsCli.test.mjs`, `it('exits 6 on the study book, in a dry run, before planning and before any
  database')` — a snapshot with `book: 'efnafraedi-2e'` and its row's `book` the same: `status === 6`; `stdout` does
  not contain `=== C16 segment-edit re-attach ===` (no plan printed); `stderr` contains `STUDY_BOOK`;
  `fs.existsSync(path.join(tmp, 'nope'))` is false. Control: the existing `exits 0 when every row matched`.
- `reattachSegmentEditsWrite.test.mjs`, `it('applyReattach refuses a plan holding a study-book row and writes
  nothing')` — a hand-built `{ restore: [{ row: { ...snapshot.edits[0], book: 'efnafraedi-2e' }, newMt: 'x',
  editorNote: null, flags: [] }] }` throws `STUDY_BOOK`; `db.prepare('SELECT * FROM segment_edits ORDER BY id').all()`
  after the call equals the same query taken before it (`[]` on this file's fresh per-test database; values, not a
  count, spec §10). Control: the existing `writes the restored edit as PENDING`.

- [ ] **Step 2: Run them**

Run: `npx vitest run scripts/__tests__/reattachSegmentEdits.test.mjs`, then `…Cli.test.mjs`, then `…Write.test.mjs`
Expected: FAIL — `planReattach` returns a plan (no throw); the CLI exits 1 or 2 (the study book's module is absent
from the temp tree) and prints the plan; `applyReattach` writes a row.

- [ ] **Step 3: Implement**

```js
// The study book's edits are written only through servedEdit.saveOnServedBase, which records the served base
// each edit was made on (spec §5.6). This script matches by id and calls saveSegmentEdit directly, so it refuses
// the study book, in a dry run too, before planning (index decision 7). Re-attach by content (10-10 plan 4.2) is
// the route for that book.
const { isStudyBook } = require(path.join(REPO_ROOT, 'server', 'lib', 'researchScope.js'));

export function refuseStudyBook(snapshotOrRows) {
  const rows = Array.isArray(snapshotOrRows) ? snapshotOrRows : snapshotOrRows.edits || [];
  const books = [...new Set([snapshotOrRows.book, ...rows.map((r) => r.book)].filter(Boolean))];
  const study = books.filter((b) => isStudyBook(b));
  if (study.length) {
    throw Object.assign(
      new Error(
        `STUDY_BOOK: REFUSING — ${study.join(', ')} is in the research study (server/lib/researchScope.js). ` +
          'Its segment edits are written only through servedEdit.saveOnServedBase, which records the served ' +
          'base; this id-based script cannot. Use re-attach by content (10-10 plan 4.2).'
      ),
      { code: 'STUDY_BOOK' }
    );
  }
}
```

`planReattach`: first line `refuseStudyBook(snapshot);`. `applyReattach`: first line
`refuseStudyBook(plan.restore.map((item) => item.row));`. The CLI:

```js
  let plan = null;
  try {
    plan = planReattach({ snapshot, booksDir });
  } catch (err) {
    if (err.code !== 'STUDY_BOOK') throw err;
    console.error(err.message);
    process.exitCode = 6; // never process.exit() with output in flight (CLAUDE.md § Commands)
  }
  if (plan) {
    // …the existing block from console.log(formatReport(plan)) on, unchanged…
  }
```

Header: add exit 6 to the codes the runbook gates on.

`LICENSE`, the entry becomes (re-derive each line number after editing, with `grep -n "'server'" scripts/reattach-segment-edits.js`):

```
>    - `scripts/reattach-segment-edits.js:35` → `server/lib/chapterLabel.js` and
>      `:<N>` → `server/lib/researchScope.js` (also `:<M>` → `server/services/segmentParser.js`
>      and `:<K>` → `server/services/segmentEditorService.js`, both lazy — but `:35` already
>      makes the file load-time)
```

- [ ] **Step 4: Run them**

Run: `npx vitest run scripts/__tests__/reattachSegmentEdits.test.mjs`, `…Cli.test.mjs`, `…Write.test.mjs`,
`scripts/__tests__/segmentEditReattachRules.test.mjs`; then `npm run lint`, `npm run format:check`, `npm run docs:check`
(expected clean, decision 19)
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/reattach-segment-edits.js LICENSE scripts/__tests__/reattachSegmentEdits.test.mjs \
  scripts/__tests__/reattachSegmentEditsCli.test.mjs scripts/__tests__/reattachSegmentEditsWrite.test.mjs
git commit -m "feat(scripts): the id-based re-attach refuses the study book, in a dry run too (G1.1)"
```

---

### Task 18: drafts keep each segment's base, occurrence and assists; a legacy draft restores as `{legacy: true}`

Spec: §5.18 rows 3 and 4, §5.10 (`draft-restore` is an item type; a restored draft keeps its text), index decision 12
(the draft format changes once, index decision 4). **T23**, its "a legacy bare-text draft restores with `{legacy:
true}`" half, in the browser.

**Files:**
- Modify: `server/public/js/segment-editor.js` — `saveDraft` (`:84-100`), `restoreDraft` (`:111-140`), new
  `writeDraft`, `installDraft`, `draftValuesUnder`.
- Test: `server/__tests__/servedBaseClientPins.test.js` (one `describe`); `server/e2e/editor-lifecycle.spec.js` Test 6
  (`:253-284`) and Test 7 (`:289-350`).

**Interfaces:**
- Consumes: `segmentSaveState.draftEntry`, `.buildDraftValue`, `.mergeDraftValues`, `.restoredAssists`,
  `.mergeRestoreSources` (Task 8); `paneState`, `freshPaneState` (Task 10).
- Produces: `writeDraft(entries)`; `installDraft(segmentId, entry, {addRestoreItem}) → boolean` (Task 19 extends it).

- [ ] **Step 1: Write the failing tests**

Append to `server/__tests__/servedBaseClientPins.test.js`:

```js
describe('drafts are version 2 and a restore re-installs assists (§5.18)', () => {
  it('saveDraft writes through buildDraftValue with the pane\'s base and assists', () => {
    const save = fnBody('saveDraft', 'clearDraft');
    expect(save).toContain('segmentSaveState.draftEntry(');
    expect(save).toMatch(/writeDraft\(/);
    expect(src).toContain('segmentSaveState.buildDraftValue(');
  });

  it('restoreDraft reads every draft under the prefix, parses either format, and installs through installDraft', () => {
    const restore = fnBody('restoreDraft', 'installDraft');
    expect(restore).toContain('draftValuesUnder(prefix)'); // not only findNewestDraft: Review Focus 24
    expect(restore).toContain('segmentSaveState.mergeDraftValues(');
    expect(restore).toMatch(/installDraft\([^)]*addRestoreItem: true/);
    expect(src).toContain('segmentSaveState.restoredAssists(');
  });
});
```

`editor-lifecycle.spec.js` Test 6: after `expect(hasDraft).toBe(true);` add:

```js
    // §5.18: version 2, keeping the base the text was typed on, plus the mirror a pre-deploy page reads.
    const segId = await page
      .locator('#segments-body tr')
      .filter({ has: page.locator('.edit-panel.active') })
      .first()
      .getAttribute('data-segment-id');
    const rowBase = await page
      .locator(`#segments-body tr[data-segment-id="${segId}"]`)
      .getAttribute('data-base-sha256');
    const stored = await page.evaluate(() => {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('seg-draft:')) return JSON.parse(localStorage.getItem(key));
      }
      return null;
    });
    expect(rowBase).toMatch(/^[0-9a-f]{64}$/);
    expect(stored.v).toBe(2);
    expect(stored.segments[segId].text).toBe(draftMarker);
    expect(stored.segments[segId].baseSha256).toBe(rowBase);
    expect(stored.drafts[segId]).toBe(draftMarker);
```

Test 7 becomes the legacy-draft case. Replace its body from `// Inject a fake draft` (`:292`) to the end with:

```js
    // Today's format, as a page loaded before the G1.1 deploy wrote it (§5.18), on the
    // first row's REAL id (data-segment-id; no reversing of cssId).
    const draftMarker = `RECOVERY-TEST-${Date.now()}`;
    const segId = await page.locator('#segments-body tr').first().getAttribute('data-segment-id');
    expect(segId).toBeTruthy();
    await page.evaluate(
      ({ book, chapter, mid, sid, marker }) => {
        localStorage.setItem(
          `seg-draft:${book}/${chapter}/${mid}:fake-e2e-tab`,
          JSON.stringify({ ts: Date.now(), drafts: { [sid]: marker } })
        );
      },
      { book: BOOK, chapter: CHAPTER, mid: moduleId, sid: segId, marker: draftMarker }
    );
    // Accept the recovery confirm and any validation prompt; DECLINE closePanels. restoreDraft runs inside
    // loadModule before its background loads (segment-editor.js:286, :296-297), and each of those re-renders and
    // asks closePanels while the restored pane is dirty: accepting it would close the pane before Vista is clicked.
    page.on('dialog', (d) =>
      d.message().startsWith('Opnum klippispjöldum') ? d.dismiss() : d.accept()
    ); // UI.confirm.closePanels, ui-strings.js:50

    // Back to the selector and into the module again (unchanged from today's Test 7).
    await page.locator('#btn-back').click();
    await expect(page.locator('#module-selector')).toBeVisible({ timeout: 5000 });
    await page.locator('#book-select').selectOption(BOOK);
    const chapterSelect = page.locator('#chapter-select');
    await expect(chapterSelect).toBeEnabled({ timeout: 5000 });
    await chapterSelect.selectOption(CHAPTER);
    const targetCard = page.locator(`.module-card[title^="${MODULE}"]`).first();
    const moduleCard = (await targetCard.count()) > 0 ? targetCard : page.locator('.module-card').first();
    await expect(moduleCard).toBeVisible({ timeout: 10000 });
    await moduleCard.click();
    await expect(page.locator('#editor-container')).toBeVisible({ timeout: 10000 });

    // The legacy draft is restored into that segment's pane, unconditionally.
    const panel = page.locator(`#segments-body tr[data-segment-id="${segId}"] .edit-panel.active`);
    await expect(panel).toHaveCount(1);
    await expect(panel.locator('textarea')).toHaveValue(draftMarker);

    // The next save carries the restore as an unverified, legacy, whole-text item. Stubbed: nothing written. The
    // route is AWAITED before the click, so the POST cannot reach the real server first.
    let resolvePosted;
    const posted = new Promise((r) => (resolvePosted = r));
    await page.route(
      '**/edit',
      async (route) => {
        resolvePosted(route.request().postDataJSON());
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true, editId: 1, updated: true, termWarnings: [], qaFindings: [] }),
        });
      },
      { times: 1 }
    );
    await panel.locator('button.btn-primary').click();
    expect((await posted).assists).toEqual([
      {
        itemType: 'draft-restore',
        source: null,
        clientTimeMs: expect.any(Number),
        claim: 'unverified',
        detail: { legacy: true, text: draftMarker },
      },
    ]);
```

(This drops today's "If no panels opened … that's OK" escape hatch, `:341-349`, which let the test pass with no
restore at all.)

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `npx vitest run server/__tests__/servedBaseClientPins.test.js`
Expected: FAIL — the new `describe`: `saveDraft` writes `{ ts, drafts }` directly (`:95`) and `restoreDraft` reads
`draft.drafts` (`:120`).

Run: `( cd server && CI=1 npx playwright test --config=e2e/playwright.config.js editor-lifecycle.spec.js )`
Expected: FAIL — Test 6 at `expect(stored.v).toBe(2)` (`undefined`); Test 7 at the `assists` assertion (`[]`: today's
restore opens the pane through Task 10's `openEditPanel`, which starts an empty list, and records nothing). It gets
that far only because its handler declines `closePanels`; with an accept-everything handler the background
re-renders would close the restored pane and the test would fail, or flake, at the click instead. Tests 1–5, 8 and 9
pass.

- [ ] **Step 3: Implement**

Replace `saveDraft` (`:84-100`) with:

```js
  function writeDraft(entries) {
    try {
      localStorage.setItem(
        draftKey(),
        JSON.stringify(segmentSaveState.buildDraftValue(entries, Date.now()))
      );
    } catch {
      if (typeof saveRetry !== 'undefined')
        saveRetry.showToast(UI.common.localStorageFull, 'error');
    }
  }

  /** §5.18: per segment the text, the base it was started from, its occurrence and its assists. */
  function saveDraft() {
    if (!currentModuleId) return;
    const entries = {};
    for (const segId of dirtyEdits) {
      const ta = document.getElementById('textarea-' + cssId(segId));
      if (!ta) continue;
      const st = paneState.get(segId) || freshPaneState(segId);
      entries[segId] = segmentSaveState.draftEntry({
        text: ta.value,
        baseSha256: st.baseSha256,
        occurrence: st.occurrence,
        assists: st.assists,
        refused: st.refused,
      });
    }
    if (Object.keys(entries).length === 0) {
      localStorage.removeItem(draftKey());
      return;
    }
    writeDraft(entries);
  }
```

Add, before `restoreDraft`:

```js
  /** Every parseable draft value stored under `prefix`, in storage order (mergeDraftValues orders them by ts). */
  function draftValuesUnder(prefix) {
    const out = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || !k.startsWith(prefix)) continue;
      try {
        out.push(JSON.parse(localStorage.getItem(k)));
      } catch {
        // a corrupt entry holds nothing usable; clearDraftsByPrefix removes it with the rest
      }
    }
    return out;
  }
```

Add `installDraft` after `restoreDraft`:

```js
  /**
   * Put a draft entry into its pane. `addRestoreItem`: the text came back from
   * storage, so its assists are re-installed BEFORE a draft-restore item
   * (§5.18). Returns false when the row is not on screen (filtered out).
   */
  function installDraft(segId, entry, { addRestoreItem }) {
    if (!rowElement(segId)) return false;
    openEditPanel(segId);
    const ta = document.getElementById('textarea-' + cssId(segId));
    if (!ta) return false;
    ta.value = entry.text;
    const row = rowValues(segId);
    paneState.set(segId, {
      baseSha256: entry.baseSha256, // the base it was typed on; null when unknown (legacy)
      occurrence: entry.occurrence !== null ? entry.occurrence : row ? row.occurrence : null,
      assists: addRestoreItem
        ? segmentSaveState.restoredAssists(entry, Date.now())
        : entry.assists.slice(),
      refused: entry.refused || null,
    });
    dirtyEdits.add(segId);
    const previewEl = document.getElementById('preview-' + cssId(segId));
    if (previewEl) previewEl.innerHTML = renderMarkdownPreview(ta.value);
    refreshBackdrop(segId);
    return true;
  }
```

Replace `restoreDraft` (`:111-140`) with:

```js
  function restoreDraft() {
    const prefix = draftPrefix();
    // EVERY tab's draft for this module, not only tabGuard.findNewestDraft's: a kept text can sit in an older
    // tab's key (an F5 gives the page a new tabId), and clearDraftsByPrefix below removes them all (plan decision 31).
    const values = draftValuesUnder(prefix);
    const found = values.length > 0;
    const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000; // tabGuard's own window
    const fromStorage = segmentSaveState.mergeDraftValues(
      values.filter((v) => v && typeof v.ts === 'number' && v.ts >= weekAgo)
    );
    const entries = segmentSaveState.mergeRestoreSources(fromStorage, []);
    // A pane already open holds its text on screen (a declined re-render): leave it.
    const ids = Object.keys(entries).filter((id) => !paneState.has(id));
    if (!found) return;
    tabGuard.clearDraftsByPrefix(prefix);
    if (ids.length > 0 && confirm(UI.confirm.draftRecovery(ids.length))) {
      for (const segId of ids) installDraft(segId, entries[segId], { addRestoreItem: true });
    }
    updateSaveStatusBar();
    saveDraft(); // the restored panes are dirty: persist them under this tab's key now
  }
```

(Task 19 splits `ids` into kept and other texts; Task 20 passes the parked replays as the second argument of
`mergeRestoreSources`.)

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `npx vitest run server/__tests__/servedBaseClientPins.test.js`, `npx vitest run
server/__tests__/segmentSaveState.test.js`, `npx vitest run server/__tests__/clientJsSyntax.test.js`
Expected: PASS, every test in each file.

Run: `( cd server && CI=1 npx playwright test --config=e2e/playwright.config.js editor-lifecycle.spec.js
served-base-client.spec.js )`
Expected: PASS, every test in both files. `npx eslint` and `npx prettier --check` on the touched files: no problems.

- [ ] **Step 5: Commit**

```bash
git add server/public/js/segment-editor.js server/__tests__/servedBaseClientPins.test.js \
  server/e2e/editor-lifecycle.spec.js
git commit -m "feat(segment-editor): version-2 drafts keep base, occurrence and assists; legacy drafts restore as legacy"
```

---

### Task 19: a refused save keeps the typed text, its base and its assists, and the pane says why

Spec: index decision 12 (all of it, but the replay half: Task 20), index decision 13 (the Icelandic, as proposals),
§5.18 rows 5 and 6 and "Old pages after a deploy", §5.6 (`STALE_BASE`, `STALE_DISPLAYED`, `BASE_MISSING`,
`BOOK_NOT_MINTED`, the no-layer refusal), §5.7 and R4 (`DUPLICATE_ID`: never sent), §13 (the refused-save
experience). **T23**, its "a draft keeps its base and its assists through a refused save and a restore, and the next
save lists both the earlier insert and `draft-restore`" half, with a real (not stubbed) next save as the positive
control.

**Files:**
- Modify: `server/public/js/segment-editor.js` — new state `heldDrafts` (a `Map`), new `DRAFT_NOTICE_TEXT`,
  `keptPaneEntries`, `keptEntries`, `keepText`, `reinstallHeldDrafts`, `showDraftNotice`, `setSaveBlocked`,
  `confirmDiscardKept`, `refusalAlertText`; `saveDraft`, `clearDraft` (`:102-104`), `restoreDraft`, `installDraft`,
  `renderSegments` (`:1197-1270`), `saveEdit` (a guard and the 409 branch, `:2061-2065`), `propagateSegment`
  (`:2091`; a guard before the save and one after it, `:2095-2097`), `closeEditPanel`, `revertEdit`, `clearPaneState`, the Back handler (`:2228-2230`), the `beforeunload`
  (`:3457-3463`) and `auth-expired`
  (`:3466-3468`) handlers.
- Modify: `server/public/js/ui-strings.js` — new groups `refusal` and `draftNotice`.
- Modify: `server/views/segment-editor.html` — a `.draft-notice` rule after `.accept-context-hint` (`:819-824`).
- Test: `server/__tests__/servedBaseClientPins.test.js`, `server/__tests__/ui-strings.test.js`,
  `server/e2e/served-base-client.spec.js`.

**Interfaces:**
- Consumes: `segmentSaveState.keepsText`, `.refusedEntry`, `.noticeFor`, `.NOTICE_CODES` (Task 8); `err.code` from
  `saveRetry` (Task 7); `paneState`, `installDraft`, `writeDraft` (Tasks 10, 18); the server's refusals `409 {error,
  message}` for `STALE_BASE` (real in E2E) and the others (stubbed in E2E, decision 37).
- Produces: `heldDrafts: Map<segId, {entry, addRestoreItem: boolean}>`; `keepText(segmentId, entry)` (Task 20 calls
  it); the pane notice `.draft-notice[data-notice=<NOTICE_CODES member>]`.

- [ ] **Step 1: Write the failing tests**

Append to `server/__tests__/servedBaseClientPins.test.js`:

```js
describe('a refused save keeps the text (index decision 12)', () => {
  it('saveEdit keeps the text on a kept code and never sends a DUPLICATE_ID pane', () => {
    const save = fnBody('saveEdit', 'latestEditIdForSegment');
    expect(save).toMatch(/segmentSaveState\.keepsText\(err\.code\)/);
    expect(save).toMatch(/keepText\(\s*segmentId,\s*segmentSaveState\.refusedEntry\(/);
    expect(save).toMatch(/refused === 'DUPLICATE_ID'[\s\S]*return;/);
  });

  it('every notice a restored pane can show has its own wording key', () => {
    const require = createRequire(import.meta.url);
    const { NOTICE_CODES } = require('../public/js/segment-save-state');
    for (const code of NOTICE_CODES) expect(src).toMatch(new RegExp(`${code}: UI\\.draftNotice\\.\\w+`));
  });

  it('the Back button keeps kept texts, and a re-render carries them', () => {
    expect(fnBody('clearDraft', 'startDraftTimer')).toContain('keptEntries()');
    expect(fnBody('renderSegments', 'baselineTextFor')).toContain('reinstallHeldDrafts()');
  });

  it('a refused save is never propagated: the guard sits between the save and the preview (decision 32)', () => {
    expect(fnBody('propagateSegment', 'reviewEdit')).toMatch(
      /await saveEdit\(segmentId\)[\s\S]*heldDrafts\.has\(segmentId\)[\s\S]*return;[\s\S]*propagation-preview/
    );
  });
});
```

(Add `import { createRequire } from 'module';` to that file's imports.)

Append to `server/__tests__/ui-strings.test.js`:

```js
describe('refused-save strings (G1.1 §5.18; index decisions 12–13; the wording is a proposal)', () => {
  const source = readFileSync(join(publicJs, 'ui-strings.js'), 'utf-8');
  const UI = new Function(`${source}; return UI;`)();

  it('BASE_MISSING tells the editor to reload the page with F5', () => {
    expect(UI.refusal.baseMissing).toContain('F5');
  });

  it('every notice and the kept-text line are non-empty Icelandic strings', () => {
    for (const v of [UI.refusal.textKept, UI.refusal.generic, ...Object.values(UI.draftNotice)]) {
      expect(typeof v).toBe('string');
      expect(v.length).toBeGreaterThan(10);
    }
  });
});
```

Append to `server/e2e/served-base-client.spec.js`'s `describe`:

```js
  test('a stale-base refusal keeps the text, its base, its insert and its wrap; the next save lists them and draft-restore (T23)', async ({
    page,
  }) => {
    const [target] = middleVirginRows(await loadModuleJson(page), { plain: true });
    // T23 "the next save lists both the earlier insert and draft-restore": a repetition insert, stubbed as Task 10's
    // test does (the fixture holds no applied twin). It is a WHOLE-TEXT item, so its detail.text is what a refusal,
    // the draft and the restore could lose (§5.10, §14 call 18).
    const suggestion = { is_text: `${target.is} g11-rep`, book: 'efnafraedi-2e', chapter: 3, module_id: 'm68000' };
    await page.route(`**${MODULE_URL}/repetitions`, (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ repetitions: [{ segmentId: target.segmentId, suggestion }] }),
      })
    );
    await rewriteFirstServe(page, target.segmentId, (s) => {
      s.baseSha256 = FAKE_SHA; // the page holds a base the server no longer serves
    });
    await openModule(page);
    const row = rowOf(page, target.segmentId);
    await row.getByRole('button', { name: 'Nota þessa þýðingu' }).click(); // repetition-insert, tm; opens the pane
    const ta = row.locator('textarea');
    await expect(ta).toHaveValue(suggestion.is_text);
    await ta.evaluate((el) => el.setSelectionRange(0, 3));
    await row.locator('.format-toolbar .tb-bold').click();
    await ta.press('End');
    await ta.pressSequentially(SUFFIX);
    const typed = await ta.inputValue();
    const alerts = [];
    page.on('dialog', async (d) => {
      alerts.push(d.message());
      await d.accept();
    });
    const refused = page.waitForResponse((r) => r.url().endsWith(`${MODULE_URL}/edit`));
    await row.getByRole('button', { name: 'Vista', exact: true }).click();
    const res = await refused;
    expect(res.status()).toBe(409);
    expect((await res.json()).error).toBe('STALE_BASE'); // the real server (§5.6 step 4)

    // After the reload: the pane is back with the text and the notice, on the newly served base.
    await expect(row.locator('.draft-notice[data-notice="STALE_BASE"]')).toBeVisible();
    await expect(row.locator('textarea')).toHaveValue(typed);
    await expect(row).toHaveAttribute('data-base-sha256', target.baseSha256);
    expect(alerts.some((m) => m.includes('geymdur'))).toBe(true);
    const stored = await page.evaluate((id) => {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('seg-draft:')) {
          const v = JSON.parse(localStorage.getItem(key));
          if (v.segments && v.segments[id]) return v.segments[id];
        }
      }
      return null;
    }, target.segmentId);
    expect(stored.baseSha256).toBe(FAKE_SHA); // the base it was typed on
    expect(stored.refused).toBe('STALE_BASE');
    expect(stored.assists.map((a) => a.itemType)).toEqual(['repetition-insert', 'markup-wrap', 'draft-restore']);
    expect(stored.assists[0].detail.text).toBe(suggestion.is_text); // the whole text survives the draft
    expect((await loadModuleJson(page)).edits[target.segmentId]).toBeUndefined(); // refused: nothing written

    // Positive control, REAL: the next save goes out on the new base, listing the wrap and the restore, and lands.
    const posted = page.waitForRequest(
      (r) => r.url().endsWith(`${MODULE_URL}/edit`) && r.method() === 'POST'
    );
    const saved = page.waitForResponse((r) => r.url().endsWith(`${MODULE_URL}/edit`));
    await row.getByRole('button', { name: 'Vista', exact: true }).click();
    const body = (await posted).postDataJSON();
    expect(body.baseSha256).toBe(target.baseSha256);
    expect(body.assists.map((a) => [a.itemType, a.source])).toEqual([
      ['repetition-insert', 'tm'],
      ['markup-wrap', 'toolbar'],
      ['draft-restore', null],
    ]);
    // The insert's whole text came through the refusal, the draft and the restore unchanged.
    expect(body.assists[0].detail).toEqual({
      text: suggestion.is_text,
      book: 'efnafraedi-2e',
      chapter: 3,
      moduleId: 'm68000',
    });
    expect(body.assists[2].detail).toEqual({ text: typed });
    const ok = await saved;
    expect(ok.status()).toBe(200);
    const edit = (await loadModuleJson(page)).edits[target.segmentId].find(
      (e) => e.edited_content === typed
    );
    expect(edit.original_content).toBe(target.is); // the server's base (§5.6 step 6)
    await page.request.delete(`/api/segment-editor/edit/${edit.id}`); // best effort, as editor-lifecycle Test 9
  });

  test('a DUPLICATE_ID refusal keeps the text with its notice, and the pane never sends it (R4, §5.7)', async ({
    page,
  }) => {
    const [target] = middleVirginRows(await loadModuleJson(page));
    await openModule(page);
    const row = rowOf(page, target.segmentId);
    await row.locator('.btn-edit').click();
    const text = `${target.is}${SUFFIX}`;
    await row.locator('textarea').fill(text);
    const posts = [];
    await page.route(`**${MODULE_URL}/edit`, async (route) => {
      posts.push(route.request().postDataJSON());
      await route.fulfill({
        status: 409,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'DUPLICATE_ID', message: 'stub' }),
      });
    });
    const acceptAll = (d) => d.accept();
    page.on('dialog', acceptAll);
    await row.getByRole('button', { name: 'Vista', exact: true }).click();
    await expect(row.locator('.draft-notice[data-notice="DUPLICATE_ID"]')).toBeVisible();
    expect(posts).toHaveLength(1); // positive control: the first save was sent
    await expect(row.locator('textarea')).toHaveValue(text);
    await expect(row.getByRole('button', { name: 'Vista', exact: true })).toBeDisabled();
    await row.locator('textarea').press('Control+Enter');
    await row.locator('textarea').press('Control+s');
    await page.waitForTimeout(500);
    expect(posts).toHaveLength(1); // never sent again
    // Discarding asks first; declining keeps the text.
    page.off('dialog', acceptAll);
    page.once('dialog', (d) => d.dismiss());
    await row.getByRole('button', { name: 'Hætta við' }).click();
    await expect(row.locator('textarea')).toHaveValue(text);
    // Back keeps it for the next visit. Reopened through the selector, as editor-lifecycle
    // Test 7 does: a page.goto would meet the dirty page's beforeunload handler.
    await page.locator('#btn-back').click();
    await expect(page.locator('#module-selector')).toBeVisible({ timeout: 5000 });
    await page.locator('#book-select').selectOption(BOOK);
    await expect(page.locator('#chapter-select')).toBeEnabled({ timeout: 5000 });
    await page.locator('#chapter-select').selectOption(CHAPTER);
    await page.locator(`.module-card[title^="${MODULE}"]`).first().click();
    await expect(rowOf(page, target.segmentId).locator('.draft-notice[data-notice="DUPLICATE_ID"]')).toBeVisible({
      timeout: 10000,
    });
    await expect(rowOf(page, target.segmentId).locator('textarea')).toHaveValue(text);
  });

  test('a refusal reached through Beita víðar propagates nothing (R4, decision 32)', async ({ page }) => {
    const [target, other] = middleVirginRows(await loadModuleJson(page));
    await openModule(page);
    const saves = [];
    const previews = [];
    const propagated = [];
    // Stubs only: a 409 DUPLICATE_ID for the target's save, a success for the control's, and a preview that always
    // offers a target, so a propagation that is NOT stopped reaches POST /propagate.
    await page.route(`**${MODULE_URL}/edit`, async (route) => {
      const body = route.request().postDataJSON();
      saves.push(body.segmentId);
      if (body.segmentId === target.segmentId) {
        return route.fulfill({
          status: 409,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'DUPLICATE_ID', message: 'stub' }),
        });
      }
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(STUB_SAVED) });
    });
    await page.route(
      (url) => url.pathname === `${MODULE_URL}/propagation-preview`,
      (route) => {
        previews.push(new URL(route.request().url()).searchParams.get('segmentId'));
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ eligible: [{ segmentId: 'stub' }] }),
        });
      }
    );
    await page.route(`**${MODULE_URL}/propagate`, async (route) => {
      propagated.push(route.request().postDataJSON().segmentId);
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ created: [], skipped: [] }),
      });
    });
    page.on('dialog', (d) => d.accept()); // the refusal alert and the propagate confirm; no other pane is dirty
    // Positive control: a save that lands goes on to propagate, so the stubs can see a propagation.
    await rowOf(page, other.segmentId).locator('.btn-edit').click();
    await rowOf(page, other.segmentId).locator('textarea').fill(`${other.is}${SUFFIX}`);
    await rowOf(page, other.segmentId).locator('.btn-propagate').click();
    await expect.poll(() => propagated).toEqual([other.segmentId]);
    // The refused one: its save is sent once, then nothing.
    const row = rowOf(page, target.segmentId);
    await row.locator('.btn-edit').click();
    await row.locator('textarea').fill(`${target.is}${SUFFIX}`);
    await row.locator('.btn-propagate').click();
    await expect(row.locator('.draft-notice[data-notice="DUPLICATE_ID"]')).toBeVisible();
    await page.waitForTimeout(500);
    expect(saves).toEqual([other.segmentId, target.segmentId]);
    expect(previews).toEqual([other.segmentId]);
    expect(propagated).toEqual([other.segmentId]);
  });

  test('BASE_MISSING asks for F5 and keeps the text', async ({ page }) => {
    const [target] = middleVirginRows(await loadModuleJson(page));
    await openModule(page);
    const row = rowOf(page, target.segmentId);
    await row.locator('.btn-edit').click();
    await row.locator('textarea').fill(`${target.is}${SUFFIX}`);
    await page.route(`**${MODULE_URL}/edit`, (route) =>
      route.fulfill({
        status: 409,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'BASE_MISSING', message: 'stub' }),
      })
    );
    const alert = new Promise((resolve) =>
      page.once('dialog', async (d) => {
        resolve(d.message());
        await d.accept();
      })
    );
    await row.getByRole('button', { name: 'Vista', exact: true }).click();
    expect(await alert).toContain('F5');
    await expect(row.locator('.draft-notice[data-notice="BASE_MISSING"]')).toBeVisible();
    await expect(row.locator('textarea')).toHaveValue(`${target.is}${SUFFIX}`);
  });
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `npx vitest run server/__tests__/servedBaseClientPins.test.js` and `npx vitest run
server/__tests__/ui-strings.test.js`
Expected: FAIL — no `keepsText(err.code)`, `keptEntries()` or `reinstallHeldDrafts()` in the file, no
`DRAFT_NOTICE_TEXT` map; `UI.refusal` is undefined (`TypeError: Cannot read properties of undefined (reading
'baseMissing')`). The older tests in both files pass.

Run: `( cd server && CI=1 npx playwright test --config=e2e/playwright.config.js served-base-client.spec.js -g
"refusal|BASE_MISSING" )`
Expected: FAIL — the stale-base, `DUPLICATE_ID` and Beita víðar tests: today's client alerts and reloads
(`:2061-2065`), their accept-everything handler accepts the reload's `closePanels`, the pane is closed and the typed
text is gone, so `.draft-notice` never appears (in the Beita víðar test, `propagateSegment` then also previews and
posts `/propagate` for the refused segment). The `BASE_MISSING` test fails first at `toContain('F5')`: today's alert
shows the server's message (the stub's `'stub'`); its `page.once` handler is used up by that alert, so the reload's
`closePanels` confirm meets no listener and is auto-dismissed, and the pane keeps its text, with no `.draft-notice`.

- [ ] **Step 3: Implement**

`server/public/js/ui-strings.js`, after the `acceptance` group:

```js
  // ── Refused saves (G1.1, spec §5.6, §5.7, §5.18; index decision 12) ──
  // ⚠️ PROPOSED WORDING, for [USER]'s check before the PR opens (index decision 13).
  refusal: {
    textKept: 'Textinn sem þú skrifaðir var geymdur og birtist aftur í bútnum.',
    generic: 'Vistun var hafnað.',
    // An old page cannot show this: the server's own BASE_MISSING message must also ask for F5.
    baseMissing:
      'Vistun var hafnað því síðan er úr eldri útgáfu kerfisins. Textinn sem þú skrifaðir var ' +
      'geymdur. Ýttu á F5 til að endurhlaða síðuna og vistaðu svo aftur.',
  },
  draftNotice: {
    staleBase:
      'Textinn sem þessi drög voru skrifuð við hefur breyst. Röðin sýnir nýja textann; gerðu ' +
      'breytinguna aftur á honum og vistaðu.',
    staleDisplayed:
      'Breytingin sem birtist þegar þú skrifaðir hefur breyst síðan. Berðu textann þinn saman ' +
      'við röðina og vistaðu aftur.',
    baseMissing:
      'Vistun var hafnað því hún kom frá eldri útgáfu síðunnar. Berðu textann saman við röðina ' +
      'og vistaðu aftur.',
    duplicateId:
      'Ekki er hægt að vista þennan bút fyrr en lagfæring á tvíteknum auðkennum er komin (sama ' +
      'auðkenni kemur tvisvar fyrir í einingunni). Textinn þinn er geymdur hér og verður ekki sendur.',
    bookNotMinted: 'Ekki er hægt að vista breytingar í þessari bók. Textinn þinn er geymdur hér.',
    noLayer:
      'Engin íslensk útgáfa er til fyrir þessa einingu og því er ekki hægt að vista. Textinn ' +
      'þinn er geymdur hér.',
    refused:
      'Vistun sem beið í biðröð var hafnað. Textinn þinn er hér; berðu hann saman við röðina og ' +
      'vistaðu aftur.',
    discardKept: 'Henda geymda textanum? Hann glatast þá.',
  },
```

`server/views/segment-editor.html`, after the `.accept-context-hint` rule (`:819-824`):

```css
      /* G1.1: why a pane holds a kept or restored text (index decision 12) */
      .draft-notice {
        margin-bottom: 0.5rem;
        padding: 0.4rem 0.6rem;
        border-left: 3px solid var(--warning);
        font-size: 0.8rem;
        line-height: 1.35;
      }
```

`server/public/js/segment-editor.js`:

STATE, after `paneState`:

```js
  // Index decision 12: texts kept by a refused save, waiting for their pane.
  // addRestoreItem: true when the text left the screen (a refusal), false when
  // it is only being carried across a re-render.
  const heldDrafts = new Map();
```

After `clearPaneState` (Task 10), and change `clearPaneState` to also run `heldDrafts.delete(segmentId);
showDraftNotice(segmentId, null); setSaveBlocked(segmentId, false);`:

```js
  const DRAFT_NOTICE_TEXT = {
    STALE_BASE: UI.draftNotice.staleBase,
    STALE_DISPLAYED: UI.draftNotice.staleDisplayed,
    BASE_MISSING: UI.draftNotice.baseMissing,
    DUPLICATE_ID: UI.draftNotice.duplicateId,
    BOOK_NOT_MINTED: UI.draftNotice.bookNotMinted,
    NO_LAYER: UI.draftNotice.noLayer,
    REFUSED: UI.draftNotice.refused,
  };

  function showDraftNotice(segmentId, code) {
    const panel = document.getElementById('edit-' + cssId(segmentId));
    if (!panel) return;
    const old = panel.querySelector('.draft-notice');
    if (old) old.remove();
    if (!code) return;
    const div = document.createElement('div');
    div.className = 'draft-notice';
    div.setAttribute('data-notice', code);
    div.setAttribute('role', 'status');
    div.textContent = DRAFT_NOTICE_TEXT[code] || UI.draftNotice.refused;
    panel.insertBefore(div, panel.firstChild);
  }

  /** R4: a DUPLICATE_ID text is never sent (Vista, Ctrl+Enter, propagate). */
  function setSaveBlocked(segmentId, blocked) {
    const panel = document.getElementById('edit-' + cssId(segmentId));
    if (!panel) return;
    for (const sel of ['.edit-controls .btn-primary', '.edit-controls .btn-propagate']) {
      const btn = panel.querySelector(sel);
      if (btn) btn.disabled = blocked;
    }
  }

  /** A kept text is never dropped silently. */
  function confirmDiscardKept(segmentId) {
    const st = paneState.get(segmentId);
    return !(st && st.refused) || confirm(UI.draftNotice.discardKept);
  }

  function keptPaneEntries() {
    const out = {};
    for (const [segId, st] of paneState) {
      if (!st.refused) continue;
      const ta = document.getElementById('textarea-' + cssId(segId));
      if (!ta) continue;
      out[segId] = segmentSaveState.draftEntry({
        text: ta.value,
        baseSha256: st.baseSha256,
        occurrence: st.occurrence,
        assists: st.assists,
        refused: st.refused,
      });
    }
    return out;
  }
  function keptEntries() {
    const out = keptPaneEntries();
    for (const [segId, held] of heldDrafts) if (!out[segId]) out[segId] = held.entry;
    return out;
  }

  /** Move a refused text into the hold and the draft, so the reload restores it. */
  function keepText(segmentId, entry) {
    heldDrafts.set(segmentId, { entry, addRestoreItem: true });
    dirtyEdits.delete(segmentId);
    paneState.delete(segmentId);
    saveDraft(); // every dirty pane's text, plus the held one, before the reload
  }

  function reinstallHeldDrafts() {
    for (const [segId, held] of [...heldDrafts]) {
      installDraft(segId, held.entry, { addRestoreItem: held.addRestoreItem }); // filtered out: stays held
    }
    updateSaveStatusBar();
  }

  function refusalAlertText(err) {
    if (err.code === 'BASE_MISSING') return UI.refusal.baseMissing;
    return (err.message || UI.refusal.generic) + '\n\n' + UI.refusal.textKept;
  }
```

`saveDraft`: after the `dirtyEdits` loop, add the held texts:
`for (const [segId, held] of heldDrafts) if (!entries[segId]) entries[segId] = held.entry;`

`clearDraft` (`:102-104`) becomes:

```js
  function clearDraft() {
    if (!currentModuleId) return;
    const kept = keptEntries(); // a refused save's text outlives leaving the module
    tabGuard.clearDraftsByPrefix(draftPrefix());
    if (Object.keys(kept).length > 0) writeDraft(kept);
    heldDrafts.clear();
    paneState.clear();
  }
```

`installDraft`: after `if (!ta) return false;` add `heldDrafts.delete(segId);`, and before `return true;`:

```js
    showDraftNotice(segId, segmentSaveState.noticeFor(entry, row ? row.baseSha256 : null));
    setSaveBlocked(segId, entry.refused === 'DUPLICATE_ID');
```

`restoreDraft`: replace the `confirm`/install block with kept texts first, unasked:

```js
    const kept = ids.filter((id) => entries[id].refused);
    const others = ids.filter((id) => !entries[id].refused);
    for (const segId of kept) {
      if (!installDraft(segId, entries[segId], { addRestoreItem: true })) {
        heldDrafts.set(segId, { entry: entries[segId], addRestoreItem: true });
      }
    }
    if (others.length > 0 && confirm(UI.confirm.draftRecovery(others.length))) {
      for (const segId of others) installDraft(segId, entries[segId], { addRestoreItem: true });
    }
```

`renderSegments` (`:1197-1214`): replace the confirm condition and add the carry-over and the reinstall:

```js
    const openPanels = document.querySelectorAll('.edit-panel.active');
    // A pane holding a kept text is carried across (index decision 12); only
    // the other dirty panes can lose text.
    const losable = [...dirtyEdits].filter((id) => !(paneState.get(id) && paneState.get(id).refused));
    if (openPanels.length > 0 && losable.length > 0) {
      if (!confirm(UI.confirm.closePanels)) return false;
    }
    for (const [segId, entry] of Object.entries(keptPaneEntries())) {
      if (!heldDrafts.has(segId)) heldDrafts.set(segId, { entry, addRestoreItem: false });
    }
```

(keep the panel-closing loop, `dirtyEdits.clear();` and Task 10's `paneState.clear();`), and before `return true;`
(`:1269`) add `reinstallHeldDrafts();`.

`saveEdit`: after `if (!seg) return;`:

```js
    const kept = paneState.get(segmentId);
    if (kept && kept.refused === 'DUPLICATE_ID') {
      alert(UI.draftNotice.duplicateId); // R4: never sent
      return;
    }
```

and replace the `if (err.status === 409) {` branch (`:2061-2065`) with:

```js
      if (err.status === 409 && segmentSaveState.keepsText(err.code)) {
        // Index decision 12: the typed text, its assists and the base it was
        // sent with go into the draft, then the module reloads and restores it.
        keepText(
          segmentId,
          segmentSaveState.refusedEntry({
            text: editedContent,
            row,
            assists: paneAssists(segmentId),
            code: err.code,
          })
        );
        alert(refusalAlertText(err));
        await loadModule(currentModuleId, { force: true });
      } else if (err.status === 409) {
```

(the old body of that branch, unchanged, follows). `paneAssists` must be read before `keepText` deletes the pane state,
which the argument order above guarantees.

`propagateSegment`: after its `moduleData` guard, `const st = paneState.get(segmentId); if (st && st.refused ===
'DUPLICATE_ID') return;`; and after `await saveEdit(segmentId);` (inside `if (dirtyEdits.has(segmentId)) { … }`,
`:2095-2097`):

```js
      // Decision 32: a refused save is never propagated. Its refusal path has just put the kept text back in this
      // textarea (keepText → loadModule → reinstallHeldDrafts → installDraft), so reading it below would send it:
      // a DUPLICATE_ID text to POST /propagate (R4), or a STALE_BASE text to every other occurrence.
      const after = paneState.get(segmentId);
      if (heldDrafts.has(segmentId) || (after && after.refused)) return;
```

`closeEditPanel(segmentId)`: as its first line, `if (!confirmDiscardKept(segmentId)) return;`. `revertEdit`: after
`if (!seg) return;`, `if (!confirmDiscardKept(segmentId)) return;`, and after Task 10's
`paneState.set(segmentId, freshPaneState(segmentId));` add `heldDrafts.delete(segmentId); showDraftNotice(segmentId,
null); setSaveBlocked(segmentId, false);` (the pane stays open, emptied of its kept state). The Escape close already
confirms a dirty pane (`:3371-3373`), and a kept pane is dirty.

The Back handler (`:2228-2230`): after `clearDraft();` add `dirtyEdits.clear();`. `clearDraft` has just written the
kept texts and discarded the rest, as Back does today; without the clear, the next module load meets the hidden old
panes still marked dirty, asks `closePanels`, and (dismissed) installs the kept text on the stale rows.

`beforeunload` and `auth-expired`: `dirtyEdits.size > 0` becomes `dirtyEdits.size > 0 || heldDrafts.size > 0`.

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `npx vitest run server/__tests__/servedBaseClientPins.test.js`, `npx vitest run
server/__tests__/ui-strings.test.js`, `npx vitest run server/__tests__/acceptanceUiPins.test.js`, `npx vitest run
server/__tests__/clientJsSyntax.test.js`
Expected: PASS, every test in each file.

Run: `( cd server && CI=1 npx playwright test --config=e2e/playwright.config.js served-base-client.spec.js
editor-lifecycle.spec.js acceptance.spec.js )`, then `( cd server && CI=1 npm run test:e2e )`
Expected: PASS. `npx eslint` and `npx prettier --check` on the touched `.js` files: no problems.

- [ ] **Step 5: Commit**

```bash
git add server/public/js/segment-editor.js server/public/js/ui-strings.js server/views/segment-editor.html \
  server/__tests__/servedBaseClientPins.test.js server/__tests__/ui-strings.test.js \
  server/e2e/served-base-client.spec.js
git commit -m "feat(segment-editor): a refused save keeps the typed text, its base and assists, with a notice"
```

---

### Task 20: a refusal answered to a replay brings the typed text back to its pane

Spec: index decision 12 ("or any 409 to a replay"), §5.18 row 6 ("on any 409 to a replay, keep the typed text … never
drop it with a toast"; `saveRetry.js:149-157`), §5.6 ("a queued replay that gets any non-5xx answer"; decision 28),
§5.9 (`replayed`, `client_action_id`).

**Files:**
- Modify: `server/public/js/segment-editor.js` — new `parkedPrefix`, `onSaveParked`; a `seg:` key policy, registered
  after `const API_BASE` (`:150`), with `markReplayed: true` (kept from Task 7's default, since a second call for a
  prefix replaces the first), `parkRefused: true, onParked: onSaveParked`; `restoreDraft` drains the module's parked
  replays.
- Test: `server/__tests__/servedBaseClientPins.test.js`; `server/e2e/served-base-client.spec.js`.

**Interfaces:**
- Consumes: `saveRetry.setKeyPolicy`, `.takeParked` (Task 7); `segmentSaveState.entryFromParked`,
  `.mergeRestoreSources` (Task 8); `keepText` (Task 19).
- Produces: nothing later tasks call.

- [ ] **Step 1: Write the failing tests**

Append to `server/__tests__/servedBaseClientPins.test.js`:

```js
describe('a 409 to a replay comes back (index decision 12)', () => {
  it('segment saves park a refused replay and the editor takes it', () => {
    expect(src).toMatch(/setKeyPolicy\('seg:', \{[^}]*parkRefused: true[^}]*onParked: onSaveParked/);
    expect(fnBody('restoreDraft', 'installDraft')).toMatch(/takeParked\(parkedPrefix\(\)\)/);
    expect(fnBody('onSaveParked', 'reinstallHeldDrafts')).toMatch(
      /takeParked\(item\.key, \{ exact: true \}\)/
    );
  });
});
```

Append to `server/e2e/served-base-client.spec.js`'s `describe`:

```js
  test('a 409 answered to a replay keeps the typed text, marked replayed, with one action id (index decision 12)', async ({
    page,
  }) => {
    const [target] = middleVirginRows(await loadModuleJson(page));
    await openModule(page);
    const row = rowOf(page, target.segmentId);
    await row.locator('.btn-edit').click();
    const typed = `${target.is}${SUFFIX}`;
    await row.locator('textarea').fill(typed);
    const bodies = [];
    await page.route(`**${MODULE_URL}/edit`, async (route) => {
      bodies.push(route.request().postDataJSON());
      if (bodies.length === 1) {
        return route.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"stub"}' });
      }
      return route.fulfill({
        status: 409,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'conflict', message: 'stub' }),
      });
    });
    page.on('dialog', (d) => d.accept());
    await row.getByRole('button', { name: 'Vista', exact: true }).click();
    await expect(page.locator('.toast-error').first()).toBeVisible(); // the 5xx: queued for a replay
    // The replay fires after about a second; its 409 parks the text and the module reloads.
    await expect(row.locator('.draft-notice[data-notice="REFUSED"]')).toBeVisible({ timeout: 10000 });
    await expect(row.locator('textarea')).toHaveValue(typed);
    expect(bodies).toHaveLength(2);
    expect('replayed' in bodies[0]).toBe(false);
    expect(bodies[1].replayed).toBe(true);
    expect(bodies[1].clientActionId).toBe(bodies[0].clientActionId);
    expect(bodies[1].baseSha256).toBe(bodies[0].baseSha256);
    expect(await page.evaluate(() => localStorage.getItem('saveRetryParked'))).toBeNull(); // taken
  });
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `npx vitest run server/__tests__/servedBaseClientPins.test.js`
Expected: FAIL — the new pins: `segment-editor.js` registers no `seg:` policy (Task 7's default lives in
`saveRetry.js`), and no `takeParked(` call exists.

Run: `( cd server && CI=1 npx playwright test --config=e2e/playwright.config.js served-base-client.spec.js -g "answered to a replay" )`
Expected: FAIL — the replay's 409 is dropped with the toast `Vista mistókst eftir 1 tilraunir…` (the `else` branch,
`saveRetry.js:149-157`, unchanged for a key without `parkRefused`); no notice appears. (`bodies[1].replayed` is
already `true` here, from Task 7's `DEFAULT_KEY_POLICIES`.)

- [ ] **Step 3: Implement**

After `const API_BASE = '/api/segment-editor';` (`:150`):

```js
  // Index decision 12, decision 28: a refused replay of a segment save comes back to its pane. markReplayed is
  // repeated because a second setKeyPolicy for a prefix replaces the first (Task 7's DEFAULT_KEY_POLICIES).
  // Guarded: a cached saveRetry.js older than this file has no setKeyPolicy.
  if (typeof saveRetry !== 'undefined' && typeof saveRetry.setKeyPolicy === 'function') {
    saveRetry.setKeyPolicy('seg:', { markReplayed: true, parkRefused: true, onParked: onSaveParked });
  }
```

Function declarations are hoisted in the IIFE, so `onSaveParked` may be defined later in the file.

After `keepText` (Task 19):

```js
  function parkedPrefix() {
    return 'seg:' + currentBook + '/' + currentChapter + '/' + currentModuleId + ':';
  }

  /**
   * A replay of a save in THIS module was refused (saveRetry parked it). Keep
   * the newest text: the pane's, if the editor kept typing, else the replayed
   * body's. A replay for another module waits for that module's next load.
   */
  function onSaveParked(item) {
    if (!moduleData || item.key.indexOf(parkedPrefix()) !== 0) return;
    saveRetry.takeParked(item.key, { exact: true }); // handled here, not at the next load
    const parked = segmentSaveState.entryFromParked(item);
    if (!parked) return;
    const segId = parked.segmentId;
    const st = paneState.get(segId);
    const ta = document.getElementById('textarea-' + cssId(segId));
    const entry =
      st && ta && dirtyEdits.has(segId)
        ? segmentSaveState.draftEntry({
            text: ta.value,
            baseSha256: st.baseSha256,
            occurrence: st.occurrence,
            assists: st.assists,
            refused: parked.entry.refused,
          })
        : parked.entry;
    keepText(segId, entry);
    loadModule(currentModuleId, { force: true });
  }
```

`restoreDraft`: replace `segmentSaveState.mergeRestoreSources(fromStorage, [])` with:

```js
    const parked =
      typeof saveRetry !== 'undefined' && typeof saveRetry.takeParked === 'function'
        ? saveRetry.takeParked(parkedPrefix())
        : [];
    const entries = segmentSaveState.mergeRestoreSources(fromStorage, parked);
```

and replace the two lines

```js
    if (!found) return;
    tabGuard.clearDraftsByPrefix(prefix);
```

with

```js
    if (!found && parked.length === 0) return;
    if (found) tabGuard.clearDraftsByPrefix(prefix);
```

(A parked replay for this module comes back even when no draft was stored: a body queued by a page loaded before the
deploy, replayed by this page after F5, decision 28.)

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `npx vitest run server/__tests__/servedBaseClientPins.test.js`, `npx vitest run
server/__tests__/saveRetryQueue.test.js`, `npx vitest run server/__tests__/clientJsSyntax.test.js`
Expected: PASS, every test in each file.

Run: `( cd server && CI=1 npx playwright test --config=e2e/playwright.config.js served-base-client.spec.js
editor-lifecycle.spec.js )`, then `( cd server && CI=1 npm run test:e2e )`
Expected: PASS (`editor-lifecycle` Tests 4 and 5 still see the success toast: their replays answer 200 or a 5xx, never
a non-5xx refusal). `npx eslint` and `npx prettier --check` on the touched files: no problems.

- [ ] **Step 5: Commit**

```bash
git add server/public/js/segment-editor.js server/__tests__/servedBaseClientPins.test.js \
  server/e2e/served-base-client.spec.js
git commit -m "feat(segment-editor): a refusal answered to a replay brings the typed text back to its pane"
```

## Interfaces produced for later PRs

The server modules are CommonJS under `server/`; tests reach them through `createRequire(import.meta.url)`. The
client modules at the end are browser scripts (`sourceType: 'script'`) with a CommonJS export for tests.

### `server/lib/servedText.js` (Task 1)

```ts
sha256Text(s: string): string            // 64 lowercase hex; TypeError on a non-string. The ONLY hash of served text.
NOT_MINTED_BOOKS: readonly string[]      // frozen ['lifraen-efnafraedi']
isNotMintedBook(book: string): boolean
```

PR5's `version_key` hashes `book|chapter|module_id|segment_id|occurrence|en_sha256|is_sha256|layer` (spec §5.19)
with `sha256Text`; G1.7's manifest hashes the loader's served `is` with it.

### `server/lib/researchScope.js` (Task 2)

```ts
STUDY_BOOKS: readonly string[]           // frozen ['efnafraedi-2e']; a test fails if organic ever appears
isStudyBook(book: string): boolean       // PR2's predicate, PR3's record() step 1, Task 17's refusal
```

### `server/lib/editOrigins.js` (Task 13)

```ts
EDIT_ORIGINS: readonly ['editor-save', 'propagation', 're-attach']
RESERVED_EDIT_ORIGINS: readonly ['note-apply', 'propagated', 'ai-pass']
```

PR3's events stamp `origin` from the edit row; PR3's flag-coverage scanner lists `servedEdit.js` (spec §5.13).

### `server/services/servedVersions.js` (Task 5)

```ts
type Key = { book: string, chapter: number, moduleId: string }          // chapter -1 = appendices
type VersionRow = { book, chapter, moduleId, segmentId: string, occurrence: number,
                    enSha256: string, isSha256: string, layer: 'mt-output' | 'faithful' | 'selected',
                    enText: string, isText: string }

countOccurrences(segments: { segmentId: string }[]): { occurrences: number[], duplicated: Set<string> }
buildVersionRow(f: Key & { segmentId, occurrence, en, is, layer }): VersionRow     // throws code NO_LAYER if !layer
versionRowsFor(data: LoaderOutput, key: Key): { rows: (VersionRow & { duplicated: boolean })[],
                                                duplicatedIds: string[] }           // every segment; throws NO_LAYER
annotateServed(data, key): { scope: 'minted' | 'not-minted-book' | 'no-layer',
                             duplicatedIds: string[], rows: VersionRow[] }          // mutates data.segments
mintVersions(conn: Database, rows: VersionRow[]): number[]                        // ids aligned with rows; one deferred
                                                                                  // transaction; throws BOOK_NOT_MINTED
recordServe(conn, data, key): { scope, duplicatedIds, rows,
                                mintOk: boolean,                                  // false only when the mint threw
                                servedVersionIds: { segmentId, occurrence, servedVersionId }[] | null }
```

- **PR2** (the opening step, in the module route at the seam Task 6 leaves before `res.json`): reads the route-local
  `served` (the `recordServe` result): `mintOk === false` while the predicate holds → 503 `OPENING_UNRECORDED`;
  `servedVersionIds` and `duplicatedIds` for PR3's `module-opened` detail.
- **PR3**: `mt-accept`, `edit-save`, `propagation` events take `served_version_id` from the rows these writes stored;
  `base_is_sha256` from `served_text_versions.is_sha256`.
- **PR5**: reads `served_text_versions` by value (never orders ids, spec §5.19, §5.22); `versionRowsFor` is the row
  builder for a module the route cannot serve.

### `server/services/servedEdit.js` (Task 13)

```ts
REFUSAL_MESSAGES: Readonly<Record<RefusalCode, string>>     // Icelandic, proposals (decision 20)
REFUSAL_STATUS: Readonly<Record<RefusalCode, 409 | 404 | 400>>
type RefusalCode = 'BOOK_NOT_MINTED' | 'NO_LAYER' | 'SEGMENT_NOT_FOUND' | 'DUPLICATE_ID'
                 | 'BASE_MISSING' | 'STALE_BASE' | 'STALE_DISPLAYED' | 'STRUCTURE_BLOCKED'
// a refusal is an Error: { code: RefusalCode, message, refusal: { code, echoedSha256: string|null,
//                          currentSha256: string|null }, violations?: object[] }

placeOnServedBase({ book, chapter, moduleId, segmentId, occurrence? }):
  { data: LoaderOutput, seg: Segment, occurrence: number, duplicatedIds: string[] }   // steps 1–3; throws a refusal

saveOnServedBase({ book, chapter, moduleId, segmentId, occurrence?, editedContent: string, category?, editorNote?,
                   editorId: string, editorUsername: string, baseEditId?, origin: EditOrigin,
                   requireEcho: boolean, baseSha256?, displayedEditId?: number|null,
                   displayedEditSha256?: string|null }):
  { outcome: 'inserted' | 'updated' | 'withdrawn' | 'unchanged',
    editId: number | null,              // the written, updated or deleted row; null for 'unchanged'
    servedVersionId: number,            // the version of the base this save was checked and stored against
    occurrence: number,                 // 0 until G1.12
    baseSha256: string,                 // sha256Text(server base)
    layer: 'mt-output' | 'faithful',
    editedContentSha256: string | null, // non-null when a row remains (inserted, updated)
    displayed: { editId: number|null, sha256: string|null } }   // the pair stored on the row
```

- **PR3**: emits `edit-save` / `edit-resave` / `edit-withdraw` from `outcome` after the route's commit, and
  `write-refused` from a caught refusal's `err.refusal` (reason and both hashes, no text), with the request's book,
  chapter, module and segment. PR3 adds `before` to this return (below).
- **Re-attach by content** (10-10 plan 4.2, not built here): `saveOnServedBase({ …, origin: 're-attach', requireEcho:
  false })`, skipping and listing a `DUPLICATE_ID`.

### `server/services/acceptanceService.js` and `propagationService.js` (Tasks 15, 16)

```ts
acceptSegment({ book, chapter, moduleId, segmentId, acceptedContent, userId, username, occurrence?: number }):
  { alreadyAccepted: boolean, acceptance: Row }      // acceptance.served_version_id / .occurrence set when minted
findOccurrences(book, enNorm, opts): { chapter, moduleId, segmentId, occurrence, duplicated, layer, en, currentIs,
                                       existingEdit }[]
classifyOccurrence(text, occ): 'eligible' | 'already-matches' | 'conflict' | 'duplicate-id' | 'no-layer'
createPropagatedEdits(conn, args): { created: { moduleId, segmentId, superseded? }[],
                                     skipped: { moduleId, segmentId, reason, occurrence? }[] }
```

### `server/lib/schemaHealth.js` (Task 4)

```ts
EXPECTED_SCHEMA: { tables: Record<string, readonly string[]>,     // table → every column
                   columns: Record<string, readonly string[]>,    // existing table → added columns
                   indexes: readonly string[] }
checkSchema(db, expected = EXPECTED_SCHEMA): { ok: true, missing: [] } | { ok: false, missing: string[] }
                                           | { ok: false, missing: null, error: string }   // never throws
```

Each later PR appends its own entries to `EXPECTED_SCHEMA` in its migration's commit (index decision 3): PR2
`module_openings`, `module_opening_inflight`; PR3 `book_switch_events`, `research_consent`,
`research_capture_losses`; PR4 `research_deletions`, `research_derived_datasets`. `server/index.js`'s
`checks.schema` block needs no change.

### `server/__tests__/researchBoundary.test.js` (Tasks 3, 6)

One file (index decision 15). PR1 leaves: `ALLOWED_COLUMNS` (`segment_edits`, `segment_acceptances`) with
`columnDrift(db, table, allowed) → { unexpected, missing }`; `MODULE_JSON_ALLOWED` (`top`, `segment`, `editRow`,
`acceptanceRow`), `FORBIDDEN_KEY`, `keysDeep(value)` and `jsonDrift(body)`; each `describe` with a planted control.
A later PR appends a `describe` (PR2: no opened time in the module JSON, `module_openings` never in a response; PR3:
`server/routes/` vs `researchDb` / `editor_keys`, the `research-*` forbidden tables, `record`'s failure log; PR4: the
admin reader module; PR5: the eligibility output) and, for a new editing column, an `ALLOWED_COLUMNS` entry.

### The before-state PR3 needs (proposed here; PR3's plan owns the final shape, index § Cross-PR interfaces)

PR1 returns no before-images. Where PR3 must read them, inside the same transaction as the write (spec §5.9):

| Function | Read before the write | Proposed additive return |
|---|---|---|
| `saveSegmentEdit` (re-save UPDATE, `:132-152`) | `SELECT * FROM segment_edits WHERE id = existing.id`, inside `updateWithSupersede` before its UPDATE | `before: Row` |
| `saveSegmentEdit` (withdraw DELETE, `:110-113`) | the same row, before the DELETE (today outside any transaction; PR3 wraps it) | `before: Row` |
| `saveSegmentEdit` (both supersede sweeps) | ids of the caller's `discuss`/`rejected` rows and of the active acceptance the sweep supersedes (`acceptanceService.supersedeForEdit`, `:278-287`, returns nothing today) | `supersededEditIds: number[]`, `supersededAcceptanceIds: number[]` |
| `saveOnServedBase` | — | passes the three through unchanged |
| `createPropagatedEdits` (in-place UPDATE) | the target row before `update.run` | each `created` entry gains `editId`, `servedVersionId`, `occurrence`, `before: Row | null` |
| `deleteSegmentEdit`, approve, reject, discuss, `unapproveEdit`, `returnEditToPending`, `applyApprovedEdits`, restore | per spec §5.9's list | PR3's plan |

`saveSegmentEdit`'s current keys must stay as they are (`errorHandling.test.js:64` pins `reverted` undefined on an
insert); `before`, `supersededEditIds` and `supersededAcceptanceIds` are new keys only.

### `server/public/js/segment-save-state.js` (Task 8; browser global `segmentSaveState`, CommonJS export for tests)

Not in the index's cross-PR list, but G1.23 and PR3 build on it: G1.23 adds its item types to `ITEM_SOURCES`
(`ai-suggestion`, `rule-suggestion`, §5.10), and PR3 reads the item shape it builds.

```ts
DRAFT_VERSION = 2
BODY_LIMIT_BYTES = 1048576  // express.json's '1mb'
BODY_HEADROOM_BYTES = 16384
KEEP_TEXT_CODES: string[]   // STALE_BASE, STALE_DISPLAYED, BASE_MISSING, DUPLICATE_ID, BOOK_NOT_MINTED, NO_LAYER
NOTICE_CODES: string[]      // KEEP_TEXT_CODES + 'REFUSED'

rowDataAttributes(seg, displayedEdit | null, baseEditId): Record<attr, string>
rowDataAttributeHtml(attrs, escape): string
readRowValues(el): { segmentId, is, baseSha256, occurrence, displayedEditId, displayedEditSha256, baseEditId } | null

buildSaveBody({ segmentId, row, editedContent, category, editorNote, assists, clientActionId, clientActionTime })
buildAcceptBody({ segmentId, row, acceptOrigin, clientActionId, clientActionTime })

type AssistItem = { itemType, source, clientTimeMs: number, detail: object, claim?: 'unverified' }
assistItem(itemType, source, clientTimeMs, detail): AssistItem   // repetition-insert/tm, term-insert/termbase,
                                                                  // markup-wrap/toolbar|keyboard; else TypeError
boundAssists(items, maxBytes = BODY_LIMIT_BYTES - BODY_HEADROOM_BYTES): AssistItem[]  // the sent body only
                                                                  // (decision 36, needs [USER]'s yes)

type DraftEntry = { text, baseSha256: string|null, occurrence: number|null, assists: AssistItem[],
                    refused: string|null, legacy?: true }
draftEntry(e): DraftEntry                                         // never bounds: a draft keeps every text
buildDraftValue(entries, now): { v: 2, ts, segments: Record<segId, DraftEntry>, drafts: Record<segId, string> }
parseDraftValue(value): { legacy: boolean, entries: Record<segId, DraftEntry> } | null
mergeDraftValues(values[]): { legacy: boolean, entries: Record<segId, DraftEntry> } | null
                                                                  // newest wins; older kept entries carried over
draftRestoreItem(entry, now): AssistItem                          // legacy: claim 'unverified', detail.legacy true
restoredAssists(entry, now): AssistItem[]                         // the entry's assists, then draft-restore

keepsText(code): boolean
refusedEntry({ text, row, assists, code }): DraftEntry
entryFromParked(item): { segmentId, entry: DraftEntry } | null
mergeRestoreSources(fromDraft, parked): Record<segId, DraftEntry>
noticeFor(entry, rowBaseSha256): NOTICE_CODES member | null

echoAttributeUpdates(saveResponse, currentBaseEditId): Array<[attr, string | null]>
newClientActionId(cryptoObj): string
```

### `server/public/js/saveRetry.js` additions (Task 7)

```ts
DEFAULT_KEY_POLICIES  // module export: seg: and acc: markReplayed; the browser wiring registers them on every page
setKeyPolicy(prefix: string, { markReplayed?, parkRefused?, onParked?: (item) => void })  // longest prefix wins
takeParked(prefix: string, { exact? }): Array<{ key, url, body, status, code, message, parkedAt }>
// a non-retryable live answer: err.status, err.code = data.error, err.data = data (additive)
// localStorage['saveRetryParked']: parked items (any non-5xx answer to a parkRefused replay), pruned after 7 days
```

A key with no policy (the Pass 2 editor's) behaves exactly as at `ed10180c`.

### What the client sends (Tasks 9, 10, 18; read by PR3)

- **Save:** `segmentId`, `originalContent` (the row's `is`, ignored by the server), `editedContent`, `category`,
  `editorNote`, `baseEditId` (from the row), `baseSha256` (absent when the row has none), `displayedEditId`,
  `displayedEditSha256`, `clientActionId`, `clientActionTime`, `assists`; `replayed: true` on replays only. No
  `occurrence` until G1.12 (b).
- **Accept:** `segmentId`, `acceptedContent` (from the row), `acceptOrigin` (`single` | `keyboard-stream`),
  `clientActionId`, `clientActionTime` (decision 26); `replayed: true` on replays only.
- **Approve, reject, discuss:** `note`, `reviewedEditSha256` (the reviewed edit's `contentSha256` from the row that
  displays it, or `null`).
- **Draft value:** decision 29.
- **E2E helper:** `chooseSegment(segments, {suffix, exclude, requireBaseSha256})` returns `baseSha256`;
  `pickEditableSegment` always passes `requireBaseSha256: true` (Task 14).

## Before the PR

1. **The gate, as CI runs it, on the branch's tip** (index § Global Constraints): `npm test` from the repository root
   (diff the failing set by name against `main`'s, never the count); `npm run lint` **and** `npm run format:check`;
   `npm run docs:check` (it applies: Tasks 6, 14, 15, 16 touch `server/routes/**` and Tasks 12, 17 touch `scripts/**`;
   expected clean, decision 19); `cd server && CI=1 npm run test:e2e` (this PR touches routes and `server/public/js/`).
   No dependency is added, so `npm audit` is not part of this gate. `git status --porcelain` empty.
2. **Re-check the migration number** (`ls server/migrations`) against `main` just before merging (index decision 9).
3. **A whole-branch adversarial review.** The newest practice is a blind pair, Opus and Fable on the same brief,
   neither seeing the other's findings; **ask [USER] before commissioning the Fable half.** The alternative is a review
   workflow with several lenses and a skeptic per finding; a mutation pass restores from a golden `cp`, never
   `git checkout`, and `git status --porcelain` runs the moment any reviewing agent goes quiet. Fold confirmed findings
   in as their own commits. The Review Focus above is the brief's input-case list.
4. **[USER] checks every proposed Icelandic string before the PR is opened** (index decision 13):
   - the server's `REFUSAL_MESSAGES` (decision 20): `BASE_MISSING`, `STALE_BASE`, `STALE_DISPLAYED`, `DUPLICATE_ID`,
     `BOOK_NOT_MINTED`, `NO_LAYER`;
   - `UI.refusal.textKept`, `.generic`, `.baseMissing` and `UI.draftNotice.staleBase`, `.staleDisplayed`,
     `.baseMissing`, `.duplicateId`, `.bookNotMinted`, `.noLayer`, `.refused`, `.discardKept` (Task 19);
   - `saveRetry`'s park toast, *Vistun var hafnað — textinn var geymdur og birtist aftur í bútnum.* (Task 7).
5. **Push, open the PR (draft), and deploy only on [USER]'s go.** Merge as a **merge commit**, never squash or rebase.
   A push to `main` from dev puts prod's content backup behind until the next deploy (CLAUDE.md § Content delivery).
   After the deploy, an editor's page loaded before it answers `BASE_MISSING` until F5 (Review Focus 1); say so to the
   editors with the deploy.
6. A new top entry in the register: what merged, what was measured, what is next.

### Questions for [USER] before or during review

- Is the proposed Icelandic wording right (item 4 above)?
- Is a live foreign key from `segment_edits.served_version_id` and `segment_acceptances.served_version_id` to
  `served_text_versions(id)` acceptable (decision 2)? It means G1.15's eventual retention of served versions must delete
  or NULL the referencing rows first.
- The id-based re-attach script gets a new exit code, 6, for "refused: study book" (decision 16). Should the C16
  runbook's exit-code table name it?
- `POST /edit` would now answer 400 to a non-string `editedContent`; today a number is stored as text (decision 14).
  Acceptable in PR1?
- Today Hætta við and Endurstilla discard a pane without asking. Is it acceptable that they now ask before discarding a
  text a refused save kept, while ordinary panes stay as they are (decision 31)?
- Decision 39 (not adopted): should a replay whose displayed row already holds the replayed text pass the displayed
  check? Adopting it changes spec §5.6 step 4 and needs a dated `✏️ AMENDED` block.
- **Three departures from the spec's wording, each built as written unless [USER] says no** (each decision names its
  fallback):
  - Decision 3: `checks.schema` also reports a missing `idx_served_text_versions_key`, though §5.20 defines the check
    as tables and columns (`PRAGMA table_info`).
  - Decision 7: `STALE_DISPLAYED` also fires when `displayedEditId` names a row of another book, module or segment,
    though §5.6 step 4 names only "gone" and "the hash differs".
  - Decision 36: past what fits under `express.json`'s 1 MiB, the SENT body drops `detail.text` from the oldest
    whole-text items (never the newest, never in the draft), though §5.10 and §14 call 18 say a repetition insert or
    a restored draft keeps the whole text it put in place. The alternative is a 413 on that save.
- Decision 28 parks every non-5xx answer to a segment-save replay (§5.6), wider than §5.18's row and index decision
  12, which say "409". A 5xx that exhausts the retries is still dropped with today's toast, as §5.6 leaves it. Should
  that case be parked too?
- Review Focus 1: a page loaded before the deploy keeps its typed text only if its own 5-second draft caught it and
  the editor accepts the recovery offer, or answers Cancel to the closing prompt. Should the server's `BASE_MISSING`
  message (decision 20, a proposal) also tell the editor to answer Cancel to that prompt, or to copy the text, before
  pressing F5?

## Handoff to PR2

Binding on PR2's plan ([the opening record](2026-11-03-g11-g12-pr2-opening-record.md)).

**PR2 may rely on:**
- **The seam in the module route** (Task 6): `const served = servedVersions.recordServe(segmentEditor.getDb(), data,
  { book, chapter: req.chapterNum, moduleId })` runs right after the loader, and a comment immediately before
  `res.json({` marks where spec §5.4 step 4 goes: after every editor's edit rows are read, before the response. PR2's
  opening step goes there and removes the `eslint-disable-next-line no-unused-vars` line above `const served`, since it
  then reads it.
- **`served`'s shape:** `{ scope: 'minted' | 'not-minted-book' | 'no-layer', duplicatedIds: string[], rows,
  mintOk: boolean, servedVersionIds: { segmentId, occurrence, servedVersionId }[] | null }`. `mintOk === false` only
  when the mint threw; with the predicate holding, that is PR2's 503 `OPENING_UNRECORDED` (§5.4). `servedVersionIds`
  and `duplicatedIds` are the `module-opened` detail PR3 emits (§5.5). For a not-minted or layerless module `rows` is
  `[]`, `mintOk` is `true` and `servedVersionIds` is `[]`; organic is never on the study allowlist, so PR2's predicate
  never holds there.
- **`researchScope.isStudyBook(book)`** (Task 2) for the predicate's first clause (§5.5).
- **`data.segments[i].occurrence`** (always present after `recordServe`) for `module_opening_inflight`'s key, and the
  route's `edits` (every editor's rows, already read before the seam) for the snapshot.
- **`schemaHealth.EXPECTED_SCHEMA`** to append `module_openings` and `module_opening_inflight` in PR2's migration commit
  (index decision 3), and **`researchBoundary.test.js`** to append PR2's `describe` (no opened time in the module JSON;
  `module_openings` never in a response); `MODULE_JSON_ALLOWED` gains nothing.
- **The drift guard** (`segmentEditsSchemaDrift.test.js`): PR2 adds no `segment_edits` column; if it ever does, the
  guard names it.

**PR2 must not change:**
- the module response's keys (T17 pins them exactly: per segment only `occurrence` and `baseSha256`, per edit row only
  `contentSha256`, nothing at the top level);
- `recordServe`'s signature or its fail-soft behaviour for every serve its predicate does not cover (a failed mint on
  any other serve still answers 200 with `baseSha256`);
- where the hook runs: only in the module GET, never in the loader (17 callers, §5.4);
- `NOT_MINTED_BOOKS`, `STUDY_BOOKS` or the refusal codes and their statuses in `servedEdit.js`;
- the migration that Task 3 adds (PR2 takes the next number, predicted `054`, in merge order).
