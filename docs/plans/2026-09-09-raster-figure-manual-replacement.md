# Raster-only figures: manual replacement, registered — [USER] ruling 2026-09-09

**Status:** PLAN. Nothing built. Supersedes every automated-raster-translation option explored
2026-09-08/09; those are recorded below as **decided against**, with the reasoning, so nobody
rebuilds them.

**Owner of status:** the active register (`docs/plans/2026-07-21-post-item17-followup-campaign.md`),
its ⏩ RESUME block. This file owns the DESIGN and the ruling; it carries no status verbs.

---

## The ruling

> *"I think going with what we have now and translating the vectors we can translate is the best
> option. When a translation is not possible, pipe the original image through and then we'll have to
> have an official method of replacing (and registering the replacement) the source images with
> manually edited images when they are done."* — [USER] 2026-09-09

And the priority order, which governs everything below:

1. **Structure** — CNXML to OpenStax standards, so automatic QA works and merging back into
   OpenStax's publishing platform stays possible.
2. **Text** — all source text reaches the pipeline and is editable in the editor UX.
3. **Images** — MT what is possible, **pipe the rest through**, and log the remainder in the editor
   UX so an admin or head editor can track each one to completion.

▶ **Structure and text are where the SILENT failures live; images are where the LOUD ones do.** A
dropped segment ships an Icelandic page missing a sentence nobody notices. An untranslated figure is
visibly English. That asymmetry is the argument for this exact order, and it is why image work never
pre-empts text work.

---

## The measurement this rests on

Chemistry, measured 2026-09-08/09 on merged `main`:

| | count |
|---|---|
| images the CNXML references | 1,148 |
| resolve to a vector (the machine track) | 892 |
| **raster-only — no vector anywhere** | **256** |

Of the 256, **[USER] eyeballed every one** (the decisive instrument; the copies are at
`/home/siggi/raster-only-review/`, outside the repo, with `index.html` and `MANIFEST.tsv`):

| | count | nature |
|---|---|---|
| **need nothing** | ~176 | clean Lewis structures, photographs, symbol-only diagrams |
| **simple** | ~60 | a few horizontal labels on white or a single flat colour; simple tables |
| **complex** | ~20 | more text, mixed background, curves — may need a different answer |

**Effort, [USER]'s own estimate:** 1–2 h establishing a method, then ~5 min per simple image ⇒
**≈ 6–7 hours** for the 60. The ~20 complex ones are separately decided, per figure; most remaining
Lewis structures carry one or two chemical names that are a couple of minutes each, or a quick
re-draw in chem-draw software.

⚠️ **Three independent instruments agreed on the scope before the human count, which is why the
count is trustworthy rather than merely plausible:** an alt-text label proxy said 91, a two-pass
tesseract union said 95, and [USER] says **80**. Machine instruments over-count (they see described
or machine-readable text that is not translatable prose); the human count is the one that decides.

---

## What already exists — DO NOT BUILD A SECOND MECHANISM

🔴 CLAUDE.md is explicit: *"A TRANSLATED FIGURE IS A FILE IN `books/<slug>/media/`, NOT AN EDIT TO
ANY CNXML OR HTML. THE MECHANISM ALREADY EXISTS."* Verified 2026-09-09:

- `books/<slug>/media/` is **committed to git** — 693 tracked files in chemistry. Hand-edited work
  lands in version control on the same footing as machine-composed output. **It is not a one-disk
  artefact.**
- `books/<slug>/media/image-mapping.json` is a flat list of
  `{originalImage, outputName, extension}`, and **`extension` is per row**, so a hand-made `.png`
  coexists with the machine track's `.svg`.
- `cnxml-inject.js` swaps the `<image src>` **and its mime-type**; `cnxml-render.js` publishes it.
- `01-source/` is never touched. That is licence-load-bearing and stays true here.

**So the official replacement procedure is already available and needs no new code:**

1. Edit the image; export as `<basename>_IS.<ext>` into `books/<slug>/media/`.
2. Add its row to `books/<slug>/media/image-mapping.json`.
3. Commit both.
4. Re-render the chapter, then sync to vefur.

⚠️ **The suffix is an ENFORCEABLE VALUE** owned by `tools/generate-image-mapping.js`
(`DEFAULT_SUFFIX`) and pinned by its test against the committed corpus. **Read it there; it is
deliberately not restated in this document.**

### House conventions for a hand-edited image

- **Font: Liberation Sans.** The vector track already substitutes it for every redrawn label
  (source subset fonts carry no Icelandic glyphs), so this keeps a chapter visually consistent and
  keeps the CC BY derivative distributable. ⚠️ **Avoid Canva's bundled fonts and stock assets** —
  their licence terms are not CC-compatible and a baked-in asset is hard to detect later.
- **Do not crop or re-scale.** The published raster's geometry is what the page lays out against.
- **Keep the English original** — it is already in `01-source/media/` and must stay there.

---

## The gap that DOES need building

🔴 **The editor panel cannot show a figure that has no sidecar, so there is nowhere to record
"does not need translation".** `server/routes/segment-editor.js:612`:

```js
if (!resolved) continue; // no sidecar -> not a translated figure; skip
```

A raster-only figure never gets a sidecar (no vector ⇒ nothing read ⇒ nothing composed), so it is
skipped and the admin has no handle on it. **That single line is the blocker** — not the states, not
the storage.

