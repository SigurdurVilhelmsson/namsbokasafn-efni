# G1.7 step 1: the build rulings

> 🧊 FROZEN 2026-11-19 — the rulings the G1.7 step-1 build made on [USER]'s behalf (evidence, never status; the register owns status)

The build of G1.7 step 1 was run task by task from the plan, with a review after each task and a final
whole-branch review. Where the design or the plan left a choice open, or a review asked for a change, the
build decided it and wrote the decision down with its reason and the cost if it is wrong. These are those
decisions, copied faithfully; where a ruling's own line gave no reason, its **Why** is the finding it
answers. Each is evidence of what was decided and why; whether the work it governs is
done, open or deferred is the register's to say
([`2026-07-21-post-item17-followup-campaign.md`](../../plans/2026-07-21-post-item17-followup-campaign.md),
the G1.7 entry and §C236).

- The design: [`2026-11-19-g17-freeze-and-mt-lock-design.md`](2026-11-19-g17-freeze-and-mt-lock-design.md)
  (approved and frozen).
- The plan: [`../plans/2026-11-19-g17-study-freeze-step1.md`](../plans/2026-11-19-g17-study-freeze-step1.md).

Labels used below: "Task N" is a task of the plan. I1–I3 (Important) and M1–M8 (Minor) are the final
whole-branch review's findings, and "T*n*(*k*)" is item *k* of the minors that review parked from Task *n*'s
review. Those reviews are not committed; §C236 in the register lists the minors left unbuilt.

R1 to R11 were made during the build of Tasks 1 to 6; R12 to R24 settle the final review's fix wave.

## R1 — a test for refusing a `--supersedes` that names no current manifest

**Ruling.** Task 4 adds one test: `manifest --write --supersedes <tag>` naming a tag with no current manifest
is refused and writes nothing.
**Why.** The plan's Interface promises the refusal and no task tests it.
**Cost if wrong.** One extra small test.

## R2 — the manifest guard asserts in both states

**Ruling.** Task 6's manifest guard asserts in both states: with no current manifest it asserts that no
`books/<book>/freeze/*/freeze.json` exists (so a manifest that `currentManifest` fails to find cannot pass
silently); with one it asserts `compareToManifest(...).pass === true`.
**Why.** It removes a vacuous test (`if (cur) expect(...)` asserts nothing while no manifest exists) that a
review would flag; the intent is the same as the design's.
**Cost if wrong.** None beyond a few lines.

## R3 — which models built and reviewed

**Ruling.** Implementers: Sonnet for Tasks 1, 2, 3, 5 and 7; Opus for Tasks 4 and 6 (the route-driven join
test; the judgement of recalibrating the full test floor). Task reviewers: Sonnet for Tasks 1, 2, 3 and 7;
Opus for Tasks 4, 5 and 6. The final whole-branch review on Fable, under [USER]'s standing permission to use
it for review.
**Why.** A mid-tier floor, and the most capable model where the risk is.
**Cost if wrong.** Spend.

## R4 — review verdicts are written down; fix rounds go to a fresh implementer

**Ruling.** Every reviewer writes its verdict to a file before replying, and the coordinating session checks
that the file exists before it stops the reviewer. Fix rounds go to a fresh implementer.
**Why.** A reviewer or implementer agent can die mid-task, and its verdict must survive it.
**Cost if wrong.** None.

## R5 — layer 1s lists every file under `02-mt-selected/` (amended by R16)

**Ruling.** The layer-1s record lists every file under `02-mt-selected/` as `{path, sha256, entries}`, with
`entries` the length of `entries` for a `*-selected.json` and `null` for other files (the re-request `.jsonl`
logs).
**Why.** The design says "each 02-mt-selected file"; listing them all is complete at no cost.
**Cost if wrong.** A few extra lines in `freeze.json`.
**Amended.** R16 narrows this to the files git tracks.

## R6 — the join test's mutation is NFD normalisation

