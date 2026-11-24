# Serving the Fable layer to chemistry's editors (DESIGN, approved 2026-11-24)

> ✅ **DESIGN, APPROVED BY [USER] 2026-11-24, as written, the Icelandic wording of §6.10 included.** Written the same
> day from [USER]'s answers in that day's design conversation. **Banner-frozen from approval: amended only by dated
> notes.** Not status: open work and
> its state live in the active register's ⏩ RESUME block.
>
> **Implements:** `docs/decisions/2026-11-24-editors-start-from-fable-text.md` (its "Code", "The layer's data" and
> "The 8 segments" consequences, and the G1.13 consequence, which it leaves for this spec to propose).
> **Changes:** the G1.1 served-version design's §5.2 layer list and §5.9 event vocabulary
> (`docs/superpowers/specs/2026-11-03-served-version-and-event-log-design.md`); the G1.7 manifest's inputs
> (`docs/superpowers/specs/2026-11-19-g17-freeze-and-mt-lock-design.md` §6.4) through a re-cut under its §6.6;
> G1.13's assign gate (`server/services/assignmentGate.js`), superseding ruling R6 of
> `docs/decisions/2026-11-03-research-capture-consent-and-retention-rulings.md`, by
> `docs/decisions/2026-11-24-assign-gate-waits-on-fable-layer.md`.

> ✏️ **AMENDED 2026-11-24, after approval** ([USER] accepted both of Claude's recommendations on the two questions
> the builder check raised):
> 1. **Segments that already hold human text when a unit opens keep it as their starting text, with no meaning flag
>    and no comparison, and the offline analysis leaves them out.** The editor already shows an in-flight edit
>    (pending, or approved and not applied) in place of the served text (`baselineTextFor` in
>    `server/public/js/segment-editor.js`); chemistry has such rows by design (the register's 2026-10-25 entry:
>    122 approved, unapplied rows, plus the June re-entries). Fable edited the MT under them without seeing them,
>    so a flag there would describe a change to text the editor is not looking at. **The list is G1.23 §6.3a's
>    snapshot, which already exists:** `module_opening_inflight`, written once at the serve that records the unit's
>    opening (`moduleOpenings.recordOpening`) and read by `moduleOpenings.readOpening` (occurrence `-1` means every
>    occurrence of that id). After the opening step in the module GET, a segment in that snapshot gets
>    `fableMeaning = null`. **Before a unit has an opening recorded, no segment carries a flag** (fail-closed: no
>    snapshot, no flags). The comparison route (§6.9) refuses a suppressed segment like an unflagged one. When the
>    apply hold (§C203) lifts, those approved edits replace Fable's text on their segments; that is the intended
>    outcome (human text wins). The analysis reads the same snapshot, which the research export already carries
>    as reference data (R3/A1 of `docs/decisions/2026-11-03-research-capture-consent-and-retention-rulings.md`).
> 2. **Chemistry's `mt-preview` track stays on pure MT.** Rendering and publishing (`publicationService`,
>    `pipelineService`) keep mapping `mt-preview` to `02-mt-output`. The setting of §6.3 decides only what the
>    editor serves; "nothing else decides the layer" (§6.3) means nothing else in the editing path. Putting Fable's
>    text in front of readers is a publication decision, outside this design.
> 3. **Settled by Claude:** the six `refused-markers` segments that carry a `meaning` tag show the base with no flag,
>    as §6.1 and §11 already say.

## 1. What this is for

