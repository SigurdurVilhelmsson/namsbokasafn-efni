# Decision: nine answers on 2026-11-14 to the interface audit's open questions — a save conflict keeps its text; the `UNSEEN_EDIT` refusal; Back still discards; a kept text follows the row's rule; one assignee per chapter; what enters the register; "Senda til yfirlestrar" is not a step; localization is for head editors; one pull request at a time

- **Date:** 2026-11-14
- **Status:** Accepted
- **Context owners:** [USER] (answered 2026-11-14: "All recommendations accepted. Proceed.", to thirteen questions
  that each stated its context, its options and a recommendation)
- **Supersedes:** none. Answer 1 overrides PR1 decision 30 of the served-version work, and answer 2 adds to that
  design's §5.6 step 4; both are noted in that spec's `✏️ AMENDED 2026-11-14` block.
- **Related:**
  - `docs/superpowers/specs/2026-11-03-served-version-and-event-log-design.md` (§5.6, §5.18, §13);
  - `docs/superpowers/plans/2026-11-03-g11-g12-pr1-served-versions-core.md` (decision 30);
  - the interface audit of Ritstjóri, 2026-11-13 (`docs/audit/2026-11-13-interface-walkthrough-audit.md`, committed
  separately; its finding ids are used below);
  - the active register in `docs/plans/`, which owns what is done with each answer.

> **FROZEN EVIDENCE — banner-dated 2026-11-14.** This record is *evidence*, never status.
> It describes what was decided on that date and why. **If it disagrees with the active
> register in `docs/plans/`, the register wins** — this file is dated, the register is live.
> Do not sync it, do not update it, do not edit it. Supersede it instead.

## Question

The 2026-11-13 interface audit and the changes built from it left thirteen questions for [USER]. Nine are recorded
here, under the numbers they were asked with. Answers 5 to 8 (who may read which names and logs, and what a newly
added member is told) are recorded with the change that carries them.

- **1.** A save conflict lost the typed text (ED-02). An earlier decision kept that behaviour on purpose. Does the
  conflict keep the text now?
- **2.** A save from a stale tab replaced an edit the tab had never shown (ED-05). Does the server refuse it, and under
  which code?
- **3.** "← Til baka" now asks before it discards unsaved text; closing the tab keeps a draft. Should Back keep one too?
- **4.** After a conflict, when may the kept text be saved?
- **9.** One assignee per chapter, or several (AS-01)?
- **10.** Which of the audit's fourteen draft entries go into the register?
- **11.** Is "Senda til yfirlestrar" a real step (ED-07, ED-08)?
- **12.** Do teachers localize, or only head editors (LO-02)?
- **13.** May a second branch carry further work while one pull request is open?

## Decision

- **1.** **A save conflict keeps the typed text.** The text stays in its row beside the other editor's version. PR1
  decision 30's "today's alert-and-reload" no longer holds for the live conflict.
- **2.** **The server refuses a save over an edit the page never showed, under a new code, `UNSEEN_EDIT`.** Only a page
  that says it handles the code is refused.
- **3.** **Back stays as it is for now:** it asks, and OK discards. A question with three choices (Vista, Henda, Hætta
  við) is wanted later, with the in-page dialogs.
- **4.** **A kept text follows the row's own editing rule.** It cannot be saved while the row shows another editor's
  undecided edit.
- **9.** **One assignee per chapter.** Choosing a new person replaces the old one. Where a chapter holds two assignees
  today, [USER] chooses who stays from a list.
- **10.** **Six entries and one pointer.** Separate entries for what the unsaved-text change left for later, chapter
  assignment, the Orðasafn dialog, the front page, and the two items that waited on answers 11 and 12; one entry
  that points to the audit report for the rest. [USER] words the entry for the withheld findings.
- **11.** **"Senda til yfirlestrar" is not a step.** Edits are reviewable when they are saved. The button goes, and
  "Yfirlestrar" becomes a list of modules with waiting edits.
- **12.** **Localization is for head editors and admins.** The server and the documents follow the menu.
- **13.** **One open pull request at a time.** No second branch.

