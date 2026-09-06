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

- **The 92 EPS cases are unmeasured**, not clean. They need the same char-level control after
  `gs` conversion before the candidate is adopted.
- pdfplumber emitted `Cannot set non-stroke color: 2 components specified` on some figures — a
  colour space it does not map. That touches the `fill` field the composer needs and belongs on
  the read-layer contract regardless of everything above.