**Ruling.** The T3 mutation (the join test's "break it" check) is NFD normalisation, not `.trim()`.
**Why.** The parser already trims, so a trim mutant is invisible; NFD failed 4 of 5 T3 tests. A mutant that
cannot fail proves nothing.
**Cost if wrong.** None.

## R7 — hand repairs are commits whose subject says so

**Ruling.** `handRepairs` keeps only commits whose subject holds "HAND REPAIR".
**Why.** That is the design's §6.4 wording; a bare `--grep` also matched a commit body saying "NO HAND REPAIR
WAS NEEDED". The design beats the plan.
**Cost if wrong.** One list entry.

## R8 — the implementer's extra refusal, and two recorded fields, accepted

**Ruling.** Accept the implementer's extra refusal: `manifest --write` is refused while a current manifest
exists unless `--supersedes` names it. Accept `layer1s.servedSegments` counted by comparing the served
Icelandic with the layer-1s entry text, and `units[].marker` recording the actual state (always "freeze" at
write, by precondition). The task's reviewer was to check this.
**Why.** Without the refusal, two current manifests make `currentManifest` ambiguous and `check` breaks; the
design's §6.6 intends one current manifest. The design asks "whether any manifest segment was served from
it", which the text comparison answers.
**Cost if wrong.** Small rework.

## R9 — one script file

**Ruling.** Keep one script file (649 lines before `check`). Revisit only if the final review flags it.
**Why.** The design chose one script, and `server/scripts/` already holds a probe of about 1,400 lines.
**Cost if wrong.** A later split.

## R10 — a unit served from a faithful file is never segment-compared

**Ruling.** A unit served from a faithful file is never segment-compared, whether it moved there after the cut
or was faithful at the cut. Its English and MT file hashes are still compared. (Raised by the Task 5 review.)
**Why.** The faithful layer is the editors' layer and changes by design during the study (apply after the
hold lifts). The design's §3 measured 0 faithful files, and the hold blocks new ones before the cut.
**Cost if wrong.** A faithful-at-cut unit's served text goes unchecked (theoretical today).

## R11 — commit the markers before the full test floor

**Ruling.** In Task 6, commit the guard and the markers (plan Step 7) before running the full floor (Step 6),
so that E2E and the suite see tracked markers as CI will; recalibrations then go in their own commits.
**Why.** The E2E global setup treats untracked real-book markers differently (it warns).
**Cost if wrong.** None.

## R12 — the merge-to-deploy window is covered in the register's NEXT (I1)

**Ruling.** I1 is fixed in the register's NEXT, not in the design (which is frozen; the register owns
procedure): deploy directly after the merge, and immediately before `deploy.sh` repeat the read-only read
(`find` for `*-segments.locked`, plus `git status --porcelain` and `git log origin/main..HEAD` for that
glob). A hit is a stop for [USER].
**Why.** A first save in a chemistry unit between the read and the deploy writes a timed marker on production,
which can wedge the deploy's rebase on a file that holds a person's time.
**Cost if wrong.** One sentence.

## R13 — the extraction warning says "may have changed" and names the test (I2)

**Ruling.** `cnxml-extract`'s freeze wording says the unit was re-extracted and may have changed, and names
the test (`git status --porcelain books/<book>/02-for-mt` empty means nothing changed and nothing is to be
done; otherwise restore the previous extraction). No byte comparison is added: wording only, behaviour
unchanged.
**Why.** The warning had asserted a change it had not measured, on exactly the fresh extraction step 2 runs to
prove nothing changed.
**Cost if wrong.** An operator runs one git command.

## R14 — `check` cannot pass on nothing, and prints what it compared (I3, T5(4)(8)(9), T6(4))

**Ruling.** `check` FAILs when the book has zero study units, and on a study unit with no MT output (as
`markers` refuses it). `compareToManifest` returns the units compared, the segments compared and the units
skipped (served from faithful, R10), printed on PASS and on FAIL. An ambiguous or unreadable manifest FAIL
still prints the marker summary. The guard's spawn test asserts N > 0.
**Why.** `check` is the proof run on production after each deploy, and "a check that cannot fail" is the risk
the design names.
**Cost if wrong.** A check that is stricter than needed.

