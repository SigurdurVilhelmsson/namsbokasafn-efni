# c2 — §C140 ② T-scripts, the DRAWING half: design evidence

Agent c2, 2026-09-13. **0 ISK**: nothing called the MT. The repository was read-only; `git status --porcelain` was empty at the start, between steps, and at the end (see the last section). All work is in `/home/siggi/dev/scratch-c140/c2/`. **Bytecode caches, checked rather than assumed.** Almost every Python invocation ran with `PYTHONDONTWRITEBYTECODE=1`. Two did not:
- the first `sources.py --json` call, which imports only `_deps`;
- one `python3 -c` probe that imported `figtext`.

The repo's `experiments/figure-text-translation/__pycache__` is git-ignored, so `--porcelain` cannot see it; I checked it directly:
- `find __pycache__ -newer c2/keycheck.py` returns nothing, so no `.pyc` was written after 17:21:07Z.
- The only `.pyc` files touched today are `figtext` and `blockkey` at 17:19:08Z. That is before my first compose/prepare run (17:20:50Z), and the one earlier Python call I made (`sources.py`) cannot write them.
- `_deps` and `sources` `.pyc` still carry mtimes of 09-08 and 09-09.
- The `figtext` probe found a valid `.pyc` (newer than its 16:53Z source), so Python did not rewrite it.

I attribute the 17:19:08Z write to another session.

**Populations used.** Every number states its own unit.
- **The 34** are the bought chemistry figures. I prepared 3 of them myself: sacch, combustion and HClsoln, under `c2/prep/`. For the other 31 I read the other agent's `scratch-c140/prep/figs/`. Before trusting that directory I checked two things. First, `runs.json` in all 3 of my own preparations is byte-identical to its copy there (`cmp`). Second, for all 34 figures the block-key multiset equals `blocks.json`, and the sidecar key set equals the `send:true` key set. In the 34: **367 drawn blocks = 176 translated + 7 identity + 184 never-sent**. I re-measured this with the production `is_identity`; it matches the inherited count.
- **The corpus**: all 1148 enumerated chemistry figures, 910 read OK. This is a fresh read-only re-run of 1b's instrument (`enum.cjs`, `resolve.py`, `census.py`) with fields added (`c2/census/`). It reproduces 1b's funnel exactly: 1148 enumerated, 910 resolved (892 by basename, 18 de-hashed), 612 pdf + 298 eps, 14,962 blocks, 2,946 `send:true`. It also reproduces 1b's 185 italic `send:true` blocks, 8 bold-mixed `send:true` blocks and 21 `send:true` arcs. Those matches are the control that it is the same population.
- **Inherited** means I quote a number without re-measuring it. It is always labelled as such.

---

## TL;DR

1. **The single rule for "sub/superscript" should be neither of the two named in the brief as they stand.**
   - `figtext.group`'s clause (`figtext.py:31-33`) only decides whether two consecutive runs join. It has no baseline and no sign. On the 34 it is the deciding join for **59 non-script runs**: the base letter that follows a script.
   - 2b's rule is the right *shape*: per line, base size taken from the letters, signed shift. It has **two measured defects**:
     - **(a)** Its median baseline misclassifies a same-size script. On a planted `NH4+` it styled `NH`. Corpus-wide there are 18 same-size script runs, for example `Na+` and `δ–`.
     - **(b)** Its `0.12` threshold is not in a gap corpus-wide. It **misses 4 real scripted runs at 0.110–0.111**: the d-orbital labels `dz2` and `dx2–y2`, 7 pt on 9 pt, shifted 1 pt. Whether each digit is a subscript or a superscript-of-a-subscript does not matter, because the transfer carries the geometry either way. At that same fraction sit 10 non-scripts, larger-or-same-size symbol raises such as the STIX `+`/`−` in `(+)`.
   - The corpus separates them **by size**:
     - smaller runs: 0 of 1,843 fall in [0.05, 0.10);
     - same-or-larger runs: 0 of 17,919 fall in [0.12, 0.14).
   - **Recommendation:** a letter-weighted baseline, plus a size-conditional threshold placed in those gaps.
2. **Geometry varies, so carry each stretch's own geometry.** In the 34, all 87 script runs are 7 pt on a 9 pt base (ratio 0.7778). The offsets split into families:
   - subscripts at −2.0 pt (−0.222 of the base size, 31 runs, 7 figures) or −3.0 pt (−0.333, 46 runs);
   - superscripts at +3.0 pt (0.333, 3 runs) or +4.0 pt (0.444, 7 runs).

   FishLemon has both superscript offsets in one figure. A constant ratio would misplace one family by 1 pt. When the block shrinks, scale both ratio and offset by `sz`; a planted shrink confirms this (12 → 6 pt gave the `4` at 4.000 pt, offset 1.5).
3. **The drawing change is contained, and I prototyped it.** The copy is `c2/proto/compose_ts.py` plus `scripts.py`.
   - **Shape:** one ITEMS entry, and therefore one `<text>`, per styled stretch; `svgout.py` needs **no change**.
   - **Byte-identity:** with transfer off, the SVG is byte-identical to the unchanged composer on 14 of 14 figures. With transfer on, every unstyled line is byte-identical.
   - **Where formatting lands:** on the 13 figures [USER] flagged for missing sub/superscripts (exactly the 13 that carry scripted translated blocks), 39 flat elements became 120 styled ones.
   - **Keeping offsets aligned:** the transfer runs on the raw value, and its per-character styles are carried *per word*, so `wrap()`'s whitespace collapse cannot misalign them. The naive "raw offsets on wrapped text" approach misplaces italics on a real value; the demonstration is in Q3.
4. **Two design facts the brief did not anticipate.**
   - **(a)** Measuring styled widths changes the wrap on **3 of 34** styled translated blocks: glycine goes 3→2 lines, which is the source's count; map2 goes 2→1 twice, fewer than the source. So ② is not layout-neutral and interacts with ③.
   - **(b)** Positioning per stretch exposes the gap between cairo's and the browser's advances. In Chromium, a subscript can float up to **1.56 pt** from its base letter after a long plain prefix. Cutting plain text at word edges brings the within-word error to **≤ 0.57 pt**, inside the envelope of E's own run-exact drawing (up to 2.25 pt), which [USER] accepted.
