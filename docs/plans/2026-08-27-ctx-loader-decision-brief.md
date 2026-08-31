# The ctx-loader decision — a brief for the lead

**Written 2026-08-27** · **frozen; cite, do not sync.** Status owner is the register's ⏩ RESUME
block. **If they disagree, the register wins.**

**What this asks for:** one ruling, on one class of unit. It is the only thing blocking §C82
Plan C, and the only step of the remaining pre-run sequence a coding session cannot start.

---

## 0. In one paragraph

The re-MT check battery is built: 33 checks, 19 of them able to halt the run, across five tiers,
merged and deployed. Every check is **pure** — it is handed already-read text and returns a
verdict, and never touches disk. Something has to do the reading and hand it over. That something
is the **ctx loader**, it does not exist, and the question is what it does with a unit that the
Tier-1 checks cannot compare against a source document. **Both answers the register names are
unsafe, which is why this has sat open.** The measurement below narrows it considerably, and the
research turned up a third answer that neither costs a halt nor waves anything through.

---

## 1. 🔴 THE FIRST CORRECTION: IT IS THREE CLASSES, AND ONLY ONE IS A DECISION

The question has been carried as *"units with no `01-source` counterpart"*, as if that were one
population. Measured over both kept books, it is three, with three different right answers:

| class | units | segments | book | is this a decision? |
|---|---|---|---|---|
| `chapter-metadata` | 23 | **23** | 21 chem + 2 organic | **No.** One segment each — a chapter title. A source counterpart cannot exist in principle. |
| `exercises` | 31 | **6,664** | organic only | **YES. This is the question.** |
| `(b)`/`(c)`/`(d)` variants | 49 | — | chemistry only | **No.** Retired-dialect leftovers, committed. A hygiene rule, not a policy. |

**Zero module units lack a source counterpart in either book** — the walker that finds 149
chemistry and 17 organic modules *with* source finds none without, and the positive rows are what
prove the probe could have seen one.

▶ **So the ruling wanted is narrow: what happens to organic's 31 exercise bundles.** The other
two classes need a line of code each and no judgement.

---

## 2. 🔴 THE SECOND CORRECTION: THE EXERCISES ARE NOT SOURCE-LESS

The register says these bundles have *"no `01-source` counterpart at all"*. **Measured, that is
too strong.** `books/lifraen-efnafraedi/01-source/exercises/` holds **1,961 JSON files**, and the
distinct SEG first-fields across all 31 bundles number **1,961** — a perfect bijection, **0
orphans in either direction** (the instrument returns all 1,961 against an empty set, so it was
capable of reporting a difference). Each JSON even names its parent module by
`context-cnxmod:<uuid>`, which resolves to a real `01-source/chNN/mNNNNN.cnxml`.

**This does not make the problem smaller. It makes it a different problem** — and a lead
hypothesis, since confirmed by measurement, explains why.

### 🔴 Organic uses a POINTER architecture. It is the only one of five books that does.

Organic's CNXML carries **empty exercise shells holding a pointer**; the prose lives in the pool:

```xml
chemistry:  <exercise><problem><para>Is one liter about an ounce, a pint…</para></problem></exercise>
organic:    <exercise><problem><para><link class="os-embed" url="#exercise/01-04-OC-P03"/></para></problem></exercise>
```

| | modules | with `<exercise>` | with `os-embed` | inline prose | pool |
|---|---|---|---|---|---|
| **organic** | 342 | 260 | **260** | **0** | **1,961** |
| the other four | 850 | 692 | **0** | 692 | — |

**No mixed cases anywhere** — a different architecture applied wholesale, not a drift. ⚠️ And
acquisition order does *not* support "the new OpenStax way": physics was fetched **45 seconds
before** organic on the same day and is wholly inline. The evidence supports *organic-specific*; it
cannot distinguish one-off from leading-edge, so **do not plan on future books looking like this.**

### 🔴 AND THE GRANULARITY BLOCKER IS OURS, NOT OPENSTAX'S

