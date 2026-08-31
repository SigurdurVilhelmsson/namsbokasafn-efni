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

## 3. ✅ THE MECHANISM — SETTLED BY PROBE, 2026-08-30

Run against a consistent `db.backup()` snapshot of production, mutated only on local copies.
**Nothing in the tracked tree was written** (all four committed glossaries `md5sum -c` OK, git clean).
Every mutation was asserted PRESENT before its result was read.

| # | hypothesis | result |
|---|---|---|
| A | `terminology_translations.status = 'rejected'` | 🔴 **REFUTED** — mutation applied (1 row, read back `rejected`); glossary **identical**, 2,021 terms, `moles → moldvörpur [approved]` |
| B | `UPDATE concept_term.text` (lang `is`) | ✅ **CONFIRMED** — sentinel propagated; control `enthalpy → vermi` untouched |
| C | `DELETE` the `concept_term` row | ✅ **CONFIRMED** — 2,021 → **2,020**, term ABSENT (predicted delta −1) |
| D | `concept_term.lifecycle = 'retired'` | 🔴 **REFUTED** — inert. `null` on all 192,142 rows; nothing reads it |
| E | drop a domain from `book_domain_priority` | ✅ **CONFIRMED** — one row → **2,021 → 1,438** |
| F | add a `chemistry` concept after E | ✅ **CONFIRMED** — reappears; and it **OUTRANKS physics** (1,438 → 1,439, predicted) |

🔴 **A IS THE ONE THE PREVIOUS DRAFT PROPOSED, AND IT DOES NOTHING.** `formatGlossary` *and*
`buildGlossaryMap` both filter `status === 'approved'`, so it looks right from every angle — but
`resolvedGlossary.js:122` **re-stamps `status: 'approved'`** on every term it emits from the
**concept model**, a different table. The edit would have reported success and changed nothing,
and the 2-hourly cron would have republished the bad term.

### The structural finding

**The chemistry book's glossary is only 19% chemistry**, and organic's is 20%:

| book | physics | biology | chemistry | total |
|---|---:|---:|---:|---:|
| `efnafraedi-2e` | 1,051 | 583 | **387** | 2,021 |
| `lifraen-efnafraedi` | 243 | 427 | **170** | 840 |

`book_domain_priority` is why: chemistry resolves `chemistry → physics → biology`, so a headword with
no chemistry concept falls through to another field's Íðorðabankinn dictionary. `moles → moldvörpur`
is a **correct** LIFORD (biology) entry reached by fall-through — not our error, and deleting it
would destroy imported reference data.

### Two shapes, both measured

**Shape 1 — surgical (3 steps).**
① drop `biology` from chemistry's priority: **one reversible row, −582 terms**, clears 16 of the 18
DELETEs plus `site`. ② re-add the 6 wanted terms as `chemistry` concepts (`pH`, `nm`, `ppm`, `kcal`,
`drug`, `blood`) — confirmed working and non-destructive. ③ the **12 remaining DELETEs are ALL
physics-domain** (`molar`, `specific`, `equivalent`, `tube`, `laboratory`, `fit`, `barrier`,
`degenerate`, `variation`, `character`, `family`, `quantity`) and need per-term handling; the 10
PICK rows can be **overridden non-destructively** by adding a chemistry concept, which outranks physics.

**Shape 2 — chemistry-only.** Drop both `biology` and `physics`: **2,021 → 387**, removing **47 of
the 50** reviewed headwords in one change. It keeps what matters — `enthalpy → vermi`,
`atom → atóm`, `mole → mól`, **`molar mass → mólmassi`** (multi-word headwords survive),
`titration → títrun`, `electron → rafeind` — and loses element names, units and `pH`.
⚠️ **Weighing it:** §C73 measured that the MT renders `sodium → natríum` and `magnesium → magnesíum`
correctly **with no glossary at all**, which is most of what physics contributes. **But** the 44 bad
`-ium → -ín` spellings are already retired (measured: 21 `-ium` headwords remain, **0** ending `-ín`,
with a working control), so physics is currently contributing *correct* element names — the argument
that it is actively harmful no longer holds. **What the other ~1,600 terms contain has NOT been
audited**, which is the honest limit on Shape 2.

### The ~1,600 unaudited terms — now audited [MEASURED 2026-08-30]

Every term Shape 2 removes, bucketed against the corpus: does the headword fire in the English, and
does its Icelandic value appear anywhere in the model's own output?

| set | terms | redundant | never fires | **divergent** |
|---|---:|---:|---:|---:|
| **chemistry — removed** | 1,634 | 81.6% | 0.2% | **18.2%** |
| chemistry — **kept** (control) | 387 | 98.7% | 0% | **1.3%** |
| **organic — removed** | 670 | 70.6% | 0.1% | **29.3%** |
| organic — **kept** (control) | 170 | 97.1% | 0% | **2.9%** |

**Divergent** = the headword fires but its Icelandic appears in **none** of 3.4M chars of MT output —
the model is not producing that word, so the entry is not shaping the translation as it claims.

🔑 **THE CONTROL IS WHAT MAKES THIS INTERPRETABLE.** Chemistry-domain terms diverge at **1.3% / 2.9%**;
the imported foreign-domain terms at **18.2% / 29.3%** — a **10-14× gap, replicated independently in
two books**. ▶ **No removed term is load-bearing:** each is either redundant (the model produces the
word anyway) or already ignored — and removing an ignored one also retires §C73's partial-compliance
risk, where an entry is obeyed on *some* occurrences unpredictably.

Two the 50-row review did not reach, both high-frequency: **`appendix → botnlangi`** (72 — the
anatomical appendix, in a book that has appendices) and **`alcohol → vínandi`** (65, organic —
*drinking* alcohol, where the book means the functional-group class). Also `similar → einslaga` (214),
`ring → baugur` (94, organic), `phases → kvartilaskipti` (moon phases, 42), `bottom → blíða` (43).

⚠️ **Honest limit:** "redundant" tests whether the Icelandic stem appears *anywhere* in the output,
not that it was produced *for that headword* — a weaker claim than it sounds. The divergence gap is
what decides the question, and it is measured identically on both sides of the control.

▶ **This makes Shape 2 a decision with evidence rather than a leap.** It is one reversible row per
book (`DELETE FROM book_domain_priority WHERE book_id=? AND domain IN ('biology','physics')`), it
clears 47 of the 50 reviewed headwords plus the two above, and it keeps `enthalpy → vermi`,
`atom → atóm`, `mole → mól`, `molar mass → mólmassi`, `titration → títrun`, `electron → rafeind`.
**It loses element names, units and `pH`** — which §C73 measured the MT rendering correctly
unprompted, and which can be re-added as `chemistry` concepts (probe F, confirmed).

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
