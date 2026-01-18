# Contributing Guide

Thank you for your interest in contributing to the Icelandic translation of OpenStax textbooks! This guide explains how to participate in the two-pass editorial workflow.

## Ways to Contribute

### 1. Editorial Review (Pass 1)
Review translations for language quality and terminology.
**Skills needed:** Native-level Icelandic, attention to detail

### 2. Localization Review (Pass 2)
Adapt translations for Icelandic context.
**Skills needed:** Native-level Icelandic, knowledge of Icelandic education system

### 3. Terminology Review
Help establish correct Icelandic scientific terminology.
**Skills needed:** Scientific background, knowledge of Icelandic terminology conventions

### 4. Technical Contributions
Help with tools and automation.
**Skills needed:** Programming (JavaScript/Node.js)

---

## Understanding the Workflow

We use a **two-pass editorial system** that produces multiple valuable outputs:

```
MT Output → Pass 1 (Linguistic) → Faithful Translation ★
                     ↓
              Updated TM ★
                     ↓
         Pass 2 (Localization) → Localized Version ★
```

★ = Preserved asset

**Why two passes?**
- Pass 1 produces a faithful translation (valuable for academic use)
- The TM becomes human-verified (valuable for NLP/MT training)
- Pass 2 produces a localized version (valuable for education)

---

## Roles

### Translator
- Responsible for initial translation using CAT tools
- Manages translation memory
- Incorporates editor feedback
- Coordinates the overall process

### Pass 1 Editor (Linguistic Review)
- Reviews for grammar, spelling, and terminology
- Ensures natural Icelandic phrasing
- Uses Track Changes in Word
- Does NOT localize

### Pass 2 Editor (Localization)
- Converts units to SI
- Adapts cultural references
- Adds Icelandic context
- Documents all changes

---

## Getting Started as an Editor

### Step 1: Contact Us
Express your interest and tell us:
- Your background (language, science, etc.)
- Which pass you're interested in (1 or 2, or both)
- Your availability

### Step 2: Get Access
You'll receive:
- Access to files for review
- Link to terminology resources
- Chapter assignment

### Step 3: Review the Guides
Read before starting:
- [Pass 1: Linguistic Review](../editorial/pass1-linguistic.md) - For linguistic review
- [Pass 2: Localization](../editorial/pass2-localization.md) - For localization
- [Terminology Standards](../editorial/terminology.md) - Term conventions
- [Workflow Overview](../workflow/overview.md) - Overall process

---

## Editor Workflow

### For Pass 1 (Linguistic Review)

1. **Get files** from the translator (Matecat output or as provided)
2. **Enable Track Changes** in Microsoft Word
3. **Review systematically:**
   - Grammar and spelling
   - Terminology (check glossary)
   - Natural phrasing
   - Technical accuracy
4. **Add comments** for questions
5. **Save** to `03-faithful/docx/ch##/`
6. **Notify** translator that review is complete

**Remember:** NO localization in Pass 1

### For Pass 2 (Localization)

1. **Get files** from `03-faithful/docx/ch##/`
2. **Create localization log** from template
3. **Make localization changes:**
   - Unit conversions
   - Cultural adaptations
   - Icelandic context
4. **Document** every change in the log
5. **Save** .docx to `04-localized/docx/ch##/`
6. **Save** log to `04-localized/localization-logs/`
7. **Notify** translator that review is complete

---

## File Locations

### Where to Get Files

| Pass | Get files from |
|------|----------------|
| Pass 1 | Provided by translator (working drafts) |
| Pass 2 | `03-faithful/docx/ch##/` |

### Where to Save Files

| Pass | Save to |
|------|---------|
| Pass 1 | `03-faithful/docx/ch##/` |
| Pass 2 (docx) | `04-localized/docx/ch##/` |
| Pass 2 (log) | `04-localized/localization-logs/` |

### Naming Convention

```
Pass 1: chapter-01-section-02-pass1-AB.docx
Pass 2: chapter-01-section-02-localized.docx
Log:    ch01-log.md
```

---

## Terminology Questions

When you encounter an unfamiliar term:

1. **Check** `docs/editorial/terminology.md`
2. **Check** `glossary/terminology-en-is.csv`
3. **Search** [Íðorðabankinn](https://idord.arnastofnun.is/)
4. **If unsure**, add a comment in the document

For terminology proposals:
- Open an issue on GitHub
- Or contact the project lead

---

## Style Guidelines

### Target Audience
- Icelandic secondary school students (16-20 years)
- Assume basic scientific literacy
- Use clear, accessible language

### Icelandic Style
- Standard written Icelandic
- Avoid unnecessary anglicisms
- Icelandic punctuation rules
- Icelandic quotation marks: „text"
- Icelandic number format (comma as decimal)

### Technical Writing
- Precise terminology
- Consistent throughout
- Clear explanations on first use

---

## Quality Checklist

### Before Submitting Pass 1

- [ ] Track Changes enabled throughout
- [ ] All sections reviewed
- [ ] Terminology consistent with glossary
- [ ] Comments added for questions
- [ ] NO localization changes
- [ ] File saved to correct location
- [ ] Correct naming convention

### Before Submitting Pass 2

- [ ] Started from faithful translation
- [ ] All units converted to SI
- [ ] Cultural references adapted
- [ ] Icelandic context added where appropriate
- [ ] Localization log complete
- [ ] Scientific accuracy maintained
- [ ] Files saved to correct locations
- [ ] Correct naming conventions

---

## Communication

### Questions During Review
- Add comments directly in the Word document
- Mark urgency: [QUESTION], [URGENT], [DISCUSS]

### General Questions
- Contact the project lead
- Open a GitHub issue

### Feedback
- Process improvement suggestions welcome
- Terminology feedback especially valued

---

## Timeline Expectations

Typical review timeline:
- **Assignment:** You receive files and deadline
- **Review period:** Usually 1-2 weeks per chapter
- **Feedback:** Within 1 week of submission
- **Revisions:** As needed

Please communicate if you need more time.

---

## Technical Contributors

If you'd like to help with the technical side:

### Tools We Need
- `strip-docx-to-txt.js` - Extract plain text for MT
- `docx-to-md.js` - Convert Word to Markdown
- `add-frontmatter.js` - Add YAML frontmatter
- `export-parallel-corpus.js` - Export TM to parallel text
- `validate-chapter.js` - Validate chapter structure

### Technology Stack
- Node.js (>=18.0.0)
- See `package.json` for dependencies

### Contributing Code
1. Fork the repository
2. Create a feature branch
3. Make changes
4. Submit a pull request

---

## Attribution

All contributors will be acknowledged in the project credits. Please let us know how you'd like to be credited.

---

## License

By contributing, you agree that your contributions will be licensed under:
- **Translations:** CC BY 4.0
- **Code/Tools:** MIT License

---

## Contact

**Sigurður E. Vilhelmsson**
Project Lead and Translator

For questions about contributing:
- Open a GitHub issue
- Or contact the project lead directly

---

## Thank You!

Your contribution helps make quality educational materials accessible to Icelandic students. Every review improves the final product and contributes to valuable resources for the Icelandic language community.
