# 04-localization

**Status:** Work in progress - localization
**Format:** Segment files (`.is.md`)
**Source:** Initialized from `03-faithful-translation/` by the localization editor
**Editable:** Yes (working directory)

## Purpose

Working directory for adapting faithful translations to Icelandic context. This is "Pass 2" of the editorial workflow, focusing on cultural adaptation and local relevance.

## Localization Tasks

- Convert units (Fahrenheit -> Celsius, miles -> km, etc.)
- Adapt examples to Icelandic context
- Replace cultural references
- Update geographic references
- Adapt measurement conventions

## Workflow

### Initialize and edit via the localization editor:

The localization editor at `/localization` handles initialization automatically:
- Loads faithful segments from `03-faithful-translation/`
- Provides a 3-column editing interface (EN | faithful IS | localized IS)
- Saves working edits to this directory
- All edits are logged to the `localization_edits` DB table for audit trail

### Complete localization:

When all segments in a chapter are reviewed, the finalized content is promoted to `04-localized-content/`.

```bash
# Render to localized publication track
node tools/cnxml-inject.js --book efnafraedi-2e --chapter NN --track localized
node tools/cnxml-render.js --book efnafraedi-2e --chapter NN --track localized
```

## Contents

- `chNN/` - Chapter being localized (empty until localization starts)

## Status Tracking

Pipeline progress is tracked in the `chapter_pipeline_status` DB table (migration 017). View status at `/progress` or `/pipeline/efnafraedi-2e/NN`.
