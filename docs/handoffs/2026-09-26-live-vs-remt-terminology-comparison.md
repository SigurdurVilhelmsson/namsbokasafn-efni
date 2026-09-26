# Live vs re-MT chemistry — terminology and consistency

> **Question ([USER], 2026-09-26):** is the live translation, which has never been edited, actually better
> than the re-MT on terminology and consistency? **Answer: no, not overall — but it is better on exactly
> the terms where the model has nothing to anchor it, and those are the ruling sheet's book-level
> questions.** Core vocabulary: identical. Consistency: a draw (16 vs 19 terms). Blind reading: a draw
> (6 vs 7 pairs; MAJOR errors 4 vs 2). 0 ISK, read-only. Once read, this file is *evidence*; status lives in the active register.
> Companion to [`2026-09-26-terminology-and-title-ruling-sheet.md`](2026-09-26-terminology-and-title-ruling-sheet.md).

## What was compared

- **Live** = the reader site's chemistry pages. The vefur static copy was confirmed byte-identical to production on 3
  pages fetched 2026-09-26. It is the older MT, bought with **the whole glossary on the wire**.
- **Re-MT** = the prepared `05-publication/mt-preview` pages, bought with an audited subset or with no glossary.
- **Unit:** a paragraph, paired by its CNXML id, with the English from `02-for-mt` by the same id.
  **10,178 pairs** across all 21 chapters and the appendices; **4,168 (41%) are identical** in both versions, spread evenly
  over the chapters (26–52% each), so the comparison lives in the ~6,000 that differ.
- ⚠️ **Bias to keep in mind:** live was *told* the glossary, so "matches the approved row" favours live by
  construction. Consistency (measure 1) is the glossary-neutral measure.

## 1 · Core vocabulary — a tie, and the instrument's control

20 undisputed terms (*acid, equilibrium, electron, molecule, solution, enthalpy, entropy, oxidation, catalyst,
isotope…*) score **the same in both versions**, 81–100%. The matcher works, and on everyday chemistry the two
runs are equally good.

## 2 · Consistency on the 60 disputed terms — a draw

The measure is each term's dominant-form share: how often the most common Icelandic word is used for it.
- **Live more consistent: 16 terms.**
- **Re-MT more consistent: 19.**
- **Within 10 points: 25.**

The two versions are consistent **in different directions**:

| pattern | examples (dominant share, live → re-MT) |
|---|---|
| **Re-MT settles on the model's own word** | *atom* frumeind 71% / atóm 33% → **atóm 93%** · *rate law* → **hraðalögmál 100%** · *soluble* split → **leysanlegur 89%** · *electrode* → **rafskaut 90%** · *osmotic pressure* split → **osmósuþrýstingur 100%** · *valence* → **gildis- 100%** · *Celsius* 82/18 → **100%** |
| **Live holds a glossary word the re-MT loses** | *stoichiometry* **86%** → 21% (split three ways) · *kinetics* **71%** → 33% · *percent yield* **100%** → 37% · *binding energy* **100%** → 48% · *intermolecular forces* **72%** → 39% · *cathode/anode* **98/96%** → 78/55% · *calorie* **100%** → 67% · *colloid* **73%** → 53% |

The first row is the model's natural vocabulary, which it uses unprompted. The second row is where it has no
single natural word, and without the glossary it drifts.

## 3 · The serious errors — each version has its own failure mode

Counted in paragraphs where the English term occurs; every re-MT count marked ✔ was read by value.

| error | live | re-MT | worse |
|---|---|---|---|
| *hydrocarbon* → **kolvetni** (= carbohydrate) | **42 / 45** | 19 / 45 | live |
| *resonance* → **samgild-** (= covalent) | **9 / 30** | 3 / 30 | live |
| *atom* as both *frumeind* and *atóm* **in one paragraph** | **39** | 9 | live |
| *Celsius* as *Selsíus* | **3 / 17** | 0 | live |
| *kinetics* → **efnahvörf** (reactions), e.g. "the kinetics chapter" → *kaflanum um efnahvörf* ✔ | ~2 | **~10 / 21** | **re-MT** |
| *kinetics* → **hreyfifræði** (kinematics) ✔ | 0 | **2** | **re-MT** |
| *dissociation* → **sundrun** (the ruled word for nuclear decay) | 6 / 25 | **22 / 25** | **re-MT** |
| *stoichiometry*: approved *hlutfallaefnafræði* | 86% | **0%** | **re-MT** |
| **misspelt core term** *sámeind* (§C194) | 0 | **27 tokens** in 8.4 | **re-MT** |
| **prose returned in English by the paid MT** ✔ | 0 | **8 segments**: 1 known (ch08 π-bond, logged) + **7 new in ch21** (`m68852` ×6, `m68856` ×1) | **re-MT** |
| omissions (IS < 50% of EN length) | 21 | 20 | equal |
| whole paragraph identical to EN | 15 | 13 | equal (mostly names, formulas) |