## R15 — a corrupt input is a named refusal or a named FAIL (T4(5)(6), T5(10))

**Ruling.** A corrupt revision record, glossary or `freeze.json` gives a named refusal (`manifest`) or a named
FAIL (`check`) naming the path, never a stack trace and never the file's content. With `--tag` the refusal
list still prints.
**Why.** The cut's failure should be one an operator can act on.
**Cost if wrong.** None.

## R16 — layer 1s records only the files git tracks (amends R5)

**Ruling.** `layer1s.files` records only the files git tracks under `02-mt-selected/`.
**Why.** A gitignored file (for example a `*.bak` backup) is invisible to the dirty-input precondition, so
recording it makes the manifest depend on local junk.
**Cost if wrong.** An untracked-and-ignored file the study needed goes unrecorded (it could not be reproduced
from git anyway).

## R17 — the manifest is written atomically (T4(10))

**Ruling.** The manifest is written to a temporary directory and renamed into place; a failed cut leaves no
`freeze/<tag>/` directory.
**Why.** A partial write left a directory that blocked the re-run as `manifest-exists`.
**Cost if wrong.** None.

## R18 — the freeze marker is created exclusively (Task 1's parked minor)

**Ruling.** `writeFreezeLock` creates the marker with flag `'wx'`; on `EEXIST` it re-reads the state (freeze
→ `'already'`, otherwise `FOREIGN_LOCK`).
**Why.** A check-then-write could overwrite a foreign marker written in between, which is the anti-goal the
freeze marker exists for.
**Cost if wrong.** None.

## R19 — operator output says "the project lead's decision" (M2)

**Ruling.** Operator-facing CLI output says "the project lead's decision"; the docs keep the repository's
[USER] convention.
**Why.** [USER] is the docs' placeholder, and the operator reading the output is that person.
**Cost if wrong.** Wording.

## R20 — the script's header says truthfully where a piped run works (M5)

**Ruling.** The implementer runs a piped `check` once from `server/scripts/` and once from the repository root,
and the header states truthfully where a piped run works.
**Why.** The header said "never piped" while the script enables a stdin run.
**Cost if wrong.** A header line.

## R21 — no CLAUDE.md line in the fix wave (M8)

**Ruling.** M8 (a CLAUDE.md line "never clear a freeze marker") is not done in the fix wave: CLAUDE.md is the
project's instructions and [USER]'s to approve; it is surfaced to [USER] at the finish.
**Why.** An edit to project instructions needs [USER]'s approval.
**Cost if wrong.** The rule lives only in the design and the tools' wording until [USER] decides.

## R22 — the register entry drops its push-state wording (M7)

**Ruling.** The register entry drops its push-state wording now; the PR link is added in a docs commit when
the PR opens. The dated run counts stay, labelled as one run, with the PR's checks named as the live gate.
**Why.** "Not pushed" and "no PR yet" become false on `main` the moment it merges.
**Cost if wrong.** Wording.

## R23 — parked minors go to the register; these rulings are frozen here

**Ruling.** The minors the final review triaged to the register go to a new §C234 under the G1.7 register
entry (open work belongs in the register, as PR4's went to §C212). Rulings R1–R23 are frozen in this file, and
the committed comments and test names citing R1, R2 and R5 point to it.
**Why.** Open work belongs in the register, as PR4's minors went to §C212.
**Cost if wrong.** §C234 may collide with a parallel branch's number (renumber at merge, keeping every entry).
**Amended.** R24 makes the item §C236.

## R24 — the parked-minors item is §C236 (amends R23)

**Ruling.** The parked-minors item is §C236, not §C234.
**Why.** The local, unpushed branch `docs/register-c234-raftrod-compounds` (`e204e4dfb`, 2026-11-18) already
claims §C234 and §C235. No item number goes in a code comment, so a renumber at merge touches docs only.
**Cost if wrong.** A renumber.
