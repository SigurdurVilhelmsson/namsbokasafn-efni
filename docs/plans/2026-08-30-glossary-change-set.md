# Glossary change set — the [LEAD] verdicts, ready to apply

**Created 2026-08-30 · derived from `2026-08-30-glossary-term-review.md`, which the [LEAD] filled in.**
**NOTHING HAS BEEN APPLIED.** This document is the proposal; the mechanism is not yet settled (§3).

## 1. The principle the [LEAD] and the corpus arrived at independently

> **Add a glossary entry when it resolves an ambiguity the model cannot see.**
> **Delete it when it overrides a choice the model makes better than a flat map can.**

Measured on 3.4M characters of existing Icelandic MT, produced *without* any of these entries:
the model already compounds **and inflects** correctly — `molar mass` → **mólmassa**, `specific heat` →
**eðlisvarmi/-varma**, `test tube` → **tilraunaglösin**, `equivalence point` → **jafngildispunktur**,
`laboratory equipment` → **rannsóknarstofubúnaði**. A flat English→Icelandic map cannot express a bound
stem, so forcing one can only interfere. ▶ **The sharpest test: does the picked form appear in the
model's own output at all?** Four candidates appear **0 times** — `mól-`, `rannsóknarstofa`, `bognun`,
`margræður`. Forcing those is overriding what works with what is untested.

## 2. The verdicts

The [LEAD] filled all 50. I recommend changing **7**, each with the measurement behind it. Rows marked
🔵 are my recommendation *against* the sheet as filled — the [LEAD] decides.

