# June MT vs September MT: what can be carried, what each costs to repair (2026-10-10)

> 🧊 **Frozen evidence, 2026-10-10.** This is a citable measurement, not status. Open work lives
> in the active register (`docs/plans/2026-07-21-post-item17-followup-campaign.md`).

**Question.** Chemistry has two machine-translation vintages. The **June** vintage (live on the
website, ref `9a69414d5`) was bought mostly in March 2026 under the older extraction. The
**September** vintage (ref `98a5fe2ff`) was bought after the 2026-08-30 re-extraction. The
taught-term measurement (`experiments/terminology-consistency/`) showed that the September text
holds its key terms less consistently (401 → 365 of 607). This directory measures what is needed
to choose a base text for editing:
1. Can June text be carried onto the new segment structure?
2. Which defects would come back with it?
3. How much terminology repair does each base need?
4. Can the human review that exists be re-attached?

**Method.** Five investigators measured, read-only, from git refs. Three of them (carry, defects,
burden) were re-derived by an independent verifier with its own parser and normaliser. A critic
then read all of it. Each investigator and verifier is an AI agent (Claude, run in Claude Code on
2026-10-10). Their reading samples are **AI judgements, not checked by a human**, unless this file
says otherwise. Where a verifier corrected a number, **this file gives the corrected value**.

## Results, with the definition beside each number

### 1. Carrying June text onto the September structure

*Unit:* unique segment key per module, first occurrence, the semantics of `tools/lib/seg-markers.cjs`.

