# Decision: [USER]'s answers on review depth for alt texts and table summaries (D12), and on the editors' licence for their own edits

- **Date:** 2026-10-28
- **Status:** Accepted
- **Context owners:** [USER] (answers given in chat on 2026-10-28, choosing among options a session put, during a
  walkthrough of a read-only review's proposals)
- **Supersedes:** none
- **Related:**
  - `docs/plans/2026-10-10-chemistry-finish-preparation-plan.md` (5.4, §8 D12);
  - `docs/plans/2026-10-23-skerfur-development-plan.md` (§3.1 G1.4; G2.2; G3.1, G3.2; SD6; §9 risk 1);
  - `docs/decisions/2026-10-28-ai-term-pass-as-editor-suggestions.md` (its short look samples by segment type);
  - `tools/cnxml-render.js` (the table branch's `data-summary` comment);
  - the active register's ⏩ RESUME block;
  - the private review of 2026-10-27 in the git-excluded `docs/grants/` (findings G6, E11).

> **FROZEN EVIDENCE — banner-dated 2026-10-28.** This record is *evidence*, never status.
> It describes what was decided on that date and why. **If it disagrees with the active
> register in `docs/plans/`, the register wins** — this file is dated, the register is live.
> Do not sync it, do not update it, do not edit it. Supersede it instead.

## Question

Two questions that several plans cite and none owns.

1. **D12: how deeply do editors review alt texts and table summaries?**
   - They hold 782k and 202k English characters, 38.6% more text than the editing estimate assumed (10-10 plan 5.4).
   - The contract requires every chapter reviewed and published within its 12 months.
2. **On what terms may the editors' own edits and term decisions be released?**
   - The follow-on contract commits the project to releasing the parallel corpus and the term collection under CC BY 4.0.
   - The chemistry book's licence is in `books/efnafraedi-2e/book-config.json`.
   - No plan and no private grant file held a licence from the editors (the review's finding E11, confirmed by its
     verifier).

## Decision

[USER]'s answers, verbatim (the option each chose):

| # | [USER]'s answer | What it settles |
|---|---|---|
| D12 | "Summaries flag-only, alts full" | **Table summaries get flag-only review:** terms, numbers and flags. They sit in their own tier in the TMX and the corpus and are never marked human-verified. **Alt texts get full review,** timed like prose under B1. The AI short look samples by segment type. |
| Licence | "Separate licence clause" | **Each editor's editing agreement carries a clause, signed before their first unit.** It releases their edits and term decisions under CC BY 4.0 and credits them by name for *ritstjórn* or *yfirlestur*. **The clause survives withdrawal from the research.** The research consent stays a separate, optional document. |

## Reasoning

### D12: what readers actually get from a table summary
- **A summary reaches almost no reader as rendered.** The renderer emits it only as a `data-summary` attribute. The
  comment at that line records why: it is *"exactly what OpenStax's own published HTML carries (measured 2026-09-23 on
  chemistry 1.5 and on a Key Equations page)"*, and *"It is NOT announced by screen readers"*. So flag-only depth is
  proportionate.
- **Alt texts keep full depth.** Screen readers read them, and browsers show them when an image fails.
- **Flag-only text gets its own tier.** Marking it human-verified would repeat a defect this repository has already
  had: a TMX that counted unedited MT as human (Skerfur plan G3.1; register §C202).

### The licence: why a clause, and why separate from the consent
- **One licence covers every release.** Each release the follow-on contract names carries the editors' work, and so does
  the published book. A CC BY 4.0 licence from each editor covers all of them; a copyright transfer would add nothing
  they need.
- **Consent and licence need opposite rules on withdrawal.** Research consent must be withdrawable. A publishing licence
  must not be, or one withdrawal could force published chapters offline. A single undivided document would invite
  reading a withdrawal as covering both.

### Inference, not checked here
- **GDPR withdrawal.** That consent may be withdrawn at any time (Article 7(3)) is standard. The check is the school's
  data protection officer, who reviews the consent text under G1.4.
- **Employer ownership.** The claim that Icelandic copyright law has no general rule handing an employee's work to the
  employer was given as background and not checked. The clause makes the question moot for released material.
- **Copyright in AI output.** The claim that AI output may carry no copyright was given as background and not checked.
  It does not affect the editors' licence.

## Consequences

- **D12:**
  - It answers the 10-10 plan's §8 D12 and 5.4.
  - Package A's re-sizing in the first month uses this depth. The figures are in the private companion.
  - G2.2 and G3.1–G3.2 carry the summaries' own tier.
  - If exposing summaries to assistive technology is ever decided (register §C126 #4), the summary depth is revisited.
- **Licence:**
  - G1.4 gains the clause next to the consent, and the first month's "editors' consent" includes it.
  - The TMX header and the corpus manifest name the editors as the clause provides (G3.1, G3.2).
  - The clause sits in the editing agreement, so signing it is part of taking on editing work. An editor who declines
    the research still signs it.
- **Follow-up is tracked in the active register,** not here.

## Alternatives considered

The options put to [USER] on 2026-10-28.

**D12:**
1. **Record the fact now, decide the depths in month 1.** Rejected: the depth sets package A's re-sizing, which itself
   runs in month 1, and its basis is already measured.
2. **Both at full depth.** Rejected: the largest editing scenario, spent on text almost no reader sees as rendered.

**Licence:**
1. **One form with two parts.** Not chosen: it works if the parts are clearly separate, but it invites reading a
   withdrawal as covering both.
2. **Ask the school first and rely on employment terms.** Not chosen: those terms may not cover an editor employed
   elsewhere.
3. **Transfer copyright.** Rejected: a heavier ask of editors, and it adds nothing the releases need.
