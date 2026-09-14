# figlayout.py — §C140 ③ layout decision (scratch pre-implementation)

**Cost:** 0 ISK. No MT, no figure-run, no compose run, nothing written under the repo (`git status --porcelain` empty at the end). Every python command carried `PYTHONDONTWRITEBYTECODE=1` except one early stdlib-only `json` inspection of `r2/census.json` (run in scratch; it cannot write bytecode into the repo). No Chromium.

## Files
- `/home/siggi/dev/scratch-c140/plan/tree-figlayout/figlayout.py` — pure; **no imports at all**. `decide(words, width, container, cues, floor=7.5, pad=2.0, *, _r9=True, _height=True)`, plus `clamp_shift`, `size_steps`, constants `ASC DESC EPS STEP LEAD SHORT_TOKEN`.
- `/home/siggi/dev/scratch-c140/plan/tree-figlayout/test_figlayout.py` — 73 checks, repo test style, fake width (0.5 em, `ó` 0.9 em, × style ratio), 0.04–0.07 s.
- `/home/siggi/dev/scratch-c140/plan/tree-figlayout/equiv_figlayout.py` — prototype-equivalence harness (cairo), outputs in `equiv-out/`.
- Oracle copy: `tree-figlayout/proto/` (= `cp -a r2/tree`, untouched). RED copies: `plan/red-figlayout/`. Golden: `plan/figlayout.golden.py` (cmp-equal to the final file).

## What decide() does
- sizes `sz0, sz0-0.25, …` down to `min(floor, sz0)` inclusive (1e-9 slack); `lead = sz0*1.222`.
- Partition: min-max DP, earliest break wins a tie; line count closest to the source (tie → fewer), `n ≤ words`. Spans on output line m are measured `width(chars, size, m)`.
- **R9**: for the chosen (size, n) and the chosen step's budget, a DP that forbids a cut directly after a 1–2 char word; used iff it fits; never changes n, size or step.
- **Box**: centre on (L+R)/2; width budget (R−L)−2pad; height budget (U−D)−2pad on `(n−1)·lead + 0.94·size`; glyph box centred vertically. No size meets both → width alone. No width fit → floor, budget′ = max(budget, widest word), widest word named `{word, needPt, budgetPt, sizePt}`.
- **Cell**: container align, source anchor (left=min starts, right=max ends, centre=mean (s+e)/2), same budgets, `clamp_shift` into [L+pad, R−pad], vertical clamp into [D+min(pad, src_down), U−min(pad, src_up)].
- **Open**: steps i / ii / iii-anchor / iii-displaced / iv-gain / v-overflow exactly as r2v5; (v) names the word (> b_ii) or a line-count overhang (word None, needPt = widest drawn line, budgetPt b_ii).
- Layout: contract keys + additive `widths, budget, bound, heightFit, cls`. `anchor` undisplaced; `x0`, `top` include displacement.

## Unit tests (all PASS) — each rule has a constructed case
Effective floor (7 pt source stays 7.0; 9 pt stops at 7.5; 9.0001 reaches 7.5001), lead from sz0, box centring every line + vertical glyph centre, **height budget binds** (2 lines @9 → 1 line @8.5), height never fits (width decides, heightFit False, nothing named), floor-overflow named with need/budget/size, widest (not first) word named, right-flush cell stays flush / displaced exactly to L+pad, left/centre cell anchors, vertical clamp minimal and honouring min(pad, margin), open (i), (ii), (iii-anchor), (iii-displaced), **(iv) gain** (grow down, grow up, at a shrunk size, room boundary), (v) line-count overhang, (v) word overflow, centre open b_i, fewer words than source lines, closest count, tie → fewer (with a j-dependent width proving line-index measurement), min-max balance, balance tie, **R9 binds** (`Massi | A atóma`, with a control proving the unconstrained answer is `Massi A | atóma`, not a tie), R9 fallback, R9 never changes step or line count, styled word ratio 0.78 fits where the flat word must shrink (control), per-line x0 with a j-dependent width, ValueError on no words / unknown class.

