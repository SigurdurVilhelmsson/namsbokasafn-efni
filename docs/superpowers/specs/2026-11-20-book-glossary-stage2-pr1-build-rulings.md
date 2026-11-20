# The book glossary layer, stage 2, PR 1 (the export hold): the build rulings

> 🧊 FROZEN 2026-11-20 — the rulings the build of stage 2's first pull request made on [USER]'s behalf (evidence, never status; the register owns status)

PR 1 of stage 2 was built task by task from the plan, with a review after each task. Where the plan or the
design left a choice open, or a review asked for a change, the build decided it and wrote the decision down.
The rulings below are copied as written, except that a reference to the build's own git-ignored working notes
is reworded, since those notes are deleted when the build ends. Each is evidence of what was decided; whether
the work it governs is done, open or deferred is the register's to say
([`2026-07-21-post-item17-followup-campaign.md`](../../plans/2026-07-21-post-item17-followup-campaign.md),
the 2026-11-20 stage 2 PR 1 entry and §C241).

- The design: [`2026-11-20-book-glossary-stage2-design.md`](2026-11-20-book-glossary-stage2-design.md).
- The plan: [`../plans/2026-11-20-book-glossary-stage2-pr1-export-hold.md`](../plans/2026-11-20-book-glossary-stage2-pr1-export-hold.md).

Labels used below: "Task N" is a task of the plan; "review item n" is a numbered item of that task's review.
R6b is a note to R6.

## Rulings

