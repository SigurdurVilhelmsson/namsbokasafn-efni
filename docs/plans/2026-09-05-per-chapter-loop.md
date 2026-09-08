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
| **M1** | **Chemistry's glossary is clean** | 🔴 **CORRECTED — the gate is `node tools/remt-sweep.js --tier 0 --with-spawns` PASSING on the DEPLOYED payload** (redirect, never pipe). **NOT "the removal-set intersection is zero"** — eight `-ium → -ín` rows are in no removal set, so that check can read zero while blocking gate G2 still halts the run. Sequence: deploy → concept edits → one FORCED export tick → re-run tier 0. ⚠️ Merge ≠ deploy ≠ export tick. → §C127 | 0 ISK |
| **M2** | **Chemistry ch03 re-MT'd and published** | The rendered pages contain **0** of `tilbrigði`/`sjálfkvæm*`/`ílend*`/`fellihóp*` (control: a term that SHOULD be there, e.g. `mól`), and `/content/efnafraedi-2e/chapters/03/…html` is live **by byte size** with a 404 control. | **paid** |
| **M3** | **Organic's extraction gaps closed** | A re-extract of any organic chapter emits **alt segments > 0** for its exercises (control: module alt segments still emitted), and the 32 markup-bearing `<document><title>` modules emit their real title rather than a donated one. **`table@summary` has a written [LEAD] ruling** either way. | 0 ISK |
| **M4** | **Organic ch03 completed and published** | **0** English alt attributes on its rendered pages (control: the Icelandic ones still score Icelandic), and its pages live by byte size. | **paid** |
| **M5** | **Step 3 is runnable** | One chapter's figures processed end to end **unattended**, writing a `books/<slug>/figure-text/<basename>.is.json` sidecar an editor can actually see — with text-less figures SKIPPED and counted, not crashing. | small |
| **M6** | **The loop is running** | A chapter bought under clean preconditions completes all six steps and reaches a reader, and step 6 surfaces a defect class **already known** rather than a new one. | **paid** |

🔴 **M2's GATE WAS CORRECTED 2026-09-06 — IT LISTED A TOKEN THAT FIRES ON CORRECT ICELANDIC, AND A
GATE THAT CANNOT PASS IS AS BROKEN AS ONE THAT CANNOT FAIL.** The row read `…/felli*`. Measured on
chemistry ch03: **every** `felli` match — in `02-mt-output` and in the rendered pages — is
`tilfelli`, the ordinary word for *case*, rendering the English "in the case of". Its source row
`case → tilfelli` [biology] is **correct and still in the glossary**; so is `precipitation →
útfelling` [chemistry], which generates `felli` forms book-wide.
▶ **AND THE ROW BLAMED FOR IT NEVER FIRED HERE AT ALL:** `functional → felli` [physics] was the
organic defect (`fellihóp*`), and English *functional* occurs **0 times** in chemistry ch03
(control: 48 in ch20). **The `felli* ×2` this register recorded for chemistry ch03 was `tilfelli`
misclassified as contamination from the first entry onward.**
▶ **Anchored to `fellihóp*`, not dropped** — three adversarial refuters agreed: dropping it loses
coverage of the real organic shape, while the substring form trips on two correct chemistry rows.
⚠️ **"Unpassable" is the wrong word and the refuters were right to correct it: the model splits
roughly 50/50 between `tilvik` and `tilfelli`, so the old token would have failed *by luck* on one
run and passed *by luck* on the next.** A gate that passes by luck is the same defect as one that
fails by luck.

⏹ **AND M2's "published" HALF IS NOW CONDITIONAL — [USER] RULING 2026-09-06:** *nothing replaces
published pages until the new output is demonstrated to be an improvement.* Nothing has been synced
to production during this campaign; the MT-preview in use in schools is a pre-campaign vintage.
**So M2's deliverable is the COMPARISON, not the sync** — corruption count at 0 with a live control,
terminology consistency measured against the prior version, mechanics unregressed, and a sampled
read by [USER] of the segments that moved most.

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

🔴 **REWRITTEN 2026-09-05 (evening) — EVERY CLAIM IN THE PREVIOUS VERSION OF THIS BLOCK WAS STALE, INCLUDING ITS HEADLINE.** It read *"TWO CHAPTERS HAVE BEEN PAID FOR AND NEITHER HAS REACHED A READER"*. **Measured by fetching the content files: BOTH are live** — chemistry 9 of 10 pages, organic 11 of 13 (2026-09-02 vintage). **What has not reached a reader is the RE-MT'd version of either.** ▶ **A sync is an UPDATE, and a hold withholds an improvement rather than protecting a reader.** *(A page URL 200s for everything — only the content file and its byte size mean anything.)*