## RED-first
- Prototype-equivalent defaults (`_r9=False, _height=False`): **6 FAILED** — the three height-binding checks, heightFit, and both R9-binds checks.
- (iv) removed: **6 FAILED**; room gate `< 0`: 2 FAILED; grow direction flipped: 6 FAILED.
- Mutation sweep of 23 further mutants: all detected after adding 3 tests for the first sweep's survivors (tie-break direction, widest-word selection, centre b_i). The `widest_first` mutant is killed by the module's `unreachable` assert (exit 1), not by a FAIL line.

## Equivalence to the prototype (176 layout blocks × 7 configs)
- Oracle control: live r2v5 == frozen `r2/work/<tag>/<b>/diag.json` on 176/176 in every config; planted: live F 7.5 vs frozen F 7.0 flags exactly empform#8, flowchart#13, #14, combmap#8 (r2-build §7).
- decide (R9 off, height off, same hinted width/cues/containers/words) == prototype on **176/176 in all 7 configs** (2.0/7.0, 2.0/7.5, 2.0/8.0, 2.5/7.0, 2.5/7.5, 2.5/8.0, CTRL 2.0/9.0): lines, size, step, align, overflow exact; anchor/top/disp/x0/widths max |d| ≤ 1.14e-13. Comparator controls: +1e-6 pt cue plant flags all 110 non-box blocks; R9-on plant flags 23.
- Steps @2.0/7.5: fit 90, floor-overflow 2, i 65, ii 6, iii-anchor 1, iii-displaced 6, v-overflow 6. CTRL F 9.0 reaches iv-gain 2.

## What the extensions change (PAD 2.0, F 7.5, hinted)
- **R9: 23 of 176** change lines only (size/step never). Triggers: af 10, Cu 3, Ar 2, K 2, A 2, X 2, og 2. All 23 lie within the 54 blocks having a non-final ≤2-char word. Symbol-to-noun: argon#1, copperMoles#2/#3, potassium#2, empform#2/#5. Unit left alone on line 2: argon#0, copperMoles#0, potassium#0, glycine#0, vitC#2. `af` → next line: sacch#0, empform#0/#3, map2#1, map3#1, combmap#1/#5, map7#1, map8#4/#5. `og`: combustion#1 (`CO2, H2O, O2 og aðrar | lofttegundir`), combustion#2 (`H2O-gleypir | eins | og Mg(ClO4)2`). bound=False: flowchart#10/#11 (4 words, 4 source lines).
- **Height budget: 0 of 176** change; heightFit False on 0 of 92. Rare — in fact never on the 34: min slack 4.502 pt (alsulfatemass#3, chloroform#3, saltMass#2). Positive control fires.

## Instrument and informational
- PDF-advance cues vs hinted: 47/110 non-box anchors > 0.3 pt (reproduces r2v-rulings §1a), glycinemass#13 +0.927 (reproduces r2v-numbers D7); one step label changes (map7#5 iii-displaced → iii-anchor, same lines/size).
- Linear metrics + adv cues + R9 + height (census containers, b[0] size, flat scripts — not predictions): 28 change — the 23 R9 blocks + chloroform#2 8.5→8.75, sacch#1 8.75→9.0 (ii), moleratio2#3 8.0→7.75, combmap#10 8.0→7.75, map7#5 → iii-anchor; sacch#1 and moleratio2#3 are the two flips r2v-rulings §1d predicted. Overflow 8 (empform#8, flowchart#13/#14, combmap#8, combmap#11–#14).

## Named for the plan / [USER]
1. R9's literal reading binds `af`/`og` and can leave `(mól)` alone on a line (5 blocks) — picture review.
2. R9 cannot help when line count = word count (flowchart#10/#11).
3. The height rule shrinks glyph height only (lead fixed); never binds on the 34.
4. Cell height budget literal (U−D)−2pad; identical to the clamp-interval reading on the 34 (no source vertical margin < 2 pt).
