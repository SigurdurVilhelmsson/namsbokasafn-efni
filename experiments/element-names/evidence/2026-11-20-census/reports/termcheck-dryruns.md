# The editor's term check on compounds: two read-only dry runs (measurement 14)

Measured 2026-11-21 on production at `844f13d2f`, read-only. Each run added the entries to an **in-memory copy** of the database (the file opened read-only, serialized, and reopened from the buffer) and ran the server's own functions on it: `addEntry` (the write API the head-editor page calls), the BÍN chooser the page's automatic lookup runs, `buildEffectiveSegments` (the segments as editors see them, pending edits included) and `findTermsInSegments` (the term check). The file's size and mtime were unchanged after each run and the checkout stayed clean. Data: `data/termcheck-dryrun-magnesium.json`, `data/termcheck-dryrun-c73.json` (BÍN form lists reduced to counts).

**The states.** Adding an entry schedules a BÍN lookup that stores the word's inflections a moment later, and the term check accepts the term or a stored form only as a whole word. So each run measures the text as it is and with the fix drafts of measurements 7-9 overlaid, under: no entry; **A**, the entry before its inflections are stored; **B**, after.

## Magnesium alone

| Warnings | Text as it is | With the fix drafts |
|---|---:|---:|
| No entry | 0 | 0 |
| A: entry, before the lookup | 66 | 57 |
| B: entry and its BÍN inflections | 53 | **43** |

- **Controls.** Before the entry `magnesium` resolves to no chemistry winner (only `magnesíum (anatomy-physiology)` out of scope, shown in the editor as an unchecked suggestion); after it, to the entry (`book-entry`). All 119 segments whose English names magnesium got a magnesium match in every state with the entry. BÍN: unambiguous, 4 forms. Drafts: 226 unique, 226 still equal to production's text, 0 drifted. No other term's warnings changed in these segments.
- **Synthetic segments** (the issue type, or — for none):

| Segment | No entry | A | B |
|---|---|---|---|
| S1-standalone | — | — | — |
| S2-genitive | — | missing | — |
| S3-closed-compound | — | missing | missing |
| S4-hyphenated | — | — | — |
| S5-symbol-only | — | missing | missing |
| S6-non-official | — | missing | missing |
| S7-chloride | — | missing | missing |

- **With the drafts and the inflections, 43 warnings, every one a closed compound:** the segment holds magnesíum only as the first part of a longer word (one also holds the product name *Magnesia*).
- **The drafts clear 10**, all genuine `magnesín` forms; **2** more drafts fix `magnesín` and leave a compound, so they still warn: `m68829:caption:CNX_Chem_18_01_CalciWater-caption`; `m68834:para:fs-idm59038240`.
- **14 clear only once the lookup has stored the inflections** (mostly `magnesíums`).

| Chapter | Segment | Name-bearing words |
|---|---|---|
| 2 | `m68698:entry:auto-15` | magnesíumnítríð |
| 2 | `m68698:entry:auto-28` | magnesíumfosfat |
| 2 | `m68698:entry:auto-48` | magnesíumhýdroxíð |
| 2 | `m68698:entry:auto-56` | magnesíumsúlfat |
| 2 | `m68698:para:fs-idp283457424` | magnesíumsúlfat |
| 2 | `m68698:problem:fs-idm306432` | magnesíumseleníð |
| 2 | `m68698:problem:fs-idp279320480` | magnesíumnítríð |
| 2 | `m68698:problem:fs-idp279468704` | magnesíumfosfat |
| 2 | `m68698:table-summary:fs-idp268265360-summary` | magnesíumhýdroxíð, magnesíumsúlfat |
| 2 | `m68698:table-summary:fs-idp279316112-summary` | magnesíumfosfat |
| 2 | `m68698:table-summary:fs-idp282234816-summary` | magnesíumnítríð |
| 4 | `m68709:problem:fs-idm720496` | magnesíumklóríðið, magnesíummálm |
| 4 | `m68709:problem:fs-idm721024` | magnesíumhýdroxíðinu, magnesíumklóríð |
| 4 | `m68709:problem:fs-idm721584` | magnesíumklóríð, magnesíumhýdroxíð |
| 4 | `m68709:problem:fs-idp45919792` | magnesíumklóríði, magnesíumhýdroxíð |
| 4 | `m68710:para:fs-idm52053696` | magnesíumklóríð |
| 4 | `m68713:para:fs-idp56844080` | magnesíummjólk, magnesíumhýdroxíð |
| 4 | `m68713:problem:fs-idp38709616` | magnesíumkarbónats |
| 7 | `m68739:alt:fs-idp678720-alt` | Magnesíumtákn, magnesíumtákn, magnesíumatóm, magnesíumoxíð, magnesíumjón |
| 11 | `m68783:para:fs-idp175903616` | magnesíumklóríð |
| 11 | `m68784:para:fs-idm189696128` | magnesíumsambönd |
| 12 | `m68787:problem:fs-idm151736608` | magnesíummálms, magnesíumbitanna |
| 12 | `m68787:solution:fs-idm120667552` | magnesíummálmi |
| 15 | `m68811:para:fs-idm330455632` | magnesíumhýdroxíðs |
| 15 | `m68811:para:fs-idm735616` | magnesíumhýdroxíðs |
| 15 | `m68811:para:fs-idm743248` | magnesíumjónar, magnesíumhýdroxíðs |
| 15 | `m68811:para:fs-idm745168` | magnesíumhýdroxíðs |
| 15 | `m68811:para:fs-idp11854608` | magnesíumhýdroxíð |
| 15 | `m68811:para:fs-idp1193504` | magnesíummálmi |
| 15 | `m68811:para:fs-idp15157136` | magnesíummálmi |
| 15 | `m68811:para:fs-idp681040` | magnesíumhýdroxíð, Magnesia |
| 15 | `m68811:problem:fs-idp2651648` | Magnesíummálmur |
| 17 | `m68822:para:fs-idm215655008` | magnesíumanóða, magnesíumklóríði |
| 17 | `m68822:problem:fs-idm95770176` | magnesíumrafskaut |
| 18 | `m68829:caption:CNX_Chem_18_01_CalciWater-caption` | Magnesíummálmur |
| 18 | `m68831:para:fs-idp120612224` | magnesíumdufti |
| 18 | `m68831:para:fs-idp204527824` | magnesíumoxíðið |
| 18 | `m68831:problem:fs-idp114681504` | magnesíumsílisíð |
| 18 | `m68834:para:fs-idm59038240` | magnesíumkarbónati |
| 18 | `m68837:para:fs-idm33972064` | magnesíumhýdroxíði, magnesíummjólk |
| 18 | `m68837:para:fs-idp12102384` | magnesíumoxíði, Magnesíumoxíð |
| 19 | `m68843:caption:CNX_Chem_19_02_ChlorBlue-caption` | magnesíummiðjuna |
| app. | `m68868:table-summary:fs-idm454814336-summary` | magnesíumefni, magnesíumefni, magnesíumefni, magnesíumefni, magnesíumefni |

