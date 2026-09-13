# §C140 ① — E: draw English-kept figure text run-exact — design

**Date:** 2026-09-13 · **Status:** design, **revised the same day** after an adversarial review.
**Owner of:** the DESIGN of E — how `compose.py` draws a block it does not translate, the report
fields that name those blocks, and the repair of the 34 figures bought 2026-09-12.
**Status of the work lives in** the campaign register's ⏩ RESUME and §C140, and figure-text status in
`experiments/figure-text-translation/REGISTER.md`. This document carries no status verbs.
**Evidence it rests on (frozen, cited, never restated):**
[`experiments/figure-text-translation/COMPOSE-FIDELITY.md`](../../../experiments/figure-text-translation/COMPOSE-FIDELITY.md)
and its `evidence/2026-09-13-compose-fidelity/` — in particular the prototype diffs
`instruments/2a/compose.run-exact.diff` / `svgout.run-exact.diff` and the report `reports/2a-prototype.md`.

> 🔴 **REVISION — 2026-09-13, after a 14-agent adversarial review (4 lenses, a refute-by-default
> skeptic per finding): 8 CONFIRMED, 1 PARTIAL, 0 REFUTED, plus 6 minor unverified findings, all
> adopted.** The architecture and rulings survived untouched. What changed is almost entirely the
> TESTING: **one "green" control could never pass, and three "RED" predictions were green on unchanged
> code** — exactly the failure the first version's own self-review warned about. Corrections:
> - **The `<style>` control cannot be byte-equal** — fontTools stamps `head.modified` into every
>   woff2 subset, so the unchanged composer does not reproduce its own bytes. → pinned clock + structural compare.
> - **`strip_undecodable` is dead after E**, not "still used by translated/arc paths" (it never was). → deleted; 9i retargeted.
> - **A multi-LINE identity block is drawn at source positions by unchanged code** too. → must be multi-RUN, checked alone first.
> - **The subscript plant can split into its own block** and then passes on unchanged code. → concrete geometry + precondition.
> - **Nothing covered the translated arc path.** → a planted translated arc inside the control.
> - **"Translated blocks" was ambiguous** (identity keys stay in `translated`). → defined as `translated − identity`, with a named instrument.
> - **The arc exposure was wrong**: E mostly changes ~107 kept *formula-arcs*, which today are drawn bent; SciMethod's arcs are all sent. → re-stated, measured on a formula-arc.
> - **The JS side has pre-existing, corpus-coupled reds that move between commits.** → by-name JS baseline with per-commit expected sets.
> - **The repair pre-flight checked lines the dry run does not print.** → rewritten against real output.

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
- Making recomposed SVGs byte-stable (pinning `head.modified` in product code). Tests pin the clock;
  product output stays as today.
- Re-rendering ch03/ch04 into `05-publication/` or syncing to vefur. That is [USER]'s publication
  decision, taken after R4, and it is also what finally replaces the corrupt June HClsoln file (⑧).
- Fixing `figtext.lines()`/`group()`/`is_arc()` (M3/P3). **Block keys must not move** — they are what was bought.

---

## Components

### 1. `blockkey.py` — the wire text joins the key as ONE rule

```python
def block_english(block):
    """What emit-blocks.py SENT for this block: the key for an arc (FT.is_arc), otherwise the
    lines joined by ONE space."""
```

`emit-blocks.py` computes `joined = key if arc else ' '.join(lines)` inline, with `arc = FT.is_arc(b)`.
It moves here verbatim. **Every restatement of the rule imports it** — behaviour-identical, verified by
`blocks.json` byte-identity on the fixture and on the real figures (T3):
`emit-blocks.py`, `census.py`, `test_sendable.py`, `test_make_fixture.py` (whose copy ignores arcs; the
fixture has none) and `test_figure_compose.py`'s `regenerate_blocks`. Re-derive the list with
`grep -an "' '.join" *.py` before editing; do not trust this one.

