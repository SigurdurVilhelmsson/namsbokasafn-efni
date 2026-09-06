# What fraction of the artwork can this extractor actually read?

**Measured 2026-09-06.** Producer: `text-coverage-census.py` (read-only, 0 ISK, no network).
**Status of the work is the campaign register's (§C138) — this file is EVIDENCE, and it is dated.**

## Why it exists

The figure pipeline was developed against **one** figure, `CNX_Chem_01_01_SciMethod`, and the
spec said *"the whole single-figure chain works"* under a heading meaning *build none of this*.
Three review rounds later, every blocking defect had been about what the chain does on **real**
artwork. This is the census that should have existed first.

## The instrument, and why it is two instruments

| | reads |
|---|---|
| **OURS** — `extract.py` via `pikepdf` | the page `/Contents` stream and the page's own `/Resources/Font` |
| **ORACLE** — poppler `pdftotext` | the same, **plus** text drawn inside `/Form` XObjects, and CID/Type0 fonts |

**A disagreement is the finding.** The oracle is a different implementation by different people,
so it fails differently — which is the only reason it can see what ours cannot. It is already
installed, costs nothing, and needs no network.

⚠️ **`pdftotext` is NOT a replacement for `pdftext.py`.** It returns words, not the per-line
font, size, colour and rotation the composer needs to re-lay-out translated text. It is an
**oracle**, not a parser.

## Result — chemistry 2e

**Denominator: 1,148 distinct `<image src>` basenames referenced by the book's CNXML** — the set
the driver would enumerate. *(Not the artwork tree, which is a different population; two earlier
censuses in this campaign disagreed for exactly that reason.)*

| bucket | n | meaning |
|---|---|---|
| `page-text` | **496** | our extractor can read it |
| `form-text-only` | **274** | 🔴 text is inside `/Form` XObjects — **we read zero** |
| `unresolved` | 253 | not in the delivery at all (after de-hashing) |
| `photo` | 71 | image, no text — correctly nothing to do |
| `ours-crashes` | 38 | raises today; **loud, not silent** |
| `type0-unreadable` | 8 | 🔴 CID font, text comes back as garbage |
| `textless` | 7 | genuinely no text |
| `text-but-unexplained` | 1 | 🔴 **a mechanism we have not named** — `CNX_Chem_20_01_recycle`, 103 words |

### The number that matters

- resolved in the delivery: **895**
- of those, **text-bearing: 779**
- readable by our extractor: **496**
- 🔴 **SILENTLY SKIPPED: 283 — 36.3% of every text-bearing chemistry figure, carrying 4,500 English words.**

Median 13 words each, so these are labels and short captions, not decoration.
**All 283 are `.pdf` in the `first-edition` tree** — this is not an EPS or an edition problem.

## The two things this census is for

1. 🔴 **`text-but-unexplained` is why the gate must be MECHANISM-INDEPENDENT.** `/Form` XObjects
   were unknown on the morning of 2026-09-06 and Type0 was known but mis-scoped. One figure is
   *already* outside both explanations. ▶ **Do not gate on "does it have a Form XObject"** — gate
   on **"the oracle found words and we did not"**, which catches the mechanism nobody has named yet.
2. **It bounds the spend before it is spent.** 496 figures are translatable today; 283 more become
   translatable if the reader is fixed.

⚠️ **Re-run it rather than quoting it.** `python3 text-coverage-census.py <book>` — the numbers move
with the delivery, with `sources.local.json`, and with every extractor change.

---

# Addendum, same day: the read-layer bake-off

Producer: `read-layer-bakeoff.py`, over the population above. Candidate: **pdfplumber (MIT)**.

| | reads ≥1 word | total words |
|---|---|---|
| ours (`pdftext.py`) | **504 / 779** (64.7%) | 14,641 |
| **pdfplumber** | **779 / 779 (100%)** | 19,181 |
| oracle (`pdftotext`) | — | 17,272 |

**275 figures gained** — every text-bearing figure in the book becomes readable.

## 🔴 The control is the interesting half, and it inverted the finding

The bake-off flagged **155 figures where pdfplumber returned FEWER WORDS than ours**. Reported
as-is, that reads as a regression that would sink the candidate. It is not one.

