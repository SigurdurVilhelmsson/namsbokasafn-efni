---
name: verify-research-withdrawal
description: Model-check the research-withdrawal lifecycle with TLC (server/verification/research-withdrawal/). Use when a change touches research consent or withdrawal, researchLog's capture path, research-withdrawal.js, research-backup.sh, research-restore.js, the sessions.db backup or restore runbook, or how research rows or loss rows are written or deleted — before you trust the change.
---

# Verify the research-withdrawal lifecycle

## What this protects, in plain words

**Promise (consent text, spec 2026-11-03 §5.15):** once an editor withdraws a consent interval, nothing more is
captured for it; its rows leave the live files, and the deletion is recorded done only when that is true; no research
copy taken after the withdrawal holds them.

**Harm when it breaks:** research data about someone who withdrew, or a record saying it was deleted when it was not.
That is a consent breach, and it cannot be undone by a later fix.

## How it is checked

A TLA+ model, `ResearchWithdrawal.tla`, checked by TLC over every order of these actions, one editor, two consent
intervals (withdraw, then re-consent), at most one copy of each file:

| Model action | The code |
|---|---|
| `Consent(i)` | `researchConsent.recordDecision` 'consented' (+ `researchLog.ensureKey`) |
| `WithdrawCommit(i)`, `RouteDelete(i)` | the withdraw route: `researchConsent.withdraw`, then `researchDeletion.deleteIntervalRowsNow`; a crash can land between them |
| `Capture`, `Lose` | `researchLog.record`: `captureStateFor` (step 3) then `writeEvent`, or `lose` → `researchConsent.recordLoss` |
| `ScriptStart` … `ScriptRecord`, `ScriptCrash` | `research-withdrawal.js` `runWithdrawal`: `dueIntervals`, loss rows, research rows + key, record; a crash after any commit |
| `ScriptNothingDue`, `ResearchCopyTake`, `ResearchCopyKeep`/`Discard` | `research-backup.sh` runs the withdrawal script, then `research-backup.js` `takeCopy`: the online backup (the server may act before, during and after), then `dueIntervals` re-read AFTER the copy; kept only when nothing is due |
| `SessionsCopy` | `backup-db.sh`, on its own schedule |
| `ResearchRestore` | `research-restore.js`: purge the staged copy with the same `dueIntervals`, then put it live |
| `SessionsRestore` | `docs/technical/backup-and-restore.md` "Restore runbook": copy the newest `sessions.db` copy into place |

**What is ONE step, and why.** The server is one synchronous Node process: better-sqlite3 is synchronous, nothing in
`record`'s chain or the withdraw route awaits, and the server does not cluster. So a request is atomic: no request can
land between another request's consent read and its write. `research-withdrawal.js` is a separate process, so each of
its commits is its own step. Restores need the service stopped. **If the server ever gains an `await` in that chain,
or a second process, this model's atomicity is wrong: split `Capture`/`Lose` into read and write steps.**

Rules (`ResearchWithdrawal.tla` § RULES): `NoCaptureAfterWithdrawal`, `DoneOnlyWhenTrue`, `CopyAfterWithdrawalClean`,
`QuiescentClean` (when nothing is due and no deletion runs, no withdrawn interval has a row in a live file). Ghost
variables hold the truth a restore cannot erase (`withdrew`).

## Known finding (pinned; the check expects it)

**A `sessions.db` restore undoes a withdrawal.** TLC's shortest path: the editor consents; `backup-db.sh` copies
`sessions.db`; the editor withdraws; the runbook restores that copy. The consent row is live again: the interval is
no longer due (so its key stays in the research file, `QuiescentClean`), and the server captures for someone who
withdrew (`NoCaptureAfterWithdrawal`, one step more). The research-file restore re-purges every withdrawn interval
(§5.15 "A restore"); nothing does the same for `sessions.db`, where the consent rows live.

`server/__tests__/researchSessionsRestore.test.js` proves the finding's **precondition** on the real functions: on a
pre-withdrawal copy, `captureStateFor` captures and `dueIntervals` drops the interval (each beside its control). It
**cannot detect a fix**: the restore is a manual runbook step with no code to run, so the test opens the copy directly,
and a fix outside those two functions (a reconcile at boot, a migration, a runbook step) leaves it passing. **Latent today:** no consent text is approved in the repo, so no one can consent yet. A fix (for example,
reconcile research_consent after a sessions.db restore, or refuse the restore while a withdrawal is newer than the
copy) is a product change for [USER]. **The fix must bring its own test** that runs the new step on such a copy; then
update the model's `SessionsRestore` to match, remove the finding from `check.sh`, and retire the precondition test.

With the restore left out (`SessionsRestoreOn = FALSE`), every rule holds; `check.sh` prints the distinct-state count on each run.

## Does your change touch the verified code?

```sh
git diff --stat c90b20bed -- server/services/researchConsent.js server/services/researchDeletion.js \
  server/services/researchLog.js server/scripts/research-withdrawal.js server/scripts/research-restore.js \
  server/scripts/research-backup.js server/scripts/lib/researchPurge.js scripts/research-backup.sh \
  scripts/backup-db.sh server/routes/research.js docs/technical/backup-and-restore.md
```

