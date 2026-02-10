# 04-localized-content

**Status:** Completed localization - fully adapted content
**Format:** Segment files (`.is.md`)
**Source:** Moved from `04-localization/` after adaptation complete
**Editable:** No (finalized content)

## Purpose

Final location for localized content adapted for Icelandic students. This represents the highest quality publication tier with both linguistic accuracy and cultural relevance.

## Contents

- `chNN/mXXXXX-segments.is.md` - Localized and culturally adapted translations

## Workflow

Content arrives here after localization is complete:

```bash
# From localization directory after completion
mv 04-localization/chNN 04-localized-content/

# Render to localized publication track
node tools/cnxml-inject.js --chapter NN --source-dir 04-localized-content
node tools/cnxml-render.js --chapter NN --track localized
```

**Output:** `05-publication/localized/chapters/NN/`

## Quality Standard

Content in this directory represents:
- ✅ Linguistically accurate (faithful translation)
- ✅ Culturally adapted for Iceland
- ✅ Uses Icelandic units and conventions
- ✅ Locally relevant examples
- ✅ Ready for Icelandic classroom use

## Publication Priority

The web application (namsbokasafn-vefur) will prefer content in this priority:
1. **Localized** (best) - From this directory
2. **Faithful** (good) - From `03-faithful-translation/`
3. **MT Preview** (acceptable) - From `02-machine-translated/`

Students see the highest quality version available for each chapter.
