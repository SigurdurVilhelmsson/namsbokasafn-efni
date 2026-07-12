# Segment-Edit Exit Path (`discuss`/`rejected`) + Dropped Error Messages — Design

**Date:** 2026-07-12 · **Branch:** `fix/segment-edit-exit-path` (off `main` `1a73e9c6`) · **One PR via SDD.**
**Resolves:** campaign Phase-1 **Batch 2** (`docs/plans/2026-07-11-pre-semester-coding-campaign.md` item 2): the live-reproduced stranded `discuss` row → raw-SQL `alert()` bug, plus the two dropped-message findings (`pipeline.js` confirmation handshake, `saveRetry.js:209`).
**Lead decision (2026-07-12):** Structural rebuild — partial unique index + `'superseded'` status + supersede-on-save + head-editor return-to-pending; full design approved as presented.

## Problem (verified against code 2026-07-12)

1. **Transition-collision class (root cause of the reproduced bug).** Migration 008 gives `segment_edits` a table-level `UNIQUE(book, module_id, segment_id, status, editor_id)` and `status CHECK IN ('pending','approved','rejected','discuss')`. Every transition INTO an occupied status for the same (book, module, segment, editor) violates the constraint and surfaces as a raw SQLite error:
   - `markForDiscussion` (`segmentEditorService.js:374`) — **live-reproduced** (editorial review §3): re-discussing a revised segment with a stranded `discuss` row → HTTP 400 with the raw constraint text in a browser `alert()`.
   - `rejectEdit` (`:350`) — re-rejecting after the editor re-saved: same collision, equally reachable.
   - `approveEdit` (`:322`) — approving a second edit while the same editor's earlier approved row is not yet applied.
   - `unapproveEdit` (`:399`) — approved→pending when the editor meanwhile saved a fresh pending row.
   - Apply-time supersede (`:812`) — sets older approved rows to `'rejected'` INSIDE the apply transaction; collides with an existing rejected row by the same editor.
2. **No exit path.** No code path moves a row out of `discuss` or `rejected`. Stranded rows block the transitions above forever and permanently inflate the admin dashboard's "awaiting decision" count (`discuss` counted alongside `pending`) and the editor's needs-response list (`dashboardReadModel.js:123/:144` — `status IN ('rejected','discuss')`).
3. **Misleading supersede vocabulary.** Apply-time supersede labels rows `'rejected'` with reviewer_note "Leyst úr gildi af nýrri samþykktri breytingu" and `applied_at` set — editors see their auto-superseded edits as rejections.
4. **Dropped messages (campaign riders):**
   - `routes/pipeline.js:87/:134/:181` — three routes return `409 {requiresConfirmation, warning}` with NO `error`/`message` field; no pipeline-panel client code implements the confirm-and-retry half, so users see "Villa: HTTP 409" and cannot proceed (code-review finding 14, Medium). A correct client implementation of the same pattern exists at `views/admin.html:1071` (OpenStax update flow for `admin.js:362`).
   - `public/js/saveRetry.js:209` — `new Error(data.error || …)` drops the server's Icelandic `message` on 409 conflicts; user sees the literal word "conflict" (finding 24, Low).

## Design

### D1. Schema migration (rebuild `segment_edits`)

SQLite cannot alter table constraints → 12-step rebuild in one new migration (number = next free; `up(db)` pattern):

