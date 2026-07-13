# P0-1 — Depth-aware nested-element extraction in the renderer (design)

**Date:** 2026-07-13 · **Campaign:** pre-semester coding campaign, Phase 2 item 6
(`docs/plans/2026-07-11-pre-semester-coding-campaign.md:46`) · **Status:** approved design, pre-plan
**Origin finding:** P0-1 register rows in `docs/plans/2026-06-28-pipeline-architecture-implementation-plan.md:905` and `:1025`
**Lead decisions (2026-07-13):** nested media/figures render **inside their list items** (in-place, not hoisted-after);
implementation approach = **A: extend the DOM seam** (over containment-filtered string scan and full DOM-node renderers).

## 1. Problem

`renderChildrenInDocumentOrder` (`tools/cnxml-render.js:842–1015`) is the single ordering path for every
rendered page (F2 unified it). It itemizes a section's children by **flat string scans** of the whole content
string: `extractNestedElements` (`tools/lib/cnxml-parser.js:232`) is depth-correct only for *same-tag* nesting
and blind to *foreign containers*, so a `<figure>` inside an `<exercise>` is itemized both as part of its
container and as its own top-level element. Protection today is two symptom patches plus fragile hidden state:

- **Strip cascade** (`:897–912`): hand-ordered `String.replace(fullMatch,'')` passes (examples→exercises→notes→
  figures→tables→media→lists) whose ordering is load-bearing and whose mutations break the later `indexOf`
  position lookups — the exact E6/R4-1 mechanism (scrambled Lewis-structure procedure, live 7-3, m68739).
- **E6 patch** — `positionInContent` (`:836–840`) id-fallback when a mutated `fullMatch` misses. Residuals: id-less
  media-bearing lists hoist to position 0 (corpus-inert today: **0 instances in all books**, probed 2026-07-13);
  the `id="X"` needle also matches `target-id="X"` (RV-4, corpus-inert by probe).
- **E9 patch** — `renderedFigureIds`/`renderedTableIds` suppression Sets plus paraHandler pre-registration in
  `renderExample`/`renderExercise` (`:1434–1441`, `:1548–1558`) so the duplicate top-level itemization renders as
  `''`. An **id-less** nested figure/table would double-render with no suppression possible.
- Any new nested block type re-trips the class ("biology-likely trigger" — though the corpus probe shows
  **physics is the hot spot**: 252 figure-in-exercise sites in edlisfraedi-2e; biology's 186 figure-in-note sites
  already go through the depth-correct container path).

Meanwhile the depth-correct pattern already exists in the same file: `renderBlockChildrenInOrder`
(`:1246–1295`, the "Track C leaf-seam") — a direct-children DOM walk with per-container `hoistTags`, used by
`renderNote`, `renderExample`, `renderExercise`. `renderList` is the one container still on the string path.

## 2. Goal and non-goals

**Goal:** replace the flat-scan itemization with a depth-aware direct-children DOM walk at section level, and
extend depth-correct block dispatch into `renderList` items so nested media/figures render in place. Delete the
machinery that only existed to compensate for the flat scan.

**Non-goals (explicitly out of scope, registered in §8):**
- **Extract-stage** depth-blindness (`cnxml-extract.js processTopLevelContent` mirrors the same algorithm):
  changing extraction traversal renumbers segment ids and breaks alignment with every existing
  `02-mt-output`/`03-faithful-translation` file and the MT edit-locks. Not touched.
- m68710's published **English residue** (extract-side `extractElements` non-greedy truncation on the corpus's
  one nested-para module) — needs the extract-side fix + re-extract + ~1 segment of re-MT. Registered.
- Full DOM-node renderer signatures (Approach C) — later incremental refactor if ever.
- Inner-para ids inside list items (the deliberate byte-identical `<br>`-join branch, `:1852–1857`) — kept as-is.

## 3. Evidence base (probed 2026-07-13, two Workflow runs)

- **Closed vocabulary:** direct element children of `<content>` are exactly
  `section, para, figure, equation, note, example, table, list, media, exercise, quote`; `<section>` adds
  `title`/`label`. **Zero** non-whitespace text nodes, CDATA, or PIs corpus-wide; 5 XML comments total.
  `<glossary>` is always a sibling of `<content>` (543/543), never inside it.