[USER] ruled on 2026-11-24 that chemistry's editors start from Fable's edit of the frozen MT, that pure MT stays
frozen underneath, that the term pass is no longer shown, and that Fable's tags become highlights, at least its
meaning changes. The whole-book Fable run is done and committed (`experiments/fable-editor-trial/runs/` and
`results/`, PR #809): every chapter has an answer, ch10 from the trial's step 3.

Today the editor serves only `02-mt-output` (or `03-faithful-translation` once a unit has approved text), and
nothing in `books/` holds Fable's text. This design makes Fable's text a tool-written layer under `books/`, serves
it, flags its meaning changes, and moves the gates that depend on what is served. It must all land before the first
chemistry unit opens; none had on 2026-11-24.

## 2. What [USER] decided (2026-11-24)

1. **What editors see of Fable's work.** Only on segments Fable tagged `meaning`: a flag, and on request a
   comparison of the text Fable started from with Fable's text. Every other segment shows Fable's text with no
   marker, whatever its tags.
2. **What the study records.** Whether an editor kept, reverted or rewrote a flagged change is computed afterwards
   from the layers and the final text; nothing new is captured for it. **One new research event** is recorded when a
   consenting editor opens the comparison, because that fact cannot be recovered later.
3. **The assign gate.** Chemistry chapters may be assigned only when the loader's layer for `efnafraedi-2e` is the
   Fable layer. R6 (assign only after the suggestion view is on) is superseded by
   `docs/decisions/2026-11-24-assign-gate-waits-on-fable-layer.md`.
4. **The approach (§5): A**, a complete layer at `books/efnafraedi-2e/02-mt-fable/`, with a per-unit provenance
   file and tags file, a loader that fails closed, and one book-to-layer setting.
5. **Claude's calls, accepted in the conversation** (listed again in §11): ch11 m68783 comes from the re-send; the
   8 re-requested segments serve Fable's Icelandic and are named in the provenance; the 38 `refused-markers`
   segments serve the MT with no marker; ch10 comes from step 3; the comparison is a word-level diff; the Icelandic
   wording is drafted here for [USER]'s approval.

## 3. What was measured (2026-11-24)

- **The loader** (`server/services/segmentParser.js`, `loadModuleForEditing`): a two-way fallback,
  `03-faithful-translation` if the unit's file exists, else `02-mt-output`, with `isSource` `'faithful'` or
  `'mt-output'`. It never reads `02-mt-selected` or `02-mt-revised`. Nothing chooses a layer per book. A segment
  missing from the IS file is served as `is: ''`, `hasTranslation: false`. Chemistry has no faithful files, so
  every unit is served `mt-output`.
- **G1.1** (`server/services/servedVersions.js`, `servedEdit.js`; migration 053): rows in `served_text_versions`
  carry `layer TEXT NOT NULL CHECK (layer IN ('mt-output', 'faithful', 'selected'))`, part of the unique key. Rows are
  minted on serve and on save. A save is refused `STALE_BASE` when the loader's current text no longer hashes to the
  base the page was served.
- **G1.7** (`server/scripts/study-freeze.js`; manifest `books/efnafraedi-2e/freeze/freeze-efnafraedi-2e-2026-11-22/`):
  per unit it hashes the English, the MT file, the faithful file and the layer-2 change log; per segment, the served
  en/is hashes. `compareToManifest` reports "served text changed, inputs unchanged" when served text moves while
  the files do not, and `server/__tests__/studyFreezeGuard.test.js` fails on it. The freeze marker
  (`tools/lib/mt-lock.cjs`) is keyed to the `02-mt-output` path.
- **G1.23** (`server/services/suggestionView.js`): offers a term-pass group only if the segment's served base hash
  equals its first change record's `beforeSha256`, a hash of pure MT. On a Fable base every group is withheld.
- **G1.13** (`server/services/assignmentGate.js`): a study book refuses assignment with `suggestion-view-off` while
  the `suggestion-view` switch is off. Production had it off on 2026-11-24, so no chemistry chapter could be assigned.
- **The research log** (`server/lib/researchVocabulary.js`): a closed `EVENT_TYPES` list; a new value is a spec
  amendment.
- **Module openings** (`server/services/moduleOpenings.js`): store no served hash; nothing detects a change of
  served text after an opening except `STALE_BASE` per save and the freeze guard.
- **Fable's output** (`experiments/fable-editor-trial/`): the prompt (`prompt-v1.md`) returns only changed segments,
  each with its whole text and one or more tags (`terminology`, `grammar`, `fluency`, `meaning`, `register`,
  `punctuation`); no free-text note. `compare.mjs report` writes each run's `fe-layer/<m>-segments.is.md` (complete
  files: Fable's text, or the base where Fable left a segment out or its edit was refused) and `segments.jsonl` (per
  segment: `en`, `mt`, `fe`, `status`, `tags`, `markerProblem`). Fable read the base through `readBase`
  (`tools/lib/mt-layers.js`), i.e. layer 1 with the `02-mt-selected` overlay, and the **current** English: the
  runner accepts only one English difference from its pinned inputs, the G1.12 removal of later repeats
  (`readPinnedInputs`, `experiments/fable-editor-trial/lib.mjs`).
