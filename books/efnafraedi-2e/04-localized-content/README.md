# 04-localized-content

**Status:** Completed localization - fully adapted content
**Format:** Segment files (`.is.md`)
**Source:** Promoted from `04-localization/` after adaptation complete
**Editable:** Written by pipeline tools (not manually edited)

## Purpose

Final location for localized content adapted for Icelandic students. This represents the highest quality publication tier with both linguistic accuracy and cultural relevance.

## Contents

- `chNN/mXXXXX-segments.is.md` - Localized and culturally adapted translations

## Workflow

Content arrives here when localization is complete in the localization editor:

```bash
# Render to localized publication track
node tools/cnxml-inject.js --book efnafraedi-2e --chapter NN --track localized
node tools/cnxml-render.js --book efnafraedi-2e --chapter NN --track localized
```

**Output:** `05-publication/localized/chapters/NN/`

## Quality Standard

Content in this directory represents:
- Linguistically accurate (faithful translation)
- Culturally adapted for Iceland
- Uses Icelandic units and conventions
- Locally relevant examples
- Ready for Icelandic classroom use

## Publication Priority

The web application (namsbokasafn-vefur) will prefer content in this priority:
1. **Localized** (best) - From this directory
2. **Faithful** (good) - From `03-faithful-translation/`
3. **MT Preview** (acceptable) - From `02-mt-output/`

Students see the highest quality version available for each chapter.
