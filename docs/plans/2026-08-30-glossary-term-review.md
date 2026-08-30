# Glossary term review — the 50 entries that gate the first re-MT spend

**Created 2026-08-30 · [LEAD] action required · this is a working document, not a record.**

## Why this exists

These are `approved`, uncontested glossary entries that are sent to the paid Málstaður MT. A wrong one is
**obeyed partially and unpredictably** (§C73 measured `sodium→natrín` obeyed on 2 of 5 tokens in one segment
set), so it is baked into scattered occurrences everywhere and cannot be found by spot-checking output. No
gate can see them: they are well-formed, approved and uncontested. **Only domain knowledge finds them.**

Selected by: the term is a common English word or ≤4 chars **and** its domain is not chemistry/physics/general
(i.e. imported from another field where it means something else), **or** the two books disagree on its value.
Occurrence counts are word-boundary matches in the English actually being sent to MT.

⚠️ **Element symbols are NOT here on purpose.** `As→arsen`, `In`, `At`, `No`, `Be` are correct terms with a
broken *matching rule* — case-insensitive matching makes `As` fire on the English word "as" 3,168 times. That
is a code fix (case-sensitivity for short symbols) and is mine, not yours.

## How to fill this in

Put one of these in **VERDICT**, and if you write a replacement put it in **CORRECTED**:

| verdict | meaning |
|---|---|
| `DELETE` | remove the entry — the MT does better unprompted than with it |
| `KEEP` | correct as-is |
| `FIX` | keep the headword, replace the Icelandic (write it in CORRECTED) |
| `PICK <value>` | two values compete — name the one to keep |

🔴 **The fix lands in the terminology DB on production, not in `glossary-unified.json`** — the cron
regenerates that file every 2 hours from the DB, so a JSON edit is overwritten within the hour.

---

