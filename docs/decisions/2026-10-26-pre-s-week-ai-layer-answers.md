# Decision: the AI layer runs before S through the Anthropic API (capped), with D5 and D6 yes, the full run before the blind check, and its logs committed

- **Date:** 2026-10-26
- **Status:** Partly superseded by `docs/decisions/2026-10-27-ai-layer-pilot-before-s-full-run-after-prereg.md` (its decision 3, A1 reordered; and decision 1 insofar as the current grant paid the full run)
- **Context owners:** [USER] (answers given in chat on 2026-10-26, in reply to four questions the session put)
- **Supersedes:** none
- **Related:** `docs/plans/2026-10-26-pre-s-week-plan.md` (§1 point 4, §4, §5 A1, §6 item 2);
  `docs/plans/2026-10-10-chemistry-finish-preparation-plan.md` (§4, §6, 3.4, §8 D5 and D6);
  `docs/plans/2026-10-23-skerfur-development-plan.md` (§7, "Before S");
  the active register's 2026-10-26 (night) entry

> **FROZEN EVIDENCE — banner-dated 2026-10-26.** This record is *evidence*, never status.
> It describes what was decided on that date and why. **If it disagrees with the active
> register in `docs/plans/`, the register wins** — this file is dated, the register is live.
> Do not sync it, do not update it, do not edit it. Supersede it instead.

## Question

The pre-S week plan moves the 10-10 plan's AI-reviewed layer (layer 2) from S → S+4 weeks into the week before
S = 1 November 2026, because after S every API call is unfunded. Four answers decide whether it can run this week,
how, and how it is recorded:
1. how the layer calls the model, at what spend, and whether late-October usage may go on the current grant;
2. 10-10's D5 and D6, which gate the rule layer and the AI pass;
3. the order of 10-10 3.4: whether the full run may come before [USER]'s blind check;
4. whether the layer's request/response logs are committed to the public repository.

At stake: research integrity (the layer is one of the paper's three conditions), cost, and [USER]'s time in the
week of the current grant's final report.

## Decision

1. **Transport: the Anthropic API with a key. Paid AI calls are capped at USD 100 in total** (the AI pass and the
   glossary pre-screen together). **Late-October Anthropic usage invoiced around 1 November goes on the current
   grant**, as [USER] already ruled for the MT provider's October invoice. The written confirmation that u01's email
   asks for is sought in parallel.
2. **D5 = yes:** selected MT (layer 1s, here the re-requested segments) is its own condition in the paper.
   **D6 = yes:** AI pass v1 covers the ruled term plus the agreement it forces; suspected mistranslations are flagged
   for editors, never fixed.
3. **A1 = reordered:** pilot, then the full run before S, then [USER]'s blind check after S on a sample from at least
   3 chapters. **The acceptance rule is 10-10 3.4's, unchanged.** A category the check drops leaves layer 2 by code
   and stays in the log.
4. **The AI layer's request/response logs are committed to the public repository with the layer**, as 10-10 §6
   says.

## Reasoning

### Why the API, and why a cap

- **The record.** With the API, every parameter the model sees is in the project's own files: the prompt, the model
  id, the request and the response. Headless Claude Code (`claude -p`) was the zero-setup alternative, but it runs
  inside Claude Code's harness, whose system prompt and tool layer the project does not version, so a recorded
  prompt hash would cover only the project's half (pre-S plan §4).
- **The cost is small against the cap.** At the list prices cached 2026-10-06 (Claude Opus 5.5, USD 4 / 20 per
  million input / output tokens), the plan estimates roughly USD 35–70 for 1,000–3,000 AI-pass requests and roughly
  USD 10–20 for the pre-screen. These are estimates; the pilot measures the real cost per call, and the run stops at
  the cap.
- **Checked against the tree on 2026-10-26:** no `ANTHROPIC_API_KEY` was configured in the repository's environment
  files and no `ant` CLI was installed, so a key is new setup; Claude Code 2.1.310 was installed.

### Why the late-October ruling

- The current grant pays preparation, Anthropic bills included, until the final report; from S every API call is
  unfunded (10-10 §1 point 0; the private funding companion). The written confirmation cannot arrive this week, and
  [USER] had already ruled the same question for the MT provider's October invoice, dated about 2 November (register,
  2026-10-26 (afternoon)).

### Why D5 and D6 yes

- They are the 10-10 plan's own recommendations (§8, "Before stages 2–4"), unchanged since rev. 5. D6's narrow scope
  is what makes the code gate (10-10 3.3) able to check every operation: a term operation must contain the ruled
  word, and agreement operations are bounded to word endings and closed-class words near an accepted term operation.

### Why the full run before the blind check

- After S the full run has no payer, while [USER]'s check is time, not money, and it can come in month 1. The strict
  order would have put about 30 minutes of checking into the report week.
- The cost of the reorder is paying for operations in categories the check later drops. The pilot on two chapters,
  a frozen and hashed prompt and the code gate limit it. Nothing in layer 2 reaches an editor before the check: the
  plan puts 10-10 4.1's layer-2 read behind a flag that defaults to layer 1 (pre-S plan §2, item 12).

### Why commit the logs

- 10-10 §6 lists "every request and response as committed JSONL" among what each AI use records, so the paper's AI
  condition can be reproduced from the public repository. The logs carry only book text and model output.
- **This differs from D11's raw MT on purpose.** On 2026-10-26 [USER] ruled that D11's raw MT is not committed
  (register, 2026-10-26 (late afternoon)). D11 was a controlled test whose trees never enter the book. Layer 2 is the
  text editors will start from, so its provenance belongs with it.

## Consequences

- [USER] creates an API key in the Anthropic Console and puts it in a git-ignored environment file. The key never
  enters the repository, a commit message or a log.
- The harness records, from the first call: the prompt files and their sha256, the runner's commit, the exact model
  id and date, every request and response as JSONL, and usage and cost per call. It stops at the cap.
- 10-10 3.4's order changes for this book only, as the pre-S plan's A1 states; its acceptance rule does not.
- The committed logs make layer 2 auditable, and they cannot be withdrawn from a public repository's history later
  without a history rewrite.
- The work this creates, and its state, are tracked in the active register, not here.

## Alternatives considered

1. **Headless Claude Code (`claude -p`) on [USER]'s existing account.** No setup, and no new invoice on a flat plan.
   Rejected for the record: the harness's own prompt is not versioned by the project.
2. **Deciding the transport later.** The harness can be built for either, but the pilot could not start until the
   answer came, which costs paid days before S.
3. **D6 yes, D5 no.** Would fold the re-requested segments into pure MT in the paper's conditions. Not chosen.
4. **Strict order** (a 20-per-category blind look before the full run) and **pilot only before S** (the full run
   after the check, unfunded). Not chosen, for the reasons above.
5. **Logs off-repo** with verified copies and a committed hash manifest, as for D11. Not chosen: layer 2 is the
   editors' starting text, not a side test.
