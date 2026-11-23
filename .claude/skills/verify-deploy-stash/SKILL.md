---
name: verify-deploy-stash
description: Check scripts/deploy.sh's stash → pull → pop (steps 2–4) against the live server and the git-backup cron, with real git in throwaway repos (scripts/verification/deploy-stash/). Use when a change touches deploy.sh's steps 2–4, .gitattributes' merge drivers, git-backup.sh's add/commit/push or its PATHSPECS, record-deployed-commit.sh, or what the server writes into the tree — before you trust the change.
---

# Verify deploy.sh's stash → pull → pop

## What this protects, in plain words

**Promise** (`scripts/deploy.sh`'s header and steps 2–4; CLAUDE.md: deploy.sh "stashes and re-applies local editorial
changes instead of discarding them"): every uncommitted change on prod, and every file the live server writes while the
deploy runs, is back in the working tree (or committed) when the deploy's git steps finish; no conflict marker is
committed; the repo is not left mid-operation.

**Harm when it breaks:** editors' applied text, rendered pages or locks left in a `git stash` entry that no later
deploy restores, or conflict markers committed and pushed to `main` by the backup cron, from where they reach the next
sync to readers.

## How it is checked

**Tool: a bounded exhaustive run of the real code, with real git.** The outcomes depend on what git does (`stash pop`
on a conflict or a dirty file, `rebase` on a dirty tree or an untracked file in the way, a `merge=ours` driver
during a pop), which a hand model would have to guess. So `check.mjs` runs the **verbatim text of deploy.sh from
`# 2. Stash` to `# 5. Install`** in bash, inside a throwaway clone, for every scenario below, and pins each scenario's
outcome in `expected.json`.

Each run: a bare origin, a dev clone and a prod clone under the OS temp dir (this repo's `.gitattributes` and
`record-deployed-commit.sh` copied in). Prod's local changes are an applied text (`03-faithful-translation`), a rendered
page (`05-publication`) and a `merge=ours` manifest (`translation-errors.json`). The dev side pushes one commit. Then
deploy's steps 2–4 run with one line, `inject <boundary>`, between its steps; then one cron tick; then a second,
undisturbed run of steps 2–4 (the next deploy).

| Scenario dimension        | Values                                                                                                                                                                                                                                                                                                                           | What it stands for (open it to check)                                                                                                              |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| origin                    | `clean` (dev touches another file), `same-file` (dev changed the page prod changed), `manifest` (dev changed `translation-errors.json`), `adds-path` (dev added a page), `diverged` (prod has an unpushed commit to the same page), `unreachable`, `mid-rebase` (prod already mid-rebase with a staged hand resolution; one row) | dev pushes to `main`; a prod cron commit whose push was rejected (CLAUDE.md "your own push to main can strand prod's content backup"); the network |
| server write              | none, at B1 (after the stash, before the rebase), at B2 (after the rebase, before the pop)                                                                                                                                                                                                                                       | the running server re-renders a page: `pipelineService.js` `runRender` ("Vista + Birta"); the server is only restarted at step 6                   |
| untracked page            | no, yes (prod has a new page dev also adds in `adds-path`)                                                                                                                                                                                                                                                                       | a render on each side; the stash has no `-u`, so it stays in the tree                                                                              |
| lock                      | none, `.git/index.lock` held at B0 / B1 / B2                                                                                                                                                                                                                                                                                     | a `git-backup.sh` tick's `git add`/`commit` mid-flight: neither script takes a lock against the other                                              |
| cron tick (always, after) | the real `scripts/git-backup.sh`, committed into the clone and run there                                                                                                                                                                                                                                                         | the 2-hourly backup cron (its glossary-export step finds no exporter in the clone, warns and carries on)                                           |

**Each row records**, after the deploy plus one cron tick, and again after the next deploy: where each local change is
(`tree`; `head`; `branch`, committed on `main` while a stopped rebase has detached `HEAD`; `stash` only; or `gone`,
in none of those places; a file holding conflict markers is `conflict+<where the change survives>`, for example
`conflict+stash`), the steps' exit code, whether step 4 printed its warning, the stash count, whether conflict markers
are committed in `HEAD` or on origin's `main`, whether the repo is mid-rebase/merge, and which injections landed (an
injection after the script stopped never happens, and the row says so).

**What a row cannot see:** another process acting _inside_ one git command (a lock taken mid-`pull` rather than
before it). Steps 5–7 (npm, restart, health) are not run: a row reports what steps 2–4 leave, not what the deploy
finally exits with. The real script continues to step 5 after step 4's warning, so a warned pop is followed by a
normal restart.

