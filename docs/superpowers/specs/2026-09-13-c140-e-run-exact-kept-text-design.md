# §C140 ① — E: draw English-kept figure text run-exact — design

**Date:** 2026-09-13 · **Status:** design.
**Owner of:** the DESIGN of E — how `compose.py` draws a block it does not translate, the report
fields that name those blocks, and the repair of the 34 figures bought 2026-09-12.
**Status of the work lives in** the campaign register's ⏩ RESUME and §C140, and figure-text status in
`experiments/figure-text-translation/REGISTER.md`. This document carries no status verbs.
**Evidence it rests on (frozen, cited, never restated):**
[`experiments/figure-text-translation/COMPOSE-FIDELITY.md`](../../../experiments/figure-text-translation/COMPOSE-FIDELITY.md)
and its `evidence/2026-09-13-compose-fidelity/` — in particular the prototype diffs
`instruments/2a/compose.run-exact.diff` / `svgout.run-exact.diff` and the report `reports/2a-prototype.md`.

---

## Rulings this design is built on — do not re-litigate

| # | ruling | by |
|---|---|---|
| R1 | **Build E** (draw English-kept blocks run-exact), not E′ (selective strip), B′ (stamp at mint) or D (distinct disposition) | [USER] 2026-09-13 |
| R2 | **E only.** `geometricPrecision`, per-run `font-kerning`, STIX re-embedding (⑥), the strip-text colour fix (④) and page-box padding (⑤) are **out** | [USER] 2026-09-13 |
| R3 | The pure decisions live as **helpers beside the rules they belong to**, unit-tested alone; `compose.py` keeps only the cairo calls | [USER] 2026-09-13 |
| R4 | The PR is not merged until [USER] has **looked at the recomposed figures** | [USER] 2026-09-13 |
| R5 | Buying figures stays stopped; which of ②–⑦ must land before it resumes is **not ruled** | [USER] 2026-09-13 |

---

## Purpose

`compose.py` redraws every label from scratch because `strip-text.py` removed every glyph from the
artwork. For a block it *translates* that is unavoidable. For a block it *keeps in English* it is
pure loss: the read layer's `runs.json` carries each run's origin, size, baseline, rotation, fill and
font, and `compose.py` throws that away by joining a line into one string, drawing it at one size on
one baseline, collapsing its whitespace in `wrap()` and never selecting a slant (mechanisms M1–M4,
P2, P3 in `COMPOSE-FIDELITY.md`).

**E draws a kept block the way the source drew it: every run at its own position, size, rotation,
fill and face.** Nothing is joined, wrapped, re-anchored, re-led or re-sized. Translated blocks are
not touched.

## Non-goals

- Translated blocks — formula formatting inside MT prose (§C140 ②) and re-flow collisions (③).
- Browser rendering knobs and STIX faces (⑥); artwork-side defects (④ ⑤); spend gates (⑦).
- Re-rendering ch03/ch04 into `05-publication/` or syncing to vefur. That is [USER]'s publication
  decision, taken after R4, and it is also what finally replaces the corrupt June HClsoln file (⑧).
- Fixing `figtext.lines()`/`group()` (M3/P3). **Block keys must not move** — they are what was bought.

---

## Components

### 1. `blockkey.py` — the wire text joins the key as ONE rule

```python
def block_english(block):
    """What emit-blocks.py SENT for this block: the key for an arc, otherwise the lines
    joined by ONE space."""
```

`emit-blocks.py` currently computes `joined = key if arc else ' '.join(lines)` inline, with
`arc = FT.is_arc(b)`. It moves here verbatim and `emit-blocks.py` imports it — a
**behaviour-identical** refactor, verified by `blocks.json` byte-identity on the fixture and on a real
figure. `test_figure_compose.py`'s `regenerate_blocks` copy uses it too.

