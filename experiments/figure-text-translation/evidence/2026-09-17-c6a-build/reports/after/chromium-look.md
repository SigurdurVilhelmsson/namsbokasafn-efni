# §C140 ⑥a — Task 4 Step 3 (P6), looking at the crops

Three of the nine `reports/after/crops/*.png` composites were opened and looked at (Read tool),
each a grid of `source | before | after | no-rule` for every FigSym `<text>` in that figure.

- **`crops/CNX_Chem_04_02_HClsoln.png`** (2 texts, `'+ '` and `'+'`): the `after` plus sign's stroke
  weight visibly matches the source's bold, thick cross; `before` and `no-rule` are both
  noticeably thinner and closer to each other than either is to `after` — consistent with the
  no-rule control falling back to the same non-STIX-shaped glyph the pre-⑥a composer always drew.
- **`crops/CNX_Chem_03_01_glycinemass_img.png`** (8 texts, alternating `×` and `=`): the same
  pattern repeats across all eight rows — `after`'s × and = strokes are closer in weight and
  proportion to `source` than `before`'s are, and `no-rule` again tracks `before`, not `after`.
- **`crops/CNX_Chem_14_03_FishLemon.png`** (4 texts, `+` runs merged with adjacent letter
  fragments): the `+` itself reads the same way in every row (after closer to source than before/
  no-rule); rows 3–4's heuristic crop box is tight enough that it clips part of the neighbouring
  glyph (a stray dot/serif at the box edge) — a box-sizing artefact of this instrument, not a
  compose defect, and it does not obscure the `+` being compared.

**Colour fringing.** Every `before`/`after`/`no-rule` column shows faint orange/blue edges on the
glyphs that `source` (rendered by `pdftocairo`, grayscale anti-aliasing) does not. This is Chromium's
own subpixel/LCD anti-aliasing on the three browser-rendered columns, not a defect introduced by
this change — it appears identically on `before` (today's FigIS/Liberation path) and `no-rule`
(system fallback), so it is a property of rendering through a browser at all, orthogonal to which
font is in force.

**Net impression, consistent with the numbers in `chromium-stix.txt`:** in all three crops looked at,
`after` reads as closer to `source` than `before` does, and `no-rule` visibly reverts to `before`'s
look — the family really is doing the work `font-family="FigSym"` claims it is.
