# E-2 Sever: retire `api-translate --update-status` — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the MIT tool's only optional load of AGPL `server/` code. `tools/api-translate.js` stops requiring `server/services/pipelineStatusService.js`, and `--update-status` refuses instead of writing the status database.

**Architecture:** `--update-status` stays **declared** in `parseCliArgs`, because `parseArgs` silently drops an undeclared flag. `main()` refuses it (exit 1, `Nothing was sent.`) before anything else runs. `updatePipelineStatus()` and the block that called it are deleted. So is everything that existed only to feed that block: `computeCompleteChapters()` and the five per-chapter Sets. The per-module verdicts that also drive the exit code stay. Root `LICENSE` class 1 and CLAUDE.md's E-2 bullet change in the **same commit**.

**Tech Stack:** Node 22, ESM (`tools/`), Vitest, Prettier, ESLint.

**Spec:** `docs/superpowers/plans/2026-11-08-rerequest-mode.md` § *Deferred, needs [USER]'s word*, first bullet ("keep the flag declared but refusing, so it is never silently dropped; remove `updatePipelineStatus`; update root `LICENSE` class 1 and CLAUDE.md's bullet in the same commit"), plus [USER]'s 2026-11-08 brief: also fix the two source-pin tests, and work in a new worktree off `main`.

**Worktree:** `.claude/worktrees/e2-sever`, branch `worktree-e2-sever`, cut from `origin/main` at `78341f6db`. Both `node_modules` trees are symlinked from the main checkout. Without the `server/` one, the floor reports fake `better-sqlite3` reds (memory: worktree-floor-needs-both-dep-trees).

## Premises measured while planning (at `78341f6db`)

CLAUDE.md says to treat a plan's "X is missing / nothing uses Y" as a hypothesis, so each of these was run, not inherited:

- **Nothing passes `--update-status`.** Searching `tools/ scripts/ server/ .github/ package.json` for the flag finds only `api-translate.js` and two of its tests. `server/services/feedbackService.js`'s `updateStatus` is an unrelated function. The server never spawns the tool with this flag.
- **Class 1 empties.** All four LICENSE search shapes, run over `tools/ scripts/ experiments/` without tests or archives, find exactly one try/catch-guarded load of AGPL **code**: this one. `tools/merge-glossary.js:495` is also guarded, but it is class 4 (it resolves a third-party package).
- **No test parses root `LICENSE`**, so emptying class 1 cannot turn a test red.
- **The five Sets feed only the status block.** `succeededChapters`, `failedChapters`, `mismatchChapters`, `deltaChapters` and `greekChapters` are read nowhere except inside `if (args.updateStatus && results.translated > 0)`. `computeCompleteChapters` has no other caller.
- **The exit code does not depend on them.** It reads `results.failed / mismatches / deltaModules / greekModules`, and each of those is incremented independently of the Sets.

## Decisions this plan makes

