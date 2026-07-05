# Math-label Erlendur review — efnafraedi-2e

Machine translations from the Málstaður/Erlendur API (chemistry glossary: 1117 terms), for review.
**Not final** — pick/edit into `math-label-map.json`, then `--validate`. Translations are API-sourced; abbreviate subscript values to ≤6 chars.

- `abbr` = English is an abbreviation → Erlendur MT unreliable; use the glossary column / expand-then-abbreviate by hand.
- `⚠>6` = a subscript label whose Erlendur IS exceeds the 6-char cap → must be abbreviated.
- glossary column shows an exact-match chemistry-glossary term (✓ = human-approved) — usually more trustworthy than MT.

## Subscript labels (45) — need ≤6 chars; mostly abbreviations (MT weak, lean on glossary)

| English | ×count | glossary IS (✓=approved) | Erlendur IS | flags |
|---|--:|---|---|---|
| `cell` | 50 | ker | `fruma` |  |
| `vap` | 19 | guf | `Skjaldarmerki` | abbr ⚠>6 |
| `surr` | 17 | umhv | `suð` | abbr |
| `sys` | 16 | kerfi | `kerfi` | abbr |
| `cathode` | 13 | `katóða`✓ | `katóða` |  |
| `anode` | 12 | `anóða`✓ | `anóða` |  |
| `solution` | 12 | `lausn`✓ | `Lausn` |  |
| `univ` | 11 | alheimur | `háskóli` | abbr ⚠>6 |
| `water` | 11 | vatn | `Vatn` |  |
| `initial` | 7 | upphafs | `Upphaflegur` | ⚠>6 |
| `lattice` | 7 | `grind`✓ | `grind` |  |
| `reaction` | 7 | `efnahvarf`✓ | `efnahvarf` | ⚠>6 |
| `rev` | 7 | bak | `séra` | abbr |
| `rms` | 7 | rms | `rms` | abbr |
| `solvent` | 6 | `leysir`✓ | `Leysir` |  |
| `final` | 5 | lok | `endanlegur` | ⚠>6 |
| `fus` | 5 | bráð | `fús` | abbr |
| `metal` | 5 | `málmur`✓ | `málmur` |  |
| `rxn` | 5 | hvarf | `viðbrögð` | abbr ⚠>6 |
| `avg` | 4 | meðal | `meðaltal` | abbr ⚠>6 |
| `max` | 4 | max | `hámark` | abbr |
| `rebar` | 4 | bindijárn | `járnabinding` | ⚠>6 |
| `iron` | 3 | járn | `járn` |  |
| `soln` | 3 | lausn | `lausn` | abbr |
| `solv` | 3 | leysir | `leysa` | abbr |
| `sub` | 3 | sub | `áskrift` | abbr ⚠>6 |
| `elec` | 2 | raf | `rafm` | abbr |
| `measured` | 2 | mælt | `mældur` |  |
| `bomb` | 1 | bombu | `sprengja` | abbr ⚠>6 |
| `con` | 1 | con | `með` | abbr |
| `dep` | 1 | dep | `deild` | abbr |
| `eff` | 1 | eff | `djö` | abbr |
| `ele` | 1 | ele | `hann` | abbr |
| `ethylene` | 1 | etýlen | `Etýlen` |  |
| `forward` | 1 | áfram | `Áfram` |  |
| `frz` | 1 | frz | `franska` | abbr ⚠>6 |
| `fusion` | 1 | samruni | `samruni` | ⚠>6 |
| `glycol` | 1 | glýkól | `glýkól` |  |
| `ice` | 1 | ís | `ís` | abbr |
| `oct` | 1 | okt | `okt.` | abbr |
| `overall` | 1 | heild | `í heildina` | ⚠>6 |
| `reverse` | 1 | til baka | `Snúa við` | ⚠>6 |
| `steam` | 1 | gufa | `gufa` |  |
| `tet` | 1 | tet | `tet` | abbr |
| `total` | 1 | heild | `Samtals` | ⚠>6 |

## Inline content-words (88) — full words; Erlendur MT is strongest here, no length cap