## The 59 adds, entered together

| Warnings ((segment, name) pairs) | Text as it is | With the fix drafts |
|---|---:|---:|
| No entries | — | 0 |
| A: entries, before the lookup | — | 212 |
| B: entries and their BÍN inflections | 491 | **152** |

- **With the drafts and the inflections: 152 warnings on 140 distinct segments, across 19 names. 151 are closed compounds only**: every name-bearing word the classifier recognises starts with the official form and goes on. The other 1 is `m68742:para:fs-idp122770240` (beryllium, no-name-token): `miðberyllínatómið`, a non-official form inside a compound, drafted in measurement 13.
- **Without the drafts: 491**, 381 of them genuine non-official forms.
- **Before the lookup: 212.** BÍN: 46 names unambiguous, 12 not in BÍN, 1 refused as ambiguous (`data/c73-bin-outcomes.json` names them); those 13 get no inflections, and none of them warns on today's text.
- **Today, before any entry:** 14 names show in the editor as an unchecked suggestion from outside chemistry (barium, berkelium, beryllium, cadmium, francium, gallium, helium, lithium, magnesium, radium, strontium, thallium, thorium, vanadium); the other 45 are not highlighted at all.
- **Controls.** 59 adds, 0 refusals; every English form resolves to its own entry (0 exceptions). Per name, a synthetic standalone form passes (59 of 59) and a closed compound warns (59 of 59). No name warns before the entries. The (segment, name) pairs total 783, the census's count. Drafts: 226 of 226 still equal to production's text. No other term's warnings changed (0). Warned segment ids shrink state by state (B with drafts ⊆ B without, and ⊆ A). Magnesium's row equals the magnesium run.
- **One state-A classification is a misfire, not an error:** actinium's `m68842:para:fs-idm9696240` is classed non-official in state A because `aktíníðaröðina`, the actinide-series word ruled on 2026-11-20, starts with the base `aktín`; it holds `aktíníums` too, so it passes once the inflections are stored. Found by a local re-run that kept state A's records.

