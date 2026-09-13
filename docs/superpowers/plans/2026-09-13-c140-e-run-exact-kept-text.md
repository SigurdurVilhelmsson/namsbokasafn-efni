# §C140 ① E — draw English-kept figure text run-exact — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `compose.py` draws every block it keeps in English exactly as the source drew it (each run at its own origin, size, rotation, fill and face), then the 34 figures bought 2026-09-12 are recomposed at 0 ISK and [USER] looks at them before merge.

**Architecture:** Pure decisions live beside the rules they belong to — the wire text in `blockkey.py`, identity / face / placeholder removal in `figtext.py` — each unit-tested alone. `compose.py` gains one decision (`kept`) and one draw path (`draw_run_exact`); translated blocks keep today's path untouched. `svgout.py` gains italic faces. `COMPOSER_VERSION` → `'2'` makes the existing driver recompose every sidecar with `--stale`.

**Tech Stack:** Python 3 (pycairo, fontTools, pdfplumber from the gitignored `pylibs/`), plain-assert test scripts (no pytest), Node 22 driver `tools/figure-run.js`, Vitest for the JS side, Playwright Chromium via `render-check.mjs`.

**Spec:** [`docs/superpowers/specs/2026-09-13-c140-e-run-exact-kept-text-design.md`](../specs/2026-09-13-c140-e-run-exact-kept-text-design.md) — read it before any task. Evidence: `experiments/figure-text-translation/COMPOSE-FIDELITY.md`.

## Global Constraints

- **Branch:** `feat/c140-e-run-exact-kept-text`. **Unchanged baseline commit `BASE = b805d64f`** (compose/svgout/figtext/blockkey are byte-identical there to `main`).
- **Working directory for every Python command:** `experiments/figure-text-translation/` (call it `EXP`), with `FIGTEXT_PYLIBS=./pylibs`. Use `python3 -u` for anything that runs longer than a few seconds.
- **Scratch root:** `export SCRATCH=/tmp/claude-1000/-home-siggi-dev-repos-namsbokasafn-efni/6e86c963-0346-4f9d-9a80-00bb96f92a1f/scratchpad` at the start of every shell command that uses it (shell state does not persist between tool calls). `/tmp` is a ~4.9 GB tmpfs — delete prepared figure directories as soon as their numbers are recorded.
- **Where the code in this plan came from:** every plant, the E implementation and both controls were run in scratch against the unchanged and the changed composer before this plan was written (2026-09-13): all 8 preconditions held, E1-E8's RED predictions failed on unchanged code and passed on E, C1 was byte-identical, C2/C3 structurally identical (byte-identical with the clock pinned), and the only existing Python case E breaks is 9p. That is evidence the code is right, not a substitute for running each step.
- **Nothing under `books/` is written before Task 8**, and there only by `tools/figure-run.js`. `books/*/01-source/` is never touched.
- **No MT, no spend:** never run `tools/figure-run.js` without `--stale`; never run `translate-blocks.mjs`.
- **Test style:** plain asserts through a `check(label, ok, detail)` function and a module-level `fails` list; the file ends by printing `ALL PASS` or `N FAILED: …` and `sys.exit(1 if fails else 0)`. `HERE = Path(__file__).resolve().parent` — never `process.cwd()` / `os.getcwd()`.
- **Every new assertion is run against the code that does not yet implement it, and seen RED, before the implementation step.**
- **`grep -a`** for every census in this tree (NUL-bearing files).
- **Baselines (recorded at `0c339b9d`, docs-only since):** Python — all 10 `test_*.py` in `EXP` print `ALL PASS`. JS — `npx vitest run --reporter=json` fails **36 assertions in 13 files**, by name in `SCRATCH/baseline-main/js-failing-by-name.txt`.
- **Mutation-probe restore rule:** before mutating any file to prove a test can fail, `cp` it to a golden copy; restore from that copy (never `git checkout --`), `cmp` after every round and at the end; `git status --porcelain` whenever an agent that mutates files goes quiet.
- **Commit messages** end with the two attribution lines:
  `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>` and
  `Claude-Session: https://claude.ai/code/session_01W11kXYeK3JsWvW7Fv4QP4X`.
- **[USER] facts for this plan:** no figure has been approved or edited in the prod review panel (asked 2026-09-13); the spec is approved.

---

## File Structure

| file | change | responsibility |
|---|---|---|
| `EXP/blockkey.py` | modify | + `block_english(block)` — the wire text, beside `block_key` |
| `EXP/emit-blocks.py`, `EXP/census.py`, `EXP/test_sendable.py`, `EXP/test_make_fixture.py` | modify | import `block_english` instead of restating the rule |
| `EXP/figtext.py` | modify | + `is_identity`, `run_face`, `run_draw_text`; − `strip_undecodable` |
| `EXP/compose.py` | modify | `kept` decision, `draw_run_exact`, report `identity`/`runExact`, degenerate warning split, docstrings |
| `EXP/svgout.py` | modify | faces keyed `(bold, italic)`, `font-style` |
| `EXP/test_figtext_runexact.py` | **create** | T1 — the pure helpers |
| `EXP/test_compose_runexact.py` | **create** | T2 — planted fixture, preconditions, controls, RED assertions (a sibling file rather than growing the 954-line `test_figure_compose.py`) |
| `EXP/fixtures/compose-runexact-golden.json` | **create** | controls' goldens, captured from the UNCHANGED composer |
| `EXP/test_figure_compose.py` | modify | `regenerate_blocks` uses `block_english`; 9i/9j retarget; 9p re-pin + 9q pair |
| `tools/lib/figure-text-sidecar.cjs` | modify | `COMPOSER_VERSION` `'1'` → `'2'` |
| `books/efnafraedi-2e/media/*_IS.svg`, `books/efnafraedi-2e/figure-text/*.is.json` | data (Task 8) | 34 recomposed figures + restamped sidecars |
| `EXP/evidence/2026-09-13-e-build/VERIFICATION.md` | **create** (Task 7) | T3 numbers, frozen |
| `EXP/README.md`, `EXP/REGISTER.md`, campaign register, memory | modify (Task 10) | docs |

---

### Task 1: `blockkey.block_english` — the wire text becomes one rule

**Files:**
- Modify: `EXP/blockkey.py` (append after `block_key`)
- Modify: `EXP/emit-blocks.py:23` (import) and `:46` (`joined = …`)
- Modify: `EXP/census.py:20` (import) and `:89-91` (`blocktext`)
- Modify: `EXP/test_sendable.py:220-221`
- Modify: `EXP/test_make_fixture.py:32` (import) and `:63`
- Modify: `EXP/test_figure_compose.py:696` (import) and `:707`
- Create: `EXP/test_figtext_runexact.py`

**Interfaces:**
- Consumes: `figtext.is_arc(block)`, `blockkey.block_key(block)`, `blockkey.block_lines(block)` (existing).
- Produces: `blockkey.block_english(block) -> str` — `block_key(block)` when `FT.is_arc(block)`, else `' '.join(block_lines(block))`.

- [ ] **Step 1: Record the fixture's `blocks.json` before any change (byte-identity control)**

```bash
cd experiments/figure-text-translation
mkdir -p "$SCRATCH/t1"
python3 figure-prepare.py fixtures/fixture_figure.pdf --basename CNX_Fixture_T1 --out "$SCRATCH/t1/before"
```
Expected: exit 0; `$SCRATCH/t1/before/blocks.json` exists with 4 entries.

- [ ] **Step 2: Write the failing test file**

Create `EXP/test_figtext_runexact.py`:

```python
#!/usr/bin/env python3
"""E's pure decisions, tested alone (spec §C140 ① T1).

    FIGTEXT_PYLIBS=./pylibs python3 test_figtext_runexact.py

Plain asserts and a module-level `fails` list, like test_figtext_normalise.py - there is
no pytest in this tree.

WHAT IS PINNED
--------------
* `blockkey.block_english` - what emit-blocks.py SENT. It is the other half of "what was
  bought" (the key is the first), so it lives beside `block_key` and every consumer imports
  it. 🔴 THE DEGENERATE-ARC CASE IS THE REASON IT EXISTS: the 2a prototype derived the wire
  text from compose.py's own `arc`, which also requires a usable circle, while emit-blocks.py
  decides with `FT.is_arc` alone - so on a multi-line degenerate arc the prototype compared
  a reply against a string that was never sent.
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent          # never process.cwd() - repo rule
sys.path.insert(0, str(HERE))

import _deps  # noqa: F401,E402 - puts this directory and FIGTEXT_PYLIBS on sys.path
import figtext as FT                            # noqa: E402
import blockkey as BK                           # noqa: E402

fails = []


def check(label, ok, detail=''):
    print(f"  {'PASS' if ok else 'FAIL'}  {label}" + (f": {detail}" if detail else ''),
          flush=True)
    if not ok:
        fails.append(label)


def run(text, x, y, size=12.0, rot=0.0, font='PAGE/F1'):
    return dict(text=text, font=font, size=size, rot=rot, x=x, y=y,
                adv=0.6 * size * len(text), fill=None)


# ── 1. block_english ────────────────────────────────────────────────────────────────
straight = [run('Mass of', 10, 100), run('reactant', 10, 100 - 12 * 1.222)]
check('1a PRECONDITION the straight block is two lines and not an arc',
      len(FT.lines(straight)) == 2 and not FT.is_arc(straight), repr(FT.lines(straight)))
check('1b a straight multi-line block sends its lines joined by ONE space',
      BK.block_english(straight) == 'Mass of reactant', repr(BK.block_english(straight)))

curved = [run('A', 10, 100, rot=10), run('B', 20, 99, rot=0),
          run('C', 30, 99, rot=-10), run('D', 40, 100, rot=-20)]
check('1c PRECONDITION the curved block is an arc',
      FT.is_arc(curved), repr([r['rot'] for r in curved]))
check('1d an arc sends its key - the bare concatenation',
      BK.block_english(curved) == BK.block_key(curved) == 'ABCD',
      repr(BK.block_english(curved)))

# Four single glyphs on TWO straight lines: is_arc says arc (len > 3, every run <= 1 char),
# although no circle fits. emit-blocks.py sends the key.
degen = [run('a', 10, 100), run('b', 20, 100),
         run('c', 10, 100 - 12 * 1.222), run('d', 20, 100 - 12 * 1.222)]
check('1e PRECONDITION the degenerate block is is_arc AND spans two lines',
      FT.is_arc(degen) and len(FT.lines(degen)) == 2, repr(BK.block_lines(degen)))
check('1f a degenerate multi-line arc sends its KEY, not its space-joined lines',
      BK.block_english(degen) == 'abcd', repr(BK.block_english(degen)))
check('1g CONTROL the space-joined form really differs here (the prototype\'s miss)',
      ' '.join(BK.block_lines(degen)) == 'ab cd', repr(' '.join(BK.block_lines(degen))))

print(f"\n{'ALL PASS' if not fails else str(len(fails)) + ' FAILED: ' + ', '.join(fails)}")
sys.exit(1 if fails else 0)
```

- [ ] **Step 3: Run it and see it fail**

Run: `FIGTEXT_PYLIBS=./pylibs python3 -u test_figtext_runexact.py`
Expected: traceback `AttributeError: module 'blockkey' has no attribute 'block_english'` at check 1b.

- [ ] **Step 4: Implement `block_english`**

Append to `EXP/blockkey.py`:

```python


def block_english(block):
    """What emit-blocks.py SENT for this block - the MT wire text.

    An ARC (FT.is_arc) sends its key, the bare concatenation of its glyphs; every other block
    sends its lines joined by ONE space - the MT unit is the LABEL, not the line.

    ⚠️ THE SAME `FT.is_arc` AS `block_key`, DELIBERATELY NOT compose.py's `arc`, which also
    requires a usable circle. The question this answers is what went on the wire, and a
    degenerate arc went on the wire as its bare concatenation. compose.py asks it to decide
    IDENTITY (`figtext.is_identity`); deriving the wire from its own `arc` compared a reply
    against a string that was never sent (spec §C140 ①, component 1).
    """
    if FT.is_arc(block):
        return block_key(block)
    return ' '.join(block_lines(block))
```

- [ ] **Step 5: Run the test**

Run: `FIGTEXT_PYLIBS=./pylibs python3 -u test_figtext_runexact.py`
Expected: `ALL PASS` (7 checks).

