# Taught-term consistency: July MT vs the 2026-09 re-MT (chemistry)

**Why this exists.** On 2026-10-10 [USER] previewed the re-rendered chemistry book and found that
the new MT translates the terms a chapter teaches less consistently than the MT readers have now:
*"consistent translation of terms being taught in each chapter is vital in a textbook."* The sync
was held for a whole-book measurement. This directory is that measurement. It is written to be
cited (CLAUDE.md § Purpose: the project is also a research evaluation of AI-assisted MT).

Status and decisions live in the active register, never here. This file states the **method**, its
**blind spots**, and the **result of the 2026-10-10 run** as frozen evidence.

## The two vintages

| | ref | glossary on the paid wire |
|---|---|---|
| **old** ("July") | `9a69414d5`, the last `main` commit before 2026-09-01. ⚠️ **ch20's old vintage is August, not July**: the 2026-08-12 C56 pilot re-MT (`c17bb7cfb`), arm unrecorded. A few modules elsewhere date from July re-MTs (2026-07-02, -07-13, -07-14). | **default ON**: `api-translate.js` at the March buy (`7658de896`) sent every approved `glossary-unified.json` term found in the chunk unless `--no-glossary` was passed. Per-run flags were not recorded; the sidecars of that vintage are a 2026-06-30 backfill with no arm. |
| **new** | `98a5fe2ff` (`origin/main`). The measured inputs (`02-mt-output`, `02-for-mt`, `houseStyleTerms.js`) are byte-identical to the held content branch's `bed24f441`, and the per-term results are identical. | per chapter, recorded in `02-mt-output/*-provenance.json`: ch03–ch04 `no-glossary`, every other chapter a small `glossary-only` subset |

The new vintage includes the 0-ISK hand repairs `f313fee32` and `8271886b0` and the §C183 top-ups.
Each vintage's Icelandic (`02-mt-output`) is paired with the English (`02-for-mt`) **from the same
commit**, by segment id.

**On the key-terms pages, the old vintage is what readers see.** This was measured on those 21
pages only; the body text was matched for ch01 1.4–1.6 in the preview session. `live_check.py`
searched the live key-terms page of all 21 chapters for each entry that differs between vintages: **269 old-only hits, 0 new-only**. Its
control, the same search over the locally rendered new pages, finds new-only hits in all 21
chapters (3–32 each). → `results/2026-10-10/live-check.txt`.

## Method

1. **Taught terms** are each chapter's own end-of-chapter key-terms list: the CNXML
   `<glossary><definition>` entries OpenStax wrote. They reach the segment files as
   `glossary-term:<definitionId>-term` segments, with ids stable across vintages.
   **Nothing is hand-curated**, and `glossary-unified.json` is **not** the reference. It is blind
   wherever an approved row is wrong (`accuracy → nákvæmni`, the same word as precision, scored the
   ch01 regression as an improvement).
2. For each vintage *v* and each taught term *t* (`measure.py`):
   - **K_v**: the Icelandic headword the chapter's key-terms page gives *t*;
   - **prose**: the segments whose English contains *t*'s headword (word-bounded, plural-tolerant,
     parenthetical stripped), excluding the glossary entries themselves;
   - **own**: the prose segments whose Icelandic carries K_v (stem match, below);
   - **other**: the prose segments carrying the *other* vintage's K (only when K changed);
   - **defSites**: the Icelandic at *t*'s bold in-text definition, paired positionally with the
     English term marker in the same segment;
   - **ruled**: the prose segments carrying [USER]'s house-style ruling for *t*
     (`server/lib/houseStyleTerms.js` at the new ref), when one covers *t*.
3. **Consistency** (the headline): a term is *consistent* in a vintage when at least 80% of its
   prose carries that vintage's own key-terms entry. In other words, the key-terms page and the
   chapter text agree. Counted only for terms with at least 3 prose occurrences in both vintages.
