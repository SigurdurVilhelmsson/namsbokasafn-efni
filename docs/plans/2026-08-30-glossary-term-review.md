# Glossary term review — the 50 entries that gate the first re-MT spend

**Created 2026-08-30 · [LEAD] action required · working document, not a record.**

## Why this exists

These are `approved`, uncontested glossary entries sent to the paid Málstaður MT. A wrong one is **obeyed
partially and unpredictably** (§C73 measured `sodium→natrín` obeyed on 2 of 5 tokens *within one segment
set*), so it is baked into scattered occurrences everywhere and cannot be found by spot-checking output.
No gate can see them — they are well-formed, approved and uncontested. **Only domain knowledge finds them.**

## 🔑 The context sections are a control, not decoration

Every example shows real English from these books **and the Icelandic the pipeline produced for that exact
segment**. That Icelandic was generated against a **1,117-term glossary containing none of the entries under
review**. So each example shows **what Málstaður does UNPROMPTED** — which is exactly §C73's test:

> *Before adding or defending a term, ask what the model does unprompted.*

**If the unprompted Icelandic is already right, the entry buys nothing and risks everything.**

⚠️ **Element symbols are deliberately absent.** `As→arsen` is a correct term with a broken *matching rule* —
`filterGlossaryForText` lowercases both sides, so `As` fires on the English word "as" 3,168 times. That is a
code fix (mine), not a term decision.

## How to fill this in

Put one of these in **VERDICT**; if you write a replacement, put it in **CORRECTED**:

| verdict | meaning |
|---|---|
| `DELETE` | remove the entry — the MT does better unprompted |
| `KEEP` | correct as-is |
| `FIX` | keep the headword, replace the Icelandic |
| `PICK <value>` | two values compete — name the survivor |

🔴 **The fix lands in the terminology DB on production, not in `glossary-unified.json`** — the 2-hourly cron
regenerates that file from the DB, so a JSON edit is overwritten within the hour.

---

