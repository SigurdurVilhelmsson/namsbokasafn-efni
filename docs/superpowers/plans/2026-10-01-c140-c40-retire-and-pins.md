# §C140 ㊵ — Retire Tool and Artwork Pins Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the two tools §C140 ㊵ needs: a durable "retired" record with a tool that retires a figure's translated copy and later prunes its orphaned published copies, and artwork pins (alias/override) that `sources.py` resolves to one exact file.

**Architecture:** Two new tables in the figure config are read by `sources.py` (Python, the resolver `figure-run.js` consults) and by three new JS modules: a config reader, a "where does a translated copy live and who references it" library, and a config validator. A new CLI, `tools/retire-translated-figure.js`, carries out a retirement in two steps (`--retire`, then `--prune` after ②'s re-render). The mapping generator skips retired names. `figure-run.js` changes wording only.

**Tech Stack:** Node 22 ESM (`tools/`), Vitest, Python 3 (`experiments/figure-text-translation/`, run with `FIGTEXT_PYLIBS=./pylibs`), git ≥ 2.23 (`git restore`).

**Spec:** `docs/superpowers/specs/2026-10-01-c140-c40-retire-and-pins-design.md` (approved by [USER] 2026-10-01, `cf3c6f697`). Evidence: `experiments/figure-text-translation/evidence/2026-10-01-c40-design/`.

## Global Constraints

- **Branch:** `feat/c140-c40-retire-and-alias`. Never commit to `main`.
- **Code only.** `retiredFigures` and `artworkPins` ship **empty** (`{}`). No file under `books/` changes in this PR: no retire, no prune, no re-inject, no re-render, no buy, no sync.
- **`DEFAULT_SUFFIX` is owned by `tools/generate-image-mapping.js`.** Import it; never write its value in code or prose. Python must not restate it either.
- **Resolver order:** `retiredFigures` → `supersededArtwork` → `artworkPins` → the normal lookup. Keys fold with `sources._normkey` in Python; the JS tools match **exactly**.
- **Refusal kinds added:** `retired`, `pin-conflict`, `pin-missing`, `pin-invalid`.
- **A reason has over 40 characters.**
- **The retire tool:** strict flags (unknown → exit 2), a dry run unless `--apply`, exit codes `0` done · `1` refused or failed-and-restored · `2` usage, `process.exitCode` (never `process.exit` after output).
- **MIT boundary:** nothing new under `tools/` imports from `server/`.
- **The literal `01-source` must not appear in `tools/retire-translated-figure.js`** (`tools/__tests__/source-write-guard.test.js` flags any top-level tool whose text contains it). Reach the source CNXML through `indexBookSourceBasenames` (Task 5).
- **Three refinements made during planning, applied to the spec in Task 10:**
  - **D13:** translated copies are not scanned for references. Measured 2026-10-01: they are 821 MB of the 879 MB corpus, and 0 of 1,471 translated SVGs reference any external file (every `href`/`src`/`url(` is a `data:` URI or a `#` fragment). Without them the scan takes about 0.4 s.
  - **D10:** `--prune` lists every kept copy whose reason is not "a mapping row still names it", and reports the mapped ones as a count. Listing all of them would print about 745 lines for chemistry.
  - **D11:** the validator checks that a retired figure has **no row and no translated copy** (what `--retire` removes). Published copies and references legitimately remain until ②. After the prune, `--retire` re-run as a dry run is the census: its report says whether anything still references each figure.
- **Python tests:** `cd experiments/figure-text-translation && FIGTEXT_PYLIBS=./pylibs python3 -u test_sources.py`. Expected tail: `ALL PASS`. No CI job runs it, so run it by hand.
- **Shell traps on this box:** `grep` is ugrep (use `grep -a`); `find` is bfs; `jq` is not installed. Run `git status --porcelain` after any agent finishes.
- **Fixtures that contain an `01-source` directory are built with `fs` in test code, never with a shell redirect.** The project's `guard-01-source.mjs` hook refuses any Bash command that redirects into a path containing `01-source`, scratch paths included. The refusal looks like a permissions problem; it is the licence guard working as designed. Never work around it.
- **JS formatting:** the pre-commit hook (lint-staged) runs `eslint --fix` and `prettier --write` on staged `tools/**/*.js`. Long lines in this plan's code are reflowed at commit. If eslint rejects a commit, fix the reported line and commit again, never with `--no-verify`.
- **Commits** end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

These five input classes are implied by the spec but not exercised by its own test list. Each has a test added to the task that owns the code:

1. **An unrelated modified file in `media/`** must not block a retire. Only the files being deleted must be clean. → Task 8, "an unrelated modified file…".
2. **A mapping row whose translated copy is already gone** must still be removable, with nothing to delete and exit 0. → Task 8, "removes a row whose translated copy is already gone…".
3. **A published copy whose name a page could only reference URL-encoded** (a space, a non-ASCII letter) must be kept, not deleted on a missed reference. → Task 9, "keeps a copy whose name could be URL-encoded".
4. **The CLI run from another working directory** must find the repo by its own location, not the cwd. → Task 8, "runs from any working directory".
5. **`figure-run.js` receiving a pinned hit** (`via: 'override'`) must treat it exactly like any other hit. → Task 4, "treats a pinned hit…".

---

### Task 1: The config tables and the JS config reader

**Files:**
- Create: `tools/lib/figure-text-config.js`
- Create: `tools/__tests__/figure-text-config.test.js`
- Modify: `experiments/figure-text-translation/figure-text.config.json`

**Interfaces:**
- Consumes: nothing.
- Produces (`tools/lib/figure-text-config.js`):
  - `FIGURE_TEXT_CONFIG: string`, the absolute path of the figure config.
  - `loadFigureTextConfig(configPath = FIGURE_TEXT_CONFIG, readFile = fs.readFileSync): object`
  - `retiredFigureNames(cfg: object): Set<string>`, the exact keys of `cfg.retiredFigures`. An absent table gives an empty set; a table that is not a plain object throws `Error(/retiredFigures must be an object/)`.
  - `loadRetiredFigures(configPath = FIGURE_TEXT_CONFIG): Set<string>`
  - `normkey(stem: string): string`, the JS mirror of `sources._normkey`.

- [ ] **Step 1: Write the failing test**

Create `tools/__tests__/figure-text-config.test.js`:

```js
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  FIGURE_TEXT_CONFIG,
  loadFigureTextConfig,
  retiredFigureNames,
  loadRetiredFigures,
  normkey,
} from '../lib/figure-text-config.js';

describe('figure-text-config (§C140 ㊵)', () => {
  it('points at the committed figure config', () => {
    expect(
      FIGURE_TEXT_CONFIG.endsWith(
        path.join('experiments', 'figure-text-translation', 'figure-text.config.json')
      )
    ).toBe(true);
    expect(Array.isArray(loadFigureTextConfig().editionPrecedence)).toBe(true);
  });

  it('the committed config carries both tables as plain objects', () => {
    const cfg = loadFigureTextConfig();
    for (const key of ['retiredFigures', 'artworkPins']) {
      const t = cfg[key];
      expect(t !== null && typeof t === 'object' && !Array.isArray(t)).toBe(true);
    }
  });

  it('reads the EXACT keys of retiredFigures', () => {
    const cfg = { retiredFigures: { CNX_A: 'r', cnx_b: 'r' } };
    expect([...retiredFigureNames(cfg)]).toEqual(['CNX_A', 'cnx_b']);
  });

  it('treats an absent table as empty', () => {
    expect(retiredFigureNames({}).size).toBe(0);
  });

  it.each([[null], [[]], ['CNX_A'], [5]])('refuses a retiredFigures that is not an object: %j', (bad) => {
    expect(() => retiredFigureNames({ retiredFigures: bad })).toThrow(
      /retiredFigures must be an object/
    );
  });

  it('loads the table from a given config path', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'figcfg-'));
    const file = path.join(dir, 'figure-text.config.json');
    fs.writeFileSync(file, JSON.stringify({ retiredFigures: { CNX_Z: 'a reason' } }));
    expect([...loadRetiredFigures(file)]).toEqual(['CNX_Z']);
  });

  // 🔴 THE SAME LITERAL TABLE AS experiments/figure-text-translation/test_sources.py (Task 2). Two
  // implementations of one fold — sources._normkey and normkey here — are kept in agreement by
  // pinning both to it. Change both or neither.
  it.each([
    ['CNX_Chem_12_07_Cat Convert', 'cnxchem1207catconvert'],
    ['CNX_Chem_21_03_RadioDecay-e619', 'cnxchem2103radiodecaye619'],
    ['Figure 14_03_ICETable2_img', 'figure1403icetable2img'],
    ['CNX_Chem_08_02_sp3d_img', 'cnxchem0802sp3dimg'],
    ['Ö_Ð-þ²', 'öðþ²'],
  ])('normkey(%j) is %j, as sources._normkey', (input, want) => {
    expect(normkey(input)).toBe(want);
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx vitest run tools/__tests__/figure-text-config.test.js`
Expected: FAIL. The module cannot be resolved (`Failed to load url ../lib/figure-text-config.js` or similar).

- [ ] **Step 3: Write the module**

Create `tools/lib/figure-text-config.js`:

```js
/**
 * figure-text-config — the JS tools' reader of the figure-text config (§C140 ㊵).
 *
 * The file is `experiments/figure-text-translation/figure-text.config.json`, owned by the figure
 * experiment; `sources.py` reads it too. This module owns its PATH for the tools that need the
 * `retiredFigures` table (the mapping generator and the retire tool) and the config validator.
 *
 * ⚠️ `tools/figure-run.js` keeps its own `FIGURE_TEXT_CONFIG` constant. That is deliberate in this
 * change: the paid driver changes wording only (spec D7). Both copies resolve to the same file,
 * and both fail loudly if it moves.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

export const FIGURE_TEXT_CONFIG = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  'experiments',
  'figure-text-translation',
  'figure-text.config.json'
);

/** The parsed figure config. Throws on unreadable or invalid JSON: a tool must not guess. */
export function loadFigureTextConfig(configPath = FIGURE_TEXT_CONFIG, readFile = fs.readFileSync) {
  return JSON.parse(readFile(configPath, 'utf-8'));
}

/**
 * The EXACT keys of `retiredFigures`. The JS tools match retired names exactly; the validator
 * requires every key to be exactly one book's image basename, so a key misspelt by case is caught
 * there rather than silently matching here.
 * @param {object} cfg
 * @returns {Set<string>}
 * @throws {Error} when the table is present but is not a plain object
 */
export function retiredFigureNames(cfg) {
  const table = cfg.retiredFigures;
  if (table === undefined) return new Set();
  if (table === null || typeof table !== 'object' || Array.isArray(table)) {
    throw new Error(
      `retiredFigures must be an object of {basename: reason}, got ${JSON.stringify(table)}`
    );
  }
  return new Set(Object.keys(table));
}

/** @returns {Set<string>} the retired names in the config at `configPath` */
export function loadRetiredFigures(configPath = FIGURE_TEXT_CONFIG) {
  return retiredFigureNames(loadFigureTextConfig(configPath));
}

/**
 * The fold `sources._normkey` applies: lower-case, then keep letters and digits only.
 * 🔴 TWO IMPLEMENTATIONS OF ONE RULE. Python's `str.isalnum()` keeps Unicode letters and numbers,
 * which is what `\p{L}` and `\p{N}` match. Both are pinned to the same literal table in
 * tools/__tests__/figure-text-config.test.js and experiments/figure-text-translation/test_sources.py.
 * @param {string} stem
 * @returns {string}
 */
export function normkey(stem) {
  return stem.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
}
```

- [ ] **Step 4: Add the two tables to the config, and fix three out-of-date texts**

In `experiments/figure-text-translation/figure-text.config.json`:

(a) Directly after the line that starts `"_supersededArtwork":` (it ends with `(§C140 ⑦).",`), insert:

```json

  "retiredFigures": {},
  "_retiredFigures": "§C140 ㊵. Basenames whose TRANSLATED COPY was retired by a [USER] ruling: readers get OpenStax's own figure, and no run may make a translated copy again. sources.py refuses these first — before supersededArtwork and before any lookup — as `retired`; tools/generate-image-mapping.js never maps them; tools/retire-translated-figure.js removes their image-mapping row and translated copy (--retire), and later their published copies once nothing references them (--prune). Different from supersededArtwork, which is about the SOURCE drawing: a figure may be in both (BlastFurn, Ques11ans). The value is what was ruled and why, over 40 characters. An entry lands in the commit that runs the retire, never earlier. The JS tools match a key exactly; sources.py folds case and punctuation; tools/lib/figure-config-validate.js requires each key to be exactly one book's image basename.",

  "artworkPins": {},
  "_artworkPins": "§C140 ㊵. {basename: {kind, edition, file, reason}}: the ONE file a figure's artwork is taken from. `edition` is a key of this book's trees in sources.local.json; `file` is a path inside that tree, never a stem or a pattern. kind `alias` fills a hole in the delivery, and is refused as pin-conflict once any file matches the basename, exactly or folded. kind `override` deliberately replaces the normal lookup. A missing file is refused as pin-missing, never a fall-back; a malformed entry as pin-invalid; two pins naming one file as pin-conflict. A pin lands in the commit that runs its buy, after tools/lib/figure-config-validate.js passes locally: CI runs only after the money is spent.",
```

(b) In the value of `"_supersededArtwork"`, replace `Matched case-insensitively, like the lookup.` with `Matched after the lookup's case and punctuation fold (sources._normkey).`

(c) In the value of `"CNX_Chem_07_04_Ques11ans_img"`, replace `The June Cowork _IS.svg carries the same extra O3 row and stays mapped, so whether to retire it is a separate [USER] call.` with `The June Cowork _IS.svg carried the same extra O3 row; [USER] ruled 2026-09-19 to retire it, and it was retired the same day (register §C163).`

(d) In the value of `"_paperSizes"`:
- replace `A resolved artwork whose page box is one of these is a production page - a placement or dialogue SHEET - not a figure, and sources.py refuses it;` with `A candidate whose page box is one of these is a production page - a placement or dialogue SHEET - not a figure: sources.py skips it for the edition's next candidate, and refuses the figure only when every candidate in the edition is one;`
- replace `Measured 2026-09-16 (evidence/2026-09-16-c7-explore/): exactly 2 of 910 resolved artworks are paper-size, both Letter.` with `Measured 2026-09-16, before that per-candidate rule (evidence/2026-09-16-c7-explore/): exactly 2 of 910 resolved artworks were paper-size, both Letter (rvosmosis, N2O5); today only rvosmosis is refused, because N2O5's .eps sibling resolves.`

Then check the file is still valid JSON:

Run: `node -e "JSON.parse(require('fs').readFileSync('experiments/figure-text-translation/figure-text.config.json','utf8')); console.log('ok')"`
Expected: `ok`

- [ ] **Step 5: Run the tests and confirm they pass**

Run: `npx vitest run tools/__tests__/figure-text-config.test.js`
Expected: PASS.

Run: `cd experiments/figure-text-translation && FIGTEXT_PYLIBS=./pylibs python3 -u test_sources.py | tail -3; cd -`
Expected: `ALL PASS`. The config edits must not disturb the resolver's existing checks.

- [ ] **Step 6: Commit**

```bash
git add tools/lib/figure-text-config.js tools/__tests__/figure-text-config.test.js experiments/figure-text-translation/figure-text.config.json
git commit -m "feat(figures): §C140 ㊵ — retiredFigures and artworkPins tables (empty) + the JS config reader

Both tables ship empty: each entry lands in the commit that acts on it (spec D1). The
reader owns the config path for the generator, the retire tool and the validator, and
normkey mirrors sources._normkey, pinned to a literal case table shared with
test_sources.py. Also corrects three config texts: _supersededArtwork's matching rule,
the Ques11ans reason (retired 2026-09-19), and _paperSizes (N2O5 now resolves).

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: `sources.py` — the retired refusal, the keyword plumbing, and one CLI function

**Files:**
- Modify: `experiments/figure-text-translation/sources.py`
- Modify: `experiments/figure-text-translation/test_sources.py` (insert a section between the ⑦ section, which ends at the line `any(l.startswith('  1 of 3 REFUSED') for l in lines)), (True, True))`, and the comment block that opens `# The shipped list is DATA`)

**Interfaces:**
- Consumes: the `retiredFigures` table (Task 1).
- Produces:
  - `resolve_detail(basename, trees, precedence, exts=SOURCE_EXTS, superseded=None, _memo=None, size_of=page_size, *, retired=None)`, plus the same `*, retired=None` on `resolve(...)`, `resolve_report(names, trees, precedence, exts=SOURCE_EXTS, superseded=None, *, retired=None)` and `human_report(names, trees, precedence, superseded=None, *, retired=None)`.
  - A retired refusal: `{'path': None, 'refused': 'retired', 'edition': None, 'candidates': [], 'reason': str}`.
  - `policy(cfg) -> {'superseded': ..., 'retired': ...}` (Task 3 adds `'pins'`).
  - `run_cli(argv, cfg=None, out=print) -> int`, which raises `SystemExit(__doc__)` on a usage error.
  - `main(book, names)` is removed. Its only caller was `__main__`.

- [ ] **Step 1: Write the failing tests**

In `test_sources.py`, insert this section immediately before the comment block that begins `# ---…` / `# The shipped list is DATA`:

```python
# ---------------------------------------------------------------------------
# §C140 ㊵ — A RETIRED FIGURE IS REFUSED FIRST: before `superseded`, before any lookup.
# Retired is about the TRANSLATED COPY (removed by a ruling); superseded is about the SOURCE
# drawing. A figure may be in both, and retired wins so the chapter autorun's halt on
# `REFUSED — superseded` stops firing for a figure with nothing left to publish over.
# ---------------------------------------------------------------------------
import json

with tempfile.TemporaryDirectory() as td:
    td = Path(td)
    old, new = td / 'first-edition', td / 'updates-2e'
    old.mkdir(); new.mkdir()
    trees = {'first-edition': str(old), 'updates-2e': str(new)}
    prec = ['updates-2e', 'first-edition']
    make_eps(old / 'CNX_Ret.eps', 300, 200)
    make_eps(old / 'CNX_Other.eps', 300, 200)
    R = {'CNX_Ret': 'retired by a test ruling: readers get the English figure instead'}
    SUP = {'CNX_Ret': 'its only vector is known to be superseded (a test reason)'}

    d = resolve_detail('CNX_Ret', trees, prec, retired=R)
    check('㊵ a retired figure is refused before any lookup, with its reason',
          (d['path'], d['refused'], d['edition'], d['reason']), (None, 'retired', None, R['CNX_Ret']))
    check('㊵ CONTROL: without the table the same figure resolves',
          Path(resolve_detail('CNX_Ret', trees, prec)['path']).name, 'CNX_Ret.eps')
    check('㊵ retired is checked BEFORE superseded: a figure may be in both',
          resolve_detail('CNX_Ret', trees, prec, superseded=SUP, retired=R)['refused'], 'retired')
    check('㊵ CONTROL: superseded alone still refuses as superseded',
          resolve_detail('CNX_Ret', trees, prec, superseded=SUP)['refused'], 'superseded')
    check('㊵ retired keys fold case and punctuation, like the lookup',
          resolve_detail('cnx-ret', trees, prec, retired=R)['refused'], 'retired')
    d = resolve_detail('CNX_Ret', trees, prec, retired={'CNX_Ret': ''})
    check('㊵ an entry acts by its PRESENCE: an empty reason still refuses',
          (d['refused'], d['reason']), ('retired', '(no reason recorded)'))
    check('㊵ CONTROL: another figure is untouched by the table',
          Path(resolve_detail('CNX_Other', trees, prec, retired=R)['path']).name, 'CNX_Other.eps')
    check('㊵ resolve() returns (None, None) for a retired figure',
          resolve('CNX_Ret', trees, prec, retired=R), (None, None))
    check('㊵ resolve_report carries the retired refusal',
          resolve_report(['CNX_Ret'], trees, prec, retired=R)['CNX_Ret']['refused'], 'retired')
    lines, missing, refused = human_report(['CNX_Ret', 'CNX_Other'], trees, prec, retired=R)
    check('㊵ the human report prints REFUSED — retired with its reason, and counts it',
          (any('REFUSED — retired: retired by a test ruling' in l for l in lines), missing, refused),
          (True, 0, 1))

    # ONE function runs both command-line modes. The seam is a synthetic config whose
    # sourceTreesFile is an ABSOLUTE path: load_trees joins it onto HERE, and an absolute path
    # wins a pathlib join.
    local = td / 'sources.local.json'
    local.write_text(json.dumps({'testbook': trees}))
    cfg = {'editionPrecedence': prec, 'sourceTreesFile': str(local),
           'supersededArtwork': {}, 'retiredFigures': R}
    check('㊵ policy() takes its tables from the config',
          S.policy({'supersededArtwork': 1, 'retiredFigures': 2}), {'superseded': 1, 'retired': 2})
    out = []
    rc = S.run_cli(['--json', 'testbook', 'CNX_Ret', 'CNX_Other'], cfg=cfg, out=out.append)
    rep = json.loads(out[0])
    check('㊵ run_cli --json applies retiredFigures, leaves the control alone, and exits 0',
          (rc, rep['CNX_Ret']['refused'], Path(rep['CNX_Other']['path']).name),
          (0, 'retired', 'CNX_Other.eps'))
    out = []
    rc = S.run_cli(['testbook', 'CNX_Ret', 'CNX_Other'], cfg=cfg, out=out.append)
    check('㊵ run_cli human mode applies it too, and exits 1 on the refusal',
          (rc, 'REFUSED — retired' in out[0], 'CNX_Other.eps' in out[0]), (1, True, True))
    out = []
    S.run_cli(['--json', 'testbook', 'CNX_Ret'], cfg=dict(cfg, retiredFigures={}), out=out.append)
    check('㊵ CONTROL: run_cli without the entry resolves the figure',
          Path(json.loads(out[0])['CNX_Ret']['path']).name, 'CNX_Ret.eps')
    try:
        S.run_cli(['--json', 'testbook'], cfg=cfg, out=out.append)
        raised = 'returned'
    except SystemExit as exc:
        raised = str(exc)
    check('㊵ run_cli with too few arguments exits with the usage text',
          raised.startswith('Resolve a figure basename'), True)

# §C140 ㊵ — THE SAME LITERAL TABLE AS tools/__tests__/figure-text-config.test.js. Two implementations
# of one fold (sources._normkey and the JS normkey) are kept in agreement by pinning both to it.
_NORMKEY_CASES = [
    ('CNX_Chem_12_07_Cat Convert', 'cnxchem1207catconvert'),
    ('CNX_Chem_21_03_RadioDecay-e619', 'cnxchem2103radiodecaye619'),
    ('Figure 14_03_ICETable2_img', 'figure1403icetable2img'),
    ('CNX_Chem_08_02_sp3d_img', 'cnxchem0802sp3dimg'),
    ('Ö_Ð-þ²', 'öðþ²'),
]
check('㊵ _normkey matches the case table the JS normkey is pinned to',
      [S._normkey(a) for a, _ in _NORMKEY_CASES], [b for _, b in _NORMKEY_CASES])
```

