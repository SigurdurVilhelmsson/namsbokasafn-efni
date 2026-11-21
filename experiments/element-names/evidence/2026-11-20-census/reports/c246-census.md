# The term check under a 'word starts with the term' rule: a corpus census (measurement 15, §C246)

Measured 2026-11-21 on production at `844f13d2f`, read-only, by `instruments/c246-census.cjs` (3 runs; the corpus result, hashed per arm, was identical in every run). It runs the real term check over every chemistry segment as editors see it today, pending edits included, twice: as installed, and as a copy compiled from the same source with only `buildInflectionRegex` changed. The database file was opened read-only and was unchanged after the run.

**Population.** Today's state: **31,573 warnings** (29,113 `missing`, 2,460 `alternative`) over 1,646 terms, in 22,591 segments. A warning is one term in one segment. None of §C245's 59 held adds is in the database, so measurement 14's 151 compound warnings are not in these counts.

**The arms.** *Base*: the term counts if a word starts with it; its stored inflected forms still count only as whole words. *All*: the stored forms count as the start of a word too (§C246 design question 3).

**Controls, all passed.** The unchanged copy reproduces the installed check exactly over the whole corpus. No warning is added in either arm. Every removed warning has at least one enabling word, and no surviving warning has one (attribution 0/0 and 0/0). A planted control on `samsetning` (`composition`): `samsetningxqzv` and `samsetningefni` both warn today and both pass under the base rule, and the classifier calls them not-compound and compound.

## How each removed warning is classified

Each removed warning is judged by its best enabling word (a word of the segment that starts with a tested form): one real inflection or compound anywhere makes the pass legitimate. Words are labelled by these rules, in order, using BÍN (read-only) and the concept model's Icelandic terms:

1. **Inflection**: BÍN lists the word as a form of the term, or of a lemma the term itself belongs to (`gögn` → `gögnum`, lemma *gagn*).
2. **Compound**: the rest of the word, after an optional linking `-s-`, `-a-`, `-u-`, `-ar-`, `-ur-` or `-na-`, is a word BÍN knows or a concept-model term (four letters or more), or a noun BÍN knows (three letters).
3. **False pass**: BÍN knows the word, and it is an unrelated word (no lemma starts with the term), or only a non-noun (a derived verb or adjective: `jónast`, `prófaðu`), or a noun whose lemma is the term plus a short suffix that is not an ending (a derived noun: `merking`, `klóríð`).
4. **Inflection by ending**: BÍN does not know the word, and the rest is an inflection or article ending.
5. **Undecided**: none of these.

"True" (1, 2, 4) is a ceiling: *compound* only means the rest is a word, so it can hide a word that is a different concept. "False" is a floor, and *undecided* is mostly true (mostly compounds whose second part BÍN does not list). The rules were refined in three rounds on this same data, so they are heuristics; the false range below runs from the false count to false plus undecided.

## The base rule

**It removes 5,135 of the 31,573 warnings** (16.3%), across 418 of the 1,646 terms. Another **354** change from `missing` to `alternative` instead of disappearing: a known synonym now matches as a prefix.

| Term length | Removed | True | Undecided | False | False range |
|---|---:|---:|---:|---:|---|
| 1-2 | 113 | 87 | 7 | 19 | 16.8–23.0% |
| 3 | 468 | 375 | 62 | 31 | 6.6–19.9% |
| 4 | 924 | 825 | 79 | 20 | 2.2–10.7% |
| 5 | 1095 | 933 | 62 | 100 | 9.1–14.8% |
| 6-7 | 1229 | 1159 | 62 | 8 | 0.7–5.7% |
| 8-10 | 642 | 629 | 9 | 4 | 0.6–2.0% |
| 11+ | 586 | 583 | 3 | 0 | 0.0–0.5% |
| multi-part | 78 | 70 | 4 | 4 | 5.1–10.3% |
| **Total** | **5135** | 4661 | 288 | 186 | 3.6–9.2% |

**What drives the false and undecided counts** (the term, its class, its warnings):

