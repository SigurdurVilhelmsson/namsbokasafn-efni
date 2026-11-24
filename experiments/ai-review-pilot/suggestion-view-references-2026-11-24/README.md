# G1.23 suggestion-view reference numbers (2026-11-24)

`references.json` is written by `node server/scripts/suggestion-view-references.js`. It holds the
numbers G1.23's checks 1 (the drop set) and 2 (chain integrity) are compared against, computed
without loading the view's code (the script re-implements the one-match rule and hard-codes the
dropped category).

- **Date:** 2026-11-24.
- **Command:** `node server/scripts/suggestion-view-references.js --date 2026-11-24 --out experiments/ai-review-pilot/suggestion-view-references-2026-11-24`
- **Supersedes** `suggestion-view-references-2026-11-12/references.json` as the reference for G1.23's
  **checks 1 and 2**. That directory stays frozen, as does `suggestion-view-references-2026-11-09/`.
- **Why:** the term pass for ch08 and ch21 was re-run on 2026-11-24 and applied, replacing those two
  chapters' layer 2 (runs `20261124T103752Z-c0464db1` and `20261124T104507Z-514f3368`). Commit
  `61b1ec511` (2026-11-08) had added 8 re-requested segments to the selected overlays of m68744,
  m68852 and m68856 after the 1–2 November runs read them.
- **Diff against 2026-11-12:**
  - **Check 1 (the drop set):** the same 5 dropped changes on the same segments (one in m68746, four in
    m68856), under the re-run's own operation numbers: `ch08/m68746/002.op10` → `002.op9`;
    `ch21/m68856/004.op2`, `004.op3` → `004.op4`, `004.op5`; `ch21/m68856/006.op4`, `006.op5` →
    `006.op6`, `006.op7`. The drop totals are unchanged (100 groups, 265 changes).
  - **Check 2 (integrity):** 11 failing chains instead of 10.
    - Gone, 4 second-occurrence chains of ids G1.12 de-duplicated, because the re-runs read the
      de-duplicated English: ch08 m68744 `m68744:para:fs-idp204958944#1`, ch08 m68747
      `m68747:para:fs-idm171143328#1` and `m68747:para:fs-idm99049568#1`, ch21 m68851
      `m68851:para:fs-idm46993968#1`.
    - New, 5 `#0` chains **built on a layer-1s overlay the loader does not read**: ch08 m68744
      `m68744:para:fs-idp92007424`, ch21 m68852 `m68852:alt:fs-idp74884384-alt`,
      `m68852:para:fs-idm5999248` and `m68852:para:fs-idp1433408`, ch21 m68856
      `m68856:para:fs-idm211204656`. The term pass reads each base through `readBase`
      (`tools/lib/mt-layers.js`), which applies `02-mt-selected`; the editor loader
      (`server/services/segmentParser.js`, `loadModuleForEditing`) serves `02-mt-output` only, and the
      G1.7 design rules the loader switch out for the study
      (`docs/superpowers/specs/2026-11-19-g17-freeze-and-mt-lock-design.md`, "10-10 4.1 is ruled out").
      Measured 2026-11-24: each chain's first `beforeSha256` equals the sha256 of the overlay's
      Icelandic, and not of layer 1's text, which is still the untranslated English. So the chain is
      withheld, and editors translate those segments by hand.
  - **Other fields:** `totals.records` 3,438 → 3,444 and `kept.changes` 3,173 → 3,179 (the re-runs'
    change counts); `crossGroupDependent` loses `ch21/m68854/002.op6` and gains `002.op7` and
    `002.op12` (the re-run's numbering of that module's dependent changes).
- **layer2Commit:** the last commit touching `books/efnafraedi-2e/02-mt-revised` when it ran
  (recorded in `references.json`): `74331d0a2`, the commit that applied the ch08 and ch21 re-runs.
  The set was generated once before that commit and again after it; only `layer2Commit` differed.
- **Rule** (from the 2026-11-02 short look record): drop every change in each
  `(module, segmentId, rulingId)` group, over all occurrences, that holds an agreement change.
- **Population:** all 23 chapter directories of `02-mt-revised` (appendices included, `ch00`
  empty), chapter metadata included. 170 logs, 33 of them empty.
- **Integrity:** the first record of each `(module, segmentId, occurrence)` chain is compared with
  the sha256 of the loader's served `is` text, before the drop.
- **Blind spot:** the integrity half measures the editor loader's served text at the commit it ran
  on. A later re-extraction, or a loader that starts reading `02-mt-selected`, changes it, so re-run
  the script then, with its own `--date`. The drop half depends only on the logs.
