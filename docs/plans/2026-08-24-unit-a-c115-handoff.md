# Handoff — §C88 Unit A + §C115: bring organic's 244 alts in, and fix the `>` truncation

**Written:** 2026-08-23, end of the ruling/sweep session · **For:** the next session, starting cold.
**Status owner is the register's ⏩ RESUME block** (`2026-07-21-post-item17-followup-campaign.md`);
this is a briefing, not a status record. If they disagree, **the register wins**.
**The order comes from the runbook** (`2026-08-23-clean-break-re-mt-runbook.md`) — this is its
step **2.2**.

---

## The job, in one line

**One branch, one PR: two extraction-side fixes that must merge *and deploy* before Phase 3.**
Both are cheap now and cost a second re-extract plus a re-key of organic's seg-ids afterwards.

## Why they belong together

Same file, same neighbourhood, same acceptance shape — and the second was found *by* the first's
sweep. Splitting them buys nothing and pays the review cost twice.

| | what |
|---|---|
| **§C88 Unit A** | organic's **244** `entry-not-in-figure` alts are currently never extracted |
| **§C115** | a raw `>` in an `alt` value truncates `<media[^>]*>`, losing a segment **and** publishing `alt=""` |

## Unit A — the shape of the change

1. **`tools/cnxml-extract.js:1557`** — relax `if (!media.id) continue`.
2. 🔴 **A KEY IS REQUIRED; DELETING THE GUARD IS NOT THE FIX.** That site calls
   `altElementId(media.id, 0)` with a **hardcoded index 0**, so id-less media in one module would
   all collide on a single `media-0-alt`. **The guard was suppressing two failures while
   documenting one.**
3. ⚠️ **Use the content-anchored key (`src`), not a positional one.** Both work against today's
   corpus, but a positional key inherits any future cell-indexing drift and **an alt written to
   the wrong cell is SILENT — no count moves**, which is the §C89 shape this whole thread exists
   to prevent. **Do not copy `applyFigureAltDom`'s "first media" *for the reason it chose it*** —
   a figure has one media by construction; a table cell does not.
4. **`tools/cnxml-inject.js`** — teach `applyMediaAltString` the no-`mediaId` case. `buildTable`
   already holds `cell` at its `applyMediaAltString(entryMatch, ctx)` call inside the
   `rowIdx`/`cellIdx` loop, so the cell's alt can be passed **directly**; `collectMediaAlts`'
   id-keyed table branch need not change.

**Not in Unit A:** the 245th (`m00032`, the `cell.paras` branch) is **deferred by [LEAD] ruling**
to a hand fix — ledger **M1**, runbook 4.5. Do not wire it in; its sibling branch destroys
non-para content and it sits against a fresh §C85 pin.

## §C115 — the shape of the change

A bare `>` is **legal** in an XML attribute value (only `<` and `&` must be escaped), so a
well-formed document can truncate `<tag[^>]*>` mid-attribute. The capture comes back **empty**,
the tool reports success, and an **empty value** is emitted downstream — which reads as "the
source had nothing there".

🔴 **Fix the class, not the line.** The `[^>]*` open-tag idiom is pervasive across
`cnxml-extract.js`, `cnxml-inject.js`, `cnxml-render.js` and `tools/lib/` — **re-derive that
enumeration; do not trust this sentence.** A fix that special-cases `<media>` leaves the class
open, and **the corpus, not the code, is what has limited the damage so far**: a source refresh,
a new book, or a different element type can light up a site that has never fired.
**State the sweep's range in the PR.**

## Acceptance — the part most likely to go wrong

🔴 **A SENTINEL SUBSTITUTION, NEVER A COUNT** (§C89's durable rule). Overwrite each newly-emitted
alt with a token that cannot have come from the source, inject, then count tokens — **with the
1,918 that already work asserted alongside as a built-in positive control**, so a harness that
breaks everything equally cannot read as a pass. For §C115, assert the **value** is the source's
alt text, not that an `alt=` attribute exists — a count cannot see a substitution that did not
happen.

**Pins that move:**
- `tools/__tests__/alt-writeback-corpus.test.js` — organic **1918 → 2162**.
- `tools/__tests__/cnxml-extract-alt-corpus.test.js` — organic counts.
- `tools/__tests__/alt-coverage-corpus.test.js` — chemistry **1148 → 1149** once §C115 lands
  (its `expect(short).toEqual([{ module: 'm68727', reachable: 6, emitted: 5 }])` becomes empty,
  and **that assertion must be re-pointed, not blanked** — see below).
- 🔴 `tools/__tests__/inject-roundtrip-corpus.test.js` — its third assertion
  `expect([...loss, ...gain].every((x) => x.ok === false)).toBe(true)` **passes vacuously on empty
  arrays**. Emptying them silently discards the suite's only `ok === false` assertion on a real
  corpus defect. **Re-point it at something.**

## Read these, not their summaries

1. [`../../test-results/c88-245-feasibility-2026-08-23.md`](../../test-results/c88-245-feasibility-2026-08-23.md)
   — branch split, available keys, multiplicity, the cell-index reliability control. Its probe
   re-runs from any cwd.
2. [`../../test-results/m0-anomaly-sweep-2026-08-23.md`](../../test-results/m0-anomaly-sweep-2026-08-23.md)
   — §C115's mechanism and the corpus-wide census, with the refuted localization hypothesis.
3. The register's **§C115** entry and the ⏩ RESUME Phase 1.2 bullet.
4. **CLAUDE.md § Extract-Inject-Render** — the durable `>`-in-attribute rule.

⚠️ **Re-measure anything you are about to rely on.** Every number above is carried from a prior
session, and this project's own rule is that a relayed finding is re-measured and its *detector*
obtained first.

## Free, and independent — take it whenever

**Runbook Phase 1.3:** `node tools/api-translate.js --book efnafraedi-2e --dry-run` on a **fresh**
chemistry extract. **0 ISK.** Settles the unmeasured-vintage caveat on the 43,078 ISK figure.
Needs no decision from anyone and does not touch this branch.

## State of the world at handoff

- `main` is **local-only ahead of `origin`** by several docs commits — **deliberate**: a docs push
  to `main` from dev strands prod's content backup until the next deploy.
- Phase 0 complete and deployed. Phases 1.1 and 1.2 closed. **Phase 2.1 (clear the locks) is NOT
  done** — 8 markers still on disk (7 chemistry to clear; the 8th is biology, withdrawn).
  ⚠️ The runbook's ✅/⚠️ marks are **provenance**, not completion.
- The ⚒️ post-run manual-fix ledger holds **one** item (M1) after the M0 sweep.
- ⚠️ **No published page has been rebuilt.** The wrong ch28 photograph and `m00032`'s dropped
  image are still live for readers until a re-render plus a **book-scoped** vefur sync naming only
  `efnafraedi-2e` and `lifraen-efnafraedi`.
- **After this PR:** the next thing is **§C82 Plans B and C** — the check battery and the run
  driver, both still unwritten. That is the largest remaining piece before Phase 3, and it wants
  its own session.
