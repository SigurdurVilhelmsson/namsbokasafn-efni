# Handoff — Phase 1.2: re-take §C88's scope ruling

> # 🛑 SUPERSEDED — THE RULING WAS TAKEN 2026-08-23. DO NOT EXECUTE THIS BRIEFING.
> **This document asks you to re-measure and then propose a ruling. Both are done.** A cold
> session following it will repeat a full day's work.
> - **The re-measurement RAN** — all four carried numbers reproduced exactly. Frozen at
>   [`../../test-results/c88-scope-retake-remeasurement-2026-08-23.md`](../../test-results/c88-scope-retake-remeasurement-2026-08-23.md).
> - **The ruling was TAKEN** — ① the 244 come in **before Phase 3** (§C88 Unit A, runbook step
>   **2.2**); ② the remaining 1 (`m00032`) is deferred to a hand fix, ledger item **M1**, runbook
>   **4.5**. Sizing at [`../../test-results/c88-245-feasibility-2026-08-23.md`](../../test-results/c88-245-feasibility-2026-08-23.md).
> - **A new item came out of the follow-up sweep:** **§C115** — a raw `>` in an `alt` value
>   truncating the extractor's `<media[^>]*>` match. It rides Unit A's branch.
>
> ▶ **Read the register's ⏩ RESUME block and the runbook instead.** Retained as evidence of how
> the decision was framed before it was taken — **evidence, never status.**

**Written:** 2026-08-23, end of the Phase 0 session · **For:** the next session, starting cold.
**Status owner is still the register's ⏩ RESUME block** — this file is a briefing, not a status
record. If they disagree, the register wins.

---

## What you are being asked to decide

§C88 ruled organic's **245 `entry-not-in-figure` figure-alt attributes OUT of scope**. The stated
reason was:

> *"213 of them sit in modules §C80 is not buying."*

**That premise is void.** The 2026-08-17 [LEAD] scope-up bought the complete 342-module organic
book, so **all 245 are now bought**. The ruling has to be re-taken on its merits.

⚠️ **The anchor is DESIGN, not spend** — §C88's own spec says so. Do not re-take it as a cost
question; the cost argument is the one that expired.

## The fact the decision actually turns on

🔴 **Organic has ZERO id-bearing `<media>` across 340 media-bearing files.**
Controls, measured the same way: chemistry 137/137 · physics 274/275 · biology 257/257 · micro
154/154.

**Consequence:** §C88's `if (!media.id) continue` rescue is **structurally inert for the entire
`lifraen-efnafraedi` book**. Its alt-writeback keys on a media or figure `@id`, and organic has
none in that position — so there is nothing for the current mechanism to address.

▶ **So the real question is not "in or out of §C88's existing scope".** It is: *does organic's
figure alt get into the pipeline at all, and if so by what key?* Bringing it in needs a genuine
inject-side extension (an id-less bare `<media>` has no key `collectMediaAlts` can address), not a
scope-pin move. That was true when §C88 shipped and is recorded in its Task 10 entry; the
scope-up did not change it.

## Consequence worth stating plainly

**`m00032` going 36 → 36 after the §C85-drop fix is NOT "alt fixed".** The media element survives
now, but its `alt` stays permanently English, because the rescue that would translate it cannot
address an id-less media. The same holds for organic's other 244.

If the decision is "leave it out", **organic ships with English figure alt** — an accessibility
fact, and one worth stating to the [LEAD] in those terms rather than as a scope technicality.

## What to read, in order

1. **The register's §C88 entry** — especially the Task 10 block with the five-book guarded/emitted
   table, and its explicit note that option (a) ("let organic move") *"remains available as its
   own future [LEAD] call"* and was never taken.
2. **`docs/superpowers/specs/2026-08-16-c88-unreachable-figure-alt-design.md`** — §2 carries the
   scope ruling and a banner saying the premise was voided.
3. **`test-results/c85-c90-root-cause-synthesis-2026-08-23.md`** — frozen; its §5 records both the
   zero-id-bearing-media finding and the `buildFigure` verbatim-branch asymmetry (1,831 of 1,911
   organic figures are id-NOT-first, against chemistry's 627/627 id-first).

## Do this before proposing anything

**Re-measure the 245 and the zero.** Both numbers above are carried from a prior session; this
project's own rule is that a relayed finding is re-measured and its *detector* obtained before it
is acted on. Use a DOM parse with an ancestor predicate, not a regex, and print a positive control
in the same command.

## What is NOT in scope for 1.2

- §C93 ④ and the organic source refresh — **descoped 2026-08-23**, closed, do not re-open.
- Phase 0 — complete and deployed.
- §C85/§C90/§C108 — fixed, merged (`6e151fa5`, `3602dea1`) and on production.

## Free measurement that can run alongside

**Phase 1.3** — `node tools/api-translate.js --book efnafraedi-2e --dry-run` on a fresh chemistry
extract. **0 ISK**, and it resolves the unmeasured-vintage caveat on the 43,078 ISK figure. The
runbook says take it before the chemistry leg, not organic's.

## State of the world at handoff

- `main` = `3602dea1`; production matches it exactly (0 ahead / 0 behind), tree clean.
- Phase 0: all four captures taken; corpus and source archive both off-box.
- 8 MT lock markers intact; ledger at `test-results/clean-break-run/locks-before-2026-08-23.txt`.
- The four reviewed faithful files are aside on prod and their deletion is committed, so a routine
  pull reinforces it. Preserved copies at `~/namsbokasafn-faithful-aside-2026-08-23/`.
- ⚠️ **No published page has been rebuilt.** The wrong ch28 photograph and `m00032`'s dropped
  image are still live for readers until a re-render + a book-scoped vefur sync naming only
  `efnafraedi-2e` and `lifraen-efnafraedi`.
