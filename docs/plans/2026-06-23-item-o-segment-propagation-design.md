# Item O — propagate a translation to recurring segments (MVP design)

**Date:** 2026-06-23
**Item:** O from [`2026-06-23-live-qa-followup-efni.md`](2026-06-23-live-qa-followup-efni.md) § O
(deferred from the QA follow-up; brought forward this session).
**Status:** Design approved (MVP scope + 3 decisions). **Build sequenced AFTER**
the terminology Unicode word-boundary fix (PR A). This is PR B.

## Problem

Recurring boilerplate segments — "By the end of this section, you will be able
to:", "Link to Learning", etc. — must be translated once per occurrence today.
An editor wants to translate one and **propagate it to all occurrences**
book-wide, with a clear "this changes it everywhere" confirmation.

## Existing foundation

The read-side already exists: `concordanceService.findRepetitions` detects, per
segment, when its EN recurs elsewhere and suggests an existing IS; the editor
shows a per-segment hint (`repetitionData`/`loadRepetitions`). What O adds is
the **write** direction.

Key architectural facts:
- Every write today is scoped to `(book, module_id, segment_id)`
  (`segmentEditorService`). There is **no cross-module write**.
- `tm_segments` (the concordance index) only holds segments with **both** EN
  and IS non-empty (`indexModule` skips untranslated) — so it cannot find
  untranslated occurrences, which are the high-value propagation targets.
- Edits live in `sessions.db` as `pending`; four-eyes approval and per-module
  "Vista + Birta" publish are unchanged.

## Decisions (approved)

1. **MVP**: propagate as normal **pending** edits + a confirm warning. No
   auto-approve, no auto-publish. Each copy still goes through approval and
   per-module publish.
2. **Conflict handling**: **skip + report**. Only create edits on occurrences
   with no pending/applied edit (or whose current text already equals the
   propagated text); skip occurrences with a conflicting edit and list them.
   Never clobber.
3. **Match scope**: **whole book, including untranslated** occurrences. Exact
   normalized-EN match via an **on-demand source scan** of the book's
   `02-for-mt` modules (no new always-maintained index). Bounded; runs only on
   the deliberate propagation click.

## Components

### New `server/services/propagationService.js`
Keeps cross-module logic out of the single-module `segmentEditorService`.

- `findOccurrences(book, enNorm, { excludeModuleId, excludeSegmentId })` —
  enumerate the book's chapters+modules (`segmentParser.listChapterModules` +
  `loadModuleForEditing`), return every segment whose `normalizeEn(en)` equals
  `enNorm`, each with `{ chapter, moduleId, segmentId, currentIs, existingEdit }`
  (existingEdit from `segment_edits`). Reuses `concordanceService.normalizeEn`
  (already lowercases — case/Unicode-robust).
- `classifyOccurrence(propagatedText, occurrence)` — **pure** (TDD core):
  - `'already-matches'` — current/pending IS already equals propagatedText → skip (no-op)
  - `'conflict'` — a different pending/applied edit exists → skip + report
  - `'eligible'` — otherwise → create a propagated edit
- `createPropagatedEdits(db, { book, editorId, editorName, propagatedText, category, note, occurrences })`
  — re-checks `classifyOccurrence` at write time, inserts a `pending`
  `segment_edit` per eligible occurrence (the cross-module write), provenance
  note (e.g. "Sjálfvirk fjölgun"). Returns `{ created: [...], skipped: [...] }`.
  Unit-testable via in-memory DB.

### Routes (`server/routes/segment-editor.js`, EDITOR role)
- `GET /:book/:chapter/:moduleId/propagation-preview?segmentId=` →
  `{ enNorm, eligible: [...], skipped: [...] }` (counts + lists for the dialog).
- `POST /:book/:chapter/:moduleId/propagate` (confirm-flagged) → calls
  `createPropagatedEdits`, returns `{ created, skipped }`.

### Editor (`segment-editor.js`)
A **manual "Beita víðar" (apply wider) button** in the edit panel — **not** an
automatic post-save scan. On click it ensures the current edit is saved, calls
propagation-preview for that segment, and if `eligible.length > 0` shows a
confirm dialog: "Þessi texti birtist á N öðrum stöðum — beita þýðingunni alls
staðar?" listing eligible + skipped. On confirm, POST propagate, then toast
"Fjölgað á N staði, sleppt M (þegar breytt)".

**Why a button, not auto-after-save (performance):** `findOccurrences` scans the
whole book (~218 modules) per call. Wiring it into every save would make every
ordinary para edit pay a full-book scan just to learn it does not recur. The
button shows for free (no scan) and confines the O(book) scan to the deliberate,
infrequent moment an editor chooses to propagate a segment they know is
boilerplate. This keeps the on-demand-scan design honest and works for any
segment type (incl. "Link to Learning"-style paras a type-heuristic would miss).

## Testing
- **Unit** (`propagationService`): `classifyOccurrence` all three verdicts;
  `createPropagatedEdits` creates for eligible, skips conflicts/already-matches,
  writes correct cross-module rows (in-memory DB).
- **E2E**: against real efnafraedi-2e boilerplate — save a recurring segment,
  confirm the dialog lists occurrences, propagate, verify pending edits appear
  on other modules and conflicts are skipped.

## Out of scope (YAGNI)
Auto-approve / auto-publish; fuzzy (non-exact) matching; cross-book propagation;
a standing source-occurrence index; bulk un-propagate/rollback (each copy is a
normal edit, revertible by existing means).
