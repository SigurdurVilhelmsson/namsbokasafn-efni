---
description: Register a new source file and initialize tracking
allowed-tools: Read, Write, Bash
---

# Register Source File

Register source file $ARGUMENTS for tracking.

## Parse Argument

Format: "efnafraedi-2e ch03/section-3.1.docx" or full path

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

The pipeline works from the chapter's CNXML in `01-source/ch{NN}/`, not from this file.
Full instructions: `docs/workflow/simplified-workflow.md`.

1. Extract the English segments:
   `node tools/cnxml-extract.js --book {book} --chapter {N}`
2. Preview the machine translation and its cost (free):
   `node tools/api-translate.js --book {book} --chapter {N} --dry-run`
3. Translate. This is a paid run, and it refuses without exactly one glossary arm:
   `node tools/api-translate.js --book {book} --chapter {N} --no-glossary`
4. Inject the translation into CNXML:
   `node tools/cnxml-inject.js --book {book} --chapter {N}`
   (this builds the mt-preview track; after linguistic review in the segment editor,
   add `--source-dir 03-faithful-translation` for the faithful track)
5. Render to HTML:
   `node tools/cnxml-render.js --book {book} --chapter {N}`
   (mt-preview by default; add `--track faithful` for reviewed text)

Never run these on `lifraen-efnafraedi`: OpenStax has not authorised its translation.
```