- **`<list><item>` is mixed content:** inline runs interleaved with blocks — equation ×461, para ×226,
  figure ×210 (191 in lifraen-efnafraedi, figure>media wrapped), nested list ×63, media ×43, table ×2,
  label ×12, footnote ×1; and para-in-item can itself contain equation (×33) and figure (×1). The item walk
  needs two levels of block recursion.
- **DOM round-trip is safe:** `parseCnxmlFragment` parses 784/785 modules with zero text/MathML/comment loss
  (sole failure: known-malformed `liffraedi-2e/03-translated/.../m66443.cnxml`). Serialization is **not**
  byte-identical (entity forms, self-closing normalization, quote swaps, `xmlns:m` stripping) → the walk must
  re-locate nodes by **DOM traversal order only**, never by string search into the original. Perf: mean 1.59 ms,
  max 27.7 ms per module — irrelevant for CLI and the one-module-per-call live preview.
- **Duplicate sibling blocks** (the re-extract collision class) are 0 in every `01-source` book; 7 injected
  duplicate `<equation>` groups exist in `edlisfraedi-2e/03-translated` (m42073/75/76) — another reason for
  DOM-order dispatch over string re-find.
- **renderList parity does NOT hold naively:** if hoisting stops and `renderList` is untouched, the dominant
  no-para item shape routes media through `processInlineContent` → bare `<img>` without the `.media-inline`
  wrapper, silently losing `max-width:100%`, centering, and the `scaled-down` 60% cap (vefur `content.css` has
  no bare-img rule). Figures in items are today dropped via loud seam (para branch) or raw-leaked (no-para
  branch). Fix: dispatch item block children through `renderMedia`/`renderFigure`/`renderEquation` — their CSS
  classes are descendant-scoped and work inside `<li>` with **no vefur change**. Iframe embeds already converge
  on `renderEmbedHtml` from both paths (bio embeds keep parity).
- **m68710 today** (one nested-para module, golden-pinned incl. defects): outer-para translation misplaced,
  published English `"Write the two half-reactions"`, 10 inner-para ids dropped, and 7 raw `<equation>` wrappers
  inside `<li>`s. The render-side walk fixes the equation leaks; the English residue is extract-side (§8).
  `translation-errors.json` scored this module "benign" — the fidelity checker is blind to this class, so the
  acceptance instrument is the render-diff harness (§7), not the manifest.

## 4. Architecture

### 4.1 Section-level walk

`renderChildrenInDocumentOrder(content, context, {excludeSections, sectionLevel})` keeps its signature and both
call sites (`renderContent :804`, `renderSection :1044`; synthetic-document entry via
`renderEndOfChapterSection` tolerated unchanged). Internally it becomes:

1. `parseCnxmlFragment(content)` behind a **fail-loud gate** (§6).
2. Iterate **direct element children in document order**. Per child, dispatch by tag against a strict whitelist
   derived from the closed vocabulary: `section` (respecting `excludeSections` and the
   `BOOK_CONFIG.excludedSectionClasses` / `sectionExercises==='both'` carve-out, `:847–856`), `figure`, `note`,
   `example`, `exercise`, `table`, `media`, `list`, `equation`, `para` — each to its existing string renderer,
   fed the **serialized node**.
3. `<para>` children hoist `figure`/`table`/`media`/`equation` out and render them standalone after the para —
   figure/table/media is the current published behavior; `equation` is added to the hoist set to close the same
   leak/dup class C2 fixed inside `renderExample` (implementation probes the corpus for section-level
   para-wrapped equations and pins whichever parity case exists). Implemented with the existing `hoistTags`
   mechanism instead of the strip cascade.
4. `title`/`label` are **skipped by the walk** — they are consumed by `renderSection`/container renderers today
   and that ownership doesn't move; **comments skipped**; any other element → loud seam
   (`context.undispatchedBlocks`), rendered as nothing but recorded. The 3 organic `<quote>` elements —
   **silently dropped today** (never itemized) — will surface here: an honesty improvement.
5. No position sorting: document order comes from the DOM. Whitespace joins mirror the current `lines` idiom so
   output diffs stay reviewable.

