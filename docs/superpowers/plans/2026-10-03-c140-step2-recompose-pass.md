# §C140 step 2, PR-B: the data commits, the '4' → '5' bump and the single recompose pass — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans, **inline, in ONE session.** Do not hand
> Task B-4 to parallel subagents: every chapter run writes the same `books/efnafraedi-2e/media/` and
> `figure-text/` trees, and two agents on one tree is how this repo once committed a mutant. Steps use checkbox
> (`- [ ]`) syntax for tracking.

**Goal:** after PR-A's code is on `main`, make the three ruled data changes (the `keptCopies` restore, the HetCats and
Graphene sidecar values, the `heldBlockValues` values), bump `COMPOSER_VERSION` from '4' to '5', and run the single
0-ISK `figure-run.js --stale` recompose over all 22 chapter runs of chemistry; then prove by value, by census and
by eye that no published copy got worse, and merge it as one PR whose deploy reopens figure review.

**Architecture:** one branch, `content/c140-c49-recompose-pass`, cut from `main` after PR-A merged. Data commits
first (B-1 to B-3), then the source-artwork ring anchors (B-7a) and the bump (B-bump), then one commit per chapter
run (B-4), then a census written as real code (B-5), the post-pass re-pin (B-7b), the three-engine sweep and the
by-eye sample (B-6), and the PR, the prod checks and the deploy (B-8). Every figure-run invocation goes through one
helper script that hard-codes `--stale`; every chapter's dry and live summary is checked by a second script against
a per-chapter prediction measured from the tree. Off-repo working area: `/home/siggi/.cache/namsbokasafn-audit/c140-step2-pass/`
(`$PASS`), on disk, never committed.

**Tech Stack:** Node ESM (`tools/figure-run.js`, `tools/lib/figure-text-sidecar.cjs`, Vitest), Python 3 (the
composer under `experiments/figure-text-translation/`, its `check()` suites printing `ALL PASS`, run with
`FIGTEXT_PYLIBS=./pylibs`), Playwright 1.63 (Chromium 1243, Firefox 1543, WebKit 2359 under `~/.cache/ms-playwright/`),
`gh`, `ssh` (read-only prod checks).

**Spec and inputs:**
- Design: [`docs/superpowers/specs/2026-10-02-c140-step2-recompose-pass-design.md`](../specs/2026-10-02-c140-step2-recompose-pass-design.md)
  (its Approval line is [USER]'s rulings of 2026-10-02; group (B) of its decision sheet is the operational defaults
  this plan follows; "Predicted delta" and "Known limits" are what B-5 and B-6 check).
- PR-A's plan: [`docs/superpowers/plans/2026-10-03-c140-step2-code-fixes.md`](2026-10-03-c140-step2-code-fixes.md),
  § "Handoff to PR-B" items 0–6 (BINDING), Part 2's "Carries into PR-B", and Part 5's header (the four [USER]
  items, **ruled 2026-10-03**: refuse; fatal per figure; buffer checked by eye in PR-B; transcription confirmed).
- Part 5 design: [`docs/superpowers/specs/2026-10-03-c140-step2-part5-heldblockvalues-design.md`](../specs/2026-10-03-c140-step2-part5-heldblockvalues-design.md)
  (D-b line encoding, D-d report and verify contract, D-h limits, D-j predicted delta, "PR-B handoff: transcription rules").
- Value sheet, filled by [USER] 2026-10-03: [`docs/handoffs/2026-10-03-step2-value-sheet.md`](../../handoffs/2026-10-03-step2-value-sheet.md).
- Open-work row: campaign register §C140 ㊾ (`docs/plans/2026-07-21-post-item17-followup-campaign.md`).

## ⚠️ State of this plan (read first)

- **Written 2026-10-03, read-only, against the post-PR-A-Parts-1–4 scratch tree** (`scratch/c140s2-int` at
  `29d3b27d8`, worktree `~/.cache/namsbokasafn-audit/2026-10-03-step2/wt-int`) and the main checkout at `3d9b5d2e5`.
  **PR-A Part 5 (`heldBlockValues`) is in no tree yet.** Its interfaces here come from its frozen design; Task B-0
  pins every one of them on the merged `main` before anything depends on it, and stops if one differs.
- **Three tasks were drafted on 2026-10-03 and never verified** (their verifiers died at a usage limit): B-7a,
  B-bump and B-7b. Each was re-verified for this plan: every quoted anchor was found exactly once at the line the
  draft named, the precondition grep and the files that read `COMPOSER_VERSION` were re-listed, and the shell
  fingerprint was re-measured (8 shells, the same 8 names). On scratch copies of the post-PR-A tree: B-7a's edits
  applied cleanly and its red arm (only brain fails) and green arm (all six pass, 24.6 s) ran; B-bump's replacement
  loads as `COMPOSER_VERSION` '5'; B-7b's patch replaces 73 lines with 91 and compiles. One draft error was found and
  fixed (B-7a prints six `ok` lines, not nine). The fixes folded in are listed under each task.
- **The data scripts were run on scratch copies too:** B-1's two patches (its three reasons pass the real validator,
  `problems []`, while a 9-character reason is refused) and B-3's table writer (every key found in the prepared
  `blocks.json` with the predicted multiplicity).
- **The helper scripts are real code and were exercised read-only** in scratch copies: `check-run.mjs` against a
  committed ch02 dry-run summary (pass) and a wrong prediction (fail, exit 1); `predict.mjs` on today's tree (every
  chapter matches except exactly the three B-1 changes); `heldcheck.py` on today's media (21 failures, every one the
  old English inside its window, the nobelium control clean); `census.py` on the unpassed tree (every check that
  should fire fired); `env-probe.mjs` on a tree with no `.env` (REFUSED) and with a dummy key (CLIENT CREATED);
  `edit-sidecar-values.mjs` dry (the predicted hashes below); `verify-stale.mjs` before the edit (fails, as it must);
  `triptych.mjs` on two figures in both engines (it shows ⑭'s transparent Firefox artwork on today's PerTable2,
  a positive control).
- **Nothing in this plan has been executed.** Every number marked *predicted* is checked in its step. **A mismatch
  stops the work: re-derive the cause, never adapt the expectation to the output.**

## Global Constraints

- **Branch and merge.** `content/c140-c49-recompose-pass`, cut from `origin/main` after PR-A merged. One PR, merged
  as a **merge commit, never a squash** (the register cites individual SHAs; spec D8: the bump, the restamped
  sidecars, the media and the re-pinned anchors merge together).