**Live's errors come from the glossary.** It obeyed wrong or colliding rows: *kolvetni* for hydrocarbon, which
[USER] fixed by ruling on 2026-09-21, and coinages the model otherwise never uses (*raftroð, tengjaorka,
flæðiþrýstingur, girðihvel*).

**The re-MT's errors come from the missing glossary**, in two places:
- where the model has no single natural word (*kinetics, stoichiometry, dissociation*);
- in a few paid-run failures (English paragraphs, one misspelling).

## 4 · Blind reading — also a tie

**Setup:**
- 30 differing paragraph pairs, 3 each from ch02/04/06/07/09/11/12/14/17/21, drawn with a fixed seed;
  paragraphs of 180–700 characters with no maths.
- The two versions were labelled A/B at random: live was A in 14 of the pairs.
- A fresh agent judged **terminology and meaning only**. It was told nothing about how either version was made,
  and was told to report MAJOR errors only when certain.
- Every MAJOR error it quoted was checked and appears verbatim in its text.

| | live | re-MT |
|---|---|---|
| judged better on terminology | 6 | 7 |
| MAJOR errors | 4 | 2 |
| minor errors | 15 | 16 |
| judged equal | 17 of 30 | |

**The MAJOR errors:**
- **Live:**
  - *rafhlöðin* for "electrically charged" (a misspelling that reads as *battery*);
  - *þáttbundinni* for "qualitative";
  - *platínuraftroð* for "platinum electrode", the glossary's *raftroð* again;
  - *serín* (the amino acid serine) for cerium.
- **Re-MT:**
  - *mólstyrkur* (molarity) for molal concentration;
  - *blóðrás* (blood circulation) for cooling-water circulation.

⚠️ The judge is a language model, not a chemist. Its verdicts on individual Icelandic terms are opinions, and
the appendix below is there so you can calibrate it against your own reading.

## What this changes

1. **Live is not the better text to return to**, and it could not cheaply be restored anyway: it was extracted
   under the old extractor.
2. **The ruling sheet's book-level questions are confirmed as the right ones.** Live beat the re-MT exactly on K1
   *stoichiometry*, K2 *dissociation*, K3 *electrolyte* and K4 *colloid*. The sheet's defaults there, "keep the
   approved word, editors substitute", match what live shows works.
3. **Four ruling-sheet defaults should change from *adopt* to *ask*,** because live was clearly more consistent:
   - *cathode* / *anode*: *forskaut* reaches only 55% of anode paragraphs, and *anóða* still 23%;
   - *percent yield*;
   - *binding energy*;
   - *calorie*.
4. **Add *kinetics* to the sheet as a book-level question.** It is not flagged there, because 7 of 21 paragraphs
   still carry *hraðafræði*, but the re-MT collapses it onto *reactions* in about 10 paragraphs and onto
   *kinematics* in 2 more. That is the same wrong-sense class as the ch12 title.
5. **New defect, register §C195:** 7 ch21 prose segments came back from the paid MT in English and would ship at
   the sync. It is a free fix by hand repair or editor edit, or a small targeted re-buy.

## Provenance

The scripts and JSON are kept with the audit evidence (project memory `translation-wrapup-audit-2026-09-24`), in
`live-vs-remt-2026-09-26/`:
- `pairs.mjs` builds the id-paired dataset;
- `terms.mjs` / `none.mjs` compute measures 1–2;
- `errors.mjs` / `look*.mjs` compute measure 3 and the by-value reads;
- `blind.json` + `blind-key.json` hold measure 4.

Term matching uses `tools/lib/chapter-term-check.js`. The stem heuristic can overlap, e.g. *blanda* inside
*efnablanda*, so shares for one term need not sum to 100%.

## Appendix — ten pairs to judge yourself

Each pair has the English and two versions in random order. Mark which has the better **terminology** (or "equal"), then
compare with the key at the end. These ten include all six of the judge's MAJOR errors, so they are harder than an average pair.

### Pair 1 (ch02)

