# Decision: stoichiometry → hlutfallaefnafræði covers only the subject, and the key term keeps hlutfallaefnafræði

- **Date:** 2026-11-01
- **Status:** Accepted
- **Context owners:** [USER] (both decisions, on the Stoichiometry Sense Check review page); [CODE] (the census,
  the measurements and this record)
- **Supersedes:** none. It narrows the 2026-10-10 verdict's ruling (`experiments/terminology-consistency/results/2026-10-10/verdicts-2026-10-10.json#ch04_fs-idp127462672`,
  stoichiometry → hlutfallaefnafræði) to one sense, the way `docs/decisions/2026-10-29-heat-compounds-and-symbol-trims.md`
  narrowed heat. The verdict's target stands.
- **Related:**
  - `experiments/terminology-consistency/results/2026-11-01/stoichiometry-census/` (the census, the review page,
    [USER]'s answers as saved from its database, and the final sort);
  - `experiments/terminology-consistency/results/2026-11-02/scope-exceptions-2026-11-02.json` (the input that
    carries it out) and `ruling-set-2026-11-02.json` (the compiled set);
  - `experiments/terminology-consistency/results/2026-11-02/offer-diff-2026-11-02.{mjs,json}` (the measurement);
  - `experiments/ai-review-pilot/ch10-2026-11-01/blind-high-vs-xhigh.json` (items i05 and i13, which raised it);
  - `docs/decisions/2026-11-01-ai-term-pass-full-run-at-xhigh.md` (the full run this set feeds);
  - the active register's 2026-11-01 entries.

> **FROZEN EVIDENCE — banner-dated 2026-11-01.** This record is *evidence*, never status.
> It describes what was decided on that date and why. **If it disagrees with the active
> register in `docs/plans/`, the register wins** — this file is dated, the register is live.
> Do not sync it, do not update it, do not edit it. Supersede it instead.

## Question

The AI term pass applied stoichiometry → hlutfallaefnafræði to every use of the English word. In the paid ch10
re-run's blind check, [USER] twice preferred the side that wrote plain *hlutfallið* where the English used
*stoichiometry* for one compound's 1:1 ratio. i05: "The term may be correct, but the original is plain speech so
"hlutfallið" is better". i13: "As before, simple "hlutfallið" is correct from context". [USER] asked for every use
counted by sense before ruling.

There are two questions:
- should the ruling cover every use, or only the word as the name of the subject?
- should the key term keep hlutfallaefnafræði, given that the book's own definition is the ratio sense
  ("relationships between the amounts of reactants and products of a chemical reaction")?

At stake: what the pass suggests to editors in the 78 segments the ruling matches, and the ruling set's hash, which
has to settle before the prompt freeze.

## Decision

1. **The ruling covers only the subject sense.** Its ruled sense is `subject`, and the other sense is
   `amount-ratios` (the amount ratios of one particular reaction, compound or process).
   - Where the English uses the ratio sense, the pass makes no edit.
   - If the Icelandic there nevertheless writes hlutfallaefnafræði, the pass flags `target-other-sense`. The flag
     is recorded in the run's answers and change log.
   - The word there is the editors' to choose. [USER]'s note: "Hlutföll and magnhlutföll could both be suitable
     replacements depending on context."
2. **The key term keeps hlutfallaefnafræði.** [USER]'s 2026-10-10 verdict stands: the key term names the subject.
   *magnhlutföll*, which the machine translation writes there, stays as the ruling's competitor.

## Reasoning

### The census: most uses are the ratio sense
A free census over the term pass's own inputs and matching found 132 English records with *stoichiometr…*. The
ruling matches 78 of them (`stoichiometry-census/README.md`). Claude proposed a sense for each, and [USER] moved
7 of the 78:

| | Proposed | [USER]'s final sort |
|---|---|---|
| Subject (titles, the subject, the method) | 18 | 20 |
| Mixed (both senses in one segment) | 3 | 4 |
| Ratio (one reaction's, compound's or process's amounts) | 56 | 53 |
| The key term | 1 | 1 |

Under the unsensed ruling, all 53 ratio segments, and the ratio uses inside the 4 mixed ones, were open to a
suggestion of hlutfallaefnafræði. That is the substitution [USER] rejected twice in the blind check; both of those
segments (s33, s34) are in the ratio group.

### The key term
The book defines stoichiometry by the ratio sense. [USER] was asked whether to follow that definition
(magnhlutföll, which would need its own retarget) or keep the 10-10 verdict, and kept the verdict. So the target is
unchanged, and the sense gloss names the word alone as a key term as part of the subject sense. That way the
key-term segment, which has no context of its own, is judged under the sense [USER] ruled for it.

### How it is carried out
- **The vehicle is the exceptions file, not an amendments file.** The plan of 2026-11-01 said "amendments-2026-11-02",
  but the compiler's amendment operations (retarget, add, remove, forms) cannot carry a sense. Senses live in the
  exceptions file's `senses`, as becquerel and heat did on 2026-10-29. No target changes, so no amendment is
  needed. `scope-exceptions-2026-11-02.json` is the 2026-10-29 file plus one sense entry and one paragraph in
  `about`; the base and the three amendments files are those of 2026-11-01.
- **Why 2026-11-02:** the compiled set cannot be named `ruling-set-2026-11-01.json`. That set was used by the
  2026-11-01 ch10 runs, which pin it by sha256, and the compiler requires a dated name.
- **The glosses come from [USER]'s final sort, not from Claude's proposal.** The page proposed "reaction
  stoichiometry calculations" as a subject-sense example. [USER] sorted that phrase as ratio twice (s05, s06) and as
  subject once (s18), so neither gloss uses it. Every example the glosses do use is a phrase whose items the
  sort agrees on. They are kept English-only, like the other seven sensed rulings. [USER]'s note on hlutföll and
  magnhlutföll is kept in the sense's `source` and here.

### What the pass does differently
A sensed ruling is a candidate wherever it matches, because the model must judge the sense (`worklist.js`
`needsReview`). The prediction, written into the offer diff's header before it ran, was stoichiometry 74 → 78:
the four matching segments that already carry hlutfallaefnafræði would become candidates, and no other ruling
would change. The measurement agreed exactly. The four are the ch04 chapter title, the ch04 section title, the
ch09 section title and its list item.

### Checked against the tree, and not
**Checked:**
- recompiling the committed inputs reproduces the 2026-11-02 set byte for byte. It differs from the 2026-11-01 set
  only in stoichiometry's sense and one note (`tools/__tests__/ai-review-ruling-senses-2026-11-02.test.js`);
- the census re-run with its ruling set pinned reproduced `stoich-census.json` byte for byte;
- `final_sort.py` cross-checks every flip document against its group's confirmed list, and refused on a
  tampered copy (a control);
- the offer diff, as above.

**Not checked:** whether the model's sense judgements match [USER]'s sort. The model records one judgement per
sensed ruling per segment (prompt v2, `senses`), so the next run's answers can be compared with
`final-sort-2026-11-01.json`.

## Consequences

- **The ruling set's hash changes,** and `DEFAULT_RULING_SET` in `tools/ai-review/term-pass.js` now names the
  2026-11-02 set.
  - The 2026-11-01 ch10 runs still apply, but only with `--ruling-set` naming the 2026-11-01 set: the apply step
    refuses a run whose ruling set differs.
  - Whether ch10's output is re-run under this set is tracked in the register, not here.
- **The pass cannot write hlutföll or magnhlutföll.** It edits only toward a ruling's target, so fixing a ratio use
  is the editors' job. The 2026-10-28 record's suggestion view shows gate-accepted edits. Whether it also shows a
  `target-other-sense` flag is part of that view's design, which is tracked in the register, not here.
- **A mixed segment gets one judgement.** The schema records one sense per ruling per segment, so in the 4 mixed
  segments the model must pick one sense or answer `unclear`. Editors see any suggestion there and judge it.
- **One ratio use is outside the ruling.** The plural *stoichiometries* (1 record, ch10, a ratio use) does not
  match the ruling's only English form, which is harmless under this decision.
- **Reversal:** a newer exceptions file without the entry, then a recompile. This is free before the full run.
  After it, the run's suggestions under this set stay as they were made.
- **The prompt freeze** still waits on its own entry in the register. This decision settles the ruling set as far
  as stoichiometry is concerned.

## Alternatives considered

1. **Keep the ruling for every use.** Rejected: 53 of the 78 matching segments use the ratio sense, where [USER]
   prefers plain words over the subject's name.
2. **Follow the book's definition and make the key term magnhlutföll.** Offered on the review page; [USER] kept the
   2026-10-10 verdict instead.
3. **Scope the ruling by chapter** (an `exceptions` width). Rejected: the senses mix within chapters (ch04 has 7
   subject, 12 ratio and 3 mixed segments). Also, since 2026-10-26 a homograph is handled by sense, because the AI
   layer exists to read the context.
4. **An amendments file, as planned.** Not possible: no amendment operation carries a sense, and nothing is
   retargeted.
5. **The glosses as proposed on the review page.** Rejected: one of their examples is contradicted by [USER]'s sort.
