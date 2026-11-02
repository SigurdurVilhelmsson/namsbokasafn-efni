# Decision: the short look drops agreement, and with it every change in the ruling groups that agreement belongs to

- **Date:** 2026-11-02
- **Status:** Accepted
- **Context owners:** [USER] (ruled 2026-11-02, after the short look's verdicts were unblinded, then again after the
  drop's corrected cost was reported)
- **Supersedes:** `docs/decisions/2026-10-28-ai-term-pass-as-editor-suggestions.md`, in part: what a drop removes
  under its decision 4 ("Rule: a category is dropped at any meaning-changing error, or at 2 or more wrong"). That rule
  treats categories as separable. For agreement, a drop now also removes the term and term-sense changes in each
  (segment, ruling) group that holds an agreement change. **Still in force:** decision 4's sample, its rule for whether a
  category is dropped, "no second stage", and editors' accept and reject rates as the precision measure after release;
  decisions 1–3 and every consequence of the 10-28 record.
- **Related:**
  - `experiments/ai-review-pilot/short-look-2026-11-02/README.md` (the look's method, verdicts, result and drop set);
  - `tools/ai-review/term-pass-apply.js` (`gateWithGroups`, the apply gate's group rule);
  - `docs/decisions/2026-10-28-d12-and-editor-licence-answers.md` (the look samples by segment type);
  - `docs/decisions/2026-11-01-ai-term-pass-full-run-at-xhigh.md` and
    `docs/decisions/2026-11-01-full-run-truncation-and-unusable-answers.md` (the run whose layer 2 the look judged);
  - the active register's ⏩ RESUME block.

> **FROZEN EVIDENCE — banner-dated 2026-11-02.** This record is *evidence*, never status.
> It describes what was decided on that date and why. **If it disagrees with the active
> register in `docs/plans/`, the register wins** — this file is dated, the register is live.
> Do not sync it, do not update it, do not edit it. Supersede it instead.

## Question

The short look (the 10-28 record, decision 4) judged 20 changes per category from the full run's layer 2, blind. Two
questions followed from its result:

1. Do the verdicts stand as saved, given that in all three agreement items judged wrong the ending the change wrote
   matches [USER]'s own suggested wording?
2. If agreement is dropped, what does the drop remove? Every agreement change repairs an ending broken by a term-type
   change in the same segment, so dropping agreement alone would leave those term changes with broken endings.

At stake: whether editors are shown AI suggestions that are ungrammatical as offered, and how many sound term
suggestions are given up to prevent that.

## Decision

1. **The verdicts stand as [USER] saved them.** term 20 of 20 right, term-sense 19 of 20, agreement 17 of 20 with one
   "wrong, meaning changed". By decision 4's rule, agreement is dropped; term and term-sense pass.
2. **The drop removes every change in each (segment, ruling) group that holds an agreement change.** A group is a
   ruling's changes in one segment, over all its occurrences. That is 94 groups in 91 segments: 253 of layer 2's 3,032
   changes (105 agreement, 140 term, 8 term-sense), or 148 of its 2,927 term-type changes (5.1%). The other 2,779
   changes remain eligible as suggestions.
3. **The drop is a filter where suggestions are read.** Layer 2 (`02-mt-revised/`) and its records (`ai-review/`) are
   unchanged.

## Reasoning

### The verdicts stand

- In i19, i37 and i58, the inflection the agreement change wrote matches [USER]'s own wording (hækkað and aukið are both
  neuter; náttúrulegt fjöldahlutfall takes the neuter -t). The notes object to words the change did not choose: in i37
  and i58 the adjective hlutfallsleg-, which came from the MT and which the `abundance` ruling kept; in i19 the verb.
- The page told the judge that an agreement change is "right when it follows that change correctly, even if you would
  reject the other change". [USER] was shown all this and ruled that the verdicts stand. A verdict is not
  reinterpreted after the fact.
- Flipping i58 alone would not have changed the outcome: two "wrong, meaning kept" verdicts still drop the category.

### Agreement cannot be dropped alone

- Every agreement change records the ruling it agrees with (`rulingId`), and each of the 105 follows a term-type
  change under that ruling earlier in the same segment. None is unlinked.
- Dropping agreement alone would show editors those term changes with the endings the model itself had to fix, for
  example "% hlutfallsleg fjöldahlutfall" (a feminine adjective on a neuter noun). The point of the look is to stop
  suggestions that waste editors' time (10-28 record, "Why a short look replaces the two-stage check"). A suggestion
  that is ungrammatical as offered is that.

### The group, not one term change

- The apply gate accepts or rejects a ruling's operations in one segment, over all its occurrences, together
  (`gateWithGroups`, "all or nothing per ruling"; a ruling with a failed operation has the rest withdrawn as
  `GROUP_INCOMPLETE`). So layer 2 never holds part of a ruling's group.
- A ruling can make several term changes in one segment (`amplitude` makes three in ch06/m68729/002). Dropping one of
  them while keeping the others would put in front of editors a state the tool never produces. The before and after
  texts could be read to guess which change an ending follows, but that would be a heuristic the tool does not use.
- **Replay check** (`drop-set.mjs`): with the dropped changes removed, every kept change in the 91 affected segments
  applies in order to the segment's text under the apply tool's own rule (its `find` occurs exactly once,
  `chainChanges`).

### The cost, and a correction made before the ruling

- [USER]'s first ruling (2026-11-02) chose "drop agreement together with the term changes it follows" when the cost was
  reported as 91 term changes (3%). That count paired each agreement change with the nearest earlier term-type change,
  which in 14 segments is a change under another ruling (in ch17/m68827/004, `hverri → hverju` follows
  `afurð → myndefni`, not the electrolytic-cell change between them).
- The corrected cost at the gate's unit, 148 term-type changes (5.1%), was reported, and [USER] confirmed the choice at
  that cost (2026-11-02). The narrower counts (91 by position, 94 by one same-ruling change per group) are kept in
  `drop-set.json` for comparison.
- In the sample, 2 of the 40 term-type items fall in the drop set (i38 and i50), and both were judged right. The drop
  gives up sound suggestions; that is the price of never offering a broken ending.

### Checked against the tree, and not

- **Checked:** the counts and the replay, over every layer-2 change log on `main` at `4868c83d6` (`drop-set.mjs`,
  `drop-set.json`); the result, which `unblind.mjs` reproduces byte for byte from the committed verdicts; the gate's
  group rule, read in `tools/ai-review/term-pass-apply.js`; every agreement-bearing group lies in occurrence 0 only, so
  keying the group with or without the occurrence gives the same set.
- **Not checked:** how the suggestion view will key its filter. The 10-28 record keys a suggestion on
  module, segment id and occurrence; the drop needs the ruling id as well, which every change record carries.
- **Claude's calls, not [USER]'s:** the four verdict definitions on the page ("right", "wrong, meaning kept", "wrong,
  meaning changed", "can't judge"), because the 10-28 record defines neither "wrong" nor "meaning-changing". [USER]
  judged under them.

## Consequences

- **The full run's eligible suggestions are 2,779 term and term-sense changes** (ch10 is not in the run). No agreement
  change is offered.
- **Where a term change needed an ending fix, the editor meets that MT text with no suggestion** under that ruling.
  The model's ending fixes and 148 term-type changes are given up, including some the sample judged right.
- **The suggestion view filters by (module, segment id, ruling id) group.** `drop-set.json` is the list its filter
  must reproduce over the full run's layer 2.
- **After release, the precision measure covers term and term-sense only.** Agreement has no uptake measure; this look
  is its only measurement.
- **Layer 2 stays whole as the research layer** (CLAUDE.md § Purpose). A report can compare it with and without the
  drop, since every dropped change is still in its change log.
- **Reversal is cheap and needs a new record.** The filter is applied when suggestions are read, so restoring agreement
  (or narrowing the drop) means changing the filter; nothing has to be regenerated.
- **[USER]'s term notes are candidates, not rulings:** "transition metal" → hliðarmálmur (i12); "natural abundance" →
  náttúrulegt fjöldahlutfall, since the `abundance` ruling keeps the adjective (i37, i58); a frumeind the pass missed
  where `atom → atóm` is ruled (i29, a recall miss the look does not measure). They are tracked in the register.
- **Follow-up is tracked in the active register,** not here.

## Alternatives considered

1. **Re-judge i19, i37 and i58 against the page's agreement definition.** Agreement would have passed only if i58 and
   at least one of the other two flipped. Declined by [USER]: the verdicts stand.
2. **Drop agreement alone.** Leaves 91 segments with term changes whose endings the model knew to be broken. Rejected
   in the first ruling.
3. **Drop agreement with the nearest earlier term-type change (91, 3%).** The first report's count. It attaches 14
   segments' agreement to a change under another ruling, so it would drop sound changes and keep broken ones.
4. **Drop agreement with one same-ruling term change per group (94, 3.2%).** Leaves parts of ruling groups, a state the
   apply gate never produces, and has to guess which change an ending follows.
5. **Drop every change in a segment that holds an agreement change (196 term-type changes, 6.7%).** Wider than needed:
   the other rulings' changes in those segments are independent of the agreement changes, and the replay shows they
   still apply.
