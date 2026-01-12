# Claude Code Instructions for namsbokasafn-efni

## Repository Purpose

This repo manages the translation workflow for Icelandic OpenStax textbook translations. Content flows through 8 stages from source to publication, producing three valuable assets: faithful translations, human-verified translation memory, and localized educational content.

## Quick Start

```bash
# Check project status
/pipeline-status efnafraedi

# Check specific chapter
/chapter-status efnafraedi 3

# See available commands
/help
```

## Directory Structure

```
books/{book}/
├── 01-source/          # Original OpenStax files (READ ONLY)
├── 02-mt-output/       # Machine translation output (READ ONLY)
├── 03-faithful/        # After Pass 1 - faithful translation ★
├── 04-localized/       # After Pass 2 - localized for Iceland ★
├── 05-publication/     # Web-ready markdown files
│   ├── mt-preview/     # MT versions for immediate student use
│   ├── faithful/       # Human-reviewed versions (after Pass 1)
│   └── glossary.json   # Shared terminology
├── tm/                 # Translation memory exports ★ (READ ONLY)
├── glossary/           # Terminology files
└── chapters/ch{NN}/    # Status tracking per chapter
    ├── status.json     # Chapter-level workflow status
    └── files.json      # Per-file tracking

logs/
└── activity-log.md     # All Claude Code actions (append-only)

.claude/
├── skills/             # Auto-loaded knowledge
├── agents/             # Specialized subagents
└── commands/           # Slash commands
```

★ = Preserved valuable assets

## File Permissions

| Folder | Permission | Notes |
|--------|------------|-------|
| `01-source/` | 🔒 READ ONLY | Never modify originals |
| `02-mt-output/` | 🔒 READ ONLY | Reference only |
| `03-faithful/` | ✏️ READ + WRITE | Backup before editing |
| `04-localized/` | ✏️ READ + WRITE | Backup before editing |
| `05-publication/` | ✏️ READ + WRITE | Backup before editing |
| `tm/` | 🔒 READ ONLY | Managed by Matecat |
| `logs/` | ✏️ APPEND ONLY | Always log actions |

**Before modifying any file:** Create backup `{filename}.{YYYY-MM-DD-HHMM}.bak`

## 8-Step Workflow

| Step | Stage | Output Folder | Key Output |
|------|-------|---------------|------------|
| 1 | Source preparation | `01-source/` | Original .docx |
| 2 | Machine translation | `02-mt-output/` | MT output |
| 3-4 | Matecat alignment | `tm/` | Initial TM |
| 5 | Pass 1 (linguistic) | `03-faithful/` | Faithful translation ★ |
| 6 | TM update | `tm/` | Human-verified TM ★ |
| 7 | Pass 2 (localization) | `04-localized/` | Localized version ★ |
| 8 | Publication | `05-publication/` | Web-ready .md |

### Publication Tracks

| Track | Source | Quality | Folder |
|-------|--------|---------|--------|
| `mt-preview` | `02-mt-output/` | Unreviewed MT | `05-publication/mt-preview/` |
| `faithful` | `03-faithful/` | Pass 1 reviewed | `05-publication/faithful/` |

MT previews can be published immediately for student use while editorial review continues.

## Available Commands

| Command | Purpose |
|---------|---------|
| `/chapter-status <ch>` | Show chapter progress |
| `/pipeline-status` | Show all chapters overview |
| `/review-chapter <ch>` | Pass 1 linguistic review |
| `/localize-chapter <ch>` | Find localization opportunities |
| `/tag-for-publication <file>` | Apply Chemistry Reader tags |
| `/check-terminology <ch>` | Verify terminology |
| `/intake-source <file>` | Register new source file |

## Available Skills (Auto-loaded)

| Skill | Activates When |
|-------|----------------|
| `editorial-pass1` | Working on `03-faithful/` or grammar review |
| `localization` | Working on `04-localized/` or unit conversions |
| `chemistry-reader-tags` | Working on `05-publication/` or tagging |
| `workflow-status` | Discussing progress or status |
| `repo-structure` | Creating, moving, or saving files |
| `activity-logging` | Any file operations |
| `review-protocol` | Discussing reviews or approvals |

## Key Files to Update

| File | Purpose | When to Update |
|------|---------|----------------|
| `STATUS.md` | Overall project dashboard | Major milestones |
| `books/{book}/STATUS.md` | Book-specific progress | Chapter completions |
| `chapters/ch{NN}/status.json` | Chapter workflow tracking | Stage completions |
| `chapters/ch{NN}/files.json` | Per-file tracking | File processing |
| `logs/activity-log.md` | Action audit trail | Every session |

## Status Updates

### Via CLI (Preferred)

```bash
npm run update-status efnafraedi 3 editorialPass1 complete
npm run update-status efnafraedi 3 editorialPass1 in-progress --editor "Name"
npm run validate
```

### Stage Names

`source`, `mtOutput`, `matecat`, `editorialPass1`, `tmUpdated`, `editorialPass2`, `publication`

### Status Values

`complete`, `in-progress`, `pending`, `not-started`

## Human Review Protocol

All substantive AI outputs require human review:

| After This | Human Must |
|------------|------------|
| `/review-chapter` | Review suggestions, accept/reject |
| `/localize-chapter` | Decide which adaptations to make |
| `/tag-for-publication` | Approve proposed tags |

**Do not advance workflow stages until human has approved.**

## Activity Logging

**Every session must log actions to `logs/activity-log.md`:**

```markdown
---
## {DATE} - {Action}

**Files processed:**
- {filepath}: {action}

**Requires human review:**
- [ ] {filepath}: {what needs review}

**Next steps:**
- {remaining work}
---
```

## Naming Conventions

| Type | Format | Example |
|------|--------|---------|
| Chapter folders | `ch{NN}` (zero-padded) | `ch01`, `ch03`, `ch21` |
| Pass 1 output | `{section}-pass1-{initials}.docx` | `3.1-pass1-SEV.docx` |
| Pass 2 output | `{section}-localized.docx` | `3.1-localized.docx` |
| Localization logs | `ch{NN}-log.md` | `ch03-log.md` |
| Status files | `status.json` | Always lowercase |

## Status Symbols (for STATUS.md)

- ✅ Complete
- 🔄 In progress
- ⏳ Pending/Waiting
- ❌ Blocked
- ○ Not started

## Current Priority

**Pilot at Fjölbrautaskólinn við Ármúla, January 2026**

Focus: Chapters 1-4 faithful translations (Pass 1 complete)

## Documentation

| Document | Purpose |
|----------|---------|
| `docs/workflow.md` | Full 8-step pipeline |
| `docs/editorial-guide.md` | Pass 1 and Pass 2 instructions |
| `docs/terminology.md` | Terminology standards |
| `claude-code-user-guide.md` | How to use these tools |

## Getting Help

```
# Command help
/help

# Workflow questions
What's the next step for chapter 3?

# Terminology
What's the Icelandic term for "electron configuration"?

# Skill content
Show me the unit conversion reference from the localization skill.
```
