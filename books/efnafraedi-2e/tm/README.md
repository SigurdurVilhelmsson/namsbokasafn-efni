# Translation memory: `books/efnafraedi-2e/tm/`

## The three June 2026 files are not a human-verified TM (noted 2026-10-24)

`efnafraedi-2e-2026-06-13.tmx`, `efnafraedi-2e-2026-06-16.tmx` and `efnafraedi-2e-2026-06-23.tmx` were made by
`tools/generate-tm.js`, which pairs every segment of a module's faithful file (`03-faithful-translation/`) with its
English. When an editor's first edit to a module was applied, the whole module was written to that file. Its
unedited segments, which are machine translation, were then paired as if a person had reviewed them (register
§C202).

**Measured 2026-10-24.** Each unit's Icelandic was compared with the machine translation of the same segment at
`f594336f2`, the last MT commit before all three files were made. Both sides were cleaned by
`tools/lib/tm-export.cjs` (`parseSegments`, `cleanSegmentText`), so a cleaning difference cannot count as an edit.
Method and script: [`experiments/tm-carryover-2026-10-24/`](../../../experiments/tm-carryover-2026-10-24/).

| file | units | identical to the MT | differ |
|---|---:|---:|---:|
| 2026-06-13 | 3 | 1 | 2 |
| 2026-06-16 | 349 | 287 (82%) | 62 |
| 2026-06-23 | 360 | 296 (82%) | 64 |

A unit that differs is not proof of human review either: it shows only that the text changed after the MT.

**Do not cite these files as human-verified.** The fix is step 4.0 of the chemistry finish-preparation plan
(`docs/plans/2026-10-10-chemistry-finish-preparation-plan.md`): the TM pairs only segments whose review status is
`edited` or `accepted`. The faithful files these came from were moved aside on 2026-08-23 (`c5f4880e`).
