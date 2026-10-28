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
chapters (3–32 each). → `results/2026-10-10/live-check.txt`. The live check compares key-terms entry strings only, so the matcher correction below does not touch it.

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
   - **own**: the prose segments whose Icelandic carries K_v (inflection-aware match, below);
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

### The matcher, and its correction (2026-10-10)

`carries()` decides whether an Icelandic segment uses a key-terms entry. Every content word of the
entry must appear, as one of these:
- an **inflected form**: the word's stem (all but its last 3 letters for long words), then the
  rest of its root, then only letters Icelandic endings use (*efnablöndu*, *massatöluna*,
  *anjónarinnar*);
- for words of 5+ letters, the term as the **head of a compound** (*sinkkarbónat*,
  *staðalkerspennu*);
- for words of 6+ letters, the term as the **first part of a compound** (*hitastigssvið*,
  *miðjumálmatómsins*).

*a ↔ ö* is accepted at any position (u-umlaut), and *-lt/-nt/-rt* adjectives also match their
*-d* forms (*samgilt/samgildu*). `measure.py --selftest` holds 38 cases. The negatives are the
point: *einsleita blöndu*, *hiti/hitastig*, *efni/frumefni*, *sameind/sameiginlegt* and
*frumeind/frumefni* must not match. A measure run refuses to start if any case fails.

🔴 **The first published run used a cruder matcher, and [USER] caught it on the review page.**
That matcher took a raw prefix, searched anywhere in the text, and applied its *a → ö* swap to the
FIRST *a* only. So *efnablanda* became *efnöblan*, and the July text's *einsleita efnablöndu* was
scored as not using its own key term. (The new MT's *einsleita blöndu*, which drops *efna-*, is a
real miss.) `audit_inflection.py` measured the damage. It counts misses where every word of the
entry has a token sharing its first 5 letters: **983 such near-misses in the July text against 826
in the new**. The error was asymmetric and favoured the new MT. After the correction the counts
are 795 against 745, and the examples are dominated by real differences (*jónaefnasamband* vs
*jónaefni*, *Avogadrosartala* vs *Avogadros tala*). The first run's figures are superseded by the
ones below.

### Blind spots (state these alongside any number)

- **Short words in compounds.** A word of 3–4 letters must stand alone, inflected. Otherwise
  *efni* would match *frumefni* and *hiti* would match *hitastig*. The cost is that real uses are
  missed: *eter* in *díetýleter*, *hol* in *fjórfletningshol*, *vok* in *vokmyndir*,
  *lengd* in *lengdareiningar*. Three ruling rows (`RULING-BROKEN-BOTH` for *ether*, *hole*,
  *resonance*) are partly this artefact.
- **The converse over-match.** A word of 5+ letters matches as a compound head even when the
  compound is a different concept: *massi* inside *eðlismassi*.
- **Root changes other than u-umlaut** are missed: i-umlaut, ablaut, suppletion
  (*tönn/tennur*, *fótur/fætur*). Split spellings are missed too (*nettó jónajafna* vs
  *nettójónajafna*).
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
- `audit-inflection.txt`: the matcher's residual near-misses, with examples;
- `live-check.txt`: the live check and its control.

**Why the headline uses common ids.** The new vintage carries segment classes the July MT never
had: figure alts (723 term hits) and table summaries (145). Those are short and context-poor, the
exact shape that drifts. The common population removes them; the all-segments run is reported
beside it. They agree:

| population | consistent taught terms, old → new |
|---|---|
| common ids (headline) | **401 → 365 of 607** |
| all segments | 404 → 366 of 610 |

Every chapter moves the same way in both populations.
- **10 chapters are worse**: ch01, ch02, ch04, ch05, ch07, ch10, ch11, ch13, ch14, ch15.
- **7 are better**: ch03, ch06, ch08, ch16, ch19, ch20, ch21.
- **4 are unchanged**: ch09, ch12, ch17, ch18.

**The net drop of 36 is 104 terms lost and 68 gained** (common ids). This decomposition was
computed from the result file, not by hand:

| | terms | by class |
|---|---|---|
| lost (consistent in July, not in the new MT) | 104 | 69 TEXT-DRIFT, 19 KEYTERM-SPLIT, 9 STABLE, 3 KEYTERM-OTHER, 2 RULING-BROKEN-NEW, 2 RULING-BROKEN-BOTH |
| gained (consistent in the new MT, not in July) | 68 | 33 KEYTERM-FIXED, 16 TEXT-GAIN, 14 RULED-APPLIED, 5 TEXT-RENAMED |

