---
description: Show complete pipeline overview for a book
allowed-tools: Read, Bash
---

# Pipeline Overview

Show pipeline status for $ARGUMENTS (book name, or "all").

## Process

1. Read `STATUS.md` for overview
2. Read `books/{book}/STATUS.md` for book detail
3. Scan all `chapters/ch{NN}/status.json` files
4. Aggregate statistics

## Output

```markdown
# Pipeline Status: {Book}

**Date:** {date}
**Total chapters:** {N}

## Overview

| Stage | Complete | In Progress | Not Started |
|-------|----------|-------------|-------------|
| Source | {N} | {N} | {N} |
| MT Output | {N} | {N} | {N} |
| Matecat | {N} | {N} | {N} |
| Pass 1 | {N} | {N} | {N} |
| TM Update | {N} | {N} | {N} |
| Pass 2 | {N} | {N} | {N} |
| Publication | {N} | {N} | {N} |

## Chapters Pending Human Review

| Chapter | File | Stage | Waiting Since |
|---------|------|-------|---------------|
| {ch} | {file} | {stage} | {date} |

## Ready for Next Stage

| Chapter | Current Stage | Ready For |
|---------|---------------|-----------|
| {ch} | {current} | {next} |

## Recent Activity

{Last 5 entries from activity log}

## Suggested Actions

1. {highest priority action}
2. {second priority}
3. {third priority}
```
