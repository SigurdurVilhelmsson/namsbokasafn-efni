> **FROZEN EVIDENCE — 2026-08-19.** This is the §C88 whole-branch adversarial review exactly as it
> was written, at branch tip `05902df3`. It is EVIDENCE, not status: per CLAUDE.md § One source of
> truth, if it disagrees with the active register, **the register wins** — this document is dated,
> the register is live.
>
> Method: five capability lenses run in parallel over the branch diff, findings deduped, then each
> put to an independent skeptic instructed to REFUTE (survivors met a second, independent one).
> 20 agents · 11 findings → 2 confirmed, 9 refuted. Frozen because the SDD workspace it was written
> in is gitignored and is deleted at plan close-out — the §C97 class this branch itself opened.
> Precedent: `2026-08-18-c9-whole-branch-review.md`, alongside.

# §C88 — whole-branch adversarial review

**Branch:** `feat/c88-unreachable-figure-alt` · **HEAD** `1cc3ebad` · **merge-base** `d3607c50` · 28 commits
**Written:** 2026-08-19 · **Method:** two independent refutation passes over 9 candidate findings; 2 survived (one defect, described twice), 7 killed. Every number below re-derived by the reviewer against the tree, not copied from a task report.

---

## Verdict — is this branch safe to merge?

**Yes. No production code change is required.** Two documentation edits **must land in this branch, before the workspace is deleted** — both are owned by this branch, both are cheap, and neither is optional for the reason below. *(This review is read-only; both are recommendations for the controller to apply, not work left undone.)*

They are not "nice to have docs tidying". §C99's false diagnosis sits in the **live register**, the one owner of open work, where it will send the next fixer to the wrong file; and the seven §C97 instances exist **only** in `.superpowers/sdd/`, which is gitignored and `rm -rf`'d at plan close-out — after that they are gone, not merely unlogged.

The branch is in good shape, and the strongest evidence for that is not the green suite:

- **Production surface is small and matches the plan** — three files (`cnxml-extract.js` +265, `cnxml-inject.js` +214, `lib/extraction-coverage.js` +85).
- **Root `npm test` 330 files / 4883 tests, exit 0** (controller-verified independently).
- **Corpus invariants unchanged across the whole branch:** `positional === []`, three duplicates `=== []`, organic loss `['m00032']` / gain `['m00023','m00046']`. The must-NOT-move pins did not move.
- **Chemistry acceptance is a real measurement, not a tautology:** reachable 1149, unreachable 0, emitted 1148, reached 1148, dropped `[]`. Chemistry's `guarded` count is **0**, so `reachable` is a true expected-emit count there and the one-unit gap (`m68727`, pre-existing regex truncation) is a genuine residual, not slack.
- **The §C89 class recurred FOUR times inside this branch and this branch's own instruments caught all four** (Task 4's `.problem.content`/`.solution.content` descent, Task 7's `inlineTables`, physics `m42099`, `applyMediaAltString`'s missing child-`<image>` fallback). A run that finds its own dominant failure mode four times is a run whose instruments work.
- **Both known instrument failures were closed, verified in the tree:** the five segment-level-only guard tests now carry structure-level assertions (`cnxml-extract-bare-media-alt.test.js:252,272,…`, 27 tests), and Task 11 added a structure-tree census that segment counts structurally cannot perform.
- **The close-out blocker is fixed** — `tools/lib/extraction-coverage.js:192` no longer cites the gitignored workspace; it now points at the frozen spec and the register. Verified by grep over all three touched production files.
- **Task 2's explicit re-check obligation is discharged, and the answer changed:** the ledger asked this review to re-measure the `inlineMedia` fold's 0-overlap with `collectMediaAlts`, because Tasks 4–7 add the second shape. Re-measured over all five books: **overlap is now 18 (all physics), conflicting 0** — every overlapping id maps to an identical `segmentId`, so the later fold's overwrite is value-identical. Not a defect; the prediction was right and the outcome is benign.

