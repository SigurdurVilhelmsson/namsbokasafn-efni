---
name: verify-glossary-export
description: Exhaustively check the unattended glossary export's write gates against the real runGlossaryExport (server/verification/glossary-export/check.js). Use when a change touches server/scripts/export-terminology.js, glossaryExportDecision.js, glossaryProducer.js, the book-layer stamp/hold/release, how the cron invokes the exporter, or anything that decides whether books/<slug>/glossary/glossary-unified.json gets written — before you trust the change.
---

# Verify the glossary export's write gates

## What this protects, in plain words

`scripts/git-backup.sh` runs `server/scripts/export-terminology.js` **bare** every two hours, then commits and pushes
`books/*/glossary/`. `glossary-unified.json` feeds the paid MT **and** the published pages (approved terms are
substituted into math labels), so an unattended write a human did not review reaches readers. The exporter's
defence is a sequence of gates (absent baseline, unreadable file, producer, unchanged/restamp, book-layer hold,
shrink, growth), each overridable only by a flag the cron never passes (`--adopt`, `--force`, `--release-layer`).

Each gate has unit tests, one case at a time. This check runs the **real** `runGlossaryExport` on **every**
combination of a fixed input space and judges each run from the bytes on disk before and after. Nothing is
modelled. Its last two defects, a committed `null` and an empty `--book`, were single points in that kind of space.

The rules (necessary conditions for the committed file to change):

| Rule | In plain words | Harm if broken |
|---|---|---|
| `NoCreate` | No glossary file is created without `--adopt`. | A book's first glossary is published unreviewed (§C21). |
| `NoOverwriteUnreadable` | A committed file that is not a readable glossary object is not replaced without `--adopt`. | We overwrite something nobody could inspect. |
| `NoProducerSwap` | A file another producer wrote, or one no producer can be named for, is not replaced without `--adopt`. | The 2026-08-03 incident: a wholesale producer swap pushed unattended. |
| `LayerSettled` | Changed terms are written only if the book layer did not move during the build and the committed stamp matches it, or `--release-layer` names the exact export. | A human's glossary-layer change ships before anyone tested it. |
| `NoHalving` / `NoExplosion` | Without `--force`, changed terms never halve, or explode, the approved or total count of a readable baseline. | Mass loss, or §C119's unreviewed explosion of organic's glossary. |
| `NoUnreviewedFirstPopulation` | An unattended run never writes terms onto a committed file that holds none. | Same as `NoCreate`, reached through a file that exists but is empty. |
| `RestampOnlyStamp` | If the terms do not change, only `bookLayer` may change, and only to the current layer id. | A "restamp" that silently rewrites content. |
| `WritesWhatWasExported` | When terms change, the file holds exactly the exported terms. | A write that drops or alters terms. |

## Known finding (pinned; the check expects it)

**One hole, two faces.** A committed file **stamped `"producer": "export-terminology-resolved"` but holding no terms**
(`"terms": []`, or no `terms` key) walks past every gate on an unattended run:
- `detectProducer` trusts the stamp before it reads any term, so the producer gate passes;
- the absent-baseline gate keys on a **missing file** only (`readExisting` → `kind: 'absent'`);
- shrink and growth both require a non-zero baseline count.

So the next cron tick writes the full export, unreviewed. This is CLAUDE.md's lesson that *a gate keyed on one
representation of "nothing" can be walked past by another*, in a new spot. `growthVerdict`'s comment says first
population is "the absent-baseline gate's business (§C21)", but that gate cannot see this state.

**Within the checked space, it is reached only after a deliberate flagged run** (measured with the real function):
- **route A:** `--force` accepts a shrink to an empty export, then the next bare run writes 0 → 1000 as `wrote`;
- **route B:** `--adopt` accepts an empty first export, then the next bare run writes 0 → 1000 as `wrote`.

Controls: a bare run refuses 1000 → 0 (`refused-shrink`) and 1 → 1000 (`refused-growth`). The cliff is exactly zero
terms against one. Route A has the shape of the organic "trim rebound" that `growthVerdict`'s comment records.
Not present in the dev tree on 2026-11-23 (every committed glossary is stamped and non-empty); production not read.
Logged in the active register as §C249.

