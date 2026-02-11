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

We use an **Extract-Inject-Render pipeline** with two editorial passes:

```
CNXML → Extract → EN Segments → MT → Review → Inject → Render → HTML
         Step 1     Step 1b    Step 2  Step 3   Step 5a  Step 5b
```

**Key insight:** Linguistic review happens BEFORE TM creation, so the TM is human-verified from the start.

### Assets Produced

| Asset | Step | Location |
|-------|------|----------|
| Faithful Translation ★ | Step 3 | `03-faithful-translation/` |
| Human-Verified TM ★ | Step 4 | `tm/` |
| Localized Version ★ | Pass 2 | `04-localized-content/` |

★ = Preserved asset

**Why this order?**
- Pass 1 produces a faithful translation (valuable for academic use)
- The TM is created from human-verified content (valuable for NLP/MT)
- Pass 2 (optional) produces a localized version (valuable for education)

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
- [Simplified Workflow](../workflow/simplified-workflow.md) - Current 5-step process
- [Pass 1: Linguistic Review](../editorial/pass1-linguistic.md) - For linguistic review
- [Pass 2: Localization](../editorial/pass2-localization.md) - For localization
- [Terminology Standards](../editorial/terminology.md) - Term conventions

---

## Editor Workflow

### For Pass 1 (Linguistic Review)

#### Segment Review Workflow

1. **Get MT output** from `02-mt-output/ch##/` (segment files: `mNNNNN-segments.is.md`)
2. **Open** in any text editor (VS Code, Typora, or web editor at `/editor`)
3. **Review systematically:**
   - Grammar and spelling
   - Terminology (check glossary and `/terminology` page)
   - Natural phrasing
   - Technical accuracy
4. **Add comments** using `<!-- QUESTION: ... -->` for questions
5. **Save** to `03-faithful-translation/ch##/`
6. **Notify** translator that review is complete

**Remember:** NO localization in Pass 1

### For Pass 2 (Localization)

#### Using Auto-Detection (Recommended)

1. **Open** the localization review UI at `/localization-review`
2. **Select** your section - system scans for opportunities
3. **Review suggestions** for unit conversions, cultural references
4. **Accept or modify** each suggestion
5. **Add custom changes** not auto-detected
6. **Submit** for approval

#### Manual Workflow

1. **Get files** from `03-faithful-translation/ch##/`
2. **Make localization changes** directly in segment files
3. **Document** every change in the localization log
4. **Save** to `04-localized-content/ch##/`

---

## File Locations

| Pass | Get files from | Save to |
|------|----------------|---------|
| Pass 1 | `02-mt-output/ch##/` | `03-faithful-translation/ch##/` |
| Pass 2 | `03-faithful-translation/ch##/` | `04-localized-content/ch##/` |

### Naming Convention

Segment files use module-based naming:
```
MT Output:    m68724-segments.is.md (in 02-mt-output/)
Pass 1:       m68724-segments.is.md (in 03-faithful-translation/)
Pass 2:       m68724-segments.is.md (in 04-localized-content/)
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

- [ ] All segments reviewed
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
- Add comments using `<!-- QUESTION: ... -->` in segment files
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

### Active Tools
- `cnxml-extract.js` - Extract segments from CNXML
- `cnxml-inject.js` - Inject translations into CNXML structure
- `cnxml-render.js` - Render CNXML to semantic HTML
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
