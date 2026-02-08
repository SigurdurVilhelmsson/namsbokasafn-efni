<!-- ARCHIVED: 2026-02-08 - Legacy markdown pipeline reference. Current pipeline (Phase 8+) uses cnxml-extract.js for segmentation and cnxml-render.js for direct HTML rendering. Tag mapping concepts still apply but implementation differs. Moved from docs/technical/openstax-tag-mapping.md. -->

# OpenStax Tag Mapping Reference (ARCHIVED - Markdown Pipeline)

> **NOTE:** This document describes the old markdown extraction approach (Phase ≤7). The current pipeline (Phase 8+) uses `cnxml-extract.js` for segmentation and `cnxml-render.js` for direct HTML rendering. Tag mapping concepts still apply but implementation details have changed. See `tools/lib/cnxml-elements.js` for current HTML rendering of CNXML elements and [docs/technical/publication-format.md](../technical/publication-format.md) for current HTML output specification.

## Overview

This document provides a comprehensive mapping of OpenStax CNXML tags to markdown directives used in the **legacy** namsbokasafn translation pipeline (pre-Phase 8).

**Key principle:** We use original OpenStax class names as directive names to maintain consistency with source material and avoid confusion.

**Historical context:** The markdown directives described below were used when publication output was assembled markdown. The current pipeline produces semantic HTML directly from CNXML.

## Structural Elements

### Examples

**CNXML:**
```xml
<example id="Example_01_04_01">
  <title>Calculation of Density</title>
  <para>Example content here...</para>
</example>
```

**Markdown:**
```markdown
:::example{id="Example_01_04_01"}
### Example 1.1: Calculation of Density

Example content here...

:::
```

**Notes:**
- ID is preserved using MT-safe `{id="..."}` format
- Chapter-based numbering added automatically (e.g., "Example 1.1")
- Title becomes a heading inside the directive

### Exercises

**Important:** All `<exercise>` tags in OpenStax Chemistry are end-of-chapter exercises. In-chapter practice is handled within `<example>` tags as "Check Your Learning" sections.

**CNXML:**
```xml
<section class="exercises">
  <title>Chemistry End of Chapter Exercises</title>
  <exercise id="fs-idm68837632">
    <problem>
      <para>What is the EOC question?</para>
    </problem>
  </exercise>
  <exercise id="fs-idm323373040">
    <problem>
      <para>Another question?</para>
    </problem>
    <solution>
      <para>Answer to every other exercise.</para>
    </solution>
  </exercise>
</section>
```

**Markdown:**
```markdown
## Chemistry End of Chapter Exercises

:::exercise{id="fs-idm68837632"}
What is the EOC question?

:::

:::exercise{id="fs-idm323373040"}
Another question?

:::answer
Answer to every other exercise.

:::
:::
```

**Notes:**
- All exercises appear in sections with `class="exercises"`
- Every other exercise includes a `<solution>` (for the answer key)
- Solutions are rendered as nested `:::answer` directives

### Figures

**CNXML:**
```xml
<figure id="CNX_Chem_01_04_MYdCmIn" class="scaled-down">
  <media alt="Comparison of metric units">
    <image src="CNX_Chem_01_04_MYdCmIn.jpg"/>
  </media>
  <caption>The relative lengths...</caption>
</figure>
```

**Markdown:**
```markdown
![](CNX_Chem_01_04_MYdCmIn.jpg){id="CNX_Chem_01_04_MYdCmIn" class="scaled-down" alt="Comparison of metric units"}

*Figure 1.1: The relative lengths...*{id="CNX_Chem_01_04_MYdCmIn"}
```

**Notes:**
- All attributes use MT-safe `{key="value"}` format
- Alt text extracted from `<media>` element
- Caption becomes italic text with figure ID

## Note Elements

All note directives use original OpenStax class names.

### Link to Learning

**CNXML:**
```xml
<note class="chemistry link-to-learning">
  <para>Visit this site...</para>
</note>
```

**Markdown:**
```markdown
:::link-to-learning
Visit this site...

:::
```

**Vefur rendering:** Blue icon, "Tengill að námsefni" (Link to Learning Material)

### Everyday Life

**CNXML:**
```xml
<note class="chemistry everyday-life">
  <para>Chemistry in daily life...</para>
</note>
```

**Markdown:**
```markdown
:::everyday-life
Chemistry in daily life...

:::
```

**Vefur rendering:** Purple icon, "Efnafræði í daglegu lífi" (Chemistry in Everyday Life)

### Chemist Portrait

**CNXML:**
```xml
<note class="chemistry chemist-portrait">
  <para>Profile of a scientist...</para>
</note>
```

**Markdown:**
```markdown
:::chemist-portrait
Profile of a scientist...

:::
```

**Vefur rendering:** Teal icon, "Efnafræðingur" (Chemist Portrait)

### Sciences Interconnect

**CNXML:**
```xml
<note class="chemistry sciences-interconnect">
  <para>How chemistry connects to other sciences...</para>
</note>
```

**Markdown:**
```markdown
:::sciences-interconnect
How chemistry connects to other sciences...

:::
```

**Vefur rendering:** Green icon, "Tengsl vísindagreina" (Sciences Interconnect)

