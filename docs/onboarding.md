# New Editor Onboarding Guide

Welcome to the Námsbókasafn translation team! This guide will help you get started.

## Account Setup

### Step 1: GitHub Account
You'll need a GitHub account to log in to the translation system.

1. If you don't have one, create an account at [github.com](https://github.com)
2. Share your GitHub username with the project admin
3. Wait for confirmation that your account has been added to the team

### Step 2: First Login
1. Go to the translation portal: `https://yourserver.namsbokasafn.is`
2. Click **"Innskráning"** (Login)
3. You'll be redirected to GitHub - authorize the application
4. After successful login, you'll see the main dashboard

### Step 3: Verify Your Profile
1. Your name and avatar should appear in the top-right corner
2. If anything looks wrong, contact the admin

## Your First Assignment

### Finding Your Work
1. Go to **"Mín verkefni"** (My Work) at `/my-work`
2. You'll see:
   - **Current Task**: Your most urgent assignment
   - **Up Next**: Other pending work
   - **Quick Stats**: Your progress this week

### Understanding Assignments
When you receive an assignment, you'll see:
- **Book**: Which book (e.g., Efnafræði = Chemistry)
- **Chapter**: Chapter number
- **Stage**: What type of work (see below)
- **Due Date**: When it should be completed

### Assignment Stages

| Stage | Icelandic | What to Do |
|-------|-----------|------------|
| Linguistic Review | Yfirferð 1 | Fix grammar, check terminology |
| Localization | Yfirferð 2 | Adapt content for Icelandic context |
| Publication | Útgáfa | Final review before publishing |

## Editor Walkthrough

### Opening the Editor
1. Click **"Byrja að vinna"** on your current task
2. Or navigate to `/editor` and select book/chapter/section

### Editor Layout
- **Left panel**: Source text (English) - toggle with Ctrl+E
- **Right panel**: Your translation (Icelandic)
- **Top bar**: Save, Submit, and More menu

### Basic Workflow
1. Read the English source text
2. Review the Icelandic translation
3. Make corrections as needed
4. Save frequently (Ctrl+S or click Save)
5. Submit when done (click "Senda")

### Using the More Menu
Click **"Meira"** (More) for additional tools:
- **EN/IS tvískipting**: Toggle source view
- **Athugasemdir**: View/add comments
- **Útgáfusaga**: See version history
- **Orðasafn**: Terminology lookup
- **Flýtilyklar**: Keyboard shortcuts help

### Important Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| Ctrl+S | Save |
| Ctrl+E | Toggle EN/IS split view |
| Ctrl+T | Open terminology search |
| Ctrl+Z | Undo |
| Alt+← | Previous section (or split part) |
| Alt+→ | Next section (or split part) |
| Esc | Close any open panel |
| ? | Show all shortcuts |

## Working with Split Files

Some long sections are split into multiple parts for machine translation. You'll recognize these by the "Part X of Y" badge in the editor header.

### How Split Files Work
- Long sections (>18,000 characters) are split automatically
- Parts are named like `5-1(a)`, `5-1(b)`, etc.
- You must review **each part separately**

### Navigating Between Parts
- Use the **←** and **→** arrows next to the part badge
- Or use **Alt+←** and **Alt+→** keyboard shortcuts
- Click the **ℹ** icon to see all parts and their status

### Completing Split Sections
1. Review and submit Part 1 (a)
2. Navigate to Part 2 (b) and review
3. Continue until all parts are complete
4. The section is ready when all parts are submitted

## Terminology Guidelines

### Checking Terms
There are two ways to look up terms:

**Method 1: Double-click lookup**
1. Double-click any word in the editor
2. A terminology panel appears near your cursor
3. Click "Insert" to use the approved term
4. Click "Copy" to copy to clipboard

**Method 2: Manual search**
1. Press Ctrl+T to open terminology panel
2. Type the term you want to look up
3. Browse results and select

Use approved Icelandic terms from the glossary

### Proposing New Terms
If you encounter a term not in the glossary:
1. Click **"Bæta við orði"** in terminology panel
2. Enter the English term
3. Propose an Icelandic translation
4. Add notes explaining your choice
5. Submit for review

### Following Existing Decisions
1. Check the Decisions page (`/decisions`) for past choices
2. Look for decisions about the chapter you're working on
3. Follow established patterns for consistency

## When You're Stuck

### Common Issues and Solutions

**"I don't know how to translate this term"**
1. Check terminology database (`/terminology`)
2. Check decision log (`/decisions`)
3. If still unsure, add a comment: `<!-- SPURNING: How should "X" be translated? -->`

**"The machine translation is very wrong"**
- That's expected! Your job is to fix it
- Make necessary corrections
- Don't hesitate to rewrite entire sentences if needed

**"I found a formatting error"**
- Fix obvious formatting issues
- For structural problems, report at `/issues`

**"I disagree with a previous decision"**
- Continue following the decision for now
- Raise at next team meeting for discussion
- Don't change established terminology without approval

### Getting Help
1. **Quick questions**: Add comment in editor
2. **Terminology questions**: Propose term or check `/decisions`
3. **Technical problems**: Contact admin
4. **General questions**: Ask at weekly team meeting

## Review Process

### After You Submit
1. Your work goes to a reviewer (usually Head Editor)
2. They may:
   - **Approve**: Your work is accepted
   - **Request changes**: You'll see feedback and need to revise

### If Changes Are Requested
1. You'll see a banner on your work: "Breytingar óskast"
2. Read the reviewer's notes
3. Make the requested changes
4. Resubmit

### Review Timeline
- Aim to address requested changes within 2 days
- If you can't, communicate with the reviewer

## Tips for Success

1. **Save often** - Auto-save exists, but manual saves are safer
2. **Check terminology first** - Consistency is important
3. **Use comments** - When unsure, document your questions
4. **Communicate** - Ask if something is unclear
5. **Be consistent** - Follow established patterns

## Quick Reference

| Need | Where to Go / What to Do |
|------|--------------------------|
| My assignments | `/my-work` |
| Edit content | `/editor` |
| Check terms | Double-click word or Ctrl+T |
| See decisions | `/decisions` |
| Report issues | `/issues` |
| Navigate split parts | Alt+← and Alt+→ |
| Toggle source view | Ctrl+E |
| Show all shortcuts | Press ? |
| Get help | Ask admin or team meeting |

## Contact

- **Admin/Head Editor**: [Contact through team channel]
- **Technical Support**: File issue on GitHub
- **Weekly Team Meeting**: [Day and time]

---

**Welcome to the team!** Don't hesitate to ask questions - we're all learning together.

*Last updated: January 2026*
