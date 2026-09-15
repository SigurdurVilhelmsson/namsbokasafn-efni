# figscripts.py — §C140 ② scratch pre-implementation (spec §1)

2026-09-14. **0 ISK:** no MT call, no `figure-run.js`, and nothing written under the repo (checked, see Hygiene).

## Files

| file | what |
|---|---|
| `/home/siggi/dev/scratch-c140/plan/tree-figscripts/figscripts.py` | the module (448 lines incl. docstrings), sha256 `1ccea27d…` |
| `/home/siggi/dev/scratch-c140/plan/tree-figscripts/test_figscripts.py` | the plain-assert test: 84 checks, ~0.05 s, no cairo, pdfplumber or IO. sha256 `62245ef1…` |
| `/home/siggi/dev/scratch-c140/plan/figscripts-work/` | instruments: `mutate.py`, `real34.py`, `corpus.py`, `controls.py`, `extra.py`, `red-stub/`, `red-c2/`; outputs in `*-out.txt` |

- `tree-figscripts` is `base-tree` plus those two files. Every base file is byte-identical (`cmp`).
- `figtext.py` is untouched; the `is_identity` widening belongs to numloc.
- **Test:** `cd /home/siggi/dev/scratch-c140/plan/tree-figscripts && PYTHONDONTWRITEBYTECODE=1 python3 test_figscripts.py` → `ALL PASS` (84 PASS, exit 0).

## Interface as built (fixed names kept)

- `is_symbol_run(run, fonts)`
- `body_size(block, fonts)`
- `line_styles(line, fonts) -> (text, styles, base, inverted)`
- `token_lines(block, fonts=None)`: `fonts` is an optional addition, because rule 2 needs the block's max non-symbol size. `token_lines(block)` still works.
- `source_tokens(block, fonts) -> (tokens, misses)`
- `transfer(tokens, value) -> (fmt, misses)`
- `words`, `segments`, `split_at_word_edges`
- `SourceStyle` is a namedtuple (`ratio frac italic`): tuple-equal, unpackable, and it serialises to JSON as a list.

## RED-first

I wrote the tests before `figscripts.py` existed and ran them against two targets. Each target has its own directory next to copies of the test and `figtext.py`, so the test file needs no hook.

**Stub** (every function returns a well-shaped wrong value): 48 FAILED, 32 PASS.
- Every group has at least one red arm.
- The passes are controls and weak halves: S0b–d, S1a–c, S2a–c, S3a, S4b–c, S5a–b, S6-pre/S6a, S7-pre ×3/S7e/S7f, S8e–f, S9-pre/S9a, S10a, T1b, T3b, T6b, T10, B2, B3.

**c2 prototype** (imported by path through an adapter that adds no behaviour): 30 FAILED, 53 PASS.
- **Red on c2:**
  - S0a;
  - S2e;
  - S3b dz2 (0.111 < 0.12);
  - S4a–d qout (q styled 1.5714, +0.2857);
  - S5a–d Patm (c2 base 6.8);
  - S6b–c arc;
  - S7a/a2/b/d/g stacked;
  - S8a–b dedup (2 false `absent`);
  - S10a–b;
  - T5b–e;
  - T6a, T7, T7b partial;
  - B1 (c2 body 11.0).
- **Green on c2:**
  - S1 same-size NH4+: c2 already has the letter-weighted baseline, so S1 is red only against the stub and mutant M5.
  - S2c;
  - S9;
  - T1–T4 and T8–T11;
  - W1–W5.

**S9 and S10 came from the corpus run.** I ran them red against my own code first (5 FAILED), then fixed the code.

**One expectation was corrected in the test, not the code.** My first S2d expected a raised 11 pt STIX `+` to be styled. The contract's inversion rule unstyles that line instead. S2d now uses a 9 pt `+`, and a new S2e pins the inversion.

**Mutation: 20/20 mutants killed.** Each mutant lives in its own directory, and the tree file's hash is unchanged afterwards.

| mutant | tests that go red |
|---|---|
| M1 flat 0.12 | S3b |
| M2 no symbol exclusion | S0a, S4 |
| M3 no inversion | S2e, S4, S5 |
| M4 inversion never resolves | S5 |
| M5 median baseline | S1d/e |
| M6 no dedup | S8a/b |
| M7 no stacked attach | S7 |
| M8 no whole-token partial | T7b |
| M9 no fallback partial | T6a, T7 |
| M10 no arc gate | S6b/c |
| M11 letter all-styled → no-base | T5c–e |
| M12 body = first run | B1 |
| M13 no edge trim | S8c/d |
| M14 first occurrence only | S8b, T2 |
| M15 fallback ignores right char | T6a, T7 |
| M16 clean boundary off | T5e, T7, T7b |
| M17 stacked miss off | S7g |
| M18 subset prefix not stripped | S0c |
| M19 blank run can invert | S9 |
| M20 no no-letter fallback | S10 |

## Real data (a) — the 34

Identity uses the tree's unwidened `is_identity`. There are 0 arcs in the 34.