✅ **What makes this small:** `figure_review` is keyed on `(book_id, basename)` **alone** and needs
no sidecar to mint a row. That was verified on 2026-09-08 while widening the membership guard for
§C139 tier 1. So this is a route change plus a state vocabulary, not new infrastructure.

### Proposed state vocabulary

| state | meaning | how it is established |
|---|---|---|
| `no-text` | nothing to translate | human verdict |
| `needs-manual` | on the list, not done | human verdict |
| `replaced` | edited image is live | 🔴 **DERIVED, never asserted** |
| *(existing)* | machine-translated via sidecar | already tracked |

🔴 **`replaced` MUST BE DERIVED FROM THE FILESYSTEM AND THE MAPPING, NOT FROM A TICKED BOX.** Check
that `books/<slug>/media/<basename>_IS.<ext>` exists **and** that `image-mapping.json` has a row
pointing at it. A checkbox someone ticked and a fact are different things, and this project has been
bitten specifically by asserted state (§C14 ③, the null-glossary gate; §C139's own blind property
test). An asserted `replaced` on a missing file is a silent hole; a derived one cannot lie.

⚠️ **`no-text` and `needs-manual` are genuinely human judgements and cannot be derived.** They must
carry the judging person and the date, so a wrong verdict is attributable and re-openable. A figure
miscategorised `no-text` shows the reader English — which is what they see today, so it is a
non-regression — but **nothing will ever flag it again**. The verdict record is the only detector.

---

## Three things that are easy to forget

1. **Alt text is a SEPARATE path from the picture, and they can disagree.** A hand-edited figure has
   Icelandic in its pixels, but its `alt` is an ordinary segment translated by the MT independently.
   If the image is edited and the alt still describes English labels, a screen-reader user gets a
   contradiction. **No check would catch this.** Make "confirm the alt matches" part of the
   replacement procedure — it costs seconds.
2. **Sequencing against the one-pass ruling.** An editor sees a module ONCE. A figure hand-edited
   *after* that pass is never reviewed by anyone but the person who made it. **Suggested rule,
   needing [USER] confirmation: the person doing the edit is the reviewer for that figure.** State
   it; do not leave it as an assumption.
3. **A replacement reaches readers only after a re-render AND a vefur sync.** Dropping the file in
   `media/` changes nothing on the site. Easy to forget when the work is done in batches weeks after
   a chapter was published.

---

## Decided against — with reasons, so they are not rebuilt

Five approaches were explored 2026-09-08/09 (5 proposals, 3 judges on distinct lenses, one
synthesis). All are **rejected in favour of manual editing**, on [USER]'s ruling that ~6–7 hours of
GIMP work is cheaper and safer than any of them. Recorded because the *reasoning* outlives the
decision:

- **OCR + erase + redraw** (tesseract, flat-fill erase, existing compose chain). Rejected: erasing
  the English pixels **destroys the editor's only independent reference**. A garbled read is then
  checkable only against the machine's own output — the editor reads `Voume (1)`, looks at the
  image, and the original is gone. An error the approach created and the editor cannot fix.
- **Vision-model read + patch-over.** Same erase objection, plus a genuinely invisible failure its
  own proposer conceded: a misread formula *inside* a prose block gets translated, the chemistry is
  corrupted, and `looks_verbatim` is blind because the block **is** prose. Adds a second paid vendor.
  ⚠️ Recorded negative result worth keeping: **a VLM's own bounding boxes are 5–10 px off** — it
  clipped ascenders and descenders on its own test image — so a vision model must never emit a
  coordinate.
- **Bilingual text key beneath the untouched image** (`<dt lang="en">` + `<dd lang="is">`). The best
  of the automated options and the one that scored highest on error-visibility, because a
  hallucinated row shows up as an English phrase the reader cannot find in the picture. Rejected on
  cost/fit: 2.5–3 dev-days across five surfaces, and it is weakest exactly where the stakes are
  highest — **a bilingual key beneath a GRAPH does not serve a pupil reading an axis title**.
- **Recreate tabular figures as CNXML.** Best verification story of the five (the OpenStax alt is a
  positional transcription and works as an oracle), but delivers 11 of 256 for 2–3 dev-days.
- **Do-nothing triage only.** Correct about the corpus and explicitly refuses to say what happens to
  the survivors — which is the half [USER] has now answered by hand.

⚠️ **One design hazard found while exploring, worth keeping even though the design is dropped:** the
proposed key mode wanted to bypass `effectiveState`'s `composedHash` clause. That clause closes a
[USER]-ruled 2026-09-04 defect which, per its own docstring, **no check in the repo could see**. Any
future figure state that skips compose must not casually skip that clause too.

---

## Open questions for [USER]

1. **Sequencing.** ch07 (86 raster-only) and ch09 (32) carry most of the work. If images are not
   replaced before those chapters get their single editorial pass, do their figures ship English
   permanently, or does that chapter get a second pass? **Decide in advance, not afterwards.**
2. **Reviewer rule** for a hand-edited figure — is the editor the reviewer? (see #2 above)
3. **The ~20 complex ones** — is chem-draw recreation acceptable where it produces a *different but
   equivalent* drawing, or must the replacement be visually faithful to OpenStax's?
4. Worth a 30-minute email to OpenStax asking whether vector sources exist for these? Chemistry is
   CC BY 4.0 and they are responsive. **Option value only — nothing should wait on it**, and
   [USER]'s own hypothesis (Excel charts, screenshots, 3D renders never had a vector) predicts the
   answer is no.
