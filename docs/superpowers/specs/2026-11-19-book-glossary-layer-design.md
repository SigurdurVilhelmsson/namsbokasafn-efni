# A book-scoped glossary layer, and c19's rulings applied through it

> 🧊 APPROVED by [USER] 2026-11-19 ("write the implementation"), with the calls in §7. Frozen from that date: this
> is the design record (evidence, never status). Status lives in the register
> (`docs/plans/2026-07-21-post-item17-followup-campaign.md`).

## 1. Intent

[USER] ruled all 212 rows that the c19 pre-screen flagged (2026-11-18; register, c19 entry). The rulings are about
**chemistry's view**: what the segment editor offers on chemistry, and what chemistry's glossary export carries.
126 of the 133 rulings that change anything fall on physics or biology rows that chemistry reaches only through its
fallback order (`BOOK_DOMAIN_PRIORITY`, `server/lib/domains.js`).

Today the only levers are global. Deleting or rewriting a `concept_term` row also changes it for every other book
whose domains reach it. Many flagged rows are right in their own field (`function → fall`, `geometry → rúmfræði` in
physics). Global edits are also not durable: `server/scripts/import-concepts.js` re-inserts every term of an
Íðorðabankinn concept it imports, so a deleted or rewritten row returns on the next import of that collection.

[USER]'s rulings, 2026-11-19:
- a **book-scoped glossary layer** over the shared concept model, not a copy of chemistry's glossary;
- the **head editor changes it in Ritstjóri**, because term translations will change during editing (new
  translations, proposals to the Chemical Society's terminology committee), so the layer lives in the database.

## 2. Goals, non-goals, anti-goals

**Goals**
- G1. A book can (a) exclude an English headword entirely, (b) exclude one concept for a headword, (c) set its own
  Icelandic for a headword, new or replacing what the shared model gives. All three affect that book only.
- G2. One resolver change makes the layer take effect everywhere the glossary reaches: the segment editor's term
  prompts and save-time consistency check (`findTermsInSegments`), and the glossary export (`buildResolvedGlossary`),
  and through the export the MT glossary arms and math-label rendering.
- G3. c19's 133 changing rulings, plus §C234 ⑧ (`standard cell potential → staðalíspenna`), are loaded into
  chemistry's layer by a committed, dry-run-by-default script that [USER] runs on production.
- G4. Every layer change carries who, when, why and its source (a c19 ruling id, a committee decision), and the
  layer's state reaches git, so the research can reconstruct the glossary at any date (CLAUDE.md § Purpose).
- G5. Stage 2: a head editor maintains the layer from a Ritstjóri screen, and after changing a term sees a
  **worklist** of segments that still use the old word.

**Non-goals**
- Rewriting text. A glossary change never edits a segment: the MT is frozen for the study (G1.7) and the edited text is
  the editors' work. A blind replace would also damage Icelandic inflection and compounds (CLAUDE.md, the flat-map
  rule). Text changes go through the normal edit and approval flow, prompted by the worklist.
- Folding `houseStyleTerms.js` (migration 051) or `book_term_preference` into the layer. They keep working unchanged.
  Consolidation may come later.
- Sense-aware prompts (§C232) and matching against marker-stripped text (§C235).
- Changing the old-model terminology page (`server/views/terminology.html`); G1.17 owns that.
- The segment editor's free-text term lookup box. It calls `terminologyService.lookupTerm`, which reads the old
  `terminology_headwords`/`terminology_translations` tables, not the concept model, so it does not see the layer
  (or anything else the concept model holds). That is an older gap, logged in the register as its own item, not
  fixed here.
- The eight §C234 entries whose terms are not yet ruled. The stage-2 screen is how they get added.

**Anti-goals** (failures even if the code works)
- A change for chemistry that alters what any other book resolves.
- A whole-headword exclusion that lets a fallback or out-of-scope row take over.
- A layer change that cannot be traced to a person, a date and a reason.
- An excluded phrase that still hides the words inside it from the editor.
- A migration that can stop the server from booting.

## 3. Constraints

- **The resolver is a hot path.** §C24 took the server down for minutes per call. The layer must be loaded once per
  scope (`buildScope`), in a few indexed queries, never per hit.
- **Migrations run on every boot and must never throw.** Use 057's shape: `up()` is only a try/catch around
  `migrate(db)`; no foreign keys (an FK violation in a boot migration stops the server); idempotent DDL; added to
  `migrationRunner.js`'s require list.
