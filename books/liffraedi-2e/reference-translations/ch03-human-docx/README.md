# Chapter 3 — human translation (docx import), preserved 2026-07-25

**This is the biology editor's own Icelandic translation of chapter 3**, imported from a
Word document by `tools/docx-import.js` on 2026-06-30. It is preserved here **verbatim**
because the pipeline directory it used to live in — `books/liffraedi-2e/02-mt-output/ch03/`
— is about to be overwritten by machine translation.

## Why it was moved

The editor decided (2026-07-25) to machine-translate the whole book and **edit the MT
using this translation as reference**, rather than continue extending the human
translation. `api-translate.js --force` overwrites `02-mt-output/`, so this copy exists so
the work is not lost and stays usable side-by-side.

It is also in git history (`main`, from commit `575aab84`), but a working copy is easier
for an editor than `git show`.

## What it is — and what it is NOT

- ✅ A **complete, faithful record** of what the human translator delivered.
- ❌ **NOT a complete translation of chapter 3.** The import aligned only **205 of 429**
  segments (`import-report.json`): 195 skipped, 29 unmatched segments, 11 unmatched docx
  blocks (7 figure-captions, 4 note-headings). Confidence: 26 high / 169 medium / 10 low.

The **glossary definitions, section summaries and exercise problems/solutions were never
matched**, which is why the published chapter 3 shipped with an empty summary page, no
key-terms page, and zero chapter-3 glossary entries. That gap is what prompted this
decision — it was a translation-coverage gap, not a pipeline failure.

## ⚠️ Segment ids here are STALE

These files are keyed to the **pre-2026-07-25 extraction** (m66438: 43 segments). Chapter 3
was re-extracted after the `processExercise` fix (PR #287) recovered the dropped
multiple-choice answer options, so the current `02-for-mt/` uses a **different and longer**
segment sequence (m66438: 55 segments).

**Do not diff these files against current `02-for-mt`/`02-mt-output` by segment id — the
ids no longer line up.** Compare by prose, not by marker.

## Credit

This content is genuine human translation and must be credited as **Þýðing**. The machine
translation that replaces it in the pipeline is *not* — per the project rule that credit
follows the method, MT content gets *ritstjórn* / *yfirlestur*, never "Translated by".
Note that `CLAUDE.md` currently states biology is the only human-translated book; that
claim needs updating once the MT lands.
