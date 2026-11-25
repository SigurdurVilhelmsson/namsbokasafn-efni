---
name: verify-assign-gate
description: Model-check G1.13's assign gate and the study-unit opening with TLC (server/verification/assign-gate/). Use when a change touches who can hold a chemistry chapter assignment, the assign gate, consent or licence records, user roles, the served-layer setting, or when a study unit opens — before you trust the change.
---

# Verify the assign gate (G1.13)

## What this protects, in plain words

In the study book (`efnafraedi-2e`), a study unit **opens** — its research record starts — at the first serve of
the module to a user who holds an assignment row for that chapter. `moduleOpenings.openingPredicate` reads only the
row: not consent, not role, not the licence, not the served layer. So everything the study promises about openings rests on
**which sequences of actions can leave a row behind**. Tests check each refusal one at a time; this model checks every
order of every action, from production's starting state.

The rules the code keeps (the model proves them for every reachable state within the bounds below):

| Rule (TLA+ name) | In plain words | Harm if broken |
|---|---|---|
| `ConsentBeforeOpening` | No unit opens for an editor with no consent decision recorded. | Breaks the study's consent basis (spec §4, first anti-goal). |
| `OpensOnlyWhenFableServed` | No unit opens unless the book is served from the Fable layer. | A unit would open on text the study does not compare (the 2026-11-24 decision, which superseded R6). |
| `NoChapterZero` | No assignment row for chapter 0; its unit never opens. | A row for a unit nobody can open or edit (spec §6.6). |
| `RowsCreatedOnlyForEditors` | When a row is created, its holder is a plain editor. | Admins and head editors would open units on a first look. |
| `RowsCreatedWithLicence` | When a row is created, its holder has a recorded licence clause. | Edits with no proof of their CC BY release. |
| `EveryRowHolderHasLicence`, `OpenerHadLicence` | Every row holder, and every opener, has a recorded licence clause at every moment. | An editor keeps a chapter and saves edits after their licence record was removed. |

The last row was a known finding until 2026-11-22: removing a licence row (recorded in error) after the assignment left
the editor assigned. [USER] closed it in code — `licenceClauses.removeClause` and its route refuse (409
`HOLDS_CHAPTERS`) while the user holds a chapter in a book open to editors (spec AMENDED item 8) — and it became a
rule. `replay-findings.js` checks the refusal against the real code.

One **known finding** remains — the code does not keep it, by the spec's choice to gate only the *creation* of a row.
`check.sh` pins it as expected to fail, and `replay-findings.js` reproduces it against the real code:

| Finding (TLA+ name) | The shortest path TLC finds, in the code's words |
|---|---|
| `OnlyEditorsHoldRows`, `OnlyEditorsOpen` | the editor records a consent decision → an admin records their licence → the editor is assigned the chapter → **an admin makes them head editor (or admin)** → they open the module, and the unit opens. Runbook line: spec AMENDED item 7a. |

## Does your change touch the verified code?

Run this; any output means yes. It compares the sync commit (in the coverage record below) with your **working tree**,
so uncommitted edits count — do not add `HEAD`, which would hide them:

