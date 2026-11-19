# The book glossary layer, stage 1: the build rulings

> 🧊 FROZEN 2026-11-19 — the rulings the book glossary layer's stage-1 build made on [USER]'s behalf (evidence, never status; the register owns status)

Stage 1 of the book glossary layer was built task by task from the plan, with a review after each task and a
final whole-branch review. Where the design or the plan left a choice open, or a review asked for a change, the
build decided it and wrote the decision down with its reason and the cost if it is wrong. These are those
decisions, copied faithfully; where a ruling's own line gave no reason, its **Why** is the finding it answers,
or says that none was stated. Each is evidence of what was decided and why; whether the work it governs is
done, open or deferred is the register's to say
([`2026-07-21-post-item17-followup-campaign.md`](../../plans/2026-07-21-post-item17-followup-campaign.md),
the 2026-11-19 c19 stage-1 entry and §C239).

- The design: [`2026-11-19-book-glossary-layer-design.md`](2026-11-19-book-glossary-layer-design.md)
  (approved by [USER] on 2026-11-19).
- The plan: [`../plans/2026-11-19-book-glossary-layer-stage1.md`](../plans/2026-11-19-book-glossary-layer-stage1.md).

Labels used below: "Task N" is a task of the plan. "Important n" and "Minor n" are the final whole-branch
review's findings, and "T*n*" items are the minors that review triaged from Task *n*'s review. Those reviews
are not committed; §C239 in the register lists the minors left unbuilt.

R1 to R19 were made during the build of Tasks 1 to 7; R20 to R22 settle the final review.

## R1 — what "a concept carries the English" means

**Ruling.** "A concept carries the English" (the check in `addExclusion` for a single-concept exclusion, and
the loader's drift check) means the concept has an `en` concept_term whose `matchKey` equals
`matchKey(english)`. The exclusion itself matches by match key.
**Why.** The plan used the phrase without defining it (found by the pre-flight scan of Task 2).
**Cost if wrong.** A stricter or looser refusal, visible in tests.

## R2 — a replacement that hides nothing is refused

**Ruling.** `addEntry` refuses (`LAYER_REFUSED`) a `replaces` concept that carries none of the entry's English
forms.
**Why.** A replacement that hides nothing is a data error. The plan did not say what a `replaces` concept with
no carried form should do (found by the pre-flight scan of Task 2).
**Cost if wrong.** One refusal to relax.

## R3 — the loader takes the books directory as a dependency

**Ruling.** `load-book-glossary.js`'s `main(argv, io, deps)` takes `deps.booksDir`, defaulting to the
repository's `books/` resolved with `__dirname`, so `--verify` is testable on a temporary tree.
**Why.** `--verify` reads the repository's `books/` through `__dirname`, but its test needs a temporary tree
(found by the pre-flight scan of Task 6).
**Cost if wrong.** None.

## R4 — which models built and reviewed

**Ruling.** Implementers: Sonnet for Tasks 1, 2, 4, 5, 6 and 7; Opus for Task 3, the resolver's hot path.
Task reviewers: Sonnet for Tasks 1, 5 and 7; Opus for Tasks 2, 3, 4 and 6. The final whole-branch review on
Fable, under [USER]'s standing permission to use it for review.
**Why.** The most capable model where the risk is: the resolver's hot path.
**Cost if wrong.** Spend.

## R5 — review verdicts and reports are written down as the work goes

**Ruling.** Every reviewer writes its verdict to a file before replying; implementers append to their report
file as they go.
**Why.** Not stated with the ruling. (The earlier builds' rulings give the same rule its reason: an agent can
stop mid-task, and its verdict must survive it.)
**Cost if wrong.** None.

## R6 — Task 1's second fix commit keeps its message

**Ruling.** Keep the message suffix of Task 1's second fix commit (`1a3de9b97`) as it is; no squash.
**Why.** Cosmetic.
**Cost if wrong.** None.

## R7 — `addEntry` is `already` only when its replacements are excluded

**Ruling.** `addEntry` returns `already` only when the entry exists (the same form keys and the same
Icelandic) AND every `replaces` concept is currently excluded for each entry form it carries. If the entry
exists but any such exclusion is missing, it REFUSES (`LAYER_REFUSED`, naming the missing concept and form) and
writes nothing. It never silently drops a replacement, and never silently re-hides a word a head editor
un-excluded.
**Why.** Task 2's review (Important): `addEntry` returned `already` ignoring `replaces`, so a requested
replacement was silently dropped.
**Cost if wrong.** A re-run needs an explicit exclusion step.

## R8 — Task 2's red test commit stays

**Ruling.** Keep the red-alone test commit (`a53a82f2e`); no rewrite of history mid-build.
**Why.** History is not rewritten mid-build.
**Cost if wrong.** One red intermediate commit for bisect.

## R9 — a failed migration 058 fails closed

**Ruling.** A failed migration 058 makes `buildScope` throw for every book: term prompts return 500 and are
silently empty in the client; the export fails the book and withholds its heartbeat; `/api/health`'s schema
check names the missing tables. Keep it fail-closed.
**Why.** A tolerant loader would silently drop chemistry's exclusions from the 2-hourly export.
**Cost if wrong.** Editors lose term prompts until the migration is fixed (visible in health).

## R10 — the stale bench constant goes to the register

**Ruling.** The out-of-scope stale corpus constant in `server/scripts/bench-c24.js` (70,187 concepts and
192,189 terms recorded against 70,248 and 192,315 measured) is logged in the register by Task 7 (§C238).
**Why.** An out-of-scope finding is logged in the register, never left in a report (`CLAUDE.md`).
**Cost if wrong.** None.

## R11 — `dangling` also lists merged concepts

**Ruling.** The record's `dangling` list (Task 4) also lists a single-concept exclusion whose concept has been
merged (`merged_into IS NOT NULL`), and lists entries whose concept is missing or merged.
**Why.** Raised by Task 3's review: `lookupCandidates` follows a merge to its survivor, so a merged key misses
silently.
**Cost if wrong.** A few extra lines in the record.

## R12 — the join's domain is the ruling's own group

**Ruling.** The join's domain is the ruling's own `group` (chemistry, physics or biology). The verdicts file's
`group` is only `chemistry` or `physicsBiology`, contrary to what Task 5's instructions assumed, so the tool
checks that the verdicts bucket agrees with the ruling's group and that the English agrees.
**Why.** The verdicts file cannot name physics or biology apart.
**Cost if wrong.** None (a refusal would fire on a mismatch).

## R13 — the census Icelandic comes from the census

**Ruling.** `icelandicAtCensus` comes from the verdicts and census pair, not from the ruling's own copy of the
Icelandic. It is the drift-check value. A replacement's new Icelandic comes from the ruling's `text` and is
unaffected.
**Why.** Ruling r072's own copy of the Icelandic misspells the census value by one letter. (The misspelt form
is in the private ruling text only and is not quoted here.)
**Cost if wrong.** None.

