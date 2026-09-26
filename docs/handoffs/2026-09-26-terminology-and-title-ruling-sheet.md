# Ruling sheet — chemistry titles (§C192) and terminology (§C193)

> **For [USER], one sitting. Prepared 2026-09-26, 0 ISK, read-only.** Once answered, this file is
> *evidence*: the answers go into a decision record under `docs/decisions/`, and status stays in the
> active register. Every number below was generated from the census commands in § Provenance; none
> was typed by hand. Updated the same day from the live-vs-re-MT comparison
> ([`2026-09-26-live-vs-remt-terminology-comparison.md`](2026-09-26-live-vs-remt-terminology-comparison.md)):
> K6 *kinetics* was added, and five *adopt* defaults became *ask* where live was clearly more consistent.

## How to answer

Every row has a **default**. Reply with **exceptions only** — e.g. `K3 raflausn`, `T 9.6 keep new`,
`A radius keep`, `H plasma is right`. A class with no exceptions is accepted as a whole.

**Rows that need a real reading: 6 book-level questions + 7 chapter titles + 51 section titles + 59 adopt-or-keep terms.** The other 82 term rows are one tick per class.

**What each answer does** (nothing is applied until you answer):

- **restore live / keep new / other (titles)** → a hand repair of that title line in the READ-ONLY
  `books/efnafraedi-2e/02-mt-output/`, which you authorised on 2026-09-26, then the ② re-inject. Any title
  whose resulting file name differs from the live one needs a vefur redirect row. ⚠️ **Restoring the
  live wording does NOT always keep the live URL**: some live file names were rendered from an older
  title. So each section row shows both cases — "URL moves if kept" and "URL moves if restored".
- **adopt (terms)** → the concept row changes to the MT's word. A ruling of ours goes in
  `server/lib/houseStyleTerms.js` and reaches the export only after a deploy. The bought text already
  uses the word, so there is no editor work.
- **keep (terms)** → editors substitute the approved word in the listed segments, using the term-keyed finder
  planned for the editor phase. That is 0 ISK; the re-buy route was given up on 2026-09-26.
- **not this sense / not a chemistry term (H, C)** → a POLICY ruling: these rows must not raise "missing
  term" in the editor QA. **No mechanism for that exists yet.** Phase ③ builds it when it defines the QA
  population, so this answer triggers no change today.

## Part 0 — one yes/no, not a ruling

**The MT for `m68747` (8.4, *Molecular Orbital Theory*) misspells *sameind* (molecule) as *sámeind-*** in
its body, as well as in the title. The prepared 8.4 page carries it 35 times, and the ch08 intro, summary,
answer key and exercises carry it too. It ships at the sync. The title repair you authorised covers only
the title line.

☐ **Authorise the same hand repair for every `sámeind` → `sameind` in `02-mt-output/ch08/m68747-segments.is.md`** (default: yes)

## Part 1 — book-level questions

### K1 · stoichiometry

*stoichiometry* → keep **hlutfallaefnafræði**, or rule one of the MT's own forms?

The MT never produced the approved form anywhere in the book. It split the concept over two invented forms, *efnismagnsfræði* and *efnajöfnuhlutfall*, and they reach **ch04 · 4.3 · 9.3** titles. Whatever is ruled here also decides those three titles.

| English | approved | approved form in the book, anywhere | where the term is | MT wrote instead |
|---|---|---|---|---|
| stoichiometry | hlutfallaefnafræði | 0 segs | 0/77 | efnajöfnu 47%, efnismagnsfræði 32%, efnahvarf 27% |

Options: keep *hlutfallaefnafræði* (editors substitute everywhere) · adopt *efnismagnsfræði* · adopt *efnajöfnuhlutfall* · other.

**Default:** keep *hlutfallaefnafræði* — the MT has no single form to adopt, and the live site already uses it in both titles.

### K2 · dissociation ↔ nuclear decay (*sundrun*)

*dissociation* → keep **klofnun**, or accept *sundrun-*, which [USER] ruled for nuclear **decay** on 2026-09-21?

In the segments that miss *klofnun*, the MT writes *sundrun-* (e.g. *sundrunarfasti* for the dissociation constant). Accepting it makes *sundrun* name two concepts in one book, acid dissociation (ch14) and radioactive decay (ch21). *disintegration → hrörnun* (MT *geislasundrun*) and the **21.3** title *Geislasundrun* sit on the decay side of the same line.

| English | approved | approved form in the book, anywhere | where the term is | MT wrote instead |
|---|---|---|---|---|
| dissociation | klofnun | 76 segs | 0/33 | sundrunarfastann 33%, sundrun 36%, tengisrofsorka 21% |
| disintegration | hrörnun | 0 segs | 0/10 | geislasundrunar 70%, sundranir 50%, hraða 40% |

Options: keep *klofnun* for dissociation (editors substitute) · accept *sundrun* for both · other.

**Default:** keep *klofnun* — one word per concept; the decay side is already ruled.

### K3 · electrolyte

*electrolyte* → keep **rafkleyfi**, or adopt the MT's *raflausn*?

The approved form appears nowhere in the book. The MT writes *raflausn* in ~half the misses, and the prepared **11.2** title invents a third word, *Rafleiðar* (conductors), which is wrong in either case. *nonelectrolyte → órafkleyft efni* follows this ruling.

| English | approved | approved form in the book, anywhere | where the term is | MT wrote instead |
|---|---|---|---|---|
| electrolyte | rafkleyfi | 0 segs | 0/46 | raflausn 46%, rafleiðar 20%, sterkur 17% |
| nonelectrolyte | órafkleyft efni | 0 segs | 0/15 | ekki 67%, raflausn 33%, uppleystu 47% |

