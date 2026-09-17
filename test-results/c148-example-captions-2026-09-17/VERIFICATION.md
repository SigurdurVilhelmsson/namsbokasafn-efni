# §C148 — example/exercise figure captions: verification (frozen 2026-09-17)

> **Evidence, not status.** Open work and its state live in the campaign register
> (`docs/plans/2026-07-21-post-item17-followup-campaign.md`, §C148). If this file disagrees with the register, the
> register wins. Nothing here was synced; the sync stays [USER]'s. **Cost: 0 ISK** (no MT).

**Branch** `fix/c148-example-figure-captions`, forked from `ba03baaf9` (the held docs branch
`docs/c140-c35-deployed-next`, which rides along).

| commit      | what                                                                                                              |
| ----------- | ----------------------------------------------------------------------------------------------------------------- |
| `47bda0f6a` | the fix (`applyFigureCaptionDom` in `tools/cnxml-inject.js`) + `tools/__tests__/caption-writeback-corpus.test.js` |
| `672b115ce` | pre-delivery evidence: corpus old-vs-new measurements, `PREDICTIONS.md`                                           |
| `5addad3d7` | delivery: 4 module injects (mt-preview) + mt-preview renders of ch03 and ch04                                     |
| `0e17f9f12` | test hardening from the review (exact, figure-id-keyed checks) + two comment corrections                          |

---

## 1. Premise, checked in code before writing any

- `ctx.figureCaptions` was read only by `buildNote` / `buildNoteDom`. `buildExampleDom` and `buildExerciseDom` keep their
  figures, write each one's alt (§C89) and mark it handled, so `buildFigure` returns `null` for it — and neither ever
  touched `<caption>`. The §C89 comment in both said alt was keyed on figure id "exactly as captions already are",
  which was true only in the note builder.
- `collectFigureCaptions` walks `.content` only, but every figure is hoisted in the extracted structure (m68764's
  exercise figure sits under its `section`), so all 5 delivery targets and m68764 were already in the map. The gap was
  entirely on the consuming side.
- The translated **image** is not affected: chemistry `media/image-mapping.json` has 691 entries, **0** on the legacy
  figure-id route (the only route `buildFigure` alone applies); all 691 use the basename route, which is a post-pass
  over the whole module.
- `processFigure` reads the first `<caption>` in document order; the helper writes `getElementsByTagName('caption')[0]`,
  the same element. 0 `<subfigure>` in chemistry or organic source.

## 2. The sentinel (`tools/__tests__/caption-writeback-corpus.test.js`)

Every caption segment's text is replaced with a unique token, which is then **located**: it must be the whole text of
the `<caption>` of every `<figure>` with that id in the injected CNXML, and of the `<figcaption>` (label removed) of every
rendered `<figure id>` block — exact and id-keyed since `0e17f9f12` (§6). Context is read from the
figure's position in `01-source`. emitted / injected / rendered:

| book      | context               | before §C148    | after §C148     |
| --------- | --------------------- | --------------- | --------------- |
| chemistry | top (control)         | 510 / 510 / 510 | 510 / 510 / 510 |
| chemistry | note/direct (control) | 83 / 83 / 83    | 83 / 83 / 83    |
| chemistry | example/direct        | 31 / 0 / 0      | 31 / 31 / 31    |
| chemistry | exercise/para         | 1 / 0 / 0       | 1 / 1 / 0       |
| organic   | top (control)         | 457 / 457 / 457 | 457 / 457 / 457 |
| organic   | note/direct (control) | 1 / 1 / 1       | 1 / 1 / 1       |
| organic   | example/direct        | 3 / 0 / 0       | 3 / 3 / 3       |

- Drop list before the fix, by name: `reports/sentinel-before-fix.txt`. Organic's 3 (m00136, m00137, m00142) are
  **latent** — the committed-output census read organic as clean because only ch03 is injected there.
- The pinned form of the test was run against the pre-fix `tools/cnxml-inject.js` (restored from a golden copy, `cmp`
  identical afterwards): red on all three moving contexts (31→0, 1→0, 3→0).
