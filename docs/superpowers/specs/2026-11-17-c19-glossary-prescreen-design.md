# c19 — the AI pre-screen of the glossary rows editors see — DESIGN (draft, 2026-11-17)

**Owner of status:** the active register (`docs/plans/2026-07-21-post-item17-followup-campaign.md`, the
2026-11-10 c19 entry). This document is the design record; it holds no status.
**Plan item:** 10-10 plan 1.5 (`docs/plans/2026-10-10-chemistry-finish-preparation-plan.md`).

## 1. Intent

The glossary no longer goes to the MT ([USER] 2026-09-06). Its approved rows now act on **editors**: the segment
editor's per-segment term warnings and the head editor's per-module terminology report both show, at every match,
the Icelandic word the concept model expects (`findTermsInSegments` in `server/services/terminologyService.js`). A
row whose Icelandic is a **different sense** of the English word puts the wrong "expected" word in front of every
editor at every match, and teaches them to ignore the panel.

The pre-screen asks an AI model, row by row, whether each such row is a **clear error**, so that [USER] rules only
the flagged rows instead of reading every row. [USER] chose it on 2026-11-10 (register). Its value falls with every
chapter editors open first, so it should finish before editing starts in earnest.

It is also a documented research step (CLAUDE.md § Purpose): every call is recorded, with prompt, model, cost and a
measured control result.

## 2. Goals, non-goals, anti-goals

**Goals**
- A list of flagged rows, each with a reason, a proposed correction and the evidence [USER] needs to rule fast.
- Every row in the population either judged or listed as unjudged, by row id.
- A measured, recorded answer to "can this run see a wrong-sense row?" (the controls, §5).

**Non-goals**
- **Term choice.** A row whose sense is right but where a teacher might prefer another word is **not** a flag
  ([USER] 2026-11-17: "clear errors only", option A). Term choice belongs to the ruling cards (10-10 plan 1.4).
- **Applying fixes.** The script that writes [USER]'s rulings into the concept model on production is designed
  after the rulings exist (§9), because what it must do depends on them.
