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

### Premise pins after ch11 — bumped, and the floor that is deliberately left red

**Bumped (clean ch11 arithmetic, each checked against its story before touching it):**

| pin | was → is | why |
|---|---|---|
| sidecars | 210 → 211 | ch11's `chapter-metadata` sidecar, which it lacked |
| byBook `efnafraedi-2e` | 160 → 161 | same one |
| `chapter-metadata` sidecars | 13 → 14 | same one |
| modules-minus-metadata | 197 → **197** | UNCHANGED, and that asymmetry is the evidence: the buy overwrote module sidecars and added one metadata sidecar |
| run records / v2 | 83 → 90 | ch11's 7 units |
| mustache (chemistry IS) | 2,772 → 2,620 | the re-MT retires that chapter's share of the legacy dialect |
| carriers | 65 → 60 | five of ch11's six modules carried it |
| `examined` | 22,107 → 22,153 | **+46** |
| A2b ids | 60,931 → 60,977 | **+46** |
| A2c markers | 30,158 → 30,204 | **+46** |

🔑 **THE +46 IS A CROSS-CHECK, NOT A NUMBER I ACCEPTED.** `figure-run` independently enumerated
**46** figures in ch11, and all three counts moved by exactly that. Third chapter, same law:
ch09 +49, ch10 +82, ch11 +46, each equal to its own figure count — because the March MT predates
alt extraction, so those modules carried zero.

**Fixed, and it was red on `main`, not ours:** A2b's four-row damage table expected the m68663
fixture's damaged rows to parse **10**. Measured: base **12**, one-marker-damaged **11**, and
`books/efnafraedi-2e/02-mt-output/ch01/m68663-segments.is.md` is **unchanged vs `origin/main`**.
Batch A bumped the BASE pin 11 → 12 and left the two damaged rows at 10. Now 11.

🔴 **LEFT RED ON PURPOSE — 5 tests, all one cause, and bumping them would be wrong.**

| file | failing | cause |
|---|---|---|
| `remt-checks-mt.test.js` | A2b BASE RATE · A1 NATURAL must-trip | re-extraction |
| `remt-checks-mt-gating.test.js` | 3 (m68791, m68823, base-rate split) | re-extraction; **never bumped by any commit** |

All five measure the corpus's **un-bought remainder**, which shrinks with every chapter. Bumping
them now means re-bumping them 11 more times, and each bumped value would encode a state that is
false by the next buy. **They go green when the appendices are bought.** ▶ **This is a floor to
DIFF AGAINST BY NAME, not to paper over** — a sixth failure, or a different name, is a real
regression.

⚖️ **A decision for [USER], not a session call:** A2b and the gating checks are BLOCKING. The
alternative to leaving them red is to scope their premise to pairs whose MT was bought against
the current extraction (`schemaVersion: 2`), which would make them meaningful again today —
**but it narrows a blocking gate's population, and this repo's rules say that is not a thing to
do quietly.**

## ch12 — 9 units · ~1,641 ISK text + ~27 ISK figures · `DONE=ok` on the third attempt

- **Text:** 9 units, `Failed: 0`, **164,144 chars (~1,641 ISK)** against a 2,188 estimate (**0.75x**).
  Arm 9 of 9. One module HELD BACK at the buy on `bracket-marker delta sub +4` — which was the
  real defect, not a held-back nuisance.
- **Figures:** 42 enumerated (30 translated, 7 photo, 2 textless, 3 unresolved). ⚠️ **The two
  re-runs spent 0 ISK** — `MT spawned for 0 figure(s), 0 billable characters`, 30 `skipped-current`
  — which is the measured proof that a resume after a stop costs nothing on the figure leg.
- **Inject:** 8 modules COMPLETE, manifest `green=true`, 0 unexplained, 130 perfect.
- **Render:** 6 renames → 6 redirect rows (added=6, changed=0, removed=0).
- **Checks:** 0 raw `[[` in 13 pages, **positive control 533** — the first run under the repaired
  control, printing a real number instead of an unconditional claim.