- [ ] **Step 6: Point every restatement of the rule at it**

`EXP/emit-blocks.py` — line 23 and line 46:
```python
from blockkey import block_key, block_lines, block_english
```
```python
    joined = block_english(b)                     # the MT unit is the LABEL, not the line
```
(Keep `arc = FT.is_arc(b)` on line 43 — it is still written into each entry.)

`EXP/census.py` — line 20 becomes `from blockkey import block_key, block_english`, and `blocktext` (lines 89-91) becomes:
```python
    def blocktext(b):
        return block_english(b)
```

`EXP/test_sendable.py` — lines 220-221 become:
```python
            _joined = block_english(_b)
```
and add `block_english` to the `from blockkey import …` that supplies `block_key`/`block_lines` in that section (re-derive with `grep -an "from blockkey" test_sendable.py`).

`EXP/test_make_fixture.py` — add after line 32:
```python
from blockkey import block_english  # noqa: E402  - the wire rule itself, never a copy
```
and line 63 becomes:
```python
        joined = block_english(b)
```

`EXP/test_figure_compose.py` — in `regenerate_blocks` (line 696) import `block_english` alongside `block_key, block_lines`, and line 707 becomes:
```python
        joined = block_english(b)
```

Then confirm nothing else restates it:
Run: `grep -an "if arc else ' '.join\|is_arc(b) else\|is_arc(_b)" *.py | grep -v pylibs`
Expected: only `blockkey.py`'s own body (no other hit).

- [ ] **Step 7: Prove the refactor is behaviour-identical**

```bash
python3 figure-prepare.py fixtures/fixture_figure.pdf --basename CNX_Fixture_T1 --out "$SCRATCH/t1/after"
cmp "$SCRATCH/t1/before/blocks.json" "$SCRATCH/t1/after/blocks.json" && echo BLOCKS-IDENTICAL
```
Expected: `BLOCKS-IDENTICAL`. (The real-figure byte-identity over 34 figures is Task 7.)

- [ ] **Step 8: Run the affected suites**

Run each: `FIGTEXT_PYLIBS=./pylibs python3 -u test_sendable.py`, `test_make_fixture.py`, `test_figure_compose.py`, `test_blockkey_consumers.py`, `test_figtext_out.py`, `test_figtext_runexact.py`.
Expected: every one prints `ALL PASS`. Then `rm -rf "$SCRATCH/t1"`.

- [ ] **Step 9: Commit**

```bash
git add experiments/figure-text-translation/{blockkey.py,emit-blocks.py,census.py,test_sendable.py,test_make_fixture.py,test_figure_compose.py,test_figtext_runexact.py}
git commit -m "refactor(figures): the MT wire text is one rule, beside block_key

blockkey.block_english is what emit-blocks.py sent; five inline copies now
import it. Behaviour-identical (fixture blocks.json byte-equal). It exists
for E's identity test: the prototype derived the wire from compose's own
arc flag, which disagrees with emit on a multi-line degenerate arc.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01W11kXYeK3JsWvW7Fv4QP4X"
```

---

### Task 2: `figtext` helpers — identity, face, placeholder removal

**Files:**
- Modify: `EXP/figtext.py` (append at end of file)
- Modify: `EXP/test_figtext_runexact.py` (append sections 2-4 before the final summary lines)

**Interfaces:**
- Consumes: `figtext.normalise_block_value(value, arc)`, `figtext._CID_TOKEN` (existing); `readlayer.CID` (test only).
- Produces:
  - `figtext.is_identity(value, english, arc) -> bool` — `value` is the RAW translations entry (str or legacy list), `english` is `blockkey.block_english(block)`, `arc` is compose.py's draw-shape decision.
  - `figtext.run_face(run, fonts) -> (bold: bool, italic: bool)` — `fonts` is `meta['fonts']`.
  - `figtext.run_draw_text(run) -> (text: str, token_removed: bool)`.

- [ ] **Step 1: Append the failing tests**

Insert before the final `print(f"\n{'ALL PASS' …` line of `EXP/test_figtext_runexact.py`:

```python
# ── 2. is_identity ──────────────────────────────────────────────────────────────────
check('2a a multi-line reply equal to what was sent is identity',
      FT.is_identity('Mass of reactant', 'Mass of reactant', False))
check('2b ... also when the reply is a LEGACY list of lines',
      FT.is_identity(['Mass of', 'reactant'], 'Mass of reactant', False))
check('2c whitespace is not content: a collapsed arrow gap is still identity',
      FT.is_identity('HCl(g) HCl(aq)', 'HCl(g)          HCl(aq)', False))
check('2d edge whitespace is not content (translate-blocks.mjs .trim()s the reply)',
      FT.is_identity('  Mass of reactant ', 'Mass of reactant', False))
check('2e an arc reply equal to its key is identity',
      FT.is_identity('ABCD', 'ABCD', True))
check('2f CONTROL a prefixed reply is NOT identity',
      not FT.is_identity('X Mass of reactant', 'Mass of reactant', False))
check('2g CONTROL one extra character is NOT identity',
      not FT.is_identity('Mass of reactants', 'Mass of reactant', False))
check('2h CONTROL a real translation is NOT identity',
      not FT.is_identity('Massi hvarfefnis', 'Mass of reactant', False))

# ── 3. run_face ─────────────────────────────────────────────────────────────────────
FONTS = {
    'R': {'base': '/ABCDEF+LiberationSans'},
    'B': {'base': '/LiberationSans-Bold'},
    'I': {'base': '/ABCDEF+LiberationSans-Italic'},
    'BI': {'base': '/LiberationSans-BoldItalic'},
    'O': {'base': '/Helvetica-Oblique'},
    'Bold': {'base': '/ABCDEF+Helvetica'},     # a RESOURCE name that lies
}
for key, want in (('R', (False, False)), ('B', (True, False)), ('I', (False, True)),
                  ('BI', (True, True)), ('O', (False, True))):
    got = FT.run_face({'font': key}, FONTS)
    check(f'3 {key}: the face comes from the BaseFont', got == want, f'{got!r} want {want!r}')
got = FT.run_face({'font': 'Bold'}, FONTS)
check('3f the RESOURCE name is never read (a key called "Bold" with a regular base)',
      got == (False, False), repr(got))
got = FT.run_face({'font': 'MISSING'}, FONTS)
check('3g a font absent from meta.fonts draws Regular rather than raising',
      got == (False, False), repr(got))

# ── 4. run_draw_text ────────────────────────────────────────────────────────────────
got = FT.run_draw_text({'text': '(cid:127) 5% or less'})
check('4a a placeholder is removed and flagged; the edge space it leaves is KEPT',
      got == (' 5% or less', True), repr(got))
got = FT.run_draw_text({'text': 'Mass of '})
check('4b a trailing space is a glyph position: unchanged and NOT flagged',
      got == ('Mass of ', False), repr(got))
got = FT.run_draw_text({'text': '(cid:127)'})
check('4c a run that is nothing but a placeholder becomes empty, flagged',
      got == ('', True), repr(got))
import readlayer as RL                          # noqa: E402 - pdfplumber via FIGTEXT_PYLIBS
probe = f'{RL.CID}42) y'
got = FT.run_draw_text({'text': probe})
check("4d DRIFT GUARD the remover matches everything readlayer's DETECTOR finds",
      RL.CID in probe and got == (' y', True), f'{probe!r} -> {got!r}')
```

- [ ] **Step 2: Run and see it fail**

Run: `FIGTEXT_PYLIBS=./pylibs python3 -u test_figtext_runexact.py`
Expected: section 1 passes, then `AttributeError: module 'figtext' has no attribute 'is_identity'`.

- [ ] **Step 3: Implement the helpers**

Append to `EXP/figtext.py`:

```python


def is_identity(value, english, arc):
    """Did the MT give back what went on the wire?

    `value` is the RAW translations entry (a str, or a legacy list of lines); `english` is
    `blockkey.block_english(block)` - what emit-blocks.py SENT; `arc` is compose.py's
    draw-shape decision, used only to shape `value` the way the composer would draw it.

    TOKEN equality, not byte equality, and that is the equivalence already in force:
    `translate-blocks.mjs` `.trim()`s every reply, and compose.py's translated path reads a
    value only through `para.split()`, so two token-equal values already drew identically.

    🔴 AN IDENTITY BLOCK STAYS IN compose-report `translated`. It was bought, and
    `figure-compose.py` assertion 2 requires `missing` to equal exactly the `send:false`
    keys - moving it would refuse a correct figure. It is ALSO listed in `identity`, and
    drawn run-exact, because re-laying English it could draw exactly is the defect E fixes.

    Callers decide identity only AFTER the empty/whitespace check: an empty value is
    `missing`, never identity.
    """
    shaped = normalise_block_value(value, arc)
    text = shaped if arc else ' '.join(shaped)
    return text.split() == english.split()


def run_face(run, fonts):
    """(bold, italic) for ONE run, from that run's own BaseFont.

    `fonts` is `meta['fonts']`. The base looks like `/ABCDEF+LiberationSans-Italic`: the
    leading '/' and a subset prefix are dropped before matching. 'oblique' counts as italic
    (Helvetica names its slanted face that way).

    ⚠️ NEVER KEY ON THE RESOURCE NAME (`/TT0`, `/R9`, `PAGE/F1`) - it is per file. The same
    rule as compose.py's BOLD set.

    ⚠️ A font key absent from `fonts` draws REGULAR rather than raising. `runs.json` and
    `meta.json` out of step is a plumbing fault that `sendable` (`missing_fonts`) already
    reports and holds back from the MT, so such a block only ever reaches the composer as
    kept English - failing the whole figure over it would turn a report into a lost figure.
    """
    base = fonts.get(run['font'], {}).get('base', '')
    name = base.lstrip('/').split('+')[-1].lower()
    return ('bold' in name, 'italic' in name or 'oblique' in name)


def run_draw_text(run):
    """(text, token_removed) for ONE run that is about to be DRAWN run-exact.

    Removes pdfminer's `(cid:N)` placeholders with `_CID_TOKEN`, the one remover regex, and
    nothing else. `token_removed` is `text != run['text']`.

    🔴 A PLACEHOLDER IS NEVER READER-FACING CONTENT, AND THE DRAW SITE IS THE ONLY PLACE IT
    CAN REACH A READER. A block whose own text did not decode is held back from the MT by
    `sendable`, so it is KEPT - and `strip-text.py` has already removed every glyph from the
    artwork, so the label is redrawn from this text or not at all. Measured 2026-09-07 on
    CNX_Chem_05_02_FoodLabel: two live `<text>` elements reading `(cid:127) 5% or less`
    under the driver's VERDICT ok.

    ⚠️ IT IS NOT DONE AT EXTRACTION, DELIBERATELY: the token is the POSITIVE EVIDENCE the hold
    is keyed on (`readlayer._looks_undecoded`); removing it upstream would make an
    undecodable block read as clean prose and send it to the paid MT.

    ⚠️ NO `.strip()`. A run's edge spaces are glyph POSITIONS the source typed. The `.strip()`
    in the remover this replaces named 19 keys in 8 figures as undecodable when they carried
    no `(cid:` at all, only an edge space (COMPOSE-FIDELITY.md). A run that becomes '' is
    skipped by the caller.

    ⚠️ The glyphs after a removed token keep the run's origin, so they sit one token-width
    left of where the source drew them. Accepted: 0 such runs in the 34 bought figures, and
    the block is named in compose-report `undecodable`.
    """
    text = _CID_TOKEN.sub('', run['text'])
    return text, text != run['text']
```

- [ ] **Step 4: Run the tests**

Run: `FIGTEXT_PYLIBS=./pylibs python3 -u test_figtext_runexact.py` and `FIGTEXT_PYLIBS=./pylibs python3 -u test_figtext_normalise.py`
Expected: both `ALL PASS`.

- [ ] **Step 5: Commit**

```bash
git add experiments/figure-text-translation/{figtext.py,test_figtext_runexact.py}
git commit -m "feat(figures): identity, face and placeholder helpers for run-exact drawing

is_identity (token-equal to the wire), run_face (BaseFont, never the
resource name), run_draw_text (removes (cid:N), keeps edge spaces). Not yet
called; compose.py adopts them in the next commit.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01W11kXYeK3JsWvW7Fv4QP4X"
```

---

### Task 3: T2 harness — planted fixture, preconditions, controls and goldens from the UNCHANGED composer

**Files:**
- Create: `EXP/test_compose_runexact.py`
- Create: `EXP/fixtures/compose-runexact-golden.json` (written by the file's `--capture-golden` mode)

**Interfaces:**
- Consumes: `blockkey.block_english/block_key/block_lines` (Task 1); `figure-prepare.py` and `compose.py` CLIs (existing).
- Produces (used by Tasks 4-5, which append assertions to this file before its `finish()` call): module-level names `out_dir: Path`, `rep: dict` (compose-report), `els: list[(text, attrs_dict, raw_element_str)]`, `svg: str`, `RUNS: list` (planted runs), `PAGE_H = 220.0`, helpers `elements(svg)`, `faces(svg)`, `find(els, text, **attrs)`, `check`, `finish()`.

- [ ] **Step 1: Create the harness**

Create `EXP/test_compose_runexact.py`:

```python
#!/usr/bin/env python3
"""E, end to end: kept blocks drawn run-exact, translated blocks untouched (spec §C140 ① T2).

    FIGTEXT_PYLIBS=./pylibs python3 test_compose_runexact.py
    FIGTEXT_PYLIBS=./pylibs python3 test_compose_runexact.py --capture-golden

`--capture-golden` is run ONCE, on the UNCHANGED composer, and refuses to run on a composer
whose report carries `runExact`. The controls then compare the changed composer against it.

WHY PLANTED RUNS AND NOT THE COMMITTED PDF
------------------------------------------
The committed fixture has four one-run, one-line, 12 pt labels in one font. Every defect E
fixes needs something it lacks - a subscript, an italic face, a typed arrow gap, a multi-run
line, an arc - so they are planted into `runs.json`/`meta.json` after `figure-prepare.py`,
and `blocks.json` is re-derived with the real rules (test_figure_compose.py case 9's
pattern). The committed PDF is not regenerated.

🔴 A PLANT IS NOT WHAT ITS DESCRIPTION SAYS UNTIL ITS PRECONDITION PASSED. `figtext.group`
silently re-classifies a run that falls outside a clause's limits: a subscript shifted too far
becomes its own block, and a lone block is ALREADY drawn at its own size and origin by the
unchanged composer - so an assertion about it passes on the code it is meant to catch. Every
plant is checked against `blocks.json` / the report first, and the file stops on a failure.

🔴 THE CLOCK IS PINNED. fontTools writes the current time into `head.modified` of every woff2
subset in the `<style>` block, so two runs of the SAME composer differ in bytes. The child
inherits SOURCE_DATE_EPOCH, and the face control compares STRUCTURE (rule count, ordered
weight/style, decoded character set) rather than bytes anyway.

🔴 THE CONTROLS ARE WHAT MAKE THE RED ASSERTIONS MEAN ANYTHING. A composer that drew every
block run-exact - translations included - passes every "kept block is exact" assertion. The
translated-population control forbids that.
"""
import base64
import collections
import io
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
os.environ['SOURCE_DATE_EPOCH'] = '1700000000'  # BEFORE any child is spawned - see docstring

import figtext as FT                                          # noqa: E402
from blockkey import block_key, block_lines, block_english    # noqa: E402
from fontTools.ttLib import TTFont                            # noqa: E402

PREPARE = HERE / 'figure-prepare.py'
COMPOSE = HERE / 'compose.py'
FIXTURE = HERE / 'fixtures' / 'fixture_figure.pdf'
GOLDEN = HERE / 'fixtures' / 'compose-runexact-golden.json'
CAPTURE = '--capture-golden' in sys.argv
PAGE_H = 220.0

K_OBS, K_HYP, K_TEST, K_VERBATIM = ('Observation and curiosity', 'Form a hypothesis',
                                    'Test the hypothesis', 'H2O (g)')
K_GAP, K_EDGE, K_KARC, K_TARC = 'H2O(l)          H2O(g)', '25 mL ', '1+2=3', 'CURVE'
TR = {K_OBS: 'Athugun og forvitni', K_HYP: K_HYP,       # K_HYP is the IDENTITY reply
      K_TEST: 'Profa tilgatuna', K_TARC: 'BOGIX'}
# Every element of the translated population - text found NOWHERE else in the figure.
POPULATION = ('Athugun og forvitni', 'Profa tilgatuna', 'B', 'O', 'G', 'I', 'X')

# Helvetica advance widths (1/1000 em) for the planted glyphs - the fixture's font.
HELV = {'H': 722, '2': 556, 'O': 778, ' ': 278, '(': 333, 'g': 556, ')': 333,
        'F': 611, 'o': 556, 'r': 333, 'm': 833, 'a': 556}
FILL = ['cmyk', 0.75, 0.5, 0.0, 0.2]
RED = ['cmyk', 0.0, 1.0, 1.0, 0.0]

fails = []


def check(label, ok, detail=''):
    print(f"  {'PASS' if ok else 'FAIL'}  {label}" + (f": {detail}" if detail else ''),
          flush=True)
    if not ok:
        fails.append(label)


def finish():
    print(f"\n{'ALL PASS' if not fails else str(len(fails)) + ' FAILED: ' + ', '.join(fails)}")
    sys.exit(1 if fails else 0)


def adv(text, size):
    return round(sum(HELV[c] for c in text) * size / 1000.0, 3)


def run(text, x, y, size=12.0, rot=0.0, font='PAGE/F1', fill=FILL, a=0.0):
    c, s = math.cos(math.radians(rot)), math.sin(math.radians(rot))
    return dict(text=text, font=font, size=size, rot=rot, x=x, y=y, adv=a, fill=fill,
                tm=[c, s, -s, c, x, y])


def arc_runs(glyphs, cx, cy, radius=60.0, size=12.0):
    """Single glyphs at 10-degree steps on a real circle, reading left to right along the
    top, each rotated to the tangent: figtext.group's arc clause needs equal sizes,
    |drot| < 12 and centre distance < 1.6*size (2*60*sin 5deg = 10.46 < 19.2)."""
    out = []
    for i, g in enumerate(glyphs):
        th = 100.0 - 10.0 * i
        x = round(cx + radius * math.cos(math.radians(th)), 3)
        y = round(cy + radius * math.sin(math.radians(th)), 3)
        out.append(run(g, x, y, size=size, rot=th - 90.0, a=round(0.6 * size, 3)))
    return out


def run_prepare(out_dir, basename):
    env = dict(os.environ)
    env.pop('FIGTEXT_OUT', None)
    return subprocess.run([sys.executable, str(PREPARE), str(FIXTURE), '--basename', basename,
                           '--out', str(out_dir)], capture_output=True, text=True, env=env)


def run_compose(out_dir, tr_path):
    env = dict(os.environ)
    env['FIGTEXT_OUT'] = str(out_dir)
    return subprocess.run([sys.executable, str(COMPOSE), '--translations', str(tr_path), '--svg'],
                          capture_output=True, text=True, env=env, cwd=str(HERE))


def derive_blocks(out_dir):
    """blocks.json from runs.json/meta.json with the REAL rules, as emit-blocks.py does."""
    runs = json.loads((out_dir / 'runs.json').read_text())
    fonts = json.loads((out_dir / 'meta.json').read_text())['fonts']
    blocks = FT.merge_blocks(FT.group(runs))
    entries = []
    for b in blocks:
        entries.append(dict(key=block_key(b), english=block_english(b), lines=block_lines(b),
                            arc=FT.is_arc(b), send=FT.sendable(b, block_english(b), fonts)))
    (out_dir / 'blocks.json').write_text(json.dumps(entries, indent=1, ensure_ascii=False))
    return blocks, entries


def elements(svg_text):
    """[(text, attrs, raw element)] in document order."""
    out = []
    for m in re.finditer(r'<text ([^>]*)>([^<]*)</text>', svg_text):
        out.append((m.group(2), dict(re.findall(r'([\w:-]+)="([^"]*)"', m.group(1))),
                    m.group(0)))
    return out


def faces(svg_text):
    """[(weight, style, sorted characters)] - the <style> block's STRUCTURE."""
    out = []
    for w, st, b64 in re.findall(
            r"@font-face\{font-family:'FigIS';font-weight:(\d+);font-style:(\w+);"
            r"src:url\(data:font/woff2;base64,([^)]+)\)", svg_text):
        font = TTFont(io.BytesIO(base64.b64decode(b64)))
        out.append([w, st, ''.join(sorted(chr(c) for c in font.getBestCmap()))])
    return out


def find(els, text, **attrs):
    return [e for e in els if e[0] == text
            and all(e[1].get(k.replace('_', '-')) == v for k, v in attrs.items())]


def plant(out_dir):
    runs = json.loads((out_dir / 'runs.json').read_text())
    meta = json.loads((out_dir / 'meta.json').read_text())
    meta['fonts']['PAGE/F2'] = dict(meta['fonts']['PAGE/F1'],
                                    base='/ABCDEF+LiberationSans-Italic')
    planted = []
    for r in runs:
        if r['text'] == K_HYP:
            # IDENTITY: one line of TWO runs (a mid-line fill split). A one-run line - and a
            # multi-LINE block of one-run lines at 1.222 leading - is already drawn at its
            # source origin by the unchanged composer, which would make the positional
            # assertion pass on the code it exists to catch.
            a1 = adv('Form a ', 12)
            planted.append(run('Form a ', 10.0, 120.0, a=a1))
            planted.append(run('hypothesis', 10.0 + a1, 120.0, fill=RED,
                               a=round(r['adv'] - a1, 3)))
        elif r['text'] == K_VERBATIM:
            # SUBSCRIPT + ITALIC: shift 3 < 0.45*12, ratio 8/12 in [0.4, 2.5], gaps 0.
            a_h, a_2, a_o = adv('H', 12), adv('2', 8), adv('O ', 12)
            x2 = 10.0 + a_h
            xo = round(x2 + a_2, 3)
            xg = round(xo + a_o, 3)
            planted += [run('H', 10.0, 40.0, a=a_h),
                        run('2', round(x2, 3), 37.0, size=8.0, a=a_2),
                        run('O ', xo, 40.0, a=a_o),
                        run('(g)', xg, 40.0, font='PAGE/F2', a=adv('(g)', 12))]
        else:
            planted.append(r)
    planted.append(run(K_GAP, 10.0, 200.0, a=150.0))            # ARROW GAP - verbatim
    planted.append(run(K_EDGE, 200.0, 200.0, a=40.0))           # EDGE SPACE - verbatim
    planted += arc_runs(list(K_KARC), 230.0, 100.0)             # KEPT ARC - verbatim
    planted += arc_runs(list(K_TARC), 230.0, 20.0)              # TRANSLATED ARC - prose
    (out_dir / 'runs.json').write_text(json.dumps(planted, ensure_ascii=False))
    (out_dir / 'meta.json').write_text(json.dumps(meta, ensure_ascii=False))
    return planted


def compose_fixture(tmp, name, mutate, translations):
    """prepare -> mutate(out) -> derive blocks -> compose. -> (out, blocks, entries, report, svg)"""
    out = Path(tmp) / name
    prep = run_prepare(out, 'CNX_Fixture_' + name)
    check(f'{name}: PRECONDITION prepare exits 0', prep.returncode == 0,
          f'exit {prep.returncode}: {prep.stderr.strip()[-400:]}')
    if prep.returncode != 0:
        finish()
    extra = mutate(out) if mutate else None
    blocks, entries = derive_blocks(out)
    tr = Path(tmp) / f'{name}-tr.json'
    tr.write_text(json.dumps({'blocks': translations}, ensure_ascii=False))
    c = run_compose(out, tr)
    check(f'{name}: PRECONDITION compose exits 0 and writes its report + SVG',
          c.returncode == 0 and (out / 'compose-report.json').exists()
          and (out / 'translated.svg').exists(),
          f'exit {c.returncode}: {c.stderr.strip()[-600:]}')
    if fails:
        finish()
    report = json.loads((out / 'compose-report.json').read_text())
    return out, extra, blocks, entries, report, (out / 'translated.svg').read_text()


def bold_test_run(out_dir):
    meta = json.loads((out_dir / 'meta.json').read_text())
    runs = json.loads((out_dir / 'runs.json').read_text())
    meta['fonts']['PAGE/F3'] = dict(meta['fonts']['PAGE/F1'], base='/ABCDEF+Helvetica-Bold')
    for r in runs:
        if r['text'] == K_TEST:
            r['font'] = 'PAGE/F3'
    (out_dir / 'meta.json').write_text(json.dumps(meta, ensure_ascii=False))
    (out_dir / 'runs.json').write_text(json.dumps(runs, ensure_ascii=False))


TMP = tempfile.TemporaryDirectory()
PLAIN_TR = {K_OBS: 'Athugun og forvitni', K_HYP: 'Setja fram tilgatu', K_TEST: 'Profa tilgatuna'}

# ── the planted figure ──────────────────────────────────────────────────────────────
out_dir, RUNS, blocks, entries, rep, svg = compose_fixture(TMP.name, 'planted', plant, TR)
els = elements(svg)
by_key = collections.defaultdict(list)
for b, e in zip(blocks, entries):
    by_key[e['key']].append((b, e))
meta_page = json.loads((out_dir / 'meta.json').read_text())['page']


def one(key):
    return by_key[key][0] if len(by_key[key]) == 1 else (None, None)


check('P0 PRECONDITION the fixture page is 300 x 220 pt (y below is page_h - y)',
      meta_page == [300.0, PAGE_H], repr(meta_page))
b, e = one(K_VERBATIM)
check('P1 PRECONDITION the subscript plant stays ONE block, send:false, 4 runs on ONE line',
      e is not None and e['send'] is False and len(b) == 4 and len(FT.lines(b)) == 1
      and not any(k in by_key for k in ('H', '2', '2O (g)', 'O (g)')),
      f'{sorted(by_key)}')
b, e = one(K_HYP)
check('P2 PRECONDITION the identity plant is ONE sent block whose single line has 2 runs',
      e is not None and e['send'] is True and len(FT.lines(b)) == 1
      and len(FT.lines(b)[0]) == 2, repr(e))
b, e = one(K_GAP)
check('P3 PRECONDITION the arrow-gap run is its own send:false block, intact',
      e is not None and e['send'] is False and b[0]['text'] == K_GAP, repr(e))
b, e = one(K_EDGE)
check('P4 PRECONDITION the edge-space run is its own send:false block', e is not None
      and e['send'] is False, repr(e))
b, e = one(K_KARC)
check('P5 PRECONDITION the kept arc is ONE block, is_arc, send:false, with a usable circle',
      e is not None and e['arc'] and e['send'] is False
      and K_KARC not in rep.get('degenerate', []), f'{e!r} degenerate={rep.get("degenerate")!r}')
b, e = one(K_TARC)
check('P6 PRECONDITION the translated arc is ONE block, is_arc, send:true, with a circle',
      e is not None and e['arc'] and e['send'] is True
      and K_TARC not in rep.get('degenerate', []), f'{e!r}')
check('P7 PRECONDITION exactly 8 blocks', len(entries) == 8, f'{[x["key"] for x in entries]}')
check('P8 PRECONDITION compose kept exactly the send:false blocks (report `missing`)',
      collections.Counter(rep['missing'])
      == collections.Counter(x['key'] for x in entries if not x['send']), repr(rep['missing']))
if fails:
    finish()

# ── the two controls' inputs ────────────────────────────────────────────────────────
_, _, _, _, _, svg_plain = compose_fixture(TMP.name, 'plain', None, PLAIN_TR)
_, _, _, _, _, svg_bold = compose_fixture(TMP.name, 'bold', bold_test_run, PLAIN_TR)
population = [raw for text, _, raw in els if text in POPULATION]
check('C0 NON-VACUITY the translated population is all 7 elements (2 labels + 5 arc glyphs)',
      len(population) == 7, repr([t for t, _, _ in els if t in POPULATION]))
current = {'population': population, 'faces_plain': faces(svg_plain),
           'faces_bold': faces(svg_bold)}
check('C0b NON-VACUITY the bold variant really has a 700 face',
      any(f[0] == '700' for f in current['faces_bold']), repr(current['faces_bold']))

if CAPTURE:
    check('CAPTURE refused unless the composer is UNCHANGED (its report has no runExact)',
          'runExact' not in rep, 'this composer already implements E - a golden captured '
          'from it would describe the new output, not constrain it')
    if not fails:
        GOLDEN.write_text(json.dumps(current, indent=1, ensure_ascii=False) + '\n')
        print(f'  wrote {GOLDEN.name}')
    finish()

golden = json.loads(GOLDEN.read_text()) if GOLDEN.exists() else None
check('C1 CONTROL the translated population - plain labels AND the translated arc - is '
      'byte-identical to the unchanged composer',
      golden is not None and current['population'] == golden['population'],
      f"now {current['population']!r}")
check('C2 CONTROL a figure with no italic run has the unchanged composer\'s faces (plain)',
      golden is not None and current['faces_plain'] == golden['faces_plain'],
      repr(current['faces_plain']))
check('C3 CONTROL ... and with a whole bold run (face order is visible here)',
      golden is not None and current['faces_bold'] == golden['faces_bold'],
      repr(current['faces_bold']))

# ── E's assertions are appended below this line by Tasks 4 and 5 ────────────────────

finish()
```

- [ ] **Step 2: Capture the goldens from the unchanged composer**

Run: `FIGTEXT_PYLIBS=./pylibs python3 -u test_compose_runexact.py --capture-golden`
Expected: P0-P8 PASS, C0/C0b PASS, `CAPTURE refused unless …` PASS, `wrote compose-runexact-golden.json`, `ALL PASS`.
Then confirm the capture came from unchanged code: `git diff --quiet b805d64f -- compose.py svgout.py && echo COMPOSER-UNCHANGED` → `COMPOSER-UNCHANGED`.

- [ ] **Step 3: Run the controls**

Run: `FIGTEXT_PYLIBS=./pylibs python3 -u test_compose_runexact.py`
Expected: C1, C2, C3 PASS; `ALL PASS`.

- [ ] **Step 4: Prove the controls can fail (mutation probe, restore rule applies)**

```bash
cp svgout.py "$SCRATCH/svgout.golden.py"
sed -i "s/for bold in (False, True):/for bold in (True, False):/" svgout.py
FIGTEXT_PYLIBS=./pylibs python3 -u test_compose_runexact.py | grep -a "C3\|FAILED"
cp "$SCRATCH/svgout.golden.py" svgout.py && cmp svgout.py "$SCRATCH/svgout.golden.py" && echo RESTORED
```
Expected: `FAIL  C3 …`, then `RESTORED`. Then a population mutant (the test spawns `HERE/compose.py`, so the mutant has to be in place — the restore rule is what makes that safe):
```bash
cp compose.py "$SCRATCH/compose.golden.py"
grep -c '^            a += side \* (w / R)$' compose.py      # must print 1 before mutating
sed -i 's|^            a += side \* (w / R)$|            a += side * (w / R) * 1.01|' compose.py
FIGTEXT_PYLIBS=./pylibs python3 -u test_compose_runexact.py | grep -a "C1\|FAILED"
cp "$SCRATCH/compose.golden.py" compose.py && cmp compose.py "$SCRATCH/compose.golden.py" && echo RESTORED
```
Expected: `FAIL  C1 …`, then `RESTORED`.
Finally `git status --porcelain` → only `?? …test_compose_runexact.py` and `?? …compose-runexact-golden.json`.

- [ ] **Step 5: Commit**

```bash
git add experiments/figure-text-translation/test_compose_runexact.py experiments/figure-text-translation/fixtures/compose-runexact-golden.json
git commit -m "test(figures): planted-fixture harness for E, goldens from the unchanged composer

Eight plants (subscript+italic, identity on a two-run line, arrow gap, edge
space, kept and translated arcs), each checked against blocks.json before any
assertion. Controls C1-C3 pin the translated population and the face
structure to goldens captured from the UNCHANGED composer; both were seen to
fail under a mutant. Clock pinned: fontTools stamps head.modified.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01W11kXYeK3JsWvW7Fv4QP4X"
```

---

### Task 4: `compose.py` draws kept blocks run-exact

**Files:**
- Modify: `EXP/compose.py` (docstring, import, new `draw_run_exact`, `fit_circle` docstring, report lists, kept decision, `italic` on ITEMS, report JSON, degenerate warning)
- Modify: `EXP/figtext.py` (delete `strip_undecodable`; re-point the `_CID_TOKEN` comment)
- Modify: `EXP/test_compose_runexact.py` (append assertions)
- Modify: `EXP/test_figure_compose.py` (9i/9j, 9p/9q)

**Interfaces:**
- Consumes: `figtext.is_identity`, `figtext.run_face`, `figtext.run_draw_text` (Task 2); `blockkey.block_english` (Task 1); harness names (Task 3).
- Produces: `compose-report.json` fields `identity: [key…]` and `runExact: [key…]` (draw order, with multiplicity); ITEMS entries carry `italic: bool` (consumed by Task 5's `svgout.py`).

- [ ] **Step 1: Append the identity POSITIONAL clause alone, and see it RED**

In `EXP/test_compose_runexact.py`, below the `# ── E's assertions …` marker and above the final `finish()`:

```python
A1 = adv('Form a ', 12)
check('E1 IDENTITY, POSITIONAL: each run of the two-run identity line is its own <text> at '
      'its own origin (a joined line would be one element at x=10)',
      len(find(els, 'Form a ', x='10.000', y=f'{PAGE_H - 120.0:.3f}')) == 1
      and len(find(els, 'hypothesis', x=f'{10.0 + A1:.3f}', y=f'{PAGE_H - 120.0:.3f}')) == 1,
      repr([(t, a.get('x'), a.get('y')) for t, a, _ in els if 'hyp' in t or 'Form' in t]))
```

Run: `FIGTEXT_PYLIBS=./pylibs python3 -u test_compose_runexact.py`
Expected: C1-C3 PASS, **`FAIL  E1`** showing `[('Form a hypothesis', '10.000', '100.000')]`.

- [ ] **Step 2: Append the remaining E assertions and see them RED**

```python
check('E2 IDENTITY, REPORT: the identity key is in `identity` AND stays in `translated`',
      K_HYP in rep.get('identity', []) and K_HYP in rep['translated'],
      f"identity={rep.get('identity')!r} translated={rep['translated']!r}")

h = find(els, 'H', font_size='12.000')
two = find(els, '2', font_size='8.000')
check('E3 SUBSCRIPT: the 2 is its own <text> at 8 pt, 3.000 below the H baseline',
      len(h) == 1 and len(two) == 1
      and float(two[0][1]['y']) - float(h[0][1]['y']) == 3.0,
      repr([(t, a.get('font-size'), a.get('y')) for t, a, _ in els if t in ('H', '2', 'H2O (g)')]))

check('E4 ARROW GAP: the 10 typed spaces survive inside one <text>',
      len(find(els, K_GAP)) == 1, repr([t for t, _, _ in els if 'H2O(' in t]))

# The kept arc is centred at (230, 100): its glyphs sit at y 152-159. The subscript '2'
# (y 37) and the translated arc (y 72-79) share glyph texts or shapes and are excluded.
karc = [r for r in RUNS if r['text'] in list(K_KARC) and r['y'] > 150]


def arc_ok(r):
    x, y = f"{r['x']:.3f}", f"{PAGE_H - r['y']:.3f}"
    hit = find(els, r['text'], x=x, y=y)
    want = (f"rotate({-r['rot']:.4f} {x} {y})" if abs(r['rot']) > 1e-6 else None)
    return len(hit) == 1 and hit[0][1].get('transform') == want


check('E5 KEPT ARC: every glyph is a <text> at its run\'s (text, x, y) with its own rotation',
      len(karc) == 5 and all(arc_ok(r) for r in karc),
      repr([(t, a.get('x'), a.get('y'), a.get('transform')) for t, a, _ in els
            if t in list(K_KARC)]))

check('E6 EDGE SPACE: a kept line ending in a space is NOT named undecodable, and keeps it',
      K_EDGE not in rep.get('undecodable', []) and len(find(els, K_EDGE)) == 1,
      f"undecodable={rep.get('undecodable')!r}")

check('E7 runExact names exactly the kept blocks, identity included',
      collections.Counter(rep.get('runExact', []))
      == collections.Counter([K_HYP, K_VERBATIM, K_GAP, K_EDGE, K_KARC]),
      repr(rep.get('runExact')))
```

Run: `FIGTEXT_PYLIBS=./pylibs python3 -u test_compose_runexact.py`
Expected: C1-C3 PASS; **E1-E7 all FAIL** (E6 fails on its first half: `undecodable=['25 mL ']`).

- [ ] **Step 3: Implement — `compose.py` import and docstring**

Line 22: `from blockkey import block_key` → `from blockkey import block_key, block_english`.

In the module docstring, after the paragraph ending `…"that is how it lays out".`, insert:

```
⚠️ SINCE §C140 ① (E), --control DRAWS EVERY BLOCK RUN-EXACT - each run at its own origin,
size, rotation, fill and face, as the source drew it. It is therefore a FAITHFUL REDRAW of
the source: a disagreement with the raster now isolates artwork and rasteriser defects. It no
longer exercises the wrap / anchor / shrink path at all - and neither can any translations
file, because a reply token-equal to its English is IDENTITY and is drawn run-exact too.
Work on that path (§C140 ③) needs its own switch.
```

- [ ] **Step 4: Implement — `draw_run_exact`**

Insert immediately before `def setfont(run, size):`:

```python
def draw_run_exact(block):
    """Draw every run of a KEPT block at its own origin, size, rotation, fill and face.

    -> True when a pdfminer `(cid:N)` placeholder was removed from any run (the caller names
    the block in `undecodable`).

    🔴 WHY: `runs.json` already carries what the source drew - a subscript's size and
    baseline, an italic BaseFont, the ten spaces a typist put in an arrow gap, a kerned-back
    superscript. The layout path below joins each line into ONE string at ONE size on ONE
    baseline, re-wraps it (collapsing whitespace), re-anchors it and never selects a slant,
    which destroyed exactly that for 191 of 367 drawn blocks in the 34 bought figures while
    every value check passed (COMPOSE-FIDELITY.md). For English that is kept, nothing needs
    laying out: draw it where it was.

    Nothing is joined, wrapped, re-anchored, re-led or re-sized. A run whose text becomes ''
    after `run_draw_text` is skipped - it would draw nothing. Weight, slant and fill are per
    RUN (the layout path's are per line). One ITEMS entry per drawn run.
    """
    removed = False
    for r in block:
        text, gone = FT.run_draw_text(r)
        removed = removed or gone
        if text == '':
            continue
        bold, italic = FT.run_face(r, meta['fonts'])
        px, py = dev(r['x'], r['y'])
        col = cmyk(r['fill'])
        ITEMS.append(dict(text=text, x=px / S, y=H_PT - py / S, rot=r['rot'],
                          size=r['size'], bold=bold, italic=italic, rgb=col, dx=0.0))
        ctx.select_font_face(FAMILY,
                             cairo.FONT_SLANT_ITALIC if italic else cairo.FONT_SLANT_NORMAL,
                             cairo.FONT_WEIGHT_BOLD if bold else cairo.FONT_WEIGHT_NORMAL)
        ctx.set_font_size(r['size'] * S)
        ctx.save(); ctx.translate(px, py); ctx.rotate(-math.radians(r['rot']))
        ctx.set_source_rgb(*col); ctx.move_to(0, 0); ctx.show_text(text)
        ctx.restore()
    return removed


```

- [ ] **Step 5: Implement — docstrings on the arc decision**

In `fit_circle`'s docstring, replace the line
`🔴 RETURNS None ON A DEGENERATE BLOCK — CALLERS MUST FALL BACK TO THE STRAIGHT PATH.`
with
`🔴 RETURNS None ON A DEGENERATE BLOCK — A TRANSLATED BLOCK THEN FALLS BACK TO THE STRAIGHT PATH. (A KEPT block never reaches the arc code: it is drawn run-exact, glyph by glyph at its source origin.)`

In the main loop, replace the comment line
`    # circle is drawn STRAIGHT — see fit_circle, which returns None for those.`
with
`    # circle is drawn STRAIGHT if translated (see fit_circle) and run-exact if kept.`
(re-derive the exact line with `grep -an "is drawn STRAIGHT" compose.py`).

- [ ] **Step 6: Implement — report lists and the kept decision**

Replace `keys, translated = [], []` with:

```python
keys, translated = [], []
# E (§C140 ①), both additive to the contract above and, like it, in draw order WITH
# multiplicity. `identity` keys are ALSO in `translated` (figure-compose.py assertion 2);
# `runExact` is every kept block, identity included. `degenerate_kept` only splits the
# stdout warning - `degenerate` itself keeps its meaning.
identity, run_exact, degenerate_kept = [], [], []
```

Replace everything from the line `    # 🔴 THE ENGLISH KEPT HERE IS REDRAWN FROM SCRATCH - strip-text.py removed every glyph`
down to (not including) `    if arc:\n        cx, cy, R = circle` with:

```python
    # KEPT := --control, or no translation, or an empty one, or an IDENTITY reply. Every kept
    # block is drawn run-exact (draw_run_exact); only a genuine translation is laid out.
    kept = False
    if CONTROL:
        kept = True
    else:
        value = FT.normalise_block_value(TR[key], arc) if key in TR else None
        # ⚠️ AN EMPTY OR WHITESPACE-ONLY VALUE IS *MISSING*, NOT A TRANSLATION. It reaches
        # this line looking like a hit - `key in TR` is True - and would DELETE the label:
        # `wrap()` turns a whitespace-only paragraph into '' and cairo draws nothing, and the
        # arc path draws nothing for the same reason. Before this branch existed the erasure
        # was recorded nowhere, so the block vanished while `missing` stayed empty.
        # The predicate is `.strip()` because that is exactly what `wrap()` does with
        # `para.split()`; it errs toward KEEPING English, the safe direction.
        if value is None or not (value if arc else ''.join(value)).strip():
            # A missing key must never delete text from a figure - formulas (H2O(g))
            # legitimately have no translation, and a silent blank is far worse than an
            # untranslated label.
            missing.append(key)
            kept = True
        else:
            translated.append(key)
            new = value
            # IDENTITY: the MT gave back what went on the wire. It stays in `translated`
            # (it was bought) and is drawn run-exact (it is English we can draw exactly).
            if FT.is_identity(TR[key], block_english(b), arc):
                identity.append(key)
                kept = True

    if kept:
        if FT.is_arc(b) and circle is None:
            degenerate_kept.append(key)
        if draw_run_exact(b):
            undecodable.append(key)
        run_exact.append(key)
        report.append(f"  RUNEXACT {len(b)} run(s)  {key!r}")
        continue

```

- [ ] **Step 7: Implement — `italic` on the two remaining ITEMS paths**

Arc path: `size=sz, bold=b[0]['font'] in BOLD, rgb=col, dx=-w / 2))` →
`size=sz, bold=b[0]['font'] in BOLD, italic=False, rgb=col, dx=-w / 2))`

Layout path: `size=sz, bold=fr['font'] in BOLD, rgb=cmyk(fr['fill']), dx=0.0))` →
```python
                          size=sz, bold=fr['font'] in BOLD, italic=False, rgb=cmyk(fr['fill']),
                          dx=0.0))
```

- [ ] **Step 8: Implement — report JSON and the degenerate warning**

In the `compose-report.json` dict, after `'control': CONTROL,` add:
```python
    # E (§C140 ①). Additive: figure-compose.py reads only blocks/missing/translated.
    'identity': identity,
    'runExact': run_exact,
```

Replace the `if degenerate:` stdout block with:
```python
# NAMED, never counted. `is_arc` calling straight text an arc is a real mis-classification;
# the keys below are the evidence for whoever revisits `is_arc`, which this file
# deliberately does not touch. Split by path, because only a TRANSLATED one is laid out.
degenerate_straight = list((collections.Counter(degenerate)
                            - collections.Counter(degenerate_kept)).elements())
if degenerate_straight:
    print(f"\n!! {len(degenerate_straight)} block(s) is_arc says are arcs but have no usable "
          f"circle - TRANSLATED, DRAWN STRAIGHT:")
    for k in degenerate_straight:
        print(f"     {k!r}")
if degenerate_kept:
    print(f"\n!! {len(degenerate_kept)} block(s) is_arc says are arcs but have no usable "
          f"circle - KEPT, DRAWN RUN-EXACT:")
    for k in degenerate_kept:
        print(f"     {k!r}")
```
and change line 16 `import sys, json, math` to `import sys, json, math, collections`.

- [ ] **Step 9: Delete `strip_undecodable` and retarget 9i/9j, 9p**

Confirm it is dead: `grep -an "strip_undecodable\|keep_english" *.py | grep -v pylibs` → only `figtext.py`'s definition and `test_figure_compose.py` 9i/9j.

In `EXP/figtext.py` delete the whole `def strip_undecodable(value): …` function, and in the comment above `_CID_TOKEN` replace
`# detector finds or a held block is drawn with its placeholder anyway. Asserted against`
`# `readlayer.CID` rather than described - test_figure_compose.py case 9i.`
with
`# detector finds or a held block is drawn with its placeholder anyway. The remover is`
`# `run_draw_text`; asserted against `readlayer.CID` - test_figure_compose.py 9i, test_figtext_runexact.py 4d.`

In `EXP/test_figure_compose.py`, replace everything from the line `    probe = f'{_RL.CID}127) x'` through the end of the `check('9j …` call (keep the two `import … as _FT` / `_RL` lines above it) with:
```python
    probe = f'{_RL.CID}127) x'
    got = _FT.run_draw_text({'text': probe})
    check("9i the remover that DRAWS matches everything readlayer's DETECTOR finds",
          _RL.CID in probe and got == (' x', True), f'{probe!r} -> {got!r}')
    plain = _FT.run_draw_text({'text': 'Nutrition Facts '})
    check('9j ... and it leaves ordinary text alone, edge space included',
          plain == ('Nutrition Facts ', False), repr(plain))
```
and replace the 9p check (and its `# RECORDED, not merely tolerated…` comment) with:
```python
    # RE-PINNED by E (§C140 ①), a DECISION: a run that is nothing but a placeholder strips to
    # '' and draw_run_exact SKIPS it, so no empty <text> element is written any more (the old
    # composer wrote exactly one). An absence proves nothing on its own - 9q pairs it.
    check('9p ... drawing NO empty <text> element: a run that strips to nothing is skipped',
          sum(1 for t in texts if t.strip() == '') == 0, f'{texts!r}')
    rep = load_json(out / 'compose-report.json') or {}
    check('9q ... PAIRED: the placeholder block WAS processed - named undecodable, drawn '
          'run-exact', '(cid:127)' in rep.get('undecodable', [])
          and '(cid:127)' in rep.get('runExact', []),
          f"undecodable={rep.get('undecodable')!r} runExact={rep.get('runExact')!r}")
```

- [ ] **Step 10: Confirm no consumer's outcome keys on `undecodable`**

The spec requires this check because `undecodable` loses its edge-space false positives.
Run: `grep -ran "undecodable" ../../tools/figure-run.js ../../tools/lib/figure-outcomes.js ../../tools/publish-figure-svg.js ../../server/services/figureReviewService.js`
Expected (measured 2026-09-13): apart from comment lines, the only code hit is `figure-run.js` printing `f.holds.undecoded` — **prepare's** holds, a different field — so no outcome or verdict reads compose-report `undecodable`. Read each non-comment hit; one that reads `compose-report.json`'s field: STOP and report.

- [ ] **Step 11: Run everything**

Run: `FIGTEXT_PYLIBS=./pylibs python3 -u test_compose_runexact.py`
Expected: P0-P8, C0-C3, **E1-E7 PASS**, `ALL PASS`.

Run all 12 Python test files (the 10 baseline + `test_figtext_runexact.py` + `test_compose_runexact.py`) as in the baseline loop:
```bash
for t in test_*.py; do FIGTEXT_PYLIBS=./pylibs timeout 900 python3 -u "$t" > "$SCRATCH/t4-$t.log" 2>&1; echo "$t rc=$? $(tail -1 "$SCRATCH/t4-$t.log")"; done
```
Expected: 12 lines, every one `rc=0 ALL PASS` (`test_readlayer.py`'s last line is indented `  ALL PASS`).

- [ ] **Step 12: Commit**

```bash
git add experiments/figure-text-translation/{compose.py,figtext.py,test_compose_runexact.py,test_figure_compose.py}
git commit -m "feat(figures): kept figure text is drawn run-exact, not re-laid out

A block compose.py keeps in English (--control, no translation, empty, or an
identity reply) is drawn run by run at its source origin, size, rotation, fill
and face. Translated blocks take the unchanged path - pinned byte-for-byte by
goldens from the old composer. Report gains identity/runExact; the degenerate
warning is split by path; strip_undecodable is deleted (dead under E) and 9p
is re-pinned to zero empty elements, paired with 9q.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01W11kXYeK3JsWvW7Fv4QP4X"
```

---

### Task 5: `svgout.py` embeds italic faces

**Files:**
- Modify: `EXP/svgout.py:16-19` (FACES), `:51-60` (face loop), `:68-72` (attrs)
- Modify: `EXP/test_compose_runexact.py` (append E8)

**Interfaces:**
- Consumes: ITEMS entries with `italic` (Task 4).
- Produces: `@font-face` rules with `font-style:italic` for italic items; `font-style="italic"` on their `<text>`.

- [ ] **Step 1: Append the failing assertion**

```python
check('E8 ITALIC: an italic @font-face exists and the italic run uses it',
      ['400', 'italic', '()g'] in faces(svg)
      and len(find(els, '(g)', font_style='italic')) == 1,
      f"faces={[f[:2] for f in faces(svg)]!r} (g)={find(els, '(g)')!r}")
```

Run: `FIGTEXT_PYLIBS=./pylibs python3 -u test_compose_runexact.py`
Expected: everything PASS except **`FAIL  E8`** (faces show only `['400', 'normal']`).

- [ ] **Step 2: Implement**

Replace `FACES`:
```python
FACES = {   # (bold, italic)
    (False, False): '/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf',
    (True, False):  '/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf',
    (False, True):  '/usr/share/fonts/truetype/liberation/LiberationSans-Italic.ttf',
    (True, True):   '/usr/share/fonts/truetype/liberation/LiberationSans-BoldItalic.ttf',
}
```
Replace the face loop:
```python
    # A face is embedded only when some item uses it, iterated (F,F),(T,F),(F,T),(T,T): a
    # figure with no italic item therefore emits today's rules in today's order. Italic
    # arrives with E (§C140 ①) - a kept run in an italic BaseFont is drawn italic.
    for bold, italic in ((False, False), (True, False), (False, True), (True, True)):
        chars = {c for it in items
                 if bool(it['bold']) is bold and bool(it.get('italic')) is italic
                 for c in it['text']}
        if not chars:
            continue
        b64 = base64.b64encode(subset_face(FACES[(bold, italic)], chars)).decode('ascii')
        faces.append(
            f"@font-face{{font-family:'{FAMILY}';font-weight:{700 if bold else 400};"
            f"font-style:{'italic' if italic else 'normal'};"
            f"src:url(data:font/woff2;base64,{b64}) format('woff2');}}"
        )
```
In `attrs`, after the `font-weight` entry add:
```python
                 *(['font-style="italic"'] if it.get('italic') else []),
```

- [ ] **Step 3: Run**

Run: `FIGTEXT_PYLIBS=./pylibs python3 -u test_compose_runexact.py` → `ALL PASS` (C2/C3 still PASS: no-italic faces unchanged).
Run: `FIGTEXT_PYLIBS=./pylibs python3 -u test_figure_compose.py` → `ALL PASS`.

- [ ] **Step 4: Commit**

```bash
git add experiments/figure-text-translation/{svgout.py,test_compose_runexact.py}
git commit -m "feat(figures): embed Liberation Sans Italic / BoldItalic for italic runs

Faces keyed (bold, italic), emitted only when used, in an order that leaves a
figure with no italic run structurally unchanged (control C2/C3).

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01W11kXYeK3JsWvW7Fv4QP4X"
```

---

### Task 6: `COMPOSER_VERSION` `'1'` → `'2'`, checked against the JS baseline by name

**Files:**
- Modify: `tools/lib/figure-text-sidecar.cjs:21-25`

**Interfaces:**
- Consumes: nothing new.
- Produces: `COMPOSER_VERSION === '2'`, which makes `isStale` select every committed sidecar (Task 8).

- [ ] **Step 1: Bump**

```js
/**
 * Bump when a composer change alters pixels for unchanged text. Doing so
 * invalidates every stored renderHash, which correctly sends every approved
 * figure back to mt-preview until re-reviewed.
 *
 * '2' (2026-09-13, §C140 ①): kept figure text is drawn run-exact.
 */
const COMPOSER_VERSION = '2';
```

- [ ] **Step 2: Run the JS suite and diff the failing set by name**

```bash
cd /home/siggi/dev/repos/namsbokasafn-efni
npx vitest run --reporter=json --outputFile="$SCRATCH/t6-js.json" > "$SCRATCH/t6-js.log" 2>&1; echo "exit=$?"
python3 - "$SCRATCH" t6-js.json <<'EOF'
import json, sys
S = sys.argv[1]
d = json.load(open(f'{S}/{sys.argv[2]}'))
now = sorted(tr['name'].split('namsbokasafn-efni/')[-1] + ' :: ' + a['fullName']
             for tr in d['testResults'] for a in tr['assertionResults'] if a['status'] == 'failed')
base = [l for l in open(f'{S}/baseline-main/js-failing-by-name.txt').read().splitlines() if l]
print('NEWLY RED:'); [print('  ', x) for x in sorted(set(now) - set(base))]
print('NEWLY GREEN:'); [print('  ', x) for x in sorted(set(base) - set(now))]
files = {x.split(' :: ')[0] for x in set(now) ^ set(base)}
print('FILES WITH ANY DELTA:', sorted(files))
EOF
```
Expected: `FILES WITH ANY DELTA: ['tools/__tests__/figure-run-free.test.js']` — nothing else. The adversarial review measured, in that file only: 7 baseline reds turn green (the three de-hash LOOKUP-ONLY tests, "de-hashes ch03 exactly as before", "files a prepare that exited non-zero", "REFUSES a figure whose meta.json names a different figure", "prints a warning verbatim") and 2 turn red ("skips exactly the figures that really do have a current sidecar", "R9 …"). These read the COMMITTED sidecars' `composedVersion`, so they move back after Task 8.
**If any delta names another file, or a changed test in this file does not read committed sidecars: STOP and report.** Record the exact two lists in `$SCRATCH/t6-delta.txt` — Task 8 checks the reverse.

- [ ] **Step 3: Commit**

```bash
git add tools/lib/figure-text-sidecar.cjs
git commit -m "feat(figures): COMPOSER_VERSION 2 — every committed figure recomposes

The composer now draws kept text run-exact, which alters pixels for unchanged
text: exactly this constant's contract. All 34 efnafraedi sidecars go stale
until the recompose data commit; no sidecar carries an editorial state.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01W11kXYeK3JsWvW7Fv4QP4X"
```

---

### Task 7: T3 — the 34 real figures, unchanged vs E, 0 ISK

**Files:**
- Create (scratch only): `SCRATCH/t3/t3_verify.py`, `SCRATCH/t3/t3_arcs.py`
- Create (committed): `EXP/evidence/2026-09-13-e-build/VERIFICATION.md`

**Interfaces:**
- Consumes: `BASE` and `HEAD` trees; `sources.py --json`; committed sidecars.
- Produces: `SCRATCH/t3/t3.jsonl` (one row per figure, incl. `kept_changed` — used by Task 9's labels) and the frozen VERIFICATION.md.

- [ ] **Step 1: Write the verifier**

Create `SCRATCH/t3/t3_verify.py`:

```python
#!/usr/bin/env python3
"""T3: compose the 34 bought figures with the UNCHANGED (BASE) and the E (HEAD) composer,
each with its committed sidecar. Scratch only; resumable; 0 ISK (no MT anywhere)."""
import collections, json, os, shutil, subprocess, sys
from pathlib import Path

REPO = Path('/home/siggi/dev/repos/namsbokasafn-efni')
REL = 'experiments/figure-text-translation'
T3 = Path(__file__).resolve().parent
REVS = {'base': sys.argv[1], 'head': sys.argv[2]}
SIDECARS = REPO / 'books/efnafraedi-2e/figure-text'
RESULTS = T3 / 't3.jsonl'
TAG = '''
class _TagList(list):
    """Instrument: every drawn item carries the index of the block being drawn."""
    def append(self, it):
        super().append(dict(it, block=globals().get('BI')))
'''


def tree(side):
    d = T3 / side
    if (d / 'compose.py').exists():
        return d
    d.mkdir(parents=True, exist_ok=True)
    names = subprocess.run(['git', '-C', str(REPO), 'ls-tree', '--name-only', REVS[side], REL + '/'],
                           capture_output=True, text=True, check=True).stdout.split()
    for n in names:
        if n.endswith(('.py', '.mjs', '.json')):
            blob = subprocess.run(['git', '-C', str(REPO), 'show', f'{REVS[side]}:{n}'],
                                  capture_output=True, check=True).stdout
            (d / Path(n).name).write_bytes(blob)
    (d / 'pylibs').symlink_to(REPO / REL / 'pylibs')
    (d / 'sources.local.json').symlink_to(REPO / REL / 'sources.local.json')
    s = (d / 'compose.py').read_text()
    assert s.count('\nITEMS = []') == 1 and s.count('\nfor b in blocks:\n') == 1, side
    s = s.replace('\nITEMS = []', TAG + '\nITEMS = _TagList()', 1)
    s = s.replace('\nfor b in blocks:\n', '\nfor BI, b in enumerate(blocks):\n', 1)
    s += ("\n(OUT / 'items.json').write_text(json.dumps(ITEMS, ensure_ascii=False))\n")
    (d / 'compose.py').write_text(s)
    return d


def sh(argv, env=None, cwd=None, timeout=900):
    return subprocess.run(argv, capture_output=True, text=True, env=env, cwd=cwd, timeout=timeout)


def item_key(it):
    return (it['text'], round(it['x'], 6), round(it['y'], 6), it['size'], round(it['rot'], 6),
            bool(it['bold']), tuple(round(c, 6) for c in it['rgb']))


def main():
    done = set()
    if RESULTS.exists():
        done = {json.loads(l)['basename'] for l in RESULTS.read_text().splitlines() if l.strip()}
    trees = {s: tree(s) for s in REVS}
    env = dict(os.environ, FIGTEXT_PYLIBS=str(REPO / REL / 'pylibs'))
    names = sorted(p.name[:-len('.is.json')] for p in SIDECARS.glob('*.is.json'))
    assert len(names) == 34, len(names)
    src = json.loads(sh([sys.executable, 'sources.py', '--json', 'efnafraedi-2e', *names],
                        env=env, cwd=str(trees['head'])).stdout)
    for b in names:
        if b in done:
            continue
        row = dict(basename=b)
        out = {}
        for side, d in trees.items():
            o = T3 / 'prep' / side / b
            shutil.rmtree(o, ignore_errors=True)
            p = sh([sys.executable, 'figure-prepare.py', src[b]['path'], '--basename', b, '--out', str(o)],
                   env=env, cwd=str(d))
            assert p.returncode == 0, (b, side, p.stderr[-400:])
            c = sh([sys.executable, 'compose.py', '--translations', str(SIDECARS / f'{b}.is.json'), '--svg'],
                   env=dict(env, FIGTEXT_OUT=str(o)), cwd=str(d))
            assert c.returncode == 0, (b, side, c.stderr[-400:])
            out[side] = dict(blocks=(o / 'blocks.json').read_bytes(),
                             rep=json.loads((o / 'compose-report.json').read_text()),
                             items=json.loads((o / 'items.json').read_text()))
        rb, rh = out['base']['rep'], out['head']['rep']
        C = collections.Counter
        row['blocks_json_identical'] = out['base']['blocks'] == out['head']['blocks']
        row['multisets_equal'] = all(C(rb[k]) == C(rh[k]) for k in ('blocks', 'missing', 'translated'))
        row['identity'] = len(rh['identity'])
        row['runExact'] = len(rh['runExact'])
        ident = set(rh['identity'])
        trans = set(rh['translated'])
        pop = [i for i, k in enumerate(rh['blocks']) if k in trans and k not in ident]
        kept = [i for i, k in enumerate(rh['blocks']) if i not in pop]

        def items_of(side, idx):
            return [item_key(it) for it in out[side]['items'] if it['block'] in idx]

        row['population_blocks'] = len(pop)
        row['population_items_equal'] = items_of('base', set(pop)) == items_of('head', set(pop))
        row['kept_changed'] = sum(1 for i in kept if items_of('base', {i}) != items_of('head', {i}))
        with RESULTS.open('a') as fh:
            fh.write(json.dumps(row) + '\n')
        print(json.dumps(row), flush=True)
        shutil.rmtree(T3 / 'prep' / 'base' / b, ignore_errors=True)
        shutil.rmtree(T3 / 'prep' / 'head' / b, ignore_errors=True)

    rows = [json.loads(l) for l in RESULTS.read_text().splitlines() if l.strip()]
    tot = dict(figures=len(rows),
               blocks_json_identical=sum(r['blocks_json_identical'] for r in rows),
               multisets_equal=sum(r['multisets_equal'] for r in rows),
               identity=sum(r['identity'] for r in rows),
               runExact=sum(r['runExact'] for r in rows),
               population_items_equal=sum(r['population_items_equal'] for r in rows),
               population_nonempty=sum(1 for r in rows if r['population_blocks']),
               kept_changed=sum(r['kept_changed'] for r in rows))
    print('TOTALS', json.dumps(tot))


main()
```

- [ ] **Step 2: Run it in the foreground**

```bash
mkdir -p "$SCRATCH/t3" && cd "$SCRATCH/t3"
python3 -u t3_verify.py b805d64f "$(git -C /home/siggi/dev/repos/namsbokasafn-efni rev-parse HEAD)" 2>&1 | tee t3.log | tail -5
```
If the tool call times out, re-run the same command — it resumes from `t3.jsonl`.
**Predicted (written before the run):** `figures 34`, `blocks_json_identical 34`, `multisets_equal 34`, `identity 7`, `runExact 191`, `population_items_equal 34`, `population_nonempty 31`. **A miss on any number stops the work until explained.** `kept_changed` has no prediction; it is recorded.

- [ ] **Step 3: Measure arcs on real artwork**

Create `SCRATCH/t3/t3_arcs.py`:

```python
#!/usr/bin/env python3
"""Per-block ink fidelity of KEPT arc blocks, unchanged vs E, on real artwork.
Uses evidence/.../1a/fidelity.py (copied, re-pointed). Empty translations => every block kept."""
import json, os, shutil, subprocess, sys
from pathlib import Path

REPO = Path('/home/siggi/dev/repos/namsbokasafn-efni')
REL = 'experiments/figure-text-translation'
T3 = Path(__file__).resolve().parent
ROOT = T3 / 'arcs'
INSTR = REPO / REL / 'evidence/2026-09-13-compose-fidelity/instruments/1a'
sys.path.insert(0, str(REPO / REL)); sys.path.insert(0, str(REPO / REL / 'pylibs'))
import figtext as FT
from blockkey import block_key

ROOT.mkdir(exist_ok=True)
(ROOT / 'tools').mkdir(exist_ok=True)
shutil.copy(INSTR / 'runexact_png.py', ROOT / 'tools' / 'runexact_png.py')
fid = (INSTR / 'fidelity.py').read_text().splitlines()
fid = [f"SP = Path('{ROOT}')" if l.startswith('SP = Path(') else l for l in fid]
(ROOT / 'fidelity.py').write_text('\n'.join(fid) + '\n')

env = dict(os.environ, FIGTEXT_PYLIBS=str(REPO / REL / 'pylibs'))
empty = ROOT / 'empty.json'
empty.write_text('{"blocks": {}}')
for b in sys.argv[1:]:
    src = json.loads(subprocess.run([sys.executable, 'sources.py', '--json', 'efnafraedi-2e', b],
                     capture_output=True, text=True, env=env, cwd=str(T3 / 'head')).stdout)[b]['path']
    prep = ROOT / 'prep' / b
    shutil.rmtree(prep, ignore_errors=True)
    subprocess.run([sys.executable, 'figure-prepare.py', src, '--basename', b, '--out', str(prep)],
                   check=True, capture_output=True, env=env, cwd=str(T3 / 'head'))
    runs = json.loads((prep / 'runs.json').read_text())
    arcs = {block_key(x): len({r['size'] for r in x}) > 1
            for x in FT.merge_blocks(FT.group(runs)) if FT.is_arc(x)}
    print(b, 'arc blocks (key -> mixed sizes):', arcs)
    for side in ('base', 'head'):
        subprocess.run([sys.executable, 'compose.py', '--translations', str(empty)], check=True,
                       capture_output=True, env=dict(env, FIGTEXT_OUT=str(prep)), cwd=str(T3 / side))
        shutil.copy(prep / 'translated.png', ROOT / f'{b}.{side}.png')
    for side in ('base', 'head'):
        r = subprocess.run([sys.executable, str(ROOT / 'fidelity.py'), b, str(ROOT / f'{b}.{side}.png')],
                           capture_output=True, text=True, env=env, cwd=str(ROOT))
        assert r.returncode == 0, r.stderr[-800:]
        for line in r.stdout.splitlines()[:-1]:
            row = json.loads(line)
            if row['key'] in arcs:
                print(f"  {side:4} {row['key']!r:28} mixed={arcs[row['key']]} iou1={row.get('iou1')} "
                      f"c_no={row.get('c_no')} h_ratio={row.get('h_ratio')}")
```

Run:
```bash
cd "$SCRATCH/t3" && python3 -u t3_arcs.py CNX_Chem_14_03_corresp CNX_Chem_01_01_SciMethod 2>&1 | tee arcs.log
```
Expected: `CNX_Chem_14_03_corresp` lists ≥ 1 arc block with `mixed=True` (a kept formula-arc). **If it lists none**, find one: run `evidence/2026-09-13-compose-fidelity/instruments/1b/census.py` (adjust its scratch paths the same way) over chapter 14 and pick a figure with an `arc` block whose runs have more than one size; re-run with that basename. For each kept arc block record base vs head `iou1`. **If head's `iou1` is lower than base's by ≥ 0.17 on any kept arc block (1a's damage threshold): STOP and report.** If `fidelity.py` raises on a missing path, read `Figure.__init__` (lines 77-100) and create what it expects under `SCRATCH/t3/arcs/`.

- [ ] **Step 4: Write the frozen evidence note**

Create `EXP/evidence/2026-09-13-e-build/VERIFICATION.md` with: a 🧊 FROZEN banner (cited, never synced; status lives in REGISTER.md and the campaign register); the BASE and HEAD shas; the TOTALS line from Step 2 against the predicted numbers, one table row per measure; the 3 figures whose population is empty (named); `kept_changed` per figure (from `t3.jsonl`); the arc table from Step 3 with the figure names and which blocks are formula-arcs; the Python and JS by-name results from Tasks 4-6; and the commands used (the two scripts are reproduced in full under a "Instruments" heading so the note does not depend on the scratch directory).

- [ ] **Step 5: Commit**

```bash
git add experiments/figure-text-translation/evidence/2026-09-13-e-build/VERIFICATION.md
git commit -m "docs(figures): E verified on the 34 bought figures at 0 ISK

Unchanged vs E with each committed sidecar: <paste the TOTALS line>. Kept
formula-arc measured on real artwork: <one line from arcs.log>.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01W11kXYeK3JsWvW7Fv4QP4X"
```
(Replace the two `<…>` with the measured lines before committing.)

---

### Task 8: The repair run — recompose the 34, 0 ISK, a separate data commit

**Files:**
- Data: `books/efnafraedi-2e/media/<basename>_IS.svg` ×34, `books/efnafraedi-2e/figure-text/<basename>.is.json` ×34 (written by `tools/figure-run.js` only)

**Interfaces:**
- Consumes: `COMPOSER_VERSION === '2'` (Task 6); E composer (Tasks 4-5).
- Produces: recomposed media used by Task 9.

- [ ] **Step 1: Pre-flight — editorial state on the remote, with a positive control**

```bash
cd /home/siggi/dev/repos/namsbokasafn-efni
git fetch origin
git grep -c '"state"' origin/main -- 'books/*/figure-text/*.json'; echo "state-grep exit=$?"
git grep -l '"composedVersion"' origin/main -- 'books/efnafraedi-2e/figure-text/*.json' | wc -l
```
Expected: no output and `state-grep exit=1` (0 matches), then `34` (the control: the same grep shape does find the field that exists).

- [ ] **Step 2: Pre-flight — dry runs (free), expected printed lines**

```bash
node tools/figure-run.js --book efnafraedi-2e --chapter 3 --stale --dry-run 2>&1 | tee "$SCRATCH/t8-dry-ch03.log" | tail -30
node tools/figure-run.js --book efnafraedi-2e --chapter 4 --stale --dry-run 2>&1 | tee "$SCRATCH/t8-dry-ch04.log" | tail -30
```
Expected in ch03: `15 figure(s) across …`; `--stale: 26 figure(s) in this chapter have no sidecar and were not selected`; a tally `15 translated` with no `failed-*` / `unresolved` / `unreadable-text` / `copied-*` rows; `15 = enumerated`; `VERDICT ok`.
Expected in ch04: the same with **19** / **11** / `19 translated` / `19 = enumerated`.
`15 + 19 = 34`. ⚠️ `= enumerated` is the SELECTED count; the chapter totals are not printed, and no dry-run line reports purchases — "0 purchases" is guaranteed by the `--stale` selection, and the live run's `MT spawned for N figure(s)` line is its observable.
**Any other tally row: STOP and report.**

- [ ] **Step 3: Live run, in the foreground, in batches of ≤ 8 figures**

Build the batches from the dry-run logs' figure names (or from the sidecar list), then for each batch:
```bash
node tools/figure-run.js --book efnafraedi-2e --chapter 3 --stale --figure <b1>,<b2>,…,<b8> 2>&1 | tee -a "$SCRATCH/t8-live-ch03.log" | tail -15
```
(chapter 4 likewise; `CNX_Chem_14_03_FishLemon` is enumerated under chapter 4.) Use a tool timeout of 600000 ms. Expected per batch: `MT spawned for 0 figure(s)` (or no MT line at all if 0), tally all `translated`, `VERDICT ok`. **A kill loses nothing** — re-run the same batch; recomposed figures then read `skipped-current`.

- [ ] **Step 4: Check exactly what changed**

```bash
git status --porcelain | awk '{print $2}' | sed -E 's#(books/efnafraedi-2e/(media|figure-text))/.*#\1/…#' | sort | uniq -c
node -e '
const {execSync}=require("child_process"),fs=require("fs");
const files=execSync("git diff --name-only -- books/efnafraedi-2e/figure-text").toString().trim().split("\n").filter(Boolean);
let bad=0;
for(const f of files){const a=JSON.parse(execSync(`git show HEAD:${f}`));const b=JSON.parse(fs.readFileSync(f,"utf8"));
 const keys=new Set([...Object.keys(a),...Object.keys(b)]);
 for(const k of keys){const same=JSON.stringify(a[k])===JSON.stringify(b[k]);
  if(k==="composedVersion"){if(!(a[k]==="1"&&b[k]==="2")){bad++;console.log("VERSION",f,a[k],b[k]);}}
  else if(!same){bad++;console.log("OTHER FIELD",f,k);}}}
console.log("sidecars changed:",files.length,"unexpected:",bad);'
```
Expected: `34 books/efnafraedi-2e/figure-text/…` and `34 books/efnafraedi-2e/media/…` and nothing else; `sidecars changed: 34 unexpected: 0`.

- [ ] **Step 5: Convergence control**

```bash
node tools/figure-run.js --book efnafraedi-2e --chapter 3 --stale --dry-run 2>&1 | grep -a "skipped-current\|translated\|VERDICT"
node tools/figure-run.js --book efnafraedi-2e --chapter 4 --stale --dry-run 2>&1 | grep -a "skipped-current\|translated\|VERDICT"
```
Expected: `15 skipped-current` and `19 skipped-current`, no `translated` row, `VERDICT ok`.

- [ ] **Step 6: Commit the data**

```bash
git add books/efnafraedi-2e/media/*_IS.svg books/efnafraedi-2e/figure-text/*.is.json
git commit -m "feat(figures): recompose the 34 ch03/ch04 figures with run-exact kept text

figure-run --stale under COMPOSER_VERSION 2: 34 recomposed, 0 MT calls,
sidecars changed only in composedVersion 1 -> 2; a second --stale run reads
34 skipped-current. Not rendered or synced - publication is [USER]'s call.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01W11kXYeK3JsWvW7Fv4QP4X"
```

- [ ] **Step 7: The JS failing set returns to the baseline**

Re-run the Task 6 Step 2 commands with `--outputFile="$SCRATCH/t8-js.json"` and the Python snippet's second argument `t8-js.json` instead of `t6-js.json`. Expected: `NEWLY RED:` empty, `NEWLY GREEN:` empty — the failing set is the baseline's 36 by name. **Anything else: STOP and report.**

---

### Task 9: Acceptance — [USER] looks at the 34 figures (R4)

**Files:**
- Create (scratch only): `SCRATCH/t9/t9_stacks.py`, `SCRATCH/t9/site/index.html`, `SCRATCH/t9/site/img/*.jpg`

**Interfaces:**
- Consumes: `BASE` media (yesterday's composed SVGs), working-tree media (Task 8), `t3.jsonl` (Task 7), `render-check.mjs`.
- Produces: a private artifact URL for [USER].

- [ ] **Step 1: Render the stacks**

Create `SCRATCH/t9/t9_stacks.py`:

```python
#!/usr/bin/env python3
"""source raster / before (BASE media) / after (working-tree media), per figure, as one JPEG."""
import json, os, subprocess, sys
from pathlib import Path
REPO = Path('/home/siggi/dev/repos/namsbokasafn-efni')
EXP = REPO / 'experiments/figure-text-translation'
sys.path.insert(0, str(EXP / 'pylibs'))
from PIL import Image, ImageDraw

T9 = Path(__file__).resolve().parent
BASE = sys.argv[1]
SITE = T9 / 'site' / 'img'
SITE.mkdir(parents=True, exist_ok=True)
env = dict(os.environ, FIGTEXT_PYLIBS=str(EXP / 'pylibs'))
names = sorted(p.name[:-len('.is.json')] for p in (REPO / 'books/efnafraedi-2e/figure-text').glob('*.is.json'))
src = json.loads(subprocess.run([sys.executable, 'sources.py', '--json', 'efnafraedi-2e', *names],
                                capture_output=True, text=True, env=env, cwd=str(EXP)).stdout)
done = []
for b in names:
    w = T9 / 'work' / b
    w.mkdir(parents=True, exist_ok=True)
    subprocess.run(['pdftocairo', '-png', '-r', '150', '-singlefile', src[b]['path'], str(w / 'source')],
                   check=True, timeout=300)
    srcimg = Image.open(w / 'source.png').convert('RGB')
    W, H = srcimg.size
    (w / 'before.svg').write_bytes(subprocess.run(
        ['git', '-C', str(REPO), 'show', f'{BASE}:books/efnafraedi-2e/media/{b}_IS.svg'],
        capture_output=True, check=True).stdout)
    (w / 'after.svg').write_bytes((REPO / f'books/efnafraedi-2e/media/{b}_IS.svg').read_bytes())
    panels = [('SOURCE — the OpenStax PDF', srcimg)]
    for tag, label in (('before', 'BEFORE — composed 2026-09-12'), ('after', 'AFTER — E, recomposed')):
        (w / f'{tag}.png').unlink(missing_ok=True)
        try:
            r = subprocess.run(['node', str(EXP / 'render-check.mjs'), str(w / f'{tag}.svg'),
                                str(w / f'{tag}.png'), str(W), str(H)],
                               capture_output=True, text=True, timeout=180)
            err = r.stderr[-300:] if r.returncode != 0 else ''
        except subprocess.TimeoutExpired:
            err = 'timed out after 180 s'
        if err or not (w / f'{tag}.png').exists():
            print('RENDER FAILED', b, tag, err, flush=True)
            panels.append((label + ' — NOT RENDERABLE IN HEADLESS CHROMIUM', Image.new('RGB', (W, 40), 'white')))
        else:
            panels.append((label, Image.open(w / f'{tag}.png').convert('RGB')))
    band = 28
    out = Image.new('RGB', (W, sum(p.size[1] + band for _, p in panels)), 'white')
    y = 0
    d = ImageDraw.Draw(out)
    for label, p in panels:
        d.rectangle([0, y, W, y + band], fill=(40, 40, 40))
        d.text((8, y + 8), label, fill='white')
        out.paste(p, (0, y + band))
        y += p.size[1] + band
    if out.size[0] > 1400:
        out = out.resize((1400, round(out.size[1] * 1400 / out.size[0])))
    out.save(SITE / f'{b}.jpg', quality=85)
    done.append(b)
    print('ok', b, flush=True)
print('rendered', len(done), 'of', len(names))
```

Run: `cd "$SCRATCH/t9" && python3 -u t9_stacks.py b805d64f 2>&1 | tee t9.log | tail -5`
Expected: `rendered 34 of 34`; at most `CNX_Chem_03_01_exocytosis-88f6` reports `RENDER FAILED` (its 24 MB artwork timed out twice in the evidence run) — record it on its card.

- [ ] **Step 2: Build the page — load the design skill first**

Invoke the `artifact-design` skill before writing the page. Then write `SCRATCH/t9/site/index.html`: title **"Figure recompose — ch03/ch04"**; a short intro (what E changes, what it does not, and that this page is the merge gate); one card per figure in chapter order with the stack image, the basename, and a line built from `t3.jsonl` (`kept blocks redrawn: <kept_changed>, translated blocks: <population_blocks>, identity: <identity>`), plus these notes where they apply:

| basename | note on the card |
|---|---|
| `CNX_Chem_04_02_HClsoln` | should change: italic aq/g/l, H₂O and H₃O⁺/Cl⁻ scripts, both arrow gaps, the clipped left `H2O(l)` |
| `CNX_Chem_14_03_FishLemon` | should change: the formula row (CH₃COOH, NH₃⁺ stacked); the Icelandic name row should NOT |
| `CNX_Chem_04_04_GreenChem` | should change: `(CH₃CO)₂O` and `H₂, Raney Ni` regain subscripts and left alignment |
| `CNX_Chem_04_01_basehyd_img` | should change: O⁻ and Na⁺ superscripts |
| `CNX_Chem_04_01_rxn2` | should change: CH₄, 2O₂, CO₂, 2H₂O subscripts |
| `CNX_Chem_04_05_combustion` | should change: the `O2` label. Should NOT: the blue-grey arrowheads (§C140 ④) |
| `CNX_Chem_04_03_ethene_img` | should NOT: the two `H` labels overprinted by a translated line (§C140 ③) |
| `CNX_Chem_03_02_sacch_img-3278` | should NOT change visibly: every block is translated (§C140 ②/③) |
| `CNX_Chem_04_03_etheneBr_img` | should NOT change visibly: damage is in translated blocks; `C═C` offset is artwork (§C140 ⑤) |

Keep images in `img/` as separate files (a multi-file artifact), `loading="lazy"`, `max-width:100%`.

- [ ] **Step 3: Publish privately and hand it over**

Publish with the `Artifact` tool: `file_path: SCRATCH/t9/site/index.html`, `files: {"img/<b>.jpg": "SCRATCH/t9/site/img/<b>.jpg", …}` for all rendered figures, `favicon: "🧪"`, `description: "Before/after stacks of the 34 ch03/ch04 figures recomposed with run-exact kept text — the merge gate for §C140 ①."`.
Send [USER] the link with one paragraph: what to look for (the "should change" cards first), what is expected to look the same, and the question **"Do these pass — may the PR be merged?"**

- [ ] **Step 4: STOP until [USER] answers**

Do not start Task 10's push/PR until [USER] has looked and said yes. If [USER] finds a problem, it goes back through systematic debugging on this branch — do not merge around it.

---

### Task 10: Documentation, push, PR

**Files:**
- Modify: `docs/plans/2026-07-21-post-item17-followup-campaign.md` (new ⏩ RESUME block; §C140 ① row status)
- Modify: `EXP/REGISTER.md` (new ⏩ RESUME block; `compose.py` / `svgout.py` component rows)
- Modify: `EXP/README.md` (the `compose.py --control` lines ~130/143/172)
- Modify: project memory `figure-compose-damages-formulas.md` + `MEMORY.md` pointer line

**Interfaces:**
- Consumes: Task 7's VERIFICATION.md, Task 9's artifact URL and [USER]'s answer.
- Produces: the PR.

- [ ] **Step 1: Campaign register**

Add a new `## ⏩ RESUME — state as of **2026-09-13 (EVENING)** (supersedes every block below)` above the afternoon block, and change the afternoon heading to `(superseded by the block above)`. Its content: **E is built and verified** (cite `experiments/figure-text-translation/evidence/2026-09-13-e-build/VERIFICATION.md` — no numbers restated), the 34 are recomposed on the branch, [USER] accepted the pictures on <date> (artifact link); **SINGLE NEXT ACTION: merge → `./scripts/deploy.sh` (the `.cjs` bump is a server change; verify the figures route) → then [USER]'s publication decision for ch03/ch04 (render + vefur sync, which also replaces the corrupt June HClsoln, ⑧)**; buying stays stopped, ②–⑦ unruled. In §C140's table set ①'s status cell to `✅ built + verified on feat/c140-e-run-exact-kept-text; [USER] accepted <date>` and ⑧'s to note the recomposed HClsoln carries 0 stretched rasters (62 images) against the June copy's 17 of 27, so render + sync cures it.

- [ ] **Step 2: Figure-text REGISTER.md and README**

`REGISTER.md`: new dated ⏩ RESUME block pointing at the spec, VERIFICATION.md and the campaign register §C140 (no status restated beyond "E shipped on the branch"); in the component table set `compose.py` to `✅ kept blocks drawn run-exact (§C140 ①) · ❌ translated blocks still flattened, BOXW=63 + centre anchor (②, ③)` and `svgout.py` to `✅ Regular/Bold/Italic/BoldItalic`. Mark the old `--control IS NOT A SOURCE-FAITHFUL BASELINE` paragraph `❌ SUPERSEDED 2026-09-13 by E — --control now draws every block run-exact`.
`README.md`: where it describes `--control` as "re-injects the ENGLISH", add "— drawn run-exact since §C140 ① (a faithful redraw; it no longer exercises the layout path)".

- [ ] **Step 3: Memory (pointers only, no file:line, no status)**

In `figure-compose-damages-formulas.md` append: `▶ E (run-exact kept text) was built 2026-09-13 — design in docs/superpowers/specs/2026-09-13-c140-e-run-exact-kept-text-design.md; what is next lives in the campaign register.` Run the CLAUDE.md check: `grep -nE '[a-z0-9_-]+\.(js|sh|md|json|yml):[0-9]+' <memory>/MEMORY.md` → no output.

- [ ] **Step 4: Commit docs**

```bash
git add docs/plans/2026-07-21-post-item17-followup-campaign.md experiments/figure-text-translation/{REGISTER.md,README.md}
git commit -m "docs(figures): E built, verified and accepted — next is merge, deploy, publication call

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01W11kXYeK3JsWvW7Fv4QP4X"
```

- [ ] **Step 5: Push and open the PR**

```bash
git push -u origin feat/c140-e-run-exact-kept-text
gh pr create --title "§C140 ① E: draw English-kept figure text run-exact; recompose the 34 ch03/ch04 figures" --body-file "$SCRATCH/pr-body.md"
```
`pr-body.md`: summary (what E does, what it does not), links to spec / plan / VERIFICATION.md / acceptance artifact, the Python result (12 files ALL PASS, by name) and the JS result (failing set identical to `main`'s 36 by name — `main` is not green, and this PR does not change that), the **deploy note** (`figure-text-sidecar.cjs` is required by `figureReviewService.js`: merge → `deploy.sh` → verify the figures route; ⚠️ pushing to `main` strands prod's content backup until the next deploy), and "not rendered or synced — publication is a separate [USER] decision". End with:
```
🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_01W11kXYeK3JsWvW7Fv4QP4X
```

- [ ] **Step 6: Hand over**

Report the PR URL. **Merge only on [USER]'s instruction** (a merge commit, not a squash — the register cites individual SHAs). `./scripts/deploy.sh` runs on prod and needs a human for `sudo`.
