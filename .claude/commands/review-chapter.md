---
description: Review a chapter for Pass 1 linguistic quality
allowed-tools: Read, Grep, Glob
---

# Review Chapter for Pass 1 Quality

Review chapter $ARGUMENTS for Pass 1 linguistic quality.

## Pre-flight Checks

1. Parse the argument (e.g., "efnafraedi 3" or "3" defaults to efnafraedi)
2. Format chapter as ch{NN}: chapter 3 -> ch03
3. Verify files exist in `books/{book}/03-faithful-translation/docx/ch{NN}/` or `02-mt-output/`
4. If no files found, inform user and stop

## Process

1. Load the editorial-pass1 skill: read `.claude/skills/editorial-pass1/SKILL.md`
2. Load terminology reference: read `.claude/skills/editorial-pass1/terminology-reference.md`
3. For each file in the chapter:
   - Read content
   - Check grammar, spelling, phrasing
   - Verify terminology against glossary
   - Note any issues
4. Generate review report

## Output

Produce a structured markdown report:

```markdown
# Pass 1 Review Report: Chapter {N}

**Book:** {book}
**Date:** {date}
**Files reviewed:** {count}

## File: {filename}

### Grammar/Spelling Issues
| Location | Issue | Suggested Fix |
|----------|-------|---------------|
| {loc} | {issue} | {fix} |

### Phrasing Improvements
| Location | Original | Suggested |
|----------|----------|-----------|
| {loc} | {original} | {improved} |

### Terminology
| Term | Status | Notes |
|------|--------|-------|
| {term} | correct/warning/unknown | {notes} |

## Summary
- Total issues: {N}
- Terminology questions: {N}

## Next Steps
1. Human editor reviews suggestions
2. Accept/reject changes in Word
3. Update files.json when approved
```

## Important

- Do NOT suggest localization changes (that's Pass 2)
- Do NOT modify files directly
- Mark all suggestions as requiring human review
- Log this session in `logs/activity-log.md`
