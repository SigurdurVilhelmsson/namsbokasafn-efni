# Task 12 — mutation pass report (`feat/c140-c40-retire-and-alias`)

Repo `<repo>` · branch `feat/c140-c40-retire-and-alias` · HEAD `c2a4d5f74` (checked before the first mutation) ·
working tree clean at the start (`git status --porcelain` empty). No commits, no test added, no git state touched. Everything
the harness wrote is under `<scratch>/c40-mut/`.

**Mutation script:** `<scratch>/c40-mut/run.py` (runner) with the mutant definitions in `<scratch>/c40-mut/mutants.py`.
Per-mutant logs: `<scratch>/c40-mut/logs/<id>.log`; machine-readable results: `<scratch>/c40-mut/results.jsonl`;
the exact mutated line(s) of every mutant: `<scratch>/c40-mut/premutants/<id>.diff`.

## 1. Result in one screen

| group | mutants | KILLED | SURVIVED: real gap | SURVIVED: equivalent | TIMEOUT | ANCHOR/BROKEN |
|---|---|---|---|---|---|---|
| mandatory (`M-*`, from the plan) | 45 | 42 | 1 | 2 | 0 | 0 |
| candidates #1–#29 (from the vacuity review) | 29 | 1 | 26 | 2 | 0 | 0 |
| executor extras (`X-*`, my own) | 55 | 49 | 4 | 2 | 0 | 0 |
| **total** | 129 | 92 | 31 | 6 | 0 | 0 |

* **Every one of the 29 candidates was re-measured on the real tree.** All survived exactly as the reviewer recorded, except #11,
  the control, which was KILLED (so the harness can fail).
* **Mandatory guards:** 42 of 45 killed, each by the test that targets it (names in §3). The three survivors: `M-S6b` is a real gap,
  `M-S6c` and `M-R6a` are equivalent.
* **Each real gap is proven killable.** For every survivor I fed one hand-built input to the golden code and to the mutant and
  recorded both outcomes (§6). A survivor is a gap only if some input separates the two; I did not take that on argument.
* **Equivalent survivors (6):** `M-S6c`, `M-R6a`, #12, #20, `X-F7`, `X-F8`. I agree with the
  review that #12 is equivalent (argument in its row), and #20 is the same mutant by another route.
* Byte-identical mutant files (the same `sha256`): #2≡#27, #4≡#28, #5≡#29. #7 and #26 differ textually and are semantically identical.

### The real-gap survivors, grouped (the fix wave's work list; fixtures are in each row of §3–§5 and in §7)

* `exp/ftt/test_sources.py` (resolver): `M-S6b`, #1, #2/#27, #3, #4/#28, #5/#29, #6, #7/#26, #8, #25, `X-S10`
* `retire-translated-figure.test.js` (rollback): #9, #10, #19, `X-A3b`
* `retire-translated-figure.test.js` (CLI default and matching): #15, #16, #21, #22
* `retire-translated-figure.test.js` (report and mapping bytes): #17, #18
* `translated-figure-refs.test.js` (corpus predicate and mapping reader): #13, #14, #23, #24, `X-F9`
* `figure-config-validate.test.js`: `X-V14`

## 2. Method, and what I did beyond the brief

**Harness.** For every mutant `run.py` (1) refuses to start unless `cmp` shows each golden equals the tree; (2) derives the mutant
**from the golden bytes** (binary read; each anchor `.encode('utf-8')` and asserted to occur EXACTLY ONCE; non-overlapping edits);
(3) syntax-checks the result (`node --check` on an `.mjs` copy, `compile()` for Python), so a mutant that does not parse is BROKEN, never KILLED
(0 occurred); (4) writes it with `write_bytes`; (5) runs the brief's focused command under the brief's `timeout`, with a 90 s harness
backstop that kills the whole process group; (6) restores in a `finally` with `cp -p golden file` and **`cmp golden file` after every
mutant**, aborting the whole run on any mismatch (none occurred); (7) logs to `logs/<id>.log` and `results.jsonl`.
SIGTERM/SIGINT/SIGHUP handlers restore from the goldens. Mutants ran strictly one at a time. The baselines and the 121-mutant main run went in the background, so the
brief's `timeout 600`/`timeout 900` applied unchanged (no foreground cap); the eight follow-up extras (`X-S10`..`X-F9`) ran in the foreground under an outer `timeout 550` around the whole batch, each mutant still under its own focused-command timeout (all eight finished in about 20 s). Test commands are exactly the brief's table.
Classification: Python KILLED when the exit code is non-zero or the last line is not `ALL PASS`; vitest KILLED on a non-zero exit;
`rc 124` or the backstop would be TIMEOUT (none occurred). Run order: `M-S1a M-S1b M-S2a M-S2b M-S3 M-S4 M-S5 M-S6a M-S6b M-S6c M-V1 M-V2 M-V3 M-V4 M-V5 M-V6 M-V7 M-V8 M-V9 M-V10 M-V11 M-V12 M-V13 M-V14 M-V15 M-R1 M-R2 M-R3 M-R4 M-R5 M-R6 M-R7 M-R6a M-R6b M-R6c M-A1 M-A2 M-A3 M-P1 M-P2 M-P3 M-P4 M-P5 M-P1b M-P5b M-R1p M-R2p C1 C2 C3 C4 C5 C6 C7 C8 C9 C10 C11 C12 C13 C14 C15 C16 C17 C18 C19 C20 C21 C22 C23 C24 C25 C26 C27 C28 C29 X-A3b X-A4 X-D1 X-D2 X-G1 X-G2 X-F1 X-F2 X-H1 X-S1 X-S2 X-S3 X-S5 X-S6 X-S7 X-S8 X-S9 X-V1 X-V2 X-V3 X-V4 X-V5 X-V6 X-V7 X-V8 X-V9 X-V10 X-V11 X-V12 X-V13 X-V14 X-V15 X-V16 X-G3 X-G4 X-G5 X-G6 X-C1 X-C2 X-C3 X-C4 X-F3 X-F4 X-F5 X-F6 X-S10 X-S11 X-S12 X-S13 X-S14 X-F7 X-F8 X-F9`.

**Baselines first** (clean tree, after `cmp` of every golden); all green, and `git status --porcelain` was still empty afterwards:

| focused command | result on the CLEAN tree | tests | time |
|---|---|---|---|
| `cd experiments/figure-text-translation && FIGTEXT_PYLIBS=./pylibs timeout 600 python3 -u test_sources.py` | green (rc 0) | ALL PASS | 0.7 s |
| `timeout 600 npx vitest run tools/__tests__/figure-config-validate.test.js` | green (rc 0) | 59 passed (59) | 1.3 s |
| `timeout 900 npx vitest run tools/__tests__/retire-translated-figure.test.js` | green (rc 0) | 66 passed (66) | 3.4 s |
| `timeout 900 npx vitest run tools/__tests__/translated-figure-refs.test.js tools/__tests__/retire-translated-figure.test.js` | green (rc 0) | 86 passed (86) | 4.1 s |
| `timeout 600 npx vitest run tools/__tests__/figure-text-config.test.js tools/__tests__/figure-config-validate.test.js` | green (rc 0) | 73 passed (73) | 1.6 s |
| `timeout 600 npx vitest run tools/__tests__/generate-image-mapping.test.js tools/__tests__/generate-image-mapping-retired.test.js` | green (rc 0) | 20 passed (20) | 1.2 s |

The suites ran in 1–6 s each, not "a minute or more", so the 121-mutant main run took 6 minutes (01:47:43 to 01:53:42) and the eight follow-up extras about 20 seconds.

**Additions to the brief's commands (disclosed):**
* `cp -p` (not plain `cp`) for the golden copies and every restore, so the tree file keeps the golden's mtime and a same-size mutant can never
  be mistaken for the original.
* Environment for the test processes: `TMPDIR` pointed at `<scratch>/c40-mut/tmp` (the fixture repos land there, not in `/tmp`; wiped before every run),
  `NO_COLOR=1`; for Python also `PYTHONDONTWRITEBYTECODE=1` and `PYTHONPYCACHEPREFIX` pointing at a scratch directory wiped before every run, so no `.pyc` is
  written in the repo and a same-size mutant cannot hit a stale `.pyc`.
* Anchors were extended with surrounding lines where the text repeats (`restoreFromHead(repoRoot, deleted, git);` ×2, `return { refusals: [err.message] };` ×2,
  the `no book directory at` return ×2, `if (plan.refusals.length) {` ×2, `if (!args.apply) {` ×2, `_pin_refusal('pin-conflict',` ×3, `**policy(cfg)` ×2, `problems.push(` / `refusals.push(` many times).
* An offline `validate` pass built and syntax-checked every mutant before any test ran. It caught two ambiguous anchors in my OWN extras (`X-V12`, `X-V13`:
  `owners.length !== 1` also occurs in `buildValidatorCorpus`); I extended them before the run. I also dropped one extra that duplicated `M-S6a`.
  No mandatory or candidate mutant had an ambiguous anchor, so the run shows 0 ANCHOR.

