# How much of the June 2026 chemistry TMX is carried-over MT (2026-10-24)

> **Frozen measurement, 2026-10-24.** It backs the note in `books/efnafraedi-2e/tm/README.md` and the
> `humanVerifiedTM: false` correction in `books/efnafraedi-2e/metadata.json` (Skerfur plan G3.8; register §C202).
> Re-run it before quoting these numbers elsewhere.

**Question.** `tools/generate-tm.js` pairs every segment of a faithful file, and the first applied edit wrote a
whole module into that file (§C202). How many units in the three committed June files are simply the MT?

**Method.** For each unit, compare its Icelandic with the MT of the same segment id at the last commit that
touched `books/efnafraedi-2e/02-mt-output/` before the file's `creationdate`. For all three files that commit is
`f594336f2` (29 March 2026). Both sides are cleaned by `tools/lib/tm-export.cjs`, the code that wrote the TMX.

```bash
node experiments/tm-carryover-2026-10-24/measure.cjs 2026-06-23 f594336f2
```

**Results** (each per-module control found every unit's segment in the MT; `noMt` was 0 in all three runs):

| file | units | identical to the MT | differ |
|---|---:|---:|---:|
| 2026-06-13 | 3 | 1 | 2 |
| 2026-06-16 | 349 | 287 (82%) | 62 |
| 2026-06-23 | 360 | 296 (82%) | 64 |

**What it does not show.** A unit that differs changed after the MT. That is the most review it can have had, not
proof of review: a hand repair or a carried edit from elsewhere reads the same. So 82% is a floor on carried-over
MT, and the share that is human-reviewed is at most 18%.

**Trap found while writing it.** `parseSegments` returns a `Map`. Iterating it as an array of objects matched
0 of 360 units, which reads as "no MT at all". The control line on stderr is what tells the two apart.