- **The run's counts:** 18,816 segments, 7,517 edited, 1,388 tagged `meaning`, 38 `refused-markers`; ch11's
  m68783/001 was truncated and the module re-sent (run `20261124T160650Z-80e6dd69`).

## 4. Goals, non-goals, anti-goals

**Goals**
- Every chemistry study unit opens on Fable's text, exactly the text in the committed run records.
- Pure MT (`02-mt-output`) and the term pass (`02-mt-revised`) stay untouched, as research layers.
- A meaning change is visible and checkable; nothing else Fable did is marked.
- Serving, the served-version rows, the freeze manifest and the assign gate all agree on which layer is served.
- A reader of a paper can reconstruct the layer from the committed run records.

**Non-goals**
- Other books. The setting is per book; only `efnafraedi-2e` is set.
- Changing Fable's text. The layer is exactly the run's output; no hand edits, no re-runs.
- Computing kept/reverted live. That is analysis, done offline from the layers and the final text.
- Showing term-pass suggestions. The ruling withdraws them for chemistry.

**Anti-goals** (failure even if it works)
- **A unit served pure MT after the change, silently.** That mixes two baselines in one study. Every gap fails
  closed.
- **Served text changing without a re-cut.** The manifest and the served text must move together.
- **A marker on every edited segment.** 43% of segments were edited; [USER] chose a quiet page.
- **The comparison nudging editors back to MT by default.** It opens only on request, only on flagged segments.

## 5. Approaches considered

1. **A. A complete layer, one file per unit, under `books/efnafraedi-2e/02-mt-fable/` (chosen).** The loader
   swaps a path; the freeze hashes one whole file per unit, as it does for the MT; integrity comes from the
   provenance hashes, the freeze guard and a writer test that every untagged segment equals its base.
2. **B. A sparse overlay of the changed segments only, each tied to its base hash**, like `02-mt-selected`. Smaller,
   and each entry checks itself, but the loader would assemble every served text from overlays (today it applies
   none), and the 8 re-requested segments would sit on an overlay of an overlay. Not chosen.
3. **Reuse `02-mt-revised/`.** It holds the term pass, which the ruling keeps as research data and G1.23's
   references read; its change records are single find→replace edits that Fable's rewrites do not fit. Rejected.
4. **Serve from `experiments/…/results/`.** The ruling asks for a tool-written layer under `books/` with
   provenance; Fable's text is a derivative of the book and belongs under its licence, not the MIT path; production
   should not read experiment folders. Rejected.

## 6. Design

### 6.1 The layer: `books/efnafraedi-2e/02-mt-fable/<chapterDir>/`

A **TOOL-WRITTEN DATA** layer (CLAUDE.md § File Permissions): written only by its tool (§6.2), never by hand, never
regenerated in place, never deleted to reset. One directory per chapter, `ch00`…`ch21` and `appendices`, and per
unit three files:

- **`<m>-segments.is.md`** — the served text: the same format as `02-mt-output` (SEG markers, as
  `segmentParser.parseSegments` reads them), complete: every segment of the unit, holding Fable's text where Fable
  changed it and its edit was used, else the base Fable read. Byte-identical to the corresponding run's
  `fe-layer/<m>-segments.is.md`, except ch11 m68783, which comes from the re-send's.