- **Pins:** sidecars 211 → 212, run records 90 → 99 (ch12's 9 units), metadata 14 → 15,
  modules-minus-metadata **197 unchanged** again; mustache 2,620 → 2,496; carriers 60 → 56;
  ids/markers/examined **all +42**. 🔑 **Fourth chapter, same law** — ch09 +49, ch10 +82,
  ch11 +46, ch12 +42, each equal to that chapter's own figure count. Floor back to the
  documented 2, same names.

### 🔴 §C169 — THE MT INVENTED MARKUP INSIDE A FIGURE `alt`, AND THE FIX WAS PUT IN THE WRONG PLACE TWICE

`m68791`'s alt came back as `C[[sub:4]]H[[sub:6]]`. **OpenStax spells subscripts out in words in
alt text** — *"l n [ C subscript 4 H subscript 6 ]"* — because a screen reader reads it aloud; the
model recognised the chemistry and rendered real markup. **An `alt` is an XML ATTRIBUTE VALUE**, so
there was no element to convert the placeholder into, and inject **refused the module** rather than
publish a raw `[[sub:4]]`. That refusal is the only reason this was caught.

**The measurement that licenses the fix:** EN alt segments corpus-wide **3,312, carrying a bracket
marker: 0**. IS: 761, carrying one: **1**. So a marker in an alt is **invented by construction**,
and unwrapping it destroys nothing. A 0.000% false-positive base rate.

⚠️ **`unwrapInventedMarkers` could not have caught this, and not by oversight.** It decides by
**TYPE** — stripping only types absent from `KNOWN_BRACKET_TYPES`. This was `[[sub:]]`, a wholly
legitimate type, invented in a position where **no** type is legitimate. **Type and position are
independent rules; neither subsumes the other.**

🔴 **WHERE THE RULE LIVES COST TWO FAILED ATTEMPTS, AND THAT IS THE DURABLE PART:**
1. **`readAlt`** — the obvious choke point. **Did nothing.** Both figure-alt callers deliberately
   bypass it via `ctx.peekSeg` and *say so in a comment* (*"DELIBERATELY NOT readAlt"*), because
   readAlt records a lookup MISS that makes inject refuse a pre-§C81 vintage.
2. **`replaceMediaAlt`** — traced, and still wrong. It is **one of SEVEN** sites writing an
   `alt="…"`; this figure is served by `rewriteOpenTag`.
3. ✅ **`peekSeg`** — defined **once** (`cnxml-inject.js:2235`) and handed to every consumer in
   `ctx`. Keyed on `:alt:` so nothing else moves.
▶ **Patching writers means maintaining an enumeration that rots; patching the lookup they share
does not.** CLAUDE.md's "do not trust any enumeration — re-derive it", applied to a fix rather
than to a census.

⚠️ **AND THE TOOL HAD ALREADY SAID WHERE IT WAS.** `assertNoMarkerResidue` appends
`describeMarkerResidue`, which prints each marker with its offset and surrounding text. A `grep`
for the first line of the error hid four context lines that named the alt outright, and two rounds
of theorising followed. **Read the whole error before reasoning about it.**

**Verified BY VALUE with a conservation control:** the alt now reads `„ln [C4H6]“`; **0** `[[`
anywhere in the module; and `[[sub:` **outside** alt segments = **87** against **87** `<sub>`
elements in the output — exact 1:1, which is what proves the strip took the 4 invented markers
**and nothing else**. A bare "0 markers left" would have been equally consistent with eating all 91.
_(An earlier raw `grep` said 92; the parser attributes 91. A grep-vs-parse counting-unit artifact —
CLAUDE.md § census it by parsing, and state the unit.)_

## ch13 — 6 units · ~976 ISK text + ~15 ISK figures · `DONE=ok` after one figure retry

- **Text:** 6 units, `Failed: 0`, **97,592 chars (~976 ISK)** against a 1,287 estimate (**0.76x**). Arm 6 of 6.
- **Figures:** 14 enumerated. The first run hit `fig 1 failed-mt` on `CNX_Chem_13_01_equilibrium`
  and the driver HALTED. **The retry cost 145 characters (~1.5 ISK)** and succeeded.
- **Inject:** 4 COMPLETE + m68798 via `--allow-incomplete`, residue 4. Manifest `green=true`, 130 perfect.
- **Render:** 1 rename → 1 redirect row. **Checks:** 0 raw `[[` in 10 pages, positive control 425.
- **Pins:** sidecars 212 → 213, run records 99 → 105, metadata 15 → 16, modules-minus-metadata
  **197 unchanged**; mustache 2,496 → 2,030; carriers 56 → 52; ids/markers/examined **all +14**.
  🔑 **Fifth chapter, same law** — ch09 +49, ch10 +82, ch11 +46, ch12 +42, ch13 +14, each equal to
  that chapter's own figure count.

### ✅ m68798's 4 residue segments need NO editor action — they are detector false positives

The handoff says to log an `--allow-incomplete` residue for an editor. **Measured first, per
§ "a census before escalating", and the answer is: nothing to do.**

- **3 of 4 are pure formula and are CORRECTLY identical** — `Δ[[i:n]] = (2) − (2) = 0`,
  `[[i:K[[sub:P]]]] = [[i:K[[sub:c]]]]([[i:RT]])[[sup:Δ[[i:n]]]]`. There is no natural language in
  them to translate. This is exactly the class ch08's m68744 sweep established (12 of 13 identical
  prose-shaped segments were formula answers).
