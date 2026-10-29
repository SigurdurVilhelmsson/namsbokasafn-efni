# The last paid week before S: re-sequencing the 10-10 plan and the Skerfur plan — PLAN (proposed 2026-10-26)

> ✏️ **PLAN, proposed 2026-10-26. Not status:** open work and its state live in the active register's ⏩ RESUME
> block. This plan cites the chemistry finish-preparation plan
> ([`2026-10-10-chemistry-finish-preparation-plan.md`](2026-10-10-chemistry-finish-preparation-plan.md), "10-10")
> and the Skerfur development plan ([`2026-10-23-skerfur-development-plan.md`](2026-10-23-skerfur-development-plan.md))
> by item number. It changes their **calendars**, and one step **order** if [USER] chooses it (§5). It does not restate
> their items.
> **Funding.** Which grant pays for what is in the private companions in the git-excluded `docs/grants/`. This
> repository is public: no fund names, no amounts, no hours.
> **The reader.** vefur's side lives in vefur's own plan and status (§7); this file only points at it.

## 1. In brief

1. **Why this week.** Before S (1 November 2026) the current grant pays for preparation, including every Claude
   Code session and every API call. From S, the same work counts as in-kind at best, and every API call is unfunded
   (10-10 §1 point 0 and §5, "The funding edge is S"). 10-10's calendar put the build in S → S+4 weeks because it
   expected stage 1 to close after S. Stage 1's answers are dated 2026-10-11 and the reading test's 2026-10-25, so
   nothing in the build waits for them any more.
2. **The aim:** chemistry's MT ready for editing to restart, AI-reviewed layer included, with as much of the build
   and **every paid call** landing before S.
3. **What may not move.**
   - **B1–B3 are never built before S** (Skerfur §1 point 3; the private funding map). Design is allowed.
   - **Nothing reaches readers:** the chemistry sync stays held.
   - **Nothing reaches editors:** the apply hold stays, and layer 2 is data in the repository that no loader reads
     until 10-10 4.1 ships.
     ✏️ *2026-10-28: no loader reads layer 2 even after 4.1 ships. Its edits, rule and AI alike, reach editors as
     suggestions ([record](../decisions/2026-10-28-ai-term-pass-as-editor-suggestions.md),
     [rule layer](../decisions/2026-10-28-rule-layer-edits-as-editor-suggestions.md)).*
4. **The paid runs are conditional on one ruling by [USER]** (§6, item 2): that late-October Anthropic usage
   invoiced around 1 November goes on the current grant, as [USER] already ruled for the MT provider's October invoice
   (register 2026-10-26 (afternoon)). The written confirmation u01's email asks for is sought in parallel, not waited
   for: it cannot arrive this week.
   - **The ruling only matters for a new invoice.** If the account Claude Code uses is billed as a flat plan,
     headless `claude -p` creates no new invoice, and the question disappears. It matters for the API-key route
     (§4), so the transport and the billing date are one question.
   - If [USER] rules no, this week is coding only.
5. **Order by what cannot be recovered.** Code not written before S can still be written after it, unfunded. An API
   call not made before S has no payer. So the critical path is the AI layer's chain (§3), and everything else sits
   below a cut line (§2).
   ✏️ *2026-10-27: before S only the pilot is paid (and the pre-screen if built in time); the full run is after S and
   paid privately, so point 5's "an API call not made before S has no payer" no longer holds for it ([record](../decisions/2026-10-27-ai-layer-pilot-before-s-full-run-after-prereg.md)).*
6. **[USER]'s time is the limit,** in the week of the final report: one decision sitting of about 15 minutes, a few
   short answers, two merge-and-deploy windows and the S tags (§6).

## 2. What moves before S, and the cut line

**Tier 1: irrecoverable after S.** The paid calls, and the steps they depend on.

