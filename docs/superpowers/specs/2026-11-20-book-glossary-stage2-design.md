# The book glossary layer, stage 2: the head editor's screen, the worklist and the export hold

> 🧊 APPROVED by [USER] 2026-11-20, with the calls in §7. Builder-checked the same day; [USER]'s answers to its two
> questions are in §4 and §5.1. Frozen from that date: this is the design record (evidence, never status). Status lives in the register (`docs/plans/2026-07-21-post-item17-followup-campaign.md`).
>
> It builds on the approved stage-1 design,
> [`2026-11-19-book-glossary-layer-design.md`](2026-11-19-book-glossary-layer-design.md) (cited below as **S1**),
> whose §5.6 sketched stage 2. Where this document and S1 §5.6 differ, this one is the later decision.

## 1. Intent

Terms will change while chemistry is being edited: new translations, and proposals to the Chemical Society's
terminology committee. [USER] ruled on 2026-11-19 that the **head editor** makes those changes in Ritstjóri, in the
book glossary layer that stage 1 built (S1 §1). Stage 1 has no screen; c19's rulings were loaded by a script. Stage 2
gives the head editor the screen, and after a term changes, a **worklist** of segments that still use the old word.

A layer change reaches two places at different speeds (S1 §5.3): the segment editor sees it on the next request; the
committed glossary export (`books/<book>/glossary/glossary-unified.json`) changes on the next 2-hourly cron run. That
second path is where stage 2 needs a new safeguard. Glossary **premise-pin tests** read the committed export, so a
change nobody reviewed can turn `main` red: c19's export did, on 2026-11-19, until #745 re-pinned three tests. In
stage 1 a developer made every change and could run the pins first. In stage 2 the head editor makes them, so
**[USER] ruled on 2026-11-20 (option 2):** the layer's own record, `book-glossary.json`, is committed at once, and
`glossary-unified.json` is **held** when the layer changed it, until a developer has run the premise pins and released
it.

When stage 2 is needed: before editors start changing terms. With the December pilot that is early December (S1 §5.7).

## 2. Goals, non-goals, anti-goals

**Goals**
- G1. The head editor, on a Ritstjóri page, looks up a headword in their book and sees what the book resolves it to;
  then sets the book's Icelandic (as a replacement or alongside), excludes the headword or one row, undoes an
  exclusion, changes an entry or removes it. Each change asks for a reason and an optional source.
- G2. After a replacement, a change or a removal, the page lists the segments whose English holds the headword and
  whose editor text still holds a form of the old Icelandic, each linked to the segment in the segment editor.
- G3. A new or changed entry's Icelandic gets its inflections from BÍN without a developer, so the worklist and the
  editor's form check see inflected forms.
- G4. A layer change never reaches `glossary-unified.json` (and so never reaches `main`) until a developer has run
  the premise pins against exactly that export and released it. The layer's record still reaches git within one cron
  cycle (S1 goal G4).
- G5. Every hold is visible: on the page, in the deploy readout and, past the existing refusal threshold, in
  `/api/health`.
- G6. The §C239 items that stage 2 makes reachable are closed (§5.8).

**Non-goals**
- Rewriting text. The worklist is read-only; every text change goes through the normal edit and approval flow (S1 §2).
- Matching the old word inside a compound (see §5.5 and call 1).
- A new notification channel. Production sends no email (register §C197), and in-app notifications are left for later.
- Changing `terminology.html`, `houseStyleTerms.js` or `book_term_preference` (S1 §2).
- The segment editor's free-text lookup box (S1 §2, register §C237).
- Sense-aware prompts (§C232) and marker-stripped matching (§C235).

**Anti-goals** (failures even if the code works)
- A head editor's change that turns `main` red without a developer having seen it.
- A release that writes an export other than the one the developer tested.
- A hold nobody can see.
- A layer change that cannot be traced to a person, a date and a reason (S1).
- A change in one book that alters what another book resolves (S1).
- A worklist that edits text, or that reads a source other than the editor's effective text.
- An email address in the public record.
- A layer change that silently disables a book preference, or silently overrides a house-style ruling.

