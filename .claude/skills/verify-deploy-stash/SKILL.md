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
on a conflict or a dirty file, `pull --rebase` on a dirty tree or an untracked file in the way, a `merge=ours` driver
during a pop), which a hand model would have to guess. So `check.mjs` runs the **verbatim text of deploy.sh from
`# 2. Stash` to `# 5. Install`** in bash, inside a throwaway clone, for every scenario below, and pins each scenario's
outcome in `expected.json`.

Each run: a bare origin, a dev clone and a prod clone under the OS temp dir (this repo's `.gitattributes` and
`record-deployed-commit.sh` copied in). Prod's local changes are an applied text (`03-faithful-translation`), a rendered
page (`05-publication`) and a `merge=ours` manifest (`translation-errors.json`). The dev side pushes one commit. Then
deploy's steps 2–4 run with one line, `inject <boundary>`, between its steps; then one cron tick; then a second,
undisturbed run of steps 2–4 (the next deploy).

| Scenario dimension        | Values                                                                                                                                                                                                                                            | What it stands for (open it to check)                                                                                                              |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| origin                    | `clean` (dev touches another file), `same-file` (dev changed the page prod changed), `manifest` (dev changed `translation-errors.json`), `adds-path` (dev added a page), `diverged` (prod has an unpushed commit to the same page), `unreachable` | dev pushes to `main`; a prod cron commit whose push was rejected (CLAUDE.md "your own push to main can strand prod's content backup"); the network |
| server write              | none, at B1 (after the stash, before the pull), at B2 (after the pull, before the pop)                                                                                                                                                            | the running server re-renders a page: `pipelineService.js` `runRender` ("Vista + Birta"); the server is only restarted at step 6                   |
| untracked page            | no, yes (prod has a new page dev also adds in `adds-path`)                                                                                                                                                                                        | a render on each side; the stash has no `-u`, so it stays in the tree                                                                              |
| lock                      | none, `.git/index.lock` held at B0 / B1 / B2                                                                                                                                                                                                      | a `git-backup.sh` tick's `git add`/`commit` mid-flight: neither script takes a lock against the other                                              |
| cron tick (always, after) | stage `git-backup.sh`'s own `PATHSPECS`, commit, push                                                                                                                                                                                             | a **stand-in** for `git-backup.sh`'s core (no exporter, no status file)                                                                            |

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

None is fixed: each is a product change for [USER] to rule on. Do not change deploy.sh to turn this check green
without that ruling.

**Each row's finding is derived from its measured first-run outcome, not from its scenario name**: `check.mjs` labels
every row by the rules in its `label()` and prints the count per label; `--findings` lists the rows. The lists below
are that output at the sync commit. If they ever disagree, the `--findings` output is right and this file is stale.

- **D1. A server write between the stash and the pull aborts the pull.** `git pull --rebase` refuses a dirty tree (exit
  128), `set -euo pipefail` stops the script, and every stashed change stays in the stash. Rows: every `*|write:B1|*`
  (12).
