# G1.1 + G1.2: served versions, the event log, consent and the research database — design

- **Date:** 2026-11-03
- **Item:** Skerfur plan §3.1, gate rows G1.1 and G1.2, with G1.4's consent record and G1.20's research database file
- **Decided by:** [USER], in a brainstorming session on 2026-11-03 (the six rulings in §4) and in three answers the
  same day to this draft's questions (A1–A3, §14); approved as written on 2026-11-03. Everything marked *(Claude's
  call: …)* was a default Claude proposed and [USER] approved with the rest, not something [USER] chose among options;
  §14 lists every one. The nine rulings are also recorded, as cross-cutting decisions, in
  `docs/decisions/2026-11-03-research-capture-consent-and-retention-rulings.md`.
- **Status of the work:** the active register's newest ⏩ RESUME entry, never this file.

> **FROZEN DESIGN RECORD — owned by the G1.1 + G1.2 project (with G1.4's data side and G1.20's research file),
> banner-dated 2026-11-03 ([USER] approved it as written).** It is evidence of what was designed and why; it carries
> no status. If it disagrees with the active register, the register wins. Do not sync it or edit it in place.
> Supersede it with a new record instead.

> **✏️ AMENDED 2026-11-04: twenty departures from this design's wording, approved with the implementation plan**
> ([USER] 2026-11-04: "Yes for all" to the plan's questions, with four clarifications the same day). Each is stated,
> with its reason and its fallback, in the named decision of the plan
> (`docs/superpowers/plans/2026-11-03-g11-g12-pr<N>-*.md`, "PR<N> d<n>"). This block lists only what each one
> overrides; it does not restate the reasons.
>
> - **§5.20:** `checks.schema` also reports the unique index `idx_served_text_versions_key` (PR1 d3).
> - **§5.6 step 4:** `STALE_DISPLAYED` also fires when `displayedEditId` names a row of another book, module or segment
>   (PR1 d7). It does not fire when the displayed row already holds exactly the text being saved, so a replay whose
>   first attempt landed is not refused (PR1 d39).
> - **§5.10 and §14 call 18:** past `express.json`'s 1 MiB, the sent body drops `detail.text` from the oldest whole-text
>   assists, never the newest; the draft keeps every text (PR1 d36).
> - **§5.4:** a throw in the users or assignment lookup on a study-book serve answers 503 `OPENING_UNRECORDED`, as a
>   failed opening step does (PR2 d4).
> - **§5.9's field table and §14 call 14:** a before-image never stores identity raw, the actor's own included; only the
>   actor's own times are kept (PR3 d9).
> - **§5.14:** the consent POST must echo the text version the page showed; a stale one answers 409
>   `CONSENT_TEXT_CHANGED` (PR3 d26).
> - **§5.9:**
>   - apply's per-row outcomes go in the event's detail, not its content (PR3 d48);
>   - propagation stores the client's text once, not again in every target event's detail (PR3 d54);
>   - `write-refused` is also logged for `SEGMENT_CONFLICT` and the accept's eligibility refusals (PR3 d49);
>   - a saved or propagated text identical to another editor's live edit is stored as its hash only (PR3 d65).
> - **§10 T11:** the apply arm runs on chemistry in a temporary books root with the apply hold stubbed for that test,
>   since a non-held book is never captured (PR3 d60).
> - **§5.15:**
>   - only withdrawals set `deletion_done_at_ms`, and retention writes its own `research_deletions` row (PR4 d9);
>   - an export directory that cannot be emptied keeps the interval due (PR4 d10);
>   - retention stays due until its deletion is recorded (PR4 d11);
>   - `--write` is refused for want of a derived dataset only when something is due (PR4 d12).
> - **§5.14 and §5.22:** the paper-consent script is not a §5.22 exception (PR4 d18). A paper decision names the
>   current approved text version (PR4 d19) and takes its time from when it is recorded (PR4 d20).
> - **§5.19:** a reviewed-but-unapplied text's `final_sha256` is taken over its served (loader-normalised) view
>   (PR5 d7).

> **✏️ AMENDED 2026-11-03: `server/lib/researchScope.js` ships in PR1, not PR3** ([USER] 2026-11-03, approving
> decision 1 of the implementation plan's index, `docs/superpowers/plans/2026-11-03-g11-g12-served-versions-and-event-log.md`).
> It overrides one cell of §13a's table: PR3's "Holds" listed `researchScope.js`.
>
> - **Why:** two consumers come before PR3. Once `saveOnServedBase` exists (PR1), the id-based re-attach script must
>   refuse the study book (§5.6), and PR2's opening predicate requires the book to be on the allowlist (§5.5). PR3
>   was the first to need it only in the table, not in the design.
> - **Unchanged:** what the module holds (the study allowlist, chemistry, pinned by a test that fails if organic ever
>   appears; §11), and everything else in §13a.

**What [USER] approved (2026-11-03, as written).**
1. §4 records the six rulings and [USER]'s three answers (A1–A3) as decided.
2. The Claude's calls in §14.
3. One choice that check G-1d may raise (§9), made when G-1d runs, not at approval: if chemistry already holds
   assignment rows, either [USER] removes them before the opening step ships, or those units are recorded as opened
   before the switch-on and never get suggestions.
4. Where this design departs from the Skerfur rows or a ruling's wording: R5's two pieces replace the per-unit
   manifest; G1.1's "freeze commit" column is dropped, since whether a version is the frozen base is a join on G1.7's
   manifest (§5.2); acceptance rows get no origin column (§5.8); the English text is stored (§5.2); research backups go
   to their own bucket, not under a name prefix in the editorial one (§5.17). §12 lists the plan notes these need.
5. One existing leak this design closes: the MT lock marker publishes when each unit's first edit was made (§5.19).

## 1. The records this design implements

Read with this file. This design does not restate their reasoning.

1. Skerfur plan (`docs/plans/2026-10-23-skerfur-development-plan.md`): §3.1 rows G1.1, G1.2, G1.4 and G1.20, the
   dated notes beneath the table, and §4.1 (what a tick holds, the editor key, the protocol's list).
2. The approved G1.23 spec, `docs/superpowers/specs/2026-11-02-suggestion-view-design.md` (frozen 2026-11-03).
   **Its §8 is the contract this design must meet;** §7 below maps every item.
3. `docs/decisions/2026-10-28-ai-term-pass-as-editor-suggestions.md`: its consent consequences.
4. `docs/decisions/2026-10-28-rule-layer-edits-as-editor-suggestions.md`: rule decisions are logged too.
5. `docs/decisions/2026-10-28-d12-and-editor-licence-answers.md`: the licence clause is separate from research
   consent and survives withdrawal.

**Evidence.** A read-only sweep on 2026-11-03 at `3a1db909` (eleven agents, four reports adversarially verified) and a
five-lens review of this draft wrote their reports to an off-repo session scratchpad, which does not survive. **This
file therefore carries everything a builder needs.** Every `path:line` below was re-read at `3a1db909`, and every count
was measured on 2026-11-03 at `3a1db909` unless it names another date; counts are evidence, not live values.

**Words used here.**
- **Unit:** one module file (Skerfur "Words used"). Chemistry has 149; the contract's 134 are those outside ch01–ch02.
- **Base text:** the Icelandic an editor is shown as the starting point, before any pending edit: exactly the `is`
  string `segmentParser.loadModuleForEditing` returns for a segment. It is what G1.23 §6.3 checks.
- **Pure MT:** the Málstaður output as received (`02-mt-output`). Under the hold it is chemistry's base text.
- **The hold:** §C203's rule that no code path writes chemistry's faithful files (`server/lib/applyHold.js:1-13`).
- **Layer:** which stored text was served: pure MT (`mt-output`) or the faithful file (`faithful`).
- **Hash (sha256):** a 64-character fingerprint of a text. The same text always gives the same fingerprint and the
  text cannot be read back from it, but anyone who holds a text can check whether it matches.
- **Served version:** one distinct (base text, English text, layer) for one segment occurrence that the server
  presented as a base, by serving it in the module route or by deriving it at a write.
- **Mint:** write a served-version row the first time a distinct version is presented; presenting it again adds
  nothing.
- **Occurrence:** the 0-based count of earlier segments with the same id in the module's served list.
- **In flight:** an edit that is pending, or approved and not yet applied (`isEditInFlight`,
  `server/public/js/accept-eligibility.js:41-43`).
- **Opened:** a module's first serve to a user who holds an assignment row for that chapter (G1.23 §6.2).
- **Consenting editor / decliner / undecided:** an editor whose current consent decision is *consented* and not
  withdrawn; one who chose *declined* or withdrew; one with no decision at all.
- **Consent interval:** the span from a *consented* decision to its withdrawal (§5.14). Each interval has its own key.
- **Editing record:** what the tool keeps in `sessions.db` to work. **Research file:** the separate database that
  holds research rows. **Loss:** a research row that should have been written for a consenting editor and was not.
- **Fail-soft:** if the step fails, the editor is not blocked; the failure is logged.
- **Before-image:** what a row held just before an act changed or deleted it.
- **Displayed pair:** the id and hash of the in-flight edit that was on screen when the editor saved (§5.8).

## 2. Intent

Every chemistry unit is to be measured from its first edit. What an editor does before measurement is switched on can
never be measured later (Skerfur §1 point 1). So this project builds the measurement base before any unit opens.

Why it matters:
- **Honest data (G1.1).** Each edit records the exact text its editor was shown, and a save made on text that has
  since changed is refused. Today the server stores whatever base text the client sends (§5.6).
- **The research (G1.2).** Every act by a consenting editor is logged once: where it came from, the text it was made
  on, the code running and the switches on. Today nothing records acts for research, and a re-save overwrites the
  first-save time (§5.9).
- **Privacy (G1.4, G1.20).** Research rows live in their own file. A withdrawal or the retention date deletes them,
  and nothing any editor sees or can do changes.

**The screen never depends on research data.** That is G1.23's anti-goal, and it fixes the split in this design:
everything the screen uses (served versions, the opened time, the opening snapshot, the per-book switch) and the
consent record live in `sessions.db`. Only the research rows live in the research file. *(Claude's call: what the
screen depends on lives in `sessions.db`.)*

**G1.23 needs it.** G1.23 is not buildable until G1.1 and G1.2 are on `main` ([USER], 2026-11-02; G1.23 §8). §13a says
which parts G1.23 waits for.

## 3. Goals, non-goals, anti-goals

**Goals**
- A served-version row for every distinct base text the module route serves, with the sha256 G1.23 §6.3 uses.
- A save or MT acceptance refused when its base is not current, or when its segment cannot be placed. Every new edit
  and acceptance row points at the served version it was made on.
- A set-once opened time per module, and the snapshot of segments holding an in-flight edit at that moment, on
  production before any unit opens.
- One logging call that writes each consenting editor's acts, with origin, served version, server commit and switch
  snapshot, to the research file, and never fails the editor's act.
- A consent record, and withdrawal and retention scripts that delete research rows without touching the editing
  record.
- Every loss countable.

**Non-goals**
- **G1.3's tick capture** (the page lifecycle hooks, `sendBeacon`, the tick table). This project fixes the
  conventions ticks will share (§5.10, §5.16): the editor key, the session id and per-act idempotency.
- **G1.12's mechanism.** This project adds an occurrence field everywhere and refuses what it cannot place (R4).
- **G1.13's assignments and enforcement.** This project reads assignment rows; it does not create them.
- **G1.15's retention rule** for editing records. This project names those records in the consent text (§6).
- **The consent wording and the data protection officer's review (G1.4).** §6 is the list the wording must cover.
- **The protocol (G1.5)** and the de-identified derived dataset.
- **The analysis, the distance library and calibration (G1.6).**
- **G2.1's base-text guard itself.** This project gives it the column it needs.
- **Events from other surfaces:** the Pass 2 localization editor, the terminology routes' term decisions (they
  arrive with B3), and figure edits (figure review is closed to non-admins for chemistry, R-22,
  `server/lib/heldBookWrites.js:18-26`).

**Anti-goals: it fails even if it works, if**
- a withdrawal, the retention deletion or an outage of the research file changes what an editor sees or can do;
- a research write fails an editor's act;
- a decliner's or an undecided editor's activity reaches the research file beyond what R1 allows (a reference to the
  edit and a hash of its text, in a consenting actor's event), or enters any research figure;
- a row is written whose base the editor did not see (a stale base, or the wrong copy of a duplicated id);
- the opened time is set by a serve that is not an assigned editor's;
- research data reaches a browser, or any route can read it;
- the consent text promises a deletion that some copy breaks.

## 4. [USER]'s rulings and answers (2026-11-03)

[USER] chose from options in the brainstorm. Each was the recommended option. The same day [USER] answered this draft's
three questions, again with the recommended option (§14): **A1** reads R3, **A2** fixes R5's export, and **A3** accepts
loss notes that outlive R2's 7 days, with the consent text saying so. §12 item 0 moves all nine to a decision record
(`docs/decisions/2026-11-03-research-capture-consent-and-retention-rulings.md`),
since they bind items beyond this project.

**R1. Decliners: "Finished text only".**
A decliner's approved, licensed text counts in the per-unit change figure (pure MT → approved final, for each of the
134 units), so the contract figure stays whole. Nothing about how or when they worked is captured: no events, no
assists, no times. The consent text says so plainly. When a consenting head editor approves, rejects or otherwise
acts on a decliner's edit, the reviewer's event references the edit and carries no key or link for its author.
- *For the design:* there are two outputs with two sources. The **contract figure** reads committed files at the
  end-of-editing tag (pure MT from `02-mt-output`, the final text from `03-faithful-translation`) and the per-segment
  state in the end-of-editing export (§5.19, A2), for every unit and every editor. A segment whose approved text is not
  applied by the tag counts as incomplete (state `reviewed-but-unapplied`). The reviewed share is a count of segments
  by that state, which carries no `by` or `at` field; the figure never reads `segment_edits` or the review-status
  sidecar itself. The **research figures** (decomposition, time, assists, suggestion rates) read only what §5.22
  allows. The logging call drops decliners before any write (§5.11). Reviewer events never carry an author key and
  carry only a hash of another person's text (§5.9).

**R2. Backups of the research file: "Own 7-day rotation".**
The research file is backed up on its own 7-day rotation, locally and off-box (encrypted, under its own name prefix),
apart from the editorial database's tiers. A deletion (a withdrawal or the retention date) is therefore complete
within 7 days, and the consent text says so. **Precondition:** a read-only production check that no whole-disk backup
(Linode Backups) or `tar` job also copies the file. If one does, the promise is false and must be fixed before consent
is collected.
- *For the design:* §5.15, §5.17, and checks G-1a, G-1b and G-1h in §9. The off-box copies go to their own bucket
  rather than under a prefix (§5.17). The loss notes are the one record that outlives the 7 days (A3, §5.11).

**R3. Records kept for every editor: "Name them, never research".**
The consent text lists the editing records the tool keeps for everyone (the opened time, saved edits with their
times, who rejected or left open a suggestion, `activity_log`, the server's request log) as editing records under the
ordinary retention rule (G1.15). The frozen protocol (G1.5) forbids using them as research data for anyone: research
figures come only from the research file. Identity and time are left out of new records wherever that costs nothing.
A withdrawal before publication means results are recomputed without that editor; aggregates already published stay.
- *For the design:* every new `sessions.db` table and column is checked against "does the tool need this identity or
  this time?" (§5.2, §5.5, §5.8, §5.11, §5.13). Behavioural detail (assists, the acceptance origin, client times)
  goes only into research events. §5.22 says exactly what a research figure may read, as [USER] answered in A1.

**R4. Duplicate segment ids: "G1.12 first, refuse meanwhile".**
G1.12's fix lands before any of the 83 affected modules opens. This project adds an occurrence field everywhere it
keys segments, and refuses a save or accept on a duplicated id it cannot place, so no record of the wrong copy is ever
written.
- *For the design:* §5.2 (no served-version row for a duplicated id), §5.3 and §5.7.

**R5. The per-unit manifest in G1.1's row: "Freeze manifest + end export".**
Replace it with (a) G1.7's freeze manifest, committed in full at the freeze (it holds no editor data, so there is
nothing to hide), and (b) an end-of-editing export listing, for each edit, the served version it was made on, with no
editor key and no time, which G3.2 reads. Reason: D7 was decided before this ruling (Skerfur §3), so there is no arm
to hide, and a per-unit commit at opening would leak when an editor started through the public commit time.
- *For the design:* §5.19. The same leak already exists through the MT lock marker, which publishes the time of each
  unit's first edit; §5.19 closes it. A2 fixes the export's shape: one line per segment, for its final text, not one
  per edit.

**R6. Order: "Switch on, then assign".**
Chapters are assigned (G1.13) only after G1.23's suggestion view is switched on in production. If G1.23 slips,
[USER] decides again then.
- *For the design:* the opened predicate needs an assignment row (§5.5), so no unit can open before assignment. Check
  G-1d (§9) finds any chemistry rows that already exist; the opening step records those units honestly either way.

## 5. The design

### 5.1 The research file, its connection and its schema

| Part | Design |
|---|---|
| File | `pipeline-output/research.db`. `pipeline-output/` is gitignored (`.gitignore:59`). Not `server/research.db`: the repository has no `*.db` rule, so that file would be tracked, and the repository is public. |
| Path | `server/lib/researchDbPath.js` derives it from `resolveDbPath()` (`server/lib/dbPath.js:10-15`): the same directory, with `sessions` in the file name replaced by `research`. So `e2e-sessions.db` gives `e2e-research.db`. **If the file name holds no `sessions`, `.research` is inserted before the extension** (`acc-test-1.db` → `acc-test-1.research.db`); several existing suites set such names (`server/__tests__/acceptanceService.test.js:24`, `acceptanceApply.test.js:22`, `crossBookAuthz.test.js:11`), and a plain replace would point the research file at the editorial test database. `researchDb` refuses to open, as *unavailable*, when the derived path equals `resolveDbPath()`. So every test, script and E2E run that redirects `sessions.db` through `SESSIONS_DB_PATH` redirects the research file too. No second environment variable, so the server (which loads `.env`, `server/index.js:24`) and the cron scripts (which do not) cannot disagree. Never `process.cwd()`. |
| Connection | One service module, `server/services/researchDb.js`, with a lazy cached handle, WAL mode and a `_setTestDb` seam (the model is `server/services/activityLog.js:61-73`). **Opened with `{ timeout: N }`, N small** (100 ms to start; an enforceable value in that module, pinned by a test). better-sqlite3's default wait is 5000 ms, and the wait is synchronous: it blocks Node's event loop, so a research write stuck behind the deletion script's `VACUUM` would stall every editor's request. A busy research write fails fast and becomes a counted loss (§5.11). No `ATTACH`: none exists anywhere, and atomicity would be per file anyway. No foreign key crosses files; research rows hold `sessions.db` ids as plain integers, with a hash beside each so a join can be checked by value (§5.9). |
| File mode | Before the first open: `fs.closeSync(fs.openSync(p, 'a', 0o600)); fs.chmodSync(p, 0o600)`. SQLite then creates `-wal` and `-shm` with the same mode. better-sqlite3 takes no mode option. |
| Schema | `server/lib/researchSchema.js` exports `ensureResearchSchema(db)`: an ordered list of idempotent steps gated by `PRAGMA user_version`, inside one never-throw boundary around the whole call (the shape of `server/migrations/048-book-term-preference.js:373-392`). **Never in `server/migrations/`:** `server/__tests__/helpers/freshMigratedDb.js` applies every file there to `sessions.db`, and `migrationRunnerCoverage.test.js` demands each one be in the editorial runner. One test runs it on a fresh file and again on the result. |
| Boot | The research schema runs after the editorial migrations (`server/index.js:33-45`). A failure marks the research file *unavailable* in memory; **the server always boots.** While unavailable, `record` retries the open and schema at most once a minute, and success clears the state. A corrupt file (`SQLITE_NOTADB` or `SQLITE_CORRUPT`) stays unavailable until an operator restores it (§5.17). |
| Missing file | The server creates `research.db` only while `sessions.db` holds no *consented* `research_consent` row. If such a row exists and the file is missing, research is unavailable (reason `missing`, §5.20) and the file is **not** recreated, because a fresh file would silently re-key every editor and detach all earlier data. Only an admin script creates or restores it. Every research script opens it with `{ fileMustExist: true }` and exits non-zero when it is absent. |
| Tests and E2E | Unit tests use the seam or set `SESSIONS_DB_PATH` before `require`. The E2E config's `rm` line adds the research file and its `-wal` and `-shm` (`server/e2e/playwright.config.js:5`, `:34-39`). |

**What lives where.**

| `sessions.db` (editing record; the screen may read it) | `research.db` (research rows; nothing on screen reads it) |
|---|---|
| `served_text_versions` (§5.2) | `research_events` (§5.9) |
| `module_openings`, `module_opening_inflight` (§5.5) | `research_event_items` (§5.10) |
| new columns on `segment_edits`, `segment_acceptances` (§5.8) | `editor_keys` (§5.16) |
| `book_switch_events` (§5.13) | |
| `research_consent`, `research_deletions`, `research_derived_datasets` (§5.14, §5.15) | |
| `research_capture_losses` (§5.11) | |

### 5.2 The served-version table (G1.1)

The table is named **`served_text_versions`**. It is not `content_versions`, which is an apply-time snapshot
(`server/migrations/031-content-versions.js:11-23`).

| Column | Type | Meaning |
|---|---|---|
| `id` | INTEGER PK AUTOINCREMENT | the served-version id that edits, acceptances and events reference. Never exported (§5.19) |
| `book` | TEXT NOT NULL | |
| `chapter` | INTEGER NOT NULL | appendices are `-1` (`server/middleware/validateParams.js:23-26`) |
| `module_id` | TEXT NOT NULL | as the route names it, so `chapter-metadata` for chapter metadata |
| `segment_id` | TEXT NOT NULL | as served |
| `occurrence` | INTEGER NOT NULL | §5.3; 0 until G1.12 |
| `en_sha256` | TEXT NOT NULL | sha256 of the served `en` string |
| `is_sha256` | TEXT NOT NULL | sha256 of the served `is` string (§5.3) |
| `layer` | TEXT NOT NULL | the loader's `isSource`: `mt-output` or `faithful` (`server/services/segmentParser.js:114-121`); `selected` if the 10-10 plan's step 4.1 switches the loader to selected MT (`02-mt-selected/`) |
| `en_text` | TEXT NOT NULL | the exact served `en` *(Claude's call: the plan asks for "the text"; keeping the English too makes source drift readable, at about the size of the Icelandic)* |
| `is_text` | TEXT NOT NULL | the exact served `is` |

- **Unique key:** (`book`, `chapter`, `module_id`, `segment_id`, `occurrence`, `en_sha256`, `is_sha256`, `layer`), all
  NOT NULL, since SQLite treats NULLs as distinct in a unique index. One row per distinct key: serving the same text
  again adds nothing, and the row does not record which serve came first. The key is the Skerfur plan's six parts plus
  `chapter` (chapter metadata uses one module id for all 21 chapters) and `layer` *(Claude's call: the layer is in the
  key)*.
- **Why the layer is in the key:** after the hold lifts, the first apply writes the whole module into
  `03-faithful-translation`, so unedited segments are served with MT bytes under the label `faithful`. Without the
  layer, whichever label was recorded first would win. The same Icelandic text served first as MT and later labelled
  faithful therefore gets two rows. The stale check (§5.6) compares only `is_sha256`, so a relabel alone never refuses
  a save.
- **No layer, no row.** When `isSource` is `null` (neither a faithful nor an MT file exists), nothing is minted for
  that module and a write to it is refused (§5.6).
- **No person and no time.** The row has no user and no creation time (R3). It is not an opened time and says nothing
  about a first serve (G1.23 §8 item 2).
- **Whether a row is the frozen base is a join, not a column.** G1.7's manifest lists (book, chapter, module, segment,
  occurrence, `en_sha256`, `is_sha256`) at the freeze, and a served-version row matches it on those values (§5.19).
- **Source drift is a query.** The same (segment, occurrence) with a new `en_sha256` is a renumbering or a
  re-extraction. CLAUDE.md says nothing else in the pipeline detects source drift under a stable id.
- **Duplicated ids before G1.12 get no row (R4).** Both occurrences carry the last copy's Icelandic
  (`segmentParser.js:135`), so for 75 of the 285 ids a row would record the wrong copy. Until the lookup is
  occurrence-aware, an id that occurs more than once in the served list gets no served-version row and no
  `baseSha256`. Saves and accepts on it are refused (§5.7), and G1.23 shows it no suggestions (G1.23 §6.4).
- **Size.** One full serve of chemistry adds about 19 MB to `sessions.db` (table and unique index), once per distinct
  set of versions; the editorial backups keep 30 copies (`scripts/backup-db.sh`).

### 5.3 The hash and the occurrence

**The hash.** `sha256` of the UTF-8 bytes of the exact `is` string in the route's response object, full 64-character
lowercase hex: `crypto.createHash('sha256').update(s, 'utf8').digest('hex')`. That is the change records' function
(`tools/lib/mt-layers.js:71`), so G1.1's hash is directly comparable with `beforeSha256`. It is never truncated. An
untranslated segment's `is` is `''` and is hashed as such.

The string is built in four steps, and the hash covers the result of all four:
1. trim of each record (`tools/lib/seg-markers.cjs:65`, `:74`);
2. `normalizeWraps` (`server/services/segmentParser.js:44-52`; `tools/lib/mt-normalize.cjs:20`);
3. `unescapeMtMarkers`, Icelandic only (`segmentParser.js:134`; `mt-normalize.cjs:38`);
4. `normalizeTermMarkers(en, is)` at pairing (`segmentParser.js:163-165`; `mt-normalize.cjs:58`). It reads the
   English, so a change to the English alone can change the served Icelandic.

The hash is computed **from the response object, in the route**, never re-derived from the file. Measured on the
sweep: today the four steps change nothing on any served row in any book, so a hash of the raw body would match every
real row. Only constructed fixtures can tell the two apart (§10, test T2).

One function, `sha256Text(s)`, in a new `server/lib/servedText.js`, is the only place the hash is computed. **G1.23
§6.3 reads `seg.baseSha256`; it never hashes its own copy of `is`** (one mechanism, not two; G1.23 §6.3). The server is
CommonJS and `mt-layers.js` is ESM, and `mt-layers.js`'s `sha256` is not exported, so the one-line function is ported.
A test compares `sha256Text(x)` with `buildChangeRecord({…, before: x}).beforeSha256` (`mt-layers.js:702`, `:712`)
and with committed `beforeSha256` values.

**The occurrence.** The 0-based ordinal among segments with the same id, in served order. The route computes it with
its own non-throwing per-id counter and adds only `occurrence`. It does not reuse `withOccurrences`
(`tools/lib/seg-markers.cjs:120-127`), which also adds a `key` field and calls `occurrenceKey` (`:94-109`), which
throws on an id holding `#`. No served id holds one today, but a throw there would turn the module route into a 500.
The loader returns no occurrence (`segmentParser.js:157-170`).
- **Served order is the English file's order;** the change records count in the Icelandic file's order
  (`tools/lib/mt-layers.js:177`). Six chemistry modules hold the same ids in a different order on the two sides (sweep,
  data report F23). So **records are joined on (id, occurrence), never on position**, and check G-4 (§9) must show
  that the k-th English copy and the k-th Icelandic copy agree for all 285 duplicated ids.
- **An occurrence column exists from day one** on every new keyed table and every new editing column (R4). Its value
  is 0 for every saved row until G1.12 lands.

### 5.4 The serve hook

**Where.** Only in `GET /:book/:chapter/:moduleId` (`server/routes/segment-editor.js:264-332`), after the loader
call (`:272`) and before the single `res.json` (`:320-326`). **Not inside the loader:** it has 17 callers outside the
tests, among them `propagationService.findOccurrences`, which loads every module of the book
(`server/services/propagationService.js:197-201`), so a hook there would record serves no client received. Head-editor
review uses the same route. The other routes that return Icelandic (`/repetitions` `:1405`, `/propagation-preview`
`:1427`, `/preview` `:1894`, `/reviews/:reviewId` `:145`, `/versions/:version` `:1792`, `/segment-history/:segmentId`
`:1860`) mint nothing.

**What it does, per load:**
1. Add `occurrence` to each served segment (§5.3).
2. Compute `baseSha256 = sha256Text(seg.is)` for each segment whose id is not duplicated (§5.2). This is pure
   computation and cannot fail on the database.
3. In one `sessions.db` transaction, select the existing served-version ids by key and insert only the missing rows.
   An unchanged module then takes no write lock.
4. Run the opening step (§5.5).
5. **G1.23's suggestion step runs here,** after steps 2 and 4, in the same request. It reads `seg.baseSha256` from
   step 2 and the opening row and snapshot from step 4, so a module's first serve already applies §6.2 and §6.3a.
6. Add to the response: per segment, `occurrence` and `baseSha256`; per edit row, `contentSha256` (sha256 of its
   `edited_content`, computed in the route, not stored). Nothing else is added. The response already sends every
   editor's edit rows (`server/services/segmentEditorService.js:242`) and every active acceptance row
   (`server/services/acceptanceService.js:231`) through `SELECT *`, so it must never carry a research field (§5.8),
   nor an opened time or switch time (§11).

**Scope.** It records served versions for every book except Organic Chemistry (`lifraen-efnafraedi`), which is not
translated (CLAUDE.md § Organic). Other books need them because the stale-base check (§5.6) applies to every save, not
only the study book's. An organic module gets no `baseSha256`, and §5.6 refuses any write to it. *(Claude's call:
every book but organic.)*

**Fail-soft minting, fail-closed opening.** If step 3 fails, the module is served anyway, with `baseSha256` (step 2
does not need the database), and the failure is logged. The save path mints the version it compares against, so a
failed serve-time write never blocks a save. The opening step is different: if the predicate holds and step 3 failed,
or the opening step cannot run or fails, the route answers **503 `OPENING_UNRECORDED`** for that one serve and step 4
records nothing, so no editor works on a unit whose opening, with its served versions, was not recorded. The client
does not retry: `loadModule` shows its load error and returns to the module list (`segment-editor.js:303-307`;
`fetchJson`, `server/public/js/htmlUtils.js:34-58`, has no retry), and the editor opens the module again. Every other
module, and every serve that does not meet the predicate, is untouched. *(Claude's call: locking an editor out over
bookkeeping contradicts G1.23's fail-soft precedent, except for the one serve whose record G1.23 §6.2 depends on.)*

**Cost.** Measured on 2026-11-03 over all 170 chemistry modules: on the largest (`m68865`, 1,485 segments) the loader
takes 10.1 ms, hashing 2.8 ms, and a repeat select-and-insert 5.9 ms; on the mean module under 1 ms each. No cache.

### 5.5 The opened time and the §6.3a snapshot

**Tables (`sessions.db`).**

`module_openings`

| Column | Meaning |
|---|---|
| `book`, `chapter`, `module_id` | primary key. **The chapter is in the key:** `chapter-metadata` is one module id for 21 chapters. Appendices are `-1`. |
| `opened_at_ms` | server time in milliseconds, set once |
| `inflight_count` | how many segments the snapshot holds |

There is **no user column** (R3). Who opened the unit is captured only as a `module-opened` research event, for a
consenting editor (§5.9).

`module_opening_inflight`

| Column | Meaning |
|---|---|
| `book`, `chapter`, `module_id`, `segment_id`, `occurrence` | primary key. `occurrence` is NOT NULL; `-1` means every occurrence of the id, because older edit rows carry no occurrence |

**The predicate.** At a module serve, the opening step runs only if all of these hold:
- the book is on the study allowlist (§11);
- no `module_openings` row exists for (book, chapter, module);
- `userService.findByProviderId(req.user.id)` finds a `users` row (the token carries the provider id, not `users.id`;
  `server/middleware/requireRole.js:274`), and **a `user_chapter_assignments` row exists for that `users.id`, book and
  chapter**. This is a direct lookup.

It does **not** reuse `hasChapterAccess` or `requireBookAccess`. These pass without any row of one's own: admins
(`requireRole.js:256-258`), the book's head editors (`:261-264`) and four fail-open branches in `hasChapterAccess`
(`server/services/userService.js:632-635`, `:641-647`, `:666`, `:677-678`). The last branch lets anyone through who
holds no assignment row in the book (`:653-657`), so an unassigned editor can open modules while colleagues hold
assignments. Visitors cannot reach the route (it requires the editor role) and have no `users` row. The legacy
`chapter_assignments` table (migration 012) has no reader and is not used. A user who holds a row counts, whatever
their role (G1.23 §6.2: the row decides, not the role).

**The step,** in one `sessions.db` transaction:
1. `INSERT OR IGNORE` the `module_openings` row.
2. If it inserted, take the snapshot: every served segment that has **an in-flight edit from any editor**. The route
   already holds every editor's rows (`server/routes/segment-editor.js:279`). Filter them to the ids served in this
   load (a chapter-metadata load sees every chapter's rows, `segmentEditorService.js:239-253`), and test each with
   `isEditInFlight`, required from `server/public/js/accept-eligibility.js` (a UMD module that exports for Node,
   `:79`; the route already requires `segment-validation` the same way, `segment-editor.js:42`). "Any in-flight edit"
   matches the acceptance block, `edits.some(isEditInFlight)` (`accept-eligibility.js:56`), and its SQL twin
   (`server/services/acceptanceService.js:99-105`), not the client's display rule, which looks only at the newest
   edit. *(Claude's call: any in-flight edit, not only the newest.)*
3. Write `inflight_count`.

**After commit:** call the logging call with `module-opened` (§5.9), carrying the served-version ids at opening and
the list of duplicated ids, which get no served version (§5.2).

**Facts the builder must keep.**
- Set exactly once and never moved: a later serve by anyone, of any role, leaves the row byte-identical.
- It belongs to this project, not G1.23, and ships before any unit opens (G1.23 §6.2, §8 item 2).
- Chapter 0 cannot be served (`validateParams.js:29`), so `ch00/m68662` never opens, though propagation can write to it.
- **A non-empty snapshot is expected** where re-attach has run: a re-attached June segment is an in-flight row under
  the hold, which is the case G1.23 §6.3a was designed for (G1.23 §6.3). The per-module gate (Skerfur §3.1)
  supersedes older rows before a module opens, so the step writes a server warning only when the snapshot holds an
  in-flight row whose `origin` is not `re-attach`. On production today chemistry's in-flight human text sits in
  approved-but-unapplied rows (§12, correction 1).
- A failed step is never recorded late: the serve that met the predicate answers 503 (§5.4), and the next serve that
  meets it runs the step afresh. So the opened time and the snapshot always come from the first serve that met the
  predicate and reached the editor.

### 5.6 Refusing a stale base at save and accept

**The rule.** The client echoes the `baseSha256` it was served for that row. The server re-derives the current base
at the write and refuses on any mismatch. The precedent is MT acceptance, which already re-derives and returns
409 `STALE_CONTENT` (`server/services/acceptanceService.js:82-95`).

**One service function for every edit writer.** `saveOnServedBase(…)` in a new `server/services/servedEdit.js` is the
only way to write a `segment_edits` row on a served base. The save route, re-attach and any script call it; none calls
`saveSegmentEdit` directly for a study book. It takes `requireEcho`: `true` from the route, `false` from re-attach and
scripts. In order:
1. If the book is `lifraen-efnafraedi`, refuse: **409 `BOOK_NOT_MINTED`**.
2. Load the module with the loader. If the module has no layer (§5.2), refuse.
3. Place the segment by (id, occurrence). If it cannot be placed, refuse (§5.7).
4. If `requireEcho`: **409 `BASE_MISSING`** if the body has no `baseSha256` → **409 `STALE_BASE`** if it differs from
   `sha256Text(current is)` → **409 `STALE_DISPLAYED`** if `displayedEditId` is set and that row is gone or
   `sha256Text` of its current `edited_content` differs from `displayedEditSha256`.
5. The marker backstop (`segmentValidation.validateStructure` against the loaded base, today in the route,
   `segment-editor.js:405-417`), for every caller.
6. Mint the current base's served-version row and save with the **server's** base, in one `sessions.db` transaction:
   `originalContent` becomes the current `is`, not the client's `originalContent || ''`
   (`server/routes/segment-editor.js:424`). A withdraw is decided by `editedContent === current is`, not by comparing
   two client values (`segmentEditorService.js:110`).

**Save (`POST /:book/:chapter/:moduleId/edit`).** The existing conflict check (`checkEditConflict`, `:370`) runs first,
then `saveOnServedBase` with `requireEcho: true`.
- **A missing hash is refused, never skipped.** Skipping the check when the field is absent would let through exactly
  the saves it exists to stop: a page loaded before this deploy, or a save `saveRetry` queued up to an hour earlier
  (`server/public/js/saveRetry.js:26`), sends no `baseSha256`. Today's client always sends a numeric `baseEditId` (0
  when it saw no edit, `server/public/js/segment-editor.js:2077-2084`), and the server skips the conflict check only
  for bodies without one (`segmentEditorService.js:58-59`): the same trap. *(Claude's call: refuse.)*
- **The displayed edit is checked too.** An edit keeps its id through a re-save (`segmentEditorService.js:146-151`),
  so `baseEditId` passes when another editor has re-saved the text on screen. The Skerfur G1.1 row asks for a save on
  a displayed version that is no longer current to be refused; this is that check.

**Accept (`POST …/accept`).** Steps 1–3 run first, so a duplicated id is refused before `acceptanceService`'s
`existing` lookup (`acceptanceService.js:161-168`), which would otherwise return the first copy's row as
`alreadyAccepted`. Then the value check `acceptedContent !== seg.is` stays; it is stronger than a hash, and the client
now reads `acceptedContent` from the row's DOM (§5.18). The accept mints the current base's served-version row, stores
its id and the occurrence on the acceptance row (§5.8), and accepts `acceptOrigin` for the research event only
(§5.10). An `alreadyAccepted` result writes nothing and logs no event.

**Propagation targets** were never served to the propagating editor. `findOccurrences` already loads each target
(`server/services/propagationService.js:201`, `currentIs` at `:216`). For each target, propagation places it (a
duplicated id is skipped and listed in the response, not written *(Claude's call: skip)*), mints a served-version row
from that text, and writes origin `propagation`. Both writes carry it: the INSERT (`:153`) and the in-place UPDATE of
the propagator's own pending row (`:92-96`), which today sets only `edited_content`, `category`, `editor_note` and
`created_at` and must also set `original_content`, `served_version_id`, `occurrence` and `origin`, as §5.8's re-save
rule does.

**The client keeps the typed text** on every refusal (§5.18): a 409 today reloads the module (`:2061-2065`), and a
queued replay that gets any non-5xx answer is dropped with a toast (`saveRetry.js:149-157`). Both paths must keep the
text first.

**A refusal is logged.** It writes nothing in `sessions.db` and logs a `write-refused` research event with the reason
and both hashes, no text. The pilot reads instrument health (Skerfur §4.1), and how often the guard fires is part of
it. *(Claude's call: log refusals.)*

**Writers with no client view.**
- **Re-attach by content** (10-10 plan 4.2; unbuilt at `3a1db909`) calls `saveOnServedBase` with origin `re-attach`
  and `requireEcho: false`, so its rows get the server's base, a served-version id and an occurrence. It skips and
  lists a duplicated id, as propagation does. Today's id-based script parses on its own
  (`scripts/reattach-segment-edits.js:37-56`) and calls `saveSegmentEdit` directly (`:235-246`); it is retired, or
  refuses the study book.
- **`server/scripts/close-pending-edits.js`** writes raw SQL (`:176-200`). It is meant to run before the study, under
  the hold. This design does not log its writes, so it must not run once any unit has opened.

### 5.7 Duplicated ids until G1.12 (R4)

- **The order:** G1.12 lands before any of the 83 affected chemistry modules opens. The refusal below is the safety
  net.
- **The refusal:** a save or MT acceptance on a segment id that occurs more than once in the module's served list is
  refused with **409 `DUPLICATE_ID`**, unless the server's lookup is occurrence-aware (G1.12 option b) and the body
  carries a valid occurrence. Until then the occurrence of such a write is unknowable: every server lookup takes the
  first copy by `.find` (`server/routes/segment-editor.js:395`, `:1442`, `:1501`;
  `server/services/acceptanceService.js:83`; `server/services/segmentEditorService.js:291`, `:316`), and the client's
  two rows share one DOM id (`cssId`, `server/public/js/segment-editor.js:2458-2460`).
- **What is written:** no served-version row (§5.2), no edit row, no acceptance row, no event but a `write-refused`
  event. The typed text stays on the client (§5.18).
- **After G1.12 (a)** (extraction fix) there are no duplicates and the rule never fires. **After G1.12 (b),** every
  acceptance and pending-edit key includes `occurrence`: `idx_segment_edits_one_pending`
  (`server/migrations/039-segment-edit-exit-path.js:102-104`), `idx_segment_acceptances_one_active`
  (`server/migrations/043-segment-acceptances.js:36-37`), the `existing` lookups (`acceptanceService.js:161-168`,
  `:183-188`; `segmentEditorService.js:99-104`), and the module response's maps keyed on `segment_id`
  (`segment-editor.js:290-311`). Older rows carry `occurrence` NULL, and SQLite treats NULLs as distinct in a unique
  index.
- **Measured:** 285 ids, each twice, in 83 of 149 chemistry modules. For 75 of them the two Icelandic copies differ, so
  the screen shows the second copy's Icelandic beside the first copy's English. Only `m68726` and `m68747` have change
  chains whose copies differ.

### 5.8 New columns on the editing rows

**`segment_edits`**

| Column | Meaning |
|---|---|
| `served_version_id` | the base the current text was made on (§5.2) |
| `occurrence` | §5.3 |
| `origin` | the write path, stamped by the server: `editor-save`, `propagation` or `re-attach` (§5.10) |
| `displayed_edit_id` | the in-flight edit that was on screen when this text was saved, or NULL when the base was shown |
| `displayed_edit_sha256` | that edit's `contentSha256`, as the client echoed it from the module response |

**`segment_acceptances`:** `served_version_id`, `occurrence`.

- **NULL on every older row.** It means "made before G1.1". No backfill: those rows were made on an older MT
  (`server/lib/applyHold.js:1-13`), so any backfilled value would be false. G2.1 treats NULL as unknown.
- **A re-save updates them.** On the UPDATE path the server sets `original_content`, `served_version_id`, `occurrence`
  and the displayed pair to this save's values, since the row's text is now made on this save's base. The research
  event keeps the before-image (§5.9). Today `original_content` is written only on insert. *(Claude's call: a re-save
  moves the base record; the builder checks every reader of `original_content` first, §13.)*
- **Nothing the tool does not need.** The module route sends every editor's rows to every browser through `SELECT *`
  (`segmentEditorService.js:242`, `acceptanceService.js:231`), so a column here is visible to all editors and is kept
  for decliners too. These columns describe **what an edit was made on and how the row was produced**, which the tool
  and R5's export need. **How an editor worked** (the assist list, click or keyboard acceptance, client times) is
  behaviour the tool does not need, so it goes only into research events. So acceptance rows get no origin column,
  though the Skerfur row says "acceptance rows carry an origin". *(Claude's call: no origin on acceptance rows.)*
- **Why `origin` is on the edit row.** The server knows it, it changes how the row must be read (a propagated row was
  never served to its author), and today a propagated row differs from a typed one in five ways, the visible one
  being an editable default note (`server/routes/segment-editor.js:1514`). The consent text names it (§6 item 14).
- **Migrations** for these columns follow the never-throw rule (`048`). A swallowed `ALTER` leaves saves failing on a
  missing column, so `/api/health` checks that every new column exists (§5.20); every boot re-runs the migrations, so a
  restart retries it.

### 5.9 The event log (G1.2)

**`research_events` (`research.db`)**

| Column | Meaning |
|---|---|
| `id` | a random 63-bit integer, not AUTOINCREMENT: after a withdrawal, gaps in a counter would show how many acts the withdrawn editor made and between which neighbours *(Claude's call: random ids)* |
| `key_seq` | the editor's own counter (1, 2, …) under their key, so each editor's acts are ordered; acts of different editors are ordered only by `server_time_ms` |
| `event_type` | the vocabulary below |
| `editor_key` | the actor's random key (§5.16) |
| `client_action_id` | random id the client mints when the editor acts, carried through `saveRetry`. Unique per `editor_key` when present, so a replay of an act the server already recorded writes nothing new. NULL for server-only acts |
| `client_action_time_ms` | the client clock at the act; NULL for server-only acts |
| `server_time_ms` | server time at the write, in milliseconds |
| `replayed` | 1 when the body came from `saveRetry`'s queue |
| `session_id` | G1.3's per-page-load id (§5.10); NULL until G1.3 |
| `book`, `chapter`, `module_id`, `segment_id`, `occurrence` | where. `segment_id` is NULL for module-level acts |
| `served_version_id`, `base_is_sha256` | the base the act was made on (a `sessions.db` id, plain integer), and that version's `is_sha256`, so a join survives a restore of `sessions.db` only if the values agree |
| `editing_kind`, `editing_id`, `editing_content_sha256` | which editing row the act wrote or acted on, and the sha256 of its text at that moment. Kinds: `segment_edit`, `segment_acceptance`; reserved for G1.23: `suggestion_rejection`, `suggestion_left_open` |
| `origin` | the write path (§5.10) |
| `content_json` | the act's content, where there is content; see the filter rule below |
| `before_json` | the before-image of a destructive write; see the filter rule below |
| `detail_json` | type-specific fields (table below) |
| `flag_snapshot_json` | §5.13 |
| `server_commit`, `commit_source`, `code_dirty` | §5.12 |

**Event types.** The plan lists save, withdraw, delete, approve, reject, apply and restore. The code changes more than
that (the sweep's write-path map), and G1.23 adds two. Every one has a human actor; the system's side effects ride on
the act that caused them. Notes and comments are free text that can quote or name another person, so they are stored
only as length and sha256 *(Claude's call: no free text)*.

| Type | Written when | Content | Before-image | Detail |
|---|---|---|---|---|
| `module-opened` | the opening step (§5.5) | — | — | served-version ids at opening; the duplicated ids; `inflight_count` |
| `edit-save` | a save inserts a row, or re-attach inserts one | text, note (length, sha256), category | — | items (§5.10); the displayed pair; superseded acceptance ids; own discuss or rejected rows superseded in the same transaction |
| `edit-resave` | a save updates the caller's pending row (`segmentEditorService.js:146-151`) | text, note (length, sha256), category | previous text, note (length, sha256), `created_at`, base | items; the displayed pair; superseded ids |
| `edit-withdraw` | an unchanged save deletes the caller's pending row (`:110-112`) | — | the deleted row | — |
| `edit-delete` | `DELETE /edit/:editId` (`segment-editor.js:976`; no UI caller) | — | the deleted row | — |
| `edit-approve`, `edit-reject`, `edit-discuss` | the review routes (`:1091`, `:1125`, `:1158`) | the reviewer's note (length, sha256) | previous status | the hash the client echoed (§5.18) and a mismatch flag |
| `edit-unapprove`, `edit-return-to-pending` | `:1191`, `:1218`; both null the reviewer fields (`segmentEditorService.js:525`, `:571`) | — | previous status and reviewer fields, filtered | — |
| `edit-comment` | `:1306` | the comment (length, sha256) | — | — |
| `module-submit` | `:1001` | — | — | the edit ids it stamped |
| `review-complete` | `:1246`; it also applies | the reviewer's notes (length, sha256) | — | the `apply` event it caused |
| `apply` | `:1636`, `/apply-and-render`, or review completion | per row: winner applied, losers superseded (when edits compete for one segment) | each loser's overwritten `reviewer_note` (length, sha256); the edit and acceptance ids whose `applied_at` the self-heal reset (`applyApprovedEdits` clearing `applied_at` when a faithful file is missing, `segmentEditorService.js:891-926`) | lapsed acceptance ids |
| `restore` | `:1818` | the version restored | — | lapsed acceptance ids |
| `propagation` | `:1477`, one event per target row | the text written | the target row, if it was updated in place | the client's text; the sha256 of the text the preview would classify now (`latestEditedText ?? is`, `:1444-1446`) and `preview_source` (`own-edit`, `other-edit` or `base`), with the text itself only for `own-edit` or `base`; the target's base; skipped targets |
| `mt-accept` | `:871` | — (the served version identifies the text) | — | `acceptOrigin` |
| `mt-accept-revoke` | `:942` | — | previous status | — |
| `suggestion-reject` | G1.23's *Hafna*, one per change | — | — | one item: the change's fields (§5.10); the client's echoed `baseSha256` and a mismatch flag |
| `suggestion-left-open` | a segment finished with groups open, one per change | — | — | one item; the finishing act, `stadfesta-mt` or `approval` |
| `write-refused` | §5.6, §5.7 | — | — | reason code; echoed and current hash |

`latestEditedText` is the newest live edit on the source segment **by any editor** (`propagationService.js:173-182`),
which is why its text is stored only when it is the actor's own or the base.

**Where each event gets its served version.**

| Event types | `served_version_id` |
|---|---|
| `edit-save`, `edit-resave`, `mt-accept`, `propagation` | the version the write minted (§5.6) |
| `edit-withdraw`, `edit-delete` | the deleted row's |
| the review events, `edit-comment`, and `suggestion-left-open` on approval | the edit row's |
| `mt-accept-revoke`, and `suggestion-left-open` on *Staðfesta MT* | the acceptance row's |
| `suggestion-reject` | the current base, minted on the server; the client's echo goes in the detail. Whether a mismatch refuses the reject is G1.23's decision |
| `module-opened`, `module-submit`, `review-complete`, `apply`, `restore`, `write-refused` | NULL; ids or hashes in the detail |

**The call's input.** `record({actorProviderId, eventType, book, chapter, moduleId, segmentId, occurrence,
servedVersionId, editingKind, editingId, origin, content, before, detail, items, clientActionId, clientActionTime,
replayed, sessionId})`. The first five are always required; the rest as the tables above say. `before` is the raw
prior row; `record` applies the filter rule, so no caller can forget it.

**Who did it, and where the before-image comes from.** `unapproveEdit(editId)` and `returnEditToPending(editId)` take
no actor, and `applyApprovedEdits` receives only a username (`segmentEditorService.js:842-843`). So events are emitted
where the actor is known: in the route, after the service returns. Every service function that deletes or overwrites
a `segment_edits` or `segment_acceptances` field returns `before` (the affected rows' prior values, read inside the
same transaction): `saveSegmentEdit` (re-save, withdraw), `deleteSegmentEdit`, approve, reject and discuss,
`unapproveEdit`, `returnEditToPending`, `applyApprovedEdits` (losers and self-heal), restore, and propagation. Today
they return none of it (`segmentEditorService.js:110-112`, `:146-151`). Re-attach emits through the same call, with
the edit's author as actor and origin `re-attach`; the consent gate then decides as for anyone else.

**The filter rule (R1).** An event may carry another person's data only as a hash.
- **Content:** a reviewer's event carries the sha256 of the text it acted on, never the text and never an author key.
  The analysis matches the hash against the author's own `edit-save` events, which exist only if the author consented.
  For a decliner's edit nothing matches, which is R1: the reviewer's act is logged with a reference to the edit
  (`editing_id`) and no key or link for its author.
- **Before-images,** field by field:

| Class | Fields | In a before-image |
|---|---|---|
| State | `status`, applied (as a boolean), `category`, `served_version_id`, `occurrence`, `origin` | always kept |
| Text | `edited_content` | kept if the actor wrote it, otherwise its sha256 |
| Free text | `editor_note`, `reviewer_note` | length and sha256 only, always |
| Base | `original_content` | left out (`served_version_id` identifies it) |
| Identity and time | `editor_id`, `editor_username`, `reviewer_id`, `reviewer_username`, `accepted_by`, `accepted_by_username`, `created_at`, `reviewed_at`, `applied_at`, `accepted_at` | kept only when they are the actor's own (the actor's identity is the key, so only their own times survive); another person's are dropped |

  So a re-save keeps the actor's own previous text and `created_at` (the first-save time survives), and an un-approve
  keeps the previous status but not who approved it. *(Claude's call: this field table.)*

**Holes the design does not fill.** With mixed consent (under SD4 (b) every editor reviews the others), acts by a
decliner are never logged, whoever's edit they act on. So when a declining reviewer approves, rejects or applies a
consenting author's edit, there is no event: that author's first completion, and the text approved at that point,
cannot be derived from events; and a left-open closed by a declining approver is not logged. A left-open closed by a
consenting approver on a decliner's segment is logged as the approver's act. G1.5 must define completion and
suggestion precision so that such units are excluded or reported as partly captured (§8).

**Append-only.** No code path updates a research row. Rows are deleted only by the two scripts in §5.15 and the
withdraw route's immediate deletion. *(Claude's call: no code may change a research row, and tests enforce this, not
a database trigger, because a trigger would also block the deletion scripts.)* A re-extraction during the study is a
dated protocol event with an old → new id map (Skerfur §4.1); G1.5 defines that map and its writer, since nothing in
this project writes or reads one.

**The storage pattern** is `localization_edits` (`server/migrations/011-localization-edits.js:13-28`): append-only,
with a previous content the server derives. Its history route, which shows other editors' times, is not copied.

### 5.10 Assists and the origin vocabulary

**Three vocabularies, kept apart.**

| Vocabulary | Values | Who sets it | Where it is stored |
|---|---|---|---|
| **Write path** (`origin`) | `editor-save`, `propagation`, `re-attach`; reserved: `note-apply` (10-10 2.2; no code at `3a1db909`), `propagated` and `ai-pass` (B3, Skerfur §4.3) | the server | edit rows and events |
| **Item type** | `repetition-insert`, `term-insert`, `markup-wrap`, `ai-suggestion`, `rule-suggestion`, `draft-restore` | the client, as a claim | `research_event_items` only |
| **Acceptance origin** | `single`, `keyboard-stream` | the client | the `mt-accept` event's detail only |

`propagation` is today's repetition route (`segment-editor.js:1477`); `propagated` is B3's inflected-form term pass
(Skerfur §4.3). They are different write paths and must never be merged in analysis. The write-path values live in
one constant, pinned by a test.

The Skerfur row puts propagation, re-attach and note-apply among assists "the client reports". None is a client report
(§12, correction 4): propagation is a server route that writes on the server, re-attach is a script, and note-apply
has no code. The server stamps the first two.

**`research_event_items` (`research.db`)**, one row per item:

| Column | Meaning |
|---|---|
| `event_id`, `ordinal` | which event; order within it |
| `item_type` | as above |
| `outcome` | `applied` (on a save), `rejected` or `left-open` (G1.23's two events) |
| `source` | `ai` or `rule` for suggestions; `tm` for a repetition; `termbase` for a term insert; `toolbar` or `keyboard` for a wrap |
| `op_id`, `occurrence`, `category`, `run_id`, `group_action_id` | G1.23 §8 G1.2 item 2. `run_id` may be NULL: rule change records allow a null run id (`tools/lib/mt-layers.js:626-627`) |
| `ruling_id`, `rule_id` | separate columns: rule change records carry `ruleId` instead of `rulingId` (`mt-layers.js:599`) |
| `client_time_ms` | when the client applied the item |
| `claim` | `validated`, `unverified` or `mismatch` |
| `detail_json` | e.g. the sha256 of an inserted term, the wrap marker; for a whole-text item, the text (below) |

- **One save can mix origins.** The list is per save: every item since the panel opened. A suggestion group taken in
  one click gives one item per change, sharing a `group_action_id` (G1.23 §8 G1.2 item 2). A `group_action_id` may
  span segments and events (the rule layer's accept-all per ruling is module-wide), with no uniqueness or locality
  constraint. Only groups whose `replace` text is still in the saved text are listed (G1.23 §7).
- **Claims are checked where the server can, marked, and never refused** *(Claude's call: check, mark, never
  refuse)*. A suggestion item is `validated` when its `op_id` exists for that segment and occurrence in the module's
  change log and passed G1.23 §6 (G1.23 supplies that check). A repetition item is `validated` when the inserted
  text's hash equals the suggestion the server would offer now. A term insert or a wrap is `unverified` (plausibility
  only). A failed check is `mismatch`.
- **Whole-text items keep their text.** A repetition insert and a draft restore replace the whole text, and Skerfur
  §4.1 measures hand effort from the text after the last whole-text assist. The repetition source cannot be found
  again later (`server/services/concordanceService.js:247-252` takes `LIMIT 1` and returns no row id), so the item's
  detail stores the full text the textarea held right after the item, its sha256, and for a repetition the source
  book, chapter and module the server returned. A repetition is applied text (`ORDER BY applied_at`), which is
  published, licensed text; a restored draft is the actor's own typing. *(Claude's call: store the text.)*
- **Why the client must report them.** Repetition insert replaces the whole text (`segment-editor.js:874-884`), term
  insert goes into the last focused textarea, which can belong to another segment (`:3261`), and markup wrap edits the
  value in place (`:3308`). Each fires an untrusted `input` event (`:881`, `:3271`, `:3332`) and makes no request.
- **`draft-restore`** marks text typed in an earlier session and restored from local storage (`:111-140`), which sets
  the value with no event at all. It matters for time: that text was not typed in this session. *(Claude's call:
  `draft-restore` is an item type.)*

**Conventions shared with G1.3** (fixed here so ticks plug in; tick capture stays out):
- the **editor key** (§5.16);
- a **session id**: a random 128-bit value per page load, issued by the server to the page. `tabGuard`'s id is per
  page load, not per tab, and is client-made (`server/public/js/tabGuard.js:15`). G1.3 builds the issuing; this
  project's events carry the column;
- **idempotency:** ticks on (`session_id`, sequence), acts on (`editor_key`, `client_action_id`);
- **never through `POST /api/analytics/event`** (Skerfur §4.1).

### 5.11 The logging call

**One call:** `researchLog.record(event)` in `server/services/researchLog.js`. Every route that changes an editing row
calls it, and G1.23 calls it for every event. **G1.23 never checks consent; the call does** (G1.23 §8 G1.2 item 1).

**Order:**
1. **The editing record is written first** and committed in `sessions.db`.
2. The route calls `record(…)` **synchronously, after the commit, inside the same request**. `record` never throws:
   its body is one try/catch. Its failure log carries only `{error code, error class, event type, book}`: no content,
   no before-image, no detail, no key and no user id, so nothing lands in journald that the deletion promise cannot
   reach (unlike `activityLog.log`, which logs a user id, `server/services/activityLog.js:197-203`).
3. The response is sent. Its status and body never depend on what `record` did.

**Inside `record`:**
1. **Study scope.** If the book is not on the study allowlist (§11), return. Nothing is counted.
2. **Who.** Resolve the actor's `users.id` with `findByProviderId`. No row (a visitor, or an unmappable account): return,
   nothing counted. Identity keys on `users.id`, which is stable; `provider_id` can be rebound by an email match
   (`server/services/auth.js:226-230`, `:244-246`).
3. **Consent.** Read the actor's current decision in `research_consent` (§5.14). Unless it is *consented*, its
   interval is live, and it names a text on the approved list (§5.14): return, **nothing counted** (R1). Counting a
   decliner's activity would itself be capture. A replayed act whose client time is earlier than the interval's start
   is also not captured and not counted: it was made before consent.
4. **Build** the row: the editor key (§5.16), the flag snapshot (§5.13), the server commit (§5.12), the filter rule
   (§5.9).
5. **Write** the event and its items in one `research.db` transaction.
6. **On any failure in steps 4–5** (the research file unavailable, busy, full, a bug), write one row to
   `research_capture_losses` in `sessions.db`.

**`research_capture_losses` (`sessions.db`)**

| Column | Meaning |
|---|---|
| `interval_id` | the actor's consent interval (§5.14); NULL only for `consent-unknown` |
| `book`, `chapter`, `module_id` | where |
| `event_type` | what was lost |
| `loss_day` | the date only, not the time (R3) |
| `error_class` | `unavailable`, `busy`, `constraint`, `consent-unknown` or `other` |
| `client_action_id` | when the act had one, so a later successful replay of the same act is not counted twice |

- It holds **no content.** It is written **only for consenting editors**, so a loss is never confused with a decline.
  The analysis counts loss rows per consent interval directly; it **never joins a loss to an editing row**, so no
  author or time field is read, and a reviewer's lost act is attributed to the reviewer, not the edit's author. It
  drops a loss whose `client_action_id` appears in an event.
- **The interval is stored so a withdrawal can delete it** from the live file (§5.15). Copies stay in the editorial
  database's backups for their lifetime, beyond R2's 7 days; [USER] accepted that in A3, provided the consent text says
  so (§6 item 6). The alternative, anonymous counts per unit, could not be removed at a withdrawal.
- **If the consent lookup itself fails** (for example a migration that silently failed to create `research_consent`,
  while saves still work), `record` writes a `consent-unknown` row with no interval, if it can, and sets an in-memory
  flag that `/api/health` reports (§5.20). The row is not linked to anyone.
- **No retry queue.** better-sqlite3 is synchronous, so the write happens in the request, and a deferred write would be
  lost at every restart: graceful shutdown calls `process.exit` without closing any handle (`server/index.js:430-441`),
  and `deploy.sh` restarts the service. Failed writes cannot wait in `sessions.db` for a retry either: research
  content would then sit in the editing database, whose backups are kept much longer than 7 days, which would break
  R2. *(Claude's call: a research row is written during the editor's request; a failed write is not tried again but
  recorded as a loss.)*
- **A duplicate** (`client_action_id` already present for that key) is not a loss: the act was already recorded.
- **The research write never blocks the server:** the connection's short busy timeout (§5.1) bounds it.

### 5.12 The server commit

Nothing at runtime knows the deployed commit today (`server/index.js:93` reads only the `package.json` version).
Production's HEAD moves every two hours through the content cron's commits (`scripts/git-backup.sh:242`), and a
deploy's `git pull --rebase` replays content commits on top of the code (`scripts/deploy.sh:73`). So HEAD read at write
time is not the running code.

- **`deploy.sh` writes `pipeline-output/.deployed-commit`** right after its pull: the upstream commit it pulled (the
  code) and HEAD. **`server_commit` is the upstream commit;** HEAD is kept in the file only, for diagnosis.
- **The server reads it once at boot.** If the file is missing (a restart without `deploy.sh`), it falls back to
  `git rev-parse HEAD` through a never-throw helper, the shape of `scripts/export-segment-edits.js:43-52`. The first
  deploy after this ships runs the old `deploy.sh` and writes no file, so `git-head` is expected until the second.
- **`commit_source`** records which: `deploy-file`, `git-head`, or `unknown` when both fail (git can refuse under
  `safe.directory` for the service user); then `server_commit` and `code_dirty` are NULL.
- **`code_dirty`** is computed once at boot, with the commit: set when the working tree's code differs from the
  recorded commit (a never-throw `git diff --quiet <commit> -- server tools/lib`). That catches a manual pull, a local
  edit, and a deploy that stashed and re-applied changes (`deploy.sh:61`). Changes under `books/` are expected on
  production and are not "dirty". **Not detected:** an edit to `server/public/js` after boot, which `express.static`
  serves at once without a restart (`server/index.js:173`).

Every research row carries the three values (§5.9).

### 5.13 The flag registry, the snapshot and the per-book switch

**No flag mechanism exists today.** This project adds a code registry, `server/lib/featureFlags.js`: one explicit entry
per switch read on the editing path, with its name, its source and a reader. Initial entries, from the sweep (the
builder completes the list by reading each consumer, §13):

| Flag | Source |
|---|---|
| `apply-hold` | `faithfulWriteHold(book)` (`server/lib/applyHold.js:43`) |
| `pipeline-hold`, `figure-review-closed` | `pipelineHold(book)`, `figureReviewClosed(book)` (`server/lib/heldBookWrites.js:57-62`) |
| `enforce-assignments`, `enforce-localization-review` | `book_settings` (migrations 035, 034) |
| `auto-create-users` | the `signInPolicy` value of `AUTO_CREATE_USERS` |
| `greynir`, `email` | whether `GREYNIR_URL` and SMTP are set (a boolean, never the value) |
| `suggestion-view` | G1.23's switch: the latest row in `book_switch_events` |
| `study-capture` | whether the book is on the study allowlist |

- **The snapshot** is the registry read for the event's book, as canonical JSON with sorted keys, stored inline on
  each event (`flag_snapshot_json`). It is a few hundred bytes, so no separate table is kept.
- **Two coverage tests,** both mechanical. One reads `PRAGMA table_info(book_settings)` on a fresh migrated database
  and fails if any column other than `book` and `updated_at` is neither registered nor on an explicit "not a flag"
  list with a reason. The other scans a named file list for `process.env.<NAME>` and fails on any unregistered,
  unlisted name: `routes/segment-editor.js`, `services/segmentEditorService.js`, `acceptanceService.js`,
  `propagationService.js`, `segmentParser.js`, `servedEdit.js`, `researchLog.js`, `lib/applyHold.js`,
  `lib/heldBookWrites.js`, plus G1.23's files once they exist. The scanner takes a root argument, so its control plants
  a read in a temporary directory, never the source tree.

**`book_switch_events` (`sessions.db`)** holds G1.23's per-book switch, append-only:

| Column | Meaning |
|---|---|
| `id` | AUTOINCREMENT |
| `book`, `switch_name` | e.g. `suggestion-view` |
| `value` | 0 or 1 |
| `switched_at_ms` | server time |

- **No row means off.** The current value is the row with the highest `id`. **The first switch-on time** is the
  `switched_at_ms` of the lowest-id row with value 1, so a later row with an earlier time (a clock step, a manual
  insert) cannot move it. A `book_settings` column could not give it: one `updated_at` is shared by every column.
- **No "by" column** *(R3)*. The admin route that flips it writes its usual `activity_log` row, as the enforcement
  toggle does (`server/routes/admin.js:1058-1064`).
- G1.23 builds the route and the reading; this project builds the table and its registry entry.

### 5.14 The consent record (G1.4, data side)

**`research_consent` (`sessions.db`)**, one row per decision:

| Column | Meaning |
|---|---|
| `id` | AUTOINCREMENT |
| `user_id` | `users.id`, as a plain integer. **No foreign key:** users can be hard-deleted with cascade, and the record must outlive what it proves |
| `decision` | `consented` or `declined` |
| `interval_id` | on a *consented* row that starts an interval, its own `id`; on a *consented* row recorded during a live interval (a new text version), that interval's id; NULL on *declined* |
| `consent_text_version`, `consent_text_sha256` | which text was agreed to (G1.4 writes the text) |
| `given_at_ms` | when the decision was made |
| `withdrawn_at_ms` | set once, at withdrawal, on the interval's starting row only |
| `deletion_done_at_ms` | set once, when §5.15 has deleted and verified the interval's rows, on the starting row only |

- **The current decision** is the latest row for the user. A later decision is a new row. An interval is live while
  its starting row (the row whose `id` is its `interval_id`) has no `withdrawn_at_ms`. A withdrawal sets it there,
  which ends the interval, whichever row is latest.
- **Declining while consented is a withdrawal.** Recording *declined* during a live interval sets `withdrawn_at_ms`
  on its starting row and inserts the *declined* row, in one transaction. The admin script does the same.
- **Only an approved text can be agreed to.** The approved texts are an enforceable value:
  `server/lib/researchConsentText.js` lists each approved `{version, sha256}`, pinned by a test, and is **empty until
  [USER] sets it** after checks G-1a, G-1b and G-1h pass and the data protection officer has reviewed the text (G1.4).
  While it is empty, the consent POST answers 409 `NO_APPROVED_TEXT`, and `record` captures nothing for anyone,
  because no row can name an approved text. A paper decision must name an approved version too. **A version is never
  removed from that list while a live interval names it:** removing it would silently stop that editor's capture, and
  nothing counts it as a loss.
- **Kept, not deleted by a withdrawal.** It is the proof of the decision and of the withdrawal, and it gates every
  event even when the research file is down; that is why it lives in `sessions.db`. It is kept until a stated period
  after the retention date (SD6 sets it; G1.15 enforces it), then deleted, with `research_deletions` and
  `research_capture_losses`.
- **No decision means not captured.** An undecided editor is treated exactly as a decliner by the logging call.
- **Visitors cannot consent.** A signed-in visitor has a session and no `users` row (CLAUDE.md § Auth). The consent
  routes answer 403 `{visitor: true}`, as `PUT /api/notifications/preferences` does
  (`server/routes/notifications.js:133-142`), and never create a row for a visitor.
- **Routes:** `GET /api/research/consent` returns the caller's own current decision and the current text version.
  `POST /api/research/consent` records the caller's own decision against the approved text the server serves, stores
  that text's sha256, and, for a decision that starts an interval, calls `researchLog.ensureKey(intervalId)`, a
  write-only service function, to mint the key (§5.16). `POST /api/research/consent/withdraw` sets `withdrawn_at_ms`
  on the starting row of the caller's own live interval; capture stops at that moment, because the logging call reads
  it, and the route then deletes the interval's research rows at once (§5.15). An admin script records a decision or
  a withdrawal made on paper, dry-run by default. Whether consent is given in the tool or on paper is G1.4's choice;
  the data side supports both.
- **Nobody routinely sees a decision.** Tooling that checks the per-editor gate reports only *decided* or *undecided*
  per editor; no route or routine script displays the decision itself. Only the database administrator can read it.
- **The licence clause is not stored here.** It is a separate document and survives withdrawal (the D12 record). A
  withdrawal never touches edit texts or anything about the clause.
- **The per-editor gate** (Skerfur §3.1) needs a recorded decision before the editor starts. A decline is a decision;
  the editor still edits. It is enforced at assignment: G1.13 assigns an editor's chapters only once their decision is
  recorded (§8).

### 5.15 Withdrawal and retention

Two scripts in `server/scripts/`, beside the other database scripts (better-sqlite3 resolves only from
`server/node_modules`). Both are **dry-run by default**, take `--write`, and use `process.exitCode`.

| Script | Due when | Deletes |
|---|---|---|
| `research-withdrawal.js` | a withdrawn interval whose `deletion_done_at_ms` is empty, or whose key row still exists (as after a restore) | that interval's events and items (found by its key), its loss rows in `sessions.db`, then its `editor_keys` row |
| `research-retention.js` | the retention date has passed and any research row exists | every research row, the key map included |

**Each run** first selects what is due. **If nothing is due, it changes nothing and exits 0.** Otherwise:
1. It reads the due keys into memory and deletes in one transaction.
2. It runs `PRAGMA wal_checkpoint(TRUNCATE)`, `VACUUM` and the checkpoint again on `research.db`, and requires each
   checkpoint to report `busy = 0`. A SQLite `DELETE` leaves the bytes in free pages and in the WAL until then, and
   this build has no `SQLITE_SECURE_DELETE` (check G-2).
3. It scans the bytes of `research.db` and its `-wal` for each deleted key's hex. (The scan needs the key, so only the
   run that deleted it can do it; a later run repeats step 2.)
4. It deletes every file in `pipeline-output/research-exports/` (never `pipeline-output/served-version-exports/`, which
   holds no research rows), so no copy made from the file survives a deletion.
5. Only if steps 2 and 3 passed: it writes a content-free `research_deletions` row in `sessions.db` (`kind`
   `withdrawal` or `retention`, the interval id or NULL, `done_at_ms`, `verified`) and sets `deletion_done_at_ms` the
   first time. **No row count:** how many rows an editor had is a measure of their volume. Otherwise it exits non-zero
   and the interval stays due.

- **When they run.** The withdraw route deletes the interval's events, items and loss rows at once, after its own
  commit, through a service function that never fails the request (deleting is not reading, so §11's no-read-route
  rule holds). The key row stays for the script, which completes the deletion: `VACUUM`, checkpoint, byte scan, key
  row. The research backup job (§5.17) runs both scripts with `--write` before every copy, as the backstop, and takes
  no copy when either exits non-zero. So **no backup taken after a withdrawal holds that editor's rows.**
- **A restore.** Restoring `research.db` from one of its backups is done only by an admin script that runs both
  scripts with `--write` against the restored file before the server opens it. Because the withdrawal script selects
  every withdrawn interval whose key row exists, a restored file loses its withdrawn rows again.
- **The retention date** is an enforceable value: a constant in `server/lib/researchRetention.js`, pinned by a test.
  It is empty until SD6 sets it, and the script deletes nothing by date until then.
- **The derived dataset** (G1.4) never lives in `research.db` or `research-exports/`; G1.5 names its home. Its
  record is a row in **`research_derived_datasets`** (`sessions.db`: path, sha256, created day; written by G1.5's step),
  so it survives the deletion it guards. The retention script refuses `--write` while no such row exists, unless it is
  given `--no-derived-dataset`, so the date can never silently destroy the only copy.
- **A withdrawal before publication** means results are recomputed without that editor; aggregates already published
  stay (R3). That rule belongs to the protocol (G1.5) and the consent text (§6).
- **Concurrency:** the server may write while a script runs. The research connection's short timeout (§5.1) makes a
  blocked research write a counted loss, never a failed act and never a stalled server.
- **The editing record is untouched.** A test compares every editing table and the module JSON by value before and
  after (§10, T9).

### 5.16 The editor-key map

**`editor_keys` (`research.db`):** `interval_id` (unique), `editor_key` (128 random bits as hex, unique), `stratum`
(NULL, or a declared stratum such as the lead's own edits, which G1.5 defines; SD6 decides whether [USER] is a
participant).

- **One key per consent interval.** The key is minted when a *consented* decision starts an interval, or at the
  editor's first event if minting at consent failed. A re-consent after a withdrawal starts a new interval and gets a
  new key, so a pending deletion of the old interval can never take the new interval's rows. Data from two intervals
  cannot be linked to one person, and the earlier interval is deleted anyway.
- **Admin only, with no route.** The logging call reads it to stamp events, and the withdrawal script deletes from it.
  No export joins it (Skerfur §4.1). Research services expose only write functions to routes (`record`, `ensureKey`,
  the withdrawal deletion); admin readers live in a module under `server/scripts/`, which no file in `server/routes/`
  or `server/services/` may require.
- **It lives in the research file** *(Claude's call: the key map lives in the research file)*, so a withdrawal or the
  retention date deletes it with the rows, and what remains in any copy is keyless. The cost: if the research file is
  ever lost, earlier data cannot be linked to later data for the same person. §5.1's missing-file rule keeps that from
  happening silently.
- G1.3's ticks use the same key.

### 5.17 Backups of the research file (R2)

- **Its own job:** a script pair (a `server/scripts` part that uses better-sqlite3's online backup, so it needs no
  `sqlite3` command, and a shell part for the upload), on its own cron line beside the editorial backup in
  `scripts/install-cron.sh`. The cadence is an enforceable value there. *(Claude's call: the same 6-hourly cadence as
  the editorial backup, `scripts/install-cron.sh:38`.)* `install-cron.sh` only prints lines for an operator to paste
  (`:45`), so check G-1h confirms the line is installed.
- **Order, and fail-closed:** (1) prune both tiers by age, as its own first step, which does not depend on a copy
  succeeding; (2) run the withdrawal and retention scripts with `--write` (§5.15); (3) take the copy; (4) upload it;
  (5) write the heartbeat. If step 1 or 4 fails, the job exits non-zero. If step 2 exits non-zero, no copy is taken
  that cycle. In every such case the heartbeat is not written. **The remote prune is not best-effort,** unlike
  `scripts/backup-db.sh:103-105` (`|| true`).
- **Local copies** go to their own directory, `pipeline-output/research-backups/` (mode `0700`), named
  `research.<timestamp>.db`, each `chmod 0600`.
- **Off-box copies** go to their own rclone crypt remote over their own bucket, with versioning off, set up as
  `docs/technical/backup-and-restore.md` describes for the editorial one (passphrase escrowed first). *(Claude's call:
  R2 says "under its own name prefix", but rclone crypt encrypts file names by default, so the shared bucket sees only
  encrypted names and no lifecycle or versioning rule can be scoped to a prefix in it. The editorial remote is the
  bucket root (`secret:`, that document's `:13`, `:30`), and Skerfur G1.20 plans versioning for the editorial
  database. A separate bucket is how R2's 7-day promise survives that.)*
- **Pruning is by age, on both tiers:** no copy may be older than 7 days at any moment. So the cut-off is 7 days minus
  one cron period, and a test pins that arithmetic against `install-cron.sh`.
- **A heartbeat** (`pipeline-output/.last-research-backup`), written only on success, feeds `/api/health` (§5.20).
- **The editorial tier must never pick it up.** Today it cannot: `scripts/backup-db.sh` copies only `sessions.db`
  (`:23`, `:45-46`), its local prune matches `sessions.*.db` (`:53-55`), and its remote prune and the monthly verify
  match `^sessions\.` (`backup-db.sh:104`; `scripts/verify-db-backup.sh:19`). A test pins those patterns, so a
  widened pattern fails before it ships.
- **What makes "within 7 days" true:** deletion runs at withdrawal and again before every copy, so the last copy
  holding a withdrawn editor's rows was taken before the withdrawal, and it is pruned within 7 days of being made. It
  is true only while this job runs (its heartbeat shows in the deploy readout), only if nothing else copies the file
  (check G-1a: Linode whole-disk Backups, any `tar` or `rsync` of `pipeline-output/`, such as the nightly `tar` that
  `docs/deployment/linode-deployment-checklist.md:243` recommends), and only if the research bucket keeps no deleted
  versions (check G-1b).
- A monthly restore test of the newest research copy is the builder's choice, after the shape of
  `verify-db-backup.sh`.

### 5.18 Client changes

All in `server/public/js/segment-editor.js` and `saveRetry.js`. **No hashing in the browser:** none exists, and
`accept-eligibility.js:18` warns against porting `mt-normalize` there. The client only echoes what the server sent.

| Change | Why |
|---|---|
| Render each row's `baseSha256`, `occurrence`, `is` and displayed edit's `contentSha256` as `data-` attributes, and read them **from the row's own DOM** at save and at accept | A declined re-render leaves `moduleData` newer than the screen: `renderSegments` returns `false` (`:1197-1206`) and `renderModule` ignores it (`:1124`). Accept builds `acceptedContent: seg.is` from `moduleData` today (`:1700`, `:1711`) |
| Save body adds `baseSha256`, `occurrence` (once G1.12 (b) exists), `displayedEditId`, `displayedEditSha256`, `clientActionId`, `clientActionTime`, `assists` | §5.6, §5.8, §5.10 |
| Drafts store `{text, baseSha256, occurrence, assists}` per segment, not bare text. A restored draft re-installs its assist list before adding the `draft-restore` item | A draft stores no base today (`:84-99`), so text typed against yesterday's base is restored over today's and saved with today's base. Without its assists, a refused save loses the record of a repetition insert or accepted suggestions made before it |
| A draft in today's format (`{ts, drafts:{segId: text}}`, kept up to 7 days, `:111-140`) is restored into the pane; its `draft-restore` item has `claim` `unverified` and detail `{legacy: true}` | The first deploy finds such drafts in editors' browsers |
| `saveRetry` bodies keep the new fields; a replay sets `replayed`. `saveRetry.attempt` sets `err.code = data.error` and `err.data = data` on a non-retryable answer, an additive change | It drops the code today (`saveRetry.js:234-238`), so the client cannot tell the new 409s from `SEGMENT_CONFLICT` (`routes/segment-editor.js:482-484`). A replay carries a body frozen for up to an hour (`:26`) |
| **On 409 `STALE_BASE`, `STALE_DISPLAYED`, `BASE_MISSING` or `DUPLICATE_ID`, and on any 409 to a replay, keep the typed text** (move it to the module's draft) before reloading; never drop it with a toast | `saveRetry.js:149-157` drops a non-5xx replay today |
| The assist list per segment, from the panel opening: each insert, wrap, accepted suggestion group and restored draft adds items with the client time. It is cleared on a successful save, on revert, *Hætta við* or Escape, and on reload (a refused save first moves it into the draft) | §5.10 |
| The accept body adds `acceptOrigin`: `keyboard-stream` from `acceptAtCursor` (`:1744`), `single` from the button's onclick (`:1514`); both reach `acceptSegmentAndAdvance` (`:1733`), which passes it on | Today both send identical bodies (`:1711`) |
| The approve, reject and discuss bodies add `reviewedEditSha256` from the module response | The edit id survives a re-save, so a reviewer can act on text that changed after the page loaded. The event records both hashes; a mismatch is flagged, never refused *(Claude's call: refusing a review act is G2.1's or SD4's decision)* |

- **The save response returns the row's `baseSha256` and its displayed pair.** After G1.21 a save no longer reloads
  the module, and the next save from that row must echo the current values (G1.21 interface, §8).
- **`saveRetry.js` is shared** with the Pass 2 editor, so the new fields and the error fields must stay optional for
  that page.
- **Old pages after a deploy.** Static JS is served with no cache-busting (`server/index.js:173`), and a page loaded
  before the deploy sends no `baseSha256`; its 409 handler reloads only the module, which does not help. So the
  `BASE_MISSING` message tells the editor to reload the page (F5).
- **Out of scope:** `pagehide`, `visibilitychange` and `sendBeacon` (G1.3).

### 5.19 The freeze manifest, the MT lock marker and the end-of-editing export (R5)

This replaces the per-unit manifest in Skerfur G1.1's row.

- **(a) G1.7's freeze manifest,** committed in full at the freeze. Its format is G1.7's. Its per-segment hashes are
  keyed by (segment id, occurrence) and computed with `sha256Text` over the loader's served `is`, so they compare
  directly with served versions. It holds no editor data.
- **The MT lock marker leaks when a unit started, and G1.7 closes it.** The first `segment_edits` row in a module, and
  separately the first `segment_acceptances` row, write `books/<slug>/02-mt-output/chNN/<m>-segments.locked`
  (`server/services/segmentEditorService.js:209-231`; `server/services/acceptanceService.js:199-217`). Its body holds
  `lockedAt`, an ISO time to the millisecond, and the first edit or acceptance id (`tools/lib/mt-lock.cjs:26-32`), and
  the two-hourly cron pushes that glob to the public repository (`scripts/git-backup.sh:177`). Chemistry has no marker
  at `3a1db909`, so every study unit would publish the time of its first save or MT accept, for decliners as much as
  anyone: the leak R5's reason rules out. **So G1.7's freeze writes a marker for every study unit before any unit
  opens, with a body holding no editor data** (for example `{reason: 'freeze', freezeCommit}`). `writeMtLock` does
  nothing when a marker exists, so neither first-act hook writes during the study. `scripts/backfill-mt-locks.js`
  does not cover this: it locks only modules that have already entered editing. Check G-1g confirms it.
- **(b) The end-of-editing export** (A2): `server/scripts/export-served-versions.js`, run after editing ends. **One
  line per segment occurrence:** `book`, `chapter`, `module_id`, `segment_id`, `occurrence`, and
  - `version_key`: the served version the segment's final text was made on, as a **content key**,
    `sha256(book|chapter|module_id|segment_id|occurrence|en_sha256|is_sha256|layer)`, never `served_text_versions.id`,
    whose order follows serve order and so acts as a clock. It is `null` when the final text is the MT (the segment is
    untouched or unreviewed, or its MT was accepted), and `null` also when its edit was **made before G1.1** (a NULL
    `served_version_id`, §5.8; its text differs from the MT, and G3.2 treats its base as unknown, as G2.1 does);
  - `final_sha256`: `sha256Text` of the final text: the `03-faithful-translation` text at the end-of-editing tag for
    a `complete` segment, the approved text for a `reviewed-but-unapplied` one, the served base for an `unreviewed` one;
  - `state`: `complete` (its approved edit or accepted MT is in the text at the tag), `reviewed-but-unapplied` (an
    approved edit or active acceptance exists that the tag does not hold) or `unreviewed`. The newest approved edit or
    active acceptance decides the state, `version_key` and `final_sha256`; an older applied one does not make the
    segment complete.

  The served versions it references are listed by `version_key` with their texts, hashes and layer, without ids. **No
  attempts, no status history, no editor key, no username, no edit id and no time:** it says what each segment ended
  as, never how anyone worked. A segment edited in two rounds (before and after the hold lifts) has one line, naming
  the version its final text was made on. Lines are sorted by (book, chapter, module_id, segment_id, occurrence).
  - G3.2 reads it to compute `postEdited` against the served version; today `tools/export-corpus.js:84-90` compares
    against pure MT and reads disk only. The contract figure reads its `state` (R1): "n complete of 134, plus the
    reviewed share of the rest" (Skerfur §4.1).
  - It covers every segment, decliners' included (R1, A2). It carries no key and no time, and G3.2's release is
    licensed text under the licence clause, which every editor signs before their first unit (the D12 record; §8,
    G1.13). The consent text says so (§6 item 16).
  - It writes to a gitignored place, `pipeline-output/served-version-exports/`. **Never the running server, and never
    under `books/`,** which the two-hourly cron pushes to the public repository (`scripts/git-backup.sh:162-178`).
  - Any module enumeration skips the 37 legacy `*-segments(b).en.md` files, as `listChapterModules` does.
- **Raw research exports for analysis** are made only by one admin script into `pipeline-output/research-exports/`,
  which the deletion scripts empty (§5.15). It maps each event's `served_version_id` to its `version_key`, so analysis
  joins served versions by value (§5.22). A copy made anywhere else is outside the deletion promise; the protocol
  (G1.5) must say where analysis copies live.

### 5.20 Observability

- **`checks.research_db`** in `/api/health`: `{ok, reason}`, probed on each request with a read-only open and a
  `PRAGMA user_version` read, as `checks.db` is, plus the in-memory consent flag. `reason` is one of `unavailable`
  (the file or its schema failed), `missing` (the file is absent while a consent exists, §5.1), `consent-unavailable`
  (the consent lookup is failing, §5.11) or `backup-stale` (the heartbeat is too old).
- **`checks.schema`** asserts that the new `sessions.db` tables (§5.1's list, `research_derived_datasets` included),
  the five new `segment_edits` columns and the two new
  `segment_acceptances` columns exist (`PRAGMA table_info`). `checks.migrations` only counts files
  (`server/index.js:260-268`), so a swallowed migration otherwise shows only as save errors.
- **Nothing sensitive:** no counts of events, editors, consents, deletions or losses. The endpoint is unauthenticated
  (`server/index.js:245`). A count of pending deletions would tell the world that someone withdrew.
- **The threshold is derived, not chosen:** two missed backup cycles plus margin, as the existing heartbeat checks do
  (`server/lib/offboxBackupHealth.js:34`). A test parses `scripts/install-cron.sh` for the research cron period and
  pins the arithmetic, as `server/__tests__/healthOffboxBackup.test.js` does.
- **Losses** are read by an admin script (`server/scripts/research-status.js`) from `research_capture_losses`, never
  by a route.
- Any not-ok check makes the overall status `degraded` with HTTP 200 (`index.js:353`); `deploy.sh` prints it, and it is
  the only routine reader.

### 5.21 Relation to `activity_log` and `analytics_events`

- **`activity_log`** (`server/migrations/040-service-table-ownership.js:17-28`) stays as it is: an operational log of
  every editor, consenting or not, with user, name and a time to the second. Every save writes one
  (`server/routes/segment-editor.js:433-441`), and it calls a withdraw a save and has no row for propagation. It falls
  under G1.15's retention rule and is named in the consent text (§6). **It is never research data** (R3, §5.22).
- **`analytics_events`** (`server/migrations/005-feedback.js:65-77`) is reader analytics through a public route.
  B1 never uses it (Skerfur §4.1).
- **`content_versions`** is an apply snapshot, not a served-version record.
- **The server's request log** (journald, with book, chapter and module in each path; `server/middleware/requestTiming.js:60`)
  is an editing record under R3, named in the consent text. Its retention is G1.15's (check G-1c).

### 5.22 What a research figure may read

This is R3's "only from the research file" as [USER] read it in A1: the research file plus reference data that names
no person and holds no time. Research figures read only:
- `research.db`;
- `served_text_versions`, **joined by value** (`version_key` or the hashes). Research never orders or compares its
  integer ids, whose order follows serve order and so acts as a clock (§5.19);
- `module_opening_inflight`, the opening snapshot;
- a per-module yes/no, *opened after the first switch-on*, which an admin script,
  `server/scripts/opening-eligibility.js`, derives from `module_openings` and `book_switch_events` and writes into
  `research-exports/`; never the times themselves;
- `research_capture_losses`, as counts per consent interval, never joined to an editing row;
- committed repository files (pure MT, the change logs, the freeze manifest, the end-of-editing text).

They never read an editing record: `segment_edits`, `segment_acceptances`, the opening times in `module_openings`,
the switch times in `book_switch_events`, G1.23's editing rows, `research_consent`, `activity_log`,
`analytics_events` or the request log. A test fails when any `server/scripts/research-*` file names one of those
tables, with two exceptions, which may name `research_consent` and no other forbidden table: `research-withdrawal.js`,
to find withdrawn intervals and set `deletion_done_at_ms` (§5.15), and the paper-consent admin script (§5.14), if it
is given a `research-` name, to record a decision or a withdrawal. Neither uses it to compute a figure. The test lists
each exception with its reason. The end-of-editing export (§5.19) and the contract figure (R1) are not research
figures.

## 6. What the consent text must name

This is the list G1.4's text must cover, as of approval. G1.4's text, once written, owns it, and this section becomes
evidence. Until then a change to the list is made by a superseding record (or a dated note under G1.4's row in the
Skerfur plan), never by editing this file. The list is the union of five sources (Skerfur G1.4; its 2026-10-28 notes;
the rule-layer record; G1.23 §8 item 5; SD6) plus R1, R2, R3, A1, A2 and A3.

**Who is recorded, where, and for how long.**

| Record | File | Whose acts | Name or user id? | Time? | Deleted at withdrawal? | Kept until |
|---|---|---|---|---|---|---|
| Research events, items, keys | `research.db` | consenting editors only | a random key per consent interval | ms | yes, from the file and its backups within 7 days | the retention date |
| Loss notes | `sessions.db` | consenting editors' lost events | the consent interval | the day only | from the live file; editorial backups keep copies (A3) | a stated period after the retention date |
| Served versions | `sessions.db` | no one | no | no | no | G1.15 |
| Opened time and snapshot | `sessions.db` | the unit's first assigned editor (when they first loaded it) | no | the unit's opening | no | G1.15 |
| Edit and acceptance rows, review fields, comments, module reviews, G1.23's rows | `sessions.db` | every editor | yes | yes | no | G1.15 |
| Consent decisions, deletion records | `sessions.db` | every deciding editor | user id | yes | no: they prove the withdrawal | a stated period after the retention date |
| `activity_log`, the request log | `sessions.db`, journald | every editor | yes | yes | no | G1.15 |
| End-of-editing export | `pipeline-output/` | every segment's final text and state | no | no | no: licensed text | released by G3.2 |
| Freeze manifest, MT lock markers | committed | no one | no | the freeze | no | permanent |

Copies of everything in `sessions.db` also stay in the editorial database's backups for their lifetime (G1.20's
long-lived tier); that lifetime is filled in before the text goes to the data protection officer.

**What is captured, for consenting editors only**
1. The event log: every editing act, with its time, its origin and the text it was made on; the text of each edit you
   save and every earlier version of it, including versions you replaced or withdrew, which the tool itself does not
   keep; when you first open each unit; saves the tool refused; first-save times; and, once G1.3 ships, active-time
   ticks. Notes and comments are logged only as their length and a fingerprint, never their text.
2. Some segments carry AI terminology suggestions, labelled as AI, made before editing starts.
3. Every outcome on a suggestion is logged: accepted, rejected, **and left open** (G1.23 §8 item 5).
4. Decisions on rule suggestions are logged the same way.
5. The tools an editor used on a save (inserts, wraps, restored drafts) are logged as assists, with the text a whole-
   text insert or restored draft put in place.
6. A small note, with no text, that a research record was missed: which consent interval, which unit, which day and
   which type of act. A withdrawal deletes it from the live database, but copies may survive in the editorial
   database's backups for their lifetime, beyond the 7 days of item 19 (A3).

**How it is used**
7. Logged with the editor's other events, and reported only in aggregate, in groups of at least two editors, never
   comparing editors.
8. Secondary use in articles: the final report and professional journals (CLAUDE.md § Purpose).
9. No editor's text, edits or name goes to the AI provider.
10. *(From the protocol, Skerfur §4.1, not from a consent record; Claude's call: include it.)* Research data is never
    used to check or adjust anyone's hours, pay or workload.
11. Who can see a decision: only the database administrator. Tools that check whether an editor has decided show
    *decided* or *undecided*, never the answer.

**Everyone, whatever they decide**
12. Every editor sees suggestions; only consenting editors' decisions are captured.
13. **A decliner's approved text counts** in the per-unit change figure (pure MT → approved final), which is computed
    from the published, licensed text and each segment's state in the end-of-editing export (item 16), with no name or
    time. Nothing about how or when a decliner worked is captured for research.
    When a consenting reviewer acts on a decliner's edit, the reviewer's act is logged with a reference to the edit
    (its row number in the editing record) and with no research key or link for the edit's author (R1). The edit row
    itself is an editing record (item 14) and is never used as research data.
14. **Editing records kept for everyone** (R3): when a unit was opened; each saved edit, with its time; how each edit
    was written (typed, propagated or re-attached); which AI or rule suggestions a saved edit took (shown as GG tags
    until approval); who rejected a suggestion or left one open; each MT acceptance, who made it and when; each review
    act on an edit (approve, reject, discuss, un-approve), who and when; discussion comments; module review
    submissions; the activity log; the server's request log; and, until G2.3 makes it private before the hold lifts,
    the review-status file, which records who applied each segment and when and is published. They are kept under the
    ordinary retention rule (G1.15), copies stay in the editorial backups (above), and they are **never used as
    research data** for anyone. Research reads only two things derived from them, neither carrying a name or a time:
    which segments held an unfinished edit when a unit was opened, and whether each unit was opened after suggestions
    were switched on (A1, §5.22).
15. The consent record itself: kept after a withdrawal, as proof of the decision, until a stated period after the
    retention date.
16. What the open corpus needs is kept and released under the licence clause: for each segment, the served version
    its final text was made on, a fingerprint of that text, and whether it is complete, reviewed but not applied, or
    unreviewed. It holds no name, no time and no record of attempts (R5, A2, §5.19).
17. The licence clause is a separate document and survives withdrawal from the research.

**Withdrawal, backups and deletion**
18. Consent can be withdrawn at any time, in the tool or by telling [USER], who records it the same day. Capture stops
    when it is recorded. Choosing *declined* after consenting is a withdrawal.
19. **The research file's backups are kept 7 days,** locally and encrypted off-box. Withdrawn research rows in the
    research file, and all raw rows after the retention date, are gone from the file and all its backups within 7 days
    (R2); the one exception is the loss note (item 6). This holds while the
    research backup job runs, and once checks G-1a, G-1b and G-1h pass (§9), before any consent is collected.
20. Results not yet published are recomputed without a withdrawn editor; aggregates already published stay (R3).
21. Raw rows are deleted on a stated date after the last planned publication (SD6 sets it); a de-identified derived
    dataset is kept.

**Must not say**
22. "Some units start from AI-revised text." Every unit starts from pure MT (the 2026-10-28 record).

The consent record stores the version and sha256 of the text each editor agreed to (§5.14). The school's data
protection officer reviews the text before capture (G1.4), and the server accepts no consent until [USER] lists the
reviewed text as approved (§5.14).

## 7. How the G1.23 spec's §8 is met

| G1.23 §8 item | Met by |
|---|---|
| **Project 1.** The served-version record, with the sha256 of the served Icelandic, keyed on (book, module, segment id, occurrence, …); the hashed string is the `is` the loader returns | `served_text_versions` (§5.2), keyed on those plus chapter, English hash and layer; `sha256Text` over the route's response string (§5.3), read by G1.23 as `seg.baseSha256` |
| **Project 2.** The module's opened time: set once, at the first serve to a user holding an assignment row for that chapter; a separate record; ships before any unit opens | `module_openings` (§5.5): a separate table, a direct `user_chapter_assignments` lookup, the chapter in the key, set once; a failed opening answers 503 rather than being recorded late |
| **Project 3.** A served-version id a G1.2 event can reference | `served_text_versions.id`, carried as `served_version_id` on events (§5.9, with the source per type) and on new edit and acceptance rows (§5.8) |
| **Project 4.** The §6.3a snapshot, or a hook | The snapshot itself, taken in the opening transaction: any in-flight edit by any editor (`module_opening_inflight`, §5.5), which research may read (A1, §5.22). G1.23's step runs after it on the same serve (§5.4) |
| **Project 5.** Consent text that names all three outcomes | §6 items 3 and 4 |
| **G1.2 1.** One logging call; G1.23 never checks consent | `researchLog.record` (§5.11), with the consent gate inside |
| **G1.2 2.** An assist type for accepted suggestions, one item per change: `opId`, `occurrence`, `rulingId`, `category`, `source`, `runId`, group-action id | `research_event_items` with `item_type` `ai-suggestion` or `rule-suggestion` and those columns, plus `rule_id` and a nullable `run_id` for rule records (§5.10) |
| **G1.2 3.** A reject event and a left-open event with the same fields; left-open names the finishing act | `suggestion-reject` and `suggestion-left-open`, one per change, each with one item; the finishing act in the detail (§5.9) |
| **G1.2 4.** A reference to the G1.1 served-version id of the base on each such event | `served_version_id` on each, from the source table in §5.9 |
| **G1.2 5.** The server commit and a feature-flag snapshot on every row, including the per-book switch | `server_commit`, `commit_source`, `code_dirty` (§5.12); `flag_snapshot_json`, with `suggestion-view` read from `book_switch_events` (§5.13) |
| **G1.2 6.** Its rows in the separate research file; G1.23's editing record never there | `research.db` (§5.1); G1.23's rejection and left-open rows and its accepted list stay in `sessions.db` |
| **G1.2 7.** A failed research write never fails the editor; every loss is countable | The editing record first, a synchronous never-throw call, and `research_capture_losses`, written only for consenting editors, counted per consent interval, and kept in `sessions.db` (A3, §5.11) |
| *Relation to other items:* G1.21 is not a prerequisite; G1.12 decides when §6.4 lifts | The save response returns the row's current hashes for G1.21 (§5.18); R4 refuses unplaceable duplicates until G1.12 (§5.7) |

## 8. Interfaces with other items

| Item | This project gives it | This project needs from it |
|---|---|---|
| **G1.3** ticks | The research file, the editor key, the consent gate, the session-id and idempotency conventions (§5.10) | Nothing more. Its split of editing time from review time needs to know who wrote each edit, which it works out itself |
| **G1.4** consent text and review | The list of what the text must say (§6); how the data behaves (withdrawal, retention, the 7-day backups, the editing records kept) | The text, its version and sha256, listed as approved in `researchConsentText.js` after the officer's review (§5.14); whether consent is given in the tool or on paper |
| **G1.5** protocol | Losses per consent interval, served versions, the stratum field | Frozen definitions before any data: the analysis boundary (§5.22, as A1 reads it); whether `chapter-metadata` is in the population; the participant stratum; the loss-rate limit; where analysis copies and the derived dataset live (never `research.db` or `research-exports/`); the old → new id map for a mid-study re-extraction, with its writer; completion and suggestion precision where a decliner did the completing or reviewing act (excluded, or reported as partly captured, §5.9) |
| **G1.6** calibration | Inspectable served-version rows and events for a re-served segment, and for a duplicate-id unit after G1.12 | Exercise of the declined re-render and draft-restore paths in its scripted session |
| **G1.7** freeze | Served versions comparable with its manifest by value (§5.2) | The tag and the manifest format; per-segment hashes keyed by (segment id, occurrence), computed with `sha256Text` over the loader's served `is`; **a content-free MT lock marker for every study unit, written before any unit opens** (§5.19) |
| **G1.12** duplicate ids | An occurrence field everywhere; the refusal on unplaceable writes (§5.7) | **To land before any of the 83 modules opens** (R4); after option (b), every acceptance and pending-edit key includes `occurrence` (§5.7) |
| **G1.13** scope guards | An opened predicate that reads `user_chapter_assignments` directly | **Assignment only after G1.23 is switched on** (R6), and for each editor only once their consent decision is recorded (§5.14) and their licence clause is signed (the D12 record); rows only for a unit's editors, never for its reviewers, or a reviewer's first look opens the unit; the propagation target-chapter check |
| **G1.15** privacy | No read route to research tables; nothing personal in new columns that `SELECT *` sends to browsers | A retention rule covering the editing records named in §6 item 14, and `research_consent`, `research_deletions` and `research_capture_losses` (kept until a stated period after the retention date) |
| **G1.20** (the editorial backup changes) | — | The `sessions.db` backup change (`.backup` or `VACUUM INTO`) and its long-lived tier must never pick up `research.db` (the prefix test, §5.17); its versioning must never cover research copies, which have their own bucket (§5.17); that tier's lifetime is stated for §6 before the text goes to the officer |
| **G1.21** in-place update | The save response returns the row's `baseSha256` and displayed pair (§5.18) | — |
| **G1.23** suggestion view | The logging call and its input (§5.9); the suggestion item types; the reject and left-open events; `seg.baseSha256` for §6.3; the opened time; the snapshot; `book_switch_events`; reserved `editing_kind` values | Its step runs after the serve hook's steps 2 and 4 and never hashes (§5.4); its switch stored in `book_switch_events` and registered (§5.13); it calls `record` for every event; its reject passes the echoed base hash and decides whether a mismatch refuses; it decides whether a group hidden at the finishing act (typed over, G1.23 §6.5) is written as left open with a `shown_at_finish` flag. The offered set needs no extra capture: it follows from the change logs, the base hashes, the snapshot and the per-module *opened after the first switch-on*, all of which research may read (§5.22). A book off the study allowlist records no opening, so G1.23 treats its modules as never eligible |
| **G2.1** base-text guard | `served_version_id` on every new edit row; NULL on older rows | — |
| **G2.3 / G2.5 / G2.7** | Events from which "first completion" can be derived where the completing actor consented (accept, approve, apply); the base the lift needs | G2.3 makes the review-status sidecar private; the lift also needs the §C202 fix |
| **G3.2** corpus | The end-of-editing export: one line per segment, with its final text's served version, that text's hash and its state (§5.19, A2) | — |
| **10-10 4.2 / 2.2** | Origins `re-attach` and (reserved) `note-apply` | Re-attach by content calls `saveOnServedBase` with origin `re-attach`, skips duplicated ids, and runs before the module opens; the id-based script is retired or refuses the study book (§5.6) |
| **SD4 (b)** | Approval events carrying the actor | Its self-approval refusal |
| **B3 U7** | Reserved origins `propagated` and `ai-pass` | — |

## 9. Before any capture: the checks

Each is read-only. Production reads use a committed script sent on stdin, as for §C203. **If G-1a or G-1b finds a
copy, consent collection waits until [USER] has excluded the file or stopped the job.**

| # | Who and how | Check | What it decides |
|---|---|---|---|
| **G-1a** | [USER] in Linode's web console (the Linode's Backups tab); the committed script for every user's crontab | Are Linode whole-disk Backups enabled? Does any crontab `tar`, `rsync` or copy `pipeline-output/`? | Whether R2's 7-day promise is true |
| **G-1b** | [USER] or the builder, in the backup provider's console | The research bucket's versioning and lifecycle rules (§5.17). **Re-run after G1.20 lands,** since G1.20 adds versioning for the editorial bucket | Whether a deleted research backup really disappears; if versioning keeps deleted objects, it is turned off before consent |
| **G-1c** | the committed script | journald retention; nginx's `access_log` | What the consent text says about the request log (§6 item 14); G1.15's rule |
| **G-1d** | the committed script | `enforce_assignments` per book; chemistry's `user_chapter_assignments` rows; the `users` rows; `AUTO_CREATE_USERS` | **Whether units would open the moment the opening step ships.** If chemistry holds rows, either [USER] removes them before the step ships, or they stay and those units are recorded as opened before the switch-on and never get suggestions (G1.23 §6.2) |
| **G-1e** | the committed script | Which chemistry segments carry approved-but-unapplied rows, and which carry applied rows whose faithful file is gone | The size of the opening snapshots, and whether the per-module gate has run |
| **G-1f** | the committed script | Is the `sqlite3` command installed? | Only the existing `backup-db.sh` and `verify-db-backup.sh` depend on it; the research backup does not (§5.17) |
| **G-1g** | the committed script, and the repository | Which study units lack an MT lock marker, at HEAD and on production | Whether G1.7's freeze markers are in place (§5.19). No unit opens until every study unit has one |
| **G-1h** | the committed script | The research cron line is in the production crontab (`crontab -l`), and one `--write` run of the job has completed | Whether deletion and the 7-day rotation actually run. Before the first *consented* row |
| **G-2** | settled on 2026-11-03 | better-sqlite3 13.0.3, as the lockfile pins: the default busy wait is 5000 ms (a constructor option, `lib/database.js:33`, not a compile define); `SQLITE_SECURE_DELETE` is not compiled in (`deps/defines.gypi`) | The research connection's short timeout (§5.1); physical deletion relies on `VACUUM` and the checkpoint (§5.15) |
| **G-3** | settled on 2026-11-03 | The serve hook's cost on chemistry (§5.4) | No cache |
| **G-4** | the builder, in the repository | For each of the 285 duplicated ids, does English occurrence k come from the same source element as Icelandic occurrence k? | Whether one occurrence key serves both files. If not, G1.12 fixes the pairing first |
| **G-5** | the builder, in the repository | Which tests post `/edit` or `/accept` bodies, or call the service functions §5.6 changes. At `3a1db909`: `server/__tests__/segmentEditBackstop.test.js` drives the real `/edit` handler with bodies that carry no `baseSha256`; `acceptanceRoutes`, `acceptanceService` and `acceptanceApply` test the accept path; five E2E specs post `/edit` directly (`concurrent-editing`, `editor-workflow`, `review-cycle`, `segment-editor`, `ux-phase2`), and `editor-lifecycle` only intercepts it. Re-grep before building | Which tests change in the same PR as the required `baseSha256`: each direct poster first fetches the module to take the hash, and one `BASE_MISSING` case stays. Both CI jobs must be green: Tests (vitest and E2E) and Lint (eslint and prettier). The E2E modules hold no duplicated id, so `DUPLICATE_ID` does not fire there |

## 10. Acceptance

Each test compares values or sets, never only counts (CLAUDE.md: a count cannot see a substitution). Each negative
test carries a positive control in the same fixture, so a system that does nothing cannot pass.

| # | Test | Positive control |
|---|---|---|
| T1 | **The integrity set.** Over committed layer 2, the set of chains whose first `beforeSha256` differs from G1.1's `is_sha256` at (module, segment id, occurrence) equals exactly {`m68726:para:fs-idm94618544`#0, `m68747:para:fs-idm99049568`#0}. Compare the ids, not the count. Appendices load as `-1`; chapter metadata is included (ch02 matches); `ch00/m68662` is computed with the same mint function on the loader's output, since the route cannot serve chapter 0, and so are the 14 chains on the 7 duplicated ids, which the route does not mint; 2 of them fail | The 2,061 other chains match |
| T2 | **A hash sentinel per normalisation step.** Fixtures where each step bites: surrounding whitespace, a wrapped line, an escape, a `__term__` repair. For each, `is_sha256` equals sha256 of the returned `is` and differs from sha256 of the raw body. `sha256Text` agrees with `buildChangeRecord`'s `beforeSha256` | An untouched segment in the same fixture, where both hashes are equal |
| T3 | **Served versions.** Serving identical text twice adds no row. Changing the Icelandic, the English, or only the layer adds one. A stale check across a relabel with identical bytes does not refuse. A duplicated id and a module with no layer mint nothing | A second module served alongside gains its own rows |
| T4 | **Stale base.** Change the base file between serve and save: 409 `STALE_BASE`, no edit row, no research event but `write-refused`. No `baseSha256`: 409 `BASE_MISSING`. Another editor re-saves the displayed edit: 409 `STALE_DISPLAYED`. The client posts a wrong `originalContent`: the stored `original_content` is the server's base. A save while another editor's edit is displayed stores that edit's id and the hash the DOM row rendered, on the row and in the event. After a declined re-render, an accept on the old row is refused by the value check. A re-attached row carries `served_version_id` | A save with the current hash succeeds and stores the served-version id; a base-displayed save stores a NULL displayed pair |
| T5 | **Duplicated id refused.** On a fixture with a duplicated id, a save, an accept and a re-attach are refused or skipped with `DUPLICATE_ID`; no editing row, no served-version row, no event but `write-refused`. Run on the two known ids `m68726…` and `m68747…`, comparing per-occurrence values | A save on a non-duplicated sibling in the same module succeeds |
| T6 | **Opened time.** An admin with no row, a head editor with no row, an editor with zero rows while enforcement is off, and a token with no `users` row: each leaves the record unset. A visitor gets 403 from the route. Opening ch02's `chapter-metadata` does not open ch05's. Appendices are recorded under `-1`. After it is set, a serve by anyone leaves it byte-identical. A failure in the snapshot insert leaves no opening row (one transaction), and that serve answers 503; so does a failed mint (step 3) on a serve that meets the predicate, with no opening row; the editor cannot save in between, so a later successful opening's snapshot does not hold their segment | An assigned editor's serve in the same fixture sets it |
| T7 | **The snapshot.** An `m68664`-style fixture with in-flight rows at opening (pending; separately, approved and unapplied; an older in-flight edit under a newer non-in-flight one; and a re-attached row): each segment stays in the snapshot after its row is approved, rejected or withdrawn. Only the non-re-attached row writes a warning | A sibling segment with no row at opening is not in it |
| T8 | **Consent gate.** The same acts by a consenting, a declined, an undecided and a withdrawn editor: identical HTTP responses and identical `sessions.db` rows; research rows only for the consenting one. With the research file down, the decliner and the undecided editor leave no loss row. With no approved text listed, the consent POST answers 409 and nothing is captured. A replayed act made before consent writes nothing. With `research_consent` dropped, a consenting editor's act answers 2xx and leaves one `consent-unknown` loss row. In a mixed-consent fixture, a declining reviewer's approval of a consenting author's edit writes no event, and exactly that is absent from the rebuild | The consenting editor with the file down leaves exactly one loss row per event, carrying their interval |
| T9 | **Withdrawal.** The interval's events, items, loss rows and key row are gone; a sentinel string from their text and the key's hex are absent from `research.db`'s and its `-wal`'s bytes; the next backup copy lacks the sentinel; every editing table and the module JSON are equal by value before and after; a later act writes no research row and no loss row; `research-exports/` is empty and `served-version-exports/` is unchanged. Posting *declined* while consented withdraws. After a re-consent to a new text version, a withdrawal marks the interval's starting row. Restoring a pre-withdrawal copy and running the script removes the sentinel again. A run with nothing due leaves the export directory and `research_deletions` untouched. With a held reader making the checkpoint busy, the interval stays due and no copy is taken | Another consenting editor's rows are unchanged; an editor who re-consented before the run keeps the new interval's rows; the sentinel is present before the run |
| T10 | **The research file down.** A save, a reject and an opening succeed (2xx), the editing rows are present, and the loss ledger grows by exactly one per lost event. The module JSON is byte-identical with and without the file (G1.23's suggestions included, once G1.23 exists). With a second connection holding `BEGIN EXCLUSIVE` on `research.db`, a save returns 2xx within the timeout plus a margin and writes one `busy` loss. With `SESSIONS_DB_PATH` set to `acc-test-1.db` (an existing suite's pattern), the research path is `acc-test-1.research.db`; given a derived path equal to the editorial one, `researchDb` stays *unavailable* | The same acts with the file up write research rows and no loss row |
| T11 | **Replay.** With every fixture editor consenting, run save, re-save, withdraw, approve, un-approve, reject, discuss, return to pending, propagation (insert and update in place) and apply with self-heal (on a non-held fixture book). Rebuild `segment_edits` from the events and compare by value on: the row (via `editing_id`), `book`, `chapter`, `module_id`, `segment_id`, `occurrence`, `edited_content`, the sha256 of each note, `category`, `status`, applied (as a boolean), `served_version_id` and `origin`, with editor and reviewer mapped through the keys. Timestamps are compared only as order. Item `claim` values: planted claims give `mismatch`, real ones `validated`, an untestable insert `unverified` | Dropping one event makes the rebuild differ |
| T12 | **No deferred write.** The research row is readable from a second connection when the response returns, with timers frozen | — (the read is the value check) |
| T13 | **Server commit,** on a temporary git repository passed as a parameter, never the real tree. With the deploy file naming upstream X and HEAD Y, the stamp is X with `commit_source` `deploy-file`. With no file, it is HEAD with `git-head`. With neither, NULL and `unknown`. A change under `server/` sets `code_dirty` | A change under `books/` alone does not set it |
| T14 | **Flags.** Flip G1.23's switch and emit an event: the snapshot differs from the previous one in that flag only, compared key by key. Both coverage tests fail on a planted unregistered read (a `book_settings` column; a `process.env` read in a temporary root). A later switch row with an earlier time does not move the first switch-on time | The unflipped book's snapshot is unchanged |
| T15 | **Reviewer on a decliner's edit.** A consenting head editor approves a decliner's edit: the event has `editing_id` and a text hash, and no text, no author key, no author time; each before-image field follows the field table (§5.9). A propagation whose preview text is a decliner's live edit stores only its hash: the decliner's sentinel text is absent from `research.db`'s bytes | The same approval of a consenting author's edit is matched by hash to that author's save event |
| T16 | **Propagation.** The target row's `original_content`, `served_version_id`, `occurrence` and `origin` come from the target's server-loaded text, on insert and on in-place update; the event records the client text and the preview hash, and flags a difference | A target whose text equals the preview's shows no flag |
| T17 | **Nothing reaches a browser or a route.** The module JSON carries no research field and no opened or switch time; every new `segment_edits` and `segment_acceptances` column is on an allowlist; no file under `server/routes/` references `researchDb` or `editor_keys`; no file under `server/routes/` or `server/services/` requires the admin reader module; no `server/scripts/research-*` file names a table §5.22 forbids, except the two `research_consent` exceptions §5.22 lists with their reasons; the eligibility script's output holds only book, chapter, module and the yes/no; `record`'s failure log for a forced failure holds no sentinel text and no key | The check detects a planted reference, including `research-withdrawal.js` naming `segment_edits`; `researchLog.js` does reference `researchDb` |
| T18 | **Scope.** The study allowlist contains chemistry and never `lifraen-efnafraedi`; an organic serve mints nothing; an organic save, accept or propagation answers 409 `BOOK_NOT_MINTED`, even with a correct hash in the body; an event for a non-study book writes nothing and counts nothing | A chemistry event writes its row |
| T19 | **Backups.** `backup-db.sh`'s local glob and remote and verify prefixes match only `sessions.`; the research job writes to its own directory under `research.`, with mode `0600`, and to its own remote, never the editorial one; the age cut-off and the health threshold are derived from `install-cron.sh`; a failing upload still prunes; a failing deletion step takes no copy; a failing remote prune exits non-zero with no heartbeat | A copy older than the cut-off is pruned |
| T20 | **Times.** A replayed save carries `replayed` 1 and the client's original action time; two saves by one editor in one second are ordered by `key_seq` and carry distinct millisecond times; event ids are not monotone in insertion order | A live save carries `replayed` 0 |
| T21 | **MT lock.** In a study-book unit that already holds a freeze marker, the first save and the first accept leave every file under `books/` unchanged | Without the marker, the first save writes one (today's behaviour) |
| T22 | **Export.** A fixture holds a segment with a rejected and an applied edit; one edited in two rounds on two served versions, whose first-round edit is applied and whose second-round edit is approved and unapplied; one with an approved, unapplied edit; one with an applied MT acceptance; an untouched one; and one whose approved edit predates G1.1 (NULL `served_version_id`), as all of production's chemistry rows do. The export has exactly one line per segment occurrence, with the expected `state` (the two-round line is `reviewed-but-unapplied`, not `complete`); `version_key` is the final text's version (the second round's), and `null` for the MT-accepted, untouched and pre-G1.1 lines; `final_sha256` equals `sha256Text` of the final text (the second round's approved text for the two-round line); there is no integer id, edit id, status history or time; two exports whose served-version ids were assigned in different orders are byte-identical | The applied edit's version key matches its served version's content |
| T23 | **Client.** The saved and accepted values are read from the row's DOM after a declined re-render; a draft keeps its base and its assists through a refused save and a restore, and the next save lists both the earlier insert and `draft-restore`; a legacy bare-text draft restores with `{legacy: true}`; `saveRetry` errors carry `code` | A save with no re-render sends the same values |

**The sweep's 19 risks, mapped to tests.**

| Risk | Tests |
|---|---|
| 1. The hash covers the wrong string | T1, T2 |
| 2. Duplicate ids record the wrong copy | T3, T5 |
| 3. What was served is not what was seen | T4 (the displayed pair, the DOM-read accept), T7, T23 |
| 4. A client claim is stored as fact | T4 (`original_content`); T11 (claims) |
| 5. The client echoes a stale hash | T4, T23 |
| 6. A loss looks like a decline | T8, T10 |
| 7. The server commit is wrong | T13 |
| 8. The flag snapshot is incomplete | T14 |
| 9. The opened time comes from the wrong serve | T6 |
| 10. History is lost under the log | T11 |
| 11. Times are present but wrong | T20 |
| 12. Propagation records the wrong text | T15, T16 |
| 13. The deletion promise is false | G-1a, G-1b, G-1h (§9); T9 (including restore and the `-wal` scan); T19 |
| 14. Source drift and renumbering | T3 (English change); G1.5's id map |
| 15. The wrong population is captured | T18; ch00 never opens (T6's fixture) |
| 16. Research data reaches browsers | T17 |
| 17. Two logs tell different stories | the protocol rule (R3, G1.5); T17's check that no research script reads an editing table |
| 18. Layers collapse after the hold lifts | T3 (layer-only change) |
| 19. A restart drops a deferred write | T12 |

## 11. Constraints the builder must respect

- **Paths** from `__dirname` or a resolver with an environment override, never `process.cwd()`. The server runs with
  cwd `server/`. Run `npm test` from the repository root.
- **Module systems:** the server is CommonJS; `tools/lib/*.cjs` can be required from it; `tools/lib/mt-layers.js` is
  ESM, so its one-line hash is ported (§5.3). Tests use `import` for vitest and `createRequire` for server modules
  (the header of `server/__tests__/importConcepts.test.js`).
- **better-sqlite3 exists only in `server/node_modules`,** so every script that opens either database lives under
  `server/`. Never `node:sqlite`.
- **Never-throw schema** on both databases: one guard around the whole unit (`048`). `INSERT OR IGNORE` does not
  suppress a foreign-key violation, and foreign keys are on in this build.
- **Organic never.** Nothing mints, opens or captures anything for `lifraen-efnafraedi` (CLAUDE.md § Organic). Its
  serves carry no `baseSha256`, and every write to it is refused (§5.4, §5.6).
- **The study-book allowlist is an enforceable value:** a constant in `server/lib/researchScope.js` (chemistry), pinned
  by a test that also fails if organic ever appears.
- **No read route to research tables,** and no route to the key map. Exports are admin scripts only (G1.15, SD7).
- **No research field in any `sessions.db` column the module route sends** (`SELECT *`).
- **No time of a person in a response.** `module_openings.opened_at_ms`, `module_opening_inflight` and
  `book_switch_events.switched_at_ms` are read on the server only. A response carries at most a derived boolean (for
  example, whether a segment is eligible for suggestions), never a time.
- **No grant or fund is named** in code, comments or commits (CLAUDE.md § Three licences).
- **`process.exitCode`, never `process.exit()`, after output** in the new scripts (CLAUDE.md § Commands).

## 12. Corrections to make alongside this design

This file cannot fix other documents, and a frozen record must not carry their to-dos. **The commit that approves this
spec makes each correction below in its own document,** citing the register by entry date and a quoted phrase, never
by line number. The list is here so that commit has it.

0. **R1–R6 and A1–A3 get a decision record** (`docs/decisions/2026-11-03-…`, written with `/decision-record`), since
   they bind G1.4, G1.5, G1.7, G1.12, G1.13, G1.15, G1.20 and G3.2, not only this project. §4 then points to it.
1. **The register, 2026-11-03 entry** ("Found by the builder check") says human text under the hold lives "only in
   pending `segment_edits` rows". **In flight is pending or approved-and-unapplied**
   (`server/public/js/accept-eligibility.js:41-43`; its SQL twin `server/services/acceptanceService.js:99-105`). The
   register's 2026-10-25 entry records chemistry on production at 122 approved, 0 pending and 28 superseded, so all of
   production's in-flight human text sits in approved-and-unapplied rows. Not every approved row is unapplied:
   §C203's table shows approved rows applied in June whose faithful files were later deleted, which are neither in
   flight nor in the base. A dated correction in place.
2. **The register, 2026-11-02 handoff.** It says the two duplicate-id chains have a `before` that "matches neither
   copy": each chain's head equals its own copy byte for byte, and occurrence 0 misses only because the loader serves
   the last copy (`segmentParser.js:135`). It says the loader "does not serve" chapter metadata: it does
   (`server/middleware/validateParams.js:43` accepts `chapter-metadata`, and
   `loadModuleForEditing('efnafraedi-2e', 2, 'chapter-metadata')` serves `chapter:title:ch02`, whose hash matches its
   chain). The right count is 2,061 of 2,063 chains.
3. **The frozen G1.23 spec, §3:** the chapter-title change is in `ch02/chapter-metadata-changes.jsonl` (511 bytes,
   *Frumeindir → Atóm*), not `ch05`; the other 19 files are empty. And the loader does serve chapter metadata, so the
   non-goal's stated reason is false. (§C203's table also shows an approved row on ch05's chapter metadata, so it is a
   live editing surface.) **The frozen spec is not edited;** the register records the correction, and G1.23's builder
   decides whether the non-goal stands on other grounds.
4. **The Skerfur plan, G1.2's row** (a dated ✏️ note): "The client reports each assist: … propagation, re-attach,
   note-apply." Propagation is a server route (`server/routes/segment-editor.js:1477-1524`), re-attach is a script that
   calls the save service, and note-apply has no code. "A propagated row differs from a typed one only by an editable
   note" understates it: it also has a server-derived base, no activity row, no MT lock, and it can overwrite a typed
   pending row in place. "Acceptance rows carry an origin too": the origin goes in the event only (§5.8).
5. **The Skerfur plan, G1.1's row:** "the client sends the hash of the version it displays" becomes the base hash, with
   the displayed edit checked separately (§5.6, `STALE_DISPLAYED`); the per-unit manifest becomes R5's two pieces and
   the MT lock fix (§5.19); "holding … the freeze commit" is dropped, since whether a version is the frozen base is a
   join on G1.7's manifest (§5.2). Its cited lines have drifted, with the substance intact:
   `routes/segment-editor.js:394` → `:395`, `:423` → `:424`, `:1507` → `:1514`, `:1475` → `:1482`;
   `segmentEditorService.js:147` → `:148`, `:111` → `:110-112`, `:214` → `:215`; `scripts/backup-db.sh:45` → `:46`.
6. **The Skerfur plan, G1.4's row:** "An editor who declines is not used in research" now reads with R1: their finished
   text counts in the contract figure, and nothing about how they worked is captured.
7. **The Skerfur plan, G1.12's and G1.13's rows:** the order (R4: G1.12 before any affected module opens; R6:
   assignment after G1.23's switch-on) and G1.13's two further preconditions (a recorded consent decision and a signed
   licence clause per editor, §8).
8. **The Skerfur plan, G1.20's row:** the research file has its own 7-day rotation (R2, §5.17), apart from the
   long-lived tier, in its own bucket, which the planned versioning must never cover.
9. **The Skerfur plan, G3.2's row:** "read from G1.1's committed manifest" becomes the end-of-editing export (one line
   per segment: the final text's served version, its hash and its state, A2) and the freeze manifest (R5, §5.19).
10. **`docs/deployment/linode-deployment-checklist.md` §9** recommends Linode Backups (`:236`) and a nightly `tar` of
    all of `pipeline-output/` (`:243`). Either would copy `research.db` and break R2. Once this ships it must say the
    research file is excluded.

## 13. Left to the builder

- The exact migration numbers, index names and SQL types, inside the never-throw rule.
- The full flag registry, by reading every consumer on the editing path.
- Checking every reader of `segment_edits.original_content` before the re-save path starts updating it (§5.8).
- The client's handling of a refused save: how the kept text is shown next to the new base so the editor can redo the
  change.
- The consent page's layout and the admin scripts' arguments; the wording is G1.4's.
- The research backup's shell and Node split, and whether it gets a monthly restore test.
- Error-message wording, in Icelandic, for `STALE_BASE`, `STALE_DISPLAYED`, `BASE_MISSING` (which tells the editor to
  reload the page), `DUPLICATE_ID`, `BOOK_NOT_MINTED`, `NO_APPROVED_TEXT` and `OPENING_UNRECORDED` (which tells the
  editor to open the unit again).

## 13a. Build order

**Must ship together:** a required field, the client that sends it and the tests that post it; every column and the
code that writes it.

| PR | Holds | Gate |
|---|---|---|
| **PR1: G1.1 core** (no research file) | `servedText.js`; the migration for `served_text_versions` and the new editing columns; the serve hook (steps 1–3, 6); `servedEdit.js` and the refusals; propagation minting; the client changes (§5.18); the test bodies (G-5); `checks.schema` | — |
| **PR2: the opening record** | `module_openings`, `module_opening_inflight`, the predicate, the 503 | Merged only after G-1d has run |
| **PR3: G1.2** | the research path, connection and schema; `researchScope.js`; the consent tables, `researchConsentText.js` (empty) and routes; `editor_keys`; `record` with its gate and the loss ledger; `book_switch_events`; the flag registry; the server commit (with `deploy.sh`); event emission at every route, with the services returning their before-images; `checks.research_db` | Inert until an approved text is listed. **G1.23 may start once PR1–PR3 are on `main`** |
| **PR4: deletion and backups** | the withdrawal and retention scripts, `research_derived_datasets` and the withdraw route's deletion; the research backup job, its own remote and bucket, its cron line, heartbeat and `backup-stale`; the prune and prefix tests; the checklist correction | Gates consent collection, not G1.23. Before the first *consented* row: G-1a, G-1b, G-1h, the officer's review, then [USER] lists the text |
| **PR5: the end-of-editing export** | `export-served-versions.js`; `opening-eligibility.js` (§5.22) | Any time before G3.2 |

Before any unit opens, whatever the PR order: G1.7's freeze markers (G-1g), G1.12 for the 83 affected modules (R4),
and assignment only after switch-on (R6).

## 14. Claude's calls, for [USER] to check

1. Served versions, the opened time and the snapshot live in `sessions.db`, not the research file, because the screen
   depends on them (§2, §5.1).
2. The same Icelandic text, served first as MT and later labelled faithful, gets two served-version rows, so both
   labels are kept. A save is refused only when the Icelandic text itself changed, never because of the label alone
   (§5.2).
3. The served-version row stores the English text too, and no time (§5.2).
4. Served versions are recorded for every book except Organic Chemistry, and any write to organic is refused (§5.4).
5. A failed serve-time record does not block the editor; but if the opening of a unit cannot be recorded, with its
   served versions, that one serve answers 503 instead of opening the unit unrecorded (§5.4).
6. The opening snapshot takes any in-flight edit by any editor, not only the newest one (§5.5).
7. A save that carries no base hash is refused, never let through (§5.6).
8. A propagation target whose id is duplicated is skipped and reported, not written (§5.6).
9. A refused write is logged as a research event, for instrument health (§5.6).
10. When an editor saves over their own pending edit, the record of which text the edit was made on moves to the text
    they saw this time; the old value is kept in the research event (§5.8).
11. Acceptance rows get no origin column, though the Skerfur row asks for one: whether an editor clicked or used the
    keyboard is behaviour the tool does not need, so it goes only in the research event (§5.8).
12. Research event ids are random, so a withdrawal leaves no gap that shows how much the editor did (§5.9).
13. Notes and comments are logged as length and fingerprint only, never their text (§5.9).
14. A reviewer's event carries another person's text only as a hash, and a before-image keeps another person's fields
    by the field table: state kept, text hashed, identity and time dropped (§5.9).
15. No code may change a research row; only the deletion scripts and the withdraw route may remove rows. Tests enforce
    this, not a database lock, because a lock would also block the deletion (§5.9).
16. Restoring a draft is recorded as an assist (`draft-restore`) (§5.10).
17. What the browser reports about an assist is checked where the server can, marked validated, unverified or
    mismatch, and never refused (§5.10).
18. A repetition insert or a restored draft keeps the whole text it put in place, so hand effort can be measured from
    it (§5.10).
19. A research row is written during the editor's request. A failed write is not tried again later; it is recorded as
    a loss. A queue of later writes would be emptied by every server restart (§5.11).
20. The table linking each editor to their random research key lives in the research file, one key per consent
    interval, so a withdrawal deletes it with the editor's rows. The cost: if the research file is ever lost, data from
    before and after cannot be linked to the same person (§5.16).
21. Research backups run on the editorial backup's 6-hourly cadence; deletion runs at withdrawal and again before every
    copy (§5.15, §5.17).
22. Off-box research copies go to their own encrypted bucket with versioning off, not under a name prefix in the
    editorial bucket as R2's wording says: the bucket sees only encrypted file names, so no rule can be scoped to a
    prefix, and G1.20 plans versioning for the editorial bucket (§5.17).
23. If a reviewer acts on text that changed after their page loaded, the event flags it and the act goes through;
    refusing it is for G2.1 or SD4 to decide (§5.18).
24. The consent text says research data is never used for hours, pay or workload (§6 item 10).

**Not calls, and so not listed:** the opened record has no user (R3); reviewer events carry no author key (R1); loss
notes carry the day only (R3); G1.23's switch table has no "by" column (R3); a save on a displayed edit that has since
changed is refused (Skerfur G1.1's row); what research figures may read (A1); the export's lines, decliners' segments
included (A2); the loss notes in `sessions.db`, outliving 7 days in the editorial backups (A3).

### Questions [USER] answered (2026-11-03)

Each answer was the recommended option.

1. **A1, R3's reading: "Research file + person-free data".** Research figures read the research file,
   `served_text_versions` joined by value, the opening snapshot, a per-module *opened after the first switch-on*, the
   committed files and the loss counts, and never an editing record (§5.22, §8's G1.23 row, T17).
2. **A2, R5's export: "Final text + segment state".** One line per segment occurrence: the served version its final
   text was made on (`null` when untouched, MT-accepted or made before G1.1), that text's sha256 and a state. No
   attempts, names, times or edit ids. It serves G3.2 and the contract figure (§5.19, R1's note, §6 item 16, T22).
3. **A3, loss notes against R2: "Accept, say so in consent".** Loss notes stay in `sessions.db` with the consent
   interval, unit, day and act type, and no text; the consent text says copies may survive in the editorial backups
   for their lifetime (§5.11, §6 items 6 and 19).

## 15. Questions this design leaves to other records

- **SD6:** whether [USER] is a participant (the `stratum` field carries it), the retention date (the constant in
  §5.15 holds it) and how long the consent, deletion and loss records are kept after it.
- **The legal basis and the data protection officer's process.** The D12 record marks GDPR Article 7(3) as inference,
  not checked; the officer's lead time is unknown (G1.4).
- **The de-identified derived dataset:** who derives it, when, where it lives (never `research.db` or
  `research-exports/`), and what "de-identified" means with three editors under SD6's group rule.
- **ch10:** what it gets from G1.23 (its 1 November re-run answers, or no suggestions). Nothing in this design depends
  on the answer.
- **An inventory of personal data held outside the research file** (activity log, `analytics_events`,
  `chapter_generation_log`, `content_versions.applied_by`, notifications, the request log, review-status sidecars) is
  G1.15's; §6 names the ones this tool keeps for editors.