- **`<m>-fable.json`** — provenance (`format: "mt-fable/1"`):
  - `book`, `chapter`, `module`;
  - `runs`: the run id(s) the unit's text came from, each with its request keys, and for ch11 m68783 both runs, the
    one used and the one not used, with the reason;
  - `model`, `effort`, `max_tokens`, `prompt` (path and sha256), `rulingSet`, `harnessCommit`, `anthropicVersion`,
    copied from the run's `run.json`;
  - `base`: what Fable read: `layer1` (`02-mt-output` file sha256 and the commit the run read it at),
    `overlay` (`02-mt-selected` file sha256, or null), and `en` (the `02-for-mt` English sha256);
  - `rerequested`: the segment ids whose base is the `02-mt-selected` overlay rather than layer 1 (the 8 segments of
    commit `61b1ec511`, in m68744, m68852 and m68856; empty elsewhere);
  - `counts`: segments, changed, tagged `meaning`, `refused-markers`;
  - `files`: sha256 of the unit's `segments.is.md` and `tags.jsonl`;
  - `writtenBy`: the tool and its commit.
- **`<m>-tags.jsonl`** — one line per segment whose served text differs from its base, in document order:
  `segmentId`, `occurrence`, `tags` (Fable's, as returned), `before` (the base text Fable edited, exactly),
  `beforeSha256`, `afterSha256`, `run` and `requestKey`, and `rerequested` (boolean). A `refused-markers` segment has
  no line (its served text is its base).

### 6.2 The writer: `tools/promote-fable-layer.js`

- **Input:** the committed run records under `experiments/fable-editor-trial/runs/`, and a committed **chooser
  table** (`experiments/fable-editor-trial/layer-sources.json`): chapter → run id, plus module-level overrides
  (ch11 m68783 → `20261124T160650Z-80e6dd69`). ch10 → `20261123T215036Z-63b1603d`.
- **What it does:** rebuilds each unit's served text from the run's responses with the trial's own code
  (`compare.mjs`'s parse, marker check and `feLayerText`), not by copying `results/`; checks it is byte-identical to
  the run's committed `fe-layer` file (the override module against the re-send's); writes the three files.
- **Refuses:** an existing file with different bytes (no overwrite; a deliberate rewrite is a re-cut, §6.6); a run
  whose `run-end.json` is not `complete`; a unit with any unanswered segment after the overrides; a base whose
  current hash differs from the run's recorded base (the MT or overlay moved since the run); a change of English
  other than the G1.12 rule.
- **Deterministic:** run twice on the same tree, it writes the same bytes. `--dry-run` writes nothing and prints
  the counts.
- Added to `tools/lib/mt-layers.js`'s layer list (its `WRITABLE_LAYERS` and filename rule) so the layer's own
  invariants live beside the other layers'.

### 6.3 The setting: one book → layer map

- **`server/lib/servedLayer.js`**: `SERVED_LAYER_BY_BOOK = { 'efnafraedi-2e': 'fable' }` and
  `servedLayerFor(book)` (`'fable'` or the default `'mt-output'`). An enforceable value: its test pins it, and
  prose points here.
- Read by the loader (§6.4), the assign gate (§6.7) and the suggestion view (§6.9). Nothing else decides the layer.

### 6.4 The loader

`loadModuleForEditing` keeps its precedence: **`03-faithful-translation` first** (approved text, once it exists).
Otherwise, for a book whose `servedLayerFor` is `'fable'`:

- reads `02-mt-fable/<ch>/<m>-segments.is.md`, `isSource = 'fable'`;
- **missing file → refuses the unit** with a new refusal (§6.10 wording), never falls back to `02-mt-output`;
- **a segment present in the English and the MT but absent from the Fable file → refuses the unit** (the writer
  guarantees completeness, so this is corruption);
- reads `<m>-tags.jsonl` and attaches to each segment tagged `meaning` a field `fableMeaning: { before }` (the text
  Fable started from). No other tag reaches the client.

Every other book keeps today's two-way fallback, unchanged. Places keyed on `isSource` treat `'fable'` explicitly:
the residue findings (`mtFindings.read`) show **none** on a Fable-served unit (they describe MT text the editor is
not shown; §11), and the client's source label shows the Fable wording (§6.10).

### 6.5 G1.1: served-version rows

- **A migration rebuilds `served_text_versions`** with `'fable'` added to the `layer` CHECK, copying every row; the
  never-throw migration rules apply (CLAUDE.md, the `INSERT OR IGNORE` and boot-wedge rules), and the
  `verify-migration-convergence` check runs on it.
- Rows minted after the deploy carry `layer = 'fable'`; earlier `mt-output` rows stay (the layer is in the key). The
  stale check is unchanged: a page loaded before the deploy is refused `STALE_BASE` on save, as designed.
- The G1.1 spec's §5.2 layer list gains `'fable'` by a dated amendment there.

### 6.6 G1.7: the re-cut

- **The manifest's inputs gain the Fable layer:** per unit, `fableSha256` (the served file) and `fableTagsSha256`;
  the layer records gain `fable` (directory, the chooser table's sha256, every unit's provenance sha256).
  `compareToManifest` reports "input changed" when a Fable file differs from the manifest.
- **The freeze marker's protection extends to the layer:** the writer refuses to write a unit whose Fable file
  exists with other bytes (§6.2); the `verify-mt-lock` model gains the writer as a writer of the unit.
- **The re-cut** is a new tag, `manifest --write --tag freeze-efnafraedi-2e-<date> --supersedes
  freeze-efnafraedi-2e-2026-11-22`, cut on the server PR's tree after the loader change, so `counts.byLayer` reads
  `fable`. It is [USER]'s decision (G1.7 §6.6), recorded in the register, and lands in the same PR as the loader:
  merged and deployed together, so there is no tree where the served text and the manifest disagree.
- The G1.7 spec gets a dated note naming the new inputs.

### 6.7 G1.13: the assign gate

- `assignmentRefusal` replaces `if (study && !currentSwitchValue(conn, book, 'suggestion-view')) return
  'suggestion-view-off'` with `if (study && servedLayerFor(book) !== 'fable') return 'served-layer-not-fable'`, in
  the same position. New refusal message (§6.10).
- The `verify-assign-gate` TLA+ model replaces the switch with the setting and is re-run.
- R6 is superseded by `docs/decisions/2026-11-24-assign-gate-waits-on-fable-layer.md` (decision 3).

### 6.8 The flag and the comparison (client)

- On a segment with `fableMeaning`, the row shows one flag line in the existing `⚠` warning style used for
  `mtFinding` (`server/public/js/segment-editor.js`), with a button that opens the comparison. The module badge
  counts flagged segments like other warnings.
- The comparison shows the `before` text and Fable's served text as a **word-level diff** (deletions and
  insertions marked), with the English above it. It is read-only and closes back to the row. Markers (`[[…]]`) are
  shown as they appear in the editor.
