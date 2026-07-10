# Consolidated Remediation — Fable RUNs 4–6

**Date:** 2026-07-10
**Status:** design (approved axis/decomposition/done-boundary; pending spec review)
**Source audits:**
- `docs/audit/2026-07-09-fable5-run4-chem-pipeline-review.md` (chem renderer/inject/extract)
- `docs/audit/2026-07-09-fable5-run5-biology-readiness-review.md` (biology-readiness)
- `docs/audit/2026-07-09-fable5-run6-cross-repo-seam-review.md` (efni↔vefur seam)
**Repos:** `namsbokasafn-efni` (pipeline) + `namsbokasafn-vefur` (reader) — sister repo at `../namsbokasafn-vefur`.

## 1. Guiding principles

1. **Urgency-tiered sequence, workstream-styled implementation.** Fixes are ordered by how soon they bite (biology onboarding → next content sync → latent). Each point-fix is written in the idiom of one of the three workstreams (fail-loud, config-as-data) so the Phase-2 refactors *consolidate proven fixes* rather than invent abstractions up front.
2. **No pipeline fork** (lead decision, 2026-07-09). Book differences live in **data/config**, never in forked code. A fork would duplicate the general correctness code (RUN 4's scramble/numbering/emphasis are general bugs → one correct renderer, not N drifting copies). Bugs are data/config leaking into code via silent fallback → sharpen that boundary.
3. **Done boundary = code + tests + a re-render/sync checklist.** The actual re-render (efni CLI), sync, and deploy remain a **lead-driven gate** flagged per phase — not executed inside the implementation plans. Rationale: matches the existing Phase-6 division; keeps plans executable in-session without heavy ops.
4. **Robustness > expedience** ([[feedback-robustness-over-expedience]]): one real code path, fail loud, escape hatches can't reach prod, split refactor from enforcement. Log every out-of-scope find to the plan register.
5. **Cross-repo hygiene:** before editing `../namsbokasafn-vefur`, read its `CLAUDE.md` + memory index; record vefur learnings in vefur's memory. 7 of 8 RUN-6 fixes are vefur-side — vefur phases want a vefur session.

## 2. Phase structure (dependency + risk gradient)

- **Phase 0 — Biology-blockers + legal.** Everything that makes biology *wrong* or the site *legally misleading* the moment biology ships. Gates biology onboarding AND the next content sync. Kept whole (not split 0a/0b) — it is "the biology-onboarding gate."
- **Phase 1 — Before-next-sync functional seams.** Reader-visible dead-ends that are not onboarding-gating.
- **Phase 2 — Workstream refactors (generalized) + latent.** The structural changes that stop the *next* book re-triggering all of this.

Each phase → one writing-plans implementation plan, internally split **efni section** + **vefur section**. Phase 0 is authored/executed first.

## 3. Finding inventory (all findings → phase / repo / workstream)

| ID | Finding | Repo | Phase | Workstream | Re-render? |
|----|---------|------|-------|-----------|-----------|
| R6-1 | Homepage footer blanket "CC BY 4.0" over 2 CC-BY-NC-SA books (legal) | vefur | 0 | WS1 (grep/test gate) | no |
| R6-2 | Biology MT pages credit named human translator (`status:'in-progress'`) | vefur | 0 | WS2 (derive credit) | no |
| R6-5 | `.note.visual-connection` dotted CSS vs emitted `note-visual-connection` → ~214 grey biology boxes | vefur CSS | 0 | — | no |
| R5-1 | `renderList` drops `number-style` → 932 biology MC lists mis-numbered vs letter answer keys | efni + vefur CSS | 0 | WS2 (number-style→render) | yes (biology) |
| R5-2 | `generate-index.js:140` hardcodes chemistry data → dead biology index (class: `openstax-fetch.cjs:70`, `docx-import.js:205`) | efni | 0 | WS2 (slug→data-file resolver) + WS1 | no (gen tool) |
| R5-3 | Unmapped biology note types (`everyday`/`scientific`/…) → English headers | efni + book-config | 0 | WS2 (biology config) + WS1 | yes (biology) |
| R4-B/R4-6 | `window="new"`/class-first link leak **+ fidelity gate has identical blind spot** | efni | 0 | WS1 (gate regex) | yes (liffraedi ch03) |
| R4-A/R4-1 | Reading-order scramble (`render.js:886`, `indexOf(-1)`→pos 0) — live on 7.3 | efni | 0 | — | yes |
| R4-A/R4-2 | Table numbering counts `unnumbered` tables → wrong numbers 19/21 chapters | efni | 0 | — | yes |
| R4-A/R4-3 | `Tafla appendices.N` literal token (thread `appendixModuleLetters`) | efni | 0 | WS2 | yes |
| R4-A/R4-4 | Emphasis mispair + effect-less leak (`cnxml-elements.js:718`) | efni | 0 | — | yes |
| R4-A/R4-5 | Figure rendered twice on compiled-exercises page (`render.js:836`) | efni | 0 | — | yes |
| R4-8 | Intro render crash → whole-chapter rollback on missing IS title (`render.js:563`) — biology-fresh-chapter trigger | efni | 0 | WS1-adjacent | no |
| R6-3 | Answer-key back-links 404 on split-exercise books (live on physics) | both | 1 | — | no |
| R6-4 | Atriðisorðaskrá sidebar hard-errors on all 4 non-chem books | both | 1 | WS1 (gate link) + WS2 (per-book index) | no |
| R6-6 | Orðasafn + tooltips dead where no `glossary.json` despite `features.glossary=true` | both | 1 | WS1 | no |
| R5-4 | Duplicate `id="exercises-<moduleId>"` on multi-type biology modules | efni | 1 | — | yes (biology) |
| R5-5 | Chapter-assignment endpoints cap chapter at 30 → biology ch31–47 unassignable | efni (server) | 1 | WS2 (derive from catalogue) | no |
| R4-C/R4-7 | Inline-table extraction requires id-first (`extract.js:237`) | efni | 1 | — | no |
| R4-C/R4-10 | Inject completeness blind spot (`inject.js:2687`) → EN ships `complete=true` | efni | 1 | WS1 | no |
| R4-C/R4-11 | `$1`/`$&` splice in multi-para cell replace (`inject.js:2194`) | efni | 1 | — | no |
| R4-12 | `buildAppendixIdMap` bare catch swallows corrupt-structure errors (`render.js:294`) — protects #255 | efni | 1 | WS1 | no |
| WS1 | **Fail-loud pass** — general render-time unmapped/untranslated/dropped-attr warning surface | efni | 2 | WS1 | — |
| WS2 | **Finish config-as-data** — shared slug→data-file resolver; appendix-letter cap (R6-7); chapter limits from catalogue | efni | 2 | WS2 | — |
| WS3 | **Kill book-scoped module globals (FULL refactor)** — per-call book context threaded through render; fixes R5-6 + RUN2-FR2 preview-as-chemistry | efni | 2 | WS3 | — |
| R5-6 | Server preview never threads `titleTranslations` (`render.js:439`) → EN structural titles in preview | efni | 2 | WS3 | no |
| R6-7 | Appendix-letter cap 13/M (vefur TOC) vs efni A–Z/26 | vefur | 2 | WS2 | no |
| R6-8 | crossReferences hover-preview dead (Markdown-era class/data-attrs never emitted) | vefur | 2 | — | no |
| R4-9 | Title-only/list-item para `id` dropped (~50 ids/19 mods) | efni | 2 | — | yes |

## 4. Phase detail

### Phase 0 — biology-blockers + legal (the onboarding gate)

**vefur section** (own session; read vefur CLAUDE.md + memory first):
- **R6-1** — replace the `+page.svelte:450` footer blanket "CC BY 4.0" with per-book-accurate wording (mirror the corrected about-card at line 396, link a licence-overview). **Add a fail-loud gate** (extend `licences.test.ts` or a grep gate) failing on any literal blanket "CC BY 4.0" in aggregate views (landing/FAQ/meta/print). Sweep print/vidauki templates.
- **R6-2** — set `liffraedi-2e` `status:'preview'` (or drop `translators`) so `compactCreditPair` emits the machine credit; durable fix = derive the credit from the same `reviewed`/track signal the MT banner uses so credit and banner can never disagree.
- **R6-5** — fix the `content.css` selector typo: `.note.visual-connection`/`.evolution`/`.career` → `.note-visual-connection` etc. (match the working `note-interactive` rule). ~214 biology feature boxes.
- **R5-1 (vefur side)** — add `content.css` `list-style-type` rules for `lower-alpha`/`upper-alpha` (coordinate with the efni emit side below).

**efni section:**
- **R5-1 (efni side)** — `renderList` (`render.js:1679`) read `number-style` (captured at `extract.js:1598`, preserved at `inject.js:3416`) and emit `list-style-type`/`type` for enumerated lists. Render test on a real biology lower-alpha list.
- **R5-2** — `generate-index.js:140` resolve the data file by scanning `server/data/*.json` for `.slug===book`, **fail loud** if none. Apply the same shared resolver to `openstax-fetch.cjs:70` + `docx-import.js:205` (WS2 seed).
- **R5-3** — add `everyday`/`scientific`/`scientific method` to `liffraedi-2e` book-config `noteTypeLabels`; make `generateFallbackLabel` (`book-rendering-config.js:147`) **log/gate** on fallback (WS1 seed).
- **R4-batch B (R4-6)** — make link matching attribute-order-independent in the renderer arms (`cnxml-elements.js:736/771/814`, revive dead `renderLink()`) AND the gate regex (`cnxml-render-fidelity-check.js:59`, e.g. `/<link\b[^>]*\s(?:document|target-id|url)=/`). **Prove the gate goes RED** on the committed leaking liffraedi ch03 page, then flag ch03 re-render. Both sides in one change.
- **R4-batch A (R4-1..5)** — scramble (`render.js:886` indexOf fallback + order-aware assertion), table numbering skip `unnumbered` (`:3310`, mirror the eq-pass skip at `:3335`), appendix per-letter labels (thread `appendixModuleLetters`), emphasis innermost-first + default-italics (`elements.js:718`), figure-in-para dedup in `renderExercise` (mirror `renderExample` paraHandler `:1357-1364`). **All healed by one combined re-render** (lead gate).
- **R4-8** — reorder the outline filter (`render.js:563`) to `!key.startsWith('_') && info.section!=='0'` so a missing IS chapter title no longer rolls back the whole chapter (biology-fresh-chapter state).

**Phase 0 re-render/sync checklist (lead gate):** combined chemistry re-render (batch A) + liffraedi ch03 re-render (batch B) + biology render once R5-1/R5-3 land; prove fidelity gate RED→GREEN on the R4-6 page; then sync.

### Phase 1 — before-next-sync functional seams

**cross-repo (both):**
- **R6-3** — split-exercise answer-key back-links: emit a combined `{chapter}-exercises` alias/redirect (efni `render.js:3839-3858`) **or** make vefur (`svarlykill/[chapter]/+page.svelte:52`, `answerLinks.ts:302`) resolve per-type slugs. Decide emit-side vs consume-side fix in the Phase-1 plan (prefer emit-side alias — one place, fixes both consumers).
- **R6-4** — gate the Atriðisorðaskrá sidebar link on index availability (vefur) **and** generate a per-book `index.json` (efni, via the WS2 resolver). Fail-loud instead of an error page.
- **R6-6** — produce `glossary.json` for `orverufraedi`/`lifraen-efnafraedi` (efni) or gate the Orðasafn link + tooltips on its presence (vefur). Prefer producing it.

**efni:**
- **R5-4** — suffix compiled-exercise wrapper id with type (`render.js:2938`): `exercises-<moduleId>-<type>`; duplicate-id assertion on a biology chapter.
- **R5-5** — derive the assignment chapter max from `chapterCount` / route through `validateBookChapter` (`admin.js:1058/1098`, `admin.html:746`).
- **R4-C (R4-7/10/11)** — inline-table id-anywhere regex (`extract.js:237`); record inject structure-orphan misses so `complete` fails (`inject.js:2687`, WS1 seed); callback-form cell replace (`inject.js:2194`).
- **R4-12** — `buildAppendixIdMap` catch only `ENOENT`, rethrow the rest (`render.js:294`); test a corrupt structure file fails loud.

### Phase 2 — workstream refactors (generalized) + latent

- **WS1 — fail-loud pass.** A general render-time "unmapped/untranslated/dropped-attr" warning surface: unmapped note type, missing book data, dropped attribute, unrecognized `<link>`. Consolidates the R5-3/R6-4/R6-6/R4-10 fail-loud seeds into one guard that de-risks every future book. (Split refactor from enforcement: land warn-only first, flip to gate once residuals clear.)
- **WS2 — finish config-as-data.** Promote the Phase-0 `generate-index` resolver into a **shared slug→data-file resolver** used by `generate-index` + `openstax-fetch.cjs` + `docx-import.js` (fail loud). Fold in appendix-letter cap (**R6-7**, vefur TOC A–Z) and chapter limits derived from `openstaxCatalogue`.
- **WS3 — kill book-scoped module globals (FULL refactor).** Thread an explicit per-call book context (or a per-book renderer instance) through `cnxml-render.js` so CLI and server (`renderService.js` dynamic-import, no `main()`) render **any** book identically. Removes `BOOK_SLUG`/`TITLE_TRANSLATIONS`/`BOOK_CONFIG`/`NOTE_TYPE_LABELS`/`BOOKS_DIR` module globals. Fixes **R5-6** and RUN2-FR2 (preview-as-chemistry). Regression test: render a non-chem book in-process **without** `main()`/`_loadBookConfigForTest()`. *The one real structural refactor — do it properly, not the minimal global-set patch.*
- **Latent:** R4-9 (emit dropped block ids + a source-block-id fidelity check), R6-8 (drop or re-key the dead crossReferences enhancement to the CNXML pipeline's actual output).

## 5. Sequencing & dependencies

1. **Phase 0 → biology onboarding.** Biology translate+inject+render should not start until R5-1/R5-2/R5-3 + R4-6 land (else biology ships mis-numbered lists, a dead index, English headers, and leaked links under a lying gate).
2. **R5-1 is cross-repo atomic** — the efni emit and vefur CSS must ship together (a half-fix renders alpha lists as raw `<ol>` styled decimal, still wrong).
3. **R4-6 renderer + gate ship together** — fixing one side alone leaves the gate lying or turns pages red with no cure.
4. **WS1/WS2 consolidate Phase-0/1 seeds** — do Phase 0/1 first so the refactors generalize proven code.
5. **WS3 is independent** of the point-fixes and can proceed in parallel with Phase 1 if a second session is available, but lands in Phase 2 to avoid destabilizing the urgent fixes.
6. **Legal items (R6-1, R6-2)** have no code dependency and can land immediately — they gate the *next sync*, not biology.

## 6. Decomposition into implementation plans

- `docs/plans/2026-07-…-remediation-phase-0-plan.md` — Phase 0 (efni + vefur sections). **Author/execute first.**
- Phase 1 plan and Phase 2 plan authored after Phase 0 lands (brainstorm not required again; this spec is the shared design).
- Cross-repo findings (R5-1, R6-3/4/6) carry an explicit "coordinate both sides" note and land as paired PRs.

## 7. Out of scope

- Actual re-render / sync / deploy execution (lead gate).
- Biology onboarding translate/inject work itself (separate feature thread; this remediation is its prerequisite).
- New hardening beyond the audited findings; Pass-2 buildout; dashboard rewrites.
- Per-FORMAT strategy/adapter (organic vs newer OpenStax) — deferred; not needed for biology (same older format as chemistry).

## 8. Risks & open questions

- **WS3 blast radius:** the full module-globals refactor touches the hottest file (`cnxml-render.js`, ~4k lines). Mitigate: land behind the existing golden-file/fidelity tests; prove byte-identical output for chemistry before/after; do it as its own PR isolated from point-fixes.
- **R6-3 fix-side choice** (emit alias vs consume-side resolution) — resolve in the Phase-1 plan; recommend emit-side alias.
- **Re-render cost:** batch A needs a full chemistry re-render; coordinate timing with the lead's pending combined re-render so it's one pass, not many.
- **Other in-repo session** was holding fixes pending the Fable campaign (now complete) — coordinate/worktree-isolate before starting.
