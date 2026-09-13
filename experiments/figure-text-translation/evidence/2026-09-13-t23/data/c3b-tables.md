### T1 — totals per variant (population: 176 layout-path drawn blocks; unit: drawn block)

| measure | V0 | V1 | V2 | V3 | V3L |
|---|---|---|---|---|---|
| census union (hit ∪ off-page ∪ shrunk), blocks / figs | 44 / 23 | 29 / 22 | 29 / 22 | 25 / 15 | 23 / 20 |
| hit-artwork (ink ≥10 px on L<128) | 32 | 15 | 15 | 10 | 4 |
| Σ ink on dark artwork, px | 3664 | 3050 | 3050 | 2855 | 170 |
| off-page (drawn ink off page > source) | 4 | 2 | 2 | 1 | 6 |
| shrunk (< sz0) | 15 | 14 | 14 | 16 | 14 |
| Σ shrink, pt | 10.75 | 11.0 | 11.0 | 18.5 | 11.0 |
| container spill ≥10 px | 24 | 2 | 2 | 1 | 7 |
| contact (BOUNDED drawn L/R margin <1 pt) | 26 | 0 | 0 | 0 | 0 |
| text collision ≥10 px (SUPPLEMENTARY) | 7 | 1 | 1 | 1 | 1 |
| line count ≠ source | 66 | 56 | 33 | 31 | 33 |
| unresolved [USER] mechanisms (of 50) | 49 | 21 | 21 | 17 | 16 |
| PROBLEM blocks (pre-registered rule) | 50 | 23 | 23 | 15 | 17 |
| blocks whose drawing differs from V0 | 0 | 92 | 100 | 124 | 118 |

### T2 — per class (BOUNDED n=92 / OPEN n=84)

| variant | class | hit | off-page | shrunk | spill | contact | text-coll | more lines | fewer lines |
|---|---|---|---|---|---|---|---|---|---|
| V0 | BOUNDED | 17 | 2 | 7 | 22 | 26 | 3 | 3 | 34 |
| V0 | OPEN | 15 | 2 | 8 | 2 | 0 | 4 | 15 | 14 |
| V1 | BOUNDED | 0 | 0 | 6 | 0 | 0 | 0 | 0 | 27 |
| V1 | OPEN | 15 | 2 | 8 | 2 | 0 | 1 | 15 | 14 |
| V2 | BOUNDED | 0 | 0 | 6 | 0 | 0 | 0 | 0 | 6 |
| V2 | OPEN | 15 | 2 | 8 | 2 | 0 | 1 | 15 | 12 |
| V3 | BOUNDED | 0 | 0 | 6 | 0 | 0 | 0 | 0 | 6 |
| V3 | OPEN | 10 | 1 | 10 | 1 | 0 | 1 | 13 | 12 |
| V3L | BOUNDED | 0 | 0 | 6 | 0 | 0 | 0 | 0 | 6 |
| V3L | OPEN | 4 | 6 | 8 | 7 | 0 | 1 | 15 | 12 |

### T3 — transitions vs V0, every broken block NAMED