- **A database-owned value, by [USER]'s ruling.** This departs on purpose from "a ruling is code"
  (`houseStyleTerms.js` + 051). Nothing may re-assert the layer on boot, or it would revert the head editor's changes.
  Durability comes from the production database and its off-box backups. The research record comes from the committed
  file (§5.4).
- **A book entry needs real `concept_term` rows.** The editor's matcher builds one global Aho-Corasick automaton from
  every distinct English `concept_term` string (`loadEnglishEntries`, `server/lib/conceptMatcher.js`), and Icelandic
  inflections are keyed on `concept_term.id` (`concept_term.inflections`). An entry held only as text in a side
  table would never be matched (a new English string) and would get surface-only form checking.
- **The export's gates look only at `glossary-unified.json`** (`sameTerms`, shrink, growth, producer;
  `server/scripts/export-terminology.js`). c19's load removes about a hundred winners from about 1,750, far inside
  the shrink ratio; a larger change needs the existing one-time `--force`.

## 4. Approaches

| Approach | Trade-off | Decision |
|---|---|---|
| **Global edits** to `concept_term` (the model script `remove-wrong-sense-headwords.js`) | Simple; but changes every book that reaches the row, and an Íðorðabankinn re-import reverts it | Rejected |
| **A full copy** of chemistry's glossary as the book's source of truth | Total control; but chemistry stops receiving new Íðorðabankinn terms, house-style fixes and the fallback that supplies about 19,000 terms; a second source of truth | Rejected |
| **A book layer** over the shared model | Keeps everything that works and adds the one missing operation, "not in this book" | **Chosen** ([USER], 2026-11-19) |

Where the layer lives:

| Option | Trade-off | Decision |
|---|---|---|
| A committed file, changed by PR | Simplest and fully versioned; but every term change needs a developer | Rejected |
| **Database tables, edited by the head editor**, with the state committed by the existing cron | Self-service, takes effect at once; history in the database, versioned copy in git | **Chosen** ([USER], 2026-11-19) |

## 5. Design

### 5.1 Data model (one new migration, `058-book-glossary-layer.js`)

- **`book_glossary_exclusion`**: one row per exclusion.
  - Columns: `id`; `book_id`; `english` (as written); `match_key`; `concept_id` (`0` = the whole headword, else
    that concept only; a sentinel rather than NULL so a UNIQUE index dedupes it).
  - **`match_key` makes an exclusion match the way the editor matches.** A symbol-shaped headword
    (`isSymbolShaped`, `server/lib/conceptMatcher.js`: three characters or fewer, with a capital) keeps its exact
    case. Any other headword is folded with `nocaseKey`. So `SI` (the unit system) and `Si` (silicon) stay two
    keys, while `function` and a capitalised `Function` row are one. (c19 ruled both `SI` and `Si` whole-headword
    removals; stage 2 meets pairs such as `Co`/`CO` and `No`/`NO`.)
  - At-writing columns, for audit and drift checks: `idordabanki_id`, and the `icelandic` the row showed.
  - Provenance: `reason`, `source`, `created_by`, `created_at`.
  - `UNIQUE (book_id, match_key, concept_id)`.
- **`book_glossary_entry`**: one row per book-owned concept.
  - Columns: `concept_id` (primary key); `book_id`; provenance as above, plus `updated_by` and `updated_at`.
  - The concept itself is an ordinary `concept` row. Its `domain` is the book's first domain and its `collection` is
    `book-layer`, with `idordabanki_id` NULL, so `import-concepts.js` never touches it.
  - Its `concept_term` rows have `source = 'book-layer'`: one or more English forms (singular, plural, spelling
    variants, as §C234 requires) and one Icelandic term at rank 1.
- **`book_glossary_change`**: append-only history.
  - Columns: `id`; `book_id`; `at`; `by`; `action` (`exclude`, `unexclude`, `entry-add`, `entry-change`,
    `entry-remove`); `english`; `before_json`; `after_json`; `reason`; `source`.
  - Every write to the two tables above writes one row here in the same transaction.
  - It feeds the committed record (§5.4) and the stage-2 worklist (§5.6).

### 5.2 Resolver semantics

`buildScope(db, bookSlug, chapter)` loads three things for the book, once per scope:
- `scope.excludedHeadwords`: a Set of match keys;
- `scope.excludedConcepts`: a Map from match key to a Set of concept ids;
- `scope.bookOwned`: a Map from concept id to book id, covering **every** book's entries, so that other books'
  entries can be dropped.

A headword's match key is computed by one shared function (§5.1): exact case for a symbol-shaped headword, else
`nocaseKey`, the fold `book_term_preference` already uses, never `toLowerCase()`.