| English | ×count | glossary IS (✓=approved) | Erlendur IS | flags |
|---|--:|---|---|---|
| `mol` | 214 | mól | `moldvarpa` | abbr |
| `rate` | 64 | hraði | `gefa einkunn` |  |
| `mass` | 15 | `massi`✓ | `massi` |  |
| `volume` | 13 | `rúmmál`✓ | `Rúmmál` |  |
| `change` | 12 | breyting | `breyta` |  |
| `density` | 12 | `eðlismassi`✓ | `eðlismassi` |  |
| `and` | 11 | og | `og` |  |
| `molecules` | 10 | sameindir | `sameindir` |  |
| `graphite` | 7 | grafít | `Grafít` |  |
| `decay` | 6 | hrörnun | `hrörnun` |  |
| `ppm` | 6 | ppm | `ppm` | abbr |
| `gas` | 5 | `gas`✓ | `gas` |  |
| `liquid` | 5 | `vökvi`✓ | `Vökvi` |  |
| `min` | 5 | mín | `mín` | abbr |
| `products` | 5 | myndefni | `myndefni` |  |
| `yellow` | 5 | gulur | `gulur` |  |
| `amu` | 4 | amu | `amu` | abbr |
| `catalyst` | 4 | `hvati`✓ | `Hvati` |  |
| `electrolysis` | 4 | `rafgreining`✓ | `Rafgreining` |  |
| `fast` | 4 | hratt | `hratt` | abbr |
| `reactants` | 4 | hvarfefni | `Hvarfefni` |  |
| `slope` | 4 | halli | `halli` |  |
| `sunlight` | 4 | sólarljós | `Sólskin` |  |
| `time` | 4 | tími | `tími` |  |
| `acid` | 3 | `sýra`✓ | `Sýra` |  |
| `atom` | 3 | `atóm`✓ | `frumeind` | abbr |
| `base` | 3 | `basi`✓ | `Basi` |  |
| `billion` | 3 | milljarður | `milljarður` |  |
| `diamond` | 3 | demantur | `demantur` |  |
| `glucose` | 3 | glúkósi | `glúkósi` |  |
| `ionization` | 3 | `jónun`✓ | `Jónun` |  |
| `molality` | 3 | `mólalstyrkur`✓ | `Mólalstyrkur` |  |
| `pancakes` | 3 | pönnukökur | `Pönnukökur` |  |
| `psi` | 3 | psi | `psí` | abbr |
| `red` | 3 | rauður | `Rauður` |  |
| `slow` | 3 | hægt | `hægt` | abbr |
| `atoms` | 2 | atóm | `Frumeindir` |  |
| `bar` | 2 | bar | `bar` | abbr |
| `constant` | 2 | fasti | `fasti` |  |
| `dissolution` | 2 | upplausn | `upplausn` |  |
| `distance` | 2 | fjarlægð | `fjarlægð` |  |
| `egg` | 2 | egg | `egg` | abbr |
| `for` | 2 | fyrir | `fyrir` | abbr |
| `gal` | 2 | gallon | `gufa` | abbr |
| `molecule` | 2 | `sameind`✓ | `sameind` |  |
| `oxidation` | 2 | `oxun`✓ | `Oxun` |  |
| `produced` | 2 | myndað | `framleitt` |  |
| `reduction` | 2 | `afoxun`✓ | `afoxun` |  |
| `skater` | 2 | skautari | `skautari` |  |
| `solid` | 2 | `fast efni`✓ | `Fast efni` |  |
| `speed` | 2 | hraði | `hraði` |  |
| `black` | 1 | svart | `svartur` |  |
| `carbon` | 1 | kolefni | `Kolefni` |  |
| `chlorophyll` | 1 | blaðgræna | `blaðgræna` |  |
| `collisions` | 1 | árekstrar | `Árekstrar` |  |
| `conjugate` | 1 | samoka | `beygja` |  |
| `countercurrent` | 1 | mótstraumur | `mótstraumur` |  |
| `day` | 1 | dagur | `dagur` | abbr |
| `dioxide` | 1 | díoxíð | `díoxíð` |  |
| `dissociation` | 1 | `klofnun`✓ | `Klofnun` |  |
| `eggs` | 1 | egg | `egg` | abbr |
| `electricity` | 1 | rafmagn | `rafmagn` |  |
| `electron` | 1 | `rafeind`✓ | `Rafeind` |  |
| `electrons` | 1 | rafeindir | `rafeindir` |  |
| `elephant` | 1 | fíll | `fíll` |  |
| `ethanol` | 1 | etanól | `etanól` |  |
| `fractionating` | 1 | hlutun | `Hlutun` |  |
| `glycine` | 1 | glýsín | `Glýsín` |  |
| `heat` | 1 | `varmi`✓ | `Varmi` | abbr |
| `hydrolysis` | 1 | `vatnsrof`✓ | `Vatnsrof` |  |
| `iii` | 1 | iii | `iii` | abbr |
| `light` | 1 | ljós | `ljós` |  |
| `mmol` | 1 | mmól | `mmól` | abbr |
| `molar` | 1 | mólar | `mólar` |  |
| `molecular` | 1 | sameinda- | `sameinda-` |  |
| `neutrons` | 1 | nifteindir | `nifteindir` |  |
| `nuclei` | 1 | kjarnar | `kjarnar` |  |
| `oxygen` | 1 | súrefni | `súrefni` |  |
| `precipitation` | 1 | `útfelling`✓ | `útfelling` |  |
| `protons` | 1 | róteindir | `róteindir` |  |
| `radius` | 1 | radíus | `radíus` |  |
| `rhombic` | 1 | tígullaga | `tígullaga` |  |
| `salt` | 1 | `salt`✓ | `salt` |  |
| `strong` | 1 | sterkur | `sterkur` |  |
| `then` | 1 | þá | `þá` | abbr |
| `tower` | 1 | turn | `turn` |  |
| `where` | 1 | þar sem | `Hvar` |  |
| `with` | 1 | með | `með` | abbr |
