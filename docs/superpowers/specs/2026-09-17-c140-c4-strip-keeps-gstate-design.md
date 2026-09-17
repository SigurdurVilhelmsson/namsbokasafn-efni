# §C140 ④ — `strip-text.py` keeps the graphics state it finds inside text objects

**Date:** 2026-09-17 · **Item:** campaign register §C140 ④ · **Cost:** 0 ISK
**Approval:** [USER], 2026-09-16 — the design's shape approved and ④ run end to end to a PR without check-ins; bought
figures whose output changes may be recomposed at 0 ISK on the branch; no merge (register ⏩ RESUME, "[USER] RULES THE
OVERNIGHT SCOPE").
**Evidence it rests on (frozen):**
[`experiments/figure-text-translation/evidence/2026-09-16-c4-explore/`](../../../experiments/figure-text-translation/evidence/2026-09-16-c4-explore/README.md)

## 0. Rulings

The controller made these under [USER]'s approval; each is what the evidence settles, with its cost if wrong.

| # | ruling | why | cost if wrong |
|---|---|---|---|
| S1 | **An allowlist.** Inside BT..ET the strip keeps exactly the persistent graphics-state operators — `g G rg RG k K cs CS sc SC scn SCN gs w J j M d ri i` — and drops the text operators, as today. | The approved design: keep what outlives ET. The corpus holds only `k`, `gs`, `rg` inside BT, so the allowlist and a "drop only text" denylist render identically on 533 of 533 figures. | none measured |
| S2 | **Anything else inside BT..ET refuses the figure**, loudly: special graphics state (`q Q cm`), marked content (`BMC BDC EMC MP DP`), path construction/painting/clipping, `Do`, `sh`, an inline image, `BX EX`, or an operator the tool does not know. `strip-text.py` raises a named exception; `figure-prepare.py` already turns a non-zero child into a `failed-prepare` outcome that the driver names. | These are the classes where both keeping and dropping can silently damage artwork (an in-BT `q` whose `Q` sits outside; half a marked-content pair; English drawn as a path or bitmap). The approved design says such operators are settled by census, not guessed; the census found **0 on 909 figures**, so a refusal costs nothing today and turns an unmeasured future case — organic's artwork, a ghostscript upgrade — into one visible failed prepare instead of a silent wrong picture. | a future figure refuses on a harmless operator: one loud `failed-prepare`, fixed by extending the allowlist with evidence |
| S3 | **No `COMPOSER_VERSION` bump. Recompose only the bought figures whose artwork actually changes**, one `--figure` at a time with `figure-run.js --stale --force` (0 ISK: every bought figure has a sidecar). | A bump sends all 34 approved figures back to review for a change visible on one. Recomposing unchanged figures rewrites their bytes anyway (the embedded font's `head.modified` is not pinned), so a blanket recompose is noise. Later runs pick the fix up by themselves: prepare re-runs the strip every time. | a changed figure missed by the selection keeps its old artwork until its next recompose; guarded by § 4.3's SVG check |
| S4 | **The recompose set is decided by the real `--svg` artwork path, not by the PNG.** Before recomposing, `artwork.svg` from the shipped strip and from the fixed strip are compared on combustion (expected to differ) and on the five bought figures where a kept state can reach a later paint without changing a pixel (exocytosis-88f6, empform, HClsoln, flowchart, sandwich); a figure is in the set if its artwork differs by value. | A kept default `gs` can reset an earlier blend or mask: invisible in pixels, visible in the SVG's structure. The exploration measured PNG only. | a structural SVG change on a bought figure goes unpublished until its next recompose |
| S5 | **Docs that stop being true are corrected in their owners**: `strip-text.py`'s docstrings (what it removes; the clipping-mode class is **9** figures of 909, CNX_Chem_18_04_Nanotube new with sendability unmeasured, so "live exposure 0" is no longer asserted for all nine), `experiments/figure-text-translation/REGISTER.md`'s strip-text rows, and the campaign register's ④ row. `COMPOSE-FIDELITY.md` is frozen evidence and is not edited; the register wins. | one source of truth | — |
| S6 | **Out-of-scope findings are logged in the register, not built**, with one cheap read-only measurement first: whether the June-vintage `_IS.svg` copies (made by a different tool, PyMuPDF redaction) lost the same graphics state — Egeom's committed copy rendered in Chromium against the source at the wedge, with combustion's June copy as a second probe. Also logged: Nanotube's sendability; overprint set inside text objects on 6 figures (lost by every renderer); ghostscript staging not being a neutral rewrite. | the June copies are what readers get today | none — logging only |

**Correction to S3 (2026-09-17, final review):** the premise "a bump sends all 34 approved figures back to
review" is false in the committed tree — 0 of the 34 sidecars under `books/efnafraedi-2e/figure-text/`
carry a non-null `state` key, so `editorialState` (`tools/lib/figure-text-sidecar.cjs`) already reports
`mt-preview` for all 34 on every reader-facing surface. The real cost of a bump is a server deploy (the
constant is required by server code — `server/services/figureReviewService.js` and its test import
`COMPOSER_VERSION`) plus a 0-ISK recompose of 34 figures with woff2 byte churn on the ones whose pixels do
not move. S3's ruling (no bump) stands on those grounds — the tree simply does not show the cost the
original "why" named. Whether prod's database holds an `approved` row for combustion is not visible from
the tree.

## 1. The defect, as measured

`strip_text_ops` drops every instruction between BT and ET. PDF graphics state is not scoped by BT..ET, so a fill
colour or ExtGState set inside a text object keeps applying to artwork drawn after ET; deleting it makes that artwork
inherit an earlier state. Keeping the state (evidence § "What was found"):

- changes **34 of 533** figures carrying such operators by value, **15 visibly**, and every changed pixel lands on the
  source's own pixels (mean distance 0.0);
- among the **34 bought** figures, changes **only combustion** — its 7 arrowheads black again;
- among the not-yet-bought, repairs visible damage the strip would do when they are bought — Egeom's wedge and dash
  bonds, IcePack's lettering, HazDiamond, Damage1/2, OxyacTorch, ChnReact1 and others.

All 5,849 `gs` occurrences inside BT name a default ExtGState, so keeping them cannot add a soft mask for the ring gate
or a blend chain for `svgfix.py`.

## 2. The change

`experiments/figure-text-translation/strip-text.py`:

- **`strip_text_ops(source)`** — for an instruction at text depth > 0: a text operator is dropped; an operator in the
  persistent-state allowlist is appended to the output in its original position; anything else raises
  `TextObjectOperatorRefused` (a new exception), naming the operator. An inline image at depth > 0 raises too. It returns
  `(new_bytes, blocks_removed, state_kept)`.
- **`TextObjectOperatorRefused`** subclasses `UnparsableStream`, so every existing handler that refuses to write on an
  unparsable stream refuses here as well. `strip_text` collects a refusal in a form the way it collects an unparsable
  form, and raises after the walk, naming both.
- **The two operator sets are module constants** (`TEXT_OPERATORS`, `PERSISTENT_STATE_OPERATORS`), each with a comment
  saying what the census measured. A test pins them against each other (disjoint).
- `strip_text`'s stats and `main()`'s printout gain the number of state operators kept, so a run shows the repair
  happening ("kept N graphics-state operator(s) from text objects").
- The docstrings are corrected per S5.

Nothing else in the pipeline changes. `figure-prepare.py` already turns the child's non-zero exit into a named
`PrepareError`, and `tools/figure-run.js` into `failed-prepare`.

## 3. Tests (Python, `experiments/figure-text-translation/`; not in CI, so `ALL PASS` goes in the evidence)

A new `test_strip_text.py`:

1. **The defect, by pixel VALUE.** A synthetic one-page PDF: a black filled square; a text object that sets a
   red fill (`1 0 0 rg`) and shows a glyph; after ET, a second square filled with no colour set. Render the source and
   the stripped artwork at 200 dpi with `pdftocairo`; the second square's centre pixel must equal the source's (red).
   **Negative arm:** the shipped rule (everything inside BT dropped, reconstructed in the test) gives black there.
   Plus an ExtGState variant (`gs` inside BT setting a stroke width, then a stroked line after ET).
2. **Text is still removed:** no glyph ink in the stripped render where the glyph was; `pdftotext` returns no words.
3. **Refusals**, one case per class — `q` … `Q`, `cm`, `BDC` … `EMC`, `0 0 10 10 re f`, `/Fm0 Do`, an inline image,
   `BX` … `EX`, and a made-up operator — each raising `TextObjectOperatorRefused` naming the operator, from a page stream
   and from a `/Form` stream.
4. **Order preserved:** kept operators appear in their original order relative to the operators around the text object.
5. **The constants:** disjoint, and the allowlist contains `k`, `gs`, `rg`.
6. **Serialiser control:** a stream with no text object round-trips and renders pixel-identically.
7. **Corpus anchor (local only, skipped with a printed reason if the source tree is absent):** combustion's staged
   artwork, fixed strip, the pixel at the centre of the largest arrowhead component (rows 150–177, cols 267–305 at
   200 dpi) equals the source render's pixel there — **not** the bbox midpoint, which falls between arrowheads.

Existing suites (`test_readlayer.py`, `test_figure_prepare.py`, `test_figure_compose.py`, `test_sendable.py`,
`test_sources.py`, `test_make_fixture.py`, `test_figrings.py`, `test_svgfix.py`) must still print `ALL PASS`. A root
`npm test` by name against the pre-change baseline (no JS changes are planned; the comparison is the guard).

## 4. Verification — 0 ISK, predictions first, frozen in `evidence/2026-09-17-c4-build/`

`PREDICTIONS.md` is committed before the change. Then:

1. **Corpus renders.** The exploration's render instrument, re-pointed at two whole modules — `strip-text.py` as it is
   at the branch start (`git show <base>:…`, imported as a file, never by replacing a function, because the fixed
   `strip_text` unpacks three values) and the fixed file — over the same 533 figures: the changed set equals the exploration's 34 by name, each at distance
   0.0 from the source; 15 above the threshold; **0 refusals** across all 909 figures the census scanned; the serialiser
   and planted controls as before.
2. **Keys unmoved.** The 34 bought figures re-prepare to byte-identical `blocks.json` (the strip does not touch
   reading); `prepare_corpus.py`'s summary columns other than the artwork paths are identical.
3. **The SVG path (S4).** For combustion, exocytosis-88f6, empform, HClsoln, flowchart and sandwich: `artwork.svg` from
   a real prepare before and after; a **determinism control** first (the shipped strip run twice gives an identical
   `artwork.svg`); compare the file by value, the `svgfix.json` counts and the `<mask>`/`<image>` counts. Prediction:
   combustion differs; the five are undetermined before the run; no count rises.
4. **Recompose (S3, S4).** `test_figrings.py` `ALL PASS`, then, in the foreground, `figure-run.js --book efnafraedi-2e
   --chapter N --figure <basename> --stale --force` for each figure in the recompose set: `MT spawned for 0 figure(s)`;
   only those `_IS.svg` files change under `books/`; no sidecar or mapping change; the label group is byte-identical
   to before and the artwork group differs; combustion's recomposed `_IS.svg` rendered in Chromium shows black arrowheads
   (looked at, crop kept).
5. **June copies (S6).** The read-only measurement, recorded as found.

## 5. Out of scope

Logged in the register (S6); nothing here retires or rewrites a June-vintage copy.

## 6. Known limits

- The census and the strip walk page 1 and every reachable `/Form` — not `/Pattern` resources, annotation appearances or
  soft-mask group streams.
- The `.eps` figures are measured after ghostscript staging; staging can rewrite what sits inside a text object.
- Overprint set inside a text object is kept by the strip and ignored by every renderer this pipeline uses.
