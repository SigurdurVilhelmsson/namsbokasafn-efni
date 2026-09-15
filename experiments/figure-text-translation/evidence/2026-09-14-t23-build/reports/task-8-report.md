# Task 8 Report — `COMPOSER_VERSION` `'2'` → `'3'`

## Pre-flight

`git rev-parse HEAD` at start = `98d81b0b1420537c16d69994ab0db0cc2bf3cfb1` (matches required
BASE). `git status --porcelain` at start = clean. Branch =
`feat/c140-t23-scripts-reflow-decimals`.

## Step 1: the diff

```diff
diff --git a/tools/lib/figure-text-sidecar.cjs b/tools/lib/figure-text-sidecar.cjs
index 08d98a8a..68c42013 100644
--- a/tools/lib/figure-text-sidecar.cjs
+++ b/tools/lib/figure-text-sidecar.cjs
@@ -23,8 +23,11 @@ const SIDECAR_VERSION = 1;
  * figure back to mt-preview until re-reviewed.
  *
  * '2' (2026-09-13, §C140 ①): kept figure text is drawn run-exact.
+ * '3' (2026-09-14, §C140 ② ③ ⑨): translated labels keep their formula formatting and are laid
+ * out against their own container; English-kept numbers are drawn with a decimal comma; the
+ * artwork's cairo blend chains are collapsed so a browser can load them.
  */
-const COMPOSER_VERSION = '2';
+const COMPOSER_VERSION = '3';
 
 /**
  * @param {string} bookDir  the BOOK directory, i.e. `books/<slug>` — NOT the books
```

MATCH — verbatim against the brief's Step 1 block. No other line in the file was touched
(prettier was not run on it, per instruction; the file's pre-existing `prettier --check`
failure is unrelated to this hunk and was left alone).

## Step 2: JS by name against the baseline

Ran in the foreground with `timeout: 600000` (never backgrounded):

```
npx vitest run --reporter=json --outputFile="$SCRATCH/t8-js.json" > "$SCRATCH/t8-js.log" 2>&1
exit=1
```

(exit 1 is expected — the baseline itself has failing tests.)

Comparison snippet output (`$SCRATCH/t8-delta.txt`, Task 7 Step 3's snippet, second arg
`t8-js.json`):

```
tests 6498
NEWLY RED: ['tools/__tests__/figure-run-free.test.js :: a figure whose sidecar is current is skipped before anything is spent skips exactly the figures that really do have a current sidecar — no more, no fewer', 'tools/__tests__/figure-run-free.test.js :: the pre-flight refusals that a dry run exists to surface names an unresolved figure instead of failing the run over it (R9)']
NEWLY GREEN: ['tools/__tests__/figure-run-free.test.js :: prepare warnings reach the operator prints a warning verbatim, naming the figure that produced it', 'tools/__tests__/figure-run-free.test.js :: the de-hash is LOOKUP-ONLY: it finds artwork, it never renames a figure prepares every figure under its own unstripped basename, in its own directory', 'tools/__tests__/figure-run-free.test.js :: the de-hash is LOOKUP-ONLY: it finds artwork, it never renames a figure resolves a hashed figure through its stripped name, in a SECOND resolver pass', 'tools/__tests__/figure-run-free.test.js :: the de-hash is LOOKUP-ONLY: it finds artwork, it never renames a figure still reports a hashed figure unresolved when neither name has artwork', 'tools/__tests__/figure-run-free.test.js :: the de-hash refuses a CONTESTED stem rather than guessing which figure owns it de-hashes ch03 exactly as before — the guard refuses the contest, not the fallback', 'tools/__tests__/figure-run-free.test.js :: the pre-flight refusals that a dry run exists to surface REFUSES a figure whose meta.json names a different figure', 'tools/__tests__/figure-run-free.test.js :: the pre-flight refusals that a dry run exists to surface files a prepare that exited non-zero as failed-prepare, not as text-less']
suites failing to LOAD: [] | baseline: []
```

| Metric | Expected | Actual | Verdict |
|---|---|---|---|
| `tests` | 6498 | 6498 | MATCH |
| NEWLY RED | 2, in `figure-run-free.test.js`: "skips exactly the figures that really do have a current sidecar …" and "names an unresolved figure instead of failing the run over it (R9)" | exactly those 2, same file | MATCH |
| NEWLY GREEN | 7, all in `figure-run-free.test.js` | exactly those 7, same file | MATCH |
| load-fail | `[]`, equal to baseline `[]` | `[]`, equal to baseline `[]` | MATCH |

## Per-moved-test evidence: does each read committed sidecar data?

The mechanism common to all 9: `runFigures(args, deps)` in `tools/figure-run.js` defaults
`readSidecar`/`sidecarExists` to the **real filesystem** reader when a test does not override
them:

```js
// tools/figure-run.js:1275-1278
const readSidecarFor = deps.readSidecar || readSidecar;
const sidecarExists = deps.sidecarExists || fs.existsSync;
```

and staleness is decided by comparing the sidecar's own `composedVersion` field against the
just-bumped constant:

```js
// tools/figure-run.js:274
if (composedVersion !== COMPOSER_VERSION) return true;
```

`applySidecarGuard`/`isStale` gate the `skipped-current` classification
(`tools/figure-run.js:1382`: `if (rec.sidecar && !isStale(rec.sidecar) && !args.force)`), so any
test that does not stub `readSidecar`/`sidecarExists` is, by construction, reading the real
`books/efnafraedi-2e/figure-text/*.is.json` sidecars committed in the repo and comparing their
`composedVersion` to `COMPOSER_VERSION`. The file also defines a `PRISTINE` helper
(`{ readSidecar: () => null, sidecarExists: () => false }`, line 145) that OTHER tests spread in
explicitly to opt OUT of the real filesystem — none of the 9 moved tests spread `...PRISTINE`.