**Interpretations I had to make (the brief's wording is loose in four places):**
* `M-S2` ("an ambiguous fold counts as a match / as no match"): `_files_under` ALREADY counts an ambiguous fold as a match, so there is no second direction to mutate there.
  `M-S2a` = the single-stem filter added to `_files_under` (ambiguous fold counts as NO match). `M-S2b` = the single-stem condition dropped from the normal lookup in `resolve_detail`
  (an ambiguous fold counts as a MATCH and the first file is returned).
* `M-S6` ("an alias resolving despite an exact match"): three variants. `M-S6a` coarse (the whole alias scan off). `M-S6b` fine (files whose stem equals the basename dropped from the conflict set).
  `M-S6c` the exact `rglob` pass removed from `_files_under`.
* `M-S1a`/`M-S1b` are block moves (retired block after the superseded block; retired block after the pin block): exact text in Appendix A.
* "each refusal in `planRetire`: drop the `refusals.push`": five of the seven refusals are pushes (`M-R3`..`M-R7`, push replaced by `void (`; the `continue` and `bad = true` are kept).
  The other two are early returns, mutated by disabling the condition (`M-R1`) or by reading the unreadable mapping as `[]` (`M-R2`). Their `planPrune` twins are `M-R1p`/`M-R2p`.
  The compound bad-row condition also got one mutant per sub-condition (`M-R6a`..`M-R6c`; the fourth is candidate #20).
* "each rule" of `figure-config-validate.js`: one mutant per `problems.push` (15 rules, `M-V1`..`M-V15`: `problems.push(` replaced by `void (`, every `continue` kept).

## 3. Mandatory mutants

| # | file | anchor → replacement | result |
|---|---|---|---|
| M-S1a | `exp/ftt/sources.py` | block edit, exact text in Appendix A (`M-S1a`) | KILLED — `FAIL ㊵ retired is checked BEFORE superseded` |
| M-S1b | `exp/ftt/sources.py` | block edit, exact text in Appendix A (`M-S1b`) | KILLED — `FAIL ㊵ retired is checked BEFORE superseded`; crash: KeyError: 'refused' at test_sources.py:502 in check '㊵ a pin cannot bring back a RETIRED figure' |
| M-S2a | `exp/ftt/sources.py` | <code>        for p in _norm_index(root, exts, memo).get(_normkey(basename), []):⏎            found[str(p)] = p</code> → <code>        _fold = _norm_index(root, exts, memo).get(_normkey(basename), [])⏎        for p in (_fold if len({c.stem for c in _fold}) == 1 else []):⏎            found[str(p)] = p</code> | KILLED — crash: KeyError: 'refused' at test_sources.py:445 in check '㊵ an AMBIGUOUS fold is a conflict too, though the normal lookup returns None for it' |
| M-S2b | `exp/ftt/sources.py` | <code>            if cands and len({c.stem for c in cands}) == 1:</code> → <code>            if cands:</code> | KILLED — `FAIL REFUSES an ambiguous normalised match`; `FAIL ㊵ CONTROL` |
| M-S3 | `exp/ftt/sources.py` | <code>    if twins:⏎</code> → <code>    if False:⏎</code> | KILLED — crash: KeyError: 'refused' at test_sources.py:487 in check '㊵ two pins naming one file are BOTH refused as pin-conflict' |
| M-S4 | `exp/ftt/sources.py` | <code>        if len(pinned) &gt; 1:</code> → <code>        if False:</code> | KILLED — `FAIL ㊵ two pin keys folding onto one basename are refused as pin-confl…`; `FAIL ㊵ that refusal names BOTH keys, and picks no file` |
| M-S5 | `exp/ftt/sources.py` | block edit, exact text in Appendix A (`M-S5`) | KILLED — crash: KeyError: 'refused' at test_sources.py:465 in check '㊵ a missing pinned file is refused as pin-missing, never a fall-back' |
| M-S6a | `exp/ftt/sources.py` | <code>    if entry['kind'] == 'alias':</code> → <code>    if False:</code> | KILLED — crash: KeyError: 'refused' at test_sources.py:438 in check '㊵ an alias is refused as pin-conflict once a file folds onto its basename, naming it' |
| M-S6b | `exp/ftt/sources.py` | <code>        found = _files_under(basename, trees, precedence, exts, memo)⏎        if found:</code> → <code>        found = [p for p in _files_under(basename, trees, precedence, exts, memo)⏎                 if p.stem != basename]⏎        if found:</code> | **SURVIVED** — real gap: no test aliases a basename that has an EXACT-name file (every alias-conflict fixture is a fold: CNX_ice2, Cnx_Amb). Test: tree holds `CNX_Exact.eps`, alias pin for `CNX_Exact` -> expect `pin-conflict` naming that file. Evidence: golden refuses, mutant resolves via the alias. |
| M-S6c | `exp/ftt/sources.py` | <code>        for ext in exts:⏎            for p in root.rglob(basename + ext):⏎                if not _OWN_OUTPUT_DIRS.intersection(p.parts):⏎                    found[str(p)] = p⏎</code> → <code>        pass⏎</code> | **SURVIVED** — equivalent: the fold pass indexes every regular file with a source suffix under the same exclusions and keys it by `_normkey(stem)`, so an exact-name file is always found there too (evidence: SAME for an exact-name file and for an upper-case suffix). It differs only for a DIRECTORY or dangling symlink literally named `<basename><ext>`; `find` over both real artwork trees: 0 such directories, 0 broken symlinks. |
| M-V1 | `tools/lib/figure-config-validate.js` | <code>problems.push(`${name} must be an object`)</code> → <code>void (`${name} must be an object`)</code> | KILLED — `refuses a table that is not an object`; `refuses a retiredFigures table that is null` (+2 more) |
| M-V2 | `tools/lib/figure-config-validate.js` | <code>problems.push(`${name}: ${seen.get(f)} and ${k} fold to the same key`)</code> → <code>void (`${name}: ${seen.get(f)} and ${k} fold to the same key`)</code> | KILLED — `refuses two keys in one table that fold together`; `refuses two retiredFigures keys that fold together` (+1 more) |
| M-V3 | `tools/lib/figure-config-validate.js` | <code>problems.push(⏎          `artworkPins.${k} is also in ${other}</code> → <code>void (⏎          `artworkPins.${k} is also in ${other}</code> | KILLED — `refuses a pin on a superseded figure`; `refuses a pin on a retired figure` (+2 more) |
| M-V4 | `tools/lib/figure-config-validate.js` | <code>problems.push(⏎          `${name}.${k} names an image in</code> → <code>void (⏎          `${name}.${k} names an image in</code> | KILLED — `refuses a key that is no book’s image`; `refuses a key that differs from the image only by case` (+4 more) |
| M-V5 | `tools/lib/figure-config-validate.js` | <code>problems.push(`${name}.${k} needs a reason of over ${MIN_REASON} characters`)</code> → <code>void (`${name}.${k} needs a reason of over ${MIN_REASON} characters`)</code> | KILLED — `refuses a short reason`; `refuses a pin without a reason` (+3 more) |
| M-V6 | `tools/lib/figure-config-validate.js` | <code>problems.push(`artworkPins.${k} must be an object`)</code> → <code>void (`artworkPins.${k} must be an object`)</code> | KILLED — `refuses a pin that is not an object` |
| M-V7 | `tools/lib/figure-config-validate.js` | <code>problems.push(⏎        `artworkPins.${k}.kind must be alias or override</code> → <code>void (⏎        `artworkPins.${k}.kind must be alias or override</code> | KILLED — `refuses an unknown pin kind` |
| M-V8 | `tools/lib/figure-config-validate.js` | <code>problems.push(⏎        `artworkPins.${k}.edition </code> → <code>void (⏎        `artworkPins.${k}.edition </code> | KILLED — `refuses a pin edition not in editionPrecedence` |
| M-V9 | `tools/lib/figure-config-validate.js` | <code>problems.push(`artworkPins.${k}.file must be a non-empty string`)</code> → <code>void (`artworkPins.${k}.file must be a non-empty string`)</code> | KILLED — `refuses a pin with no file`; `refuses a pin with an empty file` (+1 more) |
| M-V10 | `tools/lib/figure-config-validate.js` | <code>problems.push(⏎        `artworkPins.${k}.file ${JSON.stringify(file)} must be a relative path</code> → <code>void (⏎        `artworkPins.${k}.file ${JSON.stringify(file)} must be a relative path</code> | KILLED — `refuses a pin path with a .. segment`; `refuses an absolute pin path` (+3 more) |
| M-V11 | `tools/lib/figure-config-validate.js` | <code>problems.push(⏎        `artworkPins.${k}.file ${JSON.stringify(file)} is one of our own translated files</code> → <code>void (⏎        `artworkPins.${k}.file ${JSON.stringify(file)} is one of our own translated files</code> | KILLED — `refuses a pin to our own translated file`; `refuses a pin to our own translated file, in the suffix’s other case` |
| M-V12 | `tools/lib/figure-config-validate.js` | <code>problems.push(⏎        `artworkPins.${k}.file ${JSON.stringify(file)} is the artwork of another figure</code> → <code>void (⏎        `artworkPins.${k}.file ${JSON.stringify(file)} is the artwork of another figure</code> | KILLED — `refuses a pin to another figure’s artwork`; `refuses a pin whose file only FOLDS onto another figure’s basename` (+1 more) |
| M-V13 | `tools/lib/figure-config-validate.js` | <code>problems.push(⏎        `artworkPins.${k} and artworkPins.${targets.get(target)} name the same file</code> → <code>void (⏎        `artworkPins.${k} and artworkPins.${targets.get(target)} name the same file</code> | KILLED — `refuses two pins naming one file`; `refuses two pins naming one file by an unnormalised path` |
| M-V14 | `tools/lib/figure-config-validate.js` | <code>problems.push(⏎        `retiredFigures.${k} still has ${s.rows} image-mapping row(s)</code> → <code>void (⏎        `retiredFigures.${k} still has ${s.rows} image-mapping row(s)</code> | KILLED — `refuses a retired figure that still has its row`; `feeds the validator, which names exactly the half-retired and the unre…` |
| M-V15 | `tools/lib/figure-config-validate.js` | <code>problems.push(`retiredFigures.${k} still has a translated copy: media/${f}`)</code> → <code>void (`retiredFigures.${k} still has a translated copy: media/${f}`)</code> | KILLED — `refuses a retired figure that still has its translated copy`; `feeds the validator, which names exactly the half-retired and the unre…` |
| M-R1 | `tools/retire-translated-figure.js` | <code>  if (!fs.existsSync(bookDir)) return { refusals: [`no book directory at ${bookDir}`] };⏎  const mappingPath</code> → <code>  if (false) return { refusals: [`no book directory at ${bookDir}`] };⏎  const mappingPath</code> | KILLED — `refuses a book that does not exist, rather than reading its missing pa…` |
| M-R2 | `tools/retire-translated-figure.js` | <code>    return { refusals: [err.message] };⏎  }⏎  const sourceBasenames</code> → <code>    rows = [];⏎  }⏎  const sourceBasenames</code> | KILLED — `refuses an unreadable mapping and leaves it as it is` |
| M-R3 | `tools/retire-translated-figure.js` | <code>refusals.push(⏎        `${name}: no retiredFigures entry</code> → <code>void (⏎        `${name}: no retiredFigures entry</code> | KILLED — `refuses a figure with no retiredFigures entry, and writes nothing`; `reads the retired set from the figure config when none is given (empty…` (+1 more) |
| M-R4 | `tools/retire-translated-figure.js` | <code>refusals.push(`${name}: no image of that name</code> → <code>void (`${name}: no image of that name</code> | KILLED — `refuses a name this book does not use (wrong --book), rather than repo…` |
| M-R5 | `tools/retire-translated-figure.js` | <code>refusals.push(⏎        `${name}: has a sidecar</code> → <code>void (⏎        `${name}: has a sidecar</code> | KILLED — `refuses a figure with a sidecar` |
| M-R6 | `tools/retire-translated-figure.js` | <code>refusals.push(⏎          `${name}: its mapping row names</code> → <code>void (⏎          `${name}: its mapping row names</code> | KILLED — `refuses a row whose outputName would reach outside media/`; `refuses a mapping row naming another figure's copy, and deletes nothing` (+2 more) |
| M-R7 | `tools/retire-translated-figure.js` | <code>refusals.push(⏎        `${rel}: not tracked by git, or modified</code> → <code>void (⏎        `${rel}: not tracked by git, or modified</code> | KILLED — `refuses to delete a modified translated copy — git is the backup`; `refuses to delete a untracked translated copy — git is the backup` (+1 more) |
| M-R6a | `tools/retire-translated-figure.js` | <code>        typeof out !== 'string' &#124;&#124;⏎</code> → <code>        false &#124;&#124;⏎</code> | **SURVIVED** — equivalent: for a non-string `outputName`, `ext` is `''`, so the next clause (`ext === ''`) refuses it anyway; the guard is redundant. Evidence: 168-case brute force over adversarial outputNames and names, 0 differences. |
| M-R6b | `tools/retire-translated-figure.js` | <code>        ext === '' &#124;&#124;⏎</code> → <code>        false &#124;&#124;⏎</code> | KILLED — `refuses a mapping row naming no extension, and deletes nothing` |
| M-R6c | `tools/retire-translated-figure.js` | <code>        out !== `${name}${suffix}${ext}` &#124;&#124;⏎</code> → <code>        false &#124;&#124;⏎</code> | KILLED — `refuses a mapping row naming another figure's copy, and deletes nothing` |
| M-A1 | `tools/retire-translated-figure.js` | <code>      if (mappingWritten &amp;&amp; before !== null) writeAtomically(plan.mappingPath, before);</code> → <code>      void 0;</code> | KILLED — `a failure part-way restores the mapping and every file already deleted`; `a failure at the very first deletion still restores the mapping, with …` (+1 more) |
| M-A2 | `tools/retire-translated-figure.js` | <code>      restoreFromHead(repoRoot, deleted, git);⏎    } catch (e) {⏎      problems.push(e.message);</code> → <code>      void 0;⏎    } catch (e) {⏎      problems.push(e.message);</code> | KILLED — `a failure part-way restores the mapping and every file already deleted`; `says so, and where the files are, when the restore itself fails` (+1 more) |
| M-A3 | `tools/retire-translated-figure.js` | <code>    } catch (e) {⏎      problems.push(e.message);⏎    }⏎    try {⏎      restoreFromHead(repoRoot, deleted, git);</code> → <code>    } catch (e) {⏎      return { ok: false, done, error: err.message, restoreError: e.message };⏎    }⏎    try {⏎      restoreFromHead(repoRoot, deleted, git);</code> | KILLED — `still restores the deleted files when restoring the mapping fails too` |
| M-P1 | `tools/retire-translated-figure.js` | <code>    if (mapped.has(name)) {</code> → <code>    if (false) {</code> | KILLED — `prints the plan counts, lists no keep line for a mapped copy, and says…`; `keeps a mapped copy that nothing references: its mapping row alone kee…` (+3 more) |
| M-P2 | `tools/retire-translated-figure.js` | <code>    } else if (by.length) {</code> → <code>    } else if (false) {</code> | KILLED — `keeps a copy still referenced from a page in the OTHER track`; `keeps a copy still referenced from a CNXML file only` (+2 more) |
| M-P3 | `tools/retire-translated-figure.js` | <code>    } else if (!PLAIN_NAME.test(name)) {</code> → <code>    } else if (false) {</code> | KILLED — `keeps a copy whose name could be URL-encoded where a page references it`; `keeps a copy whose name has a space, for that reason` (+2 more) |
| M-P4 | `tools/retire-translated-figure.js` | <code>    } else if (!clean.has(rel)) {</code> → <code>    } else if (false) {</code> | KILLED — `keeps an untracked copy — git could not restore it`; `keeps a MODIFIED copy — an edit git cannot restore is not deleted` (+1 more) |
| M-P5 | `tools/retire-translated-figure.js` | <code>      allowMissing: copies.length === 0,</code> → <code>      allowMissing: true,</code> | KILLED — `refuses a missing mapping when media/ exists — absent is not "no row n…`; `refuses a book with a published copy but no media/ folder, rather than…` |
| M-R1p | `tools/retire-translated-figure.js` | <code>  if (!fs.existsSync(bookDir)) return { refusals: [`no book directory at ${bookDir}`] };⏎  const bookRel</code> → <code>  if (false) return { refusals: [`no book directory at ${bookDir}`] };⏎  const bookRel</code> | KILLED — `refuses a book that does not exist, rather than reading its missing pa…` |
| M-R2p | `tools/retire-translated-figure.js` | <code>    return { refusals: [err.message] };⏎  }⏎  const mapped = new Set(</code> → <code>    rows = [];⏎  }⏎  const mapped = new Set(</code> | KILLED — `refuses an unreadable mapping and deletes nothing`; `refuses a missing mapping when media/ exists — absent is not "no row n…` (+1 more) |

## 4. Candidates from the test-vacuity review (numbers as in the brief)

| # | file | anchor → replacement | result |
|---|---|---|---|
| #1 | `exp/ftt/sources.py` | <code>    if not path.is_file():</code> → <code>    if not path.exists():</code> | **SURVIVED** — real gap: D4's 'existing regular file' rule has no test. Test: a pin whose `file` is a DIRECTORY (`OSX/Dir.eps/`) -> `pin-missing`. Evidence: golden `pin-missing`; mutant resolves it as a hit with `pageUnknown`. |
| #2 | `exp/ftt/sources.py` | <code>_normkey(basename) and isinstance(e, dict)</code> → <code>_normkey(basename)</code> | **SURVIVED** — real gap: D5 per-figure containment is untested. Test: `pins={'CNX_ICE': valid, 'CNX_Stray': 'oops'}` -> CNX_ICE must still resolve. Evidence: mutant raises `AttributeError`. (Byte-identical to #27.) |
| #3 | `exp/ftt/sources.py` | <code> and isinstance(e.get('file'), str)</code> → <code>(deleted)</code> | **SURVIVED** — real gap: same class with a sibling pin whose `file` is `5`: mutant raises `TypeError` while resolving the OTHER figure. |
| #4 | `exp/ftt/sources.py` | <code>    lines, missing, refused = human_report(argv[1:], trees, precedence, **policy(cfg))</code> → <code>    lines, missing, refused = human_report(argv[1:], trees, precedence, **dict(policy(cfg), pins=None))</code> | **SURVIVED** — real gap: `run_cli` human mode is never exercised with a pin. Test: `run_cli(['testbook','CNX_ICE'], cfg_with_artworkPins)` -> exit 0 and a `(pinned: alias)` line. Evidence: mutant prints `NOT FOUND`, exit 1. The `--json` path IS covered (X-S12 killed). (Byte-identical to #28.) |
| #5 | `exp/ftt/sources.py` | <code>not value.strip()</code> → <code>not value</code> | **SURVIVED** — real gap (low value): a whitespace-only `reason` must be `pin-invalid`; the mutant resolves it. The JS validator's >40-character rule still gates it in `npm test`. (Byte-identical to #29.) |
| #6 | `exp/ftt/sources.py` | <code>size_of=size_of, retired=retired, pins=pins)</code> → <code>size_of=size_of, retired=retired)</code> | **SURVIVED** — real gap (low value): `resolve()`, the public wrapper, must forward `pins=`. No CLI path (`run_cli` uses `resolve_report`/`human_report`; `tools/figure-run.js` uses `--json`) and none of the 9 in-repo callers passes `pins=` today, so the brief's CLI/config-only test would call it equivalent; I count it a gap because a direct `resolve(..., pins=P)` differs (evidence DIFFER) and any caller may start passing pins. Test: `resolve('CNX_ICE', trees, prec, pins=P)` returns the pinned path. `resolve_report`/`human_report` forwarding IS covered (X-S13/X-S14 killed). |
| #7 | `exp/ftt/sources.py` | <code>e.get('edition') == edition</code> → <code>True</code> | **SURVIVED** — real gap (fail-closed): the twin scan must not conflict two pins that share a relative path in DIFFERENT editions; the JS validator has this control (`the same file under ANOTHER edition`), the Python resolver does not. Evidence: golden resolves both, mutant refuses both as `pin-conflict`. (Semantically identical to #26.) |
| #8 | `exp/ftt/sources.py` | <code>                if not _OWN_OUTPUT_DIRS.intersection(p.parts):⏎                    found[str(p)] = p</code> → <code>                if True:⏎                    found[str(p)] = p</code> | **SURVIVED** — real gap (low value, fail-closed): an exact-name file under `Translated_IS` (our own output) must not block an alias. Evidence: golden resolves, mutant `pin-conflict`. No live instance (measured): 1,262 of the 1,263 own-output source-format files under the base tree end in `_IS` (the other is `CNX_Chem_01_06_TempScales_IS_new.pdf`); none of the 1,263 stems equals a chemistry image basename, so 0 of the 254 chemistry holes has an exact-name own-output file. |
| #9 | `tools/retire-translated-figure.js` | <code>      restoreFromHead(repoRoot, deleted, git);⏎    } catch (e) {⏎      problems.push(e.message);</code> → <code>      restoreFromHead(repoRoot, deleted.slice(0, 1), git);⏎    } catch (e) {⏎      problems.push(e.message);</code> | **SURVIVED** — real gap: no rollback test has 2+ files deleted before the fault. Test: three figures, `unlink` throws on the 3rd call, assert BOTH earlier copies are back. Evidence: mutant restores only one (the tree is not restored). |
| #10 | `tools/retire-translated-figure.js` | <code>      restoreFromHead(repoRoot, deleted, git);⏎    } catch (e) {⏎      problems.push(e.message);</code> → <code>      restoreFromHead(repoRoot, deleted.slice(-1), git);⏎    } catch (e) {⏎      problems.push(e.message);</code> | **SURVIVED** — real gap: same test as #9 (mutant restores only the last file). |
| #11 | `tools/retire-translated-figure.js` | <code>      restoreFromHead(repoRoot, deleted, git);⏎    } catch (e) {⏎      restoreError = e.message;</code> → <code>      restoreFromHead(repoRoot, deleted.slice(0, 1), git);⏎    } catch (e) {⏎      restoreError = e.message;</code> | KILLED — `a failure on the third deletion restores BOTH copies already deleted, …` |
| #12 | `tools/retire-translated-figure.js` | <code>        out !== `${name}${suffix}${ext}` &#124;&#124;⏎        escapesMediaDir(bookDir, out)⏎</code> → <code>        out !== `${name}${suffix}${ext}`⏎</code> | **SURVIVED** — EQUIVALENT, agreed: `out` must equal `name+suffix+ext`; `name` passed `sourceBasenames.has(name)`, and those basenames come from `split('/').pop()`, so `name` has no `/`; `path.extname` never contains `/`; so `out` is ONE path segment, which `path.resolve` keeps inside `media/` (`..` and `.` have no extension and are refused by `ext === ''`). Evidence: 168-case brute force (7 names x 24 adversarial outputNames incl. `../x`, absolute, nested, backslash, trailing slash, null, number), 0 differences. POSIX only: a backslash separates paths only on Windows. |
| #13 | `tools/lib/translated-figure-refs.js` | <code>    if (isTranslatedName(base, suffix)) continue;</code> → <code>    if (path.extname(base).toLowerCase() === '.svg') continue;</code> | **SURVIVED** — real gap (no live consequence today): a NON-translated `.svg` in the corpus that references `<name>_IS.` must count as a reference; the skip is only for translated copies. Evidence: golden finds `diagram.svg`, mutant misses it (a missed reference lets `--prune` delete a copy that is still referenced). Real corpus (measured with `git ls-files -co --exclude-standard`): 754 SVGs under chemistry's `03-translated` and `05-publication`, 0 of them other than `_IS` copies. |
| #14 | `tools/lib/translated-figure-refs.js` | <code>      const window = text.slice(Math.max(0, end - maxLen), end);</code> → <code>      const window = text.slice(end - maxLen, end);</code> | **SURVIVED** — real gap (no live consequence today): a reference that ends within `maxLen` characters of the start of a file, while a longer needle is in the set, must be found. Test: a file that BEGINS with the reference and is longer than the longest needle. Evidence: mutant misses it (a negative slice start counts from the end). Real corpus (measured): of the 574 chemistry files the scan reads, the earliest reference ends at character 860 (`13-0-introduction.html`); none ends within 70 characters of a file start. |
| #15 | `tools/retire-translated-figure.js` | <code>      retired: retired ?? loadRetiredFigures(),</code> → <code>      retired: retired ?? new Set(),</code> | **SURVIVED** — real gap, LATENT: indistinguishable while the committed `retiredFigures` is `{}` (evidence: SAME on the real config), but the table is meant to be filled. Test: bind the CLI default to the config with the `vi.mock('../lib/figure-text-config.js')` pattern from generate-image-mapping-retired.test.js and a populated set -> `--retire` accepts that name. Evidence with a populated config: golden retires, mutant refuses every figure. |
| #16 | `tools/retire-translated-figure.js` | <code>      retired: retired ?? loadRetiredFigures(),</code> → <code>      retired: retired ?? new Set(Object.keys(JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'experiments/figure-text-translation/figure-text.config.json'), 'utf-8')).supersededArtwork)),</code> | **SURVIVED** — real gap: same test must also assert a superseded-but-not-retired figure is REFUSED by the CLI default. Evidence: differs on TODAY's config: golden exit 1; mutant exit 0, copy deleted, mapping `[]`. |
| #17 | `tools/retire-translated-figure.js` | <code>    if (by.length === 0) {</code> → <code>    if (by.length &lt;= 1) {</code> | **SURVIVED** — real gap: the zero-reference branch never runs and the singular case is untested (every fixture has 2 references). Test: exactly ONE referencing file -> `still referenced by 1 file(s)`; zero -> `no page or CNXML file references it`. Evidence: DIFFER on one reference, SAME on zero. |
| #18 | `tools/retire-translated-figure.js` | <code>    if (plan.removeNames.size &gt; 0) {</code> → <code>    if (true) {</code> | **SURVIVED** — real gap: all fixture mappings are already canonically serialised, so a needless rewrite is invisible. Tests: (a) a half-done retire (no row left) over a COMPACT mapping leaves its bytes untouched; (b) a book with no mapping file does not gain one. Evidence: DIFFER on both. |
| #19 | `tools/retire-translated-figure.js` | <code>if (mappingWritten &amp;&amp; before !== null) writeAtomically(plan.mappingPath, before);</code> → <code>if (mappingWritten &amp;&amp; before !== null) writeAtomically(plan.mappingPath, JSON.stringify(plan.rows, null, 2) + '\n');</code> | **SURVIVED** — real gap: the rollback must restore the saved BYTES. Test: non-canonical (compact) mapping, `unlink` throws on the first deletion, assert the file equals its original bytes. Evidence: mutant restores a re-serialisation. |
| #20 | `tools/retire-translated-figure.js` | <code>        escapesMediaDir(bookDir, out)⏎      ) {</code> → <code>        false⏎      ) {</code> | **SURVIVED** — EQUIVALENT, agreed: same argument and same 168-case brute force as #12 (the mutant replaces the call with `false`; byte-different from #12, behaviourally identical). |
| #21 | `tools/retire-translated-figure.js` | <code>    if (!retired.has(name)) {</code> → <code>    if (![...retired].some((k) =&gt; k.toLowerCase() === name.toLowerCase())) {</code> | **SURVIVED** — real gap (masked by the exact source-basename check): a mis-cased `retiredFigures` key must not authorise a retire. Test: `retired: new Set(['cnx_a'])`, `--retire CNX_A` -> refused. Evidence: golden exit 1; mutant exit 0 and the copy deleted. |
| #22 | `tools/retire-translated-figure.js` | <code>    if (!sourceBasenames.has(name)) {</code> → <code>    if (![...sourceBasenames].some((k) =&gt; k.toLowerCase() === name.toLowerCase())) {</code> | **SURVIVED** — real gap (masked by the exact retired check): a retired name whose only source image differs by case must be refused as `wrong --book?`. Evidence: golden refuses; mutant proceeds, exit 0, copy deleted. |
| #23 | `tools/lib/translated-figure-refs.js` | <code>parsed.some((r) =&gt; r === null &#124;&#124; typeof r !== 'object' &#124;&#124; Array.isArray(r))</code> → <code>parsed.some((r) =&gt; typeof r !== 'object' &#124;&#124; Array.isArray(r))</code> | **SURVIVED** — real gap: `[null]` must be refused as 'not an array of objects' (only `[1]` and `{}` are tested). Evidence: mutant returns `[null]`, which `planRetire` would then dereference. |
| #24 | `tools/lib/translated-figure-refs.js` | <code>parsed.some((r) =&gt; r === null &#124;&#124; typeof r !== 'object' &#124;&#124; Array.isArray(r))</code> → <code>parsed.some((r) =&gt; r === null &#124;&#124; typeof r !== 'object')</code> | **SURVIVED** — real gap: `[[]]` must be refused. Evidence: mutant accepts it as a legacy row. |
| #25 | `exp/ftt/sources.py` | <code>'\\' in file or </code> → <code>(deleted)</code> | **SURVIVED** — real gap (low value): a backslash in a pin's `file` must be `pin-invalid`. Evidence: golden `pin-invalid`; mutant `pin-missing` (both refuse on Linux). The drive-letter clause is the same class: X-S10 survived too. |
| #26 | `exp/ftt/sources.py` | <code>and e.get('edition') == edition and isinstance(e.get('file'), str)</code> → <code>and isinstance(e.get('file'), str)</code> | **SURVIVED** — real gap (fail-closed): same test as #7 (the mutant drops the edition clause). |
| #27 | `exp/ftt/sources.py` | <code>if _normkey(k) != _normkey(basename) and isinstance(e, dict)</code> → <code>if _normkey(k) != _normkey(basename)</code> | **SURVIVED** — real gap: byte-identical to #2. |
| #28 | `exp/ftt/sources.py` | <code>lines, missing, refused = human_report(argv[1:], trees, precedence, **policy(cfg))</code> → <code>lines, missing, refused = human_report(argv[1:], trees, precedence, **dict(policy(cfg), pins=None))</code> | **SURVIVED** — real gap: byte-identical to #4. |
| #29 | `exp/ftt/sources.py` | <code>if not isinstance(value, str) or not value.strip():</code> → <code>if not isinstance(value, str) or not value:</code> | **SURVIVED** — real gap (low value): byte-identical to #5. |

## 5. Executor extras (guards the brief did not name)

The two `M-*b` rows (`M-P1b`, `M-P5b`) are inverted variants of mandatory `planPrune` conditions and are counted as extras, not as mandatory. I added the rest where a guard looked untested, where a survivor needed a control (`X-S12`..`X-S14` show the `--json` path and the report forwarding ARE tested where #4 and #6 are not),
and for the two files the brief tabulates a focused run for but lists no mutant (`generate-image-mapping.js`, `figure-text-config.js`: `X-G3`..`X-G6`, `X-C1`..`X-C4`, all killed).

| # | file | anchor → replacement | result |
|---|---|---|---|
| M-P1b | `tools/retire-translated-figure.js` | <code>    if (mapped.has(name)) {</code> → <code>    if (!mapped.has(name)) {</code> | KILLED — `POSITIVE CONTROL: deletes the unreferenced, unmapped copy and keeps th…`; `a dry run deletes nothing` (+23 more) |
| M-P5b | `tools/retire-translated-figure.js` | <code>      allowMissing: copies.length === 0,</code> → <code>      allowMissing: copies.length !== 0,</code> | KILLED — `refuses a missing mapping when media/ exists — absent is not "no row n…`; `refuses a book with a published copy but no media/ folder, rather than…` (+2 more) |
| X-A3b | `tools/retire-translated-figure.js` | block edit, exact text in Appendix A (`X-A3b`) | **SURVIVED** — real gap: the code comment promises each undo is attempted on its own 'and the reverse'. That holds only because the mapping is restored FIRST; no test asserts the mapping bytes when the FILE restore fails. Test: in `says so, and where the files are, when the restore itself fails`, also assert the mapping equals its pre-run bytes. Evidence: mutant leaves the rewritten mapping. |
| X-A4 | `tools/retire-translated-figure.js` | <code>      restoreFromHead(repoRoot, deleted, git);⏎    } catch (e) {⏎      restoreError = e.message;</code> → <code>      void 0;⏎    } catch (e) {⏎      restoreError = e.message;</code> | KILLED — `a failure part-way restores every copy already deleted`; `says so, and where the files are, when the restore itself fails` (+1 more) |
| X-D1 | `tools/retire-translated-figure.js` | <code>  if (!args.apply) {⏎    out('\nDry run — nothing was written.</code> → <code>  if (false) {⏎    out('\nDry run — nothing was written.</code> | KILLED — `a dry run writes nothing, and reports the row, the copy and every refe…` |
| X-D2 | `tools/retire-translated-figure.js` | <code>  if (!args.apply) {⏎    out('\nDry run — nothing was deleted.</code> → <code>  if (false) {⏎    out('\nDry run — nothing was deleted.</code> | KILLED — `a dry run deletes nothing`; `prints the plan counts, lists no keep line for a mapped copy, and says…` |
| X-G1 | `tools/retire-translated-figure.js` | <code>  if (plan.refusals.length) {⏎    err('REFUSED — nothing was written:');</code> → <code>  if (false) {⏎    err('REFUSED — nothing was written:');</code> | KILLED — `refuses a figure with no retiredFigures entry, and writes nothing`; `reads the retired set from the figure config when none is given (empty…` (+12 more) |
| X-G2 | `tools/retire-translated-figure.js` | <code>  if (plan.refusals.length) {⏎    err('REFUSED — nothing was deleted:');</code> → <code>  if (false) {⏎    err('REFUSED — nothing was deleted:');</code> | KILLED — `refuses an unreadable mapping and deletes nothing`; `refuses a missing mapping when media/ exists — absent is not "no row n…` (+2 more) |
| X-F1 | `tools/retire-translated-figure.js` | <code>    if (!KNOWN_FLAGS.has(token)) {</code> → <code>    if (false) {</code> | KILLED — `refuses usage ["--book","b","--retire","CNX_A","--dryrun"] with exit 2…` |
| X-F2 | `tools/retire-translated-figure.js` | <code>  if (Boolean(args.retire) === args.prune)</code> → <code>  if (false)</code> | KILLED — `refuses usage ["--book","b","--retire","CNX_A","--prune"] with exit 2 …`; `refuses usage ["--book","b"] with exit 2 and writes nothing` |
| X-H1 | `tools/retire-translated-figure.js` | <code>    for (const f of topLevelTranslatedCopies(bookDir, name, suffix))⏎      if (!files.includes(f)) files.push(f);⏎</code> → <code>(deleted)</code> | KILLED — `refuses to delete a untracked translated copy — git is the backup`; `refuses to delete a ignored translated copy — git is the backup` (+1 more) |
| X-S1 | `exp/ftt/sources.py` | block edit, exact text in Appendix A (`X-S1`) | KILLED — crash: KeyError: 'refused' at test_sources.py:505 in check '㊵ a pin cannot bring back a SUPERSEDED figure' |
| X-S2 | `exp/ftt/sources.py` | <code>    _require_dir(edition, root, basename)⏎    path = root / file</code> → <code>    path = root / file</code> | KILLED — `FAIL ㊵ a pin into a configured tree that is not mounted raises, as the…` |
| X-S3 | `exp/ftt/sources.py` | <code>        root = Path(root).expanduser()⏎        _require_dir(key, root, basename)⏎        for ext in exts:</code> → <code>        root = Path(root).expanduser()⏎        for ext in exts:</code> | KILLED — `FAIL ㊵ an alias scans EVERY configured tree` |
| X-S5 | `exp/ftt/sources.py` | <code>    if paper:⏎        return {'path': None, 'refused': 'production-page', 'edition': edition,</code> → <code>    if False:⏎        return {'path': None, 'refused': 'production-page', 'edition': edition,</code> | KILLED — crash: KeyError: 'refused' at test_sources.py:495 in check '㊵ a pinned Letter page is refused as a production page, with its size' |
| X-S6 | `exp/ftt/sources.py` | <code>    if size is None:⏎        hit['pageUnknown'] = True⏎    return hit</code> → <code>    return hit</code> | KILLED — `FAIL ㊵ a pinned file whose size cannot be read resolves and is FLAGGED` |
| X-S7 | `exp/ftt/sources.py` | <code>    if _OWN_OUTPUT_DIRS.intersection(parts):⏎        return f'file {file!r} is inside our own translated output'⏎</code> → <code>(deleted)</code> | KILLED — `FAIL ㊵ a pin with our own output dir is refused as pin-invalid` |
| X-S8 | `exp/ftt/sources.py` | <code>⏎            or not parts or '..' in parts):</code> → <code>⏎            or not parts):</code> | KILLED — `FAIL ㊵ a pin with a .. segment is refused as pin-invalid` |
| X-S9 | `exp/ftt/sources.py` | <code>    if PurePosixPath(file).suffix.lower() not in exts:⏎        return f"file {file!r} is not one of the source formats {', '.join(exts)}"⏎</code> → <code>(deleted)</code> | KILLED — `FAIL ㊵ a pin with a format we cannot read is refused as pin-invalid` |
| X-V1 | `tools/lib/figure-config-validate.js` | <code>  if (problems.length) return problems;⏎</code> → <code>(deleted)</code> | KILLED — `refuses a retiredFigures table that is null`; `refuses a supersededArtwork table that is null` (+1 more) |
| X-V2 | `tools/lib/figure-config-validate.js` | <code>r.trim().length &lt;= MIN_REASON</code> → <code>r.trim().length &lt; MIN_REASON</code> | KILLED — `refuses a reason of exactly 40 characters` |
| X-V3 | `tools/lib/figure-config-validate.js` | <code>r.trim().length &lt;= MIN_REASON</code> → <code>r.length &lt;= MIN_REASON</code> | KILLED — `refuses a reason that is long only because of its spaces` |
| X-V4 | `tools/lib/figure-config-validate.js` | <code>      file.startsWith('/') &#124;&#124;⏎</code> → <code>      false &#124;&#124;⏎</code> | KILLED — `refuses an absolute pin path` |
| X-V5 | `tools/lib/figure-config-validate.js` | <code>      /^[A-Za-z]:/.test(file) &#124;&#124;⏎</code> → <code>      false &#124;&#124;⏎</code> | KILLED — `refuses a Windows drive path` |
| X-V6 | `tools/lib/figure-config-validate.js` | <code>      file.includes('\\') &#124;&#124;⏎</code> → <code>      false &#124;&#124;⏎</code> | KILLED — `refuses a pin path with a backslash` |
| X-V7 | `tools/lib/figure-config-validate.js` | <code>      file === '.' &#124;&#124;⏎</code> → <code>      false &#124;&#124;⏎</code> | KILLED — `refuses a pin path that is a bare dot` |
| X-V8 | `tools/lib/figure-config-validate.js` | <code>      file.split('/').includes('..')⏎</code> → <code>      false⏎</code> | KILLED — `refuses a pin path with a .. segment` |
| X-V9 | `tools/lib/figure-config-validate.js` | <code>stem.toLowerCase().endsWith(corpus.suffix.toLowerCase())</code> → <code>stem.endsWith(corpus.suffix)</code> | KILLED — `refuses a pin to our own translated file, in the suffix’s other case` |
| X-V10 | `tools/lib/figure-config-validate.js` | <code>`${pin.edition}:${path.posix.normalize(file)}`</code> → <code>`${pin.edition}:${file}`</code> | KILLED — `refuses two pins naming one file by an unnormalised path` |
| X-V11 | `tools/lib/figure-config-validate.js` | <code>`${pin.edition}:${path.posix.normalize(file)}`</code> → <code>`${path.posix.normalize(file)}`</code> | KILLED — `CONTROL: the same file under ANOTHER edition, which is a different fil…` |
| X-V12 | `tools/lib/figure-config-validate.js` | <code>if (owners.length !== 1) {</code> → <code>if (owners.length &gt; 1) {</code> | KILLED — `refuses a key that is no book’s image`; `refuses a key that differs from the image only by case` (+3 more) |
| X-V13 | `tools/lib/figure-config-validate.js` | <code>if (owners.length !== 1) {</code> → <code>if (owners.length === 0) {</code> | KILLED — `refuses a key two books share`; `feeds the validator, which names exactly the half-retired and the unre…` |
| X-V14 | `tools/lib/figure-config-validate.js` | <code>normkey(owner) !== normkey(k)</code> → <code>owner !== k</code> | **SURVIVED** — real gap (low value, fail-closed false positive): the other-figure rule must compare FOLDED names. The real corpus has 11 cross-book pairs differing only by punctuation (`Figure 04_06_01` / `Figure_04_06_01`) and `allBasenames` keeps the last spelling. Test: `basenamesByBook = {a: {'CNX_Ibu'}, b: {'CNX Ibu'}}`, pin `CNX_Ibu` -> file `Ch_03/CNX_Ibu.eps` must pass. Evidence: mutant reports it as the artwork of `CNX Ibu`. (A plain own-key spelling variant does NOT distinguish the mutants: tried, SAME.) |
| X-V15 | `tools/lib/figure-config-validate.js` | <code>    if (!s) continue; // the exactly-one-book rule above already names it⏎</code> → <code>(deleted)</code> | KILLED — `refuses two retiredFigures keys that fold together`; `refuses a retired figure that is no book’s image, and so has no state` (+1 more) |
| X-V16 | `tools/lib/figure-config-validate.js` | <code>    if (owners.length !== 1) continue;⏎</code> → <code>(deleted)</code> | KILLED — `buildValidatorCorpus on a throwaway books/ tree (§C140 ㊵, spec D11)` |
| X-G3 | `tools/generate-image-mapping.js` | <code>    if (original &amp;&amp; retired.has(original)) {</code> → <code>    if (false) {</code> | KILLED — `reads the retired set from the figure config, and skips it`; `an explicit retired set is used instead of the config` (+2 more) |
| X-G4 | `tools/generate-image-mapping.js` | <code>      skippedRetired.push(outputName);⏎      continue;⏎</code> → <code>      skippedRetired.push(outputName);⏎</code> | KILLED — `reads the retired set from the figure config, and skips it`; `never maps a retired figure, and names it as skipped rather than unmat…` (+1 more) |
| X-G5 | `tools/generate-image-mapping.js` | <code>    { retired: retired ?? loadRetiredFigures() }</code> → <code>    { retired: retired ?? new Set() }</code> | KILLED — `reads the retired set from the figure config, and skips it` |
| X-G6 | `tools/generate-image-mapping.js` | <code>  if (!dryRun) {</code> → <code>  if (true) {</code> | KILLED — `a dry run writes nothing` |
| X-C1 | `tools/lib/figure-text-config.js` | <code>  if (table === null &#124;&#124; typeof table !== 'object' &#124;&#124; Array.isArray(table)) {</code> → <code>  if (typeof table !== 'object' &#124;&#124; Array.isArray(table)) {</code> | KILLED — `refuses a retiredFigures that is not an object: null` |
| X-C2 | `tools/lib/figure-text-config.js` | <code>  if (table === null &#124;&#124; typeof table !== 'object' &#124;&#124; Array.isArray(table)) {</code> → <code>  if (table === null &#124;&#124; typeof table !== 'object') {</code> | KILLED — `refuses a retiredFigures that is not an object: []` |
| X-C3 | `tools/lib/figure-text-config.js` | <code>  if (table === undefined) return new Set();</code> → <code>  if (table == null) return new Set();</code> | KILLED — `refuses a retiredFigures that is not an object: null` |
| X-C4 | `tools/lib/figure-text-config.js` | <code>stem.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '')</code> → <code>stem.toLowerCase().replace(/[^a-z0-9]/g, '')</code> | KILLED — `normkey("Ö_Ð-þ²") is "öðþ²", as sources._normkey` |
| X-F3 | `tools/lib/translated-figure-refs.js` | <code>    'diff',⏎    '--name-only',⏎    '--relative',⏎</code> → <code>    'diff',⏎    '--name-only',⏎</code> | KILLED — `reads a modified file as modified when repoRoot is below the git top-l…` |
| X-F4 | `tools/lib/translated-figure-refs.js` | <code>rels.filter((r) =&gt; t.has(r) &amp;&amp; !d.has(r))</code> → <code>rels.filter((r) =&gt; t.has(r))</code> | KILLED — `refuses to delete a modified translated copy — git is the backup`; `keeps a MODIFIED copy — an edit git cannot restore is not deleted` (+2 more) |
| X-F5 | `tools/lib/translated-figure-refs.js` | <code>  if (r.status !== 0) throw new Error(`git restore failed: ${r.stderr.trim()}`);</code> → <code>  void r;</code> | KILLED — `says so, and where the files are, when the restore itself fails`; `says so, and where the files are, when the restore itself fails` |
| X-F6 | `tools/lib/translated-figure-refs.js` | <code>  if (r.status !== 0) throw new Error(`git ls-files failed in ${repoRoot}: ${r.stderr.trim()}`);</code> → <code>  void r;</code> | KILLED — `fails loudly, never as "no references", when the book lies outside the…`; `fails loudly, never as "no references", when the book lies outside the…` (+1 more) |
| X-S10 | `exp/ftt/sources.py` | <code> or re.match(r'[A-Za-z]:', file)</code> → <code>(deleted)</code> | **SURVIVED** — real gap (low value): a Windows drive-letter pin path (`C:/x.eps`) must be `pin-invalid`. Evidence: mutant `pin-missing`. Same class as #25. |
| X-S11 | `exp/ftt/sources.py` | <code>if (file.startswith('/') or </code> → <code>if (</code> | KILLED — crash: KeyError: 'refused' at the 'an absolute path' iteration of the pin-invalid table (test_sources.py:481): with `startswith('/')` gone, `root / file` yields the absolute path, `is_file()` is true and the hit has no `refused` key |
| X-S12 | `exp/ftt/sources.py` | <code>        out(json.dumps(resolve_report(argv[1:], trees, precedence, **policy(cfg)),</code> → <code>        out(json.dumps(resolve_report(argv[1:], trees, precedence, **dict(policy(cfg), pins=None)),</code> | KILLED — crash: TypeError: 'NoneType' object is not subscriptable at test_sources.py:553 in check '㊵ run_cli --json applies artworkPins' |
| X-S13 | `exp/ftt/sources.py` | <code>_memo=memo,⏎                                retired=retired, pins=pins)</code> → <code>_memo=memo,⏎                                retired=retired)</code> | KILLED — `FAIL ㊵ the human report prints a pinned hit with its kind`; `FAIL ㊵ the human report prints every new refusal kind, and counts them…` (+1 more); crash: TypeError: 'NoneType' object is not subscriptable at test_sources.py:553 in check '㊵ run_cli --json applies artworkPins' |
| X-S14 | `exp/ftt/sources.py` | <code>    report = resolve_report(names, trees, precedence, superseded=superseded, retired=retired,⏎                            pins=pins)</code> → <code>    report = resolve_report(names, trees, precedence, superseded=superseded, retired=retired)</code> | KILLED — `FAIL ㊵ the human report prints a pinned hit with its kind`; `FAIL ㊵ the human report prints every new refusal kind, and counts them…` (+1 more) |
| X-F7 | `tools/lib/translated-figure-refs.js` | <code>  const r = git(repoRoot, [⏎    '--literal-pathspecs',⏎    'ls-files',⏎    '-co',</code> → <code>  const r = git(repoRoot, [⏎    'ls-files',⏎    '-co',</code> | **SURVIVED** — equivalent: git tries a pathspec literally first and a glob only ADDS matches. The pathspecs here are `books/<slug>/03-translated\|05-publication` and the `--book` slug regex excludes glob characters, so only a direct caller could differ, and extra corpus files can only add references (fail-safe). Evidence SAME. |
| X-F8 | `tools/lib/translated-figure-refs.js` | <code>  const tracked = git(repoRoot, ['--literal-pathspecs', 'ls-files', '-z', '--', ...rels]);</code> → <code>  const tracked = git(repoRoot, ['ls-files', '-z', '--', ...rels]);</code> | **SURVIVED** — equivalent: `tracked` and `dirty` are intersected with `rels` and git matches the literal name first, so extra glob matches are ignored. Evidence SAME. |
| X-F9 | `tools/lib/translated-figure-refs.js` | <code>  const r = git(repoRoot, [⏎    '--literal-pathspecs',⏎    'restore',</code> → <code>  const r = git(repoRoot, [⏎    'restore',</code> | **SURVIVED** — real gap (low likelihood: 0 of 6,759 image basenames across all books contain `*?[]\`): a rollback restore for a name containing a glob character must touch only that file; without `--literal-pathspecs` a glob also reverts a modified neighbour. Evidence: the uncommitted edit of `CNX_Q1_IS.svg` is lost when restoring `CNX_Q[1]_IS.svg`. |

## 6. Killability evidence (golden vs mutant on a hand-built input)

Produced by `<scratch>/c40-mut/differential.py` (Python, golden and mutant both loaded from scratch copies) and `<scratch>/c40-mut/diffjs.py` + `scen.mjs`
(JS, golden and mutant mirrored under `<scratch>/c40-mut/mirror/`, removed afterwards). Raw outputs: `differential.json`, `diffjs.json`.
The repo tree was only read.

| mutant | input | golden | mutant | verdict |
|---|---|---|---|---|
| #1 | pinned path is a directory (D4 regular-file rule) | `{'path': None, 'refused': 'pin-missing', 'edition': 'updates-2e'}` | `{'path': 'Dir.eps', 'edition': 'updates-2e', 'via': 'override', 'pageUnknown': True}` | **DIFFER** |
| #2 | valid pin CNX_ICE next to a non-object sibling entry | `{'path': 'Ice.eps', 'edition': 'updates-2e', 'via': 'alias'}` | `RAISES AttributeError: 'str' object has no attribute 'get'` | **DIFFER** |
| #27 | valid pin CNX_ICE next to a non-object sibling entry | `{'path': 'Ice.eps', 'edition': 'updates-2e', 'via': 'alias'}` | `RAISES AttributeError: 'str' object has no attribute 'get'` | **DIFFER** |
| #3 | valid pin CNX_ICE next to a sibling with file: 5 | `{'path': 'Ice.eps', 'edition': 'updates-2e', 'via': 'alias'}` | `RAISES TypeError: argument should be a str or an os.PathLike object where __fspath__ ret` | **DIFFER** |
| #4 | run_cli HUMAN mode with an artworkPins entry | `[0, ['updates-2e     ... e/OSX/Ice.eps  (pinned: alias)']]` | `[1, ['NOT FOUND      ...                              -']]` | **DIFFER** |
| #28 | run_cli HUMAN mode with an artworkPins entry | `[0, ['updates-2e     ... e/OSX/Ice.eps  (pinned: alias)']]` | `[1, ['NOT FOUND      ...                              -']]` | **DIFFER** |
| #5 | pin with a whitespace-only reason | `{'path': None, 'refused': 'pin-invalid', 'edition': None}` | `{'path': 'Ice.eps', 'edition': 'updates-2e', 'via': 'alias'}` | **DIFFER** |
| #29 | pin with a whitespace-only reason | `{'path': None, 'refused': 'pin-invalid', 'edition': None}` | `{'path': 'Ice.eps', 'edition': 'updates-2e', 'via': 'alias'}` | **DIFFER** |
| #6 | resolve() (the public wrapper) given pins= | `['Ice.eps', 'updates-2e']` | `[None, None]` | **DIFFER** |
| #7 | two pins, same relative path, DIFFERENT editions | `[{'path': 'Shared.eps', 'edition': 'updates-2e', 'via': 'alias'}, {'path': 'Shared.eps', 'edition': 'first-edition', 'via': 'alias'}]` | `[{'path': None, 'refused': 'pin-conflict', 'edition': 'updates-2e'}, {'path': None, 'refused': 'pin-conflict', 'edition': 'first-edition'}]` | **DIFFER** |
| #26 | two pins, same relative path, DIFFERENT editions | `[{'path': 'Shared.eps', 'edition': 'updates-2e', 'via': 'alias'}, {'path': 'Shared.eps', 'edition': 'first-edition', 'via': 'alias'}]` | `[{'path': None, 'refused': 'pin-conflict', 'edition': 'updates-2e'}, {'path': None, 'refused': 'pin-conflict', 'edition': 'first-edition'}]` | **DIFFER** |
| #8 | alias whose basename exists exactly, but only under Translated_IS | `{'path': 'Ice.eps', 'edition': 'updates-2e', 'via': 'alias'}` | `{'path': None, 'refused': 'pin-conflict', 'edition': 'updates-2e'}` | **DIFFER** |
| #25 | pin file with a backslash | `{'path': None, 'refused': 'pin-invalid', 'edition': None}` | `{'path': None, 'refused': 'pin-missing', 'edition': 'updates-2e'}` | **DIFFER** |
| `X-S10` | pin file with a Windows drive letter | `{'path': None, 'refused': 'pin-invalid', 'edition': None}` | `{'path': None, 'refused': 'pin-missing', 'edition': 'updates-2e'}` | **DIFFER** |
| `M-S6b` | alias for a basename with an EXACT-name file in the tree | `{'path': None, 'refused': 'pin-conflict', 'edition': 'updates-2e'}` | `{'path': 'Ice.eps', 'edition': 'updates-2e', 'via': 'alias'}` | **DIFFER** |
| `M-S6c` | alias for a basename with an EXACT-name file in the tree | `{'path': None, 'refused': 'pin-conflict', 'edition': 'updates-2e'}` | `{'path': None, 'refused': 'pin-conflict', 'edition': 'updates-2e'}` | **SAME** |
| `M-S6c` | alias for a basename that is only a DIRECTORY named CNX_Dir.eps (corner case) | `{'path': None, 'refused': 'pin-conflict', 'edition': 'updates-2e'}` | `{'path': 'Ice.eps', 'edition': 'updates-2e', 'via': 'alias'}` | **DIFFER** |
| `M-S6c` | alias for a basename whose file has an UPPER-CASE suffix | `{'path': None, 'refused': 'pin-conflict', 'edition': 'updates-2e'}` | `{'path': None, 'refused': 'pin-conflict', 'edition': 'updates-2e'}` | **SAME** |
| #9 | rollback with TWO files deleted before the fault | `{"code": 1, "tail": "FAILED part-way (EACCES: simulated); the mapping and every file already deleted ", "treeRestored": true, "aBack": true, "bBack": ` | `{"code": 1, "tail": "FAILED part-way (EACCES: simulated); the mapping and every file already deleted ", "treeRestored": false, "aBack": true, "bBack":` | **DIFFER** |
| #10 | rollback with TWO files deleted before the fault | `{"code": 1, "tail": "FAILED part-way (EACCES: simulated); the mapping and every file already deleted ", "treeRestored": true, "aBack": true, "bBack": ` | `{"code": 1, "tail": "FAILED part-way (EACCES: simulated); the mapping and every file already deleted ", "treeRestored": false, "aBack": false, "bBack"` | **DIFFER** |
| #15 | CLI default retired set read from a config that HOLDS CNX_A | `{"code": 0, "err": "", "copyGone": true}` | `{"code": 1, "err": "REFUSED — nothing was written:\n  CNX_A: no retiredFigures entry — record the ruling in the", "copyGone": false}` | **DIFFER** |
| #15 | CLI default, a SUPERSEDED-but-not-retired figure (config retiredFigures = {}) | `{"code": 1, "err": "REFUSED — nothing was written:\n  CNX_Chem_19_01_BlastFurn: no retiredFigures entry — recor", "copyGone": false, "mapping": "[\n  ` | `{"code": 1, "err": "REFUSED — nothing was written:\n  CNX_Chem_19_01_BlastFurn: no retiredFigures entry — recor", "copyGone": false, "mapping": "[\n  ` | **SAME** |
| #16 | CLI default, a SUPERSEDED-but-not-retired figure (config retiredFigures = {}) | `{"code": 1, "err": "REFUSED — nothing was written:\n  CNX_Chem_19_01_BlastFurn: no retiredFigures entry — recor", "copyGone": false, "mapping": "[\n  ` | `{"code": 0, "err": "", "copyGone": true, "mapping": "[]"}` | **DIFFER** |
| #17 | exactly ONE referencing file | `{"code": 0, "line": ["  still referenced by 1 file(s) — pages change only in the whole-book re-inject and re-render (②):"]}` | `{"code": 0, "line": ["  no page or CNXML file references it"]}` | **DIFFER** |
| #17 | ZERO referencing files (control: both agree) | `{"code": 0, "line": ["  no page or CNXML file references it"]}` | `{"code": 0, "line": ["  no page or CNXML file references it"]}` | **SAME** |
| #18 | half-done retire (no row) over a NON-canonical mapping | `{"code": 0, "mappingUntouched": true}` | `{"code": 0, "mappingUntouched": false}` | **DIFFER** |
| #18 | nothing to retire and NO mapping file: is a mapping file created? | `{"code": 0, "mappingFileCreated": false}` | `{"code": 0, "mappingFileCreated": true}` | **DIFFER** |
| #19 | failed retire over a NON-canonical mapping: bytes restored? | `{"code": 1, "mappingBytesRestored": true}` | `{"code": 1, "mappingBytesRestored": false}` | **DIFFER** |
| #21 | mis-cased retiredFigures key | `{"code": 1, "err": "REFUSED — nothing was written:\n  CNX_A: no retiredFigures entry — record the rul", "copyGone": false}` | `{"code": 0, "err": "", "copyGone": true}` | **DIFFER** |
| #22 | source image differs from the retired name only by case | `{"code": 1, "err": "REFUSED — nothing was written:\n  CNX_A: no image of that name in b's source CNXML — wrong ", "copyGone": false}` | `{"code": 0, "err": "", "copyGone": true}` | **DIFFER** |
| #23 | mapping with [null] and [[]] | `{"null": {"threw": "<f> is not an array of objects; refusing to rewrite it — rep"}, "nested": {"threw": "<f> is not an array of objects; refusing to r` | `{"null": {"ok": "[null]"}, "nested": {"threw": "<f> is not an array of objects; refusing to rewrite it — rep"}, "control_obj": {"ok": "[{\"a\":1}]"}}` | **DIFFER** |
| #24 | mapping with [null] and [[]] | `{"null": {"threw": "<f> is not an array of objects; refusing to rewrite it — rep"}, "nested": {"threw": "<f> is not an array of objects; refusing to r` | `{"null": {"threw": "<f> is not an array of objects; refusing to rewrite it — rep"}, "nested": {"ok": "[[]]"}, "control_obj": {"ok": "[{\"a\":1}]"}}` | **DIFFER** |
| #13 | a non-translated .svg in the corpus references a translated copy | `{"hits": [["CNX_A_IS.", ["books/b/05-publication/mt-preview/chapters/01/diagram.svg"]]]}` | `{"hits": [["CNX_A_IS.", []]]}` | **DIFFER** |
| #14 | a reference that ends within maxLen chars of the file start | `{"hits": [["CNX_A_IS.", ["books/b/05-publication/mt-preview/chapters/01/1-1-page.html"]], ["CNX_A_much_longer_figure_name_IS.", []]]}` | `{"hits": [["CNX_A_IS.", []], ["CNX_A_much_longer_figure_name_IS.", []]]}` | **DIFFER** |
| `X-A3b` | X-A3b: git restore fails; is the MAPPING still restored? | `{"code": 1, "err": "FAILED part-way (EACCES: simulated); RESTORE ALSO FAILED: git restore failed: simulated restore fail", "mappingRestored": true}` | `{"code": 1, "err": "FAILED part-way (EACCES: simulated); RESTORE ALSO FAILED: git restore failed: simulated restore fail", "mappingRestored": false}` | **DIFFER** |
| `X-V14` | X-V14: a pin on one of two cross-book fold-colliding basenames, file named exactly like it | `{"problems": []}` | `{"problems": ["artworkPins.CNX_Ibu.file \"Ch_03/CNX_Ibu.eps\" is the artwork of another figure, CNX Ibu"]}` | **DIFFER** |
| `X-F8` | X-F8: a copy whose name contains [ ] is tracked+clean? | `{"clean": ["books/b/media/CNX_Q[1]_IS.svg"]}` | `{"clean": ["books/b/media/CNX_Q[1]_IS.svg"]}` | **SAME** |
| `X-F9` | X-F9: a deleted copy whose name contains [ ] restorable? | `{"namedRestored": true, "neighbourKeepsItsEdit": true}` | `{"namedRestored": true, "neighbourKeepsItsEdit": false}` | **DIFFER** |
| `X-F7` | X-F7: a corpus dir path with a glob char (direct caller only) | `{"files": ["books/b[1]/03-translated/x.cnxml"]}` | `{"files": ["books/b[1]/03-translated/x.cnxml"]}` | **SAME** |
| #12 | EQUIVALENCE brute force: adversarial outputNames and names | `{"count": 168}` | `{"count": 168}` | **SAME** |
| #20 | EQUIVALENCE brute force: adversarial outputNames and names | `{"count": 168}` | `{"count": 168}` | **SAME** |
| `M-R6a` | EQUIVALENCE brute force: adversarial outputNames and names | `{"count": 168}` | `{"count": 168}` | **SAME** |

Reading the evidence: SAME rows are the equivalence arguments (and, for #15 and #17, the control showing the mutant is only distinguishable on a populated config / a one-reference input).
`M-S6c` has one DIFFER row, the directory-named-like-the-figure corner, which the real trees do not contain (0 directories named `*.pdf|*.eps|*.ai`, 0 broken symlinks, in either tree).

## 7. Tests to add, by file (for the fix wave)

**`experiments/figure-text-translation/test_sources.py`**
1. alias for a basename that has an exact-name file -> `pin-conflict` naming it (`M-S6b`).
2. pin `file` is a directory -> `pin-missing` (#1).
3. containment: `pins` holding a valid pin plus a non-object entry, and plus an entry with `file: 5` -> the valid figure still resolves (#2/#27, #3).
4. `run_cli` human mode with `artworkPins` in the config -> exit 0 and `(pinned: alias)` (#4/#28).
5. whitespace-only `reason` -> `pin-invalid` (#5/#29).
6. same relative path pinned in two editions -> both resolve (#7/#26).
7. exact-name file only under `Translated_IS` does not block an alias (#8).
8. backslash and `C:/` paths -> `pin-invalid` (#25, `X-S10`).
9. `resolve(..., pins=P)` forwards the pins (#6, low value).

**`tools/__tests__/retire-translated-figure.test.js`**
1. rollback with two or more files deleted before the fault; assert every one is back (#9, #10).
2. rollback restores the mapping BYTES; use a compact (non-canonical) mapping (#19).
3. in `says so, and where the files are, when the restore itself fails`, also assert the mapping bytes are restored (`X-A3b`).
4. a half-done retire over a compact mapping leaves it byte-identical, and a book with no mapping gains none (#18).
5. exactly one referencing file prints `still referenced by 1 file(s)`; none prints `no page or CNXML file references it` (#17).
6. bind the CLI default to the config with `vi.mock('../lib/figure-text-config.js')`: a populated set is honoured, and a superseded-only figure is refused (#15, #16).
7. a mis-cased `retiredFigures` key and a source image that differs only by case are both refused (#21, #22).

**`tools/__tests__/translated-figure-refs.test.js`**
1. a non-translated `.svg` that references a copy counts (#13).
2. a file that begins with the reference, longer than the longest needle (#14).
3. `readMappingOrRefuse` refuses `[null]` and `[[]]` (#23, #24).
4. `restoreFromHead` on a name containing `[`/`*` leaves a modified glob-neighbour alone (`X-F9`).

**`tools/__tests__/figure-config-validate.test.js`**
1. `basenamesByBook = {a: {'CNX_Ibu'}, b: {'CNX Ibu'}}` plus a pin on `CNX_Ibu` whose file is `CNX_Ibu.eps` passes (`X-V14`).

No test is needed for the equivalent survivors (`M-S6c`, `M-R6a`, #12, #20, `X-F7`, `X-F8`).

## 8. Final state

Command and output, verbatim. The `cmp` of every golden against the tree (nothing is printed when the files are equal):

```
$ for f in <the six targets>; do cmp <scratch>/c40-mut/golden/$f $f; done

```
(per-file exit codes, from the same run: rc=0  experiments/figure-text-translation/sources.py; rc=0  tools/lib/figure-config-validate.js; rc=0  tools/retire-translated-figure.js; rc=0  tools/lib/translated-figure-refs.js; rc=0  tools/lib/figure-text-config.js; rc=0  tools/generate-image-mapping.js)

```
$ git status --porcelain

```
Both blocks above are empty. `git status --porcelain` exit code 0. `git rev-parse --short HEAD` now prints `c2a4d5f74`.

## Appendix A — exact text of the block edits

### M-S1a — `experiments/figure-text-translation/sources.py`
retired-first order: the retired block moved AFTER the superseded block (retired+superseded figure now reads superseded)

anchor 1 (occurs exactly once in the golden):
```
    if retired:
        folded = {_normkey(k): v for k, v in retired.items()}
        key = _normkey(basename)
        if key in folded:
            reason = folded[key]
            return {'path': None, 'refused': 'retired', 'edition': None, 'candidates': [],
                    'reason': reason if isinstance(reason, str) and reason.strip()
                    else '(no reason recorded)'}


```
replacement 1:
```
(deleted)
```

anchor 2 (occurs exactly once in the golden):
```
    if superseded:
        folded = {_normkey(k): v for k, v in superseded.items()}
        reason = folded.get(_normkey(basename))
        if reason is not None:
            return {'path': None, 'refused': 'superseded', 'edition': None,
                    'candidates': [], 'reason': reason}
```
replacement 2:
```
    if superseded:
        folded = {_normkey(k): v for k, v in superseded.items()}
        reason = folded.get(_normkey(basename))
        if reason is not None:
            return {'path': None, 'refused': 'superseded', 'edition': None,
                    'candidates': [], 'reason': reason}

    if retired:
        folded = {_normkey(k): v for k, v in retired.items()}
        key = _normkey(basename)
        if key in folded:
            reason = folded[key]
            return {'path': None, 'refused': 'retired', 'edition': None, 'candidates': [],
                    'reason': reason if isinstance(reason, str) and reason.strip()
                    else '(no reason recorded)'}
```

### M-S1b — `experiments/figure-text-translation/sources.py`
retired-first order: the retired block moved AFTER the pin check (a retired figure with a pin now resolves via the pin)

anchor 1 (occurs exactly once in the golden):
```
    if retired:
        folded = {_normkey(k): v for k, v in retired.items()}
        key = _normkey(basename)
        if key in folded:
            reason = folded[key]
            return {'path': None, 'refused': 'retired', 'edition': None, 'candidates': [],
                    'reason': reason if isinstance(reason, str) and reason.strip()
                    else '(no reason recorded)'}


```
replacement 1:
```
(deleted)
```

anchor 2 (occurs exactly once in the golden):
```
    for key in precedence:
        root = trees.get(key)
        if not root:
            # NOT configured for this book.
```
replacement 2:
```
    if retired:
        folded = {_normkey(k): v for k, v in retired.items()}
        key = _normkey(basename)
        if key in folded:
            reason = folded[key]
            return {'path': None, 'refused': 'retired', 'edition': None, 'candidates': [],
                    'reason': reason if isinstance(reason, str) and reason.strip()
                    else '(no reason recorded)'}

    for key in precedence:
        root = trees.get(key)
        if not root:
            # NOT configured for this book.
```

### M-S5 — `experiments/figure-text-translation/sources.py`
pin-missing falls THROUGH to the normal lookup instead of returning the refusal

anchor 1 (occurs exactly once in the golden):
```
        if pinned:
            return _resolve_pin(basename, pins[pinned[0]], trees, precedence, exts,
                                {} if _memo is None else _memo, size_of, pins)
```
replacement 1:
```
        if pinned:
            _r = _resolve_pin(basename, pins[pinned[0]], trees, precedence, exts,
                              {} if _memo is None else _memo, size_of, pins)
            if _r.get('refused') != 'pin-missing':
                return _r
```

### X-A3b — `tools/retire-translated-figure.js`
applyRetire rollback, REVERSE direction: files restored FIRST and a failed file restore returns early (the mapping is then never restored)

anchor 1 (occurs exactly once in the golden):
```
    try {
      if (mappingWritten && before !== null) writeAtomically(plan.mappingPath, before);
    } catch (e) {
      problems.push(e.message);
    }
    try {
      restoreFromHead(repoRoot, deleted, git);
    } catch (e) {
      problems.push(e.message);
    }
```
replacement 1:
```
    try {
      restoreFromHead(repoRoot, deleted, git);
    } catch (e) {
      return { ok: false, done, error: err.message, restoreError: e.message };
    }
    try {
      if (mappingWritten && before !== null) writeAtomically(plan.mappingPath, before);
    } catch (e) {
      problems.push(e.message);
    }
```

### X-S1 — `experiments/figure-text-translation/sources.py`
resolve_detail: the SUPERSEDED check moved AFTER the pin check (a pin may bring back a superseded figure)

anchor 1 (occurs exactly once in the golden):
```
    if superseded:
        folded = {_normkey(k): v for k, v in superseded.items()}
        reason = folded.get(_normkey(basename))
        if reason is not None:
            return {'path': None, 'refused': 'superseded', 'edition': None,
                    'candidates': [], 'reason': reason}


```
replacement 1:
```
(deleted)
```

anchor 2 (occurs exactly once in the golden):
```
    for key in precedence:
        root = trees.get(key)
        if not root:
            # NOT configured for this book.
```
replacement 2:
```
    if superseded:
        folded = {_normkey(k): v for k, v in superseded.items()}
        reason = folded.get(_normkey(basename))
        if reason is not None:
            return {'path': None, 'refused': 'superseded', 'edition': None,
                    'candidates': [], 'reason': reason}

    for key in precedence:
        root = trees.get(key)
        if not root:
            # NOT configured for this book.
```

## Appendix B — re-running

```
cd <scratch>/c40-mut
python3 -u run.py validate          # offline: anchors (exactly once) + syntax, writes premutants/<id>.diff
python3 -u run.py baseline          # the six focused commands on the clean tree
python3 -u run.py run <ids...>      # apply -> test -> cp -p restore -> cmp, one mutant at a time
python3 -u run.py cmp               # cmp every golden against the tree
python3 -u run.py restore           # recovery: restore any target that differs from its golden
```
