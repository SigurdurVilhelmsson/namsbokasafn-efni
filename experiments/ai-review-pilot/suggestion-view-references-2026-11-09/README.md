# G1.23 suggestion-view reference numbers (2026-11-09)

`references.json` is written by `node server/scripts/suggestion-view-references.js`. It holds the
numbers G1.23's checks 1 (the drop set) and 2 (chain integrity) are compared against, computed
without loading the view's code (the script re-implements the one-match rule and hard-codes the
dropped category).

- **Date:** 2026-11-09.
- **layer2Commit:** the last commit touching `books/efnafraedi-2e/02-mt-revised` when it ran
  (recorded in `references.json`).
- **Rule** (from the 2026-11-02 short look record): drop every change in each
  `(module, segmentId, rulingId)` group, over all occurrences, that holds an agreement change.
- **Supersedes** `short-look-2026-11-02/drop-set.json` only as the reference for G1.23's check 1.
  That file stays frozen.
- **Population:** all 23 chapter directories of `02-mt-revised` (appendices included, `ch00`
  empty), chapter metadata included. 170 logs, 33 of them empty.
- **Integrity:** the first record of each `(module, segmentId, occurrence)` chain is compared with
  the sha256 of the loader's served `is` text, before the drop.
- **Blind spot:** the integrity half measures the editor loader's served text at the commit it ran
  on. A later re-extraction changes it, so re-run the script then; the drop half depends only on
  the logs.
