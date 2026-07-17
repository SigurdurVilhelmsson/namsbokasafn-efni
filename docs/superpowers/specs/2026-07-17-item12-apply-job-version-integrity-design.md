# Item 12 — Apply / job-model / version-history integrity (design)

**Campaign:** `docs/plans/2026-07-11-pre-semester-coding-campaign.md` Phase 3, item 12
("Batch 5 — apply/job/version integrity", absorbs register B4-F5).
**Source findings:** `docs/audit/2026-07-11-server-code-review.md` findings 3, 5, 6, 15, 16, 19
(audit Batches B + C minus finding 14, which shipped as a PR #270 rider) +
`docs/audit/2026-07-11-editorial-workflow-review.md` §6 rec #5 second half (B4-F5).
**Verification:** all seven findings re-verified **present** on current main (`bc0117e6`,
2026-07-17) by a 7-agent adversarial fan-out (run `wf_f99deb26-a86`); every file:line below is
current-main, not audit-era. Two adjacent defects surfaced during verification are scoped in
(§8 deletion decision, §2 auto-fetch rider).

**Lead decisions (2026-07-17, this session):**
1. `POST /:book/:chapter/apply-all` — **delete the route** (dead code: zero callers in client
   JS / views / tests / e2e / scripts; three latent defects). One real code path remains
   (per-module apply / apply-and-render), per the standing robustness feedback.
2. Approach A — surgical batch + same-class riders, one PR, **no schema migration**
   (rejected: persistent job model = YAGNI at this scale; audit-five-only = leaves known
   same-class siblings in the same files).

**One PR.** `npm test` from repo root is the authoritative gate.

---

## 1. Fix F3 — localization approve-then-write order

**Defect (current):** `localizationReviewService.approveAndApply` (:205–250) marks
`status='approved'` (:212–219) *before* `loadModuleForLocalization` (:222, throws if the
faithful file is missing) and `saveLocalizedSegments` (:232–237); `applied_at` is stamped
last (:240–242). No transaction anywhere in the file — each `.run()` autocommits. Both
`approveAndApply` (:209) and `rejectEdit` (:257) guard on `status === 'pending'`, so a
write failure strands the row as approved-but-never-applied: invisible to the pending queue
(`getPendingByModule` :159, `getReviewQueue` :173), un-actionable via API forever, and
showing a misleading "approved" badge via `getModuleEdits` (:148).

**Design:** reorder to write-then-mark:

1. Load edit + `status === 'pending'` guard (unchanged).
2. Build segment list + `saveLocalizedSegments` — the un-rollbackable file write happens
   **first** (it already snapshots the prior file to `.bak` internally).
3. One `conn.transaction(() => { ... })()` setting `status='approved'`, reviewer fields,
   `reviewed_at`, **and** `applied_at` together.

Failure semantics: a file-write throw leaves the edit `pending` — visible, retryable,
rejectable. A DB-fails-after-file-write residue is benign and self-healing: the edit stays
pending; a retry rewrites identical bytes (documented in a code comment). `rejectEdit`
unchanged. Keep the `_setTestDb` seam and `getDb()`'s conn (tests inject the DB).

Rationale for ordering (not a rollback catch): better-sqlite3 transactions roll back rows,
never a completed fs write — so do the un-rollbackable step first and commit the DB facts
after it succeeds. This converges on the faithful side's proven pattern
(`applyApprovedEdits` write→verify→mark inside one IMMEDIATE tx, segmentEditorService.js
:857–:967).

Concurrency note: the whole path is synchronous (better-sqlite3 + sync segmentParser I/O),
so the event loop serializes concurrent approvals; no additional lock is designed in. The
plan must verify this synchronicity claim before relying on it (if any step turns out
async, adopt the faithful side's IMMEDIATE-tx serialization instead).

**Deploy note:** one-line prod sanity query before/at deploy for pre-existing stranded rows
(expected zero — localization is barely used):
`SELECT COUNT(*) FROM localization_pending_edits WHERE status='approved' AND applied_at IS NULL;`
Any hits are resolved by hand (lead call: flip back to `pending` or stamp `applied_at`
after eyeballing the file).

---

## 2. Fix F5 — pipeline jobs get `book`

**Defect (current):** job objects (`spawnJob` :358–370, hand-rolled in `runPipeline`
:268–283 and `runGenerateTm` :847–860) carry no `book`; `hasRunningJob(chapter, type)`
(:439–446) matches on chapter+type only — chemistry ch3 falsely blocks biology ch3.
In-memory only (`jobs` Map, :29); `MAX_JOBS=5` global; `runFetchSource` (:756–764) smuggles
the book as `moduleId: slug` with `chapter: null`.

**Design:**

- Job objects gain `book` (every creator — `runExtract`/`runInject`/`runRender`/
  `runPipeline`/`runGenerateTm`/`runFetchSource`/`spawnJob` — already receives `book`
  as a parameter; threading is mechanical). `runFetchSource` **keeps** `moduleId: slug`
  for display compatibility and additionally sets `book: slug`.
- `hasRunningJob(book, chapter, type)` — strict equality on all three. Strict equality
  preserves the non-uniform chapter values in live use: numbers (inject/render/pipeline),
  `null` (fetch-source), `'all'` (whole-book generate-tm), `'appendices'`.
- Thread all **7** surviving call sites (the 8th, segment-editor.js:1260, dies with
  `apply-all` §8): pipeline.js :74/:124/:174 (`params.book`), segment-editor.js :1174
  (`req.params.book`), admin.js :329 (`req.params.slug`), publicationService.js :213/:347
  (`bookSlug`). Fetch-source dedupe thereby becomes **per-book** (the audit's stated
  intent — global serialization was incidental).
- **Rider (adjacent defect, this verification):** the book-registration auto-fetch path
  (admin.js:261 → `runFetchSource`) performs **no** duplicate-job check at all — give it
  the same `hasRunningJob(book, null, 'fetch-source')` guard the manual fetch route has.
- `listJobs` (:423–434) gains an optional `book` filter; `GET /api/pipeline/jobs` passes
  a `book` query param through when present.

**Deliberately out of scope (→ register):** `GET /api/pipeline/jobs` / `GET /jobs/:jobId`
read-scoping — any head-editor currently sees every book's jobs (read-only info leak, same
class as B1-F5; do not churn read-authz in this PR). Job persistence across restarts
(rejected Approach B).

**Test impact:** `new-features.test.js:48–49` calls 2-arg `hasRunningJob(99, 'inject')` —
update. New tests: cross-book non-blocking (book A ch3 running ≠ block book B ch3),
same-book still blocking, fetch-source per-book dedupe, auto-fetch guard.

---

## 3. Fix F6 — check-then-apply in apply-and-render

**Defect (current):** `POST /:book/:chapter/:moduleId/apply-and-render`
(segment-editor.js :1158–1214) calls `applyApprovedEdits` (:1167) **before**
`hasRunningJob` (:1174). On 409 the edits are applied-but-unrendered; the client
(public/js/segment-editor.js :1965–1971) alerts total failure and discards `err.data`; a
retry then 400s ("All approved edits have already been applied", service :852 → route
:1209–1211). Published HTML silently trails the approved translation.

**Design:** hoist the `hasRunningJob` check (with fix F5's `(book, chapter, type)`
signature) above the apply. The 409 body drops the now-nonexistent `applied` field
(nothing pins it — verified). After the hoist a 409 truthfully means "nothing applied —
retry shortly", so the client's existing alert becomes accurate with **no client change**.
The residual check→launch TOCTOU window equals the publish route's accepted posture
(publicationService.js :213–222). The plain `apply` route (:1116) has no pipeline
interaction — untouched.

**Register note:** optional client polish (surface `err.data.jobId` / offer wait-retry) —
deliberately not in this PR.

---

## 4. Fix F15 — same-second approval tie-break

**Defect (current):** both load-bearing apply queries — the pre-check
(segmentEditorService.js :793–800) and the in-transaction re-query that determines the
published winner (:859–866) — use `ORDER BY reviewed_at DESC` with no tie-break;
`reviewed_at` is `CURRENT_TIMESTAMP` (1 s precision, set at :397/:421/:445/:709). First
row per segment wins (:876–884); the loser is **permanently** superseded (:948–950;
`unapproveEdit` throws once applied). The preview path already tie-breaks by highest id
(`buildEffectiveSegments` :253–257, `e.id > cur.id`), so preview and publish can disagree
on a tie. Reachable: migration 039's partial unique index constrains only *pending* edits
per editor — two editors' approved-unapplied edits for one segment coexist; also
single-editor via edit-again + two same-second approvals.

**Design:** `ORDER BY reviewed_at DESC, id DESC` at :798 and :864 — `id DESC` matches
`buildEffectiveSegments`' highest-id-wins convention (align the tie-break only, **not**
the broader selection semantics — preview deliberately also considers pending/discuss).

