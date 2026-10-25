# Chemistry: finishing the MT preparation and handing over to editing — PLAN (proposed 2026-10-10; rev. 5, 2026-10-11)

> ✏️ **PLAN. [USER] answered its "now" decisions on 2026-10-11** (D0–D4 and D10; record:
> [`docs/decisions/2026-10-11-chemistry-finish-preparation-answers.md`](../decisions/2026-10-11-chemistry-finish-preparation-answers.md)).
> The later decisions in §8 are open. This is not status: open work lives in the active register's ⏩ RESUME block.
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
> **Rev. 5 (2026-10-11, same day)** takes in [USER]'s answers: **S = 1 November 2026**, the day after the current grant's final
> report on 31 October; D1–D3 as recommended; D4 *Lewis-mynd* and *þríhyrningslaga flatt*; D10 yes. Opening the ch01–ch02 Word
> files, after [USER] had answered, corrected 0.2's premise: they carry comments, not tracked changes (§11).
> **The same day [USER] answered the follow-ups** (record: [`docs/decisions/2026-10-11-chemistry-finish-prep-follow-up-answers.md`](../decisions/2026-10-11-chemistry-finish-prep-follow-up-answers.md)): ch01–ch02 enter as machine text with their
> Word review as editor notes; D11 yes; S moves if the report slips; the contract's cost plan is read from the signed version.

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

0. **The calendar is fixed.** The follow-on project **runs 12 months from its start date S.** **S = 1 November 2026** (D0, answered 2026-10-11).
   - **By its end, every chapter must be reviewed and published,** the speech synthesis finished, and the parallel corpus and terminology collection released (the contract's project description).
   - **The final report is due by 1 December 2027.**
   - **One boundary: the current grant's final report, then S.**
     - The current grant's terms set its project's end at 30 June 2026. Its fund has told [USER] that what remains of the grant can be used until the final report is delivered, which [USER] plans for **31 October 2026**.
     - The follow-on's work plan, part of its contract, starts its 12 months when the current grant's project ends. Its application promises that lemmatization and the proofreading begin only after that. **So S is the day after that report** (D0).
     - [USER]'s dates (2026-10-11): the report on 31 October, S on 1 November.
     - **If the report slips, S moves with it, and so does §5** ([USER] 2026-10-11, follow-up record). What remains of the current grant stays in use until the report, and the follow-on's fund is told the new date.
     - **Before S, preparation can be paid from what remains of the current grant. From S, it is never follow-on paid hours:** it counts as follow-on in-kind where it fits one of the follow-on's in-kind lines, and is otherwise unfunded (private companion).
     - **Tag both repositories on S.** Both final reports cite that tag for what existed before the follow-on began.
   - **So the start date is no longer the freeze.** What matters is that the base is ready **before the first unit is opened**. On the project's own schedule (timing capture in months 1–3, editing from month 2), that is **about S+4–5 weeks: around 29 November to 6 December 2026**.
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
4. **ch01 and ch02 were professionally reviewed in Word files, with comments dated September 2025 to March 2026.** The files carry **comments, not tracked changes**, and Track Changes was off. **Measured 2026-10-11 (0.2): the reviewers started from an MT exported on 2025-01-24, which is neither the June nor the September API MT; ch02's review is comments only, and ch01 changed 26 paragraphs (11 in wording).** Only the segments the review actually touched enter as human-reviewed text (D10, answered); a comment alone is not an edit, and the rest go through layers 1–2 like every other chapter. What that leaves, and the recommendation put to [USER]: 0.2 and §8's D10 follow-up.
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

**Open.** These still need [USER]:
- the unruled headwords with enough text, ruled as cards on the stage 1 page (1.4; method decided, D3; measured 2026-10-11: 100 cards);
- reading quality (the masked test, 1.7; threshold decided, D1);
- the publication criterion (D9);
- the research design (§7, D7).

The calendar (D0) and the scope of the verdicts (D2) were answered on 2026-10-11 (§8).

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

**Target calendar.** S is the follow-on start date: **1 November 2026**, the day after the current grant's final report on 31 October (D0).

| When | [USER] | Build | Whose hours |
|---|---|---|---|
| **Before S** (to 31 October) | **deliver the current grant's final report on 31 October (it sets S)**; tell both funds the dates (D0). D1–D4, D10, its follow-up and D11 (yes) were answered on 2026-10-11 | commit the evidence; build the stage 1 page, with 0.2 (the reviewers' starting text, the comparison, the count per module) alongside; start 4.0 (per-segment "human"), 1.2 (scope field), 4.2 (re-attach by content); D11: confirm the March-glossary mechanism in a scratch copy, then buy by 31 October | current grant (what remains of it) |
| **S → S+2 weeks** | work through the stage 1 page (term rulings; masked test) | **tag both repositories on S**; **5.2 timing and baseline capture** (follow-on, first task); in parallel, the rule layer, the AI harness and gate, the re-request mode | timing = follow-on; rulings = follow-on terminology work; the rest is preparation: follow-on in-kind where it fits a named in-kind line, otherwise unfunded |
| **S+2 → S+4 weeks** | check the AI pilot (20, then up to 59 per category) | full AI run; 4.1 loaders; preview re-render and QC; deploy | preparation, as above |
| **≈ S+4–5 weeks (around 29 November to 6 December)** | preview; go / no-go | **freeze** (tag + manifest) | preparation, as above |
| **From then** | editing begins as units open | term propagation and lemma/POS alongside | follow-on |

