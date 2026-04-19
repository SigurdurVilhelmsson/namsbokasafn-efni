# Editor Guide — Námsbókasafn

Welcome to the Námsbókasafn translation team! This visual guide walks you through everything you need to know to start reviewing and editing translations of OpenStax textbooks into Icelandic.

> **Also see:** [Pass 1: Linguistic Review](../editorial/pass1-linguistic.md) and [Pass 2: Localization](../editorial/pass2-localization.md) for detailed editorial guidelines.

---

## 1. Getting Started

### What is Námsbókasafn?

Námsbókasafn ("Textbook Library") is an editorial platform for translating open-source OpenStax textbooks into Icelandic. The workflow has two review passes:

| Pass | Name | Purpose |
|------|------|---------|
| **Pass 1** | Linguistic Review | Fix grammar, accuracy, and terminology in the machine translation |
| **Pass 2** | Localization | Adapt for Icelandic students: convert units, replace cultural references, add local context |

The translation pipeline flows like this:

```
Machine Translation → Pass 1 (Faithful Translation) → Pass 2 (Localized Version)
```

### Your Role as an Editor

As an editor, you can:
- Review and edit translated text segments (Pass 1)
- Localize content for Icelandic students (Pass 2)
- Look up and propose terminology
- Track your progress across chapters

### Logging In

1. Go to the editorial portal (your admin will give you the URL)
2. You will see the login page:

![Login page](screenshots/01-login.png)

3. Click **"Skrá inn með Microsoft"** (Sign in with Microsoft)
4. Sign in with your school Microsoft account
5. After successful login, you will be redirected to the dashboard

> **Note:** Your role is assigned by an administrator. If you cannot access certain features after logging in, contact your admin.

---

## 2. The Interface

### Dashboard

After logging in, you land on the home page ("Heim"). It shows a personalized greeting and a summary of your pending work.

![Home dashboard](screenshots/02-home.png)

The dashboard displays:
- **Pending tasks** assigned to you
- **Statistics** showing your editing activity (edits, reviews, submissions)
- Quick links to jump into your next task

### Navigation Sidebar

The sidebar on the left is your main navigation. The sections visible depend on your role:

**All editors see:**
- **Heim** (Home) — Your dashboard
- **Ritstjóri** (Editor) — The segment editor for Pass 1
- **Framvinda** (Progress) — Translation progress overview
- **Orðasafn** (Terminology) — The term database

**Editors with review access also see:**
- **Yfirferðir** (Reviews) — Pending review queue
- **Staðfærsla** (Localization) — The localization editor for Pass 2

**At the bottom:**
- **Prófíll** (Profile) — Your profile
- **Álit** (Feedback) — Submit feedback about translations
- **Theme toggle** — Switch between light and dark mode

---

## 3. Pass 1: Segment Editor (Linguistic Review)

The segment editor is where you will spend most of your time. It displays individual text segments (paragraphs, headings, list items) so you can review the machine translation and correct errors.

> **Goal:** Create a *faithful translation* — natural, accurate Icelandic that closely represents the source text. Do NOT localize (that happens in Pass 2).

### Selecting a Module

1. Navigate to **Ritstjóri** (Editor) in the sidebar
2. Select a **book** from the dropdown (e.g., "Efnafræði 2e" for Chemistry)
3. Select a **chapter**
4. You will see a list of modules in the chapter — click one to start editing

![Segment editor — selecting a module](screenshots/03-editor-select.png)

Each module card shows status badges:
- **EN** — English source segments exist
- **MT** — Machine translation is available

### Editing Segments

After clicking a module, the editor loads all segments in a two-column layout:

![Segment editor — editing segments](screenshots/04-editor-segments.png)

- **Left column:** English source text (read-only)
- **Right column:** Icelandic translation (editable)

The toolbar at the top lets you filter segments by status (all, edited, unedited, etc.).

**To edit a segment:**

1. Click on the Icelandic text to make it editable
2. Make your correction
3. Select a **category** for your edit:
   - **terminology** — Term replacement or standardization
   - **accuracy** — Factual correction or mistranslation fix
   - **readability** — Grammar, spelling, or clarity improvement
   - **style** — Tone or style adjustment
   - **omission** — Missing content added back
4. Optionally add an **editor note** explaining your change
5. Your edit is saved automatically

### What to Fix (and What to Leave)

| Do | Do Not |
|----|--------|
| Fix grammar and spelling | Convert units (miles, Fahrenheit, etc.) |
| Improve word choice for clarity | Change cultural references |
| Ensure natural Icelandic | Add Icelandic examples |
| Check terminology consistency | Remove or add content |
| Verify technical accuracy | Localize anything |

### Submitting for Review

When you have reviewed all segments in a module:

1. Click **"Senda til yfirferðar"** (Submit for Review)
2. Your edits go to the Head Editor for approval
3. You can track submissions via **Yfirferðir** (Reviews) in the sidebar

