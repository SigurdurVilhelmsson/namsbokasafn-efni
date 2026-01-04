# Claude Code Setup Prompt for Námsbókasafn

> **Purpose:** This prompt instructs Claude Code to create a complete customization setup for the Námsbókasafn translation repository, including skills, subagents, slash commands, and supporting systems for file preservation, activity logging, and human review tracking.
>
> **Usage:** Open Claude Code in the repository root and paste this entire document, or reference it with: "Read claude-code-setup-prompt.md and execute the instructions."

---

## PHASE 1: UNDERSTAND THE REPOSITORY

Before creating any files, read and understand the existing documentation:

1. Read `docs/workflow.md` - the 8-step translation pipeline
2. Read `docs/editorial-guide.md` - Pass 1 and Pass 2 processes
3. Read `docs/terminology.md` - terminology standards
4. Read `docs/assets.md` - what assets we produce and preserve
5. Read `templates/` - existing templates for logs, checklists, frontmatter
6. Read `STATUS.md` and `books/efnafraedi/STATUS.md` - current project status
7. Read `schemas/chapter-status.schema.json` - status file schema

Summarize your understanding of the workflow before proceeding.

---

## PHASE 2: CREATE DIRECTORY STRUCTURE

Create the following directory structure:

```
.claude/
├── skills/
│   ├── editorial-pass1/
│   ├── localization/
│   ├── chemistry-reader-tags/
│   ├── workflow-status/
│   ├── repo-structure/
│   ├── activity-logging/
│   └── review-protocol/
├── agents/
├── commands/
└── settings.json

logs/
└── activity-log.md
```

Run: `mkdir -p .claude/skills/editorial-pass1 .claude/skills/localization .claude/skills/chemistry-reader-tags .claude/skills/workflow-status .claude/skills/repo-structure .claude/skills/activity-logging .claude/skills/review-protocol .claude/agents .claude/commands logs`

---

## PHASE 3: CREATE CORE SKILLS

### 3.1 Editorial Pass 1 Skill

Create `.claude/skills/editorial-pass1/SKILL.md`:

```markdown
---
name: editorial-pass1
description: Guide Pass 1 linguistic review of translations. Triggers when working on files in 03-faithful/, discussing grammar review, terminology checking, or linguistic quality. Does NOT handle localization.
---

# Editorial Pass 1 - Linguistic Review

You are assisting with Pass 1 editorial review: creating a **faithful translation** that accurately represents the source in natural Icelandic.

## Purpose

Produce human-verified faithful translations that:
- Use natural, grammatically correct Icelandic
- Maintain consistent terminology
- Preserve technical accuracy
- Can be cited academically

## What to Review

✅ **DO check:**
- Grammar and spelling errors
- Unnatural phrasing or word order
- Terminology consistency (check glossary)
- Technical accuracy preservation
- Readability and flow

❌ **DO NOT change:**
- Units (keep miles, Fahrenheit, etc.)
- Cultural references (keep American examples)
- Content structure
- Anything that would be localization

## Comment Tags

When flagging issues, use these tags:
- `[QUESTION]` - Need clarification on meaning
- `[URGENT]` - Critical issue requiring immediate attention
- `[DISCUSS]` - Needs team discussion
- `[TERM]` - Terminology question

## References

- Read `grammar-guidelines.md` for Icelandic grammar points
- Read `terminology-reference.md` for term checking process
- Check `glossary/terminology-en-is.csv` for approved terms

## Output Location

Pass 1 outputs go to: `books/{book}/03-faithful/docx/ch{NN}/`
Filename format: `{section-id}-pass1-{initials}.docx`
```

Create `.claude/skills/editorial-pass1/grammar-guidelines.md`:

```markdown
# Icelandic Grammar Guidelines for Translation Review

## Common MT Errors to Watch For

### Declension Errors
- Incorrect noun cases (nefnifall, þolfall, þágufall, eignarfall)
- Wrong adjective agreement with nouns
- Pronoun case errors

### Word Order Issues
- English word order preserved incorrectly
- Verb placement errors (V2 rule in main clauses)
- Adjective placement (generally before noun in Icelandic)

### Verb Errors
- Incorrect verb conjugation
- Wrong tense usage
- Subject-verb agreement errors

## Punctuation Conventions

- Quotation marks: „text" (not "text")
- Decimal separator: comma (3,14 not 3.14)
- Thousands separator: period or space (1.000 or 1 000)
- Lists: use Icelandic conventions

## Style for Secondary School Audience

- Clear, accessible language
- Explain technical terms on first use
- Avoid unnecessarily complex sentence structures
- Maintain appropriate register (formal but not stiff)

## Scientific Writing

- Precise technical terminology
- Consistent term usage throughout
- Preserve pedagogical intent
- Don't oversimplify at expense of accuracy
```

Create `.claude/skills/editorial-pass1/terminology-reference.md`:

```markdown
# Terminology Reference for Pass 1 Review

## Checking Process

1. **First:** Check project glossary at `glossary/terminology-en-is.csv`
2. **Second:** Check `docs/terminology.md` for guidelines
3. **Third:** Search [Íðorðabankinn](https://idord.arnastofnun.is/)
4. **Fourth:** Check [Orðabanki HÍ](https://ordabanki.hi.is/)
5. **If still unsure:** Flag with `[TERM]` comment for discussion

## Key Chemistry Terms

| English | Icelandic | Notes |
|---------|-----------|-------|
| atom | atóm | |
| molecule | sameind | |
| element | frumefni | |
| compound | efnasamband | |
| electron | rafeind | |
| proton | róteind | |
| neutron | nifteind | |
| ion | jón | |
| mole | mól | SI unit |
| reaction | efnahvarf | |
| solution | lausn | |
| periodic table | lotukerfi | |

## Terminology Principles

1. **Prefer established terms** - Use what's in Íðorðabankinn
2. **Follow Icelandic patterns** - -eind (particle), -efni (substance), -hvarf (transformation)
3. **Be consistent** - Same term throughout entire book
4. **Document decisions** - Add new terms to glossary with source

## Flagging Unknown Terms

When you encounter an unknown term:
1. Add comment: `[TERM] "English term" - suggested: "íslenskt hugtak" - source: {where you found it}`
2. If no source found: `[TERM] "English term" - needs decision`
```

---

### 3.2 Localization Skill

Create `.claude/skills/localization/SKILL.md`:

```markdown
---
name: localization
description: Guide Pass 2 localization of faithful translations. Triggers when working on files in 04-localized/, discussing unit conversions, cultural adaptations, or Icelandic context additions.
---

# Localization - Pass 2 Editorial

You are assisting with Pass 2 localization: adapting faithful translations for **Icelandic secondary school students**.

## Purpose

Create localized versions that:
- Use SI units throughout
- Include relevant Icelandic context
- Connect to local knowledge and experience
- Enhance learning for the target audience

## What to Change

✅ **DO:**
- Convert imperial units to SI (see `unit-conversions.md`)
- Adapt cultural references (see `cultural-adaptations.md`)
- Add Icelandic context where it enriches learning (see `icelandic-context.md`)
- Add extended exercises where beneficial

❌ **DO NOT:**
- Change core scientific content
- Remove examples without replacement
- Alter pedagogical structure
- Make changes without documenting them

## Critical Requirement

**DOCUMENT EVERY CHANGE** in the localization log.

Every adaptation must be recorded with:
- What was changed
- Why it was changed
- Original text
- New text

See `localization-log-format.md` for template.

## Output Locations

- Localized .docx: `books/{book}/04-localized/docx/ch{NN}/`
- Localization log: `books/{book}/04-localized/localization-logs/ch{NN}-log.md`

## References

Read the supporting files in this skill folder before making localization decisions.
```

Create `.claude/skills/localization/unit-conversions.md`:

```markdown
# Unit Conversion Reference

## Standard Conversions

| From | To | Formula/Factor |
|------|-----|----------------|
| miles | km | × 1.609 |
| feet | m | × 0.305 |
| inches | cm | × 2.54 |
| yards | m | × 0.914 |
| pounds (mass) | kg | × 0.454 |
| ounces | g | × 28.35 |
| gallons (US) | L | × 3.785 |
| quarts | L | × 0.946 |
| fluid ounces | mL | × 29.57 |
| °F | °C | (°F - 32) × 5/9 |
| psi | kPa | × 6.895 |
| atm | kPa | × 101.325 |

## Common Reference Values

| Description | Imperial | SI |
|-------------|----------|-----|
| Room temperature | 72°F | 22°C |
| Freezing point of water | 32°F | 0°C |
| Boiling point of water | 212°F | 100°C |
| Body temperature | 98.6°F | 37°C |
| Standard pressure | 14.7 psi / 1 atm | 101.325 kPa |

## Conversion Guidelines

1. **Round appropriately** - Don't add false precision
   - 5 miles → 8 km (not 8.045 km)
   - 72°F → 22°C (not 22.22°C)

2. **Recalculate, don't just convert numbers**
   - If an example uses 100°F, consider if 40°C works better
   - Adjust problem numbers to give clean answers in SI

3. **Verify calculations**
   - After converting, redo any calculations in the example
   - Ensure answers are correct with new units

4. **Document everything**
   - Record original and converted values in localization log
```

Create `.claude/skills/localization/cultural-adaptations.md`:

```markdown
# Cultural Adaptation Guidelines

## When to Adapt

**Adapt when:**
- Reference is confusing to Icelandic students
- Local equivalent clearly exists
- Adaptation enhances understanding

**Keep original when:**
- Reference is internationally known
- No good Icelandic equivalent
- Context is specifically American (discussing US industry, etc.)

## Common Adaptations

### Holidays and Events
| American | Icelandic Alternative |
|----------|----------------------|
| Thanksgiving | Jól (Christmas) or Þorrablót |
| Fourth of July | 17. júní (National Day) |
| Super Bowl | (keep or use generic "sports event") |
| Spring break | Páskafri |

### Geography
| American | Icelandic Alternative |
|----------|----------------------|
| Grand Canyon | Jökulsárgljúfur, Ásbyrgi |
| Yellowstone geysers | Geysir, Strokkur |
| Rocky Mountains | (keep, or use Alpar/Himmalaja for scale) |
| Mississippi River | (keep for scale, or Þjórsá for local) |

### Institutions
| American | Icelandic Alternative |
|----------|----------------------|
| FDA | Lyfjastofnun |
| EPA | Umhverfisstofnun |
| USDA | Matvælastofnun |
| Community college | Framhaldsskóli |

### Food and Products
| American | Icelandic Alternative |
|----------|----------------------|
| Gatorade | (keep or use "íþróttadrykkur") |
| Tylenol | Paracetamol |
| Baking soda (brand) | Matarsódi |

## Adaptation Principles

1. **Enhance, don't distort** - Adaptations should aid understanding
2. **Maintain scientific accuracy** - Never sacrifice correctness for localization
3. **Consider pedagogy** - Does the adaptation serve learning goals?
4. **Document rationale** - Record why you made each adaptation
```

Create `.claude/skills/localization/icelandic-context.md`:

```markdown
# Adding Icelandic Context

## Opportunities for Local Relevance

### Geothermal Energy
Iceland's unique geothermal context is ideal for:
- Thermodynamics examples
- Energy transformation
- Environmental chemistry
- Industrial processes

**Specific examples:**
- Hellisheiðarvirkjun (geothermal power plant)
- Nesjavellir
- Svartsengi (Blue Lagoon water chemistry)
- District heating systems

### Fishing Industry
Chemistry applications in Iceland's major industry:
- Food preservation and chemistry
- Omega-3 fatty acid extraction
- Fish processing chemistry
- Ocean chemistry and pH

### Volcanic and Geological Chemistry
- Sulfur chemistry (sulfur deposits)
- Mineral formation
- Volcanic gas composition
- Geothermal water chemistry
- Eyjafjallajökull ash composition (2010)

### Environmental Issues
- Ocean acidification (relevant to fishing)
- Carbon capture (Carbfix project)
- Sustainable energy
- Aluminum smelting environmental impact

### Historical Icelandic Science
- Mention Icelandic scientists where relevant
- Local research institutions (HÍ, Háskólinn á Akureyri)

## Guidelines for Adding Context

1. **Enhance, don't distract**
   - Add context that reinforces the learning objective
   - Don't add tangents that pull focus

2. **Be accurate**
   - Verify Icelandic facts and figures
   - Use current data where possible

3. **Keep it relevant**
   - Context should connect to the chemistry concept
   - Students should see the connection clearly

4. **Document additions**
   - All added content goes in localization log
   - Note rationale: "Added to connect to local industry"
```

Create `.claude/skills/localization/localization-log-format.md`:

```markdown
# Localization Log Format

Based on `templates/localization-log.md`. Every localized chapter needs a complete log.

## Required Sections

### Header
```markdown
# Localization Log - Chapter {N}: {Title}

| Field | Value |
|-------|-------|
| **Chapter** | {number} |
| **Title (EN)** | {original title} |
| **Title (IS)** | {Icelandic title} |
| **Localized by** | {name} |
| **Date** | {date} |
| **Pass 1 Editor** | {name} |
| **Pass 1 Date** | {date} |
```

### Summary
Brief overview:
- Total unit conversions: X
- Cultural adaptations: X
- Added content: X
- Terminology decisions: X

### Unit Conversions Table
| Section | Original | Localized | Notes |
|---------|----------|-----------|-------|
| {id} | {value + unit} | {converted} | {any notes} |

### Cultural Adaptations Table
| Section | Original Context | Icelandic Adaptation | Rationale |
|---------|------------------|---------------------|-----------|
| {id} | {original} | {adapted} | {why} |

### Added Content Table
| Section | Addition | Type | Description |
|---------|----------|------|-------------|
| {id} | {name} | {type} | {what was added} |

Types: Æfingadæmi, Dæmi, Samhengi, Athugasemd

### Calculations Verified
| Section | Original | Converted | Verified |
|---------|----------|-----------|----------|
| {id} | {calc} | {new calc} | ☑/☐ |

## Log Location

Save to: `books/{book}/04-localized/localization-logs/ch{NN}-log.md`
```

