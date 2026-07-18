# Item 15 — Localized Restore Parity (rem-2.2) — Design

**Date:** 2026-07-18
**Campaign item:** 15 (Phase 3, `docs/plans/2026-07-11-pre-semester-coding-campaign.md`)
**Scope sources:** audit backlog **rem-2.2** (`docs/audit/2026-07-11-server-code-review.md:793`:
"Localized (Pass 2) content has no version-history/restore feature — only raw filesystem
backups; the existing restore feature covers faithful-translation content only") + absorbed
register items **I12-R4**, **I12-M1**, **I12-M3**. Grounded by a 4-reader code map
(faithful template / localized writers / editor UI / historical constraints, 2026-07-18).
**Method:** one PR; `npm test` from repo root is the gate.
**Lead decisions (2026-07-18):** scope = Core parity triple + absorb I12-M1/M3/R4;
approach = `track` column on `content_versions` with one parameterized service (option A).

## 1. Theme

Unit 1 (#103) gave faithful (Pass-1) content the versioning triple — pre-write DB
snapshots, a restore API, a "Saga útgáfa" modal. Pass-2 localized content
(`04-localized-content/`) still has only timestamped `.bak` files. Item 15 extends the
same triple to localized content through the **same table and the same service**,
parameterized by a `track` discriminator — not a parallel implementation (one real code
path, per standing robustness feedback).

## 2. Verified current state (post-#300 main)

| Fact | Evidence |
|---|---|
| Exactly ONE writer of localized segment files | `segmentParser.saveLocalizedSegments(book, chapter, moduleId, segments)` (`segmentParser.js:383`) — `.bak` copy + atomic tmp+rename; **no DB snapshot**. Three callers: POST `/:book/:chapter/:moduleId/save` (`routes/localization-editor.js:406`), POST `.../save-all` (`:616`), `localizationReviewService.approveAndApply` (`localizationReviewService.js:248`). |
| `content_versions` is track-blind | Migration 031: no track column; `UNIQUE(book, module_id, segment_id, version)`; `snapshotModule`'s `MAX(version)` per (book, module_id). Localized snapshots would interleave with faithful under one counter — the schema must gain a discriminator first. |
| Faithful restore template | `contentVersionService.restoreVersion` — snapshot-current-first (reversible), rebuild aligned to current extraction (restored/kept/skipped, nothing deleted), write via `saveModuleSegments`, best-effort TM-regen + concordance-reindex hooks, `version_restored` activity. Route: `requireHeadEditor()` + `validateBookChapter` + `validateModule` + `{confirm: true}`. |
| Post-write hooks are faithful-only | TM regen (`tmService`) and concordance `indexModule` both consume FAITHFUL content (`loadModuleForEditing`). A localized restore must call **neither**. |
| Loc apply already has the item-13 invariant | `approveAndApply` builds from the CURRENT file baseline (`hasLocalized ? localized : faithful`) and overlays only the ONE newly-approved edit — previously-approved edits live in the file, never re-imposed from DB. A localized restore therefore survives subsequent approvals **with no apply-side change**. Direct-save uses the identical construction + mtime-409 + module lock. |
| Conflict machinery restore must compose with | `/save` and `/save-all` use `lastModified` vs `getLocalizedMtime` (409 on mismatch) + `acquireModuleLock`. `approveAndApply` takes neither (pre-existing; noted, unchanged). |
| Loc editor's existing "history" is NOT snapshots | `edShowHistory` popover renders the `localization_edits` audit log; its "Endurheimta" only copies text into the textarea client-side. No snapshot-before-write, no server restore, no module version list exists for Pass 2. |
| Localized corpus is EMPTY | 0 `*-segments.is.md` files under any book's `04-localized-content/` (checked 2026-07-18). No backfill script needed; no data-migration risk. (Faithful backfill's empty-segment filter predates F19 — must not be copied anyway.) |
| Layering constraint | `contentVersionService` requires `segmentParser` — so the snapshot hook cannot live inside `saveLocalizedSegments` (require cycle). The wrapper lives in `contentVersionService`. |
| Migration conventions | Current highest: 041 (its transactional-rebuild shape is the precedent); `migrationSchema.createIndexIfColumnsExist` for indexes; `migrationIdempotency.test` catches non-idempotency (#211). `chapter` INTEGER, `-1` = appendices (item-14 `chapterLabel` contract). |

## 3. Design

### 3.1 Migration 042 — `track` column

041-style transactional rebuild of `content_versions` guarded by a sqlite_master check:

- New column `track TEXT NOT NULL DEFAULT 'faithful' CHECK(track IN ('faithful','localized'))`.
- `UNIQUE(book, track, module_id, segment_id, version)` (replaces the 031 constraint).
- Indexes recreated (module + segment lookups now lead with `(book, track, ...)`) via
  `createIndexIfColumnsExist`.
- Existing rows copy through with `track = 'faithful'`. Idempotent re-run safe;
  registered in `migrationIdempotency.test`.

### 3.2 Service parameterization — one `contentVersionService`

Every exported function gains a trailing `track = 'faithful'` parameter (existing
callers unchanged): `snapshotModule`, `getModuleVersions`, `getVersionContent`,
`getSegmentHistory`, `restoreVersion`. All SQL adds `AND track = ?`; the version
counter is per (book, track, module_id).

Internal `TRACK_CONFIG`:

| | `faithful` | `localized` |
|---|---|---|
| loader | `loadModuleForEditing` | `loadModuleForLocalization` |
| current-content field | `seg.is` | `seg.hasLocalized ? seg.localized : seg.faithful` |
| writer | `saveModuleSegments` | `saveLocalizedSegments` |
| post-write hooks | TM regen + concordance reindex (unchanged) | **none** |

New wrapper — the single localized write path:

```
saveLocalizedWithSnapshot(book, chapter, moduleId, segments, actor)
  1. loadModuleForLocalization → current content
  2. snapshotModule(..., track='localized')   // records empties (F19); failure logged loud, non-fatal
  3. saveLocalizedSegments(book, chapter, moduleId, segments)
  → returns the writer's result (savedPath etc.)
```

All three write sites switch to it: `routes/localization-editor.js:406` (`/save`),
`:616` (`/save-all`), `localizationReviewService.js:248` (`approveAndApply` — the
snapshot slots in **before** the F3 write-then-mark sequence; that ordering itself is
untouched). Snapshot non-fatality matches the faithful apply hook's posture.

### 3.3 Restore semantics (localized branch)

`restoreVersion(book, chapter, moduleId, version, restoredBy, track='localized')`:

- Same core as faithful: load snapshot (throw if missing) → load CURRENT via the track
  loader → **snapshot current first** (restore is reversible) → rebuild aligned to
  current extraction (segment in both → snapshot content; current-only → keep current;
  snapshot-only → skip + warn; nothing deleted from history) → write via the track
  writer.
- **Composes with the conflict machinery:** takes `acquireModuleLock` around the write
  and returns the fresh `getLocalizedMtime` value so clients can update `lastModified`;
  an editor holding a stale token gets the existing 409 on their next save.
- **`localization_pending_edits` untouched:** pending drafts stay pending and remain
  approvable over the restored baseline (approval imposes only that one segment).
  Auto-superseding would destroy drafts and misuse 041's `'superseded'` semantics.
  Residual (→ register I15-R1): a pending row's `original_content` diff reads stale
  against a restored baseline — display/recompute decision, not solved here.
- Post-write hooks: none (see §2). Activity: same `VERSION_RESTORED` type with
  `metadata.track = 'localized'` (dashboard continuity, still distinguishable).

### 3.4 Routes (mirror faithful, under `/api/localization-editor`)

- `GET /:book/:chapter/:moduleId/versions` — module version list (EDITOR role).
- `GET /:book/:chapter/:moduleId/versions/:version` — one version's content (EDITOR).
- `GET /:book/:chapter/:moduleId/version-history/:segmentId` — per-segment snapshot
  history (EDITOR). Distinct path from the existing `/:segmentId/history`
  (`localization_edits` audit log), which stays as-is.
- `POST /:book/:chapter/:moduleId/restore/:version` — `requireHeadEditor()` +
  `validateBookChapter` + `validateModule` + integer version ≥ 1 + mandatory
  `{confirm: true}` body; response includes `snapshotVersion`, triage counts, and the
  fresh `lastModified`.

### 3.5 UI — "Útgáfusaga" in the localization editor

Port the `vh-overlay` modal pattern from segment-editor into
localization-editor.html/js: toolbar button in `.module-header` (next to
`#btn-save-all`), rendered only when `edIsHeadEditor()`; rows show version, segment
count, actor, timestamp; restore button → confirm dialog stating snapshot-first
reversibility → POST with `{confirm: true}` → toast naming `snapshotVersion` →
`edLoadModule(edCurrentModuleId)` refresh + `edLastModified` updated from the response.

### 3.6 Absorbed register items

- **I12-M1/M3:** new test pins `approveAndApply`'s full sequence
  (snapshot → file write → DB mark) and the write-succeeds-DB-throws branch (file
  changed, rows unmarked — the known residual is *observable* in the test, closing M3;
  M1's reject-after-partial posture is documented in the test's comment).
- **I12-R4:** pre-write snapshots mean "version N" is *the content as it was before
  save N happened* — "version 1 = my first change" is backwards. Fix the wording in
  **both** editors' modals: lead each row with `applied_at` + actor, and caption the
  modal "Hver útgáfa er efnið eins og það var **áður en** viðkomandi vistun átti sér
  stað" (exact IS phrasing at implementation). Close I12-R4 in the register.

### 3.7 Error handling

Snapshot failures on the save paths: logged loud, non-fatal (a failed snapshot must not
block an editor's save — parity with the faithful apply hook). Restore failures: loud —
throw/4xx/5xx, no partial state (lock released in `finally`). `track` values are
validated at the service boundary (unknown track → throw TypeError).

## 4. Testing

1. Migration 042 in `migrationIdempotency.test` (rebuild idempotent; CHECK + UNIQUE
   enforced; faithful rows preserved with `track='faithful'`).
2. Service: track separation — same module, both tracks, independent version counters;
   localized snapshot content field matrix (`hasLocalized` true/false, empty string
   recorded); TypeError on unknown track.
3. Localized restore round-trip on a temp fixture: seed → edit → restore → file content
   + `snapshotVersion` + skipped-segment triage asserted; restore-of-restore works.
4. `approveAndApply`: snapshot-before-write ordering + DB-throw branch (I12-M3).
5. Routes via the router.stack idiom: authz (EDITOR vs HEAD_EDITOR), confirm-flag 400,
   appendices chapter accepted (item-14 contract), fresh `lastModified` in restore
   response.
6. Conflict composition: save with stale `lastModified` after a restore → 409.
7. UI has no harness → manual-QA line (register I15-R2).

## 5. Out of scope → campaign register (I15-R1..R3)

- **I15-R1 `[ux]`** — pending-edit `original_content` diffs read stale against a
  restored baseline (drafts intentionally survive restore); display/recompute decision.
- **I15-R2 `[qa]`** — manual QA: history modal lists versions after saves; restore
  round-trips visibly; editor with stale tab 409s on next save; both editors' modal
  wording shows the I12-R4 fix.
- **I15-R3 `[note]`** — `approveAndApply` still takes no module lock and no mtime
  precondition (pre-existing, unchanged by this item; becomes more visible once restore
  exists).

## 6. Register interactions

- Implements audit backlog **rem-2.2** in full; absorbs **I12-R4**, **I12-M1/M3**
  (close them in the campaign register on merge).
- **I13-R1** note: post-restore, review-OFF stale-batch replays are stopped by the
  mtime 409; review-ON blast radius remains the editor's own pending row — restore does
  not widen it.
