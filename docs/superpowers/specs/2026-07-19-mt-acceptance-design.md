# MT-acceptance record — "Staðfesta vélþýðingu" (design)

**Date:** 2026-07-19
**Origin:** item-20 final-review finding F1 (research-honesty): faithful-tier presence and
`postEdited=false` conflate never-reviewed apply-carryover with human review. Lead directed the
"real fix" — a first-class per-segment acceptance record — slotted before campaign item 21.
**Clean slate:** no backfill; the lead re-reviews the 4 existing faithful modules
(m68663/m68664/m68699/m68700) with the new action once it ships.
**Delivery:** two PRs — PR1 = the workflow feature end-to-end; PR2 = corpus consumption
(+ folds register I20-R6).

## 1. Problem (scout-verified, 2026-07-19)

An "MT is fine as-is" judgment is not merely unrecorded today — it is structurally impossible
to express, and its absence breaks the whole good-MT pipeline path:

- The client short-circuits an unchanged save (`server/public/js/segment-editor.js:1074-1077`)
  and the server treats identical content as *withdraw* — an existing pending row is
  hard-DELETEd, category/note silently dropped (`server/services/segmentEditorService.js:107-115`).
- With zero edit rows, `applyApprovedEdits` throws "No approved edits to apply" (`:830-846`,
  route-mapped to 400) — an accept-only module can never produce a faithful file, never enters
  the TM (`tools/generate-tm.js` walks faithful dirs only), never triggers
  `scheduleTmRegen`/concordance, never gets the Track-C MT edit-lock (first-INSERT trigger,
  `segmentEditorService.js:194-218` — so `api-translate --force` can still overwrite reviewed
  MT), never advances chapter `linguisticReview` (`:1046-1070` requires every MT module to have
  a faithful file), and cannot open Pass 2 (`segmentParser.js:232-236`).
- Progress metrics count only edit rows: module completion requires an approved edit per
  segment (`:1325-1339`), so a module of good MT can never reach "complete".
- Publication-by-carryover: one approved edit publishes ALL sibling MT segments into the
  faithful file with no per-segment record (`:959-966` — overlay winners, else `seg.is`).

## 2. Scoping decisions (lead, 2026-07-19)

| # | Decision | Choice |
|---|----------|--------|
| 1 | Approval model | **Single-step accept.** Any editor with book access (`requireBookAccess`) accepts; the record is final. The head editor's module-level apply ("Vista + Birta", `requireHeadEditor`) remains the second human gate before publication. No per-acceptance HE ratification, no per-book toggle. |
| 2 | Bulk ergonomics | **Per-segment + keyboard accept-and-advance.** No accept-all — the record's research value is "a human read this segment"; mechanics cost ≈1 keypress per segment. |
| 3 | Persistence | **New `segment_acceptances` table (source of truth) + apply-time derived per-module sidecar** in `03-faithful-translation/` (rides the existing git-backup pathspec; corpus stays disk-only). Rejected: `segment_edits status='accepted'` (CHECK rebuild + status-CASE sweep + semantic pollution); DB-only (weaker durability, corpus loses disk-derivability). |
| 4 | Delivery | **Two PRs** (feature; then corpus consumption). |

## 3. Vocabulary

"Samþykkja" is the head editor's *approve* verb — the acceptance action uses a distinct verb to
avoid role confusion: UI button **"Staðfesta MT"**, state **"Staðfest"**, filter facets
**"Staðfest"** and **"Óyfirfarnir"** (unhandled = no edit AND no acceptance). Code/English:
`acceptance` (`segment_acceptances`, `acceptSegment`, `revokeAcceptance`).

## 4. Data model — migration 043 `segment_acceptances`

Sibling-table pattern (034/041 precedent; `CREATE TABLE IF NOT EXISTS`, idempotent):

```sql
CREATE TABLE IF NOT EXISTS segment_acceptances (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  book TEXT NOT NULL,
  chapter INTEGER NOT NULL,            -- -1 = appendices (item-14 chapterLabel contract)
  module_id TEXT NOT NULL,
  segment_id TEXT NOT NULL,
  accepted_content TEXT NOT NULL,      -- exact editor-visible IS bytes at accept time
  accepted_by TEXT NOT NULL,
  accepted_by_username TEXT NOT NULL,
  accepted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','superseded')),
  superseded_at DATETIME,
  superseded_reason TEXT,              -- 'superseded-by-edit' | 'content-drift' | 'revoked'
  applied_at DATETIME                  -- stamped when apply publishes the module
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_segment_acceptances_one_active
  ON segment_acceptances(book, module_id, segment_id) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_segment_acceptances_module
  ON segment_acceptances(book, module_id);
```

