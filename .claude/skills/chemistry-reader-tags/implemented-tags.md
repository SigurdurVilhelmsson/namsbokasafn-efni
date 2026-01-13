# Implemented Tags Reference

Complete syntax reference for all custom markdown directives in the Chemistry Reader.

## Callout Blocks

### Note (:::note)

**Purpose**: Important supplementary information
**Color**: Blue
**Title**: "Athugið"

```markdown
:::note
Þetta er mikilvæg viðbótarupplýsing sem nemandinn ætti að hafa í huga.
:::

:::note{title="Sérstök athugasemd"}
Hægt er að breyta titlinum með title eigindinni.
:::
```

### Warning (:::warning)

**Purpose**: Cautions, safety information, common mistakes to avoid
**Color**: Amber/Yellow
**Title**: "Viðvörun"

```markdown
:::warning
Aldrei blandið saman klóríni og ammoníaki — það myndar eitrað gas!
:::

:::warning{title="Öryggisatriði"}
Notið alltaf öryggisgleraugu þegar þið vinnið með sýrum.
:::
```

### Example (:::example)

**Purpose**: Worked examples showing step-by-step solutions
**Color**: Gray
**Title**: "Dæmi"

```markdown
:::example
**Reiknið mólmassa $\ce{H2SO4}$**

$M = 2(1.008) + 32.07 + 4(16.00) = 98.09 \text{ g/mol}$
:::

:::example{title="Dæmi 3.2 — Mólmassi"}
Ef þú vilt sérsniðinn titil.
:::
```

## Interactive Blocks

### Practice Problem (:::practice-problem)

**Purpose**: Problems for students to solve with progressive hints
**Color**: Indigo
**Title**: "Æfingadæmi"

**Structure**: Contains nested `:::answer`, `:::hint`, and `:::explanation` blocks.

```markdown
:::practice-problem
Hver er mólmassi glúkósa ($\ce{C6H12O6}$)?

:::hint
Mólmassi kolefnis er 12.01 g/mol, vetnis er 1.008 g/mol og súrefnis er 16.00 g/mol.
:::

:::hint
Margfaldið atómmassa hvers frumefnis með fjölda atóma í sameind.
:::

:::answer
180.16 g/mol
:::

:::explanation
$M = 6(12.01) + 12(1.008) + 6(16.00) = 72.06 + 12.10 + 96.00 = 180.16 \text{ g/mol}$
:::
:::
```

**Note**: Multiple `:::hint` blocks appear as progressive hints (Hint 1, Hint 2, etc.).

## Educational Directives

### Definition (:::definition)

**Purpose**: Formal definition of a technical term
**Color**: Purple
**Title**: "Skilgreining"
**Required attribute**: `term="..."`

```markdown
:::definition{term="Mól"}
Mól er SI-eining fyrir efnismagn. Eitt mól inniheldur nákvæmlega
$6.022 \times 10^{23}$ eindir (Avogadro-talan).
:::
```

**Important**: The `term` attribute is required and used for indexing.

### Key Concept (:::key-concept)

**Purpose**: Fundamental ideas that students must understand
**Color**: Cyan
**Title**: "Lykilhugtak"

```markdown
:::key-concept
Massavarðveislulögmálið segir að massi hvarfefna sé alltaf jafn
massa myndefna í lokuðu kerfi.
:::

:::key-concept{title="Hlutþrýstingslögmál Daltons"}
Heildarþrýstingur gasblandna er summa hlutþrýstings hvers gass.
:::
```

### Checkpoint (:::checkpoint)

**Purpose**: Quick comprehension checks during reading
**Color**: Green
**Title**: "Sjálfsmat"

```markdown
:::checkpoint
Getið þið útskýrt muninn á atómnúmeri og massatölu?
:::
```

### Common Misconception (:::common-misconception)

**Purpose**: Address and correct common wrong beliefs
**Color**: Rose/Pink
**Title**: "Algengur misskilningur"

```markdown
:::common-misconception
**Rangt**: Rafeindir snúast um kjarnann eins og plánetur um sólina.

**Rétt**: Rafeindir eru í raflausum skýjum þar sem líkur eru á
að finna þær, ekki í ákveðnum brautum.
:::
```

## Cross-References

### Reference Syntax

**Format**: `[ref:type:id]`

**Types**:
- `sec` — Section reference
- `eq` — Equation reference
- `fig` — Figure reference
- `tbl` — Table reference
- `def` — Definition reference

```markdown
Sjá jöfnu [ref:eq:ideal-gas] og mynd [ref:fig:phase-diagram].

Eins og fjallað var um í kafla [ref:sec:atomic-structure].

Rifjið upp skilgreininguna á mólmassa [ref:def:mol-mass].
```

### Anchor Syntax

**Format**: `{#type:id}` placed after the element

```markdown
$$PV = nRT$$ {#eq:ideal-gas}

![Fasarit vatns](phase-diagram.png) {#fig:phase-diagram}

:::definition{term="Mólmassi"}
... skilgreining ...
::: {#def:mol-mass}
```

## Complete Example

```markdown
---
title: Mólhugtakið
section: "3.2"
chapter: 3
objectives:
  - Útskýra hvað mól þýðir
  - Reikna mólmassa efnasambanda
keywords:
  - mól
  - mólmassi
  - Avogadro-tala
---

# Mólhugtakið

Í þessum kafla kynnumst við mólinu, grundvallareiningunni í efnafræði.

:::definition{term="Mól"}
Mól er SI-eining fyrir efnismagn. Eitt mól inniheldur nákvæmlega
$6.022 \times 10^{23}$ eindir (Avogadro-talan).
::: {#def:mol}

:::note
Avogadro-talan er nefnd eftir ítalska vísindamanninum Amedeo Avogadro.
:::

:::key-concept
Mólmassi efnis (M) er massi eins móls af því efni, mældur í g/mol.
:::

## Útreikningur mólmassa

Mólmassi efnasambands er reiknaður með því að leggja saman
atómmassa allra atóma í sameindinni.

:::example
**Mólmassi $\ce{H2O}$**

$$M_{\ce{H2O}} = 2(1.008) + 16.00 = 18.02 \text{ g/mol}$$ {#eq:water-molar-mass}
:::

:::practice-problem
Reiknið mólmassa brennisteinssýru ($\ce{H2SO4}$).

:::hint
Finnið atómmassa H, S og O í lotukerfinu.
:::

:::answer
98.09 g/mol
:::

:::explanation
$M = 2(1.008) + 32.07 + 4(16.00) = 2.016 + 32.07 + 64.00 = 98.09 \text{ g/mol}$

Sjá jöfnu [ref:eq:water-molar-mass] fyrir sambærilegan útreikning.
:::
:::

:::checkpoint
Af hverju er mikilvægt að nota mól frekar en massa þegar við
vinnum með efnahvörf?
:::
```