| measure | value |
|---|---|
| population | translated 176, identity 7, never-sent 184 (= 367) |
| translated blocks with tokens | 34, in 13 figures |
| source stretches (tokens de-duplicated per block) | 52 |
| styled stretches in `fmt` | 52 |
| transfer misses | 0 |
| source misses | 0 |
| marked-string value sentinel | 38 checks, 0 bad |
| `body_size != first-run size` | 0 of 176 |

- **Stretches per figure** (source/value): copperMoles 1/1, glycine 6/6, sacch 10/10, etheneBr 1/1, ethene 1/1, map2 2/2, map3 6/6, moleratio1 1/1, moleratio2 4/4, limiting 3/3, combmap 4/4, combustion 8/8, map8 5/5.
- **Positive control:** a broken transfer makes 30 of 38 sentinel checks fail. The sacch edit to Unicode subscripts is named as 3 × `absent`.

## Real data (b) — the corpus census

**The census has no per-run BaseFont.** I reconstructed the font-key → BaseFont map per figure, iterating to a fixpoint.
- Control: 51 of 51 resolved keys agree with the real `meta.json` on the 34.
- Blocks with an unresolved key: send:true 14, send:false 114.

**Rotation:** blocks with any rot≠0 were skipped: send:true 121, send:false 39.
- Controls: arc and `block_key` show 0 mismatches, and the key control fires on a moved run.
- `--all-rot` supplement: the 111 rotated send:true blocks contribute 0 to every row below.

| measure | send:true | send:false |
|---|---|---|
| non-arc rot-0 blocks / runs | 2,814 / 4,691 | 11,835 / 14,826 |
| size-conditional vs flat 0.12, base held fixed | 0 | 4 |
| same, at the resolved base | 0 | +4 |
| full diff vs c2 | 47 (41 resolved + 6 left-inverted) | 86 (52 + 30 + 4 threshold) |
| inversion lines: detected / resolved / left | 19 / 13 / 6 | 43 / 25 / 18 |
| `body_size != first run` | 47 | 101 |
| `body_size != resolved line base` | 13 | 4 |
| stacked splits attached | 20 (census flags 21) | 37 |
| `stacked` misses | 0 | 0 |
| `arc` misses | 0 | 130 |
| all-styled tokens: letters-only / letter+other / no letter | 75 / 14 / 17 | 269 / 62 / 114 |

**Threshold-diff runs, named.** All are send:false, all a 7 pt `2` at −0.11 to −0.1111.
- At the letter-vote base: Oshapes `d2   dx2–y2` ×2, Dorbital `dz2`, CFSE `dz2`.
- At the resolved base (4 more): Ex9soln `dx2–y2` ×2, Dorbital `dx2–y2` ×2.

**Inversion lines, send:true.**
- Resolved (13):
  - Manometer: Patm ×2, `Pgas = Patm – hρg`, `Pgas = Patm + hρg`
  - Relation: E°cell
  - Dorbital: dxy, dxz, dyz
  - MolSpeed1: urms ×2
  - CFSE: dxy, dxz, dyz
- Left inverted (6):
  - Systemqw: qout, wby, qin, won
  - rvosmosis: `Π solution`
  - CFSE: Δoct

All six left-inverted lines share one shape: a STIX capital at 11 pt over a 7 pt subscript word. The 18 left-inverted send:false lines have the same shape (Frequency λ1–3; σ/π labels in FillMo, H2MO, He2MO, X2MOs and O2MO).

**Stacked splits.** The census flags 21 send:true blocks and 20 attach. The one that does not is Nitrogen `ammonium (NH4|+|)`, whose `+` is 9 pt.

**Letter+other all-styled send:true tokens (14):**
- Frequency: ν1, ν2, ν3
- BH3Diag: sp2
- Oshapes: d–2, d–1, d1
- sp3Diag: sp3
- CFSE: t2g
- sp3config: sp2
- ex1_16: trans-, cis-
- pyridinium: sp2 ×2

## Spec conflicts

1. **`body_size` disagrees with the resolved line base on 13 send:true blocks.** A composer using `sz0 = body_size` would draw those labels at 75–78 % of source size. 0 of the 34 are affected. The candidate fix (a vote over each line's resolved base) was measured but not shipped.
2. **A blank run inverted a line** (Relation `E°cell = (    )ln K`). Fixed: only inked runs count as suspects.
3. **A line with no letters could not resolve** (21 send:false `10–1x` lines). Fixed: base1 falls back to the largest non-symbol inked run.
4. **"Letter-only" and "non-letter" do not partition all-styled tokens.** Tokens that mix letters and other characters (14 send:true) are searched rather than treated as no-base.
5. **A same-size stacked charge cannot attach** (1 of 21 census-flagged). It is named no-base instead.
6. **`token_lines` gained an optional `fonts` parameter.**

## Observation (not implemented)

A two-stage base1 would resolve all 24 left-inverted corpus lines and change no resolved line.

## Hygiene

- `git status --porcelain` on the repo: empty.
- `find -newer START.marker` over the repo experiment directory, `books/efnafraedi-2e`, `r2/tree` and `prep/figs`: nothing. Positive control: the same predicate lists my work directory.
- `.pyc` files written: 0.
- `PYTHONDONTWRITEBYTECODE=1` was set on every Python run.