## 3. Constraints

- **Mutations are POST.** The `auth_token` cookie is `SameSite=Lax`, and POST-only mutation is the project's real
  CSRF control (CLAUDE.md § Auth). No `PUT`/`DELETE` routes.
- **Validate at the route** (global rule, and §C239 T2b): the write API (`server/lib/bookGlossaryLayer.js`) trusts its
  callers; the stage-2 routes are the boundary.
- **The layer is database-owned** (S1 §3): nothing re-asserts it on boot.
- **The exporter's gates are separate acknowledgements** (`server/scripts/export-terminology.js` header): `--adopt` and
  `--force` answer different questions, require `--book`, and the cron (which runs the script bare) can reach
  neither. The release flag follows the same rule.
- **A refusal outcome is named `refused-…`**, so `isUnresolved`, the `since` clock (decision D6),
  `glossaryExportHealth` and the deploy readout classify it with no enumeration (`export-terminology.js`).
- **`sameTerms` compares `.terms` only** (`server/lib/glossaryExportDecision.js`), so a top-level key in the payload
  does not make a file look changed.
- **Production installs without dev dependencies**: `vitest` is not on the box, so the premise pins run on a
  developer's checkout.
- **The BÍN file is licensed and not in the repository** (`tools/data/SHsnid.csv`, `.gitignore`). Measured
  2026-11-20: present on production (377 MB). Absent on dev boxes without it and in CI. Its credit must be shown where
  BÍN data is used (header of `server/scripts/fetch-bin-inflections.js`).
- **Ritstjóri's interface is Icelandic.** New user-facing strings are Icelandic.
- **Measured 2026-11-20, for the worklist:** `buildEffectiveSegments` over all 170 chemistry study units (22,591
  segments, 3.29 M characters of Icelandic) takes about 0.24 s on the dev box.
- **Measured 2026-11-20, for inflections:** on production 27,686 of 92,339 Icelandic `concept_term` rows carry
  inflections; the 19 book-layer rows carry none. `loadBinEntries` (`server/lib/binInflections.js`) streams the CSV
  and keeps only a given candidate set, so a lookup for one entry costs one pass over the file, not its size in
  memory. Production has 2 cores and about 3 GB available.

## 4. Approaches

Chosen by [USER] on 2026-11-20 unless marked as a call.

