---
name: verify-mt-lock
description: Model-check the MT edit lock and the study-freeze marker against every writer of a unit's MT, with TLC, and replay the findings on the real functions (server/verification/mt-lock/). Use when a change touches tools/lib/mt-lock.cjs, api-translate's planning or write paths (mtRunDecision, translateModule, topUpModule, --rerequest), the server's first-save or first-acceptance lock hook, study-freeze.js markers, backfill-mt-locks.js, or the e2e stray-lock sweep — before you trust the change.
---

# Verify the MT lock and the study freeze

## What this protects, in plain words

**Promise** (`tools/lib/mt-lock.cjs`, `mtRunDecision`'s docstring, CLAUDE.md "NEVER CLEAR, EDIT OR DELETE A STUDY
FREEZE MARKER"): once a unit's `<module>-segments.locked` marker exists, the unit's served MT (`02-mt-output` plus the
`02-mt-selected` overlay) never changes; a freeze marker is never replaced or removed; a module someone has edited
always has a marker.

**Harm when it breaks:** editors' work sits on an MT baseline that changed under them; for a study unit (G1.7), the
MT the study compares against moves, which breaks the comparison the study exists to make. A replaced or deleted
freeze marker is a stop for [USER] under CLAUDE.md.

## How it is checked

Two legs, one command:

1. **A TLA+ model, `MtLock.tla`, checked by TLC** over every order of the actions below, for one unit, each process
   running once.
2. **`replay.mjs` on the real functions**, in temp trees: each finding TLC reports is reproduced on the real code, and
   each guard the model credits to the code is shown to hold. The other process of a race is simulated by a one-shot
   hook on `fs.existsSync` for the marker path, which runs the other writer's real function inside the gap.