- **1-2:** `u` false 19, `u` undecided 7
- **3:** `geimur` undecided 26, `jón` false 23, `jón` undecided 11, `blý` undecided 7, `bar` false 5, `bór` undecided 5
- **4:** `núll` undecided 29, `víxl` undecided 9, `próf` false 6, `oxun` undecided 6, `próf` undecided 6, `glas` undecided 4
- **5:** `merki` false 74, `vetni` undecided 35, `flóki` false 14, `tengi` undecided 8, `formerki` false 7, `títan` undecided 4
- **6-7:** `kolefni` undecided 14, `rafeind` undecided 8, `silfur` undecided 8, `halógen` undecided 6, `afoxun` undecided 6, `fosfór` undecided 5
- **8-10:** `jafnvægi` undecided 4, `efnasmíð` undecided 2, `snertill` undecided 2, `hlutfall` false 1, `efnafræði` false 1, `kólesteról` undecided 1
- **11+:** `efnasamband` undecided 1, `gildishvolf` undecided 1, `rafneikvæðni` undecided 1
- **multi-part:** `eyðandi víxl` false 4, `upphafs-` undecided 3, `tilrauna-` undecided 1

**15 of the false passes are §C245's old physics forms** (`german` 4, `sirkon` 4, `plúton` 3, `pólon` 2, `neódým` 1, `astat` 1): the check expects the old form, the text holds the official name (`germaníum`), and the rule would silence the warning. The text is right by the official list; §C245 ①'s nine replacement entries are the fix for those segments.