- **0 ISK, by construction and by belt.** `tools/figure-run.js` runs ONLY through `$PASS/bin/run-chapter.sh`, which
  hard-codes `--stale` (live) or `--stale --dry-run` — **except B-1 Step 8's four calls, each written out there with
  `--dry-run`** (one of them deliberately WITHOUT `--stale`: the autorun's plain mode, to prove it offers nothing to buy). **Never a plain live run, never `--force`, never
  `scripts/chemistry-autorun-chapter.sh`** (it runs the driver without `--stale`), never `translate-blocks.mjs`.
  The repo `.env` is moved OUT of the repo into `$PASS/env.aside` for the whole pass (B-0) and restored in B-8, and
  a probe proves a would-be buy fails closed. Exporting an empty key does not work: `translate-blocks.mjs` fills in
  any variable `process.env` lacks from `.env`.
- **Ordering (each is a gate):**
  1. A figure's `keptCopies` entry lands in the same commit as its June restore and sidecar deletion (B-1), never
     after (PR-A Handoff item 0: otherwise a plain run buys the sidecar-less PerTable2 over the June copy).
  2. The HetCats/Graphene values (B-2) and the `heldBlockValues` values (B-3) are final **before** B-bump. A value
     hashed under '5' with `composerVersion` left at '4' loops for ever (spec D4), and a held value changed after a
     sidecar figure is stamped '5' never reaches its media until the next bump (Part 5 design D-h 1).
  3. **No LIVE figure-run between B-1 and B-bump.** After B-2, HetCats and Graphene are stale under '4'; a live
     `--stale` then would recompose them under '4' with the new composer. Dry runs are fine.
  4. B-7a lands before B-bump; the pre-flight suites pass ONCE before ch01's first live run (B-4 Step 1), not per chapter.
  5. The read-only prod checks (0 dirty sidecars, 0 `figure_review` rows) pass before the deploy that carries '5'
     (`server/services/figureReviewService.js` imports the constant). Figure review reopens only after that deploy.
- **Shell state does not persist between tool calls.** Every command block starts with
  `source /home/siggi/.cache/namsbokasafn-audit/c140-step2-pass/bin/env.sh` (created in B-0 Step 2), which exports
  `PASS`, `TMPDIR=$PASS/tmp` (on disk: `/tmp` is a 4.9 GB tmpfs that was 83% full on 2026-10-03), `REPO`, `EXP`,
  `PYTHONDONTWRITEBYTECODE=1`, and `cd`s to the repo root. Blocks before B-0 Step 2 write the paths out in full.
- **Memory and disk.** `free -h` before every figure-run and every suite: **stop below 2 GiB available** (below
  3 GiB before ch10, ch11 and ch12, whose sources include the 105.6 MB HetCats EPS and the 44.2 MB osmosis and
  38.3 MB KMTPhases1 EPS). `df -h /tmp $PASS` too. Never two figure-runs at once.
- **No Icelandic is authored.** Icelandic in this plan is either [USER]'s value, quoted from the filled value
  sheet and labelled so, or evidence quoted from a committed file. No step proposes, corrects or completes a value.
- **Read-only trees:** `books/*/01-source/` and `books/*/02-mt-output/` are never written. The pass writes only
  `books/efnafraedi-2e/media/*_IS.svg` and one line per sidecar.
- **Restores.** A file is restored with `git show <rev>:<path> > <path>`, never `git checkout --` or `git stash`
  (CLAUDE.md: both have destroyed uncommitted work here).
- **Commits.** Every heredoc stops at the message body: append the executing session's attribution trailers
  (`Co-Authored-By: …`, `Claude-Session: …`) after a blank line before `EOF`. Before any commit that stages a
  `tools/**/*.js` file (B-1, B-3), `git status --porcelain` must show only that commit's files: lint-staged stashes
  unstaged tracked changes. `books/` files, `.cjs`, `.py` and `.json` are outside lint-staged's globs.
- **Python suites** run in no CI job (register ㊷②): `( cd "$EXP" && FIGTEXT_PYLIBS=./pylibs python3 -B -u <file> )`,
  judged by the terminal `ALL PASS` line, never by an exit code alone. Vitest by file name
  (`npx vitest run <file>`); the full suite only where a step says so, its failing SET diffed by name.
- **Logs are files, not pipes.** Redirect to a file and `echo "EXIT=$?"`; never judge a run through `| tail`
  (a pipe reports the last command's exit code).

## Review Focus

1. **Money.** Every figure-run call goes through `run-chapter.sh` (which cannot omit `--stale`); `.env` is out of
   the repo; the probe's two arms (REFUSED without a key, CLIENT CREATED with a dummy) prove the probe can tell.
2. **The keep order (B-1).** Entry, restore and sidecar `git rm` in one commit; `sources.py --json` shows `kept`
   before the `git rm`; a PLAIN `--dry-run` on PerTable2 (the autorun's mode) offers nothing to buy.
3. **The value edits (B-2).** Values only, keys and `mtAlternatives` untouched, `renderHash` under each sidecar's own
   `composerVersion` '4'; the loop control in `verify-stale.mjs` proves the detector can see the bad hash.
4. **Transcription by value (B-3).** B1's letter O (U+004F), U+2013 charges, `'\n'` between lines, no `'|'` in a
   value, C1–C3 absent; the 8-figure A/B before the commit, with its positive control (the empty arm draws the English).
5. **The census is keyed on geometry, not prose** (`heldcheck.py`: items inside a window at the predicted baseline),
   and carries its controls: the nobelium figures, the ICE pair's byte identity, the shell set predicted from the
   pre-pass tree, PerTable2's sha256.
6. **The ring gate's browser (B-4 Step 2).** brain-ec0b is the one figure whose published bytes depend on it; the
   fallback is written out, and once taken it holds for every later run.
7. **The June-better class is OPEN** (spec): B-6's sample looks for more, and any "worse" or "unsure" stops the merge.
8. **Merge shape and prod.** Merge commit; the prod checks before the deploy; figure review reopens after it.

## Off-repo working area (`$PASS`, created in B-0)

| Path | What | Written by |
|---|---|---|
| `bin/env.sh` | the shell preamble every block sources | B-0 Step 2 |
| `bin/env-probe.mjs` | would a buy reach the API? | B-0 Step 4 |
| `env.aside` | the repo's `.env`, moved out for the pass | B-0 Step 4, restored B-8 Step 1 |
| `base.sha` | `origin/main` at the branch cut | B-0 Step 3 |
| `logs/` | every run's log (`ch<N>.<dry|live>[.<tag>].txt`, each ending `EXIT=<code>`) | all |
| `bin/edit-sidecar-values.mjs`, `bin/verify-stale.mjs` | the D4 value edit and its check | B-2 |
| `bin/heldcheck.py`, `held/` | the held labels by value and position; B-3's A/B | B-3 |
| `c38/` | B-7a/B-bump/B-7b scratch (probes, suite JSON) | B-7a, B-bump, B-7b |
| `bin/predict.mjs`, `predict.json`, `bin/check-run.mjs`, `bin/run-chapter.sh`, `bin/prepass.py`, `prepass-media.json` | the pass's predictions, checker, runner, pre-pass snapshot | B-4 Step 0 |
| `bin/census.py`, `census.json` | the census | B-5 |
| `sweep/`, `eye/`, `bin/triptych.mjs` | the three-engine sweep; the by-eye renders and `eye/verdicts.tsv` | B-3, B-6 |
| `bin/gen-resume.py`, `pr.number` | the register text, from the records | B-8 |

---

### Task B-0: Preconditions — PR-A merged, the branch, the working area, `.env` aside, the box

**Files:** none in the repo. Creates `$PASS/` (off-repo).

**Interfaces:**
- Consumes: PR-A's merged code (all five parts) on `origin/main`; `tools/api-translate.js` `loadEnvFile(path)`;
  `tools/lib/malstadur-api.js` `createClient()` (throws `Málstaður API key required…` when no key; sends nothing on
  construction); `tools/figure-run.js` `isStale`; `tools/lib/figure-text-sidecar.cjs` `readSidecar`, `COMPOSER_VERSION`.
- Produces: branch `content/c140-c49-recompose-pass`; `$PASS/bin/env.sh`, `$PASS/bin/env-probe.mjs`,
  `$PASS/base.sha`, `$PASS/env.aside`, `$PASS/part5-strings.txt`, `$PASS/logs/`.

- [ ] **Step 1: PR-A is merged, as a merge commit, with all five parts.**

```bash
cd /home/siggi/dev/repos/namsbokasafn-efni && git fetch origin && git status --porcelain && echo "porcelain-end"
M=$(gh pr list --head feat/c140-c49-step2-code-fixes --state merged --json mergeCommit --jq '.[0].mergeCommit.oid')
echo "PR-A merge commit: $M"; git rev-list --parents -n 1 "$M" | wc -w
git merge-base --is-ancestor "$M" origin/main && echo "in origin/main"
for spec in \
  'experiments/figure-text-translation/figure-text.config.json|"keptCopies": {},' \
  'experiments/figure-text-translation/figure-text.config.json|"heldBlockValues": {},' \
  'experiments/figure-text-translation/strip-text.py|def drop_annotations' \
  'experiments/figure-text-translation/figtext.py|def visual_lines' \
  'experiments/figure-text-translation/heldvalues.py|HELD_SCRIPT_CHARS = ' \
  'experiments/figure-text-translation/heldplan.py|def plan_block' \
  "experiments/figure-text-translation/figure-compose.py|'--config'" \
  'tools/figure-run.js|export const COMPOSE_NOTE_LISTS' \
  'tools/__tests__/figure-run-free.test.js|states which sidecar world it runs in' \
  "tools/lib/figure-text-sidecar.cjs|const COMPOSER_VERSION = '4';" \
  ; do  # the four Part 5 rulings gate B-3 alone; B-3 Step 1 checks them there
  f=${spec%%|*}; s=${spec#*|}
  printf '%4s  %s :: %s\n' "$(git show "origin/main:$f" 2>/dev/null | grep -acF -- "$s")" "$f" "$s"
done
```
Expected: the porcelain line is empty (`porcelain-end` alone); a 40-hex merge commit; `3` (a merge commit has two
parents); `in origin/main`; and a count of **1** on every row except `'--config'`, which may be 1 or more. **A 0 on
any row stops the plan:** that part of PR-A is not on `main`. (`COMPOSER_VERSION = '4'` at 1 also proves nobody
bumped it ahead of this plan.) A `2` in place of the `3` means PR-A was squashed: that does not block this plan, but
the register cites PR-A's commits by SHA, so report it to [USER].

- [ ] **Step 2: The working area and its shell preamble.**

```bash
mkdir -p /home/siggi/.cache/namsbokasafn-audit/c140-step2-pass/{bin,tmp,logs,c38,held,eye,sweep}
cat > /home/siggi/.cache/namsbokasafn-audit/c140-step2-pass/bin/env.sh <<'EOF'
# $PASS/bin/env.sh — sourced at the top of every command block of the PR-B plan.
export PASS=/home/siggi/.cache/namsbokasafn-audit/c140-step2-pass
export TMPDIR=$PASS/tmp
export REPO=/home/siggi/dev/repos/namsbokasafn-efni
export EXP=$REPO/experiments/figure-text-translation
export PYTHONDONTWRITEBYTECODE=1
# Present only if B-4 Step 2 fell back to the Chromium build the ring gate's thresholds were measured on.
[ -f "$PASS/bin/chromium.env" ] && . "$PASS/bin/chromium.env"
cd "$REPO" || return 1
EOF
source /home/siggi/.cache/namsbokasafn-audit/c140-step2-pass/bin/env.sh && pwd && echo "$TMPDIR"
node -e "console.log(require('os').tmpdir())"; python3 -c "import tempfile; print(tempfile.gettempdir())"
```
Expected: `/home/siggi/dev/repos/namsbokasafn-efni`, then `/home/siggi/.cache/namsbokasafn-audit/c140-step2-pass/tmp`
three times. (`tools/figure-run.js` puts each figure's scratch under `os.tmpdir()`, and its children inherit
`TMPDIR` because `defaultSpawn` merges `process.env`.)

- [ ] **Step 3: Cut the branch and record its base.**

```bash
source /home/siggi/.cache/namsbokasafn-audit/c140-step2-pass/bin/env.sh
git switch -c content/c140-c49-recompose-pass origin/main && git rev-parse HEAD | tee "$PASS/base.sha"
git branch --show-current; git status --porcelain
```
Expected: `content/c140-c49-recompose-pass`, the base sha (equal to `git rev-parse origin/main`), empty porcelain.

- [ ] **Step 4: Move the repo `.env` out of the repo, and prove a would-be buy fails closed.**

`.gitignore:28-29` ignore only `.env` and `.env.*`, so a copy renamed any other way inside the repo would show up untracked and could
ride into a commit: it goes to `$PASS`. `tools/figure-run.js` reads no `.env`; the only loader is
`translate-blocks.mjs` `main()`, which runs `loadEnvFile(<repo>/.env)` and fills in each variable `process.env` lacks
(an exported empty key is falsy, so `.env` would override it), then calls `createClient()`.

```bash
source /home/siggi/.cache/namsbokasafn-audit/c140-step2-pass/bin/env.sh
test -e "$PASS/env.aside" && echo "env.aside EXISTS — stop, never overwrite it" || mv -n .env "$PASS/env.aside"
ls -la .env 2>&1 | head -1; ls -la "$PASS/env.aside" | awk '{print $1, $5}'; git status --porcelain
printenv MALSTADUR_API_KEY > /dev/null && echo "MALSTADUR_API_KEY IS EXPORTED in this shell — stop" || echo "not exported"
for f in ~/.bashrc ~/.profile ~/.bash_profile; do [ -f "$f" ] && printf '%s %s\n' "$f" "$(grep -ac MALSTADUR_API_KEY "$f")"; done
cat > "$PASS/bin/env-probe.mjs" <<'EOF'
// $PASS/bin/env-probe.mjs — would a buy reach the Málstaður API? Does exactly what translate-blocks.mjs main()
// does before its first paid request: tools/api-translate.js loadEnvFile on the repo .env, each value filled in
// only where process.env has none, then createClient(). createClient sends nothing when constructed, so this
// costs 0 ISK whatever it finds. Prints REFUSED (no key anywhere) or CLIENT CREATED.
import path from 'path';

const R = '/home/siggi/dev/repos/namsbokasafn-efni';
const { loadEnvFile } = await import(path.join(R, 'tools/api-translate.js'));
for (const [k, v] of Object.entries(loadEnvFile(path.join(R, '.env')))) if (!process.env[k]) process.env[k] = v;
const api = await import(path.join(R, 'tools/lib/malstadur-api.js'));
try {
  api.createClient();
  console.log('CLIENT CREATED');
} catch (e) {
  console.log(`REFUSED: ${e.message}`);
}
EOF
node "$PASS/bin/env-probe.mjs"
MALSTADUR_API_KEY=probe-dummy-not-a-key node "$PASS/bin/env-probe.mjs"
```
Expected: `ls: cannot access '.env': No such file or directory`; `env.aside` present (`-rw-r--r-- 540` on
2026-10-03; any size, it must exist); empty porcelain; `not exported`; `0` for every profile file that exists; then
`REFUSED: Málstaður API key required. Set MALSTADUR_API_KEY environment variable or pass apiKey option.` and, as the
control that the probe can say yes, `CLIENT CREATED` (the dummy is never sent: a client makes no request when
built). **Any other first line stops the plan** until the key is found and removed from the environment.

- [ ] **Step 5: The box.**

```bash
source /home/siggi/.cache/namsbokasafn-audit/c140-step2-pass/bin/env.sh
free -h | sed -n 1,2p; df -h /tmp "$PASS" | tail -2
ls -d ~/.cache/ms-playwright/{chromium-1243,chromium_headless_shell-1243,chromium_headless_shell-1234,firefox-1543,webkit-2359}
grep -a '"version"' server/node_modules/playwright-core/package.json
ls "$EXP/sources.local.json" "$EXP/pylibs/numpy/__init__.py" /usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf
```
Expected: available ≥ 2 GiB (stop below); `$PASS` with ≥ 10 GB free (the 2026-09-29 sweep's PNGs were 128 MB; the
per-figure scratch peaks at a few hundred MB); all five browser directories; `"version": "1.63.0"`; all three files.
(numpy lives only in `pylibs/`, not in the system Python: a gate run without `FIGTEXT_PYLIBS` fails closed.)

- [ ] **Step 6: Pin Part 5's implemented strings, which this plan took from its design.**

```bash
source /home/siggi/.cache/namsbokasafn-audit/c140-step2-pass/bin/env.sh
grep -an "heldBlockValues" tools/figure-run.js tools/lib/figure-outcomes.js | tee "$PASS/part5-strings.txt"
grep -an -A6 "export const COMPOSE_NOTE_LISTS = " tools/figure-run.js; grep -an "^COMPOSE_NOTES" experiments/figure-text-translation/figure-compose.py
grep -an "const keys = Object.keys(cfg.heldBlockValues" tools/__tests__/figure-config-validate.test.js
```
Expected (Part 5 design D-d and D-g): a `summarise` heading containing
`labels drawn from heldBlockValues ([USER]'s values), by figure`, a verdict NOTE containing
`drew labels from heldBlockValues ([USER]'s values)`, both note lists ending in `'held'`, and exactly one
`const keys = Object.keys(cfg.heldBlockValues` line (the committed-config test B-3 Step 4 extends). If the heading
or NOTE wording differs, adjust `check-run.mjs` (B-4 Step 0: it matches `heldBlockValues` in the heading and the
entry shape `CNX_…: "<key>" block <n>`) to the implemented wording — the instrument, **never** the predicted
entries. If the `const keys` line is absent, find the held committed-config test by its title
(`grep -an "heldBlockValues" tools/__tests__/figure-config-validate.test.js`) and stop if there is none.

- [ ] **Step 7: The corpus is where the spec left it.**

```bash
source /home/siggi/.cache/namsbokasafn-audit/c140-step2-pass/bin/env.sh
node --input-type=module -e "
import fs from 'fs'; import path from 'path'; import { createRequire } from 'module';
const R = '/home/siggi/dev/repos/namsbokasafn-efni';
const require = createRequire(path.join(R, 'tools', 'x.js'));
const S = require(path.join(R, 'tools/lib/figure-text-sidecar.cjs'));
const { isStale } = await import(path.join(R, 'tools/figure-run.js'));
const book = path.join(R, 'books/efnafraedi-2e');
const names = fs.readdirSync(path.join(book, 'figure-text')).filter((f) => f.endsWith('.is.json')).map((f) => f.slice(0, -8));
const tally = (f) => names.reduce((m, b) => { const k = String(f(S.readSidecar(book, b))); m[k] = (m[k] || 0) + 1; return m; }, {});
const rows = JSON.parse(fs.readFileSync(path.join(book, 'media/image-mapping.json'), 'utf-8'));
console.log(JSON.stringify({ COMPOSER_VERSION: S.COMPOSER_VERSION, sidecars: names.length,
  composedVersion: tally((s) => s.composedVersion), composerVersion: tally((s) => s.composerVersion),
  withState: names.filter((b) => 'state' in S.readSidecar(book, b)).length,
  stale: names.filter((b) => isStale(S.readSidecar(book, b))).length, mappingRows: rows.length }));
"
```
Expected (predicted from the 2026-10-02 re-derivation and re-measured 2026-10-03):
`{"COMPOSER_VERSION":"4","sidecars":461,"composedVersion":{"4":461},"composerVersion":{"1":34,"4":427},"withState":0,"stale":0,"mappingRows":711}`.
Any difference stops the plan: something changed the corpus since the spec was measured.

- [ ] **Step 8: The composer suites pass on this box before any data change (a baseline, not the gate).**

Three calls, each under the 10-minute foreground cap:
```bash
source /home/siggi/.cache/namsbokasafn-audit/c140-step2-pass/bin/env.sh
for t in test_figrings.py test_figsym.py test_figis.py; do
  ( cd "$EXP" && FIGTEXT_PYLIBS=./pylibs timeout 590 python3 -B -u "$t" > "$PASS/logs/b0-$t.txt" 2>&1; echo "$t EXIT=$?" )
  tail -1 "$PASS/logs/b0-$t.txt"; grep -a '^SKIPPED' "$PASS/logs/b0-$t.txt"
done
```
```bash
source /home/siggi/.cache/namsbokasafn-audit/c140-step2-pass/bin/env.sh
for t in test_figure_prepare.py test_sources.py test_figure_compose.py; do
  ( cd "$EXP" && FIGTEXT_PYLIBS=./pylibs timeout 590 python3 -B -u "$t" > "$PASS/logs/b0-$t.txt" 2>&1; echo "$t EXIT=$?" )
  tail -1 "$PASS/logs/b0-$t.txt"
done
```
```bash
source /home/siggi/.cache/namsbokasafn-audit/c140-step2-pass/bin/env.sh
for t in test_heldvalues.py test_heldplan.py test_compose_held.py; do
  ( cd "$EXP" && FIGTEXT_PYLIBS=./pylibs timeout 590 python3 -B -u "$t" > "$PASS/logs/b0-$t.txt" 2>&1; echo "$t EXIT=$?" )
  tail -1 "$PASS/logs/b0-$t.txt"
done
git status --porcelain
```
Expected: `EXIT=0` and a last line reading `ALL PASS` for all nine; no `SKIPPED` line from `test_figrings.py`;
empty porcelain. A red here is the box or PR-A, not this plan: stop and report it by name. (The three held suites
carry the names Part 5's design gives them; if PR-A named them otherwise, `ls "$EXP"/test_*held*.py` and run those.)

- [ ] **Step 9: Record the full suite's failing set on the BASE, before any data commit.** B-bump Step 2's baseline is taken after B-1, B-2, B-3 and B-7a. A red that those commits introduce would therefore sit in both of its sets and pass B-bump Step 6 and B-8 Step 2 unseen. Record the floor here instead: `.env` is already aside (Step 4), as it will be for B-bump.

```bash
source /home/siggi/.cache/namsbokasafn-audit/c140-step2-pass/bin/env.sh
test "$(git rev-parse HEAD)" = "$(cat "$PASS/base.sha")" && echo AT-BASE
npx vitest run --reporter=json --outputFile="$PASS/c38/suite-base.json" > "$PASS/c38/suite-base.out" 2>&1; echo "exit=$?"
node -e "const r=require('$PASS/c38/suite-base.json');const red=[];for(const f of r.testResults){for(const a of f.assertionResults)if(a.status==='failed')red.push(a.fullName);if(f.status==='failed'&&!f.assertionResults.some((a)=>a.status==='failed'))red.push('FILE '+f.name)}require('fs').writeFileSync('$PASS/c38/red-base.txt',red.sort().join('\n')+'\n');console.log('failing entries',red.length)"
git status --porcelain
```
Expected: `AT-BASE`, then `failing entries <n>` (whatever `<n>` is, this is the floor), then empty porcelain. If the run outlasts the 10-minute cap, run it detached as B-bump Step 2 describes.

---

### Task B-1: The `keptCopies` data commit — PerTable2's June raster restored, its sidecar removed, three figures kept

**Why one commit:** PR-A Handoff item 0 (BINDING). If PerTable2's sidecar were deleted while `keptCopies` is empty,
PerTable2 would be a sidecar-less figure whose mapping row resolves, and a plain run — exactly what
`scripts/chemistry-autorun-chapter.sh` invokes — would buy it and publish over the restored June copy. Catalyst and
ibuprofen are recorded in the same commit (spec D6): catalyst is protected today only because the resolver finds no
artwork, ibuprofen only because `isRecomposableTextless` requires `imageXObjects === 0` (it has 3).

**Files:**
- Modify: `experiments/figure-text-translation/figure-text.config.json` (the line `  "keptCopies": {},`)
- Modify (restore from git): `books/efnafraedi-2e/media/CNX_Chem_02_05_PerTable2_IS.svg`
- Delete: `books/efnafraedi-2e/figure-text/CNX_Chem_02_05_PerTable2.is.json`
- Modify: `tools/__tests__/figure-config-validate.test.js` (the committed-config test
  `every kept key was examined on the real tree, and found with its row and its copy`; PR-A Handoff item 2)

**Interfaces:**
- Consumes: `keptCopies: {"<basename>": "<reason, over 40 characters>"}` (PR-A Part 1); `sources.py --json` emits
  `{"path": null, "refused": "kept", "edition": null, "candidates": [], "reason": "<reason>"}`; `figure-run.js`
  prints `⚠️ REFUSED — kept: <b>: <reason>` and `⚠️ readers still see an earlier translated copy of <b>:
  media/<b>_IS.svg (mapping row present) — refusing does not retire it`, and files the figure `unresolved` (a NOTE).
- Produces: three `keptCopies` entries; PerTable2's media bytes = blob `a07da7c504e5b8c23a83225ca3a2e12e432404a5`
  (sha256 `9092ddabf77d9c65e8e6c076cd39ce7a89e644079777294804fd89cbdbf1c249`, 214,609 bytes; measured from git
  2026-10-03); 460 sidecars.

- [ ] **Step 1: Preconditions.**

```bash
source /home/siggi/.cache/namsbokasafn-audit/c140-step2-pass/bin/env.sh
git branch --show-current; git status --porcelain
git show d20952748:books/efnafraedi-2e/media/CNX_Chem_02_05_PerTable2_IS.svg | sha256sum
git show d20952748:books/efnafraedi-2e/media/CNX_Chem_02_05_PerTable2_IS.svg | wc -c
ls books/efnafraedi-2e/figure-text/CNX_Chem_02_05_PerTable2.is.json; grep -an '"keptCopies": {},' "$EXP/figure-text.config.json"
```
Expected: `content/c140-c49-recompose-pass`; empty porcelain; `9092ddabf77d9c65e8e6c076cd39ce7a89e644079777294804fd89cbdbf1c249  -`;
`214609`; the sidecar listed; one `keptCopies` line. (That sha256 is the file vefur serves today: spec D2. It
embeds no font, has one `<image>` and no `<text>`, so ㉗'s licence ruling is not touched.)

- [ ] **Step 2: Write the three `keptCopies` entries.** Each reason is English, over 40 characters, names the ruling
and the commits, ends with a full stop (`check-run.mjs` reads a two-space line ending in `:` as a heading), and does
not contain the literal `REFUSED — superseded` (PR-A Handoff item 5: the autorun halts on it).

```bash
source /home/siggi/.cache/namsbokasafn-audit/c140-step2-pass/bin/env.sh
python3 - <<'PY'
import json, pathlib
p = pathlib.Path('experiments/figure-text-translation/figure-text.config.json')
t = p.read_text(encoding='utf-8')
OLD = '"keptCopies": {},'
assert t.count(OLD) == 1, f'anchor found {t.count(OLD)} times'
KEPT = {
    'CNX_Chem_02_05_PerTable2': (
        "[USER] ruled 2026-10-02 night (step-2 spec docs/superpowers/specs/2026-10-02-c140-step2-recompose-pass-design.md, "
        "D1 and D2; register §C140 ㊾): keep the June raster from d20952748, the copy readers are served today. It embeds "
        "no font, so the ㉗ licence ruling is not touched. The paid MT copy bought in 7df47b298 was worse than it (per-word "
        "keys, rotated glyphs); its sidecar was deleted in the commit that restored the raster, and its paid MT record "
        "stays in git at 7df47b298."),
    'CNX_Chem_03_01_ibuprofenmass_img': (
        "[USER] ruled 2026-10-02 (register §C140 ㊵, the 2026-10-02 afternoon RESUME block): keep the June copy from "
        "d20952748, correct in content with decimal commas; the figure was never bought. Its artwork resolves to a "
        "selected-art .eps whose table is a raster, so until this entry only isRecomposableTextless (imageXObjects 0) "
        "kept a recompose off it. Recorded by the step-2 spec's D6 default "
        "(docs/superpowers/specs/2026-10-02-c140-step2-recompose-pass-design.md)."),
    'CNX_Chem_13_03_catalyst': (
        "[USER] ruled 2026-10-02 (register §C140 ㊽): the June copy from 34402e8a6 is correct as it is. That day's buy "
        "composed an unusable copy and was discarded before any commit, so the figure has no sidecar and no artwork pin. "
        "Recorded by the step-2 spec's D6 default (docs/superpowers/specs/2026-10-02-c140-step2-recompose-pass-design.md), "
        "so its protection no longer rests on the resolver finding no artwork."),
}
for k, v in KEPT.items():
    assert len(v) > 40 and 'REFUSED — superseded' not in v and v.endswith('.'), k
body = ',\n'.join(f'    {json.dumps(k)}: {json.dumps(v, ensure_ascii=False)}' for k, v in KEPT.items())
p.write_text(t.replace(OLD, '"keptCopies": {\n' + body + '\n  },'), encoding='utf-8')
assert json.loads(p.read_text(encoding='utf-8'))['keptCopies'] == KEPT
print('keptCopies:', sorted(KEPT))
PY
git diff --stat
```
Expected: `keptCopies: ['CNX_Chem_02_05_PerTable2', 'CNX_Chem_03_01_ibuprofenmass_img', 'CNX_Chem_13_03_catalyst']`
and one file changed.

- [ ] **Step 3: BEFORE the `git rm`, the resolver refuses all three as `kept` (PR-A Handoff item 0).**

```bash
source /home/siggi/.cache/namsbokasafn-audit/c140-step2-pass/bin/env.sh
( cd "$EXP" && FIGTEXT_PYLIBS=./pylibs python3 -B sources.py --json efnafraedi-2e CNX_Chem_02_05_PerTable2 \
    CNX_Chem_03_01_ibuprofenmass_img CNX_Chem_13_03_catalyst CNX_Chem_02_05_PerTable1 ) \
  | python3 -c "import json,sys; [print(k, (v or {}).get('refused'), (v or {}).get('path')) for k, v in json.load(sys.stdin).items()]"
```
Expected:
```text
CNX_Chem_02_05_PerTable2 kept None
CNX_Chem_03_01_ibuprofenmass_img kept None
CNX_Chem_13_03_catalyst kept None
CNX_Chem_02_05_PerTable1 None /home/siggi/dev/repos/Myndir/chemistry-2e/selected-art/OSX_Chem2e_Ch02_SourceFiles/CNX_Chem_02_05_PerTable1.eps
```
The last line is the control: a figure that is not kept still resolves (measured read-only 2026-10-03). **If any of
the three is not `kept`, stop: do not delete the sidecar.**

- [ ] **Step 4: Restore PerTable2's June raster.**

```bash
source /home/siggi/.cache/namsbokasafn-audit/c140-step2-pass/bin/env.sh
git show d20952748:books/efnafraedi-2e/media/CNX_Chem_02_05_PerTable2_IS.svg > books/efnafraedi-2e/media/CNX_Chem_02_05_PerTable2_IS.svg
sha256sum books/efnafraedi-2e/media/CNX_Chem_02_05_PerTable2_IS.svg; wc -c < books/efnafraedi-2e/media/CNX_Chem_02_05_PerTable2_IS.svg
cmp <(git show d20952748:books/efnafraedi-2e/media/CNX_Chem_02_05_PerTable2_IS.svg) books/efnafraedi-2e/media/CNX_Chem_02_05_PerTable2_IS.svg && echo IDENTICAL
cmp /home/siggi/dev/repos/namsbokasafn-vefur/static/content/efnafraedi-2e/chapters/02/images/media/CNX_Chem_02_05_PerTable2_IS.svg books/efnafraedi-2e/media/CNX_Chem_02_05_PerTable2_IS.svg && echo SAME-AS-VEFUR
```
Expected: `9092ddabf77d9c65e8e6c076cd39ce7a89e644079777294804fd89cbdbf1c249`, `214609`, `IDENTICAL`, `SAME-AS-VEFUR`
(vefur's synced tree is read only; it is the copy readers get).

- [ ] **Step 5: Remove PerTable2's sidecar** (spec D1: its blocks describe a picture no longer served; while it
exists the page keeps its review badge and the panel lists blocks that can never reach the image).

```bash
source /home/siggi/.cache/namsbokasafn-audit/c140-step2-pass/bin/env.sh
git rm -q books/efnafraedi-2e/figure-text/CNX_Chem_02_05_PerTable2.is.json
ls books/efnafraedi-2e/figure-text/CNX_Chem_02_05_PerTable2.is.json 2>&1; ls books/efnafraedi-2e/figure-text/*.is.json | wc -l
```
Expected: `No such file or directory`, then `460`.

- [ ] **Step 6: The committed-config kept test stops being vacuous (PR-A Handoff item 2).** Re-read the anchor:
Part 5 also edits this file.

```bash
source /home/siggi/.cache/namsbokasafn-audit/c140-step2-pass/bin/env.sh
python3 - <<'PY'
import pathlib
p = pathlib.Path('tools/__tests__/figure-config-validate.test.js')
t = p.read_text(encoding='utf-8')
edits = [
    ("  // tree, and each was found WITH its row and its copy. Vacuous while the table is empty; the\n"
     "  // commit that records the first kept figure adds `expect(keys.length).toBeGreaterThan(0)` here,\n"
     "  // as the retired test carries.\n",
     "  // tree, and each was found WITH its row and its copy. The first kept figures were recorded in\n"
     "  // PR-B's restore commit (§C140 ㊾), so an empty table now fails here, as the retired test's does.\n"),
    ("    const keys = Object.keys(cfg.keptCopies ?? {}).sort();\n"
     "    expect(Object.keys(corpus.keptState).sort()).toEqual(keys);\n",
     "    const keys = Object.keys(cfg.keptCopies ?? {}).sort();\n"
     "    expect(keys.length).toBeGreaterThan(0);\n"
     "    expect(Object.keys(corpus.keptState).sort()).toEqual(keys);\n"),
]
for old, new in edits:
    assert t.count(old) == 1, f'anchor found {t.count(old)} times: {old[:60]!r}'
    t = t.replace(old, new)
p.write_text(t, encoding='utf-8')
print('patched')
PY
```
Expected: `patched`. An assertion error means the anchor moved: read the test, apply the same two changes by hand,
and record it.

- [ ] **Step 7: The validator and the resolver's own suite are green.**

```bash
source /home/siggi/.cache/namsbokasafn-audit/c140-step2-pass/bin/env.sh
npx vitest run tools/__tests__/figure-config-validate.test.js tools/__tests__/figure-text-config.test.js > "$PASS/logs/b1-vitest.txt" 2>&1; echo "EXIT=$?"; tail -6 "$PASS/logs/b1-vitest.txt"
( cd "$EXP" && FIGTEXT_PYLIBS=./pylibs python3 -B -u test_sources.py > "$PASS/logs/b1-test_sources.txt" 2>&1; echo "EXIT=$?" ); tail -1 "$PASS/logs/b1-test_sources.txt"
```
Expected: `EXIT=0` with every test passed (the committed-config `passes every rule` and the kept test included),
then `EXIT=0` and `ALL PASS`. The kept entries satisfy the validator by measurement (PR-A Handoff item 1: each has
one mapping row and its `_IS.svg`).

- [ ] **Step 8: The driver's dry runs read the three kept refusals, and a PLAIN dry run offers nothing to buy.**
Each is refused at resolution, so nothing is prepared and these runs are cheap. (`run-chapter.sh` is not written
until B-4; these four dry runs call the driver directly, each with `--dry-run`.)

```bash
source /home/siggi/.cache/namsbokasafn-audit/c140-step2-pass/bin/env.sh
node tools/figure-run.js --book efnafraedi-2e --chapter 2 --figure CNX_Chem_02_05_PerTable2 --stale --dry-run > "$PASS/logs/b1-pt2-stale.txt" 2>&1; echo "EXIT=$?"
node tools/figure-run.js --book efnafraedi-2e --chapter 2 --figure CNX_Chem_02_05_PerTable2 --dry-run > "$PASS/logs/b1-pt2-plain.txt" 2>&1; echo "EXIT=$?"
node tools/figure-run.js --book efnafraedi-2e --chapter 3 --figure CNX_Chem_03_01_ibuprofenmass_img --stale --dry-run > "$PASS/logs/b1-ibu.txt" 2>&1; echo "EXIT=$?"
node tools/figure-run.js --book efnafraedi-2e --chapter 13 --figure CNX_Chem_13_03_catalyst --stale --dry-run > "$PASS/logs/b1-cat.txt" 2>&1; echo "EXIT=$?"
for f in pt2-stale pt2-plain ibu cat; do echo "== $f"; grep -a 'unresolved\|enumerated\|REFUSED\|readers still see\|would buy\|VERDICT' "$PASS/logs/b1-$f.txt"; done
```
Expected, for each of the four (the figure name changing): `EXIT=0`; the tally `1  unresolved` and `1  = enumerated`;
`⚠️ REFUSED — kept: <name>: <its reason>`; `⚠️ readers still see an earlier translated copy of <name>:
media/<name>_IS.svg (mapping row present) — refusing does not retire it`; **no `would buy` line**; `VERDICT ok`
followed by the `NOTE (not a failure): 1 figure(s) unresolved — …` reason. For catalyst this replaces its old place
in `unresolved — the artwork delivery has a hole here`, and for ibuprofen its old place in `textless with an
embedded raster, NOT recomposed` (PR-A Handoff item 4).

- [ ] **Step 9: Commit all four changes together.**

```bash
source /home/siggi/.cache/namsbokasafn-audit/c140-step2-pass/bin/env.sh
git add experiments/figure-text-translation/figure-text.config.json books/efnafraedi-2e/media/CNX_Chem_02_05_PerTable2_IS.svg tools/__tests__/figure-config-validate.test.js
git status --porcelain
```
Expected, exactly these four lines and no other:
```text
D  books/efnafraedi-2e/figure-text/CNX_Chem_02_05_PerTable2.is.json
M  books/efnafraedi-2e/media/CNX_Chem_02_05_PerTable2_IS.svg
M  experiments/figure-text-translation/figure-text.config.json
M  tools/__tests__/figure-config-validate.test.js
```
```bash
git commit -F - <<'EOF'
content(c140-㊾): PerTable2's June raster restored and kept; keptCopies records PerTable2, catalyst, ibuprofen

Spec 2026-10-02 D1/D2/D6 and PR-A's handoff item 0, in one commit so no state exists in which PerTable2 is a
sidecar-less, resolvable, buyable figure. PerTable2_IS.svg is d20952748's raster again (sha256 9092ddab…c249, the
copy vefur serves); its sidecar is removed, and its paid MT record stays in git at 7df47b298. sources.py refused
all three as `kept` before the sidecar was removed; the driver's --stale and plain dry runs read REFUSED — kept and
offer nothing to buy. The committed-config kept test now requires a non-empty table.
EOF
git status --porcelain; git log --oneline -1
```
Expected: empty porcelain after the commit.

---

### Task B-2: HetCats and Graphene — [USER]'s sidecar values, by VALUE (spec D4, route 1)

**Why:** [USER] authorised these hand edits of paid MT on 2026-10-02 (spec Approval line) and gave the wording on the
value sheet, rows D1–D4. HetCats' paid MT faithfully translated a superseded base EPS that reads "absorbed" (figure
`REGISTER.md` ⑭); Graphene's MT returned `Buckyball` unchanged. **The keys are never touched**: they are
content-addressed to what the read layer extracts, and a changed key fails the recompose as `failed-compose`.
`renderHash` is recomputed under each sidecar's OWN `composerVersion` ('4' for both): the publisher restamps only
`composedHash`/`composedVersion`, so a value edited with the old hash would recompose on every run for ever, and a
hash taken under '5' with `composerVersion` left at '4' loops for ever (spec D4, measured with the real `isStale`).

**Files:**
- Modify: `books/efnafraedi-2e/figure-text/CNX_Chem_12_07_HetCats-230a.is.json` (three values + `renderHash`)
- Modify: `books/efnafraedi-2e/figure-text/CNX_Chem_10_05_Graphene.is.json` (one value + `renderHash`)
- Backups (gitignored by `.gitignore:18` `*.bak`): `<sidecar>.<YYYY-MM-DD-HHMM>.bak` beside each file

**Interfaces:**
- Consumes: `tools/lib/figure-text-sidecar.cjs` `sidecarPath`, `readSidecar`, `computeRenderHash(blocks, composerVersion)`,
  `writeSidecar` (writes `JSON.stringify(data, null, 1) + '\n'` atomically); `tools/figure-run.js` `isStale`.
- Produces: HetCats `renderHash` **`032207ce2d49d6ef`** (from `84d5d03adc343833`) and Graphene **`8413764fc3015783`**
  (from `21df80e1e2afb9b3`) — predicted by the script's dry run on 2026-10-03, deterministic for these values;
  `composedHash` unchanged in both until the pass restamps it. `mtAlternatives` untouched (its `mt` fields keep the
  paid MT record; the review panel warns only while a value still equals `mt`).

| Sheet row | Sidecar, exact key | Value today (paid MT, evidence) | [USER]'s value (value sheet) |
|---|---|---|---|
| D1 | HetCats-230a, `Ethylene absorbed on \|surface breaking π bonds` | *Eten frásogast á yfirborðið og rýfur π-tengi* | *Etýlen aðsogast á yfirborðið og π-tengi rofna* |
| D2 | HetCats-230a, `Ethylene ` (trailing space) | *Eten* | *Etýlen* |
| D3 | HetCats-230a, `Ni surface` | *Nikkel yfirborð* | *Ni-yfirborð* |
| D4 | Graphene, `Buckyball` | `Buckyball` | *Knattkol (e. buckyball)* |

(In the table `\|` is Markdown; the key holds a bare `|`. The hyphens in D1 and D3 are ASCII U+002D in the sheet,
measured by code point.)

- [ ] **Step 1: No figure-run is going, and the tree is clean.**

```bash
source /home/siggi/.cache/namsbokasafn-audit/c140-step2-pass/bin/env.sh
ps -eo pid,args | grep -a '[f]igure-run.js'; echo "ps-grep-exit=$? (1 = none running, required)"
git status --porcelain
```
Expected: `ps-grep-exit=1`, empty porcelain. (The publisher refuses `sidecar-moved` if a sidecar changes under a
running compose; never edit while a run is going.)

- [ ] **Step 2: Back up both sidecars (the repo's backup rule).**

```bash
source /home/siggi/.cache/namsbokasafn-audit/c140-step2-pass/bin/env.sh
STAMP=$(date +%Y-%m-%d-%H%M)
for b in CNX_Chem_12_07_HetCats-230a CNX_Chem_10_05_Graphene; do cp -p "books/efnafraedi-2e/figure-text/$b.is.json" "books/efnafraedi-2e/figure-text/$b.is.json.$STAMP.bak"; done
ls books/efnafraedi-2e/figure-text/*.bak; git status --porcelain
```
Expected: two `.bak` files listed; empty porcelain (they are ignored).

- [ ] **Step 3: Write the edit script, and run it dry.**

```bash
source /home/siggi/.cache/namsbokasafn-audit/c140-step2-pass/bin/env.sh
cat > "$PASS/bin/edit-sidecar-values.mjs" <<'EOF'
// $PASS/bin/edit-sidecar-values.mjs — spec D4 route 1: change the VALUE of named blocks in two paid sidecars,
// never a key, with renderHash recomputed under each sidecar's OWN composerVersion, through the real
// tools/lib/figure-text-sidecar.cjs exports. Without --apply it only prints what it would write.
//   node edit-sidecar-values.mjs [--apply]
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';

const REPO = '/home/siggi/dev/repos/namsbokasafn-efni';
const require = createRequire(path.join(REPO, 'tools', 'x.js'));
const S = require(path.join(REPO, 'tools/lib/figure-text-sidecar.cjs'));
const apply = process.argv.slice(2).includes('--apply');
process.exitCode = 1;

// `from`: the paid MT value committed today (evidence, quoted from the sidecar). `to`: [USER]'s value, value
// sheet docs/handoffs/2026-10-03-step2-value-sheet.md rows D1-D4 (authorised 2026-10-02, spec D4 route 1).
const EDITS = {
  'CNX_Chem_12_07_HetCats-230a': {
    'Ethylene absorbed on |surface breaking π bonds': {
      from: 'Eten frásogast á yfirborðið og rýfur π-tengi',
      to: 'Etýlen aðsogast á yfirborðið og π-tengi rofna', // D1
    },
    'Ethylene ': { from: 'Eten', to: 'Etýlen' }, // D2 (the key carries a trailing space)
    'Ni surface': { from: 'Nikkel yfirborð', to: 'Ni-yfirborð' }, // D3
  },
  'CNX_Chem_10_05_Graphene': {
    Buckyball: { from: 'Buckyball', to: 'Knattkol (e. buckyball)' }, // D4
  },
};

const bookDir = path.join(REPO, 'books', 'efnafraedi-2e');
const plans = [];
for (const [basename, edits] of Object.entries(EDITS)) {
  const raw = fs.readFileSync(S.sidecarPath(bookDir, basename), 'utf-8');
  const s = S.readSidecar(bookDir, basename);
  if (!s) throw new Error(`${basename}: readSidecar returned null`);
  // CONTROL 1: the file is already in writeSidecar's form, so a write changes only the lines edited here.
  if (`${JSON.stringify(s, null, 1)}\n` !== raw) {
    throw new Error(`${basename}: not in JSON.stringify(..., 1) form; a write would reformat the whole file`);
  }
  const cv = s.composerVersion;
  if (typeof cv !== 'string' || !cv) throw new Error(`${basename}: no composerVersion to hash under`);
  // CONTROL 2: the stored renderHash is reproduced under the sidecar's own composerVersion.
  if (S.computeRenderHash(s.blocks, cv) !== s.renderHash) {
    throw new Error(`${basename}: stored renderHash is not computeRenderHash(blocks, '${cv}')`);
  }
  const blocks = { ...s.blocks };
  for (const [key, { from, to }] of Object.entries(edits)) {
    if (!Object.prototype.hasOwnProperty.call(blocks, key)) throw new Error(`${basename}: no key ${JSON.stringify(key)}`);
    if (blocks[key] !== from) {
      throw new Error(`${basename}[${JSON.stringify(key)}] is ${JSON.stringify(blocks[key])}, not ${JSON.stringify(from)}`);
    }
    blocks[key] = to;
  }
  const next = { ...s, blocks, renderHash: S.computeRenderHash(blocks, cv) };
  // VALUES ONLY: the same keys in the same order, at both levels, and nothing else moved.
  const same = (a, b) => JSON.stringify(Object.keys(a)) === JSON.stringify(Object.keys(b));
  if (!same(next, s) || !same(next.blocks, s.blocks)) throw new Error(`${basename}: a key moved`);
  for (const k of Object.keys(s)) {
    if (!['blocks', 'renderHash'].includes(k) && JSON.stringify(next[k]) !== JSON.stringify(s[k])) {
      throw new Error(`${basename}: field ${k} changed`);
    }
  }
  plans.push({ basename, next });
  console.log(
    `${basename}: composerVersion ${cv}; renderHash ${s.renderHash} -> ${next.renderHash}; ` +
      `${Object.keys(edits).length} value(s); composedHash ${s.composedHash} stays (the pass restamps it)`
  );
}
if (apply) {
  for (const p of plans) S.writeSidecar(bookDir, p.basename, p.next);
  console.log(`APPLIED ${plans.length} sidecar(s)`);
} else {
  console.log('DRY: nothing written (pass --apply to write)');
}
process.exitCode = 0;
EOF
node "$PASS/bin/edit-sidecar-values.mjs"; echo "EXIT=$?"
```
Expected:
```text
CNX_Chem_12_07_HetCats-230a: composerVersion 4; renderHash 84d5d03adc343833 -> 032207ce2d49d6ef; 3 value(s); composedHash 84d5d03adc343833 stays (the pass restamps it)
CNX_Chem_10_05_Graphene: composerVersion 4; renderHash 21df80e1e2afb9b3 -> 8413764fc3015783; 1 value(s); composedHash 21df80e1e2afb9b3 stays (the pass restamps it)
DRY: nothing written (pass --apply to write)
EXIT=0
```
Any thrown error (a key absent, a `from` that no longer matches, a non-canonical file, a stored hash the script
cannot reproduce) stops the task: the sidecar is not what the sheet was measured against.

- [ ] **Step 4: Apply.**

```bash
source /home/siggi/.cache/namsbokasafn-audit/c140-step2-pass/bin/env.sh
node "$PASS/bin/edit-sidecar-values.mjs" --apply; echo "EXIT=$?"
git diff --numstat -- books/efnafraedi-2e/figure-text/
git diff -- books/efnafraedi-2e/figure-text/ | grep -a '^[-+] '
```
Expected: the two dry lines, `APPLIED 2 sidecar(s)`, `EXIT=0`; numstat `4	4	…HetCats-230a.is.json` and
`2	2	…Graphene.is.json`; and the changed lines are exactly the `renderHash` line of each file plus the three HetCats
values and the Graphene value, each `-` line paired with its `+` line, keys identical.

- [ ] **Step 5: Neither sidecar loops, and no other sidecar went stale.**

```bash
source /home/siggi/.cache/namsbokasafn-audit/c140-step2-pass/bin/env.sh
cat > "$PASS/bin/verify-stale.mjs" <<'EOF'
// $PASS/bin/verify-stale.mjs — after the D4 value edits: does any sidecar loop, or go stale wrongly?
// The real isStale (tools/figure-run.js) at today's COMPOSER_VERSION, plus a parameterised copy of it for the
// '5' world, controlled by agreeing with the real one on every sidecar. Read-only: nothing is written.
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';

const REPO = '/home/siggi/dev/repos/namsbokasafn-efni';
const require = createRequire(path.join(REPO, 'tools', 'x.js'));
const S = require(path.join(REPO, 'tools/lib/figure-text-sidecar.cjs'));
const { isStale } = await import(path.join(REPO, 'tools/figure-run.js'));
process.exitCode = 1;
const EDITED = ['CNX_Chem_10_05_Graphene', 'CNX_Chem_12_07_HetCats-230a'];

/** isStale with the constant as a parameter — the same five clauses as tools/figure-run.js. */
function isStaleAt(s, V) {
  if (!s || typeof s !== 'object' || Array.isArray(s)) return true;
  const { blocks, renderHash, composedHash, composerVersion, composedVersion } = s;
  if (!renderHash || !composedHash) return true;
  if (composedHash !== renderHash) return true;
  if (composedVersion !== V) return true;
  if (blocks && typeof blocks === 'object' && S.computeRenderHash(blocks, composerVersion || V) !== renderHash) return true;
  return false;
}
const stamp = (s, V) => ({ ...s, composedHash: s.renderHash, composedVersion: V });

const book = path.join(REPO, 'books', 'efnafraedi-2e');
const names = fs
  .readdirSync(path.join(book, 'figure-text'))
  .filter((f) => f.endsWith('.is.json'))
  .map((f) => f.slice(0, -'.is.json'.length));
const sc = Object.fromEntries(names.map((b) => [b, S.readSidecar(book, b)]));
const realStale = names.filter((b) => isStale(sc[b])).sort();
const agree = names.every((b) => isStale(sc[b]) === isStaleAt(sc[b], S.COMPOSER_VERSION));
const after5 = names.filter((b) => isStaleAt(stamp(sc[b], '5'), '5'));
const afterNow = EDITED.filter((b) => isStale(stamp(sc[b], S.COMPOSER_VERSION)));
// NEGATIVE CONTROL — the loop spec D4 measured: hashed under '5' while composerVersion stays '4'.
const loop = EDITED.filter((b) => {
  const bad = { ...sc[b], renderHash: S.computeRenderHash(sc[b].blocks, '5') };
  return isStaleAt(stamp(bad, '5'), '5');
});
const out = {
  COMPOSER_VERSION: S.COMPOSER_VERSION,
  sidecars: names.length,
  staleNow: realStale,
  copyAgreesWithReal: agree,
  staleAfterAStampAtTodaysVersion: afterNow,
  staleAfterA5StampInThe5World: after5,
  loopControlStaysStale: loop,
};
console.log(JSON.stringify(out, null, 1));
const ok =
  JSON.stringify(realStale) === JSON.stringify(EDITED) &&
  agree &&
  afterNow.length === 0 &&
  after5.length === 0 &&
  loop.length === EDITED.length;
console.log(ok ? 'VERIFY-STALE PASS' : 'VERIFY-STALE FAIL');
process.exitCode = ok ? 0 : 1;
EOF
node "$PASS/bin/verify-stale.mjs"; echo "EXIT=$?"
```
Expected:
```text
{
 "COMPOSER_VERSION": "4",
 "sidecars": 460,
 "staleNow": [
  "CNX_Chem_10_05_Graphene",
  "CNX_Chem_12_07_HetCats-230a"
 ],
 "copyAgreesWithReal": true,
 "staleAfterAStampAtTodaysVersion": [],
 "staleAfterA5StampInThe5World": [],
 "loopControlStaysStale": [
  "CNX_Chem_10_05_Graphene",
  "CNX_Chem_12_07_HetCats-230a"
 ]
}
VERIFY-STALE PASS
EXIT=0
```
Reading it: the two edited sidecars are stale today (composedHash ≠ renderHash: the pass recomposes them); a
publisher stamp at today's version makes them current (no loop under '4'); after the bump, a '5' stamp makes all 460
current; and the negative control — the same edit hashed under '5' — stays stale after a stamp, which is the loop
the detector exists to see. (Run on 2026-10-03 before any edit, this script fails exactly as it should: `staleNow` [].)

- [ ] **Step 6: Commit.** From here to B-bump, **no live figure-run** (Global Constraints, ordering 3).

```bash
source /home/siggi/.cache/namsbokasafn-audit/c140-step2-pass/bin/env.sh
git add books/efnafraedi-2e/figure-text/CNX_Chem_12_07_HetCats-230a.is.json books/efnafraedi-2e/figure-text/CNX_Chem_10_05_Graphene.is.json
git status --porcelain
git commit -F - <<'EOF'
content(c140-㊾): HetCats and Graphene sidecar values per [USER] (spec D4 route 1), renderHash under composerVersion '4'

Value sheet rows D1-D4, authorised 2026-10-02: three HetCats-230a values (its paid MT translated a superseded
base EPS that reads "absorbed", figure REGISTER.md ⑭) and Graphene's `Buckyball`, which the MT returned unchanged.
Values only: every key, mtAlternatives (the paid MT record) and composedHash are untouched. renderHash recomputed
with the real computeRenderHash under each sidecar's own composerVersion '4' (HetCats 032207ce2d49d6ef, Graphene
8413764fc3015783). Checked with the real isStale: both stale until the pass restamps them, no loop under '4' or
'5', no other sidecar stale; a '5'-hashed control stays stale, so the check can see the loop.
EOF
git status --porcelain
```
Expected: before the commit, exactly `M  books/efnafraedi-2e/figure-text/CNX_Chem_10_05_Graphene.is.json` and
`M  books/efnafraedi-2e/figure-text/CNX_Chem_12_07_HetCats-230a.is.json`; empty porcelain after.

---

### Task B-3: The `heldBlockValues` data commit — [USER]'s values for 7 figures, transcribed BY VALUE

**Why:** spec D5(a), built in PR-A Part 5. These labels are `send:false` blocks the composer keeps in English (the
two-letter rule protects element symbols such as *No*, *In*, *As*). The values are [USER]'s (value sheet rows A1–A3,
B1–B6); C1–C3 were answered "keep the English" and get **no** entry. The four Part 5 items were ruled 2026-10-03
(PR-A plan, Part 5 header): a value that does not fit is refused, fatal to that one figure; transcription as below;
buffer's charge drawn after its subscript is **checked by eye in this plan** (Step 7, before the commit, and B-6).

**Files:**
- Modify: `experiments/figure-text-translation/figure-text.config.json` (the line `  "heldBlockValues": {},`)
- Modify: `tools/__tests__/figure-config-validate.test.js` (the held committed-config test gains the non-empty assertion)
- Scratch: `$PASS/bin/heldcheck.py`, `$PASS/bin/triptych.mjs`, `$PASS/held/`, `$PASS/eye/b3/`

**Interfaces:**
- Consumes (Part 5, pinned in B-0 Step 6): `heldBlockValues: {"<basename>": {"<exact blockKey>": "<value>"}}`;
  lines separated by `'\n'`, never `'|'`; the 24 script characters `₀–₉ ₊ ₋ ⁰ ¹ ² ³ ⁴–⁹ ⁺ ⁻` are formatting intent,
  decoded to the base glyph in the block's own source script style (`⁻`/`₋` → U+2013); a value's line count must
  equal the block's visual lines; `figure-compose.py --out <dir> --translations <file> [--config <path>]` (`--config`
  is test-only, defaulting to the committed config) pre-flights every configured key against `blocks.json` and
  writes `compose.json` with `held: [{key, block, changed}]`; a refusal is a `ComposeError`, exit 1.
- Produces: 7 `heldBlockValues` entries (9 keys, 13 drawn labels); the A/B evidence in `$PASS/held/`.

**Transcription, by value** (Part 5 design § "PR-B handoff: transcription rules"; keys measured byte-exact from
`figure-prepare.py` on 2026-10-03, `~/.cache/namsbokasafn-audit/2026-10-03-step2/vs-prepare/*/blocks.json`):

| Row | Figure | Key (exact) | ×blocks | [USER]'s value (value sheet), as stored |
|---|---|---|---|---|
| A1 | `CNX_Chem_01_02_MattType` | `No` | 3 | *Nei* (the bare word, not the chat note) |
| A2 | `CNX_Chem_07_04_HNO2_img` | `or` | 1 | *eða* |
| A3 | `CNX_Chem_20_04_amide1_img` | `R or H` | 2 | *R eða H* |
| B1 | `CNX_Chem_09_05_MolSpeed1` | `02 at T = 300 K` (DIGIT zero) | 1 | *O₂ við T = 300 K* — LETTER O U+004F, ₂ U+2082 |
| B2 | `CNX_Chem_14_02_phscale` | `100 or 1` | 2 | *10⁰ eða 1* — ⁰ U+2070 |
| B3 | `CNX_Chem_14_06_buffer` | `[CH3CO2H] is 11% of [CH3CO2\|–]` (bare `\|`, U+2013) | 1 | *[CH₃CO₂H] er 11% af [CH₃CO₂⁻]* — one line |
| B4 | `CNX_Chem_18_04_OxStNonmts` | `4+\|To\|4–` (U+2013) | 1 | `4+` `\n` *til* `\n` `4–` — three lines, U+2013 |
| B5 | `CNX_Chem_18_04_OxStNonmts` | `5+\|To\|3–` (U+2013) | 1 | `5+` `\n` *til* `\n` `3–` — three lines, U+2013 |
| B6 | `CNX_Chem_20_04_amide1_img` | `C\|H or R` | 1 | `C` `\n` *H eða R* — two lines |

- [ ] **Step 1: The four Part 5 items are ruled on `main` (no stop is needed).**

```bash
source /home/siggi/.cache/namsbokasafn-audit/c140-step2-pass/bin/env.sh
grep -acF 'RULED all four, 2026-10-03' docs/superpowers/plans/2026-10-03-c140-step2-code-fixes.md
grep -acF '"heldBlockValues": {},' "$EXP/figure-text.config.json"; git status --porcelain
```
Expected: `1`, `1`, empty porcelain. A `0` on the first line means the ruling is not recorded on this branch:
stop and ask [USER] the four items as the PR-A plan's Part 5 header puts them, before writing any value.

- [ ] **Step 2: Write the entries.** The values are [USER]'s, quoted as the characters themselves; the code points
the script prints afterwards are the by-value check (a hyphen for an en dash, or a digit for a letter, shows there).

```bash
source /home/siggi/.cache/namsbokasafn-audit/c140-step2-pass/bin/env.sh
python3 - <<'PY'
import json, pathlib
p = pathlib.Path('experiments/figure-text-translation/figure-text.config.json')
t = p.read_text(encoding='utf-8')
OLD = '"heldBlockValues": {},'
assert t.count(OLD) == 1, f'anchor found {t.count(OLD)} times'
D = '–'   # EN DASH, as in the source keys
# [USER]'s values, value sheet docs/handoffs/2026-10-03-step2-value-sheet.md rows A1-A3 and B1-B6.
TABLE = {
    'CNX_Chem_01_02_MattType': {'No': 'Nei'},                                                    # A1
    'CNX_Chem_07_04_HNO2_img': {'or': 'eða'},                                                    # A2
    'CNX_Chem_09_05_MolSpeed1': {'02 at T = 300 K': 'O₂ við T = 300 K'},                    # B1, letter O
    'CNX_Chem_14_02_phscale': {'100 or 1': '10⁰ eða 1'},                                    # B2
    'CNX_Chem_14_06_buffer': {f'[CH3CO2H] is 11% of [CH3CO2|{D}]':
                              '[CH₃CO₂H] er 11% af [CH₃CO₂⁻]'},          # B3
    'CNX_Chem_18_04_OxStNonmts': {f'4+|To|4{D}': f'4+\ntil\n4{D}',                               # B4
                                  f'5+|To|3{D}': f'5+\ntil\n3{D}'},                              # B5
    'CNX_Chem_20_04_amide1_img': {'R or H': 'R eða H', 'C|H or R': 'C\nH eða R'},                # A3, B6
}
body = ',\n'.join(
    f'    {json.dumps(b)}: {{ ' + ', '.join(f'{json.dumps(k, ensure_ascii=False)}: {json.dumps(v, ensure_ascii=False)}'
                                          for k, v in e.items()) + ' }'
    for b, e in TABLE.items())
p.write_text(t.replace(OLD, '"heldBlockValues": {\n' + body + '\n  },'), encoding='utf-8')
cfg = json.loads(p.read_text(encoding='utf-8'))
assert cfg['heldBlockValues'] == TABLE
for b, e in cfg['heldBlockValues'].items():
    for k, v in e.items():
        assert '|' not in v and all(ln == ln.strip() and ln for ln in v.split('\n')), (b, k)
        print(b, repr(k), '->', [f'U+{ord(c):04X}' if ord(c) > 0x7e or c == '\n' else c for c in v])
PY
git diff --stat
```
Expected: nine printed lines, one per key, ending with the code points of each value. Check by eye that: MolSpeed1's
value starts `O`, `U+2082` (a letter, not the digit `0`); phscale's has `U+2070`; buffer's has `U+2083`, `U+2082`
twice each and ends `U+207B`, `]`; both OxStNonmts values are `…, U+000A, t, i, l, U+000A, …, U+2013`; amide1's
`C|H or R` value is `C`, `U+000A`, `H`, …. One file changed.

- [ ] **Step 3: The validator accepts them (CI's half of the checks).**

```bash
source /home/siggi/.cache/namsbokasafn-audit/c140-step2-pass/bin/env.sh
npx vitest run tools/__tests__/figure-config-validate.test.js tools/__tests__/figure-text-config.test.js > "$PASS/logs/b3-vitest.txt" 2>&1; echo "EXIT=$?"; tail -6 "$PASS/logs/b3-vitest.txt"
( cd "$EXP" && FIGTEXT_PYLIBS=./pylibs python3 -B -u test_heldvalues.py > "$PASS/logs/b3-heldvalues.txt" 2>&1; echo "EXIT=$?" ); tail -1 "$PASS/logs/b3-heldvalues.txt"
```
Expected: `EXIT=0` with every test passed (the validator's owner-book, `.svg` row, translated-copy, line-bound,
encoding and value≠key rules all hold: Part 5 design D-g measured all 7 figures as passing), then `EXIT=0`,
`ALL PASS` (HV6 loads the committed table and compares it with the JSON).

- [ ] **Step 4: The held committed-config test stops being vacuous.**

```bash
source /home/siggi/.cache/namsbokasafn-audit/c140-step2-pass/bin/env.sh
python3 - <<'PY'
import pathlib, re
p = pathlib.Path('tools/__tests__/figure-config-validate.test.js')
t = p.read_text(encoding='utf-8')
hits = list(re.finditer(r'^(\s*)const keys = Object\.keys\(cfg\.heldBlockValues[^\n]*\n', t, re.M))
assert len(hits) == 1, f'{len(hits)} anchors'
m = hits[0]
t = t[:m.end()] + f'{m.group(1)}expect(keys.length).toBeGreaterThan(0);\n' + t[m.end():]
p.write_text(t, encoding='utf-8')
print('inserted after line', t[:m.end()].count('\n'))
PY
npx vitest run tools/__tests__/figure-config-validate.test.js > "$PASS/logs/b3-vitest2.txt" 2>&1; echo "EXIT=$?"; tail -4 "$PASS/logs/b3-vitest2.txt"
```
Expected: `inserted after line <n>`, then `EXIT=0`. Then reword, by hand, the comment directly above that test the way B-1 Step 6 reworded the kept one: it says the commit that records [USER]'s first values adds this assertion, and this commit is that commit. If the anchor count is not 1, read the held committed-config test
(B-0 Step 6 located it) and insert the same assertion as its first statement after the line that builds the key list.

- [ ] **Step 5: Write the by-value checker and the triptych renderer** (both reused in B-5 and B-6).

```bash
source /home/siggi/.cache/namsbokasafn-audit/c140-step2-pass/bin/env.sh
cat > "$PASS/bin/heldcheck.py" <<'EOF'
#!/usr/bin/env python3
"""$PASS/bin/heldcheck.py — the heldBlockValues labels, checked BY VALUE AT THEIR POSITION in a composed SVG.

    python3 heldcheck.py media       # the published copies in books/efnafraedi-2e/media (B-5)
    python3 heldcheck.py ab <dir>    # B-3's A/B: <dir>/<b>.held.svg vs <dir>/<b>.empty.svg (+ .held.compose.json)

The expected lines are the Part 5 design's predicted delta (docs/superpowers/specs/2026-10-03-c140-step2-part5-
heldblockvalues-design.md, D-j and the D-c width table): (x0, x1, baseline in PDF points, the drawn text with each
script mark decoded to its base glyph). The Icelandic words are [USER]'s values, quoted from
docs/handoffs/2026-10-03-step2-value-sheet.md rows A1-A3 and B1-B6; none is written here.

A label is found by GEOMETRY, never by prose: the <text> items whose x lies in [x0 - 3, x1 + 3] and whose SVG
baseline is within 4.5 pt of the line's (a raised or lowered run sits up to 4.0 pt off it), read left to right.
Stdlib only. Read-only."""
import html
import json
import re
import sys
from collections import Counter
from pathlib import Path

REPO = Path('/home/siggi/dev/repos/namsbokasafn-efni')
MEDIA = REPO / 'books' / 'efnafraedi-2e' / 'media'
EN_DASH = '–'

EXPECT = {
    'CNX_Chem_01_02_MattType': {
        'lines': [(144.70, 158.71, 117.89, 'Nei'), (45.77, 59.78, 66.38, 'Nei'), (281.93, 295.94, 66.38, 'Nei')],
        'gone': ['No']},
    'CNX_Chem_07_04_HNO2_img': {'lines': [(61.24, 76.26, 8.45, 'eða')], 'gone': ['or']},
    'CNX_Chem_09_05_MolSpeed1': {'lines': [(124.79, 191.46, 83.30, 'O2 við T = 300 K')], 'gone': [' at T = 300 K']},
    'CNX_Chem_14_02_phscale': {
        'lines': [(24.36, 63.28, 341.66, '100 eða 1'), (74.01, 112.94, 35.48, '100 eða 1')], 'gone': [' or 1']},
    'CNX_Chem_14_06_buffer': {
        'lines': [(101.72, 234.21, 150.37, f'[CH3CO2H] er 11% af [CH3CO2{EN_DASH}]')], 'gone': ['H] is 11% of [CH']},
    'CNX_Chem_18_04_OxStNonmts': {
        'lines': [(163.83, 170.05, 59.51, 'til'), (241.83, 248.05, 59.51, 'til')], 'gone': ['To']},
    'CNX_Chem_20_04_amide1_img': {
        'lines': [(54.25, 87.26, 83.49, 'H eða R'), (132.76, 165.78, 93.49, 'R eða H'),
                  (122.00, 155.02, 66.12, 'R eða H')],
        'gone': ['H or R', 'R or H']},
}
# compose.json's `held` list per figure (design D-d): (block key, block index, changed visual-line indices).
HELD_REPORT = {
    'CNX_Chem_01_02_MattType': [('No', 11, [0]), ('No', 13, [0]), ('No', 15, [0])],
    'CNX_Chem_07_04_HNO2_img': [('or', 8, [0])],
    'CNX_Chem_09_05_MolSpeed1': [('02 at T = 300 K', 13, [0])],
    'CNX_Chem_14_02_phscale': [('100 or 1', 5, [0]), ('100 or 1', 87, [0])],
    'CNX_Chem_14_06_buffer': [(f'[CH3CO2H] is 11% of [CH3CO2|{EN_DASH}]', 23, [0])],
    'CNX_Chem_18_04_OxStNonmts': [(f'4+|To|4{EN_DASH}', 2, [1]), (f'5+|To|3{EN_DASH}', 4, [1])],
    'CNX_Chem_20_04_amide1_img': [('C|H or R', 0, [1]), ('R or H', 1, [0]), ('R or H', 2, [0])],
}
# The design's nobelium control (D-j): an unlisted `No` in a periodic table stays exactly as it is.
NOBELIUM = ('CNX_Chem_01_03_PeriodicPU', 'CNX_Chem_02_05_PerTable1', 'CNX_Chem_06_04_Econtable',
            'CNX_Chem_18_01_PeriodicPU3', 'CNX_Chem_00_AA_PeriodicPU_img')
NO_ENTRY = 'CNX_Chem_01_04_MYdCmIn'   # value sheet C1-C3: keep the English, so no entry and no change

TEXT = re.compile(r'<text\b([^>]*)>([^<]*)</text>')


def _num(attrs, name):
    return float(re.search(rf'\b{name}="(-?[0-9.]+)"', attrs).group(1))


def page_height(svg):
    return float(re.search(r'viewBox="([^"]+)"', svg).group(1).split()[3])


def items(svg):
    out = []
    for m in TEXT.finditer(svg):
        a = m.group(1)
        out.append({'x': _num(a, 'x'), 'y': _num(a, 'y'), 'text': html.unescape(m.group(2)),
                    'layout': 'font-kerning:none' in a, 'raw': m.group(0)})
    return out


def in_line(it, height, line):
    x0, x1, base, _ = line
    return x0 - 3 <= it['x'] <= x1 + 3 and abs(it['y'] - (height - base)) <= 4.5


def check_figure(svg, b):
    exp, height, its, problems = EXPECT[b], page_height(svg), items(svg), []
    for line in exp['lines']:
        x0, _, base, want = line
        drawn = sorted((i for i in its if in_line(i, height, line)), key=lambda i: i['x'])
        got = ''.join(i['text'] for i in drawn)
        if got != want:
            problems.append(f'{b} @{base}: drew {got!r}, expected {want!r}')
            continue
        if abs(drawn[0]['x'] - x0) > 0.02 or abs(drawn[0]['y'] - (height - base)) > 0.02:
            problems.append(f'{b} @{base}: starts at ({drawn[0]["x"]:.3f}, {drawn[0]["y"]:.3f}), expected '
                            f'({x0:.2f}, {height - base:.2f})')
        if not all(i['layout'] for i in drawn):
            problems.append(f'{b} @{base}: a held item is not on the layout path (no font-kerning:none)')
    for g in exp['gone']:
        k = sum(1 for i in its if i['text'] == g)
        if k:
            problems.append(f'{b}: {k} item(s) still read {g!r}')
    marks = sorted({f'U+{ord(c):04X}' for c in svg if 0x2070 <= ord(c) <= 0x209F})
    if marks:
        problems.append(f'{b}: carries {marks}, a script character drawn as a glyph')
    return problems


def check_ab(held_svg, empty_svg, b):
    lines, problems = EXPECT[b]['lines'], []

    def outside(svg):
        height = page_height(svg)
        return sorted(i['raw'] for i in items(svg) if not any(in_line(i, height, ln) for ln in lines))

    a, e = Counter(outside(held_svg)), Counter(outside(empty_svg))
    if a != e:
        problems.append(f'{b}: outside the held lines the arms differ: with values only '
                        f'{list((a - e).elements())[:3]}, empty only {list((e - a).elements())[:3]}')
    # POSITIVE CONTROL: the empty arm really drew the source English, so the A/B is not one drawing twice.
    for g in EXPECT[b]['gone']:
        if not any(i['text'] == g for i in items(empty_svg)):
            problems.append(f'{b}: CONTROL failed: the empty arm draws no {g!r}, so it is not the no-values arm')
    return problems


def check_report(compose_json, b):
    held = compose_json.get('held')
    if not isinstance(held, list):
        return [f'{b}: compose.json carries no held list']
    got = sorted((h.get('key'), h.get('block'), list(h.get('changed') or [])) for h in held)
    want = sorted((k, n, c) for k, n, c in HELD_REPORT[b])
    return [] if got == want else [f'{b}: compose.json held {got} != predicted {want}']


def check_tree(media=MEDIA):
    problems = []
    for b in EXPECT:
        problems += check_figure((media / f'{b}_IS.svg').read_text(encoding='utf-8'), b)
    for b in NOBELIUM:
        t = (media / f'{b}_IS.svg').read_text(encoding='utf-8')
        no, nei = t.count('>No</text>'), t.count('>Nei</text>')
        if (no, nei) != (1, 0):
            problems.append(f'NOBELIUM CONTROL {b}: >No</text> x{no} (expected 1), >Nei</text> x{nei} (expected 0)')
    return problems


def main(argv):
    if argv == ['media']:
        problems = check_tree()
    elif len(argv) == 2 and argv[0] == 'ab':
        d, problems = Path(argv[1]), []
        for b in EXPECT:
            held = (d / f'{b}.held.svg').read_text(encoding='utf-8')
            empty = (d / f'{b}.empty.svg').read_text(encoding='utf-8')
            problems += check_figure(held, b) + check_ab(held, empty, b)
            problems += check_report(json.loads((d / f'{b}.held.compose.json').read_text(encoding='utf-8')), b)
        if (d / f'{NO_ENTRY}.held.svg').read_bytes() != (d / f'{NO_ENTRY}.empty.svg').read_bytes():
            problems.append(f'{NO_ENTRY}: the two arms differ, but it has no heldBlockValues entry')
        mh = json.loads((d / f'{NO_ENTRY}.held.compose.json').read_text(encoding='utf-8')).get('held')
        if mh != []:
            problems.append(f'{NO_ENTRY}: compose.json held is {mh!r}, expected []')
    else:
        sys.exit('usage: heldcheck.py media | heldcheck.py ab <dir>')
    for p in problems:
        print('FAIL', p)
    print('HELDCHECK PASS' if not problems else f'HELDCHECK FAIL ({len(problems)})')
    return 1 if problems else 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
EOF
cat > "$PASS/bin/triptych.mjs" <<'EOF'
// $PASS/bin/triptych.mjs — old | new | source, side by side, for a by-eye look in Chromium and Firefox.
//   old    = the live June copy: vefur's synced tree (static/content/efnafraedi-2e/chapters/*/images/media)
//   new    = books/efnafraedi-2e/media/<b>_IS.svg after the pass
//   source = OpenStax's published raster, books/efnafraedi-2e/01-source/media/<b>.<jpg|png|jpeg|gif>
// Each is loaded through <img> over HTTP, as a reader gets it, at DSF 2. Read-only on both repositories;
// writes only <outdir>/<engine>/<b>.png and <outdir>/index.tsv. With [newdir], `new` is <newdir>/<b>.held.svg
// instead (B-3's scratch compose, looked at BEFORE the values are committed).
//   node triptych.mjs <listfile> <outdir> [newdir]
import http from 'http';
import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';

const REPO = '/home/siggi/dev/repos/namsbokasafn-efni';
const VEF = '/home/siggi/dev/repos/namsbokasafn-vefur/static/content/efnafraedi-2e/chapters';
const MEDIA = path.join(REPO, 'books/efnafraedi-2e/media');
const SRC = path.join(REPO, 'books/efnafraedi-2e/01-source/media');
const TYPES = { '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.gif': 'image/gif' };
process.exitCode = 1;

const [listFile, outDir, newDir] = process.argv.slice(2);
if (!listFile || !outDir) throw new Error('usage: triptych.mjs <listfile> <outdir> [newdir]');
const names = fs
  .readFileSync(listFile, 'utf-8')
  .split('\n')
  .map((s) => s.trim())
  .filter(Boolean);

const oldCopy = (b) =>
  fs
    .readdirSync(VEF)
    .sort()
    .map((ch) => path.join(VEF, ch, 'images', 'media', `${b}_IS.svg`))
    .find((p) => fs.existsSync(p)) || null;
const srcCopy = (b) =>
  ['.jpg', '.png', '.jpeg', '.gif'].map((e) => path.join(SRC, `${b}${e}`)).find((p) => fs.existsSync(p)) || null;

const files = new Map();
const pages = names.map((b, i) => {
  const cells = [
    ['old (live June)', oldCopy(b)],
    newDir ? ['new (scratch compose)', path.join(newDir, `${b}.held.svg`)] : ['new (media/)', path.join(MEDIA, `${b}_IS.svg`)],
    ['source (OpenStax)', srcCopy(b)],
  ];
  const body = cells
    .map(([label, f], j) => {
      if (!f || !fs.existsSync(f)) return `<figure><figcaption>${b} — ${label}: (none)</figcaption></figure>`;
      const key = `/f/${i}-${j}${path.extname(f).toLowerCase()}`;
      files.set(key, f);
      return `<figure><figcaption>${b} — ${label}</figcaption><img src="${key}"></figure>`;
    })
    .join('');
  const html =
    '<!doctype html><meta charset="utf-8"><style>body{margin:8px;background:#fff;font:12px sans-serif;' +
    'display:flex;gap:12px;align-items:flex-start}figure{margin:0;width:600px}' +
    'img{max-width:600px;display:block;outline:1px solid #ccc}</style>' +
    body;
  return { b, cells, html };
});

const server = http.createServer((req, res) => {
  const u = decodeURIComponent(req.url.split('?')[0]);
  if (u.startsWith('/page/')) {
    const p = pages[Number(u.slice('/page/'.length))];
    res.writeHead(p ? 200 : 404, { 'content-type': 'text/html; charset=utf-8' });
    res.end(p ? p.html : '');
    return;
  }
  const f = files.get(u);
  if (!f) {
    res.writeHead(404);
    res.end();
    return;
  }
  res.writeHead(200, { 'content-type': TYPES[path.extname(f).toLowerCase()] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});
await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
const base = `http://127.0.0.1:${server.address().port}`;
const pwPath = [
  path.join(REPO, 'node_modules', 'playwright', 'index.mjs'),
  path.join(REPO, 'server', 'node_modules', 'playwright', 'index.mjs'),
].find((c) => fs.existsSync(c));
if (!pwPath) throw new Error('playwright is not installed in node_modules or server/node_modules');
const pw = await import(pathToFileURL(pwPath).href);
const rows = ['engine\tbasename\told\tnew\tsource\tnaturalWidths(0 = did not paint)'];
try {
  for (const engine of ['chromium', 'firefox']) {
    const dir = path.join(outDir, engine);
    fs.mkdirSync(dir, { recursive: true });
    const browser = await pw[engine].launch();
    const ctx = await browser.newContext({ deviceScaleFactor: 2, viewport: { width: 1880, height: 800 } });
    const page = await ctx.newPage();
    for (let i = 0; i < pages.length; i += 1) {
      await page.goto(`${base}/page/${i}`);
      await page.waitForFunction(() => [...document.images].every((im) => im.complete), null, { timeout: 120000 });
      const widths = await page.evaluate(() => [...document.images].map((im) => im.naturalWidth));
      await page.screenshot({ path: path.join(dir, `${pages[i].b}.png`), fullPage: true });
      rows.push([engine, pages[i].b, ...pages[i].cells.map(([, f]) => f || '(none)'), widths.join(',')].join('\t'));
    }
    await browser.close();
  }
} finally {
  server.close();
}
fs.writeFileSync(path.join(outDir, 'index.tsv'), `${rows.join('\n')}\n`);
console.log(`done: ${pages.length} figure(s) x 2 engines -> ${outDir}`);
process.exitCode = 0;
EOF
python3 -m py_compile "$PASS/bin/heldcheck.py" && node --check "$PASS/bin/triptych.mjs" && echo OK
python3 -B "$PASS/bin/heldcheck.py" media > "$PASS/logs/b3-heldcheck-control.txt"; echo "control-exit=$?"; tail -2 "$PASS/logs/b3-heldcheck-control.txt"
```
Expected: `OK`, then — as the CONTROL that the checker can see the English it must later see gone — the media
copies, still pre-pass, fail: `control-exit=1` and `HELDCHECK FAIL (21)` (measured 2026-10-03: every failure is the old
English inside its window, e.g. `MattType @117.89: drew 'No'`, and no nobelium line, so those figures are clean).

- [ ] **Step 6: The design's A/B, at 0 ISK, before anything is committed** (Part 5 design D-j: the 8 value-sheet
figures, composed with the committed config against an EMPTY `heldBlockValues`, one at a time; nothing published).

```bash
source /home/siggi/.cache/namsbokasafn-audit/c140-step2-pass/bin/env.sh
H="$PASS/held"; mkdir -p "$H"
python3 -c "
import json
c = json.load(open('$EXP/figure-text.config.json', encoding='utf-8')); c['heldBlockValues'] = {}
json.dump(c, open('$H/empty-held.config.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=2)"
echo '{"blocks": {}}' > "$H/textless.json"
cd "$EXP"
for b in CNX_Chem_01_02_MattType CNX_Chem_07_04_HNO2_img CNX_Chem_09_05_MolSpeed1 CNX_Chem_14_02_phscale CNX_Chem_14_06_buffer CNX_Chem_18_04_OxStNonmts CNX_Chem_20_04_amide1_img CNX_Chem_01_04_MYdCmIn; do
  free -h | sed -n 2p
  p=$(FIGTEXT_PYLIBS=./pylibs python3 -B sources.py --json efnafraedi-2e "$b" | python3 -c "import json,sys; print(json.load(sys.stdin)[sys.argv[1]]['path'])" "$b")
  rm -rf "$H/$b"
  FIGTEXT_PYLIBS=./pylibs python3 -B figure-prepare.py "$p" --basename "$b" --out "$H/$b" > "$H/$b.prepare.log" 2>&1 || { echo "$b PREPARE FAILED"; continue; }
  tr="$REPO/books/efnafraedi-2e/figure-text/$b.is.json"; [ -f "$tr" ] || tr="$H/textless.json"
  FIGTEXT_PYLIBS=./pylibs python3 -B figure-compose.py --out "$H/$b" --translations "$tr" --config "$H/empty-held.config.json" > "$H/$b.empty.log" 2>&1; echo "$b empty-arm exit=$?"
  cp "$H/$b/translated.svg" "$H/$b.empty.svg"
  FIGTEXT_PYLIBS=./pylibs python3 -B figure-compose.py --out "$H/$b" --translations "$tr" > "$H/$b.held.log" 2>&1; echo "$b held-arm exit=$?"
  cp "$H/$b/translated.svg" "$H/$b.held.svg"; cp "$H/$b/compose.json" "$H/$b.held.compose.json"
done
cd "$REPO" && python3 -B "$PASS/bin/heldcheck.py" ab "$PASS/held"; echo "EXIT=$?"; git status --porcelain
```
Expected: no `PREPARE FAILED`; `exit=0` for both arms of all 8 figures (HNO2_img and OxStNonmts compose from the empty
translation set, as the driver's textless route does); then `HELDCHECK PASS` and `EXIT=0`; porcelain shows only the
two files this task has modified. What `HELDCHECK PASS` asserts, per the design's D-j: the 13 changed lines draw
exactly [USER]'s values (script marks as raised/lowered base glyphs) at the predicted start x and baseline within
0.02 pt, on the layout path; none of `No`/`or`/`To`/` at T = 300 K`/` or 1`/`H] is 11% of [CH`/`R or H`/`H or R`
remains; no U+2070–209F character is drawn as a glyph; every `<text>` outside the 13 lines is identical in both
arms; the empty arm draws the English (the positive control); `compose.json` lists `held` as predicted
(MattType `No` ×3 at blocks 11/13/15 … amide1 `C|H or R` block 0 changed line 1); MYdCmIn's two arms are
byte-identical with `held: []`. **Any FAIL stops the task: do not commit values the composer refuses or misplaces.**
An arm that exits 1 prints the `ComposeError` in `$H/<b>.held.log` (a key that matches no block, a send:true key, or a
`heldErrors` refusal such as `does-not-fit`): read it and stop.

- [ ] **Step 7: Look at all 7 held figures, old/new/source, in Chromium and Firefox, BEFORE committing** (ruling (3)
for buffer; the ㊽ lesson for all: a composition under a clean check can still be worse than the June copy).

```bash
source /home/siggi/.cache/namsbokasafn-audit/c140-step2-pass/bin/env.sh
printf '%s\n' CNX_Chem_01_02_MattType CNX_Chem_07_04_HNO2_img CNX_Chem_09_05_MolSpeed1 CNX_Chem_14_02_phscale CNX_Chem_14_06_buffer CNX_Chem_18_04_OxStNonmts CNX_Chem_20_04_amide1_img > "$PASS/eye/b3-list.txt"
free -h | sed -n 2p
node "$PASS/bin/triptych.mjs" "$PASS/eye/b3-list.txt" "$PASS/eye/b3" "$PASS/held"; echo "EXIT=$?"
cut -f1,2,6 "$PASS/eye/b3/index.tsv"
( cd "$EXP" && node render-check.mjs "$PASS/held/CNX_Chem_14_06_buffer.held.svg" "$PASS/eye/b3/buffer-new-x4.png" 1173 965 2 \
  && node render-check.mjs /home/siggi/dev/repos/namsbokasafn-vefur/static/content/efnafraedi-2e/chapters/14/images/media/CNX_Chem_14_06_buffer_IS.svg "$PASS/eye/b3/buffer-old-x4.png" 1173 965 2 \
  && node render-check.mjs "$REPO/books/efnafraedi-2e/01-source/media/CNX_Chem_14_06_buffer.jpg" "$PASS/eye/b3/buffer-source-x4.png" 1173 965 2 ); echo "zoom EXIT=$?"
```
Expected: `EXIT=0`; 14 index rows, each with three non-zero natural widths (a 0 is a copy that did not paint); then
`zoom EXIT=0` (buffer's viewBox is 293.22 × 241.25 pt, so 1173 × 965 is 4×). Open every PNG under `$PASS/eye/b3/`
with the Read tool. For each figure confirm: each held label reads [USER]'s value, in the source's place, weight and
size; scripts are raised or lowered like their neighbours; nothing overlaps; nothing else in the figure differs from
old except what the pass is known to change. For **buffer** (ruling (3)) confirm on the ×4 renders that the charge
`–` after the subscript `2` in `[CH₃CO₂⁻]` reads as a charge and does not collide with `]`. Write one line per
figure to `$PASS/eye/b3-verdicts.tsv` (`basename<TAB>accept|reject<TAB>what you saw`). **Any `reject` stops the task:
show [USER] the PNGs; that figure's entry is not committed until [USER] rules** (a held value cannot be changed for a
sidecar figure after the pass without a further bump, Part 5 design D-h 1).

- [ ] **Step 8: Commit.**

```bash
source /home/siggi/.cache/namsbokasafn-audit/c140-step2-pass/bin/env.sh
git add experiments/figure-text-translation/figure-text.config.json tools/__tests__/figure-config-validate.test.js
git status --porcelain
git commit -F - <<'EOF'
content(c140-㊾): heldBlockValues — [USER]'s values for 7 figures (value sheet A1-A3, B1-B6)

Transcribed by value per the Part 5 design's PR-B handoff: '\n' between lines (B4-B6), U+2013 charges, B1's letter
O, script characters as formatting intent (U+2082/2083/2070/207B); C1-C3 keep the English and have no entry. The
four Part 5 items were ruled 2026-10-03. 0-ISK A/B of the 8 value-sheet figures (committed config vs an empty
table, figure-compose.py into scratch): the 13 changed lines draw the values at the design's predicted positions,
everything else identical, MYdCmIn byte-identical, compose.json `held` as predicted. Looked at old/new/source in
Chromium and Firefox before committing, buffer's charge at 4x. The held committed-config test now requires a
non-empty table.
EOF
git status --porcelain
```
Expected: exactly `M  experiments/figure-text-translation/figure-text.config.json` and
`M  tools/__tests__/figure-config-validate.test.js` before the commit; empty porcelain after.

---

### Task B-7a: `test_figrings.py` censuses the ring carriers on SOURCE artwork (spec D7, first half)

*Drafted 2026-10-03 (`plan-drafts/sections/c38-1-B.md`), never verified then; re-verified for this plan against the
post-PR-A tree: the docstring (lines 20–22, 24–26), the imports (28–32), the section-7 header (415), the brain comment
(431–433) and `main()`'s tuple (507–509) were each found exactly once where quoted, and `sources.py --json` resolved the
four stems to the paths in Step 1 (read-only). Fixes folded in: scratch moved from the `/tmp` tmpfs to `$PASS/c38`;
every command sources `env.sh`; the commit body takes the session's trailers; Step 4 expected six `ok` lines,
not nine. **Its red and green arms were run for this plan** on a scratch copy of the post-PR-A tree with the Step 2
edits applied: fed the published bytes, exactly the brain check failed; on source artwork all six passed, in 24.6 s.*

**Why:** section 7 pins ring candidates in COMMITTED media — exocytosis-88f6 (8 candidates including `mask-491`), the
corpus carrier list `[('CNX_Chem_05_02_HeatMeas_IS.svg', 2)]`, and Econfig (the memoised walk) — and the pass
rewrites all three as ⑭ raster shells with no `<mask>`. After the pass nothing in the suite would exercise the
detector on real bytes. The pass touches neither the source artwork nor the prepare stage, so the anchors move there:
resolve with `sources.py --json` and prepare with `figure-prepare.py` exactly as `tools/figure-run.js` does, then
census the `artwork.svg` the driver's ring gate hands `figure-rings.py census`.

**Measured 2026-10-03 at `2f5f213bf` (read-only; prepare into scratch, deleted after). Predicted values for Step 1:**

| figure (prepared under) | resolved stem | prepare | source census (the ring gate's view) | committed `_IS.svg` census |
|---|---|---|---|---|
| `CNX_Chem_03_01_exocytosis-88f6` | `CNX_Chem_03_01_exocytosis` (base Ch_03 PDF) | 3.6 s, artwork.svg 24.9 MB, 632 `<feImage` | 8: mask-8, -12, -39, -43, -189, -271, -409, -491; memo, 4,773 visits | the same 8 |
| `CNX_Chem_05_02_HeatMeas` | itself | 8.8 s, 4.99 MB, 8 `<feImage` | mask-9, mask-11; memo, 8,650 | mask-9, mask-11 |
| `CNX_Chem_06_04_Econfig` | itself | 1.0 s, 1.39 MB, 324 `<feImage` | none; memo, 1,788 visits | none; memo, 1,797 |
| `CNX_Chem_03_01_brain-ec0b` | `CNX_Chem_03_01_brain` | 1.8 s, 4.96 MB, 0 `<feImage` | **1: mask-2 (source-29, [90, 24], refuse None)** | **0** (healed) |

PR-A's Parts 2–5 do not change these: none of the four carries `/Annots` (the five that do are Ex01_05d/06d,
saccharin, HalAlkane, HalAlkane3), and Parts 3 and 5 change compose, not prepare. So the source arm also restores
brain's visible ring as a REAL-bytes positive, which the committed bytes lost on 2026-09-15.

**Files:**
- Modify: `experiments/figure-text-translation/test_figrings.py` — docstring lines 20–22 and 24–26; imports 28–32; a new
  section inserted immediately before the `# 7. Corpus anchors — the two real carriers, and the corpus-wide count`
  header block (line 415); the brain comment (431–433); `main()`'s tuple (508–509).
- Scratch, never committed: `$PASS/c38/ringprobe.py`, `$PASS/c38/red_7a.py`.

**Interfaces:**
- Consumes: `figrings.find_candidates(svg_text, ring_bytes=RING_BYTES, *, memo=True, stats=None) -> (candidates, viewBox)`
  (candidate fields `mask`, `image`, `px`, `refuse`, `ring`); `sources.py --json <book> <names…>` (stdout
  `{name: {path, edition} | null}`; non-zero exit when a configured tree is unmounted);
  `figure-prepare.py <artwork> --basename <b> --out <dir>` (writes `<dir>/artwork.svg`).
- Produces (in `test_figrings.py`): `BOOK`, `SOURCE_ANCHORS`, `_driver_env()`, `resolve_sources(stems) -> dict`,
  `prepared_artwork_text(artwork, basename) -> str`, `test_source_anchors()`.

- [ ] **Step 1: Re-measure the source values on this branch before writing them down.**

```bash
source /home/siggi/.cache/namsbokasafn-audit/c140-step2-pass/bin/env.sh
free -h | sed -n 2p; df -h "$PASS" | tail -1
cat > "$PASS/c38/ringprobe.py" <<'EOF'
"""Read-only probe: prepare ONE source artwork into scratch the way the driver does, then run the
real figrings.find_candidates on the prepared artwork.svg (what the ring gate censuses), and on the
committed _IS.svg for comparison. Deletes its out dir."""
import json, os, shutil, subprocess, sys, time
from pathlib import Path
EXP = Path('/home/siggi/dev/repos/namsbokasafn-efni/experiments/figure-text-translation')
MEDIA = EXP.parent.parent / 'books' / 'efnafraedi-2e' / 'media'
sys.path.insert(0, str(EXP)); sys.path.insert(0, str(EXP / 'pylibs'))
import figrings
basename, artwork, scratch = sys.argv[1], sys.argv[2], Path(sys.argv[3])
out = scratch / basename
t0 = time.time()
r = subprocess.run([sys.executable, '-B', str(EXP / 'figure-prepare.py'), artwork, '--basename', basename, '--out', str(out)],
                   cwd=str(EXP), env={**os.environ, 'FIGTEXT_PYLIBS': str(EXP / 'pylibs'), 'PYTHONDONTWRITEBYTECODE': '1'},
                   capture_output=True, text=True, timeout=1200)
tp = time.time() - t0
try:
    svg = (out / 'artwork.svg').read_text(encoding='utf-8')
    st = {}
    cs, _ = figrings.find_candidates(svg, stats=st)
    reach, _ = figrings.find_candidates(svg, ring_bytes=float('-inf'))
    print(json.dumps({'basename': basename, 'prepare_exit': r.returncode, 'prepare_s': round(tp, 1),
        'artwork_svg_bytes': len(svg.encode()), 'feImage': svg.count('<feImage'), 'candidates': [c.mask for c in cs],
        'stats': st, 'reach_unbounded': [(c.mask, c.image, c.px, c.refuse) for c in reach][:12]}))
finally:
    shutil.rmtree(out, ignore_errors=True)
for p in sorted(MEDIA.glob(basename + '*_IS.svg')):
    t = p.read_text(encoding='utf-8'); st = {}
    cs, _ = figrings.find_candidates(t, stats=st)
    print(json.dumps({'committed': p.name, 'candidates': [c.mask for c in cs], 'stats': st}))
EOF
( cd "$EXP" && FIGTEXT_PYLIBS=./pylibs python3 -B sources.py --json efnafraedi-2e CNX_Chem_03_01_brain CNX_Chem_03_01_exocytosis CNX_Chem_05_02_HeatMeas CNX_Chem_06_04_Econfig )
```
Expected (measured read-only 2026-10-03):
`{"CNX_Chem_03_01_brain": {"path": "/home/siggi/dev/repos/Myndir/chemistry-2e/base/Ch_03/Source_File/CNX_Chem_03_01_brain.pdf", "edition": "first-edition"}, "CNX_Chem_03_01_exocytosis": {"path": "…/base/Ch_03/Source_File/CNX_Chem_03_01_exocytosis.pdf", …}, "CNX_Chem_05_02_HeatMeas": {"path": "…/base/Ch_05/Source_File/CNX_Chem_05_02_HeatMeas.pdf", …}, "CNX_Chem_06_04_Econfig": {"path": "…/base/Ch_06/Source_File/CNX_Chem_06_04_Econfig.pdf", …}}`
(`…` = `/home/siggi/dev/repos/Myndir/chemistry-2e`, `first-edition` each). Then, one figure at a time, `free -h`
between (use the printed paths if they differ):
```bash
source /home/siggi/.cache/namsbokasafn-audit/c140-step2-pass/bin/env.sh
M=/home/siggi/dev/repos/Myndir/chemistry-2e/base
python3 -B "$PASS/c38/ringprobe.py" CNX_Chem_03_01_brain-ec0b "$M/Ch_03/Source_File/CNX_Chem_03_01_brain.pdf" "$PASS/c38"; free -h | sed -n 2p
python3 -B "$PASS/c38/ringprobe.py" CNX_Chem_03_01_exocytosis-88f6 "$M/Ch_03/Source_File/CNX_Chem_03_01_exocytosis.pdf" "$PASS/c38"; free -h | sed -n 2p
python3 -B "$PASS/c38/ringprobe.py" CNX_Chem_05_02_HeatMeas "$M/Ch_05/Source_File/CNX_Chem_05_02_HeatMeas.pdf" "$PASS/c38"; free -h | sed -n 2p
python3 -B "$PASS/c38/ringprobe.py" CNX_Chem_06_04_Econfig "$M/Ch_06/Source_File/CNX_Chem_06_04_Econfig.pdf" "$PASS/c38"
```
Expected: every value in the table above, `prepare_exit` 0 each (timings vary). **If any census differs, stop**:
something under the prepare stage changed, and the anchors must not be written from a guess.

- [ ] **Step 2: Write section 7a.** Replace the imports (lines 28–32)
```python
import base64
import io
import os
import sys
from pathlib import Path
```
with
```python
import base64
import io
import json
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path
```

Insert immediately before the block
```python
# ---------------------------------------------------------------------------
# 7. Corpus anchors — the two real carriers, and the corpus-wide count
# ---------------------------------------------------------------------------
```
the new section:
```python
# ---------------------------------------------------------------------------
# 7a. Source anchors — the artwork the ring gate censuses, which no recompose rewrites
# ---------------------------------------------------------------------------

BOOK = 'efnafraedi-2e'

# (the CNXML basename the driver prepares under, the name the artwork is delivered as). brain and
# exocytosis are hashed in the CNXML and delivered under the stripped name, which the driver
# reaches through its de-hash second pass; asking sources.py for the stem directly IS that pass.
SOURCE_ANCHORS = (
    ('CNX_Chem_03_01_brain-ec0b', 'CNX_Chem_03_01_brain'),
    ('CNX_Chem_03_01_exocytosis-88f6', 'CNX_Chem_03_01_exocytosis'),
    ('CNX_Chem_05_02_HeatMeas', 'CNX_Chem_05_02_HeatMeas'),
    ('CNX_Chem_06_04_Econfig', 'CNX_Chem_06_04_Econfig'),
)


def _driver_env():
    """The environment tools/figure-run.js gives its resolve and prepare children."""
    return {**os.environ, 'FIGTEXT_PYLIBS': str(HERE / 'pylibs')}


def resolve_sources(stems):
    """`sources.py --json <book> <names…>`, as figure-run.js's resolveArtwork spawns it. A non-zero
    exit is the resolver failing (a configured tree that is not mounted), never "these figures
    have no artwork", so it raises rather than returning nulls."""
    r = subprocess.run([sys.executable, str(HERE / 'sources.py'), '--json', BOOK, *stems],
                       cwd=str(HERE), env=_driver_env(), capture_output=True, text=True,
                       timeout=120)
    if r.returncode != 0:
        raise RuntimeError(f'sources.py exited {r.returncode}: {r.stderr.strip()[-400:]}')
    return json.loads(r.stdout)


def prepared_artwork_text(artwork, basename):
    """figure-prepare.py into a throwaway directory, with the driver's argv, and the artwork.svg it
    writes: the file the driver's ring gate hands `figure-rings.py census`. The directory is
    removed before returning, so one prepared figure is on disk at a time."""
    root = Path(tempfile.mkdtemp(prefix='figrings-src-'))
    out = root / basename
    out.mkdir()
    try:
        r = subprocess.run([sys.executable, str(HERE / 'figure-prepare.py'), str(artwork),
                            '--basename', basename, '--out', str(out)],
                           cwd=str(HERE), env=_driver_env(), capture_output=True, text=True,
                           timeout=1200)
        if r.returncode != 0:
            raise RuntimeError(f'figure-prepare.py exited {r.returncode} on {basename}: '
                               f'{r.stderr.strip()[-400:]}')
        return (out / 'artwork.svg').read_text(encoding='utf-8')
    finally:
        shutil.rmtree(root, ignore_errors=True)


def test_source_anchors():
    print('7a. source anchors — the artwork the ring gate censuses, which no recompose rewrites')
    # 🔴 WHY THESE ANCHORS LIVE ON SOURCE ARTWORK (§C140 ㊾, design D7). Section 7 pinned ring
    # candidates in COMMITTED media, and the step-2 recompose rewrites exocytosis, HeatMeas and
    # Econfig as raster shells (⑭): one <image>, no <mask>, nothing for the detector to find. The
    # pass does not touch the source artwork or the prepare stage, so the real-bytes carriers live
    # on here, prepared the way the driver prepares them. Measured 2026-10-03 at 2f5f213bf: each
    # source census equals the committed one for exocytosis, HeatMeas and Econfig, and brain's
    # source still carries the ring the driver heals.
    if not (HERE / 'sources.local.json').exists():
        skip('source anchors', 'sources.local.json absent — not the figure box')
        return
    try:
        found = resolve_sources([stem for _, stem in SOURCE_ANCHORS])
    except RuntimeError as e:
        check('the resolver answers for the source anchors', False, str(e))
        return
    art = {}
    for basename, stem in SOURCE_ANCHORS:
        hit = found.get(stem)
        if not (hit and hit.get('path')):
            check(f'{stem} resolves to source artwork', False, repr(hit))
            continue
        try:
            art[basename] = prepared_artwork_text(hit['path'], basename)
        except RuntimeError as e:
            check(f'{basename} prepares', False, str(e))

    brain = art.get('CNX_Chem_03_01_brain-ec0b')
    if brain is not None:
        bc, _ = figrings.find_candidates(brain)
        # The ring §C140 ⑩ heals: a REAL-bytes candidate the gate approves. Section 7's published
        # brain carries the heal; this is the ring itself.
        check('brain source carries one candidate, mask-2 (source-29, 90x24, nothing refused)',
              [(c.mask, c.image, c.px, c.refuse) for c in bc]
              == [('mask-2', 'source-29', [90, 24], None)], repr(bc))
    exo = art.get('CNX_Chem_03_01_exocytosis-88f6')
    if exo is not None:
        ec, _ = figrings.find_candidates(exo)
        check('exocytosis source carries eight candidates — reachable only through feImage',
              len(ec) == 8, f'got {[c.mask for c in ec]}')
        check('and mask-491 is among the source candidates (the measured false positive)',
              any(c.mask == 'mask-491' for c in ec), str([c.mask for c in ec]))
    heat = art.get('CNX_Chem_05_02_HeatMeas')
    if heat is not None:
        hc, _ = figrings.find_candidates(heat)
        # ch05's buy (2026-09-19): the counterfactual gate REFUSED both, so they were published
        # unhealed on purpose — real-bytes candidates the gate must refuse.
        check('HeatMeas source carries the two gate-refused candidates, mask-9 and mask-11',
              [c.mask for c in hc] == ['mask-9', 'mask-11'], str([c.mask for c in hc]))
    econ = art.get('CNX_Chem_06_04_Econfig')
    if econ is not None:
        st = {}
        xc, _ = figrings.find_candidates(econ, stats=st)
        # §C140 ㊸ — the figure that held the corpus sweep for over 22 minutes on 2026-09-30.
        check('Econfig source finishes in the memoised walk, in under 5,000 calls',
              st.get('mode') == 'memo' and st.get('visits', 1e9) < 5000, repr(st))
        check('and Econfig source carries no candidate', xc == [], repr(xc))


```

In `main()` replace
```python
               test_edgeline_one_sided, test_gate_is_interventional, test_walk_is_memoised,
               test_corpus_anchors, test_gate_separation_is_documented):
```
with
```python
               test_edgeline_one_sided, test_gate_is_interventional, test_walk_is_memoised,
               test_source_anchors, test_corpus_anchors, test_gate_separation_is_documented):
```

Replace the docstring's lines 20–22
```
⚠️ Since the 2026-09-15 local-box run the committed brain SVG carries the HEAL, not the
ring, so its corpus anchor asserts the healed state with a reachability witness; exocytosis
remains the real-bytes carrier the detector must still fire on.
```
with
```
⚠️ Since the 2026-09-15 local-box run the committed brain SVG carries the HEAL, not the
ring, so its corpus anchor asserts the healed state with a reachability witness.  The
real-bytes carriers the detector must still fire on (brain's ring, exocytosis's eight
candidates, HeatMeas's gate-refused pair) are censused in section 7a on SOURCE artwork,
prepared the way the driver prepares it, because the step-2 recompose (§C140 ㊾) rewrites
the committed exocytosis, HeatMeas and Econfig as raster shells with no <mask>.
```
and lines 24–26
```
The corpus anchors need the committed SVGs under books/.  They SKIP when those are
absent, and the skip is counted and printed, because a silent skip would turn this file
into the empty-result failure it exists to prevent.
```
with
```
The corpus anchors need the committed SVGs under books/.  They SKIP when those are
absent, and the skip is counted and printed, because a silent skip would turn this file
into the empty-result failure it exists to prevent.  The source anchors (7a) need the
machine-local artwork trees and SKIP when sources.local.json is absent.  ON THE FIGURE BOX
a SKIPPED line naming them fails the pre-flight, although main() still exits 0.
```

Replace the brain comment's last three lines (431–433)
```python
    # longer finds the mask at all. A visible ring on REAL bytes now survives only in git
    # history (38f60765) — not read here, because a history lookup is vacuous on a depth-1 clone;
    # the planted 90x24 ring fixture above is its SYNTHETIC stand-in, not a copy of it.
```
with
```python
    # longer finds the mask at all. The visible ring on REAL bytes is censused in section 7a, on
    # brain's SOURCE artwork, which the heal never touches; git history (38f60765) is not read
    # here, because a history lookup is vacuous on a depth-1 clone. The planted 90x24 ring
    # fixture above is its SYNTHETIC stand-in.
```

- [ ] **Step 3: Prove 7a reads the SOURCE (red on purpose, nothing written).** Feed 7a the PUBLISHED bytes instead;
before the pass only brain differs (healed: 0 candidates against 1), so exactly the brain check must go red.

```bash
source /home/siggi/.cache/namsbokasafn-audit/c140-step2-pass/bin/env.sh
cat > "$PASS/c38/red_7a.py" <<'EOF'
import sys
from pathlib import Path
EXP = Path('/home/siggi/dev/repos/namsbokasafn-efni/experiments/figure-text-translation')
sys.path.insert(0, str(EXP))
import test_figrings as t
t.prepared_artwork_text = lambda artwork, basename: (t.MEDIA / f'{basename}_IS.svg').read_text(encoding='utf-8')
t.test_source_anchors()
print('FAILED:', t.FAILED)
names = [f.split(': ', 1)[0] for f in t.FAILED]
sys.exit(0 if names == ['brain source carries one candidate, mask-2 (source-29, 90x24, nothing refused)'] else 1)
EOF
( cd "$EXP" && FIGTEXT_PYLIBS=./pylibs python3 -B "$PASS/c38/red_7a.py"; echo "exit=$?" )
```
Expected: `FAILED:` lists exactly the brain check (an empty-list detail), then `exit=0`. The patch lives only in the
wrapper's process.

- [ ] **Step 4: Run the suite (green).** `free -h` first.

```bash
source /home/siggi/.cache/namsbokasafn-audit/c140-step2-pass/bin/env.sh
( cd "$EXP" && FIGTEXT_PYLIBS=./pylibs timeout 590 python3 -u test_figrings.py > "$PASS/c38/figrings-7a.txt" 2>&1; echo "EXIT=$?" )
tail -3 "$PASS/c38/figrings-7a.txt"; grep -a 'SKIPPED\|  FAIL' "$PASS/c38/figrings-7a.txt"
```
Expected: `EXIT=0`, last line `ALL PASS`, no `SKIPPED` line naming `source anchors`, no `FAIL` line; the 7a block
prints six `ok` lines (brain 1, exocytosis 2, HeatMeas 1, Econfig 2; the 2026-10-03 draft said nine, which was
wrong); section 7's existing checks still pass (the pass has not run).

- [ ] **Step 5: Commit.**

```bash
source /home/siggi/.cache/namsbokasafn-audit/c140-step2-pass/bin/env.sh
git add experiments/figure-text-translation/test_figrings.py && git status --porcelain
git commit -F - <<'EOF'
test(figrings): §C140 ㊾ D7 — ring anchors on SOURCE artwork, prepared as the driver does, 0 ISK

The step-2 recompose rewrites exocytosis, HeatMeas and Econfig as raster shells with no <mask>, so their
committed-bytes anchors cannot outlive it. Section 7a resolves and prepares the source exactly as figure-run.js
does and censuses the artwork.svg its ring gate reads: exocytosis 8 (mask-491), HeatMeas mask-9/mask-11, Econfig
memo walk under 5,000 calls, and brain's real ring (mask-2), which the committed bytes lost to the heal. Shown to
read the source: fed the published bytes, only brain goes red. Skips (counted) off the figure box.
EOF
git status --porcelain
```
Expected: exactly `M  experiments/figure-text-translation/test_figrings.py` before; empty porcelain after.

---

### Task B-bump: `COMPOSER_VERSION` '4' → '5', and the '5' history entry

*Drafted 2026-10-03 (`plan-drafts/sections/c38-2-B.md`), never verified then; re-verified for this plan: the replaced
block is lines 39–47 of `tools/lib/figure-text-sidecar.cjs` (` * a bought figure a recompose missed.` occurs once),
the precondition grep matches `figure-run-free.test.js:1855` after PR-A Part 4, and six test files import the
constant (figure-run-free, figure-run-paid, figure-review-render, figure-text-sidecar, publish-figure-svg,
server figureReviewService) plus `test_figure_compose.py` through a node snippet. Fixes folded in: Step 5 adds
`test_figure_compose.py`; the held sentence says the values are read by `figure-compose.py` and handed to `compose.py`
(Part 5 design D-e); the date is substituted by `sed`; scratch is `$PASS/c38`.*

**Preconditions (check, do not assume):** PR-A is merged and this branch was cut after it (B-0). The data commits
B-1, B-2 and B-3 are on this branch, and B-7a. The value edits MUST precede this commit: a value hashed under '5'
with `composerVersion` left at '4' loops for ever (spec D4), and Step 1's `restampedStale` is the detector.

**What '5' covers:** the composer-path commits since `be19b3a52` (the '4' bump) are exactly `ccabafd08` §C159,
`11c7ee82f` §C168, `6d32335a7` + `ade93a3c2` ㉗, `f9b4cbfff` ⑭ and `a5f5b3750` ㊸ (the font-timestamp pin
`recalcTimestamp=False` arrived with `ccabafd08`), plus this pass's ㉑, §C161 and `heldBlockValues` (PR-A), and the
D9 sentence on ㊴ (#529). The entry is count-free on purpose: counts live in register ㊾.

**Files:**
- Modify: `tools/lib/figure-text-sidecar.cjs` — docstring lines 39–46 and line 47 (`const COMPOSER_VERSION = '4';`).
- Scratch, never committed: `$PASS/c38/stale-probe.mjs`, `$PASS/c38/suite-*.json`, `$PASS/c38/red-*.txt`.

**Interfaces:**
- Consumes: `isStale(sidecar)` (`tools/figure-run.js`), `readSidecar(bookDir, basename)` and `COMPOSER_VERSION`.
- Produces: `COMPOSER_VERSION === '5'`, read by `tools/figure-run.js` (`isStale`, mint), `tools/publish-figure-svg.js`
  (stamp), `tools/cnxml-render.js` (badge) and `server/services/figureReviewService.js` (so the deploy that carries it
  is a server deploy).

- [ ] **Step 1: Measure the stale set before the bump.**

```bash
source /home/siggi/.cache/namsbokasafn-audit/c140-step2-pass/bin/env.sh
grep -an "states which sidecar world it runs in" tools/__tests__/figure-run-free.test.js
cat > "$PASS/c38/stale-probe.mjs" <<'EOF'
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
const R = '/home/siggi/dev/repos/namsbokasafn-efni';
const { isStale } = await import(`${R}/tools/figure-run.js`);
const require = createRequire(import.meta.url);
const { readSidecar, COMPOSER_VERSION } = require(`${R}/tools/lib/figure-text-sidecar.cjs`);
const bookDir = path.join(R, 'books', 'efnafraedi-2e');
const names = fs
  .readdirSync(path.join(bookDir, 'figure-text'))
  .filter((f) => f.endsWith('.is.json'))
  .map((f) => f.slice(0, -'.is.json'.length));
const staleNames = [];
let unreadable = 0;
let restampedStale = 0;
for (const n of names) {
  const s = readSidecar(bookDir, n);
  if (!s) {
    unreadable += 1;
    continue;
  }
  if (isStale(s)) staleNames.push(n);
  // A restamp (what the pass writes) must make every sidecar current. One that stays stale was
  // hashed under the wrong version: the D4 loop.
  if (isStale({ ...s, composedHash: s.renderHash, composedVersion: COMPOSER_VERSION })) restampedStale += 1;
}
console.log(JSON.stringify({ COMPOSER_VERSION, files: names.length, unreadable, stale: staleNames.length, restampedStale, staleNames: staleNames.length <= 10 ? staleNames : `(${staleNames.length})` }));
EOF
node "$PASS/c38/stale-probe.mjs"
```
Expected: one grep line; then
`{"COMPOSER_VERSION":"4","files":460,"unreadable":0,"stale":2,"restampedStale":0,"staleNames":["CNX_Chem_10_05_Graphene","CNX_Chem_12_07_HetCats-230a"]}`
(the order of the two names follows the directory listing). Any other stale name stops the task: a sidecar changed
outside the ruled edits. `restampedStale > 0` stops it: a value edit was hashed under the wrong version.

- [ ] **Step 2: Record the full suite's failing set before the edit.**

```bash
source /home/siggi/.cache/namsbokasafn-audit/c140-step2-pass/bin/env.sh
npx vitest run --reporter=json --outputFile="$PASS/c38/suite-before.json" > "$PASS/c38/suite-before.out" 2>&1; echo "exit=$?"
node -e "const r=require('$PASS/c38/suite-before.json');const red=[];for(const f of r.testResults){for(const a of f.assertionResults)if(a.status==='failed')red.push(a.fullName);if(f.status==='failed'&&!f.assertionResults.some((a)=>a.status==='failed'))red.push('FILE '+f.name)}require('fs').writeFileSync('$PASS/c38/red-before.txt',red.sort().join('\n')+'\n');console.log('failing entries',red.length)"
```
It records failing tests AND failing files (a file that errors or times out has no failed assertion). If the run
outlasts the 10-minute foreground cap, run it detached
(`setsid nohup bash -c 'source /home/siggi/.cache/namsbokasafn-audit/c140-step2-pass/bin/env.sh && npx vitest run --reporter=json --outputFile="$PASS/c38/suite-before.json" > "$PASS/c38/suite-before.out" 2>&1; echo "EXIT=$?" >> "$PASS/c38/suite-before.out"' > /dev/null 2>&1 < /dev/null &`)
and wait with the Monitor tool until `grep -aq '^EXIT=' "$PASS/c38/suite-before.out"` before reading the JSON.
Expected: `failing entries <n>`. Then run `diff "$PASS/c38/red-base.txt" "$PASS/c38/red-before.txt" | grep -a '^>'; echo "new-reds-exit=$? (1 = none, required)"`. `red-base.txt` is B-0 Step 9's run at the base, so a `>` line is a red that B-1, B-2, B-3 or B-7a introduced: stop and classify it by name before the bump. Only then is `red-before.txt` the baseline for Step 6 and B-8 Step 2.

- [ ] **Step 3: Bump the constant and write the '5' entry.** In `tools/lib/figure-text-sidecar.cjs` replace
```
 * a bought figure a recompose missed.
 *
 * THE RULE FROM HERE: skip a bump only if no sidecar carries `state` AND prod holds no figure
 * approval up to the deploy that carries the change (editors approve against prod's own checkout of
 * the media); otherwise bump. ⚠️ A bump's recompose must be bare `--stale` (never `--force`, which
 * hides whether every sidecar went stale) and changes ONE sidecar field, `composedVersion`; a
 * sidecar's `composerVersion` stays the version its `renderHash` was hashed under.
 */
const COMPOSER_VERSION = '4';
```
with
```
 * a bought figure a recompose missed.
 *
 * '5' (DATE, §C140 ㊾, the step-2 recompose pass): one recompose for every composer change since
 * '4' that alters pixels or bytes, and for three made for the pass. Since '4': §C159 (ccabafd08:
 * textless figures recomposed from source, and font subsets saved with a pinned timestamp, so an
 * unchanged figure recomposes byte-identical), §C168 (11c7ee82f: the heavy tail drawn as raster
 * artwork under live text), ㉗ (6d32335a7, ade93a3c2: FigIS subsets renamed, carrying the OFL
 * licence in `<metadata>`) and ⑭ (f9b4cbfff: artwork holding an in-document feImage rasterised
 * the same way, because Firefox paints it transparent). ㊸ (a5f5b3750, the ring detector's
 * memoised walk) is output-neutral — test_figrings.py section 6b asserts it finds exactly what the
 * original walk finds — and is named so nobody bumps for it. Made for the pass: ㉑ (a label
 * block's visual line count read from its own cues and alignment), §C161 (`/Annots` comment icons
 * dropped before the artwork is drawn) and `heldBlockValues` (a held, send:false block drawn with
 * a value [USER] ruled; figure-compose.py reads it from figure-text.config.json and hands it to
 * compose.py, like numloc's decimal comma it changes no sidecar, and a later change to a value
 * reaches a sidecar figure's media only at the next bump).
 *
 * THE RULE FROM HERE: skip a bump only if no sidecar carries `state` AND prod holds no figure
 * approval up to the deploy that carries the change (editors approve against prod's own checkout of
 * the media); otherwise bump. ⚠️ A bump's recompose must be bare `--stale` (never `--force`, which
 * hides whether every sidecar went stale) and changes ONE sidecar field, `composedVersion`; a
 * sidecar's `composerVersion` stays the version its `renderHash` was hashed under.
 * ⚠️ WHAT A BARE `--stale` REACHES CHANGED WITH ㊴ (#529): it selects a figure with a sidecar file
 * OR an image-mapping row, so it reaches the §C159 textless figures too, and it never buys (a
 * selected figure with no sidecar that classifies `translated` is refused `skipped-unbought`).
 * Textless figures carry no stamp, so EVERY `--stale` run recomposes them: check their convergence
 * by byte identity across two runs, never by `skipped-current`. A figure in `keptCopies` is
 * refused at resolution and never recomposed. Run the pass as
 * `node tools/figure-run.js --book <slug> --chapter <N> --stale`, one chapter at a time, never
 * through `scripts/chemistry-autorun-chapter.sh`, which runs the driver without `--stale`.
 */
const COMPOSER_VERSION = '5';
```
Then substitute the date and confirm:
```bash
source /home/siggi/.cache/namsbokasafn-audit/c140-step2-pass/bin/env.sh
sed -i "s/'5' (DATE, §C140/'5' ($(date -u +%F), §C140/" tools/lib/figure-text-sidecar.cjs
grep -an "'5' (DATE" tools/lib/figure-text-sidecar.cjs; echo "grep-exit=$?"; grep -an "^const COMPOSER_VERSION" tools/lib/figure-text-sidecar.cjs; git diff --stat
```
Expected: no match (`grep-exit=1`), then `const COMPOSER_VERSION = '5';`, one file changed. (`.cjs` is outside
`format:check`'s `tools/**/*.js` glob and lint-staged's.)

- [ ] **Step 4: Every sidecar is now stale, and a restamp would make every one current.**

```bash
source /home/siggi/.cache/namsbokasafn-audit/c140-step2-pass/bin/env.sh
node "$PASS/c38/stale-probe.mjs"
```
Expected: `{"COMPOSER_VERSION":"5","files":460,"unreadable":0,"stale":460,"restampedStale":0,"staleNames":"(460)"}`.

- [ ] **Step 5: The six Vitest files and test_figure_compose.py that read the constant, plus three neighbouring suites, by name.**

```bash
source /home/siggi/.cache/namsbokasafn-audit/c140-step2-pass/bin/env.sh
for f in tools/__tests__/figure-run-free.test.js tools/__tests__/figure-run-paid.test.js tools/__tests__/figure-review-render.test.js tools/__tests__/figure-text-sidecar.test.js tools/__tests__/publish-figure-svg.test.js tools/__tests__/figure-enumerate.test.js tools/__tests__/retire-translated-figure.test.js server/__tests__/figureReviewService.test.js server/__tests__/figureReviewRoutes.test.js; do npx vitest run "$f" > "$PASS/c38/one.out" 2>&1; echo "$f exit=$?"; done
( cd "$EXP" && FIGTEXT_PYLIBS=./pylibs python3 -B -u test_figure_compose.py > "$PASS/c38/figure_compose.txt" 2>&1; echo "test_figure_compose.py EXIT=$?" ); tail -1 "$PASS/c38/figure_compose.txt"
```
Expected: `exit=0` for all nine, then `EXIT=0` and `ALL PASS`. If `figure-run-free` fails on `skips exactly…`,
`names an unresolved figure… (R9)` or `leaves both ch21 figures unresolved…`, PR-A's ㊳ fix is missing: stop.

- [ ] **Step 6: The full suite's failing set is unchanged, both directions.**

```bash
source /home/siggi/.cache/namsbokasafn-audit/c140-step2-pass/bin/env.sh
npx vitest run --reporter=json --outputFile="$PASS/c38/suite-after.json" > "$PASS/c38/suite-after.out" 2>&1; echo "exit=$?"
node -e "const r=require('$PASS/c38/suite-after.json');const red=[];for(const f of r.testResults){for(const a of f.assertionResults)if(a.status==='failed')red.push(a.fullName);if(f.status==='failed'&&!f.assertionResults.some((a)=>a.status==='failed'))red.push('FILE '+f.name)}require('fs').writeFileSync('$PASS/c38/red-after.txt',red.sort().join('\n')+'\n');console.log('failing entries',red.length)"
diff "$PASS/c38/red-before.txt" "$PASS/c38/red-after.txt"; echo "diff-exit=$?"
```
(Detached as in Step 2 if it outlasts the cap.) Expected: `diff-exit=0`. Any line in either direction is a finding
to classify before committing. `npm test` is not the CI Tests job (E2E is separate); this commit touches no E2E path.

- [ ] **Step 7: Commit.**

```bash
source /home/siggi/.cache/namsbokasafn-audit/c140-step2-pass/bin/env.sh
git add tools/lib/figure-text-sidecar.cjs && git status --porcelain
git commit -F - <<'EOF'
feat(c140-㊾): COMPOSER_VERSION '4' -> '5' — one recompose for §C159 §C168 ㉗ ⑭ and the pass's ㉑ §C161 heldBlockValues, 0 ISK

tools/lib/figure-text-sidecar.cjs only: the constant, a '5' history entry naming each covered change by commit (㊸
named as output-neutral), and the ㊴ note on what a bare --stale now reaches (textless figures, unstamped, recomposed
on every run; never buys; never through the autorun wrapper). Stale probe: every sidecar stale, a restamp makes
every one current. The files that read the constant pass by name; the full suite's failing set is unchanged both ways.
EOF
git status --porcelain
```
Expected: exactly `M  tools/lib/figure-text-sidecar.cjs` before; empty porcelain after. This commit is green on its
own (PR-A's ㊳ fix), but D8 governs the MERGE: the bump, the restamped sidecars, the media and the re-pinned anchors
merge together, and the deploy carrying '5' needs the prod checks first (B-8).

---

### Task B-4: The pass — 22 chapter runs of `figure-run.js --stale`, each after its dry run

**Files:** writes `books/efnafraedi-2e/media/*_IS.svg` and one line in each sidecar under
`books/efnafraedi-2e/figure-text/` (two lines for HetCats and Graphene). Nothing else in the repo. Scratch:
`$PASS/bin/{predict.mjs,check-run.mjs,run-chapter.sh,prepass.py}`, `$PASS/predict.json`, `$PASS/prepass-media.json`,
`$PASS/logs/`.

**Interfaces:**
- Consumes: the summary `tools/figure-run.js` `summarise` prints (header `DRY RUN — …` / `LIVE RUN`; tally lines
  `  <n>  <outcome>` and `  <n>  = enumerated`; two-space headings ending `:` with four-space children; `VERDICT ok`
  or `VERDICT needs a human` and its reasons; a `NOTE (not a failure)` reason is never fatal); Part 5's held section
  and NOTE (pinned in B-0 Step 6); PR-A Part 2's prepare warning `annotations removed from page 1: <n> /Popup, <n> /Text (§C161)`.
- Produces: 22 chapter commits (plus one for the first two figures), every sidecar at `composedVersion` '5', and the
  logs B-5 and B-8 read.

**What every live run is checked for** (`check-run.mjs`, per chapter, against `predict.json`): the run finished; the
tally sums to the selection; `translated + skipped-current` = the chapter's sidecar figures; `unresolved` = its kept
figures, each named `REFUSED — kept` and `readers still see an earlier translated copy`; the textless figures are all
classified; 0 `skipped-unbought`, 0 `failed-*`, no `would buy`; the named textless figures recomposed; exactly the
predicted §C161 warnings; no ring gate that could not run (㊼); `MT spawned for 0 figure(s), 0 billable characters`;
`published` = translated + recomposed textless; exactly the predicted held labels and the held NOTE; `VERDICT ok`.
**Read the verdict REASONS too, not only the word ok** (spec group B): ㊹ — compose NOTEs (`localized`, `overflow`,
`unformatted`, `containerErrors`) are counted for `translated` figures only, so a textless figure's notes never reach
the verdict; a missing NOTE is not evidence of no note.

**Per-chapter predictions** (measured with the driver's own enumerator on 2026-10-03 at `3d9b5d2e5`: every chapter
matched the 2026-10-02 re-derivation except the three changes B-1 makes, applied below; `predict.mjs` re-measures
them in Step 0):

| # | `--chapter` | run | selected | sidecars | textless | kept → `unresolved` | also predicted (live unless marked) |
|---|---|---|---|---|---|---|---|
| 1 | `1` | foreground | 24 | 24 | 0 | — | Archery already done (`--done CNX_Chem_01_05_Archery`); held MattType `No` blocks 11, 13, 15 |
| 2 | `2` | foreground | 32 | 20 | 12 | PerTable2 | |
| 3 | `3` | foreground | 28 | 15 | 13 | ibuprofenmass_img | brain already done (`--done CNX_Chem_03_01_brain-ec0b`); §C161 Ex01_05d `1 /Popup, 1 /Text`, Ex01_06d `2 /Popup, 2 /Text` (dry and live); both recomposed; ring gate: exocytosis 8 candidates (dry: "not gated in a dry run"; live: healed or refused, either is moot because ⑭ draws it from `artwork.png`) |
| 4 | `4` | foreground | 21 | 19 | 2 | — | §C161 saccharin `1 /Popup, 1 /Text` (dry and live), recomposed |
| 5 | `5` | foreground | 16 | 16 | 0 | — | ring gate: HeatMeas 2 candidates (moot: rasterised) |
| 6 | `6` | foreground | 40 | 23 | 17 | — | |
| 7 | `7` | **detached** | 71 | 16 | 55 | — | HNO2_img recomposed; held HNO2_img `or` block 8 |
| 8 | `8` | **detached** | 55 | 25 | 30 | — | pi and sp2Conv recomposed (textless ⑭ rasters) |
| 9 | `9` | foreground | 16 | 16 | 0 | — | held MolSpeed1 `02 at T = 300 K` block 13 |
| 10 | `10` | **detached** | 44 | 40 | 4 | — | Graphene (B-2's value); ≥ 3 GiB free first |
| 11 | `11` | **detached** | 21 | 20 | 1 | — | ≥ 3 GiB free first |
| 12 | `12` | **detached** | 32 | 30 | 2 | — | HetCats (B-2's values); ≥ 3 GiB free first |
| 13 | `13` | foreground | 10 | 9 | 1 | catalyst | |
| 14 | `14` | foreground | 24 | 24 | 0 | — | held phscale `100 or 1` blocks 5, 87 and buffer block 23 (2 figures in the NOTE); conjugate_img (㉑); ICE pair media byte-identical |
| 15 | `15` | foreground | 22 | 15 | 7 | — | |
| 16 | `16` | foreground | 7 | 6 | 1 | — | |
| 17 | `17` | foreground | 17 | 17 | 0 | — | |
| 18 | `18` | foreground | 36 | 20 | 16 | — | OxStNonmts recomposed; held OxStNonmts `4+\|To\|4–` block 2, `5+\|To\|3–` block 4; Nitrogen (㉑) |
| 19 | `19` | foreground | 32 | 15 | 17 | — | |
| 20 | `20` | **detached** | 126 | 53 | 73 | — | §C161 HalAlkane, HalAlkane3 `1 /Popup, 1 /Text` each (dry and live), recomposed; held amide1 `C\|H or R` block 0, `R or H` blocks 1, 2 |
| 21 | `21` | foreground | 25 | 25 | 0 | — | |
| 22 | `appendices` | foreground | 12 | 12 | 0 | — | |

Totals: 711 selected, 460 sidecar figures, 251 textless rows, 3 kept. Across the pass: exactly **5** `annotations
removed` warnings and **0** `AnnotationRefused` (PR-A Part 2); held NOTEs in exactly ch01, ch07, ch09, ch14 (2
figures), ch18 and ch20 (Part 5 design D-j). Not predicted, read and recorded by `check-run.mjs`: how the textless
population splits between `copied-textless`, `copied-photo` and `unreadable-text`, and which textless figures carry a
raster and are not recomposed.

- [ ] **Step 0: The pass's tooling, its predictions, and the pre-pass snapshot.**

```bash
source /home/siggi/.cache/namsbokasafn-audit/c140-step2-pass/bin/env.sh
cat > "$PASS/bin/predict.mjs" <<'EOF'
// $PASS/bin/predict.mjs — the pass's per-chapter predictions, MEASURED from the tree with the driver's own
// enumerator (tools/figure-run.js enumerateChapterFigures) and checked against the table this plan carries.
// Writes $PASS/predict.json for check-run.mjs. Read-only on the repo. Exit 0 only when every chapter matches.
import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';

const REPO = '/home/siggi/dev/repos/namsbokasafn-efni';
const PASS = '/home/siggi/.cache/namsbokasafn-audit/c140-step2-pass';
process.exitCode = 1;
const { enumerateChapterFigures } = await import(path.join(REPO, 'tools/figure-run.js'));
const bookDir = path.join(REPO, 'books', 'efnafraedi-2e');
const cfg = JSON.parse(
  fs.readFileSync(path.join(REPO, 'experiments/figure-text-translation/figure-text.config.json'), 'utf-8')
);
const kept = new Set(Object.keys(cfg.keptCopies || {}));
const rows = new Set(
  JSON.parse(fs.readFileSync(path.join(bookDir, 'media/image-mapping.json'), 'utf-8'))
    .map((r) => r.originalImage)
    .filter(Boolean)
);
const hasSidecar = (b) => fs.existsSync(path.join(bookDir, 'figure-text', `${b}.is.json`));

// [selected, sidecar figures, textless figures] per --chapter value. Source: the 2026-10-02 re-derivation's
// bump item (rederive.json, measured at 1fd497687), with ch02 moving one figure from sidecar to textless
// when B-1 deleted PerTable2's sidecar.
const EXPECTED = {
  1: [24, 24, 0], 2: [32, 20, 12], 3: [28, 15, 13], 4: [21, 19, 2], 5: [16, 16, 0], 6: [40, 23, 17],
  7: [71, 16, 55], 8: [55, 25, 30], 9: [16, 16, 0], 10: [44, 40, 4], 11: [21, 20, 1], 12: [32, 30, 2],
  13: [10, 9, 1], 14: [24, 24, 0], 15: [22, 15, 7], 16: [7, 6, 1], 17: [17, 17, 0], 18: [36, 20, 16],
  19: [32, 15, 17], 20: [126, 53, 73], 21: [25, 25, 0], appendices: [12, 12, 0],
};
const KEPT_EXPECTED = {
  2: ['CNX_Chem_02_05_PerTable2'],
  3: ['CNX_Chem_03_01_ibuprofenmass_img'],
  13: ['CNX_Chem_13_03_catalyst'],
};
// PR-A Part 2's handoff: exactly these five figures lose a comment annotation.
const ANNOTS = {
  3: { CNX_Chem_03_01_Ex01_05d_img: '1 /Popup, 1 /Text', CNX_Chem_03_01_Ex01_06d_img: '2 /Popup, 2 /Text' },
  4: { CNX_Chem_04_04_saccharin_img: '1 /Popup, 1 /Text' },
  20: { CNX_Chem_20_01_HalAlkane_img: '1 /Popup, 1 /Text', CNX_Chem_20_01_HalAlkane3_img: '1 /Popup, 1 /Text' },
};
// The Part 5 design's D-j: summarise prints `basename: "key" block N`, one line per drawn label.
const h = (b, key, block) => `${b}: ${JSON.stringify(key)} block ${block}`;
const D = '–';
const HELD = {
  1: [h('CNX_Chem_01_02_MattType', 'No', 11), h('CNX_Chem_01_02_MattType', 'No', 13), h('CNX_Chem_01_02_MattType', 'No', 15)],
  7: [h('CNX_Chem_07_04_HNO2_img', 'or', 8)],
  9: [h('CNX_Chem_09_05_MolSpeed1', '02 at T = 300 K', 13)],
  14: [
    h('CNX_Chem_14_02_phscale', '100 or 1', 5),
    h('CNX_Chem_14_02_phscale', '100 or 1', 87),
    h('CNX_Chem_14_06_buffer', `[CH3CO2H] is 11% of [CH3CO2|${D}]`, 23),
  ],
  18: [h('CNX_Chem_18_04_OxStNonmts', `4+|To|4${D}`, 2), h('CNX_Chem_18_04_OxStNonmts', `5+|To|3${D}`, 4)],
  20: [
    h('CNX_Chem_20_04_amide1_img', 'C|H or R', 0),
    h('CNX_Chem_20_04_amide1_img', 'R or H', 1),
    h('CNX_Chem_20_04_amide1_img', 'R or H', 2),
  ],
};
// Textless figures each chapter's run must recompose: the §C161 five, the two held textless figures, and
// ch08's two textless feImage figures (pdfimages found 0 image XObjects in their sources, 2026-10-02).
const MUST_RECOMPOSE = {
  3: ['CNX_Chem_03_01_Ex01_05d_img', 'CNX_Chem_03_01_Ex01_06d_img'],
  4: ['CNX_Chem_04_04_saccharin_img'],
  7: ['CNX_Chem_07_04_HNO2_img'],
  8: ['CNX_Chem_08_01_pi', 'CNX_Chem_08_02_sp2Conv'],
  18: ['CNX_Chem_18_04_OxStNonmts'],
  20: ['CNX_Chem_20_01_HalAlkane_img', 'CNX_Chem_20_01_HalAlkane3_img'],
};

const out = { measuredAt: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: REPO, encoding: 'utf-8' }).trim(), chapters: {} };
let bad = 0;
for (const ch of Object.keys(EXPECTED)) {
  const sel = enumerateChapterFigures('efnafraedi-2e', ch).figures.filter(
    (f) => hasSidecar(f.basename) || rows.has(f.basename)
  );
  const sidecars = sel.filter((f) => hasSidecar(f.basename)).length;
  const textless = sel.length - sidecars;
  const keptHere = sel.map((f) => f.basename).filter((b) => kept.has(b)).sort();
  const [xs, xsc, xt] = EXPECTED[ch];
  const same =
    sel.length === xs &&
    sidecars === xsc &&
    textless === xt &&
    JSON.stringify(keptHere) === JSON.stringify(KEPT_EXPECTED[ch] || []);
  if (!same) bad += 1;
  console.log(
    `${same ? 'ok  ' : 'DIFF'} ${String(ch).padStart(10)}  selected ${sel.length} (exp ${xs})  sidecars ${sidecars} (exp ${xsc})  ` +
      `textless ${textless} (exp ${xt})  kept ${JSON.stringify(keptHere)}`
  );
  out.chapters[ch] = {
    selected: sel.length,
    sidecars,
    textless,
    kept: keptHere,
    annots: ANNOTS[ch] || {},
    held: HELD[ch] || [],
    mustRecompose: MUST_RECOMPOSE[ch] || [],
  };
}
fs.writeFileSync(path.join(PASS, 'predict.json'), `${JSON.stringify(out, null, 1)}\n`);
console.log(bad ? `PREDICT DIFF in ${bad} chapter(s) — stop and re-derive` : `PREDICT OK (22 chapters) at ${out.measuredAt}`);
process.exitCode = bad ? 1 : 0;
EOF
cat > "$PASS/bin/check-run.mjs" <<'EOF'
// $PASS/bin/check-run.mjs — compare ONE figure-run.js summary with the PR-B plan's prediction for its chapter.
//   node check-run.mjs <log> <chapter> <dry|live> [--done <b1,b2>] [--resumed] [--dry-log <path>]
// Parses the summary by its own layout (tools/figure-run.js summarise). Prints one line per check, then
// `CHECK PASS` or `CHECK FAIL (n)`. Exit 0 only when every check passes. Read-only.
import fs from 'fs';

const PASS = '/home/siggi/.cache/namsbokasafn-audit/c140-step2-pass';
const OUTCOMES = [
  'translated',
  'copied-photo',
  'copied-textless',
  'unresolved',
  'unreadable-text',
  'failed-prepare',
  'failed-mt',
  'failed-compose',
  'failed-publish',
  'failed-sidecar',
  'skipped-current',
  'skipped-unbought',
];
process.exitCode = 1; // failure default: only a reached verdict overwrites it

const [logPath, chapter, mode, ...rest] = process.argv.slice(2);
const opt = { done: [], resumed: false, dryLog: null };
for (let i = 0; i < rest.length; i += 1) {
  if (rest[i] === '--done') opt.done = rest[(i += 1)].split(',').filter(Boolean);
  else if (rest[i] === '--resumed') opt.resumed = true;
  else if (rest[i] === '--dry-log') opt.dryLog = rest[(i += 1)];
  else throw new Error(`unknown argument ${rest[i]}`);
}
if (!logPath || !chapter || !['dry', 'live'].includes(mode)) {
  throw new Error('usage: check-run.mjs <log> <chapter> <dry|live> [--done a,b] [--resumed] [--dry-log p]');
}
const P = JSON.parse(fs.readFileSync(`${PASS}/predict.json`, 'utf-8')).chapters[chapter];
if (!P) throw new Error(`predict.json has no chapter ${chapter}`);

function parse(text) {
  const lines = text.split('\n');
  const vi = lines.findIndex((l) => l === 'VERDICT ok' || l === 'VERDICT needs a human');
  const r = { first: lines[0], tally: {}, heads: [], singles: [], verdictOk: null, reasons: [], all: text };
  if (vi < 0) return r;
  r.verdictOk = lines[vi] === 'VERDICT ok';
  r.reasons = lines
    .slice(vi + 1)
    .filter((l) => l.startsWith('  '))
    .map((l) => l.trim());
  const tallyRe = new RegExp(`^\\s+(\\d+)  (${[...OUTCOMES, '= enumerated'].join('|')})$`);
  let cur = null;
  for (const l of lines.slice(1, vi)) {
    const t = tallyRe.exec(l);
    if (t) {
      r.tally[t[2]] = Number(t[1]);
      cur = null;
    } else if (l.trim() === '') {
      cur = null;
    } else if (/^ {2}\S/.test(l)) {
      if (l.endsWith(':')) {
        cur = { head: l.trim(), items: [] };
        r.heads.push(cur);
      } else {
        cur = null;
        r.singles.push(l.trim());
      }
    } else if (/^ {4}\S/.test(l) && cur) {
      cur.items.push(l.trim());
    }
  }
  return r;
}

const fails = [];
const check = (name, cond, detail = '') => {
  console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${name}${cond ? '' : `  — ${detail}`}`);
  if (!cond) fails.push(name);
};
const r = parse(fs.readFileSync(logPath, 'utf-8'));
const n = (k) => r.tally[k] || 0;
const items = (prefix) => {
  const h = r.heads.find((x) => x.head.startsWith(prefix));
  return h ? h.items : [];
};

check('the run reached a verdict', r.verdictOk !== null, 'no VERDICT line: the run did not finish');
check(
  'mode header',
  r.first === (mode === 'dry' ? 'DRY RUN — nothing bought, nothing written under books/' : 'LIVE RUN'),
  r.first
);
check('= enumerated equals the selection', n('= enumerated') === P.selected, `${n('= enumerated')} vs ${P.selected}`);
check(
  'translated + skipped-current equals the sidecar figures',
  n('translated') + n('skipped-current') === P.sidecars,
  `${n('translated')} + ${n('skipped-current')} vs ${P.sidecars}`
);
if (!opt.resumed) {
  check(
    'skipped-current equals the figures already run live in this chapter',
    n('skipped-current') === opt.done.length,
    `${n('skipped-current')} vs ${opt.done.length}`
  );
}
check('unresolved equals the kept figures', n('unresolved') === P.kept.length, `${n('unresolved')} vs ${P.kept.length}`);
check(
  'the textless population is fully classified',
  n('copied-textless') + n('copied-photo') + n('unreadable-text') === P.textless - P.kept.length,
  `${n('copied-textless')} + ${n('copied-photo')} + ${n('unreadable-text')} vs ${P.textless - P.kept.length}`
);
check('0 skipped-unbought', n('skipped-unbought') === 0, `${n('skipped-unbought')}`);
for (const k of OUTCOMES.filter((o) => o.startsWith('failed-'))) check(`0 ${k}`, n(k) === 0, `${n(k)}`);
const refusals = r.singles.filter((s) => s.startsWith('⚠️ REFUSED'));
check(
  'exactly one REFUSED line per kept figure, and no other refusal',
  refusals.length === P.kept.length && P.kept.every((b) => refusals.some((s) => s.startsWith(`⚠️ REFUSED — kept: ${b}: `))),
  JSON.stringify(refusals)
);
for (const b of P.kept) {
  check(
    `${b}: its kept copy is named as still served`,
    r.singles.some((s) =>
      s.startsWith(`⚠️ readers still see an earlier translated copy of ${b}: media/${b}_IS.svg (mapping row present)`)
    ),
    'no "readers still see" line'
  );
}
check(
  'no hole in the artwork delivery',
  items('unresolved — the artwork delivery has a hole here').length === 0,
  JSON.stringify(items('unresolved — the artwork delivery has a hole here'))
);
check(
  'nothing would be bought',
  !r.singles.some((s) => s.startsWith('would buy') || s.startsWith('buyable this run')),
  JSON.stringify(r.singles.filter((s) => s.startsWith('would buy') || s.startsWith('buyable this run')))
);
check('--stale refused nothing', !r.singles.some((s) => s.startsWith('--stale refused to buy')), '');
const recomposeHead =
  mode === 'dry'
    ? 'textless, would be recomposed from source artwork over its existing copy (0 ISK)'
    : 'textless, recomposed from source artwork and published over the old copy (0 ISK)';
const recomposed = items(recomposeHead);
check(
  'the named textless figures are recomposed',
  P.mustRecompose.every((b) => recomposed.includes(b)),
  `missing ${JSON.stringify(P.mustRecompose.filter((b) => !recomposed.includes(b)))}`
);
const warned = new Map();
for (const line of items('figure-prepare.py warnings')) {
  const i = line.indexOf(': ');
  const b = line.slice(0, i);
  for (const w of line.slice(i + 2).split('; ')) {
    if (w.startsWith('annotations removed from page 1: ')) warned.set(b, w);
  }
}
const wantAnn = Object.entries(P.annots).map(([b, v]) => [b, `annotations removed from page 1: ${v} (§C161)`]);
check(
  '§C161: exactly the predicted annotation removals',
  warned.size === wantAnn.length && wantAnn.every(([b, w]) => warned.get(b) === w),
  JSON.stringify([...warned])
);
check('§C161: no AnnotationRefused anywhere', !r.all.includes('AnnotationRefused'), '');
check(
  'every ring gate that ran reached a decision (㊼)',
  !r.all.includes('could NOT be gated') && !r.reasons.some((x) => x.includes('ring gate could not run')),
  'a ring gate could not run'
);

if (mode === 'live') {
  check(
    'nothing was spent',
    r.singles.some((s) => s.startsWith('MT spawned for 0 figure(s), 0 billable characters')),
    JSON.stringify(r.singles.filter((s) => s.startsWith('MT spawned')))
  );
  const pub = r.singles.map((s) => /^published (\d+) figure\(s\) into /.exec(s)).find(Boolean);
  check(
    'published = translated + recomposed textless',
    Boolean(pub) && Number(pub[1]) === n('translated') + recomposed.length,
    `${pub ? pub[1] : '(no line)'} vs ${n('translated')} + ${recomposed.length}`
  );
  if (opt.dryLog) {
    const d = parse(fs.readFileSync(opt.dryLog, 'utf-8'));
    const h = d.heads.find((x) => x.head.startsWith('textless, would be recomposed'));
    const dr = h ? h.items : [];
    check(
      'the live run recomposed exactly the textless figures its dry run listed',
      JSON.stringify([...dr].sort()) === JSON.stringify([...recomposed].sort()),
      `dry ${dr.length}, live ${recomposed.length}`
    );
  }
  const heldHead = r.heads.find((x) => x.head.includes('heldBlockValues'));
  const held = heldHead ? heldHead.items : [];
  check(
    'heldBlockValues: exactly the predicted labels, with multiplicity',
    JSON.stringify([...held].sort()) === JSON.stringify([...P.held].sort()),
    JSON.stringify(held)
  );
  const heldFigures = new Set(P.held.map((s) => s.slice(0, s.indexOf(': '))));
  const note = r.reasons.find((x) => x.includes('heldBlockValues'));
  const noted = note ? /NOTE \(not a failure\): (\d+) figure\(s\)/.exec(note) : null;
  check(
    'the heldBlockValues NOTE names the predicted number of figures',
    heldFigures.size === 0 ? !note : Boolean(noted) && Number(noted[1]) === heldFigures.size,
    note || '(no NOTE)'
  );
}
check('VERDICT ok', r.verdictOk === true, r.reasons.join(' | '));

// For the record, never a check: what the run classified that no prediction covers.
console.log(
  `  record: copied-textless ${n('copied-textless')}, copied-photo ${n('copied-photo')}, ` +
    `unreadable-text ${n('unreadable-text')}, recomposed-textless list ${recomposed.length}`
);
console.log(
  `  record: textless with a raster, NOT recomposed: ${JSON.stringify(items('textless with an embedded raster, NOT recomposed'))}`
);
console.log(fails.length ? `CHECK FAIL (${fails.length}): ${fails.join('; ')}` : 'CHECK PASS');
process.exitCode = fails.length ? 1 : 0;
EOF
cat > "$PASS/bin/run-chapter.sh" <<'EOF'
#!/bin/bash
# $PASS/bin/run-chapter.sh <chapter> <dry|live> [tag] — ONE `figure-run.js --stale` invocation, logged to
# $PASS/logs/ch<chapter>.<mode>[.<tag>].txt with `EXIT=<code>` appended. --stale is hard-coded: this script can
# never start a run that buys. FIGURE=<basename> adds --figure; CAP=<seconds> kills node at that many seconds
# (foreground runs), which then logs EXIT=124 and no VERDICT.
set -u
source /home/siggi/.cache/namsbokasafn-audit/c140-step2-pass/bin/env.sh
CH="$1"; MODE="$2"; TAG="${3:-}"
case "$MODE" in
  dry) FLAGS=(--stale --dry-run) ;;
  live) FLAGS=(--stale) ;;
  *) echo "mode must be dry or live" >&2; exit 2 ;;
esac
[ -n "${FIGURE:-}" ] && FLAGS+=(--figure "$FIGURE")
LOG="$PASS/logs/ch$CH.$MODE${TAG:+.$TAG}.txt"
[ -e "$LOG" ] && mv "$LOG" "$LOG.$(date -u +%H%M%S).prev"
{ date -u +%FT%TZ; free -h | sed -n 2p; df -h /tmp "$PASS" | tail -2; echo "node tools/figure-run.js --book efnafraedi-2e --chapter $CH ${FLAGS[*]}"; } > "${LOG%.txt}.meta"
if [ -n "${CAP:-}" ]; then
  timeout --signal=TERM "$CAP" node tools/figure-run.js --book efnafraedi-2e --chapter "$CH" "${FLAGS[@]}" > "$LOG" 2>&1
else
  node tools/figure-run.js --book efnafraedi-2e --chapter "$CH" "${FLAGS[@]}" > "$LOG" 2>&1
fi
echo "EXIT=$?" >> "$LOG"
date -u +%FT%TZ >> "${LOG%.txt}.meta"
EOF
cat > "$PASS/bin/prepass.py" <<'EOF'
#!/usr/bin/env python3
"""$PASS/bin/prepass.py — books/efnafraedi-2e/media/*_IS.svg at the bump commit, before the first live '5'
figure: per file its sha256, size, and whether it is a raster shell, heavy (>= 8 MiB) or carries an
in-document <feImage>. Refuses on a dirty tree. Writes $PASS/prepass-media.json. Read-only on the repo."""
import hashlib
import json
import re
import subprocess
import sys
from pathlib import Path

REPO = Path('/home/siggi/dev/repos/namsbokasafn-efni')
PASS = Path('/home/siggi/.cache/namsbokasafn-audit/c140-step2-pass')
MEDIA = REPO / 'books' / 'efnafraedi-2e' / 'media'
# svgout.raster_shell's artwork layer: ONE <image> of a base64 PNG drawn with preserveAspectRatio="none".
SHELL_MARK = 'preserveAspectRatio="none" xlink:href="data:image/png;base64,'
# figweight._LOCAL_FEIMAGE, copied: an in-document <feImage href="#..."> is §C140 ⑭'s trigger.
LOCAL_FEIMAGE = re.compile(r'<feImage\b(?:[^>"\']|"[^"]*"|\'[^\']*\')*?\s(?:xlink:)?href\s*=\s*["\']#')
HEAVY = 8 * 1024 * 1024   # figweight.RASTER_BYTES_MIN


def is_shell(t):
    return (SHELL_MARK in t and t.count('<image') == 1 and t.count('<path') == 0
            and t.count('<mask') == 0 and t.count('<feImage') == 0)


def git(*a):
    return subprocess.run(['git', *a], cwd=REPO, capture_output=True, text=True, check=True).stdout


def main():
    dirty = git('status', '--porcelain')
    if dirty.strip():
        sys.exit(f'REFUSED: the tree is dirty, so this is not the bump commit:\n{dirty}')
    files = {}
    for p in sorted(MEDIA.glob('*_IS.svg')):
        raw = p.read_bytes()
        t = raw.decode('utf-8', errors='replace')
        files[p.name[:-len('_IS.svg')]] = {
            'sha256': hashlib.sha256(raw).hexdigest(), 'bytes': len(raw), 'shell': is_shell(t),
            'heavy': len(raw) >= HEAVY, 'feimage': bool(LOCAL_FEIMAGE.search(t)), 'texts': t.count('<text'),
        }
    cfg = json.loads((REPO / 'experiments/figure-text-translation/figure-text.config.json').read_text(encoding='utf-8'))
    kept = sorted(cfg.get('keptCopies') or {})
    predicted = sorted(b for b, f in files.items() if (f['shell'] or f['heavy'] or f['feimage']) and b not in kept)
    out = {'commit': git('rev-parse', 'HEAD').strip(), 'files': files, 'kept': kept, 'predictedShells': predicted}
    (PASS / 'prepass-media.json').write_text(json.dumps(out, indent=1))
    count = lambda k: sum(1 for f in files.values() if f[k])
    print(json.dumps({'commit': out['commit'], 'files': len(files), 'shell': count('shell'), 'heavy': count('heavy'),
                      'feimage': count('feimage'),
                      'heavyAndFeimage': sum(1 for f in files.values() if f['heavy'] and f['feimage']),
                      'kept': kept, 'predictedShells': len(predicted)}))


main()
EOF
node --check "$PASS/bin/predict.mjs" && node --check "$PASS/bin/check-run.mjs" && bash -n "$PASS/bin/run-chapter.sh" && python3 -m py_compile "$PASS/bin/prepass.py" && echo TOOLS-OK
git log --oneline -1; git status --porcelain
node "$PASS/bin/predict.mjs"; echo "EXIT=$?"
python3 -B "$PASS/bin/prepass.py"; echo "EXIT=$?"
```
Expected: `TOOLS-OK`; HEAD is the B-bump commit; empty porcelain; 22 `ok` lines (ch02 `kept
["CNX_Chem_02_05_PerTable2"]`, ch03 `["CNX_Chem_03_01_ibuprofenmass_img"]`, ch13 `["CNX_Chem_13_03_catalyst"]`)
and `PREDICT OK (22 chapters) at <bump sha>`, `EXIT=0`; then
`{"commit": "<bump sha>", "files": 711, "shell": 8, "heavy": 20, "feimage": 55, "heavyAndFeimage": 4, "kept": ["CNX_Chem_02_05_PerTable2", "CNX_Chem_03_01_ibuprofenmass_img", "CNX_Chem_13_03_catalyst"], "predictedShells": 79}`
and `EXIT=0`. (Predicted: 56 feImage figures before B-1, one of them PerTable2, whose June raster has none; 20 heavy,
4 of them both; 8 shells already, in ch17–21; so 8 + 20 + 55 − 4 = 79 shells after the pass. A `DIFF` line or any
other count stops the task.) If B-0 Step 6 found Part 5's held heading or NOTE worded otherwise, adjust
`check-run.mjs`'s two matches (`x.head.includes('heldBlockValues')`, `x.includes('heldBlockValues')`) now, and only those.

- [ ] **Step 1: The pre-flight gate — ONCE, before the first live run** (spec D7; memory
`figure-driver-box-prereqs`: a box without numpy fails the gate closed yet prints ok). Three calls:

```bash
source /home/siggi/.cache/namsbokasafn-audit/c140-step2-pass/bin/env.sh
free -h | sed -n 2p
( cd "$EXP" && FIGTEXT_PYLIBS=./pylibs timeout 590 python3 -u test_figrings.py > "$PASS/logs/preflight-figrings.txt" 2>&1; echo "EXIT=$?" )
tail -1 "$PASS/logs/preflight-figrings.txt"; grep -a 'SKIPPED\|  FAIL' "$PASS/logs/preflight-figrings.txt"
```
```bash
source /home/siggi/.cache/namsbokasafn-audit/c140-step2-pass/bin/env.sh
for t in test_figsym.py test_figis.py; do ( cd "$EXP" && FIGTEXT_PYLIBS=./pylibs timeout 590 python3 -u "$t" > "$PASS/logs/preflight-$t.txt" 2>&1; echo "$t EXIT=$?" ); tail -1 "$PASS/logs/preflight-$t.txt"; done
```
```bash
source /home/siggi/.cache/namsbokasafn-audit/c140-step2-pass/bin/env.sh
( cd "$EXP" && FIGTEXT_PYLIBS=./pylibs timeout 590 python3 -u test_figure_prepare.py > "$PASS/logs/preflight-figure_prepare.txt" 2>&1; echo "EXIT=$?" ); tail -1 "$PASS/logs/preflight-figure_prepare.txt"
```
Expected: `EXIT=0` and `ALL PASS` for all four, no `SKIPPED` or `FAIL` line from `test_figrings.py` (its 7a block
included). **Mid-pass note:** once ch03 and ch05 are recomposed, the old section 7 fails exactly three checks until
B-7b lands — `exocytosis carries eight candidates — reachable only through feImage`, `and mask-491 is among them (the
measured false positive)` and `no carrier beyond the known, gate-refused ones exists in this corpus today`. A resumed
pass's pre-flight accepts exactly those three and nothing else (only the first two if it resumes after ch03 and before ch05: HeatMeas keeps its gate-refused pair until ch05 is recomposed).

- [ ] **Step 2: First live figure — brain-ec0b alone, the ring gate under the installed Chromium 1243** (spec group B;
D7: after the pass it is the one figure whose published bytes still depend on the gate's browser).

```bash
source /home/siggi/.cache/namsbokasafn-audit/c140-step2-pass/bin/env.sh
free -h | sed -n 2p
FIGURE=CNX_Chem_03_01_brain-ec0b CAP=580 bash "$PASS/bin/run-chapter.sh" 3 dry first; grep -a 'translated\|enumerated\|ring\|mask\|VERDICT' "$PASS/logs/ch3.dry.first.txt"
FIGURE=CNX_Chem_03_01_brain-ec0b CAP=580 bash "$PASS/bin/run-chapter.sh" 3 live first; grep -a 'translated\|enumerated\|ring\|healed\|NOT healed\|MT spawned\|published\|VERDICT\|EXIT' "$PASS/logs/ch3.live.first.txt"
python3 - <<'PY'
import sys
from pathlib import Path
EXP = Path('/home/siggi/dev/repos/namsbokasafn-efni/experiments/figure-text-translation')
sys.path.insert(0, str(EXP)); sys.path.insert(0, str(EXP / 'pylibs'))
import figrings
t = (EXP.parent.parent / 'books/efnafraedi-2e/media/CNX_Chem_03_01_brain-ec0b_IS.svg').read_text(encoding='utf-8')
cs, _ = figrings.find_candidates(t)
reach, _ = figrings.find_candidates(t, ring_bytes=float('-inf'))
print('candidates', [c.mask for c in cs])
print('witness', [(c.mask, c.image, c.px, c.refuse) for c in reach])
print('max ring side', max(reach[0].ring.values()) if reach else None, 'RING_BYTES', figrings.RING_BYTES)
PY
git status --porcelain
```
Expected: dry — `1  translated`, `1  = enumerated`, `CNX_Chem_03_01_brain-ec0b: 1 soft-mask ring candidate(s) —
mask-2; not gated in a dry run`, `VERDICT ok`. Live — `1  translated`, `soft-mask ring gate (§C140 ⑩) — 1 figure(s)
carry a candidate; 1 healed, 0 refused:`, `CNX_Chem_03_01_brain-ec0b: healed mask-2`, `MT spawned for 0 figure(s), 0
billable characters`, `published 1 figure(s) into …`, `VERDICT ok`, `EXIT=0`. Probe — `candidates []`,
`witness [('mask-2', 'source-29', [90, 24], None)]`, a max ring side below `RING_BYTES`. Porcelain — the brain media
and sidecar modified, nothing else.

**If the live summary instead says `NOT healed: mask-2`, or the probe finds a candidate, or the gate "could NOT be
gated"** — the heal did not take under 1243. Restore both files from `HEAD`, take the spec's fallback (the build the
thresholds were measured on), and re-run brain; the fallback then holds for EVERY later run, because the gate also
fires on exocytosis (ch03) and HeatMeas (ch05) and the pass must use one browser throughout:
```bash
source /home/siggi/.cache/namsbokasafn-audit/c140-step2-pass/bin/env.sh
for p in books/efnafraedi-2e/media/CNX_Chem_03_01_brain-ec0b_IS.svg books/efnafraedi-2e/figure-text/CNX_Chem_03_01_brain-ec0b.is.json; do git show "HEAD:$p" > "$p"; done
git status --porcelain
echo 'export PLAYWRIGHT_CHROMIUM_EXECUTABLE=/home/siggi/.cache/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-linux64/chrome-headless-shell' > "$PASS/bin/chromium.env"
source "$PASS/bin/env.sh"; echo "$PLAYWRIGHT_CHROMIUM_EXECUTABLE"
FIGURE=CNX_Chem_03_01_brain-ec0b CAP=580 bash "$PASS/bin/run-chapter.sh" 3 live first-1234; grep -a 'healed\|NOT healed\|VERDICT\|EXIT' "$PASS/logs/ch3.live.first-1234.txt"
```
Expected after the restore: empty porcelain; after the re-run, the same healed lines and probe result as above.
(`render-check.mjs` honours `PLAYWRIGHT_CHROMIUM_EXECUTABLE`; `env.sh` sources `chromium.env` whenever it exists.) If
it still does not heal under 1234, stop: that is a finding for [USER], not a value to pin.

**If a single-figure live log (`ch3.live.first.txt`, or `ch1.live.first.txt` in Step 3) ends `EXIT=124` instead** —
the cap killed node, possibly mid-publish — restore that figure's media and sidecar from `HEAD` the same way, then re-run
it detached without a cap, and wait on `^EXIT=` in its log (`ch3.live.first-retry.txt` / `ch1.live.first-retry.txt`)
before checking it as above:
```bash
source /home/siggi/.cache/namsbokasafn-audit/c140-step2-pass/bin/env.sh
FIGURE=CNX_Chem_03_01_brain-ec0b setsid nohup bash "$PASS/bin/run-chapter.sh" 3 live first-retry > /dev/null 2>&1 < /dev/null &
```
(for Archery: `FIGURE=CNX_Chem_01_05_Archery` and chapter `1`).

- [ ] **Step 3: Second live figure — Archery, an uninvolved ⑭ figure: the raster shell with live `<text>`.**

```bash
source /home/siggi/.cache/namsbokasafn-audit/c140-step2-pass/bin/env.sh
git show HEAD:books/efnafraedi-2e/media/CNX_Chem_01_05_Archery_IS.svg > "$PASS/c38/Archery-prepass_IS.svg"
FIGURE=CNX_Chem_01_05_Archery CAP=580 bash "$PASS/bin/run-chapter.sh" 1 dry first; grep -a 'translated\|enumerated\|VERDICT' "$PASS/logs/ch1.dry.first.txt"
FIGURE=CNX_Chem_01_05_Archery CAP=580 bash "$PASS/bin/run-chapter.sh" 1 live first; grep -a 'translated\|enumerated\|MT spawned\|published\|VERDICT\|EXIT' "$PASS/logs/ch1.live.first.txt"
python3 - <<'PY'
import base64, re
from collections import Counter
new = open('/home/siggi/dev/repos/namsbokasafn-efni/books/efnafraedi-2e/media/CNX_Chem_01_05_Archery_IS.svg', encoding='utf-8').read()
old = open('/home/siggi/.cache/namsbokasafn-audit/c140-step2-pass/c38/Archery-prepass_IS.svg', encoding='utf-8').read()
MARK = 'preserveAspectRatio="none" xlink:href="data:image/png;base64,'
shell = MARK in new and new.count('<image') == 1 and new.count('<path') == 0 and new.count('<mask') == 0 and new.count('<feImage') == 0
png = base64.b64decode(re.search(r'data:image/png;base64,([A-Za-z0-9+/=]+)', new).group(1))
texts = lambda t: Counter(re.findall(r'<text\b[^>]*>[^<]*</text>', t))
print('shell', shell, '| png bytes', len(png), png[:8] == b'\x89PNG\r\n\x1a\n',
      '| <text> new', sum(texts(new).values()), 'old', sum(texts(old).values()), '| text layer identical', texts(new) == texts(old),
      '| licence', 'FigIS is a subset of Liberation' in new, '| old feImage', '<feImage' in old)
PY
```
Expected: dry `1  translated`, `VERDICT ok`; live `1  translated`, `MT spawned for 0 figure(s), 0 billable
characters`, `published 1 figure(s)`, `VERDICT ok`, `EXIT=0`; then `shell True | png bytes <n> True | <text> new
<k> old <k> | text layer identical True | licence True | old feImage True` — the ⑭ raster arm ran end to end through
the driver for the first time, the artwork became one PNG and the labels stayed live and unchanged. If the text layer
differs, stop and re-derive (㉑ and Part 5 are predicted not to touch Archery).

- [ ] **Step 4: Commit the first two figures.**

```bash
source /home/siggi/.cache/namsbokasafn-audit/c140-step2-pass/bin/env.sh
git status --porcelain | grep -avE '^ M books/efnafraedi-2e/(media/[^/]+_IS\.svg|figure-text/[^/]+\.is\.json)$'; echo "unexpected=$? (1 = none, required)"
git status --porcelain | wc -l
git add books/efnafraedi-2e/media books/efnafraedi-2e/figure-text
git commit -F - <<'EOF'
content(c140-㊾): the first two live '5' figures — brain-ec0b (ring gate) and Archery (⑭ shell), 0 ISK

figure-run.js --stale --figure, after a --stale --dry-run of each. brain-ec0b: the gate healed mask-2 and the
published copy carries no candidate, with the walker still reaching mask-2. Archery: the artwork is one raster
<image>, the live <text> layer is identical to the pre-pass copy, and the ㉗ licence <metadata> is present.
Logs and checks are off-repo under ~/.cache/namsbokasafn-audit/c140-step2-pass/logs/.
EOF
git status --porcelain
```
Expected: `unexpected=1`; `4` changed paths (two media, two sidecars); empty porcelain after the commit.

- [ ] **Step 5: The chapter procedure.** Run it once per row of the table, top to bottom (`1` … `21`, `appendices`).
Set `CH` to the row's `--chapter` value and `DONE` to its `--done` argument (`--done CNX_Chem_01_05_Archery` for `1`,
`--done CNX_Chem_03_01_brain-ec0b` for `3`, empty otherwise). `free -h` must show ≥ 2 GiB available (≥ 3 GiB for 10,
11, 12).

*5a. The dry run.* Foreground rows:
```bash
source /home/siggi/.cache/namsbokasafn-audit/c140-step2-pass/bin/env.sh
CH=1; DONE="--done CNX_Chem_01_05_Archery"
free -h | sed -n 2p; df -h /tmp "$PASS" | tail -2
CAP=580 bash "$PASS/bin/run-chapter.sh" "$CH" dry; tail -2 "$PASS/logs/ch$CH.dry.txt"
node "$PASS/bin/check-run.mjs" "$PASS/logs/ch$CH.dry.txt" "$CH" dry $DONE; echo "CHECK-EXIT=$?"
```
Detached rows (7, 8, 10, 11, 12, 20):
```bash
source /home/siggi/.cache/namsbokasafn-audit/c140-step2-pass/bin/env.sh
CH=7
free -h | sed -n 2p; df -h /tmp "$PASS" | tail -2
setsid nohup bash "$PASS/bin/run-chapter.sh" "$CH" dry > /dev/null 2>&1 < /dev/null &
echo "started"
```
then wait with the Monitor tool until `grep -aq '^EXIT=' /home/siggi/.cache/namsbokasafn-audit/c140-step2-pass/logs/ch7.dry.txt`
holds. Between checks, confirm it is moving, not merely present: sample twice, 60 s apart,
`ps -eo pid,etime,pcpu,rss,args | grep -a '[f]igure-run.js --book efnafraedi-2e --chapter 7'` and
`ls -t "$PASS/tmp"/figure-run-*/ | head -2` (the figure being prepared). When `EXIT=` is there:
```bash
source /home/siggi/.cache/namsbokasafn-audit/c140-step2-pass/bin/env.sh
CH=7; DONE=""
tail -2 "$PASS/logs/ch$CH.dry.txt"; node "$PASS/bin/check-run.mjs" "$PASS/logs/ch$CH.dry.txt" "$CH" dry $DONE; echo "CHECK-EXIT=$?"
```
Expected for both: the log ends `VERDICT ok` … `EXIT=0`, and `CHECK PASS`, `CHECK-EXIT=0`. **A `CHECK FAIL` stops the
pass before this chapter's live run**: read the named check in the log, re-derive, do not adapt. (A dry `EXIT=124`
means the cap killed it: re-run this chapter's dry run detached.)

*5b. The live run.* Foreground rows:
```bash
source /home/siggi/.cache/namsbokasafn-audit/c140-step2-pass/bin/env.sh
CH=1; DONE="--done CNX_Chem_01_05_Archery"
free -h | sed -n 2p
CAP=580 bash "$PASS/bin/run-chapter.sh" "$CH" live; tail -3 "$PASS/logs/ch$CH.live.txt"
node "$PASS/bin/check-run.mjs" "$PASS/logs/ch$CH.live.txt" "$CH" live $DONE --dry-log "$PASS/logs/ch$CH.dry.txt"; echo "CHECK-EXIT=$?"
sed -n '/^VERDICT/,$p' "$PASS/logs/ch$CH.live.txt"
```
Detached rows: `setsid nohup bash "$PASS/bin/run-chapter.sh" "$CH" live > /dev/null 2>&1 < /dev/null &`, wait on
`^EXIT=` in `$PASS/logs/ch$CH.live.txt` as in 5a, then the same `check-run.mjs … live … --dry-log …` and `sed` lines.
Expected: `CHECK PASS`, `CHECK-EXIT=0`; the `VERDICT ok` block's reasons are NOTEs only — the kept figure's
`unresolved` NOTE (ch02, ch03, ch13), the held NOTE (the six chapters in the table), and compose NOTEs, each of which
names its figures in the report above it; read every one. `EXIT=124` on a foreground live run means the cap killed
node mid-chapter: every figure already published is stamped '5' and reads `skipped-current` next time, a figure killed
mid-copy is re-published, and nothing was bought. Re-run that chapter's live run detached and check it with
`--resumed` in place of `$DONE`.

*5c. Commit the chapter.*
```bash
source /home/siggi/.cache/namsbokasafn-audit/c140-step2-pass/bin/env.sh
CH=1
git status --porcelain | grep -avE '^ M books/efnafraedi-2e/(media/[^/]+_IS\.svg|figure-text/[^/]+\.is\.json)$'; echo "unexpected=$? (1 = none, required)"
git status --porcelain | grep -ac '^ M books/efnafraedi-2e/figure-text/'
git add books/efnafraedi-2e/media books/efnafraedi-2e/figure-text
[ -z "$(git status --porcelain | grep -avE '^M  books/efnafraedi-2e/(media/[^/]+_IS\.svg|figure-text/[^/]+\.is\.json)$')" ] && git commit -F - <<EOF
content(c140-㊾): ch$CH recomposed under COMPOSER_VERSION '5', 0 ISK

figure-run.js --book efnafraedi-2e --chapter $CH --stale (no --force, not through the autorun), after a --stale
--dry-run. check-run.mjs matched both summaries to the plan's prediction for this chapter: the selection, the
restamped sidecar figures, the recomposed textless figures, the kept refusals, the §C161 and heldBlockValues
lines, no purchase. The logs are off-repo under ~/.cache/namsbokasafn-audit/c140-step2-pass/logs/.
EOF
git status --porcelain
```
Expected: `unexpected=1`; the count of modified sidecars equals the row's sidecars minus its `--done` figures (23 for
ch01, 20 for ch02, 14 for ch03, 40 for ch10 and 30 for ch12 — Graphene and HetCats count once each though two lines
changed in them — 12 for appendices); empty porcelain after. (The heredoc is unquoted so
`$CH` expands; the message holds no other `$`.) Any `??` or other path stops the pass: the run wrote outside the
predicted trees.

- [ ] **Step 6: After the last row (`appendices`), the pass totals.**

```bash
source /home/siggi/.cache/namsbokasafn-audit/c140-step2-pass/bin/env.sh
python3 - <<'PY'
import re
from pathlib import Path
logs = Path('/home/siggi/.cache/namsbokasafn-audit/c140-step2-pass/logs')
live = sorted(p for p in logs.iterdir() if re.match(r'^ch.+\.live(\.[a-z0-9-]+)?\.txt$', p.name))
chapters = [p for p in live if re.match(r'^ch[^.]+\.live\.txt$', p.name)]
unspent = [p.name for p in live if 'MT spawned for 0 figure(s), 0 billable characters' in p.read_text(encoding='utf-8')]
ann = []
for p in chapters:
    for line in p.read_text(encoding='utf-8').splitlines():
        if 'annotations removed from page 1:' in line:
            b, rest = line.strip().split(': ', 1)
            ann += [(b, w) for w in rest.split('; ') if w.startswith('annotations removed from page 1:')]
held = [p.name for p in chapters if 'drew labels from heldBlockValues' in p.read_text(encoding='utf-8')]
refused = [p.name for p in logs.glob('ch*.txt') if 'AnnotationRefused' in p.read_text(encoding='utf-8')]
print('chapter live logs', len(chapters), '| live logs', len(live), '| saying 0 spent', len(unspent))
for a in sorted(ann): print('  ', a)
print('annotation warnings', len(ann), '| AnnotationRefused in', refused)
print('held NOTE in', sorted(held))
PY
git log --oneline "$(python3 -c "import json;print(json.load(open('$PASS/prepass-media.json'))['commit'])")"..HEAD | wc -l
ls "$PASS"/tmp; git status --porcelain
```
Expected: `chapter live logs 22`, and `saying 0 spent` equal to `live logs` (22 plus the first-figure logs); exactly
**5** annotation warnings — Ex01_05d `1 /Popup, 1 /Text`, Ex01_06d `2 /Popup, 2 /Text`, saccharin, HalAlkane and
HalAlkane3 `1 /Popup, 1 /Text` — and `AnnotationRefused in []`; the held NOTE in exactly `ch1.live.txt`,
`ch14.live.txt`, `ch18.live.txt`, `ch20.live.txt`, `ch7.live.txt`, `ch9.live.txt`; `23` commits since the bump (the
first two figures, then 22 chapters); `$PASS/tmp` empty (a leftover `figure-run-*` directory is a killed run's
scratch: delete it only when no figure-run is running); empty porcelain.

---

### Task B-5: The census, as real code — by value, against the bump commit and the branch base

**Why:** the raster/vector verdict reaches no driver output (the driver discards compose's stdout), a textless figure
carries no stamp, and every count-based gate here can stay green over a wrong value. So the census reads the bytes.

**Files:** none in the repo. Scratch: `$PASS/bin/census.py`, `$PASS/census.json`.

**Interfaces:**
- Consumes: `$PASS/prepass-media.json` (B-4 Step 0: the bump commit and each copy's sha256, shell/heavy/feImage flags,
  the predicted shell set), `$PASS/base.sha`, `$PASS/bin/heldcheck.py` (B-3), the real `isStale`.
- Produces: `$PASS/census.json` (read by B-6 and B-8) and the verdict `CENSUS PASS`.

**What it checks, and its predictions:**

| Check | Predicted |
|---|---|
| A1 tree clean; A2 since the bump only `media/*_IS.svg` and `figure-text/*.is.json`, all `M` | yes |
| A3 every sidecar at the bump restamped; A4 vs the base the only deletion is PerTable2's sidecar; A5 vs the base `image-mapping.json`, `03-translated/`, `05-publication/` untouched | 460 of 460; that one path; nothing |
| B1 numstat per sidecar `1 1` (composedVersion), `2 2` for HetCats and Graphene (composedHash too); B2 the same by value, key order kept; B3 `COMPOSER_VERSION` '5' and the real `isStale` finds 0 stale | yes; yes; 0 of 460 |
| C1 the same 711 figures published; C2 the raster shells = the predicted set; C3 0 copies ≥ 8 MiB; C4 no `<feImage>` outside `keptCopies`; C5 the four annotation colours (`rgb(25%, 66.664124%, 33.331299%)`, `rgb(100%, 100%, 0%)`, `#40aa55`, `#ffff00`) nowhere; C6 every FigIS-drawn copy carries `FigIS is a subset of Liberation` | yes; 79; 0; none; none; all |
| C7 the ICE pair (`CNX_Chem_14_03_ICETable2_img`, `CNX_Chem_14_04_ICETable13_img`, composed after every composer change before this pass: the determinism control) and the three kept copies byte-identical to the bump; C8 PerTable2's sha256 `9092ddab…c249`; C9 every figure the pass must change changed (the 71 heavy or feImage figures, the 5 annotated, the 7 held, HetCats, Graphene, Nitrogen, conjugate_img) | yes; yes; yes |
| D1 `heldcheck.py media`: the 13 held labels at the design's positions, no English left in them, the nobelium control (`>No</text>` ×1 and `>Nei</text>` ×0 in PeriodicPU, PerTable1, Econtable, PeriodicPU3, 00_AA_PeriodicPU_img); D2 the four sidecar values drawn; D3 `frásog` ×0 in HetCats, `>Buckyball</text>` ×0 in Graphene | yes |

Not predicted, recorded: how many copies changed in all, and which besides the five controls came out byte-identical
(a pre-㉗ copy gains the licence `<metadata>`, so most change; a textless copy with no font may not).

- [ ] **Step 1: Write the census.**

```bash
source /home/siggi/.cache/namsbokasafn-audit/c140-step2-pass/bin/env.sh
cat > "$PASS/bin/census.py" <<'EOF'
#!/usr/bin/env python3
"""$PASS/bin/census.py — §C140 ㊾ step 2's post-pass census, BY VALUE. Read-only on the repo.

Compares HEAD (after every chapter commit) with the bump commit recorded by prepass.py, and with the PR-B base
(base.sha). Prints ok/FAIL per check and writes the whole record to $PASS/census.json.
Exit 0 only when every check passes. Stdlib only, plus node for the real isStale."""
import hashlib
import json
import re
import subprocess
import sys
from pathlib import Path

PASS = Path('/home/siggi/.cache/namsbokasafn-audit/c140-step2-pass')
sys.path.insert(0, str(PASS / 'bin'))
import heldcheck  # noqa: E402

REPO = Path('/home/siggi/dev/repos/namsbokasafn-efni')
BOOK = 'books/efnafraedi-2e'
MEDIA = REPO / BOOK / 'media'
pre = json.loads((PASS / 'prepass-media.json').read_text())
BUMP, BASE = pre['commit'], (PASS / 'base.sha').read_text().strip()
cfg = json.loads((REPO / 'experiments/figure-text-translation/figure-text.config.json').read_text(encoding='utf-8'))
KEPT = sorted(cfg['keptCopies'])
VALUE_EDITED = {'CNX_Chem_10_05_Graphene', 'CNX_Chem_12_07_HetCats-230a'}
ICE = ('CNX_Chem_14_03_ICETable2_img', 'CNX_Chem_14_04_ICETable13_img')
PERTABLE2_JUNE_SHA256 = '9092ddabf77d9c65e8e6c076cd39ce7a89e644079777294804fd89cbdbf1c249'
ANNOT_COLOURS = ('rgb(25%, 66.664124%, 33.331299%)', 'rgb(100%, 100%, 0%)', '#40aa55', '#ffff00')
LICENCE_TOKEN = 'FigIS is a subset of Liberation'
ANNOTATED = ('CNX_Chem_03_01_Ex01_05d_img', 'CNX_Chem_03_01_Ex01_06d_img', 'CNX_Chem_04_04_saccharin_img',
             'CNX_Chem_20_01_HalAlkane_img', 'CNX_Chem_20_01_HalAlkane3_img')
C21 = ('CNX_Chem_18_07_Nitrogen', 'CNX_Chem_14_01_conjugate_img')
# [USER]'s values, value sheet rows D1-D4 (docs/handoffs/2026-10-03-step2-value-sheet.md), quoted, not written here.
D_VALUES = {'CNX_Chem_12_07_HetCats-230a': ['Etýlen aðsogast á yfirborðið og π-tengi rofna', 'Etýlen', 'Ni-yfirborð'],
            'CNX_Chem_10_05_Graphene': ['Knattkol (e. buckyball)']}
MEDIA_RE = re.compile(r'^books/efnafraedi-2e/media/[^/]+_IS\.svg$')
SIDECAR_RE = re.compile(r'^books/efnafraedi-2e/figure-text/[^/]+\.is\.json$')
SHELL_MARK = 'preserveAspectRatio="none" xlink:href="data:image/png;base64,'
NODE_STALE = """
import fs from 'fs'; import path from 'path'; import { createRequire } from 'module';
const R = '/home/siggi/dev/repos/namsbokasafn-efni';
const require = createRequire(path.join(R, 'tools', 'x.js'));
const S = require(path.join(R, 'tools/lib/figure-text-sidecar.cjs'));
const { isStale } = await import(path.join(R, 'tools/figure-run.js'));
const book = path.join(R, 'books/efnafraedi-2e');
const names = fs.readdirSync(path.join(book, 'figure-text')).filter((f) => f.endsWith('.is.json')).map((f) => f.slice(0, -8));
console.log(JSON.stringify({ COMPOSER_VERSION: S.COMPOSER_VERSION, files: names.length,
  stale: names.filter((b) => isStale(S.readSidecar(book, b))) }));
"""

fails, record = [], {}


def check(name, ok, detail=''):
    print(f"  {'ok  ' if ok else 'FAIL'} {name}" + ('' if ok else f'  — {detail}'))
    if not ok:
        fails.append(name)


def git(*a):
    return subprocess.run(['git', '-c', 'core.quotepath=false', *a], cwd=REPO, capture_output=True, text=True,
                          check=True).stdout


def is_shell(t):
    return (SHELL_MARK in t and t.count('<image') == 1 and t.count('<path') == 0
            and t.count('<mask') == 0 and t.count('<feImage') == 0)


def stem(p):
    return Path(p).name[:-len('.is.json')]


# ── A. what changed, by path ───────────────────────────────────────────────────────────────────────
status = git('status', '--porcelain')
check('A1 the working tree is clean: every chapter is committed', status == '', status[:400])
diff = [ln.split('\t') for ln in git('diff', '--name-status', BUMP, 'HEAD', '--', 'books/').splitlines()]
odd = [d for d in diff if d[0] != 'M' or not (MEDIA_RE.match(d[-1]) or SIDECAR_RE.match(d[-1]))]
check('A2 since the bump: only media/*_IS.svg and figure-text/*.is.json, all modified, none added or deleted',
      not odd, str(odd[:5]))
side_changed = sorted(d[-1] for d in diff if SIDECAR_RE.match(d[-1]))
at_bump = sorted(p for p in git('ls-tree', '-r', '--name-only', BUMP, '--', f'{BOOK}/figure-text/').splitlines()
                 if p.endswith('.is.json'))
check('A3 every sidecar present at the bump was restamped', side_changed == at_bump,
      f'{len(side_changed)} changed of {len(at_bump)}')
base_diff = [ln.split('\t') for ln in git('diff', '--name-status', BASE, 'HEAD', '--', 'books/').splitlines()]
deleted = [d[-1] for d in base_diff if d[0] == 'D']
check("A4 against the PR-B base the only deletion is PerTable2's sidecar",
      deleted == [f'{BOOK}/figure-text/CNX_Chem_02_05_PerTable2.is.json'], str(deleted))
others = [d for d in base_diff if not (MEDIA_RE.match(d[-1]) or SIDECAR_RE.match(d[-1]))]
check('A5 against the base: image-mapping.json, 03-translated/ and 05-publication/ untouched', not others,
      str(others[:5]))

# ── B. the sidecars, by line and by value ─────────────────────────────────────────────────────────
numstat = {ln.split('\t')[2]: tuple(ln.split('\t')[:2])
           for ln in git('diff', '--numstat', BUMP, 'HEAD', '--', f'{BOOK}/figure-text/').splitlines()}
wrong_lines = [p for p, ns in numstat.items() if ns != (('2', '2') if stem(p) in VALUE_EDITED else ('1', '1'))]
check('B1 one changed line per sidecar (composedVersion); two for HetCats and Graphene (composedHash too)',
      not wrong_lines and len(numstat) == len(at_bump), str(wrong_lines[:5]))
wrong_json = []
for p in side_changed:
    old = json.loads(git('show', f'{BUMP}:{p}'))
    new = json.loads((REPO / p).read_text(encoding='utf-8'))
    want = dict(old, composedVersion='5')
    if stem(p) in VALUE_EDITED:
        want['composedHash'] = old['renderHash']
    if new != want or list(new) != list(old):
        wrong_json.append(p)
check("B2 by value: composedVersion '5' (and composedHash = renderHash for the two), every other field and the "
      'key order unchanged', not wrong_json, str(wrong_json[:5]))
st = json.loads(subprocess.run(['node', '--input-type=module', '-e', NODE_STALE], cwd=REPO, capture_output=True,
                               text=True, check=True).stdout)
check("B3 COMPOSER_VERSION is '5' and the real isStale finds no stale sidecar",
      st['COMPOSER_VERSION'] == '5' and st['files'] == len(at_bump) and st['stale'] == [], json.dumps(st)[:300])

# ── C. the media, by value ────────────────────────────────────────────────────────────────────────
now = {}
for p in sorted(MEDIA.glob('*_IS.svg')):
    raw = p.read_bytes()
    now[p.name[:-len('_IS.svg')]] = (hashlib.sha256(raw).hexdigest(), len(raw), raw.decode('utf-8', errors='replace'))
check('C1 the same figures are published as at the bump', sorted(now) == sorted(pre['files']),
      f"added {sorted(set(now) - set(pre['files']))[:5]} removed {sorted(set(pre['files']) - set(now))[:5]}")
changed = sorted(b for b in now if b in pre['files'] and now[b][0] != pre['files'][b]['sha256'])
shells = sorted(b for b, (_, _, t) in now.items() if is_shell(t))
predicted = pre['predictedShells']
check('C2 the raster shells are exactly the predicted set (pre-pass shells + heavy + in-document feImage, '
      'minus kept)', shells == predicted,
      f'extra {sorted(set(shells) - set(predicted))} missing {sorted(set(predicted) - set(shells))}')
heavy = [b for b, (_, size, _) in now.items() if size >= 8 * 1024 * 1024]
check('C3 no published copy is 8 MiB or more', not heavy, str(heavy))
fe = [b for b, (_, _, t) in now.items() if '<feImage' in t]
check('C4 no <feImage> outside keptCopies', all(b in KEPT for b in fe), str(fe))
ann = [b for b, (_, _, t) in now.items() if any(c in t.lower() for c in ANNOT_COLOURS)]
check('C5 the §C161 annotation colours appear nowhere, in either encoding', not ann, str(ann))
unlicensed = [b for b, (_, _, t) in now.items() if 'font-family="FigIS"' in t and LICENCE_TOKEN not in t]
check('C6 every copy that draws FigIS carries the ㉗ licence <metadata>', not unlicensed, str(unlicensed[:5]))
moved = [b for b in (*ICE, *KEPT) if now[b][0] != pre['files'][b]['sha256']]
check('C7 the ICE pair and every kept copy are byte-identical to the bump commit', not moved, str(moved))
check('C8 PerTable2 is the June raster from d20952748', now['CNX_Chem_02_05_PerTable2'][0] == PERTABLE2_JUNE_SHA256,
      now['CNX_Chem_02_05_PerTable2'][0])
must = sorted({b for b, f in pre['files'].items() if (f['heavy'] or f['feimage']) and b not in KEPT}
              | set(ANNOTATED) | set(heldcheck.EXPECT) | VALUE_EDITED | set(C21))
stuck = [b for b in must if b not in changed]
check('C9 every figure the pass must change did change', not stuck, str(stuck))

# ── D. the ruled values ───────────────────────────────────────────────────────────────────────────
held_problems = heldcheck.check_tree(MEDIA)
check("D1 heldBlockValues: [USER]'s values drawn at their positions, no English left there, nobelium control",
      not held_problems, '; '.join(held_problems[:4]))


def flat(svg):
    return ''.join(i['text'] for i in heldcheck.items(svg)).replace(' ', '')


missing = [(b, v) for b, vs in D_VALUES.items() for v in vs if v.replace(' ', '') not in flat(now[b][2])]
check('D2 the four sidecar values (value sheet D1-D4) are drawn', not missing, str(missing))
het, gra = now['CNX_Chem_12_07_HetCats-230a'][2], now['CNX_Chem_10_05_Graphene'][2]
check("D3 HetCats draws no 'frásog' and Graphene no 'Buckyball' label",
      'frásog' not in het and '>Buckyball</text>' not in gra,
      f"frásog x{het.count('frásog')}, >Buckyball</text> x{gra.count('>Buckyball</text>')}")

record.update({
    'bump': BUMP, 'base': BASE, 'sidecarsAtBump': len(at_bump), 'sidecarsRestamped': len(side_changed),
    'mediaFiles': len(now), 'mediaChanged': len(changed), 'mediaUnchanged': sorted(set(now) - set(changed)),
    'shells': shells, 'predictedShells': predicted, 'licenceTokenCopies': sum(LICENCE_TOKEN in t for _, _, t in now.values()),
    'feImage': fe, 'heldProblems': held_problems, 'fails': fails,
})
(PASS / 'census.json').write_text(json.dumps(record, indent=1, ensure_ascii=False))
print(f"  record: {len(side_changed)} sidecars restamped; {len(changed)} of {len(now)} copies changed; "
      f"{len(shells)} raster shells; unchanged copies: {record['mediaUnchanged'][:12]}")
print('CENSUS PASS' if not fails else f'CENSUS FAIL ({len(fails)}): ' + '; '.join(fails))
sys.exit(1 if fails else 0)
EOF
python3 -m py_compile "$PASS/bin/census.py" && echo OK
```
Expected: `OK`. (Exercised read-only on 2026-10-03 against the unpassed tree: every check that should fire there
fired — A3 `0 changed of 461`, C2 72 shells missing, C3 the 20 heavy copies, C5 the 5 annotated, D1 the English
labels, D3 `frásog x1` — while A1, A5 and C7 held.)

- [ ] **Step 2: Run it.**

```bash
source /home/siggi/.cache/namsbokasafn-audit/c140-step2-pass/bin/env.sh
free -h | sed -n 2p
python3 -B "$PASS/bin/census.py" > "$PASS/logs/census.txt" 2>&1; echo "EXIT=$?"; cat "$PASS/logs/census.txt"
```
Expected: every line `ok`, then `record: 460 sidecars restamped; <m> of 711 copies changed; 79 raster shells;
unchanged copies: [...]` (the unchanged list includes the ICE pair and the three kept copies), `CENSUS PASS`, `EXIT=0`.
**Any FAIL stops the plan** before B-7b: name the figure, find which mechanism produced it, and re-derive. In
particular a C2 difference is a raster-set mispredicted from committed sizes (spec: "predict the raster set from the
run … the gate reads the stripped artwork"): for each extra or missing name, prepare its artwork into
`$PASS/c38/<b>/` with `figure-prepare.py` (as in B-3 Step 6) and run
`( cd "$EXP" && FIGTEXT_PYLIBS=./pylibs python3 -B -c "import figweight,sys; print(figweight.should_rasterise(open(sys.argv[1]).read())[0::2])" "$PASS/c38/<b>/artwork.svg" )`
to read the gate's own verdict and reason before deciding anything.

- [ ] **Step 3: Textless convergence, by byte identity across a second run** (spec: textless figures carry no stamp, so
`skipped-current` cannot show convergence). ch03 (12 recomposed textless figures, two of them §C161's) foreground;
ch08 (30 textless, including the two textless ⑭ rasters pi and sp2Conv) detached.

```bash
source /home/siggi/.cache/namsbokasafn-audit/c140-step2-pass/bin/env.sh
free -h | sed -n 2p
CAP=580 bash "$PASS/bin/run-chapter.sh" 3 live conv
node "$PASS/bin/check-run.mjs" "$PASS/logs/ch3.live.conv.txt" 3 live --resumed; echo "CHECK-EXIT=$?"
grep -a 'skipped-current\|translated$' "$PASS/logs/ch3.live.conv.txt"; git status --porcelain
```
Then `setsid nohup bash "$PASS/bin/run-chapter.sh" 8 live conv > /dev/null 2>&1 < /dev/null &`, wait with the
Monitor tool until `grep -aq '^EXIT=' /home/siggi/.cache/namsbokasafn-audit/c140-step2-pass/logs/ch8.live.conv.txt`,
and:
```bash
source /home/siggi/.cache/namsbokasafn-audit/c140-step2-pass/bin/env.sh
node "$PASS/bin/check-run.mjs" "$PASS/logs/ch8.live.conv.txt" 8 live --resumed; echo "CHECK-EXIT=$?"
grep -a 'skipped-current\|translated$' "$PASS/logs/ch8.live.conv.txt"; git status --porcelain
```
Expected for each: `CHECK PASS`; the tally shows `skipped-current` equal to the chapter's sidecar figures (15 for
ch03, 25 for ch08) and no `translated` line; the textless figures are recomposed and published again; **and `git status
--porcelain` stays empty**: the second composition is byte-identical to the first. A modified file is a finding —
record which (a ⑭ raster that does not reproduce would churn on every later `--stale` run) and stop before B-7b.

---

### Task B-7b: Re-pin section 7 on the published bytes the pass wrote (spec D7, second half)

*Drafted 2026-10-03 (`plan-drafts/sections/c38-3-B.md`), never verified then; re-verified for this plan: the three
predicted FAIL names are verbatim the current section-7 check names; the shell fingerprint matches exactly the 8 shells
committed before the pass (`SHE`, `CO2vsSiO2`, `Dorbital`, `CarbonDate`, `Reaction1`, `ChnReact1`, `Fission1`,
`Damage2`) and none of the 20 heavy or 56 feImage copies. Fixes folded in: the section is replaced by a Python patch
keyed on the whole block (its `# ---` header lines through `hits == known, str(hits[:5]))`), asserting each anchor
occurs once; scratch is `$PASS/c38`.*

**When:** after B-5's `CENSUS PASS` and its convergence runs, before the merge. `test_figrings.py` is in no CI job,
so this run on the figure box is the only verification.

**What changes and why:** section 7 (now the published-bytes half) stops pinning carriers that the ⑭ raster arm
turned into shells, and asserts what the pass makes true of the published copies. Brain stays vector with its
healed mask. The three former carriers become shells: one `<image>`, no `<path>`/`<mask>`/`<feImage>`. The corpus
carrier list becomes whatever Step 3 measures; the prediction is `[]` (the only carriers before the pass were HeatMeas
and exocytosis, and PerTable2's June raster has 0 `<mask>`).

**Files:**
- Modify: `experiments/figure-text-translation/test_figrings.py` — the whole section-7 block, from the `# ---` line
  above `# 7. Corpus anchors — the two real carriers, and the corpus-wide count` through the line
  `          hits == known, str(hits[:5]))`.
- Scratch, never committed: `$PASS/c38/published_probe.py`, `$PASS/c38/red_7b.py`, `$PASS/c38/HeatMeas-prepass_IS.svg`.

**Interfaces:**
- Consumes: `figrings.find_candidates`, `figrings.RING_BYTES`; `MEDIA`, `check`, `skip` (module scope of the test).
- Produces: `SHELL_MARK`, `is_raster_shell(text) -> bool`, `published_text(name) -> str`, `FORMER_CARRIERS`,
  `KNOWN_PUBLISHED_CARRIERS`, a rewritten `test_corpus_anchors()`.

- [ ] **Step 1: Preconditions.**

```bash
source /home/siggi/.cache/namsbokasafn-audit/c140-step2-pass/bin/env.sh
free -h | sed -n 2p; git status --porcelain; tail -1 "$PASS/logs/census.txt"
git log -1 --format=%H --grep="COMPOSER_VERSION '4' -> '5'"
```
Expected: ≥ 2 GiB available; empty porcelain; `CENSUS PASS`; the bump commit's sha.

- [ ] **Step 2: The old anchors fail exactly as predicted (red).**

```bash
source /home/siggi/.cache/namsbokasafn-audit/c140-step2-pass/bin/env.sh
( cd "$EXP" && FIGTEXT_PYLIBS=./pylibs timeout 590 python3 -u test_figrings.py > "$PASS/c38/figrings-post.txt" 2>&1; echo "EXIT=$?" )
grep -a '^  FAIL\|SKIPPED\|ALL PASS' "$PASS/c38/figrings-post.txt"
```
Predicted: `EXIT=1` and exactly three `FAIL` lines: `exocytosis carries eight candidates — reachable only through
feImage`, `and mask-491 is among them (the measured false positive)` and `no carrier beyond the known, gate-refused
ones exists in this corpus today`. Every 7a check passes (the source is untouched); Econfig's two published checks
still pass, vacuously, on a shell. A FAIL on a brain check is not a prediction miss to absorb: carry it into Step 3's
stop rule (a).

- [ ] **Step 3: Measure the published values, then decide.**

```bash
source /home/siggi/.cache/namsbokasafn-audit/c140-step2-pass/bin/env.sh
cat > "$PASS/c38/published_probe.py" <<'EOF'
import json, sys
from pathlib import Path
EXP = Path('/home/siggi/dev/repos/namsbokasafn-efni/experiments/figure-text-translation')
sys.path.insert(0, str(EXP)); sys.path.insert(0, str(EXP / 'pylibs'))
import figrings
MEDIA = EXP.parent.parent / 'books' / 'efnafraedi-2e' / 'media'
MARK = 'preserveAspectRatio="none" xlink:href="data:image/png;base64,'
def shape(t):
    return {**{k: t.count(k) for k in ('<image', '<path', '<mask', '<feImage')}, 'mark': MARK in t}
brain = (MEDIA / 'CNX_Chem_03_01_brain-ec0b_IS.svg').read_text(encoding='utf-8')
bc, _ = figrings.find_candidates(brain)
reach, _ = figrings.find_candidates(brain, ring_bytes=float('-inf'))
out = {'brain': {'candidates': [c.mask for c in bc],
                 'witness': [(c.mask, c.image, c.px, c.refuse) for c in reach],
                 'max_ring_side': max(reach[0].ring.values()) if reach else None,
                 'RING_BYTES': figrings.RING_BYTES, 'shape': shape(brain)}}
for n in ('CNX_Chem_03_01_exocytosis-88f6_IS.svg', 'CNX_Chem_05_02_HeatMeas_IS.svg',
          'CNX_Chem_06_04_Econfig_IS.svg', 'CNX_Chem_17_03_SHE_IS.svg'):
    t = (MEDIA / n).read_text(encoding='utf-8')
    cs, _ = figrings.find_candidates(t)
    out[n] = {'shape': shape(t), 'candidates': [c.mask for c in cs]}
others = sorted(p for p in MEDIA.glob('*_IS.svg') if p.name != 'CNX_Chem_03_01_brain-ec0b_IS.svg')
hits = []
for p in others:
    cs, _ = figrings.find_candidates(p.read_text(encoding='utf-8'))
    if cs:
        hits.append((p.name, len(cs)))
out['sweep'] = {'population': len(others), 'hits': hits}
print(json.dumps(out, indent=1))
EOF
timeout 590 python3 -B -u "$PASS/c38/published_probe.py" > "$PASS/c38/published.json"; echo "EXIT=$?"; cat "$PASS/c38/published.json"
```
Predicted: brain `candidates []`, `witness [["mask-2", "source-29", [90, 24], null]]`, `max_ring_side` below
`RING_BYTES`, brain `<path` > 0; exocytosis, HeatMeas, Econfig and SHE each `<image 1, <path 0, <mask 0, <feImage 0,
mark true`, `candidates []`; sweep `population 710`, `hits []`.

**Stop rules (do not pin any of these; record and route them):**
- (a) brain carries a candidate while 7a's brain-source check passes → the heal did not take under the browser B-4
  Step 2 settled on; that is the spec's group-(B) browser question for [USER], not a value.
- (b) brain's witness differs from `('mask-2', 'source-29', [90, 24], None)` → the prepare or poppler output moved;
  investigate before anything else.
- (c) a former carrier is not a shell → ⑭/§C168 did not fire for it, a pass defect (B-5 C2 should already have said so).
- (d) SHE is not a shell → the fingerprint is wrong; fix the predicate, never the expectation.
- (e) `hits` is non-empty → a NEW published carrier, which is what the check exists to find. Read its ring-gate line
  with `FIGURE=<its basename> CAP=580 bash "$PASS/bin/run-chapter.sh" <its chapter> dry carrier` and record why before
  it may join `KNOWN_PUBLISHED_CARRIERS`.

- [ ] **Step 4: Rewrite section 7 as 7b from the measured values.** If Step 3 measured a `hits` list that the stop rules
cleared, write that list into `KNOWN_PUBLISHED_CARRIERS` instead of `[]` before running this.

```bash
source /home/siggi/.cache/namsbokasafn-audit/c140-step2-pass/bin/env.sh
python3 - <<'PY'
from pathlib import Path
p = Path('experiments/figure-text-translation/test_figrings.py')
t = p.read_text(encoding='utf-8')
RULE = '# ' + '-' * 75 + '\n'
START = RULE + '# 7. Corpus anchors — the two real carriers, and the corpus-wide count\n' + RULE
END = "          hits == known, str(hits[:5]))\n"
assert t.count(START) == 1, f'start anchor {t.count(START)}'
assert t.count(END) == 1, f'end anchor {t.count(END)}'
i, j = t.index(START), t.index(END) + len(END)
NEW = RULE + '# 7b. Corpus anchors — the PUBLISHED bytes, after the step-2 recompose pass\n' + RULE + '''
# `svgout.raster_shell`'s artwork layer is ONE <image> of a base64 PNG drawn with
# preserveAspectRatio="none"; `write_svg` adds the live <text> and nothing else. Measured on the
# eight shells committed before the pass (ch17–21): <image> 1, <path> 0, <mask> 0, <feImage> 0.
SHELL_MARK = 'preserveAspectRatio="none" xlink:href="data:image/png;base64,'


def is_raster_shell(text):
    """True for a published copy whose artwork is one raster <image> and no vector at all."""
    return (SHELL_MARK in text and text.count('<image') == 1 and text.count('<path') == 0
            and text.count('<mask') == 0 and text.count('<feImage') == 0)


def published_text(name):
    """A committed media copy by file name. A seam on purpose: the re-pin's red check swaps a
    pre-pass copy in here."""
    return (MEDIA / name).read_text(encoding='utf-8')


# Section 7 pinned these three in committed bytes until the step-2 pass, whose ⑭ raster arm drew
# each as a shell. Their real-bytes ring census lives in 7a now, on source artwork.
FORMER_CARRIERS = ('CNX_Chem_03_01_exocytosis-88f6_IS.svg', 'CNX_Chem_05_02_HeatMeas_IS.svg',
                   'CNX_Chem_06_04_Econfig_IS.svg')

# A CORPUS PIN, moved by the step-2 recompose pass (§C140 ㊾). Before it the list was
# [('CNX_Chem_05_02_HeatMeas_IS.svg', 2)], ch05's gate-refused pair, with exocytosis anchored
# apart. Measured after the pass over every published copy except brain; the run is recorded in
# register ㊾. An exact list still trips on any NEW carrier, which is what this check is for.
KNOWN_PUBLISHED_CARRIERS = []


def test_corpus_anchors():
    print('7b. corpus anchors — the PUBLISHED bytes, after the step-2 recompose pass')
    brain = MEDIA / 'CNX_Chem_03_01_brain-ec0b_IS.svg'
    if not brain.exists():
        skip('corpus anchors', 'committed media SVGs not present')
        return
    # 🔴 BRAIN IS NO LONGER A CARRIER: THE DRIVER HEALED ITS RING (§C140 ⑩, local-box run
    # 2026-09-15, evidence/2026-09-15-c10-local-run/), and the step-2 pass healed it again when it
    # recomposed brain as vector. This anchor used to assert exactly one candidate, which was a
    # COUNTDOWN — true only until the fix it gates was first used. So it asserts the heal, and the
    # zero is paired with a WITNESS: at an unbounded threshold the walker must still reach mask-2,
    # or "no candidate" would read the same as a walker that no longer finds the mask at all. The
    # visible ring on REAL bytes is censused in section 7a, on brain's SOURCE artwork, which the
    # heal never touches; git history (38f60765) is not read here, because a history lookup is
    # vacuous on a depth-1 clone. The planted 90x24 ring fixture above is its SYNTHETIC stand-in.
    brain_text = brain.read_text(encoding='utf-8')
    bc, _ = figrings.find_candidates(brain_text)
    check('brain carries no candidate — its ring was healed', len(bc) == 0,
          f'got {[c.mask for c in bc]}')
    reach, _ = figrings.find_candidates(brain_text, ring_bytes=float('-inf'))
    check('WITNESS: the walker still reaches brain mask-2 (source-29, 90x24, nothing refused)',
          [(c.mask, c.image, c.px, c.refuse) for c in reach] == [('mask-2', 'source-29', [90, 24], None)],
          repr(reach))
    if reach:
        check('and every side of mask-2 is now below the byte threshold',
              max(reach[0].ring.values()) < figrings.RING_BYTES, repr(reach[0].ring))

    for name in FORMER_CARRIERS:
        if not (MEDIA / name).exists():
            check(f'{name} is published', False, 'no such file under media/')
            continue
        text = published_text(name)
        check(f'{name} is published as a raster shell (§C140 ⑭)', is_raster_shell(text),
              ' '.join(f'{k} {text.count(k)}' for k in ('<image', '<path', '<mask', '<feImage')))
        cs, _ = figrings.find_candidates(text)
        check(f'and {name} carries no candidate', cs == [], str([c.mask for c in cs]))
    # The fingerprint's two controls: it says yes to a shell committed before the pass and no to
    # the vector brain, so a "shell" verdict above is not a predicate that says yes to everything.
    check('CONTROL: the shell fingerprint recognises a pre-pass shell (SHE, ch17)',
          is_raster_shell(published_text('CNX_Chem_17_03_SHE_IS.svg')))
    check('CONTROL: and does not call the vector brain a shell', not is_raster_shell(brain_text))

    others = sorted(p for p in MEDIA.glob('*_IS.svg') if p.name != brain.name)
    if not others:
        skip('corpus sweep', 'no other media SVGs')
        return
    # NON-VACUITY: the sweep must actually have looked at a large population, or
    # "0 candidates elsewhere" is an absence manufactured by an empty glob.
    check('CONTROL: the sweep covered a non-trivial population', len(others) > 100,
          f'{len(others)} files')
    hits = []
    for p in others:
        cs, _ = figrings.find_candidates(p.read_text(encoding='utf-8'))
        if cs:
            hits.append((p.name, len(cs)))
    check('no published carrier beyond the known ones exists in this corpus today',
          hits == KNOWN_PUBLISHED_CARRIERS, str(hits[:5]))
'''
p.write_text(t[:i] + NEW + t[j:], encoding='utf-8')
print('replaced', t[i:j].count('\n'), 'lines with', NEW.count('\n'))
PY
git diff --stat
```
Expected: `replaced 73 lines with 91` (measured on a scratch copy with B-7a's edits applied) and one file changed. An anchor count other than 1 stops the step: read
section 7 and replace the same block by hand. The empty list is paired with positives that run through the same
`find_candidates`: section 1's planted ring, section 2's feImage reachability and, on the figure box, 7a's real bytes.

- [ ] **Step 5: Prove the new checks can fail (red on purpose, nothing written).** Swap the pre-pass HeatMeas (vector,
2 candidates, 8 `<feImage>`) in through the `published_text` seam; exactly HeatMeas's two checks must go red.

```bash
source /home/siggi/.cache/namsbokasafn-audit/c140-step2-pass/bin/env.sh
git show "$(git log -1 --format=%H --grep="COMPOSER_VERSION '4' -> '5'")":books/efnafraedi-2e/media/CNX_Chem_05_02_HeatMeas_IS.svg > "$PASS/c38/HeatMeas-prepass_IS.svg"
cat > "$PASS/c38/red_7b.py" <<'EOF'
import sys
from pathlib import Path
EXP = Path('/home/siggi/dev/repos/namsbokasafn-efni/experiments/figure-text-translation')
sys.path.insert(0, str(EXP))
import test_figrings as t
pre = Path('/home/siggi/.cache/namsbokasafn-audit/c140-step2-pass/c38/HeatMeas-prepass_IS.svg').read_text(encoding='utf-8')
real = t.published_text
t.published_text = lambda name: pre if name == 'CNX_Chem_05_02_HeatMeas_IS.svg' else real(name)
t.test_corpus_anchors()
names = sorted(f.split(': ', 1)[0] for f in t.FAILED)
print('FAILED:', names)
want = sorted(['CNX_Chem_05_02_HeatMeas_IS.svg is published as a raster shell (§C140 ⑭)',
               'and CNX_Chem_05_02_HeatMeas_IS.svg carries no candidate'])
sys.exit(0 if names == want else 1)
EOF
( cd "$EXP" && FIGTEXT_PYLIBS=./pylibs timeout 590 python3 -B -u "$PASS/c38/red_7b.py"; echo "exit=$?" )
```
Expected: `FAILED:` lists exactly those two names, then `exit=0`. (The sweep reads `media/` directly, so the seam does
not fool it.)

- [ ] **Step 6: Run the suite (green).**

```bash
source /home/siggi/.cache/namsbokasafn-audit/c140-step2-pass/bin/env.sh
( cd "$EXP" && FIGTEXT_PYLIBS=./pylibs timeout 590 python3 -u test_figrings.py > "$PASS/c38/figrings-7b.txt" 2>&1; echo "EXIT=$?" )
tail -3 "$PASS/c38/figrings-7b.txt"; grep -a 'SKIPPED\|^  FAIL' "$PASS/c38/figrings-7b.txt"
```
Expected: `EXIT=0`, last line `ALL PASS`, no `FAIL` line, and no `SKIPPED` line naming `source anchors` (on the figure
box such a skip means `sources.local.json` moved, and `main()` would still exit 0). Judge by the terminal `ALL PASS`.

- [ ] **Step 7: The composer suites and the corpus-reading test files, by name, on the passed tree.**

```bash
source /home/siggi/.cache/namsbokasafn-audit/c140-step2-pass/bin/env.sh
for t in test_figsym.py test_figis.py test_figure_prepare.py test_figure_compose.py test_sources.py; do ( cd "$EXP" && FIGTEXT_PYLIBS=./pylibs timeout 590 python3 -B -u "$t" > "$PASS/logs/b7b-$t.txt" 2>&1; echo "$t EXIT=$?" ); tail -1 "$PASS/logs/b7b-$t.txt"; done
```
```bash
source /home/siggi/.cache/namsbokasafn-audit/c140-step2-pass/bin/env.sh
for t in test_heldvalues.py test_heldplan.py test_compose_held.py; do ( cd "$EXP" && FIGTEXT_PYLIBS=./pylibs timeout 590 python3 -B -u "$t" > "$PASS/logs/b7b-$t.txt" 2>&1; echo "$t EXIT=$?" ); tail -1 "$PASS/logs/b7b-$t.txt"; done
for f in tools/__tests__/figure-config-validate.test.js tools/__tests__/figure-text-config.test.js tools/__tests__/figure-run-free.test.js tools/__tests__/figure-run-paid.test.js tools/__tests__/publish-figure-svg.test.js tools/__tests__/figure-review-render.test.js tools/__tests__/figure-text-sidecar.test.js server/__tests__/figureReviewService.test.js; do npx vitest run "$f" > "$PASS/logs/b7b-one.out" 2>&1; echo "$f exit=$?"; done
```
Expected: `EXIT=0` and `ALL PASS` for every Python suite; `exit=0` for every Vitest file. A red here is classified by
name before the commit (the full suite runs again in B-8).

- [ ] **Step 8: Commit.**

```bash
source /home/siggi/.cache/namsbokasafn-audit/c140-step2-pass/bin/env.sh
git add experiments/figure-text-translation/test_figrings.py && git status --porcelain
git commit -F - <<'EOF'
test(figrings): §C140 ㊾ D7 — published-bytes anchors re-pinned after the step-2 pass, 0 ISK

exocytosis, HeatMeas and Econfig are raster shells now (one <image>, no <path>/<mask>/<feImage>; the fingerprint is
controlled by a pre-pass shell and the vector brain), so section 7b asserts that and that they carry no candidate;
their real-bytes census lives in 7a on source artwork. Brain stays vector and healed, with its witness. The corpus
carrier list is measured after the pass. Shown to fail on a pre-pass HeatMeas.
EOF
git status --porcelain
```
Expected: exactly `M  experiments/figure-text-translation/test_figrings.py` before; empty porcelain after.

---

### Task B-6: Every figure in three engines, then a by-eye old (live June) / new / source sample

**Why:** spec "Predicted delta" — `browser-sweep.mjs` over every figure in Chromium, Firefox and WebKit (the
2026-09-29 spec's step-6 duty covers all 56 feImage figures), and a by-eye sample in Chromium and Firefox. **The
reader's baseline is the live June copy, not `HEAD`** (spec § The reader baseline): the held sync, not the pass,
replaces readers' pictures, so a prepared copy worse than its June copy becomes a regression at the sync. **The
June-better class is OPEN**: the census cannot see Icelandic → worse Icelandic or raster → vector, so the sample looks
for more.

**Files:** none in the repo. Scratch: `$PASS/sweep/`, `$PASS/eye/`, `$PASS/eye/verdicts.tsv`.

**Interfaces:**
- Consumes: `experiments/figure-text-translation/browser-sweep.mjs --out <dir> [--engines …] [--variant full|nofont|notext]`
  (writes `rows.<variant>.jsonl`, whose LAST line is `{"done":true,…}`; a run without it is not a clean run;
  `notext` renders a composed figure's artwork without its text layer, and lists a copy without the composer's framing
  as `unassigned`, `no-framing`); `browser-score.py --sweep <dir> --variant <v> [--ref chromium]` (refuses a sweep with
  no terminal line; flags a figure when `tol_hot_tiles > 0` or it did not render; writes `score.<variant>.json` and
  contact sheets `sheets/<ref>-vs-<engine>/<variant>-<id>.png`); `$PASS/bin/triptych.mjs` (B-3);
  `experiments/figure-text-translation/render-check.mjs <src> <out.png> [w] [h] [dsf]` (Chromium; honours `PLAYWRIGHT_CHROMIUM_EXECUTABLE`).
- Produces: the sweep scores, `$PASS/eye/verdicts.tsv` (`basename<TAB>same|better|worse|unsure<TAB>note`).

**Known noise, from the 2026-09-29/30 sweeps** (`evidence/2026-09-29-c27-c14/reports/sweep-notext-summary.json` and
`…-webkit-summary.json`, inspected then as identical content): Chromium vs Firefox, non-feImage flags
`CNX_Chem_09_03_GlobalWarming-b740`, `CNX_Chem_07_06_Dipolfield`, `CNX_Chem_04_05_propionate_img`; Chromium vs WebKit,
`CNX_Chem_06_04_PhosphOrb_img`, `CNX_Chem_18_02_DownsCell`, `CNX_Chem_21_04_FissnBomb`, `CNX_Chem_06_05_Oxygen122_img`,
`CNX_Chem_06_04_Carbon122_img`, `CNX_Chem_15_02_Answer18c_img`, `CNX_Chem_20_04_reaction1f_img`,
`CNX_Chem_04_05_propionate_img` (WebKit is not deterministic: one file can render differently twice). Controls then:
`ctl-plain` and `ctl-mix-blend` 0 hot tiles in both pairs; `ctl-feimage` and `ctl-blend-chain` over 100 hot tiles with
Firefox ink 0 (Firefox paints an in-document `<feImage>` transparent) and 0 in WebKit.

- [ ] **Step 1: The notext sweep (artwork only, the calibrated metric), detached.**

```bash
source /home/siggi/.cache/namsbokasafn-audit/c140-step2-pass/bin/env.sh
free -h | sed -n 2p; df -h "$PASS" | tail -1
setsid nohup bash -c 'source /home/siggi/.cache/namsbokasafn-audit/c140-step2-pass/bin/env.sh && node experiments/figure-text-translation/browser-sweep.mjs --out "$PASS/sweep" --variant notext > "$PASS/logs/sweep-notext.txt" 2>&1; echo "EXIT=$?" >> "$PASS/logs/sweep-notext.txt"' > /dev/null 2>&1 < /dev/null &
echo started
```
Wait with the Monitor tool until `grep -aq '^EXIT=' /home/siggi/.cache/namsbokasafn-audit/c140-step2-pass/logs/sweep-notext.txt`
(sample `ls -la "$PASS/sweep/rows.notext.jsonl"` twice, a minute apart, for progress). Then:
```bash
source /home/siggi/.cache/namsbokasafn-audit/c140-step2-pass/bin/env.sh
tail -2 "$PASS/logs/sweep-notext.txt"; tail -c 400 "$PASS/sweep/rows.notext.jsonl"; echo
( cd "$EXP" && FIGTEXT_PYLIBS=./pylibs python3 -B browser-score.py --sweep "$PASS/sweep" --variant notext --ref chromium > "$PASS/logs/score-notext.txt" 2>&1; echo "EXIT=$?" ); cat "$PASS/logs/score-notext.txt"
python3 - <<'PY'
import json
d = json.load(open('/home/siggi/.cache/namsbokasafn-audit/c140-step2-pass/sweep/score.notext.json'))
print('unassigned', d['unassigned'])
for pair, v in d['pairs'].items():
    print(pair, 'statuses', v['statuses'])
    print('  controls', [(c['id'], c.get('tol_hot_tiles'), None if c.get('ink_ratio') is None else round(c['ink_ratio'], 3)) for c in v['controls']])
    print('  flagged', [(f['id'], f.get('status'), f.get('tol_hot_tiles')) for f in v['flagged']])
PY
```
Expected: `EXIT=0` and the terminal `{"done":true,…}` row; the scorer's `EXIT=0`; `unassigned` holds the three kept
copies (PerTable2, catalyst, ibuprofen: June copies, no composer framing) — any other unassigned name must be a
textless figure B-4's `check-run.mjs` recorded as not recomposed; `statuses` all `rendered` in both pairs; the controls
as in 2026-09-29 (`ctl-plain`, `ctl-mix-blend` 0; `ctl-feimage`, `ctl-blend-chain` > 100 with ink 0 for Firefox; all
four 0 for WebKit) — the positive control that the metric can still see the defect; and **flagged ⊆ the known noise
lists above, with none of the 55 recomposed feImage figures** (all now shells). For every flagged id outside the
noise lists, open `$PASS/sweep/sheets/chromium-vs-<engine>/notext-<id>.png` with the Read tool: an edge or
antialiasing difference is noise (record it); a content difference is a finding — stop before B-8.

- [ ] **Step 2: The full sweep (as readers get it), detached; every figure must paint in every engine.**

```bash
source /home/siggi/.cache/namsbokasafn-audit/c140-step2-pass/bin/env.sh
setsid nohup bash -c 'source /home/siggi/.cache/namsbokasafn-audit/c140-step2-pass/bin/env.sh && node experiments/figure-text-translation/browser-sweep.mjs --out "$PASS/sweep" --variant full > "$PASS/logs/sweep-full.txt" 2>&1; echo "EXIT=$?" >> "$PASS/logs/sweep-full.txt"' > /dev/null 2>&1 < /dev/null &
echo started
```
After `^EXIT=` appears in `$PASS/logs/sweep-full.txt`:
```bash
source /home/siggi/.cache/namsbokasafn-audit/c140-step2-pass/bin/env.sh
python3 - <<'PY'
import collections, json
rows = [json.loads(l) for l in open('/home/siggi/.cache/namsbokasafn-audit/c140-step2-pass/sweep/rows.full.jsonl')]
print('terminal', rows[-1].get('done'))
c = collections.Counter((r.get('engine'), r.get('status')) for r in rows if 'engine' in r)
print(sorted(c.items()))
print('not rendered', [(r['engine'], r['id'], r.get('status')) for r in rows if 'engine' in r and r.get('status') != 'rendered'])
PY
```
Expected: `terminal True`; `rendered` for every figure and control in all three engines (715 each: 711 figures + 4
controls); `not rendered []`. (On 2026-09-30 WebKit could not finish HetCats-230a, TetOctHole and KMTPhases1 within
the timeout; all three are shells now.) Any `broken`, `timeout` or `error` is a finding: stop before B-8.

- [ ] **Step 3: The live copy really is vefur's synced tree** (the "old" column below reads it from disk).

```bash
source /home/siggi/.cache/namsbokasafn-audit/c140-step2-pass/bin/env.sh
V=/home/siggi/dev/repos/namsbokasafn-vefur/static/content/efnafraedi-2e/chapters
for x in 01/CNX_Chem_01_02_MattType 12/CNX_Chem_12_07_HetCats-230a 14/CNX_Chem_14_06_buffer; do
  curl -s -o "$PASS/eye/live.svg" -w "%{http_code} %{size_download} " "https://namsbokasafn.is/content/efnafraedi-2e/chapters/${x%%/*}/images/media/${x#*/}_IS.svg"
  cmp -s "$PASS/eye/live.svg" "$V/${x%%/*}/images/media/${x#*/}_IS.svg" && echo "SAME ${x#*/}" || echo "DIFFERS ${x#*/}"
done
curl -s -o /dev/null -w "%{http_code} %{size_download}\n" https://namsbokasafn.is/content/efnafraedi-2e/chapters/01/images/media/CNX_Chem_01_02_NoSuch_zz_IS.svg
```
Expected: `200 <bytes> SAME …` for all three (MattType was `200 96916 SAME` on 2026-10-03), then `404 162` for the
nonsense name — the control that a 200 here means a real file (route status codes on the page URLs are meaningless:
the SPA answers every path). A `DIFFERS` means vefur's tree lags the live site: use the live file as "old" for that
figure and record it.

- [ ] **Step 4: Build the sample list** — every June-better figure, every held figure, both re-aligned ㉑ figures,
the §C161 five, the ring and shell figures, the kept copies, the policy-row AMFM, and a seeded random sample of 20
other figures plus 10 of the new shells.

```bash
source /home/siggi/.cache/namsbokasafn-audit/c140-step2-pass/bin/env.sh
python3 - <<'PY'
import glob, json, os, random
PASS = '/home/siggi/.cache/namsbokasafn-audit/c140-step2-pass'
fixed = [
    # June-better class (spec): the five, then the held figures (MattType is both)
    'CNX_Chem_02_05_PerTable2', 'CNX_Chem_12_07_HetCats-230a', 'CNX_Chem_01_02_MattType', 'CNX_Chem_01_04_MYdCmIn',
    'CNX_Chem_10_05_Graphene',
    'CNX_Chem_07_04_HNO2_img', 'CNX_Chem_09_05_MolSpeed1', 'CNX_Chem_14_02_phscale', 'CNX_Chem_14_06_buffer',
    'CNX_Chem_18_04_OxStNonmts', 'CNX_Chem_20_04_amide1_img',
    # ㉑'s two re-aligned figures; §C161's five; the ring figure; the first ⑭ shell; the kept copies; C3 (kept English)
    'CNX_Chem_18_07_Nitrogen', 'CNX_Chem_14_01_conjugate_img',
    'CNX_Chem_03_01_Ex01_05d_img', 'CNX_Chem_03_01_Ex01_06d_img', 'CNX_Chem_04_04_saccharin_img',
    'CNX_Chem_20_01_HalAlkane_img', 'CNX_Chem_20_01_HalAlkane3_img',
    'CNX_Chem_03_01_brain-ec0b', 'CNX_Chem_01_05_Archery',
    'CNX_Chem_13_03_catalyst', 'CNX_Chem_03_01_ibuprofenmass_img', 'CNX_Chem_06_01_AMFM',
]
shells = json.load(open(f'{PASS}/census.json'))['shells']
media = sorted(os.path.basename(p)[:-len('_IS.svg')] for p in glob.glob('/home/siggi/dev/repos/namsbokasafn-efni/books/efnafraedi-2e/media/*_IS.svg'))
rest = [b for b in media if b not in fixed and b not in shells]
sample = fixed + random.Random(549).sample(rest, 20) + random.Random(5491).sample([s for s in shells if s not in fixed], 10)
open(f'{PASS}/eye/list.txt', 'w').write('\n'.join(sample) + '\n')
print(len(fixed), len(sample)); print('\n'.join(sample[len(fixed):]))
PY
```
Expected: `23 53`, then the 30 sampled names (deterministic for a given census: the seeds are fixed).

- [ ] **Step 5: Render and look.**

```bash
source /home/siggi/.cache/namsbokasafn-audit/c140-step2-pass/bin/env.sh
free -h | sed -n 2p
node "$PASS/bin/triptych.mjs" "$PASS/eye/list.txt" "$PASS/eye/after" > "$PASS/logs/triptych.txt" 2>&1; echo "EXIT=$?"; tail -1 "$PASS/logs/triptych.txt"
awk -F'\t' 'NR>1 && $6 ~ /(^|,)0(,|$)/' "$PASS/eye/after/index.tsv"
( cd "$EXP" && node render-check.mjs "$REPO/books/efnafraedi-2e/media/CNX_Chem_14_06_buffer_IS.svg" "$PASS/eye/after/buffer-new-x4.png" 1173 965 2 ); echo "zoom EXIT=$?"
```
Expected: `EXIT=0`, `done: 53 figure(s) x 2 engines -> …`; the `awk` line prints nothing (no copy failed to paint;
a `(none)` cell is a figure never published to readers, 27 of them per the spec, and is not a failure); `zoom EXIT=0`.
Then open every PNG under `$PASS/eye/after/chromium/` and `…/firefox/`, and `buffer-new-x4.png` beside B-3's
`buffer-old-x4.png` and `buffer-source-x4.png`, with the Read tool, and write `$PASS/eye/verdicts.tsv` with a header
line `basename<TAB>verdict<TAB>note` and one line per figure: `same` (new matches old in wording, layout and
legibility), `better`, `worse` or `unsure`. Look specifically for: wording that is worse Icelandic than June (HetCats'
class); a June raster or vector replaced by something less legible (PerTable2's class — PerTable2 itself must be
`same`, byte-identical); English that June had translated (MattType's and MYdCmIn's class — MattType must now read
[USER]'s *Nei*; MYdCmIn keeps `1 in.` by ruling C1, so `same` or `worse` only for other reasons); a raster shell
blurred at DSF 2 where June was sharp; missing artwork in Firefox (⑭: none should remain); labels clipped or
overlapping; and buffer's charge after its subscript (ruling (3)).

- [ ] **Step 6: Decide.**

```bash
source /home/siggi/.cache/namsbokasafn-audit/c140-step2-pass/bin/env.sh
awk -F'\t' 'NR>1 {n[$2]++} END {for (k in n) print k, n[k]}' "$PASS/eye/verdicts.tsv"
awk -F'\t' 'NR>1 && ($2=="worse" || $2=="unsure")' "$PASS/eye/verdicts.tsv"
awk -F'\t' 'NR>1' "$PASS/eye/verdicts.tsv" | wc -l
```
Expected: 53 verdict lines, and **no `worse` or `unsure` line**. Any such line stops the plan before B-8: show
[USER] the triptych PNGs and the figure's note, and wait for a ruling. The routes available, from the spec (D1, D4) —
**[USER] chooses; nothing is applied without the ruling:** (a) keep the live June copy under `keptCopies` (a B-1-shaped
commit: entry, `git show <June commit>:<path> > <path>`, where `<June commit>` is the commit whose blob `cmp`s equal to vefur's synced copy (and to the live URL, as in Step 3), never a guessed vintage (`9269fcda8`'s PerTable2 draws English). Run B-1 Step 3's `sources.py --json` reading `kept` BEFORE the sidecar's `git rm`, if it has one (PR-A Handoff item 0). Then land all of it in one commit; the
June copies the spec measured — HetCats', Graphene's, MattType's, MYdCmIn's — embed Liberation Sans 1.07.4, so such
a restore widens ㉗'s exception; only PerTable2's raster is font-free); (b) a value edit through
figure review after the '5' deploy, then one 0-ISK `--stale` recompose and step 3's re-render, all before the sync. ⚠️ (b) does NOT exist for a heldBlockValues label. Figure review lists only `sidecar.blocks`, so it can neither see nor edit a held label (Part 5 design D-h 2). A changed held value never reaches a SIDECAR figure's media on a `--stale` run once that sidecar is stamped '5'. It reaches it only through the next bump, or through a `--stale --force --figure` run that needs its own [USER] ruling (D-h 1). So for MattType, MolSpeed1, phscale, buffer and amide1_img the routes are (a), (c), or that ruling. A config edit plus `--stale` alone reads `skipped-current`, VERDICT ok, and changes nothing. Only the textless HNO2_img and OxStNonmts take a changed value on their chapter's next `--stale` run;
(c) accept. After any such commit, re-run B-5 Step 2 and record why the census changed.

---

### Task B-8: The PR, CI, the read-only prod checks, the deploy, and the record

**Files:**
- Modify: `docs/plans/2026-07-21-post-item17-followup-campaign.md` (a new ⏩ RESUME block on top; a dated sentence in
  row ㊾; the previous block's next action marked superseded)
- Modify: `experiments/figure-text-translation/REGISTER.md` (dated amendments to ⑤(a), ⑩ and ⑭)
- Restore: the repo `.env` from `$PASS/env.aside`

**Interfaces:**
- Consumes: `$PASS/census.json`, the live logs, `$PASS/sweep/score.notext.json`, `$PASS/eye/verdicts.tsv`; `gh`; read-only
  `ssh -o BatchMode=yes` to prod (standing permission for read-only, non-sudo checks; memory `deploy-infrastructure`).
- Produces: the PR (merge commit), the register record, the verified deploy.

- [ ] **Step 1: Restore `.env` — every figure-run in this plan is done. Run this step AFTER Step 2, not before.** The premise below ('No Vitest file reads the real `.env`') is false. `tools/__tests__/api-translate-glossary-only.test.js` spawns `tools/api-translate.js` with `MALSTADUR_API_KEY: ''`, and its `main()` refills an empty key from the repo `.env`. Those calls are `--dry-run` refusals, so nothing is spent, but restoring after Step 2 keeps the last suite run in the same key-less world as B-bump's baseline.

```bash
source /home/siggi/.cache/namsbokasafn-audit/c140-step2-pass/bin/env.sh
ps -eo pid,args | grep -a '[f]igure-run.js'; echo "running=$? (1 = none)"
test -e .env && echo ".env ALREADY PRESENT — stop" || mv -n "$PASS/env.aside" .env
ls -la .env | awk '{print $1, $5}'; git status --porcelain
```
Expected: `running=1`; `.env` back (`-rw-r--r-- 540`); empty porcelain (it is ignored). It comes back here, and not
later, only because nothing after this step is a figure-run. (No Vitest file reads the real `.env` — the driver's
suites stub the API and `translate-blocks.mjs` takes an injected `envPath` — and B-bump's baseline suite ran with it
aside; Step 2 compares failing SETS by name, so a difference would show either way.)

- [ ] **Step 2: The full suite's failing set is still the B-bump baseline; lint and format are clean.**

```bash
source /home/siggi/.cache/namsbokasafn-audit/c140-step2-pass/bin/env.sh
npx vitest run --reporter=json --outputFile="$PASS/c38/suite-final.json" > "$PASS/c38/suite-final.out" 2>&1; echo "exit=$?"
node -e "const r=require('$PASS/c38/suite-final.json');const red=[];for(const f of r.testResults){for(const a of f.assertionResults)if(a.status==='failed')red.push(a.fullName);if(f.status==='failed'&&!f.assertionResults.some((a)=>a.status==='failed'))red.push('FILE '+f.name)}require('fs').writeFileSync('$PASS/c38/red-final.txt',red.sort().join('\n')+'\n');console.log('failing entries',red.length)"
diff "$PASS/c38/red-before.txt" "$PASS/c38/red-final.txt"; echo "diff-exit=$?"
npm run lint > "$PASS/logs/lint.txt" 2>&1; echo "lint EXIT=$?"; npm run format:check > "$PASS/logs/format.txt" 2>&1; echo "format EXIT=$?"
```
(Detached as in B-bump Step 2 if the suite outlasts the cap.) Expected: `diff-exit=0`, `lint EXIT=0`,
`format EXIT=0`. A failing entry in either direction is classified by name before the PR.

- [ ] **Step 3: Push and open the PR.**

```bash
source /home/siggi/.cache/namsbokasafn-audit/c140-step2-pass/bin/env.sh
git status --porcelain; git log --oneline "$(cat "$PASS/base.sha")"..HEAD | wc -l
git push -u origin content/c140-c49-recompose-pass
gh pr create --base main --head content/c140-c49-recompose-pass \
  --title "§C140 ㊾ step 2: keptCopies/value/heldBlockValues data, COMPOSER_VERSION '5', the 0-ISK recompose pass" \
  --body-file - <<'EOF'
## Summary
- **Data, per [USER]'s 2026-10-02/03 rulings:** PerTable2's June raster restored and kept, with catalyst and ibuprofen,
  in `keptCopies` (one commit with the sidecar removal); HetCats and Graphene sidecar values by value, `renderHash`
  under `composerVersion` '4'; `heldBlockValues` for 7 figures from the value sheet.
- **`COMPOSER_VERSION` '4' → '5'** and the single `figure-run.js --stale` pass over all 22 chapter runs, 0 ISK (`.env`
  out of the repo throughout; MT spawned for 0 figures in every log). One commit per chapter.
- **`test_figrings.py`**: ring anchors moved to source artwork (7a) and the published-bytes section re-pinned (7b).

## Test plan
- Per chapter, `--stale --dry-run` then live, each summary checked against a prediction measured from the tree.
- Census by value (off-repo `census.json`): sidecars restamped one line each; the predicted raster-shell set; 0 copies
  ≥ 8 MiB; 0 `<feImage>`; §C161 colours gone; ICE pair and kept copies byte-identical; held labels at their positions;
  nobelium control; textless convergence byte-identical on a second run.
- `browser-sweep.mjs` over every figure in Chromium, Firefox and WebKit; by-eye old (live June)/new/source sample.
- Composer suites by name; the full suite's failing set unchanged; lint, format:check.

**Merge as a merge commit (not squash).** The deploy that carries '5' needs the read-only prod checks first
(0 dirty sidecars, 0 `figure_review` rows); figure review reopens after it.
Plan: `docs/superpowers/plans/2026-10-03-c140-step2-recompose-pass.md`.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
gh pr view --json number --jq .number | tee "$PASS/pr.number"
```
Expected: empty porcelain; the commit count since the base (B-1, B-2, B-3, B-7a, B-bump, 23 pass commits, B-7b and
any B-6 remedy); a PR number written to `$PASS/pr.number`.

- [ ] **Step 4: The record — the campaign register and the figure register, from the measurements.**

```bash
source /home/siggi/.cache/namsbokasafn-audit/c140-step2-pass/bin/env.sh
cat > "$PASS/bin/gen-resume.py" <<'EOF'
#!/usr/bin/env python3
"""$PASS/bin/gen-resume.py — prints the campaign register's new ⏩ RESUME block and the sentence for row ㊾, every
number read from this pass's own records (census.json, the live logs, the notext sweep score, the by-eye
verdicts, pr.number). Read-only; the executor pastes its output."""
import datetime
import json
import re
from pathlib import Path

PASS = Path('/home/siggi/.cache/namsbokasafn-audit/c140-step2-pass')
c = json.loads((PASS / 'census.json').read_text())
pr = (PASS / 'pr.number').read_text().strip()
logs = sorted(p for p in (PASS / 'logs').iterdir() if re.match(r'^ch.+\.live(\.[a-z0-9-]+)?\.txt$', p.name))
unspent = [p.name for p in logs if 'MT spawned for 0 figure(s), 0 billable characters' in p.read_text(encoding='utf-8')]
score = json.loads((PASS / 'sweep' / 'score.notext.json').read_text())
flagged = {pair: [f['id'] for f in v['flagged']] for pair, v in score['pairs'].items()}
rows = [ln.split('\t') for ln in (PASS / 'eye' / 'verdicts.tsv').read_text(encoding='utf-8').splitlines()[1:] if ln.strip()]
worse = [r[0] for r in rows if r[1] in ('worse', 'unsure')]
assert not c['fails'], f"census.json records failures {c['fails']}: this block would claim CENSUS PASS"
assert not worse, f'by-eye verdicts worse or unsure: {worse} (B-6 Step 6 is unresolved)'
assert logs and len(unspent) == len(logs), f'{len(unspent)} of {len(logs)} live logs say MT spawned for 0'
today = datetime.date.today().isoformat()
url = f'https://github.com/SigurdurVilhelmsson/namsbokasafn-efni/pull/{pr}'
print(f"""## ⏩ RESUME — state as of **{today} — §C140 step 2's recompose pass RAN (0 ISK) on `content/c140-c49-recompose-pass`, [PR #{pr}]({url}); census and sweep clean. Awaiting [USER]'s merge and the deploy that carries COMPOSER_VERSION '5'. ⏹ The chemistry sync is still HELD** (supersedes the {re.search(r'state as of [*][*](.+?) — ', Path('docs/plans/2026-07-21-post-item17-followup-campaign.md').read_text(encoding='utf-8')).group(1)} block for its SINGLE NEXT ACTION; that block stays current for where the evidence is)

### ⏭ SINGLE NEXT ACTION — **[USER]: merge [PR #{pr}]({url}) as a merge commit, then deploy.** [CODE] first runs the read-only prod checks (0 dirty sidecars, 0 `figure_review` rows; plan [`docs/superpowers/plans/2026-10-03-c140-step2-recompose-pass.md`](../superpowers/plans/2026-10-03-c140-step2-recompose-pass.md) Task B-8). Figure review reopens after that deploy (2026-09-26 ruling 5). The next plan is step 3: ②'s whole-book re-inject and re-render.

- **Census** (off-repo `~/.cache/namsbokasafn-audit/c140-step2-pass/census.json`, `CENSUS PASS`): {c['sidecarsRestamped']} sidecars restamped '4' → '5' (one line each; HetCats and Graphene two); {len(c['shells'])} raster shells, exactly the predicted set; {c['mediaChanged']} of {c['mediaFiles']} copies changed; 0 copies at 8 MiB or more; `<feImage>` in {len(c['feImage'])}; the §C161 colours nowhere; the ICE pair, PerTable2 (June raster), catalyst and ibuprofen byte-identical; heldBlockValues drawn at their positions, with the nobelium control; HetCats and Graphene carry [USER]'s values.
- **Spend:** {len(unspent)} of {len(logs)} live logs say `MT spawned for 0 figure(s)`.
- **Sweep** (notext, Chromium as reference): flagged {json.dumps(flagged, ensure_ascii=False)}.
- **By eye** ({len(rows)} figures, old/new/source in Chromium and Firefox): worse than the live June copy or unsure: {worse or 'none'}.
""")
print('ROW ㊾ SENTENCE:')
print(f"✏️ *{today}: PR-A merged; PR-B's pass ran on [PR #{pr}]({url}), 0 ISK, census and sweep clean; awaiting [USER]'s merge and the '5' deploy.*")
EOF
python3 -B "$PASS/bin/gen-resume.py" > "$PASS/resume.out"; echo "EXIT=$?"; cat "$PASS/resume.out"
python3 - <<'PY'
import subprocess
from pathlib import Path
PASS = Path('/home/siggi/.cache/namsbokasafn-audit/c140-step2-pass')
block, sentence = PASS.joinpath('resume.out').read_text(encoding='utf-8').split('\nROW ㊾ SENTENCE:\n')
sentence = sentence.strip()
reg = Path('docs/plans/2026-07-21-post-item17-followup-campaign.md')
t = reg.read_text(encoding='utf-8')
i = t.index('## ⏩ RESUME')
nl = t.index('\n', i)
old_title = t[i:nl]
t = t[:i] + block.rstrip() + '\n\n---\n\n' + old_title + ' — **⚠️ Its SINGLE NEXT ACTION is SUPERSEDED by the block above (the pass ran).**' + t[nl:]
lines = t.split('\n')
rows = [k for k, ln in enumerate(lines) if ln.startswith('| ㊾ |')]
assert len(rows) == 1, f'{len(rows)} rows'
row = lines[rows[0]].rstrip()
assert row.endswith(' |'), 'row ㊾ does not end with a cell border'
lines[rows[0]] = row[:-2] + ' ' + sentence + ' |'
reg.write_text('\n'.join(lines), encoding='utf-8')

def sha(grep):
    return subprocess.run(['git', 'log', '-1', '--format=%h', f'--grep={grep}'], capture_output=True, text=True, check=True).stdout.strip()
b1, b2, bump = sha("PerTable2's June raster restored and kept"), sha('HetCats and Graphene sidecar values'), sha("COMPOSER_VERSION '4' -> '5'")
assert b1 and b2 and bump, (b1, b2, bump)
fr = Path('experiments/figure-text-translation/REGISTER.md')
f = fr.read_text(encoding='utf-8')
amend = [
    ("register's §C140 ㊾ and the step-2 spec.*\n",
     f"register's §C140 ㊾ and the step-2 spec.* ✏️ *PR-B (§C140 ㊾): the June raster is restored and kept under\n"
     f"`keptCopies`, and the sidecar with its 15 per-word keys is removed ({b1}); its paid MT record stays at `7df47b298`.*\n"),
    ("unscalable, not re-editable — a candidate for redoing through this pipeline.\n",
     f"unscalable, not re-editable — a candidate for redoing through this pipeline. ✏️ *[USER] ruled 2026-10-02 to KEEP\n"
     f"  it (step-2 spec D2): it is the copy readers are served, it embeds no font, and the re-buy was given up; recorded in\n"
     f"  `keptCopies` ({b1}).*\n"),
    ("Measured read-only; evidence\n  `~/.cache/namsbokasafn-audit/2026-10-02-step2-rederive/`.\n",
     f"Measured read-only; evidence\n  `~/.cache/namsbokasafn-audit/2026-10-02-step2-rederive/`. ✏️ *Remedied by [USER]'s ruling (route 1): the\n"
     f"  three values were rewritten by value with the keys untouched ({b2}), and the '5' pass ({bump}) recomposed it.*\n"),
]
for old, new in amend:
    assert f.count(old) == 1, old[:50]
    f = f.replace(old, new)
fr.write_text(f, encoding='utf-8')
print('register and REGISTER.md patched', b1, b2, bump)
PY
git diff --stat
```
Expected: the generated block (every number from the records; `worse than the live June copy or unsure: none`), then
`register and REGISTER.md patched <three short shas>` and two files changed. Read the diff once: status lives in the
register, so the block must say what is true now (PR open, not merged, not deployed).

```bash
source /home/siggi/.cache/namsbokasafn-audit/c140-step2-pass/bin/env.sh
git add docs/plans/2026-07-21-post-item17-followup-campaign.md experiments/figure-text-translation/REGISTER.md && git status --porcelain
git commit -F - <<'EOF'
docs(register): §C140 ㊾ — step 2's pass ran, 0 ISK, census and sweep clean; awaiting merge and the '5' deploy

A new RESUME block generated from the pass's own records (census.json, the live logs, the notext sweep score, the
by-eye verdicts), a dated sentence in row ㊾, and dated amendments to the figure REGISTER.md's ⑤(a) and ⑩ (PerTable2
kept under keptCopies) and ⑭ (HetCats remedied by value, keys untouched).
EOF
git push; git status --porcelain
```
Expected: the two files staged; empty porcelain after the push.

- [ ] **Step 5: CI on the PR head.**

```bash
source /home/siggi/.cache/namsbokasafn-audit/c140-step2-pass/bin/env.sh
gh api "repos/SigurdurVilhelmsson/namsbokasafn-efni/actions/runs?head_sha=$(git rev-parse HEAD)" --jq .total_count
gh pr checks "$(cat "$PASS/pr.number")"
```
Expected: `total_count` > 0 (a 0 means no run was scheduled: check `https://www.githubstatus.com` before looking for a
repo-side cause, CLAUDE.md § CI); then, once finished, every check `pass` — lint, test, e2e, security, and validate /
check-docs where their path filters fire. A red check is read in its log before anything else.

