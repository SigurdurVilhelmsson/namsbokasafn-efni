# Localization pilot: chemistry ch01 inventory (2026-11-14)

- **For:** [the AI-localization side-track plan](2026-11-14-ai-localization-side-track.md), §7 step 2 ([USER]'s triage).
- **Book and chapter:** `efnafraedi-2e`, chapter 1 ("Essential Ideas"), seven modules.
- **Input:** the English only: `books/efnafraedi-2e/01-source/ch01/*.cnxml` and its generated segments
  `02-for-mt/ch01/m*-segments.en.md`. No MT, AI-reviewed or editor text was read, so this inventory cannot have
  influenced anything Skerfur measures.
- **Method:** a regex pass over every segment for US units, money, US places, agencies, brands and everyday objects,
  then a read of every hit, every box (`<note>`) and every figure caption. A regex finds candidates; every row below
  was read and judged by hand. So the counts are what this reading found, not a complete census.
- **Produced by:** Claude, in a cloud session with no API key. Cost: the session only, no API spend.

> **FROZEN EVIDENCE — banner-dated 2026-11-14.** A dated proposal list, never status. Each row's decision belongs in
> `04-localization/ch01/inventory.jsonl` once it exists, not here. Facts marked **[verify]** were written from
> memory and must be checked against a source before any text is drafted.

Section numbers follow the source's figure ids: m68664 = 1.1, m68667 = 1.2, m68670 = 1.3, m68674 = 1.4,
m68690 = 1.5, m68683 = 1.6. Priority: **H** is clearly worth doing and cheap; **M** is worth doing, needs recomputation
or a choice; **L** is optional.

## Summary

| Target | Items | H | M | L |
|---|---|---|---|---|
| T1 US units → SI | 34 | 24 | 8 | 2 |
| T2 Spotlight | 3 | 1 | 1 | 1 |
| T3 US example → local (rows marked "T3 + T1" counted here) | 12 | 7 | 4 | 1 |
| T4 Photo | 4 | 1 | 2 | 1 |
| T5 Exercises (new) | 4 | 2 | 2 | 0 |
| T6 Safety / regulation | 1 | 1 | 0 | 0 |
| T7 Agency | 2 | 0 | 1 | 1 |
| T8 Price | 1 | 1 | 0 | 0 |
| T9 Dated data | 2 | 1 | 1 | 0 |
| **Total** | **63** | **38** | **19** | **6** |

The four "Link to Learning" boxes (T10) point to English-language sites; none was worth a row for ch01.

**The one structural decision** is ch01.6 (m68683), the dimensional-analysis section: 41 of its 91 exercise segments
use US units. The proposal (L-ch01-001) is to keep the conversion-factor method, move the US units into one short box
with about five exercises on real US data, and convert the rest to SI ↔ SI conversions that Icelandic students
actually meet (km/h ↔ m/s, L/100 km, kWh ↔ MJ, mg ↔ g, mmol/L).

## 1.0 Introduction (m68663)

| ID | Segment | Target | Finding | Proposal | Pri |
|---|---|---|---|---|---|
| L-ch01-002 | `m68663:para:fs-idp32962032` | T3 | Morning narrative: "on your way to school, you stop to fill your car's gas tank". | Keep coffee and shower; make the shower's hot water the hook ("heita vatnið í sturtunni kemur úr borholu"), and drop the gas station, which few upper-secondary students drive to. | M |

## 1.1 Chemistry in Context (m68664)

| ID | Segment | Target | Finding | Proposal | Pri |
|---|---|---|---|---|---|
| L-ch01-003 | `m68664:problem:fs-idp94102864` | T1 | "The mass of a lead pipe is 14 lb." | 6,4 kg. | H |
| L-ch01-004 | `m68664:problem:fs-idp72952208` | T1 | "melt 2 lbs of ice … 1 lb of ice". | 2 kg and 1 kg (the argument is proportional, so the numbers need not convert exactly). | H |

## 1.2 Phases and Classification of Matter (m68667)

| ID | Segment | Target | Finding | Proposal | Pri |
|---|---|---|---|---|---|
| L-ch01-005 | `m68667:para:fs-idp64376128` | T3 | "if a carbon atom were the size of a dime … larger than a football field … 150 million carbon atom 'dimes'". | An Icelandic coin and a knattspyrnuvöllur. **Recompute** the 150 million from the coin's diameter and the pitch's area. | M |
| L-ch01-006 | `m68667:para:fs-idm12481392` | T3 | "maple syrup" among homogeneous mixtures. | A drink Icelandic students know (sódavatn, or kaffi). | L |
| L-ch01-007 | `m68667:para:fs-idm10031184` + figure `CNX_Chem_01_02_Plasma` | T2 | Plasma "occurs naturally in the interiors of stars"; the figure is a plasma torch. | Add the northern lights as a natural plasma that every Icelandic student has seen. Phrase it carefully: the light comes from excited atoms in the ionosphere, which is a plasma. **[verify phrasing]** | M |
| L-ch01-008 | box `fs-idm86364640` "Decomposition of Water / Production of Hydrogen", `m68667:para:fs-idm74337664` | T2 | Fuel-cell vehicles; "FCVs are not yet economically viable, and current hydrogen production depends on natural gas". | Add one Icelandic paragraph: Reykjavík ran hydrogen fuel-cell buses from 2003 (the ECTOS project), and Iceland can make hydrogen by electrolysis with renewable electricity. **[verify]** Draft below. | H |
| L-ch01-009 | same paragraph | T9 | "not yet economically viable" is a dated claim (2e text). | Update to a dated, sourced statement, or soften to "hefur enn ekki náð útbreiðslu". | M |
| L-ch01-010 | box `fs-idm6260000` "Chemistry of Cell Phones" | T2 | Generic; no US content. | Optional: one sentence on where Icelandic phones are recycled (Úrvinnslusjóður or the municipal centres). **[verify]** | L |
| L-ch01-011 | `m68667:problem:fs-idm1692336` | T1 | "Exactly one pound of bread dough … oven at 350 °F". | 500 g of dough at 180 °C (the question is about conservation of mass, so round numbers are fine). | H |
| L-ch01-012 | figure `CNX_Chem_01_02_Plasma` | T4 | Plasma torch photo (Wikimedia, "Hypertherm"). | Optional second panel: the northern lights over Iceland, CC BY or CC0. Goes with L-ch01-007. | L |

## 1.3 Physical and Chemical Properties (m68670)

| ID | Segment | Target | Finding | Proposal | Pri |
|---|---|---|---|---|---|
| L-ch01-013 | `m68670:para:fs-idp29966736` | T1 | "a gallon of milk has a larger mass than a cup of milk". | "lítri af mjólk … glas af mjólk" (Icelandic milk is sold by the litre). | H |
| L-ch01-014 | box `fs-idm51398400` "Hazard Diamond", figure `CNX_Chem_01_03_HazDiamond`, alt `m68670:alt:fs-idp131195760-alt` | T6 | Teaches the US NFPA 704 diamond; the alt text gives flash points in °F. Icelandic labs and shops label chemicals under CLP (EU 1272/2008, through the EEA) with the nine GHS pictograms. | Replace the box with a CLP/GHS box ("Hættumerki á efnaumbúðum"): the pictograms, the signal words *Hætta* and *Varúð*, and the H- and P-statements. Keep one sentence that the NFPA diamond is seen on US-sourced containers. New figure: the GHS pictograms (UNECE, licence to check). **The most valuable item in the chapter.** | H |

## 1.4 Measurements (m68674)

| ID | Segment | Target | Finding | Proposal | Pri |
|---|---|---|---|---|---|
| L-ch01-015 | `m68674:para:fs-idp178656` | T1 | "a 0.25-pound hamburger weighs one-fourth as much as … 1 pound". | "250 g smjörstykki vegur fjórðung af 1 kg." | H |
| L-ch01-016 | `m68674:para:fs-idm144392592` | T7 | "SI units have been used by the United States NIST since 1964." | Iceland: the metric system by law in 1907 **[verify year and in-force date]**; Neytendastofa as the Icelandic metrology authority **[verify]**. | M |
| L-ch01-017 | `m68674:para:eip-134` | T1 | Milk in gallons, quarts and pints, to contrast non-decimal units with SI's powers of ten. | Keep the contrast with old Icelandic units instead (alin, faðmur, pottur) **[verify definitions]**: it makes the same point and is local history. | M |
| L-ch01-018 | `m68674:para:fs-idm64613648` | T1 | "A meter is about 3 inches longer than a yard … 39.37 inches or 1.094 yards." | Drop the yard comparison; refer to the US-units box in 1.6. | H |
| L-ch01-019 | figure `CNX_Chem_01_04_MYdCmIn`, alt `m68674:alt:fs-idm2958720-alt` | T1 | Figure compares a metre with a yard and a centimetre with an inch. | Keep the figure (it is about sizes), but move its inch/yard reading into the US-units box. If replaced, a metre stick and a ruler alone. | M |
| L-ch01-020 | `m68674:glossary-def:fs-idm22681216-def` | T1 | Glossary: "1 m = approximately 1.094 yards". | Remove the yard clause. | H |
| L-ch01-021 | `m68674:para:fs-idm81813264` | T1 | "One liter is about 1.06 quarts." | Remove, or move to the US-units box. | H |
| L-ch01-022 | `m68674:problem:fs-idm263137792` | T1 | "Is one liter about an ounce, a pint, a quart, or a gallon?" | Rewrite as SI estimation: "Er lítri nær rúmmáli teskeiðar, mjólkurfernu eða baðkars?" | H |
| L-ch01-023 | `m68674:problem:fs-idm382474864` + solution `fs-idm339638512` | T1 | "Is a meter about an inch, a foot, a yard, or a mile?" / "about a yard". | Rewrite as SI estimation (a fingernail, a stride, a football pitch); new answer. | H |
| L-ch01-024 | `m68674:problem:fs-idm344160384` | T1 | Marathon "26 miles 385 yards". | 42,195 km (and run the Reykjavíkurmaraþon). | H |
| L-ch01-025 | `m68674:problem:fs-idm226840320` | T3 | "the area of a football field" (US football). | Knattspyrnuvöllur. | H |
| L-ch01-026 | `m68674:problem:fs-idm312450912` | T3 | "the area of the state of Delaware". | The area of Iceland, or of Vatnajökull. | H |
| L-ch01-027 | figure `CNX_Chem_01_04_Kilogram` | T7 | Replica kilogram "housed at NIST in Maryland". | Keep (true and historical). Optional: where Iceland's national mass standard is kept **[verify that one exists]**. | L |

## 1.5 Measurement Uncertainty, Accuracy, and Precision (m68690)

| ID | Segment | Target | Finding | Proposal | Pri |
|---|---|---|---|---|---|
| L-ch01-028 | `m68690:para:fs-idm288863760` | T1 | Exact numbers: "1 foot is exactly 12 inches, 1 inch is exactly 2.54 centimeters". | Keep "1 inch is exactly 2,54 cm" (it is a fine example of a defined number); replace the foot/inch with an SI one (1 km is exactly 1000 m). | M |
| L-ch01-029 | `m68690:para:fs-idm254904560` | T3 | "If you place a quarter on a … balance … 6.72 g", carried through the paragraph (6.71, 6.73, 6.723, …). | An Icelandic coin; **recompute every number** in the paragraph from its real mass **[look up the mass]**. | M |
| L-ch01-030 | `m68690:para:fs-idm173917264` | T9 | "the official January 2014 census reported the resident population of the US as 317,297,725 … 3.17 × 10⁸". | Iceland's population from Hagstofa Íslands, dated; the significant-figure argument is the same (about 3,9 × 10⁵ **[look up]**). | H |
| L-ch01-031 | `m68690:para:fs-idp174984224`, table title `m68690:entry:auto-117` | T1 | Machines "meant to dispense 10 ounces (296 mL) of cough syrup". | Drop "10 ounces" and keep 296 mL, which leaves the table's data untouched. (Rescaling to 300 mL would change every cell.) | M |
| L-ch01-032 | `m68690:problem:fs-idp223534496` | T1 | "(c) the number of gallons of gasoline necessary to fill an automobile gas tank". | Litres. | H |
| L-ch01-033 | `m68690:problem:fs-idm9127744` | T1 | "(d) 5.5 ounces" (a significant-figures item). | 5,5 g. | H |

## 1.6 Mathematical Treatment of Measurement Results (m68683)

| ID | Segment | Target | Finding | Proposal | Pri |
|---|---|---|---|---|---|
| L-ch01-001 | the whole module | T1 | 41 of 91 exercise segments use US units; the conversion table `fs-idm222237232` lists yards, miles, quarts, ounces, pounds. | **Structural.** Keep the conversion-factor method and the table's SI rows. New box "Bandarískar einingar" holding the US rows, the 1-lb footnote and about five exercises on real US data. Everything else becomes SI ↔ SI. Decision LD4. | H |
| L-ch01-034 | `m68683:para:fs-idm221472400` | T1 | Worked conversion: "a basketball player's vertical jump of 34 inches" → cm. | Keep as the box's opening example (it is the one place inches belong), or convert km/h → m/s in the main text. | M |
| L-ch01-035 | `m68683:para:fs-idp22709840` and its solution paras | T1 | Worked example: frisbee 125 g → ounces. | 125 g → kg, or a medicine dose mg → g. | H |
| L-ch01-036 | `m68683:para:fs-idm224226288` | T1 | Check Your Learning: "Convert 9.345 qt to liters." | 9,345 L → mL, or to m³. | H |
| L-ch01-037 | `m68683:para:fs-idm280005808`, `fs-idp14199296`, `fs-idm244171104`, `fs-idm219351440`, item `fs-idm287602768-item-1` | T1 | Worked example: antifreeze "4.00-qt sample … weighs 9.26 lb", density in g/mL; then 1.000 oz → L. | Antifreeze density from a volume in L and a mass in kg; recompute the answer. The oz → L follow-up moves to the box. | H |
| L-ch01-038 | `m68683:para:fs-idm338996800` and the five paras after it | T3 + T1 | Worked example: a Lamborghini from Philadelphia to Atlanta (1250 km, 213 L), mpg, and "$3.80 per gallon". | Reykjavík → Akureyri by road (about 390 km **[verify]**), fuel consumption in L/100 km, cost in kr. Recompute. An electric-car variant (kWh/100 km) is very Icelandic and fits the energy theme. | H |
| L-ch01-039 | `m68683:para:fs-idm125734208` and the three paras after it | T3 + T1 | Check Your Learning: a Prius from San Francisco to Seattle (1300 km, 59.7 L), mpg, "$3.90 per gallon". | Reykjavík → Egilsstaðir or Höfn; L/100 km; kr. Recompute. | H |
| L-ch01-040 | `m68683:para:fs-idm315428528`, `fs-idm292238912` | T8 | Prices: "$3.80 per gallon", "$3.90 per gallon". | ISK per litre, looked up and dated when drafted. Part of 038/039. | H |
| L-ch01-041 | Fahrenheit paras (`fs-idm308860096` … `fs-idm131802496`), figure `CNX_Chem_01_06_TempScales`, examples "Conversion from Celsius/Fahrenheit" | T1 | The Celsius–Fahrenheit derivation and two worked examples. | Keep the Celsius ↔ kelvin treatment in the main text; move the Fahrenheit derivation and the "Conversion from Fahrenheit" example into the US-units box. Keep the figure (three scales). | M |
| L-ch01-042 | `m68683:problem:fs-idm239024480` | T3 | "The weather in Europe was unusually warm during the summer of 1995 … 45 °C" → °F. | Iceland's record high, 30,5 °C at Teigarhorn in 1939 **[verify]** → K (and °F inside the box). | H |
| L-ch01-043 | problems `fs-idm279869696`, `fs-idm84945616`, `fs-idp63976464`, `fs-idm208959712`, `fs-idm424194064`, `fs-idm295984656` | T1 | "yards in 1 meter", "liters in 1 liquid quart", "pounds in 1 kilogram", "kilometers in 1 mile", "liters in 1 cubic foot", "grams in 1 ounce". | Two stay in the box (kg ↔ lb, km ↔ mile); the rest become SI conversion-factor items (mL in 1 m³, m/s in 1 km/h, J in 1 kWh). | H |
| L-ch01-044 | `m68683:problem:fs-idm310365264`, `fs-idm29733712` | T1 | Labels in "2.0 L and 67.6 fl oz", "978 grams and 34.5 oz". | Keep one in the box (real US labels are the point); replace the other with an Icelandic label in g and kJ. | M |
| L-ch01-045 | `m68683:problem:fs-idm292728304`, `fs-idm205705360` | T1 | Soccer ball and women's basketball sizes in inches and ounces. | Give FIFA's specification in cm and g and ask for another SI quantity (density, volume). | M |
| L-ch01-046 | `m68683:problem:fs-idm210994400`, `fs-idp25376512` | T1 | "a 12.0-oz can"; "A barrel of oil is exactly 42 gal". | 330 mL can → L. **Keep the oil barrel** in the box: oil is priced per barrel worldwide, so it is genuinely useful. | H |
| L-ch01-047 | `m68683:problem:fs-idm294701072`, `fs-idm335136096` | T1 | A "197-lb weight lifter" against a 90 kg class. | A lifter of 89,4 kg; ask in kg and N. | H |
| L-ch01-048 | `m68683:problem:fs-idm195964464`, `fs-idm228166784` | T1 | "Gasoline is sold by the liter in many countries … 12.0-gal gas tank"; "1/2 gal of milk". | Both premises are already Icelandic reality; convert to a tank in L → m³ and a milk carton in L → mL, or drop. | H |
| L-ch01-049 | `m68683:problem:fs-idm247416224` | T1 | "A long ton is defined as exactly 2240 lb." | Tonne vs kg instead, or drop. | L |
| L-ch01-050 | `m68683:problem:fs-idm128192960`, `fs-idp1437328`, `fs-idm124542480`, `fs-idm216546816`, `fs-idm155997760` | T3 + T1 | Long jump "29 ft 4¼ in."; "the area of the state of Oregon, 96,981 mi²"; a gill; "3525-lb car"; "2.3-oz egg". | Long jump world record in m → cm; Iceland's area in km² → m²; a car of 1600 kg → tonnes; a 65 g egg → kg. Recompute the solution set. | H |
| L-ch01-051 | `m68683:problem:fs-idm367197520`, `fs-idp51878496`, `fs-idm307271088`, `fs-idm98022832`, `fs-idm162390144`, solution `fs-idm134479920` | T3 + T1 | Soccer field to feet; Kilimanjaro "19,565 ft"; an 8.5 × 11-inch sheet; "a bushel of rye, 32.0 lb"; a 5.00-grain aspirin. | Hvannadalshnúkur's height in m → km **[look up current height]**; an A4 sheet (21,0 × 29,7 cm) in m²; a paracetamol tablet 500 mg → g. Recompute the solution set. | H |
| L-ch01-052 | `m68683:problem:fs-idm142862320`, `fs-idm142857600`, solution `fs-idp194388912` | T1 | 50-Trillion Angstrom Run "in kilometers and in miles"; a cubit "in meters and in feet". | Drop the miles and feet; keep the fun (Å → km, cubit → m). | H |
| L-ch01-053 | `m68683:problem:fs-idp31641040`, `fs-idp43402000` | T1 | "gas tank … holds 22.3 gallons … mass in kilograms and pounds"; "A bottle containing 1/4 lb". | Tank of 70 L; a bottle of 100 g. | H |
| L-ch01-054 | `m68683:problem:fs-idm155316144`, solution `fs-idm321078368` | T1 | "159 cm tall and weighs 45.8 kg. What is her height in inches and weight in pounds?" | Keep in the box (converting one's own height for a US form is a real task). | L |
| L-ch01-055 | `m68683:problem:fs-idp31182736` | T1 | Grand Prix "229.8 km/h … miles per hour, meters per second, and feet per second". | Drop mph and ft/s; ask for m/s only. | H |
| L-ch01-056 | `m68683:problem:fs-idm124373120` | T3 | "To describe to a European how houses are constructed in the US … 'two-by-four' lumber". | Keep in the box; it is the clearest "legacy US data" exercise in the chapter. | M |

## Photos considered (T4)

| ID | Figure | Finding | Proposal | Pri |
|---|---|---|---|---|
| L-ch01-057 | `CNX_Chem_01_01_WaterDom` | Ice, liquid water and steam as the macroscopic domain. | An Icelandic scene: a glacier lagoon or a steaming hot spring. Licence CC BY / CC0, or the project's own photo. | H |
| L-ch01-058 | `CNX_Chem_01_00_DailyChem` | Chapter opener collage, including a gasoline pump. | Optional: a panel with an EV charger or a geothermal shower, matching L-ch01-002. | M |
| L-ch01-059 | `CNX_Chem_01_03_HazDiamond` | The NFPA figure. | Replaced by the GHS pictograms with L-ch01-014. | M |

(The plasma panel is L-ch01-012 above.)

## New exercises (T5)

Without the course descriptions (decision LD5) these are candidates, not a gap analysis.

| ID | Where | Proposal | Pri |
|---|---|---|---|
| L-ch01-060 | end of 1.6 | Three SI-only conversion problems with Icelandic data: hot water at 80 °C in K; a hitaveita flow in L/s → m³/h; a power plant's output in MW → kWh per day. Worked solutions; numbers looked up and sourced. | H |
| L-ch01-061 | end of 1.4 | Density from Icelandic rocks: basalt and pumice (vikur), and why pumice floats. Sourced densities. | H |
| L-ch01-062 | US-units box | The "about five" legacy exercises: a US recipe at 350 °F with cups, a US car's mpg → L/100 km, the oil barrel, the two-by-four, one's height for a US form. Most exist already (046, 054, 056). | M |
| L-ch01-063 | 1.5 | A significant-figures problem from a real Icelandic measurement series (Veðurstofan temperature or Hagstofa data). | M |

## Considered and kept

Not counted above, listed so the triage can see they were looked at:

- `CNX_Chem_01_01_Alchemist` caption: Alma Levant Hayden at the FDA and NIH. Historical and a good portrait; keep.
- `m68683:para:fs-idm296725200`: the list of countries that still use Fahrenheit. It is the reason for the US-units box; keep.
- `CNX_Chem_01_02_GoldAtoms` credit to the US Geological Survey: a credit line, not content.
- The density table's gasoline row (`m68674:entry:auto-131`) and the gasoline examples in 1.2: gasoline is everyday in Iceland too.
- The sports drink (homogeneous mixture), baking soda and the cell-phone box: international.
- Number format: the MT already writes decimal commas, so nothing to localize.

## Sample drop-in drafts

Two drafts to show the shape. Both are proposals only, with facts marked **[verify]**; nothing is final until a
localizer fits it to the faithful text and the head editor approves it.

**L-ch01-008 (T2), added at the end of the hydrogen box:**

> Ísland hefur verið tilraunavettvangur fyrir vetni í samgöngum. Árin 2003 til 2007 óku vetnisstrætisvagnar um
> Reykjavík í evrópska verkefninu ECTOS **[verify]**, og vetnið var framleitt með rafgreiningu vatns á
> afgreiðslustöðinni sjálfri. Þar sem nær öll raforka á Íslandi kemur úr vatnsafli og jarðvarma getur slík rafgreining
> framleitt vetni án þess að jarðefnaeldsneyti sé brennt.

Facts to source: the project name and years; on-site electrolysis; the share of renewable electricity (Orkustofnun).

**L-ch01-030 (T9), replacing the census example:**

> Hagstofa Íslands taldi íbúa landsins [N] hinn 1. janúar [ár] **[look up]**. Var mannfjöldinn ákvarðaður upp á
> einstakling, með öllum þessum markverðu tölustöfum? Fólk fæðist, deyr og flytur til og frá landinu á hverjum degi, svo
> eðlilegra er að ætla að við þekkjum fjöldann upp á nokkur hundruð, og þá ætti að skrá hann sem [N,N] × 10⁵.
