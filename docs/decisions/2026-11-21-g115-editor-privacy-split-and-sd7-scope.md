# Decision: four answers on 2026-11-21 on G1.15 (editor privacy) — split it; the 14 Nov log rule governs log rows and SD7 governs per-person figures; those figures are listed by name and held to a head editor's own books; no per-person "last active" time

- **Date:** 2026-11-21
- **Status:** Accepted
- **Context owners:** [USER] (answered 2026-11-21, choosing the recommended option on each of four questions that stated their context and options)
- **Supersedes:** none
- **Related:**
  - `docs/decisions/2026-11-08-editing-gates-and-housekeeping-answers.md` (answer 9, SD7: who sees per-editor data);
  - `docs/decisions/2026-11-14-interface-audit-answers-logs-and-names.md` (answer 5: the activity log follows the reader's books);
  - `docs/plans/2026-10-23-skerfur-development-plan.md` (G1.15, SD7);
  - the active register's 2026-11-21 entry for the c46 bundle (batch B4), and G1.4's preconditions in its 2026-11-08 PR4 entry;
  - `server/lib/activityScope.js`, `server/lib/teamMetrics.js`, `server/services/dashboardReadModel.js`.

> **FROZEN EVIDENCE — banner-dated 2026-11-21.** This record is *evidence*, never status.
> It describes what was decided on that date and why. **If it disagrees with the active
> register in `docs/plans/`, the register wins** — this file is dated, the register is live.
> Do not sync it, do not update it, do not edit it. Supersede it instead.

## Question

G1.15 was built last of the c46 bundle (batch B4), and two things the board did not record stopped it:

1. **Two rulings overlap.** SD7 (2026-11-08) gives per-editor tables, timelines and event lists to admins and each
   book's head editors, for that book's editors only, with no ranking by volume and never any time or distance. Answer 5
   of 2026-11-14 lets anyone, editors included, read the activity log of the books they hold or are assigned to; it is
   built (`server/lib/activityScope.js`). The 14 Nov record lists SD7 as related and does not supersede it.
2. **The consent rulings of 2026-11-09** (held privately with the consent draft) added retention dates to G1.15: named
   editing records to 31 December 2028, records without names to 31 December 2029, consent, deletion and loss records to
   31 December 2030, and the research retention date set to 31 December 2029.

Read from the code on `main` at `69640a624`: the dashboard's workload list (`dashboardReadModel.getEditorWorkload`)
sorts editors by volume and reads every book; the analytics' per-person figures (`teamMetricsFrom`) sort by volume and
carry each person's `lastActive`; the meeting agenda lists a per-person action count. Four questions followed.

## Decision

1. **Split G1.15.** (a) Route privacy under SD7 is built now. (b) The retention dates are written up first as a design
   spec for [USER]'s approval: which `sessions.db` tables are named editing records, whether a record is deleted or
   loses its names on the date, how that runs, and a public record behind the research date.
2. **The 14 Nov rule governs the activity log's rows; SD7 governs per-person figures and research data.** Editors keep
   reading the log rows of the books they work on.
3. **Per-person counts stay, listed by name and held to a head editor's own books.** No list orders people by volume.
   A head editor sees the people of the books they head; an admin sees everybody.
4. **No per-person "last active" time; the review queue's waiting time stays.** Each person's `lastActive` goes. The
   workload's `oldestPendingHours` (how long that editor's oldest edit has waited for review) stays.

## Reasoning

### 1. Two halves that need different things

Route privacy is a small change once the questions below are answered. The retention half needs decisions nobody has
made: which tables, delete or strip, a scheduled job or a script, and how it meets backups (G1.20 promises a 12-month
cap for editorial backups). `server/lib/researchRetention.js` requires the research date to change in a commit citing
the record that sets it, and the 2026-11-09 rulings exist only in the private consent notes, so a public record has to
come first.

### 2. The later, narrower rule for rows; SD7 for what compares people

The 14 Nov answer was given with SD7 listed beside it, and it settles one question: who reads which book's rows. SD7
exists to keep B1's promise never to compare editors, and comparison happens in totals and rankings, not in a row that
says who saved what. Giving each rule the thing it was written for keeps both, and keeps the activity view editors have
today.

### 3. Counts without a ranking

A count per person is what a head editor needs to see where review work sits. Ordering those counts turns them into a
league table, which SD7 forbids. Alphabetical order keeps the information and drops the ranking. "Own books" means the
books the person heads: a head editor who is also an editor on another book is a colleague there, not its reviewer,
so per-person figures for that book are not theirs to see, though its log rows still are (point 2).

### 4. When a person worked versus how long work has waited

`lastActive` tells when each person last did anything: a monitoring signal about the person. `oldestPendingHours`
measures the queue: how long an edit has waited for a reviewer. It is about the work and helps the reviewer. "Never any
time" in SD7 is read as covering the first and not the second.

## Consequences

- `server/lib/activityScope.js` gains the second scope (the books a reader heads), beside the log's; the dashboard's
  workload, the analytics' per-person figures and the meeting agenda's per-person counts use it. The log reads keep
  `readableLogBooks`.
- A head editor who is an editor on another book stops seeing that book's people in the three per-person lists. A
  head-editor account with no headed book sees none.
- G1.15(b), the retention design, is open work; its status lives in the register. G1.15's production log limits
  (nginx 14 days, journald 90 days) are a production change for [USER], unchanged by this record.
- Reversal: any answer can be superseded by a new record; the code change behind 2–4 is small and test-pinned.

## Alternatives considered

1. **One design for both halves first** — rejected: route privacy waits for retention decisions it does not depend on.
2. **SD7 governs the timeline too** — rejected: editors would lose the activity view the 14 Nov answer gave them, for a
   comparison risk the timeline's rows do not carry.
3. **Remove the per-person counts entirely** — rejected: head editors need them to see where review work sits; the
   ranking, not the count, was the problem.
4. **Drop both time fields**, or **keep both** (reading "time" as B1's active time only) — rejected: the first loses a
   measure about the work, the second keeps a measure about the person.