- **Placement is 1:1 and exhaustive.** 1,961 references / 1,961 distinct ids / 1,961 pool files ·
  **0 unreferenced · 0 dangling · 0 reused across modules.** Every exercise belongs to exactly one
  module, and the CNXML says which.
- ▶ **So a per-module (or per-exercise) unit is well defined BY THE DATA.** What creates the
  mismatch is that `exercise-extract.js` bundles a whole **chapter** into one segments file —
  **35–86** exercises, **77–392** segments — against Tier 1's one-module unit. **That aggregation
  is a choice we made.**
- ⚠️ **Re-bundling does not make the Tier-1 checks work.** They compare segment text against
  CNXML, and organic's CNXML holds only pointers — the prose is in JSON. **But the two problems are
  now SEPARABLE**, which they were not before: *what the unit is* and *what the unit is compared
  against* are different questions with different answers.
- `stimulus_html` is HTML, and the guard the Tier-1 checks share binds on `md:content-id`, which
  has nothing to match in an exercise JSON.
- ⚠️ **`01-source/exercises/` is a FETCHED CACHE**, not part of the OpenStax CNXML provenance set.
  CLAUDE.md §C93 places `exercises/` outside every hash gate and restorable by no refetch.

▶ It opens a real option (§5, Option D) that is invisible if you are told only "no source exists".

---

## 3. WHAT EACH BRANCH ACTUALLY COSTS — measured, not reasoned

Run through the real 33-check registry over real source-less units, with a source-**bearing**
control carrying an identical key set.

### The gate branch costs FOUR blocking checks, not six

Reproduced independently for this brief, through the real `runTier(1, …)`, with an E9 fixture that
passes in every arm and a source-**bearing** control carrying the identical key set:

```
CONTROL organic ch03/m00031 (HAS source)  blockingFailures = 2  [E5:FAIL  E6:SKIPPED]
        E1 PASS/5  E2 PASS/5  E3 PASS/5  E4 PASS/5  E5 FAIL/5  E6 SKIP/0  E7 SKIP/0  E9 PASS/5

organic ch01/exercises      (no source)   blockingFailures = 5  [E1 E2 E4 E5 E6 all SKIPPED]
        E1 SKIP/0  E2 SKIP/0  E3 PASS/206  E4 SKIP/0  E5 SKIP/0  E6 SKIP/0  E7 SKIP/0  E9 PASS/5

chem    ch01/chapter-metadata (no source) blockingFailures = 5  [E1 E2 E4 E5 E6 all SKIPPED]
```

🔴 **READ THE DELTA, NOT THE RAW COUNT — and this is the whole reason L36① says six.** The raw
count on a source-less unit is **5**. But **E6 SKIPs in the CONTROL too**, so it belongs to a ctx
key the loader did not supply, not to the source side. Subtract what the control also loses and
the attributable cost is **E1, E2, E4, E5 — four.**

§C82 **L36① says six**, and it is the same error one size larger: measured against a *minimal*
ctx, the control loses E6 **and** E9 as well. ▶ **A count of what a source-less unit fails is not
a measure of what source-lessness costs.** Only the difference from a control is.

⚠️ E5 is a special case worth naming: it SKIPs on a source-less unit and **FAILs on the control**
(the committed-vintage red, §C82 L110/L117). It was never going to pass today either way.

- **E3 is the one blocking Tier-1 check that JUDGES a source-less unit and passes** — it
  deliberately does not use the shared source guard, and its docstring says why. **A source-less
  policy must not switch E3 off by accident.** It is the cheapest half of this decision.
- E6 and E9 are source-independent by construction.

### The skip branch: what is left watching, and when

| tier | on a source-less unit | when it runs |
|---|---|---|
| Tier 1 | **4 blocking checks SKIP**; E3 runs and passes | before the spend |
| Tier 2 | **all 3 blocking checks run at full population** (A6, A2b, A2c — PASS at examined 206) | **after the spend** |
| Tier 3 | its only two source consumers (R1, R5) are **advisory** | after |
| Tier 4 | never reads source | after |

