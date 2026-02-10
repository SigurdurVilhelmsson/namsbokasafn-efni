# 02-machine-translated

**Status:** Unreviewed machine translation output
**Format:** Segment files (`.is.md`)
**Source:** Copied from `02-mt-output/` (Erlendur MT output)
**Editable:** No (read-only staging for MT preview)

## Purpose

This directory contains Icelandic segment files from machine translation, ready for rendering to MT preview publication track.

## Contents

- `chNN/mXXXXX-segments.is.md` - Translated segments for each module

## Workflow

```bash
# Render to MT preview track
node tools/cnxml-inject.js --chapter NN --source-dir 02-machine-translated
node tools/cnxml-render.js --chapter NN --track mt-preview
```

**Output:** `05-publication/mt-preview/chapters/NN/`

## Next Steps

When ready to begin editorial review:
1. Copy chapter to `03-editing/`
2. Make edits in server editing interface
3. When complete, move to `03-faithful-translation/`
