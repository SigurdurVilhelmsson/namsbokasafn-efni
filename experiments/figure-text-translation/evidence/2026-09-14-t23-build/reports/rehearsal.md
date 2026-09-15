# Dress rehearsal: §C140 ② ③ ⑨ plan (2026-09-14-c140-t23-scripts-reflow-decimals.md)

The plan does **not** run as written. Two problems stop a literal executor:
- a shell `export` bug that empties `REF` in 13 command blocks;
- a reference test that imports a module the plan installs three tasks later.

With those worked around, everything else reproduced exactly:
- every patch applied and every stage file matched its reference;
- every expected RED/GREEN set matched;
- every real-figure prediction held.

- **Worktree:** `/home/siggi/dev/scratch-c140/rehearsal/wt`, detached. It is kept for you to inspect.
- **Main checkout:** HEAD is still `c053020d` on `feat/c140-t23-scripts-reflow-decimals`, and `git status --porcelain` is empty.

## Commits made in the worktree (`git log --oneline c053020d..HEAD`)
```
ef62ceeb docs(figures): §C140 ② ③ ⑨ verified on the 34 bought figures at 0 ISK   (REHEARSAL note)
d1480ca7 feat(figures): COMPOSER_VERSION 3 — every committed figure recomposes
5ee8c531 feat(figures): the composer's notes reach the driver as NOTE lines (§C140, spec commit 5)
18a1e55a feat(figures): ③ translated labels laid out against their own box, cell or open space (§C140, spec commit 4)
4e61e0a5 feat(figures): ⑨ English-kept numbers drawn with Icelandic separators (§C140, spec commit 3)
8e42f214 feat(figures): ② translated labels keep their formula formatting (§C140, spec commit 2)
f7ed5b3e test(figures): §C140 end-to-end harness and goldens from the unchanged composer
667ea4d6 feat(figures): collapse cairo's blend-chain lerp so exocytosis loads (§C140, spec commit 1)
```

## Substitutions in the rehearsal plan copy
- **Files:** the copy is `/home/siggi/dev/scratch-c140/rehearsal/plan.md`; the diff is `/home/siggi/dev/scratch-c140/rehearsal/subst.diff` (68 lines).
- **Repo path:** `/home/siggi/dev/repos/namsbokasafn-efni` → `/home/siggi/dev/scratch-c140/rehearsal/wt`, everywhere.
- **Scratch path:** `SCRATCH=/home/siggi/dev/scratch-c140/build` → `SCRATCH=/home/siggi/dev/scratch-c140/rehearsal/build`.
- **Task 9 Step 1:** three substitutions, each asserted to occur exactly once:
  - the tag `reproduce.sh "$SCRATCH/t9/repo-exp" REPO` → `REHEARSAL`;
  - `analysis-final-REPO.json'))['per_tag']['REPO']` → `analysis-final-REHEARSAL.json'))['per_tag']['REHEARSAL']`. The `per_tag` key is on the same line and must equal the tag, or the step raises KeyError.
  - `{P}/work/REPO/` → `{P}/work/REHEARSAL/`.
- **One setup addition:** I copied the gitignored `.husky/_` into the worktree. Without it `core.hooksPath=.husky/_` points at nothing and no hook runs. lint-staged did run on the Task 5 and Task 7 commits, and neither changed any bytes.

## Blocking deviations

### 1. `export EXP=… REF=$EXP/…` on one line leaves REF empty (13 blocks)
- **Cause:** bash expands every argument before `export` assigns anything. Proved with `export A=1 B=$A` → `B=[]`.
- **What happened literally (Task 2 Step 1):**
  - `cp: cannot stat '/evidence/2026-09-14-t23-build/reference/1-svgfix/test_svgfix.py'`
  - the stub `svgfix.py` was still written;
  - then `python3: can't open file …test_svgfix.py`.
- **Affected plan lines:** 173, 189, 210, 260, 276, 339, 355, 424, 451, 498, 514, 563, 574. Line 72 is safe, because `EXP` is exported on line 71.
- **Fix:** replace `export EXP=<path> REF=$EXP/evidence/2026-09-14-t23-build/reference[ SCRATCH=…]` with `export EXP=<path>; export REF=$EXP/evidence/2026-09-14-t23-build/reference[ SCRATCH=…]`.
- **Also worth adding** to Global Constraints (line 19): never write `export A=… B=$A` on one line.
- **After the split,** every affected step matched its expected output exactly.

### 2. `REF/2-harness/test_figcontainers.py:230` imports `figlayout`, which the plan installs in Task 6
This is in a reference file. There is a plan-only fix, but the choice is the controller's.