| Measure | Value |
|---|---|
| September keys | 22,591 = June's 21,251 + 1,149 `alt` + 191 `table-summary` |
| Carriable (June segment with the same normalised English exists) | 21,248 (94.1%): same key 18,317 · `auto-N` table cells shifted by renumbering 2,435 · text match under another key 347 · aligned 149 |
| Clean conversions | 21,191. The gate is **structural only**: marker-kind multiset equals the new English, link targets match, no legacy residue. It cannot see wording, terminology or untranslated text. |
| Fallbacks to the September MT | 57 (56 where June's MT dropped or invented a marker, 1 legacy residue) |
| Share of September English prose covered | 70.0% of all visible characters; 99.7% excluding alts and table summaries, which only the September vintage has |
| Carried text identical to the September Icelandic | 12,117 segments, ~299k English characters (12.9% of carried characters) |
| Carried text that differs (the decision surface) | ~2.02M English characters = 87.1% of carried prose = 61.0% of all September prose |
| How much it differs (word-token similarity, by characters) | ≥0.95: 16.7% · 0.80–0.95: 69.6% · 0.50–0.80: 12.5% · <0.50: 1.2%. Mostly moderate rewording, not unrelated text. |
| Equation stores | identical in 121 of 121 modules (5,639 of 5,639 equations) |
| `HAND REPAIR` keys a carry would overwrite | 21 of 78. Only 9 are real wording/title rulings. The other 12 fix September-MT defects June never had. |

The carry is mechanically feasible at 0 ISK. The verifier reproduced every class label on all
22,591 keys, with no off-diagonal cell. Not reproducible, and not counted: a candidate "re-wrap"
rule for the fallbacks (41 vs 28 rescues, depending on unstated details).

### 2. Defects in each vintage

*Unit:* segment occurrences (June 21,536, September 22,876; 285 duplicate ids in each).

- **June was bought under the March glossary** (`5db701c92`: 617 approved terms, 6 short headwords, 0 wrong-sense headwords). Short-word and wrong-sense contamination first appears at `120352b07` (2026-08-12 16:00 UTC), after every June-vintage buy. Last-MT commits behind the June Icelandic: 150 March, 6 June, 9 July, 5 August.
- **Systematic wrong-sense renderings in June: a FLOOR of 102 segments** in the reusable set (all hits read by the verifier):
  - `addition → álagning` (a levy): 66;
  - `valence → girðit-`: 11;
  - `emission → útblástur` (exhaust) in spectral and nuclear senses: 25 in the reusable set (26 of 27 book-wide).
- **Every June defect class that would come back on reuse: a FLOOR of 125 segments** (6.76 per 1,000 reusable). That is those 102, plus 7 untranslated, 12 marker and 4 Greek-letter segments.
- **Both counts are floors.** Only 3 of the ~392 March rows that fire at least 5 times have been sense-checked. **The September text has had no equivalent wrong-sense census**, so the two vintages were not audited alike. Its known errors are anecdotal (see Blind spots).
- 🔴 **Two of those rows are still approved in the current glossary export (`98a5fe2ff`): `addition → álagning` and `valence → girðitala`.** They feed the editor's terminology flags and any future glossary use.
- **Untranslated prose:** June 7 (all in the ch00 preface, m68662). September 8 (ch21 ×7, ch08 ×1); 7 of those 8 are translated in June.
- **Marker damage:** June 16 segments (12 real). September 26, 24 of them in alts and table summaries (+237 invented `sub`, +92 `sup`).
- **Table cells:** ~3,000 cells were renumbered (2,502 keep their id but hold different text, 496 have new ids). 2,997 of 2,998 can be re-keyed by content; 19 are ambiguous. **Reusing June text by segment id would put wrong text in about 2,500 cells.**

### 3. Terminology repair burden per base

*Unit:* segment–term pair. *Decided terms:* [USER]'s 104 review-page verdicts plus the 31
`houseStyleTerms.js` rulings that exactly match a key-terms headword. Each term is counted only
in the chapter whose key-terms list carries it. *Matcher:* `measure.py`'s.

| Base | Pairs needing a change (measured) | After removing matcher artefacts (verifier) | Key-terms headwords to fix |
|---|---|---|---|
| June | 607 of 2,724 | ~532–539 | 23 of 136 |
| Hybrid (June where carriable, September elsewhere) | 754 of 3,092 | ~674–682 | 23 of 136 |
| September | 995 of 3,092 | ~910–918 | 64 of 136 |

🔴 **The ranking does not survive a change of scope** (critic, re-counted on ch01–ch21):
- adding the rulings outside burden's scope narrows the hybrid's lead over September from 241 to 179 pairs;
- applying the verdicts in every chapter reverses it, with September ahead by ~300. One term drives this: `atom → atóm`, where [USER] chose the September word, and June uses *frumeind* in 845 of 1,138 atom segments;
- the 217 headwords [USER] has not ruled swing the result by ~400 either way.

**So which base needs less terminology repair is decided by rulings, not by more measurement.**

⚠️ **The ruling-driven split is not a fair comparison of the two MT runs.** June's 351 ruling-driven pairs (September's 62) come from `houseStyleTerms.js` rulings, all 53 of them dated 2026-09-04 → 2026-09-27. That is after every June buy, so June could not carry them by construction. The verdict-driven pairs run the other way: June 256, September 933.
Also: [USER]'s verdicts conflict with two rulings in force (Lewis structure, trigonal planar).
The review page showed only the 104 terms that LOST consistency; the 68 that gained were never
answered.

Matcher artefacts the verifier found:
- `heat → varmi` is a 5-letter word, so compound-initial matches (*varmaflæði*) are missed, and the verb "to heat" is counted;
- `atom → atóm` misses compounds (*vetnisatóm*);
- `ether`, `hole` and `group` (in its everyday sense) are also affected.

### 4. Human review and re-attachment

- **137 segments carry human text** (ch01 in 4 of 7 modules, ch03 m68699/m68700, the ch05 title). All 137 re-attach by content to the September structure, 18 already equal the September MT, 28 need marker conversion, and 39 have a pending latest row (at least one is wrong: a title edit that makes chemistry "Eðlisfræði").
- `scripts/reattach-segment-edits.js` matches by id only, so it would place m68667's edit on the cell that now reads "Sr". Re-attachment must match by content.
- **ch02's professional review exists only in an off-repo Word file**; ch01's is partly off-repo.
- **The editor stores no active time.** `segment_edits.original_content` is whatever the client sends, `created_at` is overwritten on every re-save, and there is no origin column. Edit distance can be computed after the fact. Active working time cannot.