| # | English | current Icelandic | occurs | my read | VERDICT | CORRECTED |
|---|---|---|---:|---|---|---|
| 1 | [`is`](#1-is) | lófalægur | 9,202 | **DELETE** — English copula. "lófalægur" is anatomical (palmar). Cannot be right in any chemistry sentence. | | |
| 2 | [`at`](#2-at) | marsnákaætt | 2,085 | **DELETE** — English preposition. "marsnákaætt" is a snake family. | | |
| 3 | [`atom`](#3-atom) | atóm \| frumeind | 1,172 | **PICK** — atóm vs frumeind — both real; pick one per book. | | |
| 4 | [`form`](#4-form) | tilbrigði | 804 | **DELETE** — "tilbrigði" = variant. Ordinary English word. | | |
| 5 | [`structure`](#5-structure) | gerð | 794 | **DELETE** — "gerð" is generic; fires 794x. | | |
| 6 | [`no`](#6-no) | blóð- | 640 | **DELETE** — English negation. "blóð-" is a blood- prefix. | | |
| 7 | [`cell`](#7-cell) | fruma \| rafhlað | 462 | **PICK** — "fruma" is a biological cell; here a cell is electrochemical. | | |
| 8 | [`OR`](#8-or) | gagnlíkindahlutfall | 400 | **DELETE** — Odds ratio (epidemiology). In organic chemistry OR is an alkoxy group, or the English word "or". | | |
| 9 | [`pH`](#9-ph) | sýrustig | 314 | **KEEP** — sýrustig is standard. | | |
| 10 | [`learning`](#10-learning) | nám | 303 | **DELETE** — From "learning objectives" boilerplate. | | |
| 11 | [`equal`](#11-equal) | eins | 294 | **DELETE** — Ordinary English. | | |
| 12 | [`molar`](#12-molar) | jaxl \| mól- | 275 | **PICK** — "jaxl" is a molar TOOTH. | | |
| 13 | [`result`](#13-result) | niðurstaða | 226 | **DELETE** — Ordinary English. | | |
| 14 | [`moles`](#14-moles) | moldvörpur | 214 | **FIX** — **"moldvörpur" is the ANIMAL.** Chemistry plural of mól. | | |
| 15 | [`specific`](#15-specific) | eðlis- \| sértækur | 206 | **PICK** — eðlis- (specific heat) vs sértækur (selective) — different meanings. | | |
| 16 | [`species`](#16-species) | tegund | 205 | **?** — Chemistry does use "species" technically (efnategund). Your call. | | |
| 17 | [`behavior`](#17-behavior) | hegðun | 201 | **DELETE** — Ordinary English. | | |
| 18 | [`case`](#18-case) | tilfelli | 169 | **DELETE** — Ordinary English. | | |
| 19 | [`initial`](#19-initial) | upphafs- \| upphafsfruma | 147 | **PICK** — "upphafsfruma" is a biology term; chemistry wants upphafs-. | | |
| 20 | [`terms`](#20-terms) | tíðir | 136 | **DELETE** — "tíðir" = menstruation. | | |
| 21 | [`information`](#21-information) | upplýsingar | 130 | **DELETE** — Ordinary English. | | |
| 22 | [`simple`](#22-simple) | einfaldur | 119 | **DELETE** — Ordinary English. | | |
| 23 | [`blood`](#23-blood) | blóð | 118 | **KEEP** — Correct, just tagged biology. | | |
| 24 | [`production`](#24-production) | framleiðsla \| myndun | 108 | **PICK** — framleiðsla vs myndun. | | |
| 25 | [`hydrocarbon`](#25-hydrocarbon) | kolvatnsefni \| vetniskol | 88 | **PICK** — kolvatnsefni vs vetniskol. | | |
| 26 | [`equivalent`](#26-equivalent) | jafngildi \| jafngildur | 86 | **PICK** — noun vs adjective. | | |
| 27 | [`tube`](#27-tube) | lampi \| pípa | 74 | **PICK** — lampi = lamp; chemistry wants pípa. | | |
| 28 | [`rays`](#28-rays) | skötur | 67 | **DELETE** — "skötur" = skates (the fish). | | |
| 29 | [`laboratory`](#29-laboratory) | rannsókna \| rannsóknarstofa | 63 | **PICK** — rannsóknarstofa is the noun. | | |
| 30 | [`absorb`](#30-absorb) | gleypa \| taka upp | 58 | **PICK** — gleypa vs taka upp. | | |
| 31 | [`methanol`](#31-methanol) | metanól \| tréspíri | 58 | **PICK** — "tréspíri" is archaic (wood spirit). | | |
| 32 | [`quantity`](#32-quantity) | magn \| stærð | 58 | **PICK** — magn vs stærð. | | |
| 33 | [`nm`](#33-nm) | nanómetri | 55 | **KEEP** — nanómetri correct. | | |
| 34 | [`protein`](#34-protein) | hvíta \| prótín | 37 | **PICK** — prótín vs hvíta. | | |
| 35 | [`CoA`](#35-coa) | kóensím A | 34 | **KEEP** — coenzyme A, correct. | | |
| 36 | [`fit`](#36-fit) | hviða \| mátun | 33 | **PICK** — "hviða" = a seizure. Chemistry wants mátun. | | |
| 37 | [`rank`](#37-rank) | raðgildi | 31 | **?** — "raðgildi" — check. | | |
| 38 | [`drug`](#38-drug) | lyf | 30 | **KEEP** — lyf is correct. | | |
| 39 | [`ppm`](#39-ppm) | milljónarhluti | 30 | **KEEP** — correct. | | |
| 40 | [`site`](#40-site) | set | 30 | **?** — check against virkt set / hvarfset. | | |
| 41 | [`kcal`](#41-kcal) | kílókaloría | 27 | **KEEP** — correct. | | |
| 42 | [`flow`](#42-flow) | flæði | 27 | **KEEP** — flæði correct. | | |
| 43 | [`degenerate`](#43-degenerate) | margfaldur \| margræður | 25 | **PICK** — orbital degeneracy sense. | | |
| 44 | [`diffraction`](#44-diffraction) | beygja \| bognun | 25 | **PICK** — beygja vs bognun. | | |
| 45 | [`barrier`](#45-barrier) | hindrun \| þröskuldur | 24 | **PICK** — activation barrier. | | |
| 46 | [`reagent`](#46-reagent) | prófefni \| virkt efni | 24 | **PICK** — "prófefni" is analytical; organic wants hvarfefni. | | |
| 47 | [`variation`](#47-variation) | breytileiki \| hnikun | 23 | **PICK** — breytileiki vs hnikun. | | |
| 48 | [`anti`](#48-anti) | and- | 21 | **KEEP** — anti- prefix is used in stereochemistry. | | |
| 49 | [`character`](#49-character) | einkenni \| stafur | 20 | **PICK** — einkenni vs stafur (letter). | | |
| 50 | [`family`](#50-family) | fjölskylda \| ætt | 20 | **PICK** — ætt (periodic-table family) vs fjölskylda. | | |

---

# Context — real usage, with the unprompted Icelandic

## 1. `is`

**lófalægur** · 9,202 occurrences · domain `biology` · my read: **DELETE**

*efnafraedi-2e · `m68784:caption:CNX_Chem_11_05_srchlight-caption`*

> **EN:** The paths of searchlight beams are made visible when light is scattered by colloidal-size particles in the air (fog, smoke, etc.). (credit: “Bahman”/Wikimedia Commons)

> **IS (unprompted):** Leiðir ljóskeila verða sýnilegar þegar ljós dreifist af eindum á stærð við svifeindir í loftinu (þoka, reykur o.s.frv.). (mynd: „Bahman“/Wikimedia Commons)

*efnafraedi-2e · `m68784:caption:CNX_Chem_11_05_soap-caption`*

> **EN:** Soaps contain a nonpolar hydrocarbon end (blue) and an ionic end (red). The ionic end is a carboxylate group. The length of the hydrocarbon end can vary from soap to soap.

> **IS (unprompted):** Sápur innihalda óskautaðan kolvetnisenda (blár) og jónískan enda (rauður). Jóníski endinn er karboxýlathópur. Lengd kolvetnisendans getur verið breytileg eftir sápum.


## 2. `at`

**marsnákaætt** · 2,085 occurrences · domain `biology` · my read: **DELETE**

*efnafraedi-2e · `m68784:solution:fs-idm96918992`*

> **EN:** If they are placed in an electrolytic cell, dispersed particles will move toward the electrode that carries a charge opposite to their own charge. At this electrode, the charged particles will be neutralized and will coagulate as a precipitate.

> **IS (unprompted):** Ef þær eru settar í rafker munu dreifðar eindir færast í átt að raftroðinu sem ber gagnstæða hleðslu við þeirra eigin hleðslu. Við þetta raftroð verða hlaðnu eindirnar hlutlausar og storkna sem botnfall.

*efnafraedi-2e · `m68778:item:fs-idm73911888-item-1`*

> **EN:** They are homogeneous; after a solution is mixed, it has the same composition at all points throughout (its composition is uniform).

> **IS (unprompted):** Þær eru einsleitar; eftir að lausn hefur verið blönduð hefur hún sömu samsetningu alls staðar (samsetning hennar er jöfn).


## 3. `atom`

**atóm | frumeind** · 1,172 occurrences · domain `chemistry` · my read: **PICK**

*efnafraedi-2e · `m68735:caption:CNX_Chem_06_05_CovalradiT-caption`*

> **EN:** (a) The radius of an atom is defined as one-half the distance between the nuclei in a molecule consisting of two identical atoms joined by a covalent bond. The atomic radius for the halogens increases down the group as [[i:n]] increases. (b) Covalent radii of the elements are shown to scale. The gen …

> **IS (unprompted):** (a) Radíus frumeindar er skilgreindur sem helmingur fjarlægðarinnar milli kjarnanna í sameind sem samanstendur af tveimur eins frumeindum sem tengdar eru með samgildu tengi. Atómradíus halógena eykst niður eftir hópnum eftir því sem [[i:n]] eykst. (b) Samgildir radíusar frumefnanna eru sýndir í rétt …

*efnafraedi-2e · `m68735:para:fs-idm138739760`*

> **EN:** Give an example of an atom whose size is smaller than fluorine.

> **IS (unprompted):** Nefndu dæmi um frumeind sem er minni en flúor.


## 4. `form`

**tilbrigði** · 804 occurrences · domain `biology` · my read: **DELETE**

*efnafraedi-2e · `m68784:item:fs-idp50702640-item-2`*

> **EN:** Condensation methods: growth from smaller units, such as molecules or ions. For example, clouds form when water molecules condense and form very small droplets.

> **IS (unprompted):** Þéttingaraðferðir: vöxtur úr smærri einingum, svo sem sameindum eða jónum. Til dæmis myndast ský þegar vatnssameindir þéttast og mynda mjög litla dropa.

*efnafraedi-2e · `m68784:para:fs-idm84168496`*

> **EN:** A few solid substances, when brought into contact with water, disperse spontaneously and form colloidal systems. Gelatin, glue, starch, and dehydrated milk powder behave in this manner. The particles are already of colloidal size; the water simply disperses them. Powdered milk particles of colloidal …

> **IS (unprompted):** Nokkur föst efni dreifast sjálfkrafa og mynda kvoðukerfi þegar þau komast í snertingu við vatn. Matarlím, lím, sterkja og þurrkað mjólkurduft hegða sér á þennan hátt. Eindirnar eru þegar af kvoðustærð; vatnið einfaldlega dreifir þeim. Mjólkurduftseindir af kvoðustærð eru framleiddar með því að þurrk …


## 5. `structure`

**gerð** · 794 occurrences · domain `biology` · my read: **DELETE**

*efnafraedi-2e · `m68784:caption:CNX_Chem_11_05_oilspill-caption`*

> **EN:** (a) This NASA satellite image shows the oil slick from the Deepwater Horizon spill. (b) A US Air Force plane sprays Corexit, a dispersant. (c) The molecular structure of 2-butoxyethanol is shown. (credit a: modification of work by “NASA, FT2, demis.nl”/Wikimedia Commons; credit b: modification of wo …

> **IS (unprompted):** (a) Þessi gervihnattamynd frá NASA sýnir olíubrákina frá Deepwater Horizon-lekanum. (b) Flugvél frá bandaríska flughernum úðar Corexit, dreifiefni. (c) Sameindabygging 2-bútoxýetanóls er sýnd. (mynd a: breytt útgáfa af verki eftir „NASA, FT2, demis.nl“/Wikimedia Commons; mynd b: breytt útgáfa af ver …

*efnafraedi-2e · `m68734:para:fs-idp32474800`*

> **EN:** Having introduced the basics of atomic structure and quantum mechanics, we can use our understanding of quantum numbers to determine how atomic orbitals relate to one another. This allows us to determine which orbitals are occupied by electrons in each atom. The specific arrangement of electrons in  …

> **IS (unprompted):** Nú þegar við höfum kynnt grunnatriði atómbyggingar og skammtafræði getum við notað skilning okkar á skammtatölum til að ákvarða hvernig atómsvigrúm tengjast hvert öðru. Þetta gerir okkur kleift að ákvarða hvaða svigrúm eru setin af rafeindum í hverju atómi. Hin sérstaka fyrirkomulag rafeinda í svigr …


## 6. `no`

**blóð-** · 640 occurrences · domain `biology` · my read: **DELETE**

*efnafraedi-2e · `m68781:para:fs-idm10993712`*

> **EN:** In some cases, solutions prepared from covalent compounds conduct electricity because the solute molecules react chemically with the solvent to produce ions. For example, pure hydrogen chloride is a gas consisting of covalent HCl molecules. This gas contains no ions. However, an aqueous solution of  …

> **IS (unprompted):** Í sumum tilfellum leiða lausnir úr samgildum efnasamböndum rafmagn vegna þess að sameindir leysis efnisins hvarfast efnafræðilega við leysinn og mynda jónir. Til dæmis er hreint vetnisklóríð gas sem samanstendur af samgildum HCl-sameindum. Þetta gas inniheldur engar jónir. Hins vegar er vatnslausn a …

*efnafraedi-2e · `m68781:problem:fs-idm78750672`*

> **EN:** (a) Which of the following sketches best represents the ions in a solution of Fe(NO[[sub:3]])[[sub:3]]([[i:aq]])?

> **IS (unprompted):** (a) Hver af eftirfarandi skissum táknar best jónirnar í lausn af Fe(NO[[sub:3]])[[sub:3]]([[i:aq]])?


## 7. `cell`

**fruma | rafhlað** · 462 occurrences · domain `biology,physics` · my read: **PICK**

*efnafraedi-2e · `m68784:solution:fs-idm96918992`*

> **EN:** If they are placed in an electrolytic cell, dispersed particles will move toward the electrode that carries a charge opposite to their own charge. At this electrode, the charged particles will be neutralized and will coagulate as a precipitate.

> **IS (unprompted):** Ef þær eru settar í rafker munu dreifðar eindir færast í átt að raftroðinu sem ber gagnstæða hleðslu við þeirra eigin hleðslu. Við þetta raftroð verða hlaðnu eindirnar hlutlausar og storkna sem botnfall.

*efnafraedi-2e · `m68783:caption:CNX_Chem_11_04_bloodcell-caption`*

> **EN:** Red blood cell membranes are water permeable and will (a) swell and possibly rupture in a hypotonic solution; (b) maintain normal volume and shape in an isotonic solution; and (c) shrivel and possibly die in a hypertonic solution. (credit a/b/c: modifications of work by “LadyofHats”/Wikimedia common …

> **IS (unprompted):** Himnur rauðra blóðkorna eru vatnsgegndræpar og munu (a) bólgna og hugsanlega springa í undirþrýstinni lausn; (b) halda eðlilegu rúmmáli og lögun í samþrýstinni lausn; og (c) skreppa saman og hugsanlega deyja í yfirþrýstinni lausn. (mynd a/b/c: breytingar á verki eftir „LadyofHats“/Wikimedia commons)


## 8. `OR`

**gagnlíkindahlutfall** · 400 occurrences · domain `biology` · my read: **DELETE**

*efnafraedi-2e · `m68784:para:fs-idm77182288`*

> **EN:** The particles in a colloid are large enough to scatter light, a phenomenon called the {{term}}Tyndall effect{{/term}}. This can make colloidal mixtures appear cloudy or opaque, such as the searchlight beams shown in [[xref:CNX_Chem_11_05_srchlight]]. Clouds are colloidal mixtures. They are composed  …

> **IS (unprompted):** Eindirnar í svifi eru nógu stórar til að dreifa ljósi, fyrirbæri sem kallast {{term}}Tyndall-hrif{{/term}}. Þetta getur gert svifblöndur skýjaðar eða ógegnsæjar, eins og sést á ljóskeilunum á [#CNX_Chem_11_05_srchlight]. Ský eru svifblöndur. Þau samanstanda af vatnsdropum sem eru mun stærri en samei …

*efnafraedi-2e · `m68784:item:fs-idp50702640-item-2`*

> **EN:** Condensation methods: growth from smaller units, such as molecules or ions. For example, clouds form when water molecules condense and form very small droplets.

> **IS (unprompted):** Þéttingaraðferðir: vöxtur úr smærri einingum, svo sem sameindum eða jónum. Til dæmis myndast ský þegar vatnssameindir þéttast og mynda mjög litla dropa.


## 9. `pH`

**sýrustig** · 314 occurrences · domain `biology` · my read: **KEEP**

*efnafraedi-2e · `m68836:problem:fs-idm66070064`*

> **EN:** Describe the hybridization of phosphorus in each of the following compounds: P[[sub:4]]O[[sub:10]], P[[sub:4]]O[[sub:6]], PH[[sub:4]]I (an ionic compound), PBr[[sub:3]], H[[sub:3]]PO[[sub:4]], H[[sub:3]]PO[[sub:3]], PH[[sub:3]], and P[[sub:2]]H[[sub:4]]. You may wish to review the chapter on advance …

> **IS (unprompted):** Lýstu blendingssvigrúmum fosfórs í hverju eftirfarandi efnasambandi: P[[sub:4]]O[[sub:10]], P[[sub:4]]O[[sub:6]], PH[[sub:4]]I (jónaefni), PBr[[sub:3]], H[[sub:3]]PO[[sub:4]], H[[sub:3]]PO[[sub:3]], PH[[sub:3]] og P[[sub:2]]H[[sub:4]]. Þú gætir viljað rifja upp kaflann um flóknari kenningar um samgi …

*efnafraedi-2e · `m68761:problem:fs-idp57555904`*

> **EN:** Silane (SiH[[sub:4]]), phosphine (PH[[sub:3]]), and hydrogen sulfide (H[[sub:2]]S) melt at −185 °C, −133 °C, and −85 °C, respectively. What does this suggest about the polar character and intermolecular attractions of the three compounds?

> **IS (unprompted):** Sían (SiH[[sub:4]]), fosfín (PH[[sub:3]]) og brennisteinsvetni (H[[sub:2]]S) bráðna við −185 °C, −133 °C og −85 °C. Hvað gefur þetta til kynna um skautað eðli og millisameinda aðdráttarkrafta þessara þriggja efnasambanda?


## 10. `learning`

**nám** · 303 occurrences · domain `biology` · my read: **DELETE**

*efnafraedi-2e · `m68727:problem:fs-idm121017200`*

> **EN:** Using the data in the check your learning section of [[docref:m68726#fs-idm19242032]], calculate Δ[[i:H]] in kJ/mol of AgNO[[sub:3]]([[i:aq]]) for the reaction: [[MATH:74]]

> **IS (unprompted):** Notaðu gögnin í hlutanum „Kannaðu þekkingu þína“ í [[docref:m68726#fs-idm19242032]] til að reikna út Δ[[i:H]] í kJ/mól af AgNO[[sub:3]]([[i:aq]]) fyrir efnahvarfið: [[MATH:74]]

*efnafraedi-2e · `m68662:para:pref-p-001`*

> **EN:** Welcome to Chemistry 2e, an OpenStax resource. This textbook was written to increase student access to high-quality learning materials, maintaining highest standards of academic rigor at little to no cost.

> **IS (unprompted):** Velkomin í Efnafræði 2e, námsefni frá OpenStax. Þessi kennslubók var skrifuð til að auka aðgengi nemenda að hágæða námsefni, með ströngustu kröfum um akademísk gæði, án nokkurs kostnaðar eða fyrir mjög lítinn kostnað.


## 11. `equal`

**eins** · 294 occurrences · domain `biology` · my read: **DELETE**

*efnafraedi-2e · `m68783:para:fs-idm378409280`*

> **EN:** By this definition, the sum of mole fractions for all solution components (the solvent and all solutes) is equal to one.

> **IS (unprompted):** Samkvæmt þessari skilgreiningu er summa mólhlutfalla allra efnisþátta lausnarinnar (leysirinn og öll leystu efnin) jöfn einum.

*efnafraedi-2e · `m68783:para:fs-idp32351520`*

> **EN:** As described in the chapter on liquids and solids, the equilibrium vapor pressure of a liquid is the pressure exerted by its gaseous phase when vaporization and condensation are occurring at equal rates:

> **IS (unprompted):** Eins og lýst er í kaflanum um vökva og föst efni er jafnvægisgufunarþrýstingur vökva sá þrýstingur sem gasfasi hans beitir þegar uppgufun og þétting eiga sér stað á jöfnum hraða:


## 12. `molar`

**jaxl | mól-** · 275 occurrences · domain `biology,physics` · my read: **PICK**

*efnafraedi-2e · `m68783:para:fs-idp135152880`*

> **EN:** Several units commonly used to express the concentrations of solution components were introduced in an earlier chapter of this text, each providing certain benefits for use in different applications. For example, molarity ([[i:M]]) is a convenient unit for use in stoichiometric calculations, since i …

> **IS (unprompted):** Nokkrar einingar sem almennt eru notaðar til að lýsa styrk efnisþátta í lausn voru kynntar í fyrri kafla þessarar bókar, en hver þeirra hefur ákveðna kosti fyrir mismunandi notkun. Til dæmis er mólstyrkur ([[i:M]]) hentug eining til notkunar í efnajöfnureikningum, þar sem hann er skilgreindur út frá …

*efnafraedi-2e · `m68783:para:fs-idp89990944`*

> **EN:** The mole fraction, [[i:X]], of a component is the ratio of its molar amount to the total number of moles of all solution components:

> **IS (unprompted):** Mólhlutfall, [[i:X]], efnisþáttar er hlutfall mólmagns hans og heildarfjölda móla allra efnisþátta lausnarinnar:


## 13. `result`

**niðurstaða** · 226 occurrences · domain `biology` · my read: **DELETE**

*efnafraedi-2e · `m68783:item:fs-idm38965696-item-1`*

> **EN:** [[i:Convert from grams to moles of]] I[[sub:2]] [[i:using the molar mass of]] I[[sub:2]] [[i:in the unit conversion factor.]][[BR]] Result: 0.363 mol

> **IS (unprompted):** [[i:Umbreyttu grömmum í mól af]] I[[sub:2]] [[i:með því að nota mólmassa]] I[[sub:2]] [[i:í einingabreytingarstuðlinum.]][[BR]] Niðurstaða: 0,363 mól

*efnafraedi-2e · `m68783:item:fs-idm38965696-item-2`*

> **EN:** [[i:Determine the molality of the solution from the number of moles of solute and the mass of solvent, in kilograms.]][[BR]] Result: 0.454 [[i:m]]

> **IS (unprompted):** [[i:Ákvarðaðu mólalstyrk lausnarinnar út frá fjölda móla leysta efnisins og massa leysisins, í kílógrömmum.]][[BR]] Niðurstaða: 0,454 [[i:m]]


## 14. `moles`

**moldvörpur** · 214 occurrences · domain `biology` · my read: **FIX**

*efnafraedi-2e · `m68783:para:fs-idp89990944`*

> **EN:** The mole fraction, [[i:X]], of a component is the ratio of its molar amount to the total number of moles of all solution components:

> **IS (unprompted):** Mólhlutfall, [[i:X]], efnisþáttar er hlutfall mólmagns hans og heildarfjölda móla allra efnisþátta lausnarinnar:

*efnafraedi-2e · `m68783:para:fs-idm64867536`*

> **EN:** {{term}}Molality{{/term}} is a concentration unit defined as the ratio of the numbers of moles of solute to the mass of the solvent in kilograms:

> **IS (unprompted):** {{term}}Mólalstyrkur{{/term}} er styrkeining sem er skilgreind sem hlutfall fjölda móla leysts efnis og massa leysisins í kílógrömmum:


## 15. `specific`

**eðlis- | sértækur** · 206 occurrences · domain `biology,physics` · my read: **PICK**

*efnafraedi-2e · `m68776:caption:CNX_Chem_11_00_coralreef-caption`*

> **EN:** Coral reefs, such as this one at the Palmyra Atoll National Wildlife Refuge, are vital to the ecosystem of earth’s oceans. The health of coral reefs and all marine life depends on the specific chemical composition of the complex mixture known as seawater. (credit: modification of work by “USFWS – Pa …

> **IS (unprompted):** Kóralrif, eins og þetta í Palmyra Atoll National Wildlife Refuge, eru lífsnauðsynleg fyrir vistkerfi heimshafanna. Heilbrigði kóralrifja og alls sjávarlífs veltur á sérstakri efnasamsetningu þeirrar flóknu efnablöndu sem nefnist sjór. (Heimild: breytt útgáfa af verki „USFWS – Pacific Region“/Wikimed …

*efnafraedi-2e · `m68734:para:fs-idp32474800`*

> **EN:** Having introduced the basics of atomic structure and quantum mechanics, we can use our understanding of quantum numbers to determine how atomic orbitals relate to one another. This allows us to determine which orbitals are occupied by electrons in each atom. The specific arrangement of electrons in  …

> **IS (unprompted):** Nú þegar við höfum kynnt grunnatriði atómbyggingar og skammtafræði getum við notað skilning okkar á skammtatölum til að ákvarða hvernig atómsvigrúm tengjast hvert öðru. Þetta gerir okkur kleift að ákvarða hvaða svigrúm eru setin af rafeindum í hverju atómi. Hin sérstaka fyrirkomulag rafeinda í svigr …


## 16. `species`

**tegund** · 205 occurrences · domain `biology` · my read: **?**

*efnafraedi-2e · `m68784:solution:fs-idm95482864`*

> **EN:** Colloidal dispersions consist of particles that are much bigger than the solutes of typical solutions. Colloidal particles are either very large molecules or aggregates of smaller species that usually are big enough to scatter light. Colloids are homogeneous on a macroscopic (visual) scale, while so …

> **IS (unprompted):** Svifdreifingar samanstanda af eindum sem eru mun stærri en uppleystu efnin í dæmigerðum lausnum. Svifeindir eru annaðhvort mjög stórar sameindir eða þyrpingar smærri efna sem eru venjulega nógu stórar til að dreifa ljósi. Svif eru einsleit á stórsæjum (sjónrænum) skala, en lausnir eru einsleitar á s …

*efnafraedi-2e · `m68778:item:fs-idm73911888-item-3`*

> **EN:** The components of a solution are dispersed on a molecular scale; they consist of a mixture of separated solute particles (molecules, atoms, and/or ions) each closely surrounded by solvent species.

> **IS (unprompted):** Innihaldsefni lausnar eru dreifð á sameindastigi; þau samanstanda af efnablöndu aðskilinna agna leysta efnisins (sameinda, atóma og/eða jóna) sem hver um sig er umlukin leysiefnum.


## 17. `behavior`

**hegðun** · 201 occurrences · domain `biology` · my read: **DELETE**

*efnafraedi-2e · `m68783:para:fs-idm111724384`*

> **EN:** A solution contains 5.00 g of urea, CO(NH[[sub:2]])[[sub:2]] (a nonvolatile solute) and 0.100 kg of water. If the vapor pressure of pure water at 25 °C is 23.7 torr, what is the vapor pressure of the solution assuming ideal behavior?

> **IS (unprompted):** Lausn inniheldur 5,00 g af þvagefni, CO(NH[[sub:2]])[[sub:2]] (órokgjarnt leysið efni) og 0,100 kg af vatni. Ef gufunarþrýstingur hreins vatns við 25 °C er 23,7 torr, hver er þá gufunarþrýstingur lausnarinnar ef gert er ráð fyrir kjörhegðun?

*efnafraedi-2e · `m68783:para:fs-idp139740576`*

> **EN:** Assuming ideal solution behavior, what is the boiling point of a 0.33 [[i:m]] solution of a nonvolatile solute in benzene?

> **IS (unprompted):** Miðað við hegðun kjörlausnar, hvert er suðumark 0,33 [[i:m]] lausnar af órokgjörnu leystu efni í benseni?


## 18. `case`

**tilfelli** · 169 occurrences · domain `biology` · my read: **DELETE**

*efnafraedi-2e · `m68783:para:fs-idp102839264`*

> **EN:** Converting from one concentration unit to another is accomplished by first comparing the two unit definitions. In this case, both units have the same numerator (moles of solute) but different denominators. The provided molal concentration may be written as:

> **IS (unprompted):** Umbreyting úr einni styrkeiningu í aðra er framkvæmd með því að bera fyrst saman skilgreiningar eininganna tveggja. Í þessu tilviki hafa báðar einingarnar sama teljara (mól leysts efnis) en mismunandi nefnara. Uppgefinn mólalstyrk má skrifa sem:

*efnafraedi-2e · `m68782:para:fs-idp69198064`*

> **EN:** According to Henry’s law, for an ideal solution the solubility, [[i:C]][[sub:g]], of a gas (1.38 [[MATH:2]] 10[[sup:−3]] mol L[[sup:−1]], in this case) is directly proportional to the pressure, [[i:P]][[sub:g]], of the undissolved gas above the solution (101.3 kPa in this case). Because both [[i:C]] …

> **IS (unprompted):** Samkvæmt lögmáli Henrys er leysni, {{i}}C{{/i}}[[sub:g]], loftegundar (1,38 [[MATH:2]] 10[[sup:−3]] mól L[[sup:−1]] í þessu tilfelli) í kjörlausn í beinu hlutfalli við þrýsting, {{i}}P{{/i}}[[sub:g]], óuppleystu loftegundarinnar fyrir ofan lausnina (101,3 kPa í þessu tilfelli). Þar sem bæði {{i}}C{{ …


## 19. `initial`

**upphafs- | upphafsfruma** · 147 occurrences · domain `biology,physics` · my read: **PICK**

*efnafraedi-2e · `m68733:para:fs-idm187603312`*

> **EN:** The values [[i:n]][[sub:f]] and [[i:n]][[sub:i]] are the final and initial energy states of the electron. [[docref:m68732#fs-idp30549440]] in the previous section of the chapter demonstrates calculations of such energy changes.

> **IS (unprompted):** Gildin [[i:n]][[sub:f]] og [[i:n]][[sub:i]] eru loka- og upphafsorkuástönd rafeindarinnar. [[docref:m68732#fs-idp30549440]] í fyrri hluta kaflans sýnir útreikninga á slíkum orkubreytingum.

*efnafraedi-2e · `m68732:para:fs-idp36624368`*

> **EN:** In this equation, [[i:h]] is Planck’s constant and [[i:E[[sub:i]]]] and [[i:E[[sub:f]]]] are the initial and final orbital energies, respectively. The absolute value of the energy difference is used, since frequencies and wavelengths are always positive. Instead of allowing for continuous values of  …

> **IS (unprompted):** Í þessari jöfnu er {{i}}h{{/i}} fasti Plancks og {{i}}E[[sub:i]]{{/i}} og {{i}}E[[sub:f]]{{/i}} eru upphafs- og lokaorka brautarinnar, í sömu röð. Algildi orkumunarins er notað, þar sem tíðni og bylgjulengdir eru alltaf jákvæðar. Í stað þess að leyfa samfelld orkugildi gerði Bohr ráð fyrir að orka þ …


## 20. `terms`

**tíðir** · 136 occurrences · domain `biology` · my read: **DELETE**

*efnafraedi-2e · `m68783:para:fs-idp135152880`*

> **EN:** Several units commonly used to express the concentrations of solution components were introduced in an earlier chapter of this text, each providing certain benefits for use in different applications. For example, molarity ([[i:M]]) is a convenient unit for use in stoichiometric calculations, since i …

> **IS (unprompted):** Nokkrar einingar sem almennt eru notaðar til að lýsa styrk efnisþátta í lausn voru kynntar í fyrri kafla þessarar bókar, en hver þeirra hefur ákveðna kosti fyrir mismunandi notkun. Til dæmis er mólstyrkur ([[i:M]]) hentug eining til notkunar í efnajöfnureikningum, þar sem hann er skilgreindur út frá …

*efnafraedi-2e · `m68732:para:fs-idp4750336`*

> **EN:** The sizes of the circular orbits for hydrogen-like atoms are given in terms of their radii by the following expression, in which [[MATH:4]] is a constant called the Bohr radius, with a value of 5.292 [[MATH:5]] 10[[sup:−11]] m:

> **IS (unprompted):** Stærðir hringlaga sporbauga fyrir vetnislíkar frumeindir eru gefnar með geislum þeirra með eftirfarandi segð, þar sem [[MATH:4]] er fasti sem kallast Bór-radíus, með gildið 5,292 [[MATH:5]] 10[[sup:−11]] m:


## 21. `information`

**upplýsingar** · 130 occurrences · domain `biology` · my read: **DELETE**

*efnafraedi-2e · `m68783:para:fs-idp14421616`*

> **EN:** The concentration of ions in seawater is approximately the same as that in a solution containing 4.2 g of NaCl dissolved in 125 g of water. Use this information and a predicted value for the van’t Hoff factor ([[xref:fs-idp191832160]]) to determine the freezing temperature the solution (assume ideal …

> **IS (unprompted):** Styrkur jóna í sjó er um það bil sá sami og í lausn sem inniheldur 4,2 g af NaCl leyst upp í 125 g af vatni. Notið þessar upplýsingar og áætlað gildi fyrir van't Hoff-stuðulinn ([[xref:fs-idp191832160]]) til að ákvarða frostmark lausnarinnar (gerið ráð fyrir hegðun kjörlausnar).

*efnafraedi-2e · `m68734:para:fs-idp45944160`*

> **EN:** The arrangement of electrons in the orbitals of an atom is called the {{term}}electron configuration{{/term}} of the atom. We describe an electron configuration with a symbol that contains three pieces of information ([[xref:CNX_Chem_06_04_Econfig]]):

> **IS (unprompted):** Fyrirkomulag rafeinda í svigrúmum atóms er kallað {{term}}rafeindaskipan{{/term}} atómsins. Við lýsum rafeindaskipan með tákni sem inniheldur þrjár upplýsingar ([[xref:CNX_Chem_06_04_Econfig]]):


## 22. `simple`

**einfaldur** · 119 occurrences · domain `biology` · my read: **DELETE**

*efnafraedi-2e · `m68734:caption:CNX_Chem_06_04_Econtable-caption`*

> **EN:** This partial periodic table shows electron configurations for the valence subshells of atoms. By “building up” from hydrogen, this table can be used to determine the electron configuration for atoms of most elements in the periodic table. (Electron configurations of the lanthanides and actinides are …

> **IS (unprompted):** Þessi hluti lotukerfisins sýnir rafeindaskipanir fyrir gildisundirsvið atóma. Með því að „byggja upp“ frá vetni er hægt að nota þessa töflu til að ákvarða rafeindaskipan fyrir atóm flestra frumefna í lotukerfinu. (Rafeindaskipanir lantaníða og aktiníða eru ekki nákvæmlega spáð með þessari einföldu a …

*efnafraedi-2e · `m68709:para:fs-idp8426240`*

> **EN:** A balanced chemical equation often may be derived from a qualitative description of some chemical reaction by a fairly simple approach known as balancing by inspection. Consider as an example the decomposition of water to yield molecular hydrogen and oxygen. This process is represented qualitatively …

> **IS (unprompted):** Oft er hægt að leiða út stillta efnajöfnu út frá þáttbundinni lýsingu á efnahvarfi með frekar einfaldri aðferð sem kallast stilling með yfirsýn. Tökum sem dæmi sundrun vatns til að mynda vetni og súrefni á sameindaformi. Þetta ferli er táknað með {{i}}óstilltri{{/i}} efnajöfnu:


## 23. `blood`

**blóð** · 118 occurrences · domain `biology` · my read: **KEEP**

*efnafraedi-2e · `m68783:caption:CNX_Chem_11_04_bloodcell-caption`*

> **EN:** Red blood cell membranes are water permeable and will (a) swell and possibly rupture in a hypotonic solution; (b) maintain normal volume and shape in an isotonic solution; and (c) shrivel and possibly die in a hypertonic solution. (credit a/b/c: modifications of work by “LadyofHats”/Wikimedia common …

> **IS (unprompted):** Himnur rauðra blóðkorna eru vatnsgegndræpar og munu (a) bólgna og hugsanlega springa í undirþrýstinni lausn; (b) halda eðlilegu rúmmáli og lögun í samþrýstinni lausn; og (c) skreppa saman og hugsanlega deyja í yfirþrýstinni lausn. (mynd a/b/c: breytingar á verki eftir „LadyofHats“/Wikimedia commons)

*efnafraedi-2e · `m68783:problem:fs-idp135109440`*

> **EN:** The osmotic pressure of human blood is 7.6 atm at 37 °C. What mass of glucose, C[[sub:6]]H[[sub:12]]O[[sub:6]], is required to make 1.00 L of aqueous solution for intravenous feeding if the solution must have the same osmotic pressure as blood at body temperature, 37 °C (assuming ideal solution beha …

> **IS (unprompted):** Osmósuþrýstingur mannsblóðs er 7,6 atm við 37 °C. Hve mikinn massa af glúkósa, C[[sub:6]]H[[sub:12]]O[[sub:6]], þarf til að búa til 1,00 L af vatnslausn fyrir gjöf í æð ef lausnin verður að hafa sama osmósuþrýsting og blóð við líkamshita, 37 °C (miðað við hegðun kjörlausnar)?


## 24. `production`

**framleiðsla | myndun** · 108 occurrences · domain `biology,physics` · my read: **PICK**

*efnafraedi-2e · `m68667:caption:CNX_Chem_01_02_ConsMatter-caption`*

> **EN:** (a) The mass of beer precursor materials is the same as the mass of beer produced: Sugar has become alcohol and carbon dioxide. (b) The mass of the lead, lead oxide, and sulfuric acid consumed by the production of electricity is exactly equal to the mass of lead sulfate and water that is formed.

> **IS (unprompted):** (a) Massi hráefna í bjór er sá sami og massi bjórsins sem framleiddur er: Sykur hefur breyst í alkóhól og koldíoxíð. (b) Massi blýs, blýoxíðs og brennisteinssýru sem eyðist við framleiðslu rafmagns er nákvæmlega jafn massa blýsúlfats og vatns sem myndast.

*efnafraedi-2e · `m68833:para:fs-idp151776640`*

> **EN:** Two thirds of the world’s hydrogen production is devoted to the manufacture of ammonia, which is a fertilizer and used in the manufacture of nitric acid. Large quantities of hydrogen are also important in the process of {{term}}hydrogenation{{/term}}, discussed in the chapter on organic chemistry.

> **IS (unprompted):** Tveir þriðju hlutar af vetnisframleiðslu heimsins eru notaðir til framleiðslu á ammoníaki, sem er áburður og notað við framleiðslu á saltpéturssýru. Mikið magn af vetni er einnig mikilvægt í ferli sem kallast {{term}}vetnun{{/term}}, sem fjallað er um í kaflanum um lífræna efnafræði.


## 25. `hydrocarbon`

**kolvatnsefni | vetniskol** · 88 occurrences · domain `biology,physics` · my read: **PICK**

*efnafraedi-2e · `m68784:caption:CNX_Chem_11_05_soap-caption`*

> **EN:** Soaps contain a nonpolar hydrocarbon end (blue) and an ionic end (red). The ionic end is a carboxylate group. The length of the hydrocarbon end can vary from soap to soap.

> **IS (unprompted):** Sápur innihalda óskautaðan kolvetnisenda (blár) og jónískan enda (rauður). Jóníski endinn er karboxýlathópur. Lengd kolvetnisendans getur verið breytileg eftir sápum.

*efnafraedi-2e · `m68784:para:fs-idm189696128`*

> **EN:** [[i:Detergents]] (soap substitutes) also contain nonpolar hydrocarbon chains, such as C[[sub:12]]H[[sub:25]]—, and an ionic group, such as a sulfate—[[MATH:2]] or a sulfonate—[[MATH:3]] ([[xref:CNX_Chem_11_05_detrg]]). Soaps form insoluble calcium and magnesium compounds in hard water; detergents fo …

> **IS (unprompted):** {{i}}Hreinsiefni{{/i}} (sápustaðgenglar) innihalda einnig óskautaðar kolvetniskeðjur, svo sem C[[sub:12]]H[[sub:25]]—, og jónískan hóp, svo sem súlfat—[[MATH:2]] eða súlfónat—[[MATH:3]] ([#CNX_Chem_11_05_detrg]). Sápur mynda torleyst kalsíum- og magnesíumsambönd í hörðu vatni; hreinsiefni mynda vatn …


## 26. `equivalent`

**jafngildi | jafngildur** · 86 occurrences · domain `biology,physics` · my read: **PICK**

*efnafraedi-2e · `m68674:para:fs-idm163691744`*

> **EN:** A {{term}}cubic centimeter (cm[[sup:3]]){{/term}} is the volume of a cube with an edge length of exactly one centimeter. The abbreviation [[b:cc]] (for [[b:c]]ubic [[b:c]]entimeter) is often used by health professionals. A cubic centimeter is equivalent to a {{term}}milliliter (mL){{/term}} and is 1 …

> **IS (unprompted):** __Rúmsentimetri (cm^3^)__ er rúmmál tenings með brúnlengd nákvæmlega einn sentimetra. Skammstöfunin **cc** (úr ensku **c**ubic **c**entimeter) er oft notuð af heilbrigðisstarfsfólki. Einn rúmsentimetri jafngildir einum __millilítra (mL)__ og er 1/1000 úr lítra.

*efnafraedi-2e · `m68683:para:fs-idm273312256`*

> **EN:** A ratio of two equivalent quantities expressed with different measurement units can be used as a {{term}}unit conversion factor{{/term}}. For example, the lengths of 2.54 cm and 1 in. are equivalent (by definition), and so a unit conversion factor may be derived from the ratio,

> **IS (unprompted):** Hlutfall tveggja jafngildra stærða sem gefnar eru upp með mismunandi mælieiningum má nota sem __umreikningsstuðul fyrir einingar__. Til dæmis eru lengdirnar 2,54 cm og 1 tommur jafngildar (samkvæmt skilgreiningu) og því má leiða út umreikningsstuðul fyrir einingar úr hlutfallinu,


## 27. `tube`

**lampi | pípa** · 74 occurrences · domain `biology,physics` · my read: **PICK**

*efnafraedi-2e · `m68832:para:fs-idm41398960`*

> **EN:** Graphene and carbon nanotubes are two recently discovered allotropes of carbon. Both of the forms bear some relationship to graphite. Graphene is a single layer of graphite (one atom thick), as illustrated in [[xref:CNX_Chem_18_04_Nanotube]], whereas carbon nanotubes roll the layer into a small tube …

> **IS (unprompted):** Grafen og kolefnisnanórör eru tvö nýlega uppgötvuð fjölgervisform kolefnis. Bæði formin eiga nokkuð skylt við grafít. Grafen er eitt lag af grafíti (einnar frumeindar þykkt), eins og sýnt er á [#CNX_Chem_18_04_Nanotube], en kolefnisnanórör rúlla laginu upp í lítið rör, eins og sýnt er á [#CNX_Chem_1 …

*efnafraedi-2e · `m68832:para:fs-idm231566608`*

> **EN:** Carbon nanotubes are carbon allotropes, which have a cylindrical structure. Like graphite and graphene, nanotubes consist of rings of [[i:sp]][[sup:2]]-hybridized carbon atoms. Unlike graphite and graphene, which occur in layers, the layers wrap into a tube and bond together to produce a stable stru …

> **IS (unprompted):** Kolefnisnanórör eru fjölgervisform kolefnis sem hafa sívalningslaga byggingu. Eins og grafít og grafen samanstanda nanórör af hringjum af {{i}}sp{{/i}}[[sup:2]]-tvinnblönduðum kolefnisfrumeindum. Ólíkt grafíti og grafeni, sem koma fyrir í lögum, vefjast lögin saman í rör og tengjast til að mynda stö …


## 28. `rays`

**skötur** · 67 occurrences · domain `biology` · my read: **DELETE**

*efnafraedi-2e · `m68729:glossary-def:fs-idm51371008-def`*

> **EN:** range of energies that electromagnetic radiation can comprise, including radio, microwaves, infrared, visible, ultraviolet, X-rays, and gamma rays

> **IS (unprompted):** orkusvið sem rafsegulgeislun getur spannað, þar á meðal útvarpsbylgjur, örbylgjur, innrautt ljós, sýnilegt ljós, útfjólublátt ljós, röntgengeislar og gammageislar

*efnafraedi-2e · `m68773:caption:CNX_Chem_10_06_XRyDiff1-caption`*

> **EN:** The diffraction of X-rays scattered by the atoms within a crystal permits the determination of the distance between the atoms. The top image depicts constructive interference between two scattered waves and a resultant diffracted wave of high intensity. The bottom image depicts destructive interfere …

> **IS (unprompted):** Ljósbrot röntgengeisla sem dreifast af frumeindum innan kristals gerir kleift að ákvarða fjarlægðina milli frumeindanna. Efri myndin sýnir uppbyggjandi samliðun milli tveggja dreifðra bylgna og afleiddrar brotinnar bylgju með háum styrk. Neðri myndin sýnir eyðandi samliðun og brotna bylgju með lágum …


## 29. `laboratory`

**rannsókna | rannsóknarstofa** · 63 occurrences · domain `biology,physics` · my read: **PICK**

*efnafraedi-2e · `m68783:para:fs-idp99432368`*

> **EN:** Distillation is widely applied in both laboratory and industrial settings, being used to refine petroleum, to isolate fermentation products, and to purify water. A typical apparatus for laboratory-scale distillations is shown in [[xref:CNX_Chem_11_04_LabDistill]].

> **IS (unprompted):** Eiming er víða notuð, bæði á rannsóknarstofum og í iðnaði, til að hreinsa jarðolíu, einangra gerjunarafurðir og hreinsa vatn. Dæmigerður búnaður fyrir eimingu á rannsóknarstofu er sýndur á [[xref:CNX_Chem_11_04_LabDistill]].

*efnafraedi-2e · `m68783:caption:CNX_Chem_11_04_LabDistill-caption`*

> **EN:** A typical laboratory distillation unit is shown in (a) a photograph and (b) a schematic diagram of the components. (credit a: modification of work by “Rifleman82”/Wikimedia commons; credit b: modification of work by “Slashme”/Wikimedia Commons)

> **IS (unprompted):** Dæmigerð eimingareining fyrir rannsóknarstofu er sýnd á (a) ljósmynd og (b) skýringarmynd af íhlutunum. (heimild a: breyting á verki eftir „Rifleman82“/Wikimedia commons; heimild b: breyting á verki eftir „Slashme“/Wikimedia Commons)


## 30. `absorb`

**gleypa | taka upp** · 58 occurrences · domain `biology,physics` · my read: **PICK**

*efnafraedi-2e · `m68778:abstract-item:abstract-item-3`*

> **EN:** Explain why some solutions either produce or absorb heat when they form

> **IS (unprompted):** Útskýrt hvers vegna sumar lausnir annaðhvort mynda eða gleypa varma þegar þær myndast

*efnafraedi-2e · `m68710:problem:fs-idp89419440`*

> **EN:** Lithium hydroxide may be used to absorb carbon dioxide in enclosed environments, such as manned spacecraft and submarines. Write an equation for the reaction that involves 2 mol of LiOH per 1 mol of CO[[sub:2]]. (Hint: Water is one of the products.)

> **IS (unprompted):** Litíumhýdroxíð má nota til að gleypa koldíoxíð í lokuðu umhverfi, svo sem í mönnuðum geimförum og kafbátum. Skrifaðu jöfnu fyrir efnahvarfið sem felur í sér 2 mól af LiOH á móti 1 móli af CO[[sub:2]]. (Vísbending: Vatn er eitt af myndefnunum.)


## 31. `methanol`

**metanól | tréspíri** · 58 occurrences · domain `biology,physics` · my read: **PICK**

*efnafraedi-2e · `m68781:problem:fs-idm67036112`*

> **EN:** Compare the processes that occur when methanol (CH[[sub:3]]OH), hydrogen chloride (HCl), and sodium hydroxide (NaOH) dissolve in water. Write equations and prepare sketches showing the form in which each of these compounds is present in its respective solution.

> **IS (unprompted):** Berðu saman ferlana sem eiga sér stað þegar metanól (CH[[sub:3]]OH), vetnisklóríð (HCl) og natríumhýdroxíð (NaOH) leysast upp í vatni. Skrifaðu jöfnur og gerðu skissur sem sýna í hvaða formi hvert þessara efnasambanda er í sinni lausn.

*efnafraedi-2e · `m68781:problem:fs-idp1970576`*

> **EN:** (b) methanol, CH[[sub:3]]OH, dissolved in ethanol, C[[sub:2]]H[[sub:5]]OH

> **IS (unprompted):** (b) metanól, CH[[sub:3]]OH, leyst upp í etanóli, C[[sub:2]]H[[sub:5]]OH


## 32. `quantity`

**magn | stærð** · 58 occurrences · domain `biology,physics` · my read: **PICK**

*efnafraedi-2e · `m68782:para:fs-idp72770704`*

> **EN:** where [[i:k]] is a proportionality constant that depends on the identity of the gaseous solute, the identity of the solvent, and the solution temperature. This is a mathematical statement of {{term}}Henry’s law{{/term}}: [[i:The quantity of an ideal gas that dissolves in a definite volume of liquid  …

> **IS (unprompted):** þar sem {{i}}k{{/i}} er hlutfallfasti sem fer eftir eiginleikum loftkennda uppleysta efnisins, eiginleikum leysisins og hitastigi lausnarinnar. Þetta er stærðfræðileg framsetning á {{term}}lögmáli Henrys{{/term}}: {{i}}Magn kjörloftegundar sem leysist upp í ákveðnu rúmmáli vökva er í beinu hlutfalli …

*efnafraedi-2e · `m68674:problem:fs-idm267043248`*

> **EN:** Give the name of the prefix and the quantity indicated by the following symbols that are used with SI base units.

> **IS (unprompted):** Gefðu upp nafn forskeytisins og stærðina sem táknuð er með eftirfarandi táknum sem eru notuð með SI-grunneiningum.


## 33. `nm`

**nanómetri** · 55 occurrences · domain `biology` · my read: **KEEP**

*efnafraedi-2e · `m68729:para:fs-idp152169520`*

> **EN:** A sodium streetlight gives off yellow light that has a wavelength of 589 nm (1 nm = 1 [[MATH:4]] 10[[sup:−9]] m). What is the frequency of this light?

> **IS (unprompted):** Natríumgötuljós gefur frá sér gult ljós sem hefur bylgjulengdina 589 nm (1 nm = 1 [[MATH:4]] 10[[sup:−9]] m). Hver er tíðni þessa ljóss?

*efnafraedi-2e · `m68729:para:fs-idm79802192`*

> **EN:** Since [[i:c]] is expressed in meters per second, we must also convert 589 nm to meters.

> **IS (unprompted):** Þar sem [[i:c]] er gefið upp í metrum á sekúndu verðum við einnig að breyta 589 nm í metra.


## 34. `protein`

**hvíta | prótín** · 37 occurrences · domain `biology,physics` · my read: **PICK**

*efnafraedi-2e · `m68783:para:fs-idp189571392`*

> **EN:** Assuming ideal solution behavior, what is the molar mass of a protein if a solution of 0.02 g of the protein in 25.0 mL of solution has an osmotic pressure of 0.56 torr at 25 °C?

> **IS (unprompted):** Að því gefnu að um kjörlausn sé að ræða, hver er mólmassi próteins ef lausn með 0,02 g af próteininu í 25,0 ml af lausn hefur flæðiþrýsting upp á 0,56 torr við 25 °C?

*efnafraedi-2e · `m68761:problem:fs-idm50037824`*

> **EN:** Proteins are chains of amino acids that can form in a variety of arrangements, one of which is a helix. What kind of IMF is responsible for holding the protein strand in this shape? On the protein image, show the locations of the IMFs that hold the protein together:

> **IS (unprompted):** Prótein eru keðjur amínósýra sem geta myndað ýmsar uppraðanir, þar á meðal gormlaga form (helix). Hvers konar millisameindakraftar eru ábyrgir fyrir því að halda próteinþræðinum í þessu formi? Sýndu á próteinmyndinni staðsetningu millisameindakraftanna sem halda próteininu saman:


## 35. `CoA`

**kóensím A** · 34 occurrences · domain `biology` · my read: **KEEP**

*lifraen-efnafraedi · `28-99-OC-MP02:stem:354976-b0`*

> **EN:** The final step in the metabolic degradation of uracil is the oxidation of malonic semialdehyde to give malonyl CoA. Propose a mechanism.

> **IS (unprompted):** Lokaskrefið í niðurbroti úrasíls í efnaskiptum er oxun malónsemíaldehýðs til að mynda malónýl CoA. Stingdu upp á hvarfgangi.

*lifraen-efnafraedi · `29-03-OC-P02:sol:349864-b0`*

> **EN:** Caprylyl CoA ​→ ​Hexanoyl CoA ​→ ​ Butyryl CoA ​→ ​2 Acetyl CoA

> **IS (unprompted):** Kaprýlýl-CoA ​→ ​Hexanóýl-CoA ​→ ​ Bútýrýl-CoA ​→ ​2 asetýl-CoA


## 36. `fit`

**hviða | mátun** · 33 occurrences · domain `biology,physics` · my read: **PICK**

*efnafraedi-2e · `m68733:caption:CNX_Chem_06_03_elecw-caption`*

> **EN:** If an electron is viewed as a wave circling around the nucleus, an integer number of wavelengths must fit into the orbit for this standing wave behavior to be possible.

> **IS (unprompted):** Ef litið er á rafeind sem bylgju sem hringsólar um kjarnann verður heiltölufjöldi bylgjulengda að passa inn í brautina til að þessi staðbylgjuhegðun sé möguleg.

*efnafraedi-2e · `m68733:para:fs-idm145553968`*

> **EN:** Again, each orbital holds two electrons, so 50 electrons can fit in this shell.

> **IS (unprompted):** Enn og aftur, hvert svigrúm rúmar tvær rafeindir, þannig að 50 rafeindir geta rúmast í þessu hvolfi.


## 37. `rank`

**raðgildi** · 31 occurrences · domain `biology` · my read: **?**

*efnafraedi-2e · `m68735:problem:fs-idm156789200`*

> **EN:** Based on their positions in the periodic table, rank the following atoms in order of increasing first ionization energy: F, Li, N, Rb

> **IS (unprompted):** Raðaðu eftirfarandi frumeindum í röð eftir vaxandi fyrstu jónunarorku út frá staðsetningu þeirra í lotukerfinu: F, Li, N, Rb

*efnafraedi-2e · `m68735:problem:fs-idm10255376`*

> **EN:** Based on their positions in the periodic table, rank the following atoms in order of increasing first ionization energy: Mg, O, S, Si

> **IS (unprompted):** Raðaðu eftirfarandi frumeindum í röð eftir vaxandi fyrstu jónunarorku út frá staðsetningu þeirra í lotukerfinu: Mg, O, S, Si


## 38. `drug`

**lyf** · 30 occurrences · domain `biology` · my read: **KEEP**

*efnafraedi-2e · `m68841:para:fs-idm19578416`*

> **EN:** In addition to being used in their pure elemental forms, many compounds containing transition metals have numerous other applications. Silver nitrate is used to create mirrors, zirconium silicate provides friction in automotive brakes, and many important cancer-fighting agents, like the drug cisplat …

> **IS (unprompted):** Til viðbótar við notkun í hreinu frumefnisformi hafa mörg efnasambönd sem innihalda hliðarmálma fjölmörg önnur not. Silfurnítrat er notað til að búa til spegla, sirkonsilfíkat veitir núning í bílabremsum og mörg mikilvæg krabbameinslyf, eins og lyfið cisplatin og skyldar efnategundir, eru platínusam …

*lifraen-efnafraedi · `11-99-OC-AP43:stimulus:b0`*

> **EN:** The antipsychotic drug flupentixol is prepared by the following scheme:

> **IS (unprompted):** Geðrofslyfið flúpentixól er búið til samkvæmt eftirfarandi ferli:


## 39. `ppm`

**milljónarhluti** · 30 occurrences · domain `biology` · my read: **KEEP**

*efnafraedi-2e · `m68752:caption:CNX_Chem_09_03_GlobalWarming2-caption`*

> **EN:** CO[[sub:2]] levels over the past 700,000 years were typically from 200–300 ppm, with a steep, unprecedented increase over the past 50 years.

> **IS (unprompted):** Magn CO[[sub:2]] síðastliðin 700.000 ár var yfirleitt á bilinu 200–300 ppm, með brattri, fordæmalausri aukningu síðastliðin 50 ár.

*efnafraedi-2e · `m68704:abstract-item:abstract-item-1`*

> **EN:** Define the concentration units of mass percentage, volume percentage, mass-volume percentage, parts-per-million (ppm), and parts-per-billion (ppb)

> **IS (unprompted):** Skilgreint styrkeiningarnar massaprósentu, rúmmálsprósentu, massa-rúmmálsprósentu, milljónustuhluta (ppm) og milljarðshluta (ppb)


## 40. `site`

**set** · 30 occurrences · domain `biology` · my read: **?**

*efnafraedi-2e · `m68674:para:fs-idm169361696`*

> **EN:** Need a refresher or more practice with scientific notation? Visit this [[link:site|http://openstax.org/l/16notation]] to go over the basics of scientific notation.

> **IS (unprompted):** Þarftu upprifjun eða meiri æfingu með staðalform? Farðu á þessa [síðu](http://openstax.org/l/16notation) til að fara yfir grunnatriði staðalforms.

*efnafraedi-2e · `m68667:para:fs-idm138330144`*

> **EN:** Many compounds break down when heated. This [[link:site|http://openstax.org/l/16mercury]] shows the breakdown of mercury oxide, HgO. You can also view an example of the [[link:photochemical decomposition of silver chloride|http://openstax.org/l/16silvchloride]] (AgCl), the basis of early photography …

> **IS (unprompted):** Mörg efnasambönd brotna niður þegar þau eru hituð. Þessi [síða](http://openstax.org/l/16mercury) sýnir niðurbrot kvikasilfursoxíðs, HgO. Þú getur einnig skoðað dæmi um [ljósefnafræðilegt niðurbrot silfurklóríðs](http://openstax.org/l/16silvchloride) (AgCl), sem er grundvöllur eldri ljósmyndunar.


## 41. `kcal`

**kílókaloría** · 27 occurrences · domain `biology` · my read: **KEEP**

*efnafraedi-2e · `m68727:problem:fs-idp25402576`*

> **EN:** Before the introduction of chlorofluorocarbons, sulfur dioxide (enthalpy of vaporization, 6.00 kcal/mol) was used in household refrigerators. What mass of SO[[sub:2]] must be evaporated to remove as much heat as evaporation of 1.00 kg of CCl[[sub:2]]F[[sub:2]] (enthalpy of vaporization is 17.4 kJ/mo …

> **IS (unprompted):** Áður en klórflúorkolefni voru tekin í notkun var brennisteinsdíoxíð (gufunarvermi, 6,00 kkal/mól) notað í ísskápa á heimilum. Hve mikinn massa af SO[[sub:2]] þarf að gufa upp til að fjarlægja jafn mikinn varma og gufun 1,00 kg af CCl[[sub:2]]F[[sub:2]] (gufunarvermi er 17,4 kJ/mól)?

*efnafraedi-2e · `m68726:para:fs-idm51318912`*

> **EN:** In your day-to-day life, you may be more familiar with energy being given in Calories, or nutritional calories, which are used to quantify the amount of energy in foods. One calorie (cal) = exactly 4.184 joules, and one Calorie (note the capitalization) = 1000 cal, or 1 kcal. (This is approximately  …

> **IS (unprompted):** Í daglegu lífi þínu ertu kannski vanari því að orka sé gefin upp í kaloríum (Calories) eða næringarkaloríum, sem eru notaðar til að magngreina orkuna í matvælum. Ein kaloría (cal) = nákvæmlega 4,184 júl og ein kaloría (Calorie) (athugaðu stóra stafinn) = 1000 cal, eða 1 kkal. (Þetta er um það bil or …


## 42. `flow`

**flæði** · 27 occurrences · domain `biology` · my read: **KEEP**

*efnafraedi-2e · `m68716:para:fs-idm26289056`*

> **EN:** First, calculate the molar amounts of carbon and hydrogen in the sample, using the provided masses of the carbon dioxide and water, respectively. With these molar amounts, the empirical formula for the compound may be written as described in the previous chapter of this text. An outline of this appr …

> **IS (unprompted):** Fyrst skal reikna mólmagn kolefnis og vetnis í sýninu með því að nota uppgefinn massa koldíoxíðs og vatns, hvort um sig. Með þessum mólmögnun má skrifa reynsluformúlu efnasambandsins eins og lýst er í fyrri kafla þessarar bókar. Yfirlit yfir þessa aðferð er gefið í eftirfarandi flæðiriti:

*efnafraedi-2e · `m68667:solution:fs-idm31794752`*

> **EN:** Liquids can change their shape (flow); solids can’t. Gases can undergo large volume changes as pressure changes; liquids do not. Gases flow and change volume; solids do not.

> **IS (unprompted):** Vökvar geta breytt lögun sinni (flotið); föst efni geta það ekki. Gös geta tekið miklum rúmmálsbreytingum þegar þrýstingur breytist; vökvar gera það ekki. Gös fljóta og breyta um rúmmál; föst efni gera það ekki.


## 43. `degenerate`

**margfaldur | margræður** · 25 occurrences · domain `biology,physics` · my read: **PICK**

*efnafraedi-2e · `m68734:para:fs-idm6887808`*

> **EN:** The last electron added is a 3[[i:p]] electron. Therefore, [[i:n]] = 3 and, for a [[i:p]]-type orbital, [[i:l]] = 1. The [[i:m[[sub:l]]]] value could be –1, 0, or +1. The three [[i:p]] orbitals are degenerate, so any of these [[i:m[[sub:l]]]] values is correct. For unpaired electrons, convention ass …

> **IS (unprompted):** Síðasta rafeindin sem bættist við er 3[[i:p]]-rafeind. Þess vegna er [[i:n]] = 3 og fyrir [[i:p]]-gerð svigrúms er [[i:l]] = 1. [[i:m[[sub:l]]]]-gildið gæti verið –1, 0 eða +1. Þrjú [[i:p]]-svigrúmin eru úrkynjuð, þannig að hvaða [[i:m[[sub:l]]]]-gildi sem er er rétt. Fyrir óparaðar rafeindir er ven …

*efnafraedi-2e · `m68733:problem:fs-idp34462880`*

> **EN:** Which of the subshells described in the previous question contain degenerate orbitals? How many degenerate orbitals are in each?

> **IS (unprompted):** Hver af undirhvolfunum sem lýst er í fyrri spurningu innihalda úrkynjuð svigrúm? Hversu mörg úrkynjuð svigrúm eru í hverju þeirra?


## 44. `diffraction`

**beygja | bognun** · 25 occurrences · domain `biology,physics` · my read: **PICK**

*efnafraedi-2e · `m68773:abstract-item:abstract-item-3`*

> **EN:** Explain the use of X-ray diffraction measurements in determining crystalline structures

> **IS (unprompted):** Útskýrt notkun mælinga með röntgengeisladreifingu við að ákvarða kristalgerðir

*efnafraedi-2e · `m68773:caption:CNX_Chem_10_06_XRyDiff1-caption`*

> **EN:** The diffraction of X-rays scattered by the atoms within a crystal permits the determination of the distance between the atoms. The top image depicts constructive interference between two scattered waves and a resultant diffracted wave of high intensity. The bottom image depicts destructive interfere …

> **IS (unprompted):** Ljósbrot röntgengeisla sem dreifast af frumeindum innan kristals gerir kleift að ákvarða fjarlægðina milli frumeindanna. Efri myndin sýnir uppbyggjandi samliðun milli tveggja dreifðra bylgna og afleiddrar brotinnar bylgju með háum styrk. Neðri myndin sýnir eyðandi samliðun og brotna bylgju með lágum …


## 45. `barrier`

**hindrun | þröskuldur** · 24 occurrences · domain `biology,physics` · my read: **PICK**

*efnafraedi-2e · `m68829:glossary-def:fs-idp8939856-def`*

> **EN:** metals with a protective nonreactive film of oxide or other compound that creates a barrier for chemical reactions; physical or chemical removal of the passivating film allows the metals to demonstrate their expected chemical reactivity

> **IS (unprompted):** málmar með verndandi, óhvarfgjarna filmu úr oxíði eða öðru efnasambandi sem myndar hindrun fyrir efnahvörf; ef óvirknifilman er fjarlægð með eðlis- eða efnafræðilegum aðferðum geta málmarnir sýnt vænta hvarfgirni sína

*efnafraedi-2e · `m68837:para:fs-idp113935824`*

> **EN:** Ozone forms naturally in the upper atmosphere by the action of ultraviolet light from the sun on the oxygen there. Most atmospheric ozone occurs in the stratosphere, a layer of the atmosphere extending from about 10 to 50 kilometers above the earth’s surface. This ozone acts as a barrier to harmful  …

> **IS (unprompted):** Óson myndast náttúrulega í efri lögum andrúmsloftsins fyrir tilstilli útfjólublás ljóss frá sólinni á súrefnið þar. Mest af ósoni í andrúmsloftinu er í heiðhvolfinu, lagi andrúmsloftsins sem nær frá um 10 til 50 kílómetra yfir yfirborði jarðar. Þetta óson virkar sem hindrun fyrir skaðlegu útfjólublá …


## 46. `reagent`

**prófefni | virkt efni** · 24 occurrences · domain `biology,physics` · my read: **PICK**

*efnafraedi-2e · `m68703:problem:fs-idm26426432`*

> **EN:** (c) 0.2500 L of 0.1135 [[i:M]] K[[sub:2]]CrO[[sub:4]], an analytical reagent used in iron assays

> **IS (unprompted):** (c) 0,2500 L af 0,1135 {{i}}M{{/i}} K[[sub:2]]CrO[[sub:4]], greiningarhvarfefni notað í járngreiningum

*efnafraedi-2e · `m68704:para:fs-idm32647264`*

> **EN:** “Concentrated” hydrochloric acid is an aqueous solution of 37.2% HCl that is commonly used as a laboratory reagent. The density of this solution is 1.19 g/mL. What mass of HCl is contained in 0.500 L of this solution?

> **IS (unprompted):** „Þétt“ saltsýra er vatnslausn af 37,2% HCl sem er almennt notuð sem hvarfefni á rannsóknarstofum. Eðlismassi þessarar lausnar er 1,19 g/ml. Hvaða massi af HCl er í 0,500 L af þessari lausn?


## 47. `variation`

**breytileiki | hnikun** · 23 occurrences · domain `biology,physics` · my read: **PICK**

*efnafraedi-2e · `m68831:glossary-def:fs-idp20554272-def`*

> **EN:** variation in crystalline structure that results in different physical properties for the resulting compound

> **IS (unprompted):** breytileiki í kristalbyggingu sem leiðir til mismunandi eðliseiginleika fyrir efnasambandið sem myndast

*efnafraedi-2e · `m68759:abstract-item:abstract-item-3`*

> **EN:** Define compressibility (Z) and describe how its variation with pressure reflects non-ideal behavior

> **IS (unprompted):** Skilgreint samþjappanleika (Z) og lýst því hvernig breytileiki hans með þrýstingi endurspeglar frávik frá kjörgaseiginleikum


## 48. `anti`

**and-** · 21 occurrences · domain `biology` · my read: **KEEP**

*efnafraedi-2e · `m68700:para:fs-idp70748048`*

> **EN:** Calcium phosphate, Ca[[sub:3]](PO[[sub:4]])[[sub:2]], is an ionic compound and a common anti-caking agent added to food products. What is the formula mass (amu) of calcium phosphate?

> **IS (unprompted):** Kalsíumfosfat, Ca[[sub:3]](PO[[sub:4]])[[sub:2]], er jónaefni og algengt kekkjavarnarefni sem bætt er í matvæli. Hver er formúlumassi (amu) kalsíumfosfats?

*efnafraedi-2e · `m68843:caption:CNX_Chem_19_02_BalEnt-caption`*

> **EN:** Coordination complexes are used as drugs. (a) British Anti-Lewisite is used to treat heavy metal poisoning by coordinating metals (M), and enterobactin (b) allows excess iron in the blood to be removed.

> **IS (unprompted):** Samhæfingarflókar eru notaðir sem lyf. (a) British Anti-Lewisite er notað til að meðhöndla þungmálmaeitrun með því að samhæfa málma (M), og enteróbaktín (b) gerir kleift að fjarlægja umframjárn úr blóðinu.


## 49. `character`

**einkenni | stafur** · 20 occurrences · domain `biology,physics` · my read: **PICK**

*efnafraedi-2e · `m68761:problem:fs-idp57555904`*

> **EN:** Silane (SiH[[sub:4]]), phosphine (PH[[sub:3]]), and hydrogen sulfide (H[[sub:2]]S) melt at −185 °C, −133 °C, and −85 °C, respectively. What does this suggest about the polar character and intermolecular attractions of the three compounds?

> **IS (unprompted):** Sían (SiH[[sub:4]]), fosfín (PH[[sub:3]]) og brennisteinsvetni (H[[sub:2]]S) bráðna við −185 °C, −133 °C og −85 °C. Hvað gefur þetta til kynna um skautað eðli og millisameinda aðdráttarkrafta þessara þriggja efnasambanda?

*efnafraedi-2e · `m68803:problem:fs-idp122889968`*

> **EN:** State which of the following species are amphiprotic and write chemical equations illustrating the amphiprotic character of these species:

> **IS (unprompted):** Tilgreindu hvaða af eftirfarandi efnum eru amfíprótísk og skrifaðu efnajöfnur sem sýna amfíprótíska eiginleika þessara efna:


## 50. `family`

**fjölskylda | ætt** · 20 occurrences · domain `biology,physics` · my read: **PICK**

*efnafraedi-2e · `m68713:para:fs-idp78338704`*

> **EN:** If two dozen pancakes are needed for a big family breakfast, the ingredient amounts must be increased proportionally according to the amounts given in the recipe. For example, the number of eggs required to make 24 pancakes is

> **IS (unprompted):** Ef þörf er á tveimur tylftum af pönnukökum fyrir stóran fjölskyldumorgunverð verður að auka magn innihaldsefna í réttu hlutfalli við magnið sem gefið er upp í uppskriftinni. Til dæmis er fjöldi eggja sem þarf til að gera 24 pönnukökur:

*efnafraedi-2e · `m68702:para:fs-idm56345360`*

> **EN:** Nicotine, an alkaloid in the nightshade family of plants that is mainly responsible for the addictive nature of cigarettes, contains 74.02% C, 8.710% H, and 17.27% N. If 40.57 g of nicotine contains 0.2500 mol nicotine, what is the molecular formula?

> **IS (unprompted):** Nikótín, alkalóíði í náttskuggaætt plantna sem er aðallega ábyrgur fyrir ávanabindandi eðli sígarettna, inniheldur 74,02% C, 8,710% H og 17,27% N. Ef 40,57 g af nikótíni innihalda 0,2500 mól af nikótíni, hver er þá sameindaformúlan?


---

**50 rows, 19,792 occurrences in the English being translated.**

Hand this back edited, or just name the exceptions to my reads.