The pins are **narrow**: a rule may fail only on the variants named in `KNOWN_FINDINGS` in `check.js`. A failure on
any other variant prints `BROKEN`, and a pinned variant that stops failing is also an error, so a fix forces the pin
to be removed. Closing it, for example by having the bare run treat a baseline with no terms like an absent one, is a
product change for [USER] to rule on. Do not make it to turn this check green.

## Does your change touch the verified code?

Run this; any output means yes. It compares the sync commit with your **working tree**, so uncommitted edits count:

```sh
git diff --stat 9dca06c91 -- server/scripts/export-terminology.js server/lib/glossaryExportDecision.js \
  server/lib/glossaryProducer.js tools/lib/glossary-terms-hash.cjs scripts/git-backup.sh
```

Also yes, whatever the diff says, if your change adds a **new writer of `glossary-unified.json`**, a new flag that
stands a gate down, or makes the cron pass any flag. The check knows only `runGlossaryExport`.

## Run the check

From the repo root, with the server dependencies installed (`server/node_modules`). No database, no network; it works
in a temp directory. **It takes about 3 minutes and prints its verdict only at the end, so give the command a
10-minute timeout or run it in the background.** The default 2-minute tool timeout kills it with no verdict. Progress
goes to stderr, one line per committed-file variant.

```sh
node server/verification/glossary-export/check.js
```

A clean run ends `OK: rules hold, known findings pinned, positive control writes` and exits 0. Each rule line prints
how many file-changing runs met its precondition. That count only shows the rule was *reached*: a rule reached 0
times prints `NOT EXERCISED` and fails. It does not show the rule can *fail*; `mutate.js` shows that (below). The
**positive control** (a healthy bare refresh of a 1000-term file must write) stops a harness that refuses everything
from passing.

To prove the check can still fail (after editing it, or before trusting a new rule), run the mutation driver in the
background; about 3 minutes per mutant:

```sh
node server/verification/glossary-export/mutate.js
```

It applies each mutant in its `MUTANTS` list to the real code and expects the named rule to print `BROKEN`. It
restores every target from a golden copy and compares the bytes; `targets restored byte for byte: yes` and exit 0
mean every mutant was caught. If it dies part-way, run `git status --porcelain` at once: a dead round can leave a
mutant in the tree.

## Reading a failure: real bug or harness error?