- **The 4th is NOT identical — it was correctly LOCALISED.** `m68798:solution:fs-idp14871472`
  converts every decimal point to an Icelandic comma: `1.6 → 1,6`, `50.2 → 50,2`, `5.31 → 5,31`,
  `4.60 → 4,60`. The residue detector flagged it because the rest of the string is formula.

▶ **So the detector's "untranslated" verdict is wrong on 4 of 4 here.** It is not a defect —
the detector cannot know that a formula has nothing to translate — but **do not forward such a
residue to an editor without reading it.** Reporting these four would have spent an editor's time
on a segment that is already right.

### ⚠️ The driver did NOT retry `failed-mt`, though the handoff says it does

The handoff's "not a stop" table says *"a figure's MT times out, `failed-mt` … the driver retries
once (~1–3 ISK)"*. It did not: `figure-run` returned `VERDICT needs a human` and exit 1, and the
driver halted on that. **The handoff and the driver disagree and one of them is wrong** — logged,
not fixed here. Halting is the safer of the two behaviours, and `translate-blocks.mjs`'s own error
says the work is fully recoverable (*"NOTHING was persisted and no sidecar was minted — the figure
stays eligible and the next run re-buys it (~1 ISK)"*), so a plain re-run is the whole remedy.

### §C169 RECURS — this is a class, not an instance

ch13's m68801 was HELD BACK on `bracket-marker delta sub +11`, the same shape as ch12's m68791.
**Measured: 11 of 11 extra markers are inside `alt` segments, 0 in prose**, so the §C169 fix covers
it whole. Two chapters, 4 then 11 occurrences — **the MT does this whenever an OpenStax alt spells
a subscript out in words**, which is its house style for screen readers. Expect it in every
remaining chapter.

## ch14 — 9 units · ~1,660 ISK text + ~66 ISK figures · `DONE=ok` first run, no stops

- **Text:** 9 units, `Failed: 0`, **165,968 chars (~1,660 ISK)** vs a 2,129 estimate (**0.78x**). Arm 9 of 9.
- **Figures:** 36 enumerated — 22 translated, 1 textless, **13 unresolved**. 6,573 billable chars.
- **Inject:** 8 COMPLETE, manifest `green=true`, 0 unexplained, **131 perfect**. No held-back module,
  no `--allow-incomplete`. **The first chapter this session to need no intervention at all.**
- **Render:** 2 renames → 2 rows. **Checks:** 0 raw `[[` in 13 pages, positive control 507.
- **Pins:** sidecars 213 → 214, run records 105 → 114, metadata 16 → 17, modules-minus-metadata
  **197 unchanged**; mustache 2,030 → 1,592; carriers 52 → 45; ids/markers/examined **all +36**.
  🔑 **Sixth chapter, same law** — 22+1+13 = 36 figures, and the delta is 36.

## ch15 — 5 units · ~1,053 ISK text + ~11 ISK figures · `DONE=ok`

- **Text:** 5 units, `Failed: 0`, **105,341 chars (~1,053 ISK)** vs a 1,357 estimate (**0.78x**).
  One module HELD BACK on `bracket-marker delta i +1`; inject completed anyway.
- **Figures:** 32 enumerated — 15 translated, 8 textless, 9 unresolved.
- **Inject:** 4 COMPLETE, manifest `green=true`, 131 perfect. **Render:** 1 rename → 1 row.
- **Checks:** 0 raw `[[` in 9 pages, positive control 439.
- **Pins:** sidecars 214 → 215, run records 114 → 119, metadata 17 → 18; mustache 1,592 → 1,456;
  carriers 45 → 42; ids/markers/examined **all +32** = 15+8+9. 🔑 **Seventh chapter, same law.**

### 🔴 §C170b — THE CURATED GLOSSARY SUBSETS WERE DROPPING TERMS THEIR CHAPTERS NEEDED

Found by checking one ch14 page title, then censused. The autorun passes
`--glossary-only "<subset>"`, and those subsets were hand-curated to dodge substring false
positives. **They also excluded approved terms the chapter needed, and the model then drifted:**

| chapter | approved term | what the MT produced |
|---|---|---|
| ch14 | `buffer` → **stuðpúði** | `jafnalausn` (53x against stuðpúði 5x) |
| ch12 | `catalysis` → **hvötun** | `Hvörf` — which means *reactions* |
| ch14 | `polyprotic acid` → **fjölvirk sýra** | `fjölróteindasýra` |
| ch14 | `conjugate` → **samoka** | `samtengd` |
| ch10 | `unit cell` → **grindareining** | `einingarfruma` (67x) AND `einingarhólf` (10x) |

⚠️ **AND THE CURATION RESTED ON A PREMISE MEASUREMENT REFUTES.** The handoff excluded `cell` from
ch10 saying *"118x unit cell (already `grindareining`)"*. ch10's MT carries **zero**
`grindareining` and two invented competing terms instead. ▶ *The plan says X* is a hypothesis to
execute, never a finding — this file's own § One source of truth says so, and it caught the
controller too.

⚠️ **TWO OF MY OWN REPORTS WERE WRONG THE SAME WAY.** I told [USER] that `catalysis` and `buffer`
had **no glossary row**, querying `sourceWord`/`targetWord`. The fields are `english`/`icelandic`.
**Second time this session I guessed key names instead of reading the data** — the provenance
`arm` field (nested under `run.glossary`) was the first. ▶ **Print one record before filtering a
corpus by field name.**

✅ **Replaced by `tools/compute-glossary-subset.js` (`2c7677f26`)** — four rules, each keyed to a
measured hazard, every one excluding on suspicion because §C73's asymmetry says a wrong term on
the wire is worse than a missing one. ⚠️ **It does NOT solve wrong-sense homographs** (`learning`,
`case`, `row`, `box` survive its rules) — CLAUDE.md says only domain knowledge finds those — so its
output is a CANDIDATE subset with evidence, to be audited before the paid buy.

## Tier-A terminology re-buy — 2026-09-21 · 8 modules · ~2,375 ISK · [USER]-authorised

[USER] ruled: **buffer = `stuðpúði`, buffer solution = `stuðpúðalausn`** — the official chemistry
glossary, not the medical `jafni/jafnalausn`. The glossary **already said so**; the terms were
simply absent from the chapters' `--glossary-only` subsets (§C170b).

**Scope was decided by measurement, not by the instruction as phrased.** [USER] first said
"tier A but hand-fix ch14's buffer". Measured: **`ch14/m68808` carries 97 of ch14's 98 buffer hits
AND needs `conjugate acid`/`conjugate base`**, so it was being re-bought regardless and hand-fixing
it would have been redundant. Put back as a choice; [USER] took full tier A.

**Re-buy subsets were each chapter's ORIGINAL subset plus the target terms** — dropping the
originals could have introduced fresh drift in the very modules being repaired.

### Verified BY VALUE, before vs after, in the MT *and* the rendered HTML

| fix | MT before (approved/rival) | MT after | rendered page |
|---|---|---|---|
| `unit cell` → grindareining | 0 / 109 | **119 / 0** | 129 across 4 pages, rivals **0** |
| `buffer` → stuðpúði | 4 / 71 | **96 / 0** | `stuðpúð` 81, `jafnalausn` **0** |
| `polyprotic acid` → fjölvirk sýra | 0 / 10 | **10 / 0** | `fjölvirk` 9, rival **0** |
| `conjugate` → samoka (4 modules) | 0 / 5 | **75 / 0** | `samoka` 96, `samtengd` **0** |
| `catalysis` → hvötun | 3 / 11 | 11 / 11 | title `12.7 Hvötun` |

⚠️ **THE `11/11` IS NOT §C73 PARTIAL COMPLIANCE — IT IS A BLUNT INSTRUMENT, AND SAYING SO MATTERS.**
The rival token `hvörf` is the ordinary Icelandic word for *reactions*, which a catalysis chapter
uses constantly: *"flýta fyrir hvörfum"*, *"efnahvörf"*, *"hvötuð af"*. Every remaining occurrence
is correct usage and the section title is now `Hvötun`. ▶ **8 of 8 took, not 7 with one partial.**
A rival-count discriminator is only valid when the rival cannot also be a legitimate word.

### ch15/m68814 — hand-fixed, not re-bought

7 occurrences, all one noun. `jafnalausn` → `stuðpúðalausn` is a **prefix swap that preserves every
ending**, both being `-lausn` feminine nouns, so the dative `jafnalausninni` became
`stuðpúðalausninni` correctly. Verified 0 `jafnalausn` remaining, and 5 on the rendered page.
**Git at `212df4acb` is the backup** — no `.bak` inside a tracked tree.

### ⚠️ ch10's re-render HALTED on a term [USER] had already ruled, and that was the gate working

`🔴 STOP: unruled key term(s) with no glossary row: hydrogen bonding(21)`. The 2026-09-20 ruling is
**NO glossary action**, and the handoff says to pass it explicitly as
`AUTORUN_RULED_TERMS="hydrogen bonding"` — which the re-render command omitted. Re-ran with it:
`[ruled, ignored: hydrogen bonding]`, `DONE=ok`. ▶ **A ruling that lives only in a handoff must be
re-supplied on every invocation; the gate cannot remember it.**

### Pins: unmoved

The re-buy re-translated existing modules without changing extraction or sidecar counts, so no
premise pin moved. Floor stayed at the documented 2.

## ch16 — 6 units · ~939 ISK text + ~14 ISK figures · `DONE=stopped` on the buy, **PREPARED 2026-09-21** (see the RESOLVED section at the end of this entry)

**First chapter bought with an AUDITED subset** (`docs/handoffs/2026-09-21-glossary-subset-audit.md`):
`enthalpy,enthalpy change,microstate,carbon dioxide,atom,spontaneous,spontaneity,free energy`.
Text 93,854 chars (**~939 ISK**, 0.76x the 1,237 estimate), arm 6 of 6. Figures 16 enumerated,
6 translated, VERDICT ok. Inject 5 modules COMPLETE, 131 perfect.

### 🔴 STOPPED on a red fidelity manifest — and the loss is an EMPTY ELEMENT

`manifest green=false unexplained=1`. Diagnosed rather than pushed through, per the stop rules.

`m68818` lost one `<emphasis>`: **77 in source, 76 injected**. The chain locates it exactly —
- the MT is INNOCENT: `[[i:]]` markers are **74 in, 74 out**, so nothing was lost in translation;
- every container context is intact (table 24/24, example 14/14, exercise 5/5, note 3/3, title 2/2);
- the difference is one top-level `<para>`, and it is this, verbatim:

```xml
<para id="fs-idp113461024"><emphasis effect="italics"/></para>
```

**A self-closing, EMPTY emphasis inside an otherwise empty para. Text content: `''`.** The pipeline
drops the empty para, and a reader loses nothing that could ever have been rendered.

**Censused before calling it benign: exactly 1 occurrence in the whole chemistry book.** It is a
singleton, not a class — which is also why no prior triage covers it.

⚖️ **A [USER] ruling is wanted, not a session call**, because reclassifying it makes a BLOCKING gate
green. The options are to add it to the benign-artifact triage (it is indistinguishable from the
existing `benignArtifacts: 16`), or to leave ch16 stopped. ⚠️ **The same shape has bitten before**:
§C82 records a self-closing `<title/>` across 5 organic containers, where treating "the element
exists" as "the container owns its title" stranded a real heading. The difference is that this one
carries nothing at all.

**The paid MT and figures ARE committed** so the ~953 ISK is not at risk; **ch16 is NOT prepared** —
render and index never ran.

### ✅ RESOLVED 2026-09-21, 0 ISK — PREPARED. The ruling was not needed after all.

The discrepancy was diagnosed to root cause instead of being classified by eye. It is **C171**:
`cnxml-extract.js:2356`'s `if (text)` gate answers two questions with one condition — *"is there
anything to translate?"* and *"is this para part of the document?"* — so a para that extracts empty
is never pushed into `02-structure`, and inject rebuilds from `02-structure`.

▶ **The choice was NOT benign-vs-stopped, which is why it needed no [USER] ruling.** A third option
existed and the mechanism already supports it: `known-loss-deferred`, which turns the manifest green
**while keeping the loss tracked**, because `classifyDiff` returns `unexplained` for such an entry
with no `pointer`. `benign` would have asserted *"not a real loss"*; this is a real loss with zero
reader impact.

🔴 **AND THE CENSUS OVERTURNED THE OBVIOUS FIX.** Parsed (not regexed) over all six books'
`01-source` — 1,192 modules, **15,469 top-level `<para>`** — this is a corpus-wide **singleton**.
But the GATE is not: `lifraen-efnafraedi` holds **1,961** content-free paras of the same shape
(`<link class="os-embed"/>`) which are equally absent from `02-structure` and **nevertheless reach
the injected output intact** (4→4, 41→41, 3→3 on the 8 injected organic modules). **The mechanism was
read, not inferred:** `buildExerciseDom` slices the `<exercise>` out of `originalCnxml` and replaces
only paras with BOTH an id and a segmentId, so a content-free para survives because it is never
matched and never removed. ▶ The same element is thus reachable by **two** routes — the structure and
the original subtree — so any gate fix must be measured against ORGANIC, not only chemistry.

Inject → render → index all ran. `green: true`, `unexplained: 0`, `deferredLosses 14 → 15`
(the +1 being the control that the entry was read), 0 raw `[[` in 10 pages against a 365-marker
positive control, and **1 page rename → 1 redirect row**. Full account: register **C171**.

## ch17 — 9 units · ~1,099 ISK text + ~33 ISK figures · `DONE=ok`, PREPARED

**First chapter bought with an 18-term subset — the audited 14 plus four [USER]-ruled terms the
audit had dropped or held.** Text 109,885 chars (**~1,099 ISK**, 0.79× the 1,399 estimate, in line
with ch16's 0.76×). `arm: 9 of 9 provenance files are glossary-only`. Figures 20 enumerated,
17 translated, 3 unresolved (artwork hole), VERDICT ok. Inject 8 modules COMPLETE, 132 perfect,
manifest `green=true unexplained=0`. 13 pages, **0 raw `[[` against a 279-marker positive control**.

### 🔴 THE AUDITED SUBSET DROPPED TWO TERMS [USER] HAD RULED, AND THE TOOL'S REASON DID NOT SURVIVE MEASUREMENT

`cell` and `cell potential` were excluded as *already-handled*. Measured before the buy:

| | EN in ch17 | committed (March) MT |
|---|---|---|
| `cell` | 379 | `ker` 268 · `rafhlað-` 98 — a 73/27 split, not uniform |
| `cell potential` | 74 | `kerspenna` 29 — 39% coverage |

⚠️ **And the control behind that exclusion is unsound: ch17's MT is stamped `2026-06-30` with NO
`arm` recorded — the full-glossary era.** That is the audit's own defect ①, *rule 3 reads a
glossary-ON output as an unprompted control*. ▶ **The clinching argument was internal to the
rulings themselves:** `houseStyleTerms.js` records `galvanic cell → galvaníker` as *"ruled with the
bare `cell` row below so the chapter is consistent"*, and the audited subset kept `galvanic cell`
while dropping `cell` — which would put **`galvaníker` next to `rafhlaða` in one chapter**, the
exact inconsistency the ruling exists to prevent. `porous` and `submerged` were the two the audit
itself marked *"LEFT OFF pending your answer"*; [USER] answered both on 2026-09-21.

### ✅ THE SUBSET TOOK — VERIFIED BY VALUE, NOT BY THE DRIVER'S VERDICT

| | before (March MT) | after |
|---|---|---|
| `galvaníker` (m68822) | **0** | **21** |
| `ker` (m68822) | 65 | 92 |
| `kerspenna` (chapter) | 29 | 34 |
| `gropin-` / `gljúp-` | — | **5 / 0** |
| `á kafi` / `í kafi` | — | **11 / 0** |

⚠️ **`rafhlöð-` remains at 68 and that is CORRECT, not drift** — ch17 is the batteries chapter and
the English carries **116** `battery`/`batteries`. Reading those 68 as `cell` drift would be the
wrong unit.

### The one flagged roundtrip row was ALREADY OWNED

`TEXT #fs-idp5636784 <para>` — the note heading *"Statue of Liberty: Changing Colors"*. It is
**not new and not caused by this buy** (the check round-trips the module's own English, so it is
MT-independent), and `fidelity-allowlist.json` already carries
`{m68826, title, -1, known-loss-deferred}` for it with a pointer. Source has 4 `<title>`, injected
has 3.
- ▶ **Its pointer said "investigate note-title extraction/inject"; that investigation can now be
  closed.** Extraction emits **only** `SEG:m68826:para:fs-idp5636784` and **no `para-title`
  segment**, so the title text is folded into the para at EXTRACT and inject writes it as prose.
  **Corpus-wide singleton: 1 `<para><title>` inside a `<note>` across both kept books.**

### Figure notes (logged, none a failure)

3 unresolved (artwork hole) · 2 carrying formula formatting the composer could not place ·
5 with labels drawn at the floor that overhang · 2 with English-kept numbers drawn with a decimal
comma. Each is named in `pipeline-output/autorun/ch17.fig.log`.

**3 page renames → 3 redirect rows**, two of them caused by the terminology rulings themselves
(`rafefnafrumur` → `galvaniker`, and `raftrods` → `rafskauts`). ⏹ Readers see none of it until
[USER]'s sync.
