# Localization groundwork (batch B7, 2026-11-19): committed evidence

**🧊 FROZEN 2026-11-22.** Evidence, never status. Status lives in the active register
(`docs/plans/2026-07-21-post-item17-followup-campaign.md`, the 2026-11-14 localization side-track entry). If this
directory and the register disagree, the register wins.

- **What it is:** batch B7's read-only groundwork for the AI localization side track
  ([plan](../../docs/plans/2026-11-14-ai-localization-side-track.md), [ch01 pilot
  inventory](../../docs/plans/2026-11-14-ai-localization-pilot-ch01-inventory.md)). Part 1 sources the inventory's
  `[verify]` facts on the web; Part 2 measures what `tools/cnxml-inject.js` does with a segment `02-structure` does
  not list (the plan's §5.3 question).
- **Where it came from:** written on 2026-11-19 in the off-repo audit cache, `2026-11-19-l10n-groundwork/`, and
  promoted here on 2026-11-22 so a report can cite it. The five files at this level are **byte-identical** to the
  cache originals; nothing in them was edited. `EVIDENCE.md`'s own line "Off-repo, so not durable: promote it if a
  report will cite it" describes the note as written; this directory is that promotion.

## Files

| File | What it is | sha256 |
|---|---|---|
| `EVIDENCE.md` | The note: Part 1 (sources per inventory row), Part 2 (the inject probe and what it means) | `3782dee7…` |
| `probe-unlisted-segment.mjs` | The probe: calls the exported `buildCnxml` in memory, three arms per module, writes nothing | `c876d620…` |
| `probe-result.json` | 2026-11-19 result for m68667 (the probe's default module) | `4796c886…` |
| `probe-result-m68683.json` | 2026-11-19 result for m68683 | `7fbb910d…` |
| `probe-stderr.txt` | 2026-11-19 stderr of the m68667 run | `2ebfbee3…` |
| `rerun-2026-11-22/` | The same probe re-run on 2026-11-22 (below) | — |

## The 2026-11-22 re-run

One commit changed `tools/cnxml-inject.js` after B7 (`d65029362`, §C248's marker dialect work), so the probe was
re-run on `main`'s code at `ae833a0d1`, unchanged, with the same script (`cmp`-identical):

- `rerun-2026-11-22/probe-result-m68667.json` and `probe-result-m68683.json` are **byte-identical** to the
  2026-11-19 results (sha256 `4796c886…` and `7fbb910d…`): arm B's output equals arm A's, 0 of 3 sentinels arrive,
  the module still reads complete, and arm C's control sentinel arrives (1 of 1).
- `rerun-2026-11-22/probe-stderr-m68667.txt` is byte-identical to `probe-stderr.txt` (`2ebfbee3…`). It is a terms
  warning raised by arm C, which overwrites a para that carries a term; it is not about unlisted segments.
- `rerun-2026-11-22/probe-stderr-m68683.txt` (`7c63833e…`) has no 2026-11-19 counterpart: B7 kept no stderr for
  m68683, so whether that run printed it is not recorded. Its one line, "5 duplicate segment(s) skipped
  (first-match-wins)", is printed by `parseSegments` in `tools/cnxml-inject.js`, which the probe calls when it reads
  the segment files, before and outside the three arms. Arm B's captured stderr is 0 lines in both modules.
- `git status --porcelain` was empty before and after: nothing was written under `books/`.

Not re-measured: the `--verbose` counts of already-unreferenced segments (13 in m68667, 3 in m68683) are B7's.

## Re-running it

From the repo root, read-only:

```bash
node test-results/l10n-groundwork-2026-11-19/probe-unlisted-segment.mjs "$PWD" m68667 ch01
node test-results/l10n-groundwork-2026-11-19/probe-unlisted-segment.mjs "$PWD" m68683 ch01
```

The first argument is the repo root (the probe resolves `books/efnafraedi-2e/` and `tools/cnxml-inject.js` from
it). A changed result means inject's handling changed: compare by value, and keep arm C as the positive control.