- [ ] **Step 6: Merge only on [USER]'s go, and only after Step 7's read-only prod checks have passed once.** Run Step 7 now; it is repeated before the deploy. A dirty prod sidecar or a `figure_review` row found after the merge would leave `main` carrying a '5' that no deploy may ship.

```bash
source /home/siggi/.cache/namsbokasafn-audit/c140-step2-pass/bin/env.sh
gh pr merge "$(cat "$PASS/pr.number")" --merge
git fetch origin && git log --oneline -1 origin/main && git rev-list --parents -n 1 origin/main | wc -w
```
Expected: the merge commit on `origin/main` with two parents (`3`). Never `--squash`.

- [ ] **Step 7: Before the deploy that carries '5' — the read-only prod checks** (register, 2026-09-26 block, "STEP
4 IS DONE"; spec group B). The host is not written in this public repo: it is in the operator's shell history
(memory `deploy-infrastructure`), and the checkout is `~/repos/namsbokasafn-efni`.

```bash
source /home/siggi/.cache/namsbokasafn-audit/c140-step2-pass/bin/env.sh
PROD=$(grep -aoE '[a-z]+@[0-9]+(\.[0-9]+){3}' ~/.bash_history | sort | uniq -c | sort -rn | head -1 | awk '{print $2}'); echo "prod target found: ${PROD:+yes}"
ssh -o BatchMode=yes "$PROD" bash -s > "$PASS/logs/prod-check.txt" <<'EOF'
cd ~/repos/namsbokasafn-efni || exit 1
echo "HEAD $(git rev-parse HEAD)"
echo "dirty figure-text lines: $(git status --porcelain -- books | grep -ac figure-text)"
echo "tracked figure-text files: $(git ls-files -- books | grep -ac figure-text)"
# must read a number, then 0: deploy.sh's pull --rebase would replay a prod-only sidecar commit onto the restamped sidecars and stop mid-rebase
echo "prod-only commits: $(git rev-list --count origin/main..HEAD 2>&1); of them touching a sidecar: $(git log --name-only --format= origin/main..HEAD -- books 2>&1 | grep -ac figure-text)"
cd server && /usr/bin/node -e "const db=new (require('better-sqlite3'))(require('./lib/dbPath')(),{readonly:true,fileMustExist:true}); console.log('figure_review', JSON.stringify(db.prepare('SELECT state, count(*) AS n FROM figure_review GROUP BY state').all())); console.log('figure_block_edit', db.prepare('SELECT count(*) AS n FROM figure_block_edit').get().n); console.log('registered_books', db.prepare('SELECT count(*) AS n FROM registered_books').get().n)"
EOF
cat "$PASS/logs/prod-check.txt"
H=$(grep -a '^HEAD ' "$PASS/logs/prod-check.txt" | awk '{print $2}')
git cat-file -e "$H^{commit}" 2>/dev/null && echo "dev count for prod HEAD: $(git ls-tree -r --name-only "$H" -- books | grep -ac figure-text)" \
  || echo "prod HEAD $H is not in this clone (a stranded content commit): use prod's own tracked count as the control"
```
Expected: `prod target found: yes`; `dirty figure-text lines: 0`;
`tracked figure-text files` equal to the `dev count for prod HEAD` line (or, for a stranded HEAD, over 400) — the
control that this is a real checkout of the sidecar tree; `figure_review []`; `figure_block_edit 0`; `registered_books` > 0 (6 on
2026-09-29) — the control that this is the real `sessions.db`. ⚠️ Do not use a wildcard pathspec
(`-- 'books/*/figure-text/'`): it prints nothing with a sidecar dirty (memory `git-wildcard-pathspec-silent-null`).
**Any dirty sidecar or any `figure_review` row stops the deploy**: [USER] decides, because a '5' deploy demotes every
approval and a dirty prod sidecar would collide with the restamp.

- [ ] **Step 8: [USER] deploys** (`./scripts/deploy.sh` on prod needs `sudo`: it is [USER]'s). Then verify, read-only:

```bash
source /home/siggi/.cache/namsbokasafn-audit/c140-step2-pass/bin/env.sh
PROD=$(grep -aoE '[a-z]+@[0-9]+(\.[0-9]+){3}' ~/.bash_history | sort | uniq -c | sort -rn | head -1 | awk '{print $2}')
ssh -o BatchMode=yes "$PROD" bash -s <<'EOF'
cd ~/repos/namsbokasafn-efni || exit 1
git reflog -3 --date=iso | cat
systemctl show ritstjorn --property=ActiveEnterTimestamp
git rev-parse HEAD; git status --porcelain | wc -l
grep -an "^const COMPOSER_VERSION" tools/lib/figure-text-sidecar.cjs
grep -al '"composedVersion": "5"' books/efnafraedi-2e/figure-text/*.is.json | wc -l
curl -s 127.0.0.1:3000/api/health | head -c 600; echo
EOF
git rev-parse origin/main
```
Expected: a reflog entry `pull --rebase origin main: Fast-forward` to the merge commit; an `ActiveEnterTimestamp`
AFTER that pull (a fresh start with no new pull is a no-op deploy: memory `deploy-infrastructure`); prod `HEAD` equal
to `origin/main`; `0` dirty paths; `const COMPOSER_VERSION = '5';`; `460`; `/api/health` with `"status":"ok"`, or a
`degraded` that names a check unrelated to figures (read it; the content backup check lags by design).

- [ ] **Step 9: After the deploy.**
  - **Figure review reopens** (2026-09-26 ruling 5). Record it, with the deploy's reflog line, in the next register
    docs commit, batched with step 3's branch (memory `feedback-batch-docs-only-pushes`): no docs-only push for it.
  - Remove the two `.bak` files once the merge is on `main`:
    `rm books/efnafraedi-2e/figure-text/CNX_Chem_12_07_HetCats-230a.is.json.*.bak books/efnafraedi-2e/figure-text/CNX_Chem_10_05_Graphene.is.json.*.bak`
    (the merged commit and `$PASS` hold everything they did).
  - Keep `$PASS` as the pass's evidence; the register names it.
  - **Next is step 3** (②'s whole-book re-inject and re-render, then `--prune`), its own plan; readers get the new media
    only through it and [USER]'s sync, which stays HELD behind the ⏹ SYNC PRECONDITION.
