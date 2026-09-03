# Decision: a chapter that is already validated publishes at its readiness, not at its place in the release queue — so ch03 goes ahead of ch15

- **Date:** 2026-09-02
- **Status:** Accepted
- **Context owners:** lead (project owner); measurement by the pipeline session
- **Supersedes:** none — it **amends the ordering stated by §C82 action ⑤** in the active register, which is a register item rather than a decision record. `2026-08-30-c82-clean-break-refocus.md` cites "the lead's own release order" without setting it, and is not reversed here.
- **Related:**
  - `docs/plans/2026-07-21-post-item17-followup-campaign.md` — §C82 action ⑤ (the release order), §C118 (the QC campaign that produced the validated chapters)
  - `docs/decisions/2026-08-30-c82-clean-break-refocus.md` — chapters ship one at a time, which is what makes a per-chapter position meaningful at all
  - `docs/decisions/2026-08-22-two-book-focus-and-publication-withdrawal.md` — only two books may be published; unchanged by this

> **FROZEN EVIDENCE — banner-dated 2026-09-02.** This record is *evidence*, never status.
> It describes what was decided on that date and why. **If it disagrees with the active
> register in `docs/plans/`, the register wins** — this file is dated, the register is live.
> Do not sync it, do not update it, do not edit it. Supersede it instead.

## Question

§C82 action ⑤ sets a release order: **chemistry 15, 14, 16, 17, 19, then 1 onward.** Separately,
chemistry ch03 and organic ch03 were chosen as **pipeline test chapters** — selected by structural
density and by carrying known defects, so that the machinery could be validated end to end before a
production run. They were not chosen for their place in the curriculum.

Those two facts collided the moment the test succeeded. A test chapter that passes is, incidentally,
a **finished and independently checked chapter** — which the release order says should not be
published for some time yet.

**At stake:** whether validated work waits. The alternative to deciding is worse than either answer,
because an undecided ordering means the question gets settled implicitly by whoever next runs a sync
— and the register had been carrying it explicitly as *"a decision nobody has made"* to prevent
exactly that.

## Decision

**Readiness governs, not queue position.** A chapter that has been translated and validated may be
published as soon as its own blockers clear, ahead of chapters that sit earlier in the release order.
Concretely: **ch03 skips the line ahead of ch15** in both kept books.

The release order stands unchanged for everything that has *not* been validated. It orders the
**queue of unvalidated work**; it does not hold back work that has left that queue.

## Reasoning

### The order was always a priority list, never a contiguity requirement

`15, 14, 16, 17, 19, then 1 onward` is already non-contiguous and already starts in the middle of the
book. Publishing ch03 before ch01 therefore introduces **no new property** — a reader arriving at the
site has never been promised a contiguous run of chapters, and the very first chapter the order names
is chapter 15. The objection that would have carried weight — *"a reader should not land on chapter 3
of a book with no chapters 1 and 2"* — applies with equal force to the order as it already stood, and
was accepted there.

### Making validated work wait costs something and buys nothing

The cost of waiting is paid twice. Once by readers, who do not get finished material. And once by the
project, because a chapter validated now and published in several months must be **re-checked against
whatever the pipeline has become in the meantime** — the §C118 campaign exists precisely because
stored output stops being trustworthy as the pipeline moves underneath it. Holding a validated chapter
converts it back into unvalidated work.

There is no corresponding benefit. Nothing in the release order depends on ch15 being *first*; it
depends on ch15 being *early*, which it remains.

### The test chapters were chosen for reasons that make them good publications too

Both were selected by measurement rather than preference: chemistry ch03 for exercising the most
recently changed machinery, organic ch03 for being the only organic chapter that could be rebuilt and
for carrying known defects the checks needed to catch. **A chapter dense enough to stress the pipeline
is dense enough to be worth reading** — the selection criteria and publication value point the same
way, which is not something to discard.

### What was checked, and what was not

Checked against the tree: the release order appears in the register and is *cited* — not set — by
`2026-08-30-c82-clean-break-refocus.md`, so no other decision record is contradicted. Also checked:
the two-book publication restriction is orthogonal and untouched; both ch03 chapters are inside it.

**Not checked, and deliberately out of scope:** whether ch03 is *pedagogically* a good entry point for
a reader arriving cold. That is an editorial question for a person who teaches the subject, not a
pipeline question, and this decision does not pretend to answer it.

## Consequences

- **Commits the project to:** publishing ch03 in both kept books once each chapter's own blockers
  clear, without waiting for ch15. The remaining blocker for organic ch03 is tracked in the active
  register (§C118 ⑯) — **this record does not restate its status.**
- **Generalises beyond ch03.** The rule is *readiness governs*, not *ch03 is special*. Any future
  chapter validated out of order inherits this, which is the point — a ruling that named only ch03
  would have to be re-made the next time the same thing happened.
- **Forecloses** the argument that publication must follow the stated sequence. Reversing it would
  cost little mechanically (the order is prose, not code) but would require re-validating any chapter
  held back in the meantime, which is the cost this decision exists to avoid.
- **Does not change** the two-book restriction, the manual sync path, or the requirement that a sync
  names its books — a bare sync still publishes everything, and that hazard is unaffected.
- **Creates one follow-up:** the register's §C82 action ⑤ carries the old ordering and must cite this
  record so a reader of ⑤ is not misled. Tracked there, not here.

## Alternatives considered

1. **Hold ch03 until its turn, preserving the stated order.** Rejected: it converts validated work
   back into unvalidated work, because the pipeline keeps moving and stored output stops being
   trustworthy — the exact failure §C118 was convened to address. It pays a real cost for a
   consistency that the order does not actually have, since the order is already non-contiguous.
2. **Publish ch03 and formally re-order the whole queue around it.** Rejected as over-reach. The
   release order encodes editorial priority that this decision has no basis to revise; only the
   *position of already-validated work* is in question here. Re-ordering unvalidated chapters would
   be a separate editorial decision made on editorial grounds.
3. **Treat the test chapters as throwaway and never publish them.** Rejected: they are ordinary
   translated chapters that happened to be validated first. Discarding checked, paid-for work to
   preserve a queue would be the most expensive option on the list.
