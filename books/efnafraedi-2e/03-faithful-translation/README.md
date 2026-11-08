# 03-faithful-translation

**Format:** Per-module segment files (`.is.md`)
**Source:** Written by `applyApprovedEdits()` via the segment editor service
**Editable:** Written by pipeline tools (not manually edited)

## Purpose

The faithful track's input: Icelandic segments from Pass 1 linguistic review that a head editor has approved. Inject + render turn a module's file here into faithful HTML.

## Contents

- `chNN/mXXXXX-segments.is.md` - Reviewed and approved translations (one file per module)

## Workflow

Content arrives here through the segment editor web UI:

1. Editors review segments in the segment editor at `/editor`
2. A head editor approves the edits
3. `applyApprovedEdits()` writes the module's segment file to this directory
4. Inject + render produces faithful HTML for that module

⚠️ **A file here is not proof that every segment in it was reviewed.** `applyApprovedEdits()`
writes the module's whole text, so segments nobody edited are written too, as machine
translation (register §C202). The translation memory inherits this — see
[`../tm/README.md`](../tm/README.md).

```bash
# Render one reviewed module to the faithful track, as the server runs it (a full-chapter faithful inject fails each unreviewed module by design; never --allow-en-fallback)
node tools/cnxml-inject.js --book efnafraedi-2e --chapter NN --module <moduleId> --source-dir 03-faithful-translation
node tools/cnxml-render.js --book efnafraedi-2e --chapter NN --module <moduleId> --track faithful
```

**Output:** `05-publication/faithful/chapters/NN/`

## History

Dated facts, not status:

- **2026-08-23** (`c5f4880e`): the backup cron removed the June 2026 faithful files from this
  directory, mirroring a deletion on the production server. They were recovered on 2026-08-30 and
  are preserved verbatim as an editing reference in
  [`../reference-translations/pre-remt-editorial-2026-08-23/`](../reference-translations/pre-remt-editorial-2026-08-23/).
  The base text is now the September 2026 machine translation.
- **2026-10-04** ([#535](https://github.com/SigurdurVilhelmsson/namsbokasafn-efni/pull/535)): chemistry's
  faithful track was retired — its rendered faithful output in `03-translated/faithful/` and
  `05-publication/faithful/` was removed.

## Quality Standard

Content in this directory is meant to be:
- Linguistically accurate translation
- Proper terminology usage
- Academic quality suitable for citation
- Human-verified and approved

## Next Steps

Localization (Pass 2) starts from these files — the localization editor refuses to open a
module that has no file here (`segmentParser.loadModuleForLocalization`):
1. Open the localization editor at `/localization`
2. The editor shows English, the faithful Icelandic from this directory (read-only) and the localized version (editable)
3. Adapt for Icelandic context (units, examples, cultural references)
4. Saved localized segments are written to `04-localized-content/`