**Effects, step by step:**
- **Task 3 Step 1:** the last line is `ModuleNotFoundError: No module named 'figlayout'` instead of `ALL PASS`. Lines 230–428 (section `9b. [F7]` onward) never run. The mutation run prints the two expected FAIL lines and then the same traceback. Under Global Constraint 28 a literal executor stops here.
- **Task 3 Step 4:** the compare prints `NEW FILE test_figcontainers.py: rc=1 fails=[] last='== 9b. [F7] …'` instead of `rc=0`.
- **Tasks 4 and 5, Step 4:** an extra compare line, `test_figcontainers.py: NEWLY RED [] NEWLY GREEN [] rc 1->1 CRASHED (no FAIL lines)`.
- **Task 6 Step 3:** an extra compare line, `test_figcontainers.py: … rc 1->0`.
- **Commits:** the commits for Tasks 3, 4 and 5 all carry the crashing test.

**Evidence that only the install order is wrong:** at the Task 3 state, with `PYTHONPATH=$REF/5-reflow` and the tree unchanged:
- the test gives `ALL PASS` (81 PASS);
- the SPAN mutation gives exactly `2 FAILED: bracketing, non-spanning rules -> open, ... and the why names the refusal`.

**Plan-only fix:**
- **Task 3 Step 1:** add `"$REF/5-reflow/figlayout.py"` to the `cp` line.
- **Task 3 Files and the ⚠️ note:** list `figlayout.py`, with the reason: `test_figcontainers.py` §9b imports it, and `compose.py` does not import it until Task 6.
- **Task 3 `git add`:** add `figlayout.py`.
- **Task 6 Step 1:** use `cmp figlayout.py "$REF/5-reflow/figlayout.py" && cp "$REF/5-reflow/test_figlayout.py" .`.
- **Task 6 `git add`:** drop `figlayout.py`.
- **File Structure row:** change the task for `figlayout.py` accordingly.

`figlayout.py` imports nothing local, and the unchanged composer does not import it, so this changes nothing else. The alternative is to guard §9b in the reference file, which means updating `MANIFEST.sha256`.

## Smaller plan-text deviations
- **Task 9 Step 1:** `| tail -8` shows only the last of the five `byte-identical to frozen` controls, and it cuts `sentinels --control on V5: fires 3 of 3; clean fires: 0`. `reproduce.sh` prints 14 lines.
  - Fix: `| tail -14`.
  - I re-checked all five cmp controls by hand: identical, V5 fires 3 of 3, clean fires 0.
- **Task 10 Step 2:** the ch03 output is 32 lines, so `| tail -30` cuts `efnafraedi-2e ch03: 15 figure(s) across 5 module(s)`.
  - Fix: `tail -40`.
  - Steps 2, 3 and 5 also set no `TMPDIR`. `figure-run.js` calls `mkdtemp` under `os.tmpdir()`, which is the /tmp tmpfs. Prefix `TMPDIR=/home/siggi/dev/scratch-c140/build/tmp` as a literal path — `TMPDIR=$SCRATCH/tmp` on the same export line would reintroduce bug 1.
- **Full vitest steps have no tool-timeout note** (Task 1 Step 4, Task 7 Step 3, Task 8 Step 2, Task 10 Step 7). A full run measured 7m02s; the Bash default timeout is 120 s. Add `(tool timeout 600000)` or tell the executor to run them detached.
- **Task 9 Steps 2 and 4, "Run:" lines:** they never set `SCRATCH`. `carriers.py` also imports `svgfix` and `PIL` in-process with no `PYTHONDONTWRITEBYTECODE`, so bytecode would land in EXP and in the symlinked `pylibs`. Prefix `export SCRATCH=/home/siggi/dev/scratch-c140/build PYTHONDONTWRITEBYTECODE=1;`.
- **Task 9 Step 4, HybrdOrbit load:** "load_after below load_before" held by only 65 ms (852 → 787). The spike measured 8.6 s → 1.3 s. A single-shot comparison that close is noise. Make it a gate for IcePack only (4130 → 590) and record HybrdOrbit's pair.
- **Task 5 Step 2, planted-disagreement RED:** the plan gives no command. The copy must sit in `tools/__tests__/` so that `../lib/figure-consistency.cjs` resolves. A copy anywhere else fails to load, which looks like a RED but is not the one being asked for. Rehearsed with `tools/__tests__/zz-parity-plant.test.js` → `Tests  1 failed | 2 passed (3)`, then deleted.

