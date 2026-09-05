# The per-chapter loop — the plan of record for the clean-break re-MT

**Date:** 2026-09-05 · **Owner of:** the PROCEDURE and its ORDER.
**Status lives in** [`2026-07-21-post-item17-followup-campaign.md`](2026-07-21-post-item17-followup-campaign.md)'s ⏩ RESUME block — this document carries no status verbs and no progress counts.
**Supersedes as the operative plan:** the run-shaped Phase 3 of
[`2026-08-23-clean-break-re-mt-runbook.md`](2026-08-23-clean-break-re-mt-runbook.md). That runbook's
Phases 0–2 (captures, decisions, locks) are DONE and still authoritative as evidence; its Phase 4–5
delivery steps are folded in below. **Read it for the gates it names; run the loop from here.**

---

## Why this document exists

[USER], 2026-09-05: the campaign's purpose is to **retire the old manual MT route** — legacy code,
legacy tags, legacy `02-mt-output` — by **re-extracting and re-MT'ing all of Chemistry 2e** and
**fully MT'ing Organic**, ending with both books clean and with **their figures translated**.

The work drifted off that. Measured on the day this was written: **124 of the last 124 commits
touched no book content**, and neither register named a next chapter. The image work had become a
parallel track with its own register and its own gates — one of which *inverted* the loop by making
all images wait for a book-wide text re-MT.

🔴 **THE CORRECTION THIS DOCUMENT MAKES: FIGURES ARE A STEP INSIDE THE LOOP, NOT A TRACK BESIDE IT.**
A chapter is not done until its text AND its figures are done. That is what removes the second
editor visit, and it is the reason the loop is per-chapter rather than per-book.

---

## 🎯 MILESTONES — the ordered path from today to a running loop

**Added 2026-09-05 (evening).** The loop below is the PROCEDURE; this is the PATH TO BEING ABLE TO RUN IT.
Status of each milestone lives in the register's ⏩ RESUME, never here. **Each has a GATE — a checkable
end state, not an activity** — because "we did the work" and "the work had its effect" have come apart
repeatedly in this campaign (a merged PR is not a deployed one; a deployed migration is not an exported
glossary).

🔴 **BOTH BOOKS ARE HELD FROM PUBLISHING TODAY.** M1–M2 unblock chemistry; M3–M4 unblock organic.

| # | milestone | gate — how you know it is done | cost |
|---|---|---|---|
| **M1** | **Chemistry's glossary is clean** | 🔴 **Re-read `books/efnafraedi-2e/glossary/glossary-unified.json` and the removal-set intersection is ZERO.** Not "the PR merged" — merge ≠ deploy ≠ export tick. | 0 ISK |
| **M2** | **Chemistry ch03 re-MT'd and published** | The rendered pages contain **0** of `tilbrigði`/`sjálfkvæm*`/`ílend*`/`felli*` (control: a term that SHOULD be there, e.g. `mól`), and `/content/efnafraedi-2e/chapters/03/…html` is live **by byte size** with a 404 control. | **paid** |
| **M3** | **Organic's extraction gaps closed** | A re-extract of any organic chapter emits **alt segments > 0** for its exercises (control: module alt segments still emitted), and the 32 markup-bearing `<document><title>` modules emit their real title rather than a donated one. **`table@summary` has a written [LEAD] ruling** either way. | 0 ISK |
| **M4** | **Organic ch03 completed and published** | **0** English alt attributes on its rendered pages (control: the Icelandic ones still score Icelandic), and its pages live by byte size. | **paid** |
| **M5** | **Step 3 is runnable** | One chapter's figures processed end to end **unattended**, writing a `books/<slug>/figure-text/<basename>.is.json` sidecar an editor can actually see — with text-less figures SKIPPED and counted, not crashing. | small |
| **M6** | **The loop is running** | A chapter bought under clean preconditions completes all six steps and reaches a reader, and step 6 surfaces a defect class **already known** rather than a new one. | **paid** |

⚠️ **M1 AND M3 ARE THE REAL WORK; M2 AND M4 ARE THEIR PROOF.** Do not treat M2 as "publish chemistry" —
it is "demonstrate the glossary fix reached readers". A milestone whose gate cannot fail is not a gate.

