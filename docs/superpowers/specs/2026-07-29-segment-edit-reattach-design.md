# Segment-edit re-attach for the C16 clean break (design)

**Date:** 2026-07-29 · **Register item:** C16 (P1, `[CODE]`) in
[`docs/plans/2026-07-21-post-item17-followup-campaign.md`](../../plans/2026-07-21-post-item17-followup-campaign.md)
· **Baseline:** main `ae0e3fb0`

---

## 1. What this is for

C16's clean break retires the Markdown/Matecat-era markers by **re-extracting and
re-translating** chemistry, which regenerates `02-for-mt` and `02-mt-output` on the current
bracket format. Re-extraction can renumber segments, and `segment_edits` is keyed on
`(book, module_id, segment_id)` — so the editorial work must be captured before the break and
re-attached after it.

**This design covers only that re-attach.** It does not decide whether the clean break happens,
what it costs, or in what order chemistry and the other books are done. Those are C16 scoping
questions and remain a lead call.

## 2. What was verified against the tree (2026-07-29)

Every claim below was measured, not inherited. The design rests on these and on nothing else.

| # | Claim | Evidence |
|---|---|---|
| 1 | Editorial work is **4 modules, all chemistry** | `03-faithful-translation` holds segment files for `m68663`, `m68664` (ch01), `m68699`, `m68700` (ch03). The other four books have **zero** faithful files and **zero** `.locked` markers. |
| 2 | **62 segments** differ from their MT baseline | Per module: `m68663` 2/11 · `m68664` 44/72 · `m68699` 2/3 · `m68700` 14/274. ⚠️ **Measured on disk, so this is the *applied* work only.** Prod's `sessions.db` may additionally hold `pending`, `discuss` and `rejected` rows that never reached a faithful file. **The export is the authority; 62 is a floor, not a total** — do not size the review pass from it until the snapshot has been taken. |
| 3 | **90% of edits key on a source-derived id** | Of the 62: **56** carry a CNXML source element id (`m68663:para:fs-idp32962032`), **5** a positional-within-type id (`abstract-item-1`), **1** a global positional id (`auto-2`). |
| 4 | Source element ids **cannot drift** | They come from `books/*/01-source/`, which is read-only by project rule (CLAUDE.md § *File Permissions*, and the `source-write-guard` test). |
| 5 | Re-extraction **will** change output | `tools/cnxml-extract.js` changed 2026-07-12, 07-13 and twice on 07-16 (the `processExercise` MC-option fix, +68 segments on biology ch03). All four modules were extracted before that: `m68663` 2026-03-02, `m68699` 2026-03-21, `m68664` 2026-03-22, `m68700` 2026-07-07. |
| 6 | The EN side is stale too, so **re-extract is required** — re-MT alone is not enough | 108 of 170 chemistry `02-for-mt` files still carry `{{…}}` markers. Re-translating a stale EN file reproduces stale markers on the IS side. |
| 7 | Edited text is **mixed-format** | `m68700`: 5 `{{i/b}}`, 4 `{{term/fn}}`, **115** `[[bracket]]`, 1 markdown shape. `m68664`: 5 markdown shapes. `m68699`: 1 bracket. `m68663`: none. |
| 8 | A `{{term}}` → `[[term:]]` rewrite is **lossy** | `{{term}}x{{/term}}` carries no id; the current form is `[[term:x\|id]]` with the id recovered from the extraction sidecar. A mechanical rewrite yields a valid but **id-less** marker where a fresh extraction yields an anchored one. |
| 9 | `saveSegmentEdit` re-establishes the **MT edit-lock** | `server/services/segmentEditorService.js` writes the `.locked` sibling when a module's first `segment_edits` row is inserted. |
| 10 | The 4 modules are currently locked | Exactly 4 `.locked` markers exist repo-wide, one per edited module. |
| 11 | A missing faithful file is an **already-modelled** state | `getApplyStatus` reports `can_rebuild` when a module's faithful file is absent (remediation Unit 4). |