## Findings (pinned in `expected.json`; register §C254)

Status lives in register §C254; this section describes what the check measures in the code at the sync commit.

**Each row's class is derived from its measured first-run outcome, not from its scenario name**: `check.mjs` labels
every row by the rules in its `label()` and prints the count per label; `--findings` lists the rows. The lists below
are that output at the sync commit. If they ever disagree, the `--findings` output is right and this file is stale.

What deploy.sh does now (steps 2–4): **refuse a checkout already mid-rebase** (before anything moves), **fetch first**
(`git fetch origin main`, before the stash: a network failure has moved nothing), install an **EXIT trap**, stash, **rebase onto `FETCH_HEAD`**, record, pop. On any failure between the
stash and the pop the trap **aborts a stopped rebase** (prod's branch returns to its pre-deploy tip) and **pops the
stash back**. The cron (`git-backup.sh`) refuses to commit unmerged entries, a rebase or merge in progress, or a staged
marker line.

- **failed, changes left in the stash (D1, D4)** (15): every `*|write:B1|*` except `unreachable`, and every
  `*|lock:B1` except `unreachable`. The rebase refuses (a server write left the tree dirty, or a cron's lock is held),
  the trap pops, and the pop cannot apply for the same reason (the server's write clashes with the stashed file, or the
  lock is still held), so the changes stay in the stash and the trap says so.
- **D2. A server write, or a cron's index lock, between the rebase and the pop makes the pop refuse** (11): `clean`,
  `same-file` and `manifest` with `write:B2` or `lock:B2`; `adds-path|write:B2|untracked:no|lock:none`;
  `adds-path|write:none|untracked:no|lock:B2`. Step 4 prints its warning and the deploy carries on; every stashed
  change stays in the stash.
- **D3. When dev and prod both changed a file, the pop leaves conflict markers in the tree** (2):
  `same-file|write:none|untracked:*|lock:none`: `F:conflict+stash`. The cron refuses to commit that tree
  (`markersInHead`/`markersOnOrigin` `false`), and the next deploy stops (exit 1: git cannot stash unmerged entries)
  until a person resolves the conflict.
- **failed, every change back in the tree** (21): every `unreachable` row (the fetch fails before the stash); every
  `*|lock:B0` (the stash fails on the lock); `adds-path` with an untracked page and `write:none`/`write:B2` (the
  rebase refuses the untracked page, the trap pops); `diverged` with `write:none`/`write:B2` and `lock:none`, and
  `diverged|write:none|untracked:no|lock:B2` (the rebase stops on prod's unpushed commit, the trap aborts it and pops).
  Nothing is left moved and the deploy exits non-zero. A `diverged` clash fails the same way on every deploy until a
  person resolves it.
- **refused: a rebase was already in progress (nothing moved)** (1): `mid-rebase|write:none|untracked:no|lock:none`.
  The deploy refuses before it fetches or stashes; the hand resolution stays staged, the uncommitted edit stays in
  the tree, the rebase stays in progress, and the cron refuses to commit it. Every later deploy refuses the same way
  until the rebase is finished or aborted.
- **restored** (5): `clean|write:none|untracked:*|lock:none`, both `manifest|write:none|…|lock:none` rows (the manifest
  dropped by design) and `adds-path|write:none|untracked:no|lock:none`.
- **No deploy leaves a rebase it started half-way** (the only row still mid-rebase is `mid-rebase`, whose rebase was
  there before the deploy and is left alone on purpose) and **no row loses an applied text or a page**: measured on both runs,
  every change is in the tree, `HEAD`, on `main` (`branch`) or in a stash, including behind conflict markers;
  `check.mjs` prints the count of rows where one is gone, which is 0.
- **A later deploy never restores an earlier deploy's stash** (step 2 stashes only a dirty tree; step 4 pops only its
  own): every row whose first run left `stash` still shows `stash` after the next deploy.

**By design, not a finding:** `manifest` rows show `T:gone`: the `merge=ours` driver keeps the pulled
`translation-errors.json` and drops prod's, as `.gitattributes` intends for that derived file.

**Controls:** the `restored` rows, on both runs; and the `lock:B0` rows, where step 2 fails before anything moves.

**On prod (read-only, 2026-11-23):** 17 stash entries, all untagged "WIP on main" from February to April 2026; none
carries deploy.sh's `deploy-<date>` tag (added with the script on 2026-03-25). So no stash left by the current script
is there now (one could have been dropped by hand): the findings are possible, not observed.

## Does your change touch the verified code?

```sh
git diff --stat 27791aa2c -- scripts/deploy.sh .gitattributes scripts/git-backup.sh scripts/record-deployed-commit.sh
```

Empty: the check still describes the code. Any output: run the check. A change to deploy.sh outside steps 2–4 does
not change a row, but the check still runs it (the markers `# 2.`, `# 3.`, `# 4.`, `# 5.` must each appear exactly
once, and steps 2–4 must not run `sudo`, `npm` or `systemctl`).

## Run the check

Needs Node and git. From the repo root (about 20 seconds):

```sh
node scripts/verification/deploy-stash/check.mjs
```

A clean run ends `OK: every scenario matches its pinned outcome` and exits 0; it prints the git version it ran beside
the one the table was pinned with. To prove the check can still fail (after editing it), run (about a minute and a half; it
never edits `scripts/deploy.sh`, only temp copies):

```sh
node scripts/verification/deploy-stash/mutate.mjs
```

Eight mutants, all BREAK: step 4 never pops; step 2 never stashes; the `ours` driver is not registered; step 4 drops
the stash instead of popping it, which must also make the lost-change count non-zero (the control that the `0` the
real script gets is a measurement, not a blind counter); the early fetch is removed; the EXIT trap is not installed;
the guard against a rebase already in progress does not stop the deploy; the trap does not abort a stopped rebase.
Each must print `seen`.

It never touches this repository's tree or stash: every git command runs in a temp clone whose toplevel and origin
are asserted first, with `GIT_*` variables removed and global and system git config disabled.

## Reading a failure

- **`CHANGED <scenario>`** prints the pinned row and the new one. Ask which field moved and why:
  - you changed deploy.sh, `.gitattributes` or the cron on purpose: confirm the new row is what you meant (a fix
    should turn a finding's `stash`/`conflict` into `tree`), then re-pin (below) and update this file and §C254;
  - you changed nothing there: the git version probably differs (the line under the rows names both). Prod ran git
    2.43.0 on 2026-11-23; the table was pinned with 2.53.0. A row that differs only by git version is a fact about git,
    worth recording, not a regression.
- **An error before any row** (a marker found 0 or 2 times, `sudo`/`npm`/`systemctl` in steps 2–4): deploy.sh's
  layout changed; update `extractSteps` in `check.mjs` deliberately.

**Re-pinning** is a reviewed act, never a reflex: `node scripts/verification/deploy-stash/check.mjs --print >
/tmp/rows.json`, read every changed row, then copy it over `expected.json`.

## Scope

- **Covered:** 55 scenarios, each followed by one cron tick and one more deploy: every origin crossed with every
  server-write and untracked-page value (36), plus every origin with each lock position (18), plus one `mid-rebase`
  row (prod already mid-rebase, with a staged hand resolution and an uncommitted edit). **A lock is varied only on its
  own** (no server write, no untracked page): the full product of the four dimensions would be 144.
- **Not covered:** a lock combined with a server write or an untracked page; overlap inside a single git command; steps 0, 1, 5–7; `git-backup.sh`'s glossary exporter (absent in the
  clone); more than one dev commit or more than three prod files; prod's git
  version (2.43.0, not run).
- **Not covered, about the EXIT trap:** it stays installed through steps 5–7 (npm, restart, health), which are not
  run here; by its flags it does nothing there (`POPPED=1` after step 4, and no rebase is in progress). `git stash pop`,
  in step 4 and in the trap, takes the TOP stash entry: the fixture starts with none, so a pop of the wrong entry is not
  seen (prod holds 17 older, untagged entries). The trap aborts any rebase it finds; that is only ever one this deploy
  started, because step 2 refuses a checkout already mid-rebase before the trap is installed (the `mid-rebase` row).

## Coverage record

**Sync commit: `27791aa2c`.** The check was last confirmed to describe the code below at this commit. Move it forward
only after reading the change and running `check.mjs` and `mutate.mjs`.

| Part                   | Code                                                                                                                                                                                |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| steps run              | `scripts/deploy.sh` from `# 2. ` to `# 5. ` (early fetch, the EXIT trap `restore_after_failure`, stash, `merge.ours.driver`, `rebase FETCH_HEAD`, `record-deployed-commit.sh`, pop) |
| `merge=ours` behaviour | `.gitattributes`                                                                                                                                                                    |
| cron tick              | `scripts/git-backup.sh`, run whole (its §C254 D3 refusal included)                                                                                                                  |
| server write           | `server/services/pipelineService.js` `runRender` (writes `05-publication`)                                                                                                          |