- [ ] **Step 2: Run them and confirm they fail**

Run: `cd experiments/figure-text-translation && FIGTEXT_PYLIBS=./pylibs python3 -u test_sources.py; cd -`
Expected: the script stops with a traceback ending in `TypeError: resolve_detail() got an unexpected keyword argument 'retired'`.

- [ ] **Step 3: Implement the retired refusal and the keyword plumbing**

In `sources.py`:

(a) Replace the `resolve_detail` signature and docstring:

```python
def resolve_detail(basename, trees, precedence, exts=SOURCE_EXTS, superseded=None, _memo=None,
                   size_of=page_size, *, retired=None):
    """-> {'path', 'edition'[, 'pageUnknown']} | None (a hole) | a refusal dict (see below).

    Precedence is over EDITIONS first, then over formats within an edition: a 2nd-edition EPS
    beats a 1st-edition PDF, because the edition is a question of WHICH PICTURE and the format
    only of how we read it.

    Checked BEFORE any lookup, in this order (§C140 ㊵): `retired` (a ruling retired the
    figure's TRANSLATED COPY), then `superseded` (its only vector is known to be superseded).

    A refusal is {'path': None, 'refused': 'retired'|'superseded'|'production-page', 'edition',
    'candidates': [{'path', 'page', 'paper'}], 'reason'}.
    """
```

(b) Immediately after that docstring, before the `# 🔴 KNOWN-SUPERSEDED ARTWORK IS REFUSED BEFORE ANY LOOKUP.` comment, insert:

```python
    # 🔴 §C140 ㊵ — A RETIRED FIGURE IS REFUSED FIRST, BEFORE `superseded` AND BEFORE ANY LOOKUP.
    # Retired is about the TRANSLATED COPY: a [USER] ruling removed it, readers get OpenStax's own
    # figure, and no run may make a translated copy again. Superseded is about the SOURCE drawing.
    # A figure may be both (BlastFurn, Ques11ans). Checking retired first prints
    # `REFUSED — retired`, so the chapter autorun's halt on `REFUSED — superseded` stops firing for
    # a figure with nothing left to publish over. A key acts by its PRESENCE: an entry whose
    # reason is empty still refuses.
    if retired:
        folded = {_normkey(k): v for k, v in retired.items()}
        key = _normkey(basename)
        if key in folded:
            reason = folded[key]
            return {'path': None, 'refused': 'retired', 'edition': None, 'candidates': [],
                    'reason': reason if isinstance(reason, str) and reason.strip()
                    else '(no reason recorded)'}

```

(c) Replace `resolve`:

```python
def resolve(basename, trees, precedence, exts=SOURCE_EXTS, superseded=None, _memo=None,
            size_of=page_size, *, retired=None):
    """-> (Path, edition_key) for the authoritative source, or (None, None) for a hole or a
    refusal. `resolve_detail` says which."""
    d = resolve_detail(basename, trees, precedence, exts, superseded=superseded, _memo=_memo,
                       size_of=size_of, retired=retired)
    if d and d.get('path'):
        return Path(d['path']), d['edition']
    return None, None
```

(d) In `resolve_report`, change the signature to `def resolve_report(names, trees, precedence, exts=SOURCE_EXTS, superseded=None, *, retired=None):` and its loop body to:

```python
        out[n] = resolve_detail(n, trees, precedence, exts, superseded=superseded, _memo=memo,
                                retired=retired)
```

(e) In `human_report`, change the signature to `def human_report(names, trees, precedence, superseded=None, *, retired=None):`, the report call to `report = resolve_report(names, trees, precedence, superseded=superseded, retired=retired)`, and the candidate loop to print a page size only when one is known:

```python
            for c in d.get('candidates') or []:
                size = (f"  {c['page'][0]:g}×{c['page'][1]:g} pt ({c['paper']})"
                        if c.get('page') and c.get('paper') else '')
                lines.append(f"  {'':14} {'':36}   {c['path']}{size}")
```

(f) Replace `def main(book, names): …` and the whole `if __name__ == '__main__':` block with:

```python
def policy(cfg):
    """-> the config's refusal tables as keyword arguments for `resolve_detail` and everything
    above it. The ONE place a command-line path reads them (§C140 ㊵): a second copy is how one
    mode comes to miss a table."""
    return {'superseded': cfg.get('supersededArtwork'),
            'retired': cfg.get('retiredFigures')}


def run_cli(argv, cfg=None, out=print):
    """Both command-line modes. -> the exit code; raises SystemExit(__doc__) on a usage error.

    `--json <book> <names…>`: one JSON report per call, exit 0 even when names did not resolve.
    A non-zero exit is reserved for a failure of the RESOLVER, which tools/figure-run.js must
    treat as fatal.
    `<book> <names…>`: the human report, exit 1 whenever a name did not resolve; the two count
    lines say which kind.
    """
    as_json = bool(argv) and argv[0] == '--json'
    if as_json:
        argv = argv[1:]
    if len(argv) < 2:
        raise SystemExit(__doc__)
    cfg = load_config() if cfg is None else cfg
    trees = load_trees(argv[0], cfg)
    precedence = cfg['editionPrecedence']
    if as_json:
        out(json.dumps(resolve_report(argv[1:], trees, precedence, **policy(cfg)),
                       ensure_ascii=False))
        return 0
    lines, missing, refused = human_report(argv[1:], trees, precedence, **policy(cfg))
    out('\n'.join(lines))
    return 1 if (missing or refused) else 0


if __name__ == '__main__':
    sys.exit(run_cli(sys.argv[1:]))
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `cd experiments/figure-text-translation && FIGTEXT_PYLIBS=./pylibs python3 -u test_sources.py | tail -3; cd -`
Expected: `ALL PASS`.

Run the CLI by hand, against the real trees, as a control on the wiring:

Run: `cd experiments/figure-text-translation && FIGTEXT_PYLIBS=./pylibs python3 sources.py --json efnafraedi-2e CNX_Chem_19_01_BlastFurn CNX_Chem_18_07_N2O5; echo "exit=$?"; cd -`
Expected: one JSON line, in which BlastFurn has `"refused": "superseded"` and N2O5 has a `"path"` ending `CNX_Chem_18_07_N2O5.eps`, then `exit=0`.

- [ ] **Step 5: Commit**

```bash
git add experiments/figure-text-translation/sources.py experiments/figure-text-translation/test_sources.py
git commit -m "feat(figures): §C140 ㊵ — sources.py refuses retired figures first; one CLI function for both modes

retired is checked before superseded (spec D2): a figure may be in both, and the label
stops the autorun's superseded halt for a figure with nothing left to publish over.
run_cli runs --json and the human report from one config and one argv, so a mode
cannot miss a table; tested with a synthetic config whose sourceTreesFile is absolute.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: `sources.py` — artwork pins

**Files:**
- Modify: `experiments/figure-text-translation/sources.py`
- Modify: `experiments/figure-text-translation/test_sources.py`

**Interfaces:**
- Consumes: Task 2's signatures and `policy`.
- Produces:
  - `*, retired=None, pins=None` on `resolve_detail`, `resolve`, `resolve_report` and `human_report`.
  - `policy(cfg)` now also returns `'pins': cfg.get('artworkPins')`.
  - A pinned hit is `{'path': str, 'edition': str, 'via': 'alias'|'override'[, 'pageUnknown': True]}`.
  - The new refusals: `pin-conflict`, `pin-missing`, `pin-invalid`, and a `production-page` refusal for a pinned paper-size file. Each candidate is `{'path'}`, plus `'page'` and `'paper'` when they are known.
  - `_require_dir(key, root, basename)`, shared by the lookup and the pins.

- [ ] **Step 1: Write the failing tests**

(a) In the Task 2 section of `test_sources.py`, replace

```python
    check('㊵ policy() takes its tables from the config',
          S.policy({'supersededArtwork': 1, 'retiredFigures': 2}), {'superseded': 1, 'retired': 2})
```

with

```python
    check('㊵ policy() takes its tables from the config',
          S.policy({'supersededArtwork': 1, 'retiredFigures': 2, 'artworkPins': 3}),
          {'superseded': 1, 'retired': 2, 'pins': 3})
```

(b) Insert this section directly after the `_NORMKEY_CASES` check that ends the Task 2 section:

```python
# ---------------------------------------------------------------------------
# §C140 ㊵ — ARTWORK PINS: one exact file, alias or override, failing closed.
# ---------------------------------------------------------------------------
PIN_REASON = 'a pin reason that is long enough to be a real reason (test)'


def pin(kind, edition, file, reason=PIN_REASON):
    return {'kind': kind, 'edition': edition, 'file': file, 'reason': reason}


with tempfile.TemporaryDirectory() as td:
    td = Path(td)
    old, new = td / 'first-edition', td / 'updates-2e'
    (old / 'Ch_03').mkdir(parents=True); (new / 'OSX').mkdir(parents=True)
    trees = {'first-edition': str(old), 'updates-2e': str(new)}
    prec = ['updates-2e', 'first-edition']

    make_eps(new / 'OSX' / 'Figure 14_03_ICE.eps', 351, 95)     # an alias target, with a space
    make_pdf(old / 'Ch_03' / 'CNX_Ibu.pdf', 432, 115)           # the base tree's OTHER drawing
    make_eps(old / 'Ch_03' / 'CNX_Ibu.eps', 451, 126)           # the drawing [USER] approved
    make_eps(new / 'CNX_Ibu.eps', 430, 114)                     # what the normal lookup returns
    make_eps(new / 'CNX_ice2.eps', 300, 200)                    # folds onto CNX_ICE2
    make_eps(old / 'Cnx_Amb.eps', 300, 200)                     # two stems folding onto one key,
    make_eps(old / 'cnx-amb.eps', 300, 200)                     #   neither exact: the lookup declines both
    make_pdf(new / 'OSX' / 'Sheet.pdf', 612, 792)               # a Letter production page
    (new / 'OSX' / 'Junk.pdf').write_bytes(b'not a pdf')        # a size nobody can read
    make_eps(new / 'OSX' / 'Shared.eps', 300, 200)

    P = {'CNX_ICE': pin('alias', 'updates-2e', 'OSX/Figure 14_03_ICE.eps')}
    d = resolve_detail('CNX_ICE', trees, prec, pins=P)
    check('㊵ an alias resolves to its exact file, space included, marked via alias',
          (Path(d['path']).name, d['edition'], d['via']),
          ('Figure 14_03_ICE.eps', 'updates-2e', 'alias'))
    check('㊵ CONTROL: without the pin the basename is a hole',
          resolve_detail('CNX_ICE', trees, prec), None)

    d = resolve_detail('CNX_ICE2', trees, prec,
                       pins={'CNX_ICE2': pin('alias', 'updates-2e', 'OSX/Figure 14_03_ICE.eps')})
    check('㊵ an alias is refused as pin-conflict once a file folds onto its basename, naming it',
          (d['refused'], [Path(c['path']).name for c in d['candidates']]),
          ('pin-conflict', ['CNX_ice2.eps']))
    check('㊵ CONTROL: that file is what the normal lookup finds',
          Path(resolve_detail('CNX_ICE2', trees, prec)['path']).name, 'CNX_ice2.eps')
    d = resolve_detail('CNX_Amb', trees, prec,
                       pins={'CNX_Amb': pin('alias', 'updates-2e', 'OSX/Figure 14_03_ICE.eps')})
    check('㊵ an AMBIGUOUS fold is a conflict too, though the normal lookup returns None for it',
          (d['refused'], sorted(Path(c['path']).name for c in d['candidates'])),
          ('pin-conflict', ['Cnx_Amb.eps', 'cnx-amb.eps']))
    check('㊵ CONTROL: the normal lookup does return None for the ambiguous fold',
          resolve_detail('CNX_Amb', trees, prec), None)

    O = {'CNX_Ibu': pin('override', 'first-edition', 'Ch_03/CNX_Ibu.eps')}
    d = resolve_detail('CNX_Ibu', trees, prec, pins=O)
    check('㊵ an override returns its exact file, over edition AND format precedence',
          (Path(d['path']).relative_to(old).as_posix(), d['edition'], d['via']),
          ('Ch_03/CNX_Ibu.eps', 'first-edition', 'override'))
    d = resolve_detail('CNX_Ibu', trees, prec)
    check('㊵ CONTROL: without the pin the normal lookup returns the updates-2e file',
          (Path(d['path']).name, d['edition']), ('CNX_Ibu.eps', 'updates-2e'))
    check('㊵ CONTROL: a tree-only rule would pick the .pdf, the other drawing',
          Path(resolve_detail('CNX_Ibu', {'first-edition': str(old)}, ['first-edition'])['path']).name,
          'CNX_Ibu.pdf')

    d = resolve_detail('CNX_Ibu', trees, prec,
                       pins={'CNX_Ibu': pin('override', 'first-edition', 'Ch_03/Nope.eps')})
    check('㊵ a missing pinned file is refused as pin-missing, never a fall-back',
          (d['path'], d['refused']), (None, 'pin-missing'))

    for label, entry in [
        ('not an object', 'OSX/Figure 14_03_ICE.eps'),
        ('an unknown kind', pin('alias2', 'updates-2e', 'OSX/Figure 14_03_ICE.eps')),
        ('an unconfigured edition', pin('alias', 'nowhere', 'OSX/Figure 14_03_ICE.eps')),
        ('a .. segment', pin('alias', 'updates-2e', '../escape.eps')),
        ('an absolute path', pin('alias', 'updates-2e', str(new / 'OSX' / 'Figure 14_03_ICE.eps'))),
        ('an empty file', pin('alias', 'updates-2e', '')),
        ('the tree root', pin('alias', 'updates-2e', '.')),
        ('our own output dir', pin('alias', 'updates-2e', 'Translated_IS/CNX_X.eps')),
        ('a format we cannot read', pin('alias', 'updates-2e', 'OSX/notes.txt')),
        ('no reason', {'kind': 'alias', 'edition': 'updates-2e', 'file': 'OSX/Figure 14_03_ICE.eps'}),
        ('a non-string file', pin('alias', 'updates-2e', 5)),
    ]:
        d = resolve_detail('CNX_ICE', trees, prec, pins={'CNX_ICE': entry})
        check(f'㊵ a pin with {label} is refused as pin-invalid', (d['path'], d['refused']),
              (None, 'pin-invalid'))

    TWINS = {'CNX_P1': pin('alias', 'updates-2e', 'OSX/Shared.eps'),
             'CNX_P2': pin('alias', 'updates-2e', 'OSX/./Shared.eps')}
    check('㊵ two pins naming one file are BOTH refused as pin-conflict',
          [resolve_detail(n, trees, prec, pins=TWINS)['refused'] for n in ('CNX_P1', 'CNX_P2')],
          ['pin-conflict', 'pin-conflict'])
    check('㊵ CONTROL: either pin alone resolves',
          Path(resolve_detail('CNX_P1', trees, prec, pins={'CNX_P1': TWINS['CNX_P1']})['path']).name,
          'Shared.eps')

    d = resolve_detail('CNX_ICE', trees, prec, pins={'CNX_ICE': pin('alias', 'updates-2e', 'OSX/Sheet.pdf')})
    check('㊵ a pinned Letter page is refused as a production page, with its size',
          (d['refused'], d['candidates'][0]['paper'], d['candidates'][0]['page']),
          ('production-page', 'Letter', [612.0, 792.0]))
    d = resolve_detail('CNX_ICE', trees, prec, pins={'CNX_ICE': pin('alias', 'updates-2e', 'OSX/Junk.pdf')})
    check('㊵ a pinned file whose size cannot be read resolves and is FLAGGED',
          (Path(d['path']).name, d.get('pageUnknown')), ('Junk.pdf', True))

    check('㊵ a pin cannot bring back a RETIRED figure',
          resolve_detail('CNX_ICE', trees, prec, pins=P, retired={'CNX_ICE': PIN_REASON})['refused'],
          'retired')
    check('㊵ a pin cannot bring back a SUPERSEDED figure',
          resolve_detail('CNX_ICE', trees, prec, pins=P, superseded={'CNX_ICE': PIN_REASON})['refused'],
          'superseded')
    check('㊵ pin keys fold like the lookup', resolve_detail('cnx-ice', trees, prec, pins=P)['via'], 'alias')

    absent = {'updates-2e': str(td / 'not-mounted'), 'first-edition': str(old)}
    try:
        resolve_detail('CNX_ICE', absent, prec, pins=P)
        raised = 'returned'
    except SystemExit as exc:
        raised = str(exc)
    check('㊵ a pin into a configured tree that is not mounted raises, as the lookup does',
          raised.startswith("Source tree 'updates-2e' is configured"), True)

    H = {'CNX_ICE': pin('alias', 'updates-2e', 'OSX/Figure 14_03_ICE.eps'),
         'CNX_ICE2': pin('alias', 'updates-2e', 'OSX/Shared.eps'),
         'CNX_Ibu': pin('override', 'first-edition', 'Ch_03/Nope.eps'),
         'CNX_Bad': pin('nope', 'updates-2e', 'OSX/Other.eps')}
    lines, missing, refused = human_report(['CNX_ICE', 'CNX_ICE2', 'CNX_Ibu', 'CNX_Bad'], trees, prec, pins=H)
    text = '\n'.join(lines)
    check('㊵ the human report prints a pinned hit with its kind',
          any(l.rstrip().endswith('Figure 14_03_ICE.eps  (pinned: alias)') for l in lines), True)
    check('㊵ the human report prints every new refusal kind, and counts them as refused',
          (all(f'REFUSED — {k}' in text for k in ('pin-conflict', 'pin-missing', 'pin-invalid')),
           missing, refused), (True, 0, 3))
    check('㊵ a candidate with no page size is printed as its path alone',
          any(l.rstrip().endswith('Nope.eps') for l in lines), True)

    local = td / 'sources.local.json'
    local.write_text(json.dumps({'testbook': trees}))
    out = []
    S.run_cli(['--json', 'testbook', 'CNX_ICE'], out=out.append,
              cfg={'editionPrecedence': prec, 'sourceTreesFile': str(local), 'artworkPins': P})
    check('㊵ run_cli --json applies artworkPins', json.loads(out[0])['CNX_ICE']['via'], 'alias')
```