## R14 — a phrases ruling emits two actions under one ruling id

**Ruling.** A phrases ruling emits two actions with one `rulingId` (an `exclude-concept` and an `entry`), so
uniqueness is per (`rulingId`, `kind`). Task 6 must not assume unique ruling ids.
**Why.** The design's phrases call: exclude that concept for the bare headword, so the next row takes over,
and add the phrase entry.
**Cost if wrong.** A loader message lists both actions.

## R15 — `ifRemovedAtCensus` is dropped from the committed input

**Ruling.** Drop `ifRemovedAtCensus` from the join tool's output and regenerate the committed input. The
privacy of the full census wins over the plan's schema, which listed the field. Task 6's dry run measures
before and after on the real database and does not need it.
**Why.** Task 5's review confirmed that `ifRemovedAtCensus` (80 non-null `{text, domain}` next-ranked rows) is
census-alternative data, the reason the full census is private.
**Cost if wrong.** The field can be re-derived privately from the census.

## R16 — the first input commit never reaches the public remote

**Ruling.** MUST BE DONE BEFORE ANY PUSH. Task 5's first commit (`70a1d1b67`) held an input file that contained
`ifRemovedAtCensus`, and the branch was local only. Before pushing, rebuild Task 5's commits into one (with
`git commit-tree` on the fixed tree, the later commits replayed, or a squash of the commit and its fix), so
that version never reaches the public remote. Verify with
`git log -p origin/main..HEAD -- experiments/terminology-consistency/results/2026-11-18/c19-book-layer-input.json | grep -c '"ifRemovedAtCensus"'`,
which must print 0.
**Why.** Without it, the history of a public branch would carry census-alternative data (R15).
**Cost if wrong.** Census-alternative data published.
**Amended.** The verify search keys on `"ifRemovedAtCensus"` with its quotes, because two committed comments
use the word as prose.
**Done (2026-11-19).** The commits were rebuilt with `git commit-tree` and the ref moved with an old-value
guard: `70a1d1b67` and its fix `f7609ff70` became `7be00f18c` (the fix's tree, the first commit's message);
`6442aa750` became `29c462b81`; `57f1b1820` became `d07406e65`. The rebuilt head's tree equals `57f1b1820`'s,
and the search above prints 0 over the range. The four replaced commits were never pushed: they exist only in
the local reflog, so their hashes do not resolve on the remote.
**Amended (2026-11-19, R23).** A second rebuild, for [USER]'s decision on the input's comments, gave the
three commits named above new hashes: `943666c38` (the input), `2a6c05bbe` and `52d733dcb` (the loader). The
search above still prints 0 over the range.

## R17 — the dry run opens a WAL database through a patched in-memory image

**Ruling.** The dry run patches the in-memory image's header bytes 18 and 19 to 1 (rollback journal) before
`new Database(image)`. Measured by Task 6's reviewer: the copy sees the rows that exist only in the
uncheckpointed WAL, takes a write transaction, and the real file and its `-wal` stay byte-identical. This keeps
the plan's dry-run rule (its review focus 5: writes go only to an in-memory copy, and production's database
stays byte-identical). It is pinned by a WAL-fixture test seen red first.
**Why.** Task 6's review (Critical): the dry run's `new Database(db.serialize())` cannot open a WAL image
(`SQLITE_CANTOPEN`), and production's `sessions.db` has `journal_mode = wal` (measured read-only).
**Cost if wrong.** A dry-run crash (fails safe).