Options: keep *rafkleyfi* (+ *órafkleyft efni*) · adopt *raflausn* (+ *óraflausn*?) · other.

**Default:** your call — *raflausn* is common school usage; *rafkleyfi* is the approved row.

### K4 · colloid

*colloid* → keep **svif**, or adopt *kollóíð* / *kvoða*?

The MT splits three ways (*kollóíð*, *kvoða*, *kvoðulausn*). This decides the **ch11** chapter title (*Lausnir og svif* live, *…og kvoðulausnir* prepared) and **11.5** (*Svif* live, *Kollóíðar* prepared).

| English | approved | approved form in the book, anywhere | where the term is | MT wrote instead |
|---|---|---|---|---|
| colloid | svif | 9 segs | 3/23 | kollóíð 20%, kvoður 20%, kollóíðagnir 20% |

Options: keep *svif* · adopt *kollóíð* · adopt *kvoða* · other.

**Default:** keep *svif* — the MT has no single form, and the live site uses it in both titles.

### K5 · states of matter — *hamur* / *ástand* / *fasi*

One family: which word names a **state of matter** and a **phase**?

Approved rows use *-hamur* (*vökvahamur*, *storkuhamur*, *gashamur*); the MT writes *vökvafasi*, *fast form*, *loftkennt ástand*. [USER] ruled *phase transition → fasabreyting* on 2026-09-21, so *fasi* is already the ruled word for a phase. The titles **1.2** (*Efnishamir* → *Ástandsform*), **10.3** (*Fasabreytingar* → *Hamskipti*, which **contradicts** that ruling) and **10.5** (*Fastur efnishamur* → *Fast efni*) follow this.

| English | approved | approved form in the book, anywhere | where the term is | MT wrote instead |
|---|---|---|---|---|
| gaseous | gas- | 5 segs | 2/154 | loftkennt 38%, gasformi 18%, fljótandi 16% |
| liquid state | vökvahamur | 0 segs | 0/17 | vökvafasa 53%, fljótandi 35%, loftkenndu 24% |
| solid state | storkuhamur | 1 segs | 1/17 | formi 63%, föstu 63%, efni 44% |
| gaseous state | gashamur | 0 segs | 0/13 | loftkennt 46%, efnis 46%, gasástandi 23% |

Options: keep *-hamur* for states, *fasi* for phases · adopt the MT's *ástand/form* · other.

**Default:** your call; **10.3 restores *Fasabreytingar* regardless**, because it is already ruled.

### K6 · kinetics

*kinetics* → keep **hraðafræði** (approved, concept 4812)?

Not flagged by the census, because 7 of 21 re-MT paragraphs still carry *hraðafræði*. But the live-vs-re-MT comparison found the re-MT collapsing it onto *efnahvörf* (**reactions**) in ~10 paragraphs, e.g. "the kinetics chapter" → *kaflanum um efnahvörf*, and onto *hreyfifræði* (**kinematics**) in 2. That is the same wrong-sense class as the **ch12** title. Live wrote *hraðafræði* or *efnahvarfafræði*.

Options: keep *hraðafræði* (editors fix the collapses) · other.

**Default:** keep *hraðafræði* — the collapses are wrong-sense, so editors fix them whatever else is ruled.

## Part 2 — titles (§C192)

**Population.** The numbered section pages of the mt-preview track, and the 21 chapter titles in
`chapter-metadata`. *Live* = `https://namsbokasafn.is/content/efnafraedi-2e/toc.json`, fetched 2026-09-26
(200, 116,625 B; a nonsense-URL control returned 404, 162 B). Intro, end-of-chapter and appendix pages are
out of scope. The faithful overlay has only 1.1 and 3.1, and neither changed, so the faithful titles decide nothing here.

**7 of 21 chapter titles and 51 of 114 section titles change at the sync.** If every new title is kept, 48 of those 51 URLs move; if every one is restored, 7 still move. The URL
predictions use the renderer's own `slugify`, which reproduces all 114 current prepared file names exactly.
**2 further pages move URL whatever is ruled** — their title is unchanged, but the live file name is older: 2.7 (`2-7-nafnakerfi-efna.html` → `2-7-nafnakerfi-efnafraedinnar.html`), 5.1 (`5-1-grunnatridi-orku.html` → `5-1-grundvallaratridi-orku.html`). They need redirect rows, not a ruling.

"body" counts how often each side's
distinctive words occur in that page's own Icelandic text, so the title can agree with the text. Short
stems such as *atóm* or *málm* also hit ordinary words, so it is a hint, not a vote.

### Chapter titles (the chapter number is the URL, so none needs a redirect)

| ch | English | live | prepared | body (live / new) | default | why |
|---|---|---|---|---|---|---|
| 4 | Stoichiometry of Chemical Reactions | Hlutfallaefnafræði efnahvarfa | Efnajöfnur og efnahvörf | 54 / 86 | follows **K1** | drops *stoichiometry* |
| 7 | Chemical Bonding and Molecular Geometry | Efnatengi og sameindabygging | Efnahvörf og sameindabygging | 7 / 41 | restore live | *Efnahvörf* means **reactions**; the chapter is bonding (*Efnatengi*) |
| 11 | Solutions and Colloids | Lausnir og svif | Lausnir og kvoðulausnir | 5 / 2 | follows **K4** | colloid |
| 12 | Kinetics | Hraðafræði | Hreyfifræði | 10 / 3 | restore live | *Hreyfifræði* means **kinematics**; approved row (concept 4812) and the body use *hraðafræði* |
| 15 | Equilibria of Other Reaction Classes | Jafnvægi annarra flokka efnahvarfa | Jafnvægi annarra efnahvarfa | 8 / 0 | restore live | the prepared title drops *classes* (*flokka*) |
| 18 | Representative Metals, Metalloids, and Nonmetals | Hefðbundnir málmar, hálfmálmar og málmleysingjar | Aðalflokkamálmar, málmungar og málmleysingjar | 632 / 101 | other: *Aðalflokkamálmar, hálfmálmar og málmleysingjar* | keep the approved *aðalflokkamálmur* from prepared, restore the approved *hálfmálmur* from live |
| 21 | Nuclear Chemistry | Kjarnaefnafræði | Kjarnakemía | 16 / 55 | restore live | approved *efnafræði*; *-kemía* appears in no other chapter title |