## Controller issues (reference and evidence files, not plan-only)
- **Vitest collects the reference copy of the parity test.** `REF/4-numloc/figure-consistency-parity.test.js` fails to load in every full vitest run (`Cannot find module '../lib/figure-consistency.cjs'`).
  - It is the 14th file in the plan's "36 failing in 14 files".
  - It has no assertion results, so the by-name snippet can never report it, and it is invisible to every JS check in the plan.
  - It is already present at BASE on the real branch, so merging adds a suite that fails to load to `npm test` and the CI Tests job.
  - Options: rename it under REF (which changes the MANIFEST), or add `**/evidence/**` to the `vitest.config.js` exclude list (a code change outside the plan).
  - Either way, add a suites-that-fail-to-load list to the by-name snippet.
- **Blocker 2 above** is also in a reference file.

## Results that reproduced (summary)
- **Task 1:** manifest 29/29 OK. Python baseline: 12 files, all ALL PASS (58 s). JS baseline: `36 failing; 6480 tests`.
- **End-to-end RED sets:** 23 → 17 → 15 → none, each a MATCH by id. The golden equals the reference byte for byte.
- **Named mutations:** each produced exactly the planned FAIL lines, and every file was restored and cmp-checked.
  - svgfix 1b/1c/1d;
  - figscripts S3b;
  - numloc 13 FAILED;
  - figlayout 9 FAILED.
- **Wrapper and driver:** figure-compose 4g/4h/4i RED then GREEN. Task 7: Python 2h/11a/11b/11d; JS 14 of 15 new cases RED.
- **JS after Task 7:** 6498 tests (6480 + 18), no newly red or newly green names.
- **Task 8:** 2 newly red / 7 newly green, all in `figure-run-free.test.js`. I checked this by file and mechanism, not test by test: those tests run over the real ch04 corpus and read the committed sidecars, so `isStale` sees version 2 ≠ 3.
- **Task 9 Step 1:** `REHEARSAL rank (4, 4, 7, 7, 6.0, 0)`, `analysis per_tag REPO == FINAL: True`, 0 figures whose `items.json` or `compose-report.json` differ.
- **Task 9 Step 2:** `svg identical 31 | blocks identical 34 | changed {exocytosis 155, HClsoln 2, sandwich 52} | refcost warnings 0`.
- **Task 9 Step 3:** exocytosis after: `loadMs 2752, complete true, naturalW 576`. Before: `loadMs null` with a 30 s load timeout. No Chromium survivors.
- **Task 9 Step 4:**

| figure | collapsed | unmatched | reference cost (log2) | load ms | pixels |
|---|---|---|---|---|---|
| IcePack | 129 | 2 | 133.1 → 10.2 | 4130 → 590 | identical |
| HybrdOrbit | 74 | 0 | 84.5 → 13.8 | 852 → 787 | identical |

- **Task 10 Step 1:** `state-grep exit=1`, `34`. origin/main moved `adac26ab..faf160dc`; the change is docs only, but it includes the campaign register file.
- **Task 10 Step 2:** ch03 15 / 26 / 15 translated / 15 enumerated / VERDICT ok. ch04 19 / 11 / 19 / 19 / VERDICT ok.

## Disclosures
- **Worktree status:** always shows three `??` symlink lines, because the directory-only ignore patterns do not match symlinks.
- **Failing-test names:** in `js-failing-by-name.txt` they are absolute worktree paths. They are consistent across runs, so the by-name compares still work.
- **Writes into main through the symlink:** vitest wrote the gitignored `node_modules/.vite/vitest/…/results.json` and `node_modules/.vite-temp` in the main checkout. No tracked file changed.
- **Writes to shared scratch:** `reproduce.sh` wrote `inst-REHEARSAL`, `work/REHEARSAL`, `out/*-REHEARSAL*` and `logs/*REHEARSAL*` into `plan/pred2`. It also rewrote the control outputs with identical bytes and forces `TMPDIR` to `pred2/tmp`. The FINAL outputs were not touched.
- **Task 8:** the `.cjs` file fails `prettier --check` both before and after the bump. That is pre-existing, and the file is outside the format-check and lint-staged globs.
- **Durations:**
  - Python suite: ~1 min.
  - Full vitest: 7 min.
  - Task 9 Step 1 (reproduce): 74 s.
  - Task 9 Step 2 (artwork34): 90 s.
  - Task 9 Step 3 (exocytosis): 47 s.
  - Task 9 Step 4 (carriers): 51 s.
  - Task 10 Step 2, both dry runs: 93 s.
- **Logs:** everything is under `/home/siggi/dev/scratch-c140/rehearsal/build/` — `t*s*.log`, `t3-e2e.out` … `t6-e2e.out`, `t7-js.json`, `t8-js.json`, `t8-delta.txt`, `t9/artwork34.json`, `t9/carriers.log`, `t10-dry-ch0{3,4}.log`.
