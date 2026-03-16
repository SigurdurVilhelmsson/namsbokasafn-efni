# 03-faithful-translation

**Status:** Completed editorial review - faithful translation
**Format:** Per-module segment files (`.is.md`)
**Source:** Written by `applyApprovedEdits()` via the segment editor service
**Editable:** Written by pipeline tools (not manually edited)

## Purpose

Final location for human-reviewed, faithful translations. Content here has passed linguistic review and is ready for publication to the faithful track.

## Contents

- `chNN/mXXXXX-segments.is.md` - Reviewed and approved translations (one file per module)

## Workflow

Content arrives here through the segment editor web UI:

1. Editors review segments in the segment editor at `/editor`
2. Head editor approves a module's review
3. `applyApprovedEdits()` writes the reviewed segments to this directory
4. Inject + render produces faithful HTML for that module

```bash
# Render to faithful publication track
node tools/cnxml-inject.js --book efnafraedi-2e --chapter NN --track faithful
node tools/cnxml-render.js --book efnafraedi-2e --chapter NN --track faithful
```

**Output:** `05-publication/faithful/chapters/NN/`

## Quality Standard

Content in this directory represents:
- Linguistically accurate translation
- Proper terminology usage
- Academic quality suitable for citation
- Human-verified and approved

## Next Steps

When ready for localization:
1. Open the localization editor at `/localization`
2. The editor provides a 3-column view (EN | faithful IS | localized IS)
3. Adapt for Icelandic context (units, examples, cultural references)
4. Completed content is written to `04-localized-content/`