- **Physics and biology rows, by default.** §C129 (2026-09-05) judged every physics and biology row that fired on
  chemistry, and its 378 removals have all landed (0 of 378 remain in today's export). But it judged **MT damage**,
  keeping rows where damage was "measured absent", which is not a sense check of what the editor shows. So the
  pilot measures them (§6), and **[USER] decides after the pilot** whether the full run includes them. By the §3
  sizing they are about 1,256 rows against chemistry's 312. See §10 for §C129's coverage gap.
- **Making the editor sense-aware.** Logged (§10), not built here.

**Anti-goals (a run that "works" but fails)**
- A clean list from a model that cannot see the error class. Hence controls that must be flagged (§5).
- A row silently counted as fine because its request was refused or truncated.
- A flag list so long or so noisy that ruling it costs more than reading every row.
- Any write to production, to `02-mt-output/`, or to the concept model by this work.

## 3. What exists today (measured 2026-11-17, 0 ISK)

- **The harness** (`tools/ai-review/`): `runInteractive` and `runBatch` take prebuilt `{ key, body }` requests,
  reserve each request's worst case in the shared ledger, record every request and response, resume a batch, and
  refuse anything outside an allowlist of body shapes (no `fallbacks` field; thinking `adaptive` only;
  `output_config.format` as a JSON schema). A run names its `use`, its prompt files with hashes, and a ruling set.
  `term-pass.js` is the one existing pass and the worked example.
- **The cap:** `CAP_USD` (`tools/ai-review/config.js`) binds every paid AI call on the shared ledger
  `books/efnafraedi-2e/ai-review/ledger.jsonl`. Settled there: USD 64.86, no open reservation → **USD 35.14 left**.
- **Prices** (`tools/ai-review/pricing.js`): Fable 5.2 USD 8 / 40 per million tokens in / out, Opus 5.5 USD 4 / 20;
  the Batch API halves both.
- **The rulings:** `experiments/terminology-consistency/results/2026-11-02/ruling-set-2026-11-02.json`, 399 rulings
  over 404 English strings, 8 with a ruled sense. It already rules the three rows the 10-10 plan named:
  `valence → gildistala` (competitor *girðitala*), `emission → útgeislun` (competitors *ljómun*, *útblástur*), and
  `addition → álagning` **for the addition-reaction sense only**.
- **The concept model lives only in production's database.** This box's `sessions.db` has no `concept_term`
  table. The committed `books/efnafraedi-2e/glossary/glossary-unified.json` (1,750 terms, exported 2026-11-01) is a
  resolved view of the book's domain chain (chemistry → physics → biology); it does **not** hold the fallback-tier
  terms from other domains that the editor also offers.
- **A read-only production pattern exists:** `server/scripts/read-term-resolutions.js` is sent on stdin over ssh,
  opens the database `readonly`, and prints JSON; production keeps no file. Production had 3.2 GB available.
- **Sizing (a lower bound; not the editor's matcher — no tiling, no fallback tier):** of the export's rows,
  **312 unruled chemistry-domain rows** match chemistry's English (4.5 M characters of `02-for-mt`); 138 more are
  ruled; 1,297 are physics or biology. The 10-10 plan's "~390" was an October count under another definition.

## 4. Approaches considered

1. **Judge each row against its own chemistry sentences — CHOSEN** ([USER] 2026-11-17). Census on production
   with the real matcher; rows sent in groups with sample sentences; verdicts to a review page.
2. **A free agreement screen first, AI only on rows that fail it.** Rejected: a wrong row the MT obeyed agrees
   perfectly with the MT (June's MT wrote *álagning* 66 times), so the screen would skip the worst rows.
3. **Headword and Icelandic only, no sentences.** Rejected: sense depends on how chemistry uses the word; without
   sentences the model guesses it.

**Model:** [USER] (2026-11-17): use Fable 5.2 "if beneficial, as it is the best model at Icelandic". §6 decides
it on the pilot.

## 5. Controls

The run must prove it can see the error class, so known answers ride along, **unmarked and mixed into ordinary
groups**, and are stripped before anything reaches the review page.

**Every positive is named here, so [USER] vets them by approving this document.** Each is a different *sense* by a
plain dictionary reading, never a term choice: a model that calls a positive "defensible" has missed a real error.
All come from rows already removed from the concept model (§C129's frozen removal set,
`test-results/c129-chemistry-fallback-removal-set-2026-09-05.tsv`, and `server/scripts/remove-wrong-sense-headwords.js`),
so none can appear in the population.

| Control | Rows (with real chemistry sentences) | Why it is a clear error | Expected |
|---|---|---|---|
| **Subtle positives**: chemistry against chemistry, or a near sense | `balanced → í jafnvægi` | "at equilibrium"; a balanced equation is *stillt* | flagged |
| | `reduce → einfalda` | "simplify"; chemistry's reduce is redox *afoxa* | flagged |
| | `depression → þunglyndi` | clinical depression; freezing-point depression is *frostmarkslækkun* | flagged |
| | `vessel → æð` | a blood vessel; the corpus means lab glassware (*ílát*) | flagged |
| | `phases → kvartilaskipti` | phases of the moon; phases of matter are *fasar* | flagged |
| **Easy positives** | `terms → tíðir` · `rays → skötur` · `moles → moldvörpur` | menses · the fish · the animal | flagged |
| **Homograph pair** | `addition → álagning`, sent twice as two separate rows, never in one request, each with five named sentences (below) | [USER]'s ruling: right for the addition-reaction sense only | the "adding" row flagged (`wrong-sense` or `some-senses-only`); the "reaction" row **not** flagged |
| **Negatives** | `atom → atóm` (ruled against the official *frumeind*), `anode → anóða`, `calorimeter → varmamælir`, `bond length → tengilengd`, `carbonate → karbónat`, `crystalline → kristalkenndur` | [USER] ruled them; each is single-sense in chemistry's sentences (read 2026-11-17) | not flagged |

**The homograph pair's sentences, by segment id** (read 2026-11-17; chemistry has only five addition-reaction
segments, all in ch20):
- *reaction:* `m68846:para:fs-idp51580832`, `m68846:para:fs-idp33513136`, `m68846:para:fs-idp10607328`,
  `m68847:para:fs-idm8648512`, `m68846:glossary-term:fs-id1170893631592-term`;
- *adding:* `m68667:para:fs-idm107801696` (energy), `m68703:para:fs-idm134700400` (solvent),
  `m68735:para:fs-idm145149808` (electrons), `m68808:para:fs-idm115041904` (acid or base),
  `m68811:para:fs-idp15157136` (lime).

The positives' and negatives' sentences are drawn by the sampling rule (§7); a reading of five per word on
2026-11-17 found every drawn sentence of the expected character (each positive wrong in all of them, each negative
plainly single-sense).

Considered and left out: `structure → gerð` (its §C129 reason is a displaced standard word, which reads as term
choice) and June's `emission → útblástur` and `valence → girðitala` (*útblástur* is right for gas emissions, so the
expected answer would depend on which sentences are drawn; *girðitala*'s sense cannot be stated in one line).

**A control looks exactly like a population row:** the model sees the same three things for both (§7), and a
control's sentences come from chemistry's English by the same sampling rule. The control set, its expected answers
and the negatives' selection rule are written to the run's records before the first call.

## 6. Pilot, model choice and the cost gate

**Pilot.** All controls, 24 population rows and **15 physics or biology rows** (each set spread across hit counts,
chosen deterministically), about 55 rows in about 7 requests, run **interactively** on **Fable 5.2** and **Opus
5.5**, both at effort `high`, with identical requests. Fable's guidance is to start at `high`; the term pass's
`xhigh` is not inherited. The physics and biology rows' flag rate and the measured cost per row are reported
separately: they are what [USER] decides the full run's scope on (§2).

**Gate (per model).** Every positive flagged (any flag kind); the homograph pair answered as expected; no negative
flagged. A miss stops the run there and is reported to [USER] with the model's own reason. **The prompt is never
revised merely to pass a control:** a revision needs a cause read in the model's answers, is a new prompt file
version, and is recorded; then the pilot is repeated.

**Stop and ask before the full run** if the population exceeds **450 rows** (half again over the §3 sizing), or if
the chosen model flags more than **25%** of the pilot's population rows. Either means [USER]'s ruling load would be
larger than this design assumed (anti-goal 3).

**Model choice.** If Fable passes, the full run uses Fable. If only Opus passes, stop and report to [USER] before
any full run; never switch silently. If a Fable call is refused for account reasons (Fable requires 30-day data
retention; no Fable call has yet gone through this harness), stop and report. The two models' agreement on the 24
population rows is reported as information.

**Cost gate.** The cap binds on the **worst-case reservation**, not on expected spend: a batch reserves, per
request, its counted input plus `max_tokens` of output at batch rates. At Fable batch rates, `max_tokens` 16,000
reserves about USD 0.32 of output per request; about 45 requests of 8 rows reserve about USD 16 with input. The full
run starts only if its computed reservation leaves **at least USD 5** of the cap free; otherwise it is split into
sequential batches, or `max_tokens` is lowered to twice the largest output the pilot measured. Pilot reservations
(interactive, standard rates) are small: about USD 4 for Fable and USD 2 for Opus at worst.

## 7. Requests

- **One request = about 8 rows** (the term pass's group size; the builder may tune it from the pilot).
- **Per row, the model sees three things only:** the English headword; the Icelandic word the editor expects; and
  up to **5 sample sentences** where the editor's matcher finds the headword, **spread across chapters by a
  deterministic rule** so a homograph does not show one sense only. A sentence is the matching segment's English,
  reduced to the sentence around the match, markers stripped. **No domain label and no list of the concept's other
  terms:** every control is a physics or biology row and the population is chemistry, so a domain label would mark
  the controls; and the removed control rows have no live concept to supply other terms from.
- **The model does not see the MT.** The bought MT was produced under varying glossary arms, so it would anchor the
  judgment. It goes to [USER] instead (§8).
- **Prompt:** `tools/ai-review/prompts/glossary-prescreen-v1.md`, short and plain. Fable's guidance is that
  over-prescriptive prompts lower quality. It states the purpose (editor warnings), the verdict kinds below, and in
  plain words that a defensible alternative word is **not** a flag.
- **Answer** (JSON schema through `output_config.format`), one entry per row id:
  `verdict: fine | flag`; for a flag, `kind`: `wrong-sense` · `some-senses-only` (right in some sentences, wrong in
  others) · `wrong-register` (a symbol or unit given a word's translation) · `not-a-word` · `other-error`; a reason
  of at most two sentences; proposed Icelandic word(s) where it has one; for `some-senses-only`, the senses where
  the row is right.
- **Harness use name:** `glossary-prescreen`. Ruling set: the 2026-11-02 file, with its hash. Records go to
  `books/efnafraedi-2e/ai-review/runs/<runId>/`, with an extra record (`prescreen.json`) holding the population's
  hash, the control set and the sampling rule.

## 8. Census, full run and outputs

**Census (production, read-only).** A new `server/scripts/` script in the `read-term-resolutions.js` mould: sent on
stdin, database opened `readonly`, no file left behind. It runs the **real** `findTermsInSegments` for
`efnafraedi-2e` over chemistry's English segments, so tiling, the symbol rules, ties and the fallback tier are
exactly the editor's. Per English headword it prints: the expected Icelandic, domain, concept id, whether it is a
fallback or a tie, the concept's other terms, the match count, the matching segment ids, and what the resolver
offers for the same English string apart from this row (what the editor would show if the row were removed). Its
output is committed as evidence. [USER] runs nothing for it; it is a read-only check.

The census runs **per chapter, as the editor does** (`findTermsInSegments` takes the module's chapter), so a
chapter-level preference is seen where it applies. A census row is one **(English, expected Icelandic)** pair.

**Population.** The census rows that **can** raise an editor warning (an in-scope winner, so the editor shows its
word as the expected one at every match) and that no person has decided. Out:
- rows whose English is ruled in the ruling set;
- physics and biology rows, unless [USER] decides after the pilot to include them (§2);
- **fallback rows** (domains outside the chain): they raise **no** warning and no report line, since the warning
  path skips them (`terminologyService.js`, `if (hit.isFallback || !seg.isContent) continue;`). Editors see them
  only as a "from another subject" highlight;
- **ties** (two equally ranked words, no single expected word): settling those is the preference interface's job;
- rows whose expected word comes from a **`book_term_preference`** (book- or chapter-level): a person chose it.

Each excluded group is counted in the report, so nothing is left out silently.

**Full run.** Batch, on the chosen model, all population rows plus the controls mixed in. Afterwards every
population row id must have exactly one verdict. Rows left without one (a refused or truncated group) are re-sent
once as single-row interactive requests; any still without one are **unjudged**, shown as open, never as fine. A
control missed in the full run is reported at the top of the report and the page.

**Public and private ([USER]'s 2026-10-31 rule, applied).** The repository is public, and Íðorðabankinn's rows have
not been checked for re-release; on 2026-10-31 [USER] kept a full concept-model file private and committed only a
reduced copy. So **nothing this work commits carries concept-model data beyond what the committed export
(`glossary-unified.json`) already publishes**. The committed census keeps only rows whose (English, Icelandic) pair
is in that export, with English, expected Icelandic, domain and concept id from the concept model; every other row
(fallback rows from other domains, ties, pairs changed since the export) is replaced by its count, as on
2026-10-31. The model's input is (English, Icelandic) pairs plus OpenStax English, so the run records add nothing
new. The census fields the export does not carry (what the editor would show if a row were removed, the concept's
other terms), and the withheld rows themselves, stay in a **private** census file outside the repository, located
in project memory as the 2026-10-31 full file is, and reach only the private review page.

**Outputs (committed, in `experiments/terminology-consistency/results/<date>/`):** the reduced census; the verdicts
(one per population row: a verdict or `unjudged`); a short report (row counts by verdict and kind, the excluded
groups' counts, control results, model comparison, cost in USD from the run records and in ISK at a rate the report
names with its source and date).

**The review page** (an Artifact with saved answers, per the project's review-page practice): flagged rows only.
Per row: English, expected Icelandic, domain, the verdict kind and reason, the proposed word(s), the sample
sentences, what the editor would show if the row were removed, and a **free count** from the bought MT
(`02-mt-output`) over the matching segments: how often the current word and each proposed word appear, by an
existing inflection-aware matcher whose blind spot (compounds) the page states. Choices per row: keep as is ·
replace with … · remove the headword · keep it only for these phrases … · not sure; plus a comment. Each batch of
rows has its own explicit confirm; an unanswered row is **open**, never accepted. Answers are read back and frozen
as a committed JSON file.

## 9. After [USER] rules (not this design)

The fixes go into the concept model through a committed, dry-run-by-default script that [USER] runs on production
(10-10 plan 1.5), in the mould of `server/scripts/remove-wrong-sense-headwords.js`: change a `concept_term` text,
delete an English headword row, or add a chemistry concept that outranks a lower one. Never through
`terminology_translations.status` (inert) and never through SQL on `book_domain_priority` (reverted on boot).
Removing a row can promote a worse sibling (§C128, §C133), which is why the page shows the fallback.

## 10. Findings to log in the register (out of scope here)

- **The editor's warnings are sense-blind.** The ruling set's senses are read by the AI gate (`gate.js`), not by
  `findTermsInSegments`, so by the code `addition → álagning` is offered at every whole-word *addition*. Counted
  locally on 2026-11-17 over chemistry's English: of about 130 segments, **5** use the addition-reaction sense the
  ruling covers (all in ch20); 67 are "addition of" (adding something), 47 "in addition", the rest arithmetic.
  Read from the code and counted, not observed in the editor.
- **§C129's coverage cannot be re-derived.** Only its removal set was frozen. Today's export holds 1,297 physics
  and biology rows against the 1,213 §C129 kept, so some may postdate it (or the counts differ by matcher); which
  ones cannot be told from the committed record.

## 11. Decided, and left to the builder

**Decided by [USER] (2026-11-10, 2026-11-17):** the pre-screen is wanted; the run is private (outside both grants);
[USER] rules only the flags; clear errors only (option A); approach 1; Fable 5.2 if the pilot shows it is
beneficial; fixes through a committed script [USER] runs on production.

**Claude's calls (correct any):** the named controls and their sentences (§5); the population's exclusions,
including fallback rows, ties and preference rows (§8); the pilot, with physics and biology rows measured, and its
gate on both models (§6); the stop-and-ask thresholds (450 rows, 25%) and the USD 5 margin; effort `high`; about 8
rows and 5 sentences per request; the model sees only headword, word and sentences (no MT, no domain, no other
terms); re-send unjudged rows once; the public/private split (§8); the apply script designed after the rulings.

**For [USER] after the pilot:** whether the full run includes the physics and biology rows (§2), on their measured
flag rate and cost per row.

**Builder check (2026-11-17).** A fresh reviewer read the draft as its builder and raised three questions: whether
the drawn controls were really clear errors, and whether the domain label gave them away (answered: §5 names the
controls, §7 drops the label); what counts as a row, given fallback rows, ties and preferences (answered: §8,
after confirming in the code that fallback rows raise no warning); and whether the 2026-10-31 rule on Íðorðabankinn
rows applies to what this work commits (answered: §8, public and private).

**Left to the builder:** file and module layout inside `tools/ai-review/` (following `term-pass*.js`); the exact
sampling rule and sentence extraction; the census script's output shape; the page's build tool (the stage-1 page,
`experiments/terminology-consistency/stage1_page.py`, is a worked example); test layout (Vitest, test first).