## 3. Scope

**In scope.**
- Two one-shot scripts: an export that snapshots the editorial state before the break, and a
  re-attach that restores it after (§6–§9).
- The **sequencing constraints** the migration must run under — preconditions (§4), host split
  (§5), and publication regeneration including the slug map (§12). These are not code, but they
  are decisions the plan must encode, and the slug map is a deliverable that exists only if it is
  captured at one specific moment.

**Out of scope, deliberately.**
- Any change to `cnxml-extract.js`, `api-translate.js`, `cnxml-inject.js` or `cnxml-render.js`.
- Removing the `!hasApiMarkers` back-compat from `cnxml-inject.js`, and the corpus tripwire that
  should ship with it. That is the *prize* for completing the clean break and a separate PR with
  its own review — see §13 for why it comes after, not with.
- Fixing C9's prune-on-rename. §12.1 sidesteps it for this migration by regenerating from empty;
  it does not repair the underlying render-pipeline defect.
- English-text matching, fuzzy matching, or any heuristic that infers which segment an edit
  belongs to. See §7.
- A reusable tool. These are one-shot migration scripts (lead decision, 2026-07-29).

## 4. Preconditions — hard gates

The migration must not start until all four hold. Each is verifiable.

1. **⚠️ The off-box DB backup (A2) exists and a restore has been tested.** After re-MT, the
   snapshot is the only representation of 62 segments of human work outside a gitignored SQLite
   file on one host. A2 has been deferred as "correct, not a bug" because `/api/health` reading
   *degraded* is accurate — that reasoning holds while nothing is being migrated, and this is
   the case it was queued against.
2. **The editorial server is stopped.** The lead takes the editor offline for the window, so
   there are no concurrent `segment_edits` writes and no reader can observe a half-written
   `02-mt-output`. This is what lets the design ignore concurrency entirely.
3. **The `git-backup.sh` cron is paused.** It commits `books/` from prod every 2 hours while
   the file work happens on dev; left running it would commit a half-migrated tree.
4. **A fresh `sessions.db` copy is taken with the server stopped.** The DB runs in WAL mode, so
   use `VACUUM INTO` or `sqlite3 .backup` rather than `cp` — a plain copy of a WAL database can
   omit committed data.

## 5. Topology

Only the re-attach is pinned to prod, because `sessions.db` exists nowhere else. The paid,
long-running, file-rewriting work runs on dev where a failure is cheap to retry.

| Step | Host | Note |
|---|---|---|
| Pause cron · stop server · A2 verify | prod | preconditions §4 |
| `export-segment-edits.js` | prod | read-only |
| re-extract → re-MT → re-inject → re-render | dev | paid, long-running |
| delete the 4 faithful files | dev | see §5.1 |
| commit + push | dev | |
| `git pull` — **no restart** | prod | content is read from disk per request; a real deploy is A4-gated |
| `reattach-segment-edits.js --db` | prod | writes `sessions.db` |
| restart server · resume cron | prod | |

### 5.1 The faithful files must be deleted

