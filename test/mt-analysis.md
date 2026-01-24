# MT Syntax Survival Analysis Report

**Date:** 2026-01-24
**MT System:** Erlendur (malstadur.is)
**Source File:** `mt-sample.en.md`
**Output File:** `mt-sample.is.md`

---

## Analysis Summary

| Category | Status | Issues Found |
| :--- | :---: | :--- |
| YAML Frontmatter | ❌ | Delimiters removed, structure destroyed |
| Directive Blocks | ⚠️ | Closing `:::` merged with content |
| Link Syntax | ❌ | Brackets escaped, standard links destroyed |
| Equation Placeholders | ⚠️ | Brackets escaped `\[\[...\]\]` |
| Image Attributes | ✅ | Survived intact |
| Figure Captions | ✅ | Survived intact |
| Term Definitions | ✅ | Survived intact |
| Tables | ❌ | Flattened to single lines |
| Subscripts/Superscripts | ✅ | All preserved |
| Math Delimiters | ⚠️ | OK but LaTeX internals escaped |
| Special Characters | ✅ | All preserved |
| Nested Structures | ❌ | Directive closings misplaced |
| Edge Cases | ⚠️ | Various issues with structure |

**Legend:** ✅ Passed | ⚠️ Partial Issues | ❌ Failed

---

## Critical Issues Requiring Pipeline Updates

### HIGH PRIORITY (Breaks Rendering)

#### 1. YAML Frontmatter Destroyed

**Input:**
```yaml
---
title: "MT Syntax Survival Test Document"
chapter: 99
section: "99.1"
translation-status: "Untranslated - Test File"
module-id: "m00000"
---
```

**Output:**
```
## titill: „Prófunarskjal fyrir setningafræði MT" kafli: 99 hluti: „99.1" þýðingarstaða: „Óþýdd – Prófunarskrá" einingakenni: „m00000"
```

**Problems:**
- `---` delimiters completely removed
- Converted to a `##` heading
- Field structure flattened to single line
- Quotes changed from `"` to `„"` (Icelandic quotes)

**Proposed Fix:** Pre-MT protection: Extract frontmatter, pass through separately or protect with markers. Post-MT restoration: Rebuild from protected version.

---

#### 2. Link Brackets Escaped

**Input:**
```markdown
[Visit OpenStax]{url="https://openstax.org/..."}
[Figure 1.1]{ref="CNX_Chem_01_01_Chem2e"}
[Chapter on Matter]{doc="m68724"}
```

**Output:**
```markdown
\[Heimsæktu OpenStax\]{url="https://openstax.org/..."}
\[Mynd 1.1\]{ref="CNX_Chem_01_01_Chem2e"}
\[Kafli um efni\]{doc="m68724"}
```

**Problems:**
- All `[` and `]` escaped with backslashes
- The attribute portion `{url="..."}` preserved correctly
- Link text was translated (correct behavior)

**Proposed Fix:** Post-MT: Remove backslash escapes before `[` and `]` in link patterns.

---

#### 3. Standard Markdown Links Destroyed

**Input:**
```markdown
[Standard markdown link](https://example.com)
[Link with title](https://example.com "Example Title")
```

**Output:**
```markdown
Staðlaður hlekkur: Staðlaður markdown hlekkur

Hlekkur með titli: Hlekkur með titli
```

**Problems:**
- Entire link syntax removed
- Only link text remains (translated)
- URL completely lost
- This is why we use `{url="..."}` format instead!

**Conclusion:** The custom `[text]{url="..."}` format is correct for MT - standard markdown links cannot survive.

---

#### 4. Tables Flattened

**Input:**
```markdown
| Element | Symbol | Atomic Number |
| :--- | :---: | ---: |
| Hydrogen | H | 1 |
| Helium | He | 2 |
{id="table-001" summary="..."}
```