**Slip rule:** if the AI layer has not passed its check by S+4 weeks, freeze with the rule layer.
The AI layer then goes only into units nobody has opened yet, recorded in the origin column.

**The funding edge is S**, with S the day after the current grant's final report.
- **Before S,** preparation can be paid from what remains of the current grant. So front-load the build work. Where the rulings allow, run the paid steps before S, such as D11's MT buy and the AI pilot's API calls: after S, no grant pays API or other non-labour costs. On the target calendar the stage 1 rulings close after S, so expect the AI layer's API cost to fall after S.
- **From S,** preparation is follow-on in-kind where it fits a named in-kind line, and otherwise unfunded. It is never follow-on paid hours.
- **Lemmatization work and the proofreading itself start after S,** at the freeze, as the follow-on application promises.
- **If the report and S cannot coincide,** no hour may be charged to both grants, and nothing the current grant pays may count as follow-on in-kind (private companion).

### Stage 0: before anything else ([USER]'s decisions; 0.2's measurement is build work)
- **0.1 D0, answered 2026-10-11: S = 1 November 2026,** the day after the current grant's final report on 31 October (§1 point 0). The follow-on contract and the current grant's terms are both read.
- **0.2 D10, answered yes: only the segments the review touched count as human.** The files are one level up from the repository. [USER] answered before anyone had opened them, on the premise that the review was in tracked changes.
  - **Measured 2026-10-11: they carry no revision marks of any kind** (no insertions, deletions, moves or formatting changes in all 25 files), and Track Changes is off in all of them. 17 carry 323 comments (ch01 192, ch02 131), each file by one author, dated 2025-09-25 → 2026-03-13 (parsed dates; two of ch01's stamps are in US format). The other 8 (ch01's answer key; ch02's 2.7, introduction and end matter) carry no comments, no Word editing-session ids and a 2025-01-24 metadata stamp (created = modified).
  - **A comment is not an edit.** A commented segment that was not changed still holds the pre-review machine text, and it enters layer 3 only when an editor applies or accepts the change (§4).
  - **"Touched", measured 2026-10-11** (evidence: [`experiments/mt-vintage-comparison/results/2026-10-11/`](../../experiments/mt-vintage-comparison/results/2026-10-11/README.md)):
    - (a) **the starting text** is 25 MT `.docx` files exported on 2025-01-24, in git history only (`b37ab8cc8`, `9ca3fb2ef`; deleted in `265a2496e`). The 8 files without comments are byte-identical to it. It is a third MT: only about 30% of substantive paragraphs equal the June or September text;
    - (b) **what changed:** 39 paragraphs, all in ch01. 12 are URLs Word filled in on conversion and 1 is a note to the editors; of the other 26, 15 change only case, punctuation or spacing and 11 change wording. **ch02 has no text changes.** None of the 183 corrections the comments propose is applied in the files;
    - (c) **scope:** the 8 files without comments carry no review signal at all (ch01's answer key; ch02's 2.7, introduction and end matter), and a comment says only the odd-numbered ch01 exercises were read;
    - (d) **already in the repo:** the reviewer's wording at 4 edit sites in m68664 was re-entered by hand in the editor on 2026-06-16, so it is among the 137 in-repo human segments (4.2);
    - (e) **a bridge to segment ids:** the English source `.docx` matches the starting text paragraph for paragraph, and through it 192 of the 198 changed or commented paragraphs resolve to a current segment.
  - **So the review exists mainly as suggestions, on a different MT.** A reviewed paragraph cannot simply be re-attached to its September segment as human text: most of its words are the 2025 MT, not the reviewer's. **Decided ([USER] 2026-10-11, D10 follow-up):** no segment enters as `docx-review` human text. The 26 changed paragraphs and the 323 comments go to the editors as notes on the matching September segments, through the bridge, and the editors apply them as timed layer-3 edits. The m68664 rows the [LEAD] already re-entered stay among the 137.

### Stage 1: close the ruling set (one review page, answers saved as you go)
- **1.1 The two conflicts with rulings in force: answered (D4, 2026-10-11).**
  - *Lewis structure* stays ***Lewis-mynd***. That overrides the ch07 verdict *Lewis-bygging*, which the frozen review-page export still holds, so **whatever compiles the ruling set must apply the override.**
  - *trigonal planar* becomes ***þríhyrningslaga flatt***, the official glossary's form. That reverses the 2026-09-21 ruling, so its house-style entry is removed (code; the concept model and the export change only after a deploy). Of the 44 September segments whose English says *trigonal planar*, **22 carry the adjective *þríhyrndur*** in some inflection (ch07 10, ch08 4, ch18 4, ch19 2, ch20 2) and **8 another *þríhyrnings-* compound**; a literal search for *þríhyrnt* finds 4 of the 22 (record, D4b). An exact swap is a rule-layer candidate only where 3.1's declension-class gate admits it; the other renderings need rewording (AI layer or editor). No re-buy. The frozen review-page export's card still carries `houseStyleRuling: þríhyrnt flatt`; its `targetIcelandic` is the answer.

  **Where rulings live.** `houseStyleTerms.js` holds only the rulings that differ from the stored lemma. A ruling that keeps the stored lemma has no entry, and the 2026-09-21 test pins it absent: D4b *trigonal planar* (`REVERSED_TO_STORED`) and 2026-09-21's four `ALREADY_CORRECT` words. Of the review page's 102 headwords, 3 have an entry; the rest live in the frozen `verdicts-2026-10-10.json`, with D4's overrides applied over it. Book-scoped rulings (chemistry's `atom → atóm`) live in prod's `book_term_preference`. So the ruling set that stage 1 compiles (Outputs) draws on all of them, and lists entry and no-entry rulings alike, each with its target and its competitor.