⚠️ **Why here and not in `figtext.py` (R3's letter):** `blockkey.py` imports `figtext.py` at module
scope, so `figtext.py` cannot import `block_lines`. And the rule genuinely belongs beside
`block_key`: key and wire text are both *what was bought*.

⚠️ **The prototype derived the wire from compose's own `arc`** (`is_arc and a usable circle`), which
excludes degenerate arcs. `emit-blocks.py` decides with `FT.is_arc` alone. On a multi-line degenerate
arc the two disagree — emit sent the bare concatenation, the prototype compared against a
space-joined string — so an identical reply would have been classed as a translation. Importing the
one rule closes that.

### 2. `figtext.py` — three pure helpers

```python
def is_identity(value, english, arc):
    """Did the MT give back what went on the wire?  `value` is the RAW translations entry
    (str, or a legacy list); `english` is blockkey.block_english(block); `arc` is the
    composer's draw-shape decision.  True iff the value, shaped as the composer would draw
    it (normalise_block_value), is TOKEN-equal to `english`."""

def run_face(run, fonts):
    """(bold, italic) from meta.fonts[run.font].base — the BaseFont, never the resource name.
    'oblique' counts as italic.  A font key absent from `fonts` draws Regular."""

def run_draw_text(run):
    """(text, token_removed): the run's text with pdfminer `(cid:N)` placeholders removed.
    NO .strip() — a run's edge spaces are glyph positions."""
```

- **Token equality is the right equivalence**, not byte equality: `translate-blocks.mjs` `.trim()`s the
  reply, and the translated path reads a value only through `para.split()`, so two token-equal values
  already draw identically there.
- **Identity is decided only after the empty/whitespace check.** An empty value stays `missing`.
- **`run_face` on an absent font draws Regular rather than raising.** Such a block is already held back
  by `sendable` (`missing_fonts`), so it only ever arrives here as kept English; crashing a compose over
  a plumbing fault that the spend gate already reports would turn a report into a failed figure.
- **`run_draw_text` keeps edge spaces.** `strip_undecodable`'s `.strip()` is what named 19 keys in 8
  figures as undecodable when they carry no `(cid:` at all. `strip_undecodable` itself is unchanged —
  translated/arc paths still use it.

### 3. `compose.py` — one decision, one draw path

```
kept := --control  OR  key ∉ TR  OR  value empty/whitespace  OR  is_identity(...)
```

- A kept block is drawn by `draw_run_exact(block)`: for each run, `run_draw_text` → skip if `''` →
  `run_face` → `select_font_face(FAMILY, SLANT_ITALIC|NORMAL, WEIGHT_BOLD|NORMAL)` → translate to the
  run's own origin, rotate by its own `rot`, set its own fill, `show_text`. One `ITEMS` entry per
  drawn run, carrying `italic`.
- **This includes kept arc blocks.** Each glyph run already carries its source origin and rotation;
  the circle fit remains only for a *translated* arc. `degenerate` is still recorded for any block
  `is_arc` calls an arc that has no usable circle, kept or not.
- A key goes to `undecodable` iff `run_draw_text` removed a token from one of its runs.
- Translated blocks take the existing arc / layout path, **byte-for-byte unchanged**. Their `ITEMS`
  gain `italic: False` and nothing else.
- **Report (`compose-report.json`), additive only:**
  - `identity` — keys classed identity, in draw order, with multiplicity. **They also stay in
    `translated`**: `figure-compose.py` assertion 2 requires `missing == send:false keys`, and moving an
    identity key into `missing` would refuse a correct figure.
  - `runExact` — every kept key drawn run-exact, in draw order, with multiplicity.
  - `blocks` / `missing` / `translated` / `degenerate` / `control` / `translationsPath` keep their meaning.
- **Not carried over from the prototype:** the `PROTO_RUNEXACT` switch and the `items-*.json` dump.
  They were instruments. A switch that restores the damaging path in product code is a hazard.

### 4. `svgout.py` — italic faces

- `FACES` keyed `(bold, italic)`; Liberation Sans Italic and BoldItalic added.
- An `@font-face` rule is emitted **only for a face some item uses**, iterated
  `(F,F), (T,F), (F,T), (T,T)` — so a figure with no italic item emits **exactly** today's rules, in
  today's order.
- An italic item gets `font-style="italic"`. Still one `<text>` per item.
- `xml:space="preserve"` is already on every element and is now load-bearing (typed arrow gaps).

### 5. `tools/lib/figure-text-sidecar.cjs` — `COMPOSER_VERSION` `'1'` → `'2'`

- Its docstring's contract is exactly this case: a composer change that alters pixels for unchanged text.
- Effect, all by existing code: `isStale` is true for every sidecar whose `composedVersion` is `'1'`
  (`tools/figure-run.js`), so `--stale` recomposes; `publish-figure-svg.js` restamps `composedVersion`
  and leaves `renderHash`/`composerVersion`/`blocks` alone; `editorialState` demotes any `approved`
  sidecar until re-approved.
- **Measured pre-condition: no committed sidecar carries `state`** — 34 in `books/efnafraedi-2e/`,
  3 in `books/__e2e-fixture__/` (which carry no `renderHash` either). Re-grep before the bump.
- ⚠️ **This is a SERVER change.** `server/services/figureReviewService.js` requires this module, so the
  review panel runs the old constant until prod is deployed. Order: **merge → `deploy.sh` → verify the
  figures route.**

### Unchanged, deliberately

`figure-compose.py` (reads only `blocks`/`missing`/`translated`; its `control` guard still applies) ·
`figtext.lines()` / `group()` / `merge_blocks()` / `is_arc()` · `blockkey.block_key` / `block_lines` ·
`strip-text.py` · `figure-prepare.py` · the driver.

---

## Consequence worth stating: `--control` changes meaning

Under E, `--control` draws **every** block run-exact, so it becomes a *faithful redraw of the source*
— `check.py`'s diff against the published raster gets sharper (a disagreement now isolates artwork and
rasteriser defects). **But it no longer exercises the wrap / anchor / shrink path at all**, and because
identity is detected, *no* translations file can push English through that path either. **§C140 ③
(per-block wrap budget and anchor) will need its own switch** — e.g. a mode that treats each block's
English as a non-identity translation. Not built here (YAGNI); recorded so ③ does not discover it.
`compose.py`'s docstring and `README.md` say so.

