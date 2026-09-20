# Chemistry 2e — automated run log

**Opened 2026-09-19.** One section per chapter, written as the run goes. Companion to
[`2026-09-19-chemistry-pre-buy-review.md`](./2026-09-19-chemistry-pre-buy-review.md), which defines
what stops the run and what merely gets logged here.

**This file holds the SMALL problems** — the ones that do not need a re-purchase: terminology an
editor can fix in the segment editor, figure labels needing a human word, page renames and redirect
rows, known-benign fidelity discrepancies. A fundamental problem is not logged here and left behind:
the run STOPS and asks.

**Status is not here.** Which chapters are done lives in the campaign register's ⏩ RESUME; this file
is the record of what each chapter surfaced.

---

**Run started 2026-09-20**, after [USER] merged #494/#495/#496, deployed and exported. Verified on
`main` before the first buy: all 25 ruled headwords are in `glossary-unified.json` with the ruled
Icelandic (1,736 terms, ties 336 → 333). The two exceptions are the known §C166 pair
(`degree Celsius` / `degree centigrade`), which the export's census structurally cannot see.

## ch00 — the preface · ~108 ISK

- **Bought:** 1 module, `glossary-only` (standing `enthalpy` pair; neither word occurs, so the wire
  was effectively glossary-free). Estimated 156, billed ~108.
- **Figures:** none (0 enumerated).
- ⚠️ **Inject SKIPPED the module first time: 69 "untranslated-EN residue" segments.** Checked all
  69 by value — they are the **contributor list**: "Mark Blaser, Shasta College" and 67 more of the
  same shape, plus one byline. The MT is right to return a name verbatim, so the residue is a false
  positive of a guard that cannot tell a name from a miss. Re-injected with `--allow-incomplete`;
  the module writes `[INCOMPLETE] [PERFECT fidelity]`.
  ▶ **Not a fundamental problem and not re-purchasable** — no buy would change it. It is the shape a
  future contributor-list chapter will hit again.
- **Rendered:** `0-1-formali.html` (13,814 B), h1 *Formáli*, contributor names preserved, 0 raw `[[`
  markers. `generate-index --track mt-preview` re-run. Manifest `green: true`, 0 unexplained.

## ch01 — 7 modules · ~1,388 ISK text + ~105 ISK figures

- **Bought:** 8 units, 0 held, 0 failed. Subset `enthalpy, enthalpy change, Celsius`; `ether` (18)
  and `cell` (12) withheld as wrong-sense (all `ether` hits here are *together* / *whether*).
- **Figures:** 36 enumerated — 24 translated, 10 copied-photo, 2 copied-textless.
  ⚠️ **One figure timed out** (`CNX_Chem_01_03_PeriodicPU`: `translate-blocks.mjs exited null`,
  ETIMEDOUT). Nothing was persisted, so it stayed eligible; **one retry bought and published it**
  (~2,255 chars). That is [USER]'s 2026-09-06 rule — a detected sporadic defect is retried, not
  coded around. The driver now retries once automatically and logs it.
- **Inject:** 7/7 COMPLETE, manifest `green: true`, 0 unexplained.
- **Render:** 3 pages renamed by the re-MT → rows written to
  [`2026-09-20-vefur-chemistry-autorun-redirects.md`](./2026-09-20-vefur-chemistry-autorun-redirects.md).
  `generate-index --track mt-preview` re-run.
- **Checks:** 0 raw `[[` markers in the chapter's **HTML**.
  ⚠️ **A first census said 2 — both were bytes inside JPEGs** (`[[H:` in `…DailyChem.jpg`,
  `[[Y:` in `…Alchemist.jpg`). The census needs `--include='*.html'`; the driver now has it, with
  a comment. Same carve-out the ch06 run recorded.
- 📋 **Logged, pre-existing, NOT from this buy:** `source-roundtrip-check` reports one `textDiff`
  in **m68674** (`#fs-idp222999216`, the kilogram paragraph). The check injects a module's OWN
  ENGLISH and never reads the MT, so it is independent of any purchase and is equally true on
  `main`. ⚠️ The report truncates both sides at 70 characters, so the differing part is not
  visible in its output — diagnosing it needs a direct comparison, not the report.

## ch02 — 8 modules · ~1,753 ISK text + ~54 ISK figures

- **First chapter run end-to-end by the driver** (`run-chapter.sh`), which halts on any stop
  condition rather than pushing through. Nothing halted.
- **Bought:** subset `enthalpy, enthalpy change, group, carbonate, hydroxide`. `group → flokkur` is
  correct here (periodic-table columns, 47 segments) and is withheld from ch20, where it means a
  functional group. `ether` (28) and `hole` (14) withheld — every hit is *together*/*whether* and
  *whole*.
- **Figures:** 47 enumerated — 21 translated, 2 photos, 23 textless recomposed, 1 unresolved (no
  vector artwork; stays English). 32 published, no failed-mt.
- **Inject:** manifest `green: true`, 0 unexplained, 130 perfect.
- **Render:** 3 pages renamed → rows appended to the vefur redirect handoff.
- **Checks:** 0 raw `[[` in HTML; roundtrip missing = added = 28, **0 deltas outside the known
  `meaning#` renames**.