- **m68764's `rendered 0` is not this fix's leg.** Its figure is inside an end-of-chapter exercise, which is not on the
  module page; it renders in the chapter rollup `10-exercises.html`, where `renderPara` emits the para-nested figure
  inline with the CNXML `<caption>` passed through raw, and the caption prose has also leaked into the paragraph text
  (register "C13 follow-up 2"). Logged as **§C149**.

## 3. Real inject CLI over both books, old vs new code (`instruments/corpus-inject-old-vs-new.sh`)

Same inputs (read-only symlinks into a scratch tree), the CLI's own `main()`, every chapter of both books:

- **Per-module verdicts identical** (`reports/inject-verdicts-{old,new}.txt`): written 69 · skipped 97 · failed 320
  (the failures are organic modules with no MT file). Routing these captions through `getSeg` refused nothing new.
- **6 CNXML differ, by 7 lines, every one a `<caption>`** (`reports/corpus-cnxml-diff-old-vs-new.txt`): m68700, m68702
  (×2), m68703, m68713, m68726, m68816. The two residue reports and `translation-errors.json` differ only in timestamps.
- **Drift:** old-code output is byte-identical to the committed file for m68702, m68703, m68713, m68816, and for m68700
  under `--no-annotate-en` (⑰). m68726 (ch05) already differs from its committed file — pre-existing drift, not
  delivered here.

## 4. Predictions (`PREDICTIONS.md`) vs measurement

