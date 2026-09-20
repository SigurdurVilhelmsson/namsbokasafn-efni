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

## ch10 — 8 modules · ~2,252 + 587 ISK text + ~56 ISK figures

Subset: `enthalpy, enthalpy change, hole, dispersion force, Lewis structure, Lewis`, with
`AUTORUN_RULED_TERMS="hydrogen bonding"` ([USER]'s 2026-09-20 ruling, passed explicitly so the
new pre-buy halt waives it by name rather than ignoring it silently). Arm 8 of 8 `glossary-only`.

**`DONE=ok` — the first end-to-end run of the driver, and it SELF-HEALED without intervention.**

- **Text:** 8/8, 225,218 chars (~2,252 ISK) — dry run priced it at 2,772, so billed **0.81×**.
- **Figures:** 82 enumerated — 40 translated, 3 photo, 10 textless, 29 unresolved; 44 published;
  5,564 billable characters (~56 ISK).
- ⚠️ **m68773 HELD BACK on `1 id-reattach mismatch`, a DIFFERENT class from ch09's.** The MT
  invented five extra `[[term:]]` markers in one paragraph (`expected 3, got 8`), so B4-D11's
  count-guard refused to reattach ids onto them and **left that segment in English** —
  `m68773:para:fs-idp1330336`, 1,018 characters of prose. Inject then SKIPPED the module.
  ▶ **The driver's own English-prose triage caught it and did the one paid retry ([USER]
  2026-09-06, ~587 ISK), and the module went COMPLETE.** Verified by value afterwards: the
  segment is no longer identical to its English.
- **Inject:** 7/7 COMPLETE, 0 skipped, 0 failed; manifest `green: true`, 0 unexplained, 130 perfect.
  Manifest mtime checked against this run's inject log — it is this run's green, not a stale one.
- **Render:** 5 pages renamed → **6** redirect rows (see the chain-collapse note in the redirect
  handoff). Page count 12 → 12.
- **Checks:** 0 raw `[[` in 12 pages with the control fired; roundtrip 24 = 24, 0 outside
  `meaning#`.