**EN:** Atoms are electrically neutral if they contain the same number of positively charged protons and negatively charged electrons. When the numbers of these subatomic particles are not equal, the atom is electrically charged and is called an ion. The charge of an atom is defined as follows:

**A:** Frumeindir eru rafhlutlausar ef þær innihalda jafnmargar jákvætt hlaðnar róteindir og neikvætt hlaðnar rafeindir. Þegar fjöldi þessara öreinda er ekki jafn er frumeindin rafhlöðin og kallast jón . Hleðsla frumeindar er skilgreind sem hér segir:

**B:** Atóm eru rafhlutlaus ef þau innihalda jafnmargar jákvætt hlaðnar róteindir og neikvætt hlaðnar rafeindir. Þegar fjöldi þessara öreinda er ekki jafn er atómið rafmagnað og kallast jón . Hleðsla atóms er skilgreind sem hér segir:

### Pair 2 (ch04)

**EN:** The numbers of H atoms on the reactant and product sides of the equation are equal, but the numbers of O atoms are not. To achieve balance, the coefficients of the equation may be changed as needed. Keep in mind, of course, that the formula subscripts define, in part, the identity of the substance, and so these cannot be changed without altering the qualitative meaning of the equation. For example, changing the reactant formula from H2O to H2O2 would yield balance in the number of atoms, but doing so also changes the reactant’s identity (it’s now hydrogen peroxide and not water). The O atom balance may be achieved by changing the coefficient for H2O to 2.

**A:** Fjöldi H-frumeinda er jafn á hvarfefna- og myndefnahlið jöfnunnar, en fjöldi O-frumeinda er það ekki. Til að ná jafnvægi má breyta stuðlum jöfnunnar eftir þörfum. Hafðu í huga að neðanmálsstafir í formúlum skilgreina að hluta til auðkenni efnisins og því er ekki hægt að breyta þeim án þess að breyta þáttbundinni merkingu jöfnunnar. Til dæmis, ef formúlu hvarfefnisins væri breytt úr H 2 O í H 2 O 2 myndi nást jafnvægi í fjölda frumeinda, en það breytir líka auðkenni hvarfefnisins (það er nú vetnisperoxíð en ekki vatn). Hægt er að ná jafnvægi O-frumeinda með því að breyta stuðlinum fyrir H 2 O í 2.

**B:** Fjöldi H-atóma í hvarfefnum og myndefnum jöfnunnar er jafn, en fjöldi O-atóma er það ekki. Til að ná jafnvægi má breyta stuðlum jöfnunnar eftir þörfum. Hafðu auðvitað í huga að neðanskriftir formúlunnar skilgreina að hluta til auðkenni efnisins og því er ekki hægt að breyta þeim án þess að breyta eigindlegri merkingu jöfnunnar. Til dæmis, ef formúlu hvarfefnisins væri breytt úr H 2 O í H 2 O 2 myndi nást jafnvægi í fjölda atóma, en það breytir líka auðkenni hvarfefnisins (það er nú vetnisperoxíð en ekki vatn). Jafnvægi O-atóma má ná með því að breyta stuðlinum fyrir H 2 O í 2.

### Pair 3 (ch06)

**EN:** In this expression, k is a constant comprising fundamental constants such as the electron mass and charge and Planck’s constant. Inserting the expression for the orbit energies into the equation for ΔE gives

**A:** Í þessari segð er k fasti sem samanstendur af grunnföstum eins og massa og hleðslu rafeindarinnar og fasta Plancks. Með því að setja segðina fyrir brautarorkuna inn í jöfnuna fyrir Δ E fæst

**B:** Í þessari segð er k fasti sem samanstendur af grunnföstum eins og massa og hleðslu rafeindarinnar og fasta Plancks. Með því að setja segðina fyrir orku sporbauganna inn í jöfnuna fyrir Δ E fæst

### Pair 4 (ch07)

**EN:** This order of repulsions determines the amount of space occupied by different regions of electrons. A lone pair of electrons occupies a larger region of space than the electrons in a triple bond; in turn, electrons in a triple bond occupy more space than those in a double bond, and so on. The order of sizes from largest to smallest is:

**A:** Þessi röðun fráhrindingar ákvarðar stærð rýmisins sem mismunandi svæði rafeinda taka. Stakt rafeindapar tekur stærra rými en rafeindirnar í þrítengi; rafeindir í þrítengi taka síðan meira pláss en þær í tvítengi, og svo framvegis. Stærðarröðin frá stærstu til minnstu er:

**B:** Þessi röðun fráhrindingar ákvarðar stærð rýmisins sem mismunandi svæði rafeinda taka. Einmana rafeindapar tekur stærra rými en rafeindir í þrítengi; aftur á móti taka rafeindir í þrítengi meira pláss en þær í tvítengi, og svo framvegis. Stærðarröðin frá stærstu til minnstu er:

### Pair 5 (ch09)

**EN:** We have previously measured quantities of reactants and products using masses for solids and volumes in conjunction with the molarity for solutions; now we can also use gas volumes to indicate quantities. If we know the volume, pressure, and temperature of a gas, we can use the ideal gas equation to calculate how many moles of the gas are present. If we know how many moles of a gas are involved, we can calculate the volume of a gas at any temperature and pressure.

**A:** Við höfum áður mælt magn hvarfefna og myndefna með því að nota massa fyrir föst efni og rúmmál ásamt mólstyrk fyrir lausnir; nú getum við einnig notað rúmmál gasa til að gefa til kynna magn. Ef við þekkjum rúmmál, þrýsting og hitastig gass getum við notað jöfnu kjörgass til að reikna út hversu mörg mól af gasinu eru til staðar. Ef við vitum hversu mörg mól af gasi eiga í hlut getum við reiknað út rúmmál gass við hvaða hitastig og þrýsting sem er.

**B:** Við höfum áður mælt magn hvarfefna og myndefna með því að nota massa fyrir föst efni og rúmmál ásamt mólstyrk fyrir lausnir; nú getum við einnig notað rúmmál lofttegunda til að gefa til kynna magn. Ef við þekkjum rúmmál, þrýsting og hitastig lofttegundar getum við notað kjörgasjöfnuna til að reikna út hversu mörg mól af lofttegundinni eru til staðar. Ef við vitum hversu mörg mól af lofttegund eiga í hlut getum við reiknað út rúmmál lofttegundar við hvaða hitastig og þrýsting sem er.

### Pair 6 (ch11)

**EN:** where m is the molal concentration of the solute and Kf is called the freezing point depression constant (or cryoscopic constant). Just as for boiling point elevation constants, these are characteristic properties whose values depend on the chemical identity of the solvent. Values of Kf for several solvents are listed in fs-idm37127680.

**A:** þar sem m er mólstyrkur uppleysta efnisins og K f er kallaður frostmarkslækkunarfasti (eða krýóskópískur fasti ). Rétt eins og með suðumarkshækkunarfastana eru þetta einkennandi eiginleikar þar sem gildi þeirra eru háð efnafræðilegri samsetningu leysisins. Gildi K f fyrir nokkra leysa eru talin upp í Tafla 11.2 .

**B:** þar sem m er mólalstyrkur leysta efnisins og K f er kallaður frostmarkslækkunarfasti (eða krýóskópískur fasti ). Rétt eins og með suðumarkshækkunarfastana eru þetta einkennandi eiginleikar þar sem gildin ráðast af efnafræðilegu eðli leysisins. Gildin fyrir K f fyrir nokkra leysa eru skráð í Tafla 11.2 .

### Pair 7 (ch11)

**EN:** (a) The mole fraction of ethylene glycol may be computed by first deriving molar amounts of both solution components and then substituting these amounts into the definition of mole fraction.

**A:** (a) Mólhlutfall etýlen glýkóls má reikna með því að finna fyrst mólmagn beggja efnisþátta lausnarinnar og setja síðan þessi mögn inn í skilgreininguna á mólhlutfalli.

**B:** (a) Mólbrot etýlen glýkóls má reikna út með því að finna fyrst mólmagn beggja efnisþátta lausnarinnar og setja síðan þessi mögn inn í skilgreininguna á mólbroti.

### Pair 8 (ch17)

**EN:** A typical SHE contains an inert platinum electrode immersed in precisely 1 M aqueous H+ and a stream of bubbling H2 gas at 1 bar pressure, all maintained at a temperature of 298 K (see CNX_Chem_17_03_SHE).

**A:** Dæmigert staðalvetnisrafskaut inniheldur óvirkt platínurafskaut sem dýft er í nákvæmlega 1 M vatnslausn af H + og straum af búblandi H 2 gasi við 1 bar þrýsting, allt haldið við 298 K hita (sjá Mynd 17.5 ).

**B:** Dæmigert SHE inniheldur óvirkt platínuraftroð sem dýft er í nákvæmlega 1 M vatnslausn af H + og straum af búblandi H 2 -gasi við 1 bar þrýsting, allt viðhaldið við 298 K hitastig (sjá Mynd 17.5 ).