| #   | measured                                                                                                                                                                                                                                                 |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Q1  | **Met.** 5 changed lines in `03-translated/mt-preview`, all `<caption>`; 0 others. All 4 injects `[COMPLETE] [PERFECT fidelity]`, exit 0 (`logs/inject.log`).                                                                                            |
| Q2  | **Met.** m68700: opener-only `[[` 0 · `<term>` 8 · `<emphasis>` 8 · `(e. ` 0. Control: the same pattern reads 1 on `66612e43d`'s corrupt copy.                                                                                                           |
| Q3  | **Met.** `translation-errors.json` and `residue-report.mt-preview.json`: timestamp lines only.                                                                                                                                                           |
| Q4  | **Met.** Exactly the 4 predicted pages; 5 `<figcaption>` lines changed (1 · 2 · 1 · 1, i.e. 5 removed + 5 added — the content commit's "10 changed lines" counts both sides of the diff), nothing else; each English caption 1 → 0, its Icelandic 0 → 1. |
| Q5  | **Met.** Slug map unchanged; 0 non-HTML changes under `05-publication/` (41 + 30 images re-copied, byte-identical).                                                                                                                                      |
| Q6  | **Met.** `generate-index --track mt-preview`: only `generated` moved.                                                                                                                                                                                    |
| Q7  | **Met.** `faithful/` untouched; faithful 3-1 still carries the English copper caption ×1.                                                                                                                                                                |
| Q8  | **Met.** `caption_census.cjs efnafraedi-2e`: `example/direct` ENGLISH 31 → 26, translated 0 → 5; ch03 and ch04 no longer listed.                                                                                                                         |
| Q9  | **Met.** Opener-only `[[` in mt-preview ch03 + ch04 HTML: 0 (control: 723 in `02-mt-output/ch03`).                                                                                                                                                       |

**Not committed:** `index.json`, `residue-report.mt-preview.json`, `translation-errors.json` — each changed only its
timestamp, so the committed content already describes the new tree.

## 5. Reach

- **3-2 (hematite, BrewTank), 3-3 (vinegar), 4-3 (iodine):** mt-preview pages; a chemistry sync ships them Icelandic.
- **3-1 (copper):** readers get the **faithful** copy of 3-1 through vefur's overlay, and that page is untouched. Its
  segments were moved aside on purpose — runbook Phase 0.4, §C112, preserved on prod at
  `~/namsbokasafn-faithful-aside-2026-08-23/`, deletion committed by prod's backup `c5f4880e` — and the faithful track
  is regenerated by hand ([LEAD] 2026-08-22). No re-inject can fix that caption; it stays English until the
  regeneration.

## 6. Adversarial review (`reports/verify-lenses.json`, workflow `wf_c998a285-2e2`)

Four independent lenses (code · test honesty, in its own worktree · content diff · scope critic), then 2 refuters per
actionable finding. 18 agents, 0 errors. **Every actionable finding was confirmed 2/2; the code lens had none.**

- **Code (7 info, 0 actionable).** The `buildNoteDom` refactor is behaviour-identical; the caption loop sits after figure
  removal and before handled-marking/serialization in both builders. Over 196 modules with committed MT in 5 books,
  verdicts, missing lists, residues and warnings are identical old vs new, with controls (deleting or English-ing only
  the container captions) flipping exactly the 6 expected chemistry modules. DOM path = regex path on all 785 real
  captions. A caption can be requested twice only for an `<example>` nested in a `<note>`; 0 such nestings exist.
- **TH-1 / TH-2 (needs-attention) → fixed in `0e17f9f12`.** The injected check used `includes`, so an append-instead-of-
  replace mutant passed; the rendered check searched any `<figcaption>` on the page. Both are now exact and keyed on the
  figure id. Re-verified here: same pinned counts on the fixed code; red on both books for the pre-fix inject, the append
  mutant, and a render mutant that suffixes every `<figcaption>`; files restored from golden copies, `cmp`-identical.
- **TH-3 / SC-1 (needs-attention).** The test cited §C149 before any register entry existed → the entry is written in
  the register commit that follows this one. The test's "C13 residual #2a" label did not exist → now "C13 follow-up 2".
- **content-1 (needs-attention).** The register did not yet record the fix or the copper-caption caveat → register commit.
- **SC-2 (confirmed; 1 refuter rated info).** Chemistry m68818's `<table>` caption is extracted nowhere and rendered
  nowhere; re-measured here: chemistry has 1 non-figure `<caption>`, its text appears 0 times in `02-for-mt/ch16` and in
  published ch16. Organic's 2 duplicate their table title. → §C150.
- **SC-3 (needs-attention).** The §C148 entry's per-chapter list gave ch10 as 2 (it double-counted m68764) → corrected.
- **Info worth keeping:** organic's `note/direct` control never reaches `buildNoteDom` (m00001's note has `class` before
  `id`, so the id-first regex misses and `buildGenericElement` moves the figure after `</note>`) → §C151; the 5 new
  captions equal their `02-mt-output` segments exactly; the fix also reaches the withheld books (re-measured here over
  modules whose in-memory chain completes: physics `example/direct` 49/49, `exercise/direct` 95/95 injected;
  microbiology `exercise/direct` 13/13; physics has 66 and biology 37 modules that throw in that chain, identically
  before the fix per the review).

## 7. Test suite — by name against `main`'s local floor

Full root `npx vitest run --reporter=json` at `5addad3d7` (the test hardening landed after; its own file was re-run
green and against three mutants, §6). Compared with `experiments/figure-text-translation/evidence/2026-09-17-c35-rerender/instruments/npm_compare.cjs`
against the ㊱ after-list (36 names, `main`'s code): **now 36 · before 36 · only-now `[]` · only-before `[]` · files that
died without a failing test `[]`**; control: a planted name shows as only-now. 6,547 tests (㉟'s 6,545 + this branch's
2), 6,510 passed. `reports/npm-compare.txt`. Not run locally: Playwright E2E (CI's separate job); this branch touches no
server code.

## 8. What is still English, and why

The committed chemistry tree still carries **27** English container captions (26 `example/direct` + m68764), all with
their MT already in `02-mt-output`, across 19 modules:

- **25** sit in 17 modules the injector refuses today (`reports/inject-verdicts-new.txt`, identical before the fix, so
  the captions are not the blocker) — they arrive with each chapter's re-MT.
- **2** are injectable now: m68726 (ch05 — its committed CNXML already differs from a fresh inject, so a re-inject there
  is not captions-only) and m68816 (ch16 — drift-free). Not delivered here: neither chapter is prepared by the loop.