- Segments without `fableMeaning` look exactly as today: no flag, no badge.

### 6.9 The research event and the suggestion view

- **`EVENT_TYPES` gains `fable-comparison-opened`**, by a dated amendment to the G1.1 spec's §5.9. Detail:
  `segmentId`, `occurrence`, the served version id. Recorded through `researchLog` like every other event, so only
  for consenting editors and under the same withdrawal and retention rules; recorded once per opening of the
  comparison.
- A new route, `POST /:book/:chapter/:moduleId/fable-comparison-opened`, with the editor routes' auth and scope
  chain; it writes nothing but the research event, and answers 204 for a non-consenting editor too.
- **Suggestions:** `suggestionView` returns no groups for a book whose `servedLayerFor` is `'fable'`, explicitly,
  before its integrity rule (which would withhold them anyway). The `suggestion-view` switch and its code stay for
  other uses; they no longer gate chemistry.

### 6.10 Icelandic wording (drafts, for [USER]'s approval)

| Where | Draft |
|---|---|
| Flag line | ⚠ Gervigreindin breytti merkingu þessa bútar. Berðu hann saman við enska textann. |
| Flag button | Sýna hvað breyttist |
| Comparison heading | Fyrir yfirferð gervigreindar → eftir yfirferð |
| Source label (was "MT") | Upphafstexti, yfirfarinn af gervigreind |
| Loader refusal | Texti gervigreindar fyrir þessa einingu fannst ekki og ekki er hægt að opna hana. Látið umsjónarmann vita. |
| Assign refusal | Ritillinn sýnir ekki enn texta gervigreindar fyrir bókina; ekki er hægt að úthluta köflum fyrr en hann gerir það. |