---

### 3.3 Chemistry Reader Tags Skill

Create `.claude/skills/chemistry-reader-tags/SKILL.md`:

```markdown
---
name: chemistry-reader-tags
description: Apply Chemistry Reader markdown tags to educational content. Triggers when working on files in 05-publication/, applying pedagogical markup, or preparing content for the web reader.
---

# Chemistry Reader Markdown Tagging

You are applying pedagogical markdown tags for the Chemistry Reader application, used by Icelandic secondary school students (ages 15-19).

## When to Apply Tags

Look for opportunities to tag:
- **Definitions**: Key terms students need to learn → `:::definition`
- **Practice problems**: Calculations or conceptual questions → `:::practice-problem`
- **Warnings**: Safety or common mistakes → `:::warning`
- **Key concepts**: Essential ideas → `:::key-concept`
- **Checkpoints**: Self-assessment moments → `:::checkpoint`
- **Misconceptions**: Common student errors → `:::common-misconception`
- **Notes**: Important information → `:::note`
- **Examples**: Worked examples → `:::example`

## Core Principles

1. **Don't over-tag** - Not every paragraph needs a callout
2. **Use the right tag** - See `implemented-tags.md` for distinctions
3. **Icelandic titles** - Tags render with Icelandic headers (Athugið, Viðvörun, etc.)
4. **mhchem for chemistry** - Always use `$\ce{H2O}$` not `$\text{H}_2\text{O}$`

## Quick Reference

| Content Type | Tag |
|-------------|-----|
| Term + definition | `:::definition{term="..."}` |
| Worked example | `:::example` |
| Student exercise | `:::practice-problem` + `:::answer` |
| Safety/caution | `:::warning` |
| Important note | `:::note` |
| Must-know concept | `:::key-concept` |
| Self-check | `:::checkpoint` |
| Wrong thinking | `:::common-misconception` |

## References

- `implemented-tags.md` - Complete syntax for each tag
- `frontmatter-schema.md` - Required YAML frontmatter
- `mhchem-reference.md` - Chemical notation syntax
- `tagging-decisions.md` - When to use which tag

## Output Location

Tagged files go to: `books/{book}/05-publication/chapters/`
```

Create `.claude/skills/chemistry-reader-tags/implemented-tags.md`:

```markdown
# Implemented Chemistry Reader Tags

## Callout Blocks

### Note Block (Blue)
```markdown
:::note
Important information students should pay attention to.
:::
```
Renders with: Info icon (ⓘ), "Athugið" title, blue theme

### Warning Block (Amber)
```markdown
:::warning
Caution about safety, common mistakes, or important considerations.
:::
```
Renders with: Warning icon (⚠️), "Viðvörun" title, amber theme

### Example Block (Gray)
```markdown
:::example
**Example 1.3.1: Title**

Worked example content...
:::
```
Renders with: Lightbulb icon (💡), "Dæmi" title, gray theme

---

## Interactive Blocks

### Practice Problem (with Answer)
```markdown
:::practice-problem
Problem statement here.

:::answer
**Solution:**
Step-by-step solution...

**Answer:** Final answer
:::
:::
```
Features:
- Amber header with "Æfingadæmi" title
- "Sýna svar" button reveals answer
- Green answer area with animation

### With Hints
```markdown
:::practice-problem
Problem statement.

:::hint
First hint (revealed progressively)
:::

:::hint
Second hint
:::

:::answer
Solution...
:::
:::
```

### With Explanation
```markdown
:::practice-problem
Problem statement.

:::answer
Brief answer
:::

:::explanation
Detailed explanation of why/how...
:::
:::
```

---

## Educational Directive Blocks

### Definition Block (Purple)
```markdown
:::definition{term="Mólmassi"}
Definition text explaining the term.
:::
```
Renders with: Book icon, "Skilgreining: Mólmassi" title, purple theme

Without term attribute:
```markdown
:::definition
Definition text.
:::
```
Renders with: "Skilgreining" title only

### Key Concept Block (Cyan)
```markdown
:::key-concept
Essential concept students must understand.
:::
```
Renders with: Key icon, "Lykilhugtak" title, cyan theme

### Checkpoint Block (Green)
```markdown
:::checkpoint
Getur þú:
- First self-check item
- Second self-check item
- Third self-check item

Ef ekki, endurskoðaðu kafla X.Y!
:::
```
Renders with: Checkmark icon, "Sjálfsmat" title, green theme

### Common Misconception Block (Rose)
```markdown
:::common-misconception
**Rangt:** Statement of the misconception

