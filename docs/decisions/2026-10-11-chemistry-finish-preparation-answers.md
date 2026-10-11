# Decision: chemistry's MT preparation takes the September base by default, with a pre-registered masked-test override; the follow-on project starts 1 November 2026; *trigonal planar* reverts to the official glossary's *þríhyrningslaga flatt*

- **Date:** 2026-10-11
- **Status:** Accepted
- **Context owners:** [USER] (every answer). The questions were prepared by the plan below and put to [USER] on 2026-10-11.
- **Supersedes:** the `trigonal planar` row of `docs/decisions/2026-09-21-chemistry-terminology-rulings.md` (*þríhyrnt flatt*). Every other ruling in that record stands.
- **Related:** `docs/plans/2026-10-10-chemistry-finish-preparation-plan.md` (§1 point 0, §5, §8 D0–D4 and D10, which this record answers) · the active register `docs/plans/2026-07-21-post-item17-followup-campaign.md` (its 2026-10-11 entry and §C200) · `server/lib/houseStyleTerms.js` + `server/__tests__/houseStyleTerms2026-09-21.test.js` · `server/migrations/051-house-style-terms.js` · `experiments/terminology-consistency/results/2026-10-10/verdicts-2026-10-10.json` (the review-page answers) · `experiments/mt-vintage-comparison/README.md` (the plan's evidence) · `docs/decisions/2026-09-26-pre-editor-pivot-translation-rulings.md` (no re-buy of bought terminology)

> **FROZEN EVIDENCE — banner-dated 2026-10-11.** This record is *evidence*, never status.
> It describes what was decided on that date and why. **If it disagrees with the active
> register in `docs/plans/`, the register wins** — this file is dated, the register is live.
> Do not sync it, do not update it, do not edit it. Supersede it instead.

## Question

The 2026-10-10 proposal asked how to finish chemistry's machine-translation preparation before editing
begins. Its §8 grouped the decisions by when they block work. The "now" group shapes the stage 1 review
page and the calendar:
- D0: the start date S;
- D1: the base text;
- D2: the scope of [USER]'s term verdicts;
- D3: the unruled headwords;
- D4: two answers that contradicted rulings in force;
- D10: the professional review of ch01–ch02.

Two practical questions were added: which cost plan governs the follow-on contract (Q7), and whether the
plan and its evidence could be committed (Q8). At stake:
- the funding boundary, because preparation before S can be paid from the current grant and after S
  is never follow-on paid hours;
- the research data, because the project is also an evaluation of AI-assisted MT, and its "human"
  category must hold only human text;
- what readers and editors see for two taught terms.

## Decision

[USER]'s answers, verbatim except that the follow-on grant's name is withheld (this repository names no
grant or fund):

| # | [USER]'s answer | What it settles |
|---|---|---|
| D0 | "Report October 31st, [follow-on] start November 1st." | **S = 2026-11-01.** The current grant's final report is aimed at 2026-10-31. |
| D1 | "Yes" | The **September MT is the base by default**. The June hybrid replaces it only if June wins about **6 of every 10 decisive pairs** in the masked blind test, so that the lower 95% bound is above 50%. The threshold is fixed before the test runs, and the test has not run. |
| D2 | "Yes" | [USER]'s verdicts apply **book-wide by default**. Exceptions (the `group` / `cell` homograph class) go in a machine-readable, test-pinned scope field that the AI gate enforces. |
| D3 | "Yes" | The **~131 unruled headwords** with enough running text are ruled as cards. The **64** with fewer than 3 occurrences and the **22** spelling-only pairs take the book-wide majority. |
| D4a | "Lewis-mynd" | ***Lewis structure* stays *Lewis-mynd*** (ruled 2026-09-19). This **overrides** the ch07 review-page answer, which picked the new entry *Lewis-bygging*. |
| D4b | "Þríhyrningslaga flatt (that is the translation in the official chemistry glossary)" | ***trigonal planar* becomes *þríhyrningslaga flatt***, reversing 2026-09-21's *þríhyrnt flatt*. It matches the ch07 review-page answer (the July entry). |
| D10 | "Yes, they are one level up" | **Only the segments the ch01–ch02 review actually touched count as human-reviewed.** The Word files are outside the repository, one level up. |
| Q7 | "Contract rules." | The **contract and its attached cost plan** govern timesheets and the final report. A differing cost plan on file is superseded. The detail is in the private, git-excluded funding companion. |
| Q8 | "Yes" | Commit the proposal and its evidence **locally, unchanged, before this record**, so the history shows the proposal as [USER] answered it. **No push.** |

## Reasoning

### D0: one boundary instead of two

The follow-on's work plan, which is part of its contract, starts its 12 months when the current grant's
project ends. The current grant's terms set its project's end at 30 June 2026. Its fund has told [USER]
that what remains of the grant can be used until the final report is delivered. A start date set
independently of the report would leave a gap no grant pays, or an overlap charged twice. Taking S as the
day after the report makes them one edge. The plan's calendar counts from S, so the freeze, which must
land before the first unit is opened, falls about S+4–5 weeks, around 29 November to 6 December 2026.

### D1–D3: as recommended

[USER] accepted the plan's recommendations. Their reasoning is in plan §1–§3 and its evidence directory,
and is not restated here. One point bears on the paper. The D1 threshold is deliberately asymmetric: a
small reading-quality edge for June would not pay for the carry machinery, a superseding decision and
mixed provenance. Writing the threshold down before the test runs is what makes the test a test, which
is why this record states the September base as a default and not as the outcome.

### D4a: the ruling stands over the review-page answer

The ch07 card offered July's *Lewis mynd*, which matched the 2026-09-19 ruling except for its hyphen,
and the new *Lewis-bygging*. [USER] picked the new entry on 2026-10-10 and confirmed the ruling on
2026-10-11. *Lewis-mynd* belongs to the project's "-mynd" family for structure drawings, alongside
*vokmynd* and *strikamynd*. Nothing in code changes: `houseStyleTerms.js` already holds *Lewis-mynd*, and
production holds only that house-style concept for the term. **The review-page export
(`verdicts-2026-10-10.json`) is frozen and still says *Lewis-bygging*,** so anything that compiles the
ruling set from it must apply this override.

### D4b: the ruling now follows the official glossary; the September MT is split

The 2026-09-21 record called this ruling **the one entry that overrides a form the model already
produces**: *þríhyrningslaga flatt* was already a chemistry row, and the committed MT wrote
*þríhyrningslaga* 36 times and *þríhyrnt flatt* 0 times. That record ended with *"Say so if that
reading is wrong."* [USER] has now chosen the official chemistry glossary's form. That ground carries the
decision on its own, because the model does not settle this term (below).

**The 36-to-0 does not show what the model produces.** Re-measured 2026-10-11 at the ruling's commit
(`fc448bd6c`), the 36 are exact-string tokens (ch07 11 · ch08 13 · ch18 5 · ch20 7). *þríhyrningslaga*
does not inflect, while *þríhyrnt flatt* is one form of a declinable phrase, so the count could not see
the same adjective in its other forms: ch07's MT, byte-identical then and now, already held 10 segments
with it. The 12 ch18 and ch20 tokens were in text that was re-bought later that day.

**The September MT, counted per segment, 2026-10-11** (`experiments/terminology-consistency/d4b_census.py`,
with its reviewed classification under `results/2026-10-11/`). Each `02-mt-output` segment is paired with
its `02-for-mt` English by SEG id. 44 segments say *trigonal planar* (58 occurrences; ch07 19 · ch08 13 ·
ch18 4 · ch19 2 · ch20 6):
- **22 carry the adjective *þríhyrndur*** in some inflection (ch07 10 · ch08 4 · ch18 4 · ch19 2 ·
  ch20 2), ch07's own key term *þríhyrndur planur* among them;
- **14 contain *þríhyrningslaga*,** 8 of them followed by a form of *flatur*;
- **8 use another *þríhyrnings-* compound** (*þríhyrningsplan*, *-flötur*, *-flatarmynd* and others).

The instrument is `[Þþ]ríhyrn[dt]\w*`, restricted to those 44 segments and read in context, because the
same adjective also renders *trigonal pyramidal* and *trigonal bipyramidal*. A literal search for
*þríhyrnt* finds 4 of the 22. Two ch07 ids occur twice in their module; counted by position, the split is
22 + 15 + 9 = 46.

**Which buys sent the term.** By the autorun log (`docs/handoffs/2026-09-19-chemistry-autorun-log.md`),
ch18's and ch19's `--glossary-only` subsets sent *trigonal planar*. Both chapters were bought on
2026-09-21 after export `7356fc019` (16:30Z), the first to carry *þríhyrnt flatt*, and all 5 of their
segments came back with the adjective. The buys that did not send the term were ch07 (a 3-term subset),
ch08 and ch20, plus the 2026-09-28 no-glossary top-up that added ch19's table summary. Their 39 segments
split 17 adjective, 14 *þríhyrningslaga* and 8 compounds. The provenance sidecars record each subset's
content hash, not its term list.

**Checked on production, read-only, 2026-10-11:** *trigonal planar* has exactly two concepts.
- Concept 5199: Íðorðabankinn, collection `EFNAFR`, *þríhyrningslaga flatt*.
- Concept 70230: the 2026-09-21 house-style row, *þríhyrnt flatt*.

No `book_term_preference` row references the house row, and no concept carries a `merged_into` pointer,
the one foreign key on `concept` without a cascade. The committed chemistry export shows *þríhyrnt flatt*
with reason `house-style`: it won §C164's same-domain tie-break.

**Mechanism.** This repository's convention is that a ruling which matches the stored lemma gets no
house-style entry: it would be a no-op row to maintain (`ALREADY_CORRECT` in the 2026-09-21 test). So the
reversal *deletes* the entry. Migration 051 retires a house-style concept whose entry has left the file,
and does so on every boot. The Íðorðabankinn concept then stands alone at chemistry's position, with no
tie. The review-page export's card for this term still carries `houseStyleRuling: þríhyrnt flatt`, a
snapshot of the ruling now reversed; its `targetIcelandic`, *þríhyrningslaga flatt*, is the answer.

**What it leaves to do.** 30 of the 44 segments (22 adjective, 8 compound) do not use the ruled form.
Where the adjective directly precedes a form of *flatur*, an exact swap is a rule-layer candidate only if
the plan's declension-class gate (3.1) admits an indeclinable target. The other renderings
(*þríhyrnt og flatneskjulegt*, *-flatarmynd*, the compounds) need rewording, which makes them AI-layer
or editor items. No re-buy: the 2026-09-26 record gave up re-buying bought terminology. The segment ids
are in the census's reviewed classification and in the register.

### D10: what the Word files actually contain

The plan assumed the reviewers worked in tracked changes. [USER] answered before anyone had opened the
files. **Measured 2026-10-11 by reading the files' XML** (25 files, one level up):
- **0 revision marks of any kind:** no insertions, deletions, moves or formatting changes. Track Changes
  is off in all 25 (explicitly off in the 17 with comments).
- 17 files carry **323 comments** (ch01 192, ch02 131), each file by a single author, dated
  **2025-09-25 to 2026-03-13**. Two of ch01's `w:date` stamps are in US format (`10/01/2025 …`,
  1 October), so a plain string minimum reports the start wrongly; the dates here are parsed, and they
  agree with `commentsExtensible.xml`'s UTC stamps.