- [ ] **Step 2: Run them and confirm they fail**

Run: `cd experiments/figure-text-translation && FIGTEXT_PYLIBS=./pylibs python3 -u test_sources.py; cd -`
Expected: `FAIL  ㊵ policy() takes its tables from the config`, then a traceback ending in `TypeError: resolve_detail() got an unexpected keyword argument 'pins'`.

- [ ] **Step 3: Implement the pins**

In `sources.py`:

(a) Change the import line `from pathlib import Path` to `from pathlib import Path, PurePosixPath`.

(b) Directly above `def resolve_detail(`, add:

```python
def _require_dir(key, root, basename):
    """A CONFIGURED tree that is not a directory refuses the whole resolve — see resolve_detail.
    SystemExit, not an exception: it is BaseException, so a per-figure `except Exception` in a
    batch loop cannot swallow it into a skip."""
    if not root.is_dir():
        raise SystemExit(
            f"Source tree {key!r} is configured for this book but is not a "
            f"directory: {root}\n"
            f"  Refusing to resolve {basename!r} — falling back to a lower-precedence "
            f"tree would silently source superseded artwork.\n"
            f"  Mount the tree, or remove {key!r} from sources.local.json if it is "
            f"genuinely gone."
        )


# §C140 ㊵ — ARTWORK PINS (spec D3–D5). A pin names ONE file: a configured tree key plus a path
# inside that tree. Never a stem, a pattern or a tree alone: the base tree holds two DIFFERENT
# ibuprofen drawings, and a tree-only rule returns the .pdf (18.114) because SOURCE_EXTS puts .pdf
# first, where [USER] approved the .eps (18.144, the published value).
_PIN_KINDS = ('alias', 'override')


def _pin_refusal(kind, reason, edition=None, candidates=None):
    return {'path': None, 'refused': kind, 'edition': edition,
            'candidates': candidates or [], 'reason': reason}


def _pin_invalid(entry, trees, exts):
    """-> why `entry` is malformed, or None. Fail closed per figure: a malformed pin is a typo,
    not a run-wide fault. ⚠️ Two rules are NOT here and live in tools/lib/figure-config-validate.js:
    a pinned stem must not end in the translated suffix (its owner is the JS constant, which this
    file must not restate), and a pinned file must not be another figure's artwork (that needs the
    CNXML corpus)."""
    if not isinstance(entry, dict):
        return f'the entry is a {type(entry).__name__}, not an object'
    for field in ('kind', 'edition', 'file', 'reason'):
        value = entry.get(field)
        if not isinstance(value, str) or not value.strip():
            return f'{field!r} must be a non-empty string, got {value!r}'
    if entry['kind'] not in _PIN_KINDS:
        return f"kind {entry['kind']!r} is not one of {', '.join(_PIN_KINDS)}"
    if not trees.get(entry['edition']):
        return f"edition {entry['edition']!r} is not configured for this book"
    file = entry['file']
    parts = PurePosixPath(file).parts
    if (file.startswith('/') or '\\' in file or re.match(r'[A-Za-z]:', file)
            or not parts or '..' in parts):
        return f'file {file!r} is not a relative path inside its tree'
    if _OWN_OUTPUT_DIRS.intersection(parts):
        return f'file {file!r} is inside our own translated output'
    if PurePosixPath(file).suffix.lower() not in exts:
        return f"file {file!r} is not one of the source formats {', '.join(exts)}"
    return None


def _files_under(basename, trees, precedence, exts, memo):
    """-> every delivery file, in any configured tree, named exactly as the basename or folding
    onto it — INCLUDING an ambiguous fold, which the normal lookup declines and reports as None,
    the same value as a hole. An alias is valid only while this is empty."""
    found = {}
    for key in precedence:
        root = trees.get(key)
        if not root:
            continue
        root = Path(root).expanduser()
        _require_dir(key, root, basename)
        for ext in exts:
            for p in root.rglob(basename + ext):
                if not _OWN_OUTPUT_DIRS.intersection(p.parts):
                    found[str(p)] = p
        for p in _norm_index(root, exts, memo).get(_normkey(basename), []):
            found[str(p)] = p
    return list(found.values())


def _resolve_pin(basename, entry, trees, precedence, exts, memo, size_of, pins):
    """-> a pinned hit, or a refusal. Never None, and never the normal lookup's answer."""
    bad = _pin_invalid(entry, trees, exts)
    if bad:
        return _pin_refusal('pin-invalid', f'artworkPins[{basename!r}] is malformed: {bad}')
    edition, file = entry['edition'], entry['file']
    root = Path(trees[edition]).expanduser()
    _require_dir(edition, root, basename)
    path = root / file
    target = PurePosixPath(file).as_posix()
    twins = sorted(k for k, e in pins.items()
                   if _normkey(k) != _normkey(basename) and isinstance(e, dict)
                   and e.get('edition') == edition and isinstance(e.get('file'), str)
                   and PurePosixPath(e['file']).as_posix() == target)
    if twins:
        return _pin_refusal('pin-conflict',
                            f"{edition}:{target} is also pinned for {', '.join(twins)} — "
                            f"one file cannot be the artwork of two figures",
                            edition, [{'path': str(path)}])
    if not path.is_file():
        return _pin_refusal('pin-missing',
                            f'the pinned file {edition}:{target} does not exist; a pin never '
                            f'falls back to the normal lookup', edition, [{'path': str(path)}])
    if entry['kind'] == 'alias':
        found = _files_under(basename, trees, precedence, exts, memo)
        if found:
            return _pin_refusal('pin-conflict',
                                f"the delivery now has a file under {basename!r} "
                                f"({', '.join(str(p) for p in found)}); the alias was for a "
                                f"hole — re-rule it", edition, [{'path': str(p)} for p in found])
    size = size_of(path)
    paper = paper_size_name(size)
    if paper:
        return {'path': None, 'refused': 'production-page', 'edition': edition,
                'candidates': [{'path': str(path), 'page': [size[0], size[1]], 'paper': paper}],
                'reason': f'the pinned file in {edition!r} is a {paper}-size page — a production '
                          f'sheet, not a figure'}
    hit = {'path': str(path), 'edition': edition, 'via': entry['kind']}
    if size is None:
        hit['pageUnknown'] = True
    return hit
```

(c) In `resolve_detail`:
- Change the signature's last line to `size_of=page_size, *, retired=None, pins=None):`.
- Add to its docstring, after the sentence about `retired` and `superseded`: `Then a pin, if the figure has one in `pins` (§C140 ㊵): its one exact file, or a refusal — never the normal lookup's answer. A pinned hit carries 'via': 'alias'|'override', and a pin refusal is 'pin-conflict'|'pin-missing'|'pin-invalid'.`
- Directly after the superseded block (the one ending `'candidates': [], 'reason': reason}`), insert:

```python
    # 🔴 §C140 ㊵ — AN ARTWORK PIN IS CHECKED AFTER `retired` AND `superseded`, so a pin can never
    # bring back a figure either table refuses.
    if pins:
        folded_pins = {_normkey(k): v for k, v in pins.items()}
        pin_key = _normkey(basename)
        if pin_key in folded_pins:
            return _resolve_pin(basename, folded_pins[pin_key], trees, precedence, exts,
                                {} if _memo is None else _memo, size_of, pins)

```

- Inside the edition loop, replace the inline `if not root.is_dir(): … raise SystemExit(…)` with `_require_dir(key, root, basename)`, and keep the comment above it.

(d) Add `pins` everywhere `retired` was added in Task 2: `resolve(..., *, retired=None, pins=None)`, which passes `pins=pins`; `resolve_report(..., *, retired=None, pins=None)`, whose call passes `retired=retired, pins=pins`; and `human_report(..., *, retired=None, pins=None)`, whose call to `resolve_report` passes `pins=pins`.

(e) In `human_report`, show a pinned hit's kind. Replace `lines.append(f"  {d['edition']:14} {n:36} {d['path']}")` with:

```python
            via = f"  (pinned: {d['via']})" if d.get('via') else ''
            lines.append(f"  {d['edition']:14} {n:36} {d['path']}{via}")
```

(f) In `policy`, add `'pins': cfg.get('artworkPins')` to the returned dict.

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `cd experiments/figure-text-translation && FIGTEXT_PYLIBS=./pylibs python3 -u test_sources.py | tail -3; cd -`
Expected: `ALL PASS`.

Run the other composer suites that call `sources.py` with keywords, to show the signature change is compatible:

Run: `cd experiments/figure-text-translation && for t in test_figure_prepare.py test_compose_runexact.py; do FIGTEXT_PYLIBS=./pylibs python3 -u $t > /tmp/claude-1000/c40-$t.log 2>&1; echo "$t exit=$? $(tail -1 /tmp/claude-1000/c40-$t.log)"; done; cd -`
Expected: each prints `exit=0 ALL PASS`. `test_compose_runexact.py` needs the STIX font cache in `~/.cache/namsbokasafn-figtext/`. If that suite fails for a font reason, run it on `main` too and compare the failing sets by name before blaming this change.

- [ ] **Step 5: Commit**

```bash
git add experiments/figure-text-translation/sources.py experiments/figure-text-translation/test_sources.py
git commit -m "feat(figures): §C140 ㊵ — artwork pins in sources.py: one exact file, alias or override, fail closed

An alias is refused as pin-conflict once any file matches its basename, including an
ambiguous fold the normal lookup reports as a hole; an override replaces the lookup;
a missing file is pin-missing, never a fall-back; a malformed entry is pin-invalid;
two pins naming one file conflict. Pins come after retired and superseded, pass the
paper-size check, and a hit carries via. The human report no longer assumes a
candidate has a page size.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: `figure-run.js` wording and the outcomes NOTE

**Files:**
- Modify: `tools/figure-run.js` (`refusalReason`; the `artworkRefusal` comment in the per-figure record)
- Modify: `tools/lib/figure-outcomes.js` (the `unresolved` NOTE)
- Modify: `tools/__tests__/figure-run-free.test.js`
- Modify: `tools/__tests__/figure-outcomes.test.js`

**Interfaces:**
- Consumes: the refusal kinds from Tasks 2 and 3.
- Produces: `refusalReason(refusal)` describes `retired`, `pin-conflict`, `pin-missing` and `pin-invalid`. Its fall-back now includes the reason, as `REFUSED, not missing: <kind> — <reason>`.

- [ ] **Step 1: Write the failing tests**

In `tools/__tests__/figure-run-free.test.js`, directly after the test `'describes a superseded refusal by its reason'`, add:

```js
  it.each([
    ['retired', /retired by ruling.*the ruling text/],
    ['pin-conflict', /artwork pin no longer holds.*the ruling text/],
    ['pin-missing', /pinned artwork file is not there.*the ruling text/],
    ['pin-invalid', /artwork pin is malformed.*the ruling text/],
  ])('describes a %s refusal by its reason (§C140 ㊵)', (refused, pattern) => {
    expect(refusalReason({ refused, reason: 'the ruling text' })).toMatch(pattern);
  });

  it('keeps the reason for a refusal kind it does not know (§C140 ㊵)', () => {
    expect(refusalReason({ refused: 'some-new-kind', reason: 'why it was refused' })).toBe(
      'REFUSED, not missing: some-new-kind — why it was refused'
    );
  });

  it('treats a pinned hit (with `via`) exactly like any other hit (§C140 ㊵)', async () => {
    const outcomes = async (extra) => {
      const spawn = fakeSpawn({
        resolve: (n) => ({ path: `/fake/artwork/${n}.pdf`, edition: 'first-edition', ...extra }),
      });
      const result = await runFigures(CH04, { spawn, ...PRISTINE });
      return result.figures.map((f) => [f.basename, f.outcome]);
    };
    const plain = await outcomes({});
    expect(plain.length).toBeGreaterThan(0);
    expect(await outcomes({ via: 'override' })).toEqual(plain);
  });
```

In `tools/__tests__/figure-outcomes.test.js`, directly after the test `'still REPORTS unresolved so the delivery hole stays visible'`, add:

```js
  it('names a retired figure and an artwork pin among the refusal causes (§C140 ㊵)', () => {
    const t = { ...emptyTally(), translated: 5, unresolved: 3 };
    expect(verdict(t, sum(t)).reasons.join(' ')).toMatch(
      /a retired figure, or an artwork pin that does not hold/
    );
  });
```

- [ ] **Step 2: Run them and confirm they fail**

Run: `npx vitest run tools/__tests__/figure-run-free.test.js tools/__tests__/figure-outcomes.test.js`
Expected: FAIL. The four `describes a … refusal` cases fail, the unknown-kind case receives `'REFUSED, not missing: some-new-kind'`, and the NOTE test fails. The `via` test already passes, because `figure-run.js` ignores keys it does not read; it is the guard that keeps that so.

- [ ] **Step 3: Change the wording**

In `tools/figure-run.js`, replace the end of `refusalReason`, from `if (refusal.refused === 'superseded') {` down to its closing brace, with:

```js
  if (refusal.refused === 'superseded') {
    return `REFUSED, not missing: known-superseded artwork — ${refusal.reason}`;
  }
  // §C140 ㊵ — the four kinds the retired record and the artwork pins add.
  if (refusal.refused === 'retired') {
    return `REFUSED, not missing: retired by ruling, so no translated copy is made again — ${refusal.reason}`;
  }
  if (refusal.refused === 'pin-conflict') {
    return `REFUSED, not missing: its artwork pin no longer holds — ${refusal.reason}`;
  }
  if (refusal.refused === 'pin-missing') {
    return `REFUSED, not missing: its pinned artwork file is not there, and a pin never falls back — ${refusal.reason}`;
  }
  if (refusal.refused === 'pin-invalid') {
    return `REFUSED, not missing: its artwork pin is malformed — ${refusal.reason}`;
  }
  // An unknown kind still carries its reason: the operator acts on the reason, not the label.
  return `REFUSED, not missing: ${refusal.refused}${refusal.reason ? ` — ${refusal.reason}` : ''}`;
}
```

In the same file, replace the comment above `artworkRefusal: null,`

```js
    // §C140 ⑦ — artwork `sources.py` found and REFUSED (a production page, or known-superseded),
    // with its reason. Like a contest it is `unresolved` but is not a hole.
```

with

```js
    // §C140 ⑦/㊵ — artwork `sources.py` found and REFUSED (a production page, known-superseded,
    // retired, or an artwork pin that does not hold), with its reason. Like a contest it is
    // `unresolved` but is not a hole.
```

In `tools/lib/figure-outcomes.js`, replace

```js
        `a hole here, or the run refused the artwork it found (two figures sharing one file, a ` +
        `production page, or a known-superseded picture); the report names which`
```

with

```js
        `a hole here, or the run refused the artwork it found (two figures sharing one file, a ` +
        `production page, a known-superseded picture, a retired figure, or an artwork pin that ` +
        `does not hold); the report names which`
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `npx vitest run tools/__tests__/figure-run-free.test.js tools/__tests__/figure-outcomes.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add tools/figure-run.js tools/lib/figure-outcomes.js tools/__tests__/figure-run-free.test.js tools/__tests__/figure-outcomes.test.js
git commit -m "feat(figures): §C140 ㊵ — figure-run names the retired and pin refusals by their reason

Wording only (spec D7): refusalReason describes retired, pin-conflict, pin-missing and
pin-invalid, and its fall-back for an unknown kind now keeps the reason. A test pins
that a pinned hit (with via) is treated exactly like any other hit.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: The mapping generator skips retired names

**Files:**
- Modify: `tools/generate-image-mapping.js`
- Modify: `tools/__tests__/generate-image-mapping.test.js`
- Create: `tools/__tests__/generate-image-mapping-retired.test.js`

**Interfaces:**
- Consumes: `loadRetiredFigures()` (Task 1).
- Produces:
  - `indexBookSourceBasenames(bookDir: string, chapter?: string|number): Set<string>`, the one walk of a book's source CNXML. The retire tool and the validator use it.
  - `buildMappingEntries(translatedFiles, basenameSet, suffix, { retired = new Set() } = {})` returns `{entries, unmatched, skippedRetired}`.
  - `generateImageMapping({book, chapter, suffix, dryRun, retired})`. When `retired` is undefined it calls `loadRetiredFigures()`. It returns `{entries, unmatched, skippedRetired, merged, mappingPath, written}`.

- [ ] **Step 1: Write the failing tests**

(a) In `tools/__tests__/generate-image-mapping.test.js`, add `import os from 'os';` to the imports and `indexBookSourceBasenames` to the names imported from `'../generate-image-mapping.js'`. Then append:

```js
// ─── indexBookSourceBasenames (§C140 ㊵) ──────────────────────────

describe('indexBookSourceBasenames', () => {
  it('collects every image basename the book source references, whole book or one chapter', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'genmap-index-'));
    const src = path.join(root, '01-source');
    fs.mkdirSync(path.join(src, 'ch01'), { recursive: true });
    fs.mkdirSync(path.join(src, 'ch02'), { recursive: true });
    fs.writeFileSync(path.join(src, 'ch01', 'm1.cnxml'), '<image src="../../media/CNX_One.jpg"/>');
    fs.writeFileSync(path.join(src, 'ch02', 'm2.cnxml'), '<image src="../../media/CNX_Two.png"/>');
    expect([...indexBookSourceBasenames(root)].sort()).toEqual(['CNX_One', 'CNX_Two']);
    expect([...indexBookSourceBasenames(root, 2)]).toEqual(['CNX_Two']);
  });

  it('is empty for a book with no source tree', () => {
    expect(indexBookSourceBasenames(fs.mkdtempSync(path.join(os.tmpdir(), 'genmap-none-'))).size).toBe(0);
  });
});

// ─── buildMappingEntries — retired figures (§C140 ㊵) ─────────────

describe('buildMappingEntries — retired figures', () => {
  const S = DEFAULT_SUFFIX;
  const set = new Set(['CNX_A', 'CNX_B']);
  const files = [`CNX_A${S}.svg`, `CNX_B${S}.svg`];

  it('never maps a retired figure, and names it as skipped rather than unmatched', () => {
    const r = buildMappingEntries(files, set, S, { retired: new Set(['CNX_A']) });
    expect(r.entries.map((e) => e.originalImage)).toEqual(['CNX_B']);
    expect(r.skippedRetired).toEqual([`CNX_A${S}.svg`]);
    expect(r.unmatched).toEqual([]);
  });

  it('CONTROL: without a retired set both are mapped', () => {
    expect(buildMappingEntries(files, set, S).entries.map((e) => e.originalImage)).toEqual([
      'CNX_A',
      'CNX_B',
    ]);
  });

  it('matches a retired name EXACTLY, not by a fold', () => {
    const r = buildMappingEntries(files, set, S, { retired: new Set(['cnx_a']) });
    expect(r.entries.map((e) => e.originalImage)).toEqual(['CNX_A', 'CNX_B']);
  });
});
```

(b) Create `tools/__tests__/generate-image-mapping-retired.test.js`:

```js
/**
 * §C140 ㊵ — the generator's FILE-READING half honours retiredFigures. The config reader is
 * mocked so the test can name a retired figure without editing the committed config; the
 * explicit-set and control cases show the mock is what decides.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

vi.mock('../lib/figure-text-config.js', () => ({ loadRetiredFigures: vi.fn(() => new Set()) }));

import { loadRetiredFigures } from '../lib/figure-text-config.js';
import {
  generateImageMapping,
  _setTestBooksDir,
  DEFAULT_SUFFIX,
} from '../generate-image-mapping.js';

const S = DEFAULT_SUFFIX;

/** A book where a row-only retire has happened: CNX_A's row is gone, its translated copy is not. */
function rowOnlyRetire() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'genmap-retired-'));
  const book = path.join(root, 'books', 'b');
  fs.mkdirSync(path.join(book, '01-source', 'ch01'), { recursive: true });
  fs.mkdirSync(path.join(book, 'media'), { recursive: true });
  fs.writeFileSync(
    path.join(book, '01-source', 'ch01', 'm1.cnxml'),
    '<document><figure id="f1"><media><image src="../../media/CNX_A.jpg"/></media></figure>' +
      '<figure id="f2"><media><image src="../../media/CNX_B.jpg"/></media></figure></document>'
  );
  for (const n of ['CNX_A', 'CNX_B']) fs.writeFileSync(path.join(book, 'media', `${n}${S}.svg`), '<svg/>');
  fs.writeFileSync(
    path.join(book, 'media', 'image-mapping.json'),
    JSON.stringify([{ originalImage: 'CNX_B', outputName: `CNX_B${S}.svg`, extension: '.svg' }], null, 2) +
      '\n'
  );
  _setTestBooksDir(path.join(root, 'books'));
  return book;
}

