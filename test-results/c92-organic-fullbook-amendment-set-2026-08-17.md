<!-- FROZEN EVIDENCE — banner-dated 2026-08-17. Per CLAUDE.md § One source of truth this is
     EVIDENCE, never status. If it disagrees with the active register, THE REGISTER WINS. -->

<!-- The full amendment set produced when the [LEAD] ruled organic up to the complete 342-module
     book and asked for an OpenStax lookup in the §C82 loop. Four design lanes + assembly;
     5 agents, 212 tool calls, repo unmodified throughout.
     The register entries §C80/§C92/§C93/§C94 POINT here for detail rather than restating it.
     ⚠️ Numbers are marked [M]/[D]/[E] inline. Do not quote one without its marker, its counting
     unit, or its basis (dry-run CEILING vs billed EXPECTATION — the two are ~26% apart and are
     deliberately never averaged). -->

# AMENDMENT SET — full organic, the source refresh, the upstream lookups, and the licence-keyed guard

Assembled 2026-08-17 from four design lanes. **Repo not modified** — `git status --porcelain` = 0 lines at start and finish. Everything below is proposed text for the controller to apply. Durable copy: `/tmp/claude-1000/-home-siggi-dev-repos-namsbokasafn-efni/6f742c16-4311-4f8c-9cfb-66b2a58b3234/scratchpad/assembly/AMENDMENT-SET-2026-08-17.md`

---

## DECISION SUMMARY

1. **Scope (RULED, decisions 1–2):** organic goes from the 17-module preview to **all 342 source modules** [M]; chemistry FULL unchanged; biology/micro/physics stay dropped. An OpenStax **integrity** lookup enters the §C82 loop **per book, before the first ISK** — nothing new per module.
2. **Money:** ceiling **65,583 ISK** [D] (`--dry-run` basis) / expectation **≈51,267 ISK** [D] (billed-equivalent) — **+13,945 / +12,867** against the approved ~51,640 / ≈38,400. ▶ **The scope is ruled; the budget delta is NOT yet approved.**
3. **The dominant cost is not ISK:** organic review burden **643 → 10,608 segments** [M]; two-book total **33,074** [D], against **368 segments applied, ever** [M].
4. **Source refresh (decision 3 — RECOMMENDED, NOT RULED):** upstream licence **has not moved** [M]; the whole delta is 8 commits / 15 files / 12 modules / **25 translatable units = 2,084 chars = 0.14% of the book** [M/D]. It must take **`media/`** too — one erratum changed *only* a JPEG. Three-step written consent still required.
5. **A guard is needed either way:** **nothing that writes `01-source/` reads a licence** (0/0 references across all four writers, against 18/6 in the control) [M], and `--allow-overwrite-source` reaches the irrevocable CC BY books. Two of the three findings are live on today's `main`.
6. **Order:** [LEAD] rules the refresh → refresh (consented, incl. media) → **§C88 + §C90 + §C81's `<para>` strip in ONE re-extract** → both-arms glossary run → organic module 1. The extraction-vintage window closes at module 1.
7. **§C88's own scope ruling now rests on a voided premise** ("213 of them sit in modules §C80 is not buying") and must be re-taken before §C88 is planned.
8. **Still needing a lead decision:** the source refresh + its consent, and the budget delta. Everything else is [CODE].

---

## PROVENANCE OF THE NUMBERS IN THIS DOCUMENT

Re-derived first-hand in this session, read-only: organic `01-source` = **342** modules / 3,156 media / pin `2a1f8284…` (from `.source-info.json`) · chemistry = **149** modules · organic `01-source/exercises/` = **1,961** tracked files · chemistry `01-source/docx/` = **273** tracked files · `.source-info.json` present for 4 of 5 source-bearing books, **absent for `efnafraedi-2e`** · `.source-manifest.json` present for all 5 · licence-blindness census (`grep -ac`, 0/0 in all four `01-source` writers/verifiers vs **18/6** in `tools/lib/book-licences.cjs` as positive control) · `download-source.js:190-199`'s guard and its delete-prescribing message · `generate-source-manifest.js:31`'s `CC BY` `NOTE` constant · `source-manifest-baseline.test.js`'s CNXML-only enumeration · the battery spec's amendment banner (5 items, so item 6 is next) · **C88 spec §2's verbatim OUT ruling** · **residue-allowlist census across all five books** (new — see Reconciliation R1).

Carried from the lane reports, whose reproduction scripts live only in a session scratchpad and are **not committed**: the 8-commit / 15-file upstream compare and its per-module classification · the 25-unit / 2,084-char translatable delta · the U1a/U1b/U1c blob-SHA sweeps · the errata tables · the ISK figures, which come from `test-results/organic-expansion-openstax-oracle-2026-08-17.md` (frozen evidence, committed). ▶ **If the register is to carry these as `[M]`, commit the three reproduction scripts to `test-results/` before the scratchpad is reaped** — otherwise mark them `[M, per the 2026-08-17 brief]` and let the two shas plus the compare URL be the re-derivable part.

---

## RECONCILIATION — where the lanes disagreed, and the adjudication

**R1 · Does a re-extract void organic's residue allowlist? — MEASURED; the lanes were on opposite sides and one is wrong.**
The scope lane asserted "organic's 12 `residue-allowlist.json` entries are voided wholesale by a re-extract"; the delta lane asserted the opposite. **Measured this session, unit = allowlist entries:** organic holds **12 entries / 10 distinct `moduleId`s, 0 of them CNXML-module-shaped** — every one is an exercise-track id (`11-03-OC-P06`, `26-99-OC-AP06`, …). Chemistry holds **4 entries, 4 of 4 CNXML-module-shaped** (`m68729`, `m68750`, `m68784`, `m68809`); the other three books have **no allowlist file at all**. The chemistry row is the positive control that makes organic's zero mean something. ▶ **Adjudication: §C82's rule is correct and the scope lane misapplied it.** A **CNXML** re-extract renumbers **CNXML** seg-ids; organic's allowlist lives entirely on the *other* track and survives. **Chemistry's 4 entries ARE voided by chemistry's re-extract** — editorial rework nobody had counted, and it is in this deliverable because the census had never been run.
▶ **The payoff is a single trigger:** organic's 0-ISK exercises exemption **and** its allowlist's survival both hold for exactly as long as nothing touches `tools/exercise-extract.js`. One rider covers both.

**R2 · CNXML-only vs CNXML-plus-media.** The delta lane requires `media/`; the scope lane's sequencing said "`*.cnxml` only". They collide only because the scope lane was aiming at `exercises/`. ▶ **Adjudication: the write set is stated once, in §C93's G4 terms** — `chNN/*.cnxml` + `appendices/*.cnxml` + `media/*` + the three metadata sidecars; **not** `docx/`, **not** `exercises/`. Both other sections point at it.

**R3 · Register numbering.** Two lanes proposed `§C90`, one proposed `§C92`. **Highest existing is §C91** (verified; §C90 = `m00309` wrong image, §C91 = the three measurement defects — both logged 2026-08-17 from the same brief). ▶ **Assigned: §C92 = the refresh delta + recommendation · §C93 = the licence-keyed guard · §C94 = the upstream-lookup placement.** The guard spec filename is `…-c93-…` accordingly. **Confirm nothing else has claimed 92–94 before applying.**

**R4 · Errata filters — two different predicates, not a contradiction.** For chemistry, one lane reports *62 with `resolution: Approved`* and the other *78 actionable* (= not `Will Not Fix`) out of the same 78 corrected since the copy date; the 16-record remainder carries some other resolution and is **unclassified — UNKNOWN**, settled by one query. **The organic rows agree exactly across both lanes** (210 records / 5 corrected since 2026-03-23 / **4** actionable / 1 `Will Not Fix` / 37 open with no `corrected_date`), and organic is the book under decision. ▶ **Adjudication: name the predicate beside every count; do not merge them.**

**R5 · Consent.** The guard lane's CLAUDE.md rewrite would have narrowed the three-step consent to the CC BY books — which is one of the options the delta lane was *asking the lead to rule on*. ▶ **Adjudication: the consent rule stays UNCONDITIONAL in the proposed CLAUDE.md text; the mechanical gate is additive.** Narrowing it later is a clean separate decision. Organic's never-CC-BY status removes the substantive risk, not the procedural guard.

**R6 · Chemistry's missing `.source-info.json`.** Both the delta and lookup lanes found it; the lookup lane additionally recovered a candidate (`dba91045`, 2026-01-14 — newest upstream commit at or before the recorded 2026-01-19 copy date, 148 of 149 modules matching). ▶ **Adjudication: §C94 owns it** (it owns the recovery method); §C92 cites.

---

# SECTION 1 — Register: the full-organic scope amendment

**TARGET FILE:** `docs/plans/2026-07-21-post-item17-followup-campaign.md`

> ⚠️ **APPLY 1a → 1b → 1c → 1d → 1e IN THAT ORDER, or treat every line number below as PRE-EDIT and match on the quoted text instead.** 1b inserts a large block, so §C80's footer will not be on line 470 afterwards; 1d inserts above line 9, shifting everything. Every edit is uniquely identifiable by its quoted first words.

## 1a — REPLACE the §C80 title line (line 451, pre-edit)

```
- **C80 · ✅ [LEAD] SCOPE RULING FOR THE RE-MT — CHEMISTRY AND ORGANIC, BOTH IN FULL; EARLIER RULINGS RETAINED BELOW AS EVIDENCE** — **[LEAD]** (decision, taken; re-scoped twice) — **P1** — *first ruled 2026-08-12, re-scoped 2026-08-15, re-scoped again 2026-08-17. **This SUPERSEDES §C56/§C66's scope**, which priced "everything already extracted plus organic's gap". Recorded the same evening each ruling was taken, because §C79 is this file's own worked example of a repeatedly-discussed decision that lived nowhere.* ⚠️ **This title named a scope that had been void for two days** — it carried "CHEMISTRY AND BIOLOGY IN FULL … ~112,200 ISK" through the 2026-08-15 re-scope that voided both halves. **Update this headline on every re-scope, and keep the ISK OUT of it — the scope is one clause, the budget is a table.**
```

## 1b — INSERT as the new first sub-bullet of §C80, immediately above the existing `🔴 **⚠️ SUPERSEDED 2026-08-15 …**` block (line 452, pre-edit)