The Head Editor will then:
- **Approve** your edit
- **Reject** it (with feedback explaining why)
- **Mark for discussion** — opens a comment thread where you can respond

---

## 4. Pass 2: Localization Editor

After Pass 1 produces a faithful translation, Pass 2 adapts it for Icelandic students. This is a separate editor designed for cultural adaptation.

### Opening the Localization Editor

1. Navigate to **Staðfærsla** (Localization) in the sidebar
2. Select a book and chapter
3. Click a module to start

![Localization editor — module selection](screenshots/05-localization.png)

The localization editor has two tabs at the top:
- **Staðfærsluritstjóri** — The editor view
- **Yfirferð á staðfæringu** — Review queue for localization edits

There is also a **Leiðbeiningar** (Guidelines) button that expands a reference panel.

### Three-Column Layout

When a module is loaded, the editor shows three columns:
- **Left:** English source (reference)
- **Middle:** Faithful Icelandic translation from Pass 1 (read-only)
- **Right:** Localized version (editable)

### Types of Localization

Each edit is categorized:

| Category | Example |
|----------|---------|
| **unit-conversion** | Fahrenheit → Celsius, miles → km |
| **cultural-adaptation** | American holidays → Icelandic equivalents |
| **example-replacement** | US-specific examples → local context |
| **formatting** | Style adjustments for Icelandic conventions |
| **unchanged** | Segment needs no localization |

### Saving Work

- Save individual segments as you go
- Use **"Vista allt"** (Save All) to save all changes at once

---

## 5. Terminology

### The Terminology Database

Visit **Orðasafn** (Terminology) in the sidebar to browse, search, and manage translation terms.

![Terminology manager](screenshots/06-terminology.png)

The terminology page provides:
- **Search bar** — Search by English or Icelandic term
- **Filters** — Filter by subject (Chemistry, Biology, etc.), book, or status
- **Statistics** — Total terms, approved, disputed, and needs-review counts
- **Term table** — Shows English term, Icelandic translation, subject, and status

### Searching for Terms

1. Type the English or Icelandic term in the search bar
2. Optionally filter by subject or status
3. Click **"Leita"** (Search)

### Proposing New Terms

If you encounter a term not in the glossary:

1. Click **"Bæta við"** (Add)
2. Enter the English term and your proposed Icelandic translation
3. Add notes explaining your choice
4. Submit for approval by the Head Editor

### Terminology in the Segment Editor

When editing segments in Pass 1, the editor provides a terminology lookup feature. You can search for terms directly from the editing view without leaving the page.

---

## 6. Tracking Progress

The **Framvinda** (Progress) page gives you an overview of translation progress across all chapters.

![Progress dashboard](screenshots/07-progress.png)

The page shows:
- **Summary statistics** — Total modules, edited, approved, and completion percentage
- **Attention panel** — Chapters needing attention or blocked by issues
- **Chapter list** — Each chapter with a progress bar showing how far along the editing is

Click on a chapter to expand its details and see the status of individual modules.

---

## 7. Other Pages

### Profile

Visit **Prófíll** (Profile) to see your account information: name, email, role, and activity history.

![Profile page](screenshots/08-profile.png)

### Feedback

The **Álit** (Feedback) page is a public form for reporting translation errors or suggesting improvements to published content.

![Feedback form](screenshots/09-feedback.png)

You can submit feedback about:
- Translation errors in published content
- Terminology suggestions
- General comments

---

## 8. Tips and Troubleshooting

### "I don't know how to translate this term"

1. Check the terminology database at **Orðasafn**
2. If not found, propose a new term
3. Add an editor note on the segment explaining your uncertainty

### "The machine translation is very wrong"

That is expected! Your job is to fix it. Do not hesitate to rewrite entire sentences if needed. Categorize the edit as **accuracy** or **readability**.

### "I found a structural or formatting error"

- If it is in the translation text, fix it and categorize as **readability**
- If it is a rendering problem (broken layout, missing images), report it to the admin

### "I disagree with a previous terminology decision"

- Follow the existing decision for consistency
- Raise the issue with the Head Editor for discussion
- Do not change established terminology without approval

### Getting Help

1. **Translation questions** — Add an editor note on the segment
2. **Terminology questions** — Propose a term at **Orðasafn**
3. **Technical problems** — Contact the admin
4. **General questions** — Ask at the team meeting

---

## Quick Reference

| Task | Where to Go |
|------|-------------|
| Edit translations (Pass 1) | **Ritstjóri** (Editor) |
| Localize content (Pass 2) | **Staðfærsla** (Localization) |
| Look up / propose terms | **Orðasafn** (Terminology) |
| Check progress | **Framvinda** (Progress) |
| Submit feedback | **Álit** (Feedback) |
| View your profile | **Prófíll** (Profile) |

---

*Welcome to the team! Don't hesitate to ask questions — we're all learning together.*