describe('generateImageMapping honours retiredFigures (§C140 ㊵)', () => {
  beforeEach(() => loadRetiredFigures.mockReset());

  it('reads the retired set from the figure config, and skips it', () => {
    rowOnlyRetire();
    loadRetiredFigures.mockReturnValue(new Set(['CNX_A']));
    const r = generateImageMapping({ book: 'b', dryRun: true });
    expect(loadRetiredFigures).toHaveBeenCalledTimes(1);
    expect(r.merged.map((e) => e.originalImage)).toEqual(['CNX_B']);
    expect(r.skippedRetired).toEqual([`CNX_A${S}.svg`]);
  });

  it('CONTROL: with nothing retired, the row a row-only retire removed comes back', () => {
    rowOnlyRetire();
    loadRetiredFigures.mockReturnValue(new Set());
    expect(generateImageMapping({ book: 'b', dryRun: true }).merged.map((e) => e.originalImage)).toEqual([
      'CNX_B',
      'CNX_A',
    ]);
  });

  it('an explicit retired set is used instead of the config', () => {
    rowOnlyRetire();
    const r = generateImageMapping({ book: 'b', dryRun: true, retired: new Set(['CNX_A']) });
    expect(loadRetiredFigures).not.toHaveBeenCalled();
    expect(r.skippedRetired).toEqual([`CNX_A${S}.svg`]);
  });

  it('a dry run writes nothing', () => {
    const book = rowOnlyRetire();
    const file = path.join(book, 'media', 'image-mapping.json');
    const before = fs.readFileSync(file);
    loadRetiredFigures.mockReturnValue(new Set());
    generateImageMapping({ book: 'b', dryRun: true });
    expect(fs.readFileSync(file)).toEqual(before);
  });
});
```

- [ ] **Step 2: Run them and confirm they fail**

Run: `npx vitest run tools/__tests__/generate-image-mapping.test.js tools/__tests__/generate-image-mapping-retired.test.js`
Expected: FAIL. `indexBookSourceBasenames` is not exported, `skippedRetired` is `undefined`, and the mocked `loadRetiredFigures` is never called.

- [ ] **Step 3: Implement**

In `tools/generate-image-mapping.js`:

(a) Add the import directly below the existing imports:

```js
import { loadRetiredFigures } from './lib/figure-text-config.js';
```

(b) Replace the header block's first paragraph (from ` * Generate (or update) a book's `media/image-mapping.json` from a directory of` to ` * figure that references its original image, and write the mapping.` in the Workflow list stays) so the block opens:

```js
/**
 * generate-image-mapping.js
 *
 * Generate or update a book's image mapping from a directory of translated figure files.
 * The mapping (`media/image-mapping.json`) is the producer side of the image-localization
 * mechanism that `cnxml-inject.js` consumes (`loadImageMapping` / `resolveTranslatedImage`):
 * during injection each `<figure id>` whose id appears in the mapping has its `<image src>`
 * (and mime-type) swapped for the translated variant, which `cnxml-render.js` then publishes
 * from the book-level `media/` dir.
 *
 * ⚠️ A figure listed in the figure config's `retiredFigures` (§C140 ㊵) is NEVER mapped: its
 * translated copy is named and skipped, so restoring the file cannot bring its row back.
 * Retire a figure with `tools/retire-translated-figure.js`, not by deleting its row: this tool
 * re-adds the row of any figure that is not in `retiredFigures` whose translated copy is still
 * in `media/`.
```

✏️ *Corrected 2026-10-01 at Task 10's review: the generator skips a figure in `retiredFigures`.*

Keep the rest of the header (`Workflow:`, `Usage:`, `Options:`) as it is. The tool inventory takes its description from the first header line that names no `.js` or `.json` file, which is now "Generate or update a book's image mapping…".

(c) Directly below `collectCnxml`, add:

```js
/**
 * Every image basename the book's source CNXML references, for the whole book or one chapter.
 * The ONE walk this generator, `tools/retire-translated-figure.js` and the figure-config
 * validator share.
 * @param {string} bookDir  `books/<slug>`
 * @param {string|number} [chapter]
 * @returns {Set<string>}
 */
export function indexBookSourceBasenames(bookDir, chapter) {
  const sourceRoot = path.join(bookDir, '01-source');
  const scanDir = chapter
    ? path.join(sourceRoot, `ch${String(chapter).padStart(2, '0')}`)
    : sourceRoot;
  const basenameSet = new Set();
  for (const file of collectCnxml(scanDir)) {
    for (const basename of indexSourceImageBasenames(fs.readFileSync(file, 'utf-8'))) {
      basenameSet.add(basename);
    }
  }
  return basenameSet;
}
```

Then in `generateImageMapping`, replace step 1 (from `const sourceRoot = …` to the end of its `for` loop) with `const basenameSet = indexBookSourceBasenames(bookDir, chapter);`.

(d) Replace `buildMappingEntries`:

```js
/**
 * Build image-mapping entries for a list of translated filenames.
 * Each entry is basename-keyed (`originalImage`) — no `figureId`, which keeps
 * these new-route entries out of the legacy figure-id loader by construction.
 * @param {string[]} translatedFiles  filenames present in media/ (already filtered to suffix)
 * @param {Set<string>} basenameSet  from indexSourceImageBasenames
 * @param {string} suffix
 * @param {{retired?: Set<string>}} [options]  §C140 ㊵: names never to map, matched EXACTLY
 * @returns {{entries: object[], unmatched: string[], skippedRetired: string[]}}
 */
export function buildMappingEntries(translatedFiles, basenameSet, suffix, { retired = new Set() } = {}) {
  const entries = [];
  const unmatched = [];
  const skippedRetired = [];
  for (const outputName of translatedFiles) {
    const original = deriveOriginalBasename(outputName, suffix);
    // §C140 ㊵ — a retired figure is never mapped again, even when its translated copy is
    // restored to media/: tools/retire-translated-figure.js removes the row, and this function
    // is the other writer of rows.
    if (original && retired.has(original)) {
      skippedRetired.push(outputName);
      continue;
    }
    if (!original || !basenameSet.has(original)) {
      unmatched.push(outputName);
      continue;
    }
    entries.push({
      originalImage: original,
      outputName,
      extension: path.extname(outputName),
    });
  }
  return { entries, unmatched, skippedRetired };
}
```

(e) In `generateImageMapping`, add `retired` to the destructured options (`dryRun = false, retired } = {}`), change step 3's first line to

```js
  const { entries, unmatched, skippedRetired } = buildMappingEntries(translatedFiles, basenameSet, suffix, {
    retired: retired ?? loadRetiredFigures(),
  });
```

and change its return to `return { entries, unmatched, skippedRetired, merged, mappingPath, written: !dryRun };`.

(f) In `main()`, destructure `skippedRetired` too, and directly after the `if (args.verbose) {…}` block add:

```js
  if (skippedRetired.length) {
    console.log(
      `\nSkipped ${skippedRetired.length} retired figure(s), never mapped again ` +
        `(retiredFigures in the figure config, §C140 ㊵):`
    );
    for (const f of skippedRetired) console.log(`  ${f}`);
  }
```

(g) In `printHelp`, append a line to the printed text:

```js
      `\n  A figure listed in the figure config's retiredFigures is skipped, never mapped (§C140 ㊵).\n`
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `npx vitest run tools/__tests__/generate-image-mapping.test.js tools/__tests__/generate-image-mapping-retired.test.js tools/__tests__/figure-run-free.test.js tools/__tests__/figure-run-paid.test.js`
Expected: PASS. The two `figure-run` suites call `buildMappingEntries` with three arguments and must be unaffected.

Run, as a whole-corpus control, the generator's dry run on chemistry. It must match today's mapping exactly:

Run: `node tools/generate-image-mapping.js --book efnafraedi-2e --dry-run | head -3`
Expected: `Matched 717 translated image(s) → 717 total entries in mapping.`, then `(dry-run) Would write …`, and no `Skipped` line, because the committed table is empty.

- [ ] **Step 5: Commit**

```bash
git add tools/generate-image-mapping.js tools/__tests__/generate-image-mapping.test.js tools/__tests__/generate-image-mapping-retired.test.js
git commit -m "feat(figures): §C140 ㊵ — the mapping generator never maps a retired figure

buildMappingEntries takes the retired set and names a skipped file rather than filing
it as unmatched; generateImageMapping reads retiredFigures from the figure config, so
restoring a retired figure's translated copy cannot bring its row back. The source walk
is now indexBookSourceBasenames, shared with the retire tool and the validator.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Where a translated copy lives, and what references it

**Files:**
- Create: `tools/lib/translated-figure-refs.js`
- Create: `tools/__tests__/helpers/git-fixture.js`
- Create: `tools/__tests__/translated-figure-refs.test.js`

**Interfaces:**
- Consumes: nothing project-specific. Callers pass the suffix (`DEFAULT_SUFFIX`).
- Produces (`tools/lib/translated-figure-refs.js`):
  - `SKIP_EXTENSIONS: Set<string>`, the raster, font and binary extensions the reference scan skips.
  - `isTranslatedName(fileName, suffix): boolean`, true for `<stem><suffix>.<ext>`.
  - `referenceNeedle(fileName): string`, the file's stem plus `'.'`.
  - `runGit(repoRoot, args): {status, stdout, stderr}`
  - `gitVisibleFiles(repoRoot, relDirs, git = runGit): string[]`, repo-relative paths.
  - `findReferences({repoRoot, bookRel, needles, suffix, git = runGit, readFile = fs.readFileSync}): Map<needle, string[]>`
  - `publishedCopies(repoRoot, bookRel, suffix): string[]`, sorted repo-relative paths.
  - `cleanTrackedSet(repoRoot, rels, git = runGit): Set<string>`, the subset tracked and unmodified against HEAD.
  - `locate(rel, bookRel): {area, track, chapter}`
  - `readMappingOrRefuse(mappingPath, {allowMissing = false} = {}): object[]`
  - `topLevelTranslatedCopies(bookDir, name, suffix): string[]`, sorted file names.
  - `writeAtomically(file, data): void`
  - `restoreFromHead(repoRoot, rels, git = runGit): void`, which throws on failure.
- Produces (`tools/__tests__/helpers/git-fixture.js`): `makeGitFixture(files, {ignore})` returns `{root, booksRoot, git, write, read, exists, snapshot}`.

- [ ] **Step 1: Write the fixture helper**

Create `tools/__tests__/helpers/git-fixture.js`:

```js
/**
 * A throwaway git repository holding a small `books/` tree, for the §C140 ㊵ tests.
 *
 * Identity and signing are set PER REPOSITORY, so the tests run on a CI box with no global git
 * config. `.gitignore` mirrors the repo's own backup and tmp patterns, because an ignored
 * `.backup.<ts>` file is exactly what the reference scan must not count.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFileSync } from 'child_process';

export function makeGitFixture(files, { ignore = ['*.backup.*', '*.tmp'] } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'c40-'));
  const git = (...args) =>
    execFileSync('git', ['-C', root, ...args], { stdio: ['ignore', 'pipe', 'pipe'] }).toString();
  git('init', '-q');
  git('config', 'user.email', 'fixture@example.invalid');
  git('config', 'user.name', 'fixture');
  git('config', 'commit.gpgsign', 'false');
  const write = (rel, content) => {
    const abs = path.join(root, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content);
  };
  write('.gitignore', ignore.join('\n') + '\n');
  for (const [rel, content] of Object.entries(files)) write(rel, content);
  git('add', '-A');
  git('commit', '-qm', 'fixture');
  const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf-8');
  const exists = (rel) => fs.existsSync(path.join(root, rel));
  /** {rel: content} for every file outside .git — to assert that a run wrote nothing. */
  const snapshot = () => {
    const out = {};
    const walk = (dir) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        if (e.name === '.git') continue;
        const abs = path.join(dir, e.name);
        if (e.isDirectory()) walk(abs);
        else out[path.relative(root, abs)] = fs.readFileSync(abs, 'latin1');
      }
    };
    walk(root);
    return out;
  };
  return { root, booksRoot: path.join(root, 'books'), git, write, read, exists, snapshot };
}
```

- [ ] **Step 2: Write the failing tests**

Create `tools/__tests__/translated-figure-refs.test.js`:

```js
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFileSync } from 'child_process';
import { DEFAULT_SUFFIX } from '../generate-image-mapping.js';
import {
  isTranslatedName,
  referenceNeedle,
  gitVisibleFiles,
  findReferences,
  publishedCopies,
  cleanTrackedSet,
  locate,
  readMappingOrRefuse,
  topLevelTranslatedCopies,
  writeAtomically,
  restoreFromHead,
} from '../lib/translated-figure-refs.js';
import { makeGitFixture } from './helpers/git-fixture.js';

const S = DEFAULT_SUFFIX;
const PUB = 'books/b/05-publication/mt-preview/chapters/01';

describe('names (§C140 ㊵)', () => {
  it('a translated name is <stem><suffix>.<ext>', () => {
    expect(isTranslatedName(`CNX_A${S}.svg`, S)).toBe(true);
    expect(isTranslatedName('CNX_A.jpg', S)).toBe(false);
    expect(isTranslatedName(`CNX_A${S}.svg.backup.2026`, S)).toBe(false);
    expect(isTranslatedName(`CNX_A${S}`, S)).toBe(false);
  });

  it("a reference needle is the file's stem plus a dot", () => {
    expect(referenceNeedle(`CNX_A${S}.svg`)).toBe(`CNX_A${S}.`);
  });
});

describe('findReferences — one corpus, one predicate (spec D13)', () => {
  const fx = () =>
    makeGitFixture({
      [`${PUB}/1-1-page.html`]: `<img src="/content/b/chapters/01/images/media/CNX_A${S}.svg">`,
      'books/b/03-translated/mt-preview/ch01/m1.cnxml': `<image src="../../media/CNX_T${S}.svg"/>`,
      [`${PUB}/images/media/CNX_D${S}.svg`]: `<svg><!-- mentions CNX_E${S}.svg --></svg>`,
      [`${PUB}/images/media/raster.jpg`]: `binary-ish CNX_F${S}.svg`,
      [`${PUB}/1-2-lookalike.html`]: `<img src="CNX_G2${S}.svg"><img src="CNX_G.jpg">`,
    });
  const needles = (...names) => new Set(names.map((n) => `${n}${S}.`));

  it('finds a reference in a page and in a CNXML file', () => {
    const f = fx();
    const hits = findReferences({ repoRoot: f.root, bookRel: 'books/b', needles: needles('CNX_A', 'CNX_T'), suffix: S });
    expect(hits.get(`CNX_A${S}.`)).toEqual([`${PUB}/1-1-page.html`]);
    expect(hits.get(`CNX_T${S}.`)).toEqual(['books/b/03-translated/mt-preview/ch01/m1.cnxml']);
  });

  it('counts an UNTRACKED, not-ignored page — a re-render not yet committed', () => {
    const f = fx();
    f.write(`${PUB}/1-9-new.html`, `<img src="CNX_U${S}.svg">`);
    const hits = findReferences({ repoRoot: f.root, bookRel: 'books/b', needles: needles('CNX_U'), suffix: S });
    expect(hits.get(`CNX_U${S}.`)).toEqual([`${PUB}/1-9-new.html`]);
  });

  it('ignores a gitignored .backup file, which names every figure inject ever saw', () => {
    const f = fx();
    f.write('books/b/03-translated/mt-preview/ch01/m1.cnxml.backup.2026-10-01', `CNX_B${S}.svg`);
    const hits = findReferences({ repoRoot: f.root, bookRel: 'books/b', needles: needles('CNX_B'), suffix: S });
    expect(hits.get(`CNX_B${S}.`)).toEqual([]);
  });

  it('does not scan translated copies or raster files', () => {
    const f = fx();
    const hits = findReferences({ repoRoot: f.root, bookRel: 'books/b', needles: needles('CNX_E', 'CNX_F'), suffix: S });
    expect(hits.get(`CNX_E${S}.`)).toEqual([]);
    expect(hits.get(`CNX_F${S}.`)).toEqual([]);
  });

  it('a look-alike name and the restored English image are not references', () => {
    const f = fx();
    const hits = findReferences({ repoRoot: f.root, bookRel: 'books/b', needles: needles('CNX_G', 'CNX_G2'), suffix: S });
    expect(hits.get(`CNX_G${S}.`)).toEqual([]);
    expect(hits.get(`CNX_G2${S}.`)).toEqual([`${PUB}/1-2-lookalike.html`]);
  });

  it('skips a tracked file deleted from the working tree instead of throwing', () => {
    const f = fx();
    fs.unlinkSync(path.join(f.root, `${PUB}/1-1-page.html`));
    const hits = findReferences({ repoRoot: f.root, bookRel: 'books/b', needles: needles('CNX_A'), suffix: S });
    expect(hits.get(`CNX_A${S}.`)).toEqual([]);
  });

  it('gitVisibleFiles throws outside a git repository rather than returning nothing', () => {
    const notRepo = fs.mkdtempSync(path.join(os.tmpdir(), 'c40-norepo-'));
    expect(() => gitVisibleFiles(notRepo, ['books'])).toThrow(/git ls-files failed/);
  });
});

describe('publishedCopies', () => {
  it('walks every track and chapter directory, appendices included', () => {
    const f = makeGitFixture({
      [`${PUB}/images/media/CNX_A${S}.svg`]: 'x',
      [`${PUB}/images/media/CNX_A.jpg`]: 'x',
      [`books/b/05-publication/faithful/chapters/appendices/images/media/CNX_Z${S}.svg`]: 'x',
      [`${PUB}/images/media/nested/CNX_N${S}.svg`]: 'x',
    });
    expect(publishedCopies(f.root, 'books/b', S)).toEqual([
      `books/b/05-publication/faithful/chapters/appendices/images/media/CNX_Z${S}.svg`,
      `${PUB}/images/media/CNX_A${S}.svg`,
    ]);
  });
});

describe('cleanTrackedSet — git is the backup a deletion relies on', () => {
  it('keeps only files tracked and unmodified against HEAD', () => {
    const f = makeGitFixture({ 'books/b/media/clean.svg': 'c', 'books/b/media/edited.svg': 'e', 'books/b/media/staged.svg': 's' });
    f.write('books/b/media/edited.svg', 'edited');
    f.write('books/b/media/staged.svg', 'staged');
    f.git('add', 'books/b/media/staged.svg');
    f.write('books/b/media/untracked.svg', 'u');
    f.write('books/b/media/ignored.tmp', 'i');
    const rels = ['clean', 'edited', 'staged', 'untracked'].map((n) => `books/b/media/${n}.svg`).concat('books/b/media/ignored.tmp');
    expect([...cleanTrackedSet(f.root, rels)]).toEqual(['books/b/media/clean.svg']);
  });

  it('is empty in a repository with no commits', () => {
    const f = makeGitFixture({ 'books/b/media/x.svg': 'x' });
    const fresh = fs.mkdtempSync(path.join(os.tmpdir(), 'c40-fresh-'));
    execFileSync('git', ['-C', fresh, 'init', '-q']);
    fs.mkdirSync(path.join(fresh, 'books'), { recursive: true });
    fs.writeFileSync(path.join(fresh, 'books', 'x.svg'), 'x');
    expect(cleanTrackedSet(fresh, ['books/x.svg']).size).toBe(0);
    expect(cleanTrackedSet(f.root, ['books/b/media/x.svg']).size).toBe(1);
  });
});

describe('locate', () => {
  it('names the area, track and chapter of a corpus path', () => {
    expect(locate(`${PUB}/1-1-page.html`, 'books/b')).toEqual({ area: '05-publication', track: 'mt-preview', chapter: '01' });
    expect(locate('books/b/03-translated/mt-preview/ch11/m1.cnxml', 'books/b')).toEqual({ area: '03-translated', track: 'mt-preview', chapter: 'ch11' });
  });
});

describe('readMappingOrRefuse', () => {
  const tmpFile = (content) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'c40-map-'));
    const file = path.join(dir, 'image-mapping.json');
    if (content !== undefined) fs.writeFileSync(file, content);
    return file;
  };
  it('reads an array of objects', () => {
    expect(readMappingOrRefuse(tmpFile('[{"a":1}]'))).toEqual([{ a: 1 }]);
  });
  it('refuses invalid JSON, a non-array and an array holding a non-object', () => {
    expect(() => readMappingOrRefuse(tmpFile('{not json'))).toThrow(/not valid JSON/);
    expect(() => readMappingOrRefuse(tmpFile('{}'))).toThrow(/not an array of objects/);
    expect(() => readMappingOrRefuse(tmpFile('[1]'))).toThrow(/not an array of objects/);
  });
  it('treats a missing file as empty only when told it may', () => {
    expect(readMappingOrRefuse(tmpFile(undefined), { allowMissing: true })).toEqual([]);
    expect(() => readMappingOrRefuse(tmpFile(undefined))).toThrow(/cannot be read/);
  });
});