| Decision | Options considered | Chosen |
|---|---|---|
| How a head editor's change reaches the committed export | (1) commit it, then a developer re-pins if `main` goes red; (2) commit the record, hold `glossary-unified.json` until a developer runs the pins and releases it; (3) move the pins onto fixed test data | **(2)** — `main` stays green, and the cost is small: everything downstream of the unified file (rendering, MT, the pre-screen) is developer-run anyway, and the record reaches git at once |
| How the cron knows a change came from the layer | (A) stamp the committed `glossary-unified.json` with the last layer change it reflects; (B) keep "held since change N" in the exporter's status file | **(A)** — the state that matters is in git; (B) is lost with the status file |
| Inflections for a new or changed entry | (A) a background BÍN lookup on save; (B) a developer runs `fetch-bin-inflections.js` by hand | **(A)** — under (B) the worklist misses inflected forms (*keri*, *kersins* for *ker*) until a developer acts, which is the main thing the list is for |
| How the worklist is computed | on request book-wide; per chapter; a stored index | **On request, book-wide** — the one sensible way: the scan costs about 0.24 s, so a chapter filter or an index buys nothing, and S1 §5.6 asked for no stored state |
| Where the screen lives | a new page; a tab in an existing page | **A new page, `/book-glossary`** (my call; S1 §6 left it to the builder, provided it does not grow `terminology.html`) |
| What the public record shows about a change (raised by the builder check) | (a) the person's display name, the account id in the database, reason and source published with a notice on the form; (b) as (a) with a role instead of a name; (c) a role, with reason and source kept in the database | **(a)** — editors are already credited by name in public (*ritstjórn*), the email never appears, and git still says why a term changed |
| Whether the head editor may override a ruling made elsewhere (raised by the builder check) | refuse; warn and confirm; allow silently — decided separately for house style and for book preferences | **House style: warn and confirm** (the head editor owns the book's terms during editing). **Book preference: refuse, telling the head editor to ask a developer** (the page cannot edit preferences, so it would leave a broken setting behind) |

## 5. Design

### 5.1 The write API: what stage 2 adds

`server/lib/bookGlossaryLayer.js` has `addExclusion` and `addEntry` (stage 1). The history table already allows five
actions (`exclude`, `unexclude`, `entry-add`, `entry-change`, `entry-remove`; migration 058). Stage 2 adds the other
three operations, each in one transaction with its history row, `before_json` and `after_json` filled:

- **`removeExclusion(db, {book, exclusionId, by, reason, source, at})`** → history `unexclude`. Undoing a replacement's
  single-concept exclusion while its entry stays makes the old word acceptable again (the entry becomes an "add").
- **`changeEntry(db, {book, conceptId, icelandic?, forms?, by, reason, source, at})`** → history `entry-change`.
  - A new Icelandic replaces the entry's rank-1 Icelandic `concept_term` text and **clears its `inflections`**, so the
    stale forms of the old word are never used for the new one; the lookup (§5.4) refills them. **The old word's
    inflections are kept in the history row's `before_json`** (the database), so the change's worklist can still find
    its inflected forms (call 12).
  - New English forms are added, removed forms deleted; every form keeps the stage-1 refusals (another entry on that
    headword, a whole-headword exclusion of it, a `book_term_preference` for it).
- **`removeEntry(db, {book, conceptId, by, reason, source, at})`** → history `entry-remove`. Deletes the
  `book_glossary_entry` row and the book-owned `concept` (its `concept_term` rows follow by `ON DELETE CASCADE`;
  `foreign_keys` is on, CLAUDE.md), after copying the entry's Icelandic and its inflections into the history row's
  `before_json`, for the removal's worklist. The page then offers to undo the single-concept exclusions on the entry's
  headwords, one `removeExclusion` each (call 2).

**The committed record never carries inflections** (call 12). `buildBookGlossaryRecord` writes each history row's
`before` and `after` into the public `book-glossary.json`; it strips any `inflections` key from them, as it already
leaves out an excluded row's Icelandic (S1 §5.4). The BÍN data stays out of the repository (`tools/data/` is
gitignored), and whether forms derived from it may be published under the books' licences is not settled by anything
this design rests on. A test pins that no field of the record holds an inflection list.