`resolve(scope, english)` / `resolveCandidates(...)` change as follows, in this order:
1. **Whole-headword exclusion.** If `english` is excluded, return the empty resolution: no winner, no `tied`, no
   `outOfScope`, no `alsoInScope`. Nothing takes over, out-of-scope suggestions included.
2. **Drop candidates** owned by another book, and candidates whose concept is excluded for this headword. They are
   dropped from the in-scope and the out-of-scope partitions alike.
3. **Book entry first.** If an in-scope candidate is owned by this book, it wins with reason `'book-entry'`. The
   other in-scope candidates go to `alsoInScope`. This sits above the position walk and above the house-style tie
   rule.
4. Otherwise the existing walk runs unchanged: position, then the nominal-tie and house-style rules, then
   `applyPreference`.

**A replacement hides the word it replaces.** A `replace` is stored as a book entry **plus a single-concept
exclusion of each concept it replaces** for that headword. Otherwise the replaced word would still be listed in the
editor's popup, and using it would be reported as a known `alternative` instead of a missing approved term. That
would contradict the worklist (§5.6), which asks editors to change that very word. c19's 16 `replace` rulings
load this way. A stage-2 "add" keeps the old word acceptable: an entry without the exclusion.

Integrity codes, reported like the `preference-*` codes:
- `book-exclusion-concept-missing`: a single-concept exclusion names a concept that no longer exists or no longer
  carries that English.
- `book-entry-conflict`: a **whole-headword** exclusion and a book entry claim the same headword. A single-concept
  exclusion beside an entry is the normal replacement shape, not a conflict. Writes refuse the conflict (§5.5,
  §5.6); the code reports it if it happens anyway.

A `book_term_preference` row for the same English as a book entry is refused at write time (§5.5, §5.6). If one
exists anyway, `applyPreference` still runs last, as today.

**Already true, measured 2026-11-19:**
- `findTermsInSegments` drops a hit that has nothing to offer (`if (isFallback && offerable.length === 0)
  continue`) **before** it assigns overlapping spans, so an excluded phrase consumes no span and the words inside it
  still match.
- `buildScope` is built fresh per call, so a layer write is seen by the next request.
- Adding a book entry adds a `concept_term` English row, which changes the automaton's fingerprint
  (`fingerprintEntries`) and rebuilds it.

### 5.3 Where a change takes effect

| Consumer | When |
|---|---|
| The segment editor's term prompts and its save-time check | The next request |
| `glossary-unified.json` (and with it the MT glossary arms, `buildGlossaryMap` math labels, `compute-glossary-subset`, the pre-screen tools) | The next export: the 2-hourly cron, or a manual run of `export-terminology.js` |
| Readers | Only after a chapter is re-rendered and synced, which stays manual and held (register) |

The export needs no resolution change beyond the record file: `buildResolvedGlossary` calls `resolve` for every
census string, so exclusions and entries flow through. Add one stats counter, `excludedByBook`, so a shrink caused
by the layer can be told apart from a lost term.

⚠️ **The export carries headwords of one or two words only.** Its census emits single words and adjacent pairs
(`server/lib/sourceEnglish.js`), and chemistry's committed export holds nothing longer. So a book entry of three or
more words (`standard cell potential`) reaches the **editor only**, never the export, the MT glossary arms or math
labels. House style already has this limit, and the glossary is off the MT wire ([USER], 2026-09-06). Accepted here,
not changed: widening the census is a separate decision with consequences for every number derived from it.

### 5.4 The committed record

`export-terminology.js` also writes `books/<book>/glossary/book-glossary.json` for every book that has a layer.
The cron's pathspec `books/*/glossary/` then commits it every 2 hours, with no new cron work.

- **Contents:** the current exclusions and book entries, each with its provenance, sorted deterministically, plus
  the book's **full, cumulative** change history. Not "the rows since the previous record": a manual export
  written between two cron runs would carry the rows, and the next cron run would then rewrite the file without
  them before anything committed it, so they would never reach git. A cumulative history is idempotent, and it
  grows by one row per change.
- **Write-if-changed:** written only when its content, excluding the generation timestamp, differs from the file on
  disk. It does not go through `sameTerms`, the shrink and growth guards or the producer gate, which stay about
  `glossary-unified.json`.
- **Licence note (my call):** for a single-concept exclusion of an Íðorðabankinn row, the record carries the English,
  the concept id and the `idordabanki_id`, **not** that row's Icelandic. The database keeps the Icelandic. The c19
  rows' pairs are already public in the committed verdicts, but a later head-editor exclusion could name any row.
  Book entries carry their Icelandic, which is the project's own decision.