⚠️ **"Words" is not the same unit on both sides.** pdfplumber groups characters into words by
spatial gaps; ours splits text-showing operators on whitespace. **Comparing them is the
`a WORD ≠ a THING` denominator error.** Re-measured as a **character multiset** — every character
ours found must appear in the candidate's stream:

| of the 155 | | |
|---|---|---|
| `.eps` source | **92** | ⚠️ **UNMEASURED** — the char control covered `.pdf` only. Not clean, unmeasured |
| `.pdf`, segmentation-only | **55** | identical character counts (320=320, 173=173, 114=114) |
| `.pdf`, apparent character loss | **8** | ▼ see below |

### The 8 "losses" are OUR garbage, decoded correctly by the candidate

The missing characters were `\x00`, `\x03`, `\x11`… — NUL and control bytes, the signature of a
2-byte CID code read as single Latin-1 characters. Printed side by side:

| figure | ours | pdfplumber |
|---|---|---|
| `CNX_Chem_04_02_ammonia` | `'\x00\x0b\x00D\x00\x0c\x00\x0b\x00E\x00\x0c'` | `'(a)(b)'` |
| `CNX_Chem_03_02_moles` | 166 bytes of control codes | `'32.1 g S  65.4 g Zn  28.1 g Si  12.0 g C  207 g Pb…'` |

▶ **VERDICT: 0 real regressions among the measured `.pdf` set.** The candidate reads everything
ours reads, plus 275 figures ours cannot read at all, plus the CID text ours turns into noise.

## 🔴 And the control surfaced a SPEND defect nobody had named

Our reader does not crash on a `/Type0` font and does not return empty — **it returns
plausible-looking text made of control bytes.** Nothing downstream distinguishes that from real
English, so it is a candidate for `send: true` and **would reach the paid MT**.

**Measured exposure: 11 text-bearing chemistry figures carry a `/Type0` font.**

⚠️ This is a *third* failure mode, distinct from the two already recorded: not a crash
(`ours-crashes`), not a silent skip (`form-text-only`), but **silent garbage that costs money**.
It is invisible to any count-based check, because the count is non-zero and looks healthy.

## What is NOT established here

- ✅ **SUPERSEDED BY ADDENDUM 2, BELOW — and the set was 280, not 92.** *(Kept because the correction is the point: 92 was only the EPS inside the word-count discrepancies, a subset of a subset.)* They needed the same char-level control after
  `gs` conversion before the candidate is adopted.
- pdfplumber emitted `Cannot set non-stroke color: 2 components specified` on some figures — a
  colour space it does not map. That touches the `fill` field the composer needs and belongs on
  the read-layer contract regardless of everything above.

---

# Addendum 2, same day: the EPS control — 280 figures, two parts, both inverted

Producer: `read-layer-eps-control.py`. **280 of the 779 text-bearing figures are `.eps` (36%)**,
**all** of them in the set our current reader already reads — so this half of the corpus is pure
regression risk, not upside. **139 of the 280 come from `updates-2e`, the precedence-winning tree.**

## Part 1 — reader vs reader on the gs-converted PDF

| | n |
|---|---|
| identical, or candidate a superset | **184** (candidate read *more* on 3) |
| apparent character loss | 96 |
| gs conversion failed | **0** |

### 🔴 The 96 are not losses. They are OUR READER DECODING WRONG.

The differing characters were `°`/`¡`, `λ`/`\x7f`, `Ð`, `Õ` — and the fonts say why:

| figure | font `/Encoding` | ours | candidate |
|---|---|---|---|
| `CNX_Chem_00_EE_Density_img` | `WinAnsi` + **`/Differences [161, /degree]`** | `Temperature (¡C)` | `Temperature (°C)` |
| `CNX_Chem_06_03_elecw` | `WinAnsi` + **`/Differences [127, /uni03BB]`** | `Wavelength \x7f` | `Wavelength λ` |

▶ **This is H3 — `/Encoding /Differences` ignored — measured at 96 of 280 EPS figures (34%).**
It is the same defect class as the Greek alpha found earlier, and far larger than it looked.
🔴 **It is reader-visible and it costs money**: `Temperature (¡C)` is what gets **sent to the paid
MT** and **composed into the published image**. A degree sign becomes an inverted exclamation
mark; a lambda becomes a DEL control byte. **No count-based check can see it** — the character is
present, just wrong.