### Summary, Key Concepts, Key Equations

**CNXML:**
```xml
<note class="summary">...</note>
<note class="key-concepts">...</note>
<note class="key-equations">...</note>
```

**Markdown:**
```markdown
:::summary
...
:::

:::key-concepts
...
:::

:::key-equations
...
:::
```

**Notes:** These typically appear in end-of-chapter sections.

## Inline Elements

### Terms

**CNXML:**
```xml
<term id="term-00001">chemistry</term>
```

**Markdown:**
```markdown
**chemistry**{id="term-00001"}
```

**Notes:**
- Bold text with MT-safe ID attribute
- IDs enable glossary cross-referencing

### Links

**CNXML:**
```xml
<link url="https://example.com">link text</link>
```

**Markdown:**
```markdown
[link text]{url="https://example.com"}
```

### Cross-References

**CNXML:**
```xml
<link target-id="Example_01_04_01">See this example</link>
```

**Markdown:**
```markdown
[See this example]{ref="Example_01_04_01"}
```

**Notes:** Uses `ref` attribute for internal cross-references.

## Math and Chemistry

### Inline Equations

**CNXML:**
```xml
<m:math><m:mn>2.5</m:mn></m:math>
```

**Markdown:**
```markdown
[[EQ:n]]
```

**Notes:**
- MathML converted to placeholder during processing
- Actual math stored in sidecar equations.json file

### Block Equations

**CNXML:**
```xml
<equation id="fs-idm166517584">
  <m:math>...</m:math>
</equation>
```

**Markdown:**
```markdown
[[EQ:n]]
```

**Notes:** Same placeholder system as inline equations.

### Chemical Formulas

**CNXML:**
```xml
H<sub>2</sub>O
CO<sub>2</sub>
```

**Markdown:**
```markdown
H~2~O
CO~2~
```

**Notes:** Subscripts use `~` for MT-safe syntax.

## MT-Safety Guidelines

### Attribute Syntax

**✅ MT-Safe (ALWAYS use this):**
```markdown
{id="value"}
{class="value"}
{alt="value"}
```

**❌ NOT MT-safe (NEVER use this):**
```markdown
{#id}
{.class}
```

**Reason:** The `#` and `.` shortcuts can be misinterpreted by MT systems as punctuation.

### Directive Syntax

**✅ Correct:**
```markdown
:::directive-name{id="value"}
Content here
:::
```

**❌ Incorrect:**
```markdown
:::directive-name{#value}
Content here
:::
```

## Vefur Renderer Mapping

The following directive names are supported in `namsbokasafn-vefur/src/lib/utils/markdown.ts`:

| Directive | Icon | Icelandic Title | Color |
|-----------|------|-----------------|-------|
| `:::link-to-learning` | 🔗 | Tengill að námsefni | Blue |
| `:::everyday-life` | 🌟 | Efnafræði í daglegu lífi | Purple |
| `:::chemist-portrait` | 👤 | Efnafræðingur | Teal |
| `:::sciences-interconnect` | 🔬 | Tengsl vísindagreina | Green |
| `:::exercise` | 📝 | Æfing | Blue |
| `:::example` | 💡 | Dæmi | Yellow |
| `:::summary` | 📋 | Samantekt | Gray |
| `:::key-concepts` | 🔑 | Lykilhugtök | Blue |
| `:::key-equations` | ➕ | Lykiljöfnur | Green |

## Known Limitations

### Examples Between Sections

**Issue:** Examples that appear between `</section>` and the next `<section>` tag are not currently captured.

**Example:**
```xml
<section>...</section>
<example id="Example_01_04_01">
  <!-- This example will NOT be processed -->
</example>
<section>...</section>
```

**Workaround:** None currently. This is a structural limitation of the current parser.

**Impact:** Affects some OpenStax modules where examples are placed outside sections.

## Changelog

### 2026-01-29 - Tag Preservation Enhancement

- **Added:** Example ID preservation with `{id="..."}` attributes
- **Added:** Context-aware exercise type detection (practice-problem vs exercise)
- **Changed:** All note classes now use original OpenStax names
- **Changed:** All attribute syntax uses MT-safe `{key="value"}` format

**Breaking changes:**
- `:::link-to-material` → `:::link-to-learning`
- `:::chemistry-everyday` → `:::everyday-life`
- `:::scientist-spotlight` → `:::chemist-portrait`
- `:::how-science-connects` → `:::sciences-interconnect`

**Migration:** Vefur renderer must be updated to support new directive names.

## Cross-Repository References

- **Converter:** `namsbokasafn-efni/tools/cnxml-to-md.js`
- **Renderer:** `namsbokasafn-vefur/src/lib/utils/markdown.ts`
- **Vefur docs:** `namsbokasafn-vefur/docs/content-format.md`

## Testing

**Test file:** `tools/test-tag-preservation.cnxml`

Contains minimal examples of:
- Examples with IDs
- In-chapter exercises
- End-of-chapter exercises
- All note class types
- Figures with attributes
- Inline elements

**Run test:**
```bash
node tools/cnxml-to-md.js tools/test-tag-preservation.cnxml
```

**Expected output:** All directives with correct names and MT-safe ID attributes.
