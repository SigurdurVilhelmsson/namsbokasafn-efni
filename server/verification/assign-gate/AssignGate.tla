----------------------------- MODULE AssignGate -----------------------------
(***************************************************************************)
(* G1.13's assign gate and the study-unit opening, for the one study book  *)
(* (efnafraedi-2e, server/lib/researchScope.js STUDY_BOOKS).               *)
(*                                                                         *)
(* Each action is one indivisible step of the server: one better-sqlite3   *)
(* transaction, or one synchronous handler. The coverage table (which      *)
(* function each action stands for) is in                                  *)
(* .claude/skills/verify-assign-gate/SKILL.md.                             *)
(*                                                                         *)
(* A "unit" is a chapter's module; one module per chapter is enough, since *)
(* the opening predicate and the gate never compare modules.               *)
(***************************************************************************)
EXTENDS FiniteSets

CONSTANTS Users, Chapters

\* users.role as the gate and the token see it, for efnafraedi-2e:
\*   "editor" - needs an assignment row (includes a users.role head-editor who has no
\*              head-editor book-access row for efnafraedi-2e);
\*   "head"   - users.role head-editor with a head-editor user_book_access row for the book;
\*   "admin"  - users.role admin.
Roles == {"editor", "head", "admin"}

\* research_consent, per user: "none" is no row; a withdrawal keeps the row
\* (researchConsent.withdraw sets withdrawn_at_ms), so it stays a recorded decision.
Decisions == {"none", "consented", "declined", "withdrawn"}

VARIABLES
  role,      \* [Users -> Roles]
  consent,   \* [Users -> Decisions]
  licence,   \* [Users -> BOOLEAN]: at least one editor_licence_clauses row
  viewOn,    \* the suggestion-view switch now (bookSwitches.currentSwitchValue)
  everOn,    \* it has been switched on at least once (bookSwitches.firstSwitchOnMs # null)
  rows,      \* user_chapter_assignments rows for the study book, as <<user, chapter>>
  opened,    \* module_openings: the chapters whose unit has opened
  openings   \* what was true of the opener at each opening (the record the invariants read)

vars == <<role, consent, licence, viewOn, everOn, rows, opened, openings>>

TypeOK ==
  /\ role \in [Users -> Roles]
  /\ consent \in [Users -> Decisions]
  /\ licence \in [Users -> BOOLEAN]
  /\ viewOn \in BOOLEAN
  /\ everOn \in BOOLEAN
  /\ rows \subseteq Users \X Chapters
  /\ opened \subseteq Chapters
  /\ \A o \in openings : o.unit \in Chapters /\ o.user \in Users

\* Production on 2026-11-22: no chemistry assignment row, no opening, no consent row,
\* no licence row (the table is new). Roles and the switch start anywhere.
Init ==
  /\ role \in [Users -> Roles]
  /\ consent = [u \in Users |-> "none"]
  /\ licence = [u \in Users |-> FALSE]
  /\ viewOn \in BOOLEAN
  /\ everOn = viewOn
  /\ rows = {}
  /\ opened = {}
  /\ openings = {}

\* assignmentGate.assignmentRefusal(conn, { userId, book, chapter }) returns null.
\* One conjunct per refusal reason, in the code's order; book-closed is not modelled
\* (the one modelled book is on EDITOR_WRITABLE_BOOKS).
GateAllows(u, c) ==
  /\ c # 0                    \* gate: chapter-not-editable
  /\ role[u] = "editor"       \* gate: bypass-role
  /\ consent[u] # "none"      \* gate: no-consent-decision
  /\ licence[u]               \* gate: no-licence-clause
  /\ viewOn                   \* gate: suggestion-view-off

\* userService.setChapterAssignee: the gate, then delete the chapter's other holders and
\* insert this one, in one transaction (POST /api/admin/assignments/:book/:chapter and
\* POST /api/admin/users/:id/chapters).
AssignReplacing(u, c) ==
  /\ GateAllows(u, c)
  /\ rows' = {r \in rows : r[2] # c} \cup {<<u, c>>}
  /\ UNCHANGED <<role, consent, licence, viewOn, everOn, opened, openings>>

\* userService.assignChapter: the gate, then INSERT OR IGNORE one row (no route calls it;
\* it stays for fixtures and is gated all the same).
AssignAdding(u, c) ==
  /\ GateAllows(u, c)
  /\ rows' = rows \cup {<<u, c>>}
  /\ UNCHANGED <<role, consent, licence, viewOn, everOn, opened, openings>>

\* userService.removeChapterAssignment (DELETE /api/admin/users/:id/chapters/:book/:chapter).
RemoveRow(u, c) ==
  /\ <<u, c>> \in rows
  /\ rows' = rows \ {<<u, c>>}
  /\ UNCHANGED <<role, consent, licence, viewOn, everOn, opened, openings>>

\* userService.clearChapterAssignees (DELETE /api/admin/assignments/:book/:chapter).
ClearChapter(c) ==
  /\ \E r \in rows : r[2] = c
  /\ rows' = {r \in rows : r[2] # c}
  /\ UNCHANGED <<role, consent, licence, viewOn, everOn, opened, openings>>

\* PUT /api/admin/users/:id (role) and POST/DELETE /api/admin/users/:id/books (head-editor
\* grant): neither reads or touches assignment rows.
SetRole(u, r) ==
  /\ role[u] # r
  /\ role' = [role EXCEPT ![u] = r]
  /\ UNCHANGED <<consent, licence, viewOn, everOn, rows, opened, openings>>

\* researchConsent.recordDecision (POST /api/research/consent), by the editor. Only
\* the 2030 retention step deletes research_consent rows; it is outside this model.
RecordDecision(u, d) ==
  /\ consent' = [consent EXCEPT ![u] = d]
  /\ UNCHANGED <<role, licence, viewOn, everOn, rows, opened, openings>>

\* researchConsent.withdraw (POST /api/research/consent/withdraw): the row stays.
Withdraw(u) ==
  /\ consent[u] = "consented"
  /\ consent' = [consent EXCEPT ![u] = "withdrawn"]
  /\ UNCHANGED <<role, licence, viewOn, everOn, rows, opened, openings>>

\* licenceClauses.recordClause (POST /api/admin/users/:id/licence-clause).
RecordLicence(u) ==
  /\ licence' = [licence EXCEPT ![u] = TRUE]
  /\ UNCHANGED <<role, consent, viewOn, everOn, rows, opened, openings>>

\* licenceClauses.removeClause (DELETE /api/admin/users/:id/licence-clause/:rowId), taking
\* the user's last row. It does not read or touch assignment rows.
RemoveLicence(u) ==
  /\ licence[u]
  /\ licence' = [licence EXCEPT ![u] = FALSE]
  /\ UNCHANGED <<role, consent, viewOn, everOn, rows, opened, openings>>

\* suggestionSwitch.setSuggestionView (POST /api/admin/books/:book/suggestion-view).
\* After the first switch-on, off and on again are both allowed (the kill switch).
SwitchView(b) ==
  /\ viewOn # b
  /\ viewOn' = b
  /\ everOn' = (everOn \/ b)
  /\ UNCHANGED <<role, consent, licence, rows, opened, openings>>

\* A serve of the chapter's module (GET /api/segment-editor/:book/:chapter/:moduleId)
\* reaching moduleOpenings.openOnServe: openingPredicate (a row for this user and chapter,
\* not yet opened) then recordOpening. validateBookChapter refuses chapter 0 before it.
\* The predicate reads neither role, consent, licence nor the switch: "the row decides".
Serve(u, c) ==
  /\ c # 0
  /\ <<u, c>> \in rows
  /\ c \notin opened
  /\ opened' = opened \cup {c}
  /\ openings' = openings \cup
       {[unit |-> c, user |-> u, consentAt |-> consent[u], licenceAt |-> licence[u],
         roleAt |-> role[u], everOnAt |-> everOn]}
  /\ UNCHANGED <<role, consent, licence, viewOn, everOn, rows>>

Next ==
  \/ \E u \in Users, c \in Chapters : AssignReplacing(u, c)
  \/ \E u \in Users, c \in Chapters : AssignAdding(u, c)
  \/ \E u \in Users, c \in Chapters : RemoveRow(u, c)
  \/ \E c \in Chapters : ClearChapter(c)
  \/ \E u \in Users, r \in Roles : SetRole(u, r)
  \/ \E u \in Users, d \in {"consented", "declined"} : RecordDecision(u, d)
  \/ \E u \in Users : Withdraw(u)
  \/ \E u \in Users : RecordLicence(u)
  \/ \E u \in Users : RemoveLicence(u)
  \/ \E b \in BOOLEAN : SwitchView(b)
  \/ \E u \in Users, c \in Chapters : Serve(u, c)

Spec == Init /\ [][Next]_vars

-----------------------------------------------------------------------------
\* The rules the code must keep (AssignGate.cfg). Spec §4's first anti-goal and R6.

\* No study unit opens for an editor who has no consent decision recorded.
ConsentBeforeOpening == \A o \in openings : o.consentAt # "none"

\* No study unit opens before the suggestion view has first been switched on (R6:
\* a unit opened before that loses its suggestions for good).
OpenedOnlyAfterFirstSwitchOn == \A o \in openings : o.everOnAt

\* No assignment row for chapter 0, and its unit never opens (spec §6.6).
NoChapterZero == /\ \A r \in rows : r[2] # 0
                 /\ 0 \notin opened

\* At the moment a row is created, its holder is a plain editor of the book (the gate's
\* bypass-role reason; G1.1 + G1.2 design §8). Checked as an action property: it speaks
\* of the step that adds the row, not of every later state (see OnlyEditorsHoldRows).
RowsCreatedOnlyForEditors == [][\A r \in rows' \ rows : role[r[1]] = "editor"]_vars

\* At the moment a row is created, its holder has a recorded licence clause (the gate's
\* no-licence-clause reason; spec §6.5).
RowsCreatedWithLicence == [][\A r \in rows' \ rows : licence[r[1]]]_vars

-----------------------------------------------------------------------------
\* Known findings (AssignGateFindings.cfg): the code does NOT keep these, by the spec's
\* choice to gate only the creation of a row. Each is pinned as expected to fail.

\* G1.1 + G1.2 design §8: rows only for a unit's editors. Broken by a role change after
\* the assignment (spec AMENDED item 7a is the runbook line for it).
OnlyEditorsHoldRows == \A r \in rows : role[r[1]] = "editor"
OnlyEditorsOpen == \A o \in openings : o.roleAt = "editor"

\* Every row holder has a recorded licence clause. Broken by removing a licence row
\* (recorded in error) after the assignment: the editor keeps the chapter.
EveryRowHolderHasLicence == \A r \in rows : licence[r[1]]
OpenerHadLicence == \A o \in openings : o.licenceAt
=============================================================================
