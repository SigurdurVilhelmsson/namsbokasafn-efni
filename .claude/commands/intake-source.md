---
description: Register a new source file and initialize tracking
allowed-tools: Read, Write, Bash
---

# Register Source File

Register source file $ARGUMENTS for tracking.

## Parse Argument

Format: "efnafraedi ch03/section-3.1.docx" or full path

## Pre-flight Checks

1. Verify file exists in `01-source/docx/ch{NN}/`
2. If file doesn't exist, stop with error

## Process

1. Read or create `books/{book}/chapters/ch{NN}/files.json`
2. Add entry for the file:

```json
{
  "source": "01-source/docx/ch{NN}/{filename}",
  "currentStage": "source",
  "stages": {
    "source": { "complete": true, "date": "{today}" },
    "mtOutput": { "complete": false },
    "matecat": { "complete": false },
    "pass1": { "complete": false },
    "tmUpdated": { "complete": false },
    "pass2": { "complete": false },
    "publication": { "complete": false }
  },
  "pendingReview": null,
  "approved": false,
  "notes": ""
}
```

3. Log the intake in `logs/activity-log.md`

## Output

```markdown
# File Registered

**File:** {filename}
**Chapter:** {chapter}
**Date:** {date}

## Tracking Initialized

Current stage: Source (Step 1)

## Next Steps

1. Upload to malstadur.is for machine translation
2. After MT: Update with `npm run update-status {book} {chapter} mtOutput complete`
3. Then proceed to Matecat alignment
```