1. **Dead code goes.** Once `--update-status` refuses, the status block can never run, so the Sets would be write-only and `computeCompleteChapters` an export with no callers. That helper's docstring still says "eligible for `--update-status` completion" — the stale-comment class §C144 records. Both are deleted. **Consequence: three test files change, not two.** The two named source-pin files change, plus `api-translate-term-roundtrip.test.js`, whose T4 block unit-tests the deleted helper.
2. **The only behaviour lost:** the chapter-level line `Held back (failures, …): ch01, ch03 — fix and re-run to mark complete`. It printed only under `--update-status`, which nothing passes. The per-module `⛔ … HELD BACK — …` line and the exit-1 verdict both stay, and both stay pinned.
3. **Mutation coverage is kept, not just deleted.** The two removed pins were what would catch "the counter is never fed". The existing exit-line pins only check that the line *mentions* `deltaModules` / `greekModules`. So each removed pin is replaced by an exact pin on the increment.
4. **Refusal placement:** first among the contradiction checks, right after `--module requires --chapter`. It applies on `--dry-run` too: a flag that cannot be honoured is a contradiction, not a missing arm (the `--june-wire` precedent). Exit **1**. Its message contains `Nothing was sent.`, so `api-translate-rerequest.test.js`'s `--rerequest … --update-status` case stays green **unchanged**. The `--update-status` entry in the `--rerequest` clash list becomes unreachable and is removed.
5. **The refusal names no alternative.** The only status-writing route, `POST /api/pipeline-status/:book/:chapter/advance`, completes *whatever stage is current*, not `mtOutput`, and no UI calls it. Pointing there would mislead.
6. **LICENSE keeps its numbering.** Class 1 stays and is marked empty, with a dated note. The model is the `openstax-fetch.cjs` note in class 3. Renumbering would silently re-point "class 3 entry" and "most of class 4" inside the file, and any outside citation of a class number.
7. **"Still declared" is pinned by the refusal test itself.** `parseCliArgs` is not exported. An undeclared `--update-status` would be dropped, and the dry run would then exit 0 and print its plan, which is exactly what the refusal test rejects.

## Global Constraints

- **No paid MT.** Never run `api-translate.js` without `--dry-run` by hand. CLI tests use the existing helper's `MALSTADUR_API_KEY: 'bogus-key-for-tests'`, and the live-path test targets `--chapter 99`, which has no modules.
- **One commit** carries the code, the test changes, root `LICENSE`, CLAUDE.md and the per-chapter-loop doc line ([USER]: "in the same commit"). The register note is a second, docs-only commit.
- **CI gates beyond `npm test`:** `npm run lint` **and** `npm run format:check` (CLAUDE.md § CI). Run both before committing.
- **`<SCRATCH>`** = `/tmp/claude-1000/-home-siggi-dev-repos-namsbokasafn-efni/b2f40063-90ac-4d56-ba5c-d65feea25148/scratchpad`, the planning session's scratchpad, which holds the baseline log `baseline-full.log`. Write it out in full in commands. **If that file is missing** (`/tmp` is a RAM tmpfs: a crash or reboot clears it), re-run the baseline before Step 1 into your own scratchpad, and use that path: `npx vitest run > <your-scratch>/baseline-full.log 2>&1; echo "EXIT=$?" >> <your-scratch>/baseline-full.log`. The plan commit is docs-only, so it cannot move the floor.
- **Run tests from the worktree root.** Compare the full suite against the baseline by **failing file names**, never by counts (memory: worktree-floor-needs-both-dep-trees).
- **Frozen documents keep their wording:** specs, audits, old plans and the register's dated history. The only register edit is the new RESUME note in Task 2.
- **`logs/dev-journal.md` is not touched by this branch.** Its uncommitted entry lives in the main checkout.
- **Dates:** the copy below says `2026-11-08`. If executing on a later day, use the commit date everywhere it appears.
- **Census greps use `grep -a`.** Some committed files hold NUL bytes, and plain `grep` silently reports nothing for them (CLAUDE.md).
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

The input classes most likely to bite a person, with the behaviour they should get. Each is pinned in Task 1.

1. **An old command line still carrying `--update-status`** — alone, with `--dry-run`, or with a glossary arm on a live run → exit 1, `--update-status is retired`, `Nothing was sent.`, and no dry-run plan printed. *(new file, tests 1–3)*
2. **`--update-status` together with `--rerequest`** → the same refusal, exit 1, `Nothing was sent`. *(existing `api-translate-rerequest.test.js:351`, which must stay green with no edit)*
3. **A live run where a module has a bracket delta, a Greek loss or an id-reattach mismatch** → its `⛔ HELD BACK` line still prints and the run still exits 1. Only the chapter summary line is gone. *(new increment pins + the existing exit-line pins)*
4. **A later edit that re-adds a `server/` load to `api-translate.js`** → red, with a message that names root `LICENSE` and CLAUDE.md § E-2. *(new file, tests 5–7)*
5. **`--help`** → still lists `--update-status`, marked `Retired`, exit 0, so whoever holds an old command can see why it now refuses. *(new file, test 4)*