- **1.2 Scope: book-wide by default, with an exception list (D2, answered yes).**
  - Confirmed on the high-volume terms: atom, product, temperature, heat, stoichiometry, tetrahedral, ionic compound, cathode, anode.
  - **Code before stage 3:** `houseStyleTerms.js` entries carry `{en, is, ruled, why}`. Chapter scope (`group`, `cell`) lives only in prose. Add a test-pinned `chapters`/`exclude` field where every ruling has a row (the ruling-set artifact, or the code that compiles it), so a no-entry ruling can carry a scope too, and the AI gate can enforce it.
- **1.3 The 68 gained terms** (default: keep).
- **1.4 The 217 unruled headwords (D3, answered yes).**
  - **The ones with enough running text are ruled as cards**, because taught-term choice is the teacher's.
  - Only the low-text and spelling-only headwords get a default: one word per headword, the **book-wide** majority (a tie goes to the September word, D1).
  - **Measured 2026-10-11 on the stage 1 page** (`experiments/terminology-consistency/stage1_page.py`, which states its bucketing rules): 217 and 64 reproduce exactly. **"22 spelling-only" did not:** it was an agent's count with no script. The written rule (case, hyphens, spaces, markup or a trailing definite article only) gives **16**; an edit-distance rule was rejected because it also swept in real word choices. Assigned in order, each headword to one bucket: 2 already ruled in another chapter (D2), 16 spelling-only, 63 low-text (*periodic law* is both and went to spelling-only first, so 64 − 1), 36 gained (moved to 1.3, default keep), **100 cards**. The "~131" above was 217 − 64 − 22 before the gained ones were separated.
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
- **2.1 The carry tool.** Built only if the 1.7 override fires.
  - Starts from the verified prototype.
  - Additions: an untranslated check, exclusion of the 78 `HAND REPAIR` keys, and table cells keyed by content.
  - Writes layer 1s and its manifest, and passes a sentinel test emitted → injected → rendered.
