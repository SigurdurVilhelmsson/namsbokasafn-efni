---------------------------- MODULE MtLock ----------------------------
(* The MT edit lock and the study-freeze marker (G1.7) against every writer of one study unit's
   MT, over every order of their file operations. One unit (module); each actor runs once.

   Promise (tools/lib/mt-lock.cjs, api-translate's mtRunDecision, CLAUDE.md "NEVER CLEAR, EDIT OR
   DELETE A STUDY FREEZE MARKER"): once a `<module>-segments.locked` marker exists, the unit's
   served MT (02-mt-output, plus the 02-mt-selected overlay) never changes; a freeze marker is
   never replaced or removed; a module someone has edited is never left without a marker.

   What is ONE step. Each actor below is a separate OS process (api-translate, the server,
   study-freeze, the Playwright run), so every filesystem call is its own step: another process
   can act between any two of them. Inside the server a request is synchronous (better-sqlite3,
   no await), but that orders requests against each other, not against other processes.

   The code each action stands for (open it to check):
     AtPlan     tools/api-translate.js main(): work-list build, `locked = isMtLocked(outputPath)`
                then mtRunDecision (locked -> 'locked-skip'); runRerequestMode's isMtLocked refusal
     AtWrite    translateModule `fs.writeFileSync(outputPath, …)` / topUpModule's write /
                rerequestModule -> writeSelectedOverlay: after the paid call, no lock re-read
     SrvSave    segmentEditorService.saveSegmentEdit (or acceptanceService's first acceptance):
                the edit row commits, then writeMtLock's `if (fs.existsSync(lock)) return;`
     SrvWrite   writeMtLock's `fs.writeFileSync(lock, body)`: flag 'w', so it replaces a marker
                that appeared since the existsSync
     FzCheck    study-freeze `markers --write` -> writeFreezeLock -> freezeLockState
                (planMarkers refuses a 'foreign' marker before any write)
     FzCreate   writeFreezeLock's `writeFileSync(lock, FREEZE_LOCK_BODY, {flag: 'wx'})`: an
                exclusive create; on EEXIST it re-reads and returns 'already' or throws FOREIGN
     E2eSnap    server/e2e global-setup: listLockFiles -> the pre-run snapshot
     E2eSave    the suite's own first save against efnafraedi-2e (writeMtLock; taken as one step,
                which can only hide an interleaving, never invent one)
     E2eSweep   mt-lock-sweep.js sweepStrayLocks: unlinks every marker absent from the snapshot,
                without reading its body
     Pull       a dev tree's `git pull` brings prod's committed marker (scripts/git-backup.sh
                stages markers); TwoTrees only
     Push       the dev tree's MT commit reaches prod (merge, then deploy's pull); TwoTrees only
*)
EXTENDS Integers

CONSTANTS
  Actors,      \* subset of {"at", "srv", "fz", "e2e"}: which processes run
  TwoTrees,    \* FALSE: every actor on one tree. TRUE: srv and fz on "prod", the rest on "dev"
  Sequential   \* TRUE: actors run one after another, never overlapping

Trees == IF TwoTrees THEN {"dev", "prod"} ELSE {"dev"}
TreeOf(a) == IF TwoTrees /\ a \in {"srv", "fz"} THEN "prod" ELSE "dev"

VARIABLES
  marker,    \* [Trees -> {"none", "editing", "freeze"}]: the .locked file and what its bytes are
  base,      \* [Trees -> Nat]: version of the unit's served MT (02-mt-output + 02-mt-selected)
  lockBase,  \* ghost [Trees -> Int]: base when the current marker appeared; -1 when none
  frozen,    \* ghost [Trees -> BOOLEAN]: a freeze marker was written to (or pulled into) this tree
  edited,    \* ghost [Trees -> BOOLEAN]: a person's first edit or acceptance committed here
  pc,        \* [Actors -> state]
  snap,      \* the e2e snapshot: was a marker present at setup?
  running    \* Sequential only: the actor mid-run, or "none"

vars == <<marker, base, lockBase, frozen, edited, pc, snap, running>>

Init ==
  /\ marker = [t \in Trees |-> "none"]
  /\ base = [t \in Trees |-> 0]
  /\ lockBase = [t \in Trees |-> -1]
  /\ frozen = [t \in Trees |-> FALSE]
  /\ edited = [t \in Trees |-> FALSE]
  /\ pc = [a \in Actors |-> "idle"]
  /\ snap = FALSE
  /\ running = "none"

\* May actor a take a step? Under Sequential only the actor mid-run, or any actor when none is.
May(a) == ~Sequential \/ running \in {"none", a}
Begin(a) == running' = IF Sequential THEN a ELSE running
End == running' = "none"

\* Change tree t's marker to m, keeping the lockBase ghost in step.
SetMarker(t, m) ==
  /\ marker' = [marker EXCEPT ![t] = m]
  /\ lockBase' = [lockBase EXCEPT ![t] =
       IF m = "none" THEN -1 ELSE IF marker[t] = "none" THEN base[t] ELSE lockBase[t]]

\* ── api-translate ──
IsMtLocked(t) == marker[t] # "none"   \* isMtLocked: any marker, readable or not

AtPlan ==
  /\ "at" \in Actors /\ pc["at"] = "idle" /\ May("at")
  /\ IF IsMtLocked("dev")
       THEN pc' = [pc EXCEPT !["at"] = "done"] /\ End          \* 'locked-skip'
       ELSE pc' = [pc EXCEPT !["at"] = "paid"] /\ Begin("at")  \* the paid call starts
  /\ UNCHANGED <<marker, base, lockBase, frozen, edited, snap>>