**Examples** (base arm; the word, the census's class, and its occurrences):

- **1-2:** `u` → `um` (derived-non-noun) ×24; `u` → `upp` (derived-non-noun) ×14; `u` → `umkringdum` (derived-non-noun) ×1; `u` → `umbeðnar` (derived-non-noun) ×1; `u` → `uppruna` (undecided) ×5; `u` → `uppruni` (undecided) ×2; `ás` → `ástönd` (undecided) ×2; `u` → `undiratómagna` (undecided) ×1
- **3:** `jón` → `jónast` (derived-non-noun) ×8; `jón` → `jónísk` (derived-non-noun) ×6; `bar` → `barín` (derived-noun) ×4; `jón` → `jónun` (derived-noun) ×4; `jón` → `jónunar` (derived-noun) ×4; `súr` → `súrnun` (derived-noun) ×3; `rúm` → `rúmfyllulíkan` (undecided) ×5; `rúm` → `rúmfyllilíkönum` (undecided) ×5; `rúm` → `rúmfyllulíkön` (undecided) ×5; `rúm` → `rúmfyllingarlíkön` (undecided) ×5
- **4:** `próf` → `prófaðu` (derived-non-noun) ×8; `jafn` → `jafnað` (derived-noun) ×8; `gull` → `gullna` (derived-non-noun) ×4; `klór` → `klóríð` (derived-noun) ×3; `ferð` → `ferðast` (derived-non-noun) ×3; `ljós` → `ljósgrá` (derived-non-noun) ×3; `núll` → `núllta` (undecided) ×33; `víxl` → `víxlunarmynstur` (undecided) ×17; `oxun` → `oxunarástöndum` (undecided) ×7; `oxun` → `oxunarástönd` (undecided) ×6
- **5:** `merki` → `merkingin` (derived-noun) ×106; `merki` → `merkingunni` (derived-noun) ×52; `merki` → `merkingar` (derived-noun) ×23; `merki` → `merkinguna` (derived-noun) ×16; `merki` → `merking` (derived-noun) ×10; `merki` → `merkingu` (derived-noun) ×9; `vetni` → `vetnisflúoríð` (undecided) ×14; `vetni` → `vetnisjoðíð` (undecided) ×4; `flúor` → `flúoríðjónir` (undecided) ×3; `tengi` → `tengisorkurnar` (undecided) ×3
- **6-7:** `skanna` → `skannanir` (unrelated-word) ×4; `german` → `germaníum` (derived-noun) ×3; `plúton` → `plútoníum` (derived-noun) ×3; `german` → `germaníums` (derived-noun) ×1; `sirkon` → `sirkoníum` (derived-noun) ×1; `plúton` → `plútoníums` (derived-noun) ×1; `halógen` → `halógena` (undecided) ×8; `kolefni` → `kolefnistetraklóríð` (undecided) ×6; `rafeind` → `rafeindapunktapörum` (undecided) ×6; `rafeind` → `rafeindapunktapör` (undecided) ×5
- **8-10:** `hlutfall` → `hlutfallslegt` (derived-non-noun) ×6; `tvískaut` → `tvískauta` (derived-non-noun) ×3; `efnafræði` → `efnafræðilegrar` (derived-non-noun) ×1; `kristall` → `kristallað` (derived-non-noun) ×1; `efnafræði` → `efnafræðingar` (derived-noun) ×1; `efnafræði` → `efnafræðingurinn` (derived-noun) ×1; `jafnvægi` → `jafnvægisör` (undecided) ×7; `snertill` → `snertillínubútur` (undecided) ×3; `efnasmíð` → `efnasmíði` (undecided) ×2; `kólesteról` → `kólesteróljoðíðs` (undecided) ×1
- **11+:** `rafneikvæðni` → `rafneikvæðninnar` (undecided) ×2; `efnasamband` → `efnasambandis` (undecided) ×1; `gildishvolf` → `gildishvolfssvigrúmum` (undecided) ×1; `gildishvolf` → `gildishvolfsatómsvigrúmunum` (undecided) ×1
- **multi-part:** `eyðandi víxl` → `eyðandi víxlun` (derived-noun) ×3; `eyðandi víxl` → `eyðandi víxlunar` (derived-noun) ×1; `upphafs-` → `upphafs-ph` (undecided) ×3; `tilrauna-` → `tilrauna-tokamak` (undecided) ×1

**The terms that lose the most warnings:**

| English | Expected | Warnings today | Removed | of them false |
|---|---|---:|---:|---:|
| hydrogen | `vetni` | 482 | 451 | 0 |
| carbon | `kolefni` | 251 | 243 | 0 |
| oxygen | `súrefni` | 241 | 236 | 0 |
| electron | `rafeind` | 178 | 172 | 0 |
| equal | `jafn` | 213 | 141 | 1 |
| equilibrium | `jafnvægi` | 143 | 126 | 0 |
| water | `vatn` | 135 | 110 | 0 |
| oxidation | `oxun` | 109 | 104 | 0 |
| chlorine | `klór` | 96 | 95 | 0 |
| gas | `gas` | 241 | 87 | 0 |
| label | `merki` | 109 | 85 | 74 |
| hydroxide | `hýdroxíð` | 160 | 79 | 0 |
| ionization | `jónun` | 102 | 71 | 0 |
| silver | `silfur` | 73 | 70 | 0 |
| axis | `ás` | 79 | 70 | 0 |
| fluorine | `flúor` | 68 | 68 | 0 |
| acidic | `súr` | 70 | 68 | 0 |
| data | `gögn` | 122 | 67 | 0 |
| rate law | `hraðalögmál` | 67 | 65 | 0 |
| nitrogen | `nitur` | 238 | 60 | 0 |

## Stored forms as prefixes too (the *all* arm)

It removes **1,697 more** warnings (6,832 in all), and another 427 change to `alternative`. The shared warnings keep their base-arm class: classifying them again under this arm relabels 68 of the base arm's false passes as true (a stored form such as `merkin` leaves a different rest of the word), so only the extra removals are classified here:

| Term length | Removed | True | Undecided | False | False range |
|---|---:|---:|---:|---:|---|
| 3 | 27 | 24 | 2 | 1 | 3.7–11.1% |
| 4 | 469 | 440 | 22 | 7 | 1.5–6.2% |
| 5 | 299 | 241 | 31 | 27 | 9.0–19.4% |
| 6-7 | 560 | 393 | 57 | 110 | 19.6–29.8% |
| 8-10 | 215 | 183 | 28 | 4 | 1.9–14.9% |
| 11+ | 127 | 116 | 11 | 0 | 0.0–8.7% |
| **Total** | **1697** | 1397 | 151 | 149 | 8.8–17.7% |

Its extra false passes come from short stored forms that start other words (the best enabling word of each extra removal classed false, with its warnings): `Hvarfa` → `hvarfast` ×70; `staðla` → `staðlaðar` ×16; `jarða` → `jarðalkalímálmar` ×10; `staðla` → `staðlaða` ×8; `jarða` → `jarðalkalímálma` ×6; `jarða` → `jarðalkalímálmarnir` ×4; `staðla` → `staðlað` ×4; `orku` → `orkurík` ×4. Most are unrelated words (`hvarfast` "to disappear", `staðlaðar` "standardised"); `jarðalkalímálmar` (alkaline earth metals) is a borderline case the classifier counts as false.

## Limits

- The classes are heuristics with a ceiling and a floor (above); a human review of the undecided and false lists decides any single case.
- Only chemistry was measured, and only today's text: a later edit or a new glossary row changes the counts.
- A warning removed by the rule may still be a correct one to remove for a reason the census does not see, or the reverse.
- Per the BÍN licensing decision, the per-word classes are not committed; rerun the instrument (it needs `tools/data/SHsnid.csv` on the box) to regenerate them.
