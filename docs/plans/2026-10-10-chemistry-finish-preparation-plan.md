# Chemistry: finishing the MT preparation and handing over to editing — PROPOSAL (2026-10-10; rev. 4, 2026-10-11)

> ✏️ **PROPOSAL, awaiting [USER]'s decisions (§8).** This is not status: open work lives in the
> active register's ⏩ RESUME block.
> **Evidence:** [`experiments/mt-vintage-comparison/`](../../experiments/mt-vintage-comparison/README.md)
> and [`experiments/terminology-consistency/`](../../experiments/terminology-consistency/README.md).
> **Funding mapping** (which grant pays for which step, and dates) is in a **private companion** in
> the git-excluded `docs/grants/`. This repository is public, so no budget figure appears here.
> **Rev. 2** folds in a blind two-model critique (Fable 5.1 `claude-fable-5-1` and Opus 5.5 `claude-opus-5-5`, same inputs, neither saw
> the other). What changed, and why, is in §11.
> **Rev. 3 (same day)** takes in the follow-on project's contract. Its wording is final, and [USER] says the project starts later
> this month. That fixes the calendar (§1 point 0, §5).
> **Rev. 4 (2026-10-11)** takes in the current grant's terms and its fund's guidance: what remains of that grant can be
> used until its final report is delivered. The follow-on's own work plan starts its 12 months when the current grant's
> project ends, so **S should be the day after that report**. That gives one boundary, with preparation before S
> payable from the current grant (§1 point 0, §5, D0, D11, D13, D14).

**[USER]'s question (2026-10-10).** Choose how to finish chemistry's MT preparation. The options:
1. keep the June MT;
2. keep the September MT and fix it in editing;
3. evaluate chapter by chapter;
4. repair the MT with code;
5. repair it with AI judgement;
6. re-buy it with the glossary;
7. something else.

The needs:
- **speed**, without losing much quality;
- **as much as possible in code**;
- **documented AI steps**;
- **the editor improvements**: single-command term replacement, BÍN inflections, language technology.

This builds on the three-text-layer rule in CLAUDE.md § Purpose.

## 1. The recommendation in brief