One finding survived refutation. It is **pre-existing at merge-base** — the regex is byte-identical at `d3607c50` — so it is not a §C88 regression. What this branch *does* own is the §C99 register entry that mis-attributes it.

---

## Confirmed findings (survived refutation)

### F1 — `buildExerciseDom`'s recovery regex requires `id` to be the first attribute; 27 whole `<exercise>` elements vanish from 12 physics modules with `report.complete === true`

**Severity: Important (P2)** — pre-existing, latent, zero exposure today. **Escalation trigger: the day physics re-enters the §C82 run's scope, this becomes P1 reader-visible content loss.**
*Admitted under the "worse than recorded" exception to the no-re-report rule: this is the mechanism behind known defect #3 (§C99), and it is materially larger and differently located than the register records.*

**File:** `tools/cnxml-inject.js:3700-3705` (DOM builder) — same shape also at `:3596` (regex `buildExercise`), `:4019` (`buildNoteDom`), `:3324` (`buildExampleDom`).

**Mechanism**
```js
const exercisePattern = new RegExp(
  `<exercise\\s+id="${element.id}"[^>]*>[\\s\\S]*?<\\/exercise>`, 'g');
const match = exercisePattern.exec(originalCnxml);
if (!match) return null;                                   // :3705
```
`\s+` matches whitespace only, so `id` must be the **first** attribute of the open tag. Physics source writes `<exercise xmlns:m="http://www.w3.org/1998/Math/MathML" id="fs-id…" type="…">`. The pattern misses, `buildExerciseDom` returns `null`, and both emission loops (`if (elementCnxml) lines.push(...)` at `:2210` and the `buildSection` twin at `:2464`) skip a null silently. The whole element — problem prose, solution prose, media, image, equations — is absent from the injected CNXML.

`report.complete` stays **true**: a container that is never built never *requests* its segments through `getSeg`, so they are not "missing"; it emits nothing, so it leaves no residue. The CLI's write gate is `if (!result.report.complete && !args.allowIncomplete)` (`:4896`), so the module is written and the run exits 0.

**Concrete failure**
Inject `books/edlisfraedi-2e/01-source/ch02/m42099.cnxml`. Source holds 23 `<exercise>`; 4 declare `xmlns:m` before `id` (`fs-id1164906434690`, `fs-id1164906440403`, `fs-id1164906424347`, `fs-id1164906459326`). Those 4 are entirely absent from the output, including `fs-id1164906440403`'s `<solution>` and its `<media id="import-auto-id2179860">` — the §C99 media. `report.complete === true`, `segmentsMissing.length === 0`, exit 0.

**Census (re-derived by this review, two independent steps)** — 27 exercises, 12 modules, **physics only**; chemistry, organic, biology, microbiology and astronomy are all 0.
Step 1, source shapes: `grep -oaP '<exercise\s+(?!id=)[^>]*\bid="'` → 27 ids.
Step 2, **reachability of the drop path** — the source shape only matters if `buildElement` is actually called for that element, so I ran `extractSegments` over all 12 modules and intersected the id-not-first id set with the `{type:'exercise'}` nodes in `structure.content`: **27 of 27 are present as structure nodes** (`m42099` 4/4, `m42459` 9/9, `m42606` 4/4, all others 1/1, none missing). So `buildExerciseDom` is invoked for every one, and every one hits the `return null` at `:3705`. The table is measured, not inferred:

| module | lost / total | | module | lost / total |
|---|---|---|---|---|
| m42033 | 1 / 9 | | m42219 | 1 / 28 |
| m42096 | 1 / 18 | | m42440 | 1 / 21 |
| m42099 | 4 / 23 | | m42459 | **9 / 30** |
| m42100 | 1 / 12 | | m42606 | **4 / 5** |
| m42102 | 1 / 26 | | m42665 | 1 / 16 |
| m42103 | 2 / 16 | | m42218 | 1 / 8 |