| Name | Segments naming it | B, as it is | A, with drafts | **B, with drafts** | Compounds only | BÍN |
|---|---:|---:|---:|---:|---:|---|
| magnesium | 119 | 53 | 57 | **43** | 43 | unambiguous |
| lithium | 58 | 58 | 26 | **22** | 22 | unambiguous |
| barium | 47 | 31 | 28 | **21** | 21 | unambiguous |
| helium | 55 | 26 | 19 | **14** | 14 | unambiguous |
| cadmium | 38 | 14 | 12 | **9** | 9 | unambiguous |
| caesium | 21 | 15 | 12 | **9** | 9 | unambiguous |
| beryllium | 31 | 12 | 9 | **7** | 6 | unambiguous |
| gallium | 19 | 12 | 7 | **6** | 6 | unambiguous |
| strontium | 29 | 9 | 9 | **4** | 4 | unambiguous |
| vanadium | 11 | 5 | 5 | **4** | 4 | unambiguous |
| rubidium | 16 | 5 | 6 | **3** | 3 | unambiguous |
| scandium | 12 | 4 | 4 | **2** | 2 | unambiguous |
| thallium | 22 | 17 | 5 | **2** | 2 | unambiguous |
| cerium | 7 | 6 | 1 | **1** | 1 | unambiguous |
| indium | 9 | 3 | 1 | **1** | 1 | unambiguous |
| iridium | 11 | 8 | 2 | **1** | 1 | unambiguous |
| radium | 12 | 6 | 3 | **1** | 1 | unambiguous |
| samarium | 5 | 5 | 1 | **1** | 1 | unambiguous |
| thorium | 9 | 6 | 2 | **1** | 1 | unambiguous |
| actinium | 11 | 10 | 1 | **0** | 0 | unambiguous |
| americium | 11 | 10 | 0 | **0** | 0 | unambiguous |
| berkelium | 5 | 5 | 0 | **0** | 0 | unambiguous |
| bohrium | 4 | 4 | 0 | **0** | 0 | not-in-bin |
| californium | 6 | 5 | 0 | **0** | 0 | unambiguous |
| copernicium | 6 | 5 | 0 | **0** | 0 | unambiguous |
| curium | 6 | 6 | 0 | **0** | 0 | not-in-bin |
| darmstadtium | 4 | 4 | 0 | **0** | 0 | not-in-bin |
| dubnium | 5 | 5 | 0 | **0** | 0 | not-in-bin |
| dysprosium | 6 | 4 | 0 | **0** | 0 | unambiguous |
| einsteinium | 6 | 5 | 0 | **0** | 0 | unambiguous |
| erbium | 4 | 4 | 0 | **0** | 0 | unambiguous |
| europium | 7 | 4 | 0 | **0** | 0 | unambiguous |
| fermium | 5 | 5 | 0 | **0** | 0 | unambiguous |
| flerovium | 7 | 5 | 0 | **0** | 0 | not-in-bin |
| francium | 8 | 7 | 1 | **0** | 0 | unambiguous |
| gadolinium | 6 | 6 | 0 | **0** | 0 | unambiguous |
| hafnium | 5 | 4 | 0 | **0** | 0 | unambiguous |
| hassium | 4 | 4 | 0 | **0** | 0 | unambiguous |
| holmium | 5 | 4 | 0 | **0** | 0 | unambiguous |
| lawrencium | 7 | 6 | 0 | **0** | 0 | not-in-bin |
| livermorium | 5 | 4 | 0 | **0** | 0 | not-in-bin |
| lutetium | 6 | 5 | 0 | **0** | 0 | refused-ambiguous |
| meitnerium | 6 | 5 | 0 | **0** | 0 | not-in-bin |
| mendelevium | 6 | 5 | 0 | **0** | 0 | unambiguous |
| niobium | 5 | 1 | 0 | **0** | 0 | unambiguous |
| nobelium | 7 | 6 | 0 | **0** | 0 | unambiguous |
| osmium | 9 | 6 | 1 | **0** | 0 | unambiguous |
| palladium | 11 | 2 | 0 | **0** | 0 | unambiguous |
| promethium | 5 | 5 | 0 | **0** | 0 | unambiguous |
| protactinium | 4 | 4 | 0 | **0** | 0 | not-in-bin |
| rhenium | 6 | 5 | 0 | **0** | 0 | unambiguous |
| rhodium | 8 | 2 | 0 | **0** | 0 | unambiguous |
| roentgenium | 5 | 4 | 0 | **0** | 0 | not-in-bin |
| rutherfordium | 6 | 5 | 0 | **0** | 0 | not-in-bin |
| seaborgium | 7 | 5 | 0 | **0** | 0 | not-in-bin |
| technetium | 14 | 8 | 0 | **0** | 0 | unambiguous |
| terbium | 5 | 4 | 0 | **0** | 0 | unambiguous |
| thulium | 5 | 4 | 0 | **0** | 0 | unambiguous |
| ytterbium | 4 | 4 | 0 | **0** | 0 | unambiguous |

## Limits

- **Why compounds warn.** `wholeWordRegex` rejects a letter on either side of the term, so `magnesíumklóríð` does not contain `magnesíum` for the check; a hyphen is not a letter, so `magnesíum-jón` passes.
- **The warnings are advisory**, read from the code rather than run: the module report's route says "Advisory — no block", the per-save warnings are returned with a save that cannot fail on them, and the editor page lists them.
- **The drafts are measurements 7-9**, the ones that existed when the runs were made. Measurement 13's draft fixes the one real warning; the runs were not repeated with it.
- **The nine replacement entries (§C245 ①) were not in either run.**
- **"Compounds only" is the classifier's reading:** it sees the words that start with the official form or a known non-official base; a name inside a word is seen only through measurement 13's scan.
