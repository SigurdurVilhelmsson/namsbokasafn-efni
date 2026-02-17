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

## Process (Segment Editor)

This is the primary workflow using the web-based segment editor.

1. **Open the segment editor** at `/segment-editor`
2. **Select** the book, chapter, and module you're reviewing
3. **Read through** the module once before editing to understand context
4. **Review each segment:**
   - English source is shown on the left (read-only)
   - Icelandic translation is on the right (editable)
   - Make your correction in the Icelandic text
   - Select a **category** for your edit:
     - `terminology` — Term replacement or standardization
     - `accuracy` — Factual correction
     - `readability` — Grammar or clarity improvement
     - `style` — Tone or style adjustment
     - `omission` — Missing content added
   - Optionally add an **editor note** explaining your change
   - Save the edit
5. **Check terminology** against the glossary and `/terminology` page
6. **Submit for review** when you've reviewed all segments in the module

### What Happens After Submission

- Your edits go to the Head Editor for review at `/review-queue`
- The Head Editor will **approve**, **reject** (with feedback), or **mark for discussion**
- Approved edits are applied to `03-faithful-translation/` via `applyApprovedEdits()`
- The pipeline then runs inject → render to produce updated faithful HTML

For detailed instructions on using the segment editor, see [onboarding.md](../onboarding.md).

---

## Terminology Questions

When you encounter a term that seems wrong or unclear:

1. Check [terminology.md](terminology.md)
2. Check the glossary in `glossary/terminology-en-is.csv`
3. Search [Íðorðabankinn](https://idord.arnastofnun.is/)
4. If still unsure, add an editor note on the segment and flag for discussion

---

## Deliverables

### Segment Editor (Primary)
- Segment edits submitted via the web editor
- Head Editor reviews and approves
- System writes approved edits to `03-faithful-translation/ch##/`
- Files are named: `m#####-segments.is.md` (matching module ID)

---

## Common Mistakes

| Mistake | Why It's a Problem |
|---------|-------------------|
| Converting units | Pass 1 should be faithful to source |
| Adding examples | Changes should wait for Pass 2 |
| Not categorizing edits | Makes review harder for Head Editor |
| Inconsistent terminology | Creates confusion for students |
| Submitting partial modules | All segments should be reviewed before submission |

---

## Quality Checklist

Before submitting your review:

- [ ] All segments reviewed
- [ ] Terminology consistent with glossary
- [ ] Editor notes added for non-obvious changes
- [ ] No localization changes made
- [ ] Edit categories assigned correctly

---

## Quick Reference

```
□ Open /segment-editor, select book/chapter/module
□ Review each segment for grammar/spelling/accuracy
□ Check terminology (glossary + /terminology)
□ Categorize each edit
□ Add editor notes where needed
□ NO localization
□ Submit for review when complete
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
- Add editor notes directly on segments in the segment editor
- Mark urgency in your notes: [QUESTION], [URGENT], [DISCUSS]

**For broader issues:**
- Contact the Head Editor
- Terminology discussions should be documented at `/terminology`

---

<details>
<summary>Legacy: DOCX Workflow</summary>

For chapters started before the segment editor was implemented:

1. **Receive** the .docx file from the translator
2. **Enable Track Changes** in Microsoft Word before making any edits
3. **Review systematically** with Track Changes enabled
4. **Save** reviewed file to `03-faithful-translation/docx/ch##/`
5. **Naming**: `[section]-pass1-[your initials].docx`

This workflow is no longer used for new chapters. All new work uses the segment editor.
</details>

---

## See Also

- [Onboarding Guide](../onboarding.md) - Detailed segment editor instructions
- [Pass 2: Localization](pass2-localization.md) - The next editorial step
- [Terminology Standards](terminology.md) - Term conventions and glossary
- [Simplified Workflow](../workflow/simplified-workflow.md) - Current pipeline overview

---

## Contact

For questions about the editorial process:

**Sigurður E. Vilhelmsson**
Project Lead and Translator
