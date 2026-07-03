# Fresh-output order-cause breakdown — efnafraedi-2e

**Date:** 2026-07-03. **Branch:** `feat/chem-order-cause-characterization` (off F4's `#223`).
**Tool:** `tools/analyze-order-causes.js --book efnafraedi-2e` (and `--json`).
**Status:** diagnostic report — no gate flip, no allowlist, no extraction/inject change made here.

## 1. Context

This measures **fresh** inject output: for every module, `tools/analyze-order-causes.js` builds
CNXML in memory (`extractSegments` → `formatSegmentsMarkdown` → `parseSegments` → `buildCnxml`,
the same F4 Task-5 harness) and compares element document-order to source via
`compareElementOrder` (`tools/cnxml-fidelity-check.js`). It is **not** measuring the committed
`03-translated/` — that tree was produced by an older renderer, and WS5 (the biology/re-render
gate item) is going to wholesale-replace it. Measuring fresh output shows what the **current**
pipeline actually produces today, which is the only thing relevant to the id-order gate decision
(item 2 of the chemistry clean-slate oracle-hardening gate,
`docs/plans/2026-07-01-chemistry-clean-slate-design.md`). Every moved id is classified by its
**source element tag** (the proxy for which extract/inject code path is responsible), aggregated
per-cause and per-module. The full run is reproduced at `/tmp/order-causes.txt` /
`/tmp/order-causes.json` (not committed — regenerate with the commands below).

```
node tools/analyze-order-causes.js --book efnafraedi-2e | tee /tmp/order-causes.txt
node tools/analyze-order-causes.js --book efnafraedi-2e --json > /tmp/order-causes.json
```

## 2. Headline split

| | count | of total |
|---|---|---|
| Modules analyzed | **149** | 100% |
| Clean modules (moved = 0) | **89** | 60% |
| Modules with residual reorder | **60** | 40% |
| Modules that FAILED to build | **0** | — |

**Contrast with the stale-committed baseline.** The same warn-only order check
(`compareElementOrder`, run via `cnxml-fidelity-check.js` against the *committed*
`03-translated/`) flags **51 / 149** modules
(`docs/plans/2026-07-03-order-cause-characterization-design.md`). That 51 is measured against an
artifact WS5 is going to delete outright — it mixes together an older renderer's output, F1's
section-order bug (now fixed on fresh output — F1 collapses it completely: e.g. `m68702` was 75
reordered ids on stale, 0 on fresh), and whatever the *current* pipeline still gets wrong. The
fresh split above is the post-F1 (and post-F4 table-dedup, `#223`) population: **89 modules are
fully clean** — direct confirmation that F1's section-order fix, and F4's table-duplication fix,
were real and are not the residual problem — while **60 modules still reorder for reasons
unrelated to the bug F1 fixed.** Those 60, and *only* those 60, are the actual object of this
report. (The 89-vs-51 and 60-vs-51 numbers are not directly comparable populations — one is
measured on stale committed bytes, the other on fresh in-memory output — which is exactly why
gate item 2 could not be decided by looking at the stale 51 alone.)

## 3. Per-cause table

Verbatim from the run, sorted by moved-id count (highest first):

| Cause (source element tag) | # modules | # moved ids |
|---|---|---|
| `para` | 52 | 273 |
| `equation` | 43 | 157 |
| `media` | 53 | 109 |
| `table` | 16 | 36 |
| `term` | 13 | 26 |
| `note` | 17 | 23 |
| `figure` | 8 | 9 |
| `list` | 6 | 9 |
| `solution` | 5 | 8 |
| `example` | 4 | 4 |
| `footnote` | 1 | 2 |
| **Total** | — | **656** (+ 1 unresolved, §4 = 657 raw moved-id occurrences) |

## 4. UNRESOLVED ids

One, in one module:

- **`m68710`: `CNX_Chem_04_00_Rocket`** — not silently dropped, correctly bucketed by
  `classifyMovedIds`'s fail-loud path.

**Root cause, investigated:** this is not a locally-defined id at all. `m68710` line 282 contains
`<link target-id="CNX_Chem_04_00_Rocket" document="m68730"/>` — a cross-document reference to a
figure that lives in a *different* module (`m68730`). `classifyMovedIds`'s regex correctly finds
no element in `m68710`'s own source defining that id (by design — its negative lookbehind
`(?<![\w-])id="..."` was written precisely to not misattribute `target-id` references,
`tools/analyze-order-causes.js:44-47`). The id ends up in `compareElementOrder`'s moved list at
all only because `extractIdSequence` (`tools/cnxml-fidelity-check.js:86-98`) uses the regex
`/\bid="([^"]+)"/g`, which — because `-` is a non-word character — matches inside
`target-id="..."` too (the same attribute-substring confusion that `classifyMovedIds` had to
explicitly guard against). This single unresolved case is a useful canary: it is the same class
of bug (§5/§6) that turns out to be the dominant driver of the *resolved* residual reorders below,
just manifesting here as a cross-document reference instead of an in-document one. No change
needed to the diagnostic tool for this task; flagged as a `cnxml-fidelity-check.js` follow-up in
§6.

