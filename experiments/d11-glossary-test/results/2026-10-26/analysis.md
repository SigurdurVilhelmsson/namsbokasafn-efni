# D11: the pre-registered analysis (2026-10-26)

The six runs bought on 26 October (3 arms × 2 runs, both modules in every run), analysed as DESIGN §8
pre-registered. The raw MT is **not committed** ([USER], 2026-10-26); it stays in the buy trees, which
are backed up and verified (register, 2026-10-26 afternoon entry). This file and `analysis.json` hold
only counts and key-terms entries, no running text.

## The result in brief

- **Primary (pre-registered): June's wire (M) is more consistent than no glossary.** On the nine
  TEXT-DRIFT terms, M made **8 of 8** eligible terms consistent in both runs; no glossary made
  **6 of 8** in both. The two arms' run ranges do not overlap, so by the pre-registered rule the effect
  counts. It holds under every matcher treatment tried (§ Sensitivity).
- **Secondary (pre-registered): not established.** Today's wire (S) scored 7 of 8 in both runs. Under
  the rule as fixed, S beats no glossary and M beats S. Both verdicts, however, depend on a matcher
  blind spot that favours one arm on *atom* (§ Sensitivity). Treated symmetrically, both contrasts
  overlap. DESIGN §8 expected M against S to be too small to call.
- **The whole difference rests on two terms, *atom* and *nonelectrolyte*.** The other six were
  consistent in every run of every arm, no glossary included.
- **Consistent is not correct.** On *atom*, M is consistent on *frumeind*, the word [USER] ruled
  against on 2026-10-10 (*atóm*). Without a glossary, the text is consistent on *raflausn* and
  *blanda*, words the rulings reject. See § What the glossary changed.
- **For DESIGN §1's question, D11 does not show that the July → September drop was a glossary effect.**
  September's m68667 buy carried no glossary (0 of 2 chunks), the same condition as the no-glossary arm.
  Yet it scored 0 of 8 against today's 6 of 8. Three explanations fit and D11 cannot separate them: a
  model change, a poor single draw, and regression to the mean (these nine were chosen because they
  drifted). What D11 does show is narrower. With today's model, at module scope, June's wire adds
  consistency on 2 of 8 terms over no glossary.

## Method