**Output:**
```markdown
| Frumefni | Tákn | Sætistala | | :--- | :---: | ---: | | Vetni | H | 1
| | Helíum | He | 2 | | Litíum | Li | 3 | | Kolefni | C | 6 |
{id="table-001" summary="..."}
```

**Problems:**
- All newlines within table removed
- Table rows merged into continuous text
- Pipe separators preserved but on wrong lines
- Attribute block at end preserved

**Proposed Fix:** Pre-MT: Protect entire table blocks. Post-MT: Cannot reliably restore line breaks without protection.

---

#### 5. Equation Placeholders Escaped

**Input:**
```markdown
[[EQ:1]]
[[EQ:5]]{id="equation-quadratic"}
```

**Output:**
```markdown
\[\[EQ:1\]\]
\[\[EQ:5\]\]{id="equation-quadratic"}
```

**Problems:**
- All brackets escaped with backslashes
- Content and structure preserved
- Attribute syntax preserved

**Proposed Fix:** Post-MT: Simple regex to unescape `\[\[EQ:` patterns.

---

#### 6. Directive Closing Markers Merged

**Input:**
```markdown
:::learning-objectives
- Objective 1
- Objective 2
:::
```

**Output:**
```markdown
:::learning-objectives

- Skilja grundvallarreglur efnafræðinnar

- Beita efnaformúlum á raunveruleg vandamál

- Greina gögn úr tilraunum á áhrifaríkan hátt :::
```

**Problems:**
- Opening `:::directive` preserved on its own line
- Closing `:::` merged with last content line
- Extra blank lines added between list items
- Nested directives have `:::` closings merged: `::: :::`

**Proposed Fix:** Post-MT: Add newline before standalone `:::` when preceded by non-whitespace.

---

### MEDIUM PRIORITY (Degraded Experience)

#### 7. LaTeX Content Partially Escaped

**Input:**
```markdown
$$
K_{eq} = \frac{[C]^c[D]^d}{[A]^a[B]^b}
$$
```

**Output:**
```markdown
$$ K\_{eq} = \frac{\[C\]^c\[D\]^d}{\[A\]^a\[B\]^b} $$
```

**Problems:**
- Underscores escaped: `_{eq}` → `\_{eq}`
- Square brackets escaped inside LaTeX
- Math delimiters `$$` preserved
- Display math newlines collapsed to single line

**Proposed Fix:** Post-MT: Unescape within `$...$` and `$$...$$` blocks.

---

#### 8. Isotope Notation Escaped

**Input:**
```markdown
Combined notation: _{6}^{14}C
```

**Output:**
```markdown
Samsettur ritháttur: \_{6}^{14}C
```

**Problems:**
- Leading underscore escaped

**Proposed Fix:** Post-MT: Unescape `\_` in isotope patterns.

---

### LOW PRIORITY (Minor/Cosmetic)

#### 9. Extra Blank Lines Added

Content has extra blank lines inserted between paragraphs and list items. Not breaking but increases file size.

#### 10. Quote Style Changed

`"text"` → `„text"` (Icelandic quotation marks). This is correct behavior for translation.

---

## Patterns That Survived Unchanged

These patterns work correctly with Erlendur MT:

1. ✅ **Subscripts/Superscripts**: `H~2~O`, `Na^+^`, `10^-3^` - all preserved perfectly
2. ✅ **Image Attribute Blocks**: `{id="..." class="..." alt="..."}` - preserved, alt text translated
3. ✅ **Figure Captions**: `*Caption*{id="..."}` - format preserved
4. ✅ **Term Definitions**: `**term**{id="..."}` - format preserved
5. ✅ **Inline Math**: `$E = mc^2$` - delimiters and simple content preserved
6. ✅ **Display Math Delimiters**: `$$...$$` - delimiters preserved
7. ✅ **Icelandic Characters**: á é í ó ú ý þ ð æ ö - all preserved
8. ✅ **Greek Letters**: α β γ δ etc. - all preserved
9. ✅ **Mathematical Symbols**: → ← ↔ ≠ ≤ ≥ etc. - all preserved
10. ✅ **Unicode Super/Subscripts**: ² ₂ etc. - all preserved
11. ✅ **Directive Opening**: `:::directive-name` - preserved on own line
12. ✅ **Directive Attributes**: `{#id}` after directive names - preserved
13. ✅ **Link Attribute Blocks**: `{url="..."}`, `{ref="..."}`, `{doc="..."}` - preserved

