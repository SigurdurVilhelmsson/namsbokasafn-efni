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

## ch08 — 5 modules · ~1,355 + 610 ISK text + ~31 ISK figures

Subset: `enthalpy pair, hybridization, hybrid orbital, bonding orbital, Lewis, Lewis structure,
resonance` (`ether` withheld). **The driver HALTED here, twice, and both halts were right.**

- **Figures:** 72 enumerated — 25 translated, 45 textless recomposed, 2 photos; 55 published.
- 🔴 **m68747 FAILED inject: "1 marker survived — a `[[term:` was not converted".** This is ⑰'s
  KNOWN set, which CLAUDE.md names by module: m68700 (ch03), m68733 (ch06), **m68747 (ch08)**,
  m68844 (ch19). Remedy applied as documented: `--module m68747 --no-annotate-en` → COMPLETE,
  PERFECT fidelity. ⚠️ **ch19 will hit the same thing at m68844.**
- ⚠️ **m68745 came back with 5 segments of ENGLISH PROSE** (3 figure captions + 2 paragraphs).
  Sporadic non-translation. One per-module retry (~431 ISK) translated **5 of 5**. That is [USER]'s
  2026-09-06 rule working exactly as written.
- 📋 **m68744 `para:fs-idp92007424` — the π-bond definition — came back ENGLISH TWICE** (a second
  paid attempt, ~179 ISK, reproduced it). **It is NOT sporadic and it is NOT systematic:** a census
  over all 9 bought chapters (**8,080 segments**) finds **13** identical EN/IS prose-shaped
  segments, and **12 of the 13 are chemical-formula answer lists that are correctly identical**
  ("(a) CaS; (b) (NH₄)₂SO₄…"). This paragraph is the only true one. Injected with
  `--allow-incomplete`; **an editor translates that one paragraph** in the segment editor.
  ▶ The census is the reason this was not escalated as fundamental: 1 in 8,080 needs no re-purchase.
- **Render:** 4 page renames → redirect rows appended. Manifest `green: true`, 0 unexplained,
  0 raw `[[` in HTML, roundtrip 0 deltas outside `meaning#`.

## ch09 — 8 modules · ~1,709 + 176 ISK text + ~24 ISK figures

Subset: `enthalpy, enthalpy change, torr`. Arm confirmed `glossary-only`.
**This was the autorun DRIVER's first live execution ever** — batch A (ch00/01/02/08) finished at
12:16 and `scripts/chemistry-autorun-chapter.sh` was written at 14:03 — and it surfaced two driver
defects before it surfaced anything about the chapter. Both are recorded under "the driver" below.

- **Text:** 8/8 translated, 0 failed, 170,944 chars (~1,709 ISK). The dry run priced it at 217,519
  chars / 2,175 ISK, so billed **0.79×** the estimate.
- **Figures:** 49 enumerated — 16 translated, 3 copied-textless, 30 unresolved. `VERDICT ok`.
  2,361 billable characters (~24 ISK). The 30 unresolved are the artwork-delivery hole the tool
  itself classes as *not a failure* (figure register ①).
- 🔴 **m68754 was HELD BACK at buy time on `sup +4`, then REFUSED by inject, and the driver
  STOPPED.** All three were right, and the chain is worth stating because the class is new:
  OpenStax's figure `alt` spells formulas out for screen readers — *"Depleted superscript 238 U F
  subscript 6"* — and the MT promoted the word *superscript* into a real `[[sup:238]]` marker
  (×4) while leaving *subscript* as the Icelandic word. **An `alt` is an ATTRIBUTE and cannot
  carry `<sup>` markup**, so the injector could not resolve them and refused the module rather
  than writing it. No raw `[[` ever reached a page; step 7's page scan never had to be the last
  line of defence.
  - **Census before escalating:** those 4 markers are the ONLY bracket markers in ANY `alt`
    segment across the whole chemistry MT corpus — 9 bought chapters, no precedent. So it is
    *detected* and *sporadic*, which is [USER]'s 2026-09-06 retry condition.
  - **One paid retry (~176 ISK) cleared it**: sup delta `+4 → 0`, module-wide EN 22 → IS 22,
    0 segments differing. Non-deterministic, as the rule assumes. Inject then went 7/7 COMPLETE.
- **Inject:** 7/7 COMPLETE, manifest `green: true`, 0 unexplained, 130 perfect.
- **Render:** 5 pages renamed → 5 rows in the vefur redirect handoff. Page count 12 → 12.
- **Checks:** 0 raw `[[` in HTML **with a live positive control** (the MT file still carries 24);
  roundtrip missing = added = 20, **0 deltas outside the known `meaning#` renames**, and 0
  ATTR/TEXT diffs.
- **Premise pins bumped, each against its story, 0 new reds:** sidecars 208 → 209 and run records
  67 → 75 (ch09's 8 units); mustache 3,200 → 2,988 and carriers 75 → 69 (dialect retirement);
  ids 60,800 → 60,849, markers 30,027 → 30,076 and examined 21,976 → 22,025 — **all three the
  same +49**, which equals ch09's figure count exactly (the March MT carried 0 `alt` segments in
  all 7 modules). Four censuses, one delta: a prediction met rather than a number copied off a
  red run.

### The driver — two defects, both found on its first run, both fixed

🔴 **D1 — step 2's pre-buy reader crashed and the run walked into the PAID buy.**
`require()` on a bare relative path resolves as a MODULE NAME, not a file, so it threw
`MODULE_NOT_FOUND`. The script is `set -uo pipefail` **without** `-e`, so it printed a stack trace
and carried straight on to step 3. **A crashed check and a passing check left indistinguishable log
evidence** — CLAUDE.md's *"an absence is not an answer"*, reached through a shell idiom.
Cost this time: **0**, only because the same scan had already been run by hand for all 14 units.
Fixed three ways, because one was not enough: read the path AS a path; let a failed read exit
non-zero where a `halt` can see it; and make the documented STOP actually halt (it only *printed*).
A term [USER] has already ruled is passed in `AUTORUN_RULED_TERMS` and does not halt.

🔴 **D2 — `CH=appendices` silently became `ch00` for every VERIFICATION step.**
Measured: `printf 'ch%02d' appendices` writes *"invalid number"* to **stderr** and still prints
**`ch00`** to stdout. The buy would have been correct — `--chapter "$CH"` passes the raw string and
`cnxml-inject`, `cnxml-render` and `figure-run` all handle `appendices` via `chapterDir`'s `-1`
sentinel — but `CHD` drives the MT-arm glob, the SKIPPED/PROSE triage, the residue read and the
roundtrip check, and `PAGES` drives the raw-`[[` scan. **All of them would have run against the
preface and reported green on a unit nobody touched.** [USER] added the appendices to scope on
2026-09-20, so this was one run from firing. `source-roundtrip-check.js` was separately confirmed
to accept `appendices` (13 modules reported), so the fix is only in the driver.