▶ **VERDICT: 0 real character losses on EPS.** Combined with the `.pdf` half, the candidate loses
text nowhere measured, and **corrects our output on 107 figures** (96 `/Differences` + 11 CID).

## Part 2 — the shared blind spot: does `gs` itself lose text?

🔴 **THE INSTRUMENT WAS BROKEN AND ITS OUTPUT WAS 100% FALSE. RECORDED BECAUSE THE TELL IS
REUSABLE.** It reported **280 of 280 figures losing 40 of 40 strings** — a *saturated* rate, which
this repo's own rule says is a CATEGORY, not a measurement. The category was my regex.

Sampling what it actually matched: `(_Red_)`, `(_Green_)`, `(_Blue_)`, `(Process)`,
`(AGMUTIL_imagefile)`, `(HP LaserJet 2200)`. Those are **Illustrator colour-separation names,
utility strings and printer names** from the PostScript/XMP preamble of a **binary DOS-EPS**
(header `\xc5\xd0\xd3\xc6`). **None of them is figure text**, so "they did not survive conversion"
means nothing.

### What is actually established about `gs`

- ✅ **It is not wholesale-losing text**: it produced readable text for **all 280** EPS figures,
  **7,884 words**, and **0 conversions failed**. That is a real positive control, held already.
- ⚠️ **Whether it loses *some* text is NOT established by anything here.** The honest instrument
  is the one that already exists — `check.py` diffing the composed `--control` image against
  OpenStax's **published raster**, which is upstream of every parser. That is acceptance
  criterion 5 in the read-layer contract.
- ⚠️ **No second EPS→PDF converter is available on this machine** (`inkscape`, `epstopdf`,
  `mutool`, `libreoffice`, `pstopdf`, `convert` — none present), so a two-converter agreement
  check is not currently possible.
- ▶ **And it is not a differentiator for the adapter decision**: `gs` is the converter the
  pipeline **already uses**, so any loss it causes is pre-existing and identical under either
  reader.

⚠️ **The lesson to keep: a check whose result is 100% is describing its own instrument until
proven otherwise.** Both saturated rates found today — this one, and the earlier `docref` finding
— were categories, not samples.

---

# Reconciliation — the numbers that legitimately differ, and the one that was wrong

🔴 **THIS FILE IS THE OWNER OF THE CENSUS NUMBERS. Where another document disagrees, this wins —
and several were written before the census existed.**

| pair | both right? | which predicate |
|---|---|---|
| **"ours reads 496"** vs **"ours reads 504"** | ✅ both | **496** = the `page-text` bucket, i.e. figures our reader reads *correctly*. **504** = the bake-off's "returns ≥ 1 word", which additionally counts **8 `/Type0` figures where it returns control-byte garbage**. ▶ **Use 496 when the question is coverage; 504 when the question is regression risk.** |
| **`/Type0` = 11** vs **= 8** | ✅ both | **11** text-bearing figures *carry* a `/Type0` font; **8** land in the `type0-unreadable` bucket. |
| **"274 of 894"** vs **"of 895"** | ⚠️ 895 | The resolved population is **895**. `894` is a typo that propagated. |
| **`unresolved` = 170** vs **= 253** | 🔴 **253** | **170 was measured before this census and is superseded.** The census resolves vector-only through `sources.py`'s `SOURCE_EXTS` with no raster probe, and reports **253**. ▶ **This makes ruling R9 (`unresolved` is reported, never fatal) STRONGER, not weaker** — the always-red exit code it prevents would have fired even more often. |
| **`runs.json` = 8 fields** vs **= 9** | 🔴 **9** | The read-layer contract owns this list. Earlier prose said eight, omitting `tm`. |

⚠️ **Every number above is a DATED MEASUREMENT, not an enforceable value.** Re-run the producers
rather than quoting them: `python3 text-coverage-census.py <book>` · `read-layer-bakeoff.py` ·
`read-layer-eps-control.py`. **All three resolve their own paths from `__file__` and take
`FIGTEXT_CENSUS_OUT` for output**, so they run on any machine with the artwork configured.