| # | English | current | occurs | [LEAD] verdict | my recommendation |
|---|---|---|---:|---|---|
| 1 | `is` | lófalægur | 9,202 | Delete | — agree |
| 2 | `at` | marsnákaætt | 2,085 | Delete | — agree |
| 3 | `atom` | atóm \ | frumeind | Pick atóm | — agree |
| 4 | `form` | tilbrigði | 804 | Delete | — agree |
| 5 | `structure` | gerð | 794 | Delete (structure in chemistry is usually "bygging") | — agree |
| 6 | `no` | blóð- | 640 | Delete | — agree |
| 7 | `cell` | fruma \ | rafhlað | Pick rafhlað | — agree |
| 8 | `OR` | gagnlíkindahlutfall | 400 | Delete | — agree |
| 9 | `pH` | sýrustig | 314 | Keep | — agree |
| 10 | `learning` | nám | 303 | Delete | — agree |
| 11 | `equal` | eins | 294 | Delete | — agree |
| 12 | `molar` | jaxl \ | mól- | Pick mól- (molar on its own is usually "mólar", but molar mass, molar ratio, molar volume  | 🔵 **DELETE** — MT already writes mólmassa (138) · mólhlutfall (33) · mólrúmmál (9); `mól-` appears **0×** |
| 13 | `result` | niðurstaða | 226 | Delete | — agree |
| 14 | `moles` | moldvörpur | 214 | FIX (moles is mól (plural and singular are the same in Icelandic)) | — agree |
| 15 | `specific` | eðlis- \ | sértækur | Pick eðlis- (same as molar, usually appears as compound icelandic words such as eðlisvarmi | 🔵 **DELETE** — MT already writes eðlisvarmi (76) · eðlismassi (245) and inflects them |
| 16 | `species` | tegund | 205 | Delete. Let MT decide on context and leave for edit. | — agree |
| 17 | `behavior` | hegðun | 201 | Delete | — agree |
| 18 | `case` | tilfelli | 169 | Delete | — agree |
| 19 | `initial` | upphafs- \ | upphafsfruma | Pick upphafs- | — agree |
| 20 | `terms` | tíðir | 136 | Delete | — agree |
| 21 | `information` | upplýsingar | 130 | Delete | — agree |
| 22 | `simple` | einfaldur | 119 | Delete | — agree |
| 23 | `blood` | blóð | 118 | Keep | — agree |
| 24 | `production` | framleiðsla \ | myndun | Pick myndun | — agree |
| 25 | `hydrocarbon` | kolvatnsefni \ | vetniskol | Pick kolhýdrat (not in glossary, but the correct term) | 🔵 **FIX -> kolvetni** — hydrocarbon = kolvetni (73× chem / 53× organic); `kolhýdrat` 0×, `vetniskol` 3×, `kolvatnsefni` 0× |
| 26 | `equivalent` | jafngildi \ | jafngildur | Might be best to Delete (compound words like equivalent point - jafngildispunktur) or pick | 🔵 **DELETE** — MT already writes jafngildispunktur — your own first instinct |
| 27 | `tube` | lampi \ | pípa | Delete. Too generic and a problem for compound words (test tube - tilraunaglas etc) | — agree |
| 28 | `rays` | skötur | 67 | rays should be geislar. Probably best to delete and let MT decide on context. | — agree |
| 29 | `laboratory` | rannsókna \ | rannsóknarstofa | Pick rannsóknarstofa. However, there are compound Icelandic words that depend on the next  | 🔵 **DELETE** — MT writes rannsóknarstofubúnaði; the nominative `rannsóknarstofa` appears **0×** |
| 30 | `absorb` | gleypa \ | taka upp | Pick gleypa | — agree |
| 31 | `methanol` | metanól \ | tréspíri | Pick metanól | — agree |
| 32 | `quantity` | magn \ | stærð | Pick magn | — agree |
| 33 | `nm` | nanómetri | 55 | Keep | — agree |
| 34 | `protein` | hvíta \ | prótín | Pick prótín | — agree |
| 35 | `CoA` | kóensím A | 34 | Keep | — agree |
| 36 | `fit` | hviða \ | mátun | Delte (let MT decide on context and allow for edit) | — agree |
| 37 | `rank` | raðgildi | 31 | Delete (let MT decide on context and allow for edit) | — agree |
| 38 | `drug` | lyf | 30 | Keep | — agree |
| 39 | `ppm` | milljónarhluti | 30 | Keep | — agree |
| 40 | `site` | set | 30 | Keep? Site in chemistry is usually set, but can be generic. | 🔵 **DELETE** — MT already switches on context: virka set / bindiset for the technical sense, staði / svæði for the generic one |
| 41 | `kcal` | kílókaloría | 27 | Keep | — agree |
| 42 | `flow` | flæði | 27 | Keep | — agree |
| 43 | `degenerate` | margfaldur \ | margræður | This is difficult. The physics glossary gives "kulefni" for "degenerate matter" and "kulga | — agree |
| 44 | `diffraction` | beygja \ | bognun | Pick beygja (the term used in the physics glossary) | — agree |
| 45 | `barrier` | hindrun \ | þröskuldur | Pick þröskuldur (this might be similar to 43, i.e. new, sometimes compound terms that will | 🔵 **DELETE** — corpus uses hindrun 18 vs þröskuld 9, and compounds it as virkjunarhindrun |
| 46 | `reagent` | prófefni \ | virkt efni | Pick prófefni | — agree |
| 47 | `variation` | breytileiki \ | hnikun | Pick breytileiki | — agree |
| 48 | `anti` | and- | 21 | Keep | — agree |
| 49 | `character` | einkenni \ | stafur | Pick einkenni | — agree |
| 50 | `family` | fjölskylda \ | ætt | Pick ætt | — agree |

## 3. 🔴 THE MECHANISM IS NOT SETTLED — do not apply from this document yet

The obvious operation — set the row's `status` away from `approved` in `terminology_translations` —
is **not proven to work**, and applying it blind would look successful while changing nothing.

What is established [MEASURED 2026-08-30]:

- `formatGlossary` (the MT wire) filters `status === 'approved'`, and `buildGlossaryMap` (the render
  path, `tools/lib/math-label-substitute.js:20`) filters it too. So a non-approved row would drop from
  **both** paths — this is the reversible operation, better than deleting data.
- `rejected` and `disputed` are real statuses with existing service functions
  (`terminologyService.js:659` and `:622`).
- ⚠️ **But all 28,903 translation rows on production are currently `approved`** — there is no live
  example of any other value, so this is an untested path in production data.
- 🔴 **AND THE EXPORTER MAY NOT READ THAT TABLE AT ALL.** `glossary-unified.json` is written by
  `export-terminology-resolved`, which builds from the **concept model** via `buildResolvedGlossary`
  → `conceptResolver`/`conceptMatcher` — and neither of those files references
  `terminology_translations` (measured: 0 occurrences in each, against a working control). It then
  **hardcodes `status: 'approved'`** on every term it emits (`server/lib/resolvedGlossary.js:122`,
  commented *"D2: load-bearing. buildGlossaryMap drops anything else."*).

▶ **So a `status` change on `terminology_translations` may be re-stamped `approved` on export and have
no effect.** The concept model is the likely real owner, and that path has not been traced to the bottom.

**The next step is a measurement, not an edit:** copy production's `sessions.db`, change ONE term
locally (`moles` is the safest — unambiguously wrong, 214 occurrences), run
`server/scripts/export-terminology.js` against the copy, and diff the emitted
`glossary-unified.json`. If the term disappears, the mechanism is confirmed. If it survives, the fix
belongs in the concept model and this document needs a §3 rewrite. **Pair it with a control: a term
you did NOT change must be unaffected.**

## 4. Two rows that are a different job

The `carbohydrate`/`hydrocarbon` group is **not** on the 50-row sheet and is the mirror image of the
principle in §1 — here the glossary *adds* information the model cannot have, because in general
Icelandic both English terms genuinely are `kolvetni`:

| headword | current | correct | evidence |
|---|---|---|---|
| `carbohydrate` | sykra | ✅ keep | the [LEAD]'s earlier manual fix |
| `carbohydrates` (plural — a **separate** headword) | **kolvetni** | **sykrur** | 🔴 the singular fix never reached it |
| `hydrocarbon` (chemistry) | vetniskol | **kolvetni** | corpus: kolvetni 73 · vetniskol 3 |
| `hydrocarbon` (organic) | kolvatnsefni | **kolvetni** | corpus: kolvetni 53 · kolvatnsefni **0** |

⚠️ Also logged: **`kolvetni` currently renders BOTH hydrocarbon and carbohydrate** in the published
chemistry (measured on real segment pairs). That is invisible to an editor reading Icelandic — both
read perfectly — and invisible to every gate, since neither is a wrong word.

## 5. What this does NOT cover

- The 50 rows are the ones a shape heuristic surfaced (common-English or ≤4 chars with a foreign
  domain, or the two books disagreeing). **They are not the whole glossary**: 2,021 chemistry and 840
  organic terms are emitted to the MT, and `loadGlossary`'s `domain` argument does not filter, so
  chemistry is primed with foreign-domain terms beyond these.
- No term here has been changed. The 2-hourly cron regenerates `glossary-unified.json` from the DB,
  so a file edit would be overwritten within the hour — which is why the mechanism question in §3
  has to be answered first.
