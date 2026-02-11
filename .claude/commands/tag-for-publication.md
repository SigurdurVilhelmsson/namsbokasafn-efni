---
description: Apply Chemistry Reader tags to publication content
allowed-tools: Read, Write
---

# Apply Chemistry Reader Tags

Apply pedagogical tags to $ARGUMENTS.

## Pre-flight Checks

1. Verify input file is in `04-localized-content/` or `05-publication/`
2. If file is in earlier stage, warn: "Content should be localized before tagging"
3. Confirm output location: `books/{book}/05-publication/chapters/`

## Process

1. Load tagging skill: read `.claude/skills/chemistry-reader-tags/SKILL.md`
2. Read all supporting files in that skill folder
3. Invoke the content-tagger subagent
4. Show proposed changes
5. Wait for user approval before applying

## Approval Flow

```
1. Show tagging proposal
2. Ask: "Apply these tags? (y/n/modify)"
3. If yes:
   - Create backup of original
   - Apply tags
   - Log changes
   - Mark as pending review
4. If no:
   - Exit without changes
5. If modify:
   - Ask what to change
   - Revise proposal
   - Return to step 2
```

## Important

- Always show proposals before applying
- Create backup before any modification
- Use mhchem for chemistry notation
- Log all changes in activity log