## 7. Order of work

1. **PR 1, the data:** the writer, its tests, the chooser table, and the layer itself committed under
   `books/efnafraedi-2e/02-mt-fable/`. Serves nothing; changes no server code.
2. **PR 2, serving:** the setting, the loader, the migration, the gate, the flag and comparison, the research
   event, the suggestion-view check, the spec amendments, and the re-cut manifest ([USER]'s go), in one PR and one
   deploy.
3. **Then** the register. The R6 decision record was written with this spec's approval
   (`docs/decisions/2026-11-24-assign-gate-waits-on-fable-layer.md`).

## 8. Proofs

- **Writer:** byte-identity with each run's committed `fe-layer` file; every untagged segment equals its base;
  every tags line's `beforeSha256`/`afterSha256` match; m68783's file equals the re-send's; determinism (two runs,
  same bytes); each refusal in §6.2 with a control that the happy path writes.
- **Loader:** a Fable book serves the Fable file; a missing file and a missing segment refuse; faithful still wins;
  another book is unchanged; only `meaning` reaches the client.
- **G1.1:** the migration keeps every row, accepts `'fable'`, converges under `verify-migration-convergence`.
- **G1.7:** the guard passes on the re-cut manifest and fails, with the controls of T9, when a Fable file changes.
- **G1.13:** the gate refuses `served-layer-not-fable` when the setting is anything else; the TLA+ model re-run.
- **Research:** the event is recorded for a consenting editor and not for a non-consenting one; withdrawal deletes
  it like the others.
- **E2E:** a flagged segment shows the flag and opens the comparison; an edited but unflagged segment shows no
  marker.

## 9. The production step

After PR 2 deploys: the boot is clean and the migration ran (`/api/health`); a read-only check that one unit per
chapter serves bytes hashing to its Fable file; the freeze guard passes against the re-cut manifest on the deployed
tree; and an assignment for a consenting, licensed editor is no longer refused `suggestion-view-off`. Assigning is
[USER]'s.

## 10. What else changes outside the code

- **The consent text** (private, `docs/grants/`): item 3's "decisions on AI suggestions are logged" gives way to
  "opening the comparison on a flagged segment is logged"; item 12's "every editor sees the suggestions" gives way to
  "every editor sees the flags"; item 14 names the new event; item 14's sub-point on suggestions being switched on is
  dropped. Item 4 (rule-based tool insertions) stays.
- **The funder letter** (private): unchanged by this design.

## 11. Claude's calls, for [USER] to check

- ch11 m68783: the re-send for the whole module; the main run's half kept as research data and named in the
  provenance.
- The 8 re-requested segments: Fable's Icelandic, named in `rerequested`.
- The 38 `refused-markers` segments: the base, no line in the tags file, no marker.
- ch10: step 3's run.
- The comparison's "before" side is the base Fable read (for the 8 segments, the overlay's corrected Icelandic), not
  layer 1. It is stored in the tags file, so the loader reads no MT file.
- The `before` text is stored for every changed segment, not only flagged ones, so the analysis needs no other file.
- Residue findings are not shown on Fable-served units.
- The suggestion view is switched off for chemistry explicitly, not only through its integrity rule.
- The layer's directory name, `02-mt-fable`.

## 12. Left to the builder

- The diff algorithm (a small word-level LCS in vanilla JS is enough; no new dependency).
- How the writer reuses `compare.mjs`'s functions (import, or move the shared ones to `lib.mjs`).
- The exact JSON field order and the tags file's `occurrence` numbering, following G1.1's.
- The migration's number and its table-rebuild mechanics.