0. **The calendar is fixed.** The follow-on project **runs 12 months from its start date S.** [USER] has said it starts later this month (late October 2026).
   - **By its end, every chapter must be reviewed and published,** the speech synthesis finished, and the parallel corpus and terminology collection released (the contract's project description).
   - **The final report is due by 1 December 2027.**
   - **One boundary: the current grant's final report, then S.**
     - The current grant's terms set its project's end at 30 June 2026. Its fund has told [USER] that what remains of the grant can be used until the final report is delivered, which [USER] plans within 20–30 days.
     - The follow-on's work plan, part of its contract, starts its 12 months when the current grant's project ends. Its application promises that lemmatization and the proofreading begin only after that. **So S should be the day after that report** (D0).
     - The two dates [USER] has given, a start later this month and the report within 20–30 days, meet around the turn of the month. A report on 31 October (day 20) puts S on 1 November. If the report needs the full 30 days, S moves to about 11 November, and §5 moves with it.
     - **Before S, preparation can be paid from what remains of the current grant. From S, it is never follow-on paid hours:** it counts as follow-on in-kind where it fits one of the follow-on's in-kind lines, and is otherwise unfunded (private companion).
     - **Tag both repositories on S.** Both final reports cite that tag for what existed before the follow-on began.
   - **So the start date is no longer the freeze.** What matters is that the base is ready **before the first unit is opened**. On the project's own schedule (timing capture in months 1–3, editing from month 2), that is **about S+4–5 weeks: around 1 December, or mid-December if S is about 11 November**.
   - **Preparation not finished by S continues in month 1, never as follow-on paid hours.** The exception is terminology harmonisation, which the contract names as part of the follow-on project, so [USER]'s term rulings made after S belong to it.
   - **Editing throughput is now the binding constraint.** All chapters must be finished within the 12 months, which makes D12 (how deeply to review alts and table summaries) urgent.
   - **Cut-down path:** if the AI layer is not checked in time, freeze with the rule layer only. Apply the AI layer later, to units nobody has opened yet, and record it per segment in the editors' baseline.
1. **There is no per-chapter choice to make.** The measurements answer the structural questions:
   - June text can be carried onto the new structure (94% of segments, 0 ISK);
   - both vintages' defects are counted;
   - production holds no editor work against the September MT.

   The one open quality question is which text *reads* better. A blind test with key terms masked answers it.
2. **Terminology must not decide the base.**
   - Which base needs less term repair depends on [USER]'s own scope rulings (*atom → atóm* book-wide reverses the ranking), and the 217 unruled headwords swing it by about 400 segment–term pairs.
   - The 351 house-style "misses" counted against June are rulings made 4–27 September, after every June buy. June could not carry them, and the rule layer applies them to either base.
   - The review page's majority for the July word (57 of the 65 cards whose entries differ) is real, but it covered only the 104 terms that *lost* consistency.
3. **Base: the September MT by default, for structural reasons only:**
   - no carry tool;
   - no superseding decision record;
   - one marker dialect and one vintage;
   - glossary arm and cost recorded per module. Neither vintage records the model version. June's arm is known from git, not from its sidecars, and June has no recorded cost.

   When nothing distinguishes the texts, take the one that needs no extra machinery.

   **Override, written down before the test is run:** if June reads clearly better in the masked test, use the hybrid instead (June where it carries cleanly, September elsewhere, §5 step 2.1). "Clearly" means June wins about **6 of every 10** decisive pairs, so that the lower 95% bound is above 50%. **This is deliberately asymmetric:** a small advantage does not pay for the carry machinery.
4. **ch01 and ch02 were professionally reviewed against June, in Word files nobody has opened yet.** Open them first (D10). Only the segments the review actually touched enter as human-reviewed text; the rest go through layers 1–2 like every other chapter.
5. **Apply [USER]'s rulings before any editor opens a chapter**, in a **machine-revised layer** that never overwrites the API output:
   - deterministic code rules first;
   - then a narrow AI pass (the ruled term plus the agreement it forces), as edit operations a strict code gate accepts or rejects;
   - piloted on one chapter and checked blind by [USER].
6. **Timing capture first, then freeze, then edit.**
   - Timing and baseline capture is the follow-on project's **first task (month 1)**.
   - The freeze (a git tag plus a manifest of the base) lands **before the first unit is opened**.
   - **Editing waits for exactly these two.** Every unit edited before timing exists stays untimed for good.
   - Term propagation (single-command replacement with BÍN inflections) and lemma/POS tagging come **during** editing, not before it.

## 2. What the measurements settle, and what they leave open

**Settled.** These are measured and independently verified. Definitions and corrected values are in the evidence README.

| Fact | Value |
|---|---|
| June text can be carried | 21,191 of 21,248 carriable segments convert cleanly (structural gate). 57 fall back to the September MT. 0 ISK. |
| What the carry cannot supply | 1,149 figure alts and 191 table summaries. They exist only in the September MT and are already bought. |
| June's glossary | the March 2026 export: no short-word or wrong-sense contamination (that arrived 2026-08-12, after every June buy) |
| June's wrong-sense renderings | **at least 102 segments from 3 rows**: *álagning* 66, *girðit-* 11, *útblástur* 25. Only 3 of ~392 firing rows have been sense-checked. **September has had no equivalent census.** Two of the three rows are **still approved today**. |
| Untranslated prose | June 7 (ch00 preface). September 8 (ch21 ×7, ch08 ×1); 7 of those 8 are translated in June. |
| Human edits in the repo | 137 segments, all re-attachable **by content**. Re-attaching by id would misplace text: about 2,500 table cells kept their id but changed content. |
| Production | 0 chemistry edits since 2026-08-30 and 0 MT locks, so a base change orphans nothing |
| Glossary as the cause of drift | **untested.** Drift occurs under both September arms. June's arm (the full March glossary) has never been run on the current English. Confounded by the unrecorded model version and by the re-extraction. |
| Re-buy cost (estimate) | about 1,000–2,600 ISK per chapter; about 36,000–46,000 ISK for the whole book |
| What code alone reaches | key-terms headwords, markup defects, exact swaps. Not agreement after a gender change, and not most multi-word terms. |

**Open.** These need [USER] (§8):
- the calendar;
- the scope of the verdicts, and the unruled headwords;
- reading quality (the masked test);
- the publication criterion;
- the research design (§7).

## 3. The seven options

| # | Option | Verdict | Why |
|---|---|---|---|
| 1 | Keep June | Only if the masked test shows it clearly reads better | Feasible at 0 ISK, but it needs the carry tool, a superseding decision record and mixed provenance. Its terminology advantage is not a reason (§1, point 2). |
| 2 | Keep September, fix in editing | **Keep September**, but fix terms **before** editing | Editing hours are the scarce funded resource. The editing estimate predates the alts and table summaries (+38.6% English text). Term fixing inside editing would inflate the post-editing measurement with work a pass can do. |
| 3 | Evaluate chapters | **Replace with a blind test**, terms masked, decision rule written first | The measurements already answer everything else |
| 4 | Code repair | **Yes, for what code does safely now:** key-terms headwords, markup defects, computed exact swaps | Only 263 of 933 misses contain the competing word. BÍN lacks most targets. Gender changes need agreement. The *reusable* inflection engine is the follow-on project's term-propagation work, so build it there. |
| 5 | AI judgement | **Yes, as the AI-reviewed layer**: narrow scope, hard gate, logged, checked blind | The only route that handles agreement now, and one of the paper's three conditions |
| 6 | Re-buy with the glossary | **No, not as a route for this book.** A small controlled test is recommended (D11). | Drift occurs under both September arms. June's full glossary produced its wrong-sense renderings, and today's still approves two of them. [USER]'s 2026-09-06 direction is the glossary off the wire. But "did the glossary cause the drift?" is *untested*, and a cheap test answers [USER]'s own hypothesis for the paper and for the next books. |
| 7 | Something else | **This plan:** September base, rule layer, AI layer, the human-reviewed parts of ch01–ch02 | — |

## 4. Where each text lives

CLAUDE.md § Purpose assigns this design decision to the active plan.

| Layer | What it holds | Where | Written by | Never |
|---|---|---|---|---|
| **1 Pure MT** | Málstaður output as received | `02-mt-output/` at a named commit; June vintage at `9a69414d5` | `api-translate` only | overwritten. The four September `HAND REPAIR` commits are already in place; the as-received text is in git. |
| **1s Selected MT** | a per-segment choice among API runs (June, September, or a targeted re-request); markup converted, no word changed | `02-mt-selected/` plus a per-segment manifest (run, commit, conversion rule, gate result) | the carry tool, the re-request mode | holds a word that is not API output |
| **2 Machine-revised** | layer 1/1s plus code rules plus AI edit operations | `02-mt-revised/` plus a per-change log and per-module provenance (see below) | rule script, AI runner | touches a human-reviewed segment, or survives a change to its inputs |
| **3 Human** | per **segment**: an approved edit, or an active acceptance | `segment_edits` / `segment_acceptances` → `03-faithful-translation/` plus its `-review-status.json` sidecar | editors | — |

- 🔴 **Layer 3 is per segment, and the code does not treat it that way yet.**
  - The first approved edit in a module writes the module's **whole** base text into `03-faithful-translation/` (`applyApprovedEdits`, `content: overlay ? edited : seg.is`).
  - The TM export pairs every segment of that file (`tm-export.cjs` `pairModule`, no review-status filter).
  - The corpus export flags `postEdited` by comparing against pure MT.

  So today, carried-over MT reaches the TM as "human-verified". With layer 2, every AI change would also count as a human post-edit. **Fix (4.0, before editors see layer 2):**
  - the TM and the corpus read the existing `-review-status.json` sidecar and treat only `edited`/`accepted` as human;
  - the corpus gets `selected` and `revised` tiers;
  - `postEdited` compares against the text the editor actually saw.
- **Layer-2 provenance, per module:** the input hash (layer 1/1s), the **ruling-set snapshot hash**, the prompt sha256, the model id and the harness commit. **A mismatch on any of them refuses the module.** That catches both a later `api-translate --force` and a later change of ruling.
- **Every reader of `02-mt-output` must be classified** as "sees layer 2" or "keeps reading layer 1" before layer 2 ships. There are about 30 such files. The ones that matter most are the editor's loader (`segmentParser.loadModuleForEditing`), the server's mt-preview publication map (`pipelineService` / `publicationService`, `TRACK_SOURCE_DIR`) and the status auto-advance (`segmentEditorService`). `cnxml-inject --source-dir` already reads another layer.
- **Three edit distances fall out of this:**
  - pure → revised: what the machine layer did;
  - revised → human: what the editors did;
  - pure → human: the follow-on project's promised measure.
- **Layer 2 is data, not regenerable output.** It is written by tools, never by hand, and kept with its full request/response log.

## 5. Stages

My build work can run **while [USER] answers stage 1**; only the AI run itself waits for the
closed ruling set. The critical path is [USER]'s answers, the pilot check, the timing capture and
the deploy.

**Rough effort** (estimates):
- my build: about 10–14 working sessions;
- [USER]: about 6–8 hours of decisions and checks, in short sittings.

**Target calendar.** S is the follow-on start date. Recommended: the day after the current grant's final report, so about 1 November, or about 11 November if the report needs the full 30 days. [USER] gives the exact day.

| When | [USER] | Build | Whose hours |
|---|---|---|---|
| **Before S** | D1–D4 and D10; accept the plan; **deliver the current grant's final report (it sets S)** | commit the evidence; build the stage 1 page; start 4.0 (per-segment "human"), 1.2 (scope field), 4.2 (re-attach by content) | current grant (what remains of it) |
| **S → S+2 weeks** | work through the stage 1 page (term rulings; masked test) | **tag both repositories on S**; **5.2 timing and baseline capture** (follow-on, first task); in parallel, the rule layer, the AI harness and gate, the re-request mode | timing = follow-on; rulings = follow-on terminology work; the rest is preparation: follow-on in-kind where it fits a named in-kind line, otherwise unfunded |
| **S+2 → S+4 weeks** | check the AI pilot (20, then up to 59 per category) | full AI run; 4.1 loaders; preview re-render and QC; deploy | preparation, as above |
| **≈ S+4–5 weeks (around 1 December, or mid-December)** | preview; go / no-go | **freeze** (tag + manifest) | preparation, as above |
| **From then** | editing begins as units open | term propagation and lemma/POS alongside | follow-on |

**Slip rule:** if the AI layer has not passed its check by S+4 weeks, freeze with the rule layer.
The AI layer then goes only into units nobody has opened yet, recorded in the origin column.

**The funding edge is S**, with S the day after the current grant's final report.
- **Before S,** preparation can be paid from what remains of the current grant. So front-load the build work. Where the rulings allow, run the paid steps before S, such as D11's MT buy and the AI pilot's API calls: after S, no grant pays API or other non-labour costs.
- **From S,** preparation is follow-on in-kind where it fits a named in-kind line, and otherwise unfunded. It is never follow-on paid hours.
- **Lemmatization work and the proofreading itself start after S,** at the freeze, as the follow-on application promises.
- **If the report and S cannot coincide,** no hour may be charged to both grants, and nothing the current grant pays may count as follow-on in-kind (private companion).

### Stage 0: before anything else ([USER])
- **0.1 D0, answered.** The follow-on contract is read; its wording is final. The project starts later this month. **Still to do:** give the exact start date. The current grant's terms are read too. Its fund has told [USER] that what remains of it can be used until its final report, so the recommended S is the day after that report (§1 point 0).
- **0.2 D10:** open the ch01–ch02 Word files. For each module, count the segments the tracked changes touched.

### Stage 1: close the ruling set (one review page, answers saved as you go)
- **1.1 The two conflicts with rulings in force:**
  - Lewis structure: verdict *Lewis-bygging*, ruling *Lewis-mynd*;
  - trigonal planar: verdict *þríhyrningslaga flatt*, ruling *þríhyrnt flatt*.

  `houseStyleTerms.js` is the owner until it is changed.
- **1.2 Scope.** Do the verdicts apply book-wide by default, with an exception list?
  - Confirmed on the high-volume terms: atom, product, temperature, heat, stoichiometry, tetrahedral, ionic compound, cathode, anode.
  - **Code before stage 3:** `houseStyleTerms.js` entries carry `{en, is, ruled, why}`. Chapter scope (`group`, `cell`) lives only in prose. Add a test-pinned `chapters`/`exclude` field so the AI gate can enforce it.
- **1.3 The 68 gained terms** (default: keep).
- **1.4 The 217 unruled headwords.**
  - **The ~131 with enough running text are ruled as cards**, because taught-term choice is the teacher's.
  - Only the 64 with under 3 occurrences and the 22 spelling-only pairs get a default: one word per headword, the **book-wide** majority.
- **1.5 Wrong-sense rows.**
  - Give the right word for addition, valence and emission.
  - An AI pre-screen of the other ~390 approved rows that fire flags suspects, and [USER] rules only the flagged ones.
  - The fixes go into the concept model through **a committed script that [USER] runs on prod** (this box cannot export; prod writes are [USER]'s). Never through `terminology_translations.status`.
- **1.6 The 38 pending pre-clean-break edit rows on production:** apply or drop.
- **1.7 The masked blind reading test.**
  - About 150 pairs, drawn from carried segments whose two texts differ **in words that are not a ruled term or its competitor**. Report how many differing pairs that excludes.
  - Stratified by chapter, segment type and length.
  - English is shown; versions appear in random order.
  - Answers: A better / B better / equally good / both wrong.
  - At the end: **"which do you think was September?"** If [USER] guesses well above chance, the masking failed and the result is not used.
  - The decision rule, with its threshold in words, is on the page before the first answer.
- **1.8 The publication criterion.** Proposed:
  - ruled-term consistency at least equal to the live site;
  - no reading-quality regression in 1.7;
  - the free QC checks pass;
  - [USER]'s preview has no blocking note.

**Outputs:** rulings into `houseStyleTerms.js` (code, so a deploy is needed before the editor's export sees them); concept-model fixes via the prod script; the whole ruling set committed as one dated artifact. Optional: the terminology committee reviews the ruling set before it is applied book-wide.

### Stage 2: the base (code, 0 ISK)
- **2.1 The carry tool.** Built only if the 1.7 override fires, or as the fallback for ch01–ch02.
  - Starts from the verified prototype.
  - Additions: an untranslated check, exclusion of the 78 `HAND REPAIR` keys, and table cells keyed by content.
  - Writes layer 1s and its manifest, and passes a sentinel test emitted → injected → rendered.
- **2.2 ch01–ch02.**
  - The segments the Word review touched become human text (origin `docx-review`), re-attached by content.
  - Everything else goes through layers 1–2.
  - If coverage is low, drop the exception.
- **2.3 The 8 untranslated September segments.**
  - Re-request them through the API, in a small **new** re-request mode that writes to layer 1s and never over `02-mt-output`. It must be built and tested first: CLAUDE.md warns that unknown flags are silently ignored, and `--top-up` buys only *missing* ids.
  - June's API text is the fallback for the 7 that June translated.
  - **If the 8th (an alt that only September has) comes back untranslated twice, it goes to editors as a flagged untranslated segment.** It never goes through the AI.
  - `--force --module` is not used: it would rewrite the module and revert a `HAND REPAIR`.
- **2.4 September markup defects:** 42 MT-invented `<lágvísir>`-style tags, and legacy `~x~`/`^x^` in alts and table summaries. Render-check first; if they reach readers, normalise them in the rule layer.

### Stage 3: the machine-revised layer
- **3.1 Rule operations** (deterministic code), each logged with its rule id:
  - key-terms headwords (64 to fix under September) and bold definition terms;
  - markup normalisation;
  - exact swaps, only where competitor and target share a declension class, and computed, never curated.
- **3.2 AI operations, scope v1:** the ruled term, plus the agreement it forces.
  - Suspected mistranslations are **flagged for editors, never fixed**.
  - Output is edit operations: `{segment, find, replace, category, ruling_id, reason}`.
- **3.3 The code gate, on every operation:**
  - **the English segment contains the ruling's headword, and the module is in the ruling's scope** (this stops the `group`/`cell` homograph class);
  - `find` occurs exactly once;
  - no marker, placeholder, digit or formula inside `find` or `replace`, and the marker multiset is unchanged;
  - a term operation must contain the target;
  - **an agreement operation is accepted only in a segment with an accepted term operation, within a few words of it, and only if it changes word endings or closed-class words (article, pronoun). Negations and number words are barred.**
  - a size bound per operation **and per segment**.

  Every rejection is logged.
- **3.4 Pilot** on one high-drift chapter, then a second, then the rest. [USER] checks blind, per category, from at least 3 chapters:
  - **20 first.** A category is dropped at any meaning-changing error, or at 2 or more wrong.
  - **Then up to 59 in total** for the categories that survive. A category is kept only if none of the 59 changes meaning and at most 1 is otherwise wrong (that supports an error rate below about 9%).
- **3.5 What is measured.** `measure.py` before and after is a **ruling-compliance (manipulation) check**, not quality: the pass optimises exactly what it counts, and its matcher favours citation forms over correct inflection. **Quality** is the blind check's error rate per category, plus a second, compound-tolerant matcher, plus the follow-on project's post-editing measurement.

### Stage 4: editable and checked
- **4.0 Make "human" per segment** in the TM and corpus exports (§4). Pin it with a test, before 4.1.
- **4.1 Classify every `02-mt-output` reader** (§4). Change the editor's loader, the mt-preview publication map and the auto-advance to read layer 2. Load order: human, revised, selected, pure.
- **4.2 Re-attach by content.** This replaces the id-based script.
  - Re-enter the 137 human segments; 28 need marker conversion.
  - Supersede the 151 old production rows (register §C114 ①).
- **4.3 Figures.** Check figure labels against the ruled words, as plain string matches, and send findings to the figure register.
- **4.4 Before editors open anything:**
  - the register's ③ gate list;
  - MT locks re-applied;
  - an efni deploy.
- **4.5 Re-inject and re-render the preview from the new layers.**
  - The local `content/c2-whole-book-reinject` branch was built from pure September MT. Its content is superseded; its machinery is reused.
  - QC: the free checks, a marker census and a sentinel. Then [USER]'s preview.
- **4.6 Reader publication is separate from editing.** [USER] syncs by book when the 1.8 criterion is met. When that happens, and what it counts as, is D14.

### Stage 5: timing capture, freeze, edit
- **5.1 Freeze:** a git tag plus a manifest of every layer (commits, hand repairs, ruling-set snapshot, approved-term count). It lands **before the first unit is opened** (about S+4–5 weeks), not on the start date.
- **5.2 Timing and baseline capture: the follow-on project's first task, live before any unit is opened.**
  - a server-side record of which layer's text the editor saw;
  - an origin column;
  - first-edit time and revision history (`created_at` is overwritten today);
  - **active time per segment**, so effort can be normalised per source word, with the idle threshold written into the method;
  - the editors' written consent;
  - aggregate-only reporting.
- **5.3 Editing starts.** Alongside it:
  - **term propagation**: single-command replacement across the book, BÍN inflections, BÍN credit (2026-09-06 assistant plan, U1 and U3–U8). Its term-decision writer, U4, is blocked on the §C50 panel-volume ruling, D15.
  - **lemma/POS tagging** as a batch over the logged edits.
- **5.4 Review depth for alts and table summaries.** They hold 782k and 202k English characters, 38.6% more text than the editing estimate assumed. This is D12, and it is **urgent**: the contract requires every chapter reviewed and published within the 12 months.
- **5.5 Contract obligations to build in early:**
  - every published item connected with the project states the follow-on grant, worded as the contract requires (vefur, on the first reviewed publication; reports; releases);
  - the parallel corpus and the terminology collection are released under **CC BY 4.0**. That keeps BÍN-derived inflected forms out of them: BÍN's licence is ShareAlike, so its forms stay in the editor and never enter `glossary-unified.json` or the release;
  - the project's outputs (reports, guidance) are posted on the grantee's website;
  - **the current grant's terms also require a credit** on all published material connected with its project. The site's front page already carries one. Keep it beside the follow-on's sentence. Credit both grants in the corpus and terminology releases, the methodology report, journal articles (acknowledgements) and talks, since they all build on the current grant's work.

## 6. Where AI is used, and how each use is documented

| Use | Output | Human check | Recorded |
|---|---|---|---|
| Terminology pass (layer 2) | edit operations → code gate → layer 2 | [USER]'s sequential blind sample, per category (3.4) | everything in the "every use" note below |
| Glossary sense pre-screen | flags with evidence; no text | [USER] rules every flag | same |
| Blind-test pre-judgement (optional) | a preference per pair, hidden from [USER] until they have answered | agreement with [USER] (Cohen's κ) | same |
| Writing tools and tests (Claude Code) | code | review, tests, commits | commit history |
| Planning critique (this document) | findings | adjudicated against the evidence files (§11) | this file, §11 |
| **Never** | translating (the API only), overwriting pure MT, deciding a term, publishing | | |

**Recorded for every use:**
- prompt files, versioned in the repo, with a sha256 per run;
- the runner script and its commit;
- the exact model id and the date;
- **every request and response** as committed JSONL;
- the gate log;
- token usage and cost.

**Harness:** one runner per use under `tools/ai-review/`. Transport options:
- **The Anthropic API** controls every parameter and reports usage per call.
- **Headless Claude Code** (`claude -p`) is acceptable if the same records are kept. The installed CLI has `--system-prompt-file`, `--tools`, `--json-schema`, `--model`, `--output-format json` and `--no-session-persistence`. The exact invocation is pinned in the runner, not here.

## 7. A research design question: is there a control arm?

If every unit starts from the AI-reviewed layer, the post-editing measurement describes
*post-editing of AI-reviewed MT*. Edit distance from pure MT stays computable, but "AI review
reduces post-editing time" then has nothing to compare against.

- **(a) Every unit starts from layer 2.** Simplest. The claim is limited, though the distance breakdown is still reported.
- **(b) A declared, randomised subset starts from pure MT.** This is the only design that can show an effect on *effort*. Rules:
  - draw the controls **before** anything else, excluding the pilot chapters;
  - stratify by drift tercile and chapter group (10–15 units cannot cover 21 chapters one by one);
  - report per segment, normalised per source word.

  The cost: those units need term work by hand (with the propagation tool once it exists), and their terms lag until edited.

**Lean: (b), kept small.** It is [USER]'s call, because it changes the research claim and puts
more work on some editors.

## 8. Decisions for [USER], grouped by when they are needed

**Now (they shape the stage 1 page):**

| # | Decision | Recommendation |
|---|---|---|
| D0 | The exact start date (S in §5). [USER] has said later this month | **the day after the current grant's final report**: the follow-on's work plan starts it when the current project ends. Record the date once and tell both funds. |
| D1 | September base by default; switch to the hybrid only if June wins about 6 of 10 decisive pairs in the masked test | yes |
| D2 | Verdicts apply book-wide, with an exception list carried in a machine-readable scope field | yes |
| D3 | Rule the ~131 unruled headwords that have enough text as cards; the 64 low-text and 22 spelling-only take the book-wide majority | yes |
| D4 | Lewis structure and trigonal planar: which word | [USER]'s pick (no recommendation on the words) |
| D10 | Open the ch01–ch02 Word files; only touched segments count as human | yes, before stage 2 |

**Before stages 2–4:**

| # | Decision | Recommendation |
|---|---|---|
| D5 | Selected text (API runs chosen per segment, no word changed) is its own condition in the paper | yes: "selected MT", with its manifest |
| D6 | AI pass v1: ruled terms plus forced agreement; mistranslations flagged only | yes |
| D11 | A controlled glossary test for the paper. 2 modules × {March-glossary arm, no glossary} × 2 runs, run in a scratch copy (`api-translate` has no output-dir and writes into `02-mt-output`). **Reproducing June's arm needs the March glossary *values*.** `--glossary-only` selects headwords from today's export, and `--full-glossary` sends today's 1,748 rows, so the scratch tree must point `api-translate` at the March file. **Confirm that mechanism before buying.** The follow-on project pays no API fees. So **buy it before S** to charge it to the current grant; after S it is unfunded. | yes, about 1,000–2,500 ISK; it answers option 6's hypothesis. It does not change this book's route. |
| D14 | Reader sync. Syncing the prepared MT before any reviewed chapter exists is preparation: the current grant's before S, unfunded after. Once reviewed chapters are in the synced book, publishing it is follow-on work | later, once 1.8 is met; timing follows classroom use (the 2026-09-16 decision). There is no grant date to beat. |

**Before editing:**

| # | Decision | Recommendation |
|---|---|---|
| D7 | Control arm (§7) | lean (b) |
| D8 | The only gate on editing is timing and baseline capture | yes |
| D9 | Publication criterion | as in 1.8 |
| D12 | Review depth for alts and table summaries (+38.6% English) | **urgent**: decide before editing starts. The contract requires every chapter reviewed and published within the 12 months. |
| D13 | ch01–ch02's 106 new alt and table-summary segments: who reviews them, when, under which grant | review them in the follow-on period, at the depth D12 sets, because the contract requires every chapter reviewed. They fall outside the 134 units, so they go to a follow-on in-kind line (private companion). |
| D15 | §C50: the terminology panel's issue volume (2.81 per segment), which blocks U4 | re-measure on layer 2 first; the pass should remove much of it |

## 9. What this plan cannot see

- **The terminology instrument's blind spots** (short words inside compounds, some inflections). [USER]'s blind check is the ground truth for the AI pass.
- **[USER]'s decision time is the critical path.** Every page saves as it goes, so short sittings work. The current grant's final report competes for the same weeks, just before S.
- **The terminology committee's position on the ruled terms.**
- **Off-repo inputs:** the Word files. Both grants' terms have been read.
- **Cost truth.** The ISK figures here are estimates; invoices decide.

## 10. Single next action

**[USER]:** two things, in either order:
- **The exact start date** of the follow-on project. Recommended (D0): the day after the current grant's final report.
- **The "now" decisions:** answer D1–D4 and D10, or say "accept the recommendations".

I then build the stage 1 page (the rulings plus the masked test) in one session. Stage 2–4 code can proceed alongside it.

## 11. What changed: rev. 4, rev. 3, then the critique (rev. 1 → rev. 2)

**Rev. 4 (2026-10-11): the current grant's terms, and its fund's guidance.**
- [USER] put the terms beside the other grant documents, outside the repository. They set the project's end at **30 June 2026**, the end of the 2025–2026 school year.
- [USER]: the terms' three-month window for the final report is a recommendation.
- [USER], relaying the fund: delivery within 20–30 days is acceptable, and **what remains of the grant can be used until the final report is delivered.**
- The follow-on's work plan (part of its contract) starts its 12 months when the current grant's project ends.
- **What that changed:**
  - D0: S is recommended as the day after the current grant's final report, which makes S the single funding edge (§1 point 0, §5);
  - from S, preparation is follow-on in-kind where it fits a named in-kind line, and otherwise unfunded. It is never follow-on paid hours;
  - D11 is bought before S; D13 now carries a recommendation; D14 depends on whether reviewed chapters exist;
  - 0.1, 4.6, 5.1 and §9 were updated. 5.5 credits both grants, the research outputs included. Both repositories are tagged on S.
- A verification pass (two Claude Code subagents, 2026-10-11) checked the edits against the terms and the follow-on's application, contract and work plan. Its confirmed findings are folded in: the start clause, the in-kind wording, an attribution, and a stale cross-reference in 4.6.

**Rev. 3 (2026-10-10, same day): the follow-on contract.**
- Its wording is final, and [USER] says the project starts later this month.
- It is a 12-month project. By its end, all chapters must be reviewed and published, speech synthesis done, and the resources released under CC BY 4.0. The final report is due by 1 December 2027.
- **What that changed:**
  - the freeze was separated from the start date (it now lands before the first unit is opened);
  - the target calendar and slip rule were added to §5;
  - D0 is answered;
  - D12 is urgent;
  - D11 and D14 were re-scoped to the start date;
  - the contract obligations were added in 5.5.

**Rev. 2: the blind critique.**

Two models reviewed rev. 1 blind, with identical inputs: Fable 5.1 (`claude-fable-5-1`) and Opus 5.5 (`claude-opus-5-5`), run 2026-10-10 as Claude Code subagents. Every finding
below was checked against the code or the evidence files before it was accepted.

| Finding (raised by) | Check | Change |
|---|---|---|
| Layer 3 is module-level in code: carried-over MT, and later AI text, reaches the TM and corpus as human (Opus) | read `applyApprovedEdits`, `tm-export.cjs` `pairModule` and `export-corpus` `computePostEdited`. The `-review-status.json` sidecar exists, but the TM ignores it. | §4 and step 4.0; a register item |
| Editing was gated on term propagation and tagging; U4 is blocked on §C50 (both) | the submitted schedule; the assistant plan, Q3 | §1 point 6, 5.3, D8, D15 |
| D1's terminology bullets: the 351 June "misses" are rulings made after June was bought; "125" mixed in untranslated, marker and Greek segments (both) | all 53 rulings dated 2026-09-04 → 09-27; verifier: 125 = 102 + 7 + 12 + 4 | §1 point 3 and §2 rewritten; README corrected |
| "Glossary not the cause" overstated; June's arm was never tested (both) | the defects verifier; neither vintage's sidecar has a model field | §2 row; D11 changed from "skip" to "test" |
| The blind test leaks vintage through term fingerprints, and its threshold is about 61% (both) | Re-counted on the same population (9,048 differing same-key, non-cell pairs; reproduced exactly): **951 (10.5%) carry the June *frumeind* / September *atóm* contrast**, compounds included. Opus reported 939 and described them as differing "only" in it; only 83 differ in nothing else. Either way, one term's fingerprint is visible in a tenth of the pairs. The Wilson-bound arithmetic was re-done. | 1.7 masked, with a "which was September?" check; the threshold is stated in words |
| AI gate: shape not content; no scope field; staleness ignored the ruling set; pilot underpowered (both) | `houseStyleTerms.js` entries are `{en, is, ruled, why}` only; binomial bounds | 3.3 and 3.4 rebuilt; ruling-set hash in provenance |
| `measure.py`'s before/after is a manipulation check, not quality (both) | its README: "consistency, not correctness" | 3.5 |
| The D3 default would let September's MT decide ~130 headwords (both) | the burden verifier's range | D3: cards for ~131 |
| ch01–ch02 Word files unopened (Fable); their 106 new segments have no funder (Opus) | counted: ch01 44 + ch02 62 | D10 first; D13 |
| No calendar; the follow-on grant starts at the current grant's end (Fable) | the funding facts; the current grant's contract is not found | D0, the cut-down path, §5 effort |
| More readers than the loader depend on `02-mt-output` (Fable) | `pipelineService`, `publicationService` and the auto-advance read it directly | §4 census, 4.1 |
| The untranslated alt has no route: `--top-up` buys only missing ids (Opus) | `mtRunDecision` / `topUpAction` read | 2.3 re-request mode |

**Where the critics differed, and the call:**
- **The pilot sample.** Opus asked for 59 per category, Fable for 20. **Taken:** 20, then up to 59 for the categories that survive. 59 clean is the smallest sample that supports "below 5%"; stopping early saves [USER]'s time on clearly bad categories.
- **Unruled headwords.** Opus proposed a book-wide-majority default, Fable cards. **Taken:** cards where there is enough text, the default elsewhere.

**Kept, because both critics said so:**
- pure MT is never overwritten, and layer 2 is logged data;
- no unit is opened before timing capture;
- terminology does not decide the base;
- the AI scope stays narrow.