| variant | verdict | fixed | broken | still bad | broken blocks |
|---|---|---|---|---|---|
| V1 | census | 15 | 0 | 29 | — |
| V1 | census_no_shrink | 17 | 0 | 16 | — |
| V1 | hit | 17 | 0 | 15 | — |
| V1 | offpage | 2 | 0 | 2 | — |
| V1 | shrunk | 1 | 0 | 14 | — |
| V1 | spill | 22 | 0 | 2 | — |
| V1 | contact | 26 | 0 | 0 | — |
| V1 | text_coll | 6 | 0 | 1 | — |
| V1 | problem | 27 | 0 | 23 | — |
| V2 | census | 15 | 0 | 29 | — |
| V2 | census_no_shrink | 17 | 0 | 16 | — |
| V2 | hit | 17 | 0 | 15 | — |
| V2 | offpage | 2 | 0 | 2 | — |
| V2 | shrunk | 1 | 0 | 14 | — |
| V2 | spill | 22 | 0 | 2 | — |
| V2 | contact | 26 | 0 | 0 | — |
| V2 | text_coll | 6 | 0 | 1 | — |
| V2 | problem | 27 | 0 | 23 | — |
| V3 | census | 22 | 3 | 22 | 03_01_exocytosis-88f6 b0, 04_05_combmap_img b12, 04_05_combmap_img b14 |
| V3 | census_no_shrink | 23 | 0 | 10 | — |
| V3 | hit | 22 | 0 | 10 | — |
| V3 | offpage | 3 | 0 | 1 | — |
| V3 | shrunk | 7 | 8 | 8 | 03_01_exocytosis-88f6 b0, 03_01_exocytosis-88f6 b2, 04_03_flowchart b13, 04_03_flowchart b14, 04_05_combmap_img b11, 04_05_combmap_img b12, 04_05_combmap_img b13, 04_05_combmap_img b14 |
| V3 | spill | 23 | 0 | 1 | — |
| V3 | contact | 26 | 0 | 0 | — |
| V3 | text_coll | 6 | 0 | 1 | — |
| V3 | problem | 35 | 0 | 15 | — |
| V3L | census | 21 | 0 | 23 | — |
| V3L | census_no_shrink | 23 | 0 | 10 | — |
| V3L | hit | 28 | 0 | 4 | — |
| V3L | offpage | 3 | 5 | 1 | 03_02_argon_img-9025 b2, 03_02_glycine_img-7c96 b1, 03_02_potassium_img-f1d1 b1, 03_02_vitC_img-e537 b1, 03_05_Example2_img b1 |
| V3L | shrunk | 1 | 0 | 14 | — |
| V3L | spill | 23 | 6 | 1 | 03_02_argon_img-9025 b2, 03_02_copperMoles_img-a962 b4, 03_02_glycine_img-7c96 b1, 03_02_potassium_img-f1d1 b1, 03_02_vitC_img-e537 b1, 03_05_Example2_img b1 |
| V3L | contact | 26 | 0 | 0 | — |
| V3L | text_coll | 6 | 0 | 1 | — |
| V3L | problem | 33 | 0 | 17 | — |

### T4 — fixed blocks per variant (census verdict hit ∪ off-page ∪ shrunk), NAMED

- **V1** fixed (15): 03_01_saltMass b2, 03_02_potassium_img-f1d1 b2, 03_02_sacch_img-3278 b2, 03_03_empform b2, 03_03_empform b5, 03_03_empform b6, 03_05_Example2_img b0, 03_05_Example2_img b2, 04_03_flowchart b6, 04_03_flowchart b9, 04_05_combmap_img b9, 04_05_map8_img b3, 04_05_map8_img b4, 04_05_map8_img b5, 04_05_map8_img b6
- **V2** fixed (15): 03_01_saltMass b2, 03_02_potassium_img-f1d1 b2, 03_02_sacch_img-3278 b2, 03_03_empform b2, 03_03_empform b5, 03_03_empform b6, 03_05_Example2_img b0, 03_05_Example2_img b2, 04_03_flowchart b6, 04_03_flowchart b9, 04_05_combmap_img b9, 04_05_map8_img b3, 04_05_map8_img b4, 04_05_map8_img b5, 04_05_map8_img b6
- **V3** fixed (22): 03_01_saltMass b2, 03_02_potassium_img-f1d1 b2, 03_02_sacch_img-3278 b2, 03_03_empform b2, 03_03_empform b5, 03_03_empform b6, 03_05_Example2_img b0, 03_05_Example2_img b2, 04_01_rxn2 b9, 04_03_etheneBr_img b2, 04_03_flowchart b6, 04_03_flowchart b9, 04_03_map2_img b6, 04_03_map3_img b6, 04_03_moleratio1_img b2, 04_05_combmap_img b9, 04_05_map7_img b6, 04_05_map8_img b1, 04_05_map8_img b3, 04_05_map8_img b4, 04_05_map8_img b5, 04_05_map8_img b6
- **V3L** fixed (21): 03_01_saltMass b2, 03_02_copperMoles_img-a962 b1, 03_02_potassium_img-f1d1 b2, 03_02_sacch_img-3278 b1, 03_02_sacch_img-3278 b2, 03_03_empform b2, 03_03_empform b5, 03_03_empform b6, 03_05_Example2_img b0, 03_05_Example2_img b2, 03_05_Example2_img b3, 04_03_etheneBr_img b2, 04_03_flowchart b6, 04_03_flowchart b9, 04_05_combmap_img b11, 04_05_combmap_img b13, 04_05_combmap_img b9, 04_05_map8_img b3, 04_05_map8_img b4, 04_05_map8_img b5, 04_05_map8_img b6

