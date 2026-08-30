# Chemistry editorial work, preserved before the §C82 clean-break re-MT

**These are the [LEAD]'s own Icelandic edits to chapters 1 and 3**, recovered on 2026-08-30 from
`books/efnafraedi-2e/03-faithful-translation/` and preserved here **verbatim** so the §C82
clean-break re-MT cannot take them.

## Why they are here and not where they were

The backup cron **deleted all four files from the pipeline tree on 2026-08-23** — commit
`c5f4880e` (*"auto-backup: 2026-08-23 10:00"*), 4 files, 1,100 deletions, 0 additions. The cron
mirrors production's disk, so this reflects a deletion that happened there; it is not a repository
fault. Nothing was lost — the content was still in git — but it was reachable only through
`git show`, which is not somewhere an editor looks.

That deletion landed **one day after** `docs/decisions/2026-08-22-editorial-work-survives-the-clean-break.md`
recorded these files as ch03's *only* copy.

Recovered from `c5f4880e^` and verified byte-identical to that tree.

## What each file is

| file | bytes | segments | also covered by an external docx? |
|---|---|---|---|
| `ch01/m68663-segments.is.md` | 2,786 | 11 | yes — ch01 docx, off-repo |
| `ch01/m68664-segments.is.md` | 21,335 | 72 | yes — ch01 docx, off-repo |
| `ch03/m68699-segments.is.md` | 1,381 | 3 | **no — this is the only copy** |
| `ch03/m68700-segments.is.md` | 45,029 | 282 | **no — this is the only copy** |

ch02's edits live only in an external docx with track changes, on the [LEAD]'s own machines. There
are no ch02 faithful files and there never were — that absence is expected, not a gap.

## How they are meant to be used

Side by side, by eye. The [LEAD] keeps the old edited text open in one window and the new segments
plus new MT in another, and re-applies the edits where they still apply.

⚠️ **Segment ids here are STALE and re-application does not use them.** The re-MT re-extracts, which
renumbers segment ids; `docs/decisions/2026-08-22-editorial-work-survives-the-clean-break.md`
explicitly accepts that and specifies re-application **by content, not by seg-id**. Do not diff these
against current `02-for-mt`/`02-mt-output` by marker. **Compare by prose.**

## What this directory is NOT

- ❌ **Not in the pipeline.** Nothing reads `reference-translations/` — verified 2026-08-30: 0 code
  references across `tools/`, `server/` and `scripts/`, against a control of 135 for
  `03-faithful-translation`. That is the point: `--force` and the backup cron cannot reach it.
- ❌ **Not a complete translation of either chapter.** It is only the segments that had been edited
  by the time work paused for the re-MT.
- ❌ **Not authoritative over the register.** Status lives in `docs/plans/`.

Same convention as `books/liffraedi-2e/reference-translations/ch03-human-docx/`.