## R18 — `--verify` reads the input and checks it against the layer and the export

**Ruling.** `--verify` requires `--input` and checks the input against the layer AND the export:
- every `exclude-headword` key is a whole-headword exclusion in the layer and absent from the export;
- every `exclude-concept` is a single-concept exclusion row;
- every `entry` action is a layer entry with its Icelandic (and its replacement exclusions);
- the Icelandic of a one- or two-word entry equals the export's; a 3+-word entry is listed as editor only;
- any input action missing from the layer is a FAIL;
- the same table guard as the load.

A headword action's `icelandicAtCensus` stays unchecked: a whole-headword exclusion is ruled regardless of which
row wins. The design's §5.5 check that the editor's terms route offers nothing for a whole-headword exclusion
that had a fallback is covered by the resolver tests, not by `--verify`.
**Why.** Task 6's review (Important): `--verify` passed on an empty layer and never read `--input`.
**Cost if wrong.** One more verify check later.

## R19 — the physics control refuses when the physics book is not registered

**Ruling.** The dry run's physics control refuses, by name, when `edlisfraedi-2e` is not registered, instead
of printing `n/a`.
**Why.** A control that can vanish silently is not a control (`CLAUDE.md`).
**Cost if wrong.** None.

## R20 — no extra input actions for case siblings

**Ruling.** No extra input actions for the case siblings of the excluded headwords. Six are distinct symbols or
units that the exact-case rule is meant to keep apart (`Cd` cadmium and `cd`, `Au` and `AU`, `Fm` and `FM`,
`Ar` and `AR`; `SI` and `Si` are each excluded). `PG`/`pg` and `cal`/`Cal` are anatomy rows, out of
chemistry's scope, offered only as fallback suggestions. Logged as a parked minor (§C239).
**Why.** The final review's Important 3 asked for two read-only production queries before the apply, since the
dry run cannot show either. Their results (2026-11-19, production at `474647ffb`): chemistry has 9
`book_term_preference` rows, none on the 117 excluded headwords; and the case siblings above.
**Cost if wrong.** An anatomy fallback suggestion on "PG" or "Cal" until a head editor excludes it in stage 2.

## R21 — one fix wave for the final review

**Ruling.** One fix wave (Opus) for: Important 1 (freeze the rulings in this file and repoint the four code
comments that cite them); Important 2 (the zero-action and counts guard in `--verify` and in the load's checks);
Minor 1 (the checks inside one immediate transaction); Minor 2 (the physics column's `≠`); Minor 3 (stale
comments); Minor 4 (two register phrases, including §C234's "uncommitted" note on the probe test); Minor 7 (a
runbook line); T4a (a whole-file sentinel test of the record's licence rule); and Important 3's results plus
the review triage's register items, in a new register item §C239 (parked minors).
**Why.** The loader runs once on production, so a loader item parked in the register would in practice never
be done; the review's fix list was small.
**Cost if wrong.** A second small PR.
**Note.** The ruling named R1–R21 for this file; it holds R1–R22.

## R22 — two calls surfaced to [USER], not changed

**Ruling.** Two of the final review's points are surfaced to [USER] at the finish and not changed:
- Minor 5: a single-concept exclusion whose concept is missing is reported in `book-glossary.json`'s `dangling`
  list, not as a resolver integrity code (`book-exclusion-concept-missing`), which the design's §5.2 named.
- T5c, the committed input's comments: ten end with a phrase attributing the ruling to the assistant, and two
  rulings (r1104, r769) name the row that
  takes over, which becomes chemistry's exported winner after the load in any case.
**Why.** Both are [USER]'s calls: a deviation from the approved design, and public prose in the committed input.
**Cost if wrong.** A later edit.
**Decided ([USER], 2026-11-19).** `dangling` in `book-glossary.json` stays the home for a missing excluded
concept. The ruling comments stay as written, except that the phrase attributing a ruling to the assistant is
removed from the committed input (R23). The two rulings that name the row taking over stay as written.

## R23 — the attribution phrase is removed from the committed input, in every commit

**Ruling.** [USER] decided on 2026-11-19 that the committed input keeps the ruling comments as written, but
without the phrase attributing a ruling to the assistant. The join tool removes it when it writes a comment
(`publicComment`, `tools/ai-review/prescreen-book-layer-input.js`), so a re-run reproduces the file. A test pins
the committed file, and a fixture pins the tool. The regenerated file differs from the previous one in exactly
those ten comments; every other field, the counts and the three input hashes are unchanged. Because the branch
was not yet pushed, the eight commits from the input onwards were rebuilt with `git commit-tree`, substituting
the tool, its test, the input and this file's corrected line in each tree, and the ref was moved with an
old-value guard. No commit on the branch now carries the phrase in the input; it remains only as the pattern
the tool removes and in a synthetic test fixture.
**Why.** The input is public, and [USER] asked that the phrase not be published with the rulings.
**Cost if wrong.** None: the phrase carried no ruling content.
