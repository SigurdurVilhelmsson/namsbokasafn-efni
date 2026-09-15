# Spec review of the §C140 ② ③ ⑨ + exocytosis scratch build (tree-int)

I tried to refute the claim that the scratch build in `/home/siggi/dev/scratch-c140/plan/tree-int` implements the approved spec. It mostly holds.

- **Blockers:** none.
- **Should-fix:** three. Each contradicts spec text, but none has any exposure on the 34 bought figures.
- **Notes:** ten, listed below.

Everything I ran is under `/home/siggi/dev/scratch-c140/plan/review-spec/`. Scripts are `p*.py`, outputs `p*.out`.
- **Environment:** every python command ran with `PYTHONDONTWRITEBYTECODE=1`.
- **Where the probes ran:** against `review-spec/tree`, a byte-identical copy of tree-int, and `review-spec/base`, a copy of the repo experiment.
- **Mutation:** only in `review-spec/tree-mut`. I compared `tree/svgfix.py` with tree-int afterwards and it is unchanged.
- **Repo:** `git status --porcelain` is clean, and no `__pycache__` was written.

## Should-fix

1. **`artwork.pdf` is loaded outside the never-raises contract.** `compose.py` loads it (and `artwork.png`) before calling `container_for`, with no guard.
   - **What happens:** if `artwork.pdf` is corrupt or missing and the figure has a translated label, compose exits 1 and writes no report.
   - **Base composer:** exits 0 on the same folders.
   - **Why nothing catches it:** `figure-compose.py`'s `REQUIRED_INPUTS` does not list `artwork.pdf`.
   - **Exposure:** near zero, since `figure-run --stale` re-prepares first.
   - **Reproduce:** `python3 -u p01_artwork_inputs.py`
     ```
     corrupt-pdf+translated rc=1 report=NO  PdfminerException: Unexpected EOF
     BASE composer corrupt-pdf rc=0
     ```

2. **Height overflow in a box or cell is silent, and the label is not shrunk.** `decide()` falls back to choosing by width alone at the largest size that fits. It then reports `step 'fit'`, `overflow None`, `heightFit False`. Spec §4 says to shrink "in width or height", and R5 says an overhang is named. Exposure on the 34: `heightFit False` on 0 of 176 blocks.
   - **Reproduce:** `python3 -u p02_layout.py` (case B)
     ```
     cell glyph[2.00,21.46] vs container[0,12] size=9.0 step=fit overflow=None heightFit=False
     ```

3. **A container-detection exception leaves no trace in any output.** The figcontainers docstring promises that the error container's zero room makes the layout overhang and name the label. That is false whenever the translation fits the source width.
   - **Reproduce:** `python3 -u p08_containers.py`, with `classify` and `free_box` forced to raise.
     ```
     rc 0; "error" in report: False; per-block line: [open ii] (normally [box fit]); overflow: []
     ```

## Notes

- **RED-first:** against the unchanged composer (`T23_COMPOSE_TREE=../base`), 13 t23 assertions go RED. Two new ③ assertions stay green, so they were never RED-first:
  - **L4** ("clears the arrow") passes by luck: base draws the label as one line below the arrow, max glyph top 51.07 < 61.25.
  - **L0** pins a crash the unchanged composer never had.
- **Scratch baseline blind spot:** tree-int's "8 pre-existing" failures in `test_figure_compose.py` (section 10) come from the folder layout (`REPO_ROOT = HERE.parents[1]`). In a repo-shaped layout the file passes in full, before and after the change (`p15-*.out`). `test_compose_runexact.py` C1 legitimately goes RED after ③. Only the 2 plain labels move (x 28→10); the arc glyphs are byte-identical (`p16`). The expected-red set at commit (4) should list C1, re-scoped rather than bulk-edited.
- **Off-grid sizes skip the floor:** a source size off the 0.25 pt grid never reaches 7.5 pt. With 8.9 pt the steps stop at 7.65, so a word that fits at 7.5 is reported as overflowing at 7.65. Exposure 0.
- **Open step (v) understates the overhang:** `needPt` gives the widest word (33.75 pt) while the drawn line is 67.5 pt. Exposure 0.
- **Box/cell add a line at full size before shrinking,** the opposite order to open's (iii)→(iv). The spec allows either reading and this matches the prototype. Exposure 0/176.
- **figscripts departs from the spec's wording in five places:**
  - inverted-base checks only scripts, not any styled run;
  - base1 ignores "majority baseline";
  - the size vote groups sizes into 0.1 pt buckets;
  - a token counts as placeable if it contains any letter, not only letters;
  - the fallback anchors on a preceding script, so `SO42–jónir` names the superscript `absent` although it is there.

  Separately, a whole-italic source label gives one `absent` per word and is drawn roman. That is already known in r2v-scripts.md; 0 such labels in the 34.
- **Legacy list-shaped values:** each paragraph is searched for every token (duplicate or false misses), and the paragraphs are merged into one word list. Latent.
- **Spec §5 is not in this build:** the pass-through into compose.json, the driver NOTEs and `COMPOSER_VERSION` are missing. `compose.json` carries only `{outputPath}` (`p13`).
- **svgfix details:**
  - It does not check "L uses D"; that check is not needed.
  - The collapse is not limited to regions that cover the viewBox, so exactness rests on the 155 measured paints.
  - The collapse counts never reach `prepare.json`.
  - The spec's "2^12.4 after" is actually 2^12.24.
- **Tests:**
  - The parity vitest hard-codes an absolute path. Its literal is a hand copy of the Python fixture, but it checks out: 173 pairs, equal multisets.
  - `test_figcontainers.py` section 11 fails rather than skips when cairo is absent.

## Verified, with controls

| Check | Result |
|---|---|
| Block keys | Identical base vs tree on 34/34 figures, and equal to prepared `blocks.json` 34/34. Re-prepared `blocks.json` byte-identical on 5 real figures. |
| `--control` | Items identical to the base composer's control on 5 real figures; zero `localize()` calls. |
| numloc runs once | Spy shows no output fed back in; kept 1.008 draws 1,008. Corpus rule equals the c9 instrument on 14,962 of 14,962 blocks. |
| svgfix bytes | 155/52/2 bytes changed; 31 of 34 files byte-identical; byte-equal to the independent verifier 34/34. CRLF, comment and entity preserved. Rewrites a file only when a byte changed; garbage input never raises. |
| Sentinel independence | Fires at 2^116.4 and 2^60.7 only on the mutant tree whose collapse matches nothing; quiet on the normal tree. |
| Container census | 66/26/84 block by block, 0 disagreements. Control with the span test off gives 11. |
| Miss reasons | All 7 reasons are named when they occur. |
| Text sentinel | Holds on 7 planted styled labels, checked from inside compose. |
| Kept blocks | Unchanged except '.'↔','; report multisets equal to base. |
| Size | Floor respected and no label enlarged on 176/176 blocks. R9 cannot change line count or size. |
| Width function | Linear width equals the font's own advances to 0.0000 pt. |
| Driver compatibility | Unchanged `figure-compose.py` exits 0; the `!!` block still parses. |