### Section titles

| § | English | live | prepared | URL moves if kept / if restored | body (live / new) | default | why |
|---|---|---|---|---|---|---|---|
| 1.2 | Phases and Classification of Matter | Efnishamir og flokkun efnis | Ástandsform og flokkun efnis | yes / yes | 0 / 8 | follows **K5** | states of matter |
| 1.5 | Measurement Uncertainty, Accuracy, and Precision | Óvissa í mælingum, hittni og nákvæmni | Mælióvissa, nákvæmni og genkvæmni | yes / no | 59 / 1 | restore live | style; the body uses the live wording |
| 1.6 | Mathematical Treatment of Measurement Results | Stærðfræðileg meðferð á niðurstöðum mælinga | Stærðfræðileg meðferð mæliniðurstaðna | yes / yes | 10 / 2 | restore live | style; the body uses the live wording |
| 2.1 | Early Ideas in Atomic Theory | Fyrstu hugmyndir í frumeindakenningunni | Fyrstu hugmyndir í atómkenningunni | no / yes | 0 / 12 | keep new | *atóm-* is the book's word throughout (see *atomic orbital*) |
| 2.2 | Evolution of Atomic Theory | Þróun frumeindakenningarinnar | Þróun atómkenningarinnar | no / yes | 1 / 3 | keep new | as 2.1 |
| 2.3 | Atomic Structure and Symbolism | Frumeindabygging og táknmál | Atómbygging og táknmál | yes / yes | 0 / 0 | keep new | style; *atóm-* as 2.1 |
| 2.6 | Ionic and Molecular Compounds | Jónaefnasambönd og sameindaefnasambönd | Jóna- og sameindasambönd | yes / yes | 26 / 68 | restore live | approved *compound → efnasamband* |
| 4.3 | Reaction Stoichiometry | Hlutfallaefnafræði efnahvarfa | Efnajöfnuhlutfall | yes / no | 28 / 30 | follows **K1** | stoichiometry |
| 4.4 | Reaction Yields | Heimtur efnahvarfs | Heimtur efnahvarfa | no / yes | 0 / 0 | keep new | style; grammatical number only |
| 4.5 | Quantitative Chemical Analysis | Magnbundin efnagreining | Megindleg efnagreining | yes / no | 3 / 3 | keep new | follows *quantitative* (A) |
| 6.2 | The Bohr Model | Líkan Bórs | Líkan Bohrs | yes / no | 3 / 34 | keep new | style; the body writes *Bohr* 34 times |
| 8.1 | Valence Bond Theory | Kenning um gildistengi | Gildisrafeindatengjakenningin | yes / no | 18 / 4 | restore live | approved *valence bond → gildistengi* |
| 8.2 | Hybrid Atomic Orbitals | Blendingssvigrúm frumeinda | Blendingssvigrúm atóma | yes / no | 0 / 239 | keep new | as 2.1 |
| 8.3 | Multiple Bonds | Fjölföld tengi | Margföld tengi | yes / no | 0 / 5 | keep new | style; the body writes *margföld* |
| 8.4 | Molecular Orbital Theory | Sameindasvigrúmakenningin | Sámeindasvigrúmskenningin | yes / no | 181 / 26 | restore live | **MT typo** *Sámeinda-* (see Part 0) |
| 9.2 | Relating Pressure, Volume, Amount, and Temperature: The Ideal Gas Law | Samband þrýstings, rúmmáls, efnismagns og hitastigs: Kjörgaslögmálið | Samband þrýstings, rúmmáls, magns og hitastigs: Kjörgaslögmálið | yes / no | 0 / 27 | restore live | *amount* here is *efnismagn* (amount of substance), which the prepared title drops |
| 9.3 | Stoichiometry of Gaseous Substances, Mixtures, and Reactions | Hlutfallaefnafræði loftkenndra efna, blanda og efnahvarfa | Efnismagnsfræði loftkenndra efna, blanda og efnahvarfa | yes / no | 13 / 5 | follows **K1** | stoichiometry |
| 9.4 | Effusion and Diffusion of Gases | Útstreymi og sveim gasa | Útstreymi og flæði lofttegunda | yes / no | 20 / 44 | restore live | approved *diffusion → sveim*; *flæði* is also the MT's word for flow |
| 9.5 | The Kinetic-Molecular Theory | Hreyfiorkukenningin | Hreyfi-sameindakenningin | yes / no | 14 / 106 | restore live | style; *Hreyfi-sameindakenningin* is a calque |
| 9.6 | Non-Ideal Gas Behavior | Frávik frá kjörgaseiginleikum | Hegðun raungass | yes / no | 65 / 41 | restore live | style; the body uses *kjörgas* 58 times |
| 10.1 | Intermolecular Forces | Aðdráttarkraftar milli sameinda | Millikraftar | yes / no | 321 / 17 | keep new | follows *intermolecular forces* (A) |
| 10.3 | Phase Transitions | Fasabreytingar | Hamskipti | yes / no | 7 / 5 | restore live | *phase transition → fasabreyting* is **ruled** (2026-09-21); *Hamskipti* contradicts it |
| 10.4 | Phase Diagrams | Fasarit | Fasamyndir | yes / no | 23 / 11 | restore live | approved *phase diagram → fasarit* |
| 10.5 | The Solid State of Matter | Fastur efnishamur | Fast efni | yes / no | 0 / 129 | follows **K5** | states of matter |
| 10.6 | Lattice Structures in Crystalline Solids | Grindargerðir í kristalkenndum fastefnum | Grindarformgerðir í kristölluðum föstum efnum | yes / no | 0 / 22 | keep new | follows *crystalline solid* (A) |
| 11.2 | Electrolytes | Rafkleyfar | Rafleiðar | yes / no | 0 / 15 | follows **K3** | *Rafleiðar* (conductors) is wrong under either K3 answer |
| 11.4 | Colligative Properties | Samþynningareiginleikar | Sameiginlegir eiginleikar | yes / no | 5 / 33 | restore live | *Sameiginlegir eiginleikar* means **common** properties, not colligative |
| 11.5 | Colloids | Svif | Kollóíðar | yes / no | 5 / 29 | follows **K4** | colloid |
| 12.1 | Chemical Reaction Rates | Hvarfhraði efnahvarfa | Hraði efnahvarfa | yes / no | 18 / 119 | restore live | approved *reaction rate → hvarfhraði* |
| 12.2 | Factors Affecting Reaction Rates | Þættir sem hafa áhrif á hvarfhraða | Þættir sem hafa áhrif á efnahvarfshraða | yes / no | 4 / 31 | restore live | approved *reaction rate → hvarfhraði* |
| 12.3 | Rate Laws | Hraðajöfnur | Hraðalögmál | yes / no | 2 / 64 | keep new | follows *rate law* (A) — flip if you keep *hraðajafna* |
| 12.4 | Integrated Rate Laws | Heilduð hraðalögmál | Heildunarhraðalögmál | yes / no | 77 / 14 | restore live | style; the body uses the live wording |
| 12.6 | Reaction Mechanisms | Hvarfgangar efnahvarfa | Hvarfgangar | yes / no | 6 / 0 | keep new | style; drops a redundant *efnahvarfa* |
| 13.3 | Shifting Equilibria: Le Châtelier’s Principle | Tilfærsla jafnvægis: Lögmál Le Châteliers | Jafnvægisbreytingar: Lögmál Le Châteliers | yes / no | 0 / 0 | restore live | style; no body evidence either way |
| 14.3 | Relative Strengths of Acids and Bases | Hlutfallslegur styrkur sýra og basa | Afstæður styrkur sýra og basa | yes / no | 16 / 4 | restore live | style; the body uses *hlutfallslegur* |
| 15.3 | Coupled Equilibria | Tengd jafnvægi | Tengt jafnvægi | yes / no | 0 / 0 | restore live | *Coupled Equilibria* is plural; *Tengd jafnvægi* is the plural |
| 16.1 | Spontaneity | Sjálfsprotti | Sjálfgengi | yes / no | 0 / 40 | keep new | approved *spontaneity → sjálfgengi* |
| 17.1 | Review of Redox Chemistry | Yfirlit yfir oxunar-afoxunarefnafræði | Yfirlit yfir oxunar-afoxunarfræði | yes / no | 0 / 0 | restore live | approved *chemistry → efnafræði* |
| 17.2 | Galvanic Cells | Rafefnafrumur | Galvaníker | yes / no | 9 / 20 | keep new | approved *galvanic cell → galvaníker* |
| 17.3 | Electrode and Cell Potentials | Raftroðs- og kerspenna | Rafskauts- og kerspenna | yes / no | 0 / 35 | keep new | follows *electrode* (A) — flip if you keep *raftroð* |
| 18.2 | Occurrence and Preparation of the Representative Metals | Tilvist og framleiðsla dæmigerðra málma | Tilvist og framleiðsla aðalflokkamálma | yes / no | 52 / 8 | keep new | approved *representative metal → aðalflokkamálmur* |
| 18.3 | Structure and General Properties of the Metalloids | Uppbygging og almennir eiginleikar hálfmálma | Bygging og almennir eiginleikar málmunga | yes / no | 2 / 39 | restore live | approved *metalloid → hálfmálmur* |
| 18.12 | Occurrence, Preparation, and Properties of the Noble Gases | Tilvist, framleiðsla og eiginleikar eðalgastegunda | Tilvist, framleiðsla og eiginleikar eðallofttegunda | yes / no | 1 / 6 | keep new | follows *noble gas* (A) |
| 19.1 | Occurrence, Preparation, and Properties of Transition Metals and Their Compounds | Tilvist, framleiðsla og eiginleikar hliðarmálma og efnasambanda þeirra | Tilvist, framleiðsla og eiginleikar hliðarfrumefna og efnasambanda þeirra | yes / no | 10 / 75 | restore live | approved *transition metal → hliðarmálmur*; *hliðarfrumefni* is transition **elements** |
| 19.3 | Spectroscopic and Magnetic Properties of Coordination Compounds | Litrófs- og segulfræðilegir eiginleikar hnitflóka | Litrófs- og seguleiginleikar girðisambanda | yes / no | 6 / 47 | keep new | approved *coordination compound → girðisamband* |
| 20.1 | Hydrocarbons | Kolvetni | Vetniskolefni | yes / no | 0 / 73 | keep new | *hydrocarbon → vetniskolefni* is **ruled** (2026-09-21) |
| 20.2 | Alcohols and Ethers | Alkóhól og etrar | Alkóhól og eterar | yes / no | 1 / 34 | keep new | approved *ether → eter* |
| 20.3 | Aldehydes, Ketones, Carboxylic Acids, and Esters | Aldehýð, ketón, karboxýlsýrur og estrar | Aldehýð, ketónar, karboxýlsýrur og esterar | yes / no | 37 / 37 | restore live | style; the body is split evenly |
| 21.3 | Radioactive Decay | Geislavirk hrörnun | Geislasundrun | yes / no | 27 / 31 | keep new | *sundrun* for nuclear decay is **ruled** (2026-09-21) |
| 21.4 | Transmutation and Nuclear Energy | Umskipting og kjarnorka | Frumefnabreyting og kjarnorka | yes / no | 0 / 26 | keep new | approved *transmutation → frumefnabreyting* |
| 21.5 | Uses of Radioisotopes | Notkun geislasamsæta | Notkun geislasamsætna | yes / no | 0 / 0 | restore live | style; both genitive plurals exist |

