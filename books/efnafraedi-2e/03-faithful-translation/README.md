# 03-faithful-translation

**Status:** Completed editorial review - faithful translation
**Format:** Segment files (`.is.md`)
**Source:** Moved from `03-editing/` after review complete
**Editable:** No (finalized content)

## Purpose

Final location for human-reviewed, faithful translations. Content here has passed linguistic review and is ready for publication to the faithful track.

## Contents

- `chNN/mXXXXX-segments.is.md` - Reviewed and approved translations

## Workflow

Content arrives here after editorial review is complete:

```bash
# From editing directory after review
mv 03-editing/chNN 03-faithful-translation/

# Render to faithful publication track
node tools/cnxml-inject.js --chapter NN --source-dir 03-faithful-translation
node tools/cnxml-render.js --chapter NN --track faithful
```

**Output:** `05-publication/faithful/chapters/NN/`

## Quality Standard

Content in this directory represents:
- ✅ Linguistically accurate translation
- ✅ Proper terminology usage
- ✅ Academic quality suitable for citation
- ✅ Human-verified and approved

## Next Steps

When ready for localization:
1. Copy chapter to `04-localization/`
2. Adapt for Icelandic context (units, examples, cultural references)
3. When complete, move to `04-localized-content/`