| Model action                     | The code                                                                                                                                                                                                                                                                                |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AtPlan`                         | `tools/api-translate.js` `main()`: the work-list loop's `locked = isMtLocked(outputPath)`, then `mtRunDecision` (`locked` → `'locked-skip'`); `runRerequestMode`'s `isMtLocked` refusal                                                                                                 |
| `AtWrite`                        | `translateModule`'s and `topUpModule`'s `fs.writeFileSync(outputPath, …)`; `rerequestModule` → `writeSelectedOverlay`. All after the paid call, with no lock re-read                                                                                                                    |
| `SrvSave`, `SrvWrite`            | `server/services/segmentEditorService.js` `saveSegmentEdit` (and `acceptanceService`'s first acceptance): the row commits, then `writeMtLock`: `if (fs.existsSync(lock)) return;`, then a plain `writeFileSync` (flag `'w'`)                                                            |
| `FzCheck`, `FzCreate`            | `server/scripts/study-freeze.js` `markers --write` → `writeFreezeLock`: `freezeLockState`, then an exclusive create (`flag: 'wx'`); on `EEXIST` it re-reads and returns `'already'` or throws `FOREIGN_LOCK`                                                                            |
| `E2eSnap`, `E2eSave`, `E2eSweep` | `server/e2e/global-setup.js` snapshot (`listLockFiles`), the suite's own first save on `efnafraedi-2e`, `server/e2e/helpers/mt-lock-sweep.js` `sweepStrayLocks` (unlinks every marker absent from the snapshot, without reading it)                                                     |
| `PfWrite`                        | `tools/promote-fable-layer.js` `promoteFableLayer`: refuses an existing Fable file with other bytes, creates new ones with `wx`; reads no marker. The model takes it as a no-change step; its mutant overwrites different bytes. Reachability is a witness in `check.sh`, not a finding |
| `Pull`, `Push`                   | git between a dev tree and prod: `scripts/git-backup.sh` commits markers on prod, a dev `git pull` brings them; a dev MT commit reaches prod by merge and deploy                                                                                                                        |

**What is ONE step, and why.** api-translate, the server, study-freeze and the Playwright run are separate OS
processes, so each filesystem call is its own step and another process can act between any two. Inside the server a
request is synchronous (better-sqlite3, no `await`), which orders requests against each other but not against other
processes. `E2eSave` is taken as one step; that can only hide an interleaving, never invent one.
`scripts/backfill-mt-locks.js` calls the same `writeMtLock`, so `SrvSave`/`SrvWrite` stand for it too.

**Rules** (`MtLock.tla` § RULES): `BaseFixedWhileLocked`, `FreezeKept`, `LockedOnceEdited` (holds once
`writeMtLock` has had its turn: between the edit row's commit and the marker write the code is unlocked by design).

With no two writers overlapping (every actor, one tree), every rule holds; `check.sh` prints the state count.

## Known findings (pinned; the check expects them)

None of these is fixed: each is a product change for [USER] to rule on (register §C253). Do not change product code
to turn this check green.

- **F1: api-translate samples the lock once, at planning, and writes after the paid call.** TLC's shortest path:
  `AtPlan` (no marker), an editor's first save writes the marker (`SrvSave`, `SrvWrite`), `AtWrite` overwrites the MT.
  The same with a freeze marker (`F1-freeze-mid-run`). Replayed: a stub client writes the marker during
  `translateModule`'s paid call; the MT file changes with the marker present. `topUpModule` and `rerequestModule` have
  the same shape and are not replayed. Needs a marker to reach api-translate's tree during a run: a marker writer on
  that tree, or a `git pull` that brings one (the run never re-reads it).
- **F2: `writeMtLock` replaces a freeze marker written between its `existsSync` and its write.** Path: `SrvSave`
  (no marker), `FzCheck`, `FzCreate` (freeze written, reported `'written'`), `SrvWrite` (editing body over it).
  `writeFreezeLock`'s own docstring guards the mirror case with `wx`; `writeMtLock` has no such guard. Replayed. Both
  run on prod (an editor's first save, a `study-freeze markers --write`); the window is the microseconds between two
  syscalls, so it is rare, and `study-freeze check` would then report the unit's marker as not the freeze marker.
- **F3: the e2e sweep deletes a freeze marker written during the run.** Path: `FzCheck`, `E2eSnap`, `FzCreate`,
  `E2eSave`, `E2eSweep`. The sweep tells "this run's litter" by absence from the snapshot only, and the suite's real
  book is the study book. Replayed. Needs a freeze marker to reach the dev tree during an e2e run: a freeze run on that
  tree, or **a `git pull` between the snapshot and the sweep** that brings prod's marker (`F3-via-git-pull`: `FzCheck`,
  `FzCreate` on prod, `E2eSnap`, `Pull`, `E2eSave`, `E2eSweep`). The marker is then gone from the dev tree, which
  leaves that tree's api-translate free to rewrite the unit.
- **F4: a lock on another tree does not stop a run, even with nothing overlapping.** Path (Sequential): api-translate
  runs on the dev tree (`AtPlan`, `AtWrite`), an editor locks the unit on prod (`SrvSave`, `SrvWrite`), the dev MT
  reaches prod (`Push`). `isMtLocked` reads only the local tree. Not replayable as code (it is a git sequence); it
  rests on that local-only read plus F1's write. It is the only finding that needs no overlap: a dev tree that has not
  pulled prod's latest marker commit is enough. **Because it has no replay, a code fix will not flip its pin**: whoever
  fixes it must also change the model (for example, make `AtPlan` read prod's marker) and then remove the pin.

The pins are **narrow**: each finding has its own configuration and must fail on its own rule. A finding configuration
that passes, or fails on another rule, prints `PINNED FINDING CHANGED`; a replayed finding that stops reproducing
prints `PINNED FINDING NO LONGER REPRODUCES`. Either way a fix forces the pin's removal, here and in `check.sh` and
`replay.mjs`.

## Does your change touch the verified code?

```sh
git diff --stat 2b99e0772 -- tools/lib/mt-lock.cjs tools/api-translate.js \
  server/services/segmentEditorService.js server/services/acceptanceService.js \
  server/scripts/study-freeze.js scripts/backfill-mt-locks.js \
  server/e2e/helpers/mt-lock-sweep.js server/e2e/global-setup.js server/e2e/global-teardown.js \
  scripts/git-backup.sh
