# Editorial Guide

This guide is for editors participating in the translation review process. Our workflow involves two distinct editorial passes, each with different goals.

## Understanding the Two-Pass System

We do TWO editorial passes because they produce TWO valuable outputs:

| Pass | Goal | Output |
|------|------|--------|
| **Pass 1** | Linguistic review | Faithful translation (preserved) |
| **Pass 2** | Localization | Localized version for students |

**Critical:** These passes must be kept separate. Pass 1 produces a faithful translation that has independent value. Pass 2 then builds on that to create a localized version.

---

## Pass 1: Linguistic Review

### Goal

Create a **faithful translation** - natural, accurate Icelandic that closely represents the source text.

### What to Focus On

✅ **DO:**
- Fix grammar and spelling errors
- Improve word choice for clarity
- Ensure natural Icelandic sentence structure
- Check terminology consistency (refer to glossary)
- Verify technical accuracy is preserved
- Ensure the translation is readable and flows well
- Flag passages that are unclear or potentially wrong

❌ **DO NOT:**
- Convert units (keep miles, Fahrenheit, etc.)
- Change cultural references (keep American examples)
- Add Icelandic examples or context
- Remove or add content
- Localize anything

### Why Keep It Faithful?

The faithful translation has value because:
1. It can be cited academically
2. It serves as a baseline for the localized version
3. It allows readers to compare with the source
4. It updates the Translation Memory with human-verified content

### Process

1. **Receive** the .docx file from the translator
2. **Enable Track Changes** in Microsoft Word before making any edits
   - Review → Track Changes → Track Changes
   - Verify your name is set correctly
3. **Read through** the entire section once before editing
4. **Review systematically:**
   - Go section by section
   - Make edits using Track Changes
   - Add comments for questions or flagged issues
5. **Check terminology** against the glossary
6. **Save** your reviewed file

### Using Word Track Changes

All edits must be visible:
- Deletions should show strikethrough
- Insertions should be highlighted
- Use comments (Insert → Comment) for:
  - Questions about meaning
  - Terminology suggestions
  - Notes about uncertainty

### Terminology Questions

When you encounter a term that seems wrong or unclear:

1. Check `docs/terminology.md`
2. Check the glossary in `glossary/terminology-en-is.csv`
3. Search [Íðorðabankinn](https://idord.arnastofnun.is/)
4. If still unsure, add a comment and flag for discussion

### Deliverables

- Reviewed .docx file with Track Changes
- Save to: `03-faithful/docx/ch##/`
- Naming: `[section]-pass1-[your initials].docx`

---

## Pass 2: Localization

### Goal

Adapt the faithful translation for **Icelandic secondary school students** with appropriate units, context, and examples.

### What to Change

✅ **DO:**

**Unit Conversions**
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

**Cultural Adaptations**
- American holidays → Icelandic equivalents (Thanksgiving → Jól)
- American geography → Icelandic examples where relevant
- American institutions → Icelandic equivalents if appropriate

**Local Context**
Add Icelandic relevance where it enriches understanding:
- Geothermal energy examples
- Fishing industry applications
- Icelandic geology and geography
- Local environmental issues
- Historical Icelandic scientific contributions

**Extended Exercises**
Where beneficial, add:
- Practice problems with SI units
- Problems with Icelandic context
- Additional worked examples

### What NOT to Change

❌ **DO NOT:**
- Change the core scientific content
- Remove examples (replace if needed)
- Alter the pedagogical structure
- Make changes without documenting them

### Documentation Requirement

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

### Process

1. **Start from** the faithful translation (from `03-faithful/docx/ch##/`)
2. **Create** a localization log from the template
3. **Review systematically:**
   - Identify localization opportunities
   - Make changes
   - Document each change in the log
4. **Verify** scientific accuracy after changes
5. **Save** localized file and completed log

### Deliverables

- Localized .docx file
- Save to: `04-localized/docx/ch##/`
- Naming: `[section]-localized.docx`
- Completed localization log
- Save to: `04-localized/localization-logs/`
- Naming: `ch##-log.md`

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

### Quality Standards

Before submitting your review:

**Pass 1:**
- [ ] Track Changes enabled throughout
- [ ] All sections reviewed
- [ ] Terminology consistent
- [ ] Comments added for questions
- [ ] No localization changes made
- [ ] File saved to correct location

**Pass 2:**
- [ ] All localization opportunities addressed
- [ ] Units converted correctly
- [ ] Cultural adaptations appropriate
- [ ] Localization log complete
- [ ] Scientific accuracy maintained
- [ ] File saved to correct location
- [ ] Log saved to correct location

---

## Common Pitfalls

### Pass 1 Mistakes

| Mistake | Why It's a Problem |
|---------|-------------------|
| Converting units | Pass 1 should be faithful to source |
| Adding examples | Changes should wait for Pass 2 |
| Forgetting Track Changes | Edits can't be incorporated into TM |
| Inconsistent terminology | Creates confusion for students |

### Pass 2 Mistakes

| Mistake | Why It's a Problem |
|---------|-------------------|
| Not documenting changes | Loses transparency |
| Converting incorrectly | Scientific errors |
| Removing content | May lose important information |
| Over-localizing | May distort the original content |

---

## Terminology Reference

Key chemistry terminology:

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

See `docs/terminology.md` and `glossary/terminology-en-is.csv` for the complete list.

---

## Contact

For questions about the editorial process:

**Sigurður E. Vilhelmsson**
Project Lead and Translator

---

## Appendix: Quick Reference

### Pass 1 Checklist
```
□ Enable Track Changes
□ Review for grammar/spelling
□ Check terminology (glossary)
□ Add comments for questions
□ NO localization
□ Save to 03-faithful/docx/ch##/
```

### Pass 2 Checklist
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