```sh
git diff --stat 22c5f0c01 -- server/services/assignmentGate.js server/services/userService.js \
  server/services/moduleOpenings.js server/services/licenceClauses.js server/services/researchConsent.js \
  server/lib/servedLayer.js server/lib/researchScope.js \
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
A clean run ends `OK: rules hold, known findings pinned, every guard covered by a rule` and exits 0; the replay prints
the role-change finding `REPRODUCED` and the licence removal `REFUSED (closed)`, and exits 0. Read every result with the `/statechart` skill if it is installed (it is
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
  `AssignGate.cfg`, give the new guard a marker and a mutant, update the tables above and `replay-findings.js`, and
  tell the user (the licence-removal finding went this way on 2026-11-22). Otherwise find the drift.
- **`MUTANT without 'R' NOT caught by …`** — a guard is no longer protected by any rule: either a rule was weakened or
  a line lost its marker (`\* gate: R` in `GateAllows`, `\* removal: R` in `RemoveLicence`). Restore it; never delete
  the mutant.
- **`replay-findings.js` prints `NOT refused: the gap is open again`** — the licence removal no longer refuses while
  the editor holds a chapter. That is a regression in the code; report it.
- **TLC itself errors** (parse or semantic error in its output) — the model text is broken; nothing it says counts.

## When your change is intended: update the model

1. Find the changed function in the coverage table; edit the matching action in
   `server/verification/assign-gate/AssignGate.tla` so its guard and effect say what the code now does. Keep one action
   per indivisible step (one transaction or one synchronous handler).
2. A **new gate reason** in `assignmentGate.assignmentRefusal`, or a **new refusal** on another action: add one
   conjunct ending `\* gate: <reason>` (in `GateAllows`) or `\* <action>: <reason>` (in that action), a rule that
   breaks when that conjunct is removed (it may share the rule with another guard: both licence guards are caught by
   `EveryRowHolderHasLicence`), and a `"<marker>|<Rule>"` pair to the mutant loop in `check.sh`. Check that the new
   mutant is reported on the rule you named.
3. A **new path that writes a row, a role, consent, a licence or the switch**: add an action to `Next` and a row to the
   coverage table.
4. Run `check.sh` and `replay-findings.js`. Then move the sync commit (below and in the `git diff` command above)
   forward to the new HEAD — **only after you have confirmed, function by function, that the model describes the code
   at that commit.**

## Scope: what a pass covers, and what it does not

- **Bounds:** two users, chapters `{0, 1}`, one module per chapter, starting from production's state on 2026-11-22
  (no chemistry assignment row, opening, consent or licence row; any roles; the layer fixed per run). Within those bounds
  TLC explores every reachable state; it says nothing beyond them, though no rule compares more than one user or
  chapter at a time.
- **Left out:** the closed-book reason (the route census and `editorScopeRoutes.test.js` cover it); HTTP, auth and
  which role may call which route (an admin is assumed able to call every admin route); deactivated and deleted users
  (the predicate ignores `is_active`; deleting a user cascades their rows); the consent text's approval; the 2028
  retention step (deletes assignment rows) and the 2030 step (deletes every `research_consent` row, after which the
  gate refuses every new study-book assignment); another process changing a row between `openingPredicate` and
  `recordOpening` (only the retention cron could).

## Coverage record

**Sync commit: `22c5f0c01`** — the model was last confirmed to describe the code at this commit (moved from
`8a3540e15` after the licence-removal refusal: only `licenceClauses.js` and the licence route in `admin.js` changed
between the two, and `RemoveLicence` now says what they do).

| Model action / rule | Code (open it to check) |
|---|---|
| `GateAllows` (one line per refusal reason) | `server/services/assignmentGate.js` `assignmentRefusal` |
| `AssignReplacing` | `server/services/userService.js` `setChapterAssignee` (gate + delete + insert, one transaction); routes `POST /api/admin/assignments/:book/:chapter`, `POST /api/admin/users/:id/chapters` in `server/routes/admin.js` |
| `AssignAdding` | `server/services/userService.js` `assignChapter` |
| `RemoveRow`, `ClearChapter` | `server/services/userService.js` `removeChapterAssignment`, `clearChapterAssignees` |
| `SetRole` | `server/services/userService.js` `updateUser`, `assignBookAccess`, `removeBookAccess`; routes `PUT /api/admin/users/:id`, `POST`/`DELETE /api/admin/users/:id/books` |
| `RecordDecision`, `Withdraw` | `server/services/researchConsent.js` `recordDecision`, `withdraw`; routes in `server/routes/research.js` |
| `RecordLicence`, `RemoveLicence` | `server/services/licenceClauses.js` `recordClause`, `removeClause` (refuses `HOLDS_CHAPTERS` via `holdsOpenBookChapter`, in its transaction); routes `POST`/`DELETE /api/admin/users/:id/licence-clause` (the DELETE checks `holdsOpenBookChapter` before its log entry) |
| `Layer` (a constant; no action) | `server/lib/servedLayer.js` `servedLayerFor`, read by `assignmentRefusal`; `check.sh` also runs the model with `"mt-output"` |
| `Serve` | `server/services/moduleOpenings.js` `openingPredicate`, `recordOpening`, `openOnServe`; chapter 0 refused by `server/middleware/validateParams.js` `validateBookChapter` |
| the study book | `server/lib/researchScope.js` `STUDY_BOOKS`; `server/lib/editorScope.js` `EDITOR_WRITABLE_BOOKS` |
| `Init` | production read 2026-11-22 (spec AMENDED item 6) |

Files: `server/verification/assign-gate/AssignGate.tla` (the model), `AssignGate.cfg` (the rules), `check.sh` (the
one command), `replay-findings.js` (the findings against the real code), `view.mjs` (plain-word state and step labels
for the `/statechart` skill's chart and report; give it to `/statechart` as the view, and update it when you add an
action or a variable).
