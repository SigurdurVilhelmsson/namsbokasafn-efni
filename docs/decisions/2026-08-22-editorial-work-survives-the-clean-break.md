# Decision: the §C82 clean break overwrites chemistry's MT outright; the existing editorial work on ch01–ch03 is preserved in three independent places and is re-applied by hand in the editor afterwards

- **Date:** 2026-08-22
- **Status:** Accepted
- **Context owners:** lead (project owner); verification by the pipeline session
- **Supersedes:** none
- **Related:**
  - `docs/plans/2026-07-21-post-item17-followup-campaign.md` — §C79 (MT-lock disposition), §C80 (re-MT
    scope), §C82 (the loop), §C109 (retirement)
  - `docs/decisions/2026-08-22-two-book-focus-and-publication-withdrawal.md`
  - `docs/decisions/2026-07-06-re-mt-vs-editor-fixes-and-openstax-remerge.md`
  - `test-results/c79-locked-module-edits-harvest-2026-08-12.json`

> **FROZEN EVIDENCE — banner-dated 2026-08-22.** This record is *evidence*, never status.
> It describes what was decided on that date and why. **If it disagrees with the active
> register in `docs/plans/`, the register wins** — this file is dated, the register is live.
> Do not sync it, do not update it, do not edit it. Supersede it instead.

## Question

The §C82 run re-machine-translates chemistry in full, deliberately overwriting `02-mt-output` to get a
clean break from the old pipeline dialect. Chemistry is the only book with any editorial work at all, and
that work sits in chapters 1–3. **Does the clean break destroy it, and does that block the run?**

This question has been raised and answered more than once in conversation and had never been written down,
so each session re-derived it from scratch and reached the same place by a different route. That is the
reason this record exists: **the answer is stable, the re-derivation is not free, and an unrecorded answer
gets re-litigated.**

## Decision

**Proceed with the clean break. Overwrite `02-mt-output` for all of chemistry, chapters 1–3 included.**
The editorial work is preserved in three independent places (below), and the [LEAD] re-applies it **by
hand in the segment editor** after the fresh MT lands.

**Segment-id renumbering is explicitly accepted and is not a blocker**, because re-application is manual:
a human matches edits by *content*, not by seg-id. No id-stability guarantee is required from the
re-extract, and none should be relied upon.

## Reasoning

### The editorial work has three independent copies, and they overlap by chapter

Verified against the tree on 2026-08-22:

| Chapter | External `.docx` (track changes) | `03-faithful-translation/` | `c79` DB harvest |
|---|---|---|---|
| **ch01** | yes — [LEAD], off-repo | `m68663`, `m68664` | 3 chemistry modules / 6 edits, all ch01 |
| **ch02** | yes — [LEAD], off-repo | **none** (0 files) | none |
| **ch03** | no | `m68699`, `m68700` | none |

Two things follow, and they are the whole safety argument:

- **ch01 and ch02 are covered by the docx.** ch02 having **zero** faithful files is consistent with, and
  corroborates, the [LEAD]'s statement that its edits live only in the docx. ch01 is triple-covered.
- **ch03 is covered by `03-faithful-translation/`, and that is its only copy.** There is no ch03 docx. Those
  two files are therefore the artifact the whole decision rests on — see the *Consequences*.

⚠️ **Stated as a dependency, not a verified fact:** the `.docx` files are outside both repositories, on the
[LEAD]'s own machines. Their existence and contents are **taken on the [LEAD]'s word and cannot be checked
from here.** Everything else in this record is measured.

### A re-MT structurally cannot touch the faithful tree — this is the load-bearing measurement

`tools/api-translate.js` contains **zero** references to `03-faithful` (positive control in the same
measurement: it does reference `02-mt-output` and `02-for-mt`). `tools/cnxml-extract.js` is likewise zero.
The **only** production writer to that tree is the editor's own save path,
`saveModuleSegments` in `server/services/segmentParser.js`, which additionally takes a timestamped `.bak`
copy before every overwrite.