| # | Item | Plan ref | Needs from [USER] | Paid |
|---|---|---|---|---|
| 0 | **Extraction check.** Re-extract into a throwaway worktree copy (CLAUDE.md: `cnxml-extract --output-dir` is ignored and writes into the real tree) and compare id **sets** and English **values** with the committed `02-for-mt`. Layer 2 is keyed on segment ids, so a paid run on ids a later re-extraction renumbers is wasted | CLAUDE.md, "re-extract first"; 10-10 §4 provenance | none | no |
| 1 | **Layer scaffolding:** `02-mt-selected/` (layer 1s) and `02-mt-revised/` (layer 2), per-module provenance (input hash, ruling-set hash, prompt sha256, model id, harness commit; a mismatch refuses the module), a per-change log. Every edit is keyed on module, segment id **and occurrence**, because duplicate segment ids exist (register §C101 ③; step 0 found one module with 366 markers and 358 ids). Both directories join CLAUDE.md's File Permissions table in the same change | 10-10 §4 | none | no |
| 2 | **The scope field** (`chapters`/`exclude`) for rulings, with a test. The AI gate's scope check needs it | 10-10 1.2, 3.3; roadmap c19 | none | no |
| 3 | **Rule layer, minimal:** key-terms headwords; markup normalisation, render-checked first; H3's text substitutions once ruled; computed exact swaps only if time allows. Each operation is logged with its rule id | 10-10 3.1, 2.4; register §C201 H3 | *addition*; H3's four rulings (D5 and D6 answered) | no |
| 4 | **AI harness and code gate** in `tools/ai-review/`, on the Anthropic API (§4), with 10-10 §6's records from the first call | 10-10 3.2, 3.3, §6 | none (answered 2026-10-26) | no |
| 5 | **Pilot** on one high-drift chapter, then a second | 10-10 3.4 | the API key (§6, item 1) | yes |
| 6 | **Full AI run** over the book, prompt frozen and hashed first | 10-10 3.4, amendment A1 (§5) | the API key | yes |
| 7 | **The AI pre-screen of the approved glossary rows that fire**, every call recorded. [USER] rules the flags after S | 10-10 1.5; roadmap c19 | the API key | yes |
| 8 | **The re-request mode** (writes layer 1s, never `02-mt-output`), then the re-request of all 8 untranslated September segments. 10-10 2.3 names June's API text as the fallback for 7 of them, but using it needs the marker-dialect conversion the unbuilt carry tool would have done, and re-requesting costs less | 10-10 2.3 | go for the buy | yes (MT) |

✏️ *2026-10-27, Tier 1 items 5–7 ([record](../decisions/2026-10-27-ai-layer-pilot-before-s-full-run-after-prereg.md)): item 5 is **one** chapter, measuring output tokens per request,
thinking included (mean, p95, max), at medium and high effort, plus the truncation rate; item 6 moves to month 1,
after the pre-registration and the prompt freeze, before the first unit opens; item 7 (the pre-screen) runs before S
if built in time, otherwise privately or dropped (open, [USER]).*

✏️ *2026-10-28, reworded the same day: the pilot still measures both medium and high. The full run uses high, and
medium is its fallback if high truncates or the projected run would cross the cap. Item 6 no longer waits on a
pre-registration: it follows the prompt freeze, and a unit gets suggestions only if the run and the suggestion view
existed before it was opened ([record](../decisions/2026-10-28-ai-term-pass-as-editor-suggestions.md)).*