- **2.2 ch01–ch02.**
  - **Decided (D10 follow-up, [USER] 2026-10-11):** ch01–ch02 go through layers 1–2 like every other chapter. The review's 26 changed paragraphs and 323 comments are attached to the matching September segments as editor notes, through the English bridge, and nothing enters layer 3 until an editor applies or accepts it.
  - The m68664 rows the [LEAD] already re-entered from the review stay among the 137 in-repo human segments (4.2), entered once, never twice.
  - **How the notes reach the editors** is a small design step: the editor's `segment_discussions` hangs on an edit row (`segment_edit_id`), not on a segment, so a segment-level note needs a schema change or another surface. The bridge is the English source `.docx` (192 of 198 paragraphs map). Built before ch01–ch02 are opened for editing.
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
- **3.5 What is measured.** `measure.py` before and after is a **ruling-compliance (manipulation) check**, not quality: the pass optimises exactly what it counts, and its matcher favours citation forms over correct inflection. Its `load_rulings` reads only `HOUSE_STYLE_TERMS`, so it cannot see a no-entry ruling (D4b among them); the compliance check must read the compiled ruling-set artifact. **Quality** is the blind check's error rate per category, plus a second, compound-tolerant matcher, plus the follow-on project's post-editing measurement.

### Stage 4: editable and checked
- **4.0 Make "human" per segment** in the TM and corpus exports (§4). Pin it with a test, before 4.1.
- **4.1 Classify every `02-mt-output` reader** (§4). Change the editor's loader, the mt-preview publication map and the auto-advance to read layer 2. Load order: human, revised, selected, pure.
- **4.2 Re-attach by content.** This replaces the id-based script.
  - Re-enter the 137 human segments, minus any already entered under 2.2; 28 need marker conversion.
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

**Now (they shape the stage 1 page). Answered by [USER] on 2026-10-11** ([record](../decisions/2026-10-11-chemistry-finish-preparation-answers.md)):

| # | Decision | Recommendation |
|---|---|---|
| D0 | The exact start date (S in §5) | **Answered: S = 1 November 2026**, the day after the final report on 31 October. The follow-on's work plan starts it when the current project ends. Record the date once and tell both funds. **Slip case answered:** S moves with the report (§1 point 0). |
| D1 | September base by default; switch to the hybrid only if June wins about 6 of 10 decisive pairs in the masked test | **answered yes** |
| D2 | Verdicts apply book-wide, with an exception list carried in a machine-readable scope field | **answered yes** |
| D3 | Rule the ~131 unruled headwords that have enough text as cards; the 64 low-text and 22 spelling-only take the book-wide majority | **answered yes** (measured counts: 100 cards, 63 low-text, 16 spelling-only; see 1.4) |
| D4 | Lewis structure and trigonal planar: which word | **Answered:** *Lewis-mynd*; *þríhyrningslaga flatt*, which reverses 2026-09-21 (1.1) |
| D10 | Open the ch01–ch02 Word files; only touched segments count as human | **answered yes** (before the files were opened). The files hold comments, not tracked changes, so 0.2 establishes "touched" first, and two questions follow (below) |

