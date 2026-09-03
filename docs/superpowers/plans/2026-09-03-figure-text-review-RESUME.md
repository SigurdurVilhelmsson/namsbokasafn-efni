# RESUME — figure-text review workflow, SDD run

> **Written 2026-09-03 because the controlling session ran out of context.** This file is
> COMMITTED on purpose: the SDD workspace it summarises (`.superpowers/`) is gitignored
> (`.gitignore:104`), so the ledger, briefs and reports exist only on one disk and do not
> travel with the branch. If they are gone, everything you need is here plus `git log`.

## Where the work is

| | |
|---|---|
| worktree | `.worktrees/feat-figure-text-review` (isolated; another session works in the main tree) |
| branch | `feat/figure-text-review` @ **`3f77d48f`** |
| position | **14 ahead / 24 behind `main`** (`main` = `7e42bf0c`, after PR #431 merged) |
| plan | `docs/superpowers/plans/2026-09-02-figure-text-review-workflow.md` |
| spec | `docs/superpowers/specs/2026-09-02-figure-text-review-workflow-design.md` |
| ledger (gitignored) | `.superpowers/sdd/2026-09-02-figure-text-review-workflow/progress.md` — 382 lines, 8 briefs, 6 reports |

**Working tree is clean. All code is committed. Nothing is in flight; every subagent was stopped.**

## Status: 6 of 8 tasks complete

| # | task | commit | review |
|---|---|---|---|
| 1 | sidecar format (`tools/lib/figure-text-sidecar.cjs`) | `1b30bf57` | ✅ clean |
| 2 | composer accepts string block values (`figtext.py`) | `e0377e42` | ✅ clean |
| 3 | render emits `data-figure-review` (`cnxml-render.js`) | `54e87e31` | ✅ after 1 fix round (Critical) |
| 4 | migration 050, two tables | `da8fa41b` | ✅ **zero findings** |
| 5 | `figureReviewService` | `3c789e52` | ✅ after 1 fix round (2 Important) |
| 6 | advisory consistency checks | `3f77d48f` | fix done; **scoped re-review was cut off** |
| 7 | editor endpoints | — | briefed, not started |
| 8 | editor figure card | — | briefed, not started |

## NEXT ACTIONS, in order

1. **Re-run Task 6's scoped re-review** (it was dispatched and stopped mid-flight). Diff:
   `review-dbeef93d..3f77d48f.diff`. The three questions worth asking are in the ledger; the
   substance is: (a) is the new test a control or only a regression guard — the implementer's
   own report says it already passed pre-fix, so it is the latter; (b) does any Icelandic
   character lowercase to a *different length*, which would break `nearVariant`'s equal-length
   precondition (German `ß`→`SS` is the class); (c) did lowercasing WIDEN what fires?
2. **Task 7** — editor endpoints. Route research is done, use it verbatim:
   - router mounts at `/api/segment-editor` (`server/index.js:248`)
   - `GET '/:book/:chapter/:moduleId'` → `requireAuth, requireRole(ROLES.EDITOR), validateBookChapter` (line 259) — mirror for `.../figures`
   - `POST '/:book/:chapter/:moduleId/edit'` → `requireAuth, validateBookChapter, requireBookAccess()` (line 333) — mirror for the two writes
   - `buildFigurePayload` goes in **`figureReviewService`**, NOT the router: `segment-editor.js`
     ends in `module.exports = router`, so exporting from there hangs a property off an Express
     router and forces a unit test to load its auth middleware.
3. **Task 8** — editor figure card. ⚠️ Unsettled: `server/e2e/playwright.config.js` has **no
   `webServer` key**, so the e2e spec may need a server started separately. Settle that before
   dispatching.
4. **Rebase onto `main`** (ruling M) — at the task boundary AFTER Task 8, before the final
   review, so the final review sees the merged state. `git merge-tree` was clean pre-merge.
5. **Final whole-branch review** on the most capable model, per the SDD skill.

## HOW TO READ THE FINAL FULL-SUITE RUN — this will mislead you otherwise

`main` is **deliberately red**, [USER]-accepted: **19 failing assertions across 10 files**
(15 REGRESSION + 2 BLOCKED + 2 QUIET), plus `findTermsGolden.test.js` as an 11th red FILE with
**no failing assertion** — it dies in `beforeAll` with `Hook timed out in 10000ms`.

- **Diff against that set BY TEST NAME, never the count.** This branch adds ~7 test files, so
  totals must move.
- ⚠️ **Strip vitest's per-run `NNms` suffix off each `×` line before diffing sets** — the other
  session got **18 false positives** without it.
- ⚠️ A renamed test reads as one-cleared-plus-one-new, indistinguishable from a real swap.
- `findTermsGolden` is **not ours and not /tmp**. Reproduced here on a pristine TMPDIR with
  894 GB free, with a control: sibling `findTermsTie.test.js` uses the same `freshMigratedDb`
  in `beforeAll` and passes. `server/` is byte-identical to `main`. Cause undiagnosed, logged as
  register ㉑. **Do not spend a diagnosis round on it.**

## OPERATIONAL TRAPS — each cost real time in this run

🔴 **`export TMPDIR=/home/siggi/.cache/figtext-tmp` before ANY test run. NEVER point TMPDIR
inside a git worktree.** `scripts/__tests__/git-backup.test.mjs:78` does
`mkdtempSync(path.join(tmpdir(),'gitbackup-'))` and drives `scripts/git-backup.sh`, which runs
`git add`/`git commit` relative to its own cwd. It committed 11 fixture files onto this branch
as `1a691748`, wearing the production cron's own `auto-backup: <ts>` message — which is why it
read as normal in a log.

⚠️ **`grep` is silenced by the very bytes it looks for.** A NUL-bearing file is treated as
binary and its matches suppressed, so `grep -lUP '\x00'` returns NOTHING. `-a` is as
load-bearing as `-P`. Verified: same file, one flag apart, `grep -lUP` → '' and `grep -laUP` →
the filename.

⚠️ **Agent stall vs fast agent — decide by comparison, not a stopwatch.** Task 4 produced its
test in ~2 min; Task 5's implementer wrote nothing in 13 min and was killed and re-dispatched
on a stronger model (finished in ~6). Before killing, check for half-finished work over the
worktree AND the TMPDIR — killing without that discards it.

🔴 **THE COMMAND THIS FILE USED TO PRESCRIBE FOR THAT CHECK DOES NOT WORK ON THIS MACHINE, AND
IT FAILS SILENTLY INTO A CONFIDENT EMPTY LIST.** It said to run
`find . -newermt '-N minutes' -type f`. **`find` here is `bfs`**, which accepts only ISO-8601
timestamps and rejects a relative one:
`bfs: error: Invalid timestamp.` Paired with the `2>/dev/null` anyone adds to silence
permission noise, the error vanishes and the command prints **nothing** — indistinguishable
from "the agent has written nothing". Measured 2026-09-03: it reported an empty set for a
window in which the controller itself had just written four files.
▶ **Use an absolute timestamp, and pair every null with a positive control in the same
command:**

```bash
find . /home/siggi/.cache/figtext-tmp -path ./node_modules -prune -o \
     -newermt "$(date -d '30 minutes ago' '+%Y-%m-%dT%H:%M:%S')" -type f -print
```

The control is free here: your own ledger writes must appear in the output. **If they do not,
you are reading a broken instrument, not an idle agent.** ⚠️ And do NOT redirect stderr on a
detector whose whole job is to report an absence.

⚠️ **A stopped agent emits queued notifications describing a tree state that no longer exists.**
Happened three times. Verify against `git`, never against the notification.

## RULINGS MADE ON THE USER'S BEHALF

| | ruling | cost if wrong |
|---|---|---|
| A | sidecar API takes the BOOK dir (`books/<slug>`), not (booksRoot, slug) — `BOOKS_DIR_ROOT` does not exist and `BOOKS_DIR` already is `books/<slug>` | signature churn across tasks 1/3/5, caught by their tests |
| B | `figureReviewAttr` joins the existing single `export { … }` block (~line 4242); the file has zero inline `export` keywords | none |
| C | `BOOKS_DIR` being cwd-relative is NOT fixed here — pre-existing and file-wide | the sidecar read inherits an existing cwd assumption; no new exposure |
| D | 2 literal NUL bytes I wrote into the plan replaced with the `\0` escape | none; runtime intent unchanged |
| E | do NOT push the NUL fix to the shared branch — a push to a shared branch is the user's call | resolved: the other session escaped them on its branch, `c582cc7d` |
| F | Task 2's test rewritten — as planned it shelled out to `compose.py`, which loads pipeline artifacts absent from a clean checkout, so it could never pass | a pure function in a different file than planned; identical behaviour asserted |
| G | TMPDIR moved out of the worktree; `.tmp-install/` gitignored; the 11 test-committed files removed from the index. NOT rebased away — that would rewrite SHAs the ledger uses as its recovery map | 11 one-line fixture files stay in this branch's history |
| H | Task 3's commit trailers amended to this session's; tree verified unchanged by the amend | attribution names the controlling session, not the sonnet subagent that typed it |
| I | no sidecar must emit NOTHING — guard at the call site, not a change to `effectiveState` | if a caller later needs "no sidecar" distinguished from "unapproved", it wants a distinct return value instead |
| J | Task 5's stalled haiku killed and re-dispatched fresh on sonnet, not resumed | one wasted dispatch |
| K | accepted the implementer's fixture deviation — my brief hardcoded slug `efnafraedi-2e`, which migration 049 line 72 pre-seeds | none; no service function reads `registered_books.slug` |
| L | orphaned edits dropped from blocks but REPORTED as `orphans`; `applyApprovedFigureEdits` writes `effectiveState`, never the raw column | a since-changed correction becomes visible instead of riding along invisibly |
| M | do NOT rebase mid-run; rebase after Task 8, before the final review | the final review would run against a base 24 commits old |
| N | fix the case-normalisation Important now; defer every decimal Minor | case-insensitive matching could mask a divergence that is ONLY a case difference (`PH` vs `pH`) — judged acceptable against a systematic false positive on every sentence-initial caption word |

## THE PATTERN WORTH CARRYING

**Every defect found in this run was in the plan, not in the implementers' work.** Five caught
by pre-dispatch checks against real code, four more by implementers and reviewers. The agents
transcribed faithfully throughout; the errors were in what they were told to build.

⚠️ **And the controller's own ad-hoc checks were the least reliable instrument in the loop** —
seven false negatives (a dropped `grep -a`, a backtick inside a needle, two shell-quoted counts,
two exact-string constraint greps, and a probe that never rendered anything). Zero false results
came from the agents' committed test runs. **A test is written, run red, and only then trusted;
a probe is written and trusted in one step.** When a check disagrees with a competent agent's
report, suspect the check first.

## OPEN QUESTIONS FOR THE USER

- Nothing blocking. The NUL question (ruling E) is closed — the other session escaped them.
- Not yet done and worth knowing: **no real MT has been run through this workflow.** The only
  paid run was the 1.20 ISK `CNX_Chem_01_06_TempScales` figure, before this SDD run began.