- Ruling R1: implementers and reviewers never run root `npm test`, `npm run lint` or `format:check`; they run the focused vitest files their task names (plus `npx eslint`/`npx prettier --check` on the files they touch). The controller runs the full floor once, at Task 6 Step 3. — memory agent-fanout-memory-budget: each root suite ≈310 MB, the box is capped at 10 GB and has crashed under fan-out — cost if wrong: a cross-file red surfaces only at Task 6, one fix round later.
- Ruling R2: Task 2's Step 2 includes the test `an adopted first export of a book with layer history is held` (from the task's Rules block). — the plan states the pin; the Step 2 list just omits it — cost if wrong: one extra test.
- Ruling R3: Task 2's new default-wiring case injects `subjectFn: () => 'chemistry'` and `recordFn: () => null`, leaves `layerChangeIdFn` defaulted, and seeds a committed glossary file. — only the layer reader is under test there; a defaulted subjectFn fails first on a missing DB — cost if wrong: none, the case still pins the default reader.
- Ruling R4: implementers stage files by explicit path, never `git add -A` / `git add .`. — `.claude/settings.json` is dirty and unrelated — cost if wrong: an unrelated file in a commit.
- Ruling R5: restamp rewrites the COMMITTED file with only bookLayer changed (not the new export + stamp). — spec §5.6 item 4 says "rewritten with the current stamp only"; terms are identical by construction and the commit diff is one line — cost if wrong: one line + one test to switch.
- Ruling R6: keep `stamp !== id` (the brief) over the spec's "missing or lower" — a stamp ahead of the DB (restored backup, another box) is held, a fail-safe superset of the spec — cost if wrong: a rare extra hold a developer releases.
- Ruling R6b: the terms hash lives in the status entry's own `termsSha256` field, not inside `detail` (spec §5.6 item 2 wording) — same information, machine-readable, and /api/health shows neither — cost if wrong: none.
- Ruling R7 (for Task 5): check-held-glossary.sh reads production's status entry and refuses (exit 2, "nothing held") unless the book's outcome is `refused-layer-change`; it computes the release hash from the copied held file and warns when it differs from the status entry's `termsSha256` (the status lags after a `--book` run). — a held file is never deleted when its hold resolves (review item 7), so the file's existence alone is not "held" — cost if wrong: one extra ssh read.
- Ruling R8 (plan-mandated finding, Task 2 review item 3; carried into Task 3): a committed file that HAS a stamp while `layerChangeIdFn` returns null is treated as layer-moved: changed terms are HELD (not written with the stamp silently dropped); unchanged terms read `unchanged` and keep the file. Pin it and the stamp-ahead case (review item 6) with tests. — the spec's anti-goal is an unreviewed change reaching main; a DB that lost its layer history would otherwise undo every exclusion through an ordinary write — cost if wrong: an unusual hold needing a release.
- Ruling R9: Task 3's edit to server/__tests__/glossaryExportRun.test.js (releaseLayer: null added to two exact parseArgs-shape pins) is accepted — it is the direct consequence of the brief's every-return-path rule — cost if wrong: none.
- Ruling R10: the worktree goes on disk outside the repo (default: a mktemp dir in the repo's PARENT directory; override HELD_GLOSSARY_WORKDIR), with a free-space refusal (exit 2) below 5 GB; only small files (status/held copies, vitest output) may use /tmp. Verified by a recorded end-to-end run against a fake ssh: green (committed chemistry export), red (pre-c19 export c6d4276d0, which #745 recorded turns real-data pins red), and the hash-mismatch warning. — design §5.7 leaves the linking/location to the builder; memory: /tmp is RAM tmpfs and the box crashes under memory pressure — cost if wrong: a slower checkout on disk.
- Ruling R11: Task 6 also (a) freezes rulings R1-R10 verbatim (local paths shortened) into docs/superpowers/specs/2026-11-20-book-glossary-stage2-pr1-build-rulings.md, banner-frozen, and (b) logs every deferred minor of the build's notes as a new register §C item (next free number) directly below the new RESUME entry; the controller runs Task 6 Step 3 (full floor) itself (R1). — a memory note on dangling citations: committed text must never cite the git-ignored build notes; CLAUDE.md § One source of truth: parked findings live in the register — cost if wrong: one extra docs file.

## The pre-flight scan

The scan read every pair of adjacent tasks, and each task alone, for a product one makes that the other consumes. Its result:

| Pair / task | Produces → consumes | Found |
|---|---|---|
| T1 ↔ T2 | T1 `createLayerChangeIdFn` → T2 default `layerChangeIdFn`; both edit `bookGlossaryRecord.test.js` (T1 a T4e case, T2 `runExport` gets `layerChangeIdFn: () => null`) | consistent |
| T1 ↔ T4 | T1 `'no-glossary-dir'` record status → T4 counts it a record error | consistent |
| T2 ↔ T3 | T2 `termsSha256`, the hold branch, the status entry → T3 release at that branch; both edit `export-terminology.js` and `glossaryExportLayerHold.test.js` | consistent; T3 touches `parseArgs`, T2 does not |
| T2 ↔ T4 | T2 outcome `refused-layer-change` → T4 remedy + stale-refusal test | consistent |
| T2 ↔ T5 | T2 `tools/lib/glossary-terms-hash.cjs` → T5 `--hash-only` | consistent |
| T3 ↔ T4 | T3 parseArgs → T4 readout test round-trips printed commands; T4's remedy prints no exporter command | consistent |
| T3 ↔ T5 | T3 `--book <slug> --release-layer <hash>` → T5 prints that command | consistent |
| T1 alone | tests vs code | consistent |
| T2 alone | the "adopted first export … is held" pin is in the Rules block but missing from Step 2's test list | ruling R2 |
| T2 alone | new default-wiring case: defaulted `subjectFn` needs a DB and would fail before the layer read | ruling R3 |
| T3 alone | tests vs rules | consistent |
| T4 alone | tests vs rules; edits an existing readout test (adds a book) | consistent |
| T5 alone | tests vs behaviour | consistent |
| T6 alone | Step 3 runs the full floor | ruling R1 |
| Template vs memory | implementer template says "run the full suite once before committing" | ruling R1 |

## Added before merge (final-review fix wave)

- Ruling R12: one fix wave covers I1, I2, I3, M1-M5, T2a, T5a, T5b, the stamped e2e check (M6/Rec 2) and the CLAUDE.md draft (Rec 5); the rest of §C241 stays as the reviewer triaged — small, same files, cheaper now than after PR 2 — cost if wrong: a larger fix diff to re-review.
- Ruling R13: I1 is fixed by reading the layer id BEFORE and AFTER the export and holding the book when they differ (no restamp, no write, no release that run), NOT by the reviewer's single read before the export — a single early read flips the race: a change during the build lands in the export while id equals the committed stamp, so it is written unheld in the same run; the history is append-only, so a before/after difference catches any change during the build — cost if wrong: a rare extra hold.
- Ruling R14: B3's injected layer reader returns the copied file's own committed stamp (bookLayer.lastChangeId, or null when the file has none), in both of its runExport calls — the test checks book outcomes under a shrinking stub, not the layer; modelling "layer current relative to the file" keeps that intent whether or not main's file is stamped, and leaves R8 (correct for production) untouched — cost if wrong: none to production; B3 would no longer catch a stamp-related outcome change (other tests own that).

The labels I1–I3, M1–M6, Rec 2 and Rec 5 in R12–R14, and Minor 1–4 and out-of-scope 1–3 below, are the final whole-branch review's and its re-review's; those reviews are not committed. What each label covered, and how it was resolved, is in the register: the stage-2 PR 1 entry's fix-wave paragraph and §C241 (F1–F5).

## Findings parked after the fix wave's re-review

- Final review: parked — Minor 1 (the I2 test has no root guard) — Ruling R15: real, deferred to §C241: CI never runs as root, and the repo's skipIf precedent can be applied with any later touch — cost if wrong: a red only for a root-run suite.
- Final review: parked — Minor 2 (§C241 T2e's reason went stale after I3) — Ruling R16: correct the T2e reason in §C241 now (register text, not code) — cost if wrong: none.
- Final review: parked — Minor 3 (R12-R14 cite labels only the uncommitted review defines) — Ruling R17: add a one-line key to the rulings file saying the labels are the final review's and that the register's fix-wave paragraph records each one's substance — cost if wrong: none.
- Final review: parked — Minor 4 (mktemp -d and the df assignment still exit 1) — Ruling R18: real, deferred to §C241: both fail before anything is created, so a caller sees a non-zero exit and nothing to clean — cost if wrong: one more ambiguous exit-1 case for a script caller.
- Final review: parked — out-of-scope 1 (another book's addEntry committing during this book's build can tear the export without moving this book's id; stage-1 code) — Ruling R19: log in §C241 with the trigger "before PR 2 deploys" (when head editors can write layers); not fixed here: it needs a second book with a layer whose first domain is in this book's chain, which no book has today, and the fix (build the export in one read transaction) is a resolver change outside PR 1 — cost if wrong: a torn chemistry export written unheld once, reverted by the next run.
- Final review: parked — out-of-scope 2 (premise-pin set chosen by a filename grep) and 3 (a vitest crash naming no file exits 1) — Ruling R20: log both in §C241 as pre-existing script limits — cost if wrong: a pin outside the grep is missed by the dev check (CI still runs it after merge).