⚠️ **Why here and not in `figtext.py` (R3's letter):** `blockkey.py` imports `figtext.py` at module
scope, so `figtext.py` cannot import `block_lines`. And the rule belongs beside `block_key`: key and
wire text are both *what was bought*.

⚠️ **The prototype derived the wire from compose's own `arc`** (`is_arc and a usable circle`), which
excludes degenerate arcs. `emit-blocks.py` decides with `FT.is_arc` alone. On a multi-line degenerate
arc the two disagree — emit sent the bare concatenation, the prototype compared against a
space-joined string — so an identical reply would have been classed as a translation.

### 2. `figtext.py` — three pure helpers, one deletion

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
    """(text, token_removed): the run's text with pdfminer `(cid:N)` placeholders removed by
    _CID_TOKEN — the ONE remover regex.  NO .strip(): a run's edge spaces are glyph positions.
    token_removed is `text != run['text']`."""
```

- **Token equality is the right equivalence**, not byte equality: `translate-blocks.mjs` `.trim()`s the
  reply, and the translated path reads a value only through `para.split()`, so two token-equal values
  already draw identically there.
- **Identity is decided only after the empty/whitespace check.** An empty value stays `missing`.
- **`run_face` on an absent font draws Regular rather than raising.** Such a block is already held back
  by `sendable` (`missing_fonts`), so it only ever arrives here as kept English; crashing a compose over
  a plumbing fault the spend gate already reports would turn a report into a failed figure.
- **`run_draw_text` keeps edge spaces.** `strip_undecodable`'s `.strip()` is what named 19 keys in 8
  figures as undecodable when they carry no `(cid:` at all.
- **`strip_undecodable` is DELETED.** Its only caller is `compose.py`'s `keep_english`, which runs only
  for kept blocks (CONTROL and missing); the translated path — straight and arc — never called it. Under
  E every kept block goes through `run_draw_text`, so both are dead. Its docstring's durable content
  (why the token is removed at the draw site and never at extraction) moves to `run_draw_text`, and
  the comment above `_CID_TOKEN` is re-pointed at it.

### 3. `compose.py` — one decision, one draw path

```
kept := --control  OR  key ∉ TR  OR  value empty/whitespace  OR  is_identity(...)
```

- A kept block is drawn by `draw_run_exact(block)`: for each run, `run_draw_text` → skip if `''` →
  `run_face` → `select_font_face(FAMILY, SLANT_ITALIC|NORMAL, WEIGHT_BOLD|NORMAL)` → translate to the
  run's own origin, rotate by its own `rot`, set its own fill, `show_text`. One `ITEMS` entry per
  drawn run, carrying `italic`. **Weight, slant and fill are per RUN** — today they are per line, so a
  kept line that mixes weights gains a face (correct, and 0 such lines in the 34).
- **This includes kept arc blocks.** Each glyph run already carries its source origin and rotation;
  the circle fit remains only for a *translated* arc. See § Consequences for what that changes.
- `degenerate` is still recorded for any block `is_arc` calls an arc with no usable circle. **Its
  stdout warning is split by path**: a translated degenerate block is still "DRAWN STRAIGHT"; a kept one
  is drawn run-exact and says so. The `fit_circle` docstring and the comment above the arc decision are
  corrected to match.
- A key goes to `undecodable` iff `run_draw_text` removed a token from one of its runs.
- Translated blocks take the existing arc / layout path, **unchanged**. Their `ITEMS` gain
  `italic: False` and nothing else.
- **Report (`compose-report.json`), additive only:**
  - `identity` — keys classed identity, in draw order, with multiplicity. **They also stay in
    `translated`**: `figure-compose.py` assertion 2 requires `missing == send:false keys`, and moving an
    identity key into `missing` would refuse a correct figure.
  - `runExact` — every kept key drawn run-exact, in draw order, with multiplicity.
  - `blocks` / `missing` / `translated` / `degenerate` / `control` / `translationsPath` keep their meaning.
  - `undecodable` keeps its meaning and **loses its false positives** (edge-space lines). Consumers in
    `tools/figure-run.js` / `tools/lib/figure-outcomes.js` are checked in the plan for any outcome or
    verdict that keyed on a false positive.
- **Not carried over from the prototype:** the `PROTO_RUNEXACT` switch and the `items-*.json` dump.
  They were instruments. A switch that restores the damaging path in product code is a hazard. (T3
  re-creates the dump in scratch copies only.)

### 4. `svgout.py` — italic faces

- `FACES` keyed `(bold, italic)`; Liberation Sans Italic and BoldItalic added.
- An `@font-face` rule is emitted **only for a face some item uses**, iterated
  `(F,F), (T,F), (F,T), (T,T)` — so for a figure whose items carry the same (weight, text) as today and
  no italic, the rules are **structurally** today's: same count, same (weight, style) order, same
  character set per face. (Not byte-equal: fontTools stamps the time into each subset.)
- An italic item gets `font-style="italic"`. Still one `<text>` per item.
- `xml:space="preserve"` is already on every element and is now load-bearing (typed arrow gaps).

### 5. `tools/lib/figure-text-sidecar.cjs` — `COMPOSER_VERSION` `'1'` → `'2'`

- Its docstring's contract is exactly this case: a composer change that alters pixels for unchanged text.
- Effect, all by existing code: `isStale` is true for every sidecar whose `composedVersion` is `'1'`
  (`tools/figure-run.js`), so `--stale` recomposes; `publish-figure-svg.js` restamps `composedVersion`
  and leaves `renderHash`/`composerVersion`/`blocks` alone; `editorialState` demotes any `approved`
  sidecar until re-approved.
- **Measured pre-condition on the local tree: no committed sidecar carries `state`** — 34 in
  `books/efnafraedi-2e/`, 3 in `books/__e2e-fixture__/` (no `renderHash` either). ⚠️ **The local tree
  is not the authority: prod writes `state` on approval and pushes on the 2-hourly cron.** Re-check
  against `origin/main` after a fetch, before the repair commit and again before merge. The repair commit
  edits the same sidecar files an approval on prod would, and `merge=ours` covers only
  `translation-errors.json`, so a concurrent prod approval would also conflict at `deploy.sh`'s
  `git pull --rebase`.
- ⚠️ **This is a SERVER change.** `server/services/figureReviewService.js` requires this module, so the
  review panel runs the old constant until prod is deployed. Order: **merge → `deploy.sh` → verify the
  figures route.**

### Unchanged, deliberately

`figure-compose.py` (reads only `blocks`/`missing`/`translated`; its `control` guard still applies) ·
`figtext.lines()` / `group()` / `merge_blocks()` / `is_arc()` · `blockkey.block_key` / `block_lines` ·
`strip-text.py` · `figure-prepare.py` · the driver.

---

## Consequences worth stating

**`--control` changes meaning.** It now draws **every** block run-exact — a *faithful redraw of the
source*, so `check.py`'s diff isolates artwork and rasteriser defects. **It no longer exercises the wrap
/ anchor / shrink path at all**, and because identity is detected, *no* translations file can push
English through that path either. **§C140 ③ (per-block wrap budget and anchor) will need its own
switch.** Not built here; recorded so ③ does not discover it. `compose.py`'s docstring and `README.md` say so.

**Kept formula-arcs are straightened — the main arc effect of E, and invisible in the 34.** `is_arc`
calls any block of 4+ single-glyph runs an arc. The 1b census (`reports/1b-census.md` per-feature table)
puts **~117 kept arc blocks in composed figures, ~107 of them formulas read as single-glyph runs**
(mixed sizes, sub/superscripts). Today's composer fits a circle through their script offsets (R/span
well under `ARC_MAX_R_SPANS`) and draws a visibly bent formula with every glyph at the first run's size.
E draws each glyph at its source origin and size. Genuinely curved kept arcs are rare: SciMethod's four
are all `send:true`, so in production they stay on the circle path unless their reply is identity.

---

## Testing — every new assertion is run against the UNCHANGED code first and seen RED

### Baselines, recorded by name before any change

- **Python** (local-only: CI runs none of it, `pylibs/` is not in the repo): all 10 `test_*.py` files
  ALL PASS on `main` at the start of this work, tree unchanged afterwards. Finish line: the same 10 by
  name plus `test_figtext_runexact.py`, diffed by name.
- **JS**: root `npx vitest run --reporter=json` at the branch point; the **failing set by name** is the
  baseline. `main` is not green, and `tools/__tests__/figure-run-free.test.js` holds tests coupled to the
  committed sidecars' `composedVersion`, so **the failing set legitimately moves between commits**:
  after the bump with sidecars still at `'1'`, and back after the repair data commit. The plan states the
  expected set at each commit and diffs it by name in both directions. **A red that is not in the
  expected set stops the work; a red that is in it is not "fixed".**

### T1 — `test_figtext_runexact.py` (new, plain asserts like its siblings)

| helper | cases |
|---|---|
| `blockkey.block_english` | straight multi-line → space-joined; arc → key; **degenerate multi-line arc → key** (the prototype's miss) |
| `is_identity` | identity: multi-line `' '.join`; whitespace-collapsed equation; arc value == key. Not: `X ` prefix; one extra char |
| `run_face` | Regular · Bold · Italic · BoldItalic · Oblique · `ABCDEF+LiberationSans-Italic` · absent key → `(False, False)` |
| `run_draw_text` | `(cid:127) 5% or less` → `(' 5% or less', True)` · `Mass of ` → `('Mass of ', False)` · `(cid:127)` → `('', True)` · **drift guard:** a probe built from `readlayer.CID` has its token removed |

### T2 — end to end, `test_figure_compose.py`, planted runs on the committed fixture

- **Pattern:** case 9's — `figure-prepare.py` on `fixtures/fixture_figure.pdf`, edit `runs.json` /
  `meta.json`, re-derive `blocks.json` with the real rules. **The committed PDF is not regenerated.**
- **Driven with `run_compose_direct`, not the wrapper**, for any case whose plants include a kept
  `send:true` block: the wrapper's assertion 2 refuses a figure whose `missing` differs from its
  `send:false` keys.
- **The clock is pinned:** `SOURCE_DATE_EPOCH` is set at module top before any child is spawned
  (`run_compose_direct` and `run_wrapper` copy `os.environ`; `bare_env` pops only `FIGTEXT_*`), and
  goldens are captured under the same value.

**Plants — each with a PRECONDITION on `blocks.json` checked before its assertion is evaluated.** A
precondition failure is a harness fault and fails the test on its own line, so a plant that silently
became something else cannot turn a RED assertion green.

| plant | geometry | precondition |
|---|---|---|
| subscript | replace the fixture's `H2O (g)` run (12 pt, x=10, y=40) with `H` 12 pt at x=10 · `2` **8 pt** at x=10+adv(H), **y=37** · `O (g)` 12 pt at x=x₂+adv(2), y=40. Must satisfy `figtext.group`'s script clause: shift < 0.45×12 = 5.4 pt, ratio 8/12 ∈ [0.4, 2.5], along-gap ∈ [−0.5, 2.5) | exactly one entry keyed `H2O (g)`, `send:false`; no entry keyed `H`, `2` or `2O (g)` |
| italic | a second `meta.fonts` entry whose `base` is `LiberationSans-Italic`, used by one run of a kept block | that run's block is kept |
| arrow gap | one kept run whose text holds 10 consecutive spaces | the run is intact in `runs.json` |
| **identity** | a sent block with **at least one line of two or more runs** (e.g. a mid-line weight or fill split); its translation is `block_english` of itself | one entry, `send:true`; its line has ≥ 2 runs |
| **kept arc** | ≥ 4 single-glyph runs of equal size, on a real curve (verified shape: 10° steps on R = 60, rot = θ − 90°), consecutive Δrot < 12°, centre distance < 1.6×size; **verbatim** (no run of 3+ letters) so it is `send:false` | ONE entry, `arc: true`, `send:false`; `fit_circle` returns a circle |
| **translated arc** | the same shape, a different place, prose letters, translated to a non-identity value whose glyphs appear nowhere else (e.g. `BOGIX` for `CURVE`) | ONE entry, `arc: true`, `send:true` |

**Assertions**

| assertion | on unchanged code |
|---|---|
| the `2` is its own `<text>` at `font-size="8.000"`, at a `y` 3.000 below its neighbours' | RED |
| an `@font-face` with `font-style:italic` exists and a `<text … font-style="italic">` uses it | RED |
| the 10 spaces survive inside one `<text>` | RED |
| **identity, positional clause ALONE** — every run of the identity block appears as a `<text>` with its own (text, x, y) at 3-decimal precision (element count **and** the second run's x differ from a joined line) — seen RED on the unchanged composer **before** the report clause is added | RED |
| identity, report clause — its key is in `identity` **and** in `translated` | RED |
| each kept-arc glyph is a `<text>` at its run's (text, x, y) with `rotate(-rot …)` | RED |
| an edge-space kept line is **not** in `undecodable`; a planted `(cid:127)` run still is | RED (first half) |
| **CONTROL (translated population)** — the `<text>` elements of `Counter(translated) − Counter(identity)` — the plain translated blocks **and the translated arc** — equal a golden captured from the unchanged composer on the same planted input. Selected by their planted non-identity values; the translated arc's glyphs are each their own `<text>` | green |
| **CONTROL (faces)** — on the unplanted fixture plus a variant with one whole **bold** run: the `<style>` block's `@font-face` count, ordered (weight, style) pairs, and each face's decoded woff2 cmap character set equal the unchanged composer's | green |

The goldens are captured from the unchanged `compose.py` and committed **before** the implementation
commit, so the controls are real constraints rather than descriptions of new output.

**Existing pins that change, as recorded decisions**
- **9i/9j** retarget from `strip_undecodable` (deleted) to `run_draw_text`, with the probe still derived
  from `readlayer.CID`; the expectation keeps the edge space (`(' x', True)`), not `'x'`.
- **9p** ("exactly one empty `<text>`") becomes **zero**, because a run that strips to `''` is skipped —
  **paired** with `'(cid:127)'` in `report['undecodable']` and in `report['runExact']`, so the zero cannot
  be the result of a block that was never processed.
- Any other assertion that breaks is updated only after the reason is read and written into the test.

### T3 — real figures, 0 ISK, recorded in the PR, not committed as tests

Re-prepare the 34 bought figures; compose each **unchanged vs changed** with its committed sidecar.
**Attribution instrument:** a scratch-only patch applied identically to both copies that dumps `ITEMS`
with the block index and draw path — never committed. The translated population is
`Counter(translated) − Counter(identity)`, block occurrences in draw order.

| measure | predicted |
|---|---|
| `blocks` / `missing` / `translated` multisets equal | 34 / 34 figures |
| translated-population items identical (text, x, y, size, rot, bold, rgb) | 34 / 34 — ⚠️ **the population is EMPTY on HClsoln, basehyd and GreenChem** (every sent key is identity), so the prediction is non-vacuous on 31 |
| `identity` entries (drawn blocks) | **7** |
| `runExact` entries (drawn blocks) | **191** |
| `emit-blocks.py` `blocks.json` byte-identical after the `block_english` refactor | 34 / 34 |

A miss on any predicted number stops the work until it is explained.

**Arcs, measured once on real artwork, through the ordinary kept path (not `--control`):**
1. a composed figure holding a **kept formula-arc** (candidate: `CNX_Chem_14_03_corresp` — re-derive
   from the 1b census), composed with `compose.py` directly and an empty translations file, unchanged vs
   changed, per-block ink against the 200 dpi source render with `evidence/…/instruments/1a/fidelity.py`;
2. `CNX_Chem_01_01_SciMethod` (four genuine curved arcs) the same way — this speaks only for the
   identity/control path, since those arcs are sent.

### T4 — JS

Against the by-name JS baseline above: the expected set after the bump commit, and after the repair data
commit. `figure-text-sidecar.test.js` uses `COMPOSER_VERSION` by reference; its byte-pin writes `'1'` as
literal data and is unaffected. `server/e2e/figure-review.spec.js` reads `books/__e2e-fixture__` sidecars
that carry no `state` or `renderHash`, so the bump cannot demote them — the CI e2e job is the check.

---

## The repair run — 0 ISK, a separate data commit, before the PR is merged

1. **Pre-flight (free), AFTER the bump commit** — before it, the tally reads `skipped-current`:
   - `git fetch origin` and `git grep -c '"state"' origin/main -- 'books/*/figure-text/*.json'` → expect 0.
   - `node tools/figure-run.js --book efnafraedi-2e --chapter 3 --stale --dry-run`. Expect these
     **printed** lines: `15 figure(s) across …`; `--stale: 26 figure(s) in this chapter have no sidecar
     and were not selected`; a tally of `15 translated` with no `failed-*` / `unresolved` /
     `unreadable-text` / `copied-*` rows; `15 = enumerated`; `VERDICT ok`.
   - Chapter 4: the same with **19** selected / **11** deselected / `19 translated` / `19 = enumerated`.
   - **15 + 19 = 34** must equal the number of committed sidecars.
   - ⚠️ **`= enumerated` is the SELECTED count** — the chapter totals (41, 30) are not printed. And no
     dry-run line reports purchases: **"0 purchases" is guaranteed by code** (the `--stale` selection
     keeps only figures that already have a sidecar, and the paid step runs only for a figure without
     one), not by output. The live run's `MT spawned for N figure(s)` line is the observable, and must read 0.
2. **Real run:** the same commands without `--dry-run`, **in the foreground, in modest batches** (four
   background runs were killed 2026-09-12; a kill loses nothing). Expect 34 recomposed, `MT spawned` 0,
   each `books/efnafraedi-2e/media/<basename>_IS.svg` rewritten, each sidecar's `composedVersion` → `'2'`
   and no other field changed (diff the sidecars; `git diff --stat` alone cannot show which field moved).
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
· `compose.py` module docstring, the `fit_circle` docstring, the degenerate warning, and `README.md`
(`--control` now means a faithful redraw; ③ needs its own switch) · project memory, pointers only.

## Hazards carried from the evidence and the review

- **Block keys must not move.** Nothing in `lines()`/`group()`/`block_key` changes. T3's
  `blocks.json` byte-identity is the check.
- **One `<text>` per run changes element counts and splits a kept label across elements.**
  `test_figure_compose.py`'s `drawn_text` regex and any `any('label' in t)` assertion must be read,
  not bulk-edited.
- **`--stale`, never a bare run.** A bare run buys any figure with no sidecar.
- **fontTools stamps `head.modified`**: recomposed SVGs are byte-different on every run, and so is every
  `<style>` block unless `SOURCE_DATE_EPOCH` is set. Compare `<text>` elements and face structure, never
  whole-file or whole-style hashes.
- **A plant is not what its description says until its precondition passed.** `figtext.group` silently
  re-classifies a run that falls outside a clause's limits.
- **Mutation-testing restore:** copy each file to a golden copy before the first mutation, `cmp` after
  every round and at the end; run `git status --porcelain` whenever an agent that mutates files goes quiet.
- **A kept run whose `(cid:N)` is removed keeps its origin**, so the glyphs after the token shift left by
  the token's width. 0 such runs in the 34; accepted and named in `undecodable`.
