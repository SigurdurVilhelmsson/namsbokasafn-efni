# 03-editing

**Status:** Work in progress - editorial review
**Format:** Segment files (`.is.md`)
**Source:** Copied from `02-machine-translated/`
**Editable:** Yes (working directory)

## Purpose

Working directory for linguistic review of machine-translated content. Editors make corrections, improve terminology, and ensure faithful translation quality.

## Workflow

### Initialize editing on a chapter:
```bash
# Copy MT content to editing directory
cp -r 02-machine-translated/chNN 03-editing/
```

### Edit via server interface:
- Server provides web-based editing UI for segments
- Editors work on individual segment files
- Changes are saved back to this directory

### Complete review:
```bash
# Move completed chapter to faithful-translation
mv 03-editing/chNN 03-faithful-translation/

# Render to faithful track
node tools/cnxml-inject.js --chapter NN --source-dir 03-faithful-translation
node tools/cnxml-render.js --chapter NN --track faithful
```

## Contents

- `chNN/` - Chapter being edited (empty until editing starts)

## Status Tracking

Track editing progress in `chapters/chNN/status.json`:
- Stage: `linguisticReview`
- Status: `in-progress`