- **`X: BROKEN` with a "First example"**: a real exporter call changed the committed file in a way rule X forbids.
  The example names the committed-file variant (see `baselines()` in `check.js`), which run (1, or the bare run 2 that
  follows a write), the flags, the layer ids read before and after the build, and the export's size. Reproduce it by
  hand with `runGlossaryExport` and a temp `booksDir`, using the same injected functions as `check.js`'s driver. If
  the bytes change, **it is a bug: report it in those terms and do not weaken the rule.** If they do not, the harness
  is wrong (usually a variant's ground-truth `truth` label); fix the label and say so.
- **`pinned but no longer failing on: …`**: the known finding closed for that variant, which is good if your change
  meant to close it, or the variant generator drifted. If the exporter now refuses, delete the pin, move this SKILL's
  finding into history, and tell the user.
- **`NOT EXERCISED`**: the exporter stopped writing in every case that rule covers, probably because a gate now
  refuses everything. Check the positive control and the outcome strings.
- **A crash or a hang**: the exporter threw past its own per-book catch, or a test double no longer matches its
  signature (for example, `layerChangeIdFn` is called twice per book, before and after `exportFn`).

## When your change is intended: update the check

1. **A new gate or flag:** add a rule to `RULES` and to `judge()`, written as an observable condition on the bytes. Do
   not call the gate's own function in the oracle; give each variant its ground truth in the generator. Add a flag
   set to `FLAGS` if the new flag stands a gate down.
2. **A new committed-file shape or producer:** add a variant to `baselines()` with its `truth`. Add every new
   representation of "nothing" you can think of.
3. **A changed threshold** in `glossaryExportDecision.js`: the oracle imports the constants, so it follows on its own.
   Check that `nexts()` counts still straddle each new boundary for baselines of 1, 200 and 1000.
4. **Show the new rule failing on a broken variant of the code:** add an entry to `MUTANTS` in `mutate.js` (an exact
   text that occurs once, its replacement, the rule expected to break) and run it. Never restore a target by hand with
   `git checkout --` or `git stash` (CLAUDE.md § mutation tests); `mutate.js` restores from golden copies.
5. Move the sync commit (above and below) forward **only after confirming, function by function, that the check
   still drives the code paths in the coverage record at the new commit.**

## Scope: what a pass covers, and what it does not

- **Input space** (every combination within it; the run prints the sizes):
  - committed files (`baselines()`): every representation of "nothing" we listed, and resolved-, merge-, old-export-
    and hybrid-shaped files of 1, 200 and 1000 terms, all or none approved, with layer stamps none, 3 or 5;
  - exports (`nexts()`): sizes straddling each threshold for those baselines, all, none or half approved;
  - layer ids before and after the build: all pairs from `{no history, 3, 5}`;
  - flags (`FLAGS`): bare (cron), `--force`, `--adopt`, both, `--release-layer` with the right hash, and with a
    wrong one;
  - after any write, a second bare run on a fresh 1000-term export.
- **Exporter assumed to be the real producer:** every export is stamped `export-terminology-resolved`, as
  `server/lib/resolvedGlossary.js` always does. A bug inside the resolver (wrong terms) is out of scope.
- **Left out:**
  - one book per run (no cross-book effects);
  - `subjectFn`, the census and unscoped refusals, and the `recordFn` book-glossary record;
  - the status file, `since` carry-forward and `/api/health` reading of outcomes;
  - the held-file contents beyond "the committed file did not change";
  - `--dry-run`;
  - I/O failures (they are caught per book and fail closed by code review, not by this check);
  - the CLI's `parseArgs`. That `git-backup.sh` passes no flags is part of the coverage record, not checked.
- **Thresholds are taken as given:** the oracle imports the thresholds `SHRINK_RATIO`, `GROWTH_RATIO` and
  `GROWTH_MIN_DELTA`, so a wrong threshold is invisible here. Their tests in `glossaryExportDecision.test.js` own that.
- **By design, not findings:**
  - growth below the threshold compounds across ticks ("catastrophe, not drift");
  - a resolved stamp is trusted over a contradictory term shape, a trade-off pinned in `glossaryProducer.test.js`.
  The known finding above is the case where that trust meets an empty file.
- **Mutants it catches:** the `MUTANTS` list in `mutate.js` is the record. It covers every gate in
  `export-terminology.js`, one mutant in `glossaryExportDecision.js` and one in `glossaryProducer.js`.

## Coverage record

**Sync commit: `9dca06c91`.** The check was last confirmed to drive the code below at this commit.

| Rule(s) | Code (open it to check) |
|---|---|
| all: the one entry point | `server/scripts/export-terminology.js` `runGlossaryExport` (per-book loop), `serializePayload`, `writeFileAtomic` |
| `NoCreate`, `NoOverwriteUnreadable`, `NoUnreviewedFirstPopulation` | `readExisting`; the `existing.kind === 'corrupt'` and `=== 'absent'` refusals in `runGlossaryExport` |
| `NoProducerSwap` | `server/lib/glossaryExportDecision.js` `producerVerdict`; `server/lib/glossaryProducer.js` `detectProducer` |
| `RestampOnlyStamp` | `sameTerms` + the restamp branch (`restampable`, `STAMP_KEY`) |
| `LayerSettled` | `layerChangeIdFn` read before and after `exportFn`, `changedDuringBuild`, `layerMoved`, `released`; `tools/lib/glossary-terms-hash.cjs` `termsSha256` |
| `NoHalving`, `NoExplosion` | `shrinkVerdict`, `growthVerdict` and their call sites |
| unattended = no flags | `scripts/git-backup.sh`, the bare `node …/export-terminology.js` call |

Files: `server/verification/glossary-export/check.js` (the check, one command) and `mutate.js` (proves it can fail).
