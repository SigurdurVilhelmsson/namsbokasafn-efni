# Pass 2: Localization

This guide is for editors performing Pass 2 (localization) of translations.

## Goal

Adapt the faithful translation for **Icelandic secondary school students** with appropriate units, context, and examples.

**Critical:** Pass 2 builds on the faithful translation from Pass 1. Every change must be documented in the localization log.

---

## What to Change

### Unit Conversions

| From | To | Notes |
|------|-----|-------|
| miles | km | |
| feet | m | |
| inches | cm | |
| pounds (mass) | kg | |
| pounds (force) | N | |
| Fahrenheit | Celsius | |
| gallons | liters | |
| ounces | grams/ml | |
| psi | Pa or bar | |

### Cultural Adaptations

- American holidays → Icelandic equivalents (Thanksgiving → Jól)
- American geography → Icelandic examples where relevant
- American institutions → Icelandic equivalents if appropriate

### Local Context

Add Icelandic relevance where it enriches understanding:
- Geothermal energy examples
- Fishing industry applications
- Icelandic geology and geography
- Local environmental issues
- Historical Icelandic scientific contributions

### Extended Exercises

Where beneficial, add:
- Practice problems with SI units
- Problems with Icelandic context
- Additional worked examples

---

## What NOT to Change

- The core scientific content
- Examples (replace if needed, don't remove)
- The pedagogical structure
- Anything without documenting the change

---

## Documentation Requirement

**Every localization change must be documented** in the localization log.

Use the template at `templates/localization-log.md`. Record:
- What was changed
- Why it was changed
- The original text
- The new text

This documentation is important because:
1. It allows review of localization decisions
2. It helps future editors understand choices
3. It creates a record for academic transparency

---

## Process

1. **Start from** the faithful translation (from `03-faithful/docx/ch##/`)
2. **Create** a localization log from the template
3. **Review systematically:**
   - Identify localization opportunities
   - Make changes
   - Document each change in the log
4. **Verify** scientific accuracy after changes
5. **Save** localized file and completed log

---

## Deliverables

- Localized .docx file
  - Save to: `04-localized/docx/ch##/`
  - Naming: `[section]-localized.docx`
- Completed localization log
  - Save to: `04-localized/localization-logs/`
  - Naming: `ch##-log.md`

---

## Common Mistakes

| Mistake | Why It's a Problem |
|---------|-------------------|
| Not documenting changes | Loses transparency |
| Converting incorrectly | Scientific errors |
| Removing content | May lose important information |
| Over-localizing | May distort the original content |

---

## Quality Checklist

Before submitting your review:

- [ ] Started from faithful translation (03-faithful/)
- [ ] All localization opportunities addressed
- [ ] Units converted correctly
- [ ] Cultural adaptations appropriate
- [ ] Localization log complete
- [ ] Scientific accuracy maintained
- [ ] .docx file saved to correct location
- [ ] Log saved to correct location

---

## Quick Reference

```
□ Start from faithful translation
□ Create localization log
□ Convert units (imperial → SI)
□ Adapt cultural references
□ Add Icelandic context where valuable
□ Document ALL changes
□ Verify scientific accuracy
□ Save .docx to 04-localized/docx/ch##/
□ Save log to 04-localized/localization-logs/
```

---

## General Guidelines

### Target Audience

- Icelandic secondary school students (16-20 years)
- Assume basic scientific literacy
- Use clear, accessible language
- Explain complex concepts on first use

### Icelandic Style

- Use standard written Icelandic
- Avoid unnecessary anglicisms
- Follow Icelandic punctuation conventions
- Use Icelandic quotation marks: „text"
- Use Icelandic number formatting (comma as decimal separator)

### Technical Writing

- Be precise with technical terms
- Maintain consistent terminology throughout
- Don't oversimplify at the expense of accuracy
- Preserve the pedagogical intent of the original

### Questions and Communication

**During review:**
- Add comments directly in the Word document
- Mark urgency: [QUESTION], [URGENT], [DISCUSS]

**For broader issues:**
- Contact the project lead
- Terminology discussions should be documented

---

## See Also

- [Pass 1: Linguistic Review](pass1-linguistic.md) - The previous editorial step
- [Terminology Standards](terminology.md) - Term conventions and glossary
- [Workflow Overview](../workflow/overview.md) - Full 8-step pipeline

---

## Contact

For questions about the editorial process:

**Sigurður E. Vilhelmsson**
Project Lead and Translator
