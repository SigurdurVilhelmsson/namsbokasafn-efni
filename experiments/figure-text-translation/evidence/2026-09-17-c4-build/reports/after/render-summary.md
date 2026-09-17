# §C140 ④ render-summary — BEFORE vs AFTER, 533 figures

- Population: 533 distinct basenames (expected 533).
- **Changed (count_gt0 > 0): 34** (expected 34).
- **Changed above 40/channel (count_gt40 > 0): 15** (expected 15).

## Changed set, by name

- CNX_Chem_01_03_HazDiamond (>40)
- CNX_Chem_01_03_PeriodicPU (>40)
- CNX_Chem_01_05_SigDigits1_img
- CNX_Chem_01_05_SigDigits2_img
- CNX_Chem_01_05_SigDigits3_img
- CNX_Chem_01_05_SigDigits4_img (>40)
- CNX_Chem_01_05_SigDigits5_img
- CNX_Chem_04_05_combustion (>40)
- CNX_Chem_05_01_HeatTrans1
- CNX_Chem_05_01_OxyacTorch (>40)
- CNX_Chem_05_02_HeatMeas (>40)
- CNX_Chem_05_02_IcePack (>40)
- CNX_Chem_05_03_Systemqw (>40)
- CNX_Chem_07_03_Exercise3a_img
- CNX_Chem_07_03_Exercise3b_img
- CNX_Chem_07_03_Exercise3c_img
- CNX_Chem_07_03_Exercise3d_img
- CNX_Chem_07_03_Exercise3e_img
- CNX_Chem_07_03_Exercise3f_img
- CNX_Chem_07_06_Egeom (>40)
- CNX_Chem_07_06_NH3
- CNX_Chem_08_02_SF6
- CNX_Chem_08_02_sp3Geom (>40)
- CNX_Chem_08_02_sp3d
- CNX_Chem_09_01_Atmosphere
- CNX_Chem_11_01_Icepack (>40)
- CNX_Chem_11_04_phasediag
- CNX_Chem_15_02_BF3-LA_img
- CNX_Chem_16_02_Gas
- CNX_Chem_19_01_PeriodicEConfig (>40)
- CNX_Chem_21_04_ChnReact1 (>40)
- CNX_Chem_21_04_CritMass
- CNX_Chem_21_06_Damage1 (>40)
- CNX_Chem_21_06_Damage2 (>40)

## Comparison by name with the exploration's 34 (evidence/2026-09-16-c4-explore/render/results.jsonl.gz, PERSIST rows with count_gt0 > 0)

- Only in THIS run, not in the exploration's 34: []
- Only in the exploration's 34, not in THIS run: []
- **Sets equal by name: True**

## Bought figures changed (of 34 bought)

- ['CNX_Chem_04_05_combustion'] (expected: only ['CNX_Chem_04_05_combustion'])

## Direction toward source (changed figures only)

- n with a direction measurement: 34 of 34
- mean_dist_AFTER_to_SOURCE, averaged over those: 0.0 (expected 0.0)
- every changed figure at distance 0.0 from source: True

## Controls

- SERIALISER (combustion, BEFORE stripped twice): {'size_match': True, 'shape': [321, 1300, 3], 'count_gt40': 0, 'count_gt0': 0, 'bbox_gt40': None, 'bbox_gt0': None}
- PLANTED (20x20 rect on a copy of combustion's BEFORE render): {'size_match': True, 'shape': [321, 1300, 3], 'count_gt40': 441, 'count_gt0': 441, 'bbox_gt40': [80, 100, 325, 345], 'bbox_gt0': [80, 100, 325, 345]}

## Refused

- **refused count: 0** (expected 0)

