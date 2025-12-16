# Contributing Guide

Thank you for helping with the Icelandic translation of OpenStax textbooks! This guide explains how to participate in the editorial review process.

## Roles

### Translator
- Responsible for initial translation using CAT tools
- Builds and maintains translation memory
- Incorporates editor feedback

### Editor
- Reviews translated text for quality
- Checks terminology consistency
- Ensures readability and accuracy
- Uses track changes in Word

## Editor Workflow

### 1. Getting Files for Review

Files ready for review are located in:
```
books/{book}/03-tm-translated/docx/
```

You will receive a notification (email or message) when files are ready for review with:
- Chapter number and title
- Deadline for review
- Any specific areas of concern

### 2. Opening the File

1. Download the .docx file from the repository
2. Open in Microsoft Word (or compatible application)
3. **Enable Track Changes** before making any edits:
   - Word: Review → Track Changes → Track Changes
   - Make sure your name is set correctly in Word preferences

### 3. Making Edits

#### What to Edit
- Spelling and grammar errors
- Awkward phrasing or unclear sentences
- Incorrect terminology (refer to terminology.md)
- Technical inaccuracies
- Inconsistent style

#### What NOT to Edit
- Formatting (fonts, spacing, etc.)
- Image placement
- Equation formatting
- Headers and footers

#### Using Comments
Add comments (Review → New Comment) for:
- Questions about meaning or intent
- Suggestions that need discussion
- Terminology questions
- Notes about uncertainty

### 4. Saving Reviewed Files

Save your reviewed file to:
```
books/{book}/04-editor-review/docx/
```

Use this naming convention:
```
chapter-XX-section-YY-reviewed-[your-initials].docx
```

Example: `chapter-01-section-02-reviewed-AB.docx`

### 5. Reporting Issues

For each chapter you review, please note:
- Number of changes made (approximate)
- Any terminology questions or suggestions
- Areas that were particularly difficult
- Suggestions for future chapters

## Terminology Questions

If you're unsure about a term:

1. Check `docs/terminology.md` for established translations
2. Check the glossary: `books/{book}/06-publication/glossary.json`
3. Search [Íðorðabankinn](https://idord.arnastofnun.is/)
4. If still unsure, add a comment in the document and flag it

## Style Guidelines

### Target Audience
- Icelandic secondary school students (16-20 years)
- Assume basic scientific literacy
- Use clear, accessible language

### Icelandic Style
- Use standard Icelandic (bókmál)
- Avoid unnecessary anglicisms
- Follow Icelandic punctuation rules
- Use Icelandic quotation marks: „text"

### Technical Writing
- Be precise with technical terms
- Explain concepts clearly on first use
- Maintain consistent terminology throughout

## Communication

### Questions During Review
- Add comments directly in the Word document
- For urgent questions, contact the project lead

### Feedback
- Feedback on the process is always welcome
- Suggestions for improving workflow are appreciated

## Timeline

Typical review timeline:
- You receive files for review
- Review deadline: usually 1-2 weeks
- Feedback incorporation: 1 week after your review
- Final review if significant changes: as needed

## Checklist for Editors

Before submitting your review:

- [ ] Track Changes is enabled and shows your edits
- [ ] All changes are made using Track Changes
- [ ] Comments are added for questions/discussions
- [ ] Terminology is consistent with terminology.md
- [ ] File is saved in the correct location
- [ ] File is named correctly with your initials
- [ ] Major issues are noted separately

## Thank You!

Your contribution helps make quality educational materials accessible to Icelandic students. Every edit improves the final product!