**Before stages 2–4:**

| # | Decision | Recommendation |
|---|---|---|
| D10 follow-up | The review is 323 comments plus 26 changed ch01 paragraphs, on a 2025-01-24 MT that is neither base (0.2). Does any of it enter as human text, and who applies the comments, under which line? | **Answered ([USER] 2026-10-11): no.** No segment enters as `docx-review` human text. The changed paragraphs and the comments become editor notes on the matching September segments (2.2), and the editors apply them as timed layer-3 edits. Who reviews ch01–ch02, under which line, stays D13. |
| D5 | Selected text (API runs chosen per segment, no word changed) is its own condition in the paper | yes: "selected MT", with its manifest |
| D6 | AI pass v1: ruled terms plus forced agreement; mistranslations flagged only | yes |
| D11 | A controlled glossary test for the paper. 2 modules × {March-glossary arm, no glossary} × 2 runs, run in a scratch copy (`api-translate` has no output-dir and writes into `02-mt-output`). **Reproducing June's arm needs the March glossary *values*.** `--glossary-only` selects headwords from today's export, and `--full-glossary` sends today's 1,748 rows, so the scratch tree must point `api-translate` at the March file. **Confirm that mechanism before buying.** The follow-on project pays no API fees. So **buy it before S** to charge it to the current grant; after S it is unfunded. | **Answered yes ([USER] 2026-10-11).** About 1,000–2,500 ISK; it answers option 6's hypothesis and does not change this book's route. Mechanism check first, then the buy, before S. ✏️ *2026-10-25: arms decided: June's wire (primary), today's wire (pre-registered secondary) and no glossary, 2 runs each, up to ISK 5,000 ([record](../decisions/2026-10-25-d11-three-arms-junes-wire-primary.md)).* |
| D14 | Reader sync. Syncing the prepared MT before any reviewed chapter exists is preparation: the current grant's before S, unfunded after. Once reviewed chapters are in the synced book, publishing it is follow-on work | later, once 1.8 is met; timing follows classroom use (the 2026-09-16 decision). There is no grant date to beat. |

**Before editing:**

| # | Decision | Recommendation |
|---|---|---|
| D7 | Control arm (§7) | lean (b) |
| D8 | The only gate on editing is timing and baseline capture | yes |
| D9 | Publication criterion | as in 1.8 |
| D12 | Review depth for alts and table summaries (+38.6% English) | **urgent**: decide before editing starts. The contract requires every chapter reviewed and published within the 12 months. |
| D13 | ch01–ch02's review remainder: the 106 new alt and table-summary segments, every other ch01–ch02 segment that 0.2 does not establish as human, the 8 Word files with no review activity, and applying the comments. Who reviews it, when, under which grant | **0.2 has counted it: under the D10 follow-up's recommendation, that is all of ch01–ch02**, with the comments as notes. The contract requires every chapter reviewed. The 134 units exclude ch01–ch02 as already reviewed, so this has no editing hours yet. Funding options are in the private companion; [USER] decides. |
| D15 | §C50: the terminology panel's issue volume (2.81 per segment), which blocks U4 | re-measure on layer 2 first; the pass should remove much of it |

## 9. What this plan cannot see

