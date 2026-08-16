<!-- ⚠️ FROZEN SNAPSHOT — banner-dated 2026-08-16, taken at branch HEAD `b83e382d`, -->
<!-- then CORRECTED 2026-08-16 by Task 9's review (renumber + one falsified row). -->

# §C85 / §C86 register entries — DRAFT, not yet applied

> **🔴 RENUMBERED 2026-08-16 — these were drafted as §C84 / §C85 and BOTH numbers were
> wrong.** `C84` is already taken by *the glossary net-value investigation* (register
> line 338, P1, cross-referenced from line 477), so applying the draft as written would
> have put **two items numbered C84** into the file that owns open-work status — and a
> reader following "§C84" would have landed on the glossary item instead of the media
> defect, losing the `m00032`-blocks-organic-preview dependency. `C85` was free as an
> item but was already promised to the *second* of these two by the register's own
> RESUME block, so both shift: **media defect → §C85 · `validate-chapter` → §C86.**
> Found by Task 9's review; the collision was committed in three places and all are
> corrected except the frozen execution ledger, which is re-snapshotted at branch close.

> **⚠️ This is a draft of text destined for the active register**
> (`docs/plans/2026-07-21-post-item17-followup-campaign.md`), **not a second register.**
> It carries **no authority**: while it sits here unapplied, the active register is the only
> owner of open-work status. Apply it there and then **delete this file** — leaving both is
> exactly the two-sources-of-truth failure § *One source of truth* was written to stop.
>
> Companion to [`2026-08-15-c82-plan-a-execution-ledger.md`](2026-08-15-c82-plan-a-execution-ledger.md).

---

---

## New item — §C85