⏹ **BOTH CHAPTERS ARE NOW HELD, AND NEITHER HOLD IS FREE TO LIFT:**

- **Chemistry ch03** — re-extracted, re-MT'd 2026-09-01, injected, **rendered** (PR #449). 🔴 **HELD: it was bought under the CONTAMINATED glossary and its RENDERED pages carry the damage** — `tilbrigði` ×1, `sjálfkvæm*` ×2, `ílend*` ×1 (control `mól` = 334). **[USER] 2026-09-05: re-MT it against a clean glossary before it syncs.** → **M1 then M2**. The repair is **paid**; no free re-run reaches it, because the wrong words are in the translation itself.
- **Organic ch03** — re-MT'd against the clean glossary, September exercises **assembled**, injected (7 of 8; `m00037` refused), **rendered**. 🔴 **HELD on §C123: 117 of 198 `alt` attributes on its pages are English**, and they are **already live** — so the hold withholds the §C121 terminology fix rather than shielding readers from the alts. → **M3 then M4**. ⚠️ `m00037` is ledger item **M4 (⚒️)**, editor-fixable, and its route is now proven — see the frozen pipeline model.

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
| — | chemistry | harmful headwords remain in the committed glossary | chemistry still resolves through the `physics + biology` fallback that was removed from organic |

🔴 **THAT ROW USED TO SAY "85 of §C119's 127" AND CITING IT AS THE FIX IS THE TRAP.** The frozen §C120 set built from it **does NOT discharge §C121** — verified with a control: it holds `established` and `fall` but **NOT** `double`, `functional`, `multiple`, `form`, `consistent`, all five still `approved` in chemistry. §C119 audited **ORGANIC**; only `Si` is new. **Build a corrected set — the count is not the point, the coverage is.** → register **§C126**, milestone **M1**.

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

### Retrying a HELD-BACK module — the per-module path

🔴 **EXIT 1 IS NOT A FAILED RUN.** A module with a bracket-marker delta or an id-reattach mismatch
is **held back** from `--update-status` and forces `process.exit(1)` — but **its output IS written
and the API call IS paid for either way**. Read the summary, not the exit code. `Failed: 0` with
exit 1 means every module was bought and at least one needs review.

🔴 **NEITHER OBVIOUS RETRY IS CORRECT.** `mtRunDecision` keys on FILE EXISTENCE, so after a
held-back module:
- a **bare re-run** reports `To translate: 0 / Already done: N`, translates nothing, exits 0;
- a **bare `--force`** re-buys **every module in the chapter**, paying twice for the good ones.

✅ **The retry is per-module** (verified 2026-09-06 by dry-run — `--module` is singular, one id per
invocation, and requires `--chapter`):

```bash
# which modules were actually rewritten? today's date = already done
grep -a generatedAt books/<slug>/02-mt-output/ch<NN>/*-provenance.json
node tools/api-translate.js --book <slug> --chapter <N> --module <mNNNNN> --force [--no-glossary]
```

**Measured:** scoping to chemistry ch03's largest module priced at **~623 ISK** against **~1,408 ISK**
for the whole chapter — so a retry costs its own module, not the chapter.

▶ **[USER] RULING 2026-09-06 — A SPORADIC MARKER DEFECT IS RETRIED, NOT CODED AROUND.** Measured on
two same-arm ch03 runs: 1 module of 12 module-runs was held back, and **the second run got both
defects right unaided**. Retry ≈ 175 ISK for an average module. ▶ **And the proposed code fix
measured WORSE than the retry**: unwrapping the invented markers yields `C2H5O2N`, while the clean
run naturally produced `C neðanskrift 2 H neðanskrift 5 …` — spelling "subscript" out in words, which
is what the English does deliberately for screen readers. **Spend on guards and the occasional
in-loop re-MT, not on code that ships inferior text.** → register §C134 for the two classes and the
one measured blind spot.

⚠️ **THE RULING DEPENDS ON THE DEFECT BEING DETECTED, AND THAT IS VERIFIED — DO NOT EXTEND IT TO A
SILENT ONE.** Four guards cover invented/dropped markers: `bracketMarkerDelta` (**per segment, per
type** — deltas that sum to zero are still counted in `segmentsWithDelta`, so it does not fall into
the cancelling-tally trap), `reattachIds`' count guard, inject's residue check (which **refuses the
module**), and `unwrapInventedMarkers` for unknown types. **A defect no guard sees is a different
decision.**


