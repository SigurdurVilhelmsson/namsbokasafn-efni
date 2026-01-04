# Claude Code User Guide for Námsbókasafn

> **Purpose:** This guide explains how to use the Claude Code skills, subagents, and slash commands set up for the Námsbókasafn translation project.
>
> **Prerequisites:** The `.claude/` directory must be set up first. See `claude-code-setup-prompt.md`.

---

## Table of Contents

1. [Quick Start](#quick-start)
2. [Understanding the Tools](#understanding-the-tools)
3. [Slash Commands Reference](#slash-commands-reference)
4. [Workflow Examples](#workflow-examples)
5. [Skills (Automatic Features)](#skills-automatic-features)
6. [Working with the Activity Log](#working-with-the-activity-log)
7. [Human Review Process](#human-review-process)
8. [Troubleshooting](#troubleshooting)

---

## Quick Start

### Opening Claude Code

```bash
# Navigate to your repository
cd ~/path/to/namsbokasafn-efni

# Start Claude Code
claude
```

### Your First Commands

```
# See what's available
/help

# Check project status
/pipeline-status efnafraedi

# Check a specific chapter
/chapter-status efnafraedi 1
```

---

## Understanding the Tools

### Three Types of Tools

| Tool Type | How It Works | When It Activates |
|-----------|--------------|-------------------|
| **Skills** | Background knowledge Claude automatically uses | When context matches skill description |
| **Subagents** | Specialized workers for complex tasks | When invoked by commands or explicitly |
| **Slash Commands** | Explicit actions you trigger | When you type `/command` |

### Skills (Automatic)

Skills load automatically based on what you're doing:

| Skill | Activates When You... |
|-------|----------------------|
| `editorial-pass1` | Work on files in `03-faithful/` or discuss grammar review |
| `localization` | Work on files in `04-localized/` or discuss unit conversions |
| `chemistry-reader-tags` | Work on files in `05-publication/` or discuss tagging |
| `workflow-status` | Ask about project progress or status |
| `repo-structure` | Create, move, or save files |
| `activity-logging` | Perform any file operations |
| `review-protocol` | Discuss review status or approvals |

**You don't need to do anything** — Claude loads relevant skills automatically.

### Subagents (Specialized Workers)

| Subagent | Purpose |
|----------|---------|
| `terminology-checker` | Verify terms against glossary |
| `localization-reviewer` | Find localization opportunities |
| `content-tagger` | Propose pedagogical tags |

Subagents are invoked by commands or when you ask Claude to use them:

```
Use the terminology-checker to review chapter 3
```

### Slash Commands (Explicit Actions)

| Command | Purpose |
|---------|---------|
| `/review-chapter` | Pass 1 linguistic review |
| `/localize-chapter` | Find localization opportunities |
| `/tag-for-publication` | Apply Chemistry Reader tags |
| `/chapter-status` | Show chapter progress |
| `/pipeline-status` | Show overall project progress |
| `/intake-source` | Register new source files |
| `/check-terminology` | Verify terminology consistency |

---

## Slash Commands Reference

### /intake-source

**Purpose:** Register a new OpenStax source file for tracking.

**Syntax:**
```
/intake-source <book> <filepath>
```

**Examples:**
```
/intake-source efnafraedi ch03/section-3.1.docx
/intake-source efnafraedi ch05/section-5.2.docx
```

**What it does:**
1. Verifies the file exists in `01-source/docx/`
2. Creates or updates `files.json` for tracking
3. Logs the intake
4. Shows next steps

**Output:**
```
# File Registered

**File:** section-3.1.docx
**Chapter:** ch03
**Date:** 2025-01-04

## Tracking Initialized

Current stage: Source (Step 1)

## Next Steps

1. Upload to malstadur.is for machine translation
2. After MT: Update with `npm run update-status efnafraedi 3 mtOutput complete`
3. Then proceed to Matecat alignment
```

---

### /chapter-status

**Purpose:** Show detailed status for a specific chapter.

**Syntax:**
```
/chapter-status <book> <chapter>
/chapter-status <chapter>          # defaults to efnafraedi
```

**Examples:**
```
/chapter-status efnafraedi 3
/chapter-status 5
/chapter-status liffraedi 12
```

**What it shows:**
- Pipeline progress (all 8 stages)
- Per-file status if `files.json` exists
- Recent activity from logs
- Suggested next steps
- CLI commands to update status

---

### /pipeline-status

**Purpose:** Show overview of all chapters in a book.

**Syntax:**
```
/pipeline-status <book>
/pipeline-status all
```

**Examples:**
```
/pipeline-status efnafraedi
/pipeline-status all
```

**What it shows:**
- Aggregate statistics (how many chapters at each stage)
- Files pending human review
- Chapters ready for next stage
- Recent activity
- Suggested priority actions

---

### /review-chapter

**Purpose:** Review a chapter for Pass 1 linguistic quality.

**Syntax:**
```
/review-chapter <book> <chapter>
/review-chapter <chapter>          # defaults to efnafraedi
```

**Examples:**
```
/review-chapter efnafraedi 3
/review-chapter 2
```

**What it does:**
1. Loads the `editorial-pass1` skill
2. Reads files in `03-faithful/docx/ch{NN}/`
3. Checks grammar, spelling, terminology
4. Generates a review report
5. Logs the session

**Important:** This command does NOT modify files. It produces suggestions for human review.

**Sample output:**
```markdown
# Pass 1 Review Report: Chapter 3

**Book:** efnafraedi
**Date:** 2025-01-04
**Files reviewed:** 6

## File: 3.1-pass1-SEV.docx

### Grammar/Spelling Issues
| Location | Issue | Suggested Fix |
|----------|-------|---------------|
| ¶4 | "rafeindirnar" → wrong case | "rafeindinnar" |
| ¶7 | typo "efnahvarfið" | "efnahvarfið" ✓ (correct) |

### Phrasing Improvements
| Location | Original | Suggested |
|----------|----------|-----------|
| ¶2 | "Þetta er mjög mikilvægt" | "Þetta skiptir miklu máli" |

### Terminology
| Term | Status | Notes |
|------|--------|-------|
| mólmassi | ✓ | Matches glossary |
| atómmassi | ✓ | Matches glossary |
| "atomic number" | ? | Not in glossary - suggest "sætistala" |

## Summary
- Total issues: 4
- Terminology questions: 1

## Next Steps
1. Human editor reviews suggestions
2. Accept/reject changes in Word
3. Update files.json when approved
```

---

### /localize-chapter

**Purpose:** Identify localization opportunities for Pass 2.

**Syntax:**
```
/localize-chapter <book> <chapter>
/localize-chapter <chapter>
```

**Examples:**
```
/localize-chapter efnafraedi 2
/localize-chapter 4
```

**Prerequisites:** Pass 1 must be complete (files must exist in `03-faithful/`).

**What it does:**
1. Loads the `localization` skill
2. Invokes the `localization-reviewer` subagent
3. Identifies unit conversions, cultural adaptations, context opportunities
4. Generates a draft localization log

**Sample output:**
```markdown
# Localization Opportunities Report

**File:** books/efnafraedi/03-faithful/docx/ch02/
**Date:** 2025-01-04

## Unit Conversions Needed

| Section | Original | Suggested | Notes |
|---------|----------|-----------|-------|
| 2.1 ¶3 | 72°F | 22°C | Room temperature |
| 2.1 ¶5 | 5 miles | 8 km | Round appropriately |
| 2.3 ¶2 | 1 gallon | 3.8 L | Or use 4 L for cleaner number |

## Cultural Adaptations Suggested

| Section | Original Reference | Suggested Adaptation | Rationale |
|---------|-------------------|---------------------|-----------|
| 2.2 ¶1 | "Yellowstone geysers" | "Geysir og Strokkur" | Local, familiar example |
| 2.4 ¶6 | "EPA regulations" | "reglur Umhverfisstofnunar" | Icelandic equivalent |

## Icelandic Context Opportunities

| Section | Topic | Suggested Addition | Connection |
|---------|-------|-------------------|------------|
| 2.3 | Geothermal energy | Mention Hellisheiðarvirkjun | Relevant local example |
| 2.5 | Water chemistry | Reference Icelandic hot springs | Student familiarity |

## Summary

- Total unit conversions: 12
- Cultural adaptations: 3
- Context additions: 2
- Exercise opportunities: 1
```

---

### /tag-for-publication

**Purpose:** Apply Chemistry Reader pedagogical tags to content.

**Syntax:**
```
/tag-for-publication <filepath>
```

**Examples:**
```
/tag-for-publication books/efnafraedi/05-publication/chapters/3.1.md
/tag-for-publication 05-publication/chapters/2.3.md
```

**What it does:**
1. Loads the `chemistry-reader-tags` skill
2. Invokes the `content-tagger` subagent
3. Proposes tags with before/after examples
4. **Waits for your approval** before applying changes
5. Creates backup before modifying

**Sample interaction:**
```
> /tag-for-publication books/efnafraedi/05-publication/chapters/3.1.md

# Tagging Proposal

**File:** 3.1.md
**Date:** 2025-01-04

## Proposed Tags

### 1. Definition of Molar Mass (¶3)

**Type:** :::definition
**Rationale:** Key term being formally defined

**Before:**
```
**Mólmassi** er massi eins móls af efni, gefinn upp í g/mol.
```

**After:**
```
:::definition{term="Mólmassi"}
Mólmassi er massi eins móls af efni, gefinn upp í g/mol.
:::
```

### 2. Worked Example (¶7-12)

**Type:** :::example
**Rationale:** Step-by-step calculation demonstration

**Before:**
```
**Dæmi 3.1:** Reiknaðu mólmassa vatns...
[calculation steps]
```

**After:**
```
:::example
**Dæmi 3.1:** Reiknaðu mólmassa vatns

[calculation steps]
:::
```

## Summary

- Definitions: 3
- Examples: 2
- Practice problems: 1
- Key concepts: 1

---

**Apply these tags? (y/n/modify)**
```

---

### /check-terminology

**Purpose:** Verify terminology consistency in a file or chapter.

**Syntax:**
```
/check-terminology <book> <chapter>
/check-terminology <filepath>
```

**Examples:**
```
/check-terminology efnafraedi 3
/check-terminology books/efnafraedi/03-faithful/docx/ch03/3.1-pass1-SEV.docx
```

**What it does:**
1. Invokes the `terminology-checker` subagent
2. Compares all technical terms against `glossary/terminology-en-is.csv`
3. Flags inconsistencies and unknown terms

---

## Workflow Examples

### Example 1: Processing a New Chapter from Scratch

```
# 1. Register the source file
/intake-source efnafraedi ch05/chapter-05.docx

# 2. [Manual] Upload to malstadur.is, get MT output
# 3. [Manual] Align in Matecat, export TM

# 4. After Pass 1 editing is done, review the translation
/review-chapter efnafraedi 5

# 5. [Human] Review the suggestions, make corrections in Word

# 6. Update status
npm run update-status efnafraedi 5 editorialPass1 complete

# 7. Find localization opportunities
/localize-chapter efnafraedi 5

# 8. [Human] Make localization decisions, complete the log

# 9. Update status
npm run update-status efnafraedi 5 editorialPass2 complete

# 10. Tag for publication
/tag-for-publication books/efnafraedi/05-publication/chapters/5.1.md

# 11. [Human] Approve tags

# 12. Update status
npm run update-status efnafraedi 5 publication complete --version "v1.0"
```

### Example 2: Daily Workflow Check

```
# Morning: See what needs attention
/pipeline-status efnafraedi

# Check specific chapter you're working on
/chapter-status efnafraedi 3

# Review terminology before starting
/check-terminology efnafraedi 3
```

### Example 3: Preparing Content for Publication

```
# Check what's ready for publication
/pipeline-status efnafraedi

# For each chapter ready:
/tag-for-publication books/efnafraedi/05-publication/chapters/2.1.md

# Review and approve tags
y

# Check the activity log
cat logs/activity-log.md | tail -50
```

### Example 4: Checking a Specific Term

Instead of using a command, just ask Claude directly:

```
Is "sætistala" the correct Icelandic term for "atomic number"? 
Check the glossary and terminology resources.
```

Claude will automatically load the `editorial-pass1` skill and check the glossary.

### Example 5: Getting Help with Localization Decisions

```
I'm localizing chapter 4. There's a reference to "the Grand Canyon" 
as an example of geological formations. What would be a good 
Icelandic equivalent?
```

Claude will automatically load the `localization` skill and suggest appropriate alternatives with rationale.

---

## Skills (Automatic Features)

Skills activate automatically based on context. You don't need to invoke them.

### How to Tell Which Skills Are Active

Ask Claude:
```
What skills are currently loaded?
```

### Forcing a Skill to Load

If you want to ensure a skill is loaded:
```
Load the localization skill and help me with unit conversions.
```

Or reference the skill file:
```
Read .claude/skills/localization/SKILL.md and then help me 
convert the units in this paragraph.
```

### Skill-Specific Help

Each skill has supporting files with detailed guidance:

**Editorial Pass 1:**
```
Show me the grammar guidelines from the editorial-pass1 skill.
```

**Localization:**
```
What's the conversion factor for gallons to liters?
Show me the unit conversion reference.
```

**Chemistry Reader Tags:**
```
What's the syntax for a practice problem with hints?
Show me examples from the tagging skill.
```

---

## Working with the Activity Log

### Viewing the Log

```bash
# View entire log
cat logs/activity-log.md

# View recent entries
tail -100 logs/activity-log.md

# Search for specific chapter
grep -A 20 "ch03" logs/activity-log.md
```

Or ask Claude:
```
Show me the recent activity log entries for chapter 3.
```

### Understanding Log Entries

Each entry contains:

```markdown
---

## 2025-01-04 14:30 - /review-chapter efnafraedi 3

**Operator:** Claude Code

**Files processed:**
- `books/efnafraedi/03-faithful/docx/ch03/3.1-pass1-SEV.docx`: Reviewed

**Backups created:**
- None (read-only operation)

**Decisions made:**
- Flagged "sætistala" as correct term for atomic number

**Requires human review:**
- [ ] `ch03/3.1-pass1-SEV.docx`: 5 suggested corrections

**Next steps:**
1. Human editor reviews suggestions
2. Update files.json when approved

---
```

### What Gets Logged

- All file operations (read, write, create)
- All backups created
- Decisions made by Claude
- Items requiring human review
- Suggested next steps

---

## Human Review Process

### Review Checkpoints

| After This Step | Human Must |
|-----------------|------------|
| `/review-chapter` | Review suggestions, accept/reject in Word |
| `/localize-chapter` | Decide which adaptations to make |
| `/tag-for-publication` | Approve or modify proposed tags |
| Any file modification | Verify changes are correct |

### Marking Items as Reviewed

After reviewing Claude's suggestions:

1. **Update files.json** (if it exists):
   ```json
   {
     "approved": true,
     "reviewedBy": "Siggi",
     "pendingReview": null
   }
   ```

2. **Or tell Claude:**
   ```
   I've reviewed the suggestions for chapter 3 section 1. 
   Mark it as approved.
   ```

3. **Update status via CLI:**
   ```bash
   npm run update-status efnafraedi 3 editorialPass1 complete
   ```

### Finding Pending Reviews

```
/pipeline-status efnafraedi
```

Look for the "Chapters Pending Human Review" section.

Or ask:
```
What files are pending my review?
```

---

## Troubleshooting

### "File not found" Errors

**Problem:** Command can't find the file.

**Solutions:**
1. Check the chapter number format (use `3` not `ch03` in commands)
2. Verify the file exists: `ls books/efnafraedi/03-faithful/docx/ch03/`
3. Check spelling of book name (`efnafraedi` not `efnafræði`)

### Skills Not Loading

**Problem:** Claude doesn't seem to know about terminology/workflow.

**Solutions:**
1. Check skills exist: `ls .claude/skills/`
2. Explicitly load: `Read .claude/skills/editorial-pass1/SKILL.md`
3. Restart Claude Code session

### Commands Not Working

**Problem:** `/command` not recognized.

**Solutions:**
1. Check commands exist: `ls .claude/commands/`
2. Verify file has correct frontmatter (starts with `---`)
3. Try: `/help` to see available commands

### Activity Log Not Updating

**Problem:** Operations not appearing in log.

**Solutions:**
1. Check log exists: `cat logs/activity-log.md`
2. Ask Claude: `Log this session to the activity log`
3. Manually add entry if needed

### Wrong File Location

**Problem:** File saved in wrong folder.

**Solutions:**
1. Claude should warn before saving to wrong location
2. If it happens, move the file and update any tracking
3. Check `repo-structure` skill is loaded

### Terminology Conflicts

**Problem:** Glossary has different term than what Claude suggests.

**Solutions:**
1. Glossary is authoritative — use glossary term
2. If glossary seems wrong, flag for discussion
3. Add comment: `[TERM] needs review`

---

## Quick Reference Card

### Most Common Commands

| Command | What It Does |
|---------|--------------|
| `/chapter-status 3` | Show status for chapter 3 |
| `/pipeline-status efnafraedi` | Show all chapters overview |
| `/review-chapter 3` | Linguistic review of chapter 3 |
| `/localize-chapter 3` | Find localization opportunities |
| `/tag-for-publication <file>` | Apply pedagogical tags |
| `/check-terminology 3` | Verify terminology |

### Status Update CLI

```bash
npm run update-status efnafraedi <chapter> <stage> <status>

# Stages: source, mtOutput, matecat, editorialPass1, tmUpdated, editorialPass2, publication
# Statuses: complete, in-progress, pending, not-started
```

### Key Folders

| Folder | Contents | Writable? |
|--------|----------|-----------|
| `01-source/` | Original OpenStax | ❌ Never |
| `02-mt-output/` | Machine translation | ❌ Never |
| `03-faithful/` | Pass 1 output | ✅ With backup |
| `04-localized/` | Pass 2 output | ✅ With backup |
| `05-publication/` | Final markdown | ✅ With backup |
| `logs/` | Activity tracking | ✅ Always |

### Getting Help

```
# General help
/help

# Help with specific command
How do I use /review-chapter?

# Help with workflow
What's the next step for chapter 3?

# Help with terminology
What's the Icelandic term for "electron configuration"?
```

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2025-01-04 | Initial guide |

---

*This guide accompanies the Claude Code setup in `.claude/`. For setup instructions, see `claude-code-setup-prompt.md`.*