---

## Testing — every new test is run against the UNCHANGED code first and seen RED

The Python suite is **local-only** (CI runs none of it: `pylibs/` is not in the repo). Baseline on
`main` at the start of this work: **all 10 `test_*.py` files ALL PASS**, tree unchanged afterwards.
The finish line is the same 10 by name plus the new file, diffed by name.

### T1 — `test_figtext_runexact.py` (new, plain asserts like its siblings)

| helper | cases |
|---|---|
| `blockkey.block_english` | straight multi-line → space-joined; arc → key; **degenerate multi-line arc → key** (the prototype's miss) |
| `is_identity` | identity: multi-line `' '.join`; whitespace-collapsed equation; arc value == key. Not: `X ` prefix; one extra char; empty never reaches it (asserted at the call site, T2) |
| `run_face` | Regular · Bold · Italic · BoldItalic · Oblique · `ABCDEF+LiberationSans-Italic` · absent key → `(False, False)` |
| `run_draw_text` | `(cid:127) 5% or less` → token removed, flagged · `Mass of ` → unchanged, **not** flagged · `(cid:127)` alone → `''`, flagged |

### T2 — end to end, `test_figure_compose.py`, planted runs on the committed fixture

Pattern is case 9's: `figure-prepare.py` on `fixtures/fixture_figure.pdf`, edit `runs.json` /
`meta.json`, re-derive `blocks.json` with the real rules. **The committed PDF is not regenerated.**
Planted: a subscript (`H` · smaller `2` below the baseline · `O`), an italic font in `meta.fonts` used by
one run, a 10-space gap inside one run, a genuine curved arc of single-glyph runs each with its own
`rot`, and a sent block whose translation equals its English.

⚠️ **The identity block must be MULTI-RUN or MULTI-LINE.** A single-run, single-line block is already
drawn at its source origin by the unchanged layout path (the prototype's E4-ctrl found exactly that on
the 3 figures holding only such blocks), so a positional assertion on one would be green on unchanged
code and prove nothing.

| assertion on `translated.svg` / `compose-report.json` | on unchanged code |
|---|---|
| the `2` is its own `<text>` at its own `font-size`, at a `y` that differs from its neighbours' by the planted shift | RED |
| an `@font-face … font-style:italic` rule exists and a `<text … font-style="italic">` uses it | RED |
| the 10 spaces survive inside one `<text>` | RED |
| the identical block's key is in `identity` **and** `translated`, and its runs are drawn at their source x/y | RED |
| each planted arc glyph is a `<text>` at its run's x/y with `rotate(-rot …)` | RED |
| an edge-space kept line is **not** in `undecodable`; a planted `(cid:127)` run still is | RED (first half) |
| **CONTROL:** the translated blocks' `<text>` elements equal a golden captured from the **unchanged** composer on the same planted input | green |
| **CONTROL:** a figure with no italic run emits a `<style>` block byte-equal to the unchanged composer's | green |

The goldens are captured by running the unchanged `compose.py` and committed **before** the
implementation commit, so the controls are real constraints rather than descriptions of new output.

**Existing pins that change, as recorded decisions:** 9p ("exactly one empty `<text>`") becomes zero,
because a run that strips to `''` is skipped. Any other assertion that breaks is updated only after the
reason is read and written into the test.

### T3 — real figures, 0 ISK, recorded in the PR, not committed as tests

Re-prepare the 34 bought figures, compose each **unchanged vs changed** with its committed sidecar.
**Predicted before the run:**

| measure | predicted |
|---|---|
| `blocks` / `missing` / `translated` multisets equal | 34 / 34 figures |
| translated blocks' `<text>` elements identical | 34 / 34 |
| `identity` entries (drawn blocks) | **7** |
| `runExact` entries (drawn blocks) | **191** |
| `emit-blocks.py` `blocks.json` byte-identical after the `block_english` refactor | 34 / 34 |

A miss on any predicted number stops the work until it is explained.

**Arcs, measured once on real artwork:** `CNX_Chem_01_01_SciMethod --control` (four genuine arcs),
per-arc ink against the 200 dpi source render with `evidence/…/instruments/1a/fidelity.py` — run-exact
vs the unchanged composer. Recorded with its numbers; the corpus exposure it speaks for is 164 arc
blocks (1b census).

### T4 — JS

Root `npm test` after the bump (the sidecar tests use `COMPOSER_VERSION` by reference; the byte-pin in
`figure-text-sidecar.test.js` writes `'1'` as literal data and is unaffected). `server/e2e/figure-review.spec.js`
reads `books/__e2e-fixture__` sidecars that carry no `renderHash`, so the bump cannot demote them — the
CI e2e job is the check.

---

## The repair run — 0 ISK, a separate data commit, before the PR is merged

1. **Pre-flight (free):** re-grep the 34 sidecars for `"state"` (expect 0). `node tools/figure-run.js
   --book efnafraedi-2e --chapter 3 --stale --dry-run`, then chapter 4: selected = figures with a
   sidecar, **0 purchases planned**, selected + deselected = enumerated.
2. **Real run:** the same commands without `--dry-run`, **in the foreground, in modest batches** (four
   background runs were killed 2026-09-12; a kill loses nothing, the paid stage being all-or-nothing and
   this run buying nothing). Expect 34 recomposed, 0 translate spawns, each
   `books/efnafraedi-2e/media/<basename>_IS.svg` rewritten, each sidecar's `composedVersion` → `'2'` and
   no other field changed.
3. **Convergence control:** an immediate second `--stale` run reports 34 `skipped-current`.
4. **Commit** the media files and sidecars as their own commit.

## Acceptance — R4

- Every one of the 34 is rendered in Chromium through an `<img>` host page (how `cnxml-render.js`
  publishes a figure), as a stack: **source raster / yesterday's composed SVG / the recomposed SVG**.
- Published as one private artifact page, each figure labelled with what E **should** change (the kept
  blocks named in `reports/2a-prototype.md` §4: HClsoln, FishLemon, GreenChem, basehyd, rxn2, combustion
  `O2`) and what it **should not** (sacch and etheneBr — all their damage is in translated blocks; the
  combustion arrowhead colour, ④; the ethene `H` collision, ③; artwork misregistration, ⑤).
- **[USER] looks and says yes.** No value check saw this defect class, so no value check can clear it.

## Documentation, in the same PR

Campaign register §C140 ① status · figure-text `REGISTER.md` component rows (`compose.py`, `svgout.py`)
· `compose.py` module docstring and `README.md` (`--control` now means a faithful redraw; ③ needs its
own switch) · project memory, pointers only.

## Hazards carried from the evidence

- **Block keys must not move.** Nothing in `lines()`/`group()`/`block_key` changes. T3's
  `blocks.json` byte-identity is the check.
- **One `<text>` per run changes element counts and splits a kept label across elements.**
  `test_figure_compose.py`'s `drawn_text` regex and any `any('label' in t)` assertion must be read,
  not bulk-edited.
- **`--stale`, never a bare run.** A bare run buys any figure with no sidecar.
- **fontTools stamps `head.modified`**, so recomposed SVGs are byte-different on every run; compare
  `<text>` elements and sizes, never whole-file hashes.
- **Mutation-testing restore:** copy each file to a golden copy before the first mutation, `cmp` after
  every round and at the end; run `git status --porcelain` whenever an agent that mutates files goes quiet.
- **A kept run whose `(cid:N)` is removed keeps its origin**, so the glyphs after the token shift left by
  the token's width. 0 such runs in the 34; accepted and named in `undecodable`.
