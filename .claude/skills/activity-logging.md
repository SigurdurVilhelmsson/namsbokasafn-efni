---
name: activity-logging
description: Log all file operations and decisions. Always active. Creates auditable trail of Claude Code actions.
---

# Activity Logging

## Purpose

Every Claude Code session that modifies files MUST log its actions. This creates:
- Auditable trail of changes
- Clear record of what needs human review
- Documentation of decisions made
- List of remaining work

## Log Location

`logs/activity-log.md` (create if doesn't exist)

## Log Entry Format

Append this format for each session:

```markdown
---

## {YYYY-MM-DD HH:MM} - {Command or Action}

**Operator:** Claude Code / {Human name if applicable}

**Files processed:**
- `{filepath}`: {action taken}
- `{filepath}`: {action taken}

**Backups created:**
- `{backup filepath}`

**Decisions made:**
- {decision}: {rationale}

**Requires human review:**
- [ ] `{filepath}`: {what needs review}
- [ ] `{filepath}`: {what needs review}

**Completed:**
- [x] {completed item}

**Next steps:**
1. {remaining work item}
2. {remaining work item}

**Session notes:**
{any relevant context, issues encountered, recommendations}

---
```

## What to Log

### Always Log:
- Files read for processing
- Files created or modified
- Backups created
- Status updates made
- Decisions about terminology, localization, tagging

### Mark for Human Review:
- All Pass 1 linguistic suggestions
- All localization recommendations
- All tagging proposals
- Any content additions or changes
- Terminology decisions

## Example Entry

```markdown
---

## 2025-01-04 14:30 - /review-chapter efnafraedi 3

**Operator:** Claude Code

**Files processed:**
- `books/efnafraedi/03-faithful/docx/ch03/3.1-pass1-SEV.docx`: Reviewed for linguistic quality
- `books/efnafraedi/03-faithful/docx/ch03/3.2-pass1-SEV.docx`: Reviewed for linguistic quality

**Backups created:**
- None (read-only review)

**Decisions made:**
- Flagged "molar mass" -> "molmassi" as correct per glossary
- Suggested rephrasing in section 3.1 paragraph 4 (awkward MT output)

**Requires human review:**
- [ ] `ch03/3.1-pass1-SEV.docx`: 3 suggested corrections (see review report)
- [ ] `ch03/3.2-pass1-SEV.docx`: 5 suggested corrections, 1 terminology question

**Next steps:**
1. Human editor reviews suggestions
2. After approval, update files.json to mark as reviewed
3. Proceed to TM update (step 6)

**Session notes:**
Section 3.2 has an unclear passage about electron configuration that may need subject matter expert review.

---
```

## Integration with Commands

Every slash command should:
1. Start by noting the action in the log
2. Record all files touched
3. List items requiring human review
4. Suggest next steps