- The other 8 carry no comments, no Word editing-session ids (rsids) and a 2025-01-24 metadata stamp
  (created = modified): ch01's answer key, ch02's section 2.7, and ch02's introduction and end matter.

**The principle is [USER]'s: only what the review touched counts as human.** How "touched" is read
without tracked changes is open, and the register owns it. Two things are already clear:
- **A comment is not an edit.** A segment that carries a comment but was not changed still holds the
  pre-review machine text. It enters the human layer only when an editor applies or accepts the change.
- **With Track Changes off, a direct edit leaves no mark.** Only a comparison with the text the reviewers
  started from can find one. The comment dates suggest that text predates the June vintage's March 2026
  API buys; that is a hypothesis to measure.

Whether ch01–ch02 then hold any human text, and who applies the comments under which funding line, go
back to [USER].

## Consequences

- **Calendar.** S = 2026-11-01. The freeze lands before the first unit is opened, around
  29 November to 6 December 2026. Both repositories are tagged on S. Preparation before S can be paid
  from what remains of the current grant; from S it is never follow-on paid hours.
- **Base.** The September MT is layer 1 unless the masked test's override fires. The carry tool
  (plan 2.1) is built only if it does.
- **Rulings.** The ruling set applied in stage 3 is [USER]'s verdicts, book-wide by default, minus the
  scoped exceptions, plus the house-style rulings, plus the rulings that keep the stored lemma and so
  have no house-style entry (this one among them). Where they disagree, the D4 answers above win.
