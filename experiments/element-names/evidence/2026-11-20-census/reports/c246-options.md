# §C246's two open questions: an options census (measurement 16)

Measured 2026-11-21 on production at `844f13d2f`, read-only, by `instruments/c246-options.cjs`, with [USER]'s rulings of that day built in: the base rule (the term may start a word, its stored inflected forms only as whole words), a minimum term length of four letters, and the form `merki` excluded. It runs the real term check over every chemistry segment as editors see it today, as installed and as a copy compiled from the same source with the role-aware prefix rule patched in. The database file was opened read-only and was unchanged after the run. Method and classification as in measurement 15 (`c246-census.md`).

**Population.** 31,573 warnings today, **8,152 of them ties** (the resolver found several equally ranked answers, any of which passes).

**Controls, all passed.** The unchanged copy reproduces the installed check exactly over the whole corpus, and the installed check's corpus hash equals measurement 15's. No arm adds a warning or changes one in any way other than `missing` → `alternative`. Every removed warning has an enabling word and no surviving warning has one, in every arm.

## The arms

| Arm | Option | What takes the prefix | Removed | of them ties | `missing` → `alternative` | True | Undecided | False | False range |
|---|---|---|---:|---:|---:|---:|---:|---:|---|
| T1 | A1 | prefix for the winner, the tie options and alternatives; multi-word terms whole-phrase | 4,382 | 232 | 311 | 4,117 | 213 | 52 | 1.2–6.0% |
| T2 | A2 | prefix for the winner and the tie options; alternatives whole-word; multi-word terms whole-phrase | 4,382 | 232 | 0 | 4,117 | 213 | 52 | 1.2–6.0% |
| T3 | A3 | prefix for the winner only; multi-word terms whole-phrase | 4,150 | 0 | 0 | 3,950 | 165 | 35 | 0.8–4.8% |
| M1 | B2 | T1's roles, and multi-word and hyphenated terms take the prefix on the whole phrase | 4,460 | 237 | 319 | 4,187 | 217 | 56 | 1.3–6.1% |
| M2 | B3 | T1's roles, and multi-word and hyphenated terms take it only when the last word has four letters or more | 4,451 | 233 | 315 | 4,182 | 213 | 56 | 1.3–6.0% |

Option B1 (multi-word and hyphenated terms stay whole-phrase) is what T1–T3 measure.

## Question A: which uses of a form take the prefix

**Alternatives remove nothing.** T1 and T2 remove the identical set of 4,382 warnings. What alternatives change is the wording: under T1, 311 warnings turn from `missing` into `alternative` (the editor is told a known synonym was used), because a synonym now matches as the start of a word. The most frequent (English, expected, the synonym it would name, warnings):

- nitrogen → `nitur`, would say `köfnunarefni`: 89
- valence → `gildistala`, would say `gildi`: 89
- laboratory → `rannsóknarstofa`, would say `rannsókna`: 11
- electrode → `raftroð`, would say `rafskaut`: 11
- research → `rannsóknir`, would say `rannsókn`: 10
- principal quantum number → `höfuðskammtatala`, would say `aðalskammtatala`: 10
- solid → `fast efni`, would say `heill`: 7
- process → `ferli`, would say `hvarf`: 6
- titrant → `títrantur`, would say `títrunarlausn`: 5
- anode → `anóða`, would say `forskaut`: 5

**The tie options.** T1 removes 232 warnings that T3 keeps, all of them ties where a tied answer matched as the start of a word: 167 true, 48 undecided, 17 false, a false range of **7.3–28.0%**. The terms behind most of them (English → expected, warnings):

glass → `glas` 35, zero → `núll` 30, test → `próf` 15, sugar → `sykra` 13, sample → `álestur` 12, surface → `flötur` 12, radio → `hljóðvarp` 10, H → `henrý` 8, expand → `liða` 7, contact → `raftengi` 6.

Examples (the word, its class, warnings): `núll` → `núllta` (undecided) ×29; `sykur` → `sykurs` (true) ×7; `þenja` → `þenjast` (true) ×7; `sýni` → `sýnir` (true) ×7; `snerta` → `snertast` (true) ×6; `yfirborð` → `yfirborðsflatarmál` (true) ×6; `gler` → `glerrör` (true) ×6; `próf` → `prófaðu` (false) ×4; `útvarp` → `útvarpsbylgjur` (true) ×4; `gler` → `glerílát` (true) ×4.

## Question B: multi-word and hyphenated terms

- **M1 (B2):** 78 more removals than T1. Hyphenated 36 (32 true, 4 undecided, 0 false); multi-word 42 (38 true, 0 undecided, 4 false).
- **M2 (B3):** 69 more removals than T1. Hyphenated 32 (32 true, 0 undecided, 0 false); multi-word 37 (33 true, 0 undecided, 4 false).

Under M1, by term (the term, its class, warnings): `Lewis-mynd` true 20, `takmarkandi hvarfefni` true 14, `oxunar-afoxunarhvarf` true 11, `einsetulögmál Pauli` true 6, `eyðandi víxl` false 4, `sýrubindandi lyf` true 4, `eyðandi víxl` true 3, `upphafs-` undecided 3, `stig efnahvarfs` true 2, `samoka sýra` true 2, `samoka basi` true 2, `jónandi geislun` true 2, `Hamilton-virki` true 1, `fjölatóma jón` true 1, `heildarstig efnahvarfs` true 1, `fast efni` true 1, `tilrauna-` undecided 1.

**What M2 removes from M1:** 9 warnings: `upphafs-` → `Upphafs-pH` (undecided) ×2; `sýrubindandi lyf` → `sýrubindandi lyfið` (true) ×2; `fjölatóma jón` → `fjölatóma jónarinnar` (true) ×1; `upphafs-` → `upphafs-pH` (undecided) ×1; `sýrubindandi lyf` → `sýrubindandi lyfinu` (true) ×1; `sýrubindandi lyf` → `sýrubindandi lyfs` (true) ×1; `tilrauna-` → `tilrauna-Tokamak` (undecided) ×1. Terms that END in a hyphen (`upphafs-`, `tilrauna-`) have an empty last word, so the four-letter rule excludes them; it also excludes a last word of three letters (`lyf`, `jón`).

**A2 with B3.** Because alternatives remove nothing, the removals of option A2 with option B3 equal M2's: **4,451 of 31,573 warnings** (14.1%), across 376 terms, false range 1.3–6.0%, and no `missing` → `alternative` change (alternatives stay whole-word under A2).

## Limits

- The classes are measurement 15's heuristics, with a ceiling (true) and a floor (false).
- Only chemistry, and only today's text.
- Per the BÍN licensing decision, the per-word classes are not committed; rerun the instrument (it reads `tools/data/SHsnid.csv` on the box) to regenerate them.
