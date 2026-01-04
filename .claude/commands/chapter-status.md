---
description: Show chapter status and suggest next steps
allowed-tools: Read, Bash
---

# Show Chapter Status

Show status for $ARGUMENTS.

## Parse Argument

Format: "efnafraedi 3" or just "3" (defaults to efnafraedi)

## Process

1. Read `books/{book}/chapters/ch{NN}/status.json`
2. Read `books/{book}/chapters/ch{NN}/files.json` if exists
3. Check `logs/activity-log.md` for recent activity

## Display

```markdown
# Chapter {N} Status: {Title}

**Book:** {book}
**Last updated:** {date}

## Pipeline Progress

| Stage | Status | Date | Notes |
|-------|--------|------|-------|
| 1. Source | complete/in-progress/pending | {date} | |
| 2. MT Output | complete/in-progress/pending | {date} | |
| 3-4. Matecat | complete/in-progress/pending | {date} | |
| 5. Pass 1 | complete/in-progress/pending | {date} | Editor: {name} |
| 6. TM Update | complete/in-progress/pending | {date} | |
| 7. Pass 2 | complete/in-progress/pending | {date} | |
| 8. Publication | complete/in-progress/pending | {date} | Version: {ver} |

## File Status (if files.json exists)

| File | Current Stage | Pending Review | Approved |
|------|---------------|----------------|----------|
| {file} | {stage} | {yes/no} | {yes/no} |

## Recent Activity

{Last 3 entries from activity log for this chapter}

## Suggested Next Steps

Based on current status:
1. {next action}
2. {following action}

## Commands

To update status:
```bash
npm run update-status {book} {chapter} {stage} {status}
```
```