Section defaults: 23 restore live · 22 keep new · 6 follow a Part 1 answer.

## Part 3 — terminology (§C193)

**Population.** The 1683 approved export rows that occur in the book, out of the
1740 in `glossary-unified.json` (generated 2026-09-23T14:50:45.514Z). The loader the MT leg
uses admits them; the few contested headwords it omits are §C71's class and outside this sheet. **Unit:** an aligned
EN/IS segment pair; the headword matched as a whole word, `-s/-es` plurals allowed. **Flagged:** ≥ 10
segments and < 35% carrying the approved stem — **151 rows**. "MT wrote instead" = words
over-represented in the segments that miss the approved form (share of those segments). Forms of one
word can split across entries, so a low share is not proof the MT is inconsistent.

▶ **Read the "anywhere" column first.** It is how many segments in the WHOLE book carry the approved form
at all. **0** means the model never once produced it. Keeping such a row asks editors to introduce a word
the text has never used. CLAUDE.md's test for a term is what the model does unprompted.

### A — real chemistry terms where the MT uses another word (59)

**Default: adopt the MT's word.** The bought text already uses it, so adopting costs no editor work, and
the approved form is mostly absent. Rows marked **ask** have the MT's top word under 70% of the misses,
with no split of one word's forms noted, so read those.