```

Empty: the model still describes the code. Any output: read the change against the action table above, then run the
check. `tools/api-translate.js` changes often for reasons unrelated to locking; what matters there is `mtRunDecision`,
the work-list loop, `runRerequestMode`, and the write lines in `translateModule`, `topUpModule` and `rerequestModule`.

## Run the check

Needs Java, Node and TLC v1.7.4 at `~/.cache/tla/v1.7.4/tla2tools.jar` (the jar `verify-assign-gate` uses; `check.sh`
checks its hash). If it is missing, ask the user to fetch it as that skill's SKILL.md describes. From the repo root
(about 15 seconds):

```sh
sh server/verification/mt-lock/check.sh
```

A clean run ends `OK: rules hold without overlap, known findings pinned, every mutant caught, replay agrees` and exits 0. It runs: the rules with no overlap (must pass); each finding's configuration (must fail on its rule, shortest path
printed); three model mutants, each removing one guard the model credits to the code (api-translate's lock check,
`writeMtLock`'s `existsSync` no-op, the sweep's snapshot test); then `replay.mjs`.

To prove the replay can still fail (after editing it, or before trusting it on a new kind of change), run, with
nothing else editing those files (about a second; measured 2026-11-23):

```sh
node server/verification/mt-lock/mutate.mjs
```

It applies seven mutants to the **real** code (`mt-lock.cjs`, `api-translate.js`, `mt-lock-sweep.js`): five BREAKs
(`wx` → `w` in `writeFreezeLock`; `writeMtLock` without its `existsSync`; `isMtLocked`'s catch returning false;
`mtRunDecision` without its lock rule; the sweep ignoring its snapshot), each of which must print `GUARD BROKEN`, and
two FIXes (F2: `writeMtLock` creating with `wx`; F1: `translateModule` re-reading the lock before its write), each of
which must print `PINNED FINDING NO LONGER REPRODUCES`. Before the first mutant it copies the three files to a fresh
`mt-lock-mutate-golden-*` directory under the OS temp dir and prints its path; every round restores from those copies
and compares byte for byte, and the directory is deleted only when all three match. If the run dies mid-round, copy the
files back from that directory (each sits under its repo-relative path) and compare. **Never restore with
`git checkout` or `git stash`.** Run `git status --porcelain` after it, and after any agent
that ran it goes quiet.

Read every TLC result with the `/statechart` skill: it tells a violation as its shortest path in plain words, and on a
pass draws how the unit's marker and MT move between states.

**Never point any of this at the real `books/` tree.** Every replay builds its own temp tree; a study-freeze marker
under `books/` must never be read, written or deleted.

## Reading a failure: real bug or modelling error?

- **`BROKEN: a rule fails even with no overlap`**: a guard the code relies on is gone (or the model changed). Map each
  step of the path to the action table, then reproduce it in `replay.mjs` on the real functions before calling it a
  finding.
- **`PINNED FINDING CHANGED`** or **`NO LONGER REPRODUCES`**: if the code was fixed on purpose, update the action that
  names it, remove the finding from `check.sh`, `replay.mjs` and this file, and keep a guard in `replay.mjs` that the
  fix holds. If nothing was meant to change, find what did.
- **`MUTANT MISSED`** or **`GUARD BROKEN`** outside `mutate.mjs`: the model or the code no longer has that guard. If
  every model mutant "passes" with the clean run's state count, TLC loaded the wrong module (it resolves the module
  from its working directory; `check.sh` runs each mutant from its own directory for that reason).
- **A path that needs a step finer than one filesystem call** (for example, a reader seeing a half-written marker) is a
  modelling question, not a finding: `writeFileSync` truncates then writes, and a reader in between sees an empty file,
  which `isMtLocked` treats as locked and `freezeLockState` as `'foreign'`. Both are the safe direction.

## When your change is intended: update the model

Change the action that names the code you changed, keep each action one filesystem call (or one synchronous request
inside the server), re-run `check.sh`, and keep every mutant caught. A new process that writes a marker or the MT needs
its own actions. A new guard needs a replay in `replay.mjs` and, where it can be broken, a mutant in `mutate.mjs`.

## Scope: what a pass covers, and what it does not

- **Covered:** every order of the actions above for one unit, each process running once, on one tree or on a dev tree
  and prod joined by git.
- **Not covered:** several units at once (the processes act per unit, so a race on one unit is the same on many);
  repeated runs of one process; crashes mid-write; `cnxml-extract` re-extracting a frozen unit (it changes the English
  in `02-for-mt`, not the MT, and only warns; `study-freeze check` compares both); the freeze manifest itself; the
  served-version hashing; vefur.
- **Which trees the findings need** is part of each finding above. The model does not decide how often two processes
  share a tree; that is a deployment fact.

## Coverage record

**Sync commit: `2b99e0772`.** The model and replay were last confirmed to describe the code below at this commit.
Move it forward only after re-reading the changed code against the action table and running `check.sh` and
`mutate.mjs`.

| Model part                        | Code (open it to check)                                                                                                                                                                 |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `IsMtLocked`, `AtPlan`'s decision | `tools/lib/mt-lock.cjs` `isMtLocked`; `tools/api-translate.js` `mtRunDecision`, `main()`'s work-list loop, `runRerequestMode`                                                           |
| `AtWrite`                         | `tools/api-translate.js` `translateModule`, `topUpModule`, `rerequestModule` (`writeSelectedOverlay`)                                                                                   |
| `SrvSave`, `SrvWrite`             | `tools/lib/mt-lock.cjs` `writeMtLock`; `server/services/segmentEditorService.js` `saveSegmentEdit`; `server/services/acceptanceService.js`; `scripts/backfill-mt-locks.js` `lockModule` |
| `FzCheck`, `FzCreate`             | `tools/lib/mt-lock.cjs` `freezeLockState`, `writeFreezeLock`; `server/scripts/study-freeze.js` `planMarkers`, `writeMarkers`                                                            |
| `E2eSnap`, `E2eSave`, `E2eSweep`  | `server/e2e/global-setup.js`, `server/e2e/global-teardown.js`, `server/e2e/helpers/mt-lock-sweep.js` `listLockFiles`, `sweepStrayLocks`                                                 |
| `Pull`, `Push`                    | `scripts/git-backup.sh` (stages `books/*/02-mt-output/*/*-segments.locked`); the deploy's pull                                                                                          |