⚠️ **M3 CARRIES A DESIGN DECISION THAT MUST BE MADE BEFORE THE CODE**: emit exercise alt as a new
**field type** (purely additive) rather than a new **run** (shifts every later `b{k}` id — 855 fields
have k≥1, and an insertion at k=0 shifts all 6,664). → register §C126.

⚠️ **M5 IS THE ONE THAT COULD BE DESCOPED, AND ONLY [LEAD] CAN DO IT.** [USER] ruled figures are a step
INSIDE the loop, so as written M6 waits on M5. **If the loop ships text-only chapters instead, that is a
deliberate reversal that books a second editor visit per chapter** — record it as a decision, do not
let it happen by drift.

---

## The loop

For one chapter, in this order. **The chapter is not finished until step 5.**

| # | Step | Cost |
|---|---|---|
| 1 | **Re-extract** the chapter from `01-source` | 0 ISK |
| 2 | **Re-MT** the chapter's text | paid |
| 3 | **MT that chapter's figures** — the vector ones only | paid, small |
| 4 | **Inject → render**, and run the free source-anchored checks | 0 ISK |
| 5 | **Publish** — sync, redirects, deploy | 0 ISK |
| 6 | **Fix what the chapter surfaced — or LOG it**, then go to the next chapter | — |

⚠️ **Step 6 is not optional and it is why the loop is a loop.** Every chapter bought so far has
surfaced a defect class that the previous one did not. Fixing before the next buy is what stops a
defect being paid for 23 times.

📐 **The pipeline model this loop runs on — `mt-preview` baseline, `faithful` per-module overlay — is a frozen design record: [`docs/decisions/2026-09-05-mt-preview-baseline-faithful-overlay.md`](../decisions/2026-09-05-mt-preview-baseline-faithful-overlay.md). Read it before reasoning about where an editorial fix lands.**

🔴 **STEP 6 HAS A DESTINATION NOW, AND IT DID NOT BEFORE — ADDED 2026-09-05 AFTER [USER] ASKED WHETHER
EDITOR-FIXABLE ISSUES WERE ACTUALLY BEING LOGGED. BY THIS ROUTE THEY WERE NOT.** This row said only
*"fix what the chapter surfaced"* and named no artifact, so run-surfaced items landed in the register's
running prose **by convention**, while the [LEAD] ruling of 2026-08-23 had already designated one home
for exactly this class. **A step with no destination is not a step.** Route every step-6 item, in the
SAME COMMIT that observes it:

| what you found | where it goes |
|---|---|
| a defect **deferred to a HAND fix** (an editor can do it in the UX) | ⚒️ **Post-run manual-fix ledger** in the campaign register. ⚠️ **Admission rule 3 is binding: name WHERE the hand fix is performed.** An item whose hand fix has no home reads as handled and is not — that is what killed M1. |
| a defect needing a **CODE** fix | a numbered **§C…** section in the register, as a [CODE] item. **Not the ledger** — its predicate is *"cheaper by hand than by code"*. |
| a **premise pin** the corpus moved | bump it in the commit that observes it; the pin files say so themselves. |
| §C122's per-chapter **id-reattach mismatch count** | the chapter's step-6 entry — the count **and** the offending segment id. |

⚠️ **"It is in a commit message" and "it is in the register prose" are NOT the same as being logged.**
Neither is reachable by a human editor opening the segment editor, and neither is machine-readable.
▶ **And the per-book `translation-errors.json` is NOT a substitute — it is structurally blind to the
worst case**: a module the injector REFUSES is never "checked", so it is folded anonymously into
`skippedUntranslated`, while the *stale* file left on disk can still be scored **PERFECT**. Measured on
organic ch03: `m00037` sits inside `"perfect": 7`. **The more severe the failure, the less visible it is
in that file.** → register §C123 and the M4 ledger entry.

---

## Step 0 — before any new chapter: finish the two that are bought

🔴 **TWO CHAPTERS HAVE BEEN PAID FOR AND NEITHER HAS REACHED A READER.** Closing them costs 0 ISK,
proves the loop end to end, and is the precondition for trusting any of it.

- **Chemistry ch03** — re-extracted, re-MT'd 2026-09-01, injects 5/5 COMPLETE, and **was never
  rendered**. Its new Icelandic is in `03-translated` and absent from `05-publication`.