5. **Transfer, re-measured on the current sidecars: 52 of 52 stretches placed** in 38 tokens, 34 blocks and 13 figures, with 0 misses. The identity control reproduces the source styles character for character on **54 of 54** token blocks.
   - The brief's four editor-edit probes are all **named**, never misplaced.
   - **Three new silent-failure shapes** need design:
     - a repeated formula (2b's first-only rule; verify N4);
     - stacked-split charges: **15 of 19** real `send:true` blocks produce no token at all;
     - the anchored fallback under-formats a repeated needle without naming it.
6. **Italic is YAGNI for the 34 and NOT for chemistry.** Corpus-wide, **168 `send:true` blocks mix italic and roman within one line** (79 figures with italic `send:true`, 18 chapters). Bold mixed within a line: **8** `send:true` blocks in 4 figures. **Translated arcs carrying scripts: 0.** There are 21 `send:true` arcs, 0 with size variation and 0 italic. The script rule fires *spuriously* on all of them because of curvature, so it must be gated on `not is_arc`.
7. **`compose-report.json` has no production reader beyond `blocks`/`missing`/`translated`/`control`.** An additive `unformatted` field changes no verdict. My recommendation is to surface it as a NOTE, never as a failure.

---

## Q1 — Which rule says "this source run is a sub/superscript"?

### What each candidate is

| rule | where | shape |
|---|---|---|
| `figtext.group` script clause | `figtext.py:31-33` | pairwise between consecutive runs `(p, r)`: `adjacent and |drot|<3 and |Δproj| < 0.45·max(size) and 0.4 ≤ ratio ≤ 2.5` |
| 2b | `evidence/…/instruments/2b/analyse.py:31-65` | per `FT.lines` line: the base size is the size carrying the most letters; the base baseline is the **median** proj of base-size runs; sub/sup iff `|shift| > 0.12·base` (`SCRIPT_RATIO=0.9` only labels size-only runs `small`) |
| 1b `has_script` | `instruments/1b/census.py:98-110` | per line: `size < 0.9·line max` **and** `|proj − median of full-size runs| > 0.5 pt` |
| 1b `shift_any` | same | `|shift| > 0.5 pt` at any size, arcs excluded |

**Structural fact: the group clause cannot be the classifier.**
- It is a join predicate, not a classifier. It is true for any two runs on one baseline at any ratio in [0.4, 2.5], and it names no reference baseline and no direction.
- **Measured on the 34 (661 non-blank runs):** the clause is true on 86 of 87 script runs. It is also true, and the *deciding* join, on **59 non-script runs**; these are the base run after a script, where a size change makes `cont` false. On 30 more non-script runs it is true but not deciding.
- The one script run it does not join is FishLemon's stacked `+`, joined by the arc clause.
- Its real role is an **upper bound**: a shift of 0.45·size or more makes the script its own block. That is M3, the stacked split.

### Agreement on real runs

- **The 34, 661 runs:** 2b, 1b `has_script` and 1b `shift_any` agree on **every run**: 87 script (77 sub, 10 sup) and 574 not. The gap is complete: non-script `max |shift|` = **0.004 pt**, script `min |shift|` = **2.0 pt**.
  - Controls inside the population: the HClsoln STIX `+ ` (9 pt, same baseline) and the italic `aq`/`l`/`g` are not script under any rule. The sandwich `=` (STIX 10 pt on a 9 pt line, no shift) is a size-only run and not a script.
- **Positive control for same-size scripts (planted):** runs `NH`@9 pt, `4`@7 pt −3, `+`@9 pt +3.
  - 1b `has_script` flags only `4`; it is blind to the same-size `+`, as expected.
  - **2b's median rule styles `NH`.** With two base-size runs, `NH` at 0 and `+` at +3, the median baseline is +1.5, so `NH` gets a shift of −1.5 pt, which exceeds 1.08. **That is a defect in 2b's rule.**
  - A **letter-weighted baseline** fixes it: the baseline is the proj carrying the most letters among base-size runs, clustered to 0.5 pt (`c2/proto/scripts.py:line_char_styles`). The same planted line then gives `NH` → none, `4` → (0.7778, −0.333) and `+` → (1.0, +0.333).
  - The fixed rule gives the same verdict as the census on **661 of 661** runs of the 34, for both script and italic (`c2/rulecheck.py`).
- **Corpus, non-arc, 14,798 blocks** (c2 rule vs 1b `has_script` vs 1b `shift_any`):
  - 13,276 are not script under all three rules, and 1,454 are script under all three.
  - **14** are same-size scripts that c2 and `shift_any` flag and `has_script` misses (`Na+`, `Cl–`, `δ–`).
  - **3** are `has_script` artefacts: in `Metal top cover (+)` an 11 pt STIX `+` makes the 9 pt text "smaller".
  - 10 are `shift_any`-only borderlines (`<90°`).
  - **41** are c2 flags from my census's looser 0.05 predicate on *italic* STIX glyphs raised 0.5 pt. That is an instrument artefact of my census predicate, not of the rule; the recomputation below uses the rule's own quantity.

### The threshold is not in a gap corpus-wide; size separates the classes

`|shift|/base` for every non-blank non-arc run, recomputed from the census runs with the c2 baseline (`c2/census/`):

| run size vs base | [0,.02) | [.02,.05) | [.05,.10) | [.10,.12) | [.12,.14) | [.14,.20) | ≥ .20 |
|---|---|---|---|---|---|---|---|
| smaller (< 0.9·base) | 38 | 17 | **0** | **4** | 0 | 312 | 1,472 |
| same | 17,577 | 20 | 14 | 5 | **0** | 1 | 18 |
| larger (> 1.1·base) | 159 | 0 | 55 | 5 | **0** | 0 | 65 |

- **The smaller [.10, .12) bin holds 4 real scripted runs** that 2b's 0.12 would **miss**: `06_03_Oshapes` `dx2–y2` ×2, `19_03_Dorbital` `dz2`, `19_03_CFSE` `dz2`. These are d-orbital labels, 7 pt on a 9 pt base, shifted 1.0 pt. The classifier only has to fire on them; the carried geometry settles how they are drawn.
- **The same/larger [.10, .12) bins hold 10 non-scripts**: `17_05_DryCell` and `17_05_AlkalineBat` `(+)`/`(−)` with STIX symbols raised 1.0 pt, and `17_04_Relation` 15.93 pt parentheses. All are `send:true`.
- The smaller [.14, .20) bin is ch20 structural formulas (`CH3` subscripts 6.3 pt on 9 pt at 0.151) plus `λ1` (7 pt on 11 pt at 0.182). All are real.

**Recommended single rule, stated as a shape** (one function, imported by every consumer the way `blockkey` is):
- per `FT.lines` line;
- **base size** = the size carrying the most letters;
- **baseline** = the letter-weighted mode of proj among base-size runs;
- a run is **script** iff `|Δproj| ≥ 0.075·base` when `size < 0.9·base`, or `|Δproj| ≥ 0.13·base` otherwise;
- both thresholds sit **inside empty bins of this corpus**;
- arcs are excluded (see Q8).

⚠️ This is gap-centred on Chemistry 2e only. Organic figures were not measured, so re-measure before reusing it there.

🔴 **The size-conditional thresholds (0.075 / 0.13) were placed from this histogram and were never executed.**
- My prototype (`c2/proto/scripts.py`) runs with 2b's flat `SHIFT_FRAC = 0.12` plus the letter-weighted baseline.
- The results 661/661 (Q1), 52/52 (Q4/Q5) and 54/54 (identity), and every drawing measurement, validate *that* rule, not the recommended one.
- On the 34 the two cannot differ: script runs sit at ≥ 0.222 and non-script runs at ≤ 0.0004. Corpus-wide they differ on exactly the 4 d-orbital runs and 0 others by the table above.
- That last statement is also derived, not executed.

⚠️ **Caveat, not measured further:** letter-weighting counts Greek STIX glyphs as letters, so `Δt` (Δ at 11 pt, `t` at 9 pt) gets base size 11. They share a baseline, so nothing mis-fires on this corpus. Excluding symbol-font runs from the base vote is the safer shape.

---

## Q2 — Script geometry

**Own-prepared 3 figures (115 runs):**

| figure | kind | size/base | shift pt | shift/base | runs | block state |
|---|---|---|---|---|---|---|
| sacch | sub | 7/9 | −3.0 | −0.333 | 9 | translated |
| sacch | sup `–1` | 7/9 | +3.0 | +0.333 | 1 | translated |
| combustion | sub | 7/9 | −2.0 (−2.002 ×2) | −0.222 | 9 | 8 translated, 1 never-sent (`O2`) |
| HClsoln | sub | 7/9 | −3.0 | −0.333 | 5 | identity / never-sent |
| HClsoln | sup `+`/`–` | 7/9 | +4.0 | +0.444 | 4 | identity / never-sent |

**The 34 (87 script runs):**
- **ratio** is 0.7778 for all 87;
- **shift/base** for subscripts is −0.222 (31 runs: map2, map3, moleratio1, moleratio2, combmap, combustion, map8) or −0.333 (46);
- **shift/base** for superscripts is +0.333 (3: copperMoles, sacch, FishLemon) or +0.444 (7: basehyd, HClsoln, FishLemon);
- no block's first run is a script, and no line's base size differs from `b[0]['size']`.

**Verdict:** a constant ratio misplaces one family by 1 pt (0.11 em), and FishLemon holds both superscript offsets. **The transfer must carry each source run's own `(size/base, shift/base)`.**
- **Horizontal adjacency** is safe to recompute: consecutive runs abut (inherited from 2b: max along-gap 0.01 pt).
- **Liberation Sans reproduces the source advances:** `2` at 7 pt is 3.892 in `runs.json`, which is 556/1000 em × 7.

**Scaling under shrink:** the drawn size is `sz·ratio` and the offset is `sz·frac`, both relative to the drawn base size.
- **No real case:** 0 of the 34 styled translated blocks shrink. The 7 shrunk blocks in the 14 composed figures have no scripts (`c2/work/*/ts/layout-c2.json`).
- **Planted control** (`c2/q9/shrink_probe.py`): the block shrank 12 → 6.0 pt, and the `4` was drawn at 4.000 pt with a 1.5 pt offset, exactly 6×(8/12) and 6×(3/12).
- ⚠️ That probe also exposed a fallback defect; see Q5 "partial".

---

## Q3 — The translated straight path today, and exactly what changes

### Today (`compose.py`, current HEAD)

| step | lines | what it does | consequence for scripts |
|---|---|---|---|
| `measure(text, run, size)` | 107-109 | `setfont` bold per run, **never slant**; `x_advance` at one size | a script cannot be measured at its own size |
| budget | 289, 295 | `widths` = Σ per-run advance **at each run's own size**; `maxw = max(BOXW 63 or 999 rotated, max(widths)+1)` | the budget is styled… |
| `wrap()` | 303-316 | `para.split()` then greedy `' '.join`, measured **flat at block size** | …but the wrap measures flat. This mismatch is verify-report N1: flattening defeats the budget |
| shrink loop | 318-323 | `sz -= 0.25` while the widest flat line > `maxw` | same |
| centre anchor | 328-331 | `lead = sz0·1.222`; vertical centre of the source lines | unchanged by ② |
| draw | 332-346 | one `ITEMS` entry and one `show_text` **per wrapped line**, `size=sz`, `italic=False`, font and fill from `fr = ls[min(j, …)][0]` | every formula is one string at one size on one baseline |
| `svgout.write_svg` | `svgout.py:57-68, 71-84` | faces subset by (bold, italic) over item chars; **one `<text>` per item** with `x`, `y`, `font-size`, `font-style`, `transform` | already able to draw per-stretch items |

### The change (prototyped; `c2/proto/compose_ts.py`, `c2/proto/scripts.py`)

1. **Transfer on the raw value, before wrap.** `toks = source_tokens(block)` and `fmt, miss = transfer(toks, para)` for each paragraph of `normalise_block_value`. `fmt` is aligned 1:1 with the raw string.
2. **Carry styles per word.** Words are `[(m.group(), fmt[m.start():m.end()]) for m in re.finditer(r'\S+', raw)]`. **This split is identical to `str.split()`:** Python's `str.isspace` and `re` `\s` disagree on **0** of the 1,114,112 codepoints (29 whitespace codepoints, including `\x1c`–`\x1f`, NBSP and U+3000).
3. **`wrap()` operates on lists of `(char, style)`.** A candidate line is `cur + [(' ', None)] + word`, joined with one plain space as today. It is measured by `seg_width(segments(cand))`, where `segments` groups maximal equal-style runs and `measure_st(text, run, sz, st)` sets the italic slant and `sz·ratio`. **For `st is None` the call is literally `measure(text, run, sz)`,** and an all-plain line is a single segment, so the arithmetic is today's exactly.
4. **Shrink loop:** the same substitution, `max(seg_width(segments(t)) for t in wrapped)`.
5. **Draw:** for each wrapped line, `w = Σ segment advances`; the anchor is computed as today. Then per segment k:
   - `aa = a_ + Σ_{i<k} w_i` and `pp = p_ + sz·frac_k`;
   - rotate `(aa, pp)` exactly as today;
   - `ITEMS.append(text=seg, x, y, rot, size=sz·ratio_k, bold=fr-bold, italic=italic_k, rgb, dx=0)`.
6. **`svgout.py`: no change.** One `<text>` per item; the faces pick up italic when an item uses it.

**Why `<text>` per item and not `<tspan>`:**
- 0 `<tspan>` in the 34 published SVGs (inherited, verify M1);
- both tests' extraction regexes (`test_figure_compose.py:717`, `test_compose_runexact.py:144`) are `[^<]*` between `<text>` and `</text>`, so a `<tspan>` would break them;
- `baseline-shift` behaviour inside `<img>` is untested;
- E already emits per-run `<text>` for kept blocks.

### Verified properties of the prototype (14 composed figures: the 13 scripted ones plus HClsoln)

- **The unchanged composer reproduces the published SVG:** its `<text>` sequence equals the published `_IS.svg` on **14 of 14**.
- **`--flat`** (transfer disabled, same code) writes an SVG **byte-identical** to the unchanged composer on **14 of 14**. This is the C1-golden invariant carried to real figures.
- **Transfer on:**
  - 39 flat `<text>` elements are replaced by 120; every other element is byte-identical;
  - `<style>` (font subsets) is byte-identical, because the character set is unchanged;
  - non-text SVG content is identical modulo newlines;
  - report keys other than the new `unformatted` are identical;
  - `unformatted` is `[]` on all 14.
- **Examples of output:**
  - sacch `C7H5NO3S`: `C`@198.161 · `7`@204.641 7 pt y+3 · `H` · `5` · `NO` · `3` · `S`;
  - combustion `CO2, H2O, O2`: subscripts at y+2.0 (that figure's own family);
  - map3 `C8H18`: `8` and `18` at 7 pt;
  - limiting `6 H2 og 4 Cl2`: `2` subscripted after `H` and `Cl` but **not** the coefficients `6`, `4`, `8` or `2`.
- **Byte-identity inside a real run:** HClsoln and every translated line without source scripts drew byte-identical output.

### The hazard: character offsets vs `wrap()`

Measured with `c2/proto/scripts.py`. The first case is a sacch value with editor-style spaces; the second is HClsoln's real 10-space identity value.

| raw value | raw offsets applied to the wrapped text | per-word carried styles |
|---|---|---|
| `'  Mól af  C7H5NO3S (mól) '` | `Mól af C7H5NO₃S (mól)`: `7` and `5` lost | `Mól af C₇H₅NO₃S (mól)` |
| `'HCl(aq) + H2O(l)          H3O+(aq) + Cl–(aq)'` | `… H3O+(aq) + Cl–_(__a_q)`: **italic on `(` and a wrong `a`**, scripts lost | `… H₃O⁺(_a__q_) + Cl⁻(_a__q_)` |

- **Real-value whitespace census:** of the 169 unique (figure, key) sidecar values, 0 have leading or trailing whitespace, 0 contain tab, NBSP or newline, and **2 contain an internal multi-space** (both HClsoln identity values, 10 spaces each).
- **Editor input is not trimmed:** `segment-editor.js:718` refuses only `!isText.trim()`. So every one of these shapes can reach compose.
- The synthetic leading, double, trailing, NBSP and TAB values all transfer and survive wrapping (`c2/probes.py`).
- ⚠️ **Adjacent consequence, not new and not ②'s to fix:** an editor edit of an identity block, for example one added space in HClsoln, moves the block from run-exact to the layout path. There the 10-space gap collapses. With ② the scripts and italics come back, but the gap does not.

### Browser-side positioning error, a new constraint on the design

Per-stretch x positions come from cairo's hinted advance at 200 DPI. The browser lays text out at its own scale.

**Instrument** (`c2/browser_drift.mjs`): Chromium, inline SVG scaled to 1.333, 2, 2.778 or 4 CSS px per pt. It measures `getComputedTextLength()` of stretch k against the composer's offset to stretch k+1. A negative value opens a gap; a positive one overlaps.

⚠️ **The instrument does not see the publication case.**
- The SVG is **inline**, loaded via `page.setContent`, because `getComputedTextLength` needs a DOM.
- Publication is `<img src>` (`render-check.mjs` docstring; the `cnxml-render.js` output shown in the mt-preview HTML). Same Chromium layout engine, but the `<img>` case itself was not measured.
- The display scale of a published figure varies with the page, which is why four scales were sampled.

**Where the control's extremes come from:** all of them are HClsoln, reviewed "Fine" by [USER] in USER-REVIEW row 3.
- **−2.25 pt** is `')          H'` → `'3'` at 1.333 px/pt: a run holding the 10-space arrow gap, source advance 34.50 against browser 32.25.
- **+0.76 pt** is `'HCl('` → `'aq'` at the same scale.

| variant (pairs) | 1.333 px/pt | 2 px/pt | 2.778 px/pt | 4 px/pt |
|---|---|---|---|---|
| **E run-exact control** (45 abutting kept pairs, source positions) | −2.25 … +0.76 | −0.67 … +0.11 | −0.77 … +0.16 | −0.92 … +0.11 |
| ② stretches as prototyped (84) | −0.80 … +0.66 | −1.56 … +0.28 | **0.000** | −1.56 … +0.28 |
| ② with plain text cut at word edges: in-word pairs (82) | −0.42 … +0.57 | −0.14 … +0.32 | 0.000 | −0.14 … +0.32 |
| ② word-edge cut: the error moves into spaces (31) | −1.07 … +0.39 | −1.58 … +0.16 | 0.000 | −1.58 … +0.16 |

- **The instrument is not blind.** It reads exactly 0.000 at 2.778 px/pt, which is 200 DPI where cairo and the browser agree, and non-zero at every other scale and on the control.
- **Worst unmitigated case:** ethene `sem þarf til að hvarfast við H`→`2`, **−1.56 pt at 4 px/pt**. The subscript floats about 0.17 em right of its `H` because a 30-character plain prefix accumulated rounding.
- **Design implication:** cut the plain segment at the last or first **space** adjacent to a styled stretch (`scripts.split_at_word_edges`). The error then lands in a word space. Within formulas it is ≤ 0.57 pt, inside E's accepted envelope.

### Interaction with ③ (reflow)

Measuring styled widths changes the wrap or size on **3 of 34** styled translated blocks. The comparison is `--flat` vs transfer, from `layout-c2.json`:

| block | source lines | flat (today) | styled |
|---|---|---|---|
| glycine `Moles of|C2H5O2N (mol)` | 2 | 3 | **2**, back to the source's count; this is verify N1 undone |
| map2 `Mass of |Mg(OH)2` | 2 | 2 | **1** |
| map2 `Moles of |Mg(OH)2` | 2 | 2 | **1** |

Styled translated blocks against their source line count: flat gives 17 equal / 12 fewer / 5 more; styled gives 16 / 14 / 4. The narrower styled width fits more under the budget, which [USER]'s review (rows 20, 25) calls a defect class when it collapses lines. **② and ③ must agree on which width the budget sees.**

---

## Q4 — Formula tokens and whitespace

- **Tokens contain no whitespace, by construction:** a token is a maximal `\S+` stretch holding a styled character. The assert in `c2/q4.py` holds on all 38 tokens.
- **No translated token crosses a source line break (re-measured).** The only styled token ending a line followed by another line is FishLemon `NH3|+CH2CH2CH2CH2NH2`, a never-sent block. The 2b figure of 0/38 is confirmed.
- **Translated values with a formula split by a space:** a whitespace-interleaved search (`'\s*'.join(token)`) over the 34 translated values finds **0** occurrences that are not exact.
  - Positive control: the planted `Mól af C7H5 NO3S (mól)` is found by the probe.
  - It is also *placed correctly*: the anchored stretches `C7`, `H5` and `O3` are each unique, so this editor typo is not named either.
- **So wrap can never split a formula**: words are never split, and no token contains a space.
- **The corpus shape the 34 hide: stacked splits.** 19 `send:true` blocks in 12 figures have a key line that is only a charge (`HCO3|–`, `ClO2|–`, `HSO4|–`, `nitrates (NO3|–`, …). ch14 has 9 of them (`14_03_corresp` ×5, `strengths` ×2, `ICETable3`, `ICETable5`), plus `14_05_ICETable1`.
  - **15 of 19 produce no token for the charge at all**, silently. The per-line rule sees a line that is only `–` 7 pt, takes 7 pt as its base, and the charge is plain.
  - The other 4 (italic `–`/`+` in Nitrogen, ICETable5, ICETable1) produce a **no-base** token.
  - **Requirement:** for token construction only (never the key), attach a script-sized line that starts where the previous line ended onto that previous line. This is 1b's `stacked_split_best` geometry (inherited: 59 blocks corpus-wide). Otherwise name it `stacked`.

---

## Q5 — Editor edits: does an approval recompose through `compose.py` with the edited text?

**Yes.** The chain, with the code for each step:

1. `POST …/figures/:basename/block` → `saveBlockEdit` (`server/routes/segment-editor.js:741`; `server/services/figureReviewService.js:177`). This writes the database only (`figure_block_edit`).
2. `POST …/figures/:basename/state` (approve **or** flag) → `setState` (`segment-editor.js:801`) → **`applyApprovedFigureEdits`** (`:812`; `figureReviewService.js:294-343`).
   - This rebuilds the sidecar with `blocks: fig.blocks`, the MT overlaid with the edits (`resolveBlocks`, `:123`).
   - It recomputes `renderHash` over the edited blocks (`:328`) and carries the old `composedHash` and `composedVersion` forward (`:300`, `:307`, `:334`, `:337`).
3. The server never invokes the composer (`segment-editor.js:830`, *"nothing in this server invokes compose.py"*).
4. `tools/figure-run.js` `isStale` (`:269-279`): `composedHash !== renderHash` → stale → the next `--stale` run spawns `figure-compose.py --translations <sidecarFile>` (`:1119-1130`). That runs `compose.py`, which reads `TR[key]` from the file (`compose.py:223`), i.e. the **editor-edited value**.
5. A `COMPOSER_VERSION` bump (`tools/lib/figure-text-sidecar.cjs:27`, currently `'2'`) also makes every sidecar stale (`figure-run.js:274`), and ② needs one. Per that file's own docstring, the bump also sends approved figures back to mt-preview. **Measured: all 34 committed sidecars carry no `state` key** (`Counter({None: 34})`), so today the bump demotes **0** approvals. That stops being true once an editor reviews a figure.

**So the transfer runs on editor-edited text.** Edit shapes and what the prototype does (`c2/probes.py`, real source runs):

| edit | example | result |
|---|---|---|
| Unicode subscripts typed | `Mól af C₇H₅NO₃S (mól)` | 3 stretches named `absent`; text already renders subscripted |
| formula replaced by a name | `Mól af sakkaríni (mól)` | 3 named `absent`; drawing byte-identical to today's flat (planted: 2 named, all `<text>` identical) |
| formula dropped | `CO2, H2O og aðrar …` | `O2` named; **`CO2` did not donate its `O2`** |
| U+2212 typed | `(mól−1)` | `–1` named `absent` (anchor `l–1` gone) |
| lowercased formula | `co2-gleypir` | named `absent` |
| second copy of the anchored stretch | `… (mól–1) … (mól–1)` | named `ambiguous`, candidates 2 |
| **repeated formula** (verify N4) | `Massi C8H18 og C8H18` | 2b first-only: `C₈H₁₈ og C8H18` with `unformatted=[]`, **a silent partial**. Prototype `all_occurrences=True`: both formatted |
| space inserted inside formula | `C7H5 NO3S` | placed via unique anchors; correct; not named |
| stacked charge with no anchor | `Styrkur HCO3– jóna` | 2b's fallback with `left=''` searched the bare `–`, and in `HCO3 – jón` **superscripted a spaced dash**. Prototype: named `no-base` |
| **anchored needle repeated but glued** | planted `Na3PO4Na3PO4…` | `3` named `ambiguous`, but **`4` placed on the last copy only, with the other 3 unformatted and not named**: the right-clean filter left 1 candidate. The fallback must also count raw needle occurrences and name a `partial` |

**No-base tokens must split by content.** These are tokens in which every character is styled.
- Corpus `send:true`: **124** no-base tokens, 99 of letters (italic variables `ν`, `λ`, `M`, `x`, `n`, `r`) and 25 non-letters (`=`, `+`, `–`, `×`).
- A letter-only italic variable is searchable at a clean boundary. Source side, its clean-occurrence count in the English equals its formatted count in **95 of 99**; the 4 exceptions are `pm` in `06_05_CovalradiT`.
- Non-letter no-base tokens must always be named.

---

## Q6 — Who reads `compose-report.json`?

- **`figure-compose.py`**: `read_report` shape-checks `blocks`, `missing` and `translated` (`:221`) and refuses `control` (`:226`). `verify` counts `blocks` (`:242`) and `missing` (`:253`). It writes `compose.json` = `{outputPath}` only (`:355-356`).
- **`tools/figure-run.js`** reads **only `compose.json`** (`:1136-1150`); the verdict is `outputPath` or `error`.
- **Readers of the other fields** (grep -a over `tools/`, `server/` and the experiment, excluding node_modules):
  - `degenerate` and `identity`: **0 production readers**; only the experiment's own tests.
  - `undecodable`: the matches in `tools/figure-run.js:1756` and `figure-classify.js:21` are prose. The driver's undecodable NOTE comes from prepare's `holds` (`figure-outcomes.js:152-171`), not from compose.
  - `runExact`: the tests plus one frozen evidence instrument (`evidence/2026-09-13-e-build/instruments/review_page.py:36`).
  - `unformatted`: 0 readers today; only 2b's prototype.
  - Positive control for the grep: `outputPath` is found in `tools/figure-run.js`.
- **Would an additive `unformatted` be read?** No, by nothing, and it breaks nothing:
  - `figure-compose.py` ignores extra keys;
  - the driver's fake-spawn tests write `compose.json`, not the report;
  - `test_blockkey_consumers.py:88-97` parses stdout after the `!!` header, so a new stdout section must start with `\n` (`compose.py:368-372`).

**Recommendation.**
- **(a)** Write `unformatted: [{key, token, stretch, reason: absent|ambiguous|no-base|stacked|partial, candidates}]` in draw order, with multiplicity, like `degenerate`/`undecodable`.
- **(b)** **Do not change any outcome or verdict.** The transfer is best-effort (2b §6 rule 3), and a named miss draws today's flat text. Refusing would turn a cosmetic loss into a lost figure. The driver already has the mechanism for "named, not fatal": `figure-outcomes.js` pushes `NOTE (not a failure): …` reasons (`:146-171`), and `ok` is computed from `reasons.filter((r) => !r.startsWith('NOTE'))`, so a NOTE never fails a run.
- **(c)** Pass the count and keys through `figure-compose.py` into `compose.json`, for example `{"outputPath", "unformatted": [...]}`. The driver can then print a **NOTE (not a failure)** naming the keys, beside the `undecodedFigures` NOTE (`figure-outcomes.js:162-171`).
- **Why (c) is not optional:** verify 2b-C5 found that a detector with no consumer is not a detector. Without a reader, an editor edit that stops a subscript from applying is invisible outside a file nobody opens.

---

## Q7 — Italic and bold-mixed lines: YAGNI?

**Inherited:** 0 of 162 translated unique keys in the 34 carry italic (2b), and LiberationSans-Italic appears in only 1 of the 34 (HClsoln, no translated blocks).

**Corpus, re-measured** (910 read OK, `send:true` = bought, so a "would be translated" upper bound):

| class | `send:true` blocks | figures | notes |
|---|---|---|---|
| italic, total | **185** (matches 1b) | **79** | |
| — italic and roman **mixed within one line** | **168** | | needs per-character transfer, e.g. `Initial concentration (M)`, `Increasing frequency ν`, `Radius r`, `1 M solution of…`, `Pgas = Patm + hρg` |
| — whole block italic | 12 | | a per-line face would do; the transfer covers it too |
| — italic only on a stacked charge line | 5 | | Nitrogen ×3, ICETable5, ICETable1 |
| bold and regular mixed within one line | **8** (matches 1b) | 4 | FoodLabel ×5 (ch05), KDataH2O2, NH3Decomp (ch12), WaterVapor2 (ch09) |

- Mixed-italic blocks by chapter: ch14 30, ch15 18, ch06 17, ch08 14, ch13 13, ch09 12, ch12 11, ch20 11, ch17 8, ch10 7, ch05 6, ch19 6, ch07 5, ch04 3, ch21 3, ch11 2, ch00 1, ch16 1.
- **"Would be translated"** cannot be split from identity without buying. Inherited proxy: in the 34, 7 of 183 `send:true` instances came back as identity.

**Verdict: italic transfer is YAGNI for the 34 and needed for chemistry.**
- The marginal cost is near zero. The style tuple already carries `italic`; `measure_st` selects the slant; `svgout` has embedded italic faces since E (`svgout.py:57-68`); `test_compose_runexact.py` E8 proves an italic item emits the face.
- **It does need the letter/non-letter no-base split (Q5)**, because many italic tokens are lone variables.

**Bold-mixed: YAGNI** (8 blocks). Adding `bold` to the style tuple is cheap, but the translated path's per-line bold (`fr`) would then need a per-stretch override. Defer until a FoodLabel-type figure is bought.

---

## Q8 — Translated arcs carrying scripts

- **Corpus: 21 `send:true` arc blocks** (SciMethod ×4, PerTable2 ×10, Icepack/IcePack/OxyacTorch ×6, BalEnt ×1): **0 with size variation, 0 italic.** Inherited from 1b: 119 arcs with size variation corpus-wide, **0 `send:true`**.
- There are 0 arcs in the 34.
- **The rule must be gated on `not is_arc`.** Applied to arcs it styles 7 of the 7 characters of `Next ...` and 18 of the 19 of `not consistent with`, because curvature reads as a baseline shift. Arc glyphs are single-character runs of equal size, so a shift is unobservable on a curve anyway.
- **Design:** the arc path (`compose.py:258-283`, one item per glyph) stays unchanged. If a translated arc ever had tokens, name them `arc` in `unformatted` and do not draw them.

---

## Q9 — Tests

**Pattern to reuse:** `test_compose_runexact.py`.
- It plants runs into the committed fixture after `figure-prepare.py` (`plant`, `:166-200`) and re-derives `blocks.json` with the real rules (`derive_blocks`, `:128-138`).
- Every plant has a PRECONDITION checked first (`P1`–`P8`, `:253-283`).
- The clock is pinned (`SOURCE_DATE_EPOCH`, `:49`).
- A `--capture-golden` refuses to run on an already-changed composer (`:296-303`).
- Elements are read with `elements()` (`:141-147`); `test_figure_compose.py:714-718` has the same regex.

**Proposed new file** (not an append), e.g. `test_compose_scripts.py`:
- **Plant:** a `send:true` one-line block `Moles of Na3PO4`, as runs `Moles of Na`@12 pt, `3`@8 pt y−3, `PO`@12 pt, `4`@8 pt y−3, advances from Helvetica widths as in the E file.
- **Translation:** `Mól af Na3PO4`.
- **Preconditions (probed):** one block, `send:true`, one `FT.lines` line, 4 runs.
- **RED-first, measured** (`c2/q9/plant_probe.py`):
  - **Unchanged `compose.py`:** the line is one `<text>` `Mól af Na3PO4` at 12.000 pt; the assertion *"`3` is its own `<text>` at 8.000 pt, 3.000 below the 12 pt baseline"* is **False**.
  - **Prototype:** `Mól af Na`@12 · `3`@8 y+3 · `PO`@12 · `4`@8 y+3; the assertion is **True**.
  - Non-vacuity in the same output: the elements concatenated in x-order equal `Mól af Na3PO4`, and the three plain translated labels are present.
- **Named-miss arm:** translation `Mól af natríumfosfati`.
  - `unformatted` names `Na3PO4` stretches `3` and `4` (`absent`).
  - Every `<text>` is **byte-identical** between the unchanged composer and the prototype (measured). The miss degrades to today's drawing.
- **Control arm:** a translated label with no source scripts is byte-identical to a golden captured from the unchanged composer, as C1 is. The prototype's `--flat` equals the unchanged composer's SVG byte for byte on 14 real figures.
- **More arms worth planting:** the repeated formula (both copies styled, or named — whichever the design rules); a same-size superscript (`NH4+` with `+`@12 +3) to pin the letter-weighted baseline; a stacked charge line to pin `stacked`; an italic variable (`Radius r`); a word-edge split (a long plain prefix before `H2O`).

**Existing assertions and what ② does to them:**
- `test_compose_runexact.py`:
  - **C0/C1** (translated population byte-exact vs golden): **unaffected** if the unstyled path stays byte-identical, and the prototype demonstrates that it can.
  - **E3** `find(els,'2',font_size='8.000')` requires exactly one match. A new plant carrying a `2` at 8 pt *in this file* would break it, hence a new file and `Na3PO4`.
  - **E1** positional checks are for kept blocks; unaffected.
  - **C2/C3** faces: unaffected unless a plant adds an italic translated character.
- `test_figure_compose.py`:
  - `drawn_text` substring checks (`9f`–`9h`, `9o`, `10c`/`10d`) assert on labels with no scripts; unaffected;
  - a label that gains scripts would no longer match as one substring;
  - `9p` (no empty `<text>`) needs the empty-segment guard: the prototype emits `('', None)` only for an empty paragraph, as today.
- `test_blockkey_consumers.py:88-97`: any new `!! N unformatted` stdout section must start with `\n`, per the comment at `compose.py:368-372`.
- **Frozen E-build evidence instrument:** "31 non-empty translated populations identical" is a by-name `<text>` comparison and will **by design** differ on the 13 scripted figures. That instrument has to be re-scoped, not treated as a regression.

---

## Proposed data shapes

1. **`SourceStyle`**, one per source character: `None` (plain) or `(ratio, frac, italic)`.
   - `ratio = run.size / line_base_size`;
   - `frac = (proj(run) − line_baseline) / line_base_size`, signed, positive is up along the text normal;
   - `italic = run_face(run).italic`.
   - Derived per `FT.lines` line with the Q1 rule; arcs are never styled.
2. **`Token`** = `{line, text, styles: [SourceStyle|None]}`.
   - A maximal `\S+` stretch holding a styled character, with unstyled `,.;:!?` trimmed from its edges.
   - Built from `runs.json` only, never from the value.
   - A charge-only line continuing the previous line (stacked split) is attached to it for token building only; the key is unchanged.
3. **`transfer(tokens, raw_value) → (fmt, unformatted)`**.
   - `fmt` has one entry per raw-value character: `SourceStyle|None`.
   - Longest token first; clean boundaries; each value position consumed once; **every** clean occurrence of a whole token is formatted.
   - Letter-only all-styled tokens are allowed at a clean, unique boundary; non-letter all-styled tokens become `no-base`.
   - The anchored-stretch fallback requires a non-empty left anchor and exactly one candidate, and names `partial` when raw needle occurrences exceed placements.
   - The value text is never altered.
4. **`Word`** = `(text, [SourceStyle|None])` from `re.finditer(r'\S+', raw_value)`; equivalent to `str.split()`.
5. **`Line`** = `[(char, SourceStyle|None)]`, joined with `(' ', None)`. **`Segment`** = a maximal equal-style run `(text, style)`. Plain text next to a styled segment is cut at the adjacent space.
6. **Measurement:** `seg_width(segments, run, sz) = Σ measure_st(text, run, sz, style)`, where `measure_st(…, None) ≡ measure(text, run, sz)`. The same function feeds wrap, shrink and the anchor.
7. **`ITEMS` entry**, one per segment: `{text, x, y, rot, size: sz·ratio, bold: line bold, italic, rgb, dx: 0}`.
   - The position is the rotated `(anchor + Σ previous segment widths, line baseline + sz·frac)`.
   - An unstyled line is **exactly one entry with today's values**, which is what keeps it byte-identical.
8. **`compose-report.json` `unformatted`** = `[{key, token, stretch, reason, candidates}]`, in draw order with multiplicity. Additive. Passed through to `compose.json` for a driver NOTE; never a verdict.

---

## Decisions for [USER]

1. **Which width the wrap budget sees.**
   - Styled measurement changes wrap or size on 3 of 34 styled translated blocks. glycine goes 3→2 lines, matching the source; map2 goes 2→1 twice, below the source.
   - Either ② ships styled measurement now, or it keeps the flat measure for wrap and shrink and styles only the drawing, until ③ rules on the budget.
2. **Italic transfer: in ② or deferred?**
   - 0 cases in the 34.
   - Corpus-wide, 168 `send:true` blocks mix italic and roman within a line, across 18 chapters.
   - The marginal code is near zero, but letter-only italic variables need the no-base split.
3. **Word-edge splitting.**
   - It moves up to 1.56 pt of browser/cairo advance error out of formulas and into word spaces, bringing in-word error to ≤ 0.57 pt.
   - The cost is more `<text>` elements per styled line.
4. **Driver visibility of `unformatted`.**
   - Option A: `compose-report.json` only, which has no reader.
   - Option B: also pass it through `compose.json` and print a driver NOTE.
   - Verify 2b-C5: a detector with no consumer is not a detector.
5. **Repeated formulas** (verify N4). Either format every clean occurrence (the prototype), or format the first and name the rest.

## Surprises: premises this contradicts

- **2b's rule is not safe as the production rule.** Its median baseline fails on same-size scripts (planted), and its 0.12 threshold misses 4 real scripted runs corpus-wide (the d-orbital labels).
- **2b's anchored fallback has two silent shapes it did not report.** With an empty left anchor it searches a bare `–` and superscripts a spaced dash. A glued repeated needle is under-formatted with `unformatted=[]`.
- **Real stacked splits are silent, not named:** 15 of 19 `send:true` charge lines produce no token at all.
- **"Italic: 0" is true of the 34 only.** Corpus-wide, 168 `send:true` blocks mix italic and roman in one line.
- **② is not layout-neutral.** Styled measurement changes the wrap on 3 of 34 styled blocks (2 of them collapse below the source's line count), so ② and ③ share the budget decision.
- **Per-stretch positioning introduces a browser/cairo advance error** of up to 1.56 pt inside a formula line, unless plain text is cut at word edges.

## Instruments and artefacts (all under `/home/siggi/dev/scratch-c140/c2/`)

- `scriptcensus.py`, `q1analyse.py`, `own3.jsonl`, `all34.jsonl`: the Q1/Q2 per-run table (3 and 34 figures).
- `proto/scripts.py`, `proto/compose_ts.py`: the prototype (transfer with geometry, per-word styles, segment drawing, `--flat`, `--wordsplit`, `layout-c2.json`/`items-c2.json` dumps).
- `work/<b>/{base,flat,ts,tsw}/`: 14 figures composed four ways from copies of the inputs. `cmp_ts.py` does the element diffs.
- `browser_drift.mjs`, `drift.json`, `drift-w.json`: the Chromium advance-error instrument.
- `probes.py`: edit shapes, whitespace shapes, same-size and size-only rule controls, stacked no-anchor.
- `rulecheck.py`, `q4.py`: rule equivalence on the 34, token and whitespace checks, 52/52 placement.
- `q9/plant_probe.py`, `q9/shrink_probe.py`: the RED-first planted assertion and the shrink scaling control.
- `census/`: 1b's instrument re-run with c2 fields (`figs.jsonl`, 1148 rows), `q78.py`.
- `prep/`: my own 3 prepared figures.

## git status

`git -C /home/siggi/dev/repos/namsbokasafn-efni status --porcelain` → empty output, checked at the start, after each compose and census step, and again at the end.