- **The terminology instrument's blind spots** (short words inside compounds, some inflections). [USER]'s blind check is the ground truth for the AI pass.
- **[USER]'s decision time is the critical path.** Every page saves as it goes, so short sittings work. The current grant's final report competes for the same weeks, just before S.
- **The terminology committee's position on the ruled terms.**
- **Off-repo inputs:** the Word files (one level up; comments, no tracked changes). Both grants' terms have been read.
- **Cost truth.** The ISK figures here are estimates; invoices decide.

## 10. Next action

The active register's ⏩ RESUME block owns it. This plan carries no open-work status; [USER]'s decisions are in the linked record.

## 11. What changed: rev. 5, rev. 4, rev. 3, then the critique (rev. 1 → rev. 2)

**Rev. 5, amended 2026-10-11 (later):** 1.4's counts replaced by the stage 1 page's measured ones (100 cards; 16 spelling-only, not 22; 63 + 1 low-text); the old figures had no script behind the 22.

**Rev. 5 (2026-10-11): [USER]'s answers.** Record: [`docs/decisions/2026-10-11-chemistry-finish-preparation-answers.md`](../decisions/2026-10-11-chemistry-finish-preparation-answers.md).
- D0: S = 1 November 2026, with the current grant's final report on 31 October. §1 point 0, §5 and 0.1 now carry the dates. The freeze falls around 29 November to 6 December.
- D1–D3: as recommended.
- D4: *Lewis-mynd*, overriding the review-page verdict, and *þríhyrningslaga flatt*, reversing the 2026-09-21 ruling (its house-style entry is removed). Production was checked read-only first: the official row is the only other candidate, so no tie arises.
- D10: yes, answered before the files were opened. **Opening them falsified 0.2's premise:** they carry comments, not tracked changes, so 0.2 now establishes "touched" before 2.2 uses it, and §8 gains a D10 follow-up for [USER]. §1 point 4's "reviewed against June" became a hypothesis, because the comments are dated 2025-09-25 → 2026-03-13. 2.1's "fallback for ch01–ch02" rested on that premise and was removed. 2.2 no longer drops the exception on low coverage; D13 now covers the whole ch01–ch02 remainder and is open until 0.2 has counted.
- §10 now points at the register, which owns what comes next.
- **An adversarial review checked rev. 5 before it was committed** (Claude Code subagents, 2026-10-11: four lenses, each finding re-measured by a separate verifier; 27 of 33 findings confirmed). What it changed:
  - **D4b's exposure was a spelling count.** It counted *þríhyrnt* and missed the same adjective's other forms: 22 segments carry it, not 4 (1.1).
  - **"The model already produces the official form" was dropped.** In the buys that did not send the term, the adjective is the most frequent rendering. [USER]'s ground, the official glossary, carries D4b alone.
  - **The comment dates start on 2025-09-25,** not 2025-10-01: two US-format stamps had sorted first as text.
  - 1.1's "`houseStyleTerms.js` owns every ruled word" was false for no-entry rulings; 1.1, 1.2 and 3.5 now say where rulings live.
  - §2's open list, the slip rule in §1 point 0 (now a question for [USER]), and §5's "Before S" row (0.2 and D11 added).
- **0.2 was measured the same day** (a Claude Code workflow, independently re-counted, with the headline numbers reproduced by a committed census script; [`experiments/mt-vintage-comparison/results/2026-10-11/`](../../experiments/mt-vintage-comparison/results/2026-10-11/README.md)). The reviewers started from a 2025-01-24 MT that is neither base; ch02's review is comments only; ch01 changed 26 paragraphs; no comment's proposal is applied. 0.2, 2.2, §1 point 4, the D10 follow-up and D13 now carry that, with a recommendation.
- **Then [USER] answered the follow-ups, the same day** (record: [`docs/decisions/2026-10-11-chemistry-finish-prep-follow-up-answers.md`](../decisions/2026-10-11-chemistry-finish-prep-follow-up-answers.md)): no ch01–ch02 text enters as human text (the review becomes editor notes); D11 yes; S moves if the report slips; the contract's cost plan is read from the signed version, which [USER] receives after signing.

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
