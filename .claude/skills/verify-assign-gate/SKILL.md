---
name: verify-assign-gate
description: Model-check G1.13's assign gate and the study-unit opening with TLC (server/verification/assign-gate/). Use when a change touches who can hold a chemistry chapter assignment, the assign gate, consent or licence records, user roles, the suggestion-view switch, or when a study unit opens — before you trust the change.
---

# Verify the assign gate (G1.13)

## What this protects, in plain words

In the study book (`efnafraedi-2e`), a study unit **opens** — its research record starts — at the first serve of
the module to a user who holds an assignment row for that chapter. `moduleOpenings.openingPredicate` reads only the
row: not consent, not role, not the licence, not the switch. So everything the study promises about openings rests on
**which sequences of actions can leave a row behind**. Tests check each refusal one at a time; this model checks every
order of every action, from production's starting state.

The rules the code keeps (the model proves them for every reachable state within the bounds below):

| Rule (TLA+ name) | In plain words | Harm if broken |
|---|---|---|
| `ConsentBeforeOpening` | No unit opens for an editor with no consent decision recorded. | Breaks the study's consent basis (spec §4, first anti-goal). |
| `OpenedOnlyAfterFirstSwitchOn` | No unit opens before the suggestion view was first switched on. | That unit loses its suggestions for good (ruling R6). |
| `NoChapterZero` | No assignment row for chapter 0; its unit never opens. | A row for a unit nobody can open or edit (spec §6.6). |
| `RowsCreatedOnlyForEditors` | When a row is created, its holder is a plain editor. | Admins and head editors would open units on a first look. |
| `RowsCreatedWithLicence` | When a row is created, its holder has a recorded licence clause. | Edits with no proof of their CC BY release. |

Two **known findings** — the code does not keep these, by the spec's choice to gate only the *creation* of a row.
`check.sh` pins each as expected to fail, and `replay-findings.js` reproduces each against the real code:

| Finding (TLA+ name) | The shortest path TLC finds, in the code's words |
|---|---|
| `OnlyEditorsHoldRows`, `OnlyEditorsOpen` | the editor records a consent decision → an admin records their licence → the editor is assigned the chapter → **an admin makes them head editor (or admin)** → they open the module, and the unit opens. Runbook line: spec AMENDED item 7a. |
| `EveryRowHolderHasLicence`, `OpenerHadLicence` | consent → licence → assigned → **an admin removes the licence row (recorded in error)** → the editor keeps the chapter, opens the module, and can save edits with no licence record. No runbook line covers this yet. |

## Does your change touch the verified code?

Run this; any output means yes. It compares the sync commit (in the coverage record below) with your **working tree**,
so uncommitted edits count — do not add `HEAD`, which would hide them:

```sh
git diff --stat 8a3540e15 -- server/services/assignmentGate.js server/services/userService.js \
  server/services/moduleOpenings.js server/services/licenceClauses.js server/services/researchConsent.js \
  server/services/suggestionSwitch.js server/lib/bookSwitches.js server/lib/researchScope.js \
  server/lib/editorScope.js server/middleware/validateParams.js server/routes/admin.js server/routes/research.js \
  server/migrations
```

Also yes, whatever the diff says, if your change adds **any new way to insert a `user_chapter_assignments` row**, to
delete a `research_consent` row, to change a user's role, or to open a unit — the model only knows the paths in its
coverage table.

## Run the check