- **C85 · 🔴 INJECT DROPS AND DUPLICATES WHOLE `<media>` ELEMENTS IN ORGANIC — READER-VISIBLE, AND ONE IS INSIDE §C80's SCOPE** — **[CODE]** — **P1** — *found 2026-08-16 by §C82 Plan A's Task 9 round-trip check, before that check was even committed.*
  - 🔴 **Measured by extracting each `01-source` module and injecting its own English straight back, then counting `alt=` on both sides.** The whole `<media>` element moves — `<media>`, `<image>` and `alt` counts all shift together — so a reader sees a **missing or doubled image**, not merely absent alt text.

    | book | module | source media/image/alt | injected | effect | §C80 scope |
    |---|---|---|---|---|---|
    | `lifraen-efnafraedi` | **`m00032`** | 36 / 36 / 36 | **35 / 35 / 35** | image **DROPPED** | ✅ **IN — organic preview** |
    | `lifraen-efnafraedi` | `m00046` | 4 / 4 / 4 | **5 / 5 / 5** | image **DUPLICATED** | out (book, not preview) |
    | `lifraen-efnafraedi` | `m00023` | 11 alt | 12 alt | duplicated | out |
    | `lifraen-efnafraedi` | `m00069` | 6 alt | 9 alt | duplicated ×3 | out |
    | ~~`edlisfraedi-2e`~~ | ~~`m42296`~~ | ~~24 alt~~ | ~~**23 alt**~~ | 🔴 **WITHDRAWN — NOT A DEFECT** | out (book dropped by §C80) |

  - 🔴 **THE `m42296` ROW WAS FALSIFIED 2026-08-16 BY TASK 9's OWN REVIEW — it is a counting artefact, not a lost image, and it is struck out above rather than deleted because the way it got here is the reusable part.** `countAlt` regexes raw text, so it counts `alt=` **inside XML comments**. `m42296` holds 24 alt attributes of which **2 are commented out**; its **live markup round-trips 22 → 22 clean**. Confirmed independently with an **XML DOM parse**, an instrument structurally incapable of seeing inside a comment — which is what makes it evidence rather than a second opinion. ▶ **The lesson is this register's own:** the first measurement and the check agreed with each other because they *shared the counter*, and two implementations agreeing rules out transcription error, never a shared premise.
    - ✅ **The imprecision cannot reach the §C82 loop, and that was measured, not assumed.** Censused across all six books: commented-out alt exists **only** in `edlisfraedi-2e` (4 modules — `m42296` ×2, `m42456` ×2, `m42493` ×1, `m42531` ×1) and is **0 of 149** in chemistry and **0 of 342** in organic — zero in both books inside §C80's re-MT scope. So `countAlt` is deliberately **not** changed: stripping comments would move all five fixture pins and both discrimination vintages for no in-scope gain.
  - ✅ **`efnafraedi-2e` is CLEAN — 149 modules, 0 loss, 0 gain.** That is the negative control that makes the organic result mean something, and it means the full chemistry re-MT is not exposed to this.
  - 🔬 **THE STRUCTURAL CAUSE OF `m00032` IS IDENTIFIED** (Task 9 review, 2026-08-16): the module's **one table `<entry>` that holds both a `<media>` and a `<para>`** is exactly the one dropped. The organic *gains* were separately confirmed as **genuine element duplication** — well-formed XML with a doubled `<image src>` — so the "reader sees a doubled image" reading is right, not an alt-only artefact.
  - 🔴 **WHY §C81's OWN VERIFICATION COULD NOT SEE THIS, and the lesson generalises past this bug.** §C81's review round 2 ran a round-trip diff over all 1,192 modules and concluded *"ZERO modules gained an alt attribute"*. That measurement compared the **base vintage against the new vintage** — it asked *"did my change alter the injected alt count?"*. This one compares **source against injected output** — *"does the output carry what the source had?"*. ▶ **A vintage-diff is structurally blind to a defect present at BOTH vintages.** This is the register's own rule (*"a diff is only a measurement if both sides are the same vintage"*) firing in the direction nobody checks: same-vintage agreement is evidence of **stability**, never of **correctness**.
  - ▶ **`m00032` must be resolved before organic's preview is re-MT'd** (§C80 ruling: organic preview in full). The other three are out of the preview but in the book; `m42296` is in a book §C80 dropped.
  - ⚠️ **The check that found this is committed by §C82 Plan A Task 9** (`tools/lib/inject-roundtrip.js` + `tools/__tests__/inject-roundtrip-corpus.test.js`), which **pins the four organic modules plus the `m42296` counter behaviour** so any change is visible. It is a pin, not a fix.
  - 🔴 **AND THE CHECK HAS A COVERAGE BOUNDARY THAT §C82's GATING DESIGN MUST NOT INHERIT — IT COUNTS ATTRIBUTES, NOT CONTENT.** Measured by Task 9's review: deleting **every** `:alt:` segment from the parsed map before `buildCnxml` — 951 chemistry, 1,918 organic and all 11/19/8/8/22 in the regression fixtures — leaves **all eight committed assertions green**, because `readAlt` falls back to `alt.text` (the extraction-captured **English**) and `buildFigure` copies id-bearing figures verbatim. ▶ **So a future divergence between the alt segment ids written to `02-for-mt` and the ids `readAlt` looks up would ship ENGLISH alt text to Icelandic readers — §C81's original reader-visible symptom — while this check reports `rawAlt === outAlt` on all 491 in-scope modules.** **A green round-trip is evidence about attribute COUNT and nothing at all about attribute CONTENT.** Catching that class needs a **sentinel distinct from the source text**, which is a different instrument and is not built. The boundary is stated in the module docstring; say so wherever §C82 cites "round-trip green" as a gate.
  - *[severity: reader-visible missing/duplicated images · reader-visible: **yes** · blocks: organic preview re-MT (`m00032` only) · relates: §C80, §C81, §C82]*

---

## New item — §C86