describe('topLevelTranslatedCopies', () => {
  it('finds <name><suffix>.<ext> at the top of media/, and nothing else', () => {
    const f = makeGitFixture({
      [`books/b/media/CNX_A${S}.svg`]: 'x',
      [`books/b/media/CNX_A${S}.png`]: 'x',
      [`books/b/media/CNX_A2${S}.svg`]: 'x',
      [`books/b/media/CNX_A${S}.svg.backup.1`]: 'x',
      [`books/b/media/sub/CNX_A${S}.svg`]: 'x',
    });
    expect(topLevelTranslatedCopies(path.join(f.root, 'books/b'), 'CNX_A', S)).toEqual([`CNX_A${S}.png`, `CNX_A${S}.svg`]);
  });
});

describe('writeAtomically and restoreFromHead', () => {
  it('writes through a temp file in the same directory and leaves none behind', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'c40-atomic-'));
    const file = path.join(dir, 'image-mapping.json');
    writeAtomically(file, '[]\n');
    expect(fs.readFileSync(file, 'utf-8')).toBe('[]\n');
    expect(fs.readdirSync(dir)).toEqual(['image-mapping.json']);
  });
  it('restores deleted tracked files from HEAD', () => {
    const f = makeGitFixture({ 'books/b/media/x.svg': 'committed' });
    fs.unlinkSync(path.join(f.root, 'books/b/media/x.svg'));
    restoreFromHead(f.root, ['books/b/media/x.svg']);
    expect(f.read('books/b/media/x.svg')).toBe('committed');
  });
});
```

- [ ] **Step 3: Run them and confirm they fail**

Run: `npx vitest run tools/__tests__/translated-figure-refs.test.js`
Expected: FAIL. `../lib/translated-figure-refs.js` cannot be resolved.

- [ ] **Step 4: Write the module**

Create `tools/lib/translated-figure-refs.js`:

```js
/**
 * Where a figure's translated copy lives, and what still references it (§C140 ㊵, spec D13).
 *
 * ONE corpus and ONE predicate, shared by tools/retire-translated-figure.js (its report and
 * --prune) and the figure-config validator:
 *
 * - THE CORPUS is the WORKING-TREE content of every file git does not ignore under a book's
 *   03-translated/ and 05-publication/ (`git ls-files -co --exclude-standard`). Not a disk walk:
 *   inject leaves gitignored `<module>.cnxml.backup.<ts>` files naming every figure it ever saw,
 *   and they would keep every copy alive (measured: 0 of 754 deletable). Not HEAD: HEAD cannot
 *   see a re-render's uncommitted pages.
 * - Raster, font and other binary files are skipped, and so are THE TRANSLATED COPIES THEMSELVES.
 *   A composed SVG embeds its fonts and rasters and references no other file (measured 2026-10-01:
 *   0 external href/src/url references in 1,471 translated SVGs), and the copies are 821 MB of the
 *   879 MB corpus. Without them a scan takes about 0.4 s. If the composer ever writes an external
 *   reference into a figure, this exclusion must be revisited.
 * - A REFERENCE to a translated file is its stem plus a dot — `<name><suffix>.` — anywhere in a
 *   corpus file. Keyed on the suffix, so the restored English `<name>.jpg` and look-alike names
 *   (`molecreso2`) are never references.
 */
import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';

/** Extensions the reference scan skips: raster, font and archive bytes cannot make a browser fetch a figure. */
export const SKIP_EXTENSIONS = new Set([
  '.jpg', '.jpeg', '.png', '.gif', '.webp', '.ico', '.bmp', '.tif', '.tiff',
  '.woff', '.woff2', '.ttf', '.otf', '.eot', '.pdf', '.zip',
]);

/** True for a translated file name: `<stem><suffix>.<ext>`, the suffix ending the stem. */
export function isTranslatedName(fileName, suffix) {
  const ext = path.extname(fileName);
  return ext !== '' && fileName.slice(0, -ext.length).endsWith(suffix);
}

/** The string whose presence in a corpus file is a reference to `fileName`: its stem plus '.'. */
export function referenceNeedle(fileName) {
  return fileName.slice(0, -path.extname(fileName).length) + '.';
}

/** Run git at `repoRoot`. Injected in tests. @returns {{status:number, stdout:string, stderr:string}} */
export function runGit(repoRoot, args) {
  const r = spawnSync('git', ['-C', repoRoot, ...args], { encoding: 'utf-8', maxBuffer: 1 << 28 });
  return { status: r.status ?? 1, stdout: r.stdout ?? '', stderr: r.stderr ?? String(r.error ?? '') };
}

/**
 * Repo-relative paths of every file git does not ignore under `relDirs`, tracked or not.
 * `--literal-pathspecs`: a figure name containing `*` or `[` is a name, not a pattern.
 * @throws {Error} when git fails — an unreadable corpus must never read as an empty one
 */
export function gitVisibleFiles(repoRoot, relDirs, git = runGit) {
  const r = git(repoRoot, ['--literal-pathspecs', 'ls-files', '-co', '--exclude-standard', '-z', '--', ...relDirs]);
  if (r.status !== 0) throw new Error(`git ls-files failed in ${repoRoot}: ${r.stderr.trim()}`);
  return [...new Set(r.stdout.split('\0').filter(Boolean))];
}

/**
 * @param {{repoRoot:string, bookRel:string, needles:Set<string>, suffix:string, git?:Function, readFile?:Function}} o
 * @returns {Map<string, string[]>} each needle → the corpus files containing it (repo-relative)
 */
export function findReferences({ repoRoot, bookRel, needles, suffix, git = runGit, readFile = fs.readFileSync }) {
  const hits = new Map([...needles].map((n) => [n, []]));
  const list = [...needles];
  if (list.length === 0) return hits;
  const maxLen = Math.max(...list.map((n) => n.length));
  const marker = `${suffix}.`;
  const files = gitVisibleFiles(repoRoot, [`${bookRel}/03-translated`, `${bookRel}/05-publication`], git);
  for (const rel of files) {
    const base = path.basename(rel);
    if (SKIP_EXTENSIONS.has(path.extname(base).toLowerCase())) continue;
    if (isTranslatedName(base, suffix)) continue;
    let text;
    try {
      text = readFile(path.join(repoRoot, rel), 'utf-8');
    } catch (err) {
      if (err.code === 'ENOENT') continue; // tracked, deleted from the working tree
      throw err;
    }
    // Every needle ends with the marker, so only the text just before each marker can match.
    const found = new Set();
    for (let i = text.indexOf(marker); i !== -1; i = text.indexOf(marker, i + 1)) {
      const end = i + marker.length;
      const window = text.slice(Math.max(0, end - maxLen), end);
      for (const n of list) if (window.endsWith(n)) found.add(n);
    }
    for (const n of found) hits.get(n).push(rel);
  }
  return hits;
}

const isDir = (p) => fs.existsSync(p) && fs.statSync(p).isDirectory();

/**
 * Every published copy: a translated file directly under
 * `<book>/05-publication/<track>/chapters/<dir>/images/media/`. Found by WALKING — a chapter dir is
 * `NN` or `appendices` there, never `chNN`, and building that path is a known trap.
 * @returns {string[]} sorted repo-relative paths
 */
export function publishedCopies(repoRoot, bookRel, suffix) {
  const pub = path.join(repoRoot, bookRel, '05-publication');
  const out = [];
  if (!isDir(pub)) return out;
  for (const track of fs.readdirSync(pub)) {
    const chapters = path.join(pub, track, 'chapters');
    if (!isDir(chapters)) continue;
    for (const chapter of fs.readdirSync(chapters)) {
      const media = path.join(chapters, chapter, 'images', 'media');
      if (!isDir(media)) continue;
      for (const e of fs.readdirSync(media, { withFileTypes: true })) {
        if (e.isFile() && isTranslatedName(e.name, suffix)) {
          out.push(path.join(bookRel, '05-publication', track, 'chapters', chapter, 'images', 'media', e.name));
        }
      }
    }
  }
  return out.sort();
}

/**
 * The subset of `rels` that git tracks and that is unmodified against HEAD — staged or not.
 * Any other git outcome (untracked, ignored, modified, no commits, git missing) leaves a path out:
 * git is the backup a deletion relies on, so nothing git cannot restore is deleted.
 * @returns {Set<string>}
 */
export function cleanTrackedSet(repoRoot, rels, git = runGit) {
  if (rels.length === 0) return new Set();
  const tracked = git(repoRoot, ['--literal-pathspecs', 'ls-files', '-z', '--', ...rels]);
  const dirty = git(repoRoot, ['--literal-pathspecs', 'diff', '--name-only', '-z', 'HEAD', '--', ...rels]);
  if (tracked.status !== 0 || dirty.status !== 0) return new Set();
  const t = new Set(tracked.stdout.split('\0').filter(Boolean));
  const d = new Set(dirty.stdout.split('\0').filter(Boolean));
  return new Set(rels.filter((r) => t.has(r) && !d.has(r)));
}

/** @returns {{area:string, track:string|null, chapter:string|null}} for a corpus path */
export function locate(rel, bookRel) {
  const parts = path.relative(bookRel, rel).split(path.sep);
  if (parts[0] === '05-publication') {
    return { area: parts[0], track: parts[1] ?? null, chapter: parts[2] === 'chapters' ? (parts[3] ?? null) : null };
  }
  if (parts[0] === '03-translated') {
    return { area: parts[0], track: parts[1] ?? null, chapter: parts.length > 3 ? parts[2] : null };
  }
  return { area: parts[0], track: null, chapter: null };
}

/**
 * The mapping rows, or a refusal. ⚠️ Never `loadImageBasenameMap`: it reads an unreadable file as
 * `[]`, which is right for a renderer and wrong for anything that rewrites the file.
 * @throws {Error} when the file is unreadable, invalid JSON, or not an array of objects
 */
export function readMappingOrRefuse(mappingPath, { allowMissing = false } = {}) {
  let raw;
  try {
    raw = fs.readFileSync(mappingPath, 'utf-8');
  } catch (err) {
    if (err.code === 'ENOENT' && allowMissing) return [];
    throw new Error(`${mappingPath} cannot be read (${err.code || err.message}); refusing to act on a mapping I cannot see`);
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(`${mappingPath} is not valid JSON (${err.message}); refusing to rewrite it — repair it first`);
  }
  if (!Array.isArray(parsed) || parsed.some((r) => r === null || typeof r !== 'object' || Array.isArray(r))) {
    throw new Error(`${mappingPath} is not an array of objects; refusing to rewrite it — repair it first`);
  }
  return parsed;
}

/** File names `<name><suffix>.<ext>` at the TOP of `<bookDir>/media/` (one extension, no subfolders). */
export function topLevelTranslatedCopies(bookDir, name, suffix) {
  const mediaDir = path.join(bookDir, 'media');
  if (!isDir(mediaDir)) return [];
  const prefix = `${name}${suffix}.`;
  return fs
    .readdirSync(mediaDir, { withFileTypes: true })
    .filter((e) => e.isFile() && e.name.startsWith(prefix) && !e.name.slice(prefix.length).includes('.'))
    .map((e) => e.name)
    .sort();
}

/** Write through a temp file in the same directory (`*.tmp` is gitignored) and rename over the target. */
export function writeAtomically(file, data) {
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, data);
  fs.renameSync(tmp, file);
}

/** Restore tracked files from HEAD. @throws {Error} when git cannot */
export function restoreFromHead(repoRoot, rels, git = runGit) {
  if (rels.length === 0) return;
  const r = git(repoRoot, ['--literal-pathspecs', 'restore', '--source=HEAD', '--worktree', '--', ...rels]);
  if (r.status !== 0) throw new Error(`git restore failed: ${r.stderr.trim()}`);
}
```

- [ ] **Step 5: Run the tests and confirm they pass**

Run: `npx vitest run tools/__tests__/translated-figure-refs.test.js`
Expected: PASS.

Run the predicate once over real chemistry, read-only, as a positive control. The 754 published copies must find references:

Run: `node --input-type=module -e "import { findReferences, publishedCopies, referenceNeedle } from './tools/lib/translated-figure-refs.js'; import { DEFAULT_SUFFIX } from './tools/generate-image-mapping.js'; import path from 'path'; const c = publishedCopies('.', 'books/efnafraedi-2e', DEFAULT_SUFFIX); const t0 = Date.now(); const h = findReferences({ repoRoot: '.', bookRel: 'books/efnafraedi-2e', needles: new Set(c.map((r) => referenceNeedle(path.basename(r)))), suffix: DEFAULT_SUFFIX }); console.log(c.length, 'copies;', [...h.values()].filter((v) => v.length).length, 'referenced;', Date.now() - t0, 'ms')"`
Expected: `754 copies; 745 referenced; <a few hundred> ms`. The 9 unreferenced copies are the June leftovers.

- [ ] **Step 6: Commit**

```bash
git add tools/lib/translated-figure-refs.js tools/__tests__/translated-figure-refs.test.js tools/__tests__/helpers/git-fixture.js
git commit -m "feat(figures): §C140 ㊵ — one corpus and one reference predicate for translated copies

The corpus is every git-visible file under 03-translated/ and 05-publication/ in the
working tree (not a disk walk, whose ignored .backup files name every figure; not HEAD,
which cannot see a re-render), skipping raster files and the translated copies
themselves (0 external references in 1,471 SVGs; 821 of 879 MB). A reference is the
copy's stem plus a dot. Also the git-backed safety helpers: clean-tracked set, atomic
write, restore from HEAD.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: The figure-config validator

**Files:**
- Create: `tools/lib/figure-config-validate.js`
- Create: `tools/__tests__/figure-config-validate.test.js`

**Interfaces:**
- Consumes: `normkey` (Task 1), `indexBookSourceBasenames` and `DEFAULT_SUFFIX` (Task 5), and `readMappingOrRefuse`, `topLevelTranslatedCopies` and `isTranslatedName` (Task 6).
- Produces:
  - `validateFigureConfig(cfg, corpus): string[]`, the problems found. Empty means valid. It is pure.
  - `buildValidatorCorpus(repoRoot, cfg): {suffix, basenamesByBook: Object<string, Set<string>>, retiredState: Object<string, {rows:number, translatedCopies:string[]}>}`. It does IO and uses no git.

- [ ] **Step 1: Write the failing tests**

Create `tools/__tests__/figure-config-validate.test.js`:

```js
import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { validateFigureConfig, buildValidatorCorpus } from '../lib/figure-config-validate.js';
import { loadFigureTextConfig } from '../lib/figure-text-config.js';
import { readMappingOrRefuse, isTranslatedName } from '../lib/translated-figure-refs.js';
import { DEFAULT_SUFFIX } from '../generate-image-mapping.js';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const R = 'a reason that says what was ruled and why, long enough (test)';
const S = DEFAULT_SUFFIX;

const baseCfg = () => ({
  editionPrecedence: ['updates-2e', 'first-edition'],
  supersededArtwork: { CNX_Sup: R },
  retiredFigures: { CNX_Ret: R },
  artworkPins: {
    CNX_Pin: { kind: 'alias', edition: 'updates-2e', file: 'OSX/Figure 14_03_Pin.eps', reason: R },
  },
});
const baseCorpus = () => ({
  suffix: S,
  basenamesByBook: {
    chem: new Set(['CNX_Sup', 'CNX_Ret', 'CNX_Pin', 'CNX_Other']),
    bio: new Set(['Figure_1']),
  },
  retiredState: { CNX_Ret: { rows: 0, translatedCopies: [] } },
});
const pinOf = (c) => c.artworkPins.CNX_Pin;

describe('validateFigureConfig (§C140 ㊵, spec D11)', () => {
  it('a valid config passes — the baseline every failing case below differs from by one change', () => {
    expect(validateFigureConfig(baseCfg(), baseCorpus())).toEqual([]);
  });

  it('CONTROL: a pin whose file is named like its OWN figure passes', () => {
    const c = baseCfg();
    pinOf(c).file = 'OSX/CNX_Pin.eps';
    expect(validateFigureConfig(c, baseCorpus())).toEqual([]);
  });

  it.each([
    ['a table that is not an object', (c) => { c.retiredFigures = []; }, null, /retiredFigures must be an object/],
    ['two keys in one table that fold together', (c) => { c.supersededArtwork['CNX-Sup'] = R; }, null, /fold to the same key/],
    ['a pin on a superseded figure', (c) => { c.artworkPins = { CNX_Sup: pinOf(c) }; }, null, /also in supersededArtwork/],
    ['a pin on a retired figure', (c) => { c.artworkPins = { CNX_Ret: pinOf(c) }; }, null, /also in retiredFigures/],
    ['a key that is no book’s image', (c) => { c.supersededArtwork.CNX_Typo = R; }, null, /in 0 books/],
    ['a key two books share', () => {}, (k) => { k.basenamesByBook.bio.add('CNX_Sup'); }, /in 2 books/],
    ['a key that differs from the image only by case', (c) => { c.supersededArtwork = { cnx_sup: R }; }, null, /in 0 books/],
    ['a short reason', (c) => { c.supersededArtwork.CNX_Sup = 'see §C140 ㊵'; }, null, /over 40 characters/],
    ['a pin without a reason', (c) => { delete pinOf(c).reason; }, null, /artworkPins\.CNX_Pin needs a reason/],
    ['an unknown pin kind', (c) => { pinOf(c).kind = 'redirect'; }, null, /kind must be alias or override/],
    ['a pin edition not in editionPrecedence', (c) => { pinOf(c).edition = 'third'; }, null, /not in editionPrecedence/],
    ['a pin path with a .. segment', (c) => { pinOf(c).file = '../x.eps'; }, null, /relative path inside its tree/],
    ['an absolute pin path', (c) => { pinOf(c).file = '/abs/x.eps'; }, null, /relative path inside its tree/],
    ['a pin to our own translated file', (c) => { pinOf(c).file = `session/CNX_Pin${S}.pdf`; }, null, /our own translated files/],
    ['a pin to another figure’s artwork', (c) => { pinOf(c).file = 'OSX/CNX_Other.eps'; }, null, /artwork of another figure, CNX_Other/],
    ['two pins naming one file', (c) => { c.artworkPins.CNX_Other = { ...pinOf(c) }; }, null, /name the same file/],
    ['a retired figure that still has its row', () => {}, (k) => { k.retiredState.CNX_Ret.rows = 1; }, /still has 1 image-mapping row/],
    ['a retired figure that still has its translated copy', () => {}, (k) => { k.retiredState.CNX_Ret.translatedCopies = [`CNX_Ret${S}.svg`]; }, /still has a translated copy/],
  ])('refuses %s', (_label, mutateCfg, mutateCorpus, pattern) => {
    const c = baseCfg();
    const k = baseCorpus();
    mutateCfg(c);
    if (mutateCorpus) mutateCorpus(k);
    expect(validateFigureConfig(c, k).join('\n')).toMatch(pattern);
  });
});

describe('the committed figure config (§C140 ㊵)', () => {
  let cfg;
  let corpus;
  beforeAll(() => {
    cfg = loadFigureTextConfig();
    corpus = buildValidatorCorpus(REPO_ROOT, cfg);
  }, 180_000);

  it('passes every rule', () => {
    expect(validateFigureConfig(cfg, corpus)).toEqual([]);
  });

  it('NON-VACUITY: the corpus holds chemistry, and the superseded entries are real', () => {
    expect(corpus.basenamesByBook['efnafraedi-2e'].size).toBeGreaterThan(1000);
    expect(Object.keys(cfg.supersededArtwork).length).toBeGreaterThan(0);
  });

  it("chemistry's mapping rows and its top-level translated copies match one-to-one", () => {
    const bookDir = path.join(REPO_ROOT, 'books', 'efnafraedi-2e');
    const rows = readMappingOrRefuse(path.join(bookDir, 'media', 'image-mapping.json'));
    const files = fs
      .readdirSync(path.join(bookDir, 'media'), { withFileTypes: true })
      .filter((e) => e.isFile() && isTranslatedName(e.name, S))
      .map((e) => e.name)
      .sort();
    expect(rows.length).toBeGreaterThan(600);
    expect(rows.map((r) => r.outputName).sort()).toEqual(files);
  });
});
```

- [ ] **Step 2: Run them and confirm they fail**

Run: `npx vitest run tools/__tests__/figure-config-validate.test.js`
Expected: FAIL. `../lib/figure-config-validate.js` cannot be resolved.

- [ ] **Step 3: Write the validator**

Create `tools/lib/figure-config-validate.js`:

```js
/**
 * The figure config's three tables, checked against the repo (§C140 ㊵, spec D11).
 *
 * Run by `npm test` (tools/__tests__/figure-config-validate.test.js), and run LOCALLY before any
 * pin's buy: CI only sees a pin after the money is spent, because a pin lands in the commit that
 * runs its buy (spec D1). The Python resolver fails closed per figure at run time; these are the
 * rules it cannot check, plus the cross-table ones.
 *
 * ⚠️ A RETIRED FIGURE'S PUBLISHED COPIES AND REFERENCES ARE NOT CHECKED HERE, ON PURPOSE: they
 * legitimately remain until ②'s whole-book re-render (spec D14). After `--prune`, re-running the
 * retire tool as a dry run is the census: it reports what still references each figure.
 */
import fs from 'fs';
import path from 'path';
import { normkey } from './figure-text-config.js';
import { DEFAULT_SUFFIX, indexBookSourceBasenames } from '../generate-image-mapping.js';
import { readMappingOrRefuse, topLevelTranslatedCopies } from './translated-figure-refs.js';

const TABLES = ['supersededArtwork', 'retiredFigures', 'artworkPins'];
const PIN_KINDS = new Set(['alias', 'override']);
const MIN_REASON = 40;

const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/**
 * @param {object} cfg  the parsed figure config
 * @param {{suffix:string, basenamesByBook:Object<string,Set<string>>,
 *          retiredState:Object<string,{rows:number, translatedCopies:string[]}>}} corpus
 * @returns {string[]} problems; empty when the config is valid
 */
export function validateFigureConfig(cfg, corpus) {
  const problems = [];
  const tables = {};
  for (const name of TABLES) {
    const t = cfg[name] ?? {};
    if (!isPlainObject(t)) problems.push(`${name} must be an object`);
    tables[name] = t;
  }
  if (problems.length) return problems;

  // No two keys within one table fold together: the resolver would keep only one of them.
  for (const name of TABLES) {
    const seen = new Map();
    for (const k of Object.keys(tables[name])) {
      const f = normkey(k);
      if (seen.has(f)) problems.push(`${name}: ${seen.get(f)} and ${k} fold to the same key`);
      else seen.set(f, k);
    }
  }

  // A pin shares no key with the other two tables: either would refuse the figure first.
  const foldedKeys = (t) => new Map(Object.keys(t).map((k) => [normkey(k), k]));
  for (const other of ['supersededArtwork', 'retiredFigures']) {
    const keys = foldedKeys(tables[other]);
    for (const k of Object.keys(tables.artworkPins)) {
      if (keys.has(normkey(k))) {
        problems.push(`artworkPins.${k} is also in ${other} (${keys.get(normkey(k))}) — that pin can never apply`);
      }
    }
  }

  // Every key is EXACTLY the basename of an image in exactly one book's source.
  const books = Object.entries(corpus.basenamesByBook);
  for (const name of TABLES) {
    for (const k of Object.keys(tables[name])) {
      const owners = books.filter(([, set]) => set.has(k)).map(([b]) => b);
      if (owners.length !== 1) {
        problems.push(`${name}.${k} names an image in ${owners.length} books' source (${owners.join(', ') || 'none'}); it must be exactly one`);
      }
    }
  }

  // Every entry carries a substantive reason.
  const reasonOf = (name, v) => (name === 'artworkPins' ? (isPlainObject(v) ? v.reason : undefined) : v);
  for (const name of TABLES) {
    for (const [k, v] of Object.entries(tables[name])) {
      const r = reasonOf(name, v);
      if (typeof r !== 'string' || r.trim().length <= MIN_REASON) {
        problems.push(`${name}.${k} needs a reason of over ${MIN_REASON} characters`);
      }
    }
  }

  // Each pin names one valid file, no other pin names it, and it is no other figure's artwork.
  const allBasenames = new Map();
  for (const [, set] of books) for (const b of set) allBasenames.set(normkey(b), b);
  const targets = new Map();
  for (const [k, pin] of Object.entries(tables.artworkPins)) {
    if (!isPlainObject(pin)) {
      problems.push(`artworkPins.${k} must be an object`);
      continue;
    }
    if (!PIN_KINDS.has(pin.kind)) problems.push(`artworkPins.${k}.kind must be alias or override, got ${JSON.stringify(pin.kind)}`);
    if (!(cfg.editionPrecedence || []).includes(pin.edition)) {
      problems.push(`artworkPins.${k}.edition ${JSON.stringify(pin.edition)} is not in editionPrecedence`);
    }
    const file = pin.file;
    if (typeof file !== 'string' || !file.trim()) {
      problems.push(`artworkPins.${k}.file must be a non-empty string`);
      continue;
    }
    if (file.startsWith('/') || /^[A-Za-z]:/.test(file) || file.includes('\\') || file === '.' || file.split('/').includes('..')) {
      problems.push(`artworkPins.${k}.file ${JSON.stringify(file)} must be a relative path inside its tree`);
    }
    const ext = path.posix.extname(file);
    const stem = path.posix.basename(file, ext);
    if (stem.toLowerCase().endsWith(corpus.suffix.toLowerCase())) {
      problems.push(`artworkPins.${k}.file ${JSON.stringify(file)} is one of our own translated files (its stem ends in the translated suffix)`);
    }
    const owner = allBasenames.get(normkey(stem));
    if (owner !== undefined && normkey(owner) !== normkey(k)) {
      problems.push(`artworkPins.${k}.file ${JSON.stringify(file)} is the artwork of another figure, ${owner}`);
    }
    const target = `${pin.edition}:${path.posix.normalize(file)}`;
    if (targets.has(target)) problems.push(`artworkPins.${k} and artworkPins.${targets.get(target)} name the same file ${target}`);
    else targets.set(target, k);
  }

  // A retired figure has no row and no translated copy: what --retire removes.
  for (const k of Object.keys(tables.retiredFigures)) {
    const s = corpus.retiredState[k];
    if (!s) continue; // the exactly-one-book rule above already names it
    if (s.rows) problems.push(`retiredFigures.${k} still has ${s.rows} image-mapping row(s) — run tools/retire-translated-figure.js --retire`);
    for (const f of s.translatedCopies) problems.push(`retiredFigures.${k} still has a translated copy: media/${f}`);
  }
  return problems;
}

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
    const rows = readMappingOrRefuse(path.join(bookDir, 'media', 'image-mapping.json'), { allowMissing: true });
    retiredState[k] = {
      rows: rows.filter((r) => r.originalImage === k).length,
      translatedCopies: topLevelTranslatedCopies(bookDir, k, DEFAULT_SUFFIX),
    };
  }
  return { suffix: DEFAULT_SUFFIX, basenamesByBook, retiredState };
}
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `npx vitest run tools/__tests__/figure-config-validate.test.js`
Expected: PASS. The committed-config `beforeAll` takes about 10 s, because it indexes every book's source CNXML.

- [ ] **Step 5: Commit**

```bash
git add tools/lib/figure-config-validate.js tools/__tests__/figure-config-validate.test.js
git commit -m "feat(figures): §C140 ㊵ — the figure-config validator, with a passing and a failing case per rule

A pure validateFigureConfig plus a corpus builder, run on synthetic configs (one
failing case per rule, each one change from a passing baseline) and on the committed
config, because the new tables ship empty and a corpus-only test would check nothing.
Run it locally before any pin's buy. A retired figure's published copies and
references are deliberately not checked: they remain until ②.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: The retire tool — the CLI and `--retire`

**Files:**
- Create: `tools/retire-translated-figure.js`
- Create: `tools/__tests__/retire-translated-figure.test.js`

**Interfaces:**
- Consumes: `DEFAULT_SUFFIX` and `indexBookSourceBasenames` (Task 5), `escapesMediaDir` (`tools/publish-figure-svg.js`), `loadRetiredFigures` (Task 1), and the Task 6 helpers.
- Produces:
  - `CliError`, and `parseCli(argv) -> {book, retire: string[]|null, prune: boolean, apply: boolean, help: boolean}`.
  - `planRetire({repoRoot, booksRoot, book, names, retired, git, suffix}) -> {refusals, mappingPath, rows, removeNames: Set, deletions: string[], perName}`.
  - `applyRetire(plan, {repoRoot, git, unlink}) -> {ok, done, error?, restoreError?}`.
  - `run(argv, {repoRoot, booksRoot, git, retired, unlink, out, err}) -> exit code`. Task 9 adds the `--prune` path to it.

- [ ] **Step 1: Write the failing tests**

Create `tools/__tests__/retire-translated-figure.test.js`:

```js
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';
import { run } from '../retire-translated-figure.js';
import { DEFAULT_SUFFIX } from '../generate-image-mapping.js';
import { makeGitFixture } from './helpers/git-fixture.js';

const S = DEFAULT_SUFFIX;
const TOOL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'retire-translated-figure.js');
const ROW = (n) => ({ originalImage: n, outputName: `${n}${S}.svg`, extension: '.svg' });
const LEGACY = { figureId: 'fig-legacy', outputName: `legacy${S}.png` };
const PUB = 'books/b/05-publication/mt-preview/chapters/01';

function standardBook(extra = {}) {
  return makeGitFixture({
    'books/b/01-source/ch01/m1.cnxml':
      '<document>' +
      ['CNX_A', 'CNX_B', 'CNX_C']
        .map((n, i) => `<figure id="f${i}"><media><image src="../../media/${n}.jpg"/></media></figure>`)
        .join('') +
      '</document>',
    'books/b/media/image-mapping.json': JSON.stringify([ROW('CNX_A'), ROW('CNX_B'), LEGACY], null, 2) + '\n',
    [`books/b/media/CNX_A${S}.svg`]: '<svg>A</svg>',
    [`books/b/media/CNX_B${S}.svg`]: '<svg>B</svg>',
    'books/b/03-translated/mt-preview/ch01/m1.cnxml': `<image src="../../media/CNX_A${S}.svg"/><image src="../../media/CNX_B${S}.svg"/>`,
    [`${PUB}/1-1-page.html`]: `<img src="/content/b/chapters/01/images/media/CNX_A${S}.svg"><img src="/content/b/chapters/01/images/media/CNX_B${S}.svg">`,
    [`${PUB}/images/media/CNX_A${S}.svg`]: '<svg>A</svg>',
    [`${PUB}/images/media/CNX_B${S}.svg`]: '<svg>B</svg>',
    ...extra,
  });
}

function runTool(fx, argv, opts = {}) {
  const out = [];
  const err = [];
  const code = run(argv, {
    repoRoot: fx.root,
    booksRoot: fx.booksRoot,
    retired: new Set(['CNX_A']),
    out: (s) => out.push(s),
    err: (s) => err.push(s),
    ...opts,
  });
  return { code, out: out.join('\n'), err: err.join('\n') };
}

describe('retire-translated-figure --retire (§C140 ㊵)', () => {
  it('a dry run writes nothing, and reports the row, the copy and every reference', () => {
    const fx = standardBook();
    const before = fx.snapshot();
    const r = runTool(fx, ['--book', 'b', '--retire', 'CNX_A']);
    expect(r.code).toBe(0);
    expect(fx.snapshot()).toEqual(before);
    expect(r.out).toMatch(/would remove: 1 mapping row\(s\); media\/CNX_A.*\.svg/);
    expect(r.out).toMatch(/still referenced by 2 file\(s\)/);
    expect(r.out).toMatch(/Dry run/);
  });

  it('--apply removes exactly the row and the translated copy, and leaves every page alone', () => {
    const fx = standardBook();
    const before = fx.snapshot();
    const r = runTool(fx, ['--book', 'b', '--retire', 'CNX_A', '--apply']);
    expect(r.code).toBe(0);
    expect(fx.read('books/b/media/image-mapping.json')).toBe(JSON.stringify([ROW('CNX_B'), LEGACY], null, 2) + '\n');
    expect(fx.exists(`books/b/media/CNX_A${S}.svg`)).toBe(false);
    expect(fx.exists(`books/b/media/CNX_B${S}.svg`)).toBe(true);
    const after = fx.snapshot();
    for (const rel of Object.keys(before).filter((p) => p.includes('03-translated') || p.includes('05-publication'))) {
      expect(after[rel]).toBe(before[rel]);
    }
    expect(r.out).toMatch(/--prune/);
  });

  it('refuses a figure with no retiredFigures entry, and writes nothing', () => {
    const fx = standardBook();
    const before = fx.snapshot();
    const r = runTool(fx, ['--book', 'b', '--retire', 'CNX_C', '--apply']);
    expect(r.code).toBe(1);
    expect(r.err).toMatch(/no retiredFigures entry/);
    expect(fx.snapshot()).toEqual(before);
  });

  it('reads the retired set from the figure config when none is given (empty in this PR)', () => {
    const fx = standardBook();
    const r = runTool(fx, ['--book', 'b', '--retire', 'CNX_A'], { retired: undefined });
    expect(r.code).toBe(1);
    expect(r.err).toMatch(/no retiredFigures entry/);
  });

  it('refuses a name this book does not use (wrong --book), rather than reporting a no-op', () => {
    const fx = standardBook({ 'books/b2/01-source/ch01/m1.cnxml': '<image src="../../media/CNX_Q.jpg"/>' });
    const r = runTool(fx, ['--book', 'b2', '--retire', 'CNX_A', '--apply']);
    expect(r.code).toBe(1);
    expect(r.err).toMatch(/wrong --book/);
  });

  it('refuses a figure with a sidecar', () => {
    const fx = standardBook({ 'books/b/figure-text/CNX_A.is.json': '{}' });
    expect(runTool(fx, ['--book', 'b', '--retire', 'CNX_A', '--apply']).code).toBe(1);
  });

  it('refuses an unreadable mapping and leaves it as it is', () => {
    const fx = standardBook({ 'books/b/media/image-mapping.json': '{not json' });
    const r = runTool(fx, ['--book', 'b', '--retire', 'CNX_A', '--apply']);
    expect(r.code).toBe(1);
    expect(fx.read('books/b/media/image-mapping.json')).toBe('{not json');
  });

  it('refuses a row whose outputName would reach outside media/', () => {
    const bad = { originalImage: 'CNX_A', outputName: `../CNX_A${S}.svg`, extension: '.svg' };
    const fx = standardBook({ 'books/b/media/image-mapping.json': JSON.stringify([bad], null, 2) + '\n' });
    const r = runTool(fx, ['--book', 'b', '--retire', 'CNX_A', '--apply']);
    expect(r.code).toBe(1);
    expect(r.err).toMatch(/inside media/);
  });

  it.each([
    ['modified', (fx) => fx.write(`books/b/media/CNX_A${S}.svg`, '<svg>edited</svg>')],
    ['untracked', (fx) => fx.write(`books/b/media/CNX_A${S}.png`, 'u')],
    ['ignored', (fx) => fx.write(`books/b/media/CNX_A${S}.tmp`, 'i')],
  ])('refuses to delete a %s translated copy — git is the backup', (_kind, setup) => {
    const fx = standardBook();
    setup(fx);
    const r = runTool(fx, ['--book', 'b', '--retire', 'CNX_A', '--apply']);
    expect(r.code).toBe(1);
    expect(r.err).toMatch(/not tracked by git, or modified/);
  });

  it('an unrelated modified file in media/ does not block a retire', () => {
    const fx = standardBook();
    fx.write(`books/b/media/CNX_B${S}.svg`, '<svg>B, edited</svg>');
    expect(runTool(fx, ['--book', 'b', '--retire', 'CNX_A', '--apply']).code).toBe(0);
  });

  it('is batch-atomic: one bad name and nothing is written for the good one', () => {
    const fx = standardBook();
    const before = fx.snapshot();
    expect(runTool(fx, ['--book', 'b', '--retire', 'CNX_A,CNX_C', '--apply']).code).toBe(1);
    expect(fx.snapshot()).toEqual(before);
  });

  it('a failure part-way restores the mapping and every file already deleted', () => {
    const fx = standardBook();
    const before = fx.snapshot();
    let calls = 0;
    const unlink = (p) => {
      calls += 1;
      if (calls === 2) throw Object.assign(new Error('EACCES: simulated'), { code: 'EACCES' });
      fs.unlinkSync(p);
    };
    const r = runTool(fx, ['--book', 'b', '--retire', 'CNX_A,CNX_B', '--apply'], { retired: new Set(['CNX_A', 'CNX_B']), unlink });
    expect(r.code).toBe(1);
    expect(r.err).toMatch(/were restored/);
    expect(fx.snapshot()).toEqual(before);
  });

  it('a re-run finishes a half-done retire: the row is gone, the copy is not', () => {
    const fx = standardBook();
    fx.write('books/b/media/image-mapping.json', JSON.stringify([ROW('CNX_B'), LEGACY], null, 2) + '\n');
    fx.git('commit', '-qam', 'row removed by hand');
    expect(runTool(fx, ['--book', 'b', '--retire', 'CNX_A', '--apply']).code).toBe(0);
    expect(fx.exists(`books/b/media/CNX_A${S}.svg`)).toBe(false);
  });

  it('removes a row whose translated copy is already gone, deleting nothing', () => {
    const fx = standardBook();
    fx.git('rm', '-q', `books/b/media/CNX_A${S}.svg`);
    fx.git('commit', '-qm', 'copy gone');
    expect(runTool(fx, ['--book', 'b', '--retire', 'CNX_A', '--apply']).code).toBe(0);
    expect(JSON.parse(fx.read('books/b/media/image-mapping.json'))).toEqual([ROW('CNX_B'), LEGACY]);
  });

  it('a second run changes nothing and says there is nothing to retire', () => {
    const fx = standardBook();
    expect(runTool(fx, ['--book', 'b', '--retire', 'CNX_A', '--apply']).code).toBe(0);
    fx.git('commit', '-qam', 'retired');
    const before = fx.snapshot();
    const r = runTool(fx, ['--book', 'b', '--retire', 'CNX_A', '--apply']);
    expect(r.code).toBe(0);
    expect(r.out).toMatch(/nothing to retire/);
    expect(fx.snapshot()).toEqual(before);
  });

  it.each([
    [['--book', 'b', '--retire', 'CNX_A', '--dryrun']],
    [['--book', 'b', '--retire', 'CNX_A', '--prune']],
    [['--retire', 'CNX_A']],
    [['--book', '../x', '--prune']],
    [['--book', 'b', '--retire']],
    [['--book', 'b', '--retire', '--apply']],
    [['--book', 'b']],
  ])('refuses usage %j with exit 2 and writes nothing', (argv) => {
    const fx = standardBook();
    const before = fx.snapshot();
    expect(runTool(fx, argv).code).toBe(2);
    expect(fx.snapshot()).toEqual(before);
  });

  it('runs from any working directory: --help exits 0 with the usage', () => {
    const r = spawnSync(process.execPath, [TOOL, '--help'], { cwd: os.tmpdir(), encoding: 'utf-8' });
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/--retire <name>/);
  });
});
```

- [ ] **Step 2: Run them and confirm they fail**

Run: `npx vitest run tools/__tests__/retire-translated-figure.test.js`
Expected: FAIL. `../retire-translated-figure.js` cannot be resolved.

- [ ] **Step 3: Write the tool**

Create `tools/retire-translated-figure.js`. The `--prune` functions here are completed in Task 9; the one written now refuses with exit 1:

```js
#!/usr/bin/env node

/**
 * Retire a figure's translated copy, then prune published copies nothing references (§C140 ㊵).
 *
 * A retirement is a ruling recorded in the figure config's `retiredFigures` table. This tool only
 * carries it out, in two steps, because pages must not change before the whole-book re-render
 * (② — design docs/superpowers/specs/2026-10-01-c140-c40-retire-and-pins-design.md, D14):
 *
 *   --retire <names>  removes each figure's image-mapping row and its translated copy at the top
 *                     of the book's media folder. It never touches 03-translated or 05-publication,
 *                     so every page keeps its image until it is re-injected and re-rendered. It
 *                     reports every page and CNXML file that still references the copy; run it
 *                     again later as a dry run, and once nothing references a figure it says so.
 *   --prune           after that re-render: deletes each published translated copy that no
 *                     mapping row names and nothing references.
 *
 * Both are DRY RUNS unless --apply is given. Every file deleted is one git tracks unmodified, so
 * git is the backup; a failure part-way restores the mapping and every file already deleted.
 *
 * Usage:
 *   node tools/retire-translated-figure.js --book <slug> --retire <name>[,<name>…] [--apply]
 *   node tools/retire-translated-figure.js --book <slug> --prune [--apply]
 *
 * Exit: 0 done, or the plan printed with nothing refused · 1 refused, or failed and restored ·
 * 2 usage.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { DEFAULT_SUFFIX, indexBookSourceBasenames } from './generate-image-mapping.js';
import { escapesMediaDir } from './publish-figure-svg.js';
import { loadRetiredFigures } from './lib/figure-text-config.js';
import {
  runGit,
  readMappingOrRefuse,
  topLevelTranslatedCopies,
  findReferences,
  cleanTrackedSet,
  locate,
  writeAtomically,
  restoreFromHead,
} from './lib/translated-figure-refs.js';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Every flag this tool accepts. An argv token outside it is a typo, not a no-op. */
const KNOWN_FLAGS = new Set(['--book', '--retire', '--prune', '--apply', '--help', '-h']);
const VALUED_FLAGS = new Set(['--book', '--retire']);

