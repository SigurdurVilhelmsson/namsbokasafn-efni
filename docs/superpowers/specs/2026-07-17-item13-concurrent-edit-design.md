# Item 13 — Concurrent-Edit Lost Updates (Batch 6) — Design

**Date:** 2026-07-17
**Campaign item:** 13 (Phase 3, `docs/plans/2026-07-11-pre-semester-coding-campaign.md`)
**Scope sources:** code-review findings 7, 8, 24 (`docs/audit/2026-07-11-server-code-review.md`,
Batch D) + editorial dims 5/7 + absorbed register entry **I12-R5** (preview/publish
approval-order divergence).
**Method:** one PR; `npm test` from repo root is the gate.

## 1. Theme

Every defect in this batch is a write winning by *accident of ordering* — arrival
order (finding 7), retry timing (finding 8), or approval order (I12-R5) — instead
of by a deliberate rule. The fix is one canonical rule, **newest saved content
wins**, wired into every path that picks a winner, plus honest conflict handling
where a winner cannot be picked silently.

## 2. Verified current state (post-#298 main)

| Item | State | Evidence |
|---|---|---|
| Finding 7 — loc cross-editor pending overwrite | **LIVE** | `localizationReviewService.js:92-116` — pending lookup keyed `(book, module_id, segment_id)` only; UPDATE replaces content **and** `editor_id`/`editor_username`/`created_at`. The mtime 409 can't fire (review-tier submits never touch the file, `localization-editor.js:319-334`); routes drop `submitEdit`'s `updated` flag. No unique index; status CHECK = `pending/approved/rejected` only (migration 034). No cross-editor test exists. |
| Finding 8 — stale save-retry replay | **LIVE** | `saveRetry.js:178-180` — success path never purges the key's queue entry nor cancels `activeTimers[key]`. `executeRetry` (`:117-162`) fires with its **closure's** item, never re-reading storage — a replaced entry's old timer still replays old bytes. `processQueue` replays ≤1h-old entries on page load. Server side: `checkEditConflict` deliberately ignores same-editor writes (`segmentEditorService.js:62`), so nothing catches the replay. Zero behavioral tests (static regex pins only, `clientMessageContracts.test.js`). |
| Finding 24 — conflict message drop | **ALREADY FIXED** (#270) | `saveRetry.js:217` reads `data.message \|\| data.error`; statically pinned (`clientMessageContracts.test.js:16-52`). Item 13 confirms + closes, no code. |
| I12-R5 — preview/publish divergence | **LIVE** | Preview `buildEffectiveSegments` (`segmentEditorService.js:251-264`) = highest-id-wins over live edits; apply (`:798-805`, `:864-871`) = `ORDER BY reviewed_at DESC, id DESC`, first-seen wins, **among unapplied rows only** — so approving an older edit after a newer one was applied overwrites the newer published content (auto-apply on review-complete, `routes/segment-editor.js:734-780`; explicit apply `:1116-1152`; Vista+Birta `:1159-1227`). F15 (#298) closed only the same-second tie. |

Related mechanics that constrain the design:

- Pass-1 saves **update pending rows in place** (`saveSegmentEdit`, `:116-148`):
  `created_at` refreshes, `id` does not. So highest-id ≠ newest content when an
  editor reloads (satisfying `baseEditId`) and re-saves their older row. Row `id`
  records *creation* order; `created_at` records *content* recency.
- Pass-1's one-pending-per-`(book,module,segment,editor)` invariant is enforced by
  a partial unique index (migration 039) and has a `'superseded'` status with an
  established supersede-on-save/at-apply vocabulary.
- Loc `approveAndApply` (F3, #298) writes the file FIRST, then marks
  approved+applied in a transaction — that ordering is load-bearing and untouched.
- saveRetry keys: `seg:{book}/{ch}/{module}:{segmentId}` (Pass-1 single save),
  `loc:{book}/{ch}/{module}:{segmentId}` (loc single save),
  `loc-auto:{book}/{ch}/{module}` (loc 60s autosave **batch**, per-module key).

## 3. Decisions (lead-confirmed 2026-07-17)

1. **Loc conflict model → full Pass-1 parity.** Per-editor pending rows; migration
   rebuilds the table with `'superseded'` in the CHECK + partial unique index;
   approve auto-supersedes older pendings and refuses (409) when a newer pending
   exists.
2. **Canonical winner rule → newest saved wins**: comparator `(created_at DESC,
   id DESC)` in one shared helper, used identically by preview and apply; apply
   becomes convergent.
3. **Pass-1 approve guard → yes**: approving an edit outranked by a newer
   *approved* edit is refused with a 409 (it could never publish); a newer
   *pending* edit does not block approval (review freedom).

## 4. Part 0 — Shared recency comparator

New module **`server/lib/editRecency.js`** (plain CommonJS like the rest of
`server/lib`):

- `isNewer(a, b)` → true when edit `a` is strictly newer than `b` by
  `(created_at, id)`; `created_at` compared as the TEXT `CURRENT_TIMESTAMP`
  values SQLite stores (lexicographic == chronological for that format), `id`
  breaks ties.
- `pickLatest(edits)` → the newest edit of a non-empty array (null for empty).

Lives in `lib/` because both `segmentEditorService` and
`localizationReviewService` consume it and the services must not import each
other. This is the single real code path for "which edit wins".

## 5. Part A — Localization per-editor pending rows (finding 7)

### Migration 041 (039-style rebuild)

- Rebuild `localization_pending_edits` with status CHECK
  `('pending','approved','rejected','superseded')`; copy all rows (every existing
  status remains valid); recreate the three existing indexes; add partial unique
  index `idx_loc_pending_one_per_editor` on
  `(book, module_id, segment_id, editor_id) WHERE status = 'pending'`.
- Follows migration 039's atomic-rebuild precedent; rides the existing
  `migrationIdempotency` harness (re-run must be a no-op).
- Existing data note: production could theoretically hold two pending rows for
  the same `(book,module,segment,editor)` only if pre-041 code allowed it — it
  does not (the unscoped lookup kept ≤1 pending per segment overall), so the
  unique index cannot fail on legacy data.

### `submitEdit`

- Pending lookup gains `AND editor_id = ?` (bind `String(editorId)` — the service
  stores stringified ids; keep coercion consistent on both lookup and insert).
- Same-editor re-submit updates in place exactly as today; a different editor's
  submit now INSERTs their own row. No client change needed.
- A lookup/insert race violating the unique index is practically impossible
  (better-sqlite3 is synchronous, single process); if it ever throws, the route
  500s loud — acceptable, no catch-and-retry.

### `approveAndApply`

Two additions, both inside the existing structure:

1. **Guard (before the file write):** if another pending edit on the same
   segment is *newer* than the one being approved (Part 0 comparator), throw
   `err.code = 'PENDING_EXISTS'` with an Icelandic message
   ("Nýrri breyting í bið er til á þessum bút — farið yfir hana í staðinn.").
   Route (`POST /loc-edit/:editId/approve`) maps `PENDING_EXISTS` → 409.
   Head-editors therefore resolve newest-first, mirroring Pass 1's idiom.
2. **Supersede on approve (inside the existing post-write transaction):** flip
   all *older* pending edits on the segment to `'superseded'`, stamping reviewer
   fields and note "Leyst úr gildi af nýrri samþykktri breytingu" (Pass-1
   vocabulary). The losing editor's work becomes honest history — not a bogus
   "rejected" signal, not a lingering queue item.

`rejectEdit`, the F3 write-first ordering, `.bak` snapshots, and the
review-queue/panel queries are untouched. `getModuleEdits` (badges) and
`getPendingByModule` (review panel) already return lists and tolerate multiple
rows per segment; implementation must verify the localization pane's badge
rendering tolerates the new `'superseded'` status value (add a neutral fallback
if it switches on status).

## 6. Part B — saveRetry stale-replay cancellation (finding 8)

### Semantics (three changes)

1. **Success purges:** `attempt()`'s `response.ok` path removes the key's queue
   entry and cancels+deletes its active timer before returning the parsed JSON.
2. **Fire-time identity check:** each queue entry gets a `qid` nonce at creation.
   When a retry timer fires, it re-reads the queue: proceed only if the entry for
   that key still exists **and** carries the same `qid`; otherwise abort silently
   (no toast — a superseded retry is a correct non-event). This closes the
   same-tab stale-closure race (old timer replaying a body a newer failed save
   already replaced) and the cross-tab case (another tab's success removed the
   entry; this tab's timer must not resurrect it). On fire, the retry uses the
   **stored** entry, not the closure copy.
3. **Queueing cancels the predecessor's timer:** adding an entry for a key clears
   any pending timer for that key first — exactly one live timer per key.

`processQueue` (page-load replay of surviving entries) is unchanged. Two tabs
both holding timers for the *same* entry may both fire — idempotent same-content
posts; accepted.

### Testability refactor (UMD + injectable deps)

`saveRetry.js` becomes UMD (browser global + `module.exports`), following the
`segment-validation.js` precedent from SR-OOS-2, with a factory
`createSaveRetry({ fetch, storage, setTimeout, clearTimeout, now, toast })`; the
browser wrapper instantiates with real deps so the public API
(`attempt/processQueue/pending/isRetryable/showToast`) and all behavior outside
the three changes above are byte-for-byte-intent identical. Vitest gains the
first *behavioral* suite for the queue: success-purge, stale-timer abort on qid
mismatch, replacement-cancels-timer, page-load replay, 1h expiry. The static
regex pins in `clientMessageContracts.test.js` are updated to match the moved
source (kept as static pins — their target, message-priority and the two-arg
`.then`, is unchanged; the new behavioral suite covers what regexes cannot).

### Documented residual (register, not fixed)

A queued `loc-auto:` per-module **batch** can replay one stale segment after a
newer per-segment (`loc:…`) save succeeded — different keys, so cancellation
can't see across them, and rewriting a queued batch's body from another key's
success is a layering violation not worth its complexity today. Backstops:
review-OFF replays carry the stale `lastModified` and hit the existing mtime
409; review-ON the stale write touches only the same editor's own pending row
(post-Part-A), window ≤1h, and requires the tab to close before the next 60s
autosave tick. → campaign register.

## 7. Part C — Convergent apply + preview alignment (I12-R5)

### `buildEffectiveSegments`

- Winner per segment picked via Part 0's comparator (was: pure highest-id).
- Docstring corrected: it deliberately includes `pending`/`discuss` edits (its
  consumers — spellcheck, terminology report — need draft state), so the honest
  phrasing is "the draft state once everything live is approved", **not** "what
  apply would write". The pending-vs-approved difference is a *filter*
  difference; the *comparator* is now shared.

### `applyApprovedEdits`

- Winner selection per segment runs over **all** `status='approved'` rows —
  applied and unapplied — using the comparator; all winners are overlaid on the
  file. Invariant after any apply: **the faithful file equals "newest approved
  content per segment"**, regardless of how approvals interleaved with applies.
  - Approval-order inversion can no longer regress content: an older edit
    approved after a newer one was applied is marked `'superseded'` (existing
    "Leyst úr gildi…" idiom, `applied_at` stamped as today) instead of published.
  - `appliedCount` = winners newly stamped `applied_at`; `supersededCount`
    reported as today. If every unapplied row loses to an already-applied newer
    row, the apply still proceeds (idempotent rewrite of identical content) and
    returns `appliedCount: 0` with the supersede counts — no new route mapping
    needed.
  - Already-applied rows that *lose* to a newer applied winner keep their
    current status (resolved history; unchanged from today's cross-batch
    behavior).
- Everything else stays: the zero-unapplied pre-check with its
  throw/rebuild-recursion path (route 400s depend on the messages), IMMEDIATE
  transaction, pre-write snapshot, write-verify, stale-segment warning.
- F15's test stays green (same-second tie → higher id, both created same
  second).

#### Amendment (2026-07-17, final review)

The "all winners are overlaid on the file" sentence above (and the invariant
"the faithful file equals *newest approved content per segment*") is
**superseded**. Winner selection still spans **all** `status='approved'` rows —
that is what supersedes an older late approval (I12-R5) — but the FILE overlay
writes **only the winners whose `applied_at` is still null** (the newly-applied
work). Overlaying already-applied winners silently reverted Unit-1 "Saga útgáfa"
restores (`contentVersionService.restoreVersion` rewrites the faithful file
without touching `segment_edits`) and manual faithful-file fixes on every
subsequent apply, with no neutralization path (`unapproveEdit` refuses applied
edits). Corrected invariant: **the faithful file equals its own already-applied
baseline for untouched segments, with each segment's newest *not-yet-applied*
approved edit overlaid.** `appliedCount` = newly-applied winners (unchanged); the
step-5b sample-verify samples from newly-applied winners only, skipping the
in-file check when there are none. (Final-review finding, lead-adjudicated
2026-07-17.)

### `approveEdit` guard

- Before approving, if a **newer approved** edit (comparator; applied or not)
  exists on the segment, throw a coded error (`SUPERSEDED_BY_NEWER`) with an
  Icelandic message ("Nýrri samþykkt breyting er þegar til á þessum bút.");
  route `POST /edit/:editId/approve` maps it → 409. Approving while a newer
  *pending*/*discuss* edit exists stays allowed; `rejected`/`superseded`
  neighbors never block.

## 8. Part D — Finding 24 closure

No code. Verify the #270 fix + static pin are present (they are), then record
finding 24 as closed in the campaign doc alongside this item's ship note.

## 9. Error handling summary

| Path | Signal |
|---|---|
| Loc approve vs newer pending | `PENDING_EXISTS` → 409 + Icelandic message |
| Pass-1 approve vs newer approved | `SUPERSEDED_BY_NEWER` → 409 + Icelandic message |
| Superseded retry timer fires | silent abort (correct non-event) |
| saveRetry success | purge queue + cancel timer, then resolve as today |
| Unique-index violation on loc submit race | loud 500 (practically unreachable) |

## 10. Testing

New:
- `localizationReviewService`: cross-editor submit preserves both rows (the
  exact missing test the audit flagged); same-editor upsert still updates in
  place; approve supersedes older pendings; approve refused (PENDING_EXISTS) on
  newer pending; route-level 409 mapping.
- Migration 041: picked up by the existing `migrationIdempotency` harness;
  legacy-row copy test if the harness doesn't already cover data survival.
- `editRecency`: comparator units incl. the in-place-re-save case (older id +
  newer `created_at` wins) and same-second tie → id.
- `applyApprovedEdits`: approval-order inversion (approve newer first, apply,
  then approve older, apply → file still holds newer; older row superseded);
  apply idempotence (second apply is a no-op rewrite); preview/apply agreement
  on the same fixture.
- `approveEdit` guard: 409 on newer approved; allowed on newer pending.
- `saveRetry` behavioral suite (new factory harness): success-purge, stale-timer
  abort, replacement-cancels-timer, replay, expiry.

Kept green: F15 same-second test, `segmentEditConflict` suite,
`localizationSaveBackstop`, `clientMessageContracts` static pins (updated to the
moved source), full suite via `npm test` from repo root.

## 11. Out of scope (register candidates)

- Cross-key `loc-auto:` batch replay residual (§6) — documented, backstopped.
- e2e cleanup key mismatch: `editor-lifecycle.spec.js` removes localStorage key
  `'save-retry-queue'` but the real key is `'saveRetryQueue'` — the cleanup is
  dead code today. One-line test-hygiene fix; may ride this PR.
- SR4-F3 (400 `violations` payload never rendered by panes) — untouched.
- Pre-existing mtime-409 spurious fire after any `approveAndApply` (file mtime
  changes) — noted, unchanged.
- Loc badge shadowing: with per-editor rows, the newest row's badge may shadow
  another editor's on the same segment in the module badge view — cosmetic;
  verify during implementation, register if real.

## 12. Sizing

M. One PR: 1 migration + 1 new lib + 2 services + 1 route mapping ×2 + 1 client
module refactor + tests.
