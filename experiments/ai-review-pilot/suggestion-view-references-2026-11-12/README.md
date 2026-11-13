# G1.23 suggestion-view reference numbers (2026-11-12)

`references.json` is written by `node server/scripts/suggestion-view-references.js`. It holds the
numbers G1.23's checks 1 (the drop set) and 2 (chain integrity) are compared against, computed
without loading the view's code (the script re-implements the one-match rule and hard-codes the
dropped category).

- **Date:** 2026-11-12.
- **Command:** `node server/scripts/suggestion-view-references.js --date 2026-11-12 --out experiments/ai-review-pilot/suggestion-view-references-2026-11-12`
- **Supersedes** `suggestion-view-references-2026-11-09/references.json` as the reference for G1.23's
  **check 2 only**. That directory stays frozen. Check 1 (the drop set) depends only on the logs,
  and its numbers are unchanged here.
- **Why:** G1.12 re-extracted the 83 chemistry modules that held a duplicated paragraph id
  (docs/superpowers/specs/2026-11-12-g112-duplicate-segment-ids-design.md). The English now holds
  each of those 285 ids once. The editor loader serves only occurrence 0, paired with the first
  Icelandic copy. That changes the integrity half: the three `#0` chains that failed on 2026-11-09
  now match, and the ten `#1` chains on de-duplicated ids fail, because their occurrence is no
  longer served.
- **Diff against 2026-11-09:** the keys are identical; only `date` and `integrityFailures` differ.
  `integrityFailures` is exactly these ten chains:
  - ch05 m68726 `m68726:para:fs-idm5945296#1`
  - ch05 m68726 `m68726:para:fs-idm94618544#1`
  - ch07 m68742 `m68742:para:fs-idp55819408#1`
  - ch08 m68744 `m68744:para:fs-idp204958944#1`
  - ch08 m68747 `m68747:para:fs-idm171143328#1`
  - ch08 m68747 `m68747:para:fs-idm99049568#1`
  - ch10 m68761 `m68761:para:fs-idm91556848#1`
  - ch10 m68768 `m68768:para:fs-idm44101792#1`
  - ch10 m68773 `m68773:para:fs-idp76470512#1`
  - ch21 m68851 `m68851:para:fs-idm46993968#1`
- **layer2Commit:** the last commit touching `books/efnafraedi-2e/02-mt-revised` when it ran
  (recorded in `references.json`). It is the same commit as on 2026-11-09, since G1.12 did not
  touch layer 2.
- **Rule** (from the 2026-11-02 short look record): drop every change in each
  `(module, segmentId, rulingId)` group, over all occurrences, that holds an agreement change.
- **Population:** all 23 chapter directories of `02-mt-revised` (appendices included, `ch00`
  empty), chapter metadata included. 170 logs, 33 of them empty.
- **Integrity:** the first record of each `(module, segmentId, occurrence)` chain is compared with
  the sha256 of the loader's served `is` text, before the drop.
- **Blind spot:** the integrity half measures the editor loader's served text at the commit it ran
  on. A later re-extraction changes it, so re-run the script then, with its own `--date`. The drop
  half depends only on the logs.
