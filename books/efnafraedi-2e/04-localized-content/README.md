# 04-localized-content

**Format:** Segment files (`.is.md`)
**Source:** Written by the localization editor — on save, or on a head editor's approval when the book enforces localization review (`server/services/segmentParser.js`, `server/services/localizationReviewService.js`)
**Editable:** Written by the server (not manually edited)

## Purpose

Final location for localized content adapted for Icelandic students. This represents the highest quality publication tier with both linguistic accuracy and cultural relevance.

## Contents

- `chNN/mXXXXX-segments.is.md` - Localized and culturally adapted translations

## Workflow

Content arrives here from the localization editor at `/localization`, which starts each module
from its faithful file in `03-faithful-translation/`. To render a chapter's localized track:

```bash
# --source-dir picks the segments; the localized track is detected from it.
# Do NOT run inject with `--track localized` alone: without --source-dir it reads
# 02-mt-output and writes machine translation into the localized track.
node tools/cnxml-inject.js --book efnafraedi-2e --chapter NN --source-dir 04-localized-content
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

## Reaching readers

The reader site's sync (`scripts/sync-content.js` in
[namsbokasafn-vefur](https://github.com/SigurdurVilhelmsson/namsbokasafn-vefur)) copies
`05-publication/mt-preview/` as the baseline and `05-publication/faithful/` on top of it. It
does not copy the localized track, so localized HTML does not reach readers through it.