| # | English | current Icelandic | occurs | domain | my read | VERDICT | CORRECTED |
|---|---|---|---:|---|---|---|---|
| 1 | `is` | lófalægur | 9,202 | biology | **DELETE** — English copula. "lófalægur" is anatomical (palmar). Cannot be right in any chemistry sentence. | | |
| 2 | `at` | marsnákaætt | 2,085 | biology | **DELETE** — English preposition. "marsnákaætt" is a snake family. | | |
| 3 | `atom` | atóm \| frumeind | 1,172 | chemistry | **PICK** — Both are real: atóm vs frumeind. Pick one per book and be consistent. | | |
| 4 | `form` | tilbrigði | 804 | biology | **DELETE** — "tilbrigði" = variant. Ordinary English verb/noun, no chemistry-specific need. | | |
| 5 | `structure` | gerð | 794 | biology | **DELETE** — "gerð" is generic; structure needs no glossary entry and this fires 794x. | | |
| 6 | `no` | blóð- | 640 | biology | **DELETE** — English negation. "blóð-" is a blood- prefix. | | |
| 7 | `cell` | fruma \| rafhlað | 462 | biology,physics | **PICK** — "fruma" is a biological cell. In this book a cell is electrochemical. | | |
| 8 | `OR` | gagnlíkindahlutfall | 400 | biology | **DELETE** — Odds ratio, epidemiology. In organic chemistry "OR" is an alkoxy group or the English word "or". | | |
| 9 | `pH` | sýrustig | 314 | biology | **KEEP** — sýrustig is standard. | | |
| 10 | `learning` | nám | 303 | biology | **DELETE** — From "learning objectives" boilerplate. No chemistry sense. | | |
| 11 | `equal` | eins | 294 | biology | **DELETE** — Ordinary English. No chemistry-specific translation needed. | | |
| 12 | `molar` | jaxl \| mól- | 275 | biology,physics | **PICK** — "jaxl" is a molar TOOTH. Chemistry wants the mól- sense. | | |
| 13 | `result` | niðurstaða | 226 | biology | **DELETE** — Ordinary English. | | |
| 14 | `moles` | moldvörpur | 214 | biology | **FIX** — **"moldvörpur" is the ANIMAL.** Chemistry plural of mól. Almost certainly the single worst entry here. | | |
| 15 | `specific` | eðlis- \| sértækur | 206 | biology,physics | **PICK** — eðlis- (specific heat) vs sértækur (selective) — different meanings. | | |
| 16 | `species` | tegund | 205 | biology | **?** — Chemistry DOES use "species" technically (efnategund). Your call. | | |
| 17 | `behavior` | hegðun | 201 | biology | **DELETE** — Ordinary English. | | |
| 18 | `case` | tilfelli | 169 | biology | **DELETE** — Ordinary English. | | |
| 19 | `initial` | upphafs- \| upphafsfruma | 147 | biology,physics | **PICK** — "upphafsfruma" is a biology cell term; chemistry wants upphafs-. | | |
| 20 | `terms` | tíðir | 136 | biology | **DELETE** — "tíðir" = menstruation. Ordinary English word. | | |
| 21 | `information` | upplýsingar | 130 | biology | **DELETE** — Ordinary English. | | |
| 22 | `simple` | einfaldur | 119 | biology | **DELETE** — Ordinary English. | | |
| 23 | `blood` | blóð | 118 | biology | **KEEP** — Correct, just tagged biology. | | |
| 24 | `production` | framleiðsla \| myndun | 108 | biology,physics | **PICK** — framleiðsla vs myndun. | | |
| 25 | `hydrocarbon` | kolvatnsefni \| vetniskol | 88 | biology,physics | **PICK** — kolvatnsefni vs vetniskol — pick the standard. | | |
| 26 | `equivalent` | jafngildi \| jafngildur | 86 | biology,physics | **PICK** — noun vs adjective. | | |
| 27 | `tube` | lampi \| pípa | 74 | biology,physics | **PICK** — lampi = lamp. Chemistry wants pípa. | | |
| 28 | `rays` | skötur | 67 | biology | **DELETE** — "skötur" = skates (the fish). Chemistry/physics sense is geislar. | | |
| 29 | `laboratory` | rannsókna \| rannsóknarstofa | 63 | biology,physics | **PICK** — rannsóknarstofa is the noun. | | |
| 30 | `absorb` | gleypa \| taka upp | 58 | biology,physics | **PICK** — gleypa vs taka upp. | | |
| 31 | `methanol` | metanól \| tréspíri | 58 | biology,physics | **PICK** — "tréspíri" is archaic (wood spirit); metanól is standard. | | |
| 32 | `quantity` | magn \| stærð | 58 | biology,physics | **PICK** — magn vs stærð. | | |
| 33 | `nm` | nanómetri | 55 | biology | **KEEP** — nanómetri correct. | | |
| 34 | `protein` | hvíta \| prótín | 37 | biology,physics | **PICK** — prótín vs hvíta. | | |
| 35 | `CoA` | kóensím A | 34 | biology | **KEEP** — coenzyme A, correct. | | |
| 36 | `fit` | hviða \| mátun | 33 | biology,physics | **PICK** — "hviða" = a fit/seizure. Chemistry wants mátun. | | |
| 37 | `rank` | raðgildi | 31 | biology | **?** — "raðgildi" — check. | | |
| 38 | `drug` | lyf | 30 | biology | **KEEP** — lyf is correct. | | |
| 39 | `ppm` | milljónarhluti | 30 | biology | **KEEP** — correct. | | |
| 40 | `site` | set | 30 | biology | **?** — "set" — check against virkt set / hvarfset. | | |
| 41 | `kcal` | kílókaloría | 27 | biology | **KEEP** — correct. | | |
| 42 | `flow` | flæði | 27 | biology | **KEEP** — flæði correct. | | |
| 43 | `degenerate` | margfaldur \| margræður | 25 | biology,physics | **PICK** — orbital degeneracy sense. | | |
| 44 | `diffraction` | beygja \| bognun | 25 | biology,physics | **PICK** — beygja vs bognun. | | |
| 45 | `barrier` | hindrun \| þröskuldur | 24 | biology,physics | **PICK** — activation barrier — hindrun vs þröskuldur. | | |
| 46 | `reagent` | prófefni \| virkt efni | 24 | biology,physics | **PICK** — "prófefni" is an analytical reagent; organic wants hvarfefni/virkt efni. | | |
| 47 | `variation` | breytileiki \| hnikun | 23 | biology,physics | **PICK** — breytileiki vs hnikun. | | |
| 48 | `anti` | and- | 21 | biology | **KEEP** — anti- prefix is used in organic stereochemistry. | | |
| 49 | `character` | einkenni \| stafur | 20 | biology,physics | **PICK** — einkenni vs stafur (letter). | | |
| 50 | `family` | fjölskylda \| ætt | 20 | biology,physics | **PICK** — ætt (periodic-table family) vs fjölskylda. | | |

---

**50 rows, 19,792 occurrences in the English being translated.**

Hand this file back edited, or just tell me the exceptions to my reads — I have marked
`DELETE`/`KEEP` where I am confident and `PICK`/`?` where the call is yours.