AtWrite ==
  /\ "at" \in Actors /\ pc["at"] = "paid" /\ May("at")
  /\ base' = [base EXCEPT !["dev"] = @ + 1]
  /\ pc' = [pc EXCEPT !["at"] = "done"] /\ End
  /\ UNCHANGED <<marker, lockBase, frozen, edited, snap>>

\* ── the server's first save (writeMtLock) ──
SrvSave ==
  LET t == TreeOf("srv") IN
  /\ "srv" \in Actors /\ pc["srv"] = "idle" /\ May("srv")
  /\ edited' = [edited EXCEPT ![t] = TRUE]
  /\ IF marker[t] # "none"
       THEN pc' = [pc EXCEPT !["srv"] = "done"] /\ End          \* existsSync: no-op
       ELSE pc' = [pc EXCEPT !["srv"] = "write"] /\ Begin("srv")
  /\ UNCHANGED <<marker, base, lockBase, frozen, snap>>

SrvWrite ==
  LET t == TreeOf("srv") IN
  /\ "srv" \in Actors /\ pc["srv"] = "write" /\ May("srv")
  /\ SetMarker(t, "editing")
  /\ pc' = [pc EXCEPT !["srv"] = "done"] /\ End
  /\ UNCHANGED <<base, frozen, edited, snap>>

\* ── study-freeze markers --write (writeFreezeLock) ──
FzCheck ==
  LET t == TreeOf("fz") IN
  /\ "fz" \in Actors /\ pc["fz"] = "idle" /\ May("fz")
  /\ IF marker[t] = "none"
       THEN pc' = [pc EXCEPT !["fz"] = "create"] /\ Begin("fz")
       ELSE pc' = [pc EXCEPT !["fz"] = "done"] /\ End           \* 'already', or FOREIGN refusal
  /\ UNCHANGED <<marker, base, lockBase, frozen, edited, snap>>

FzCreate ==
  LET t == TreeOf("fz") IN
  /\ "fz" \in Actors /\ pc["fz"] = "create" /\ May("fz")
  /\ IF marker[t] = "none"
       THEN SetMarker(t, "freeze") /\ frozen' = [frozen EXCEPT ![t] = TRUE]
       ELSE UNCHANGED <<marker, lockBase, frozen>>              \* EEXIST: re-read, never write
  /\ pc' = [pc EXCEPT !["fz"] = "done"] /\ End
  /\ UNCHANGED <<base, edited, snap>>

\* ── the Playwright run on the dev tree ──
E2eSnap ==
  /\ "e2e" \in Actors /\ pc["e2e"] = "idle" /\ May("e2e")
  /\ snap' = (marker["dev"] # "none")
  /\ pc' = [pc EXCEPT !["e2e"] = "saved?"] /\ Begin("e2e")
  /\ UNCHANGED <<marker, base, lockBase, frozen, edited>>

E2eSave ==
  /\ "e2e" \in Actors /\ pc["e2e"] = "saved?" /\ May("e2e")
  /\ IF marker["dev"] = "none" THEN SetMarker("dev", "editing") ELSE UNCHANGED <<marker, lockBase>>
  /\ pc' = [pc EXCEPT !["e2e"] = "sweep"]
  /\ UNCHANGED <<base, frozen, edited, snap, running>>

E2eSweep ==
  /\ "e2e" \in Actors /\ pc["e2e"] = "sweep" /\ May("e2e")
  /\ IF marker["dev"] # "none" /\ ~snap THEN SetMarker("dev", "none") ELSE UNCHANGED <<marker, lockBase>>
  /\ pc' = [pc EXCEPT !["e2e"] = "done"] /\ End
  /\ UNCHANGED <<base, frozen, edited, snap>>

\* ── git between the trees ──
Pull ==
  /\ TwoTrees /\ (~Sequential \/ running = "none")
  /\ marker["dev"] = "none" /\ marker["prod"] # "none"
  /\ SetMarker("dev", marker["prod"])
  /\ frozen' = [frozen EXCEPT !["dev"] = @ \/ marker["prod"] = "freeze"]
  /\ UNCHANGED <<base, edited, pc, snap, running>>

Push ==
  /\ TwoTrees /\ (~Sequential \/ running = "none")
  /\ base["dev"] > base["prod"]
  /\ base' = [base EXCEPT !["prod"] = base["dev"]]
  /\ UNCHANGED <<marker, lockBase, frozen, edited, pc, snap, running>>

Next ==
  \/ AtPlan \/ AtWrite \/ SrvSave \/ SrvWrite \/ FzCheck \/ FzCreate
  \/ E2eSnap \/ E2eSave \/ E2eSweep \/ Pull \/ Push

Spec == Init /\ [][Next]_vars

\* ── RULES ──
\* While a marker exists, the unit's served MT is what it was when the marker appeared.
BaseFixedWhileLocked == \A t \in Trees : marker[t] # "none" => base[t] = lockBase[t]
\* A freeze marker, once written, stays, with the freeze bytes.
FreezeKept == \A t \in Trees : frozen[t] => marker[t] = "freeze"
\* A module a person has edited has a marker, once writeMtLock has had its turn. (Between the edit
\* row's commit and the marker write the code is unlocked by design; what another process does in
\* that gap is BaseFixedWhileLocked's business. Holding this rule there too was a modelling error.)
SrvWriting == "srv" \in Actors /\ pc["srv"] = "write"
LockedOnceEdited == \A t \in Trees : edited[t] /\ ~SrvWriting => marker[t] # "none"

TypeOK ==
  /\ marker \in [Trees -> {"none", "editing", "freeze"}]
  /\ running \in Actors \cup {"none"}
=============================================================================
