# Decision: four answers on 2026-11-14 on who reads what about people — the activity log follows the reader's books; a guest reads the glossary and the pipeline status without names; a newly added member is told to sign in again

- **Date:** 2026-11-14
- **Status:** Accepted
- **Context owners:** [USER] (answered 2026-11-14: "All recommendations accepted. Proceed.", to questions that each
  stated its context, its options and a recommendation)
- **Supersedes:** none
- **Related:**
  - `docs/decisions/2026-11-14-interface-audit-answers.md` (the other nine answers of the same day; these four
    were held back until the change that carries them);
  - `docs/decisions/2026-11-08-editing-gates-and-housekeeping-answers.md` (answer 9 there, SD7: who sees
    per-editor data);
  - CLAUDE.md § Auth (a signed-in user may have no `users` row);
  - `server/lib/activityScope.js`, `server/lib/withoutPeople.js` and their tests, which hold the rules as built.

> **FROZEN EVIDENCE — banner-dated 2026-11-14.** This record is *evidence*, never status.
> It describes what was decided on that date and why. **If it disagrees with the active
> register in `docs/plans/`, the register wins** — this file is dated, the register is live.
> Do not sync it, do not update it, do not edit it. Supersede it instead.

## Question

An independent review of the 2026-11-13 changes to who may read data about team members found four more places
of the same kind, on routes those changes did not touch. Each needed a rule, not a patch. The numbers are the
ones the questions were asked with.

- **5.** The activity log says who saved or approved what, and when. The log search was held to a head editor's
  own books, while three other reads gave the same rows to any editor for any book. Who reads which book's log?
- **6.** The glossary is open to every sign-in, guests included. Its answers also carried who proposed and
  approved each translation, by name and account id, and every discussion comment with its author. What does a
  guest get?
- **7.** The pipeline-status read, open to every sign-in, named who completed a stage and who holds a chapter's
  lock. The names are e-mail addresses. What does a guest get?
- **8.** A person who signs in before being added is a guest, and stays one until they sign in again. Nothing on
  screen says so. What is done about it?

## Decision

- **5. The log follows the reader's books.** An admin reads every book's log. Anyone else reads the log of the
  books they hold or are assigned to: a book-access row (head editor or editor) or a chapter assignment. One
  rule for every read of the log.
- **6. A guest reads the glossary without the people.** The terms, translations and definitions stay open. Who
  proposed, who approved, and the discussions are left out for anyone below the editor role.
- **7. The same for the pipeline status.** A guest reads the stages and whether the chapter is locked, not who
  did it.
- **8. Tell the admin.** The dialog that adds a user says that a person who is already signed in has to sign
  out and in again. The sign-in code is not changed.

## Reasoning

### 5. One rule for the log

- With the search restricted and the timeline open, the restriction could be walked around by a lower role than
  the one it restricted. Either "own books" or "open within the team" was defensible; the mixed state was not.
- "Own books" keeps the restriction that had just shipped for the search.
- Known effect: an editor with an account and no book (no book-access row, no chapter) reads no timeline, and
  Framvinda says why.

### 6 and 7. Content without people

- Guests are meant to read the glossary. A sign-in from the shared school tenant is a guest, students included
  (CLAUDE.md § Auth), and the names of staff and their discussion are not needed to read a term.
- The pipeline status named people by e-mail address.
- The check in the tests is by value: every planted name and id must be absent from a guest's answer in any
  field, with the same request as an editor as the control.

### 8. A note, not a lookup

- The other option was for each request to look the account up by e-mail, as sign-in does. That lookup is where
  an earlier review found an account takeover (CLAUDE.md § Auth, `isClaimableByEmail`). Changing it for an
  inconvenience each person meets once was not proportionate.

## Consequences

- Every route that reads the activity log goes through `server/lib/activityScope.js`, the figures built from
  it included (the dashboard, the analytics, the meeting agenda). A test scans the routes and fails, by name,
  on a read that is neither scoped nor listed with its reason.
- An editor needs a book-access row or a chapter assignment to see a book's timeline.
- A new field that names a person in a glossary or pipeline answer has to be added to the list its route strips
  for guests; the value-based tests fail if a planted name gets through, and cannot see a field they do not
  plant.
- A person added after their first sign-in is a guest until they sign in again (up to the session's lifetime).

## Alternatives considered

- **5. Open within the team** (every editor reads every book's log, and the search restriction is undone) —
  rejected: it gives up a restriction that had just shipped. **Leave it mixed** — rejected.
- **6. Leave as is** — rejected. **Close the glossary to guests** — rejected: guests are meant to read it.
- **7. Leave as is** — rejected.
- **8. Look the account up by e-mail on each request** — rejected, as above. **Leave as is** — rejected: it
  will confuse the first teachers.
