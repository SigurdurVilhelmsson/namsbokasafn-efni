# New Editor Onboarding Guide

Welcome to the Námsbókasafn translation team! This guide will help you get started.

## Account Setup

### Step 1: GitHub Account
You'll need a GitHub account to log in to the translation system.

1. If you don't have one, create an account at [github.com](https://github.com)
2. Share your GitHub username with the project admin
3. Wait for confirmation that your account has been added to the team

### Step 2: First Login
1. Go to the editorial portal: `https://ritstjorn.namsbokasafn.is`
2. Click **"Innskráning"** (Login)
3. You'll be redirected to GitHub — authorize the application
4. After successful login, you'll see the main dashboard

### Step 3: Verify Your Profile
1. Your name and avatar should appear in the top-right corner
2. If anything looks wrong, contact the admin

## Understanding the Workflow

The translation pipeline has two review passes:

| Pass | Name | Purpose | Editor URL |
|------|------|---------|------------|
| Pass 1 | Linguistic Review | Fix grammar, accuracy, terminology | `/segment-editor` |
| Pass 2 | Localization | Adapt for Icelandic context (units, examples) | `/localization-editor` |

Content flows through this pipeline:
```
Machine Translation → Pass 1 Review → Faithful Translation → Pass 2 → Localized Content
```

## Pass 1: Segment Editor

The segment editor is where you'll spend most of your time. It shows individual text segments (paragraphs, headings, list items) side by side: English source on the left, Icelandic translation on the right.

### Opening the Segment Editor
1. Navigate to `/segment-editor`
2. Select a **book** (e.g., Efnafræði = Chemistry)
3. Select a **chapter**
4. You'll see a list of modules — click one to start editing

### Editing Segments

Each module shows segments in a two-column layout:
- **Left**: English source text (read-only)
- **Right**: Icelandic translation (editable)

For each segment you want to change:
1. Click on the segment to edit it
2. Make your correction in the Icelandic text
3. Select a **category** for your edit:
   - `terminology` — Term replacement or standardization
   - `accuracy` — Factual correction
   - `readability` — Grammar or clarity improvement
   - `style` — Tone or style adjustment
   - `omission` — Missing content added
4. Optionally add an **editor note** explaining your change
5. Save the edit

### Submitting for Review

When you've reviewed all segments in a module:
1. Click **"Submit for Review"**
2. Your edits go to the Head Editor for approval
3. You can track your submissions in the reviews list

### After Submission

The Head Editor will review your edits and either:
- **Approve** — Your edit is accepted
- **Reject** — With feedback explaining why
- **Mark for discussion** — Opens a discussion thread

You can participate in discussions by adding comments on individual edits.

## Pass 2: Localization Editor

After Pass 1 produces a faithful translation, Pass 2 adapts it for Icelandic students.

### Opening the Localization Editor
1. Navigate to `/localization-editor`
2. Select book and chapter
3. Click a module to start

### Three-Column Layout

The localization editor shows three columns:
- **Left**: English source (reference)
- **Middle**: Faithful Icelandic translation (Pass 1 output, read-only)
- **Right**: Localized version (editable)

### Types of Localization

| Category | Example |
|----------|---------|
| Unit conversion | Fahrenheit → Celsius, miles → km |
| Cultural adaptation | American references → Icelandic equivalents |
| Example replacement | US-specific examples → local examples |
| Formatting | Style adjustments for Icelandic conventions |
| Unchanged | Segment needs no localization |

### Saving Work
- Save individual segments as you go
- Use **"Save All"** to save all changes at once

## Terminology

### Checking Terms in the Segment Editor
The segment editor highlights terminology matches inline. When working on a module:
- Terms from the approved glossary are highlighted
- Click a highlighted term to see the approved translation
- Use the terminology lookup panel for manual searches

### Terminology Database
Visit `/terminology` to:
- Browse the full terminology database
- Search for specific terms
- Propose new terms for review

### Proposing New Terms
If you encounter a term not in the glossary:
1. Go to `/terminology`
2. Click **"Bæta við orði"** (Add term)
3. Enter the English term and your proposed Icelandic translation
4. Add notes explaining your choice
5. Submit for approval by the Head Editor

## Useful Pages

| Page | URL | Purpose |
|------|-----|---------|
| Segment Editor | `/segment-editor` | Pass 1 linguistic review |
| Localization Editor | `/localization-editor` | Pass 2 cultural adaptation |
| Terminology | `/terminology` | Term database and lookup |
| Pipeline Status | `/status` | Overall translation progress |
| Review Queue | `/review-queue` | Cross-chapter review overview (Head Editor) |
| Reviews | `/reviews` | Detailed review dashboard |
| Dashboard | `/dashboard` | Head Editor overview |
| Feedback | `/feedback` | Reader feedback form (public) |

## When You're Stuck

**"I don't know how to translate this term"**
1. Check the terminology database at `/terminology`
2. If not found, propose a new term
3. Add an editor note on the segment explaining your uncertainty

**"The machine translation is very wrong"**
- That's expected! Your job is to fix it
- Make necessary corrections — don't hesitate to rewrite entire sentences
- Categorize the edit as `accuracy` or `readability`

**"I found a structural or formatting error"**
- If it's in the translation text, fix it and categorize as `readability`
- If it's a rendering problem (broken layout, missing images), report to the admin

**"I disagree with a previous terminology decision"**
- Follow the existing decision for consistency
- Raise the issue with the Head Editor for discussion
- Don't change established terminology without approval

### Getting Help
1. **Translation questions**: Add an editor note on the segment
2. **Terminology questions**: Propose a term at `/terminology`
3. **Technical problems**: Contact the admin
4. **General questions**: Ask at the team meeting

## Tips for Success

1. **Work segment by segment** — Review each segment carefully against the English source
2. **Categorize edits** — This helps the Head Editor review faster
3. **Add notes** — Explain non-obvious changes
4. **Check terminology first** — Consistency across chapters is important
5. **Submit modules when complete** — Don't let work sit unsubmitted

## Contact

- **Admin/Head Editor**: Contact through the team channel
- **Technical Support**: File an issue on GitHub
- **Published translations**: [namsbokasafn.is](https://namsbokasafn.is)

---

**Welcome to the team!** Don't hesitate to ask questions — we're all learning together.

*Last updated: February 2026*