```
  - 🔴 **⚠️ AMENDED 2026-08-17 BY A [LEAD] SCOPE-UP — READ THIS FIRST. ORGANIC GOES FROM PREVIEW TO THE COMPLETE 342-MODULE BOOK. THE RUN IS STILL TWO BOOKS; THE CEILING IS ~65,600 ISK, NOT ~51,640.**
    - 🔴 **THE SCOPE IS RULED. THE BUDGET AT THE NEW NUMBER IS RE-DERIVED AND *NOT YET APPROVED*.** The 2026-08-15 approval covered **~51,640** (ceiling). This ruling raises it to **~65,600**. ▶ **[LEAD] approval of the delta — +13,945 ceiling / +12,867 expectation — is OUTSTANDING**, recorded separately from the scope so this register never carries an approval nobody gave (the §C79 class this file exists to prevent).
    - 📋 **THE NEW RULING:** **`efnafraedi-2e` in FULL** (unchanged) + **`lifraen-efnafraedi` in FULL — all 342 source modules, not the 17-module preview.** `liffraedi-2e`, `orverufraedi` and `edlisfraedi-2e` remain **DROPPED**. ▶ **The goal is unchanged and its reach is not: a clean break from the old pipeline across two COMPLETE textbooks.** *(Counted as `.cnxml` under `01-source/`: organic **342** [M], chemistry **149** [M], chemistry standing as the positive control.)*
    - 💰 **RE-DERIVED, IN TWO BASES THAT ARE NOT AVERAGED.** Method → [`test-results/organic-expansion-openstax-oracle-2026-08-17.md`](../../test-results/organic-expansion-openstax-oracle-2026-08-17.md) (frozen evidence; if it disagrees with this register, **this register wins**). **Left column is a CEILING (`--dry-run`, whole file), right an EXPECTATION (billed-equivalent)** — §C91 ① owns why.

      | book / track | scope | unit | ceiling | expectation |
      |---|---|---|---|---|
      | `efnafraedi-2e` | **FULL** — unchanged | 149 modules (170 files) | **43,078** [M, as approved 2026-08-15] | **≈32,900** [D — **circular by construction**, see below] |
      | `lifraen-efnafraedi`, CNXML track | **FULL** *(was: preview)* | 342 modules / 10,608 segments | **22,505** [M] | **≈18,361** [D] |
      | `lifraen-efnafraedi`, exercises track | **NOT re-bought** | 31 files / 1,961 exercises | **0** | **0** |
      | **TOTAL** | | | **65,583** [D] | **51,267** [D] |
      | *(retained: the total this supersedes)* | *chem full + organic preview* | | *51,638, quoted ~51,640* | *≈38,400* |
      | **DELTA** | | | **+13,945** [D] | **+12,867** [D] |

    - 🔴 **CHEMISTRY'S EXPECTATION CELL IS STAMPED CIRCULAR, AND THE STAMP IS THE POINT.** The ≈38,400 expectation for the superseded scope was itself built as *chemistry-billed + organic-preview-billed*, so `38,400 − 5,494 = ≈32,900` returns its own input — **agreement by shared premise, not corroboration.** It is printed anyway because the table's total and organic row disclose it by subtraction, and an unlabelled implicit number is worse than a labelled circular one. ▶ **Never quote ≈32,900 as measured.** The TOTAL is routed through published figures only, never through that cell: **38,400 − 5,494 + 18,361 = 51,267** [D]. ▶ **A chemistry billed figure is UNKNOWN as an independent measurement; a `--dry-run` on a fresh chemistry extract settles it at 0 ISK**, and it belongs before the CHEMISTRY leg, not organic's.
      - ⚠️ **THE CHEMISTRY CEILING CARRIES A VINTAGE CAVEAT — carried, not resolved.** 43,078 is composed from **old-vintage** committed `02-for-mt` text (35,257) plus alt priced on **all 1,149** attributes (7,821). Organic's equivalent committed text moved **+14.9%** on re-extract; chemistry's may too — **UNMEASURED**. Evidence *against* a chemistry analogue, not proof: the brief independently reports chemistry's like-for-like whole-file total as 4,262,149 chars → **42,621 ISK** [M], **−1.1%** against the composed 43,078, and that figure's own extraction vintage is not stated. **Two instruments, both reported, neither averaged.** ▶ **The fresh `--dry-run` settles it, free.** 📌 **Do not "correct" the 7,821 down to the reachable-only ≈6,918** — **§C88 is the item that makes those attributes reachable**, so the all-attribute figure becomes the right one exactly when §C88 ships.
    - ⚠️ **"ORGANIC IN FULL" IS NOT "PREVIEW PLUS MORE" — IT ALSO REMOVES A PLANNED RE-BUY.** The retired 8,560 line re-bought the 31 exercise files and 2 chapter-title files (**7,246 ISK** of it) that are already translated at current vintage. They are **not** re-bought here; the organic line is a single CNXML-track figure covering all 342 modules, alt included. **22,505 − 8,560 = +13,945**, which is the whole delta.
      - ✅ **THE EXEMPTION IS MEASURED ON BOTH CRITERIA THAT MATTER.** ① **Dialect:** organic's committed `02-mt-output` carries the legacy `{{i}}`/`{{b}}`/`{{term}}`/`{{fn}}` dialect in **0 of 50** `.md` files against the bracket dialect in **49 of 50** — and the zero discriminates, because the same sweep finds the legacy dialect in **113 of chemistry's 177** and **4 of micro's 12** [M, `grep -ra`, unit: files]. **§C56's clean break is already satisfied for organic's existing MT; it is chemistry that carries the old dialect.** ② **Vintage/ownership:** the exercises track is produced by `tools/exercise-extract.js` from a **different upstream** — a READ-ONLY cache of `exercises.openstax.org/api/exercises` (`tools/resolve-os-embed.js:22`) — and no extraction-side fix in flight touches it (§C88's spec names `cnxml-extract` 7 times and `exercise-extract` **0**). ▶ **It is therefore outside §C82 ①'s one-fingerprint-per-book rule and the quarantine must not sweep it.**
      - ✅ **AND THE SAME BOUNDARY SAVES ORGANIC'S RESIDUE ALLOWLIST — MEASURED 2026-08-17, correcting a claim that read the other way.** Unit: allowlist entries. Organic holds **12 entries / 10 distinct `moduleId`s, 0 of them CNXML-module-shaped** — all exercise-track ids (`11-03-OC-P06`, `26-99-OC-AP06`, …), so a **CNXML** re-extract does **not** renumber their seg-ids and does **not** void them. §C82's rule is right; it simply does not reach this file. **The control that makes that zero mean something: `efnafraedi-2e` holds 4 entries, 4 of 4 CNXML-module-shaped (`m68729`/`m68750`/`m68784`/`m68809`) — so CHEMISTRY's re-extract DOES void 4 entries, four pieces of manual editorial judgement to redo, and nothing had counted them.** The other three books have no allowlist file.
      - 🔴 **ONE RIDER COVERS BOTH: the 0-ISK exercises row AND the allowlist's survival lapse together, the moment any change touches `tools/exercise-extract.js`.** Then 7,244 ISK ceiling / 4,438 expectation comes straight back **and** the 12 entries are voided.
      - ⚠️ **Do NOT extend the exemption to the 17 preview modules — right dialect, wrong vintage.** They are 0-legacy too, yet **superseded**: their committed extraction predates the alt work (116,573 chars committed vs 133,976 at current vintage, **+14.9%**; **0** alt segments against **100** in a fresh extract of the same 17) [M]. **Re-buying them costs 1,340 ISK and requires `--force`** — an operational step, not a footnote. ▶ **Re-run all 342**: the 6% premium buys those 100 alt segments and removes a two-vintage split §C82's quarantine rules would otherwise carry for weeks.
    - 📊 **THE ~26% MARKER DISCOUNT IS NOT A PER-BOOK CONSTANT.** It is `marker overhead ÷ whole file`; overhead runs ~39–43 chars per segment while segment length varies by book and track. Measured against brief-published pairs: **organic CNXML 18.4%** (39.1 chars overhead / 172 chars text per segment) · **organic exercises 38.7%** · **the superseded scope's aggregate 25.6%** — which is the "~26%" §C91 ① records, an aggregate over a scope this ruling has just changed [all D]. ▶ **Re-derive per track; never scale.**
    - 🔴 **THIS RULING VOIDS A STATED PREMISE OF §C88's OWN [LEAD] SCOPE RULING — RE-TAKE IT BEFORE §C88 IS PLANNED.** [`docs/superpowers/specs/2026-08-16-c88-unreachable-figure-alt-design.md`](../superpowers/specs/2026-08-16-c88-unreachable-figure-alt-design.md) §2 rules **"IN: chemistry's 197. Nothing else."** and puts organic's 245 `entry-not-in-figure` alts OUT because *"**213 of them sit in modules §C80 is not buying**; only 32 are inside the purchased preview."* ▶ **All 245 are now in purchased modules.** The spec is frozen evidence and this register wins, so the OUT ruling stands only until the [LEAD] re-affirms it. **The ISK is not the question** — 245 attributes ≈ 25,919 chars ≈ **259 ISK** [D]. **The anchor is:** 0 of 245 carry a media `@id` or a figure `@id`, the only keys §C89's write-back can address — a design decision, not a spend one. ⚠️ **And §C88's acceptance gate is chemistry-derived** (197 unreachable of 1,149; the `m68727` E5 shortfall → §C91 ②) — **organic's shape is 245 of 2,163 (11.3%), all one position, with 1,918 of 1,918 reachable alt segments confirmed reaching injected output by sentinel** [M]. **Re-state the gate for organic before organic module 1.**
    - 🔴 **FOUR READER-VISIBLE MEDIA DEFECTS COME WITH THE SCOPE, AND EXPANSION ACTIVATES TWO OF THEM.** Owners hold the detail. **§C90** `ch28/m00309` publishes the **wrong image** — outside the preview, so this ruling is what makes it reader-visible, and it is invisible to the committed round-trip pin (1 image in / 1 image out). **§C85** `m00032` (image dropped; already the preview blocker, and **its code path is UNTRACED** — trace `buildTable`'s mixed-content `<entry>` case before committing to a full-book date) and `m00023` / `m00046` (image duplicated — **tolerated today only because they are out of preview; this ruling promotes them to in-scope**). `m00069` is ✅ resolved by §C89.
    - 📚 **WHAT THE SCOPE CHANGE BUYS THAT IS NOT ISK.** A **complete** Icelandic organic textbook plus a **1,961-exercise track no other book here has** — of the five books only `lifraen-efnafraedi` has `01-source/exercises/` [M] — already 100% translated, bracket-dialect, current-vintage and paid for, today serving 17 modules. **Median organic module is 4,907 chars / 17 segments against chemistry's 25,039 / 120** [M], i.e. genuinely one-module-per-session sized. ⚠️ **Corollary: scheduling intuitions imported from chemistry will be badly wrong.**
    - 🔴 **AND WHAT IT COSTS THAT IS NOT ISK — THE DOMINANT TERM.** Organic review burden goes from **643 → 10,608 segments** (**+9,965**) [D]; the two-book scope is now **33,074 segments** [D]. Against that: **368 segments applied, ever, across all books, last written 2026-06-23** [M]. **[E] 99–286 person-hours** for organic alone (10,608 segments × an *assumed* 30/60/90 s, plus ≈1,856 head-editor decisions × an assumed 20–40 s), against the preview's ≈6–18 hours — **excludes Pass 2 entirely**, for which this repo has **zero content files, ever** [M]. ▶ **The single input that most changes this is unmeasured:** `segment_acceptances` is read by one service and no throughput instrument, so the project cannot distinguish *"editors have almost no throughput"* from *"throughput flows through a table nobody counts"*. **Settle it with one read-only prod query** (seconds, 0 ISK) before committing to the other 325 modules — the brief carries the SQL.
    - ⚠️ **LICENCE — THE ASYMMETRY MUST NOT BE INHERITED, AND THIS RULING MULTIPLIES ITS SURFACE ~20×.** `books/lifraen-efnafraedi/book-config.json` → **CC BY-NC-SA 4.0, obtained 2026-03-23** [M], corroborated by [`docs/provenance/openstax-cnxml-licence-provenance.md`](../provenance/openstax-cnxml-licence-provenance.md). Every derivative — faithful, localized, published HTML — inherits **both** NonCommercial **and** ShareAlike, and **cannot** be covered by a repo-wide or book-agnostic CC BY statement; that exact over-grant, naming exactly Organic Chemistry and College Physics, was the pre-publication audit's blocking finding. ▶ **Verify per-book licence rendering before publishing at 342 modules — do not inherit it.** Owners: `book-config.json`, root `LICENSE`, `tools/lib/book-licences.cjs`.
    - 📋 **EVERYTHING AFTER MT IS GREENFIELD FOR THIS BOOK.** `03-faithful-translation/`, `04-localized-content/` and `tm/` **do not exist** for `lifraen-efnafraedi` [M]; chemistry has all three. **Standing rule: TM auto-regen needs a per-book licence ROW — missing is a loud 500 on `/api/tm/export` but a SILENT stale TM on the cron** (→ CLAUDE.md). **Check it before the first apply, not after.**
    - 📌 **ONE OUTLIER DESERVES ITS OWN DECISION, NOT A PIPELINE PASS.** `appendices/m00226` is the book's **Glossary** — 130,018 chars, **5.8% of the whole remaining organic CNXML spend** [D], of which 689 segments (96,197 chars) are `item`-type head-term/definition pairs being priced as prose, **in a project that already runs a concept/terminology model** (§C36).
    - ⚠️ **THREE FLOOR CAVEATS SIT IN NEITHER COLUMN** [M]: glossary characters sent alongside each chunk · the truncation retry, which re-sends a whole chunk without the glossary and is therefore **billed twice** · §C82 ③'s both-arms run (~400 ISK across two books). ▶ **And no Miðeind invoice has ever been reconciled against the API's self-reported cost — every ISK figure here is the API's own accounting, not a receipt.**
    - ⏰ **SEQUENCING — WHAT MUST HAPPEN BEFORE ORGANIC MODULE 1, IN ORDER. The window closes when module 1 runs.**
      - 🔴 **The argument that orders everything: §C82 ①'s quarantine cost now scales ~20× with this ruling.** An extraction-side fix discovered mid-run quarantines every module already cleared and batch-re-MTs them at the book's end. Under the preview that was 17 modules; now it is up to 342. ▶ **Every extraction-side change must land BEFORE module 1, batched into ONE re-extract, so the book sees exactly one fingerprint transition.**
      - **0 · [LEAD] — rule the source refresh FIRST (→ §C92)**, because it precedes extraction and changes what everything downstream bakes in. If it is a no, step 1 disappears.
      - **1 · If refreshed:** run CLAUDE.md's three-step double-written-consent ritual — **written unconditionally, not licence-conditionally**, so organic's never-CC-BY status removes the substantive risk but **not** the procedural guard · **write set is §C93's G4 list: `chNN/*.cnxml` + `appendices/*.cnxml` + `media/*` + the three sidecars — media INCLUDED, `exercises/` and `docx/` NEVER** · regenerate `.source-manifest.json` and update `.source-info.json` in the same commit, naming the upstream sha · update the provenance doc. ⚠️ **A refresh can silently un-pin §C90**, whose root cause is a commented-out `<image>` in live source bytes — **require a committed fixture, not a source-derived one.**
      - **2 · Land every extraction-side fix, in ONE re-extract:** **§C88** (blocks the run — proven: inserting one segment moved **1,404 of `m68865`'s 1,484** ids onto different text) · **§C90** (`tools/cnxml-extract.js:253`'s comment-blind `/<image([^>]*)>/` — **it re-bakes `02-structure`, so it IS a re-extract and must NOT ship alone**) · §C81's `<para>`-strip double-extraction fix. **Then re-derive the allowlists: chemistry's 4 residue entries are voided (above); organic's 12 are not; `fidelity-allowlist.json` keys on exact `moduleId+tag+diff`** (§C82).
      - **3 · §C82 ③'s both-arms glossary run** on module 1 of each book, unchanged (~400 ISK across two books).
      - **4 · Inject-side fixes gate PUBLICATION, not the paid run** — §C85's `m00032`, `m00023`, `m00046`. Re-inject costs no ISK, so they must not hold the run; **they must hold the sync.**
      - **5 · [LEAD] gate before the remaining 325:** the brief's **10-module pilot at 0 ISK** during the first weeks of term, plus the one read-only `segment_acceptances` query — together the only missing input, real seconds per *reviewed* segment.
      - **6 · Before any vefur sync:** per-book licence rendering verified (above), and the books **named** on `sync-content.js` — a bare run publishes every book, holds included (CLAUDE.md § *Durable cross-repo rules*).
      - ⚠️ **A DEPLOY IS ALREADY OWED and is not part of this sequence** — see the RESUME block; it does not block organic, but the content cron stays stranded until it runs.
    - 📌 **KNOCK-ON EFFECTS, recorded at their owners — not restated here:** **§C82 ④** — the shakedown was "organic's PREVIEW (50 files, ~8,560 ISK)", a scope unit this ruling dissolves · **§C88 §2** — the scope premise voided above · **§C90** and **§C85** — footers updated · **§C91 ①** — its "~26%" is an aggregate over the superseded scope · **§C92** — the source-refresh fork · **§C94** — the upstream integrity lookup that now runs before organic's first ISK.
  - *(Superseded 2026-08-17, retained: )* 🔴 **⚠️ SUPERSEDED 2026-08-15 BY A [LEAD] RE-SCOPE. THE RUN IS NOW TWO BOOKS, NOT FIVE, AND ~51,640 ISK, NOT ~112,200.**
```

*(The existing 2026-08-15 sub-bullets follow unchanged, starting `📋 **THE NEW RULING:**`. Only that block's own first line changes — the `— READ THIS FIRST` clause is dropped, because it no longer is.)*

## 1c — REPLACE §C80's footer line (pre-edit line 470; match on `*[severity: n/a — this is a decision`)

```
  - *[severity: n/a — this is a decision, not a defect · **supersedes §C56/§C66 scope** · reader-visible: no directly, but it ACTIVATES §C90 and promotes §C85's `m00023`/`m00046` into scope · blocked by: §C88 (run blocker), §C90 + §C85 `m00032` (organic), and §C92 if the refresh is ruled yes · relates: §C56, §C66, §C76, §C77, §C78, §C79, §C82, §C85, §C88, §C89, §C90, §C91, §C92, §C93, §C94]*
```

## 1d — RESUME block: INSERT as the new topmost bullet (above line 9), and delete ` (LATEST)` from the existing `🆕 2026-08-16` bullet

```
- **🆕 2026-08-17 (LATEST) — 📋 [LEAD] SCOPED THE RE-MT UP: `lifraen-efnafraedi` GOES FROM A 17-MODULE PREVIEW TO THE COMPLETE 342-MODULE BOOK. Ceiling ~65,600 ISK, expectation ~51,300 — SCOPE RULED, THE DELTA NOT YET APPROVED. ▶ THE NEXT BUILD IS UNCHANGED — §C88 — but its SCOPE RULING now rests on a voided premise and must be re-taken before it is planned.**
  - 📋 **The ruling and its full re-derivation live at §C80's topmost block. Read it there; nothing is restated here.** Measured basis → [`test-results/organic-expansion-openstax-oracle-2026-08-17.md`](../../test-results/organic-expansion-openstax-oracle-2026-08-17.md) (frozen evidence — if it disagrees with this register, this register wins).
  - 🔴 **What changed beyond ISK:** organic review burden **643 → 10,608 segments** · **§C90** (`m00309` publishes the wrong image) is **activated** by the expansion and §C85's `m00023`/`m00046` are promoted into scope · organic is **CC BY-NC-SA 4.0** across ~20× the surface.
  - ⚠️ **The extraction-vintage window is open and closes at organic module 1.** §C82 ①'s quarantine now scales to 342 modules instead of 17, so **§C88 + §C90 + §C81's `<para>` strip must land in ONE re-extract** before the first paid module. Re-running the 17 former-preview modules needs **`--force`**.
  - ❓ **One [LEAD] fork precedes everything: refresh organic's `01-source` from upstream, or not → §C92.** Measured and **recommended**; not ruled. Organic was never CC BY so nothing irrevocable is at risk — **but CLAUDE.md's three-step double-written-consent guard is written unconditionally and still applies.**
  - 📋 **Two new [CODE] items came out of the same design pass:** **§C93** — nothing that writes `01-source/` reads a licence, and two of its three findings are live on `main` today · **§C94** — where an OpenStax integrity/drift lookup belongs in the §C82 loop (per book, before the first ISK; nothing per module).
  - ⏰ **The owed deploy is unchanged and is not part of this** — see the bullet below.
```

## 1e — Collateral edits (all in the same file unless noted)

**§C90 footer (pre-edit line 201) — REPLACE.** *Reason: `blocks: full-organic scope-up` describes a decision now taken; left as-is it dangles.*
```
  - *[severity: wrong image published to readers · reader-visible: yes, on expansion · blocks: organic's re-extract — **must batch with §C88 and §C81's `<para>` strip into one fingerprint transition** (§C80's 2026-08-17 sequencing) · relates: §C85, §C87 ④, §C89]*
```

**§C85 — two edits.** *Reason: both lines are scoped to the preview, which no longer exists as a scope unit. Both are one-line-for-one-block replacements matched on their quoted text; the second is §C85's `*[severity: …]*` footer whatever line it lands on.*
- Line 406 (pre-edit) — REPLACE `▶ **`m00032` must be resolved before organic's preview is re-MT'd** (§C80 ruling: organic preview in full). The other three are out of the preview but in the book; `m42296` is withdrawn.` with:
```
  - ▶ **AMENDED 2026-08-17 — §C80's scope-up puts ALL THREE in scope.** `m00032` (drop), `m00023` and `m00046` (duplication) are all inside the purchased book now; the "out of the preview but in the book" carve-out is void. **They gate PUBLICATION, not the paid run** — re-inject costs no ISK. `m42296` is withdrawn (physics, dropped book).
```
- Footer — REPLACE (pre-edit line 409; §C85's `*[severity: …]*` line):
```
  - *[severity: reader-visible missing/duplicated images · reader-visible: **yes** · blocks: organic's vefur sync — all three are in scope as of §C80's 2026-08-17 scope-up; none blocks the paid run · relates: §C80, §C81, §C82, §C88, §C90]*
```

**§C91 ① — APPEND** after *"…every whole-file estimate here are a CEILING, not an expectation."*:
```
⚠️ **AMENDED 2026-08-17 — ~26% IS AN AGGREGATE OVER A SCOPE THAT HAS SINCE CHANGED, NOT A PER-BOOK CONSTANT.** The discount is `marker overhead ÷ whole file`; overhead runs ~39–43 chars per segment while segment length varies by book and track. Measured: **organic CNXML 18.4%** · **organic exercises 38.7%** · the *superseded* chem-full-plus-organic-preview aggregate **25.6%** [D]. ▶ **Re-derive per track; do not scale.** Current figures → §C80's topmost block.
```

**§C82 ④ (pre-edit line 434, the fourth [LEAD] decision, ending `…physics having been dropped by §C80's re-scope.`) — APPEND:**
```
▶ **AMENDED 2026-08-17: "organic's preview" is no longer a scope unit** — §C80 bought the whole book. **The shakedown is now organic's first BATCH**; the 17 former-preview modules are the natural one (they must be re-bought anyway — with `--force` — and they carry `m00033`'s nine reproducible invented markers). → §C80.
```

**`docs/superpowers/specs/2026-08-16-c88-unreachable-figure-alt-design.md` — insert a banner immediately under the `## 2. Scope — RULED` heading** *(frozen spec: banner, never a silent edit)*:
```
> ⚠️ **BANNER 2026-08-17 — the OUT ruling below rests on a premise §C80 has since voided.** It reads *"213 of them sit in modules §C80 is not buying"*; §C80's 2026-08-17 scope-up buys all 342 organic modules, so **all 245 are now in purchased modules**. This spec is frozen evidence — **the register is status and the register wins.** ▶ The [LEAD] must re-affirm or re-take the ruling before this item is planned. → §C80, and note the acceptance gate in §8 is chemistry-derived.
```

---

# SECTION 2 — Register: the organic source-refresh delta (§C92)

**TARGET FILE:** `docs/plans/2026-07-21-post-item17-followup-campaign.md`, `## P1` list — insert immediately after the **§C91** block (currently ends line 207, before the `C56` entry).

> **Note to the controller:** this entry is written as **[LEAD] DECISION NEEDED**, not as a ruling. The measurement supports a GO; the ruling is the lead's and the three-step consent is intact.

```
- **C92 · 📋 [LEAD] DECISION NEEDED — REFRESH `lifraen-efnafraedi`'s `01-source` FROM UPSTREAM BEFORE EXTRACTION? MEASURED, RECOMMENDED, **NOT RULED**** — **[LEAD]** — **P1, and it precedes everything in §C80's sequencing** — *measured read-only 2026-08-17 while designing the full-organic expansion; repo untouched.*

  - 📌 **What is being asked.** Organic was **never CC BY** — it was already CC BY-NC-SA 4.0 when obtained 2026-03-23 — so a refresh destroys no irrevocable grant, which is why this book and only this book is a candidate. **Chemistry, biology and microbiology hold irrevocable CC BY copies and are out of scope by rule.**

  - **Our pin:** `books/lifraen-efnafraedi/01-source/.source-info.json` → `2a1f8284…`, fetched 2026-03-23 [M]. **Upstream measured against `8917713cdfb7f74018a8fd43cdcfe3173419bb82` (committed 2026-07-01) — record the sha, never "main", or the measurement is not reproducible.** All 12 drifted files were first confirmed byte-identical to upstream *at our own pin*, so the compare below **is** the refresh delta, not an approximation of it. Sizing → [`test-results/organic-expansion-openstax-oracle-2026-08-17.md`](../../test-results/organic-expansion-openstax-oracle-2026-08-17.md) (frozen evidence; this entry is the status).

  - 🟢 **LICENCE — NO MOVEMENT. This was the one finding that could have inverted the recommendation, and it is absent.** [M] Upstream repo `LICENSE` is **byte-identical at both vintages** (sha256 `78442b48…`). The collection's `<md:license url="…/by-nc-sa/4.0/">` **URL is unchanged** — upstream added only the human-readable text content, and that single line is **the entire diff** of `collections/organic-chemistry.collection.xml`. `<col:module>` count **342 → 342**. So a refresh arrives under **the same grant the copy already carries**. ⚠️ **This is a fact about ORGANIC at ONE measured sha pair. It does not generalise** — re-run it per book, per refresh, or not at all. *(This is the fact §C93's G3 gate is designed to check mechanically.)*

  - **The delta is 8 commits / 15 files, and every one is attributable** (`compare/2a1f8284…...8917713c`) [M]:

    | upstream commit | date | what changed |
    |---|---|---|
    | `278405a6` *updating md license* | 04-23 | collection `<md:license>` gains text content; **URL unchanged** |
    | `93b8bef2` + `a4ba6ca8` *preface* | 04-23 / 05-05 | `m00001` — mission statement reworded; `(CC BY NC-SA)` → `(CC BY-NC-SA)` |
    | **`2b807bbb` *table header fixes*** | 06-03 | **10 modules — the bulk of the drift, and it carries NO errata id** |
    | `3942900c` *spelling* | 06-03 | `m00187` |
    | `0c49f14f` + `8917713c` *errata 28974* | 07-01 | `m00130` prose ×2 **and** its `@alt`, **and the image** |
    | `563915b0` *errata 28855* | 07-01 | **`media/OChem_02_09_001.jpg` only — no CNXML touched** |

  - **Classification of the 12 drifted modules** — parsed with `@xmldom/xmldom`, not regex; unit: modules; `m00050`/`m00309` carried as undrifted positive controls, identical on every fingerprint [M]: **9 STRUCTURAL** — *all one shape*, a `<thead>`+`<row>`+`<entry>`×N insertion (`m00187` also drops one `<colspec>` and six whitespace-only spacer `<entry>` cells) · **12 text/prose**, mostly the text *inside* those new header cells · **1 `@alt` changed** (`m00130`) · **0 `@id` added or removed across all 12** · **0 media `@src` changed**.
    - ▶ **The zero-`@id` row is the load-bearing one: figure/para/alt join keys survive the refresh untouched.** Only `auto-N` ids shift, and §C80's full-book decision already pays for that in all 342 modules.
    - ⚠️ **This is the discriminator against physics and should be stated whenever this is cited.** Organic is 9-of-12 structural, **all the same mechanical table-header insertion**. Physics is 47-of-51 drifted-and-structural and heterogeneous — **NOT re-derived here; re-measure before acting on physics.**
    - ⚠️ **Where the GitHub compare patch and a full-file parse disagree, the parse wins** — the compare API elides hunk lines.

  - **Benefit, quantified** [M unless marked]: **25 translatable units differ across the whole 342-module book** — 20 added, 5 changed in place, 0 removed (unit: `para`/`title`/`caption`/`entry`/`item`/`term` + `@alt`, compared **by value**, per the §C89 rule — a *count* reports 0 for `m00130`, whose correction is length-neutral). They carry **2,084 chars = 0.14%** of the book's 1,456,160 normalised text chars → **≈21 ISK** [D]. **The refresh is not a cost question.** *(The 12 modules as wholes are 79,309 normalised text chars = 5.45% of the book — quoting that instead would overstate the benefit ~38×.)* **1 of the 12 (`m00134`) is inside the already-purchased 17-module preview.**
    - ▶ **The benefit is correctness.** Without the refresh we pay Málstaður to render a **factual chemistry error into Icelandic** (`m00130`: 3-menthene → 1-menthene, in two paragraphs *and* the figure `alt`), and we ship **9 modules of tables with no header row**. `<thead>` is handled at `tools/cnxml-render.js:1630`, so that accessibility fix reaches readers.

  - 🔴 **A CNXML-ONLY REFRESH IS THE WRONG SHAPE — MEDIA MUST COME TOO, AND NO CNXML DIFF CAN REVEAL THAT.** [M] `563915b0` (errata 28855 — *"the acetic acid doesn't lose the H in the graphic shown"*) changed **only** `media/OChem_02_09_001.jpg`. Its consumer `ch02/m00026.cnxml` is byte-identical at both vintages, so it sits in the **330 "undrifted"** and is invisible to every module-level comparison. 2 of 3,156 media files changed (86,986→128,023 and 153,953→181,072 bytes; a third, unchanged file carried as control). ⚠️ **`.source-manifest.json` hashes CNXML only — 342 files, 0 media, in every book** — so a media swap has no tamper-evidence baseline anywhere in this repo. ▶ **The exact write set is §C93's G4 list. Do not restate it; follow it.**

  - **Errata — the direct "we would be paying to translate known-wrong text" number is 4** [M]. ⚠️ **Organic's `book_title` is `Organic Chemistry: A Tenth Edition`, not `Organic Chemistry`** — the obvious string returns **0 records, byte-identical to what a nonsense title returns.** Join on the numeric page id (**707**), resolved from `/apps/cms/api/v2/pages/?type=books.Book`. **210 organic errata records; 5 corrected on/after 2026-03-23, of which 4 `resolution: Approved` and 1 `Will Not Fix`; 37 acknowledged with no `corrected_date`, 1 of those `Approved`** — one more upstream change is queued. Full five-book table → **§C94**.
    - 🔴 **The errata feed and the git drift do not contain each other, in either direction.** Only **2** of the 4 Approved-and-corrected errata produced a commit in range (28974, 28855); 28448 and 28941 produced none. Conversely **10 of the 12 drifted modules came from `2b807bbb`, which carries no errata id at all.** ▶ **Never use an errata count as a proxy for source drift — diff the shas.**

  - **Scope correction to carry forward:** organic's `residue-allowlist.json` is **not** voided by a CNXML re-extract — all 12 entries are exercise-track ids. Owner and the chemistry contrast → **§C80**.

  - #### ▶ RECOMMENDATION: **refresh `lifraen-efnafraedi` only — CNXML *and* media — before extraction. NOT YET RULED.**
    The marginal engineering cost is ~zero because **the expensive part is already bought by §C80's full-book decision**: all 342 modules are being re-extracted and re-MT'd regardless, so the re-extract, the shifted `auto-N` ids and the manifest regeneration are already on the bill. Declining saves none of that; it only guarantees we pay to translate a known factual error and ship nine headerless tables. **The one risk that would have made this a NO — a licence move — is measured and absent.**
    **Conditions, in order, if ruled yes:**
    1. **CLAUDE.md's three-step double-written-consent rule is scoped to `books/*/01-source/` GENERALLY, not to the CC BY books.** Organic's lower harm is a reason to *grant* the consent, not to skip it. → also §C93 open question.
    2. 🔴 **THE MEASUREMENT EXPIRES WITH THE SHA.** Everything above is true **only** for `2a1f8284…` → `8917713c…`. **If upstream HEAD has moved by refresh day, re-run the compare first**; movement is expected (one organic erratum is already `Approved` with no `corrected_date`). **Refresh at a named sha, never at `main`.**
    3. **Take `media/` in the same commit**, or erratum 28855 is silently missed and `m00130`'s corrected `alt` describes an uncorrected image — an alt↔image incoherence **no committed check can see**.
    4. **Regenerate `.source-manifest.json` and update `.source-info.json` in that same commit**, naming the upstream sha and the 15 files in the message. ⚠️ **See §C93 for the ordering hazard: if the mint-only change lands first, there is no supported way to regenerate the manifest and `source-manifest-baseline.test.js` stays red with no green path.**
    5. **Do not generalise.** This covers `lifraen-efnafraedi` at one measured sha pair. `edlisfraedi-2e` shares CC BY-NC-SA and so *looks* eligible — **it is not covered here.**
    6. **Minor:** organic's `.source-manifest.json` `note` says *"the **CC BY** 01-source CNXML"* — wrong for a CC BY-NC-SA book, and it is a `const` shared by all five (→ §C93 ⑤a). Fix there, not here.

  - *[severity: n/a — a decision, not a defect · reader-visible: no · **decision needed before §C80's sequencing step 2** · relates: §C80, §C88, §C90, §C93, §C94, CLAUDE.md § *`books/*/01-source/`*]*
```

---

# SECTION 3 — Loop design spec: where the OpenStax lookup belongs (§11), plus register §C94

**TARGET FILE A:** `docs/superpowers/specs/2026-08-13-gated-per-module-remt-loop-design.md` — **append as § 11.** *(Verified: that document is **not** banner-frozen — its header reads "Status: design, approved section-by-section" — and it currently ends at § 10, line 241 of 257. Nothing above § 11 changes.)*

````markdown
---

## 11. Upstream OpenStax lookups — what runs where

*Added 2026-08-17, pending [LEAD] approval in the same section-by-section manner as §§1–10.*

**Owns:** the *placement* of every lookup against an OpenStax upstream, and the ledger fields they
write. **Evidence:** [`test-results/organic-expansion-openstax-oracle-2026-08-17.md`](../../../test-results/organic-expansion-openstax-oracle-2026-08-17.md)
(frozen) plus the `[M]`s below, taken 2026-08-17. **Status of the work → the active register (§C94).**

⚠️ **Ownership note.** Check *definitions* normally belong to [`2026-08-13-remt-check-battery.md`](2026-08-13-remt-check-battery.md).
That document is banner-frozen, so it is amended with a banner rather than edited. The `U*`
definitions therefore live **here**, and the battery gets a one-line pointer in its amendment block.
One owner, and it is this section.

### 11.1 The rule that decides placement

| | question | trajectory | therefore |
|---|---|---|---|
| **integrity** | *Do our bytes still equal the upstream commit we recorded?* | **invariant** — moves only if *we* change something | expected permanently green ⇒ **may halt** |
| **drift** | *Has OpenStax edited these modules since?* | **monotonically grows** — our copies are frozen, they publish a moving `main` | expected permanently and increasingly red ⇒ **may never halt** |

The brief's warning — *a recurring gate whose red increasingly means "they edited" gets tuned out* —
applies to **drift only**. Split, one half is blocking-eligible and the other becomes a report that
qualifies other evidence.

### 11.2 What already exists, and what is actually missing

🔴 **Read this before claiming U1a is novel.** `books/*/01-source/.source-manifest.json` is a
committed sha256 tamper-evidence baseline for **all five** source-bearing books, produced by
`tools/lib/source-manifest.cjs` and pinned against the real tree by
`tools/__tests__/source-manifest-baseline.test.js`, which runs in root `npm test` [M]. **So the local
half is built, committed and gated.** What **nothing** here can prove today is *these bytes are
OpenStax's bytes, at a named upstream commit*. That external anchor is U1a's whole contribution.

| sidecar | present for | proves |
|---|---|---|
| `.source-manifest.json` | **all five** [M] | bytes unchanged **since we recorded them** |
| `.source-info.json` (`repo`, `branch`, `commitHash`, `collection`, `fetchedAt`, `moduleCount`) | **four — `efnafraedi-2e` has none** [M] | *which* upstream commit we claim to hold — the anchor U1a verifies |

### 11.3 TIER 0-U — per BOOK, once, before the first ISK

TIER 0 gains a second group: `TIER 0-G` is the existing glossary-input battery (battery §1);
`TIER 0-U` is this, and in §4's diagram it runs immediately before `TIER 0-G`.

| id | asserts | semantics | blind spot |
|---|---|---|---|
| **U1a** | every module's git blob SHA equals the upstream tree **at the commit in `.source-info.json`**, except entries on a reason-bearing exception list | **FAIL → halt book** | identity, not content; **cannot run on a book with no `.source-info.json`**; and see the residual hole |
| **U1b** | which modules differ from upstream `refs/heads/main` | **report only** — writes a field, never a verdict. **No network ⇒ `SKIPPED`, never `clean`** | cannot see an upstream edit later reverted; says *which file*, never *whether it matters* |
| **U1c** | `.source-info.json` has been modified by exactly the book's intake commit and by no commit since | **FAIL → halt book**, cleared only by written justification | a rewrite bundled *into* the intake commit is invisible — but that commit predates the concern |
| **U2** | the book's errata corrected **on or after its copy date** have been read and signed off once | **start condition** — the loop refuses to begin a book whose sign-off is absent or predates the feed fetch | a human-written `location` string, not a module id — it cannot say *which file*; U1b can |

**Build notes.** U1a is ~60 lines in `tools/`; **reuse `listCnxmlFiles` from `tools/lib/source-manifest.cjs`** rather than re-walking (`01-source` holds non-directory entries — a naive recursion throws `ENOTDIR` on the sidecars). U1c is one `git log` per book. Fixtures: U1a **SHOULD-TRIP** = one byte mutated in a **scratch copy** (R1's precedent, battery §4); **MUST-NOT-TRIP** = the 1,043 + 148 modules below. U1b has no fixture — it is a measurement, and its control is U1a passing in the same run.

#### 🔴 The residual hole, stated plainly

**U1a + U1c narrow the re-clone hazard; they do not close it.** A pull or download that rewrites the
CNXML **and** regenerates **both** sidecars to a new commit goes green on every mechanical check in
this repo. That is exactly what CLAUDE.md's three-step consent rule exists to prevent, and it is why
that rule is **procedural**. What U1a/U1c add is that such a swap must also produce *a valid upstream
commit whose tree matches* **and** leave a second commit touching the sidecar — so a careless or
partial overwrite is caught and a deliberate one leaves a git-visible trace. **Do not describe U1a as
a witness that the consent rule was followed.**

#### U1a / U1b — measured, all five books, 2026-08-17

Unit: **source modules** (`01-source/**/mNNNNN.cnxml`), compared by git blob SHA against the GitHub
git-tree API. One HTTP request per tree.

| our slug | upstream repo | recorded commit | **U1a** local ≡ tree@recorded | **U1b** local ≡ tree@`main` |
|---|---|---|---|---|
| `lifraen-efnafraedi` | `osbooks-organic-chemistry` | `2a1f8284` | **342 / 342** | 330 / 342 |
| `orverufraedi` | `osbooks-microbiology` | `ecf34dad` | **159 / 159** | 153 / 159 |
| `liffraedi-2e` | `osbooks-biology-bundle` | `d2779c2e` | **259 / 259** | 224 / 259 |
| `edlisfraedi-2e` | `osbooks-college-physics-bundle` | `5182c46e` | **283 / 283** | 232 / 283 |
| `efnafraedi-2e` | `osbooks-chemistry-bundle` | **none recorded** | 148 / 149 vs `dba91045` | 116 / 149 |

`[M]` all cells. **Controls in the same command:** a mutated local SHA raised the mismatch count by
exactly 1 on every book; a downloaded upstream file hashed to exactly its tree SHA; organic's drift
set was reproduced identically by an independent method (143 MB `codeload` tarball + byte
comparison) — the same 12 ids.

▶ **All five U1b figures reproduce the brief's drift table exactly** — two instruments, different
lanes, different days, cell for cell. ▶ **U1a is green on 1,043 of 1,043 modules across the four
anchored books**, which is what makes it blocking-eligible.

⚠️ **An early version of this measurement reported 138/342 for organic** — a positional `paste` join
between two `find` runs, silently misaligning ids and SHAs. Right property, wrong instrument, and it
nearly contradicted a measured brief. **Derive the id and the hash in the same pass.**

#### The exception list has exactly one entry, and our own git log proves it

`efnafraedi-2e/01-source/ch00/m68662.cnxml` matches **no** upstream commit; commit `51a62b75`,
*"feat(content): re-create Chemistry 2e preface (m68662) source from CC BY Word"* [M]. **Each
exception stores the module id, the justifying commit and a one-line reason** — an entry with no
commit reference is itself a failure. ⚠️ `m68662` now carries three unrelated jobs: the battery's
only `A5` fixture, U1a's only exception, and it sits in chemistry **ch00**, which the chapter-0
truthiness bug (§6) makes unreachable to two tools.

#### Chemistry has no `.source-info.json`, and that is the gap worth closing first

Recoverable: `dba91045` (2026-01-14) is **the newest upstream commit at or before the 2026-01-19 copy
date recorded in** [`docs/provenance/openstax-cnxml-licence-provenance.md`](../../provenance/openstax-cnxml-licence-provenance.md),
and 148 of our 149 match its tree (the 149th being `m68662`). Walking back monotonically worsens the
match — 146, 145, 144 at the three preceding commits [M] — so it is the best candidate, not a
coincidence. ⚠️ **Scope it exactly: the best-matching commit at or before the recorded date. NOT
"verified as the fetch commit" — no fetch record exists for chemistry**, which is the gap itself.
▶ Disproportionately valuable: chemistry is CC BY 4.0, upstream relicensed CC BY → CC BY-NC-SA on
2026-03-19, and pinning a **pre-relicense** commit turns the provenance argument from a date in a
prose table into a byte-verifiable claim.

#### U2 — measured, all five books, 2026-08-17

Unit: **errata records** from `https://openstax.org/apps/cms/api/errata/`; copy dates from the
provenance doc; *actionable* excludes `resolution: "Will Not Fix"` **and nothing else** — it is a
different, broader predicate than `resolution: "Approved"`, and the two must never be merged.