One **active acceptance per segment** (segment-level fact, not per-editor — unlike
`idx_segment_edits_one_pending`). Registered in `migrationRunner`'s hardcoded array
(append after 042, `server/services/migrationRunner.js:74`); `server/__tests__/startup.test.js`
count pins bump 42→43 (three assertions).

`accepted_content` is the honesty anchor: the record attests to specific bytes and lapses when
those bytes change by any route (§7) — it can never silently bless text the editor didn't read.
Revoked/superseded rows are kept (status flip), not deleted: the history is provenance.

## 5. Server API (PR1)

- **`POST /api/segment-editor/:book/:chapter/:moduleId/accept`** `{segmentId, acceptedContent}`
  — middleware chain mirrors the edit save (`requireAuth, validateBookChapter,
  requireBookAccess()`, `routes/segment-editor.js:322-327`). Behavior:
  - 409 `STALE_CONTENT` when `acceptedContent` ≠ the current server-side baseline for that
    segment (the `loadModuleForEditing` view). This is both the concurrency token and the
    saveRetry replay guard — a queued replay after content changed 409s instead of blessing
    unseen bytes.
  - 409 `EDIT_EXISTS` when the segment has an active (pending/approved-unapplied) edit.
  - Idempotent no-op `{alreadyAccepted: true}` when an active acceptance exists.
  - Writes the Track-C `.locked` marker on the module's **first** acceptance (mirror of the
    first-edit `priorCount === 1` pattern, `segmentEditorService.js:199-221`; non-blocking
    try/catch) — closes the reviewed-MT-still-overwritable hole.
  - Activity-logged (`segment_accepted`).
- **`POST /api/segment-editor/acceptance/:id/revoke`** — own active acceptance, or any for
  book-scoped head editor (resolver + `requireHeadEditorFor` only for the cross-editor case;
  simplest: route allows owner-or-HE, checked in service). Status → `superseded('revoked')`.
- **Module GET** (`routes/segment-editor.js:258-316`) gains `acceptances`: segmentId → active
  acceptance row, alongside `edits`.

## 6. Editor UI (PR1)

- **Accept button** "Staðfesta MT" in the no-edit actions branch (`renderSegmentRow`
  else-branch, `segment-editor.js:843-848`), rendered when `seg.hasTranslation && !latestEdit
  && !acceptance`. Accepted rows: distinct tint + "Staðfest" chip (accepted_by/at in title) +
  small revoke button ("Afturkalla staðfestingu") for owner/HE.
- **Keyboard accept-and-advance**: a visible cursor over segment rows; one shortcut accepts the
  cursor's segment and advances to the next *unhandled* row (no edit, no acceptance),
  scrolling it into view. After a click-accept, the cursor also advances. Default key:
  **Ctrl/Cmd+Shift+Enter** (free in the existing map — Escape, Ctrl+S, Ctrl+Enter, Ctrl+B/I/T,
  `segment-editor.js:2414-2520`); the plan may substitute only on a collision discovered in
  code.
- **Filters** (`segment-editor.html:1494-1521` + `renderSegments`): add facets "Staðfest"
  (accepted) and "Óyfirfarnir" (no edit AND no acceptance — the true backlog). "Óbreyttir"
  keeps its current meaning (no edit).
- **Stats chips** (`renderStats`): add Staðfest count; progress bar counts edits ∪ acceptances.
- **Transport**: `saveRetry.attempt` with key `acc:{book}/{ch}/{module}:{segmentId}`; 409 →
  alert + module reload (parity with edit-save conflict flow); retryable errors queue as usual
  (replay-safe by the STALE_CONTENT guard).
- **Withdraw-branch UX fix**: an unchanged save that carries a category/editorNote no longer
  vanishes silently — the client explains and points at Staðfesta MT (the note can ride the
  acceptance? NO — YAGNI: acceptance has no note field; the message simply explains the
  withdraw and mentions Staðfesta). Server `:108` behavior unchanged.

## 7. Lifecycle & invalidation

- **Edit supersedes acceptance**: in `saveSegmentEdit`'s INSERT/UPDATE paths (alongside the
  existing discuss/rejected sweep, `segmentEditorService.js:130-191`), an active acceptance on
  the segment → `superseded('superseded-by-edit')`. Withdrawing the edit does not resurrect
  the acceptance (re-accept is one keypress).
- **Content drift lapses acceptance**: at every sidecar regeneration (§8 — i.e. at apply and
  at faithful restore), any active acceptance whose `accepted_content` no longer equals the
  segment's current file content → `superseded('content-drift')`. Restores and manual faithful
  fixes therefore lapse stale attestations instead of being silently blessed.
- **Apply stamps**: acceptances that are active at a successful apply get `applied_at`.

## 8. Apply integration & derived sidecar (PR1)