## 4b. FAILED-TO-BUILD modules

**None.** All 149 efnafraedi-2e modules build successfully in memory (`buildFailures: []` in the
JSON output). The full run exits 0.

## 5. Per-cause triage

Investigation traced concrete source-vs-fresh placement for representative modules per cause
(method: a throwaway in-memory inspector reusing the same extract→build harness, diffing the
common-id sequence position-by-position; not committed, per the task's read-only constraint).
Two concrete, code-level root causes were found and confirmed against multiple independent
modules. Between them they explain **473 / 657 (72%)** of all moved-id occurrences and **fully
account for 42 of the 60** residual modules (measured by: does every moved id in the module fall
within 6 source-order positions of one of these causes' trigger elements). The rest is flagged
"needs deeper look" rather than guessed at.

### Root cause A — `processSection` position-recompute collides `id=` with `target-id=`

**Where:** `tools/cnxml-extract.js:706-710`, inside `processSection` (the interleave step F1
added to fix section-vs-sibling ordering):
```js
for (const element of elements) {
  const idStr = element.id ? `id="${element.id}"` : null;
  const position = idStr ? contentWithoutTitle.indexOf(idStr) : 0;
  ...
```
`String.indexOf` finds the *first* literal occurrence of the substring `id="X"` anywhere in the
section's raw text — including inside `target-id="X"` (e.g. `<link target-id="X"/>`), because
`target-id="X"` textually contains `id="X"` as a substring. When an element's id is referenced
by an earlier `<link target-id="X"/>` cross-reference elsewhere in the *same* section (an
extremely common CNXML idiom — "as shown in [[xref]]" pointing forward to a figure defined
later), the recomputed position locks onto the reference's location instead of the element's own
tag, hoisting the element (and everything between the two points appears to "move" relative to
it) far earlier than its true position.

**Confirmed by direct trace, 4 modules:**
- **`m68710`** (ch04): `<link target-id="CNX_Chem_04_02_ammonia"/>` at line 171 (inside para
  `fs-idm50199792`) precedes the actual `<figure id="CNX_Chem_04_02_ammonia">` at line 174 — with
  `<equation id="fs-idm9327664">` (line 172) and `<para id="fs-idm73811808">` (line 173) sitting
  between them. Source order: equation → para → figure/media. Fresh order: figure/media →
  equation → para. Confirmed by literal source/fresh diff (`/tmp/m68710.source.cnxml` /
  `.fresh.cnxml`, not committed).
- **`m68674`** (ch01): `<link target-id="CNX_Chem_01_04_Volume"/>` at line 205 precedes
  `<figure id="CNX_Chem_01_04_Volume">` at line 208, with two intervening paragraphs
  (`fs-idm81813264` containing `term-00013`, `fs-idm163691744` containing `term-00014`/
  `term-00015`) that get flagged as moved along with the figure's `media` (`fs-idm75233216`).
- **`m68795`** (ch12) — the note-nested variant: a `<note id="fs-idm214293568">` contains its own
  `<para id="fs-idm151500176">` which cross-references (`target-id="CNX_Chem_12_07_CatConvert"`)
  a `<figure>`/`<media id="fs-idm189806768">` a few lines later *inside the same note*. All three
  (note, para, media) are flagged moved — same mechanism, operating inside a container instead of
  a bare section.
- **`m68830`** (ch18): `<link target-id="CNX_Chem_18_02_DownsCell"/>` at line 22 precedes the
  figure at line 27, with an intervening equation (`fs-idp60529744`) and para
  (`fs-idp72558800`) flagged moved; the pattern repeats a second time in the same module for
  `CNX_Chem_18_02_HallHerCell`.
- **Quantified:** of the 9 `figure` moved-id occurrences, 7 have a direct, confirmable
  `target-id="<own id>"` reference earlier in the same source file than the figure's own
  defining tag (checked programmatically across the whole book, not just spot-checked).

**Verdict: real-bug→fix candidate, not benign.** A figure/equation/media genuinely lands before
the paragraph that motivates it, or before the equation it's meant to accompany — this is
reader-order-meaningful and invisible to the tag-count fidelity check (it only counts tags, not
positions — Fable-5's original finding). It is a residual defect in the *very code path* F1 added
(the interleave "fix"), not a separate legacy issue.

### Root cause B — non-inline `<table>` inside `<example>`/`<exercise>`/`<note>` is repositioned, not just modelled

**Where:** the interaction of `tools/cnxml-extract.js:957-969` (a table not captured by a
container's inline `[[TABLE:]]` ref "still emits standalone, so nothing is lost" — deliberate,
per F4's design, `docs/plans/2026-07-03-f4-table-double-model-design.md`) with
`tools/cnxml-inject.js` `buildExampleDom`'s (and the equivalent exercise/note builders') Step 4b
(`removeTablesExceptKept`, ~line 2574), which removes **every** table from the container's DOM
copy except ones that were inline-expanded. A table that is a *direct child* of an example (not
nested inside a `<para>`) is therefore deleted from its true in-place position inside the
container, and relies entirely on the section-level standalone `table` structure entry to
reappear. That standalone entry's position is computed as a raw byte offset that necessarily
falls *inside* the numeric span of the whole (opaque, serialized-as-one-block) example — so the
section-level interleave sort places it right after the entire example, not at its true
mid-calculation position.

**Confirmed by direct trace, 2 modules:**
- **`m68819`** (ch16): `<table id="fs-idm230329280">` sits as a direct child of
  `<example id="fs-idm117444432">`, sandwiched between an equation and a para mid-calculation
  (source position 39 of the block). In fresh output it is pushed to position 51 of the same
  block — i.e., past every subsequent para/equation/note that structurally follows it inside and
  after the example, landing right where the example's content happens to end. `F4` (per its own
  design doc) explicitly scoped this table-not-inline-referenced case as "correct, one model" —
  it fixed the *duplication* problem, not this *positioning* problem, which F4 did not test for.
- **`m68789`** (ch12): `<table id="fs-idm205685856">` is a direct child of
  `<example id="fs-idm234815200">`, immediately after the opening tag (an experimental-data table
  for a rate-law derivation). Same mechanism — the table's index in the common-id sequence shifts
  from 49 (source) to 64 (fresh), landing after a large block of intervening content that legally
  belongs before it inside the example.
- This is distinct from figures in the same position: `buildExampleDom` Step 4a unconditionally
  keeps **all** direct-child figures in place (`keptFigureIds` adds every direct-child figure
  before Step 4b runs) — only tables get this treatment, because `keptTableIds` is populated
  *only* by inline-expansion, never by "is a direct child."

**Verdict: real-bug→fix candidate, not benign.** A worked-example "given data" table landing
after the calculation's conclusion instead of at the step where it's needed breaks the
pedagogical flow of exactly the content type (worked examples) editorial review most needs to
trust. This is a follow-up to F4, not covered by it.

### Per-cause disposition

| Cause | Disposition | Basis |
|---|---|---|
| `figure` | **real-bug→fix, root cause A** | 7/9 occurrences directly confirmed self-referencing-earlier; the other 2 (`m68674`, `m68710`) confirmed by full trace even though the figure's own id wasn't the one flagged (its neighbors were — an artifact of the position-comparison algorithm, not evidence against the same mechanism). |
| `media` | **real-bug→fix, root cause A (incl. note-nested variant)** | Media is almost always a figure's own child (`m68710` `fs-idm1349584`, `m68674` `fs-idm75233216`, `m68830` `fs-idp98736208`) or a note-nested figure's child (`m68795` `fs-idm189806768`) — it rides along with whichever figure got hoisted. |
| `note` | **real-bug→fix, root cause A (container variant)** | `m68795` `fs-idm214293568` — the note itself is flagged because it (and its nested figure) get hoisted per the note-nested variant of A. |
| `table` | **real-bug→fix, root cause B, own item** | `m68819` `fs-idm230329280`, `m68789` `fs-idm205685856` — both direct example-children, both confirmed. A distinct, F4-adjacent defect, not covered by F4's own fix. |
| `para` | **collateral of root cause A/B, not an independent bug** | Paragraphs are flagged only because they sit between an earlier textual reference and the element's true (later) position, or between a hoisted table and the content that used to follow it (`m68710` `fs-idm73811808`, `m68674` `fs-idm81813264`/`fs-idm163691744`, `m68830` `fs-idp72558800`/`fs-idp289844720`). Fixing A/B should collapse this bucket without a separate para-specific change. |
| `equation` | **collateral of root cause A/B, not an independent bug** | Same pattern as `para` — equations sitting between a reference and its target, or inside a table-disrupted example (`m68710` `fs-idm9327664`, `m68830` `fs-idp60529744`/`fs-idp1741488`, `m68819`'s equation cluster around the misplaced table). |
| `term` | **collateral of root cause A, not an independent bug** | Terms are inline markup *inside* a paragraph's text; their own local position within that paragraph's sentence is untouched. They are flagged purely because their containing paragraph moved (`m68674` `term-00013/14/15` ride along with `fs-idm81813264`/`fs-idm163691744`; `m68710` `term-00013/14` likewise). This is the cause closest to "benign" in spirit — a term's *reading context* is intact — but it is not a code path of its own to filter; it will zero out automatically once A is fixed. **Do not add a standalone `term` allowlist entry** — that would mask a real (if collateral) reorder without fixing anything. |
| `list` | **needs deeper look** | Not individually traced. 9 moved ids across 6 modules; anchor-proximity analysis shows some but not full overlap with A/B triggers in the same modules — plausibly collateral, not confirmed. |
| `solution` | **needs deeper look** | Not individually traced. Small (8 ids / 5 modules); likely collateral of A/B inside exercises (structurally identical container pattern to examples) but not directly verified. |
| `example` | **needs deeper look** | The `example` *container's own id* is occasionally flagged (e.g. `m68809`'s `fs-idm99459616`, part of a 40-id contiguous moved block that also contains a confirmed root-cause-B table, `fs-idm87178400`). Whether the container itself independently mis-positions, or is dragged along as the outermost element of an A/B cascade whose radius simply exceeds this analysis's window, was not resolved. Flag for the fix-verification pass (§6) rather than guessed at now. |
| `footnote` | **needs deeper look** | Only 2 occurrences, both inside `m68809`'s same large moved block as `example` above — same caveat. |

**No cause is being recommended as a benign→filter/allowlist candidate.** The task brief warns
against overclaiming benign; every cause traced here turned out to be either a real, fixable
positioning defect, or collateral damage from one — nothing observed is "a block that legitimately
relocates as a unit with a reader-order-irrelevant absolute position." The `term` case comes
closest to that description but the fix is still "fix the paragraph's position" (root cause A),
not "stop caring about term order."

## 6. Recommended next step

This is a recommendation for the lead's gate decision, not a commitment:

1. **Fix root cause A first** (`tools/cnxml-extract.js:706-710`): stop recomputing an element's
   interleave position by re-searching raw text for `id="X"`. The correct position was already
   computed once, correctly, inside `processTopLevelContent`'s own `elementsWithPositions` sort
   (confirmed by direct instrumentation: for `m68710`'s ammonia figure, that internal sort had the
   figure at position 14848, correctly *after* the equation at 13619 and para at 14444 — the bug
   is introduced only by `processSection` discarding that number and re-deriving a new one via
   `indexOf`). The robust fix is to have `processTopLevelContent` return the position it already
   computed on each element, and have `processSection` use that number directly instead of
   re-deriving it — which also incidentally removes the `id=`/`target-id=` substring collision
   entirely, since the original position calc in `processTopLevelContent` (`cnxml-extract.js:803-805`,
   `:878`, etc.) uses `content.indexOf(fullMatch)` against the *original, unmodified* content, not
   a bare id-string search. This one fix is expected to collapse `figure`, most of `media`,
   `note`, and the large majority of the `para`/`equation`/`term` collateral buckets, based on the
   72% coverage measured in §5.
2. **Fix root cause B as its own item**, scoped explicitly as a follow-up to F4 (F4's design doc
   deliberately treated non-inline container tables as "correct, one model" — it wasn't wrong
   about the *modeling*, just silent on *positioning*). Likely fix shape: either keep non-inline
   tables in place in the DOM the same way `buildExampleDom` already keeps direct-child figures in
   place (Step 4a), instead of stripping and relying on the standalone section-level re-emission;
   or give the standalone table's `itemsWithPositions` entry a position anchored to *within* the
   container's span (relative offset) rather than a raw absolute offset that gets compared against
   siblings outside the container.
3. **Register the recurring `id=`/`target-id=` substring-confusion bug class.** This exact pattern
   appears in at least three places: `processSection`'s position recompute (root cause A, this
   report), `extractIdSequence` in `cnxml-fidelity-check.js:89` (the mechanism behind the §4
   UNRESOLVED case), and `classifyMovedIds` itself needed an explicit negative-lookbehind guard
   against it (`tools/analyze-order-causes.js:44-47`, already shipped). A single shared,
   tested helper ("find the position/regex-match of the element *defining* id=X, never a
   `target-id=X` reference to it") would close this class at the root instead of patching each
   site ad hoc. Worth a register note even though it's one line at each site.
4. **`example`/`footnote`/`list`/`solution` ("needs deeper look")**: re-run this same diagnostic
   after A and B land, on the (presumably much smaller) remaining residual, before deciding
   whether they need their own fix or turn out to be A/B collateral whose cascade simply exceeded
   this pass's inspection radius.
5. **Do not flip gate item 2 (id-order warn-only → hard-fail) yet.** 60/149 modules still reorder
   on fresh output for reasons independent of F1's already-fixed section bug. A hard-fail today
   would immediately break CI/manual gating on real, uninvestigated content. Revisit once A and B
   are fixed and this report's residual has been re-measured.

No allowlist was written, no code was changed, and no `books/` bytes were touched by this task —
per the task-3 brief and the design's explicit out-of-scope list.