4. **Classes** (`classify.py`, documented in its docstring), in evaluation order:
   `RULING-BROKEN-NEW/-BOTH`, `RULED-APPLIED`, `TEXT-RENAMED`, `TEXT-DRIFT`, `KEYTERM-SPLIT`,
   `KEYTERM-FIXED`, `KEYTERM-OTHER`, `TEXT-GAIN`, `STABLE`, `LOW-N`. **A ruling only classifies
   when it matches the term exactly.** Several rulings are scoped to one sense or one chapter
   (`cell → ker` must not reach `unit cell`; `group → flokkur` is ch02's), so partial matches are
   reported, never acted on.

This measures **consistency, not correctness**. A vintage that is consistently wrong scores well.
Which Icelandic word is right is a ruling, and the K_old ≠ K_new rows are the list to rule on.

### Validation

Re-run on ch01 before trusting the book. It reproduces the preview finding:
- accuracy *hittni → nákvæmni*;
- dimensional analysis *einingagreining → víddagreining*;
- precision's prose flat at *nákvæmni*.

For rounding it reproduces only the key-terms entry change (*sléttun → afrúning*). The prose shift
the preview found (*námunda → rúnna*) is outside this instrument's reach, because "rounded" and
"round" do not match the noun headword *rounding* (see blind spots).

It also surfaced precision's new bold definition, *réttvísi*, and the new section title
*"Óvissa, nákvæmni og nákvæmni mælinga"* (accuracy and precision both *nákvæmni*).

### Blind spots (state these alongside any number)

- **Stem matcher.** A stem is a word minus its last two letters, minimum four. A u-umlaut variant
  (first *a → ö*) is also accepted, so *stafur/stöfum* match. Other root-changing inflection
  (ablaut, i-umlaut) is missed and reads as inconsistency. Short headwords can over-match: *blanda*
  is inside *efnablanda*.
- **English matching.** The headword pattern sees everyday senses too: *gas* in "gas mileage"
  (*bensín*). Inflected verb forms of a noun headword are not matched: "rounded" does not count
  for *rounding*.
- **Positional term pairing.** A definition site is paired only when the segment has the same
  number of term markers in both languages. Otherwise it is reported as `<unpaired>`.
- **EN changed under a stable id.** This is not detected, only mitigated by same-commit pairing.
- **Prose counts differ between vintages** because the new extraction emits more segments (alts,
  table summaries). Shares are compared, never raw counts.
- **Thresholds** (`MIN_N` 3, `DROP` 0.2, `ESTABLISHED` 0.6, `RULED` 0.8) are judgement, not
  measurement. They are stored in the result file. Read the `misses` examples before acting on
  any single row.

## Result of the 2026-10-10 run

Files in `results/2026-10-10/`:
- `classified-common.json`, the **headline population**: only segment ids present in both vintages;
- `classified-all.json`: every segment;
- `classify-*.txt`: per-chapter class counts;
- `decomposition-common.txt`: lost and gained terms by class;
- `live-check.txt`: the live check and its control.

**Why the headline uses common ids.** The new vintage carries segment classes the July MT never
had: figure alts (723 term hits) and table summaries (145). Those are short and context-poor, the
exact shape that drifts. The common population removes them; the all-segments run is reported
beside it. They agree:

| population | consistent taught terms, old → new |
|---|---|
| common ids (headline) | **376 → 345 of 607** |
| all segments | 379 → 347 of 610 |

Every chapter moves the same way in both populations. **14 chapters are worse**: ch01–05, ch07,
ch09–15, ch17. **6 are better**: ch06, ch08, ch16, ch19, ch20, ch21. ch18 is unchanged.

**The net drop of 31 is 98 terms lost and 67 gained** (common ids). This decomposition was
computed from the result file, not by hand:

| | terms | by class |
|---|---|---|
| lost (consistent in July, not in the new MT) | 98 | 66 TEXT-DRIFT, 17 KEYTERM-SPLIT, 9 STABLE, 4 KEYTERM-OTHER, 2 RULING-BROKEN-NEW |
| gained (consistent in the new MT, not in July) | 67 | 33 KEYTERM-FIXED, 15 RULED-APPLIED, 15 TEXT-GAIN, 3 TEXT-RENAMED, 1 STABLE |

- A **KEYTERM-SPLIT** loss is one key-terms headword segment that disagrees with a chapter text
  which is itself fine. Repairing it costs one segment.
- A **TEXT-DRIFT** loss is the running text. That is the expensive class.
- The **gains** are real and sit where the new MT had help: rulings on the wire (15) and key-terms
  entries the text now matches (33).
- So "keep the July MT" is not free either. It would undo those gains, including [USER]'s rulings.

Largest net losses by chapter (common ids):

| chapter | glossary arm (new) | consistent old → new | lost / gained |
|---|---|---|---|
| ch07 | glossary-only | 28 → 18 of 37 | 12 / 2 |
| ch04 | **no-glossary** | 22 → 15 of 40 | 10 / 3 |
| ch05 | glossary-only | 19 → 13 of 26 | 7 / 1 |
| ch02 | glossary-only | 37 → 32 of 49 | 7 / 2 |
| ch11 | glossary-only | 19 → 14 of 29 | 8 / 3 |
| ch10 | glossary-only | 23 → 19 of 44 | 9 / 5 |
| ch15 | glossary-only | 6 → 3 of 11 | 3 / 0 |

Classes across the book (all segments; the common-id counts are in `classify-common.txt`):

| class | count | what it means |
|---|---|---|
| STABLE | 319 | no change |
| LOW-N | 152 | fewer than 3 prose occurrences |
| TEXT-DRIFT | 85 | the new text is less consistent |
| KEYTERM-SPLIT | 53 | the new key-terms entry disagrees with the new text, which kept the July word |
| KEYTERM-FIXED | 42 | the new text agrees with a changed entry better than July did |
| KEYTERM-OTHER | 40 | the entry changed in some other pattern |
| TEXT-RENAMED | 25 | a consistent switch to a different word, which needs a ruling, not a repair |
| TEXT-GAIN | 22 | agreement rose with the entry unchanged |
| RULED-APPLIED | 19 | the rulings worked as intended (e.g. *radioactive decay → geislasundrun*, *elementary reaction → grunnhvarf*) |
| RULING-BROKEN-NEW | 4 | the July text followed a ruling and the new text does not: *dimensional analysis*, *molecular compound*, *Lewis structure*, *trigonal planar*. Rulings are read as in force **now**; a ruling made after the September buy (plausibly *dimensional analysis*) is a repair target, not evidence that the buy ignored it |
| RULING-BROKEN-BOTH | 2 | neither vintage follows the ruling |

**Two mechanisms, observed, not proven:**
- **KEYTERM-SPLIT**: a key-terms headword is a short segment with no sentence around it. With the
  glossary off the wire, the model picked a context-free word: ch05 *temperature → hiti*,
  *calorimetry → hitamæling*, *thermal energy → hitaorka*, while the same chapter's text kept
  *hitastig / varmamæling / varmaorka*.
- **TEXT-DRIFT**: the running text itself moved. Examples: ch01 *accuracy*, ch04 *stoichiometry*,
  ch11 *electrolyte*, ch15 *complex ion*.

## Re-running

```bash
python3 -u experiments/terminology-consistency/measure.py --book efnafraedi-2e \
    --old-ref 9a69414d5 --new-ref <ref> [--common-ids] --out /path/book.json   # ~1 min, needs git + node
python3 experiments/terminology-consistency/classify.py /path/book.json /path/classified.json
python3 experiments/terminology-consistency/live_check.py /path/classified.json /path/scratch
python3 experiments/terminology-consistency/live_check.py /path/classified.json /path/scratch --control
```
Judge a measure run by its `"complete": true` marker, never by its exit code.