Refusals added to the write API (all throw `LAYER_REFUSED`, as stage 1's do):
- forms that collide by match key within one call are deduplicated before writing, and an exact duplicate never
  reaches SQLite as a raw `SQLITE_CONSTRAINT_UNIQUE` (§C239 T2a);
- a single-concept exclusion naming the book's **own** entry concept is refused (T2c);
- a second entry of the same book on a headword is refused (T3f);
- (stage 1, kept) a whole-headword exclusion beside an entry; a preference on an entry's English; a `replace` whose
  replaced concept does not carry the form.

**Rulings made elsewhere** ([USER], 2026-11-20):
- **A book preference is never broken from the page.** An exclusion is refused when a `book_term_preference` row of
  the book (any chapter) is on that headword (`english`, case-insensitive) and either the exclusion is whole-headword
  or the preference's `term_id` belongs to the excluded concept. The stage-1 refusal of an entry on a preferred
  English stays. Both refusals carry an Icelandic message telling the head editor to ask a developer, since the page
  does not edit preferences.
- **House style is overridden only on confirmation.** An entry (add or replace) on a headword where a candidate
  concept of the `house-style` collection is in scope, or an exclusion that removes such a concept, is refused with
  the code `needs-confirm`, naming the house-style term, unless the request carries `confirmHouseStyle: true`. A
  confirmed write records the overridden house-style concept and term in its history row's `after_json`, so the
  record shows that a ruling was overridden and by whom.

**Who made a change** ([USER], 2026-11-20):
- The database stores the **account id**: `req.user.id`, the provider id that `userService.findByProviderId` takes,
  in `by`, `created_by` and `updated_by`. It always comes from the session, never from the request body.
- The committed record shows the person's **display name** instead: `buildBookGlossaryRecord` maps an account id to
  the `display_name` of its `users` row. A `by` that matches no account (the c19 loader's label,
  `c19-load ([USER] rulings 2026-11-18)`) is written as it is. With no display name it writes the role
  (*aðalritstjóri*, *stjórnandi*, the labels Ritstjóri already uses) (call 14).
- **The record never carries an email address**: not the session's `username` (which is the email, `auth.js`), not
  the `users.email` column. A test pins it.

### 5.2 The API

All routes are under `/api/book-glossary/:book/`, guarded by `requireAuth, requireHeadEditor('book')`, so a head
editor reaches only their own books and an admin any book (`server/middleware/requireRole.js`). Mutations are POST.
Names are indicative; the builder may adjust them.

| Route | Does |
|---|---|
| `GET /` | The book's layer: exclusions and entries with provenance and inflection status; the hold state (§5.6); the last record write result |
| `GET /lookup?english=` | What the book resolves the headword to now: winner, `alsoInScope`, out-of-scope suggestions, any layer rows on it (from `conceptResolver`'s `buildScope` + `resolveCandidates`), **whether a house-style concept is in scope, and the book's preferences on the headword by chapter** |
| `GET /history?english=` | The history rows for a headword, newest first |
| `POST /exclusions` | `{english, conceptId, reason, source?, confirmHouseStyle?}`; `conceptId` 0 = the whole headword |
| `POST /exclusions/:id/undo` | `{reason, source?}` |
| `POST /entries` | `{forms[], icelandic, mode: 'replace'|'add', replaces?: conceptId[], reason, source?, confirmHouseStyle?}` |
| `POST /entries/:conceptId/change` | `{icelandic?, forms?, reason, source?, confirmHouseStyle?}` |
| `POST /entries/:conceptId/remove` | `{reason, source?, undoExclusions?: id[]}` |
| `POST /entries/:conceptId/inflections` | Retry the BÍN lookup (§5.4) |
| `GET /worklist?changeId=` | The worklist for one history row (§5.5) |

**Validation at the route (§C239 T2b):** `:book` is a registered book; `english` and each form are non-empty after
trimming, hold no control characters, and have a length limit (builder's value); `conceptId` is an integer ≥ 0;
`icelandic` is non-empty; `reason` is required and non-empty; `source` is an optional string; `forms` is a non-empty
array; `mode` is one of the two values; `confirmHouseStyle`, when present, is a boolean. A refusal from the write API
returns 409 with an Icelandic message mapped from the refusal, and `needs-confirm` returns 409 with that code and the
house-style term so the page can ask; a validation failure returns 400.

**A book with no `glossary/` directory cannot be written to** (409): its layer could never reach git, because the
exporter only visits books that have that directory (call 3; §C239 T4e).

Every successful write logs an activity event (`server/services/activityLog.js`; a new `ACTIVITY_TYPES` member, whose
label is a user-facing Icelandic string).

### 5.3 The page

`/book-glossary`, guarded by `requirePageAuth(ROLES.HEAD_EDITOR)` (`server/routes/views.js`), linked in the menu for
head editors and admins beside *Aðlögun* and *Úthlutanir* (the menu is built in `server/public/js/layout.js`). It follows the other pages' pattern (an HTML view plus
a script in `server/public/js/`). A book selector lists only the books the user may change. Three parts:

```
┌ Orðasafn bókar: Efnafræði ─────────────────── [bók ▾] ┐
│ ⏸ Útflutningur orðasafns bíður forritara síðan 14:02   │  ← only while held (§5.6)
├ Fletta upp ────────────────────────────────────────────┤
│ [ cell                 ] [Fletta]                       │
│ Bókin notar nú: ker  (efnafræði, Íðorðabankinn)         │
│   Einnig: rafhlaða (eðlisfræði) · utan sviðs: fruma     │
│   [Setja þýðingu bókar]  [Útiloka orðið]  [Útiloka línu]│
├ Lag bókarinnar ────────────────────────────────────────┤
│ standard cell potential → staðalíspenna  §C234 · 19.11  │
│   beygingar: aðeins rithátturinn  [Sækja beygingar]     │
│   ⓘ þriggja orða: nær til ritilsins, ekki útflutnings   │
│ SI — útilokað  (r075, c19) · 19.11   [Afturkalla] [Saga]│
├ Verkefnalisti: ker → rafhlaða (breytt 20.11) ──────────┤
│ Kafli 17 · m68810 · para-00012  „…í kerinu er…" [Opna]  │
└─────────────────────────────────────────────────────────┘
```

- **Look up.** Shows the resolution and the actions that fit it, and marks a house-style term and any book preference
  on the headword. Every action asks for a reason and an optional source (for example "terminology committee,
  proposal of 2026-12-03"). "Set the book's Icelandic" asks whether it **replaces** the current word (hides it: entry
  plus single-concept exclusions, S1 §5.2) or is added **alongside** (an entry only).
- **The public notice.** Every action form says, beside the reason and source fields, that they and the person's name
  are published in the project's public repository, and asks the head editor not to quote a rejected
  Íðorðabankinn term in the reason (S1 §5.4 keeps those out of the record). Wording is the builder's, in Icelandic.
- **House style and preferences.** A `needs-confirm` answer shows the house-style term the change would override and
  asks for confirmation; confirming resends with `confirmHouseStyle: true`. A preference refusal shows the message
  telling the head editor to ask a developer, and offers no way past it.
- **The layer.** Every exclusion and entry, with who, when, reason and source, its history, and for an entry its
  inflection status: *N beygingarmyndir*, *aðeins rithátturinn* with the reason (not in BÍN, ambiguous, several words,
  file absent), or *sæki…*. The BÍN credit line is shown wherever inflections are listed. An entry of three or more
  English words carries a note that it reaches the editor, not the export (S1 §5.3).
- **The worklist.** Opened from a history row (after a replacement, a change or a removal); see §5.5.

The refusal and validation messages are Icelandic.

### 5.4 Inflections on save

After an `entry-add` or an `entry-change` that sets a new Icelandic, the route answers at once and then starts a
background lookup, following the fire-and-forget child-process pattern `tmService` uses for TM regeneration
(`server/services/tmService.js`):

- It runs `server/scripts/fetch-bin-inflections.js --execute` restricted to that entry's Icelandic `concept_term` row(s)
  by a new flag (indicatively `--concept-term-ids`), so the script's existing rules apply unchanged: part-of-speech
  choice, refusal of ambiguous strings, multi-word strings skipped, the D5 no-op. The script must not be reimplemented
  in the server.
- One lookup at a time per server; a request while one is running waits its turn (queue or retry; builder's call).
- Its result (forms written, or the reason none were) is logged as an activity event, and the page reads the row's
  `inflections` to show the status. The retry route reruns it.
- With no BÍN file (dev boxes, CI), the lookup reports "file absent" and the entry stays "exact form only". **Tests use
  a small fixture CSV, never the licensed file.**
- The 19 c19 entries are filled once, by running the script for the book-layer rows with the new flag (a runbook
  step in the plan, run by [USER] on production).

### 5.5 The worklist

`GET /worklist?changeId=N` reads one history row and derives:
- **the English forms**: the entry's forms (for a removal, the forms in `before_json`);
- **the old Icelandic**: for a replacement, the rank-1 Icelandic of each replaced concept (stage 1 stores it on the
  exclusion row, column `icelandic`, at writing), with that concept's inflections; for a change, the Icelandic and
  inflections in `before_json`; for a removal, the entry's own Icelandic and inflections in `before_json` (the book
  word that may now be wrong).

An "add alongside" has no worklist: the old word stays acceptable.

It then scans every study unit of the book (the same unit list the editor uses) with `buildEffectiveSegments`
(`server/services/segmentEditorService.js`): the served text with each segment's newest live edit laid over it, as S1
§5.6 requires (chemistry's faithful writes are held, `server/lib/applyHold.js`, so editors' changes live in
`segment_edits`). A segment is listed when:
- its English holds one of the forms as a whole word, by the matcher's rule (exact case for a symbol-shaped headword,
  case-insensitive otherwise; the same word-boundary helper the editor's matcher uses, `server/lib/wordBoundary.js`);
  and
- its effective Icelandic holds a form of the old Icelandic as a whole word, case-insensitively: the old word's
  inflections when known, else its surface form.

**The old word inside a compound is not listed** (call 1): whole-word matching keeps *ker* from matching *kerfi*
("system"), and no rule that finds *kerspenna* would also reject *kerfi*.

Output, grouped by chapter: module, segment id, a short excerpt with the matched form marked, and a link
`/editor?book=…&chapter=…&module=…&segment=…` (the segment editor reads those parameters). Nothing is stored; the list
is recomputed on every request, so it shrinks as editors fix segments. Tests key on segment ids, never on prose
(CLAUDE.md: prose cannot identify an element).

### 5.6 The export hold

In `server/scripts/export-terminology.js`, per book:

1. **The stamp.** For a book with any layer history, the written `glossary-unified.json` carries a top-level
   `bookLayer: { lastChangeId: N }`, the largest `book_glossary_change.id` for that book when the export was built. A
   book with no layer history gets no stamp. The builder confirms the producer detection ignores the new top-level key
   (it fingerprints per-term shapes and the top-level `producer` stamp).
2. **The gate**, placed after the `unchanged` check and before the shrink and growth gates. When the book has layer
   history, the committed stamp is missing or lower than the current `lastChangeId`, and the terms differ from the
   committed file: the outcome is **`refused-layer-change`**, with detail naming the stamp, the current change id and
   the **terms hash** (sha256 of `JSON.stringify(next.terms)`, the same thing `sameTerms` compares). The would-be
   payload is written to `pipeline-output/glossary-held/<book>.json` (gitignored), replaced on every run.
   `book-glossary.json` is still written first, as today, so the record reaches git.
3. **A mixed change is held whole** (call 5): if the layer moved and something else changed too (an Íðorðabankinn
   import, a house-style deploy), the export is held; the release covers both.
4. **Restamp** (call 4). When the terms are unchanged but the stamp is behind or missing, the file is rewritten with
   the current stamp only, outcome `restamped` (a resolved outcome, not `refused-`). Otherwise a layer change that did
   not move the export (a three-word entry, for example) would leave the stamp behind, and a later unrelated change
   would be held for no reason. On the first run after deploy, chemistry restamps once.
5. **Release.** `node server/scripts/export-terminology.js --book <slug> --release-layer <terms-hash>`:
   - requires `--book`, like `--adopt` and `--force`, so the cron cannot reach it;
   - writes only if the current would-be terms hash equals the one given, so **what is released is exactly what was
     tested**; otherwise it refuses and prints both hashes ("the layer moved again; test again");
   - stands down the layer gate only: the producer, shrink and growth gates still apply and need their own flags;
   - writes the current stamp. The next cron run commits the file.
6. **Visibility.**
   - `refused-layer-change` gets the D6 `since` clock and reaches `/api/health` past the existing threshold
     (`GLOSSARY_REFUSAL_STALE_DAYS`, read there, not restated) with no new code beyond the outcome name.
   - The deploy readout gains a remedy line for it in `scripts/deploy.sh`'s remedy map, naming the held file and the
     release command; its pinned test, `scripts/__tests__/deploy-health-readout.test.mjs`, round-trips the printed
     command through `parseArgs`, so the new flag is pinned there too.
   - The page shows the hold banner (§5.3) from the status file, read through the same reader `/api/health` uses
     (`server/lib/glossaryExportHealth.js`).
   - No new notification channel (call 8).

### 5.7 The developer's release step

A dev-side script, indicatively `scripts/check-held-glossary.sh <book>` (MIT tooling; it imports no server code):

1. Read production's HEAD and the held file's terms hash over `ssh` (read-only), and copy the held file down.
2. Make a temporary worktree at **production's HEAD**, so the pins run against the code that built the export, with
   both `node_modules` trees available (memory note: a worktree floor needs both dependency trees).
3. Put the held file at `books/<book>/glossary/glossary-unified.json` in the worktree and run the premise-pin test
   files, found with `grep -rlaF 'glossary-unified.json' tools/__tests__ server/__tests__ scripts/__tests__` rather
   than from a list (register, c19 entry).
4. Print the verdict, the failing files by name, and the terms hash to release.

Then:
- **all green:** [USER] runs the release on production (§5.6 step 5); the next cron run commits the export.
- **a pin goes red:** prepare the re-pin as a test-only PR from the held file, release, and merge the PR right after
  the cron's commit reaches `main` (the register's c19 procedure). The hold keeps `main` green until both are ready.

The script never writes to production. Release is a production write, so it stays [USER]'s (deploy-infrastructure
standing permission).