- **Data:** the six run trees in `~/d11-buy-2026-10-26` (the D11 runbook's folder). The English is
  byte-identical across all six (one hash per module), and every module pairs fully: m68667 has 214
  segments and m68781 59, with no English-only or Icelandic-only ids. Each tree's sidecars pass the
  truncation-retry check from DESIGN §7: every M and S chunk carried its glossary.
- **Instrument:** `experiments/terminology-consistency/measure.py`, unchanged, as DESIGN §8 names it.
  For each run and each taught term it reads:
  - **K**, the run's own Icelandic for the term's key-terms entry;
  - **prose**, the module segments whose English contains the term;
  - **own**, how many of those carry K, by the inflection-aware matcher.

  The matcher's 38-case self-test passed before measuring.
- **The adapter** (`../../analyse.py`) imports `measure.py` and replaces only its two file readers, so
  a run tree outside git reads as a vintage. All scoring is `measure.py`'s own.
- **The nine terms** are taken from `terminology-consistency/results/2026-10-10/classified-common.json`
  (class TEXT-DRIFT, modules m68667 and m68781), by module and definition id.
- **The decision rules were committed before any tree was measured** (`957e24287`, in `analyse.py`'s
  docstring):
  - *consistent* is the README's headline rule: own/prose ≥ 0.8, with prose ≥ 3. Fewer than 3 uses
    makes a term LOW-N, which is not counted.
  - The headline is each run's count of consistent terms among the nine.
  - **An arm effect counts only when the two arms' run ranges do not overlap.** This is how
    DESIGN §7's "an arm effect counts only beyond the difference between an arm's own two runs" was
    made into a rule.
- **Added after the first run, marked in the docstring, not touching the primary computation:**
  - **Context on the same population:** the D11 runs scored only on the segment ids that the June MT
    also has, like the June/September pair.
  - **The June-only table:** DESIGN §8 pre-registers it, but the first run left it out.

## Controls

| control | result |
|---|---|
| (a) The original git readers reproduce the 2026-10-10 numbers for the nine terms | exact, 9 of 9 |
| (b) A tree built from `98a5fe2ff`'s files scores as `98a5fe2ff` does through git | identical, all 22 taught terms |
| (c) A run's scores do not depend on which run it is paired with | identical, all 22 taught terms |
| Independent recompute (a separate agent's driver on `measure.py`, not `analyse.py`) | 54 of 54 cells agree; all three contrasts reproduce |

## Results: the nine TEXT-DRIFT terms

Own/prose per run (module scope; all segment ids; dissociation is LOW-N everywhere):

| term | r1-M | r2-M | r1-S | r2-S | r1-none | r2-none |
|---|---|---|---|---|---|---|
| atom (m68667) | 22/22 | 22/22 | 16/22 | 11/22 | 11/22 | 16/22 |
| heterogeneous mixture | 7/7 | 7/7 | 7/7 | 7/7 | 7/7 | 7/7 |
| homogeneous mixture | 7/7 | 7/7 | 7/7 | 7/7 | 7/7 | 7/7 |
| law of conservation of matter | 4/4 | 4/4 | 4/4 | 4/4 | 4/4 | 4/4 |
| dissociation (m68781), LOW-N | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 |
| electrolyte | 12/12 | 12/12 | 12/12 | 12/12 | 12/12 | 12/12 |
| nonelectrolyte | 4/4 | 4/4 | 4/4 | 4/4 | 0/4 | 0/4 |
| strong electrolyte | 5/5 | 5/5 | 5/5 | 5/5 | 5/5 | 5/5 |
| weak electrolyte | 3/3 | 3/3 | 3/3 | 3/3 | 3/3 | 3/3 |
| **consistent / eligible** | **8/8** | **8/8** | **7/8** | **7/8** | **6/8** | **6/8** |

| contrast | runs | rule (ranges must not overlap) |
|---|---|---|
| **M against no glossary (primary)** | [8, 8] against [6, 6] | **counts** |
| S against no glossary (secondary) | [7, 7] against [6, 6] | counts as fixed; not robust (§ Sensitivity) |
| M against S (secondary) | [8, 8] against [7, 7] | counts as fixed; not robust (§ Sensitivity) |

- **atom:** M's key-terms entry is *frumeind* in both runs, and its text agrees 22 of 22.
  - S's wire omits *atom*, a contested headword, so S sent no *atom* row. Its entry is *atóm*, and its
    scores (16, 11) are the same pair as no glossary's (11, 16).
  - So S against no glossary is not a test of S on *atom*, and M against S on *atom* is M's two values
    against none sent.
- **nonelectrolyte:** M and S both have the entry *órafkleyft efni*, with text agreeing 4 of 4.
  - No glossary's entry is *óraflausn*, and its text never uses it: it uses several coinages
    (*órafleysanleg*, *órafleiðandi*, *órafleysar*). This is a real disagreement between the key-terms
    page and the text, not a matcher artefact.

### Secondary (pre-registered)

- **All 22 taught terms of the two modules:** consistent/eligible M 19/20 and 19/20, S 18/20 and
  18/20, no glossary 17/20 and 17/20.
  - This is not independent evidence. Leaving out the nine, the other 13 terms are 11 of 12 eligible
    consistent in every run of every arm.
- **Segment-level difference rates:**
  - two runs of the same arm differ on 39.2% (M), 41.8% (S) and 42.1% (no glossary) of segments;
  - between arms: M against no glossary 55.4%, S against no glossary 54.0%, M against S 41.9%.
  - M against S is no larger than the run-to-run noise.
- **June-only terms** (where M's and S's wires differ): only *atom* has enough uses to read.
  - M carried *frumeind* in 22 of 22 prose segments in both runs.
  - S and no glossary carried *atóm* in 16 or 11 of 22, with *frumeind* in 0 or 8. The pairs match
    between those two arms: r1-S = r2-none and r2-S = r1-none.
  - *dilute* (1 use), *group* (0), *pH* (0), *emission* (1) and *ion* (1) are too rare to read. *ion*'s
    and *emission*'s zero matches are matcher blind spots (a 3-letter word; i-umlaut).

### Context (not pre-registered)

The committed MT vintages at the same module scope, scored on the segment ids June and September
share (the D11 runs scored on the same ids give the same counts as above):

| term | June MT | September MT |
|---|---|---|
| atom | 17/18 (*frumeind*) | 14/18 (*atóm*) |
| heterogeneous mixture | 7/7 | 0/7 |
| homogeneous mixture | 7/7 | 0/7 |
| law of conservation of matter | 4/4 | 2/4 |
| electrolyte | 12/12 | 3/12 |
| nonelectrolyte | 4/4 | 0/4 |
| strong electrolyte | 5/5 | 3/5 |
| weak electrolyte | 3/3 | 2/3 |
| **consistent / eligible** | **8/8** | **0/8** |

On these ids the D11 runs score M 8/8 and 8/8, S 7/8 and 7/8, and no glossary 6/8 and 6/8. In
September, the mixtures' key-terms entry said *efnablanda* and the text did not use it (0 of 7). Today's
no-glossary runs have the entry *blanda*, and their text agrees with it 7 of 7.

## Sensitivity: a matcher blind spot that favours M on *atom*

`measure.py` matches words of 5+ letters inside compounds, but a word of 3–4 letters only standing alone
(README, blind spots). M's entry *frumeind* (8 letters) is credited inside compounds: 6 of M's 22 hits
come from forms such as *gullfrumeind* and *vetnisfrumeindir*. S's and no glossary's entry *atóm* (4
letters) is not: in r1-S and r2-none all 6 misses are compounds such as *gullatóm* and *vetnisatóm*, and
in r2-S and r1-none 3 are. Re-measured independently in this session.

| treatment of *atom* | run counts M · S · no glossary | M vs no glossary | S vs no glossary | M vs S |
|---|---|---|---|---|
| the instrument as it stands | [8,8] · [7,7] · [6,6] | counts | counts | counts |
| compounds credited for *atóm* too | [8,8] · [8,7] · [6,7] | **counts** | overlap | overlap |
| no compounds credited for any word | [7,7] · [7,7] · [6,6] | **counts** | counts | overlap |

Rows 2 and 3 are hand-count probes from the independent recompute. The *atom* counts in row 2 were
re-measured in this session; row 3 covers all nine terms and was not.

The primary contrast holds under all three. The secondary contrasts change verdict with the treatment,
so they are reported as not established. The compound-for-*atóm* probe is a robustness check, not a
corrected matcher: it would fail the self-test's *efni*/*frumefni* negative.

## What the glossary changed: which word, not only how consistently (not pre-registered)

Each run is scored against its own key-terms entry, and those entries differ between M and no glossary
on 8 of the 9 terms. The consistency measure cannot see that. Against the rulings in force (the
2026-10-10 verdicts and the stage 1 answers, in
`terminology-consistency/results/2026-10-11/ruling-set-after-stage1.json`), the key-terms entry follows
the ruled word for six of the nine terms as follows:

| term (ruled word) | M | S | no glossary |
|---|---|---|---|
| atom (*atóm*; *frumeind* rejected) | *frumeind* ✗ | *atóm* ✓ | *atóm* ✓ |
| heterogeneous mixture (*misleit efnablanda*) | ✓ | ✓ | *misleit blanda* ✗ |
| homogeneous mixture (*einsleit efnablanda*) | ✓ | ✓ | *einsleit blanda* ✗ |
| dissociation (*klofnun*) | ✓ | ✓ | *sundrun* ✗ |
| electrolyte (*rafkleyfi*; *raflausn* rejected) | ✓ | ✓ | *raflausn* ✗ |
| nonelectrolyte (*órafkleyft efni*) | ✓ | ✓ | *óraflausn* ✗ |
| **entries following the ruling** | **5 of 6** | **6 of 6** | **1 of 6** |

The other three nine-terms (law of conservation, strong and weak electrolyte) have no ruling in that file.

## Caveats (state these alongside any number)

- **Two runs per arm.** Within-arm spread of the run counts is 0, so a one-term difference counts as an
  arm effect, though single-term shares vary a lot between runs (*atom* in S: 16/22 and 11/22).
- **Run-to-run noise is larger than assumed.** 39–42% of segments differ between two runs of one arm,
  against the 25.4% (§C133) DESIGN §7 relied on.
- **Module scope, not chapter scope.** DESIGN §8 pre-registers each module's text, but the
  2026-10-10 finding counted whole chapters. At chapter scope June was 7 of 9 (*dissociation* 6/9,
  *nonelectrolyte* 8/13); at module scope it is 8 of 8. Do not quote "June 8/8" next to the
  chapter-scope 401 → 365. Module scope keeps only part of the original prose (electrolyte 12 of 25
  uses, dissociation 1 of 9).
- **The non-overlap rule** was written into the docstring before measuring, but after the trees existed.
  Here it gives the same answer as any reading of DESIGN §7, because the within-arm spread is 0.
- **nonelectrolyte rests on 4 segments in one module.** M's and S's two-word entry *órafkleyft efni* is
  scored loosely (the matcher accepts the adjective plus any *efni* in the segment). No glossary's 0/4
  is unaffected.
- **Matcher blind spots** (README): short words in compounds (above), i-umlaut and other root changes,
  English verb forms of a noun headword.
- **Neither arm reproduces June's model or September's.** No sidecar records a model (DESIGN §7).
- **The key-terms reference changed** between June and September for 7 of the 9 terms (decision record).
- **The March file's wrong rows are part of what was tested** (DESIGN §7): *atom → frumeind* is one, and
  M obeyed it on every occurrence.

## Files and re-running

- `../../analyse.py`: the adapter and the analysis. The pre-registered part was committed as
  `957e24287` before measuring.
- `analysis.json`: every number above, the controls, and the context. It holds no segment text.

```
python3 -u experiments/d11-glossary-test/analyse.py --trees ~/d11-buy-2026-10-26 --controls --out experiments/d11-glossary-test/results/2026-10-26
```

The trees are not in the repository. The register records where they are backed up.