- A **KEYTERM-SPLIT** loss is one key-terms headword segment that disagrees with a chapter text
  which is itself fine. Repairing it costs one segment.
- A **TEXT-DRIFT** loss is the running text. That is the expensive class.
- The **gains** are real and sit where the new MT had help: rulings on the wire (14) and key-terms
  entries the text now matches (33).
- So "keep the July MT" is not free either. It would undo those gains, including [USER]'s rulings.

Largest net losses by chapter (common ids):

| chapter | glossary arm (new) | consistent old → new | lost / gained |
|---|---|---|---|
| ch07 | glossary-only | 28 → 17 of 37 | 13 / 2 |
| ch04 | **no-glossary** | 28 → 20 of 40 | 11 / 3 |
| ch01 | glossary-only | 44 → 36 of 50 | 9 / 1 |
| ch05 | glossary-only | 19 → 13 of 26 | 7 / 1 |
| ch11 | glossary-only | 20 → 14 of 29 | 9 / 3 |
| ch02 | glossary-only | 40 → 35 of 49 | 8 / 3 |
| ch10 | glossary-only | 24 → 19 of 44 | 9 / 4 |
| ch15 | glossary-only | 9 → 5 of 11 | 4 / 0 |

Classes across the book (common ids; the all-segments counts are in `classify-all.txt`):

| class | count | what it means |
|---|---|---|
| STABLE | 317 | no change |
| LOW-N | 155 | fewer than 3 prose occurrences |
| TEXT-DRIFT | 80 | the new text is less consistent |
| KEYTERM-SPLIT | 50 | the new key-terms entry disagrees with the new text, which kept the July word |
| KEYTERM-FIXED | 41 | the new text agrees with a changed entry better than July did |
| KEYTERM-OTHER | 37 | the entry changed in some other pattern |
| TEXT-RENAMED | 33 | a consistent switch to a different word, which needs a ruling, not a repair |
| TEXT-GAIN | 23 | agreement rose with the entry unchanged |
| RULED-APPLIED | 17 | the rulings worked as intended (e.g. *radioactive decay → geislasundrun*, *elementary reaction → grunnhvarf*) |
| RULING-BROKEN-BOTH | 7 | neither vintage follows the ruling; partly the short-word blind spot (see above) |
| RULING-BROKEN-NEW | 3 | the July text followed a ruling and the new text does not: *dimensional analysis*, *molecular compound*, *Lewis structure*. Rulings are read as in force **now**; a ruling made after the September buy (plausibly *dimensional analysis*) is a repair target, not evidence that the buy ignored it |

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
python3 experiments/terminology-consistency/audit_inflection.py old|new   # residual matcher blindness
```
Judge a measure run by its `"complete": true` marker, never by its exit code.

## D4b: how the September MT renders *trigonal planar* (2026-10-11)

[USER] reversed the 2026-09-21 ruling *þríhyrnt flatt* to the official glossary's *þríhyrningslaga flatt*
(`docs/decisions/2026-10-11-chemistry-finish-preparation-answers.md`, D4b). This census sizes the work
that follows and tests the claim, inherited from the 2026-09-21 record, that the model already
produces the official form.

- **Instrument:** `d4b_census.py`. It pairs each `02-mt-output` segment with the same commit's
  `02-for-mt` English by SEG id (a duplicate id by position), keeps the segments whose English says
  *trigonal planar*, and reports three raw columns: the adjective *þríhyrndur* in any inflection,
  *þríhyrningslaga*, and other *þríhyrnings-* compounds.
- **The class is a reading, committed as data:** `results/2026-10-11/d4b-trigonal-planar-reviewed.json`.
  The raw columns overcount inside segments that also mention *trigonal pyramidal* or *bipyramidal*,
  which use the same adjective. With `--reviewed`, the script refuses (exit 1) unless the reviewed
  keys are exactly the population it finds; a one-row deletion was used as the control.
- **Result** (distinct segments; 46 by position, because two ch07 ids occur twice in their module):

  | | ch07 | ch08 | ch18 | ch19 | ch20 | total |
  |---|---|---|---|---|---|---|
  | adjective *þríhyrndur* | 10 | 4 | 4 | 2 | 2 | **22** |
  | *þríhyrningslaga* | 3 | 8 | 0 | 0 | 3 | **14** (8 followed by a form of *flatur*) |
  | other *þríhyrnings-* compound | 6 | 1 | 0 | 0 | 1 | **8** |

- **The earlier count was a spelling match.** A literal search for *þríhyrnt* finds 4 of the 22.
- **The model does not settle the term.** In the buys that did not send it (ch07, ch08, ch20, and
  ch19's no-glossary table-summary top-up), the 39 segments split 17 adjective, 14 *þríhyrningslaga*
  and 8 compounds. In the buys that sent *þríhyrnt flatt* (ch18, and ch19's main buy), all 5 came back
  with the adjective.
- **Blind spots:** a rendering with none of the three stems is visible only through the reading;
  positional ids (`entry:auto-N`) renumber when a module gains a segment.

```bash
python3 -I experiments/terminology-consistency/d4b_census.py --repo . \
    --reviewed experiments/terminology-consistency/results/2026-10-11/d4b-trigonal-planar-reviewed.json
