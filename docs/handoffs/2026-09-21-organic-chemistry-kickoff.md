# Handoff — starting `lifraen-efnafraedi` (Organic Chemistry)

**Written:** 2026-09-21, at the close of the session that finished `efnafraedi-2e`.
**Status of this document:** a starting brief. **It owns no status** — the active register's ⏩ RESUME
does. Everything below is either a measurement taken on 2026-09-21 or a pointer.

## ⏩ START HERE — state as of **2026-09-22, evening**

**§C173's fix set is SHIPPED AND MERGED, in both repos.** efni
[#511](https://github.com/SigurdurVilhelmsson/namsbokasafn-efni/pull/511) (`a598635de`) and vefur
[#233](https://github.com/SigurdurVilhelmsson/namsbokasafn-vefur/pull/233) (`731199b17`), both as
merge commits, all checks green. Nothing in the pipeline now blocks pricing organic's first chapter.

| | was | now |
|---|---|---|
| ③ module title (§C177) | 29 of 32 organic titles **fabricated** from another element | fixed at extract, inject **and** the page filename |
| ① smallcaps (§C178) | 110 flattened, **6 silently rendered italic** | `[[sc:]]` marker type, six sites + vefur CSS |
| ② `<quote>` (§C179) | 3 of 4 lost the callout box; **the 4th lost its prose** | all 4 render as `<blockquote class="cnx-callout">` |
| organic round-trip reds | 101 | **67** — at 0 ISK, before a chapter is priced |
| blocker (a), §2 below | driver hardcoded `efnafraedi-2e` ×23 | ✅ **DISCHARGED** — book is a required, validated first argument |

⚠️ **§2(a) BELOW IS HISTORICAL — READ IT AS THE RECORD OF A CLOSED BLOCKER, NOT A TASK.** §2(b) is
still real but narrower than it reads: the fidelity check runs only on **INJECTED** modules, and the
workload was measured for free rather than guessed (§C173, and now §C177–§C179 removed 34 of it).

🔴 **THE BLOCKER LIST HAS ONE OWNER AND IT IS NOT THIS FILE — it is the register's §C126 census, and
the register's newest ⏩ RESUME owns status.** This document owns no status verbs. §C126 carries two
rows nobody has measured yet: **#3 exercise `<img alt>` → segments** (2,375 strings / 288,603 chars
across 1,961 exercise JSONs, organic-only) and **#4 `table@summary`**, which wants a **[USER] RULING
rather than a fix** (19 organic). ✅ And one blocker organic does **not** have: its glossary is clean
(249/249 `domain: chemistry`), so §3's glossary work is chemistry-only.

### The first five moves, all 0 ISK

1. **Read the register's newest ⏩ RESUME**, then §C126 and §C173. Not this file's §2/§5 first.
2. **Pick the unit and run the two free source-anchored checks** —
   `node tools/source-roundtrip-check.js lifraen-efnafraedi <unit> --verbose` and
   `node tools/render-oracle-check.js lifraen-efnafraedi <unit> --control`. The `--control` is not
   optional: a clean result without it is indistinguishable from an instrument that sees nothing.
   ⚠️ Only **ch03** is in OpenStax's manifest for organic, so the oracle cannot check other units.
3. **Compute the glossary subset, then audit it** — `tools/compute-glossary-subset.js`, never a
   hand-curated list. 🔴 **NO EXISTING AUDITED SUBSET IS USABLE AS WRITTEN**: they were computed
   against the old glossary with rulings outstanding. Add back the terms the audit itself HELD, and
   cross-check that unit's `server/lib/houseStyleTerms.js` entries against the subset — an entry
   whose `why` names the chapter but which the subset omits is a **dropped ruling**, not a
   considered exclusion. Then decide per term by measuring that chapter's own EN count against its
   own MT rendering.
4. **Prove any house-style ruling actually reached the wire** — a ruling is CODE, so it needs
   deploy → boot → the 2-hourly cron export → **pull**, and you verify it by grepping the pulled
   export for the ruled values. Never by the clock; buying early spends on the OLD glossary.
5. **Re-extract, then `--dry-run` to price it.** `api-translate` reads the GENERATED `02-for-mt`, so
   buying without re-extracting re-translates the old English and exits 0 — and §C177/§C178/§C179
   all changed what extraction emits. ✅ **The whole-book re-extract is done (`cc28de312`, 2026-09-22) —
   the register's RESUME carries what it measured.** ▶ **The rule survives the event: after ANY later
   extractor change, re-extract the unit again before its `--dry-run`.** ⚠️ And ch12's committed MT is
   stale under stable ids — re-buy it, never inject it.

▶ **Then buy text and figures as ONE unit** ([USER] ruling), in the foreground, and let the loop stop
at PREPARED. **Only [USER] syncs**, timed against classroom use.

### Carried forward, stated so nobody re-discovers them

- ⏸ **`effect="italic"` (singular) is still flattened — 4 occurrences corpus-wide**, organic
  ch00/m00001 ×2 and `edlisfraedi-2e` ×2. Mapping it trades a content loss for a fidelity diff.
- ⏸ **`renderCnxmlToHtml` drops 6 of 63 paras in ch26/m00328**, unrelated to smallcaps, pre-existing.
- ⏸ **The module `<h1>` still flattens markup** (`sp³` → `sp3`). Deferred **with its gate named**:
  byte-diff all 149 chemistry renders before and after the swap.
- ⏸ **The `<cite>` stand-in swap is PARTIAL** — four `<quote>` assertions remain in
  `cnxml-render-item-blocks.test.js` and `cnxml-render-table-cell-blocks.test.js`. Safe only because
  no corpus quote sits in an `<item>` or `<entry>` (measured).
- ⏹ **The chemistry sync is still HELD by [USER]**, and the **21 redirect rows must reach vefur
  BEFORE it** (`docs/handoffs/2026-09-20-vefur-chemistry-autorun-redirects.md`).

---

## 1. The shape of the job, measured

| | chemistry (done) | **organic (next)** |
|---|---|---|
| source modules | 149 | **342** |
| extracted text | 4.36 M chars | **3.03 M chars** |
| chapters | 21 + appendices | **31 + appendices** |
| modules with MT today | 149 | **~19** (ch03 and ch12 only) |
| injected modules | 149 | **8** |
| published HTML | ~250 | **13** |

🔑 **MORE MODULES, LESS TEXT.** Organic has 2.3× the modules but 0.7× the characters — its modules
are much shorter. ▶ **Per-module overhead dominates, not wire cost**: figures, inject, verification
and redirect rows all scale with MODULE count, and there are 342 of them.

**Cost estimate for text: ~30,000 ISK**, from 3,032,978 chars at the rate this session actually
measured (ch17: 109,885 chars → ~1,099 ISK ⇒ 0.0100 ISK/char). Chemistry's six final units came in
at **0.79–0.84× their list estimates**, so treat ~30,000 as an upper bound for text and add figures
separately. **Price every unit with a real `--dry-run` before buying it; do not spend against this
number.**

⚠️ **Licence: `CC BY-NC-SA 4.0`, obtained 2026-03-23** (`books/lifraen-efnafraedi/book-config.json`).
Not CC BY. Never make a blanket "all content is CC BY" claim → CLAUDE.md § *THIS REPOSITORY IS
PUBLIC*.

---

## 2. ⏸ HISTORICAL — the two prerequisites as measured 2026-09-21

> **(a) is DISCHARGED** (the driver takes a required book argument) and **(b) is narrower than it
> reads** — see ⏩ START HERE above. Kept verbatim as the record of what was found and why.

### (a) The autorun driver is NOT portable

`scripts/chemistry-autorun-chapter.sh` hardcodes `efnafraedi-2e` **23 times** and accepts **no
`--book` argument**. It cannot be pointed at organic as it stands.

▶ **Do not fork it.** Its value is the 38 audited defects baked into v3 — every `|| halt`, every
`_rc`, the arm check, the raw-marker positive control, the roundtrip verdict gating. A fork
inherits the bugs and none of the fixes. **Parameterise the book, and keep one driver.**
⚠️ Two places need thought beyond a find-and-replace: the `⑰` known-set (`m68700|m68733|m68747|m68844`)
is chemistry module ids, and `PAGESUF`/`CHD` handling was written around chemistry's chapter
numbering. Organic has **ch00–ch31 + appendices**.

### (b) Organic has NO `fidelity-allowlist.json`

Chemistry's carries **37** entries. Organic's file **does not exist** — and
`tools/lib/fidelity-allowlist.js` documents exactly why that matters: `loadAllowlist` returns
`{entries: []}` for a missing file, so **every discrepancy classifies as `unexplained`**, the
manifest goes **red**, and the driver halts.

▶ **Expect the first organic chapter to stop on a discrepancy that is genuinely benign**, and budget
for building the allowlist as you go — one entry per verified-benign class, `known-loss-deferred`
with a **mandatory pointer** where the loss is real (see C171 for the worked example).
⚠️ `loadAllowlistOrNull` exists precisely so a consumer can tell "no file" from "empty file". Use it
if you write anything that must refuse the missing case.

---

## 3. What this session learned that applies directly to organic

🔴 **AN AUDITED SUBSET CAN DROP A TERM [USER] HAS RULED.** It happened in **all six** chemistry units.
The two checks are now in CLAUDE.md § *NEVER HAND-CURATE*; both are mandatory before any buy:
1. Add back the terms an audit marked *"LEFT OFF pending your answer"* once ruled.
2. **Cross-check the unit's `server/lib/houseStyleTerms.js` entries against its subset** — an entry
   whose `why` names the chapter but which the subset omits is a **dropped ruling**.
⚠️ **Per-term measurement, never a rule**: `hydroxide` and `group` were rightly *left out*.

⚠️ **ORGANIC HAS NO CURATED SUBSETS AT ALL YET.** The 2026-09-21 audit covered chemistry ch16–ch21 +
appendices only. `tools/compute-glossary-subset.js` produces a **candidate list, not a subset** — for
ch17 it returned 54 terms including `case`, `learning`, `result`, `function`, `object`, `time`,
`summary`. **Every organic subset needs the same compute-then-audit treatment.**

🔑 **ORGANIC IS CHEMISTRY-DOMAIN ONLY** (§C119, [USER] 2026-09-04): `BOOK_DOMAIN_PRIORITY` for
`lifraen-efnafraedi` is chemistry-only, because the biology/physics tiers put 872 biology and 475
physics headwords into an organic textbook — 119 of them measured harmful (`ants → maurar` fires 180
times, 179 of them inside *reactants*/*plants*/*constants*). **Do not widen it.**

---

## 4. Organic-specific hazards already on record

- 🔴 **1,071 `<span>` elements across 184 of 342 modules** — red/cyan/magenta reaction colouring.
  **They stay** ([LEAD] 2026-08-30: if OpenStax ships it, we ship it). They were being dropped
  wholesale until §C118, and the paid MT was eating `[[span:]]` markers until §C82 — **a stated rule
  is not a guarantee the code honours it.**
- 🔴 **1,961 content-free `<para><link class="os-embed"/></para>`** — absent from `02-structure`, yet
  they reach injected output intact because `buildExerciseDom` slices the `<exercise>` out of
  `originalCnxml` and only replaces paras having BOTH an id and a segmentId. **C171 records this;
  any change to the extract gate must be measured against ORGANIC, not only chemistry.**
- ⚠️ **os-embed exercises have their own pipeline** — `tools/exercise-extract.js`,
  `resolve-os-embed.js`, `exercise-assemble.js`. Organic uses it heavily; chemistry barely.
- ⚠️ **ch03 carries known blockers** (⑯/⑰/⑲/⑳ in the register) — it is the most-worked organic
  chapter and the least representative. **Do not start there** expecting a clean baseline.
- ⚠️ **`--no-annotate-en`** applies to ⑰'s known set; organic's members of that set are chemistry ids
  today. Expect organic to reveal its own.

---

## 5. Suggested first moves (0 ISK before anything is bought)

> ✅ **STEPS 1, 2 AND 5 WERE DONE 2026-09-21 — results at §C173, not here.** Step 2 was widened
> from "a candidate chapter" to **all 33 units** (`source-roundtrip-check.js` costs 0.3 s per unit,
> so sampling was the more expensive choice) and it found two defects §C126's 26 agents did not.
> ⚠️ **Step 2's other half is NOT executable for organic:** `render-oracle-check` needs
> `openstax-id-manifest.json`, which covers **ch03 only** — the chapter §4 says not to start with —
> and **no committed tool can extend it**. It exits **2** out of scope, so it fails loudly rather
> than silently. **Organic's free QC tier is T2-only.**
> ⚠️ **Step 3 needs a different audit than chemistry's:** 30 of 33 organic units have no content
> MT, so `compute-glossary-subset.js`'s "already-handled" exclusions are unreliable **by default**
> (it prints the warning itself), and organic **inherits all 41 chemistry house-style rulings** —
> so the cross-check inverts into looking for entries to EXCLUDE. Both measured at §C173.

1. **Re-extract a candidate chapter** and confirm `02-for-mt` is current (the diff is the control —
   chemistry's re-extract moved 8 manifest timestamps and nothing else).
2. **Run the free source-anchored checks**: `tools/source-roundtrip-check.js lifraen-efnafraedi <ch>`
   **with `--verbose`** (the listing is capped at 4 per category — non-verbose hid two real deltas
   twice this session) and `tools/render-oracle-check.js --control`.
3. **Compute a subset, then audit it**, applying §3's two checks.
4. **Decide the allowlist strategy** before the first buy, per §2(b).
5. **Parameterise the driver** per §2(a), or accept running the steps by hand as this session did for
   ch16 and ch19 — which worked, but costs the driver's 38 audited guards.

⏹ **The loop ends at PREPARED.** No session syncs; the sync is [USER]'s and is timed against
classroom use (`docs/decisions/2026-09-16-chapters-prepared-sync-timed-by-classroom-use.md`).
