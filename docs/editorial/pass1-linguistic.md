# Pass 1: Linguistic Review

This guide is for editors performing Pass 1 (linguistic review) of translations.

## Goal

Create a **faithful translation** - natural, accurate Icelandic that closely represents the source text.

**Critical:** Pass 1 produces a faithful translation that has independent value. Do NOT localize - that happens in Pass 2.

---

## What to Focus On

### DO

- Fix grammar and spelling errors
- Improve word choice for clarity
- Ensure natural Icelandic sentence structure
- Check terminology consistency (refer to glossary)
- Verify technical accuracy is preserved
- Ensure the translation is readable and flows well
- Flag passages that are unclear or potentially wrong

### DO NOT

- Convert units (keep miles, Fahrenheit, etc.)
- Change cultural references (keep American examples)
- Add Icelandic examples or context
- Remove or add content
- Localize anything

---

## Why Keep It Faithful?

The faithful translation has value because:
1. It can be cited academically
2. It serves as a baseline for the localized version
3. It allows readers to compare with the source
4. It updates the Translation Memory with human-verified content

---

## Process (Markdown Workflow)

This is the primary workflow for the simplified 5-step pipeline.

1. **Get MT output** from `02-mt-output/ch##/`
2. **Open in any editor** (VS Code, Typora, or the web editor at `/editor`)
3. **Read through** the entire section once before editing
4. **Review systematically:**
   - Go section by section
   - Make direct edits to the markdown
   - Use HTML comments `<!-- QUESTION: ... -->` for questions
5. **Check terminology** against the glossary and `/terminology` page
6. **Save** to `03-faithful-translation/ch##/` with the same filename

### Web Editor Option

The server provides a web-based editor at `http://localhost:3000/editor`:
- Side-by-side English/Icelandic view
- Built-in terminology lookup
- Save with review submission workflow
- History tracking

---

## Process (DOCX Workflow - Legacy)

For chapters started before the markdown workflow was implemented:

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

---

## Terminology Questions

When you encounter a term that seems wrong or unclear:

1. Check [terminology.md](terminology.md)
2. Check the glossary in `glossary/terminology-en-is.csv`
3. Search [Íðorðabankinn](https://idord.arnastofnun.is/)
4. If still unsure, add a comment and flag for discussion

---

## Deliverables

### Markdown Workflow (Primary)
- Reviewed `.is.md` file
- Save to: `03-faithful-translation/ch##/`
- Naming: Same as input file (e.g., `5-1.is.md`)

### DOCX Workflow (Legacy)
- Reviewed .docx file with Track Changes
- Save to: `03-faithful-translation/docx/ch##/`
- Naming: `[section]-pass1-[your initials].docx`

---

## Common Mistakes

| Mistake | Why It's a Problem |
|---------|-------------------|
| Converting units | Pass 1 should be faithful to source |
| Adding examples | Changes should wait for Pass 2 |
| Forgetting Track Changes | Edits can't be incorporated into TM |
| Inconsistent terminology | Creates confusion for students |

---

## Quality Checklist

Before submitting your review:

- [ ] Track Changes enabled throughout
- [ ] All sections reviewed
- [ ] Terminology consistent with glossary
- [ ] Comments added for questions
- [ ] No localization changes made
- [ ] File saved to correct location
- [ ] Correct naming convention used

---

## Quick Reference

### Markdown (Primary)
```
□ Get MT output from 02-mt-output/
□ Review for grammar/spelling
□ Check terminology (glossary + /terminology)
□ Use HTML comments for questions
□ NO localization
□ Save to 03-faithful-translation/ch##/
```

### DOCX (Legacy)
```
□ Enable Track Changes
□ Review for grammar/spelling
□ Check terminology (glossary)
□ Add comments for questions
□ NO localization
□ Save to 03-faithful-translation/docx/ch##/
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

- [Pass 2: Localization](pass2-localization.md) - The next editorial step
- [Terminology Standards](terminology.md) - Term conventions and glossary
- [Simplified Workflow](../workflow/simplified-workflow.md) - Current 5-step pipeline

---

## Contact

For questions about the editorial process:

**Sigurður E. Vilhelmsson**
Project Lead and Translator
