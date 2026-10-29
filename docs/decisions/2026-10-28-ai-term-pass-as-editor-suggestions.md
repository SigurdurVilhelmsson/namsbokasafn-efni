# Decision: the AI term pass reaches editors only as accept/reject suggestions, with no control arm and no pre-registration

- **Date:** 2026-10-28
- **Status:** Accepted
- **Context owners:** [USER] (ruled 2026-10-28, walking through the proposals of a read-only review of the plans, the
  AI pass and both grants)
- **Supersedes:**
  - `docs/decisions/2026-10-27-ai-layer-pilot-before-s-full-run-after-prereg.md`, in part.
    - **Superseded:** its decision 2's first condition ("the D7 pre-registration is committed") and the consequences
      that follow from it. Those are the pre-registration's contents (frame, n, stratifier, control condition, beacon
      seed, estimand, the frozen blind-check procedure with a second rater, the value-and-kill rule) and "3.4's strict
      order is available again".
    - **Relaxed:** its decision 2's third condition ("the run lands before the first unit is opened") becomes
      eligibility per unit. A unit gets suggestions only if the run and the suggestion view both existed before it was
      opened; earlier units open on pure MT without suggestions.
    - **Still in force:** the pilot before S, the full run after S paid privately, the prompt freeze before the full
      run (its second condition), and the B3 fence.
  - `docs/decisions/2026-10-26-pre-s-week-ai-layer-answers.md`, in part. Superseded: its premise that layer 2 is the
    editors' starting text (the reason given for alternative 5). **Still in force:** its decision to commit the logs, now
    for the reason in CLAUDE.md § Purpose, which keeps the AI layer with its prompts, model, inputs, outputs and change
    log.
- **Related:**
  - `docs/plans/2026-10-10-chemistry-finish-preparation-plan.md` (3.4, 4.1, §7, §8 D7);
  - `docs/plans/2026-10-23-skerfur-development-plan.md` (§3.1 G1.4, G1.8, G1.9 and a new gate item; §7 Month 1);
  - `docs/plans/2026-10-26-pre-s-week-plan.md` (§4, §5 A1);
  - `docs/decisions/2026-10-28-d12-and-editor-licence-answers.md` (the short look samples by segment type);
  - the active register's ⏩ RESUME block;
  - the private review of 2026-10-27 in the git-excluded `docs/grants/`.

> **FROZEN EVIDENCE — banner-dated 2026-10-28.** This record is *evidence*, never status.
> It describes what was decided on that date and why. **If it disagrees with the active
> register in `docs/plans/`, the register wins** — this file is dated, the register is live.
> Do not sync it, do not update it, do not edit it. Supersede it instead.

## Question

After option B (2026-10-27), the plans still held four things:
- layer 2 as the starting text for most units;
- a randomised control arm of pure-MT units (10-10 §7, D7 lean (b));
- a pre-registration before the full run;
- a two-stage blind check with a second rater.

[USER] questioned whether that machinery was worth its cost. Editors edit the complete text anyway, so resources might be
better spent on the editorial system: help with terminology consistency, and suggestions on grammar and style.

So: should the built terminology pass rewrite the editors' starting text inside a controlled experiment, or reach them
some other way, and what does that do to D7, the blind check and the pre-registration?

At stake:
- the research claim the reports can make;
- the editors' workload and what they start from;
- the load of the first month after S;
- what the privately paid full run is for.

## Decision

1. **The terminology pass is kept, but its gate-accepted edits reach editors only as suggestions.** They appear in the
   segment view, labelled as AI, and the editor accepts or rejects each one. Every unit starts from pure MT (the selected
   layer). An accepted suggestion is logged as an assist of its own type.
2. **D7 is closed without a control arm.** There is no randomised pure-MT subset, no withholding, no pre-registration
   and no D7 apply filter.
3. **The suggestion view is the only delivery route.** Neither the editor's loader nor the publication maps switch to
   layer 2. The Skerfur plan's G1.8 is shelved, and its sizing note is kept on file. Units opened before the view ships
   start on pure MT without suggestions.