- **Code.** The `trigonal planar` house-style entry is removed and its test updated. The concept model
  changes when the change is deployed and the server boots (051 runs); the export follows at the cron's
  next run. That is the repository's "a ruling is code" path. Readers see the ruled form only after the
  segments themselves are revised, re-rendered and synced.
- **Forecloses** *þríhyrnt flatt* as the book's form, and *Lewis-bygging*. Reversing either needs a new
  record and a code change.
- **Follow-up work** (D10's method and its questions to [USER], the exposed segments, the deploy, the
  stage 1 page) is tracked in the active register, not here.

## Alternatives considered

1. **S on a calendar date independent of the report** (signing, or "late October"). Rejected: the
   follow-on's own work plan ties its start to the current project's end, and two edges invite double
   charging or an unfunded gap.
2. **June as the base, or a per-chapter choice.** Not the default, for the reasons in plan §3. The June
   hybrid remains the pre-written outcome if the masked test's override fires. A blind test with a
   pre-written threshold replaces the per-chapter evaluation.
3. **Keep *þríhyrnt flatt*** (the 2026-09-21 ruling). Rejected by [USER] in favour of the official
   glossary's form.
4. **Adopt *Lewis-bygging*** (the review-page answer). Rejected by [USER]; the 2026-09-19 ruling stands.
5. **Count all of ch01–ch02 as human-reviewed.** Rejected: it would file untouched machine text in the
   research data's human category.
