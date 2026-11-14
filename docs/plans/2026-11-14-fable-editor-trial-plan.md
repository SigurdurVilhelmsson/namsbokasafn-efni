# A side trial: Claude Fable 5.2 as an editor of one chapter's machine translation — PLAN (2026-11-14)

> **What this is.** A plan for an exploratory side trial, written before any trial output exists, so the
> method is on record first. It is not part of the Skerfur measurement and changes nothing in it.
> **Status lives in the active register** (`docs/plans/2026-07-21-post-item17-followup-campaign.md`), never
> here. If this plan disagrees with the code and its tests, the code wins.
>
> **Requested by [USER] on 2026-11-14:** "do a test run of a single chapter of the book, using Fable 5.2 as
> an editor for the translation … compare that to Miðeind's MT baseline and the AI layer already in place,
> before human editors touch the text", without disturbing Skerfur, and with a route to use the results
> later that does not damage the research.

## 1. The question, and the answer in short

**Can Fable 5.2, editing the whole text and not only terminology, produce a draft that is clearly closer to
publishable Icelandic than Miðeind's MT and the term pass?**

The short answer to "how, without disturbing Skerfur": run Fable on one chapter **from the same frozen
inputs the term pass used**, write its output **only into a new experiment folder**, keep it **away from
the editors and from every path Ritstjóri reads**, and compare the three texts with free automatic
measures now and with the human-edited text once the editors have finished that chapter. If the results
are good, Fable can enter the project **as a new, separately labelled source of AI suggestions for units
not yet opened**, decided in a dated record before the first such unit opens. It must never silently
replace the editors' starting text (§7).

## 2. The three conditions compared

All three are read at one layer-1 commit, the one the term pass's full run and the ch10 re-buy pinned:
`0093d8da4620a2041e583d3f84d39e9b49f055a2` (see `experiments/ai-review-pilot/ch10-rebuy-2026-11-08/README.md`).

| Label | What it is | Where it is |
|---|---|---|
| **MT** | Pure Málstaður output, with the selected overlay applied: what an editor opens | `02-mt-output/` + `02-mt-selected/`, read through `readBase` in `tools/lib/mt-layers.js` |
| **TP** | The term pass with every gate-accepted edit applied (the text an editor would have if they accepted every suggestion) | `02-mt-revised/` |
| **FE** | Fable 5.2 as a full editor (new) | `experiments/fable-editor-trial/` only |

A fourth text joins later: **HU**, the editors' approved text in `03-faithful-translation/`, once the
chapter has been edited and applied.

## 3. What must not happen (the Skerfur guard rails)

Each item is a hard rule for the trial's code and for whoever runs it.

1. **No write to any project layer.** Not `01-source/`, `02-mt-output/`, `02-mt-selected/`, `02-mt-revised/`,
   `03-*`, `04-*`, `05-*`, `tm/`, `books/*/ai-review/` (including its ledger), and not the editorial
   database. The pure MT layer stays exactly as received ([USER] ruling 2026-11-05, CLAUDE.md § Purpose).
2. **The editors never see FE before they have finished that chapter.** Not in Ritstjóri, not in the
   suggestion view, not in the concordance or TM, not as a file sent to them. Seeing a polished draft
   before editing would change what they do, and the study measures what they do. This includes the blind
   ranking in §6.2: it waits until the chapter is edited, or uses someone who will not edit it.
3. **Fable revises; it never translates.** A segment with no MT is left alone. New translations still come
   only from the Málstaður API (CLAUDE.md § Purpose). The trial's checks refuse a response that adds or
   drops a segment.
4. **No fallback model.** A refused request is recorded as refused, never answered by another model, so
   every FE segment is Fable's. The shared harness already allows no `fallbacks` field.
5. **Its own spending record.** The trial uses a separate ledger and cap, so it never counts against the
   term pass's budget, and its cost is reported on its own.
6. **Faithful, not localized.** The prompt asks for a faithful translation. Localization (units, Icelandic
   examples) is a separate track with its own thread, and mixing the two here would make FE incomparable
   with MT and TP.

## 4. The chapter: ch10 (recommended)

- ch10 is the term pass's pilot chapter: three pilot runs (medium, high, xhigh), its blind short look, and a
  re-buy under the full run's exact inputs. TP is better understood there than anywhere else.
