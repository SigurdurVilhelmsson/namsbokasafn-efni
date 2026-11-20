# The book glossary layer, stage 2, PR 3 (the head editor's page and the worklist): the build rulings

> 🧊 FROZEN 2026-11-20 — the rulings the build of stage 2's third pull request made on [USER]'s behalf (evidence, never status; the register owns status)

PR 3 of stage 2 was built task by task from the plan, with a review after each task, a whole-branch review at the
end and one fix wave after it. Where the plan or the design left a choice open, a premise proved wrong, or a review
asked for a change, the build decided it and wrote the decision down. The rulings below restate those decisions in
plain words; the build's own working notes, where they were first written, are git-ignored and deleted when the build
ends. Each ruling is evidence of what was decided; whether the work it governs is done, open or deferred is the
register's to say ([`2026-07-21-post-item17-followup-campaign.md`](../../plans/2026-07-21-post-item17-followup-campaign.md),
the 2026-11-20 stage 2 entry and §C244).

- The design: [`2026-11-20-book-glossary-stage2-design.md`](2026-11-20-book-glossary-stage2-design.md).
- The plan: [`../plans/2026-11-20-book-glossary-stage2-pr3-page-worklist.md`](../plans/2026-11-20-book-glossary-stage2-pr3-page-worklist.md).
  Its plan rulings **Q1–Q13** were confirmed by [USER] on 2026-11-20 as written and are not restated here.
- **These R-numbers are PR 3's own.** PR 1's and PR 2's build-rulings files have their own R-numbers, and the code's
  `§C243 R8` comments cite PR 2's R8 (a same-key respelling is a no-op), not this file.

## Rulings that shape behaviour

- **R1.** The page loads the same shell scripts as the assignments page (`htmlUtils.js`, `ui-strings.js`, `theme.js`,
  `layout.js`, `bookSelector.js`, `chapter-label.js`), then `book-glossary-view.js` and `book-glossary.js`. The plan
  said "the scripts the localization view loads", which would also have loaded three editor-only scripts
  (`saveRetry.js`, `tabGuard.js`, `segment-validation.js`). *Cost if wrong:* a missing global, which the page's own
  E2E would show.
- **R2.** The page requests a book's layer only for a book in the user's held list, so no expected request answers
  4xx. The a4-coverage E2E fails on any console error, and Chrome logs a failed request as one. *Cost if wrong:* an a4
  red that names the request.
- **R4.** `ui-strings.test.js`, which checks that every `UI` key a page script reads exists, now also checks
  `book-glossary.js`. The page reads its strings through an alias (`const T = UI.bookGlossary`), so the test was
  taught to resolve it; a deliberately misspelt key fails it. *Cost if wrong:* none.
- **R5.** No E2E wait or "absent/hidden" assertion after an in-place reload depends on the page's `data-loaded-book`
  signal, which is set only on a fresh load. The tests wait on a positive, id-keyed element instead. *Cost if wrong:*
  a test that passes without proving anything.
- **R6.** `book-glossary.js` stays one file (about 990 lines). The plan names one page script, the localization page
  is about 2,565 lines, and splitting it would have added churn and a review round with no change in behaviour. The
  implementer's proposed split (the dialog and the write actions, about 330 lines, into `book-glossary-actions.js`)
  is recorded for later. *Cost if wrong:* one later split.
- **R7.** Task 6's review found that a write's answer was applied to whichever dialog was open when it arrived. A
  related finding, a stale confirm button left beside a later preference refusal, was graded Minor; it was re-graded
  Important and fixed in the same round, because design §5.3 says a preference refusal "offers no way past it".
  *Cost if wrong:* a few lines.
- **R8.** That fix round also added a negative control (the house-style confirm button is hidden before the first
  save) and two pins (a preference refusal shows no confirm button; an `unchanged` answer to a forms change shows the
  capitalisation hint). *Cost if wrong:* test lines.
- **R9.** The real E2E round trip adds an entry, so on a dev box that holds the licensed BÍN file
  (`tools/data/SHsnid.csv`) the E2E server runs one real background lookup. That is accepted: the constraint is that
  test code never reads the file and no BÍN bytes enter the repository (§C41). No test reads it, the lookup writes
  only to the throwaway E2E database, and CI has no file. *Cost if wrong:* one real lookup per local E2E run on such
  a box.
- **R10.** The single fix wave after the whole-branch review took its Important finding (history rows did not show
  what changed) and the five Minors that review itself marked as before-merge: log a per-unit scan error once per
  request; Icelandic singular agreement at 1; re-read the layer while an entry's lookup is pending; the static HTML-sink
  test allows only `innerHTML = '';`; the worklist link check refuses whitespace and control characters. *Cost if
  wrong:* a larger fix diff.
- **R11.** A history row shows Icelandic only where it already holds it: an added entry's word, a change's old and new
  word (and its forms when they differ), a removed entry's word. Exclusion rows hold no Icelandic by design (S1 §5.4:
  the committed record leaves out an excluded row's Icelandic), and the server was not changed to add it. History
  shows no inflection lists. *Cost if wrong:* exclusion rows stay terser than entry rows.
- **R12.** The fix wave's own re-review found one regression in the new polling: a retry whose result comes back
  unchanged within 2 seconds leaves the retry button disabled and the status line saying the search has started,
  until the page is reloaded. The process allows one fix wave, so it was not fixed in the build. It was handed to
  [USER] with its fix (about two lines). *Cost if wrong:* the regression ships unless it is fixed before merge.

## Rulings about how the build was run

- **R3.** Models: the first four tasks' implementers and reviewers ran on the mid tier, the two page tasks and their
  reviews on the most capable general model, and the whole-branch review on Fable, under [USER]'s standing grant for
  review (2026-11-02).
- **R13.** Each task was committed on the local build branch, staging named files only. Both dependency trees were
  symlinked into the worktree. Nothing was pushed during the build.
- **R14.** No agent ran the whole test suite. Agents ran their task's files; the controller re-ran each task's
  covering files, appended the verbatim result to the task's report, and ran the full suite itself.
- **R15.** Every fix round went to a fresh implementer, not a resumed one.
- **R16.** Agents were forbidden `git stash` after Task 3's implementer used it to show a failing test (the stash
  stack is shared by every worktree; it was confirmed empty afterwards). Mutation checks restored from a golden copy
  and confirmed it with `cmp`.
- **R17.** Committed files cite the design, the plan's Q-rulings or register items, never the build's working notes.
  A grep of the branch diff for ledger citations found none.

R3 and R13–R17 carry no behaviour; they are recorded so the build can be reconstructed. (R3 sits out of order
because it was decided before the first task, with R1 and R2.)

## Recorded late (appended 2026-11-20, before the PR merged)

- **R18.** Task 2's review graded as Minor that a replacement over two concepts sharing one Icelandic word kept only
  the first concept's inflections. It was re-graded Important and fixed in a fix round (`3bd388b9b`), because the
  worklist exists to find inflected forms (design §4) and a silent miss is exactly that failure. *Cost if wrong:* one
  extra round. This ruling was missed when the file was first written; it is appended rather than inserted, as for
  any frozen record.