### T5 — [USER]-flagged mechanisms (41 blocks, 50 mechanism checks): ✅ resolved / ❌ not

| row | block | class | mech | V0 | V1 | V2 | V3 | V3L | lines src→V0 / V2 / V3 / V3L | size V0 / V3 |
|---|---|---|---|---|---|---|---|---|---|---|
| 7 | 03_01_alsulfatemass_img b3 `Subtotal|(amu)` | BOUNDED | TABLE | ❌ | ✅ | ✅ | ✅ | ✅ | 2->1 / 2 / 2 / 2 | 9.0 / 9.0 |
| 7 | 03_01_alsulfatemass_img b3 `Subtotal|(amu)` | BOUNDED | WIDER | ❌ | ✅ | ✅ | ✅ | ✅ | 2->1 / 2 / 2 / 2 | 9.0 / 9.0 |
| 8 | 03_01_aspirin b3 `Subtotal|(amu)` | BOUNDED | TABLE | ❌ | ✅ | ✅ | ✅ | ✅ | 2->1 / 2 / 2 / 2 | 9.0 / 9.0 |
| 8 | 03_01_aspirin b3 `Subtotal|(amu)` | BOUNDED | WIDER | ❌ | ✅ | ✅ | ✅ | ✅ | 2->1 / 2 / 2 / 2 | 9.0 / 9.0 |
| 10 | 03_01_chloroform b3 `Subtotal|(amu)` | BOUNDED | TABLE | ❌ | ✅ | ✅ | ✅ | ✅ | 2->1 / 2 / 2 / 2 | 9.0 / 9.0 |
| 10 | 03_01_chloroform b3 `Subtotal|(amu)` | BOUNDED | WIDER | ❌ | ✅ | ✅ | ✅ | ✅ | 2->1 / 2 / 2 / 2 | 9.0 / 9.0 |
| 14 | 03_02_argon_img-9025 b2 `Multiply by molar|mass (g/mol)` | OPEN | NARROWER | ❌ | ❌ | ❌ | ❌ | ❌ | 2->3 / 3 / 3 / 3 | 9.0 / 9.0 |
| 15 | 03_02_copperMoles_img-a962 b1 `Divide by molar|mass (g/mol)` | OPEN | NARROWER | ❌ | ❌ | ❌ | ❌ | ✅ | 2->3 / 3 / 3 / 3 | 9.0 / 9.0 |
| 15 | 03_02_copperMoles_img-a962 b4 `Multiply by|Avogadro’s|number (mol–1)` | OPEN | NARROWER | ❌ | ❌ | ❌ | ❌ | ❌ | 3->4 / 4 / 4 / 4 | 9.0 / 9.0 |
| 16 | 03_02_glycine_img-7c96 b1 `Divide by molar|mass (g/mol)` | OPEN | NARROWER | ❌ | ❌ | ❌ | ❌ | ❌ | 2->3 / 3 / 3 / 3 | 9.0 / 9.0 |
| 17 | 03_02_potassium_img-f1d1 b1 `Divide by molar|mass (g/mol)` | OPEN | NARROWER | ❌ | ❌ | ❌ | ❌ | ❌ | 2->3 / 3 / 3 / 3 | 9.0 / 9.0 |
| 18 | 03_02_sacch_img-3278 b1 `Divide by molar|mass (g/mol)` | OPEN | NARROWER | ❌ | ❌ | ❌ | ❌ | ✅ | 2->3 / 3 / 3 / 3 | 9.0 / 9.0 |
| 18 | 03_02_sacch_img-3278 b2 `Mass of|C7H5NO3S|(g)` | BOUNDED | WIDER | ❌ | ✅ | ✅ | ✅ | ✅ | 3->2 / 3 / 3 / 3 | 9.0 / 9.0 |
| 19 | 03_02_vitC_img-e537 b0 `Mass of|vitamin C (g)` | BOUNDED | WIDER | ✅ | ✅ | ✅ | ✅ | ✅ | 2->2 / 2 / 2 / 2 | 9.0 / 9.0 |
| 19 | 03_02_vitC_img-e537 b1 `Multiply by molar|mass (g/mol)` | OPEN | NARROWER | ❌ | ❌ | ❌ | ❌ | ❌ | 2->3 / 3 / 3 / 3 | 9.0 / 9.0 |
| 20 | 03_03_empform b2 `Mass of|A atoms` | BOUNDED | WIDER | ❌ | ✅ | ✅ | ✅ | ✅ | 2->1 / 2 / 2 / 2 | 9.0 / 9.0 |
| 20 | 03_03_empform b5 `Mass of|X atoms` | BOUNDED | WIDER | ❌ | ✅ | ✅ | ✅ | ✅ | 2->1 / 2 / 2 / 2 | 9.0 / 9.0 |
| 20 | 03_03_empform b6 `A to X|mole ratio` | BOUNDED | WIDER | ❌ | ✅ | ✅ | ✅ | ✅ | 2->2 / 2 / 2 / 2 | 9.0 / 9.0 |
| 20 | 03_03_empform b8 `Empirical|formula` | BOUNDED | SHRINK | ❌ | ❌ | ❌ | ❌ | ❌ | 2->1 / 1 / 1 / 1 | 8.75 / 7.25 |
| 20 | 03_03_empform b8 `Empirical|formula` | BOUNDED | WIDER | ❌ | ✅ | ✅ | ✅ | ✅ | 2->1 / 1 / 1 / 1 | 8.75 / 7.25 |
| 21 | 03_05_Example2_img b0 `Mass of|solution (g)` | BOUNDED | WIDER | ❌ | ✅ | ✅ | ✅ | ✅ | 2->2 / 2 / 2 / 2 | 9.0 / 9.0 |
| 21 | 03_05_Example2_img b1 `Multiply by|mass percent as ratio|(g HCl/g solution)` | OPEN | NARROWER | ❌ | ❌ | ❌ | ❌ | ❌ | 3->4 / 4 / 4 / 4 | 9.0 / 9.0 |
| 21 | 03_05_Example2_img b2 `Mass of|HCl (g)` | BOUNDED | WIDER | ❌ | ✅ | ✅ | ✅ | ✅ | 2->1 / 2 / 2 / 2 | 9.0 / 9.0 |
| 21 | 03_05_Example2_img b3 `Multiply by|density (g/mL)` | OPEN | NARROWER | ❌ | ❌ | ❌ | ❌ | ✅ | 2->3 / 3 / 3 / 3 | 9.0 / 9.0 |
| 23 | 04_03_etheneBr_img b2 `with an excess of Br2.` | OPEN | ANCHOR | ❌ | ❌ | ❌ | ✅ | ✅ | 1->2 / 2 / 1 / 2 | 9.0 / 9.0 |
| 23 | 04_03_etheneBr_img b2 `with an excess of Br2.` | OPEN | NARROWER | ❌ | ❌ | ❌ | ✅ | ❌ | 1->2 / 2 / 1 / 2 | 9.0 / 9.0 |
| 24 | 04_03_ethene_img b0 `required to react with H2O to produce 9.55 g of` | OPEN | ANCHOR | ❌ | ❌ | ❌ | ❌ | ❌ | 1->2 / 2 / 2 / 2 | 9.0 / 9.0 |
| 24 | 04_03_ethene_img b0 `required to react with H2O to produce 9.55 g of` | OPEN | NARROWER | ❌ | ❌ | ❌ | ❌ | ❌ | 1->2 / 2 / 2 / 2 | 9.0 / 9.0 |
| 24 | 04_03_ethene_img b17 `The number of moles and the mass of` | OPEN | ANCHOR | ❌ | ❌ | ❌ | ✅ | ✅ | 1->1 / 1 / 1 / 1 | 9.0 / 9.0 |
| 25 | 04_03_flowchart b10 `Number|of|particles|of A` | BOUNDED | WIDER | ❌ | ✅ | ✅ | ✅ | ✅ | 4->2 / 4 / 4 / 4 | 9.0 / 9.0 |
| 25 | 04_03_flowchart b11 `Number|of|particles|of B` | BOUNDED | WIDER | ❌ | ✅ | ✅ | ✅ | ✅ | 4->2 / 4 / 4 / 4 | 9.0 / 9.0 |
| 25 | 04_03_flowchart b6 `Volume|of pure|substance|B` | BOUNDED | WIDER | ❌ | ✅ | ✅ | ✅ | ✅ | 4->2 / 4 / 4 / 4 | 9.0 / 9.0 |
| 25 | 04_03_flowchart b9 `Volume|of pure|substance|A` | BOUNDED | WIDER | ❌ | ✅ | ✅ | ✅ | ✅ | 4->2 / 4 / 4 / 4 | 9.0 / 9.0 |
| 29 | 04_03_moleratio2_img b3 `Stoichiometric |factor` | OPEN | SHRINK | ❌ | ❌ | ❌ | ❌ | ❌ | 2->1 / 1 / 1 / 1 | 8.5 / 8.25 |
| 29 | 04_03_moleratio2_img b3 `Stoichiometric |factor` | OPEN | WIDER | ❌ | ❌ | ❌ | ❌ | ❌ | 2->1 / 1 / 1 / 1 | 8.5 / 8.25 |
| 31 | 04_04_sandwich b2 `We can make:` | OPEN | ANCHOR | ❌ | ❌ | ❌ | ❌ | ❌ | 1->2 / 2 / 2 / 2 | 9.0 / 9.0 |
| 31 | 04_04_sandwich b2 `We can make:` | OPEN | NARROWER | ❌ | ❌ | ❌ | ❌ | ❌ | 1->2 / 2 / 2 / 2 | 9.0 / 9.0 |
| 31 | 04_04_sandwich b5 `+ 6 slices bread left over` | OPEN | NARROWER | ❌ | ❌ | ❌ | ✅ | ❌ | 1->2 / 2 / 1 / 2 | 9.0 / 9.0 |
| 32 | 04_05_combmap_img b0 `Mass of|CO2` | BOUNDED | WIDER | ❌ | ✅ | ✅ | ✅ | ✅ | 2->1 / 2 / 2 / 2 | 9.0 / 9.0 |
| 32 | 04_05_combmap_img b1 `Moles of|CO2` | BOUNDED | WIDER | ❌ | ✅ | ✅ | ✅ | ✅ | 2->1 / 2 / 2 / 2 | 9.0 / 9.0 |
| 32 | 04_05_combmap_img b10 `Empirical|formula` | BOUNDED | WIDER | ❌ | ✅ | ✅ | ✅ | ✅ | 2->1 / 1 / 1 / 1 | 8.75 / 8.0 |
| 32 | 04_05_combmap_img b4 `Mass of|H2O` | BOUNDED | WIDER | ❌ | ✅ | ✅ | ✅ | ✅ | 2->1 / 2 / 2 / 2 | 9.0 / 9.0 |
| 32 | 04_05_combmap_img b5 `Moles of|H2O` | BOUNDED | WIDER | ❌ | ✅ | ✅ | ✅ | ✅ | 2->1 / 2 / 2 / 2 | 9.0 / 9.0 |
| 32 | 04_05_combmap_img b8 `Percent|composition` | BOUNDED | SHRINK | ❌ | ❌ | ❌ | ❌ | ❌ | 2->1 / 1 / 1 / 1 | 6.75 / 6.0 |
| 32 | 04_05_combmap_img b8 `Percent|composition` | BOUNDED | WIDER | ❌ | ✅ | ✅ | ✅ | ✅ | 2->1 / 1 / 1 / 1 | 6.75 / 6.0 |
| 32 | 04_05_combmap_img b9 `C to H|mole ratio` | BOUNDED | WIDER | ❌ | ✅ | ✅ | ✅ | ✅ | 2->2 / 2 / 2 / 2 | 9.0 / 9.0 |
| 34 | 04_05_map8_img b3 `Mass of |BaSO4` | BOUNDED | WIDER | ❌ | ✅ | ✅ | ✅ | ✅ | 2->1 / 2 / 2 / 2 | 9.0 / 9.0 |
| 34 | 04_05_map8_img b4 `Moles of |BaSO4` | BOUNDED | WIDER | ❌ | ✅ | ✅ | ✅ | ✅ | 2->1 / 2 / 2 / 2 | 9.0 / 9.0 |
| 34 | 04_05_map8_img b5 `Moles of |CaSO4` | BOUNDED | WIDER | ❌ | ✅ | ✅ | ✅ | ✅ | 2->1 / 2 / 2 / 2 | 9.0 / 9.0 |
| 34 | 04_05_map8_img b6 `Mass of |CaSO4` | BOUNDED | WIDER | ❌ | ✅ | ✅ | ✅ | ✅ | 2->1 / 2 / 2 / 2 | 9.0 / 9.0 |

