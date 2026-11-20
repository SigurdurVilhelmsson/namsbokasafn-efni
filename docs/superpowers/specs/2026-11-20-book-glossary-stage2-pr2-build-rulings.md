# The book glossary layer, stage 2, PR 2 (the write API and the routes): the build rulings

> 🧊 FROZEN 2026-11-20 — the rulings the build of stage 2's second pull request made on [USER]'s behalf (evidence, never status; the register owns status)

PR 2 of stage 2 was built task by task from the plan, with a review after each task and a whole-branch review at
the end. Where the plan or the design left a choice open, a premise proved wrong, or a review asked for a
change, the build decided it and wrote the decision down. The rulings below restate those decisions in plain
words; the build's own working notes, where they were first written, are git-ignored and deleted when the build
ends. Each ruling is evidence of what was decided; whether the work it governs is done, open or deferred is the
register's to say ([`2026-07-21-post-item17-followup-campaign.md`](../../plans/2026-07-21-post-item17-followup-campaign.md),
the 2026-11-20 stage 2 entry and §C243).

- The design: [`2026-11-20-book-glossary-stage2-design.md`](2026-11-20-book-glossary-stage2-design.md).
- The plan: [`../plans/2026-11-20-book-glossary-stage2-pr2-write-api.md`](../plans/2026-11-20-book-glossary-stage2-pr2-write-api.md).
  Its plan rulings **P1–P10** were confirmed by [USER] on 2026-11-20 as written and are not restated here.
- **These R-numbers are PR 2's own.** PR 1's build-rulings file
  ([`2026-11-20-book-glossary-stage2-pr1-build-rulings.md`](2026-11-20-book-glossary-stage2-pr1-build-rulings.md))
  has its own R1–R20, and stage 1's has another set.

## [USER]'s directives for the run

Given before the build resumed after Task 2: follow a reviewer's severity label, re-grading only with a written
ruling and never downgrading a Critical; log Minor findings in the build notes and move every one still open into
one register item at the end (§C243); stop the run only for a fix loop that cannot converge, a finding whose fix
would change P1–P10 or a design call, or a plan defect with no checkable fix.

## Rulings that shape behaviour

- **R1.** When `addEntry` replaces concepts, the `changeId` it returns is the `entry-add` history row's id; the
  per-concept `exclude` rows follow it. *Cost if wrong:* one field's meaning.
- **R2.** `changeEntry` with a `forms` list that dedupes to nothing refuses `invalid`: an entry keeps at least one
  form. *Cost if wrong:* none; the route also rejects an empty list.
- **R3.** The plan's Task 2 named `edlisfraedi-2e` as a book whose domain chain lacks chemistry; `server/lib/domains.js`
  puts chemistry fifth in that chain. `stjornufraedi` is the negative case, and the plan text was corrected.
  *Cost if wrong:* none (checked against the source).
- **R4.** The stage-1 refusal for "an identical entry exists but a replaced concept is no longer excluded" is coded
  `entry-conflict`, whose Icelandic message is true there; `replaced-not-carried` said the opposite. Every
  refusal reachable through `addExclusion`/`addEntry` has a test pinning its code. *Cost if wrong:* a less
  specific message on a rare path.
- **R5.** An omitted `source` is written as `''` by the routes; the write API stays trusting (design §3).
  *Cost if wrong:* a 500 on a POST without `source`, which the route tests cover.
- **R6.** A forms-only `changeEntry` that removes an English form is **not** refused when a book preference's
  `term_id` points at that form's row (P3 covers a changed Icelandic and a removal only). No production writer
  creates such a row: `set-book-term-preferences.js` looks up Icelandic terms by Íðorðabankinn id, which a
  book-layer concept never has. The final review found a second, equally unreachable shape and described a
  one-condition closure; both are questions for [USER] in §C243. *Cost if wrong:* a hand-planted preference is
  silently disabled by a forms-only change.
  ✏️ *Superseded 2026-11-20 by [USER]'s answer in the design's AMENDED block ([`2026-11-20-book-glossary-stage2-design.md`](2026-11-20-book-glossary-stage2-design.md)): P3 now also refuses a form removal.*