They hold old-extraction content under old ids. Left in place, `loadModuleForEditing` reads
them as the baseline and shows the editor old text against new English. Deleting them makes it
fall back to the fresh `02-mt-output`, which is the intended baseline for the review pass. The
system already models this state (evidence #11), and the content is preserved in the snapshot
and in git history.

## 6. `export-segment-edits.js`

```
node scripts/export-segment-edits.js --book <slug> --modules <id,id,…> --out <path>
```

Read-only. Emits one JSON file:

```jsonc
{
  "schema": 1,
  "takenAt": "<ISO-8601>",
  "book": "efnafraedi-2e",
  "mainCommit": "<git rev-parse HEAD>",
  "modules": ["m68663", "m68664", "m68699", "m68700"],
  "edits": [
    {
      // every segment_edits column, verbatim
      "id": 123, "chapter": 1, "module_id": "m68664",
      "segment_id": "m68664:para:fs-idp32962032",
      "original_content": "…", "edited_content": "…",
      "category": null, "editor_note": null,
      "editor_id": "…", "editor_username": "…",
      "status": "approved", "created_at": "…", "applied_at": "…",
      "reviewer_id": "…", "reviewer_username": "…", "reviewer_note": "…",
      // context captured for the human-readable report only — never for matching
      "context": { "en": "…", "mtAtSnapshot": "…" }
    }
  ]
}
```

**Every row for those modules is exported, whatever its status.** The enum is
`pending · approved · rejected · discuss · superseded` (there is no `applied` status —
application is recorded by the `applied_at` timestamp on an `approved` row). Exporting only the
applied ones would silently drop an editor's in-flight work, and that failure has no symptom.

`context.en` and `context.mtAtSnapshot` exist so the report in §7 can show a human what an
unmatched edit was made against. **They are not used for matching** and must not become a
fallback later without a new design decision.

## 7. `reattach-segment-edits.js`

```
node scripts/reattach-segment-edits.js --snapshot <path> [--db]
```

Dry-run by default; `--db` writes. Follows the convention of `backfill-mt-locks.js` and
`backfill-appendix-sections.js`.

**Matching is exact `(module_id, segment_id)` against the new extraction. There is no fallback.**
Found → restore. Not found → report and skip. An edit attached to the wrong segment is far worse
than one not attached, and at most 6 of 62 are at risk (evidence #3). No matching heuristic is
introduced, so none can be mistrusted later.

**Restored rows are `pending`.** The re-MT replaced the draft each edit was reviewed against, so
every restored edit lands on a baseline no one has approved it against. The editor re-confirms
in the normal interface — a review pass, not re-entry — and four-eyes is preserved.

**⚠️ Not every exported row is restored. Status decides, and the asymmetry is deliberate:**

| Snapshot status | Restored? | Why |
|---|---|---|
| `approved` (incl. applied) | yes → `pending` | live editorial work; needs re-confirmation against the new draft |
| `pending` | yes → `pending` | in-flight work; unchanged in meaning |
| `discuss` | yes → `pending`, note preserved | the question still stands against the new draft; the reviewer note is prepended to `editor_note` so it is not lost |
| `rejected` | **no** — report only | restoring it as pending would resurrect something a head editor deliberately turned down |
| `superseded` | **no** — report only | history, already replaced by a later row |

Exporting them all and restoring a subset is the point: the snapshot stays a complete record,
while only live work re-enters the queue. The report states both counts, so the difference is
visible rather than inferred.

**⚠️ `saveSegmentEdit` treats `editedContent === originalContent` as a withdraw** — it writes no
row and returns `reverted: true`. After a re-MT this can genuinely happen: the new draft may
already say what the editor had written. That outcome is *correct* — no edit is needed — but it
must be counted and reported as **converged**, never left to look like a silent loss. Without
this, the restored count would not reconcile with the snapshot count and the gap would be
unexplained.

**Writes go through `saveSegmentEdit()`, not a hand-rolled INSERT.** That is the load-bearing
choice: it re-establishes the MT edit-lock (evidence #9), and it carries the supersede sweeps
and the acceptance-supersede invariant that a parallel INSERT would have to reimplement and keep
in sync. One real code path.

Per call:

| Field | Value |
|---|---|
| `originalContent` | the **new** MT text, so the editor's diff view is meaningful |
| `editedContent` | the snapshot's `edited_content`, **verbatim** |
| `editorId` / `editorUsername` | from the snapshot — attribution survives the status reset |
| `editorNote` | retired-marker flags (below), then the old MT text, then any original note |
| `category` | from the snapshot |

**Retired markers are flagged, never rewritten.** Where `edited_content` carries `{{i}}`,
`{{b}}`, `{{term}}`, `{{fn}}` or a markdown shape, the note names which — so the ~14 affected
segments surface during the review pass. Rewriting is rejected because it is lossy for
`term`/`fn` (evidence #8) and because the correctly-anchored new baseline is sitting beside the
edit for the editor to work from.

### Report

Both modes print, and `--db` mode also writes beside the snapshot:

- **restored** — count, and per module
- **converged** — the new draft already matched the edit, so no row was needed
- **not restored by status** — `rejected` and `superseded`, counted separately
- **unmatched** — every one, with module, old segment id, `context.en`, and the edit text
- **flagged** — which restored edits carry retired markers, and which
- **modules missing entirely** — see §8

**The counts must reconcile**: `snapshot rows = restored + converged + not-restored-by-status +
unmatched`. The script asserts this and fails if it does not hold — an unexplained gap is the
one outcome that would let work disappear quietly.

## 8. Failure handling

- **Dry-run is the default.** `--db` is the only way to write.
- **Per-module transaction.** A mid-run failure cannot half-write a module.
- **Any unmatched row ⇒ non-zero exit.** A skip must never read as a clean run to a wrapper.
- **A whole module missing from the new extraction is fatal, not a skip.** That means
  re-extraction failed, which is a different problem from an id shift, and continuing would
  silently discard every edit for that module.
- **The snapshot is never modified**, so the whole run is repeatable.
- A malformed or unreadable snapshot fails before any write.

## 9. Testing

Unit:
- exact-id lookup: present → restore; absent → skip
- **status routing**: `approved`/`pending`/`discuss` restore; `rejected`/`superseded` do not
- **convergence**: an edit whose text equals the new MT is counted, not lost
- **count reconciliation** fails loud when the four buckets do not sum to the snapshot total
- retired-marker detection across all five classes, including a segment with none
- `editor_note` composition, order, and preservation of an existing note and reviewer note
- `originalContent` is the **new** MT text, not the snapshot's `original_content`

Integration, against a temp DB and a fixture module:
- restored rows land on the right ids, with `status = 'pending'` and original attribution
- **the `.locked` marker is re-written** — a relied-upon side effect, so it needs its own pin
- a whole-module miss exits non-zero without writing

⚠️ **The load-bearing test — write it to assert the report FIRES.** For the unmatched case,
assert that the report names that specific segment id. Asserting "no row was written" passes
vacuously if the script died before it started writing, which is exactly the shape of the
non-vacuity traps recorded in project memory.

⚠️ Mutation-check the pins: delete the reporting line and confirm which test goes red.

## 10. Risks

| Risk | Mitigation |
|---|---|
| Prod's cron commits a half-migrated tree | Precondition §4.3 — cron paused for the window |
| An editor writes to `sessions.db` mid-migration | Precondition §4.2 — server stopped |
| The only copy of the editorial work is lost | Precondition §4.1 — A2 stood up and restore-tested first |
| More than 6 edits fail to match | Report and skip; the run is repeatable and the snapshot is intact. If the count is high, stop — it means extraction changed more than expected, and that is a scoping question, not a script bug |
| Retired markers get approved back in | Flagged in `editor_note`; the review pass is where they are caught |

## 11. Open question for the lead

**The other four books have no editorial work and no locks** (evidence #1), so their clean break
needs no re-attach at all — only re-extract, re-MT, re-inject, re-render. Whether they are done
in the same window as chemistry or separately is a scoping decision, not a design one.

⚠️ **"All books" is smaller than it sounds, and that is the argument for doing this now.**
Only chemistry is meaningfully extracted; the others are 10–40 modules of 159–342:

| Book | Extracted | Source modules |
|---|---|---|
| `efnafraedi-2e` | 170 | ~149 *(count includes chapter-metadata and appendix files)* |
| `lifraen-efnafraedi` | 40 | 342 |
| `liffraedi-2e` | 13 | 259 |
| `orverufraedi` | 12 | 159 |
| `edlisfraedi-2e` | 10 | 283 |

**The un-extracted majority needs nothing** — it will be extracted by today's code and is born on
current markers. The legacy debt is bounded at the ~245 modules extracted today, not the
~1,200-module corpus this becomes. That bound only grows.

---

## 12. Publication regeneration — sequencing and the slug map

Re-MT re-translates section **titles**. Titles become slugs, slugs become output filenames. This
interacts with an open defect and must be sequenced deliberately.

### 12.1 Clear the publication tracks; do not render on top

**C9's prune-on-rename is still unfixed on efni's side**, so a renamed section leaves its old
rendered file in place. This is not hypothetical: `books/efnafraedi-2e/05-publication/mt-preview/chapters/10/`
currently holds **both** `10-5-fast-astand-efnis.html` and `10-5-fastur-efnishamur.html` for the
same module. Regenerating 335 published files on top of the existing tree would multiply that.

**Therefore: delete each book's `05-publication/<track>/` before re-rendering it.** The
regenerated tree is then authoritative by construction — every file present was produced by this
run, and nothing survives from a previous naming.

**This closes one of C9's three efni tasks as a side effect.** Vefur can *detect* the ch10
duplicate but deliberately cannot repair it, because nothing authorises it to choose between two
`mt-preview` translations. A wholesale regeneration never has to choose; it rebuilds only the
current one, and the stale file is gone.

### 12.2 ⚠️ Capture the old filenames FIRST — they are the slug map

The durable cross-repo rule is that prune-on-rename **must emit an old-slug → new-slug map**:
vefur needs it to serve redirects, and since its PR #200 the old filename no longer exists on its
side to derive one from. **A clear-and-regenerate destroys those names permanently.**

So, before deleting anything under `05-publication/`:

```bash
find books/*/05-publication -name '*.html' | sort > <artifact>/published-filenames-before.txt
```

After the re-render, the same command produces the "after" list. The pair **is** the slug map:
names present before and absent after are renames or removals, and vefur's redirect work reads
from it. This costs one command, and it is the only moment the old names exist.

⚠️ The map is a *deliverable of this migration*, not a nice-to-have. Without it, every inbound
link and search result pointing at a renamed section 404s with no way to reconstruct the target.

### 12.3 Reader delivery stays manual and separate

Re-rendering changes only efni's disk. Readers see nothing until the vefur sync runs, which is
`[LEAD]` and manual. Two standing rules apply unchanged: a clean `sync-content.js` exit is **not**
evidence there are no duplicates — read the output — and a deploy is verified by fetching
`/content/<book>/chapters/<NN>/<file>.html`, never a page URL.

---

## 13. What the clean data unlocks — and what makes it stick

The migration's purpose is not tidiness; it is to make a deletion safe.

**Two distinct goals with different prerequisites:**

| Goal | Needs clean data? |
|---|---|
| **Delete** the Markdown-era converters and the `hasApiMarkers` guard | **Yes.** Remove them while data still carries those markers and those modules inject wrongly. |
| **Fix** C16(a)'s correctness bug | **No** — the guard could instead read `*-provenance.json` rather than sniffing translated text. |

The second is an escape hatch, and taking it would leave retired code in `cnxml-inject.js`
permanently. Clean data is what makes the first available, which is why this migration comes
first and the code change is a separate PR.

**⚠️ The deletion PR must also make clean *stay* clean.** Achieving a clean corpus once is not
the same as keeping it: with the handling code gone, a future import carrying retired markers
would produce silently wrong output. That PR should therefore ship a **corpus tripwire** — the
same shape as `tools/__tests__/source-write-guard.test.js` — that fails the suite if any segment
file under `02-for-mt/` or `02-mt-output/` contains a retired marker class. A static test turns
"we cleaned it" into "it cannot regress unnoticed", and it is the guard that lets the ~300 lines
go with confidence.

**Sequence:** this migration → verify the corpus is clean → tripwire + deletion PR. Each step is
verifiable before the next begins, and none of them is reversible by accident.