`COMPOSER_VERSION` reaches this dry-run-only file in exactly one place in `tools/figure-run.js`:
the staleness check (`isStale`, lines 274/276, reached only through a real
`sidecar.composedVersion`). The live-mint write path (lines 1098-1099,
`computeRenderHash(blocks, COMPOSER_VERSION)` / `composerVersion: COMPOSER_VERSION`) is not
exercised here. Since Step 1 touched nothing but the constant and its docblock, the only way any
test in this file could move at all is through `isStale` reading a committed sidecar's
`composedVersion`. So the movement itself — exactly 9 names, all and only in this file — is a
positive control for the structural claim above, not merely the absence of a `PRISTINE`
override.

### NEWLY RED

1. **"skips exactly the figures that really do have a current sidecar — no more, no fewer"**
   (line 612, describe "a figure whose sidecar is current is skipped before anything is spent"):
   ```js
   // line 616
   const result = await runFigures(CH04, { spawn: fakeSpawn() });
   const onDisk = result.figures.filter((f) =>
     fs.existsSync(
       path.join(REPO_ROOT, 'books', 'efnafraedi-2e', 'figure-text', `${f.basename}.is.json`)
     )
   );
   expect(result.tally['skipped-current'] || 0).toBe(onDisk.length);
   ```
   No `readSidecar`/`sidecarExists` override → default real-fs path. The test's own comment
   (lines 613-615) says explicitly: *"REAL filesystem here ON PURPOSE — this arm is the one
   measuring what has actually been bought."* It directly stats the committed sidecar files on
   disk and compares their count against `skipped-current`, which `isStale`/`composedVersion`
   gates. Reads committed sidecars: **yes**.

2. **"names an unresolved figure instead of failing the run over it (R9)"** (line 669, describe
   "the pre-flight refusals that a dry run exists to surface"):
   ```js
   // line 676
   const result = await runFigures(CH04, { spawn });
   ```
   No `readSidecar`/`sidecarExists` override → default real-fs path (same mechanism as above).
   Reads committed sidecars: **yes** (via the default dependency, not a direct reference in the
   test body).

### NEWLY GREEN

3. **"prints a warning verbatim, naming the figure that produced it"** (line 1142, describe
   "prepare warnings reach the operator"):
   ```js
   // line 1147
   const text = summarise(await runFigures(CH04, { spawn }));
   ```
   No override (contrast with the third test in the same describe, line 1169, which explicitly
   spreads `...PRISTINE`). Reads committed sidecars: **yes**.

4. **"resolves a hashed figure through its stripped name, in a SECOND resolver pass"** (line 425,
   describe "the de-hash is LOOKUP-ONLY…"):
   ```js
   // line 427
   const result = await runFigures(CH03, { spawn });
   ```
   No override. Reads committed sidecars: **yes**.

5. **"prepares every figure under its own unstripped basename, in its own directory"** (line 449,
   same describe):
   ```js
   // line 451
   const result = await runFigures(CH03, { spawn });
   ```
   No override. Reads committed sidecars: **yes**.

6. **"still reports a hashed figure unresolved when neither name has artwork"** (line 467, same
   describe):
   ```js
   // line 469
   const result = await runFigures(CH03, { spawn });
   ```
   No override. Reads committed sidecars: **yes**.

7. **"de-hashes ch03 exactly as before — the guard refuses the contest, not the fallback"** (line
   978, describe "the de-hash refuses a CONTESTED stem rather than guessing which figure owns
   it"):
   ```js
   // line 980
   const result = await runFigures(
     { book: 'efnafraedi-2e', chapter: '3', modules: null, figures: null, dryRun: true },
     { spawn }
   );
   ```
   No override. Reads committed sidecars: **yes**.

8. **"REFUSES a figure whose meta.json names a different figure"** (line 646, describe "the
   pre-flight refusals that a dry run exists to surface"):
   ```js
   // line 650
   const result = await runFigures(CH04, { spawn });
   ```
   No override. Reads committed sidecars: **yes**.

9. **"files a prepare that exited non-zero as failed-prepare, not as text-less"** (line 632, same
   describe):
   ```js
   // line 636
   const result = await runFigures(CH04, { spawn });
   ```
   No override. Reads committed sidecars: **yes**.

All 9 moved tests are in `tools/__tests__/figure-run-free.test.js`; all 9 read committed
sidecars' `composedVersion` through the default (unstubbed) `readSidecar`/`sidecarExists` path.
No BLOCKED condition triggered.

## Step 3: commit

```
git add tools/lib/figure-text-sidecar.cjs
git commit -m "feat(figures): COMPOSER_VERSION 3 — every committed figure recomposes ..."
```

Commit SHA: **`d453e8bfbfa531b1a264df395a4271e739bb6191`** (short: `d453e8bf`).
`git status --porcelain` after commit: empty.

Verified verbatim via `git log -1 --format=%B` (not just `%s`): body and both trailers
(`Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>` and the
`Claude-Session:` line) landed exactly as specified in the brief.

## Consumer note (not exercised by this task)

The brief's Interfaces line names `server/services/figureReviewService.js` as a consumer of
`COMPOSER_VERSION` ("A server change — … merge → `deploy.sh` → verify the figures route"). This
delta gives a control on that: zero `server/__tests__` names appear in either the NEWLY RED or
NEWLY GREEN lists, so the server side is untested-by-this-movement, not verified-unaffected —
it needs the deploy-and-verify step the brief names, not a vitest assertion.

## Summary

All expectations MATCH. No deviation, no BLOCKED, no NEEDS_CONTEXT.