| our slug | page id | feed records | with `corrected_date` | corrected ≥ copy date | **actionable** | open, no `corrected_date` |
|---|---|---|---|---|---|---|
| `efnafraedi-2e` | 298 | 911 | 885 | 78 | **78** | 26 |
| `liffraedi-2e` | 207 | 2,708 | 2,622 | 63 | **63** | 86 |
| `orverufraedi` | 83 | 330 | 309 | 7 | **7** | 21 |
| `edlisfraedi-2e` | 603 | 575 | 568 | 12 | **12** | 7 |
| `lifraen-efnafraedi` | 707 | 210 | 173 | 5 | **4** | 37 |

`[M]`. Feed total **29,597 records across 114 distinct book ids**. Micro's copy date is recorded two
ways (`fetchedAt` 2026-03-02 vs the provenance doc's 2026-03-09); **the slice is 7 either way.**
⚠️ **Chemistry's 78 actionable coexists with the brief's "62 Approved" over the same 78** — different
predicates; the 16-record remainder carries some other resolution and is **UNKNOWN** until queried.

▶ **Every list is a human-readable size (4–78).** That is what makes "halt until signed off" a
one-time read rather than a project of its own. Biology's 2,622 lifetime corrections would not have
been. ▶ **The `open, no corrected_date` column is U2's unique contribution** — defects OpenStax has
acknowledged and not yet fixed (organic: 37). **No comparison against upstream bytes can ever see
them.** Conversely, upstream edits no erratum tracks are visible to U1b and invisible to U2.
**Neither substitutes for the other.**

### 11.4 TIER 0-U is network-free at run time

A git commit's tree is immutable, so U1a and U1c need no live fetch during a run: fetch the tree at
the recorded commit **once, at intake**, and commit the `modules/*/index.cnxml` → blob-SHA rows as an
artifact (organic's full tree response is 968 KB; the rows that matter are a few KB) [M]. At run time
U1a compares live `git hash-object` output against that artifact and U1c runs one `git log` —
**zero requests, and a GitHub outage can never block a paid run.** **U1b still needs the live `main`
tree, which is fine because it gates nothing**; with no network it reports `SKIPPED (no network)`,
never `clean`.

### 11.5 Per module, inside the loop: nothing new. Deliberately.

**No `U*` check runs per module, and no network call enters the per-module path.**
1. **The paid step is one-shot (§6).** A network dependency in the gate path adds a way for a paid run
   to halt for a reason unrelated to the module. The git-tree endpoint returned **HTTP 504 twice in
   succession** on `osbooks-college-physics-bundle`, then 200 later [M]. *(No rate is claimed — two
   observations are not a rate — and §11.4 removes the exposure anyway.)*
2. **Everything the oracle could say per module about *content* is better answered offline against
   `01-source`** — guaranteed vintage, zero network. That is the brief's finding.
3. **Rate limits.** Unauthenticated `api.github.com` allows 60 req/h; one per book is 5, one per
   module is 342.

The one thing that does enter the per-module record is **free**: fields, not checks, carried down from
the TIER 0-U sweep at zero additional requests, so that a [LEAD] reading a drifted module in the §4
sample is told it is drifted.

### 11.6 Ledger additions (§5)

**Per module** in `books/<slug>/remt-ledger.json`: `sourceSha256` — that module's entry from the
committed `.source-manifest.json`, **reused, not recomputed** — and `upstreamDrift` ∈ `undrifted` |
`drifted` | `absent-upstream` | `skipped-no-network`.
**Per book:** `upstreamCheck { treeArtifactPath, recordedCommit, examined, u1aMismatches,
u1aExceptions, u1cVerdict, u1bRef, u1bFetchedAt, u1bDrifted, gateVersion }` and `errataReview {
feedFetchedAt, bookId, feedTotalRecords, sinceDate, matched, actionable, signedOffBy, signedOffAt }`.

🔴 **`sourceSha256` is PER MODULE and must NOT be folded into the book-wide extraction fingerprint.**
§5 specifies that fingerprint as a hash over the **import graph of `cnxml-extract.js`** — the
extractor's *code* — so a change to `01-source` **content** does not move it and a refreshed module
would keep a stale `clean` verdict. Folding source into the book hash would make a 12-module refresh
quarantine all 342, inverting §C82's quarantine rule. **This is a specification requirement on an
unbuilt component, not a defect claim.**

### 11.7 Placement and build decisions

- **U1 lives in `tools/` (ESM).** It needs **no** `openstaxFetcher` and **no** `BOOK_REPOS`:
  `.source-info.json` supplies `repo` and `commitHash` per book. Three consequences: **no MIT→AGPL
  edge** (CLAUDE.md gap E-2), **no allowlist change**, and **no enumeration to maintain**.
  *(For the record: `api.github.com` and `codeload.github.com` already satisfy `openstaxFetcher`'s
  `isAllowedGhUrl`; `openstax.org` does not [M] — but U1 never touches that code path.)*
- **U2 reaches `openstax.org`, a host nothing in this repo currently allows** — a deliberate decision
  to record, not a config tweak.
- 🔴 **Do not reuse `tools/check-openstax-errata.js` as it stands.** [M] `BOOK_TITLE` is a
  module-level `const 'Chemistry 2e'` (`:51`) used to build the fetch URL (`:133`) and **never
  reassigned**, while `--book` reassigns only `ERRATA_DIR` (`:511-512`); `LOG_PATH` is a module-load
  `const` (`:47`) frozen to chemistry's log, and the reassigned `ERRATA_DIR` is used **only** by
  `loadLog`'s `mkdirSync` (`:70`). ⇒ `--book lifraen-efnafraedi fetch` creates a **stray empty**
  `books/lifraen-efnafraedi/errata/` and writes **Chemistry 2e** errata into **chemistry's** log.
  `parseArgs` defaults `book: 'efnafraedi'` (`:444`), a slug that does not exist; `bookSlug` is
  hardcoded `'chemistry-2e'` (`:64`). Its docstring, `--help` and error path all say the API 403s —
  it returns **HTTP 200**.
- 🔴 **Join on the numeric OpenStax page id, never a title string.** Organic's canonical title is
  **"Organic Chemistry: A Tenth Edition"** (id **707**); `"Organic Chemistry"` returns **0 records —
  byte-identical to what a nonsense title returns** [M]. That zero was manufactured during the
  investigation itself; it is U2's fixture.
- **Where the zero-assertion goes.** A book with genuinely zero post-copy-date errata is a legitimate
  clean result, so the *count* cannot carry the assertion. The discriminators are
  **`feedTotalRecords > 0`** and **`bookId` resolved non-null**; with both true, `matched: 0` is an
  answer, and with either false the verdict is **`error`**, never `clean`. This implements the
  battery's amendment #2 for a networked check.
- **Every `U*` check emits the same three things as every other check (§7):** verdict, its own version
  stamp, and the number of units examined.

### 11.8 U3 — the construct→presentation audit runs ONCE, outside the loop

Per the brief: a **one-shot, 18-fetch** contextual construct audit over the **undrifted chemistry**
subset. **Not a gate, not in the loop, no ledger entry, not similarity-scored** — the brief measured
that a similarity score rates a page *more* correct exactly where the discarded-alt defect is live.
Its deliverable is a **convention table**, which then informs render fixes on their own schedule.
**Whether organic needs its own delta cover is UNKNOWN.** Method to settle it: enumerate distinct
`parent>child` CNXML contexts across organic's 330 undrifted modules, subtract those chemistry's cover
reaches, greedy set cover over the remainder. **Do not build it before that number exists.**

### 11.9 What these lookups cannot see

1. Anything about **translation quality** — the two documents differ by language by design.
2. **Whether an upstream edit matters** — U1b says *which file*; only a human, or U2's `error_type`
   and `detail`, says whether it is a typo or a corrected reaction mechanism.
3. **A fully-consistent upstream swap** — see the residual hole in §11.3.
4. **Whether a drifted module's change reached our published output** — it cannot have; our copies are
   frozen. Drift is an input-vintage fact, never an output defect.
5. **`upstreamOnly` is meaningless on bundle repos.** `osbooks-biology-bundle` carries three books'
   modules; the probe reported 315 `upstreamOnly` for biology and 35 for college physics [M], both
   artefacts of the bundle. Scope the comparison with the book's `collection` file — which
   `.source-info.json` also records — before reading that column.
````

**TARGET FILE B:** `docs/superpowers/specs/2026-08-13-remt-check-battery.md` — add as **item 6** of the existing `🔴 AMENDMENT — 2026-08-16` banner block *(verified: the block currently holds 5 numbered items)*:

```
> 6. **(added 2026-08-17)** **Upstream OpenStax lookups (`U1a`, `U1b`, `U1c`, `U2`) are NOT in this
>    battery, by ownership.** Their definitions, tiering and fixtures live in **§11 of the loop design
>    doc**, because this document is frozen and a second copy would violate § *One source of truth*.
>    `U1a`/`U1b`/`U1c` are per-book **TIER 0-U**; `U2` is a start condition; **no `U*` check is
>    per-module and no network call enters the per-module path.** The one-shot construct audit (`U3`)
>    is not a check at all and has no tier. → register §C94.
```

**TARGET FILE C:** the register, `## P1` list — insert after **§C93**:

```
- **C94 · UPSTREAM OPENSTAX LOOKUPS FOR THE §C82 LOOP — AN EXTERNAL ANCHOR FOR THE `01-source` BASELINE, AN ERRATA START-CONDITION, AND `check-openstax-errata.js`'s `--book` FLAG IS INERT FOR DATA WHILE CREATING A STRAY DIRECTORY** — **[CODE]** — **P1, sequenced with §C82's pre-run steps** — *designed 2026-08-17; placement spec is §11 of [`docs/superpowers/specs/2026-08-13-gated-per-module-remt-loop-design.md`](../superpowers/specs/2026-08-13-gated-per-module-remt-loop-design.md), which owns the detail and is not restated here.*
  - **The split that makes an upstream comparison usable:** *integrity* ("do our bytes still equal the commit we recorded?") is invariant and may halt; *drift* ("has upstream moved?") grows monotonically and may only report. Conflating them is what makes a recurring upstream gate go permanently red and get tuned out.
  - ⚠️ **This is NOT the first mechanical check on `01-source`.** `.source-manifest.json` (sha256, all five source-bearing books) plus `tools/__tests__/source-manifest-baseline.test.js` already gate the **local** half in root `npm test` [M]. What is missing is the **external anchor**: nothing proves our bytes are *OpenStax's* bytes at a named commit.
  - 🔴 **U1a is green on 1,043 of 1,043 modules across the four books that carry `.source-info.json`** [M] — which is what makes it blocking-eligible. **U1c** (the sidecar touched by exactly its intake commit and none since) is **1 for 1 on all four** [M].
  - ⚠️ **The residual hole is real: a re-clone that regenerates BOTH sidecars goes green on every mechanical check here.** CLAUDE.md's three-step consent rule is procedural and stays the only real control. **Do not describe U1a/U1c as a witness that consent was obtained.**
  - ⚠️ **`efnafraedi-2e` carries no `.source-info.json`, so the anchor cannot run on the flagship book** [M]. Recoverable: `dba91045` (2026-01-14) is the newest upstream commit at or before the recorded 2026-01-19 copy date, and 148 of 149 modules match its tree; walking back worsens it monotonically (146/145/144). **Scope it exactly — best-matching commit, NOT a verified fetch record; none exists.** The 149th is `m68662`, explained by our own commit `51a62b75`. ▶ Worth doing first: it pins chemistry to a **pre-relicense** commit, turning a date in a prose table into a byte-verifiable claim. *(§C92 cites this; §C94 owns it.)*
  - **Both instruments reproduced the brief's drift table cell for cell on all five books** [M]; organic's 12-module drift set was reproduced a third time by an independent tarball byte comparison.
  - ⚠️ **An early pass reported 138/342 for organic** — a positional `paste` join between two `find` runs. Right property, wrong instrument, and it nearly contradicted a measured brief. **Derive the id and the hash in the same pass.** → [[engineering-lessons]]
  - 🔴 **`tools/check-openstax-errata.js` must not be pointed at a second book as it stands.** `BOOK_TITLE` is a module-level `const 'Chemistry 2e'` used in the fetch URL and never reassigned; `LOG_PATH` is a module-load `const` frozen to chemistry's path while `--book` reassigns only `ERRATA_DIR`. ⇒ `--book <other>` creates a stray empty `books/<other>/errata/` and writes **Chemistry** errata to **chemistry's** log. Default `book: 'efnafraedi'` is a slug that does not exist. **Its API works (HTTP 200) despite docstring, `--help` and error path all saying 403.**
  - ⚠️ **Join on the numeric OpenStax page id, never a title string.** `"Organic Chemistry"` returns **0 records, byte-identical to a nonsense title**; canonical title is `"Organic Chemistry: A Tenth Edition"` (id 707) [M]. **That zero was manufactured during the investigation itself** — *an absence is not an answer*, live.
  - **Errata since each book's copy date, unit = errata records, predicate = `actionable` (not `Will Not Fix`)** [M]: chemistry 78 · biology 63 · physics 12 · micro 7 · organic 4. ⚠️ **The brief's "62 Approved" for chemistry is a NARROWER predicate over the same 78, not a disagreement** — the 16-record remainder is unclassified and UNKNOWN. **Every list is a human-readable size**, which is what makes "halt the book until signed off once" viable. Organic additionally has **37 acknowledged-but-uncorrected** errata that no byte comparison can ever see.
  - ▶ **Specification requirement on an unbuilt component, not a defect claim:** §C82's extraction fingerprint is specified as a hash over `cnxml-extract.js`'s **import graph**, so a change to `01-source` **content** does not move it. Record a **per-module `sourceSha256`**, reusing the existing manifest value. Do **not** widen the book fingerprint — a 12-module source refresh would then quarantine all 342.
  - *[severity: no external anchor exists for the legally load-bearing tree · reader-visible: no · blocks: nothing today; sequenced with §C82's pre-run steps · relates: §C80, §C82, §C88, §C92, §C93]*
```

---

# SECTION 4 — CLAUDE.md: the licence-keyed source rule (short), and the guard it points at

## 4a — `CLAUDE.md`: REPLACE lines **61–90** (the whole `## 🔒 MANDATORY: Never overwrite local OpenStax CNXML…` section, heading at 61 through `otherwise bypass.` at 90; leave the blank at 91 and the `---` at 92 in place)

> **The three-step consent stays UNCONDITIONAL.** The mechanical gate is additive. Narrowing consent to the CC BY books is a separate decision the lead has not taken (→ §C92 condition 1, §C93 open question 1).

```markdown
## 🔒 MANDATORY: `books/*/01-source/` — consent is unconditional, and refresh is LICENCE-KEYED

The CNXML under `books/*/01-source/` is the **legally load-bearing** OpenStax copy. The licence
governing it is the one in force **on the date that copy was obtained**, and a CC grant is
irrevocable for the copy you hold. Chemistry, Biology and Microbiology were obtained while **CC BY**;
Organic and College Physics were already **CC BY-NC-SA** — but **do not trust that sentence:
`books/<slug>/book-config.json` is authoritative, and upstream has since relicensed, so never
re-derive it from OpenStax today.** Record:
[docs/provenance/openstax-cnxml-licence-provenance.md](docs/provenance/openstax-cnxml-licence-provenance.md).

**The procedural rule, unchanged and unconditional.** Before you re-download, re-clone, `git pull`,
`rsync`, extract, copy or by any other means replace or modify **any** file under `01-source/` from an
OpenStax/CNX source — **for any book, whatever its licence** — all three must happen first, in order:
(1) remind the user **in writing** of the ramifications and name the exact files, (2) obtain explicit
written confirmation, (3) obtain a **SECOND, distinct** written confirmation. A bare "yes" / "ok" /
"go ahead" / pressing Enter on a permission prompt is **NOT** consent. Any step missing → **stop and
report**.

**The mechanical control is additive, not a substitute.** `tools/lib/source-refresh-policy.cjs`
refuses every write into `01-source/` unless **all four** hold. Each is fail-closed, each keys on the
`book-config.json` **sibling of the directory being written**, and **none has a flag, env var or
parameter that overrides it**:

1. the recorded licence is on the closed **refreshable allowlist** — CC BY, absent, malformed or
   unrecognised all **refuse**;
2. a `.source-info.json` commit exists to record as the superseded one;
3. the `<md:license>` parsed from the **freshly fetched** collection matches that recorded code
   **exactly** — a difference in **either** direction refuses;
4. the target is on the closed path allowlist and is not carved out as `localOrigin`.

▶ **Corollary: this tooling can never change a book's licence posture.** Acquiring
differently-licensed bytes is a fresh intake, not a refresh.

⚠️ **`rm -rf 01-source/` is NOT a safe reset** — an older guard message prescribed exactly that. It
destroys what no refetch restores and no hash gate covers: chemistry's hand-rebuilt `ch00/m68662.cnxml`
and the `docx/` export that is its only CC BY basis, and organic's `exercises/` cache.
`.source-manifest.json` hashes `*.cnxml` **only**.

⚠️ **Never regenerate `.source-manifest.json` to make a check pass — that IS the laundering step.**
There is deliberately **no standalone regenerate verb**: the generator mints only when none exists,
and only a refresh may supersede one, appending the superseded hashes and commit.
```

## 4b — Register §C93 — the guard's findings and its [LEAD] confirmation

**TARGET FILE:** the register, `## P1` list — insert immediately after **§C92**.

```
- **C93 · 🔴 THE `01-source` OVERWRITE GUARD IS LICENCE-BLIND, AND `--allow-overwrite-source` REACHES THE IRREVOCABLE CC BY COPIES** — **[CODE]** + **[LEAD]** (③) — **P1** — *logged 2026-08-17 while designing the guard the organic refresh (§C92) would need. **Two of the three findings are live on today's `main` and are independent of that decision.***

  - **① 🔴 NOTHING THAT WRITES `01-source/` READS A LICENCE.** Measured with `grep -ac 'getBookLicence\|licence\|license'` and `grep -ac 'book-config'` over all four writers/verifiers — `tools/download-source.js`, `tools/generate-source-manifest.js`, `tools/verify-source-manifest.js`, `tools/lib/source-manifest.cjs` — **0 and 0 in every one**, against the positive control `tools/lib/book-licences.cjs` at **18 and 6** [M]. F2's guard (`download-source.js:190-199`) keys on *"is `01-source/` populated"*, and **`--allow-overwrite-source` overrides it unconditionally** — so the flag that exists for the two CC BY-NC-SA books reaches Chemistry, Biology and Microbiology identically. ▶ **This is the `--force` that defeats the purpose**, and it is the shape `docs/audit/2026-07-11-product-provenance-durability-audit.md:100` already logged.

  - **② 🔴 THE CI BASELINE GATE CAN BE WALKED PAST BY DELETION, AND `generate-source-manifest.js --all` IS A ONE-LINE LAUNDERING COMMAND.** `tools/__tests__/source-manifest-baseline.test.js` enumerates books by `listCnxmlFiles(...).length > 0` with `expect(books.length).toBeGreaterThan(0)` as its only floor — **so a book whose `01-source` CNXML is emptied drops out of the gate silently, and four of five could vanish with the suite still green** [M]. Separately, the generator **overwrites an existing manifest with no refusal**, and `--all` does it to every book at once [M] — a command whose whole effect is *"make `verify-source-manifest` go green"*. ▶ **Present-tense defects; worth fixing whether or not any refresh is ever authorised.**

  - **③ 📋 [LEAD] THE DESIGN THAT CLOSES ①–② AND MAKES AN ORGANIC REFRESH SAFE IS SPECIFIED, NOT BUILT.** Four conjunctive fail-closed gates in a new `tools/lib/source-refresh-policy.cjs`, keyed on the `book-config.json` **sibling of the directory being written**; **no flag, env var or parameter overrides any of them.** ▶ **Invariant: a refresh may replace bytes only with identically-licensed bytes, in a book on a closed refreshable allowlist, at paths on a closed write allowlist, recording the superseded hashes and commit append-only.** ▶ **Corollary the lead should confirm they want: this tooling can never change a book's licence posture.** Spec → [`docs/superpowers/specs/2026-08-17-c93-licence-keyed-source-refresh-design.md`](../superpowers/specs/2026-08-17-c93-licence-keyed-source-refresh-design.md). **No plan, no code.**

  - ⚠️ **DELETING `01-source/` IS NOT A SAFE RESET, AND THE CURRENT GUARD'S OWN ERROR MESSAGE PRESCRIBES IT** (`download-source.js:197`, *"delete `01-source/` by hand, then re-run with `--allow-overwrite-source`"*). Following it destroys files **no refetch restores and no hash gate covers**: chemistry's hand-rebuilt `ch00/m68662.cnxml` plus the **273 tracked files under `01-source/docx/`** — including its sole CC BY provenance basis — and organic's **1,961 tracked exercise files**, the cache under the already-paid exercise track. `download-source.js` has **0** references to `exercises` and **0** to `docx`, against **16** to `media` as control [M], and `computeFiles` hashes `*.cnxml` only, so both trees sit **outside every hash gate** [M]. ▶ **That message must change in the same PR as ①.**

  - ⚠️ **Three smaller instrument defects found in the same sweep.** (a) All **5 of 5** committed `.source-manifest.json` files carry the note *"Tamper-evidence baseline for the **CC BY** 01-source CNXML"* — including both CC BY-NC-SA books — because `NOTE` is a `const` at `generate-source-manifest.js:31`, and `tools/__tests__/source-manifest-cli.test.js` **pins it** with `expect(written.note).toMatch(/CC BY/)` [M]. (b) `efnafraedi-2e` is the **only** one of five source-bearing books with **no `.source-info.json`** [M] — recovery method and candidate commit are **§C94's**, not restated here. (c) `orverufraedi`'s `.source-info.json` says `fetchedAt: 2026-03-02` while its `book-config.json` and the provenance doc §3 say obtained **2026-03-09** — it does not change the CC BY verdict (both precede 2026-03-19) but it matters the moment `.source-info.json` becomes the authority for *"the old commit"* [M].

  - 🔴 **ORDERING HAZARD — MINT-ONLY AND THE REFRESH ARE COUPLED.** Making `generate-source-manifest.js` mint-only removes the only supported way to regenerate a manifest. **If it lands before the refresher exists, a manual §C92 refresh leaves `source-manifest-baseline.test.js` red with no green path.** ▶ **Either mint-only ships WITH the refresher, or the refresh happens while the generator still overwrites.** Pick one explicitly; do not discover it mid-refresh.

  - Evidence → [test-results/organic-expansion-openstax-oracle-2026-08-17.md](../../test-results/organic-expansion-openstax-oracle-2026-08-17.md) · [docs/provenance/openstax-cnxml-licence-provenance.md](../provenance/openstax-cnxml-licence-provenance.md) · [docs/plans/2026-07-02-f2-source-guard-design.md](2026-07-02-f2-source-guard-design.md) (F2, frozen — evidence, not status).
  - *[severity: an accidental overwrite destroys an irrevocable licence grant, undetectably in file content · reader-visible: no · blocks: nothing today; ①② are independent · relates: F2, §C80, §C92, §C94]*
```

## 4c — NEW spec: `docs/superpowers/specs/2026-08-17-c93-licence-keyed-source-refresh-design.md`

````markdown
<!-- FROZEN DESIGN RECORD — banner-dated 2026-08-17. Per CLAUDE.md § One source of truth this is
     EVIDENCE, never status. Open work lives in the active register (§C93). If this disagrees with
     the register, THE REGISTER WINS. Numbers are marked [M]/[D]/[E] inline. -->

# C93 — the licence-keyed `01-source` refresh guard

## Invariant

**A refresh may replace bytes only with identically-licensed bytes, in a book whose recorded licence
is on a closed refreshable allowlist, at paths on a closed write allowlist, recording the superseded
state append-only.** Four conjunctive, fail-closed conditions. **Corollary: this tooling can never
change a book's licence posture.**

⚠️ **This gate does not replace CLAUDE.md's three-step written consent, which is unconditional and
applies to every book regardless of licence.** The gate converts an *accident* into an impossibility;
consent governs the *deliberate* act.

## Placement — no new tool

`server/services/openstaxFetcher.js` is **not** extended: it keys on OpenStax collection slugs
(`organic-chemistry`), not ours (`lifraen-efnafraedi`), it is a *structure* fetcher, and it lives in
AGPL `server/` — an MIT `tools/` import would add an MIT→AGPL edge (CLAUDE.md gap E-2).

| Action | File |
|---|---|
| **create** | `tools/lib/source-refresh-policy.cjs` — the gate. CJS, mirroring `source-manifest.cjs`. |
| modify | `tools/download-source.js` — call the gate; parse `<md:license>`; write v2 manifest + `previous`; **fix the delete-prescribing error message**. |
| modify | `tools/lib/source-manifest.cjs` — read v2; honour `localOrigin`. |
| modify | `tools/generate-source-manifest.js` — **mint-only**; licence-accurate `note`. |
| modify | 4 test files + `server/routes/admin.js` (409 reason) — see *Test plan*. |

**Path resolution.** The gate reads `path.join(sourceDir, '..', 'book-config.json')` — the sibling of
the directory being written — **not** `book-licences.cjs`'s repo-root lookup. Three reasons: the
licence that governs the bytes you are about to overwrite is the one recorded beside them; it is
intrinsic, per CLAUDE.md's never-`cwd()` rule; and **the write target *is* the identity**, so no
caller can name one book and write another. *Declared out of model, consistent with F2: a caller who
can also edit that sibling `book-config.json` is outside the threat model.*

## The four gates

**G1 — book gate. `assertRefreshable(sourceDir)`. Arity 1. No options object, no `force`, no env var
— there is nothing to pass.**

```js
const REFRESHABLE = new Set(['CC BY-NC-SA 4.0']);   // closed allowlist, EXACT match
```

Allowlist, not denylist: a denylist fails open on a typo, a new book, or a missing config. **Do not
normalise, lowercase or regex the string** — an unrecognised value refuses, and the fix is a
reviewable edit to `book-config.json`, never a looser matcher. CC BY, absent (`stjornufraedi`,
`testbook`) and malformed land in the same refusal.

**G2 — vintage gate.** `.source-info.json` must exist and carry a `commitHash`, and the new upstream
commit must differ from it. Absent → refuse: **there is nothing to record as the OLD commit.**
⚠️ `efnafraedi-2e` has no `.source-info.json` [M] — protected by G1 anyway, but this is why G2 is a
gate and not a warning.

**G3 — licence-identity gate.** Parse `<md:license url=…>` from the **freshly fetched**
`collections/<name>.collection.xml`, map the URL through a closed enum, and require exact equality
with G1's code. **Differ in EITHER direction → refuse, write nothing, print both.**

This is the subtlest gate. **G1 keys on the recorded licence, which describes the OLD bytes, while
authorising a write of NEW bytes whose licence is unknown until fetched.** Without G3 the allowlist
*self-poisons*: an upstream NC-SA→CC BY flip would pull CC BY bytes into a book still recorded as
NC-SA, and the *next* refresh would destroy an irrevocable CC BY copy. The other direction (NC-SA→ND
or worse) would silently strip our derivatives of the right to exist. An unrecognised URL refuses.

*Evidence this is the right element:* the provenance doc §2 establishes that per-module `index.cnxml`
carries **no** `<md:license>` in any revision and the **collection** metadata governs throughout
(2026-06-24). `download-source.js` already downloads and parses that file **before** calling
`organizeSourceFiles`, so **G3 fits the existing seam with no restructuring.**
⚠️ **UNKNOWN, and it must be settled before G3 is built:** nobody re-measured that upstream
`collection.xml` still carries `<md:license url=…>` today — no raw collection XML exists locally
(`find books -name '*.collection.xml'` → **0**, control `collection-order.json` → **5** [M]).
**Settle it with one fetch** of `collections/organic-chemistry.collection.xml` at a named upstream
sha. *(§C92 measured the URL as unchanged at `8917713c` — that measurement is the fetch, so if it is
carried forward, G3's premise is already evidenced for organic at that sha.)*

**G4 — write-set gate. THIS IS THE ONE OWNER OF "WHAT A REFRESH MAY TOUCH".** The write set is a
**closed allowlist**: `chNN/*.cnxml`, `appendices/*.cnxml`, **`media/*`**, and the three named
metadata files (`.source-info.json`, `.source-manifest.json`, `collection-order.json`). **Everything
else under `01-source/` is unreachable because it is not on the list** — which is what protects
`docx/` (**273** tracked files [M]) and `exercises/` (**1,961** tracked files [M]), both outside
`computeFiles`' `*.cnxml` walk and therefore outside every hash gate [M].

`localOrigin` is then a **carve-out within** that allowlist, accepting file paths **and directory
prefixes**, for bytes that did not come from upstream:

```json
"localOrigin": [
  { "path": "ch00/m68662.cnxml",
    "reason": "re-authored from the lead's CC BY-era Word export; does not exist upstream",
    "evidence": "docs/provenance/openstax-cnxml-licence-provenance.md §1" },
  { "path": "docx/", "reason": "CC BY-era Word export; the sole provenance basis for m68662" },
  { "path": "exercises/", "reason": "resolve-os-embed.js cache; download-source.js never restores it" }
]
```

▶ **This is how a book that IS refreshable is still protected.** The gate is book-agnostic: organic
could acquire a hand-built module tomorrow. **The refresher never deletes** — it copies over — and
`localOrigin` paths are never written and are **reported** in the run summary.

## Manifest v2 — supersede, never regenerate

The laundering step today is that any tree can be made green by re-minting. Closed two ways:

1. **`generate-source-manifest.js` becomes mint-only** — refuses when a manifest already exists.
   `--all` then mints only for books that lack one, i.e. **a no-op on today's tree** [M: 5 of 5
   present]. **No standalone regenerate/`--supersede` verb is added.** If your tree drifted, the fix
   is `git checkout` of the source, not a new manifest.
   🔴 **Ordering: mint-only removes the only supported regeneration path, so it must ship WITH the
   refresher or after any manual refresh — see register §C93's ordering hazard.**
2. **Only a refresh may supersede**, in the *same process* as the fetch, from the manifest it actually
   replaced — so `supersedes` cannot be back-filled.

```jsonc
{
  "version": 2,
  "book": "lifraen-efnafraedi",
  "algorithm": "sha256",
  "upstream": { "repo": "...", "collection": "...", "branch": "main",
                "commit": "<new sha>", "fetchedAt": "...",
                "licenceAtFetch": { "url": "...", "text": "..." } },
  "localOrigin": [ /* above */ ],
  "supersedes": [                       // APPEND-ONLY; never rewritten
    { "upstreamCommit": "2a1f8284...",
      "generatedAt": "...",
      "licenceAtObtaining": { "code": "CC BY-NC-SA 4.0", "obtained": "2026-03-23" },
      "fileCount": 342,
      "filesDigest": "<sha256 of the canonical JSON of the previous `files` map>",
      "gitCommit": "<commit that held the superseded manifest>",
      "recordedAt": "..." }
  ],
  "files": { /* … */ }
}
```

**House-style note, so a reviewer does not flag it:** there is **no live `licence` key at the top
level** — `book-config.json` owns that. `upstream.licenceAtFetch` is a genuinely new fact nobody owns.
`supersedes[].licenceAtObtaining` is a **frozen historical snapshot** of a superseded state, not a
restatement of a live value. **No new `book-config.json` key is introduced**, so the `NON_RENDER_KEYS`
durable rule is untouched. `filesDigest` pins the whole previous hash map in 64 bytes, so the old
hashes survive **twice** — in git history, and as a digest that makes the git-history copy checkable.
`.source-info.json` gains a symmetric append-only `previous: [{ commit, fetchedAt, supersededAt }]`.

**Provenance doc in the same change, enforced not remembered.** A Vitest gate asserts that for each
source-bearing book, `docs/provenance/openstax-cnxml-licence-provenance.md` contains the current
`upstream.commit` from that book's manifest — a bump without a doc update goes red. Same pattern as
item 17's `VEFUR_CONTRACT` licence-agreement test. **The manifest owns the enforceable value; the doc
owns the human narrative; the test pins agreement.** ⚠️ Chemistry must be asserted as a
**known-absent state**, not skipped — a silently skipped book is a manufactured absence.

## Test plan (the instruments are half the work)

- **`source-manifest-baseline.test.js` — fix the dropout (finding ②).** Enumerate the **union** of
  *has a manifest* and *has CNXML*, not CNXML alone. Delete the CNXML → still enumerated via the
  manifest → red. Delete the manifest → still enumerated via the CNXML → red. Deleting **both** drops
  out and is **declared out of model** — a tracked-file deletion visible in the diff, the same
  carve-out F2 gives the deliberate insider. ⚠️ `__e2e-fixture__` (licence `CC BY 4.0`, 0 CNXML, no
  manifest) stays out of **both** sets, so the suite is unaffected — do **not** key this on licence.
- **`source-downloader.test.js` — the fixture must gain a real `book-config.json`.** Every case today
  passes a tmp `sourceDir`, so the sibling lookup refuses and all of them go red. **That is the
  correct outcome and must not be mocked away** — a mocked gate is a gate by care. Write an NC-SA
  config beside the tmp dir for the pass cases and a CC BY one for a new refusal case.
- **`fetchSourceGuard.test.js` — convert from absence to presence.** It asserts the *string*
  `--allow-overwrite-source` is absent from the spawned argv; assert instead that the argv **equals
  the exact known list**. An absence says whether you observed, never whether it is there — and it
  passes vacuously the moment the flag is renamed.
- **`source-manifest-cli.test.js`** pins `note` to `/CC BY/` [M]; retarget it to the per-book code.
- **New:** `assertRefreshable` has **arity 1** and the module exports nothing else — the
  machine-checkable form of *"no flag overrides it"*. Plus one refusal case per gate, each with a
  passing NC-SA control in the same file, so a harness that refuses everything cannot read as a pass.
- 🔴 **Verify every refusal test against the BROKEN state** — stash the gate, watch each refusal case
  go green (the write succeeds), restore. A refusal test that would refuse with the gate removed
  proves nothing.

## Out of model (declared)

A holder of repo write access who edits the CNXML **and** the sibling `book-config.json` **and** the
manifest **and** commits all three. F2's own threat model draws this line; C93 does not move it.
````

---

# SEQUENCING — from today to organic module 1

**Legend:** 🟩 = apply now, no decision needed · 🟨 = [LEAD] decision required first · ⬜ = build work.

| # | Step | Blocks / blocked by | Decision? |
|---|---|---|---|
| **0** | **Apply this amendment set** — Section 1 (register §C80 + collateral), Section 2 (§C92), Section 3 (spec §11 + battery banner + §C94), Section 4 (CLAUDE.md + §C93 + guard spec). One docs commit, riding along with the next code branch per the batch-docs-only-pushes preference. ⚠️ **Confirm §C92–§C94 are still unclaimed** and grep the applied text for stale `C9[0-4]` references. | nothing | 🟩 |
| **1** | **[LEAD] approve or stage the budget delta** (+13,945 ceiling / +12,867 expectation). Recommended shape: approve organic in full, authorise only the shakedown batch now, gate the remaining 325 on the 0-ISK 10-module pilot. | gates step 8 | 🟨 |
| **2** | **[LEAD] rule §C92 — refresh organic's `01-source`, yes or no.** If yes: run the **three-step written consent** as written (unconditional), then refresh at a **named sha**, write set = §C93 G4 (`chNN/*.cnxml` + `appendices/*.cnxml` + **`media/*`** + the three sidecars; **never** `docx/`, **never** `exercises/`), regenerate `.source-manifest.json` and update `.source-info.json` in the same commit, update the provenance doc. **Re-run the compare first if upstream HEAD has moved.** | precedes step 5; if no, step 5 stands alone | 🟨 |
| **3** | **[LEAD] re-take §C88's scope ruling** — organic's 245 `entry-not-in-figure` alts IN or OUT. Its stated premise ("213 sit in modules §C80 is not buying") is void. The deciding question is the **anchor** (0 of 245 have a media or figure `@id`), not the ≈259 ISK. **§C88 cannot be planned until this is recorded**, and its acceptance gate must be re-stated for organic (245 of 2,163) rather than inherited from chemistry (197 of 1,149). | blocks step 5 | 🟨 |
| **4** | **[LEAD] decide whether §C93 is on the critical path.** The discriminating question is narrow: *does anything write to `01-source/` between now and the guard shipping, other than the one authorised organic refresh?* **If no** — the refresh proceeds manually under the unnarrowed consent, §C93 ①② ship as a small independent PR, and G1–G4 lands when convenient to protect future refreshes. **If the refresh is to be done BY the tool**, the tool must exist first and steps 2 and 4 invert. ⚠️ **Either way, settle the mint-only ordering hazard explicitly** (§C93): mint-only ships *with* the refresher, or the refresh happens while the generator still overwrites. | interacts with step 2 | 🟨 |
| **5** | **Land every extraction-side fix in ONE re-extract per book:** §C88 (run blocker) · §C90 (`cnxml-extract.js:253` comment-blind `<image>` regex — **re-bakes `02-structure`, so it IS a re-extract and must not ship alone**) · §C81's `<para>`-strip double-extraction fix. **Then re-derive the allowlists:** chemistry's **4** residue entries are voided; organic's **12** are not; `fidelity-allowlist.json` keys on `moduleId+tag+diff`. | blocked by 2, 3 · blocks 7 | ⬜ |
| **6** | **Free measurements worth taking before any spend:** a `--dry-run` on a **fresh chemistry extract** (settles the 43,078 vintage caveat at 0 ISK, and belongs before the CHEMISTRY leg) · one read-only prod query on `segment_acceptances` (settles the throughput unknown that dominates the whole decision) · optionally, the §C94 chemistry `.source-info.json` backfill (~1 h; pins a **pre-relicense** commit). | none | 🟩 |
| **7** | **§C82 ③'s both-arms glossary run** on module 1 of each book (~400 ISK across two books). | blocked by 5 | ⬜ |
| **8** | **Organic module 1.** ⚠️ **Re-running the 17 former-preview modules needs `--force`** — an operational step that will otherwise halt a paid run mid-book. **The extraction-vintage window closes here**: any extraction-side fix found after this quarantines every cleared module and batch-re-MTs it at the book's end, now up to 342 instead of 17. | blocked by 1, 5, 7 | 🟨 (spend) |
| **9** | **Before the remaining 325:** the 10-module pilot's throughput number + the [LEAD] gate from step 1. | blocked by 8 | 🟨 |
| **10** | **Publication-side, gates the SYNC not the run:** §C85's `m00032` / `m00023` / `m00046` (re-inject costs no ISK) · per-book **CC BY-NC-SA** licence rendering verified across ~20× the surface · `sync-content.js` invoked with the books **named**, never bare. | blocked by nothing in the run | ⬜ |
| **—** | **⏰ A deploy is already owed and is outside this sequence.** It does not block organic, but prod's content cron stays stranded until `./scripts/deploy.sh` runs. | — | 🟩 |

## The four decisions the lead must make, in the order they bite

1. **§C92 — refresh organic's source, yes or no** (recommended yes, consent intact). *Precedes everything; blocks step 5.*
2. **§C88's organic scope — IN or OUT** (recommendation: re-affirm OUT for the honest reason — no anchor — rather than the void one). *Blocks planning the run blocker.*
3. **The budget delta** — approve outright, or stage behind the 0-ISK pilot (recommended: stage). *Blocks the spend, not the build.*
4. **Is §C93 on the critical path** — manual refresh under consent with ①② as a small independent PR (recommended), or tool-first. *Only interacts with §C92's timing.*

**Not proposed, deliberately: any change under `books/`.** Nothing in this deliverable was applied; `git status --porcelain` returned 0 lines at finish.