const USAGE = `Usage:
  node tools/retire-translated-figure.js --book <slug> --retire <name>[,<name>…] [--apply]
  node tools/retire-translated-figure.js --book <slug> --prune [--apply]
A dry run unless --apply is given.
Design: docs/superpowers/specs/2026-10-01-c140-c40-retire-and-pins-design.md`;

/** A usage refusal. Exit 2. */
export class CliError extends Error {
  constructor(message) {
    super(message);
    this.name = 'CliError';
    this.code = 2;
  }
}

/**
 * Parse argv, REFUSING anything unrecognised: tools/lib/parseArgs.js silently drops unknown
 * flags, which would turn a typo such as `--dryrun` into a real run.
 * @returns {{book:string|null, retire:string[]|null, prune:boolean, apply:boolean, help:boolean}}
 */
export function parseCli(argv) {
  const args = { book: null, retire: null, prune: false, apply: false, help: false };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!KNOWN_FLAGS.has(token)) {
      throw new CliError(`Unknown argument: ${token}\nKnown: ${[...KNOWN_FLAGS].sort().join(' ')}`);
    }
    if (!VALUED_FLAGS.has(token)) {
      if (token === '--prune') args.prune = true;
      else if (token === '--apply') args.apply = true;
      else args.help = true;
      continue;
    }
    const value = argv[i + 1];
    if (value === undefined || value.startsWith('--')) {
      throw new CliError(`${token} needs a value, and got ${value === undefined ? 'nothing' : JSON.stringify(value)}`);
    }
    i += 1;
    if (token === '--book') args.book = value;
    else args.retire = [...(args.retire ?? []), ...value.split(',').map((s) => s.trim()).filter(Boolean)];
  }
  if (args.help) return args;
  if (!args.book) throw new CliError('--book is required');
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(args.book)) {
    throw new CliError(`--book ${JSON.stringify(args.book)} is not a book slug`);
  }
  if (Boolean(args.retire) === args.prune) throw new CliError('give exactly one of --retire <names> or --prune');
  if (args.retire && args.retire.length === 0) throw new CliError('--retire needs at least one name');
  return args;
}

/**
 * Everything a retire would do, and every reason it must not. Reads only; writes nothing.
 * Batch semantics: any refusal for any name means nothing is written for any name.
 */
export function planRetire({ repoRoot, booksRoot, book, names, retired, git = runGit, suffix = DEFAULT_SUFFIX }) {
  const bookDir = path.join(booksRoot, book);
  if (!fs.existsSync(bookDir)) return { refusals: [`no book directory at ${bookDir}`] };
  const mappingPath = path.join(bookDir, 'media', 'image-mapping.json');
  let rows;
  try {
    rows = readMappingOrRefuse(mappingPath, { allowMissing: true });
  } catch (err) {
    return { refusals: [err.message] };
  }
  const sourceBasenames = indexBookSourceBasenames(bookDir);
  const refusals = [];
  const removeNames = new Set();
  const deletions = new Set();
  const perName = [];
  for (const name of names) {
    if (!retired.has(name)) {
      refusals.push(`${name}: no retiredFigures entry — record the ruling in the figure config first`);
      continue;
    }
    if (!sourceBasenames.has(name)) {
      refusals.push(`${name}: no image of that name in ${book}'s source CNXML — wrong --book?`);
      continue;
    }
    if (fs.existsSync(path.join(bookDir, 'figure-text', `${name}.is.json`))) {
      refusals.push(`${name}: has a sidecar, i.e. a current paid translation — retiring that is a different decision`);
      continue;
    }
    const mine = rows.filter((r) => r.originalImage === name);
    const files = [];
    let bad = false;
    for (const r of mine) {
      const out = r.outputName;
      const ext = typeof out === 'string' ? path.extname(out) : '';
      if (typeof out !== 'string' || ext === '' || out !== `${name}${suffix}${ext}` || escapesMediaDir(bookDir, out)) {
        refusals.push(`${name}: its mapping row names ${JSON.stringify(out)}, which is not ${name}${suffix}.<ext> inside media/`);
        bad = true;
        continue;
      }
      if (fs.existsSync(path.join(bookDir, 'media', out))) files.push(out);
    }
    if (bad) continue;
    if (mine.length) removeNames.add(name);
    // A half-done retire leaves the copy without its row: the name rule finds it, so a re-run finishes.
    for (const f of topLevelTranslatedCopies(bookDir, name, suffix)) if (!files.includes(f)) files.push(f);
    for (const f of files) deletions.add(path.relative(repoRoot, path.join(bookDir, 'media', f)));
    perName.push({ name, rows: mine.length, files });
  }
  const deletionList = [...deletions];
  const clean = cleanTrackedSet(repoRoot, deletionList, git);
  for (const rel of deletionList) {
    if (!clean.has(rel)) refusals.push(`${rel}: not tracked by git, or modified — git is the backup a deletion relies on`);
  }
  return { refusals, mappingPath, rows, removeNames, deletions: deletionList, perName };
}

/** Carry out a retire plan. On any failure, restore the mapping bytes and every deleted file. */
export function applyRetire(plan, { repoRoot, git = runGit, unlink = fs.unlinkSync }) {
  const done = [];
  const deleted = [];
  const before = fs.existsSync(plan.mappingPath) ? fs.readFileSync(plan.mappingPath) : null;
  let mappingWritten = false;
  try {
    if (plan.removeNames.size > 0) {
      const kept = plan.rows.filter((r) => !plan.removeNames.has(r.originalImage));
      writeAtomically(plan.mappingPath, JSON.stringify(kept, null, 2) + '\n');
      mappingWritten = true;
      done.push(`removed ${plan.rows.length - kept.length} row(s) from ${path.relative(repoRoot, plan.mappingPath)}`);
    }
    for (const rel of plan.deletions) {
      unlink(path.join(repoRoot, rel));
      deleted.push(rel);
      done.push(`deleted ${rel}`);
    }
    return { ok: true, done };
  } catch (err) {
    let restoreError;
    try {
      if (mappingWritten && before !== null) writeAtomically(plan.mappingPath, before);
      restoreFromHead(repoRoot, deleted, git);
    } catch (e) {
      restoreError = e.message;
    }
    return { ok: false, done, error: err.message, restoreError };
  }
}

function where(rel, bookRel) {
  const l = locate(rel, bookRel);
  return l.track && l.chapter ? `${l.area} · ${l.track} · ${l.chapter} · ${path.basename(rel)}` : rel;
}

function failed(result, err, restored) {
  err(
    `FAILED part-way (${result.error}); ` +
      (result.restoreError
        ? `RESTORE ALSO FAILED: ${result.restoreError} — restore by hand from git`
        : `${restored} restored`)
  );
  return 1;
}

function runRetire(args, { repoRoot, booksRoot, git, retired, unlink, out, err }) {
  const plan = planRetire({ repoRoot, booksRoot, book: args.book, names: args.retire, retired, git });
  if (plan.refusals.length) {
    err('REFUSED — nothing was written:');
    for (const r of plan.refusals) err(`  ${r}`);
    return 1;
  }
  const bookRel = path.relative(repoRoot, path.join(booksRoot, args.book));
  const needle = (n) => `${n}${DEFAULT_SUFFIX}.`;
  const refs = findReferences({ repoRoot, bookRel, needles: new Set(args.retire.map(needle)), suffix: DEFAULT_SUFFIX, git });
  for (const p of plan.perName) {
    out(p.name);
    if (p.rows || p.files.length) {
      const copies = p.files.length ? p.files.map((f) => `media/${f}`).join(', ') : 'no translated copy';
      out(`  ${args.apply ? 'removing' : 'would remove'}: ${p.rows} mapping row(s); ${copies}`);
    } else {
      out('  nothing to retire: no mapping row, no translated copy');
    }
    const by = refs.get(needle(p.name)) || [];
    if (by.length === 0) {
      out('  no page or CNXML file references it');
    } else {
      out(`  still referenced by ${by.length} file(s) — pages change only in the whole-book re-inject and re-render (②):`);
      for (const rel of by) out(`    ${where(rel, bookRel)}`);
    }
  }
  if (!args.apply) {
    out('\nDry run — nothing was written. Add --apply to retire.');
    return 0;
  }
  const result = applyRetire(plan, { repoRoot, git, unlink });
  for (const d of result.done) out(`  ${d}`);
  if (!result.ok) return failed(result, err, 'the mapping and every file already deleted were');
  out(`\nDone. After the whole-book re-inject and re-render (②), run:\n  node tools/retire-translated-figure.js --book ${args.book} --prune`);
  return 0;
}

function runPrune(_args, { err }) {
  err('--prune is not built yet (§C140 ㊵ Task 9)');
  return 1;
}

/**
 * The whole CLI as a function, with every side channel injectable.
 * @returns {number} the exit code
 */
export function run(
  argv,
  {
    repoRoot = REPO_ROOT,
    booksRoot = path.join(REPO_ROOT, 'books'),
    git = runGit,
    retired,
    unlink = fs.unlinkSync,
    out = console.log,
    err = console.error,
  } = {}
) {
  let args;
  try {
    args = parseCli(argv);
  } catch (e) {
    if (!(e instanceof CliError)) throw e;
    err(e.message);
    err(USAGE);
    return 2;
  }
  if (args.help) {
    out(USAGE);
    return 0;
  }
  if (args.retire) {
    return runRetire(args, { repoRoot, booksRoot, git, retired: retired ?? loadRetiredFigures(), unlink, out, err });
  }
  return runPrune(args, { repoRoot, booksRoot, git, unlink, out, err });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exitCode = 1; // a failure default, overwritten only when a verdict is reached
  process.exitCode = run(process.argv.slice(2));
}
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `npx vitest run tools/__tests__/retire-translated-figure.test.js tools/__tests__/source-write-guard.test.js`
Expected: PASS. The guard test proves the new tool's text never names the source tree.

Run, as a real-tree control, a dry run that must refuse every name, because the committed `retiredFigures` is empty:

Run: `node tools/retire-translated-figure.js --book efnafraedi-2e --retire CNX_Chem_11_04_rvosmosis; echo "exit=$?"; git status --porcelain`
Expected: `REFUSED — nothing was written:` / `CNX_Chem_11_04_rvosmosis: no retiredFigures entry …`, then `exit=1`, and an empty `git status`.

- [ ] **Step 5: Commit**

```bash
git add tools/retire-translated-figure.js tools/__tests__/retire-translated-figure.test.js
git commit -m "feat(figures): §C140 ㊵ — retire-translated-figure --retire: row and translated copy, never a page

A dry run unless --apply; strict flags (exit 2); batch-atomic refusals (no record, wrong
book, sidecar, unreadable mapping, an outputName outside media/, a file git cannot
restore); a failure part-way restores the mapping and every deleted file; a re-run
finishes a half-done retire. It reports what still references each figure, and prints
no per-module commands: pages change only in ②.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: The retire tool — `--prune`

**Files:**
- Modify: `tools/retire-translated-figure.js`
- Modify: `tools/__tests__/retire-translated-figure.test.js`

**Interfaces:**
- Consumes: Task 8's `run`, and the Task 6 helpers `publishedCopies` and `referenceNeedle`.
- Produces:
  - `planPrune({repoRoot, booksRoot, book, git, suffix}) -> {refusals, del: string[], keep: Array<{rel, kind: 'mapped'|'referenced'|'encoded'|'git', why}>}`.
  - `applyPrune(plan, {repoRoot, git, unlink}) -> {ok, done, error?, restoreError?}`.

- [ ] **Step 1: Write the failing tests**

Append to `tools/__tests__/retire-translated-figure.test.js`:

```js
describe('retire-translated-figure --prune (§C140 ㊵)', () => {
  /** CNX_A retired, then what ②'s re-inject and re-render do: its pages point at the English image again. */
  function retiredAndRerendered(extra = {}) {
    const fx = standardBook(extra);
    expect(runTool(fx, ['--book', 'b', '--retire', 'CNX_A', '--apply']).code).toBe(0);
    fx.git('commit', '-qam', 'retire CNX_A');
    fx.write('books/b/03-translated/mt-preview/ch01/m1.cnxml', `<image src="../../media/CNX_A.jpg"/><image src="../../media/CNX_B${S}.svg"/>`);
    fx.write(`${PUB}/1-1-page.html`, `<img src="/content/b/chapters/01/images/media/CNX_A.jpg"><img src="/content/b/chapters/01/images/media/CNX_B${S}.svg">`);
    return fx;
  }
  const COPY_A = `${PUB}/images/media/CNX_A${S}.svg`;

  it('POSITIVE CONTROL: deletes the unreferenced, unmapped copy and keeps the mapped one', () => {
    const fx = retiredAndRerendered();
    const r = runTool(fx, ['--book', 'b', '--prune', '--apply']);
    expect(r.code).toBe(0);
    expect(fx.exists(COPY_A)).toBe(false);
    expect(fx.exists(`${PUB}/images/media/CNX_B${S}.svg`)).toBe(true);
  });

  it('a dry run deletes nothing', () => {
    const fx = retiredAndRerendered();
    const before = fx.snapshot();
    const r = runTool(fx, ['--book', 'b', '--prune']);
    expect(r.code).toBe(0);
    expect(r.out).toMatch(/would delete .*CNX_A/);
    expect(fx.snapshot()).toEqual(before);
  });

  it.each([
    ['a page in the OTHER track', (fx) => fx.write('books/b/05-publication/faithful/chapters/01/1-1-page.html', `<img src="CNX_A${S}.svg">`)],
    ['a CNXML file only', (fx) => fx.write('books/b/03-translated/mt-preview/ch01/m1.cnxml', `<image src="../../media/CNX_A${S}.svg"/>`)],
    ['a JSON file', (fx) => fx.write('books/b/05-publication/mt-preview/index.json', `{"img":"CNX_A${S}.svg"}`)],
  ])('keeps a copy still referenced from %s', (_where, setup) => {
    const fx = retiredAndRerendered();
    setup(fx);
    const r = runTool(fx, ['--book', 'b', '--prune', '--apply']);
    expect(r.code).toBe(0);
    expect(fx.exists(COPY_A)).toBe(true);
    expect(r.out).toMatch(/keep .*CNX_A.* still referenced by/);
  });

  it('an ignored .backup file naming the copy does not keep it', () => {
    const fx = retiredAndRerendered();
    fx.write('books/b/03-translated/mt-preview/ch01/m1.cnxml.backup.2026-10-01', `CNX_A${S}.svg`);
    expect(runTool(fx, ['--book', 'b', '--prune', '--apply']).code).toBe(0);
    expect(fx.exists(COPY_A)).toBe(false);
  });

  it('a page referencing a look-alike name does not keep the copy', () => {
    const fx = retiredAndRerendered();
    fx.write(`${PUB}/1-2-other.html`, `<img src="CNX_A2${S}.svg">`);
    expect(runTool(fx, ['--book', 'b', '--prune', '--apply']).code).toBe(0);
    expect(fx.exists(COPY_A)).toBe(false);
  });

  it('keeps an untracked copy — git could not restore it', () => {
    const fx = retiredAndRerendered();
    fx.write(`${PUB}/images/media/CNX_Z${S}.svg`, '<svg/>');
    const r = runTool(fx, ['--book', 'b', '--prune', '--apply']);
    expect(fx.exists(`${PUB}/images/media/CNX_Z${S}.svg`)).toBe(true);
    expect(r.out).toMatch(/keep .*CNX_Z.* not tracked by git/);
  });

  it('keeps a copy whose name could be URL-encoded where a page references it', () => {
    const fx = retiredAndRerendered({ [`${PUB}/images/media/CNX_Q Space${S}.svg`]: '<svg/>' });
    const r = runTool(fx, ['--book', 'b', '--prune', '--apply']);
    expect(fx.exists(`${PUB}/images/media/CNX_Q Space${S}.svg`)).toBe(true);
    expect(r.out).toMatch(/URL-encoded/);
  });

  it('finds copies under appendices too', () => {
    const fx = retiredAndRerendered({ [`books/b/05-publication/mt-preview/chapters/appendices/images/media/CNX_Old${S}.svg`]: '<svg/>' });
    expect(runTool(fx, ['--book', 'b', '--prune', '--apply']).code).toBe(0);
    expect(fx.exists(`books/b/05-publication/mt-preview/chapters/appendices/images/media/CNX_Old${S}.svg`)).toBe(false);
  });

  it('refuses an unreadable mapping and deletes nothing', () => {
    const fx = retiredAndRerendered();
    fx.write('books/b/media/image-mapping.json', '{not json');
    const before = fx.snapshot();
    expect(runTool(fx, ['--book', 'b', '--prune', '--apply']).code).toBe(1);
    expect(fx.snapshot()).toEqual(before);
  });

  it('a failure part-way restores every copy already deleted', () => {
    const fx = retiredAndRerendered({ [`${PUB}/images/media/CNX_Old${S}.svg`]: '<svg/>' });
    const before = fx.snapshot();
    let calls = 0;
    const unlink = (p) => {
      calls += 1;
      if (calls === 2) throw Object.assign(new Error('EACCES: simulated'), { code: 'EACCES' });
      fs.unlinkSync(p);
    };
    const r = runTool(fx, ['--book', 'b', '--prune', '--apply'], { unlink });
    expect(r.code).toBe(1);
    expect(fx.snapshot()).toEqual(before);
  });
});
```

- [ ] **Step 2: Run them and confirm they fail**

Run: `npx vitest run tools/__tests__/retire-translated-figure.test.js`
Expected: FAIL. Every `--prune` case exits 1 with `--prune is not built yet`.

- [ ] **Step 3: Implement `--prune`**

In `tools/retire-translated-figure.js`, add `publishedCopies` and `referenceNeedle` to the import from `./lib/translated-figure-refs.js`. Then replace the placeholder `runPrune` with:

```js
/** A name a page can reference only in plain form; any other name might be URL-encoded there. */
const PLAIN_NAME = /^[A-Za-z0-9._-]+$/;

/**
 * Which published copies to delete, and why every other one is kept. Reads only.
 * A copy is deleted only when NO mapping row names it, NOTHING references it (spec D13), its name
 * is plain, and git tracks it unmodified.
 */
export function planPrune({ repoRoot, booksRoot, book, git = runGit, suffix = DEFAULT_SUFFIX }) {
  const bookDir = path.join(booksRoot, book);
  if (!fs.existsSync(bookDir)) return { refusals: [`no book directory at ${bookDir}`] };
  const mediaDir = path.join(bookDir, 'media');
  let rows;
  try {
    rows = readMappingOrRefuse(path.join(mediaDir, 'image-mapping.json'), { allowMissing: !fs.existsSync(mediaDir) });
  } catch (err) {
    return { refusals: [err.message] };
  }
  const mapped = new Set(rows.filter((r) => typeof r.outputName === 'string').map((r) => r.outputName));
  const bookRel = path.relative(repoRoot, bookDir);
  const copies = publishedCopies(repoRoot, bookRel, suffix);
  const needles = new Set(copies.map((c) => referenceNeedle(path.basename(c))));
  const refs = findReferences({ repoRoot, bookRel, needles, suffix, git });
  const clean = cleanTrackedSet(repoRoot, copies, git);
  const del = [];
  const keep = [];
  for (const rel of copies) {
    const name = path.basename(rel);
    const by = refs.get(referenceNeedle(name)) || [];
    if (mapped.has(name)) {
      keep.push({ rel, kind: 'mapped', why: 'a mapping row still names it' });
    } else if (by.length) {
      keep.push({ rel, kind: 'referenced', why: `still referenced by ${by[0]}${by.length > 1 ? ` and ${by.length - 1} more` : ''}` });
    } else if (!PLAIN_NAME.test(name)) {
      keep.push({ rel, kind: 'encoded', why: 'its name could be URL-encoded where a page references it — check by hand' });
    } else if (!clean.has(rel)) {
      keep.push({ rel, kind: 'git', why: 'not tracked by git, or modified — git is the backup a deletion relies on' });
    } else {
      del.push(rel);
    }
  }
  return { refusals: [], del, keep };
}

