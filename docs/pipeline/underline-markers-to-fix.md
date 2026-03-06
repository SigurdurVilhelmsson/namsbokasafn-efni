# Underline Markers Missing from MT Output

**Date:** 2026-03-06
**Context:** The extraction pipeline now produces `++text++` markers for `<emphasis effect="underline">`, but existing MT output segments were translated before this feature existed. The underlined text was extracted as plain text, so MT never saw the markers.

**Action needed:** Manually add `++` markers around the correct Icelandic words in the segment editor. These are mostly chemical symbols and short phrases used in exercises.

---

## Summary

| Module | Chapter | Count | Context |
|--------|---------|-------|---------|
| m68664 | ch01 | 8 | Classification exercises — elements, compounds |
| m68670 | ch01 | 6 | Fluorine properties (one segment) |
| m68710 | ch04 | 2 | Stoichiometry — oxidation numbers |
| m68734 | ch06 | 2 | Electron configuration — valence electrons |
| m68742 | ch07 | 12 | VSEPR geometry — central atoms |
| m68745 | ch08 | 2 | Hybridization — carbon atoms |
| m68849 | ch20 | 4 | Organic chemistry — carbon atoms |
| **Total** | | **36** | |

---

## Details by Module

### m68664 (ch01) — 8 underlines

Classification exercises: the underlined text indicates which word to classify.

| EN underlined text | Segment context |
|--------------------|-----------------|
| `lead pipe` | (a) The mass of a ++lead pipe++ is 14 lb. |
| `chlorine atom` | (b) The mass of a certain ++chlorine atom++ is 35 amu. |
| `Al` | (c) A bottle with a label that reads ++Al++ contains aluminum metal. |
| `Al` | (d) ++Al++ is the symbol for an aluminum atom. |
| `H` | (a) A certain molecule contains one ++H++ atom and one Cl atom. |
| `Copper wire` | (b) ++Copper wire++ has a density of about 8 g/cm³. |
| `Ni powder` | (c) The bottle contains 15 grams of ++Ni powder++. |
| `sulfur molecule` | (d) A ++sulfur molecule++ is composed of eight sulfur atoms. |

### m68670 (ch01) — 6 underlines

All in one segment about fluorine. Underlines mark key properties.

| EN underlined text |
|--------------------|
| `gas` |
| `reacts with most substances` |
| `melts at −220 °C` |
| `boils at −188 °C` |
| `metals burn in fluorine` |
| `Nineteen grams of fluorine will react with 1.0 gram of hydrogen` |

### m68710 (ch04) — 2 underlines

Oxidation number exercises: underline marks the atom whose oxidation state to determine.

| EN underlined text | Segment context |
|--------------------|-----------------|
| `N` | (a) K++N++O₃ |
| `Al` | (b) ++Al++H₃ |

### m68734 (ch06) — 2 underlines

Electron configuration example showing valence electrons are underlined.

| EN underlined text | Segment context |
|--------------------|-----------------|
| `4s` | [Ar]++4s++²3d¹⁰++4p++¹ |
| `4p` | (same segment as above) |

### m68742 (ch07) — 12 underlines

VSEPR geometry exercises: underline marks the central atom in each molecular fragment.

| EN underlined text | Notes |
|--------------------|-------|
| `C` (×8) | Central carbon in CH, CH₃, CO₂, CH₂ fragments |
| `O` (×4) | Central oxygen in OH fragments |

### m68745 (ch08) — 2 underlines

Hybridization exercises: underline marks the carbon atom whose hybridization to identify.

| EN underlined text | Segment context |
|--------------------|-----------------|
| `C` (×2) | H₃++C++, sp³; ++C++(O)OH, sp² |

### m68849 (ch20) — 4 underlines

Organic chemistry: underline marks carbon atoms in reaction equations.

| EN underlined text | Notes |
|--------------------|-------|
| `C` (×4) | Carbon atoms in organic reaction notation |
