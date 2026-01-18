---
name: chemistry-reader-tags
description: Apply custom markdown tags when working on chemistry educational content, markdown files in 05-publication/, or when asked to tag, format, or structure chemistry textbook material.
---

# Chemistry Reader Markdown Tags

Custom markdown directives for Icelandic chemistry educational content.

## When to Use

- Editing markdown in `books/{book}/05-publication/`
- Asked to "tag", "format", or "structure" educational chemistry content
- Working on `.md` files containing chemical formulas or educational material

## Core Principles

1. **Don't over-tag** - Not every paragraph needs a tag
2. **Use correct tag for context** - See tag reference below
3. **Icelandic titles** - All visible titles in Icelandic
4. **mhchem for chemistry** - Always use `$\ce{...}$` for formulas

---

## Tag Reference

| Content Type | Tag | Icelandic Title |
|--------------|-----|-----------------|
| Term being defined | `:::definition{term="..."}` | Skilgreining |
| Important info | `:::note` | Athugið |
| Safety/caution | `:::warning` | Viðvörun |
| Worked solution | `:::example` | Dæmi |
| Student practice | `:::practice-problem` | Æfingadæmi |
| Core concept | `:::key-concept` | Lykilhugtak |
| Self-check | `:::checkpoint` | Sjálfsmat |
| Wrong belief | `:::common-misconception` | Algengur misskilningur |

### Tag Syntax

```markdown
:::definition{term="Sýra"}
Efni sem gefur frá sér $\ce{H+}$ jónir í lausn.
:::

:::note
Athugið að þetta gildir aðeins við staðalaðstæður.
:::

:::warning
Aldrei bætið vatni í sterka sýru — bætið alltaf sýrunni í vatnið!
:::

:::practice-problem
Jafnið eftirfarandi efnajöfnu: $\ce{Fe + O2 -> Fe2O3}$

:::hint
Byrjið á að telja súrefnisatómin.
:::

:::answer
$\ce{4Fe + 3O2 -> 2Fe2O3}$
:::

:::explanation
Við þurfum 6 súrefnisatóm (3 O₂) og 4 járnatóm til að fá 2 einingar af járnoxíði.
:::
:::
```

---

## mhchem Quick Reference

Use `$\ce{...}$` for ALL chemical notation.

### Basic Formulas
```
$\ce{H2O}$          → H₂O
$\ce{H2SO4}$        → H₂SO₄
$\ce{Ca(OH)2}$      → Ca(OH)₂
```

### Ions
```
$\ce{Fe^3+}$        → Fe³⁺
$\ce{SO4^2-}$       → SO₄²⁻
$\ce{OH-}$          → OH⁻
```

### State Symbols
```
$\ce{H2O(l)}$       → liquid
$\ce{NaCl(s)}$      → solid
$\ce{CO2(g)}$       → gas
$\ce{NaCl(aq)}$     → aqueous
```

### Reaction Arrows
```
$\ce{A -> B}$       → forward
$\ce{A <=> B}$      → equilibrium
$\ce{A ->[heat] B}$ → with condition
```

### Isotopes
```
$\ce{^{14}C}$       → ¹⁴C
$\ce{^{238}_{92}U}$ → ²³⁸₉₂U
```

### Common Mistakes

| Wrong | Right |
|-------|-------|
| `H₂O` | `$\ce{H2O}$` |
| `$H_2O$` | `$\ce{H2O}$` |
| `Na+` | `$\ce{Na+}$` |

---

## Frontmatter Schema

### Required Fields

```yaml
---
title: "Section title in Icelandic"
section: "1.3"
chapter: 1
---
```

### Optional Fields

```yaml
objectives:
  - Útskýra hvað mól þýðir
  - Reikna mólmassa efnasambanda
keywords:
  - mól
  - mólmassi
difficulty: intermediate  # beginner, intermediate, advanced
estimatedTime: "15 mín"
```

---

## Cross-References

### Anchors

Add `{#type:id}` after elements:
```markdown
$$PV = nRT$$ {#eq:ideal-gas}

:::definition{term="Mólmassi"}
...
::: {#def:mol-mass}
```

### References

Use `[ref:type:id]` to link:
```markdown
Sjá jöfnu [ref:eq:ideal-gas].
Rifjið upp skilgreininguna [ref:def:mol-mass].
```

Types: `sec` (section), `eq` (equation), `fig` (figure), `tbl` (table), `def` (definition)

---

## Tagging Decisions

### Definition vs Key Concept vs Note

- **:::definition** - First introduction of a technical term
- **:::key-concept** - Fundamental principle to remember (not vocabulary)
- **:::note** - Supplementary info, historical context, "by the way"

### Example vs Practice Problem

- **:::example** - You show the solution (teacher demonstrates)
- **:::practice-problem** - Students solve it (with hidden hints/answer)

### Warning vs Common Misconception

- **:::warning** - "Don't do X" or "Be careful about Y"
- **:::common-misconception** - "You might think X, but actually Y"

### When NOT to Tag

- Don't tag routine transitional sentences
- Don't tag the same concept twice
- Don't tag content that flows naturally in narrative
- Quality over quantity

---

## Complete Example

```markdown
---
title: Mólhugtakið
section: "3.2"
chapter: 3
objectives:
  - Útskýra hvað mól þýðir
  - Reikna mólmassa efnasambanda
---

# Mólhugtakið

:::definition{term="Mól"}
Mól er SI-eining fyrir efnismagn. Eitt mól inniheldur $6.022 \times 10^{23}$ eindir.
::: {#def:mol}

:::note
Avogadro-talan er nefnd eftir ítalska vísindamanninum Amedeo Avogadro.
:::

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
$M = 2(1.008) + 32.07 + 4(16.00) = 98.09 \text{ g/mol}$
:::
:::
```