- **R7.** A form removed by `changeEntry` leaves its replaced concept's single-concept exclusion in place.
  Exclusions are independent layer rows: `GET /` lists them and `POST /exclusions/:id/undo` removes them; only
  `removeEntry`'s convenience undo (keyed on the entry's current forms) cannot reach them. PR 3's page should list
  exclusions no entry claims. *Cost if wrong:* a hidden headword the head editor must undo by hand.
- **R8.** A same-key respelling (`Zgeo` over `zgeo`) stays a no-op and a raw error on a hand-SQL-only dangling entry
  stays a 500; both are logged for later. The resolver matches English by exact text, so the respelling is not
  purely cosmetic. *Cost if wrong:* capitalisation is corrected only by remove and re-add.
- **R9.** `GET /history` shows each row's `by` as a display name (through `displayNameFor`); the internal
  `historyFor` stays raw for other callers. *Cost if wrong:* one lookup per history row.
- **R10.** In the BÍN script, a write that changes no row counts as `superseded` only after re-reading the row: it is
  gone, its text differs from the text looked up, or (without `--force`) another writer has filled it. Any other
  zero-change write is counted nowhere, so the "partition broken" check can still fire. Each branch has its own
  test, a capitalised term pins the bound text, and a trigger that makes a write match nothing shows the check
  fires. *(The first version counted every zero-change write; its review caught that this made the check a
  tautology.)* *Cost if wrong:* an unexplained zero-change write would pass silently.
- **R11.** The BÍN script writes `--report` on its no-candidate return too, and the lookup service maps a child that
  exits 0 with no readable report to `error`, never `already`. A real-runner test schedules one entry twice and
  expects `forms`, then `already`. Both report writes share one helper. *Cost if wrong:* one extra script change
  outside the task's file list.
- **R12.** The lookup child is spawned with `process.execPath`, not `'node'` (the plan's text said `'node'`).
  Production has several Node binaries, and this child loads the native better-sqlite3 module; the server's own
  executable is the binary already proven to load it. *Cost if wrong:* none.
- **R13.** The retry route (`/entries/:conceptId/inflections`) answers 409 `not-found` for a concept that is not one
  of the book's own entries, so a head editor cannot start a lookup that writes onto a shared concept.
  *Cost if wrong:* none for a legitimate caller.
- **R14.** An `already` or `unchanged` answer is 200 with no activity row and no lookup: nothing was written.
  *Cost if wrong:* idempotent re-submissions leave no trace in the activity feed.
- **R15.** P8's control-character rule is applied to `reason` and `source` as written, so a newline in a reason is
  refused (fail-closed). Design §5.2 requires the check only for `english` and forms; whether a reason may span
  lines is a question for [USER] before PR 3's page (§C243). *Cost if wrong:* one regular expression.
  ✏️ *Superseded 2026-11-20 by [USER]'s answer in the design's AMENDED block ([`2026-11-20-book-glossary-stage2-design.md`](2026-11-20-book-glossary-stage2-design.md)): `reason` and `source` are whitespace-collapsed, then checked.*
- **R16.** The final review's single fix wave also put `buildBookGlossaryRecord` inside one read transaction, the
  same fix the build made for the resolved-glossary export, since head editors writing while the cron exports
  make a torn record reachable once PR 2 deploys. *Cost if wrong:* a slightly larger fix diff.
- **R17.** When the logger itself throws inside the lookup queue, the failure is written to `console.error`, and
  the queue stays usable. *Cost if wrong:* one extra logging path.

## Rulings about how the build was run

- **R18.** Each task was committed on the local build branch, staging named files only (both dependency trees were
  symlinked into the worktree); nothing was pushed.
- **R19.** No agent ran the whole test suite; agents ran their task's files, and the controller ran the full suite.
- **R20.** Every fix round went to a fresh implementer, not a resumed one.
- **R21.** Committed files cite plan rulings or design sections only, never the build's working notes; a citation
  of a working-note label that slipped into one commit was removed in its fix round.
- **R22.** A test that redirects the database must also redirect the activity log's own handle, or a decoy database
  path is created for the wrong reason.
- **R23.** Each fix round's re-review saw only that round's diff, and the controller re-ran each task's covering
  files before recording it complete.
- **R24.** The final whole-branch review ran on the most capable model under [USER]'s standing grant for reviews.

R18–R24 carry no behaviour; they are recorded so the build can be reconstructed.