**Riders (display-only, same class):** the two listing queries `dashboardReadModel.js:124`
and `routes/my-work.js:117` get the same secondary sort for deterministic UI ordering (no
supersede consequence there; this is cosmetic determinism).

**Tests:** same-second tie — two editors, equal `reviewed_at`, assert the higher id wins
*and* agrees with `buildEffectiveSegments`. Keep the existing backdated clear-newer test
(segmentEditorService.test.js :853–899) as-is.

---

## 5. Fix F16 — restore triggers the reindex apply already does

**Defect (current):** `restoreVersion` (contentVersionService.js :174, write at :223) ends
with activity-log + `log.info` only. The apply path performs exactly two post-write steps
restore skips (segmentEditorService.js :995–1009): `tmService.scheduleTmRegen(book)`
(debounced, fire-and-forget, never throws) and `concordanceService.indexModule(book,
chapter, moduleId)` (synchronous, replaces the module's `tm_segments` + FTS rows, fails
soft). Until the next apply, concordance search, exact-match reuse, propagation matching,
and the committed TMX (pushed by the 2 h cron) all serve the just-discarded text.

**Design:** in `restoreVersion`, immediately after the successful `saveModuleSegments`,
add both calls, each in its own `try/catch` with `log.error` — best-effort, never fail the
restore (mirror apply's exact posture and comments). Service placement (not route): parity
with where apply does it; single production call site either way
(routes/segment-editor.js:1363). Verified: adding `require('./tmService')` +
`require('./concordanceService')` to contentVersionService creates **no** require cycle.
(Apply's third post-write step — the linguisticReview status auto-advance — is
deliberately not mirrored: restore rewrites an existing faithful file; it doesn't change
review state.)

**Tests:** restore triggers `indexModule` (assert `tm_segments` rows reflect restored
content) and schedules TM regen (existing `tmService._setRunner` / `_pendingBooks` seams).

---

## 6. Fix F19 — snapshot empty segments

**Defect (current):** `snapshotModule` (contentVersionService.js :65–74) skips falsy
content (`if (seg.content)`), so empty segments never enter a snapshot. Restore treats
absent-from-snapshot as keep-current (:204–211) — an undo of a restore keeps the restored
text instead of returning the segment to empty. An all-empty module mints a **phantom
version**: zero rows, number returned and logged (:82, :242), invisible to
`getModuleVersions`, "Version N not found" on use, number silently reused.

**Design:** guard becomes `seg.content != null`. Both live callers already normalize to
`seg.is || ''` (apply :913, restore's pre-snapshot :193), so `''` rows are inserted and
the schema (`content TEXT NOT NULL`, migration 031:17) accepts them; a `null`/`undefined`
from a hypothetical bad caller throws in better-sqlite3 — fail-loud, batch-4-consistent.
The phantom-version edge resolves automatically ('' rows make all-empty versions real).
The backfill script pre-filters trimmed-empty modules itself (backfill-content-versions.js
:120–122) and is unaffected. Keep the shared-connection pattern (6th param `db` — the
apply path passes its own `conn`; a second connection deadlocks, documented at
contentVersionService.js :43–46).

**Tests:** snapshot records `''` rows; restore-then-undo returns a segment to empty;
all-empty module produces a listable, restorable version. (No existing test pins the
falsy-skip — verified.)

---

## 7. Fix B4-F5 — `applied_by` attribution on apply snapshots

**Defect (current):** schema has the column (migration 031:19), `snapshotModule` has the
5th param `appliedBy` and inserts it (:49, :61–62), restore passes
`username || String(userId) || 'system'` (:175–176, :193–199) — but apply passes **`null`**
(segmentEditorService.js :916) and `applyApprovedEdits(book, chapter, moduleId)` (:789)
accepts no actor, so no route *can* pass one. "Saga útgáfa" renders '—' for every
apply-created version (public/js/segment-editor.js :2065 already renders the field).

**Design:** `applyApprovedEdits(book, chapter, moduleId, options = {})` with
`options.appliedBy` (username **string**, mirroring restore's format), threaded:

- through the internal faithful-file-missing rebuild recursion (:843) — same options;
- into the snapshot call (:916), replacing `null`;
- at all three surviving route call sites: :753 (review-complete auto-apply — the
  completer's identity, currently attribution-free), :1124 (apply), :1167
  (apply-and-render). Each derives the string as
  `req.user?.username || (req.user?.userId != null ? String(req.user.userId) : null)` —
  the same precedence restore's *service* applies to its `restoredBy` object (:175–176);
  the derivation lives at the route because `applyApprovedEdits` takes a plain string,
  not an actor object. (:1235 dies with §8.)

Missing/absent option ⇒ `null` (current behavior; used by any legacy/internal caller).
The snapshot call's non-fatal posture (:915–919 catch → log → continue) is **unchanged**.
No schema, read-side, or UI change.

**Tests:** apply → `content_versions.applied_by` = acting username; auto-apply via
review-complete → completer's username; recursion path preserves attribution.

---

## 8. Deletion — `POST /:book/:chapter/apply-all` (lead-approved)

**Evidence:** zero callers — no client JS, no views, no tests, no e2e, no scripts (grep
2026-07-17: only the route's own definition, its JSDoc header line, generated route docs,
and historical audit mentions). Three latent defects: applies all modules then **silently
skips** the render when any job is running (:1260) returning `success:true, jobId:null`;
no activity log anywhere in the route; no attribution.

**Design:** remove the route (:1220–1283) + the header JSDoc line (:30); regenerate
`docs/_generated/routes.md` via the docs script (CI docs-check — the #209 lesson). The
tmService debounce comment mentioning bulk apply-all (tmService.js:7) is updated to not
reference a deleted route as live behavior. If a bulk flow is ever needed it will be
rebuilt deliberately with the guarantees above.

---

## 9. Error-handling posture (whole PR)

No new silent catches. Mutations fail loud (batch-4 posture). Side-effects
(audit/reindex/snapshot/TM regen) stay best-effort with `log.error`. `activityLog.log` is
called **bare** — never wrapped in caller try/catch (`activityLogCallsiteGuard.test.js`
enforces this statically; its contract is internal-never-throw since batch 4).

## 10. Testing strategy

Extend existing suites in place (no new harnesses): `localizationReviewService.test.js`
(F3: write-failure → still pending → retry succeeds; success path sets status+applied_at
atomically), `new-features.test.js` (F5: 3-arg signature, cross-book/same-book/fetch
dedupe/auto-fetch guard), route-level F6 test reusing `segmentEditBackstop.test.js`'s
router-mount pattern (409 before any apply — assert no `applied_at` stamped, no file
write), `segmentEditorService.test.js` (F15 tie; B4-F5 attribution incl. recursion),
`contentVersionService.test.js` (F19 round-trips; F16 reindex triggers). Deletion: assert
the route 404s. Gate: full `npm test` from repo root.

No migration ⇒ no `startup.test.js` pin changes (pins verified current: 40 migrations,
hardcoded require array in `server/services/migrationRunner.js` :32–73).

## 11. Register additions (campaign doc, on ship)

- `GET /api/pipeline/jobs` + `GET /jobs/:jobId` read-scoping: any HE sees all books' jobs
  (B1-F5 class, read-only leak) — deferred deliberately.
- Client polish: apply-and-render 409 could surface `err.data.jobId` / wait-retry UX.
- Deploy sanity query for stranded localization rows (§1).
- Editorial rec #6 ("Saga útgáfa" version-numbering disambiguation — versions are
  *pre-write* snapshots; two-minute UI check before any code) — adjacent to this batch,
  not absorbed; noting here so it isn't lost.

## 12. Out of scope

Persistent job store (Approach B, rejected); read-authz churn on job listings (§2);
client-side 409 UX (§3); campaign item 13 (concurrent-edit lost updates — findings 7/8/24,
own item); item 15 (localized restore parity — Pass-2 version history, own item; F3/F16
here touch neither `content_versions` semantics for localization nor any Pass-2 history).