```

## The stage 1 page (2026-10-11)

`compile_ruling_set.py` compiles every chemistry ruling in force into one dated file
(`results/2026-10-11/ruling-set-before-stage1.json`): entry and no-entry rulings alike, each with
its target, its competitor and its source. It applies [USER]'s D4 answers over the frozen
2026-10-10 verdicts and exits 1 on any conflict between sources. `stage1_page.py` builds the
stage 1 review page from that file, `undecided-217.json` and `classified-common.json`. The
bucketing rules (ruled elsewhere, spelling-only, low text, gained, card) and the book-wide-majority
default are in its docstring. Status lives in the register.

### The answers, frozen (2026-10-11, evening)

`export_stage1_answers.py <dump-dir> <page.html> <versions.json> <out.json>` turns a dump of the page's database (an `ArtifactData` list with `out_dir`) into `results/2026-10-11/stage1-answers-2026-10-11.json`. That file holds:
- **`answers`:** each answer as saved, with its db version and `target`, the word chosen;
- **`untouched`:** the default and gained rows with no answer, with the page's `proposed` word. They are `confirmed` only once [USER] pressed that tab's **Confirm this list** (`meta.confirm_defaults`, `meta.confirm_gained`), and `not-reviewed` otherwise. An empty row cannot tell "seen and accepted" from "not seen" (on 2026-10-11 [USER] had at first gone through only the first tab), so a `not-reviewed` row is never treated as an answer;
- **`open`:** what was not answered.

It also holds three checks, reported and never resolved:
- **`containsRuled`:** an answered or default headword that contains a ruled headword. A substring hit is not agreement: *hol* is a substring of *ferflötungshola*, which is a different lemma;
- **`sameHeadwordTwoTargets`:** one headword answered with two different words in two chapters;
- **`septemberCounts`:** occurrences of the chosen word in the September text. Only the citation form is counted, so the count is a floor.

`page.dataSha256` is the hash of the page passed in. The final export (all tabs answered, both lists confirmed) used Version 4; the 100 cards were answered on Version 2, whose hash is kept as `page.dataShaNote`. Item ids are the same in every version. Version 3 changed only the display of formula placeholders: `stage1_page.py` now shows `[formula]` where Version 2 showed the bare placeholder number, as in "(56)".

**Chat answers.** `results/2026-10-11/stage1-chat-answers-2026-10-11.json` holds [USER]'s answers to the seven questions the checks raised (2026-10-11, "I agree with your picks"). Each of its 17 rows names the page answer and the word that supersedes it. The compile step reads both files: a row in the chat file wins over the page answer for the same id.

### Stage 1 compiled (2026-10-11, late)

`compile_stage1_rulings.py <out.json>` writes `results/2026-10-11/ruling-set-after-stage1.json`. It reads the before-set (unchanged), the page answers and confirmed defaults, the chat answers, and `prod-term-resolutions-2026-10-11.json`. That last file is what prod's concept model resolves each headword to, read-only, by `server/scripts/read-term-resolutions.js`; the script's header shows how to run it on prod without copying a file there.

Each stage 1 ruling carries the stored word, a `class` (matches-stored, spelling-vs-stored, word-change, tied, unstored) and a `proposedMechanism` (none, preference, entry, replace-entry, concept-model-script, undecided). The script's docstring defines each one. Nothing is applied. A stage 1 target that contradicts a ruling in force exits 1 unless an explicit override names the record that reverses it; *bonding orbital* is the only one. The spelling test is `stage1_page.spelling_only`, imported rather than copied.


### The masked reading test, 1.7 (2026-10-11, night)

Pre-registered in `7204d2038`, before the first answer: the pairs, the rule and the scoring
script. The page's **Reading test** tab shows them one at a time. Answers go to the page's
`stage1_reading` collection as `{choice: A|B|equal|both_wrong, septGuess: A|B|unsure}`. The
database never holds a vintage.

- **`masked_test_sample.py`** draws the pairs. Its population is the frozen carry-over
  classifier's own output (`experiments/mt-vintage-comparison/scripts/carryover/`, run from a
  scratch copy; the docstring gives the steps). It does not re-implement the English-equality
  test. Before any exclusion it reproduced both counts the plan's threshold was sized against:
  **9,048** differing same-key non-cell pairs and **951** June-*frumeind* / September-*atóm* pairs.
- **Masking is by selection.** A pair is dropped when the two texts make a different term
  choice: a ruled, verdict, competitor or key-terms word is present in one text and absent from
  the other (u-umlaut folded, so *efnablanda* takes *efnablöndu*). Two looser predicates were
  measured first and rejected, because they dropped 89% and 79% of pairs on roots like *eind* and
  words like *með*. Funnel: 8,205 differ as displayed, **6,084 dropped for a term choice**,
  **2,121 eligible**. An assertion fails the run if any *frumeind*/*atóm* pair survives.
- **150 pairs**, seed `20261011`. Chapters get pairs in proportion to the eligible population,
  and a systematic sample spreads type and length. Identical boilerplate is deduplicated.
  `results/2026-10-11/masked-test-pairs.json` holds no vintage. The key (which side is June) is
  off-repo until the answers are frozen, at
  `~/.cache/namsbokasafn-audit/2026-10-11-masked-test/`. The script regenerates it byte for byte,
  and its sha256 is in the pairs file. **`masked_test_analyse.py` refuses a key whose sha256
  differs.**
- **Freezing is one command:** `masked_test_analyse.py --answers D` reads the
  `ArtifactData list collection=stage1_reading out_dir=D` dump directly, so no mapping step is
  written after the answers exist.
- **The rule** (D1, on the page above the first pair): the hybrid only if June wins ≥ 60% of
  decisive pairs **and** the 95% Wilson lower bound is above 0.5. `--table` prints the minimum
  wins for each n. **The September guess is asked per pair, not once at the end as the plan's 1.7
  text says.** A single end-of-test guess is a coin flip and cannot show that the masking failed.
  If the guesses are right with a Wilson lower bound above 0.5, the result is not used.
- **Controls run on the analyser before publishing:** a June sweep fires the override, a
  September sweep does not, all guesses right voids the result, and a tampered key is refused.
- **Blind spots:** a 3-letter term word inside a compound and other stem changes (i-umlaut) are
  not caught; other vintage fingerprints may remain (boilerplate wording, punctuation habits).
  The per-pair guess is the check on all of them. **It has a cost:** asking "which was September?"
  on every pair primes the reader to hunt for vintage while judging quality. The page mitigates
  this: the guess is disabled until the quality answer is picked. A reader who feels they were
  "spotting June" is seeing a known effect of the design. The test measures reading quality where the two
  texts agree on terms. It says nothing about term quality, which the rulings settle.

#### Amendment, 2026-10-14: the term mask missed a class (key-blind, at 30 of 150 answers)

[USER]'s notes on the first 30 pairs showed term choices the mask had not caught (*massagreinir*
against *massagreiningartæki*; *litíum* against *litín*, the one pair where a vintage was named).
A side-blind word diff of all 150 pairs found **39 such pairs**, listed with reasons in
`results/2026-10-11/masked-test-term-flags.json`. **The flags were written from the vintage-blind
pairs file and the diff only; the key was not opened.** They were committed before any further
answer, so neither the key nor answers 31–150 shaped them.

- **Two mechanisms.** (1) **34 unruled terms**: substance and element names, and chemistry or
  maths terms that no ruling, verdict or key-terms source covers, so the mask never had their
  words (*koltvíoxíð/koldíoxíð*, *natrín/natríum*, *jónafurð/jónamargfeldi*, *setta/mengi*).
  (2) **4 ruled terms the patterns could not follow**: a 4–5 letter word is matched whole, so
  *varmi* misses *varma*; *útblástur* misses *útblæstri* because i-umlaut (á→æ) is not folded;
  and two misspellings of *amfíprótísk* match neither. Plus **1 artefact**: p013 has the escaped
  entity `&lt;` on one side and in the English, where the other side has `<`.
- **Not flagged:** general vocabulary, grammar, word order, place and trade names, and the
  imperative form (singular *-ðu* against plural *-ið*), which differs systematically across
  several pairs but is a reading matter. The per-pair guess is the check on it.
- **The rule is applied twice** (`masked_test_analyse.py --exclude <flags>`): to every answered
  pair as registered, and to the pairs left after exclusion. **The override fires only if it
  fires on both.** That is never looser than either reading alone, keeps D1's asymmetry toward
  September, and avoids choosing a new primary after collection began. **Its cost, stated now:**
  a strong June lead on the clean pairs can still be blocked by losses on the flagged ones (a
  control with June winning 80 of the 111 clean pairs and none of the flagged ones does not fire).
  The masking check stays over all pairs, flagged ones included.
- **Controls run on the amended analyser** with a synthetic key (never the real one): June
  winning only through flagged pairs fires the registered reading and not the amended one (so no
  override); June winning everything fires both; the clean-only lead above fires only one.
- **Of the 30 answered, 5 are flagged**, which leaves about 111 clean pairs if the rest follow.
  At 100 decisive clean pairs June needs 60 wins. Nothing is re-sampled and nothing on the page
  changes for the reader.

#### Amendment, 2026-10-17: nine pairs differ in no word (key-blind, at 39 of 150 answers)

On p037 [USER] wrote *"I fail to see a difference"*. Its two sides differ only in the reaction
arrow (⟶ against →). A census over the vintage-blind pairs file found **9 pairs whose two sides
are not byte-equal but whose `\w+` tokens (NFKC, lower-cased) are equal**: p027, p037, p041,
p044, p045, p082, p124, p127, p140. They differ only in punctuation, case or spacing, so they
should not have entered a test drawn from pairs that differ in words. p027 also splits a
substance name into two words, which round 1's substance-name class already covers.

- They are appended to the same flag file as **round 2** (`class: no-word-difference`,
  `round: 2`; the file's `round2` object holds the predicate and `answeredWhenFlagged: 39`). Round
  1's 39 entries and its method are unchanged. The key was not opened.
- **Effect:** a flag set changes only the second (clean-pairs) reading, and can move it in either
  direction (removing a September win tilts the clean pairs toward June). The override stays
  bounded by the registered all-pairs reading, which no flag touches. 2 of the 9 were answered
  when flagged (p027, p037); 7 were not.
- **Sampler gap, for any re-use:** `masked_test_sample.py` admitted pairs that differ in no word.
  Its population should require a word difference.

#### Result, 2026-10-25: no override; the base stays the September MT

[USER] answered all 150 pairs (last answer 12:55:23Z). The answers were frozen first
(`results/2026-10-25/masked-test-answers/`, `f4cc44dfc`), then the key was committed
(`a858bfe71`; its sha256 equals the one recorded at pre-registration), then the analyser ran
once, with `--exclude` as amended on 2026-10-14. Its output is
`results/2026-10-25/masked-test-result.json`.

- **All 150 pairs:** June 66, September 66, equal 5, both wrong 13. Of 132 decisive pairs June
  won exactly half (0.50; Wilson lower bound 0.416); the rule needed 80. Does not fire.
- **After excluding the 48 flagged pairs:** June 45, September 48, equal 2, both wrong 7. Of 93
  decisive, June 0.484 (lower bound 0.385); the rule needed 56. Does not fire.
- **Masking held:** of the 67 pairs where a side was named as September, 31 were right and 36
  wrong (0.463; lower bound 0.349), and 83 were "can't tell". The result is usable.
- **Verdict, by the registered rule (D1): no override.** The September MT stays the base. Where
  the two vintages agree on terms, neither reads better than the other.
- Worth carrying into editing, though it decides nothing here: **13 of 150 pairs were judged
  "both wrong"** (7 of the 102 unflagged). [USER]'s 31 notes name the faults.