### T6 — shrunk blocks per variant (size, pt below sz0)

- **V0** (15, Σ 10.75 pt): 03_01_alsulfatemass_img b2 7.75 (−1.25), 03_01_aspirin b2 7.75 (−1.25), 03_01_chloroform b2 8.0 (−1.0), 03_01_saltMass b2 8.25 (−0.75), 03_03_empform b8 8.75 (−0.25), 04_01_rxn2 b9 8.75 (−0.25), 04_03_flowchart b5 8.5 (−0.5), 04_03_map2_img b6 8.5 (−0.5), 04_03_map3_img b6 8.5 (−0.5), 04_03_moleratio1_img b2 8.5 (−0.5), 04_03_moleratio2_img b3 8.5 (−0.5), 04_05_combmap_img b8 6.75 (−2.25), 04_05_combmap_img b10 8.75 (−0.25), 04_05_map7_img b6 8.5 (−0.5), 04_05_map8_img b1 8.5 (−0.5)
- **V1** (14, Σ 11.0 pt): 03_01_alsulfatemass_img b2 8.5 (−0.5), 03_01_aspirin b2 8.5 (−0.5), 03_01_chloroform b2 8.5 (−0.5), 03_03_empform b8 7.25 (−1.75), 04_01_rxn2 b9 8.75 (−0.25), 04_03_flowchart b5 8.5 (−0.5), 04_03_map2_img b6 8.5 (−0.5), 04_03_map3_img b6 8.5 (−0.5), 04_03_moleratio1_img b2 8.5 (−0.5), 04_03_moleratio2_img b3 8.5 (−0.5), 04_05_combmap_img b8 6.0 (−3.0), 04_05_combmap_img b10 8.0 (−1.0), 04_05_map7_img b6 8.5 (−0.5), 04_05_map8_img b1 8.5 (−0.5)
- **V2** (14, Σ 11.0 pt): 03_01_alsulfatemass_img b2 8.5 (−0.5), 03_01_aspirin b2 8.5 (−0.5), 03_01_chloroform b2 8.5 (−0.5), 03_03_empform b8 7.25 (−1.75), 04_01_rxn2 b9 8.75 (−0.25), 04_03_flowchart b5 8.5 (−0.5), 04_03_map2_img b6 8.5 (−0.5), 04_03_map3_img b6 8.5 (−0.5), 04_03_moleratio1_img b2 8.5 (−0.5), 04_03_moleratio2_img b3 8.5 (−0.5), 04_05_combmap_img b8 6.0 (−3.0), 04_05_combmap_img b10 8.0 (−1.0), 04_05_map7_img b6 8.5 (−0.5), 04_05_map8_img b1 8.5 (−0.5)
- **V3** (16, Σ 18.5 pt): 03_01_alsulfatemass_img b2 8.5 (−0.5), 03_01_aspirin b2 8.5 (−0.5), 03_01_chloroform b2 8.5 (−0.5), 03_01_exocytosis-88f6 b0 8.25 (−0.75), 03_01_exocytosis-88f6 b2 6.75 (−2.25), 03_03_empform b8 7.25 (−1.75), 04_03_flowchart b5 8.75 (−0.25), 04_03_flowchart b13 7.0 (−2.0), 04_03_flowchart b14 7.25 (−1.75), 04_03_moleratio2_img b3 8.25 (−0.75), 04_05_combmap_img b8 6.0 (−3.0), 04_05_combmap_img b10 8.0 (−1.0), 04_05_combmap_img b11 6.25 (−0.75), 04_05_combmap_img b12 6.0 (−1.0), 04_05_combmap_img b13 6.25 (−0.75), 04_05_combmap_img b14 6.0 (−1.0)
- **V3L** (14, Σ 11.0 pt): 03_01_alsulfatemass_img b2 8.5 (−0.5), 03_01_aspirin b2 8.5 (−0.5), 03_01_chloroform b2 8.5 (−0.5), 03_03_empform b8 7.25 (−1.75), 04_01_rxn2 b9 8.75 (−0.25), 04_03_flowchart b5 8.5 (−0.5), 04_03_map2_img b6 8.5 (−0.5), 04_03_map3_img b6 8.5 (−0.5), 04_03_moleratio1_img b2 8.5 (−0.5), 04_03_moleratio2_img b3 8.5 (−0.5), 04_05_combmap_img b8 6.0 (−3.0), 04_05_combmap_img b10 8.0 (−1.0), 04_05_map7_img b6 8.5 (−0.5), 04_05_map8_img b1 8.5 (−0.5)

