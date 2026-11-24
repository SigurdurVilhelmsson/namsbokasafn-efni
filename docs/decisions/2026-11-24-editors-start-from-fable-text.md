# Decision: chemistry editors start from Fable's text; pure MT stays frozen underneath, and the term pass is no longer shown

- **Date:** 2026-11-24
- **Status:** Accepted
- **Context owners:** [USER] (ruled 2026-11-24, accepting Claude's recommendation as written: "Go with your
  recommendations")
- **Supersedes:** `docs/decisions/2026-10-28-ai-term-pass-as-editor-suggestions.md`, in part.
  - **Superseded:** that every unit starts from pure MT, and that the AI layer reaches editors only as accept/reject
    term suggestions.
  - **Not superseded:** no control arm and no pre-registration; the AI layer kept as its own layer with its prompts,
    model, inputs, outputs and a per-change log; no editor's text, edits or name sent to the AI provider.
- **Related:**
  - `experiments/fable-editor-trial/` and its plan `docs/plans/2026-11-14-fable-editor-trial-plan.md` (the trial
    this rests on, and the guard rail this lifts);
  - `docs/superpowers/specs/2026-11-19-g17-freeze-and-mt-lock-design.md` §6.6 (the re-cut);
  - `docs/superpowers/specs/2026-11-03-served-version-and-event-log-design.md` §6, item 22 (the consent text's
    "must not say");
  - `docs/superpowers/specs/2026-11-02-suggestion-view-design.md` (G1.23, which becomes the fallback route);
  - `docs/plans/2026-10-23-skerfur-development-plan.md`, G1.4;
  - the active register's 2026-11-24 Fable entry.

> **FROZEN EVIDENCE — banner-dated 2026-11-24.** This record is *evidence*, never status.
> It describes what was decided on that date and why. **If it disagrees with the active
> register in `docs/plans/`, the register wins** — this file is dated, the register is live.
> Do not sync it, do not update it, do not edit it. Supersede it instead.

## Question

How does Claude Fable 5.2's edit of the machine translation reach chemistry's editors: as their starting text, as
accept/reject suggestions, or not at all?

At stake: what each unit starts from is the baseline the study freeze (G1.7) locks, the consent text describes and
the editors' working time is measured against. On 2026-11-24 production showed no study unit opened, no assignment
and no consent recorded, so the choice was still at the start line.

## Decision

1. **Editors start from Fable's text.** Each chemistry unit's starting text is Fable's edit of the frozen MT, held
   as its own tool-written layer with its prompt, model, run id, inputs and per-segment record. Where Fable left a
   segment unchanged, the starting text is the MT.
2. **Pure MT stays frozen and is never overwritten.** The study's change count from pure MT to the approved final
   text is still computed. The editors' own share, from Fable's text to the final text, is reported beside it.
3. **The term pass (layer 2) is no longer shown to editors.** It stays committed as research data. The suggestion
   view (G1.23) stays built, as the fallback route if this decision is reversed.
4. **Fable's own tags are shown as highlights, not suggestions.** At least every segment Fable tagged as a change of
   meaning is marked in the editor, so editors check it against the English. Which other tags are shown is a design
   choice.
5. **No comparison units start from pure MT.** The 2026-10-28 ruling of no control arm stands.

## Reasoning

### The trial's result, at its real size

The ch10 trial (run `20261123T215036Z-63b1603d`; report and blind results under
`experiments/fable-editor-trial/results/20261123T215036Z-63b1603d/`) ranked three versions of 60 segments, shown in
random order without labels:

| | Mean rank | Ranked first | Would accept as is |
|---|---|---|---|
| MT | 2.18 | 6 of 60 | 22% |
| term pass | 1.65 | 21 of 60 | 47% |
| Fable | 1.13 | 52 of 60 | 92% |

That is one chapter, one rater ([USER], not an editor) and a preference and acceptability measure, not working time.
About 1 item in 12 was not acceptable as is. So the saving in editors' hours is a hypothesis, and the editors'
working time on Fable's text is what tests it.

### Why starting text and not suggestions

- **The shape of the output.** Fable returns one finished text per segment, with tags (`segments.jsonl` in the
  results). In ch10 it changed 578 of 1,054 segments (54.8%), about 38 character edits each. G1.23 serves
  find/replace operations, each chained by sha256 (its §8 contract). Serving Fable through it needs new code either
  way: operations derived by diffing against MT, or a whole-segment suggestion.
- **Little gain from the clicking.** At the acceptance the trial measured, most suggestions would be accepted, so
  the accept/reject step costs clicks and buys little. Editors see Fable's text either way, so suggestions would not
  remove its influence on them.
- **Fable already contains the term pass.** Of the 412 words the term pass put in that MT lacked, Fable has 373
  (90.5%, the report's rough measure). Showing both would put two AI layers in front of an editor for one segment.

### Why not "not at all"

It discards the clearest result the project's AI work has produced, and leaves the editors with more work than the
evidence says they need.

### What the research keeps

Pure MT, the term pass and Fable's text are three preserved layers, and the editors' text is the fourth. Every step
from MT onward stays reconstructable, as CLAUDE.md § Purpose requires. What changes is that editors' working time
measures post-editing of AI-edited MT, not of pure MT. The method write-up must say so.

## Consequences

- **A re-cut of the study freeze (G1.7 §6.6).** Editors' served text changes after the 2026-11-22 cut, so a new
  manifest that supersedes the earlier one lands together with the change. The manifest guard fails without it.
- **Code:** the editor's loader serves the Fable layer for chemistry's study units, and the served-version records
  (G1.1) follow from it. Fable's tags become highlights. It needs a design spec first (brainstorm → spec → plan), and
  no code before [USER] approves the spec.
- **The layer's data:** each chapter's Fable output is promoted from the trial's records into a tool-written layer
  under `books/`, with provenance. That lifts the trial plan's guard rail that nothing is written under `books/` and
  editors never see Fable's text. Where the layer lives is a design choice, recorded in the spec.
- **The 8 segments whose corrected re-translation sits only in `02-mt-selected/`:** Fable read that corrected
  Icelandic, so editors would now see Icelandic there instead of the layer-1 English. The layer's provenance must
  name those segments. The 5 term-pass chains withheld on them no longer reach anyone.
- **The consent text:** the G1.4 draft's item 2, and item 22 of the served-version design's §6 list, say every unit
  starts from pure MT. Both are revised before the data protection officer's review.
- **G1.13's assign gate waits on the wrong thing.** Ruling R6 of
  `docs/decisions/2026-11-03-research-capture-consent-and-retention-rulings.md` assigns chapters only after G1.23 is
  switched on in production. With the term pass no longer shown, that condition no longer protects anything. What
  the gate waits on instead (most likely the Fable layer being served) is for the design spec to propose and for
  [USER] to rule. Until then R6 stands as written.
- **The follow-on grant's funder is notified** before the first unit opens. The letter is drafted privately in the
  git-excluded `docs/grants/`.
- **Reversing it** before the first unit opens costs the design work only. After units open, a reversal would mix
  two baselines in one study.
- **Status, order and owners of this work:** the active register, never this file.

## Alternatives considered

1. **Fable as accept/reject suggestions through G1.23.** Rejected: it needs new code to fit Fable's whole-segment
   output to a per-operation contract, and at the acceptance measured it mostly adds clicks.
2. **Not shown to editors at all** (Fable remains a side trial). Rejected: it discards the trial's result.
3. **A Fable start with a few comparison units starting from pure MT,** to compare editors' time directly. Not
   chosen: it reopens the 2026-10-28 ruling of no control arm, and those units' editors do more work. [USER] left it
   out.