Empty: the model still describes the code. Any output: read the
change against the action table above, then run the check.

## Run the check

Needs Java and TLC v1.7.4 at `~/.cache/tla/v1.7.4/tla2tools.jar` (the same jar `verify-assign-gate` uses; `check.sh`
checks its hash). If it is missing, ask the user to fetch it as that skill's SKILL.md describes. From the repo root
(well under a minute):

```sh
sh server/verification/research-withdrawal/check.sh
npx vitest run server/__tests__/researchSessionsRestore.test.js
```

A clean run ends `OK: rules hold, known findings pinned, every mutant caught` and exits 0. It runs three things: the
rules without the sessions.db restore (must pass), each known finding with it (must still fail, on its own rule), and
four mutants of the model, each removing one guard the model credits to the code (must fail on that guard's rule):
the "key row present" clause of `dueIntervals`, the research delete before the record, the copy's re-check of
`dueIntervals` after the copy, and capture only for a live interval.

Read every TLC result with the `/statechart` skill: it tells a violation as its shortest path in plain words, and on a
pass draws how the lifecycle moves between states.

## Reading a failure: real bug or modelling error?

- **`BROKEN: a rule fails without the sessions.db restore`**: a new path breaks the promise. Map each step of the path
  to the action table, then replay it on the real functions, as `researchSessionsRestore.test.js` does, before calling
  it a finding. A path that needs two server requests to interleave is a modelling error while the server stays
  synchronous (see "What is ONE step").
- **`pinned finding no longer failing`**: someone edited the model (a runbook or code fix alone cannot flip it: the
  model's `SessionsRestore` is written by hand). If the restore path was fixed on purpose, `SessionsRestore` should now
  match it: remove the finding, and confirm the fix's own test covers the new step.
- **`MUTANT MISSED`**: the model no longer depends on that guard, so the rule it protects is no longer tested. Fix the
  model; the tail of TLC's output is printed under the line. If every mutant "passes" with the same state count as
  the clean run, TLC loaded the wrong module file (it resolves the module from its working directory).

## When your change is intended: update the model

Change the action that names the code you changed, keep each action one indivisible step in the code, re-run
`check.sh`, and keep every mutant caught. A new process that writes either file needs its own actions. A new copy or
restore path needs its own action and a rule that it keeps the promise.

## Scope: what a pass covers, and what it does not

- **Covered:** every order of the actions above for one editor, two intervals, one copy of each file, crashes between
  the route's two commits and after any withdrawal-script commit.
- **Not covered:** retention (`research-retention.js`); copy ageing (prune timing, the 7-day bound); the byte scan and
  compaction (modelled as part of the record step); exports (`research-exports/`); several editors; more than one
  copy per file; the derived dataset; power loss.
- **Assumptions:**
  - the server is one synchronous process (above);
  - **no deletion run lands between a cron copy and its re-check.** `research-backup.sh` runs the withdrawal script,
    the copy and the re-check in sequence, and nothing locks against an admin's hand run of
    `research-withdrawal.js --write` or `research-restore.js` in those seconds (or an overlapping cycle). If one did,
    the re-check would see nothing due and keep a copy holding an interval withdrawn just before it; that copy ages out
    within 7 days. TLC finds the path as soon as the `~partial.has` guards on `ScriptStart` and `ResearchRestore` go,
    so the guard is the assumption, written down. A lock (`flock`) shared by the three would make it enforced.

## Coverage record

**Sync commit: `c90b20bed`.** The model was last confirmed to describe the code below at this commit (§C258, 2026-11-28: `research-backup.sh` refuses a non-crypt remote before any action the model names; G1.20 before it: `backup-db.sh` copies `sessions.db` only, the runbook restores the newest copy).

| Model part | Code (open it to check) |
|---|---|
| `Consent`, `WithdrawCommit`, `Capture`'s gate | `server/services/researchConsent.js` `recordDecision`, `withdraw`, `captureStateFor` (`latestAndLive`) |
| `RouteDelete` | `server/routes/research.js` withdraw handlers; `server/services/researchDeletion.js` `deleteIntervalRowsNow` |
| `Capture`, `Lose` | `server/services/researchLog.js` `recordInner`, `writeEvent`, `lose`; `researchConsent.recordLoss` |
| `Script*`, `DueFor` | `server/scripts/research-withdrawal.js` `dueIntervals`, `runWithdrawal` |
| `ScriptNothingDue`, `ResearchCopyTake`/`Keep`/`Discard` | `scripts/research-backup.sh` (order: prune, withdrawal + retention, copy); `server/scripts/research-backup.js` `takeCopy` (copy, then `dueIntervals` re-read) |
| `SessionsCopy`, `SessionsRestore` | `scripts/backup-db.sh`; `docs/technical/backup-and-restore.md` "Restore runbook" |
| `ResearchRestore` | `server/scripts/research-restore.js` |

Files: `server/verification/research-withdrawal/ResearchWithdrawal.tla`, `ResearchWithdrawal.cfg` (restore on: the
finding), `NoSessionsRestore.cfg` (restore off: must pass), `check.sh`; the replay
`server/__tests__/researchSessionsRestore.test.js`. Move the sync commit forward only after `check.sh` passes at the
new commit and you have confirmed the action table still names the code.
