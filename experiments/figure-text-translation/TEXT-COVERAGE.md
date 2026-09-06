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
