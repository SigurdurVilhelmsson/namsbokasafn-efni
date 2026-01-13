---
name: chemistry-reader-tags
description: Apply custom markdown tags when working on chemistry educational content, markdown files in public/content/, or when asked to tag, format, or structure chemistry textbook material
---

# Chemistry Reader Markdown Tags

This skill provides guidance for applying custom markdown directives to Icelandic chemistry educational content in the Námsbókasafn reader application.

## When to Invoke This Skill

- Editing or creating markdown files in `public/content/`
- Translating chemistry textbook content
- Asked to "tag", "format", or "structure" educational chemistry content
- Reviewing content for proper markup
- Working on any `.md` file containing chemical formulas or educational material

## Core Principles

### 1. Don't Over-Tag

Not every paragraph needs a tag. Use tags to:
- Highlight genuinely important definitions, concepts, or warnings
- Create interactive learning opportunities (practice problems)
- Aid navigation through cross-references

**Avoid**: Tagging routine explanatory text that flows naturally in the narrative.

### 2. Use the Correct Tag for Context

| Content Type | Tag | When to Use |
|--------------|-----|-------------|
| Term being defined | `:::definition{term="..."}` | First introduction of a technical term |
| Important info | `:::note` | Supplementary but important information |
| Safety/caution | `:::warning` | Common mistakes, safety info, critical cautions |
| Worked solution | `:::example` | Step-by-step demonstration |
| Student practice | `:::practice-problem` | Problems for students to solve |
| Core concept | `:::key-concept` | Fundamental ideas to remember |
| Self-check | `:::checkpoint` | Quick comprehension checks |
| Wrong idea | `:::common-misconception` | Addressing common wrong beliefs |

### 3. Icelandic Titles

All visible titles use Icelandic:
- "Skilgreining" (Definition)
- "Athugið" (Note)
- "Viðvörun" (Warning)
- "Dæmi" (Example)
- "Lykilhugtak" (Key Concept)
- "Sjálfsmat" (Self-assessment/Checkpoint)
- "Algengur misskilningur" (Common Misconception)

### 4. Chemistry Notation

**Always use mhchem** for chemical formulas and equations:

```markdown
<!-- Correct -->
$\ce{H2O}$, $\ce{H2SO4}$, $\ce{2H2 + O2 -> 2H2O}$

<!-- Incorrect -->
H₂O, $\text{H}_2\text{O}$, H<sub>2</sub>O
```

## Quick Reference

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

## Supporting Files

Read these files for detailed information:

- **implemented-tags.md** — Complete syntax reference for all tags
- **frontmatter-schema.md** — YAML frontmatter requirements
- **mhchem-reference.md** — Chemistry notation quick reference
- **examples/tagging-decisions.md** — When to use which tag (with examples)

## Workflow

1. **Read the content** — Understand the pedagogical flow
2. **Identify opportunities** — Look for definitions, key concepts, practice problems
3. **Apply tags sparingly** — Quality over quantity
4. **Verify chemistry notation** — Ensure all formulas use mhchem
5. **Check cross-references** — Add `{#eq:name}` anchors and `[ref:type:id]` links where helpful
