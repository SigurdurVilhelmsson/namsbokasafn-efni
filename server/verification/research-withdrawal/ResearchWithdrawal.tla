--------------------------- MODULE ResearchWithdrawal ---------------------------
(***************************************************************************)
(* The research-withdrawal lifecycle (G1.1 + G1.2, spec 2026-11-03 §5.15,  *)
(* §5.16, §5.17) across its processes and its two database files.          *)
(*                                                                         *)
(* PROMISE (consent text, spec §5.15): once an editor withdraws an          *)
(* interval, nothing more is captured for it, and its rows are gone from   *)
(* the live files once the deletion is recorded done.                      *)
(*                                                                         *)
(* One editor, two consent intervals (withdraw, then re-consent), at most  *)
(* one copy of each file at a time. Every action is one indivisible step   *)
(* in the code, and names it:                                              *)
(*  - the SERVER is one synchronous Node process (better-sqlite3, no await *)
(*    in the record chain, no cluster), so a request is one atomic step:   *)
(*    record's consent read and its write cannot be split by another       *)
(*    request. The withdraw route is TWO commits (withdraw, then           *)
(*    deleteIntervalRowsNow) with a crash possible between them.           *)
(*  - research-withdrawal.js is a SEPARATE process run by research-        *)
(*    backup.sh; each of its commits is a step, so server steps interleave *)
(*    with it.                                                             *)
(*  - restores need the service stopped; each is one step.                 *)
(***************************************************************************)
EXTENDS Naturals, FiniteSets

\* Whether the sessions.db restore runbook step is in the model. The main config turns it on (the
\* known finding); NoSessionsRestore.cfg turns it off to check the rest of the design on its own.
CONSTANT SessionsRestoreOn

Intervals == {1, 2}

VARIABLES
  \* sessions.db (research_consent rows, research_capture_losses rows)
  consent,      \* [Intervals -> {"none","live","withdrawn"}]  (withdrawn_at_ms)
  done,         \* [Intervals -> BOOLEAN]                       (deletion_done_at_ms set)
  losses,       \* SUBSET Intervals: intervals with a loss row
  \* research.db
  keys,         \* SUBSET Intervals: editor_keys rows
  events,       \* SUBSET Intervals: intervals with research_events rows
  \* research-withdrawal.js, a separate process
  spc,          \* "idle" | "lossdel" | "resdel" | "record"
  sdue,         \* the due set it read at start (dueIntervals)
  \* copies: the newest local copy of each file
  scriptOk,     \* research-backup.sh: the withdrawal script exited 0 this cycle (may copy)
  partial,      \* research-backup.js takeCopy: the copy taken, before its re-check [has, keys, events, wd]
  rcopy,        \* [has, keys, events]: the kept copy; has = FALSE means none yet
  scopy,        \* [has, consent, done, losses]
  \* GHOSTS: the truth, which no restore can undo
  withdrew,     \* SUBSET Intervals: the editor withdrew these, at some point
  capturedAfter,\* BOOLEAN: an event or loss row was written for an interval already withdrawn
  falseDone,    \* BOOLEAN: a deletion was recorded done while rows of that interval remained
  dirtyCopy     \* BOOLEAN: a research copy was taken holding rows of an interval already withdrawn

vars == <<consent, done, losses, keys, events, spc, sdue, scriptOk, partial, rcopy, scopy, withdrew, capturedAfter, falseDone, dirtyCopy>>

Live == {i \in Intervals : consent[i] = "live"}

\* research-withdrawal.js dueIntervals, over a research file whose key rows are k: withdrawn, and
\* not done or its key row back. research-restore.js purges the staged copy with the same function.
DueFor(k) == {i \in Intervals : consent[i] = "withdrawn" /\ (~done[i] \/ i \in k)}
Due == DueFor(keys)

Init ==
  /\ consent = [i \in Intervals |-> "none"]
  /\ done = [i \in Intervals |-> FALSE]
  /\ losses = {} /\ keys = {} /\ events = {}
  /\ spc = "idle" /\ sdue = {}
  /\ scriptOk = FALSE
  /\ partial = [has |-> FALSE, keys |-> {}, events |-> {}, wd |-> {}]
  /\ rcopy = [has |-> FALSE, keys |-> {}, events |-> {}]
  /\ scopy = [has |-> FALSE, consent |-> [i \in Intervals |-> "none"], done |-> [i \in Intervals |-> FALSE], losses |-> {}]
  /\ withdrew = {} /\ capturedAfter = FALSE /\ falseDone = FALSE /\ dirtyCopy = FALSE

---------------------------------------------------------------------------
\* SERVER (one process, each action atomic)

\* researchConsent.recordDecision 'consented': a new interval; interval 2 only after 1 is withdrawn.
\* researchLog.ensureKey mints its key in the same request (best effort: modelled as always).
Consent(i) ==
  /\ consent[i] = "none" /\ Live = {}
  /\ i = 2 => consent[1] = "withdrawn"
  /\ consent' = [consent EXCEPT ![i] = "live"]
  /\ keys' = keys \cup {i}
  /\ UNCHANGED <<scriptOk, partial, done, losses, events, spc, sdue, rcopy, scopy, withdrew, capturedAfter, falseDone, dirtyCopy>>

\* researchConsent.withdraw (its own commit), then the route calls deleteIntervalRowsNow.
\* WithdrawOnly models a crash between the two commits: only the first lands.
WithdrawCommit(i) ==
  /\ consent[i] = "live"
  /\ consent' = [consent EXCEPT ![i] = "withdrawn"]
  /\ withdrew' = withdrew \cup {i}
  /\ UNCHANGED <<scriptOk, partial, done, losses, keys, events, spc, sdue, rcopy, scopy, capturedAfter, falseDone, dirtyCopy>>

\* researchDeletion.deleteIntervalRowsNow: events+items by key (key row stays), then loss rows.
RouteDelete(i) ==
  /\ consent[i] = "withdrawn"
  /\ events' = events \ {i}
  /\ losses' = losses \ {i}
  /\ UNCHANGED <<scriptOk, partial, consent, done, keys, spc, sdue, rcopy, scopy, withdrew, capturedAfter, falseDone, dirtyCopy>>

\* researchLog.record -> writeEvent: only while captureStateFor says capturing (a live interval);
\* mints the key if missing.
Capture ==
  \E i \in Live :
    /\ events' = events \cup {i}
    /\ keys' = keys \cup {i}
    /\ capturedAfter' = (capturedAfter \/ i \in withdrew)
    /\ UNCHANGED <<scriptOk, partial, consent, done, losses, spc, sdue, rcopy, scopy, withdrew, falseDone, dirtyCopy>>

\* researchLog.record -> lose -> researchConsent.recordLoss: a loss row for a live interval.
Lose ==
  \E i \in Live :
    /\ losses' = losses \cup {i}
    /\ capturedAfter' = (capturedAfter \/ i \in withdrew)
    /\ UNCHANGED <<scriptOk, partial, consent, done, keys, events, spc, sdue, rcopy, scopy, withdrew, falseDone, dirtyCopy>>

---------------------------------------------------------------------------
\* research-withdrawal.js (run --write by research-backup.sh before every copy). Each commit is a
\* step; a crash returns it to idle with nothing more done (ScriptCrash).

\* ~partial.has: research-backup.sh runs the script, then the copy and its re-check, in sequence, every 6 h,
\* so no withdrawal run starts between a copy and its re-check. ASSUMPTION, not enforced (no lock): an admin's
\* hand run of research-withdrawal.js --write in those seconds, or an overlapping cycle, would let the re-check
\* pass on a copy that holds an interval withdrawn just before it (TLC finds that path when this guard goes).
ScriptStart ==
  /\ spc = "idle" /\ Due # {} /\ ~partial.has
  /\ spc' = "lossdel" /\ sdue' = Due
  /\ UNCHANGED <<scriptOk, partial, consent, done, losses, keys, events, rcopy, scopy, withdrew, capturedAfter, falseDone, dirtyCopy>>

\* the loss rows, one sessions.db transaction (first: decision 6)
ScriptLossDelete ==
  /\ spc = "lossdel"
  /\ losses' = losses \ sdue
  /\ spc' = "resdel"
  /\ UNCHANGED <<scriptOk, partial, consent, done, keys, events, sdue, rcopy, scopy, withdrew, capturedAfter, falseDone, dirtyCopy>>

\* items, events, then the key row, one immediate research.db transaction
ScriptResearchDelete ==
  /\ spc = "resdel"
  /\ events' = events \ sdue
  /\ keys' = keys \ sdue
  /\ spc' = "record"
  /\ UNCHANGED <<scriptOk, partial, consent, done, losses, sdue, rcopy, scopy, withdrew, capturedAfter, falseDone, dirtyCopy>>

\* compact + byte scan + exports, then the record: deletion_done_at_ms set (first time only).
\* falseDone: recorded while the interval still has rows in a live file.
ScriptRecord ==
  /\ spc = "record"
  /\ done' = [i \in Intervals |-> done[i] \/ i \in sdue]
  /\ falseDone' = (falseDone \/ \E i \in sdue : i \in keys \/ i \in events \/ i \in losses)
  /\ spc' = "idle" /\ sdue' = {} /\ scriptOk' = TRUE
  /\ UNCHANGED <<partial, consent, losses, keys, events, rcopy, scopy, withdrew, capturedAfter, dirtyCopy>>

ScriptCrash ==
  /\ spc # "idle"
  /\ spc' = "idle" /\ sdue' = {} /\ scriptOk' = FALSE
  /\ UNCHANGED <<partial, consent, done, losses, keys, events, rcopy, scopy, withdrew, capturedAfter, falseDone, dirtyCopy>>

---------------------------------------------------------------------------
\* COPIES AND RESTORES

\* research-backup.sh: the withdrawal script with nothing due exits 0 too.
ScriptNothingDue ==
  /\ spc = "idle" /\ Due = {}
  /\ scriptOk' = TRUE
  /\ UNCHANGED <<partial, consent, done, losses, keys, events, spc, sdue, rcopy, scopy, withdrew, capturedAfter, falseDone, dirtyCopy>>

\* research-backup.js takeCopy, part 1: the online backup, only after the script exited 0 this cycle.
\* The server is live; it may act before, during (this step is the instant the pages are read) and after.
ResearchCopyTake ==
  /\ scriptOk /\ ~partial.has /\ spc = "idle"
  /\ partial' = [has |-> TRUE, keys |-> keys, events |-> events, wd |-> withdrew]
  /\ scriptOk' = FALSE
  /\ UNCHANGED <<consent, done, losses, keys, events, spc, sdue, rcopy, scopy, withdrew, capturedAfter, falseDone, dirtyCopy>>

\* takeCopy, part 2: re-read dueIntervals AFTER the copy; keep it only when nothing is due (spec §5.15,
\* decision 25). dirtyCopy: the kept copy holds rows of an interval withdrawn before it was taken.
ResearchCopyKeep ==
  /\ partial.has /\ Due = {}
  /\ rcopy' = [has |-> TRUE, keys |-> partial.keys, events |-> partial.events]
  /\ dirtyCopy' = (dirtyCopy \/ \E i \in partial.wd : i \in partial.keys \/ i \in partial.events)
  /\ partial' = [has |-> FALSE, keys |-> {}, events |-> {}, wd |-> {}]
  /\ UNCHANGED <<scriptOk, consent, done, losses, keys, events, spc, sdue, scopy, withdrew, capturedAfter, falseDone>>

ResearchCopyDiscard ==
  /\ partial.has /\ Due # {}
  /\ partial' = [has |-> FALSE, keys |-> {}, events |-> {}, wd |-> {}]
  /\ UNCHANGED <<scriptOk, consent, done, losses, keys, events, spc, sdue, rcopy, scopy, withdrew, capturedAfter, falseDone, dirtyCopy>>

\* backup-db.sh: sessions.db's own copy, on its own schedule, any time.
SessionsCopy ==
  /\ scopy' = [has |-> TRUE, consent |-> consent, done |-> done, losses |-> losses]
  /\ UNCHANGED <<scriptOk, partial, consent, done, losses, keys, events, spc, sdue, rcopy, withdrew, capturedAfter, falseDone, dirtyCopy>>

\* research-restore.js (service stopped, script idle): stage the copy, purge it with the withdrawal
\* script against the CURRENT sessions.db (every withdrawn interval whose key the copy brings back),
\* then put it live; the purge records those intervals done.
\* ~partial.has: the same ASSUMPTION as ScriptStart's. A restore's purge (a deletion run) landing between a
\* cron copy and its re-check would let the re-check pass on a copy holding a just-withdrawn interval.
ResearchRestore ==
  /\ rcopy.has /\ spc = "idle" /\ ~partial.has
  /\ LET staleDue == DueFor(rcopy.keys)
     IN /\ keys' = rcopy.keys \ staleDue
        /\ events' = rcopy.events \ staleDue
        /\ losses' = losses \ staleDue
        /\ done' = [i \in Intervals |-> done[i] \/ i \in staleDue]
  /\ UNCHANGED <<scriptOk, partial, consent, spc, sdue, rcopy, scopy, withdrew, capturedAfter, falseDone, dirtyCopy>>

\* docs/technical/backup-and-restore.md "Restore runbook": copy the newest sessions.db copy into
\* place and restart. No step reconciles consent with withdrawals made after the copy.
SessionsRestore ==
  /\ SessionsRestoreOn
  /\ scopy.has /\ spc = "idle"
  /\ consent' = scopy.consent
  /\ done' = scopy.done
  /\ losses' = scopy.losses
  /\ UNCHANGED <<scriptOk, partial, keys, events, spc, sdue, rcopy, scopy, withdrew, capturedAfter, falseDone, dirtyCopy>>

Next ==
  \/ \E i \in Intervals : Consent(i) \/ WithdrawCommit(i) \/ RouteDelete(i)
  \/ Capture \/ Lose
  \/ ScriptStart \/ ScriptLossDelete \/ ScriptResearchDelete \/ ScriptRecord \/ ScriptCrash
  \/ ScriptNothingDue \/ ResearchCopyTake \/ ResearchCopyKeep \/ ResearchCopyDiscard \/ SessionsCopy \/ ResearchRestore \/ SessionsRestore

Spec == Init /\ [][Next]_vars

---------------------------------------------------------------------------
\* RULES

\* Nothing is captured for an interval the editor has withdrawn.
NoCaptureAfterWithdrawal == ~capturedAfter

\* deletion_done_at_ms is recorded only when that interval has no rows left in a live file.
DoneOnlyWhenTrue == ~falseDone

\* When nothing is due and no deletion is running, no withdrawn interval has rows in a live file.
\* No research copy taken after a withdrawal holds that interval's rows (spec §5.15).
CopyAfterWithdrawalClean == ~dirtyCopy

QuiescentClean ==
  (spc = "idle" /\ Due = {}) =>
    \A i \in withdrew : i \notin keys /\ i \notin events /\ i \notin losses

=============================================================================
