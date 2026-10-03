# §C140 step 2, PR-A: the code fixes the recompose pass needs (no media, no bump) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** land, as code with red-first tests and EMPTY config tables, everything the single '4' → '5' figure recompose pass needs in the tree before it runs: the `keptCopies` guard, the §C161 annotation strip, the ㉑ visual line count, the ㊳ test fix, and (Part 5) the `heldBlockValues` compose-time substitution.

**Architecture:** four (five) independent parts, each in the files it owns. `keptCopies` is a fourth policy table read by `sources.py` (a resolution-time refusal of kind `kept`), named by the driver and checked by the config validator. §C161 drops `/Annots` in `strip-text.py`, the only producer of the composer's artwork. ㉑ adds `figtext.visual_lines`, used only for a block's OWN layout cues, while `block_key` stays on `FT.lines`. ㊳ makes `figure-run-free.test.js` ask whether a sidecar is CURRENT. Nothing in PR-A changes `books/`, media, any sidecar or `COMPOSER_VERSION`.

**Tech Stack:** Python 3 (the composer under `experiments/figure-text-translation/`, `pikepdf`, Pillow, the suites' own `check()` harness printing `ALL PASS`), Node ESM + Vitest (`tools/`), JSON config.

**Spec:** `docs/superpowers/specs/2026-10-02-c140-step2-recompose-pass-design.md` (its Approval line records [USER]'s 2026-10-02 rulings). Register row §C140 ㊾. Evidence for every measured number below: `~/.cache/namsbokasafn-audit/2026-10-02-step2-rederive/` (`rederive.json`; `plan-drafts/`).

## ⚠️ State of this plan (read first)

- **Parts 1 and 2 are drafted AND independently verified.** Two verifiers applied every code block verbatim to scratch copies of HEAD (`2f5f213bf`), each anchor matching exactly once, and ran the red arm (fails as predicted) and the green arm (passes). Their defects are folded in below.
- **Parts 3 (㉑) and 4 (㊳) are now verified too (2026-10-03).** A replicating verifier applied each part verbatim in a scratch worktree of `a9fe1f031` and a skeptic then tried to refute it with mutants. Every anchor matched exactly once, every red arm failed exactly as written, every green arm passed, and Part 3 Task 4's prediction held (4 laid-out blocks in 2 figures; 25 of 27 SVGs byte-identical). Their fixes are folded in below, including two test-strength gaps the skeptics found: Part 4's `skips exactly` test gains a version-current, hash-stale control, and its tripwire scanner skips comments; Part 3 Task 2 gains a free-box pin for the obstacle half of the `C|B|A` guard. Off-repo record: `~/.cache/namsbokasafn-audit/2026-10-03-step2/wf1/` (`plan-fixes.json` lists all 32 applied fixes). As for Parts 1 and 2, still run each red-first test before editing: the tree may have moved.
- **Part 5 (`heldBlockValues`, spec D5(a)) is NOT DRAFTED.** The same stop hit its drafter, which also owed the **value sheet** (the exact `blocks.json` keys that PR-B's user-input step asks [USER] to fill). **PR-A must not merge without Part 5.** Parts 1–4 can be executed and reviewed before it. Part 5 edits `compose.py` (as Part 3 does) and `figure-config-validate.js` (as Part 1 does), so write it against the tree after Parts 1–4.
- Task numbers are LOCAL to each part (Part 1 has Tasks 1–4, Part 3 has Tasks 1–4, …). A reference such as "Task 3 Step 6" inside a part means that part's task.

## Global Constraints

- **Branch:** `feat/c140-c49-step2-code-fixes`, cut from `docs/c140-c40-buys-merged-handoff` (it carries the step-2 docs commits, which ride out with this PR). Merge as a merge commit, not a squash: the register cites individual SHAs.
- **0 ISK.** No step runs `tools/figure-run.js` except with `--dry-run`, and none runs `translate-blocks.mjs`, `--force`, or `scripts/chemistry-autorun-chapter.sh`.
- **No `books/` change, no media, no sidecar, no `COMPOSER_VERSION` change.** Every config table this PR adds ships EMPTY. PR-B fills them.
- **Between this PR's merge and PR-B's bump, no `figure-run.js --force` on any chapter** (it would recompose figures under '4' with the new composer).
- **Run every command from the repo root.** A step written as `cd experiments/figure-text-translation && …` must be run in a subshell, `( cd experiments/figure-text-translation && … )`, because the working directory persists between tool calls and the next step's root-relative paths would fail. (`_deps.py` resolves `FIGTEXT_PYLIBS=./pylibs` against the current directory, so the subshell keeps it right.)
- **Commit trailers:** every `git commit` heredoc below stops at the message body. Append your session's attribution trailer lines (`Co-Authored-By: …`, `Claude-Session: …`) after a blank line, before `EOF`.
- **Python suites run in no CI job** (register ㊷②), so this PR's Python tests gate only when the executor runs them: `test_sources.py`, `test_figure_prepare.py`, `test_strip_text.py`, `test_figtext*`, `test_figcontainers.py`, `test_figlayout.py`, `test_compose_*.py`, `test_figscripts.py`. Run each one named in a task, and before the PR all of them, with `FIGTEXT_PYLIBS=./pylibs python3 -u <file>` in a subshell (expected tail `ALL PASS`).
- **Before the PR:** `npm test` (diff the failing SET by name against `main`'s, never the count), `npm run lint`, `npm run format:check`. CI also runs Playwright E2E, which this PR does not touch.
- **No Icelandic is proposed anywhere.** Icelandic appearing in a test quotes a committed file verbatim, as evidence (the API-only rule).
- **Ordering (PR-B's, enforced by its plan, restated here because PR-A's handoff depends on it):** a figure's `keptCopies` entry lands in the same commit as its June restore and sidecar deletion, or earlier, **never after** (see § Handoff to PR-B, item 0).

## Review Focus

1. **A kept figure on every driver route.** Plain (buying), `--stale`, `--force` and `--figure`, with a sidecar and without: none may prepare, buy or publish over the kept copy. Part 1 Task 2's paid-harness test covers this; a reviewer should check it includes the sidecar-LESS case, since that is PerTable2's state after PR-B deletes the sidecar.
2. **An annotation subtype other than `/Text` or `/Popup`.** It must refuse loudly, as `failed-prepare` naming the subtype, before anything is deleted or written. A silent drop could remove real artwork (Part 2's red arm 13i; check it asserts NO `artwork.pdf` is written).
3. **A block that OPENS with its script run.** ㉑'s merged line takes its baseline and font from its first run; on all 21 measured merges that is the body run, but a source opening with a superscript would take the script's baseline (Part 3, an open question its draft names). Add a planted fixture with a script-first block to Part 3 Task 3 if a reviewer judges it reachable. **Measured 2026-10-03 (Part 3 skeptic): not reachable on the chemistry corpus.** Over the 2026-09-13 census (`evidence/2026-09-13-t23/data/1b-census.jsonl.gz`, 14,962 blocks) `visual_lines` merges 48 blocks (21 send:true, 27 send:false), and in 0 of them does a merged visual line open with a run smaller than, or more than 0.5 pt off the baseline of, its largest run. No fixture is added; re-measure before a new book.
4. **A diagonal kept label.** CbcCltPckd's `C|B|A` must stay three lines: ㉑'s merge applies to a block's own cues only, never to `figcontainers.line_frames` for siblings and obstacles (Part 3 Task 2's two pins, one per half: the sibling-cue pin and the free-box pin. Task 4's 27-figure run cannot stand in for the second: with only `free_box`'s obstacles moved onto visual lines, 0 of its 163 decide records and 0 of its 27 SVGs change).
5. **The validator's shared helpers vs. `heldBlockValues`.** Its values are OBJECTS, not reason strings, so `figure-config-validate.js`'s generic `reasonOf` rule would reject them if reused. Part 5 must give the table its own rule, and Part 1's tests must stay green after it.

---

# Part 1 — the `keptCopies` guard (spec D1, D6) · ✅ drafted and verified

## The `keptCopies` guard (spec D1, D6): what PR-A builds, and what it leaves alone

**Branch precondition (once, for every task below):** work on `feat/c140-c49-step2-code-fixes`, cut from `docs/c140-c40-buys-merged-handoff`. Every commit message below ends with the attribution trailer that the executing session's system reminder specifies. Run every Python command with `python3 -B` so no `__pycache__` lands in the tree. Every command starts from the repo root; a step that needs another directory `cd`s into it in the same command.

**What ships:** one new refusal kind, `kept`, decided in `sources.py` at artwork resolution. The driver gets operator wording, the config validator gets one rule, and `figure-text.config.json` gets an **empty** `keptCopies` table plus its `_keptCopies` doc string. PR-A adds no entry, touches no media and no sidecar, and leaves `COMPOSER_VERSION` alone.

**Why resolution is the right place (read from code, then confirmed by a test):** `--force` suppresses only `skipped-current` (`tools/figure-run.js` around line 2032). A refused figure becomes `unresolved` before prepare (around 2124), and `processFigureLive` returns before compose unless the outcome is `translated` (around 1458). So one refusal in `resolve_detail` holds on all three routes: a plain run, `--stale` and `--force`. **Measured in a scratch mirror:** the three new paid-harness tests in Task 2 pass against HEAD's unchanged `figure-run.js` once their two wording assertions are removed. That covers the kept copy's bytes, a same-run control figure recomposed or bought, `VERDICT ok`, and both summary lines. The driver already handles any refusal kind generically. Its only change is the `refusalReason` sentence, and that sentence is what makes the Task 2 tests red on HEAD.

**Decisions taken here:**
1. **Resolution order: `retired` → `kept` → `superseded` → pins → lookup.** `kept` comes before `superseded` for the reason `retired` already does: a figure may be in both tables. It then prints `REFUSED — kept`, so `scripts/chemistry-autorun-chapter.sh:207-208` (`grep -q "REFUSED — superseded" … && halt`) does not halt over a copy a ruling has already settled. `kept` comes before pins so a pin can never recompose a kept copy.
2. **kept ∩ superseded is ALLOWED,** as retired ∩ superseded is today (BlastFurn, Ques11ans). `supersededArtwork` is about the SOURCE drawing and `keptCopies` is about the translated COPY. Tests pin both sides: a `sources.py` check that kept wins, and a validator CONTROL that the overlap passes.
3. **kept ∩ retired is REFUSED by the validator,** by any spelling (the fold): one ruling removes the copy the other keeps. At run time `retired` is checked first. Either kind refuses, and nothing is composed.
4. **kept ∩ artworkPins is REFUSED by the validator,** through the existing pin-overlap loop. Its message reads `artworkPins.<k> is also in keptCopies (<k>) — that pin can never apply`.
5. **The validator rule is the inverse of retired's.** A kept key must name exactly one book's image, by exact name and by fold. It must have ≥ 1 `image-mapping.json` row whose `originalImage` is the key, and a `<key>_IS.<ext>` at the top of that book's `media/`. Its reason must run over 40 characters. `buildValidatorCorpus` measures `keptState` with the same code it uses for `retiredState`, refactored into one `copyState` helper.
6. **No sidecar rule.** The spec deletes a kept figure's sidecar in PR-B's restore commit. A kept figure that still has a current sidecar reads `skipped-current`, which is harmless. Its only cost is the review badge and panel that D1 names (see the PR-B handoff below).

**No change, with the mechanism named:**
- **`tools/generate-image-mapping.js`:** a mapping row is derived from a translated copy present in `media/`, skipping only `retiredFigures`. A kept copy stays in `media/`, so its row stays.
- **`tools/retire-translated-figure.js`:** `--retire` refuses any name without a `retiredFigures` entry (line 164). The validator refuses kept ∩ retired. `--prune` deletes only published copies that no mapping row names, and a kept figure keeps its row. **Residual:** the retire tool does not run the validator, so a config holding the same name in both tables could be `--apply`'d before `npm test` sees it. That is recoverable, because the tool deletes only files git tracks unmodified, and the validator then names the figure three times. Not built around.
- **`scripts/chemistry-autorun-chapter.sh`:** it halts only on the literal `REFUSED — superseded` (207–208). A kept figure prints `⚠️ REFUSED — kept: <name>: <reason>` plus the `readers still see an earlier translated copy` line. Its bucket regex (204) already lists `unresolved`, and `unresolved` is a NOTE in `verdict()` (`tools/lib/figure-outcomes.js:144`), so the exit stays 0.
- **The resolver's other callers** (`read-layer-*.py`, `text-coverage-census.py`, `read_layer_accept.py`, three tests) call `S.resolve` without any policy table, today too. Only `figure-run.js`, through `sources.py --json`, applies policy. Unchanged.

**Pins a new kind could break (grepped, nothing else found):**
- `test_sources.py:363-365` asserts `policy()` returns exactly `{superseded, retired, pins}`.
- `test_sources.py:370` loops over three table names.
- `test_sources.py:379-380` pins the absent/null CONTROL as a three-key dict.

All three are updated in Task 1. `tools/__tests__/figure-outcomes.test.js:129-134` pins the NOTE phrase `a retired figure, or an artwork pin that does not hold`, which Task 2 rewrites in the same step as the code. `tools/__tests__/figure-text-config.test.js:25` iterates `['retiredFigures', 'artworkPins']`, extended in Task 4. **No test pins the sidecar count 461:** `grep -arnE "\b461\b" tools/__tests__ server/__tests__ experiments/figure-text-translation/test_*.py scripts/` returns 0 lines. The same grep for `\b600\b` finds `figure-config-validate.test.js:601`, so the grep can see a pinned number. The `refusalReason` fallback test uses `'some-new-kind'`, so it is not a closed enumeration.

**Files this section shares with other PR-A sections:** `experiments/figure-text-translation/figure-text.config.json` (Task 4 inserts before `"artworkPins": {`) and `tools/lib/figure-config-validate.js` (the `TABLES` line, if `heldBlockValues` is ever validated there). Apply the sections in one order and re-read each anchor before editing.

### Task 1: `sources.py` refuses a `keptCopies` figure as `kept`, right after `retired`

**Files:**
- Modify: `experiments/figure-text-translation/sources.py`. `resolve_detail` signature and docstring (lines 298–313 at HEAD); a new block after the `retired` refusal (which ends at line 331); `resolve` (436–441); `resolve_report` (447–448, 464–465); `human_report` (469, 478–479); `_POLICY_TABLES` (505–506); the `policy` docstring (514)
- Modify: `experiments/figure-text-translation/README.md` (76–77, 88–91, 98)
- Test: `experiments/figure-text-translation/test_sources.py`. Three existing `policy()` pins (363–380), and a new block inserted after line 401

**Interfaces:**
- Consumes: the config table `keptCopies: {"<basename>": "<reason string>"}`, read through `policy(cfg)` (`_POLICY_TABLES`)
- Produces: the keyword-only `kept=None` on `resolve_detail`, `resolve`, `resolve_report` and `human_report`. `policy(cfg)` gains the key `'kept'`, and a non-object `keptCopies` raises `SystemExit("keptCopies in the figure config must be an object …")`. The refusal is `{'path': None, 'refused': 'kept', 'edition': None, 'candidates': [], 'reason': <str>}`, where an empty or null reason gives `'(no reason recorded)'`. Keys fold through `_normkey`, and a key acts by its presence. Order: retired → kept → superseded → pins → lookup. `sources.py --json` emits this refusal, and `tools/figure-run.js` consumes it (Task 2).

**Line numbers in this task are HEAD's.** Earlier steps insert lines and shift every later anchor, so match each edit on the quoted text, not on the number. Every quoted "replace" block occurs exactly once at HEAD (checked).

- [ ] **Step 1: Update the three `policy()` pins in `test_sources.py`**

Replace (lines 363–367):
```python
    check('㊵ policy() takes its tables from the config',
          S.policy({'supersededArtwork': {'a': 'x'}, 'retiredFigures': {'b': 'y'},
                    'artworkPins': {'c': {}}}),
          {'superseded': {'a': 'x'}, 'retired': {'b': 'y'}, 'pins': {'c': {}}})
    # R3 — A TABLE THAT IS NOT AN OBJECT FAILS CLOSED, AND THE SAME WAY FOR ALL THREE. A string
```
with:
```python
    check('㊵ policy() takes its tables from the config',
          S.policy({'supersededArtwork': {'a': 'x'}, 'retiredFigures': {'b': 'y'},
                    'artworkPins': {'c': {}}, 'keptCopies': {'d': 'z'}}),
          {'superseded': {'a': 'x'}, 'retired': {'b': 'y'}, 'pins': {'c': {}},
           'kept': {'d': 'z'}})
    # R3 — A TABLE THAT IS NOT AN OBJECT FAILS CLOSED, AND THE SAME WAY FOR ALL FOUR. A string
```
Replace (line 370):
```python
    for table in ('supersededArtwork', 'retiredFigures', 'artworkPins'):
```
with:
```python
    for table in ('supersededArtwork', 'retiredFigures', 'artworkPins', 'keptCopies'):
```
Replace (lines 379–380):
```python
    check('㊵ CONTROL: an absent or null table is no table',
          S.policy({'retiredFigures': None}), {'superseded': None, 'retired': None, 'pins': None})
```
with:
```python
    check('㊵ CONTROL: an absent or null table is no table',
          S.policy({'retiredFigures': None}),
          {'superseded': None, 'retired': None, 'pins': None, 'kept': None})
```

- [ ] **Step 2: Add the ㊾ block to `test_sources.py`**

Insert it after these lines (400–401) and their blank line, before `# §C140 ㊵ — THE SAME LITERAL TABLE AS tools/__tests__/figure-text-config.test.js. Two implementations`:
```python
    check('㊵ run_cli with too few arguments exits with the usage text',
          raised.startswith('Resolve a figure basename'), True)
```
The block (it reuses `make_eps`, `json`, `S`, `resolve`, `resolve_detail`, `resolve_report` and `human_report`, all already imported above it):
```python

# ---------------------------------------------------------------------------
# §C140 ㊾ — A KEPT COPY IS REFUSED BEFORE ANY LOOKUP, RIGHT AFTER `retired` (spec 2026-10-02 D1).
# Kept is about the TRANSLATED COPY too, and is the inverse of retired: a [USER] ruling keeps the
# copy readers are served, so no run may recompose or buy over it. It is checked before
# `superseded` (a figure may be in both: the source drawing is superseded, the kept copy is not
# drawn from it), so the run prints `REFUSED — kept` and the chapter autorun's halt on
# `REFUSED — superseded` does not fire; and before any pin, so a pin cannot bring it back.
# ---------------------------------------------------------------------------
with tempfile.TemporaryDirectory() as td:
    td = Path(td)
    old, new = td / 'first-edition', td / 'updates-2e'
    old.mkdir(); new.mkdir()
    trees = {'first-edition': str(old), 'updates-2e': str(new)}
    prec = ['updates-2e', 'first-edition']
    make_eps(old / 'CNX_Kept.eps', 300, 200)
    make_eps(old / 'CNX_Other.eps', 300, 200)
    make_eps(old / 'Drawing_k.eps', 320, 210)       # a pin target that is no figure's basename
    K = {'CNX_Kept': 'kept by a test ruling: the June copy readers are served stays as it is'}
    R = {'CNX_Kept': 'retired by a test ruling: readers get the English figure instead'}
    SUP = {'CNX_Kept': 'its only vector is known to be superseded (a test reason)'}
    PINS = {'CNX_Kept': {'kind': 'override', 'edition': 'first-edition', 'file': 'Drawing_k.eps',
                         'reason': 'a pin reason that is long enough to be a real reason (test)'}}

    d = resolve_detail('CNX_Kept', trees, prec, kept=K)
    check('㊾ a kept figure is refused before any lookup, with its reason',
          (d['path'], d['refused'], d['edition'], d['candidates'], d['reason']),
          (None, 'kept', None, [], K['CNX_Kept']))
    check('㊾ CONTROL: without the table the same figure resolves',
          Path(resolve_detail('CNX_Kept', trees, prec)['path']).name, 'CNX_Kept.eps')
    check('㊾ kept is checked BEFORE superseded: a figure may be in both, and prints kept',
          resolve_detail('CNX_Kept', trees, prec, superseded=SUP, kept=K)['refused'], 'kept')
    check('㊾ kept is checked BEFORE a pin: a pin can never recompose a kept copy',
          resolve_detail('CNX_Kept', trees, prec, kept=K, pins=PINS)['refused'], 'kept')
    check('㊾ CONTROL: that pin alone does resolve the figure, through the pin',
          resolve_detail('CNX_Kept', trees, prec, pins=PINS).get('via'), 'override')
    check('㊾ retired is checked before kept (an overlap the config validator refuses)',
          resolve_detail('CNX_Kept', trees, prec, retired=R, kept=K)['refused'], 'retired')
    check('㊾ kept keys fold case and punctuation, like the lookup',
          resolve_detail('cnx-kept', trees, prec, kept=K)['refused'], 'kept')
    d = resolve_detail('CNX_Kept', trees, prec, kept={'CNX_Kept': ''})
    check('㊾ an entry acts by its PRESENCE: an empty reason still refuses',
          (d['refused'], d['reason']), ('kept', '(no reason recorded)'))
    check('㊾ CONTROL: another figure is untouched by the table',
          Path(resolve_detail('CNX_Other', trees, prec, kept=K)['path']).name, 'CNX_Other.eps')
    check('㊾ resolve() returns (None, None) for a kept figure',
          resolve('CNX_Kept', trees, prec, kept=K), (None, None))
    check('㊾ resolve_report carries the kept refusal',
          resolve_report(['CNX_Kept'], trees, prec, kept=K)['CNX_Kept']['refused'], 'kept')
    lines, missing, refused = human_report(['CNX_Kept', 'CNX_Other'], trees, prec, kept=K)
    check('㊾ the human report prints REFUSED — kept with its reason, and counts it',
          (any('REFUSED — kept: kept by a test ruling' in l for l in lines), missing, refused),
          (True, 0, 1))

    # Both command-line modes, through the same seam as the ㊵ block above.
    local = td / 'sources.local.json'
    local.write_text(json.dumps({'testbook': trees}))
    cfg = {'editionPrecedence': prec, 'sourceTreesFile': str(local), 'keptCopies': K}
    out = []
    rc = S.run_cli(['--json', 'testbook', 'CNX_Kept', 'CNX_Other'], cfg=cfg, out=out.append)
    rep = json.loads(out[0])
    check('㊾ run_cli --json applies keptCopies, leaves the control alone, and exits 0',
          (rc, rep['CNX_Kept']['refused'], rep['CNX_Kept']['reason'],
           Path(rep['CNX_Other']['path']).name),
          (0, 'kept', K['CNX_Kept'], 'CNX_Other.eps'))
    out = []
    rc = S.run_cli(['testbook', 'CNX_Kept', 'CNX_Other'], cfg=cfg, out=out.append)
    check('㊾ run_cli human mode applies it too, and exits 1 on the refusal',
          (rc, 'REFUSED — kept' in out[0], 'CNX_Other.eps' in out[0]), (1, True, True))
    out = []
    S.run_cli(['--json', 'testbook', 'CNX_Kept'], cfg=dict(cfg, keptCopies={}), out=out.append)
    check('㊾ CONTROL: an EMPTY keptCopies table (what PR-A ships) refuses nothing',
          Path(json.loads(out[0])['CNX_Kept']['path']).name, 'CNX_Kept.eps')

```

- [ ] **Step 3: Run it and watch it fail for the right reason**

Run: `cd experiments/figure-text-translation && FIGTEXT_PYLIBS=./pylibs python3 -B test_sources.py; echo EXIT=$?`

Expected (measured on a scratch copy of HEAD's `sources.py`): exactly 5 `FAIL` lines, then a traceback, and `EXIT=1`. The final `N FAILED` line never prints, because the traceback ends the script.
- `FAIL  ㊵ policy() takes its tables from the config: {'superseded': …, 'retired': …, 'pins': …}`: HEAD's `policy()` has no `kept` key.
- `FAIL  ㊵ policy() refuses keptCopies given as a string|a list|a number, naming the table: False`, three times: HEAD's `policy()` never reads `keptCopies`, so nothing raises.
- `FAIL  ㊵ CONTROL: an absent or null table is no table: {…three keys…}`
- `TypeError: resolve_detail() got an unexpected keyword argument 'kept'`: the parameter does not exist yet.

- [ ] **Step 4: Implement the `kept` refusal in `sources.py`**

(a) Signature and docstring. Replace lines 298–313:
```python
def resolve_detail(basename, trees, precedence, exts=SOURCE_EXTS, superseded=None, _memo=None,
                   size_of=page_size, *, retired=None, pins=None):
    """-> {'path', 'edition'[, 'via'][, 'pageUnknown']} | None (a hole) | a refusal (see below).

    Precedence is over EDITIONS first, then over formats within an edition: a 2nd-edition EPS
    beats a 1st-edition PDF, because the edition is a question of WHICH PICTURE and the format
    only of how we read it.

    Checked BEFORE any lookup, in this order (§C140 ㊵): `retired` (a ruling retired the
    figure's TRANSLATED COPY), then `superseded` (its only vector is known to be superseded).
    Then a pin, if the figure has one in `pins` (§C140 ㊵): its one exact file, or a refusal —
    never the normal lookup's answer. A pinned hit carries 'via': 'alias'|'override', and a pin
    refusal is 'pin-conflict'|'pin-missing'|'pin-invalid'.

    A refusal is {'path': None, 'refused': 'retired'|'superseded'|'production-page'|
    'pin-conflict'|'pin-missing'|'pin-invalid', 'edition', 'candidates', 'reason'}. Each candidate
```
with:
```python
def resolve_detail(basename, trees, precedence, exts=SOURCE_EXTS, superseded=None, _memo=None,
                   size_of=page_size, *, retired=None, pins=None, kept=None):
    """-> {'path', 'edition'[, 'via'][, 'pageUnknown']} | None (a hole) | a refusal (see below).

    Precedence is over EDITIONS first, then over formats within an edition: a 2nd-edition EPS
    beats a 1st-edition PDF, because the edition is a question of WHICH PICTURE and the format
    only of how we read it.

    Checked BEFORE any lookup, in this order (§C140 ㊵, ㊾): `retired` (a ruling retired the
    figure's TRANSLATED COPY), then `kept` (a ruling KEEPS its translated copy as it is), then
    `superseded` (its only vector is known to be superseded).
    Then a pin, if the figure has one in `pins` (§C140 ㊵): its one exact file, or a refusal —
    never the normal lookup's answer. A pinned hit carries 'via': 'alias'|'override', and a pin
    refusal is 'pin-conflict'|'pin-missing'|'pin-invalid'.

    A refusal is {'path': None, 'refused': 'retired'|'kept'|'superseded'|'production-page'|
    'pin-conflict'|'pin-missing'|'pin-invalid', 'edition', 'candidates', 'reason'}. Each candidate
```
(b) The `kept` block. After the end of the `retired` refusal (lines 329–331 and the blank line after them):
```python
            return {'path': None, 'refused': 'retired', 'edition': None, 'candidates': [],
                    'reason': reason if isinstance(reason, str) and reason.strip()
                    else '(no reason recorded)'}

```
insert, before the `# 🔴 KNOWN-SUPERSEDED ARTWORK IS REFUSED BEFORE ANY LOOKUP.` comment:
```python
    # 🔴 §C140 ㊾ — A KEPT COPY IS REFUSED NEXT, ALSO BEFORE `superseded` AND BEFORE ANY LOOKUP.
    # Kept is the inverse of retired, and is about the TRANSLATED COPY too: a [USER] ruling keeps
    # the copy readers are served (its image-mapping row and its `_IS` file stay), so no run may
    # recompose it, buy it or publish over it. Refusing HERE, at resolution, is what makes that
    # hold on every route: `--force` suppresses only `skipped-current`, `--stale` recomposes what
    # resolves, and a plain run buys what resolves and has no sidecar — so a kept figure needs no
    # sidecar as a re-buy lock (spec 2026-10-02 D1). Checked before `superseded`, as retired is:
    # a figure may be in both, and `REFUSED — kept` keeps the chapter autorun's halt on
    # `REFUSED — superseded` from firing over a copy a ruling has already settled. A key acts by
    # its PRESENCE, as in `retired`.
    if kept:
        folded = {_normkey(k): v for k, v in kept.items()}
        key = _normkey(basename)
        if key in folded:
            reason = folded[key]
            return {'path': None, 'refused': 'kept', 'edition': None, 'candidates': [],
                    'reason': reason if isinstance(reason, str) and reason.strip()
                    else '(no reason recorded)'}

```
(c) `resolve`. Replace lines 436–441:
```python
def resolve(basename, trees, precedence, exts=SOURCE_EXTS, superseded=None, _memo=None,
            size_of=page_size, *, retired=None, pins=None):
    """-> (Path, edition_key) for the authoritative source, or (None, None) for a hole or a
    refusal. `resolve_detail` says which."""
    d = resolve_detail(basename, trees, precedence, exts, superseded=superseded, _memo=_memo,
                       size_of=size_of, retired=retired, pins=pins)
```
with:
```python
def resolve(basename, trees, precedence, exts=SOURCE_EXTS, superseded=None, _memo=None,
            size_of=page_size, *, retired=None, pins=None, kept=None):
    """-> (Path, edition_key) for the authoritative source, or (None, None) for a hole or a
    refusal. `resolve_detail` says which."""
    d = resolve_detail(basename, trees, precedence, exts, superseded=superseded, _memo=_memo,
                       size_of=size_of, retired=retired, pins=pins, kept=kept)
```
(d) `resolve_report`. Replace lines 447–448:
```python
def resolve_report(names, trees, precedence, exts=SOURCE_EXTS, superseded=None, *, retired=None,
                   pins=None):
```
with:
```python
def resolve_report(names, trees, precedence, exts=SOURCE_EXTS, superseded=None, *, retired=None,
                   pins=None, kept=None):
```
and lines 464–465:
```python
        out[n] = resolve_detail(n, trees, precedence, exts, superseded=superseded, _memo=memo,
                                retired=retired, pins=pins)
```
with:
```python
        out[n] = resolve_detail(n, trees, precedence, exts, superseded=superseded, _memo=memo,
                                retired=retired, pins=pins, kept=kept)
```
(e) `human_report`. Replace line 469:
```python
def human_report(names, trees, precedence, superseded=None, *, retired=None, pins=None):
```
with:
```python
def human_report(names, trees, precedence, superseded=None, *, retired=None, pins=None,
                 kept=None):
```
and lines 478–479:
```python
    report = resolve_report(names, trees, precedence, superseded=superseded, retired=retired,
                            pins=pins)
```
with:
```python
    report = resolve_report(names, trees, precedence, superseded=superseded, retired=retired,
                            pins=pins, kept=kept)
```
(f) The policy table. Replace lines 505–506:
```python
_POLICY_TABLES = (('supersededArtwork', 'superseded'), ('retiredFigures', 'retired'),
                  ('artworkPins', 'pins'))
```
with:
```python
_POLICY_TABLES = (('supersededArtwork', 'superseded'), ('retiredFigures', 'retired'),
                  ('keptCopies', 'kept'), ('artworkPins', 'pins'))
```
(g) The `policy` docstring. Replace line 514:
```python
    🔴 A TABLE THAT IS NOT AN OBJECT REFUSES THE WHOLE RUN (R3), the same way for all three. A
```
with:
```python
    🔴 A TABLE THAT IS NOT AN OBJECT REFUSES THE WHOLE RUN (R3), the same way for all four. A
```
(h) The pin-block comment (verifier fix). Find the two-line comment above the pin check that says a pin is checked after `retired` AND `superseded`, and replace it with:
```python
    # 🔴 §C140 ㊵, ㊾ — AN ARTWORK PIN IS CHECKED AFTER `retired`, `kept` AND `superseded`, so a pin can never
    # bring back a figure any of those tables refuses.
```
It is a comment, so `test_sources.py` is unaffected.

`run_cli` needs no edit. It already passes `**policy(cfg)` to both modes, so `kept` reaches `--json` and the human report through (f).

- [ ] **Step 5: Run it and watch it pass**

Run: `cd experiments/figure-text-translation && FIGTEXT_PYLIBS=./pylibs python3 -B test_sources.py; echo EXIT=$?`

Expected: last line `ALL PASS`, then `EXIT=0`. `FIGTEXT_PYLIBS=./pylibs python3 -B test_sources.py | grep -c '^  PASS  '` prints `165` (HEAD prints `147`: +3 `keptCopies` fail-closed checks, +15 ㊾ checks). Measured on the scratch mirror. ⚠️ This suite runs in no CI job (㊷②), so this local run is its only gate.

- [ ] **Step 6: Bring the README's rule list up to five**

In `experiments/figure-text-translation/README.md`, replace lines 76–77:
```markdown
**§C140 ㊵ — four rules decide what the resolver may return, in this order; the fourth is the normal
lookup** (design: `docs/superpowers/specs/2026-10-01-c140-c40-retire-and-pins-design.md`):
```
with:
```markdown
**§C140 ㊵, ㊾ — five rules decide what the resolver may return, in this order; the fifth is the normal
lookup** (designs: `docs/superpowers/specs/2026-10-01-c140-c40-retire-and-pins-design.md`; for
`keptCopies`, D1 of `docs/superpowers/specs/2026-10-02-c140-step2-recompose-pass-design.md`):
```
Replace lines 88–91:
```markdown
2. **`supersededArtwork`** — the only vector in the delivery is known to be superseded by the published
   figure: refused as `superseded`. A figure may be in both 1 and 2; retired wins. Like the other two
   tables, a key acts by its presence: an entry whose reason is empty or null still refuses.
3. **`artworkPins`** — the ONE file a figure's artwork comes from, as a tree key plus a path inside it.
```
with:
```markdown
2. **`keptCopies`** — a [USER] ruling KEEPS the figure's *translated copy* as it is, the inverse of 1:
   refused as `kept`, so no run recomposes it, buys it again or publishes over it, on plain, `--stale`
   and `--force` runs alike. Its image-mapping row and its `_IS` file stay, and the validator requires
   both. The refusal is the re-buy lock, so a kept figure needs no sidecar.
3. **`supersededArtwork`** — the only vector in the delivery is known to be superseded by the published
   figure: refused as `superseded`. A figure may also be in 1 or 2, and then that rule wins (so the run
   prints `REFUSED — retired` or `REFUSED — kept`). Like the other tables, a key acts by its presence:
   an entry whose reason is empty or null still refuses.
4. **`artworkPins`** — the ONE file a figure's artwork comes from, as a tree key plus a path inside it.
```
Replace line 98's opening:
```markdown
4. **The normal lookup** — for each edition in `editionPrecedence` order: its exact names in
```
with:
```markdown
5. **The normal lookup** — for each edition in `editionPrecedence` order: its exact names in
```

- [ ] **Step 7: Commit**

```bash
git add experiments/figure-text-translation/sources.py experiments/figure-text-translation/test_sources.py experiments/figure-text-translation/README.md
git commit -F - <<'EOF'
feat(figures): §C140 ㊾ — sources.py refuses a keptCopies figure as `kept`, right after `retired`

A [USER] ruling can now KEEP a figure's translated copy as it is (spec 2026-10-02 D1), the
inverse of retiredFigures. The refusal happens at resolution, before superseded, pins and any
lookup, so it holds on plain, --stale and --force runs alike and a kept figure needs no
sidecar as a re-buy lock. kept-before-superseded keeps the chapter autorun's halt on
`REFUSED — superseded` quiet for a copy a ruling has settled. test_sources.py: 147 -> 165
checks, ALL PASS; the three policy() pins now name four tables.
EOF
```

### Task 2: the driver names a `kept` refusal, and a paid-harness test proves the kept copy survives every route

**Files:**
- Modify: `tools/figure-run.js`. A `kept` branch in `refusalReason` after the `retired` branch (lines 1690–1692 at HEAD), and the `artworkRefusal` field comment (1960–1962)
- Modify: `tools/lib/figure-outcomes.js`. The `unresolved` NOTE in `verdict()` (146–149)
- Test: `tools/__tests__/figure-run-free.test.js`. A new test inserted before line 645, `it('keeps the reason for a refusal kind it does not know (§C140 ㊵)'`
- Test: `tools/__tests__/figure-outcomes.test.js`. Lines 129–134, the NOTE-phrase pin, rewritten
- Test: `tools/__tests__/figure-run-paid.test.js`. A new `describe` appended after the file's last line (2565)

**Interfaces:**
- Consumes: the refusal `{'path': null, 'refused': 'kept', 'edition': null, 'candidates': [], 'reason'}` that `sources.py --json` emits (Task 1), through `resolveArtwork` → `rec.artworkRefusal`
- Produces: `refusalReason({refused: 'kept', reason})`, which returns exactly `` `REFUSED, not missing: its translated copy is kept by ruling, so no run recomposes, re-buys or overwrites it — ${reason}` ``. `verdict()`'s `unresolved` NOTE now names `a translated copy kept by ruling` among the refusal causes. Unchanged and relied on: the summary line `  ⚠️ REFUSED — kept: <name>: <reason>` (generic branch, `summarise`, around line 2444) and `  ⚠️ readers still see an earlier translated copy of <name>: media/<name>_IS.svg (mapping row present) — refusing does not retire it`

- [ ] **Step 1: The unit test for the sentence (`figure-run-free.test.js`)**

Insert before line 645 (`  it('keeps the reason for a refusal kind it does not know (§C140 ㊵)', () => {`):
```js
  // §C140 ㊾ — a copy a ruling KEEPS. Pinned whole: the generic fallback below would print
  // "REFUSED, not missing: kept — …", which says nothing about what no run may do to the copy.
  it('describes a kept refusal by what no run will do to the copy (§C140 ㊾)', () => {
    expect(refusalReason({ refused: 'kept', reason: 'the ruling text' })).toBe(
      'REFUSED, not missing: its translated copy is kept by ruling, so no run recomposes, ' +
        're-buys or overwrites it — the ruling text'
    );
  });

```

- [ ] **Step 2: Rewrite the NOTE-phrase pin (`figure-outcomes.test.js`)**

Replace lines 129–134:
```js
  it('names a retired figure and an artwork pin among the refusal causes (§C140 ㊵)', () => {
    const t = { ...emptyTally(), translated: 5, unresolved: 3 };
    expect(verdict(t, sum(t)).reasons.join(' ')).toMatch(
      /a retired figure, or an artwork pin that does not hold/
    );
  });
```
with:
```js
  it('names a retired figure, a kept copy and an artwork pin among the refusal causes (§C140 ㊵, ㊾)', () => {
    const t = { ...emptyTally(), translated: 5, unresolved: 3 };
    expect(verdict(t, sum(t)).reasons.join(' ')).toMatch(
      /a retired figure, a translated copy kept by ruling, or an artwork pin that does not hold/
    );
  });
```

- [ ] **Step 3: The route test (`figure-run-paid.test.js`)**

Append after the file's last three lines (2563–2565):
```js
    expect(text).toMatch(/FIG_ODD\s+billable count UNKNOWN/);
  });
});
```
this block. Everything it uses is already imported or defined at file scope: `makeBook`, `fakeSpawn` (with `outDirsFor`), `live`, `rec`, `currentSidecar`, `computeRenderHash`, `sidecarPath`, `summarise`, `runFigures`, `fs` and `path`.
```js

// ─────────────────────────────────────────────────────────────────────────────────────────
// 🔴 §C140 ㊾ (spec 2026-10-02 D1) — A KEPT COPY SURVIVES EVERY ROUTE, BYTE FOR BYTE.
// sources.py refuses a `keptCopies` figure as `kept` at RESOLUTION; the fake resolver here returns
// exactly that shape (test_sources.py pins it). Three routes reach a figure, and each is run with
// a CONTROL figure in the SAME run that the same route does recompose or buy — so "the kept copy
// is unchanged" cannot pass because the route did nothing at all:
//   --stale over a bumped sidecar (what the '4' → '5' bump makes of every sidecar);
//   --force over a current sidecar (--force suppresses only `skipped-current`);
//   a plain run over a figure with NO sidecar (a kept figure's sidecar is deleted in its restore
//   commit, so the refusal, not a sidecar, is what stops a buy).
// ⚠️ The plumbing is borrowed: the bumped shape from 'a COMPOSER_VERSION bump recomposes ONCE',
// the --force arm from '--stale and --force never RE-buy', the plain buy from the minting tests.
// ─────────────────────────────────────────────────────────────────────────────────────────
describe('§C140 ㊾ — a kept copy is never recomposed, never bought over, on any route', () => {
  const KEEP_REASON =
    '[USER] ruled (test): the June copy readers are served is kept as it is, never recomposed';
  const KEPT = { path: null, refused: 'kept', edition: null, candidates: [], reason: KEEP_REASON };
  const keepFigA = {
    resolve: (n) =>
      n === 'FIG_A' ? KEPT : { path: `/fake/artwork/${n}.pdf`, edition: 'first-edition' },
  };
  const rows = [
    { originalImage: 'FIG_A', outputName: 'FIG_A_IS.svg', extension: '.svg' },
    { originalImage: 'FIG_B', outputName: 'FIG_B_IS.svg', extension: '.svg' },
  ];
  // A root <svg> with a viewBox that is no paper size, so `paperSheetCopy` reads it cleanly and
  // adds no line of its own to the report.
  const JUNE = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 200" id="june-A"/>';
  const blocks = { k0: 'IS k0', k1: 'IS k1' };
  const OLD = '0';
  const bumpedSidecar = (basename) => {
    const h = computeRenderHash(blocks, OLD);
    return {
      version: 1,
      basename,
      renderHash: h,
      composedHash: h,
      composerVersion: OLD,
      composedVersion: OLD,
      blocks,
    };
  };
  const plantCopies = (bookDir) => {
    fs.writeFileSync(path.join(bookDir, 'media', 'FIG_A_IS.svg'), JUNE);
    fs.writeFileSync(
      path.join(bookDir, 'media', 'FIG_B_IS.svg'),
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 200" id="old-B"/>'
    );
  };
  const copyOf = (bookDir, b) =>
    fs.readFileSync(path.join(bookDir, 'media', `${b}_IS.svg`), 'utf-8');

  it.each([
    ['--stale over a bumped sidecar', { stale: true }, bumpedSidecar],
    ['--force over a current sidecar', { force: true }, (b) => currentSidecar(b, blocks)],
  ])(
    '%s: the kept copy is untouched, and the control figure is recomposed',
    async (_l, over, sidecarOf) => {
      const { booksRoot, bookDir } = makeBook({
        figures: ['FIG_A', 'FIG_B'],
        mapping: rows,
        sidecars: { FIG_A: sidecarOf('FIG_A'), FIG_B: sidecarOf('FIG_B') },
      });
      plantCopies(bookDir);
      const spawn = fakeSpawn(keepFigA);
      const result = await runFigures(live(booksRoot, over), { spawn, booksRoot });

      const a = rec(result, 'FIG_A');
      expect(a.outcome).toBe('unresolved');
      expect(a.artworkRefusal.refused).toBe('kept');
      expect(a.reason).toBe(
        'REFUSED, not missing: its translated copy is kept by ruling, so no run recomposes, ' +
          `re-buys or overwrites it — ${KEEP_REASON}`
      );
      expect(copyOf(bookDir, 'FIG_A')).toBe(JUNE);
      expect(spawn.outDirsFor('prepare')).toEqual(['FIG_B']);
      expect(spawn.countOf('translate')).toBe(0);
      // CONTROL, same run: this route really does recompose a figure that is not kept.
      expect(rec(result, 'FIG_B').outcome).toBe('translated');
      expect(spawn.outDirsFor('compose')).toEqual(['FIG_B']);
      expect(copyOf(bookDir, 'FIG_B')).toBe('<svg id="FIG_B"/>');
      expect(result.verdict.ok).toBe(true); // unresolved is a NOTE, never fatal (R9)
      const text = summarise(result);
      expect(text).toContain(`REFUSED — kept: FIG_A: ${KEEP_REASON}`);
      expect(text).toContain(
        'readers still see an earlier translated copy of FIG_A: media/FIG_A_IS.svg (mapping row present)'
      );
    }
  );

  it('a plain run over a kept figure with NO sidecar buys nothing for it; the control is bought', async () => {
    const { booksRoot, bookDir } = makeBook({ figures: ['FIG_A', 'FIG_B'], mapping: rows });
    plantCopies(bookDir);
    const spawn = fakeSpawn(keepFigA);
    const result = await runFigures(live(booksRoot), { spawn, booksRoot });

    expect(rec(result, 'FIG_A').artworkRefusal.refused).toBe('kept');
    expect(rec(result, 'FIG_A').reason).toMatch(/kept by ruling, so no run recomposes, re-buys/);
    expect(copyOf(bookDir, 'FIG_A')).toBe(JUNE);
    expect(fs.existsSync(sidecarPath(bookDir, 'FIG_A'))).toBe(false); // no sidecar was minted
    // CONTROL, same run: a plain run DOES buy a sidecar-less figure that is not kept, so the
    // single translate spawn below is FIG_B's, and none of it is FIG_A's.
    expect(spawn.outDirsFor('translate')).toEqual(['FIG_B']);
    expect(rec(result, 'FIG_B').outcome).toBe('translated');
    expect(fs.existsSync(sidecarPath(bookDir, 'FIG_B'))).toBe(true);
  });
});
```

- [ ] **Step 4: Run them and watch them fail for the right reason**

Run: `npx vitest run tools/__tests__/figure-run-free.test.js tools/__tests__/figure-outcomes.test.js tools/__tests__/figure-run-paid.test.js`

Expected: `Tests  5 failed | 255 passed (260)` across the three files (HEAD: 115 + 39 + 102 = 256; this task adds 4 tests and rewrites 1). Each failure comes from the wording:
- free, `describes a kept refusal…`: received `'REFUSED, not missing: kept — the ruling text'`, from the generic fallback at `figure-run.js:1703`.
- outcomes, `names a retired figure, a kept copy…`: the NOTE does not contain the new phrase.
- paid, both `it.each` arms: fail at `expect(a.reason).toBe(…)`, received `'REFUSED, not missing: kept — [USER] ruled (test): …'`.
- paid, plain run: fails at `.reason).toMatch(/kept by ruling, …/)`.

Measured on a scratch mirror against HEAD's `figure-run.js`, with only those two `reason` assertions removed, all three paid tests PASS. The guard's behaviour is generic in the driver. This task changes wording and adds the proof.

- [ ] **Step 5: Implement the wording**

In `tools/figure-run.js`, replace lines 1690–1692:
```js
  if (refusal.refused === 'retired') {
    return `REFUSED, not missing: retired by ruling, so no translated copy is made again — ${refusal.reason}`;
  }
```
with:
```js
  if (refusal.refused === 'retired') {
    return `REFUSED, not missing: retired by ruling, so no translated copy is made again — ${refusal.reason}`;
  }
  // §C140 ㊾ — the inverse of retired: a ruling KEEPS the translated copy (`keptCopies`). Its
  // mapping row and `_IS` file stay, and the summary's "readers still see" line names them.
  if (refusal.refused === 'kept') {
    return `REFUSED, not missing: its translated copy is kept by ruling, so no run recomposes, re-buys or overwrites it — ${refusal.reason}`;
  }
```
In the same file, replace lines 1960–1962:
```js
    // §C140 ⑦/㊵ — artwork `sources.py` found and REFUSED (a production page, known-superseded,
    // retired, or an artwork pin that does not hold), with its reason. Like a contest it is
    // `unresolved` but is not a hole.
```
with:
```js
    // §C140 ⑦/㊵/㊾ — artwork `sources.py` found and REFUSED (a production page, known-superseded,
    // retired, a translated copy kept by ruling, or an artwork pin that does not hold), with its
    // reason. Like a contest it is `unresolved` but is not a hole.
```
In `tools/lib/figure-outcomes.js`, replace lines 146–149:
```js
      `NOTE (not a failure): ${tally.unresolved} figure(s) unresolved — the artwork delivery has ` +
        `a hole here, or the run refused the artwork it found (two figures sharing one file, a ` +
        `production page, a known-superseded picture, a retired figure, or an artwork pin that ` +
        `does not hold); the report names which`
```
with:
```js
      `NOTE (not a failure): ${tally.unresolved} figure(s) unresolved — the artwork delivery has ` +
        `a hole here, or the run refused the artwork it found (two figures sharing one file, a ` +
        `production page, a known-superseded picture, a retired figure, a translated copy kept ` +
        `by ruling, or an artwork pin that does not hold); the report names which`
```

- [ ] **Step 6: Run them and watch them pass**

Run: `npx vitest run tools/__tests__/figure-run-free.test.js tools/__tests__/figure-outcomes.test.js tools/__tests__/figure-run-paid.test.js`

Expected: `Test Files  3 passed (3)`, `Tests  260 passed (260)`: free 116, outcomes 39, paid 105. (The free file's `git status --porcelain` checks compare before against after, so uncommitted edits do not disturb them.)

- [ ] **Step 7: Format and lint exactly what will be committed**

Run: `npx prettier --check tools/figure-run.js tools/lib/figure-outcomes.js tools/__tests__/figure-run-free.test.js tools/__tests__/figure-outcomes.test.js tools/__tests__/figure-run-paid.test.js && npx eslint tools/figure-run.js tools/lib/figure-outcomes.js tools/__tests__/figure-run-free.test.js tools/__tests__/figure-outcomes.test.js tools/__tests__/figure-run-paid.test.js`

Expected: `All matched files use Prettier code style!` and no eslint output (measured on the mirror; the paid block above is already prettier-formatted). If prettier reports a file, run `npx prettier --write` on it and re-run Step 6 before committing, so the pre-commit hook has nothing to rewrite.

- [ ] **Step 8: Commit**

```bash
git add tools/figure-run.js tools/lib/figure-outcomes.js tools/__tests__/figure-run-free.test.js tools/__tests__/figure-outcomes.test.js tools/__tests__/figure-run-paid.test.js
git commit -F - <<'EOF'
feat(figures): §C140 ㊾ — the driver names a `kept` refusal; a kept copy survives every route

refusalReason gets a `kept` sentence (no run recomposes, re-buys or overwrites the copy), and
the unresolved NOTE lists a copy kept by ruling among the refusal causes. figure-run-paid gains
the proof the guard rests on: under --stale over a bumped sidecar, --force over a current one,
and a plain run with no sidecar, the kept _IS file is byte-identical, nothing is prepared or
bought for it, and a same-run control figure IS recomposed or bought. The driver's refusal path
was already generic: with the wording assertions removed, these tests pass on HEAD.
EOF
```

### Task 3: the config validator checks `keptCopies` as the inverse of `retiredFigures`

**Files:**
- Modify: `tools/lib/figure-config-validate.js`. The header (line 2), `TABLES` (19), the `validateFigureConfig` JSDoc (26–28), the pin-overlap loop (53–55), a new rule after the retired-state rule (after 166), and `buildValidatorCorpus` (170–195)
- Test: `tools/__tests__/figure-config-validate.test.js`. The base fixtures (15–30); rows in the first `it.each` (before its `])('refuses %s'` at 189); rows in the second `it.each` (before 391); the CONTROL `it.each` (412–419); a throwaway-tree test (after 561); a committed-config test (before 593)

**Interfaces:**
- Consumes: the config table `keptCopies` (absent counts as empty; any other non-object is refused); `image-mapping.json` rows (`originalImage`); top-level `<key>_IS.<ext>` files, read through the existing `readMappingOrRefuse` and `topLevelTranslatedCopies`
- Produces: `buildValidatorCorpus(repoRoot, cfg)` returns `{suffix, basenamesByBook, retiredState, keptState}`. `keptState[<key>] = {rows: number, translatedCopies: string[]}` exists only for a key that is exactly one book's image. `validateFigureConfig(cfg, corpus)` requires `corpus.keptState`, and its new problem strings are:
  - `keptCopies must be an object`
  - `keptCopies: <a> and <b> fold to the same key`
  - `keptCopies.<k> names an image in N books' source …`
  - `keptCopies.<k> needs a reason of over 40 characters`
  - `artworkPins.<k> is also in keptCopies (<key>) — that pin can never apply`
  - `keptCopies.<k> is also in retiredFigures (<key>) — a copy cannot be both kept and retired`
  - `keptCopies.<k> has no image-mapping row — readers are not served the copy it keeps`
  - `keptCopies.<k> has no translated copy at the top of its book's media/`

  kept ∩ `supersededArtwork` is allowed.

**Line numbers in this task are HEAD's.** Earlier steps insert lines and shift every later anchor, so match each edit on the quoted text, not on the number. Every quoted "replace" block occurs exactly once at HEAD (checked).

- [ ] **Step 1: Give the base fixtures a valid kept figure**

Replace lines 15–19:
```js
const baseCfg = () => ({
  editionPrecedence: ['updates-2e', 'first-edition'],
  supersededArtwork: { CNX_Sup: R },
  retiredFigures: { CNX_Ret: R },
  artworkPins: {
```
with:
```js
const baseCfg = () => ({
  editionPrecedence: ['updates-2e', 'first-edition'],
  supersededArtwork: { CNX_Sup: R },
  retiredFigures: { CNX_Ret: R },
  keptCopies: { CNX_Kept: R },
  artworkPins: {
```
and replace lines 26–30:
```js
    chem: new Set(['CNX_Sup', 'CNX_Ret', 'CNX_Pin', 'CNX_Other']),
    bio: new Set(['Figure_1']),
  },
  retiredState: { CNX_Ret: { rows: 0, translatedCopies: [] } },
});
```
with:
```js
    chem: new Set(['CNX_Sup', 'CNX_Ret', 'CNX_Kept', 'CNX_Pin', 'CNX_Other']),
    bio: new Set(['Figure_1']),
  },
  retiredState: { CNX_Ret: { rows: 0, translatedCopies: [] } },
  keptState: { CNX_Kept: { rows: 1, translatedCopies: [`CNX_Kept${S}.svg`] } },
});
```

- [ ] **Step 2: Refusal rows in the first `it.each`**

After the row that ends the first table (lines 181–188):
```js
    [
      'a retired figure that still has its translated copy',
      () => {},
      (k) => {
        k.retiredState.CNX_Ret.translatedCopies = [`CNX_Ret${S}.svg`];
      },
      /still has a translated copy/,
    ],
```
and before `  ])('refuses %s', (_label, mutateCfg, mutateCorpus, pattern) => {`, insert:
```js
    // §C140 ㊾ — keptCopies, the inverse of retiredFigures (spec 2026-10-02 D1).
    [
      'a keptCopies table that is not an object',
      (c) => {
        c.keptCopies = [];
      },
      null,
      /keptCopies must be an object/,
    ],
    [
      'a pin on a kept figure',
      (c) => {
        c.artworkPins = { CNX_Kept: pinOf(c) };
      },
      null,
      /artworkPins\.CNX_Kept is also in keptCopies \(CNX_Kept\)/,
    ],
    [
      'a kept figure that is also retired',
      (c) => {
        c.retiredFigures.CNX_Kept = R;
      },
      null,
      /keptCopies\.CNX_Kept is also in retiredFigures \(CNX_Kept\)/,
    ],
    [
      'a kept figure with no image-mapping row',
      () => {},
      (k) => {
        k.keptState.CNX_Kept.rows = 0;
      },
      /keptCopies\.CNX_Kept has no image-mapping row/,
    ],
    [
      'a kept figure with no translated copy',
      () => {},
      (k) => {
        k.keptState.CNX_Kept.translatedCopies = [];
      },
      /keptCopies\.CNX_Kept has no translated copy/,
    ],
    [
      'a kept key that is no book’s image',
      (c) => {
        c.keptCopies.CNX_Typo = R;
      },
      null,
      /keptCopies\.CNX_Typo names an image in 0 books/,
    ],
    [
      'a kept figure with a short reason',
      (c) => {
        c.keptCopies.CNX_Kept = 'kept, see §C140';
      },
      null,
      /keptCopies\.CNX_Kept needs a reason of over 40 characters/,
    ],
```

- [ ] **Step 3: Fold and null rows in the second `it.each`**

After the row that ends the second table (lines 383–390):
```js
    [
      'a retired figure that is no book’s image, and so has no state',
      (c) => {
        c.retiredFigures.CNX_Gone = R;
      },
      null,
      /retiredFigures\.CNX_Gone names an image in 0 books/,
    ],
```
and before its `  ])('refuses %s', (_label, mutateCfg, mutateCorpus, pattern) => {`, insert:
```js
    [
      'a keptCopies table that is null',
      (c) => {
        c.keptCopies = null;
      },
      null,
      /keptCopies must be an object/,
    ],
    [
      'a pin whose key only FOLDS onto a kept key',
      (c) => {
        c.artworkPins = { 'cnx-kept': pinOf(c) };
      },
      null,
      /artworkPins\.cnx-kept is also in keptCopies \(CNX_Kept\)/,
    ],
    [
      'a kept key that only FOLDS onto a retired key',
      (c) => {
        c.retiredFigures['cnx-kept'] = R;
      },
      null,
      /keptCopies\.CNX_Kept is also in retiredFigures \(cnx-kept\)/,
    ],
    [
      'two keptCopies keys that fold together',
      (c) => {
        c.keptCopies['CNX-Kept'] = R;
      },
      null,
      /keptCopies: CNX_Kept and CNX-Kept fold to the same key/,
    ],
```

- [ ] **Step 4: The CONTROLs: an absent table, and kept ∩ superseded**

Replace lines 412–419:
```js
    [
      'a config with none of the three tables (an absent table is an empty one)',
      (c) => {
        delete c.supersededArtwork;
        delete c.retiredFigures;
        delete c.artworkPins;
      },
    ],
```
with:
```js
    [
      'a config with none of the four tables (an absent table is an empty one)',
      (c) => {
        delete c.supersededArtwork;
        delete c.retiredFigures;
        delete c.keptCopies;
        delete c.artworkPins;
      },
    ],
    // §C140 ㊾ — ALLOWED, as retired + superseded is (BlastFurn, Ques11ans): superseded is about the
    // SOURCE drawing, kept about the translated COPY. sources.py checks kept first, so the run
    // prints `REFUSED — kept` and the chapter autorun's halt on `REFUSED — superseded` stays quiet.
    [
      'a kept figure that is also superseded',
      (c) => {
        c.supersededArtwork.CNX_Kept = R;
      },
    ],
```

- [ ] **Step 5: `keptState` measured on a throwaway tree**

After lines 558–561, which are the last test of `describe('buildValidatorCorpus on a throwaway books/ tree …')`:
```js
  it('refuses a mapping it cannot parse instead of reading it as no rows', () => {
    const root = makeRepo({ b1: { images: ['CNX_Row'], media: { mapping: '{not json' } } });
    expect(() => buildValidatorCorpus(root, retiredCfg('CNX_Row'))).toThrow(/not valid JSON/);
  });
```
and before that describe's closing `});`, insert. It uses the describe's own `makeRepo` and `row`, and `afterAll(cleanupFixtures)` removes the tree:
```js

  // §C140 ㊾ — a kept figure is measured exactly as a retired one is, and must come out the other
  // way round: WITH its row and its copy. The tree holds each half alone, both, and neither, plus a
  // key no book names, so a rule that checked only one half, or only one figure, would show.
  it('reports each kept figure’s rows and copies, and the validator names each half-kept one', () => {
    const root = makeRepo({
      b1: {
        images: ['CNX_Kept', 'CNX_NoRow', 'CNX_NoCopy', 'CNX_Neither'],
        media: {
          mapping: [row('CNX_Kept'), row('CNX_NoCopy')],
          files: [`CNX_Kept${S}.svg`, `CNX_NoRow${S}.svg`],
        },
      },
    });
    const keptCfg = {
      keptCopies: Object.fromEntries(
        ['CNX_Kept', 'CNX_NoRow', 'CNX_NoCopy', 'CNX_Neither', 'CNX_Absent'].map((n) => [n, R])
      ),
    };
    const k = buildValidatorCorpus(root, keptCfg);
    expect(k.keptState).toEqual({
      CNX_Kept: { rows: 1, translatedCopies: [`CNX_Kept${S}.svg`] },
      CNX_NoRow: { rows: 0, translatedCopies: [`CNX_NoRow${S}.svg`] },
      CNX_NoCopy: { rows: 1, translatedCopies: [] },
      CNX_Neither: { rows: 0, translatedCopies: [] },
    });
    const named = validateFigureConfig(keptCfg, k).map((p) => p.split(' ').slice(0, 4).join(' '));
    expect(named.sort()).toEqual([
      'keptCopies.CNX_Absent names an image',
      'keptCopies.CNX_Neither has no image-mapping',
      'keptCopies.CNX_Neither has no translated',
      'keptCopies.CNX_NoCopy has no translated',
      'keptCopies.CNX_NoRow has no image-mapping',
    ]);
  });
```

- [ ] **Step 6: Every kept key examined on the real tree**

In `describe('the committed figure config (§C140 ㊵)')`, insert before line 593 (`  it("chemistry's mapping rows and its top-level translated copies match one-to-one", () => {`):
```js
  // §C140 ㊾ — the retired test above, the other way round: every kept key was examined on the real
  // tree, and each was found WITH its row and its copy. Vacuous while the table is empty; the
  // commit that records the first kept figure adds `expect(keys.length).toBeGreaterThan(0)` here,
  // as the retired test carries.
  it('every kept key was examined on the real tree, and found with its row and its copy', () => {
    const keys = Object.keys(cfg.keptCopies ?? {}).sort();
    expect(Object.keys(corpus.keptState).sort()).toEqual(keys);
    for (const k of keys) {
      expect(corpus.keptState[k].rows, k).toBeGreaterThan(0);
      expect(corpus.keptState[k].translatedCopies.length, k).toBeGreaterThan(0);
    }
  });

```

- [ ] **Step 7: Run it and watch it fail for the right reason**

Run: `npx vitest run tools/__tests__/figure-config-validate.test.js`

Expected (measured on a scratch mirror against HEAD's validator): `Tests  13 failed | 63 passed (76)` (HEAD: 62). The 13 are the 7 + 4 new refusal rows and the two new `it`s:
- HEAD's `TABLES` has no `keptCopies` and no kept rule, so 9 of the 11 refusal rows receive `[]`. The other two, `a pin whose key only FOLDS onto a kept key` and `a kept key that only FOLDS onto a retired key`, receive one problem that is not the kept one: HEAD's exactly-one-book rule already refuses the fold-only key `cnx-kept` (`artworkPins.cnx-kept names an image in 0 books' source (none); it folds onto a differently spelt image in chem; …` and `retiredFigures.cnx-kept names an image in 0 books' source (none); …`). Both still fail, because no kept message is produced.
- The throwaway-tree test fails on `k.keptState` being `undefined`.
- The committed-config test fails with `Object.keys(undefined)`.

The new CONTROL `a kept figure that is also superseded` passes on HEAD, as a control should; it is the 63rd pass.

- [ ] **Step 8: Implement the rule**

Replace line 2:
```js
 * The figure config's three tables, checked against the repo (§C140 ㊵, spec D11).
```
with:
```js
 * The figure config's four tables, checked against the repo (§C140 ㊵, spec D11; `keptCopies`,
 * §C140 ㊾, spec 2026-10-02 D1).
```
Replace line 19:
```js
const TABLES = ['supersededArtwork', 'retiredFigures', 'artworkPins'];
```
with:
```js
const TABLES = ['supersededArtwork', 'retiredFigures', 'keptCopies', 'artworkPins'];
```
Replace lines 27–28:
```js
 * @param {{suffix:string, basenamesByBook:Object<string,Set<string>>,
 *          retiredState:Object<string,{rows:number, translatedCopies:string[]}>}} corpus
```
with:
```js
 * @param {{suffix:string, basenamesByBook:Object<string,Set<string>>,
 *          retiredState:Object<string,{rows:number, translatedCopies:string[]}>,
 *          keptState:Object<string,{rows:number, translatedCopies:string[]}>}} corpus
```
Replace lines 53–55:
```js
  // A pin shares no key with the other two tables: either would refuse the figure first.
  const foldedKeys = (t) => new Map(Object.keys(t).map((k) => [normkey(k), k]));
  for (const other of ['supersededArtwork', 'retiredFigures']) {
```
with:
```js
  // A pin shares no key with the other three tables: each refuses the figure before a pin is read.
  const foldedKeys = (t) => new Map(Object.keys(t).map((k) => [normkey(k), k]));
  for (const other of ['supersededArtwork', 'retiredFigures', 'keptCopies']) {
```
Replace the end of `validateFigureConfig` (lines 164–168):
```js
    for (const f of s.translatedCopies)
      problems.push(`retiredFigures.${k} still has a translated copy: media/${f}`);
  }
  return problems;
}
```
with:
```js
    for (const f of s.translatedCopies)
      problems.push(`retiredFigures.${k} still has a translated copy: media/${f}`);
  }

  // §C140 ㊾ — A KEPT FIGURE IS THE INVERSE OF A RETIRED ONE: it HAS its row and its translated
  // copy, because that copy is what readers are served and what the ruling keeps. It is not also
  // retired, by any spelling: one ruling removes the copy the other keeps. It MAY also be in
  // supersededArtwork, as a retired figure may — that table is about the SOURCE drawing — and
  // sources.py checks kept first, so the run prints `REFUSED — kept`.
  const retiredKeys = foldedKeys(tables.retiredFigures);
  for (const k of Object.keys(tables.keptCopies)) {
    if (retiredKeys.has(normkey(k))) {
      problems.push(
        `keptCopies.${k} is also in retiredFigures (${retiredKeys.get(normkey(k))}) — a copy cannot be both kept and retired`
      );
    }
    const s = corpus.keptState[k];
    if (!s) continue; // the exactly-one-book rule above already names it
    if (!s.rows)
      problems.push(
        `keptCopies.${k} has no image-mapping row — readers are not served the copy it keeps`
      );
    if (s.translatedCopies.length === 0)
      problems.push(`keptCopies.${k} has no translated copy at the top of its book's media/`);
  }
  return problems;
}
```
Replace `buildValidatorCorpus` and its JSDoc (lines 170–195):
```js
/**
 * The corpus the validator needs, read from the repo. No git: this runs in CI.
 * @returns {{suffix:string, basenamesByBook:Object<string,Set<string>>, retiredState:Object}}
 */
export function buildValidatorCorpus(repoRoot, cfg) {
  const booksDir = path.join(repoRoot, 'books');
  const basenamesByBook = {};
  for (const b of fs.readdirSync(booksDir).sort()) {
    const bookDir = path.join(booksDir, b);
    if (fs.statSync(bookDir).isDirectory()) basenamesByBook[b] = indexBookSourceBasenames(bookDir);
  }
  const retiredState = {};
  for (const k of Object.keys(cfg.retiredFigures ?? {})) {
    const owners = Object.keys(basenamesByBook).filter((b) => basenamesByBook[b].has(k));
    if (owners.length !== 1) continue;
    const bookDir = path.join(booksDir, owners[0]);
    const rows = readMappingOrRefuse(path.join(bookDir, 'media', 'image-mapping.json'), {
      allowMissing: true,
    });
    retiredState[k] = {
      rows: rows.filter((r) => r.originalImage === k).length,
      translatedCopies: topLevelTranslatedCopies(bookDir, k, DEFAULT_SUFFIX),
    };
  }
  return { suffix: DEFAULT_SUFFIX, basenamesByBook, retiredState };
}
```
with:
```js
/**
 * The corpus the validator needs, read from the repo. No git: this runs in CI.
 * @returns {{suffix:string, basenamesByBook:Object<string,Set<string>>, retiredState:Object,
 *            keptState:Object}}
 */
export function buildValidatorCorpus(repoRoot, cfg) {
  const booksDir = path.join(repoRoot, 'books');
  const basenamesByBook = {};
  for (const b of fs.readdirSync(booksDir).sort()) {
    const bookDir = path.join(booksDir, b);
    if (fs.statSync(bookDir).isDirectory()) basenamesByBook[b] = indexBookSourceBasenames(bookDir);
  }
  // One measurement for both tables (§C140 ㊾): a retired figure must come out with neither a
  // mapping row nor a translated copy, a kept one with both. A key that is not exactly one book's
  // image gets no state; the exactly-one-book rule names it.
  const copyState = (table) => {
    const state = {};
    for (const k of Object.keys(table ?? {})) {
      const owners = Object.keys(basenamesByBook).filter((b) => basenamesByBook[b].has(k));
      if (owners.length !== 1) continue;
      const bookDir = path.join(booksDir, owners[0]);
      const rows = readMappingOrRefuse(path.join(bookDir, 'media', 'image-mapping.json'), {
        allowMissing: true,
      });
      state[k] = {
        rows: rows.filter((r) => r.originalImage === k).length,
        translatedCopies: topLevelTranslatedCopies(bookDir, k, DEFAULT_SUFFIX),
      };
    }
    return state;
  };
  return {
    suffix: DEFAULT_SUFFIX,
    basenamesByBook,
    retiredState: copyState(cfg.retiredFigures),
    keptState: copyState(cfg.keptCopies),
  };
}
```
The refactor leaves `retiredState` unchanged. The existing throwaway-tree tests pin it: `CNX_Row` reads `{rows: 1, …}`, `CNX_Copy` its copy, `CNX_Clean` nothing, the no-media book does not throw, and the two-owner key gets no state.

- [ ] **Step 9: Run it and watch it pass**

Run: `npx vitest run tools/__tests__/figure-config-validate.test.js`

Expected: `Tests  76 passed (76)`, measured on the mirror. The committed-config test passes because HEAD's config has no `keptCopies` key yet, which reads as `{}`. Task 4 adds the empty table.

- [ ] **Step 10: Format and lint**

Run: `npx prettier --check tools/lib/figure-config-validate.js tools/__tests__/figure-config-validate.test.js && npx eslint tools/lib/figure-config-validate.js tools/__tests__/figure-config-validate.test.js`

Expected: `All matched files use Prettier code style!` and no eslint output (measured on the mirror; eslint's positive control there flagged a planted unused variable, so the run was really linting).

- [ ] **Step 11: Commit**

```bash
git add tools/lib/figure-config-validate.js tools/__tests__/figure-config-validate.test.js
git commit -F - <<'EOF'
feat(figures): §C140 ㊾ — the config validator checks keptCopies as the inverse of retiredFigures

A kept key must be exactly one book's image, carry a reason over 40 characters, HAVE its
image-mapping row and its top-level translated copy, and be in neither retiredFigures (by any
spelling) nor artworkPins. kept + supersededArtwork stays allowed, as retired + superseded is.
buildValidatorCorpus measures keptState with the same code as retiredState (one copyState
helper; retiredState unchanged and still pinned). 62 -> 76 tests, all green.
EOF
```

### Task 4: ship the EMPTY `keptCopies` table and its doc string, and prove it is inert on the real tree

**Files:**
- Modify: `experiments/figure-text-translation/figure-text.config.json`. Insert between the blank line 35 and `"artworkPins": {` (line 36)
- Test: `tools/__tests__/figure-text-config.test.js` (23–25)

**Interfaces:**
- Consumes: Task 1's `policy()` (absent or `{}` both refuse nothing) and Task 3's validator (an empty table means no `keptState`)
- Produces: `"keptCopies": {}` and `"_keptCopies": "<doc>"` in the committed config. This is the slot PR-B's data commits fill with `{"<basename>": "<reason string>"}` entries.

- [ ] **Step 1: The committed config must carry the table**

In `tools/__tests__/figure-text-config.test.js`, replace lines 23–25:
```js
  it('the committed config carries both tables as plain objects', () => {
    const cfg = loadFigureTextConfig();
    for (const key of ['retiredFigures', 'artworkPins']) {
```
with:
```js
  it('the committed config carries its policy tables as plain objects (keptCopies: §C140 ㊾)', () => {
    const cfg = loadFigureTextConfig();
    for (const key of ['retiredFigures', 'keptCopies', 'artworkPins']) {
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run tools/__tests__/figure-text-config.test.js`

Expected: `Tests  1 failed | 13 passed (14)`, with `AssertionError: expected false to be true`. HEAD's config has no `keptCopies` key, so `typeof undefined === 'object'` is false (measured on the mirror).

- [ ] **Step 3: Add the table and its doc string**

In `experiments/figure-text-translation/figure-text.config.json`, replace:
```json
  "artworkPins": {
    "CNX_Chem_14_03_ICETable2_img": {
```
with:
```json
  "keptCopies": {},
  "_keptCopies": "§C140 ㊾. Basenames whose TRANSLATED COPY a [USER] ruling KEEPS as it is: the inverse of retiredFigures. The figure's image-mapping row and its _IS file at the top of media/ stay, and no run may recompose it, buy it again or publish over it. sources.py refuses these right after retiredFigures — before supersededArtwork, before any pin and before any lookup — as `kept`; tools/figure-run.js then files the figure `unresolved` (a NOTE, never fatal) on plain, --stale and --force runs alike, so a kept figure needs no sidecar as a re-buy lock. A figure may also be in supersededArtwork, which is about the SOURCE drawing; the run then prints REFUSED — kept. tools/lib/figure-config-validate.js requires each key to be exactly one book's image basename, with an image-mapping row and a translated copy, and in neither retiredFigures nor artworkPins. The value is what was ruled and why, over 40 characters. A kept figure's sidecar is deleted in the commit that restores its copy (spec 2026-10-02 D1): its blocks describe a picture no longer served. The value then names the commit that holds its paid MT record.",

  "artworkPins": {
    "CNX_Chem_14_03_ICETable2_img": {
```
Check it parses: `node -e "JSON.parse(require('fs').readFileSync('experiments/figure-text-translation/figure-text.config.json','utf8')); console.log('ok')"` prints `ok`.

- [ ] **Step 4: Run every consumer of the config and watch them pass**

Run: `npx vitest run tools/__tests__/figure-text-config.test.js tools/__tests__/figure-config-validate.test.js`
Expected: `Tests  90 passed (90)` (14 + 76). The validator's committed-config describe now reads `keptCopies: {}` and finds `keptState` `{}`.

Run: `cd experiments/figure-text-translation && FIGTEXT_PYLIBS=./pylibs python3 -B test_sources.py | tail -1`
Expected: `ALL PASS` (its end-of-file block reads the committed config).

- [ ] **Step 5: Inertness on the real tree, with a control that the guard bites**

⚠️ *Verifier note:* if this step also runs `figure-run.js --chapter 2 --figure CNX_Chem_02_05_PerTable2 --stale --dry-run`, read it only as "the driver's verdict for PerTable2 is unchanged". The driver decides `skipped-current` BEFORE it calls the resolver, so that run cannot see `keptCopies` at all. The `sources.py --json` run and the in-memory probe below are the actual evidence.

These need this box's `sources.local.json` and the `Myndir` artwork trees. Both are machine-local, which is why no committed test can make this check. All three runs are read-only.

Run: `cd experiments/figure-text-translation && FIGTEXT_PYLIBS=./pylibs python3 -B sources.py --json efnafraedi-2e CNX_Chem_02_05_PerTable2 CNX_Chem_13_03_catalyst CNX_Chem_03_01_ibuprofenmass_img`

Expected, unchanged from HEAD (measured with the patched resolver over the real trees):
- PerTable2 → `…/Myndir/chemistry-2e/base/Ch_02/Source_File/CNX_Chem_02_05_PerTable2.pdf`, `first-edition`
- catalyst → `null`
- ibuprofenmass_img → `…/Myndir/chemistry-2e/selected-art/OSX_Chem2e_Ch03_SourceFiles/CNX_Chem_03_01_ibuprofenmass_img.eps`, `updates-2e`

Run (positive control: the same three figures under an in-memory entry, with nothing written to the config):
```bash
cd experiments/figure-text-translation && FIGTEXT_PYLIBS=./pylibs python3 -B -c "
import sources as S
cfg = S.load_config()
cfg['keptCopies'] = {n: 'probe: a hypothetical kept-copy ruling, for a read-only check only'
                     for n in ('CNX_Chem_02_05_PerTable2', 'CNX_Chem_13_03_catalyst', 'CNX_Chem_03_01_ibuprofenmass_img')}
out = []
S.run_cli(['--json', 'efnafraedi-2e', 'CNX_Chem_02_05_PerTable2', 'CNX_Chem_02_05_PerTable1',
           'CNX_Chem_13_03_catalyst', 'CNX_Chem_03_01_ibuprofenmass_img'], cfg=cfg, out=out.append)
print(out[0])"
```
Expected (measured): PerTable2, catalyst and ibuprofenmass_img each `{"path": null, "refused": "kept", "edition": null, "candidates": [], "reason": "probe: …"}`. PerTable1, the control, still resolves to `…/selected-art/OSX_Chem2e_Ch02_SourceFiles/CNX_Chem_02_05_PerTable1.eps`.

Run: `node tools/figure-run.js --book efnafraedi-2e --chapter 2 --figure CNX_Chem_02_05_PerTable2 --stale --dry-run`
Expected: `1  skipped-current`, `1  = enumerated`, `VERDICT ok`, exit 0. This matches the 2026-10-02 measurement at `1fd497687`: the table is empty and `COMPOSER_VERSION` is unchanged.

Run: `git status --porcelain`
Expected: exactly ` M experiments/figure-text-translation/figure-text.config.json` and ` M tools/__tests__/figure-text-config.test.js`.

- [ ] **Step 6: Format, lint, commit**

Run: `npx prettier --check tools/__tests__/figure-text-config.test.js && npx eslint tools/__tests__/figure-text-config.test.js`. Expected: clean (measured on the mirror).

```bash
git add experiments/figure-text-translation/figure-text.config.json tools/__tests__/figure-text-config.test.js
git commit -F - <<'EOF'
feat(figures): §C140 ㊾ — ship the empty keptCopies table and its doc string

The slot for [USER]'s kept-copy rulings (spec 2026-10-02 D1/D6), EMPTY in this PR: entries,
the PerTable2 restore and the sidecar deletion land in the recompose-pass PR. Inert on the real
tree (PerTable2 still resolves to its first-edition PDF; catalyst still null; ibuprofenmass_img
still its selected-art EPS; a --stale --dry-run of PerTable2 still reads skipped-current), and an
in-memory entry for the same three refuses all three as `kept` while PerTable1 still resolves.
EOF
```


---

# Part 2 — §C161: no comment annotation drawn into the artwork · ✅ drafted and verified

### Task 1: §C161 — strip-text.py stops drawing PDF comment annotations into the artwork

**Why this task exists:** 5 chemistry source PDFs (ch03 `Ex01_05d`, `Ex01_06d`; ch04 `saccharin`; ch20 `HalAlkane`, `HalAlkane3`) carry an editor's `/Text` comment with an `/AP` appearance and a `/Popup`. `pdftocairo` draws that appearance over an atom, so a green or yellow note icon ends up in our `artwork.pdf`/`.png`/`.svg` (OpenStax's JPG does not show it). All 5 are textless, so every `--stale` run recomposes them. This must land before the '5' pass. (Spec row 3; register §C161; evidence `~/.cache/namsbokasafn-audit/2026-10-02-step2-rederive/rederive.json` → `results.annots`.)

**Decision (one line):** remove `/Annots` only when every entry is a `/Text` or a `/Popup`, and **refuse anything else before deleting or writing**. This is the module's own `TextObjectOperatorRefused` discipline ("refused, not guessed; extend only with evidence"). The census found 14 `/Text` and 14 `/Popup` across 12 PDFs and no other subtype. 6 of those PDFs are our own `Translated_IS` output. Of the other 6, which are `Source_File` artwork, 5 resolve to a chemistry figure. So the refusal fires 0 times in the pass. An unmeasured `/FreeText`, `/Stamp` or `/Ink` can be real artwork, and one loud `failed-prepare` is better than a silent loss.

**Files:**
- Modify: `experiments/figure-text-translation/strip-text.py`: the docstring (lines 2–3), the import (line 22), a new block inserted between `collapse_svg` (ends line 314) and `def main` (line 317), and the page cleanup in `main()` (lines 327–329, before `pdf.save(out_pdf)` at 332).
- Modify: `experiments/figure-text-translation/figure-prepare.py`: a new `annotation_warnings` inserted after `reference_cost_warnings` (which ends at line 398) and before the `# ── the artwork/text coordinate guard` banner (line 401). The `'warnings'` entry of `prepare()`'s payload changes (line 624).
- Test: `experiments/figure-text-translation/test_figure_prepare.py`: a new section 13 inserted after the 12e block (which ends at line 831) and before the final `print(f"\n{'ALL PASS' ...")` (line 833).
- Unchanged on purpose: `figure-prepare.py` lines 510–515, the `/Annots` deletion on the throwaway transform-probe copy. It becomes redundant but stays harmless, and the probe must keep matching whatever `artwork.pdf` holds.

**Interfaces:**
- **Consumes, all existing at HEAD `2f5f213bf`:** `pikepdf` 10.3.0 (system dist-packages, not vendored in `pylibs/`, unlike Pillow), `_deps.OUT`, `svgfix.pdftocairo_svg_argv(pdf, svg, flags=None)`. In the test file: `check`, `run_prepare`, `refused`, `load_prepare_json`, `FILL`, `RULE`, `N`, `HERE`, `_mod` (figure-prepare loaded via importlib, lines 186–199), `_svgfix` (line 571) and `importlib`/`json`/`subprocess`/`tempfile`/`Path`. `PIL.Image` comes from `pylibs/`, which the file already puts on `sys.path`.
- **Produces in `strip-text.py`:**
  - `REMOVABLE_ANNOTATION_SUBTYPES = frozenset(['/Text', '/Popup'])`.
  - `class AnnotationRefused(Exception)`.
  - `drop_annotations(page) -> dict[str, int]`, which deletes the key and returns e.g. `{'/Popup': 1, '/Text': 1}`, or `{}`. It raises `AnnotationRefused` and deletes nothing.
  - On every successful run, `main()` writes `<OUT>/annotations.json` = `{"removed": {...}}` and prints `annotations removed: 1 /Popup, 1 /Text -> out/annotations.json` (or `annotations removed: 0 -> …`).
- **Produces in `figure-prepare.py`:** `annotation_warnings(out_dir) -> list[str]`. It raises `PrepareError` if `annotations.json` is missing. `prepare.json`'s `warnings` gains exactly one string, `annotations removed from page 1: <n> /Popup, <n> /Text (§C161)`, when something was removed. **No new `prepare.json` key**, and nothing changes what the figure is classified as: `tools/lib/figure-classify.js` reads only its integer counts (its line 101). The driver already prints every warning, unfiltered, for every outcome (`tools/figure-run.js` 2632–2654). The text contains no `;`, which matters because the driver joins warnings with `'; '`. The existing exact pins 2j (`['subset font PAGE/F1']`) and 3e (`[]`) are unaffected: neither fixture has `/Annots`. Measured: both still pass with the change. `annotations.json` lands only in the driver's per-figure scratch directory (`fs.mkdtempSync(path.join(os.tmpdir(), 'figure-run-'))`, `tools/figure-run.js` 2120/2141), and nothing copies that directory wholesale: `publish-figure-svg.js` 316 copies only the named SVG. `figure-run-free.test.js` and `figure-run-paid.test.js` stub prepare and never list the directory's files, so no JS test can see the new file.

- [ ] **Step 0: Preconditions and baseline (2 min).**
  Confirm `git -C /home/siggi/dev/repos/namsbokasafn-efni branch --show-current` prints `feat/c140-c49-step2-code-fixes` and `git status --porcelain` is empty. Run `free -h` (stop below 2 GiB available) and `df -h /tmp`. In a fresh git worktree, first copy the gitignored `experiments/figure-text-translation/sources.local.json` from the main checkout: no new worktree has it, and 12e's precondition and Step 6's `sources.py --json` both read it. Do not link the gitignored `out/` into a worktree, because a prepare that broke the shared-`out/` guard would then write into the main checkout. Then, from the repo root:
```bash
PYTHONDONTWRITEBYTECODE=1 python3 experiments/figure-text-translation/test_figure_prepare.py; echo "EXIT=$?"
```
  Expected at `2f5f213bf`: last line `ALL PASS`, `EXIT=0`, 85 checks in about 30 s (measured 2026-10-03: 85 PASS, 28.99 s). If an earlier PR-A task touched this file, the count is whatever that run prints. Record any failing label **by name**: it is baseline, not this task's.

- [ ] **Step 1: Write the failing test (5 min).** In `experiments/figure-text-translation/test_figure_prepare.py`, insert the block below between line 831 (the closing `f"exit {r.returncode}; {d.get('glyphRepairs')!r}; keys {keys[:4]!r}")` of 12e) and line 833 (`print(f"\n{'ALL PASS' if not fails else ...`). Keep one blank line before it and one after.
```python
# ── 13. §C161 — an editor's comment annotation is never drawn into the artwork ─────────────────
# Five chemistry source PDFs carry a /Text comment (an /AP appearance plus its /Popup) that
# pdftocairo draws over an atom; OpenStax's published JPG does not show it. strip-text.py is the
# only producer of artwork.pdf/.png/.svg, so this runs that path end to end, through prepare.
# 🔴 /F 28 IS LOAD-BEARING. It is the corpus value, and pdftocairo draws an annotation into the SVG
# only when Print (4) is set: measured, /F 0 gives 0 in the SVG and 3,025 pixels in the PNG, so the
# SVG legs below would pass on the unfixed code. The colour is the corpus's own green, so this test
# and the post-pass census of media/ share one detector string.
from PIL import Image                           # noqa: E402 - pylibs is on sys.path (top of file)

ANNOT_SVG = 'rgb(25%, 66.664124%, 33.331299%)'  # what cairo writes for `0.25 0.666656 0.333328 rg`
ANNOT_PX = (64, 170, 85)                        # ... and what it renders into the 200 dpi PNG
ANNOT_RECT = (60, 60, 80, 80)                   # pt, PDF y-up; clear of FILL (0..50) and RULE (y 20)
FILL_PX = (51, 102, 204)                        # FILL's `0.2 0.4 0.8 rg` at 200 dpi
WHITE = (255, 255, 255)


def synth_annotated(dst, subtypes=('/Text',)):
    """FILL + RULE on a 100 x 100 pt page, plus one annotation per entry of `subtypes`, each with an
    /AP that fills ANNOT_RECT in the corpus green; a /Text also gets its /Popup, as every corpus
    comment does. /Annots is an INDIRECT array, as in CNX_Chem_03_01_Ex01_05d_img (`/Annots 244 0 R`).
    `subtypes=()` is the control: the same page with no /Annots key at all."""
    pdf = pikepdf.new()
    page = pdf.add_blank_page(page_size=(100, 100))
    page.Contents = pdf.make_stream(FILL + RULE)
    if subtypes:
        annots = []
        for subtype in subtypes:
            ap = pdf.make_stream(b'0.25 0.666656 0.333328 rg 0 0 20 20 re f\n')
            ap.Type, ap.Subtype = N('/XObject'), N('/Form')
            ap.BBox = pikepdf.Array([0, 0, 20, 20])
            annot = pdf.make_indirect(pikepdf.Dictionary(
                Type=N('/Annot'), Subtype=N(subtype), Rect=pikepdf.Array(list(ANNOT_RECT)), F=28,
                Contents=pikepdf.String('planted comment'),
                AP=pikepdf.Dictionary(N=pdf.make_indirect(ap))))
            annots.append(annot)
            if subtype == '/Text':
                popup = pdf.make_indirect(pikepdf.Dictionary(
                    Type=N('/Annot'), Subtype=N('/Popup'), Rect=pikepdf.Array([80, 40, 100, 60]),
                    F=28, Parent=annot))
                annot.Popup = popup
                annots.append(popup)
        page.obj.Annots = pdf.make_indirect(pikepdf.Array(annots))
    pdf.save(str(dst), deterministic_id=True)
    return Path(dst)


def colour_pixels(png, colour):
    """Exact-VALUE count of `colour` in a PNG - never a count of non-white pixels."""
    with Image.open(png) as im:
        rgb = im.convert('RGB')
        return dict((c, n) for n, c in rgb.getcolors(rgb.width * rgb.height)).get(colour, 0)


def pixel_at(png, x_pt, y_pt):
    """The PNG pixel at PDF point (x_pt, y_pt) of a 100 pt page rendered at 200 dpi."""
    s = 200 / 72
    with Image.open(png) as im:
        return im.convert('RGB').getpixel((int(x_pt * s), int((100 - y_pt) * s)))


def annot_objects(pdf_path):
    """Annotation dictionaries anywhere in the file, not only on the page: a page that merely
    stopped pointing at them would otherwise read clean while they are still written."""
    with pikepdf.open(str(pdf_path)) as p:
        return sum(1 for o in p.objects
                   if isinstance(o, pikepdf.Dictionary) and o.get('/Type') == N('/Annot'))


def bare_conversions(src, td):
    """-> (ANNOT_SVG count, ANNOT_PX pixels) of the SOURCE through the shipped SVG argv and -png."""
    svg, root = Path(td) / f'{src.stem}.bare.svg', Path(td) / f'{src.stem}.bare'
    subprocess.run(_svgfix.pdftocairo_svg_argv(src, svg), check=True, timeout=120)
    subprocess.run(['pdftocairo', '-png', '-r', '200', '-singlefile', str(src), str(root)],
                   check=True, timeout=120)
    return svg.read_text().count(ANNOT_SVG), colour_pixels(Path(f'{root}.png'), ANNOT_PX)


print('\n[13] §C161 comment annotations are not drawn into the artwork')
with tempfile.TemporaryDirectory() as td:
    td = Path(td)
    annotated = synth_annotated(td / 'CNX_Fake_Annotated.pdf')
    plain = synth_annotated(td / 'CNX_Fake_NoAnnots.pdf', subtypes=())
    stamped = synth_annotated(td / 'CNX_Fake_Stamp.pdf', subtypes=('/Stamp',))

    # 13a/13b THE INSTRUMENT, BOTH WAYS. Without 13a every "absent" below is also what a poppler
    # that never draws annotations reports; without 13b the detectors could always fire.
    got_a, got_p = bare_conversions(annotated, td), bare_conversions(plain, td)
    check('13a CONTROL this poppler DRAWS the planted /Text annotation of the SOURCE into both the '
          'SVG and the PNG', got_a[0] == 1 and got_a[1] > 0, f'(svg, png) = {got_a!r}')
    check('13b CONTROL ... and the same detectors read 0 on the page without /Annots',
          got_p == (0, 0), f'(svg, png) = {got_p!r}')

    out_a, out_p, out_s = td / 'out-annotated', td / 'out-plain', td / 'out-stamp'
    r_a = run_prepare(annotated, '--basename', annotated.stem, '--out', out_a)
    r_p = run_prepare(plain, '--basename', plain.stem, '--out', out_p)
    r_s = run_prepare(stamped, '--basename', stamped.stem, '--out', out_s)
    d_a, d_p, d_s = (load_prepare_json(o) or {} for o in (out_a, out_p, out_s))

    art = out_a / 'artwork.pdf'
    page_annots = None
    if art.exists():
        with pikepdf.open(str(art)) as p:
            page_annots = '/Annots' in p.pages[0].obj
    check('13c artwork.pdf keeps NO annotation: no /Annots on the page and no /Annot object in '
          'the file', r_a.returncode == 0 and page_annots is False
          and annot_objects(art) == 0,
          f'exit {r_a.returncode}, page /Annots {page_annots!r}, '
          f'/Annot objects {annot_objects(art) if art.exists() else None!r}: '
          f'{r_a.stderr.strip()[-300:]}')
    svg_a = out_a / 'artwork.svg'
    check('13d artwork.svg does not draw the annotation colour',
          svg_a.exists() and svg_a.read_text().count(ANNOT_SVG) == 0,
          f'{svg_a.read_text().count(ANNOT_SVG) if svg_a.exists() else None!r} hit(s)')
    png_a = out_a / 'artwork.png'
    check('13e artwork.png has 0 pixels of the annotation colour and the centre of its /Rect is '
          'background', png_a.exists() and colour_pixels(png_a, ANNOT_PX) == 0
          and pixel_at(png_a, 70, 70) == WHITE,
          f'{colour_pixels(png_a, ANNOT_PX) if png_a.exists() else None!r} px, centre '
          f'{pixel_at(png_a, 70, 70) if png_a.exists() else None!r}')
    # 13f NOTHING ELSE GOES. Byte identity with the control page is the strongest form; the FILL
    # pixel is what stops an implementation that empties BOTH pages from satisfying it.
    same = all((out_a / f).exists() and (out_p / f).exists()
               and (out_a / f).read_bytes() == (out_p / f).read_bytes()
               for f in ('artwork.svg', 'artwork.png'))
    check('13f ... and NOTHING ELSE is removed: artwork.svg and artwork.png equal the no-/Annots '
          'page byte for byte, and FILL is still drawn',
          same and png_a.exists() and pixel_at(png_a, 25, 25) == FILL_PX,
          f'identical {same}, FILL pixel {pixel_at(png_a, 25, 25) if png_a.exists() else None!r}')
    rec_a = json.loads((out_a / 'annotations.json').read_text()) \
        if (out_a / 'annotations.json').exists() else None
    check('13g the removal is REPORTED: annotations.json and exactly one prepare.json warning',
          rec_a == {'removed': {'/Popup': 1, '/Text': 1}}
          and d_a.get('warnings') == ['annotations removed from page 1: 1 /Popup, 1 /Text (§C161)'],
          f'{rec_a!r}, {d_a.get("warnings")!r}')
    rec_p = json.loads((out_p / 'annotations.json').read_text()) \
        if (out_p / 'annotations.json').exists() else None
    check('13h CONTROL the page without /Annots: annotations.json is written anyway, empty, and '
          'prepare.json carries no warning', r_p.returncode == 0 and rec_p == {'removed': {}}
          and d_p.get('warnings') == [],
          f'exit {r_p.returncode}, {rec_p!r}, {d_p.get("warnings")!r}')
    check('13i a /Stamp annotation is REFUSED before anything is written: exit 1, the error names '
          'it, and there is no artwork.pdf',
          refused(r_s, 1) and 'AnnotationRefused' in str(d_s.get('error', ''))
          and "'/Stamp'" in str(d_s.get('error', '')) and not (out_s / 'artwork.pdf').exists(),
          f'exit {r_s.returncode}, artwork.pdf {(out_s / "artwork.pdf").exists()}, '
          f'{str(d_s.get("error"))[-200:]!r}')

# 13j-13m THE REFUSAL BRANCHES, in process. 13i reaches one of them; these reach the rest, and pin
# "refused deletes NOTHING", which no end-to-end run can see (a refused run writes no artwork.pdf).
_st = None
try:
    _st_spec = importlib.util.spec_from_file_location('strip_text_tool', HERE / 'strip-text.py')
    _st = importlib.util.module_from_spec(_st_spec)
    _st_spec.loader.exec_module(_st)
except Exception as exc:                          # noqa: BLE001
    _st = None
    check('13j strip-text.py imports without running', False, f'{type(exc).__name__}: {exc}')
_drop = getattr(_st, 'drop_annotations', None)
_refusal = getattr(_st, 'AnnotationRefused', None)
check('13j PRECONDITION strip-text.py exposes drop_annotations and AnnotationRefused',
      callable(_drop) and isinstance(_refusal, type))
if callable(_drop) and isinstance(_refusal, type):
    def _annot(subtype):
        d = pikepdf.Dictionary(Type=N('/Annot'), Rect=pikepdf.Array([0, 0, 1, 1]))
        if subtype:
            d.Subtype = N(subtype)
        return d

    def _try(annots_value):
        """-> (return value or the refusal text, the page's /Annots afterwards)."""
        pdf = pikepdf.new()
        page = pdf.add_blank_page(page_size=(100, 100))
        page.obj.Annots = annots_value
        try:
            got = _drop(page)
        except _refusal as exc:
            got = f'REFUSED {exc}'
        after = page.obj.get('/Annots')
        return got, (None if after is None else len(after) if isinstance(after, pikepdf.Array)
                     else 'non-array')

    got, after = _try(pikepdf.Array([]))
    check('13k an EMPTY /Annots array is removed and reports nothing', got == {} and after is None,
          f'{got!r}, /Annots after {after!r}')
    got, after = _try(pikepdf.Array([_annot('/Text'), _annot('/Stamp')]))
    check('13l a /Text beside a /Stamp is REFUSED and NOTHING is deleted',
          isinstance(got, str) and got.startswith('REFUSED') and "'/Stamp'" in got and after == 2,
          f'{got!r}, /Annots after {after!r}')
    got, _ = _try(pikepdf.Array([_annot(None)]))
    check('13m an annotation with no /Subtype is REFUSED',
          isinstance(got, str) and '(no /Subtype)' in got, f'{got!r}')
    got, _ = _try(pikepdf.Array([5]))
    check('13m-b a non-dictionary entry is REFUSED',
          isinstance(got, str) and 'non-dictionary' in got, f'{got!r}')
    got, _ = _try(pikepdf.Dictionary())
    check('13m-c a /Annots that is not an array is REFUSED',
          isinstance(got, str) and 'not an array' in got, f'{got!r}')

# 13n figure-prepare.py's reader: a missing annotations.json is an ERROR, never "nothing removed".
_aw = getattr(_mod, 'annotation_warnings', None) if _mod is not None else None
check('13n PRECONDITION figure-prepare.py exposes annotation_warnings', callable(_aw))
if callable(_aw):
    with tempfile.TemporaryDirectory() as td:
        try:
            missing = _aw(td)
        except _mod.PrepareError as exc:
            missing = f'PrepareError {exc}'
        check('13n-b a missing annotations.json raises PrepareError',
              isinstance(missing, str) and missing.startswith('PrepareError')
              and 'annotations.json' in missing, f'{missing!r}')
        (Path(td) / 'annotations.json').write_text(
            json.dumps({'removed': {'/Text': 2, '/Popup': 2}}))
        check('13n-c two comments make ONE warning, subtypes sorted',
              _aw(td) == ['annotations removed from page 1: 2 /Popup, 2 /Text (§C161)'],
              f'{_aw(td)!r}')
        (Path(td) / 'annotations.json').write_text(json.dumps({'removed': {}}))
        check('13n-d CONTROL nothing removed makes no warning', _aw(td) == [], f'{_aw(td)!r}')
```

- [ ] **Step 2: Run it and watch it fail for the right reason (1 min).**
```bash
PYTHONDONTWRITEBYTECODE=1 python3 experiments/figure-text-translation/test_figure_prepare.py; echo "EXIT=$?"
```
  Expected: `EXIT=1`, with **exactly 9 new failures** and every pre-existing label still PASS (85 + 11 = 96 checks with the gitignored `out/` present; one fewer without it, since case 5b is skipped. Judge by the label set). The failing set by name is 13c, 13d, 13e, 13f, 13g, 13h, 13i, `13j PRECONDITION …` and `13n PRECONDITION …`. **13a and 13b PASS on HEAD by design**, because they are the instrument controls. The HEAD values below were measured on a scratch copy of HEAD's `*.py`:
  - **13c:** `page /Annots True, /Annot objects 2`. `main()` never deletes `/Annots`.
  - **13d:** `1 hit(s)`. cairo writes `rgb(25%, 66.664124%, 33.331299%)`.
  - **13e:** `3025 px, centre (64, 170, 85)`.
  - **13f:** `identical False`, but the FILL pixel is `(51, 102, 204)`, so this leg fails only because of the icon.
  - **13g:** `None, []`.
  - **13h:** `None`, because `annotations.json` does not exist yet.
  - **13i:** `exit 0, artwork.pdf True`. A `/Stamp` is drawn, not refused.
  - **13j and 13n:** neither `drop_annotations` nor `annotation_warnings` exists.

- [ ] **Step 3: Implement the strip in `strip-text.py` (4 min).** There are four edits against HEAD.
  (a) Docstring, lines 2–3. Replace
```python
"""Stage 2 - remove every BT..ET text object (keeping the graphics state set inside it), drop the embedded Illustrator private data,
and render the artwork alone.  Produces out/artwork.pdf and out/artwork.png.
```
  with
```python
"""Stage 2 - remove every BT..ET text object (keeping the graphics state set inside it), drop the embedded Illustrator private data
and page 1's comment annotations (§C161, see drop_annotations), and render the artwork alone.  Produces out/artwork.pdf,
out/artwork.png and out/annotations.json.
```
  (b) Line 22. Replace `import sys, subprocess` with `import json, sys, subprocess`.
  (c) Insert immediately above `def main(pdf_path, dpi=DEFAULT_DPI, svg=False):` (line 317), after the two blank lines that end `collapse_svg`. End the inserted block with two blank lines, so `def main` stays separated by two blank lines as before (verifier fix):
```python
# §C161. A PDF annotation is not artwork, and pdftocairo draws its appearance stream (/AP) over the page: an
# editor's comment left in the delivered file became a green or yellow note icon over an atom in our figure, one
# OpenStax's own published JPG does not show. Census 2026-10-02, page 1 of all 2,238 chemistry source PDFs: the
# non-empty /Annots are /Text comments with an /AP and their /Popup (14 + 14) and nothing else; 0 of 516 EPS
# sources carry an annotation pdfmark. Those two subtypes are removed. Anything else is REFUSED, not guessed.
REMOVABLE_ANNOTATION_SUBTYPES = frozenset(['/Text', '/Popup'])


class AnnotationRefused(Exception):
    """A page-1 annotation this tool has no evidence about. RAISED before anything is deleted or written.

    A /FreeText, /Stamp, /Ink or /Square annotation can be part of the picture (an artist's callout, a stamped
    label): deleting it loses artwork, keeping it may draw an editor's mark. Neither can be decided here and
    none occurs in the measured corpus, so a refusal costs nothing today and turns an unmeasured source (a
    refresh, another book) into one loud failed prepare instead of a silently wrong picture. Extend
    REMOVABLE_ANNOTATION_SUBTYPES only with evidence, as PERSISTENT_STATE_OPERATORS is.
    """


def drop_annotations(page):
    """Delete page 1's /Annots when every entry is a /Text comment or a /Popup (§C161).

    -> {subtype: count} removed, sorted by subtype; {} for no /Annots or an empty array (the key is deleted
    either way). Raises AnnotationRefused, deleting NOTHING, if /Annots is not an array or any entry is not a
    dictionary, has no /Subtype, or has a subtype outside REMOVABLE_ANNOTATION_SUBTYPES.

    🔴 DELETE THE KEY; DO NOT FILTER BY /F. pdftocairo draws an annotation into the PNG whatever its flags but
    into the SVG only when Print (4) is set - measured on a synthetic /Text: /F 28 (the corpus value) draws in
    both, /F 0 in the PNG only. Removing the key is what keeps artwork.pdf, .png and .svg in agreement.
    """
    annots = page.obj.get('/Annots')
    if annots is None:
        return {}
    if not isinstance(annots, pikepdf.Array):
        raise AnnotationRefused('page /Annots is not an array - refused, not guessed; see AnnotationRefused (§C161)')
    counts, refused = {}, []
    for annot in annots:
        if not isinstance(annot, pikepdf.Dictionary):
            refused.append(f'a non-dictionary entry {repr(annot)[:40]}')
            continue
        subtype = str(annot.get('/Subtype', '(no /Subtype)'))
        if subtype in REMOVABLE_ANNOTATION_SUBTYPES:
            counts[subtype] = counts.get(subtype, 0) + 1
        else:
            refused.append(subtype)
    if refused:
        raise AnnotationRefused(
            f'page 1 carries annotation(s) {sorted(set(refused))} that are neither a /Text comment nor '
            f'a /Popup - refused, not guessed; see AnnotationRefused (§C161)')
    del page.obj['/Annots']
    return dict(sorted(counts.items()))
```
  (d) In `main()`, replace lines 327–329
```python
    for k in ('/PieceInfo', '/LastModified', '/Metadata', '/Thumb'):
        if k in page.obj:
            del page.obj[k]
```
  with
```python
    # §C161, BEFORE the save: artwork.pdf, .png and .svg are all made from the page without them. Written on
    # EVERY run, like svgfix.json, so "nothing to remove" can never read like "did not run".
    removed = drop_annotations(page)
    (OUT / 'annotations.json').write_text(json.dumps({'removed': removed}, indent=1))
    print('annotations removed: '
          + (', '.join(f'{n} {s}' for s, n in removed.items()) or '0') + ' -> out/annotations.json')
    for k in ('/PieceInfo', '/LastModified', '/Metadata', '/Thumb'):
        if k in page.obj:
            del page.obj[k]
```
  The refusal is raised before `pdf.save(out_pdf)`, so a refused figure leaves no `artwork.pdf`, `.png` or `.svg` (13i pins this). The removed annotation objects are not written either, because qpdf saves only reachable objects (13c counts `/Type /Annot` across `pdf.objects`, not only the page key).

- [ ] **Step 4: Surface the removal in `figure-prepare.py` (3 min).** There are two edits against HEAD.
  (a) Insert after `reference_cost_warnings`, whose last line is `    return []` at line 398, and before `# ── the artwork/text coordinate guard — ruling (W), 2026-09-15 ──…` (line 401). Keep two blank lines on each side:
```python
def annotation_warnings(out_dir):
    """-> [] or ONE warning naming the page-1 annotations strip-text.py removed (§C161).

    A removal is expected (5 chemistry figures carry an editor's comment icon) but must not be silent, and
    the driver prints every warning for every outcome (`tools/figure-run.js`, "figure-prepare.py's
    WARNINGS"). strip-text.py writes annotations.json on EVERY run, so a missing file means the producer
    drifted: raised, never read as "nothing removed".
    """
    path = Path(out_dir) / 'annotations.json'
    if not path.is_file():
        raise PrepareError(f'strip-text.py wrote no {path.name}, so whether it removed an annotation '
                           f'from the artwork is unknown (§C161)')
    removed = json.loads(path.read_text()).get('removed') or {}
    if not removed:
        return []
    return ['annotations removed from page 1: '
            + ', '.join(f'{n} {s}' for s, n in sorted(removed.items())) + ' (§C161)']
```
  (b) In `prepare()`'s return dict, replace line 624
```python
        'warnings': build_warnings(meta, features) + reference_cost_warnings(svg),
```
  with
```python
        'warnings': (build_warnings(meta, features) + reference_cost_warnings(svg)
                     + annotation_warnings(out_dir)),
```

- [ ] **Step 5: Run it green, plus the neighbouring strip suite (2 min).**
```bash
PYTHONDONTWRITEBYTECODE=1 python3 experiments/figure-text-translation/test_figure_prepare.py; echo "EXIT=$?"
(cd experiments/figure-text-translation && PYTHONDONTWRITEBYTECODE=1 FIGTEXT_PYLIBS=./pylibs python3 test_strip_text.py; echo "EXIT=$?")
```
  Expected: `ALL PASS`, `EXIT=0`, with **104 checks (85 + 19 in section 13)** and the same non-13 label set as Step 0. Then `test_strip_text.py` gives `ALL PASS`, `EXIT=0`. On a scratch copy carrying exactly this diff, it gave 38 PASS in 4 s; it imports `strip-text.py` and never calls `main()`.
  The gate is the label SET, not the integer: every non-13 label from Step 0 still PASS, plus all 19 section-13 labels. With the gitignored `out/` present that is 104; on a box without `out/`, case 5b is skipped and the count is one lower.

- [ ] **Step 6: Corpus confirmation on the 5 real figures plus 2 controls (2 min, local only, 0 ISK).** This reads the Myndir sources and writes only into a `mktemp -d` directory, which it then deletes. It does not run the driver and does not touch `media/`. From `experiments/figure-text-translation/`:
```bash
D=$(mktemp -d -t c161-XXXX)
FIGS="CNX_Chem_03_01_Ex01_05d_img CNX_Chem_03_01_Ex01_06d_img CNX_Chem_04_04_saccharin_img CNX_Chem_20_01_HalAlkane_img CNX_Chem_20_01_HalAlkane3_img CNX_Chem_03_01_Ex01_05a_img CNX_Chem_20_01_HalAlkane2_img"
PYTHONDONTWRITEBYTECODE=1 FIGTEXT_PYLIBS=./pylibs python3 sources.py --json efnafraedi-2e $FIGS > "$D/resolved.json"
PYTHONDONTWRITEBYTECODE=1 FIGTEXT_PYLIBS=./pylibs python3 - "$D" <<'EOF'
import json, subprocess, sys
from pathlib import Path
import _deps  # noqa: F401 - pylibs on sys.path
import svgfix
D = Path(sys.argv[1])
GREEN, YELLOW = 'rgb(25%, 66.664124%, 33.331299%)', 'rgb(100%, 100%, 0%)'
for b, r in json.loads((D / 'resolved.json').read_text()).items():
    out, bare = D / b, D / f'{b}.bare.svg'
    subprocess.run(svgfix.pdftocairo_svg_argv(r['path'], bare), check=True, timeout=120)
    src = bare.read_text()
    p = subprocess.run([sys.executable, 'figure-prepare.py', r['path'], '--basename', b, '--out', str(out)],
                       capture_output=True, text=True)
    if p.returncode:   # verifier fix: a refused prepare writes no artwork.svg; name it instead of a FileNotFoundError
        print(f'{b} exit={p.returncode} {p.stderr.strip()[-300:]!r}')
        continue
    svg = (out / 'artwork.svg').read_text()
    removed = json.loads((out / 'annotations.json').read_text())['removed']
    sendable = json.loads((out / 'prepare.json').read_text())['sendable']
    print(f'{b} exit={p.returncode} source(green,yellow)=({src.count(GREEN)},{src.count(YELLOW)}) '
          f'removed={removed} artwork(green,yellow)=({svg.count(GREEN)},{svg.count(YELLOW)}) sendable={sendable}')
EOF
rm -rf "$D"
```
  Expected, as measured with this exact diff:
```text
CNX_Chem_03_01_Ex01_05d_img exit=0 source(green,yellow)=(1,0) removed={'/Popup': 1, '/Text': 1} artwork(green,yellow)=(0,0) sendable=0
CNX_Chem_03_01_Ex01_06d_img exit=0 source(green,yellow)=(2,0) removed={'/Popup': 2, '/Text': 2} artwork(green,yellow)=(0,0) sendable=0
CNX_Chem_04_04_saccharin_img exit=0 source(green,yellow)=(0,1) removed={'/Popup': 1, '/Text': 1} artwork(green,yellow)=(0,0) sendable=0
CNX_Chem_20_01_HalAlkane_img exit=0 source(green,yellow)=(1,0) removed={'/Popup': 1, '/Text': 1} artwork(green,yellow)=(0,0) sendable=0
CNX_Chem_20_01_HalAlkane3_img exit=0 source(green,yellow)=(1,0) removed={'/Popup': 1, '/Text': 1} artwork(green,yellow)=(0,0) sendable=0
CNX_Chem_03_01_Ex01_05a_img exit=0 source(green,yellow)=(0,0) removed={} artwork(green,yellow)=(0,0) sendable=0
CNX_Chem_20_01_HalAlkane2_img exit=0 source(green,yellow)=(0,0) removed={} artwork(green,yellow)=(0,0) sendable=0
```
  The `source(...)` column is the positive control: the same detector sees the icon in the unstripped source. `sendable=0` on all 7 confirms the classification is unchanged (they stay `copied-textless`). Any `exit=1` mentioning `AnnotationRefused` means the corpus holds a subtype the census did not see. Stop and report it; do not widen the allowlist without evidence.

- [ ] **Step 7: Docs (0 min): nothing in this task.** Register §C161 was re-measured and corrected on 2026-10-02 night: scope 5, the closed census, and the fix point in `strip-text.py` `main()`. Recording it as *built* is a status change, and that belongs to the register's ⏩ RESUME when PR-A merges (PR-A's own docs task), never to this commit. When that update is written, record mechanism and counts only. **Never quote the annotations' `/Contents` or `/T` author names** (third-party names; this repo is public).

- [ ] **Step 8: Commit (1 min).**
```bash
git add experiments/figure-text-translation/strip-text.py experiments/figure-text-translation/figure-prepare.py experiments/figure-text-translation/test_figure_prepare.py
git commit -m "fix(figures): §C161 — strip-text.py removes page-1 comment annotations, refuses any other subtype" -m "pdftocairo drew an editor's /Text comment (its /AP appearance) over an atom in 5 chemistry figures (ch03 Ex01_05d/06d, ch04 saccharin, ch20 HalAlkane/HalAlkane3). main() now deletes /Annots before pdf.save when every entry is /Text or /Popup, and raises AnnotationRefused, deleting nothing, for any other subtype. Each run writes out/annotations.json; figure-prepare.py turns a removal into one prepare.json warning, which the driver prints. Red-first section 13 in test_figure_prepare.py: instrument controls 13a/13b, byte identity with a no-/Annots page, a /Stamp refusal, and the refusal branches in process." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
  Add the executing session's `Claude-Session:` trailer as a further `-m`. `.py` files are outside lint-staged's globs, so the hook does not touch them. Afterwards, `git status --porcelain` must be empty.

**Carries into PR-B (not steps here):**
- The `--stale` pass's driver summary should list **exactly 5** `annotations removed from page 1: …` warnings: ch03 05d 1/1 and 06d 2/2, ch04 saccharin 1/1, ch20 HalAlkane 1/1 and HalAlkane3 1/1. It should show **0** `failed-prepare` reasons containing `AnnotationRefused`. Any other number means the prediction is wrong.
- The post-pass census must match both encodings: `rgb(25%, 66.664124%, 33.331299%)`/`rgb(100%, 100%, 0%)` and `#40aa55`/`#ffff00`. Today exactly these 5 `media/*_IS.svg` match, plus 7 `05-publication` copies (faithful ch03 included).
- `test_figure_prepare.py` runs in no CI job, so add it to the operator's one-time pre-flight list on the figure box beside `test_figrings.py`/`test_figsym.py`.


---

# Part 3 — §C140 ㉑: the visual line count, restricted to a block's OWN cues · ✅ drafted and verified

> Run each task's red-first test against unmodified HEAD before editing anything, and stop if it does not fail exactly as written.


**Goal:** a one-line source label whose stacked charge or same-size superscript `figtext.lines` splits off
(`nitrites (NO2|–`, `ammonium (NH4|+|)`, `NH4|+ (conjugate acid)`) is laid out as ONE line, on its own baseline,
while its block key still splits — so no bought key, sidecar value or `renderHash` moves (spec D3; register §C140 ㉑,
including its 2026-10-02 amendment).

**Rule (the register's, = instrument A of the frozen `evidence/2026-09-15-t23-review-fixes/instruments/code1_exposure.py`):**
merge consecutive `FT.lines` when the new line's first-run `proj` differs from the ACCUMULATED line's first-run `proj`
by `< 0.6 × 1.222 × max(first-run sizes)`, chained; an arc is returned unmerged. Measured plateau: 21 blocks in 14
figures for every fraction 0.5–0.8, 29 in 19 at 0.9 (rederive item `nitrogen`, both verifiers).

**Call sites — exactly these and no others:**

| Uses `FT.visual_lines` (new) | Keeps `FT.lines` (unchanged) |
|---|---|
| `compose.py` cues `n_src` / `starts` / `ends` / `projs` (HEAD :514–517) | `blockkey.block_lines` → `block_key` / `block_english` (:34) — the bought unit |
| `compose.py` `width()` font/colour index (HEAD :522) | `compose.localise_block` (:150) — kept path, numloc per source line |
| `compose.py` draw loop `fr` index (HEAD :527) | `figscripts.body_size` (:124) and `figscripts.token_lines` (:229) |
| `figcontainers.cell_alignment` own frames (HEAD :358) | `figcontainers.sibling_cues` — OTHER blocks' frames (:380) |
| `figcontainers.open_alignment` own frames (HEAD :403) | `figcontainers.free_box` obstacles — OTHER blocks' frames (:500) |

**Per-line font/colour after a merge:** `compose.py` indexes `vls[min(j, len(vls) - 1)][0]` — the first run of the
VISUAL line, which is the run that opens the source line (the body run on all 21 measured merges), so a drawn line
never takes a script run's font or colour. The draw-loop index is pinned by Task 3's V7 (through colour), and by a
named mutant that fails it; the `width()` index is not (every planted run shares one font, and 0 of the 48 census
merges mix weights, so a width-index mutant is equivalent there and on the corpus; see the test's docstring).

**Boundaries:**
- Branch `feat/c140-c49-step2-code-fixes` (PR-A). Code + tests + evidence only: no `books/` file, no media, no
  sidecar, and **no change to `COMPOSER_VERSION` or its docstring history line** — naming ㉑ there belongs to PR-B's
  '5' bump, which is what carries this change to readers.
- Between PR-A's merge and PR-B's bump, **no `tools/figure-run.js --force` on any chapter**: it would recompose
  Nitrogen or conjugate_img under '4' with the new composer, the two-vintage gap '4' was created to close.
  (`--stale` does not select those two while their sidecars carry '4'; the textless figures it does recompose
  through their mapping rows carry no text for ㉑ to move.)
- Run Tasks 1–3 consecutively; Task 4 measures the composer at Task 3's commit against the one before Task 1.
- Python suites here run in no CI job: `cd "$(git rev-parse --show-toplevel)/experiments/figure-text-translation" && FIGTEXT_PYLIBS=./pylibs python3 -u <file>`,
  expected tail `ALL PASS`. Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Icelandic in this section is EVIDENCE only: Task 3's test values and Task 4's expected output quote the committed
  sidecars `books/efnafraedi-2e/figure-text/CNX_Chem_18_07_Nitrogen.is.json` and
  `…/CNX_Chem_14_01_conjugate_img.is.json` (paid MT) verbatim. No value is written here.

### Task 1: `figtext.visual_lines` — the layout's visual line count

**Files:**
- Modify: `experiments/figure-text-translation/figtext.py` (insert after `lines()`, HEAD :62–67)
- Modify: `experiments/figure-text-translation/blockkey.py` (docstring of `block_lines`, HEAD :33)
- Test: `experiments/figure-text-translation/test_figscripts.py` (header bullet after HEAD :33; new section V after HEAD :338 `attempt('S7', s7)`)

**Interfaces:**
- Consumes: `figtext.lines(b)`, `figtext.proj(r)`, `figtext.is_arc(b)`; test fixtures `CONJ` and `BLOOD` (test_figscripts.py HEAD :288–303) and `census()` / `run()` / `check()` / `attempt()` of that file.
- Produces: `figtext.VISUAL_LEAD_FRACTION = 0.6`; `figtext.visual_lines(b) -> list[list[run]]` (same run dicts, source order; `lines(b)` for an arc or a one-line block). `blockkey.block_lines` / `block_key` unchanged (docstring only).

- [ ] **Step 1: Record the measurement base (before any ㉑ edit)**

```bash
cd "$(git rev-parse --show-toplevel)"
mkdir -p ~/.cache/namsbokasafn-audit/2026-10-03-c21 && git rev-parse HEAD > ~/.cache/namsbokasafn-audit/2026-10-03-c21/base.sha && cat ~/.cache/namsbokasafn-audit/2026-10-03-c21/base.sha
```
Expected: one 40-hex sha (the commit Task 4 measures as `before`).

- [ ] **Step 2: Write the failing test — header bullet and section V in `test_figscripts.py`**

In the module docstring, after the line (HEAD :33)
```
* S8 REAL `3px and 3px` - duplicate tokens name two false `absent` misses unless de-duplicated.
```
insert:
```
* V §C140 ㉑ REAL Nitrogen / conjugate / Blood - `figtext.visual_lines` merges a stacked charge or a same-size
  superscript into ONE visual line (V1-V4); a genuine two-line label does not merge (V5); FT.lines and `block_key`
  still split (V6, V7); the threshold is 0.6 of a lead (V8); an arc is never merged (V9); the measured CbcCltPckd
  `C|B|A` over-merge is pinned (V10); the threshold scales with the LARGER first-run size (V11).
```
Then, immediately after the line `attempt('S7', s7)` (HEAD :338) and its following blank line, insert:
```python
# --------------------------------------------------------------------------------------------
print('V §C140 ㉑ figtext.visual_lines: one visual line for the LAYOUT; FT.lines and the key never move')

# CNX_Chem_18_07_Nitrogen (send:true, bought 2026-09-21, drawn on 2-3 lines): REAL runs copied from the
# committed evidence/2026-09-15-t23-review-fixes/reports/code1-control-nitrogen/runs.json (rot 0, so
# x = along and y = proj). Fonts: R1165 LiberationSans -> 'R', R1170 STIXGeneral-Italic -> 'SI'.
NITRITES = [run('nitrites (NO', 9.0, 341.303, 67.8199, adv=45.507, font='R'),
            run('2', 7.0, 386.8081, 64.8199, adv=3.892, font='R'),
            run('–', 7.0, 390.7011, 72.3199, adv=3.5, font='SI')]
AMMONIUM = [run('ammonium (NH', 9.0, 221.794, 67.8199, adv=63.0, font='R'),
            run('4', 9.0, 284.803, 64.8379, adv=5.004, font='R'),
            run('+', 9.0, 289.8081, 72.3199, adv=6.075, font='SI'),
            run(')', 9.0, 295.8831, 67.8199, adv=2.997, font='R')]
# The same figure's genuine TWO-line label, one lead (11.0 pt) apart - the control that must not merge.
ATMOS = [run('Atmospheric', 9.0, 1.9118, 348.3417, adv=50.013, font='R'),
         run('nitrogen (N', 9.0, 1.9118, 337.3417, adv=44.514, font='R'),
         run('2', 7.0, 46.4325, 334.3417, adv=3.892, font='R'),
         run(')', 9.0, 50.3258, 337.3417, adv=2.997, font='R')]
# CNX_Chem_10_06_CbcCltPckd 'C|B|A' (send:FALSE): REAL census runs - three 9 pt letters on a diagonal,
# 5.76 and 5.0 pt apart along the normal. The rule merges C and B: the reason it is confined to a block's
# OWN cues and never feeds another block's frames (figcontainers.line_frames).
CBA = census([['C', 9.0, 298.64, 95.17, 6.5, 0.0, 'PAGE/R10'], ['B', 9.0, 289.27, 89.41, 6.0, 0.0, 'PAGE/R10'],
              ['A', 9.0, 278.23, 84.41, 6.0, 0.0, 'PAGE/R10']], {'PAGE/R10': 'R'})


def texts(ls):
    return [''.join(r['text'] for r in l) for l in ls]


def v_all():
    from blockkey import block_key
    check('V-pre FT.lines splits nitrites / ammonium / conjugate / Blood into 2 / 3 / 2 / 2 lines',
          [len(FT.lines(b)) for b in (NITRITES, AMMONIUM, CONJ, BLOOD)] == [2, 3, 2, 2],
          repr([texts(FT.lines(b)) for b in (NITRITES, AMMONIUM, CONJ, BLOOD)]))
    check('V1 REAL nitrites (NO2|– is ONE visual line holding all three runs, in source order',
          [[r['text'] for r in l] for l in FT.visual_lines(NITRITES)] == [['nitrites (NO', '2', '–']],
          repr(texts(FT.visual_lines(NITRITES))))
    check('V2 REAL ammonium (NH4|+|) - three FT.lines, chained - is ONE visual line',
          texts(FT.visual_lines(AMMONIUM)) == ['ammonium (NH4+)'], repr(texts(FT.visual_lines(AMMONIUM))))
    check('V3 REAL conjugate NH4|+ (conjugate acid) is ONE visual line',
          texts(FT.visual_lines(CONJ)) == ['NH4+ (conjugate acid)'], repr(texts(FT.visual_lines(CONJ))))
    check('V4 REAL Blood ... HCO3|– is ONE visual line', len(FT.visual_lines(BLOOD)) == 1,
          repr(texts(FT.visual_lines(BLOOD))))
    check('V5 control: REAL Atmospheric|nitrogen (N2), one lead apart, stays TWO visual lines',
          texts(FT.visual_lines(ATMOS)) == ['Atmospheric', 'nitrogen (N2)'], repr(texts(FT.visual_lines(ATMOS))))
    check('V6 the keys still split: block_key is built on FT.lines, so no bought key moves',
          [block_key(b) for b in (NITRITES, AMMONIUM, CONJ)]
          == ['nitrites (NO2|–', 'ammonium (NH4|+|)', 'NH4|+ (conjugate acid)'],
          repr([block_key(b) for b in (NITRITES, AMMONIUM, CONJ)]))
    check('V7 FT.lines still returns 2 / 3 lines after visual_lines ran (nothing is merged in place)',
          len(FT.lines(NITRITES)) == 2 and len(FT.lines(AMMONIUM)) == 3)
    # the threshold, at 9 pt: one lead is 10.998 pt, so 0.59 lead (6.489 pt) merges and 0.61 lead (6.709 pt)
    # does not. Both pairs are two FT.lines (each step is >= 0.5 x 9 = 4.5 pt).
    near_ = [run('Aa', 9.0, 0.0, 100.0), run('Bb', 9.0, 12.0, 100.0 + 0.59 * 1.222 * 9.0)]
    far_ = [run('Aa', 9.0, 0.0, 100.0), run('Bb', 9.0, 12.0, 100.0 + 0.61 * 1.222 * 9.0)]
    check('V8 the merge threshold is 0.6 of a lead: 0.59 lead merges, 0.61 lead does not',
          len(FT.lines(near_)) == 2 and len(FT.lines(far_)) == 2
          and len(FT.visual_lines(near_)) == 1 and len(FT.visual_lines(far_)) == 2
          and FT.VISUAL_LEAD_FRACTION == 0.6,
          f'{len(FT.visual_lines(near_))} {len(FT.visual_lines(far_))} {getattr(FT, "VISUAL_LEAD_FRACTION", None)}')
    # an ARC (four single-glyph runs) whose steps of 5 pt the rule WOULD merge pairwise is returned as FT.lines
    arc = [run('a', 9.0, 0.0, 0.0), run('b', 9.0, 6.0, 5.0), run('c', 9.0, 12.0, 10.0), run('d', 9.0, 18.0, 15.0)]
    check('V9 an arc is returned as FT.lines, unmerged (FT.is_arc, 4 FT.lines)',
          FT.is_arc(arc) and len(FT.lines(arc)) == 4 and texts(FT.visual_lines(arc)) == texts(FT.lines(arc)),
          repr(texts(FT.visual_lines(arc))))
    check('V10 REAL CbcCltPckd C|B|A: 3 FT.lines, and the rule merges C and B - pinned as measured',
          len(FT.lines(CBA)) == 3 and texts(FT.visual_lines(CBA)) == ['CB', 'A'], repr(texts(FT.visual_lines(CBA))))
    # the threshold's SIZE is the LARGER first-run size of the two lines (instrument A's max): 6.0 pt apart, a
    # 9 pt / 7 pt pair merges whichever line holds the 9 pt run (6.0 < 0.6 x 1.222 x 9 = 6.60); sized by min, or
    # by either line's own first run, one of the two does not (0.6 x 1.222 x 7 = 5.13). Census-equivalent today
    # (0 of 14,962 blocks change), so this pins the rule, not a measured case.
    big_first = [run('Aa', 9.0, 0.0, 100.0), run('b', 7.0, 12.0, 106.0)]
    small_first = [run('a', 7.0, 0.0, 100.0), run('Bb', 9.0, 12.0, 106.0)]
    check('V11 the threshold scales with the LARGER of the two first-run sizes (9 pt over 7 pt, either order)',
          [len(FT.lines(b)) for b in (big_first, small_first)] == [2, 2]
          and [len(FT.visual_lines(b)) for b in (big_first, small_first)] == [1, 1],
          repr([texts(FT.visual_lines(b)) for b in (big_first, small_first)]))


attempt('V', v_all)
```

- [ ] **Step 3: Run it — expect FAIL**

```bash
cd "$(git rev-parse --show-toplevel)/experiments/figure-text-translation" && FIGTEXT_PYLIBS=./pylibs python3 -u test_figscripts.py; echo EXIT=$?
```
Expected: `PASS  V-pre FT.lines splits nitrites / ammonium / conjugate / Blood into 2 / 3 / 2 / 2 lines`, then
`FAIL  V (raised): AttributeError: module 'figtext' has no attribute 'visual_lines'`, tail `1 FAILED: V (raised)`,
`EXIT=1` (`attempt()` turns the missing function into one FAIL; every S/T/B/W check still passes).

- [ ] **Step 4: Write the implementation — `figtext.py`**

Insert after `lines()` — i.e. after the line `    out.append(buf); return out` (HEAD :67) — leaving the existing
blank line before `def alignment(b, measure):`:
```python

# §C140 ㉑: two `lines` whose first runs sit closer than this fraction of a LEAD (1.222 x size) along the
# text normal are ONE visual line. MEASURED, NOT CHOSEN: over the 2,925 send:true non-arc blocks of the
# 2026-09-13 census the merges are flat at 21 blocks in 14 figures for every fraction 0.5-0.8 and jump to
# 29 in 19 at 0.9; the nearest genuine two-line labels sit 0.806 and 0.837 of a lead apart, the widest
# charge/superscript split 0.409 (design spec docs/superpowers/specs/2026-10-02-c140-step2-recompose-pass-
# design.md, D3). `visual_lines` IS instrument A of the frozen
# evidence/2026-09-15-t23-review-fixes/instruments/code1_exposure.py (`visual_a`), plus the arc carve-out.
# Re-measure before moving it; do not tune it.
VISUAL_LEAD_FRACTION = 0.6


def visual_lines(b):
    """`lines(b)` with consecutive lines that sit on ONE visual line merged - §C140 ㉑.

    `lines` splits on a baseline jump >= 0.5 x size, so a one-line source label with a stacked charge
    or a same-size superscript - `nitrites (NO2|–`, `ammonium (NH4|+|)`, `NH4|+ (conjugate acid)` -
    reads as 2-3 lines, and a layout that counts source lines with it draws the translation on 2-3
    lines. Line i+1 merges onto the ACCUMULATED line when its first run's proj differs from the
    accumulated line's FIRST run's proj by < VISUAL_LEAD_FRACTION x 1.222 x the larger of the two
    first-run sizes; chains merge onto the accumulated line. An arc (`is_arc`) is returned as
    `lines(b)`: its runs are not lines. A merged line's first run is the run that opens the source
    line, and compose.py reads that line's baseline (`projs`), font and colour from it: on all 21
    measured merges it is the body run, never the script.

    🔴 FOR THE LAYOUT'S OWN LINE COUNT AND SOURCE CUES ONLY - compose.py's `n_src` / `starts` /
    `ends` / `projs` and its per-line font index, and figcontainers' `own_line_frames` (the block's
    OWN cell / open alignment). NEVER the block key: `blockkey.block_lines` stays on `lines`, so no
    bought key, sidecar value or renderHash moves. NEVER another block's frames: `line_frames` (sibling
    cues, free-box obstacles) stays on `lines`, because this rule merges a genuine diagonal kept label
    (CNX_Chem_10_06_CbcCltPckd `C|B|A`: 3 lines -> 2) and would move the frames neighbouring labels align against and avoid in up to 18
    bought figures (measured 2026-10-03, applied to every block: ONE drawn label moves,
    CNX_Chem_17_02_Galvanicel `Flow of cations`, align right -> center)."""
    ls = lines(b)
    if is_arc(b) or len(ls) < 2:
        return ls
    out = [ls[0]]
    for l in ls[1:]:
        p = out[-1]
        s = max(p[0]['size'], l[0]['size'])
        if abs(proj(l[0]) - proj(p[0])) < VISUAL_LEAD_FRACTION * 1.222 * s:
            out[-1] = p + l
        else:
            out.append(l)
    return out
```

In `blockkey.py` replace (HEAD :33)
```python
    """The block's text, one string per visual line, in reading order."""
```
with
```python
    """The block's text, one string per `figtext.lines` line, in reading order.

    ⚠️ `figtext.lines`, NEVER `figtext.visual_lines` (§C140 ㉑): the layout counts VISUAL lines, but
    this is the bought unit - moving it to visual lines would change 20 bought keys in 13 figures and
    make figure-compose.py refuse every one of them."""
```

- [ ] **Step 5: Run it — expect PASS**

```bash
cd "$(git rev-parse --show-toplevel)/experiments/figure-text-translation" && FIGTEXT_PYLIBS=./pylibs python3 -u test_figscripts.py; echo EXIT=$?
```
Expected: `PASS` on V-pre and V1–V11 (V11 `[['Aab'], ['aBb']]`, V1 `['nitrites (NO2–']`, V2 `['ammonium (NH4+)']`, V5 `['Atmospheric', 'nitrogen (N2)']`,
V8 `1 2 0.6`, V10 `['CB', 'A']`), tail `ALL PASS`, `EXIT=0`.

- [ ] **Step 6: Commit**

```bash
cd "$(git rev-parse --show-toplevel)"
git add experiments/figure-text-translation/figtext.py experiments/figure-text-translation/blockkey.py experiments/figure-text-translation/test_figscripts.py
git commit -m "feat(figures): §C140 ㉑ — figtext.visual_lines, the layout's visual line count (the key stays on FT.lines)" -m "Rule A of the frozen code1_exposure instrument: merge consecutive FT.lines whose first-run proj is within 0.6 of a lead of the accumulated line's, chained; an arc is never merged. Nothing consumes it yet." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 2: a block's OWN cell/open alignment reads its visual lines; other blocks' frames stay on `FT.lines`

**Files:**
- Modify: `experiments/figure-text-translation/figcontainers.py` (`line_frames` HEAD :139–141; `cell_alignment` HEAD :358; `open_alignment` HEAD :403)
- Test: `experiments/figure-text-translation/test_figcontainers.py` (new case 12 before the final `print('\nALL PASS' …)`, HEAD :427)

**Interfaces:**
- Consumes: `figtext.visual_lines` (Task 1); `figcontainers.source_frame`, `container_for`, `cell_alignment(block, left_margin, right_margin)`; test helpers `run(x, y, text, size, rot, adv)`, `page()`, `blank()`, `check()`, `H`.
- Produces: `figcontainers.own_line_frames(block) -> list[(a0, a1, n0, n1)]`; `cell_alignment` / `open_alignment` read it. `line_frames` (FT.lines) is unchanged and still feeds `sibling_cues` and `free_box`.

- [ ] **Step 1: Write the failing test — case 12 in `test_figcontainers.py`**

Insert immediately before the final two lines (HEAD :427–428)
```python
print('\nALL PASS' if not fails else f'\n{len(fails)} FAILED: ' + ', '.join(fails))
sys.exit(1 if fails else 0)
```
this block (followed by one blank line):
```python
print('\n== 12. §C140 ㉑ a block\'s OWN alignment reads its VISUAL lines; other blocks\' frames stay on FT.lines')
# REAL CNX_Chem_18_07_Nitrogen geometry, copied from the committed
# evidence/2026-09-15-t23-review-fixes/reports/code1-control-nitrogen/runs.json (rot 0): 'nitrites (NO'
# 9 pt, its subscript '2' 7 pt, the charge '–' 7 pt raised 4.5 pt - FT.lines puts the charge on a line of
# its own - and the kept ')' that closes the formula: a SEPARATE block, flush against the charge.
NITRITES = [run(341.303, 67.8199, 'nitrites (NO', size=9.0, adv=45.507),
            run(386.8081, 64.8199, '2', size=7.0, adv=3.892),
            run(390.7011, 72.3199, '–', size=7.0, adv=3.5)]
PAREN = [run(394.2011, 67.8199, ')', size=9.0, adv=2.997)]
check('fixture: FT.lines splits the nitrites block in two - the frames OTHER blocks see',
      len(FC.line_frames(NITRITES)) == 2, str(FC.line_frames(NITRITES)))
c = FC.container_for(0, [NITRITES, PAREN], page(), blank(), H)
check('open: the label flush against its kept ")" is ONE line -> right, single-flush (was multi-line)',
      c['align'] == 'right' and c['align_why'].startswith('single-flush'), f"{c['align']} {c['align_why']}")
al, why = FC.cell_alignment(NITRITES, 6.0, 3.5)
check('cell: the same label takes the single-line margin rule (margins 6.0 / 3.5 -> center), not multi-line',
      al == 'center' and why.startswith('cell-single-margins'), f'{al} {why}')
# control: the same figure's genuine two-line label, one lead apart, is still multi-line in a cell
ATMOS = [run(1.9118, 348.3417, 'Atmospheric', size=9.0, adv=50.013),
         run(1.9118, 337.3417, 'nitrogen (N', size=9.0, adv=44.514),
         run(46.4325, 334.3417, '2', size=7.0, adv=3.892),
         run(50.3258, 337.3417, ')', size=9.0, adv=2.997)]
al, why = FC.cell_alignment(ATMOS, 6.0, 3.5)
check('control: Atmospheric|nitrogen (N2) stays multi-line in a cell', why.startswith('multi'), f'{al} {why}')
# PIN - passes before ㉑ by design; it fails only if ANOTHER block's frames move onto visual lines.
# REAL CNX_Chem_10_06_CbcCltPckd 'C|B|A' (send:false, 2026-09-13 census): three 9 pt letters on a diagonal.
# figtext.visual_lines merges C and B (5.76 pt apart), which would start their frame at B's 289.27. A
# single-line label whose LEFT edge sits on C's own left edge (298.64) is cued left only by C's own frame.
CBA = [run(298.64, 95.17, 'C', size=9.0, adv=6.5), run(289.27, 89.41, 'B', size=9.0, adv=6.0),
       run(278.23, 84.41, 'A', size=9.0, adv=6.0)]
check('fixture: C|B|A is three FT.lines frames', len(FC.line_frames(CBA)) == 3, str(FC.line_frames(CBA)))
CUED = [run(298.64, 150.0, 'Label', size=9.0, adv=40.0)]
c = FC.container_for(0, [CUED, CBA], page(), blank(), H)
check('pin: a sibling cue reads the OTHER block\'s FT.lines frames (C\'s left edge 298.64 -> left)',
      c['align'] == 'left' and c['align_why'] == 'single-cue-left-only->left', f"{c['align']} {c['align_why']}")
# PIN 2 - the OBSTACLE half, which the sibling-cue pin above cannot see: free_box reads line_frames too. A 7 pt
# label left of C|B|A, above B's glyph box (top 95.98) and level with C's (93.28-101.74): its rightward free-box
# rays pass over B and stop at C's left edge, 298.64. The merged C+B visual frame would stop them at B's 289.27.
LEFT = [run(250.0, 97.07, 'Label', size=7.0, adv=20.0)]
fb = FC.free_box(0, [LEFT, CBA], blank(), H)
check('pin: a free-box ray stops at the OTHER block\'s FT.lines frames (C\'s left edge 298.64, not B\'s 289.27)',
      abs(fb['FR'] - 298.64) <= FC.MARCH_STEP and fb['by']['right'] == 'hit', f"FR {fb['FR']} {fb['by']['right']}")
```

- [ ] **Step 2: Run it — expect FAIL**

```bash
cd "$(git rev-parse --show-toplevel)/experiments/figure-text-translation" && FIGTEXT_PYLIBS=./pylibs python3 -u test_figcontainers.py; echo EXIT=$?
```
Expected (on Task 1's commit): two FAILs, both reading `right multi(margin 22.95)->right` — `open: the label flush
against its kept ")" is ONE line …` and `cell: the same label takes the single-line margin rule …` — because both
alignments still count the block's two FT.lines frames. The two fixture checks, the Atmospheric control and the
two `pin:` checks PASS (neither pin is red-first: Step 6 proves them against mutants). Tail `2 FAILED: …`, `EXIT=1`.

- [ ] **Step 3: Write the implementation — `figcontainers.py`**

Replace (HEAD :139–141)
```python
def line_frames(block):
    """source_frame of each FT.lines line of the block."""
    return [source_frame(l) for l in FT.lines(block)]
```
with
```python
def line_frames(block):
    """source_frame of each FT.lines line of the block - for ANOTHER block's sibling cues and free-box
    obstacles. ⚠️ Stays on FT.lines (§C140 ㉑): `figtext.visual_lines` merges a genuine diagonal kept
    label (CbcCltPckd `C|B|A`), and these frames are what neighbouring labels align against and avoid."""
    return [source_frame(l) for l in FT.lines(block)]


def own_line_frames(block):
    """source_frame of each VISUAL line of the block (`figtext.visual_lines`) - for the block's OWN
    alignment only (`cell_alignment`, `open_alignment`), §C140 ㉑: a one-line source label with a
    stacked charge (`nitrites (NO2|–`) is a single-line label there, not a two-line one. Equal to
    `line_frames` for every block whose visual lines are its FT.lines."""
    return [source_frame(l) for l in FT.visual_lines(block)]
```
In `cell_alignment` replace (HEAD :358)
```python
    frames = line_frames(block)
```
with
```python
    frames = own_line_frames(block)
```
In `open_alignment` replace (HEAD :403)
```python
    frames = line_frames(blocks[index])
```
with
```python
    frames = own_line_frames(blocks[index])
```
Leave `sibling_cues` (`for a0, a1, _, _ in line_frames(other):`, HEAD :380) and `free_box` (`for f in line_frames(other)]`,
HEAD :500) as they are.

- [ ] **Step 4: Run it — expect PASS**

```bash
cd "$(git rev-parse --show-toplevel)/experiments/figure-text-translation" && FIGTEXT_PYLIBS=./pylibs python3 -u test_figcontainers.py; echo EXIT=$?
```
Expected: case 12 all PASS — `right single-flush(tight 0.00, ratio inf)->right`, `center cell-single-margins(ratio 1.71)->center`,
`left multi(margin 0.70)->left`, `left single-cue-left-only->left`, `FR 298.75 hit` — every earlier case unchanged, tail `ALL PASS`, `EXIT=0`.

- [ ] **Step 5: Commit**

```bash
cd "$(git rev-parse --show-toplevel)"
git add experiments/figure-text-translation/figcontainers.py experiments/figure-text-translation/test_figcontainers.py
git commit -m "feat(figures): §C140 ㉑ — a block's own cell/open alignment reads its visual lines; other blocks' frames stay on FT.lines" -m "Applied in line_frames for every block, the rule merges CbcCltPckd's kept diagonal C|B|A and moves neighbour frames in up to 18 bought figures, so sibling cues and free-box obstacles keep FT.lines (pinned)." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 6: Prove the pin against its named mutant (`line_frames` on visual lines), golden-copy discipline**

```bash
cd "$(git rev-parse --show-toplevel)/experiments/figure-text-translation"
G=~/.cache/namsbokasafn-audit/2026-10-03-c21/figcontainers.py.golden
cp figcontainers.py "$G"
python3 - <<'EOF'
from pathlib import Path
p = Path('figcontainers.py'); s = p.read_text()
a = "    return [source_frame(l) for l in FT.lines(block)]\n"
assert s.count(a) == 1, s.count(a)
p.write_text(s.replace(a, "    return [source_frame(l) for l in FT.visual_lines(block)]\n"))
EOF
FIGTEXT_PYLIBS=./pylibs python3 -u test_figcontainers.py > ~/.cache/namsbokasafn-audit/2026-10-03-c21/mutant-line-frames.log 2>&1; echo EXIT=$?
grep -a "FAIL" ~/.cache/namsbokasafn-audit/2026-10-03-c21/mutant-line-frames.log
cp "$G" figcontainers.py && cmp figcontainers.py "$G" && git diff --quiet -- figcontainers.py && echo RESTORED
```
Expected: `EXIT=1`; exactly four FAILs — `fixture: FT.lines splits the nitrites block in two …`, `fixture: C|B|A is three FT.lines frames …`,
`pin: a sibling cue reads the OTHER block's FT.lines frames … : center single-cue(L0C0R0)->center` and `pin: a free-box ray stops at the OTHER block's FT.lines frames … : FR 289.5 hit` — then `RESTORED`.
(No case 1–11 check fails under this mutant: the two pins are the only guards on it.) Then mutate each half ALONE, with the same golden-copy restore and `cmp` after each: `for a0, a1, _, _ in line_frames(other):` → `own_line_frames(other)` (sibling cues) gives exactly one FAIL, the sibling-cue pin (`center single-cue(L0C0R0)->center`); `for f in line_frames(other)]` → `own_line_frames(other)]` (free-box obstacles) gives exactly one FAIL, the free-box pin (`FR 289.5 hit`). Then `git status --porcelain` → empty.

### Task 3: `compose.py` lays a label out by its VISUAL source lines (n_src, cues, per-line font/colour)

**Files:**
- Modify: `experiments/figure-text-translation/compose.py` (HEAD :359–360 and :513–527)
- Modify: `experiments/figure-text-translation/figlayout.py` (module docstring, HEAD :23)
- Create: `experiments/figure-text-translation/test_compose_visual_lines.py`

**Interfaces:**
- Consumes: `figtext.visual_lines` (Task 1); `figcontainers.own_line_frames` via `container_for` (Task 2); `figure-prepare.py <artwork> --basename <b> --out <dir>`; `compose.py --translations <path> --svg` with `FIGTEXT_OUT`; `fixtures/fixture_figure.pdf` (page 300 × 220, font key `PAGE/F1`); `figis.face_path`.
- Produces: compose.py local `vls = FT.visual_lines(b)` feeding `cues` (`n_src`, `starts`, `ends`, `projs`), `width()` and the draw loop's `fr`; the `ls` local is removed. `figlayout.decide` is unchanged.

- [ ] **Step 1: Write the failing test — create `test_compose_visual_lines.py`**

```python
#!/usr/bin/env python3
"""§C140 ㉑, end to end: a ONE-line source label whose stacked charge or same-size superscript
`figtext.lines` splits off is laid out as ONE line - and its block key still splits.

    FIGTEXT_PYLIBS=./pylibs python3 test_compose_visual_lines.py

Design: docs/superpowers/specs/2026-10-02-c140-step2-recompose-pass-design.md, D3; campaign
register §C140 ㉑. The defect, as committed on 2026-09-21 in two bought figures: compose.py counted
source lines with FT.lines, so `nitrites (NO2|–` (n_src 2) was drawn `nítrít` above `(NO2 –`, the
kept `)` that closes the formula left 3.249 pt off both baselines, and `ammonium (NH4|+|)` (n_src 3)
on three lines.

WHAT IS PLANTED, AND FROM WHERE
-------------------------------
The committed fixture (`fixtures/fixture_figure.pdf`) is prepared into a temporary directory, its
`runs.json` is REPLACED and its artwork REPLACED with a blank page plus one stroked box - the
test_compose_t23.py pattern. Every run uses the fixture's own font key `PAGE/F1`.
* AMMONIUM, NITRITES and the separate kept `)` - REAL geometry, copied from the committed
  evidence/2026-09-15-t23-review-fixes/reports/code1-control-nitrogen/runs.json (sizes, baselines,
  advances), shifted 200 pt left as ONE group so their mutual geometry is the figure's own.
* CONJ - REAL geometry from the 2026-09-13 census (test_figscripts.py's `CONJ`), shifted
  (-200, +60): `NH4|+ (conjugate acid)`, `+` 7 pt raised 4 pt.
* BOXED - CONJ's first three runs with a SHORT tail (` (acid)`), inside a stroked box sized so the
  value cannot fit on one line at the 7.5 pt floor but fits on two at 9 pt. Its `+` is RED. This is
  the only arm whose layout draws MORE lines than the source has visual lines, i.e. the only one in
  which the per-line font/colour index `j >= 1` is read after a merge.
The values are NOT translations written for this test: each is quoted verbatim from a committed
sidecar (paid MT) - books/efnafraedi-2e/figure-text/CNX_Chem_18_07_Nitrogen.is.json for the two
Nitrogen keys, CNX_Chem_14_01_conjugate_img.is.json for CONJ - and BOXED reuses CONJ's value only
for its known width.

RED-FIRST, AND WHAT IS NOT. V1, V2, V4, V5 and V7 FAIL on the composer before ㉑ (it draws 2-3
lines, the nitrites baseline 3.249 pt off its `)`, and the boxed label's second line in the red of
the `+` run that opens FT.lines line 2). The controls are not red-first and must pass on both sides:
C1 (the block keys still split - the bought keys did not move), V3 (the nitrites line ends on its
`)`: the old composer right-aligned its two lines there too), V6 (the boxed label is drawn on two
lines - without it V7 would be vacuous) and T1 (the drawn pieces reproduce each value's words).
NOT PINNED: `width()`'s line index. `seg_width` reads only `bold` from the run it is handed and every planted
run is `PAGE/F1`, so indexing `width()` by FT.lines instead passes this file (measured); 0 of the 48 blocks
`visual_lines` merges in the 2026-09-13 census mix weights, so that mutant is equivalent on the corpus too.
"""
import ast
import json
import math
import os
import re
import subprocess
import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent          # never process.cwd() - repo rule
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE / 'pylibs'))
os.environ.setdefault('FIGTEXT_PYLIBS', str(HERE / 'pylibs'))
os.environ['SOURCE_DATE_EPOCH'] = '1700000000'  # BEFORE any child is spawned
os.environ['PYTHONDONTWRITEBYTECODE'] = '1'
sys.dont_write_bytecode = True

import cairo                                                  # noqa: E402
import figtext as FT                                          # noqa: E402
import figcontainers as FC                                    # noqa: E402
from blockkey import block_key, block_lines, block_english    # noqa: E402
from fontTools.ttLib import TTFont                            # noqa: E402
from PIL import Image                                         # noqa: E402

PREPARE = HERE / 'figure-prepare.py'
COMPOSE = HERE / 'compose.py'
FIXTURE = HERE / 'fixtures' / 'fixture_figure.pdf'
PAGE_W, PAGE_H = 300.0, 220.0
BLACK = ['cmyk', 0.0, 0.0, 0.0, 1.0]
RED = ['cmyk', 0.0, 1.0, 1.0, 0.0]

# The fixture's own /Widths, read out of make_fixture.py WITHOUT importing it (it needs pikepdf).
_mf = ast.parse((HERE / 'make_fixture.py').read_text())
_W = next(ast.literal_eval(n.value) for n in _mf.body if isinstance(n, ast.Assign)
          and any(getattr(t, 'id', None) == 'WIDTHS' for t in n.targets))
_FIRST = next(ast.literal_eval(n.value)[0] for n in _mf.body if isinstance(n, ast.Assign)
              and isinstance(n.targets[0], ast.Tuple)
              and [e.id for e in n.targets[0].elts] == ['FIRST_CHAR', 'LAST_CHAR'])

fails = []


def check(label, ok, detail=''):
    print(f"  {'PASS' if ok else 'FAIL'}  {label}" + (f": {detail}" if detail else ''), flush=True)
    if not ok:
        fails.append(label)


def finish():
    print(f"\n{'ALL PASS' if not fails else str(len(fails)) + ' FAILED: ' + ', '.join(fails)}")
    sys.exit(1 if fails else 0)


def precondition(label, ok, detail=''):
    check('PRECONDITION ' + label, ok, detail)
    if not ok:
        finish()


def fixture_adv(text, size):
    return round(sum(_W[ord(c) - _FIRST] for c in text) * size / 1000.0, 3)


def run(text, size, x, y, adv, fill=BLACK):
    return dict(text=text, font='PAGE/F1', size=size, rot=0.0, x=x, y=y, adv=adv,
                fill=fill, tm=[1.0, 0.0, 0.0, 1.0, x, y])


_FACES = {}


def text_adv(text, size, bold=False, italic=False):
    """The drawn width, from the face FILES with fontTools - independent of compose.py's cairo
    measure (test_compose_t23.py's instrument)."""
    from figis import face_path
    k = (bool(bold), bool(italic))
    if k not in _FACES:
        f = TTFont(str(face_path(k)))
        _FACES[k] = (f.getBestCmap(), f['hmtx'], f['head'].unitsPerEm)
    cmap, hmtx, upm = _FACES[k]
    return sum(hmtx[cmap.get(ord(c), '.notdef')][0] for c in text) * size / upm


def elements(svg_text):
    """[{text, x, y (SVG, y down), size, fill, layout, raw}] in document order. `layout` is True
    for a LAID-OUT segment (svgout draws those, and only those, with font-kerning:none - ⑥b)."""
    out = []
    for m in re.finditer(r'<text ([^>]*)>([^<]*)</text>', svg_text):
        a = dict(re.findall(r'([\w:-]+)="([^"]*)"', m.group(1)))
        t = m.group(2).replace('&lt;', '<').replace('&gt;', '>').replace('&amp;', '&')
        out.append(dict(text=t, x=float(a['x']), y=float(a['y']), size=float(a['font-size']),
                        fill=a.get('fill'), bold=a.get('font-weight') == '700',
                        italic=a.get('font-style') == 'italic',
                        layout='font-kerning:none' in a.get('style', ''), raw=m.group(0)))
    return out


def group_lines(els):
    """Lines BY GEOMETRY (test_compose_t23.py's rule): base-size elements clustered on the baseline
    (gap < 0.5 lead), every element assigned to the nearest cluster, each line ordered along x."""
    if not els:
        return []
    base = max(e['size'] for e in els)
    lead = 1.222 * base
    ys = sorted(e['y'] for e in els if abs(e['size'] - base) < 1e-6)
    clusters = []
    for y in ys:
        if clusters and abs(y - clusters[-1][-1]) < 0.5 * lead:
            clusters[-1].append(y)
        else:
            clusters.append([y])
    cs = [c[0] for c in clusters]
    lines = [[] for _ in cs]
    for e in els:
        lines[min(range(len(cs)), key=lambda j: abs(cs[j] - e['y']))].append(e)
    return [sorted(l, key=lambda e: e['x']) for l in lines]


# ── the plant ──────────────────────────────────────────────────────────────────────────────
DX = -200.0                       # the Nitrogen group, moved as one onto the 300 x 220 page
K_AMM, K_NIT, K_PAREN = 'ammonium (NH4|+|)', 'nitrites (NO2|–', ')'
K_CONJ, K_BOX = 'NH4|+ (conjugate acid)', 'NH4|+ (acid)'
AMMONIUM = [run('ammonium (NH', 9.0, 221.794 + DX, 67.8199, 63.0),
            run('4', 9.0, 284.803 + DX, 64.8379, 5.004),
            run('+', 9.0, 289.8081 + DX, 72.3199, 6.075),
            run(')', 9.0, 295.8831 + DX, 67.8199, 2.997)]
NITRITES = [run('nitrites (NO', 9.0, 341.303 + DX, 67.8199, 45.507),
            run('2', 7.0, 386.8081 + DX, 64.8199, 3.892),
            run('–', 7.0, 390.7011 + DX, 72.3199, 3.5)]
PAREN = [run(')', 9.0, 394.2011 + DX, 67.8199, 2.997)]
CX, CY = -200.0, 60.0
CONJ = [run('NH', 9.0, 244.92 + CX, 122.32 + CY, 13.0),
        run('4', 7.0, 257.92 + CX, 119.32 + CY, 3.89),
        run('+', 7.0, 261.81 + CX, 126.32 + CY, 4.09),
        run(' (conjugate acid)', 9.0, 265.9 + CX, 122.32 + CY, 66.53)]
BX, BY = 200.0, 150.0             # BOXED: CONJ's offsets from its own first run, a short tail
BOXED = [run('NH', 9.0, BX, BY, 13.0),
         run('4', 7.0, BX + 13.0, BY - 3.0, 3.89),
         run('+', 7.0, BX + 16.89, BY + 4.0, 4.09, fill=RED),
         run(' (acid)', 9.0, BX + 20.98, BY, fixture_adv(' (acid)', 9.0))]
# Quoted verbatim from committed sidecars (paid MT), never written for this test - see the docstring.
V_AMM, V_NIT, V_CONJ = 'ammóníum (NH4 + )', 'nítrít (NO2 –', 'NH4 + (samoka sýra)'
TR = {K_AMM: V_AMM, K_NIT: V_NIT, K_CONJ: V_CONJ, K_BOX: V_CONJ}

# BOXED's box: a stroked rect, lw 1.0 (inner inset 0.5), with pad 2.0 the width budget is
# (x1 - x0 - 1) - 4. It must lie strictly between the value's widest 2-line min-max partition at 9 pt
# and its one-line width at the 7.5 pt floor - measured below, as a precondition.
BOX = (BX - 10.0, BY - 10.0, BX + 59.0, BY + 20.0)       # page x0 y0 x1 y1
BOX_BUDGET = (BOX[2] - BOX[0] - 1.0) - 4.0


def art(ctx):
    ctx.set_source_rgb(1, 1, 1)
    ctx.paint()
    ctx.set_source_rgb(0, 0, 0)
    ctx.set_line_width(1.0)
    x0, y0, x1, y1 = BOX
    ctx.rectangle(x0, PAGE_H - y1, x1 - x0, y1 - y0)
    ctx.stroke()


def one_line_width(value, size):
    """Upper bound on the drawn one-line width: every character at `size` (a styled subscript is
    drawn smaller, so the real line is no wider)."""
    return text_adv(value, size)


def minmax2_width(value, size):
    """The widest line of the best 2-line partition of `value`'s words at `size`, all characters at
    `size` (an upper bound, as above)."""
    w = value.split()
    return min(max(text_adv(' '.join(w[:k]), size), text_adv(' '.join(w[k:]), size))
               for k in range(1, len(w)))


TMP = tempfile.TemporaryDirectory(prefix='c21-visual-lines-')
out = Path(TMP.name) / 'fig'
env = dict(os.environ)
env.pop('FIGTEXT_OUT', None)
prep = subprocess.run([sys.executable, str(PREPARE), str(FIXTURE), '--basename', 'CNX_Fixture_c21',
                       '--out', str(out)], capture_output=True, text=True, env=env)
precondition('the fixture prepares', prep.returncode == 0, prep.stderr.strip()[-400:])
(out / 'runs.json').write_text(json.dumps(AMMONIUM + NITRITES + PAREN + CONJ + BOXED, ensure_ascii=False))
pdf = out / 'artwork.pdf'
surf = cairo.PDFSurface(str(pdf), PAGE_W, PAGE_H)
art(cairo.Context(surf))
surf.finish()
r = subprocess.run(['pdftocairo', '-png', '-r', '200', '-singlefile', str(pdf), str(out / 'artwork')],
                   capture_output=True, text=True)
precondition('the planted artwork renders', r.returncode == 0 and (out / 'artwork.png').exists(), r.stderr[-300:])

runs = json.loads((out / 'runs.json').read_text())
fonts = json.loads((out / 'meta.json').read_text())['fonts']
blocks = FT.merge_blocks(FT.group(runs))
entries = [dict(key=block_key(b), english=block_english(b), lines=block_lines(b), arc=FT.is_arc(b),
                send=FT.sendable(b, block_english(b), fonts)) for b in blocks]
(out / 'blocks.json').write_text(json.dumps(entries, indent=1, ensure_ascii=False))
keys = [e['key'] for e in entries]
precondition('the plant groups into exactly the five planted blocks, keys split by FT.lines',
             keys == [K_AMM, K_NIT, K_PAREN, K_CONJ, K_BOX], repr(keys))
by_key = dict(zip(keys, blocks))
precondition('FT.lines splits every planted label (3, 2, 2, 2 lines) - the defect\'s precondition',
             [len(FT.lines(by_key[k])) for k in (K_AMM, K_NIT, K_CONJ, K_BOX)] == [3, 2, 2, 2],
             repr([len(FT.lines(by_key[k])) for k in (K_AMM, K_NIT, K_CONJ, K_BOX)]))
pg = FC.load_page(pdf)
dark = Image.open(out / 'artwork.png').convert('L')
cls = {k: FC.container_for(keys.index(k), blocks, pg, dark, PAGE_H)['cls'] for k in (K_AMM, K_NIT, K_CONJ, K_BOX)}
precondition('containers: ammonium / nitrites / CONJ open, BOXED box', cls == {K_AMM: 'open', K_NIT: 'open',
             K_CONJ: 'open', K_BOX: 'box'}, repr(cls))
w1, w2 = one_line_width(V_CONJ, 7.5), minmax2_width(V_CONJ, 9.0)
precondition('BOXED budget lies between 2 lines at 9 pt and 1 line at the 7.5 pt floor (pt)',
             w2 + 1.0 < BOX_BUDGET < w1 - 1.0, f'2-line {w2:.2f} < budget {BOX_BUDGET:.2f} < 1-line {w1:.2f}')

tr = Path(TMP.name) / 'tr.json'
tr.write_text(json.dumps({'blocks': TR}, ensure_ascii=False))
c = subprocess.run([sys.executable, str(COMPOSE), '--translations', str(tr), '--svg'], capture_output=True,
                   text=True, env=dict(os.environ, FIGTEXT_OUT=str(out)), cwd=str(HERE))
rep = json.loads((out / 'compose-report.json').read_text()) if (out / 'compose-report.json').exists() else None
precondition('compose exits 0 and writes its report and SVG', c.returncode == 0 and rep is not None
             and (out / 'translated.svg').exists(), c.stderr[-400:])

check('C1 control: the bought keys did not move - all four laid out under their FT.lines keys, only ")" kept',
      sorted(rep['translated']) == sorted([K_AMM, K_NIT, K_CONJ, K_BOX]) and rep['missing'] == [K_PAREN]
      and rep['identity'] == [], f"translated={rep['translated']} missing={rep['missing']}")

els = elements((out / 'translated.svg').read_text())
lay = [e for e in els if e['layout']]
centres = {k: ((FC.source_frame(by_key[k])[0] + FC.source_frame(by_key[k])[1]) / 2,
               PAGE_H - (FC.source_frame(by_key[k])[2] + FC.source_frame(by_key[k])[3]) / 2)
           for k in (K_AMM, K_NIT, K_CONJ, K_BOX)}
lab = {k: [] for k in centres}
for e in lay:
    mx = e['x'] + text_adv(e['text'], e['size'], e['bold'], e['italic']) / 2
    lab[min(centres, key=lambda k: math.hypot(centres[k][0] - mx, centres[k][1] - e['y']))].append(e)
lines = {k: group_lines(v) for k, v in lab.items()}
paren = [e for e in els if not e['layout'] and e['text'] == ')'
         and abs(e['x'] - round(PAREN[0]['x'], 3)) < 1e-6]
precondition('the kept ")" is drawn run-exact at its source origin', len(paren) == 1, repr(paren))
py = paren[0]['y']


def drawn(k):
    return [''.join(e['text'] for e in l) for l in lines[k]]


check('V1 nitrites (NO2|– is drawn on ONE line', len(lines[K_NIT]) == 1, repr(drawn(K_NIT)))
base = [e['y'] for e in lab[K_NIT] if abs(e['size'] - 9.0) < 1e-6]
check('V2 ... on the baseline of the kept ")" that closes it (0.01 pt)',
      bool(base) and all(abs(y - py) <= 0.01 for y in base), f'baselines={sorted(set(base))} ")"={py}')
if lines[K_NIT]:
    last = lines[K_NIT][-1]
    end = max(e['x'] + text_adv(e['text'], e['size'], e['bold'], e['italic']) for e in last)
    check('V3 guard: ... and its line ends on the ")" (0.5 pt)', abs(end - paren[0]['x']) <= 0.5,
          f'end={end:.3f} ")" at {paren[0]["x"]}')
else:
    check('V3 guard: ... and its line ends on the ")" (0.5 pt)', False, 'nothing drawn')
check('V4 ammonium (NH4|+|) - three FT.lines - is drawn on ONE line', len(lines[K_AMM]) == 1, repr(drawn(K_AMM)))
check('V5 NH4|+ (conjugate acid) is drawn on ONE line', len(lines[K_CONJ]) == 1, repr(drawn(K_CONJ)))
check('V6 control: the boxed label is drawn on TWO lines (the only arm where line j=1 is read)',
      len(lines[K_BOX]) == 2, repr(drawn(K_BOX)))
fills = sorted({e['fill'] for e in lab[K_BOX]})
check('V7 every drawn line of the boxed label takes the colour of the run that OPENS its source line, never '
      'the red script run', len(fills) == 1, f'fills={fills} lines={drawn(K_BOX)}')
want = {K_AMM: V_AMM, K_NIT: V_NIT, K_CONJ: V_CONJ, K_BOX: V_CONJ}
bad = {k: (' '.join(drawn(k)), ' '.join(v.split())) for k, v in want.items()
       if ' '.join(' '.join(drawn(k)).split()) != ' '.join(v.split())}
check('T1 sentinel: each label\'s drawn pieces, line by line, reproduce its value\'s words', not bad, repr(bad))
finish()
```

- [ ] **Step 2: Run it — expect FAIL**

```bash
cd "$(git rev-parse --show-toplevel)/experiments/figure-text-translation" && FIGTEXT_PYLIBS=./pylibs python3 -u test_compose_visual_lines.py; echo EXIT=$?
```
Expected (on Task 2's commit; measured on that exact state at plan time): every PRECONDITION PASS, `C1`, `V3`, `V6`, `T1` PASS, and five FAILs —
`V1 … ['nítrít', '(NO2 –']`, `V2 … baselines=[144.431, 155.429] ")"=152.18` (the committed defect's 3.249 pt),
`V4 … ['ammóníum', '(NH4', '+ )']`, `V5 … ['NH4 + (samoka', 'sýra)']`, `V7 … fills=['#231f20', '#ed1c24']`;
tail `5 FAILED: …`, `EXIT=1`. (Tasks 1–2 alone change none of these: compose.py still counts FT.lines.)

- [ ] **Step 3: Write the implementation — `compose.py` and the `figlayout` docstring**

In `compose.py` replace (HEAD :359–361)
```python
for BI, b in enumerate(blocks):
    ls = FT.lines(b)
    # The arc decision must be made BEFORE `new` is built: `new` is a STRING for an arc
```
with
```python
for BI, b in enumerate(blocks):
    # The arc decision must be made BEFORE `new` is built: `new` is a STRING for an arc
```
and replace (HEAD :513–527)
```python
    # Source cues from the PDF's OWN advances, never from a cairo measure.
    cues = dict(n_src=len(ls), sz0=sz0,
                starts=[min(FT.along(r) for r in l) for l in ls],
                ends=[max(FT.along(r) + r['adv'] for r in l) for l in ls],
                projs=[FT.proj(l[0]) for l in ls])

    def width(chars, size, j):
        """figlayout's ONE width function: output line j is drawn in the font and colour of
        source line min(j, last) - font AND colour are per LINE."""
        return seg_width(chars, ls[min(j, len(ls) - 1)][0], size)

    layout = FL.decide(words, width, container, cues)
    align, size, lead, top = layout['align'], layout['size'], layout['lead'], layout['top']
    for j, lc in enumerate(layout['lines']):
        fr = ls[min(j, len(ls) - 1)][0]
```
with
```python
    # Source cues from the PDF's OWN advances, never from a cairo measure - per VISUAL source line
    # (§C140 ㉑): `figtext.visual_lines` merges the FT.lines a stacked charge or a same-size superscript
    # splits off, so `nitrites (NO2|–` is ONE source line here (n_src 1, its own baseline) while its
    # key, built by blockkey on FT.lines, still reads `nitrites (NO2|–`. Identical to FT.lines on
    # every block that has no such split.
    vls = FT.visual_lines(b)
    cues = dict(n_src=len(vls), sz0=sz0,
                starts=[min(FT.along(r) for r in l) for l in vls],
                ends=[max(FT.along(r) + r['adv'] for r in l) for l in vls],
                projs=[FT.proj(l[0]) for l in vls])

    def width(chars, size, j):
        """figlayout's ONE width function: output line j is drawn in the font and colour of the FIRST
        run of VISUAL source line min(j, last) - font AND colour are per LINE. After a §C140 ㉑ merge
        that run is the one that opens the source line, so a drawn line never takes a script run's
        font or colour; a script run is chosen only where the source line itself opens with one."""
        return seg_width(chars, vls[min(j, len(vls) - 1)][0], size)

    layout = FL.decide(words, width, container, cues)
    align, size, lead, top = layout['align'], layout['size'], layout['lead'], layout['top']
    for j, lc in enumerate(layout['lines']):
        fr = vls[min(j, len(vls) - 1)][0]
```
Check that nothing else read `ls`: `cd "$(git rev-parse --show-toplevel)" && grep -an "\bls\b" experiments/figure-text-translation/compose.py; echo EXIT=$?` → no match, `EXIT=1` (`-a`: committed files here can hold NUL bytes; the same grep finds 7 lines at HEAD).

In `figlayout.py` replace (HEAD :23)
```
  cues       {'n_src', 'sz0', 'starts', 'ends', 'projs'} per SOURCE line (adv-based in production).
```
with
```
  cues       {'n_src', 'sz0', 'starts', 'ends', 'projs'} per VISUAL source line (adv-based in production;
             compose.py builds them on figtext.visual_lines - §C140 ㉑).
```

- [ ] **Step 4: Run it — expect PASS**

```bash
cd "$(git rev-parse --show-toplevel)/experiments/figure-text-translation" && FIGTEXT_PYLIBS=./pylibs python3 -u test_compose_visual_lines.py; echo EXIT=$?
```
Expected: `V1 … ['nítrít (NO2 –']`, `V2 … baselines=[152.18] ")"=152.18`, `V3 … end=194.201 ")" at 194.201`,
`V4 … ['ammóníum (NH4 + )']`, `V5 … ['NH4 + (samoka sýra)']`, `V6 … ['NH4 + (samoka', 'sýra)']`, `V7 … fills=['#231f20']`,
tail `ALL PASS`, `EXIT=0` (about 2 s).

- [ ] **Step 5: Identity check — the sibling suites carry no rule-A shape and must not move**

```bash
cd "$(git rev-parse --show-toplevel)/experiments/figure-text-translation"
for f in test_figlayout.py test_figscripts.py test_figcontainers.py test_figtext_runexact.py test_compose_runexact.py test_compose_t23.py; do FIGTEXT_PYLIBS=./pylibs python3 -u $f > ~/.cache/namsbokasafn-audit/2026-10-03-c21/$f.log 2>&1; echo "$f EXIT=$? :: $(tail -1 ~/.cache/namsbokasafn-audit/2026-10-03-c21/$f.log)"; done
```
Expected: six lines, each `EXIT=0 :: ALL PASS` (measured at plan time on this exact change: ≤ 13 s each; a replicate measured 33 s / 22 s, then 19 s / 14 s, for `test_compose_runexact.py` / `test_compose_t23.py` on a loaded box, so timing is not a pass criterion;
`test_compose_t23.py`'s goldens are unchanged, so its planted figures draw byte-for-byte as before).
`test_blockkey_consumers.py` (needs a prepared `out/` for SciMethod) and `test_figure_compose.py` (spawns `tools/`) are
not in this set; neither plants a rule-A shape, and V6/C1 pin the key directly.

- [ ] **Step 6: Commit, and record the measurement's `after`**

```bash
cd "$(git rev-parse --show-toplevel)"
git add experiments/figure-text-translation/compose.py experiments/figure-text-translation/figlayout.py experiments/figure-text-translation/test_compose_visual_lines.py
git commit -m "feat(figures): §C140 ㉑ — compose.py lays a label out by its visual source lines (n_src, cues, per-line font)" -m "nitrites (NO2|– and ammonium (NH4|+|) draw on one line on the baseline of the kept ) that closes them; the key still splits. A line laid out beyond the source's visual lines takes the font and colour of the run that opens the source line, never a script run's. Pixels change for unchanged text, so this rides PR-B's '5' bump." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git rev-parse HEAD > ~/.cache/namsbokasafn-audit/2026-10-03-c21/after.sha && cat ~/.cache/namsbokasafn-audit/2026-10-03-c21/after.sha
```

- [ ] **Step 7: Prove V7 against its named mutant (draw index on FT.lines), golden-copy discipline**

```bash
cd "$(git rev-parse --show-toplevel)/experiments/figure-text-translation"
G=~/.cache/namsbokasafn-audit/2026-10-03-c21/compose.py.golden
cp compose.py "$G"
python3 - <<'EOF'
from pathlib import Path
p = Path('compose.py'); s = p.read_text()
a = "        fr = vls[min(j, len(vls) - 1)][0]"
assert s.count(a) == 1, s.count(a)
p.write_text(s.replace(a, "        fr = FT.lines(b)[min(j, len(FT.lines(b)) - 1)][0]"))
EOF
FIGTEXT_PYLIBS=./pylibs python3 -u test_compose_visual_lines.py > ~/.cache/namsbokasafn-audit/2026-10-03-c21/mutant-draw-index.log 2>&1; echo EXIT=$?
grep -a "FAIL" ~/.cache/namsbokasafn-audit/2026-10-03-c21/mutant-draw-index.log
cp "$G" compose.py && cmp compose.py "$G" && git diff --quiet -- compose.py && echo RESTORED
```
Expected: `EXIT=1`; exactly one FAIL, `V7 … fills=['#231f20', '#ed1c24'] lines=['NH4 + (samoka', 'sýra)']`, then `RESTORED`.
`git status --porcelain` → empty.

### Task 4: the 0-ISK before/after measurement over committed sidecars (predicted: 4 blocks in 2 figures)

**Files:**
- Create: `experiments/figure-text-translation/evidence/2026-10-03-c21-visual-lines/c21_measure.py`
- Create: `experiments/figure-text-translation/evidence/2026-10-03-c21-visual-lines/README.md`
- Create (Step 6): `experiments/figure-text-translation/evidence/2026-10-03-c21-visual-lines/report.txt`
- Data (off-repo, never committed): `~/.cache/namsbokasafn-audit/2026-10-03-c21/` — `base.sha`, `after.sha` (Tasks 1 and 3), the two exported trees, `prep/`, `before/`, `before2/`, `after/`, logs.

**Interfaces:**
- Consumes: `sources.py --json efnafraedi-2e <names…>` (working tree; reads `sources.local.json`); `figure-prepare.py <artwork> --basename <b> --out <dir>` and `compose.py --translations <sidecar> --svg` from an exported tree; `figlayout.decide(words, width, container, cues)`; compose.py's module globals `BI` and `key`; `books/efnafraedi-2e/figure-text/<b>.is.json`; `books/efnafraedi-2e/media/<b>_IS.svg`.
- Produces: CLI `c21_measure.py prepare --data D --tree T` · `arm --data D --name N --tree T [--only B]` · `trace TREE OUT SIDECAR` (internal) · `compare --data D` (exit 0 iff the prediction held; terminal line `VERDICT …`).

No money path: it never imports or spawns `tools/figure-run.js`, `translate-blocks.mjs` or `tools/publish-figure-svg.js`,
and writes only under `~/.cache/namsbokasafn-audit/2026-10-03-c21`. Validated at plan time on 3 of the 27 figures (conjugate_img, Nitrogen, CbcCltPckd), with
the base and the patched composers exported to scratch: `VERDICT PREDICTION HELD`, CbcCltPckd byte-identical, the
`before` arm reproducing the committed `<text>` of all three, the Nitrogen re-run byte-identical; and the
determinism control itself on `CNX_Chem_14_03_corresp` (54 laid-out blocks): `before2` byte-identical to `before`,
`before` equal to `after` (its 5 charge keys are identity, drawn run-exact) and 196 of 196 `<text>` equal to the
committed copy. The exported tree carries no `sources.local.json` and needs none: `figure-prepare.py`'s chain
(`emit-blocks`, `extract`, `readlayer`, `strip-text`, `svgfix`) never imports `sources` (`grep -an` → exit 1;
the same grep finds `import sources` in `test_blockkey_consumers.py`); resolution runs in the working tree.
All 27 figures have a committed sidecar and a committed `media/<b>_IS.svg` (checked at plan time).

- [ ] **Step 1: Create the instrument `c21_measure.py`**

```python
#!/usr/bin/env python3
"""§C140 ㉑ - the 0-ISK before/after measurement of the visual line count, over COMMITTED sidecars.

    python3 -u c21_measure.py prepare --data DIR --tree BASE_TREE
    python3 -u c21_measure.py arm     --data DIR --name before --tree BASE_TREE
    python3 -u c21_measure.py arm     --data DIR --name before2 --tree BASE_TREE --only CNX_Chem_14_03_corresp
    python3 -u c21_measure.py arm     --data DIR --name after  --tree AFTER_TREE
    python3 -u c21_measure.py compare --data DIR

No money path: nothing here imports or spawns tools/figure-run.js, translate-blocks.mjs or
tools/publish-figure-svg.js. `prepare` runs figure-prepare.py on each figure's resolved artwork into
DIR/prep/<basename>; `arm` copies that directory to DIR/<name>/<basename> and runs the given tree's
compose.py IN-PROCESS on it, with the figure's committed sidecar as --translations - exactly the
input tools/figure-run.js hands figure-compose.py on a recompose - recording every figlayout.decide
call (block key, n_src, the drawn lines, size, anchor, top). Nothing is written outside DIR.

THE PREDICTION (design spec 2026-10-02 D3; register §C140 ㉑), registered before the run:
  * exactly 4 laid-out blocks in 2 figures change, each to ONE drawn line with n_src 1 -
    Nitrogen 'ammonium (NH4|+|)', 'nitrites (NO2|–', 'nitrates (NO3|–' and conjugate_img
    'NH4|+ (conjugate acid)';
  * every other decide record is identical by value, in all 27 figures;
  * every figure's run-exact <text> elements are identical, and every figure but those 2 has a
    byte-identical translated.svg.
Anything else is a FINDING to report, never a threshold to tune.

CONTROLS: `before2` re-runs the base composer on one figure, whose SVG must be byte-identical to
`before`'s - the determinism control that makes a byte comparison mean anything; it is part of the
VERDICT. `before` should also reproduce each figure's COMMITTED media/<b>_IS.svg <text> elements (the
copy the pass will replace) - the positive control that the arm runs the real composer on the real
inputs. It is reported on its own BASELINE line, not in the VERDICT: a miss there is a figure the '5'
pass will change for a reason OUTSIDE ㉑, which is a finding for the pass, not a defect of ㉑.
"""
import argparse
import json
import os
import re
import runpy
import shutil
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
# evidence/<this dir>/c21_measure.py -> the repository root, four levels up from this directory.
REPO = Path(os.environ.get('C21_REPO') or HERE.parents[3])
FTT = REPO / 'experiments' / 'figure-text-translation'
BOOK = REPO / 'books' / 'efnafraedi-2e'
PYLIBS = FTT / 'pylibs'

# The 13 rule-A figures with a sidecar (CNX_Chem_07_04_Ques11ans_img, the 14th, is retired and has none).
RULE_A = ['CNX_Chem_00_HH_chemform1_img', 'CNX_Chem_00_HH_chemform3_img', 'CNX_Chem_00_HH_chemform4_img',
          'CNX_Chem_00_HH_chemform9_img', 'CNX_Chem_11_05_detrg', 'CNX_Chem_13_00_Blood',
          'CNX_Chem_14_01_conjugate_img', 'CNX_Chem_14_03_ICETable3_img', 'CNX_Chem_14_03_ICETable5_img',
          'CNX_Chem_14_03_corresp', 'CNX_Chem_14_03_strengths', 'CNX_Chem_14_05_ICETable1_img',
          'CNX_Chem_18_07_Nitrogen']
# The DISCRIMINATING control: sidecar figures whose only rule-A merges are in KEPT blocks - the population
# that moves if the merge leaks into figcontainers.line_frames (sibling cues, free-box obstacles).
KEPT_MERGE = ['CNX_Chem_10_06_CbcCltPckd', 'CNX_Chem_11_05_soap', 'CNX_Chem_13_04_ICETable2_img',
              'CNX_Chem_14_01_NH3_img', 'CNX_Chem_14_03_FishLemon', 'CNX_Chem_14_06_ICETable16_img',
              'CNX_Chem_14_06_buffer', 'CNX_Chem_15_01_ICETable2_img', 'CNX_Chem_15_02_ICETable1_img',
              'CNX_Chem_17_02_Galvanicel', 'CNX_Chem_19_02_BalEnt']
# Three of the 34 originally bought figures (open, cell and box labels; code1-exposure A 0, B 0).
BOUGHT34 = ['CNX_Chem_04_01_rxn2', 'CNX_Chem_03_01_glycinemass_img', 'CNX_Chem_04_03_flowchart']
FIGURES = RULE_A + KEPT_MERGE + BOUGHT34
PREDICTED = {('CNX_Chem_18_07_Nitrogen', 'ammonium (NH4|+|)'), ('CNX_Chem_18_07_Nitrogen', 'nitrites (NO2|–'),
             ('CNX_Chem_18_07_Nitrogen', 'nitrates (NO3|–'), ('CNX_Chem_14_01_conjugate_img', 'NH4|+ (conjugate acid)')}


def child_env():
    return dict(os.environ, FIGTEXT_PYLIBS=str(PYLIBS), PYTHONDONTWRITEBYTECODE='1',
                SOURCE_DATE_EPOCH='1700000000')


def cmd_prepare(a):
    """Resolve with the WORKING tree's sources.py (config + sources.local.json), prepare with TREE's
    figure-prepare.py: both arms then compose the SAME prepared inputs, so only the composer differs."""
    data, tree = Path(a.data), Path(a.tree).resolve()
    (data / 'prep').mkdir(parents=True, exist_ok=True)
    r = subprocess.run([sys.executable, str(FTT / 'sources.py'), '--json', 'efnafraedi-2e'] + FIGURES,
                       capture_output=True, text=True, cwd=str(FTT), env=child_env())
    if r.returncode != 0:
        sys.exit(f'sources.py exited {r.returncode}: {r.stderr[-400:]}')
    res = json.loads(r.stdout)
    for b in FIGURES:
        path = (res.get(b) or {}).get('path')
        if not path:
            sys.exit(f'{b} does not resolve: {res.get(b)!r}')
        out = data / 'prep' / b
        if (out / 'prepare.json').exists():
            print(f'prepared already  {b}', flush=True)
            continue
        p = subprocess.run([sys.executable, str(tree / 'figure-prepare.py'), path, '--basename', b,
                            '--out', str(out)], capture_output=True, text=True, cwd=str(tree), env=child_env())
        if p.returncode != 0:
            sys.exit(f'figure-prepare.py exited {p.returncode} on {b}: {p.stderr[-400:]}')
        (out / f'{b}.pdf').unlink(missing_ok=True)       # the staged artwork copy; compose never reads it
        print(f'prepared  {b}  <- {path}', flush=True)
    print('PREPARE DONE', flush=True)


def cmd_arm(a):
    data, tree = Path(a.data), Path(a.tree).resolve()
    if not (tree / 'compose.py').exists():
        sys.exit(f'no compose.py in {tree}')
    for b in ([a.only] if a.only else FIGURES):
        src, out = data / 'prep' / b, data / a.name / b
        if out.exists():
            shutil.rmtree(out)
        shutil.copytree(src, out)
        sidecar = BOOK / 'figure-text' / f'{b}.is.json'
        t = subprocess.run([sys.executable, '-u', str(Path(__file__).resolve()), 'trace', str(tree), str(out),
                            str(sidecar)], capture_output=True, text=True, env=child_env())
        (out / 'c21-compose.log').write_text(t.stdout + t.stderr)
        if t.returncode != 0 or not (out / 'c21-trace.json').exists():
            sys.exit(f'{a.name}: compose failed on {b} (exit {t.returncode}): {t.stderr[-600:]}')
        print(f'{a.name}  {b}  {len(json.loads((out / "c21-trace.json").read_text()))} laid-out blocks', flush=True)
    print(f'ARM {a.name} DONE', flush=True)


def cmd_trace(a):
    """Run TREE/compose.py in THIS process (its own figlayout, patched), on OUT with SIDECAR."""
    tree, out, sidecar = Path(a.tree), Path(a.out), a.sidecar
    os.environ['FIGTEXT_OUT'] = str(out)                 # before _deps is imported - it binds by value
    sys.path.insert(0, str(PYLIBS))
    sys.path.insert(0, str(tree))
    import figlayout
    orig = figlayout.decide
    rec = []

    def decide(words, width, container, cues, *args, **kw):
        lay = orig(words, width, container, cues, *args, **kw)
        g = sys._getframe(1).f_globals                   # compose.py's module frame: its loop variables
        rec.append(dict(block=g['BI'], key=g['key'], n_src=cues['n_src'], starts=cues['starts'],
                        ends=cues['ends'], projs=cues['projs'], cls=container.get('cls'),
                        align=lay['align'], step=lay['step'], size=lay['size'], anchor=lay['anchor'],
                        top=lay['top'], x0=lay['x0'],
                        lines=[''.join(ch for ch, _ in l) for l in lay['lines']]))
        return lay

    figlayout.decide = decide
    sys.argv = [str(tree / 'compose.py'), '--translations', sidecar, '--svg']
    runpy.run_path(str(tree / 'compose.py'), run_name='__main__')
    (out / 'c21-trace.json').write_text(json.dumps(rec, ensure_ascii=False, indent=1))


def text_elements(svg):
    return re.findall(r'<text [^>]*>[^<]*</text>', svg)


def cmd_compare(a):
    data = Path(a.data)
    changed, other_diffs, notes = set(), [], []
    det_ok = None
    for b in FIGURES:
        tb = json.loads((data / 'before' / b / 'c21-trace.json').read_text())
        ta = json.loads((data / 'after' / b / 'c21-trace.json').read_text())
        sb = (data / 'before' / b / 'translated.svg').read_text(encoding='utf-8')
        sa = (data / 'after' / b / 'translated.svg').read_text(encoding='utf-8')
        committed = (BOOK / 'media' / f'{b}_IS.svg').read_text(encoding='utf-8')
        pos = text_elements(sb) == text_elements(committed)
        if not pos:
            notes.append(f'POSITIVE CONTROL MISSED {b}: before <text> != committed _IS.svg <text>')
        if [r['key'] for r in tb] != [r['key'] for r in ta]:
            other_diffs.append(f'{b}: the laid-out key sequence differs')
            continue
        for rb, ra in zip(tb, ta):
            if rb != ra:
                changed.add((b, rb['key']))
                print(f"CHANGED {b} {rb['key']!r}: n_src {rb['n_src']}->{ra['n_src']}  lines {rb['lines']}"
                      f" -> {ra['lines']}  [{rb['cls']} {rb['step']} {rb['size']}] -> [{ra['cls']} {ra['step']}"
                      f" {ra['size']}]  top {rb['top']:.3f}->{ra['top']:.3f}  align {rb['align']}->{ra['align']}", flush=True)
        kb = [e for e in text_elements(sb) if 'font-kerning:none' not in e]
        ka = [e for e in text_elements(sa) if 'font-kerning:none' not in e]
        if kb != ka:
            other_diffs.append(f'{b}: run-exact <text> elements differ')
        same_bytes = sb == sa
        if b not in {f for f, _ in PREDICTED} and not same_bytes:
            other_diffs.append(f'{b}: translated.svg is not byte-identical')
        print(f"{b}: laid-out {len(tb)}  positive-control {'ok' if pos else 'MISSED'}  "
              f"svg {'identical' if same_bytes else 'differs'}", flush=True)
    d2 = data / 'before2'
    for b in (sorted(p.name for p in d2.iterdir()) if d2.exists() else []):
        det_ok = (d2 / b / 'translated.svg').read_bytes() == (data / 'before' / b / 'translated.svg').read_bytes()
        print(f'DETERMINISM {b}: before2 svg {"byte-identical" if det_ok else "DIFFERS"} to before', flush=True)
    for n in notes:
        print(n, flush=True)
    for d in other_diffs:
        print('UNPREDICTED', d, flush=True)
    for b, k in sorted(changed - PREDICTED):
        print('UNPREDICTED change', b, repr(k), flush=True)
    for b, k in sorted(PREDICTED - changed):
        print('PREDICTED but unchanged', b, repr(k), flush=True)
    after_ok = all(r['n_src'] == 1 and len(r['lines']) == 1
                   for b in {f for f, _ in PREDICTED}
                   for r in json.loads((data / 'after' / b / 'c21-trace.json').read_text())
                   if (b, r['key']) in PREDICTED)
    print(f'BASELINE before reproduces the committed _IS.svg <text> for {len(FIGURES) - len(notes)} of '
          f'{len(FIGURES)} figures', flush=True)
    ok = (changed == PREDICTED and not other_diffs and after_ok and det_ok is True)
    print(f"VERDICT {'PREDICTION HELD' if ok else 'PREDICTION FAILED'}: changed {len(changed)} "
          f"(predicted {len(PREDICTED)}), unpredicted {len(other_diffs) + len(changed - PREDICTED)}, "
          f"determinism {det_ok}, predicted-to-one-line {after_ok}",
          flush=True)
    sys.exit(0 if ok else 1)


def main():
    ap = argparse.ArgumentParser()
    sp = ap.add_subparsers(dest='cmd', required=True)
    p = sp.add_parser('prepare'); p.add_argument('--data', required=True); p.add_argument('--tree', required=True)
    p = sp.add_parser('arm'); p.add_argument('--data', required=True); p.add_argument('--name', required=True)
    p.add_argument('--tree', required=True); p.add_argument('--only')
    p = sp.add_parser('trace'); p.add_argument('tree'); p.add_argument('out'); p.add_argument('sidecar')
    p = sp.add_parser('compare'); p.add_argument('--data', required=True)
    a = ap.parse_args()
    {'prepare': cmd_prepare, 'arm': cmd_arm, 'trace': cmd_trace, 'compare': cmd_compare}[a.cmd](a)


if __name__ == '__main__':
    main()
```

- [ ] **Step 2: Create `README.md` beside it**

```markdown
# §C140 ㉑ — the visual line count: the 0-ISK before/after measurement

> **FROZEN EVIDENCE.** Written by the PR that built ㉑ (branch `feat/c140-c49-step2-code-fixes`). Status lives in the
> campaign register (§C140 ㉑ and ㊾), never here. Design: `docs/superpowers/specs/2026-10-02-c140-step2-recompose-pass-design.md`, D3.

`c21_measure.py` composes the same prepared inputs with two composers — the tree at the commit before ㉑'s first
commit (`base.sha`) and the tree at ㉑'s last commit (`after.sha`) — using each figure's **committed** sidecar as
`--translations`, the input `tools/figure-run.js` hands `figure-compose.py` on a recompose. It records every
`figlayout.decide` call and compares the records, every run-exact `<text>` element and the SVG bytes.

- **0 ISK.** It never imports or spawns `tools/figure-run.js`, `translate-blocks.mjs` or
  `tools/publish-figure-svg.js`, and writes only under `--data`, which is off-repo:
  `~/.cache/namsbokasafn-audit/2026-10-03-c21/`.
- **Population (27).** The 13 rule-A figures that have a sidecar; the 11 sidecar figures whose rule-A merges are all
  in KEPT blocks — the population the rejected `line_frames` design would move, so the discriminating control — for SIBLING-CUE leaks only (measured: with `line_frames` mutated onto `visual_lines`, or with only `sibling_cues` mutated, exactly one decide record of the 27 figures moves, `CNX_Chem_17_02_Galvanicel` `Flow of cations`, align right → center; with only `free_box`'s obstacles mutated, 0 of 163 records and 0 of 27 SVGs move. So the obstacle half is pinned by Part 3 Task 2's free-box pin alone, and CbcCltPckd's byte-identical SVG is not evidence that `C|B|A` stays three lines); and 3 of
  the 34 originally bought figures. `CNX_Chem_07_04_Ques11ans_img`, the 14th rule-A figure, is retired and has no
  sidecar.
- **Prediction (registered in the script before the run).** Exactly 4 decide records change, each to one drawn line
  with `n_src` 1: Nitrogen `ammonium (NH4|+|)`, `nitrites (NO2|–`, `nitrates (NO3|–` and conjugate_img
  `NH4|+ (conjugate acid)`. Every other record is identical by value; every figure's run-exact `<text>` is identical;
  the other 25 SVGs are byte-identical.
- **Controls.** `before2` re-runs the base composer on `CNX_Chem_14_03_corresp` (54 laid-out blocks): it must be
  byte-identical to `before` (determinism, part of the VERDICT). `BASELINE` reports how many `before` copies reproduce
  the committed `media/<b>_IS.svg` `<text>` elements (the copy the '5' pass replaces): a miss is a figure the pass
  changes for a reason outside ㉑ — a finding for the pass, not a ㉑ defect.
- `report.txt` is the verbatim output of `compare`.
```

- [ ] **Step 3: Commit the instrument before running it**

```bash
cd "$(git rev-parse --show-toplevel)"
git add experiments/figure-text-translation/evidence/2026-10-03-c21-visual-lines/c21_measure.py experiments/figure-text-translation/evidence/2026-10-03-c21-visual-lines/README.md
git commit -m "docs(evidence): §C140 ㉑ — the 0-ISK before/after measurement instrument, prediction registered" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 4: Export the two composers and prepare the 27 figures**

```bash
free -h; df -h ~/.cache      # stop if 'available' memory is under 2 GiB
REPO=$(git rev-parse --show-toplevel); cd "$REPO"; D=~/.cache/namsbokasafn-audit/2026-10-03-c21; EVD=$REPO/experiments/figure-text-translation/evidence/2026-10-03-c21-visual-lines
for arm in base after; do
  rm -rf "${D:?}/${arm:?}-src" && mkdir -p "$D/$arm-src"
  git archive "$(cat "$D/$arm.sha")" experiments/figure-text-translation ':!experiments/figure-text-translation/evidence' | tar -x -C "$D/$arm-src"
  ln -s "$REPO/experiments/figure-text-translation/pylibs" "$D/$arm-src/experiments/figure-text-translation/pylibs"
done
B=$D/base-src/experiments/figure-text-translation; A=$D/after-src/experiments/figure-text-translation
python3 -u "$EVD/c21_measure.py" prepare --data "$D" --tree "$B" > "$D/prepare.log" 2>&1; echo EXIT=$?; tail -1 "$D/prepare.log"
```
Expected: `EXIT=0`, `PREPARE DONE` (27 `prepared …` lines before it; conjugate_img measured at 2 s and 5.1 MB at plan time).
Sequential, foreground; no background process.

- [ ] **Step 5: Run the three arms, then compare**

```bash
REPO=$(git rev-parse --show-toplevel); D=~/.cache/namsbokasafn-audit/2026-10-03-c21; EVD=$REPO/experiments/figure-text-translation/evidence/2026-10-03-c21-visual-lines
B=$D/base-src/experiments/figure-text-translation; A=$D/after-src/experiments/figure-text-translation
python3 -u "$EVD/c21_measure.py" arm --data "$D" --name before --tree "$B" > "$D/arm-before.log" 2>&1; echo EXIT=$?; tail -1 "$D/arm-before.log"
python3 -u "$EVD/c21_measure.py" arm --data "$D" --name before2 --tree "$B" --only CNX_Chem_14_03_corresp > "$D/arm-before2.log" 2>&1; echo EXIT=$?; tail -1 "$D/arm-before2.log"
python3 -u "$EVD/c21_measure.py" arm --data "$D" --name after --tree "$A" > "$D/arm-after.log" 2>&1; echo EXIT=$?; tail -1 "$D/arm-after.log"
python3 -u "$EVD/c21_measure.py" compare --data "$D" > "$D/compare.txt" 2>&1; echo EXIT=$?
grep -a "^CHANGED\|^UNPREDICTED\|^PREDICTED\|^DETERMINISM\|^BASELINE\|^VERDICT" "$D/compare.txt"
```
Expected: `ARM before DONE`, `ARM before2 DONE`, `ARM after DONE`; compare `EXIT=0` and exactly these lines (the four
CHANGED lines were measured at plan time, and quote the committed sidecar values):
```
CHANGED CNX_Chem_14_01_conjugate_img 'NH4|+ (conjugate acid)': n_src 2->1  lines ['NH4 + (samoka', 'sýra)'] -> ['NH4 + (samoka sýra)']  [open i 9.0] -> [open i 9.0]  top 129.823->122.324  align left->center
CHANGED CNX_Chem_18_07_Nitrogen 'ammonium (NH4|+|)': n_src 3->1  lines ['ammóníum', '(NH4', '+ )'] -> ['ammóníum (NH4 + )']  [open i 9.0] -> [open i 9.0]  top 81.068->67.820  align right->center
CHANGED CNX_Chem_18_07_Nitrogen 'nitrites (NO2|–': n_src 2->1  lines ['nítrít', '(NO2 –'] -> ['nítrít (NO2 –']  [open i 9.0] -> [open i 9.0]  top 75.569->67.820  align right->right
CHANGED CNX_Chem_18_07_Nitrogen 'nitrates (NO3|–': n_src 2->1  lines ['nítrat', '(NO3 –'] -> ['nítrat (NO3 –']  [open i 9.0] -> [open i 9.0]  top 143.870->136.121  align right->right
DETERMINISM CNX_Chem_14_03_corresp: before2 svg byte-identical to before
BASELINE before reproduces the committed _IS.svg <text> for 27 of 27 figures
VERDICT PREDICTION HELD: changed 4 (predicted 4), unpredicted 0, determinism True, predicted-to-one-line True
```
⚠️ **If the VERDICT reads `PREDICTION FAILED`, or any `UNPREDICTED` / `PREDICTED but unchanged` line appears: stop.**
Do not touch `VISUAL_LEAD_FRACTION` and do not widen the call-site list; report the lines to the controller, who
records them in register §C140 ㉑. **If only `BASELINE` is short of 27**, ㉑ is not at fault: name the figures in the PR
description as figures the '5' pass changes for a reason outside ㉑ (a finding for ㊾), and continue.

- [ ] **Step 6: Commit the report, verbatim**

```bash
REPO=$(git rev-parse --show-toplevel); cd "$REPO"; D=~/.cache/namsbokasafn-audit/2026-10-03-c21; EVD=$REPO/experiments/figure-text-translation/evidence/2026-10-03-c21-visual-lines
cp "$D/compare.txt" "$EVD/report.txt"
git add "$EVD/report.txt"
git commit -m "docs(evidence): §C140 ㉑ — before/after report: 4 blocks in 2 figures change, as predicted, 0 ISK" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git status --porcelain
```
Expected: the last command prints nothing. Keep `~/.cache/namsbokasafn-audit/2026-10-03-c21` until PR-A merges (off-repo; PR-B's by-eye old/new/source check
of Nitrogen and conjugate_img in Chromium and Firefox may reuse its `after/` SVGs as the "new" side).


---

# Part 4 — §C140 ㊳: `figure-run-free.test.js` asks whether a sidecar is CURRENT · ✅ drafted and verified

> Same rule as Part 3: confirm the red arm at HEAD before editing.

### Task A-㊳: `figure-run-free.test.js` stops depending on whether the corpus's sidecars are current (§C140 ㊳)

**Why (measured 2026-10-03 at `2f5f213bf`, 0 ISK, tree clean after every run):** the file is green at HEAD (all 115 tests, 3 s). Under an **in-memory** `COMPOSER_VERSION` of `'5'` (a `--require` preload that mutates the exported constant before `figure-run.js` destructures it; the repo file is never written) **exactly three tests go red**, the same three names the register measured on 2026-09-29:
- `skips exactly the figures that really do have a current sidecar — no more, no fewer` → `expected +0 to be 19`
- `names an unresolved figure instead of failing the run over it (R9)` → `expected false to be true` (verdict)
- `leaves both ch21 figures unresolved, NAMED, rather than handing them one PDF` → `expected false to be true` (verdict)

The same preload at `'4'` is all green (the preload breaks nothing by itself). Mechanism: with the real reader every ch04/ch21 sidecar is stale after a bump, so `fakeSpawn` prepares them (`sendable: 0`), they classify as copies, and `applyDriftGuard` (`tools/figure-run.js:1076`) files them `failed-compose`, which fails the verdict. The "skips exactly" oracle counts sidecar FILES (`fs.existsSync`, test lines 947–951) while the driver skips only `!isStale` ones (`tools/figure-run.js:2029-2036`). A static scan finds **13 driver calls that name neither `PRISTINE` nor a stubbed reader** (11 `runFigures`, 2 `main`; lines 482, 811, 863, 946, 1006, 1026, 1265, 1292, 1300, 1346, 1504, 1031, 1059). One of them is a latent countdown: the peak-disk test asserts `liveDirs.length > 10` and measures **11** today, because 19 of ch04's 30 figures are `skipped-current`.

**Design:** (1) the "skips exactly" test uses the driver's own `isStale` over the reader the run used, in three worlds (the real tree; every sidecar stale, i.e. a bump in miniature; every sidecar current); (2) every other driver call gets `...PRISTINE`; (3) a tripwire makes the file's own rule ("anything asserting a pristine corpus must SAY so", lines 140–148) a checked property. No production code changes.

**Files:**
- Modify: `tools/__tests__/figure-run-free.test.js` — line 47 (the sidecar `require`); after line 150 (`const PRISTINE = …`); lines 936–957 (the "skips exactly" test); the 12 call sites at lines 482, 811, 863, 1006, 1026, 1031–1034, 1059–1062, 1265, 1292, 1300, 1348, 1504; one `describe` appended after line 1763 (end of file). These numbers are at `2f5f213bf`: if Part 1 has landed first, its Task 2 Step 1 inserts 9 lines before line 645, so every number past 645 is 9 higher on the PR branch — locate each edit by its quoted text.
- Modify: `docs/plans/2026-07-21-post-item17-followup-campaign.md` — row ㊳'s status cell (find it with `grep -an '^| ㊳'`: line 3117 at `2f5f213bf`, 3146 at `a9fe1f031`).
- Scratch, never committed: `/tmp/c38-plan/bump-preload.cjs` (a few hundred bytes).

**Interfaces:**
- Consumes: `runFigures(args, deps)`, `isStale(sidecar)`, `main(argv, deps)` from `tools/figure-run.js` (deps keys `spawn`, `readSidecar`, `sidecarExists`); `readSidecar(bookDir, basename)`, `COMPOSER_VERSION`, `computeRenderHash(blocks, composerVersion)` from `tools/lib/figure-text-sidecar.cjs`.
- Produces (test-file scope only): `readSidecarFromDisk` (the real `readSidecar`, aliased); `CORPUS = { readSidecar: readSidecarFromDisk, sidecarExists: fs.existsSync }`; `callsOf(name, text) → [{ line, args }]`; `statesItsWorld(args) → boolean`.

Run everything from `/home/siggi/dev/repos/namsbokasafn-efni` on `feat/c140-c49-step2-code-fixes`. Every commit message ends with the executing session's attribution trailer.

- [ ] **Step 1: Write the bump simulator and reproduce ㊳ against the unchanged file (RED).**

```bash
REPO=$(git rev-parse --show-toplevel)
mkdir -p /tmp/c38-plan && cat > /tmp/c38-plan/bump-preload.cjs <<EOF
// Simulates a COMPOSER_VERSION bump IN MEMORY ONLY: the repo file is never written.
// Loaded through NODE_OPTIONS=--require, so it runs in every vitest fork before the test file;
// figure-run.js destructures the constant from this same cached exports object when it loads.
// The path is the CHECKOUT UNDER TEST's, interpolated from git when this file is written. A path
// into ANOTHER checkout mutates a module the driver never loads, prints its line all the same,
// and leaves every test green (measured from a worktree 2026-10-03: 3 lines, failed 0 at '5').
const p = '$REPO/tools/lib/figure-text-sidecar.cjs';
const m = require(p);
const v = process.env.SIM_COMPOSER_VERSION;
if (v) {
  m.COMPOSER_VERSION = v;
  process.stderr.write('[bump-preload pid ' + process.pid + '] COMPOSER_VERSION -> ' + v + ' in ' + p + '\n');
}
EOF
for v in 5 4; do SIM_COMPOSER_VERSION=$v NODE_OPTIONS="--require /tmp/c38-plan/bump-preload.cjs" npx vitest run tools/__tests__/figure-run-free.test.js --reporter=json --outputFile=/tmp/c38-plan/sim$v.json >/tmp/c38-plan/sim$v.out 2>&1; echo "v=$v exit=$?"; grep -ac 'bump-preload' /tmp/c38-plan/sim$v.out; node -e "const r=require('/tmp/c38-plan/sim$v.json');console.log('failed',r.numFailedTests);for(const f of r.testResults)for(const a of f.assertionResults)if(a.status==='failed')console.log(' RED',a.fullName)"; done; git status --porcelain
```

Expected: `v=5 exit=1`, a non-zero preload-line count, `failed 3` with exactly the three names above; `v=4 exit=0`, `failed 0`; `git status --porcelain` empty. If `v=4` is not green, the instrument is broken — stop. **And each preload line must end `in <this checkout>/tools/lib/figure-text-sidecar.cjs`** (`grep -ac "in $(git rev-parse --show-toplevel)/tools/lib/figure-text-sidecar.cjs" /tmp/c38-plan/sim5.out` equals the preload-line count): a line proves only that the preload RAN, not that it reached the module the driver loads. If `v=5` is green, that is the first suspect: measured 2026-10-03 from a worktree, a preload hard-coding the main checkout's path printed 3 lines and gave `failed 0` at `'5'`.

- [ ] **Step 2: Reproduce ㊳ inside the suite (RED).** Give the test the real reader under a name, then add a bump-in-miniature arm that still uses the test's CURRENT oracle (sidecar files on disk).

Replace line 47:
```js
const { computeRenderHash, COMPOSER_VERSION } = require('../lib/figure-text-sidecar.cjs');
```
with:
```js
const {
  computeRenderHash,
  COMPOSER_VERSION,
  readSidecar: readSidecarFromDisk,
} = require('../lib/figure-text-sidecar.cjs');
```

In the test at lines 942–957, between
```js
    expect(result.tally['skipped-current'] || 0).toBe(onDisk.length);
```
and
```js
    // Control: with the filesystem stubbed empty, the same corpus skips nothing — so the
```
insert:
```js
    // §C140 ㊳ — the same relation under a COMPOSER_VERSION bump in miniature: every sidecar
    // file still on disk, none of them current.
    const stale = (dir, name) => {
      const s = readSidecarFromDisk(dir, name);
      return s && { ...s, composedVersion: `not-${COMPOSER_VERSION}` };
    };
    const bumped = await runFigures(CH04, {
      spawn: fakeSpawn(),
      readSidecar: stale,
      sidecarExists: fs.existsSync,
    });
    const bumpedOnDisk = bumped.figures.filter((f) =>
      fs.existsSync(
        path.join(REPO_ROOT, 'books', 'efnafraedi-2e', 'figure-text', `${f.basename}.is.json`)
      )
    );
    expect(bumped.tally['skipped-current'] || 0).toBe(bumpedOnDisk.length);
```

Run: `npx vitest run tools/__tests__/figure-run-free.test.js -t "skips exactly the figures"`

Expected: FAIL, `expected +0 to be N` where N is ch04's sidecar-file count (19 at `2f5f213bf`) — the same message Step 1's `'5'` run printed. Why: `runFigures` skips a figure only when `rec.sidecar && !isStale(rec.sidecar)` (`figure-run.js:2029-2036`), and `isStale` returns true when `composedVersion !== COMPOSER_VERSION` (`figure-run.js:302`), so nothing is skipped while every file still exists.

- [ ] **Step 3: Replace the oracle with the driver's own predicate; name the real tree `CORPUS` (GREEN).**

After line 150 (`const PRISTINE = { readSidecar: () => null, sidecarExists: () => false };`) insert:
```js

/**
 * The REAL sidecar tree, NAMED — for the one test whose subject is what has been bought.
 *
 * 🔴 §C140 ㊳: a driver run that passes neither this nor `PRISTINE` (nor both readers itself) reads
 * the real tree WITHOUT SAYING SO, and its verdict then moves with how much has been bought AND
 * with whether those sidecars are current. A COMPOSER_VERSION bump stales every sidecar at once:
 * measured 2026-10-03, an in-memory '5' turned three tests in this file red on the bump alone.
 */
const CORPUS = { readSidecar: readSidecarFromDisk, sidecarExists: fs.existsSync };
```

Replace the whole block from the comment line `  // 🔴 REWRITTEN 2026-09-12, AND THE OLD TITLE IS WHY. It read "does not skip anything when no` through the test's closing `  });` (HEAD lines 936–957 plus Step 2's insertion) with:
```js
  // 🔴 REWRITTEN 2026-09-12, AND THE OLD TITLE IS WHY. It read "does not skip anything when no
  // figure has a sidecar (the real corpus today)" and asserted 0 — true only while the project had
  // never bought a figure. The FIRST real purchase (CNX_Chem_04_03_flowchart) made it false, and
  // it will get further from 0 with every chapter bought. ▶ A pin on "how much have we bought so
  // far" is a countdown, not a test. What is durable is the RELATION: the driver skips exactly the
  // figures that have a current sidecar on disk, no more and no fewer.
  //
  // 🔴 §C140 ㊳ — AND "CURRENT" IS A HASH QUESTION HERE TOO. This test used to count sidecar FILES,
  // which equals the current ones only while every sidecar is current. A COMPOSER_VERSION bump
  // stales all of them at once, so the bump commit alone turned it red ("expected +0 to be 19",
  // measured by an in-memory '5' on 2026-10-03). The oracle is now the driver's own `isStale` over
  // the reader the run used, in three worlds: the real tree, a bump in miniature (every sidecar
  // stale) and its mirror (every sidecar current). The last two hold whatever has been bought or
  // restamped, so neither can go vacuous.
  it('skips exactly the figures that really do have a current sidecar — no more, no fewer', async () => {
    const bookDir = path.join(REPO_ROOT, 'books', 'efnafraedi-2e');
    const currentBy = (read, result) =>
      result.figures.filter((f) => !isStale(read(bookDir, f.basename))).length;
    const stale = (dir, name) => {
      const s = readSidecarFromDisk(dir, name);
      return s && { ...s, composedVersion: `not-${COMPOSER_VERSION}` };
    };
    const current = (dir, name) => {
      const s = readSidecarFromDisk(dir, name);
      return s && { ...s, composedHash: s.renderHash, composedVersion: COMPOSER_VERSION };
    };

    // ⚠️ REAL filesystem here ON PURPOSE — this arm is the one measuring what has actually been
    // bought. (A blanket edit stubbed it for a moment and the assertion would then have compared
    // 0 against a real count: a failure if lucky, a vacuous pass if not.)
    const real = await runFigures(CH04, { spawn: fakeSpawn(), ...CORPUS });
    expect(real.tally['skipped-current'] || 0).toBe(currentBy(readSidecarFromDisk, real));

    // A bump in miniature. The sidecar FILES are all still there, which is what makes the zero
    // mean "none current" rather than "none found".
    const bumped = await runFigures(CH04, {
      spawn: fakeSpawn(),
      readSidecar: stale,
      sidecarExists: fs.existsSync,
    });
    const filesOnDisk = bumped.figures.filter((f) =>
      fs.existsSync(path.join(bookDir, 'figure-text', `${f.basename}.is.json`))
    ).length;
    expect(filesOnDisk).toBeGreaterThan(0);
    expect(bumped.tally['skipped-current'] || 0).toBe(currentBy(stale, bumped));
    expect(bumped.tally['skipped-current'] || 0).toBe(0);

    // Its mirror, every sidecar restamped current: the positive control, so the relation is not
    // only ever checked at zero. It is NOT compared with the file count — a hand-edited sidecar
    // (blocks changed, renderHash not) stays stale under a restamp, and that is not this test's
    // business.
    const restamped = await runFigures(CH04, {
      spawn: fakeSpawn(),
      readSidecar: current,
      sidecarExists: fs.existsSync,
    });
    expect(currentBy(current, restamped)).toBeGreaterThan(0);
    expect(restamped.tally['skipped-current'] || 0).toBe(currentBy(current, restamped));

    // A second control, for the HASH half of "current". In all three worlds above composedHash
    // equals renderHash, so a skip that read composedVersion alone passed every test in this file
    // (measured 2026-10-03). Here every sidecar carries THIS composer's version over artwork
    // published from other blocks, which `isStale` calls stale.
    const unpublished = (dir, name) => {
      const s = readSidecarFromDisk(dir, name);
      return s && { ...s, composedHash: `not-${s.renderHash}`, composedVersion: COMPOSER_VERSION };
    };
    const drifted = await runFigures(CH04, {
      spawn: fakeSpawn(),
      readSidecar: unpublished,
      sidecarExists: fs.existsSync,
    });
    expect(drifted.tally['skipped-current'] || 0).toBe(currentBy(unpublished, drifted));
    expect(drifted.tally['skipped-current'] || 0).toBe(0);

    // Control: with the filesystem stubbed empty, the same corpus skips nothing — so the
    // assertions above are measuring the sidecars and not some unrelated skip path.
    const pristine = await runFigures(CH04, { spawn: fakeSpawn(), ...PRISTINE });
    expect(pristine.tally['skipped-current'] || 0).toBe(0);
  });
```

In the header of the enclosing `describe('a figure whose sidecar is current is skipped before anything is spent'` (HEAD lines 886–889), correct the claim that no sidecar exists (ch04 holds 19 at `2f5f213bf`, and this task's own test depends on them). Replace:
```js
// 🔴 THIS BRANCH HAD NO EXERCISER, AND TWO MUTATIONS OF IT SURVIVED ALL 57 TESTS.
// `books/efnafraedi-2e/figure-text/` does not exist — the campaign has minted no sidecar for a
// real book yet — so `readSidecar` returns null for every figure of every chapter, `&&`
// short-circuits, and no corpus-driven test can reach `isStale` through `runFigures` at all.
```
with:
```js
// 🔴 THIS BRANCH HAD NO EXERCISER, AND TWO MUTATIONS OF IT SURVIVED ALL 57 TESTS.
// When this was written `books/efnafraedi-2e/figure-text/` did not exist, so `readSidecar`
// returned null for every figure, `&&` short-circuited, and no corpus-driven test could reach
// `isStale` through `runFigures` at all. Real sidecars exist now (the first purchase was on
// 2026-09-12); the tests below still inject the reader, so each one controls its own case.
```

Run: `npx vitest run tools/__tests__/figure-run-free.test.js`

Expected: PASS, 0 failed. (While planning, a replay of these three arms against the real `figure-run.js` measured real 19=19, stale 0=0 with 19 files, current 19=19 at `'4'`, and 0=0 / 0=0 / 19=19 at an in-memory `'5'`. That replay was the planning instrument; this run is the evidence.)

- [ ] **Step 4: Commit.**

```bash
git add tools/__tests__/figure-run-free.test.js
git commit -m "test(figure-run): §C140 ㊳ — 'skips exactly' counts CURRENT sidecars, in three worlds, 0 ISK" -m "The oracle counted sidecar files; the driver skips only !isStale ones, so a COMPOSER_VERSION bump turned the test red on its own (expected +0 to be 19, reproduced in-suite first). It now applies isStale to the run's own reader over the real tree, a bump in miniature and its restamped mirror; the real tree is passed as CORPUS."
```

- [ ] **Step 5: Write the tripwire (RED).** Append at the end of the file (after line 1763, the closing `});` of the ㊼ describe):

```js

// ─────────────────────────────────────────────────────────────────────────────────────────
// 🔴 §C140 ㊳ — EVERY DRIVER RUN IN THIS FILE SAYS WHICH SIDECAR WORLD IT RUNS IN. `PRISTINE`'s
// header states the rule: anything asserting a pristine corpus must SAY so rather than assume
// it. On 2026-10-03 thirteen calls said nothing and read the real tree; three of them went red
// on a COMPOSER_VERSION bump alone (a red that reads as a driver defect), and the peak-disk test
// sat one ch04 purchase from red (`liveDirs.length > 10`, measured 11). This makes the rule a
// checked property: every runFigures and main call names `PRISTINE`, `CORPUS`, or BOTH sidecar
// readers, because stubbing one alone leaves the other on the real tree.
describe('every driver run in this file states which sidecar world it runs in (§C140 ㊳)', () => {
  /**
   * Each call of `name` in `text`, with its argument text, found by balancing parentheses.
   * A comment inside the arguments is skipped and left out of that text: an apostrophe in one
   * would open a "string" that swallows the next call's `PRISTINE`, and a name a comment mentions
   * would count as stated. A regex literal is not parsed, so a quote or parenthesis inside one
   * would still miscount.
   */
  const callsOf = (name, text) => {
    const calls = [];
    const re = new RegExp(`\\b${name}\\(`, 'g');
    let m;
    while ((m = re.exec(text)) !== null) {
      let depth = 1;
      let quote = null;
      let args = '';
      for (let i = m.index + m[0].length; i < text.length; i++) {
        const ch = text[i];
        if (!quote && ch === '/' && (text[i + 1] === '/' || text[i + 1] === '*')) {
          const lineComment = text[i + 1] === '/';
          const close = lineComment ? text.indexOf('\n', i) : text.indexOf('*/', i + 2);
          if (close === -1) break;
          i = lineComment ? close - 1 : close + 1; // the loop's i++ resumes just after the comment
          continue;
        }
        if (quote) {
          if (ch === '\\') {
            args += text.slice(i, i + 2);
            i++;
            continue;
          }
          if (ch === quote) quote = null;
        } else if (ch === "'" || ch === '"' || ch === '`') quote = ch;
        else if (ch === '(') depth++;
        else if (ch === ')' && --depth === 0) break;
        args += ch;
      }
      calls.push({ line: text.slice(0, m.index).split('\n').length, args });
    }
    return calls;
  };
  const statesItsWorld = (args) =>
    /\b(?:PRISTINE|CORPUS)\b/.test(args) ||
    (/\breadSidecar\b/.test(args) && /\bsidecarExists\b/.test(args));

  it('names PRISTINE, CORPUS or both sidecar readers in every runFigures and main call', () => {
    const src = fs.readFileSync(path.join(HERE, 'figure-run-free.test.js'), 'utf-8');
    const calls = [...callsOf('runFigures', src), ...callsOf('main', src)];
    expect(calls.length).toBeGreaterThan(50); // non-vacuity: the scan really finds them
    expect(calls.filter((c) => !statesItsWorld(c.args)).map((c) => c.line)).toEqual([]);
  });

  // The scan's own control: a bare call is flagged; a multi-line call with a nested call and a
  // ')' inside a string is balanced correctly and passes; ONE reader alone is not enough; and a
  // comment can neither swallow the next call (its apostrophe) nor state a world (its words).
  it('CONTROL: flags a bare call and a one-reader call, passes a nested multi-line PRISTINE call', () => {
    const fn = 'runFigures'; // built, never written as a call, so the scan above cannot match it
    const planted = [
      `await ${fn}(CH04, { spawn });`,
      `await ${fn}(`,
      `  { ...CH21, figures: [D92B] },`,
      `  { spawn: fakeSpawn({ resolve: (n) => (n === ')' ? null : null) }), ...PRISTINE }`,
      `);`,
      `await ${fn}(CH04, { spawn, readSidecar: () => null });`,
      `await ${fn}(CH04, {`,
      `  spawn, // the real tree: don't stub it (yet`,
      `});`,
      `await ${fn}(CH04, { spawn, ...PRISTINE });`,
      `await ${fn}(CH04, { spawn /* not PRISTINE */ });`,
    ].join('\n');
    expect(callsOf(fn, planted).map((c) => [c.line, statesItsWorld(c.args)])).toEqual([
      [1, false],
      [2, true],
      [6, false],
      [7, false],
      [10, true],
      [11, false],
    ]);
  });
});
```

Run: `npx vitest run tools/__tests__/figure-run-free.test.js`

Expected: exactly one FAIL, `names PRISTINE, CORPUS or both sidecar readers in every runFigures and main call`, whose received array holds **12** line numbers: the ten bare `runFigures` calls edited in Step 6, then the two `main` calls. The CONTROL passes. Why: after Step 3 the "skips exactly" test names `CORPUS` and both readers, but the other ten `runFigures` calls pass only `{ spawn }`, `{ spawn: failing }` or `{ spawn: fakeSpawn(strippedOnly) }`, and the two `main` refusal tests pass `{ spawn }`. (The same scanner run over HEAD while planning found 58 calls and 13 bare lines; the control returned `[[1,false],[2,true],[6,false]]`.)

- [ ] **Step 6: State the world in the twelve bare calls.** Each edit adds `...PRISTINE` and nothing else; the context lines make every anchor unique (four of the call lines are byte-identical).

(a) test `spends no second resolver pass on a chapter with no hashed basenames` (HEAD 480–482):
```js
    const spawn = fakeSpawn();
    await runFigures(CH04, { spawn });
    expect(spawn.countOf('resolve')).toBe(1);
```
→
```js
    const spawn = fakeSpawn();
    await runFigures(CH04, { spawn, ...PRISTINE });
    expect(spawn.countOf('resolve')).toBe(1);
```

(b) test `spawns translate-blocks.mjs ZERO times, having actually done the work` (HEAD 809–812):
```js
    const result = await runFigures(CH04, { spawn });
    expect(spawn.countOf('translate')).toBe(0);
```
→
```js
    const result = await runFigures(CH04, { spawn, ...PRISTINE });
    expect(spawn.countOf('translate')).toBe(0);
```

(c) test `never holds more than one figure directory at a time in a dry run` (HEAD 861–864):
```js
    const result = await runFigures(CH04, { spawn });
    expect(spawn.liveDirs.length).toBeGreaterThan(10); // non-vacuity: it really did prepare
```
→
```js
    const result = await runFigures(CH04, { spawn, ...PRISTINE });
    expect(spawn.liveDirs.length).toBeGreaterThan(10); // non-vacuity: it really did prepare
```

(d) test `names an unresolved figure instead of failing the run over it (R9)` (HEAD 1006–1007):
```js
    const result = await runFigures(CH04, { spawn });
    expect(result.tally.unresolved).toBe(1);
```
→
```js
    const result = await runFigures(CH04, { spawn, ...PRISTINE });
    expect(result.tally.unresolved).toBe(1);
```

(e) test `ABORTS when the resolver itself fails…` (HEAD 1026):
```js
    await expect(runFigures(CH04, { spawn: failing })).rejects.toThrow(/updates-2e/);
```
→
```js
    await expect(runFigures(CH04, { spawn: failing, ...PRISTINE })).rejects.toThrow(/updates-2e/);
```

(f) test `REFUSES when --figure matches nothing…` (HEAD 1031–1034):
```js
      ['--book', 'efnafraedi-2e', '--chapter', '4', '--dry-run', '--figure', 'NO_SUCH_FIGURE'],
      { spawn }
```
→
```js
      ['--book', 'efnafraedi-2e', '--chapter', '4', '--dry-run', '--figure', 'NO_SUCH_FIGURE'],
      { spawn, ...PRISTINE }
```

(g) test `REFUSES when --module names a file that does not exist` (HEAD 1059–1062):
```js
      ['--book', 'efnafraedi-2e', '--chapter', '4', '--dry-run', '--module', 'm00000'],
      { spawn }
```
→
```js
      ['--book', 'efnafraedi-2e', '--chapter', '4', '--dry-run', '--module', 'm00000'],
      { spawn, ...PRISTINE }
```

(h) test `leaves both ch21 figures unresolved, NAMED…` (HEAD 1265):
```js
    const result = await runFigures(CH21, { spawn });
```
→
```js
    const result = await runFigures(CH21, { spawn, ...PRISTINE });
```

(i) test `still refuses when --figure names only one of the two claimants` (HEAD 1292):
```js
    const result = await runFigures({ ...CH21, figures: [D92B] }, { spawn });
```
→
```js
    const result = await runFigures({ ...CH21, figures: [D92B] }, { spawn, ...PRISTINE });
```

(j) test `still refuses when --module names only one of the two claimants` (HEAD 1300):
```js
    const result = await runFigures({ ...CH21, modules: ['m68852'] }, { spawn });
```
→
```js
    const result = await runFigures({ ...CH21, modules: ['m68852'] }, { spawn, ...PRISTINE });
```

(k) test `shows which artwork each de-hashed figure was given` (HEAD 1348):
```js
        { spawn: fakeSpawn(strippedOnly) }
```
→
```js
        { spawn: fakeSpawn(strippedOnly), ...PRISTINE }
```

(l) test `prints it for a COPIED figure too, not only for the ones that spend` (HEAD 1504–1505):
```js
    const result = await runFigures(CH04, { spawn });
    expect(result.figures.find((f) => f.basename === 'CNX_Chem_04_05_filter').outcome).toMatch(
```
→
```js
    const result = await runFigures(CH04, { spawn, ...PRISTINE });
    expect(result.figures.find((f) => f.basename === 'CNX_Chem_04_05_filter').outcome).toMatch(
```

- [ ] **Step 7: Run the file, then the bump simulation (GREEN).**

```bash
npx vitest run tools/__tests__/figure-run-free.test.js
for v in 5 4; do SIM_COMPOSER_VERSION=$v NODE_OPTIONS="--require /tmp/c38-plan/bump-preload.cjs" npx vitest run tools/__tests__/figure-run-free.test.js --reporter=json --outputFile=/tmp/c38-plan/sim$v.json >/tmp/c38-plan/sim$v.out 2>&1; echo "v=$v exit=$?"; grep -ac 'bump-preload' /tmp/c38-plan/sim$v.out; node -e "const r=require('/tmp/c38-plan/sim$v.json');console.log('failed',r.numFailedTests);for(const f of r.testResults)for(const a of f.assertionResults)if(a.status==='failed')console.log(' RED',a.fullName)"; done; git status --porcelain
```

Expected: the plain run 0 failed; `v=5 exit=0 failed 0` and `v=4 exit=0 failed 0`, each with a non-zero preload-line count whose lines name this checkout's `tools/lib/figure-text-sidecar.cjs` (a line proves the preload ran; that the bump reached the driver is shown by Step 1's red at `'5'` from the same preload file); porcelain shows only the test file. **This run is the evidence that a bump-only commit leaves this file green.** (The planning replay of the fixed call sites, green at `'5'` and `'4'`, was the instrument that chose the design, not this evidence.)

- [ ] **Step 8: Lint, format, commit.**

```bash
npx eslint tools/__tests__/figure-run-free.test.js && npx prettier --check tools/__tests__/figure-run-free.test.js
```
If prettier reports the file, run `npx prettier --write tools/__tests__/figure-run-free.test.js` and repeat Step 7's plain run. Then:
```bash
git add tools/__tests__/figure-run-free.test.js
git commit -m "test(figure-run): §C140 ㊳ — every driver run names its sidecar world; a tripwire enforces it, 0 ISK" -m "Twelve runFigures/main calls read the real sidecar tree without saying so; two of them went red on a COMPOSER_VERSION bump alone and the peak-disk test sat one purchase from red. All twelve now pass PRISTINE, and a source scan (with a planted control) refuses a call that names neither PRISTINE, CORPUS nor both readers. Verified green under an in-memory '5' and '4'."
```

- [ ] **Step 9: Record it in the one status owner (register row ㊳), then clean up.** In `docs/plans/2026-07-21-post-item17-followup-campaign.md`, row ㊳ (`grep -an '^| ㊳'`), replace the status cell's opening
```
| open, logged. ⚠️ **RE-MEASURED 2026-09-29 for the '4' → '5' bump
```
with
```
| ✅ **BUILT (PR-A, `feat/c140-c49-step2-code-fixes`)**: "skips exactly" now applies `isStale` to the run's own reader in three worlds (real tree, every sidecar stale, every sidecar current), and every `runFigures`/`main` call in the file names `PRISTINE`, `CORPUS` or both readers, enforced by a source-scan tripwire with a planted control. **Re-measured 2026-10-03 at `2f5f213bf` with an in-memory '5' (a `--require` preload; the repo file untouched): the unfixed file went from all green to 3 red, the same three names; the fixed file is green at '5' and at '4'.** So a bump commit no longer has to share a commit with its restamp: re-measured 2026-10-03 with the constant set to '5' ON DISK in a scratch worktree (restored from a golden copy), every test file under `tools/__tests__` and `server/__tests__` whose name or text reaches a sidecar consumer (`figure-run`, `figure-text-sidecar`, `publish-figure-svg`, `cnxml-render`, `figureReviewService`) stayed green, this file included (D8's single MERGE still stands). ~~open, logged.~~ ⚠️ **RE-MEASURED 2026-09-29 for the '4' → '5' bump
```
```bash
git add docs/plans/2026-07-21-post-item17-followup-campaign.md
git commit -m "docs(register): §C140 ㊳ built in PR-A — figure-run-free reads currency, not existence"
rm -rf /tmp/c38-plan
git status --porcelain
```
Expected: porcelain empty.


---

# Part 5 — `heldBlockValues`: compose-time substitution for the kept-English short words (spec D5(a)) · ❌ NOT DRAFTED

The drafting run stopped at the weekly usage limit before this part's drafter ran. **PR-A must not merge without it.**

**🔄 2026-10-03: DESIGNED, and being implemented test-first in a scratch worktree, with this section extracted from the commits.** Design (frozen, judge panel of three designs and two judges): [`docs/superpowers/specs/2026-10-03-c140-step2-part5-heldblockvalues-design.md`](../specs/2026-10-03-c140-step2-part5-heldblockvalues-design.md). Its decisions: a value is [USER]'s string, lines separated by `'\n'`, `₂ ⁰ ⁻` decoded to raised/lowered base glyphs in the block's OWN source script style; one visual line at a time (unchanged lines drawn run-exact as today, a changed line laid out with its own cues inside the block's container, refused unless it fits on one line at source size); `figure-compose.py` reads the config, pre-flights every key against `blocks.json` and verifies compose's `held` list against it (double entry); held keys leave `missing`; `held` joins the compose notes. All 13 sheet lines measured to fit at source size.

**[USER] items, prerequisites for PR-B's data commit (none blocks PR-A, whose table ships empty):** (1) a held value that does not fit at its source size is REFUSED (the figure fails compose and keeps its current copy), not shrunk or wrapped; (2) a refusal is fatal to that one figure, which then also waits for the pass's other fixes until the entry is corrected; (3) buffer's `⁻` is drawn after the subscript `2` (the source tucks it 1.4 pt back over it), as every translated stacked charge is today — accept, or check by eye in PR-B; (4) transcription: B4–B6 are stored as three and two lines with the unchanged lines (`4+`, `4–`, `C`) drawn exactly as the source draws them (charges stay italic), and A1 is the bare `Nei`.

The original requirement list, kept for the record (from the spec and the measurements, `rederive.json` → `results.verbatim` and both verifiers):
- a `heldBlockValues` table `{ "<basename>": { "<exact blockKey>": "<value from [USER]>" } }` in `figure-text.config.json`, shipped EMPTY, with its own validator rule (Review Focus 5);
- `compose.py` draws the value for a `send:false` block on the KEPT path, the way numloc's `localise_block` rewrites kept text; the block stays `send:false`, so `classify_holds` raises nothing and no money path opens; it reports each substitution in `compose.json`; it works for textless figures (`recomposeTextless`) and sidecar figures; `figure-compose.py verify()` must not call an overridden key `held_but_drawn`; establish how `compose.py` learns the basename;
- red-first tests, and a control that an un-listed `No` (nobelium) in a periodic-table figure stays as it is;
- ✅ **the value sheet now EXISTS** (measured byte-exact 2026-10-03, with the real `figure-prepare.py` into scratch): `docs/handoffs/2026-10-03-step2-value-sheet.md`. It settles OxStNonmts (TWO blocks, `4+|To|4–` and `5+|To|3–`, each over three source lines) and shows that 6 of its rows carry formulas, so this part must decide whether a supplied value can keep sub/superscripts and charges. **[USER] filled it in on 2026-10-03.** Two requirements follow from the answers: (1) a value must be able to carry raised and lowered runs, because the figure font has NO glyph for ⁰ or ⁻, so the B-group values are formatting intent, not literal characters; (2) a value must be able to span several lines (B4–B6). Read the sheet's Reading notes. What the sheet was asked to contain, kept for the record: `figure-prepare.py` into a scratch dir, ONE figure at a time (`free -h` between), for MattType, MYdCmIn, AMFM, MolSpeed1, phscale, buffer, amide1_img, HNO2_img and OxStNonmts (settle whether OxStNonmts' `To` is one block `4+|To|4–` or three); one row per held English-prose block with its byte-exact key, the drawn text, and the June copy's wording quoted as EVIDENCE; plus the HetCats and Graphene sidecar-value rows and the policy rows (MYdCmIn `in.`, the `ft` labels, AMFM `AM`/`FM`: localise or keep the English?). The value column stays blank for [USER].


---

# Handoff to PR-B (from Part 1)

## What PR-A's `keptCopies` tasks hand to PR-B (facts PR-B's data commits rely on)

These are inputs for the PR-B plan, not PR-A tasks.

0. 🔴 **BLOCKING ORDER (verifier, money and overwrite).** A figure's `keptCopies` entry is committed in the SAME commit as its June restore and its sidecar deletion, or in an earlier commit, **never after**. If PerTable2's sidecar is deleted while `keptCopies` is still empty, PerTable2 becomes a sidecar-less figure whose mapping row resolves, so a plain `figure-run.js` run (exactly what `scripts/chemistry-autorun-chapter.sh` invokes) would BUY it and publish over the restored June copy. Before the `git rm` of the sidecar, run `( cd experiments/figure-text-translation && FIGTEXT_PYLIBS=./pylibs python3 -B sources.py --json efnafraedi-2e CNX_Chem_02_05_PerTable2 )` and confirm `"refused": "kept"`. The same holds for catalyst and ibuprofen: their entries land before any other change that could make either buyable. Each was measured read-only on 2026-10-03 against `2f5f213bf`.

1. **The three candidates already satisfy the new validator rule.** Measured with HEAD's `buildValidatorCorpus`, which computes exactly what `keptState` will compute:
   - `CNX_Chem_02_05_PerTable2`: `{"rows":1,"translatedCopies":["CNX_Chem_02_05_PerTable2_IS.svg"]}`
   - `CNX_Chem_13_03_catalyst`: `{"rows":1,"translatedCopies":["CNX_Chem_13_03_catalyst_IS.svg"]}`
   - `CNX_Chem_03_01_ibuprofenmass_img`: `{"rows":1,"translatedCopies":["CNX_Chem_03_01_ibuprofenmass_img_IS.svg"]}`

   Each has a single owner book, `efnafraedi-2e`. With the patched validator, the committed config plus these three entries gives `[]`. The control, adding the retired `CNX_Chem_18_07_N2O5`, gives exactly three problems: `is also in retiredFigures`, `has no image-mapping row` and `has no translated copy`. So PR-B's entry commit passes `npm test` provided each reason runs over 40 characters.
2. **The commit that records the first `keptCopies` entry also adds** `expect(keys.length).toBeGreaterThan(0);` as the first assertion of the committed-config test `every kept key was examined on the real tree, and found with its row and its copy` (Task 3 Step 6). While the table is empty, that test is vacuous by construction.
3. **Nothing mechanical deletes or forbids a kept figure's sidecar.** D1's sidecar deletion (PerTable2's `books/efnafraedi-2e/figure-text/CNX_Chem_02_05_PerTable2.is.json`) is a step in PR-B's restore commit and nothing else. If it is skipped, the figure reads `skipped-current` before the bump and `REFUSED — kept` after it, so it is still never recomposed. The page keeps its `data-figure-review` badge, though, and the review panel keeps listing blocks that are no longer drawn. Verify with `ls books/efnafraedi-2e/figure-text/CNX_Chem_02_05_PerTable2.is.json` → *No such file* after the restore commit. The sidecar count goes from 461 to 460. No test pins 461 (grep in the overview).
4. **Catalyst and ibuprofen move to a different dry-run line, so the critic's ordering constraint 5 (rederive.json) changes.** Once they are in `keptCopies`, both are refused at resolution and never prepared:
   - ch03, ibuprofenmass_img: no longer reaches `isRecomposableTextless` ("textless with an embedded raster, NOT recomposed"). It reads `⚠️ REFUSED — kept: CNX_Chem_03_01_ibuprofenmass_img: <reason>` plus `⚠️ readers still see an earlier translated copy of CNX_Chem_03_01_ibuprofenmass_img: media/CNX_Chem_03_01_ibuprofenmass_img_IS.svg (mapping row present) — refusing does not retire it`.
   - ch13, catalyst: leaves the `unresolved — the artwork delivery has a hole here` list for the same two lines.
   - Both still count under `unresolved`, a NOTE.

   Detector: the in-memory probe in Task 4 Step 5 returned `refused: "kept"` for both.
5. **A kept reason must not contain the literal `REFUSED — superseded`.** `scripts/chemistry-autorun-chapter.sh:207-208` greps the whole figure log, and `summarise` prints every refusal's reason. A reason that quoted that phrase would halt the chapter autorun.
6. **The pass still runs `--stale`, never through the autorun.** A kept figure refuses on every route, but the other 700+ figures do not. The spec's rule that the pass never runs without `--stale` is unchanged by this guard.