### 5.8 §C239 items closed here

- **T2b** route validation (§5.2). **T4e** a record write never creates a book's `glossary/`: `writeBookGlossaryRecord`
  loses its `mkdirSync` and reports `no-glossary-dir` instead, and the routes refuse writes for such a book (§5.2).
- **T2a**, **T2c**, **T3f** refusals in the write API (§5.1).
- **T4h** a record write error reaches `/api/health` (the glossary-export check reads `bookGlossaryRecords`) and the
  deploy readout, not only the status file.
- **T4c** `buildBookGlossaryRecord`'s entry query gets an `ORDER BY` (it is touched by the new operations).
- **R20** (`PG`/`pg`, `cal`/`Cal`): no code; the head editor can now exclude them on the page.
- The other §C239 minors stay parked unless the builder touches their lines.

### 5.9 Tests

- The write API: each new operation's history row (`before_json`/`after_json`), each refusal by code and row count,
  forms deduplication, inflections cleared on a changed Icelandic.
- The routes: the guard (another book's head editor gets 403), each validation failure (400), each refusal (409), `by`
  taken from the session (a `by` in the body is ignored), and the no-`glossary/` refusal.
- Rulings made elsewhere: an exclusion on a preferred headword refused, whole-headword and single-concept, with the
  preference row unchanged; an exclusion of a non-preferred concept on that headword allowed; a house-style override
  refused with `needs-confirm` without the flag, written with it, and its history row naming the overridden term.
- The record's identity: an account id written as its display name; the c19 label passed through; the role written
  when there is no display name; **no email anywhere in the record** (assert on the serialised file, against a user
  whose email is set); and no inflection list anywhere in it (call 12).
- The hold: stamp written; held on a layer change (record still written, held file written, outcome and hash);
  not held on a non-layer change; a mixed change held; restamp; release with a matching hash writes, with a stale hash
  refuses, without `--book` is rejected, and does not stand down the shrink gate; a book without a layer untouched.
- The deploy readout remedy (`deploy-health-readout.test.mjs`) and the health check reading record errors.
- The inflection lookup with a fixture CSV: forms written, ambiguous refused, multi-word skipped, file absent.
- The worklist: keyed on segment ids; an inflected old form found; the old word inside a compound not listed; a
  segment already fixed by a live edit not listed (positive control: the same segment listed before the edit).
- E2E (CI's `e2e` job): the page as a head editor: look up, replace, see the worklist row, undo; an editor is sent away
  from the page.

### 5.10 Order of work

Three PRs, in this order (call 9):
1. **The export hold**: stamp, gate, restamp, release, held file, deploy readout, health, T4e/T4h, and the dev-side
   check script. It must be deployed before any head editor can change the layer from the page.
2. **The write API and the routes**: §5.1, §5.2, the inflection lookup (§5.4), T2a/T2b/T2c/T3f/T4c.
3. **The page and the worklist**: §5.3, §5.5, E2E.

## 6. Left to the builder

- Route names and response shapes within §5.2; the length limit for headwords and forms.
- The page's markup and script layout within the project's pattern; Icelandic wording.
- How lookups queue (§5.4) and whether the activity type is one or several.
- The fixture CSV's contents; test file layout.
- How the dev-side script links the dependency trees into its worktree.

## 7. Calls made in this draft (for [USER] to check)

1. **The worklist matches whole words only**, so the old word inside a compound is not listed: whole-word matching
   keeps *ker* from matching *kerfi*, and no simple rule finds *kerspenna* without also finding *kerfi*.
2. **Removing an entry offers to undo the single-concept exclusions on its headwords**, each as its own history row,
   so the shared word can come back in one step.
3. **A book with no `glossary/` directory cannot be changed on the page**, because its layer could never reach git.
4. **Restamp**: when only the stamp is behind, `glossary-unified.json` is rewritten with the new stamp (one cron
   commit, terms unchanged), so a stale stamp cannot hold a later unrelated change.
5. **A change that mixes layer and other causes is held whole**, and one release covers it.
6. **Release takes the hash of what was tested** and refuses if the export has moved since.
7. **All mutations are POST**, following the project's CSRF rule.
8. **No new notification channel**: the page banner, the deploy readout and `/api/health` past the refusal
   threshold are the hold's visibility.
9. **Three PRs, the hold first**, deployed before the page can change anything.
10. **"Add alongside" has no worklist**; a replacement, a change and a removal do.
11. **The held export lives in `pipeline-output/glossary-held/<book>.json`**, gitignored, replaced on every run.
12. **A change or removal keeps the old word's inflections in the history row's `before_json`, and the committed
    record strips them.** Without this, `changeEntry` clears them and `removeEntry` deletes them, so those two
    worklists would match only the exact old form, against the reason inflections are looked up at all (§4). Keeping
    them in the database needs no migration; stripping them from the record keeps BÍN-derived forms out of the
    public repository. *(Raised by the builder check, 2026-11-20.)*
13. **The record resolves names when it is built**, from the account's current `display_name`, rather than storing a
    name at writing. No migration is needed; the cost is that renaming an account rewrites that person's past rows
    in the next record (one cron commit).
14. **With no display name, the record writes the role** (*aðalritstjóri*, *stjórnandi*, the labels Ritstjóri already uses), never the email and never
    the account id.
15. **A confirmed house-style override is recorded in the history row**, naming the overridden concept and term, so
    the research record shows which of [USER]'s rulings a head editor set aside.

[USER]'s decisions of 2026-11-20, for reference (§4): the export hold (option 2), the stamp (1A), inflections on save
(2A), the worklist on request, the page; the record shows the display name with reason and source published under a
notice (option a); house style warn-and-confirm, book preferences refused with an "ask a developer" message.
