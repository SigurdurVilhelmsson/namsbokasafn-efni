# Tagging Decisions Guide

Examples of when and how to choose the right tags.

## Note vs Key Concept vs Definition

These three are often confused. Here's how to distinguish:

### :::definition — First introduction of a term

Use when formally introducing a technical term for the first time.

```markdown
<!-- ✓ CORRECT: First time "mól" is defined -->
:::definition{term="Mól"}
Mól er SI-eining fyrir efnismagn. Eitt mól inniheldur $6.022 \times 10^{23}$ eindir.
:::

<!-- ✗ WRONG: Mentioning a term that was defined earlier -->
:::definition{term="Mól"}
Við notum mól til að telja atóm.
:::
<!-- This should be regular text or possibly a :::note -->
```

### :::key-concept — Fundamental principle to remember

Use for important ideas, laws, or principles (not vocabulary).

```markdown
<!-- ✓ CORRECT: A fundamental principle -->
:::key-concept
Í lokuðu kerfi er heildarmassi hvarfefna alltaf jafn heildarmassa myndefna.
:::

<!-- ✗ WRONG: This is a definition, not a concept -->
:::key-concept
Hvarfefni eru efnin vinstra megin við örina í efnajöfnu.
:::
<!-- Use :::definition{term="Hvarfefni"} instead -->
```

### :::note — Supplementary information

Use for clarifications, historical context, additional details, or "by the way" information.

```markdown
<!-- ✓ CORRECT: Additional context -->
:::note
Avogadro-talan er nefnd eftir ítalska vísindamanninum Amedeo Avogadro
sem lagði fram kenninguna árið 1811.
:::

<!-- ✗ WRONG: This is core content, not supplementary -->
:::note
Mólmassi er massi eins móls af efni.
:::
<!-- This should be a :::definition or :::key-concept -->
```

## Example vs Practice Problem

### :::example — You show the solution

The teacher demonstrates; students observe and learn the method.

```markdown
<!-- ✓ CORRECT: Worked example showing method -->
:::example
**Reiknið mólmassa $\ce{NaCl}$**

$M = 22.99 + 35.45 = 58.44 \text{ g/mol}$
:::
```

### :::practice-problem — Students solve it

Students attempt the problem; hints and answers are hidden until revealed.

```markdown
<!-- ✓ CORRECT: Student practice -->
:::practice-problem
Reiknið mólmassa $\ce{CaCO3}$.

:::hint
Ca = 40.08, C = 12.01, O = 16.00
:::

:::answer
100.09 g/mol
:::
:::
```

### When to use which?

| Situation | Use |
|-----------|-----|
| Introducing a new calculation method | `:::example` |
| First problem after explaining a concept | `:::example` |
| Problems students should try themselves | `:::practice-problem` |
| Homework-style problems | `:::practice-problem` |
| Complex multi-step solutions worth studying | `:::example` |

## Structuring Practice Problems

### Progressive hints

Hints should guide without giving away the answer:

```markdown
:::practice-problem
$\ce{25.0 g}$ af $\ce{NaOH}$ er leyst upp í vatni. Hversu mörg mól eru það?

:::hint
Byrjið á að reikna mólmassa $\ce{NaOH}$.
:::

:::hint
Mólmassi $\ce{NaOH}$ = 22.99 + 16.00 + 1.008 = 40.00 g/mol
:::

:::hint
Notið jöfnuna: $n = \frac{m}{M}$
:::

:::answer
0.625 mól
:::

:::explanation
$n = \frac{25.0 \text{ g}}{40.00 \text{ g/mol}} = 0.625 \text{ mól}$
:::
:::
```

### When to include explanations

Always include `:::explanation` when:
- The answer alone doesn't show the method
- There are common mistakes to address
- The solution has multiple steps

```markdown
<!-- ✓ GOOD: Explanation shows the work -->
:::answer
0.625 mól
:::

:::explanation
$n = \frac{25.0 \text{ g}}{40.00 \text{ g/mol}} = 0.625 \text{ mól}$
:::

<!-- ✗ BAD: Simple answer without showing work -->
:::answer
0.625 mól
:::
<!-- Students who got it wrong won't learn why -->
```

## Warning vs Common Misconception

### :::warning — Cautions and mistakes to avoid

Use for safety, common errors, and "don't do this" situations.

```markdown
<!-- ✓ Safety warning -->
:::warning
Aldrei bætið vatni í sýru — bætið alltaf sýrunni í vatnið!
:::

<!-- ✓ Common mistake warning -->
:::warning
Gleymiði ekki að jafna efnajöfnuna áður en þið reiknið.
:::
```

### :::common-misconception — Wrong beliefs to correct

Use to explicitly address and correct incorrect mental models.

```markdown
<!-- ✓ Correcting a mental model -->
:::common-misconception
**Rangt**: Rafeindir snúast um kjarnann í föstum brautum.

**Rétt**: Rafeindir eru í raflausum líkindaskýjum (rafeindaskeljar).
:::
```

### The difference

- **Warning**: "Don't do X" or "Be careful about Y"
- **Misconception**: "You might think X, but actually Y"

## When NOT to Tag

### Over-tagging examples

```markdown
<!-- ✗ TOO MANY TAGS -->
:::note
Vatn er $\ce{H2O}$.
:::

:::key-concept
Vatn er lífsnauðsynlegt.
:::

:::note
Vatn er á þremur fösum.
:::

<!-- ✓ BETTER: Regular prose with selective tagging -->
Vatn ($\ce{H2O}$) er lífsnauðsynlegt efni sem getur verið á þremur fösum.

:::key-concept
Vatn hefur óvenjulega hátt suðumark vegna vetnistengja milli sameinda.
:::
```

### Don't tag routine content

```markdown
<!-- ✗ UNNECESSARY TAGS -->
:::note
Í næsta kafla munum við skoða...
:::

:::note
Eins og fram kom hér að ofan...
:::

<!-- These are just normal transitional sentences -->
```

### One tag per concept

```markdown
<!-- ✗ REDUNDANT -->
:::definition{term="Sýra"}
Sýra er efni sem gefur frá sér $\ce{H+}$.
:::

:::key-concept
Sýrur gefa frá sér vetnisatóm.
:::

<!-- ✓ PICK ONE -->
:::definition{term="Sýra"}
Sýra er efni sem gefur frá sér $\ce{H+}$ jónir í lausn.
:::
```

## Cross-Reference Decisions

### When to add anchors

Add `{#type:id}` to:
- Important equations you'll reference later
- Figures that illustrate key concepts
- Definitions you'll reference in later chapters

```markdown
<!-- Worth anchoring: will be referenced -->
$$PV = nRT$$ {#eq:ideal-gas}

<!-- Not worth anchoring: one-time use -->
$$n = \frac{m}{M}$$
```

### When to add references

Add `[ref:type:id]` when:
- Connecting related concepts across sections
- Pointing back to relevant equations
- Helping students review prerequisites

```markdown
<!-- ✓ HELPFUL: Connects concepts -->
Við notum jöfnu [ref:eq:ideal-gas] til að reikna þrýsting.

<!-- ✗ UNNECESSARY: Obvious from context -->
Sjá skilgreininguna hér að ofan [ref:def:pressure].
```