- Columns: identical to live schema = 008 columns + `applied_at DATETIME` (009) + `review_id INTEGER REFERENCES module_reviews(id)` (038).
- `status` CHECK gains `'superseded'`: `CHECK(status IN ('pending','approved','rejected','discuss','superseded'))`.
- Table-level UNIQUE **removed**; replaced by partial unique index:
  `CREATE UNIQUE INDEX idx_segment_edits_one_pending ON segment_edits(book, module_id, segment_id, editor_id) WHERE status = 'pending';`
  (the only invariant code relies on — `saveSegmentEdit`'s existing-pending check at `:86` assumes at most one).
- Recreate the four 008 indexes (`_module`, `_status`, `_editor`, `_segment`).
- Data copied untouched (stranded rows stay as history; no data rewrite).
- Idempotent per the #211 lessons (`migrationIdempotency.test` gates re-run); foreign-keys OFF during rebuild, verify with `PRAGMA foreign_key_check` after.
- Prod safety: `deploy.sh` snapshots the DB pre-pull; migration runs in a transaction (rollback on failure = boot fails loud per #212).

### D2. Exit-path semantics

- **Supersede-on-save (the "server-side path for stale-row re-save"):** in `saveSegmentEdit`, when INSERTing a new pending row (not on UPDATE of an existing pending), first: `UPDATE segment_edits SET status='superseded' WHERE book=? AND module_id=? AND segment_id=? AND editor_id=? AND status IN ('discuss','rejected')`. Reviewer fields left intact (history). The editor answering a discussion/rejection by revising IS the exit. Same-transaction with the INSERT.
- **Head-editor manual exit:** new `returnEditToPending(editId, …)` service function + route, mirror of `unapproveEdit`: allowed from `discuss` or `rejected`, clears reviewer fields, sets `status='pending'`. Guard: if the same editor already has a pending row on that segment → clean 409 (Icelandic: reload / the editor has a newer pending edit) — this is exactly the partial-index collision, caught BEFORE the write. UI: button on discuss/rejected rows in the segment editor review panel (head-editor only, same gating as approve/reject/discuss buttons).
- **Apply-time supersede vocabulary:** `:812` writes `'superseded'` instead of `'rejected'` (same reviewer_note, keeps `applied_at` timestamp field usage unchanged). B1-F7 lesson applied: status vocabulary and every icon/badge/count consumer change together in this PR.

### D3. Consumers of the new status (enumerate in plan; verified sites)

- `segmentEditorService.js` count/stats queries: `:555`, `:937`, `:1007`, `:1026`, `:1048` — decide per query: `superseded` counted nowhere as pending/awaiting; visible in per-segment history (`getSegmentEditHistory :280` returns all rows — unchanged).
- `dashboardReadModel.js:123/:144` — needs-response lists keep `('rejected','discuss')` (superseded rows correctly drop out).
- `public/js/segment-editor.js` — history/status rendering (`:778-:779` gate, badge classes) gains a `superseded` badge (Icelandic label: **"Leyst úr gildi"**, consistent with the existing apply-supersede reviewer_note); review-action buttons never shown on superseded rows.
- Admin dashboard `needsAttention` (status routes) — verify `discuss` handling picks up the drop automatically (counts by status query).

### D4. Message-surfacing riders

- `saveRetry.js:209`: `new Error(data.message || data.error || 'Villa ' + response.status)` (message-first, mirroring the correctly-written utility elsewhere in the codebase per finding 24).
- Pipeline confirmation handshake: in the pipeline-panel client code (callers of `/api/pipeline/inject|render|run` — `public/js/segment-editor.js` and/or `views/books.html`; plan pins the exact button handlers), on `409 {requiresConfirmation}`: `confirm(warning)` → resend with `confirmed: true`. Mirror `views/admin.html:1071`. Server side: add `error`+`message` fields to the three 409 payloads (`pipeline.js:87/:134/:181`) so non-updated clients still show real text.

### D5. Testing

- Migration: idempotency (re-run safe), rebuild fidelity (PRAGMA table_info/index_list assertions: columns incl. `applied_at`/`review_id`, partial index present, old UNIQUE gone), data survival.
- Collision matrix (service-level, real temp DB): re-discuss / re-reject / re-approve / unapprove-onto-pending — all clean now; supersede-on-save marks exactly the caller's own discuss/rejected rows (not other editors', not other segments'); one-pending invariant still enforced (duplicate pending INSERT throws).
- `returnEditToPending`: discuss→pending, rejected→pending, guard-409 when newer pending exists, applied rows refused.
- Apply path: supersede label now `'superseded'`; apply with a pre-existing rejected row by the same editor no longer throws (regression for the `:812` collision).
- Dashboard: superseded rows excluded from needs-response/awaiting counts.
- Riders: saveRetry message-order unit test; pipeline 409 payload shape test + client handshake test (E2E or jsdom-level per existing patterns).
- Full `npm test` from repo root is the authoritative gate.

## Out of scope (register)
- `saveRetry.js:178` stale-retry replay — campaign batch 6 (concurrent-edit lost updates).
- Silent `catch{}` fail-loud sweep — batch 4.
- B1-F7 activity-type vocabulary alignment — separate batch (this PR only adds the segment-edit STATUS vocabulary, which is a different axis).

## Self-review
- Every collision-class member has a fix path (partial index kills the constraint; semantics defined per transition). ✅
- History never deleted; supersede is a status change with fields preserved. ✅
- Vocabulary + all consumers (badges, counts, buttons) change in the same PR (B1-F7 lesson). ✅
- Migration risk mitigated: idempotency test, deploy backup, transaction, fidelity assertions. ✅
- Riders scoped to message surfacing + completing an existing server handshake; no new product surface beyond the lead-approved return-to-pending. ✅

## Amendment (2026-07-12, implementation)

Implemented per `docs/plans/2026-07-12-segment-edit-exit-path-plan.md`. Findings folded in
during execution (each with tests):

1. **Consumer audit was incomplete twice.** The five status-count queries needed no changes
   (explicit per-status COUNTs), but beyond the two consumers the plan added
   (`buildEffectiveSegments`, review stamping), task review found THREE more in
   `propagationService.js` (`:68/:138/:154` — `status != 'rejected'` would have served
   superseded rows as live propagation content / false conflicts). All now
   `NOT IN ('rejected','superseded')`.
2. **A fifth collision-class member was unguarded:** `unapproveEdit` (approved→pending)
   could hit the partial unique index raw; it now carries the same `PENDING_EXISTS` → 409
   guard as `returnEditToPending`.
3. **Migration 039 hardening (task-review driven):** carries 038's `idx_segment_edits_review`
   (a DROP TABLE takes indexes with it); the whole rebuild is one `db.transaction()` (a
   reviewer empirically demonstrated the naive self-heal could destroy the only data copy in
   the DROP→RENAME crash window via 008's empty-table resurrection); populated-copy +
   decoy-orphan + atomicity-pin tests.
4. **One deliberate data rewrite added (final review):** rows the pre-039 apply path stamped
   with the superseded NOTE but the only-available `'rejected'` STATUS
   (`rejected` + `applied_at` + exact note string — git-archaeology-confirmed unique write
   site) are relabeled `'superseded'` in the migration, so legacy rows stop counting as
   needs-response and history renders one vocabulary.
5. **Supersede sweep also runs on the update-in-place save path** — pre-039 production data
   holds stranded rows COEXISTING with a newer pending row (pre-039 saves never superseded);
   insert-only sweeping would never have healed exactly the rows that motivated this fix.
6. **`completeModuleReview` semantics preserved:** a review whose edits were all
   superseded/rejected (zero approved) now completes as `changes_requested`, not
   `'approved'`-with-nothing-approved (also fixes a latent pre-existing all-rejected variant;
   follow-up test for that variant register-noted).
7. **saveRetry finding-24 fix was initially dead code** — the crafted rejection was swallowed
   by its own chained `.catch` (unanimous adversarial verification with node simulations);
   now the two-argument `.then` form with a strengthened static pin.
8. **Fixture-drift root cause:** all 8 hand-rolled `segment_edits` fixtures omitted every
   constraint — the reason this bug class was invisible to a 2,100+-test suite. One canonical
   post-039 helper (`server/__tests__/helpers/segmentEditsSchema.cjs`) now backs them; 7
   revealed seed defects fixed intent-preserving (one vacuous assertion made real).

Final whole-branch review: 3-lens Workflow + 3-vote adversarial verification — 1 confirmed
important (item 7), 9 minors all addressed in the fix wave, 9 earlier task-review minors
triaged fine-as-is. Post-fix verification: all ten items implemented as specified, ready for PR.
