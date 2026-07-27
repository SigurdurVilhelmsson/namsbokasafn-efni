# C10 — closure-audit resurrections (R1, R2, R4)

**Register:** `docs/plans/2026-07-21-post-item17-followup-campaign.md` § C10 — the live status owner.
**Evidence (frozen, do not edit):** `docs/audit/2026-07-26-closure-audit{,-evidence}.md`.
**Branch:** `fix/c10-closure-audit-resurrections` · **Baseline:** `main a35a21a6`.

**Scope:** R1 (P1), R2 (P1), R4 (P2). Explicitly **out**: R3 (withdrawn false positive — do not
implement), R5–R7 (homed in item 23), R8 (homed in A4 PR-1 carve-out (a)).

---

## R2 · `tmCreated` is an orphan stage that silently blocks DB-side advancement

### Verified facts

| Claim | Verification |
|---|---|
| Nothing advances `tmCreated` | `grep advanceChapterStatus` → 6 call sites, stages `extraction`, `mtReady`, `mtOutput`, `linguisticReview`, `injection`, `rendering`. `tmCreated` absent. |
| The gate throws | `pipelineStatusService.js:161-172` — `BASE_STAGES[4]='tmCreated'`, `[5]='injection'` ⇒ every `transitionStage(…,'injection','complete')` throws. |
| The throw is swallowed | `pipelineService.js:744-746` `catch (err) { log.error(…, 'Auto-advance status failed'); }`. |
| The suite works around it | `server/__tests__/pipelineStatus.test.js:104-117` hand-completes `tmCreated` in a loop. |
| **TM is not a real prerequisite for injection** | `grep -n "tm/\|'tm'\|generate-tm\|tmx" tools/cnxml-inject.js` → **0 hits**. Injection reads `03-faithful-translation/`, never `tm/`. |
| The TM producer is chapter-blind | `tmService.defaultRunner` spawns `generate-tm.js --book <book>` — **book-level, no `--chapter`** — and is debounced + fire-and-forget (`regenerateTm` never throws). |

### Decision — make it non-blocking; do **not** wire an advance

"Wire an advance from the TM path" is rejected on three independent grounds:
1. **No per-chapter event exists.** The regen is book-level; synthesizing per-chapter completion
   would mark `tmCreated` complete for chapters with zero faithful segments (a false status),
   and would itself have to satisfy the `linguisticReview` prerequisite or throw and be swallowed again.
2. **The source path cannot report failure.** `regenerateTm` deliberately never throws; hanging a
   status advance off it re-creates a silent-failure channel.
3. **A missing licence row makes the regen silently warn-only stale** (register I21-R2) — so
   "TM was created" would be unverifiable exactly when it matters.

A stage that gates a step it has no causal relationship with is the defect. Fix the model.

### Design

`tmCreated` stays in `STAGE_ORDER`, `ALL_STAGES`, `BASE_STAGES`, the `stages` response object, the
JSON schema and `status.json` — it is a real, reportable side-deliverable. What changes is that it
no longer participates in **sequencing**:

- New `NON_SEQUENTIAL_STAGES = new Set(['tmCreated'])` with a comment stating the causal reason.
- `transitionStage` prerequisite walk: step backwards past non-sequential stages to find the real
  prior gate (`injection`'s prerequisite becomes `linguisticReview`). If none remains, no prerequisite.
- `getChapterStage` `currentStage`: skip non-sequential stages when picking the first non-complete
  stage, so a chapter no longer pins at `tmCreated` forever.

Deliberately unchanged (enumerated so the next reader need not re-audit):

| Reader | Why unchanged |
|---|---|
| `pipelineStatusService.js:100-101` (`stages` object) | `stages.tmCreated` must stay in the API response. |
| `:249-251` (`revertStage` reverse scan) | Explicit `tmCreated` transitions still work; a never-complete stage is simply never the revert target. |
| `:391` (`syncStatusJsonCache`) | Keeps writing `tmCreated` into `status.json`; schema stays satisfied. |
| `ALL_STAGES` / `transitionStage:137` validation | `'tmCreated'` remains a **valid** stage — callers that set it explicitly keep working. |
| `constants.js:34-42` `PIPELINE_STAGES` | A different (filesystem-scan) read model. Out of scope. |
| `routes/status.js:1313/1401-1412/1626`, `bookRegistration.js:1043/1143-1159/1266` | The independent filesystem-scan read path, keyed on `tm/chNN/<section>.tmx` — a layout `generate-tm.js` does not produce (it writes `tm/<book>-<date>.tmx`). That is `ed-drift-e` (R5–R7 → item 23), not R2. **Noted, not touched.** |

One-line docs correction in passing: the schema description at `chapter-status.schema.json:70`
still says "via Matecat Align", a tool retired from this pipeline.

### Tests (TDD — write first, must go red on `main`)

1. **The oracle:** complete `extraction…linguisticReview`, then `injection` **without touching
   `tmCreated`** → succeeds. (Red today: *"Cannot complete injection: tmCreated must be complete first"*.)
2. `currentStage` skips `tmCreated`: with everything through `linguisticReview` complete and
   `tmCreated` not started, `currentStage` is `injection`, **not** `tmCreated`.
3. Non-regression: `stages.tmCreated` is still present in the response.
4. Non-regression: an explicit `transitionStage(…, 'tmCreated', 'complete')` still works
   (it is still a valid stage, and still needs `linguisticReview`).
5. Non-regression: the real chain still gates — `injection` before `linguisticReview` still throws,
   naming `linguisticReview`.
6. The pre-existing loop-based test (`:104-117`) stays, unmodified, as proof explicit
   `tmCreated` completion did not break.

---

## R1 · Apply writes the faithful file inside a transaction that can still roll back

### Verified facts

`applyTransaction` (`segmentEditorService.js:923`) currently ends:

```
step 4b  contentVersionService.snapshotModule(…, conn)      ← DB
step 5   segmentParser.saveModuleSegments(…)                ← FILE (atomic rename)
step 5b  write verification (throws only if the write failed)
step 6   markApplied / markSuperseded loops                 ← DB
step 7   acceptanceService.lapseDrifted / stampApplied      ← DB
         COMMIT
```

Three DB steps plus the commit sit **after** an irreversible file write with no file-side unwind.
Sharpest residue (the register's own framing): the step-4b `snapshotModule` row rolls back *after*
the file advanced, so the pre-apply content never enters version history and is invisible to
"Saga útgáfa" — recoverable only from the timestamped `.bak` by hand.

### Decision — reorder; do **not** add a `.bak` compensator

A file-side unwind is rejected:
- `saveModuleSegments` writes a **timestamped** `.bak`; machine-selecting "the right one" is a
  heuristic over a directory listing, and two applies in the same minute collide on the filename.
- The apply path is already **self-healing**: `applied_at` is stamped only after the write and
  re-read as the retry gate (`const overlay = winner && winner.applied_at === null`), so a rollback
  leaves winners unapplied and the next apply re-writes byte-identical content. A compensator would
  fight that convergence.
- It contradicts the house idiom — the localized track writes *outside* the transaction with the
  comment "The file write is the one step a SQLite transaction cannot roll back"
  (`localizationReviewService.js:238`).

### Design

Move every DB mutation **above** the write, so the file write is the last mutation before commit:

```
step 4b  snapshotModule                                     ← DB
step 5   markApplied / markSuperseded                       ← DB
step 6   lapseDrifted / stampApplied                        ← DB
step 7   saveModuleSegments                                 ← FILE  (last mutation)
step 7b  write verification — throws ONLY when the write itself failed
         COMMIT
```

**Why the reorder is behaviour-preserving:**
- `lapseDrifted(book, moduleId, segments, conn)` and `stampApplied` are **DB-only** —
  `acceptanceService.js:290-292` documents "the exact bytes the caller wrote, so no disk re-read".
  The only file-reading acceptance function, `writeReviewStatusSidecar`, runs *after* commit and is untouched.
- `winnerIds` and `sampleEdit` are filtered on the **in-memory** `approvedLookup` objects read at
  step 3; `markApplied` updates DB rows, not those objects. Their `applied_at === null` values are
  unaffected by running the UPDATEs first. (Comment this — it is the coupling a future edit could break.)
- Their relative order (lapse → stamp) is preserved.

Window shrinks from "3 DB steps + commit" to "commit only", and — the register's named harm — the
version-history snapshot now commits or rolls back **together with** the file's advance.

**Honest residue, to be stated in the PR body, not hidden:** the window is not zero. A COMMIT
failure (SQLITE_FULL/IOERR) after a successful write still diverges; and the
`written.length === 0` branch is the one case where the file *did* change while the DB rolls back
to "nothing applied". Both are benign — the next apply re-writes the same content.

### Tests (TDD)

1. **Atomicity oracle:** inject a throw at the commit boundary and assert the faithful file and the
   `content_versions` snapshot agree — i.e. no state where the file advanced but no version row
   exists. Simplest deterministic form: force a throw from a stubbed
   `acceptanceService.stampApplied` and assert the faithful file is **unchanged** (today it has
   already been overwritten at that point).
2. Ordering pin: `markApplied`/`stampApplied` observably precede the file write.
3. Non-regression: a normal apply still stamps `applied_at`, supersedes losers, lapses drifted
   acceptances, writes the file, and returns the same result shape.

---

## R4 · `blockedIssues` saturates at 10

`routes/status.js:297-298` — `getDiscussEdits(10).length` is a count taken off a `LIMIT ?` row list.

**Fix:** add `countDiscussEdits()` (a real `SELECT COUNT(*) … WHERE status='discuss'`) to
`segmentEditorService`; the route uses it for the count and `getDiscussEdits(5)` for the items
(it already slices to 5).

**Sibling sweep (checked, no fix needed — recorded so it is not re-audited):**
- `routes/status.js:279` `pendingReviews` uses `dashboardReadModel.getAdminHeadlineCount()` — a real count. Correct.
- `routes/status.js:798` (`limit 20`) and `:963` (`limit 50`) use the result as a **list**, not a
  count. Both are silently-truncated lists, which is a display choice, not this defect.

**Test:** with 12 `discuss` edits, `blockedIssues === 12` (red today: `10`).

---

## Gate

`npm test` from the repo root is authoritative. Whole-branch adversarial review before the PR.
Closing R1/R2/R4 = editing **§C10 of the register**; the audit ledger is frozen evidence.