- **D2. A server write, or a cron's index lock, between the pull and the pop makes the pop refuse.** Step 4 prints its
  warning and the deploy carries on; every stashed change (not only the clashing file) stays in the stash. Rows (11):
  `clean`, `same-file` and `manifest` with `write:B2` or `lock:B2`; `adds-path|write:B2|untracked:no|lock:none`;
  `adds-path|write:none|untracked:no|lock:B2`. (The other origins never reach step 4 with those injections: their
  pull or rebase stops first, and the row's `injected` field is empty.)
- **D3. When dev and prod both changed a file, the pop leaves conflict markers in the tree, and the next cron tick
  commits and pushes them to `main`.** Rows (2): `same-file|write:none|untracked:*|lock:none`: `F:conflict+stash`,
  `markersOnOrigin: true`. For a `05-publication` page that is reader-visible on the next sync.
- **D4. A failed pull (origin unreachable, a cron's index lock, or a prod-only page where dev added the same path)
  exits non-zero with the changes in the stash, and nothing says where they are.** Rows (13): every `*|lock:B1`;
  `unreachable` with `write:none` or `write:B2` and `lock:none`, and `unreachable|write:none|untracked:no|lock:B2`;
  `adds-path|write:none|untracked:yes|lock:none` and `adds-path|write:B2|untracked:yes|lock:none`. Not
  `unreachable|write:B1` (that is D1: the pull refuses the dirty tree before it fetches) and not `*|lock:B0` (below).
- **D5. A prod commit that never got pushed and conflicts with dev stops the rebase half-way.** Exit 1, the repo
  mid-rebase, the changes stashed; the cron tick then commits on the detached rebase `HEAD` (markers in `HEAD`), and
  the next deploy fails too. Rows (5): `diverged` with `write:none` or `write:B2` and `lock:none`, and
  `diverged|write:none|untracked:no|lock:B2`. The other four `diverged` rows stop earlier, as D1, D4 or before the
  stash.
- **Across all of them: a later deploy never restores an earlier deploy's stash.** Step 2 stashes only a dirty tree and
  step 4 pops only what this run stashed, so every row whose first run left `stash` still shows `stash` after the next
  deploy. In several rows the next deploy itself stops mid-rebase (`same-file|write:B1|*`,
  `adds-path|*|untracked:yes|*`, `diverged|*`, and `same-file|…|lock:B0`): the first failure's cron tick committed
  prod's state, and that commit now conflicts with dev's.
- **No row loses an applied text or a page.** Measured on both runs: every such change is in the tree, `HEAD`, on
  `main` (`branch`) or in a stash, including behind conflict markers (`conflict+stash`, `conflict+branch`); `check.mjs`
  prints the count of rows where one is gone, which is 0. Only the `merge=ours` manifest is dropped, by design. The
  harm is where a change ends up and that nothing says so.

**By design, not a finding:** `manifest` rows show `T:gone`: the `merge=ours` driver keeps the pulled
`translation-errors.json` and drops prod's, as `.gitattributes` intends for that derived file.

**Controls:** label `restored` (5): `clean|write:none|untracked:*|lock:none`, both `manifest|write:none|…|lock:none`
rows (the manifest dropped by design) and `adds-path|write:none|untracked:no|lock:none`, all restored on both runs.
Label `stopped before stashing` (6): every `*|lock:B0`, where step 2 fails on the lock before anything moves, so the
first run is clean; the second is not always: the cron tick commits prod's changes, and where dev changed the same
file (`same-file`, `diverged`) the next deploy stops mid-rebase, the D5 shape reached another way.

**On prod (read-only, 2026-11-23):** 17 stash entries, all untagged "WIP on main" from February to April 2026; none
carries deploy.sh's `deploy-<date>` tag (added with the script on 2026-03-25). So no stash left by the current script
is there now (one could have been dropped by hand): the findings are possible, not observed.

## Does your change touch the verified code?

```sh
git diff --stat ea08576a9 -- scripts/deploy.sh .gitattributes scripts/git-backup.sh scripts/record-deployed-commit.sh
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

Five mutants: BREAK step 4 never pops; BREAK step 2 never stashes; BREAK the `ours` driver is not registered; BREAK
step 4 drops the stash instead of popping it, which must also make the lost-change count non-zero (the control that
the `0` the real script gets is a measurement, not a blind counter); FIX a failed pull puts the stash back before
exiting (D4's row must change). Each must print `seen`.

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

- **Covered:** 54 scenarios, each followed by one cron tick and one more deploy: every origin crossed with every
  server-write and untracked-page value (36), plus every origin with each lock position (18). **A lock is varied only
  on its own** (no server write, no untracked page): the full product of the four dimensions would be 144.
- **Not covered:** a lock combined with a server write or an untracked page; overlap inside a single git command; steps 0, 1, 5–7; the real `git-backup.sh` beyond its
  add/commit/push (its exporter and status file); more than one dev commit or more than three prod files; prod's git
  version (2.43.0, not run).

## Coverage record

**Sync commit: `ea08576a9`.** The check was last confirmed to describe the code below at this commit. Move it forward
only after reading the change and running `check.mjs` and `mutate.mjs`.

| Part                   | Code                                                                                                                                    |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| steps run              | `scripts/deploy.sh` from `# 2. Stash` to `# 5. Install` (stash, `merge.ours.driver`, `pull --rebase`, `record-deployed-commit.sh`, pop) |
| `merge=ours` behaviour | `.gitattributes`                                                                                                                        |
| cron tick              | `scripts/git-backup.sh` `PATHSPECS` (read from the file) and its add/commit/push                                                        |
| server write           | `server/services/pipelineService.js` `runRender` (writes `05-publication`)                                                              |
