# Decision: the pipeline prepares each chapter for publication; when it reaches readers is [USER]'s sync, timed with the books' users

- **Date:** 2026-09-16
- **Status:** Accepted
- **Context owners:** [USER] (project owner and lead); measurement by the pipeline session
- **Supersedes:** `docs/decisions/2026-09-02-validated-chapters-skip-the-release-queue.md` **in part** — its
  commitment that a validated chapter *is published* once its own blockers clear. Its other finding, that
  the release order is a priority list and imposes no contiguity, is not reversed.
- **Related:**
  - `docs/plans/2026-09-05-per-chapter-loop.md` — Step 5 (publish), which this changes
  - `docs/plans/2026-07-21-post-item17-followup-campaign.md` — §C140 ㉖ (the figure-publication hold),
    and §C142, the follow-up this record creates
  - `docs/decisions/2026-08-22-two-book-focus-and-publication-withdrawal.md` — which books may be
    published at all; unchanged by this
  - `docs/decisions/2026-08-30-c82-clean-break-refocus.md` — chapters are re-translated one at a time

> **FROZEN EVIDENCE — banner-dated 2026-09-16.** This record is *evidence*, never status.
> It describes what was decided on that date and why. **If it disagrees with the active
> register in `docs/plans/`, the register wins** — this file is dated, the register is live.
> Do not sync it, do not update it, do not edit it. Supersede it instead.

## Question

When a chapter's text and figures have been machine-translated and checked, **when does it reach
readers, and who decides?**

At stake: both kept books are **in classroom use**. The re-translation replaces the wording of a chapter
pupils may be reading this week, so the moment a chapter changes is an event for the teachers and classes
using it, not only a pipeline step. The question had been open in two places at once: the per-chapter
loop's Step 5 syncs each chapter to the website as it finishes, and register §C140 ㉖ asked how to hold
the recomposed ch03/ch04 figures back until a publication call.

## Decision

**The pipeline prepares each chapter for publication once its text and figure MT are done. Publishing is
a manual sync, and when to run it is [USER]'s decision on prod** — made in coordination with the books'
users. It may be one chapter at a time, a batch, or a selection: a chapter in use this semester can be
held back while a chapter not in use is published.

"Prepared" means everything the loop's Step 5 does *before* the sync. The sync is not a pipeline step.

## Reasoning

### The timing depends on classroom use, which the pipeline cannot see

[USER]'s grounds, in their words: *"the books are in use"* and publication must be coordinated with the
users, so *"it may be after each chapter, it may be after a specific batch, I may hold back chapters that
are currently in use and publish chapters that are not in use this semester."* Nothing in the repository
knows which chapter a class is reading, so no rule keyed on pipeline state (a chapter being ready, or a
book being finished) can make this decision correctly. It stays with a person.

### A publication hold in code on the editor's click is not needed for this

§C140 ㉖ found that an editor's *Vista + Birta* copies every recomposed figure a chapter references into
`05-publication/`, which the backup cron pushes. That writes to this repository only; readers see it only
when a sync runs, and under this decision every sync is a deliberate act by [USER]. So the click is part of
*preparing*, not *publishing*.

### Measured: the sync publishes whole books, never single chapters

Checked against the sister repo at `namsbokasafn-vefur` `45f1299` (read-only):

- `scripts/sync-content.js` takes **book slugs** as its only positional arguments and has **no chapter
  option** (its options are `--dry-run`, `--validate`, `--source`, `--allow-withheld`, `--help`).
- Its baseline step mirrors the book's **whole** `05-publication/mt-preview/` track (or `faithful/`, when
  there is no `mt-preview/`) into the site with `rsync -av --delete --delete-excluded`, then overlays
  reviewed `faithful/` pages on top without deleting. So every chapter present in the book's
  `05-publication/` at sync time is published, and a chapter absent from the baseline is removed.
- `scripts/generate-toc.js` reads this repo's `chapters/chNN/status.json` only for **chapter and section titles**, and
  includes every two-digit chapter folder except `00` and `99` (its page filter drops only duplicates a
  reviewed rename superseded); the
  `publication` status stage in this repo is progress reporting and is not read by the sync.

**So the selective release this decision describes cannot yet be carried out**: once two chapters of a book
are both rendered into `05-publication/`, a sync publishes both. That is the follow-up below, not a reason
to decide differently.

### What was checked, and what was not

Checked: the sync's arguments and its baseline `rsync` (the file above); where `generate-toc.js` reads
chapter metadata; that no chapter-level visibility list exists in vefur's `scripts/lib/`. **Not checked:**
vefur's build or deploy steps, and whether the website itself could hide a chapter at render time. The
exact mechanism for selective release is a design question and is deliberately not answered here.

## Consequences

- **Commits the project to:** running each chapter through text MT, figure MT, inject, render,
  `generate-index`, and handing any renamed-page redirect rows to vefur, then **stopping**. No session syncs
  a book to readers; [USER] does, on prod.
- **Replaces** the 2026-09-02 commitment to publish a validated chapter once its blockers clear. Readiness
  now governs *preparation*; classroom use governs *publication*.
- **Accepts a cost that the 2026-09-02 record identified:** a prepared chapter that waits ages against a
  pipeline that keeps changing. The free source-anchored checks (`tools/source-roundtrip-check.js`,
  `tools/render-oracle-check.js`) are the cheap way to re-validate a held chapter just before its sync;
  whether they become a mandatory pre-sync step is tracked in the register, not here.
- **Creates one follow-up — per-chapter release control — tracked in the register as §C142.** Until it
  exists, holding back one chapter while releasing another in the same book is not possible once both are in
  `05-publication/`. A sync `--dry-run` previews the `mt-preview` mirror's changes (it skips the `faithful/` overlay).
- **Resolves** §C140 ㉖ by the reasoning above; the per-chapter gap it exposed moves to §C142.
- **Does not change:** [USER]'s 2026-09-06 ruling that nothing replaces published pages until the new
  output is demonstrated to be an improvement (recorded in the loop plan's milestones) — still a condition on publishing
  a chapter; which books may be published (the vefur allowlist); that a sync names its book;
  and that redirect rows reach vefur before the sync that retires a page.
- **Reversal cost:** low. The rule is prose, not code.

## Alternatives considered

1. **Publish each chapter as soon as it is validated** (the 2026-09-02 commitment and the loop's Step 5 as
   written). Rejected: it changes a chapter under a class that may be mid-way through it, with no
   coordination with the teachers using the book.
2. **Publish each book once its whole re-translation run is complete.** [USER] ruled this earlier the same
   day and withdrew it in the same conversation. Rejected: it fixes the timing to pipeline progress rather than to
   classroom use, and it withholds finished chapters that no class is using this semester.
3. **Build a gate on the editor's *Vista + Birta* click** (§C140 ㉖'s second option). Not chosen: the click
   only writes to this repository, and publication happens at a deliberate sync. The real gap, choosing
   chapters within a book, is not at the click, so a click gate would not close it.