- **C86 · 📐 `validate-chapter.js` IS CHAPTER-SCOPED BY DESIGN, AND THE §C82 BATTERY SPEC PUT IT IN THE WRONG CATEGORY** — **[CODE]** — **P3** — *found 2026-08-16 during §C82 Plan A pre-flight.*
  - The battery spec's §5 item 7 lists `validate-chapter.js` among "the four tools with no `--module`" needing a per-module wrapper. **Measured 2026-08-16 by counting the keys of its `VALIDATORS` object: two of its SIXTEEN checks reconcile ACROSS a chapter's modules** *(this said "twelve" until the whole-branch review; the ratio is 2-of-16 = 12.5%, not 2-of-12 = 16.7% — a miscount in the very entry whose point is that this tool was miscounted once already)* — `figure-numbers` (*"Figure numbers are sequential **within chapter** (no gaps)"*) and `cross-references` (*"Cross-references match existing figure/table captions"*, matched against the chapter-wide caption set). Neither is computable from one module.
  - ▶ **So honouring `--module` there would make two checks silently produce WRONG answers** — strictly worse than the silent drop `parseArgs` gives today. It belongs in the spec's existing *"chapter-only by design → Tier 4"* category, alongside `cnxml-render-fidelity-check`.
  - ✅ **Handled in Plan A Task 8**: `validate-chapter` and `cnxml-render-fidelity-check` both **reject** `--module` loudly; only `scan-residue` honours it.
  - ⚠️ **Also worth recording: `validate-chapter` never prints a module id at all** (`grep -coE 'm6[0-9]{4}'` over a full run → **0**), which is why a "scoped run omits the other module" assertion is unfalsifiable there.
  - *[severity: a spec miscategorisation that would have shipped two silently-wrong checks · reader-visible: no · blocks: nothing · relates: §C82, §C83]*

---

## Amendment to §C82 — record before the loop is built on it

- 📊 **E2's real base rate is measured: 1.3% of modules, so it is ELIGIBLE TO BLOCK.** Over all 149 chemistry modules the SHIPPED instrument reports **2 firing modules, 3 findings out of 17,051 markers examined (0.018% by occurrence), 385 skipped as unmatchable** — the two firing modules are exactly the battery's named SHOULD-TRIP fixtures `m68710` and `m68733`. 147 clean controls, 0 false positives. Under the battery's *"base rate over ~5% cannot be blocking"* bar. *(The instrument it replaces ran at 89% false positives by occurrence and could not see `m68710` at all.)*
  - 🔴 **CORRECTED 2026-08-16 — THIS LINE RECORDED THE PROTOTYPE'S NUMBERS ("2 findings out of 16,630"), NOT THE SHIPPED INSTRUMENT'S, AND THE SAME MEASUREMENT EXISTED IN THREE CONFLICTING VERSIONS**: this draft said 2/16,630, the register's RESUME said 3/16,991, and `tools/__tests__/bracket-body-corpus.test.js` pins **17,051 / 385 / 3**. **The committed test is the owner; the prose was stale in both places.** It matters because Plan B derives E2's blocking eligibility from this number, and a later run of the shipped instrument reporting 3 where the record says 2 reads as instrument drift — halting a paid run over a documentation error. *(The finding count differs, not just the denominator, which is what makes the two citable as contradicting each other.)*
  - ⚠️ **The source scan must cover the WHOLE DOCUMENT, not `<content>`.** `<glossary>` sits **outside** `<content>` (m68768: `</content>` at **character** offset 69688, `<glossary` at 69699 — these are JS string indices, **not byte offsets**; `head -c` or a hexdump lands ~507 bytes early because the file is multi-byte UTF-8) while the extractor emits **763 `glossary-def` + 763 `glossary-term`** segments across chemistry. A `<content>`-scoped scan reports every glossary-sourced marker as a swallow — measured, that drives the rate from 1.3% to **10.1%** and fires on the MUST-NOT-TRIP fixture.
- 📊 **E5 as the battery specifies it would have been a guaranteed false halt.** Plain `source alt == emitted alt` fails on **198 of chemistry's 1,149** and **32 of organic preview's 132** — §C81's structural shortfall — a base rate the battery's own 5% rule disqualifies. Re-specified in Plan A to gate on the **reachable** set and *report* the unreachable one. Measured: reachable **952**, live extractor emits **951**, and it fires on **exactly one module (`m68727`, 6→5)** with 148 clean controls.
- 📌 **The §C82 run record now separates glossary INTENT from OUTCOME.** `arm` records what the caller asked for; `chunksWithGlossary`/`chunksTotal` record what actually went on the wire. Needed because `filterGlossaryForText` returns `null` when no term matches a chunk, and the truncation retry drops the glossary entirely — so a module could have recorded `arm: 'glossary'` while **every** API call carried none, corrupting the §C82 ③ arm decision on exactly the large, splitting, sparse-hit modules that matter most to it.