4. **A short blind look comes before suggestions go live.**
   - Sample: 20 per category, drawn across segment types, from the full run's output after the prompt freeze, never from
     the pilot chapter.
   - Rule: a category is dropped at any meaning-changing error, or at 2 or more wrong (10-10 3.4's first stage). There is
     no second stage.
   - After release, editors' accept and reject rates per category are the precision measure.
5. **The full run uses `claude-opus-5-5` at high effort.** The pilot's medium arm is a fallback, used only if high
   truncates responses or the projected run would cross the harness's per-ledger cap (→ see `tools/ai-review/config.js`).

## Reasoning

### Editors review every segment anyway
- The contract requires every chapter reviewed and published, so the AI layer cannot remove a review pass. Its value is
  in making that pass faster and more consistent.
- Suggestions deliver that value without changing what editors start from.
- Grammar and style suggestions are not in the follow-on application or the contract. They stay deferred to "if editors
  ask", and would arrive through the same view (Skerfur plan, SD9 notes).

### What the control arm would have cost, and what it could show
- **Too small to detect an effect.** The private review found that a 10–15-unit arm cannot detect the effect a
  terminology pass plausibly has (findings E3, G3).
- **Randomising inside units cost too much.** It needed:
  - an apply filter by unit, ruling and category, which did not exist (finding A2);
  - hand term fixes in withheld segments;
  - a design editors would meet partway through a unit.
- **Suggestions build the comparison in, per segment.** Each suggestion is accepted or rejected, edit distance from pure
  MT stays computable, and accepted suggestions are labelled assists under the B1 protocol.
- **The claim narrows, and [USER] accepted the narrowing.** The reports can say how often editors accepted AI term
  suggestions, by category, with distance and time reported with assists labelled. They cannot say that AI review
  reduces post-editing time.

### Why a short look replaces the two-stage check
- Editors judge every suggestion, so a wrong one is caught where it is used.
- The pre-release look only has to stop a bad category from wasting editors' time.
- Uptake measures precision on the whole population of shown suggestions, in real use, rather than on a sample of 59.
- The look samples across segment types (`docs/decisions/2026-10-28-d12-and-editor-licence-answers.md`).
- It excludes the pilot chapter, because that chapter's output was read unblinded and drove prompt revision.

### Model and effort
The evidence is Miðeind's Icelandic LLM leaderboard (CC BY 4.0, generated 2026-10-27T11:01:37Z), from a snapshot
archived with the private review's evidence and identified by its sha256.

| Model (thinking) | Rank | Case Government | Icelandic GEC | Terminology family |
|---|---|---|---|---|
| Opus 5.5 (high) | 1 | 97.5 | 80.7 | 65.4 |
| Opus 5 (high) | 6 | 99.1 | 83.0 | 58.7 |
| Opus 5 (off) | 25 | 64.4 | 75.7 | 50.8 |
| Sonnet 5.5 (high) | 21 | 95.3 | 67.4 | 50.8 |

- **Thinking moves case government most.** Case government is what a term substitution that forces agreement needs.
- **The board tests Opus 5.5 at high only.** So the pilot's medium arm is the only evidence on medium.
- **The top two models are close on these skills.** Their 1–2-point differences are within likely noise. The pass
  supplies its target terms, so terminology recall matters less than agreement.
- **The deciding cost is editor time.** Weaker suggestions cost editors time, which is scarcer than the modelled
  difference in spend.

### Checked against the tree, and not
**Checked:**
- the runner (`tools/ai-review/`) reads only `02-for-mt`, `02-structure` and the MT layers through
  `tools/lib/mt-layers.js`. It reads no editor data: no database, no faithful or localized files;
- `tools/ai-review/lexicon.js` carries no BÍN-derived data, as its header says;
- the leaderboard figures, from the archived snapshot.

**Not checked:** how much time suggestions save. That is B1's measurement, from real editing.

## Consequences

- **Every unit starts from pure MT** (the selected layer).
- **Layer 2 is not published to readers either.** The MT-preview track keeps the selected pure MT, because G1.8
  covered both track maps. Publishing layer 2 would be a separate decision, under the demonstrated-improvement rule of
  `docs/decisions/2026-09-16-chapters-prepared-sync-timed-by-classroom-use.md`.
- **Layer 2 stays the research layer** (CLAUDE.md § Purpose) and is the source of the suggestions. Nothing here deletes
  it.
- **A new editing-gate item: AI terminology suggestions in the segment view.**
  - Accept or reject inline, with one pending edit per segment.
  - Keyed on module, segment id and occurrence.
  - Hidden if the segment's text has changed since the run.
  - Labelled as AI.
  - An accepted suggestion is an assist of its own type in G1.2's event log.
- **A unit gets suggestions only if the run and the view both existed before it was opened.** This keeps a unit's
  conditions uniform for B1.
- **Consent (G1.4).**
  - The consent text says some segments carry AI terminology suggestions, labelled as such.
  - Each accept or reject is logged and reported only in aggregate, in cells of at least two editors (SD6).
  - No editor's text, edits or name goes to the AI provider.
  - Every editor sees suggestions; only consenting editors' decisions are captured for research.
  - The sentence "some units start from AI-revised text" no longer applies.
- **Package A's re-sizing in the first month counts no AI saving.** Any saving B1 measures by month 3 reduces the gap
  then. The figures are in the private companion.
- **The first month gets lighter.** It loses the control draw, the pre-registration, the apply filter and the loader
  switch. It gains the suggestion view and the short look.
- **The B3 fence of 2026-10-27 stands.** AI-derived forms carry the origin `ai-pass`.
- **If the view slips,** units open without suggestions. No fallback puts layer 2 in front of editors.
- **Reversibility.** A control arm could still be added later for units not yet opened, with a pre-registration written
  first. A layer-2 starting text would need G1.8, whose sizing note is on file.
- **Follow-up is tracked in the active register,** not here.

## Alternatives considered

The options put to [USER] on 2026-10-28:

1. **A: sweep as starting text.** Keep the sweep and drop the experiment. Editors start from layer 2, which needs the
   loader switch, with a short precision look and disclosure in the reports. Not chosen: editors would start from text
   they cannot tell apart from MT, and it needs G1.8's build.
2. **C: drop the sweep.** Shelve the AI layer and keep the code. Terminology help would come from B2 and B3 as funded.
   Not chosen: the sweep is built and cheap to run, and suggestions put its output where editors can judge it.
3. **D: keep D7, shrunk.** A 10–15-unit control arm with a lighter pre-registration, and the sweep as starting text for
   the rest. Rejected: the arm cannot detect a plausible effect, and it keeps most of the cost.
4. **The earlier D7 designs.** A unit arm plus withholding by segment, or by ruling. Superseded when [USER] asked for the
   comparison against the plans: both need the apply filter and hand fixes.
5. **Fallbacks if the suggestion view is late.** A loader-switch fallback, or building both. Rejected: either is a
   second build of similar size in the busiest month.
6. **The blind check.** The full two-stage 3.4 rule, the full machinery (frozen sampler, decoys, recall sample, second
   rater), or no pre-release look. Rejected: the first two cost more for a smaller measure than editors' uptake, and the
   third would let a bad category reach editors.
7. **Effort.** Choose effort from the pilot by comparing accepted suggestions, or drop the medium arm. Rejected: the
   first spends [USER]'s time to save little, and the second leaves no fallback if high truncates or nears the cap.