## Reasoning

### 1. The conflict keeps the text

- Decision 30 limited the scope of the served-version work; it was not a judgement that losing text is right.
- The audit reproduced the loss in the browser: the second editor's Vista showed an alert, then "Opnum
  klippispjöldum verður lokað. Viltu halda áfram?", and OK, the natural answer, discarded the text.
- Only the page changes. The server's `409 {error: 'conflict'}` and what it records are as they were.

### 2. `UNSEEN_EDIT`, as its own code

- The silent overwrite loses the editor's own text, and it stores a revision of text the editor never saw, which
  is the thing the served-version design exists to make knowable.
- Reusing `STALE_DISPLAYED` would blur that code in the research records: it means the row the page named has
  changed or is gone, and here that row, if any, is unchanged.
- The check is opt-in by a field in the save body, so a page loaded before the deploy saves as before instead of
  meeting a refusal it cannot show.

### 3. Back

- The question now says what will happen, so the discard is chosen and no longer silent.
- Drafts are stored per browser and not per user. On a shared school computer the next person could be offered
  them, so making more drafts waits until that is fixed.
- Three choices need an in-page dialog. The editor has only the browser's two-button question today.

### 4. The kept text

- The row already offers Breyta to nobody else while an edit waits for a decision, head editors included. Holding
  the kept text to the same rule leaves one rule to learn.
- Known cost: the text waits in one browser until the other edit is decided.

### 9. One assignee

- The screen is one dropdown, so it already promises replacement. Today a change adds a second, hidden assignee,
  and with enforcement on, the person who was replaced can still save.
- One assignee also makes "your chapters" on the front page simple.

### 10. The register

- Entries that are months away do not each need a line; the register's resume block stays readable.
- The entries cite the audit report, so they are written once that report is committed.

### 11. Sending for review

- It is how the system already behaves: the head editor can review edits without the button, and Heim lists edits
  as sent before it is pressed. The button works once per module and then fails for good.

### 12. Localization

- No module can be localized yet, because no book has a reviewed translation file. Closing the server's door costs
  nothing now, and opening it later is a small change.

### 13. One pull request

- There is one reviewer, and one open pull request at a time is easier to follow.

## Consequences

- The served-version design has one more refusal code and one more kept-text case. The spec's
  `✏️ AMENDED 2026-11-14` block lists them; the values are in `server/services/servedEdit.js`,
  `server/public/js/segment-save-state.js` and their tests.
- Chapter assignment changes from "add" to "replace". Chapters that hold two assignees need [USER]'s choice before
  the change reaches production.
- "Senda til yfirlestrar" and its one-shot module review go; reversing that later means building the closing of a
  review, which nothing calls today.
- The localization save routes are closed to the editor role, and `docs/onboarding.md` stops sending new editors
  to `/localization`.
- Work proceeds one pull request at a time. The active register owns the order and the state of each item.

## Alternatives considered

- **1.** **Keep decision 30 (alert and reload)** — rejected: the text loss stays.
- **2.** **Drop the stale-tab refusal** — rejected: a stale tab keeps overwriting silently. **Reuse `STALE_DISPLAYED`** —
  rejected: it changes what that code means in the research records.
- **3.** **Back keeps a draft without asking** — rejected for now: more drafts on shared computers before drafts are
  keyed by user.
- **4.** **Save the kept text as a second, competing edit** — rejected: a change to the review model and to what is
  recorded. **Lift the block once the other edit is approved** — rejected: a second rule beside the row's own.
- **9.** **Several assignees, shown as removable tags** — rejected unless two teachers come to share a chapter.
- **10.** **All fourteen entries**, or **none** — rejected: the first crowds the register, the second leaves the report
  as a second list of open work.
- **11.** **A real, repeatable step** — rejected: it needs a closing rule and a state editors must learn, for a team of
  this size.
- **12.** **Editors localize too** — rejected for now; nothing can be localized yet.
- **13.** **A second branch** — rejected.