- **Premise pins:** sidecars 209 → 210, run records 75 → 83 (ch10's 8 units); mustache 2,988 →
  2,772, carriers 69 → 65; ids/markers/examined **all +82**, which equals ch10's figure count
  exactly. **Second chapter, same law** — the delta is the chapter's figure count, because the
  March MT carried no `alt` segments at all. 0 new reds.

### The driver — v3, after an adversarial audit

Five independent lenses over the v1 script, each finding adversarially verified: **38 findings
survived, 11 were refuted.** v3 fixes the blocking and serious ones. Nearly all were ONE SHAPE —
*a step that did not run, reporting a reassuring null*:

| fix | what it was |
|---|---|
| inject exit code + **manifest freshness** | `translation-errors.json` is BOOK-level and inject writes it last, so an inject that died wholesale left the PREVIOUS chapter's `green: true` in place and the run printed `DONE=ok` over a re-render of the old vintage |
| buy must **prove** it was held back | every non-zero buy exit was asserted to be the benign held-back case; a buy killed mid-chapter (this box OOM-killed four paid runs on 2026-09-12) left most modules on the March MT, and the prose triage **cannot see them** (a segment absent from the old MT is skipped by its own equality test) so they fell through to `--allow-incomplete` — untranslated English injected and rendered |
| arm check **ALL, not ANY** | a set-union over the directory passed as soon as ONE module carried the right arm |
| re-sweep FAILED after a retry | the retry re-injected into the SAME log the FAILED sweep had already read, so SKIPPED → retry → FAILED escaped the halt entirely |
| figure verdict | `FIG=$?` was captured and never read, and the bucket regex named 6 of 11 outcomes — omitting `failed-compose`, `failed-publish`, `failed-sidecar` |
| roundtrip gates on the tool's own verdict | it counted PRINTED lines, which the tool CAPS per module, and never read ATTR/TEXT/BUILD FAILED |
| the raw-marker control **executes** | v1 printed "(control: the MT file has them)" without running anything, and an empty page directory scored as clean |
| `--retried` sentinels cleared per run | a re-run silently forwent the retry it was entitled to |
| `AUTORUN_SKIP_BUY=1` | the buy is unconditionally `--force`, so every resume re-bought the whole chapter (~1,700–3,100 ISK to repair one module) |
| octal + `appendices` | `printf 'ch%02d' 08` is an octal error and `appendices` yields `ch00` |

⚠️ **Five of the 38 said the pre-buy gate still fails open. It does not — they audited an
intermediate copy, not the installed one.** The installed form is `FLAGS=$(node …) || halt`;
the audited one was `X=$(cmd 2>&1 >file); X=$(cat file)`, **which discards the exit status**.
▶ *Concurrence is not corroboration when everyone inherited the same artifact* — verified by
running the installed gate against a missing file and a malformed one: both halt.

### 📋 Logged for [USER], surfaced by ch10's push — COMPOSED FIGURE WEIGHT

GitHub warned on `CNX_Chem_10_01_KMTPhases1_IS.svg` at **53.5 MB** (its recommended maximum is
50 MB; the **hard** limit is 100 MB, so nothing is blocked today — measured: 11 figures over
20 MB, 2 over 50 MB, **0 over 90 MB**).

**Measured, and the ratio is the point:** the `01-source` artwork is a **0.2 MB JPG**; the composed
`_IS.svg` is **53 MB** — about **250×**. It carries **0 embedded rasters**, so this is not a
resolution bug: it is a genuine vector rendering of a particle diagram, thousands of circles
becoming thousands of paths. Vector wins on quality and loses badly on bytes for this figure class.

⚠️ **PRE-EXISTING, NOT INTRODUCED BY ch10** — chemistry ch03 already carries a 23.8 MB
`exocytosis` figure from an earlier buy, so already-prepared chapters have this too.

▶ **Why it needs [USER], not a session decision: the cost falls on the READER.** A student on a
phone downloads 53 MB for one figure. That is a delivery/display trade-off of the same family as
§C162 (pipeline figures displaying at ~0.48× the English JPG's width), and the options differ in
kind — rasterise the worst offenders at publication, keep vector and accept the weight, or serve a
raster with the vector as a click-through.
⚠️ **Each figure is stored TWICE** (`media/` and the publication copy), so the repo cost is double
the number above. `.git` is 4.5 GB, which CLAUDE.md already records as an accepted cost.
**Not a stop. The autorun continues.**

## ch11 — 7 units · the first run KILLED MID-BUY, and what that cost to learn

**The first ch11 run died at 19:05 with its parent session, mid-`m68782`.** Not OOM: `dmesg`
carries **0** `killed process` / `out of memory` lines, and the box had 7.7 GB available. The
buy is **atomic per module** — `m68782` wrote nothing, so the tree held 3 re-bought modules
(`m68776`, `m68778`, `m68781`, ~393 ISK, 39,262 chars) and 3 still on the March/June MT.

▶ **Resumed per-module rather than by re-running the driver.** The driver's buy is
unconditionally `--force`, so a plain re-run would have re-bought all 7 units at ~1,813 ISK,
of which ~393 ISK was already paid. Four `--module … --force --glossary-only "$SUBSET"` buys
priced at **~1,420 ISK** (33,182 + 81,837 + 26,925 + 55 = 141,999 chars), and
181,261 − 39,262 = 141,999 confirms the whole-chapter and per-module estimates agree.
⚠️ **A bare non-`--force` run is NOT the resume**: `mtRunDecision` skips on FILE EXISTENCE, and
the three unbought modules all *have* files — the March ones. It would have skipped all six.
**Hand-repair check first (CLAUDE.md): `git log` on the three `.is.md` files shows only
`feat(pipeline)` commits — no hand repairs to lose.**

### 🔴 The gate that was not on the resume path — fixed in `f1c6b1e00`

**`AUTORUN_SKIP_BUY=1` bypassed the MT-arm check.** The ALL-not-ANY arm check — hardened by the
v3 adversarial audit precisely to catch a partial buy — lived inside the `else` of the buy step.
So the resume path, **the one you reach for BECAUSE a buy has already gone wrong**, never reached
it. On this exact tree a SKIP_BUY resume would have spent the figure money, then injected,
rendered and indexed 3 modules of March full-glossary MT under `DONE=ok`, every other gate
silent — the prose triage cannot see them, because a segment absent from the old MT is skipped
by its own equality test.

**Verified against the live partial state, before the buy destroyed it:**

| chapter | arm | verdict |
|---|---|---|
| ch11 | 3 of 6 | 🔴 STOP, exit 3 |
| ch09 | 8 of 8 | pass |
| ch10 | 8 of 8 | pass |
| ch12 | 0 of 8 | 🔴 STOP |

▶ **A halting gate proves nothing without the passing half** — `3 of 6 → HALT` alone is equally
consistent with a gate that always halts. ▶ **And the control was PERISHABLE**: the partial state
that proves the gate works is destroyed by the buy that repairs it, so the fix had to come first.
▶ **The durable shape: a gate's SCOPE is a separate property from its LOGIC.** This one's logic
had already survived a five-lens adversarial audit; its scope had not been asked about at all.
Same shape as the paid-MT hook recorded above — written, tested against the form it was written
for, documented as blocking, inert against the only command anyone would type.

⚠️ **Detach long paid runs.** Relaunched under `setsid nohup … &` so a session death cannot take
the buy with it, judged by a terminal `EXIT=`/`ALLDONE` marker in the log rather than by any
wrapper's exit code.

### ch11 outcome — `DONE=ok`

- **Text:** 7 units. Billed **110,456 chars (~1,104 ISK)** on the resume against a 1,420 estimate
  (**0.78x**, in line with ch09's 0.79x), plus ~393 ISK list for the three the killed run had
  already bought. Chapter ~**1,497 ISK** against the 1,813 list estimate.
- **Figures:** 46 enumerated — 20 translated, 11 photo, 9 textless, 6 unresolved; **21 published**;
  3,357 billable characters (~34 ISK). `VERDICT ok`.
- **Inject:** 6 modules COMPLETE, manifest `green=true`, 0 unexplained, 130 perfect.
- **Render:** 3 pages renamed → 3 redirect rows (added=3, changed=0, removed=0; no chain collapse).
- **Checks:** 0 raw `[[` in 11 pages; roundtrip 5 modules differ, non-`meaning#` listed 0,
  ATTR/TEXT/BUILD rows 0.

### 🔴 The free-checks POSITIVE CONTROL was broken, failed open, and the log said it had fired

The run printed `scripts/chemistry-autorun-chapter.sh: line 307: [: books/…/m68778-segments.is.md:
integer expected` **and scored `DONE=ok` anyway.**

`grep -claE` passes both `-c` and `-l`; **`-l` wins**, so `CONTROL` was a FILENAME.
`[ "<filename>" -eq 0 ]` errors *and exits non-zero*, so the `&& halt` never ran — and the next
line printed `(control fired: the MT source carries them)` **unconditionally**.

▶ **This is the v1 defect in a new costume.** v1 printed the reassurance without executing
anything; v3 executed something broken and printed it anyway. **A control that cannot fail is not
a control, and a hardcoded "control fired" is a lie the log tells you.** Fixed in `dbfb1873b`,
verified four ways — positive (ch11 = 293, equal to the hand-sum), negative (marker-free dir
halts), the old form (returns a filename, halt never fires), and **the detector itself**: 11 clean
pages → 0 flagged, plant ONE marker → 1 flagged. That last one is what retroactively rescues the
greens: re-checked under a working control, **ch09 (328), ch10 (277) and ch11 (293) all have a
non-zero control, pages present, and zero markers leaked. All three stand.**

### ⚠️ `remt-checks-mt-gating.test.js` has been RED since the re-extract, and nothing bumped it

ch09 and ch10 both bumped `remt-checks-mt.test.js` and `remt-checks-mt-runrecord.test.js`; the
re-extract commit `13b38eaa3` touched **no** test file, and **no commit has ever bumped the gating
file**. So its premise pins have been measuring a corpus that moved three commits ago.

🔴 **AND THE A2b BLOCKING RED IS NOT A DEFECT — IT IS THE RE-EXTRACTION, AND IT SELF-HEALS.**
A2b (`every marker-like token actually parses`) reports `FAIL` on 78 pairs with
`seg-count-cross-side-mismatch`, `enParsed > isParsed`. Measured per chapter:

| | A2b |
|---|---|
| every BOUGHT chapter ch00–ch11 | **80 pairs, 0 fail** |
| every unbought chapter ch12–ch21 + appendices | fails |

`13b38eaa3` regenerated the **EN** side of ch09–ch21 with the current extractor — which emits
figure alts, container titles and captions the March MT predates — while ch12–ch21's **IS** side
is still that older MT. ▶ **ch11's buy strictly IMPROVED this**: ch11 would have been failing like
ch12 before it was re-bought, and the count falls by one chapter's worth on every buy, reaching
zero when the appendices are bought. **Do not "fix" this by relaxing A2b; it is reporting the
truth about a deliberately mixed corpus.**