- **Organic ch03** — injected and rendered, **not published**: the live site 404s the new slug and
  still serves the July render. ⚠️ **And its rendered pages MIX September module bodies with JULY
  exercises** — the September exercise MT was paid for and never assembled, so the separate
  exercise-assembly step must run before this chapter is published, or readers get a half-new page.

---

## Preconditions the loop CONSUMES and does not regenerate

⚠️ **Tier 0 reads the GLOSSARY. Every other tier reads something the loop rewrites.** That is why
a tier-0 failure is a precondition and a tier-1..4 rate is a statement about the committed vintage.
Reproduce with `node tools/remt-sweep.js --tier 0 --with-spawns` — **redirect, never pipe** (the
tool exits with stdout in flight).

**Measured 2026-09-05 — the list is now short:**

| Gate | Where | Row | Ruling |
|---|---|---|---|
| G1 | chemistry | `SI` → *alþjóðlega einingakerfið*, `Si` → *kísill* | **[USER] 2026-09-05: a chemical symbol keeps its symbol.** Neither casing may be translated. |
| G3 | both books | `plus` → *plús*, `minus` → *mínus* | see the §C73 control below |
| — | chemistry | **85 of §C119's 127 harmful headwords** are in chemistry's committed glossary | chemistry still resolves through the `physics + biology` fallback that was removed from organic |

▶ **All four contested rows are `domain: physics`.** They are the same fallback contamination
§C119 fixed for organic, still present in the book the loop is about to spend money on.

▶ **The §C73 control says delete rather than keep.** The committed MT was produced under an older
glossary, so it is the unprompted control: English `plus` occurs **415** times in chemistry and the
Icelandic output contains *plús* **9** times, with **0** occurrences of `plus` left untranslated.
The model is already choosing contextually (*og*, *auk*, a `+` sign) where a flat map would force
*plús* on all 415. **A glossary entry that overrides a choice the model makes better than a flat map
can is one to delete.**

🔴 **A glossary fix goes in the file the code reads, never in SQL** — a hand `UPDATE`/`DELETE` is
reverted on the next boot by the migration that re-asserts these values, with no error and no log
line. → CLAUDE.md, and `server/lib/houseStyleTerms.js` for the ruling shape.

---

## Step 1 — re-extract

```bash
node tools/cnxml-extract.js --book <slug> --chapter <N>
```

⚠️ **Flags, never positionals** — the positional this tool declares is `input`, a file path.
⚠️ **`--output-dir` is accepted, printed in `--help`, and IGNORED.** It writes into the real tree
and exits 0. Do not reach for it to make a run safe.

**Chemistry's re-extract is already done and current** — today's extractor reproduces the committed
`02-for-mt` and `02-structure` byte-for-byte across all 149 modules. **Organic's is mandatory per
chapter**: 255 of 342 segment files differ from what today's extractor produces.

---

## Step 2 — re-MT the text

```bash
node tools/api-translate.js --book <slug> --chapter <N> --dry-run   # cost, glossary line
node tools/api-translate.js --book <slug> --chapter <N> --force
```

🔴 **`--force` IS MANDATORY.** `mtRunDecision` skips on FILE EXISTENCE, not a content hash, so a
bare run reports `To translate: 0 / Already done: N` and translates nothing while exiting 0.

🔴 **RE-EXTRACT FIRST OR THE MONEY IS WASTED.** `api-translate` reads the GENERATED `02-for-mt`,
never `01-source`, and spawns no extractor — so a `--force` after an extraction fix re-translates
the OLD English, reproduces the defect exactly, and exits 0.

**Measured cost, chemistry:** 1,237–3,132 ISK estimated per chapter (median ~1,884); billed runs
**~0.75× the estimate** and the ratio is not constant (0.68–0.75 by book, 0.535–0.896 per module).
**Quote a chapter as a range, never a point.**

---

## Step 3 — MT that chapter's figures

⚠️ **THIS STEP IS NOT RUNNABLE YET.** What exists is a proven single-figure chain and an editorial
review surface. What is missing is everything that makes it a chapter step. Status and the detailed
findings live in the register; the gaps, measured 2026-09-05, are:

1. 🔴 **Nothing writes the sidecar.** The chain dead-ends at the last step: paid MT lands in
   `out/translations-api.json`, and `publish-figure-svg.js` REFUSES because
   `books/<slug>/figure-text/<basename>.is.json` — which seeds both the editor and the publisher —
   is written by no code in the repo. **Paid figure MT currently reaches neither readers nor
   editors.** The block shapes differ too (`{"k": ["v"]}` vs `{"k": "v"}`).
2. 🔴 **No driver, and one shared `out/`.** Every stage reads and writes a single hardcoded
   directory holding whichever figure was extracted last, so figures cannot be processed in
   sequence without each overwriting the previous one.
3. 🔴 **`extract.py` crashes** on a figure whose source PDF has no live text — **112 of 463**
   resolvable chemistry figures (24%). A naive loop dies on the first one; it must SKIP.
4. 🔴 **173 of 463 sources are EPS** and need a ghostscript conversion the README documents and no
   script performs.
5. 🔴 **`out/artwork.svg` has no producer** anywhere in the repo, and the settled output format is
   SVG.

▶ **The unit of work is therefore: a figure driver that takes a BOOK and a CHAPTER**, enumerates
that chapter's figures, resolves each source (PDF or EPS), skips the text-less ones with a counted
summary, isolates per figure, and **writes the sidecar** so the editor and publisher can see it.

⚠️ **Chemistry already has 691 `_IS` SVGs** from a June test run with no editorial surface. Those
are MT-preview quality by construction; replacing them with pipeline output an editor can review is
the point, not a risk. All are git-tracked, so `git checkout` is the restore.

---

## Step 4 — inject, render, and the free checks

```bash
node tools/cnxml-inject.js --book <slug> --chapter <N>
node tools/cnxml-render.js --book <slug> --chapter <N>
node tools/source-roundtrip-check.js <slug> <N> --verbose
node tools/render-oracle-check.js  <slug> <N> --control
```

⚠️ **Run `source-roundtrip-check` with `--verbose`** — it caps its detail listing at 4 per category
per module, so a non-verbose read is a truncated view that looks complete.
⚠️ **Run `render-oracle-check` with `--control` before believing a clean result.**

🔴 **`02-mt-output`, `03-translated` and `05-publication` ARE NOT CORRECTNESS REFERENCES.** The gold
is `01-source` and OpenStax's published HTML. A diff against previous output answers *"did anything
change"*, never *"is this right"*.

---

## Step 5 — publish

Order: render → `generate-index` → **hand the redirect rows to vefur** → **named-book** sync →
build → deploy.

🔴 **NAME THE BOOK.** A bare `sync-content.js` publishes EVERY book, including the ones held back.
🔴 **Hand vefur the `from`/`to`/`moduleId` rows BEFORE the sync**, not after — its redirect entries
are inert until their target exists, so redirect-then-sync is the only ordering with no 404 window.
⚠️ **Verify by fetching `/content/<book>/chapters/<NN>/<file>.html` and judging by BYTE SIZE.**
Every page URL returns 200 with an identical SPA shell.

---

## What the loop retires as it goes

The deletion half of the purpose is not a separate project — most of it falls out of the loop:

- **Legacy `{{i}}`/`{{term}}` markers** survive in **74 of 149** chemistry `.is.md` files and **0**
  of 149 `.en.md`. Organic is clean on both sides. **A re-MT retires them mechanically**, and the
  back-compat branch in `cnxml-inject.js` becomes dead code once chemistry is through.
- ⚠️ **`++text++` IS NOT in that sweep.** It is the retired EN-side dialect *and* the segment
  editor's current underline button output. Retiring the dialect must not break the button.
- **`docx-import` is already gone from the data** — 237 of 237 provenance sidecars read
  `api-translate`. The tool is still live; retiring it is a contract decision, not a deletion.
- **`mtReady`** — a stage whose only producer is archived — is still in the sequential prerequisite
  chain, and `pipelineService` still spawns two tool paths that do not exist.
- **138 `-links.json` sidecars** from the protect-segments era remain tracked.

---

## Order of chapters

[LEAD] sets it. The default is **ascending, chemistry first**, because chemistry's re-extract is
already current and organic needs a per-chapter extract as well.

⚠️ **One chapter at a time, and stop after each.** The acceptance criterion for the whole campaign
is **never having to re-run the MT** — so a chapter that surfaces a defect is worth more than a
chapter that ships.
