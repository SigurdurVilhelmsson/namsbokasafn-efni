# 04-localization

**Status:** Work in progress - localization
**Format:** Segment files (`.is.md`)
**Source:** Copied from `03-faithful-translation/`
**Editable:** Yes (working directory)

## Purpose

Working directory for adapting faithful translations to Icelandic context. This is "Pass 2" of the editorial workflow, focusing on cultural adaptation and local relevance.

## Localization Tasks

- Convert units (Fahrenheit → Celsius, miles → km, etc.)
- Adapt examples to Icelandic context
- Replace cultural references
- Update geographic references
- Adapt measurement conventions

## Workflow

### Initialize localization on a chapter:
```bash
# Copy faithful translation to localization directory
cp -r 03-faithful-translation/chNN 04-localization/
```

### Edit via server interface:
- Server provides localization-specific editing UI
- Focus on cultural adaptation, not linguistic correction
- Changes are saved back to this directory

### Complete localization:
```bash
# Move completed chapter to localized-content
mv 04-localization/chNN 04-localized-content/

# Render to localized track
node tools/cnxml-inject.js --chapter NN --source-dir 04-localized-content
node tools/cnxml-render.js --chapter NN --track localized
```

## Contents

- `chNN/` - Chapter being localized (empty until localization starts)

## Status Tracking

Track localization progress in `chapters/chNN/status.json`:
- Stage: `localization`
- Status: `in-progress`