/** Delete the planned copies. On any failure, restore every copy already deleted. */
export function applyPrune(plan, { repoRoot, git = runGit, unlink = fs.unlinkSync }) {
  const deleted = [];
  try {
    for (const rel of plan.del) {
      unlink(path.join(repoRoot, rel));
      deleted.push(rel);
    }
    return { ok: true, done: deleted.map((r) => `deleted ${r}`) };
  } catch (err) {
    let restoreError;
    try {
      restoreFromHead(repoRoot, deleted, git);
    } catch (e) {
      restoreError = e.message;
    }
    return { ok: false, done: deleted.map((r) => `deleted ${r}`), error: err.message, restoreError };
  }
}

function runPrune(args, { repoRoot, booksRoot, git, unlink, out, err }) {
  const plan = planPrune({ repoRoot, booksRoot, book: args.book, git });
  if (plan.refusals.length) {
    err('REFUSED — nothing was deleted:');
    for (const r of plan.refusals) err(`  ${r}`);
    return 1;
  }
  const mappedCount = plan.keep.filter((k) => k.kind === 'mapped').length;
  out(
    `${plan.del.length + plan.keep.length} published translated copies: ${plan.del.length} to delete, ` +
      `${plan.keep.length} kept (${mappedCount} still mapped).`
  );
  for (const k of plan.keep) if (k.kind !== 'mapped') out(`  keep ${k.rel} — ${k.why}`);
  for (const rel of plan.del) out(`  ${args.apply ? 'delete' : 'would delete'} ${rel}`);
  if (!args.apply) {
    out('\nDry run — nothing was deleted. Add --apply to prune.');
    return 0;
  }
  const result = applyPrune(plan, { repoRoot, git, unlink });
  if (!result.ok) return failed(result, err, 'every file already deleted was');
  out(`\nDone: ${result.done.length} deleted.`);
  return 0;
}
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `npx vitest run tools/__tests__/retire-translated-figure.test.js`
Expected: PASS.

Run a real-tree dry run, read-only. It must name exactly the 9 June leftovers as deletable:

Run: `node tools/retire-translated-figure.js --book efnafraedi-2e --prune | head -12; git status --porcelain`
Expected (measured with the same predicate on 2026-10-01): the first line is `754 published translated copies: 9 to delete, 745 kept (745 still mapped).`, then no `keep` lines, then 9 `would delete …` lines naming GasBurning (ch05), Ex9soln_img (ch06) and 7 in ch08. `git status` is empty. If the counts differ, stop and find out why before going on: the dry run is the measurement behind run-order step 5.

- [ ] **Step 5: Commit**

```bash
git add tools/retire-translated-figure.js tools/__tests__/retire-translated-figure.test.js
git commit -m "feat(figures): §C140 ㊵ — retire-translated-figure --prune: delete only what nothing names

A published copy is deleted only when no mapping row names it, nothing in the
git-visible corpus references it (either track, CNXML, JSON), its name is plain, and
git tracks it unmodified. Every other copy is kept and listed with its reason. Measured
dry run on chemistry: 754 copies, 9 deletable (the June leftovers).

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Docs, the generated inventory, and the spec's two planning-time refinements

**Files:**
- Modify: `experiments/figure-text-translation/README.md` (§ "Two source trees — get the edition right" and § "Where the translated file goes")
- Modify: `experiments/figure-text-translation/sources.py` (the ⑦ comment above `_CONFIG = load_config()`)
- Modify: `experiments/figure-text-translation/test_sources.py` (the ⑦ section header comment)
- Modify: `docs/superpowers/specs/2026-10-01-c140-c40-retire-and-pins-design.md` (D11, D13, run order)
- Regenerate: `docs/_generated/tools.md`, and whatever else `npm run docs:generate` rewrites

**Interfaces:** none. This task changes documentation and comments only.

- [ ] **Step 1: README — the source-trees section**

In `experiments/figure-text-translation/README.md`, directly after the paragraph that ends `Measured, frozen: [`evidence/2026-09-16-c7-build/`](evidence/2026-09-16-c7-build/README.md).`, insert:

✏️ *Corrected 2026-10-01 at Task 10's review: this block, and Step 2's block below, now match the README as committed in `1926b6851`; the originals had three false sentences between them (the heading's order claim, rule 4's ambiguous-fold clause, and Step 2's re-add clause).*

```markdown
**§C140 ㊵ — four rules decide what the resolver may return, in this order; the fourth is the normal
lookup** (design: `docs/superpowers/specs/2026-10-01-c140-c40-retire-and-pins-design.md`):

1. **`retiredFigures`** — a [USER] ruling retired the figure's *translated copy*: refused as
   `retired`, and never mapped again. Carry a retirement out with
   `node tools/retire-translated-figure.js --book <slug> --retire <names>` (row and translated copy),
   then, after ②'s whole-book re-render, `--prune` (published copies nothing references). Both are dry
   runs unless `--apply`.
2. **`supersededArtwork`** — the only vector in the delivery is known to be superseded by the published
   figure: refused as `superseded`. A figure may be in both 1 and 2; retired wins.
3. **`artworkPins`** — the ONE file a figure's artwork comes from, as a tree key plus a path inside it.
   An `alias` fills a hole in the delivery and is refused as `pin-conflict` once any file matches the
   basename; an `override` deliberately replaces the normal lookup. A pin names an exact file, never a
   tree or a stem: the base tree holds two different ibuprofen drawings, and a tree-only rule returns
   the wrong one. A missing pinned file is `pin-missing`, never a fall-back.
4. **The normal lookup** — editions in `editionPrecedence` order, formats in `SOURCE_EXTS` order, then a
   case-and-punctuation fold (`_normkey`, which never strips `_img`). An ambiguous fold (two differently
   named files in one edition folding onto the basename) yields no candidate from that edition: the
   lookup moves on to the next edition, and if nothing resolves the figure is reported as not found, not
   refused.

Every table's keys are matched after the same fold, and `tools/lib/figure-config-validate.js` (run by
`npm test`) checks every entry. An entry lands in the commit that acts on it; **run that validator
locally before a pin's buy** (`npx vitest run tools/__tests__/figure-config-validate.test.js`), because
CI runs only after the money is spent.
```

- [ ] **Step 2: README — where the translated file goes**

In the same file, at the end of § "Where the translated file goes" (after `§ *A translated figure is a file in `books/<slug>/media/`*.`), add:

```markdown
A figure listed in `retiredFigures` is never mapped: the generator names its translated copy and
skips it, so restoring the file cannot bring its row back. Retire a figure with
`tools/retire-translated-figure.js`, never by deleting its mapping row by hand — the generator
re-adds the row of any figure that is not in `retiredFigures` whose translated copy is still in
`media/`.
```

- [ ] **Step 3: The ⑦ comments in `sources.py` and `test_sources.py`**

In `sources.py`, replace the five comment lines that start `# §C140 ⑦. A resolved artwork whose page box is a standard paper size` with:

```python
# §C140 ⑦. A candidate whose page box is a standard paper size, in either orientation, is a
# production page — a placement or dialogue SHEET — not a figure: `resolve_detail` skips it for the
# edition's next candidate, and refuses the figure only when every candidate in the edition is one.
# Measured 2026-09-16, before that per-candidate rule, over 910 resolved artworks: exactly 2
# (rvosmosis, N2O5; both Letter), still 2 at ±10 pt; the next largest is 468×576 pt. Today only
# rvosmosis is refused: N2O5's .eps sibling resolves. Aspect ratio, creator and embedded-raster
# size were measured and rejected (evidence/2026-09-16-c7-explore/README.md).
```

In `test_sources.py`, replace the two header lines

```python
# §C140 ⑦ — PRODUCTION PAGES ARE REFUSED, INSIDE AN EDITION, WITH A REASON
# Measured 2026-09-16: exactly 2 of 910 resolved artworks sit at a standard paper size
# (rvosmosis, N2O5 — both Letter), 0 others even at ±10 pt; the next largest is 468×576 pt.
```

with

```python
# §C140 ⑦ — PRODUCTION PAGES ARE SKIPPED, AND REFUSED ONLY WHEN AN EDITION HAS NOTHING ELSE
# Measured 2026-09-16, before the per-candidate rule: exactly 2 of 910 resolved artworks sat at a
# standard paper size (rvosmosis, N2O5 — both Letter), 0 others even at ±10 pt; the next largest is
# 468×576 pt. Today only rvosmosis is refused: N2O5's .eps sibling resolves.
```

- [ ] **Step 4: The spec's two planning-time refinements**

In `docs/superpowers/specs/2026-10-01-c140-c40-retire-and-pins-design.md`:

(a) At the end of the D11 cell's rule list, replace `every retired figure has no row, no translated copy, no published copy and no reference.` with:

`every retired figure has no row and no translated copy. ✏️ *Amended 2026-10-01 during planning: the draft also required "no published copy and no reference", which contradicts D14. Those remain, legitimately, until ②'s re-render, so a CI rule on them would fail the retire PR. After the prune, re-running `--retire` as a dry run is the census: its report says whether anything still references each figure.*`

(b) In D13's decision cell, replace `raster and font files skipped.` with:

`raster and font files skipped, and the translated copies themselves skipped. ✏️ *Amended 2026-10-01 during planning: measured, the copies are 821 MB of the 879 MB corpus, and 0 of 1,471 translated SVGs reference any external file (every `href`/`src`/`url(` is a `data:` URI or a `#` fragment), so scanning them costs about 10× the time (re-measured 2026-10-01, during implementation, on the dev box: 0.2 s without them, 1.5–3 s with them) and can find nothing. If the composer ever writes an external reference into a figure, revisit this.*`

(c) In D10's decision cell, replace `Everything kept is listed with its reason.` with `Everything kept is listed with its reason, except the copies a mapping row still names, which are reported as a count. ✏️ *Amended 2026-10-01 during planning: listing them would print about 745 lines for chemistry.*`

(d) In § Run order, step 3 of the retires, replace `the validator passes; rows and translated copies still match one-to-one.` with `the validator passes (no row and no translated copy for any of the 7); rows and translated copies still match one-to-one.`, and in step 5 replace `then the census: no reference to any of the 6 (or the 9 leftovers) remains.` with `then the census: `--retire <the 6>` re-run as a dry run reports, for each, no row, no translated copy and no reference.`

- [ ] **Step 5: Regenerate the generated docs**

Run: `npm run docs:generate && git status --porcelain`
Expected: `docs/_generated/tools.md` changes. It gains a `retire-translated-figure.js` row, described as `Retire a figure's translated copy, then prune published copies nothing referenc…`, and `generate-image-mapping.js`'s row now begins `Generate or update a book's image mapping…`. Commit any other file the generator rewrites as well, after reading its diff.

Run: `npm run docs:check`
Expected: exit 0.

- [ ] **Step 6: Run the Python suite once more**

Run: `cd experiments/figure-text-translation && FIGTEXT_PYLIBS=./pylibs python3 -u test_sources.py | tail -3; cd -`
Expected: `ALL PASS`.

- [ ] **Step 7: Commit**

```bash
git add experiments/figure-text-translation/README.md experiments/figure-text-translation/sources.py experiments/figure-text-translation/test_sources.py docs/superpowers/specs/2026-10-01-c140-c40-retire-and-pins-design.md docs/_generated/
git commit -m "docs(figures): §C140 ㊵ — the four resolver rules, the retire tool, and two planning-time spec refinements

README: retired → superseded → pins → the normal lookup, and how a retirement is
carried out. sources.py and test_sources.py: the ⑦ paper-size comments now describe
the per-candidate rule (N2O5 resolves). Spec: D11's retired-figure check covers rows
and translated copies only (published copies remain until ②, by D14), and D13 skips the
translated copies (821 of 879 MB, 0 external references in 1,471 SVGs). Regenerated
the tool inventory.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: The register — ㊵'s status, the RESUME block, and the findings outside ㊵

**Files:**
- Modify: `docs/plans/2026-07-21-post-item17-followup-campaign.md`

**Interfaces:** none.

- [ ] **Step 1: Re-measure each finding before logging it**

CLAUDE.md requires re-measuring a relayed finding. Run each command and keep its output for Step 3.

```bash
# (1) three faithful ch01 copies that are older than media/ and mt-preview
for n in CNX_Chem_01_01_ChemWeb CNX_Chem_01_01_SciMethod CNX_Chem_01_05_Archer2_img; do
  m=$(ls books/efnafraedi-2e/media/ | grep -a "^${n}_IS\." | head -1)
  printf '%-30s media=%s mt=%s faithful=%s\n' "$n" \
    "$(git hash-object books/efnafraedi-2e/media/$m | cut -c1-8)" \
    "$(git hash-object books/efnafraedi-2e/05-publication/mt-preview/chapters/01/images/media/$m 2>/dev/null | cut -c1-8)" \
    "$(git hash-object books/efnafraedi-2e/05-publication/faithful/chapters/01/images/media/$m 2>/dev/null | cut -c1-8)"
done
# (2) the faithful ch03 page's ibuprofen alt
grep -ao '<img[^>]*ibuprofenmass_img_IS[^>]*>' books/efnafraedi-2e/05-publication/faithful/chapters/03/3-1-*.html | head -2
# (3) generate-image-mapping's parser drops an unknown flag (read the parser), and an unreadable mapping becomes []
sed -n '/^function parseArgs/,/^}/p;/let existing = \[\]/,/const merged/p' tools/generate-image-mapping.js
# (4) parseArgs reads --apply=false as true
node --input-type=module -e "import { parseArgs } from './tools/lib/parseArgs.js'; console.log(parseArgs(['--apply=false'], [{ name: 'apply', flags: ['--apply'], type: 'boolean', default: false }]))"
# (5) LICENSE's font claim against the tracked SVGs
node -e 'const {execFileSync}=require("child_process");const fs=require("fs");const f=execFileSync("git",["ls-files","-z","--","books/*_IS.svg"]).toString().split("\0").filter(Boolean);let ttf=0,woff2=0;for(const p of f){const t=fs.readFileSync(p,"latin1");if(/font\/ttf|format\("truetype"\)/.test(t))ttf++;else if(/woff2/.test(t))woff2++;}console.log({tracked:f.length,ttf,woff2})'
# (6) figure-run's report computes the live-copy note only for refusals and contests
grep -an 'stillMapped' tools/figure-run.js | head -5
# (7) the manual raster-replacement plan omits a re-inject
sed -n '75,90p' docs/plans/2026-09-09-raster-figure-manual-replacement.md
```

Expected:
- (1): media and mt-preview hashes equal, faithful different, for all three.
- (2): an English `alt` on the faithful page.
- (3): the parser has no `else` for an unknown token, and `catch { existing = []; }`.
- (4): `{ apply: true }`.
- (5): `ttf` is 33 before the ㊵ work.
- (6): `stillMapped` is set only on the contest and refusal branches.
- (7): the steps read add row, commit, re-render, with no inject.

If any result differs, log what was measured, not what the spec said.

- [ ] **Step 2: Update the ㊵ row and the RESUME block**

In the ㊵ row's last cell, prepend: `**Tools BUILT 2026-10-01 on `feat/c140-c40-retire-and-alias`** (design `docs/superpowers/specs/2026-10-01-c140-c40-retire-and-pins-design.md`, plan `docs/superpowers/plans/2026-10-01-c140-c40-retire-and-pins.md`): the `retiredFigures`/`artworkPins` tables (empty), their resolver rules, `tools/retire-translated-figure.js` (`--retire`, then `--prune` after ②), and a CI validator. Not yet run on any figure. ` In the same cell, replace the evidence pointer `[`evidence/2026-09-29-c27-c14/`](…) §4` with `[`evidence/2026-09-29-c27-c14/`](…) §4 for the live defects; [`evidence/2026-10-01-c40-design/`](../../experiments/figure-text-translation/evidence/2026-10-01-c40-design/README.md) for the alias files (measured: values, 200-dpi pixel sizes and the June PDFs' Title metadata match)`.

In the newest ⏩ RESUME block, replace development-order step 7 with:

`7. **§C140 ㊵'s tools** ✅ built on `feat/c140-c40-retire-and-alias` (PR pending). **Next, after merge:** the retire run's first half (add the 7 `retiredFigures` entries, the 6 plus Ques11ans; `--retire --apply`; deploy). The retire commit also fixes the four comments spec D12 lists for it (`sources.py`'s BlastFurn live-copy note; `figure-run.js`'s rvosmosis/N2O5/BlastFurn instances, N2O5's whole-sheet copy, and "N2O5 resolves cleanly"). Its second half (`--prune`, then the census) rides with ②'s whole-book re-render. Each of the 4 pins lands with its buy, and the buys stay held by ㊸. ◀ next code is the PR`

- [ ] **Step 3: Log the findings outside ㊵**

Add a row to §C140's table, after ㊺, using the next free circled number (㊻). Use the measured values from Step 1:

`| ㊻ | **Seven findings outside ㊵, from its design review (2026-10-01)** | ① faithful ch01's ChemWeb, SciMethod and Archer2_img are older TrueType copies, and vefur serves faithful over mt-preview; ② the faithful ch03 page 3-1 gives ibuprofenmass an English alt; ③ `generate-image-mapping.js` drops unknown flags (a `--dryrun` typo writes), rewrites an unreadable mapping as `[]`, collapses rows without `originalImage` (biology 34 → 1) and writes non-atomically; ④ `tools/lib/parseArgs.js` reads `--apply=false` as true; ⑤ `LICENSE`'s font paragraph says every tracked `@font-face` SVG embeds the OFL woff2 subset, while <N from Step 1> embed TrueType (the ㊵ work removes 30); ⑥ `figure-run.js`'s report does not say a hole still has a live June copy; ⑦ `docs/plans/2026-09-09-raster-figure-manual-replacement.md` omits the re-inject the swap needs | re-measured 2026-10-01, commands in the ㊵ plan's Task 11 | open, logged — ①② go with the [LEAD] faithful-overlay ruling; ③④⑥⑦ are [CODE] nits for the batch triage; ⑤ is a legal text, so [USER] decides the wording |`

- [ ] **Step 4: Commit**

```bash
git add docs/plans/2026-07-21-post-item17-followup-campaign.md
git commit -m "docs(register): §C140 ㊵ tools built; ㊻ logs seven findings outside ㊵, each re-measured

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: Verify the branch, review it adversarially, open the PR

**Files:** none. This task verifies, reviews and publishes.

- [ ] **Step 1: The full local gate, the way CI runs it**

Run: `npm test 2>&1 | tail -5; echo "exit=${PIPESTATUS[0]}"`
Expected: `exit=0`. Read the summary line. The pipe's exit code is not the suite's, which is why `PIPESTATUS` is used.

Run: `npm run lint && npm run format:check && npm run docs:check; echo "exit=$?"`
Expected: `exit=0`. If `format:check` fails on new JS, run `npx prettier --write <the files>` and commit.

Run: `cd experiments/figure-text-translation && for t in test_sources.py test_figure_prepare.py test_compose_runexact.py; do FIGTEXT_PYLIBS=./pylibs python3 -u $t > /tmp/claude-1000/c40-final-$t.log 2>&1; echo "$t exit=$? $(tail -1 /tmp/claude-1000/c40-final-$t.log)"; done; cd -`
Expected: each prints `exit=0 ALL PASS`.

Run: `git status --porcelain`
Expected: empty.

- [ ] **Step 2: An adversarial review and a mutation pass (Workflow)**

Run a review workflow over `git diff main...HEAD` with four lenses: the resolver order and pins (Python); the retire tool's deletion safety (`--retire` and `--prune`); the corpus and reference predicate; and test vacuity. Give each lens an independent verifier that tries to refute its findings. Then run a mutation pass over these guards, restoring from a golden `cp`, never `git checkout`, and comparing with `cmp` after every round:
- in `sources.py`: the retired-first order, `_files_under`'s ambiguous fold, and the duplicate-target check;
- in `figure-config-validate.js`: each rule;
- in the tool: each refusal in `planRetire`, the rollback in `applyRetire`, and every condition in `planPrune`.

Every mutant must be killed by a test. A survivor means a test to add. Agents stay read-only on the tree, and you run `git status --porcelain` when they finish. Fix confirmed findings in follow-up commits, with tests.

- [ ] **Step 3: Push and open the PR, after [USER]'s go-ahead**

Ask [USER] before pushing. Then:

```bash
git push -u origin feat/c140-c40-retire-and-alias
gh pr create --title "feat(figures): §C140 ㊵ — retired record, retire tool, artwork pins (code only)" --body-file <a body that lists the commits, the measured controls, what the PR does NOT do, and ends with the 🤖 Generated with [Claude Code](https://claude.com/claude-code) line>
```

Then record the PR number in the register's ㊵ row and RESUME block, as a docs commit on the same branch.
