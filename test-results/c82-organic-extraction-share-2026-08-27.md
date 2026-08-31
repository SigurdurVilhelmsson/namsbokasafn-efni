# §C82 — organic's exercises share, MEASURED after extracting all 342 modules

**Measured 2026-08-27** · **frozen; cite, do not sync** · for the [LEAD] ctx-loader decision
(§C82 L19 / L21 / L36① / the L19 amendment), runbook step 3.1(2).

## Why this exists

§C82 L59 recommended extracting organic's remaining modules **after Plan B, before the
ctx-loader decision**, on the grounds that it *"would move the exercises share from 91.2% to
~39%, which narrows §C82 L19/L21/L36① without settling it."* That **~39% was a byte-scaled
ESTIMATE, and the register says so.** This is the count.

## 🔴 HOW IT WAS RUN — NOT IN THE TRACKED TREE

`cnxml-extract.js --output-dir` is **accepted, documented and IGNORED** (§C83): it writes into
the real `books/` tree and exits 0. CLAUDE.md's prescription for exactly that is *"run it against
a throwaway copy first."*

`BOOKS_DIR` is built as `` `books/${args.book}` `` — **cwd-relative**, which is the defect
CLAUDE.md's path rule forbids and which here supplies the isolation: the tool was run with its cwd
set to `/var/tmp/c82-organic-extract`, holding only a copy of organic's `01-source`. Node resolves
the tool's own imports from the file's location, so `tools/lib/*` and `node_modules` came from the
real repo while every read and write landed in the scratch.

**CONTROL, checked before and after every stage: `git status --porcelain books/` = 0 lines.** The
tracked tree was never written to. 342 of 342 modules extracted, 0 errors, scratch discarded after
measurement.

⚠️ Segments were counted with the battery's own `parseSegmentsMit`, not a regex — CLAUDE.md
records that the spaced `<!-- SEG: … -->` form parses to an **empty list, silently**, so a
hand-rolled count can read 0 for a populated file and look like a measurement.

## The result

| | files | segments | share |
|---|---|---|---|
| **BEFORE** — committed tree (the L59 baseline) | | | |
| exercises bundles | 31 | **6,664** | **91.2%** |
| chapter-metadata | 2 | 2 | |
| modules | 17 | 643 | |
| **total** | | **7,309** | |
| **AFTER** — all 342 modules extracted | | | |
| exercises bundles | 31 | **6,664** | **38.0%** |
| chapter-metadata | 2 | 2 | |
| modules | **342** | **10,853** | |
| **total** | | **17,519** | |

✅ The BEFORE row reproduces L59's 91.2% / 7,309 / 6,664 / 643 / 2 **exactly** — that is the
control that makes the AFTER row worth reading.
✅ L59's byte-scaled ~39% lands at a measured **38.0%**.

## 🔴 THE FINDING: THE SHARE MOVED, THE EXPOSURE DID NOT

**It is the same 6,664 segments before and after.** Only the denominator grew (7,309 → 17,519).
Exercises bundles are produced by `exercise-extract.js` from `01-source/exercises/` JSON and are
not touched by `cnxml-extract` at all, so extracting modules cannot change their count.

▶ **So the extraction narrows the decision without changing what is being decided**, which is
exactly what L59 predicted and now has a mechanism: at 91.2% gating the exercises reads as
catastrophic; at 38.0% it reads as tractable. **Both are readings of the identical 6,664 segments
with no `01-source` counterpart.** A share is not an exposure.

## Per-chapter, for the decision

Exercises are the MAJORITY in only **4 of 33** chapters (ch07 51% · ch09 54% · ch13 56% ·
ch17 51%). **Every chapter has module content** (0 chapters are exercises-only). Two carry no
exercises bundle at all (`appendices`, `ch00`). Per-chapter share ranges **24%–56%**.

| chapter | modules | module segs | exercises files | exercise segs | ex share |
|---|---|---|---|---|---|
| `appendices` | 4 | 1104 | 0 | 0 | 0% |
| `ch00` | 1 | 78 | 0 | 0 | 0% |
| `ch01` | 13 | 305 | 1 | 206 | 40% |
| `ch02` | 13 | 384 | 1 | 231 | 38% |
| `ch03` | 8 | 438 | 1 | 227 | 34% |
| `ch04` | 10 | 252 | 1 | 167 | 40% |
| `ch05` | 13 | 294 | 1 | 255 | 46% |
| `ch06` | 12 | 411 | 1 | 153 | 27% |
| `ch07` | 12 | 277 | 1 | 289 | 51% |
| `ch08` | 14 | 330 | 1 | 209 | 39% |
| `ch09` | 10 | 201 | 1 | 234 | 54% |
| `ch10` | 9 | 204 | 1 | 176 | 46% |
| `ch11` | 13 | 376 | 1 | 239 | 39% |
| `ch12` | 9 | 337 | 1 | 154 | 31% |
| `ch13` | 14 | 306 | 1 | 392 | 56% |
| `ch14` | 10 | 252 | 1 | 176 | 41% |
| `ch15` | 8 | 221 | 1 | 209 | 49% |
| `ch16` | 11 | 409 | 1 | 245 | 37% |
| `ch17` | 12 | 322 | 1 | 332 | 51% |
| `ch18` | 9 | 314 | 1 | 247 | 44% |
| `ch19` | 15 | 360 | 1 | 328 | 48% |
| `ch20` | 9 | 346 | 1 | 256 | 43% |
| `ch21` | 11 | 463 | 1 | 324 | 41% |
| `ch22` | 8 | 228 | 1 | 198 | 46% |
| `ch23` | 14 | 231 | 1 | 215 | 48% |
| `ch24` | 11 | 399 | 1 | 317 | 44% |
| `ch25` | 11 | 305 | 1 | 193 | 39% |
| `ch26` | 12 | 455 | 1 | 179 | 28% |
| `ch27` | 8 | 332 | 1 | 105 | 24% |
| `ch28` | 9 | 246 | 1 | 96 | 28% |
| `ch29` | 11 | 294 | 1 | 123 | 29% |
| `ch30` | 10 | 185 | 1 | 112 | 38% |
| `ch31` | 8 | 194 | 1 | 77 | 28% |
## What this does and does not settle

- ✅ **Settled:** the magnitude. 6,664 of 17,519 organic segments (38.0%) cannot be resolved to an
  `01-source` module, and that is a count, not an estimate.
- ✅ **Settled:** gating exercises does not blind any chapter entirely — every one of the 33 has
  module content that would still be judged.
- ⬜ **NOT settled, and this is the [LEAD] call:** whether those 6,664 are gated (six BLOCKING
  checks SKIP them, and a SKIPPED blocking check is a halt) or waved through (they reach the paid
  MT ungated and the battery reports clean over them). **Neither branch is safe by default.**
- ⚠️ Related mechanism the loader must handle either way — §C82 L141: `moduleIdOfSegments` reads
  only the FIRST marker, and an exercises bundle carries many distinct first-fields, so it would
  report one exercise id for a 206-segment bundle. And `verify-extraction-coverage.js`, the gate a
  loader would be modelled on, does `missingSource++; continue` — i.e. it **waves a source-less
  unit through**. The plausible loader bug here is a false PASS over 6,664 segments, not the false
  halt one might assume.