So overwriting the MT is not a partial or hedged safety claim: **the tools that perform the clean break have
no code path that reaches the editorial asset.**

### The four faithful files are committed, so "safe" means safe off this machine

`git ls-files` returns all four plus the tree's `README.md`, and `git check-ignore` returns nothing for them.
They are on the remote and in every clone. This distinguishes them sharply from the source media the
retirement decision worries about (biology's 2,455 images are on one disk and in no history).

### Manual re-application is what makes renumbering a non-issue

The faithful files are per-segment Icelandic prose in Markdown. A human re-applying an edit reads the
preserved text and finds the corresponding new segment by meaning. The seg-id renumbering that a re-extract
causes breaks *mechanical* remapping only. **Choosing manual re-application is what converts an open
technical risk into a closed one**, and it is why no id-stability investigation is needed before the run.

The volume supports this: `m68699` carries 2 changed segments and `m68700` carries 15 of 273. Chapter 1's
faithful modules carry 2 and 44. This is hours of careful work, not weeks.

### 🔴 The one thing that would have silently defeated the plan

`server/services/segmentParser.js:111-118` selects the editor's baseline:

```js
// Load IS translation (from faithful if exists, else mt-output)
if (fs.existsSync(paths.faithful)) { … isSource = 'faithful'; }
else if (fs.existsSync(paths.mtOutput)) { … }
```

**Faithful wins whenever it exists.** So after a clean re-MT, opening `m68663`, `m68664`, `m68699` or
`m68700` in the editor would present the **old faithful text**, not the fresh MT — and the clean break would
silently fail on exactly the four modules that carry the editorial work, while succeeding everywhere else.

▶ **Therefore the four faithful files must be moved aside before those modules are opened**, so the editor
falls back to the fresh MT and the preserved copy becomes the reference to re-apply *from*. This is an
operational step with an ordering requirement, not a code change.

## Consequences

- **Commits the project to overwriting chemistry's MT without preserving seg-id continuity**, and to paying
  for that in manual re-application rather than in tooling.
- **Makes `books/efnafraedi-2e/03-faithful-translation/ch03/` load-bearing.** It is the only copy of ch03's
  edits. It must not be deleted, reinitialised, or "cleaned up" as part of the clean break.
  ⚠️ `tools/archived/init-faithful-review.js` is exactly such a writer. It is archived and outside the
  pipeline; **do not run it against chemistry.**
- **Requires the four faithful files to be moved aside before re-editing** (see above), and preserved
  somewhere durable while they are aside.
- **Forecloses nothing.** The `.bak` mechanism, git history and the committed harvest all remain; if the
  re-apply goes wrong the prior state is recoverable.
- **Settles §C79's disposition for chemistry**: the locks clear, the modules are re-MT'd, and the edits come
  back by hand. The harvest already captured the DB-only edits, so nothing depends on production's
  `sessions.db` surviving.
- **Removes the faithful-track vintage question as a blocker.** Because ch01/ch03 are re-MT'd and re-edited
  like every other module, they do not become a stale overlay sitting on a fresh baseline.

## Alternatives considered

1. **Preserve seg-id continuity through the re-extract so edits can be remapped mechanically.** Rejected as
   unnecessary given manual re-application, and it is not free: §C88 adds alt segments, which is precisely
   the id-shifting operation the register measured at 1,404 of 1,484 ids moving on `m68865`. Buying a
   guarantee nobody needs would gate the run on an investigation.
2. **Keep the existing faithful renders as a published overlay and re-MT around them.** Rejected: the
   overlay is path-based with no vintage comparison, so stale reviewed-looking pages would outrank fresh
   ones indefinitely.
3. **Retire the faithful track along with the three retired books.** Rejected: it is the only human-reviewed
   asset in the project, and the two-book ruling makes chemistry the flagship. Regenerating is cheap;
   discarding is not reversible in effort terms.
4. **Skip ch01–ch03 in the re-MT to protect the edits.** Rejected: it reintroduces two vintages inside one
   book — the exact condition the clean break exists to end — and it would leave the three most-read
   chapters on the old dialect.