- **G1.7:** the cut's manifest records this file's sha256 beside `glossary-unified.json`, a small change to
  `server/scripts/study-freeze.js`'s glossary record. That script exists only on G1.7's branch (draft PR #742), so
  stage 1 is rebased onto `main` after #742 merges and makes the change then. The script's dirty-input check
  already covers `glossary/`. The manifest is not cut yet (step 2), so no re-cut follows.

### 5.5 Stage 1: c19 into chemistry's layer

1. **The input, committed.** A one-off local step joins the private rulings snapshot
   (`~/c19-prescreen-2026-11-18/rulings-final-2026-11-18.json`, 212 docs, sha256 `de83082d…`) with the private
   census (`census-full-2026-11-18.json`, whose rows carry `conceptId`). It writes
   `experiments/terminology-consistency/results/2026-11-18/c19-book-layer-input.json`, one action per changing
   ruling:

   | Ruling | Action |
   |---|---|
   | `remove` + `SKILYRÐI:` (107) | exclude the whole headword |
   | `remove` + `AÐEINS` (7) | exclude that concept for the headword |
   | `remove` with no prefix: `ATP` (1) | exclude that concept (either reading gives the same result) |
   | `replace` (16) | a book entry (English = the row's English, Icelandic = `text`) plus a single-concept exclusion of the replaced row (§5.2) |
   | `phrases` (2) | exclude **that concept** for the bare headword, so the next row takes over, plus a book entry for the phrase (English = `text`, Icelandic = `phraseIcelandic` when given, else the row's Icelandic) unless an in-scope concept already carries that pair. ✏️ *Corrected 2026-11-19, before the build, from "exclude the bare headword as a whole": both rulings' comments say the bare word falls to the next row (r1104: `substitution` falls to* innsetning*, physics, right in 8 equation uses; r769: `gap` falls to* skarð*, biology). r1104's row Icelandic* skiptihvarf *is already the phrase's Icelandic.* |

   Plus one entry from §C234 ⑧: `standard cell potential` and `standard cell potentials` → `staðalíspenna`.
   - Each action carries the ruling id, kind, [USER]'s comment, the date, and the census row's `conceptId`, English,
     Icelandic and domain at writing.
   - It refuses unless exactly 212 rulings are read, every changing ruling maps to exactly one census row, and the 79
     keeps produce no action.
2. **The script.** `server/scripts/load-book-glossary.js --book efnafraedi-2e --input <file>` is dry-run by default,
   with `--apply` to write. It opens the DB via `resolveDbPath()`, read-only unless `--apply`, and checks everything
   before writing anything:
   - each `conceptId` still exists and carries the English;
   - its current head Icelandic equals the input's (drift refuses);
   - no house-style concept claims a headword being excluded (reported; [USER] decides);
   - no `book_term_preference` row exists for a book entry's English;
   - no exclusion and entry collide.

   It is idempotent: an action already present is reported as `already` and skipped. The dry run prints a per-action
   table and, for a sample of headwords, what chemistry resolves to before and after. That is computed in memory on
   the real DB by running the resolver over a scope with the pending layer applied, so the before/after is measured,
   not predicted.
3. **On production**, [USER] runs the dry run, then `--apply`, then `export-terminology.js`. A shrink refusal, if one
   appears, gets one `--force`. Then pull. **No migration re-asserts anything, so no boot step is needed**, but the
   tables must exist, so stage 1's code is deployed before the script runs.
4. **Verification by value, not count** (CLAUDE.md, the sentinel rule):
   - for every excluded headword, chemistry's export no longer carries it, and the physics book's resolution of the
     same headword is unchanged (the control);
   - for every book entry of one or two words, the export's `icelandic` equals the entry; for a longer entry, the
     editor's terms route offers it on a segment that holds it (§5.3);
   - for a whole-headword exclusion that had a fallback (`ifRemoved` in the census), the editor's terms route offers
     nothing for it.

### 5.6 Stage 2: the head editor's screen and the worklist

- **Page and API.** A page, `/book-glossary`, guarded by `requirePageAuth(ROLES.HEAD_EDITOR)`. An API under
  `/api/book-glossary/:book/...`, guarded by `requireAuth, requireHeadEditor('book')`, so a head editor can change
  only their own books; an admin can change any book.
- **Look up a headword.** It shows what the book resolves to now (winner, other in-scope answers, out-of-scope
  suggestions, any preference) and, from that view, the actions:
  - set the book's Icelandic (add or change a book entry, with its English forms);
  - exclude the headword;
  - exclude one row;
  - undo an exclusion or remove an entry.

  Every action asks for a reason and an optional source (for example "terminology committee, proposal of <date>").
  It refuses the conflicts §5.5 lists, writes the history row in the same transaction, and logs an activity-log
  event.
- **The list.** The book's current layer, with provenance and a link to each entry's history.
- **Inflections.** Matching uses `concept_term.inflections`, filled from the licensed BÍN file by
  `server/scripts/fetch-bin-inflections.js`, a manual script. That file is not in the repository; whether it is on
  production is unverified. The screen shows an entry whose Icelandic has no inflections as "surface form only", and
  inflections are filled by running that script, as for house style today. Computing them on save, if the file is on
  production, is the builder's call.
- **The worklist.** After an entry changes from an old Icelandic to a new one (or a new entry replaces what the
  shared model gave), the screen lists, by chapter, the segments where:
  - the English holds the headword (any of the entry's English forms), and
  - the text the editor is served holds any form of the old Icelandic, with its inflections when known, else the
    surface form.

  Each row links to the segment in the segment editor. The list is read-only and never edits text. It is recomputed
  on demand, with no stored state.
  - **The text it reads is the editor's effective text:** what `loadModuleForEditing` serves with each segment's
    newest live edit laid over it, as `buildEffectiveSegments` (`server/services/segmentEditorService.js`) already
    does for terminology consumers.
  - Not the served file alone: chemistry has no faithful files, and its writes to them are held
    (`server/lib/applyHold.js`), so editors' changes live only in `segment_edits`. A list read from
    `02-mt-output` would never shrink.

### 5.7 Order of work

Stage 1 should land before the G1.7 cut, so the manifest records the layer (the cut's landing conditions list c19
as optional; the record is the reason to wait). Stage 2 should land before editors start changing terms; with the
December pilot that is early December. Each stage is its own PR. Stage 1's PR also commits the c19 register work
already on this branch (§C234, §C235) and the probe test `server/__tests__/findTermsC19ApplyProbe.test.js`.

## 6. Left to the builder

- Test and file layout, and whether the layer loader lives in `conceptResolver.js` or a sibling module.
- The exact shape of `book-glossary.json` within §5.4.
- Whether the stage-2 page is a new HTML view or a tab, provided it does not grow `terminology.html`.
- Whether inflections are computed on save (§5.6).
- How the one-off input join (§5.5 step 1) is run: a committed script under `experiments/` or `server/scripts/`.

## 7. Calls made in this draft (for [USER] to check)

1. **A phrases ruling excludes only that row for the bare headword**, so the next row takes over, and adds the
   phrase as a book entry. ✏️ *Corrected 2026-11-19 before the build: this call first said "the bare headword as a
   whole", which contradicted both rulings' own comments (§5.5).*
2. **A book entry outranks everything** for its headword in its book: the domain walk, house style, and (by refusal
   at write time) a book preference.
3. **A replacement hides the word it replaces** (entry plus single-concept exclusion), so the editor's prompt and
   the worklist agree. A stage-2 "add" keeps the old word acceptable.
4. **An exclusion matches as the editor matches:** exact case for a symbol-shaped headword, case-insensitive
   otherwise.
5. **Entries of three or more words reach the editor only**, as house style already does; the export's census is
   not widened.
6. **The committed record carries the full cumulative history**, and omits the Icelandic of an excluded Íðorðabankinn
   row; the database keeps it.
7. **Stage 1 has no screen**: c19 is loaded by script, and the head editor's screen comes in stage 2.
8. **The worklist reads the editor's effective text** (served text plus live edits), because that is what an editor
   sees and changes.
9. **Stage 1 lands after #742**, so it can add the layer file to the G1.7 manifest's record.
10. **The editor's free-text lookup box stays out of scope**, logged in the register as its own item.

## ✏️ AMENDED 2026-11-21 — the committed record shows a role, not a name

[USER]'s ruling of 2026-11-21, in the G1.15(b) retention design §4.5 ([`2026-11-21-g115b-retention-dates-design.md`](2026-11-21-g115b-retention-dates-design.md)): `book-glossary.json` (§5.4) shows the deciding account's **role label** (`aðalritstjóri` for a head editor), never its display name, with times cut to the date. The record is committed to a public repository whose history cannot be stripped, and the editors' consent text promises that names are removed after 2028; the database keeps the account id until then. The c19 loader's label passes through as before. §5.4 is otherwise unchanged. Status lives in the register.