### 5. Production (read-only, measured 2026-10-10 over ssh)

- Chemistry `segment_edits`: 151 rows (112 approved, 38 pending, 1 rejected), the latest from 2026-08-06. **0 were created after 2026-08-30**, so nobody has edited the September MT and a base change orphans no editor work.
- Chemistry MT lock files on prod: 0 (control: biology has 1).
- The review page's per-chapter `chapters` collection is empty, so no per-chapter decisions exist.

### 6. Restated from results kept privately

The tooling and critic results quote grant budget lines, so the full files live in the
git-excluded `docs/grants/2026-10-10-plan-facts/`. Their non-budget findings:
- **Re-MT cost (estimates, not invoices):** the full book is 4,576,903 input characters, ≈ 45,769 ISK by `api-translate`'s estimate (10 ISK per 1,000 characters). That reconciles exactly with the September sidecars, at ≈ 35,807 ISK in API-metered units. A chapter costs ≈ 1,000–2,600 ISK.
- **Terminology drift occurs under both September glossary arms:** ch07 (computed subset) 28 → 17, ch04 (no glossary) 28 → 20 consistent terms. The 09-06 §C133 test found glossary vs none within noise. "The glossary killed the new MT" is therefore **not supported for the September arms and untested for June's arm**: the full March glossary has never been run on the current English. The model version is recorded in neither vintage's sidecars.
- **Targeted splice (June only where it carries a verdict's target and September does not):** 491 segments, 556 fixes. Scored against the verdicts it breaks 2; scored against all 53 rulings it breaks 35 (critic). Net ~530.
- **What code alone can reach:**
  - 263 of the 933 September misses contain the competing key-terms word;
  - BÍN holds 34 of 79 single-word targets as lemmas;
  - multi-word targets are skipped by the BÍN producer;
  - a gender change (*frumeind → atóm*) needs agreement changes nothing handles.
- **Editor terminology assistant:** 1 of 9 planned units is built (U2).

## Blind spots

- `measure.py`'s matcher misses short words inside compounds and some i-umlaut/ablaut forms (see its README).
- "Clean" in §1 is a structural gate, not a quality judgement.
- No accuracy or fluency comparison of June against September exists. The anecdotes cut both ways:
  - September: "simple cubic" → *rúmmiðjaða* (body-centred), *Tengifákeppni* for linkage isomers, a precision/accuracy flip;
  - June: the wrong-sense rows above, and *kolvetni* (carbohydrate) for hydrocarbon throughout ch20.
- The glossary arm behind the June text is **inferred** from the committed file at each MT commit. June's provenance sidecars record no arm and no cost.

## Files and how to re-run

- `results/2026-10-10/agents/`: the verbatim structured results of seven agents. Read each `verify_*` file alongside its `fact_*` file.
- `results/2026-10-10/data/`: the small aggregates the numbers above come from (per-chapter tables, fallbacks, hand-repair keys, wrong-sense hits, the critic's book-wide counts).
- `scripts/<agent>/`: the scripts as run.
  - They read both refs with `git show`/`git archive` and wrote to a session scratch directory, whose path is hard-coded near the top of each script. Edit it before re-running.
  - The 15 MB per-key carry classification (`classification.jsonl`) is not committed. `scripts/carryover/classify.py` produced it from the two refs; a re-run has not been checked for byte-identity.
- Not in the repo: the full scratch tree (≈380 MB, including per-key data and git caches) is kept off-repo under `~/.cache/namsbokasafn-audit/2026-10-10-plan-facts/`.