▶ **So "91% reaches the paid MT ungated" needs narrowing rather than falsifying.** These units are
not ungated — they are **un-Tier-1'd**. Tier 2 judges them exactly as it judges a real module. But
Tier 2 reads `02-mt-output`, which exists **only once the money is spent**. **Before the spend,
the only content gate left on a source-less unit is E3, whose base rate is 0% corpus-wide.**

### The residual — what genuinely nothing covers

Measured by planting each defect class and watching, with positive controls:

- **E1's legacy-marker class** — genuinely uncovered.
- **E2 / E5's source-comparison classes** — genuinely uncovered (there is nothing to compare to).
- **E4's duplicate-seg-id half is recovered later**, by blocking Tier-2 check A2b — after the
  spend, but caught.

⚠️ **One claim from the research was corrected and should not be repeated to you as filed:**
"gating buys zero additional detection" was **materially overstated**. Gating buys no detection
*that a skip would have missed*, but that is a narrower statement than it sounds. What gating
converts is **silence into a halt** — which is a real property, and the argument for it is that a
halt is visible and silence is not.

---

## 4. PRIOR ART: THE CODEBASE ALREADY ANSWERS THIS, TWICE

Independently confirmed: **the existing code already excludes `exercises` by name, in two places,
each with a written rationale.** The battery's own corpus walker excludes `chapter-metadata` for
the same reason. So "treat this unit kind differently" is not a new precedent being set here — it
is an existing convention that has never been written down as policy.

---

## 5. THE OPTIONS

### Option A — GATE them (hand the bundles to Tier 1 with no `cnxml`)
- 4 blocking checks SKIP per unit; a blocking SKIP is a halt.
- **Cost:** the run stops on 31 organic bundles that may be perfectly fine. Zero detection gained.
- **When it is right:** if you would rather a human look at every one than have any go unexamined.

### Option B — SKIP them (exclude from Tier 1 entirely)
- **Cost:** 6,664 segments reach the paid MT with only E3 (0% base rate) watching beforehand.
  Tier 2 catches them afterwards, and E4's class is recovered there.
- ⚠️ **The failure mode is not a halt, it is a false clean** — the register's L19 amendment already
  measured that the gate a loader would be modelled on (`verify-extraction-coverage.js`) does
  `missingSource++; continue`, i.e. **waves a source-less unit through**.
- 🔴 **Whichever way this goes, the exclusion must be REPORTED PER UNIT.** A silent exclusion and a
  clean verdict are the same bytes.

### Option C — PER-UNIT-KIND POPULATION *(the research's recommendation, and mine)*
Run the **judgeable subset** of Tier 1 on source-less units rather than all-or-nothing.
- **The mechanism already exists**: `runTier(tier, ctx, checks)` takes an explicit check list. No
  change to Plan B, no change to the ctx contract.
- E3 runs and judges. E1/E2/E4/E5 are not *silently* skipped — they are **declared inapplicable to
  this unit kind, per unit, in the report**.
- **Why the binary stood for weeks, and nobody named it:** the VERDICT enum has no state meaning
  *"not applicable to this unit kind"* that a blocking check can return without halting —
  `blockingFailures` is `blocking && (FAIL || SKIPPED || examined === 0)`. That forces every
  framing into gate-and-halt or skip-entirely. **The escape does not need a new verdict; it needs
  the check list.**
- ⚠️ **One load-bearing part of the research's version of C was REFUTED and must not be repeated
  as filed.** It proposed deriving the loader's unit list from `api-translate.js`'s exported
  discovery so that *"the gated set equals the spend set by construction"*. Measured: the exported
  API returns **197 of 220** spend units and silently omits **all 23** chapter-metadata units. The
  **principle is sound** — whatever the spender pays for must have a Tier-1 verdict — but it must
  be **pinned by a test asserting the loader's unit count equals the spender's**, not assumed from
  an import.

### Option D — PER-EXERCISE ctx (1,961 units, source-anchored)
Only visible because §2 measured the bijection. Build a per-exercise ctx from the JSON cache.
- **Cost:** needs new checks — the existing Tier-1 gates cannot consume HTML with no
  `md:content-id`. Not a policy exception; a build.