---

## Recommendations

### Pre-MT Protection Needed

These patterns need protection BEFORE sending to MT:

| Pattern | Protection Strategy |
|---------|---------------------|
| YAML Frontmatter | Extract and store separately, don't translate |
| Tables | Convert to placeholder, restore after MT |
| Standard markdown links | Already avoided - use `{url="..."}` format |

### Post-MT Restoration Needed

These patterns need fixing AFTER MT returns:

| Pattern | Restoration Regex |
|---------|-------------------|
| Escaped link brackets | `\\\[` → `[`, `\\\]` → `]` in link patterns |
| Escaped equation brackets | `\\\[\\\[EQ:` → `[[EQ:` |
| Directive closing on same line | Add newline before standalone `:::` |
| LaTeX escaped underscores | `\\_` → `_` within math blocks |
| LaTeX escaped brackets | `\\\[` → `[` within math blocks |

### Pipeline Modifications

```javascript
// Post-MT fixes to add to post-mt-pipeline.js

// 1. Fix escaped brackets in links
text = text.replace(/\\\[([^\]]+)\\\]\{(url|ref|doc)=/g, '[$1]{$2=');

// 2. Fix escaped equation placeholders
text = text.replace(/\\\[\\\[EQ:(\d+)\\\]\\\]/g, '[[EQ:$1]]');

// 3. Fix directive closings (add newline before ::: if preceded by content)
text = text.replace(/([^\n\s])(\s*:::)(\s*)$/gm, '$1\n$2$3');

// 4. Fix LaTeX escapes
text = text.replace(/(\$[^$]+\$)/g, (match) => {
  return match.replace(/\\_/g, '_').replace(/\\\[/g, '[').replace(/\\\]/g, ']');
});
```

### Cannot Be Fixed Automatically

These issues require manual intervention or pre-MT protection:

1. **Tables** - Line structure cannot be reliably restored after flattening
2. **YAML Frontmatter** - Structure completely destroyed
3. **Standard markdown links** - URL completely lost (use `{url="..."}` instead)

---

## Verification Commands Run

```bash
# Escaped brackets - FOUND
$ grep -c '\\\\[' mt-sample.is.md
# Result: Multiple occurrences

# Directive markers - FOUND but some malformed
$ grep -n ':::' mt-sample.is.md
# Result: Many `::: :::` merged patterns

# Equation placeholders - FOUND but escaped
$ grep -n 'EQ:' mt-sample.is.md
# Result: All escaped as \[\[EQ:\]\]
```

---

## Conclusion

The custom MT-safe syntax used in the pipeline (attribute-based links, equation placeholders, subscript/superscript notation) is working well. The main issues are:

1. **Bracket escaping** - Easily fixed in post-processing
2. **Directive line merging** - Fixable with regex
3. **Table flattening** - Requires pre-MT protection
4. **YAML frontmatter** - Requires separate handling

The decision to use `[text]{url="..."}` instead of standard `[text](url)` markdown links is **validated** - standard links are completely destroyed by MT while our custom format survives (just needs unescaping).

---

## Next Steps

1. [x] Create test file with all syntax patterns
2. [x] Run through Erlendur MT
3. [x] Analyze and document results
4. [ ] Update `post-mt-pipeline.js` with bracket unescaping
5. [ ] Add directive closing line break fix
6. [ ] Add table protection to pre-MT processing
7. [ ] Add YAML frontmatter protection to pre-MT processing
8. [ ] Re-test with updated pipeline
