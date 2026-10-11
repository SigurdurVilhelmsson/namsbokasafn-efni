# Decision: ch01–ch02 enter as machine text, with their Word review carried as editor notes; the glossary test runs before S; S moves with the final report

- **Date:** 2026-10-11
- **Status:** Accepted
- **Context owners:** [USER] (every answer), on the plan's recommendations.
- **Supersedes:** none. It answers questions that `docs/decisions/2026-10-11-chemistry-finish-preparation-answers.md` (D10) and the plan left open the same day.
- **Related:** `docs/plans/2026-10-10-chemistry-finish-preparation-plan.md` (§1 point 0, 0.2, 2.2, §8 D0, the D10 follow-up, D11, D13) · the active register `docs/plans/2026-07-21-post-item17-followup-campaign.md` (its 2026-10-11 entry) · `experiments/mt-vintage-comparison/results/2026-10-11/README.md` (the Word-review measurement) · `docs/decisions/2026-10-11-chemistry-finish-preparation-answers.md`

> **FROZEN EVIDENCE — banner-dated 2026-10-11.** This record is *evidence*, never status.
> It describes what was decided on that date and why. **If it disagrees with the active
> register in `docs/plans/`, the register wins** — this file is dated, the register is live.
> Do not sync it, do not update it, do not edit it. Supersede it instead.

## Question

Four questions were still open after [USER]'s first answers on 2026-10-11:
- **D10 follow-up.** The ch01–ch02 Word review turned out to be 323 comments plus 26 changed ch01
  paragraphs, made on a 2025-01-24 MT that is neither the June nor the September base. Does any of it
  enter the research data as human text, and how do the comments reach the text?
- **D11.** Should the controlled glossary test for the paper run? It is 2 modules × {March-glossary
  arm, no glossary} × 2 runs, in a scratch copy, and its API cost can be charged only before S.
- **The slip case.** If the current grant's final report is delivered after 31 October, does S move
  with it or stay on 1 November?
- **Q7.** When is the cost plan attached to the follow-on contract read?

At stake:
- the research data's "human" category;
- an untested claim (that the glossary caused the terminology drift) which the paper would otherwise
  leave open;
- the single funding edge;
- line-by-line timesheets, which start at S.

## Decision

[USER]'s answers, verbatim:

| # | [USER]'s answer | What it settles |
|---|---|---|
| D10 follow-up | "ch01-ch02 text: no" | **No ch01–ch02 segment enters as human text** (origin `docx-review`). The two chapters go through layers 1–2 like every other chapter. The review's 26 changed paragraphs and 323 comments reach the editors as **notes on the matching September segments**, and the editors apply them as timed layer-3 edits. |
| D11 | "Glossary test: yes" | **The controlled glossary test runs.** It runs in a scratch copy, once the mechanism that points `api-translate` at the March glossary values is confirmed, and it is bought before S. |
| Slip case | "If final report slips, the start date moves." | **S stays the day after the current grant's final report.** A later report moves S, and the plan's calendar with it. |
| Q7 | "I will get the final version of the contract after signing." | The cost plan that governs timesheets is read from the **final contract**, which [USER] receives after signing. |

## Reasoning

### D10 follow-up: the review is suggestions on a different text

Measured on 2026-10-11 (`experiments/mt-vintage-comparison/results/2026-10-11/README.md`):
- the reviewers started from a 2025-01-24 MT, and only about 30% of substantive paragraphs equal the
  June or September text;
- ch02's review is comments only, and ch01 changed 26 paragraphs (11 of them in wording);
- none of the 183 corrections the comments propose is applied in the files.

A reviewed paragraph re-attached to its September segment would therefore carry mostly 2025 machine
text under a human label, and D10 exists to prevent exactly that. Carrying the review as notes keeps
it in use. The human category then holds only what an editor writes or accepts, with its time measured.

### D11: a cheap test of the paper's open question

The plan's §2 lists "glossary as the cause of drift" as untested. June's arm, the full March glossary,
has never been run on the current English. The test costs about 1,000–2,500 ISK and does not change
this book's route. The follow-on project pays no API fees, so the test is bought before S.

### The slip case: one edge, not two

The follow-on's work plan starts when the current grant's project ends. The current grant's fund has
told [USER] that what remains of the grant can be used until the final report is delivered. Moving S
with the report keeps a single funding edge, with neither an unfunded gap nor a double-charged
overlap.

### Q7: the governing version is the signed one

The plan suggested reading the attached cost plan before signing. [USER] receives the final version
only after signing, so it is read then. If the attached plan turns out to differ from the contract,
that is handled under the contract's own terms.

## Consequences

- **Research data.** ch01–ch02 contribute no `docx-review` segments. Their human text comes only from
  the editors and is measured like every other chapter's. The four §1.1 edit sites the [LEAD]
  re-entered in the editor in June 2026 stay among the 137 in-repo human segments.
- **Build.** The editors need to see the review on the matching segments. The editor's existing
  `segment_discussions` table hangs on an edit row (`segment_edit_id`), not on a segment, so this
  needs a small design step. The bridge from Word paragraph to segment is the English source `.docx`:
  192 of 198 changed or commented paragraphs map.
- **Funding.** ch01–ch02 still need review in the follow-on period. Who does it, and under which line,
  is D13, which stays [USER]'s (private companion).
- **Calendar.** S = 1 November 2026 if the report is delivered on 31 October. Otherwise S is the day
  after the report, and the freeze and the plan's §5 move with it. Both funds are told the date in
  writing.
- **Spend.** D11's API cost, about 1,000–2,500 ISK, before S.
- **Forecloses:**
  - counting the Word review as human-reviewed text. Reversing that needs a new record, and the
    2025-01-24 MT would then have to be recorded as those segments' baseline;
  - a fixed S that is independent of the report.
- **Follow-up work** (the D11 mechanism check and buy, the editor-notes import, D13) is tracked in the
  active register, not here.

## Alternatives considered

1. **Re-attach the 26 changed paragraphs as `docx-review` human text**, with the 2025-01-24 MT as their
   baseline. Not chosen: most of the text is a different MT, and a human label on it would misstate
   the data.
2. **Count all of ch01–ch02 as reviewed.** Already rejected on 2026-10-11 (D10).
3. **Skip D11.** Not chosen: the question would stay untested, and no grant can pay for the test after S.
4. **Fix S on 1 November whatever the report date.** Not chosen: two edges risk an unfunded gap or
   double charging.