---

### Task 1: Sever the edge, retire the flag, update LICENSE + CLAUDE.md (one commit)

**Files:**
- Create: `tools/__tests__/api-translate-update-status-retired.test.js`
- Modify: `tools/api-translate.js` (line numbers below are at `78341f6db`, for orientation only; anchor on the quoted text)
- Modify: `tools/__tests__/api-translate-output-guards.test.js:232-258`
- Modify: `tools/__tests__/api-translate-bracket-delta-gate.test.js:1-48, 100-130, 184-228`
- Modify: `tools/__tests__/api-translate-term-roundtrip.test.js:291-308`
- Modify: `LICENSE` (the E-2 note, class 1 and its intro line)
- Modify: `CLAUDE.md` (§ *THIS REPOSITORY IS PUBLIC*, the "Known gap E-2" bullet)
- Modify: `docs/plans/2026-09-05-per-chapter-loop.md:292`

**Interfaces:**
- Consumes: nothing from another task.
- Produces: `api-translate.js` exports **lose** `computeCompleteChapters`. `classifyModuleOutcome`, `bracketMarkerDelta` and every other export are unchanged. The CLI contract: `--update-status` → exit 1, stderr contains `--update-status is retired` and `Nothing was sent.`.

- [ ] **Step 1: Write the new test file**

`tools/__tests__/api-translate-update-status-retired.test.js`. Header comment: one paragraph saying what is pinned and why (CLAUDE.md § E-2, root LICENSE class 1; the flag stays declared because `parseArgs` drops an undeclared flag silently). Constants:

```js
const REPO = fileURLToPath(new URL('../..', import.meta.url));
const API_TRANSLATE = path.join(REPO, 'tools', 'api-translate.js');
// Same helper as api-translate-rerequest.test.js: a bogus key, so nothing can be bought.
const cli = (...args) =>
  spawnSync(process.execPath, ['tools/api-translate.js', '--book', 'efnafraedi-2e', ...args], {
    cwd: REPO,
    env: { ...process.env, MALSTADUR_API_KEY: 'bogus-key-for-tests' },
    encoding: 'utf8',
  });
// A static `from '…'`, a `require('…')` or an `import('…')`: the specifier is the capture.
const LOAD = /\bfrom\s+(['"])([^'"]+)\1|\b(?:require|import)\s*\(\s*(['"`])([^'"`]+)\3\s*\)/g;
// A path built toward server/: a separate 'server' argument (shape 2) or a literal
// beginning 'server' handed to join/resolve/createRequire (shape 3's createRequire anchor).
const BUILT_TOWARD_SERVER = /\b(?:join|resolve|createRequire)\([^)]*['"`]server\b/;
```

`describe('--update-status refuses — api-translate no longer writes the status database')`:

```js
it('1 · a dry run with --update-status is refused before any plan is printed', () => {
  const r = cli('--chapter', '1', '--dry-run', '--update-status');
  expect([r.status, r.stderr.includes('--update-status is retired'),
          r.stderr.includes('Nothing was sent.'), r.stdout.includes('Dry run —')])
    .toEqual([1, true, true, false]);
});
it('2 · control: the same dry run without the flag succeeds and prints its plan', () => {
  const r = cli('--chapter', '1', '--dry-run');
  expect([r.status, r.stdout.includes('Dry run —')]).toEqual([0, true]);
});
it('3 · a live run with a glossary arm is refused the same way', () => {
  // --chapter 99 has no modules: even unrefused, nothing could be sent.
  const r = cli('--chapter', '99', '--no-glossary', '--update-status');
  expect([r.status, r.stderr.includes('--update-status is retired')]).toEqual([1, true]);
});
it('4 · --help still lists the flag, marked retired', () => {
  const r = cli('--help');
  expect([r.status, /--update-status\s+Retired/.test(r.stdout)]).toEqual([0, true]);
});
```

`describe('api-translate.js loads no server/ code — root LICENSE class 1 is empty')`, with `const src = fs.readFileSync(API_TRANSLATE, 'utf8')` and `const specifiers = [...src.matchAll(LOAD)].map((m) => m[2] ?? m[4])`:

```js
it('5 · control: the specifier scan finds the file\'s own imports', () => {
  expect(specifiers).toEqual(expect.arrayContaining(['fs', './lib/malstadur-api.js', './lib/mt-lock.cjs']));
});
it('6 · no load names server/', () => {
  expect(specifiers.filter((s) => s.includes('server')),
    'a tools/ → server/ load is an E-2 edge; if it is deliberate, list it in root LICENSE and CLAUDE.md § E-2')
    .toEqual([]);
});
it('7 · no path is built toward server/', () => {
  expect(src).not.toMatch(BUILT_TOWARD_SERVER);
});
it('7c · control: the path pattern does match a server/ path', () => {
  expect(BUILT_TOWARD_SERVER.test("path.join(REPO_ROOT, 'server', 'lib', 'x.js')")).toBe(true);
});
it('8 · updatePipelineStatus is gone', () => {
  expect(src).not.toContain('updatePipelineStatus');
});
it('9 · computeCompleteChapters is gone — it existed only to feed the status write', () => {
  expect(src).not.toContain('computeCompleteChapters');
});
```

Prettier will rewrap these; that is expected.

- [ ] **Step 2: Run it and confirm the right reds**

Run: `npx vitest run tools/__tests__/api-translate-update-status-retired.test.js`
Expected: **FAIL on 1, 3, 4, 6, 8, 9; PASS on 2, 5, 7, 7c.** On 1, the dry run currently exits 0 and prints its plan. On 6, the list holds `'../server/services/pipelineStatusService.js'`. Any other pattern means a test is aimed wrong: fix the test before going on.

- [ ] **Step 3: Re-aim the existing pins (three files)**

`api-translate-output-guards.test.js`, describe `① Greek loss — the verdict is wired into main()`:
- Rename `'counts a Greek-loss module and holds its chapter'` → `'counts a Greek-loss module'`. Make its regex end at the increment: `/if \(greekLost && greekLost\.length > 0\) \{\s*results\.greekModules\+\+;/`
- Delete `'feeds a Greek held-back set into computeCompleteChapters'`.

`api-translate-bracket-delta-gate.test.js`:
- Drop `computeCompleteChapters` from the import, and delete the whole describe `'computeCompleteChapters accepts any number of held-back sets'`.
- Replace `'main() feeds a bracket-delta set into computeCompleteChapters'` with this pin. The `heldBack` control goes with the old test, because its subject is gone.
  ```js
  it('main() counts a delta-bearing module toward the exit', () => {
    expect(mainBody).toMatch(
      /if \(bracketDelta && Object\.keys\(bracketDelta\)\.length > 0\) \{\s*results\.deltaModules\+\+;/
    );
  });
  ```
- Header comment: replace the sentence "an id-reattach mismatch adds its chapter to `mismatchChapters`, which `computeCompleteChapters` excludes and which forces a non-zero exit. This routes the delta through the same path." with "an id-reattach mismatch is counted in `results.mismatches`, which forces a non-zero exit. This routes the delta through the same exit." Leave the incident history ("would have marked the chapter complete under `--update-status`") as written: it records what happened.
- In `'a bracket delta contributes to the non-zero exit'`, change its comment's "otherwise the chapter is held back from --update-status while the run still reports success to a human" to "otherwise the run reports success to a human while a module needs review".

`api-translate-term-roundtrip.test.js`: delete the describe `'computeCompleteChapters (T4 — mismatch chapters excluded from completion)'` and its banner comment.

- [ ] **Step 4: Implement in `tools/api-translate.js`**

Add next to `NO_ARM_HELP`:

```js
// CLAUDE.md § E-2: the flag loaded AGPL server/ code from this MIT tool. It stays declared in
// parseCliArgs so it is refused here instead of being dropped silently by parseArgs.
const UPDATE_STATUS_RETIRED =
  'Error: --update-status is retired (2026-11-08): api-translate no longer writes the ' +
  'pipeline status database, because doing so loaded AGPL server/ code from this MIT tool ' +
  '(CLAUDE.md § E-2). Nothing was sent.';
```

Changes, in file order:
- `:23` header: `Not with --force, --top-up, --june-wire or --update-status.` → `Not with --force, --top-up or --june-wire.`
- `:1408-1424`: delete the `computeCompleteChapters` JSDoc and function.
- `:1427` `classifyModuleOutcome` doc: `must hold its chapter back` → `must be held back`.
- `:1507` `parseCliArgs`: keep the `updateStatus` entry. Put a one-line comment above it in the style of the `rerequest`/`juneWire` comments: "Retired (CLAUDE.md § E-2). ⚠️ parseArgs drops an UNDECLARED flag silently, so this line is what lets main() refuse it (api-translate-update-status-retired.test.js)."
- `:1571` help: `--top-up, --june-wire or --update-status.` → `--top-up or --june-wire.`
- `:1585` help: `--update-status     Mark mtOutput stage as complete in pipeline DB` → `--update-status     Retired 2026-11-08: refuses (no longer writes the status database)`
- `:2081` comment: `A LOSS holds the chapter back (classifyModuleOutcome)` → `A LOSS holds the module back (classifyModuleOutcome)`.
- `:2744-2785`: delete the `// ─── Pipeline Status ───` banner and `updatePipelineStatus` entirely.
- `main()`, directly after the `--module requires --chapter` check: `if (args.updateStatus) { console.error(UPDATE_STATUS_RETIRED); process.exit(1); }`. This matches its neighbours' exit idiom: the message is short and goes to stderr.
- `--rerequest` clash check: remove the `['--update-status', args.updateStatus]` entry. Change its comment's "every flag that rewrites layer 1 or the status DB contradicts it" → "every flag that rewrites layer 1 contradicts it".
- `:3091-3100`: delete the five `new Set()` declarations and their comment block.
- Delete the six `.add(mod.chapterDir)` lines: `failedChapters` in the top-up-refuse branch and in `catch`; `mismatchChapters`; `deltaChapters`; `greekChapters`; `succeededChapters`. The delta and Greek `if` blocks keep their `results.*Modules++` line. The two new pins match that shape.
- The delta block's comment: `now HOLDS THE CHAPTER BACK instead of only printing a note` → `now COUNTS toward the non-zero exit instead of only printing a note`.
- `:3241-3270`: delete the `// Update pipeline status if requested …` comment and the whole `if (args.updateStatus && results.translated > 0) { … }` block.
- The exit-line comment: `it must reach the exit code too, or the chapter is held back from --update-status while the run still reports success to whoever is watching.` → `it must reach the exit code, or the run reports success to whoever is watching.` Keep `§C183 ①: so is a Greek-letter loss.` and `// prettier-ignore`.

Then check what is left:
- `grep -an 'succeededChapters\|failedChapters\|mismatchChapters\|deltaChapters\|greekChapters\|completeChapters\|pipelineStatus' tools/api-translate.js` → **no output**. (Do not grep a bare `Chapters\b`: `discoverChapters` at `:1605`/`:2930` is unrelated and stays.)
- `grep -an 'updateStatus\|update-status' tools/api-translate.js` → only the `parseCliArgs` entry and its comment, the help line, the `UPDATE_STATUS_RETIRED` constant, the refusal in `main()`, and the historical sentence in `classifyModuleOutcome`'s doc (`would have marked the chapter complete under --update-status`).

- [ ] **Step 5: Run the five affected files**

Run: `npx vitest run tools/__tests__/api-translate-update-status-retired.test.js tools/__tests__/api-translate-output-guards.test.js tools/__tests__/api-translate-bracket-delta-gate.test.js tools/__tests__/api-translate-term-roundtrip.test.js tools/__tests__/api-translate-rerequest.test.js`
Expected: all PASS. `api-translate-rerequest.test.js` passes **with no edit**: its `--update-status` case now gets the new refusal (exit 1, `Nothing was sent`).

- [ ] **Step 6: Mutation-check the two new increment pins**

Golden-copy first. Never restore a mutant with `git checkout --` (CLAUDE.md). The paths are spelled out, because the worktree guard refuses a computed path such as `"$S/…"`. `<SCRATCH>` below is the session's scratchpad directory, written out in full.
```bash
cp tools/api-translate.js <SCRATCH>/api-translate.golden.js
```
Mutant A: delete `results.deltaModules++;`. Run `api-translate-bracket-delta-gate.test.js` → expect `main() counts a delta-bearing module toward the exit` **red**. Restore with `cp <SCRATCH>/api-translate.golden.js tools/api-translate.js`, then `cmp`.
Mutant B: delete `results.greekModules++;`. Run `api-translate-output-guards.test.js` → expect `counts a Greek-loss module` **red**. Restore the same way, then `cmp`.
Finish with `cmp tools/api-translate.js <SCRATCH>/api-translate.golden.js` → no output, and `git status --porcelain` → only the files this task modifies.

- [ ] **Step 7: Re-derive class 1 with all four LICENSE search shapes**

The four shapes are root `LICENSE`'s own instrument. Run them over the MIT trees' code files, excluding tests and archives. Each is a plain command on purpose. The worktree guard refuses a `git ls-files | xargs` pipeline or a shell function wrapping `git`, and `grep` here is ugrep, where `-z` does not mean NUL-separated input. All four were run in this form while planning.
```bash
# shape 1: literal ../server/
grep -rIan --include='*.js' --include='*.cjs' --include='*.mjs' --exclude-dir=__tests__ --exclude-dir=archived --exclude-dir=evidence --exclude-dir=node_modules --exclude-dir=.venv "['\"\`]\(\.\./\)\+server/" tools scripts experiments
# shape 2: separate 'server' argument
grep -rIan --include='*.js' --include='*.cjs' --include='*.mjs' --exclude-dir=__tests__ --exclude-dir=archived --exclude-dir=evidence --exclude-dir=node_modules --exclude-dir=.venv "['\"]server['\"]" tools scripts experiments
# shape 3: literal beginning server/ (comment-only lines dropped)
grep -rIan --include='*.js' --include='*.cjs' --include='*.mjs' --exclude-dir=__tests__ --exclude-dir=archived --exclude-dir=evidence --exclude-dir=node_modules --exclude-dir=.venv "['\"\`]server/" tools scripts experiments | grep -av '^[^:]*:[0-9]*:\s*\(\*\|//\)'
# shape 4: absolute …/server/
grep -rIan --include='*.js' --include='*.cjs' --include='*.mjs' --exclude-dir=__tests__ --exclude-dir=archived --exclude-dir=evidence --exclude-dir=node_modules --exclude-dir=.venv "['\"\`]/[^'\"\`]*/server/" tools scripts experiments
```
(`--exclude-dir=node_modules` skips vendored *directories*. It does not drop result lines that *mention* `node_modules`, which is the exclusion LICENSE warns against.)
Expected: **no hit in `tools/api-translate.js` at all.** At `78341f6db` its only hit was shape 1's `:2758`. Every remaining hit is an edge already in classes 2–5, or one of the drift items listed at the end of this plan. If any hit is a try/catch-guarded load of `server/` **code**, stop: class 1 is not empty, and the LICENSE text in Step 8 is wrong.

- [ ] **Step 8: Update root `LICENSE`, CLAUDE.md and the per-chapter loop**

`LICENSE`: change the intro line `it. The edges fall into five classes:` → `it. The edges fall into five classes; the first is empty at present:`. Replace class 1's entry, keeping its heading and definition line, with:

```
>    - *None at present.*
>
>    *(`tools/api-translate.js` → `server/services/pipelineStatusService.js` sat
>    here until 2026-11-08, cited at `:1768` though the require had drifted to
>    `:2758`. Its `--update-status` flag loaded the service to mark a chapter's
>    `mtOutput` stage complete. The require was removed that day, and the flag now
>    refuses rather than being dropped silently. The class is kept, empty, so the
>    class numbers cited below and elsewhere keep their meaning.)*
```

Delete the two lines after it ("It warns and continues if the module is absent: …"). Their subject is gone.

`CLAUDE.md`: in the "Known gap E-2" bullet, replace from `**Two rules, applied to different edges**` through the end of the `chapterLabel` sub-bullet with:

```
  **One rule, for one kind of edge** (`LICENSE` classifies the edges more finely — do not
  read this as its class count):
  - the `server/lib/chapterLabel` imports in the appendix-aware tools/scripts are
    **deliberate and load-bearing** — the C1a two-conventions rule below *mandates* that
    idiom, so **do not sever them**. They are unguarded static imports: the importing tool
    cannot run without `server/`.
  *(This said "Two rules" until 2026-11-08. The other — "`api-translate.js`'s optional,
  try/catch-guarded require of `pipelineStatusService`: sever it if you touch that file" —
  was carried out that day: the require is gone and `--update-status` now refuses rather
  than being dropped silently.)*
```

Leave the bullet's history sentences and its `**The current enumeration lives in root LICENSE**` line as they are.

`docs/plans/2026-09-05-per-chapter-loop.md:292`: `is **held back** from \`--update-status\` and forces \`process.exit(1)\`` → `is **held back** (a per-module ⛔ line) and forces \`process.exit(1)\``.

- [ ] **Step 9: Full gates, compared to the baseline**

The baseline is `<SCRATCH>/baseline-full.log`, the full suite run in this worktree at `78341f6db` before any change. Compare failing **files**, never test counts: a file that aborts partway reports its remaining tests as skipped, so per-test counts drift between identical runs.
```bash
df -h /tmp | tail -1
npx vitest run > <SCRATCH>/after-full.log 2>&1; echo "EXIT=$?" >> <SCRATCH>/after-full.log
grep -a ' FAIL ' <SCRATCH>/baseline-full.log | grep -aoE '[A-Za-z0-9_./-]+\.(test|spec)\.[cm]?js' | sort -u > <SCRATCH>/fail-before.txt
grep -a ' FAIL ' <SCRATCH>/after-full.log | grep -aoE '[A-Za-z0-9_./-]+\.(test|spec)\.[cm]?js' | sort -u > <SCRATCH>/fail-after.txt
diff <SCRATCH>/fail-before.txt <SCRATCH>/fail-after.txt
npm run lint
npm run format:check
```
Expected: the `diff` shows **no file that is only in `fail-after.txt`**. `api-translate-update-status-retired.test.js` is new, so it must not appear there at all. Lint and format:check exit 0 (run `npx prettier --write` on the touched files first if needed). A file that is red after but not before is a regression: stop and diagnose it before committing.

- [ ] **Step 10: Commit (one commit)**

```bash
git add tools/api-translate.js tools/__tests__/api-translate-update-status-retired.test.js \
  tools/__tests__/api-translate-output-guards.test.js tools/__tests__/api-translate-bracket-delta-gate.test.js \
  tools/__tests__/api-translate-term-roundtrip.test.js LICENSE CLAUDE.md docs/plans/2026-09-05-per-chapter-loop.md
git status --porcelain   # must list nothing else (node_modules links stay ignored)
git commit -m "refactor(api-translate): sever the optional server/ require; --update-status refuses (E-2)

api-translate.js no longer loads AGPL server/services/pipelineStatusService.js. The flag stays
declared so it is refused (exit 1, Nothing was sent.) instead of dropped silently by parseArgs.
updatePipelineStatus, computeCompleteChapters and the five per-chapter Sets that only fed the
status write are removed; the per-module HELD BACK line and the exit-1 verdict are unchanged and
their counters are now pinned directly. Root LICENSE class 1 is empty (numbering kept);
CLAUDE.md's E-2 bullet is down to the chapterLabel rule.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Record it in the register (docs-only commit)

**Files:**
- Modify: `docs/plans/2026-07-21-post-item17-followup-campaign.md` (directly below the `✏️ *2026-11-08, later: **the re-request mode is BUILT …` sub-bullet, at line 12)

**Interfaces:**
- Consumes: Task 1's commit hash (`git rev-parse --short HEAD`).
- Produces: nothing code-facing.

- [ ] **Step 1: Add the note** as a sub-bullet at the same indent as the line-12 note:

```
  - ✏️ *2026-11-08, later still: **#637 is merged (`78341f6db`), and the E-2 sever is BUILT** on `worktree-e2-sever` (`<task-1 hash>`, not pushed, no PR yet; [USER]'s word first). Plan: [`docs/superpowers/plans/2026-11-08-e2-sever-update-status.md`](../superpowers/plans/2026-11-08-e2-sever-update-status.md).* `api-translate.js` no longer requires `server/`. `--update-status` refuses, so root `LICENSE` class 1 is empty and CLAUDE.md's E-2 bullet carries only the `chapterLabel` rule. The chapter-level "Held back (…)" summary went with it; per-module ⛔ lines and exit 1 are unchanged. ▶ NEXT: [USER]'s word on the push and PR, then PR4.
```

- [ ] **Step 2: Commit**

```bash
git add docs/plans/2026-07-21-post-item17-followup-campaign.md
git commit -m "docs(register): the E-2 sever is built (--update-status refuses, LICENSE class 1 empty); NEXT is the PR, then PR4

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Scope added by [USER] at approval (2026-11-08) — landed in Task 1's commit

These were listed here as "noticed, not in this plan". [USER] approved the plan with them folded into Task 1's commit, executed natively:

- **CLAUDE.md § Status Updates** showed `npm run update-status <book> <chapter> <stage> <status>`, which neither `package.json` defines. The script was archived to `scripts/archived/update-status.js` on 2026-03-13 (`c9145f2fb`). The line is gone, `npm run validate` stays, and a dated note records the removal. The note does not claim where stage status is written today: there are two read models, and that was not measured here.
- **Root LICENSE drift:**
  - `tools/figure-run.js:72` → `:78`.
  - Class 4's `render-check.mjs:11` "absolute import" entry is rewritten. Since 2026-09-15 (`4b25b8d95`) `render-check.mjs:37-40` looks `playwright` up under the root's `node_modules/` and then `server/node_modules/`, and it falls back to the bare specifier. `tools/figure-run.js:1040` spawns it, so "no tool spawns either" was false too.
  - `browser-sweep.mjs:342-345`, which uses the same lookup, is listed for the first time.
  - `probe-img.mjs:3` stays as the one absolute import, and shape 4's sentence now names only it.
  - The same mechanical check of every `file:line` in the E-2 note found class 5 shifted as well: `remt-ctx.js:366` → `:368`, and `remt-checks-glossary.js:468` → `:482` and `:358` → `:372`. Those were fixed too (ledger ruling). Every other flagged reference deliberately points at a non-`server` line, such as an `if (USE_DB)` guard or a `main()`.