- It is mid-sized: 8 modules plus the chapter metadata, 1,142 segments, about 283,000 characters of English
  segment text (measured on `main` on 2026-11-14, markers included).
- **One condition decides against it:** if ch10 is among the last chapters the editors will reach, the
  comparison with HU (§6.3) arrives late. If [USER] knows the chapter order, the best choice is the chapter
  that will be edited and applied **soonest**, since every chapter has TP under the same condition. ch10
  stays the default if nobody knows.

## 5. The run

### 5.1 What gets built (code only, no spending)

A small runner in `experiments/fable-editor-trial/`, reusing the tested pieces instead of building new ones:

- **`tools/ai-review/harness.js`** for every API call: token counting, a worst-case reservation against a
  cap, batch or interactive mode, a record of every request and response, resumable batches, refusals and
  truncation recorded and never retried. It is generic (`{ key, body }`), so it needs no change.
- **`tools/lib/mt-layers.js` `readBase`** to read MT exactly as an editor would open it, read-only.
- **`tools/ai-review/pricing.js`** gains a `claude-fable-5-2` row ($8 in, $40 out, $0.20 cache read per
  million tokens, from the claude-api reference model table, dated) with its test. This is the only change
  outside the experiment folder, and it is an enforceable value, so it lives there and not here.
- **A marker check over every FE segment** (`markerSignature` in `experiments/fable-editor-trial/lib.mjs`).
  It compares the fixed part of each marker before and after: the type, the whole body of
  `MATH`/`MEDIA`/`TABLE`/`xref`/`docref`/`sub`/`sup`, and the part after `|` of `term`/`link`/`fn`. The
  words inside a `term` or `i` may change, which the API-side count could not tell from a loss. A segment
  that fails is refused into the analysis (FE keeps the MT text there), counted, and kept in the records.
  *(Amended 2026-11-14 with the runner: the plan named `bracketMarkerDeltaBySegment`, which counts marker
  types only and would accept a changed term id or formula.)*

**Where the records go.** The harness accepts a records directory outside the repository, or
`books/<slug>/ai-review` inside it. The trial writes outside (for example `~/namsbokasafn-fable-trial/`),
with its own ledger there, and a `promote` step then copies a finished run into
`experiments/fable-editor-trial/runs/<runId>/`, so the evidence is committed and citable (CLAUDE.md
§ Purpose: off-repo evidence is not durable enough). Publishing the records is covered by
`docs/decisions/2026-10-28-ai-provider-output-terms.md`.

### 5.2 One request per module

Fable has a 1M-token context, so each request carries a whole module (or one chapter-metadata file): the
English segments, the MT segments, and the chapter's house terminology. A module above 30,000 Icelandic
characters is split into two requests so the answer cannot run into `max_tokens` (64,000); each half still
carries the whole module's English as context. ch10 makes 11 requests over 1,054 segments. Whole-module requests give Fable the
context a human editor has, which the term pass's segment batches did not need.

- **House terminology:** the same compiled ruling set the term pass used for that chapter
  (`tools/ai-review/compile-ruling-set.js`), pinned by its hash in the run record. Without it Fable would be
  marked down for terms the project has already ruled on, which says nothing about its Icelandic.
