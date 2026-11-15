---
description: Show chapter status and suggest next steps
allowed-tools: Read, Bash
---

# Show Chapter Status

Show status for $ARGUMENTS.

## Parse Argument

Format: "efnafraedi-2e 3" or just "3" (defaults to efnafraedi-2e)

## Process

1. Read `books/{book}/chapters/ch{NN}/status.json`
2. Check `logs/activity-log.md` for recent activity

## Display

```markdown
# Chapter {N} Status: {Title}

**Book:** {book}
**Last updated:** {date}

## Pipeline Progress

| Stage | Status | Date | Notes |
|-------|--------|------|-------|
| extraction | complete/not-started | {date} | |
| mtReady | complete/not-started | {date} | |
| mtOutput | complete/not-started | {date} | |
| linguisticReview | complete/not-started | {date} | Editor: {name} |
| tmCreated | complete/not-started | {date} | Reported, not sequenced |
| injection | complete/not-started | {date} | |
| rendering | complete/not-started | {date} | |
| publication | complete/not-started | {date} | Per track: mtPreview / faithful / localized |

## Recent Activity

{Last 3 entries from activity log for this chapter}

## Suggested Next Steps

Based on current status:
1. {next action}
2. {following action}

## Commands

To validate the status files:
```bash
npm run validate
```

No command-line tool sets or advances a stage's status: `npm run update-status` was archived on
2026-03-13, and `api-translate --update-status` refuses since 2026-11-08.
```
