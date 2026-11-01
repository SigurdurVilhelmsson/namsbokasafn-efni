# Stoichiometry sense census, 2026-11-01

The evidence behind `docs/decisions/2026-11-01-stoichiometry-subject-sense.md`: every English use of
*stoichiometr…* in efnafraedi-2e, sorted by sense, and [USER]'s answers. Read-only, 0 USD, no network.

## Why it was run

In the paid ch10 re-run's blind check (2026-11-01), [USER] twice preferred plain *hlutfallið* over the
ruled *hlutfallaefnafræðina* where the English used *stoichiometry* for one compound's ratio ("The term
may be correct, but the original is plain speech"). Before ruling, [USER] asked for a count of every use
by sense.

## Files

| File | What it is |
|---|---|
| `stoich-census.mjs` | The census. `node stoich-census.mjs <absolute repo root> <out.json>`. It reads the AI term pass's own inputs (`readChapterInputs`: layer 1 + overlay, `02-for-mt` English) and uses its matching (`worklist.js` `matchesOccurrence`, `isCandidate`), against the 2026-11-01 ruling set, which is now pinned in the script. On 2026-11-01 it read the runner's default, which was that set then. A re-run after pinning reproduced `stoich-census.json` byte for byte. |
| `stoich-census.json` | 132 English records with *stoichiometr…*. 78 match the `stoichiometry` ruling, and 74 of those were candidates under the unsensed ruling (the other 4, three titles and a section list item, already carry *hlutfallaefnafræði*). The 54 it does not match hold only *stoichiometric* (51), *nonstoichiometric* (2) or the plural *stoichiometries* (1, ch10, a ratio use). 15 of them match `stoichiometric factor`; 39 match no ruling. |
| `build-stoich-page.py`, `stoich-template.html` → `stoich-sense-check.html` | The review page builder: `python3 -I build-stoich-page.py stoich-census.json stoich-template.html <page.html> <items.json>`. A re-run reproduced the page and `stoich-items.json` byte for byte. The proposed sort is Claude's reading of each English context: the `TOPIC`, `MIXED` and `HEAD` sets in the builder, with everything else ratio. |
| `stoich-items.json` | The page's 78 items with the proposed sense. |
| `db/` | The page's database as [USER] left it, saved verbatim with `ArtifactData` (`out_dir`). The published page is https://claude.ai/artifact/89arx1KmEAHcJoZMwxR5M5. |
| `final_sort.py` → `final-sort-2026-11-01.json` | Applies [USER]'s confirmed flips to the proposal. It refuses if a flip document and its group's confirmed `flipped` list disagree; a control with one flip removed from a list refused as expected. |

## Result

- **Head term (question 1):** *hlutfallaefnafræði*. [USER]'s 2026-10-10 verdict stands: the key term names
  the subject. The machine translation's *magnhlutföll* remains a competitor.
- **The ruling (question 2):** restrict it to the subject sense, as was done for *heat*. [USER]'s note:
  "Hlutföll and magnhlutföll could both be suitable replacements depending on context."
- **The sort:** proposed 18 subject / 3 mixed / 56 ratio / 1 key term. [USER] moved 7 items, giving the
  final **20 subject / 4 mixed / 53 ratio / 1 key term**.
  - ratio → subject: s22, s32, s49, s54;
  - ratio → mixed: s03;
  - subject → ratio: s05, s06.
- A `flips/` document at version 2 records a flip [USER] made and then took back. Its sense is the
  proposal's, and its group's list does not name it.

## Blind spots

- The sort is per segment, not per occurrence. A *mixed* segment holds both senses, but which use is
  which was not recorded.
- The phrase *reaction stoichiometry calculations* was sorted both ways: s05 and s06 as ratio, s18 as
  subject. So the sense gloss uses neither reading as an example.
- The census reads layer 1 as committed in the working tree on 2026-11-01. Its Icelandic is the pure MT
  (plus overlay), not editors' text.