- **The prompt** is short and states the task, not a list of rules: edit this machine translation into
  correct Icelandic for a secondary-school chemistry textbook, in a register that is
  semi-academic but fluent for younger readers ([USER]'s wording, 2026-11-14), with grammar judged in context; keep it faithful to the English; use
  the house terms; keep every `[[…]]` marker; return only the segments it changes. (The claude-api guidance for Fable 5.2 is that prompts written for older models are often
  too prescriptive.) The prompt file is committed and its sha256 recorded before the run.
- **The answer** is structured output (`output_config.format`, a JSON schema): per segment, its id, the
  edited text, and zero or more change tags from a closed list (terminology, grammar and agreement, word
  order and fluency, meaning error fixed, register, punctuation). The tags make the analysis possible; they
  are Fable's own report and are treated as such.
- **Effort `high`**, the claude-api reference's starting point for Fable 5.2. No `xhigh` unless a small
  side-by-side on one module shows a gain.

### 5.3 Cost

The run is paid from [USER]'s own Anthropic account, so cost is not a budget concern for the project
([USER], 2026-11-14). It is still recorded: the research report compares the cost of each MT and AI step
(CLAUDE.md § Purpose), and a full-editor pass will cost several times the term pass. A rough estimate, to
be replaced by the dry run's count: about 300,000 input tokens and 200,000–300,000 output tokens including
thinking, so about $10–15 at standard rates or half that through the Batch API. A cap of **$40** stays,
only as a guard against a runaway run. The actual cost goes into the run's README.

### 5.4 The commands [USER] runs locally

Cloud sessions have no API key, so the run happens on [USER]'s machine, before the key expires on
2026-11-27. `--records` must be an absolute path outside the repository. The runner's `--help` and
`experiments/fable-editor-trial/README.md` are the reference; this is the order:

```bash
nvm use && git switch main && git pull
# 1. Free: the plan and a worst-case cost; sends nothing, needs no key
node experiments/fable-editor-trial/run-trial.mjs --chapter ch10
# 2. The smallest module, interactively, to read the output before buying the chapter
node experiments/fable-editor-trial/run-trial.mjs --chapter ch10 --module m68760 --records "$HOME/namsbokasafn-fable-trial" --cap-usd 5 --yes
# 3. The whole chapter through the Batch API (if polling stops, rerun with --resume <runId>)
node experiments/fable-editor-trial/run-trial.mjs --chapter ch10 --mode batch --records "$HOME/namsbokasafn-fable-trial" --yes
# 4. Copy the finished run into the repository, then build the comparison (free, offline)
node experiments/fable-editor-trial/promote.mjs --run <runId> --records "$HOME/namsbokasafn-fable-trial"
node experiments/fable-editor-trial/compare.mjs report --run <runId>
# 5. After ranking blind-sheet.md into blind-answers.csv (without opening blind-key.b64)
node experiments/fable-editor-trial/compare.mjs score --run <runId> --answers experiments/fable-editor-trial/results/<runId>/blind-answers.csv
```

Step 3 sends m68760 again; the step-2 run stays as its own record, and the comparison uses the step-3
run. The runner refuses to start on a dirty `books/` tree or with the prompt, ruling set or its own code
uncommitted, and checks `books/` again after the run.

**Pinned inputs.** The runner refuses unless ch10's MT and overlay are byte-identical to what the term
pass read (run `20261108T193214Z-76357476`). The English may differ in one way only: G1.12 (2026-11-12)
removed later repeats of duplicated segment ids from five ch10 modules after the term pass. The runner
checks that removal against the English at the term pass's commit and records it in the run as
`enDrift`. The removed repeats have no English now, so they are sent to nobody and left out of every
comparison.

## 6. How the three are compared

### 6.1 Free, automatic, available at once

`compare.mjs` writes a report under `experiments/fable-editor-trial/results/`:

- **How much each changed:** segments changed and character edit distance from MT, for TP and FE. FE will
  change far more; the question is whether those changes are improvements, which 6.2 and 6.3 answer.
- **Structural safety:** markers conserved, segment count kept, no empty segments. Anything below 100% is a
  defect to report, since it would break inject.
- **Terminology:** does FE use the house terms where TP put them in? Measured with the term pass's own
  leftover-form check (`tools/ai-review/leftover-forms.js`) on the same ruling set, so TP and FE are judged
  by one instrument.
- **How TP and FE differ by design:** TP is a narrow terminology pass. Its prompt says it does not
  translate and does not improve style, and code checks each minimal operation. FE edits language,
  grammar and register as well. Most of FE's extra changes are therefore expected, and 6.2 judges them.
- **Overlap:** of the segments TP changed, how many FE also changed, and the other way round.
- **Fable's own tags,** counted by type, so a reader sees what kind of editing it claims to do.

None of these says FE is *better*. They say how different it is, and whether it is safe to handle.

### 6.2 Blind ranking by a yfirlesari

A stratified sample of about 60 segments where the three texts differ (spread over modules and segment
types: prose, figure captions, exercise text, headings). For each, the English and the three Icelandic
versions in random order with no labels; the reader ranks them and marks each "would accept as is" or not.
`compare.mjs` writes the sheet and a separate, sealed key.

**Who and when:** this is where the trial could touch the study (§3 rule 2). Three options, in order of
preference:

1. A yfirlesari ranks the sample **after** they have finished editing that chapter. Safest, but later.
2. The yfirlesari who will **not** edit that chapter ranks it now. Fast, but they still see Fable's style
   before their own work, a small contamination that must be reported.
3. [USER] ranks it now, as a preliminary read, and then does not edit that chapter. **Chosen by [USER]
   on 2026-11-14** (§9).

### 6.3 Against the human text, once it exists

When the editors have approved and applied the chapter, HU exists. Only segments whose English and MT did
not change between the pinned commit and HU's apply are compared.

- **Distance to HU** (character edit distance and chrF) from MT, TP and FE. Lower means the draft already
  held more of what the editors decided.
- **Edit recall and precision against the editors:** of the segments editors changed, how many FE also
  changed (recall); of the segments FE changed, how many the editors also changed (precision).
- ⚠️ **A known bias, stated before the data:** the editors start from MT, so HU is anchored to MT's
  wording, and distance measures favour MT. A smaller lead for FE than the ranking suggests is expected;
  a lead for FE despite this bias is a strong result.

### 6.4 What "promising" means

Set now so the result cannot move the bar: FE is promising if **(a)** structural safety is 100% after the
refusals are removed, **(b)** FE is ranked first in a clear majority of the blind sample and is marked
"would accept" more often than TP, and **(c)** once HU exists, FE is closer to HU than MT is on most
segments despite the anchoring bias. (a) and (b) are enough to plan integration; (c) is the publishable
result.

## 7. If the results are good: integration without damaging the research

The study measures the editing workload from pure MT to publication, with the term pass's edits offered as
labelled AI suggestions (`docs/decisions/2026-10-28-ai-term-pass-as-editor-suggestions.md`). Anything that
changes what an editor sees changes the measurement, so integration is a decision with a date, not a quiet
upgrade. Options, safest first:

1. **Keep FE as research evidence only.** The trial becomes a section of the report: a fourth condition on
   one chapter, compared with the human result. Nothing changes for the editors. Always available.
2. **Fable as a second source of suggestions, for units not yet opened.** FE's changes are shown in the
   same suggestion view, labelled as AI and as a different source from the term pass, accepted or rejected
   one by one, and logged as an assist of their own type in the event log (G1.2). The eligibility rule the
   term pass already follows applies: a unit gets them only if the run and the view existed before it was
   opened. A dated decision record names the first affected unit before it opens, so the analysis can split
   units by condition. This is the recommended route: it keeps pure MT as every editor's starting text,
   and the per-suggestion accept/reject log is itself a measure of Fable's value.
3. **Fable as a reviewer after the editors.** Fable reads the approved text and flags possible errors for
   the head editor. It does not touch the measured editing, but an accepted flag changes the final text, so
   it is logged as its own event.
4. **FE as the editors' starting text.** This changes the quantity the study measures, from "MT to
   publication" to "AI draft to publication", and would end the comparability of chapters edited before and
   after. It needs [USER]'s ruling, and if chosen, it should apply to whole chapters not yet assigned,
   recorded per unit, and be reported as a separate condition. Not recommended during the study.

In every option: FE is its own layer with its prompts, model, date, inputs, outputs and change records, the
three-layer rule of CLAUDE.md § Purpose extended to a fourth, and pure MT is never overwritten.

## 8. Steps and order

1. This plan is reviewed and merged (the method is then on record before any output).
2. The runner, `promote` and `compare` are built and tested in a code PR, with no spending.
3. [USER] runs steps 1–4 of §5.4 locally before 2026-11-27.
4. The automatic report (§6.1) is committed with the run.
5. The blind ranking (§6.2) at the time [USER] chooses.
6. The comparison with HU (§6.3) when the chapter has been applied.
7. If promising (§6.4), a decision record on integration (§7).

## 9. Questions for [USER] — answered 2026-11-14

- **The chapter:** ch10.
- **The blind ranking:** option 3 of §6.2. [USER] ranks the sample as soon as the report exists, and
  does not edit ch10.
- **Cost:** paid from [USER]'s monthly Anthropic API credits (USD 200 a month), so not a project cost;
  it is still recorded (§5.3).