### T7 — off-page blocks per variant (px)

- **V0** (4): 03_02_copperMoles_img-a962 b4 5, 03_03_empform b8 210, 04_03_etheneBr_img b2 24, 04_03_flowchart b6 215
- **V1** (2): 03_02_copperMoles_img-a962 b4 5, 04_03_etheneBr_img b2 24
- **V2** (2): 03_02_copperMoles_img-a962 b4 5, 04_03_etheneBr_img b2 31
- **V3** (1): 03_02_copperMoles_img-a962 b4 5
- **V3L** (6): 03_02_argon_img-9025 b2 280, 03_02_copperMoles_img-a962 b4 307, 03_02_glycine_img-7c96 b1 126, 03_02_potassium_img-f1d1 b1 276, 03_02_vitC_img-e537 b1 12, 03_05_Example2_img b1 405

### T8 — remaining PROBLEM blocks per variant

- **V1** (23): 03_01_exocytosis-88f6 b2, 03_01_exocytosis-88f6 b4, 03_02_argon_img-9025 b2, 03_02_copperMoles_img-a962 b1, 03_02_copperMoles_img-a962 b4, 03_02_glycine_img-7c96 b1, 03_02_potassium_img-f1d1 b1, 03_02_sacch_img-3278 b1, 03_02_vitC_img-e537 b1, 03_03_empform b8, 03_05_Example2_img b1, 03_05_Example2_img b3, 04_03_etheneBr_img b2, 04_03_ethene_img b0, 04_03_ethene_img b17, 04_03_flowchart b13, 04_03_flowchart b14, 04_03_moleratio2_img b3, 04_04_sandwich b2, 04_04_sandwich b5, 04_05_combmap_img b11, 04_05_combmap_img b13, 04_05_combmap_img b8
- **V2** (23): 03_01_exocytosis-88f6 b2, 03_01_exocytosis-88f6 b4, 03_02_argon_img-9025 b2, 03_02_copperMoles_img-a962 b1, 03_02_copperMoles_img-a962 b4, 03_02_glycine_img-7c96 b1, 03_02_potassium_img-f1d1 b1, 03_02_sacch_img-3278 b1, 03_02_vitC_img-e537 b1, 03_03_empform b8, 03_05_Example2_img b1, 03_05_Example2_img b3, 04_03_etheneBr_img b2, 04_03_ethene_img b0, 04_03_ethene_img b17, 04_03_flowchart b13, 04_03_flowchart b14, 04_03_moleratio2_img b3, 04_04_sandwich b2, 04_04_sandwich b5, 04_05_combmap_img b11, 04_05_combmap_img b13, 04_05_combmap_img b8
- **V3** (15): 03_01_exocytosis-88f6 b4, 03_02_argon_img-9025 b2, 03_02_copperMoles_img-a962 b1, 03_02_copperMoles_img-a962 b4, 03_02_glycine_img-7c96 b1, 03_02_potassium_img-f1d1 b1, 03_02_sacch_img-3278 b1, 03_02_vitC_img-e537 b1, 03_03_empform b8, 03_05_Example2_img b1, 03_05_Example2_img b3, 04_03_ethene_img b0, 04_03_moleratio2_img b3, 04_04_sandwich b2, 04_05_combmap_img b8
- **V3L** (17): 03_01_exocytosis-88f6 b2, 03_01_exocytosis-88f6 b4, 03_02_argon_img-9025 b2, 03_02_copperMoles_img-a962 b4, 03_02_glycine_img-7c96 b1, 03_02_potassium_img-f1d1 b1, 03_02_vitC_img-e537 b1, 03_03_empform b8, 03_05_Example2_img b1, 04_03_etheneBr_img b2, 04_03_ethene_img b0, 04_03_flowchart b13, 04_03_flowchart b14, 04_03_moleratio2_img b3, 04_04_sandwich b2, 04_04_sandwich b5, 04_05_combmap_img b8

- floor binds (budget below the source's own flattened line → budget = that line): {'V3': ['04_03_moleratio2_img b3', '04_05_map7_img b5']}
- invariants: {'V1_OPEN_identical_to_V0': [], 'V3_BOUNDED_identical_to_V2': [], 'V3L_BOUNDED_identical_to_V2': []}
- score (problem, unresolved, shrunk, Σshrink): {'V0': [50, 49, 15, 10.75], 'V1': [23, 21, 14, 11.0], 'V2': [23, 21, 14, 11.0], 'V3': [15, 17, 16, 18.5], 'V3L': [17, 16, 14, 11.0]}  best: V3