- ⚠️ And it anchors gating to a **fetched cache that no hash gate covers**.
- **Not recommended now.** Worth recording so it is not rediscovered as novel later.

---

## 6. 🔴 WHAT THIS RULING DOES *NOT* UNBLOCK — read before deciding

The research audited Plan C against the ctx contract, and the honest headline is uncomfortable:

> **The source-less question is the smallest of the loader's open questions, not the biggest.**

Measured against `docs/superpowers/plans/2026-08-24-c82-plan-c-driver-and-ledger.md`:

- the word **"loader"** appears **0 times**; **"ctx"/"context" 0 times**
- **24 of the CheckContext contract's 34 keys** appear **0 times**
- of the battery's **19 blocking checks, exactly ONE (E9)** has its inputs named by any Plan C task
- **Tier 0 is absent from Plan C entirely**, except inside its own *"Deliberately NOT in Plan C"*
  list — 5 checks, 4 of them blocking

▶ **So a ruling here unblocks Plan C's loader from being DESIGNED; it does not mean Plan C as
written can be executed.** The loader is roughly: 5 ctx builders, 3 spawns, 2 snapshots and a
pipeline stage — and it has no task. **That is a separate thing to decide, and it is bigger.**

⚠️ Tier 0's two blocking failures (G1, G3) are **already** an open item — runbook **1.4** — and are
not part of this ruling. Do not count them twice.

---

## 7. THE ASK

**Rule on organic's 31 `exercises` bundles.** A, B, C or D above.

**Recommendation: C**, with these conditions:
1. E3 runs on every source-less unit — it is the only pre-spend content gate they have.
2. The exclusion of E1/E2/E4/E5 is **reported per unit**, never silent.
3. A test pins the loader's unit count against the spender's work-list, so the two cannot drift.
4. `chapter-metadata` (23 units) and the `(b)/(c)/(d)` variants (49) are handled as hygiene under
   the same mechanism, without a separate ruling.
5. 🔴 **The unit is the MODULE, not the chapter.** The source gives an unambiguous exercise→module
   mapping (§2); bundling per chapter is our own choice and it is what makes the unit mismatch.
   Per module, an exclusion covers one module instead of a whole chapter's worth, the ledger can
   name what was excluded, and the exercise half stops being a special case in the driver.
   ⚠️ This is a change to `exercise-extract.js`'s output shape, so it is **not free** and it must
   not be smuggled in as part of the loader — but it is the direction, and deciding it now costs
   nothing while deciding it later costs a re-extract.

**What would change my mind:** if you would rather have 31 halts than 6,664 segments judged by one
0%-base-rate check before the spend, take A — it is the conservative answer and it is defensible.

---

## Sources

- Register `docs/plans/2026-07-21-post-item17-followup-campaign.md` — §C82 **L19** + its amendment,
  **L21** + amendment, **L36①**, **L59**, **L133**.
- `test-results/c82-organic-extraction-share-2026-08-27.md` — the share measurement (91.2% → 38.0%,
  and why the exposure did not move).
- Runbook `docs/plans/2026-08-23-clean-break-re-mt-runbook.md` step **3.1** (the order) and **1.4**
  (Tier 0, separate).
- `test-results/c82-organic-exercise-architecture-2026-08-27.md` — the pointer architecture, the
  1:1 census, the id grammar, **and a false finding retracted in full**: two pool entries reported
  as referenced by nothing are both in the published book. There are two `os-embed` spellings and
  my pattern matched one; the corpus holds exactly two variant references and they were precisely
  the two I called orphans. ▶ **A control on the VALUES a detector returns is not a control on its
  COVERAGE** — §C82 **L135**.
- The ctx contract: the `CheckContext` typedef in `tools/remt-battery.js`.

⚠️ Every number in this brief was produced by execution against `main` @ `50f1ea80` with a clean
tree, and each was handed to a second reader briefed to refute it. **Three claims were corrected
and one refuted in that pass; all four are marked in place above rather than quietly dropped.**