**Rétt:** Correct understanding
:::
```
Renders with: X-circle icon, "Algengur misskilningur" title, rose theme

---

## Cross-References

### Creating Anchors
```markdown
$$
E = mc^2
$$ {#eq:einstein}

![Alt text](./image.png) {#fig:diagram}
```

### Using References
```markdown
Sjá [ref:eq:einstein] fyrir jöfnuna.
Eins og sýnt er í [ref:fig:diagram]...
```

Reference types: `sec`, `eq`, `fig`, `tbl`, `def`
```

Create `.claude/skills/chemistry-reader-tags/frontmatter-schema.md`:

```markdown
# Frontmatter Schema

Every publication markdown file requires YAML frontmatter.

## Required Fields

```yaml
---
title: "Section Title"
section: "1.3"
chapter: 1
---
```

| Field | Type | Description |
|-------|------|-------------|
| `title` | string | Section title displayed in header |
| `section` | string | Section number (e.g., "1.3") |
| `chapter` | integer | Chapter number |

## Optional Fields

```yaml
---
title: "Section Title"
section: "1.3"
chapter: 1
objectives:
  - First learning objective
  - Second learning objective
difficulty: intermediate
keywords:
  - efnafræði
  - sýru-basa
prerequisites:
  - Basic algebra
---
```

| Field | Type | Description |
|-------|------|-------------|
| `objectives` | list | Learning objectives (shown in emerald card) |
| `difficulty` | string | `beginner`, `intermediate`, or `advanced` |
| `keywords` | list | Topic keywords (shown in collapsible list) |
| `prerequisites` | list | Required prior knowledge |

## Difficulty Levels

- **`beginner`** (Byrjandi): Green, 1 bar
- **`intermediate`** (Miðstig): Amber, 2 bars
- **`advanced`** (Framhald): Red, 3 bars

## Complete Example

```yaml
---
title: "Mólmassi og mól"
section: "3.1"
chapter: 3
objectives:
  - Reikna mólmassa frá efnaformúlu
  - Umbreyta milli móla og gramma
  - Útskýra mólhugtakið
difficulty: intermediate
keywords:
  - mólmassi
  - mól
  - Avogadro
prerequisites:
  - Atómmassi
  - Efnaformúlur
source:
  original: "Chemistry 2e by OpenStax"
  authors: "Paul Flowers, Klaus Theopold, Richard Langley, William R. Robinson"
  license: "CC BY 4.0"
  translator: "Sigurður E. Vilhelmsson"
  translationYear: 2025
---
```
```

Create `.claude/skills/chemistry-reader-tags/mhchem-reference.md`:

```markdown
# mhchem Chemical Notation Reference

Use `\ce{}` command for all chemical notation. Much simpler than manual subscripts!

## Basic Formulas

```markdown
$\ce{H2O}$           → H₂O
$\ce{H2SO4}$         → H₂SO₄
$\ce{Fe2O3}$         → Fe₂O₃
$\ce{Ca(OH)2}$       → Ca(OH)₂
```

## Ions

```markdown
$\ce{Fe^3+}$         → Fe³⁺
$\ce{SO4^2-}$        → SO₄²⁻
$\ce{Na+}$           → Na⁺
$\ce{Cl-}$           → Cl⁻
```

## States of Matter

```markdown
$\ce{H2O(l)}$        → H₂O(l)   liquid
$\ce{NaCl(s)}$       → NaCl(s)  solid
$\ce{CO2(g)}$        → CO₂(g)   gas
$\ce{NaCl(aq)}$      → NaCl(aq) aqueous
```

## Reaction Arrows

```markdown
$\ce{A -> B}$        → forward reaction
$\ce{A <- B}$        → reverse reaction
$\ce{A <=> B}$       → equilibrium
$\ce{A <-> B}$       → resonance
```

## Reactions with Conditions

```markdown
$\ce{A ->[heat] B}$           → with heat
$\ce{A ->[H2SO4] B}$          → with catalyst
$\ce{A ->[\Delta] B}$         → with heat (delta)
$\ce{A ->[catalyst][heat] B}$ → above and below arrow
```

## Complete Equation Examples

```markdown
**Combustion:**
$$\ce{CH4(g) + 2O2(g) -> CO2(g) + 2H2O(l)}$$

**Equilibrium:**
$$\ce{N2(g) + 3H2(g) <=> 2NH3(g)}$$

**Acid-base:**
$$\ce{HCl(aq) + NaOH(aq) -> NaCl(aq) + H2O(l)}$$
```

## Special Notation

```markdown
$\ce{AgCl v}$        → precipitate (↓)
$\ce{CO2 ^}$         → gas evolution (↑)
$\ce{Fe^2+ -> Fe^3+ + e-}$  → electron transfer
```

## Why mhchem?

Compare:
```markdown
Old: $\text{H}_2\text{SO}_4$
New: $\ce{H2SO4}$
```

Always use mhchem. It's cleaner, easier to read, and less error-prone.
```

Create `.claude/skills/chemistry-reader-tags/tagging-decisions.md`:

```markdown
# Tagging Decision Guide

## Note vs. Key Concept vs. Definition

| Use | When |
|-----|------|
| `:::note` | General important information, tips, reminders |
| `:::key-concept` | Fundamental concept that will be built upon later |
| `:::definition` | Specific term being formally defined |

**Example:**
- "Water is polar" → `:::key-concept` (fundamental idea)
- "Polarity: uneven distribution of charge" → `:::definition{term="Polarity"}`
- "Remember: like dissolves like" → `:::note`

## Example vs. Practice Problem

| Use | When |
|-----|------|
| `:::example` | Worked example showing how to solve |
| `:::practice-problem` | Student should attempt before seeing answer |

**Guideline:** If showing step-by-step solution as teaching → `:::example`
If student should try first → `:::practice-problem`

## When to Add Hints

Add `:::hint` blocks when:
- Problem has multiple steps
- Students commonly get stuck
- There's a key insight needed

Structure hints progressively:
1. First hint: General direction
2. Second hint: More specific guidance
3. Third hint: Nearly gives it away

## When NOT to Tag

Don't tag:
- Every paragraph (over-tagging)
- Simple transitional text
- Standard explanations that flow naturally
- Content that doesn't fit tag categories

**Rule of thumb:** If you're unsure, don't tag. Tags should enhance, not clutter.

## Checkpoint Placement

Place `:::checkpoint` blocks:
- After major concept sections
- Before moving to applications
- At natural "do you understand?" moments

Not:
- After every subsection
- In the middle of explanations
- Multiple times per page

## Misconception Blocks

Use `:::common-misconception` when:
- Research shows students commonly err
- The error is understandable but problematic
- Explicit correction is more effective than hoping they get it right

Format:
```markdown
:::common-misconception
**Rangt:** [What students often think]

**Rétt:** [Correct understanding]
:::
```
```

---

### 3.4 Workflow Status Skill

Create `.claude/skills/workflow-status/SKILL.md`:

```markdown
---
name: workflow-status
description: Understand and manage translation workflow status. Triggers when discussing project progress, chapter status, workflow steps, or next actions.
---

# Workflow Status Management

## 8-Step Pipeline Summary

| Step | Stage | Output Location | Key Output |
|------|-------|-----------------|------------|
| 1 | Source | 01-source/ | Original .docx |
| 2 | MT | 02-mt-output/ | Machine translation |
| 3-4 | Matecat | tm/ | Initial TM |
| 5 | Pass 1 | 03-faithful/ | Faithful translation ★ |
| 6 | TM Update | tm/ | Human-verified TM ★ |
| 7 | Pass 2 | 04-localized/ | Localized version ★ |
| 8 | Publication | 05-publication/ | Web-ready .md |

★ = Preserved valuable asset

## Status Values

For `status.json` files:

| Status | Meaning |
|--------|---------|
| `complete: true` | Stage finished |
| `inProgress: true` | Currently being worked on |
| `pending: true` | Waiting to start |
| `complete: false` | Not yet done |

## CLI Commands

```bash
# Update status
npm run update-status <book> <chapter> <stage> <status> [options]

# Examples
npm run update-status efnafraedi 3 editorialPass1 complete
npm run update-status efnafraedi 3 editorialPass1 in-progress --editor "Name"
npm run update-status efnafraedi 3 publication complete --version "v1.0"

# Validate
npm run validate
npm run validate efnafraedi
```

## Status File Locations

- Chapter status: `books/{book}/chapters/ch{NN}/status.json`
- File tracking: `books/{book}/chapters/ch{NN}/files.json`
- Activity log: `logs/activity-log.md`

## Workflow Dependencies

Each stage requires previous stages to be complete:

```
source → mtOutput → matecat → editorialPass1 → tmUpdated → editorialPass2 → publication
```

Don't skip stages. If a stage isn't complete, earlier work may need to be done first.
```

---

### 3.5 Repository Structure Skill

Create `.claude/skills/repo-structure/SKILL.md`:

```markdown
---
name: repo-structure
description: Ensure correct file naming and locations. Always active when creating, moving, or saving files. Prevents files from being saved in wrong locations.
---

# Repository Structure and File Naming

## Critical Rules

### File Preservation
**Source files are sacred. NEVER modify files in 01-source/ or 02-mt-output/.**

| Folder | Permission | Notes |
|--------|------------|-------|
| 01-source/ | READ ONLY | Original OpenStax files |
| 02-mt-output/ | READ ONLY | MT reference only |
| 03-faithful/ | READ + WRITE | Create backup before editing |
| 04-localized/ | READ + WRITE | Create backup before editing |
| 05-publication/ | READ + WRITE | Create backup before editing |
| tm/ | READ ONLY | Managed by Matecat |
| glossary/ | READ + WRITE | Create backup before editing |

### Before Modifying Any File

1. Verify folder permissions (see above)
2. Create backup: `{filename}.{YYYY-MM-DD-HHMM}.bak`
3. Or commit current state to git
4. Log the action in `logs/activity-log.md`

## Naming Conventions

### Chapter Folders
- Format: `ch{NN}` with zero-padded two digits
- Correct: `ch01`, `ch02`, `ch03`, ... `ch21`
- Wrong: `ch1`, `chapter-01`, `chapter1`

### Pass 1 Output
- Format: `{section-id}-pass1-{initials}.docx`
- Example: `1.2-pass1-SEV.docx`
- Location: `books/{book}/03-faithful/docx/ch{NN}/`

### Pass 2 Output
- Format: `{section-id}-localized.docx`
- Example: `1.2-localized.docx`
- Location: `books/{book}/04-localized/docx/ch{NN}/`

### Localization Logs
- Format: `ch{NN}-log.md`
- Example: `ch03-log.md`
- Location: `books/{book}/04-localized/localization-logs/`

### Publication Markdown
- Format: `{section-id}.md`
- Example: `3.1.md` or `section-3-1.md`
- Location: `books/{book}/05-publication/chapters/`

### Status Files
- Always: `status.json` (lowercase)
- Location: `books/{book}/chapters/ch{NN}/status.json`

## Folder Structure Reference

```
books/{book}/
├── 01-source/
│   ├── docx/ch{NN}/      # Original .docx files
│   ├── txt/               # Stripped plain text
│   └── images-editable/   # High-res figure PDFs
├── 02-mt-output/
│   └── docx/              # MT output (reference)
├── 03-faithful/
│   ├── docx/ch{NN}/      # Pass 1 output
│   └── markdown/          # Converted .md
├── 04-localized/
│   ├── docx/ch{NN}/      # Pass 2 output
│   └── localization-logs/ # Change logs
├── 05-publication/
│   └── chapters/          # Final .md files
├── tm/
│   ├── *.tmx              # Translation memory
│   └── exports/           # Parallel corpus
├── glossary/
│   └── terminology-en-is.csv
└── chapters/
    └── ch{NN}/
        ├── status.json    # Chapter status
        └── files.json     # Per-file tracking
```

## Validation Rules

Before creating any file:
1. ✓ Target folder exists
2. ✓ Naming convention matches stage
3. ✓ Chapter number is zero-padded
4. ✓ Not creating in wrong stage folder
5. ✓ Not overwriting without backup

Common mistakes to prevent:
- Saving to 03-faithful/ during localization (should be 04-localized/)
- Creating ch1/ instead of ch01/
- Putting logs in docx/ folder
- Saving .md in docx/ folders
```

---

### 3.6 Activity Logging Skill

Create `.claude/skills/activity-logging/SKILL.md`:

```markdown
---
name: activity-logging
description: Log all file operations and decisions. Always active. Creates auditable trail of Claude Code actions.
---

# Activity Logging

## Purpose

Every Claude Code session that modifies files MUST log its actions. This creates:
- Auditable trail of changes
- Clear record of what needs human review
- Documentation of decisions made
- List of remaining work

## Log Location

`logs/activity-log.md` (create if doesn't exist)

## Log Entry Format

Append this format for each session:

```markdown
---

## {YYYY-MM-DD HH:MM} - {Command or Action}

**Operator:** Claude Code / {Human name if applicable}

**Files processed:**
- `{filepath}`: {action taken}
- `{filepath}`: {action taken}

**Backups created:**
- `{backup filepath}`

**Decisions made:**
- {decision}: {rationale}

**Requires human review:**
- [ ] `{filepath}`: {what needs review}
- [ ] `{filepath}`: {what needs review}

**Completed:**
- [x] {completed item}

**Next steps:**
1. {remaining work item}
2. {remaining work item}

**Session notes:**
{any relevant context, issues encountered, recommendations}

---
```

## What to Log

### Always Log:
- Files read for processing
- Files created or modified
- Backups created
- Status updates made
- Decisions about terminology, localization, tagging

### Mark for Human Review:
- All Pass 1 linguistic suggestions
- All localization recommendations
- All tagging proposals
- Any content additions or changes
- Terminology decisions

## Example Entry

```markdown
---

## 2025-01-04 14:30 - /review-chapter efnafraedi 3

**Operator:** Claude Code

**Files processed:**
- `books/efnafraedi/03-faithful/docx/ch03/3.1-pass1-SEV.docx`: Reviewed for linguistic quality
- `books/efnafraedi/03-faithful/docx/ch03/3.2-pass1-SEV.docx`: Reviewed for linguistic quality

**Backups created:**
- None (read-only review)

**Decisions made:**
- Flagged "molar mass" → "mólmassi" as correct per glossary
- Suggested rephrasing in section 3.1 paragraph 4 (awkward MT output)

**Requires human review:**
- [ ] `ch03/3.1-pass1-SEV.docx`: 3 suggested corrections (see review report)
- [ ] `ch03/3.2-pass1-SEV.docx`: 5 suggested corrections, 1 terminology question

**Next steps:**
1. Human editor reviews suggestions
2. After approval, update files.json to mark as reviewed
3. Proceed to TM update (step 6)

**Session notes:**
Section 3.2 has an unclear passage about electron configuration that may need subject matter expert review.

---
```

## Integration with Commands

Every slash command should:
1. Start by noting the action in the log
2. Record all files touched
3. List items requiring human review
4. Suggest next steps
```

---

### 3.7 Review Protocol Skill

Create `.claude/skills/review-protocol/SKILL.md`:

```markdown
---
name: review-protocol
description: Define handoff points between Claude Code and human reviewers. Ensures AI outputs are properly reviewed before advancing workflow stages.
---

# Human Review Protocol

## Core Principle

**Claude Code assists; humans decide.**

All substantive changes to translation content require human review and approval before the workflow advances.

## Mandatory Review Points

### 1. After Pass 1 AI Suggestions
- Claude Code generates suggestions
- Human editor reviews each suggestion
- Human accepts/rejects in Word (Track Changes)
- Human marks as approved in files.json
- Only then can Pass 2 begin

### 2. After Localization Recommendations
- Claude Code identifies opportunities
- Human decides which adaptations to make
- Human completes the actual localization
- Human fills in localization log
- Human marks as approved

### 3. After Tagging Suggestions
- Claude Code proposes tags
- Human reviews pedagogical appropriateness
- Human approves or adjusts tags
- Human marks as approved

### 4. Before Publication
- All content must have `approved: true` in files.json
- Human explicitly authorizes publication
- No automatic publication without approval

## Review Status Values

In `files.json`, each file has:

```json
{
  "pendingReview": null | "pass1" | "localization" | "tagging",
  "approved": false | true,
  "reviewedBy": null | "human" | "{name}"
}
```

## Claude Code Behavior by Status

### File is PENDING REVIEW
Claude Code may:
- ✓ Read the file
- ✓ Generate reports about the file
- ✓ Remind user review is needed

Claude Code may NOT:
- ✗ Modify the file
- ✗ Advance to next workflow stage
- ✗ Mark as complete

### File is APPROVED
Claude Code may:
- ✓ Proceed to next stage
- ✓ Process and generate new outputs
- ✓ Must create backup before modifying
- ✓ Must mark new output as PENDING REVIEW

### File is NOT YET PROCESSED
Claude Code may:
- ✓ Process and generate outputs
- ✓ Must mark output as PENDING REVIEW
- ✓ Must log the action

## Review Checklist Template

When presenting work for review:

```markdown
## Ready for Review: {filename}

**Stage:** {Pass 1 / Localization / Tagging}

**Changes proposed:**
1. {change 1}
2. {change 2}
...

**Terminology decisions:**
- {term}: {decision}

**Questions for reviewer:**
- {question 1}
- {question 2}

**To approve:** Update files.json with `"approved": true`
**To request changes:** Note issues and Claude Code will revise
```

## Escalation

If Claude Code is uncertain:
- Flag with `[DISCUSS]` or `[QUESTION]`
- Do not proceed with uncertain changes
- Document the uncertainty in activity log
- Wait for human guidance
```

---

## PHASE 4: CREATE SUBAGENTS

### 4.1 Terminology Checker

Create `.claude/agents/terminology-checker.md`:

```markdown
---
name: terminology-checker
description: Systematically verify terminology consistency against project glossary. Use PROACTIVELY when reviewing translations or checking term usage across files.
tools: Read, Grep, Glob
model: sonnet
---

You are a terminology verification specialist for Icelandic chemistry translations.

## Your Task

Verify that all technical terms in the provided content match the approved project terminology.

## Process

1. Load the glossary from `glossary/terminology-en-is.csv`
2. Identify all technical/scientific terms in the content
3. Cross-reference each term against the glossary
4. Check for consistency within the document

## Output Format

Produce a structured report:

```markdown
# Terminology Check Report

**File(s) reviewed:** {list}
**Date:** {date}

## ✓ Correct Terms
| Term (EN) | Term (IS) | Occurrences |
|-----------|-----------|-------------|
| {term} | {term} | {count} |

## ⚠ Inconsistent Usage
| Term (EN) | Expected (IS) | Found | Location |
|-----------|---------------|-------|----------|
| {term} | {correct} | {incorrect} | {where} |

## ? Unknown Terms (Need Decision)
| Term (EN) | Context | Suggested (IS) | Source |
|-----------|---------|----------------|--------|
| {term} | {context} | {suggestion} | {source if found} |

## Recommendations
- {recommendation 1}
- {recommendation 2}
```

## Resources

- Primary glossary: `glossary/terminology-en-is.csv`
- Terminology guide: `docs/terminology.md`
- External: [Íðorðabankinn](https://idord.arnastofnun.is/)
```

### 4.2 Localization Reviewer

Create `.claude/agents/localization-reviewer.md`:

```markdown
---
name: localization-reviewer
description: Identify localization opportunities in faithful translations. Use when preparing content for Pass 2 or reviewing localization completeness.
tools: Read, Write
model: sonnet
---

You are a localization specialist preparing Icelandic educational content for secondary school students.

## Your Task

Review faithful translations and identify all opportunities for localization, without making the changes directly.

## Process

1. Read the localization skill: `.claude/skills/localization/SKILL.md`
2. Scan the content systematically for:
   - Imperial units → SI conversions needed
   - American cultural references → Icelandic adaptations
   - Opportunities for Icelandic context
   - Places where extended exercises would help

## Output Format

Produce a localization opportunities report:

```markdown
# Localization Opportunities Report

**File:** {filepath}
**Date:** {date}

## Unit Conversions Needed

| Section | Original | Suggested | Notes |
|---------|----------|-----------|-------|
| {loc} | {value} | {converted} | {notes} |

## Cultural Adaptations Suggested

| Section | Original Reference | Suggested Adaptation | Rationale |
|---------|-------------------|---------------------|-----------|
| {loc} | {original} | {adaptation} | {why} |

## Icelandic Context Opportunities

| Section | Topic | Suggested Addition | Connection |
|---------|-------|-------------------|------------|
| {loc} | {topic} | {addition} | {how it connects} |

## Extended Exercise Opportunities

| Section | Current Content | Suggested Exercise |
|---------|-----------------|-------------------|
| {loc} | {content} | {exercise idea} |

## Summary

- Total unit conversions: {N}
- Cultural adaptations: {N}
- Context additions: {N}
- Exercise opportunities: {N}

## Draft Localization Log

[Include a draft following the template in localization-log-format.md]
```

## Important

- DO NOT make changes directly
- Produce recommendations for human review
- Human editor makes final decisions
- All suggestions should be pedagogically sound
```

### 4.3 Content Tagger

Create `.claude/agents/content-tagger.md`:

```markdown
---
name: content-tagger
description: Apply Chemistry Reader pedagogical tags to markdown content. Use when preparing content for publication or reviewing tag usage.
tools: Read, Write
model: sonnet
---

You are a pedagogical content specialist applying educational markup to chemistry content.

## Your Task

Identify opportunities for Chemistry Reader tags and propose appropriate markup.

## Process

1. Read the tagging skill: `.claude/skills/chemistry-reader-tags/SKILL.md`
2. Read all supporting files in that skill folder
3. Analyze the content for tagging opportunities
4. Propose tags with rationale

## Tagging Opportunities to Look For

- Key terms → `:::definition{term="..."}`
- Important concepts → `:::key-concept`
- Worked examples → `:::example`
- Practice exercises → `:::practice-problem`
- Safety/cautions → `:::warning`
- Important notes → `:::note`
- Common errors → `:::common-misconception`
- Self-checks → `:::checkpoint`

## Output Format

```markdown
# Tagging Proposal

**File:** {filepath}
**Date:** {date}

## Proposed Tags

### 1. {Location/context}

**Type:** {tag type}
**Rationale:** {why this tag}

**Before:**
```
{original content}
```

**After:**
```
{tagged content}
```

### 2. {Location/context}
...

## Summary

- Definitions: {N}
- Key concepts: {N}
- Examples: {N}
- Practice problems: {N}
- Warnings: {N}
- Notes: {N}
- Misconceptions: {N}
- Checkpoints: {N}

## Notes

- {any concerns or questions}
```

## Guidelines

- Don't over-tag
- Use mhchem for chemistry: `$\ce{H2O}$`
- Ensure proper nesting for practice problems
- Show proposals; wait for approval before applying
```

---

## PHASE 5: CREATE SLASH COMMANDS

### 5.1 Review Chapter Command

Create `.claude/commands/review-chapter.md`:

```markdown
---
description: Review a chapter for Pass 1 linguistic quality
allowed-tools: Read, Grep, Glob
---

# Review Chapter for Pass 1 Quality

Review chapter $ARGUMENTS for Pass 1 linguistic quality.

## Pre-flight Checks

1. Parse the argument (e.g., "efnafraedi 3" or "3" defaults to efnafraedi)
2. Format chapter as ch{NN}: chapter 3 → ch03
3. Verify files exist in `books/{book}/03-faithful/docx/ch{NN}/` or `02-mt-output/`
4. If no files found, inform user and stop

## Process

1. Load the editorial-pass1 skill: read `.claude/skills/editorial-pass1/SKILL.md`
2. Load terminology reference: read `.claude/skills/editorial-pass1/terminology-reference.md`
3. For each file in the chapter:
   - Read content
   - Check grammar, spelling, phrasing
   - Verify terminology against glossary
   - Note any issues
4. Generate review report

## Output

Produce a structured markdown report:

```markdown
# Pass 1 Review Report: Chapter {N}

**Book:** {book}
**Date:** {date}
**Files reviewed:** {count}

## File: {filename}

### Grammar/Spelling Issues
| Location | Issue | Suggested Fix |
|----------|-------|---------------|
| {loc} | {issue} | {fix} |

### Phrasing Improvements
| Location | Original | Suggested |
|----------|----------|-----------|
| {loc} | {original} | {improved} |

### Terminology
| Term | Status | Notes |
|------|--------|-------|
| {term} | ✓/⚠/? | {notes} |

## Summary
- Total issues: {N}
- Terminology questions: {N}

## Next Steps
1. Human editor reviews suggestions
2. Accept/reject changes in Word
3. Update files.json when approved
```

## Important

- Do NOT suggest localization changes (that's Pass 2)
- Do NOT modify files directly
- Mark all suggestions as requiring human review
- Log this session in `logs/activity-log.md`
```

### 5.2 Localize Chapter Command

Create `.claude/commands/localize-chapter.md`:

```markdown
---
description: Identify localization opportunities for Pass 2
allowed-tools: Read, Write
---

# Identify Localization Opportunities

Identify localization opportunities in chapter $ARGUMENTS.

## Pre-flight Checks

1. Parse argument (e.g., "efnafraedi 3")
2. Format as ch{NN}
3. Verify faithful translation exists: `books/{book}/03-faithful/docx/ch{NN}/`
4. If not found, STOP: "Pass 1 must be completed first"

## Process

1. Load localization skill: read `.claude/skills/localization/SKILL.md`
2. Read all supporting files in that skill folder
3. Invoke the localization-reviewer subagent
4. Generate draft localization log

## Output Locations

- Report: Display to user
- Draft log: `books/{book}/04-localized/localization-logs/ch{NN}-log.md`
  - Only create draft if user confirms
  - Mark as DRAFT - requires human completion

## Important

- Identify opportunities; don't make changes
- Human decides which adaptations to make
- Human completes the actual localization
- Log this session in `logs/activity-log.md`
```

### 5.3 Tag for Publication Command

Create `.claude/commands/tag-for-publication.md`:

```markdown
---
description: Apply Chemistry Reader tags to publication content
allowed-tools: Read, Write
---

# Apply Chemistry Reader Tags

Apply pedagogical tags to $ARGUMENTS.

## Pre-flight Checks

1. Verify input file is in `04-localized/` or `05-publication/`
2. If file is in earlier stage, warn: "Content should be localized before tagging"
3. Confirm output location: `books/{book}/05-publication/chapters/`

## Process

1. Load tagging skill: read `.claude/skills/chemistry-reader-tags/SKILL.md`
2. Read all supporting files in that skill folder
3. Invoke the content-tagger subagent
4. Show proposed changes
5. Wait for user approval before applying

## Approval Flow

```
1. Show tagging proposal
2. Ask: "Apply these tags? (y/n/modify)"
3. If yes:
   - Create backup of original
   - Apply tags
   - Log changes
   - Mark as pending review
4. If no: 
   - Exit without changes
5. If modify:
   - Ask what to change
   - Revise proposal
   - Return to step 2
```

## Important

- Always show proposals before applying
- Create backup before any modification
- Use mhchem for chemistry notation
- Log all changes in activity log
```

### 5.4 Chapter Status Command

Create `.claude/commands/chapter-status.md`:

```markdown
---
description: Show chapter status and suggest next steps
allowed-tools: Read, Bash
---

# Show Chapter Status

Show status for $ARGUMENTS.

## Parse Argument

Format: "efnafraedi 3" or just "3" (defaults to efnafraedi)

## Process

1. Read `books/{book}/chapters/ch{NN}/status.json`
2. Read `books/{book}/chapters/ch{NN}/files.json` if exists
3. Check `logs/activity-log.md` for recent activity

## Display

```markdown
# Chapter {N} Status: {Title}

**Book:** {book}
**Last updated:** {date}

## Pipeline Progress

| Stage | Status | Date | Notes |
|-------|--------|------|-------|
| 1. Source | ✓/⏳/○ | {date} | |
| 2. MT Output | ✓/⏳/○ | {date} | |
| 3-4. Matecat | ✓/⏳/○ | {date} | |
| 5. Pass 1 | ✓/⏳/○ | {date} | Editor: {name} |
| 6. TM Update | ✓/⏳/○ | {date} | |
| 7. Pass 2 | ✓/⏳/○ | {date} | |
| 8. Publication | ✓/⏳/○ | {date} | Version: {ver} |

## File Status (if files.json exists)

| File | Current Stage | Pending Review | Approved |
|------|---------------|----------------|----------|
| {file} | {stage} | {yes/no} | {yes/no} |

## Recent Activity

{Last 3 entries from activity log for this chapter}

## Suggested Next Steps

Based on current status:
1. {next action}
2. {following action}

## Commands

To update status:
```bash
npm run update-status {book} {chapter} {stage} {status}
```
```
```

### 5.5 Intake Source Command

Create `.claude/commands/intake-source.md`:

```markdown
---
description: Register a new source file and initialize tracking
allowed-tools: Read, Write, Bash
---

# Register Source File

Register source file $ARGUMENTS for tracking.

## Parse Argument

Format: "efnafraedi ch03/section-3.1.docx" or full path

## Pre-flight Checks

1. Verify file exists in `01-source/docx/ch{NN}/`
2. If file doesn't exist, stop with error

## Process

1. Read or create `books/{book}/chapters/ch{NN}/files.json`
2. Add entry for the file:

```json
{
  "source": "01-source/docx/ch{NN}/{filename}",
  "currentStage": "source",
  "stages": {
    "source": { "complete": true, "date": "{today}" },
    "mtOutput": { "complete": false },
    "matecat": { "complete": false },
    "pass1": { "complete": false },
    "tmUpdated": { "complete": false },
    "pass2": { "complete": false },
    "publication": { "complete": false }
  },
  "pendingReview": null,
  "approved": false,
  "notes": ""
}
```

3. Log the intake in `logs/activity-log.md`

## Output

```markdown
# File Registered

**File:** {filename}
**Chapter:** {chapter}
**Date:** {date}

## Tracking Initialized

Current stage: Source (Step 1)

## Next Steps

1. Upload to malstadur.is for machine translation
2. After MT: Update with `npm run update-status {book} {chapter} mtOutput complete`
3. Then proceed to Matecat alignment
```
```

### 5.6 Pipeline Status Command

Create `.claude/commands/pipeline-status.md`:

```markdown
---
description: Show complete pipeline overview for a book
allowed-tools: Read, Bash
---

# Pipeline Overview

Show pipeline status for $ARGUMENTS (book name, or "all").

## Process

1. Read `STATUS.md` for overview
2. Read `books/{book}/STATUS.md` for book detail
3. Scan all `chapters/ch{NN}/status.json` files
4. Aggregate statistics

## Output

```markdown
# Pipeline Status: {Book}

**Date:** {date}
**Total chapters:** {N}

## Overview

| Stage | Complete | In Progress | Not Started |
|-------|----------|-------------|-------------|
| Source | {N} | {N} | {N} |
| MT Output | {N} | {N} | {N} |
| Matecat | {N} | {N} | {N} |
| Pass 1 | {N} | {N} | {N} |
| TM Update | {N} | {N} | {N} |
| Pass 2 | {N} | {N} | {N} |
| Publication | {N} | {N} | {N} |

## Chapters Pending Human Review

| Chapter | File | Stage | Waiting Since |
|---------|------|-------|---------------|
| {ch} | {file} | {stage} | {date} |

## Ready for Next Stage

| Chapter | Current Stage | Ready For |
|---------|---------------|-----------|
| {ch} | {current} | {next} |

## Recent Activity

{Last 5 entries from activity log}

## Suggested Actions

1. {highest priority action}
2. {second priority}
3. {third priority}
```
```

### 5.7 Check Terminology Command

Create `.claude/commands/check-terminology.md`:

```markdown
---
description: Check terminology consistency in a file or chapter
allowed-tools: Read, Grep, Glob
---

# Check Terminology

Check terminology in $ARGUMENTS.

## Process

1. Invoke the terminology-checker subagent
2. Compare against `glossary/terminology-en-is.csv`
3. Generate report

## Output

Structured terminology report (see terminology-checker subagent for format).

## Important

- Flag inconsistencies for human decision
- Don't auto-correct terminology
- Log the check in activity log
```

---

## PHASE 6: CREATE SETTINGS AND INITIALIZE LOG

### 6.1 Settings File

Create `.claude/settings.json`:

```json
{
  "project": "namsbokasafn-efni",
  "description": "Icelandic OpenStax textbook translations",
  "permissions": {
    "allow_read": ["**/*"],
    "allow_write": [
      ".claude/**",
      "books/**/03-faithful/**",
      "books/**/04-localized/**",
      "books/**/05-publication/**",
      "books/**/chapters/**/files.json",
      "logs/**",
      "glossary/**"
    ],
    "never_write": [
      "books/**/01-source/**",
      "books/**/02-mt-output/**",
      "books/**/tm/**"
    ]
  }
}
```

### 6.2 Initialize Activity Log

Create `logs/activity-log.md`:

```markdown
# Námsbókasafn Activity Log

This log tracks all Claude Code actions on the repository.

---

## {CURRENT_DATE} - Initial Setup

**Operator:** Claude Code

**Actions:**
- Created `.claude/` directory structure
- Created skills, agents, and commands
- Initialized activity log

**Next steps:**
1. Review created files
2. Test commands
3. Begin using workflow

---
```

---

## PHASE 7: VERIFICATION

After creating all files:

1. **List the complete structure:**
   ```bash
   find .claude -type f -name "*.md" -o -name "*.json" | sort
   find logs -type f | sort
   ```

2. **Verify skill frontmatter:** Check each SKILL.md has valid `---` delimited YAML with `name` and `description`

3. **Verify agent frontmatter:** Check each agent .md has valid YAML with `name`, `description`, `tools`, `model`

4. **Verify command frontmatter:** Check each command .md has valid YAML with `description`, `allowed-tools`

5. **Display summary:**
   ```markdown
   ## Setup Complete
   
   ### Skills Created
   - editorial-pass1 (4 files)
   - localization (5 files)
   - chemistry-reader-tags (5 files)
   - workflow-status (1 file)
   - repo-structure (1 file)
   - activity-logging (1 file)
   - review-protocol (1 file)
   
   ### Agents Created
   - terminology-checker
   - localization-reviewer
   - content-tagger
   
   ### Commands Created
   - /review-chapter
   - /localize-chapter
   - /tag-for-publication
   - /chapter-status
   - /intake-source
   - /pipeline-status
   - /check-terminology
   
   ### Other
   - .claude/settings.json
   - logs/activity-log.md
   ```

6. **Test one command:** Run `/chapter-status efnafraedi 1` to verify setup works

---

## NOTES FOR HUMAN OPERATOR

After Claude Code completes this setup:

1. **Review the created files** - especially skill content for accuracy
2. **Commit to git:** `git add .claude/ logs/ && git commit -m "Add Claude Code customization"`
3. **Test each command** with a sample chapter
4. **Adjust as needed** - these are starting points

The setup creates a framework. You may want to:
- Add more terminology to the reference files
- Adjust localization guidelines for your specific needs
- Modify command outputs to your preferences
- Add additional commands for other workflows

All changes are tracked in `logs/activity-log.md` for auditability.
```