**The §C99 correction, measured — this is the load-bearing part.**
§C99 records the drop as *"module-specific rather than structural to the position"*, *"only `m42099` drops"*, *"Whatever differs is specific to that module, not to the position or the book"*, with candidate causes *"this exercise's particular nesting"* or *"a divergence between Task 4's emitter and Task 5's `processExample` extension"*.

I tested the seven physics modules carrying the §C99 shape (id-bearing `<media>`, direct child of `problem`/`solution`, `<exercise>`-nested, not inside a `<figure>`) for attribute order of the **enclosing** exercise:

| module | enclosing exercise | §C99 outcome |
|---|---|---|
| **m42099** | **ID-NOT-FIRST** | **drops** |
| m42102, m42103, m42076, m42132, m42296, m42360 | ID-FIRST (all) | reach fine |

**7 of 7 discrimination.** §C99's *observation* ("6 of the other 7 reach fine") is correct and stands. Its *diagnosis* is wrong: the discriminator is structural, enumerable and book-independent — attribute order in the enclosing open tag — not anything specific to `m42099`. A fixer following the entry as written goes to `applyMediaAltDom` / the emitter divergence / a physics write-back pin and finds nothing, because no alt-level change can restore a deleted element.

**Two corrections carried against the finding's own claim** (stated so they are not laundered into the verdict):
1. **"11,744 characters of paid Málstaður MT at risk" is FALSE.** `books/edlisfraedi-2e/02-mt-output/` and `03-translated/` hold **ch04 only**, and none of the 12 affected modules is in ch04. Zero paid MT is exposed; the lost text is untranslated English source. Nothing on disk is damaged today.
2. **"No counter moves anywhere" is too strong.** `compareTagCounts` (`:4918`) *does* detect it (`exercise 23→19`, `problem −4`, `solution −3`, `para −12`, `media −1`, `image −1`) — but it prints only under `--verbose`, does not gate, and is buried among the 77 `unexplained` diffs already in physics's `translation-errors.json`. What is true is that the **gating** check stays green and the module is written with exit 0.
   `tools/cnxml-fidelity-check.js` would also flag it, but it is in no npm script and no workflow (`validate.yml:51` runs only `fidelity:render`, hardcoded to `efnafraedi-2e`), and `books/edlisfraedi-2e/fidelity-allowlist.json` does not exist.

Also refuted by measurement: a second reviewer's claim that "m42102 and m42103 silently delete exercises, contradicting §C99's reach-fine list". Both modules *do* lose an exercise — but not the one carrying the §C99-shape alt, whose enclosing tag is id-first. Both statements hold simultaneously; only the diagnosis is wrong.

**Recommended action**
- **Before merge (docs-only, MUST):** correct §C99's root-cause clause. Replace "module-specific rather than structural to the position" with the attribute-order discriminator, the 27/12 census, and the fact that the loss is whole exercises, not one alt. Keep the 7-module reach table — it is right, and it is now the evidence *for* the diagnosis rather than against it.
- **Follow-up item (code, P2, not this branch):** widen the pattern to the tolerant shape the same file already documents — `buildTable`'s `tablePattern` at `:2814` uses `<table[^>]*\sid="…"` with the comment *"id attribute can appear anywhere in the opening tag"*. Apply to `:3700` **and** `:3596`; audit `:4019` / `:3324` (which fall back to `buildGenericElement` and degrade rather than vanish, so lower priority). Consider making `buildExerciseDom`'s no-match path fall back like its two siblings rather than returning `null` — the asymmetry is uncommented and is what turns a miss into a deletion.

**Why eleven task reviews missed it:** the sentinel sweep is **alt-only** and reports a per-module count, so `m42099` surfaced as "1 alt short" — a number fully consistent with a write-back bug. No check asks whether the **container** the alt lives in survived. The two corpus write-back pins cover chemistry and organic, and neither book ever puts a namespace declaration before `id`, so the shape is unreachable from the pinned population.

