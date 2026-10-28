# Decision: D11 runs three arms (June's wire primary, today's wire secondary, no glossary), approved up to ISK 5,000

- **Date:** 2026-10-25
- **Status:** Accepted
- **Context owners:** [USER] (lead), on a brief prepared by Claude
- **Supersedes:** none. It settles the one open choice in D11's design (§3, the arm) and refines D11 as approved on 2026-10-11 (`docs/decisions/2026-10-11-chemistry-finish-prep-follow-up-answers.md`), whose "March-glossary arm" did not say which sending rules, and which priced two arms at about ISK 1,000–2,500.
- **Related:** `experiments/d11-glossary-test/DESIGN.md` · `docs/plans/2026-10-10-chemistry-finish-preparation-plan.md` (D11) · `docs/plans/2026-07-21-post-item17-followup-campaign.md` (the register: D11's premise, pre-buy lineup, billing check and build brief)

> **FROZEN EVIDENCE — banner-dated 2026-10-25.** This record is *evidence*, never status.
> It describes what was decided on that date and why. **If it disagrees with the active
> register in `docs/plans/`, the register wins** — this file is dated, the register is live.
> Do not sync it, do not update it, do not edit it. Supersede it instead.

## Question

D11 is a controlled test for the research report: was the old chemistry MT's better consistency on taught terms a glossary effect? Its design fixes everything except the arm. The glossary values are the March file either way; the choice is which **sending rules** carry them:

- **June's wire (arm M):** the rules the old MT was actually sent with: every approved row (617), both values of a contested headword, and short headwords matched as substrings.
- **Today's wire (arm S):** today's safeguards: contested headwords omitted, short headwords matched as whole words (590 rows).

At stake: whether the paid test answers the question it was approved for, what else it can answer for the same sitting, and the cost inside the current grant (usage by 31 October).

## Decision

**Three arms, 2 modules (ch11 m68781, ch01 m68667) × 2 runs each, approved up to ISK 5,000:**

1. **June's wire (M), the primary arm.** The primary contrast is M against no glossary.
2. **Today's wire (S), a pre-registered secondary arm.** Its contrasts, S against no glossary and M against S, are secondary.
3. **No glossary, the control.**

The ISK 5,000 cap was set the same day: [USER] first said ISK 2,500 for two arms, raised it to 5,000, and then added the third arm, all before this record was written.

## Reasoning

### June's wire is the primary arm because only it tests the approved question
D11 exists to test what the old MT was actually sent. Today's wire answers a different, forward-looking question ("would the old values help with today's safeguards?"), and its results cannot be reported as a test of June's arm. The register recorded this premise gap on 2026-10-23 ("the March file sent through today's code is not June's arm"). June's wire also reaches a drifted term today's wire omits: measured offline at no cost (`experiments/d11-glossary-test/results/2026-10-24/wire-compare.json`), per chunk June's wire sends 4 to 7 terms today's does not, and today's sends none that June's does not; among them is **atom**, one of m68667's drifted terms.

### Today's wire is added because it is cheap now and answers two useful questions
- **It isolates today's safeguards.** M and S send the same values on the same English through the same model; only the sending rules differ. That contrast measures what the safeguards themselves do.
- **It answers the forward-looking question** that decides how the next books are bought.
- **It replicates §C133 on other modules.** §C133 (September 2026, ch03) found no measurable consistency gain from today's wire (44.2% with the glossary against 44.6% and 44.4% without), with that time's glossary.
- **It needs no build and no extra sitting:** each run takes 1 to 2 minutes.

### Why it is secondary, not a second primary
The two wires differ on only a few terms per chunk (on the nine primary terms, at least atom and *law of conservation of matter*, through the substring "ion"), and run-to-run noise is about a quarter of segments (§C133's same-arm floor). M against S will probably be too small to call. Pre-registering it as secondary keeps the headline on M against no glossary and keeps the extra contrasts from becoming a search for a significant result.

### Cost and timing fit the grant
Per run, both modules cost about ISK 486 (about 126 for m68781 and 360 for m68667, close to the billed September usage on the same English). Six runs come to about ISK 2,920, or about 3,500 with a fifth more for retries, inside the cap. The rate is confirmed by [USER]'s Miðeind invoices: kr. 8.06 per thousand characters before 24% VAT. Miðeind invoices each month's usage at the start of the next, so a buy by 31 October is invoiced about Monday 2 November, which [USER] confirmed on 2026-10-25 is acceptable for Sprotasjóður.

## Consequences

- **A June-wire mode is built in `tools/api-translate.js`, test-first:** verbatim copies of June's two sending functions (13 and 7 lines at 7658de896; offline copies in `experiments/d11-glossary-test/wire-compare.mjs`), one flag, and a provenance value recording the wire. Today's provenance fields (`arm`, `contentHash`, `termCount`, chunk counts) cannot record the matching rule. Today's wire needs no build.
- **Each paid run is checked by its provenance, not its exit code:** an undeclared or mistyped flag is silently dropped by the argument parser, which would buy today's wire under the June-wire label and exit 0.
- **The analysis carries two stated limits:** no record says which model June used, so a glossary effect cannot be fully separated from a model change; and the key-terms reference changed between vintages for 7 of the 9 primary terms.
- **It forecloses** a wider design before 1 November (more modules or runs); the cap and the deadline bound it.
- **The build brief, the order of work and its status live in the register's newest RESUME**, not here.

## Alternatives considered

1. **June's wire and the control only (two arms)** — [USER]'s first choice the same day, at ISK 2,500. Replaced when the third arm turned out to cost about ISK 970 with no build, inside the raised cap.
2. **Today's wire and the control only** — no build, but it answers a question D11 was not approved for, is silent on atom, and largely repeats §C133.
3. **Not running D11 before 1 November** — after the start date no grant pays API costs, so the test would go unfunded.