Needs Java (any recent JDK) and TLC v1.7.4. If `~/.cache/tla/v1.7.4/tla2tools.jar` is missing, ask the user to run
(the session's safety check refuses an agent downloading and running a jar):

```sh
mkdir -p ~/.cache/tla/v1.7.4 && curl -fsSL -o ~/.cache/tla/v1.7.4/tla2tools.jar https://github.com/tlaplus/tlaplus/releases/download/v1.7.4/tla2tools.jar && sha256sum ~/.cache/tla/v1.7.4/tla2tools.jar
```

Then, from the repo root (about 40 seconds):

```sh
server/verification/assign-gate/check.sh
node server/verification/assign-gate/replay-findings.js
```

`check.sh` refuses any jar whose SHA-256 is not `936a262061c914694dfd669a543be24573c45d5aa0ff20a8b96b23d01e050e88`.
A clean run ends `OK: rules hold, known findings pinned, every gate check guarded` and exits 0; the replay ends with
both findings `REPRODUCED` and exits 0. Read every result with the `/statechart` skill if it is installed (it is
user-invoked: ask the user to run it on `AssignGate.tla`); it gives each broken rule as its shortest path in plain
words and draws how the system moves between states. Without it, `check.sh` prints the shortest path itself, one
action per line.

## Reading a failure: real bug or modelling error?

- **`FAIL rules: rule broken: X`** — TLC found an order of actions that breaks rule X. Map each action in the printed
  path to its code with the coverage table, then replay it against the real code (copy one `replay(...)` call in
  `replay-findings.js` and change its middle step). If the code reproduces it, **it is a bug: report it with the path
  in the code's words; do not edit the model or weaken the rule to make it pass.** If the code does not reproduce it,
  the model is wrong: find the action whose guard or effect differs from its function, fix that, and say so.
- **`CHANGED: known finding X no longer fails`** — the gap closed (good, if your change meant to close it) or the
  model drifted. If the code now refuses that path, move X from the findings list in `check.sh` to the rules in
  `AssignGate.cfg`, update the findings table above and `replay-findings.js`, and tell the user. Otherwise find the
  drift.
- **`MUTANT without 'R' NOT caught by …`** — a gate check is no longer guarded by any rule: either a rule was
  weakened or a line lost its `\* gate: R` marker. Restore it; never delete the mutant.
- **TLC itself errors** (parse or semantic error in its output) — the model text is broken; nothing it says counts.

## When your change is intended: update the model

1. Find the changed function in the coverage table; edit the matching action in
   `server/verification/assign-gate/AssignGate.tla` so its guard and effect say what the code now does. Keep one action
   per indivisible step (one transaction or one synchronous handler).
2. A **new gate reason** in `assignmentGate.assignmentRefusal`: add one conjunct to `GateAllows` ending
   `\* gate: <reason>`, a rule that only that conjunct protects, and a `<reason>:<Rule>` pair to the mutant loop in
   `check.sh`.
3. A **new path that writes a row, a role, consent, a licence or the switch**: add an action to `Next` and a row to the
   coverage table.
4. Run `check.sh` and `replay-findings.js`. Then move the sync commit (below and in the `git diff` command above)
   forward to the new HEAD — **only after you have confirmed, function by function, that the model describes the code
   at that commit.**

## Scope: what a pass covers, and what it does not

- **Bounds:** two users, chapters `{0, 1}`, one module per chapter, starting from production's state on 2026-11-22
  (no chemistry assignment row, opening, consent or licence row; any roles; the switch on or off). Within those bounds
  TLC explores every reachable state; it says nothing beyond them, though no rule compares more than one user or
  chapter at a time.
- **Left out:** the closed-book reason (the route census and `editorScopeRoutes.test.js` cover it); HTTP, auth and
  which role may call which route (an admin is assumed able to call every admin route); deactivated and deleted users
  (the predicate ignores `is_active`; deleting a user cascades their rows); the consent text's approval; the 2028
  retention step (deletes assignment rows) and the 2030 step (deletes every `research_consent` row, after which the
  gate refuses every new study-book assignment); another process changing a row between `openingPredicate` and
  `recordOpening` (only the retention cron could).

## Coverage record

**Sync commit: `8a3540e15`** — the model was last confirmed to describe the code at this commit.

| Model action / rule | Code (open it to check) |
|---|---|
| `GateAllows` (one line per refusal reason) | `server/services/assignmentGate.js` `assignmentRefusal` |
| `AssignReplacing` | `server/services/userService.js` `setChapterAssignee` (gate + delete + insert, one transaction); routes `POST /api/admin/assignments/:book/:chapter`, `POST /api/admin/users/:id/chapters` in `server/routes/admin.js` |
| `AssignAdding` | `server/services/userService.js` `assignChapter` |
| `RemoveRow`, `ClearChapter` | `server/services/userService.js` `removeChapterAssignment`, `clearChapterAssignees` |
| `SetRole` | `server/services/userService.js` `updateUser`, `assignBookAccess`, `removeBookAccess`; routes `PUT /api/admin/users/:id`, `POST`/`DELETE /api/admin/users/:id/books` |
| `RecordDecision`, `Withdraw` | `server/services/researchConsent.js` `recordDecision`, `withdraw`; routes in `server/routes/research.js` |
| `RecordLicence`, `RemoveLicence` | `server/services/licenceClauses.js` `recordClause`, `removeClause`; routes `POST`/`DELETE /api/admin/users/:id/licence-clause` |
| `SwitchView`, `viewOn`, `everOn` | `server/services/suggestionSwitch.js` `setSuggestionView`; `server/lib/bookSwitches.js` `currentSwitchValue`, `firstSwitchOnMs` |
| `Serve` | `server/services/moduleOpenings.js` `openingPredicate`, `recordOpening`, `openOnServe`; chapter 0 refused by `server/middleware/validateParams.js` `validateBookChapter` |
| the study book | `server/lib/researchScope.js` `STUDY_BOOKS`; `server/lib/editorScope.js` `EDITOR_WRITABLE_BOOKS` |
| `Init` | production read 2026-11-22 (spec AMENDED item 6) |

Files: `server/verification/assign-gate/AssignGate.tla` (the model), `AssignGate.cfg` (the rules), `check.sh` (the
one command), `replay-findings.js` (the findings against the real code).