---

## Refuted findings, and why

Seven candidates were killed. Summarised so a reader can audit them. *(Repo precedent: 3 of 43 refutations once turned out wrong about a live defect — spot-check the kills, don't average them.)*

| # | Claim | Killed because |
|---|---|---|
| R1 | Emptying `ALT_BLIND_DIRECT_PARENTS` makes `unreachable: 0` true by construction; 286 skipped alts now counted reachable | Mechanism and arithmetic confirmed, but the named failure scenario used the **wrong instrument** (`checkAltCoverage`'s `reached` counts SEG markers in committed `02-for-mt`, which holds **0** alt segments corpus-wide at *both* vintages — the quoted 0→33 / 4→44 came from a live-extractor sweep, a different function). Substance is a **register-recorded** trade-off: the Task 10 table carries the same 245 + 41 = 286 under the name `guarded`, with the identity `reachable − guarded == emitted` (organic 2163−245=1918, exact). |
| R2 | 184 physics segments extracted from XML-commented-out CNXML, sent to paid MT, can never reach output | Headline **inverted** by counter-example (see carried items — the content *does* reach published output). "Sent to paid MT" false for 169 of 184: physics has only ch04 extracted. The §C88 tie-in is already recorded verbatim in this branch's own register entry (line 33). |
| R3 | Two emitters lack a container strip → 258 physics + 13 microbiology duplicate emits shearing `auto-N` seg-ids | Mechanism confirmed (and understated: 258, not 233). But the claimed *silent* shear is self-contradictory — a shear always produces a **new maximum** `auto-N` absent from any prior translation file, which `getSeg` records as a miss, which makes `report.complete` false, which makes the CLI **refuse the module**. `--allow-incomplete` defaults false and is passed by nothing in `tools/`, `scripts/`, `server/` or `.github/`. Also: the 3 sheared modules are ch13/ch20/ch27, and physics freezes artifacts for ch04 only. |
| R4 | The corpus assertion certifying §C88 cannot fail; E5 flips to false red on 73 modules | Headline false about the file: the certifying assertion is the **second** describe block (`emittedTotal === 1148`, `short === [m68727]`), which goes red if any emitter is deleted; line 51 is a supplementary pin. The "false red" has **no consumer** — `verify-extraction-coverage.js` excludes `altFindings` from `hasFindings` and exits on `ids.length` only. |
| R5 | Fix round 1 pinned only the `note` member of the strip set; deleting figure/table/exercise strips restores 432 spurious structure entries, all green | Mechanism and magnitude confirmed independently (per-figure DOM census: chem 115, physics 113, micro 85, bio 189). But the duplicate is **inert in every traced consumer**: `collectMediaAlts` does an idempotent `map[el.id] = {segmentId}`; `applyMediaAltDom` never iterates `element.content`; `buildExample`'s `stripTags` doesn't list `media`. Only observable effect is extra nodes in `02-structure/*-structure.json`, which is GENERATED. A legitimate Minor. |
| R6 | Blind set emptied for five books on a chemistry-only measurement | Premise false — commit `e142cd10` ("Task 10 — confirm the organic scope decision by measurement") tabulates every book and records exactly the 245 + 41. The Set was also never the sensor for a *new* blind position (an unknown parent falls through to `reason = null` and is counted reachable either way); the real detector is `ok = reached === reachable`, and emptying the Set makes it **more** sensitive. Retaining the old `entry` branch would have made **chemistry** read 1148 emitted vs 1120 reachable — red on the one in-scope book. |
| R7 | `orderedExerciseBlocks`' missing strip produces a new duplicate structure node in physics m42296 | Cited mechanism wrong: both nodes come from the *same* function (once for `<problem>`, once for `<solution>`) over **two physically distinct source elements** — OpenStax assigns duplicate ids at m42296.cnxml:449 and :460. Shape is pre-existing at merge-base. Measured across six books: of 235 new alt segments, **0** are for a media inside a `<figure>`, so the missing strip costs no paid MT anywhere. |

### ⚠️ The one kill cluster I would flag for audit

**R1, R4 and R6 are three independent reviewers converging on the same code — `ALT_BLIND_DIRECT_PARENTS = new Set([])` — and all three kills turn on one shared premise: *nothing in production reads `altFindings.ok` today*.**

That premise is true and I verified it independently (the only driver, `verify-extraction-coverage.js`, excludes `altFindings` from `hasFindings`, never prints it, and derives `exitCode` from `ids.length` alone). The mechanism itself was **never disputed by anyone**: the model now certifies as "reachable" 286 alt positions in organic and physics that the `!media.id` guard means no emitter will ever emit, and `unreachableByReason` is `{}` for every input.

**The premise has a known expiry date.** The register's own RESUME block says: *"THE SUCCESSOR IS THE §C82 RUN — Plans B (the battery) and C (driver + ledger) are unwritten; that is the next build."* **Plan C's driver is the consumer.** The kills are correct about today and stop being correct at the next scheduled item.

I am not overturning them — no wrong output exists in the shipped tree, and the frozen spec already flags *"organic's 245 are now in-scope-and-unreachable, a gap needing its own item"* and *"§8's acceptance gate is chemistry-derived … Re-state the gate for organic before organic module 1"*. But given the 3-of-43 history, a three-way convergence killed on an expiring premise is the most audit-worthy kill in this set. **Whoever writes Plan C must read the spec's banner before wiring `altFindings.ok` to anything that halts a run.**

---

## Carried items — triaged

### MUST-LAND-IN-THIS-BRANCH (both documentation-only; no code)

*Not deferrable: their source of record is deleted at close-out, and the misdiagnosis is in the live register.*

1. **Correct §C99's root cause.** Per F1. The register is the *live owner of open work*, so a false diagnosis there is active misdirection, not frozen evidence — the exact shape of the "follows the same pattern as `buildNoteDom`" line that hid the `<note>` gap for four months. One paragraph.

2. **Log the seven items that live ONLY in the gitignored workspace.** `.superpowers/sdd/` is `.gitignore:104` and is `rm -rf`'d at plan close-out. This branch **opened §C97** — the entry naming precisely this class — and then left seven instances of it unlogged. Verified: the branch's register diff adds §C97–§C100 and **none** of these. Cheapest and most avoidable thing to ship:
   - sibling-`<list>` media double-capture in `orderedExerciseBlocks` (`cnxml-extract.js:1671-1681`) — 0 live occurrences, absorbed by dedupe Rule 1;
   - self-closing `<media …/>` inside a `<para>` unreachable by `extractInlineText` (`:246`, paired form only) — pre-existing, 0 occurrences;
   - a note's own inner `<para>` duplicated as a top-level `example.content` para entry — pre-existing, same shallow-scan root cause;
   - `stripContainersByLength`'s partially-overlapping-span hole — 0 corpus instances, docstring corrected, the *code* limitation still wants a line;
   - `assertNoDroppedListBlocks` (`:2069`) can have its `rendered` set joined by alt-less media ids, potentially masking a genuine OC-E drop;
   - the missing container strip in `orderedExerciseBlocks` / `processTable`'s entry scan (R3 + R5 residual) — 271 wasted emits, inert today, an asymmetry with the branch's own two sibling emitters;
   - the comment-blind answer-key renderer (below).

   *(An eighth candidate needs no action: the sentinel sweep's blindness to deduped duplicate structure entries **is** already in the register — but as **evidence** inside Task 11's entry, explaining why the structure census was done, not as an open item. If the controller wants it tracked as an open gap in a committed test's coverage, that needs its own line; otherwise it is covered.)*

### SHIP-AS-REGISTERED-FOLLOW-UP

3. **The `<exercise\s+id=` regex fix itself** (F1) — P2 code item, pre-existing, physics-only, no exposure until physics re-enters scope. Do **not** hold this branch for it.

4. **NEW — the answer-key renderer publishes commented-out English into an Icelandic reader page.** Surfaced while auditing kill R2, whose author had the mechanism backwards. Hard-measured by this review: `fs-id1654019` occurs **once** in `books/edlisfraedi-2e/01-source/ch04/m42075.cnxml`, **inside a `<!-- … -->` span** (verified programmatically, not by eye) — and appears in `books/edlisfraedi-2e/05-publication/mt-preview/chapters/04/4-answer-key.html` as a live `<p id="fs-id1654019">It is helpful in this situation to define the system as the child and the wagon.</p>`, in English, surrounded by Icelandic prose. The renderer scrapes `03-translated` with regex and does not strip comments. Pre-existing (file last written 2026-08-12 by §C56); this branch touches no file under `books/`. **P2, physics-only, no register home.**

5. **§C100** (biology `m66542` cannot round-trip at all) — already has a register entry. No action here.

6. **The remaining Minors** — R5 (mutation-survival gap on the strip set), the `extractNestedElements(example.content,'note')` double computation, and `0be2c77a`'s deliberate non-green-in-isolation. All cosmetic or GENERATED-artifact-only.

### CLOSED — no action

- **Close-out blocker** (`extraction-coverage.js` citing the gitignored workspace) — **fixed**, verified in the tree at `:192`.
- **Task 2's `inlineMedia`-fold overlap re-check** — **discharged**. The ledger warned "Tasks 4-7 ADD the second shape, so re-check this at the final review rather than treating the 0 as permanent." Re-measured over all five books via `extractSegments`: overlap **0 → 18** (all physics), **conflicting 0**. The prediction was right and the outcome is benign — every overlapping id resolves to an identical `segmentId`, so the later fold's overwrite is value-identical, not a disagreement.
- **Segment-level-only guard tests** — closed in Tasks 5/6 fix round 1; structure-level assertions verified present (27 tests in `cnxml-extract-bare-media-alt.test.js`).

---

## What this review could NOT check

- **Write-back pins cover 2 of 5 books** (chemistry, organic). F1 lives in the unpinned population — that is *why* it survived eleven task reviews, and it is the branch's single largest residual blind spot. Biology, microbiology and physics have no committed write-back pin.
- **Biology `m66542` could not be swept at all** (§C100): `assertNoMarkerResidue` throws before the alt check runs, so its **7 alt segments are unmeasured — not confirmed clean**. Biology's "1212/1212" is over 258 of 259 modules.
- **`npm test` is `vitest run` — it does not run Playwright.** The gate evidence here is the local root suite only; the E2E job is separate and was not exercised. Neither was `npm run format:check`, which the Lint job runs in addition to `npm run lint`.
- **The structure-level census is chemistry-only.** I did not walk the other four books' structure trees module-for-module, so a duplicate-structure-entry defect confined to organic/physics/biology/microbiology would not have been seen — and, per this branch's own finding, segment counts cannot see one.
- **I relied on controller-verified ground truth** for the 4883-test / exit-0 run and for `test-results/c88-acceptance-2026-08-18.txt`; I did not re-run either.
- **I did not execute `buildCnxml` myself for F1.** My own measurements are: the regex mechanism (read at `:3700-3705`), the attribute-order discriminator (7/7 across the §C99 shape), the 27-across-12 source census, the confirmation that **all 27 are live structure nodes** so the drop path is genuinely invoked, the byte-identical merge-base attribution, and the zero-MT-exposure correction. The final step — "the exercise is absent from the output and `report.complete === true`" — is two independent refuters' execution, agreeing on module ids and counts, and is consistent with the code path I read at `:3705` / `:2210` / `:2464` / `:4896`. **A controller wanting belt-and-braces should re-run one module (`m42099`) through `buildCnxml` before sizing the fix.**
- **Read-only throughout.** No file, index or ref was modified; `git status --porcelain` is empty at both the start and the end of this review.