### Pair 9 (ch21)

**EN:** Among the products of Meitner, Hahn, and Strassman’s fission reaction were barium, krypton, lanthanum, and cerium, all of which have nuclei that are more stable than uranium-235. Since then, hundreds of different isotopes have been observed among the products of fissionable substances. A few of the many reactions that occur for U-235, and a graph showing the distribution of its fission products and their yields, are shown in CNX_Chem_21_04_Fission2. Similar fission reactions have been observed with other uranium isotopes, as well as with a variety of other isotopes such as those of plutonium.

**A:** Meðal myndefna úr kjarnaklofnunarhvarfi Meitner, Hahn og Strassman voru barín, krypton, lantan og serín, sem öll hafa stöðugri kjarna en úran-235. Síðan þá hafa hundruð mismunandi samsæta sést meðal myndefna klofnanlegra efna. Nokkur af þeim mörgu efnahvörfum sem eiga sér stað fyrir U-235, og graf sem sýnir dreifingu klofnunarafurða þess og nýtni þeirra, eru sýnd á Mynd 21.15 . Svipuð kjarnaklofnunarhvörf hafa sést með öðrum úransamsætum, sem og með ýmsum öðrum samsætum eins og þeim sem eru af plútóníum.

**B:** Meðal afurða kjarnaklofnunarhvarfs Meitner, Hahn og Strassman voru baríum, krypton, lantan og seríum, sem öll hafa kjarna sem eru stöðugri en úran-235. Síðan þá hafa hundruð mismunandi samsæta sést meðal afurða klofnanlegra efna. Nokkur af mörgum hvörfum sem eiga sér stað fyrir U-235, og graf sem sýnir dreifingu klofnunarafurða þess og heimtur þeirra, eru sýnd á Mynd 21.15 . Svipuð kjarnaklofnunarhvörf hafa sést með öðrum úransamsætum, sem og með ýmsum öðrum samsætum eins og samsætum plútóníums.

### Pair 10 (ch21)

**EN:** The hydrogen accumulated in the confinement building, and it was feared that there was danger of an explosion of the mixture of hydrogen and air in the building. Consequently, hydrogen gas and radioactive gases (primarily krypton and xenon) were vented from the building. Within a week, cooling water circulation was restored and the core began to cool. The plant was closed for nearly 10 years during the cleanup process.

**A:** Vetnið safnaðist fyrir í varnarbyggingunni og óttast var að hætta væri á sprengingu í blöndu vetnis og lofts í byggingunni. Þar af leiðandi var vetnisgasi og geislavirkum gösum (aðallega krypton og xenon) hleypt út úr byggingunni. Innan viku var blóðrás kæliefnisins komin í lag aftur og kjarninn fór að kólna. Verksmiðjunni var lokað í næstum 10 ár meðan á hreinsunarferlinu stóð.

**B:** Vetnið safnaðist fyrir í varnarbyggingunni og óttast var að hætta væri á sprengingu í blöndu vetnis og lofts í byggingunni. Þar af leiðandi var vetnisgasi og geislavirkum gösum (aðallega krypton og xenon) hleypt út úr byggingunni. Innan viku var kælivatnsflæði komið á aftur og kjarninn byrjaði að kólna. Verksmiðjan var lokuð í næstum 10 ár á meðan hreinsunarferlið stóð yfir.

<details><summary>Key — open only after marking</summary>

- Pair 1: A = **live**. The judge preferred **new**. Major error: live: *rafhlöðin*. (`fs-idm159569776`)
- Pair 2: A = **live**. The judge preferred **new**. Major error: live: *þáttbundinni*. (`fs-idp116453584`)
- Pair 3: A = **live**. The judge preferred **live**. (`fs-idp27649904`)
- Pair 4: A = **live**. The judge preferred **live**. (`fs-idp7623536`)
- Pair 5: A = **live**. The judge preferred **equal**. (`fs-idp221629776`)
- Pair 6: A = **new**. The judge preferred **live**. Major error: new: *mólstyrkur*. (`fs-idp15307136`)
- Pair 7: A = **live**. The judge preferred **new**. (`fs-idm53042176`)
- Pair 8: A = **new**. The judge preferred **new**. Major error: live: *platínuraftroð*. (`fs-idm198492112`)
- Pair 9: A = **live**. The judge preferred **new**. Major error: live: *serín*. (`fs-idm70978352`)
- Pair 10: A = **new**. The judge preferred **live**. Major error: new: *blóðrás*. (`fs-idm226605200`)

</details>