---

## Step 3 — MT that chapter's figures

```bash
node tools/figure-run.js --book <slug> --chapter <N> --dry-run   # free: classify + name, buys nothing
node tools/figure-run.js --book <slug> --chapter <N>             # the paid run
node tools/figure-run.js --book <slug> --chapter <N> --stale     # recompose only, 0 ISK
```

The driver enumerates the chapter's figures, resolves each source (PDF, EPS or AI), classifies it,
sends only the vectors whose text it can actually read to the paid MT, and **writes the
`books/<slug>/figure-text/<basename>.is.json` sidecar** that the editor's review panel and
`publish-figure-svg.js` both read. Text-less figures and photographs land in a `copied-*` outcome —
**counted and NAMED, never crashed on and never paid for**. ⚠️ **The driver publishes only
`translated` figures**: `processFigureLive` returns early for anything else, so a `copied-*` bucket
records a decision about a figure, it does not move the artwork onto the page. ⚠️ **The dry run prints no cost estimate** — what it gives you is
the per-outcome tally (the `translated` count is the buy list), every figure NAMED, and a partition
assertion the driver makes on itself. Its design is
[`docs/superpowers/specs/2026-09-06-m5-figure-driver-design.md`](../superpowers/specs/2026-09-06-m5-figure-driver-design.md).

🔴 **NEITHER `--stale` NOR `--force` CAN SPEND — THEY RECOMPOSE.** Both compose from the sidecar's
own blocks, and after an editorial correction those blocks ARE the corrected Icelandic, so
re-running the MT would overwrite the correction *and* charge for it. **To re-buy a figure, a human
DELETES `books/<slug>/figure-text/<basename>.is.json`** — there is no `--retranslate`. The paid
stage runs for exactly one class of figure: one with **no sidecar file**.

⚠️ **`--chapter` is required on EVERY invocation, `--stale` included** — the CLI refuses without it.
*(Corrected 2026-09-08 before it was written down: a bare `--stale` was proposed for this block,
from a misreading of the driver's own docstring, which says that putting `--stale`/`--force` in
`VALUED_FLAGS` would make the bare flag a usage error — a statement about value-taking, not about
`--chapter` being optional. `parseCli` throws `--chapter is required`.)*

⚠️ **Do NOT read a clean run here as M5's gate being met.** That gate is one chapter's figures
processed end to end unattended, and **whether it has happened is the register's ⏩ RESUME to say**,
never this document.

🔴 **CORRECTED 2026-09-06 [USER] — THE 691 `_IS` SVGs ARE NOT MT OUTPUT AND ARE NOT A STARTING POSITION.** This paragraph said they were *"MT-preview quality by construction"*. **They are not: they are a Claude Cowork experiment and were never run through Miðeind's MT at all**, and the approach has moved on considerably since (the working sessions of the last ~week). ▶ **So chemistry does NOT start ahead of organic — BOTH books start from zero**, and any plan that sequences the two on that supposed asymmetry is built on a false premise. *(This paragraph was itself cited that way on 2026-09-06 before the correction; it is exactly the "a wrong 'already built' is the expensive error" shape.)*

▶ **[USER] RULING 2026-09-06 — EVERY IMAGE IS RE-PROCESSED, AND THE SPLIT IS BY IMAGE KIND, NOT BY BOOK:**
- **photographs move over UNTRANSLATED** — they carry no text paths, so there is nothing to translate and nothing to pay for;
- **vector images WITH TEXT PATHS go through the MT.**
▶ **That split is the driver's first job**, and it is what makes a figure the reader finds no text in a *classification* problem rather than an error-handling one: a text-less vector and a photograph are both "copy it over", not "crash", and not "pay for it". *(Reworded 2026-09-08: this cited a numbered gap that has since been closed and deleted above, and a figure population from a superseded census. **Figure populations are owned by [`experiments/figure-text-translation/TEXT-COVERAGE.md`](../../experiments/figure-text-translation/TEXT-COVERAGE.md); this document restates none.**)*

⚠️ The 691 are git-tracked, so `git checkout` remains the restore — but treat them as **an artifact to be replaced**, never as coverage already achieved. **Do not count them in any figure-progress number.**

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