Per-container hoist policies are **invariants** (live-verified, comment cites the ch14 duplicate incident):
note = hoist all dispatched blocks out of paras; example/exercise = hoist `['list','equation','table']` only,
figures/media stay inline via `renderPara` **unnumbered** (the P0-6 invariant — numbering them would renumber
every downstream figure in the chapter). Note-in-example/exercise stays deferred to the container renderers.

### 4.2 renderList item dispatch

`renderList` keeps its shell (list-type/number-style handling, nested-list recursion) but items get a
direct-children walk with two levels of block recursion:

- `media` → `renderMedia` (keeps `div.media-inline` / `.scaled-down` wrappers → CSS contract holds in `<li>`),
- `figure` → `renderFigure`, `equation` → `renderEquation`, `table` → `renderTable`, nested `list` recurses,
- `para` inside an item: block children (`equation` ×33, `figure` ×1 in corpus) are hoisted out of the para and
  dispatched; remaining pure-para text keeps the **byte-identical `<br>`-join branch** (`:1852–1857`) — inner-para
  ids stay dropped (registered follow-up, cosmetic),
- unknown block in an item → loud seam (replacing today's raw-leak/drop split).

This delivers the lead's placement decision: step diagrams render inside their steps (m68739 Lewis procedure,
organic's 191 figure-in-item sites) instead of clumped after the list.

### 4.3 Deletions (the point of the exercise)

Once itemization is depth-aware, delete as dead code — in the same PR, verified by the exactly-once tests:

- the strip cascade (`:897–912`) and `contentWithoutSections`/`simpleContent` mechanics,
- `positionInContent` + its E6 id-fallback and the para `indexOf('<para')` position arm — **closing RV-4
  structurally** (no `id="X"` needles remain) and resolving C3-b for this function,
- `renderedFigureIds`/`renderedTableIds` Sets, `renderFigure`/`renderTable` skip logic, and both paraHandler
  pre-registrations (`renderExample :1434–1441`, `renderExercise :1548–1558`),
- the note-in-example/exercise `indexOf` range checks (`:928–939`) — the DOM walk gives this for free.

If any deletion turns out to have a live consumer, that consumer is a bug to fix, not a reason to keep the
dead path (one real code path).

## 5. Entry points, consumers, compatibility

- CLI render and the server live-preview (`renderService` → `renderCnxmlToHtml`) share the path; no signature or
  context-shape change beyond removing the two Sets from context creation (`:593–594`). Editor previews pick the
  fix up on deploy; **published HTML changes only after the lead-gated re-render + sync** (L-lane), as always.
- Test-facing exports kept: `renderChildrenInDocumentOrder`, `renderExercise` (`:4154` block).
- No vefur change required (descendant-scoped CSS verified against `content.css`); `li > p` spacing untouched
  because the `<br>`-join branch is preserved.

## 6. Error handling

- **Parse failure** on module content → per-module fail-loud: skip the module, mark the render report
  incomplete, `exitCode=1` — riding the established per-module skip idiom (B4's `tableCellGaps` precedent), never
  a mid-batch throw. Known instance: m66443 — today's regex renderer renders the malformed file anyway; post-P0-1
  its chapter render exits 1 until the file is fixed. That is the intended fail-loud posture (bio is mid-intake,
  unpublished), and #274's inject-side gap gate (M7) covers the same module once merged.
- **Whitelist miss** → loud seam, recorded with tag/id/location, rendered as nothing (existing contract).
- Comments skipped silently (5 corpus-wide, all commented-out markup).

## 7. Testing & acceptance

**Stay green (behavioral pins the root-cause fix must satisfy):** the 32-cell nesting matrix
(`cnxml-render-nesting.test.js`, `KNOWN_ESCAPES` stays empty), `documentOrder` (E6 end behavior),
`exerciseFigure` (exactly-once), example/exercise/note/list-dom seam tests, `no-raw-cnxml`, loud-seam,
`pipeline-integration` (real CLI renders of ch01/ch05/appendices incl. the R4-3 appendix gate).

**New tests (TDD, RED first):**
- id-less nested figure/table renders exactly once (the no-suppression class; synthetic — corpus-verified absent),
- media-in-item renders **inside** `<li>` wrapped in `.media-inline` (+ `scaled-down` case),
- figure-in-item renders inside `<li>`; equation-in-item-para dispatched to `renderEquation` (m68710 shape),
- unknown direct child → loud seam, not silence; malformed module content → per-module fail-loud, batch continues,
- multi-class and attribute-order variants to pin serialized-node handoff.

**Goldens:** regenerate all 10 via `UPDATE_GOLDEN=1`, then review per module classifying every diff as one of:
in-place media/figure moves, equation-leak fixes (m68710), removed empty-string whitespace, or **unexplained
(= regression, stop)**. Triage instrument per the E6 precedent: id-multiset equality + sorted-line diff.

**Corpus-wide render-diff harness (closes the physics/organic measurement gap):** a one-off script (scratchpad,
results in the PR description) renders every module of every book before/after and classifies diffs the same
way — edlisfraedi-2e (252 figure-in-exercise) and lifraen-efnafraedi (191 figure-in-item) have no goldens and
ship unmeasured otherwise. `translation-errors.json` is **not** an acceptance instrument for this class (§3).

**Gate:** `npm test` from the repo root.

## 8. Register (new/updated entries, logged per standing feedback)

- **P1-R1 `[fix]` extract-side nested-para truncation (m68710):** outer-para segment truncates at the first
  inner `</para>`; inner para `fs-idp218612096` has no segment → published English residue. Fix belongs to the
  extract stage + re-extract + ~1 segment re-MT (trivial ISK; sequence after the B4 post-merge op; `02-mt-output`
  is read-only/edit-locked — go through `api-translate`). Also: the fidelity checker scored this module benign —
  blind spot noted.
- **P1-R2 `[fix]` `<quote>` has no renderer:** 3 sites, lifraen-efnafraedi only (unpublished). Today silently
  dropped; post-P0-1 it surfaces in the loud seam. Add a renderer at organic onboarding.
- **P1-R3 `[cosmetic]` inner-para ids in list items** are dropped by the `<br>`-join branch (anchors lost,
  m68710 ×10). Restore as real `<p id>` children only with a deliberate vefur `li > p` CSS check.
- **P1-R4 `[docs]` stale register rows corrected by this design:** C3-a is stale (note/exercise/example dispatch
  maps DO carry `table` post-F1b; verified in code + empty `KNOWN_ESCAPES`); P0-1's `~782` line ref is `842`;
  "0 table nestings in efnafraedi" is stale (3 table-in-note in 01-source). Update
  `docs/plans/2026-06-28-pipeline-architecture-implementation-plan.md` rows in this PR.
- **P1-R5 `[data]` injected duplicate equations** in edlisfraedi-2e 03-translated (m42073/75/76, 7 groups,
  same-parent siblings; source has 1 each) — pre-existing inject artifact, surfaced by the corpus probe.
  Diagnose at physics re-inject; not a P0-1 blocker (DOM-order dispatch is immune).

## 9. Sequencing

- This PR is **code-only** (plus golden fixtures + register-row docs). No `books/` content changes.
- **B4 (#274, awaiting lead merge) overlap:** B4's post-merge data op re-injects 8 modules including goldens
  m68789/m68791. Whichever of (B4 data PR, P0-1 golden regeneration) lands second regenerates from the other's
  committed state — never both blind in the same window. P0-1's code doesn't conflict with B4's
  (extract/inject/strip vs render), so branch-from-main is safe.
- **Delivery is a separate lead-gated op:** full re-render of published books + `--update-baseline` for the
  shape-histogram + vefur sync. The baseline must never be captured from pre-fix output.

## 10. Risks

| Risk | Mitigation |
|---|---|
| Golden diffs mix expected moves with real regressions | Per-module classification (§7); unexplained diff = stop |
| Physics/organic unmeasured (no goldens) | Corpus-wide render-diff harness is a PR deliverable |
| Deleting E9 registries re-opens double-render via an unnoticed path | Exactly-once tests + nesting matrix must pass with Sets deleted; grep for any other consumer before deletion |
| Serialized-node handoff differs from original bytes (entities, self-closing) | Renderers already consume `renderBlockChildrenInOrder`'s serialized output today; new pins for attribute/entity variants |
| Live-preview divergence (server deploys before re-render) | Accepted and normal for render fixes; editors see the fix first |
| Hoist-policy drift (figures numbered in exercises, layout shifts) | Policies written as invariants (§4.1) with tests; P0-6 stays inline-unnumbered |