| English | approved | anywhere | where the term is | MT wrote instead | proposed lemma | default | note |
|---|---|---|---|---|---|---|---|
| mixture | efnablanda | 6 | 6/253 | blöndu 32%, blanda 26%, jafnvægi 25% | *blanda* | adopt | two forms split the share |
| valence | girðitala | 20 | 0/166 | gildisrafeindir 72%, rafeindir 39%, rafeinda 43% | *gildi- (as in *gildisrafeind*)* | adopt | *girðitala* is a different concept; most hits are inside *valence electron/bond* |
| rate law | hraðajafna | 9 | 2/135 | hraðalögmálið 88%, efnahvarfsins 35%, stigs 20% | *hraðalögmál* | adopt | decides **12.3** too |
| soluble | auðleystur | 0 | 0/102 | leysanleg 84%, vatni 32%, örlítið 19% | *leysanlegur* | adopt | pair with *insoluble* |
| atomic orbital | frumeindasvigrúm | 0 | 0/83 | atómsvigrúm 93%, skörun 20%, svigrúm 27% | *atómsvigrúm* | adopt | §C157 |
| vapor pressure | gufunarþrýstingur | 4 | 4/83 | gufuþrýstingur 94%, hitastig 38%, vökva 28% | *gufuþrýstingur* | adopt |  |
| cathode | katóða | 12 | 11/78 | bakskaut 85%, forskaut 49%, rafskaut 27% | *bakskaut* | **ask** | family with *anode/electrode*; live was more consistent (see the live-vs-re-MT comparison): *katóða* 98% |
| anode | anóða | 19 | 19/74 | bakskaut 80%, forskaut 65%, rafskaut 31% | *forskaut* | **ask** | family; live was more consistent (see the live-vs-re-MT comparison): *anóða* 96%, and the re-MT reaches *forskaut* in only 55% |
| electrode | raftroð | 0 | 0/72 | rafskaut 65%, bakskaut 26%, forskaut 19% | *rafskaut* | adopt | family; decides **17.3** too |
| radius | geisli | 344 | 3/70 | radíus 60%, atómradíus 30%, yfir 18% | *radíus* | **ask** | §C157 (33/35 in ch06); *geisli* also means *ray* |
| crystalline | kristallskenndur | 0 | 0/66 | kristallað 65%, kristölluðu 36%, efni 48% | *kristallaður* | adopt | pair with *crystalline solid* |
| noble gas | eðalgas | 21 | 19/62 | eðallofttegundir 100%, málmleysingja 26%, mynda 37% | *eðallofttegund* | adopt | decides **18.12** too; live uses *eðalgas-* |
| strong acid | römm sýra | 190 | 1/55 | sýru 48%, sýra 41%, sterk 31% | *sterk sýra* | adopt | the share is split over forms of *sýra* |
| decompose | liða sundur | 258 | 9/49 | brotnar 73%, niður 100%, brotna 23% | *brotna niður* | adopt |  |
| trend | hneigð | 46 | 7/45 | þróun 61%, ásinn 32%, merkingunni 29% | *þróun* | **ask** | periodic trends |
| insoluble | torleystur | 9 | 1/43 | óleysanleg 86%, leysanleg 33%, vatni 24% | *óleysanlegur* | adopt | pair with *soluble* |
| crystalline solid | kristalkennt fastefni | 0 | 0/37 | kristallað 81%, kristölluð 43%, efni 68% | *kristallað fast efni* | adopt | decides **10.6** too |
| dipole moment | tvípólsvægi | 0 | 0/36 | tvískautsvægi 89%, sameindin 50%, sameindarinnar 53% | *tvískautsvægi* | adopt | §C165; consistent with `dipole → tvískaut` |
| chemical properties | efnaeiginleikar | 6 | 5/34 | efnafræðilega 100%, eiginleika 100%, hafa 66% | *efnafræðilegir eiginleikar* | adopt |  |
| mole fraction | mólhlutfall | 11 | 2/33 | mólbrot 71%, mólalstyrkur 26%, mólbroti 19% | *mólbrot* | adopt |  |
| osmotic pressure | flæðiþrýstingur | 0 | 0/33 | osmósuþrýstingur 100%, kjörlausn 27%, osmósa 18% | *osmósuþrýstingur* | adopt | pair with *osmosis* |
| binding energy | bindiorka | 0 | 0/32 | bindisorka 44%, kjarneind 41%, hverja 38% | *bindisorka* | **ask** | one letter; live was more consistent (see the live-vs-re-MT comparison): *bindiorka* 100% |
| nucleon | kjarnaeind | 7 | 7/31 | kjarneind 88%, bindisorka 42%, hverja 46% | *kjarneind* | adopt | one letter |
| conversion factor | umreiknistuðull | 0 | 0/29 | umreikningsstuðlar 93%, einingar 21%, nota 28% | *umreikningsstuðull* | adopt |  |
| node | nóða | 19 | 0/27 | hnútur 26%, andbindandi 30%, geislahnúta 22% | *hnútur* | adopt | §C157 (13/13 in ch06); short word, so its forms split the share |
| vertical axis | lóðás | 0 | 0/27 | lóðrétti 78%, ásinn 89%, línurit 78% | *lóðréttur ás* | adopt |  |
| calorie | kaloría | 9 | 9/26 | hitaeining 88%, næringargildi 47%, meðalfjöldi 29% | *hitaeining* | **ask** | live was more consistent (see the live-vs-re-MT comparison): *kaloría* 100% |
| intermolecular forces | millisameindakraftar | 7 | 3/26 | millikrafta 48%, sameinda 65%, milli 65% | *millikraftar* | **ask** | decides **10.1** too |
| quantitative | magnbundinn | 8 | 5/25 | megindleg 95%, efnagreining 25%, þættir 25% | *megindlegur* | adopt | decides **4.5** too |
| titrant | títrantur | 2 | 2/24 | títrunarvökva 100%, rúmmál 64%, jafngildispunkt 45% | *títrunarvökvi* | adopt |  |
| alloy | melmi | 0 | 0/23 | málmblöndur 61%, málmblanda 22%, stál 22% | *málmblanda* | adopt | two forms of one lemma split the share (*málmblöndur*/*málmblanda*) |
| bent | beygður | 5 | 3/23 | bogin 55%, línuleg 35%, hornlaga 25% | *boginn* | **ask** |  |
| percent yield | prósentuheimtur | 7 | 7/23 | prósentunýtni 63%, fræðileg 38%, nýtni 31% | *prósentunýtni* | **ask** | live was more consistent (see the live-vs-re-MT comparison): *prósentuheimtur* 100% |
| bond energy | tengjaorka | 0 | 0/22 | tengisorka 91%, rjúfa 18%, tengi 27% | *tengisorka* | adopt | §C165 |
| effusion | útsveim | 0 | 0/22 | útstreymi 100%, lofttegunda 45%, grahams 32% | *útstreymi* | adopt | live and prepared **9.4** both already use it |
| polyatomic ion | fjölfrumeinda jón | 2 | 1/21 | fjölatóma 85%, jónir 55%, innihalda 55% | *fjölatóma jón* | adopt |  |
| tungsten | wolfram | 5 | 5/19 | volfram 50%, mólýbden 43%, vanadíum 36% | *volfram* | adopt | spelling (*w* → *v*) |
| lanthanide | lanþaníð | 1 | 1/17 | lantaníða 100%, aktiníðar 19%, jarðalkalímálma 19% | *lantaníð* | adopt | spelling (*þ* → *t*) |
| amplitude | útslag | 4 | 4/16 | sveifluvídd 92%, bylgju 42%, bylgjan 25% | *sveifluvídd* | adopt |  |
| substitution | skiptihvarf | 6 | 5/16 | innsetning 55%, yfirfara 18%, ísetuóhreinindafrumeind 18% | *innsetning* | **ask** |  |
| electron affinity | rafsækni | 0 | 0/15 | rafeindasækni 100%, jónunarorka 33%, stærð 27% | *rafeindasækni* | adopt |  |
| osmosis | himnuflæði | 0 | 0/15 | osmósa 60%, osmósu 60%, osmósuþrýstingur 40% | *osmósa* | adopt | pair; 6 of 15 hits are *reverse osmosis* |
| pigment | þurrlitarefni | 0 | 0/15 | litarefni 87%, málningu 27%, notað 40% | *litarefni* | adopt |  |
| anesthetic | deyfilyf | 4 | 4/12 | svæfingarlyf 100%, notað 63%, skurðaðgerðir 25% | *svæfingarlyf* | adopt |  |
| sacrificial anode | fórnaranóða | 0 | 0/12 | fórnarskaut 100%, verja 42%, bakskautsvörn 50% | *fórnarskaut* | adopt | family |
| starch | mjölvi | 0 | 0/12 | sterkja 42%, sterkju 42%, sterkjudreifing 17% | *sterkja* | adopt | two forms split the share |
| angstrom | aangström | 0 | 0/11 | angström 82%, ljóss 36%, útgeislunarróf 27% | *angström* | adopt | the approved *aangström* looks like a typo |
| classical mechanics | hefðbundin aflfræði | 9 | 0/11 | aflfræði 100%, klassískrar 91%, rafsegulfræði 73% | *klassísk aflfræði* | adopt |  |
| coolant | kæliefni | 4 | 3/11 | kælivökva 50%, kjarnaofn 38%, hvarfleysi 25% | *kælivökvi* | **ask** |  |
| crystal structure | kristallsgerð | 0 | 0/11 | kristalbyggingu 91%, málmatómum 27%, kristallast 36% | *kristalbygging* | adopt |  |
| significant digit | marktækur stafur | 27 | 2/11 | markverðum 89%, staf 22%, núllin 22% | *markverður stafur* | adopt |  |
| square root | ferningsrót | 3 | 1/11 | kvaðratrót 100%, útstreymishraði 40%, öfugu 40% | *kvaðratrót* | adopt |  |
| cathodic protection | katóðuvörn | 0 | 0/10 | bakskautsvörn 100%, tæringu 60%, galvanískt 50% | *bakskautsvörn* | adopt | family |
| chemical symbol | frumefnistákn | 8 | 0/10 | efnatákn 100%, tákna 40%, sérhæft 20% | *efnatákn* | adopt |  |
| diagonal | hornalína | 3 | 3/10 | skálína 29%, skálínu 29%, skálínunnar 29% | *skálína* | adopt | three forms of one lemma split the share |
| dimensional analysis | víddargreining | 0 | 0/10 | víddagreining 100%, einingar 50%, einingabreytingar 30% | *víddagreining* | adopt | one letter |
| lanthanides | lanþaníðar | 1 | 1/10 | lantaníða 100%, aktiníðar 33%, jarðalkalímálma 33% | *lantaníðar* | adopt | spelling (*þ* → *t*) |
| pyramid | strýta | 0 | 0/10 | pýramída 80%, þremur 50%, hornið 30% | *pýramídi* | adopt |  |
| suspension | sviflausn | 4 | 3/10 | grugglausn 57%, meltingarvegar 43%, grugga 29% | *grugglausn* | **ask** |  |

### B — real terms where the MT has no one word (20)

**Default: keep the approved form; editors substitute.** You can name one of the MT's forms instead.

| English | approved | anywhere | where the term is | MT wrote instead | note |
|---|---|---|---|---|---|
| row | lína | 462 | 28/101 | röðin 40%, fyrsti 44%, fyrsta 52% | periodic-table row; *röð* vs approved *lína* |
| extensive | magnbundinn | 8 | 2/33 | eiginleiki 52%, umfangsmikið 16%, varma 19% | thermodynamic property; pair with *intensive* |
| indicator | litvísir | 9 | 9/33 | sýru 54%, basa 50%, vísisins 21% | *vísir* vs approved *litvísir* |
| molar solubility | mólarleysni | 0 | 0/33 | mólleysni 45%, mólleysi 24%, mólleisanleiki 18% | *mólleysni / mólleysi / mólleisanleiki* — three forms |
| functional group | virknihópur | 2 | 2/32 | karboxýlsýrur 27%, kolefnis 40%, innihalda 37% |  |
| complex ion | flókajón | 4 | 4/31 | flóka 26%, komplexjónina 22%, myndunar 30% | *flóki / komplexjón* |
| bond order | tengigráða | 0 | 0/26 | tengistig 27%, sameindasvigrúmsmynd 50%, tengiröðina 19% | *tengistig / tengiröð* |
| intensive | eðlisbundinn | 0 | 0/22 | eiginleiki 77%, magnóháður 32%, efnis 41% | pair with *extensive* |
| abundance | hlutmergð | 0 | 0/19 | náttúruleg 42%, gnægð 26%, hlutfallslegt 53% | isotopic abundance; *gnægð* / *hlutfallsleg* |
| face-centered | hliðarsetinn | 0 | 0/18 | grindareiningar 72%, flatarmiddjuð 39%, horni 39% | cubic cell; *flatarmiðjaður* |
| diffraction | beygja | 19 | 1/17 | röntgengeislar 75%, bylgjulengd 38%, röntgensveigjumynd 25% | X-ray diffraction |
| paramagnetic | meðseglandi | 0 | 0/17 | óparaðar 29%, segulsviði 24%, fersviðsegulmögnuð 18% |  |
| body-centered | miðjusetinn | 0 | 0/16 | rúmmiðjaðri 44%, miðjusettri 38%, grindareiningar 50% | cubic cell; *rúmmiðjaður* |
| transition state | virkniástand | 0 | 0/16 | virkjunarorku 44%, umbreytingarástand 44%, hvarfástand 31% | *umbreytingarástand / hvarfástand* |
| diamagnetic | mótseglandi | 0 | 0/13 | óparaðar 38%, þversviðsegulmagnað 23%, segulsviði 23% |  |
| hydrated | vatnaður | 1 | 1/13 | vökvaða 25%, vökvaðra 25%, vökvaðar 17% | *vökvaður* vs approved *vatnaður* |
| absorption | gleyping | 42 | 1/12 | ljósgleypni 45%, frásogi 18%, gleypni 18% | *gleypni* vs approved *gleyping* |
| radical | stakeind | 4 | 4/12 | hýdroxýlradikal 63%, skemmdum 38%, jónandi 38% | *radikal* vs approved *stakeind* |
| beta particle | betaeind | 1 | 1/11 | betaagnir 40%, alfaagnir 30%, beta 30% | *betaögn* vs *betaeind* |
| trigonal pyramidal | þríhyrningslaga pýramídi | 22 | 0/11 | pýramídi 45%, þríhyrndur 55%, þríhyrningspíramídi 45% |  |

### H — the row names a sense this book does not use (12)

☐ **Default for the class: the row is right for its own sense, and must not raise "missing term" where the
book means something else.** The row stays, and ③ decides how the QA tells the senses apart.

| English | row | where the term is | note |
|---|---|---|---|
| yield | heimtur (chemistry) | 31/313 | the noun (*heimtur*) is right; most hits are the verb (*gefur*) |
| work | vinna (chemistry) | 63/236 | thermodynamic *vinna* vs prose *verk* |
| species | tegund (biology) | 49/155 | row = biological *tegund*; chemical species |
| addition | álagning (chemistry) | 3/134 | *addition reaction* vs prose *in addition* |
| summary | útdráttur (physics) | 0/126 | row = *útdráttur*; the book means the chapter **Summary** heading (*Samantekt*) |
| precipitate | botnfall (chemistry) | 21/64 | noun *botnfall* vs verb *falla út* |
| coordinate | hnit (physics) | 15/43 | row = cartesian *hnit*; the book means **coordinate** bonds/compounds |
| cylinder | sívalningur (physics) | 9/43 | row = geometric *sívalningur*; the book means a **graduated** cylinder |
| base pair | basapar (biology) | 3/21 | row = DNA; the book means **conjugate acid–base pair** |
| optical | ljósfræðilegur (physics) | 2/21 | row = *ljósfræðilegur*; the book means **optical isomers** |
| tan | tangens (physics) | 0/12 | row = *tangens*; the book means the colour |
| plasma | rafgas (physics) | 0/10 | row = *rafgas*; the book mostly means blood plasma |

### C — ordinary English words, not chemistry terms here (40)

☐ **Default for the class: not a term in this book — excluded from chemistry's editor QA.** 40 of 40 are physics or biology rows. Name any that ARE a chemistry term here.

equal → eins (61/323) · result → niðurstaða (104/318) · condition → skilyrði (27/250) · difference → mismunur (49/171) · link → tengja (24/155) · color → litur (41/130) · cause → orsök (6/108) · direction → stefna (29/96) · set → mengi (13/94) · fall → fall (13/45) · plane → slétta (3/45) · estimate → meta (11/44) · gray → grei (1/43) · fundamental → undirstöðu- (0/42) · simulation → eftirlíking (1/42) · electric → raf- (3/38) · day → sólarhringur (0/36) · fluid → straumefni (0/36) · prediction → forsögn (0/32) · basis → grunnur (3/31) · exposed → útsettur (4/29) · purpose → tilgangur (5/29) · adjacent → aðlægur (8/24) · postulate → forsenda (1/24) · solar → sól- (0/23) · tissue → vefur (1/23) · fit → mátun (0/21) · operation → aðgerð (4/17) · arithmetic → reikningur (4/16) · numerical → tölulegur (5/16) · simulator → samlíkir (0/16) · reciprocal → umhverfa (2/15) · bit → biti (0/14) · dependent → háður (3/14) · spatial → rúm- (0/13) · error → skekkja (4/12) · gap → geil (0/12) · response → svörun (1/12) · motor → hreyfill (0/10) · sensitive → næmur (1/10)

### F — census artifacts, nothing to rule (8)

- **freezing** (1/77): most hits are *freezing point* (→ *frostmark*, correct)
- **quotient** (14/48): the hits are *reaction quotient* (→ *hvarfstuðull*, correct); no row needed
- **coefficient** (8/45): *stuðlinum/stuðla* are inflections of the approved *stuðull*
- **standard cell** (0/26): the hits are *standard cell potential* (→ *staðalkerspenna*)
- **wood** (3/13): *viði/viðar* are inflections
- **man** (3/12): *mann* is an inflection
- **inflated** (0/10): *uppblásna* is an inflection
- **local** (1/10): *staðbundna* is an inflection of the approved form

### D — already ruled; editors substitute (2)

- **phase transition → fasabreyting** (5/28): ruled 2026-09-21 (`houseStyleTerms.js`)
- **carbohydrate → sykra** (4/12): ruled 2026-09-21 (*sykra*); 10 of 12 hits are the plural row

*(Part 1 covers the remaining 10 flagged rows.)*

## Provenance

- Terms: `node tools/chapter-term-check.js --book efnafraedi-2e --book-wide --min-segments 10 --threshold 0.35 --json`
  (`--book-wide` added for this sheet; it reads module segment files only, since titles are Part 2).
  The positive control `atom → atóm` reads 1626/1762, matching the 2026-09-26 audit.
- The "anywhere" and longer-term columns, the title census and the classification maps are local scripts, kept with the
  audit evidence (project memory `translation-wrapup-audit-2026-09-24`), in `ruling-sheet-2026-09-26/`.
- The classifications (A/B/H/C/F, lemmas, title defaults) are **judgements**, and exactly what you are
  asked to overrule. The numbers are not.
- ⚠️ This census differs from the audit critic's: 151 rows here against its 41, and *stoichiometry* 0/77 against 0/129. The units
  differ: this sheet counts all domains and whole-word headwords, while the critic counted chemistry-domain rows and the substring
  `stoichiometr`, which also catches *stoichiometric*. Neither count is wrong; they measure different things.
