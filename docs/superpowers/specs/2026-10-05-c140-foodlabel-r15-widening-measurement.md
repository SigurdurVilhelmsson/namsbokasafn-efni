# §C140 — FoodLabel R-15a (widen the comment boxes) and R-15g (three-line bullet): measured

> **FROZEN MEASUREMENT RECORD — banner-dated 2026-10-05 (evening).** Evidence, not status. Status lives in the campaign register (`docs/plans/2026-07-21-post-item17-followup-campaign.md`, §C140 and its ⏩ RESUME). It supplements the frozen design record `2026-10-05-c140-composer-formatting-class-design.md`, which did not measure these two answers (its §9.6/§9.7). 0 ISK; `git status --porcelain` was empty before and after every agent.
>
> **Off-repo evidence:** `~/.cache/namsbokasafn-audit/c140-composer-design/r15/`.
> - `README.md` describes the folder.
> - `workflow-result.json` holds the four agents' structured returns. They are also split into `budget.md`, `newline.md`, `proto.md` and `verify.md`.
> - `tree/` is the scratch clone of `integrate/tree`, with two prototype commits (never pushed):
>   - `0e922e5`: `artworkEdits`;
>   - `7af1d82`: a minimal explicit-`\n` route.
> - `res/<arm>/` holds the composed arms, and `png/` the Chromium renders at scale 3.
>
> Produced by workflow `wf_8881e791-6d6`: two read-only scouts, one prototyper and one adversarial re-measurer.

## What [USER] ruled (2026-10-05)
- **R-15a:** *"enlarge the colored boxes so the text fits … expand the ones on the left to the left, and the one on the right to the right … without altering the content of the image. If this is either not possible or not viable for coding, I would go with rule on wording."*
- **R-15g:** *"Splitting it into three lines (5% eða/minna er/lágt)"*.

## Findings

1. **The composer's budget for a margin label is not the 26.54 pt the spec quotes.**
   - The five colour bands are pdfplumber `rect`s, so their labels are `cell`s. Their budget is about 100 pt, because the bands run under the nutrition table, and the table frame is not an obstacle to a cell.
   - The 26.54 pt is a visual overlap that nothing in the pipeline measures. Only the two band-less labels (*Check Calories*, *Footnote*) get a real budget (open label: 23.98 and 24.13 pt).
   - So the overprint of the table is invisible to every composer verdict (`[cell fit]`).
2. **Container detection reads `artwork.pdf` (vectors) and `artwork.png` (pixels), and anchors read `runs.json`.** The emitted SVG copies `artwork.svg`. An artwork edit must therefore reach all four of these consistently.
   - The working hook is `figure-prepare.py`, after `stage_artwork()` and before `emit-blocks.py`. It edits the staged PDF's content stream, so the PDF, PNG and SVG agree, and `runs.json` sees the edit.
3. **Moving text needs the artwork moved with it, and all five left labels together:**
   - Text moved −15 without the bands: all five labels become `open`, with the left free edge at the photo.
   - Four labels moved without *Footnote*: *Footnote* flips from `left` to `center`.
   - Bands widened without moving the circles (arm A5): circles and digits land on the words (14 overlaps).
4. **The prototype works.** Config key `artworkEdits {basename: [op…]}` has three operations:
   - `move-paths`: wraps a path in `q … cm … Q`;
   - `move-edge`: rewrites one `re`'s operands, so the band stays a `rect`;
   - `move-text`: shifts Tm/Td/TD/T* operands and compensates the later lines of the same text object.

   Selection is by exact paint + colour + bbox (0.01 pt). It refuses `select-none`, `select-ambiguous` and five other named reasons. After rewriting, a self-check confirms that only the selected objects moved. With no entry, the PDF is untouched.

   ⚠️ **Only the Python half is verified.** The verifier could not reproduce the JS validator half of `0e922e5` (`artworkEditsProblems`): the scratch tree lacks `tools/lib/figure-text-config.js`, so the validator cannot be imported there. Also, the integrate tree's `figure-config-validate.js` differs from the repo's by 12 lines. The '6' port therefore starts from the repo's validator, not the scratch copy.
5. **Δleft = 15 pt** is the smallest whole value at which every full left wording clears the frame, arrow and circles by ≥ 1.75 pt, with no overflow named. The binding label is *Neðanmálsgrein*, 38.90 pt wide, at frame +2.46. The circles end 11.8 pt from the photo; the cap would allow about 23.8.
   **Δright** is 6 pt for *Quick guide* to sit at its source x 389.296, clear of circle 6 by +2.27. It is 10 pt for a one-line *• 5% eða minna* to sit at its source x 385.611.
6. **Wording alone (arm A1, no widening) leaves two defects:**
   - *Byrja* touches the arrow shaft, by about 0.5 × 1.0 pt (corrected from 1.0 by the verifier);
   - *Fljótleg* sits on circle 6, by 3.44 × 4.73 pt.

   Widening fixes both, with any wording.
7. **The three-line bullet collides.** The minimal `\n` route places *lágt* at the source pitch of 5.5 pt, which lands on *• 20% eða*: glyph overlaps 0.316 and 0.304 pt, confirmed in the pixels. It needs a vertical-placement design that does not exist yet.
   With Δright = 10, the two-line source shape *• 5% eða minna / er lágt* fits at the source x with no collision and no `\n` (arm A4x).
8. **An explicit `\n` is unsafe end to end today:**
   - a value carrying LF passes every validator, and base composes it silently as one line;
   - the figure review panel's `<input type=text>` deletes LF, so *minna er\nlágt* becomes *minna erlágt* (measured in Chromium).

   R-5a's route therefore needs an editor half (a textarea, or a refusal) in '6', whatever R-15g becomes.
9. **Staleness gap.** `computeRenderHash` hashes only `composerVersion` plus the sidecar blocks, so a later change to an `artworkEdits` entry would trigger no recompose. The '6' bump covers the first landing. Later edits need a hash input, or a rule that every `artworkEdits` change rides a version bump.

## Controls
Both controls ran first after each commit. The verifier re-ran them with its own harness.
- FoodLabel (ruled sidecar + `config.ruled.json`, no `artworkEdits` entry) is byte-identical to `integrate/res/comb-ruled`.
- phscale is byte-identical to `integrate/res/comb`.
- Both are byte-identical again after a re-prepare.
- A value without `\n` composes byte-identically with and without `7af1d82`.
- Each of the six arms rebuilds byte-identically from its inputs. The photo, the table frame, the arrow, circle 6 and the rules are byte-identical to `comb-ruled` in every arm.

## Put to [USER] (rulings page `T2VLFfbLLFGQPq1fUT68u4`, new cards, 2026-10-05 evening)
- **R-15a2:** may the circle column move left with the bands (with an optional longer arrow)?
- **R-15w:** under widening, the original wordings or the fallback wordings?
- **R-15g2:** three lines (needs a spacing design) or the source's two lines?

Recommended: yes · original wordings · two lines.
