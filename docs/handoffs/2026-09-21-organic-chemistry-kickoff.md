# Handoff — starting `lifraen-efnafraedi` (Organic Chemistry)

**Written:** 2026-09-21, at the close of the session that finished `efnafraedi-2e`.
**Status of this document:** a starting brief. **It owns no status** — the active register's ⏩ RESUME
does. Everything below is either a measurement taken on 2026-09-21 or a pointer.

> 🔴 **CORRECTED 2026-09-21, later the same night — §2 BELOW NAMES *TWO* BLOCKERS AND THE
> REGISTER ALREADY OWNED *FOUR*.** The pre-flight checklist is **§C126**'s ("THE RE-MT PRE-FLIGHT
> CENSUS", 26 agents, adversarially verified) and it is the owner. It adds, both **organic-only**:
> **#3 exercise `<img alt>` → segments (§C123)** — 2,375 strings / 288,603 chars across 1,961
> exercise JSONs — and **#4 `table@summary`**, which wants a **[USER] RULING, not a fix** (19
> organic). It also carries an **ordering meta-rule** about segment renumbering that decides the
> SHAPE of the alt fix. ✅ **And it records one blocker organic does NOT have: its glossary is
> clean** (249/249 `domain: chemistry`, all three shadows absent) — the glossary work is
> chemistry-only, so §3 below should not be read as implying organic inherits it.
>
> ⚠️ **§2(b) is also narrower than it reads.** A missing `fidelity-allowlist.json` is real, but
> organic's manifest is red on **exactly one** discrepancy today, because the fidelity check only
> runs on INJECTED modules and only 8 of 342 are. The workload that matters was measured for free
> instead of guessed — see **§C173**.
>
> ▶ **The blocker list, the fix set and every number are owned by the register. Read its newest
> ⏩ RESUME and §C173 before §2 and §5 below.** Blocker **(a) is discharged** — the driver is
> book-parameterised.

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

## 2. 🔴 TWO PREREQUISITES THAT BLOCK A RUN, BOTH MEASURED 2026-09-21

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