✏️ *2026-10-28, item 3: the rule layer's operations reach editors as suggestions in G1.23's view, never as starting
text ([rule layer](../decisions/2026-10-28-rule-layer-edits-as-editor-suggestions.md)). H3's substitutions, listed in
item 3, are the exception: they keep their 2026-10-17 route (§6 item 5's note).*

**Tier 2: large coding, unfunded after S.** In parallel with Tier 1, highest value first.

| # | Item | Plan ref | Needs from [USER] |
|---|---|---|---|
| 9 | **Stage 1's rulings into code:** the houseStyleTerms entries (the inflection rule decides three of them), the preference rows and the *valence*/*emission* concept-model change as committed scripts [USER] runs on prod; then deploy → boot → export | 10-10 Stage 1 "Outputs"; roadmap c15 | *addition*; the inflection rule; window A |
| 10 | **The guards PR:** G1.14 and G1.19 (on `fix/c09-guards-before-editing`, register 2026-10-24 (late night)), then G1.11, G1.13, G1.15, G1.16, G2.3 | Skerfur §7, "Before S"; roadmap c09 | c09's two choices; SD7; window A |
| 11 | **Per-segment "human"** in the TM, concordance and corpus | 10-10 4.0; Skerfur G2.2 | none |
| 12 | **The reader census** (about 45 files read `02-mt-output`, counted 2026-10-26; re-derive) and the three main readers switched to layer 2 **behind a flag that defaults to layer 1**. The flag turns only after [USER]'s blind check, and then only for the categories that survive it, so a deploy before the check changes nothing editors see | 10-10 4.1; Skerfur G1.8 | window B, if ready |
| 13 | **Re-attach by content** (the script; its prod run comes after S) | 10-10 4.2 | none now |

✏️ *2026-10-28, item 12: **no reader switches to layer 2**, behind a flag or otherwise; layer 2 reaches editors only
as suggestions. The reader census still matters, because 10-10 4.1, narrowed, makes those readers take layer 1s
([record](../decisions/2026-10-28-ai-term-pass-as-editor-suggestions.md)).*

**Tier 3: small, if time allows.** Register §C208: 15-3's Check-your-learning answer, a note's bare text, extracted,
injected and rendered, with its one segment bought alongside item 8; §C205's residue opener with its test and base
rate; §C201 H1, H2 and H4; the
duplicate-id measurement (roadmap c18); 10-10 4.3, figure labels against the ruled words; a draft of SD9's record
(roadmap c14); vefur's two asks (roadmap p07), if still wanted; the three small fixes (roadmap p08).

**Out of this week:**
- B1–B3 (roadmap c12). The measurement protocol and consent text (c13) are design and may be drafted; nothing is built.
- 10-10 4.5 (the rebuild) and its QC, [USER]'s preview, the 1.8 criterion and the sync. They need the layers first.
  ✏️ *2026-10-28: "the layers" now means layer 1s. The preview re-renders from 1s (10-10 4.1, narrowed), and layer 2
  stays out of it until the next chemistry sync decision (register, 2026-10-28).*
- 10-10 2.2 (the ch01–ch02 notes), unless Tier 2 finishes early.
- The editing-gate items that wait on SD1 or SD4–SD8, beyond the guards in item 10.

## 3. The critical path, day by day

| Day | [CODE] | [USER] | Paid calls |
|---|---|---|---|
| **Mon 26 Oct** (evening) | step 0; layer scaffolding; the scope field; the harness and gate, test-first on a mocked transport | the decision sitting (§6, item 2) | none |
| **Tue 27** | the minimal rule layer; the harness's transport (per the answer); a 0-ISK census of the AI scope and a token estimate; the re-request mode and its dry run | u01 and B1; the two terminology answers | none |
| **Wed 28** | pilot on one chapter, self-check, a second pilot chapter, prompt revision, prompt frozen | strict A1 only: a 20-per-category blind look (about 30 minutes) | pilot |
| **Thu 29** | the full AI run; the glossary pre-screen; the re-request | **window A:** merge and deploy the guards and rulings PRs; run the two prod scripts | full run |
| **Fri 30** | gate logs, provenance and layer-2 data committed on a branch, with PRs; Tier 2 | final report | last paid calls by Friday night |
| **Sat 31** | buffer; nothing paid unless a run must be finished | final report; window B if possible | none planned |
| **Sun 1 Nov (S)** | both repositories tagged (roadmap c10) once the content backup reports nothing unpushed; the ruling-store snapshot (c11) | approve the tags; SD3 | none |

✏️ *2026-10-27 ([record](../decisions/2026-10-27-ai-layer-pilot-before-s-full-run-after-prereg.md)): Wed: the one-chapter pilot. Thu: no full run. Fri: the pilot's logs and provenance
committed.*

## 4. The AI layer this week

- **Scope v1 (D6):** the ruled term plus the agreement it forces. Suspected mistranslations are flagged, never fixed.
  The pass reads the compiled ruling set, record-only rulings included, and the scope field (item 2).
- **Input:** layer 1/1s with the rule layer applied, and the English from `02-for-mt` at the commit step 0
  confirms.
  ✏️ *2026-10-28: the AI pass reads layer 1/1s only, with no rule layer applied first; the runner already reads
  `02-mt-output` with its `02-mt-selected` overlay. Rule edits and AI edits are both suggestions against that same
  text ([rule layer](../decisions/2026-10-28-rule-layer-edits-as-editor-suggestions.md)).*
- **Output:** edit operations `{segment, find, replace, category, ruling_id, reason}` → the code gate (10-10 3.3) →
  layer 2, plus the gate log. Every rejection is logged.
- **Records, from the first call (10-10 §6):** the prompt files in the repository, with a sha256 per run; the runner
  and its commit; the exact model id and the date; every request and response as committed JSONL; usage and cost per
  call.
- **Model:** `claude-opus-5-5` by default. A cheaper model is [USER]'s call.
- **Transport** (10-10 §6 allows either). ✏️ *[USER] chose the API on 2026-10-26
  ([record](../decisions/2026-10-26-pre-s-week-ai-layer-answers.md)); the options as they were put:*
  - the Anthropic API: a per-token invoice, the Batch API at half price, and a key [USER] creates. Every parameter
    the model sees is in the project's own records, which makes it **the cleaner record for the paper**;
  - headless Claude Code (`claude -p`) on [USER]'s existing account: no setup and no Batch discount. It runs inside
    Claude Code's own harness, whose system prompt and tool layer the project does not version, so the recorded
    prompt sha256 covers only the project's half. Its cost depends on how that account is billed (§1 point 4).
- **Where the layer and its logs live:** committed with the layer, as 10-10 §6 says ([USER], 2026-10-26, same
  record). D11's raw MT stays off-repo by [USER]'s separate ruling; that was a side test, while layer 2 is the text
  editors start from.
  ✏️ *2026-10-28: editors now start from pure MT, so layer 2 is no longer "the text editors start from". Its logs are
  still committed, as the research layer's record
  ([record](../decisions/2026-10-28-ai-term-pass-as-editor-suggestions.md)).*
- **Cost:** a 0-ISK census and token count first; the pilot measures the real cost per call; the run stops at the
  cap. At the list prices of 2026-10-06, 1,000–3,000 requests on Opus 5.5 at standard rates come to roughly
  USD 35–70, and the glossary pre-screen to roughly USD 10–20. These are estimates; invoices decide.
- **What [USER]'s blind check decides:** which categories survive, under 10-10 3.4's rule, unchanged. A dropped
  category's operations leave layer 2 by code and stay in the log. Nothing in layer 2 reaches an editor before that
  check: 4.1's layer-2 read stays behind its flag until then (§2, item 12).
  ✏️ *2026-10-27: the pilot chapter is excluded from the blind-check sample and the control frame (its output is seen
  first and drives prompt revision; [record](../decisions/2026-10-27-ai-layer-pilot-before-s-full-run-after-prereg.md)).*
  ✏️ *2026-10-28: there is no control frame any more. The pilot chapter stays out of the short look's sample.*
  ✏️ *2026-10-28, added the same day: the check is 3.4's "20 first" stage only, and there is no layer-2 read to keep
  behind a flag (item 12; 10-10 4.1, narrowed).*
- **The slip rule is unchanged:** if the AI layer fails its check, freeze with the rule layer.
  ✏️ *2026-10-28: changed. A category of AI suggestions that fails the short look is not shown, and rule
  suggestions are unaffected ([rule layer](../decisions/2026-10-28-rule-layer-edits-as-editor-suggestions.md)).*

## 5. What this plan amends, if [USER] agrees

- **A1, 10-10 3.4's order.** Choose one:
  - **reordered:** pilot, then the full run before S, then [USER]'s blind check after S on a sample from at least 3
    chapters;
  - **strict:** pilot, then a 20-per-category blind look before the full run (about 30 minutes of [USER]'s time on
    Wednesday), then the full run before S.

  Either way the acceptance rule is 10-10 3.4's. *Reordered* risks paying for categories the check later drops.
  *Strict* puts 30 minutes into the report week. ✏️ *[USER] chose **reordered** on 2026-10-26
  ([record](../decisions/2026-10-26-pre-s-week-ai-layer-answers.md)).*
  ✏️ *Superseded 2026-10-27: [USER] chose a one-chapter pilot before S and the full run after the D7
  pre-registration, paid privately ([record](../decisions/2026-10-27-ai-layer-pilot-before-s-full-run-after-prereg.md)).
  3.4's strict order is available again; [USER] settles it in the pre-registration.*
  ✏️ *2026-10-28: there is no pre-registration. The check is 3.4's "20 first" stage, after the full run and before
  suggestions go live ([record](../decisions/2026-10-28-ai-term-pass-as-editor-suggestions.md)).*
- **A2, the calendars** (10-10 §5's table and the Skerfur plan's §7 "Before S" row): the S → S+4 weeks build rows
  (rule layer, AI harness and gate, re-request mode, full AI run) move into the week before S as far as they get.
  Whatever is unfinished at S continues in month 1, as before.
- **A3, the roadmap:** rows c15, c16, c17 and c18 move into week 1. The dashboard is a dated snapshot.
- **D5 and D6 come first.** They are 10-10's own decisions, not new ones, and they gate items 3–6.
- **At S:** unmerged pre-S work is either merged before the tag, or its branch tips are tagged alongside it
  (§6, item 9).

## 6. [USER]'s involvement, in priority order

Each item says roughly how long it takes, by when, and what it unblocks. Items marked **(vefur)** come from vefur's
session (§7); vefur's plan owns them, and they are ranked here only against efni's.

✏️ *The decision sitting was answered on 2026-10-26: the API with a key, capped at USD 100; late-October usage on the
current grant; D5 and D6 yes; A1 reordered; the logs committed
([record](../decisions/2026-10-26-pre-s-week-ai-layer-answers.md)).*

1. **Create the API key** (about 10 minutes; tonight or Tuesday). An Anthropic Console key with billing set up, saved
   as `ANTHROPIC_API_KEY` in the repository's git-ignored `.env`, never in chat or a commit. **Unblocks the pilot on
   Wednesday.**
2. **Send u01 and B1** (about 25 minutes; Tuesday; the register's next action). u01's email asks in writing whether
   late-October usage invoiced after the report may go on the current grant. Nothing this week waits for the reply.
3. **Two terminology answers** (about 5 minutes; Tuesday). **Unblocks the rulings PR and the rule layer.**
   - *addition → álagning*: does the KEEP cover the reaction sense only, or every sense? If only the reaction sense,
     the bare row is retired and *addition reaction → álagningarhvarf*, already ruled, takes its place (register
     2026-10-25 (night, later), item 1). ✏️ *[USER] answered on 2026-10-26: the reaction sense only (register,
     2026-10-26 (night)). In the AI layer the ruling is sense-scoped instead.*
   - the three entries that differ from the stored word only by the definite article or a gender ending
     (*lotukerfið → lotukerfi*, *árekstrakenningin → árekstrakenning*, *eintenntur → eintennt*): write them as
     entries, or keep them record-only.
4. **(vefur) D03's data-rule wording and D20 batch 4** (Tuesday). They gate vefur's only pre-S train (S3.3 and its
   invisible work), whose sessions are funded only before S.
5. **H3's four rulings** (about 10 minutes; Wednesday): one heading for the worked examples' check-your-learning
   part; *amu* or *ame*; §9.5's two objectives in the supine form the others use; *Talið upp* for *Talist upp*.
   vefur's handoff (`docs/handoffs/2026-10-16-reader-branches-requests-for-efni.md`, H3) has the counts and their
   re-measure commands.
   ✏️ *2026-10-28: the rule-layer ruling does not change H3's route. H3 keeps the route [USER] scoped on 2026-10-17
   (register §C201: built in the ② code batch, riding the whole-book re-render), so its fixes still reach readers
   that way ([rule layer](../decisions/2026-10-28-rule-layer-edits-as-editor-suggestions.md)).*
6. **c09's two choices and SD7** (about 10 minutes; Wednesday): show the BÍN credit or hide the inflected forms
   (G1.16); drop the sidecar's `by`, `at` and `generated`, or cut `generated` to the date (G2.3); SD7 as drafted.
7. **(vefur) The train lock on M4** (a few minutes; this week). Under vefur's D05, no train runs until January once
   vefur's S4.1 merges to `main`. Choose: accept the lock, keep M4 on a feature branch, or re-rule D05.
8. **Go for the re-request buy** (1 minute; Thursday): the 8 untranslated September segments, plus 15-3's answer if
   §C208's fix lands in time (§2, Tier 3).
9. **Window A** (about 45 minutes; Thursday evening): merge the guards and rulings PRs, deploy, run the preference
   and concept-model scripts on prod, and check the next export.
10. **(vefur) S1.3's real-phone focus-order check, and S0.4** (when convenient). vefur's plan dates S0.4 "before S",
    but no step waits on it.
11. **Window B** (about 30 minutes; Saturday, or Sunday before the tag): merge the layer tools and data PRs, plus 4.0
    and 4.1 if they are ready (4.1 with its flag off), then deploy. Without a deploy the content backup strands
    (CLAUDE.md § Content delivery).
    ✏️ *2026-10-28: there is no flag. 4.1 is narrowed to human, selected, pure.*
12. **The rule at S, and the tag's name** (1 minute): merge pre-S branches before the tag, or tag their tips.
    Proposed: an annotated tag named `s-2026-11-01` in both repositories, each session tagging its own repository after
    [USER]'s approval; vefur tags after its train if that ships before S.
13. **The S tags and SD3** (about 10 minutes; Sunday 1 November): approve both tags once the content backup reports
    nothing unpushed; accept or amend SD3's two counts.

**After S, not blocking this week:** the AI blind check (A1 reordered: about 1–2 hours in month 1); the flagged
glossary rows; SD1; D7, D12 and D13; SD4–SD8; the preview; D14. For the reader: the front-page wording (before the next
chemistry sync); the follow-on's credit wording (before the first reviewed publication); the staged-release answer
(roadmap u07); vefur's later decision sessions.
✏️ *2026-10-27: the full run joins month 1 ([record](../decisions/2026-10-27-ai-layer-pilot-before-s-full-run-after-prereg.md)).*
✏️ *2026-10-28: D7 and D12 are answered ([record](../decisions/2026-10-28-ai-term-pass-as-editor-suggestions.md),
[answers](../decisions/2026-10-28-d12-and-editor-licence-answers.md)); D13 remains. The AI blind check is now the short
look (3.4's "20 first" stage), before suggestions go live.*

## 7. vefur

vefur's plan (`../namsbokasafn-vefur/docs/plans/2026-10-15-reader-v1.1-v1.2-review-plan.md`) and its CLAUDE.md
status own these; this list only points. From vefur's reply of 2026-10-26, measured on vefur `main` `9c4f96e`. The
claims efni acts on were re-measured here (✔).
- **Nothing in vefur's pre-S queue depends on efni, and efni needs nothing from vefur before S.** vefur proposes one
  more train of fixes and invisible work before its M4, because its D05 allows no train until January once S4.1
  merges. The proposal is [USER]'s to confirm (§6, items 4, 7 and 10).
- **§C207, the content-deploy procedure:** vefur can write it before S, with no efni dependency. efni supplies two
  things at sync time only: the commit to sync (never `main` as it stands, §C204), and the final titles for the
  redirect rows, including re-pointing vefur's two existing chemistry rows and 15-3's changed slug.
- **G1.19 and vefur's S3.3:** either order is safe. vefur's only credentialed call to Ritstjóri is the page-view
  beacon, which D03 ruled out. G1.19 also stops the beacon in the frozen books' old bundles, which S3.3 cannot reach.
- **H7** is not sent. A narrowed H7 could go now, which changes vefur's plan order ([USER]'s call). It matters only
  once efni's H5 has a branch.
- **The Skerfur plan's §5 for the reader:** GoatCounter counting client-side navigation (§5.4) needs no decision and
  can go before S. The front-page claim needs [USER]'s wording, the follow-on's credit sentence needs the contract's
  wording, and the chapter hold-back (§C142) needs the staged-release answer.
- **The "Svar:"-only answers are efni's** (✔ re-measured 2026-10-26). 7-2's table was dropped from its answer by an
  older inject on `main`'s `03-translated`, and sits inside the answer on the September rebuild branch, so 4.5 fixes
  it. 15-3's answer text was never extracted: register §C208.
- **vefur's two asks of efni (roadmap p07)** are still wanted, at low priority: retire
  `.github/workflows/sync-content.yml`, and add `--book` to the usage examples in `tools/cnxml-render.js`.
- **At the sync, not this week:** vefur's data-en gate (efni's glossary and index generators do not emit the English
  term yet), and H1's image dimensions, which vefur's pager needs from its M8 on.

## 8. Risks and fallbacks

- **The billing ruling is no:** coding only. The paid items run after S unfunded, or not at all. The rule layer
  still yields a layer 2.
- **Step 0 finds drift:** modules whose ids or English changed are left out of the paid run until their MT is
  current. A top-up is an MT call, so it belongs before S too.
- **The pilot fails its self-check:** fix the prompt and pilot again. If that is not done by Thursday night, there
  is no full run, and the slip rule applies.
- **A prompt defect surfaces after the full run:** a re-run after S is unfunded. The two pilot chapters, the frozen
  prompt and the gate are the defence.
  ✏️ *2026-10-27: "by Thursday night, no full run" and "a re-run after S is unfunded" no longer apply as written: the
  full run is after S and privately paid ([record](../decisions/2026-10-27-ai-layer-pilot-before-s-full-run-after-prereg.md)).*
- **[USER]'s time:** §6 puts unblocking first; Tier 2 waits.
- **The content backup strands after a merge to `main`:** each window ends with a deploy.
- **This machine's memory:** at most about three agents running commands at once, and the full suite run once per
  PR by the controller (project memory, fan-out budget).

## 9. What this plan cannot see

- how the account Claude Code uses is billed, and when;
- [USER]'s week;
- the AI pass's real cost per call;
- how many categories survive the blind check;
- vefur's remaining capacity before S.