- **Gate widening**: `applyApprovedEdits` proceeds when there are unapplied approved edits OR
  active unapplied acceptances for the module (today: throw at `:830-846`). File-write logic is
  unchanged — acceptances overlay nothing; the module still rebuilds from baseline + edit
  winners (`:949-966`). Post-apply hooks (status-advance `:1046-1070`, TM regen `:1075`,
  concordance `:1083`) now fire for accept-only modules.
- **Review-session fit**: `submitModuleForReview` accepts zero-edit submissions already
  (`:573-642`); `completeModuleReview`'s `total==0` branch already yields 'approved'
  (`:686-752`), so an acceptances-only module submits → completes → auto-applies with no
  session-logic change. (The apply the route auto-triggers now succeeds via the widened gate.)
- **Metrics redefinition**: reviewed(segment) = has approved edit ∪ active acceptance —
  applied in `getModuleStats` (`:1142-1164`), `getEditorialProgress` (module completion
  `:1325-1339` becomes distinct(approved ∪ accepted) ≥ segCount; chapter counts `:1288-1297`),
  and the editor progress bar. **F18-class comms**: completion numbers will RISE when this
  deploys — release note to ritstjórn states the new definition.
- **Derived sidecar** `books/{book}/03-faithful-translation/chNN/{moduleId}-review-status.json`,
  regenerated from DB state inside apply (after the faithful write) and after a faithful-track
  `restoreVersion` (alongside the existing post-write hooks,
  `contentVersionService.js:295-312`). Content: a **full per-segment map** —

  ```json
  {"generated": "<ISO>", "book": "…", "chapter": "1", "module": "m68664",
   "segments": {
     "m68664:para:a": {"status": "edited",   "by": "editor",  "at": "<reviewed_at>"},
     "m68664:para:b": {"status": "accepted", "by": "editor",  "at": "<accepted_at>"},
     "m68664:para:c": {"status": "carryover"}
   }}
  ```

  `edited` = approved+applied edit on the segment; `accepted` = active acceptance (content
  matches, else it just lapsed per §7); `carryover` = published without per-segment review.
  Deterministic key order (file segment order). Derived artifact conventions: `.gitattributes`
  gains a `books/*/03-faithful-translation/*/*-review-status.json merge=ours` line (the #162
  conflict class; clones already run `git config merge.ours.driver true`). Rides the existing
  `books/*/03-faithful-translation/` git-backup pathspec — 2-hourly git durability, zero
  script changes.

## 9. PR2 — corpus consumption

`tools/export-corpus.js` reads the module's `-review-status.json` when present: row field
`reviewStatus: "edited"|"accepted"|"carryover"|null` (null = no sidecar → pre-feature module
or no faithful yet), TSV gains the column, manifest note 4 updated to point consumers at the
field, stats gain per-status counts. **Folds register I20-R6** (TSV single-sourcing via an
accessor table + literal header pin) since the TSV contract is being touched anyway. Corpus
stays disk-only.

## 10. Testing (PR1)

- Migration: idempotency, startup pins 42→43, schema shape.
- Service: accept happy path + idempotence; 409 STALE_CONTENT (byte mismatch) + 409
  EDIT_EXISTS; revoke authz (owner yes, other-editor no, HE yes); supersede-on-edit;
  content-drift lapse at regen; applied_at stamping; first-accept mt-lock write.
- Apply: **the previously-impossible path** — accept-only module applies, writes faithful file
  + sidecar, stamps acceptances, advances chapter status, triggers TM/concordance hooks
  (behavioral, not static pins); mixed edits+acceptances module; gate still throws with
  neither.
- Routes: middleware-invoke pins on accept/revoke (item-19 MF2 lesson — prove the gates fire).
- Metrics: completion/progress redefinition (module of N segments: e edits + a acceptances,
  complete iff distinct coverage = N).
- Sidecar: determinism, full-map correctness for all three statuses, drift-lapse interaction.
- UI: static pins for button/facets/chips + Playwright e2e: accept → chip + stats change;
  keyboard advance; revoke.

## 11. Out of scope (deliberate)

- Accept-all / bulk acceptance (lead decision — per-segment attestation only).
- Per-acceptance HE ratification or per-book enforcement toggle (single-step decided).
- Localization-track acceptance (schema extends later if Pass 2 wants it; table is
  faithful-track by construction today).
- Retro-formalizing existing carryover — the lead re-reviews the 4 faithful modules with the
  new action.
- Acceptance notes/categories (YAGNI; an acceptance is a bare attestation).
- Corpus changes (PR2), Árnastofnun/item 21.

## 12. Register queue (created by this design)

- **MTA-R1 `[comms]`** — deploy release-note to ritstjórn: completion metrics redefinition
  (numbers rise) + the new Staðfesta MT workflow + re-review plan for the 4 modules.
- **MTA-R2 `[design note]`** — `module_reviews.edited_segments` stays edit-only; whether the
  review-queue UI should display acceptance counts per session is deferred until the queue
  sees real acceptance traffic.
